-- Security Hardening Migration
-- Date: 2026-02-05
-- Purpose: Add audit logging, improve RLS, and security features

-- ============================================
-- 1. AUDIT LOG TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event TEXT NOT NULL,
  data JSONB,
  ip TEXT,
  timestamp TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for querying by event and timestamp
CREATE INDEX IF NOT EXISTS idx_audit_log_event ON audit_log(event);
CREATE INDEX IF NOT EXISTS idx_audit_log_timestamp ON audit_log(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_ip ON audit_log(ip);

-- RLS for audit log (service role only)
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

-- Only service role can insert/read audit logs
CREATE POLICY "audit_log_service_insert" ON audit_log
  FOR INSERT TO service_role
  WITH CHECK (true);

CREATE POLICY "audit_log_service_select" ON audit_log
  FOR SELECT TO service_role
  USING (true);

-- ============================================
-- 2. AGENT API KEY ROTATION TRACKING
-- ============================================
ALTER TABLE agents ADD COLUMN IF NOT EXISTS api_key_rotated_at TIMESTAMPTZ;
ALTER TABLE agents ADD COLUMN IF NOT EXISTS api_key_rotation_reason TEXT;

-- ============================================
-- 3. PURCHASES: Add verified flag
-- ============================================
ALTER TABLE purchases ADD COLUMN IF NOT EXISTS verified_on_chain BOOLEAN DEFAULT false;

-- ============================================
-- 4. STRENGTHEN RLS POLICIES
-- ============================================

-- Agents table: public can read, but updates require auth
DROP POLICY IF EXISTS "agents_public_read" ON agents;
CREATE POLICY "agents_public_read" ON agents
  FOR SELECT
  USING (true);

-- Agents: only service role can update
DROP POLICY IF EXISTS "agents_service_update" ON agents;
CREATE POLICY "agents_service_update" ON agents
  FOR UPDATE TO service_role
  WITH CHECK (true);

-- Agents: only service role can insert
DROP POLICY IF EXISTS "agents_service_insert" ON agents;
CREATE POLICY "agents_service_insert" ON agents
  FOR INSERT TO service_role
  WITH CHECK (true);

-- Purchases: public can read completed purchases
DROP POLICY IF EXISTS "purchases_public_read" ON purchases;
CREATE POLICY "purchases_public_read" ON purchases
  FOR SELECT
  USING (status = 'completed');

-- Purchases: only service role can insert
DROP POLICY IF EXISTS "purchases_service_insert" ON purchases;
CREATE POLICY "purchases_service_insert" ON purchases
  FOR INSERT TO service_role
  WITH CHECK (true);

-- Submissions: public can read approved submissions
DROP POLICY IF EXISTS "submissions_public_read" ON submissions;
CREATE POLICY "submissions_public_read" ON submissions
  FOR SELECT
  USING (status = 'approved');

-- Submissions: only service role can update
DROP POLICY IF EXISTS "submissions_service_update" ON submissions;
CREATE POLICY "submissions_service_update" ON submissions
  FOR UPDATE TO service_role
  WITH CHECK (true);

-- Comments: public can read
DROP POLICY IF EXISTS "comments_public_read" ON comments;
CREATE POLICY "comments_public_read" ON comments
  FOR SELECT
  USING (true);

-- Comments: service role can insert
DROP POLICY IF EXISTS "comments_service_insert" ON comments;
CREATE POLICY "comments_service_insert" ON comments
  FOR INSERT TO service_role
  WITH CHECK (true);

-- ============================================
-- 5. FUNDING LOG RLS
-- ============================================
ALTER TABLE funding_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "funding_log_service" ON funding_log;
CREATE POLICY "funding_log_service" ON funding_log
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

-- ============================================
-- 6. CREATE SECURITY INDEXES
-- ============================================

-- Index for checking duplicate transactions
CREATE UNIQUE INDEX IF NOT EXISTS idx_purchases_tx_hash ON purchases(tx_hash) WHERE tx_hash IS NOT NULL;

-- Index for API key lookups (used in auth)
CREATE INDEX IF NOT EXISTS idx_agents_api_key ON agents(api_key);

-- Index for wallet lookups
CREATE INDEX IF NOT EXISTS idx_agents_wallet ON agents(LOWER(wallet));

-- ============================================
-- 7. COMMENT: Document security measures
-- ============================================
COMMENT ON TABLE audit_log IS 'Security audit trail for sensitive operations';
COMMENT ON COLUMN purchases.verified_on_chain IS 'Whether payment was verified on-chain before recording';
COMMENT ON COLUMN agents.api_key_rotated_at IS 'Timestamp of last API key rotation';
COMMENT ON COLUMN agents.api_key_rotation_reason IS 'Reason for API key rotation (e.g., compromised)';
