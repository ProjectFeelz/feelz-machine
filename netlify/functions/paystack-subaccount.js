/**
 * netlify/functions/paystack-subaccount.js
 *
 * An artist's bank details, turned into a Paystack subaccount.
 *
 * A subaccount is the thing that makes the whole Paystack route possible: the
 * buyer pays once, and Paystack settles the artist's share straight into the
 * artist's own bank account. Without one, netlify/lib/payee.js has nothing to
 * route to and falls back to PayPal.
 *
 * Two actions, because they belong to the same screen and the same secret:
 *
 *   banks  list the South African banks, for the picker. No bank codes are
 *          hardcoded anywhere: they come from Paystack, so a bank being added
 *          or renamed is not a deploy.
 *   save   create or update the subaccount from an account number and a bank,
 *          then store the code.
 *
 *
 * percentage_charge IS THE PLATFORM'S SHARE, NOT THE ARTIST'S
 *
 * This file used to say the opposite, and sent `100 - platform cut`. The first
 * live subaccount was created that way, with percentage_charge: 100, and the
 * Paystack dashboard then showed it as:
 *
 *     Your share (%): 100        Subaccount gets (%): 0
 *
 * Every rand of every sale would have settled into the platform account and
 * the artist would have been paid nothing. Paystack's own split payments
 * guide agrees with the dashboard: the percentage goes to the MAIN account
 * and the remainder goes to the subaccount.
 *
 * So what is sent here is the PLATFORM's cut. With PAYSTACK_PLATFORM_PCT
 * unset, that is 0, and the artist receives 100% of the sale.
 *
 * Paystack echoes the stored value back on both create and update, so the
 * number that was actually saved is checked against the number that was sent,
 * and a disagreement is logged with the subaccount code. A wrong split is the
 * one failure here that costs somebody real money without anything looking
 * broken, so it does not get to pass quietly a second time.
 *
 *
 * WHO PAYS PAYSTACK'S FEE
 *
 * By default the main account bears it. With the platform taking 0%, that
 * means Feelz Machine would pay roughly 2.9% plus R1 out of its own pocket on
 * a sale it earns nothing from, which is a slow leak nobody would notice for
 * months.
 *
 * So the fee is borne by the subaccount, set at checkout. That is also what
 * the artist would expect: it is the same arrangement as the PayPal direct
 * route, where PayPal's cut comes out of the money going to the seller.
 *
 *
 * WHAT IS DELIBERATELY NOT STORED
 *
 * The full account number. Paystack holds it. This database keeps the
 * subaccount code, the bank, and the last four digits so the artist can see
 * which account is on file. A leak here cannot drain anybody's bank account.
 */

const { createClient } = require('@supabase/supabase-js');

const PAYSTACK_BASE = 'https://api.paystack.co';
const SECRET = process.env.PAYSTACK_SECRET_KEY;

// The platform's cut of a Paystack sale, as a percentage. Zero by default so
// that moving an artist onto Paystack does not quietly change what they earn.
const PLATFORM_PCT = Number(process.env.PAYSTACK_PLATFORM_PCT || 0);

const json = (statusCode, body) => ({
  statusCode,
  headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  body: JSON.stringify(body),
});

