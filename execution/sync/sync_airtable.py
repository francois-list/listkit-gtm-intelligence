"""
Airtable sync script - AM Assignments and Segmentation

Syncs from Airtable:
- AM assignments (who owns each customer)
- Customer segmentation data (traffic source, industry, etc.)
- Account manager list
"""

from datetime import datetime
from typing import Dict, Any, Optional
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from loguru import logger

from execution.config import settings
from execution.clients.airtable_client import AirtableClient
from execution.database.models import UnifiedCustomer, AccountManager, SyncLog


def sync_airtable(
    sync_am_assignments: bool = True,
    sync_segmentation: bool = True,
    sync_am_list: bool = True
) -> Dict[str, Any]:
    """
    Sync data from Airtable.

    Args:
        sync_am_assignments: Sync AM assignments to customers
        sync_segmentation: Sync segmentation data to customers
        sync_am_list: Sync account managers list

    Returns:
        Sync metrics dictionary
    """
    logger.info("=" * 60)
    logger.info("Starting Airtable sync...")
    logger.info("=" * 60)

    # Check for required config
    if not hasattr(settings, 'airtable_api_key') or not settings.airtable_api_key:
        logger.warning("AIRTABLE_API_KEY not configured - skipping Airtable sync")
        return {"status": "skipped", "reason": "API key not configured"}

    if not hasattr(settings, 'airtable_base_id') or not settings.airtable_base_id:
        logger.warning("AIRTABLE_BASE_ID not configured - skipping Airtable sync")
        return {"status": "skipped", "reason": "Base ID not configured"}

    # Initialize database
    engine = create_engine(settings.database_url)
    Session = sessionmaker(bind=engine)
    db = Session()

    # Create sync log
    sync_log = SyncLog(
        source="airtable",
        sync_type="full",
        status="running"
    )
    db.add(sync_log)
    db.commit()

    start_time = datetime.utcnow()
    metrics = {
        "am_assignments_synced": 0,
        "segmentation_synced": 0,
        "ams_synced": 0,
        "customers_not_found": 0,
        "errors": 0
    }

    try:
        # Initialize Airtable client
        client = AirtableClient(
            api_key=settings.airtable_api_key,
            base_id=settings.airtable_base_id
        )

        # Get table names from config or use defaults
        customers_table = getattr(settings, 'airtable_customers_table', 'Customers')
        am_table = getattr(settings, 'airtable_am_table', 'Account Managers')

        # Sync Account Managers list
        if sync_am_list:
            logger.info(f"Syncing Account Managers from {am_table}...")
            for am_data in client.get_account_managers(table_name=am_table):
                try:
                    sync_account_manager(db, am_data, metrics)
                except Exception as e:
                    logger.error(f"Error syncing AM {am_data.get('email')}: {e}")
                    metrics["errors"] += 1

        # Sync AM Assignments
        if sync_am_assignments:
            logger.info(f"Syncing AM assignments from {customers_table}...")
            for assignment in client.get_am_assignments(table_name=customers_table):
                try:
                    sync_am_assignment(db, assignment, metrics)
                except Exception as e:
                    logger.error(f"Error syncing assignment for {assignment.get('email')}: {e}")
                    metrics["errors"] += 1

        # Sync Segmentation Data
        if sync_segmentation:
            logger.info(f"Syncing segmentation data from {customers_table}...")
            for seg_data in client.get_customer_segmentation(table_name=customers_table):
                try:
                    sync_segmentation_data(db, seg_data, metrics)
                except Exception as e:
                    logger.error(f"Error syncing segmentation for {seg_data.get('email')}: {e}")
                    metrics["errors"] += 1

        # Update sync log
        sync_log.status = "completed"
        sync_log.completed_at = datetime.utcnow()
        sync_log.records_synced = (
            metrics["am_assignments_synced"] +
            metrics["segmentation_synced"] +
            metrics["ams_synced"]
        )
        sync_log.records_skipped = metrics["customers_not_found"]
        sync_log.records_failed = metrics["errors"]
        sync_log.duration_seconds = (datetime.utcnow() - start_time).total_seconds()

        db.commit()

        logger.info("=" * 60)
        logger.info("Airtable sync completed!")
        logger.info(f"  AMs synced: {metrics['ams_synced']}")
        logger.info(f"  AM assignments synced: {metrics['am_assignments_synced']}")
        logger.info(f"  Segmentation synced: {metrics['segmentation_synced']}")
        logger.info(f"  Customers not found: {metrics['customers_not_found']}")
        logger.info(f"  Errors: {metrics['errors']}")
        logger.info(f"  Duration: {sync_log.duration_seconds:.2f}s")
        logger.info("=" * 60)

        return metrics

    except Exception as e:
        logger.error(f"Airtable sync failed: {e}")
        sync_log.status = "failed"
        sync_log.error_message = str(e)
        db.commit()
        raise

    finally:
        db.close()


