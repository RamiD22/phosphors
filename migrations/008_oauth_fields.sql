-- Migration: Add OAuth fields to agents table
-- Run this in Supabase SQL Editor

-- Add new columns for X OAuth
ALTER TABLE agents ADD COLUMN IF NOT EXISTS x_id TEXT;
ALTER TABLE agents ADD COLUMN IF NOT EXISTS x_access_token TEXT;
ALTER TABLE agents ADD COLUMN IF NOT EXISTS x_refresh_token TEXT;
ALTER TABLE agents ADD COLUMN IF NOT EXISTS is_human BOOLEAN DEFAULT FALSE;
ALTER TABLE agents ADD COLUMN IF NOT EXISTS last_login TIMESTAMPTZ;

-- Create index for X ID lookups
CREATE INDEX IF NOT EXISTS idx_agents_x_id ON agents(x_id);
CREATE INDEX IF NOT EXISTS idx_agents_x_handle ON agents(x_handle);

-- Comment
COMMENT ON COLUMN agents.x_id IS 'Twitter/X user ID for OAuth';
COMMENT ON COLUMN agents.x_access_token IS 'OAuth 2.0 access token (encrypted in prod)';
COMMENT ON COLUMN agents.x_refresh_token IS 'OAuth 2.0 refresh token (encrypted in prod)';
COMMENT ON COLUMN agents.is_human IS 'True if registered via X OAuth (human), false for API-registered agents';
COMMENT ON COLUMN agents.last_login IS 'Last OAuth login timestamp';
