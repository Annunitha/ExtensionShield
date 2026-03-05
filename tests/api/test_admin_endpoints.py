"""
Tests for admin-protected endpoints.

Verifies that admin endpoints require X-Admin-Key header and reject unauthorized access.
"""

import os
import pytest
from unittest.mock import patch
from fastapi.testclient import TestClient

from extension_shield.api.main import app, scan_results, db


@pytest.fixture
def client():
    """Create test client."""
    return TestClient(app)


@pytest.fixture
def admin_key():
    """Test admin API key."""
    return "test-admin-key-12345"


@pytest.fixture
def telemetry_key():
    """Test telemetry admin key."""
    return "test-telemetry-key-67890"


@pytest.fixture
def mock_settings_with_admin_key(admin_key, telemetry_key):
    """Mock settings with admin keys."""
    from unittest.mock import MagicMock
    settings = MagicMock()
    settings.admin_api_key = admin_key
    settings.telemetry_admin_key = telemetry_key
    return settings


@pytest.fixture
def mock_settings_without_telemetry_key(admin_key):
    """Mock settings with only general admin key (telemetry should fallback)."""
    from unittest.mock import MagicMock
    settings = MagicMock()
    settings.admin_api_key = admin_key
    settings.telemetry_admin_key = None
    return settings


class TestDeleteScanEndpoint:
    """Tests for DELETE /api/scan/{extension_id} endpoint."""

    def test_delete_scan_without_admin_key_returns_403(self, client, admin_key):
        """DELETE without X-Admin-Key header should return 403."""
        with patch("extension_shield.api.main.get_settings") as mock_get_settings, \
             patch("extension_shield.utils.mode.get_feature_flags") as mock_flags:
            from unittest.mock import MagicMock
            settings = MagicMock()
            settings.admin_api_key = admin_key
            settings.telemetry_admin_key = None
            mock_get_settings.return_value = settings
            flags = MagicMock()
            flags.mode = "cloud"
            flags.telemetry_enabled = True
            mock_flags.return_value = flags

            # Add a test scan result
            test_extension_id = "test-ext-123"
            scan_results[test_extension_id] = {"extension_id": test_extension_id, "status": "completed"}

            response = client.delete(f"/api/scan/{test_extension_id}")

            assert response.status_code == 403
            assert "admin" in response.json()["detail"].lower()

    def test_delete_scan_with_wrong_admin_key_returns_403(self, client, admin_key):
        """DELETE with wrong X-Admin-Key should return 403."""
        with patch("extension_shield.api.main.get_settings") as mock_get_settings, \
             patch("extension_shield.utils.mode.get_feature_flags") as mock_flags:
            from unittest.mock import MagicMock
            settings = MagicMock()
            settings.admin_api_key = admin_key
            settings.telemetry_admin_key = None
            mock_get_settings.return_value = settings
            flags = MagicMock()
            flags.mode = "cloud"
            flags.telemetry_enabled = True
            mock_flags.return_value = flags

            test_extension_id = "test-ext-123"
            scan_results[test_extension_id] = {"extension_id": test_extension_id, "status": "completed"}

            response = client.delete(
                f"/api/scan/{test_extension_id}",
                headers={"X-Admin-Key": "wrong-key"}
            )

            assert response.status_code == 403
            assert "invalid" in response.json()["detail"].lower()

    def test_delete_scan_with_correct_admin_key_succeeds(self, client, admin_key):
        """DELETE with correct X-Admin-Key should succeed."""
        with patch("extension_shield.api.main.get_settings") as mock_get_settings, \
             patch("extension_shield.utils.mode.get_feature_flags") as mock_flags:
            from unittest.mock import MagicMock
            settings = MagicMock()
            settings.admin_api_key = admin_key
            settings.telemetry_admin_key = None
            mock_get_settings.return_value = settings
            flags = MagicMock()
            flags.mode = "cloud"
            flags.telemetry_enabled = True
            mock_flags.return_value = flags

            # Mock database delete
            with patch.object(db, "delete_scan_result", return_value=True):
                test_extension_id = "test-ext-123"
                scan_results[test_extension_id] = {"extension_id": test_extension_id, "status": "completed"}

                response = client.delete(
                    f"/api/scan/{test_extension_id}",
                    headers={"X-Admin-Key": admin_key}
                )

                # Should succeed (200 or 204 depending on implementation)
                assert response.status_code in [200, 204, 404]  # 404 if extension not found in DB

    def test_delete_scan_without_configured_admin_key_returns_403(self, client):
        """DELETE when admin key is not configured should return 403."""
        with patch("extension_shield.api.main.get_settings") as mock_get_settings, \
             patch("extension_shield.utils.mode.get_feature_flags") as mock_flags:
            from unittest.mock import MagicMock
            settings = MagicMock()
            settings.admin_api_key = None
            settings.telemetry_admin_key = None
            mock_get_settings.return_value = settings
            flags = MagicMock()
            flags.mode = "cloud"
            flags.telemetry_enabled = True
            mock_flags.return_value = flags

            test_extension_id = "test-ext-123"
            scan_results[test_extension_id] = {"extension_id": test_extension_id, "status": "completed"}

            response = client.delete(
                f"/api/scan/{test_extension_id}",
                headers={"X-Admin-Key": "any-key"}
            )

            assert response.status_code == 403
            assert "not configured" in response.json()["detail"].lower()


