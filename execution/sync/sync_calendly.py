"""
Calendly sync script

Syncs call booking and attendance data from Calendly including:
- Scheduled events
- Show rates and no-shows
- Event organizer (AM) assignment
- Call completion metrics

Creates new customers if invitee email not found in database.
"""

from datetime import datetime
from typing import Optional, Dict, Any, List
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.orm.attributes import flag_modified
from loguru import logger

from execution.config import settings
from execution.clients.calendly_client import CalendlyClient
from execution.database.models import UnifiedCustomer, SyncLog
from execution.health_calculator import calculate_health_score


def sync_calendly(
    incremental: bool = True,
    days_back: int = 90,
    days_forward: int = 30
) -> Dict[str, Any]:
    """
    Sync call booking data from Calendly.

    Args:
        incremental: If True, only sync recent events
        days_back: Number of days to look back for events
        days_forward: Number of days to look forward for events

    Returns:
        Sync metrics dictionary
    """
    logger.info("=" * 60)
    logger.info("Starting Calendly sync...")
    logger.info("=" * 60)

    # Check for API key
    if not settings.calendly_api_key:
        logger.error("CALENDLY_API_KEY not configured")
        return {"error": "CALENDLY_API_KEY not configured"}

    # Initialize database
    engine = create_engine(settings.database_url)
    Session = sessionmaker(bind=engine)
    db = Session()

    # Create sync log
    sync_log = SyncLog(
        source="calendly",
        sync_type="incremental" if incremental else "full",
        status="running"
    )
    db.add(sync_log)
    db.commit()

    start_time = datetime.utcnow()
    metrics = {
        "events_processed": 0,
        "invitees_processed": 0,
        "customers_created": 0,
        "customers_updated": 0,
        "customers_skipped": 0,
        "errors": 0
    }

    try:
        # Initialize Calendly client
        client = CalendlyClient(api_key=settings.calendly_api_key)

        # Get current user info
        logger.info("Authenticating with Calendly...")
        user = client.get_current_user()
        logger.info(f"Authenticated as: {user.get('name')} ({user.get('email')})")

        # Fetch all events with invitees
        logger.info(f"Fetching events from last {days_back} days and next {days_forward} days...")
        events = list(client.get_all_events_with_invitees(
            days_back=days_back,
            days_forward=days_forward,
            include_canceled=True
        ))
        metrics["events_processed"] = len(events)
        logger.info(f"Found {len(events)} events")

        # OPTIMIZATION: Pre-load existing customer emails
        logger.info("Loading existing customer emails from database...")
        existing_customers = db.query(UnifiedCustomer.email).filter(
            UnifiedCustomer.email.isnot(None)
        ).all()
        existing_emails = {c.email.lower().strip() for c in existing_customers if c.email}
        logger.info(f"Found {len(existing_emails)} existing customers to match against")

        # Aggregate by email
        logger.info("Aggregating events by invitee email...")
        email_data = client.aggregate_events_by_email(events)
        logger.info(f"Found {len(email_data)} unique invitees")

        # Filter to only existing customers
        matching_emails = {email: data for email, data in email_data.items()
                         if email.lower().strip() in existing_emails}
        logger.info(f"Filtered to {len(matching_emails)} invitees that match existing customers")

        # Process each matching invitee
        for email, data in matching_emails.items():
            try:
                process_existing_customer_calendly(db, email, data, metrics)
                metrics["invitees_processed"] += 1
            except Exception as e:
                logger.error(f"Error processing invitee {email}: {e}")
                metrics["errors"] += 1
                metrics["customers_skipped"] += 1
                # Rollback failed transaction so we can continue
                try:
                    db.rollback()
                except:
                    pass

        # Update sync log
        sync_log.status = "completed"
        sync_log.completed_at = datetime.utcnow()
        sync_log.records_synced = metrics["invitees_processed"]
        sync_log.records_created = metrics["customers_created"]
        sync_log.records_updated = metrics["customers_updated"]
        sync_log.records_skipped = metrics["customers_skipped"]
        sync_log.records_failed = metrics["errors"]
        sync_log.duration_seconds = (datetime.utcnow() - start_time).total_seconds()

        db.commit()

        logger.info("=" * 60)
        logger.info("Calendly sync completed!")
        logger.info(f"  Events processed: {metrics['events_processed']}")
        logger.info(f"  Invitees processed: {metrics['invitees_processed']}")
        logger.info(f"  Customers created: {metrics['customers_created']}")
        logger.info(f"  Customers updated: {metrics['customers_updated']}")
        logger.info(f"  Skipped: {metrics['customers_skipped']}")
        logger.info(f"  Errors: {metrics['errors']}")
        logger.info(f"  Duration: {sync_log.duration_seconds:.2f}s")
        logger.info("=" * 60)

        return metrics

    except Exception as e:
        logger.error(f"Calendly sync failed: {e}")
        sync_log.status = "failed"
        sync_log.error_message = str(e)
        db.commit()
        raise

    finally:
        db.close()


