"""
Tests for SmartLead sync functionality.

Run with: pytest execution/sync/test_smartlead_sync.py -v
"""

import pytest
from unittest.mock import MagicMock, patch

from execution.sync.backfill_smartlead_clients import (
    normalize_email,
    BackfillResult,
)
from execution.sync.sync_smartlead_incremental import (
    IncrementalSyncResult,
)


class TestNormalizeEmail:
    """Tests for email normalization."""

    def test_basic_normalization(self):
        assert normalize_email("TEST@Example.COM") == "test@example.com"

    def test_strips_whitespace(self):
        assert normalize_email("  test@example.com  ") == "test@example.com"

    def test_empty_string(self):
        assert normalize_email("") == ""

    def test_none_input(self):
        assert normalize_email(None) == ""

    def test_already_normalized(self):
        assert normalize_email("test@example.com") == "test@example.com"


class TestBackfillResult:
    """Tests for BackfillResult dataclass."""

    def test_default_values(self):
        result = BackfillResult()
        assert result.total_campaigns_in_db == 0
        assert result.campaigns_updated == 0
        assert result.errors == 0
        assert result.failures == []

    def test_failures_initialization(self):
        result = BackfillResult()
        result.failures.append({"test": "failure"})
        assert len(result.failures) == 1


class TestIncrementalSyncResult:
    """Tests for IncrementalSyncResult dataclass."""

    def test_default_values(self):
        result = IncrementalSyncResult()
        assert result.customers_to_sync == 0
        assert result.customers_matched == 0
        assert result.campaigns_created == 0
        assert result.failures == []


class TestEmailMatching:
    """Tests for email matching logic."""

    def test_exact_match(self):
        """Email matching should be case-insensitive."""
        client_email = "Test@Example.com"
        customer_email = "test@example.com"
        assert normalize_email(client_email) == normalize_email(customer_email)

    def test_whitespace_handling(self):
        """Email matching should handle whitespace."""
        client_email = " test@example.com "
        customer_email = "test@example.com"
        assert normalize_email(client_email) == normalize_email(customer_email)

    def test_different_emails(self):
        """Different emails should not match."""
        client_email = "client@example.com"
        customer_email = "customer@example.com"
        assert normalize_email(client_email) != normalize_email(customer_email)


class TestSmartLeadClientAPI:
    """Tests for SmartLead client API interaction."""

    @patch('httpx.Client')
    def test_fetch_clients_returns_map(self, mock_client):
        """Verify fetch_all_smartlead_clients returns proper map structure."""
        from execution.sync.backfill_smartlead_clients import fetch_all_smartlead_clients

        # Mock response
        mock_response = MagicMock()
        mock_response.json.return_value = [
            {"id": 1, "email": "test1@example.com", "name": "Test 1"},
            {"id": 2, "email": "test2@example.com", "name": "Test 2"},
        ]
        mock_response.raise_for_status = MagicMock()

        mock_client_instance = MagicMock()
        mock_client_instance.get.return_value = mock_response
        mock_client_instance.__enter__ = MagicMock(return_value=mock_client_instance)
        mock_client_instance.__exit__ = MagicMock(return_value=None)
        mock_client.return_value = mock_client_instance

        result = fetch_all_smartlead_clients("test_api_key")

        assert len(result) == 2
        assert 1 in result
        assert 2 in result
        assert result[1]["email"] == "test1@example.com"


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
