"""
SmartLead.ai API client for campaign data synchronization.
"""

from typing import Optional, Dict, Any, List, Iterator
from loguru import logger
from .base_client import BaseClient


class SmartLeadClient(BaseClient):
    """
    Client for SmartLead.ai API.

    SmartLead uses API key as a query parameter, not a header.

    API Docs: https://api.smartlead.ai/reference
    """

    def __init__(self, api_key: str):
        """
        Initialize SmartLead client.

        Args:
            api_key: SmartLead API key
        """
        super().__init__(
            api_key=api_key,
            base_url="https://server.smartlead.ai/api/v1",
            rate_limit=5  # Conservative rate limit
        )

    def _get_headers(self) -> Dict[str, str]:
        """SmartLead doesn't use Authorization header."""
        return {
            "Content-Type": "application/json",
            "Accept": "application/json"
        }

    def _add_api_key(self, params: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        """Add API key to query parameters."""
        if params is None:
            params = {}
        params["api_key"] = self.api_key
        return params

    def get(
        self,
        endpoint: str,
        params: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """Make GET request with API key in query params."""
        params = self._add_api_key(params)
        return self._request("GET", endpoint, params=params)

    def list_campaigns(self) -> List[Dict[str, Any]]:
        """
        Fetch all campaigns in the account.

        Returns:
            List of campaign objects with id, name, status, etc.
        """
        logger.info("Fetching all campaigns from SmartLead")
        response = self.get("/campaigns")

        # Response is a list directly
        if isinstance(response, list):
            logger.info(f"Found {len(response)} campaigns")
            return response

        # Or it might be wrapped
        return response.get("data", response.get("campaigns", []))

    def get_campaign(self, campaign_id: int) -> Dict[str, Any]:
        """
        Get a single campaign by ID.

        Args:
            campaign_id: Campaign ID

        Returns:
            Campaign details
        """
        return self.get(f"/campaigns/{campaign_id}")

    def get_campaign_analytics(self, campaign_id: int) -> Dict[str, Any]:
        """
        Get top-level analytics for a campaign.

        Args:
            campaign_id: Campaign ID

        Returns:
            Analytics data including sent, opened, clicked, replied, bounced counts
        """
        return self.get(f"/campaigns/{campaign_id}/analytics")

    def get_campaign_lead_statistics(self, campaign_id: int) -> Dict[str, Any]:
        """
        Get lead statistics for a campaign.

        Args:
            campaign_id: Campaign ID

        Returns:
            Lead statistics
        """
        return self.get(f"/campaigns/{campaign_id}/lead-statistics")

    def list_campaign_leads(
        self,
        campaign_id: int,
        offset: int = 0,
        limit: int = 100,
        status: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Fetch leads for a campaign.

        Args:
            campaign_id: Campaign ID
            offset: Pagination offset
            limit: Maximum records to return
            status: Filter by status (STARTED, INPROGRESS, COMPLETED, PAUSED, STOPPED)

        Returns:
            Dict with total_leads, offset, limit, and data array
        """
        params = {
            "offset": offset,
            "limit": limit
        }
        if status:
            params["status"] = status

        return self.get(f"/campaigns/{campaign_id}/leads", params=params)

    def iter_campaign_leads(
        self,
        campaign_id: int,
        batch_size: int = 100,
        max_leads: int = 5000
    ) -> Iterator[Dict[str, Any]]:
        """
        Iterate through leads in a campaign.

        Args:
            campaign_id: Campaign ID
            batch_size: Number of leads per request
            max_leads: Maximum number of leads to fetch (to prevent infinite loops)

        Yields:
            Individual lead objects
        """
        offset = 0
        fetched = 0

        while fetched < max_leads:
            response = self.list_campaign_leads(
                campaign_id=campaign_id,
                offset=offset,
                limit=batch_size
            )

            leads = response.get("data", [])

            if not leads:
                break

            for lead_data in leads:
                yield lead_data
                fetched += 1
                if fetched >= max_leads:
                    return

            total = int(response.get("total_leads", 0) or 0)
            offset += len(leads)

            if offset >= total:
                break

    def get_campaigns_with_analytics(self) -> List[Dict[str, Any]]:
        """
        Fetch all campaigns with their analytics.

        Returns:
            List of campaigns with analytics data merged
        """
        campaigns = self.list_campaigns()

        enriched_campaigns = []
        for campaign in campaigns:
            campaign_id = campaign.get("id")
            if not campaign_id:
                continue

            try:
                analytics = self.get_campaign_analytics(campaign_id)
                campaign["analytics"] = analytics
            except Exception as e:
                logger.warning(f"Failed to fetch analytics for campaign {campaign_id}: {e}")
                campaign["analytics"] = {}

            enriched_campaigns.append(campaign)

        return enriched_campaigns

    def get_leads_by_email(self, campaign_id: int) -> Dict[str, Dict[str, Any]]:
        """
        Get all leads for a campaign, indexed by email.

        Args:
            campaign_id: Campaign ID

        Returns:
            Dict mapping email -> lead data
        """
        leads_by_email = {}

        for lead_data in self.iter_campaign_leads(campaign_id):
            lead = lead_data.get("lead", {})
            email = lead.get("email", "").lower().strip()

            if email:
                leads_by_email[email] = {
                    "lead": lead,
                    "status": lead_data.get("status"),
                    "created_at": lead_data.get("created_at"),
                    "campaign_lead_map_id": lead_data.get("campaign_lead_map_id")
                }

        return leads_by_email
