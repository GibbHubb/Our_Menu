-- OM12: Pantry tracking
-- Single-tenant for now (app has no auth); when OM14 lands, add household_id + RLS.

CREATE TABLE IF NOT EXISTS pantry_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  canonical_key VARCHAR(100) NOT NULL UNIQUE,  -- normalised ingredient name (e.g. "onion")
  display_name  VARCHAR(200) NOT NULL,         -- original user input (e.g. "Red Onion")
  added_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pantry_key ON pantry_items(canonical_key);
