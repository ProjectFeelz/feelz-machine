import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { sendArtistBroadcast } from '../utils/notify';
import { useTier, FEATURE_LABELS } from '../contexts/useTier';
import { useAuth } from '../contexts/AuthContext';
import useSchoolSessions from '../hooks/useSchoolSessions';
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

export default function CreateMenuModal({ artist, user, onClose, primaryColor = '#90AF2F', bgColor = '#000000' }) {
  const navigate = useNavigate();
  const sessionsGate = useSchoolSessions();
  const { isAdmin, isBeatmaker } = useAuth();
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

  const [createTab, setCreateTab] = useState('menu'); // 'menu' | 'story' | 'dm' | 'memo' | 'live' | 'toppick'
  const [showMerchConnect, setShowMerchConnect] = useState(false);
  const [showMerchParked, setShowMerchParked]   = useState(false);

  const [dmMessage, setDmMessage] = useState('');
  const [dmSending, setDmSending] = useState(false);
  const [dmSent, setDmSent] = useState(false);

  const [liveTitle, setLiveTitle] = useState(artist ? `${artist.artist_name}'s Live Session` : '');
  const [liveMode, setLiveMode] = useState('audio');
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
      const { data: session, error } = await supabase.from('listening_sessions').insert({
        artist_id: artist.id, title, mode: liveMode,
        status: isScheduled ? 'scheduled' : 'live',
        ...(isScheduled ? { scheduled_at: new Date(scheduledAt).toISOString() } : {}),
        ...(liveMode === 'youtube' && liveYoutubeUrl ? { youtube_url: liveYoutubeUrl } : {}),
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
    } catch (err) { console.error('Start session error:', err); }
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
    <div className="fixed inset-0 z-[600] flex items-center justify-center px-6 bg-black/80 backdrop-blur-sm md:pl-64"
      onClick={close}>
      <div className="w-full overflow-y-auto overflow-x-hidden rounded-3xl"
        style={{ maxWidth: 360, maxHeight: '85vh', backgroundColor: '#0f0f0f', border: '1px solid rgba(255,255,255,0.08)', boxShadow: '0 32px 64px rgba(0,0,0,0.6)' }}
        onClick={e => e.stopPropagation()}>

        {/* Header */}
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

        <div className="p-4 space-y-3">

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
                ...(sessionsGate.enabled && sessionsGate.allowed && !sessionsGate.loading
                  ? [{ heading: 'Happening now', icon: Trophy, tint: MENU_TINTS.now, items: [
                      { id: 'sessions', icon: Trophy, label: 'Enter Sessions', sub: 'The cover competition, open to everyone' },
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
                      else if (id === 'memo') { setCreateTab('memo'); }
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

          {/* ── Story ── */}
          {createTab === 'story' && (
            <div className="rounded-2xl border border-white/[0.06] overflow-hidden" style={{ background: 'rgba(255,255,255,0.02)' }}>
              <StoryUpload artistId={artist.id} inline onUploaded={close} />
            </div>
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

          {/* ── Voice Memo ── */}
          {createTab === 'memo' && (
            <VoiceMemoUpload artistId={artist.id} onUploaded={close} />
          )}

          {/* ── Message Fans ── */}
          {createTab === 'dm' && (
            <div className="space-y-3">
              <p className="text-xs text-white/30">Sends a push notification to everyone following you.</p>
              <textarea rows={4} maxLength={280} value={dmMessage}
                onChange={e => setDmMessage(e.target.value)}
                placeholder="Share an update, a hint about new music, or let them know you're going live..."
                className="w-full px-3 py-2.5 bg-white/[0.06] rounded-xl text-white text-sm outline-none resize-none border border-white/[0.06] focus:border-white/20 transition placeholder-white/20" />
              <button onClick={sendDMToFollowers} disabled={!dmMessage.trim() || dmSending || dmSent}
                className="w-full py-3 rounded-2xl text-sm font-semibold transition disabled:opacity-40 flex items-center justify-center space-x-2"
                style={{ backgroundColor: primaryColor, color: bgColor }}>
                {dmSending ? <Loader className="w-4 h-4 animate-spin" /> : dmSent ? <><Check className="w-4 h-4" /><span>Sent!</span></> : <><Send className="w-4 h-4" /><span>Send to followers</span></>}
              </button>
            </div>
          )}

          {/* ── Go Live ── */}
          {createTab === 'live' && (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs text-white/40 font-medium uppercase tracking-wider">Session Title</label>
                <input value={liveTitle} onChange={e => setLiveTitle(e.target.value)}
                  placeholder="Give your session a name..." maxLength={80}
                  className="w-full px-3 py-2.5 bg-white/[0.06] border border-white/[0.08] rounded-xl text-sm text-white placeholder-white/25 focus:outline-none focus:border-white/20" />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs text-white/40 font-medium uppercase tracking-wider">Stream Type</label>
                <div className="grid grid-cols-2 gap-2">
                  <button onClick={() => setLiveMode('audio')}
                    className={`flex items-center justify-center space-x-2 py-3 rounded-xl border text-sm font-medium transition ${liveMode === 'audio' ? 'bg-white/15 border-white/20 text-white' : 'bg-white/[0.04] border-white/[0.06] text-white/40'}`}>
                    <Music className="w-4 h-4" /><span>Audio Queue</span>
                  </button>
                  <button onClick={() => setLiveMode('youtube')}
                    className={`flex items-center justify-center space-x-2 py-3 rounded-xl border text-sm font-medium transition ${liveMode === 'youtube' ? 'bg-red-500/20 border-red-500/30 text-red-400' : 'bg-white/[0.04] border-white/[0.06] text-white/40'}`}>
                    <Youtube className="w-4 h-4" /><span>YouTube Live</span>
                  </button>
                </div>
              </div>
              {liveMode === 'audio' && (
                <div className="space-y-2">
                  <label className="text-xs text-white/40 font-medium uppercase tracking-wider">Queue Tracks (optional)</label>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/30" />
                    <input value={trackSearch} onChange={e => setTrackSearch(e.target.value)}
                      placeholder="Search your tracks..."
                      className="w-full pl-9 pr-3 py-2.5 bg-white/[0.06] border border-white/[0.08] rounded-xl text-sm text-white placeholder-white/25 focus:outline-none focus:border-white/20" />
                    {searchingTracks && <Loader className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 animate-spin text-white/30" />}
                  </div>
                  {trackResults.length > 0 && (
                    <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl overflow-hidden">
                      {trackResults.map(track => (
                        <button key={track.id} onClick={() => addToLiveQueue(track)}
                          className="w-full flex items-center space-x-3 px-3 py-2.5 hover:bg-white/[0.06] transition text-left border-b border-white/[0.04] last:border-0">
                          <div className="w-8 h-8 rounded-lg bg-white/[0.06] flex-shrink-0 overflow-hidden">
                            {track.cover_artwork_url ? <img src={track.cover_artwork_url} alt="" className="w-full h-full object-cover" /> : <Music className="w-3.5 h-3.5 text-white/20 m-auto mt-2" />}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm text-white truncate">{track.title}</p>
                            {track.duration && <p className="text-[10px] text-white/30">{fmtLiveDuration(track.duration)}</p>}
                          </div>
                          <Plus className="w-4 h-4 text-white/40 flex-shrink-0" />
                        </button>
                      ))}
                    </div>
                  )}
                  {queueTracks.length > 0 && (
                    <div className="space-y-1">
                      {queueTracks.map((track, i) => (
                        <div key={track.id} className="flex items-center space-x-2.5 px-2 py-2 rounded-xl bg-white/[0.04] border border-white/[0.06]">
                          <span className="text-[10px] text-white/20 w-4 text-center">{i + 1}</span>
                          <div className="w-7 h-7 rounded-md bg-white/[0.06] flex-shrink-0 overflow-hidden">
                            {track.cover_artwork_url ? <img src={track.cover_artwork_url} alt="" className="w-full h-full object-cover" /> : <Music className="w-3 h-3 text-white/20 m-auto mt-2" />}
                          </div>
                          <p className="text-xs text-white flex-1 truncate">{track.title}</p>
                          {track.duration && <p className="text-[10px] text-white/30 flex-shrink-0">{fmtLiveDuration(track.duration)}</p>}
                          <button onClick={() => removeFromLiveQueue(track.id)} className="p-1 rounded-lg hover:bg-white/[0.08] transition">
                            <X className="w-3.5 h-3.5 text-white/30" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
              {liveMode === 'youtube' && (
                <div className="space-y-1.5">
                  <label className="text-xs text-white/40 font-medium uppercase tracking-wider">YouTube Live URL (optional)</label>
                  <input value={liveYoutubeUrl} onChange={e => setLiveYoutubeUrl(e.target.value)}
                    placeholder="https://youtube.com/live/..."
                    className="w-full px-3 py-2.5 bg-white/[0.06] border border-white/[0.08] rounded-xl text-sm text-white placeholder-white/25 focus:outline-none focus:border-red-500/40" />
                </div>
              )}
              <button onClick={() => setScheduleMode(v => !v)}
                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl border text-sm transition ${scheduleMode ? 'bg-purple-500/15 border-purple-500/30 text-purple-300' : 'bg-white/[0.04] border-white/[0.06] text-white/40'}`}>
                <span>Schedule for later</span><span className="text-xs">{scheduleMode ? 'On' : 'Off'}</span>
              </button>
              {scheduleMode && (
                <input type="datetime-local" value={scheduledAt} onChange={e => setScheduledAt(e.target.value)}
                  min={new Date().toISOString().slice(0, 16)}
                  className="w-full px-3 py-2.5 bg-white/[0.06] border border-white/[0.08] rounded-xl text-sm text-white focus:outline-none focus:border-purple-500/40" />
              )}
              <button onClick={startLiveSession}
                disabled={startingSession || !liveTitle.trim() || (scheduleMode && !scheduledAt)}
                className={`w-full py-3 rounded-xl disabled:opacity-40 transition text-white font-semibold text-sm flex items-center justify-center space-x-2 ${scheduleMode ? 'bg-purple-500 hover:bg-purple-400' : 'bg-red-500 hover:bg-red-400'}`}>
                {startingSession
                  ? <><Loader className="w-4 h-4 animate-spin" /><span>{scheduleMode ? 'Scheduling...' : 'Starting...'}</span></>
                  : scheduleMode ? <><Calendar className="w-4 h-4" /><span>Schedule Stream</span></> : <><Radio className="w-4 h-4" /><span>Go Live</span></>}
              </button>
            </div>
          )}

        </div>
      </div>
    </div>,
    document.body
  );
}
