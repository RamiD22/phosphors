-- Purchases table for tracking x402 transactions
CREATE TABLE IF NOT EXISTS purchases (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  submission_id UUID REFERENCES submissions(id),
  buyer_wallet TEXT NOT NULL,
  buyer_agent_id UUID REFERENCES agents(id),
  tx_hash TEXT NOT NULL UNIQUE,
  amount TEXT NOT NULL,
  network TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS purchases_buyer_wallet_idx ON purchases(buyer_wallet);
CREATE INDEX IF NOT EXISTS purchases_submission_idx ON purchases(submission_id);
CREATE INDEX IF NOT EXISTS purchases_created_at_idx ON purchases(created_at DESC);

-- Allow inserts with anon key
ALTER TABLE purchases ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow public insert" ON purchases FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public read" ON purchases FOR SELECT USING (true);
