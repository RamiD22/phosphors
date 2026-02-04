-- Migration: Create standalone purchases table for activity feed
-- Run this in Supabase SQL Editor

-- Drop the old view/trigger if they exist
DROP VIEW IF EXISTS activity_feed;
DROP TRIGGER IF EXISTS on_purchase_created ON purchases;
DROP FUNCTION IF EXISTS update_collected_count();

-- Purchases table (standalone, no FK to nonexistent pieces)
CREATE TABLE IF NOT EXISTS purchases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id UUID REFERENCES submissions(id) ON DELETE SET NULL,
  buyer_id UUID REFERENCES agents(id) ON DELETE SET NULL,
  seller_id UUID REFERENCES agents(id) ON DELETE SET NULL,
  
  -- Transaction details
  tx_hash TEXT NOT NULL,
  payout_tx_hash TEXT, -- TX for artist payout
  amount_usdc DECIMAL(10, 6) NOT NULL,
  artist_payout DECIMAL(10, 6), -- Amount paid to artist
  network TEXT NOT NULL DEFAULT 'base-sepolia',
  
  -- Denormalized for faster queries
  piece_title TEXT,
  buyer_username TEXT,
  seller_username TEXT,
  buyer_wallet TEXT,
  seller_wallet TEXT,
  
  -- Status
  status TEXT DEFAULT 'completed' CHECK (status IN ('pending', 'completed', 'failed', 'refunded')),
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT now(),
  
  -- Indexes for common queries
  CONSTRAINT unique_tx_hash UNIQUE (tx_hash)
);

-- Index for activity feed (recent purchases)
CREATE INDEX IF NOT EXISTS idx_purchases_created_at ON purchases(created_at DESC);

-- Grant access
GRANT SELECT ON purchases TO anon;
GRANT INSERT ON purchases TO anon;
GRANT SELECT ON purchases TO authenticated;
GRANT INSERT ON purchases TO authenticated;

-- View for activity feed 
CREATE OR REPLACE VIEW activity_feed AS
SELECT 
  p.id,
  p.tx_hash,
  p.payout_tx_hash,
  p.amount_usdc,
  p.artist_payout,
  p.network,
  p.piece_title,
  p.buyer_username,
  p.seller_username,
  p.seller_wallet,
  p.created_at,
  CASE 
    WHEN p.network = 'base-mainnet' THEN 'https://basescan.org/tx/' || p.tx_hash
    ELSE 'https://sepolia.basescan.org/tx/' || p.tx_hash
  END as explorer_url,
  CASE 
    WHEN p.payout_tx_hash IS NOT NULL THEN
      CASE 
        WHEN p.network = 'base-mainnet' THEN 'https://basescan.org/tx/' || p.payout_tx_hash
        ELSE 'https://sepolia.basescan.org/tx/' || p.payout_tx_hash
      END
    ELSE NULL
  END as payout_explorer_url
FROM purchases p
WHERE p.status = 'completed'
ORDER BY p.created_at DESC;

GRANT SELECT ON activity_feed TO anon;

COMMENT ON TABLE purchases IS 'Records all art purchases on Phosphors for activity feed';
