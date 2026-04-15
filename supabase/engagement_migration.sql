-- ═══════════════════════════════════════════════════════════
-- FEELZ MACHINE — AI Engagement Flows Migration
-- Run in Supabase SQL Editor
-- ═══════════════════════════════════════════════════════════

-- 1. Track last_seen per user so we know who's gone dormant
ALTER TABLE artists
  ADD COLUMN IF NOT EXISTS last_seen_at       TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS onboarding_step    INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS engagement_segment TEXT DEFAULT 'new'
    CHECK (engagement_segment IN ('new', 'active', 'dormant', 'churned'));

-- Also track last_seen on listeners table
ALTER TABLE listeners
  ADD COLUMN IF NOT EXISTS last_seen_at       TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS engagement_segment TEXT DEFAULT 'new'
    CHECK (engagement_segment IN ('new', 'active', 'dormant', 'churned'));

-- 2. Engagement message log — tracks what was sent to whom and when
--    Prevents double-sending and enforces the 2/week cap
CREATE TABLE IF NOT EXISTS engagement_messages (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  artist_id       UUID REFERENCES artists(id) ON DELETE SET NULL,
  segment         TEXT NOT NULL,        -- 'new', 'active', 'dormant'
  message_type    TEXT NOT NULL,        -- 'onboarding_1', 'reengagement', 'hype', etc.
  title           TEXT NOT NULL,
  body            TEXT NOT NULL,
  sent_at         TIMESTAMPTZ DEFAULT NOW(),
  read_at         TIMESTAMPTZ,
  clicked         BOOLEAN DEFAULT false
);

CREATE INDEX IF NOT EXISTS engagement_messages_user_id_idx
  ON engagement_messages(user_id);
CREATE INDEX IF NOT EXISTS engagement_messages_sent_at_idx
  ON engagement_messages(sent_at);

-- 3. Engagement config — lets you tune the drip from the admin panel
CREATE TABLE IF NOT EXISTS engagement_config (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seed defaults
INSERT INTO engagement_config (key, value) VALUES
  ('drip_enabled',          'true'),
  ('max_per_week',          '2'),
  ('dormant_threshold_days','5'),
  ('churned_threshold_days','30'),
  ('new_user_days',         '14')
ON CONFLICT (key) DO NOTHING;

-- 4. RLS
ALTER TABLE engagement_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE engagement_config   ENABLE ROW LEVEL SECURITY;

-- Users can read their own engagement messages
CREATE POLICY "engagement_read_own" ON engagement_messages FOR SELECT
  USING (user_id = auth.uid());

-- Only service role / admin can insert (done via Netlify function)
CREATE POLICY "engagement_admin_insert" ON engagement_messages FOR INSERT
  WITH CHECK (auth.uid() IN (SELECT user_id FROM admins));

-- Admin can read all
CREATE POLICY "engagement_admin_read" ON engagement_messages FOR ALL
  USING (auth.uid() IN (SELECT user_id FROM admins));

-- Config is admin-only
CREATE POLICY "engagement_config_admin" ON engagement_config FOR ALL
  USING (auth.uid() IN (SELECT user_id FROM admins));

-- Public read for config (so frontend can read drip_enabled)
CREATE POLICY "engagement_config_read" ON engagement_config FOR SELECT
  USING (true);

-- 5. Function to update last_seen — called from the app's activity ping
CREATE OR REPLACE FUNCTION update_last_seen(p_user_id UUID)
RETURNS void AS $$
BEGIN
  UPDATE artists SET last_seen_at = NOW()
  WHERE user_id = p_user_id;

  UPDATE listeners SET last_seen_at = NOW()
  WHERE user_id = p_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
