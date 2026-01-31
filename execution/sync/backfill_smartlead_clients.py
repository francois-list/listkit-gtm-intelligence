"""
SmartLead Client Backfill Script

This script backfills existing campaigns with proper client linkage:
1. Fetches ALL SmartLead clients (builds clientId -> email mapping)
2. Fetches ALL SmartLead campaigns (builds campaignId -> clientId mapping)
3. For each campaign in our DB, updates with smartlead_client_id and smartlead_client_email
4. Matches to Supabase customer by email and updates customer_id if needed

This is idempotent - can be run multiple times safely.
"""

import json
import csv
from datetime import datetime
from typing import Dict, List, Any, Optional, Tuple
from dataclasses import dataclass
from pathlib import Path

from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker
from loguru import logger
import httpx

from execution.config import settings


@dataclass
class BackfillResult:
    """Results from the backfill operation."""
    total_campaigns_in_db: int = 0
    campaigns_updated: int = 0
    campaigns_skipped: int = 0
    customer_matches_found: int = 0
    customer_matches_updated: int = 0
    ambiguous_matches: int = 0
    missing_customer_matches: int = 0
    errors: int = 0
    failures: List[Dict[str, Any]] = None

    def __post_init__(self):
        if self.failures is None:
            self.failures = []


def normalize_email(email: str) -> str:
    """Normalize email for comparison: trim whitespace, lowercase."""
    if not email:
        return ""
    return email.strip().lower()


def fetch_all_smartlead_clients(api_key: str) -> Dict[int, Dict[str, Any]]:
    """
    Fetch ALL SmartLead clients and build a lookup map.

    Returns:
        Dict mapping client_id (int) -> client data with email
    """
    logger.info("Fetching all SmartLead clients...")

    url = "https://server.smartlead.ai/api/v1/client/"
    params = {"api_key": api_key}

    with httpx.Client(timeout=60.0) as client:
        response = client.get(url, params=params)
        response.raise_for_status()
        clients = response.json()

    client_map = {}
    for c in clients:
        client_id = c.get("id")
        if client_id:
            client_map[int(client_id)] = {
                "id": client_id,
                "email": normalize_email(c.get("email", "")),
                "name": c.get("name", ""),
            }

    logger.info(f"Fetched {len(client_map)} SmartLead clients")
    return client_map


def fetch_all_smartlead_campaigns(api_key: str) -> Dict[int, Dict[str, Any]]:
    """
    Fetch ALL SmartLead campaigns and build a lookup map.

    Returns:
        Dict mapping campaign_id (int) -> campaign data with client_id
    """
    logger.info("Fetching all SmartLead campaigns...")

    url = "https://server.smartlead.ai/api/v1/campaigns"
    params = {"api_key": api_key}

    with httpx.Client(timeout=60.0) as client:
        response = client.get(url, params=params)
        response.raise_for_status()
        campaigns = response.json()

    campaign_map = {}
    for c in campaigns:
        campaign_id = c.get("id")
        if campaign_id:
            campaign_map[int(campaign_id)] = {
                "id": campaign_id,
                "client_id": c.get("client_id"),
                "name": c.get("name", ""),
                "status": c.get("status", ""),
            }

    logger.info(f"Fetched {len(campaign_map)} SmartLead campaigns")
    return campaign_map


def build_customer_email_lookup(engine) -> Tuple[Dict[str, str], Dict[str, List[str]]]:
    """
    Build a lookup map from normalized email -> customer_id.
    Also tracks duplicate emails (shouldn't happen, but just in case).

    Returns:
        Tuple of:
        - email_to_customer: Dict[email -> customer_id]
        - duplicate_emails: Dict[email -> list of customer_ids] for ambiguous cases
    """
    logger.info("Building customer email lookup...")

    email_to_customer = {}
    duplicate_emails = {}

    with engine.connect() as conn:
        result = conn.execute(text("""
            SELECT customer_id::text, email
            FROM unified_customers
            WHERE email IS NOT NULL AND email != ''
        """))

        for row in result:
            customer_id = row[0]
            email = normalize_email(row[1])

            if email in email_to_customer:
                # Duplicate email - track as ambiguous
                if email not in duplicate_emails:
                    duplicate_emails[email] = [email_to_customer[email]]
                duplicate_emails[email].append(customer_id)
            else:
                email_to_customer[email] = customer_id

    logger.info(f"Built lookup for {len(email_to_customer)} customer emails")
    if duplicate_emails:
        logger.warning(f"Found {len(duplicate_emails)} duplicate email cases")

    return email_to_customer, duplicate_emails


