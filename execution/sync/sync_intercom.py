"""
Intercom sync script - Phase 1

Syncs customer data from Intercom including:
- Contact profile information
- Stripe revenue data (from Intercom custom attributes)
- Support conversation metrics
- Cancel mention detection
"""

from datetime import datetime
from typing import Optional, Dict, Any, List
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.orm.attributes import flag_modified
from loguru import logger

from execution.config import settings
from execution.clients.intercom_client import IntercomClient
from execution.database.models import UnifiedCustomer, SyncLog
from execution.health_calculator import calculate_health_score
from execution.slack_notifier import SlackNotifier


# Cancel keywords for detection
CANCEL_KEYWORDS = [
    "cancel", "cancellation", "cancelling", "canceled",
    "churn", "churning", "leaving", "leave",
    "switching", "switch to",
    "not renewing", "won't renew", "not going to renew",
    "end subscription", "stop subscription", "refund"
]


def detect_cancel_mention(conversations: List[Dict[str, Any]]) -> bool:
    """
    Detect if customer mentioned canceling in conversations.

    Args:
        conversations: List of conversation objects

    Returns:
        True if cancel keywords found
    """
    for conversation in conversations:
        # Check source (initial message)
        source = conversation.get("source", {})
        body = (source.get("body") or "").lower()
        subject = (source.get("subject") or "").lower()

        for keyword in CANCEL_KEYWORDS:
            if keyword in body or keyword in subject:
                logger.warning(f"Cancel mention detected: '{keyword}' in conversation {conversation.get('id')}")
                return True

        # Check conversation parts (replies)
        parts = conversation.get("conversation_parts", {})
        if isinstance(parts, dict):
            parts = parts.get("conversation_parts", [])

        for part in (parts or []):
            part_body = (part.get("body") or "").lower()
            for keyword in CANCEL_KEYWORDS:
                if keyword in part_body:
                    logger.warning(f"Cancel mention detected: '{keyword}' in conversation {conversation.get('id')}")
                    return True

    return False


def sync_intercom(incremental: bool = True) -> Dict[str, Any]:
    """
    Sync customer data from Intercom.

    Args:
        incremental: If True, only sync contacts updated since last sync (not yet implemented)

    Returns:
        Sync metrics dictionary
    """
    logger.info("=" * 60)
    logger.info("Starting Intercom sync...")
    logger.info("=" * 60)

    # Initialize database
    engine = create_engine(settings.database_url)
    Session = sessionmaker(bind=engine)
    db = Session()

    # Create sync log
    sync_log = SyncLog(
        source="intercom",
        sync_type="incremental" if incremental else "full",
        status="running"
    )
    db.add(sync_log)
    db.commit()

    start_time = datetime.utcnow()
    metrics = {
        "contacts_synced": 0,
        "contacts_created": 0,
        "contacts_updated": 0,
        "contacts_skipped": 0,
        "errors": 0,
        "alerts_generated": 0,
        "total_mrr": 0.0
    }

    try:
        # Initialize Intercom client
        client = IntercomClient()

        # Fetch all contacts
        logger.info("Fetching contacts from Intercom...")
        contacts = client.iter_all_contacts()

        # Process each contact
        for contact in contacts:
            try:
                process_contact(db, client, contact, metrics)
            except Exception as e:
                logger.error(f"Error processing contact {contact.get('id')}: {e}")
                metrics["errors"] += 1
                metrics["contacts_skipped"] += 1

        # Update sync log
        sync_log.status = "completed"
        sync_log.completed_at = datetime.utcnow()
        sync_log.records_synced = metrics["contacts_synced"]
        sync_log.records_created = metrics["contacts_created"]
        sync_log.records_updated = metrics["contacts_updated"]
        sync_log.records_skipped = metrics["contacts_skipped"]
        sync_log.records_failed = metrics["errors"]
        sync_log.duration_seconds = (datetime.utcnow() - start_time).total_seconds()

        db.commit()

        logger.info("=" * 60)
        logger.info(f"Intercom sync completed!")
        logger.info(f"  Contacts synced: {metrics['contacts_synced']}")
        logger.info(f"  Created: {metrics['contacts_created']}")
        logger.info(f"  Updated: {metrics['contacts_updated']}")
        logger.info(f"  Skipped: {metrics['contacts_skipped']}")
        logger.info(f"  Errors: {metrics['errors']}")
        logger.info(f"  Alerts: {metrics['alerts_generated']}")
        logger.info(f"  Total MRR: ${metrics['total_mrr']:,.2f}")
        logger.info(f"  Duration: {sync_log.duration_seconds:.2f}s")
        logger.info("=" * 60)

        return metrics

    except Exception as e:
        logger.error(f"Intercom sync failed: {e}")
        sync_log.status = "failed"
        sync_log.error_message = str(e)
        db.commit()
        raise

    finally:
        db.close()


