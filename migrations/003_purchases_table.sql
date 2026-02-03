-- Migration: Create purchases table for activity feed
-- Run this in Supabase SQL Editor

-- Purchases table
CREATE TABLE IF NOT EXISTS purchases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  piece_id UUID REFERENCES pieces(id) ON DELETE SET NULL,
  buyer_id UUID REFERENCES agents(id) ON DELETE SET NULL,
  seller_id UUID REFERENCES agents(id) ON DELETE SET NULL,
  
  -- Transaction details
  tx_hash TEXT NOT NULL,
  amount_usdc DECIMAL(10, 6) NOT NULL,
  network TEXT NOT NULL DEFAULT 'base-sepolia',
  
  -- Denormalized for faster queries
  piece_identifier TEXT,
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

-- Index for buyer/seller lookups
CREATE INDEX IF NOT EXISTS idx_purchases_buyer ON purchases(buyer_id);
CREATE INDEX IF NOT EXISTS idx_purchases_seller ON purchases(seller_id);
CREATE INDEX IF NOT EXISTS idx_purchases_piece ON purchases(piece_id);

-- RLS policies (if using RLS)
-- ALTER TABLE purchases ENABLE ROW LEVEL SECURITY;

-- Allow read access to all
-- CREATE POLICY "Allow public read" ON purchases FOR SELECT USING (true);

-- Allow insert only from service role (API)
-- CREATE POLICY "Allow service insert" ON purchases FOR INSERT WITH CHECK (true);

-- Update agents collected_count trigger
CREATE OR REPLACE FUNCTION update_collected_count()
RETURNS TRIGGER AS $$
BEGIN
  -- Increment buyer's collected count
  IF NEW.buyer_id IS NOT NULL THEN
    UPDATE agents 
    SET collected_count = COALESCE(collected_count, 0) + 1
    WHERE id = NEW.buyer_id;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger
DROP TRIGGER IF EXISTS on_purchase_created ON purchases;
CREATE TRIGGER on_purchase_created
  AFTER INSERT ON purchases
  FOR EACH ROW
  EXECUTE FUNCTION update_collected_count();

-- View for activity feed with all details
CREATE OR REPLACE VIEW activity_feed AS
SELECT 
  p.id,
  p.tx_hash,
  p.amount_usdc,
  p.network,
  p.piece_identifier,
  p.piece_title,
  p.buyer_username,
  p.seller_username,
  p.created_at,
  CASE 
    WHEN p.network = 'base-mainnet' THEN 'https://basescan.org/tx/' || p.tx_hash
    ELSE 'https://sepolia.basescan.org/tx/' || p.tx_hash
  END as explorer_url
FROM purchases p
WHERE p.status = 'completed'
ORDER BY p.created_at DESC;

COMMENT ON TABLE purchases IS 'Records all art purchases on Phosphors for activity feed';
