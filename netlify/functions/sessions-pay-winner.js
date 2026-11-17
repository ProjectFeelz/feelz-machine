/**
 * netlify/functions/sessions-pay-winner.js
 *
 * Pays the Sessions winner their cash prize from the business PayPal balance.
 *
 *
 * WHY THIS IS NOT JUST A CALL TO paypal-payout.js
 *
 * paypal-payout.js knows how to send money. It does not know anything about
 * Sessions, and the rules that matter here are all Sessions rules:
 *
 *   - only the entry actually marked as the winner gets paid
 *   - an entrant under 18 does not get paid until a guardian has signed
 *   - the amount cannot quietly exceed the prize that was advertised
 *   - the winner is told, in the app and by email, that it is on the way
 *
 * None of that belongs in a generic payout function, and every one of them is
 * the kind of thing that is obvious right up until the night of a livestream.
 * So this checks them, and then hands the actual money movement to the
 * function that already does it properly, forwarding the admin's own token so
 * there is one PayPal implementation rather than two that can drift.
 *
 *
 * THE RAIL IS PAYPAL, AND ONLY PAYPAL
 *
 * Worth saying plainly because the app gives the opposite impression. Artists
 * on Feelz Machine get paid in rand through Paystack, so it reads as though a
 * prize could go the same way. It cannot. A Paystack subaccount splits a sale
 * between buyer and seller at the moment of payment; see netlify/lib/payee.js,
 * which is built around the platform never holding anybody's money. A prize is
 * the opposite shape: no buyer, no sale, money leaving the business account.
 * On Paystack that is the Transfers API, which is not in this codebase.
 *
 * If the winner has no PayPal address this refuses and says so. It does not
 * fall back to anything, because the honest alternative is an EFT done by a
 * person and recorded in school_sessions_prizes, and a function cannot do that.
 *
 *
 * CALLING IT
 *
 *   POST /.netlify/functions/sessions-pay-winner
 *     Authorization: Bearer <an admin's supabase token>
 *     { "entry_id": "...", "amount": 10000, "guardian_confirmed": false }
 *
 *   GET the same path with ?dry_run=true to be told what WOULD happen,
 *   including the exact amount and address, without sending anything.
 */

const { createClient } = require('@supabase/supabase-js');

const SITE_URL = process.env.URL || 'https://www.feelzmachine.com';

