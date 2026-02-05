-- Migration: Protocol fees and burn tracking
-- Run this on Supabase SQL editor

-- Add protocol fee columns to purchases (if not exist)
ALTER TABLE purchases 
ADD COLUMN IF NOT EXISTS base_price DECIMAL(20, 6),
ADD COLUMN IF NOT EXISTS protocol_fee DECIMAL(20, 6) DEFAULT 0;

-- Create burn events table
CREATE TABLE IF NOT EXISTS burn_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  usdc_amount DECIMAL(20, 6) NOT NULL,
  phos_amount DECIMAL(20, 6),
  swap_tx_hash TEXT,
  burn_tx_hash TEXT,
  network TEXT NOT NULL DEFAULT 'base-sepolia',
  status TEXT DEFAULT 'completed',
  executed_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create index for burn events
CREATE INDEX IF NOT EXISTS idx_burn_events_executed_at ON burn_events(executed_at DESC);

-- Create view for burn stats
CREATE OR REPLACE VIEW burn_stats AS
SELECT 
  COUNT(*) as total_burns,
  COALESCE(SUM(usdc_amount), 0) as total_usdc_burned,
  COALESCE(SUM(phos_amount), 0) as total_phos_burned,
  MAX(executed_at) as last_burn_at
FROM burn_events
WHERE status = 'completed';

-- Create view for fee accumulation
CREATE OR REPLACE VIEW fee_accumulation AS
SELECT 
  COALESCE(SUM(protocol_fee), 0) as total_fees_collected,
  COUNT(*) as total_purchases_with_fees,
  DATE_TRUNC('month', created_at) as month
FROM purchases
WHERE protocol_fee > 0
GROUP BY DATE_TRUNC('month', created_at)
ORDER BY month DESC;

-- RLS policies
ALTER TABLE burn_events ENABLE ROW LEVEL SECURITY;

-- Public can read burn events (transparency)
CREATE POLICY "Anyone can view burn events" ON burn_events
  FOR SELECT USING (true);

-- Only service role can insert
CREATE POLICY "Service role can insert burn events" ON burn_events
  FOR INSERT WITH CHECK (auth.role() = 'service_role');

COMMENT ON TABLE burn_events IS 'Monthly $PHOS burn events from protocol fees';
COMMENT ON COLUMN burn_events.usdc_amount IS 'USDC swapped for $PHOS';
COMMENT ON COLUMN burn_events.phos_amount IS '$PHOS tokens burned';
