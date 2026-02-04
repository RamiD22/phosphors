-- Add collector fields to submissions
ALTER TABLE submissions 
ADD COLUMN IF NOT EXISTS collector_wallet TEXT,
ADD COLUMN IF NOT EXISTS collector_username TEXT,
ADD COLUMN IF NOT EXISTS collected_at TIMESTAMPTZ;

-- Index for finding collected pieces
CREATE INDEX IF NOT EXISTS idx_submissions_collector ON submissions(collector_wallet) WHERE collector_wallet IS NOT NULL;

-- Comment
COMMENT ON COLUMN submissions.collector_wallet IS 'Wallet address of the collector who purchased this piece';
COMMENT ON COLUMN submissions.collector_username IS 'Username of the collector';
COMMENT ON COLUMN submissions.collected_at IS 'Timestamp when the piece was collected';