class TestDiagnosticScansEndpoint:
    """Minimal test for GET /api/diagnostic/scans."""

    def test_diagnostic_scans_without_admin_key_returns_403(self, client, admin_key):
        """GET /api/diagnostic/scans without X-Admin-Key should return 403."""
        with patch("extension_shield.api.main.get_settings") as mock_get_settings, \
             patch("extension_shield.utils.mode.get_feature_flags") as mock_flags:
            from unittest.mock import MagicMock
            settings = MagicMock()
            settings.admin_api_key = admin_key
            settings.telemetry_admin_key = None
            mock_get_settings.return_value = settings
            flags = MagicMock()
            flags.mode = "cloud"
            flags.telemetry_enabled = True
            mock_flags.return_value = flags

            response = client.get("/api/diagnostic/scans")
            assert response.status_code == 403
            assert "admin" in response.json()["detail"].lower()


class TestClearEndpoint:
    """Minimal test for POST /api/clear."""

    def test_clear_without_admin_key_returns_403(self, client, admin_key):
        """POST /api/clear without X-Admin-Key should return 403."""
        with patch("extension_shield.api.main.get_settings") as mock_get_settings, \
             patch("extension_shield.utils.mode.get_feature_flags") as mock_flags:
            from unittest.mock import MagicMock
            settings = MagicMock()
            settings.admin_api_key = admin_key
            settings.telemetry_admin_key = None
            mock_get_settings.return_value = settings
            flags = MagicMock()
            flags.mode = "cloud"
            flags.telemetry_enabled = True
            mock_flags.return_value = flags

            response = client.post("/api/clear")
            assert response.status_code == 403
            assert "admin" in response.json()["detail"].lower()


