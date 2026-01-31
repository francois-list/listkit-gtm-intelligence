"""
FastAPI application for ListKit GTM Intelligence Platform.

Provides REST API endpoints for:
- Customer listing and filtering
- Dashboard metrics and summaries
- Sync triggering
- Webhook handling
"""

from datetime import datetime
from typing import Optional, List
from fastapi import FastAPI, HTTPException, BackgroundTasks, Query
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import create_engine, func, desc
from sqlalchemy.orm import sessionmaker
from pydantic import BaseModel, EmailStr
from loguru import logger

from execution.config import settings
from execution.database.models import UnifiedCustomer, SyncLog
from execution.sync.sync_intercom import sync_intercom
from execution.sync.sync_hubspot import sync_hubspot
from execution.sync.sync_calendly import sync_calendly
from execution.sync.sync_all import sync_all


# Initialize FastAPI app
app = FastAPI(
    title="ListKit GTM Intelligence API",
    description="Customer intelligence, health scores, and revenue metrics API",
    version="1.0.0"
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Configure appropriately for production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Database setup
engine = create_engine(settings.database_url)
SessionLocal = sessionmaker(bind=engine)


# Pydantic models for API responses
class CustomerResponse(BaseModel):
    customer_id: str
    email: str
    name: Optional[str]
    company_name: Optional[str]
    assigned_am: Optional[str]
    mrr: Optional[float]
    arr: Optional[float]
    ltv: Optional[float]
    health_score: Optional[float]
    health_status: Optional[str]
    churn_risk: Optional[float]
    subscription_status: Optional[str]
    days_since_seen: Optional[int]
    last_seen_at: Optional[str]
    recommended_action: Optional[str]

    class Config:
        from_attributes = True


class DashboardSummary(BaseModel):
    total_customers: int
    total_mrr: float
    total_arr: float
    avg_health_score: float
    health_distribution: dict
    at_risk_count: int
    critical_count: int


class SyncResponse(BaseModel):
    message: str
    sync_started: bool
    source: str


# Helper function to get DB session
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# ==========================================
# Customer Endpoints
# ==========================================

@app.get("/", tags=["General"])
async def root():
    """API root endpoint."""
    return {
        "name": "ListKit GTM Intelligence API",
        "version": "1.0.0",
        "status": "operational"
    }


@app.get("/customers", response_model=List[CustomerResponse], tags=["Customers"])
async def list_customers(
    health_status: Optional[str] = Query(None, description="Filter by health status"),
    min_mrr: Optional[float] = Query(None, description="Minimum MRR"),
    assigned_am: Optional[str] = Query(None, description="Filter by assigned AM"),
    limit: int = Query(100, le=1000),
    offset: int = Query(0)
):
    """
    List customers with optional filters.

    Args:
        health_status: Filter by health status (healthy/at_risk/high_risk/critical)
        min_mrr: Minimum MRR threshold
        assigned_am: Filter by assigned account manager
        limit: Maximum results to return
        offset: Pagination offset

    Returns:
        List of customers
    """
    db = next(get_db())

    query = db.query(UnifiedCustomer)

    # Apply filters
    if health_status:
        query = query.filter(UnifiedCustomer.health_status == health_status)

    if min_mrr is not None:
        query = query.filter(UnifiedCustomer.mrr >= min_mrr)

    if assigned_am:
        query = query.filter(UnifiedCustomer.assigned_am.ilike(f"%{assigned_am}%"))

    # Order by MRR descending
    query = query.order_by(desc(UnifiedCustomer.mrr))

    # Pagination
    customers = query.offset(offset).limit(limit).all()

    return [CustomerResponse.from_orm(c) for c in customers]


@app.get("/customers/at-risk", response_model=List[CustomerResponse], tags=["Customers"])
async def get_at_risk_customers(
    limit: int = Query(100, le=1000)
):
    """
    Get at-risk customers sorted by churn risk.

    Returns customers with health_status in (at_risk, high_risk, critical)
    sorted by churn risk descending.

    Args:
        limit: Maximum results to return

    Returns:
        List of at-risk customers
    """
    db = next(get_db())

    customers = db.query(UnifiedCustomer).filter(
        UnifiedCustomer.health_status.in_(["at_risk", "high_risk", "critical"])
    ).order_by(
        desc(UnifiedCustomer.churn_risk),
        desc(UnifiedCustomer.mrr)
    ).limit(limit).all()

    return [CustomerResponse.from_orm(c) for c in customers]


@app.get("/customers/{customer_id}", response_model=CustomerResponse, tags=["Customers"])
async def get_customer(customer_id: str):
    """
    Get single customer by ID.

    Args:
        customer_id: Customer UUID

    Returns:
        Customer details

    Raises:
        HTTPException: If customer not found
    """
    db = next(get_db())

    customer = db.query(UnifiedCustomer).filter(
        UnifiedCustomer.customer_id == customer_id
    ).first()

    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found")

    return CustomerResponse.from_orm(customer)


@app.get("/customers/by-email/{email}", response_model=CustomerResponse, tags=["Customers"])
async def get_customer_by_email(email: EmailStr):
    """
    Get customer by email address.

    Args:
        email: Customer email

    Returns:
        Customer details

    Raises:
        HTTPException: If customer not found
    """
    db = next(get_db())

    customer = db.query(UnifiedCustomer).filter(
        UnifiedCustomer.email == email.lower()
    ).first()

    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found")

    return CustomerResponse.from_orm(customer)


# ==========================================
# Dashboard Endpoints
# ==========================================

@app.get("/dashboard/summary", response_model=DashboardSummary, tags=["Dashboard"])
async def get_dashboard_summary():
    """
    Get dashboard summary statistics.

    Returns:
        Aggregate metrics including total customers, MRR, health distribution
    """
    db = next(get_db())

    # Total customers
    total_customers = db.query(func.count(UnifiedCustomer.customer_id)).scalar()

    # Total MRR and ARR
    total_mrr = db.query(func.sum(UnifiedCustomer.mrr)).filter(
        UnifiedCustomer.subscription_status == "active"
    ).scalar() or 0

    total_arr = total_mrr * 12

    # Average health score
    avg_health = db.query(func.avg(UnifiedCustomer.health_score)).scalar() or 0

    # Health distribution
    health_dist = db.query(
        UnifiedCustomer.health_status,
        func.count(UnifiedCustomer.customer_id).label("count"),
        func.sum(UnifiedCustomer.mrr).label("mrr")
    ).group_by(UnifiedCustomer.health_status).all()

    health_distribution = {
        status: {"count": count, "mrr": float(mrr or 0)}
        for status, count, mrr in health_dist
    }

    # At-risk counts
    at_risk_count = db.query(func.count(UnifiedCustomer.customer_id)).filter(
        UnifiedCustomer.health_status.in_(["at_risk", "high_risk"])
    ).scalar()

    critical_count = db.query(func.count(UnifiedCustomer.customer_id)).filter(
        UnifiedCustomer.health_status == "critical"
    ).scalar()

    return DashboardSummary(
        total_customers=total_customers,
        total_mrr=float(total_mrr),
        total_arr=float(total_arr),
        avg_health_score=float(avg_health),
        health_distribution=health_distribution,
        at_risk_count=at_risk_count,
        critical_count=critical_count
    )


@app.get("/dashboard/mrr", tags=["Dashboard"])
async def get_mrr_breakdown():
    """
    Get MRR breakdown by plan.

    Returns:
        MRR metrics grouped by plan name
    """
    db = next(get_db())

    mrr_by_plan = db.query(
        UnifiedCustomer.plan_name,
        func.count(UnifiedCustomer.customer_id).label("customer_count"),
        func.sum(UnifiedCustomer.mrr).label("total_mrr")
    ).filter(
        UnifiedCustomer.subscription_status == "active"
    ).group_by(
        UnifiedCustomer.plan_name
    ).all()

    return {
        "mrr_by_plan": [
            {
                "plan_name": plan or "Unknown",
                "customer_count": count,
                "total_mrr": float(mrr or 0)
            }
            for plan, count, mrr in mrr_by_plan
        ]
    }


# ==========================================
# Sync Endpoints
# ==========================================

@app.post("/sync/intercom", response_model=SyncResponse, tags=["Sync"])
async def trigger_intercom_sync(
    background_tasks: BackgroundTasks,
    full: bool = Query(False, description="Run full sync instead of incremental")
):
    """
    Trigger Intercom sync.

    Args:
        full: If True, run full sync; otherwise incremental

    Returns:
        Sync trigger confirmation
    """
    logger.info(f"Triggering Intercom sync (full={full})")

    background_tasks.add_task(sync_intercom, incremental=not full)

    return SyncResponse(
        message="Intercom sync started",
        sync_started=True,
        source="intercom"
    )


@app.post("/sync/hubspot", response_model=SyncResponse, tags=["Sync"])
async def trigger_hubspot_sync(
    background_tasks: BackgroundTasks,
    full: bool = Query(False, description="Run full sync instead of incremental")
):
    """
    Trigger HubSpot sync (Phase 2).

    Args:
        full: If True, run full sync; otherwise incremental

    Returns:
        Sync trigger confirmation
    """
    logger.warning("HubSpot sync not yet implemented (Phase 2)")

    return SyncResponse(
        message="HubSpot sync not yet implemented (Phase 2)",
        sync_started=False,
        source="hubspot"
    )


@app.post("/sync/calendly", response_model=SyncResponse, tags=["Sync"])
async def trigger_calendly_sync(
    background_tasks: BackgroundTasks
):
    """
    Trigger Calendly sync (Phase 2).

    Returns:
        Sync trigger confirmation
    """
    logger.warning("Calendly sync not yet implemented (Phase 2)")

    return SyncResponse(
        message="Calendly sync not yet implemented (Phase 2)",
        sync_started=False,
        source="calendly"
    )


@app.post("/sync/all", tags=["Sync"])
async def trigger_all_syncs(
    background_tasks: BackgroundTasks,
    full: bool = Query(False, description="Run full sync instead of incremental")
):
    """
    Trigger all data source syncs.

    Args:
        full: If True, run full sync; otherwise incremental

    Returns:
        Sync trigger confirmation
    """
    logger.info(f"Triggering all syncs (full={full})")

    background_tasks.add_task(sync_all, incremental=not full)

    return {
        "message": "All syncs started",
        "sync_started": True,
        "sources": ["intercom", "hubspot (Phase 2)", "calendly (Phase 2)"]
    }


@app.get("/sync/status", tags=["Sync"])
async def get_sync_status():
    """
    Get recent sync status for all sources.

    Returns:
        Last sync status for each source
    """
    db = next(get_db())

    sources = ["intercom", "hubspot", "calendly"]
    status = {}

    for source in sources:
        last_sync = db.query(SyncLog).filter(
            SyncLog.source == source
        ).order_by(desc(SyncLog.started_at)).first()

        if last_sync:
            status[source] = {
                "last_sync_at": last_sync.started_at.isoformat() if last_sync.started_at else None,
                "status": last_sync.status,
                "records_synced": last_sync.records_synced,
                "duration_seconds": float(last_sync.duration_seconds) if last_sync.duration_seconds else None,
                "error": last_sync.error_message
            }
        else:
            status[source] = {
                "last_sync_at": None,
                "status": "never_run",
                "records_synced": 0
            }

    return status


# ==========================================
# Webhooks
# ==========================================

@app.post("/webhooks/intercom", tags=["Webhooks"])
async def intercom_webhook(payload: dict):
    """
    Receive Intercom webhooks for real-time updates.

    TODO: Implement webhook processing

    Args:
        payload: Intercom webhook payload

    Returns:
        Acknowledgment
    """
    logger.info(f"Received Intercom webhook: {payload.get('type')}")

    # TODO: Process webhook based on type
    # - conversation.created
    # - contact.created
    # - contact.updated

    return {"status": "received"}


# ==========================================
# Health Check
# ==========================================

@app.get("/health", tags=["General"])
async def health_check():
    """API health check endpoint."""
    db = next(get_db())

    try:
        # Test database connection
        db.execute("SELECT 1")

        return {
            "status": "healthy",
            "timestamp": datetime.utcnow().isoformat(),
            "database": "connected"
        }
    except Exception as e:
        logger.error(f"Health check failed: {e}")
        raise HTTPException(status_code=503, detail="Service unavailable")


# ==========================================
# Application Startup
# ==========================================

@app.on_event("startup")
async def startup_event():
    """Run on application startup."""
    logger.info("ListKit GTM Intelligence API starting...")
    logger.info(f"Environment: {settings.environment}")
    logger.info(f"Database: {settings.database_url[:30]}...")


@app.on_event("shutdown")
async def shutdown_event():
    """Run on application shutdown."""
    logger.info("ListKit GTM Intelligence API shutting down...")


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "main:app",
        host=settings.api_host,
        port=settings.api_port,
        reload=settings.environment == "development"
    )
