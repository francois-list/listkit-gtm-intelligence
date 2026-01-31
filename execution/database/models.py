"""
SQLAlchemy models for ListKit GTM Intelligence Platform.
"""

from datetime import datetime
from typing import Optional, Dict, Any, List
from sqlalchemy import (
    Column, String, Integer, Numeric, Boolean, DateTime, Text,
    ForeignKey, Index
)
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import relationship
import uuid


Base = declarative_base()


class UnifiedCustomer(Base):
    """
    Unified customer record combining data from all sources.

    This is the single source of truth for customer data, health scores,
    and revenue metrics.
    """

    __tablename__ = "unified_customers"

    # IDENTIFIERS
    customer_id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    email = Column(String(255), unique=True, nullable=False, index=True)

    # Source system IDs
    intercom_contact_id = Column(String(255))
    hubspot_contact_id = Column(String(255))
    hubspot_company_id = Column(String(255))
    stripe_customer_id = Column(String(255))
    calendly_user_id = Column(String(255))
    userflow_user_id = Column(String(255))
    listkit_user_id = Column(String(255))
    chartmogul_customer_id = Column(String(255))

    # PROFILE
    name = Column(String(255))
    company_name = Column(String(255))
    location_country = Column(String(100))
    location_city = Column(String(100))

    assigned_am = Column(String(255))
    assigned_am_email = Column(String(255), index=True)

    signup_date = Column(DateTime)
    customer_type = Column(String(50))
    acquisition_source = Column(String(100))

    # REVENUE
    mrr = Column(Numeric(10, 2), index=True)
    arr = Column(Numeric(10, 2))
    ltv = Column(Numeric(10, 2))

    plan_name = Column(String(100))
    plan_price = Column(Numeric(10, 2))
    billing_interval = Column(String(20))

    subscription_status = Column(String(50), index=True)
    subscription_count = Column(Integer, default=0)

    is_delinquent = Column(Boolean, default=False)
    last_payment_amount = Column(Numeric(10, 2))
    last_payment_date = Column(DateTime)
    payment_failures_90d = Column(Integer, default=0)

    # ACTIVITY
    last_seen_at = Column(DateTime, index=True)
    days_since_seen = Column(Integer)

    login_count_7d = Column(Integer, default=0)
    login_count_30d = Column(Integer, default=0)

    onboarding_complete = Column(Boolean, default=False)
    activation_score = Column(Numeric(5, 2))
    engagement_score = Column(Numeric(5, 2))

    feature_usage = Column(JSONB)

    # SUPPORT
    intercom_convos_total = Column(Integer, default=0)
    intercom_convos_30d = Column(Integer, default=0)

    csat_score = Column(Numeric(3, 2))
    support_sentiment = Column(String(20))

    open_tickets = Column(Integer, default=0)
    mentioned_cancel = Column(Boolean, default=False)

    # CALLS
    total_calls_booked = Column(Integer, default=0)
    calls_completed = Column(Integer, default=0)
    calls_no_show = Column(Integer, default=0)
    calls_canceled = Column(Integer, default=0)
    calls_rescheduled = Column(Integer, default=0)

    show_rate = Column(Numeric(5, 2))
    last_call_date = Column(DateTime)
    next_call_date = Column(DateTime)

    # PIPELINE
    deal_stage = Column(String(100))
    deal_value = Column(Numeric(10, 2))
    deal_pipeline = Column(String(100))
    deal_expected_close = Column(DateTime)
    lifecycle_stage = Column(String(50))

    # HEALTH
    health_score = Column(Numeric(5, 2))
    health_status = Column(String(20), index=True)

    churn_risk = Column(Numeric(5, 2), index=True)
    risk_signals = Column(JSONB)

    expansion_potential = Column(Numeric(5, 2))
    recommended_action = Column(Text)

    health_score_components = Column(JSONB)
    health_calculated_at = Column(DateTime)

    # METADATA
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    data_quality_score = Column(Numeric(5, 2))
    data_completeness_pct = Column(Numeric(5, 2))

    # Last sync timestamps
    last_intercom_sync = Column(DateTime)
    last_hubspot_sync = Column(DateTime)
    last_calendly_sync = Column(DateTime)
    last_userflow_sync = Column(DateTime)
    last_fathom_sync = Column(DateTime)
    last_listkit_sync = Column(DateTime)
    last_chartmogul_sync = Column(DateTime)
    last_stripe_sync = Column(DateTime)

    # Alert tracking
    alert_sent_cancel = Column(Boolean, default=False)
    alert_sent_delinquent = Column(Boolean, default=False)
    alert_sent_health_drop = Column(Boolean, default=False)
    alert_sent_engagement_drop = Column(Boolean, default=False)
    last_alert_sent_at = Column(DateTime)

    # SEGMENTATION (for filtering and analysis)
    traffic_source = Column(String(100), index=True)  # google, linkedin, referral, etc.
    acquisition_type = Column(String(50), index=True)  # PLG, SLG, hybrid
    industry = Column(String(100), index=True)  # saas, agency, recruiting, etc.
    company_size = Column(String(50))  # small, medium, enterprise
    mrr_tier = Column(String(20), index=True)  # starter, growth, pro, enterprise
    tenure_segment = Column(String(20), index=True)  # new, established, veteran
    plan_type = Column(String(20), index=True)  # monthly, annual
    tags = Column(JSONB, default=[])  # flexible tagging
    custom_attributes = Column(JSONB, default={})  # extra fields from Airtable/HubSpot

    # Airtable sync
    airtable_record_id = Column(String(50))
    last_airtable_sync = Column(DateTime)

    # Churn tracking
    churned_at = Column(DateTime)
    churn_reason = Column(String(255))
    win_back_eligible = Column(Boolean, default=False)

    # Relationships
    alert_history = relationship("AlertHistory", back_populates="customer", cascade="all, delete-orphan")
    health_history = relationship("HealthScoreHistory", back_populates="customer", cascade="all, delete-orphan")
    campaigns = relationship("Campaign", back_populates="customer", cascade="all, delete-orphan")

    def __repr__(self):
        return f"<UnifiedCustomer(email='{self.email}', name='{self.name}', health={self.health_score})>"

    def to_dict(self) -> Dict[str, Any]:
        """Convert customer to dictionary."""
        return {
            "customer_id": str(self.customer_id),
            "email": self.email,
            "name": self.name,
            "company_name": self.company_name,
            "assigned_am": self.assigned_am,
            "mrr": float(self.mrr) if self.mrr else None,
            "arr": float(self.arr) if self.arr else None,
            "ltv": float(self.ltv) if self.ltv else None,
            "health_score": float(self.health_score) if self.health_score else None,
            "health_status": self.health_status,
            "churn_risk": float(self.churn_risk) if self.churn_risk else None,
            "risk_signals": self.risk_signals,
            "subscription_status": self.subscription_status,
            "days_since_seen": self.days_since_seen,
            "last_seen_at": self.last_seen_at.isoformat() if self.last_seen_at else None,
            "recommended_action": self.recommended_action,
        }


