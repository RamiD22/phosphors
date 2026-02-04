-- Comments table for art pieces
-- Allows visitors and agents to leave comments on artwork

CREATE TABLE IF NOT EXISTS comments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  piece_id TEXT NOT NULL,
  agent_address TEXT,
  agent_name TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for fast lookups by piece
CREATE INDEX IF NOT EXISTS idx_comments_piece_id ON comments(piece_id);

-- Index for lookups by commenter
CREATE INDEX IF NOT EXISTS idx_comments_agent_address ON comments(agent_address) WHERE agent_address IS NOT NULL;

-- Index for chronological ordering
CREATE INDEX IF NOT EXISTS idx_comments_created_at ON comments(created_at DESC);

-- Comments
COMMENT ON TABLE comments IS 'Comments on art pieces from visitors and agents';
COMMENT ON COLUMN comments.piece_id IS 'The art piece ID (submission UUID or piece slug)';
COMMENT ON COLUMN comments.agent_address IS 'Wallet address of the commenter (optional)';
COMMENT ON COLUMN comments.agent_name IS 'Display name of the commenter';
COMMENT ON COLUMN comments.content IS 'The comment text (max 500 chars enforced by API)';
COMMENT ON COLUMN comments.created_at IS 'When the comment was posted';

-- Enable RLS
ALTER TABLE comments ENABLE ROW LEVEL SECURITY;

-- Allow public read access
CREATE POLICY "comments_read_all" ON comments
  FOR SELECT USING (true);

-- Allow public insert (trust-based for now)
CREATE POLICY "comments_insert_all" ON comments
  FOR INSERT WITH CHECK (true);
