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
import { Loader, Play, Pause, SkipForward, Music, MapPin, Megaphone, Heart, Bell, DollarSign } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../supabaseClient';

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
  const navigate = useNavigate();
  const { user, isAdmin } = useAuth();
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
      .then(({ data }) => setRecommended(data || []));
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

  const logPlay = React.useCallback((track, playlist, duration) => {
    if (!venue || !track || isPreviewMode) return;
    supabase.from('retail_play_logs').insert({
      venue_id: venue.id,
      location_id: activeLocationId || null,
      track_id: track.id,
      playlist_id: playlist?.id || null,
      duration_played: duration || QUALIFYING_SECONDS,
    }).then(() => {});
  }, [venue, activeLocationId, isPreviewMode]);

  const logAdPlay = React.useCallback((ad) => {
    if (!venue || !ad || isPreviewMode) return;
    supabase.from('retail_ad_plays').insert({
      ad_id: ad.id,
      venue_id: venue.id,
      location_id: activeLocationId || null,
    }).then(() => {});
  }, [venue, activeLocationId]);

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
            <button onClick={() => navigate('/affiliates')} className="p-2 rounded-full hover:bg-white/[0.06] transition flex-shrink-0">
              <DollarSign className="w-4 h-4 text-white/50" />
            </button>
            <button onClick={openInbox} className="relative p-2 rounded-full hover:bg-white/[0.06] transition flex-shrink-0">
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

      {/* Admin bar. Only admins see this. Gives direct access to every retail
          admin tab from inside the player itself, so you're not bouncing back
          out to the main admin panel to change a playlist and back in again. */}
      {isAdmin && (
        <div className="px-4 py-2.5"
          style={{
            background: 'linear-gradient(90deg, rgba(167,139,250,0.10) 0%, rgba(167,139,250,0.03) 100%)',
            borderBottom: '1px solid rgba(167,139,250,0.15)',
          }}>
          <div className="flex items-center space-x-2 overflow-x-auto">
            <span className="text-[10px] uppercase tracking-widest text-purple-300/70 font-bold flex-shrink-0 mr-1">Admin</span>
            {[
              ['Playlists', 'playlists'], ['Venues', 'venues'], ['Ads', 'ads'],
              ['Pitches', 'pitches'], ['Payouts', 'payouts'], ['Analytics', 'analytics'],
              ['Pricing', 'pricing'], ['Auto-Compile', 'autocompile'],
            ].map(([label, tab]) => (
              <button key={tab}
                onClick={() => navigate(`/admin/content?tab=retail&sub=${tab}`)}
                className="text-[11px] font-semibold px-2.5 py-1 rounded-lg bg-purple-500/10 text-purple-200/70 border border-purple-400/15 hover:bg-purple-500/25 hover:text-white hover:border-purple-400/40 transition whitespace-nowrap flex-shrink-0">
                {label}
              </button>
            ))}
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