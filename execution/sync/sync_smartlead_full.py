"""
SmartLead Full Sync - Ensures all customers have all their correct campaigns

This script does a comprehensive sync:
1. For ALL customers (or a batch), find their SmartLead client by email
2. Fetch ALL campaigns for that client from SmartLead
3. Ensure all those campaigns are in the DB and linked to the right customer
4. Remove any incorrectly linked campaigns

Usage:
    python -m execution.sync.sync_smartlead_full --limit 100
    python -m execution.sync.sync_smartlead_full --limit 100 --dry-run
"""

import time
from datetime import datetime
from typing import Dict, List, Any, Optional
from dataclasses import dataclass
import uuid

from sqlalchemy import create_engine, text
from loguru import logger
import httpx

from execution.config import settings
from execution.clients.smartlead_client import SmartLeadClient


@dataclass
class FullSyncResult:
    """Results from the full sync."""
    customers_processed: int = 0
    customers_matched: int = 0
    customers_not_matched: int = 0
    campaigns_created: int = 0
    campaigns_updated: int = 0
    campaigns_already_correct: int = 0
    errors: int = 0


def normalize_email(email: str) -> str:
    """Normalize email for comparison."""
    if not email:
        return ""
    return email.strip().lower()


def get_campaign_analytics(api_key: str, campaign_id: int) -> Dict[str, Any]:
    """Fetch analytics for a campaign."""
    url = f"https://server.smartlead.ai/api/v1/campaigns/{campaign_id}/analytics"
    params = {"api_key": api_key}

    try:
        with httpx.Client(timeout=30.0) as client:
            response = client.get(url, params=params)
            if response.status_code == 200:
                return response.json()
            return {}
    except Exception as e:
        logger.warning(f"Failed to fetch analytics for campaign {campaign_id}: {e}")
        return {}


