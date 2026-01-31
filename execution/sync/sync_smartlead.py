"""
SmartLead sync script - Campaign Data

Syncs campaign data from SmartLead.ai and links to existing customers.
Each customer's campaigns are stored in the campaigns table.

Campaign names follow the pattern: "Customer Name - Date - Listkit"
We match campaigns to customers by parsing the customer name from campaign names.
"""

from datetime import datetime
from typing import Optional, Dict, Any, List, Set
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from loguru import logger
import uuid
import re

from execution.config import settings
from execution.clients.smartlead_client import SmartLeadClient
from execution.database.models import UnifiedCustomer, SyncLog, Campaign


def extract_client_name(campaign_name: str) -> Optional[str]:
    """
    Extract client name from campaign name.

    Campaign names follow patterns like:
    - "Client Name - 01/30/26 - Listkit"
    - "Client Name - 01/30/26 - Listkit (ID: 123)"
    - "Client Name (date info)"

    Returns:
        Client name or None if can't extract
    """
    if not campaign_name:
        return None

    # Pattern: "Client Name - Date - Listkit"
    match = re.match(r'^(.+?)\s*-\s*\d{1,2}/\d{1,2}/\d{2,4}', campaign_name)
    if match:
        return match.group(1).strip()

    # Pattern: Just take the first part before " - "
    parts = campaign_name.split(' - ')
    if parts:
        return parts[0].strip()

    return campaign_name.strip()


def normalize_name(name: str) -> str:
    """Normalize name for fuzzy matching."""
    if not name:
        return ""
    # Lowercase, remove special chars, collapse whitespace
    name = name.lower()
    name = re.sub(r'[^\w\s]', '', name)
    name = re.sub(r'\s+', ' ', name).strip()
    return name


