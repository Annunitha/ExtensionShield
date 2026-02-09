"""
Scoring Engine Module

THE SINGLE SOURCE OF TRUTH for extension risk scoring.

This module provides the main ScoringEngine class that orchestrates:
1. Signal normalization to severity [0,1] + confidence [0,1]
2. Layer score calculation (Security, Privacy, Governance)
3. Hard gate evaluation (can override scores)
4. Complete result generation with explanations

Mathematical Foundation:
    Layer Risk: R = Σ(w_i × c_i × s_i) / Σ(w_i × c_i)
    Layer Score: score = round(100 × (1 - R))
    Overall Score: weighted average of layer scores

Where:
    w_i = weight of factor i
    c_i = confidence in factor i [0,1]
    s_i = severity of factor i [0,1]
"""

import logging
from datetime import datetime
from typing import Any, Dict, List, Optional, Tuple

from extension_shield.governance.signal_pack import SignalPack
from extension_shield.scoring.gates import (
    GateResult,
    HardGates,
    GateConfig,
    get_hard_gate_summary,
)
from extension_shield.scoring.models import (
    Decision,
    FactorScore,
    LayerScore,
    RiskLevel,
    ScoringResult,
)
from extension_shield.scoring.normalizers import (
    normalize_security_factors,
    normalize_privacy_factors,
)
from extension_shield.scoring.weights import (
    WeightPreset,
    get_weight_preset,
    GovernanceFactors,
    GOVERNANCE_WEIGHTS_V1,
)
from extension_shield.scoring.explain import (
    ExplanationPayload,
    ExplanationBuilder,
    FactorExplanation,
    LayerExplanation,
)


logger = logging.getLogger(__name__)


# =============================================================================
# SCORING ENGINE
# =============================================================================