class AlertHistory(Base):
    """
    History of all alerts sent for customers.

    Tracks when alerts were sent, acknowledged, and their metadata.
    """

    __tablename__ = "alert_history"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    customer_id = Column(UUID(as_uuid=True), ForeignKey("unified_customers.customer_id", ondelete="CASCADE"), index=True)

    alert_type = Column(String(50), nullable=False, index=True)
    severity = Column(String(20), nullable=False)

    message = Column(Text, nullable=False)
    slack_channel = Column(String(100))
    slack_message_ts = Column(String(50))

    sent_at = Column(DateTime, default=datetime.utcnow, index=True)
    acknowledged_at = Column(DateTime)
    acknowledged_by = Column(String(255))


    # Relationships
    customer = relationship("UnifiedCustomer", back_populates="alert_history")

    def __repr__(self):
        return f"<AlertHistory(type='{self.alert_type}', customer='{self.customer_id}', sent='{self.sent_at}')>"


class SyncLog(Base):
    """
    Log of all sync operations.

    Tracks sync performance, errors, and metrics.
    """

    __tablename__ = "sync_log"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)

    source = Column(String(50), nullable=False, index=True)
    sync_type = Column(String(20), nullable=False)

    started_at = Column(DateTime, default=datetime.utcnow, index=True)
    completed_at = Column(DateTime)

    status = Column(String(20), nullable=False, index=True)
    error_message = Column(Text)

    # Metrics
    records_synced = Column(Integer, default=0)
    records_created = Column(Integer, default=0)
    records_updated = Column(Integer, default=0)
    records_skipped = Column(Integer, default=0)
    records_failed = Column(Integer, default=0)

    duration_seconds = Column(Numeric(10, 2))
    avg_quality_score = Column(Numeric(5, 2))


    def __repr__(self):
        return f"<SyncLog(source='{self.source}', status='{self.status}', records={self.records_synced})>"


