/**
 * netlify/functions/feature-education-drip.js
 *
 * Scheduled: Wednesday 10:00 UTC (weekly)
 * Sends artists a rotating tip about a platform feature they may not be using.
 * Each artist gets a different tip each week, cycling through the full list.
 * Never sends the same tip twice to the same artist.
 *
 * Tips cover: competitions, collab roulette, paid collabs, stories, voice memos,
 * thoughts, live sessions, profile completion, analytics, @username links, etc.
 */

const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// ── Feature tips library ──────────────────────────────────────
// Each tip has: id (stable), title, body, url, for (artist|listener|all)
const ARTIST_TIPS = [
  {
    id: 'competitions_enter',
    title: '🎲 Collab Roulette — win 3 months Pro',
    body: 'Every Sunday a random prompt drops. Make a track, fans vote, winner gets Pro or Premium free. Go to Competitions to see this week\'s challenge.',
    url: '/competitions',
  },
  {
    id: 'paid_collab',
    title: '💰 Paid Collaborations = $50 USD',
    body: 'Once a month a commission drops — stems provided, you complete the missing piece. Fans vote, winner gets paid $50 directly to PayPal.',
    url: '/competitions',
  },
  {
    id: 'stories',
    title: '📸 Post a Story today',
    body: 'Stories show up on your profile and the home feed for 24 hours. A quick clip, a teaser, a behind-the-scenes moment — anything keeps you visible.',
    url: '/profile',
  },
  {
    id: 'voice_memo',
    title: '🎙️ Voice Memos build loyalty',
    body: 'A 30-second voice note to your fans beats a text post every time. Record one from your dashboard — it lives on your profile for fans to replay.',
    url: '/dashboard?tab=memos',
  },
  {
    id: 'thought_of_day',
    title: '💭 Thought of the Day = free engagement',
    body: 'Post up to 3 thoughts a day from your profile. Fans can react and comment. Takes 10 seconds and keeps your name in people\'s feeds.',
    url: '/profile',
  },
  {
    id: 'go_live',
    title: '🔴 Go Live — fans get notified instantly',
    body: 'Start a live session from your profile and every follower gets a push notification. Audio queue or YouTube stream — your choice.',
    url: '/profile',
  },
  {
    id: 'collab_system',
    title: '🤝 Collabs credit both profiles',
    body: 'When you tag a collab on a track, it shows up on both your profiles and credits both artists in streams and downloads. Use it.',
    url: '/dashboard?tab=collabs',
  },
  {
    id: 'analytics',
    title: '📊 Your analytics are live',
    body: 'Dashboard → Analytics shows streams, downloads, followers and your top tracks. Pro unlocks more. Check it — knowing what lands helps you make more of it.',
    url: '/dashboard',
  },
  {
    id: 'username_url',
    title: '🔗 Your @link is shareable anywhere',
    body: 'Your profile is now at feelzmachine.com/@your-slug. Put it in your Instagram bio, TikTok, WhatsApp. Anyone who taps it lands directly on your music.',
    url: '/profile',
  },
  {
    id: 'download_price',
    title: '💸 Let fans pay for your music',
    body: 'Set a download price on any track — 100% goes to you, zero platform cut. Pro unlocks up to 2 paid tracks/month. Premium is unlimited.',
    url: '/dashboard?tab=upload',
  },
  {
    id: 'tip_goal',
    title: '🎯 Set a Tip Goal on your profile',
    body: 'Add a tip goal — fans can see what you\'re saving toward and contribute directly. Equipment, studio time, whatever the goal is. Real support.',
    url: '/profile',
  },
  {
    id: 'pre_order',
    title: '⏳ Pre-orders build anticipation',
    body: 'Set a future release date on a track and fans can pre-save it. They get notified the moment it drops. Premium feature — great for album campaigns.',
    url: '/dashboard?tab=upload',
  },
  {
    id: 'genre_mood',
    title: '🎛️ Set your genre and mood',
    body: 'Artists without genre and mood set don\'t appear in Collab Radar or recommendations. It takes 30 seconds in your profile Edit tab.',
    url: '/profile',
  },
  {
    id: 'paypal_email',
    title: '📧 Add your PayPal email',
    body: 'Competition prizes and download sales need a PayPal email to reach you. Add it in Profile → Edit so you never miss a payout.',
    url: '/profile',
  },
  {
    id: 'stem_pack_collab',
    title: '🎵 Upload stems with your tracks',
    body: 'Attach a stem pack download link when uploading. Producers and vocalists who want to work with your sound will find you faster.',
    url: '/dashboard?tab=upload',
  },
];

