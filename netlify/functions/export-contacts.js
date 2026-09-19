// netlify/functions/export-contacts.js
//
// Hands a Premium/Pro artist a CSV of their followers' names and email
// addresses.
//
//
// WHAT CHANGED, AND WHY IT HAD TO
//
// The previous version checked no consent of any kind. It read every row in
// `follows` for the artist, looked up each follower's address, and returned the
// lot. Meanwhile ContactPreferencesPage describes itself to users as the place
// they control exactly this, `artist_contacts.opted_in` exists for exactly
// this, and get_my_contact_status() reports it back to them — and nothing on
// the export path ever read it. A user who opted out was exported anyway.
//
// That is the worst kind of consent bug: the mechanism exists, the user is told
// it works, and it is wired to nothing.
//
// Three gates now apply, and a follower must pass all three:
//
//   1. artist_contacts.opted_in is not false for THIS artist. This is the
//      per-artist consent the preferences page edits.
//   2. email_subscribers.subscribed is not false. Platform-wide withdrawal.
//      Someone who has told you to stop emailing them should not appear on a
//      list you are about to email.
//   3. There is an address to export.
//
// Both gates use "is not false" rather than "is true", because both columns
// default to true and a missing row means nobody ever opted out. That matches
// get_my_contact_status() exactly, so what a user is shown is what happens.
//
//
// A THING YOU SHOULD DECIDE, NOT ME
//
// artist_contacts.opted_in DEFAULTS TO TRUE, and rows are created by the
// sync_follow_to_contacts trigger the moment somebody follows. So all 514
// current rows say opted_in = true and not one of them represents a person
// agreeing to anything — a follow was read as permission to be emailed.
//
// This change makes opting out work. It does not make opting IN meaningful,
// and no code change can: that is a question about what a follow should imply,
// and it is yours. Flipping the column default to false would zero every
// artist's list overnight, which is why I have not done it.
//
//
// THE 1,000-USER CEILING IS GONE
//
// The old version called /auth/v1/admin/users?per_page=1000 with no paging and
// built a map of EVERY user on the platform to look up a handful of addresses.
// Past a thousand accounts it silently dropped followers, and it pulled the
// entire user table into memory to do it. Addresses now come from
// artist_contacts.email, falling back to email_subscribers.email keyed on
// user_id, fetched for the specific followers being exported. No admin API
// call, no ceiling.

const https = require('https');
const { unsubscribeUrl } = require('../lib/unsubscribeToken');

const SITE_URL = process.env.URL || process.env.SITE_URL || 'https://www.feelzmachine.com';

