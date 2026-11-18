import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { sendArtistBroadcast } from '../utils/notify';
import { useTier, FEATURE_LABELS } from '../contexts/useTier';
import { useAuth } from '../contexts/AuthContext';
import useSchoolSessions from '../hooks/useSchoolSessions';
import useLiveStreams, { liveStreamsLine } from '../hooks/useLiveStreams';
import useDirectLive from '../hooks/useDirectLive';
import {
  X, ChevronDown, Loader, Check, Send, Music, Youtube, Search, Radio, Plus, Disc3,
} from 'lucide-react';
import { VoiceMemoUpload } from './VoiceMemo';
import { StoryUpload } from './ArtistStories';
import MerchConnectSheet from './MerchConnectSheet';
import MerchParked from './MerchParked';
import { MERCH_PARKED } from '../config/features';
import { tap } from '../utils/track';
import CreateMenuSection, { MENU_TINTS } from './CreateMenuSection';
import {
  Trophy, Camera, Mic, TrendingUp, HeartHandshake, Store, Coins, Wallet,
  Megaphone, MessagesSquare, Mail, Radar, Pencil, Star, ShoppingBag, User,
  Home, Settings, Inbox, GraduationCap, Calendar,
} from 'lucide-react';

// Exact copy of the "+" create menu from ArtistProfilePage.js — same
// dimensions (maxWidth 360, maxHeight 85vh), same styling, same tab flow.
// Kept fully self-contained (its own state/handlers) so it can be mounted
// from anywhere — the profile page's own "+" button, or the mobile nav's
// center plus button — without the two call sites fighting over shared state.
// Groups that are always open: what's running right now, and making music.
const ALWAYS_OPEN = ['Happening now', 'Create'];