async function paystack(path, options = {}) {
  const res = await fetch(PAYSTACK_BASE + path, {
    ...options,
    headers: {
      Authorization: `Bearer ${SECRET}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });

  let body = null;
  try { body = await res.json(); } catch { /* a non-JSON body is handled below */ }

  if (!res.ok || !body || body.status !== true) {
    const msg = (body && body.message) || `Paystack returned ${res.status}`;
    const err = new Error(msg);
    err.status = res.status;
    err.paystack = body;
    throw err;
  }
  return body.data;
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return json(405, { error: 'method_not_allowed' });

  if (!SECRET) {
    console.error('[paystack-subaccount] PAYSTACK_SECRET_KEY is not set on this deploy');
    return json(503, {
      error: 'paystack_not_configured',
      message: 'Bank payouts are not switched on yet. Your PayPal address still works.',
    });
  }

  let action, artistId, accountNumber, bankCode, bankName;
  try {
    const b = JSON.parse(event.body || '{}');
    action        = String(b.action || '');
    artistId      = b.artistId || null;
    accountNumber = b.accountNumber ? String(b.accountNumber).replace(/\s+/g, '') : null;
    bankCode      = b.bankCode ? String(b.bankCode) : null;
    bankName      = b.bankName ? String(b.bankName) : null;
  } catch {
    return json(400, { error: 'invalid_body' });
  }

  const admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

  // ── Listing banks needs no identity ───────────────────────────────────────
  //
  // It is the same public list for everybody and nothing about it is specific
  // to the caller, so it is answered before the auth work below. It still
  // needs the secret, which is exactly why it is here and not in the browser.
  if (action === 'banks') {
    try {
      const banks = await paystack('/bank?country=south%20africa&currency=ZAR&perPage=100');
      return json(200, {
        banks: (banks || [])
          .filter(b => b && b.active !== false && b.code && b.name)
          .map(b => ({ name: b.name, code: b.code, slug: b.slug }))
          .sort((a, b) => a.name.localeCompare(b.name)),
      });
    } catch (err) {
      console.error('[paystack-subaccount] bank list failed:', err.message);
      return json(502, { error: 'bank_list_failed', message: err.message });
    }
  }

  if (action !== 'save') return json(400, { error: 'action must be banks or save' });

  // ── From here on, the caller has to be the artist ─────────────────────────
  //
  // This writes the destination for somebody's money. The artist id is taken
  // from the signed in user rather than from the request body, because a body
  // is whatever the caller decided to type: trusting it would let anybody
  // point another artist's earnings at their own bank account.
  const token = (event.headers.authorization || '').replace('Bearer ', '').trim();
  if (!token) return json(401, { error: 'sign_in_required' });

  const { data: { user } = {} } = await admin.auth.getUser(token);
  if (!user) return json(401, { error: 'sign_in_required' });

  const { data: ownArtist, error: artistErr } = await admin
    .from('artists')
    .select('id, artist_name')
    .eq('user_id', user.id)
    .maybeSingle();

  if (artistErr) {
    console.error('[paystack-subaccount] artist lookup failed:', artistErr.code, artistErr.message);
    return json(500, { error: 'lookup_failed' });
  }
  if (!ownArtist) return json(403, { error: 'not_an_artist' });

  // The body may name an artist. It only ever gets to name this one.
  if (artistId && artistId !== ownArtist.id) {
    console.warn('[paystack-subaccount] user', user.id, 'asked to write artist', artistId,
      'but owns', ownArtist.id, '- refused.');
    return json(403, { error: 'not_your_artist' });
  }

  if (!accountNumber || !/^\d{6,20}$/.test(accountNumber)) {
    return json(400, { error: 'bad_account_number', message: 'Enter the account number, digits only.' });
  }
  if (!bankCode) {
    return json(400, { error: 'bad_bank', message: 'Choose your bank from the list.' });
  }

  // The PLATFORM's share. See the long note at the top: percentage_charge is
  // what the main account keeps, and sending the artist's share here instead
  // is what paid the artist nothing.
  const platformShare = Math.max(0, Math.min(100, Number.isFinite(PLATFORM_PCT) ? PLATFORM_PCT : 0));
  const artistShare = 100 - platformShare;

  const payload = {
    business_name: ownArtist.artist_name || 'Feelz Machine artist',
    account_number: accountNumber,
    percentage_charge: platformShare,
    description: `Feelz Machine payouts for ${ownArtist.artist_name || 'artist'}`,
    primary_contact_email: user.email || undefined,
    // BOTH names on purpose. Paystack's parameter table documents bank_code
    // while their own cURL sample sends settlement_bank, and the page does not
    // say which the API actually reads. Sending both costs nothing and removes
    // the guess; whichever it ignores, it ignores quietly.
    bank_code: bankCode,
    settlement_bank: bankCode,
  };

  const { data: existing } = await admin
    .from('artist_payment_profiles')
    .select('artist_id, paystack_subaccount_code')
    .eq('artist_id', ownArtist.id)
    .maybeSingle();

  let data;
  try {
    data = existing && existing.paystack_subaccount_code
      ? await paystack(`/subaccount/${existing.paystack_subaccount_code}`, {
          method: 'PUT', body: JSON.stringify(payload),
        })
      : await paystack('/subaccount', { method: 'POST', body: JSON.stringify(payload) });
  } catch (err) {
    console.error('[paystack-subaccount] save failed:', err.message, JSON.stringify(err.paystack || {}));
    // Paystack's own message is the useful one here: it says things like
    // "Account number is invalid" that the artist can act on, where a generic
    // failure just sends them back to the same form with no idea what to fix.
    return json(err.status === 400 ? 400 : 502, {
      error: 'paystack_rejected',
      message: err.message,
    });
  }

  // What Paystack says it stored, rather than what was asked for. If these
  // ever disagree, somebody's sale is about to be split the wrong way, and
  // the only sign of it would be money arriving in the wrong account.
  const storedPlatformPct = Number(data.percentage_charge);
  if (Number.isFinite(storedPlatformPct) && storedPlatformPct !== platformShare) {
    console.error('[paystack-subaccount] SPLIT MISMATCH on', data.subaccount_code,
      '- sent percentage_charge=', platformShare,
      'but Paystack stored', storedPlatformPct,
      '. On that subaccount the artist would receive', 100 - storedPlatformPct,
      'percent of every sale. Fix it in the Paystack dashboard under',
      'Payments, Subaccounts, Edit, Transaction split.');
  }

  const row = {
    artist_id: ownArtist.id,
    paystack_subaccount_code: data.subaccount_code,
    paystack_bank_code: bankCode,
    // Paystack echoes the bank it resolved, which is more trustworthy than
    // the label the browser sent.
    paystack_bank_name: data.settlement_bank || bankName || null,
    paystack_account_last4: accountNumber.slice(-4),
    updated_at: new Date().toISOString(),
  };

  const { error: saveErr } = existing
    ? await admin.from('artist_payment_profiles').update(row).eq('artist_id', ownArtist.id)
    : await admin.from('artist_payment_profiles').insert(row);

  if (saveErr) {
    // The subaccount exists at Paystack but this end does not know its code,
    // so the artist would be told it failed while a real subaccount sits
    // orphaned. Loud, with the code in the log, so it can be reattached by
    // hand rather than created twice.
    console.error('[paystack-subaccount] subaccount', data.subaccount_code,
      'was created at Paystack but could not be stored:', saveErr.code, saveErr.message);
    return json(500, { error: 'save_failed', message: saveErr.message });
  }

  return json(200, {
    ok: true,
    subaccountCode: data.subaccount_code,
    bankName: row.paystack_bank_name,
    last4: row.paystack_account_last4,
    accountName: data.account_name || null,
    // What the artist actually receives, read back from what Paystack stored
    // rather than from what this function hoped it would store.
    artistSharePct: Number.isFinite(storedPlatformPct) ? 100 - storedPlatformPct : artistShare,
  });
};