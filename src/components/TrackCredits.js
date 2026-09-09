/**
 * TrackCredits.js
 *
 * "ft. ArtistName, prod. AnotherArtist" inline, and the full Credits block on
 * track pages.
 *
 *
 * WHY THIS NO LONGER USES A POSTGREST EMBED
 *
 * Both components used to read credits like this:
 *
 *   supabase.from('collaborations')
 *     .select('role, artist:artists(id, artist_name, slug)')
 *
 * A `collaborations` row joins two artists by nature — the owner and the
 * collaborator — so that table can carry more than one foreign key to
 * `artists`. When it does, PostgREST cannot decide which one the embed means
 * and answers HTTP 300 (PGRST201) instead of rows. That is the exact fault that
 * took For You and Browse down, in a different table.
 *
 * And it was invisible here, twice over. The query destructured only `data`, so
 * the error was never read; and both components render `null` when
 * `credits.length === 0`, so "the query failed" and "this track has no
 * collaborators" looked identical on screen. A track could have four credited
 * artists and show none of them, for months, with nothing in the console.
 *
 * Rather than add an FK hint — which fixes it only until someone adds another
 * relationship, and which needs the constraint's exact name — this reads the
 * two tables separately and joins them in JavaScript. Two round trips instead
 * of one, on a query that runs once per track page, in exchange for a query
 * that cannot be broken by a schema change. Credits are a legal and financial
 * attribution; they are the wrong place to be clever.
 *
 * The same rewrite is applied to TrackPage.js, TrackUploadPanel.js and
 * netlify/functions/process-split-payout.js, which used the same embed to
 * decide who gets paid.
 */

import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { useNavigate } from 'react-router-dom';
import { Users, AlertTriangle } from 'lucide-react';

const ROLE_LABELS = {
  featured: 'ft.',
  performing_artist: 'perf.',
  producer: 'prod.',
  co_producer: 'co-prod.',
  songwriter: 'written by',
  lyricist: 'lyrics',
  vocalist: 'vocals',
  musician: 'music',
  arranger: 'arr.',
  remix: 'remix',
  engineer: 'mix',
  mastering: 'master',
  recording: 'rec.',
  director: 'A&R',
};

/**
 * Accepted credits for a track, with each row's artist attached as `artist`.
 *
 * Returns { credits, error }. `error` is non-null only when something actually
 * failed — an empty `credits` array with a null `error` means the track has no
 * collaborators, which is the common case and not a problem.
 *
 * Exported because TrackPage and TrackUploadPanel need the same data and used
 * to each carry their own copy of the broken embed.
 *
 * @param trackId
 * @param orderBy 'split_percent' (descending) or 'role' (alphabetical)
 */
export async function fetchTrackCredits(trackId, orderBy = 'split_percent') {
  if (!trackId) return { credits: [], error: null };

  const rows = supabase
    .from('collaborations')
    .select('id, role, split_percent, artist_id')
    .eq('track_id', trackId)
    .eq('status', 'accepted');

  const { data: collabs, error: collabErr } = orderBy === 'role'
    ? await rows.order('role')
    : await rows.order('split_percent', { ascending: false });

  if (collabErr) {
    console.error(
      '[credits] collaborations query failed:',
      collabErr.code, collabErr.message, collabErr.details || '', collabErr.hint || ''
    );
    return { credits: [], error: collabErr };
  }
  if (!collabs || collabs.length === 0) return { credits: [], error: null };

  const artistIds = [...new Set(collabs.map(c => c.artist_id).filter(Boolean))];
  if (artistIds.length === 0) {
    // Rows exist but none names an artist. Not an error, but not renderable
    // either, so say so rather than showing blank names.
    console.warn(`[credits] ${collabs.length} collaboration row(s) on track ${trackId} have no artist_id`);
    return { credits: [], error: null };
  }

  const { data: artists, error: artistErr } = await supabase
    .from('artists')
    .select('id, artist_name, slug, profile_image_url')
    .in('id', artistIds);

  if (artistErr) {
    console.error(
      '[credits] artists lookup failed:',
      artistErr.code, artistErr.message, artistErr.details || '', artistErr.hint || ''
    );
    return { credits: [], error: artistErr };
  }

  const byId = new Map((artists || []).map(a => [a.id, a]));

  // A credit whose artist is missing from the lookup — deleted account, or an
  // RLS policy hiding the row — is dropped rather than rendered nameless.
  const credits = collabs
    .map(c => ({ ...c, artist: byId.get(c.artist_id) || null }))
    .filter(c => c.artist);

  const dropped = collabs.length - credits.length;
  if (dropped > 0) {
    console.warn(`[credits] ${dropped} credit(s) on track ${trackId} reference an artist that could not be read`);
  }

  return { credits, error: null };
}

