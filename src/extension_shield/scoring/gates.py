"""
Hard Gates Module

Governance hard gates that can BLOCK or WARN regardless of computed scores.
Gates are evaluated in priority order and provide early decision overrides
for high-confidence threats.

Key Design Principles:
1. Gates bypass score calculation for clear-cut cases
2. Each gate has explicit confidence thresholds
3. Gates return structured results with evidence for explainability
4. Gate results can be combined with layer scores for final decision

Gate Priority Order:
1. VT_MALWARE      - Any VirusTotal malware detection → BLOCK
2. CRITICAL_SAST   - High-confidence critical SAST findings → BLOCK
3. TOS_VIOLATION   - Explicit ToS prohibition + matching behavior → BLOCK
4. PURPOSE_MISMATCH - Claims one purpose but has credential capture patterns → WARN/BLOCK
5. SENSITIVE_EXFIL  - Sensitive permissions + network exfil + no disclosure → WARN
"""

import re
from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Dict, List, Literal, Optional, Tuple

from extension_shield.governance.signal_pack import (
    PermissionsSignalPack,
    SastFindingNormalized,
    SastSignalPack,
    SignalPack,
    VirusTotalSignalPack,
    WebstoreStatsSignalPack,
)
from extension_shield.scoring.models import Decision, LayerScore


# =============================================================================
# GATE RESULT
# =============================================================================

@dataclass
class GateResult:
    """
    Result from evaluating a single hard gate.
    
    Attributes:
        gate_id: Unique identifier for this gate
        decision: The decision this gate recommends (ALLOW, WARN, BLOCK)
        triggered: Whether this gate was triggered
        confidence: Confidence in this gate's evaluation [0,1]
        reasons: Human-readable reasons for the gate result
        evidence_ids: Evidence supporting this gate result
        details: Additional details for debugging/explainability
    """
    gate_id: str
    decision: Literal["ALLOW", "WARN", "BLOCK"]
    triggered: bool
    confidence: float
    reasons: List[str] = field(default_factory=list)
    evidence_ids: List[str] = field(default_factory=list)
    details: Dict[str, Any] = field(default_factory=dict)
    
    @property
    def is_blocking(self) -> bool:
        """Whether this gate triggered a BLOCK decision."""
        return self.triggered and self.decision == "BLOCK"
    
    @property
    def is_warning(self) -> bool:
        """Whether this gate triggered a WARN decision."""
        return self.triggered and self.decision == "WARN"


# =============================================================================
# GATE CONFIGURATION
# =============================================================================

@dataclass(frozen=True)
class GateConfig:
    """Configuration thresholds for hard gates."""
    
    # VT_MALWARE thresholds
    # Per Phase 1 fixups: >=5 BLOCK, 1-4 WARN, 0 no gate
    vt_malicious_block_threshold: int = 5      # >=5 malicious detections = BLOCK
    vt_malicious_warn_threshold: int = 1       # 1-4 malicious detections = WARN
    vt_confidence_threshold: float = 0.95      # High confidence for VT
    
    # CRITICAL_SAST thresholds
    sast_critical_block_count: int = 1         # >=1 critical finding = BLOCK
    sast_high_block_count: int = 3             # >=3 high findings = BLOCK
    sast_confidence_threshold: float = 0.7     # Minimum confidence for SAST block
    
    # TOS_VIOLATION patterns
    tos_prohibited_permissions: Tuple[str, ...] = (
        "debugger",                  # Often prohibited in enterprise
        "proxy",                     # Can intercept traffic
        "nativeMessaging",           # Can bypass browser sandbox
    )
    
    # PURPOSE_MISMATCH patterns
    credential_capture_patterns: Tuple[str, ...] = (
        r"password",
        r"credential",
        r"login",
        r"keylog",
        r"input\s*value",
        r"form\s*data",
    )
    tracking_patterns: Tuple[str, ...] = (
        r"track",
        r"analytics",
        r"beacon",
        r"pixel",
        r"fingerprint",
    )
    
    # SENSITIVE_EXFIL thresholds
    sensitive_permissions: Tuple[str, ...] = (
        "cookies",
        "webRequest",
        "webRequestBlocking",
        "history",
        "browsingData",
        "clipboardRead",
        "tabs",
    )


# Default configuration
DEFAULT_GATE_CONFIG = GateConfig()


