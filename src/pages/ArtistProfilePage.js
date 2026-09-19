import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Helmet } from 'react-helmet-async';
import { downloadTrack, downloadErrorMessage } from '../utils/downloadTrack';
import { collabRoleLabel, collabCredit } from '../constants/collabRoles';
import TrackActionSheet from '../components/TrackActionSheet';
// TrackVersions is not imported here any more: versions moved to the track
// page when Popular became a card rail with nowhere to expand into.
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import useGoBack from '../hooks/useGoBack';
import PriceBreakdown, { useQuote } from '../components/PriceBreakdown';
import { supabase } from '../supabaseClient';
import { showReceipt } from '../components/PurchaseReceipt';
import { useAuth } from '../contexts/AuthContext';
import { useTier } from '../contexts/useTier';
import { usePlayer } from '../contexts/PlayerContext';
import {
  ArrowLeft, Calendar, Play, Share2,
  UserPlus, UserCheck, Instagram, Twitter, Youtube,
  Globe, Music, Loader, Heart, Check, DollarSign, MessageCircle,
  ChevronDown, ChevronUp, Send, Trash2, Shuffle, Users, Plus, ShoppingBag,
  Radio, X, Search, Info, Bell, BellOff, ChevronRight,
} from 'lucide-react';
import VerifiedBadge from '../components/VerifiedBadge';
import { ArtistProfileSkeleton } from '../components/SkeletonLoader';
import ShareCard from '../components/ShareCard';
import PreorderTag from '../components/PreorderTag';
import { usePullToRefresh } from '../hooks/usePullToRefresh';
import PullToRefreshIndicator from '../components/PullToRefreshIndicator';
import { VoiceMemoCard, VoiceMemoUpload } from '../components/VoiceMemo';
import TipButton from '../components/TipButton';
import TipGoal from '../components/TipGoal';
import { ArtistStoryView, StoryUpload } from '../components/ArtistStories';
// PreSaveButton moved to the track page with versions, for the same reason.
import ArtistGuestbook from '../components/ArtistGuestbook';
import MerchConnectSheet from '../components/MerchConnectSheet';
import MerchParked from '../components/MerchParked';
import { MERCH_PARKED } from '../config/features';
import ChallengeXPModal from '../components/ChallengeXPModal';
import { askNotificationPermission } from '../utils/askNotificationPermission';
import { sendArtistBroadcast, sendNotification } from '../utils/notify';

const PAYPAL_CLIENT_ID = process.env.REACT_APP_PAYPAL_CLIENT_ID;
const EMOJI_REACTIONS = ['🔥', '❤️', '👏', '😮', '😂', '🎵'];
const BASE_URL = 'https://www.feelzmachine.com';

const TikTokIcon = ({ className, style }) => (
  <svg className={className} style={style} viewBox="0 0 24 24" fill="currentColor">
    <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-2.88 2.5 2.89 2.89 0 0 1-2.89-2.89 2.89 2.89 0 0 1 2.89-2.89c.28 0 .54.04.79.1V9.01a6.33 6.33 0 0 0-.79-.05 6.34 6.34 0 0 0-6.34 6.34 6.34 6.34 0 0 0 6.34 6.34 6.34 6.34 0 0 0 6.33-6.34V8.69a8.18 8.18 0 0 0 4.78 1.52V6.75a4.85 4.85 0 0 1-1.01-.06z"/>
  </svg>
);

const DiscordIcon = ({ className, style }) => (
  <svg className={className} style={style} viewBox="0 0 24 24" fill="currentColor">
    <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/>
  </svg>
);

const SOCIAL_ICONS = {
  instagram: Instagram, twitter: Twitter, youtube: Youtube,
  tiktok: TikTokIcon, facebook: Globe, discord: DiscordIcon, website: Globe,
};

const SOCIAL_URLS = {
  instagram: 'https://instagram.com/', twitter: 'https://x.com/',
  youtube: 'https://youtube.com/', tiktok: 'https://tiktok.com/@', facebook: 'https://facebook.com/',
};

function formatNumber(n) {
  if (!n) return '0';
  if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
  if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
  return n.toString();
}

