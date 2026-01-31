-- Migration: Add SmartLead client tracking fields
-- Purpose: Enable proper campaign-to-customer linking via SmartLead client API

-- =====================================================
-- Add SmartLead client fields to campaigns table
-- =====================================================

-- Add smartlead_client_id (the SmartLead client ID that owns this campaign)
ALTER TABLE campaigns
ADD COLUMN IF NOT EXISTS smartlead_client_id BIGINT;

-- Add smartlead_client_email (the email of the SmartLead client)
ALTER TABLE campaigns
ADD COLUMN IF NOT EXISTS smartlead_client_email VARCHAR(255);

-- Index for efficient client lookups
CREATE INDEX IF NOT EXISTS idx_campaigns_smartlead_client_id
ON campaigns(smartlead_client_id);

CREATE INDEX IF NOT EXISTS idx_campaigns_smartlead_client_email
ON campaigns(smartlead_client_email);

-- =====================================================
-- Add SmartLead sync tracking fields to unified_customers
-- =====================================================

-- SmartLead client ID for this customer (if matched)
ALTER TABLE unified_customers
ADD COLUMN IF NOT EXISTS smartlead_client_id BIGINT;

-- Sync status: pending, synced, failed, no_match
ALTER TABLE unified_customers
ADD COLUMN IF NOT EXISTS smartlead_sync_status VARCHAR(20) DEFAULT 'pending';

-- Last time we synced SmartLead data for this customer
ALTER TABLE unified_customers
ADD COLUMN IF NOT EXISTS smartlead_last_synced_at TIMESTAMP;

-- Index for efficient sync status queries
CREATE INDEX IF NOT EXISTS idx_customers_smartlead_client_id
ON unified_customers(smartlead_client_id);

CREATE INDEX IF NOT EXISTS idx_customers_smartlead_sync_status
ON unified_customers(smartlead_sync_status);

-- =====================================================
-- Success message
-- =====================================================
DO $$
BEGIN
    RAISE NOTICE 'SmartLead client tracking fields added successfully!';
    RAISE NOTICE 'campaigns: added smartlead_client_id, smartlead_client_email';
    RAISE NOTICE 'unified_customers: added smartlead_client_id, smartlead_sync_status, smartlead_last_synced_at';
END $$;