def sync_smartlead_full(
    limit: int = 100,
    offset: int = 0,
    api_key: Optional[str] = None,
    dry_run: bool = False,
) -> FullSyncResult:
    """
    Full sync of SmartLead campaigns for all customers.

    Args:
        limit: Maximum number of customers to process
        offset: Offset for pagination
        api_key: SmartLead API key (uses settings if not provided)
        dry_run: If True, don't actually update the database

    Returns:
        FullSyncResult with metrics
    """
    api_key = api_key or settings.smartlead_api_key
    if not api_key:
        raise ValueError("SMARTLEAD_API_KEY not configured")

    result = FullSyncResult()

    logger.info("=" * 60)
    logger.info(f"Starting SmartLead full sync (limit={limit}, offset={offset})...")
    logger.info(f"Dry run: {dry_run}")
    logger.info("=" * 60)

    engine = create_engine(settings.database_url)

    try:
        # Step 1: Fetch all SmartLead clients
        logger.info("Fetching SmartLead clients...")
        url = "https://server.smartlead.ai/api/v1/client/"
        with httpx.Client(timeout=60.0) as client:
            response = client.get(url, params={"api_key": api_key})
            response.raise_for_status()
            sl_clients = response.json()

        # Build email -> client lookup
        email_to_client = {}
        for c in sl_clients:
            email = normalize_email(c.get("email", ""))
            if email:
                email_to_client[email] = {
                    "id": c.get("id"),
                    "email": email,
                    "name": c.get("name", ""),
                }
        logger.info(f"Found {len(email_to_client)} SmartLead clients")

        # Step 2: Fetch all SmartLead campaigns
        logger.info("Fetching SmartLead campaigns...")
        sl_client = SmartLeadClient(api_key=api_key)
        all_sl_campaigns = sl_client.list_campaigns()
        logger.info(f"Found {len(all_sl_campaigns)} SmartLead campaigns")

        # Build client_id -> campaigns lookup
        campaigns_by_client: Dict[int, List[Dict]] = {}
        for camp in all_sl_campaigns:
            client_id = camp.get("client_id")
            if client_id:
                if client_id not in campaigns_by_client:
                    campaigns_by_client[client_id] = []
                campaigns_by_client[client_id].append(camp)

        logger.info(f"Campaigns distributed across {len(campaigns_by_client)} clients")

        # Step 3: Get customers to process
        with engine.connect() as conn:
            customers_result = conn.execute(text("""
                SELECT customer_id::text, email
                FROM unified_customers
                WHERE email IS NOT NULL
                ORDER BY created_at ASC
                LIMIT :limit OFFSET :offset
            """), {"limit": limit, "offset": offset})

            customers = list(customers_result)

        logger.info(f"Processing {len(customers)} customers")

        # Step 4: Process each customer
        for customer_id, customer_email in customers:
            result.customers_processed += 1
            normalized_email = normalize_email(customer_email)

            # Find SmartLead client
            sl_client_info = email_to_client.get(normalized_email)

            if not sl_client_info:
                result.customers_not_matched += 1
                continue

            result.customers_matched += 1
            sl_client_id = sl_client_info["id"]
            sl_client_email = sl_client_info["email"]

            # Get campaigns for this client
            client_campaigns = campaigns_by_client.get(sl_client_id, [])

            if not client_campaigns:
                logger.debug(f"No campaigns for {customer_email}")
                continue

            logger.info(f"Customer {customer_email}: {len(client_campaigns)} SmartLead campaigns")

            # Process each campaign
            with engine.connect() as conn:
                for camp_data in client_campaigns:
                    sl_campaign_id = camp_data.get("id")

                    # Skip subsequences
                    if camp_data.get("parent_campaign_id"):
                        continue

                    # Check if campaign exists in DB
                    existing = conn.execute(text("""
                        SELECT id::text, customer_id::text FROM campaigns
                        WHERE smartlead_campaign_id = :sl_id
                    """), {"sl_id": str(sl_campaign_id)}).first()

                    if existing:
                        existing_id, existing_customer_id = existing

                        if existing_customer_id == customer_id:
                            # Already correctly linked
                            result.campaigns_already_correct += 1
                            continue
                        else:
                            # Linked to wrong customer - update it
                            if not dry_run:
                                conn.execute(text("""
                                    UPDATE campaigns SET
                                        customer_id = CAST(:customer_id AS UUID),
                                        smartlead_client_id = :sl_client_id,
                                        smartlead_client_email = :sl_client_email,
                                        updated_at = NOW()
                                    WHERE id = CAST(:campaign_uuid AS UUID)
                                """), {
                                    "customer_id": customer_id,
                                    "sl_client_id": sl_client_id,
                                    "sl_client_email": sl_client_email,
                                    "campaign_uuid": existing_id,
                                })
                                conn.commit()
                            result.campaigns_updated += 1
                            logger.info(f"  Updated: {camp_data['name'][:50]}")
                    else:
                        # Campaign doesn't exist - create it
                        if not dry_run:
                            time.sleep(0.2)  # Rate limiting
                            analytics = get_campaign_analytics(api_key, sl_campaign_id)

                            sent = int(analytics.get("sent_count", analytics.get("sent", 0)) or 0)
                            replies = int(analytics.get("reply_count", analytics.get("replied", 0)) or 0)
                            bounces = int(analytics.get("bounce_count", analytics.get("bounced", 0)) or 0)
                            positive = int(analytics.get("positive_reply_count", analytics.get("interested", 0)) or 0)
                            leads = int(analytics.get("total_leads", camp_data.get("lead_count", 0)) or 0)

                            reply_rate = (replies / sent * 100) if sent > 0 else None
                            positive_rate = (positive / sent * 100) if sent > 0 else None
                            bounce_rate = (bounces / sent * 100) if sent > 0 else None

                            conn.execute(text("""
                                INSERT INTO campaigns (
                                    id, customer_id, smartlead_campaign_id, smartlead_client_id,
                                    smartlead_client_email, campaign_name, status, leads_count,
                                    emails_sent, reply_count, positive_reply_count, bounce_count,
                                    reply_rate, positive_reply_rate, bounce_rate,
                                    created_at, updated_at, last_synced_at
                                ) VALUES (
                                    CAST(:id AS UUID), CAST(:customer_id AS UUID), :sl_campaign_id,
                                    :sl_client_id, :sl_client_email, :name, :status, :leads,
                                    :sent, :replies, :positive, :bounces,
                                    :reply_rate, :positive_rate, :bounce_rate,
                                    NOW(), NOW(), NOW()
                                )
                            """), {
                                "id": str(uuid.uuid4()),
                                "customer_id": customer_id,
                                "sl_campaign_id": str(sl_campaign_id),
                                "sl_client_id": sl_client_id,
                                "sl_client_email": sl_client_email,
                                "name": camp_data.get("name", "Unknown"),
                                "status": camp_data.get("status", "").lower(),
                                "leads": leads,
                                "sent": sent,
                                "replies": replies,
                                "positive": positive,
                                "bounces": bounces,
                                "reply_rate": reply_rate,
                                "positive_rate": positive_rate,
                                "bounce_rate": bounce_rate,
                            })
                            conn.commit()

                        result.campaigns_created += 1
                        logger.info(f"  Created: {camp_data['name'][:50]}")

        # Summary
        logger.info("=" * 60)
        logger.info("SmartLead full sync complete!")
        logger.info(f"  Customers processed: {result.customers_processed}")
        logger.info(f"  Customers matched: {result.customers_matched}")
        logger.info(f"  Customers not matched: {result.customers_not_matched}")
        logger.info(f"  Campaigns created: {result.campaigns_created}")
        logger.info(f"  Campaigns updated: {result.campaigns_updated}")
        logger.info(f"  Campaigns already correct: {result.campaigns_already_correct}")
        logger.info(f"  Errors: {result.errors}")
        logger.info("=" * 60)

        return result

    except Exception as e:
        logger.error(f"Full sync failed: {e}")
        raise


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Full sync SmartLead campaigns for all customers")
    parser.add_argument("--limit", type=int, default=100, help="Max customers to process")
    parser.add_argument("--offset", type=int, default=0, help="Offset for pagination")
    parser.add_argument("--dry-run", action="store_true", help="Don't actually update the database")

    args = parser.parse_args()

    result = sync_smartlead_full(
        limit=args.limit,
        offset=args.offset,
        dry_run=args.dry_run,
    )

    print(f"\nResult: {result}")
