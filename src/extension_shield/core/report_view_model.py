"""
Report View Model Builder

Creates a UI-friendly `report_view_model` payload from scan pipeline outputs.

This mirrors the composition used in `scripts/generate_ui_report_payload.py`:
- meta, scorecard, highlights, impact_cards, privacy_snapshot, evidence, raw

Design goals:
- Deterministic and production-safe (no placeholders, safe fallbacks when LLM is unavailable)
- Short, human-readable strings for UI
- Evidence-driven external sharing (UNKNOWN unless explicit evidence is present)
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

from extension_shield.governance.tool_adapters import SignalPackBuilder
from extension_shield.scoring.engine import ScoringEngine
from extension_shield.core.summary_generator import SummaryGenerator
from extension_shield.core.impact_analyzer import ImpactAnalyzer
from extension_shield.core.privacy_compliance_analyzer import PrivacyComplianceAnalyzer


logger = logging.getLogger(__name__)


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def _map_score_label_from_risk_level(risk_level: str) -> str:
    """Map scoring RiskLevel ('low'|'medium'|'high'|'critical'|'none') to prompt label."""
    rl = (risk_level or "").lower()
    if rl in ("critical", "high"):
        return "HIGH RISK"
    if rl == "medium":
        return "MEDIUM RISK"
    return "LOW RISK"


def _coerce_list(value: Any) -> List[Any]:
    if isinstance(value, list):
        return value
    return []


def _coerce_dict(value: Any) -> Dict[str, Any]:
    if isinstance(value, dict):
        return value
    return {}


def _ensure_len(items: List[str], length: int) -> List[str]:
    """Trim/pad list to an exact length (padding with empty strings is avoided)."""
    items = [str(x) for x in items if isinstance(x, str) and x.strip()]
    return items[:length]


def _ensure_max_len(items: List[str], max_len: int) -> List[str]:
    items = [str(x) for x in items if isinstance(x, str) and x.strip()]
    return items[:max_len]


def _fallback_executive_summary(score: int, score_label: str, host_scope_label: str) -> Dict[str, Any]:
    """Deterministic executive summary fallback (no LLM)."""
    broad = host_scope_label == "ALL_WEBSITES"
    one_liner = {
        "HIGH RISK": "Higher-risk extension signals detected. Review carefully before allowing.",
        "MEDIUM RISK": "Some risk signals detected. Review scope and capabilities before allowing.",
        "LOW RISK": "No strong risk signals detected, but review permissions and scope.",
    }.get(score_label, "Summary unavailable; review scope and capabilities.")

    what_to_watch: List[str] = []
    if broad:
        what_to_watch.append("Runs on all websites (broad host access increases potential impact).")
    what_to_watch.append("Watch for updates that add new permissions or expand site access.")
    what_to_watch = _ensure_max_len(what_to_watch, 2)

    why_this_score = [
        f"Overall score: {int(score)}/100 ({score_label}).",
        f"Host access scope: {host_scope_label}.",
        "No additional narrative was generated; summary is based on scan signals.",
    ]
    why_this_score = _ensure_len(why_this_score, 3)

    return {
        "one_liner": one_liner,
        "why_this_score": why_this_score,
        "what_to_watch": what_to_watch,
        "confidence": "LOW",
        "score": int(score),
        "score_label": score_label,
        # Legacy-compat fields (used elsewhere)
        "summary": one_liner,
        "key_findings": why_this_score,
        "recommendations": what_to_watch,
        "overall_risk_level": "unknown",
        "overall_security_score": int(score),
    }


def _bucket(risk_level: str, bullets: List[str], mitigations: List[str]) -> Dict[str, Any]:
    return {
        "risk_level": (risk_level or "UNKNOWN"),
        "bullets": _ensure_max_len([str(x) for x in bullets if isinstance(x, str)], 3),
        "mitigations": _ensure_max_len([str(x) for x in mitigations if isinstance(x, str)], 3),
    }


def _fallback_impact_from_capability_flags(
    capability_flags: Dict[str, Any],
    external_domains: List[str],
    network_evidence: List[Dict[str, Any]],
    has_externally_connectable: bool,
) -> Dict[str, Any]:
    """
    Deterministic impact buckets (no LLM).

    Risk mapping updates (production requirements):
    - Data access:
      - MEDIUM for can_read_all_sites OR can_read_tabs
      - HIGH only for cookies/history/clipboard/screenshots
    - External sharing remains UNKNOWN unless evidence exists:
      external_domains OR network_evidence OR externally_connectable
    """
    flags = capability_flags or {}

    # ----------------------------
    # Data access
    # ----------------------------
    data_bullets: List[str] = []
    if flags.get("can_read_all_sites"):
        data_bullets.append("Can read or interact with pages across all websites.")
    elif flags.get("can_read_specific_sites"):
        data_bullets.append("Can read or interact with pages on specific websites.")

    if flags.get("can_read_tabs"):
        data_bullets.append("Can access open tab context (e.g., URLs/titles).")
    if flags.get("can_read_cookies"):
        data_bullets.append("Could access cookies for matching sites.")
    if flags.get("can_read_history"):
        data_bullets.append("Could access browsing history.")
    if flags.get("can_read_clipboard"):
        data_bullets.append("Could read clipboard content.")
    if flags.get("can_capture_screenshots"):
        data_bullets.append("Could capture screenshots of web pages or tabs.")

    high_data = any(
        flags.get(k)
        for k in ["can_read_cookies", "can_read_history", "can_read_clipboard", "can_capture_screenshots"]
    )
    if high_data:
        data_risk = "HIGH"
    elif flags.get("can_read_all_sites") or flags.get("can_read_tabs"):
        data_risk = "MEDIUM"
    elif flags.get("can_read_specific_sites") or flags.get("can_read_page_content"):
        data_risk = "LOW" if data_bullets else "UNKNOWN"
    else:
        data_risk = "UNKNOWN"

    data_mitigations = [
        "Restrict site access to only the domains required.",
        "Use a separate browser profile for sensitive accounts.",
    ]

    # ----------------------------
    # Browser control
    # ----------------------------
    ctrl_bullets: List[str] = []
    if flags.get("can_inject_scripts"):
        ctrl_bullets.append("Can inject scripts into pages (content scripts / scripting).")
    if flags.get("can_modify_page_content"):
        ctrl_bullets.append("Can modify page content on matching sites.")
    if flags.get("can_block_or_modify_network"):
        ctrl_bullets.append("Can observe or modify network requests.")
    if flags.get("can_control_proxy"):
        ctrl_bullets.append("Can control proxy settings.")
    if flags.get("can_manage_extensions"):
        ctrl_bullets.append("Can manage other extensions.")
    if flags.get("can_debugger"):
        ctrl_bullets.append("Can use the debugger API.")

    if any(
        flags.get(k)
        for k in [
            "can_manage_extensions",
            "can_control_proxy",
            "can_debugger",
            "can_block_or_modify_network",
        ]
    ):
        ctrl_risk = "HIGH"
    elif any(flags.get(k) for k in ["can_inject_scripts", "can_modify_page_content"]):
        ctrl_risk = "MEDIUM"
    elif ctrl_bullets:
        ctrl_risk = "LOW"
    else:
        ctrl_risk = "UNKNOWN"

    ctrl_mitigations = [
        "Monitor for unexpected page changes or blocked requests.",
        "Limit use to non-sensitive workflows if possible.",
    ]

    # ----------------------------
    # External sharing (evidence-based)
    # ----------------------------
    has_external_evidence = bool(external_domains) or bool(network_evidence) or bool(has_externally_connectable)
    if not has_external_evidence:
        ext_bucket = _bucket("UNKNOWN", [], [])
    else:
        ext_bullets: List[str] = []
        if external_domains:
            ext_bullets.append(f"Contacts external domains (examples: {', '.join(external_domains[:3])}).")
        if network_evidence:
            ext_bullets.append("Network-related code patterns were detected in scan evidence.")
        if has_externally_connectable:
            ext_bullets.append("Accepts connections from external pages/apps (externally_connectable).")

        ext_mitigations = [
            "Review network endpoints and confirm they match the intended functionality.",
            "Ensure disclosures and controls exist for any data sent externally.",
        ]
        ext_bucket = _bucket("MEDIUM", ext_bullets, ext_mitigations)

    return {
        "data_access": _bucket(data_risk, data_bullets, data_mitigations),
        "browser_control": _bucket(ctrl_risk, ctrl_bullets, ctrl_mitigations),
        "external_sharing": ext_bucket,
    }


def _extract_context(
    manifest: Dict[str, Any],
    analysis_results: Dict[str, Any],
) -> Tuple[Dict[str, Any], Dict[str, Any], List[str], List[Dict[str, Any]]]:
    impact_analyzer = ImpactAnalyzer()
    host_access_summary = impact_analyzer._classify_host_access_scope(manifest)
    external_domains = impact_analyzer._extract_external_domains(analysis_results)
    javascript_analysis = analysis_results.get("javascript_analysis", {}) or {}
    network_evidence = ImpactAnalyzer._extract_network_evidence_from_sast(javascript_analysis)
    capability_flags = impact_analyzer._compute_capability_flags(
        manifest=manifest,
        analysis_results=analysis_results,
        host_access_summary=host_access_summary,
        external_domains=external_domains,
        network_evidence=network_evidence,
    )
    return host_access_summary, capability_flags, external_domains, network_evidence


def build_report_view_model(
    manifest: Dict[str, Any],
    analysis_results: Dict[str, Any],
    metadata: Optional[Dict[str, Any]],
    extension_id: str,
    scan_id: str,
) -> Dict[str, Any]:
    """
    Build the production `report_view_model` dict for the frontend.

    Args:
        manifest: parsed manifest.json
        analysis_results: workflow analysis_results dict
        metadata: webstore metadata dict (may be empty)
        extension_id: extension identifier
        scan_id: scan identifier
    """
    manifest = _coerce_dict(manifest)
    analysis_results = _coerce_dict(analysis_results)
    metadata = _coerce_dict(metadata)

    # -------------------------------------------------------------------------
    # Layer 0 + Scoring (deterministic)
    # -------------------------------------------------------------------------
    signal_pack_builder = SignalPackBuilder()
    signal_pack = signal_pack_builder.build(
        scan_id=scan_id or extension_id,
        analysis_results=analysis_results,
        metadata=metadata,
        manifest=manifest,
        extension_id=extension_id,
    )

    user_count = metadata.get("user_count") or metadata.get("users") or signal_pack.webstore_stats.installs
    scoring_engine = ScoringEngine(weights_version="v1")
    scoring_result = scoring_engine.calculate_scores(
        signal_pack=signal_pack,
        manifest=manifest,
        user_count=user_count if isinstance(user_count, int) else None,
        permissions_analysis=analysis_results.get("permissions_analysis"),
    )

    score = int(getattr(scoring_result, "overall_score", 0) or 0)
    score_label = _map_score_label_from_risk_level(
        getattr(scoring_result, "risk_level", None).value if getattr(scoring_result, "risk_level", None) else ""
    )

    # -------------------------------------------------------------------------
    # Deterministic context (for evidence + fallbacks)
    # -------------------------------------------------------------------------
    host_access_summary, capability_flags, external_domains, network_evidence = _extract_context(
        manifest=manifest,
        analysis_results=analysis_results,
    )
    host_scope_label = host_access_summary.get("host_scope_label", "UNKNOWN")
    has_externally_connectable = bool(manifest.get("externally_connectable"))

    # -------------------------------------------------------------------------
    # LLM-backed outputs (with safe fallbacks)
    # -------------------------------------------------------------------------
    # Prefer already-computed pipeline outputs to avoid duplicate LLM calls.
    executive_summary_raw: Any = (
        analysis_results.get("executive_summary")
        or analysis_results.get("summary")
        or analysis_results.get("executiveSummary")
    )
    if not (isinstance(executive_summary_raw, dict) and executive_summary_raw):
        try:
            executive_summary_raw = SummaryGenerator().generate(
                analysis_results=analysis_results,
                manifest=manifest,
                metadata=metadata,
                scan_id=scan_id,
                extension_id=extension_id,
            )
        except Exception:
            executive_summary_raw = None

    executive_summary = (
        executive_summary_raw
        if isinstance(executive_summary_raw, dict) and executive_summary_raw
        else _fallback_executive_summary(score=score, score_label=score_label, host_scope_label=host_scope_label)
    )

    impact_analysis_raw: Any = analysis_results.get("impact_analysis") or analysis_results.get("impactAnalysis")
    if not (isinstance(impact_analysis_raw, dict) and impact_analysis_raw):
        try:
            impact_analysis_raw = ImpactAnalyzer().generate(
                analysis_results=analysis_results,
                manifest=manifest,
                extension_id=extension_id,
            )
        except Exception:
            impact_analysis_raw = None

    impact_analysis = (
        impact_analysis_raw
        if isinstance(impact_analysis_raw, dict) and impact_analysis_raw
        else _fallback_impact_from_capability_flags(
            capability_flags=capability_flags,
            external_domains=external_domains,
            network_evidence=network_evidence,
            has_externally_connectable=has_externally_connectable,
        )
    )

    privacy_compliance_raw: Any = analysis_results.get("privacy_compliance") or analysis_results.get("privacyCompliance")
    if not (isinstance(privacy_compliance_raw, dict) and privacy_compliance_raw):
        try:
            privacy_compliance_raw = PrivacyComplianceAnalyzer().generate(
                analysis_results=analysis_results,
                manifest=manifest,
                extension_dir=None,
                webstore_metadata=metadata,
            )
        except Exception:
            privacy_compliance_raw = None

    privacy_compliance = (
        privacy_compliance_raw
        if isinstance(privacy_compliance_raw, dict) and privacy_compliance_raw
        else {
            "privacy_snapshot": "",
            "data_categories": [],
            "governance_checks": [],
            "compliance_notes": [],
        }
    )

    # -------------------------------------------------------------------------
    # Normalize & compose report_view_model (stable shape)
    # -------------------------------------------------------------------------
    # Highlights: enforce list lengths and broad-access mention
    why_this_score = _ensure_len(
        _coerce_list(executive_summary.get("why_this_score") or executive_summary.get("key_findings")),
        3,
    )
    what_to_watch = _ensure_max_len(
        _coerce_list(executive_summary.get("what_to_watch") or executive_summary.get("recommendations")),
        2,
    )
    if host_scope_label == "ALL_WEBSITES":
        broad_terms = ["broad", "all websites", "all_urls", "<all_urls>", "*://*/*"]
        has_broad = any(any(t in str(item).lower() for t in broad_terms) for item in what_to_watch)
        if not has_broad:
            # Ensure we mention broad access (required)
            if len(what_to_watch) < 2:
                what_to_watch.append("Runs on all websites (broad host access).")
            else:
                what_to_watch[0] = "Runs on all websites (broad host access)."

    # Impact cards: enforce external_sharing UNKNOWN unless evidence exists
    impact_cards: List[Dict[str, Any]] = []
    for bucket_id, title in [
        ("data_access", "Data Access"),
        ("browser_control", "Browser Control"),
        ("external_sharing", "External Sharing"),
    ]:
        bucket = _coerce_dict(impact_analysis.get(bucket_id))
        if bucket_id == "external_sharing":
            has_external_evidence = bool(external_domains) or bool(network_evidence) or bool(has_externally_connectable)
            if not has_external_evidence:
                impact_cards.append(
                    {
                        "id": bucket_id,
                        "risk_level": "UNKNOWN",
                        "bullets": [],
                        "mitigations": [],
                        "title": title,
                    }
                )
                continue

        impact_cards.append(
            {
                "id": bucket_id,
                "risk_level": str(bucket.get("risk_level") or "UNKNOWN"),
                "bullets": _ensure_max_len(_coerce_list(bucket.get("bullets")), 3),
                "mitigations": _ensure_max_len(_coerce_list(bucket.get("mitigations")), 3),
                "title": title,
            }
        )

    report_view_model = {
        "meta": {
            "extension_id": extension_id,
            "name": (manifest.get("name") or metadata.get("title") or metadata.get("name") or extension_id),
            "version": manifest.get("version") or metadata.get("version") or "0.0.0",
            "scan_id": scan_id or extension_id,
            "scanned_at": _utc_now_iso(),
            "host_scope_label": host_scope_label,
        },
        "scorecard": {
            "score": score,
            "score_label": score_label,
            "confidence": str(executive_summary.get("confidence") or "LOW"),
            "one_liner": str(executive_summary.get("one_liner") or executive_summary.get("summary") or ""),
        },
        "highlights": {
            "why_this_score": why_this_score,
            "what_to_watch": what_to_watch,
        },
        "impact_cards": [
            {
                "id": c["id"],
                "risk_level": c["risk_level"],
                "bullets": c["bullets"],
                "mitigations": c["mitigations"],
                # keep extra fields if frontend wants them; safe to ignore
                "title": c.get("title"),
            }
            for c in impact_cards
        ],
        "privacy_snapshot": {
            "privacy_snapshot": str(privacy_compliance.get("privacy_snapshot") or ""),
            "data_categories": _ensure_max_len(_coerce_list(privacy_compliance.get("data_categories")), 12),
            "governance_checks": _coerce_list(privacy_compliance.get("governance_checks")),
            "compliance_notes": _coerce_list(privacy_compliance.get("compliance_notes")),
        },
        "evidence": {
            "host_access_summary": host_access_summary,
            "capability_flags": capability_flags,
            "external_domains": external_domains,
            "network_evidence": network_evidence,
            "webstore_metadata": metadata,
            "sast_summary_or_findings": (
                (analysis_results.get("javascript_analysis") or {}).get("sast_analysis")
                or (analysis_results.get("javascript_analysis") or {}).get("sast_findings", {})
            ),
            "permissions_summary": analysis_results.get("permissions_analysis") or {},
        },
        "raw": {
            "executive_summary": executive_summary,
            "impact_analysis": impact_analysis,
            "privacy_compliance": privacy_compliance,
        },
    }

    return report_view_model


