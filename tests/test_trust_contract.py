"""
Tests for the Trust Contract: score_label ↔ summary ↔ dial

Validates that:
1. _summary_contradicts_label() catches all known contradiction patterns.
2. _fallback_executive_summary() never produces text that contradicts score_label.
3. Old-format summaries (using "summary" key instead of "one_liner") are caught.
"""

import pytest

from extension_shield.core.report_view_model import (
    _summary_contradicts_label,
    _fallback_executive_summary,
)


# =============================================================================
# _summary_contradicts_label
# =============================================================================

class TestSummaryContradictsLabel:
    """Ensure the contradiction detector works for all risk levels."""

    # ---- LOW RISK: must reject high-risk language ----

    @pytest.mark.parametrize("bad_text", [
        "This extension poses a high risk due to broad permissions.",
        "High-risk extension with critical access.",
        "Critical security concerns detected; avoid using.",
        "Severe data exposure risk found.",
        "Avoid installing this extension.",
    ])
    def test_low_risk_rejects_high_risk_language(self, bad_text):
        assert _summary_contradicts_label(bad_text, "LOW RISK") is True

    @pytest.mark.parametrize("ok_text", [
        "Low risk overall. Review the notes below.",
        "Some permissions requested; no major concerns.",
        "Minimal risk detected based on analysis.",
        "",
    ])
    def test_low_risk_accepts_low_risk_language(self, ok_text):
        assert _summary_contradicts_label(ok_text, "LOW RISK") is False

    # ---- HIGH RISK: must reject safe language ----

    @pytest.mark.parametrize("bad_text", [
        "This extension is safe to use.",
        "Low risk overall. Nothing to worry about.",
        "Low-risk extension with no concerns.",
        "No risk factors detected.",
        "There are no concerns with this extension.",
    ])
    def test_high_risk_rejects_safe_language(self, bad_text):
        assert _summary_contradicts_label(bad_text, "HIGH RISK") is True

    @pytest.mark.parametrize("ok_text", [
        "High risk — avoid unless necessary.",
        "This extension has critical permissions.",
        "",
    ])
    def test_high_risk_accepts_high_risk_language(self, ok_text):
        assert _summary_contradicts_label(ok_text, "HIGH RISK") is False

    # ---- MEDIUM RISK: no contradictions defined (always passes) ----

    @pytest.mark.parametrize("text", [
        "Some caution advised.",
        "High risk language here.",
        "Low risk language here.",
        "",
    ])
    def test_medium_risk_always_passes(self, text):
        assert _summary_contradicts_label(text, "MEDIUM RISK") is False

    # ---- Edge cases ----

    def test_none_text_never_contradicts(self):
        assert _summary_contradicts_label(None, "LOW RISK") is False
        assert _summary_contradicts_label(None, "HIGH RISK") is False

    def test_unknown_label_never_contradicts(self):
        assert _summary_contradicts_label("high risk text", "UNKNOWN") is False


# =============================================================================
# _fallback_executive_summary
# =============================================================================

class TestFallbackExecutiveSummary:
    """Ensure the deterministic fallback always matches score_label."""

    @pytest.mark.parametrize("score_label", ["LOW RISK", "MEDIUM RISK", "HIGH RISK"])
    def test_fallback_never_contradicts_own_label(self, score_label):
        """The fallback's one_liner must NOT contradict the given score_label."""
        result = _fallback_executive_summary(score=75, score_label=score_label, host_scope_label="NONE")
        one_liner = result["one_liner"]
        assert not _summary_contradicts_label(one_liner, score_label), (
            f"Fallback one_liner '{one_liner}' contradicts {score_label}"
        )

    @pytest.mark.parametrize("score_label", ["LOW RISK", "MEDIUM RISK", "HIGH RISK"])
    def test_fallback_summary_field_matches_one_liner(self, score_label):
        """Legacy 'summary' key must equal 'one_liner' (they are aliases)."""
        result = _fallback_executive_summary(score=50, score_label=score_label, host_scope_label="NONE")
        assert result["summary"] == result["one_liner"]

    def test_low_risk_fallback_tone(self):
        result = _fallback_executive_summary(score=85, score_label="LOW RISK", host_scope_label="NONE")
        assert "low risk" in result["one_liner"].lower()
        assert "high risk" not in result["one_liner"].lower()
        assert "critical" not in result["one_liner"].lower()
        assert "avoid" not in result["one_liner"].lower()

    def test_medium_risk_fallback_tone(self):
        result = _fallback_executive_summary(score=65, score_label="MEDIUM RISK", host_scope_label="NONE")
        assert "caution" in result["one_liner"].lower()

    def test_high_risk_fallback_tone(self):
        result = _fallback_executive_summary(score=30, score_label="HIGH RISK", host_scope_label="NONE")
        assert "high risk" in result["one_liner"].lower()

    def test_all_websites_only_in_what_to_watch(self):
        """host_scope_label ALL_WEBSITES should appear in what_to_watch, not override one_liner."""
        result = _fallback_executive_summary(score=85, score_label="LOW RISK", host_scope_label="ALL_WEBSITES")
        # one_liner must still say "low risk", not "high risk"
        assert "low risk" in result["one_liner"].lower()
        assert "high risk" not in result["one_liner"].lower()
        # what_to_watch should mention broad access
        assert any("all websites" in w.lower() for w in result["what_to_watch"])

    def test_fallback_returns_required_keys(self):
        result = _fallback_executive_summary(score=50, score_label="MEDIUM RISK", host_scope_label="NONE")
        for key in ("one_liner", "why_this_score", "what_to_watch", "confidence",
                     "score", "score_label", "summary", "key_findings", "recommendations"):
            assert key in result, f"Missing key: {key}"

    def test_why_this_score_has_3_items(self):
        result = _fallback_executive_summary(score=50, score_label="MEDIUM RISK", host_scope_label="NONE")
        assert len(result["why_this_score"]) == 3

    def test_what_to_watch_max_2_items(self):
        result = _fallback_executive_summary(score=50, score_label="MEDIUM RISK", host_scope_label="ALL_WEBSITES")
        assert len(result["what_to_watch"]) <= 2


# =============================================================================
# Old-format summary (uses "summary" key, not "one_liner") — regression guard
# =============================================================================

class TestOldFormatSummaryDetection:
    """
    Old LLM summaries stored in DB use { "summary": "poses a high risk..." }
    instead of { "one_liner": "..." }. The sanity check must catch both keys.
    """

    def test_old_format_high_risk_text_detected_on_low_risk_label(self):
        """Simulates stale DB summary with only 'summary' key (no 'one_liner')."""
        old_format = {
            "summary": "This extension poses a high risk due to broad permissions.",
            "overall_risk_level": "high",
            "key_findings": ["Access to all websites"],
            "recommendations": ["Avoid using with sensitive accounts"],
        }
        # The guard should check the "summary" key when "one_liner" is absent
        text = old_format.get("one_liner", "") or old_format.get("summary", "")
        assert _summary_contradicts_label(text, "LOW RISK") is True

    def test_new_format_checked_normally(self):
        """New-format summary with one_liner is checked directly."""
        new_format = {
            "one_liner": "High risk — avoid unless necessary.",
            "why_this_score": ["a", "b", "c"],
        }
        text = new_format.get("one_liner", "") or new_format.get("summary", "")
        assert _summary_contradicts_label(text, "LOW RISK") is True
        assert _summary_contradicts_label(text, "HIGH RISK") is False

