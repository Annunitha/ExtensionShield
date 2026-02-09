"""
LLM Output Validators

Strict post-LLM validators that check if LLM outputs violate authoritative signals.
If violations are detected, the entire section should be rejected and replaced with
deterministic fallbacks.

These validators do NOT mutate strings - they only check for violations.
"""

import logging
from dataclasses import dataclass
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)


@dataclass
class ValidationResult:
    """Result of LLM output validation."""
    ok: bool
    reasons: List[str]


def _normalize_text(text: Any) -> str:
    """Normalize text for case-insensitive matching."""
    if not isinstance(text, str):
        return ""
    return text.lower().strip()


def _contains_any(text: str, keywords: List[str]) -> bool:
    """Check if text contains any of the keywords (case-insensitive)."""
    text_lower = text.lower()
    return any(kw.lower() in text_lower for kw in keywords if kw)


def _get_text_fields(output: Dict[str, Any], field_names: List[str]) -> List[str]:
    """Extract text from multiple fields, handling both single values and lists."""
    texts: List[str] = []
    for field in field_names:
        value = output.get(field)
        if isinstance(value, str):
            texts.append(value)
        elif isinstance(value, list):
            texts.extend([str(item) for item in value if isinstance(item, str)])
    return texts


def validate_summary_not_generic(output: Dict[str, Any]) -> ValidationResult:
    """
    Validate that the summary does not contain generic filler text.
    """
    reasons: List[str] = []
    
    banned_phrases = [
        "score is based on",
        "code signals",
        "store metadata",
        "this analysis",
        "review the notes below",
        "capabilities indicate what it could do",
    ]
    
    all_text_fields = _get_text_fields(output, ["one_liner", "summary", "why_this_score", "key_findings", "what_to_watch", "recommendations"])
    all_text = " ".join(all_text_fields).lower()
    
    for phrase in banned_phrases:
        if phrase in all_text:
            reasons.append(f"Summary contains generic filler phrase: '{phrase}'")
            
    return ValidationResult(ok=len(reasons) == 0, reasons=reasons)