def process_contact(
    db: Any,
    client: IntercomClient,
    contact: Dict[str, Any],
    metrics: Dict[str, Any]
) -> None:
    """
    Process a single Intercom contact.

    Args:
        db: Database session
        client: IntercomClient instance
        contact: Contact data from Intercom
        metrics: Metrics dictionary to update
    """
    email = contact.get("email")

    if not email:
        logger.debug(f"Contact {contact.get('id')} has no email, skipping")
        metrics["contacts_skipped"] += 1
        return

    email = email.lower().strip()

    # Check if customer exists
    customer = db.query(UnifiedCustomer).filter(
        UnifiedCustomer.email == email
    ).first()

    is_new = customer is None

    if is_new:
        customer = UnifiedCustomer(email=email)
        db.add(customer)
        metrics["contacts_created"] += 1
        logger.info(f"+ Creating new customer: {email}")
    else:
        metrics["contacts_updated"] += 1
        logger.debug(f"~ Updating customer: {email}")

    # Extract basic profile data
    customer.name = contact.get("name") or email.split("@")[0]
    customer.intercom_contact_id = contact.get("id")

    # Location data
    location = contact.get("location") or {}
    customer.location_country = location.get("country")
    customer.location_city = location.get("city")

    # Signup date
    created_at = contact.get("created_at")
    if created_at:
        customer.signup_date = datetime.fromtimestamp(created_at)

    # Activity data
    last_seen_at = contact.get("last_seen_at")
    if last_seen_at:
        customer.last_seen_at = datetime.fromtimestamp(last_seen_at)
        customer.days_since_seen = (datetime.utcnow() - customer.last_seen_at).days
    else:
        customer.days_since_seen = None

    # Extract Stripe revenue data (using updated client method)
    stripe_data = client.extract_stripe_data(contact)

    customer.stripe_customer_id = stripe_data.get("stripe_customer_id")
    customer.plan_name = stripe_data.get("plan_name")
    customer.subscription_status = stripe_data.get("subscription_status")
    customer.is_delinquent = stripe_data.get("is_delinquent", False)
    customer.mrr = stripe_data.get("mrr", 0)
    customer.arr = stripe_data.get("arr", 0)
    customer.ltv = stripe_data.get("ltv", 0)
    customer.subscription_count = stripe_data.get("subscription_count", 0)
    customer.last_payment_amount = stripe_data.get("last_payment_amount")
    customer.last_payment_date = stripe_data.get("last_payment_date")

    # Track total MRR
    if customer.mrr:
        metrics["total_mrr"] += float(customer.mrr)

    # Get conversations for this contact
    try:
        conversations = client.get_contact_conversations(contact["id"])
        customer.intercom_convos_total = len(conversations)

        # Count recent conversations (last 30 days)
        thirty_days_ago = datetime.utcnow().timestamp() - (30 * 24 * 3600)
        recent_convos = [
            c for c in conversations
            if (c.get("created_at") or 0) > thirty_days_ago
        ]
        customer.intercom_convos_30d = len(recent_convos)

        # Count open tickets
        open_convos = [c for c in conversations if c.get("state") == "open"]
        customer.open_tickets = len(open_convos)

        # Detect cancel mentions
        customer.mentioned_cancel = detect_cancel_mention(conversations)

        # Store conversation details in custom_attributes
        if customer.custom_attributes is None:
            customer.custom_attributes = {}

        # Format and store conversations (most recent 20)
        formatted_convos = client.format_conversations_for_storage(conversations, max_conversations=20)
        customer.custom_attributes["intercom_conversations"] = formatted_convos
        customer.custom_attributes["intercom_conversations_count"] = len(conversations)
        customer.custom_attributes["intercom_open_count"] = len(open_convos)

        # Store last conversation date
        if formatted_convos:
            customer.custom_attributes["intercom_last_conversation_date"] = formatted_convos[0].get("created_at")

    except Exception as e:
        logger.warning(f"Error fetching conversations for {email}: {e}")

    # Update sync timestamp
    customer.last_intercom_sync = datetime.utcnow()

    # Flag custom_attributes as modified so SQLAlchemy detects JSONB changes
    if customer.custom_attributes:
        flag_modified(customer, 'custom_attributes')

    # Commit to get customer_id
    db.commit()

    # Recalculate health score
    previous_health = float(customer.health_score) if customer.health_score else None
    previous_status = customer.health_status

    calculate_health_score(customer)
    db.commit()

    # Generate alerts
    generate_alerts(customer, previous_health, previous_status, metrics)

    metrics["contacts_synced"] += 1


