-- API performance metrics table
CREATE TABLE IF NOT EXISTS api_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  endpoint TEXT NOT NULL,
  duration_ms INTEGER NOT NULL,
  status_code INTEGER DEFAULT 200,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for efficient querying
CREATE INDEX IF NOT EXISTS idx_api_metrics_endpoint ON api_metrics(endpoint);
CREATE INDEX IF NOT EXISTS idx_api_metrics_created_at ON api_metrics(created_at DESC);

-- Auto-cleanup old metrics (keep 7 days)
-- Run this periodically or set up a cron
-- DELETE FROM api_metrics WHERE created_at < NOW() - INTERVAL '7 days';
