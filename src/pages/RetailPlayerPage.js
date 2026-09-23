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
import { Loader, Play, Pause, SkipForward, MapPin, Megaphone, Bell, User, LogOut, FileText, Shield, Menu, ChevronRight, TrendingUp } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../supabaseClient';
import { resolveStreamLater } from '../utils/streamUrl';
import RetailPlaylistComments from '../components/retail/RetailPlaylistComments';
import RetailDeckView from '../components/retail/RetailDeckView';
import RetailRecordSleeve from '../components/retail/RetailRecordSleeve';
import RetailGlass from '../components/retail/RetailGlass';
import { R, pageBg } from '../components/retail/retailTheme';
import InstallPrompt from '../components/InstallPrompt';
import RetailReferrals from '../components/retail/RetailReferrals';
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
    // USD, not ZAR. The plan this button subscribes to is created in USD by
    // retail-paypal-subscription.js, deliberately, because ZAR billing plans
    // did not work on this PayPal account. Loading the SDK under a different
    // currency to the plan is a mismatch PayPal is entitled to reject, and the
    // ZAR figure is a display figure only. The line under the button already
    // tells the venue what it is charged in dollars.
    script.src = `https://www.paypal.com/sdk/js?client-id=${PAYPAL_CLIENT_ID}&vault=true&intent=subscription&currency=USD`;
    script.async = true;
    script.onload = () => setReady(true);
    script.onerror = () => setError('Could not load PayPal. Try again shortly.');
    document.head.appendChild(script);
  }, []);

  React.useEffect(() => {
    // retail-paypal-subscription requires a session now: it had none, held
    // the service role key, and would activate any venue the caller named.
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      return fetch('/.netlify/functions/retail-paypal-subscription', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session?.access_token || ''}`,
        },
        body: JSON.stringify({ action: 'get-plan', venueId }),
      });
    })()
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
        const { data: { session: linkSession } } = await supabase.auth.getSession();
        // The response was thrown away and onSubscribed() called regardless, so
        // a link that came back 402 subscription_not_paid, or failed outright -
        // still showed the venue a working, subscribed player that the server
        // had not switched on. Read it.
        try {
          const res = await fetch('/.netlify/functions/retail-paypal-subscription', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${linkSession?.access_token || ''}`,
            },
            body: JSON.stringify({ action: 'link', venueId, subscriptionId: data.subscriptionID }),
          });
          const linked = await res.json().catch(() => ({}));
          if (!res.ok || !linked.success) {
            setError(
              linked.error === 'subscription_not_paid'
                ? 'PayPal has approved this but the first payment has not settled yet. '
                  + 'Your player switches on by itself as soon as it does, usually within a few minutes.'
                : 'Payment went through but we could not activate this venue. Contact us and we will sort it out.'
            );
            return;
          }
          // success with status APPROVED means PayPal has the approval but
          // not the first payment. The server leaves the venue pending until
          // the webhook confirms it, so switching the player on here showed an
          // empty player. Only a genuinely ACTIVE subscription unlocks it.
          if (linked.status !== 'ACTIVE') {
            setError('Approved. Your player switches on by itself as soon as PayPal confirms the first payment, '
              + 'usually within a few minutes. Refresh this page then.');
            return;
          }
        } catch {
          setError('Payment went through but we could not reach the server to activate the venue. Contact us.');
          return;
        }
        onSubscribed();
      },
      onError: (err) => {
        console.error('[retail] PayPal button error:', err);
        setError('PayPal could not complete that. Nothing was charged. Refresh the page to try again.');
      },
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
  // 'deck'  , the jukebox, one vibe at a time, previewing itself
  // 'record', that vibe opened up as a record out of its sleeve
  const [view, setView] = React.useState('deck');
  const [tracks, setTracks] = React.useState([]);
  const [loadingTracks, setLoadingTracks] = React.useState(false);
  const [currentIndex, setCurrentIndex] = React.useState(0);
  const [isPlaying, setIsPlaying] = React.useState(false);

  // Bumped when playback of the ALREADY-SELECTED source is requested again -
  // pressing play after a pause, or repeat-one. It is no longer load-bearing
  // for starting a new track: the transport effect keys on isPlaying and the
  // source effect keys on the URL, so forgetting to bump it can no longer
  // stop a song from playing. See the two effects below.
  const [playToken, setPlayToken] = React.useState(0);

  // The browser refused to start audio without a tap. Real on a browser tab,
  // rare in the desktop app, and worth saying out loud: silently flipping the
  // button back to Play is what made this look like a broken player rather
  // than a browser rule.
  const [needsGesture, setNeedsGesture] = React.useState(false);

  const [shuffle, setShuffle] = React.useState(false);
  const [repeat, setRepeat]   = React.useState('none'); // 'none' | 'one' | 'all'

  // Where back came from, and what shuffle has already used. Refs rather than
  // state: nothing renders from them and they must not trigger re-renders
  // mid-playback.
  const historyRef = React.useRef([]);
  const playedRef  = React.useRef(new Set());

  const [ads, setAds] = React.useState([]);
  const [adFrequency, setAdFrequency] = React.useState(4);
  const [tracksSinceAd, setTracksSinceAd] = React.useState(0);
  const [mode, setMode] = React.useState('track'); // 'track' | 'ad'
  const [currentAdIndex, setCurrentAdIndex] = React.useState(0);
  const [likedTrackIds, setLikedTrackIds] = React.useState(new Set());
  const [savedPlaylistIds, setSavedPlaylistIds] = React.useState(new Set());
  // Vibes this venue has turned down. Held here rather than in the deck
  // because the deck is unmounted and remounted every time the venue opens a
  // record and comes back, and a decision that lives in a component's state
  // lasts exactly as long as that component does, which is the bug.
  const [passedPlaylistIds, setPassedPlaylistIds] = React.useState(new Set());
  // Both decision sets have come back from the database. The deck waits for
  // this before it seeds itself, otherwise a fast playlist query and a slow
  // passes query would put already-rejected vibes back on the screen.
  const [decisionsLoaded, setDecisionsLoaded] = React.useState(false);
  const [showComments, setShowComments] = React.useState(false);
  const [showAccount, setShowAccount] = React.useState(false);
  const [showReferrals, setShowReferrals] = React.useState(false);
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

  // The deck offers what this venue has not decided about yet, but it is
  // SEEDED ONCE rather than recomputed as they swipe.
  //
  // The obvious version of this is a useMemo over saved and passed. It is
  // wrong, and wrong in a way that would look like a new bug: the deck advances
  // its own index when a card flies out, so if the list it is reading also
  // loses that card at the same moment, everything shifts up by one and the
  // venue skips a vibe on every single decision. So the list is fixed at the
  // moment the screen loads, and the decisions made during that session play
  // out in the deck's own index. The next load picks up the new state.
  const [deckPlaylists, setDeckPlaylists] = React.useState([]);
  const deckSeeded = React.useRef(false);

  React.useEffect(() => {
    if (!playlists.length || !decisionsLoaded || deckSeeded.current) return;
    deckSeeded.current = true;
    setDeckPlaylists(playlists.filter(
      p => !savedPlaylistIds.has(p.id) && !passedPlaylistIds.has(p.id)
    ));
    // Seeded from whatever was true at that moment; the sets deliberately are
    // not dependencies, so later swipes cannot re-run this.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playlists, decisionsLoaded]);

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

  // ── Favourites ─────────────────────────────────────────────────────────
  //
  // The heart here is the SAME favourite as the heart in the main app: a row
  // in track_likes for the signed-in person. It used to write only
  // retail_venue_likes, which nothing outside retail reads, and it returned
  // early in admin preview, so in the place it was most often tested it did
  // nothing at all while still showing a filled heart.
  //
  // retail_venue_likes is still written alongside, because the venue's
  // recommendations score from it. That write is the venue's, so it is
  // skipped in preview; the favourite itself is the person's own and works
  // everywhere.
  const trackIdsKey = React.useMemo(
    () => tracks.map(t => t?.id).filter(Boolean).sort().join(','),
    [tracks]
  );

  React.useEffect(() => {
    if (!user?.id || !trackIdsKey) { setLikedTrackIds(new Set()); return; }
    let cancelled = false;
    supabase.from('track_likes').select('track_id')
      .eq('user_id', user.id)
      .in('track_id', trackIdsKey.split(','))
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) { console.error('[retail] favourites read failed:', error.code, error.message); return; }
        setLikedTrackIds(new Set((data || []).map(l => l.track_id)));
      });
    return () => { cancelled = true; };
  }, [user?.id, trackIdsKey]);

  const toggleLike = async (track) => {
    if (!user?.id || !track?.id) return;
    const isLiked = likedTrackIds.has(track.id);

    // Optimistic, and put back if the database says no.
    const apply = (liked) => setLikedTrackIds(prev => {
      const next = new Set(prev);
      if (liked) next.add(track.id); else next.delete(track.id);
      return next;
    });
    apply(!isLiked);

    const { error } = isLiked
      ? await supabase.from('track_likes').delete().eq('track_id', track.id).eq('user_id', user.id)
      // artist_id is not a column on track_likes. Sending it made PostgREST
      // refuse the row with PGRST204, so every venue favourite here was lost
      // on refresh and every one of them is a 400 in the console.
      : await supabase.from('track_likes').insert({ track_id: track.id, user_id: user.id });

    // 23505 is a like that already exists, which is the state we wanted.
    if (error && error.code !== '23505') {
      console.error('[retail] favourite not saved:', error.code, error.message);
      apply(isLiked);
      setSaveNotice('Could not update your favourites. Try again.');
      return;
    }

    if (venue && !isPreviewMode) {
      const venueWrite = isLiked
        ? supabase.from('retail_venue_likes').delete().eq('venue_id', venue.id).eq('track_id', track.id)
        : supabase.from('retail_venue_likes').insert({ venue_id: venue.id, track_id: track.id });
      venueWrite.then(({ error: vErr }) => {
        if (vErr && vErr.code !== '23505') console.warn('[retail] venue like not recorded:', vErr.code, vErr.message);
      });
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
    Promise.all([
      supabase.from('retail_venue_saved_playlists').select('playlist_id').eq('venue_id', venue.id),
      supabase.from('retail_venue_passed_playlists').select('playlist_id').eq('venue_id', venue.id),
    ]).then(([saved, passed]) => {
      setSavedPlaylistIds(new Set((saved.data || []).map(r => r.playlist_id)));
      // Not fatal: a venue whose passes cannot be read gets the whole deck
      // again, which is the old behaviour rather than a broken screen.
      if (passed.error) {
        console.warn('[retail] passes unavailable:', passed.error.code, passed.error.message);
      } else {
        setPassedPlaylistIds(new Set((passed.data || []).map(r => r.playlist_id)));
      }
      setDecisionsLoaded(true);
    });
  }, [venue]);

  // Swiping left, or tapping the ✕. Written down, so a refresh does not put
  // the same vibe back in front of them.
  const passPlaylist = async (playlist) => {
    if (!venue || !playlist) return;
    setPassedPlaylistIds(prev => new Set(prev).add(playlist.id));   // instant, optimistic
    if (isPreviewMode) return;                                       // an admin preview writes nothing
    const { error } = await supabase.from('retail_venue_passed_playlists')
      .insert({ venue_id: venue.id, playlist_id: playlist.id });
    // 23505 is the unique index doing its job on a double tap, not an error.
    if (error && error.code !== '23505') {
      console.error('[retail] could not record the pass:', error.code, error.message);
    }
  };

  // "Start again" on the end-of-deck screen. Clears the passes so the whole
  // catalogue comes back, the one way out of having turned everything down.
  const resetPasses = async () => {
    if (!venue) return;
    setPassedPlaylistIds(new Set());
    // Re-seed the deck immediately: "start again" has to put cards back on the
    // screen now, not on the next page load.
    setDeckPlaylists(playlists.filter(p => !savedPlaylistIds.has(p.id)));
    if (isPreviewMode) return;
    const { error } = await supabase.from('retail_venue_passed_playlists')
      .delete().eq('venue_id', venue.id);
    if (error) console.error('[retail] could not clear passes:', error.code, error.message);
  };

  // Save is the combined signal here, there is no separate like on a
  // playlist. Saving puts the vibe in the venue's library and is also
  // what feeds get_venue_playlist_recommendations, so recommendations
  // are refetched afterwards, the RPC filters out anything already saved.
  // Saving a vibe.
  //
  // WHY THIS APPEARED TO WORK ON THE DECK AND NOT ON THE RECORD
  //
  // It was failing in both places. On the deck you could not tell, because
  // commit('right') animates the card away whether or not the write lands -
  // so the gesture always LOOKED like it worked. On the record page the only
  // feedback is the button turning into "Saved", and that only happens if the
  // state update runs. The old code did `if (error) return;` and swallowed the
  // error entirely: no console line, no message, nothing.
  //
  // Two changes. The write is now idempotent, because a row that already
  // exists is not a failure, it is the desired end state, and a unique
  // violation on (venue_id, playlist_id) was being treated as an error and
  // silently dropping the save. And anything that really does fail now says
  // so, on the screen and in the console, instead of pretending.
  const [saveNotice, setSaveNotice] = React.useState('');
  React.useEffect(() => {
    if (!saveNotice) return;
    const t = setTimeout(() => setSaveNotice(''), 4000);
    return () => clearTimeout(t);
  }, [saveNotice]);

  // Returns true when the change was written, false when it was refused or
  // skipped, so a caller can react only to a change that actually happened.
  const toggleSave = async (playlist) => {
    if (!venue || !playlist?.id) return false;
    if (isPreviewMode) {
      // An admin previewing somebody else's venue must not write to it. Said
      // out loud, because a button that does nothing and explains nothing is
      // exactly the bug being fixed here.
      setSaveNotice('Preview mode: nothing is saved to this venue.');
      return false;
    }

    const wasSaved = savedPlaylistIds.has(playlist.id);

    // Optimistic, then rolled back if the write fails, so the button responds
    // to the tap on a slow connection instead of looking dead.
    setSavedPlaylistIds(prev => {
      const next = new Set(prev);
      if (wasSaved) next.delete(playlist.id); else next.add(playlist.id);
      return next;
    });

    let failed = null;

    if (wasSaved) {
      const { error } = await supabase.from('retail_venue_saved_playlists')
        .delete().eq('venue_id', venue.id).eq('playlist_id', playlist.id);
      if (error) failed = error;
    } else {
      const { error } = await supabase.from('retail_venue_saved_playlists')
        .insert({ venue_id: venue.id, playlist_id: playlist.id });
      // 23505 is a unique violation: the row is already there, which is what
      // we wanted. Anything else is real.
      if (error && error.code !== '23505') failed = error;
    }

    if (failed) {
      console.error('[retail] save failed:', failed.code, failed.message);
      setSavedPlaylistIds(prev => {
        const next = new Set(prev);
        if (wasSaved) next.add(playlist.id); else next.delete(playlist.id);
        return next;
      });
      setSaveNotice(
        failed.code === '42501' || /row-level security/i.test(failed.message || '')
          ? 'This venue does not allow saving from this account.'
          : 'Could not save that vibe. Try again.'
      );
      return false;
    }

    supabase.rpc('get_venue_playlist_recommendations')
      .then(({ data, error }) => {
        if (error) { console.warn('[retail] recommendations failed:', error.message); return; }
        setRecommended(data || []);
      });
    return true;
  };

  // Taking a vibe out of Your Vibes.
  //
  // There was no way to do this at all. Saving was one tap and permanent: the
  // saved list had nothing on it but "open", and the deck's keep button only
  // ever adds. So a venue that kept a vibe by mistake, or outgrew one, was
  // stuck with it.
  //
  // The removed vibe goes back into the deck, at the END. The deck is seeded
  // once per load on purpose, so swipes never reshuffle what is on top; left
  // alone, a removed vibe would vanish from both lists until the next reload.
  // Appending keeps it findable this session without moving the card the
  // venue is looking at.
  const removeSaved = async (playlist) => {
    if (!playlist?.id) return;
    const ok = await toggleSave(playlist);
    if (!ok) return;
    setDeckPlaylists(prev =>
      prev.some(p => p.id === playlist.id) ? prev : [...prev, playlist]
    );
    setSaveNotice(`Removed "${playlist.title || 'that vibe'}" from Your Vibes.`);
  };

  // Loading a vibe and OPENING it are now two different things.
  //
  // The deck previews whatever card is on top, the music starts while you are
  // still deciding, which is the whole point of a jukebox, but you are still
  // on the deck, not inside the record. `open` is what moves the screen.
  //
  // selectedPlaylist therefore means "the vibe that is playing", not "the
  // screen you are on". That distinction matters for logPlay: a preview is a
  // real play of a real track in a real room, so it must carry its playlist id
  // like any other, and it does.
  const loadPlaylist = async (playlist, { open }) => {
    if (open) setView('record');
    if (selectedPlaylist?.id === playlist.id && tracks.length > 0) {
      // Already loaded and playing, opening it should not restart the room.
      return;
    }
    audioRef.current?.pause();
    setIsPlaying(false);
    setMode('track');
    setTracksSinceAd(0);
    setSelectedPlaylist(playlist);
    setLoadingTracks(true);
    setCurrentIndex(0);
    const { data } = await supabase.from('retail_playlist_tracks')
      .select('position, track:tracks(id, title, file_url, cover_artwork_url, artist:artists!tracks_artist_id_fkey(artist_name))')
      .eq('playlist_id', playlist.id)
      .order('position');
    const loaded = (data || []).map(d => d.track).filter(Boolean);
    setTracks(loaded);
    setLoadingTracks(false);
    // Picking a vibe is the instruction to play it.
    //
    // This line alone used to do nothing: mode was already 'track' and
    // currentIndex was already 0, so no dependency of the old single playback
    // effect changed and the audio element was never given a src. It works now
    // because setTracks changes the resolved URL, and the URL is what the
    // source effect watches, there is no token to remember here.
    setNeedsGesture(false);
    if (loaded.length > 0) setIsPlaying(true);
  };

  const openPlaylist    = (playlist) => loadPlaylist(playlist, { open: true });
  const previewPlaylist = (playlist) => loadPlaylist(playlist, { open: false });

  const stopPreview = () => {
    audioRef.current?.pause();
    setIsPlaying(false);
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

  // ── Playback, in two effects that do one job each ───────────────────────────
  //
  // WHY THIS IS TWO EFFECTS AND NOT ONE
  //
  // "The first song never plays" has now been reported three times, and each
  // previous attempt fixed the path in front of it rather than the reason. The
  // reason is that one effect was doing two unrelated jobs, deciding WHAT to
  // load and deciding WHETHER to play, off a hand-written dependency list
  // that deliberately excluded isPlaying. Every new call site then had to
  // remember to bump playToken by hand, and openPlaylist did not:
  //
  //   openPlaylist() { setMode('track');      // already 'track'   → no change
  //                    setCurrentIndex(0);    // already 0         → no change
  //                    await fetch;
  //                    setTracks(loaded);     // not a dependency
  //                    setIsPlaying(true); }  // not a dependency
  //
  // Not one dependency changed, so the effect never ran, audioRef.src was
  // never assigned, and nothing loaded. Going to track 2 and back changed the
  // index twice, which is exactly why that always appeared to work.
  //
  // The fix is to stop depending on a token somebody has to remember. The real
  // input is the URL, and the URL genuinely changes when the tracks arrive -
  // so effect one keys on the URL and needs no token at all. Effect two then
  // does nothing but make the element agree with isPlaying, which means
  // "playing" is a state of the app rather than a side effect somebody has to
  // trigger. A missed setPlayToken cannot break it again, because there is
  // nothing left to miss.
  const desiredSrc = mode === 'ad' ? (currentAd?.audio_url || null)
                                   : (currentTrack?.file_url || null);

  // 1. THE SOURCE. Loads whatever should be loaded. Idempotent: assigning the
  //    same src again would restart the track from zero and abort the play()
  //    already in flight, so it is compared first and skipped if unchanged.
  //    playToken survives only for the deliberate "restart the same thing"
  //    case (repeat-one), and is handled by seeking rather than reloading.
  React.useEffect(() => {
    const a = audioRef.current;
    if (!a) return;

    if (mode === 'ad' && !currentAd) { setMode('track'); return; }
    if (!desiredSrc) return;

    // a.src reports the fully-resolved absolute URL, so compare against that
    // rather than against the raw string we last assigned.
    const already = a.currentSrc || a.src;
    if (already === desiredSrc || (already && already === new URL(desiredSrc, window.location.href).href)) {
      return;
    }

    a.src = desiredSrc;
    a.load();

    // Swap in a signed URL once one is available, so this page keeps playing
    // when feelz-samples goes private. No-op unless REACT_APP_PRIVATE_AUDIO is
    // set, and never for an ad, whose audio_url is not a track.
    if (mode !== 'ad' && currentTrack?.id) {
      a.dataset.feelzTrackId = String(currentTrack.id);
      resolveStreamLater(a, currentTrack);
    }

    if (mode === 'ad') {
      logAdPlay(currentAd);
    } else {
      hasLoggedRef.current = false;
      playedRef.current.add(currentIndex);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, desiredSrc, currentIndex, currentAdIndex]);

  // 2. THE TRANSPORT. Makes the element agree with isPlaying, and nothing else.
  //
  //    Two rejections are handled differently on purpose, because the old code
  //    treated both as "stop", which is how the button ended up showing Play
  //    over a track that was about to start:
  //
  //      AbortError   , a new load interrupted this play(). Normal and
  //                      self-correcting: the new src's own play() is already
  //                      queued behind it. Setting isPlaying(false) here was
  //                      cancelling playback that was working.
  //      NotAllowedError, the browser wants a gesture. Real, and the person
  //                      needs telling, so it surfaces a message rather than
  //                      quietly flipping the button back.
  React.useEffect(() => {
    const a = audioRef.current;
    if (!a) return;

    if (!isPlaying) {
      if (!a.paused) a.pause();
      return;
    }

    if (!desiredSrc) return;

    if (a.paused) {
      const r = a.play();
      if (r && typeof r.catch === 'function') {
        r.catch(err => {
          if (err?.name === 'AbortError') return;   // superseded by a new load
          console.error('[retail-player] play() rejected:', err?.name, err?.message);
          if (err?.name === 'NotAllowedError') {
            setNeedsGesture(true);
          }
          setIsPlaying(false);
        });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPlaying, desiredSrc, playToken]);

  // The 30-second qualifying check, real playback position, not a timer,
  // so pausing partway through never falsely counts.
  const handleTimeUpdate = () => {
    if (mode !== 'track' || hasLoggedRef.current || !audioRef.current) return;
    if (audioRef.current.currentTime >= QUALIFYING_SECONDS) {
      hasLoggedRef.current = true;
      logPlay(tracks[currentIndex], selectedPlaylist, Math.floor(audioRef.current.currentTime));
    }
  };

  // Which track comes after this one. Shuffle is a real shuffle: it draws from
  // the tracks it has not used yet and only reshuffles once the playlist is
  // exhausted, so a shift never hears the same song twice before hearing the
  // rest. Random-with-replacement would repeat within a few songs, which a
  // venue notices.
  const pickNextIndex = () => {
    if (tracks.length === 0) return -1;

    if (shuffle) {
      if (playedRef.current.size >= tracks.length) playedRef.current = new Set();
      const pool = tracks
        .map((_, i) => i)
        .filter(i => !playedRef.current.has(i) && i !== currentIndex);
      const from = pool.length > 0 ? pool : tracks.map((_, i) => i).filter(i => i !== currentIndex);
      if (from.length === 0) return currentIndex;
      return from[Math.floor(Math.random() * from.length)];
    }

    const next = currentIndex + 1;
    if (next < tracks.length) return next;
    return repeat === 'all' ? 0 : -1;   // -1 = end of the line
  };

  // Shared by "track ended naturally" and "skip button pressed", keeps ad
  // cadence consistent regardless of how a track stopped.
  const advance = () => {
    if (mode === 'ad') {
      goToTrack(pickNextIndex());
      return;
    }

    // Repeat-one applies to a track finishing, not to a deliberate skip -
    // a staff member pressing next wants the next song, not the same one
    // again. onEnded passes no event argument we can rely on, so this is
    // handled by handleEnded below instead.

    const nextCount = tracksSinceAd + 1;
    if (venue?.ads_enabled && ads.length > 0 && nextCount >= adFrequency) {
      setTracksSinceAd(0);
      setCurrentAdIndex(i => i + 1);
      setMode('ad');
    } else {
      setTracksSinceAd(nextCount);
      goToTrack(pickNextIndex());
    }
  };

  // Natural end of a track. This is where repeat-one lives.
  const handleEnded = () => {
    if (mode === 'track' && repeat === 'one') {
      // Same URL, so there is nothing for the source effect to reload -
      // repeat-one is a seek, not a load. Reassigning src would work but
      // re-downloads the file to play the same audio again.
      const a = audioRef.current;
      if (a) {
        a.currentTime = 0;
        const r = a.play();
        if (r && typeof r.catch === 'function') r.catch(() => setIsPlaying(false));
      }
      return;
    }
    advance();
  };

  const goToTrack = (index) => {
    if (index < 0 || index >= tracks.length) { setIsPlaying(false); return; }
    if (mode === 'track' && index !== currentIndex) historyRef.current.push(currentIndex);
    setCurrentIndex(index);
    setMode('track');
  };

  // Back behaves the way every music player does: within the first few
  // seconds it goes to the previous track, after that it restarts the current
  // one. Guessing wrong here is annoying, and this is the convention people
  // already have in their fingers.
  const goBack = () => {
    if (mode === 'ad') return;
    const a = audioRef.current;
    if (a && a.currentTime > 3) {
      a.currentTime = 0;
      return;
    }
    const prev = historyRef.current.pop();
    const target = prev !== undefined ? prev : (currentIndex > 0 ? currentIndex - 1 : 0);
    setCurrentIndex(target);
    setMode('track');
    setIsPlaying(true);
    setPlayToken(t => t + 1);
  };

  // Manual pick from the list, bypasses ad cadence deliberately, since a
  // staff member choosing a specific track shouldn't be interrupted by one.
  const playTrackAt = (index) => {
    if (mode === 'track' && index !== currentIndex) historyRef.current.push(currentIndex);
    setCurrentIndex(index);
    setMode('track');
    setIsPlaying(true);
    setPlayToken(t => t + 1);   // required when index is unchanged, see the source effect
  };

  // Records intent and nothing else. The transport effect is what touches the
  // element, so there is exactly one place that can call play() or pause() and
  // exactly one place that can get it wrong. The old version reached into the
  // element from here as well, which is how the button and the audio could
  // disagree about what was happening.
  const togglePlay = () => {
    setNeedsGesture(false);
    if (isPlaying) { setIsPlaying(false); return; }
    setIsPlaying(true);
    setPlayToken(t => t + 1);   // covers "press play on the same source again"
  };

  const cycleRepeat = () =>
    setRepeat(r => (r === 'none' ? 'all' : r === 'all' ? 'one' : 'none'));

  const toggleShuffle = () => {
    setShuffle(v => {
      if (!v) playedRef.current = new Set([currentIndex]);
      return !v;
    });
  };

  if (!user) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center px-6 text-center">
        <div className="space-y-4">
          <p className="text-sm text-white/50">Log in to access your Feelz Retail player.</p>
          <button onClick={() => navigate('/login?redirect=/retail/player')}
            className="px-6 py-2.5 rounded-xl bg-white text-black text-sm font-bold">Sign in</button>
        </div>
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
              : 'Your subscription has ended. Subscribe again below to switch the player back on.'}
          </p>
          {/* Suspended venues can pay again too. The server accepts it, but
              only a pending venue used to be shown the button, so a lapsed
              venue had no way back without us editing the database. */}
          {(venue.status === 'pending' || venue.status === 'suspended') && (
            <RetailPayPalButton venueId={venue.id} onSubscribed={() => setVenue(v => ({ ...v, status: 'active' }))} />
          )}
        </div>
      </div>
    );
  }

  return (
    /* WHY THE DECK PAGE WAS SCROLLING.
       This carried a permanent pb-16, 64px of padding left over from the
       player bar that used to run across the bottom of every screen and is
       now only there for adverts. The deck below sizes itself to
       calc(100dvh - 76px) and the header is the other 76px, so the content
       came to exactly one viewport and then 64px of empty padding pushed it
       past that. The whole page scrolled to reveal nothing.

       The padding is now only present when there is actually a bar to clear,
       which is the advert bar, and the deck screen stands still. */
    <div
      className={`min-h-screen ${mode === 'ad' ? 'pb-16' : ''}`}
      style={{ background: pageBg, color: R.text, overflowX: 'hidden' }}
    >
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
        <meta name="theme-color" content="#0C0A09" />
      </Helmet>
      <audio ref={audioRef} onEnded={handleEnded} onTimeUpdate={handleTimeUpdate} />

      {/* The lid. Decorative, inert, and above everything except the sheets
          you open on purpose, see RetailGlass.js. */}
      <RetailGlass />

      {/* The header was the same translucent gradient as the cards under it,
          so the two ran together and the page had no top. It is now opaque -
          still a gradient, but of solid colours, sitting on a lit edge and a
          real shadow so the content reads as passing underneath it. */}
      <div className="sticky top-0 z-10 px-4 py-4"
        style={{
          background: 'linear-gradient(180deg, #0C0B12 0%, #08070C 60%, #060509 100%)',
          borderBottom: '1px solid rgba(255,255,255,0.10)',
          boxShadow: '0 12px 34px rgba(0,0,0,0.72), inset 0 -1px 0 rgba(139,92,246,0.22)',
        }}>
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs font-bold tracking-[0.24em] uppercase" style={{ color: R.violetLift }}>Feelz Retail</p>
            <h1 className="text-lg font-bold" style={{ color: R.text }}>{venue.business_name}</h1>
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
        <div className="fixed inset-0 z-[200] bg-black/80 backdrop-blur-sm flex items-end sm:items-start sm:justify-end sm:pt-20 sm:pr-5 justify-center"
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
            {/* One link, not nine. Every entry here went to the same page
                with a different ?sub=, and the page already has tabs, so the
                menu was just a second, worse copy of them. Pages get added
                as tabs in RetailAdminPanel instead. */}
            <div className="p-2">
              <button
                onClick={() => { setShowAdminMenu(false); navigate('/retail-admin'); }}
                className="w-full flex items-center justify-between gap-3 px-3 py-3 rounded-xl hover:bg-white/[0.05] transition text-left">
                <span className="text-sm text-white/75">Retail Admin</span>
                <ChevronRight className="w-3.5 h-3.5 text-white/20 flex-shrink-0" />
              </button>
              <p className="text-[11px] text-white/25 px-3 pb-2 pt-1">
                Playlists, venues, staff and the rest live as tabs in there.
              </p>
            </div>
          </div>
        </div>
      )}

      {showInbox && (
        <div className="fixed inset-0 z-[200] bg-black/80 backdrop-blur-sm flex items-end sm:items-start sm:justify-end sm:pt-20 sm:pr-5 justify-center" onClick={() => setShowInbox(false)}>
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

      <div>
        {view === 'deck' ? (
          <RetailDeckView
            playlists={deckPlaylists}
            allPlaylists={playlists}
            savedIds={savedPlaylistIds}
            savedPlaylists={savedPlaylists}
            recommended={recommended}
            impact={impact}
            loadingPlaylists={loadingPlaylists}
            onSave={toggleSave}
            onRemoveSaved={removeSaved}
            onPass={passPlaylist}
            onReset={resetPasses}
            onOpen={(pl) => openPlaylist(pl)}
            onPreview={(pl) => pl && previewPlaylist(pl)}
            onStopPreview={stopPreview}
            isPreviewing={isPlaying && mode === 'track'}
            previewLabel={
              tracks[currentIndex]
                ? `${tracks[currentIndex].artist?.artist_name || 'Unknown'}, ${tracks[currentIndex].title}`
                : null
            }
          />
        ) : (
          <RetailRecordSleeve
            playlist={selectedPlaylist}
            tracks={tracks}
            loadingTracks={loadingTracks}
            currentIndex={currentIndex}
            isCurrentPlaylist={mode === 'track'}
            isPlaying={isPlaying}
            currentTrack={tracks[currentIndex] || null}
            onPlayTrackAt={playTrackAt}
            onTogglePlay={() => {
              if (isPlaying) { audioRef.current?.pause(); setIsPlaying(false); }
              else { setNeedsGesture(false); setIsPlaying(true); }
            }}
            /* Back is navigation, not a stop button. Going back to the deck
               used to pause the audio, so a venue browsing other vibes
               silenced their own room. The music keeps playing. */
            onBack={() => setView('deck')}
            onToggleSave={() => toggleSave(selectedPlaylist)}
            isSaved={savedPlaylistIds.has(selectedPlaylist.id)}
            onComments={() => setShowComments(true)}
            featuredArtists={featuredArtists}
            distinctArtistCount={distinctArtistCount}
            /* The transport lives in the left column of the record now, the
               bar across the bottom of the window is gone. */
            audioRef={audioRef}
            onNext={advance}
            onPrev={goBack}
            shuffle={shuffle}
            onToggleShuffle={toggleShuffle}
            repeat={repeat}
            onCycleRepeat={cycleRepeat}
            liked={likedTrackIds.has(tracks[currentIndex]?.id)}
            onToggleLike={() => toggleLike(tracks[currentIndex])}
          />
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
        manualFallback
      />

      {/* Account. There was no way to see who you were signed in as or to
          sign out without leaving Retail for the main app, which defeats
          keeping the two separate. Everything here stays in Retail. */}
      {showAccount && (
        <div className="fixed inset-0 z-[200] bg-black/80 backdrop-blur-sm flex items-end sm:items-start sm:justify-end sm:pt-20 sm:pr-5 justify-center"
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
              <button onClick={() => { setShowAccount(false); setShowReferrals(true); }}
                className="w-full flex items-center gap-3 px-3 py-3 rounded-xl hover:bg-white/[0.05] transition text-left">
                <TrendingUp className="w-4 h-4 text-white/35 flex-shrink-0" />
                <span className="text-sm text-white/70">Refer another venue</span>
              </button>
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

      {showReferrals && (
        <RetailReferrals venue={venue} user={user} onClose={() => setShowReferrals(false)} />
      )}

      {showComments && selectedPlaylist && (
        <RetailPlaylistComments
          playlist={selectedPlaylist}
          venue={venue}
          isPreviewMode={isPreviewMode}
          onClose={() => setShowComments(false)}
        />
      )}

      {needsGesture && (
        <div className="fixed bottom-24 left-0 right-0 z-30 px-4">
          <button
            onClick={togglePlay}
            className="w-full py-3 rounded-xl text-xs font-semibold text-center transition active:scale-[0.99]"
            style={{ background: 'rgba(167,139,250,0.18)', border: '1px solid rgba(167,139,250,0.35)', color: '#ddd6fe' }}
          >
            Tap to start playback, your browser needs one tap before it will play audio
          </button>
        </div>
      )}

      {/* Why a save did or did not happen. The whole point of this fix is
          that the old version said nothing at all. */}
      {saveNotice && (
        <div className="fixed bottom-24 left-0 right-0 z-30 px-4 pointer-events-none">
          <div
            className="mx-auto max-w-sm py-2.5 px-4 rounded-xl text-xs font-semibold text-center"
            style={{ background: 'rgba(24,20,32,0.96)', border: `1px solid ${R.border}`, color: R.textDim }}
          >
            {saveNotice}
          </div>
        </div>
      )}

      {/* THE PLAYER BAR IS GONE, except for adverts.
          It used to run across the bottom of every screen for the sake of six
          buttons, and on the record page it cut off the bottom of the record
          itself. Transport now lives in a card under the song details, where
          a venue is already looking when they decide to skip something.

          An advert is the exception and has to stay: a venue must be able to
          see that the thing playing in their room is an advert and not their
          music, and there is no record page for an advert to put it on. */}
      {mode === 'ad' && (
        <div className="fixed bottom-0 left-0 right-0 backdrop-blur-xl px-4 py-3 z-30"
          style={{
            background: 'linear-gradient(180deg, rgba(16,14,24,0.97) 0%, rgba(8,8,12,0.98) 100%)',
            borderTop: `1px solid ${R.borderUp}`,
            boxShadow: '0 -8px 32px rgba(0,0,0,0.6)',
          }}>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
              style={{ background: R.blueSoft }}>
              <Megaphone className="w-4 h-4" style={{ color: R.blueLift }} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold truncate" style={{ color: R.text }}>Advert</p>
              <p className="text-xs truncate" style={{ color: R.textFaint }}>{currentAd?.advertiser_name}</p>
            </div>
            <button onClick={togglePlay}
              title={isPlaying ? 'Pause' : 'Play'}
              className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 transition"
              style={{ background: `linear-gradient(145deg, ${R.violetLift}, ${R.violet})` }}>
              {isPlaying
                ? <Pause className="w-4 h-4" style={{ color: '#F5F3FF' }} fill="#F5F3FF" />
                : <Play className="w-4 h-4" style={{ color: '#F5F3FF' }} fill="#F5F3FF" />}
            </button>
            <button onClick={advance} title="Skip advert"
              className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 transition hover:bg-white/[0.06]">
              <SkipForward className="w-4 h-4" style={{ color: R.textDim }} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}