// src/utils/offlinePlayQueue.js
//
// Durable queue for plays that happened with no network.
//
// WHY THIS EXISTS
//
// This is the half of offline listening that nobody sees and that matters
// most. A play is counted at the 30-second mark by logStream() in
// PlayerContext, which calls the log_stream RPC. That needs a connection.
// With no connection the call fails, the function returns early, and the play
// is gone — not delayed, gone. Someone listening to a saved album eight times
// on a flight would generate zero streams, zero stream_count, zero
// total_streams for the artist.
//
// That is not an analytics gap, it is an artist not being paid for work that
// was listened to. Which is exactly what was written about retail_play_logs
// when the same bug was found there, and this queue is deliberately the same
// shape as src/utils/retailPlayQueue.js so there is one pattern in this
// codebase for "a write that must survive being offline" rather than two.
//
//
// HOW DOUBLE COUNTING IS PREVENTED
//
// The id is generated here, on the device, before there is any network, and
// travels with the play. The server writes it as the PRIMARY KEY of
// offline_play_receipts (migration 104) with ON CONFLICT DO NOTHING, and only
// calls log_stream when the receipt is genuinely new.
//
// So a play that actually landed and only lost its response is discarded on
// retry rather than counted twice. Getting that wrong in the other direction
// would inflate an artist's stream count from a phone with a flaky signal,
// which is the same problem wearing a different hat.
//
//
// BOUNDS
//
// Capped by count and by age. A device offline for a fortnight should not
// inject a fortnight of plays into the current period — the server refuses
// anything older than 30 days anyway — and localStorage must not grow without
// limit.

const KEY = 'feelz_offline_play_queue';
const MAX_ENTRIES  = 500;
const MAX_AGE_DAYS = 7;

function readQueue() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeQueue(items) {
  try {
    localStorage.setItem(KEY, JSON.stringify(items));
  } catch {
    // Storage full or disabled. Nothing useful to do here, and this must
    // never throw into the playback path.
  }
}

function newId() {
  if (window.crypto?.randomUUID) return window.crypto.randomUUID();
  // Older webviews. Only needs to be unique enough to act as a primary key,
  // and a collision is discarded by the ON CONFLICT rather than miscounted.
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, ch => {
    const r = (Math.random() * 16) | 0;
    const v = ch === 'x' ? r : ((r & 0x3) | 0x8);
    return v.toString(16);
  });
}

function prune(items) {
  const cutoff = Date.now() - MAX_AGE_DAYS * 86400000;
  const fresh = items.filter(i => {
    const t = Date.parse(i.played_at || '');
    return Number.isFinite(t) ? t > cutoff : false;
  });
  return fresh.slice(-MAX_ENTRIES);
}

// Built with its id and its timestamp already set, so a play flushed an hour
// later is still attributed to when it actually happened rather than to when
// the phone found wifi. played_at is what decides which reporting period a
// play lands in.
export function buildOfflinePlayRow({ trackId, durationPlayed, source }) {
  return {
    client_play_id:  newId(),
    track_id:        trackId,
    duration_played: Math.max(0, Math.floor(durationPlayed || 30)),
    played_at:       new Date().toISOString(),
    platform:        'web',
    device_type:     /Mobi|Android/i.test(navigator.userAgent) ? 'mobile' : 'desktop',
    source:          source || 'offline',
  };
}

export function queueOfflinePlay(row) {
  const items = prune(readQueue());
  items.push(row);
  writeQueue(items);
}

export function offlineQueueSize() {
  return readQueue().length;
}

async function sendOne(supabase, row) {
  const { data, error } = await supabase.rpc('log_offline_stream', {
    p_client_play_id:  row.client_play_id,
    p_track_id:        row.track_id,
    p_duration_played: row.duration_played,
    p_played_at:       row.played_at,
    p_platform:        row.platform,
    p_device_type:     row.device_type,
    p_source:          row.source,
  });

  // A transport failure — offline again, timeout — means we do not know
  // whether it landed, so it stays queued and the receipt id makes the retry
  // safe. supabase-js resolves rather than throwing, so this has to be read
  // explicitly; not reading it is the single most common bug in this codebase.
  if (error) return { done: false };

  // Every one of these is a DEFINITE answer from the server, so the row comes
  // out of the queue:
  //   logged:true            counted
  //   already_counted        counted by an earlier flush
  //   self_stream            correctly not counted, and never will be
  //   too_old                past the window, and gets older
  //   track_not_found        the track is gone
  if (data?.retry) return { done: false };
  return { done: true, counted: !!data?.logged };
}

/**
 * flushOfflinePlays
 *
 * Drains what is waiting. Called when the app comes back online, on mount, and
 * after an offline listening session ends.
 *
 * One row at a time on purpose, unlike the retail queue's single batch upsert.
 * Each play here has to run log_stream, which increments counters and walks
 * collaborators, so there is no single statement that does the batch — and a
 * row that fails goes back in the queue rather than taking the rest of the
 * batch down with it.
 */
export async function flushOfflinePlays(supabase) {
  const items = prune(readQueue());
  if (items.length === 0) {
    writeQueue([]);
    return { flushed: 0, counted: 0, remaining: 0 };
  }

  const stillWaiting = [];
  let flushed = 0;
  let counted = 0;

  for (const row of items) {
    if (!navigator.onLine) { stillWaiting.push(row); continue; }
    try {
      const result = await sendOne(supabase, row);
      if (result.done) {
        flushed++;
        if (result.counted) counted++;
      } else {
        stillWaiting.push(row);
      }
    } catch {
      stillWaiting.push(row);
    }
  }

  writeQueue(stillWaiting);
  return { flushed, counted, remaining: stillWaiting.length };
}