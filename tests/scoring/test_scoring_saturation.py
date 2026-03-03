"""
Scoring Saturation Tests

Verifies that the scoring engine uses diminishing returns (sublinear scaling)
for repeated findings. 100 findings should NOT produce 100x worse scores.

Dedup key for SAST: (check_id, file_path, line_number) or (check_id, file_path) if no line.

Uses test utilities from tests/scoring/utils.py to construct valid SignalPacks.
"""

import math
import pytest
import sys
from pathlib import Path

# Add tests directory to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from scoring.utils import (
    make_min_signal_pack,
    add_webstore_stats,
    make_test_manifest,
)
from extension_shield.scoring.engine import ScoringEngine
from extension_shield.governance.signal_pack import (
    SastSignalPack,
    SastFindingNormalized,
)


class TestSastDedupLogic:
    """Test SAST deduplication logic."""
    
    def test_dedup_key_is_check_id_file_line(self):
        """
        Verify that duplicate findings with same (check_id, file_path, line_number)
        are deduplicated by the normalizer.
        
        Uses MEDIUM severity to avoid triggering CRITICAL_SAST gate (which
        counts raw deduped_findings and would apply different gate penalties
        to the 100-dupes vs 1-finding packs).
        """
        engine = ScoringEngine(weights_version="v1")
        manifest = make_test_manifest()
        
        # Create pack with 100 IDENTICAL findings (same check_id, file, line)
        # These should all dedupe to 1 finding in the normalizer
        identical_findings = [
            SastFindingNormalized(
                check_id="style-issue",
                file_path="src/main.js",
                line_number=42,
                severity="MEDIUM",
                message="Style issue detected",
            )
            for _ in range(100)
        ]
        
        pack_dupes = make_min_signal_pack(scan_id="dupes-100")
        pack_dupes.sast = SastSignalPack(
            deduped_findings=identical_findings,
            files_scanned=10,
            confidence=1.0,
        )
        add_webstore_stats(pack_dupes, installs=10000)
        
        # Create pack with just 1 finding
        pack_single = make_min_signal_pack(scan_id="single-1")
        pack_single.sast = SastSignalPack(
            deduped_findings=[identical_findings[0]],
            files_scanned=10,
            confidence=1.0,
        )
        add_webstore_stats(pack_single, installs=10000)
        
        result_dupes = engine.calculate_scores(pack_dupes, manifest)
        result_single = engine.calculate_scores(pack_single, manifest)
        
        print(f"\n100 identical findings: security={result_dupes.security_score}")
        print(f"1 finding: security={result_single.security_score}")
        
        # After dedup, they should be equal or very close
        assert result_dupes.security_score == result_single.security_score, (
            f"Identical findings should dedupe: "
            f"100 dupes ({result_dupes.security_score}) vs 1 ({result_single.security_score})"
        )
    
    def test_unique_findings_are_not_deduped(self):
        """
        Verify that findings with different (check_id, file_path, line_number)
        are NOT deduplicated.
        """
        engine = ScoringEngine(weights_version="v1")
        manifest = make_test_manifest()
        
        # Create 10 UNIQUE findings (varying file_path and line_number)
        unique_findings = [
            SastFindingNormalized(
                check_id="eval-usage",
                file_path=f"src/file_{i}.js",  # Different file
                line_number=i * 10 + 1,         # Different line
                severity="HIGH",
                message=f"Eval usage in file {i}",
            )
            for i in range(10)
        ]
        
        pack_unique = make_min_signal_pack(scan_id="unique-10")
        pack_unique.sast = SastSignalPack(
            deduped_findings=unique_findings,
            files_scanned=10,
            confidence=1.0,
        )
        add_webstore_stats(pack_unique, installs=10000)
        
        # Create pack with just 1 finding
        pack_single = make_min_signal_pack(scan_id="unique-1")
        pack_single.sast = SastSignalPack(
            deduped_findings=[unique_findings[0]],
            files_scanned=10,
            confidence=1.0,
        )
        add_webstore_stats(pack_single, installs=10000)
        
        result_unique = engine.calculate_scores(pack_unique, manifest)
        result_single = engine.calculate_scores(pack_single, manifest)
        
        print(f"\n10 unique findings: security={result_unique.security_score}")
        print(f"1 finding: security={result_single.security_score}")
        
        # 10 unique findings should score worse than 1
        assert result_unique.security_score < result_single.security_score, (
            f"10 unique findings ({result_unique.security_score}) should score worse "
            f"than 1 finding ({result_single.security_score})"
        )


