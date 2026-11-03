/**
 * netlify/functions/payout-details-blast.js
 *
 * Asks the artists who have no way of being paid to add a bank account.
 *
 *
 * WHY THIS EXISTS
 *
 * netlify/lib/payee.js decides where a sale's money goes, and it has three
 * answers: a Paystack subaccount (the artist's share splits off at the moment
 * of sale and settles into their own South African bank account), a PayPal
 * address (the buyer pays them directly), or nothing — in which case the sale
 * is refused rather than parked in the business account.
 *
 * As of this writing, one artist has a Paystack subaccount and eight have a
 * PayPal address. A hundred and twelve have neither, twenty-four of whom have
 * published music. Eighty published tracks currently cannot be bought by
 * anybody, and the largest catalogue on the platform is among them.
 *
 * None of that is visible to the artist. Nothing in the app tells them, and
 * nothing would: the refusal happens at checkout, on a buyer's screen, and the
 * artist never sees it. So this asks them, once, by notification and by email.
 *
 *
 * WHO IT WRITES TO
 *
 * By default, artists with at least one published track and no payout route.
 * That is the group whose music is actually for sale, so it is the group where
 * the ask is about something concrete rather than hypothetical.
 *
 * `audience: 'all'` widens it to every artist with no payout route, published
 * or not. Useful before a push on uploads, noisier otherwise.
 *
 *
 * IT WILL NOT WRITE TO THE SAME PERSON TWICE
 *
 * Every send records a notification carrying TAG. The audience query excludes
 * anyone who already has one, so running this a second time reaches only
 * artists who have joined, or published, since the last run. There is no
 * "resend to everyone" switch on purpose: the failure mode of a blast is
 * sending it twice, and the cost of that is an artist who trusts the next one
 * less.
 *
 *
 * ON THE COPY
 *
 * It says what adding a bank account does. It does not mention that sales have
 * been refused, because no artist here has seen that happen and telling
 * somebody about a fault they never hit buys distrust for nothing.
 *
 *
 * CALLING IT
 *
 *   POST /.netlify/functions/payout-details-blast?dry_run=true
 *     Authorization: Bearer <an admin's supabase token>
 *
 * A dry run sends nothing and returns the exact audience, so the list can be
 * read before a single email leaves. Drop dry_run to send.
 */

const { createClient } = require('@supabase/supabase-js');
const { sendMany } = require('../lib/email');
const { unsubscribeUrl } = require('../lib/unsubscribeToken');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const SITE_URL = process.env.URL || 'https://www.feelzmachine.com';

// The notification tag is the dedupe key. Changing it makes this a new blast
// that will reach everyone again, which is almost never what you want.
const TAG = 'payout-details-2026-11';

const SUBJECT = 'Add your bank account to get paid in rand';