def sync_smartlead(
    incremental: bool = True,
    limit_customers: Optional[int] = None,
    api_key: Optional[str] = None
) -> Dict[str, Any]:
    """
    Sync campaign data from SmartLead.ai to existing customers.

    The sync process:
    1. Fetch all campaigns from SmartLead
    2. Parse campaign name to extract customer name
    3. Match to customers by company name or name
    4. Fetch analytics for matched campaigns
    5. Create/update campaign records linked to customer_id

    Args:
        incremental: If True, only sync updated campaigns (not yet implemented)
        limit_customers: Limit number of customers to process (for testing)
        api_key: Override API key (for testing)

    Returns:
        Sync metrics dictionary
    """
    # Ensure limit_customers is int if provided
    if limit_customers is not None:
        limit_customers = int(limit_customers)

    logger.info("=" * 60)
    logger.info("Starting SmartLead sync...")
    logger.info("=" * 60)

    # Get API key
    smartlead_api_key = api_key or settings.smartlead_api_key
    if not smartlead_api_key:
        logger.error("SMARTLEAD_API_KEY not configured")
        return {"error": "SMARTLEAD_API_KEY not configured"}

    # Initialize database
    engine = create_engine(settings.database_url)
    Session = sessionmaker(bind=engine)
    db = Session()

    # Create sync log
    sync_log = SyncLog(
        source="smartlead",
        sync_type="incremental" if incremental else "full",
        status="running"
    )
    db.add(sync_log)
    db.commit()

    start_time = datetime.utcnow()
    metrics = {
        "campaigns_fetched": 0,
        "campaigns_created": 0,
        "campaigns_updated": 0,
        "campaigns_skipped": 0,
        "customers_matched": 0,
        "customers_not_found": 0,
        "errors": 0
    }

    try:
        # Initialize SmartLead client
        client = SmartLeadClient(api_key=smartlead_api_key)

        # Get all customers for matching
        customers = db.query(UnifiedCustomer).all()

        # Build lookup dictionaries for matching
        # Match by company name (normalized)
        customer_by_company: Dict[str, UnifiedCustomer] = {}
        customer_by_name: Dict[str, UnifiedCustomer] = {}

        for c in customers:
            if c.company_name:
                normalized = normalize_name(c.company_name)
                if normalized:
                    customer_by_company[normalized] = c
            if c.name:
                normalized = normalize_name(c.name)
                if normalized:
                    customer_by_name[normalized] = c

        logger.info(f"Loaded {len(customers)} customers for matching")
        logger.info(f"  - {len(customer_by_company)} by company name")
        logger.info(f"  - {len(customer_by_name)} by name")

        # Track which customers we've matched
        matched_customer_ids: Set[str] = set()

        # Fetch all campaigns
        logger.info("Fetching campaigns from SmartLead...")
        campaigns = client.list_campaigns()
        metrics["campaigns_fetched"] = len(campaigns)
        logger.info(f"Found {len(campaigns)} campaigns")

        # Process each campaign
        for campaign_data in campaigns:
            campaign_id = campaign_data.get("id")
            campaign_name = campaign_data.get("name", "Unknown Campaign")
            campaign_status = campaign_data.get("status", "").lower()

            # Skip subsequences (child campaigns)
            if campaign_data.get("parent_campaign_id"):
                logger.debug(f"Skipping subsequence campaign: {campaign_name}")
                continue

            # Extract client name from campaign name
            client_name = extract_client_name(campaign_name)
            if not client_name:
                logger.debug(f"Could not extract client name from: {campaign_name}")
                metrics["campaigns_skipped"] += 1
                continue

            normalized_client = normalize_name(client_name)

            # Try to match to a customer
            customer = customer_by_company.get(normalized_client) or customer_by_name.get(normalized_client)

            if not customer:
                # Try partial match
                for company_key, c in customer_by_company.items():
                    if normalized_client in company_key or company_key in normalized_client:
                        customer = c
                        break

            if not customer:
                metrics["customers_not_found"] += 1
                logger.debug(f"No customer match for: {client_name}")
                continue

            # Track matched customers
            customer_id_str = str(customer.customer_id)
            if customer_id_str not in matched_customer_ids:
                matched_customer_ids.add(customer_id_str)
                metrics["customers_matched"] += 1

            logger.info(f"Processing campaign: {campaign_name} -> {customer.company_name or customer.name}")

            try:
                # Get campaign analytics
                try:
                    analytics = client.get_campaign_analytics(campaign_id)
                except Exception as e:
                    logger.warning(f"Failed to fetch analytics for campaign {campaign_id}: {e}")
                    analytics = {}

                # Extract metrics from analytics
                sent_count = int(analytics.get("sent_count", analytics.get("sent", 0)) or 0)
                reply_count = int(analytics.get("reply_count", analytics.get("replied", 0)) or 0)
                bounce_count = int(analytics.get("bounce_count", analytics.get("bounced", 0)) or 0)
                positive_reply_count = int(analytics.get("positive_reply_count",
                                                          analytics.get("interested", 0)) or 0)

                # Get lead count from campaign data or analytics
                leads_count = int(analytics.get("total_leads", campaign_data.get("lead_count", 0)) or 0)

                # Check if campaign already exists for this customer
                existing_campaign = db.query(Campaign).filter(
                    Campaign.customer_id == customer.customer_id,
                    Campaign.smartlead_campaign_id == str(campaign_id)
                ).first()

                # Calculate rates
                reply_rate = (reply_count / sent_count * 100) if sent_count > 0 else None
                positive_reply_rate = (positive_reply_count / sent_count * 100) if sent_count > 0 else None
                bounce_rate = (bounce_count / sent_count * 100) if sent_count > 0 else None

                if existing_campaign:
                    # Update existing campaign
                    existing_campaign.campaign_name = campaign_name
                    existing_campaign.status = campaign_status
                    existing_campaign.leads_count = leads_count
                    existing_campaign.emails_sent = sent_count
                    existing_campaign.reply_count = reply_count
                    existing_campaign.positive_reply_count = positive_reply_count
                    existing_campaign.bounce_count = bounce_count
                    existing_campaign.reply_rate = reply_rate
                    existing_campaign.positive_reply_rate = positive_reply_rate
                    existing_campaign.bounce_rate = bounce_rate
                    existing_campaign.updated_at = datetime.utcnow()
                    existing_campaign.last_synced_at = datetime.utcnow()
                    metrics["campaigns_updated"] += 1
                    logger.info(f"  Updated campaign: {campaign_name}")
                else:
                    # Create new campaign record
                    new_campaign = Campaign(
                        id=uuid.uuid4(),
                        customer_id=customer.customer_id,
                        smartlead_campaign_id=str(campaign_id),
                        campaign_name=campaign_name,
                        status=campaign_status,
                        leads_count=leads_count,
                        emails_sent=sent_count,
                        reply_count=reply_count,
                        positive_reply_count=positive_reply_count,
                        bounce_count=bounce_count,
                        reply_rate=reply_rate,
                        positive_reply_rate=positive_reply_rate,
                        bounce_rate=bounce_rate,
                        created_at=datetime.utcnow(),
                        updated_at=datetime.utcnow(),
                        last_synced_at=datetime.utcnow()
                    )
                    db.add(new_campaign)
                    metrics["campaigns_created"] += 1
                    logger.info(f"  Created campaign: {campaign_name}")

                # Commit after each campaign
                db.commit()

                # Check limit
                if limit_customers and metrics["customers_matched"] >= limit_customers:
                    logger.info(f"Reached customer limit ({limit_customers}), stopping")
                    break

            except Exception as e:
                import traceback
                logger.error(f"Error processing campaign {campaign_id}: {e}")
                logger.error(f"Traceback: {traceback.format_exc()}")
                metrics["errors"] += 1
                metrics["campaigns_skipped"] += 1

            # Check limit
            if limit_customers and metrics["customers_matched"] >= limit_customers:
                break

        # Update sync log
        sync_log.status = "completed"
        sync_log.completed_at = datetime.utcnow()
        sync_log.records_synced = metrics["campaigns_created"] + metrics["campaigns_updated"]
        sync_log.records_created = metrics["campaigns_created"]
        sync_log.records_updated = metrics["campaigns_updated"]
        sync_log.records_skipped = metrics["campaigns_skipped"]
        sync_log.records_failed = metrics["errors"]
        sync_log.duration_seconds = (datetime.utcnow() - start_time).total_seconds()

        db.commit()

        logger.info("=" * 60)
        logger.info("SmartLead sync completed!")
        logger.info(f"  Campaigns fetched: {metrics['campaigns_fetched']}")
        logger.info(f"  Campaigns created: {metrics['campaigns_created']}")
        logger.info(f"  Campaigns updated: {metrics['campaigns_updated']}")
        logger.info(f"  Campaigns skipped: {metrics['campaigns_skipped']}")
        logger.info(f"  Customers matched: {metrics['customers_matched']}")
        logger.info(f"  Customers not found: {metrics['customers_not_found']}")
        logger.info(f"  Errors: {metrics['errors']}")
        logger.info(f"  Duration: {sync_log.duration_seconds:.2f}s")
        logger.info("=" * 60)

        return metrics

    except Exception as e:
        logger.error(f"SmartLead sync failed: {e}")
        sync_log.status = "failed"
        sync_log.error_message = str(e)
        sync_log.completed_at = datetime.utcnow()
        sync_log.duration_seconds = (datetime.utcnow() - start_time).total_seconds()
        db.commit()
        raise

    finally:
        db.close()


if __name__ == "__main__":
    # Run sync with limit for testing
    import sys

    limit = 100
    if len(sys.argv) > 1:
        limit = int(sys.argv[1])

    print(f"Running SmartLead sync with limit of {limit} customers...")
    result = sync_smartlead(limit_customers=limit)
    print(f"Result: {result}")