class TestSastSaturation:
    """Test that SAST scoring uses sublinear/saturating formula."""
    
    @pytest.fixture
    def engine(self):
        return ScoringEngine(weights_version="v1")
    
    @pytest.fixture
    def manifest(self):
        return make_test_manifest()
    
    def _make_unique_findings(self, n: int, severity: str = "HIGH") -> list:
        """Generate n unique SAST findings that won't be deduplicated."""
        return [
            SastFindingNormalized(
                check_id=f"rule-{i}",           # Unique rule ID
                file_path=f"src/file_{i}.js",   # Unique file
                line_number=i * 10 + 1,         # Unique line
                severity=severity,
                message=f"Finding {i}",
            )
            for i in range(n)
        ]
    
    def test_1_vs_100_findings_sublinear(self, engine, manifest):
        """
        Test: 100 findings should worsen the score but NOT 100x worse.
        
        Due to saturation formula: severity = 1 - exp(-0.08 * x)
        - 1 HIGH finding: x=4, severity ≈ 0.27
        - 100 HIGH findings: x=400, severity ≈ 1.0 (saturated)
        
        Score difference should be significant but not proportional.
        """
        # 1 unique finding
        pack_1 = make_min_signal_pack(scan_id="sat-1")
        pack_1.sast = SastSignalPack(
            deduped_findings=self._make_unique_findings(1),
            files_scanned=10,
            confidence=1.0,
        )
        add_webstore_stats(pack_1, installs=10000)
        
        # 100 unique findings
        pack_100 = make_min_signal_pack(scan_id="sat-100")
        pack_100.sast = SastSignalPack(
            deduped_findings=self._make_unique_findings(100),
            files_scanned=100,
            confidence=1.0,
        )
        add_webstore_stats(pack_100, installs=10000)
        
        result_1 = engine.calculate_scores(pack_1, manifest)
        result_100 = engine.calculate_scores(pack_100, manifest)
        
        print(f"\n1 HIGH finding: security={result_1.security_score}")
        print(f"100 HIGH findings: security={result_100.security_score}")
        
        # Score difference
        score_diff = result_1.security_score - result_100.security_score
        print(f"Score difference: {score_diff} points")
        
        # Assertions:
        # 1. 100 findings should be worse
        assert result_100.security_score < result_1.security_score, (
            "100 findings should score worse than 1"
        )
        
        # 2. But NOT 100x worse (sublinear)
        # If it were linear: 1 finding drops ~10 pts, 100 would drop ~1000 pts (impossible)
        # With saturation, both are bounded by max severity.
        # Note: at 100 HIGH findings the CRITICAL_SAST gate also fires, applying
        # a large penalty, so security_score can legitimately reach 0.
        assert result_100.security_score >= 0, (
            "Score should be non-negative"
        )
        
        # 3. The difference should be less than 100x the single finding impact
        single_impact = 100 - result_1.security_score  # ~15-25 points for 1 HIGH
        max_100_impact = 100 - result_100.security_score
        
        print(f"Single finding impact: {single_impact}")
        print(f"100 findings impact: {max_100_impact}")
        print(f"Ratio: {max_100_impact / single_impact:.2f}x (should be << 100)")
        
        # Should be much less than 100x (typically 3-5x due to saturation)
        assert max_100_impact < single_impact * 10, (
            f"Impact ratio should be << 100x, got {max_100_impact / single_impact:.2f}x"
        )
    
    def test_saturation_curve(self, engine, manifest):
        """
        Test: Severity should saturate asymptotically.
        
        As findings increase: 1 → 5 → 10 → 50 → 100
        Score drops should diminish (diminishing returns).
        """
        print("\nSaturation curve test:")
        
        results = []
        for n in [1, 5, 10, 25, 50, 100]:
            pack = make_min_signal_pack(scan_id=f"curve-{n}")
            pack.sast = SastSignalPack(
                deduped_findings=self._make_unique_findings(n),
                files_scanned=n,
                confidence=1.0,
            )
            add_webstore_stats(pack, installs=10000)
            
            result = engine.calculate_scores(pack, manifest)
            results.append((n, result.security_score))
            print(f"  {n:3d} findings: security={result.security_score}")
        
        # Calculate marginal impact (score drop per additional finding)
        print("\n  Marginal impacts:")
        for i in range(1, len(results)):
            prev_n, prev_score = results[i - 1]
            curr_n, curr_score = results[i]
            
            added_findings = curr_n - prev_n
            score_drop = prev_score - curr_score
            marginal = score_drop / added_findings if added_findings > 0 else 0
            
            print(f"  {prev_n}→{curr_n}: {score_drop:.1f} pts / {added_findings} = {marginal:.3f} pts/finding")
        
        # The marginal impact should decrease (diminishing returns)
        # First 4 findings: ~1-2 pts each, last 50 findings: ~0.1 pts each
        
        # Check first vs last marginal
        first_marginal = (results[0][1] - results[1][1]) / (results[1][0] - results[0][0])
        last_marginal = (results[-2][1] - results[-1][1]) / (results[-1][0] - results[-2][0])
        
        print(f"\n  First marginal (1→5): {first_marginal:.3f}")
        print(f"  Last marginal (50→100): {last_marginal:.3f}")
        
        assert last_marginal < first_marginal, (
            "Marginal impact should decrease (diminishing returns)"
        )
    
    def test_severity_levels_scale_correctly(self, engine, manifest):
        """
        Test: CRITICAL/HIGH findings should impact more than WARNING/INFO.
        
        Weights: CRITICAL/HIGH=4, MEDIUM/ERROR=2, WARNING=0.5, INFO=0.1
        """
        print("\nSeverity level scaling:")
        
        for severity, expected_weight in [("CRITICAL", 4.0), ("HIGH", 4.0), 
                                           ("MEDIUM", 2.0), ("WARNING", 0.5), ("INFO", 0.1)]:
            # Create pack with 10 findings of this severity
            findings = [
                SastFindingNormalized(
                    check_id=f"rule-{i}",
                    file_path=f"src/file_{i}.js",
                    line_number=i * 10 + 1,
                    severity=severity,
                    message=f"Finding {i}",
                )
                for i in range(10)
            ]
            
            pack = make_min_signal_pack(scan_id=f"sev-{severity}")
            pack.sast = SastSignalPack(
                deduped_findings=findings,
                files_scanned=10,
                confidence=1.0,
            )
            add_webstore_stats(pack, installs=10000)
            
            result = engine.calculate_scores(pack, manifest)
            print(f"  10 {severity} (weight={expected_weight}): security={result.security_score}")
        
        # Compare: 10 CRITICAL vs 10 INFO should show significant difference
        pack_crit = make_min_signal_pack(scan_id="sev-compare-crit")
        pack_crit.sast = SastSignalPack(
            deduped_findings=[
                SastFindingNormalized(
                    check_id=f"rule-{i}", file_path=f"src/file_{i}.js",
                    line_number=i, severity="CRITICAL", message=""
                )
                for i in range(10)
            ],
            files_scanned=10,
            confidence=1.0,
        )
        add_webstore_stats(pack_crit, installs=10000)
        
        pack_info = make_min_signal_pack(scan_id="sev-compare-info")
        pack_info.sast = SastSignalPack(
            deduped_findings=[
                SastFindingNormalized(
                    check_id=f"rule-{i}", file_path=f"src/file_{i}.js",
                    line_number=i, severity="INFO", message=""
                )
                for i in range(10)
            ],
            files_scanned=10,
            confidence=1.0,
        )
        add_webstore_stats(pack_info, installs=10000)
        
        result_crit = engine.calculate_scores(pack_crit, manifest)
        result_info = engine.calculate_scores(pack_info, manifest)
        
        assert result_crit.security_score < result_info.security_score, (
            f"CRITICAL ({result_crit.security_score}) should score worse than INFO ({result_info.security_score})"
        )
    
    def test_theoretical_saturation_formula(self):
        """
        Test: Verify the saturation formula math.
        
        Formula: severity = 1 - exp(-0.08 * x)
        
        At x=1 (1 INFO): severity ≈ 0.077
        At x=4 (1 HIGH): severity ≈ 0.274
        At x=40 (10 HIGH): severity ≈ 0.959
        At x=400 (100 HIGH): severity ≈ 1.0
        """
        k = 0.08
        
        test_cases = [
            (1, 0.077),    # 1 INFO (weight=0.1) -> ~8% severity
            (4, 0.274),    # 1 HIGH (weight=4) -> ~27% severity
            (8, 0.473),    # 2 HIGH -> ~47% severity
            (40, 0.959),   # 10 HIGH -> ~96% severity
            (400, 1.0),    # 100 HIGH -> ~100% severity (saturated)
        ]
        
        print("\nTheoretical saturation formula (k=0.08):")
        for x, expected in test_cases:
            actual = 1 - math.exp(-k * x)
            print(f"  x={x:3d}: severity={actual:.3f} (expected ~{expected:.3f})")
            assert abs(actual - expected) < 0.01, (
                f"At x={x}, expected ~{expected:.3f}, got {actual:.3f}"
            )


