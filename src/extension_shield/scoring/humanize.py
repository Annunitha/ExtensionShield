"""
Humanize Module

Provides deterministic, human-friendly explanations of extension analysis results.
Used as fallback when LLM generation fails or returns invalid output.
"""

import logging
from typing import Dict, List, Any, Optional
from extension_shield.scoring.models import ScoringResult, FactorScore
from extension_shield.scoring.gates import GateResult

logger = logging.getLogger(__name__)


class LayerHumanizer:
    """Generates human-friendly explanations for layers without LLM dependency."""

    # Permission mappings to plain English
    PERMISSION_EXPLANATIONS = {
        "cookies": "can read site cookies",
        "storage": "can store data locally", 
        "webRequest": "can monitor network requests",
        "webRequestBlocking": "can intercept/modify network requests",
        "activeTab": "can access current tab information",
        "tabs": "can access all browser tabs",
        "history": "can read browsing history",
        "bookmarks": "can read bookmarks",
        "webNavigation": "can monitor page navigation",
        "proxy": "can modify proxy settings",
        "background": "runs continuously in background",
        "contextMenus": "can add menu items",
        "notifications": "can show notifications",
        "clipboardWrite": "can write to clipboard",
        "clipboardRead": "can read clipboard",
        "geolocation": "can access location",
        "webcamAccess": "can access camera",
        "microphoneAccess": "can access microphone",
        "nativeMessaging": "can communicate with desktop apps",
        "downloads": "can access/modify downloads",
        "management": "can manage other extensions",
        "debugger": "can debug pages/extensions",
    }

    # Host pattern mappings
    HOST_EXPLANATIONS = {
        "<all_urls>": "runs on all websites",
        "*://*/*": "runs on all websites", 
        "https://*/*": "runs on all HTTPS websites",
        "http://*/*": "runs on all HTTP websites",
        "file:///*": "can access local files",
    }

    # Gate ID mappings
    GATE_EXPLANATIONS = {
        "CRITICAL_SAST": "dangerous code pattern found",
        "SENSITIVE_EXFIL": "signals that sensitive data could be sent out", 
        "PURPOSE_MISMATCH": "behavior doesn't match what it claims",
        "VT_MALWARE": "flagged by antivirus engines",
        "TOS_VIOLATION": "violates Chrome Web Store policies",
        "MANIFEST_POSTURE": "suspicious manifest configuration",
        "CAPTURE_SIGNALS": "may capture user input/data",
    }

    # Factor name mappings
    FACTOR_EXPLANATIONS = {
        "SAST": "code analysis findings",
        "VirusTotal": "antivirus scan results", 
        "Entropy": "code complexity analysis",
        "ManifestPosture": "manifest configuration check",
        "ChromeStats": "Chrome Web Store metrics",
        "WebStoreTrust": "store reputation check",
        "MaintenanceHealth": "maintenance status",
        "PermissionsBaseline": "permission risk assessment",
        "PermissionCombos": "permission combination analysis", 
        "NetworkExfil": "data exfiltration analysis",
        "CaptureSignals": "data capture detection",
    }

    @classmethod
    def generate_layer_details_fallback(
        cls,
        scoring_result: ScoringResult,
        analysis_results: Dict[str, Any],
        manifest: Dict[str, Any],
        gate_results: Optional[List[GateResult]] = None,
    ) -> Dict[str, Any]:
        """
        Generate deterministic layer details as fallback when LLM fails.
        
        Args:
            scoring_result: Complete scoring result with layer breakdowns
            analysis_results: Dict containing results from all analyzers
            manifest: Parsed manifest.json data
            gate_results: List of gate evaluation results
            
        Returns:
            Dict with layer details in the same format as LLM output
        """
        gate_results = gate_results or []
        
        return {
            "security": cls._generate_security_layer(scoring_result, analysis_results, manifest, gate_results),
            "privacy": cls._generate_privacy_layer(scoring_result, analysis_results, manifest, gate_results),
            "governance": cls._generate_governance_layer(scoring_result, analysis_results, manifest, gate_results),
        }

    @classmethod
    def _generate_security_layer(
        cls,
        scoring_result: ScoringResult,
        analysis_results: Dict[str, Any],
        manifest: Dict[str, Any],
        gate_results: List[GateResult],
    ) -> Dict[str, Any]:
        """Generate security layer human explanation."""
        score = scoring_result.security_score
        risk_level = cls._get_risk_level_from_score(score)
        
        # Get security-related gates
        security_gates = [g for g in gate_results if g.triggered and g.gate_id in ["CRITICAL_SAST", "VT_MALWARE", "MANIFEST_POSTURE"]]
        
        # Get security factors
        security_factors = []
        if scoring_result.security_layer:
            security_factors = scoring_result.security_layer.factors
        
        # Generate one-liner based on risk level and main concerns
        one_liner = cls._generate_security_one_liner(risk_level, security_gates, security_factors)
        
        # Generate key points
        key_points = cls._generate_security_key_points(security_gates, security_factors, analysis_results, manifest)
        
        # Generate what to watch
        what_to_watch = cls._generate_security_what_to_watch(security_gates, security_factors, manifest)
        
        return {
            "one_liner": one_liner,
            "key_points": key_points[:4],  # Max 4
            "what_to_watch": what_to_watch[:3],  # Max 3
        }

    @classmethod
    def _generate_privacy_layer(
        cls,
        scoring_result: ScoringResult,
        analysis_results: Dict[str, Any],
        manifest: Dict[str, Any],
        gate_results: List[GateResult],
    ) -> Dict[str, Any]:
        """Generate privacy layer human explanation."""
        score = scoring_result.privacy_score
        risk_level = cls._get_risk_level_from_score(score)
        
        # Get privacy-related gates
        privacy_gates = [g for g in gate_results if g.triggered and g.gate_id in ["SENSITIVE_EXFIL", "CAPTURE_SIGNALS"]]
        
        # Get privacy factors
        privacy_factors = []
        if scoring_result.privacy_layer:
            privacy_factors = scoring_result.privacy_layer.factors
        
        # Generate one-liner
        one_liner = cls._generate_privacy_one_liner(risk_level, privacy_gates, privacy_factors)
        
        # Generate key points
        key_points = cls._generate_privacy_key_points(privacy_gates, privacy_factors, analysis_results, manifest)
        
        # Generate what to watch
        what_to_watch = cls._generate_privacy_what_to_watch(privacy_gates, privacy_factors, manifest)
        
        return {
            "one_liner": one_liner,
            "key_points": key_points[:4],
            "what_to_watch": what_to_watch[:3],
        }

    @classmethod
    def _generate_governance_layer(
        cls,
        scoring_result: ScoringResult,
        analysis_results: Dict[str, Any],
        manifest: Dict[str, Any],
        gate_results: List[GateResult],
    ) -> Dict[str, Any]:
        """Generate governance layer human explanation."""
        score = scoring_result.governance_score
        risk_level = cls._get_risk_level_from_score(score)
        
        # Get governance-related gates
        governance_gates = [g for g in gate_results if g.triggered and g.gate_id in ["PURPOSE_MISMATCH", "TOS_VIOLATION"]]
        
        # Get governance factors
        governance_factors = []
        if scoring_result.governance_layer:
            governance_factors = scoring_result.governance_layer.factors
        
        # Generate one-liner
        one_liner = cls._generate_governance_one_liner(risk_level, governance_gates, governance_factors)
        
        # Generate key points
        key_points = cls._generate_governance_key_points(governance_gates, governance_factors, analysis_results, manifest)
        
        # Generate what to watch
        what_to_watch = cls._generate_governance_what_to_watch(governance_gates, governance_factors, manifest)
        
        return {
            "one_liner": one_liner,
            "key_points": key_points[:4],
            "what_to_watch": what_to_watch[:3],
        }

    @classmethod
    def _get_risk_level_from_score(cls, score: int) -> str:
        """Map score to risk level. Red: 0-49, Yellow: 50-74, Green: 75-100."""
        if score >= 75:
            return "LOW"
        elif score >= 50:
            return "MEDIUM"
        else:
            return "HIGH"

    @classmethod
    def _generate_security_one_liner(
        cls,
        risk_level: str,
        security_gates: List[GateResult],
        security_factors: List[FactorScore],
    ) -> str:
        """Generate security layer one-liner."""
        if security_gates:
            primary_gate = security_gates[0]
            explanation = cls.GATE_EXPLANATIONS.get(primary_gate.gate_id, "security concerns detected")
            if risk_level == "HIGH":
                return f"High security risk due to {explanation}."
            elif risk_level == "MEDIUM":
                return f"Moderate security risk due to {explanation}."
            else:
                return f"Minor security concerns: {explanation}."
        
        # Check factors if no gates
        high_risk_factors = [f for f in security_factors if f.severity > 0.7]
        if high_risk_factors:
            factor_name = cls.FACTOR_EXPLANATIONS.get(high_risk_factors[0].name, "security analysis")
            if risk_level == "HIGH":
                return f"High security risk identified through {factor_name}."
            elif risk_level == "MEDIUM": 
                return f"Moderate security concerns found in {factor_name}."
            else:
                return f"Minor security findings in {factor_name}."
        
        # Default based on risk level
        if risk_level == "HIGH":
            return "High security risk requires careful review."
        elif risk_level == "MEDIUM":
            return "Moderate security risk with some concerns."
        else:
            return "Low security risk with minimal concerns."

    @classmethod
    def _generate_security_key_points(
        cls,
        security_gates: List[GateResult],
        security_factors: List[FactorScore],
        analysis_results: Dict[str, Any],
        manifest: Dict[str, Any],
    ) -> List[str]:
        """Generate security layer key points in plain English."""
        points = []
        
        for gate in security_gates:
            explanation = cls.GATE_EXPLANATIONS.get(gate.gate_id, "security concern detected")
            points.append(explanation.capitalize() + ".")
        
        high_factors = [f for f in security_factors if f.severity > 0.5]
        for factor in high_factors:
            if len(points) >= 4:
                break
            explanation = cls.FACTOR_EXPLANATIONS.get(factor.name, factor.name.lower())
            severity_desc = "Significant" if factor.severity > 0.8 else "Moderate" if factor.severity > 0.6 else "Minor"
            points.append(f"{severity_desc} issues found in {explanation}.")
        
        if len(points) < 2:
            powerful_perms = cls._get_powerful_permissions(manifest)
            for perm in powerful_perms[:2]:
                if len(points) >= 4:
                    break
                explanation = cls.PERMISSION_EXPLANATIONS.get(perm, f"uses {perm}")
                points.append(f"This extension {explanation}.")
        
        return [p for p in points if p]

    @classmethod 
    def _generate_security_what_to_watch(
        cls,
        security_gates: List[GateResult], 
        security_factors: List[FactorScore],
        manifest: Dict[str, Any],
    ) -> List[str]:
        """Generate security layer what to watch items."""
        watch_items = []
        
        # Watch for blocking gates
        blocking_gates = [g for g in security_gates if g.decision == "BLOCK"]
        if blocking_gates:
            watch_items.append("Critical security issues require immediate attention")
        
        # Watch for code analysis issues
        sast_factors = [f for f in security_factors if f.name == "SAST" and f.severity > 0.6]
        if sast_factors:
            watch_items.append("Code analysis flagged suspicious patterns")
        
        # Watch for powerful permissions
        powerful_perms = cls._get_powerful_permissions(manifest)
        if len(powerful_perms) > 3:
            watch_items.append("Extension requests many powerful permissions")
        
        return watch_items

    @classmethod
    def _generate_privacy_one_liner(
        cls,
        risk_level: str,
        privacy_gates: List[GateResult],
        privacy_factors: List[FactorScore],
    ) -> str:
        """Generate privacy layer one-liner."""
        if privacy_gates:
            primary_gate = privacy_gates[0]
            explanation = cls.GATE_EXPLANATIONS.get(primary_gate.gate_id, "privacy concerns detected")
            if risk_level == "HIGH":
                return f"High privacy risk: {explanation}."
            elif risk_level == "MEDIUM":
                return f"Moderate privacy risk: {explanation}."
            else:
                return f"Minor privacy concerns: {explanation}."
        
        # Check factors
        high_risk_factors = [f for f in privacy_factors if f.severity > 0.7]
        if high_risk_factors:
            factor_name = cls.FACTOR_EXPLANATIONS.get(high_risk_factors[0].name, "privacy analysis")
            if risk_level == "HIGH":
                return f"High privacy risk identified in {factor_name}."
            elif risk_level == "MEDIUM":
                return f"Moderate privacy concerns from {factor_name}."
            else:
                return f"Minor privacy findings in {factor_name}."
        
        # Default based on risk level
        if risk_level == "HIGH":
            return "High privacy risk requires careful review."
        elif risk_level == "MEDIUM":
            return "Moderate privacy risk with data access concerns."
        else:
            return "Low privacy risk with minimal data access."

    @classmethod
    def _generate_privacy_key_points(
        cls,
        privacy_gates: List[GateResult],
        privacy_factors: List[FactorScore],
        analysis_results: Dict[str, Any],
        manifest: Dict[str, Any],
    ) -> List[str]:
        """Generate privacy layer key points in plain English."""
        points = []
        
        for gate in privacy_gates:
            explanation = cls.GATE_EXPLANATIONS.get(gate.gate_id, "privacy concern detected")
            points.append(explanation.capitalize() + ".")
        
        high_factors = [f for f in privacy_factors if f.severity > 0.5]
        for factor in high_factors:
            if len(points) >= 4:
                break
            explanation = cls.FACTOR_EXPLANATIONS.get(factor.name, factor.name.lower())
            severity_desc = "Significant" if factor.severity > 0.8 else "Moderate" if factor.severity > 0.6 else "Minor"
            points.append(f"{severity_desc} issues found in {explanation}.")
        
        if len(points) < 2:
            data_perms = cls._get_data_permissions(manifest)
            for perm in data_perms[:2]:
                if len(points) >= 4:
                    break
                explanation = cls.PERMISSION_EXPLANATIONS.get(perm, f"uses {perm}")
                points.append(f"This extension {explanation}.")
        
        return [p for p in points if p]

    @classmethod
    def _generate_privacy_what_to_watch(
        cls,
        privacy_gates: List[GateResult],
        privacy_factors: List[FactorScore],
        manifest: Dict[str, Any],
    ) -> List[str]:
        """Generate privacy layer what to watch items."""
        watch_items = []
        
        # Watch for data exfiltration
        exfil_gates = [g for g in privacy_gates if "EXFIL" in g.gate_id]
        if exfil_gates:
            watch_items.append("Potential data exfiltration patterns detected")
        
        # Watch for broad host access
        if cls._has_broad_host_access(manifest):
            watch_items.append("Extension runs on all websites")
        
        # Watch for sensitive permissions
        sensitive_perms = cls._get_sensitive_permissions(manifest)
        if sensitive_perms:
            watch_items.append(f"Requests sensitive permissions: {', '.join(sensitive_perms[:2])}")
        
        return watch_items

    @classmethod
    def _generate_governance_one_liner(
        cls,
        risk_level: str,
        governance_gates: List[GateResult],
        governance_factors: List[FactorScore],
    ) -> str:
        """Generate governance layer one-liner."""
        if governance_gates:
            primary_gate = governance_gates[0]
            explanation = cls.GATE_EXPLANATIONS.get(primary_gate.gate_id, "governance concerns detected")
            if risk_level == "HIGH":
                return f"High governance risk: {explanation}."
            elif risk_level == "MEDIUM":
                return f"Moderate governance risk: {explanation}."
            else:
                return f"Minor governance concerns: {explanation}."
        
        # Default based on risk level
        if risk_level == "HIGH":
            return "High governance risk with policy compliance issues."
        elif risk_level == "MEDIUM":
            return "Moderate governance risk with some compliance concerns."
        else:
            return "Low governance risk with good policy compliance."

    @classmethod
    def _generate_governance_key_points(
        cls,
        governance_gates: List[GateResult],
        governance_factors: List[FactorScore],
        analysis_results: Dict[str, Any],
        manifest: Dict[str, Any],
    ) -> List[str]:
        """Generate governance layer key points in plain English."""
        points = []
        
        for gate in governance_gates:
            explanation = cls.GATE_EXPLANATIONS.get(gate.gate_id, "governance concern detected")
            points.append(explanation.capitalize() + ".")
        
        high_factors = [f for f in governance_factors if f.severity > 0.5]
        for factor in high_factors:
            if len(points) >= 4:
                break
            explanation = cls.FACTOR_EXPLANATIONS.get(factor.name, factor.name.lower())
            severity_desc = "Significant" if factor.severity > 0.8 else "Moderate" if factor.severity > 0.6 else "Minor"
            points.append(f"{severity_desc} issues found in {explanation}.")
        
        webstore_analysis = analysis_results.get("webstore_analysis", {})
        if isinstance(webstore_analysis, dict):
            user_count = webstore_analysis.get("user_count", 0)
            if user_count and user_count < 1000:
                points.append(f"Very few users on the Chrome Web Store (only {user_count:,}).")
        
        return [p for p in points if p]

    @classmethod
    def _generate_governance_what_to_watch(
        cls,
        governance_gates: List[GateResult],
        governance_factors: List[FactorScore],
        manifest: Dict[str, Any],
    ) -> List[str]:
        """Generate governance layer what to watch items."""
        watch_items = []
        
        # Watch for purpose mismatch
        mismatch_gates = [g for g in governance_gates if "PURPOSE_MISMATCH" in g.gate_id]
        if mismatch_gates:
            watch_items.append("Extension behavior may not match stated purpose")
        
        # Watch for policy violations
        tos_gates = [g for g in governance_gates if "TOS_VIOLATION" in g.gate_id]
        if tos_gates:
            watch_items.append("Potential Chrome Web Store policy violations")
        
        # Watch for maintenance issues
        watch_items.append("Monitor for security updates and maintenance")
        
        return watch_items

    # Helper methods
    @classmethod
    def _get_powerful_permissions(cls, manifest: Dict[str, Any]) -> List[str]:
        """Get list of powerful permissions from manifest."""
        powerful_perms = [
            "webRequestBlocking", "proxy", "debugger", "management", 
            "nativeMessaging", "clipboardRead", "downloads"
        ]
        all_perms = manifest.get("permissions", []) + manifest.get("optional_permissions", [])
        return [perm for perm in all_perms if perm in powerful_perms]

    @classmethod  
    def _get_data_permissions(cls, manifest: Dict[str, Any]) -> List[str]:
        """Get list of data access permissions from manifest."""
        data_perms = ["cookies", "storage", "history", "bookmarks", "tabs", "activeTab"]
        all_perms = manifest.get("permissions", []) + manifest.get("optional_permissions", [])
        return [perm for perm in all_perms if perm in data_perms]

    @classmethod
    def _get_sensitive_permissions(cls, manifest: Dict[str, Any]) -> List[str]:
        """Get list of sensitive permissions from manifest."""
        sensitive_perms = ["cookies", "history", "bookmarks", "clipboardRead", "geolocation"]
        all_perms = manifest.get("permissions", []) + manifest.get("optional_permissions", [])
        return [perm for perm in all_perms if perm in sensitive_perms]

    @classmethod
    def _has_broad_host_access(cls, manifest: Dict[str, Any]) -> bool:
        """Check if extension has broad host access."""
        broad_patterns = ["<all_urls>", "*://*/*", "https://*/*", "http://*/*"]
        host_permissions = manifest.get("host_permissions", []) + manifest.get("permissions", [])
        return any(any(pattern in str(perm) for pattern in broad_patterns) for perm in host_permissions)