// Inline credits — e.g. "ft. ArtistName, prod. AnotherArtist"
export function TrackCreditsInline({ trackId }) {
  const [credits, setCredits] = useState([]);

  useEffect(() => {
    let live = true;
    fetchTrackCredits(trackId, 'role').then(({ credits: c }) => {
      if (live) setCredits(c);
    });
    return () => { live = false; };
  }, [trackId]);

  if (credits.length === 0) return null;

  return (
    <span className="text-white/40 text-xs">
      {credits.map((c, i) => (
        <span key={c.id || i}>
          {i > 0 && ', '}
          {ROLE_LABELS[c.role] || ''} {c.artist?.artist_name}
        </span>
      ))}
    </span>
  );
}

// Full credits block — for track detail pages
export default function TrackCredits({ trackId }) {
  const navigate = useNavigate();
  const [credits, setCredits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed]   = useState(false);

  useEffect(() => {
    if (!trackId) { setLoading(false); return; }
    let live = true;
    setLoading(true);
    setFailed(false);
    fetchTrackCredits(trackId, 'split_percent').then(({ credits: c, error }) => {
      if (!live) return;
      setCredits(c);
      setFailed(!!error);
      setLoading(false);
    });
    return () => { live = false; };
  }, [trackId]);

  if (loading) return null;

  // A failure is shown rather than swallowed. Credits are attribution — a
  // featured artist silently absent from their own track is worse than a line
  // admitting the list could not be read.
  if (failed) {
    return (
      <div className="bg-white/[0.03] rounded-xl p-4 border border-white/[0.06]">
        <div className="flex items-center space-x-2">
          <AlertTriangle className="w-4 h-4 text-yellow-400/70" />
          <p className="text-xs text-white/40">Credits couldn't be loaded.</p>
        </div>
      </div>
    );
  }

  if (credits.length === 0) return null;

  return (
    <div className="bg-white/[0.03] rounded-xl p-4 border border-white/[0.06]">
      <div className="flex items-center space-x-2 mb-3">
        <Users className="w-4 h-4 text-white/40" />
        <h4 className="text-sm font-semibold text-white">Credits</h4>
      </div>
      <div className="space-y-2">
        {credits.map((c, i) => (
          <button
            key={c.id || i}
            onClick={() => c.artist?.slug && navigate(`/artist/${c.artist.slug}`)}
            className="w-full flex items-center space-x-3 p-2 rounded-lg hover:bg-white/[0.04] transition text-left"
          >
            {c.artist?.profile_image_url ? (
              <img src={c.artist.profile_image_url} alt="" className="w-8 h-8 rounded-full object-cover" />
            ) : (
              <div className="w-8 h-8 rounded-full bg-white/[0.08] flex items-center justify-center">
                <span className="text-xs font-bold text-white/30">
                  {c.artist?.artist_name?.charAt(0)?.toUpperCase()}
                </span>
              </div>
            )}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-white truncate">{c.artist?.artist_name}</p>
              <p className="text-[10px] text-white/30 uppercase tracking-wider">
                {ROLE_LABELS[c.role] || c.role}
              </p>
            </div>
            {c.split_percent > 0 && (
              <span className="text-[10px] text-white/20 font-mono">{c.split_percent}%</span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}