class ScoringEngine:
    """
    Unified scoring engine - THE SINGLE SOURCE OF TRUTH.
    
    Architecture:
    1. Normalize signals to severity [0,1] + confidence [0,1]
    2. Apply weights within each layer
    3. Combine via: R = Σ(w_i × c_i × s_i) / Σ(w_i × c_i)
    4. Score = round(100 × (1 - R))
    5. Evaluate hard gates (can override score)
    6. Return complete result with explanation
    
    Usage:
        engine = ScoringEngine()
        result = engine.calculate_scores(signal_pack, manifest)
        
        # Access scores
        print(result.overall_score)
        print(result.decision)
        
        # Get explanation
        explanation = engine.get_explanation()
    """
    
    VERSION = "2.0.0"
    
    def __init__(
        self,
        weights_version: str = "v1",
        gate_config: Optional[GateConfig] = None,
    ):
        """
        Initialize ScoringEngine with weight preset and gate configuration.
        
        Args:
            weights_version: Version of weight preset to use (e.g., "v1")
            gate_config: Optional custom gate configuration
        """
        self.weights = get_weight_preset(weights_version)
        self.weights_version = weights_version
        self.gates = HardGates(gate_config)
        
        # Cache for last computation (for explanation generation)
        self._last_result: Optional[ScoringResult] = None
        self._last_explanation: Optional[ExplanationPayload] = None
        self._last_gate_results: Optional[List[GateResult]] = None
        
        logger.debug(
            "ScoringEngine initialized: version=%s, weights=%s",
            self.VERSION,
            weights_version,
        )
    
    def calculate_scores(
        self,
        signal_pack: SignalPack,
        manifest: Optional[Dict[str, Any]] = None,
        user_count: Optional[int] = None,
        permissions_analysis: Optional[Dict[str, Any]] = None,
    ) -> ScoringResult:
        """
        Main entry point - calculates all scores.
        
        This is THE SINGLE SOURCE OF TRUTH for extension scoring.
        All consumers (API, CLI, MCP, governance) should use this method.
        
        Args:
            signal_pack: Layer 0 SignalPack with normalized signals
            manifest: Optional manifest data for context
            user_count: Optional user count for popularity-based confidence adjustment
            permissions_analysis: Optional raw permissions analysis data
            
        Returns:
            ScoringResult with:
            - security_score: 0-100
            - privacy_score: 0-100
            - governance_score: 0-100
            - overall_score: weighted average
            - decision: ALLOW/NEEDS_REVIEW/BLOCK
            - reasons: list of decision reasons
            - explanation: full breakdown
        """
        manifest = manifest or {}
        scan_id = signal_pack.scan_id
        extension_id = signal_pack.extension_id or "unknown"
        
        logger.info(
            "Calculating scores: scan_id=%s, extension_id=%s",
            scan_id,
            extension_id,
        )
        
        # =====================================================================
        # STEP 1: Normalize all signals to factors
        # =====================================================================
        
        # Security factors
        security_factors = normalize_security_factors(
            sast=signal_pack.sast,
            vt=signal_pack.virustotal,
            entropy=signal_pack.entropy,
            manifest=manifest,
            perms=signal_pack.permissions,
            chromestats=signal_pack.chromestats,
            webstore_stats=signal_pack.webstore_stats,
            user_count=user_count,
        )
        # Coverage sanity: track whether SAST coverage is missing.
        # If no files were scanned and no findings exist, we treat coverage as limited
        # and will apply a deterministic cap + review decision later.
        sast_missing_coverage = (
            signal_pack.sast.files_scanned == 0
            and not signal_pack.sast.deduped_findings
        )
        
        # Privacy factors (use network signal pack for exfiltration analysis)
        privacy_factors = normalize_privacy_factors(
            perms=signal_pack.permissions,
            network=signal_pack.network,
            manifest=manifest,
            permissions_analysis=permissions_analysis,
        )
        
        # Governance factors (simpler - based on policy compliance)
        governance_factors = self._compute_governance_factors(
            signal_pack=signal_pack,
            manifest=manifest,
            security_factors=security_factors,
            privacy_factors=privacy_factors,
        )
        
        # =====================================================================
        # STEP 2: Calculate layer scores using confidence-weighted formula
        # =====================================================================
        
        security_score, security_risk = self._calculate_layer_score(
            security_factors,
            self.weights.security_weights,
        )
        
        privacy_score, privacy_risk = self._calculate_layer_score(
            privacy_factors,
            self.weights.privacy_weights,
        )
        
        governance_score, governance_risk = self._calculate_layer_score(
            governance_factors,
            self.weights.governance_weights,
        )
        
        # Build LayerScore objects
        security_layer = LayerScore(
            layer_name="security",
            score=security_score,
            risk=round(security_risk, 4),
            factors=security_factors,
        )
        
        privacy_layer = LayerScore(
            layer_name="privacy",
            score=privacy_score,
            risk=round(privacy_risk, 4),
            factors=privacy_factors,
        )
        
        governance_layer = LayerScore(
            layer_name="governance",
            score=governance_score,
            risk=round(governance_risk, 4),
            factors=governance_factors,
        )
        
        # =====================================================================
        # STEP 3: Calculate overall score (weighted average of layers)
        # =====================================================================
        
        layer_weights = self.weights.layer_weights
        overall_score = int(
            security_score * layer_weights.get("security", 0.5) +
            privacy_score * layer_weights.get("privacy", 0.3) +
            governance_score * layer_weights.get("governance", 0.2)
        )
        
        # Coverage sanity: cap overall_score when critical analyzers are missing.
        # Missing SAST coverage must not look like a perfectly safe 100/100.
        coverage_reasons: List[str] = []
        if sast_missing_coverage and overall_score > 80:
            overall_score = 80
            coverage_reasons.append(
                "Limited analysis coverage (SAST missing) — review recommended"
            )
        
        logger.debug(
            "Layer scores: security=%d, privacy=%d, governance=%d, overall=%d",
            security_score,
            privacy_score,
            governance_score,
            overall_score,
        )
        
        # =====================================================================
        # STEP 4: Evaluate hard gates
        # =====================================================================
        
        gate_results = self.gates.evaluate_all(signal_pack, manifest)
        self._last_gate_results = gate_results
        
        blocking_gates = self.gates.get_blocking_gates(gate_results)
        warning_gates = self.gates.get_warning_gates(gate_results)
        
        triggered_gate_ids = [g.gate_id for g in blocking_gates + warning_gates]
        
        if blocking_gates:
            logger.info(
                "Hard gates triggered BLOCK: %s",
                [g.gate_id for g in blocking_gates],
            )
        
        # =====================================================================
        # STEP 5: Determine final decision
        # =====================================================================
        
        decision, reasons = self._determine_decision(
            overall_score=overall_score,
            security_score=security_score,
            privacy_score=privacy_score,
            governance_score=governance_score,
            blocking_gates=blocking_gates,
            warning_gates=warning_gates,
        )
        
        # Apply coverage sanity: if coverage is limited and we didn't already
        # BLOCK, ensure at least NEEDS_REVIEW and surface a clear reason.
        if coverage_reasons:
            reasons.extend(coverage_reasons)
            if decision != Decision.BLOCK:
                decision = Decision.NEEDS_REVIEW
        
        # =====================================================================
        # STEP 6: Build final result
        # =====================================================================
        
        result = ScoringResult(
            scan_id=scan_id,
            extension_id=extension_id,
            security_score=security_score,
            privacy_score=privacy_score,
            governance_score=governance_score,
            overall_score=overall_score,
            decision=decision,
            reasons=reasons,
            explanation=self._build_summary(
                decision=decision,
                overall_score=overall_score,
                security_layer=security_layer,
                privacy_layer=privacy_layer,
                governance_layer=governance_layer,
                triggered_gate_ids=triggered_gate_ids,
            ),
            security_layer=security_layer,
            privacy_layer=privacy_layer,
            governance_layer=governance_layer,
            hard_gates_triggered=triggered_gate_ids,
            scoring_version=self.VERSION,
        )
        
        # Cache for explanation generation
        self._last_result = result
        self._last_explanation = self._build_explanation(
            result=result,
            security_factors=security_factors,
            privacy_factors=privacy_factors,
            governance_factors=governance_factors,
            gate_results=gate_results,
        )
        
        logger.info(
            "Scoring complete: overall=%d, decision=%s, gates_triggered=%d",
            overall_score,
            decision.value,
            len(triggered_gate_ids),
        )
        
        return result
    
    def _calculate_layer_score(
        self,
        factors: List[FactorScore],
        weights: Dict[str, float],
    ) -> Tuple[int, float]:
        """
        Calculate layer score using confidence-weighted formula.
        
        Formula:
            R = Σ(w_i × c_i × s_i) / Σ(w_i × c_i)
            Score = round(100 × (1 - R))
        
        Where:
            w_i = weight of factor i
            c_i = confidence in factor i [0,1]
            s_i = severity of factor i [0,1]
        
        Edge case: if Σ(w_i × c_i) == 0, return score=100 (no risk)
        
        Args:
            factors: List of FactorScore objects
            weights: Weight dictionary for the layer
            
        Returns:
            Tuple of (score: int [0-100], risk: float [0-1])
        """
        if not factors:
            return 100, 0.0
        
        # Calculate weighted sums
        weighted_risk_sum = 0.0
        weighted_confidence_sum = 0.0
        
        for factor in factors:
            w = weights.get(factor.name, factor.weight)
            c = factor.confidence
            s = factor.severity
            
            weighted_risk_sum += w * c * s
            weighted_confidence_sum += w * c
        
        # Handle edge case: no confidence-weighted data
        if weighted_confidence_sum == 0:
            return 100, 0.0
        
        # Calculate risk ratio
        risk = weighted_risk_sum / weighted_confidence_sum
        
        # Clamp to [0, 1]
        risk = max(0.0, min(1.0, risk))
        
        # Convert to score (invert: low risk = high score)
        score = round(100 * (1 - risk))
        
        return score, risk
    
    def _compute_governance_factors(
        self,
        signal_pack: SignalPack,
        manifest: Dict[str, Any],
        security_factors: List[FactorScore],
        privacy_factors: List[FactorScore],
    ) -> List[FactorScore]:
        """
        Compute governance layer factors.
        
        Governance factors assess policy compliance and behavioral consistency:
        - ToS violations (based on prohibited behaviors)
        - Consistency (claimed purpose vs actual behavior)
        - Disclosure alignment (privacy policy vs data collection)
        
        Args:
            signal_pack: SignalPack with normalized signals
            manifest: Manifest data
            security_factors: Already computed security factors
            privacy_factors: Already computed privacy factors
            
        Returns:
            List of governance FactorScore objects
        """
        factors: List[FactorScore] = []
        
        # Factor 1: ToS Violations
        # Check for explicit policy violations
        tos_severity = 0.0
        tos_flags: List[str] = []
        
        # Check for prohibited permissions (from gate logic)
        prohibited = {"debugger", "proxy", "nativeMessaging"}
        found_prohibited = prohibited.intersection(set(signal_pack.permissions.api_permissions))
        if found_prohibited:
            tos_severity += 0.5 * len(found_prohibited)
            tos_flags.extend([f"prohibited_perm:{p}" for p in found_prohibited])
        
        # Check for concerning permission combinations
        if signal_pack.permissions.has_broad_host_access:
            if signal_pack.virustotal.malicious_count > 0:
                tos_severity += 0.4
                tos_flags.append("broad_access_with_vt_detection")
        
        tos_severity = min(1.0, tos_severity)
        
        factors.append(FactorScore(
            name=GovernanceFactors.TOS_VIOLATIONS,
            severity=round(tos_severity, 4),
            confidence=0.9,
            weight=GOVERNANCE_WEIGHTS_V1[GovernanceFactors.TOS_VIOLATIONS],
            evidence_ids=[f"tos:{f}" for f in tos_flags[:3]],
            details={"violations": tos_flags},
            flags=tos_flags,
        ))
        
        # Factor 2: Consistency
        # Check if claimed purpose matches actual behavior
        consistency_severity = 0.0
        consistency_flags: List[str] = []
        
        name = manifest.get("name", "").lower()
        desc = manifest.get("description", "").lower()
        
        # Benign claims that shouldn't have risky behavior
        benign_claims = ["theme", "color", "font", "wallpaper", "new tab"]
        is_benign_claimed = any(claim in name or claim in desc for claim in benign_claims)
        
        # Check for inconsistency
        has_high_security_risk = any(f.severity > 0.5 for f in security_factors)
        has_high_privacy_risk = any(f.severity > 0.5 for f in privacy_factors)
        
        if is_benign_claimed and (has_high_security_risk or has_high_privacy_risk):
            consistency_severity = 0.6
            consistency_flags.append("benign_claim_risky_behavior")
        
        # Check for network access on offline-claimed extensions
        if "offline" in desc and signal_pack.permissions.has_broad_host_access:
            consistency_severity = max(consistency_severity, 0.4)
            consistency_flags.append("offline_claim_network_access")
        
        factors.append(FactorScore(
            name=GovernanceFactors.CONSISTENCY,
            severity=round(consistency_severity, 4),
            confidence=0.8,
            weight=GOVERNANCE_WEIGHTS_V1[GovernanceFactors.CONSISTENCY],
            evidence_ids=[f"consistency:{f}" for f in consistency_flags[:3]],
            details={
                "is_benign_claimed": is_benign_claimed,
                "has_high_security_risk": has_high_security_risk,
                "has_high_privacy_risk": has_high_privacy_risk,
            },
            flags=consistency_flags,
        ))
        
        # Factor 3: Disclosure Alignment
        # Check if privacy practices are disclosed
        disclosure_severity = 0.0
        disclosure_flags: List[str] = []
        
        has_privacy_policy = signal_pack.webstore_stats.has_privacy_policy
        has_data_collection = len(signal_pack.permissions.high_risk_permissions) > 0
        has_network = signal_pack.permissions.has_broad_host_access
        
        # Missing privacy policy with data collection = disclosure issue
        if not has_privacy_policy:
            if has_data_collection:
                disclosure_severity = 0.5
                disclosure_flags.append("no_privacy_policy_with_data_collection")
            elif has_network:
                disclosure_severity = 0.3
                disclosure_flags.append("no_privacy_policy_with_network")
        
        factors.append(FactorScore(
            name=GovernanceFactors.DISCLOSURE_ALIGNMENT,
            severity=round(disclosure_severity, 4),
            confidence=0.85,
            weight=GOVERNANCE_WEIGHTS_V1[GovernanceFactors.DISCLOSURE_ALIGNMENT],
            evidence_ids=[f"disclosure:{f}" for f in disclosure_flags[:3]],
            details={
                "has_privacy_policy": has_privacy_policy,
                "has_data_collection": has_data_collection,
                "has_network": has_network,
            },
            flags=disclosure_flags,
        ))
        
        return factors
    
    def _determine_decision(
        self,
        overall_score: int,
        security_score: int,
        privacy_score: int,
        governance_score: int,
        blocking_gates: List[GateResult],
        warning_gates: List[GateResult],
    ) -> Tuple[Decision, List[str]]:
        """
        Determine final governance decision.
        
        Decision priority:
        1. Any blocking gate → BLOCK
        2. Security score < 30 → BLOCK
        3. Overall score < 30 → BLOCK
        4. Any warning gate → NEEDS_REVIEW
        5. Security score < 60 → NEEDS_REVIEW
        6. Overall score < 60 → NEEDS_REVIEW
        7. All pass → ALLOW
        
        Args:
            overall_score: Weighted overall score
            security_score: Security layer score
            privacy_score: Privacy layer score
            governance_score: Governance layer score
            blocking_gates: Gates that triggered BLOCK
            warning_gates: Gates that triggered WARN
            
        Returns:
            Tuple of (Decision, list of reasons)
        """
        reasons: List[str] = []
        
        # Priority 1: Blocking gates
        if blocking_gates:
            for gate in blocking_gates:
                reasons.extend(gate.reasons[:2])
            return Decision.BLOCK, reasons
        
        # Priority 2: Critical security score
        if security_score < 30:
            reasons.append(f"Security score {security_score}/100 critically low")
            return Decision.BLOCK, reasons
        
        # Priority 3: Critical overall score
        if overall_score < 30:
            reasons.append(f"Overall score {overall_score}/100 critically low")
            return Decision.BLOCK, reasons
        
        # Priority 4: Warning gates
        if warning_gates:
            for gate in warning_gates:
                reasons.extend(gate.reasons[:2])
            return Decision.NEEDS_REVIEW, reasons
        
        # Priority 5: Low security score
        if security_score < 60:
            reasons.append(f"Security score {security_score}/100 below threshold")
            return Decision.NEEDS_REVIEW, reasons
        
        # Priority 6: Low overall score
        if overall_score < 60:
            reasons.append(f"Overall score {overall_score}/100 below threshold")
            if privacy_score < 60:
                reasons.append(f"Privacy score {privacy_score}/100 contributing to low overall")
            if governance_score < 60:
                reasons.append(f"Governance score {governance_score}/100 contributing to low overall")
            return Decision.NEEDS_REVIEW, reasons
        
        # Priority 7: All pass
        reasons.append(f"All checks passed. Overall score: {overall_score}/100")
        return Decision.ALLOW, reasons
    
    def _build_summary(
        self,
        decision: Decision,
        overall_score: int,
        security_layer: LayerScore,
        privacy_layer: LayerScore,
        governance_layer: LayerScore,
        triggered_gate_ids: List[str],
    ) -> str:
        """Build human-readable summary string."""
        parts = [
            f"Overall: {overall_score}/100 ({decision.value})",
            f"Security: {security_layer.score}/100",
            f"Privacy: {privacy_layer.score}/100",
            f"Governance: {governance_layer.score}/100",
        ]
        
        if triggered_gate_ids:
            parts.append(f"Gates triggered: {', '.join(triggered_gate_ids)}")
        
        # Identify top risk factors
        all_factors = (
            security_layer.factors +
            privacy_layer.factors +
            governance_layer.factors
        )
        high_risk = [
            f for f in all_factors
            if f.severity >= 0.4 and f.confidence >= 0.6
        ]
        
        if high_risk:
            sorted_factors = sorted(high_risk, key=lambda f: f.contribution, reverse=True)
            top_names = [f.name for f in sorted_factors[:3]]
            parts.append(f"Key factors: {', '.join(top_names)}")
        
        return " | ".join(parts)
    
    def _build_explanation(
        self,
        result: ScoringResult,
        security_factors: List[FactorScore],
        privacy_factors: List[FactorScore],
        governance_factors: List[FactorScore],
        gate_results: List[GateResult],
    ) -> ExplanationPayload:
        """
        Build complete explanation payload using ExplanationBuilder.
        
        Delegates to the ExplanationBuilder for consistent explanation generation.
        """
        builder = ExplanationBuilder(
            scoring_version=self.VERSION,
            weights_version=self.weights_version,
        )
        return builder.build_from_result(result, gate_results)
    
    def get_last_result(self) -> Optional[ScoringResult]:
        """Get the last computed ScoringResult."""
        return self._last_result
    
    def get_explanation(self) -> Optional[ExplanationPayload]:
        """
        Get the explanation payload for the last computation.
        
        Returns:
            ExplanationPayload if calculate_scores was called, None otherwise
        """
        return self._last_explanation
    
    def get_gate_results(self) -> Optional[List[GateResult]]:
        """Get the gate results from the last computation."""
        return self._last_gate_results