def process_existing_customer_calendly(
    db: Any,
    email: str,
    data: Dict[str, Any],
    metrics: Dict[str, Any]
) -> None:
    """
    Process Calendly data for an existing customer only.

    This optimized version only updates customers that already exist in the database.

    Args:
        db: Database session
        email: Invitee email address
        data: Aggregated event data for this invitee
        metrics: Metrics dictionary to update
    """
    email = email.lower().strip()

    if not email:
        logger.debug("Empty email, skipping")
        metrics["customers_skipped"] += 1
        return

    # Skip internal/host emails - only process external guests (customers)
    internal_domains = ["listkit.io", "listkit.com", "knowledgex.us"]
    domain = email.split("@")[-1] if "@" in email else ""
    if domain in internal_domains:
        logger.debug(f"Skipping internal email: {email}")
        metrics["customers_skipped"] += 1
        return

    # Get existing customer (we pre-filtered, so should always exist)
    customer = db.query(UnifiedCustomer).filter(
        UnifiedCustomer.email == email
    ).first()

    if customer is None:
        logger.debug(f"Customer not found for {email}, skipping")
        metrics["customers_skipped"] += 1
        return

    metrics["customers_updated"] += 1
    logger.debug(f"~ Updating customer from Calendly: {email}")

    # Update Calendly-specific fields
    customer.total_calls_booked = data.get("total_calls_booked", 0)
    customer.calls_completed = data.get("calls_completed", 0)
    customer.calls_no_show = data.get("calls_no_show", 0)
    customer.calls_canceled = data.get("calls_canceled", 0)
    customer.calls_rescheduled = data.get("calls_rescheduled", 0)

    # Show rate
    if data.get("show_rate") is not None:
        customer.show_rate = data["show_rate"]

    # Last call date
    if data.get("last_call_date"):
        customer.last_call_date = data["last_call_date"]

    # Next call date
    if data.get("next_call_date"):
        customer.next_call_date = data["next_call_date"]

    # Update AM assignment from last call organizer
    if data.get("last_organizer"):
        # Only update if we don't already have an AM from HubSpot/Airtable
        # Calendly organizer is secondary source
        if not customer.assigned_am or customer.assigned_am == "Unassigned":
            customer.assigned_am = data["last_organizer"]
        if data.get("last_organizer_email"):
            customer.assigned_am_email = data["last_organizer_email"]

    # Update last seen based on last call
    if data.get("last_call_date"):
        if customer.last_seen_at is None or data["last_call_date"] > customer.last_seen_at:
            customer.last_seen_at = data["last_call_date"]
            customer.days_since_seen = (datetime.utcnow() - data["last_call_date"]).days

    # Store detailed event history in custom attributes
    if customer.custom_attributes is None:
        customer.custom_attributes = {}

    # Store last 10 events for reference
    recent_events = sorted(
        data.get("events", []),
        key=lambda x: x.get("start_time") or datetime.min,
        reverse=True
    )[:10]

    customer.custom_attributes["calendly_events"] = [
        {
            "event_name": e.get("event_name"),
            "start_time": e.get("start_time").isoformat() if e.get("start_time") else None,
            "status": e.get("status"),
            "organizer": e.get("organizer"),
            "no_show": e.get("no_show"),
            "canceled": e.get("canceled")
        }
        for e in recent_events
    ]

    # Process questionnaire responses
    questionnaire_responses = data.get("questionnaire_responses", [])
    if questionnaire_responses:
        # Store all responses in custom_attributes
        customer.custom_attributes["calendly_questionnaire"] = questionnaire_responses

        # Extract key business info from most recent responses
        # Create a dict of question -> most recent answer
        latest_answers = {}
        for resp in questionnaire_responses:
            question = resp.get("question", "")
            answer = resp.get("answer", "")
            if question and answer:
                # Keep the response (list is already sorted by date in aggregate)
                if question not in latest_answers:
                    latest_answers[question] = answer

        # Map specific questions to customer fields
        # Growth goals
        growth_goals_q = "What are your growth goals with using ListKit?"
        if growth_goals_q in latest_answers:
            customer.custom_attributes["growth_goals"] = latest_answers[growth_goals_q]

        # What they sell (client_offer)
        offer_q = "What does your company sell and who does it help?"
        if offer_q in latest_answers and not customer.client_offer:
            customer.client_offer = latest_answers[offer_q][:500]  # Limit length

        # ICP (client_icp)
        icp_q = "Who's your perfect customer? Think about your favorite customer - what type of company are they, what role does your contact have there, and what made them such a great fit?"
        if icp_q in latest_answers and not customer.client_icp:
            customer.client_icp = latest_answers[icp_q][:500]  # Limit length

        # LTV (client_ltv) - try to parse numeric value
        ltv_q = "What is the lifetime value (LTV) of your clients?"
        if ltv_q in latest_answers and not customer.client_ltv:
            ltv_str = latest_answers[ltv_q]
            try:
                # Extract numbers from string (e.g., "$30,000" -> 30000)
                import re
                # Remove commas first, then find digits
                clean_str = ltv_str.replace(',', '')
                numbers = re.findall(r'\d+', clean_str)
                if numbers:
                    customer.client_ltv = int(numbers[0])
            except (ValueError, IndexError):
                pass

        # Leads per month
        leads_q = "How many leads do you want to send cold emails to per month?"
        if leads_q in latest_answers:
            customer.custom_attributes["leads_per_month"] = latest_answers[leads_q]

        # Current email tool
        email_tool_q = "Where are you currently sending emails from?"
        if email_tool_q in latest_answers:
            customer.custom_attributes["email_tool"] = latest_answers[email_tool_q]

        # Phone number
        phone_q = "What is your phone number?"
        if phone_q in latest_answers:
            customer.custom_attributes["phone_from_calendly"] = latest_answers[phone_q]

        logger.debug(f"Processed {len(questionnaire_responses)} questionnaire responses for {email}")

    # Update sync timestamp
    customer.last_calendly_sync = datetime.utcnow()

    # Flag custom_attributes as modified so SQLAlchemy detects JSONB changes
    flag_modified(customer, 'custom_attributes')

    # Commit changes
    db.commit()

    # Recalculate health score (call metrics impact health)
    try:
        calculate_health_score(customer)
        db.commit()
    except Exception as e:
        logger.warning(f"Error calculating health score for {email}: {e}")