export default function CreateMenuModal({ artist, user, onClose, primaryColor = '#90AF2F', bgColor = '#000000', initialTab = 'menu' }) {
  const navigate = useNavigate();
  const sessionsGate = useSchoolSessions();
  const liveNow = useLiveStreams();
  const directCfg = useDirectLive();
  // Once direct streaming is switched on it is the first choice.
  useEffect(() => { if (directCfg.canHost) setLiveMode(m => (m === 'youtube' ? 'direct' : m)); }, [directCfg.canHost]); // eslint-disable-line react-hooks/exhaustive-deps
  const { isAdmin, isBeatmaker } = useAuth();
  // Story, voice memo and message fans share one panel, with a switch at the top.
  const [shareTab, setShareTab] = useState('story');
  // Newsletter shortcut, shown only to admins and newsletter editors so
  // Jane can reach it in one tap instead of Monetize > Affiliates > Newsletter.
  const [canNewsletter, setCanNewsletter] = useState(false);
  // Which folded group is open (one at a time); Create and Happening now never fold.
  const [openGroup, setOpenGroup] = useState(null);

  // ── My Top Pick ───────────────────────────────────────────────────────
  // The control for this existed only in ProfileSetup.js (/setup). The
  // Create menu's "Edit Profile" goes to /profile/edit, which is a
  // different, near-duplicate page that never had it — so the feature was
  // live on the public profile and unreachable from anywhere a person
  // would actually look. Surfaced here.
  const [topPickTracks, setTopPickTracks]   = useState([]);
  const [topPickId, setTopPickId]           = useState(null);
  const [topPickNote, setTopPickNote]       = useState('');
  const [topPickSaving, setTopPickSaving]   = useState(false);
  const [topPickMsg, setTopPickMsg]         = useState('');
  const [topPickLoading, setTopPickLoading] = useState(false);
  useEffect(() => {
    if (!user) return;
    // The admin half of this question is already answered elsewhere.
    //
    // The old comment was right that isAdmin is not passed in as a prop, and
    // the conclusion it drew, read the table directly, is what made `admins` a
    // second request at startup for something AuthContext had already asked.
    // The missing step is simply that this file can call useAuth itself, which
    // it now does.
    //
    // Only newsletter_editors is genuinely unknown here.
    if (isAdmin) { setCanNewsletter(true); return; }
    supabase.from('newsletter_editors').select('id').eq('user_id', user.id).maybeSingle()
      .then(({ data }) => setCanNewsletter(!!data));
  }, [user, isAdmin]);


  // Loaded when the tab is opened rather than on mount: most opens of this
  // menu are for something else, and this is two round trips.
  const loadTopPick = async () => {
    if (!artist?.id) return;
    setTopPickLoading(true);
    // Albums as well as tracks. An artist who has just put out a project
    // usually wants the project at the top of their profile rather than one
    // song off it, and before this the project was not on the list at all.
    const [{ data: tracks, error: tErr }, { data: albums, error: alErr }, { data: me, error: aErr }] = await Promise.all([
      supabase.from('tracks').select('id, title')
        .eq('artist_id', artist.id).eq('is_published', true)
        .order('created_at', { ascending: false }),
      supabase.from('albums').select('id, title, release_type')
        .eq('artist_id', artist.id).eq('is_published', true)
        .order('release_date', { ascending: false }),
      supabase.from('artists').select('top_pick_track_id, top_pick_album_id, top_pick_note')
        .eq('id', artist.id).maybeSingle(),
    ]);
    if (tErr)  console.error('[create] top pick tracks failed:', tErr.message);
    if (alErr) console.error('[create] top pick albums failed:', alErr.message);
    if (aErr)  console.error('[create] top pick current failed:', aErr.message);

    // Albums first: there are far fewer of them and they are the bigger
    // thing, so they do not get buried under a long track list.
    setTopPickTracks([
      ...(albums || []).map(a => ({ ...a, _isAlbum: true })),
      ...(tracks || []),
    ]);
    setTopPickId(me?.top_pick_album_id || me?.top_pick_track_id || null);
    setTopPickNote(me?.top_pick_note || '');
    setTopPickLoading(false);
  };

  // Ownership of the track is checked inside set_my_top_pick, in the
  // database — not trusted from here.
  const saveTopPick = async (pickId) => {
    setTopPickSaving(true);
    setTopPickMsg('');
    // Which kind was chosen is read off the list rather than carried in a
    // second piece of state that could fall out of step with the selection.
    // set_my_top_pick takes one or the other and clears the other column, so
    // a pick is never both.
    const chosen = (topPickTracks || []).find(i => i.id === pickId);
    const isAlbum = !!chosen?._isAlbum;
    const { error } = await supabase.rpc('set_my_top_pick', {
      p_track_id: isAlbum ? null : pickId,
      p_album_id: isAlbum ? pickId : null,
      p_note: pickId ? (topPickNote.trim() || null) : null,
    });
    if (error) {
      setTopPickMsg('Could not save: ' + error.message);
    } else {
      setTopPickId(pickId);
      if (!pickId) setTopPickNote('');
      setTopPickMsg(pickId ? 'Top pick saved' : 'Top pick cleared');
      setTimeout(() => { close(); setTopPickMsg(''); }, 1100);
    }
    setTopPickSaving(false);
  };
  const { isPremium, hasFeature } = useTier();

  // ONE SHAPE FOR EVERY ROW THE PLAN CAN WITHHOLD.
  //
  // Stories, Voice Memo, Go Live and Message Fans were in no tier map, so
  // every artist on every plan had all four. Three of them are Pro now and
  // live streaming is Premium, which is what the cards in src/data/tiers.js
  // have always said.
  //
  // The row is not hidden. Merch already worked this way and for the right
  // reason: an artist who cannot see a feature has no idea it exists and no
  // reason to pay for it, and a row that appears and disappears between plans
  // reads as a bug rather than a price. So the row stays, says which plan it
  // needs, and opens the upgrade page instead of the composer.
  const gated = (feature, item) => {
    if (hasFeature(feature)) return item;
    const needs = FEATURE_LABELS[feature]?.minTier === 'premium' ? 'Premium' : 'Pro';
    return { ...item, id: `${item.id}_locked`, sub: `${needs} only, upgrade to unlock` };
  };

  // 'menu' | 'share' | 'live' | 'toppick'. Other pages can open straight
  // onto a panel (the Live Studio opens 'live').
  const [createTab, setCreateTab] = useState(initialTab === 'live' || initialTab === 'share' ? initialTab : 'menu');
  const [showMerchConnect, setShowMerchConnect] = useState(false);
  const [showMerchParked, setShowMerchParked]   = useState(false);

  const [dmMessage, setDmMessage] = useState('');
  const [dmSending, setDmSending] = useState(false);
  const [dmSent, setDmSent] = useState(false);

  const [liveTitle, setLiveTitle] = useState(artist ? `${artist.artist_name}'s Live Session` : '');
  const [liveMode, setLiveMode] = useState('youtube');
  const [liveError, setLiveError] = useState('');
  const [liveYoutubeUrl, setLiveYoutubeUrl] = useState('');
  const [scheduleMode, setScheduleMode] = useState(false);
  const [scheduledAt, setScheduledAt] = useState('');
  const [queueTracks, setQueueTracks] = useState([]);
  const [trackSearch, setTrackSearch] = useState('');
  const [trackResults, setTrackResults] = useState([]);
  const [searchingTracks, setSearchingTracks] = useState(false);
  const [startingSession, setStartingSession] = useState(false);

  const close = () => {
    onClose();
    setCreateTab('menu');
  };

  // Live session track search
  useEffect(() => {
    if (!artist?.id || trackSearch.trim().length < 2) { setTrackResults([]); return; }
    setSearchingTracks(true);
    const t = setTimeout(async () => {
      const { data } = await supabase.from('tracks').select('id,title,cover_artwork_url,duration')
        .eq('artist_id', artist.id).eq('is_published', true)
        .ilike('title', `%${trackSearch.trim()}%`).limit(8);
      setTrackResults((data || []).filter(t => !queueTracks.find(q => q.id === t.id)));
      setSearchingTracks(false);
    }, 300);
    return () => clearTimeout(t);
  }, [trackSearch, artist?.id, queueTracks]);

  const fmtLiveDuration = (s) => s ? `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` : '';
  const addToLiveQueue = (track) => { setQueueTracks(p => [...p, track]); setTrackSearch(''); setTrackResults([]); };
  const removeFromLiveQueue = (id) => setQueueTracks(p => p.filter(t => t.id !== id));

  const startLiveSession = async () => {
    if (!artist || startingSession) return;
    if (!hasFeature('live_streaming')) { close(); navigate('/upgrade'); return; }
    setStartingSession(true);
    try {
      const { data: existing } = await supabase.from('listening_sessions').select('id')
        .eq('artist_id', artist.id).eq('status', 'live').maybeSingle();
      if (existing) { setCreateTab('menu'); navigate(`/session/${existing.id}`); setStartingSession(false); return; }
      const title = liveTitle.trim() || `${artist.artist_name}'s Live Session`;
      const isScheduled = scheduleMode && scheduledAt;
      // Direct from OBS: the artist's Cloudflare live input, made on first use.
      let cfLiveUid = null;
      if (liveMode === 'direct') {
        const { data: { session: auth } } = await supabase.auth.getSession();
        const r = await fetch('/.netlify/functions/cf-live', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'setup', token: auth?.access_token }),
        }).then(x => x.json()).catch(() => ({}));
        if (!r.uid) throw new Error('Direct streaming is not set up yet');
        cfLiveUid = r.uid;
      }
      const { data: session, error } = await supabase.from('listening_sessions').insert({
        artist_id: artist.id, title, mode: liveMode,
        status: isScheduled ? 'scheduled' : 'live',
        ...(isScheduled ? { scheduled_at: new Date(scheduledAt).toISOString() } : {}),
        ...(liveMode === 'youtube' && liveYoutubeUrl ? { youtube_url: liveYoutubeUrl } : {}),
        ...(cfLiveUid ? { cf_live_uid: cfLiveUid } : {}),
      }).select().single();
      if (error) throw error;
      const { data: { session: authSession } } = await supabase.auth.getSession();
      fetch('/.netlify/functions/notify-session-live', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: session.id, artist_id: artist.id, token: authSession?.access_token }),
      }).catch(() => {});
      if (liveMode === 'audio' && queueTracks.length > 0) {
        await supabase.from('listening_session_queue').insert(
          queueTracks.map((track, i) => ({ session_id: session.id, track_id: track.id, position: i }))
        );
      }
      close();
      if (!scheduleMode || !scheduledAt) navigate(`/session/${session.id}`);
    } catch (err) { console.error('Start session error:', err); setLiveError(err.message || 'Could not start the stream. Try again.'); }
    setStartingSession(false);
  };

  const sendDMToFollowers = async () => {
    if (!artist || !dmMessage.trim() || dmSending) return;
    // Belt as well as braces. The row that opens this composer is withheld
    // below a Pro plan, but the tier can resolve late and a composer already
    // on screen does not re-render, so the send checks for itself.
    if (!hasFeature('fan_broadcast')) { close(); navigate('/upgrade'); return; }
    setDmSending(true);
    try {
      const { data: follows } = await supabase
        .from('follows').select('follower_id').eq('artist_id', artist.id);
      if (!follows?.length) { setDmSending(false); return; }

      const followerIds = follows.map(f => f.follower_id).filter(id => id !== user.id);
      for (let i = 0; i < followerIds.length; i += 50) {
        const batch = followerIds.slice(i, i + 50);
        // One call per batch instead of a direct insert. The rows are
        // addressed to fans, which the notifications INSERT policy refuses,
        // so this DM has never been delivered — it 403'd every time.
        //
        // send_artist_broadcast intersects the list with this artist's real
        // followers, so it can only ever reach people who chose to follow.
        // See migration 108.
        await sendArtistBroadcast(supabase, 'artist DM (create menu)', {
          type:       'admin_message',
          title:      `Message from ${artist.artist_name}`,
          message:    dmMessage.trim(),
          metadata:   { from_artist_id: artist.id, artist_name: artist.artist_name },
          recipients: batch,
        });
      }
      try {
        const { data: { session: authSession } } = await supabase.auth.getSession();
        // The empty 'x-internal-secret' header is gone. send-push compared it
        // against INTERNAL_FUNCTION_SECRET and returned 401 every time — the
        // browser cannot hold that secret. It accepts a signed-in artist's
        // token now and scopes the send to that artist's real followers.
        fetch('/.netlify/functions/send-push', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            user_ids: followerIds,
            title: `Message from ${artist.artist_name}`,
            body: dmMessage.trim(),
            token: authSession?.access_token,
          }),
        }).catch(() => {});
      } catch { /* push is best-effort */ }
      setDmSent(true);
      setDmMessage('');
      setTimeout(() => { close(); setDmSent(false); }, 1200);
    } catch (err) { console.error('DM send error:', err); }
    setDmSending(false);
  };

  if (showMerchParked) {
    return (
      <div className="fixed inset-0 z-[210] bg-black/85 backdrop-blur-sm flex items-center justify-center px-5"
        onClick={() => setShowMerchParked(false)}>
        <div onClick={(e) => e.stopPropagation()} className="w-full flex justify-center">
          <MerchParked full={false} onClose={() => setShowMerchParked(false)} />
        </div>
      </div>
    );
  }

  if (showMerchConnect) {
    return createPortal(
      <MerchConnectSheet
        artist={artist}
        onClose={() => setShowMerchConnect(false)}
        onConnected={() => { setShowMerchConnect(false); close(); window.location.reload(); }}
      />,
      document.body
    );
  }

  return createPortal(
    <div className={`fixed inset-0 z-[600] flex justify-center bg-black/80 backdrop-blur-sm md:pl-64 ${createTab === 'menu' ? 'items-center px-6' : 'items-end sm:items-center sm:px-6'}`}
      onClick={close}>
      <div className={`w-full overflow-y-auto overflow-x-hidden ${createTab === 'menu' ? 'rounded-3xl' : 'rounded-t-[28px] sm:rounded-3xl'}`}
        style={createTab === 'menu'
          ? { maxWidth: 360, maxHeight: '85vh', backgroundColor: '#0f0f0f', border: '1px solid rgba(255,255,255,0.08)', boxShadow: '0 32px 64px rgba(0,0,0,0.6)' }
          : { maxWidth: 560, maxHeight: 'min(94vh, calc(100dvh - 12px))', minHeight: '62vh', backgroundColor: '#0c0b10', border: '1px solid rgba(255,255,255,0.08)', boxShadow: '0 -20px 80px rgba(0,0,0,0.7)', paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
        onClick={e => e.stopPropagation()}>

        {/* Panel hero: big, so the panel reads as its own place */}
        {createTab !== 'menu' && (() => {
          const P = {
            live:    { icon: Radio,     title: 'Go live',         sub: 'Stream to your fans now, or set a time and let them know', grad: 'from-red-500 via-pink-500 to-violet-600' },
            share:   { icon: Megaphone, title: 'Share with fans', sub: 'A story, a voice memo or a message to everyone who follows you', grad: 'from-violet-600 via-fuchsia-500 to-amber-400' },
            toppick: { icon: Star,      title: 'Top pick',        sub: 'The first thing a new listener hears on your profile', grad: 'from-amber-400 via-orange-500 to-pink-500' },
          }[createTab] || { icon: Plus, title: 'Create', sub: '', grad: 'from-violet-600 to-pink-500' };
          const Icon = P.icon;
          return (
            <div className="relative overflow-hidden">
              <div className={`absolute inset-0 bg-gradient-to-br ${P.grad} opacity-25`} />
              <div className="absolute -right-10 -top-10 w-48 h-48 rounded-full bg-white/10 blur-3xl" />
              <div className="relative px-5 pt-3 pb-5">
                <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-white/25 sm:hidden" />
                <div className="flex items-center justify-between">
                  <button onClick={() => setCreateTab('menu')} aria-label="Back to the menu"
                    className="h-9 px-3 flex items-center gap-1 rounded-full bg-black/30 hover:bg-black/50 text-xs font-bold text-white/80 transition">
                    <ChevronDown className="w-4 h-4 rotate-90" /> Menu
                  </button>
                  <button onClick={close} aria-label="Close"
                    className="w-9 h-9 flex items-center justify-center rounded-full bg-black/30 hover:bg-black/50 transition">
                    <X className="w-4 h-4 text-white/80" />
                  </button>
                </div>
                <div className="mt-4 flex items-center gap-4">
                  <span className={`w-14 h-14 rounded-2xl bg-gradient-to-br ${P.grad} flex items-center justify-center shadow-lg flex-shrink-0`}>
                    <Icon className="w-7 h-7 text-white" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-2xl font-black text-white leading-tight">{P.title}</p>
                    <p className="text-sm text-white/60 leading-snug">{P.sub}</p>
                  </div>
                </div>
              </div>
            </div>
          );
        })()}

        {/* Header */}
        {createTab === 'menu' && (
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.06]">
          <div className="flex items-center space-x-2">
            {createTab !== 'menu' && (
              <button onClick={() => setCreateTab('menu')}
                className="w-7 h-7 flex items-center justify-center rounded-full bg-white/[0.08] hover:bg-white/[0.15] transition">
                <ChevronDown className="w-3.5 h-3.5 text-white/60 rotate-90" />
              </button>
            )}
            <p className="text-sm font-bold text-white">
              {createTab === 'menu' ? 'Create' : createTab === 'story' ? 'Add Story' : createTab === 'live' ? 'Go Live' : createTab === 'memo' ? 'Voice Memo' : createTab === 'toppick' ? 'My Top Pick' : 'Message Fans'}
            </p>
          </div>
          <button onClick={close}
            className="w-8 h-8 flex items-center justify-center rounded-full bg-white/[0.08] hover:bg-white/[0.15] transition">
            <X className="w-4 h-4 text-white/60" />
          </button>
        </div>
        )}

        <div className={createTab === 'menu' ? 'p-4 space-y-3' : `px-5 pt-4 space-y-4 ${createTab === 'live' || (createTab === 'share' && shareTab === 'dm') ? 'pb-0' : 'pb-6'}`}>

          {/* ── Menu ── */}
          {createTab === 'menu' && (
            <>
              {/*
                GROUPED, BECAUSE THIRTEEN IDENTICAL ROWS ARE NOT A MENU
                ──────────────────────────────────────────────────────
                Every row used to carry the same border and the same flat
                fill, so finding one meant reading all of them top to bottom.
                They are now in five groups, each with a heading and its own
                hue, and the hues step through the spectrum down the sheet so
                the whole thing reads as one gradient rather than five
                unrelated colours. The point is position: after a couple of
                visits an artist stops reading and goes to the right band.

                Each item carries a `tint` taken from its group, used for the
                row's left-to-right wash, its border and its icon tile. The
                old per-item `color` strings were never read by anything, so
                they are gone rather than left to rot.
              */}
              {[
                // ORDERED BY WHAT ARTISTS USE MOST (app_events, menu_* taps).
                // Whatever is running right now first, then making music,
                // then the money, then fans, profile, account, and help last.
                // Extra features sit in their own bands so the top stays short.
                ...(((sessionsGate.enabled && sessionsGate.allowed && !sessionsGate.loading) || liveNow.live || liveNow.soon)
                  ? [{ heading: 'Happening now', icon: Trophy, tint: MENU_TINTS.now, items: [
                      ...(sessionsGate.enabled && sessionsGate.allowed && !sessionsGate.loading
                        ? [{ id: 'sessions', icon: Trophy, label: 'Enter Sessions', sub: 'The cover competition, open to everyone' }]
                        : []),
                      ...(liveNow.live || liveNow.soon
                        ? [{ id: 'live_streams', icon: Radio, label: 'Live streams', sub: liveStreamsLine(liveNow) }]
                        : []),
                    ] }]
                  : []),
                {
                  heading: 'Create',
                  icon: Music,
                  tint: MENU_TINTS.create,
                  items: [
                    { id: 'upload', icon: Music, label: 'Upload Track', sub: 'Add new music to your profile' },
                    gated('live_streaming', { id: 'live', icon: Radio, label: 'Go Live', sub: 'Start a live session' }),
                    gated('stories', { id: 'story', icon: Camera, label: 'Add Story', sub: 'Share a 24hr clip with fans' }),
                    gated('voice_memo', { id: 'memo', icon: Mic, label: 'Voice Memo', sub: 'Record a message for your fans' }),
                  ],
                },
                {
                  // Money owed to you and money you can make, together.
                  heading: 'Your money',
                  icon: Wallet,
                  tint: MENU_TINTS.money,
                  items: [
                    { id: 'earnings', icon: TrendingUp, label: 'Earnings and stats', sub: 'What you have made and who is listening' },
                    { id: 'splits', icon: HeartHandshake, label: 'Splits', sub: 'Collab shares owed to you and by you' },
                    { id: 'retail', icon: Store, label: 'Feelz Retail', sub: 'Put your music in venues and get paid for it' },
                    { id: 'affiliates', icon: Coins, label: 'Affiliate Programme', sub: 'Earn by bringing people to the platform' },
                  ],
                },
                {
                  heading: 'Reach your fans',
                  icon: Megaphone,
                  tint: MENU_TINTS.fans,
                  items: [
                    gated('fan_broadcast', { id: 'dm', icon: Megaphone, label: 'Message Fans', sub: 'Send a notification to all followers' }),
                    { id: 'chats', icon: MessagesSquare, label: 'Chat Rooms', sub: 'Your rooms and artist chats' },
                    ...(canNewsletter
                      ? [{ id: 'newsletter', icon: Mail, label: 'Newsletter', sub: 'Write an update for the app or venues' }]
                      : []),
                    { id: 'radar', icon: Radar, label: 'Collab Radar', sub: 'Find artists to work with' },
                  ],
                },
                {
                  heading: 'Your profile',
                  icon: User,
                  tint: MENU_TINTS.profile,
                  items: [
                    { id: 'edit',    icon: Pencil, label: 'Edit Profile', sub: 'Update your bio, photo and links' },
                    { id: 'toppick', icon: Star, label: 'Top Pick',     sub: 'Choose the track or album your profile leads with' },
                    MERCH_PARKED
                      ? { id: 'merch_parked', icon: ShoppingBag, label: 'Merch Store', sub: 'Paused, tap to see why' }
                      : isPremium
                        ? { id: 'merch', icon: ShoppingBag, label: 'Merch Store', sub: 'Connect Printful · sell to your fans' }
                        : { id: 'merch_locked', icon: ShoppingBag, label: 'Merch Store', sub: 'Premium only, upgrade to unlock' },
                  ],
                },
                {
                  heading: 'Account',
                  icon: Settings,
                  tint: MENU_TINTS.account,
                  items: [
                    // The Hub moved here from the bottom bar on phones, where Games now sits.
                    { id: 'hub', icon: Home, label: isBeatmaker ? 'Studio' : 'Hub', sub: 'All your tools in one place' },
                    { id: 'settings', icon: Settings, label: 'Settings', sub: 'Payments, theme and account' },
                    // Somebody who wants fewer emails and cannot find the switch marks the
                    // next one as spam instead, which costs every artist deliverability.
                    { id: 'contactprefs', icon: Inbox, label: 'Email preferences', sub: 'Choose what reaches your inbox' },
                  ],
                },
                {
                  heading: 'Help',
                  icon: GraduationCap,
                  tint: MENU_TINTS.more,
                  items: [
                    { id: 'course', icon: GraduationCap, label: 'How to Use Feelz Machine', sub: 'Recording, uploading, splits, getting paid' },
                  ],
                },
              ].map(({ heading, icon, tint, items }) => (
                <CreateMenuSection key={heading} heading={heading} icon={icon} tint={tint}
                  collapsible={!ALWAYS_OPEN.includes(heading)}
                  open={openGroup === heading}
                  onToggle={() => setOpenGroup(g => (g === heading ? null : heading))}
                  items={items.filter(Boolean).map(it => ({
                    ...it,
                    onClick: () => {
                      // EVERY ROW, because the question this menu exists to
                      // answer is which rows people actually use. Rows that
                      // nobody taps for a month are rows to remove, and we
                      // have just added five on a hunch.
                      tap('menu_' + it.id);
                      const id = it.id;
                      if (id === 'live') { setCreateTab('live'); setLiveTitle(`${artist?.artist_name}'s Live Session`); }
                      else if (id === 'memo' || id === 'story' || id === 'dm') { setShareTab(id); setCreateTab('share'); }
                      else if (id === 'live_streams') { close(); navigate('/live'); }
                      else if (id === 'upload') { close(); navigate('/dashboard?tab=upload'); }
                      else if (id === 'edit') { close(); navigate('/profile/edit'); }
                      // The account page, not the bio form. See the Account group above.
                      else if (id === 'hub') { close(); navigate('/hub'); }
                      else if (id === 'settings') { close(); navigate('/profile'); }
                      else if (id === 'splits') { close(); navigate('/splits'); }
                      else if (id === 'affiliates') { close(); navigate('/affiliates'); }
                      else if (id === 'earnings') { close(); navigate('/dashboard?tab=analytics&section=earnings'); }
                      else if (id === 'retail') { close(); navigate('/retail/start'); }
                      else if (id === 'radar') { close(); navigate('/collab-radar'); }
                      else if (id === 'contactprefs') { close(); navigate('/contact-preferences'); }
                      else if (id === 'toppick') { setCreateTab('toppick'); loadTopPick(); }
                      else if (id === 'merch_parked') { setShowMerchParked(true); }
                      else if (id === 'merch') { setShowMerchConnect(true); }
                      else if (id === 'merch_locked') { close(); navigate('/upgrade'); }
                      // Every other withheld row, by the suffix gated() gives it.
                      else if (id.endsWith('_locked')) { close(); navigate('/upgrade'); }
                      else if (id === 'newsletter') { close(); navigate('/newsletter/compose'); }
                      else if (id === 'chats') { close(); navigate('/community'); }
                      else if (id === 'course') { close(); navigate('/learn'); }
                      else if (id === 'sessions') { close(); navigate('/sessions'); }
                      else setCreateTab(id);
                    },
                  }))} />
              ))}
            </>
          )}

          {/* ── My Top Pick ── */}
          {createTab === 'toppick' && (
            <div className="space-y-3">
              {topPickLoading ? (
                <div className="py-10 flex justify-center"><Loader className="w-5 h-5 animate-spin text-white/30" /></div>
              ) : topPickTracks.length === 0 ? (
                <p className="text-sm text-white/40 text-center py-8">
                  Publish a track or an album first, your top pick is chosen from your own published music.
                </p>
              ) : (
                <>
                  <p className="text-xs text-white/40 leading-relaxed">
                    This sits at the very top of your profile, above everything else.
                    Pick the track you want a first-time listener to hear, or an album
                    to send them to the whole project.
                  </p>

                  {/* Scrolls on its own rather than growing the sheet, which
                      already caps at 85vh — an artist with forty tracks would
                      otherwise push the Save button off the bottom. */}
                  <div className="max-h-56 overflow-y-auto space-y-2 pr-1">
                    {topPickTracks.map(t => {
                      const chosen = topPickId === t.id;
                      return (
                        <button key={t.id} type="button"
                          onClick={() => setTopPickId(chosen ? null : t.id)}
                          className="w-full flex items-center space-x-3 p-3 rounded-xl border transition active:scale-[0.99] text-left"
                          style={{
                            borderColor: chosen ? primaryColor : 'rgba(255,255,255,0.06)',
                            background: chosen ? `${primaryColor}1A` : 'rgba(255,255,255,0.02)',
                          }}>
                          {t._isAlbum
                            ? <Disc3 className="w-4 h-4 flex-shrink-0" style={{ color: chosen ? primaryColor : 'rgba(255,255,255,0.3)' }} />
                            : <Music className="w-4 h-4 flex-shrink-0" style={{ color: chosen ? primaryColor : 'rgba(255,255,255,0.3)' }} />}
                          <span className="text-sm text-white truncate flex-1">{t.title}</span>
                          {t._isAlbum && (
                            <span className="text-[10px] uppercase tracking-wider flex-shrink-0 px-1.5 py-0.5 rounded"
                              style={{ color: 'rgba(255,255,255,0.45)', background: 'rgba(255,255,255,0.06)' }}>
                              {t.release_type || 'Album'}
                            </span>
                          )}
                          {chosen && <Check className="w-4 h-4 flex-shrink-0" style={{ color: primaryColor }} />}
                        </button>
                      );
                    })}
                  </div>

                  <textarea rows={2} maxLength={140} value={topPickNote}
                    onChange={e => setTopPickNote(e.target.value)}
                    placeholder="Why this one? (optional)"
                    className="w-full px-3 py-2.5 bg-white/[0.06] rounded-xl text-white text-sm outline-none resize-none border border-white/[0.06] focus:border-white/20 transition placeholder-white/20" />

                  <div className="flex items-center justify-between">
                    <span className="text-xs text-white/20">{topPickNote.length}/140</span>
                    {topPickMsg && (
                      <span className={`text-xs ${topPickMsg.startsWith('Could not') ? 'text-red-400' : 'text-green-400'}`}>
                        {topPickMsg}
                      </span>
                    )}
                  </div>

                  <button
                    disabled={topPickSaving || !topPickId}
                    onClick={() => saveTopPick(topPickId)}
                    className="w-full py-3 rounded-2xl text-sm font-semibold transition disabled:opacity-40 flex items-center justify-center space-x-2"
                    style={{ backgroundColor: primaryColor, color: bgColor }}>
                    {topPickSaving ? <Loader className="w-4 h-4 animate-spin" /> : <span>Save Top Pick</span>}
                  </button>

                  {/* Only offered when there is something to clear. */}
                  {topPickId && (
                    <button type="button" disabled={topPickSaving}
                      onClick={() => saveTopPick(null)}
                      className="w-full py-2.5 rounded-2xl text-xs font-semibold text-white/40 hover:text-white/70 transition disabled:opacity-40">
                      Remove my top pick
                    </button>
                  )}
                </>
              )}
            </div>
          )}

          {/* ── Share with fans: story, voice memo, message ── */}
          {createTab === 'share' && (() => {
            const tabs = [
              { id: 'story', label: 'Story',      icon: Camera,    feature: 'stories' },
              { id: 'memo',  label: 'Voice memo', icon: Mic,       feature: 'voice_memo' },
              { id: 'dm',    label: 'Message',    icon: Megaphone, feature: 'fan_broadcast' },
            ];
            const current = tabs.find(t => t.id === shareTab) || tabs[0];
            const allowed = hasFeature(current.feature);
            return (
              <div className="space-y-4">
                <div className="grid grid-cols-3 gap-1.5 p-1.5 rounded-2xl bg-white/[0.05] border border-white/[0.06]">
                  {tabs.map(t => (
                    <button key={t.id} onClick={() => setShareTab(t.id)}
                      className={`flex flex-col items-center justify-center gap-1 py-3 rounded-xl text-xs font-black transition ${shareTab === t.id ? 'bg-white text-black shadow' : 'text-white/60 hover:text-white hover:bg-white/[0.05]'}`}>
                      <t.icon className="w-5 h-5" />
                      {t.label}
                    </button>
                  ))}
                </div>

                {!allowed ? (
                  <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-6 text-center">
                    <p className="text-base font-black text-white">{FEATURE_LABELS?.[current.feature] || current.label} comes with a higher plan</p>
                    <p className="text-sm text-white/50 mt-1">Upgrade to unlock it.</p>
                    <button onClick={() => { close(); navigate('/upgrade'); }}
                      className="mt-4 w-full py-3.5 rounded-2xl text-base font-black" style={{ backgroundColor: primaryColor, color: bgColor }}>
                      See plans
                    </button>
                  </div>
                ) : shareTab === 'story' ? (
                  <div className="rounded-2xl border border-white/[0.08] overflow-hidden bg-white/[0.02] fm-panel-big">
                    <StoryUpload artistId={artist.id} inline onUploaded={close} />
                  </div>
                ) : shareTab === 'memo' ? (
                  <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-4 fm-panel-big">
                    <VoiceMemoUpload artistId={artist.id} onUploaded={close} />
                  </div>
                ) : (
                  <div className="space-y-3">
                    <p className="text-sm text-white/60">Goes to everyone who follows you, in their notifications and on their phone.</p>
                    <textarea rows={6} maxLength={280} value={dmMessage}
                      onChange={e => setDmMessage(e.target.value)}
                      placeholder="New music on Friday? Going live tonight? Tell them."
                      className="w-full px-4 py-3.5 bg-white/[0.06] rounded-2xl text-white text-base outline-none resize-none border border-white/[0.08] focus:border-white/25 transition placeholder-white/25" />
                    <div className="flex justify-end"><span className="text-xs text-white/30">{dmMessage.length}/280</span></div>
                    <div className="sticky bottom-0 -mx-5 px-5 pt-4 mt-2 bg-gradient-to-t from-[#0c0b10] via-[#0c0b10] to-[#0c0b10]/0" style={{ paddingBottom: 'max(16px, env(safe-area-inset-bottom, 0px))' }}>
                    <button onClick={sendDMToFollowers} disabled={!dmMessage.trim() || dmSending || dmSent}
                      className="w-full py-4 rounded-2xl text-base font-black transition disabled:opacity-40 flex items-center justify-center gap-2"
                      style={{ backgroundColor: primaryColor, color: bgColor }}>
                      {dmSending ? <Loader className="w-5 h-5 animate-spin" /> : dmSent ? <><Check className="w-5 h-5" /><span>Sent</span></> : <><Send className="w-5 h-5" /><span>Send to my followers</span></>}
                    </button>
                    </div>
                  </div>
                )}
                <style>{`
                  .fm-panel-big input, .fm-panel-big textarea { font-size: 16px; }
                  .fm-panel-big button { min-height: 44px; }
                `}</style>
              </div>
            );
          })()}

          {/* ── Go Live ── */}
          {createTab === 'live' && (
            <div className="space-y-5">
              {/* What kind of stream */}
              <div className={`grid gap-3 ${directCfg.canHost ? 'grid-cols-2 sm:grid-cols-3' : 'grid-cols-2'}`}>
                {[
                  ...(directCfg.canHost ? [{ id: 'direct', icon: Radio, title: 'Direct from OBS', sub: 'Straight into Feelz Machine, recorded for the replay' }] : []),
                  { id: 'youtube', icon: Youtube, title: directCfg.canHost ? 'Via YouTube' : 'Video stream', sub: 'Stream from OBS to YouTube, fans watch it here' },
                  { id: 'audio',   icon: Music,   title: 'Listening party', sub: 'Play your tracks to fans in sync and chat' },
                ].map(m => {
                  const on = liveMode === m.id;
                  return (
                    <button key={m.id} onClick={() => setLiveMode(m.id)}
                      className={`text-left p-4 rounded-2xl border-2 transition ${on ? 'border-white bg-white/[0.08]' : 'border-white/[0.08] bg-white/[0.03] hover:border-white/20'}`}>
                      <span className={`w-10 h-10 rounded-xl flex items-center justify-center mb-3 ${on ? 'bg-gradient-to-br from-red-500 to-pink-500' : 'bg-white/[0.08]'}`}>
                        <m.icon className="w-5 h-5 text-white" />
                      </span>
                      <span className="block text-base font-black text-white">{m.title}</span>
                      <span className="block text-xs text-white/50 mt-0.5 leading-snug">{m.sub}</span>
                    </button>
                  );
                })}
              </div>

              <div className="space-y-2">
                <label className="text-xs text-white/50 font-black uppercase tracking-[0.15em]">Title</label>
                <input value={liveTitle} onChange={e => setLiveTitle(e.target.value)}
                  placeholder="Live Reviews Night, Beat Session, Q and A" maxLength={80}
                  className="w-full px-4 py-3.5 bg-white/[0.06] border border-white/[0.08] rounded-2xl text-base text-white placeholder-white/25 focus:outline-none focus:border-white/25" />
              </div>

              {liveMode === 'youtube' && (
                <div className="space-y-2">
                  <label className="text-xs text-white/50 font-black uppercase tracking-[0.15em]">YouTube live link</label>
                  <input value={liveYoutubeUrl} onChange={e => setLiveYoutubeUrl(e.target.value)}
                    placeholder="https://youtube.com/live/..."
                    className="w-full px-4 py-3.5 bg-white/[0.06] border border-white/[0.08] rounded-2xl text-base text-white placeholder-white/25 focus:outline-none focus:border-red-500/50" />
                  <p className="text-xs text-white/40">You can add or change it on the stream page too.</p>
                </div>
              )}

              {liveMode === 'audio' && (
                <div className="space-y-2">
                  <label className="text-xs text-white/50 font-black uppercase tracking-[0.15em]">Tracks to play (optional)</label>
                  <div className="relative">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
                    <input value={trackSearch} onChange={e => setTrackSearch(e.target.value)}
                      placeholder="Search your tracks"
                      className="w-full pl-11 pr-4 py-3.5 bg-white/[0.06] border border-white/[0.08] rounded-2xl text-base text-white placeholder-white/25 focus:outline-none focus:border-white/25" />
                    {searchingTracks && <Loader className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-white/30" />}
                  </div>
                  {trackResults.length > 0 && (
                    <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl overflow-hidden">
                      {trackResults.map(track => (
                        <button key={track.id} onClick={() => addToLiveQueue(track)}
                          className="w-full flex items-center gap-3 px-3 py-3 hover:bg-white/[0.06] transition text-left border-b border-white/[0.04] last:border-0">
                          <div className="w-10 h-10 rounded-lg bg-white/[0.06] flex-shrink-0 overflow-hidden">
                            {track.cover_artwork_url ? <img src={track.cover_artwork_url} alt="" className="w-full h-full object-cover" /> : <Music className="w-4 h-4 text-white/20 m-auto mt-3" />}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-bold text-white truncate">{track.title}</p>
                            {track.duration && <p className="text-xs text-white/40">{fmtLiveDuration(track.duration)}</p>}
                          </div>
                          <Plus className="w-5 h-5 text-white/50 flex-shrink-0" />
                        </button>
                      ))}
                    </div>
                  )}
                  {queueTracks.length > 0 && (
                    <div className="space-y-1.5">
                      {queueTracks.map((track, i) => (
                        <div key={track.id} className="flex items-center gap-3 px-3 py-2.5 rounded-2xl bg-white/[0.05] border border-white/[0.06]">
                          <span className="text-xs font-black text-white/30 w-4 text-center">{i + 1}</span>
                          <div className="w-9 h-9 rounded-lg bg-white/[0.06] flex-shrink-0 overflow-hidden">
                            {track.cover_artwork_url ? <img src={track.cover_artwork_url} alt="" className="w-full h-full object-cover" /> : <Music className="w-4 h-4 text-white/20 m-auto mt-2.5" />}
                          </div>
                          <p className="text-sm text-white flex-1 truncate">{track.title}</p>
                          <button onClick={() => removeFromLiveQueue(track.id)} aria-label="Remove" className="w-9 h-9 flex items-center justify-center rounded-xl hover:bg-white/[0.08] transition">
                            <X className="w-4 h-4 text-white/40" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* When */}
              <div className="space-y-2">
                <label className="text-xs text-white/50 font-black uppercase tracking-[0.15em]">When</label>
                <div className="grid grid-cols-2 gap-1.5 p-1.5 rounded-2xl bg-white/[0.05] border border-white/[0.06]">
                  <button onClick={() => setScheduleMode(false)}
                    className={`py-3 rounded-xl text-sm font-black transition ${!scheduleMode ? 'bg-white text-black' : 'text-white/60'}`}>Right now</button>
                  <button onClick={() => setScheduleMode(true)}
                    className={`py-3 rounded-xl text-sm font-black transition ${scheduleMode ? 'bg-white text-black' : 'text-white/60'}`}>Schedule it</button>
                </div>
                {scheduleMode && (
                  <>
                    <input type="datetime-local" value={scheduledAt} onChange={e => setScheduledAt(e.target.value)}
                      min={new Date().toISOString().slice(0, 16)}
                      className="w-full px-4 py-3.5 bg-white/[0.06] border border-white/[0.08] rounded-2xl text-base text-white focus:outline-none focus:border-violet-500/50" />
                    <p className="text-xs text-white/40">Fans get a heads-up now, a reminder 15 minutes before, and an alert when you go live.</p>
                  </>
                )}
              </div>

              <button onClick={() => { close(); navigate('/live/studio'); }}
                className="w-full py-3 rounded-2xl text-sm font-bold text-white/60 hover:text-white bg-white/[0.04] hover:bg-white/[0.08] transition">
                Open your Live Studio
              </button>
              {liveError && <p className="text-sm text-red-300 text-center">{liveError}</p>}

              {/* Pinned, so the main button is always in reach on a small screen. */}
              <div className="sticky bottom-0 -mx-5 px-5 pt-4 mt-2 bg-gradient-to-t from-[#0c0b10] via-[#0c0b10] to-[#0c0b10]/0" style={{ paddingBottom: 'max(16px, env(safe-area-inset-bottom, 0px))' }}>
              <button onClick={startLiveSession}
                disabled={startingSession || !liveTitle.trim() || (scheduleMode && !scheduledAt)}
                className={`w-full py-4 rounded-2xl disabled:opacity-40 transition text-white font-black text-base flex items-center justify-center gap-2 shadow-lg ${scheduleMode ? 'bg-gradient-to-r from-violet-600 to-pink-500' : 'bg-gradient-to-r from-red-500 to-pink-500'}`}>
                {startingSession
                  ? <><Loader className="w-5 h-5 animate-spin" /><span>{scheduleMode ? 'Scheduling' : 'Starting'}</span></>
                  : scheduleMode ? <><Calendar className="w-5 h-5" /><span>Schedule stream</span></> : <><Radio className="w-5 h-5" /><span>Go live now</span></>}
              </button>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>,
    document.body
  );
}
