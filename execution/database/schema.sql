-- ListKit GTM Intelligence Platform - Unified Customer Database Schema
-- This schema supports data from ALL phases (Intercom, HubSpot, Calendly, Userflow, etc.)

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =====================================================
-- Unified Customers Table
-- =====================================================

CREATE TABLE IF NOT EXISTS unified_customers (
    -- ==================
    -- IDENTIFIERS
    -- ==================
    customer_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) UNIQUE NOT NULL,  -- Match key across all sources

    -- Source system IDs
    intercom_contact_id VARCHAR(255),
    hubspot_contact_id VARCHAR(255),
    hubspot_company_id VARCHAR(255),
    stripe_customer_id VARCHAR(255),
    calendly_user_id VARCHAR(255),
    userflow_user_id VARCHAR(255),
    listkit_user_id VARCHAR(255),
    chartmogul_customer_id VARCHAR(255),

    -- ==================
    -- PROFILE
    -- ==================
    name VARCHAR(255),
    company_name VARCHAR(255),
    location_country VARCHAR(100),
    location_city VARCHAR(100),

    -- Account ownership
    assigned_am VARCHAR(255),
    assigned_am_email VARCHAR(255),

    -- Customer attributes
    signup_date TIMESTAMP,
    customer_type VARCHAR(50),  -- lead, prospect, customer, advocate, churned
    acquisition_source VARCHAR(100),

    -- ==================
    -- REVENUE (from Intercom/Stripe)
    -- ==================
    mrr DECIMAL(10, 2),  -- Monthly Recurring Revenue
    arr DECIMAL(10, 2),  -- Annual Recurring Revenue (MRR * 12)
    ltv DECIMAL(10, 2),  -- Lifetime Value (sum of all payments)

    plan_name VARCHAR(100),
    plan_price DECIMAL(10, 2),
    billing_interval VARCHAR(20),  -- month, year

    subscription_status VARCHAR(50),  -- active, trialing, past_due, canceled, unpaid
    subscription_count INTEGER DEFAULT 0,

    is_delinquent BOOLEAN DEFAULT FALSE,
    last_payment_amount DECIMAL(10, 2),
    last_payment_date TIMESTAMP,
    payment_failures_90d INTEGER DEFAULT 0,

    -- ==================
    -- ACTIVITY (from Userflow + Intercom)
    -- ==================
    last_seen_at TIMESTAMP,
    days_since_seen INTEGER,

    login_count_7d INTEGER DEFAULT 0,
    login_count_30d INTEGER DEFAULT 0,

    onboarding_complete BOOLEAN DEFAULT FALSE,
    activation_score DECIMAL(5, 2),  -- 0-100
    engagement_score DECIMAL(5, 2),  -- 0-100

    -- Feature usage (JSONB for flexibility)
    feature_usage JSONB,

    -- ==================
    -- SUPPORT (from Intercom)
    -- ==================
    intercom_convos_total INTEGER DEFAULT 0,
    intercom_convos_30d INTEGER DEFAULT 0,

    csat_score DECIMAL(3, 2),  -- 1-5 scale
    support_sentiment VARCHAR(20),  -- positive, neutral, negative

    open_tickets INTEGER DEFAULT 0,
    mentioned_cancel BOOLEAN DEFAULT FALSE,

    -- ==================
    -- CALLS (from Calendly)
    -- ==================
    total_calls_booked INTEGER DEFAULT 0,
    calls_completed INTEGER DEFAULT 0,
    calls_no_show INTEGER DEFAULT 0,
    calls_canceled INTEGER DEFAULT 0,
    calls_rescheduled INTEGER DEFAULT 0,

    show_rate DECIMAL(5, 2),  -- Percentage
    last_call_date TIMESTAMP,
    next_call_date TIMESTAMP,

    -- ==================
    -- PIPELINE (from HubSpot)
    -- ==================
    deal_stage VARCHAR(100),
    deal_value DECIMAL(10, 2),
    deal_pipeline VARCHAR(100),
    deal_expected_close TIMESTAMP,
    lifecycle_stage VARCHAR(50),

    -- ==================
    -- HEALTH (calculated)
    -- ==================
    health_score DECIMAL(5, 2),  -- 0-100
    health_status VARCHAR(20),  -- healthy, at_risk, high_risk, critical

    churn_risk DECIMAL(5, 2),  -- 0-100 probability
    risk_signals JSONB,  -- Array of risk indicators

    expansion_potential DECIMAL(5, 2),  -- 0-100
    recommended_action TEXT,

    -- Health score components (for transparency)
    health_score_components JSONB,
    health_calculated_at TIMESTAMP,

    -- ==================
    -- METADATA
    -- ==================
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),

    data_quality_score DECIMAL(5, 2),  -- 0-100
    data_completeness_pct DECIMAL(5, 2),  -- Percentage of fields populated

    -- Last sync timestamps for each source
    last_intercom_sync TIMESTAMP,
    last_hubspot_sync TIMESTAMP,
    last_calendly_sync TIMESTAMP,
    last_userflow_sync TIMESTAMP,
    last_fathom_sync TIMESTAMP,
    last_listkit_sync TIMESTAMP,
    last_chartmogul_sync TIMESTAMP,
    last_stripe_sync TIMESTAMP,

    -- Alert tracking (prevent duplicate alerts)
    alert_sent_cancel BOOLEAN DEFAULT FALSE,
    alert_sent_delinquent BOOLEAN DEFAULT FALSE,
    alert_sent_health_drop BOOLEAN DEFAULT FALSE,
    alert_sent_engagement_drop BOOLEAN DEFAULT FALSE,
    last_alert_sent_at TIMESTAMP
);

