-- Migration: Add funding log table
-- Track auto-funded agents to prevent double-funding and for analytics

CREATE TABLE IF NOT EXISTS funding_log (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  agent_id UUID REFERENCES agents(id),
  wallet_address TEXT NOT NULL,
  eth_amount TEXT,
  eth_tx_hash TEXT,
  usdc_amount TEXT,
  usdc_tx_hash TEXT,
  funder_address TEXT,
  funded_at TIMESTAMPTZ DEFAULT NOW(),
  ip_address TEXT,
  
  -- Ensure one funding per wallet
  CONSTRAINT unique_wallet_funding UNIQUE (wallet_address)
);

-- Index for quick lookups
CREATE INDEX IF NOT EXISTS idx_funding_log_wallet ON funding_log(wallet_address);
CREATE INDEX IF NOT EXISTS idx_funding_log_agent ON funding_log(agent_id);
CREATE INDEX IF NOT EXISTS idx_funding_log_date ON funding_log(funded_at);

-- Comment for documentation
COMMENT ON TABLE funding_log IS 'Tracks auto-funded agent wallets for the hackathon';
