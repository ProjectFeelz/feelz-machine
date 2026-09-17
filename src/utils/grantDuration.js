// How long an admin grant lasts.
//
// It was 365 days everywhere, which meant a single click in a dropdown gave
// somebody a free year — and because nothing downgraded an expired row until
// migration 121, in practice it gave them forever. Three months is the
// default now, with one month available for a shorter trial. Change the
// numbers here and every grant path follows; they are deliberately in one
// place so the two admin screens cannot drift apart again.
export const GRANT_DURATIONS = [
  { months: 3, label: '3 months' },
  { months: 1, label: '1 month'  },
];
export const DEFAULT_GRANT_MONTHS = 3;

// Calendar months, not 30-day blocks. A grant made on the 31st of a long
// month lands on the last day of the target month rather than skidding into
// the one after it.
export function grantExpiry(months = DEFAULT_GRANT_MONTHS) {
  const d = new Date();
  const day = d.getDate();
  d.setMonth(d.getMonth() + Number(months));
  if (d.getDate() < day) d.setDate(0);   // clamp to the last day of that month
  return d.toISOString();
}