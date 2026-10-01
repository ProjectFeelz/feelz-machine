// src/utils/schoolPhase.js
//
// Which part of School Sessions we are in, and whether entries are open.
//
// WHY THIS IS A SHARED FILE AND NOT A FUNCTION INSIDE THE PAGE
//
// currentPhase lived in SchoolSessionsPage, so it decided what the page said
// and nothing else. The entry toggle in the upload panel had no idea it
// existed and never checked: SchoolSessionsEntry gated on whether the feature
// was switched on and whether the district was allowed, and never on whether
// entries were actually open. Nor did the insert.
//
// So with 32 days on the countdown, the page's own primary button read
// "Upload your entry", took a student to the upload panel, and let them file
// an entry a month early. The verification code is single use and the email
// address is unique, so they could not easily undo it.
//
// A rule that decides who may submit has to be readable from wherever
// submitting happens. That is this file.

export function currentPhase(comp) {
  if (!comp) return 'awareness';
  const now = Date.now();
  const t = (d) => (d ? new Date(d).getTime() : null);
  const entriesOpen  = t(comp.entries_open_at);
  const entriesClose = t(comp.entries_close_at);
  const votingOpen   = t(comp.voting_open_at);
  const votingClose  = t(comp.voting_close_at);

  if (votingClose && now > votingClose) return 'done';
  if ((votingOpen && now >= votingOpen) || (entriesClose && now >= entriesClose)) return 'voting';
  if (entriesOpen && now >= entriesOpen) return 'submissions';
  return 'awareness';
}

// The one question the entry form and the insert both need answered.
//
// Deliberately NOT "is the phase submissions". A competition with no
// entries_open_at set sits in awareness forever and would never accept
// anything, which would be a silent outage rather than a gate. If no opening
// date has been set, there is nothing to be early for, so entries are open.
export function entriesAreOpen(comp) {
  if (!comp) return true;
  if (!comp.entries_open_at) return true;
  return currentPhase(comp) === 'submissions';
}

// What to say on the button, so it stops promising something it will not do.
export function entryCta(comp, { signedIn } = {}) {
  const phase = currentPhase(comp);
  if (!signedIn) return { label: 'Get started', to: '/login' };
  if (phase === 'awareness')   return { label: 'Get ready to enter', to: '/schoolsessions#what-you-need' };
  if (phase === 'submissions') return { label: 'Upload your entry',  to: '/dashboard?tab=upload' };
  if (phase === 'voting')      return { label: "Vote, People's Choice", to: '/schoolsessions/vote' };
  return { label: 'See the results', to: '/schoolsessions/vote' };
}

// A date somebody can plan around, rather than a number of days.
//
// "32 days" tells a student nothing they can put in a calendar or weigh
// against an exam. The countdown stays, because a clock is the thing that
// creates urgency; this goes next to it.
export function phaseDate(iso) {
  const ms = Date.parse(iso || '');
  if (!Number.isFinite(ms)) return null;
  const d = new Date(ms);
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleDateString('en-GB', {
    weekday: 'short', day: 'numeric', month: 'long',
    ...(sameYear ? {} : { year: 'numeric' }),
  });
}