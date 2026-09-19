// netlify/functions/expire-subscriptions.js
//
// Runs daily. Ends subscriptions whose expiry has passed — paid ones and
// admin grants alike.
//
// useTier.js already checks expires_at at read time, so a lapsed subscription
// stops unlocking features on its own. What was missing is anything writing
// that down: the row stayed status = 'active' forever, artists.tier and
// listeners.tier kept their old value, and every admin count of "active
// subscriptions" over-reported permanently. The app and the admin panel were
// reading the same table and disagreeing about it.
//
// An admin grant is a subscription with an expiry like any other and ends on
// its date the same way. The only difference is the reason recorded, so a
// free year ending is distinguishable afterwards from a card failing.

const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

//
// WHY THE AUTH CHECK IN HERE LOOKS BACKWARDS, AND WHY IT IS FINE
//
// The check below only demands the secret when the caller SETS x-manual-run,
// which read as opt-in authentication: omit the header, skip the check. That
// would be a live hole if this function were reachable over HTTP.
//
// It is not. This function is declared with a `schedule` in netlify.toml, and
// Netlify's own documentation is explicit: "Scheduled functions only run on
// their schedule for published deploys and ... you can't invoke them directly
// with a URL." The platform refuses the request before this file runs, so the
// header check is a guard on an entry point that does not exist.
//
// The thing to remember: that is true ONLY while the `schedule` line is there.
// Delete it from netlify.toml and this becomes a public endpoint with opt-in
// authentication, which on a function that moves money is as bad as it sounds.
// If this is ever taken off its schedule, invert the check first: require the
// secret always, and let nothing through without it.
//
exports.handler = async (event) => {
  // A manual run has to prove itself; the scheduler does not send headers.
  if (event?.headers?.['x-manual-run']
      && event.headers['x-internal-secret'] !== process.env.INTERNAL_FUNCTION_SECRET) {
    return { statusCode: 401, body: 'Unauthorized' };
  }

  try {
    const { data, error } = await supabase.rpc('expire_stale_subscriptions');
    if (error) {
      console.error('[expire-subscriptions] failed:', error.code, error.message);
      return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
    }

    const summary = (data || []).reduce((acc, r) => ({ ...acc, [r.kind]: r.expired }), {});
    const total = Object.values(summary).reduce((a, b) => a + b, 0);

    // Logged every run, including the quiet ones. A job that only speaks up
    // when it does something is indistinguishable from a job that has stopped
    // running, and this one is allowed to be quiet for weeks at a time.
    console.log('[expire-subscriptions] done —', total ? JSON.stringify(summary) : 'nothing to expire');

    return { statusCode: 200, body: JSON.stringify({ ok: true, expired: summary }) };
  } catch (err) {
    console.error('[expire-subscriptions] threw:', err.message);
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};