import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { useAuth } from '../contexts/AuthContext';
import { Loader, Users, Music } from 'lucide-react';

export default function PlaylistJoinPage() {
  const { token } = useParams();
  const navigate  = useNavigate();
  const { user }  = useAuth();
  const [status, setStatus] = useState('loading'); // loading | joining | success | error | not_found
  const [playlist, setPlaylist] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!token) { navigate('/library/playlists'); return; }
    resolveToken();
  }, [token, user]);

  const resolveToken = async () => {
    setStatus('loading');
    const { data: pl } = await supabase
      .from('playlists')
      .select('id, name, user_id, is_shared')
      .eq('share_token', token)
      .eq('is_shared', true)
      .maybeSingle();

    if (!pl) { setStatus('not_found'); return; }
    setPlaylist(pl);

    // If not logged in, redirect to login then back
    if (!user) {
      navigate(`/login?redirect=/library/playlists/join/${token}`);
      return;
    }

    // Owner visiting their own link
    if (pl.user_id === user.id) {
      navigate(`/library/playlists/${pl.id}`);
      return;
    }

    // Auto-join
    setStatus('joining');
    const { error: joinErr } = await supabase
      .from('playlist_collaborators')
      .upsert(
        { playlist_id: pl.id, user_id: user.id, can_edit: true },
        { onConflict: 'playlist_id,user_id' }
      );

    if (joinErr) {
      setError(joinErr.message);
      setStatus('error');
      return;
    }

    setStatus('success');
    setTimeout(() => navigate(`/library/playlists/${pl.id}`), 1500);
  };

  return (
    <div className="min-h-screen bg-black flex items-center justify-center px-6">
      <div className="text-center max-w-xs w-full">
        {status === 'loading' && (
          <>
            <Loader className="w-8 h-8 animate-spin text-white/30 mx-auto mb-4" />
            <p className="text-white/40 text-sm">Finding playlist...</p>
          </>
        )}

        {status === 'joining' && (
          <>
            <Loader className="w-8 h-8 animate-spin text-blue-400 mx-auto mb-4" />
            <p className="text-white text-sm font-medium">Joining playlist...</p>
          </>
        )}

        {status === 'success' && (
          <>
            <div className="w-16 h-16 rounded-2xl bg-blue-500/20 flex items-center justify-center mx-auto mb-4">
              <Users className="w-8 h-8 text-blue-400" />
            </div>
            <p className="text-white font-semibold mb-1">You're in!</p>
            <p className="text-white/40 text-sm">Joined "{playlist?.name}"</p>
            <p className="text-white/20 text-xs mt-2">Redirecting...</p>
          </>
        )}

        {status === 'not_found' && (
          <>
            <div className="w-16 h-16 rounded-2xl bg-white/[0.04] flex items-center justify-center mx-auto mb-4">
              <Music className="w-8 h-8 text-white/20" />
            </div>
            <p className="text-white font-semibold mb-1">Playlist not found</p>
            <p className="text-white/40 text-sm mb-6">
              This link may have expired or the playlist is no longer shared.
            </p>
            <button
              onClick={() => navigate('/library/playlists')}
              className="px-5 py-2.5 bg-white/[0.06] rounded-xl text-sm text-white/60 hover:bg-white/[0.1] transition"
            >
              Back to Playlists
            </button>
          </>
        )}

        {status === 'error' && (
          <>
            <p className="text-white font-semibold mb-1">Something went wrong</p>
            <p className="text-white/40 text-sm mb-4">{error}</p>
            <button
              onClick={resolveToken}
              className="px-5 py-2.5 bg-white/[0.06] rounded-xl text-sm text-white/60 hover:bg-white/[0.1] transition"
            >
              Try Again
            </button>
          </>
        )}
      </div>
    </div>
  );
}