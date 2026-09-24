import { Helmet } from 'react-helmet-async';
import React, { useState, useEffect } from 'react';
import TrackActionSheet from '../components/TrackActionSheet';
import { downloadTrack, downloadErrorMessage } from '../utils/downloadTrack';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import useGoBack from '../hooks/useGoBack';
import { supabase } from '../supabaseClient';
import { useAuth } from '../contexts/AuthContext';
import { usePlayer } from '../contexts/PlayerContext';
import { usePaidPlayLimit } from '../hooks/usePaidPlayLimit';
import PaidPlayGate from '../components/PaidPlayGate';
import { TrackCreditsInline, AlbumCredits } from '../components/TrackCredits';
import TrackVersions from '../components/TrackVersions';
import {
  ArrowLeft, Play, Pause, Music, Loader, Download,
  Heart, Share2, Check, ListMusic, ShoppingCart, X, MoreHorizontal
} from 'lucide-react';
import ShareCard from '../components/ShareCard';
import { showReceipt } from '../components/PurchaseReceipt';
import PriceBreakdown, { useQuote } from '../components/PriceBreakdown';
import { CommentButton } from '../components/TrackComments';

const PAYPAL_CLIENT_ID = process.env.REACT_APP_PAYPAL_CLIENT_ID;
const BASE_URL = 'https://www.feelzmachine.com';

function formatDuration(s) {
  if (!s) return '';
  return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
}

function formatNumber(n) {
  if (!n) return '0';
  if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
  if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
  return n.toString();
}

