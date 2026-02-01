-- =====================================================
-- ListKit GTM Intelligence - Supabase Security Setup
-- =====================================================
-- Run this in Supabase SQL Editor to lock down your database
-- Only service_role (your backend/sync scripts) will have access
-- =====================================================

-- 1. Enable Row Level Security on ALL tables
ALTER TABLE unified_customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE alert_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE sync_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE health_score_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE account_managers ENABLE ROW LEVEL SECURITY;
ALTER TABLE churn_events ENABLE ROW LEVEL SECURITY;

-- 2. Drop any existing policies (in case we're re-running)
DROP POLICY IF EXISTS "Service role only - unified_customers" ON unified_customers;
DROP POLICY IF EXISTS "Service role only - alert_history" ON alert_history;
DROP POLICY IF EXISTS "Service role only - sync_log" ON sync_log;
DROP POLICY IF EXISTS "Service role only - health_score_history" ON health_score_history;
DROP POLICY IF EXISTS "Service role only - campaigns" ON campaigns;
DROP POLICY IF EXISTS "Service role only - account_managers" ON account_managers;
DROP POLICY IF EXISTS "Service role only - churn_events" ON churn_events;

-- 3. Create restrictive policies - ONLY service_role can access
-- This blocks ALL public/anon access

CREATE POLICY "Service role only - unified_customers" ON unified_customers
  FOR ALL
  USING (auth.role() = 'service_role');

CREATE POLICY "Service role only - alert_history" ON alert_history
  FOR ALL
  USING (auth.role() = 'service_role');

CREATE POLICY "Service role only - sync_log" ON sync_log
  FOR ALL
  USING (auth.role() = 'service_role');

CREATE POLICY "Service role only - health_score_history" ON health_score_history
  FOR ALL
  USING (auth.role() = 'service_role');

CREATE POLICY "Service role only - campaigns" ON campaigns
  FOR ALL
  USING (auth.role() = 'service_role');

CREATE POLICY "Service role only - account_managers" ON account_managers
  FOR ALL
  USING (auth.role() = 'service_role');

CREATE POLICY "Service role only - churn_events" ON churn_events
  FOR ALL
  USING (auth.role() = 'service_role');

-- 4. Revoke public access from all tables (extra safety)
REVOKE ALL ON unified_customers FROM anon, authenticated;
REVOKE ALL ON alert_history FROM anon, authenticated;
REVOKE ALL ON sync_log FROM anon, authenticated;
REVOKE ALL ON health_score_history FROM anon, authenticated;
REVOKE ALL ON campaigns FROM anon, authenticated;
REVOKE ALL ON account_managers FROM anon, authenticated;
REVOKE ALL ON churn_events FROM anon, authenticated;

-- 5. Verify RLS is enabled (should return 't' for all)
SELECT
  tablename,
  rowsecurity as rls_enabled
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN (
    'unified_customers',
    'alert_history',
    'sync_log',
    'health_score_history',
    'campaigns',
    'account_managers',
    'churn_events'
  );

-- =====================================================
-- DONE! Your database is now secured.
-- Only connections using the service_role key can access data.
-- =====================================================