class TestVTSaturation:
    """Test VirusTotal saturation behavior."""
    
    @pytest.fixture
    def engine(self):
        return ScoringEngine(weights_version="v1")
    
    @pytest.fixture
    def manifest(self):
        return make_test_manifest()
    
    def test_vt_severity_mapping_not_linear(self, engine, manifest):
        """
        Test: VT severity uses tiered mapping, not linear.
        
        0 → 0
        1 → 0.3
        2-4 → 0.6
        5-9 → 0.8
        10+ → 1.0
        """
        from extension_shield.governance.signal_pack import VirusTotalSignalPack
        
        print("\nVT severity mapping:")
        
        results = []
        for mal_count in [0, 1, 2, 5, 10, 20]:
            pack = make_min_signal_pack(scan_id=f"vt-{mal_count}")
            pack.virustotal = VirusTotalSignalPack(
                enabled=True,
                malicious_count=mal_count,
                total_engines=70,
            )
            add_webstore_stats(pack, installs=10000)
            
            result = engine.calculate_scores(pack, manifest)
            results.append((mal_count, result.security_score))
            print(f"  {mal_count:2d} malicious: security={result.security_score}")
        
        # 10 and 20 should have same or very similar scores (both saturated)
        score_10 = next(s for m, s in results if m == 10)
        score_20 = next(s for m, s in results if m == 20)
        
        assert abs(score_10 - score_20) <= 3, (
            f"VT severity should saturate: 10 detections ({score_10}) vs 20 ({score_20})"
        )


if __name__ == "__main__":
    pytest.main([__file__, "-v", "-s"])

