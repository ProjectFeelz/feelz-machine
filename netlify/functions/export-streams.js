// netlify/functions/export-streams.js
// Exports detailed stream data for a specific track or all tracks.
// Returns enriched CSV: date, time, track, listener name, device, source,
// completed, duration_played, is_follower, repeat_listener

const { createClient } = require('@supabase/supabase-js');

function escapeCSV(val) {
  if (val === null || val === undefined) return '';
  const str = String(val);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function buildRow(cols, row) {
  return cols.map(c => escapeCSV(row[c])).join(',');
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  let body;
  try { body = JSON.parse(event.body); }
  catch { return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON' }) }; }

  const { artist_id, user_id, track_id, days = 30, export_type = 'streams' } = body;

  if (!artist_id || !user_id) {
    return { statusCode: 400, body: JSON.stringify({ error: 'artist_id and user_id required' }) };
  }

  // Verify ownership
  const { data: artist, error: artistErr } = await supabase
    .from('artists').select('id, artist_name, tier')
    .eq('id', artist_id).eq('user_id', user_id).maybeSingle();
  if (artistErr || !artist) {
    return { statusCode: 403, body: JSON.stringify({ error: 'Unauthorized' }) };
  }

  const since = new Date(Date.now() - days * 86400000).toISOString();

  try {
    // ── STREAMS EXPORT ──────────────────────────────────────────────────────
    if (export_type === 'streams') {
      // Get all track IDs for this artist (or just the one)
      let trackIds = [];
      let trackMap = {}; // id → title
      if (track_id) {
        const { data: t } = await supabase.from('tracks')
          .select('id, title').eq('id', track_id).eq('artist_id', artist_id).maybeSingle();
        if (t) { trackIds = [t.id]; trackMap[t.id] = t.title; }
      } else {
        const { data: tracks } = await supabase.from('tracks')
          .select('id, title').eq('artist_id', artist_id);
        (tracks || []).forEach(t => { trackIds.push(t.id); trackMap[t.id] = t.title; });
      }

      if (!trackIds.length) {
        return { statusCode: 200, body: JSON.stringify({ csv: '', count: 0, truncated: false }) };
      }

      // Pull streams with full detail (up to 10k rows)
      const { data: streams } = await supabase
        .from('streams')
        .select('id, track_id, user_id, created_at, device_type, source, completed, duration_played, platform')
        .in('track_id', trackIds)
        .gte('created_at', since)
        .order('created_at', { ascending: false })
        .limit(10000);

      const rows = streams || [];
      const truncated = rows.length === 10000;

      // Get listener names from user_profiles and artists
      const listenerIds = [...new Set(rows.map(r => r.user_id).filter(Boolean))];
      const nameMap = {};
      if (listenerIds.length) {
        const [{ data: profiles }, { data: artistProfiles }] = await Promise.all([
          supabase.from('user_profiles').select('user_id, name').in('user_id', listenerIds),
          supabase.from('artists').select('user_id, artist_name').in('user_id', listenerIds),
        ]);
        (profiles || []).forEach(p => { if (p.name) nameMap[p.user_id] = p.name; });
        (artistProfiles || []).forEach(a => { if (!nameMap[a.user_id]) nameMap[a.user_id] = a.artist_name; });
      }

      // Get followers set for this artist
      const { data: followRows } = await supabase
        .from('follows').select('follower_id').eq('artist_id', artist_id);
      const followerSet = new Set((followRows || []).map(f => f.follower_id));

      // Build repeat listener set (user_id seen more than once)
      const userStreamCount = {};
      rows.forEach(r => {
        if (r.user_id) userStreamCount[r.user_id] = (userStreamCount[r.user_id] || 0) + 1;
      });

      const COLS = [
        'date', 'time', 'track_title', 'listener_name', 'device',
        'source', 'platform', 'completed', 'duration_seconds',
        'is_follower', 'repeat_listener', 'stream_id',
      ];

      const csvRows = rows.map(r => {
        const d = new Date(r.created_at);
        return {
          date:            d.toISOString().split('T')[0],
          time:            d.toTimeString().split(' ')[0],
          track_title:     trackMap[r.track_id] || r.track_id,
          listener_name:   nameMap[r.user_id] || (r.user_id ? 'Anonymous' : 'Guest'),
          device:          r.device_type || 'unknown',
          source:          (r.source || 'unknown').replace(/_/g, ' '),
          platform:        r.platform || 'web',
          completed:       r.completed ? 'yes' : 'no',
          duration_seconds: r.duration_played || 0,
          is_follower:     followerSet.has(r.user_id) ? 'yes' : 'no',
          repeat_listener: (userStreamCount[r.user_id] || 0) > 1 ? 'yes' : 'no',
          stream_id:       r.id,
        };
      });

      const header = COLS.join(',');
      const csv = [header, ...csvRows.map(r => buildRow(COLS, r))].join('\n');
      const filename = track_id
        ? `${trackMap[track_id] || 'track'}_streams_${days}d.csv`.replace(/[^a-z0-9_.\-]/gi, '_')
        : `${artist.artist_name}_all_streams_${days}d.csv`.replace(/[^a-z0-9_.\-]/gi, '_');

      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ csv, count: rows.length, truncated, filename }),
      };
    }

    // ── FOLLOWERS EXPORT ─────────────────────────────────────────────────────
    if (export_type === 'followers') {
      const { data: follows } = await supabase
        .from('follows').select('follower_id, created_at').eq('artist_id', artist_id)
        .order('created_at', { ascending: false });

      if (!follows?.length) {
        return { statusCode: 200, body: JSON.stringify({ csv: '', count: 0, truncated: false }) };
      }

      const followerIds = follows.map(f => f.follower_id);
      const followDateMap = {};
      follows.forEach(f => { followDateMap[f.follower_id] = f.created_at; });

      // Get auth emails via service role
      const { data: authData } = await supabase.auth.admin.listUsers({ perPage: 1000 });
      const emailMap = {};
      (authData?.users || []).forEach(u => { emailMap[u.id] = u.email || ''; });

      // Get display names
      const [{ data: profiles }, { data: artistProfiles }] = await Promise.all([
        supabase.from('user_profiles').select('user_id, name, genre_preferences').in('user_id', followerIds),
        supabase.from('artists').select('user_id, artist_name, genre, role').in('user_id', followerIds),
      ]);
      const profileMap = {};
      (profiles || []).forEach(p => { profileMap[p.user_id] = p; });
      const artistMap = {};
      (artistProfiles || []).forEach(a => { artistMap[a.user_id] = a; });

      // Stream counts per follower for this artist's tracks
      const { data: trackRows } = await supabase
        .from('tracks').select('id').eq('artist_id', artist_id);
      const artistTrackIds = (trackRows || []).map(t => t.id);

      let streamCountMap = {};
      if (artistTrackIds.length) {
        const { data: streamData } = await supabase
          .from('streams').select('user_id').in('track_id', artistTrackIds)
          .in('user_id', followerIds);
        (streamData || []).forEach(s => {
          streamCountMap[s.user_id] = (streamCountMap[s.user_id] || 0) + 1;
        });
      }

      const COLS = [
        'name', 'email', 'follower_type', 'followed_date',
        'genre_preferences', 'streams_of_your_music', 'user_id',
      ];

      const csvRows = followerIds
        .filter(id => emailMap[id])
        .map(id => {
          const prof = profileMap[id];
          const art  = artistMap[id];
          const name = art?.artist_name || prof?.name || '';
          const genres = art?.genre
            ? art.genre
            : (prof?.genre_preferences || []).join('; ');
          return {
            name,
            email:                emailMap[id],
            follower_type:        art ? (art.role === 'beatmaker' ? 'beatmaker' : 'artist') : 'listener',
            followed_date:        followDateMap[id]?.split('T')[0] || '',
            genre_preferences:    genres,
            streams_of_your_music: streamCountMap[id] || 0,
            user_id:              id,
          };
        });

      const header = COLS.join(',');
      const csv = [header, ...csvRows.map(r => buildRow(COLS, r))].join('\n');
      const filename = `${artist.artist_name}_followers.csv`.replace(/[^a-z0-9_.\-]/gi, '_');

      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ csv, count: csvRows.length, truncated: false, filename }),
      };
    }

    // ── EARNINGS EXPORT ──────────────────────────────────────────────────────
    if (export_type === 'earnings') {
      const [{ data: tips }, { data: downloads }, { data: beatPurchases }] = await Promise.all([
        supabase.from('tips')
          .select('id, amount, currency, message, created_at, from_user_id')
          .eq('artist_id', artist_id)
          .gte('created_at', since)
          .order('created_at', { ascending: false }),
        supabase.from('downloads')
          .select('id, amount_paid, created_at, track_id, user_id, tracks(title)')
          .gt('amount_paid', 0)
          .gte('created_at', since)
          .order('created_at', { ascending: false }),
        supabase.from('beat_purchases')
          .select('id, amount_paid, licence_type, created_at, buyer_user_id, tracks(title, artist_id)')
          .gte('created_at', since)
          .eq('status', 'completed')
          .order('created_at', { ascending: false }),
      ]);

      // Filter downloads and beat_purchases to this artist
      const { data: artistTracks } = await supabase
        .from('tracks').select('id').eq('artist_id', artist_id);
      const ownTrackIds = new Set((artistTracks || []).map(t => t.id));

      const filteredDownloads = (downloads || []).filter(d => ownTrackIds.has(d.track_id));
      const filteredBeats     = (beatPurchases || []).filter(b => ownTrackIds.has(b.track_id));

      // Build combined earnings rows
      const rows = [
        ...(tips || []).map(t => ({
          date:        t.created_at?.split('T')[0],
          type:        'tip',
          track:       '',
          amount_usd:  Number(t.amount || 0).toFixed(2),
          currency:    t.currency || 'USD',
          message:     t.message || '',
          licence:     '',
          transaction_id: t.id,
        })),
        ...filteredDownloads.map(d => ({
          date:        d.created_at?.split('T')[0],
          type:        'paid_download',
          track:       d.tracks?.title || '',
          amount_usd:  Number(d.amount_paid || 0).toFixed(2),
          currency:    'USD',
          message:     '',
          licence:     '',
          transaction_id: d.id,
        })),
        ...filteredBeats.map(b => ({
          date:        b.created_at?.split('T')[0],
          type:        'beat_purchase',
          track:       b.tracks?.title || '',
          amount_usd:  Number(b.amount_paid || 0).toFixed(2),
          currency:    'USD',
          message:     '',
          licence:     b.licence_type || '',
          transaction_id: b.id,
        })),
      ].sort((a, b) => b.date.localeCompare(a.date));

      const COLS = ['date', 'type', 'track', 'amount_usd', 'currency', 'licence', 'message', 'transaction_id'];
      const header = COLS.join(',');
      const csv = [header, ...rows.map(r => buildRow(COLS, r))].join('\n');
      const total = rows.reduce((s, r) => s + parseFloat(r.amount_usd || 0), 0);
      const filename = `${artist.artist_name}_earnings_${days}d.csv`.replace(/[^a-z0-9_.\-]/gi, '_');

      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ csv, count: rows.length, total: total.toFixed(2), truncated: false, filename }),
      };
    }

    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid export_type' }) };

  } catch (err) {
    console.error('Export error:', err);
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