-- =====================================================
-- Indexes for Performance
-- =====================================================

CREATE INDEX idx_email ON unified_customers(email);
CREATE INDEX idx_health_status ON unified_customers(health_status);
CREATE INDEX idx_churn_risk ON unified_customers(churn_risk DESC);
CREATE INDEX idx_mrr ON unified_customers(mrr DESC);
CREATE INDEX idx_assigned_am ON unified_customers(assigned_am_email);
CREATE INDEX idx_last_seen ON unified_customers(last_seen_at DESC);
CREATE INDEX idx_subscription_status ON unified_customers(subscription_status);

-- Composite indexes for common queries
CREATE INDEX idx_health_mrr ON unified_customers(health_status, mrr DESC);
CREATE INDEX idx_at_risk_customers ON unified_customers(health_status, churn_risk DESC)
    WHERE health_status IN ('at_risk', 'high_risk', 'critical');

-- =====================================================
-- Alert History Table
-- =====================================================

CREATE TABLE IF NOT EXISTS alert_history (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    customer_id UUID REFERENCES unified_customers(customer_id) ON DELETE CASCADE,

    alert_type VARCHAR(50) NOT NULL,  -- cancel_mention, payment_delinquent, health_drop, etc.
    severity VARCHAR(20) NOT NULL,  -- critical, high, medium, low

    message TEXT NOT NULL,
    slack_channel VARCHAR(100),
    slack_message_ts VARCHAR(50),  -- For threading and updates

    sent_at TIMESTAMP DEFAULT NOW(),
    acknowledged_at TIMESTAMP,
    acknowledged_by VARCHAR(255),

    -- Alert metadata
    metadata JSONB
);

CREATE INDEX idx_alert_customer ON alert_history(customer_id);
CREATE INDEX idx_alert_type ON alert_history(alert_type);
CREATE INDEX idx_alert_sent_at ON alert_history(sent_at DESC);

-- =====================================================
-- Sync Log Table
-- =====================================================

