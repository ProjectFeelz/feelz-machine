// src/pages/RetailPlayerPage.js
// The venue-facing product. Two things layered on top of the original
// build: (1) a play only counts toward the artist payout pool once 30
// seconds of actual playback has happened, enforced via the audio
// element's real timeupdate position, not a wall-clock timer, so pausing
// doesn't falsely accumulate; (2) ads insert automatically between tracks
// at a shared frequency (set in platform_settings), using the venue's own
// uploaded ads if they have any, otherwise falling back to platform ads,
// unless the venue is on the ad-free premium tier (ads_enabled = false).

import React from 'react';
import { Helmet } from 'react-helmet-async';
import { useNavigate } from 'react-router-dom';
import { Loader, Play, Pause, SkipForward, Music, MapPin, Megaphone, Heart, Bell, Bookmark, MessageCircle, User, LogOut, FileText, Shield, Menu, ChevronRight } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../supabaseClient';
import RetailPlaylistComments from '../components/retail/RetailPlaylistComments';
import InstallPrompt from '../components/InstallPrompt';
import { buildPlayRow, sendPlay, flushQueue } from '../utils/retailPlayQueue';
import useRetailManifest from '../hooks/useRetailManifest';

const QUALIFYING_SECONDS = 30;
const PAYPAL_CLIENT_ID = process.env.REACT_APP_PAYPAL_CLIENT_ID || '';

// Loads the PayPal SDK once, gets a plan created server-side for this
// venue's exact negotiated fee, then renders the subscribe button. On
// approval, links the subscription back to the venue, the webhook
// confirms/corrects the status afterward, this is the fast path so the
// venue doesn't sit staring at a spinner waiting on a webhook round-trip.
function RetailPayPalButton({ venueId, onSubscribed }) {
  const buttonRef = React.useRef(null);
  const [ready, setReady] = React.useState(false);
  const [planId, setPlanId] = React.useState(null);
  const [usdAmount, setUsdAmount] = React.useState(null);
  const [error, setError] = React.useState('');

  React.useEffect(() => {
    if (window.paypal) { setReady(true); return; }
    const existing = document.querySelector('script[src*="paypal.com/sdk"]');
    if (existing) { existing.addEventListener('load', () => setReady(true)); return; }
    const script = document.createElement('script');
    script.src = `https://www.paypal.com/sdk/js?client-id=${PAYPAL_CLIENT_ID}&vault=true&intent=subscription&currency=ZAR`;
    script.async = true;
    script.onload = () => setReady(true);
    script.onerror = () => setError('Could not load PayPal. Try again shortly.');
    document.head.appendChild(script);
  }, []);

  React.useEffect(() => {
    fetch('/.netlify/functions/retail-paypal-subscription', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'get-plan', venueId }),
    })
      .then(r => r.json())
      .then(data => { if (data.planId) { setPlanId(data.planId); setUsdAmount(data.usdAmount); } else setError(data.error || 'Billing not set up yet, contact us.'); })
      .catch(() => setError('Could not reach billing. Try again shortly.'));
  }, [venueId]);

  React.useEffect(() => {
    if (!ready || !planId || !buttonRef.current || !window.paypal) return;
    buttonRef.current.innerHTML = '';
    window.paypal.Buttons({
      style: { shape: 'pill', color: 'white', layout: 'vertical', label: 'subscribe' },
      createSubscription: (data, actions) => actions.subscription.create({ plan_id: planId }),
      onApprove: async (data) => {
        await fetch('/.netlify/functions/retail-paypal-subscription', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'link', venueId, subscriptionId: data.subscriptionID }),
        }).catch(() => {});
        onSubscribed();
      },
      onError: () => setError('Payment failed. Try again.'),
    }).render(buttonRef.current);
  }, [ready, planId, venueId, onSubscribed]);

  if (error) return <p className="text-xs text-red-400 mt-3">{error}</p>;
  if (!planId || !ready) return <div className="flex justify-center mt-4"><Loader className="w-4 h-4 text-white/30 animate-spin" /></div>;
  return (
    <div className="mt-4 max-w-xs mx-auto">
      {usdAmount && (
        <p className="text-xs text-white/40 mb-2 text-center">
          Billed as ${usdAmount} USD/month via PayPal, pay by bank card, no PayPal account needed.
        </p>
      )}
      <div ref={buttonRef} />
    </div>
  );
}