def validate_summary(
    output: Dict[str, Any],
    score_label: str,
    host_scope_label: str,
    capability_flags: Dict[str, Any],
) -> ValidationResult:
    """
    Validate executive summary output against authoritative signals.

    Rules:
    - score_label LOW RISK must not contain "high risk" or "critical" anywhere
    - host_scope_label ALL_WEBSITES must be mentioned in what_to_watch (if what_to_watch empty or missing mention -> reject)
    - If can_read_cookies=false, reject if any field mentions cookies
    - If can_read_history=false, reject if any field mentions history
    - If can_inject_scripts=false and can_modify_page_content=false, reject if any field mentions inject/modify pages/scripts
    """
    reasons: List[str] = []

    if not isinstance(output, dict):
        return ValidationResult(ok=False, reasons=["Output is not a dictionary"])

    # Rule 1: score_label LOW RISK must not contain "high risk" or "critical"
    if score_label == "LOW RISK":
        all_text = " ".join(_get_text_fields(output, ["one_liner", "summary", "why_this_score", "key_findings", "what_to_watch", "recommendations"]))
        alarm_words = ["high risk", "critical", "critical risk", "high-risk", "avoid", "severe"]
        if _contains_any(all_text, alarm_words):
            reasons.append(f"LOW RISK score_label but output contains alarm words: {[w for w in alarm_words if w in all_text.lower()]}")
            
    # Additional Rule: HIGH RISK score_label must not contain "safe" or "low risk"
    if score_label == "HIGH RISK":
        all_text = " ".join(_get_text_fields(output, ["one_liner", "summary", "why_this_score", "key_findings", "what_to_watch", "recommendations"]))
        safe_words = ["low risk", "low-risk", "safe", "no concerns", "no risk", "nothing to worry about"]
        if _contains_any(all_text, safe_words):
            reasons.append(f"HIGH RISK score_label but output contains safe words: {[w for w in safe_words if w in all_text.lower()]}")

    # Rule 2: host_scope_label ALL_WEBSITES must be mentioned in what_to_watch
    if host_scope_label == "ALL_WEBSITES":
        what_to_watch = output.get("what_to_watch") or output.get("recommendations") or []
        if isinstance(what_to_watch, str):
            what_to_watch = [what_to_watch]
        if not isinstance(what_to_watch, list):
            what_to_watch = []
        
        what_to_watch_text = " ".join([str(item) for item in what_to_watch if isinstance(item, str)])
        broad_keywords = ["all websites", "all_urls", "<all_urls>", "*://*/*", "broad", "broad host", "runs on all"]
        if not what_to_watch_text or not _contains_any(what_to_watch_text, broad_keywords):
            reasons.append("ALL_WEBSITES host_scope_label but what_to_watch does not mention broad host access")

    # Rule 3: If can_read_cookies=false, reject if any field mentions cookies
    can_read_cookies = capability_flags.get("can_read_cookies", False)
    if not can_read_cookies:
        all_text = " ".join(_get_text_fields(output, ["one_liner", "summary", "why_this_score", "key_findings", "what_to_watch", "recommendations"]))
        if _contains_any(all_text, ["cookie", "cookies"]):
            reasons.append("can_read_cookies=false but output mentions cookies")

    # Rule 4: If can_read_history=false, reject if any field mentions history
    can_read_history = capability_flags.get("can_read_history", False)
    if not can_read_history:
        all_text = " ".join(_get_text_fields(output, ["one_liner", "summary", "why_this_score", "key_findings", "what_to_watch", "recommendations"]))
        if _contains_any(all_text, ["history", "browsing history", "browser history"]):
            reasons.append("can_read_history=false but output mentions history")

    # Rule 5: If can_inject_scripts=false and can_modify_page_content=false, reject if any field mentions inject/modify pages/scripts
    can_inject_scripts = capability_flags.get("can_inject_scripts", False)
    can_modify_page_content = capability_flags.get("can_modify_page_content", False)
    if not can_inject_scripts and not can_modify_page_content:
        all_text = " ".join(_get_text_fields(output, ["one_liner", "summary", "why_this_score", "key_findings", "what_to_watch", "recommendations"]))
        inject_keywords = ["inject", "injection", "script injection", "inject scripts", "injecting"]
        modify_keywords = ["modify page", "modify pages", "page modification", "modify content", "modifying pages"]
        if _contains_any(all_text, inject_keywords + modify_keywords):
            reasons.append("can_inject_scripts=false and can_modify_page_content=false but output mentions inject/modify pages/scripts")

    return ValidationResult(ok=len(reasons) == 0, reasons=reasons)


def validate_impact(
    output: Dict[str, Any],
    capability_flags: Dict[str, Any],
    external_domains: List[str],
    network_evidence: List[Dict[str, Any]],
) -> ValidationResult:
    """
    Validate impact analysis output against authoritative signals.

    Rules:
    - If can_read_cookies=false -> reject if data_access bullets mention cookies
    - If can_read_history=false -> reject if data_access bullets mention history
    - If can_inject_scripts=false -> reject if browser_control mentions script injection
    - If external_domains empty AND network_evidence empty -> external_sharing must be UNKNOWN and bullets+mitigations empty, else reject
    """
    reasons: List[str] = []

    if not isinstance(output, dict):
        return ValidationResult(ok=False, reasons=["Output is not a dictionary"])

    # Rule 1: If can_read_cookies=false -> reject if data_access bullets mention cookies
    can_read_cookies = capability_flags.get("can_read_cookies", False)
    if not can_read_cookies:
        data_access = output.get("data_access", {})
        if isinstance(data_access, dict):
            bullets = data_access.get("bullets", [])
            if isinstance(bullets, list):
                bullets_text = " ".join([str(b) for b in bullets if isinstance(b, str)])
                if _contains_any(bullets_text, ["cookie", "cookies"]):
                    reasons.append("can_read_cookies=false but data_access bullets mention cookies")

    # Rule 2: If can_read_history=false -> reject if data_access bullets mention history
    can_read_history = capability_flags.get("can_read_history", False)
    if not can_read_history:
        data_access = output.get("data_access", {})
        if isinstance(data_access, dict):
            bullets = data_access.get("bullets", [])
            if isinstance(bullets, list):
                bullets_text = " ".join([str(b) for b in bullets if isinstance(b, str)])
                if _contains_any(bullets_text, ["history", "browsing history", "browser history"]):
                    reasons.append("can_read_history=false but data_access bullets mention history")

    # Rule 3: If can_inject_scripts=false -> reject if browser_control mentions script injection
    can_inject_scripts = capability_flags.get("can_inject_scripts", False)
    if not can_inject_scripts:
        browser_control = output.get("browser_control", {})
        if isinstance(browser_control, dict):
            bullets = browser_control.get("bullets", [])
            mitigations = browser_control.get("mitigations", [])
            all_text = " ".join([str(b) for b in bullets + mitigations if isinstance(b, str)])
            if _contains_any(all_text, ["inject", "injection", "script injection", "inject scripts", "injecting"]):
                reasons.append("can_inject_scripts=false but browser_control mentions script injection")

    # Rule 4: If external_domains empty AND network_evidence empty -> external_sharing must be UNKNOWN and bullets+mitigations empty
    has_external_evidence = bool(external_domains) or bool(network_evidence)
    if not has_external_evidence:
        external_sharing = output.get("external_sharing", {})
        if isinstance(external_sharing, dict):
            risk_level = str(external_sharing.get("risk_level", "")).upper()
            bullets = external_sharing.get("bullets", [])
            mitigations = external_sharing.get("mitigations", [])
            
            if risk_level != "UNKNOWN":
                reasons.append("external_domains empty and network_evidence empty but external_sharing risk_level is not UNKNOWN")
            
            if bullets:
                reasons.append("external_domains empty and network_evidence empty but external_sharing bullets are not empty")
            
            if mitigations:
                reasons.append("external_domains empty and network_evidence empty but external_sharing mitigations are not empty")

    return ValidationResult(ok=len(reasons) == 0, reasons=reasons)


