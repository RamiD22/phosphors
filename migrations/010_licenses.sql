-- ============================================================================
-- 010_licenses.sql - Commercial Licensing System
-- ============================================================================
-- Enables commercial licensing of Phosphors art pieces
-- Artists can license their animated GIF art for digital signage, apps, marketing
-- ============================================================================

-- Licenses table
CREATE TABLE IF NOT EXISTS licenses (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    piece_id UUID NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,
    licensee_wallet TEXT NOT NULL,
    licensee_name TEXT,
    licensee_email TEXT,
    license_type TEXT NOT NULL CHECK (license_type IN ('personal', 'commercial')),
    duration_days INTEGER NOT NULL DEFAULT 365,
    phos_paid NUMERIC(20, 8) DEFAULT 0,
    usdc_equivalent NUMERIC(20, 6) DEFAULT 0,
    tx_hash TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL,
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'expired', 'revoked')),
    use_case TEXT,
    notes TEXT
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_licenses_piece ON licenses(piece_id);
CREATE INDEX IF NOT EXISTS idx_licenses_licensee ON licenses(licensee_wallet);
CREATE INDEX IF NOT EXISTS idx_licenses_type ON licenses(license_type);
CREATE INDEX IF NOT EXISTS idx_licenses_status ON licenses(status);
CREATE INDEX IF NOT EXISTS idx_licenses_expires ON licenses(expires_at);

-- View: active licenses
CREATE OR REPLACE VIEW active_licenses AS
SELECT 
    l.*,
    s.title AS piece_title,
    s.url AS piece_url,
    s.moltbook AS artist_name,
    s.thumbnail_url
FROM licenses l
JOIN submissions s ON l.piece_id = s.id
WHERE l.status = 'active' 
  AND l.expires_at > NOW();

-- View: license stats
CREATE OR REPLACE VIEW license_stats AS
SELECT
    COUNT(*) FILTER (WHERE license_type = 'personal') AS personal_licenses,
    COUNT(*) FILTER (WHERE license_type = 'commercial') AS commercial_licenses,
    COUNT(*) AS total_licenses,
    SUM(phos_paid) AS total_phos_earned,
    SUM(usdc_equivalent) AS total_usdc_equivalent,
    COUNT(DISTINCT piece_id) AS unique_pieces_licensed,
    COUNT(DISTINCT licensee_wallet) AS unique_licensees
FROM licenses
WHERE status = 'active';

-- Enable RLS
ALTER TABLE licenses ENABLE ROW LEVEL SECURITY;

-- Public can read license status (for verification)
CREATE POLICY "Anyone can view license status" ON licenses
    FOR SELECT USING (true);

-- Only service role can insert/update
CREATE POLICY "Service role can manage licenses" ON licenses
    FOR ALL USING (auth.role() = 'service_role');

-- Function: auto-expire licenses
CREATE OR REPLACE FUNCTION expire_old_licenses()
RETURNS void AS $$
BEGIN
    UPDATE licenses 
    SET status = 'expired'
    WHERE status = 'active' 
      AND expires_at < NOW();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger: set expires_at on insert
CREATE OR REPLACE FUNCTION set_license_expiry()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.expires_at IS NULL THEN
        NEW.expires_at := NEW.created_at + (NEW.duration_days || ' days')::INTERVAL;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_license_expiry_trigger
    BEFORE INSERT ON licenses
    FOR EACH ROW
    EXECUTE FUNCTION set_license_expiry();

-- Add licensable flag to submissions
ALTER TABLE submissions 
ADD COLUMN IF NOT EXISTS licensable BOOLEAN DEFAULT true;

ALTER TABLE submissions 
ADD COLUMN IF NOT EXISTS license_price_phos NUMERIC(20, 8) DEFAULT 100;

-- Comment on table
COMMENT ON TABLE licenses IS 'Commercial and personal licenses for Phosphors art pieces';
COMMENT ON COLUMN licenses.license_type IS 'personal = free, commercial = requires $PHOS payment';
COMMENT ON COLUMN licenses.phos_paid IS 'Amount of $PHOS tokens paid for license';
