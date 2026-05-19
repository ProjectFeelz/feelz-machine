/**
 * netlify/functions/platform-daily-story.js
 *
 * Scheduled: daily at 08:00 UTC
 * Generates a platform stats story as an SVG, uploads to Supabase storage,
 * inserts into artist_stories under the platform artist account.
 *
 * No external npm packages — pure Node.js + SVG string generation.
 *
 * Requires env vars:
 *   PLATFORM_ARTIST_ID — artist id for "Feelz Machine" account
 */

const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const PLATFORM_ARTIST_ID = process.env.PLATFORM_ARTIST_ID;

const LESSON_TIPS = [
  "Upload stems with your track to attract collaborators.",
  "Set your genre and mood in Profile → Edit to appear in Collab Radar.",
  "Add your PayPal email so you can receive competition prize payouts.",
  "Voice Memos build loyalty — a 30-second note beats a text post.",
  "Collab Roulette drops every Sunday. Free, Pro and Premium can all enter.",
  "Go Live from your profile — every follower gets notified instantly.",
  "Your @link (feelzmachine.com/@slug) goes in your Instagram bio anywhere.",
  "Entries in competitions are anonymous until the winner is revealed.",
  "Download prices go 100% to you — zero platform cut.",
  "Pre-orders let fans save your track before it drops.",
  "Set a Tip Goal — fans can see what you're saving toward and contribute.",
  "Post a Thought of the Day — up to 3 times daily, keeps you in feeds.",
];