def validate_privacy(
    output: Dict[str, Any],
    capability_flags: Dict[str, Any],
    external_domains: List[str],
    network_evidence: List[Dict[str, Any]],
    host_scope_label: str,
) -> ValidationResult:
    """
    Validate privacy compliance output against authoritative signals.

    Rules:
    - If external_domains empty AND network_evidence empty -> reject if privacy_snapshot or compliance_notes claim sharing/sending data
    - If host_scope_label ALL_WEBSITES -> governance_checks must include a WARN about broad host access (check both "check" and "note"), else reject
    """
    reasons: List[str] = []

    if not isinstance(output, dict):
        return ValidationResult(ok=False, reasons=["Output is not a dictionary"])

    # Rule 1: If external_domains empty AND network_evidence empty -> reject if privacy_snapshot or compliance_notes claim sharing/sending data
    has_external_evidence = bool(external_domains) or bool(network_evidence)
    if not has_external_evidence:
        privacy_snapshot = output.get("privacy_snapshot", "")
        if isinstance(privacy_snapshot, str):
            sharing_keywords = ["sharing", "sending data", "sends data", "share data", "data sharing", "external", "third party", "third-party"]
            if _contains_any(privacy_snapshot, sharing_keywords):
                reasons.append("external_domains empty and network_evidence empty but privacy_snapshot claims sharing/sending data")
        
        compliance_notes = output.get("compliance_notes", [])
        if isinstance(compliance_notes, list):
            notes_text = " ".join([str(note) for note in compliance_notes if isinstance(note, str)])
            sharing_keywords = ["sharing", "sending data", "sends data", "share data", "data sharing", "external", "third party", "third-party"]
            if _contains_any(notes_text, sharing_keywords):
                reasons.append("external_domains empty and network_evidence empty but compliance_notes claim sharing/sending data")

    # Rule 2: If host_scope_label ALL_WEBSITES -> governance_checks must include a WARN about broad host access
    if host_scope_label == "ALL_WEBSITES":
        governance_checks = output.get("governance_checks", [])
        if not isinstance(governance_checks, list):
            governance_checks = []
        
        # Check both "check" and "note" fields in governance_checks items
        has_broad_warning = False
        broad_keywords = ["all websites", "all_urls", "<all_urls>", "*://*/*", "broad", "broad host", "runs on all"]
        
        for check in governance_checks:
            if not isinstance(check, dict):
                continue
            
            # Check both "check" and "note" fields
            check_text = str(check.get("check", "")) + " " + str(check.get("note", ""))
            if _contains_any(check_text, broad_keywords):
                has_broad_warning = True
                break
        
        if not has_broad_warning:
            reasons.append("ALL_WEBSITES host_scope_label but governance_checks does not include a WARN about broad host access")

    return ValidationResult(ok=len(reasons) == 0, reasons=reasons)