export default function RetailPlayerPage() {
  useRetailManifest();
  const navigate = useNavigate();
  const { user, isAdmin, signOut } = useAuth();
  const [checking, setChecking] = React.useState(true);
  const [venue, setVenue] = React.useState(null);
  const [locations, setLocations] = React.useState([]);
  const [activeLocationId, setActiveLocationId] = React.useState(null);
  const [playlists, setPlaylists] = React.useState([]);
  const [recommended, setRecommended] = React.useState([]);
  const [inboxNotifs, setInboxNotifs] = React.useState([]);
  const [readIds, setReadIds] = React.useState(new Set());
  const [showInbox, setShowInbox] = React.useState(false);
  const [loadingPlaylists, setLoadingPlaylists] = React.useState(false);
  const [selectedPlaylist, setSelectedPlaylist] = React.useState(null);
  const [tracks, setTracks] = React.useState([]);
  const [loadingTracks, setLoadingTracks] = React.useState(false);
  const [currentIndex, setCurrentIndex] = React.useState(0);
  const [isPlaying, setIsPlaying] = React.useState(false);

  const [ads, setAds] = React.useState([]);
  const [adFrequency, setAdFrequency] = React.useState(4);
  const [tracksSinceAd, setTracksSinceAd] = React.useState(0);
  const [mode, setMode] = React.useState('track'); // 'track' | 'ad'
  const [currentAdIndex, setCurrentAdIndex] = React.useState(0);
  const [likedTrackIds, setLikedTrackIds] = React.useState(new Set());
  const [savedPlaylistIds, setSavedPlaylistIds] = React.useState(new Set());
  const [showComments, setShowComments] = React.useState(false);
  const [showAccount, setShowAccount] = React.useState(false);
  const [impact, setImpact] = React.useState(null);
  const [showAdminMenu, setShowAdminMenu] = React.useState(false);

  const audioRef = React.useRef(null);
  const hasLoggedRef = React.useRef(false);
  const [allVenues, setAllVenues] = React.useState([]);
  const [previewVenueId, setPreviewVenueId] = React.useState(null);

  React.useEffect(() => {
    if (!user) { setChecking(false); return; }
    supabase.from('retail_venues').select('*').eq('user_id', user.id).maybeSingle()
      .then(({ data }) => { setVenue(data); setChecking(false); });
  }, [user]);

  // Admin preview: if this account isn't itself a venue, let an admin pick
  // an existing venue to preview through, rather than being locked out
  // entirely, this is genuinely needed for QA and for reviewing playlists
  // the way a real venue would see them.
  React.useEffect(() => {
    if (!isAdmin || venue) return;
    supabase.from('retail_venues').select('id, business_name').order('business_name')
      .then(({ data }) => setAllVenues(data || []));
  }, [isAdmin, venue]);

  React.useEffect(() => {
    if (!previewVenueId) return;
    supabase.from('retail_venues').select('*').eq('id', previewVenueId).maybeSingle()
      .then(({ data }) => setVenue(data));
  }, [previewVenueId]);

  // True only when an admin is browsing someone else's venue through the
  // picker above, never for a real venue owner. Gates every write so an
  // admin poking around doesn't contaminate real play counts, likes, or
  // ad-revenue numbers, those numbers feed directly into artist payouts.
  const isPreviewMode = isAdmin && !!previewVenueId;

  // Distinct artists on the open playlist, for the "Featuring ..." line.
  // Order preserved so it reads as the playlist does, not alphabetically.
  const distinctArtists = React.useMemo(() => {
    const seen = [];
    tracks.forEach(t => {
      const n = t.artist?.artist_name;
      if (n && !seen.includes(n)) seen.push(n);
    });
    return seen;
  }, [tracks]);
  const featuredArtists = distinctArtists.slice(0, 5);
  const distinctArtistCount = distinctArtists.length;

  const savedPlaylists = React.useMemo(
    () => playlists.filter(p => savedPlaylistIds.has(p.id)),
    [playlists, savedPlaylistIds]
  );

  React.useEffect(() => {
    if (!venue) return;
    supabase.from('retail_venue_locations').select('*').eq('venue_id', venue.id).order('location_name')
      .then(({ data }) => {
        setLocations(data || []);
        if ((data || []).length > 0) setActiveLocationId(data[0].id);
      });
  }, [venue]);

  React.useEffect(() => {
    if (!venue || venue.status !== 'active') return;
    setLoadingPlaylists(true);
    supabase.from('retail_playlists').select('*').eq('is_active', true).order('title')
      .then(({ data }) => { setPlaylists(data || []); setLoadingPlaylists(false); });
  }, [venue]);

  React.useEffect(() => {
    if (!venue || venue.status !== 'active') return;
    supabase.rpc('get_venue_playlist_recommendations')
      .then(({ data, error }) => {
        // This returned 400 on every call for a while and nobody noticed,
        // because the result was read as `data` only. A failed
        // recommendation is not worth interrupting a venue over, but it
        // should not be invisible either.
        if (error) { console.warn('[retail] recommendations failed:', error.message); return; }
        setRecommended(data || []);
      });
  }, [venue]);

  React.useEffect(() => {
    if (!venue || venue.status !== 'active') return;
    Promise.all([
      supabase.from('retail_notifications').select('*, newsletter_posts(slug)').order('created_at', { ascending: false }),
      supabase.from('retail_notification_reads').select('notification_id').eq('venue_id', venue.id),
    ]).then(([{ data: notifs }, { data: reads }]) => {
      setInboxNotifs(notifs || []);
      setReadIds(new Set((reads || []).map(r => r.notification_id)));
    });
  }, [venue]);

  const openInbox = async () => {
    setShowInbox(true);
    const unread = inboxNotifs.filter(n => !readIds.has(n.id));
    if (unread.length === 0 || !venue || isPreviewMode) return;
    await supabase.from('retail_notification_reads')
      .insert(unread.map(n => ({ notification_id: n.id, venue_id: venue.id })));
    setReadIds(prev => new Set([...prev, ...unread.map(n => n.id)]));
  };

  React.useEffect(() => {
    if (!venue || venue.status !== 'active') return;
    supabase.from('platform_settings').select('value').eq('key', 'retail_ad_frequency').maybeSingle()
      .then(({ data }) => setAdFrequency(parseInt(data?.value, 10) || 4));
    if (!venue.ads_enabled) { setAds([]); return; }
    supabase.from('retail_ads').select('*').eq('is_active', true)
      .or(`venue_id.eq.${venue.id},venue_id.is.null`)
      .then(({ data }) => {
        const own = (data || []).filter(a => a.venue_id === venue.id);
        const platformAds = (data || []).filter(a => a.venue_id === null);
        setAds(own.length > 0 ? own : platformAds);
      });
  }, [venue]);

  React.useEffect(() => {
    if (!venue) return;
    supabase.from('retail_venue_likes').select('track_id').eq('venue_id', venue.id)
      .then(({ data }) => setLikedTrackIds(new Set((data || []).map(l => l.track_id))));
  }, [venue]);

  const toggleLike = async (track) => {
    if (!venue || !track || isPreviewMode) return;
    const isLiked = likedTrackIds.has(track.id);
    if (isLiked) {
      await supabase.from('retail_venue_likes').delete().eq('venue_id', venue.id).eq('track_id', track.id);
      setLikedTrackIds(prev => { const next = new Set(prev); next.delete(track.id); return next; });
    } else {
      const { error } = await supabase.from('retail_venue_likes').insert({ venue_id: venue.id, track_id: track.id });
      if (!error) setLikedTrackIds(prev => new Set(prev).add(track.id));
    }
  };

  // What this venue has actually done for artists. Counted from the same
  // play logs the payout is calculated from, so the numbers here and the
  // money artists receive cannot disagree.
  React.useEffect(() => {
    if (!venue || isPreviewMode) return;
    supabase.rpc('get_venue_impact').then(({ data }) => setImpact(data));
  }, [venue, isPreviewMode]);

  React.useEffect(() => {
    if (!venue) return;
    supabase.from('retail_venue_saved_playlists').select('playlist_id').eq('venue_id', venue.id)
      .then(({ data }) => setSavedPlaylistIds(new Set((data || []).map(s => s.playlist_id))));
  }, [venue]);

  // Save is the combined signal here, there is no separate like on a
  // playlist. Saving puts the vibe in the venue's library and is also
  // what feeds get_venue_playlist_recommendations, so recommendations
  // are refetched afterwards, the RPC filters out anything already saved.
  const toggleSave = async (playlist) => {
    if (!venue || !playlist || isPreviewMode) return;
    const isSaved = savedPlaylistIds.has(playlist.id);
    if (isSaved) {
      await supabase.from('retail_venue_saved_playlists')
        .delete().eq('venue_id', venue.id).eq('playlist_id', playlist.id);
      setSavedPlaylistIds(prev => { const next = new Set(prev); next.delete(playlist.id); return next; });
    } else {
      const { error } = await supabase.from('retail_venue_saved_playlists')
        .insert({ venue_id: venue.id, playlist_id: playlist.id });
      if (error) return;
      setSavedPlaylistIds(prev => new Set(prev).add(playlist.id));
    }
    supabase.rpc('get_venue_playlist_recommendations')
      .then(({ data, error }) => {
        if (error) { console.warn('[retail] recommendations failed:', error.message); return; }
        setRecommended(data || []);
      });
  };

  const openPlaylist = async (playlist) => {
    audioRef.current?.pause();
    setIsPlaying(false);
    setMode('track');
    setTracksSinceAd(0);
    setSelectedPlaylist(playlist);
    setLoadingTracks(true);
    setCurrentIndex(0);
    const { data } = await supabase.from('retail_playlist_tracks')
      .select('position, track:tracks(id, title, file_url, cover_artwork_url, artist:artists(artist_name))')
      .eq('playlist_id', playlist.id)
      .order('position');
    setTracks((data || []).map(d => d.track).filter(Boolean));
    setLoadingTracks(false);
  };

  // These rows are what calculate_retail_payout() divides the artist pool
  // by, so a failed insert is an artist being underpaid, not a lost
  // analytics event. It used to be fire and forget with the error
  // swallowed. Now a failure queues the row locally and it is retried,
  // with the id generated up front so a retry of a play that actually
  // landed is discarded rather than counted twice.
  const logPlay = React.useCallback((track, playlist, duration) => {
    if (!venue || !track || isPreviewMode) return;
    const row = buildPlayRow({
      venueId: venue.id,
      locationId: activeLocationId,
      trackId: track.id,
      playlistId: playlist?.id,
      durationPlayed: duration || QUALIFYING_SECONDS,
    });
    sendPlay(supabase, row);
  }, [venue, activeLocationId, isPreviewMode]);

  // Heartbeat. Says the player is open, which is not the same as music
  // playing: a venue can sit paused between sets. get_venue_activity()
  // reads this alongside play logs to tell "idle" apart from "offline",
  // and offline on an active subscription is the churn signal.
  //
  // Written through touch_venue_heartbeat() rather than a direct update,
  // because retail_venues RLS deliberately does not let a venue update its
  // own row. That is what stops a venue changing its own status or
  // ads_enabled, and this narrow function keeps that intact.
  //
  // ONE heartbeat effect only. There were three at one point, all firing
  // the same RPC on different intervals. If you are adding another, you
  // want this one.
  //
  // Skipped in preview so an admin looking at a venue does not make a
  // dormant one look alive.
  React.useEffect(() => {
    if (!venue || venue.status !== 'active' || isPreviewMode) return;
    const beat = () => { supabase.rpc('touch_venue_heartbeat').then(() => {}); };
    beat();
    const interval = setInterval(beat, 3 * 60 * 1000);
    return () => clearInterval(interval);
  }, [venue, isPreviewMode]);

  // Drain anything stranded by an earlier outage: on open, when the
  // browser reports it is back online, and every few minutes while the
  // player is running, since a venue tablet can sit open for days.
  React.useEffect(() => {
    if (!venue || isPreviewMode) return;
    const drain = () => { flushQueue(supabase); };
    drain();
    window.addEventListener('online', drain);
    const interval = setInterval(drain, 5 * 60 * 1000);
    return () => {
      window.removeEventListener('online', drain);
      clearInterval(interval);
    };
  }, [venue, isPreviewMode]);

  const logAdPlay = React.useCallback((ad) => {
    if (!venue || !ad || isPreviewMode) return;
    supabase.from('retail_ad_plays').insert({
      ad_id: ad.id,
      venue_id: venue.id,
      location_id: activeLocationId || null,
    }).then(() => {});
  }, [venue, activeLocationId, isPreviewMode]);

  const currentTrack = tracks[currentIndex];
  const currentAd = ads.length > 0 ? ads[currentAdIndex % ads.length] : null;

  // Drives the actual audio source whenever what should be playing changes,
  // either a new track index or a switch into/out of an ad.
  React.useEffect(() => {
    if (!audioRef.current) return;
    if (mode === 'ad') {
      if (!currentAd) { setMode('track'); return; }
      audioRef.current.src = currentAd.audio_url;
      logAdPlay(currentAd);
      if (isPlaying) audioRef.current.play().catch(() => {});
    } else if (currentTrack) {
      audioRef.current.src = currentTrack.file_url;
      hasLoggedRef.current = false;
      if (isPlaying) audioRef.current.play().catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, currentIndex, currentAdIndex]);

  // The 30-second qualifying check, real playback position, not a timer,
  // so pausing partway through never falsely counts.
  const handleTimeUpdate = () => {
    if (mode !== 'track' || hasLoggedRef.current || !audioRef.current) return;
    if (audioRef.current.currentTime >= QUALIFYING_SECONDS) {
      hasLoggedRef.current = true;
      logPlay(tracks[currentIndex], selectedPlaylist, Math.floor(audioRef.current.currentTime));
    }
  };

  // Shared by "track ended naturally" and "skip button pressed", keeps ad
  // cadence consistent regardless of how a track stopped.
  const advance = () => {
    if (mode === 'ad') {
      goToTrack(currentIndex + 1);
      return;
    }
    const nextCount = tracksSinceAd + 1;
    if (venue?.ads_enabled && ads.length > 0 && nextCount >= adFrequency) {
      setTracksSinceAd(0);
      setCurrentAdIndex(i => i + 1);
      setMode('ad');
    } else {
      setTracksSinceAd(nextCount);
      goToTrack(currentIndex + 1);
    }
  };

  const goToTrack = (index) => {
    if (index >= tracks.length) { setIsPlaying(false); return; }
    setCurrentIndex(index);
    setMode('track');
  };

  // Manual pick from the list, bypasses ad cadence deliberately, since a
  // staff member choosing a specific track shouldn't be interrupted by one.
  const playTrackAt = (index) => {
    setCurrentIndex(index);
    setMode('track');
    setIsPlaying(true);
  };

  const togglePlay = () => {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      audioRef.current.play().catch(() => {});
      setIsPlaying(true);
    }
  };

  if (!user) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center px-6 text-center">
        <p className="text-sm text-white/50">Log in to access your Feelz Retail player.</p>
      </div>
    );
  }

  if (checking) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <Loader className="w-5 h-5 text-white/30 animate-spin" />
      </div>
    );
  }

  if (!venue) {
    if (isAdmin) {
      return (
        <div className="min-h-screen bg-black text-white flex items-center justify-center px-6 text-center">
          <div className="w-full max-w-sm space-y-4">
            <p className="text-sm text-white/50">Your account isn't itself a venue. Preview through an existing one:</p>
            <select
              className="w-full px-3 py-2.5 bg-white/[0.06] rounded-lg text-white text-sm outline-none"
              value={previewVenueId || ''}
              onChange={e => setPreviewVenueId(e.target.value || null)}
            >
              <option value="">Choose a venue…</option>
              {allVenues.map(v => <option key={v.id} value={v.id}>{v.business_name}</option>)}
            </select>
            {allVenues.length === 0 && (
              <p className="text-xs text-white/25">No venues exist yet, add one in Admin → Content → Retail → Venues.</p>
            )}
          </div>
        </div>
      );
    }
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center px-6 text-center">
        <p className="text-sm text-white/50">This account isn't linked to a Feelz Retail venue.</p>
      </div>
    );
  }

  if (venue.status !== 'active') {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center px-6 text-center">
        <div>
          <p className="text-sm text-white/50 max-w-xs">
            {venue.status === 'pending'
              ? 'Set up billing to activate your Feelz Retail player.'
              : 'This account is currently suspended. Contact us if that seems wrong.'}
          </p>
          {venue.status === 'pending' && (
            <RetailPayPalButton venueId={venue.id} onSubscribed={() => setVenue(v => ({ ...v, status: 'active' }))} />
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-white pb-28">
      <Helmet>
        <title>Feelz Retail, {venue.business_name}</title>
        <meta name="robots" content="noindex, nofollow" />
        <link rel="manifest" href="/retail-manifest.json" />
        <link rel="apple-touch-icon" href="/retail-icon-180.png" />
        <meta name="mobile-web-app-capable" content="yes" />
        {/* Kept alongside the standard tag above: older iOS still reads the
            prefixed one, newer browsers warn about it in the console. */}
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-title" content="Feelz Retail" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="theme-color" content="#000000" />
      </Helmet>
      <audio ref={audioRef} onEnded={advance} onTimeUpdate={handleTimeUpdate} />

      <div className="sticky top-0 z-10 backdrop-blur-xl px-4 py-4"
        style={{
          background: 'linear-gradient(135deg, rgba(30,20,60,0.97) 0%, rgba(14,14,18,0.97) 60%)',
          borderBottom: '1px solid rgba(167,139,250,0.18)',
          boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
        }}>
        <div className="flex items-start justify-between">
          <div>
            <p className="text-purple-400 text-xs font-bold tracking-widest uppercase">Feelz Retail</p>
            <h1 className="text-lg font-bold text-white">{venue.business_name}</h1>
          </div>
          <div className="flex items-center space-x-1 flex-shrink-0">
            {/* The referrals link that used to sit here navigated to
                /affiliates, which renders inside AppLayout, so a venue was
                dropped into the main Feelz Machine app with its sidebar.
                Retail is a separate product, so it is gone until there is a
                retail-native referrals view. */}
            <button onClick={() => setShowAccount(true)}
              title="Account" aria-label="Account"
              className="p-2 rounded-full hover:bg-white/[0.06] transition flex-shrink-0">
              <User className="w-4 h-4 text-white/50" />
            </button>
            {/* Admin shortcuts moved off the always-on bar into a menu. Kept,
                not removed: it is the fastest way into a retail admin tab
                without leaving the player. Admin only. */}
            {isAdmin && (
              <button onClick={() => setShowAdminMenu(true)}
                title="Retail admin" aria-label="Retail admin"
                className="p-2 rounded-full hover:bg-white/[0.06] transition flex-shrink-0">
                <Menu className="w-4 h-4 text-purple-300/70" />
              </button>
            )}
            <button onClick={openInbox} title="Updates" aria-label="Updates"
              className="relative p-2 rounded-full hover:bg-white/[0.06] transition flex-shrink-0">
              <Bell className="w-4 h-4 text-white/50" />
              {inboxNotifs.some(n => !readIds.has(n.id)) && (
                <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-purple-400" />
              )}
            </button>
          </div>
        </div>
        {locations.length > 1 && (
          <div className="flex items-center space-x-2 mt-2 overflow-x-auto">
            <MapPin className="w-3.5 h-3.5 text-white/30 flex-shrink-0" />
            {locations.map(loc => (
              <button key={loc.id} onClick={() => setActiveLocationId(loc.id)}
                className={`text-xs px-2.5 py-1 rounded-full whitespace-nowrap transition ${activeLocationId === loc.id ? 'bg-purple-500 text-white' : 'bg-white/[0.06] text-white/40'}`}>
                {loc.location_name}
              </button>
            ))}
          </div>
        )}
      </div>

      {isPreviewMode && (
        <div className="bg-yellow-500/10 border-b border-yellow-500/20 px-4 py-2 flex items-center justify-between">
          <p className="text-xs text-yellow-400">Admin preview, nothing you do here is recorded against this venue's real numbers.</p>
          <button onClick={() => { setPreviewVenueId(null); setVenue(null); }} className="text-xs font-bold text-yellow-300 hover:text-yellow-200 flex-shrink-0 ml-3">Exit</button>
        </div>
      )}

      {/* Admin menu. Was a full-width bar of eight chips under the header,
          which ate vertical space on a venue tablet and is only ever used by
          an admin. Same destinations, now behind the burger. */}
      {showAdminMenu && isAdmin && (
        <div className="fixed inset-0 z-30 bg-black/80 backdrop-blur-sm flex items-end sm:items-center justify-center"
          onClick={() => setShowAdminMenu(false)}>
          <div className="w-full sm:max-w-sm rounded-t-2xl sm:rounded-2xl overflow-hidden max-h-[80vh] overflow-y-auto"
            style={{
              background: 'linear-gradient(180deg, rgba(30,20,60,0.98) 0%, rgba(14,14,18,0.99) 100%)',
              border: '1px solid rgba(167,139,250,0.22)',
            }}
            onClick={e => e.stopPropagation()}>
            <div className="px-5 py-4 border-b border-white/[0.06]">
              <p className="text-[10px] uppercase tracking-[0.2em] text-purple-400 font-bold">Feelz Retail</p>
              <p className="text-base font-bold text-white">Admin</p>
            </div>
            <div className="p-2">
              {[
                ['Playlists', 'playlists'], ['Venue invites', 'venues'], ['Ads', 'ads'],
                ['Pitches', 'pitches'], ['Payouts', 'payouts'], ['Analytics', 'analytics'],
                ['Pricing', 'pricing'], ['Auto-Compile', 'autocompile'], ['Retail staff', 'staff'],
              ].map(([label, tab]) => (
                <button key={tab}
                  onClick={() => { setShowAdminMenu(false); navigate(`/retail-admin?sub=${tab}`); }}
                  className="w-full flex items-center justify-between gap-3 px-3 py-3 rounded-xl hover:bg-white/[0.05] transition text-left">
                  <span className="text-sm text-white/75">{label}</span>
                  <ChevronRight className="w-3.5 h-3.5 text-white/20 flex-shrink-0" />
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {showInbox && (
        <div className="fixed inset-0 z-30 bg-black/80 backdrop-blur-sm flex items-end sm:items-center justify-center" onClick={() => setShowInbox(false)}>
          <div className="bg-black border border-white/10 rounded-t-2xl sm:rounded-2xl w-full sm:max-w-md max-h-[70vh] overflow-y-auto p-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-bold text-white">Updates</p>
              <button onClick={() => setShowInbox(false)} className="text-white/30 hover:text-white text-xs">Close</button>
            </div>
            {inboxNotifs.length === 0 ? (
              <p className="text-xs text-white/30 text-center py-8">Nothing yet.</p>
            ) : (
              <div className="space-y-2">
                {inboxNotifs.map(n => (
                  <div key={n.id} className="rounded-xl bg-white/[0.04] border border-white/[0.06] p-3">
                    <p className="text-sm font-semibold text-white">{n.title}</p>
                    <p className="text-xs text-white/50 mt-1">{n.body}</p>
                    {n.newsletter_posts?.slug && (
                      <a href={`/newsletter/${n.newsletter_posts.slug}`} target="_blank" rel="noopener noreferrer"
                        className="text-[11px] text-purple-300 font-semibold mt-1.5 inline-block">Read full update &rarr;</a>
                    )}
                    <p className="text-[10px] text-white/25 mt-1.5">{new Date(n.created_at).toLocaleDateString()}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      <div className="px-4 pt-5">
        {!selectedPlaylist ? (
          <>
            {savedPlaylists.length > 0 && (
              <div className="mb-5">
                {/* What playing this music has actually done. A venue sees a monthly
                bill and never sees what it bought: half of it is pooled to the
                artists whose tracks played here. These are counted from the same
                logs the payout uses. */}
            {impact && impact.total_plays > 0 && (
              <div className="mb-6 rounded-2xl border border-purple-400/20 p-4"
                style={{ background: 'linear-gradient(135deg, rgba(167,139,250,0.10) 0%, rgba(30,20,55,0.5) 100%)' }}>
                <p className="text-[10px] uppercase tracking-[0.2em] text-purple-300 font-bold mb-3">
                  Your impact
                </p>
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                  <div>
                    <p className="text-2xl font-black text-white">{impact.artists_supported}</p>
                    <p className="text-[11px] text-white/45 mt-0.5">
                      {impact.artists_supported === 1 ? 'artist supported' : 'artists supported'}
                    </p>
                  </div>
                  <div>
                    <p className="text-2xl font-black text-white">{impact.tracks_played}</p>
                    <p className="text-[11px] text-white/45 mt-0.5">tracks played in here</p>
                  </div>
                  <div>
                    <p className="text-2xl font-black text-white">{impact.hours_played}</p>
                    <p className="text-[11px] text-white/45 mt-0.5">hours of music</p>
                  </div>
                  <div>
                    <p className="text-2xl font-black text-white">{impact.plays_this_month}</p>
                    <p className="text-[11px] text-white/45 mt-0.5">plays this month</p>
                  </div>
                </div>
                {(impact.top_artist || impact.top_playlist) && (
                  <p className="text-[11px] text-white/35 mt-3 pt-3 border-t border-white/[0.06]">
                    {impact.top_artist && <>Most played here: <span className="text-white/70">{impact.top_artist}</span></>}
                    {impact.top_artist && impact.top_playlist && ' · '}
                    {impact.top_playlist && <>Favourite vibe: <span className="text-white/70">{impact.top_playlist}</span></>}
                  </p>
                )}
                <p className="text-[10px] text-white/25 mt-2">
                  Half of what you pay is pooled to the artists whose music plays in your space.
                </p>
              </div>
            )}

            <p className="text-xs text-purple-300 font-bold uppercase tracking-wide mb-2">Your vibes</p>
                <div className="flex space-x-3 overflow-x-auto pb-1">
                  {savedPlaylists.map(pl => (
                    <button key={pl.id} onClick={() => openPlaylist(pl)}
                      className="text-left flex-shrink-0 w-32 group">
                      <div className="w-32 h-32 rounded-xl overflow-hidden mb-2 flex items-center justify-center transition duration-300 group-hover:-translate-y-1"
                        style={{
                          background: 'linear-gradient(135deg, rgba(167,139,250,0.16) 0%, rgba(30,20,55,0.9) 100%)',
                          border: '1px solid rgba(167,139,250,0.24)',
                          boxShadow: '0 6px 24px rgba(0,0,0,0.45)',
                        }}>
                        {pl.cover_image_url
                          ? <img src={pl.cover_image_url} alt="" className="w-full h-full object-cover" />
                          : <Music className="w-8 h-8 text-purple-300/25" />}
                      </div>
                      <p className="text-sm font-bold text-white truncate">{pl.title}</p>
                      {pl.mood && <p className="text-xs text-white/40 mt-0.5 truncate">{pl.mood}</p>}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {recommended.length > 0 && (
              <div className="mb-5">
                <p className="text-xs text-purple-300 font-bold uppercase tracking-wide mb-2">Recommended for you</p>
                <div className="flex space-x-2 overflow-x-auto pb-1">
                  {recommended.map(r => (
                    <button key={r.playlist_id}
                      onClick={() => openPlaylist(playlists.find(p => p.id === r.playlist_id) || { id: r.playlist_id, title: r.title, mood: r.mood })}
                      className="rounded-xl bg-purple-500/10 border border-purple-500/30 px-4 py-3 text-left flex-shrink-0 min-w-[140px] hover:bg-purple-500/15 transition">
                      <p className="text-sm font-bold text-white">{r.title}</p>
                      {r.mood && <p className="text-xs text-white/40 mt-0.5">{r.mood}</p>}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <p className="text-xs text-white/40 mb-3">Pick a vibe to play.</p>
            {loadingPlaylists ? (
              <div className="flex justify-center py-12"><Loader className="w-5 h-5 text-white/30 animate-spin" /></div>
            ) : playlists.length === 0 ? (
              <p className="text-sm text-white/30 text-center py-12">No playlists available yet.</p>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                {playlists.map(pl => (
                  <button key={pl.id} onClick={() => openPlaylist(pl)}
                    className="text-left group">
                    <div className="w-full aspect-square rounded-xl overflow-hidden mb-3 flex items-center justify-center transition duration-300 group-hover:-translate-y-1"
                      style={{
                        background: 'linear-gradient(135deg, rgba(167,139,250,0.14) 0%, rgba(30,20,55,0.9) 100%)',
                        border: '1px solid rgba(167,139,250,0.20)',
                        boxShadow: '0 6px 24px rgba(0,0,0,0.45)',
                      }}>
                      {pl.cover_image_url
                        ? <img src={pl.cover_image_url} alt="" className="w-full h-full object-cover group-hover:scale-105 transition duration-300" />
                        : <Music className="w-9 h-9 text-purple-300/25" />}
                    </div>
                    <p className="text-sm font-bold text-white truncate">{pl.title}</p>
                    {pl.mood && <p className="text-xs text-white/40 mt-0.5 truncate">{pl.mood}</p>}
                  </button>
                ))}
              </div>
            )}
          </>
        ) : (
          <>
            <button onClick={() => { setSelectedPlaylist(null); setIsPlaying(false); audioRef.current?.pause(); }}
              className="text-xs text-white/40 mb-4 hover:text-white/70 transition">&larr; All playlists</button>

            {/* Album-style header: cover, mood, description, featured artists */}
            <div className="flex flex-col sm:flex-row sm:items-end gap-5 mb-6">
              <div className="w-40 h-40 rounded-xl overflow-hidden flex-shrink-0 flex items-center justify-center"
                style={{
                  background: 'linear-gradient(135deg, rgba(167,139,250,0.16) 0%, rgba(30,20,55,0.9) 100%)',
                  border: '1px solid rgba(167,139,250,0.22)',
                  boxShadow: '0 8px 28px rgba(0,0,0,0.5)',
                }}>
                {selectedPlaylist.cover_image_url
                  ? <img src={selectedPlaylist.cover_image_url} alt="" className="w-full h-full object-cover" />
                  : <Music className="w-10 h-10 text-purple-300/25" />}
              </div>

              <div className="min-w-0 flex-1">
                <p className="text-[10px] uppercase tracking-[0.2em] text-purple-400 font-bold mb-1.5">Playlist</p>
                <h2 className="text-3xl font-black text-white leading-tight mb-2">{selectedPlaylist.title}</h2>
                {selectedPlaylist.description && (
                  <p className="text-sm text-white/45 mb-3 max-w-xl leading-relaxed">{selectedPlaylist.description}</p>
                )}
                <div className="flex items-center flex-wrap gap-2 mb-3">
                  {selectedPlaylist.mood && (
                    <span className="text-[11px] font-semibold px-2.5 py-1 rounded-full bg-purple-500/15 text-purple-200 border border-purple-400/20">
                      {selectedPlaylist.mood}
                    </span>
                  )}
                  <span className="text-xs text-white/30">{tracks.length} {tracks.length === 1 ? 'track' : 'tracks'}</span>
                </div>
                {featuredArtists.length > 0 && (
                  <p className="text-xs text-white/35">
                    Featuring <span className="text-white/65">{featuredArtists.join(', ')}</span>
                    {distinctArtistCount > featuredArtists.length && (
                      <span className="text-white/30"> and {distinctArtistCount - featuredArtists.length} more</span>
                    )}
                  </p>
                )}

                <div className="flex items-center gap-2 mt-4">
                  <button onClick={() => toggleSave(selectedPlaylist)}
                    className={`flex items-center gap-1.5 text-xs font-semibold px-3.5 py-2 rounded-full transition ${
                      savedPlaylistIds.has(selectedPlaylist.id)
                        ? 'bg-purple-500 text-white'
                        : 'bg-white/[0.06] text-white/60 border border-white/[0.08] hover:bg-white/[0.1]'
                    }`}>
                    <Bookmark className="w-3.5 h-3.5"
                      fill={savedPlaylistIds.has(selectedPlaylist.id) ? 'currentColor' : 'none'} />
                    {savedPlaylistIds.has(selectedPlaylist.id) ? 'Saved' : 'Save this vibe'}
                  </button>
                  <button onClick={() => setShowComments(true)}
                    className="flex items-center gap-1.5 text-xs font-semibold px-3.5 py-2 rounded-full bg-white/[0.06] text-white/60 border border-white/[0.08] hover:bg-white/[0.1] transition">
                    <MessageCircle className="w-3.5 h-3.5" />
                    Comments
                  </button>
                </div>
              </div>
            </div>
            {loadingTracks ? (
              <div className="flex justify-center py-12"><Loader className="w-5 h-5 text-white/30 animate-spin" /></div>
            ) : tracks.length === 0 ? (
              <p className="text-sm text-white/30 text-center py-12">No tracks in this playlist yet.</p>
            ) : (
              <div className="space-y-1.5">
                {tracks.map((t, i) => (
                  <div key={t.id} onClick={() => playTrackAt(i)}
                    className={`flex items-center space-x-3 p-2.5 rounded-xl cursor-pointer transition ${mode === 'track' && i === currentIndex ? 'bg-white/[0.08]' : 'hover:bg-white/[0.04]'}`}>
                    <div className="w-10 h-10 rounded-lg overflow-hidden bg-white/[0.06] flex-shrink-0">
                      {t.cover_artwork_url
                        ? <img src={t.cover_artwork_url} alt="" className="w-full h-full object-cover" />
                        : <div className="w-full h-full flex items-center justify-center"><Music className="w-4 h-4 text-white/20" /></div>}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm truncate ${mode === 'track' && i === currentIndex ? 'text-purple-400 font-semibold' : 'text-white'}`}>{t.title}</p>
                      <p className="text-xs text-white/40 truncate">{t.artist?.artist_name}</p>
                    </div>
                    {mode === 'track' && i === currentIndex && isPlaying && <Play className="w-3.5 h-3.5 text-purple-400 flex-shrink-0" fill="currentColor" />}
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {/* Retail used to get this from AppLayout. Moving retail out of
          AppLayout to remove the main app sidebar took the install prompt
          with it, so it is rendered here explicitly. Its own name, icon,
          manifest and dismiss key: dismissing on feelzmachine.com must not
          hide it for a venue, and vice versa. Sits above the player bar. */}
      <InstallPrompt
        appName="Feelz Retail"
        iconSrc="/retail-icon-192.png"
        storageKey="retail_install_prompt_dismissed"
        blurb="Install it on the venue tablet so it opens like an app and keeps playing."
        positionClass="fixed bottom-28 left-4 right-4 z-40"
      />

      {/* Account. There was no way to see who you were signed in as or to
          sign out without leaving Retail for the main app, which defeats
          keeping the two separate. Everything here stays in Retail. */}
      {showAccount && (
        <div className="fixed inset-0 z-30 bg-black/80 backdrop-blur-sm flex items-end sm:items-center justify-center"
          onClick={() => setShowAccount(false)}>
          <div className="w-full sm:max-w-sm rounded-t-2xl sm:rounded-2xl overflow-hidden"
            style={{
              background: 'linear-gradient(180deg, rgba(30,20,60,0.98) 0%, rgba(14,14,18,0.99) 100%)',
              border: '1px solid rgba(167,139,250,0.22)',
            }}
            onClick={e => e.stopPropagation()}>

            <div className="p-5 border-b border-white/[0.06]">
              <p className="text-[10px] uppercase tracking-[0.2em] text-purple-400 font-bold mb-1.5">Signed in as</p>
              <p className="text-lg font-bold text-white leading-tight">{venue.business_name}</p>
              <p className="text-xs text-white/40 mt-1">{venue.contact_email || user?.email}</p>
              <div className="flex items-center gap-2 mt-3">
                <span className="text-[11px] font-semibold px-2.5 py-1 rounded-full bg-purple-500/15 text-purple-200 border border-purple-400/20">
                  {venue.status === 'active' ? 'Active' : venue.status}
                </span>
                {locations.length > 0 && (
                  <span className="text-[11px] text-white/30">
                    {locations.length} {locations.length === 1 ? 'location' : 'locations'}
                  </span>
                )}
              </div>
            </div>

            <div className="p-2">
              <button onClick={() => { setShowAccount(false); navigate('/retail/terms'); }}
                className="w-full flex items-center gap-3 px-3 py-3 rounded-xl hover:bg-white/[0.05] transition text-left">
                <FileText className="w-4 h-4 text-white/35 flex-shrink-0" />
                <span className="text-sm text-white/70">Terms of service</span>
              </button>
              <button onClick={() => { setShowAccount(false); navigate('/retail/privacy'); }}
                className="w-full flex items-center gap-3 px-3 py-3 rounded-xl hover:bg-white/[0.05] transition text-left">
                <Shield className="w-4 h-4 text-white/35 flex-shrink-0" />
                <span className="text-sm text-white/70">Privacy notice</span>
              </button>
              {/* Back to the retail landing page, not the main app hub. */}
              <button onClick={async () => { await signOut(); navigate('/retail'); }}
                className="w-full flex items-center gap-3 px-3 py-3 rounded-xl hover:bg-red-500/10 transition text-left">
                <LogOut className="w-4 h-4 text-red-400/70 flex-shrink-0" />
                <span className="text-sm text-red-300/80">Sign out</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {showComments && selectedPlaylist && (
        <RetailPlaylistComments
          playlist={selectedPlaylist}
          venue={venue}
          isPreviewMode={isPreviewMode}
          onClose={() => setShowComments(false)}
        />
      )}

      {(currentTrack || mode === 'ad') && (
        <div className="fixed bottom-0 left-0 right-0 backdrop-blur-xl px-4 py-3"
          style={{
            background: 'linear-gradient(180deg, rgba(30,20,60,0.97) 0%, rgba(14,14,18,0.98) 100%)',
            borderTop: '1px solid rgba(167,139,250,0.20)',
            boxShadow: '0 -8px 32px rgba(0,0,0,0.6)',
          }}>
          <div className="flex items-center space-x-3">
            {mode === 'ad' ? (
              <>
                <div className="w-10 h-10 rounded-lg bg-purple-500/20 flex items-center justify-center flex-shrink-0">
                  <Megaphone className="w-4 h-4 text-purple-300" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-white truncate">Advert</p>
                  <p className="text-xs text-white/40 truncate">{currentAd?.advertiser_name}</p>
                </div>
              </>
            ) : (
              <>
                <div className="w-10 h-10 rounded-lg overflow-hidden bg-white/[0.06] flex-shrink-0">
                  {currentTrack?.cover_artwork_url
                    ? <img src={currentTrack.cover_artwork_url} alt="" className="w-full h-full object-cover" />
                    : <div className="w-full h-full flex items-center justify-center"><Music className="w-4 h-4 text-white/20" /></div>}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-white truncate">{currentTrack?.title}</p>
                  <p className="text-xs text-white/40 truncate">{currentTrack?.artist?.artist_name}</p>
                </div>
                <button onClick={() => toggleLike(currentTrack)} className="p-2 rounded-full hover:bg-white/[0.08] transition flex-shrink-0">
                  <Heart className={`w-4 h-4 ${likedTrackIds.has(currentTrack?.id) ? 'text-purple-400' : 'text-white/30'}`}
                    fill={likedTrackIds.has(currentTrack?.id) ? 'currentColor' : 'none'} />
                </button>
              </>
            )}
            <button onClick={togglePlay} className="p-2.5 rounded-full bg-purple-500 hover:bg-purple-400 transition flex-shrink-0">
              {isPlaying ? <Pause className="w-4 h-4 text-white" fill="white" /> : <Play className="w-4 h-4 text-white" fill="white" />}
            </button>
            <button onClick={advance} className="p-2 rounded-full hover:bg-white/[0.08] transition flex-shrink-0">
              <SkipForward className="w-4 h-4 text-white/50" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}