const LISTENER_TIPS = [
  {
    id: 'vote_competitions',
    title: '🗳️ Your vote picks the winner',
    body: 'Competitions are decided by fans, not labels. Go to Competitions, listen to the entries and cast your votes. You have 2 votes each round.',
    url: '/competitions',
  },
  {
    id: 'follow_artists',
    title: '🔔 Follow artists for instant drops',
    body: 'Every time an artist you follow drops new music, you get notified. No algorithm hiding it. Just straight to you.',
    url: '/browse',
  },
  {
    id: 'download_support',
    title: '💚 Downloads go 100% to the artist',
    body: 'When you pay for a download on Feelz Machine, every cent goes to the artist. Zero platform cut. That\'s the whole point.',
    url: '/browse',
  },
  {
    id: 'streak',
    title: '🔥 Keep your streak going',
    body: 'Listen to music every day to build your streak. Hit milestones and unlock recognition. Check your Hub to see where you\'re at.',
    url: '/hub',
  },
  {
    id: 'guestbook',
    title: '📝 Leave a comment on an artist page',
    body: 'The Guestbook on every artist\'s Community page is direct feedback. Artists read it. If a track hit, say so.',
    url: '/',
  },
];

// ── Main handler ──────────────────────────────────────────────
exports.handler = async (event) => {
  const isManual = event.httpMethod === 'POST';
  const siteUrl  = process.env.URL || 'https://www.feelzmachine.com';

  try {
    // Get all artists and listeners
    const [{ data: artists }, { data: listeners }] = await Promise.all([
      supabase.from('artists').select('id, user_id, artist_name').not('user_id', 'is', null),
      supabase.from('listeners').select('user_id').not('user_id', 'is', null),
    ]);

    // For each user, find which tips they've already seen
    const allUserIds = [
      ...(artists || []).map(a => a.user_id),
      ...(listeners || []).map(l => l.user_id),
    ].filter(Boolean);

    if (!allUserIds.length) return { statusCode: 200, body: JSON.stringify({ sent: 0 }) };

    // Fetch already-sent education tips
    const { data: sentTips } = await supabase
      .from('engagement_messages')
      .select('user_id, message_type')
      .in('user_id', allUserIds)
      .like('message_type', 'edu_%');

    const sentMap = {};
    (sentTips || []).forEach(r => {
      if (!sentMap[r.user_id]) sentMap[r.user_id] = new Set();
      sentMap[r.user_id].add(r.message_type.replace('edu_', ''));
    });

    let totalSent = 0;
    const notifBatch = [];
    const msgBatch   = [];

    // Artists
    for (const artist of (artists || [])) {
      if (!artist.user_id) continue;
      const seen = sentMap[artist.user_id] || new Set();
      const unseen = ARTIST_TIPS.filter(t => !seen.has(t.id));
      if (!unseen.length) continue; // seen all tips — skip

      // Pick the next unseen tip (rotate through list order)
      const tip = unseen[0];

      notifBatch.push({
        user_id:  artist.user_id,
        artist_id: artist.id,
        type:     'engagement',
        title:    tip.title,
        message:  tip.body,
        metadata: { tip_id: tip.id, feature_education: true, url: tip.url },
      });
      msgBatch.push({
        user_id:      artist.user_id,
        artist_id:    artist.id,
        segment:      'artist_education',
        message_type: `edu_${tip.id}`,
        title:        tip.title,
        body:         tip.body,
      });
    }

    // Listeners
    for (const listener of (listeners || [])) {
      if (!listener.user_id) continue;
      const seen = sentMap[listener.user_id] || new Set();
      const unseen = LISTENER_TIPS.filter(t => !seen.has(t.id));
      if (!unseen.length) continue;

      const tip = unseen[0];
      notifBatch.push({
        user_id:  listener.user_id,
        type:     'engagement',
        title:    tip.title,
        message:  tip.body,
        metadata: { tip_id: tip.id, feature_education: true, url: tip.url },
      });
      msgBatch.push({
        user_id:      listener.user_id,
        segment:      'listener_education',
        message_type: `edu_${tip.id}`,
        title:        tip.title,
        body:         tip.body,
      });
    }

    // Insert in batches of 100
    for (let i = 0; i < notifBatch.length; i += 100) {
      const { error } = await supabase.from('notifications').insert(notifBatch.slice(i, i + 100));
      if (!error) totalSent += Math.min(100, notifBatch.length - i);
      else console.error('Notif batch error:', JSON.stringify(error));
    }
    for (let i = 0; i < msgBatch.length; i += 100) {
      await supabase.from('engagement_messages').insert(msgBatch.slice(i, i + 100)).catch(() => {});
    }

    // Push notifications
    const pushUserIds = notifBatch.map(n => n.user_id).slice(0, 2000);
    if (pushUserIds.length) {
      await fetch(`${siteUrl}/.netlify/functions/send-push`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-internal-secret': process.env.INTERNAL_FUNCTION_SECRET || '' },
        body: JSON.stringify({
          user_ids: pushUserIds,
          title:    notifBatch[0]?.title || 'New tip from Feelz Machine',
          body:     'Open the app to see this week\'s feature tip',
          url:      '/',
          tag:      `edu-tip-${new Date().toISOString().slice(0, 10)}`,
        }),
      }).catch(() => {});
    }

    console.log(`[feature-education-drip] Sent ${totalSent} tips`);
    return { statusCode: 200, body: JSON.stringify({ success: true, sent: totalSent }) };

  } catch (err) {
    console.error('[feature-education-drip] Error:', err.message);
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};