function supabaseRequest(path, method, body, key, supabaseUrl, bearerOverride) {
  return new Promise((resolve, reject) => {
    const url = new URL(supabaseUrl);
    const payload = body ? JSON.stringify(body) : null;
    const options = {
      hostname: url.hostname,
      path,
      method,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${bearerOverride || key}`,
        'apikey': key,
        ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {}),
      },
    };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, body: data }); }
      });
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

// Verifies the caller's own access token against Supabase Auth and returns
// their real user id — never trust a user_id supplied in the request body,
// since that's just a claim from the client with nothing behind it.
async function getVerifiedUserId(authHeader, serviceKey, supabaseUrl) {
  const token = (authHeader || '').replace(/^Bearer\s+/i, '');
  if (!token) return null;
  const res = await supabaseRequest('/auth/v1/user', 'GET', null, serviceKey, supabaseUrl, token);
  if (res.status !== 200 || !res.body?.id) return null;
  return res.body.id;
}

// A few hundred uuids in an in.(...) filter makes a URL long enough for
// PostgREST or an intermediary to reject it, so every id-list read is chunked.
const CHUNK = 100;
function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/**
 * Runs one chunked GET per batch of ids and concatenates the rows. Returns
 * null — not an empty array — if any chunk failed, so the caller can tell
 * "nobody matched" apart from "the query broke". Exporting a short list
 * because a request failed silently is how a consent gate becomes decorative.
 */
async function fetchChunked(pathFor, ids, serviceKey, supabaseUrl, label) {
  const rows = [];
  for (const batch of chunk(ids, CHUNK)) {
    const res = await supabaseRequest(pathFor(batch), 'GET', null, serviceKey, supabaseUrl);
    if (res.status < 200 || res.status >= 300 || !Array.isArray(res.body)) {
      console.error(`[export-contacts] ${label} chunk failed:`, res.status, JSON.stringify(res.body).slice(0, 300));
      return null;
    }
    rows.push(...res.body);
  }
  return rows;
}

// RFC 4180 quoting, plus the spreadsheet-formula guard. A field beginning
// = + - or @ is executed as a formula by Excel, Sheets and Numbers, so a
// follower could set their display name to =HYPERLINK(...) and have it run in
// the artist's spreadsheet. Prefixing with an apostrophe stops that;
// double-quote doubling is what makes an embedded quote survive at all.
function csvField(value) {
  let s = value == null ? '' : String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
}

function slugify(s) {
  return String(s || 'artist')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || 'artist';
}

/**
 * The branded header block.
 *
 * A CSV cannot carry a logo, so "branding" here means the two things that
 * actually help: the file says where it came from, and it says what the
 * artist is allowed to do with it. An address list handed over with no
 * provenance and no stated basis is how people end up emailing someone who
 * withdrew consent six months ago.
 *
 * These are real CSV rows, properly quoted, so Excel, Sheets and Numbers all
 * render them as a small header table above the data. That does mean a tool
 * doing a naive header-row import will see the first row instead of
 * `name,email` — pass { plain: true } to get the bare two-column file for
 * those.
 */
function brandedPreamble({ artistName, count, generatedAt }) {
  return [
    [csvField('FEELZ MACHINE'), csvField('Contact export')].join(','),
    [csvField('Artist'), csvField(artistName)].join(','),
    [csvField('Exported'), csvField(generatedAt)].join(','),
    [csvField('Contacts'), csvField(String(count))].join(','),
    [csvField('Consent basis'), csvField('Followers who have not opted out of contact from this artist')].join(','),
    [csvField('Your obligations'), csvField(
      'Every message must identify you and include that contact\'s unsubscribe_url from the column in this file. ' +
      'Anyone who asks to be removed must be removed. ' +
      'Re-export before each send — this file is a snapshot and does not update when someone withdraws.'
    )].join(','),
    [csvField('unsubscribe_url'), csvField(
      'One link per contact, specific to you. It needs no Feelz Machine account and it takes effect immediately. ' +
      'Put it in every message you send to this list.'
    )].join(','),
    [csvField('Source'), csvField('feelzmachine.com')].join(','),
    '',
  ];
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const supabaseUrl = process.env.SUPABASE_URL;

  if (!serviceKey || !supabaseUrl) {
    return { statusCode: 500, body: JSON.stringify({ error: 'Missing env vars' }) };
  }

  let body;
  try { body = JSON.parse(event.body); }
  catch { return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON' }) }; }

  const { artist_id, plain = false } = body;
  if (!artist_id) {
    return { statusCode: 400, body: JSON.stringify({ error: 'artist_id required' }) };
  }

  const authHeader = event.headers.authorization || event.headers.Authorization;
  const user_id = await getVerifiedUserId(authHeader, serviceKey, supabaseUrl);
  if (!user_id) {
    return { statusCode: 401, body: JSON.stringify({ error: 'Not signed in' }) };
  }

  try {
    // ── Does the caller own this artist profile? ────────────────────────
    const artistRes = await supabaseRequest(
      `/rest/v1/artists?id=eq.${artist_id}&user_id=eq.${user_id}&select=id,artist_name,slug,tier`,
      'GET', null, serviceKey, supabaseUrl
    );
    const artists = artistRes.body;
    if (!Array.isArray(artists) || artists.length === 0) {
      return { statusCode: 403, body: JSON.stringify({ error: 'Unauthorized' }) };
    }

    const artist = artists[0];

    // ── Tier check ─────────────────────────────────────────────────────
    const subRes = await supabaseRequest(
      `/rest/v1/artist_tier_subscriptions?artist_id=eq.${artist_id}&status=eq.active&select=tier_id`,
      'GET', null, serviceKey, supabaseUrl
    );
    const subs = subRes.body;
    let isPremium = ['premium', 'master'].includes(artist.tier);

    if (Array.isArray(subs) && subs.length > 0) {
      const tierRes = await supabaseRequest(
        `/rest/v1/platform_tiers?id=eq.${subs[0].tier_id}&select=slug`,
        'GET', null, serviceKey, supabaseUrl
      );
      const tiers = tierRes.body;
      if (Array.isArray(tiers) && tiers.length > 0) {
        isPremium = ['premium', 'master', 'pro'].includes(tiers[0].slug);
      }
    }

    if (!isPremium) {
      return { statusCode: 403, body: JSON.stringify({ error: 'Premium or Pro plan required' }) };
    }

    // ── GATE 1: per-artist consent ─────────────────────────────────────
    // The source of truth is artist_contacts, not follows. A follow creates a
    // contact row; the contact row is what carries the opt-in, and it is what
    // the preferences page edits. `opted_in=not.is.false` keeps rows where the
    // column is true or null, matching get_my_contact_status().
    const contactsRes = await supabaseRequest(
      `/rest/v1/artist_contacts?artist_id=eq.${artist_id}&opted_in=not.is.false` +
      `&select=user_id,email,name`,
      'GET', null, serviceKey, supabaseUrl
    );

    if (contactsRes.status < 200 || contactsRes.status >= 300 || !Array.isArray(contactsRes.body)) {
      console.error('[export-contacts] artist_contacts read failed:',
        contactsRes.status, JSON.stringify(contactsRes.body).slice(0, 300));
      return {
        statusCode: 500,
        body: JSON.stringify({ error: 'Could not read contact permissions — nothing was exported' }),
      };
    }

    const contacts = contactsRes.body.filter(c => c.user_id);
    if (contacts.length === 0) {
      return {
        statusCode: 200,
        body: JSON.stringify({
          csv: 'name,email,unsubscribe_url\n',
          count: 0,
          note: 'No followers have given permission to be contacted.',
        }),
      };
    }

    const contactIds = [...new Set(contacts.map(c => c.user_id))];

    // ── GATE 2: platform-wide subscription, and the addresses ──────────
    // email_subscribers is where a usable address actually lives —
    // add_email_subscriber_after_profile() populates it at signup with both
    // user_id and email. artist_contacts.email exists but the follow trigger
    // never fills it in, so it is a preference, not a source.
    const subscribers = await fetchChunked(
      batch => `/rest/v1/email_subscribers?user_id=in.(${batch.join(',')})` +
               `&subscribed=not.is.false&select=user_id,email,name`,
      contactIds, serviceKey, supabaseUrl, 'email_subscribers'
    );

    if (subscribers === null) {
      return {
        statusCode: 500,
        body: JSON.stringify({ error: 'Could not read email subscriptions — nothing was exported' }),
      };
    }

    const subByUser = new Map();
    subscribers.forEach(s => {
      if (s.user_id && s.email && !subByUser.has(s.user_id)) subByUser.set(s.user_id, s);
    });

    // ── Names ──────────────────────────────────────────────────────────
    const profiles = await fetchChunked(
      batch => `/rest/v1/user_profiles?user_id=in.(${batch.join(',')})&select=user_id,name`,
      contactIds, serviceKey, supabaseUrl, 'user_profiles'
    );
    const artistNames = await fetchChunked(
      batch => `/rest/v1/artists?user_id=in.(${batch.join(',')})&select=user_id,artist_name`,
      contactIds, serviceKey, supabaseUrl, 'artists'
    );

    // A failed name lookup is not worth refusing the export over — the
    // addresses are the payload and a blank name column is survivable. It is
    // still logged.
    const nameMap = new Map();
    (profiles || []).forEach(p => { if (p.name) nameMap.set(p.user_id, p.name); });
    (artistNames || []).forEach(a => {
      if (a.artist_name && !nameMap.has(a.user_id)) nameMap.set(a.user_id, a.artist_name);
    });

    // ── Build ──────────────────────────────────────────────────────────
    const seen = new Set();
    const rows = [];

    for (const c of contacts) {
      const sub = subByUser.get(c.user_id);
      const email = (c.email || sub?.email || '').trim();
      if (!email) continue;                       // gate 3: no address
      if (!c.email && !sub) continue;             // gate 2: unsubscribed platform-wide

      const key = email.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);

      rows.push({
        name: c.name || nameMap.get(c.user_id) || sub?.name || '',
        email,
        // A WORKING opt-out, per person, for THIS artist.
        //
        // The preamble has always told artists that every message must offer a
        // way to unsubscribe. It did not give them one, so the only thing they
        // could put in their own mail-merge was "reply to be removed" — which
        // is not free of unnecessary effort, does not scale, and puts the
        // obligation on the artist to remember. This link is a real one: it
        // needs no account, it writes opted_in = false for this artist, and
        // the next export from this function will not include the person.
        unsubscribe_url: unsubscribeUrl(SITE_URL, email, `artist:${artist_id}`),
      });
    }

    rows.sort((a, b) => a.email.localeCompare(b.email));

    const generatedAt = new Date().toISOString().replace('T', ' ').slice(0, 16) + ' UTC';
    const dataBlock = [
      'name,email,unsubscribe_url',
      ...rows.map(r => `${csvField(r.name)},${csvField(r.email)},${csvField(r.unsubscribe_url)}`),
    ];

    const csv = (
      plain
        ? dataBlock
        : [...brandedPreamble({ artistName: artist.artist_name, count: rows.length, generatedAt }), ...dataBlock]
    ).join('\n') + '\n';

    const filename =
      `feelz-machine-contacts-${slugify(artist.slug || artist.artist_name)}-` +
      `${new Date().toISOString().slice(0, 10)}.csv`;

    console.log(
      `[export-contacts] artist ${artist_id}: ${contacts.length} consented contacts, ` +
      `${rows.length} exported`
    );

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        csv,
        filename,
        count: rows.length,
        consented: contacts.length,
        branded: !plain,
        generated_at: generatedAt,
      }),
    };

  } catch (err) {
    console.error('[export-contacts] threw:', err);
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};