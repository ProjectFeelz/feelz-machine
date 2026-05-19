/**
 * netlify/functions/platform-daily-story.js
 *
 * Scheduled: daily at 08:00 UTC
 * Generates a platform stats story card as an SVG image, uploads to Supabase storage,
 * inserts into artist_stories under a dedicated platform account (artist_id from env).
 * Also posts about active competitions when they exist.
 *
 * Requires:
 *   PLATFORM_ARTIST_ID env var — the artist ID for "Feelz Machine" account
 */

const { createClient } = require('@supabase/supabase-js');
const { createCanvas } = require('canvas');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const PLATFORM_ARTIST_ID = process.env.PLATFORM_ARTIST_ID;

// ── Canvas story card generator ───────────────────────────────────────────────
function drawStoryCard({ totalArtists, newTracksWeek, totalStreams, trendingTrack, competition, lessonTip }) {
  const W = 1080, H = 1920;
  const canvas = createCanvas(W, H);
  const ctx    = canvas.getContext('2d');

  // Background — dark gradient
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#0a0a12');
  bg.addColorStop(1, '#0d0a1a');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // Subtle purple grid
  ctx.strokeStyle = 'rgba(139,92,246,0.05)';
  ctx.lineWidth = 1;
  for (let x = 0; x < W; x += 80) { ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,H); ctx.stroke(); }
  for (let y = 0; y < H; y += 80) { ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(W,y); ctx.stroke(); }

  // Top glow
  const glow = ctx.createRadialGradient(W/2, 0, 0, W/2, 0, 600);
  glow.addColorStop(0, 'rgba(139,92,246,0.3)');
  glow.addColorStop(1, 'transparent');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);

  // Header — Feelz Machine logo text
  ctx.fillStyle = 'rgba(139,92,246,0.8)';
  ctx.font = 'bold 36px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('FEELZ MACHINE', W/2, 140);

  const today = new Date().toLocaleDateString('en-ZA', { weekday: 'long', day: 'numeric', month: 'long' });
  ctx.fillStyle = 'rgba(255,255,255,0.25)';
  ctx.font = '28px sans-serif';
  ctx.fillText(today, W/2, 185);

  // Divider
  ctx.strokeStyle = 'rgba(139,92,246,0.3)';
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(120, 220); ctx.lineTo(W-120, 220); ctx.stroke();

  // Stats section
  const stats = [
    { label: 'Artists', value: totalArtists?.toLocaleString() || '—', emoji: '🎤' },
    { label: 'New tracks this week', value: newTracksWeek?.toLocaleString() || '—', emoji: '🎵' },
    { label: 'Total streams', value: totalStreams ? (totalStreams > 999 ? `${Math.floor(totalStreams/1000)}K+` : totalStreams.toString()) : '—', emoji: '▶️' },
  ];

  let y = 340;
  stats.forEach(({ label, value, emoji }) => {
    // Card background
    ctx.fillStyle = 'rgba(139,92,246,0.08)';
    roundRect(ctx, 80, y, W-160, 160, 24);
    ctx.fill();
    ctx.strokeStyle = 'rgba(139,92,246,0.2)';
    ctx.lineWidth = 1.5;
    roundRect(ctx, 80, y, W-160, 160, 24);
    ctx.stroke();

    ctx.font = '52px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillStyle = 'white';
    ctx.fillText(emoji, 120, y + 90);

    ctx.font = 'bold 72px sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.95)';
    ctx.fillText(value, 200, y + 100);

    ctx.font = '32px sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.fillText(label, 200, y + 140);

    y += 200;
  });

  // Trending track
  if (trendingTrack) {
    y += 20;
    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    roundRect(ctx, 80, y, W-160, 140, 24);
    ctx.fill();

    ctx.font = 'bold 30px sans-serif';
    ctx.fillStyle = 'rgba(139,92,246,0.8)';
    ctx.textAlign = 'left';
    ctx.fillText('🔥 TRENDING NOW', 120, y + 50);
    ctx.font = 'bold 42px sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    const truncated = trendingTrack.length > 32 ? trendingTrack.slice(0,30) + '…' : trendingTrack;
    ctx.fillText(truncated, 120, y + 105);
    y += 180;
  }

  // Competition callout
  if (competition) {
    y += 20;
    const compGrad = ctx.createLinearGradient(80, y, W-80, y);
    compGrad.addColorStop(0, 'rgba(139,92,246,0.25)');
    compGrad.addColorStop(1, 'rgba(109,40,217,0.15)');
    ctx.fillStyle = compGrad;
    roundRect(ctx, 80, y, W-160, 200, 24);
    ctx.fill();
    ctx.strokeStyle = 'rgba(139,92,246,0.4)';
    ctx.lineWidth = 2;
    roundRect(ctx, 80, y, W-160, 200, 24);
    ctx.stroke();

    ctx.font = 'bold 30px sans-serif';
    ctx.fillStyle = 'rgba(167,139,250,0.9)';
    ctx.textAlign = 'left';
    ctx.fillText('🎲 ACTIVE CHALLENGE', 120, y + 55);

    ctx.font = 'bold 40px sans-serif';
    ctx.fillStyle = 'white';
    const title = competition.title.length > 28 ? competition.title.slice(0,26) + '…' : competition.title;
    ctx.fillText(title, 120, y + 110);

    ctx.font = '32px sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    const status = competition.status === 'voting' ? '🗳️ Voting is open — go vote!' : '🎤 Entries open — submit yours';
    ctx.fillText(status, 120, y + 160);
    y += 240;
  }

  // Lesson tip
  if (lessonTip) {
    y = Math.max(y, H - 380);
    ctx.fillStyle = 'rgba(255,255,255,0.03)';
    roundRect(ctx, 80, y, W-160, 220, 24);
    ctx.fill();

    ctx.font = 'bold 28px sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    ctx.textAlign = 'left';
    ctx.fillText('💡 PLATFORM TIP', 120, y + 52);

    ctx.font = '34px sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    wrapText(ctx, lessonTip, 120, y + 100, W - 240, 42);
  }

  // Footer
  ctx.font = 'bold 28px sans-serif';
  ctx.fillStyle = 'rgba(139,92,246,0.5)';
  ctx.textAlign = 'center';
  ctx.fillText('feelzmachine.com', W/2, H - 80);

  return canvas.toBuffer('image/png');
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x+r, y);
  ctx.lineTo(x+w-r, y);
  ctx.quadraticCurveTo(x+w, y, x+w, y+r);
  ctx.lineTo(x+w, y+h-r);
  ctx.quadraticCurveTo(x+w, y+h, x+w-r, y+h);
  ctx.lineTo(x+r, y+h);
  ctx.quadraticCurveTo(x, y+h, x, y+h-r);
  ctx.lineTo(x, y+r);
  ctx.quadraticCurveTo(x, y, x+r, y);
  ctx.closePath();
}