function formatDuration(seconds) {
  if (!seconds) return '';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function timeAgo(date) {
  const seconds = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// ThoughtBlock removed with the Thought of the Day feature.
// It posted to artist_thoughts and rendered only inside one tab on
// this page, so it was made rarely and found less often. Story and
// Voice Memo carry the same intent and both reach followers.

export default function ArtistProfilePage() {
  const { slug } = useParams();
  const navigate = useNavigate();
  // Back that works on a cold deep link. navigate(-1) does nothing when
  // this page IS the first history entry, which is every shared link and
  // every tapped push notification. See src/hooks/useGoBack.js.
  const goBack = useGoBack('/browse');
  const location = useLocation();
  const { user, artist: myArtist } = useAuth();
  const { isPremium, isListenerPro } = useTier();
  const { playTrack, addToQueue, currentTrack, isPlaying, togglePlay, showNotice } = usePlayer();

  const [artist, setArtist] = useState(null);
  const [theme, setTheme] = useState(null);
  const [tracks, setTracks] = useState([]);
  const [albums, setAlbums] = useState([]);
  const [collabs, setCollabs] = useState([]);
  const [isFollowing, setIsFollowing] = useState(false);
  const [followerCount, setFollowerCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [actionSheetTrack, setActionSheetTrack] = useState(null);
  const [copied, setCopied] = useState(false);
  const [showShareCard, setShowShareCard] = useState(false);
  const [downloading, setDownloading] = useState(null);
  const [purchaseTrack, setPurchaseTrack] = useState(null);
  const [purchasing, setPurchasing] = useState(false);
  const [purchaseSuccess, setPurchaseSuccess] = useState(false);
  const [paypalReady, setPaypalReady] = useState(false);
  const [purchaseError, setPurchaseError] = useState('');
  const [pwywTrack, setPwywTrack] = useState(null);
  const [pwywFanPrice, setPwywFanPrice] = useState('');
  const [pwywFanPriceError, setPwywFanPriceError] = useState('');
  const [pwywPaypalReady, setPwywPaypalReady] = useState(false);
  const [pwywPurchaseSuccess, setPwywPurchaseSuccess] = useState(false);
  const [pwywPurchaseError, setPwywPurchaseError] = useState('');

  // What the buyer will actually be charged.
  //
  // Was a local useState plus a local fetch in this file, written before
  // src/components/PriceBreakdown.js existed. Now the same hook the other four
  // purchase screens use, so there is one implementation of "ask the server
  // what this costs" rather than this file having its own. It also brings the
  // out-of-order-response guard, which the local copy did not have: two quotes
  // in flight while somebody types a pay-what-you-want amount could land in the
  // wrong order and show a total that did not match the box.
  //
  // `quoteFor` is what the two modals set; null clears it.
  const [quoteFor, setQuoteFor] = useState(null);
  const { quote } = useQuote(quoteFor, quoteFor?.amount != null ? 400 : 0);
  const [likedTracks, setLikedTracks] = useState({});
  const [showAddToPlaylist, setShowAddToPlaylist] = useState(null);
  const [playlists, setPlaylists] = useState([]);
  const [addingTo, setAddingTo] = useState(null);
  const [addedTo, setAddedTo] = useState({});
  const [similarArtists, setSimilarArtists] = useState([]);
  const [artistPlaylists, setArtistPlaylists] = useState([]);
  const [highlightedTrackId, setHighlightedTrackId] = useState(null);
  const [voiceMemos, setVoiceMemos] = useState([]);
  const [stories, setStories]         = useState([]);
  const [bioOpen, setBioOpen] = useState(false);
  const [topPick, setTopPick] = useState(null);
  const [viewingStory, setViewingStory]   = useState(false);
  const [showCommunity, setShowCommunity]     = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showMerchConnect, setShowMerchConnect] = useState(false);
  const [showMerchParked, setShowMerchParked]   = useState(false);
  const [createTab, setCreateTab]             = useState('menu'); // 'menu' | 'story' | 'dm' | 'memo' | 'live'
  // Live session state (for create modal)
  const [liveTitle, setLiveTitle]               = useState('');
  const [liveMode, setLiveMode]                 = useState('audio');
  const [liveYoutubeUrl, setLiveYoutubeUrl]     = useState('');
  const [scheduleMode, setScheduleMode]         = useState(false);
  const [scheduledAt, setScheduledAt]           = useState('');
  const [queueTracks, setQueueTracks]           = useState([]);
  const [trackSearch, setTrackSearch]           = useState('');
  const [trackResults, setTrackResults]         = useState([]);
  const [searchingTracks, setSearchingTracks]   = useState(false);
  const [startingSession, setStartingSession]   = useState(false);
  const [weeklyDiscoveries, setWeeklyDiscoveries] = useState(0);
  const [purchasedTracks, setPurchasedTracks] = useState({});
  const [liveSession, setLiveSession] = useState(null);
  const [radioLoading, setRadioLoading] = useState(false);
  const [chatOpening, setChatOpening]   = useState(false);
  const [chatError, setChatError]       = useState('');
  const [notifEnabled, setNotifEnabled] = useState(false);
  const [notifLoading, setNotifLoading] = useState(false);
  const [showDMModal, setShowDMModal] = useState(false);
  const [showXPModal, setShowXPModal]   = useState(false);
  const [xpData, setXpData]             = useState(null);
  const [dmMessage, setDmMessage]     = useState('');
  const [dmSending, setDmSending]     = useState(false);
  const [dmSent, setDmSent]           = useState(false);
  const liveCheckRef = useRef(null);
  const [scheduledSession, setScheduledSession] = useState(null);
  const [topListeners, setTopListeners]         = useState([]);

  const fetchTopListeners = async (artistId) => {
    // Top 5 listeners by stream count for this artist's tracks
    try {
      const { data: trackData } = await supabase
        .from('tracks').select('id').eq('artist_id', artistId).eq('is_published', true);
      const trackIds = (trackData || []).map(t => t.id);
      if (!trackIds.length) return;

      // Capped. This had no limit at all: every stream row the artist has ever
      // had, pulled into the browser to be counted in a loop. On a popular
      // artist it was the heaviest request on the page by a wide margin.
      // Newest first, so the top five reflect recent listening rather than
      // whichever thousand rows the server happened to return.
      const { data: streamData } = await supabase
        .from('streams')
        .select('user_id')
        .in('track_id', trackIds)
        .order('created_at', { ascending: false })
        .limit(1000);
      if (!streamData?.length) return;

      // Count streams per user
      const counts = {};
      streamData.forEach(s => { counts[s.user_id] = (counts[s.user_id] || 0) + 1; });
      const top5 = Object.entries(counts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([uid, count]) => ({ user_id: uid, count }));

      // Enrich with profile data
      const uids = top5.map(t => t.user_id).filter(Boolean);
      if (!uids.length) return;
      const [{ data: artistProfiles }, { data: listenerProfiles }] = await Promise.all([
        supabase.from('artists').select('user_id, artist_name, profile_image_url, slug').in('user_id', uids),
        supabase.from('user_profiles').select('user_id, name, avatar_url').in('user_id', uids),
      ]);
      const artistMap = {};
      (artistProfiles || []).forEach(a => { artistMap[a.user_id] = a; });
      const listenerMap = {};
      (listenerProfiles || []).forEach(l => { listenerMap[l.user_id] = l; });

      setTopListeners(top5.map(({ user_id, count }) => {
        const a = artistMap[user_id];
        const l = listenerMap[user_id];
        return {
          user_id,
          count,
          name:   a?.artist_name || l?.name || 'Listener',
          avatar: a?.profile_image_url || l?.avatar_url || null,
          slug:   a?.slug || null,
        };
      }));
    } catch (err) { console.error('Top listeners error:', err); }
  };

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

  useEffect(() => { if (slug) fetchArtist(); }, [slug]);
  useEffect(() => { if (artist?.id) fetchTopListeners(artist.id); }, [artist?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Live session check ────────────────────────────────────────────────────
  useEffect(() => {
    if (!artist?.id) return;
    let cancelled = false;
    const check = async () => {
      const [liveRes, scheduledRes] = await Promise.all([
        supabase.from('listening_sessions').select('id, title')
          .eq('artist_id', artist.id).eq('status', 'live').limit(1).maybeSingle(),
        supabase.from('listening_sessions').select('id, title, scheduled_at')
          .eq('artist_id', artist.id).eq('status', 'scheduled')
          .gt('scheduled_at', new Date().toISOString())
          .order('scheduled_at', { ascending: true }).limit(1).maybeSingle(),
      ]);
      if (!cancelled) {
        setLiveSession(liveRes.error ? null : (liveRes.data || null));
        setScheduledSession(scheduledRes.error ? null : (scheduledRes.data || null));
      }
    };
    check();
    liveCheckRef.current = setInterval(check, 30_000);
    return () => { cancelled = true; clearInterval(liveCheckRef.current); };
  }, [artist?.id]);
  useEffect(() => {
    if (!artist?.id) return;
    supabase.from('artist_stories')
      .select('*')
      .eq('artist_id', artist.id)
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false })
      .limit(20)
      .then(({ data }) => setStories(data || []));
    supabase.from('artist_voice_memos')
      .select('*').eq('artist_id', artist.id)
      .order('created_at', { ascending: false }).limit(10)
      .then(({ data }) => setVoiceMemos(data || []));
  }, [artist?.id]);

  // Deep cuts removed with its row. Nothing rendered it.

  // ── Weekly discovery count (how many new listeners this week) ────────────
  useEffect(() => {
    if (!artist?.id) return;
    const ids = tracks.map(t => t.id).filter(Boolean);
    // Fired once with an empty id list before tracks landed, and the count was
    // requested WITHOUT head: true — so it downloaded every matching row and
    // then counted them, to display one number.
    if (!ids.length) { setWeeklyDiscoveries(0); return; }
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    supabase.from('streams')
      .select('user_id', { count: 'exact', head: true })
      .in('track_id', ids)
      .gte('created_at', weekAgo)
      .then(({ count }) => setWeeklyDiscoveries(count || 0));
  }, [artist?.id, tracks]);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const trackSlug = params.get('track');
    if (trackSlug && tracks.length > 0) {
      const match = tracks.find(t => t.slug === trackSlug);
      if (match) {
        // The list is a fixed top ten now, so a link to a track outside it
        // would highlight something that is not rendered. visibleTracks
        // appends the linked track when it is missing, so the deep link
        // still lands on it.
        setHighlightedTrackId(match.id);
        setTimeout(() => {
          const el = document.getElementById(`track-${match.id}`);
          if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 400);
      }
    }
  }, [location.search, tracks]);

  const fetchArtist = async () => {
    setLoading(true);
    try {
      const { data: artistData, error } = await supabase
        .from('artists').select('*').eq('slug', slug).maybeSingle();
      if (error || !artistData) {
        setLoading(false);
        navigate('/browse', { replace: true });
        return;
      }
      setArtist(artistData);

      // My Top Pick: one track the artist chose to lead with. Fetched
      // separately rather than joined, so a pick pointing at a track that
      // has since been unpublished simply shows nothing instead of
      // breaking the profile query.
      if (artistData?.top_pick_track_id) {
        supabase
          .from('tracks')
          .select('*, albums(title, cover_artwork_url, price)')
          .eq('id', artistData.top_pick_track_id)
          .eq('is_published', true)
          .maybeSingle()
          .then(({ data }) => setTopPick(data || null));
      } else {
        setTopPick(null);
      }
      // Live follower count — avoids stale cached column
supabase.from('follows').select('*', { count: 'exact', head: true })
  .eq('artist_id', artistData.id)
  .then(({ count }) => setFollowerCount(count || 0));
      // The theme read does not depend on anything below it, and nothing below
      // it depends on the theme, so it no longer blocks the track list. It is
      // started here and awaited after the tracks land.
      const themePromise = supabase
        .from('artist_themes').select('*').eq('artist_id', artistData.id).maybeSingle();

      let trackQuery = supabase
        .from('tracks')
        .select('*, albums(title, cover_artwork_url, price), pay_what_you_want, minimum_price, is_preorder, release_date')
        .eq('artist_id', artistData.id)
        .eq('is_published', true)
        .order('engagement_score', { ascending: false });
      // Unreleased pre-orders stay in the list for everyone now.
      //
      // This page used to be the only surface that filtered them out for
      // non-Pro listeners, while Home, Browse and For You listed them and
      // played them. So the same track was hidden here and audible there,
      // which is the worst of both.
      //
      // Steve's decision is listed-but-not-playable: an upcoming release
      // should be discoverable, with its date on the card, because that is
      // what a pre-order is for. Enforcement moved to the playback gate in
      // PlayerContext, which is the only place that can cover all 39 play
      // paths, and PreorderTag puts the date on the card. Fan Pro's early
      // access is honoured by the gate rather than by hiding rows here.
      const { data: trackData } = await trackQuery;
      setTracks(trackData || []);

      const { data: themeData } = await themePromise;
      if (themeData) setTheme(themeData);

      if (user) {
        // Scoped to THIS artist's tracks. It used to fetch the viewer's entire
        // like history across the whole platform in order to tick hearts on
        // one page — a list that grows forever and is thrown away on
        // navigation, and which the 1000 row cap silently truncates, so a
        // heavy liker's older likes stopped showing as liked.
        const ids = (trackData || []).map(t => t.id).filter(Boolean);
        const likeMap = {};
        if (ids.length) {
          const { data: likes } = await supabase
            .from('track_likes').select('track_id')
            .eq('user_id', user.id).in('track_id', ids);
          (likes || []).forEach(l => { likeMap[l.track_id] = true; });
        }
        setLikedTracks(likeMap);
      }
      // Fetch artist's own playlists + collaborative playlists
      const [{ data: ownPlaylists }, { data: collabPlaylists }] = await Promise.all([
        supabase.from('playlists')
          .select('id, name, cover_url, user_id, created_at, is_shared, playlist_tracks(id, position, tracks(cover_artwork_url))')
          .eq('user_id', artistData.user_id)
          .order('created_at', { ascending: false })
          .limit(10),
        supabase.from('playlist_collaborators')
          .select('playlists(id, name, cover_url, user_id, created_at, is_shared)')
          .eq('user_id', artistData.user_id),
      ]);
      const collabFlat = (collabPlaylists || []).map(c => c.playlists).filter(Boolean);
      // Merge, deduplicate by id
      const seen = new Set();
      const merged = [...(ownPlaylists || []), ...collabFlat].filter(p => {
        if (!p || seen.has(p.id)) return false;
        seen.add(p.id); return true;
      });
      setArtistPlaylists(merged);

      const { data: albumData } = await supabase
        .from('albums').select('*').eq('artist_id', artistData.id).eq('is_published', true)
        .order('release_date', { ascending: false });
      setAlbums(albumData || []);
      // Fetch both directions:
      // 1. Collabs where this artist IS the collaborator on someone else's track
      // 2. Collabs on tracks owned by this artist (beatmakers/featured artists credited)
      // Errors read, not discarded. The Collaborations section renders nothing
      // when the list is empty, so a failed query used to look exactly like an
      // artist who has never collaborated.
      // The collaborating artist's name is selected as well as the track.
      //
      // The relationship MUST be named. `collaborations` has two foreign keys
      // to `artists` — collaborations_artist_id_fkey and
      // collaborations_invited_by_fkey — so a bare `artists(...)` embed is
      // ambiguous and PostgREST answers PGRST201 as HTTP 300. That is the exact
      // failure that emptied For You and Browse on 2026-09-08, and an
      // unqualified embed here would have taken this rail down the same way.
      const COLLAB_SELECT =
        '*, tracks(id, title, slug, cover_artwork_url, file_url, duration, stream_count, artist_id, is_downloadable, download_price, is_published)'
        + ', artists!collaborations_artist_id_fkey(id, artist_name, slug)';

      const { data: asCollaborator, error: asCollabErr } = await supabase
        .from('collaborations')
        .select(COLLAB_SELECT)
        .eq('artist_id', artistData.id).eq('status', 'accepted');
      if (asCollabErr) console.error('[profile] collaborations (as collaborator) failed:',
        asCollabErr.code, asCollabErr.message, asCollabErr.details || '', asCollabErr.hint || '');

      // Get track IDs owned by this artist
      const ownTrackIds = (trackData || []).map(t => t.id).filter(Boolean);
      let onOwnTracks = [];
      if (ownTrackIds.length > 0) {
        const { data: ownTrackCollabs, error: ownCollabErr } = await supabase
          .from('collaborations')
          .select(COLLAB_SELECT)
          .in('track_id', ownTrackIds)
          .eq('status', 'accepted')
          .neq('artist_id', artistData.id);
        if (ownCollabErr) console.error('[profile] collaborations (on own tracks) failed:',
          ownCollabErr.code, ownCollabErr.message, ownCollabErr.details || '', ownCollabErr.hint || '');
        onOwnTracks = ownTrackCollabs || [];
      }

      // Merge and deduplicate by id.
      //
      // The two queries mean OPPOSITE things and the merge used to lose that.
      //
      //   asCollaborator — artist_id = me. I am the guest on someone else's
      //                    track, and `role` is MY role. "Featured" is right.
      //   onOwnTracks    — the track is mine and artist_id is somebody ELSE.
      //                    `role` is THEIR role, not mine.
      //
      // The card rendered `collab.role` either way with no name attached, so
      // every guest credited on this artist's own songs came out reading
      // "featured" — as if they were featured on their own track. Tagging the
      // direction here is what lets the card say whose role it is.
      const allCollabs = [
        ...(asCollaborator || []).map(c => ({ ...c, direction: 'guest' })),
        ...onOwnTracks.map(c => ({ ...c, direction: 'host' })),
      ];
      const seenCollabs = new Set();
      const uniqueCollabs = allCollabs.filter(col => {
        if (seenCollabs.has(col.id)) return false;
        seenCollabs.add(col.id);
        return true;
      })
      // Only collaborations on tracks that have actually launched.
      //
      // This is what produced the row of "Untitled" cards. A collaboration
      // row survives its track being unpublished, and two different things
      // then make the track unusable here: an unpublished track is hidden by
      // RLS, so the embed comes back as tracks: null, and a draft that was
      // never named has no title. Either way the card fell through to
      // 'Untitled', with no artwork, and tapping it did nothing because
      // handlePlayTrack needs a file_url.
      //
      // So a collaboration is only shown when its track exists AND is
      // published. Dropping the null case also means a track hidden from this
      // viewer by RLS cannot leak its existence through a credit.
      .filter(col => col.tracks && col.tracks.is_published);
      setCollabs(uniqueCollabs);
      // The streams read that used to sit here is gone. Its result was
      // tallied into tagCounts and then discarded — the row that consumed it
      // was deleted and the query outlived it. A blocking round trip on every
      // signed in profile load, for nothing.

      // Genres come from trackData, which is already in hand from the tracks
      // read above. This used to be a SECOND read of the same table with the
      // same filter, awaited in series, to get two columns that were already
      // on the rows we had.
      const artistGenres = (trackData || []).slice(0, 40);
      if (artistGenres.length > 0) {
        const genres = [...new Set(artistGenres.map(t => t.genre).filter(Boolean))];
        const moods = [...new Set(artistGenres.map(t => t.mood).filter(Boolean))];
        const allTags = [...genres, ...moods];
        if (allTags.length > 0) {
          const orFilter = allTags.map(t => `genre.eq.${t},mood.eq.${t}`).join(',');
          const { data: simTrackData } = await supabase
            .from('tracks')
            .select('artist_id, artists!tracks_artist_id_fkey(id, artist_name, slug, profile_image_url, is_verified, total_streams)')
            .neq('artist_id', artistData.id).eq('is_published', true).or(orFilter).limit(50);
          if (simTrackData) {
            const artistMap = {};
            simTrackData.forEach(t => {
              const a = t.artists;
              if (a && !artistMap[a.id]) artistMap[a.id] = { ...a, matchCount: 0 };
              if (a) artistMap[a.id].matchCount++;
            });
            const sorted = Object.values(artistMap)
              .sort((a, b) => b.matchCount - a.matchCount || b.total_streams - a.total_streams)
              .slice(0, 6);
            setSimilarArtists(sorted);
          }
        }
      }
      if (user) {
        const [{ data: followData }, { data: alertData }] = await Promise.all([
          supabase.from('follows').select('id').eq('artist_id', artistData.id).eq('follower_id', user.id).maybeSingle(),
          supabase.from('artist_alerts').select('id').eq('artist_id', artistData.id).eq('user_id', user.id).maybeSingle(),
        ]);
        setIsFollowing(!!followData);
        setNotifEnabled(!!alertData);
      }
    } catch (err) { console.error('Error fetching artist:', err); }
    setLoading(false);
  };

  useEffect(() => {
    if (!purchaseTrack) return;
    setPaypalReady(false); setPurchaseError('');
    const existing = document.getElementById('paypal-sdk-track');
    if (existing) existing.remove();
    const script = document.createElement('script');
    script.id = 'paypal-sdk-track';
    script.src = `https://www.paypal.com/sdk/js?client-id=${PAYPAL_CLIENT_ID}&currency=USD`;
    script.async = true;
    script.onload = () => setPaypalReady(true);
    script.onerror = () => setPurchaseError('Failed to load PayPal. Please try again.');
    document.head.appendChild(script);
  }, [purchaseTrack?.id]);

  useEffect(() => {
    if (!pwywTrack) return;
    setPwywPaypalReady(false); setPwywPurchaseError('');
    const existing = document.getElementById('paypal-sdk-pwyw');
    if (existing) existing.remove();
    const script = document.createElement('script');
    script.id = 'paypal-sdk-pwyw';
    script.src = `https://www.paypal.com/sdk/js?client-id=${PAYPAL_CLIENT_ID}&currency=USD`;
    script.async = true;
    script.onload = () => setPwywPaypalReady(true);
    script.onerror = () => setPwywPurchaseError('Failed to load PayPal. Please try again.');
    document.head.appendChild(script);
  }, [pwywTrack?.id]);

  useEffect(() => {
    if (!paypalReady || !purchaseTrack || !window.paypal) return;
    const container = document.getElementById('paypal-checkout-container');
    if (!container) return;
    container.innerHTML = '';
    window.paypal.Buttons({
      style: { layout: 'vertical', color: 'gold', shape: 'rect', label: 'pay' },
      createOrder: async () => {
        setPurchasing(true); setPurchaseError('');
        try {
          const res = await fetch('/.netlify/functions/paypal-order', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'create', trackId: purchaseTrack.id, amount: getEffectivePrice(purchaseTrack), trackTitle: purchaseTrack.title, artistName: artist.artist_name }),
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

          // Same guard as the pay-what-you-want button below and the other four
          // purchase paths. `success` only means PayPal took the money; it says
          // nothing about whether the download was granted.
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
          showReceipt({
            kind: 'purchase',
            title: purchaseTrack?.title,
            subtitle: artist?.artist_name,
            amount: purchaseTrack?.download_price,
          });
          setTimeout(async () => { await triggerDownload(purchaseTrack); setPurchaseTrack(null); setPurchaseSuccess(false); }, 1500);
        } catch (err) { setPurchaseError(err.message); setPurchasing(false); }
      },
      onError: (err) => { console.error('PayPal error:', err); setPurchaseError('Payment failed. Please try again.'); setPurchasing(false); },
      onCancel: () => { setPurchasing(false); },
    }).render('#paypal-checkout-container');
  }, [paypalReady, purchaseTrack?.id]);

  const handleFollow = async () => {
    if (!user) { navigate('/login'); return; }
    if (!artist) return;
    // Block new self-follows but allow unfollowing self (cleanup edge case)
    if (user.id === artist.user_id && !isFollowing) return;
    try {
      if (isFollowing) {
        await supabase.from('follows').delete().eq('artist_id', artist.id).eq('follower_id', user.id);
        await supabase.from('artist_alerts').delete().eq('artist_id', artist.id).eq('user_id', user.id);
        setIsFollowing(false);
        setFollowerCount(prev => Math.max(prev - 1, 0));
      } else {
        await supabase.from('follows').insert({ artist_id: artist.id, follower_id: user.id });
        await supabase.from('artist_alerts').upsert({ artist_id: artist.id, user_id: user.id }, { onConflict: 'user_id,artist_id' });
        setIsFollowing(true);
        askNotificationPermission();
        setFollowerCount(prev => prev + 1);
        const { data: myProfile } = await supabase.from('artists').select('id, artist_name, profile_image_url, slug').eq('user_id', user.id).maybeSingle();
        let followerName  = myProfile?.artist_name || null;
        let followerImage = myProfile?.profile_image_url || null;
        let followerSlug  = myProfile?.slug || null;
        if (!followerName) {
          const { data: listenerProfile } = await supabase.from('listeners').select('display_name, avatar_url').eq('user_id', user.id).maybeSingle();
          followerName  = listenerProfile?.display_name || null;
          followerImage = listenerProfile?.avatar_url || null;
        }
        // Deliberately nothing here.
        //
        // notify_artist_new_follower (migration 92) is a trigger on `follows`:
        // the insert above is what sends this, from inside the database. This
        // client insert was a duplicate of it AND rejected by the
        // notifications INSERT policy, since it is addressed to the artist
        // being followed. reportNotify has been logging that 403 faithfully.
      }
    } catch (err) { console.error('Follow error:', err); }
  };
  const handleToggleNotif = async () => {
    if (!user) { navigate('/login'); return; }
    if (notifLoading) return;
    setNotifLoading(true);
    try {
      if (notifEnabled) {
        await supabase.from('artist_alerts').delete().eq('artist_id', artist.id).eq('user_id', user.id);
        setNotifEnabled(false);
      } else {
        await supabase.from('artist_alerts').upsert({ artist_id: artist.id, user_id: user.id }, { onConflict: 'user_id,artist_id' });
        setNotifEnabled(true);
      }
    } catch (err) { console.error('Notif toggle error:', err); }
    setNotifLoading(false);
  };

  // Live session track search
  React.useEffect(() => {
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

  const fmtLiveDuration = (s) => s ? `${Math.floor(s/60)}:${String(s%60).padStart(2,'0')}` : '';
  const addToLiveQueue = (track) => { setQueueTracks(p => [...p, track]); setTrackSearch(''); setTrackResults([]); };
  const removeFromLiveQueue = (id) => setQueueTracks(p => p.filter(t => t.id !== id));

  const startLiveSession = async () => {
    if (!artist || startingSession) return;
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
      setShowCreateModal(false); setCreateTab('menu');
      if (!scheduleMode || !scheduledAt) navigate(`/session/${session.id}`);
    } catch (err) { console.error('Start session error:', err); }
    setStartingSession(false);
  };

  // Open — or, on the first fan who ever asks, create — this artist's room.
  //
  // The room is made by ensure_artist_chat_room (migration 117), a
  // SECURITY DEFINER function, because chat_rooms' only write policy is
  // "artist_id belongs to auth.uid()" and a listener is by definition not
  // that artist. Loosening that policy instead would have let anyone create
  // rooms in any artist's name; the function can do one thing and nothing
  // else. It returns the existing room untouched when there is one.
  //
  // Fan Pro is NOT checked here on purpose. Getting to the room and being
  // able to speak in it are different questions, and ChatRoomView already
  // answers the second one — sending an unsubscribed listener to a locked
  // door they can see through is a better sell than a button that refuses to
  // move.
  const openArtistChat = async () => {
    if (!user)   { navigate('/login'); return; }
    if (!artist?.id || chatOpening) return;
    setChatOpening(true);
    setChatError('');
    const { data, error } = await supabase.rpc('ensure_artist_chat_room', { p_artist_id: artist.id });
    setChatOpening(false);
    if (error) {
      console.error('[profile] ensure_artist_chat_room failed:', error.code, error.message);
      setChatError(
        /no account to chat with/i.test(error.message)
          ? `${artist.artist_name} hasn't claimed their account yet, so there's nobody to chat to.`
          : `Couldn't open the chat: ${error.message}`
      );
      setTimeout(() => setChatError(''), 6000);
      return;
    }
    if (!data) { setChatError("Couldn't open the chat just now. Try again in a moment."); return; }
    navigate(`/chat/${data}`);
  };

  const handleArtistRadio = async () => {
    if (!artist || radioLoading) return;
    setRadioLoading(true);
    try {
      // Start with this artist's tracks
      const myTracks = tracks.map(t => ({ ...t, artist_name: artist.artist_name, artist_slug: artist.slug }));
      
      // Find artists with same genre
      if (artist.genre) {
        const { data: similar } = await supabase
          .from('artists')
          .select('id, artist_name, slug')
          .eq('genre', artist.genre)
          .neq('id', artist.id)
          .order('total_streams', { ascending: false })
          .limit(5);

        if (similar?.length) {
          const simIds = similar.map(a => a.id);
          const { data: simTracks } = await supabase
            .from('tracks')
            .select('*, artists!tracks_artist_id_fkey(artist_name, slug)')
            .in('artist_id', simIds)
            .eq('is_published', true)
            .order('stream_count', { ascending: false })
            .limit(30);

          const normalised = (simTracks || []).map(t => ({
            ...t,
            artist_name: t.artists?.artist_name || 'Unknown',
            artist_slug: t.artists?.slug || null,
          }));

          // Interleave: play this artist first, then similar
          const combined = [...myTracks, ...normalised];
          if (combined.length > 0) {
            playTrack(combined[0], combined);
            setRadioLoading(false);
            return;
          }
        }
      }

      // Fallback: just play this artist's tracks on shuffle
      if (myTracks.length > 0) {
        const shuffled = [...myTracks].sort(() => Math.random() - 0.5);
        playTrack(shuffled[0], shuffled);
      }
    } catch (err) { console.error('Radio error:', err); }
    setRadioLoading(false);
  };

  const sendDMToFollowers = async () => {
    if (!artist || !dmMessage.trim() || dmSending) return;
    setDmSending(true);
    try {
      // Get all follower user_ids
      const { data: follows } = await supabase
        .from('follows').select('follower_id').eq('artist_id', artist.id);
      if (!follows?.length) { setDmSending(false); return; }

      // Exclude the artist themselves from the recipient list
      const followerIds = follows.map(f => f.follower_id).filter(id => id !== user.id);
      // Batch insert notifications (50 at a time)
      for (let i = 0; i < followerIds.length; i += 50) {
        const batch = followerIds.slice(i, i + 50);
        // See migration 108. A batch insert addressed to fans is refused by
        // the notifications INSERT policy, so this DM has never arrived.
        // The RPC intersects the list with this artist's real followers.
        await sendArtistBroadcast(supabase, 'artist DM (profile)', {
          type:       'admin_message',
          title:      `Message from ${artist.artist_name}`,
          message:    dmMessage.trim(),
          metadata:   { from_artist_id: artist.id, artist_name: artist.artist_name },
          recipients: batch,
        });
      }
      // Send push notification to all followers
      try {
        const { data: { session: authSession } } = await supabase.auth.getSession();
        // That comment was wrong: send-push auth was NOT user-token based, it
        // compared 'x-internal-secret' against a server-only env var, so this
        // call returned 401 on every send and no follower ever got the push.
        // It is user-token based now — and the token has to actually be sent.
        fetch('/.netlify/functions/send-push', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            user_ids: followerIds,
            title:    `Message from ${artist.artist_name}`,
            body:     dmMessage.trim().slice(0, 100),
            url:      `/artist/${artist.slug}`,
            tag:      `dm-${artist.id}-${Date.now()}`,
            token:    authSession?.access_token,
          }),
        }).catch(() => {});
      } catch {}

      setDmSent(true);
      setTimeout(() => { setDmSent(false); setShowDMModal(false); setDmMessage(''); }, 2000);
    } catch (err) { console.error('DM error:', err); }
    setDmSending(false);
  };

  const triggerDownload = async (track) => {
    if (!track.is_downloadable) { alert('This track is not available for download.'); return; }
    if (track.download_price > 0 && !purchasedTracks[track.id]) { alert('Purchase required to download.'); return; }
    setDownloading(track.id);
    try {
      try { await supabase.from('downloads').upsert({ user_id: user.id, track_id: track.id }, { onConflict: 'user_id,track_id', ignoreDuplicates: true }); } catch {}
      const { data: myProfile } = await supabase.from('artists').select('id, artist_name, profile_image_url, slug').eq('user_id', user.id).maybeSingle();
      try {
        await sendNotification(supabase, 'download (ArtistProfilePage)', {
          type:     'download',
          artistId: artist.id,
          title:    `${myProfile?.artist_name || 'Someone'} downloaded ${track.title}`,
          message:  '',
          trackId:  track.id,
          metadata: {
            from_artist_id: myProfile?.id || null,
            download: true,
            purchase_price:    track.download_price || 0,
            track_id:          track.id,
            track_title:       track.title,
            track_slug:        track.slug || null,
            from_artist_name:  myProfile?.artist_name || null,
            from_artist_image: myProfile?.profile_image_url || null
          },
        });
      } catch {}
      const { data: { session } } = await supabase.auth.getSession();
      await downloadTrack(track.id, track.title, session?.access_token);
    } catch (err) {
      console.error('Download error:', err);
      showNotice(downloadErrorMessage(err));
    }
    setDownloading(null);
  };

  const getEffectivePrice = (track) => {
    if (track.download_price > 0) return track.download_price;
    if (track.album_id && track.albums?.price > 0) return track.albums.price;
    return 0;
  };

  const handleDownload = (track, e) => {
    e.stopPropagation();
    if (!user) { navigate('/login'); return; }
    if (downloading === track.id) return;
    if (track.pay_what_you_want) {
      const suggested = Math.max(getEffectivePrice(track), parseFloat(track.minimum_price) || 0);
      setPwywFanPrice(suggested > 0 ? suggested.toFixed(2) : '');
      setPwywFanPriceError(''); setPwywPurchaseError(''); setPwywPurchaseSuccess(false);
      setPwywTrack(track);
      setQuoteFor(suggested > 0 ? { trackId: track.id, amount: suggested } : null);
    } else if (getEffectivePrice(track) > 0) {
      setPurchaseTrack(track);
      setQuoteFor({ trackId: track.id });
    } else {
      triggerDownload(track);
    }
  };

  const handleShare = () => {
    setShowShareCard(true);
  };

  const handleLike = async (track, e) => {
    e.stopPropagation();
    if (!user) { navigate('/login'); return; }
    const isLiked = likedTracks[track.id];
    setLikedTracks(prev => ({ ...prev, [track.id]: !isLiked }));
    if (isLiked) {
      await supabase.from('track_likes').delete().eq('track_id', track.id).eq('user_id', user.id);
    } else {
      await supabase.from('track_likes').insert({ track_id: track.id, user_id: user.id });
      const { data: myProfile } = await supabase.from('artists').select('id, artist_name, profile_image_url, slug').eq('user_id', user.id).maybeSingle();
      await sendNotification(supabase, 'track_liked (ArtistProfilePage)', {
        type:     'track_liked',
        artistId: artist.id,
        title:    `${myProfile?.artist_name || 'Someone'} liked ${track.title}`,
        message:  '',
        trackId:  track.id,
        metadata: {
          from_artist_id: myProfile?.id || null,
          track_id:          track.id,
          track_title:       track.title,
          track_slug:        track.slug || null,
          from_artist_name:  myProfile?.artist_name || null,
          from_artist_image: myProfile?.profile_image_url || null,
          from_artist_slug:  myProfile?.slug || null
        },
      });
    }
  };

  useEffect(() => { if (user && showAddToPlaylist) fetchPlaylists(); }, [showAddToPlaylist, user]);

  const fetchPlaylists = async () => {
    if (!user) return;
    const { data } = await supabase.from('playlists').select('id, name').eq('user_id', user.id).order('name');
    setPlaylists(data || []);
  };

  const handleAddToPlaylist = async (playlistId, trackId) => {
    setAddingTo(playlistId);
    const { data: existing } = await supabase.from('playlist_tracks').select('id')
      .eq('playlist_id', playlistId).eq('track_id', trackId).maybeSingle();
    if (!existing) {
      const { data: last } = await supabase.from('playlist_tracks').select('position')
        .eq('playlist_id', playlistId).order('position', { ascending: false }).limit(1).maybeSingle();
      await supabase.from('playlist_tracks').insert({
        playlist_id: playlistId, track_id: trackId, position: (last?.position ?? -1) + 1,
      });
      const { data: trackData } = await supabase.from('tracks').select('artist_id, title').eq('id', trackId).maybeSingle();
      const { data: plData } = await supabase.from('playlists').select('name').eq('id', playlistId).maybeSingle();
      if (trackData?.artist_id && trackData.artist_id !== artist?.id) {
        const myName = artist?.artist_name || 'Someone';
        await sendNotification(supabase, 'playlist_add (ArtistProfilePage)', {
          type:     'playlist_add',
          artistId: trackData.artist_id,
          title:    `${myName} added ${trackData.title} to ${plData?.name || 'a playlist'}`,
          message:  '',
          trackId:  trackId,
          metadata: {
            from_artist_id: artist?.id,
            playlist_add:      true,
            playlist_id:       playlistId,
            track_id:          trackId,
            track_title:       trackData.title,
            from_artist_name:  myName,
            from_artist_image: artist?.profile_image_url || null,
            from_artist_slug:  artist?.slug || null
          },
        });
      }
    }
    setAddedTo(prev => ({ ...prev, [`${playlistId}-${trackId}`]: true }));
    setAddingTo(null);
    setTimeout(() => setAddedTo(prev => {
      const n = { ...prev }; delete n[`${playlistId}-${trackId}`]; return n;
    }), 2000);
  };

  const handlePlayTrack = (track) => {
    window.__feelz_play_source = 'artist_profile';
    if (currentTrack?.id === track.id) { togglePlay(); return; }
    playTrack(
      { ...track, artist_name: artist.artist_name, artist_slug: artist.slug },
      tracks.map(t => ({ ...t, artist_name: artist.artist_name, artist_slug: artist.slug }))
    );
  };

  const themeStyles = useMemo(() => {
    if (!theme) return {};
    return {
      '--artist-primary': theme.primary_color || '#FFFFFF',
      '--artist-secondary': theme.secondary_color || '#8B5CF6',
      '--artist-accent': theme.accent_color || '#3B82F6',
      '--artist-bg': theme.background_color || '#000000',
      '--artist-text': theme.text_color || '#FFFFFF',
    };
  }, [theme]);

  const primaryColor   = theme?.primary_color   || '#FFFFFF';
  const secondaryColor = theme?.secondary_color || '#8B5CF6';
  const accentColor    = theme?.accent_color    || '#3B82F6';
  const bgColor        = theme?.background_color || '#000000';
  const textColor      = theme?.text_color      || '#FFFFFF';

  useEffect(() => {
    if (theme?.heading_font && theme.heading_font !== 'Inter') {
      const link = document.createElement('link');
      link.href = `https://fonts.googleapis.com/css2?family=${theme.heading_font.replace(/ /g, '+')}:wght@400;600;700;900&display=swap`;
      link.rel = 'stylesheet';
      document.head.appendChild(link);
      return () => document.head.removeChild(link);
    }
  }, [theme?.heading_font]);

  useEffect(() => {
    if (theme?.body_font && theme.body_font !== 'Inter' && theme.body_font !== theme?.heading_font) {
      const link = document.createElement('link');
      link.href = `https://fonts.googleapis.com/css2?family=${theme.body_font.replace(/ /g, '+')}:wght@400;500;600&display=swap`;
      link.rel = 'stylesheet';
      document.head.appendChild(link);
      return () => document.head.removeChild(link);
    }
  }, [theme?.body_font, theme?.heading_font]);

  const { pullProps, pullProgress, isRefreshing } = usePullToRefresh(fetchArtist);

  if (loading) return <ArtistProfileSkeleton />;

  if (!artist) {
    return (
      <div className="min-h-screen bg-black flex flex-col items-center justify-center px-6">
        <Music className="w-16 h-16 text-white/10 mb-4" />
        <h2 className="text-lg font-semibold text-white mb-2">Artist not found</h2>
        <button onClick={() => navigate('/')} className="text-sm text-white/40 hover:text-white/60">Go home</button>
      </div>
    );
  }

  const socials        = artist.social_links || {};
  const socialEntries  = Object.entries(socials).filter(([_, v]) => v);
  const headingFont    = theme?.heading_font || 'Inter';
  const bodyFont       = theme?.body_font || 'Inter';
  // Popular is a top ten by definition, so it stays capped. Showing the
  // whole catalogue here would contradict the heading. Since the list now
  // scrolls sideways on desktop, all ten are reachable without an expand
  // control, so the "see all" toggle is gone.
  const topTen = tracks.slice(0, 10);
  const visibleTracks = highlightedTrackId && !topTen.some(t => t.id === highlightedTrackId)
    ? [...topTen, ...tracks.filter(t => t.id === highlightedTrackId)]
    : topTen;
  const totalVisible   = Math.min(tracks.length, 10);
  const isProfileOwner = user && myArtist && myArtist.id === artist.id;
  const isBeatmakerProfile = artist?.role === 'beatmaker';
  const pageUrl        = `${BASE_URL}/artist/${slug}`;
  const shareShortUrl  = `${BASE_URL}/@${slug}`;
  const ogImage        = artist.profile_image_url || `${BASE_URL}/og-default.png`;
  const pageTitle      = `${artist.artist_name} · Feelz Machine`;
  const pageDesc       = artist.bio
    ? `${artist.bio.slice(0, 120)}${artist.bio.length > 120 ? '...' : ''}`
    : `Stream music by ${artist.artist_name} on Feelz Machine, independent music platform.`;

  const musicGroupSchema = {
    '@context': 'https://schema.org',
    '@type': 'MusicGroup',
    name: artist.artist_name,
    url: pageUrl,
    ...(artist.profile_image_url ? { image: artist.profile_image_url } : {}),
    ...(artist.bio ? { description: artist.bio } : {}),
    ...(artist.genre ? { genre: artist.genre } : {}),
    ...(socialEntries.length > 0 ? { sameAs: socialEntries.map(([, url]) => url) } : {}),
  };

  return (
    <div className="min-h-screen pb-32" style={{ backgroundColor: bgColor, color: textColor, fontFamily: `"${bodyFont}", sans-serif`, ...themeStyles }} {...pullProps}>
      <PullToRefreshIndicator pullProgress={pullProgress} isRefreshing={isRefreshing} />

      {/* ── Dynamic head tags ── */}
      <Helmet>
        <title>{pageTitle}</title>
        <link rel="icon" href="/favicon.ico" />
        <link rel="apple-touch-icon" href="/logo192.png" />
        <meta name="description" content={pageDesc} />
        <link rel="canonical" href={pageUrl} />
        <meta property="og:title" content={pageTitle} />
        <meta property="og:description" content={pageDesc} />
        <meta property="og:url" content={pageUrl} />
        <meta property="og:image" content={ogImage} />
        <meta property="og:type" content="profile" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={pageTitle} />
        <meta name="twitter:description" content={pageDesc} />
        <meta name="twitter:image" content={ogImage} />
        <script type="application/ld+json">{JSON.stringify(musicGroupSchema)}</script>
      </Helmet>

      {/* HEADER
          On desktop this is one flex row: image on the left, everything else
          to its right, ending together at the bottom of the green. The avatar
          and info block already carried lg:flex-shrink-0 and lg:flex-1, but
          nothing made them a row, so those classes did nothing and the
          spacing was whatever the two blocks happened to produce. That is why
          the green ran on past the socials and Popular kept getting covered.
          Mobile is untouched: the banner keeps its fixed height and the
          avatar stays absolutely positioned and centred. */}
      <div className="lg:flex lg:items-end lg:gap-7 lg:px-8 pb-4 lg:pb-5 lg:relative">
      {/* MOBILE BANNER HEIGHT
          220px put roughly 155px of empty green above the avatar and pushed
          Popular below the fold — on a phone you landed on a wall of colour
          and had to scroll before seeing a single track. 132px keeps enough
          banner for the gradient to read while lifting everything under it by
          88px, which is what brings the Popular rail into the first screen.
          Desktop is untouched: there the banner is sized by the flex row. */}
      <div className="relative w-full h-[132px] lg:h-auto lg:min-h-0 lg:w-auto">
        {artist.banner_image_url || theme?.banner_image_url ? (
          <img src={artist.banner_image_url || theme?.banner_image_url} alt="" className="absolute inset-0 w-full h-full object-cover" />
        ) : (
          <div className="absolute inset-0" style={{ background: `linear-gradient(135deg, ${secondaryColor}40, ${accentColor}30, ${bgColor})` }} />
        )}
        {theme?.background_image_url && !artist.banner_image_url && !theme?.banner_image_url && (
          <img src={theme.background_image_url} alt="" className="absolute inset-0 w-full h-full object-cover opacity-30" />
        )}
        <div className="absolute inset-0" style={{ background: `linear-gradient(to bottom, transparent 20%, ${bgColor} 100%)` }} />
        <div className="fixed top-0 left-0 right-0 flex items-center justify-between px-4 z-50" style={{ paddingTop: 'max(env(safe-area-inset-top, 0px), 12px)', height: 'calc(max(env(safe-area-inset-top, 0px), 12px) + 44px)' }}>
          <button onClick={() => goBack()}
            className="w-10 h-10 flex items-center justify-center rounded-full backdrop-blur-md"
            style={{ backgroundColor: `${bgColor}80` }}>
            <ArrowLeft className="w-5 h-5" style={{ color: textColor }} />
          </button>
          {/* The corner share button is gone. There is already a Share pill
              in the action row, and two share buttons on one screen is a
              question rather than a convenience. */}
        </div>
        {/* Centred on mobile as before. On desktop it moves hard left and
            grows, so the name and controls sit beside it rather than under
            it, matching the large-image-left layout used in Library. */}
        {/* Bigger on desktop and deliberately bleeding past the bottom of the
            banner, so the image breaks the green edge instead of floating
            inside it. */}
        {/* -bottom-20 rather than -bottom-16: the image is larger on mobile
            now (160px, was 128px), so it needs to hang further past the banner
            to keep breaking the edge rather than sitting inside it. */}
        <div className="absolute -bottom-20 left-1/2 -translate-x-1/2 z-10 lg:static lg:translate-x-0 lg:flex-shrink-0">
          {/* Story ring — clickable if artist has active stories */}
          <div
            className="relative"
            onClick={stories.length > 0 ? () => setViewingStory(true) : undefined}
            style={{ cursor: stories.length > 0 ? 'pointer' : 'default' }}
          >
            {stories.length > 0 && (
              <div className="absolute -inset-1.5 rounded-2xl"
                style={{ background: 'linear-gradient(135deg, #8B5CF6, #06B6D4)', padding: 2, borderRadius: 18 }}>
                <div className="w-full h-full rounded-2xl" style={{ backgroundColor: bgColor }} />
              </div>
            )}
            <div className="relative w-40 h-40 lg:w-48 lg:h-48 rounded-2xl overflow-hidden border-4 shadow-2xl"
              style={{ borderColor: stories.length > 0 ? 'transparent' : bgColor, backgroundColor: `${secondaryColor}30` }}>
              {artist.profile_image_url ? (
                <img src={artist.profile_image_url} alt={artist.artist_name} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center"
                  style={{ background: `linear-gradient(135deg, ${secondaryColor}, ${accentColor})` }}>
                  <span className="text-2xl font-bold" style={{ color: textColor }}>{artist.artist_name?.[0]?.toUpperCase()}</span>
                </div>
              )}
            </div>
                      </div>
            {/* Quick-create button — own profile only */}
            {isProfileOwner && (
              <div className="absolute -bottom-1 -right-1 flex flex-col space-y-1">
                <button
                  onClick={() => setShowCreateModal(true)}
                  title="Add Story or go Live"
                  className="w-9 h-9 rounded-full flex items-center justify-center shadow-xl border-2 transition hover:scale-110 active:scale-95"
                  style={{ backgroundColor: '#ffffff', borderColor: bgColor }}>
                  <Plus className="w-4 h-4 text-black" />
                </button>
              </div>
            )}
          </div>
        </div>

      {/* ARTIST INFO
          Mobile is unchanged: avatar above, everything centred. On desktop
          the whole block shifts right of the avatar and left-aligns, which
          is what puts the name, stats and buttons beside the image instead
          of stacked under it. */}
      {/* Shifted right to clear the larger image, and up a step so the social
          icons have clearance above the bottom of the green banner rather
          than sitting on its edge. */}
      <div className="px-6 pt-24 flex flex-col items-center text-center lg:pt-0 lg:items-start lg:text-left lg:flex-1 lg:min-w-0">
        <div className="flex flex-col items-center lg:items-start mb-1">
          <div className="flex items-center space-x-2">
            <h1 className="text-3xl font-bold" style={{ fontFamily: `"${headingFont}", sans-serif`, color: textColor }}>{artist.artist_name}</h1>
            {/* The tick was drawn in `bgColor` inside a circle of
                `accentColor` — theme colours the artist picks. On a theme
                where those two are close, the badge was a solid dot with an
                invisible tick in it. Gold on its own, shadowed, so it reads
                the same on every theme and matches the badge everywhere
                else on the platform. */}
            {artist.is_verified && <VerifiedBadge size="lg" />}
          </div>
          {isBeatmakerProfile && (
            <span className="mt-1.5 text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full"
              style={{ background: 'rgba(234,179,8,0.15)', color: '#facc15', border: '1px solid rgba(234,179,8,0.25)' }}>
              Beat Maker
            </span>
          )}
        </div>
        <div className="flex items-center justify-center lg:justify-start space-x-4 mb-4 flex-wrap gap-y-1">
          <button
  onClick={() => isProfileOwner ? navigate(`/artist/${slug}/fans`) : undefined}
  className={isProfileOwner ? 'hover:opacity-70 transition' : ''}
  style={{ color: `${textColor}80`, fontSize: '0.875rem' }}>
  {formatNumber(followerCount)} followers{isProfileOwner ? ' ↗' : ''}
</button>
          <span className="text-sm" style={{ color: `${textColor}80` }}>{tracks.length} track{tracks.length !== 1 ? 's' : ''}</span>
          <span className="text-sm" style={{ color: `${textColor}80` }}>{formatNumber(artist.total_streams)} streams</span>
          {xpData?.total_xp > 0 && (
            <button onClick={() => setShowXPModal(true)}
              className="flex items-center space-x-1 px-2.5 py-1 rounded-full text-xs font-bold transition hover:opacity-80"
              style={{ background: 'rgba(251,191,36,0.12)', border: '1px solid rgba(251,191,36,0.25)', color: '#fbbf24' }}>
              <span>⚡</span>
              <span>{xpData.total_xp.toLocaleString()} XP</span>
            </button>
          )}
        </div>


        {/* mb-2.5, not mb-4: the socials sit directly under the pills and a
            full step of space between them read as two unrelated blocks. */}
        <div className="flex items-center justify-center lg:justify-start flex-wrap gap-2 mb-2.5 px-4 lg:px-0">
          <button onClick={handleFollow}
            className="flex items-center space-x-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-all active:scale-95"
            style={{
              backgroundColor: isFollowing ? 'transparent' : primaryColor,
              color: isFollowing ? textColor : bgColor,
              border: `2px solid ${isFollowing ? `${textColor}30` : primaryColor}`,
            }}>
            {isFollowing ? <UserCheck className="w-3.5 h-3.5" /> : <UserPlus className="w-3.5 h-3.5" />}
            <span>{isFollowing ? 'Following' : 'Follow'}</span>
          </button>
          {isFollowing && user.id !== artist?.user_id && (
            <button onClick={handleToggleNotif} disabled={notifLoading}
              title={notifEnabled ? 'Turn off notifications' : 'Turn on notifications'}
              className="flex items-center space-x-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-all active:scale-95 disabled:opacity-40"
              style={{
                backgroundColor: notifEnabled ? `${secondaryColor}25` : 'transparent',
                color: notifEnabled ? secondaryColor : `${textColor}50`,
                border: `2px solid ${notifEnabled ? secondaryColor + '40' : textColor + '20'}`,
              }}>
              {notifLoading
                ? <Loader className="w-3.5 h-3.5 animate-spin" />
                : notifEnabled
                  ? <Bell className="w-3.5 h-3.5" />
                  : <BellOff className="w-3.5 h-3.5" />}
            </button>
          )}
          {tracks.length > 0 && (
            <>
              <button onClick={() => handlePlayTrack(tracks[0])}
                className="flex items-center space-x-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-all active:scale-95"
                style={{ backgroundColor: secondaryColor, color: textColor }}>
                <Play className="w-3.5 h-3.5" fill={textColor} />
                <span>Play</span>
              </button>
              <button onClick={() => {
                const shuffled = [...tracks].sort(() => Math.random() - 0.5);
                const queue = shuffled.map(t => ({ ...t, artist_name: artist.artist_name, artist_slug: artist.slug }));
                playTrack(queue[0], queue);
              }}
                className="flex items-center space-x-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-all active:scale-95"
                style={{ backgroundColor: `${secondaryColor}30`, color: textColor, border: `1px solid ${secondaryColor}40` }}>
                <Shuffle className="w-3.5 h-3.5" />
                <span>Shuffle</span>
              </button>
              <button onClick={handleArtistRadio} disabled={radioLoading || tracks.length === 0}
                className="flex items-center space-x-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-all active:scale-95 disabled:opacity-40"
                style={{ backgroundColor: `${secondaryColor}30`, color: textColor, border: `1px solid ${secondaryColor}40` }}>
                {radioLoading
                  ? <Loader className="w-3.5 h-3.5 animate-spin" />
                  : <Radio className="w-3.5 h-3.5" />}
                <span>Radio</span>
              </button>
            </>
          )}
          {/* Chat.
              This is the whole entry point to the chat feature, and until now
              there wasn't one. The Chat Rooms page was reachable from a button
              on /feed — a page nothing in the app links to — and from a
              Community modal on THIS page whose `showCommunity` flag was
              declared, rendered, and never once set to true. So chat was
              reachable by typing a URL and no other way, which is the real
              reason it never took off.

              It sits here because this is where the intent is: you are looking
              at an artist and you want to talk to them. Deliberately the
              listener's move — nothing pushes an artist at a fan. */}
          {!isProfileOwner && (
            <button onClick={openArtistChat} disabled={chatOpening}
              className="flex items-center space-x-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-all active:scale-95 disabled:opacity-40"
              style={{ backgroundColor: `${accentColor}25`, color: accentColor, border: `1px solid ${accentColor}45` }}>
              {chatOpening
                ? <Loader className="w-3.5 h-3.5 animate-spin" />
                : <MessageCircle className="w-3.5 h-3.5" />}
              <span>Chat</span>
            </button>
          )}
          <button onClick={handleShare}
            className="flex items-center space-x-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-all active:scale-95"
            style={{ backgroundColor: `${textColor}10`, color: `${textColor}70`, border: `1px solid ${textColor}20` }}>
            <Share2 className="w-3.5 h-3.5" />
            <span>Share</span>
          </button>
          {artist.merch_enabled && !MERCH_PARKED && (
            <button onClick={() => navigate(`/artist/${slug}/merch`)}
              className="flex items-center space-x-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-all active:scale-95"
              style={{ backgroundColor: `${accentColor}25`, border: `1px solid ${accentColor}50`, color: accentColor }}>
              <ShoppingBag className="w-3.5 h-3.5" />
              <span>Merch</span>
            </button>
          )}
          {user && user.id !== artist?.user_id && (
            <TipButton artist={artist} />
          )}
          {/* Moved inside the pill row. It used to sit on its own line
              underneath, which is what broke the straight line of controls
              and left "Set a tip goal" floating alone under the name. */}
          <TipGoal
            artistId={artist.id}
            primaryColor={primaryColor}
            textColor={textColor}
            isOwner={user?.id === artist.user_id}
          />
        </div>

        {/* Said out loud rather than logged. The Chat button calls a function
            that can legitimately refuse — an unclaimed artist has nobody on
            the other end — and a button that does nothing with the reason in
            the console is indistinguishable from a broken one. */}
        {chatError && (
          <p className="mt-2 text-xs px-1" style={{ color: '#f87171' }}>{chatError}</p>
        )}



        {/* Challenge XP Modal */}
        {showXPModal && (
          <ChallengeXPModal
            userId={artist?.user_id}
            onClose={() => setShowXPModal(false)}
          />
        )}

        {/* Merch is parked — this is the explanation, not a store. */}
        {showMerchParked && (
          <div className="fixed inset-0 z-[210] bg-black/85 backdrop-blur-sm flex items-center justify-center px-5"
            onClick={() => setShowMerchParked(false)}>
            <div onClick={(e) => e.stopPropagation()} className="w-full flex justify-center">
              <MerchParked full={false} onClose={() => setShowMerchParked(false)} />
            </div>
          </div>
        )}

        {/* Merch Connect Sheet */}
        {showMerchConnect && isProfileOwner && (
          <MerchConnectSheet
            artist={artist}
            onClose={() => setShowMerchConnect(false)}
            onConnected={() => { setShowMerchConnect(false); window.location.reload(); }}
          />
        )}

        {/* DM Modal */}
        {showDMModal && user?.id === artist.user_id && (
          <div className="fixed inset-0 z-[600] flex items-end justify-center bg-black/70 backdrop-blur-sm"
            onClick={() => setShowDMModal(false)}>
            <div className="w-full max-w-lg bg-neutral-900 rounded-t-2xl p-5 border-t border-white/[0.08]"
              onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-sm font-bold text-white">Message your followers</h3>
                  <p className="text-[11px] text-white/30 mt-0.5">Sends a notification to everyone following you</p>
                </div>
                <button onClick={() => setShowDMModal(false)}><X className="w-4 h-4 text-white/30" /></button>
              </div>
              <textarea value={dmMessage} onChange={e => setDmMessage(e.target.value)}
                placeholder="Share an update, a hint about new music, or let them know you're going live..."
                rows={4} maxLength={500}
                className="w-full bg-white/[0.06] rounded-xl px-3 py-2.5 text-sm text-white placeholder-white/20 outline-none resize-none mb-3" />
              <div className="flex items-center justify-between mb-3">
                <span className="text-[10px] text-white/20">{dmMessage.length}/500</span>
              </div>
              <button onClick={sendDMToFollowers} disabled={!dmMessage.trim() || dmSending || dmSent}
                className="w-full py-3 rounded-xl text-sm font-semibold text-white disabled:opacity-40 transition flex items-center justify-center space-x-2"
                style={{ background: primaryColor }}>
                {dmSent
                  ? <><Check className="w-4 h-4" /><span>Sent!</span></>
                  : dmSending
                  ? <><Loader className="w-4 h-4 animate-spin" /><span>Sending...</span></>
                  : <><Send className="w-4 h-4" /><span>Send to followers</span></>}
              </button>
            </div>
          </div>
        )}
        {/* max-w-sm was forcing the bio into a narrow column in the middle of
            a wide banner, which is the clumping Steve flagged. Wide on
            desktop, still readable rather than edge to edge. */}
        {/* The bio has moved to a collapsible card at the foot of the page.
            In the header a long bio pushed the pills down and broke the
            layout, which is exactly what Steve's Big Feelz screenshot shows. */}

        {/* In line with the pills rather than floating above them. Smaller and
            outlined, so they read as links off the platform instead of another
            row of actions. */}
        {socialEntries.length > 0 && (
          <div className="flex items-center gap-1.5 mb-0">
            {socialEntries.map(([platform, value]) => {
              const Icon = SOCIAL_ICONS[platform] || Globe;
              const prefix = SOCIAL_URLS[platform] || '';
              const href = value.startsWith('http') ? value : (prefix ? `${prefix}${value}` : value);
              return href.startsWith('http') ? (
                <a key={platform} href={href} target="_blank" rel="noopener noreferrer"
                  className="w-8 h-8 rounded-lg flex items-center justify-center transition-all hover:scale-110 active:scale-95"
                  style={{ border: `1px solid ${textColor}25`, backgroundColor: 'transparent' }}>
                  <Icon className="w-3.5 h-3.5" style={{ color: `${textColor}60` }} />
                </a>
              ) : (
                <div key={platform} className="w-8 h-8 rounded-lg flex items-center justify-center"
                  style={{ border: `1px solid ${textColor}25` }} title={value}>
                  <Icon className="w-3.5 h-3.5" style={{ color: `${textColor}60` }} />
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 🔴 LIVE NOW BANNER — rendered here, below the profile image */}
      {liveSession && (
        <div className="mx-6 mb-4 w-[calc(100%-3rem)] flex items-center space-x-2">
          <button
            onClick={() => navigate(`/session/${liveSession.id}`)}
            className="flex-1 flex items-center justify-between px-4 py-3 rounded-2xl border border-red-500/30 bg-red-500/10 hover:bg-red-500/20 transition active:scale-[0.98]"
          >
            <div className="flex items-center space-x-2.5">
              <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500" />
              </span>
              <span className="text-sm font-semibold text-red-400">Live Now</span>
              {liveSession.title && (
                <span className="text-sm text-red-300/70 truncate max-w-[120px]"> {liveSession.title}</span>
              )}
            </div>
            <Radio className="w-4 h-4 text-red-400 flex-shrink-0" />
          </button>
          {isProfileOwner && (
            <button
              onClick={async () => {
                if (!window.confirm('End this live session?')) return;
                // Stop the poll immediately so it can't resurrect the session
                clearInterval(liveCheckRef.current);
                const { error } = await supabase.from('listening_sessions')
                  .update({ status: 'ended', ended_at: new Date().toISOString() })
                  .eq('id', liveSession.id);
                if (error) {
                  console.error('Failed to end session:', error);
                  alert('Could not end the session. Please try again.');
                  // Restart poll if update failed
                  liveCheckRef.current = setInterval(async () => {
                    const { data: live } = await supabase.from('listening_sessions')
                      .select('id, title').eq('artist_id', artist.id)
                      .eq('status', 'live').limit(1).maybeSingle();
                    setLiveSession(live || null);
                  }, 30_000);
                } else {
                  setLiveSession(null);
                }
              }}
              title="End session"
              className="w-10 h-10 flex items-center justify-center rounded-2xl border border-red-500/30 bg-red-500/10 hover:bg-red-500/25 transition flex-shrink-0"
            >
              <X className="w-4 h-4 text-red-400" />
            </button>
          )}
        </div>
      )}

      {/* 📅 SCHEDULED STREAM BANNER */}
      {!liveSession && scheduledSession?.scheduled_at && (
        <div className="mx-6 mb-4 w-[calc(100%-3rem)] flex items-center justify-between px-4 py-3 rounded-2xl border border-purple-500/25 bg-purple-500/8">
          <div className="flex items-center space-x-2.5">
            <Calendar className="w-4 h-4 text-purple-400 flex-shrink-0" />
            <div>
              <span className="text-sm font-semibold text-purple-300">Next Live Stream</span>
              <p className="text-xs text-purple-300/50 mt-0.5">
                {new Date(scheduledSession.scheduled_at).toLocaleDateString('en-US', {
                  weekday: 'short', month: 'short', day: 'numeric',
                  hour: '2-digit', minute: '2-digit',
                })}
                {scheduledSession.title && ` · ${scheduledSession.title}`}
              </p>
            </div>
          </div>
        </div>
      )}


      </div>

      {/* Clearance between the bottom of the hero and whatever comes first
          below it. Popular (or Top Pick) used to start hard against the
          header edge with nothing separating them. */}
      <div className="h-6 lg:h-7" aria-hidden="true" />

      {/* My Top Pick. One track the artist chose to lead with, so the first
          thing on the page is their decision rather than a play count.
          Deliberately a single wide card, not a rail: the whole point is
          that it is one track. */}
      {topPick && (
        <div className="px-6 mb-8">
          <p className="text-[10px] uppercase tracking-[0.2em] font-bold mb-2" style={{ color: primaryColor }}>
            My Top Pick
          </p>
          <div
            onClick={() => handlePlayTrack(topPick)}
            className="flex items-center gap-4 p-4 rounded-2xl cursor-pointer transition hover:opacity-90 active:opacity-75"
            style={{ backgroundColor: `${textColor}06`, border: `1px solid ${primaryColor}30` }}>
            <div className="w-20 h-20 lg:w-24 lg:h-24 rounded-xl overflow-hidden flex-shrink-0" style={{ backgroundColor: `${textColor}08` }}>
              {topPick.cover_artwork_url
                ? <img src={topPick.cover_artwork_url} alt={topPick.title} className="w-full h-full object-cover" />
                : <div className="w-full h-full flex items-center justify-center"><Music className="w-8 h-8" style={{ color: `${textColor}20` }} /></div>}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-lg font-bold truncate" style={{ color: textColor }}>{topPick.title}</p>
              {artist.top_pick_note
                ? <p className="text-sm mt-1 max-w-2xl" style={{ color: `${textColor}70` }}>{artist.top_pick_note}</p>
                : <p className="text-sm mt-1" style={{ color: `${textColor}45` }}>Chosen by {artist.artist_name}</p>}
            </div>
            <Play className="w-5 h-5 flex-shrink-0" style={{ color: primaryColor }} />
          </div>
        </div>
      )}

      {tracks.length > 0 && (
        <div className="mb-8">
          <h2 className="text-lg font-bold mb-3 px-6 text-white" style={{ fontFamily: `"${headingFont}", sans-serif`, opacity: 1 }}>{isBeatmakerProfile ? "Beats" : "Popular"}</h2>

          {/* Cards in a sideways-scrolling row, matching Recommended For You
              below. The previous version reused the full track rows and only
              rearranged them, which kept the three-dot menu, the info button
              and the download icon: fine in a list, noise in a rail, and it
              never actually scrolled because the rows would not shrink.

              Rank and play count carry the "popular" meaning that the
              ordering alone does not. Tapping plays, which is the only
              action this row needs; everything else stays in the full track
              pages. */}
          <div className="flex space-x-3 overflow-x-auto px-6 scrollbar-hide" style={{ WebkitOverflowScrolling: 'touch' }}>
            {visibleTracks.map((track, i) => (
              <button
                key={track.id}
                onClick={() => handlePlayTrack(track)}
                className="flex-shrink-0 w-36 text-left cursor-pointer group"
              >
                <div className="relative aspect-square rounded-xl overflow-hidden mb-2" style={{ backgroundColor: `${textColor}08` }}>
                  {track.cover_artwork_url
                    ? <img src={track.cover_artwork_url} alt={track.title} className="w-full h-full object-cover" />
                    : <div className="w-full h-full flex items-center justify-center"><Music className="w-8 h-8" style={{ color: `${textColor}20` }} /></div>}
                  <PreorderTag track={track} />
                  <span
                    className="absolute top-1.5 left-1.5 w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-black"
                    style={{ background: 'rgba(0,0,0,0.6)', color: textColor, backdropFilter: 'blur(4px)' }}
                  >
                    {i + 1}
                  </span>
                </div>
                <p className="text-sm font-medium truncate" style={{ color: textColor }}>{track.title}</p>
                <p className="text-xs truncate" style={{ color: `${textColor}50` }}>
                  {(track.stream_count || 0).toLocaleString()} plays
                </p>
              </button>
            ))}
          </div>

          {tracks.length > 10 && (
            <p className="mt-3 px-6 text-sm" style={{ color: `${textColor}40` }}>
              Top 10 of {tracks.length} tracks
            </p>
          )}
        </div>
      )}

      {/* Recommended For You removed. The For You page already does this, and
          on an artist's own profile a row of other people's music is the
          platform talking over the artist. */}

      {/* ── New Music row — artist's latest drops ── */}
      {tracks.length > 0 && (() => {
        const recent = [...tracks]
          .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
          .slice(0, 8);
        return (
          <div className="mb-8 mx-6 rounded-2xl pt-4 pb-4"
            style={{ background: 'linear-gradient(135deg, rgba(6,182,212,0.18) 0%, rgba(6,182,212,0.08) 60%, rgba(10,30,35,0.95) 100%)', border: '1px solid rgba(6,182,212,0.25)', overflow: 'visible' }}>
            <div className="px-4 mb-4 flex items-center space-x-2">
              <p className="text-sm font-bold" style={{ color: textColor }}>New Music</p>
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
                style={{ background: `${secondaryColor}25`, color: secondaryColor, border: `1px solid ${secondaryColor}35` }}>
                Just dropped
              </span>
            </div>
            {/* Mobile: hero first card + scrollable rest */}
            <div className="md:hidden">
              {recent[0] && (() => {
                const track = recent[0];
                const withinWeek = (Date.now() - new Date(track.created_at).getTime()) < 7 * 24 * 60 * 60 * 1000;
                return (
                  <div className="px-4 mb-3 cursor-pointer" onClick={() => handlePlayTrack(track)}>
                    <div className="w-full aspect-square rounded-2xl overflow-hidden relative"
                      style={{ boxShadow: withinWeek ? `0 0 0 2px ${secondaryColor}, 0 0 30px ${secondaryColor}60` : 'none' }}>
                      {track.cover_artwork_url
                        ? <img src={track.cover_artwork_url} alt={track.title} className="w-full h-full object-cover" />
                        : <div className="w-full h-full flex items-center justify-center" style={{ background: `linear-gradient(135deg, ${secondaryColor}30, ${accentColor}15)` }}><Music className="w-12 h-12" style={{ color: `${textColor}20` }} /></div>}
                      {withinWeek && (
                        <div className="absolute top-2 right-2 px-2 py-1 rounded-full text-[10px] font-bold" style={{ background: secondaryColor, color: '#fff' }}>NEW</div>
                      )}
                    </div>
                    <p className="text-base font-bold mt-2 truncate" style={{ color: withinWeek ? secondaryColor : textColor }}>{track.title}</p>
                    <p className="text-xs truncate" style={{ color: `${textColor}50` }}>{track.albums?.title || 'Single'}</p>
                  </div>
                );
              })()}
              {recent.length > 1 && (
                <div className="flex space-x-3 overflow-x-auto scrollbar-hide px-4 pb-3" style={{ overflowY: 'visible' }}>
                  {recent.slice(1).map(track => {
                    const withinWeek = (Date.now() - new Date(track.created_at).getTime()) < 7 * 24 * 60 * 60 * 1000;
                    return (
                      <div key={track.id} className="flex-shrink-0 w-32 cursor-pointer group" onClick={() => handlePlayTrack(track)}>
                        <div className="aspect-square rounded-xl overflow-hidden mb-1.5 relative" style={{ backgroundColor: `${textColor}08` }}>
                          {track.cover_artwork_url
                            ? <img src={track.cover_artwork_url} alt={track.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                            : <div className="w-full h-full flex items-center justify-center" style={{ background: `linear-gradient(135deg, ${secondaryColor}30, ${accentColor}15)` }}><Music className="w-6 h-6" style={{ color: `${textColor}20` }} /></div>}
                        </div>
                        <p className="text-sm font-medium truncate" style={{ color: textColor }}>{track.title}</p>
                        <p className="text-xs truncate" style={{ color: `${textColor}50` }}>{track.albums?.title || 'Single'}</p>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
            {/* Desktop: the newest track is pinned and does NOT move. The rest
                scroll past it on their own track.

                The previous attempt just made the first card wider inside the
                same scrolling row, so it slid away with everything else,
                which is not what was asked for and looked worse than the
                plain rail. The fix is structural: the hero sits outside the
                scroller entirely. */}
            {/* Desktop: the newest track is its own card ABOVE the row, not
                the first item in it.

                Two previous attempts both kept it inside the horizontal flow
                — first as a wider card in the same scroller, then pinned
                beside it. Side by side it still read as "the big one in the
                row", and being a flex sibling of the scroller is what let it
                collide with the section heading. Stacking it is the only
                arrangement that actually separates the two, and it matches
                what mobile has always done.

                Landscape rather than square, so promoting it costs a strip of
                height instead of a third of the panel. */}
            <div className="hidden md:block px-4 pt-1 pb-3">
              {recent[0] && (() => {
                const track = recent[0];
                const withinWeek = (Date.now() - new Date(track.created_at).getTime()) < 7 * 24 * 60 * 60 * 1000;
                return (
                  <div
                    onClick={() => handlePlayTrack(track)}
                    className="flex items-center gap-4 p-3 rounded-2xl cursor-pointer group transition hover:opacity-95"
                    style={{
                      background: `${textColor}08`,
                      border: `1px solid ${withinWeek ? `${secondaryColor}55` : `${textColor}12`}`,
                      boxShadow: withinWeek ? `0 0 24px ${secondaryColor}22` : 'none',
                    }}>
                    <div className="w-28 h-28 rounded-xl overflow-hidden flex-shrink-0 relative"
                      style={{ backgroundColor: `${textColor}08` }}>
                      {track.cover_artwork_url
                        ? <img src={track.cover_artwork_url} alt={track.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                        : <div className="w-full h-full flex items-center justify-center" style={{ background: `linear-gradient(135deg, ${secondaryColor}30, ${accentColor}15)` }}><Music className="w-8 h-8" style={{ color: `${textColor}20` }} /></div>}
                    </div>
                    <div className="min-w-0 flex-1">
                      {/* The NEW badge lived on the first card of the old rail.
                          It travels with the hero, otherwise it would vanish
                          silently now that the hero is out of the list. */}
                      {withinWeek && (
                        <span className="inline-block mb-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold"
                          style={{ background: secondaryColor, color: '#fff' }}>NEW</span>
                      )}
                      <p className="text-xl font-bold truncate" style={{ color: textColor }}>{track.title}</p>
                      <div className="flex items-center gap-2 min-w-0">
                        <p className="text-sm truncate" style={{ color: `${textColor}55` }}>{track.albums?.title || 'Single'}</p>
                        <PreorderTag track={track} variant="inline" />
                      </div>
                    </div>
                    <Play className="w-6 h-6 flex-shrink-0 mr-2" style={{ color: secondaryColor }} fill={secondaryColor} />
                  </div>
                );
              })()}
            </div>

            {/* The rest, in their own recessed row beneath the hero. */}
            <div className="hidden md:block px-4 pb-3">

              {/* Everything after the newest, in its own recessed panel so the
                  pinned hero reads as being in front of the rest rather than
                  merely the first and largest item. Darker background and a
                  border, which is the distinction Steve asked for. */}
              <div className="flex space-x-3 overflow-x-auto scrollbar-hide rounded-xl px-3 py-3"
                style={{
                  overflowY: 'visible',
                  background: 'rgba(0,0,0,0.28)',
                  border: `1px solid ${textColor}0F`,
                }}>
              {/* The newest track is rendered above and pinned, so nothing in
                  this list is ever the newest. The isNewest flag and its NEW
                  badge belong to the hero now, and leaving a constant false
                  here would just be dead branches for the next reader. */}
              {recent.slice(1).map(track => {
                const showGlow = false;
                return (
                  <div key={track.id}
                    className="flex-shrink-0 w-32 cursor-pointer group opacity-80 hover:opacity-100 transition-opacity"
                    onClick={() => handlePlayTrack(track)}>
                    <div className="aspect-square rounded-xl overflow-hidden mb-1.5 relative"
                      style={{ backgroundColor: `${textColor}08`, boxShadow: showGlow ? `0 0 0 2px ${secondaryColor}, 0 0 20px ${secondaryColor}60, 0 0 40px ${secondaryColor}30` : 'none' }}>
                      {track.cover_artwork_url
                        ? <img src={track.cover_artwork_url} alt={track.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                        : <div className="w-full h-full flex items-center justify-center" style={{ background: `linear-gradient(135deg, ${secondaryColor}30, ${accentColor}15)` }}><Music className="w-6 h-6" style={{ color: `${textColor}20` }} /></div>}
                      {showGlow && (
                        <div className="absolute top-1.5 right-1.5 px-1.5 py-0.5 rounded-full text-[9px] font-bold" style={{ background: secondaryColor, color: '#fff' }}>NEW</div>
                      )}
                    </div>
                    <p className="text-sm font-medium truncate" style={{ color: showGlow ? secondaryColor : textColor }}>{track.title}</p>
                    <p className="text-xs truncate" style={{ color: `${textColor}50` }}>{track.albums?.title || 'Single'}</p>
                  </div>
                );
              })}
              </div>
            </div>
          </div>
        );
      })()}

      {/* Singles and Albums, side by side rather than two stacked rows.
          Steve: these two should read as collections, not as another
          horizontal rail like everything else. Each card opens its own page,
          the way a Spotify discography entry does. On mobile they stack,
          which is the same as before. */}
      {(albums.length > 0 || tracks.filter(t => !t.album_id).length > 0) && (
        <div className="px-6 mb-10 grid grid-cols-1 lg:grid-cols-2 gap-6">

          {albums.length > 0 && (
            <div className="rounded-2xl p-5"
              style={{ background: `linear-gradient(135deg, rgba(88,28,135,0.18) 0%, rgba(30,27,75,0.35) 100%)`, border: `1px solid rgba(139,92,246,0.15)` }}>
              <div className="flex items-baseline justify-between mb-3">
                <h2 className="text-lg font-bold" style={{ fontFamily: `"${headingFont}", sans-serif` }}>Albums</h2>
                <span className="text-xs" style={{ color: `${textColor}40` }}>{albums.length}</span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {albums.slice(0, 6).map(album => (
                  <div key={album.id} className="cursor-pointer group"
                    /* `/album/:id` is a ONE-segment route (AppRouter.js:364). This
                       built a TWO-segment path, so it matched no route, fell through
                       to the catch-all, and the catch-all redirects to "/" — which is
                       why tapping an album threw you onto For You and looked like the
                       app had reloaded. AlbumDetailPage resolves an id OR a slug, so
                       the artist handle was never needed here. */
                    onClick={() => navigate(`/album/${album.slug || album.id}`)}>
                    <div className="aspect-square rounded-xl overflow-hidden mb-2" style={{ backgroundColor: `${textColor}08` }}>
                      {album.cover_artwork_url
                        ? <img src={album.cover_artwork_url} alt={album.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                        : <div className="w-full h-full flex items-center justify-center"><Music className="w-8 h-8" style={{ color: `${textColor}20` }} /></div>}
                    </div>
                    <p className="text-sm font-medium truncate" style={{ color: textColor }}>{album.title}</p>
                    <p className="text-xs truncate" style={{ color: `${textColor}50` }}>
                      {album.release_type?.toUpperCase()} {album.release_date ? new Date(album.release_date).getFullYear() : ''}
                    </p>
                  </div>
                ))}
              </div>
              {albums.length > 6 && (
                <button onClick={() => navigate(`/artist/${artist.slug}/albums`)}
                  className="text-xs font-semibold mt-3" style={{ color: primaryColor }}>
                  See all {albums.length} albums
                </button>
              )}
            </div>
          )}

          {tracks.filter(t => !t.album_id).length > 0 && (
            <div className="rounded-2xl p-5"
              style={{ background: `linear-gradient(135deg, rgba(13,148,136,0.15) 0%, rgba(10,30,30,0.4) 100%)`, border: `1px solid rgba(20,184,166,0.15)` }}>
              <div className="flex items-baseline justify-between mb-3">
                <h2 className="text-lg font-bold" style={{ fontFamily: `"${headingFont}", sans-serif` }}>
                  {isBeatmakerProfile ? 'Beat Catalogue' : 'Singles'}
                </h2>
                <span className="text-xs" style={{ color: `${textColor}40` }}>{tracks.filter(t => !t.album_id).length}</span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {tracks.filter(t => !t.album_id).slice(0, 6).map(track => (
                  <div key={track.id} className="cursor-pointer group" onClick={() => handlePlayTrack(track)}>
                    <div className="aspect-square rounded-xl overflow-hidden mb-2" style={{ backgroundColor: `${textColor}08` }}>
                      {track.cover_artwork_url
                        ? <img src={track.cover_artwork_url} alt={track.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                        : <div className="w-full h-full flex items-center justify-center"><Music className="w-8 h-8" style={{ color: `${textColor}20` }} /></div>}
                    </div>
                    <p className="text-sm font-medium truncate" style={{ color: textColor }}>{track.title}</p>
                    <p className="text-xs truncate" style={{ color: `${textColor}50` }}>Single</p>
                  </div>
                ))}
              </div>
              {tracks.filter(t => !t.album_id).length > 6 && (
                <button onClick={() => navigate(`/artist/${artist.slug}/singles`)}
                  className="text-xs font-semibold mt-3" style={{ color: primaryColor }}>
                  See all {tracks.filter(t => !t.album_id).length} singles
                </button>
              )}
            </div>
          )}

        </div>
      )}

      {/* Collaborations — a sideways rail of square cards, like Popular but
          deliberately not the same card.

          Popular is a ranked top ten: numbered badge, play counts, the
          artwork doing the work. A collaboration is not ranked and its play
          count is not this artist's achievement, so copying that card would
          say the wrong thing. What matters here is WHO and IN WHAT ROLE.

          So: same square artwork and the same rail mechanics for
          consistency, then three differences — a heavier rounded-2xl frame
          with a hairline in the collab accent, the role sitting ON the
          artwork as a chip rather than a rank badge, and the role as the
          secondary line instead of plays.

          The See-more button is gone. A rail scrolls, so paging it was
          pointless; the count line below matches Popular's "Top 10 of N"
          instead. */}
      {collabs.length > 0 && (
        <div className="mb-8">
          <h2 className="text-lg font-bold mb-3 px-6" style={{ fontFamily: `"${headingFont}", sans-serif` }}>Collaborations</h2>

          <div className="flex space-x-3 overflow-x-auto px-6 scrollbar-hide" style={{ WebkitOverflowScrolling: 'touch' }}>
            {collabs.map(collab => {
              // Whose role is this?
              //
              // 'host' means the track belongs to THIS artist and the
              // collaboration row describes somebody else on it — so the chip
              // has to credit that person by name. Rendering the bare role
              // here is what made this artist's own songs read "featured":
              // true of the guest, nonsense about the owner.
              //
              // 'guest' means this artist appears on someone else's track, and
              // the role genuinely is theirs.
              const other = collab.artists;
              const chip = collab.direction === 'host'
                ? collabCredit(collab.role, other?.artist_name)
                : collabRoleLabel(collab.role);
              // The second line under the title is gone.
              //
              // It said "Featured Artist credit" or "On this track: Ian Sani",
              // which is the SAME fact as the chip on the artwork, written
              // twice in two different shapes — and neither of them is where
              // the full picture lives. The track page has the whole credit
              // list: every collaborator, every role, in one place. So the
              // card now carries the chip for the glance and an ⓘ for the
              // detail, the same affordance For You uses for exactly this.
              //
              // The outer element changed from <button> to <div role="button">
              // on purpose: the ⓘ is a real button, and a button inside a
              // button is invalid HTML that React warns about and browsers
              // resolve inconsistently.
              const trackPath = collab.tracks?.slug ? `/track/${collab.tracks.slug}` : null;
              return (
                <div
                  key={collab.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => handlePlayTrack(collab.tracks)}
                  onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handlePlayTrack(collab.tracks); } }}
                  className="flex-shrink-0 w-36 text-left cursor-pointer group"
                >
                  <div
                    className="relative aspect-square rounded-2xl overflow-hidden mb-2"
                    style={{
                      backgroundColor: `${secondaryColor}12`,
                      boxShadow: `inset 0 0 0 1px ${secondaryColor}33`,
                    }}
                  >
                    {collab.tracks?.cover_artwork_url
                      ? <img src={collab.tracks.cover_artwork_url} alt={collab.tracks?.title || ''} className="w-full h-full object-cover" />
                      : <div className="w-full h-full flex items-center justify-center"><Music className="w-8 h-8" style={{ color: `${textColor}20` }} /></div>}

                    {/* The credit on the artwork, where Popular puts its rank. */}
                    {chip && (
                      <span
                        className="absolute bottom-1.5 left-1.5 max-w-[calc(100%-12px)] truncate px-2 py-0.5 rounded-full text-[10px] font-semibold"
                        style={{ background: 'rgba(0,0,0,0.55)', color: '#fff', backdropFilter: 'blur(4px)' }}
                      >
                        {chip}
                      </span>
                    )}

                    <div className="absolute inset-0 flex items-center justify-center bg-black/35 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Play className="w-7 h-7 text-white" fill="white" />
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 min-w-0">
                    <p className="text-sm font-medium truncate flex-1 min-w-0" style={{ color: textColor }}>
                      {collab.tracks?.title}
                    </p>
                    {/* Full credits, on the page that owns them. Rendered only
                        when the track actually has a slug — without one this
                        would link to /track/undefined, which is the "not
                        found" page wearing a working link's clothes. */}
                    {trackPath && (
                      <button
                        onClick={e => { e.stopPropagation(); navigate(trackPath); }}
                        title="Full credits"
                        aria-label={`Credits for ${collab.tracks?.title || 'this track'}`}
                        className="flex-shrink-0 w-6 h-6 flex items-center justify-center rounded-full transition hover:bg-white/10 active:scale-90"
                      >
                        <Info className="w-3.5 h-3.5" style={{ color: `${textColor}45` }} strokeWidth={2} />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {collabs.length > 6 && (
            <p className="mt-3 px-6 text-sm" style={{ color: `${textColor}40` }}>
              {collabs.length} collaborations — scroll for more
            </p>
          )}
        </div>
      )}

      {tracks.length === 0 && albums.length === 0 && (
        <div className="px-6 py-12 text-center">
          <Music className="w-12 h-12 mx-auto mb-3" style={{ color: `${textColor}15` }} />
          <p className="text-sm" style={{ color: `${textColor}40` }}>No music published yet. Stay tuned!</p>
        </div>
      )}

      {pwywTrack && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ backgroundColor: 'rgba(0,0,0,0.85)' }}
          onClick={() => setPwywTrack(null)}>
          <div className="w-full max-w-sm rounded-2xl p-6 space-y-4"
            style={{ backgroundColor: bgColor, border: `1px solid ${primaryColor}20`, maxHeight: '90vh', overflowY: 'auto' }}
            onClick={e => e.stopPropagation()}>
            {pwywPurchaseSuccess ? (
              <div className="text-center py-4">
                <div className="w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-3" style={{ backgroundColor: `${secondaryColor}20` }}>
                  <Check className="w-7 h-7" style={{ color: secondaryColor }} />
                </div>
                <p className="font-semibold" style={{ color: textColor }}>Purchase Complete!</p>
                <p className="text-sm mt-1" style={{ color: `${textColor}50` }}>Starting download...</p>
              </div>
            ) : (
              <>
                <div className="flex items-center space-x-3">
                  <div className="w-12 h-12 rounded-lg overflow-hidden flex-shrink-0" style={{ backgroundColor: `${secondaryColor}20` }}>
                    {pwywTrack.cover_artwork_url
                      ? <img src={pwywTrack.cover_artwork_url} alt="" className="w-full h-full object-cover" />
                      : <div className="w-full h-full flex items-center justify-center"><Music className="w-5 h-5" style={{ color: `${textColor}30` }} /></div>}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold truncate" style={{ color: textColor }}>{pwywTrack.title}</p>
                    <p className="text-sm" style={{ color: `${textColor}50` }}>{artist.artist_name}</p>
                  </div>
                  <DollarSign className="w-5 h-5 flex-shrink-0" style={{ color: secondaryColor }} />
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium" style={{ color: textColor }}>Pay what you want</p>
                    {parseFloat(pwywTrack.minimum_price) > 0 && (
                      <p className="text-xs" style={{ color: `${textColor}40` }}>min ${parseFloat(pwywTrack.minimum_price).toFixed(2)}</p>
                    )}
                  </div>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm" style={{ color: `${textColor}50` }}>$</span>
                    <input type="number" min={parseFloat(pwywTrack.minimum_price) > 0 ? pwywTrack.minimum_price : 0}
                      step="0.01" value={pwywFanPrice}
                      onChange={e => {
                        setPwywFanPrice(e.target.value);
                        setPwywFanPriceError('');
                        // The hook debounces and discards out-of-order
                        // replies; this just says what to quote.
                        const v = parseFloat(e.target.value);
                        setQuoteFor(v > 0 ? { trackId: pwywTrack.id, amount: v } : null);
                      }}
                      placeholder="0.00"
                      className="w-full pl-7 pr-4 py-3 rounded-xl text-lg font-semibold outline-none text-center"
                      style={{ backgroundColor: `${textColor}08`, color: textColor, border: `1px solid ${textColor}15` }} />
                  </div>
                  {pwywFanPriceError && <p className="text-xs text-red-400 text-center">{pwywFanPriceError}</p>}
                  {parseFloat(pwywTrack.minimum_price) === 0 && (
                    <p className="text-xs text-center" style={{ color: `${textColor}30` }}>Enter $0 to download free</p>
                  )}
                  <div className="flex space-x-2">
                    {[1, 2, 5, 10].filter(v => v >= (parseFloat(pwywTrack.minimum_price) || 0)).map(v => (
                      <button key={v} type="button"
                        onClick={() => {
                          setPwywFanPrice(v.toFixed(2));
                          setPwywFanPriceError('');
                          setQuoteFor({ trackId: pwywTrack.id, amount: v });
                        }}
                        className="flex-1 py-1.5 rounded-lg text-xs font-medium transition"
                        style={{
                          backgroundColor: parseFloat(pwywFanPrice) === v ? primaryColor : `${textColor}08`,
                          color: parseFloat(pwywFanPrice) === v ? bgColor : `${textColor}50`,
                          border: `1px solid ${textColor}10`,
                        }}>
                        ${v}
                      </button>
                    ))}
                  </div>
                  <PriceBreakdown quote={quote} sellerName={artist?.artist_name}
                  textColor={textColor} accentColor={secondaryColor} />
                </div>
                {parseFloat(pwywFanPrice) > 0 ? (
                  <>
                    {pwywPurchaseError && <p className="text-xs text-red-400 text-center">{pwywPurchaseError}</p>}
                    {!pwywPaypalReady && !pwywPurchaseError && (
                      <div className="flex justify-center py-2"><Loader className="w-5 h-5 animate-spin" style={{ color: `${textColor}30` }} /></div>
                    )}
                    {pwywPaypalReady && (() => {
                      const minPrice = parseFloat(pwywTrack.minimum_price) || 0;
                      const amount = parseFloat(pwywFanPrice);
                      if (minPrice > 0 && amount < minPrice) {
                        return <p className="text-xs text-red-400 text-center">Minimum is ${minPrice.toFixed(2)}</p>;
                      }
                      setTimeout(() => {
                        const container = document.getElementById('paypal-pwyw-container');
                        if (!container || !window.paypal) return;
                        container.innerHTML = '';
                        window.paypal.Buttons({
                          style: { layout: 'vertical', color: 'gold', shape: 'rect', label: 'pay' },
                          createOrder: async () => {
                            setPwywPurchaseError('');
                            const res = await fetch('/.netlify/functions/paypal-order', {
                              method: 'POST', headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ action: 'create', trackId: pwywTrack.id, amount, trackTitle: pwywTrack.title, artistName: artist?.artist_name }),
                            });
                            const { orderId, error } = await res.json();
                            if (error || !orderId) throw new Error(error || 'Failed to create order');
                            return orderId;
                          },
                          onApprove: async (data) => {
                            const res = await fetch('/.netlify/functions/paypal-order', {
                              method: 'POST', headers: { 'Content-Type': 'application/json' },
                              // userId WAS MISSING HERE, and only here.
                              //
                              // Every other capture call site on the platform sends it
                              // (TrackActionSheet, PaidPlayGate, BeatDetailPage,
                              // AlbumDetailPage, and the fixed-price button 1500 lines
                              // above). This one did not, so paypal-order fell back to
                              // matching the PayPal payer email against user_profiles.
                              // When a buyer's PayPal email differs from the email she
                              // signed up with — the normal case, not the exception —
                              // nothing matched, resolvedUserId stayed null, and the
                              // downloads row that grants the file was never written.
                              // The money was taken, `success: true` came back, this
                              // showed a receipt, and the download was then refused
                              // with "Purchase required".
                              //
                              // That is the whole difference between a pay-what-you-want
                              // sale and a fixed-price one. Nothing else about PWYW was
                              // wrong at this layer.
                              body: JSON.stringify({ action: 'capture', orderId: data.orderID, userId: user?.id }),
                            });
                            const captureData = await res.json();
                            if (!captureData.success) throw new Error('Payment capture failed');

                            // `success` only ever meant "PayPal took the money". It does
                            // not mean the download was granted. TrackActionSheet already
                            // reads this; this path showed a green tick either way.
                            if (captureData.recorded === false) {
                              setPwywPurchaseError(
                                'Your payment went through, but we could not attach the download to your account. '
                                + 'Nothing further will be charged — contact support with this reference: '
                                + (captureData.captureId || 'unknown')
                              );
                              return;
                            }
                            // purchases + downloads recorded server-side in paypal-order.js
                            setPwywPurchaseSuccess(true);
                            showReceipt({
                              kind: 'purchase',
                              title: pwywTrack?.title,
                              subtitle: artist?.artist_name,
                              amount: parseFloat(pwywFanPrice) || 0,
                            });
                            setTimeout(async () => {
                              await triggerDownload(pwywTrack);
                              setPwywTrack(null);
                              setPwywPurchaseSuccess(false);
                            }, 1500);
                          },
                          onError: () => setPwywPurchaseError('Payment failed. Please try again.'),
                          onCancel: () => {},
                        }).render('#paypal-pwyw-container');
                      }, 0);
                      return null;
                    })()}
                    <div id="paypal-pwyw-container" style={{ backgroundColor: '#fff', borderRadius: '8px', padding: '4px' }} />
                  </>
                ) : (
                  <button onClick={async () => {
                    const minPrice = parseFloat(pwywTrack.minimum_price) || 0;
                    if (minPrice > 0) { setPwywFanPriceError(`Minimum is $${minPrice.toFixed(2)}`); return; }
                    // The client-side downloads insert that was here is gone.
                    //
                    // It was redundant: triggerDownload below calls
                    // get-download-url.js, whose free branch writes exactly this
                    // row server-side moments later, with the service role.
                    //
                    // It was also the only reason the browser needed insert
                    // rights on a table that grants access to files. The policy
                    // backing it was `with check (auth.uid() = user_id)` and
                    // nothing else, so any signed-in listener could insert
                    // { track_id: <any paid track>, amount_paid: 9999,
                    //   download_type: 'paid' } from the console and download
                    // the whole catalogue. Migration 132 narrows the policy to
                    // free grants only; removing this call is what makes that
                    // narrowing cost nothing.
                    await triggerDownload(pwywTrack);
                    setPwywTrack(null);
                  }}
                    className="w-full py-3 rounded-xl text-sm font-semibold transition"
                    style={{ backgroundColor: primaryColor, color: bgColor }}>
                    Download Free
                  </button>
                )}
                <button onClick={() => setPwywTrack(null)} className="w-full py-2 text-sm transition" style={{ color: `${textColor}30` }}>
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
          artist={artist}
          shareUrl={shareShortUrl}
          onClose={() => setShowShareCard(false)}
        />
      )}
      {purchaseTrack && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ backgroundColor: 'rgba(0,0,0,0.8)' }}
          onClick={() => { setPurchaseTrack(null); setPurchasing(false); setPurchaseError(''); }}>
          <div className="w-full max-w-sm rounded-2xl p-6 space-y-4 overflow-y-auto"
            style={{ backgroundColor: bgColor, border: `1px solid ${primaryColor}20`, maxHeight: '90vh' }}
            onClick={e => e.stopPropagation()}>
            {purchaseSuccess ? (
              <div className="text-center py-4">
                <div className="w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-3" style={{ backgroundColor: `${secondaryColor}20` }}>
                  <Check className="w-7 h-7" style={{ color: secondaryColor }} />
                </div>
                <p className="font-semibold" style={{ color: textColor }}>Purchase Complete!</p>
                <p className="text-sm mt-1" style={{ color: `${textColor}50` }}>Starting download...</p>
              </div>
            ) : (
              <>
                <div className="flex items-center space-x-3">
                  <div className="w-12 h-12 rounded-lg overflow-hidden flex-shrink-0" style={{ backgroundColor: `${secondaryColor}20` }}>
                    {purchaseTrack.cover_artwork_url
                      ? <img src={purchaseTrack.cover_artwork_url} alt="" className="w-full h-full object-cover" />
                      : <div className="w-full h-full flex items-center justify-center"><Music className="w-5 h-5" style={{ color: `${textColor}30` }} /></div>}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold truncate" style={{ color: textColor }}>{purchaseTrack.title}</p>
                    <p className="text-sm" style={{ color: `${textColor}50` }}>{artist.artist_name}</p>
                  </div>
                  <p className="text-xl font-bold flex-shrink-0" style={{ color: secondaryColor }}>${getEffectivePrice(purchaseTrack)}</p>
                </div>
                <PriceBreakdown quote={quote} sellerName={artist?.artist_name}
                  textColor={textColor} accentColor={secondaryColor} />
                <div className="rounded-xl p-3 text-center" style={{ backgroundColor: `${textColor}05`, border: `1px solid ${textColor}10` }}>
                  <p className="text-xs" style={{ color: `${textColor}40` }}>High-quality MP3 download delivered instantly after payment</p>
                </div>
                {purchaseError && <p className="text-xs text-red-400 text-center">{purchaseError}</p>}
                {!paypalReady && !purchaseError && (
                  <div className="flex justify-center py-3"><Loader className="w-5 h-5 animate-spin text-white/30" /></div>
                )}
                <div id="paypal-checkout-container" style={{ backgroundColor: '#fff', borderRadius: '8px', padding: '4px' }} />
                <button onClick={() => { setPurchaseTrack(null); setPurchasing(false); setPurchaseError(''); }}
                  className="w-full py-2.5 rounded-xl text-sm transition" style={{ color: `${textColor}40` }}>
                  Cancel
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* Artist Playlists */}
      {artistPlaylists.length > 0 && (
        <div className="mb-8 py-5" style={{ background: `linear-gradient(135deg, rgba(49,46,129,0.18) 0%, rgba(20,20,50,0.4) 60%, transparent 100%)`, borderTop: `1px solid rgba(99,102,241,0.15)`, borderBottom: `1px solid rgba(99,102,241,0.08)` }}>
          <div className="flex items-center justify-between mb-3 px-6">
            <h2 className="text-lg font-bold" style={{ fontFamily: `"${headingFont}", sans-serif` }}>Playlists</h2>
            {isProfileOwner && (
              <button onClick={() => navigate('/library/playlists')}
                className="w-7 h-7 rounded-full flex items-center justify-center transition hover:opacity-80"
                style={{ background: `${secondaryColor}20`, border: `1px solid ${secondaryColor}30` }}>
                <span className="text-sm" style={{ color: secondaryColor }}>+</span>
              </button>
            )}
          </div>
          <div className="flex space-x-3 overflow-x-auto scrollbar-hide px-6">
            {artistPlaylists.map(pl => (
              <div key={pl.id} className="flex-shrink-0 w-36 cursor-pointer group"
                onClick={() => navigate(`/library/playlists/${pl.id}`)}>
                <div className="aspect-square rounded-xl overflow-hidden mb-2" style={{ backgroundColor: `${textColor}08` }}>
                  {(() => {
                      const auto = pl.playlist_tracks?.find(pt => pt.tracks?.cover_artwork_url)?.tracks?.cover_artwork_url;
                      const src = pl.cover_url || auto;
                      return src
                        ? <img src={src} alt={pl.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                        : <div className="w-full h-full flex items-center justify-center" style={{ background: `linear-gradient(135deg, ${secondaryColor}40, ${accentColor}20)` }}>
                            <Music className="w-8 h-8" style={{ color: `${textColor}20` }} />
                          </div>;
                    })()}
                </div>
                <p className="text-sm font-medium truncate" style={{ color: textColor }}>{pl.name}</p>
                <p className="text-xs truncate" style={{ color: `${textColor}50` }}>{pl.user_id !== artist?.user_id ? '👥 Collab' : 'Playlist'}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Deep Cuts removed: it sat below everything else and Steve noted
          nobody scrolls that far, so it was shelf space rather than a feature. */}

      {similarArtists.length > 0 && (
        <div className="mb-8 py-5" style={{ background: `linear-gradient(135deg, rgba(136,19,55,0.18) 0%, rgba(30,10,20,0.4) 60%, transparent 100%)`, borderTop: `1px solid rgba(244,63,94,0.15)`, borderBottom: `1px solid rgba(244,63,94,0.08)` }}>
          <h2 className="text-lg font-bold mb-3 px-6" style={{ fontFamily: `"${headingFont}", sans-serif` }}>Similar Artists</h2>
          <div className="flex space-x-4 overflow-x-auto scrollbar-hide px-6">
            {similarArtists.map(a => (
              <div key={a.id} className="flex-shrink-0 w-24 cursor-pointer group" onClick={() => navigate(`/artist/${a.slug}`)}>
                <div className="w-24 h-24 rounded-full overflow-hidden mb-2 mx-auto" style={{ backgroundColor: `${textColor}08` }}>
                  {a.profile_image_url
                    ? <img src={a.profile_image_url} alt={a.artist_name} className="w-full h-full object-cover" />
                    : <div className="w-full h-full flex items-center justify-center"><Music className="w-8 h-8" style={{ color: `${textColor}20` }} /></div>}
                </div>
                <p className="text-xs font-medium text-center truncate" style={{ color: textColor }}>{a.artist_name}</p>
              </div>
            ))}
          </div>
        </div>
      )}




      {/* About, at the foot of the page in its own collapsible card, the way
          Spedify and Spotify do it. In the header a long bio pushed the
          action pills down the page and broke the layout. Collapsed by
          default past a few lines, so the length of someone's bio can never
          decide how the page looks. */}
      {artist.bio && (
        <div className="px-6 mb-10">
          <div className="rounded-2xl p-5"
            style={{ backgroundColor: `${textColor}06`, border: `1px solid ${textColor}12` }}>
            <button
              onClick={() => setBioOpen(o => !o)}
              className="w-full flex items-center justify-between gap-3 text-left">
              <h2 className="text-lg font-bold" style={{ fontFamily: `"${headingFont}", sans-serif`, color: textColor }}>
                About
              </h2>
              <ChevronRight
                className={`w-4 h-4 flex-shrink-0 transition-transform ${bioOpen ? 'rotate-90' : ''}`}
                style={{ color: `${textColor}50` }} />
            </button>
            <p
              className={`text-sm leading-relaxed mt-3 max-w-3xl ${bioOpen ? '' : 'line-clamp-3'}`}
              style={{ color: `${textColor}90`, fontFamily: `"${bodyFont}", sans-serif` }}>
              {artist.bio}
            </p>
            {artist.bio.length > 180 && (
              <button onClick={() => setBioOpen(o => !o)}
                className="text-xs font-semibold mt-2"
                style={{ color: primaryColor }}>
                {bioOpen ? 'Show less' : 'Read more'}
              </button>
            )}
          </div>
        </div>
      )}

      {viewingStory && stories.length > 0 && (
        <ArtistStoryView
          stories={stories}
          artist={artist}
          initialIndex={0}
          isOwner={user?.id === artist.user_id}
          onDelete={async (storyId) => {
            await supabase.from('artist_stories').delete().eq('id', storyId);
            setStories(prev => {
              const remaining = prev.filter(s => s.id !== storyId);
              if (remaining.length === 0) setViewingStory(false);
              return remaining;
            });
          }}
          onClose={() => setViewingStory(false)}
        />
      )}



      {/* Weekly discovery count */}
      {weeklyDiscoveries > 0 && (
        <div className="mx-6 mb-6 py-3 px-4 rounded-xl text-center" style={{ background: `${accentColor}10`, border: `1px solid ${accentColor}20` }}>
          <p className="text-xs" style={{ color: `${textColor}50` }}>
            <span className="font-bold" style={{ color: accentColor }}>{weeklyDiscoveries}</span>
            {' '}listener{weeklyDiscoveries !== 1 ? 's' : ''} discovered {artist?.artist_name} this week
          </p>
        </div>
      )}



      <div className="px-6 pt-8 pb-4 text-center">
        <p className="text-[11px]" style={{ color: `${textColor}20` }}>
          Powered by <span className="font-medium" style={{ color: `${textColor}30` }}>Feelz Machine</span>
        </p>
      </div>

      {/* ── Community Modal ─────────────────────────────────────────────── */}
      {/* ── Create Modal ─────────────────────────────────────────────────── */}
      {showCreateModal && (
        <div className="fixed inset-0 z-[600] flex items-center justify-center px-6 bg-black/80 backdrop-blur-sm md:pl-64"
          onClick={() => { setShowCreateModal(false); setCreateTab('menu'); }}>
          <div className="w-full overflow-y-auto overflow-x-hidden rounded-3xl"
            style={{ maxWidth: 360, maxHeight: '85vh', backgroundColor: '#0f0f0f', border: '1px solid rgba(255,255,255,0.08)', boxShadow: '0 32px 64px rgba(0,0,0,0.6)' }}
            onClick={e => e.stopPropagation()}>

            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.06]">
              <div className="flex items-center space-x-2">
                {createTab !== 'menu' && (
                  <button onClick={() => { setCreateTab('menu'); }}
                    className="w-7 h-7 flex items-center justify-center rounded-full bg-white/[0.08] hover:bg-white/[0.15] transition">
                    <ChevronDown className="w-3.5 h-3.5 text-white/60 rotate-90" />
                  </button>
                )}
                <p className="text-sm font-bold text-white">
                  {createTab === 'menu' ? 'Create' : createTab === 'story' ? 'Add Story' : 'Message Fans'}
                </p>
              </div>
              <button onClick={() => { setShowCreateModal(false); setCreateTab('menu'); }}
                className="w-8 h-8 flex items-center justify-center rounded-full bg-white/[0.08] hover:bg-white/[0.15] transition">
                <X className="w-4 h-4 text-white/60" />
              </button>
            </div>

            <div className="p-4 space-y-3">

              {/* ── Menu ── */}
              {createTab === 'menu' && (
                <>
                  {[
                    { id: 'upload',  icon: '🎵', label: 'Upload Track',        sub: 'Add new music to your profile',         color: 'yellow' },
                    { id: 'story',   icon: '📸', label: 'Add Story',           sub: 'Share a 24hr clip with fans',           color: 'purple' },
                    { id: 'edit',    icon: '✏️', label: 'Edit Profile',        sub: 'Update your bio, photo and links',      color: 'gray' },
                    MERCH_PARKED
                      ? { id: 'merch_parked', icon: '🛍️', label: 'Merch Store',    sub: 'Paused — tap to see why',             color: 'gray'   }
                      : isPremium
                        ? { id: 'merch',        icon: '🛍️', label: 'Merch Store',    sub: 'Connect Printful · sell to your fans', color: 'purple' }
                        : { id: 'merch_locked', icon: '🛍️', label: 'Merch Store',    sub: 'Premium only, upgrade to unlock',     color: 'gray'   },
                    { id: 'dm',      icon: '📣', label: 'Message Fans',        sub: 'Send a notification to all followers',  color: 'green' },
                    { id: 'memo',    icon: '🎙️', label: 'Voice Memo',          sub: 'Record a message for your fans',        color: 'pink' },
                    { id: 'live',    icon: '🔴', label: 'Go Live',             sub: 'Start a live session',                  color: 'red' },
                  ].map(({ id, icon, label, sub, color }) => (
                    <button key={id}
                      onClick={() => {
                        if (id === 'live')    { setCreateTab('live'); setLiveTitle(`${artist?.artist_name}'s Live Session`); }
                        else if (id === 'memo')   { setCreateTab('memo'); }
                        else if (id === 'upload') { setShowCreateModal(false); setCreateTab('menu'); navigate('/dashboard?tab=upload'); }
                        else if (id === 'edit')   { setShowCreateModal(false); setCreateTab('menu'); navigate('/profile/edit'); }
                        else if (id === 'merch_parked') { setShowCreateModal(false); setCreateTab('menu'); setShowMerchParked(true); }
                        else if (id === 'merch')        { setShowCreateModal(false); setCreateTab('menu'); setShowMerchConnect(true); }
                        else if (id === 'merch_locked') { setShowCreateModal(false); setCreateTab('menu'); navigate('/upgrade'); }
                        else setCreateTab(id);
                      }}
                      className={`w-full flex items-center space-x-3 p-4 rounded-2xl border transition active:scale-[0.98] text-left`}
                      style={{ borderColor: `rgba(255,255,255,0.06)`, background: 'rgba(255,255,255,0.02)' }}>
                      <span className="text-2xl flex-shrink-0">{icon}</span>
                      <div>
                        <p className="text-sm font-semibold text-white">{label}</p>
                        <p className="text-xs text-white/30 mt-0.5">{sub}</p>
                      </div>
                    </button>
                  ))}
                </>
              )}

              {/* ── Story ── */}
              {createTab === 'story' && (
                <div className="rounded-2xl border border-white/[0.06] overflow-hidden" style={{ background: 'rgba(255,255,255,0.02)' }}>
                  <StoryUpload artistId={artist.id} inline onUploaded={() => { setShowCreateModal(false); setCreateTab('menu'); }} />
                </div>
              )}

              {/* ── Voice Memo ── */}
              {createTab === 'memo' && (
                <VoiceMemoUpload artistId={artist.id} onUploaded={() => { setShowCreateModal(false); setCreateTab('menu'); }} />
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
                    <span>📅 Schedule for later</span><span className="text-xs">{scheduleMode ? 'On' : 'Off'}</span>
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
                      : scheduleMode ? <><span>📅</span><span>Schedule Stream</span></> : <><Radio className="w-4 h-4" /><span>Go Live</span></>}
                  </button>
                </div>
              )}

            </div>
          </div>
        </div>
      )}

      {showCommunity && (
        <div className="fixed inset-0 z-[600] flex items-center justify-center px-6 bg-black/80 backdrop-blur-sm md:pl-64"
          onClick={() => setShowCommunity(false)}>
          <div className="w-full overflow-y-auto overflow-x-hidden rounded-3xl"
            style={{ maxWidth: 400, maxHeight: '85vh', backgroundColor: '#0f0f0f', border: '1px solid rgba(255,255,255,0.08)', boxShadow: '0 32px 64px rgba(0,0,0,0.6)' }}
            onClick={e => e.stopPropagation()}>

            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.06]">
              <div>
                <p className="text-sm font-bold text-white">Community</p>
                <p className="text-xs text-white/30 mt-0.5">{artist.artist_name}</p>
              </div>
              <div className="flex items-center space-x-2">
                <button onClick={() => { setShowCommunity(false); navigate('/community'); }}
                  className="flex items-center space-x-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition"
                  style={{ backgroundColor: `${secondaryColor}20`, color: secondaryColor, border: `1px solid ${secondaryColor}30` }}>
                  <MessageCircle className="w-3 h-3" />
                  <span>Chat Rooms</span>
                </button>
                <button onClick={() => setShowCommunity(false)}
                  className="w-8 h-8 flex items-center justify-center rounded-full bg-white/[0.08] hover:bg-white/[0.15] transition">
                  <X className="w-4 h-4 text-white/60" />
                </button>
              </div>
            </div>

            <div className="px-5 py-4 space-y-6">

              {/* Stories */}
              {stories.length > 0 && (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: `${textColor}40` }}>Stories</p>
                  <button onClick={() => { setShowCommunity(false); setViewingStory(true); }}
                    className="flex items-center space-x-3 w-full p-3 rounded-2xl transition hover:bg-white/[0.04]"
                    style={{ border: '1px solid rgba(255,255,255,0.06)' }}>
                    <div className="w-12 h-12 rounded-full p-0.5 flex-shrink-0" style={{ background: 'linear-gradient(135deg, #8B5CF6, #06B6D4)' }}>
                      <div className="w-full h-full rounded-full overflow-hidden" style={{ backgroundColor: bgColor }}>
                        {artist.profile_image_url
                          ? <img src={artist.profile_image_url} alt="" className="w-full h-full object-cover" />
                          : <div className="w-full h-full flex items-center justify-center text-xs font-bold" style={{ color: textColor }}>{artist.artist_name?.[0]}</div>}
                      </div>
                    </div>
                    <div className="text-left">
                      <p className="text-sm font-medium" style={{ color: textColor }}>{artist.artist_name}</p>
                      <p className="text-xs" style={{ color: `${textColor}40` }}>{stories.length} active {stories.length === 1 ? 'story' : 'stories'}</p>
                    </div>
                  </button>
                </div>
              )}

              {/* Top Listeners */}
              {topListeners.length > 0 && (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: `${textColor}40` }}>Top Listeners</p>
                  <div className="flex items-center space-x-3 flex-wrap gap-y-2">
                    {topListeners.map((listener, i) => (
                      <div key={listener.user_id} className="flex flex-col items-center" title={listener.name}>
                        <div className="relative">
                          <div className="w-10 h-10 rounded-full overflow-hidden border-2" style={{ borderColor: i === 0 ? primaryColor : `${textColor}20` }}>
                            {listener.avatar
                              ? <img src={listener.avatar} alt={listener.name} className="w-full h-full object-cover" />
                              : <div className="w-full h-full flex items-center justify-center text-xs font-bold" style={{ background: `${primaryColor}30`, color: textColor }}>{listener.name[0]}</div>}
                          </div>
                          {i === 0 && <span className="absolute -top-1 -right-1 text-[10px]">👑</span>}
                        </div>
                        <span className="text-[9px] mt-1 max-w-[40px] truncate text-center" style={{ color: `${textColor}50` }}>{listener.count}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Listener Guestbook */}
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: `${textColor}40` }}>Listener Comments</p>
                <ArtistGuestbook artistId={artist?.id} textColor={textColor} accentColor={accentColor} isOwner={isProfileOwner} />
              </div>

              {/* Voice Memos */}
              {voiceMemos.length > 0 && (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: `${textColor}40` }}>Voice Memos</p>
                  <div className="space-y-2">
                    {voiceMemos.map(memo => (
                      <VoiceMemoCard key={memo.id} memo={memo} canDelete={false} />
                    ))}
                  </div>
                </div>
              )}

              {voiceMemos.length === 0 && (
                <p className="text-xs text-white/20 text-center py-4">Nothing here yet, check back soon</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}