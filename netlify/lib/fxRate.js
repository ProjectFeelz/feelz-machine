/**
 * netlify/lib/fxRate.js
 *
 * THE EXCHANGE RATE, WITHOUT ANYBODY HAVING TO REMEMBER IT.
 *
 * An earlier version of this read USD_ZAR_RATE out of the environment and
 * expected the owner to update it. That was never going to survive contact
 * with a solo founder running four platforms: the variable would go stale, and
 * a stale rate does not break anything loudly, it just quietly underpays every
 * South African sale until somebody notices months later.
 *
 * So the rate looks after itself:
 *
 *   1. USD_ZAR_RATE in the environment wins if it is set. That is the manual
 *      override, for the day something is wrong and it needs pinning by hand.
 *   2. Otherwise the newest row in fx_rates is used, as long as it is fresher
 *      than MAX_AGE_HOURS.
 *   3. If it is stale, a new one is fetched, sanity checked and stored.
 *   4. If that fetch fails, THE STALE ROW IS STILL USED. A rate from yesterday
 *      is very slightly wrong. No rate at all means a buyer cannot pay, and of
 *      those two, only one loses the artist a sale.
 *   5. Only with no usable rate anywhere does this throw.
 *
 *
 * WHY THE PARSING IS DELIBERATELY LOOSE AND THE CHECKING IS STRICT
 *
 * The free rate APIs disagree about where they put the number: some use
 * rates.ZAR, some conversion_rates.ZAR, some put it at the top level. Pinning
 * this to one vendor's shape means the day that vendor reorganises, the
 * platform starts charging something wrong.
 *
 * So it accepts any of the common shapes, and then does not trust the result
 * one bit. The number has to be finite, positive, and inside PLAUSIBLE_MIN to
 * PLAUSIBLE_MAX. That bound is the real protection: it catches a changed field
 * name, an API that answered with a different currency pair, an error object
 * that happens to contain a number, and a decimal point in the wrong place.
 * Anything failing it is discarded and the last known good rate stands.
 *
 * A wrong rate is worse than an old one, because an old one is off by a
 * percent and a wrong one is off by a factor of ten.
 */

const PAIR = 'USD_ZAR';

// How old a stored rate may be before a refresh is attempted. Rates move by
// well under a percent a day; this is about not hammering a free API.
const MAX_AGE_HOURS = Number(process.env.FX_MAX_AGE_HOURS || 12);

// The sanity window for rand per dollar.
//
// Set wide on purpose. This is not a forecast, it is a tripwire for a result
// that cannot possibly be a USD/ZAR rate. The rand has not been outside this
// range in decades, and anything that is would be news rather than a payment
// problem.
const PLAUSIBLE_MIN = 5;
const PLAUSIBLE_MAX = 50;

// Tried in order, first plausible answer wins. More than one because a free
// endpoint going away should not take payments with it.
const SOURCES = (process.env.FX_SOURCES ||
  'https://api.frankfurter.app/latest?base=USD&symbols=ZAR,' +
  'https://open.er-api.com/v6/latest/USD,' +
  'https://api.exchangerate-api.com/v4/latest/USD'
).split(',').map(s => s.trim()).filter(Boolean);

const MANUAL = process.env.USD_ZAR_RATE ? Number(process.env.USD_ZAR_RATE) : null;

function plausible(n) {
  const v = Number(n);
  return Number.isFinite(v) && v >= PLAUSIBLE_MIN && v <= PLAUSIBLE_MAX;
}

/**
 * Pull a ZAR rate out of whatever shape the API used. Returns null rather than
 * a guess when nothing recognisable is there.
 */
function extractZar(json) {
  if (!json || typeof json !== 'object') return null;
  const candidates = [
    json.rates && json.rates.ZAR,
    json.conversion_rates && json.conversion_rates.ZAR,
    json.data && json.data.ZAR,
    json.data && json.data.rates && json.data.rates.ZAR,
    json.ZAR,
    json.zar,
    json.result,
  ];
  for (const c of candidates) {
    if (plausible(c)) return Number(c);
  }
  return null;
}

async function fetchFresh() {
  for (const url of SOURCES) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 6000);
      let json;
      try {
        const res = await fetch(url, { signal: controller.signal });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        json = await res.json();
      } finally {
        clearTimeout(timer);
      }

      const rate = extractZar(json);
      if (rate === null) {
        console.warn('[fx] no plausible ZAR rate in the response from', url);
        continue;
      }
      return { rate, source: url };
    } catch (err) {
      console.warn('[fx] source failed:', url, err && err.message);
    }
  }
  return null;
}

async function readStored(supabase) {
  const { data, error } = await supabase
    .from('fx_rates')
    .select('rate, source, fetched_at')
    .eq('pair', PAIR)
    .order('fetched_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error('[fx] could not read the stored rate:', error.code, error.message);
    return null;
  }
  if (!data || !plausible(data.rate)) return null;
  return {
    rate: Number(data.rate),
    source: data.source,
    fetchedAt: new Date(data.fetched_at),
    ageHours: (Date.now() - new Date(data.fetched_at).getTime()) / 36e5,
  };
}

async function store(supabase, rate, source) {
  const { error } = await supabase.from('fx_rates').insert({ pair: PAIR, rate, source });
  // A rate that could not be written is still a rate that can be used for this
  // request, so this never throws. The next call simply tries again.
  if (error) console.error('[fx] could not store the new rate:', error.code, error.message);
}

/**
 * The rate to convert a dollar price into rand.
 *
 * @param {object} supabase service-role client
 * @returns {Promise<{rate:number, source:string, stale:boolean}>}
 */
async function getUsdZarRate(supabase) {
  if (MANUAL !== null) {
    if (!plausible(MANUAL)) {
      throw new Error(
        `USD_ZAR_RATE is set to ${process.env.USD_ZAR_RATE}, which is not a believable ` +
        `rand per dollar rate. Refusing rather than charging the wrong amount.`
      );
    }
    return { rate: MANUAL, source: 'env:USD_ZAR_RATE', stale: false };
  }

  const stored = await readStored(supabase);

  if (stored && stored.ageHours < MAX_AGE_HOURS) {
    return { rate: stored.rate, source: stored.source, stale: false };
  }

  const fresh = await fetchFresh();
  if (fresh) {
    await store(supabase, fresh.rate, fresh.source);
    return { rate: fresh.rate, source: fresh.source, stale: false };
  }

  // Nothing fresh. An old rate still sells the track; no rate does not.
  if (stored) {
    console.warn('[fx] using a stale rate,', Math.round(stored.ageHours), 'hours old, because no source answered');
    return { rate: stored.rate, source: stored.source, stale: true };
  }

  throw new Error(
    'No exchange rate is available: nothing stored in fx_rates and no source answered. ' +
    'Refusing rather than guessing a rate.'
  );
}

module.exports = {
  PAIR,
  MAX_AGE_HOURS,
  PLAUSIBLE_MIN,
  PLAUSIBLE_MAX,
  SOURCES,
  plausible,
  extractZar,
  fetchFresh,
  readStored,
  getUsdZarRate,
};