function wrapText(ctx, text, x, y, maxWidth, lineHeight) {
  const words = text.split(' ');
  let line = '';
  for (let i = 0; i < words.length; i++) {
    const testLine = line + words[i] + ' ';
    if (ctx.measureText(testLine).width > maxWidth && i > 0) {
      ctx.fillText(line, x, y);
      line = words[i] + ' ';
      y += lineHeight;
    } else {
      line = testLine;
    }
  }
  ctx.fillText(line, x, y);
}

const LESSON_TIPS = [
  "Upload stems with your track to attract collaborators who want to work with your sound.",
  "Set your genre and mood in Profile → Edit. Artists without it don't appear in Collab Radar.",
  "Add your PayPal email to your profile so you can receive competition prize payouts instantly.",
  "Voice Memos build loyalty — a 30-second note to your fans beats a text post every time.",
  "The Collab Roulette challenge drops every Sunday. Free, Pro and Premium can all enter.",
  "Go Live from your profile — every follower gets a push notification the moment you start.",
  "Your @link (feelzmachine.com/@yourslug) can go in your Instagram bio, TikTok, anywhere.",
  "Fans get 2 votes each in competitions. Entries are anonymous until the winner is revealed.",
  "Download prices go 100% to you. Not a cent taken by the platform.",
  "Pre-orders let fans save your track before it drops — they get notified the moment it's live.",
  "Set a Tip Goal on your profile — fans can see what you're saving toward and contribute.",
  "Post a Thought of the Day — up to 3 times daily. Takes 10 seconds, keeps you in feeds.",
];

