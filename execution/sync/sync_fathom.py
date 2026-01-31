"""
Fathom sync script

Syncs call recordings and transcripts from Fathom including:
- Recording metadata
- AI summaries and insights
- Participant information
- Links to Calendly events

Creates/updates customer records with call insights.
"""

from datetime import datetime, timedelta
from typing import Optional, Dict, Any, List
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from loguru import logger

from execution.config import settings
from execution.clients.fathom_client import FathomClient
from execution.database.models import UnifiedCustomer, SyncLog
from execution.health_calculator import calculate_health_score


def sync_fathom(
    incremental: bool = True,
    days_back: int = 90
) -> Dict[str, Any]:
    """
    Sync call recordings and insights from Fathom.

    Args:
        incremental: If True, only sync recent calls
        days_back: Number of days to look back

    Returns:
        Sync metrics dictionary
    """
    logger.info("=" * 60)
    logger.info("Starting Fathom sync...")
    logger.info("=" * 60)

    # Check for API key
    if not settings.fathom_api_key:
        logger.error("FATHOM_API_KEY not configured")
        return {"error": "FATHOM_API_KEY not configured"}

    # Initialize database
    engine = create_engine(settings.database_url)
    Session = sessionmaker(bind=engine)
    db = Session()

    # Create sync log
    sync_log = SyncLog(
        source="fathom",
        sync_type="incremental" if incremental else "full",
        status="running"
    )
    db.add(sync_log)
    db.commit()

    start_time = datetime.utcnow()
    metrics = {
        "calls_processed": 0,
        "participants_processed": 0,
        "customers_created": 0,
        "customers_updated": 0,
        "customers_skipped": 0,
        "cancel_mentions_found": 0,
        "errors": 0
    }

    try:
        # Initialize Fathom client
        client = FathomClient(api_key=settings.fathom_api_key)

        # Fetch all calls
        logger.info(f"Fetching calls from last {days_back} days...")
        calls = list(client.iter_all_calls(days_back=days_back))
        metrics["calls_processed"] = len(calls)
        logger.info(f"Found {len(calls)} calls")

        # Aggregate by email
        logger.info("Aggregating calls by participant email...")
        email_data = client.aggregate_calls_by_email(calls)
        logger.info(f"Found {len(email_data)} unique participants")

        # Process each participant
        for email, data in email_data.items():
            try:
                # Sort calls by date for recency tracking
                recent_calls = sorted(
                    data.get("calls", []),
                    key=lambda x: x.get("date") or datetime.min,
                    reverse=True
                )

                # Note: We skip fetching individual call details since the list
                # response already contains summary info and the API endpoint
                # format differs from recording_id

                process_fathom_participant(db, email, data, metrics)
                metrics["participants_processed"] += 1
            except Exception as e:
                logger.error(f"Error processing participant {email}: {e}")
                metrics["errors"] += 1
                metrics["customers_skipped"] += 1
                # Rollback any failed transaction
                try:
                    db.rollback()
                except:
                    pass

        # Update sync log
        sync_log.status = "completed"
        sync_log.completed_at = datetime.utcnow()
        sync_log.records_synced = metrics["participants_processed"]
        sync_log.records_created = metrics["customers_created"]
        sync_log.records_updated = metrics["customers_updated"]
        sync_log.records_skipped = metrics["customers_skipped"]
        sync_log.records_failed = metrics["errors"]
        sync_log.duration_seconds = (datetime.utcnow() - start_time).total_seconds()

        db.commit()

        logger.info("=" * 60)
        logger.info("Fathom sync completed!")
        logger.info(f"  Calls processed: {metrics['calls_processed']}")
        logger.info(f"  Participants processed: {metrics['participants_processed']}")
        logger.info(f"  Customers created: {metrics['customers_created']}")
        logger.info(f"  Customers updated: {metrics['customers_updated']}")
        logger.info(f"  Cancel mentions found: {metrics['cancel_mentions_found']}")
        logger.info(f"  Errors: {metrics['errors']}")
        logger.info(f"  Duration: {sync_log.duration_seconds:.2f}s")
        logger.info("=" * 60)

        return metrics

    except Exception as e:
        logger.error(f"Fathom sync failed: {e}")
        sync_log.status = "failed"
        sync_log.error_message = str(e)
        db.commit()
        raise

    finally:
        db.close()