def sync_calendly_for_customer(
    db: Any,
    customer: UnifiedCustomer,
    client: CalendlyClient
) -> bool:
    """
    Sync Calendly data for a specific customer by email.

    Args:
        db: Database session
        customer: Customer to sync
        client: CalendlyClient instance

    Returns:
        True if any data was updated
    """
    if not customer.email:
        return False

    logger.info(f"Syncing Calendly for {customer.email}")

    # Fetch all events
    events = list(client.get_all_events_with_invitees(
        days_back=365,  # Look back further for individual sync
        days_forward=30
    ))

    # Aggregate by email
    email_data = client.aggregate_events_by_email(events)

    # Find this customer's data
    data = email_data.get(customer.email.lower())

    if not data:
        logger.debug(f"No Calendly events found for {customer.email}")
        return False

    # Update fields
    customer.total_calls_booked = data.get("total_calls_booked", 0)
    customer.calls_completed = data.get("calls_completed", 0)
    customer.calls_no_show = data.get("calls_no_show", 0)
    customer.calls_canceled = data.get("calls_canceled", 0)
    customer.calls_rescheduled = data.get("calls_rescheduled", 0)

    if data.get("show_rate") is not None:
        customer.show_rate = data["show_rate"]

    if data.get("last_call_date"):
        customer.last_call_date = data["last_call_date"]

    if data.get("next_call_date"):
        customer.next_call_date = data["next_call_date"]

    if data.get("last_organizer") and not customer.assigned_am:
        customer.assigned_am = data["last_organizer"]

    customer.last_calendly_sync = datetime.utcnow()
    db.commit()

    return True


if __name__ == "__main__":
    # Run sync
    import sys

    # Parse arguments
    incremental = "--full" not in sys.argv
    days_back = 90

    for arg in sys.argv:
        if arg.startswith("--days="):
            days_back = int(arg.split("=")[1])

    try:
        metrics = sync_calendly(
            incremental=incremental,
            days_back=days_back
        )
        print(f"\n✓ Calendly sync completed: {metrics}")
        sys.exit(0)
    except Exception as e:
        print(f"\n✗ Calendly sync failed: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