function buildEmail(r) {
  const link = `${SITE_URL}/profile?tab=payments`;
  const hi = r.name ? `Hi ${r.name},` : 'Hi,';

  const text = [
    hi,
    '',
    'When someone buys your music on Feelz Machine, your share goes straight',
    'into your own bank account, in rand. Add your account once and that is it.',
    '',
    `Add your bank account: ${link}`,
    '',
    'It takes about a minute. You need your bank and your account number.',
    '',
    'Feelz Machine',
  ].join('\n');

  const html = `
<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#111">
  <p style="font-size:16px;line-height:1.5;margin:0 0 16px">${hi}</p>
  <p style="font-size:16px;line-height:1.5;margin:0 0 16px">
    When someone buys your music on Feelz Machine, your share goes straight into
    your own bank account, in rand. Add your account once and that is it.
  </p>
  <p style="margin:28px 0">
    <a href="${link}"
       style="background:#16a34a;color:#fff;text-decoration:none;padding:12px 20px;border-radius:8px;font-size:16px;display:inline-block">
      Add your bank account
    </a>
  </p>
  <p style="font-size:14px;line-height:1.5;color:#555;margin:0 0 24px">
    It takes about a minute. You need your bank and your account number.
  </p>
  <p style="font-size:13px;color:#888;margin:0">Feelz Machine</p>
</div>`.trim();

  return { subject: SUBJECT, html, text };
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' };
  }

  let body;
  try { body = JSON.parse(event.body || '{}'); }
  catch { return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON' }) }; }

  // ── Auth ────────────────────────────────────────────────────────────────
  //
  // The admin list is read from the admins table rather than hardcoded. The
  // older blast function carries one email address in an array in its source,
  // which means the set of people who can broadcast to every user on the
  // platform is a deploy away from being wrong.
  const authHeader = event.headers?.authorization || '';
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
  const secret = event.headers?.['x-internal-secret'];

  if (token) {
    const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
    if (authErr || !user) {
      return { statusCode: 401, body: JSON.stringify({ error: 'Not signed in' }) };
    }
    const { data: admin } = await supabase
      .from('admins').select('user_id').eq('user_id', user.id).maybeSingle();
    if (!admin) {
      return { statusCode: 403, body: JSON.stringify({ error: 'Not an admin' }) };
    }
  } else if (!secret || secret !== process.env.INTERNAL_FUNCTION_SECRET) {
    // No token AND no valid secret. Note the ordering: a present-but-invalid
    // token is refused above and never falls through to the secret check.
    return { statusCode: 403, body: JSON.stringify({ error: 'Forbidden' }) };
  }

  const dryRun   = event.queryStringParameters?.dry_run === 'true' || body.dry_run === true;
  const audience = body.audience === 'all' ? 'all' : 'published';

  try {
    // ── 1. Everyone who already got this one ──────────────────────────────
    const { data: already, error: alreadyErr } = await supabase
      .from('notifications')
      .select('user_id')
      .contains('metadata', { tag: TAG });
    if (alreadyErr) throw alreadyErr;
    const alreadySent = new Set((already || []).map(n => n.user_id));

    // ── 2. Artists and their payout route ─────────────────────────────────
    const { data: artists, error: artistErr } = await supabase
      .from('artists')
      .select('id, artist_name, user_id, paypal_email');
    if (artistErr) throw artistErr;

    const withUser = (artists || []).filter(a => a.user_id);
    const artistIds = withUser.map(a => a.id);

    const [{ data: profiles }, { data: published }] = await Promise.all([
      supabase.from('artist_payment_profiles')
        .select('artist_id, paystack_subaccount_code, paypal_email')
        .in('artist_id', artistIds),
      supabase.from('tracks')
        .select('artist_id')
        .in('artist_id', artistIds)
        .eq('is_published', true),
    ]);

    const profileOf = new Map((profiles || []).map(p => [p.artist_id, p]));
    const trackCount = new Map();
    for (const t of (published || [])) {
      trackCount.set(t.artist_id, (trackCount.get(t.artist_id) || 0) + 1);
    }

    const targets = withUser.filter(a => {
      const p = profileOf.get(a.id);
      const hasPaystack = Boolean(p?.paystack_subaccount_code);
      const hasPaypal   = Boolean(p?.paypal_email || a.paypal_email);
      if (hasPaystack || hasPaypal) return false;
      if (alreadySent.has(a.user_id)) return false;
      if (audience === 'published' && !(trackCount.get(a.id) > 0)) return false;
      return true;
    });

    if (!targets.length) {
      return {
        statusCode: 200,
        body: JSON.stringify({ ok: true, audience, targeted: 0, reason: 'nobody left to tell' }),
      };
    }

    // ── 3. Addresses ──────────────────────────────────────────────────────
    //
    // One artist can own several artist pages, so the same user id can appear
    // more than once. Deduplicated by user, keeping the first name seen, so
    // nobody gets the same email twice in one run.
    const byUser = new Map();
    for (const a of targets) {
      if (!byUser.has(a.user_id)) byUser.set(a.user_id, a);
    }
    const userIds = [...byUser.keys()];

    const emailOf = new Map();
    for (let i = 0; i < userIds.length; i += 50) {
      const slice = userIds.slice(i, i + 50);
      const looked = await Promise.all(slice.map(id => supabase.auth.admin.getUserById(id)));
      looked.forEach((res, n) => {
        const addr = res?.data?.user?.email;
        if (addr) emailOf.set(slice[n], addr);
      });
    }

    const recipients = userIds
      .filter(id => emailOf.has(id))
      .map(id => ({
        userId: id,
        email: emailOf.get(id),
        name: byUser.get(id).artist_name || null,
        unsubscribeUrl: unsubscribeUrl(SITE_URL, emailOf.get(id), 'platform'),
      }));

    if (dryRun) {
      return {
        statusCode: 200,
        body: JSON.stringify({
          ok: true,
          dryRun: true,
          audience,
          artistsTargeted: targets.length,
          uniqueUsers: userIds.length,
          emailable: recipients.length,
          noAddress: userIds.length - recipients.length,
          subject: SUBJECT,
          who: targets.map(a => ({
            artist: a.artist_name,
            publishedTracks: trackCount.get(a.id) || 0,
            reachable: emailOf.has(a.user_id),
          })),
        }, null, 2),
      };
    }

    // ── 4. In-app notification first ──────────────────────────────────────
    //
    // Before the email, deliberately. The notification is what the dedupe
    // reads, so if this run dies halfway the people already written to are
    // recorded and the next run skips them. The other order would re-email
    // everyone it had already reached.
    let notified = 0;
    for (let i = 0; i < userIds.length; i += 100) {
      const batch = userIds.slice(i, i + 100);
      const { error } = await supabase.from('notifications').insert(
        batch.map(uid => ({
          user_id: uid,
          type: 'engagement',
          title: 'Add your bank account',
          message: 'Get paid in rand, straight into your own account, when someone buys your music.',
          metadata: { tag: TAG, url: '/profile?tab=payments' },
        }))
      );
      if (error) console.error('[payout-details-blast] notification batch failed:', error.message);
      else notified += batch.length;
    }

    // ── 5. Email ──────────────────────────────────────────────────────────
    const mail = recipients.length
      ? await sendMany(recipients, buildEmail)
      : { attempted: 0, sent: 0, failed: [] };

    console.log(
      `[payout-details-blast] ${audience}: ${targets.length} artists, ` +
      `${notified} notified, ${mail.sent}/${mail.attempted} emailed`
    );

    return {
      statusCode: 200,
      body: JSON.stringify({
        ok: true,
        audience,
        artistsTargeted: targets.length,
        notified,
        emailAttempted: mail.attempted,
        emailSent: mail.sent,
        emailFailed: mail.failed.map(f => f.email),
      }),
    };

  } catch (err) {
    console.error('[payout-details-blast] failed:', err.message);
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
