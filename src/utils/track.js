// src/utils/track.js
//
// Recording what people do, in three calls.
//
//   screen(name)        a page was opened. Call it once, it handles leaving.
//   tap(name, target)   somebody pressed something that mattered.
//   step(name, target)  somebody finished a step of a flow.
//
// WHY SO SMALL
//
// Every analytics layer that gets abandoned was abandoned because using it
// was work. If adding a measurement is more than one line, people stop adding
// measurements, and six months later the data answers last year's questions.
//
// NOTHING HERE CAN BREAK A PAGE
//
// Every call is fire and forget, wrapped, and never awaited by a caller. A
// tracking call that can throw is a tracking call that takes the app down for
// a statistic, which is a bad trade in every direction.

import { supabase } from '../supabaseClient';

// Tracking is never the reason a tap feels slow, so rows are collected and
// sent in batches, plus whenever the tab is hidden. 4 seconds is short enough
// that a person who leaves immediately is still counted, via the
// visibilitychange flush below.
const FLUSH_MS = 4000;
const MAX_QUEUE = 25;

let queue = [];
let timer = null;
let userId = null;

// Read once and remembered. Asking supabase for the session on every tap
// would be a round trip per button press.
supabase.auth.getSession()
  .then(({ data }) => { userId = data?.session?.user?.id || null; })
  .catch(() => {});

supabase.auth.onAuthStateChange((_e, session) => {
  userId = session?.user?.id || null;
});

async function flush() {
  if (queue.length === 0) return;
  const batch = queue;
  queue = [];
  try {
    await supabase.from('app_events').insert(
      batch.map(r => ({ ...r, user_id: userId }))
    );
  } catch {
    // Dropped on purpose. Retrying would mean holding rows across a page the
    // person has already left, and a lost statistic costs nothing.
  }
}

function enqueue(row) {
  try {
    queue.push(row);
    if (queue.length >= MAX_QUEUE) { flush(); return; }
    if (!timer) {
      timer = setTimeout(() => { timer = null; flush(); }, FLUSH_MS);
    }
  } catch {}
}

if (typeof document !== 'undefined') {
  // THE ONE THAT ACTUALLY MATTERS.
  //
  // Somebody who opens a screen and leaves straight away is the person this
  // whole table exists to find, and they are exactly the person whose rows
  // never get sent if the only flush is on a timer. visibilitychange fires
  // when the tab is hidden, the app is backgrounded, or the phone is locked.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flush();
  });
  window.addEventListener('pagehide', flush);
}

/**
 * A page was opened. Returns a function that records how long it was open;
 * React effects call it on cleanup, so the normal usage is one line:
 *
 *   React.useEffect(() => screen('hub'), []);
 *
 * The page name is given by hand rather than taken from the URL, so a path
 * with an id or a query string in it never becomes a thousand separate
 * screens, and nothing personal ends up in the name.
 */
export function screen(name, meta = {}) {
  const startedAt = Date.now();
  let done = false;
  return () => {
    if (done) return;
    done = true;
    enqueue({
      kind: 'screen',
      name,
      duration_s: Math.min(3600, Math.round((Date.now() - startedAt) / 1000)),
      meta,
    });
  };
}

/**
 * Somebody pressed something worth counting.
 *
 * Deliberately not every button. Counting every tap gives a haystack;
 * counting the twenty that carry a decision gives a funnel. Upload, upgrade,
 * enter, play, copy the affiliate link.
 */
export function tap(name, target = null, meta = {}) {
  enqueue({ kind: 'tap', name, target: target ? String(target).slice(0, 200) : null, meta });
}

/**
 * A step of a flow completed. Signup, upload, entering Sessions, upgrading.
 *
 * Recorded when the step SUCCEEDS, never when it starts, so the place people
 * stop shows up on its own as the gap between one step's count and the next.
 */
export function step(name, target = null, meta = {}) {
  enqueue({ kind: 'step', name, target: target ? String(target).slice(0, 200) : null, meta });
}

const tracking = { screen, tap, step };
export default tracking;