# =============================================================================
# CONVENIENCE FUNCTIONS
# =============================================================================

def calculate_extension_score(
    signal_pack: SignalPack,
    manifest: Optional[Dict[str, Any]] = None,
    user_count: Optional[int] = None,
    weights_version: str = "v1",
) -> ScoringResult:
    """
    Convenience function to calculate extension score.
    
    This is the recommended entry point for most use cases.
    
    Args:
        signal_pack: Layer 0 SignalPack
        manifest: Optional manifest data
        user_count: Optional user count
        weights_version: Weight preset version
        
    Returns:
        Complete ScoringResult
    """
    engine = ScoringEngine(weights_version=weights_version)
    return engine.calculate_scores(
        signal_pack=signal_pack,
        manifest=manifest,
        user_count=user_count,
    )


def get_score_explanation(
    signal_pack: SignalPack,
    manifest: Optional[Dict[str, Any]] = None,
    user_count: Optional[int] = None,
    weights_version: str = "v1",
) -> Tuple[ScoringResult, ExplanationPayload]:
    """
    Calculate scores and return both result and explanation.
    
    Args:
        signal_pack: Layer 0 SignalPack
        manifest: Optional manifest data
        user_count: Optional user count
        weights_version: Weight preset version
        
    Returns:
        Tuple of (ScoringResult, ExplanationPayload)
    """
    engine = ScoringEngine(weights_version=weights_version)
    result = engine.calculate_scores(
        signal_pack=signal_pack,
        manifest=manifest,
        user_count=user_count,
    )
    explanation = engine.get_explanation()
    return result, explanation

