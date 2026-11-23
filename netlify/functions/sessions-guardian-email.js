/**
 * netlify/functions/sessions-guardian-email.js
 *
 * Emails a minor's parent or guardian a link to confirm a Sessions entry.
 *
 * Called by the upload panel right after a minor's entry is saved, so a parent
 * hears about it even if the entrant never told them. An admin can call it
 * too, for entries added by hand.
 *
 * POST body: { entry_id: string }
 * Header:    Authorization: Bearer <user access token>
 *
 * Only the entry's own artist or an admin may trigger it. It sends once per
 * entry; an admin may resend with { resend: true }.
 */

const { createClient } = require('@supabase/supabase-js');
const { sendOne } = require('../lib/email');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const EMAIL_RE = /[^\s<>,;:"']+@[^\s<>,;:"']+\.[a-z]{2,}/i;

const esc = (s) => String(s || '').replace(/[&<>"']/g, c => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
));

const json = (statusCode, body) => ({
  statusCode,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return json(405, { error: 'method_not_allowed' });

  let body;
  try { body = JSON.parse(event.body || '{}'); } catch { return json(400, { error: 'bad_json' }); }
  const entryId = body.entry_id;
  if (!entryId) return json(400, { error: 'missing_entry_id' });

  const auth = event.headers.authorization || event.headers.Authorization || '';
  const token = auth.replace(/^Bearer\s+/i, '');
  if (!token) return json(401, { error: 'unauthorized' });

  const { data: { user } = {} } = await supabase.auth.getUser(token);
  if (!user) return json(401, { error: 'unauthorized' });

  const { data: entry } = await supabase
    .from('school_sessions_entries')
    .select('id, entrant_full_name, entrant_is_minor, artist_id, track_id, artists(user_id), tracks(title)')
    .eq('id', entryId)
    .maybeSingle();
  if (!entry) return json(404, { error: 'entry_not_found' });

  const { data: adminRow } = await supabase
    .from('admins').select('user_id').eq('user_id', user.id).maybeSingle();
  const isAdmin = !!adminRow;
  const isOwner = entry.artists?.user_id === user.id;
  if (!isAdmin && !isOwner) return json(403, { error: 'forbidden' });

  const { data: consent } = await supabase
    .from('school_sessions_guardian_consents')
    .select('id, guardian_name, guardian_contact, entry_consent_token, guardian_email_sent_at, guardian_confirmed_at')
    .eq('entry_id', entryId)
    .order('consented_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!consent) return json(200, { sent: false, reason: 'no_guardian_on_file' });
  if (consent.guardian_confirmed_at) return json(200, { sent: false, reason: 'already_confirmed' });
  if (consent.guardian_email_sent_at && !(isAdmin && body.resend)) {
    return json(200, { sent: false, reason: 'already_sent' });
  }

  const match = String(consent.guardian_contact || '').match(EMAIL_RE);
  if (!match) return json(200, { sent: false, reason: 'no_guardian_email' });
  const to = match[0];

  const site = process.env.URL || 'https://www.feelzmachine.com';
  const link = `${site}/sessions/entry-consent/${consent.entry_consent_token}`;
  const child = entry.entrant_full_name || 'Your child';
  const song = entry.tracks?.title || 'their song';
  const hello = consent.guardian_name ? `Hello ${consent.guardian_name},` : 'Hello,';

  const text =
`${hello}

${child} has entered Feelz Machine Sessions, a music competition, with the song "${song}".

Because ${child} is under 18, we need a parent or guardian to confirm they may take part. It takes under a minute and needs no account:

${link}

If you do not know about this entry, you do not need to do anything. It will not go forward without your confirmation, and you can reply to this email with any questions.

Feelz Machine`;

  const html = `
<div style="font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.55;color:#111;max-width:520px">
  <p>${esc(hello)}</p>
  <p><strong>${esc(child)}</strong> has entered <strong>Feelz Machine Sessions</strong>, a music competition, with the song &ldquo;${esc(song)}&rdquo;.</p>
  <p>Because ${esc(child)} is under 18, we need a parent or guardian to confirm they may take part. It takes under a minute and needs no account.</p>
  <p style="margin:28px 0">
    <a href="${esc(link)}" style="background:#a3e635;color:#000;text-decoration:none;font-weight:bold;padding:14px 22px;border-radius:10px;display:inline-block">Confirm the entry</a>
  </p>
  <p style="font-size:13px;color:#555">If the button does not work, open this link: <br>${esc(link)}</p>
  <p style="font-size:13px;color:#555">If you do not know about this entry, you do not need to do anything. It will not go forward without your confirmation, and you can reply to this email with any questions.</p>
  <p>Feelz Machine</p>
</div>`;

  const result = await sendOne({
    to,
    subject: `Please confirm ${child}'s entry into Feelz Machine Sessions`,
    html,
    text,
  });
  if (!result.ok) {
    console.error('[sessions-guardian-email] send failed', result.status, result.error);
    return json(502, { sent: false, reason: 'send_failed' });
  }

  await supabase
    .from('school_sessions_guardian_consents')
    .update({ guardian_email_sent_at: new Date().toISOString() })
    .eq('id', consent.id);

  return json(200, { sent: true });
};
