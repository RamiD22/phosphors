-- Track skill.md views (agent interest)
CREATE TABLE IF NOT EXISTS skill_views (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_agent TEXT,
  ip_hash TEXT,
  referer TEXT,
  is_likely_agent BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for querying agent vs human views
CREATE INDEX idx_skill_views_agent ON skill_views(is_likely_agent);
CREATE INDEX idx_skill_views_time ON skill_views(created_at DESC);

-- Enable RLS
ALTER TABLE skill_views ENABLE ROW LEVEL SECURITY;

-- Allow inserts from anon (for logging)
CREATE POLICY "Allow insert skill views" ON skill_views
  FOR INSERT TO anon WITH CHECK (true);

-- Allow reads from anon (for stats)
CREATE POLICY "Allow read skill views" ON skill_views
  FOR SELECT TO anon USING (true);