def sync_account_manager(
    db: Any,
    am_data: Dict[str, Any],
    metrics: Dict[str, Any]
) -> None:
    """
    Sync a single account manager.

    Args:
        db: Database session
        am_data: AM data from Airtable
        metrics: Metrics dictionary to update
    """
    email = am_data.get("email")
    if not email:
        return

    # Check if AM exists
    am = db.query(AccountManager).filter(
        AccountManager.email == email
    ).first()

    if not am:
        am = AccountManager(email=email)
        db.add(am)
        logger.info(f"+ Creating AM: {am_data.get('name')} ({email})")
    else:
        logger.debug(f"~ Updating AM: {am_data.get('name')} ({email})")

    # Update fields
    am.name = am_data.get("name") or email.split("@")[0]
    am.airtable_record_id = am_data.get("airtable_record_id")
    am.team = am_data.get("team")
    am.is_active = am_data.get("is_active", True)
    am.slack_user_id = am_data.get("slack_user_id")
    am.calendly_user_uri = am_data.get("calendly_user_uri")

    db.commit()
    metrics["ams_synced"] += 1


def sync_am_assignment(
    db: Any,
    assignment: Dict[str, Any],
    metrics: Dict[str, Any]
) -> None:
    """
    Sync AM assignment to a customer.

    Args:
        db: Database session
        assignment: Assignment data from Airtable
        metrics: Metrics dictionary to update
    """
    email = assignment.get("email")
    if not email:
        return

    # Find customer
    customer = db.query(UnifiedCustomer).filter(
        UnifiedCustomer.email == email
    ).first()

    if not customer:
        logger.debug(f"Customer not found for AM assignment: {email}")
        metrics["customers_not_found"] += 1
        return

    # Update AM assignment
    customer.airtable_record_id = assignment.get("airtable_record_id")
    customer.assigned_am = assignment.get("assigned_am")
    customer.assigned_am_email = assignment.get("assigned_am_email")
    customer.last_airtable_sync = datetime.utcnow()

    db.commit()
    metrics["am_assignments_synced"] += 1
    logger.debug(f"Assigned {customer.assigned_am} to {email}")


def sync_segmentation_data(
    db: Any,
    seg_data: Dict[str, Any],
    metrics: Dict[str, Any]
) -> None:
    """
    Sync segmentation data to a customer.

    Args:
        db: Database session
        seg_data: Segmentation data from Airtable
        metrics: Metrics dictionary to update
    """
    email = seg_data.get("email")
    if not email:
        return

    # Find customer
    customer = db.query(UnifiedCustomer).filter(
        UnifiedCustomer.email == email
    ).first()

    if not customer:
        logger.debug(f"Customer not found for segmentation: {email}")
        metrics["customers_not_found"] += 1
        return

    # Update segmentation fields
    if seg_data.get("traffic_source"):
        customer.traffic_source = seg_data["traffic_source"]

    if seg_data.get("acquisition_type"):
        customer.acquisition_type = seg_data["acquisition_type"]

    if seg_data.get("industry"):
        customer.industry = seg_data["industry"]

    if seg_data.get("company_size"):
        customer.company_size = seg_data["company_size"]

    if seg_data.get("tags"):
        # Merge tags if list
        existing_tags = customer.tags or []
        new_tags = seg_data["tags"] if isinstance(seg_data["tags"], list) else [seg_data["tags"]]
        customer.tags = list(set(existing_tags + new_tags))

    customer.last_airtable_sync = datetime.utcnow()

    db.commit()
    metrics["segmentation_synced"] += 1


if __name__ == "__main__":
    import sys

    try:
        metrics = sync_airtable()
        print(f"\n✓ Airtable sync completed: {metrics}")
        sys.exit(0)
    except Exception as e:
        print(f"\n✗ Airtable sync failed: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
