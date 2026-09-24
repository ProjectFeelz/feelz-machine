/**
 * netlify/functions/rotate-featured.js
 *
 * Runs nightly (schedule in netlify.toml). Takes down anything whose week on
 * the Featured board is up, then fills the free slots from whoever earned one
 * this week.
 *
 * Deliberately thin. Every rule — what counts as earning a slot, one per
 * artist, locked rows, the board size — lives in rotate_featured_tracks()
 * (migration 128), so it can be read, dry-run and corrected in the SQL editor
 * without a deploy. This file's only job is to call it on a timer and say what
 * happened in the log.
 *
 * Manual run: POST to /.netlify/functions/rotate-featured
 * Dry run:    POST with { "dryRun": true } — reports what it WOULD do and
 *             changes nothing.
 *
 * Required env vars:
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY   (the RPC is service_role only, on purpose —
 *                                nothing in a browser can feature anything)
 */

const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.REACT_APP_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Settled with Steve, 24 Sep: 16 slots, a slot lasts a week, earning is
// measured over the last 7 days, and "small" means under 2,000 total streams
// so a big catalogue cannot win the risers category on volume alone.
const BOARD_SIZE     = 16;
const SLOT_DAYS      = 7;
const WINDOW_DAYS    = 7;
const SMALL_CEILING  = 2000;

exports.handler = async (event) => {
  const manual = event?.httpMethod === 'POST';
  let dryRun = false;
  if (manual) {
    try { dryRun = !!JSON.parse(event.body || '{}').dryRun; } catch { /* ignore */ }
  }

  try {
    const { data, error } = await supabase.rpc('rotate_featured_tracks', {
      p_board_size:    BOARD_SIZE,
      p_slot_days:     SLOT_DAYS,
      p_window_days:   WINDOW_DAYS,
      p_small_ceiling: SMALL_CEILING,
      p_dry_run:       dryRun,
    });

    if (error) {
      console.error('[rotate-featured]', error.code, error.message, error.hint || '');
      return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
    }

    // The RPC returns one row.
    const row = Array.isArray(data) ? data[0] : data;
    console.log(
      `[rotate-featured]${dryRun ? ' DRY RUN' : ''} expired=${row?.expired} added=${row?.added} board=${row?.board}\n${row?.detail || ''}`
    );

    return { statusCode: 200, body: JSON.stringify({ dryRun, ...row }) };
  } catch (err) {
    console.error('[rotate-featured] unexpected', err);
    return { statusCode: 500, body: JSON.stringify({ error: 'Internal error' }) };
  }
};