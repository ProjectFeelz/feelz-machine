// src/pages/HiddenPage.js
// Lets a listener see and undo what they have hidden.
//
// Hiding is permanent by design: it is a deliberate act and quietly
// resurrecting an artist someone dismissed would be a bad surprise. But
// permanent with no way back means a listener can narrow their own feed
// over a year and never understand why it went quiet. Permanent and
// reversible by the listener is the honest version, and this page is the
// second half of that.
//
// Hidden artists and hidden tracks are shown separately because they are
// different in weight. A hidden artist removes everything they ever
// release from the feed, which is the stronger and more easily forgotten
// decision.

import React from 'react';
import { Helmet } from 'react-helmet-async';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Loader, EyeOff, Undo2, Music } from 'lucide-react';
import { supabase } from '../supabaseClient';
import { useAuth } from '../contexts/AuthContext';

export default function HiddenPage() {
  const navigate = useNavigate();
  const { user } = useAuth();

  const [artists, setArtists] = React.useState([]);
  const [tracks, setTracks] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [toast, setToast] = React.useState('');

  const showToast = (m) => { setToast(m); setTimeout(() => setToast(''), 2500); };

  const load = React.useCallback(async () => {
    if (!user) { setLoading(false); return; }

    const { data } = await supabase
      .from('listener_feedback')
      .select('track_id, artist_id, updated_at, tracks(id, title, cover_artwork_url), artists(id, artist_name, slug, profile_image_url)')
      .eq('user_id', user.id)
      .eq('signal', 'not_interested')
      .order('updated_at', { ascending: false });

    const rows = data || [];

    // One row per artist, since hiding several tracks by the same artist
    // produces several rows that all mean the same thing to the listener.
    const seenArtists = new Set();
    const artistRows = [];
    rows.forEach(r => {
      if (!r.artist_id || !r.artists || seenArtists.has(r.artist_id)) return;
      seenArtists.add(r.artist_id);
      artistRows.push(r);
    });

    setArtists(artistRows);
    setTracks(rows.filter(r => r.tracks && !r.artist_id));
    setLoading(false);
  }, [user]);

  React.useEffect(() => { load(); }, [load]);

  // Unhiding an artist clears every hidden row for them, not just the one
  // row shown. Otherwise a listener unhides someone and they stay missing
  // because three other rows are still hiding them.
  const unhideArtist = async (artistId, name) => {
    await supabase
      .from('listener_feedback')
      .delete()
      .eq('user_id', user.id)
      .eq('artist_id', artistId)
      .eq('signal', 'not_interested');
    setArtists(prev => prev.filter(a => a.artist_id !== artistId));
    showToast(`${name} is back in your feed`);
  };

  const unhideTrack = async (trackId, title) => {
    await supabase
      .from('listener_feedback')
      .delete()
      .eq('user_id', user.id)
      .eq('track_id', trackId)
      .eq('signal', 'not_interested');
    setTracks(prev => prev.filter(t => t.track_id !== trackId));
    showToast(`${title} is back in your feed`);
  };

  if (!user) {
    return (
      <div className="pt-10 px-4 text-center">
        <p className="text-sm text-white/50">Log in to see what you have hidden.</p>
      </div>
    );
  }

  const nothingHidden = !loading && artists.length === 0 && tracks.length === 0;

  return (
    <div className="pt-4 pb-32 px-4 md:px-8">
      <Helmet><title>Hidden</title><meta name="robots" content="noindex, nofollow" /></Helmet>

      {toast && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-xl bg-white/10 backdrop-blur-md border border-white/10 text-sm text-white font-medium shadow-lg">
          {toast}
        </div>
      )}

      <div className="flex items-center space-x-3 mb-6">
        <button onClick={() => navigate(-1)} className="w-9 h-9 flex items-center justify-center rounded-full bg-white/[0.06] hover:bg-white/[0.1] transition">
          <ArrowLeft className="w-4 h-4 text-white" />
        </button>
        <div>
          <h1 className="text-xl font-bold text-white">Hidden</h1>
          <p className="text-xs text-white/30">Artists and tracks you have taken out of your feed.</p>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Loader className="w-5 h-5 text-white/30 animate-spin" /></div>
      ) : nothingHidden ? (
        <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-10 text-center">
          <EyeOff className="w-6 h-6 text-white/10 mx-auto mb-3" />
          <p className="text-sm text-white/40">You have not hidden anything.</p>
          <p className="text-xs text-white/25 mt-1">
            Anything you hide from For You shows up here so you can undo it later.
          </p>
        </div>
      ) : (
        <div className="space-y-8">
          {artists.length > 0 && (
            <div>
              <p className="text-xs font-bold text-white/50 uppercase tracking-wide mb-3">
                Hidden artists
              </p>
              <p className="text-xs text-white/25 mb-3">
                Nothing these artists release will appear in your feed.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2">
                {artists.map(a => (
                  <div key={a.artist_id}
                    className="flex items-center gap-3 p-3 rounded-xl bg-white/[0.03] border border-white/[0.06]">
                    <div className="w-10 h-10 rounded-full overflow-hidden bg-white/[0.06] flex-shrink-0">
                      {a.artists?.profile_image_url
                        ? <img src={a.artists.profile_image_url} alt="" className="w-full h-full object-cover" />
                        : <div className="w-full h-full flex items-center justify-center text-xs text-white/30 font-bold">
                            {a.artists?.artist_name?.[0]?.toUpperCase()}
                          </div>}
                    </div>
                    <p className="text-sm text-white truncate flex-1">{a.artists?.artist_name}</p>
                    <button onClick={() => unhideArtist(a.artist_id, a.artists?.artist_name)}
                      className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full bg-white/[0.06] text-white/60 hover:bg-white/[0.12] hover:text-white transition flex-shrink-0">
                      <Undo2 className="w-3 h-3" />
                      Unhide
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {tracks.length > 0 && (
            <div>
              <p className="text-xs font-bold text-white/50 uppercase tracking-wide mb-3">
                Hidden tracks
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2">
                {tracks.map(t => (
                  <div key={t.track_id}
                    className="flex items-center gap-3 p-3 rounded-xl bg-white/[0.03] border border-white/[0.06]">
                    <div className="w-10 h-10 rounded-lg overflow-hidden bg-white/[0.06] flex-shrink-0">
                      {t.tracks?.cover_artwork_url
                        ? <img src={t.tracks.cover_artwork_url} alt="" className="w-full h-full object-cover" />
                        : <div className="w-full h-full flex items-center justify-center"><Music className="w-4 h-4 text-white/20" /></div>}
                    </div>
                    <p className="text-sm text-white truncate flex-1">{t.tracks?.title}</p>
                    <button onClick={() => unhideTrack(t.track_id, t.tracks?.title)}
                      className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full bg-white/[0.06] text-white/60 hover:bg-white/[0.12] hover:text-white transition flex-shrink-0">
                      <Undo2 className="w-3 h-3" />
                      Unhide
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}