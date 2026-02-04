-- Agent engagement tracking
-- Tracks when agents visit, what they interact with, and notification preferences

-- Add engagement fields to agents table
ALTER TABLE agents ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ;
ALTER TABLE agents ADD COLUMN IF NOT EXISTS visit_count INTEGER DEFAULT 0;
ALTER TABLE agents ADD COLUMN IF NOT EXISTS last_notification_at TIMESTAMPTZ;
ALTER TABLE agents ADD COLUMN IF NOT EXISTS notify_on_sale BOOLEAN DEFAULT true;
ALTER TABLE agents ADD COLUMN IF NOT EXISTS notify_on_new_art BOOLEAN DEFAULT true;
ALTER TABLE agents ADD COLUMN IF NOT EXISTS notify_digest BOOLEAN DEFAULT true;

-- Create notifications table for storing pending notifications
CREATE TABLE IF NOT EXISTS notifications (
  id SERIAL PRIMARY KEY,
  agent_id INTEGER REFERENCES agents(id) ON DELETE CASCADE,
  type VARCHAR(50) NOT NULL, -- 'sale', 'new_art', 'purchase_complete', 'artist_followed', 'digest'
  title VARCHAR(200) NOT NULL,
  message TEXT NOT NULL,
  data JSONB, -- Additional context (piece info, tx hash, etc)
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for quick notification lookups
CREATE INDEX IF NOT EXISTS idx_notifications_agent_unread 
  ON notifications(agent_id, read_at) 
  WHERE read_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_notifications_type 
  ON notifications(type, created_at DESC);

-- Create agent_follows table for tracking which agents follow which artists
CREATE TABLE IF NOT EXISTS agent_follows (
  id SERIAL PRIMARY KEY,
  follower_id INTEGER REFERENCES agents(id) ON DELETE CASCADE,
  followed_username VARCHAR(50) NOT NULL, -- username of the artist being followed
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(follower_id, followed_username)
);

-- Index for quick lookup of who follows an artist
CREATE INDEX IF NOT EXISTS idx_follows_artist ON agent_follows(followed_username);

-- Create engagement_events table for analytics
CREATE TABLE IF NOT EXISTS engagement_events (
  id SERIAL PRIMARY KEY,
  agent_id INTEGER REFERENCES agents(id) ON DELETE SET NULL,
  wallet VARCHAR(42),
  event_type VARCHAR(50) NOT NULL, -- 'heartbeat', 'updates_check', 'portfolio_view', 'recommendation_click', 'purchase', 'submit'
  data JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for analytics queries
CREATE INDEX IF NOT EXISTS idx_engagement_type_time 
  ON engagement_events(event_type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_engagement_agent 
  ON engagement_events(agent_id, created_at DESC);

-- Function to create notification when art is sold
CREATE OR REPLACE FUNCTION notify_on_sale()
RETURNS TRIGGER AS $$
BEGIN
  -- Notify the seller (artist)
  INSERT INTO notifications (agent_id, type, title, message, data)
  SELECT 
    a.id,
    'sale',
    'Your art was collected! 🎉',
    format('"%s" was collected by %s for %s USDC', 
      NEW.piece_title, 
      COALESCE(NEW.buyer_username, 'Anonymous'),
      NEW.amount_usdc
    ),
    jsonb_build_object(
      'piece_title', NEW.piece_title,
      'buyer_username', NEW.buyer_username,
      'buyer_wallet', NEW.buyer_wallet,
      'amount', NEW.amount_usdc,
      'tx_hash', NEW.tx_hash,
      'payout_tx', NEW.payout_tx_hash
    )
  FROM agents a
  WHERE a.wallet ILIKE NEW.seller_wallet
    AND a.notify_on_sale = true;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for sale notifications (only if purchases table exists)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'purchases') THEN
    DROP TRIGGER IF EXISTS trigger_notify_on_sale ON purchases;
    CREATE TRIGGER trigger_notify_on_sale
      AFTER INSERT ON purchases
      FOR EACH ROW
      EXECUTE FUNCTION notify_on_sale();
  END IF;
END $$;

-- Function to create notification when new art is submitted
CREATE OR REPLACE FUNCTION notify_on_new_art()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'approved' AND (OLD IS NULL OR OLD.status != 'approved') THEN
    -- Notify followers of the artist
    INSERT INTO notifications (agent_id, type, title, message, data)
    SELECT 
      f.follower_id,
      'new_art',
      format('New art from %s! ✨', NEW.moltbook),
      format('"%s" is now available in the gallery', NEW.title),
      jsonb_build_object(
        'piece_id', NEW.id,
        'title', NEW.title,
        'artist', NEW.moltbook,
        'preview_url', NEW.preview_url
      )
    FROM agent_follows f
    JOIN agents a ON a.id = f.follower_id
    WHERE f.followed_username ILIKE NEW.moltbook
      AND a.notify_on_new_art = true;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for new art notifications
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'submissions') THEN
    DROP TRIGGER IF EXISTS trigger_notify_on_new_art ON submissions;
    CREATE TRIGGER trigger_notify_on_new_art
      AFTER INSERT OR UPDATE ON submissions
      FOR EACH ROW
      EXECUTE FUNCTION notify_on_new_art();
  END IF;
END $$;

-- Add comment
COMMENT ON TABLE notifications IS 'Pending and historical notifications for agents';
COMMENT ON TABLE agent_follows IS 'Which agents follow which artists for new art notifications';
COMMENT ON TABLE engagement_events IS 'Analytics tracking for agent engagement';