function formatNumber(n) {
  if (!n) return '0';
  if (n >= 1000000) return `${(n/1000000).toFixed(1)}M`;
  if (n >= 1000) return `${Math.floor(n/1000)}K`;
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
  const words = text.split(' ');
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

function generateSVG({ totalArtists, newTracksWeek, totalStreams, trendingTrack, competition, lessonTip, dateStr }) {
  const W = 1080, H = 1920;

  // Competition section
  let compSection = '';
  if (competition) {
    const statusText = competition.status === 'voting'
      ? '🗳️ Voting is open — go vote!'
      : '🎤 Entries open — submit yours';
    const compTitle = escapeXml(competition.title.length > 30 ? competition.title.slice(0, 28) + '…' : competition.title);
    compSection = `
    <!-- Competition callout -->
    <rect x="80" y="1200" width="920" height="220" rx="24" fill="rgba(139,92,246,0.15)" stroke="rgba(139,92,246,0.4)" stroke-width="2"/>
    <text x="120" y="1258" font-family="system-ui,sans-serif" font-size="30" font-weight="700" fill="rgba(167,139,250,0.9)">🎲 ACTIVE CHALLENGE</text>
    <text x="120" y="1308" font-family="system-ui,sans-serif" font-size="42" font-weight="700" fill="white">${compTitle}</text>
    <text x="120" y="1358" font-family="system-ui,sans-serif" font-size="32" fill="rgba(255,255,255,0.45)">${escapeXml(statusText)}</text>`;
  }

  // Trending track section
  let trendingSection = '';
  if (trendingTrack) {
    const truncated = escapeXml(trendingTrack.length > 35 ? trendingTrack.slice(0, 33) + '…' : trendingTrack);
    trendingSection = `
    <!-- Trending -->
    <rect x="80" y="1060" width="920" height="120" rx="20" fill="rgba(255,255,255,0.04)" stroke="rgba(255,255,255,0.08)" stroke-width="1"/>
    <text x="120" y="1110" font-family="system-ui,sans-serif" font-size="28" font-weight="700" fill="rgba(139,92,246,0.8)">🔥 TRENDING NOW</text>
    <text x="120" y="1158" font-family="system-ui,sans-serif" font-size="38" font-weight="700" fill="rgba(255,255,255,0.9)">${truncated}</text>`;
  }

  // Lesson tip — wrap into max 2 lines
  const tipLines = wrapSvgText(lessonTip, 42);
  const tipSvg = tipLines.slice(0, 2).map((line, i) =>
    `<text x="120" y="${1510 + i * 50}" font-family="system-ui,sans-serif" font-size="34" fill="rgba(255,255,255,0.7)">${escapeXml(line)}</text>`
  ).join('\n    ');

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

  <!-- Background -->
  <rect width="${W}" height="${H}" fill="url(#bg)"/>
  <rect width="${W}" height="${H}" fill="url(#glow)"/>

  <!-- Grid lines -->
  ${Array.from({length: 14}, (_,i) => `<line x1="${(i+1)*80}" y1="0" x2="${(i+1)*80}" y2="${H}" stroke="rgba(139,92,246,0.04)" stroke-width="1"/>`).join('')}
  ${Array.from({length: 24}, (_,i) => `<line x1="0" y1="${(i+1)*80}" x2="${W}" y2="${(i+1)*80}" stroke="rgba(139,92,246,0.04)" stroke-width="1"/>`).join('')}

  <!-- Header -->
  <text x="${W/2}" y="130" font-family="system-ui,sans-serif" font-size="36" font-weight="700" fill="rgba(139,92,246,0.85)" text-anchor="middle" letter-spacing="6">FEELZ MACHINE</text>
  <text x="${W/2}" y="180" font-family="system-ui,sans-serif" font-size="28" fill="rgba(255,255,255,0.25)" text-anchor="middle">${escapeXml(dateStr)}</text>
  <line x1="120" y1="210" x2="${W-120}" y2="210" stroke="rgba(139,92,246,0.3)" stroke-width="2"/>

  <!-- Stat: Artists -->
  <rect x="80" y="260" width="920" height="160" rx="24" fill="url(#statbg)" stroke="rgba(139,92,246,0.2)" stroke-width="1.5"/>
  <text x="120" y="330" font-family="system-ui,sans-serif" font-size="48" fill="white">🎤</text>
  <text x="200" y="340" font-family="system-ui,sans-serif" font-size="72" font-weight="700" fill="rgba(255,255,255,0.95)">${formatNumber(totalArtists)}</text>
  <text x="200" y="396" font-family="system-ui,sans-serif" font-size="30" fill="rgba(255,255,255,0.35)">Artists on the platform</text>

  <!-- Stat: New Tracks -->
  <rect x="80" y="460" width="920" height="160" rx="24" fill="url(#statbg)" stroke="rgba(139,92,246,0.2)" stroke-width="1.5"/>
  <text x="120" y="530" font-family="system-ui,sans-serif" font-size="48" fill="white">🎵</text>
  <text x="200" y="540" font-family="system-ui,sans-serif" font-size="72" font-weight="700" fill="rgba(255,255,255,0.95)">${formatNumber(newTracksWeek)}</text>
  <text x="200" y="596" font-family="system-ui,sans-serif" font-size="30" fill="rgba(255,255,255,0.35)">New tracks this week</text>

  <!-- Stat: Total Streams -->
  <rect x="80" y="660" width="920" height="160" rx="24" fill="url(#statbg)" stroke="rgba(139,92,246,0.2)" stroke-width="1.5"/>
  <text x="120" y="730" font-family="system-ui,sans-serif" font-size="48" fill="white">▶️</text>
  <text x="200" y="740" font-family="system-ui,sans-serif" font-size="72" font-weight="700" fill="rgba(255,255,255,0.95)">${formatNumber(totalStreams)}</text>
  <text x="200" y="796" font-family="system-ui,sans-serif" font-size="30" fill="rgba(255,255,255,0.35)">Total streams all time</text>

  ${trendingSection}
  ${compSection}

  <!-- Lesson tip box -->
  <rect x="80" y="1450" width="920" height="220" rx="24" fill="rgba(255,255,255,0.03)" stroke="rgba(255,255,255,0.07)" stroke-width="1"/>
  <text x="120" y="1500" font-family="system-ui,sans-serif" font-size="26" font-weight="700" fill="rgba(255,255,255,0.3)" letter-spacing="2">💡 PLATFORM TIP</text>
  ${tipSvg}

  <!-- Footer -->
  <text x="${W/2}" y="${H-70}" font-family="system-ui,sans-serif" font-size="28" font-weight="700" fill="rgba(139,92,246,0.5)" text-anchor="middle">feelzmachine.com</text>
</svg>`;
}

exports.handler = async () => {
  if (!PLATFORM_ARTIST_ID) {
    console.log('[platform-daily-story] PLATFORM_ARTIST_ID not set — skipping');
    return { statusCode: 200, body: 'skipped: no platform artist id' };
  }

  try {
    const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString();

    const [
      { count: totalArtists },
      { count: newTracksWeek },
      { data: streamData },
      { data: competitions },
    ] = await Promise.all([
      supabase.from('artists').select('*', { count: 'exact', head: true }),
      supabase.from('tracks').select('*', { count: 'exact', head: true }).eq('is_published', true).gte('created_at', weekAgo),
      supabase.from('tracks').select('stream_count').eq('is_published', true).limit(2000),
      supabase.from('competitions').select('id, title, status').in('status', ['open', 'voting']).order('created_at', { ascending: false }).limit(1),
    ]);

    const totalStreams = (streamData || []).reduce((s, t) => s + (t.stream_count || 0), 0);

    // Trending track
    const { data: trending } = await supabase
      .from('tracks')
      .select('title, artists(artist_name)')
      .eq('is_published', true)
      .order('stream_count', { ascending: false })
      .limit(1)
      .maybeSingle();
    const trendingTrack = trending ? `${trending.title} — ${trending.artists?.artist_name}` : null;

    // Rotating tip by day of year
    const dayOfYear = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0)) / 86400000);
    const lessonTip = LESSON_TIPS[dayOfYear % LESSON_TIPS.length];

    const dateStr = new Date().toLocaleDateString('en-ZA', { weekday: 'long', day: 'numeric', month: 'long' });

    const svg = generateSVG({
      totalArtists,
      newTracksWeek,
      totalStreams,
      trendingTrack,
      competition: competitions?.[0] || null,
      lessonTip,
      dateStr,
    });

    // Upload SVG to Supabase storage
    const filename = `platform-story-${new Date().toISOString().slice(0, 10)}.svg`;
    const path     = `platform/${filename}`;
    const { error: upErr } = await supabase.storage
      .from('stories')
      .upload(path, Buffer.from(svg, 'utf8'), {
        contentType: 'image/svg+xml',
        upsert: true,
      });
    if (upErr) throw upErr;

    const { data: { publicUrl } } = supabase.storage.from('stories').getPublicUrl(path);

    // Delete previous platform stories
    await supabase.from('artist_stories')
      .delete()
      .eq('artist_id', PLATFORM_ARTIST_ID)
      .lt('created_at', new Date(Date.now() - 20 * 3600000).toISOString());

    // Insert new story
    await supabase.from('artist_stories').insert({
      artist_id:  PLATFORM_ARTIST_ID,
      media_url:  publicUrl,
      media_type: 'image',
      caption:    `Feelz Machine · ${dateStr}`,
      expires_at: new Date(Date.now() + 24 * 3600000).toISOString(),
    });

    console.log(`[platform-daily-story] Done — ${publicUrl}`);
    return { statusCode: 200, body: JSON.stringify({ ok: true }) };

  } catch (err) {
    console.error('[platform-daily-story] Error:', err.message);
    return { statusCode: 500, body: err.message };
  }
};