# ============================================================================
# CRITICAL HIGH SAST PATTERNS
# ============================================================================
#
# Some HIGH/ERROR SAST findings are dangerous enough to BLOCK even if the
# total high-count is below the usual threshold. We match a small, pragmatic
# allowlist of patterns in check_id/message/category/code_snippet and, when
# seen in a HIGH/ERROR finding with sufficient confidence, we treat them as
# critical-high signals.
CRITICAL_HIGH_SAST_PATTERNS: Tuple[re.Pattern[str], ...] = tuple(
    re.compile(p, re.IGNORECASE)
    for p in (
        r"eval\(|new\s+Function",  # dynamic code execution
        r"keylog|keylogger|credential|password|login|form\s*(capture|intercept)",  # credential / keylogger
        r"cookie|token|session",  # cookie/token/session exfil
        r"remote\s*(script|code)|load\s*(remote|external)",  # remote code/script load
        r"webrequestblocking|modify\s*(headers|request|response)",  # request/response interception
        r"externally_connectable|message\s*relay|postMessage",  # broad relay / message relay
    )
)


# =============================================================================
# HARD GATES CLASS
# =============================================================================

class HardGates:
    """
    Governance hard gates that can BLOCK regardless of score.
    
    Gates are evaluated in priority order. Any triggered BLOCK gate
    short-circuits further evaluation and produces an immediate BLOCK decision.
    
    Gates:
    1. VT_MALWARE      - VirusTotal malware detection → BLOCK
    2. CRITICAL_SAST   - Critical SAST findings → BLOCK
    3. TOS_VIOLATION   - Terms of Service violations → BLOCK
    4. PURPOSE_MISMATCH - Claimed purpose vs actual behavior → WARN/BLOCK
    5. SENSITIVE_EXFIL  - Sensitive data exfiltration risk → WARN
    """
    
    # Gate IDs in priority order
    GATES = [
        "VT_MALWARE",
        "CRITICAL_SAST",
        "TOS_VIOLATION",
        "PURPOSE_MISMATCH",
        "SENSITIVE_EXFIL",
    ]
    
    def __init__(self, config: Optional[GateConfig] = None):
        """
        Initialize HardGates with optional configuration.
        
        Args:
            config: Gate configuration thresholds (uses defaults if None)
        """
        self.config = config or DEFAULT_GATE_CONFIG
        self._credential_patterns = [
            re.compile(p, re.IGNORECASE) 
            for p in self.config.credential_capture_patterns
        ]
        self._tracking_patterns = [
            re.compile(p, re.IGNORECASE)
            for p in self.config.tracking_patterns
        ]
    
    # =========================================================================
    # GATE 1: VT_MALWARE
    # =========================================================================
    
    def evaluate_vt_malware(self, vt: VirusTotalSignalPack) -> GateResult:
        """
        Evaluate VirusTotal malware gate.
        
        Thresholds (per Phase 1 fixups):
        - >=5 malicious detections: BLOCK
        - 1-4 malicious detections: WARN
        - 0 malicious: no gate triggered
        - VT missing/rate-limited: no gate (low confidence)
        
        Args:
            vt: VirusTotal signal pack
            
        Returns:
            GateResult with BLOCK/WARN/ALLOW based on detection count
        """
        gate_id = "VT_MALWARE"
        
        # Check if VT was enabled/available
        if not vt.enabled:
            return GateResult(
                gate_id=gate_id,
                decision="ALLOW",
                triggered=False,
                confidence=0.4,
                reasons=["VirusTotal not enabled - cannot evaluate"],
                details={"vt_enabled": False},
            )
        
        # Rate-limited or no engine data = no gate
        if vt.total_engines == 0:
            return GateResult(
                gate_id=gate_id,
                decision="ALLOW",
                triggered=False,
                confidence=0.3,
                reasons=["VirusTotal rate-limited or no engine data"],
                details={"vt_enabled": True, "total_engines": 0},
            )
        
        malicious_count = vt.malicious_count
        
        # Calculate confidence based on engine count
        if vt.total_engines >= 50:
            confidence = 0.98
        elif vt.total_engines >= 30:
            confidence = 0.95
        else:
            confidence = 0.85
        
        # >=5 malicious detections: BLOCK
        if malicious_count >= self.config.vt_malicious_block_threshold:
            return GateResult(
                gate_id=gate_id,
                decision="BLOCK",
                triggered=True,
                confidence=confidence,
                reasons=[
                    f"VirusTotal detected malware: {malicious_count}/{vt.total_engines} engines flagged malicious",
                    f"Threat level: {vt.threat_level}",
                ],
                evidence_ids=[f"vt:malicious:{malicious_count}"],
                details={
                    "malicious_count": malicious_count,
                    "suspicious_count": vt.suspicious_count,
                    "total_engines": vt.total_engines,
                    "malware_families": vt.malware_families[:5],
                },
            )
        
        # 1-4 malicious detections: WARN
        if malicious_count >= self.config.vt_malicious_warn_threshold:
            return GateResult(
                gate_id=gate_id,
                decision="WARN",
                triggered=True,
                confidence=confidence * 0.8,  # Lower confidence for warn
                reasons=[
                    f"VirusTotal flagged by {malicious_count} engine(s) - possible false positive or emerging threat",
                    "Manual review recommended",
                ],
                evidence_ids=[f"vt:suspicious:{malicious_count}"],
                details={
                    "malicious_count": malicious_count,
                    "suspicious_count": vt.suspicious_count,
                    "total_engines": vt.total_engines,
                    "malware_families": vt.malware_families[:5],
                },
            )
        
        # 0 malicious: no gate
        return GateResult(
            gate_id=gate_id,
            decision="ALLOW",
            triggered=False,
            confidence=self.config.vt_confidence_threshold,
            reasons=["No malware detected by VirusTotal"],
            details={
                "malicious_count": 0,
                "total_engines": vt.total_engines,
            },
        )
    
    # =========================================================================
    # GATE 2: CRITICAL_SAST
    # =========================================================================
    
    def evaluate_critical_sast(self, sast: SastSignalPack) -> GateResult:
        """
        Evaluate critical SAST findings gate.
        
        Critical/High severity SAST findings in high-confidence patterns
        trigger BLOCK.
        
        Args:
            sast: SAST signal pack
            
        Returns:
            GateResult with BLOCK if critical issues found
        """
        gate_id = "CRITICAL_SAST"
        
        if not sast.deduped_findings:
            return GateResult(
                gate_id=gate_id,
                decision="ALLOW",
                triggered=False,
                confidence=sast.confidence,
                reasons=["No SAST findings"],
                details={"findings_count": 0},
            )
        
        # Count critical and high severity findings
        critical_count = 0
        high_count = 0
        critical_findings: List[SastFindingNormalized] = []
        high_findings: List[SastFindingNormalized] = []
        critical_high_hits = 0
        critical_high_example_ids: List[str] = []
        
        for finding in sast.deduped_findings:
            severity = finding.severity.upper()
            if severity == "CRITICAL":
                critical_count += 1
                critical_findings.append(finding)
            elif severity in ("HIGH", "ERROR"):
                high_count += 1
                high_findings.append(finding)
                
                # Check for critical-high patterns in HIGH/ERROR findings
                text_parts = [
                    finding.check_id,
                    getattr(finding, "message", "") or "",
                    getattr(finding, "category", "") or "",
                    getattr(finding, "code_snippet", "") or "",
                ]
                combined_text = " ".join(t for t in text_parts if t)
                for pattern in CRITICAL_HIGH_SAST_PATTERNS:
                    if pattern.search(combined_text):
                        critical_high_hits += 1
                        critical_high_example_ids.append(finding.check_id)
                        break
        
        # Check BLOCK thresholds
        should_block = (
            critical_count >= self.config.sast_critical_block_count or
            high_count >= self.config.sast_high_block_count or
            critical_high_hits >= 1
        )
        
        if should_block and sast.confidence >= self.config.sast_confidence_threshold:
            # Build evidence
            evidence_ids = []
            reasons = []
            
            if critical_count > 0:
                evidence_ids.extend([
                    f"sast:critical:{f.check_id}" for f in critical_findings[:3]
                ])
                reasons.append(f"{critical_count} critical SAST finding(s) detected")
            
            if high_count >= self.config.sast_high_block_count:
                evidence_ids.extend([
                    f"sast:high:{f.check_id}" for f in high_findings[:3]
                ])
                reasons.append(f"{high_count} high-severity SAST finding(s) detected")
            
            if critical_high_hits >= 1:
                reasons.append(
                    f"Critical HIGH SAST pattern matched in {critical_high_hits} high-severity finding(s)"
                )
            
            return GateResult(
                gate_id=gate_id,
                decision="BLOCK",
                triggered=True,
                confidence=sast.confidence,
                reasons=reasons,
                evidence_ids=evidence_ids,
                details={
                    "critical_count": critical_count,
                    "high_count": high_count,
                    "critical_high_hits": critical_high_hits,
                    "critical_findings": [f.check_id for f in critical_findings[:5]],
                    "high_findings": [f.check_id for f in high_findings[:5]],
                    "critical_high_example_ids": critical_high_example_ids[:5],
                },
            )
        
        return GateResult(
            gate_id=gate_id,
            decision="ALLOW",
            triggered=False,
            confidence=sast.confidence,
            reasons=["No critical SAST issues triggering block"],
            details={
                "critical_count": critical_count,
                "high_count": high_count,
            },
        )
    
    # =========================================================================
    # GATE 3: TOS_VIOLATION
    # =========================================================================
    
    def evaluate_tos_violation(
        self,
        perms: PermissionsSignalPack,
        manifest: Dict[str, Any],
    ) -> GateResult:
        """
        Evaluate Terms of Service violation gate.
        
        Certain permissions or behaviors are explicitly prohibited by
        enterprise policies or Chrome Web Store ToS.
        
        Args:
            perms: Permissions signal pack
            manifest: Manifest data
            
        Returns:
            GateResult with BLOCK if ToS violations detected
        """
        gate_id = "TOS_VIOLATION"
        
        all_permissions = set(perms.api_permissions + perms.host_permissions)
        violations: List[str] = []
        evidence_ids: List[str] = []
        
        # Check for prohibited permissions
        for prohibited in self.config.tos_prohibited_permissions:
            if prohibited in all_permissions:
                violations.append(f"Prohibited permission: {prohibited}")
                evidence_ids.append(f"tos:prohibited_perm:{prohibited}")
        
        # Check for dangerous manifest configurations
        # e.g., externally_connectable with wildcards
        ext_conn = manifest.get("externally_connectable", {})
        if isinstance(ext_conn, dict):
            matches = ext_conn.get("matches", [])
            if "<all_urls>" in matches or "*://*/*" in matches:
                violations.append("externally_connectable allows all URLs")
                evidence_ids.append("tos:ext_connectable_wildcard")
        
        if violations:
            return GateResult(
                gate_id=gate_id,
                decision="BLOCK",
                triggered=True,
                confidence=0.95,  # High confidence for explicit ToS violations
                reasons=violations,
                evidence_ids=evidence_ids,
                details={
                    "violations": violations,
                    "checked_permissions": list(self.config.tos_prohibited_permissions),
                },
            )
        
        return GateResult(
            gate_id=gate_id,
            decision="ALLOW",
            triggered=False,
            confidence=0.9,
            reasons=["No ToS violations detected"],
            details={"checked_permissions": list(self.config.tos_prohibited_permissions)},
        )
    
    # =========================================================================
    # GATE 4: PURPOSE_MISMATCH
    # =========================================================================
    
    def evaluate_purpose_mismatch(
        self,
        manifest: Dict[str, Any],
        sast: SastSignalPack,
        perms: PermissionsSignalPack,
    ) -> GateResult:
        """
        Evaluate purpose mismatch gate.
        
        Detects when an extension claims one purpose but contains code patterns
        indicating credential capture, tracking, or other concerning behaviors.
        
        Examples:
        - "Productivity tool" with keylogging patterns → BLOCK
        - "Theme" extension with network + clipboard access → WARN
        
        Args:
            manifest: Manifest data
            sast: SAST signal pack
            perms: Permissions signal pack
            
        Returns:
            GateResult with WARN or BLOCK if mismatch detected
        """
        gate_id = "PURPOSE_MISMATCH"
        
        # Extract claimed purpose from manifest
        name = manifest.get("name", "").lower()
        description = manifest.get("description", "").lower()
        claimed_purpose = f"{name} {description}"
        
        # Categories that shouldn't have credential/tracking capabilities
        benign_categories = [
            "theme", "color", "dark mode", "light mode",
            "font", "beautif", "style", "appearance",
            "bookmark", "new tab", "wallpaper",
        ]
        
        is_benign_claimed = any(cat in claimed_purpose for cat in benign_categories)
        
        # Detect credential capture patterns in SAST findings
        credential_signals: List[str] = []
        tracking_signals: List[str] = []
        
        for finding in sast.deduped_findings:
            text_to_check = f"{finding.check_id} {finding.message} {finding.code_snippet or ''}"
            
            for pattern in self._credential_patterns:
                if pattern.search(text_to_check):
                    credential_signals.append(f"{finding.check_id}: {pattern.pattern}")
                    break
            
            for pattern in self._tracking_patterns:
                if pattern.search(text_to_check):
                    tracking_signals.append(f"{finding.check_id}: {pattern.pattern}")
                    break
        
        # Dedupe signals
        credential_signals = list(set(credential_signals))[:5]
        tracking_signals = list(set(tracking_signals))[:5]
        
        # Check for concerning permission combinations on benign extensions
        has_network = perms.has_broad_host_access or "webRequest" in perms.api_permissions
        has_clipboard = "clipboardRead" in perms.api_permissions
        has_capture = any(p in perms.api_permissions for p in ["tabCapture", "desktopCapture"])
        
        # Decision logic
        mismatch_reasons: List[str] = []
        decision: Literal["ALLOW", "WARN", "BLOCK"] = "ALLOW"
        confidence = 0.8
        
        # Credential capture on any extension is concerning
        if credential_signals:
            if len(credential_signals) >= 2:
                decision = "BLOCK"
                confidence = 0.85
                mismatch_reasons.append(
                    f"Multiple credential capture patterns detected: {len(credential_signals)}"
                )
            else:
                decision = "WARN"
                mismatch_reasons.append("Credential capture pattern detected")
        
        # Benign-claimed extension with concerning capabilities
        if is_benign_claimed:
            if has_network and has_clipboard:
                decision = "WARN" if decision == "ALLOW" else decision
                mismatch_reasons.append(
                    f"'{name}' claims benign purpose but has network + clipboard access"
                )
            
            if has_capture:
                decision = "WARN" if decision == "ALLOW" else decision
                mismatch_reasons.append(
                    f"'{name}' claims benign purpose but has capture capabilities"
                )
            
            if tracking_signals:
                decision = "WARN" if decision == "ALLOW" else decision
                mismatch_reasons.append("Tracking patterns detected in benign extension")
        
        if mismatch_reasons:
            return GateResult(
                gate_id=gate_id,
                decision=decision,
                triggered=True,
                confidence=confidence,
                reasons=mismatch_reasons,
                evidence_ids=[
                    f"mismatch:credential:{s.split(':')[0]}" for s in credential_signals[:3]
                ] + [
                    f"mismatch:tracking:{s.split(':')[0]}" for s in tracking_signals[:3]
                ],
                details={
                    "claimed_purpose": claimed_purpose[:100],
                    "is_benign_claimed": is_benign_claimed,
                    "credential_signals": credential_signals,
                    "tracking_signals": tracking_signals,
                    "has_network": has_network,
                    "has_clipboard": has_clipboard,
                    "has_capture": has_capture,
                },
            )
        
        return GateResult(
            gate_id=gate_id,
            decision="ALLOW",
            triggered=False,
            confidence=0.8,
            reasons=["No purpose mismatch detected"],
            details={"is_benign_claimed": is_benign_claimed},
        )
    
    # =========================================================================
    # GATE 5: SENSITIVE_EXFIL
    # =========================================================================
    
    def evaluate_sensitive_exfil(
        self,
        perms: PermissionsSignalPack,
        sast: SastSignalPack,
        webstore_stats: WebstoreStatsSignalPack,
    ) -> GateResult:
        """
        Evaluate sensitive data exfiltration risk gate.
        
        Detects the combination of:
        - Sensitive permissions (cookies, webRequest, history, etc.)
        - Network/third-party API patterns in code
        - Missing privacy policy disclosure
        
        This combination suggests potential data exfiltration.
        
        Args:
            perms: Permissions signal pack
            sast: SAST signal pack
            webstore_stats: Webstore stats for privacy policy check
            
        Returns:
            GateResult with WARN if exfiltration risk detected
        """
        gate_id = "SENSITIVE_EXFIL"
        
        # Count sensitive permissions
        all_permissions = set(perms.api_permissions)
        sensitive_found = [
            p for p in self.config.sensitive_permissions
            if p in all_permissions
        ]
        
        has_sensitive = len(sensitive_found) > 0
        has_network = perms.has_broad_host_access or "webRequest" in all_permissions
        has_privacy_policy = webstore_stats.has_privacy_policy
        
        # Check for network/exfil patterns in SAST
        network_patterns = [
            r"fetch", r"xhr", r"ajax", r"http", r"websocket",
            r"sendbeacon", r"external.*api", r"third.?party",
        ]
        network_pattern_compiled = [re.compile(p, re.IGNORECASE) for p in network_patterns]
        
        network_findings: List[str] = []
        for finding in sast.deduped_findings:
            check_lower = finding.check_id.lower()
            msg_lower = finding.message.lower()
            for pattern in network_pattern_compiled:
                if pattern.search(check_lower) or pattern.search(msg_lower):
                    network_findings.append(finding.check_id)
                    break
        
        network_findings = list(set(network_findings))[:5]
        has_network_patterns = len(network_findings) > 0
        
        # Risk assessment
        risk_factors = 0
        reasons: List[str] = []
        
        if has_sensitive:
            risk_factors += 1
            reasons.append(f"Sensitive permissions: {', '.join(sensitive_found[:3])}")
        
        if has_network or has_network_patterns:
            risk_factors += 1
            if has_network:
                reasons.append("Has broad network access")
            if has_network_patterns:
                reasons.append(f"Network patterns in code: {len(network_findings)} findings")
        
        if not has_privacy_policy:
            risk_factors += 1
            reasons.append("Missing privacy policy")
        
        # WARN if 2+ risk factors (sensitive + network + no privacy)
        if risk_factors >= 2:
            return GateResult(
                gate_id=gate_id,
                decision="WARN",
                triggered=True,
                confidence=0.7,
                reasons=reasons,
                evidence_ids=[
                    f"exfil:sensitive_perm:{p}" for p in sensitive_found[:3]
                ] + [
                    f"exfil:network:{f}" for f in network_findings[:2]
                ],
                details={
                    "sensitive_permissions": sensitive_found,
                    "has_network_access": has_network,
                    "network_findings": network_findings,
                    "has_privacy_policy": has_privacy_policy,
                    "risk_factors": risk_factors,
                },
            )
        
        return GateResult(
            gate_id=gate_id,
            decision="ALLOW",
            triggered=False,
            confidence=0.8,
            reasons=["No significant exfiltration risk"],
            details={
                "sensitive_permissions": sensitive_found,
                "risk_factors": risk_factors,
            },
        )
    
    # =========================================================================
    # MAIN EVALUATION METHODS
    # =========================================================================
    
    def evaluate_all(
        self,
        signal_pack: SignalPack,
        manifest: Optional[Dict[str, Any]] = None,
    ) -> List[GateResult]:
        """
        Evaluate all hard gates against the signal pack.
        
        Gates are evaluated in priority order. All gates are evaluated
        to provide complete visibility, even if an early gate triggers BLOCK.
        
        Args:
            signal_pack: Layer 0 SignalPack with normalized signals
            manifest: Optional manifest data (uses empty dict if None)
            
        Returns:
            List of GateResult in priority order
        """
        manifest = manifest or {}
        
        results = [
            self.evaluate_vt_malware(signal_pack.virustotal),
            self.evaluate_critical_sast(signal_pack.sast),
            self.evaluate_tos_violation(signal_pack.permissions, manifest),
            self.evaluate_purpose_mismatch(manifest, signal_pack.sast, signal_pack.permissions),
            self.evaluate_sensitive_exfil(
                signal_pack.permissions,
                signal_pack.sast,
                signal_pack.webstore_stats,
            ),
        ]
        
        return results
    
    def get_triggered_gates(self, gate_results: List[GateResult]) -> List[GateResult]:
        """Get only the triggered gates from results."""
        return [g for g in gate_results if g.triggered]
    
    def get_blocking_gates(self, gate_results: List[GateResult]) -> List[GateResult]:
        """Get gates that triggered BLOCK decision."""
        return [g for g in gate_results if g.is_blocking]
    
    def get_warning_gates(self, gate_results: List[GateResult]) -> List[GateResult]:
        """Get gates that triggered WARN decision."""
        return [g for g in gate_results if g.is_warning]
    
    def get_final_decision(
        self,
        gate_results: List[GateResult],
        layer_scores: Optional[Dict[str, LayerScore]] = None,
    ) -> Tuple[Decision, List[str], List[str]]:
        """
        Compute final governance decision from gates and layer scores.
        
        Decision priority:
        1. Any BLOCK gate → BLOCK
        2. Layer scores below threshold → BLOCK or NEEDS_REVIEW
        3. Any WARN gate → NEEDS_REVIEW
        4. All pass → ALLOW
        
        Args:
            gate_results: Results from evaluate_all()
            layer_scores: Optional dict of layer scores (security, privacy, governance)
            
        Returns:
            Tuple of (Decision, reasons list, triggered gate IDs)
        """
        blocking_gates = self.get_blocking_gates(gate_results)
        warning_gates = self.get_warning_gates(gate_results)
        
        reasons: List[str] = []
        triggered_ids: List[str] = []
        
        # Priority 1: BLOCK gates
        if blocking_gates:
            for gate in blocking_gates:
                triggered_ids.append(gate.gate_id)
                reasons.extend(gate.reasons)
            return Decision.BLOCK, reasons, triggered_ids
        
        # Priority 2: Check layer scores if provided
        if layer_scores:
            security_score = layer_scores.get("security")
            if security_score and security_score.score < 30:
                reasons.append(f"Security score {security_score.score}/100 below threshold")
                return Decision.BLOCK, reasons, triggered_ids
            
            overall_low = False
            for layer_name, layer in layer_scores.items():
                if layer.score < 50:
                    overall_low = True
                    reasons.append(f"{layer_name.title()} score {layer.score}/100 below threshold")
            
            if overall_low:
                return Decision.NEEDS_REVIEW, reasons, triggered_ids
        
        # Priority 3: WARN gates
        if warning_gates:
            for gate in warning_gates:
                triggered_ids.append(gate.gate_id)
                reasons.extend(gate.reasons)
            return Decision.NEEDS_REVIEW, reasons, triggered_ids
        
        # Priority 4: All pass
        reasons.append("All gates passed, no significant issues detected")
        return Decision.ALLOW, reasons, triggered_ids