const json = (statusCode, body) => ({
  statusCode,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

const admin = () => createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// ── Caller must be an admin ───────────────────────────────────────────────────
async function requireAdmin(authHeader) {
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
  const token = authHeader.replace('Bearer ', '').trim();
  const supabase = admin();
  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) return null;
  const { data: row } = await supabase
    .from('admins').select('id').eq('user_id', user.id).maybeSingle();
  return row ? user : null;
}

// ── Everything the decision needs, read once ──────────────────────────────────
async function readSituation(supabase, entryId) {
  const { data: entry, error } = await supabase
    .from('school_sessions_entries')
    .select('id, competition_id, artist_id, entrant_full_name, entrant_email, entrant_is_minor, is_group, is_winner')
    .eq('id', entryId)
    .maybeSingle();

  if (error) throw new Error('Could not read the entry: ' + error.message);
  if (!entry) return { entry: null };

  const [{ data: comp }, { data: profile }, { data: artist }, { data: existing }] = await Promise.all([
    supabase.from('competitions')
      .select('cash_prize_amount, equipment_prize_amount, cash_prize_currency, title')
      .eq('id', entry.competition_id).maybeSingle(),
    supabase.from('artist_payment_profiles')
      .select('paypal_email').eq('artist_id', entry.artist_id).maybeSingle(),
    supabase.from('artists')
      .select('paypal_email, artist_name, user_id').eq('id', entry.artist_id).maybeSingle(),
    supabase.from('competition_payouts')
      .select('id, status, amount, initiated_at')
      .eq('entry_id', entry.id)
      .in('status', ['processing', 'success'])
      .maybeSingle(),
  ]);

  // The guardian row only matters for a minor, but reading it always costs one
  // query and removes a branch, and a branch is where this gets wrong.
  const { data: guardian } = await supabase
    .from('school_sessions_guardian_consents')
    .select('guardian_name, guardian_contact, prize_paypal_email, prize_signed_name, prize_consented_at')
    .eq('entry_id', entry.id)
    .maybeSingle();

  const clean = (s) => (typeof s === 'string' && s.trim()) ? s.trim() : null;

  // WHERE THE MONEY GOES IS DECIDED BY AGE, NOT BY WHAT IS ON FILE.
  //
  // A minor's prize goes to the guardian who signed for it, full stop. It does
  // NOT fall back to an address on the child's own artist account, even when
  // one exists, because that would route a child's prize past the adult who
  // took responsibility for it. If the guardian has not signed, there is no
  // address, and this refuses rather than finds another one.
  const payTo = entry.entrant_is_minor
    ? (guardian?.prize_consented_at ? clean(guardian.prize_paypal_email) : null)
    : (clean(profile?.paypal_email) || clean(artist?.paypal_email));

  return { entry, comp, artist, existing, guardian, payTo };
}

// ── The rules, in one place, so dry run and the real thing cannot disagree ────
function blockerFor({ entry, comp, existing, guardian, payTo }, amount) {
  if (!entry.is_winner) {
    return 'This entry is not marked as the winner. Mark the winner first.';
  }
  if (existing?.status === 'success') {
    return 'This entry has already been paid.';
  }
  if (existing?.status === 'processing') {
    return 'A payout for this entry is already on its way.';
  }
  // The under-18 checks come first, because for a minor every other answer
  // depends on them.
  if (entry.entrant_is_minor) {
    if (!guardian) {
      return 'This entrant is under 18 and has no guardian on file. Add one before anything can be paid.';
    }
    if (!guardian.prize_consented_at) {
      return `Waiting on ${guardian.guardian_name || 'the guardian'} to sign for the prize. Send them the consent link.`;
    }
    if (!payTo) {
      return 'The guardian signed but left no PayPal address. Contact them, or pay by EFT and record it in the prize log.';
    }
  }
  if (!payTo) {
    return 'There is no PayPal address on this account. Ask them to add one at Profile, Payments, or pay by EFT and record it in the prize log.';
  }
  if (!(amount > 0)) {
    return 'Enter an amount greater than zero.';
  }
  const advertised = Number(comp?.cash_prize_amount || 0);
  if (advertised > 0 && amount > advertised) {
    return `That is more than the prize on the competition, which is ${advertised}. Change the prize amount first if it really did go up.`;
  }
  return null;
}

exports.handler = async (event) => {
  const dryRun = event.queryStringParameters?.dry_run === 'true';

  if (event.httpMethod !== 'POST' && !dryRun) {
    return json(405, { error: 'Use POST, or GET with dry_run=true.' });
  }

  const user = await requireAdmin(event.headers?.authorization);
  if (!user) return json(403, { error: 'Admins only.' });

  let body = {};
  if (event.body) {
    try { body = JSON.parse(event.body); }
    catch { return json(400, { error: 'That was not valid JSON.' }); }
  }

  const entryId = body.entry_id || event.queryStringParameters?.entry_id;
  if (!entryId) return json(400, { error: 'entry_id is required.' });

  const supabase = admin();

  let situation;
  try {
    situation = await readSituation(supabase, entryId);
  } catch (e) {
    return json(500, { error: e.message });
  }
  if (!situation.entry) return json(404, { error: 'No entry with that id.' });

  const { entry, comp, artist, guardian, payTo } = situation;

  // The amount defaults to the advertised prize, so the common case is one
  // click and no typing, but an explicit amount always wins.
  const amount = body.amount != null
    ? Number(body.amount)
    : Number(comp?.cash_prize_amount || 0);

  const currency = (comp?.cash_prize_currency || 'ZAR').toUpperCase();
  const blocker = blockerFor(situation, amount);

  if (dryRun) {
    return json(200, {
      dry_run: true,
      winner: entry.entrant_full_name,
      is_group: !!entry.is_group,
      is_minor: !!entry.entrant_is_minor,
      would_pay: payTo || null,
      amount,
      currency,
      processor: payTo ? 'paypal' : 'none',
      guardian: entry.entrant_is_minor
        ? { name: guardian?.guardian_name || null, signed_at: guardian?.prize_consented_at || null }
        : null,
      blocker,
      would_send: !blocker,
    });
  }

  if (blocker) return json(409, { error: blocker });

  // ── Send it ────────────────────────────────────────────────────────────────
  //
  // Forwarding the admin's own Authorization header rather than an internal
  // secret, because the caller IS an admin and paypal-payout.js already
  // accepts that. One fewer environment variable that can be unset in
  // production without anybody noticing until a prize fails to pay.
  const note = `Feelz Machine Sessions prize${comp?.title ? ' — ' + comp.title : ''}`;

  let payoutResult;
  try {
    const res = await fetch(`${SITE_URL}/.netlify/functions/paypal-payout`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': event.headers.authorization,
      },
      body: JSON.stringify({
        email: payTo,
        amount,
        currency,
        note,
        competition_id: entry.competition_id,
        entry_id: entry.id,
        artist_id: entry.artist_id,
      }),
    });
    payoutResult = await res.json();
    if (!res.ok) {
      return json(res.status, { error: payoutResult.error || 'The payout was refused.' });
    }
  } catch (e) {
    // A thrown fetch leaves it genuinely unknown whether PayPal took the
    // batch, so this says exactly that instead of inviting a second click.
    console.error('[sessions-pay-winner] payout call threw:', e.message);
    return json(502, {
      error: 'The payout call failed before it returned. Check PayPal for a batch before trying again.',
    });
  }

  // ── Record keeping, best effort ────────────────────────────────────────────
  //
  // paypal-payout.js has already written the competition_payouts row. These
  // two fields are the Sessions context it had no way to know. A failure here
  // must never look like a failed payout, so it is logged and swallowed.
  try {
    await supabase.from('competition_payouts')
      .update({
        processor: 'paypal',
        recipient_name: entry.entrant_is_minor
          ? `${guardian?.prize_signed_name || guardian?.guardian_name} (guardian of ${entry.entrant_full_name})`
          : entry.entrant_full_name,
        note: entry.entrant_is_minor
          ? `Winner is under 18. Signed for by ${guardian?.prize_signed_name} on ${new Date(guardian.prize_consented_at).toISOString().slice(0, 10)}.`
          : null,
      })
      .eq('entry_id', entry.id)
      .eq('status', 'processing');
  } catch (e) {
    console.error('[sessions-pay-winner] could not annotate the payout row:', e.message);
  }

  // ── Tell the winner ────────────────────────────────────────────────────────
  //
  // Money arriving unannounced from a name somebody half remembers is how a
  // prize gets mistaken for a scam. Also swallowed on failure: the money is
  // already gone and a failed notification is not a reason to report an error.
  if (artist?.user_id) {
    try {
      await supabase.from('notifications').insert({
        user_id: artist.user_id,
        artist_id: entry.artist_id,
        type: 'admin_message',
        title: 'Your Sessions prize is on its way',
        message:
          (entry.entrant_is_minor
            ? `You won. Because you are under 18, we have sent ${currency} ${Number(amount).toLocaleString()} to ${guardian?.guardian_name || 'your guardian'}, who signed for it.\n\n`
            : `You won. We have sent ${currency} ${Number(amount).toLocaleString()} to your PayPal address, ${payTo}.\n\n`) +
          (Number(comp?.equipment_prize_amount) > 0
            ? `That is the cash half. The ${currency} ${Number(comp.equipment_prize_amount).toLocaleString()} of studio equipment is not money and is not sent, we arrange that with you and hand it over.\n\n`
            : '') +
          `PayPal usually takes a few minutes, sometimes a day. If nothing shows up by this time tomorrow, reply here and we will chase it.\n\n` +
          `Congratulations. You earned this one.`,
        email_requested: true,
        metadata: {
          kind: 'sessions_prize_sent',
          entry_id: entry.id,
          amount,
          currency,
        },
      });
    } catch (e) {
      console.error('[sessions-pay-winner] winner not notified:', e.message);
    }
  }

  return json(200, {
    success: true,
    paid: entry.entrant_full_name,
    to: payTo,
    amount,
    currency,
    batch_id: payoutResult.batch_id,
    status: payoutResult.status,
  });
};