export default function AlbumDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  // Back that works on a cold deep link. navigate(-1) does nothing when
  // this page IS the first history entry, which is every shared link and
  // every tapped push notification. See src/hooks/useGoBack.js.
  const goBack = useGoBack('/browse');
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  const { playTrack, currentTrack, isPlaying, togglePlay, showNotice } = usePlayer();
  const { checkPlayLimit, recordPlay, resetPlayCount } = usePaidPlayLimit();
  const [limitedTrack, setLimitedTrack] = useState(null);
  const [album, setAlbum] = useState(null);
  const [tracks, setTracks] = useState([]);
  const [artist, setArtist] = useState(null);
  const [loading, setLoading] = useState(true);
  const [likedTracks, setLikedTracks] = useState({});
  const [copied, setCopied] = useState(false);
  const [showShareCard, setShowShareCard] = useState(false);
  const [downloading, setDownloading] = useState(null);
  const [downloadingAll, setDownloadingAll] = useState(false);
  const [showAddToPlaylist, setShowAddToPlaylist] = useState(null);
  const [playlists, setPlaylists] = useState([]);
  const [addingTo, setAddingTo] = useState(null);
  const [addedTo, setAddedTo] = useState({});
  const [showNewPlaylist, setShowNewPlaylist] = useState(false);
  const [newPlaylistName, setNewPlaylistName] = useState('');
  const [creatingPlaylist, setCreatingPlaylist] = useState(false);
  const [actionSheetTrack, setActionSheetTrack] = useState(null);
  const [purchaseTarget, setPurchaseTarget] = useState(null);
  const [paypalReady, setPaypalReady] = useState(false);
  const [purchasing, setPurchasing] = useState(false);
  const [purchaseSuccess, setPurchaseSuccess] = useState(false);
  const [purchaseError, setPurchaseError] = useState('');

  // purchaseTarget is either the whole album or one track off it, so the quote
  // follows whichever is open rather than assuming the album price.
  //
  // Its shape is { type: 'album' | 'track', track?, price, label }, read off
  // the three setPurchaseTarget calls below rather than assumed, because the
  // album id is NOT on this object and a guess at `.id` would have quoted
  // undefined and silently shown nothing.
  const { quote: buyQuote } = useQuote(
    !purchaseTarget ? null
      : purchaseTarget.type === 'album'
        ? (album?.id ? { albumId: album.id } : null)
        : (purchaseTarget.track?.id ? { trackId: purchaseTarget.track.id } : null)
  );
  const [purchasedTracks, setPurchasedTracks] = useState({});

  const checkExistingPurchases = async () => {
    if (!user || !tracks.length) return;
    const trackIds = tracks.map(t => t.id);
    const { data } = await supabase.from('downloads').select('track_id')
      .eq('user_id', user.id).in('track_id', trackIds);
    const map = {};
    (data || []).forEach(d => { map[d.track_id] = true; });
    setPurchasedTracks(map);
  };

  useEffect(() => {
    if (tracks.length > 0 && user) checkExistingPurchases();
  }, [tracks, user]);

  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === 'visible' && user && tracks.length > 0) {
        checkExistingPurchases();
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [user, tracks]);

  useEffect(() => { fetchAlbum(); }, [id]);
  useEffect(() => { if (user && showAddToPlaylist) fetchPlaylists(); }, [showAddToPlaylist, user]);

  // Which of these tracks the signed in listener has liked. Its own effect, so
  // it runs again when auth resolves after a refresh rather than once, too
  // early, inside fetchAlbum. Scoped to the tracks on this page instead of
  // reading the listener's entire like history, which was the whole table for
  // anyone who has been here a while.
  useEffect(() => {
    if (!user || tracks.length === 0) { setLikedTracks({}); return; }
    let cancelled = false;
    (async () => {
      const { data: likes, error } = await supabase
        .from('track_likes')
        .select('track_id')
        .eq('user_id', user.id)
        .in('track_id', tracks.map(t => t.id));
      if (error) { console.error('[Album] likes read failed:', error.code, error.message); return; }
      if (cancelled) return;
      const likeMap = {};
      (likes || []).forEach(l => { likeMap[l.track_id] = true; });
      setLikedTracks(likeMap);
    })();
    return () => { cancelled = true; };
  }, [user?.id, tracks]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!purchaseTarget) return;
    if (!purchaseTarget.price || purchaseTarget.price <= 0) return;
    setPaypalReady(false); setPurchaseError('');
    const existing = document.getElementById('paypal-sdk-album');
    if (existing) existing.remove();
    const script = document.createElement('script');
    script.id = 'paypal-sdk-album';
    script.src = `https://www.paypal.com/sdk/js?client-id=${PAYPAL_CLIENT_ID}&currency=USD`;
    script.async = true;
    script.onload = () => setPaypalReady(true);
    script.onerror = () => setPurchaseError('Failed to load PayPal.');
    document.head.appendChild(script);
  }, [purchaseTarget?.label]);

  useEffect(() => {
    if (!paypalReady || !purchaseTarget || !window.paypal) return;
    if (!purchaseTarget.price || purchaseTarget.price <= 0) return;
    const container = document.getElementById('paypal-album-container');
    if (!container) return;
    container.innerHTML = '';
    window.paypal.Buttons({
      style: { layout: 'vertical', color: 'gold', shape: 'rect', label: 'pay' },
      createOrder: async () => {
        setPurchasing(true); setPurchaseError('');
        try {
          const res = await fetch('/.netlify/functions/paypal-order', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              action: 'create',
              // An album purchase names the album; a track purchase names the
              // track. It used to send `trackId: null` for a whole album,
              // which the server refused outright, so buying an album has
              // never worked. The price is resolved server-side either way;
              // `amount` is sent for the logs only and is ignored there.
              ...(purchaseTarget.type === 'album'
                ? { albumId: album.id }
                : { trackId: purchaseTarget.track?.id || null }),
              amount: purchaseTarget.price,
              trackTitle: purchaseTarget.label,
              artistName: artist?.artist_name,
            }),
          });
          const { orderId, error } = await res.json();
          if (error || !orderId) throw new Error(error || 'Failed to create order');
          return orderId;
        } catch (err) { setPurchaseError(err.message); setPurchasing(false); throw err; }
      },
      onApprove: async (data) => {
        try {
          const res = await fetch('/.netlify/functions/paypal-order', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'capture', orderId: data.orderID, userId: user?.id }),
          });
          const captureData = await res.json();
          if (!captureData.success) throw new Error('Payment capture failed');

          // `success` only means PayPal took the money. It does NOT mean the
          // sale was recorded or the download granted. When the recording step
          // silently did nothing, this showed a green tick to somebody who had
          // just paid for a file they were then refused, which is exactly what
          // happened on the artist page. paypal-order.js reports `recorded`;
          // believe it.
          if (captureData.recorded === false) {
            setPurchasing(false);
            setPurchaseError(
              'Your payment went through, but we could not attach it to your account. '
              + 'Nothing further will be charged. Contact support with this reference: '
              + (captureData.captureId || 'unknown')
            );
            return;
          }
          // purchases + downloads recorded server-side in paypal-order.js
          setPurchaseSuccess(true); setPurchasing(false);
          // A tick that vanishes in 1.5 seconds is what left Sani unsure he
          // had bought anything. The sheet stays until it is dismissed, and
          // the server has also written a notification he can come back to.
          showReceipt({
            kind: 'purchase',
            title: purchaseTarget.label,
            subtitle: artist?.artist_name,
            amount: captureData.amount ?? (purchaseTarget.price),
          });
          setTimeout(async () => {
            if (purchaseTarget.type === 'album') { await triggerAlbumDownload(); }
            else { await triggerDownload(purchaseTarget.track); }
            setPurchaseTarget(null); setPurchaseSuccess(false);
          }, 1500);
        } catch (err) { setPurchaseError(err.message); setPurchasing(false); }
      },
      onError: () => { setPurchaseError('Payment failed. Please try again.'); setPurchasing(false); },
      onCancel: () => setPurchasing(false),
    }).render('#paypal-album-container');
  }, [paypalReady, purchaseTarget?.label]);

  const fetchAlbum = async () => {
    setLoading(true);
    try {
      const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
      let albumData = null;
      if (isUUID) {
        const { data } = await supabase.from('albums')
          .select('*, artists(id, artist_name, slug, profile_image_url, is_verified)')
          .eq('id', id).maybeSingle();
        albumData = data;
      }
      if (!albumData) {
        const { data: bySlug } = await supabase.from('albums')
          .select('*, artists(id, artist_name, slug, profile_image_url, is_verified)')
          .eq('slug', id).maybeSingle();
        albumData = bySlug;
      }
      if (!albumData) { navigate('/browse'); return; }
      setAlbum(albumData);
      setArtist(albumData.artists);
      const { data: trackData } = await supabase.from('tracks').select('*')
        .eq('album_id', albumData.id).eq('is_published', true)
        .order('track_number', { ascending: true });
      setTracks(trackData || []);
      // The likes read used to be here, inside a fetch that only runs on [id].
      // On a refresh the session has not been restored yet, `user` is null,
      // the branch is skipped and no later effect reads it, so every heart on
      // the album comes back grey on a page the listener has liked tracks on.
      // It now has its own effect below, keyed on the user and the track list.
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  const fetchPlaylists = async () => {
    const { data } = await supabase.from('playlists').select('id, name').eq('user_id', user.id).order('name');
    setPlaylists(data || []);
  };

  const handlePlay = (track) => {
    if (currentTrack?.id === track.id) { togglePlay(); return; }
    const { allowed } = checkPlayLimit(track);
    if (!allowed) { setLimitedTrack(track); return; }
    recordPlay(track.id);
    playTrack(
      { ...track, artist_name: artist?.artist_name },
      tracks.map(t => ({ ...t, artist_name: artist?.artist_name }))
    );
  };

  const handlePlayAll = () => {
    if (tracks.length === 0) return;
    playTrack(
      { ...tracks[0], artist_name: artist?.artist_name },
      tracks.map(t => ({ ...t, artist_name: artist?.artist_name }))
    );
  };

  // Autoplay, but only when asked for with ?play=1, which is what the Home
  // Hero picker writes when "start playing when opened" is ticked. Deliberately
  // opt-in: someone browsing to an album page has not asked for audio, and a
  // page that hijacks the speakers on arrival is the kind of thing people
  // remember. Fires once per mount, and skips if this album's first track is
  // already what's loaded, so navigating back does not restart it.
  const autoPlayedRef = React.useRef(false);
  React.useEffect(() => {
    if (autoPlayedRef.current) return;
    if (searchParams.get('play') !== '1') return;
    if (!tracks.length) return;                      // wait for the tracks to load
    autoPlayedRef.current = true;
    if (currentTrack?.id === tracks[0].id) return;   // already playing it
    handlePlayAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tracks, searchParams]);

  const handleLike = async (track, e) => {
    e.stopPropagation();
    if (!user) { navigate('/login'); return; }
    const isLiked = likedTracks[track.id];
    setLikedTracks(prev => ({ ...prev, [track.id]: !isLiked }));
    if (isLiked) {
      const { error } = await supabase.from('track_likes')
        .delete().eq('track_id', track.id).eq('user_id', user.id);
      if (error) {
        console.error('[Album] unlike failed:', error.code, error.message);
        setLikedTracks(prev => ({ ...prev, [track.id]: true }));   // put the heart back
      }
    } else {
      // artist_id used to be sent with this insert. track_likes has no such
      // column, so PostgREST refused the whole row with PGRST204 and, because
      // nothing here read the error, the heart filled in and the like was
      // never written. Every other like in the app inserts these two columns
      // and only these two.
      const { error } = await supabase.from('track_likes')
        .insert({ track_id: track.id, user_id: user.id });
      // 23505 is the unique (track_id, user_id) index: already liked. Fine.
      if (error && error.code !== '23505') {
        console.error('[Album] like failed:', error.code, error.message);
        setLikedTracks(prev => ({ ...prev, [track.id]: false }));
      }
    }
  };

  const handleShare = () => {
    setShowShareCard(true);
  };

  // The album-price fallback is what puts a "$1.43" on a track that has no
  // price of its own, the album's price split across its tracks.
  //
  // A track marked NOT downloadable is excluded now. It used to get a price
  // and a buy button from this fallback, the server refused the order because
  // the track is not downloadable, and the buyer saw "payment failed" on a
  // button that should never have been there.
  const getTrackPrice = (track) => {
    if (track.is_downloadable === false) return 0;
    if (track.download_price > 0) return track.download_price;
    if (album?.price > 0 && tracks.length > 0) return parseFloat((album.price / tracks.length).toFixed(2));
    return 0;
  };

  const triggerDownload = async (track) => {
    setDownloading(track.id);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error('Not authenticated');
      await downloadTrack(track.id, track.title, session.access_token);
    } catch (err) {
      console.error('Download failed:', err.message);
      showNotice(downloadErrorMessage(err));
    }
    setDownloading(null);
  };

  const triggerAlbumDownload = async () => {
    setDownloadingAll(true);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) { setDownloadingAll(false); return; }
    for (const track of tracks) {
      if (track.file_url) {
        try {
          await downloadTrack(track.id, track.title, session.access_token);
          await new Promise(r => setTimeout(r, 800));
        } catch (err) { console.error(`Failed to download ${track.title}:`, err.message); }
      }
    }
    setDownloadingAll(false);
  };

  const handleTrackDownload = (track, e) => {
    e.stopPropagation();
    if (!user) { navigate('/login'); return; }
    const price = getTrackPrice(track);
    if (price > 0) { setPurchaseTarget({ type: 'track', track, price, label: track.title }); }
    else { triggerDownload(track); }
  };

  const handleAlbumDownload = () => {
    if (!user) { navigate('/login'); return; }
    const price = album?.price || 0;
    if (price > 0) { setPurchaseTarget({ type: 'album', price, label: `${album.title} (Full Album)` }); }
    else { triggerAlbumDownload(); }
  };

  const handleAddToPlaylist = async (playlistId, trackId) => {
    setAddingTo(playlistId);
    const { data: existing } = await supabase.from('playlist_tracks').select('id').eq('playlist_id', playlistId).eq('track_id', trackId).maybeSingle();
    if (!existing) {
      const { data: last } = await supabase.from('playlist_tracks').select('position').eq('playlist_id', playlistId).order('position', { ascending: false }).limit(1).maybeSingle();
      await supabase.from('playlist_tracks').insert({ playlist_id: playlistId, track_id: trackId, position: (last?.position ?? -1) + 1 });
    }
    setAddedTo(prev => ({ ...prev, [`${playlistId}-${trackId}`]: true }));
    setAddingTo(null);
    setTimeout(() => setAddedTo(prev => { const n = { ...prev }; delete n[`${playlistId}-${trackId}`]; return n; }), 2000);
  };

  const handleCreatePlaylist = async (trackId) => {
    const name = newPlaylistName.trim();
    if (!name || creatingPlaylist) return;
    setCreatingPlaylist(true);
    const { data, error } = await supabase.from('playlists').insert({ name, user_id: user.id }).select('id, name').single();
    if (!error && data) {
      setPlaylists(prev => [...prev, data]);
      await handleAddToPlaylist(data.id, trackId);
    }
    setNewPlaylistName(''); setShowNewPlaylist(false); setCreatingPlaylist(false);
  };

  const totalDuration   = tracks.reduce((sum, t) => sum + (t.duration || 0), 0);
  const totalMins       = Math.round(totalDuration / 60);
  const allDownloadable = tracks.some(t => t.is_downloadable);
  const albumPrice      = album?.price || 0;

  if (loading) return (
    <div className="min-h-screen bg-black flex items-center justify-center">
      <Loader className="w-6 h-6 animate-spin text-white/30" />
    </div>
  );

  if (!album) return null;

  const pageUrl   = `${BASE_URL}/album/${id}`;
  const ogImage   = album.cover_artwork_url || `${BASE_URL}/og-default.png`;
  const pageTitle = `${album.title} by ${artist?.artist_name} · Feelz Machine`;
  const pageDesc  = album.description
    ? `${album.description.slice(0, 120)}${album.description.length > 120 ? '...' : ''}`
    : `Stream ${album.title} by ${artist?.artist_name} on Feelz Machine.`;

  return (
    <div className="min-h-screen bg-black text-white pb-32">

      {/* ── Dynamic head tags ── */}
      <Helmet>
        <link rel="icon" href="/favicon.ico" />
        <link rel="apple-touch-icon" href="/logo192.png" />
        <title>{pageTitle}</title>
        <meta name="description" content={pageDesc} />
        <link rel="canonical" href={pageUrl} />
        <meta property="og:title" content={pageTitle} />
        <meta property="og:description" content={pageDesc} />
        <meta property="og:url" content={pageUrl} />
        <meta property="og:image" content={ogImage} />
        <meta property="og:type" content="music.album" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={pageTitle} />
        <meta name="twitter:description" content={pageDesc} />
        <meta name="twitter:image" content={ogImage} />
      </Helmet>

      {/* Header */}
      <div className="relative">
        <div className="relative h-64 overflow-hidden">
          {album.cover_artwork_url
            ? <img src={album.cover_artwork_url} alt="" className="w-full h-full object-cover blur-xl scale-110 opacity-40" />
            : <div className="w-full h-full bg-gradient-to-br from-white/5 to-white/[0.02]" />}
          <div className="absolute inset-0 bg-gradient-to-b from-transparent via-black/60 to-black" />
        </div>
        <div className="absolute top-0 left-0 right-0 flex items-center justify-between p-5">
          <button onClick={() => goBack()} className="w-9 h-9 flex items-center justify-center rounded-full bg-black/40 backdrop-blur-md">
            <ArrowLeft className="w-5 h-5 text-white" />
          </button>
          <button onClick={handleShare} className="w-9 h-9 flex items-center justify-center rounded-full bg-black/40 backdrop-blur-md">
            {copied ? <Check className="w-4 h-4 text-green-400" /> : <Share2 className="w-4 h-4 text-white" />}
          </button>
          <div className="w-9 h-9" />
        </div>
        <div className="absolute bottom-0 left-0 right-0 px-5 pb-5 flex items-end space-x-4">
          <div className="w-28 h-28 rounded-xl overflow-hidden bg-white/[0.06] flex-shrink-0 shadow-2xl">
            {album.cover_artwork_url
              ? <img src={album.cover_artwork_url} alt={album.title} className="w-full h-full object-cover" />
              : <div className="w-full h-full flex items-center justify-center"><Music className="w-10 h-10 text-white/20" /></div>}
          </div>
          <div className="flex-1 min-w-0 pb-1">
            <p className="text-[10px] uppercase tracking-widest text-white/40 font-medium mb-1">
              {album.release_type?.toUpperCase() || 'ALBUM'}
            </p>
            <h1 className="text-2xl font-bold text-white leading-tight truncate">{album.title}</h1>
            <button onClick={() => artist?.slug && navigate(`/artist/${artist.slug}`)}
              className="text-sm text-white/60 hover:text-white transition mt-0.5">
              {artist?.artist_name}
            </button>
            <p className="text-xs text-white/25 mt-1">
              {tracks.length} track{tracks.length !== 1 ? 's' : ''}
              {totalMins > 0 && ` · ${totalMins} min`}
              {album.release_date && ` · ${new Date(album.release_date).getFullYear()}`}
            </p>
          </div>
        </div>
      </div>

      {/* Action bar */}
      <div className="px-5 py-4 flex items-center space-x-3 flex-wrap gap-y-2">
        <button onClick={handlePlayAll}
          className="flex items-center space-x-2 px-6 py-3 bg-white text-black rounded-full font-semibold text-sm hover:bg-white/90 active:scale-95 transition">
          <Play className="w-4 h-4" fill="black" />
          <span>Play All</span>
        </button>
        {allDownloadable && (
          <button onClick={handleAlbumDownload} disabled={downloadingAll}
            className="flex items-center space-x-2 px-5 py-3 rounded-full font-semibold text-sm transition active:scale-95 disabled:opacity-50"
            style={{ backgroundColor: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.8)' }}>
            {downloadingAll
              ? <Loader className="w-4 h-4 animate-spin" />
              : albumPrice > 0 ? <ShoppingCart className="w-4 h-4" /> : <Download className="w-4 h-4" />}
            <span>
              {downloadingAll ? 'Downloading...' : albumPrice > 0 ? `Buy Album · $${albumPrice.toFixed(2)}` : 'Download All'}
            </span>
          </button>
        )}
        {album.description && (
          <p className="text-xs text-white/30 w-full mt-1 line-clamp-2">{album.description}</p>
        )}
      </div>

      {/* Who made this record, up here, where the track page puts it, and in
          the same shape: one row of pills, not a stack of cards.

          It used to render a full Credits card per track that had any. On an
          album with three collaborations that was three heavy boxes above the
          music, each repeating what the tracklist below already says on the
          row itself ("ft. Epsilon Beats"). Same fact, twice, in the bulkier
          of the two places. */}
      <AlbumCredits trackIds={tracks.map(t => t.id)} />

      {/* Tracks */}
      <div className="px-4">
        {tracks.length === 0 ? (
          <div className="text-center py-16">
            <Music className="w-10 h-10 mx-auto text-white/10 mb-3" />
            <p className="text-white/30 text-sm">No tracks published yet</p>
          </div>
        ) : tracks.map((track, i) => {
          const isActive = currentTrack?.id === track.id;
          const isTrackPlaying = isActive && isPlaying;
          const trackPrice = getTrackPrice(track);
          return (
            <div key={track.id} className="relative">
              <div className={`flex items-center space-x-3 px-2 py-3 rounded-xl transition ${isActive ? 'bg-white/[0.06]' : 'hover:bg-white/[0.03]'}`}>
                <div className="w-6 flex items-center justify-center flex-shrink-0">
                  {isActive ? (
                    isTrackPlaying ? (
                      <div className="flex items-end space-x-0.5 h-4">
                        <div className="w-0.5 bg-white rounded-full animate-pulse" style={{ height: '100%' }} />
                        <div className="w-0.5 bg-white rounded-full animate-pulse" style={{ height: '60%', animationDelay: '0.15s' }} />
                        <div className="w-0.5 bg-white rounded-full animate-pulse" style={{ height: '80%', animationDelay: '0.3s' }} />
                      </div>
                    ) : <Pause className="w-3.5 h-3.5 text-white" />
                  ) : (
                    <span className="text-xs text-white/25">{track.track_number || i + 1}</span>
                  )}
                </div>
                <button onClick={() => handlePlay(track)} className="flex-1 min-w-0 text-left">
                  <p className={`text-sm font-medium truncate ${isActive ? 'text-white' : 'text-white/80'}`}>{track.title}</p>
                  {/* ON A PHONE THIS LINE IS THE PLAY COUNT AND NOTHING ELSE.
                      The explicit tag, the duration and the credits wrapped
                      onto two and three lines on a 360px screen and squashed
                      the whole row — and every one of them is already in the
                      three dot menu and on the track page. The play count
                      stays because it is the one number people scan a
                      tracklist for. Everything comes back from `sm` up, where
                      there is room for it on one line. */}
                  <div className="flex items-center space-x-2 mt-0.5">
                    {track.is_explicit && (
                      <span className="hidden sm:inline text-[9px] font-bold px-1 py-0.5 bg-white/10 text-white/40 rounded">E</span>
                    )}
                    <span className="text-xs text-white/30">{formatNumber(track.stream_count || 0)} plays</span>
                    {track.duration && (
                      <span className="hidden sm:inline text-xs text-white/20">{formatDuration(track.duration)}</span>
                    )}
                    <span className="hidden sm:inline-flex">
                      <TrackCreditsInline trackId={track.id} />
                    </span>
                  </div>
                </button>
                {/* FOUR CONTROLS AND A TITLE DO NOT FIT ON A PHONE.
                    Like, comment, add-to-playlist and a price button are about
                    150px that cannot shrink, against a 360px screen, so the
                    title got about eight characters and every row read
                    "Against Th...". The price stays visible, because that is
                    the one people are looking for; the other three fold into
                    the three dot menu, which already has Like, Comments and
                    Add to Playlist in it. They come back inline from `sm` up,
                    where there is room. */}
                <div className="flex items-center space-x-1 flex-shrink-0">
                  <button onClick={(e) => handleLike(track, e)}
                    className="hidden sm:flex w-8 h-8 items-center justify-center rounded-lg transition active:scale-90">
                    <Heart className="w-4 h-4" fill={likedTracks[track.id] ? '#ef4444' : 'none'} color={likedTracks[track.id] ? '#ef4444' : 'rgba(255,255,255,0.25)'} />
                  </button>
                  {/* Comments, per track, not per album. The same thread the
                      track page, For You and the three dot menu open. */}
                  <div className="hidden sm:block">
                    <CommentButton
                      track={{ ...track, artist_name: artist?.artist_name }}
                      user={user}
                      routePrefix="track"
                      variant="badge"
                      iconClassName="w-4 h-4"
                      className="w-8 h-8 flex items-center justify-center rounded-lg transition active:scale-90 relative"
                    />
                  </div>
                  <button onClick={(e) => { e.stopPropagation(); setShowAddToPlaylist(showAddToPlaylist === track.id ? null : track.id); }}
                    className="hidden sm:flex w-8 h-8 items-center justify-center rounded-lg transition active:scale-90">
                    <ListMusic className="w-4 h-4 text-white/25 hover:text-white/60 transition" />
                  </button>
                  {/* Phone only: everything above, in one button. */}
                  <button onClick={(e) => { e.stopPropagation(); setActionSheetTrack(track); }}
                    aria-label="More"
                    className="sm:hidden w-8 h-8 flex items-center justify-center rounded-lg transition active:scale-90">
                    <MoreHorizontal className="w-4 h-4 text-white/30" />
                  </button>
                  {track.is_downloadable && (
                    purchasedTracks[track.id] ? (
                      <button onClick={(e) => { e.stopPropagation(); triggerDownload(track); }} disabled={downloading === track.id}
                        className="flex items-center space-x-1 px-2.5 py-1.5 rounded-lg transition active:scale-95 disabled:opacity-30"
                        style={{ backgroundColor: 'rgba(255,255,255,0.06)' }}>
                        {downloading === track.id
                          ? <Loader className="w-3.5 h-3.5 animate-spin text-white/40" />
                          : <Download className="w-3.5 h-3.5 text-white/50" />}
                        <span className="text-[11px] font-semibold text-white/60">Download</span>
                      </button>
                    ) : (
                      <button onClick={(e) => handleTrackDownload(track, e)} disabled={downloading === track.id}
                        className="flex items-center space-x-1 px-2.5 py-1.5 rounded-lg transition active:scale-95 disabled:opacity-30"
                        style={{ backgroundColor: 'rgba(255,255,255,0.06)' }}>
                        {downloading === track.id
                          ? <Loader className="w-3.5 h-3.5 animate-spin text-white/40" />
                          : trackPrice > 0 ? <ShoppingCart className="w-3.5 h-3.5 text-white/50" /> : <Download className="w-3.5 h-3.5 text-white/50" />}
                        {trackPrice > 0 && <span className="text-[11px] font-semibold text-white/60">${trackPrice.toFixed(2)}</span>}
                      </button>
                    )
                  )}
                </div>
              </div>
              <TrackVersions track={track} albumPrice={albumPrice}
                onPlayVersion={(version) => playTrack(
                  { ...version, artist_name: artist?.artist_name },
                  tracks.map(t => ({ ...t, artist_name: artist?.artist_name }))
                )}
                onPurchaseRequired={(t) => {
                  const price = getTrackPrice(t);
                  if (price > 0) setPurchaseTarget({ type: 'track', track: t, price, label: t.title });
                }} />
              {showAddToPlaylist === track.id && (
                <div className="absolute right-4 z-50 w-64 bg-zinc-900 border border-white/[0.08] rounded-xl shadow-2xl overflow-hidden"
                  style={{ top: '100%', marginTop: '4px' }}>
                  <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.06]">
                    <p className="text-xs font-semibold text-white/60">Add to Playlist</p>
                    <button onClick={() => { setShowAddToPlaylist(null); setShowNewPlaylist(false); setNewPlaylistName(''); }}>
                      <X className="w-4 h-4 text-white/30" />
                    </button>
                  </div>
                  {showNewPlaylist ? (
                    <div className="flex items-center space-x-2 px-3 py-2 border-b border-white/[0.05]">
                      <input autoFocus type="text" value={newPlaylistName}
                        onChange={e => setNewPlaylistName(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter') handleCreatePlaylist(track.id);
                          if (e.key === 'Escape') { setShowNewPlaylist(false); setNewPlaylistName(''); }
                        }}
                        placeholder="Playlist name"
                        className="flex-1 bg-white/[0.06] text-white text-xs rounded-lg px-2.5 py-1.5 outline-none placeholder:text-white/25 border border-white/[0.08] focus:border-white/20"
                        maxLength={60} />
                      <button onClick={() => handleCreatePlaylist(track.id)}
                        disabled={!newPlaylistName.trim() || creatingPlaylist}
                        className="px-2.5 py-1.5 rounded-lg text-xs font-semibold text-black bg-white disabled:opacity-40 flex-shrink-0">
                        {creatingPlaylist ? <Loader className="w-3 h-3 animate-spin" /> : 'Create'}
                      </button>
                    </div>
                  ) : (
                    <button onClick={() => setShowNewPlaylist(true)}
                      className="w-full flex items-center space-x-2 px-4 py-2.5 hover:bg-white/[0.04] transition text-left border-b border-white/[0.05]">
                      <span className="text-xs text-white/50">+ New playlist</span>
                    </button>
                  )}
                  {playlists.length === 0 && !showNewPlaylist ? (
                    <div className="px-4 py-3"><p className="text-xs text-white/30">No playlists yet, create one above</p></div>
                  ) : playlists.map(pl => {
                    const key = `${pl.id}-${track.id}`;
                    return (
                      <button key={pl.id} onClick={() => handleAddToPlaylist(pl.id, track.id)} disabled={addingTo === pl.id}
                        className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-white/[0.04] transition text-left">
                        <span className="text-sm text-white/70 truncate">{pl.name}</span>
                        {addedTo[key] && <Check className="w-3.5 h-3.5 text-green-400 flex-shrink-0" />}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Credits moved OFF the bottom of the page.
          They used to render here, after the whole track list: one card per
          track, every one headed just "Credits", with nothing saying which
          track it belonged to. On a two-track album that is two identical
          cards stacked at the very bottom, you could see that somebody had a
          50% split without being able to tell of what.
          They are now near the top, under the action bar, in the same place
          the track detail page puts Featuring, and each one names its track.
          See the block above. */}

      <PaidPlayGate track={limitedTrack} artist={artist} onClose={() => setLimitedTrack(null)}
        onPurchaseComplete={(t) => {
          resetPlayCount(t.id);
          playTrack(
            { ...t, artist_name: artist?.artist_name },
            tracks.map(tr => ({ ...tr, artist_name: artist?.artist_name }))
          );
          setLimitedTrack(null);
        }} />

      {purchaseTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ backgroundColor: 'rgba(0,0,0,0.85)' }}
          onClick={() => { if (!purchasing) { setPurchaseTarget(null); setPurchaseError(''); } }}>
          <div className="w-full max-w-sm rounded-2xl p-6 space-y-4 overflow-y-auto"
            style={{ backgroundColor: '#0a0a0a', border: '1px solid rgba(255,255,255,0.1)', maxHeight: '90vh' }}
            onClick={(e) => e.stopPropagation()}>
            {purchaseSuccess ? (
              <div className="text-center py-4">
                <div className="w-14 h-14 rounded-full bg-white/10 flex items-center justify-center mx-auto mb-3">
                  <Check className="w-7 h-7 text-white" />
                </div>
                <p className="font-semibold text-white">Purchase Complete!</p>
                <p className="text-sm mt-1 text-white/40">Starting download{purchaseTarget.type === 'album' ? 's' : ''}...</p>
              </div>
            ) : (
              <>
                <div className="flex items-center space-x-3">
                  <div className="w-12 h-12 rounded-lg overflow-hidden flex-shrink-0 bg-white/10">
                    {(purchaseTarget.track?.cover_artwork_url || album.cover_artwork_url)
                      ? <img src={purchaseTarget.track?.cover_artwork_url || album.cover_artwork_url} alt="" className="w-full h-full object-cover" />
                      : <div className="w-full h-full flex items-center justify-center"><Music className="w-5 h-5 text-white/30" /></div>}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold truncate text-white">{purchaseTarget.label}</p>
                    <p className="text-sm text-white/50">{artist?.artist_name}</p>
                    {purchaseTarget.type === 'album' && (
                      <p className="text-xs text-white/30 mt-0.5">{tracks.length} tracks included</p>
                    )}
                  </div>
                  <p className="text-xl font-bold flex-shrink-0 text-white">${purchaseTarget.price.toFixed(2)}</p>
                </div>
                <div className="rounded-xl p-3 text-center" style={{ backgroundColor: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}>
                  <p className="text-xs text-white/40">
                    {purchaseTarget.type === 'album'
                      ? 'All tracks delivered as high-quality MP3 downloads after payment'
                      : 'High-quality MP3 download delivered instantly after payment'}
                  </p>
                </div>
                {purchaseError && <p className="text-xs text-red-400 text-center">{purchaseError}</p>}
                {!paypalReady && !purchaseError && <div className="flex justify-center py-3"><Loader className="w-5 h-5 animate-spin text-white/30" /></div>}
                <PriceBreakdown quote={buyQuote} sellerName={artist?.artist_name} />
                <div id="paypal-album-container" style={{ backgroundColor: '#fff', borderRadius: '8px', padding: '4px' }} />
                <button onClick={() => { setPurchaseTarget(null); setPurchaseError(''); }}
                  className="w-full py-2.5 rounded-xl text-sm text-white/30 hover:text-white/50 transition">
                  Cancel
                </button>
              </>
            )}
          </div>
        </div>
      )}

      <TrackActionSheet track={actionSheetTrack} artist={artist} onClose={() => setActionSheetTrack(null)} />
      {showShareCard && (
        <ShareCard
          track={{ title: album.title, artist_name: artist?.artist_name, cover_artwork_url: album.cover_artwork_url }}
          shareUrl={album?.short_code
            ? `https://www.feelzmachine.com/a/${album.short_code}`
            : `https://www.feelzmachine.com/album/${id}`}
          onClose={() => setShowShareCard(false)}
        />
      )}
    </div>
  );
}