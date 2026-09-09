/**
 * netlify/lib/email.js
 *
 * Sending email, via Resend. Nothing in this codebase could do that before.
 *
 *
 * WHY THERE WAS NOTHING
 *
 * RESEND_API_KEY has been set in Netlify the whole time. No file in the repo
 * imported Resend, nodemailer, sendgrid, mailgun, postmark or an SMTP client —
 * the word "resend" appeared exactly once in the codebase, in the text of the
 * privacy policy.
 *
 * So the newsletter, weekly-artist-report, weekly-listener-recap,
 * monthly-wrapped, platform-update-blast and the engagement drip have all been
 * in-app notifications and web push only. send_newsletter() writes a
 * newsletter_posts row and fans out notifications; it has never sent an email,
 * which is why "we could never get it to work" — there was nothing to get
 * working.
 *
 *
 * NO SDK
 *
 * Resend's HTTP API is one POST. Adding a dependency to a Netlify function
 * costs bundle size and a version to keep track of, so this uses fetch, which
 * Node 22 has natively. `npm install` stays untouched.
 *
 *
 * WHAT THIS DELIBERATELY REFUSES TO DO
 *
 * It will not send to an address it was not given, it will not deduplicate
 * silently across calls, and it has no opinion about consent — the caller
 * supplies the recipient list and is responsible for having established that
 * every address on it agreed to hear from you. That separation is on purpose:
 * consent belongs in one auditable place, not spread across whatever function
 * happens to be sending.
 */

const RESEND_ENDPOINT = 'https://api.resend.com/emails';

// Resend accepts up to 50 addresses per request on the batch endpoint, but a
// single send with many `to` addresses exposes every recipient to every other
// recipient. Newsletters go out one request per recipient instead, which is
// slower and correct.
const DEFAULT_CONCURRENCY = 8;
const MAX_ATTEMPTS        = 3;

function requireKey() {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    throw new Error(
      'RESEND_API_KEY is not set. It is configured in Netlify for production; ' +
      'a local run needs it in the environment too.'
    );
  }
  return key;
}

/**
 * The From address. Resend will only accept a domain you have verified, so
 * this is a single constant rather than a per-caller argument — a typo'd
 * sender is rejected for every recipient at once and looks like an outage.
 *
 * Override with NEWSLETTER_FROM if the verified domain changes.
 */
function fromAddress() {
  return process.env.NEWSLETTER_FROM || 'Feelz Machine <hello@feelzmachine.com>';
}

function replyToAddress() {
  return process.env.NEWSLETTER_REPLY_TO || undefined;
}

/**
 * One email. Retries only on transport failures and 429/5xx — a 4xx such as an
 * invalid address or an unverified sender is permanent, and retrying it three
 * times just delays the report.
 *
 * @returns {Promise<{ok: boolean, id?: string, status?: number, error?: string}>}
 */
async function sendOne({ to, subject, html, text, headers }) {
  const key = requireKey();
  let lastErr = null;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const res = await fetch(RESEND_ENDPOINT, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${key}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: fromAddress(),
          to: [to],
          subject,
          html,
          ...(text ? { text } : {}),
          ...(replyToAddress() ? { reply_to: replyToAddress() } : {}),
          ...(headers ? { headers } : {}),
        }),
      });

      const bodyText = await res.text();
      let body = null;
      try { body = bodyText ? JSON.parse(bodyText) : null; } catch { /* keep the raw text */ }

      if (res.ok) {
        return { ok: true, id: body && body.id, status: res.status };
      }

      const message = (body && (body.message || body.error)) || bodyText || `HTTP ${res.status}`;

      // Permanent. Do not retry.
      if (res.status >= 400 && res.status < 500 && res.status !== 429) {
        return { ok: false, status: res.status, error: message };
      }

      lastErr = `HTTP ${res.status}: ${message}`;
    } catch (err) {
      lastErr = err && err.message ? err.message : String(err);
    }

    if (attempt < MAX_ATTEMPTS) {
      await new Promise(r => setTimeout(r, 400 * attempt));
    }
  }

  return { ok: false, error: lastErr || 'unknown send failure' };
}

/**
 * Send the same message to many recipients, a few at a time.
 *
 * Returns a per-recipient result rather than a single boolean, because "the
 * newsletter went out" and "the newsletter went out to 340 of 900 people" are
 * different facts and the caller has to be able to tell them apart.
 *
 * @param recipients [{ email, name?, unsubscribeUrl? }]
 * @param build      (recipient) => { subject, html, text? }
 */
async function sendMany(recipients, build, { concurrency = DEFAULT_CONCURRENCY } = {}) {
  const results = [];
  const queue = [...recipients];

  async function worker() {
    while (queue.length) {
      const r = queue.shift();
      if (!r || !r.email) continue;
      const msg = build(r);
      // List-Unsubscribe is what lets a mail client offer its own unsubscribe
      // control. Without it, bulk mail from a young sending domain is
      // materially more likely to be filtered, and a recipient's only way out
      // is the spam button — which damages deliverability for everyone else.
      //
      // List-Unsubscribe-Post is only added when `oneClick` is set, and it must
      // only be set for a URL that genuinely unsubscribes on an unauthenticated
      // POST with no confirmation step. Claiming one-click and pointing it at a
      // page — a React route, say — is worse than omitting the header: the mail
      // client POSTs, receives the app's HTML, reports success to the reader,
      // and nothing is unsubscribed.
      const headers = r.unsubscribeUrl
        ? {
            'List-Unsubscribe': `<${r.unsubscribeUrl}>`,
            ...(r.oneClick ? { 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' } : {}),
          }
        : undefined;
      const out = await sendOne({ ...msg, to: r.email, headers });
      results.push({ email: r.email, ...out });
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, Math.max(1, recipients.length)) }, worker)
  );

  const sent   = results.filter(r => r.ok).length;
  const failed = results.filter(r => !r.ok);

  return { attempted: results.length, sent, failed, results };
}

module.exports = { sendOne, sendMany, fromAddress };