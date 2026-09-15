/**
 * CollaborationsSpotlight
 *
 * Collaborations used to be visible in exactly one place: a rail at the
 * bottom of an artist's own profile. That means the only way to find out two
 * artists on this platform made something together was to already know one of
 * them and scroll far enough. For a platform whose pitch is that artists work
 * WITH each other, that is the story being told in the quietest possible
 * voice.
 *
 * This surfaces the same data twice more:
 *
 *   CollabRail — a horizontal rail for Home, same mechanics as the other
 *                Home rails so it reads as part of the page rather than a
 *                bolt-on.
 *   CollabGrid — a full tab for Browse, where somebody who wants to dig
 *                actually can.
 *
 * Both share one loader, so the definition of "a collaboration" lives in one
 * place and cannot drift between the two surfaces.
 *
 * ── The embed names are not optional ──────────────────────────────────────
 * `collaborations` has TWO foreign keys to `artists`:
 *   collaborations_artist_id_fkey     (the collaborator)
 *   collaborations_invited_by_fkey    (who invited them)
 * A bare `artists(...)` embed is therefore ambiguous and PostgREST answers
 * PGRST201 as HTTP 300 — the same failure that emptied For You and Browse on
 * 2026-09-08. Every embed below is named.
 */

import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { usePlayer } from '../contexts/PlayerContext';
import { Music, Play, Info, Users } from 'lucide-react';

// One definition of the query, used by both surfaces.
const COLLAB_SELECT = [
  'id, role, track_id, created_at',
  'artists!collaborations_artist_id_fkey(id, artist_name, slug)',
  'tracks!inner(id, title, slug, cover_artwork_url, file_url, duration, stream_count, artist_id, is_published, is_downloadable, download_price, genre, artists!tracks_artist_id_fkey(id, artist_name, slug))',
].join(', ');

export function useCollaborations(limit = 24) {
  const [rows, setRows]       = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from('collaborations')
        .select(COLLAB_SELECT)
        .eq('status', 'accepted')
        .eq('tracks.is_published', true)
        .limit(200);

      // Read the error rather than discard it. A failed query and an artist
      // roster with no collaborations both produce an empty list, and only
      // one of them is worth knowing about.
      if (error) {
        console.error('[collabs] load failed:', error.code, error.message, error.details || '', error.hint || '');
        if (!cancelled) { setRows([]); setLoading(false); }
        return;
      }

      // One card per TRACK, not per collaboration row. A track with three
      // guests has three rows; showing it three times would fill the rail
      // with one song. The guests are merged onto the single card instead,
      // which is also the more interesting fact — "these four made this".
      const byTrack = new Map();
      (data || []).forEach(r => {
        if (!r.tracks) return;
        const key = r.tracks.id;
        if (!byTrack.has(key)) {
          byTrack.set(key, {
            track: r.tracks,
            owner: r.tracks.artists || null,
            guests: [],
          });
        }
        const entry = byTrack.get(key);
        // A collaborator row pointing back at the track's own owner is not a
        // guest; without this the owner is credited as featuring on their own
        // song, which is the bug that made "Collaborations" read wrong on the
        // artist profile.
        if (r.artists && r.artists.id !== r.tracks.artist_id
            && !entry.guests.some(g => g.id === r.artists.id)) {
          entry.guests.push({ ...r.artists, role: r.role });
        }
      });

      const list = Array.from(byTrack.values())
        .filter(e => e.guests.length > 0)
        .sort((a, b) => (b.track.stream_count || 0) - (a.track.stream_count || 0))
        .slice(0, limit);

      if (!cancelled) { setRows(list); setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [limit]);

  return { rows, loading };
}

// The people on the record, as one line. Owner first, then guests, because
// that is the order a credit is read in.
function creditLine(entry) {
  const names = [entry.owner?.artist_name, ...entry.guests.map(g => g.artist_name)]
    .filter(Boolean);
  if (names.length <= 1) return names[0] || '';
  return `${names[0]} × ${names.slice(1).join(' × ')}`;
}

