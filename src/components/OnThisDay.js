/**
 * OnThisDay.js
 * Shows a track the user streamed exactly 1 year ago today.
 * Renders as a home page banner card.
 */
import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { usePlayer } from '../contexts/PlayerContext';
import { Clock, Play, Pause } from 'lucide-react';

export default function OnThisDay({ user }) {
  const { playTrack, currentTrack, isPlaying, togglePlay } = usePlayer();
  const [track, setTrack] = useState(null);

  useEffect(() => {
    if (!user) return;
    const now = new Date();
    const yearAgoStart = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate(), 0, 0, 0).toISOString();
    const yearAgoEnd   = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate(), 23, 59, 59).toISOString();

    supabase.from('streams')
      .select('track_id, tracks(id, title, cover_artwork_url, file_url, duration, artist_id, artists(artist_name, slug))')
      .eq('user_id', user.id)
      .gte('created_at', yearAgoStart)
      .lte('created_at', yearAgoEnd)
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        if (data?.tracks) setTrack({ ...data.tracks, artist_name: data.tracks.artists?.artist_name });
      });
  }, [user?.id]);

  if (!track) return null;

  const isActive = currentTrack?.id === track.id;

  return (
    <div className="mx-6 mb-6 p-4 rounded-2xl border border-white/[0.08] bg-white/[0.03]">
      <div className="flex items-center space-x-2 mb-3">
        <Clock className="w-3.5 h-3.5 text-white/30" />
        <span className="text-[10px] uppercase tracking-widest font-semibold text-white/30">On This Day · 1 Year Ago</span>
      </div>
      <div className="flex items-center space-x-3">
        <div className="relative w-12 h-12 rounded-xl overflow-hidden flex-shrink-0">
          {track.cover_artwork_url
            ? <img src={track.cover_artwork_url} alt="" className="w-full h-full object-cover" />
            : <div className="w-full h-full bg-white/[0.06]" />}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-white truncate">{track.title}</p>
          <p className="text-xs text-white/40 truncate">{track.artist_name}</p>
        </div>
        <button
          onClick={() => isActive ? togglePlay() : playTrack(track, [track])}
          className="w-9 h-9 rounded-full bg-white/[0.08] flex items-center justify-center hover:bg-white/[0.12] transition flex-shrink-0"
        >
          {isActive && isPlaying
            ? <Pause className="w-4 h-4 text-white" />
            : <Play className="w-4 h-4 text-white ml-0.5" />}
        </button>
      </div>
    </div>
  );
}