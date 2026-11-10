/**
 * netlify/functions/platform-daily-story.js
 *
 * Scheduled: daily at 08:00 UTC
 * Builds one story as an SVG, uploads it to Supabase storage, and inserts it
 * into artist_stories under the platform artist account.
 *
 * No external npm packages — pure Node.js + SVG string generation.
 *
 * Which artist the story is posted as:
 *
 *   1. PLATFORM_ARTIST_ID, if set
 *   2. platform_settings.platform_artist_id, if that row exists
 *   3. the artists row whose name is "Feelz Machine"
 *
 * The database is the better home for this than an env var: it is one row you
 * can change without a redeploy, and platform_settings already exists for the
 * cron run keys.
 *
 *   insert into platform_settings (key, value)
 *   values ('platform_artist_id', 'PASTE-THE-UUID')
 *   on conflict (key) do update set value = excluded.value;
 *
 *
 * WHY THIS STOPPED BEING A STATS CARD
 * ───────────────────────────────────
 *
 * It used to post the same thing every day: artists, tracks, streams, a
 * trending line, the open competition and a tip. The person whose account it
 * posts from deleted it most mornings, and she was right to. Three things were
 * wrong with it.
 *
 * It was internal. "124 artists on the platform" is a number that means
 * something to the person running the platform and nothing to the person
 * reading it. There was nobody to look at, nothing to play and nothing to do.
 *
 * It was the same every day, so the story ring said "nothing happened here"
 * every time somebody opened it, which is worse than an empty ring.
 *
 * And part of it was untrue. The competition callout advertised Collab
 * Roulette entries as open. Collab Roulette was switched off in netlify.toml,
 * those competitions never close, and the newest one stopped taking entries on
 * 8 November, so the card was pointing at a locked door. Two of the twelve
 * tips were about the same dead feature.
 *
 * So this now picks one of several KINDS of story, each about a person or a
 * piece of music rather than about the platform, and each ending in something
 * the reader can actually do:
 *
 *   new_artist   somebody who has just put their first music up
 *   new_release  the newest track, named, with its artist
 *   most_played  the track most people have played
 *   community    the counter, with the promise it is evidence for
 *   artist_tip   one thing an artist can go and do today
 *
 * A kind with nothing to say returns null and the next is tried, so the ring
 * is never empty, and a short memory in platform_settings keeps it from
 * repeating a kind or a person too soon.
 *
 *
 * THE COUNTS ARE THE HONEST ONES
 * ──────────────────────────────
 *
 * The old card counted every row in `artists`, which is 125. About 30 of those
 * are seeded personas built to make an empty platform navigable and they have
 * no music on them at all; another 40-odd are accounts that never published.
 * The number a reader can check by opening Browse is 26.
 *
 * Showing 125 to an audience of musicians who can count the profiles
 * themselves costs the only thing being sold here, which is that this platform
 * tells artists the truth. REAL_COUNTS_ONLY is the single line to change if
 * that call is ever revisited.
 */

const { createClient } = require('@supabase/supabase-js');
const { wrapHandler } = require('../lib/jobRun');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Where the generated image goes, and why it is not `stories`.
//
// This job uploaded to `stories` and failed on every run it has ever had: six
// recorded runs, six 500s reading "mime type image/svg+xml is not supported".
// That bucket's allowed_mime_types has no SVG in it, so not one story was ever
// posted, and the only reason anybody knows is that the run now gets a row in
// job_runs.
//
// The allowlist on `stories` is right and stays as it is. Artists can upload
// there ("Artists and admins can upload to stories"), an SVG is a document that
// can carry <script>, and the download button in ArtistStories.js navigates
// top-level to media_url, so a scripted SVG uploaded by any artist would
// execute at the Supabase storage origin.
//
// platform-media (migration 218) exists for the one SVG that is not user
// content. It allows SVG and has no write policy for the `authenticated` role
// at all, so only this function, holding the service role, can write to it.
// Nothing user-submitted may ever be uploaded here.
const MEDIA_BUCKET = 'platform-media';

