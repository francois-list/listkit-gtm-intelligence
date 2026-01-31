-- Migration 001: Add segmentation fields and AM performance tables
-- Run this AFTER the initial schema.sql

-- =====================================================
-- Add Segmentation Fields to unified_customers
-- =====================================================

-- Traffic Source (how they found ListKit)
ALTER TABLE unified_customers ADD COLUMN IF NOT EXISTS traffic_source VARCHAR(100);
COMMENT ON COLUMN unified_customers.traffic_source IS 'How customer found ListKit (google, linkedin, referral, etc.)';

-- Acquisition Type (Product-Led vs Sales-Led)
ALTER TABLE unified_customers ADD COLUMN IF NOT EXISTS acquisition_type VARCHAR(50);
COMMENT ON COLUMN unified_customers.acquisition_type IS 'PLG (product-led), SLG (sales-led), or hybrid';

-- Industry (client's industry)
ALTER TABLE unified_customers ADD COLUMN IF NOT EXISTS industry VARCHAR(100);
COMMENT ON COLUMN unified_customers.industry IS 'Client industry (saas, agency, recruiting, etc.)';

-- Company Size
ALTER TABLE unified_customers ADD COLUMN IF NOT EXISTS company_size VARCHAR(50);
COMMENT ON COLUMN unified_customers.company_size IS 'small, medium, enterprise';

-- MRR Tier (calculated segment)
ALTER TABLE unified_customers ADD COLUMN IF NOT EXISTS mrr_tier VARCHAR(20);
COMMENT ON COLUMN unified_customers.mrr_tier IS 'starter ($0-99), growth ($100-299), pro ($300-499), enterprise ($500+)';

-- Tenure Segment (calculated)
ALTER TABLE unified_customers ADD COLUMN IF NOT EXISTS tenure_segment VARCHAR(20);
COMMENT ON COLUMN unified_customers.tenure_segment IS 'new (<90d), established (90-365d), veteran (365d+)';

-- Plan Type (monthly vs annual)
ALTER TABLE unified_customers ADD COLUMN IF NOT EXISTS plan_type VARCHAR(20);
COMMENT ON COLUMN unified_customers.plan_type IS 'monthly or annual';

-- Airtable Record ID (for AM sync)
ALTER TABLE unified_customers ADD COLUMN IF NOT EXISTS airtable_record_id VARCHAR(50);
ALTER TABLE unified_customers ADD COLUMN IF NOT EXISTS last_airtable_sync TIMESTAMP;

-- Tags for flexible categorization
ALTER TABLE unified_customers ADD COLUMN IF NOT EXISTS tags JSONB DEFAULT '[]';
COMMENT ON COLUMN unified_customers.tags IS 'Array of tags for flexible filtering';

-- Custom attributes from Airtable/HubSpot
ALTER TABLE unified_customers ADD COLUMN IF NOT EXISTS custom_attributes JSONB DEFAULT '{}';

-- Churned tracking
ALTER TABLE unified_customers ADD COLUMN IF NOT EXISTS churned_at TIMESTAMP;
ALTER TABLE unified_customers ADD COLUMN IF NOT EXISTS churn_reason VARCHAR(255);
ALTER TABLE unified_customers ADD COLUMN IF NOT EXISTS win_back_eligible BOOLEAN DEFAULT FALSE;

-- =====================================================
-- Add Indexes for Segmentation Queries
-- =====================================================

CREATE INDEX IF NOT EXISTS idx_traffic_source ON unified_customers(traffic_source);
CREATE INDEX IF NOT EXISTS idx_acquisition_type ON unified_customers(acquisition_type);
CREATE INDEX IF NOT EXISTS idx_industry ON unified_customers(industry);
CREATE INDEX IF NOT EXISTS idx_mrr_tier ON unified_customers(mrr_tier);
CREATE INDEX IF NOT EXISTS idx_tenure_segment ON unified_customers(tenure_segment);
CREATE INDEX IF NOT EXISTS idx_plan_type ON unified_customers(plan_type);
CREATE INDEX IF NOT EXISTS idx_churned_at ON unified_customers(churned_at);

-- Composite indexes for segment analysis
CREATE INDEX IF NOT EXISTS idx_segment_am_health ON unified_customers(assigned_am_email, health_status);
CREATE INDEX IF NOT EXISTS idx_segment_tier_status ON unified_customers(mrr_tier, subscription_status);
CREATE INDEX IF NOT EXISTS idx_segment_acq_industry ON unified_customers(acquisition_type, industry);

-- =====================================================
-- Account Managers Table
-- =====================================================

CREATE TABLE IF NOT EXISTS account_managers (
    am_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    -- Identity
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,

    -- External IDs
    airtable_record_id VARCHAR(50),
    hubspot_owner_id VARCHAR(50),
    calendly_user_uri VARCHAR(255),
    slack_user_id VARCHAR(50),

    -- Status
    is_active BOOLEAN DEFAULT TRUE,
    team VARCHAR(100),  -- e.g., "enterprise", "growth", "starter"

    -- Performance Metrics (rolled up daily)
    total_customers INTEGER DEFAULT 0,
    total_mrr DECIMAL(12, 2) DEFAULT 0,
    total_arr DECIMAL(12, 2) DEFAULT 0,

    avg_health_score DECIMAL(5, 2),
    healthy_customers INTEGER DEFAULT 0,
    at_risk_customers INTEGER DEFAULT 0,
    critical_customers INTEGER DEFAULT 0,

    -- Churn Metrics
    customers_churned_30d INTEGER DEFAULT 0,
    mrr_churned_30d DECIMAL(10, 2) DEFAULT 0,
    churn_rate_30d DECIMAL(5, 2),  -- Percentage

    customers_churned_90d INTEGER DEFAULT 0,
    mrr_churned_90d DECIMAL(10, 2) DEFAULT 0,
    churn_rate_90d DECIMAL(5, 2),

    -- Retention Metrics
    gross_retention_rate DECIMAL(5, 2),  -- GRR
    net_retention_rate DECIMAL(5, 2),    -- NRR

    -- Engagement Metrics
    avg_show_rate DECIMAL(5, 2),
    total_calls_30d INTEGER DEFAULT 0,
    avg_response_time_hours DECIMAL(8, 2),

    -- Timestamps
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    metrics_calculated_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_am_email ON account_managers(email);
CREATE INDEX IF NOT EXISTS idx_am_active ON account_managers(is_active);
CREATE INDEX IF NOT EXISTS idx_am_team ON account_managers(team);

-- =====================================================
-- AM Performance History (for trending)
-- =====================================================

CREATE TABLE IF NOT EXISTS am_performance_history (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    am_id UUID REFERENCES account_managers(am_id) ON DELETE CASCADE,

    -- Snapshot Date
    snapshot_date DATE NOT NULL,

    -- Metrics at this point in time
    total_customers INTEGER,
    total_mrr DECIMAL(12, 2),
    avg_health_score DECIMAL(5, 2),

    healthy_customers INTEGER,
    at_risk_customers INTEGER,
    critical_customers INTEGER,

    customers_churned INTEGER,
    mrr_churned DECIMAL(10, 2),

    gross_retention_rate DECIMAL(5, 2),
    net_retention_rate DECIMAL(5, 2),

    avg_show_rate DECIMAL(5, 2),

    recorded_at TIMESTAMP DEFAULT NOW(),

    UNIQUE(am_id, snapshot_date)
);

CREATE INDEX IF NOT EXISTS idx_am_perf_date ON am_performance_history(snapshot_date);
CREATE INDEX IF NOT EXISTS idx_am_perf_am ON am_performance_history(am_id);

-- =====================================================
-- Churn Events Table (track all churns)
-- =====================================================

CREATE TABLE IF NOT EXISTS churn_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    customer_id UUID REFERENCES unified_customers(customer_id) ON DELETE SET NULL,

    -- Customer snapshot at churn
    email VARCHAR(255) NOT NULL,
    name VARCHAR(255),
    company_name VARCHAR(255),

    -- Revenue lost
    mrr_at_churn DECIMAL(10, 2),
    ltv_at_churn DECIMAL(10, 2),

    -- Assignment at churn
    assigned_am VARCHAR(255),
    assigned_am_email VARCHAR(255),

    -- Churn details
    churned_at TIMESTAMP NOT NULL,
    churn_reason VARCHAR(255),
    churn_type VARCHAR(50),  -- voluntary, involuntary (payment failure)

    -- Health at churn
    health_score_at_churn DECIMAL(5, 2),
    health_status_at_churn VARCHAR(20),
    risk_signals_at_churn JSONB,

    -- Segments at churn
    mrr_tier VARCHAR(20),
    tenure_segment VARCHAR(20),
    industry VARCHAR(100),
    acquisition_type VARCHAR(50),

    -- Days in warning state before churn
    days_at_risk INTEGER,
    days_as_customer INTEGER,

    -- Win-back tracking
    win_back_attempted BOOLEAN DEFAULT FALSE,
    win_back_succeeded BOOLEAN DEFAULT FALSE,
    win_back_at TIMESTAMP,

    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_churn_date ON churn_events(churned_at);
CREATE INDEX IF NOT EXISTS idx_churn_am ON churn_events(assigned_am_email);
CREATE INDEX IF NOT EXISTS idx_churn_reason ON churn_events(churn_reason);
CREATE INDEX IF NOT EXISTS idx_churn_type ON churn_events(churn_type);

-- =====================================================
-- Views for AM Performance Analysis
-- =====================================================

-- AM Leaderboard View
CREATE OR REPLACE VIEW am_leaderboard AS
SELECT
    am.am_id,
    am.name,
    am.email,
    am.team,
    am.total_customers,
    am.total_mrr,
    am.avg_health_score,
    am.at_risk_customers + am.critical_customers as at_risk_total,
    am.churn_rate_30d,
    am.gross_retention_rate,
    am.net_retention_rate,
    am.avg_show_rate,
    -- Rank by different metrics
    RANK() OVER (ORDER BY am.total_mrr DESC) as mrr_rank,
    RANK() OVER (ORDER BY am.avg_health_score DESC) as health_rank,
    RANK() OVER (ORDER BY am.churn_rate_30d ASC) as churn_rank,
    RANK() OVER (ORDER BY am.gross_retention_rate DESC) as retention_rank
FROM account_managers am
WHERE am.is_active = TRUE
ORDER BY am.total_mrr DESC;

-- AM Customer Distribution View
CREATE OR REPLACE VIEW am_customer_distribution AS
SELECT
    assigned_am_email,
    assigned_am,
    COUNT(*) as total_customers,
    SUM(mrr) as total_mrr,
    AVG(health_score) as avg_health_score,
    SUM(CASE WHEN health_status = 'healthy' THEN 1 ELSE 0 END) as healthy,
    SUM(CASE WHEN health_status = 'at_risk' THEN 1 ELSE 0 END) as at_risk,
    SUM(CASE WHEN health_status = 'high_risk' THEN 1 ELSE 0 END) as high_risk,
    SUM(CASE WHEN health_status = 'critical' THEN 1 ELSE 0 END) as critical
FROM unified_customers
WHERE subscription_status = 'active'
  AND assigned_am_email IS NOT NULL
GROUP BY assigned_am_email, assigned_am
ORDER BY total_mrr DESC;

-- Segment Analysis View
CREATE OR REPLACE VIEW segment_analysis AS
SELECT
    mrr_tier,
    acquisition_type,
    industry,
    COUNT(*) as customer_count,
    SUM(mrr) as total_mrr,
    AVG(health_score) as avg_health_score,
    AVG(churn_risk) as avg_churn_risk,
    SUM(CASE WHEN health_status = 'healthy' THEN 1 ELSE 0 END)::DECIMAL / COUNT(*)::DECIMAL * 100 as healthy_pct
FROM unified_customers
WHERE subscription_status = 'active'
GROUP BY mrr_tier, acquisition_type, industry
ORDER BY total_mrr DESC;

-- =====================================================
-- Function to Calculate AM Metrics
-- =====================================================

CREATE OR REPLACE FUNCTION calculate_am_metrics(am_email VARCHAR)
RETURNS VOID AS $$
DECLARE
    metrics RECORD;
BEGIN
    -- Calculate metrics from unified_customers
    SELECT
        COUNT(*) as total_customers,
        COALESCE(SUM(mrr), 0) as total_mrr,
        COALESCE(AVG(health_score), 0) as avg_health_score,
        SUM(CASE WHEN health_status = 'healthy' THEN 1 ELSE 0 END) as healthy_customers,
        SUM(CASE WHEN health_status IN ('at_risk', 'high_risk') THEN 1 ELSE 0 END) as at_risk_customers,
        SUM(CASE WHEN health_status = 'critical' THEN 1 ELSE 0 END) as critical_customers
    INTO metrics
    FROM unified_customers
    WHERE assigned_am_email = am_email
      AND subscription_status = 'active';

    -- Update account_managers table
    UPDATE account_managers
    SET
        total_customers = metrics.total_customers,
        total_mrr = metrics.total_mrr,
        total_arr = metrics.total_mrr * 12,
        avg_health_score = metrics.avg_health_score,
        healthy_customers = metrics.healthy_customers,
        at_risk_customers = metrics.at_risk_customers,
        critical_customers = metrics.critical_customers,
        metrics_calculated_at = NOW(),
        updated_at = NOW()
    WHERE email = am_email;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- Function to Calculate MRR Tier
-- =====================================================

CREATE OR REPLACE FUNCTION calculate_mrr_tier(mrr DECIMAL)
RETURNS VARCHAR AS $$
BEGIN
    IF mrr IS NULL OR mrr <= 0 THEN
        RETURN 'free';
    ELSIF mrr < 100 THEN
        RETURN 'starter';
    ELSIF mrr < 300 THEN
        RETURN 'growth';
    ELSIF mrr < 500 THEN
        RETURN 'pro';
    ELSE
        RETURN 'enterprise';
    END IF;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- Function to Calculate Tenure Segment
-- =====================================================

CREATE OR REPLACE FUNCTION calculate_tenure_segment(signup TIMESTAMP)
RETURNS VARCHAR AS $$
DECLARE
    days_as_customer INTEGER;
BEGIN
    IF signup IS NULL THEN
        RETURN 'unknown';
    END IF;

    days_as_customer := EXTRACT(DAY FROM NOW() - signup);

    IF days_as_customer < 90 THEN
        RETURN 'new';
    ELSIF days_as_customer < 365 THEN
        RETURN 'established';
    ELSE
        RETURN 'veteran';
    END IF;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- Trigger to Auto-Calculate Segments on Insert/Update
-- =====================================================

CREATE OR REPLACE FUNCTION update_customer_segments()
RETURNS TRIGGER AS $$
BEGIN
    -- Calculate MRR tier
    NEW.mrr_tier := calculate_mrr_tier(NEW.mrr);

    -- Calculate tenure segment
    NEW.tenure_segment := calculate_tenure_segment(NEW.signup_date);

    -- Calculate plan type from billing interval
    IF NEW.billing_interval = 'year' THEN
        NEW.plan_type := 'annual';
    ELSE
        NEW.plan_type := 'monthly';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS calculate_segments_trigger ON unified_customers;
CREATE TRIGGER calculate_segments_trigger
    BEFORE INSERT OR UPDATE ON unified_customers
    FOR EACH ROW
    EXECUTE FUNCTION update_customer_segments();

-- =====================================================
-- Migration Complete
-- =====================================================

DO $$
BEGIN
    RAISE NOTICE 'Migration 001 completed successfully!';
    RAISE NOTICE 'Added: segmentation fields, account_managers table, am_performance_history, churn_events';
    RAISE NOTICE 'Added: AM leaderboard view, segment analysis view';
END $$;
