// src/utils/retailPlayQueue.js
// Durable retry queue for retail play logs.
//
// WHY THIS EXISTS
//
// retail_play_logs was written fire and forget: the insert was followed by
// .then(() => {}) which swallows any error. A venue tablet dropping wifi
// for thirty seconds silently lost every qualifying play in that window,
// with nothing recorded anywhere. Those rows are what
// calculate_retail_payout() divides the artist pool by, so a lost insert
// is not a lost analytics event, it is an artist being underpaid.
//
// HOW DOUBLE COUNTING IS PREVENTED
//
// The id is generated on the client and sent with the row, then the write
// is an upsert that ignores duplicates. So if a play actually landed and
// only the response was lost, the retry hits the same primary key and is
// discarded rather than counted twice. Getting this wrong in the other
// direction would overpay from the same pool, which is the same problem
// wearing a different hat.
//
// BOUNDS
//
// The queue is capped by count and by age. A tablet that has been offline
// for a fortnight should not suddenly inject two weeks of plays into the
// current payout period, and localStorage should not grow without limit.

const KEY = 'feelz_retail_play_queue';
const MAX_ENTRIES = 500;
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
    // Storage full or disabled. Nothing useful to do, and this must never
    // throw into the playback path.
  }
}

function newId() {
  if (window.crypto?.randomUUID) return window.crypto.randomUUID();
  // Fallback for older webviews. Only needs to be unique enough to act as
  // a primary key, and a collision would be discarded by the upsert.
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
  // Keep the newest if somehow over the cap.
  return fresh.slice(-MAX_ENTRIES);
}

export function queuePlay(row) {
  const items = prune(readQueue());
  items.push(row);
  writeQueue(items);
}

export function queueSize() {
  return readQueue().length;
}

// Builds the row, including its id and timestamp, so a queued retry is
// byte for byte the row that failed rather than a fresh one with a new
// time. played_at is set explicitly for the same reason: a play retried an
// hour later must still be attributed to when it actually happened, or it
// could land in the wrong payout period.
export function buildPlayRow({ venueId, locationId, trackId, playlistId, durationPlayed }) {
  return {
    id: newId(),
    venue_id: venueId,
    location_id: locationId || null,
    track_id: trackId,
    playlist_id: playlistId || null,
    duration_played: durationPlayed,
    played_at: new Date().toISOString(),
  };
}

// Sends one row, queueing it if the write fails for any reason.
export async function sendPlay(supabase, row) {
  try {
    const { error } = await supabase
      .from('retail_play_logs')
      .upsert(row, { onConflict: 'id', ignoreDuplicates: true });
    if (error) {
      queuePlay(row);
      return false;
    }
    return true;
  } catch {
    queuePlay(row);
    return false;
  }
}

// Drains whatever is waiting. Called on mount, when the browser comes back
// online, and periodically while the player is open.
//
// Rows that fail again are put back rather than dropped, and the whole
// batch is attempted in one upsert so a venue coming back from an outage
// does not fire hundreds of separate requests.
export async function flushQueue(supabase) {
  const items = prune(readQueue());
  if (items.length === 0) {
    writeQueue([]);
    return { flushed: 0, remaining: 0 };
  }

  try {
    const { error } = await supabase
      .from('retail_play_logs')
      .upsert(items, { onConflict: 'id', ignoreDuplicates: true });
    if (error) {
      writeQueue(items);
      return { flushed: 0, remaining: items.length };
    }
    writeQueue([]);
    return { flushed: items.length, remaining: 0 };
  } catch {
    writeQueue(items);
    return { flushed: 0, remaining: items.length };
  }
}