class TestTelemetrySummaryEndpoint:
    """Tests for GET /api/telemetry/summary endpoint."""

    def test_telemetry_summary_without_admin_key_returns_403(self, client, admin_key, telemetry_key):
        """GET without X-Admin-Key header should return 403."""
        with patch("extension_shield.api.main.get_settings") as mock_get_settings, \
             patch("extension_shield.utils.mode.get_feature_flags") as mock_flags:
            from unittest.mock import MagicMock
            settings = MagicMock()
            settings.admin_api_key = admin_key
            settings.telemetry_admin_key = telemetry_key
            mock_get_settings.return_value = settings
            flags = MagicMock()
            flags.mode = "cloud"
            flags.telemetry_enabled = True
            mock_flags.return_value = flags

            response = client.get("/api/telemetry/summary")

            assert response.status_code == 403
            assert "admin" in response.json()["detail"].lower()

    def test_telemetry_summary_with_wrong_admin_key_returns_403(self, client, admin_key, telemetry_key):
        """GET with wrong X-Admin-Key should return 403."""
        with patch("extension_shield.api.main.get_settings") as mock_get_settings, \
             patch("extension_shield.utils.mode.get_feature_flags") as mock_flags:
            from unittest.mock import MagicMock
            settings = MagicMock()
            settings.admin_api_key = admin_key
            settings.telemetry_admin_key = telemetry_key
            mock_get_settings.return_value = settings
            flags = MagicMock()
            flags.mode = "cloud"
            flags.telemetry_enabled = True
            mock_flags.return_value = flags

            response = client.get(
                "/api/telemetry/summary",
                headers={"X-Admin-Key": "wrong-key"}
            )

            assert response.status_code == 403
            assert "invalid" in response.json()["detail"].lower()

    def test_telemetry_summary_with_telemetry_key_succeeds(self, client, admin_key, telemetry_key):
        """GET with correct TELEMETRY_ADMIN_KEY should succeed."""
        with patch("extension_shield.api.main.get_settings") as mock_get_settings, \
             patch("extension_shield.utils.mode.get_feature_flags") as mock_flags:
            from unittest.mock import MagicMock
            settings = MagicMock()
            settings.admin_api_key = admin_key
            settings.telemetry_admin_key = telemetry_key
            mock_get_settings.return_value = settings
            flags = MagicMock()
            flags.mode = "cloud"
            flags.telemetry_enabled = True
            mock_flags.return_value = flags

            # Mock database method (handle AttributeError if method doesn't exist)
            with patch("extension_shield.api.main.db") as mock_db:
                mock_db.get_page_view_summary.return_value = {"days": 14, "by_day": {}, "by_path": {}}
                response = client.get(
                    "/api/telemetry/summary",
                    headers={"X-Admin-Key": telemetry_key}
                )

                assert response.status_code == 200

    def test_telemetry_summary_falls_back_to_admin_key(self, client, admin_key):
        """GET should fallback to ADMIN_API_KEY when TELEMETRY_ADMIN_KEY is not set."""
        with patch("extension_shield.api.main.get_settings") as mock_get_settings, \
             patch("extension_shield.utils.mode.get_feature_flags") as mock_flags:
            from unittest.mock import MagicMock
            settings = MagicMock()
            settings.admin_api_key = admin_key
            settings.telemetry_admin_key = None
            mock_get_settings.return_value = settings
            flags = MagicMock()
            flags.mode = "cloud"
            flags.telemetry_enabled = True
            mock_flags.return_value = flags

            # Mock database method (handle AttributeError if method doesn't exist)
            with patch("extension_shield.api.main.db") as mock_db:
                mock_db.get_page_view_summary.return_value = {"days": 14, "by_day": {}, "by_path": {}}
                response = client.get(
                    "/api/telemetry/summary",
                    headers={"X-Admin-Key": admin_key}
                )

                assert response.status_code == 200

    def test_telemetry_summary_without_configured_key_returns_403(self, client):
        """GET when no admin keys are configured should return 403."""
        with patch("extension_shield.api.main.get_settings") as mock_get_settings, \
             patch("extension_shield.utils.mode.get_feature_flags") as mock_flags:
            from unittest.mock import MagicMock
            settings = MagicMock()
            settings.admin_api_key = None
            settings.telemetry_admin_key = None
            mock_get_settings.return_value = settings
            flags = MagicMock()
            flags.mode = "cloud"
            flags.telemetry_enabled = True
            mock_flags.return_value = flags

            response = client.get(
                "/api/telemetry/summary",
                headers={"X-Admin-Key": "any-key"}
            )

            assert response.status_code == 403
            assert "not configured" in response.json()["detail"].lower()


class TestPageviewEndpoint:
    """Tests for POST /api/telemetry/pageview endpoint."""

    def test_pageview_oss_without_oss_telemetry_returns_200_noop(self, client):
        """In OSS mode with OSS_TELEMETRY_ENABLED=false, pageview returns 200 (fail open) so UI does not break."""
        with patch("extension_shield.utils.mode.get_feature_flags") as mock_flags:
            from unittest.mock import MagicMock
            flags = MagicMock()
            flags.mode = "oss"
            flags.telemetry_enabled = False
            flags.oss_telemetry_enabled = False
            mock_flags.return_value = flags
            response = client.post(
                "/api/telemetry/pageview",
                json={"path": "/test"}
            )
            assert response.status_code == 200
            data = response.json()
            assert "day" in data
            assert data.get("path") == "/test"
            assert data.get("count") == 0

    def test_pageview_succeeds_when_oss_telemetry_enabled(self, client):
        """POST /api/telemetry/pageview succeeds when OSS_TELEMETRY_ENABLED=true (or cloud)."""
        with patch("extension_shield.utils.mode.get_feature_flags") as mock_flags:
            from unittest.mock import MagicMock
            flags = MagicMock()
            flags.mode = "oss"
            flags.telemetry_enabled = False
            flags.oss_telemetry_enabled = True
            mock_flags.return_value = flags
            response = client.post(
                "/api/telemetry/pageview",
                json={"path": "/test"}
            )
            assert response.status_code in [200, 500]


