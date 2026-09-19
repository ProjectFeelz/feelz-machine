// netlify/functions/unsubscribe.js
//
// Getting out of the mail, without a password.
//
// Feelz Machine opts people in by default. Under POPIA section 69 that is
// allowed for people you already have a relationship with, but only while
// objecting stays free and easy — at collection, and in every message after
// it. Until now the unsubscribe link went to /contact-preferences, which needs
// a sign-in, so the only way out was to remember a password. This is the way
// out that does not.
//
//
// GET SHOWS A BUTTON. POST DOES IT.
//
// Not a nicety. Mail clients, security scanners and link-preview bots fetch
// every URL in an email, with GET, before a human has seen it — so a GET that
// unsubscribes would quietly remove people who never touched the link, and the
// first anyone would know is an artist asking why their list collapsed.
//
// It also means List-Unsubscribe-Post can be claimed honestly. RFC 8058
// one-click sends a POST with no confirmation, and that is exactly what the
// POST branch here does: verify the signature, write the row, return 200. No
// login, no page, no interaction. See the note in netlify/lib/email.js about
// why claiming that header falsely is worse than omitting it.
//
//
// IT NEVER SAYS WHETHER THE ADDRESS EXISTS
//
// Both outcomes render the same confirmation. Otherwise this endpoint answers
// "is this person on Feelz Machine?" for anyone holding a valid token, and the
// per-artist scope would answer "does this person follow that artist?" — which
// is somebody's listening habits, handed to whoever has the link.

const { createClient } = require('@supabase/supabase-js');
const { readToken } = require('../lib/unsubscribeToken');

const SITE_URL = process.env.URL || process.env.SITE_URL || 'https://www.feelzmachine.com';

const page = (statusCode, title, body, extra = '') => ({
  statusCode,
  headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
  body: `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>${title} · Feelz Machine</title>
<style>
  :root { color-scheme: dark; }
  body { margin:0; min-height:100vh; display:flex; align-items:center; justify-content:center;
         background:#08070C; color:#E9E7EF; padding:24px;
         font:15px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif; }
  .card { width:100%; max-width:440px; background:#121019; border:1px solid rgba(255,255,255,0.10);
          border-radius:20px; padding:28px; }
  h1 { margin:0 0 10px; font-size:19px; font-weight:800; }
  p { margin:0 0 14px; color:rgba(233,231,239,0.62); font-size:14px; }
  .brand { font-size:11px; letter-spacing:0.24em; text-transform:uppercase;
           color:#A78BFA; font-weight:700; margin-bottom:18px; }
  button { width:100%; padding:13px 18px; border:0; border-radius:12px; cursor:pointer;
           background:linear-gradient(145deg,#8B5CF6,#6D28D9); color:#F5F3FF;
           font-size:14px; font-weight:700; }
  button:active { transform:scale(0.99); }
  a { color:#A78BFA; text-decoration:none; font-size:13px; }
  .foot { margin-top:18px; border-top:1px solid rgba(255,255,255,0.08); padding-top:14px; }
</style>
</head><body><div class="card">
  <div class="brand">Feelz Machine</div>
  <h1>${title}</h1>
  ${body}
  ${extra}
</div></body></html>`,
});

