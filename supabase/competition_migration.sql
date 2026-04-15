-- ═══════════════════════════════════════════════════════════
-- FEELZ MACHINE — Competition Rooms Migration
-- Run this in Supabase SQL Editor
-- ═══════════════════════════════════════════════════════════

-- 1. Add competition room type to chat_rooms
ALTER TABLE chat_rooms
  ADD COLUMN IF NOT EXISTS room_type TEXT NOT NULL DEFAULT 'standard'
    CHECK (room_type IN ('standard', 'competition'));

-- 2. Competition rooms table (one per chat_room in competition mode)
CREATE TABLE IF NOT EXISTS competitions (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id             UUID REFERENCES chat_rooms(id) ON DELETE CASCADE,
  title               TEXT NOT NULL,
  description         TEXT,
  brief               TEXT,           -- what you're looking for (e.g. "Best feature verse")
  genre               TEXT,
  bpm                 INTEGER,
  key                 TEXT,           -- e.g. "C minor"
  stem_pack_url       TEXT,           -- download link you provide
  mp3_preview_url     TEXT,           -- your base track preview
  prize_description   TEXT,           -- "Featured placement + Verified" or "R500 + Featured"
  cash_prize_amount   NUMERIC(10,2)   DEFAULT 0,
  cash_prize_currency TEXT            DEFAULT 'ZAR',
  status              TEXT NOT NULL   DEFAULT 'upcoming'
    CHECK (status IN ('upcoming', 'open', 'voting', 'closed', 'completed')),
  entries_open_at     TIMESTAMPTZ,
  entries_close_at    TIMESTAMPTZ,
  voting_open_at      TIMESTAMPTZ,
  voting_close_at     TIMESTAMPTZ,
  winner_entry_id     UUID,           -- FK added below after entries table
  winner_announced_at TIMESTAMPTZ,
  created_by          UUID REFERENCES auth.users(id),
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Competition entries
CREATE TABLE IF NOT EXISTS competition_entries (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  competition_id  UUID NOT NULL REFERENCES competitions(id) ON DELETE CASCADE,
  artist_id       UUID NOT NULL REFERENCES artists(id) ON DELETE CASCADE,
  track_id        UUID REFERENCES tracks(id) ON DELETE SET NULL,  -- linked after track published
  audio_url       TEXT NOT NULL,      -- uploaded submission audio
  cover_url       TEXT,
  title           TEXT NOT NULL,      -- entry title (shown anonymously until winner picked)
  note            TEXT,               -- artist's note to judges (hidden from public)
  vote_count      INTEGER NOT NULL DEFAULT 0,
  is_winner       BOOLEAN NOT NULL DEFAULT false,
  is_visible      BOOLEAN NOT NULL DEFAULT false,   -- only winner's entry goes public
  disqualified    BOOLEAN NOT NULL DEFAULT false,
  disqualified_reason TEXT,
  submitted_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(competition_id, artist_id)   -- one entry per artist per competition
);

-- 4. Add FK from competitions to winning entry
ALTER TABLE competitions
  ADD CONSTRAINT fk_winner_entry
  FOREIGN KEY (winner_entry_id) REFERENCES competition_entries(id)
  ON DELETE SET NULL;

-- 5. Competition votes
CREATE TABLE IF NOT EXISTS competition_votes (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  competition_id  UUID NOT NULL REFERENCES competitions(id) ON DELETE CASCADE,
  entry_id        UUID NOT NULL REFERENCES competition_entries(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  voted_at        TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(competition_id, entry_id, user_id)  -- one vote per entry per user
);

-- 6. Track votes per user per competition (max 3 votes across all entries)
CREATE TABLE IF NOT EXISTS competition_user_votes (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  competition_id  UUID NOT NULL REFERENCES competitions(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  votes_cast      INTEGER NOT NULL DEFAULT 0,
  UNIQUE(competition_id, user_id)
);

-- 7. Moderators table (admin assigns limited mod access per room)
CREATE TABLE IF NOT EXISTS competition_moderators (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  competition_id  UUID NOT NULL REFERENCES competitions(id) ON DELETE CASCADE,
  artist_id       UUID NOT NULL REFERENCES artists(id) ON DELETE CASCADE,
  granted_by      UUID REFERENCES auth.users(id),
  granted_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(competition_id, artist_id)
);

-- 8. PayPal cash prize payouts log
CREATE TABLE IF NOT EXISTS competition_payouts (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  competition_id        UUID NOT NULL REFERENCES competitions(id) ON DELETE CASCADE,
  entry_id              UUID NOT NULL REFERENCES competition_entries(id) ON DELETE CASCADE,
  artist_id             UUID NOT NULL REFERENCES artists(id) ON DELETE CASCADE,
  paypal_email          TEXT,
  amount                NUMERIC(10,2) NOT NULL,
  currency              TEXT NOT NULL DEFAULT 'USD',
  paypal_payout_batch_id TEXT,
  status                TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'success', 'failed')),
  initiated_at          TIMESTAMPTZ DEFAULT NOW(),
  completed_at          TIMESTAMPTZ
);

-- 9. Add paypal_email to artists profile
ALTER TABLE artists
  ADD COLUMN IF NOT EXISTS paypal_email TEXT;

-- 10. Add billing_cycle and payment_provider to subscriptions
ALTER TABLE artist_tier_subscriptions
  ADD COLUMN IF NOT EXISTS billing_cycle     TEXT DEFAULT 'annual'
    CHECK (billing_cycle IN ('monthly', 'annual', 'iap_ios', 'iap_android')),
  ADD COLUMN IF NOT EXISTS payment_provider  TEXT DEFAULT 'paypal_web'
    CHECK (payment_provider IN ('paypal_web', 'iap_ios', 'iap_android', 'admin_grant'));

-- 11. Trigger to update competition vote counts
CREATE OR REPLACE FUNCTION increment_entry_votes()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE competition_entries
  SET vote_count = vote_count + 1
  WHERE id = NEW.entry_id;

  INSERT INTO competition_user_votes (competition_id, user_id, votes_cast)
  VALUES (NEW.competition_id, NEW.user_id, 1)
  ON CONFLICT (competition_id, user_id)
  DO UPDATE SET votes_cast = competition_user_votes.votes_cast + 1;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS on_competition_vote ON competition_votes;
CREATE TRIGGER on_competition_vote
  AFTER INSERT ON competition_votes
  FOR EACH ROW EXECUTE FUNCTION increment_entry_votes();

-- 12. RLS Policies

ALTER TABLE competitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE competition_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE competition_votes ENABLE ROW LEVEL SECURITY;
ALTER TABLE competition_user_votes ENABLE ROW LEVEL SECURITY;
ALTER TABLE competition_moderators ENABLE ROW LEVEL SECURITY;
ALTER TABLE competition_payouts ENABLE ROW LEVEL SECURITY;

-- competitions: anyone can read open competitions
CREATE POLICY "competitions_read" ON competitions FOR SELECT USING (true);
CREATE POLICY "competitions_admin_write" ON competitions FOR ALL
  USING (auth.uid() IN (SELECT user_id FROM admins));

-- entries: users see only is_visible entries (winners) + their own
CREATE POLICY "entries_read_public" ON competition_entries FOR SELECT
  USING (is_visible = true OR artist_id IN (
    SELECT id FROM artists WHERE user_id = auth.uid()
  ));
CREATE POLICY "entries_insert_own" ON competition_entries FOR INSERT
  WITH CHECK (artist_id IN (SELECT id FROM artists WHERE user_id = auth.uid()));
-- Admin can see all entries
CREATE POLICY "entries_admin_all" ON competition_entries FOR ALL
  USING (auth.uid() IN (SELECT user_id FROM admins));

-- votes: authenticated users can vote and see their own votes
CREATE POLICY "votes_read_own" ON competition_votes FOR SELECT
  USING (user_id = auth.uid());
CREATE POLICY "votes_insert" ON competition_votes FOR INSERT
  WITH CHECK (user_id = auth.uid());
CREATE POLICY "competition_user_votes_read" ON competition_user_votes FOR SELECT
  USING (user_id = auth.uid());

-- competition_user_votes: admin can see all for analytics
CREATE POLICY "user_votes_admin" ON competition_user_votes FOR SELECT
  USING (auth.uid() IN (SELECT user_id FROM admins));

-- payouts: admin only
CREATE POLICY "payouts_admin" ON competition_payouts FOR ALL
  USING (auth.uid() IN (SELECT user_id FROM admins));

-- moderators: admin write, public read for the competition page
CREATE POLICY "mods_read" ON competition_moderators FOR SELECT USING (true);
CREATE POLICY "mods_admin" ON competition_moderators FOR ALL
  USING (auth.uid() IN (SELECT user_id FROM admins));

-- 13. Storage bucket for competition entry audio
-- Public bucket: audio URLs are permanent (no expiry)
-- Access is still controlled by app logic — only winners are surfaced publicly
INSERT INTO storage.buckets (id, name, public)
VALUES ('competition-entries', 'competition-entries', true)
ON CONFLICT DO NOTHING;

-- Any authenticated user can upload to their own folder
CREATE POLICY "entry_upload" ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'competition-entries'
    AND auth.role() = 'authenticated'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Anyone can read (bucket is public, but only winner entries are shown in the UI)
CREATE POLICY "entry_read_public" ON storage.objects FOR SELECT
  USING (bucket_id = 'competition-entries');

-- Only uploader or admin can delete
CREATE POLICY "entry_delete" ON storage.objects FOR DELETE
  USING (
    bucket_id = 'competition-entries'
    AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR auth.uid() IN (SELECT user_id FROM admins)
    )
  );