class HealthScoreHistory(Base):
    """
    Historical tracking of health scores for trending analysis.

    Captures snapshots of health scores over time.
    """

    __tablename__ = "health_score_history"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    customer_id = Column(UUID(as_uuid=True), ForeignKey("unified_customers.customer_id", ondelete="CASCADE"), index=True)

    health_score = Column(Numeric(5, 2))
    health_status = Column(String(20))
    churn_risk = Column(Numeric(5, 2))

    score_components = Column(JSONB)
    risk_signals = Column(JSONB)

    recorded_at = Column(DateTime, default=datetime.utcnow, index=True)

    # Relationships
    customer = relationship("UnifiedCustomer", back_populates="health_history")

    def __repr__(self):
        return f"<HealthScoreHistory(customer='{self.customer_id}', score={self.health_score}, recorded='{self.recorded_at}')>"


class Campaign(Base):
    """
    Campaign data from SmartLead.ai.

    Tracks email campaign performance metrics for customers.
    """

    __tablename__ = "campaigns"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    customer_id = Column(UUID(as_uuid=True), ForeignKey("unified_customers.customer_id", ondelete="CASCADE"), index=True)

    # SmartLead.ai identifiers
    smartlead_campaign_id = Column(String(255), index=True)
    smartlead_client_id = Column(Integer, index=True)  # SmartLead client ID that owns this campaign
    smartlead_client_email = Column(String(255), index=True)  # Email of the SmartLead client

    # Campaign details
    campaign_name = Column(String(255), nullable=False)
    status = Column(String(50), index=True)  # active, paused, completed, draft

    # Metrics
    leads_count = Column(Integer, default=0)
    emails_sent = Column(Integer, default=0)
    reply_count = Column(Integer, default=0)
    positive_reply_count = Column(Integer, default=0)
    bounce_count = Column(Integer, default=0)

    # Calculated rates
    reply_rate = Column(Numeric(5, 2))
    positive_reply_rate = Column(Numeric(5, 2))
    bounce_rate = Column(Numeric(5, 2))

    # Timestamps
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    last_synced_at = Column(DateTime)

    # Relationships
    customer = relationship("UnifiedCustomer", back_populates="campaigns")

    def __repr__(self):
        return f"<Campaign(name='{self.campaign_name}', status='{self.status}', customer='{self.customer_id}')>"


