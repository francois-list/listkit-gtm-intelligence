"""
SmartLead Incremental Sync - Fetch campaigns for next N customers

This script incrementally syncs SmartLead campaigns for customers who haven't
been synced yet (i.e., customers who have no campaigns in our DB).

Process:
1. Find customers with no campaigns yet
2. Match them to SmartLead clients by email
3. Fetch campaigns for matched clients from SmartLead API
4. Create campaign records linked to the customer

Usage:
    python -m execution.sync.sync_smartlead_incremental --limit 100
"""

import json
from datetime import datetime
from typing import Dict, List, Any, Optional, Set
from dataclasses import dataclass
from pathlib import Path

from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker
from loguru import logger
import httpx
import time
import uuid

from execution.config import settings
from execution.clients.smartlead_client import SmartLeadClient


@dataclass
class IncrementalSyncResult:
    """Results from the incremental sync."""
    customers_to_sync: int = 0
    customers_matched: int = 0
    customers_not_matched: int = 0
    campaigns_fetched: int = 0
    campaigns_created: int = 0
    campaigns_updated: int = 0
    errors: int = 0
    failures: List[Dict[str, Any]] = None

    def __post_init__(self):
        if self.failures is None:
            self.failures = []


def normalize_email(email: str) -> str:
    """Normalize email for comparison."""
    if not email:
        return ""
    return email.strip().lower()


def fetch_smartlead_clients(api_key: str) -> Dict[str, Dict[str, Any]]:
    """
    Fetch all SmartLead clients and build email -> client lookup.

    Returns:
        Dict mapping normalized email -> client data
    """
    logger.info("Fetching SmartLead clients...")

    url = "https://server.smartlead.ai/api/v1/client/"
    params = {"api_key": api_key}

    with httpx.Client(timeout=60.0) as client:
        response = client.get(url, params=params)
        response.raise_for_status()
        clients = response.json()

    email_to_client = {}
    for c in clients:
        email = normalize_email(c.get("email", ""))
        if email:
            email_to_client[email] = {
                "id": c.get("id"),
                "email": email,
                "name": c.get("name", ""),
            }

    logger.info(f"Fetched {len(email_to_client)} SmartLead clients with email")
    return email_to_client


def fetch_campaigns_for_client(
    api_key: str,
    client_id: int,
    rate_limit_sleep: float = 0.2
) -> List[Dict[str, Any]]:
    """
    Fetch all campaigns for a specific SmartLead client.

    Note: SmartLead API doesn't have a direct client_id filter,
    so we fetch all campaigns and filter by client_id.
    This is cached to avoid repeated calls.
    """
    # Use the main campaigns endpoint - it returns all campaigns
    # We'll filter by client_id locally
    url = "https://server.smartlead.ai/api/v1/campaigns"
    params = {"api_key": api_key}

    time.sleep(rate_limit_sleep)  # Rate limiting

    with httpx.Client(timeout=60.0) as client:
        response = client.get(url, params=params)
        response.raise_for_status()
        all_campaigns = response.json()

    # Filter to just this client's campaigns
    client_campaigns = [
        c for c in all_campaigns
        if c.get("client_id") == client_id
    ]

    return client_campaigns


def get_campaign_analytics(api_key: str, campaign_id: int) -> Dict[str, Any]:
    """Fetch analytics for a campaign."""
    url = f"https://server.smartlead.ai/api/v1/campaigns/{campaign_id}/analytics"
    params = {"api_key": api_key}

    try:
        with httpx.Client(timeout=30.0) as client:
            response = client.get(url, params=params)
            response.raise_for_status()
            return response.json()
    except Exception as e:
        logger.warning(f"Failed to fetch analytics for campaign {campaign_id}: {e}")
        return {}