// How long a generated image is kept. Each day writes a new date-stamped file,
// so without a sweep this grows by one file a day forever.
const KEEP_DAYS = 14;

// Count only artists and music a reader could find for themselves. See the
// header. Set to false to count seeded personas and unpublished profiles too.
const REAL_COUNTS_ONLY = true;

// What the rotation remembers, so a kind or a person is not repeated too soon.
const MEMORY_KEY  = 'platform_story_recent';
const MEMORY_DAYS = 45;

// ── Who it posts as ─────────────────────────────────────────────────────────

// Resolved at call time, not module load, so a value set in the database
// takes effect on the next run rather than the next deploy.
async function resolvePlatformArtistId() {
  if (process.env.PLATFORM_ARTIST_ID) {
    return { id: process.env.PLATFORM_ARTIST_ID, source: 'PLATFORM_ARTIST_ID env var' };
  }

  const { data: setting, error: settingErr } = await supabase
    .from('platform_settings')
    .select('value')
    .eq('key', 'platform_artist_id')
    .maybeSingle();
  if (settingErr) {
    console.error('[platform-daily-story] platform_settings read failed:', settingErr.code, settingErr.message);
  }
  if (setting && setting.value) {
    return { id: setting.value, source: 'platform_settings.platform_artist_id' };
  }

  const { data: byName, error: nameErr } = await supabase
    .from('artists')
    .select('id, artist_name, slug')
    .ilike('artist_name', 'Feelz Machine')
    .limit(1)
    .maybeSingle();
  if (nameErr) {
    console.error('[platform-daily-story] artist name lookup failed:', nameErr.code, nameErr.message);
  }
  if (byName && byName.id) {
    return { id: byName.id, source: `artists.artist_name = "${byName.artist_name}" (slug ${byName.slug})` };
  }

  return { id: null, source: null };
}

// ── Tips ────────────────────────────────────────────────────────────────────

// Each one has to be true today and has to be something the reader can go and
// do. Three were removed rather than reworded: two described Collab Roulette,
// which is off, and one told artists to add a PayPal address so they could
// receive competition prize payouts, which no longer happen. A payout address
// is still worth having for a reason that is true now, so that one is
// rewritten rather than dropped.
const ARTIST_TIPS = [
  'Upload your stems alongside the track. It is the fastest way to get asked for a collab.',
  'Set your genre and mood in Profile, Edit. That is what puts you in front of people in Collab Radar.',
  'Add a payout destination before you price anything. Without one the checkout turns the sale away.',
  'Record a Voice Memo. Thirty seconds of your voice does more than a text post ever will.',
  'Go Live from your profile and every one of your followers is told the moment you start.',
  'Your @link, feelzmachine.com/@yourname, works anywhere a link does. Put it in your bio.',
  'Put a price on a download and all of it is yours. Feelz Machine takes no cut of the sale.',
  'Open pre-orders before a release so people can save it the day you announce it.',
  'Set a Tip Goal. People give more when they can see what they are giving towards.',
  'Post a Thought of the Day, up to three times a day. It is what keeps you in feeds.',
];

// ── Small helpers ───────────────────────────────────────────────────────────

