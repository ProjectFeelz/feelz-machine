import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { useAuth } from '../contexts/AuthContext';
import { usePlayer } from '../contexts/PlayerContext';
import { downloadTrack } from '../utils/downloadTrack';
import {
    X, Share2, ListMusic, Download, Heart, Play, Music,
    Loader, Check, ChevronLeft
} from 'lucide-react';

export default function TrackActionSheet({ track, artist, onClose }) {
    const navigate = useNavigate();
    const { user } = useAuth();
    const { addToQueue } = usePlayer();
    const [view, setView] = useState('main');
    const [playlists, setPlaylists] = useState([]);
    const [addingTo, setAddingTo] = useState(null);
    const [addedTo, setAddedTo] = useState({});
    const [shared, setShared] = useState(false);
    const [downloading, setDownloading] = useState(false);
    const [liked, setLiked] = useState(false);
    const [downloadError, setDownloadError] = useState(null);

  useEffect(() => {
        if (!track) return;
        if (user) checkLike();
  }, [track?.id]);

  const checkLike = async () => {
        const { data } = await supabase.from('track_likes').select('id').eq('track_id', track.id).eq('user_id', user.id).maybeSingle();
        setLiked(!!data);
  };

  const loadPlaylists = async () => {
        if (!user) { navigate('/login'); onClose(); return; }
        const { data } = await supabase.from('playlists').select('id, name').eq('user_id', user.id).order('name');
        setPlaylists(data || []);
        setView('playlists');
  };

  const handleAddToPlaylist = async (playlistId) => {
        setAddingTo(playlistId);
        const { data: existing } = await supabase.from('playlist_tracks').select('id').eq('playlist_id', playlistId).eq('track_id', track.id).maybeSingle();
        if (!existing) {
                const { data: last } = await supabase.from('playlist_tracks').select('position').eq('playlist_id', playlistId).order('position', { ascending: false }).limit(1).maybeSingle();
                await supabase.from('playlist_tracks').insert({ playlist_id: playlistId, track_id: track.id, position: (last?.position ?? -1) + 1 });
        }
        setAddedTo(prev => ({ ...prev, [playlistId]: true }));
        setAddingTo(null);
  };

  const handleShare = async () => {
        const url = window.location.origin + '/player/artist/' + (artist?.slug || '');
        if (navigator.share) {
                try { await navigator.share({ title: track.title, text: track.title + ' by ' + (artist?.artist_name || track.artist_name), url }); } catch {}
        } else {
                await navigator.clipboard.writeText(url);
        }
        setShared(true);
        setTimeout(() => { setShared(false); onClose(); }, 1000);
  };

  const handleQueue = () => {
        addToQueue({ ...track, artist_name: artist?.artist_name || track.artist_name });
        onClose();
  };

  const handleLike = async () => {
        if (!user) { navigate('/login'); onClose(); return; }
        if (liked) {
                await supabase.from('track_likes').delete().eq('track_id', track.id).eq('user_id', user.id);
                setLiked(false);
        } else {
                await supabase.from('track_likes').insert({ track_id: track.id, user_id: user.id });
                setLiked(true);
        }
  };

  const handleDownload = async () => {
        if (!user) { navigate('/login'); onClose(); return; }
        setDownloadError(null);
        setDownloading(true);
        try {
                // Get the current session token to pass to the secure download endpoint
          const { data: { session } } = await supabase.auth.getSession();
                const authToken = session?.access_token;
                if (!authToken) throw new Error('Not authenticated');
                await downloadTrack(track.id, track.title, authToken);
                onClose();
        } catch (err) {
                if (err.message === 'purchase_required') {
                          setDownloadError('Purchase this track first to download it.');
                } else {
                          setDownloadError('Download failed. Please try again.');
                }
        } finally {
                setDownloading(false);
        }
  };

  if (!track) return null;

  return (
        <div className="fixed inset-0 z-[100] flex items-end justify-center" onClick={onClose}>
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
          <div
          className="relative w-full max-w-lg rounded-t-2xl overflow-hidden animate-slide-up"
          style={{ backgroundColor: '#111', border: '1px solid rgba(255,255,255,0.08)', borderBottom: 'none' }}
        onClick={(e) => e.stopPropagation()}>

        {/* Track info header */}
        <div className="flex items-center space-x-3 p-4 border-b border-white/[0.06]">
                    <div className="w-12 h-12 rounded-lg overflow-hidden bg-white/[0.06] flex-shrink-0">
        {track.cover_artwork_url
              ? <img src={track.cover_artwork_url} alt="" className="w-full h-full object-cover" />
                        : <div className="w-full h-full flex items-center justify-center"><Music className="w-5 h-5 text-white/20" /></div>}
          </div>
          <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-white truncate">{track.title}</p>
            <button
              onClick={() => { const slug = artist?.slug || track.artist_slug; if (slug) { navigate(`/artist/${slug}`); onClose(); } }}
              className="text-xs text-white/40 truncate hover:text-white/70 transition text-left w-full block"
            >{artist?.artist_name || track.artist_name}</button>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full bg-white/[0.06]">
                      <X className="w-4 h-4 text-white/50" />
          </button>
          </div>

{/* Actions */}
        <div className="py-2">
        {view === 'playlists' ? (
                      <>
                       <button onClick={() => setView('main')} className="w-full flex items-center space-x-3 px-5 py-3.5 active:bg-white/[0.04] transition">
                         <ChevronLeft className="w-5 h-5 text-white/40" />
                         <span className="text-sm text-white/60">Back</span>
         </button>
         {playlists.length === 0
                         ? <p className="text-xs text-white/30 px-5 py-3">No playlists yet</p>
                         : playlists.map(pl => (
                                               <button key={pl.id} onClick={() => handleAddToPlaylist(pl.id)} disabled={addingTo === pl.id}
                                className="w-full flex items-center justify-between px-5 py-3.5 active:bg-white/[0.04] transition">
                                <span className="text-sm text-white/70 truncate">{pl.name}</span>
{addedTo[pl.id] ? <Check className="w-4 h-4 text-green-400" /> : addingTo === pl.id ? <Loader className="w-4 h-4 animate-spin text-white/30" /> : null}
</button>
                  ))
}
                    </>
          ) : (
                        <>
                          <button onClick={handleLike} className="w-full flex items-center space-x-4 px-5 py-3.5 active:bg-white/[0.04] transition">
                            <Heart className="w-5 h-5" fill={liked ? '#ef4444' : 'none'} color={liked ? '#ef4444' : 'rgba(255,255,255,0.4)'} />
                <span className="text-sm text-white/70">{liked ? 'Unlike' : 'Like'}</span>
            </button>
              <button onClick={handleQueue} className="w-full flex items-center space-x-4 px-5 py-3.5 active:bg-white/[0.04] transition">
                            <Play className="w-5 h-5 text-white/40" />
                            <span className="text-sm text-white/70">Add to Queue</span>
            </button>
              <button onClick={loadPlaylists} className="w-full flex items-center space-x-4 px-5 py-3.5 active:bg-white/[0.04] transition">
                            <ListMusic className="w-5 h-5 text-white/40" />
                            <span className="text-sm text-white/70">Add to Playlist</span>
            </button>
              <button onClick={handleShare} className="w-full flex items-center space-x-4 px-5 py-3.5 active:bg-white/[0.04] transition">
          {shared ? <Check className="w-5 h-5 text-green-400" /> : <Share2 className="w-5 h-5 text-white/40" />}
                <span className="text-sm text-white/70">{shared ? 'Copied!' : 'Share'}</span>
            </button>
{track.is_downloadable && track.id && (
                  <>
                    <button onClick={handleDownload} disabled={downloading} className="w-full flex items-center space-x-4 px-5 py-3.5 active:bg-white/[0.04] transition">
{downloading ? <Loader className="w-5 h-5 animate-spin text-white/40" /> : <Download className="w-5 h-5 text-white/40" />}
                    <span className="text-sm text-white/70">{downloading ? 'Downloading...' : 'Download'}</span>
  </button>
{downloadError && (
                      <p className="text-xs text-red-400 px-5 pb-2">{downloadError}</p>
                   )}
</>
              )}
              <button onClick={() => { navigate(`/artist/${artist?.slug || ''}`); onClose(); }} className="w-full flex items-center space-x-4 px-5 py-3.5 active:bg-white/[0.04] transition">
                                                <Music className="w-5 h-5 text-white/40" />
                                                                                <span className="text-sm text-white/70">View Artist</span>
                </button>
                </>
          )}
</div>

{/* Safe area padding */}
        <div className="h-6" />
          </div>

      <style>{`
              @keyframes slideUp { from { transform: translateY(100%); } to { transform: translateY(0); } }
                      .animate-slide-up { animation: slideUp 0.25s ease-out; }
                            `}</style>
          </div>
  );
}
