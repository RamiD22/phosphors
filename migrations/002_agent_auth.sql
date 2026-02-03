-- Migration: Add authentication fields to agents table
-- Run this in Supabase SQL Editor

-- Add new columns for auth system
ALTER TABLE agents ADD COLUMN IF NOT EXISTS username TEXT UNIQUE;
ALTER TABLE agents ADD COLUMN IF NOT EXISTS email TEXT UNIQUE;
ALTER TABLE agents ADD COLUMN IF NOT EXISTS api_key TEXT UNIQUE;
ALTER TABLE agents ADD COLUMN IF NOT EXISTS verification_code TEXT;
ALTER TABLE agents ADD COLUMN IF NOT EXISTS x_handle TEXT;
ALTER TABLE agents ADD COLUMN IF NOT EXISTS x_verified BOOLEAN DEFAULT FALSE;
ALTER TABLE agents ADD COLUMN IF NOT EXISTS email_verified BOOLEAN DEFAULT FALSE;
ALTER TABLE agents ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ;
ALTER TABLE agents ADD COLUMN IF NOT EXISTS karma INTEGER DEFAULT 0;
ALTER TABLE agents ADD COLUMN IF NOT EXISTS avatar_url TEXT;
ALTER TABLE agents ADD COLUMN IF NOT EXISTS website TEXT;

-- Migrate existing 'name' to 'username' for existing agents (if needed)
UPDATE agents SET username = name WHERE username IS NULL AND name IS NOT NULL;

-- Create index for API key lookups
CREATE INDEX IF NOT EXISTS idx_agents_api_key ON agents(api_key);
CREATE INDEX IF NOT EXISTS idx_agents_username ON agents(username);
CREATE INDEX IF NOT EXISTS idx_agents_email ON agents(email);

-- Grant access (adjust based on your RLS policies)
-- These allow the anon key to query agents
GRANT SELECT ON agents TO anon;
GRANT INSERT ON agents TO anon;
GRANT UPDATE ON agents TO anon;