exports.handler = async () => {
  if (!PLATFORM_ARTIST_ID) {
    console.log('[platform-daily-story] PLATFORM_ARTIST_ID not set — skipping');
    return { statusCode: 200, body: 'skipped' };
  }

  try {
    // Gather platform stats
    const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString();

    const [
      { count: totalArtists },
      { count: newTracksWeek },
      { data: streamData },
      { data: competitions },
    ] = await Promise.all([
      supabase.from('artists').select('*', { count: 'exact', head: true }),
      supabase.from('tracks').select('*', { count: 'exact', head: true }).eq('is_published', true).gte('created_at', weekAgo),
      supabase.from('tracks').select('stream_count').eq('is_published', true).limit(1000),
      supabase.from('competitions').select('id, title, status').in('status', ['open', 'voting']).order('created_at', { ascending: false }).limit(1),
    ]);

    const totalStreams = (streamData || []).reduce((s, t) => s + (t.stream_count || 0), 0);

    // Trending track this week
    const { data: trendingData } = await supabase
      .from('tracks').select('title, artists(artist_name), stream_count')
      .eq('is_published', true).order('stream_count', { ascending: false }).limit(1).maybeSingle();
    const trendingTrack = trendingData ? `${trendingData.title} — ${trendingData.artists?.artist_name}` : null;

    // Rotating lesson tip by day of year
    const dayOfYear = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0)) / 86400000);
    const lessonTip = LESSON_TIPS[dayOfYear % LESSON_TIPS.length];

    // Generate canvas image
    const pngBuffer = drawStoryCard({
      totalArtists,
      newTracksWeek,
      totalStreams,
      trendingTrack,
      competition: competitions?.[0] || null,
      lessonTip,
    });

    // Upload to Supabase storage
    const filename = `platform-story-${new Date().toISOString().slice(0,10)}.png`;
    const path     = `platform/${filename}`;
    const { error: upErr } = await supabase.storage.from('stories').upload(path, pngBuffer, {
      contentType: 'image/png', upsert: true,
    });
    if (upErr) throw upErr;

    const { data: { publicUrl } } = supabase.storage.from('stories').getPublicUrl(path);

    // Delete yesterday's platform story first
    await supabase.from('artist_stories')
      .delete()
      .eq('artist_id', PLATFORM_ARTIST_ID)
      .lt('created_at', new Date(Date.now() - 23 * 3600000).toISOString());

    // Insert new story — expires in 24h
    await supabase.from('artist_stories').insert({
      artist_id:  PLATFORM_ARTIST_ID,
      media_url:  publicUrl,
      media_type: 'image',
      caption:    `Feelz Machine · ${new Date().toLocaleDateString('en-ZA', { day: 'numeric', month: 'short' })}`,
      expires_at: new Date(Date.now() + 24 * 3600000).toISOString(),
    });

    console.log(`[platform-daily-story] Done — ${publicUrl}`);
    return { statusCode: 200, body: JSON.stringify({ ok: true, url: publicUrl }) };
  } catch (err) {
    console.error('[platform-daily-story]', err.message);
    return { statusCode: 500, body: err.message };
  }
};
