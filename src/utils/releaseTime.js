// src/utils/releaseTime.js
//
// Turning what an artist typed into a moment in time, and back again.
//
// ── THE PROBLEM THESE TWO FUNCTIONS EXIST FOR ───────────────────────────────
//
// <input type="datetime-local"> gives you '2026-10-14T00:00'. There is no
// timezone in that string and there never will be: the control is defined as
// a wall clock, deliberately, because "9am" means 9am wherever you are.
//
// Sending that string to Postgres means Postgres has to guess which midnight
// was meant, and it guesses with the SERVER's timezone, which on Supabase is
// UTC. So an artist in Johannesburg setting midnight got a track that
// unlocked at 02:00 their time. Two hours late, every release, silently.
//
// Measured, not estimated. For a track set to midnight on 14 October:
//
//   Johannesburg   unlocks 14 Oct 02:00   two hours late
//   Lagos          unlocks 14 Oct 01:00   an hour late
//   Los Angeles    unlocks 13 Oct 17:00   five in the evening, the DAY BEFORE
//   Auckland       unlocks 14 Oct 13:00   half the day gone
//
// The Los Angeles row is why this is not a rounding error. A release goes
// public the evening before the date the artist announced, and every embargo
// they agreed with anyone else is broken by the platform.
//
// Nobody caught it because no screen ever displayed the time. The gate used
// it; the UI only ever showed a date.
//
// ── THE FIX, IN ONE LINE ────────────────────────────────────────────────────
//
// Stop sending wall clocks. Convert to a real instant in the browser, where
// the artist's timezone is actually known, and convert back for editing.
//
// Requires migration 206: the column has to be timestamptz to hold an
// instant. A plain `timestamp` column silently discards the offset, which
// would make this worse rather than better.

// '2026-10-14T00:00' as typed in THIS browser -> '2026-10-13T22:00:00.000Z'
//
// new Date() on a datetime-local string parses it in the browser's own
// timezone, which is exactly the interpretation the artist intended, because
// they are the one who typed it. toISOString then states that moment
// absolutely so nothing downstream has to guess again.
export function localInputToInstant(localValue) {
  if (!localValue) return null;
  const d = new Date(localValue);
  if (!Number.isFinite(d.getTime())) return null;
  return d.toISOString();
}

// The reverse, for putting a stored date back into the editing field.
//
// NOT `iso.substring(0, 16)`, which is what this used to be: it takes the
// first sixteen characters of a UTC string and drops them into a control that
// means local time.
//
// Worth being precise about what that did and did not break, because the
// obvious guess is wrong. It did NOT make the date drift on repeated edits:
// the write bug and the read bug were mirror images, so a track edited five
// times kept the same value. Testing across five timezones confirmed that.
//
// What it did was store the wrong moment in the first place, and then hide
// the evidence by showing the artist back exactly what they typed. The stored
// instant was wrong and the screen agreed with them about it, which is the
// reason this survived to launch.
export function instantToLocalInput(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return '';
  // Built by hand rather than with toISOString, which would convert back to
  // UTC and reintroduce the very bug this is here to remove.
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
       + `T${p(d.getHours())}:${p(d.getMinutes())}`;
}

// What the artist is actually choosing, spelled out under the field.
//
// The timezone is named rather than implied. An artist setting a release for
// a label in another country needs to see which clock this is, and "14
// October 2026, 00:00 (Africa/Johannesburg)" answers that without them having
// to work it out or trust that it was handled.
export function describeLocalRelease(localValue) {
  if (!localValue) return null;
  const d = new Date(localValue);
  if (!Number.isFinite(d.getTime())) return null;
  let zone = '';
  try { zone = Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch { /* ignore */ }
  const when = d.toLocaleString('en-GB', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
  return zone ? `${when} (${zone})` : when;
}