# =============================================================================
# CONVENIENCE FUNCTIONS
# =============================================================================

def evaluate_hard_gates(
    signal_pack: SignalPack,
    manifest: Optional[Dict[str, Any]] = None,
    config: Optional[GateConfig] = None,
) -> Tuple[List[GateResult], Decision, List[str]]:
    """
    Convenience function to evaluate all hard gates and get decision.
    
    Args:
        signal_pack: Layer 0 SignalPack
        manifest: Optional manifest data
        config: Optional gate configuration
        
    Returns:
        Tuple of (all gate results, final decision, reasons)
    """
    gates = HardGates(config)
    results = gates.evaluate_all(signal_pack, manifest)
    decision, reasons, _ = gates.get_final_decision(results)
    return results, decision, reasons


def get_hard_gate_summary(gate_results: List[GateResult]) -> Dict[str, Any]:
    """
    Get a summary of gate results for API/UI consumption.
    
    Args:
        gate_results: List of GateResult from evaluate_all()
        
    Returns:
        Dictionary summary of gate results
    """
    triggered = [g for g in gate_results if g.triggered]
    blocking = [g for g in triggered if g.is_blocking]
    warning = [g for g in triggered if g.is_warning]
    
    return {
        "total_gates": len(gate_results),
        "triggered_count": len(triggered),
        "blocking_count": len(blocking),
        "warning_count": len(warning),
        "blocking_gates": [
            {
                "gate_id": g.gate_id,
                "reasons": g.reasons,
                "confidence": g.confidence,
            }
            for g in blocking
        ],
        "warning_gates": [
            {
                "gate_id": g.gate_id,
                "reasons": g.reasons,
                "confidence": g.confidence,
            }
            for g in warning
        ],
        "all_gates": [
            {
                "gate_id": g.gate_id,
                "decision": g.decision,
                "triggered": g.triggered,
                "confidence": g.confidence,
            }
            for g in gate_results
        ],
    }