CREATE TABLE IF NOT EXISTS sync_log (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    source VARCHAR(50) NOT NULL,  -- intercom, hubspot, calendly, etc.
    sync_type VARCHAR(20) NOT NULL,  -- incremental, full

    started_at TIMESTAMP DEFAULT NOW(),
    completed_at TIMESTAMP,

    status VARCHAR(20) NOT NULL,  -- running, completed, failed
    error_message TEXT,

    -- Metrics
    records_synced INTEGER DEFAULT 0,
    records_created INTEGER DEFAULT 0,
    records_updated INTEGER DEFAULT 0,
    records_skipped INTEGER DEFAULT 0,
    records_failed INTEGER DEFAULT 0,

    duration_seconds DECIMAL(10, 2),
    avg_quality_score DECIMAL(5, 2),

    -- Additional metadata
    metadata JSONB
);

CREATE INDEX idx_sync_source ON sync_log(source);
CREATE INDEX idx_sync_started ON sync_log(started_at DESC);
CREATE INDEX idx_sync_status ON sync_log(status);

-- =====================================================
-- Health Score History Table (for trending)
-- =====================================================

CREATE TABLE IF NOT EXISTS health_score_history (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    customer_id UUID REFERENCES unified_customers(customer_id) ON DELETE CASCADE,

    health_score DECIMAL(5, 2),
    health_status VARCHAR(20),
    churn_risk DECIMAL(5, 2),

    score_components JSONB,
    risk_signals JSONB,

    recorded_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_health_history_customer ON health_score_history(customer_id);
CREATE INDEX idx_health_history_recorded ON health_score_history(recorded_at DESC);

-- =====================================================
-- Campaigns Table (SmartLead.ai data)
-- =====================================================

CREATE TABLE IF NOT EXISTS campaigns (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    customer_id UUID REFERENCES unified_customers(customer_id) ON DELETE CASCADE,

    -- SmartLead.ai identifiers
    smartlead_campaign_id VARCHAR(255),

    -- Campaign details
    campaign_name VARCHAR(255) NOT NULL,
    status VARCHAR(50),  -- active, paused, completed, draft

    -- Metrics
    leads_count INTEGER DEFAULT 0,
    emails_sent INTEGER DEFAULT 0,
    reply_count INTEGER DEFAULT 0,
    positive_reply_count INTEGER DEFAULT 0,
    bounce_count INTEGER DEFAULT 0,

    -- Calculated rates (stored for query efficiency)
    reply_rate DECIMAL(5, 2),  -- percentage
    positive_reply_rate DECIMAL(5, 2),  -- percentage
    bounce_rate DECIMAL(5, 2),  -- percentage

    -- Timestamps
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    last_synced_at TIMESTAMP
);

CREATE INDEX idx_campaigns_customer ON campaigns(customer_id);
CREATE INDEX idx_campaigns_status ON campaigns(status);
CREATE INDEX idx_campaigns_smartlead_id ON campaigns(smartlead_campaign_id);

-- =====================================================
-- Triggers
-- =====================================================

-- Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_unified_customers_updated_at
    BEFORE UPDATE ON unified_customers
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- Views
-- =====================================================

-- At-risk customers view
CREATE OR REPLACE VIEW at_risk_customers AS
SELECT
    customer_id,
    email,
    name,
    company_name,
    assigned_am,
    mrr,
    health_score,
    health_status,
    churn_risk,
    risk_signals,
    recommended_action,
    days_since_seen,
    last_seen_at
FROM unified_customers
WHERE health_status IN ('at_risk', 'high_risk', 'critical')
ORDER BY churn_risk DESC, mrr DESC;

-- High-value customers view
CREATE OR REPLACE VIEW high_value_customers AS
SELECT
    customer_id,
    email,
    name,
    company_name,
    assigned_am,
    mrr,
    arr,
    ltv,
    health_score,
    health_status,
    subscription_status
FROM unified_customers
WHERE mrr >= 300
ORDER BY mrr DESC;

-- Customer health summary view
CREATE OR REPLACE VIEW customer_health_summary AS
SELECT
    health_status,
    COUNT(*) as customer_count,
    SUM(mrr) as total_mrr,
    AVG(health_score) as avg_health_score,
    AVG(churn_risk) as avg_churn_risk
FROM unified_customers
WHERE subscription_status = 'active'
GROUP BY health_status;

-- =====================================================
-- Sample Data Quality Function
-- =====================================================

CREATE OR REPLACE FUNCTION calculate_data_quality(customer_row unified_customers)
RETURNS DECIMAL AS $$
DECLARE
    score DECIMAL := 0;
BEGIN
    -- Profile completeness
    IF customer_row.name IS NOT NULL THEN score := score + 5; END IF;
    IF customer_row.company_name IS NOT NULL THEN score := score + 5; END IF;
    IF customer_row.location_country IS NOT NULL THEN score := score + 5; END IF;

    -- Revenue data
    IF customer_row.stripe_customer_id IS NOT NULL THEN score := score + 15; END IF;
    IF customer_row.mrr IS NOT NULL AND customer_row.mrr > 0 THEN score := score + 15; END IF;
    IF customer_row.ltv IS NOT NULL AND customer_row.ltv > 0 THEN score := score + 10; END IF;

    -- Activity data
    IF customer_row.last_seen_at IS NOT NULL THEN score := score + 10; END IF;
    IF customer_row.login_count_30d IS NOT NULL THEN score := score + 5; END IF;

    -- Support data
    IF customer_row.intercom_convos_total IS NOT NULL THEN score := score + 5; END IF;
    IF customer_row.csat_score IS NOT NULL THEN score := score + 5; END IF;

    -- Calls data
    IF customer_row.total_calls_booked IS NOT NULL AND customer_row.total_calls_booked > 0 THEN score := score + 5; END IF;

    -- Pipeline data
    IF customer_row.assigned_am IS NOT NULL THEN score := score + 10; END IF;
    IF customer_row.deal_stage IS NOT NULL THEN score := score + 5; END IF;

    -- Health calculation
    IF customer_row.health_score IS NOT NULL THEN score := score + 5; END IF;

    RETURN score;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- MRR Snapshots Table (for historical MRR tracking)
-- =====================================================

CREATE TABLE IF NOT EXISTS mrr_snapshots (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    snapshot_date DATE NOT NULL,
    total_mrr DECIMAL(12, 2) NOT NULL DEFAULT 0,
    total_arr DECIMAL(12, 2) NOT NULL DEFAULT 0,
    total_customers INTEGER NOT NULL DEFAULT 0,
    paying_customers INTEGER NOT NULL DEFAULT 0,
    churned_mrr DECIMAL(12, 2) DEFAULT 0,
    expansion_mrr DECIMAL(12, 2) DEFAULT 0,
    contraction_mrr DECIMAL(12, 2) DEFAULT 0,
    new_mrr DECIMAL(12, 2) DEFAULT 0,
    nrr DECIMAL(6, 2),
    grr DECIMAL(6, 2),
    churn_rate DECIMAL(6, 2),
    revenue_churn_rate DECIMAL(6, 2),
    expansion_rate DECIMAL(6, 2),
    healthy_count INTEGER DEFAULT 0,
    at_risk_count INTEGER DEFAULT 0,
    critical_count INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(snapshot_date)
);

CREATE INDEX idx_mrr_snapshots_date ON mrr_snapshots(snapshot_date DESC);

-- =====================================================
-- Initial Setup Complete
-- =====================================================

-- Grant permissions (adjust as needed for your setup)
-- GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO your_app_user;
-- GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO your_app_user;

-- Success message
DO $$
BEGIN
    RAISE NOTICE 'ListKit GTM Intelligence Platform schema created successfully!';
    RAISE NOTICE 'Tables: unified_customers, alert_history, sync_log, health_score_history';
    RAISE NOTICE 'Views: at_risk_customers, high_value_customers, customer_health_summary';
END $$;