def generate_alerts(
    customer: UnifiedCustomer,
    previous_health: Optional[float],
    previous_status: Optional[str],
    metrics: Dict[str, Any]
) -> None:
    """
    Generate alerts based on customer state changes.

    Args:
        customer: UnifiedCustomer instance
        previous_health: Previous health score
        previous_status: Previous health status
        metrics: Metrics dictionary to update
    """
    notifier = SlackNotifier()

    # Cancel mention alert
    if customer.mentioned_cancel and not customer.alert_sent_cancel:
        if notifier.send_cancel_mention_alert(customer):
            customer.alert_sent_cancel = True
            customer.last_alert_sent_at = datetime.utcnow()
            metrics["alerts_generated"] += 1
            logger.warning(f"🚨 Alert: Cancel mention for {customer.email}")

    # Payment delinquent alert
    if customer.is_delinquent and not customer.alert_sent_delinquent:
        if notifier.send_payment_delinquent_alert(customer):
            customer.alert_sent_delinquent = True
            customer.last_alert_sent_at = datetime.utcnow()
            metrics["alerts_generated"] += 1
            logger.warning(f"💳 Alert: Payment delinquent for {customer.email}")

    # Health score drop alert
    if previous_health and customer.health_score:
        health_drop = previous_health - float(customer.health_score)
        if health_drop >= settings.alert_health_drop_threshold and not customer.alert_sent_health_drop:
            if notifier.send_health_drop_alert(customer, health_drop):
                customer.alert_sent_health_drop = True
                customer.last_alert_sent_at = datetime.utcnow()
                metrics["alerts_generated"] += 1
                logger.warning(f"📉 Alert: Health drop ({health_drop:.0f}pts) for {customer.email}")

    # New at-risk alert
    if customer.health_status in ["high_risk", "critical"]:
        if previous_status not in ["high_risk", "critical"]:
            if notifier.send_at_risk_alert(customer):
                customer.last_alert_sent_at = datetime.utcnow()
                metrics["alerts_generated"] += 1
                logger.warning(f"⚠️ Alert: Now at-risk ({customer.health_status}) - {customer.email}")


if __name__ == "__main__":
    # Run sync
    import sys

    incremental = "--full" not in sys.argv

    try:
        metrics = sync_intercom(incremental=incremental)
        print(f"\n✓ Intercom sync completed: {metrics}")
        sys.exit(0)
    except Exception as e:
        print(f"\n✗ Intercom sync failed: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