function CollabCard({ entry, width = 'w-40', onPlay }) {
  const navigate = useNavigate();
  const t = entry.track;
  const trackPath = t.slug ? `/track/${t.slug}` : null;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onPlay(entry)}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onPlay(entry); } }}
      className={`flex-shrink-0 ${width} text-left cursor-pointer group`}
    >
      <div className="relative aspect-square rounded-2xl overflow-hidden mb-2 bg-white/[0.04]"
           style={{ boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.07)' }}>
        {t.cover_artwork_url
          ? <img src={t.cover_artwork_url} alt={t.title || ''} className="w-full h-full object-cover" loading="lazy" />
          : <div className="w-full h-full flex items-center justify-center"><Music className="w-8 h-8 text-white/15" /></div>}

        {/* How many people are on it — the fact the section exists to show. */}
        <span className="absolute bottom-1.5 left-1.5 flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold text-white"
              style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)' }}>
          <Users className="w-2.5 h-2.5" />
          {entry.guests.length + 1}
        </span>

        <div className="absolute inset-0 flex items-center justify-center bg-black/35 opacity-0 group-hover:opacity-100 transition-opacity">
          <Play className="w-7 h-7 text-white" fill="white" />
        </div>
      </div>

      <div className="flex items-center gap-1.5 min-w-0">
        <p className="text-sm font-medium text-white truncate flex-1 min-w-0">{t.title}</p>
        {trackPath && (
          <button
            onClick={e => { e.stopPropagation(); navigate(trackPath); }}
            title="Full credits"
            aria-label={`Credits for ${t.title || 'this track'}`}
            className="flex-shrink-0 w-6 h-6 flex items-center justify-center rounded-full transition hover:bg-white/10 active:scale-90"
          >
            <Info className="w-3.5 h-3.5 text-white/35" strokeWidth={2} />
          </button>
        )}
      </div>
      <p className="text-xs text-white/35 truncate">{creditLine(entry)}</p>
    </div>
  );
}

// Shape a row for the player, which expects artist_name/artist_slug flattened
// onto the track the way every other surface passes them.
function forPlayer(entry) {
  return {
    ...entry.track,
    artist_name: entry.owner?.artist_name || 'Unknown artist',
    artist_slug: entry.owner?.slug || null,
  };
}

export function CollabRail({ limit = 12 }) {
  const { rows, loading } = useCollaborations(limit);
  const { playTrack } = usePlayer();

  // Renders nothing at all rather than an empty shell — a heading over a
  // blank strip is worse than no heading.
  if (loading || rows.length === 0) return null;

  const queue = rows.map(forPlayer);

  return (
    <div className="mb-6">
      <div className="flex items-center justify-between mb-3 px-6">
        <div className="flex items-center space-x-2">
          <Users className="w-3.5 h-3.5 text-white/40" />
          <span className="section-label">Best Collaborations</span>
        </div>
      </div>
      <div className="flex space-x-3 overflow-x-auto px-6 scrollbar-hide"
           style={{ WebkitOverflowScrolling: 'touch' }}>
        {rows.map((entry, i) => (
          <CollabCard key={entry.track.id} entry={entry}
            onPlay={() => playTrack(queue[i], queue)} />
        ))}
      </div>
    </div>
  );
}

export function CollabGrid({ limit = 48 }) {
  const { rows, loading } = useCollaborations(limit);
  const { playTrack } = usePlayer();

  if (loading) {
    return <p className="text-sm text-white/25 text-center py-10">Loading collaborations…</p>;
  }
  if (rows.length === 0) {
    return (
      <div className="text-center py-12">
        <Users className="w-10 h-10 mx-auto mb-3 text-white/10" />
        <p className="text-sm text-white/35">No collaborations yet</p>
        <p className="text-xs text-white/20 mt-1">When artists feature on each other's tracks, they show up here.</p>
      </div>
    );
  }

  const queue = rows.map(forPlayer);

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
      {rows.map((entry, i) => (
        <CollabCard key={entry.track.id} entry={entry} width="w-full"
          onPlay={() => playTrack(queue[i], queue)} />
      ))}
    </div>
  );
}

export default CollabRail;