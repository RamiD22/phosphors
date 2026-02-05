-- Migration: Bounties and Referral Rewards System
-- Run this on Supabase SQL editor

-- =============================================================================
-- REFERRALS TABLE
-- =============================================================================
CREATE TABLE IF NOT EXISTS referrals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_wallet TEXT NOT NULL,
  referred_wallet TEXT NOT NULL,
  referral_code TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'converted')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  converted_at TIMESTAMPTZ
);

-- Indexes for referral lookups
CREATE INDEX IF NOT EXISTS idx_referrals_referrer_wallet ON referrals(referrer_wallet);
CREATE INDEX IF NOT EXISTS idx_referrals_referred_wallet ON referrals(referred_wallet);
CREATE INDEX IF NOT EXISTS idx_referrals_code ON referrals(referral_code);
CREATE INDEX IF NOT EXISTS idx_referrals_status ON referrals(status);

-- Ensure one referral per referred wallet
CREATE UNIQUE INDEX IF NOT EXISTS idx_referrals_unique_referred ON referrals(referred_wallet);

-- =============================================================================
-- BOUNTY EVENTS TABLE
-- =============================================================================
CREATE TABLE IF NOT EXISTS bounty_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_address TEXT NOT NULL,
  event_type TEXT NOT NULL CHECK (event_type IN (
    'first_sale',
    'five_sales',
    'ten_sales',
    'featured',
    'referral_signup',
    'referral_first_sale',
    'referral_first_collect',
    'referral_ten_sales'
  )),
  phos_amount DECIMAL(20, 6) NOT NULL,
  submission_id UUID,
  referred_wallet TEXT,
  tx_hash TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for bounty lookups
CREATE INDEX IF NOT EXISTS idx_bounty_events_wallet ON bounty_events(wallet_address);
CREATE INDEX IF NOT EXISTS idx_bounty_events_status ON bounty_events(status);
CREATE INDEX IF NOT EXISTS idx_bounty_events_type ON bounty_events(event_type);
CREATE INDEX IF NOT EXISTS idx_bounty_events_created ON bounty_events(created_at DESC);

-- Prevent duplicate bounty events for same wallet + event_type combination
-- (allows multiple referral events with different referred_wallet)
CREATE UNIQUE INDEX IF NOT EXISTS idx_bounty_events_unique_milestone 
ON bounty_events(wallet_address, event_type) 
WHERE event_type IN ('first_sale', 'five_sales', 'ten_sales', 'featured');

-- =============================================================================
-- ADD REFERRAL CODE TO AGENTS
-- =============================================================================
ALTER TABLE agents ADD COLUMN IF NOT EXISTS referral_code TEXT UNIQUE;

-- Create index for referral code lookups
CREATE INDEX IF NOT EXISTS idx_agents_referral_code ON agents(referral_code);

-- =============================================================================
-- VIEWS FOR BOUNTY STATS
-- =============================================================================

-- Summary of all bounty events
CREATE OR REPLACE VIEW bounty_stats AS
SELECT 
  COUNT(*) as total_bounty_events,
  COUNT(*) FILTER (WHERE status = 'pending') as pending_bounties,
  COUNT(*) FILTER (WHERE status = 'paid') as paid_bounties,
  COALESCE(SUM(phos_amount), 0) as total_phos_issued,
  COALESCE(SUM(phos_amount) FILTER (WHERE status = 'paid'), 0) as total_phos_paid,
  COALESCE(SUM(phos_amount) FILTER (WHERE status = 'pending'), 0) as total_phos_pending
FROM bounty_events;

-- Bounty stats by event type
CREATE OR REPLACE VIEW bounty_stats_by_type AS
SELECT 
  event_type,
  COUNT(*) as event_count,
  COALESCE(SUM(phos_amount), 0) as total_phos,
  COUNT(*) FILTER (WHERE status = 'paid') as paid_count,
  COUNT(*) FILTER (WHERE status = 'pending') as pending_count
FROM bounty_events
GROUP BY event_type
ORDER BY total_phos DESC;

-- Referral leaderboard
CREATE OR REPLACE VIEW referral_leaderboard AS
SELECT 
  r.referrer_wallet,
  a.username as referrer_username,
  COUNT(r.id) as total_referrals,
  COUNT(r.id) FILTER (WHERE r.status = 'converted') as converted_referrals,
  COALESCE(SUM(b.phos_amount), 0) as total_phos_earned
FROM referrals r
LEFT JOIN agents a ON LOWER(a.wallet) = LOWER(r.referrer_wallet)
LEFT JOIN bounty_events b ON LOWER(b.wallet_address) = LOWER(r.referrer_wallet) 
  AND b.event_type LIKE 'referral_%'
GROUP BY r.referrer_wallet, a.username
ORDER BY total_phos_earned DESC;

-- Agent bounty summary
CREATE OR REPLACE VIEW agent_bounty_summary AS
SELECT 
  b.wallet_address,
  a.username,
  COUNT(b.id) as total_bounty_events,
  COALESCE(SUM(b.phos_amount), 0) as total_phos_earned,
  COALESCE(SUM(b.phos_amount) FILTER (WHERE b.status = 'pending'), 0) as pending_phos,
  COALESCE(SUM(b.phos_amount) FILTER (WHERE b.status = 'paid'), 0) as paid_phos,
  ARRAY_AGG(DISTINCT b.event_type) as earned_bounty_types
FROM bounty_events b
LEFT JOIN agents a ON LOWER(a.wallet) = LOWER(b.wallet_address)
GROUP BY b.wallet_address, a.username
ORDER BY total_phos_earned DESC;

-- =============================================================================
-- RLS POLICIES
-- =============================================================================
ALTER TABLE referrals ENABLE ROW LEVEL SECURITY;
ALTER TABLE bounty_events ENABLE ROW LEVEL SECURITY;

-- Public can read referrals (transparency)
CREATE POLICY "Anyone can view referrals" ON referrals
  FOR SELECT USING (true);

-- Service role can insert/update referrals
CREATE POLICY "Service role can insert referrals" ON referrals
  FOR INSERT WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "Service role can update referrals" ON referrals
  FOR UPDATE USING (auth.role() = 'service_role');

-- Public can read bounty events (transparency)
CREATE POLICY "Anyone can view bounty events" ON bounty_events
  FOR SELECT USING (true);

-- Service role can insert/update bounty events
CREATE POLICY "Service role can insert bounty events" ON bounty_events
  FOR INSERT WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "Service role can update bounty events" ON bounty_events
  FOR UPDATE USING (auth.role() = 'service_role');

-- =============================================================================
-- COMMENTS
-- =============================================================================
COMMENT ON TABLE referrals IS 'Tracks referral relationships between agents';
COMMENT ON COLUMN referrals.referrer_wallet IS 'Wallet address of agent who referred';
COMMENT ON COLUMN referrals.referred_wallet IS 'Wallet address of agent who was referred';
COMMENT ON COLUMN referrals.status IS 'pending: signup only, active: verified, converted: made first sale/collect';

COMMENT ON TABLE bounty_events IS 'Tracks $Phosphors bounty rewards for agent milestones';
COMMENT ON COLUMN bounty_events.event_type IS 'Type of bounty: first_sale, five_sales, ten_sales, featured, referral_*';
COMMENT ON COLUMN bounty_events.phos_amount IS 'Amount of $Phosphors awarded';
COMMENT ON COLUMN bounty_events.referred_wallet IS 'For referral bounties, the wallet that triggered the event';