def process_fathom_participant(
    db: Any,
    email: str,
    data: Dict[str, Any],
    metrics: Dict[str, Any]
) -> None:
    """
    Process a single Fathom participant.

    Args:
        db: Database session
        email: Participant email
        data: Aggregated call data
        metrics: Metrics dictionary to update
    """
    email = email.lower().strip()

    if not email:
        metrics["customers_skipped"] += 1
        return

    # Skip internal emails (customize as needed)
    internal_domains = ["listkit.io", "listkit.com"]
    domain = email.split("@")[-1]
    if domain in internal_domains:
        logger.debug(f"Skipping internal email: {email}")
        metrics["customers_skipped"] += 1
        return

    # Check if customer exists
    customer = db.query(UnifiedCustomer).filter(
        UnifiedCustomer.email == email
    ).first()

    is_new = customer is None

    if is_new:
        # Create new customer from Fathom data
        customer = UnifiedCustomer(email=email)
        db.add(customer)
        metrics["customers_created"] += 1
        logger.info(f"+ Creating new customer from Fathom: {email}")

        # Set name if available
        if data.get("name"):
            customer.name = data["name"]
        else:
            customer.name = email.split("@")[0]

        # Set company from email domain
        if domain not in ["gmail.com", "yahoo.com", "hotmail.com", "outlook.com", "icloud.com"]:
            company = domain.split(".")[0].title()
            customer.company_name = company

        customer.acquisition_source = "fathom_call"
    else:
        metrics["customers_updated"] += 1
        logger.debug(f"~ Updating customer from Fathom: {email}")

    # Update call recording metrics
    if customer.custom_attributes is None:
        customer.custom_attributes = {}

    customer.custom_attributes["fathom_calls_count"] = data.get("total_calls", 0)
    customer.custom_attributes["fathom_total_duration_minutes"] = data.get("total_duration_minutes", 0)

    if data.get("last_call_date"):
        customer.custom_attributes["fathom_last_call_date"] = data["last_call_date"].isoformat()
        customer.custom_attributes["fathom_last_call_title"] = data.get("last_call_title")

        # Update last_seen if this is more recent
        if customer.last_seen_at is None or data["last_call_date"] > customer.last_seen_at:
            customer.last_seen_at = data["last_call_date"]
            customer.days_since_seen = (datetime.utcnow() - data["last_call_date"]).days

    # Store recent calls
    recent_calls = sorted(
        data.get("calls", []),
        key=lambda x: x.get("date") or datetime.min,
        reverse=True
    )[:10]

    customer.custom_attributes["fathom_recent_calls"] = [
        {
            "call_id": c.get("call_id"),
            "title": c.get("title"),
            "date": c.get("date").isoformat() if c.get("date") else None,
            "duration_minutes": c.get("duration_minutes"),
            "url": c.get("url"),
            "share_url": c.get("share_url"),
            "recorded_by": c.get("recorded_by")
        }
        for c in recent_calls
    ]

    # Store who recorded the most recent call (AM info)
    if data.get("recorded_by"):
        customer.custom_attributes["fathom_last_recorded_by"] = data["recorded_by"]

    # Process insights from latest call
    insights = data.get("latest_insights", {})
    if insights:
        customer.custom_attributes["fathom_latest_summary"] = insights.get("summary_text")
        customer.custom_attributes["fathom_latest_key_points"] = insights.get("key_points", [])
        customer.custom_attributes["fathom_latest_action_items"] = insights.get("action_items", [])
        customer.custom_attributes["fathom_latest_sentiment"] = insights.get("sentiment")
        customer.custom_attributes["fathom_topics"] = insights.get("topics", [])

        # If cancel was mentioned, flag it
        if insights.get("mentioned_cancel"):
            customer.mentioned_cancel = True
            logger.warning(f"Cancel mention detected in Fathom call for {email}")

        # Update support sentiment from call sentiment
        if insights.get("sentiment"):
            customer.support_sentiment = insights["sentiment"]

    # Update sync timestamp
    customer.last_fathom_sync = datetime.utcnow()

    db.commit()

    # Recalculate health score
    try:
        calculate_health_score(customer)
        db.commit()
    except Exception as e:
        logger.warning(f"Error calculating health score for {email}: {e}")


def link_fathom_to_calendly(
    db: Any,
    customer: UnifiedCustomer,
    fathom_client: FathomClient
) -> int:
    """
    Link Fathom recordings to Calendly events for a customer.

    Matches by:
    - Participant email
    - Time proximity (within 15 minutes of scheduled time)

    Args:
        db: Database session
        customer: Customer to process
        fathom_client: FathomClient instance

    Returns:
        Number of recordings linked
    """
    if not customer.email:
        return 0

    if customer.custom_attributes is None:
        customer.custom_attributes = {}

    # Get Calendly events
    calendly_events = customer.custom_attributes.get("calendly_events", [])
    if not calendly_events:
        return 0

    # Get Fathom calls for this email
    fathom_calls = fathom_client.get_calls_by_participant_email(
        customer.email,
        days_back=180
    )

    if not fathom_calls:
        return 0

    linked_count = 0
    linked_events = []

    for event in calendly_events:
        event_time_str = event.get("start_time")
        if not event_time_str:
            continue

        try:
            event_time = datetime.fromisoformat(event_time_str)
        except:
            continue

        # Find matching Fathom call
        for call in fathom_calls:
            call_time_str = call.get("date") or call.get("created_at")
            if not call_time_str:
                continue

            try:
                call_time = datetime.fromisoformat(call_time_str.replace("Z", "+00:00"))
                call_time = call_time.replace(tzinfo=None)
            except:
                continue

            # Check if within 15 minute window
            time_diff = abs((call_time - event_time).total_seconds())
            if time_diff <= 900:  # 15 minutes
                linked_events.append({
                    "calendly_event": event,
                    "fathom_call_id": call.get("id"),
                    "fathom_title": call.get("title"),
                    "fathom_duration": call.get("duration_minutes"),
                    "time_diff_seconds": time_diff
                })
                linked_count += 1
                break

    customer.custom_attributes["calendly_fathom_links"] = linked_events

    return linked_count


if __name__ == "__main__":
    import sys

    incremental = "--full" not in sys.argv
    days_back = 90

    for arg in sys.argv:
        if arg.startswith("--days="):
            days_back = int(arg.split("=")[1])

    try:
        metrics = sync_fathom(
            incremental=incremental,
            days_back=days_back
        )
        print(f"\n✓ Fathom sync completed: {metrics}")
        sys.exit(0)
    except Exception as e:
        print(f"\n✗ Fathom sync failed: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