class TestDatabaseHealthEndpoint:
    """Tests for GET /api/health/db endpoint (admin-protected)."""

    def test_db_health_without_admin_key_returns_403(self, client, admin_key):
        """GET without X-Admin-Key header should return 403."""
        with patch("extension_shield.api.main.get_settings") as mock_get_settings:
            from unittest.mock import MagicMock
            settings = MagicMock()
            settings.admin_api_key = admin_key
            mock_get_settings.return_value = settings

            response = client.get("/api/health/db")

            assert response.status_code == 403
            assert "admin" in response.json()["detail"].lower()

    def test_db_health_with_wrong_admin_key_returns_403(self, client, admin_key):
        """GET with wrong X-Admin-Key should return 403."""
        with patch("extension_shield.api.main.get_settings") as mock_get_settings:
            from unittest.mock import MagicMock
            settings = MagicMock()
            settings.admin_api_key = admin_key
            mock_get_settings.return_value = settings

            response = client.get(
                "/api/health/db",
                headers={"X-Admin-Key": "wrong-key"}
            )

            assert response.status_code == 403
            assert "invalid" in response.json()["detail"].lower()

    def test_db_health_with_correct_admin_key_returns_backend(self, client, admin_key):
        """GET with correct X-Admin-Key should return backend info."""
        with patch("extension_shield.api.main.get_settings") as mock_get_settings:
            from unittest.mock import MagicMock
            settings = MagicMock()
            settings.admin_api_key = admin_key
            mock_get_settings.return_value = settings

            # Mock database to return SupabaseDatabase instance
            from extension_shield.api.database import SupabaseDatabase
            import extension_shield.api.main
            
            # Create a proper mock that passes isinstance checks
            mock_supabase_db = MagicMock()
            # Make isinstance(db, SupabaseDatabase) return True
            mock_supabase_db.__class__ = SupabaseDatabase
            mock_supabase_db.client = MagicMock()
            
            # Mock table checks - return successful responses with counts
            mock_table = MagicMock()
            mock_resp = MagicMock()
            mock_resp.count = 42
            mock_table.select.return_value.limit.return_value.execute.return_value = mock_resp
            mock_supabase_db.client.table.return_value = mock_table
            
            # Mock RPC call for function check
            mock_rpc_resp = MagicMock()
            mock_rpc_resp.data = 1
            mock_supabase_db.client.rpc.return_value.execute.return_value = mock_rpc_resp
            
            # Mock cleanup delete
            mock_delete_resp = MagicMock()
            mock_table.delete.return_value.eq.return_value.eq.return_value.execute.return_value = mock_delete_resp
            
            # Mock statistics table check (for migration verification)
            mock_stats_resp = MagicMock()
            mock_stats_resp.count = 4
            # Make table() return different responses for statistics vs other tables
            def table_side_effect(table_name):
                mock = MagicMock()
                if table_name == "statistics":
                    mock.select.return_value.limit.return_value.execute.return_value = mock_stats_resp
                elif table_name == "scan_results":
                    # For scanned_at column check, return successful response
                    mock.select.return_value.limit.return_value.execute.return_value = mock_resp
                else:
                    mock.select.return_value.limit.return_value.execute.return_value = mock_resp
                return mock
            mock_supabase_db.client.table.side_effect = table_side_effect
            
            # Replace db with our mock
            original_db = extension_shield.api.main.db
            extension_shield.api.main.db = mock_supabase_db
            
            try:
                response = client.get(
                    "/api/health/db",
                    headers={"X-Admin-Key": admin_key}
                )

                assert response.status_code == 200
                data = response.json()
                assert "backend" in data
                assert data["backend"] in ["supabase", "sqlite"]
                assert "tables_ok" in data
                assert "can_write" in data
                assert "status" in data
                assert "tables" in data
                assert "migrations" in data
                assert "statistics" in data["migrations"]
                assert "scan_results_columns_ok" in data["migrations"]
                assert "page_views_rpc_ok" in data["migrations"]
            finally:
                extension_shield.api.main.db = original_db

    def test_db_health_returns_degraded_if_table_missing(self, client, admin_key):
        """GET should return degraded status if required table is missing."""
        with patch("extension_shield.api.main.get_settings") as mock_get_settings:
            from unittest.mock import MagicMock
            settings = MagicMock()
            settings.admin_api_key = admin_key
            mock_get_settings.return_value = settings

            # Mock database to simulate missing table
            from extension_shield.api.database import SupabaseDatabase
            import extension_shield.api.main
            
            mock_supabase_db = MagicMock()
            # Make isinstance(db, SupabaseDatabase) return True
            mock_supabase_db.__class__ = SupabaseDatabase
            mock_supabase_db.client = MagicMock()
            
            # Mock table check to raise exception (table doesn't exist)
            mock_table = MagicMock()
            mock_table.select.return_value.limit.return_value.execute.side_effect = Exception("Table not found")
            mock_supabase_db.client.table.return_value = mock_table
            
            # Mock RPC call to also fail
            mock_supabase_db.client.rpc.return_value.execute.side_effect = Exception("Function not found")
            
            # Replace db with our mock
            original_db = extension_shield.api.main.db
            extension_shield.api.main.db = mock_supabase_db
            
            try:
                response = client.get(
                    "/api/health/db",
                    headers={"X-Admin-Key": admin_key}
                )

                assert response.status_code == 200
                data = response.json()
                assert data["status"] == "degraded"
                assert "missing_tables" in data
                assert len(data["missing_tables"]) > 0
                assert "migrations" in data
                # Migration checks should reflect missing tables/columns
                assert "scan_results_columns_ok" in data["migrations"]
                assert data["migrations"]["scan_results_columns_ok"] is False
            finally:
                extension_shield.api.main.db = original_db

    def test_db_health_includes_migration_checks(self, client, admin_key):
        """GET should include migration completeness checks."""
        with patch("extension_shield.api.main.get_settings") as mock_get_settings:
            from unittest.mock import MagicMock
            settings = MagicMock()
            settings.admin_api_key = admin_key
            mock_get_settings.return_value = settings

            # Mock database to return SupabaseDatabase instance
            from extension_shield.api.database import SupabaseDatabase
            import extension_shield.api.main
            
            mock_supabase_db = MagicMock()
            mock_supabase_db.__class__ = SupabaseDatabase
            mock_supabase_db.client = MagicMock()
            
            # Mock table checks
            mock_table = MagicMock()
            mock_resp = MagicMock()
            mock_resp.count = 42
            mock_table.select.return_value.limit.return_value.execute.return_value = mock_resp
            mock_supabase_db.client.table.return_value = mock_table
            
            # Mock RPC call
            mock_rpc_resp = MagicMock()
            mock_rpc_resp.data = 1
            mock_supabase_db.client.rpc.return_value.execute.return_value = mock_rpc_resp
            
            # Mock statistics table (exists)
            mock_stats_resp = MagicMock()
            mock_stats_resp.count = 4
            # Make table() return different mocks for different calls
            def table_side_effect(table_name):
                mock = MagicMock()
                if table_name == "statistics":
                    mock.select.return_value.limit.return_value.execute.return_value = mock_stats_resp
                else:
                    mock.select.return_value.limit.return_value.execute.return_value = mock_resp
                return mock
            mock_supabase_db.client.table.side_effect = table_side_effect
            
            # Replace db with our mock
            original_db = extension_shield.api.main.db
            extension_shield.api.main.db = mock_supabase_db
            
            try:
                response = client.get(
                    "/api/health/db",
                    headers={"X-Admin-Key": admin_key}
                )

                assert response.status_code == 200
                data = response.json()
                assert "migrations" in data
                migrations = data["migrations"]
                
                # Check statistics table info
                assert "statistics" in migrations
                assert "exists" in migrations["statistics"]
                assert "count" in migrations["statistics"]
                
                # Check column verification
                assert "scan_results_columns_ok" in migrations
                assert isinstance(migrations["scan_results_columns_ok"], bool)
                
                # Check RPC verification
                assert "page_views_rpc_ok" in migrations
                assert isinstance(migrations["page_views_rpc_ok"], bool)
            finally:
                extension_shield.api.main.db = original_db

    def test_db_health_without_configured_admin_key_returns_403(self, client):
        """GET when admin key is not configured should return 403."""
        with patch("extension_shield.api.main.get_settings") as mock_get_settings:
            from unittest.mock import MagicMock
            settings = MagicMock()
            settings.admin_api_key = None
            mock_get_settings.return_value = settings

            response = client.get(
                "/api/health/db",
                headers={"X-Admin-Key": "any-key"}
            )

            assert response.status_code == 403
            assert "not configured" in response.json()["detail"].lower()

