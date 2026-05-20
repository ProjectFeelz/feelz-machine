/**
 * ForYouPage.js
 *
 * Personalised music feed at /for-you.
 * Pulls from listener_recommendations table (pre-computed nightly).
 * Falls back to live scoring if no pre-computed recs exist yet.
 *
 * Sections:
 *   - New from artists you follow
 *   - Because you listen to [genre]
 *   - Hidden Gems
 *   - New Releases
 *   - Trending
 *   - Discovery cards (every ~8 tracks)
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { supabase } from '../supabaseClient';
import { useAuth } from '../contexts/AuthContext';
import { usePlayer } from '../contexts/PlayerContext';
import TrackActionSheet from '../components/TrackActionSheet';
import {
  Sparkles, Music, Play, Pause, MoreHorizontal,
  Users, Flame, Gem, Zap, RefreshCw, Loader,
} from 'lucide-react';

// ── Reason config ─────────────────────────────────────────────────────────────
const REASON_CONFIG = {
  from_following:    { label: 'From artists you follow', icon: Users,    color: 'text-cyan-400',   bg: 'bg-cyan-500/10'    },
  genre_match:       { label: 'Because of your taste',   icon: Sparkles, color: 'text-purple-400', bg: 'bg-purple-500/10'  },
  new_release:       { label: 'Just dropped',            icon: Zap,      color: 'text-yellow-400', bg: 'bg-yellow-500/10'  },
  hidden_gem:        { label: 'Hidden gem',              icon: Gem,      color: 'text-emerald-400',bg: 'bg-emerald-500/10' },
  trending:          { label: 'Trending',                icon: Flame,    color: 'text-orange-400', bg: 'bg-orange-500/10'  },
  similar_to_recent: { label: 'Similar to recent plays', icon: Music,    color: 'text-blue-400',   bg: 'bg-blue-500/10'    },
  coldstart:         { label: 'Popular right now',       icon: Flame,    color: 'text-orange-400', bg: 'bg-orange-500/10'  },
  recommended:       { label: 'Picked for you',          icon: Sparkles, color: 'text-purple-400', bg: 'bg-purple-500/10'  },
};

function ReasonPill({ reason }) {
  const cfg = REASON_CONFIG[reason] || REASON_CONFIG.recommended;
  const Icon = cfg.icon;
  return (
    <div className={`inline-flex items-center space-x-1 px-2 py-0.5 rounded-full ${cfg.bg}`}>
      <Icon className={`w-2.5 h-2.5 ${cfg.color}`} />
      <span className={`text-[9px] font-bold uppercase tracking-wider ${cfg.color}`}>{cfg.label}</span>
    </div>
  );
}

function TrackCard({ track, reason, trackList, onPlay, onMore, currentTrack, isPlaying }) {
  const navigate = useNavigate();
  const isActive  = currentTrack?.id === track.id;
  const isNowPlaying = isActive && isPlaying;

  return (
    <div className="flex items-center space-x-3 px-4 py-3 hover:bg-white/[0.03] active:bg-white/[0.05] transition rounded-xl group">
      {/* Artwork */}
      <div className="w-12 h-12 rounded-xl overflow-hidden bg-white/[0.06] flex-shrink-0 relative cursor-pointer"
        onClick={() => onPlay(track, trackList)}>
        {track.cover_artwork_url
          ? <img src={track.cover_artwork_url} alt={track.title} className="w-full h-full object-cover" loading="lazy" />
          : <div className="w-full h-full flex items-center justify-center"><Music className="w-5 h-5 text-white/20" /></div>
        }
        <div className={`absolute inset-0 flex items-center justify-center bg-black/50 rounded-xl transition ${isNowPlaying ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
          {isNowPlaying
            ? <Pause className="w-4 h-4 text-white" />
            : <Play className="w-4 h-4 text-white ml-0.5" />}
        </div>
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0 cursor-pointer" onClick={() => onPlay(track, trackList)}>
        <p className={`text-sm font-semibold truncate ${isActive ? 'text-purple-300' : 'text-white'}`}>{track.title}</p>
        <button
          onClick={(e) => { e.stopPropagation(); if (track.artist_slug) navigate(`/artist/${track.artist_slug}`); }}
          className="text-xs text-white/40 hover:text-white/70 transition truncate text-left w-full block">
          {track.artist_name}
        </button>
        <div className="mt-1">
          <ReasonPill reason={reason} />
        </div>
      </div>

      {/* More */}
      <button onClick={() => onMore(track)}
        className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-white/[0.06] transition flex-shrink-0 opacity-0 group-hover:opacity-100">
        <MoreHorizontal className="w-4 h-4 text-white/40" />
      </button>
    </div>
  );
}

// Discovery nudge card — appears every 8 tracks
function DiscoveryCard({ followedArtists, onDismiss, navigate }) {
  if (!followedArtists?.length) return null;
  const artist = followedArtists[Math.floor(Math.random() * followedArtists.length)];
  if (!artist) return null;

  return (
    <div className="mx-4 my-2 rounded-2xl p-4 relative"
      style={{ background: 'linear-gradient(135deg, rgba(139,92,246,0.1), rgba(59,130,246,0.08))', border: '1px solid rgba(139,92,246,0.2)' }}>
      <button onClick={onDismiss}
        className="absolute top-3 right-3 text-white/20 hover:text-white/40 text-xs">✕</button>
      <div className="flex items-center space-x-3">
        <div className="w-10 h-10 rounded-full overflow-hidden bg-white/10 flex-shrink-0">
          {artist.profile_image_url
            ? <img src={artist.profile_image_url} alt="" className="w-full h-full object-cover" />
            : <div className="w-full h-full flex items-center justify-center text-xs font-bold text-white/30">{artist.artist_name?.[0]}</div>}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-bold text-white truncate">{artist.artist_name}</p>
          <p className="text-[10px] text-white/40">You follow them — explore their profile</p>
        </div>
        <button onClick={() => navigate(`/artist/${artist.slug}`)}
          className="flex-shrink-0 px-3 py-1.5 rounded-full text-[11px] font-bold text-purple-300"
          style={{ background: 'rgba(139,92,246,0.15)', border: '1px solid rgba(139,92,246,0.25)' }}>
          Visit
        </button>
      </div>
    </div>
  );
}

function SectionHeader({ label, icon: Icon, color = 'text-white/30' }) {
  return (
    <div className="flex items-center space-x-2 px-4 pt-5 pb-2">
      {Icon && <Icon className={`w-3.5 h-3.5 ${color}`} />}
      <span className="text-xs font-bold text-white/50 uppercase tracking-wider">{label}</span>
    </div>
  );
}

export default function ForYouPage() {
  const { user }  = useAuth();
  const navigate  = useNavigate();
  const { playTrack, currentTrack, isPlaying, togglePlay } = usePlayer();

  const [recs, setRecs]                     = useState([]);
  const [loading, setLoading]               = useState(true);
  const [refreshing, setRefreshing]         = useState(false);
  const [actionSheetTrack, setActionSheetTrack] = useState(null);
  const [followedArtists, setFollowedArtists]   = useState([]);
  const [showDiscovery, setShowDiscovery]       = useState(true);
  const [lastRefreshed, setLastRefreshed]       = useState(null);

  const loadRecs = useCallback(async (isRefresh = false) => {
    if (!user) { setLoading(false); return; }
    if (isRefresh) setRefreshing(true); else setLoading(true);

    try {
      // Pull pre-computed recs
      const { data: recData } = await supabase
        .from('listener_recommendations')
        .select(`
          track_id, score, reason,
          tracks(
            id, title, genre, mood, cover_artwork_url, file_url, duration,
            stream_count, engagement_score, created_at,
            artists(artist_name, slug, profile_image_url)
          )
        `)
        .eq('user_id', user.id)
        .order('score', { ascending: false })
        .limit(50);

      if (recData?.length > 0) {
        const formatted = recData
          .filter(r => r.tracks)
          .map(r => ({
            ...r.tracks,
            artist_name: r.tracks.artists?.artist_name || 'Unknown Artist',
            artist_slug: r.tracks.artists?.slug || null,
            artist_image: r.tracks.artists?.profile_image_url || null,
            reason: r.reason,
            score: r.score,
          }));
        setRecs(formatted);
        setLastRefreshed(new Date());
      } else {
        // Coldstart fallback — pull trending tracks
        const { data: trending } = await supabase
          .from('tracks')
          .select('*, artists(artist_name, slug, profile_image_url)')
          .eq('is_published', true)
          .order('engagement_score', { ascending: false })
          .limit(30);

        setRecs((trending || []).map(t => ({
          ...t,
          artist_name: t.artists?.artist_name || 'Unknown Artist',
          artist_slug: t.artists?.slug || null,
          reason: 'coldstart',
        })));
        setLastRefreshed(new Date());
      }

      // Also load followed artists for discovery cards
      const { data: follows } = await supabase
        .from('follows')
        .select('artist_id, artists(id, artist_name, slug, profile_image_url)')
        .eq('follower_id', user.id)
        .limit(20);

      setFollowedArtists((follows || []).map(f => f.artists).filter(Boolean));

    } catch (err) {
      console.error('ForYou load error:', err);
    }

    setLoading(false);
    setRefreshing(false);
  }, [user]);

  useEffect(() => { loadRecs(); }, [loadRecs]);

  const handlePlay = useCallback((track, list) => {
    if (currentTrack?.id === track.id) { togglePlay(); return; }
    playTrack(track, list);
  }, [currentTrack, togglePlay, playTrack]);

  // Group recs by reason for section headers
  const grouped = React.useMemo(() => {
    const order = ['from_following', 'new_release', 'genre_match', 'hidden_gem', 'trending', 'coldstart', 'recommended', 'similar_to_recent'];
    const groups = {};
    recs.forEach(t => {
      const r = t.reason || 'recommended';
      (groups[r] = groups[r] || []).push(t);
    });
    return order.filter(r => groups[r]?.length > 0).map(r => ({ reason: r, tracks: groups[r] }));
  }, [recs]);

  if (!user) return (
    <div className="min-h-screen bg-black flex flex-col items-center justify-center px-6 text-center pb-24">
      <Sparkles className="w-10 h-10 text-white/10 mb-4" />
      <p className="text-white/40 text-sm mb-4">Sign in to get your personal feed</p>
      <button onClick={() => navigate('/login')}
        className="px-6 py-2.5 bg-white text-black rounded-xl text-sm font-semibold">Sign In</button>
    </div>
  );

  if (loading) return (
    <div className="min-h-screen bg-black flex items-center justify-center pb-24">
      <Loader className="w-6 h-6 animate-spin text-white/20" />
    </div>
  );

  const allTracks = recs; // flat list for queue building

  return (
    <div className="min-h-screen bg-black text-white pb-32">
      <Helmet>
        <title>For You · Feelz Machine</title>
        <meta name="description" content="Your personalised music feed on Feelz Machine." />
      </Helmet>

      {/* Header */}
      <div className="sticky top-0 z-20 bg-black/95 backdrop-blur-xl border-b border-white/[0.04] px-4 pt-14 md:pt-4 pb-3 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">For You</h1>
          {lastRefreshed && (
            <p className="text-[10px] text-white/25 mt-0.5">
              Updated {lastRefreshed.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </p>
          )}
        </div>
        <button onClick={() => loadRecs(true)} disabled={refreshing}
          className="w-8 h-8 flex items-center justify-center rounded-full bg-white/[0.06] hover:bg-white/[0.1] transition disabled:opacity-40">
          <RefreshCw className={`w-3.5 h-3.5 text-white/50 ${refreshing ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {recs.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center px-6">
          <Sparkles className="w-10 h-10 text-white/10 mb-4" />
          <p className="text-sm font-semibold text-white/40 mb-1">Your feed is warming up</p>
          <p className="text-xs text-white/25">Listen to a few tracks and come back — we'll personalise this for you.</p>
          <button onClick={() => navigate('/browse')}
            className="mt-4 px-5 py-2.5 bg-white text-black rounded-xl text-sm font-semibold">
            Discover Music
          </button>
        </div>
      ) : (
        <>
          {grouped.map((group, groupIdx) => {
            const cfg = REASON_CONFIG[group.reason] || REASON_CONFIG.recommended;
            return (
              <div key={group.reason}>
                <SectionHeader label={cfg.label} icon={cfg.icon} color={cfg.color} />
                {group.tracks.map((track, trackIdx) => {
                  const globalIdx = grouped.slice(0, groupIdx).reduce((s, g) => s + g.tracks.length, 0) + trackIdx;
                  return (
                    <React.Fragment key={track.id}>
                      <TrackCard
                        track={track}
                        reason={track.reason}
                        trackList={allTracks}
                        onPlay={handlePlay}
                        onMore={setActionSheetTrack}
                        currentTrack={currentTrack}
                        isPlaying={isPlaying}
                      />
                      {/* Discovery card every 8 tracks */}
                      {showDiscovery && (globalIdx + 1) % 8 === 0 && followedArtists.length > 0 && (
                        <DiscoveryCard
                          followedArtists={followedArtists}
                          onDismiss={() => setShowDiscovery(false)}
                          navigate={navigate}
                        />
                      )}
                    </React.Fragment>
                  );
                })}
              </div>
            );
          })}

          <p className="text-[10px] text-white/15 text-center py-6 px-4">
            Your feed refreshes every night based on what you listen to.
          </p>
        </>
      )}

      <TrackActionSheet
        track={actionSheetTrack}
        onClose={() => setActionSheetTrack(null)}
      />
    </div>
  );
}
