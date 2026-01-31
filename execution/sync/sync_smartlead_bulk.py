"""
SmartLead Bulk Sync - Fast import of all campaigns without analytics

This script quickly imports all SmartLead campaigns into the database
by skipping individual analytics calls. Analytics can be backfilled later.

Usage:
    python -m execution.sync.sync_smartlead_bulk
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
class BulkSyncResult:
    """Results from the bulk sync."""
    smartlead_campaigns: int = 0
    smartlead_clients: int = 0
    customers_matched: int = 0
    campaigns_created: int = 0
    campaigns_updated: int = 0
    campaigns_already_exists: int = 0
    errors: int = 0


def normalize_email(email: str) -> str:
    """Normalize email for comparison."""
    if not email:
        return ""
    return email.strip().lower()


def sync_smartlead_bulk(
    dry_run: bool = False,
) -> BulkSyncResult:
    """
    Bulk sync all SmartLead campaigns to the database.

    This is optimized for speed - it skips analytics calls and just
    imports campaign metadata with SmartLead client linkage.
    """
    api_key = settings.smartlead_api_key
    if not api_key:
        raise ValueError("SMARTLEAD_API_KEY not configured")

    result = BulkSyncResult()

    logger.info("=" * 60)
    logger.info("Starting SmartLead BULK sync...")
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
        result.smartlead_clients = len(email_to_client)
        logger.info(f"Found {result.smartlead_clients} SmartLead clients with emails")

        # Step 2: Fetch all SmartLead campaigns
        logger.info("Fetching SmartLead campaigns...")
        sl_client = SmartLeadClient(api_key=api_key)
        all_sl_campaigns = sl_client.list_campaigns()
        result.smartlead_campaigns = len(all_sl_campaigns)
        logger.info(f"Found {result.smartlead_campaigns} SmartLead campaigns")

        # Build client_id -> campaigns lookup
        campaigns_by_client: Dict[int, List[Dict]] = {}
        for camp in all_sl_campaigns:
            client_id = camp.get("client_id")
            if client_id:
                if client_id not in campaigns_by_client:
                    campaigns_by_client[client_id] = []
                campaigns_by_client[client_id].append(camp)

        # Build client_id -> client_email lookup
        client_id_to_email = {}
        for email, client_info in email_to_client.items():
            client_id_to_email[client_info["id"]] = email

        logger.info(f"Campaigns distributed across {len(campaigns_by_client)} clients")

        # Step 3: Get all customers for email matching
        with engine.connect() as conn:
            customers_result = conn.execute(text("""
                SELECT customer_id::text, LOWER(email) as email
                FROM unified_customers
                WHERE email IS NOT NULL
            """))
            customer_email_to_id = {row[1]: row[0] for row in customers_result}

        logger.info(f"Loaded {len(customer_email_to_id)} customer emails for matching")

        # Step 4: Get existing campaigns
        with engine.connect() as conn:
            existing_result = conn.execute(text("""
                SELECT smartlead_campaign_id, id::text
                FROM campaigns
                WHERE smartlead_campaign_id IS NOT NULL
            """))
            existing_campaigns = {row[0]: row[1] for row in existing_result}

        logger.info(f"Found {len(existing_campaigns)} existing campaigns in DB")

        # Step 5: Process all campaigns
        campaigns_to_create = []
        campaigns_to_update = []

        for camp in all_sl_campaigns:
            sl_campaign_id = str(camp.get("id"))
            sl_client_id = camp.get("client_id")

            # Skip subsequences
            if camp.get("parent_campaign_id"):
                continue

            # Get client email
            sl_client_email = client_id_to_email.get(sl_client_id) if sl_client_id else None

            # Find matching customer
            customer_id = None
            if sl_client_email:
                customer_id = customer_email_to_id.get(sl_client_email)
                if customer_id:
                    result.customers_matched += 1

            # Check if campaign exists
            if sl_campaign_id in existing_campaigns:
                result.campaigns_already_exists += 1
                # Update with client info if needed
                campaigns_to_update.append({
                    "campaign_uuid": existing_campaigns[sl_campaign_id],
                    "customer_id": customer_id,
                    "sl_client_id": sl_client_id,
                    "sl_client_email": sl_client_email,
                    "name": camp.get("name", "Unknown"),
                    "status": camp.get("status", "").lower(),
                    "leads": int(camp.get("lead_count", 0) or 0),
                })
            else:
                # Create new campaign
                campaigns_to_create.append({
                    "id": str(uuid.uuid4()),
                    "customer_id": customer_id,
                    "sl_campaign_id": sl_campaign_id,
                    "sl_client_id": sl_client_id,
                    "sl_client_email": sl_client_email,
                    "name": camp.get("name", "Unknown"),
                    "status": camp.get("status", "").lower(),
                    "leads": int(camp.get("lead_count", 0) or 0),
                })

        logger.info(f"To create: {len(campaigns_to_create)}, To update: {len(campaigns_to_update)}")

        # Step 6: Batch insert new campaigns
        if not dry_run and campaigns_to_create:
            logger.info(f"Creating {len(campaigns_to_create)} new campaigns...")

            with engine.connect() as conn:
                batch_size = 100
                for i in range(0, len(campaigns_to_create), batch_size):
                    batch = campaigns_to_create[i:i + batch_size]

                    for camp in batch:
                        try:
                            if camp["customer_id"]:
                                conn.execute(text("""
                                    INSERT INTO campaigns (
                                        id, customer_id, smartlead_campaign_id, smartlead_client_id,
                                        smartlead_client_email, campaign_name, status, leads_count,
                                        created_at, updated_at, last_synced_at
                                    ) VALUES (
                                        CAST(:id AS UUID), CAST(:customer_id AS UUID), :sl_campaign_id,
                                        :sl_client_id, :sl_client_email, :name, :status, :leads,
                                        NOW(), NOW(), NOW()
                                    )
                                """), camp)
                            else:
                                conn.execute(text("""
                                    INSERT INTO campaigns (
                                        id, smartlead_campaign_id, smartlead_client_id,
                                        smartlead_client_email, campaign_name, status, leads_count,
                                        created_at, updated_at, last_synced_at
                                    ) VALUES (
                                        CAST(:id AS UUID), :sl_campaign_id,
                                        :sl_client_id, :sl_client_email, :name, :status, :leads,
                                        NOW(), NOW(), NOW()
                                    )
                                """), camp)
                            result.campaigns_created += 1
                        except Exception as e:
                            logger.error(f"Error creating campaign {camp['sl_campaign_id']}: {e}")
                            result.errors += 1

                    conn.commit()
                    logger.info(f"Created batch {i//batch_size + 1} ({min(i+batch_size, len(campaigns_to_create))}/{len(campaigns_to_create)})")

        # Step 7: Batch update existing campaigns
        if not dry_run and campaigns_to_update:
            logger.info(f"Updating {len(campaigns_to_update)} existing campaigns...")

            with engine.connect() as conn:
                batch_size = 100
                for i in range(0, len(campaigns_to_update), batch_size):
                    batch = campaigns_to_update[i:i + batch_size]

                    for camp in batch:
                        try:
                            if camp["customer_id"]:
                                conn.execute(text("""
                                    UPDATE campaigns SET
                                        customer_id = CAST(:customer_id AS UUID),
                                        smartlead_client_id = :sl_client_id,
                                        smartlead_client_email = :sl_client_email,
                                        campaign_name = :name,
                                        status = :status,
                                        leads_count = :leads,
                                        updated_at = NOW(),
                                        last_synced_at = NOW()
                                    WHERE id = CAST(:campaign_uuid AS UUID)
                                """), camp)
                            else:
                                conn.execute(text("""
                                    UPDATE campaigns SET
                                        customer_id = NULL,
                                        smartlead_client_id = :sl_client_id,
                                        smartlead_client_email = :sl_client_email,
                                        campaign_name = :name,
                                        status = :status,
                                        leads_count = :leads,
                                        updated_at = NOW(),
                                        last_synced_at = NOW()
                                    WHERE id = CAST(:campaign_uuid AS UUID)
                                """), camp)
                            result.campaigns_updated += 1
                        except Exception as e:
                            logger.error(f"Error updating campaign {camp['campaign_uuid']}: {e}")
                            result.errors += 1

                    conn.commit()
                    if (i // batch_size + 1) % 10 == 0:
                        logger.info(f"Updated batch {i//batch_size + 1}")

        # Summary
        logger.info("=" * 60)
        logger.info("SmartLead BULK sync complete!")
        logger.info(f"  SmartLead campaigns total: {result.smartlead_campaigns}")
        logger.info(f"  SmartLead clients: {result.smartlead_clients}")
        logger.info(f"  Customers matched: {result.customers_matched}")
        logger.info(f"  Campaigns created: {result.campaigns_created}")
        logger.info(f"  Campaigns updated: {result.campaigns_updated}")
        logger.info(f"  Already existed: {result.campaigns_already_exists}")
        logger.info(f"  Errors: {result.errors}")
        logger.info("=" * 60)

        return result

    except Exception as e:
        logger.error(f"Bulk sync failed: {e}")
        raise


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Bulk sync all SmartLead campaigns")
    parser.add_argument("--dry-run", action="store_true", help="Don't actually update the database")

    args = parser.parse_args()

    result = sync_smartlead_bulk(dry_run=args.dry_run)

    print(f"\nResult: {result}")