class AccountManager(Base):
    """
    Account Manager profile and performance metrics.

    Tracks AM assignment, performance, and accountability metrics.
    """

    __tablename__ = "account_managers"

    am_id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)

    # Identity
    name = Column(String(255), nullable=False)
    email = Column(String(255), unique=True, nullable=False, index=True)

    # External IDs
    airtable_record_id = Column(String(50))
    hubspot_owner_id = Column(String(50))
    calendly_user_uri = Column(String(255))
    slack_user_id = Column(String(50))

    # Status
    is_active = Column(Boolean, default=True, index=True)
    team = Column(String(100), index=True)

    # Performance Metrics (rolled up)
    total_customers = Column(Integer, default=0)
    total_mrr = Column(Numeric(12, 2), default=0)
    total_arr = Column(Numeric(12, 2), default=0)

    avg_health_score = Column(Numeric(5, 2))
    healthy_customers = Column(Integer, default=0)
    at_risk_customers = Column(Integer, default=0)
    critical_customers = Column(Integer, default=0)

    # Churn Metrics
    customers_churned_30d = Column(Integer, default=0)
    mrr_churned_30d = Column(Numeric(10, 2), default=0)
    churn_rate_30d = Column(Numeric(5, 2))

    customers_churned_90d = Column(Integer, default=0)
    mrr_churned_90d = Column(Numeric(10, 2), default=0)
    churn_rate_90d = Column(Numeric(5, 2))

    # Retention Metrics
    gross_retention_rate = Column(Numeric(5, 2))
    net_retention_rate = Column(Numeric(5, 2))

    # Engagement Metrics
    avg_show_rate = Column(Numeric(5, 2))
    total_calls_30d = Column(Integer, default=0)
    avg_response_time_hours = Column(Numeric(8, 2))

    # Timestamps
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    metrics_calculated_at = Column(DateTime)

    def __repr__(self):
        return f"<AccountManager(name='{self.name}', customers={self.total_customers}, mrr={self.total_mrr})>"

    def to_dict(self) -> Dict[str, Any]:
        """Convert AM to dictionary."""
        return {
            "am_id": str(self.am_id),
            "name": self.name,
            "email": self.email,
            "team": self.team,
            "total_customers": self.total_customers,
            "total_mrr": float(self.total_mrr) if self.total_mrr else 0,
            "avg_health_score": float(self.avg_health_score) if self.avg_health_score else None,
            "at_risk_customers": (self.at_risk_customers or 0) + (self.critical_customers or 0),
            "churn_rate_30d": float(self.churn_rate_30d) if self.churn_rate_30d else None,
            "gross_retention_rate": float(self.gross_retention_rate) if self.gross_retention_rate else None,
            "net_retention_rate": float(self.net_retention_rate) if self.net_retention_rate else None,
            "avg_show_rate": float(self.avg_show_rate) if self.avg_show_rate else None,
        }


class ChurnEvent(Base):
    """
    Track all churn events with full context.

    Captures snapshot of customer data at time of churn for analysis.
    """

    __tablename__ = "churn_events"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    customer_id = Column(UUID(as_uuid=True), ForeignKey("unified_customers.customer_id", ondelete="SET NULL"))

    # Customer snapshot
    email = Column(String(255), nullable=False)
    name = Column(String(255))
    company_name = Column(String(255))

    # Revenue lost
    mrr_at_churn = Column(Numeric(10, 2))
    ltv_at_churn = Column(Numeric(10, 2))

    # Assignment
    assigned_am = Column(String(255))
    assigned_am_email = Column(String(255), index=True)

    # Churn details
    churned_at = Column(DateTime, nullable=False, index=True)
    churn_reason = Column(String(255), index=True)
    churn_type = Column(String(50), index=True)  # voluntary, involuntary

    # Health at churn
    health_score_at_churn = Column(Numeric(5, 2))
    health_status_at_churn = Column(String(20))
    risk_signals_at_churn = Column(JSONB)

    # Segments
    mrr_tier = Column(String(20))
    tenure_segment = Column(String(20))
    industry = Column(String(100))
    acquisition_type = Column(String(50))

    # Warning metrics
    days_at_risk = Column(Integer)
    days_as_customer = Column(Integer)

    # Win-back
    win_back_attempted = Column(Boolean, default=False)
    win_back_succeeded = Column(Boolean, default=False)
    win_back_at = Column(DateTime)

    created_at = Column(DateTime, default=datetime.utcnow)

    def __repr__(self):
        return f"<ChurnEvent(email='{self.email}', mrr={self.mrr_at_churn}, churned_at='{self.churned_at}')>"


# Composite indexes
Index('idx_health_mrr', UnifiedCustomer.health_status, UnifiedCustomer.mrr.desc())
Index(
    'idx_at_risk_customers',
    UnifiedCustomer.health_status,
    UnifiedCustomer.churn_risk.desc(),
    postgresql_where=(UnifiedCustomer.health_status.in_(['at_risk', 'high_risk', 'critical']))
)