function formatNumber(n) {
  if (!n) return '0';
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${Math.floor(n / 1000)}K`;
  return n.toString();
}

function escapeXml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function wrapSvgText(text, maxChars) {
  const words = String(text || '').split(' ');
  const lines = [];
  let current = '';
  for (const word of words) {
    if ((current + ' ' + word).trim().length > maxChars) {
      if (current) lines.push(current.trim());
      current = word;
    } else {
      current = (current + ' ' + word).trim();
    }
  }
  if (current) lines.push(current.trim());
  return lines;
}

// Initials for the avatar disc.
//
// The story is a standalone SVG served as an image, and a browser rendering an
// SVG through <img> refuses to load anything external, so a profile photo
// cannot be pulled in by URL. Inlining one as base64 would mean this function
// downloading an arbitrary artist upload and embedding it, which is both heavy
// and a thing to be careful with. Initials in a disc are deliberate rather
// than a missing image, and they look the same at any size.
function initialsOf(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

// ── The frame every story shares ────────────────────────────────────────────
//
// One layout, filled differently. The header, the rule, the footer and the
// spacing are identical whichever kind is posted, so a week of stories reads
// as one voice rather than five unrelated cards.
//
// It lays out in two passes. The first measures each block, because a title is
// one line for "Run" and three for a band with a long name, and the second
// draws the whole stack centred in the space between the rule and the button.
// Measuring first is what stops a short story sitting in the top third of the
// screen with a hole under it, which is what a single top-down cursor did.

const W = 1080;
const H = 1920;

// The band the content lives in: under the header rule, above the button.
const BODY_TOP    = 290;
const BODY_BOTTOM = 1560;

// There is no text measurement in a plain SVG string, so width is estimated
// from the character count. 0.55em per character is a little generous for this
// font at these weights, which is the direction to err in: the cost of being
// wrong is a slightly small line rather than a line out past the edge.
const EM_RATIO = 0.55;

function fitFontSize(text, maxWidth, preferred, minimum) {
  const len = String(text || '').length || 1;
  const size = Math.floor(maxWidth / (len * EM_RATIO));
  return Math.max(minimum, Math.min(preferred, size));
}

function renderStory({ kicker, avatarText, title, lines = [], stats = [], cta, dateStr }) {
  // ── Pass one: work out what is going on the page and how tall it is ───────
  const blocks = [];

  if (avatarText) {
    blocks.push({ height: 220, draw: (y) => `
    <circle cx="${W / 2}" cy="${y + 70}" r="90" fill="rgba(139,92,246,0.18)" stroke="rgba(139,92,246,0.45)" stroke-width="3"/>
    <text x="${W / 2}" y="${y + 100}" font-family="system-ui,sans-serif" font-size="72" font-weight="700" fill="rgba(255,255,255,0.9)" text-anchor="middle">${escapeXml(avatarText)}</text>` });
  }

  if (kicker) {
    blocks.push({ height: 90, draw: (y) => `
    <text x="${W / 2}" y="${y + 30}" font-family="system-ui,sans-serif" font-size="30" font-weight="700" fill="rgba(167,139,250,0.9)" text-anchor="middle" letter-spacing="5">${escapeXml(kicker)}</text>` });
  }

  // The title steps down a size rather than being clipped, because the thing
  // most worth reading on these is a person's name, and a name cut in half is
  // worse than a name set smaller.
  const titleLines = wrapSvgText(title, 18).slice(0, 3);
  const titleSize  = titleLines.length >= 3 ? 60 : titleLines.length === 2 ? 70 : 82;
  const titleStep  = Math.round(titleSize * 1.15);
  blocks.push({
    height: titleLines.length * titleStep + 30,
    draw: (y) => titleLines.map((line, i) => `
    <text x="${W / 2}" y="${y + titleSize + i * titleStep}" font-family="system-ui,sans-serif" font-size="${titleSize}" font-weight="700" fill="rgba(255,255,255,0.97)" text-anchor="middle">${escapeXml(line)}</text>`).join(''),
  });

  for (const line of lines) {
    const wrapped = wrapSvgText(line, 40).slice(0, 2);
    blocks.push({
      height: wrapped.length * 52 + 14,
      draw: (y) => wrapped.map((part, i) => `
    <text x="${W / 2}" y="${y + 36 + i * 52}" font-family="system-ui,sans-serif" font-size="36" fill="rgba(255,255,255,0.55)" text-anchor="middle">${escapeXml(part)}</text>`).join(''),
    });
  }

  if (stats.length) {
    blocks.push({ height: 40, draw: () => '' });
    for (const stat of stats) {
      blocks.push({ height: 175, draw: (y) => `
    <rect x="140" y="${y}" width="800" height="150" rx="24" fill="url(#statbg)" stroke="rgba(139,92,246,0.2)" stroke-width="1.5"/>
    <text x="200" y="${y + 95}" font-family="system-ui,sans-serif" font-size="66" font-weight="700" fill="rgba(255,255,255,0.95)">${escapeXml(stat.value)}</text>
    <text x="880" y="${y + 95}" font-family="system-ui,sans-serif" font-size="30" fill="rgba(255,255,255,0.4)" text-anchor="end">${escapeXml(stat.label)}</text>` });
    }
  }

  // ── Pass two: centre the stack and draw it ───────────────────────────────
  const total = blocks.reduce((n, b) => n + b.height, 0);
  let y = Math.max(BODY_TOP, BODY_TOP + ((BODY_BOTTOM - BODY_TOP) - total) / 2);
  const parts = [];
  for (const block of blocks) {
    parts.push(block.draw(y));
    y += block.height;
  }

  // The call to action is pinned to the bottom rather than following the
  // content, so it is in the same place in every story and a reader learns
  // where to look for it.
  //
  // Its text is a profile address, and an address is as long as the artist's
  // slug happens to be: "feelzmachine.com/@the-nostalgic-unit" ran straight out
  // of both ends of the button. So the pill is as wide as the design allows and
  // the type shrinks to fit inside it rather than the text being cut.
  const CTA_X = 110;
  const CTA_W = W - CTA_X * 2;
  const ctaSize = cta ? fitFontSize(cta, CTA_W - 80, 38, 24) : 0;
  const ctaSvg = cta ? `
    <rect x="${CTA_X}" y="1600" width="${CTA_W}" height="110" rx="55" fill="rgba(139,92,246,0.22)" stroke="rgba(139,92,246,0.5)" stroke-width="2"/>
    <text x="${W / 2}" y="${1655 + Math.round(ctaSize / 3)}" font-family="system-ui,sans-serif" font-size="${ctaSize}" font-weight="700" fill="rgba(255,255,255,0.92)" text-anchor="middle">${escapeXml(cta)}</text>` : '';

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#0a0a12"/>
      <stop offset="100%" stop-color="#0d0a1a"/>
    </linearGradient>
    <radialGradient id="glow" cx="50%" cy="0%" r="55%">
      <stop offset="0%" stop-color="rgba(139,92,246,0.28)"/>
      <stop offset="100%" stop-color="transparent"/>
    </radialGradient>
    <linearGradient id="statbg" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="rgba(139,92,246,0.12)"/>
      <stop offset="100%" stop-color="rgba(109,40,217,0.05)"/>
    </linearGradient>
  </defs>

  <rect width="${W}" height="${H}" fill="url(#bg)"/>
  <rect width="${W}" height="${H}" fill="url(#glow)"/>

  ${Array.from({ length: 14 }, (_, i) => `<line x1="${(i + 1) * 80}" y1="0" x2="${(i + 1) * 80}" y2="${H}" stroke="rgba(139,92,246,0.04)" stroke-width="1"/>`).join('')}
  ${Array.from({ length: 24 }, (_, i) => `<line x1="0" y1="${(i + 1) * 80}" x2="${W}" y2="${(i + 1) * 80}" stroke="rgba(139,92,246,0.04)" stroke-width="1"/>`).join('')}

  <text x="${W / 2}" y="130" font-family="system-ui,sans-serif" font-size="36" font-weight="700" fill="rgba(139,92,246,0.85)" text-anchor="middle" letter-spacing="6">FEELZ MACHINE</text>
  <text x="${W / 2}" y="180" font-family="system-ui,sans-serif" font-size="28" fill="rgba(255,255,255,0.25)" text-anchor="middle">${escapeXml(dateStr)}</text>
  <line x1="120" y1="210" x2="${W - 120}" y2="210" stroke="rgba(139,92,246,0.3)" stroke-width="2"/>
  ${parts.join('\n')}
  ${ctaSvg}

  <text x="${W / 2}" y="${H - 70}" font-family="system-ui,sans-serif" font-size="28" font-weight="700" fill="rgba(139,92,246,0.5)" text-anchor="middle">feelzmachine.com</text>
</svg>`;
}

