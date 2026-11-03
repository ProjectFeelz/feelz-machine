// src/utils/safeRedirect.js
//
// Turns a ?redirect= value into something safe to navigate to, or into null.
//
//
// WHAT WENT WRONG WITHOUT IT
//
// LoginPage read `redirect` straight off the query string:
//
//   const redirectTo = searchParams.get('redirect') || null;
//
// stashed it in sessionStorage, and AuthContext then ran
// window.location.replace(redirect) the moment the sign-in completed.
//
// window.location.replace follows an absolute URL off the site. So this link
//
//   https://www.feelzmachine.com/login?redirect=https://not-us.example/
//
// is a real Feelz Machine login page, on the real domain, with the real
// certificate, that hands the person to somebody else's site the instant
// they sign in successfully.
//
// That timing is the whole problem. A person who has just typed their
// password and seen it accepted has no reason to doubt the next page, which
// is why "your session expired, please sign in again" works. The link they
// clicked was ours.
//
// The same class of bug was closed on Plugin Gallery's auth callback in the
// September audit. This side never got the same treatment.
//
//
// THE RULE
//
// A redirect target is a path on this site or it is nothing. Not a URL on
// this site, a PATH: there is no good reason for this parameter to carry a
// host at all, and allowing one means maintaining a host allowlist that will
// be wrong one day.
//
// Rejected, with the reason each one exists:
//
//   https://other.example/x   absolute, obviously
//   //other.example/x         protocol-relative; the browser reads this as a
//                             host, and it is the one people forget
//   /\other.example/x         backslash; some browsers normalise \ to / and
//                             read it as protocol-relative
//   javascript:alert(1)       scheme without //
//   anything not starting /   a bare "other.example/x" resolves as a path
//                             here, but not everywhere this might be reused
//
// Accepted: "/browse", "/artist/sanii?tab=music", "/retail#top".

export function safeRedirectPath(value) {
  if (typeof value !== 'string') return null;

  const raw = value.trim();
  if (!raw) return null;

  // Must be a path from the root.
  if (raw[0] !== '/') return null;

  // "//host" and "/\host" are both ways of writing a host, not a path.
  if (raw[1] === '/' || raw[1] === '\\') return null;

  // A control character or whitespace in the middle is the usual way of
  // smuggling one of the above past a naive check.
  if (/[\u0000-\u001F\u007F\s]/.test(raw)) return null;

  // Belt and braces: resolve it against a throwaway origin and confirm it
  // stayed there. This catches anything the checks above did not think of,
  // because it asks the browser's own URL parser rather than a regular
  // expression.
  try {
    const probe = new URL(raw, 'https://redirect-check.invalid');
    if (probe.origin !== 'https://redirect-check.invalid') return null;
    return probe.pathname + probe.search + probe.hash;
  } catch {
    return null;
  }
}

export default safeRedirectPath;
