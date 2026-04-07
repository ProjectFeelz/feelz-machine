import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { useAuth } from '../contexts/AuthContext';
import { usePlayer } from '../contexts/PlayerContext';
import {
  Clock, Play, Pause, Music, ArrowLeft, Loader,
  MoreHorizontal, Shuffle, Calendar, TrendingUp,
} from 'lucide-react';
import TrackActionSheet from '../components/TrackActionSheet';

function formatNumber(n) {
  if (!n) return '0';
  if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
  if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
  return n.toString();
}

function formatDuration(s) {
  if (!s) return '';
  return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
}

function timeAgo(date) {
  const seconds = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
  if (seconds < 60)   return 'Just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
  return new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

const FILTERS = [
  { key: 'all',   label: 'All Time' },
  { key: 'today', label: 'Today' },
  { key: 'week',  label: 'This Week' },
];

export default function RecentlyPlayedPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { playTrack, currentTrack, isPlaying, togglePlay } = usePlayer();

  const [streams, setStreams]               = useState([]);
  const [loading, setLoading]               = useState(true);
  const [filter, setFilter]                 = useState('all');
  const [actionSheetTrack, setActionSheetTrack] = useState(null);

  useEffect(() => {
    if (user) fetchStreams();
  }, [user, filter]);

  useEffect(() => {
    const handleFocus = () => { if (user) fetchStreams(); };
    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, [user, filter]);

  const fetchStreams = async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('streams')
        .select(`
          id, created_at,
          track:tracks(
            id, title, slug, file_url, cover_artwork_url, duration, genre, stream_count,
            artist:artists(id, artist_name, slug, profile_image_url)
          )
        `)
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(100);

      if (filter === 'today') {
        const start = new Date();
        start.setHours(0, 0, 0, 0);
        query = query.gte('created_at', start.toISOString());
      } else if (filter === 'week') {
        const start = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
        query = query.gte('created_at', start.toISOString());
      }

      const { data } = await query;

      // Deduplicate — keep most recent play per track, but preserve all for stats
      const seen = new Set();
      const deduped = (data || []).filter(s => {
        if (!s.track) return false;
        if (seen.has(s.track.id)) return false;
        seen.add(s.track.id);
        return true;
      });

      setStreams(deduped);
    } catch (err) {
      console.error('Recently played error:', err);
    }
    setLoading(false);
  };

  const handlePlay = (track, startIndex) => {
    if (currentTrack?.id === track.id) { togglePlay(); return; }
    const queue = streams
      .slice(startIndex)
      .map(s => ({
        ...s.track,
        artist_name: s.track.artist?.artist_name || 'Unknown',
        artist_slug: s.track.artist?.slug || null,
      }));
    playTrack(queue[0], queue);
  };

  const handlePlayAll = () => {
    if (!streams.length) return;
    const queue = streams.map(s => ({
      ...s.track,
      artist_name: s.track.artist?.artist_name || 'Unknown',
      artist_slug: s.track.artist?.slug || null,
    }));
    playTrack(queue[0], queue);
  };

  const handleShuffle = () => {
    if (!streams.length) return;
    const queue = [...streams]
      .sort(() => Math.random() - 0.5)
      .map(s => ({
        ...s.track,
        artist_name: s.track.artist?.artist_name || 'Unknown',
        artist_slug: s.track.artist?.slug || null,
      }));
    playTrack(queue[0], queue);
  };

  // Stats
  const totalPlays    = streams.length;
  const uniqueArtists = new Set(streams.map(s => s.track?.artist?.id).filter(Boolean)).size;
  const topGenre      = (() => {
    const counts = {};
    streams.forEach(s => { if (s.track?.genre) counts[s.track.genre] = (counts[s.track.genre] || 0) + 1; });
    return Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] || null;
  })();

  return (
    <div className="pt-14 md:pt-0 pb-32 max-w-2xl">

      {/* Header */}
      <div className="flex items-center space-x-3 mb-5 sticky top-0 z-20 bg-black/90 backdrop-blur-sm md:relative md:top-auto md:bg-transparent pt-2 pb-2 -mx-4 px-4">
        <button onClick={() => navigate('/library')}
          className="w-9 h-9 flex items-center justify-center rounded-full bg-white/[0.06] hover:bg-white/[0.1] transition">
          <ArrowLeft className="w-5 h-5 text-white" />
        </button>
        <div className="flex-1">
          <h1 className="text-xl font-bold text-white">Recently Played</h1>
          <p className="text-xs text-white/30">{totalPlays} track{totalPlays !== 1 ? 's' : ''}</p>
        </div>
      </div>

      {/* Stats row */}
      {!loading && streams.length > 0 && (
        <div className="flex space-x-3 mb-5 px-4 md:px-0">
          <div className="flex-1 bg-white/[0.03] rounded-xl p-3 border border-white/[0.05]">
            <div className="flex items-center space-x-1.5 mb-1">
              <TrendingUp className="w-3 h-3 text-purple-400" />
              <span className="text-[10px] text-white/30 uppercase tracking-wider">Played</span>
            </div>
            <p className="text-lg font-bold text-white">{formatNumber(totalPlays)}</p>
          </div>
          <div className="flex-1 bg-white/[0.03] rounded-xl p-3 border border-white/[0.05]">
            <div className="flex items-center space-x-1.5 mb-1">
              <Music className="w-3 h-3 text-blue-400" />
              <span className="text-[10px] text-white/30 uppercase tracking-wider">Artists</span>
            </div>
            <p className="text-lg font-bold text-white">{uniqueArtists}</p>
          </div>
          {topGenre && (
            <div className="flex-1 bg-white/[0.03] rounded-xl p-3 border border-white/[0.05]">
              <div className="flex items-center space-x-1.5 mb-1">
                <Calendar className="w-3 h-3 text-green-400" />
                <span className="text-[10px] text-white/30 uppercase tracking-wider">Top Genre</span>
              </div>
              <p className="text-sm font-bold text-white truncate">{topGenre}</p>
            </div>
          )}
        </div>
      )}

      {/* Filter + Play controls */}
      <div className="flex items-center justify-between mb-4 px-4 md:px-0">
        <div className="flex space-x-1 bg-white/[0.03] rounded-xl p-1">
          {FILTERS.map(f => (
            <button key={f.key} onClick={() => setFilter(f.key)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                filter === f.key ? 'bg-white text-black' : 'text-white/40 hover:text-white/60'
              }`}>
              {f.label}
            </button>
          ))}
        </div>
        {streams.length > 0 && (
          <div className="flex items-center space-x-2">
            <button onClick={handleShuffle}
              className="w-9 h-9 flex items-center justify-center rounded-full bg-white/[0.06] hover:bg-white/[0.1] transition">
              <Shuffle className="w-4 h-4 text-white/60" />
            </button>
            <button onClick={handlePlayAll}
              className="flex items-center space-x-2 px-4 py-2 bg-white text-black rounded-full text-xs font-semibold hover:bg-white/90 transition active:scale-95">
              <Play className="w-3.5 h-3.5" fill="black" />
              <span>Play All</span>
            </button>
          </div>
        )}
      </div>

      {/* Track list */}
      {loading ? (
        <div className="flex justify-center py-20">
          <Loader className="w-6 h-6 animate-spin text-white/30" />
        </div>
      ) : streams.length === 0 ? (
        <div className="text-center py-20 px-4">
          <Clock className="w-12 h-12 mx-auto text-white/10 mb-3" />
          <p className="text-white/30 text-sm">
            {filter === 'today' ? 'Nothing played today yet' :
             filter === 'week'  ? 'Nothing played this week' :
             'No listening history yet'}
          </p>
          <button onClick={() => navigate('/browse')}
            className="mt-4 text-xs text-purple-400 hover:text-purple-300 transition">
            Browse music →
          </button>
        </div>
      ) : (
        <div className="space-y-0.5 px-4 md:px-0">
          {streams.map((stream, i) => {
            const track      = stream.track;
            const isActive   = currentTrack?.id === track.id;
            const isPlaying_ = isActive && isPlaying;

            return (
              <div key={stream.id}
                className={`flex items-center space-x-3 p-3 rounded-xl transition group cursor-pointer ${
                  isActive ? 'bg-white/[0.06]' : 'hover:bg-white/[0.03]'
                }`}
                onClick={() => handlePlay(track, i)}
              >
                {/* Cover */}
                <div className="relative w-12 h-12 flex-shrink-0">
                  {track.cover_artwork_url
                    ? <img src={track.cover_artwork_url} alt=""
                        className="w-12 h-12 rounded-lg object-cover" loading="lazy" />
                    : <div className="w-12 h-12 rounded-lg bg-white/[0.06] flex items-center justify-center">
                        <Music className="w-4 h-4 text-white/20" />
                      </div>}
                  {/* Play overlay */}
                  <div className="absolute inset-0 flex items-center justify-center bg-black/50 rounded-lg opacity-0 group-hover:opacity-100 transition">
                    {isPlaying_
                      ? <Pause className="w-4 h-4 text-white" />
                      : <Play className="w-4 h-4 text-white" />}
                  </div>
                  {/* Now playing indicator */}
                  {isPlaying_ && (
                    <div className="absolute bottom-0.5 right-0.5 flex items-end space-x-px">
                      {[100, 60, 80].map((h, i) => (
                        <div key={i} className="w-[3px] bg-purple-400 rounded-sm animate-pulse"
                          style={{ height: `${h}%`, maxHeight: 10, animationDelay: `${i * 0.15}s` }} />
                      ))}
                    </div>
                  )}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-medium truncate ${isActive ? 'text-purple-400' : 'text-white'}`}>
                    {track.title}
                  </p>
                  <button
                    onClick={(e) => { e.stopPropagation(); track.artist?.slug && navigate(`/artist/${track.artist.slug}`); }}
                    className="text-xs text-white/30 hover:text-white/50 transition text-left truncate block w-full">
                    {track.artist?.artist_name || 'Unknown'}
                    {track.genre && <span className="text-white/20"> · {track.genre}</span>}
                  </button>
                </div>

                {/* Meta */}
                <div className="flex flex-col items-end flex-shrink-0 space-y-0.5">
                  <span className="text-[10px] text-white/25">{timeAgo(stream.created_at)}</span>
                  {track.duration && (
                    <span className="text-[10px] text-white/15">{formatDuration(track.duration)}</span>
                  )}
                </div>

                {/* More */}
                <button
                  onClick={(e) => { e.stopPropagation(); setActionSheetTrack(track); }}
                  className="w-8 h-8 flex items-center justify-center rounded-lg opacity-0 group-hover:opacity-100 transition flex-shrink-0">
                  <MoreHorizontal className="w-4 h-4 text-white/40" />
                </button>
              </div>
            );
          })}
        </div>
      )}

      {actionSheetTrack && (
        <TrackActionSheet
          track={actionSheetTrack}
          artist={{
            artist_name: actionSheetTrack.artist?.artist_name,
            slug: actionSheetTrack.artist?.slug,
          }}
          onClose={() => setActionSheetTrack(null)}
        />
      )}
    </div>
  );
}