def sync_smartlead_incremental(
    limit: int = 100,
    api_key: Optional[str] = None,
    dry_run: bool = False,
) -> IncrementalSyncResult:
    """
    Incrementally sync SmartLead campaigns for customers who haven't been synced.

    Args:
        limit: Maximum number of customers to process
        api_key: SmartLead API key (uses settings if not provided)
        dry_run: If True, don't actually update the database

    Returns:
        IncrementalSyncResult with metrics
    """
    api_key = api_key or settings.smartlead_api_key
    if not api_key:
        raise ValueError("SMARTLEAD_API_KEY not configured")

    result = IncrementalSyncResult()

    logger.info("=" * 60)
    logger.info(f"Starting SmartLead incremental sync (limit={limit})...")
    logger.info(f"Dry run: {dry_run}")
    logger.info("=" * 60)

    engine = create_engine(settings.database_url)

    try:
        # Step 1: Fetch all SmartLead clients (email -> client mapping)
        email_to_client = fetch_smartlead_clients(api_key)

        # Step 2: Fetch all SmartLead campaigns (for client_id lookup)
        logger.info("Fetching all SmartLead campaigns...")
        client = SmartLeadClient(api_key=api_key)
        all_campaigns = client.list_campaigns()
        logger.info(f"Fetched {len(all_campaigns)} total campaigns")

        # Build client_id -> campaigns lookup
        campaigns_by_client: Dict[int, List[Dict]] = {}
        for camp in all_campaigns:
            client_id = camp.get("client_id")
            if client_id:
                if client_id not in campaigns_by_client:
                    campaigns_by_client[client_id] = []
                campaigns_by_client[client_id].append(camp)

        logger.info(f"Found campaigns for {len(campaigns_by_client)} distinct clients")

        # Step 3: Find customers who don't have any campaigns yet
        with engine.connect() as conn:
            # Get customers with no campaigns, ordered by created_at
            customers_result = conn.execute(text("""
                SELECT u.customer_id::text, u.email
                FROM unified_customers u
                LEFT JOIN campaigns c ON u.customer_id = c.customer_id
                WHERE c.id IS NULL
                  AND u.email IS NOT NULL
                ORDER BY u.created_at ASC
                LIMIT :limit
            """), {"limit": limit})

            customers_to_sync = list(customers_result)

        result.customers_to_sync = len(customers_to_sync)
        logger.info(f"Found {result.customers_to_sync} customers without campaigns")

        if not customers_to_sync:
            logger.info("All customers already have campaigns synced!")
            return result

        # Step 4: Process each customer
        campaigns_to_create = []

        for customer_id, customer_email in customers_to_sync:
            normalized_email = normalize_email(customer_email)

            # Try to match to SmartLead client
            sl_client = email_to_client.get(normalized_email)

            if not sl_client:
                result.customers_not_matched += 1
                result.failures.append({
                    "customer_id": customer_id,
                    "customer_email": customer_email,
                    "reason": "no_smartlead_client_with_email",
                })
                continue

            sl_client_id = sl_client["id"]
            sl_client_email = sl_client["email"]
            result.customers_matched += 1

            # Get campaigns for this client
            client_campaigns = campaigns_by_client.get(sl_client_id, [])

            if not client_campaigns:
                logger.debug(f"No campaigns for customer {customer_email}")
                continue

            logger.info(f"Customer {customer_email}: {len(client_campaigns)} campaigns from SmartLead client {sl_client_id}")

            # Process each campaign
            for camp_data in client_campaigns:
                campaign_id = camp_data.get("id")

                # Skip child campaigns (subsequences)
                if camp_data.get("parent_campaign_id"):
                    continue

                result.campaigns_fetched += 1

                # Get analytics for this campaign
                analytics = {}
                if not dry_run:
                    time.sleep(0.2)  # Rate limiting
                    analytics = get_campaign_analytics(api_key, campaign_id)

                # Extract metrics
                sent_count = int(analytics.get("sent_count", analytics.get("sent", 0)) or 0)
                reply_count = int(analytics.get("reply_count", analytics.get("replied", 0)) or 0)
                bounce_count = int(analytics.get("bounce_count", analytics.get("bounced", 0)) or 0)
                positive_reply_count = int(analytics.get("positive_reply_count", analytics.get("interested", 0)) or 0)
                leads_count = int(analytics.get("total_leads", camp_data.get("lead_count", 0)) or 0)

                # Calculate rates
                reply_rate = (reply_count / sent_count * 100) if sent_count > 0 else None
                positive_reply_rate = (positive_reply_count / sent_count * 100) if sent_count > 0 else None
                bounce_rate = (bounce_count / sent_count * 100) if sent_count > 0 else None

                campaigns_to_create.append({
                    "id": str(uuid.uuid4()),
                    "customer_id": customer_id,
                    "smartlead_campaign_id": str(campaign_id),
                    "smartlead_client_id": sl_client_id,
                    "smartlead_client_email": sl_client_email,
                    "campaign_name": camp_data.get("name", "Unknown"),
                    "status": camp_data.get("status", "").lower(),
                    "leads_count": leads_count,
                    "emails_sent": sent_count,
                    "reply_count": reply_count,
                    "positive_reply_count": positive_reply_count,
                    "bounce_count": bounce_count,
                    "reply_rate": reply_rate,
                    "positive_reply_rate": positive_reply_rate,
                    "bounce_rate": bounce_rate,
                })

        # Step 5: Insert campaigns into database
        if not dry_run and campaigns_to_create:
            logger.info(f"Creating {len(campaigns_to_create)} campaigns...")

            with engine.connect() as conn:
                for camp in campaigns_to_create:
                    try:
                        # Check if campaign already exists (by smartlead_campaign_id)
                        existing = conn.execute(text("""
                            SELECT id FROM campaigns
                            WHERE smartlead_campaign_id = :sl_id
                        """), {"sl_id": camp["smartlead_campaign_id"]}).first()

                        if existing:
                            # Update existing
                            conn.execute(text("""
                                UPDATE campaigns SET
                                    customer_id = CAST(:customer_id AS UUID),
                                    smartlead_client_id = :sl_client_id,
                                    smartlead_client_email = :sl_client_email,
                                    campaign_name = :campaign_name,
                                    status = :status,
                                    leads_count = :leads_count,
                                    emails_sent = :emails_sent,
                                    reply_count = :reply_count,
                                    positive_reply_count = :positive_reply_count,
                                    bounce_count = :bounce_count,
                                    reply_rate = :reply_rate,
                                    positive_reply_rate = :positive_reply_rate,
                                    bounce_rate = :bounce_rate,
                                    updated_at = NOW(),
                                    last_synced_at = NOW()
                                WHERE smartlead_campaign_id = :smartlead_campaign_id
                            """), camp)
                            result.campaigns_updated += 1
                        else:
                            # Insert new
                            conn.execute(text("""
                                INSERT INTO campaigns (
                                    id, customer_id, smartlead_campaign_id, smartlead_client_id,
                                    smartlead_client_email, campaign_name, status, leads_count,
                                    emails_sent, reply_count, positive_reply_count, bounce_count,
                                    reply_rate, positive_reply_rate, bounce_rate,
                                    created_at, updated_at, last_synced_at
                                ) VALUES (
                                    CAST(:id AS UUID), CAST(:customer_id AS UUID), :smartlead_campaign_id,
                                    :smartlead_client_id, :smartlead_client_email, :campaign_name,
                                    :status, :leads_count, :emails_sent, :reply_count,
                                    :positive_reply_count, :bounce_count, :reply_rate,
                                    :positive_reply_rate, :bounce_rate, NOW(), NOW(), NOW()
                                )
                            """), camp)
                            result.campaigns_created += 1
                    except Exception as e:
                        logger.error(f"Error creating campaign: {e}")
                        result.errors += 1
                        result.failures.append({
                            "campaign_id": camp.get("smartlead_campaign_id"),
                            "customer_id": camp.get("customer_id"),
                            "reason": "insert_error",
                            "error": str(e),
                        })

                conn.commit()
        elif dry_run:
            result.campaigns_created = len(campaigns_to_create)
            logger.info(f"[DRY RUN] Would create {len(campaigns_to_create)} campaigns")

        # Summary
        logger.info("=" * 60)
        logger.info("SmartLead incremental sync complete!")
        logger.info(f"  Customers to sync: {result.customers_to_sync}")
        logger.info(f"  Customers matched to SmartLead: {result.customers_matched}")
        logger.info(f"  Customers not matched: {result.customers_not_matched}")
        logger.info(f"  Campaigns fetched: {result.campaigns_fetched}")
        logger.info(f"  Campaigns created: {result.campaigns_created}")
        logger.info(f"  Campaigns updated: {result.campaigns_updated}")
        logger.info(f"  Errors: {result.errors}")
        logger.info("=" * 60)

        return result

    except Exception as e:
        logger.error(f"Incremental sync failed: {e}")
        raise


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Incrementally sync SmartLead campaigns for unsynced customers")
    parser.add_argument("--limit", type=int, default=100, help="Max customers to process")
    parser.add_argument("--dry-run", action="store_true", help="Don't actually update the database")

    args = parser.parse_args()

    result = sync_smartlead_incremental(
        limit=args.limit,
        dry_run=args.dry_run,
    )

    print(f"\nResult: {result}")