exports.handler = async (event) => {
  const token = event.queryStringParameters?.t
    || (event.body && new URLSearchParams(event.body).get('t'))
    || '';

  const parsed = readToken(token);

  if (!parsed) {
    return page(400, 'That link is not valid',
      `<p>It may have been cut in half by your mail app. Copy the whole link from the
        email, or change your preferences from your account.</p>`,
      `<div class="foot"><a href="${SITE_URL}/contact-preferences">Open email preferences</a></div>`);
  }

  const { email, scope } = parsed;
  const isArtistScope = scope.startsWith('artist:');
  const artistId = isArtistScope ? scope.slice('artist:'.length) : null;

  // ── GET: ask first ────────────────────────────────────────────────────────
  if (event.httpMethod !== 'POST') {
    const what = isArtistScope
      ? 'emails from this artist'
      : 'marketing emails from Feelz Machine';
    return page(200, 'Stop these emails?',
      `<p>We will stop sending <strong>${what}</strong> to
        <strong>${email.replace(/[<>&]/g, '')}</strong>.</p>
       <form method="POST">
         <input type="hidden" name="t" value="${token.replace(/"/g, '&quot;')}">
         <button type="submit">Yes, stop these emails</button>
       </form>`,
      `<div class="foot">
         <p style="margin:0 0 8px">This does not close your account, and it does not stop
           emails you actually need — receipts, payouts and security notices are not
           marketing and keep coming.</p>
         <a href="${SITE_URL}/contact-preferences">Choose in more detail</a>
       </div>`);
  }

  // ── POST: do it ───────────────────────────────────────────────────────────
  const admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

  // MATCHING THE ADDRESS IS NOT .eq('email', email), AND THIS NEARLY SHIPPED
  // WRONG.
  //
  // get_newsletter_email_recipients returns `lower(trim(s.email))` — it
  // normalises on READ. The column itself keeps whatever was stored, so a row
  // holding "Davu@Example.com" is mailed as "davu@example.com" and an
  // equality match on the lowercased address finds nothing. The person would
  // have been shown "you are unsubscribed", the row would still say
  // subscribed = true, and the next send would mail them again. That failure
  // is silent, and it is exactly the failure that turns the promise in Terms
  // section 14 into a misrepresentation.
  //
  // ilike is case-insensitive, which is what this needs, but % and _ are
  // wildcards in it — so they are escaped. An address containing one is legal
  // and vanishingly rare, and "rare" is not a reason to let it match other
  // people's rows.
  const likeSafe = email.replace(/([\\%_])/g, '\\$1');

  try {
    // The user ids behind this address, by id OR by a case-insensitive match
    // on the stored address. Used by both branches below.
    const { data: subRows } = await admin
      .from('email_subscribers')
      .select('id, user_id, email')
      .ilike('email', likeSafe);
    const subIds  = (subRows || []).map(r => r.id).filter(Boolean);
    const userIds = [...new Set((subRows || []).map(r => r.user_id).filter(Boolean))];

    if (isArtistScope) {
      // Match on BOTH the address and the user id behind it. The
      // sync_follow_to_contacts trigger creates rows carrying a user_id and no
      // email, and export-contacts fills the address in from
      // email_subscribers at send time — so matching on email alone would miss
      // the very row being used to mail them.
      const { data: byEmailRows, error: byEmailErr } = await admin
        .from('artist_contacts')
        .update({ opted_in: false })
        .eq('artist_id', artistId)
        .ilike('email', likeSafe)
        .select('id');
      if (byEmailErr) throw byEmailErr;

      let byUserRows = [];
      if (userIds.length) {
        const { data, error: byUserErr } = await admin
          .from('artist_contacts')
          .update({ opted_in: false })
          .eq('artist_id', artistId)
          .in('user_id', userIds)
          .select('id');
        if (byUserErr) throw byUserErr;
        byUserRows = data || [];
      }

      // Nothing updated means there was no contact row yet. Record the
      // objection anyway: an opt-out with nothing to write it on is an opt-out
      // that gets forgotten the moment the follow trigger next runs and
      // creates the row fresh, with the column back at its default of true.
      if (!(byEmailRows || []).length && !byUserRows.length) {
        const { error: insErr } = await admin.from('artist_contacts').insert({
          artist_id: artistId,
          user_id: userIds[0] || null,
          email,
          opted_in: false,
          source: 'unsubscribe',
        });
        if (insErr) throw insErr;
      }
    } else {
      // By row id, because the ids came from the case-insensitive read above
      // and an id match cannot go wrong twice. A person can legitimately hold
      // two subscriber rows for one address — the recipient function groups
      // them into one email — so both have to be turned off or the next send
      // finds the survivor.
      let updated = 0;
      if (subIds.length) {
        const { data, error } = await admin
          .from('email_subscribers')
          .update({ subscribed: false, unsubscribed_at: new Date().toISOString() })
          .in('id', subIds)
          .select('id');
        if (error) throw error;
        updated = (data || []).length;
      }

      // No row at all is a real state, not an edge case: 86 accounts on this
      // platform have never had one, because add_email_subscriber_after_profile
      // did not exist when they signed up. If one of them is ever mailed —
      // through an artist list, or a future audience that resolves addresses
      // some other way — and clicks unsubscribe, the objection has to land
      // somewhere. Writing the row is what makes it stick.
      if (!updated) {
        const { error: insErr } = await admin.from('email_subscribers').insert({
          user_id: userIds[0] || null,
          email,
          subscribed: false,
          unsubscribed_at: new Date().toISOString(),
          source: 'unsubscribe',
        });
        if (insErr) throw insErr;
      }
    }
  } catch (err) {
    console.error('[unsubscribe] write failed:', err.code, err.message);
    return page(500, 'Something went wrong',
      `<p>We could not record that just now. Nothing has changed. Please try the link
        again, or change your preferences from your account.</p>`,
      `<div class="foot"><a href="${SITE_URL}/contact-preferences">Open email preferences</a></div>`);
  }

  console.log(`[unsubscribe] ${scope} opted out`);

  return page(200, 'Done — you are unsubscribed',
    `<p>We have stopped
      ${isArtistScope ? 'emails from this artist' : 'marketing emails from Feelz Machine'}
      to <strong>${email.replace(/[<>&]/g, '')}</strong>. It can take a few minutes for
      anything already sending to finish.</p>`,
    `<div class="foot">
       <p style="margin:0 0 8px">Changed your mind, or want to choose artist by artist?</p>
       <a href="${SITE_URL}/contact-preferences">Open email preferences</a>
     </div>`);
};