// ── What the rotation remembers ─────────────────────────────────────────────

async function readMemory() {
  const { data } = await supabase
    .from('platform_settings')
    .select('value')
    .eq('key', MEMORY_KEY)
    .maybeSingle();
  if (!data || !data.value) return [];
  try {
    const parsed = JSON.parse(data.value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    // A memory that cannot be parsed is a memory of nothing. Starting over
    // costs one repeated story; throwing here would cost the whole run.
    return [];
  }
}

async function writeMemory(entries) {
  const cutoff = Date.now() - MEMORY_DAYS * 86400000;
  const kept = entries
    .filter(e => e && e.on && Date.parse(e.on) > cutoff)
    .slice(-40);
  const { error } = await supabase
    .from('platform_settings')
    .upsert({ key: MEMORY_KEY, value: JSON.stringify(kept) }, { onConflict: 'key' });
  if (error) console.warn('[platform-daily-story] could not save the rotation memory:', error.message);
}

const daysSince = (iso) => (Date.now() - Date.parse(iso)) / 86400000;

function usedRecently(memory, { kind, subject, withinDays }) {
  return memory.some(e =>
    (kind ? e.kind === kind : true) &&
    (subject ? e.subject === subject : true) &&
    daysSince(e.on) < withinDays
  );
}

// ── Gathering ───────────────────────────────────────────────────────────────

// One read of the published catalogue, shared by four of the five kinds. 154
// tracks today, so this is a small query and splitting it up would cost more
// than it saves.
//
// The relationship is named rather than left to PostgREST to work out. There
// are two foreign keys between these tables, and an unnamed embed answers 300
// PGRST201 the moment a second one exists, which is how albums disappeared
// from the whole site once already.
async function loadCatalogue() {
  const { data, error } = await supabase
    .from('tracks')
    .select('id, title, artist_id, genre, stream_count, created_at, artists!tracks_artist_id_fkey(artist_name, slug, is_published, is_seed_persona)')
    .eq('is_published', true)
    .order('created_at', { ascending: false })
    .limit(2000);
  if (error) throw error;

  return (data || []).filter(t => {
    const a = t.artists;
    if (!a || !a.artist_name || !a.slug) return false;
    if (a.is_published === false) return false;
    if (REAL_COUNTS_ONLY && a.is_seed_persona) return false;
    return true;
  });
}

// Somebody whose FIRST published track went up recently, which is a different
// question from when they made the account. Most new accounts never publish
// anything, and a story welcoming an empty profile sends people to a page with
// nothing on it.
function pickNewArtist(catalogue, memory) {
  const firstPublished = new Map();
  for (const t of catalogue) {
    const prev = firstPublished.get(t.artist_id);
    if (!prev || Date.parse(t.created_at) < Date.parse(prev.created_at)) {
      firstPublished.set(t.artist_id, t);
    }
  }

  const candidates = [...firstPublished.entries()]
    .filter(([, t]) => daysSince(t.created_at) <= 21)
    .sort((a, b) => Date.parse(b[1].created_at) - Date.parse(a[1].created_at));

  for (const [artistId, first] of candidates) {
    if (usedRecently(memory, { subject: artistId, withinDays: 30 })) continue;
    const a = first.artists;
    const count = catalogue.filter(t => t.artist_id === artistId).length;
    return {
      kind: 'new_artist',
      subject: artistId,
      caption: `New on Feelz Machine: ${a.artist_name}`,
      story: {
        kicker: 'NEW ON FEELZ MACHINE',
        avatarText: initialsOf(a.artist_name),
        title: a.artist_name,
        lines: [
          count === 1 ? `First track up: ${first.title}` : `${count} tracks up, starting with ${first.title}`,
          first.genre ? `${first.genre}. Everything they sell is theirs.` : 'Everything they sell is theirs.',
        ],
        cta: `feelzmachine.com/@${a.slug}`,
      },
    };
  }
  return null;
}

// The newest track, with the same artist held back for five days so one busy
// week from one artist does not become the story every morning. Ten tracks
// from one album went up on 9 November; without this the ring would have shown
// that artist for ten days.
function pickNewRelease(catalogue, memory) {
  for (const t of catalogue) {
    if (daysSince(t.created_at) > 10) break;
    if (usedRecently(memory, { subject: t.id, withinDays: 30 })) continue;
    if (usedRecently(memory, { subject: t.artist_id, withinDays: 5 })) continue;
    return {
      kind: 'new_release',
      subject: t.id,
      artistSubject: t.artist_id,
      caption: `Out now: ${t.title} by ${t.artists.artist_name}`,
      story: {
        kicker: 'OUT NOW',
        title: t.title,
        lines: [
          t.artists.artist_name,
          t.genre ? `${t.genre}. Buy it and the money goes to them, not to us.`
                  : 'Buy it and the money goes to them, not to us.',
        ],
        cta: `feelzmachine.com/@${t.artists.slug}`,
      },
    };
  }
  return null;
}

// Most played, not "trending this week". A weekly figure would need a window
// over listening_events, and this says something true using what is already
// loaded. A track is not repeated for ten days.
function pickMostPlayed(catalogue, memory) {
  const ranked = [...catalogue]
    .filter(t => (t.stream_count || 0) > 0)
    .sort((a, b) => (b.stream_count || 0) - (a.stream_count || 0));

  for (const t of ranked.slice(0, 5)) {
    if (usedRecently(memory, { subject: t.id, withinDays: 10 })) continue;
    return {
      kind: 'most_played',
      subject: t.id,
      caption: `Most played: ${t.title} by ${t.artists.artist_name}`,
      story: {
        kicker: 'MOST PLAYED RIGHT NOW',
        title: t.title,
        lines: [t.artists.artist_name, `${formatNumber(t.stream_count)} plays and counting.`],
        cta: `feelzmachine.com/@${t.artists.slug}`,
      },
    };
  }
  return null;
}

// The counter. The numbers are the small true ones, and the line underneath is
// the reason anybody should care about them, which is the part the old stats
// card never had.
function buildCommunity(catalogue) {
  const artists = new Set(catalogue.map(t => t.artist_id)).size;
  const tracks  = catalogue.length;
  const streams = catalogue.reduce((n, t) => n + (t.stream_count || 0), 0);
  if (!tracks) return null;

  return {
    kind: 'community',
    subject: 'community',
    caption: `${artists} artists, ${tracks} tracks, and not one cut taken`,
    story: {
      kicker: 'WHERE WE ARE TODAY',
      title: 'Not one cut taken',
      lines: ['Every sale on Feelz Machine goes straight to the artist who made it.'],
      stats: [
        { value: formatNumber(artists), label: 'artists with music up' },
        { value: formatNumber(tracks),  label: 'tracks to play' },
        { value: formatNumber(streams), label: 'plays so far' },
      ],
      cta: 'Put your music up free',
    },
  };
}

// The fallback that is always available. Walks the list from a day-of-year
// offset so it does not land on the same tip every time it is reached for.
function buildTip(memory) {
  const startOfYear = Date.UTC(new Date().getUTCFullYear(), 0, 1);
  const dayOfYear = Math.floor((Date.now() - startOfYear) / 86400000);
  for (let i = 0; i < ARTIST_TIPS.length; i++) {
    const tip = ARTIST_TIPS[(dayOfYear + i) % ARTIST_TIPS.length];
    if (usedRecently(memory, { subject: tip, withinDays: 20 })) continue;
    return {
      kind: 'artist_tip',
      subject: tip,
      caption: 'One thing worth doing today',
      story: {
        kicker: 'IF YOU MAKE MUSIC',
        title: 'One thing worth doing today',
        lines: [tip],
        cta: 'feelzmachine.com',
      },
    };
  }
  return null;
}

// Preference order, then cooldowns. A kind with nothing to say drops out, so
// the ring always has something in it.
function choose(catalogue, memory) {
  const options = [
    () => (usedRecently(memory, { kind: 'new_artist',  withinDays: 2 }) ? null : pickNewArtist(catalogue, memory)),
    () => (usedRecently(memory, { kind: 'new_release', withinDays: 2 }) ? null : pickNewRelease(catalogue, memory)),
    () => (usedRecently(memory, { kind: 'most_played', withinDays: 3 }) ? null : pickMostPlayed(catalogue, memory)),
    () => (usedRecently(memory, { kind: 'community',   withinDays: 4 }) ? null : buildCommunity(catalogue)),
    () => buildTip(memory),
  ];

  for (const option of options) {
    const picked = option();
    if (picked) return picked;
  }

  // Everything on cooldown at once can only happen on a quiet platform with a
  // full memory. The counter is always true, so it is the floor.
  return buildCommunity(catalogue);
}

// ── The run ─────────────────────────────────────────────────────────────────

const handler = async () => {
  const { id: PLATFORM_ARTIST_ID, source } = await resolvePlatformArtistId();

  if (!PLATFORM_ARTIST_ID) {
    // A 400 rather than the old 200. This is a misconfiguration, and a
    // scheduled function that reports success while doing nothing is how this
    // went unnoticed in the first place.
    const { data: candidates } = await supabase
      .from('artists')
      .select('id, artist_name, slug')
      .or('artist_name.ilike.%feelz%,slug.ilike.%feelz%')
      .limit(10);
    console.error(
      '[platform-daily-story] NO PLATFORM ARTIST. Set platform_settings.platform_artist_id. ' +
      'Closest matches: ' + JSON.stringify(candidates || [])
    );
    return {
      statusCode: 400,
      body: JSON.stringify({
        error: 'No platform artist configured',
        fix: "insert into platform_settings (key, value) values ('platform_artist_id', '<uuid>') on conflict (key) do update set value = excluded.value;",
        candidates: candidates || [],
      }),
    };
  }

  console.log(`[platform-daily-story] posting as artist ${PLATFORM_ARTIST_ID} (from ${source})`);

  try {
    const [catalogue, memory] = await Promise.all([loadCatalogue(), readMemory()]);

    const picked = choose(catalogue, memory);
    if (!picked) {
      // Nothing published at all. There is no honest story to tell about an
      // empty platform, and an empty ring beats a card about nothing.
      console.warn('[platform-daily-story] nothing to post: no published tracks');
      return { statusCode: 200, body: JSON.stringify({ ok: true, created: 0, reason: 'empty catalogue' }) };
    }

    const dateStr = new Date().toLocaleDateString('en-ZA', { weekday: 'long', day: 'numeric', month: 'long' });
    const svg = renderStory({ ...picked.story, dateStr });

    // The name carries the date rather than being one fixed file, because a
    // public Supabase URL is CDN cached: reusing a name would serve yesterday's
    // picture for today's story. The sweep below keeps that from growing.
    const filename = `platform-story-${new Date().toISOString().slice(0, 10)}.svg`;
    const path     = `platform/${filename}`;
    const { error: upErr } = await supabase.storage
      .from(MEDIA_BUCKET)
      .upload(path, Buffer.from(svg, 'utf8'), {
        contentType: 'image/svg+xml',
        upsert: true,
      });
    if (upErr) throw upErr;

    const { data: { publicUrl } } = supabase.storage.from(MEDIA_BUCKET).getPublicUrl(path);

    // Clear out yesterday's GENERATED story, and only that.
    //
    // This used to delete every story on the platform artist older than 20
    // hours, whoever posted it. The platform account is a real account that a
    // person signs into and posts from, so that sweep was deleting stories this
    // job did not write: a competition story posted at 09:04 would have been
    // removed by the 08:01 run the next morning, an hour before it expired on
    // its own.
    //
    // The generated image is the one thing this job can recognise for certain,
    // because it is the only story whose media_url points into platform-media,
    // a bucket nothing else may write to. Matching on that means a story posted
    // by hand is never this job's to remove. Expiry is somebody else's job
    // anyway: cleanup-stories runs hourly and takes anything past expires_at.
    const { error: delErr } = await supabase.from('artist_stories')
      .delete()
      .eq('artist_id', PLATFORM_ARTIST_ID)
      .like('media_url', `%/${MEDIA_BUCKET}/platform/platform-story-%`)
      .lt('created_at', new Date(Date.now() - 20 * 3600000).toISOString());
    if (delErr) console.warn('[platform-daily-story] old story not removed:', delErr.message);

    const { error: insErr } = await supabase.from('artist_stories').insert({
      artist_id:  PLATFORM_ARTIST_ID,
      media_url:  publicUrl,
      media_type: 'image',
      caption:    picked.caption,
      expires_at: new Date(Date.now() + 24 * 3600000).toISOString(),
    });
    // Checked rather than ignored: an upload with no row behind it is an image
    // nobody will ever see, and that is the shape of failure this whole job has
    // been in since it was written.
    if (insErr) throw insErr;

    // Remember what went out, including the artist behind a release, so the
    // five-day hold on an artist works whichever kind featured them.
    const today = new Date().toISOString();
    const added = [{ kind: picked.kind, subject: picked.subject, on: today }];
    if (picked.artistSubject) added.push({ kind: picked.kind, subject: picked.artistSubject, on: today });
    await writeMemory([...memory, ...added]);

    // Sweep old generated files. Best effort on purpose, because the story is already
    // posted by this point, and failing the run over tidying up would report a
    // success as a failure. A warning in the log is the right weight for it.
    try {
      const { data: old } = await supabase.storage.from(MEDIA_BUCKET)
        .list('platform', { limit: 200, sortBy: { column: 'name', order: 'asc' } });
      const cutoff = new Date(Date.now() - KEEP_DAYS * 86400000).toISOString().slice(0, 10);
      const stale  = (old || [])
        .filter(o => /^platform-story-\d{4}-\d{2}-\d{2}\.svg$/.test(o.name))
        .filter(o => o.name.slice(15, 25) < cutoff)
        .map(o => `platform/${o.name}`);
      if (stale.length) {
        const { error: rmErr } = await supabase.storage.from(MEDIA_BUCKET).remove(stale);
        if (rmErr) console.warn('[platform-daily-story] old files not removed:', rmErr.message);
        else console.log(`[platform-daily-story] swept ${stale.length} file(s) older than ${KEEP_DAYS} days`);
      }
    } catch (sweepErr) {
      console.warn('[platform-daily-story] sweep threw:', sweepErr?.message);
    }

    console.log(`[platform-daily-story] Done — ${picked.kind} — ${publicUrl}`);
    // `created` so wrapHandler records items=1 rather than 0: a run that posted
    // a story has to look different in job_runs from a run that posted none.
    return { statusCode: 200, body: JSON.stringify({ ok: true, created: 1, kind: picked.kind, url: publicUrl }) };

  } catch (err) {
    console.error('[platform-daily-story] Error:', err.message);
    return { statusCode: 500, body: err.message };
  }
};

// Wrapped so this job is visible in job_runs. The handler above is
// unchanged; wrapHandler reads the status it returns and writes one row
// per run, so "ran and did nothing" stops looking like "never ran".
exports.handler = wrapHandler('platform-daily-story', handler);

// Exported so a story can be drawn without waiting for 08:00 and without
// writing anything. Not used by the handler.
exports._internals = { renderStory, choose, ARTIST_TIPS };