def backfill_existing_campaigns(
    api_key: Optional[str] = None,
    batch_size: int = 100,
    dry_run: bool = False,
    output_dir: Optional[str] = None,
) -> BackfillResult:
    """
    Backfill existing campaigns in DB with SmartLead client data.

    Args:
        api_key: SmartLead API key (uses settings if not provided)
        batch_size: Number of campaigns to update per batch
        dry_run: If True, don't actually update the database
        output_dir: Directory to write failure reports (uses scratchpad if not provided)

    Returns:
        BackfillResult with metrics and failures
    """
    api_key = api_key or settings.smartlead_api_key
    if not api_key:
        raise ValueError("SMARTLEAD_API_KEY not configured")

    result = BackfillResult()

    logger.info("=" * 60)
    logger.info("Starting SmartLead client backfill...")
    logger.info(f"Dry run: {dry_run}")
    logger.info("=" * 60)

    # Initialize database
    engine = create_engine(settings.database_url)

    try:
        # Step 1: Fetch all SmartLead clients
        client_map = fetch_all_smartlead_clients(api_key)

        # Step 2: Fetch all SmartLead campaigns
        campaign_map = fetch_all_smartlead_campaigns(api_key)

        # Step 3: Build customer email lookup
        email_to_customer, duplicate_emails = build_customer_email_lookup(engine)

        # Step 4: Get all campaigns from our database
        with engine.connect() as conn:
            campaigns_result = conn.execute(text("""
                SELECT id::text, smartlead_campaign_id, customer_id::text, campaign_name,
                       smartlead_client_id, smartlead_client_email
                FROM campaigns
            """))
            db_campaigns = list(campaigns_result)

        result.total_campaigns_in_db = len(db_campaigns)
        logger.info(f"Found {result.total_campaigns_in_db} campaigns in database")

        # Step 5: Process each campaign
        updates = []

        for row in db_campaigns:
            campaign_uuid = row[0]
            sl_campaign_id_str = row[1]
            current_customer_id = row[2]
            campaign_name = row[3]
            existing_sl_client_id = row[4]
            existing_sl_client_email = row[5]

            # Parse SmartLead campaign ID
            try:
                sl_campaign_id = int(sl_campaign_id_str) if sl_campaign_id_str else None
            except (ValueError, TypeError):
                sl_campaign_id = None

            if not sl_campaign_id:
                result.failures.append({
                    "campaign_uuid": campaign_uuid,
                    "campaign_name": campaign_name,
                    "reason": "no_smartlead_campaign_id",
                })
                result.campaigns_skipped += 1
                continue

            # Look up campaign in SmartLead data
            sl_campaign = campaign_map.get(sl_campaign_id)
            if not sl_campaign:
                result.failures.append({
                    "campaign_uuid": campaign_uuid,
                    "campaign_name": campaign_name,
                    "smartlead_campaign_id": sl_campaign_id,
                    "reason": "campaign_not_found_in_smartlead",
                })
                result.campaigns_skipped += 1
                continue

            # Get client ID from campaign
            sl_client_id = sl_campaign.get("client_id")
            if not sl_client_id:
                result.failures.append({
                    "campaign_uuid": campaign_uuid,
                    "campaign_name": campaign_name,
                    "smartlead_campaign_id": sl_campaign_id,
                    "reason": "no_client_id_on_campaign",
                })
                result.campaigns_skipped += 1
                continue

            # Look up client email
            sl_client = client_map.get(int(sl_client_id))
            if not sl_client:
                result.failures.append({
                    "campaign_uuid": campaign_uuid,
                    "campaign_name": campaign_name,
                    "smartlead_campaign_id": sl_campaign_id,
                    "smartlead_client_id": sl_client_id,
                    "reason": "client_not_found_in_smartlead",
                })
                result.campaigns_skipped += 1
                continue

            sl_client_email = sl_client.get("email", "")

            # Find matching customer by email
            matched_customer_id = None
            match_reason = None

            if sl_client_email:
                if sl_client_email in duplicate_emails:
                    # Ambiguous match - multiple customers with same email
                    result.failures.append({
                        "campaign_uuid": campaign_uuid,
                        "campaign_name": campaign_name,
                        "smartlead_campaign_id": sl_campaign_id,
                        "smartlead_client_id": sl_client_id,
                        "smartlead_client_email": sl_client_email,
                        "reason": "ambiguous_customer_match",
                        "matching_customer_ids": duplicate_emails[sl_client_email],
                    })
                    result.ambiguous_matches += 1
                elif sl_client_email in email_to_customer:
                    matched_customer_id = email_to_customer[sl_client_email]
                    result.customer_matches_found += 1
                else:
                    result.failures.append({
                        "campaign_uuid": campaign_uuid,
                        "campaign_name": campaign_name,
                        "smartlead_campaign_id": sl_campaign_id,
                        "smartlead_client_id": sl_client_id,
                        "smartlead_client_email": sl_client_email,
                        "reason": "no_customer_with_email",
                    })
                    result.missing_customer_matches += 1
            else:
                result.failures.append({
                    "campaign_uuid": campaign_uuid,
                    "campaign_name": campaign_name,
                    "smartlead_campaign_id": sl_campaign_id,
                    "smartlead_client_id": sl_client_id,
                    "reason": "client_has_no_email",
                })
                result.missing_customer_matches += 1

            # Prepare update
            needs_update = False
            update_data = {
                "campaign_uuid": campaign_uuid,
                "smartlead_client_id": int(sl_client_id),
                "smartlead_client_email": sl_client_email,
            }

            # Check if we need to update client fields
            if existing_sl_client_id != int(sl_client_id) or existing_sl_client_email != sl_client_email:
                needs_update = True

            # IMPORTANT: Set customer_id based ONLY on SmartLead client email match
            # If no match, clear the customer_id (set to None) to remove incorrect links
            if matched_customer_id:
                if matched_customer_id != current_customer_id:
                    update_data["customer_id"] = matched_customer_id
                    result.customer_matches_updated += 1
                    needs_update = True
                else:
                    update_data["customer_id"] = matched_customer_id
            else:
                # No customer match - clear any existing customer_id
                if current_customer_id is not None:
                    update_data["customer_id"] = None  # Clear incorrect link
                    needs_update = True
                    logger.debug(f"Clearing customer_id for campaign {campaign_name} (no customer with email {sl_client_email})")

            if needs_update:
                updates.append(update_data)

        # Step 6: Batch update
        if not dry_run and updates:
            logger.info(f"Applying {len(updates)} updates...")

            with engine.connect() as conn:
                for i in range(0, len(updates), batch_size):
                    batch = updates[i:i + batch_size]

                    for update in batch:
                        try:
                            if "customer_id" in update:
                                if update["customer_id"] is None:
                                    # Clear customer_id (set to NULL)
                                    conn.execute(
                                        text("""
                                            UPDATE campaigns
                                            SET smartlead_client_id = :sl_client_id,
                                                smartlead_client_email = :sl_client_email,
                                                customer_id = NULL,
                                                updated_at = NOW()
                                            WHERE id = CAST(:campaign_uuid AS UUID)
                                        """),
                                        {
                                            "sl_client_id": update["smartlead_client_id"],
                                            "sl_client_email": update["smartlead_client_email"],
                                            "campaign_uuid": update["campaign_uuid"],
                                        }
                                    )
                                else:
                                    # Set customer_id to matched customer
                                    conn.execute(
                                        text("""
                                            UPDATE campaigns
                                            SET smartlead_client_id = :sl_client_id,
                                                smartlead_client_email = :sl_client_email,
                                                customer_id = CAST(:customer_id AS UUID),
                                                updated_at = NOW()
                                            WHERE id = CAST(:campaign_uuid AS UUID)
                                        """),
                                        {
                                            "sl_client_id": update["smartlead_client_id"],
                                            "sl_client_email": update["smartlead_client_email"],
                                            "customer_id": update["customer_id"],
                                            "campaign_uuid": update["campaign_uuid"],
                                        }
                                    )
                            else:
                                conn.execute(
                                    text("""
                                        UPDATE campaigns
                                        SET smartlead_client_id = :sl_client_id,
                                            smartlead_client_email = :sl_client_email,
                                            updated_at = NOW()
                                        WHERE id = CAST(:campaign_uuid AS UUID)
                                    """),
                                    {
                                        "sl_client_id": update["smartlead_client_id"],
                                        "sl_client_email": update["smartlead_client_email"],
                                        "campaign_uuid": update["campaign_uuid"],
                                    }
                                )
                            result.campaigns_updated += 1
                        except Exception as e:
                            logger.error(f"Error updating campaign {update['campaign_uuid']}: {e}")
                            result.errors += 1
                            result.failures.append({
                                "campaign_uuid": update["campaign_uuid"],
                                "reason": "update_error",
                                "error": str(e),
                            })

                    conn.commit()
                    logger.info(f"  Updated batch {i//batch_size + 1}/{(len(updates) + batch_size - 1)//batch_size}")
        elif dry_run:
            result.campaigns_updated = len(updates)
            logger.info(f"[DRY RUN] Would update {len(updates)} campaigns")

        # Step 7: Write failures report
        if result.failures:
            output_path = Path(output_dir) if output_dir else Path("/private/tmp/claude-502")
            output_path.mkdir(parents=True, exist_ok=True)

            # JSON report
            json_path = output_path / f"backfill_failures_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
            with open(json_path, "w") as f:
                json.dump(result.failures, f, indent=2)
            logger.info(f"Failures report written to: {json_path}")

            # CSV report for easy viewing
            csv_path = output_path / f"backfill_failures_{datetime.now().strftime('%Y%m%d_%H%M%S')}.csv"
            with open(csv_path, "w", newline="") as f:
                if result.failures:
                    # Collect all unique field names across all failures
                    all_fields = set()
                    for failure in result.failures:
                        all_fields.update(failure.keys())
                    writer = csv.DictWriter(f, fieldnames=sorted(all_fields))
                    writer.writeheader()
                    writer.writerows(result.failures)
            logger.info(f"Failures CSV written to: {csv_path}")

        # Summary
        logger.info("=" * 60)
        logger.info("SmartLead client backfill complete!")
        logger.info(f"  Total campaigns in DB: {result.total_campaigns_in_db}")
        logger.info(f"  Campaigns updated: {result.campaigns_updated}")
        logger.info(f"  Campaigns skipped: {result.campaigns_skipped}")
        logger.info(f"  Customer matches found: {result.customer_matches_found}")
        logger.info(f"  Customer matches updated: {result.customer_matches_updated}")
        logger.info(f"  Ambiguous matches: {result.ambiguous_matches}")
        logger.info(f"  Missing customer matches: {result.missing_customer_matches}")
        logger.info(f"  Errors: {result.errors}")
        logger.info("=" * 60)

        return result

    except Exception as e:
        logger.error(f"Backfill failed: {e}")
        raise


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Backfill SmartLead client data for existing campaigns")
    parser.add_argument("--dry-run", action="store_true", help="Don't actually update the database")
    parser.add_argument("--batch-size", type=int, default=100, help="Batch size for updates")
    parser.add_argument("--output-dir", type=str, help="Directory for failure reports")

    args = parser.parse_args()

    result = backfill_existing_campaigns(
        dry_run=args.dry_run,
        batch_size=args.batch_size,
        output_dir=args.output_dir,
    )

    print(f"\nResult: {result}")
