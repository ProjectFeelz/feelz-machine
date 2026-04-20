import { Helmet } from 'react-helmet-async';
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useStreakContext } from '../contexts/StreakContext';
import { useTier } from '../contexts/useTier';
import { supabase } from '../supabaseClient';
import CollabThread from '../components/CollabThread';
import ProfileCompletionBanner from '../components/ProfileCompletionBanner';
import {
  Shield, Users, BarChart3, Music, Flame,
  Upload, HeartHandshake, Bell, Palette, MessageCircle,
  ChevronRight, Crown, Zap, Star, LayoutDashboard,
  User, LogOut, DollarSign, Megaphone, Radio, Trophy, Brain, Mic2, Loader, X, Youtube,
  Info, Globe, Lock, Search, Plus,
} from 'lucide-react';

function LinkCard({ icon: Icon, label, description, path, color, onClick }) {
  const navigate = useNavigate();
  return (
    <button
      onClick={() => onClick ? onClick() : navigate(path)}
      className="w-full flex items-center space-x-4 p-4 bg-white/[0.03] rounded-xl border border-white/[0.06] hover:bg-white/[0.06] active:bg-white/[0.08] transition text-left group"
    >
      <div className={`w-11 h-11 rounded-lg ${color} flex items-center justify-center flex-shrink-0`}>
        <Icon className="w-5 h-5 text-white" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-white">{label}</p>
        {description && <p className="text-[11px] text-white/30 mt-0.5">{description}</p>}
      </div>
      <ChevronRight className="w-4 h-4 text-white/15 group-hover:text-white/30 transition flex-shrink-0" />
    </button>
  );
}

function SectionHeader({ title, icon: Icon }) {
  return (
    <div className="flex items-center space-x-2 mb-3 px-1">
      <Icon className="w-4 h-4 text-white/30" />
      <h2 className="text-xs uppercase tracking-wider text-white/30 font-semibold">{title}</h2>
    </div>
  );
}

function Section({ title, icon: Icon, children }) {
  return (
    <div className="mb-6">
      <SectionHeader title={title} icon={Icon} />
      <div className="space-y-2">{children}</div>
    </div>
  );
}

const ARTIST_TABS = [
  { key: 'home',    label: 'Home' },
  { key: 'collabs', label: 'Collabs' },
];

export default function HubPage() {
  const navigate = useNavigate();
  const { user, artist, isAdmin, isArtist, signOut } = useAuth();
  const { tierSlug, tierLoading } = useTier();
  const { streak } = useStreakContext();
  const [activeTab, setActiveTab] = useState('home');
  const [startingSession, setStartingSession]   = useState(false);
  const [showLiveModal, setShowLiveModal]       = useState(false);
  const [liveTitle, setLiveTitle]               = useState('');
  const [liveMode, setLiveMode]                 = useState('audio'); // 'audio' | 'youtube'
  const [liveYoutubeUrl, setLiveYoutubeUrl]     = useState('');
  const [scheduleMode, setScheduleMode]         = useState(false); // toggle schedule vs go live now
  const [scheduledAt, setScheduledAt]           = useState('');    // ISO datetime string
  const [queueTracks, setQueueTracks]           = useState([]);    // pre-session queue for audio mode
  const [trackSearch, setTrackSearch]           = useState('');
  const [trackResults, setTrackResults]         = useState([]);
  const [searchingTracks, setSearchingTracks]   = useState(false);

  const openLiveModal = () => {
    if (!artist) return;
    setLiveTitle(`${artist.artist_name}'s Live Session`);
    setLiveMode('audio');
    setLiveYoutubeUrl('');
    setScheduleMode(false);
    setScheduledAt('');
    setQueueTracks([]);
    setTrackSearch('');
    setTrackResults([]);
    setShowLiveModal(true);
  };

  // Track search for audio queue
  useEffect(() => {
    if (!artist?.id || trackSearch.trim().length < 2) { setTrackResults([]); return; }
    const t = setTimeout(async () => {
      setSearchingTracks(true);
      const { data } = await supabase
        .from('tracks')
        .select('id, title, cover_artwork_url, duration')
        .eq('artist_id', artist.id)
        .ilike('title', `%${trackSearch.trim()}%`)
        .limit(8);
      setTrackResults((data || []).filter(t => !queueTracks.find(q => q.id === t.id)));
      setSearchingTracks(false);
    }, 300);
    return () => clearTimeout(t);
  }, [trackSearch, artist?.id, queueTracks]);

  const addToQueue = (track) => {
    setQueueTracks(prev => [...prev, track]);
    setTrackSearch('');
    setTrackResults([]);
  };

  const removeFromQueue = (trackId) => {
    setQueueTracks(prev => prev.filter(t => t.id !== trackId));
  };

  const fmtDuration = (s) => {
    if (!s) return '';
    const m = Math.floor(s / 60);
    return `${m}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
  };

  const startLiveSession = async () => {
    if (!artist || startingSession) return;
    setStartingSession(true);
    try {
      // Check for existing live session
      const { data: existing } = await supabase
        .from('listening_sessions')
        .select('id')
        .eq('artist_id', artist.id)
        .eq('status', 'live')
        .maybeSingle();

      if (existing) {
        setShowLiveModal(false);
        navigate(`/session/${existing.id}`);
        return;
      }

      const title = liveTitle.trim() || `${artist.artist_name}'s Live Session`;
      const isScheduled = scheduleMode && scheduledAt;
      const insertData = {
        artist_id: artist.id, title, mode: liveMode,
        status: isScheduled ? 'scheduled' : 'live',
        ...(isScheduled ? { scheduled_at: new Date(scheduledAt).toISOString() } : {}),
        ...(liveMode === 'youtube' && liveYoutubeUrl ? { youtube_url: liveYoutubeUrl } : {}),
      };
      const { data: session, error } = await supabase
        .from('listening_sessions')
        .insert(insertData)
        .select().single();

      if (error) throw error;

      // Notify followers
      const { data: { session: authSession } } = await supabase.auth.getSession();
      fetch('/.netlify/functions/notify-session-live', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: session.id, artist_id: artist.id, token: authSession?.access_token }),
      }).catch(() => {});

      // Pre-populate the queue if tracks were selected
      if (liveMode === 'audio' && queueTracks.length > 0) {
        await supabase.from('listening_session_queue').insert(
          queueTracks.map((track, i) => ({
            session_id: session.id,
            track_id: track.id,
            position: i,
          }))
        );
      }

      setShowLiveModal(false);
      if (!scheduleMode || !scheduledAt) {
        navigate(`/session/${session.id}`);
      }
    } catch (err) {
      console.error('Start session error:', err);
    }
    setStartingSession(false);
  };

  const tierConfig = {
    premium: { label: 'Premium', color: 'text-yellow-400', bg: 'bg-yellow-500/10', icon: Crown },
    pro:     { label: 'Pro',     color: 'text-purple-400', bg: 'bg-purple-500/10', icon: Zap },
    free:    { label: 'Free',    color: 'text-white/30',   bg: 'bg-white/[0.04]',  icon: Star },
  };
  const tier     = tierConfig[tierSlug] || tierConfig.free;
  const TierIcon = tier.icon;

  if (!user) {
    return (
      <div className="min-h-screen bg-black flex flex-col items-center justify-center px-6">
        <User className="w-12 h-12 text-white/10 mb-4" />
        <h2 className="text-lg font-semibold text-white mb-2">Sign in to continue</h2>
        <p className="text-sm text-white/30 mb-4">Access your dashboard, library and more</p>
        <button onClick={() => navigate('/login')}
          className="px-6 py-2.5 bg-white text-black rounded-lg font-medium text-sm">
          Sign In
        </button>
      </div>
    );
  }

  return (
    <div className="pb-32 px-4 md:px-0">
      <Helmet>
        <title>Hub · Feelz Machine</title>
        <meta name="description" content="Your Feelz Machine control center — access your dashboard, library, community and settings." />
        <link rel="canonical" href="https://www.feelzmachine.com/hub" />
        <meta property="og:title" content="Hub · Feelz Machine" />
        <meta property="og:url" content="https://www.feelzmachine.com/hub" />
      </Helmet>

      {/* Header */}
      <div className="mb-6 sticky top-0 z-20 bg-black/95 backdrop-blur-xl md:relative md:top-auto md:bg-transparent md:backdrop-blur-none pt-14 md:pt-4 pb-3 -mx-4 px-4 border-b border-white/[0.04] md:border-none">
        <div className="flex items-center space-x-3 mb-1">
          <LayoutDashboard className="w-6 h-6 text-white/60" />
          <h1 className="text-2xl font-bold text-white">Hub</h1>
        </div>
        <p className="text-sm text-white/40">Your control center</p>

        {streak > 1 && (
          <div className="flex items-center space-x-1.5 mt-1">
            <Flame className="w-3.5 h-3.5 text-orange-400" />
            <span className="text-xs font-semibold text-orange-400">{streak}-day streak</span>
            {streak >= 7 && <span className="text-[10px] text-orange-400/50">🔥</span>}
          </div>
        )}

        {isArtist && (
          <div className="flex space-x-1 mt-4 bg-white/[0.03] rounded-lg p-1">
            {ARTIST_TABS.map(({ key, label }) => (
              <button key={key} onClick={() => setActiveTab(key)}
                className={`flex-1 py-2 rounded-md text-sm font-medium transition ${
                  activeTab === key ? 'bg-white text-black' : 'text-white/40 hover:text-white/70'
                }`}>
                {label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Collabs tab */}
      {isArtist && activeTab === 'collabs' && (
        <div className="space-y-4">
          <CollabThread />
        </div>
      )}

      {/* Home tab */}
      {(!isArtist || activeTab === 'home') && (
        <>
          {isArtist && <ProfileCompletionBanner />}

          {/* Tier card */}
          {isArtist && !tierLoading && (
            <button
              onClick={() => navigate('/upgrade')}
              className={`w-full flex items-center justify-between p-4 rounded-xl border border-white/[0.06] ${tier.bg} mb-6 transition hover:brightness-110`}
            >
              <div className="flex items-center space-x-3">
                <TierIcon className={`w-5 h-5 ${tier.color}`} />
                <div className="text-left">
                  <p className={`text-sm font-semibold ${tier.color}`}>{tier.label} Plan</p>
                  <p className="text-[11px] text-white/30">
                    {tierSlug === 'free' ? 'Upgrade to unlock more features' : 'Manage your subscription'}
                  </p>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-white/20" />
            </button>
          )}

          {/* Admin */}
          {isAdmin && (
            <Section title="Admin" icon={Shield}>
              <LinkCard icon={Shield} label="Admin Panel" description="Broadcast · Analytics · Moderation · Users" path="/admin" color="bg-yellow-500/20" />
              <LinkCard icon={MessageSquare} label="Message a User" description="Send a notification directly to any user" onClick={() => setShowDMModal(true)} color="bg-blue-500/20" />
            </Section>
          )}

          {/* Listener */}
          {!isArtist && (
            <Section title="Discover" icon={Music}>
              <LinkCard icon={Music}         label="Browse Music"     description="Find new tracks and artists"   path="/browse"             color="bg-purple-500/20" />
              <LinkCard icon={Mic2}          label="Discover Artists" description="Find and follow new artists"   path="/browse?tab=artists" color="bg-indigo-500/20" />
              <LinkCard icon={Users}         label="Following"        description="Artists you follow"            path="/library/following"  color="bg-cyan-500/20" />
              <LinkCard icon={MessageCircle} label="Community"        description="Feed and chat rooms"           path="/community"          color="bg-teal-500/20" />
              <LinkCard icon={Star}          label="Liked Songs"      description="Your saved tracks"             path="/library/likes"      color="bg-pink-500/20" />
            </Section>
          )}

          {/* Artist Tools */}
          {isArtist && (
            <Section title="Artist Tools" icon={Music}>
              <LinkCard icon={Upload}         label="Upload Track"   description="Upload and publish new music"           path="/dashboard?tab=upload"    color="bg-green-500/20" />
              <LinkCard icon={Radio}          label="Collab Radar"   description="Find artists who vibe with your sound"  onClick={() => navigate('/collab-radar')} color="bg-purple-500/20" />
              <LinkCard icon={HeartHandshake} label="Collaborations" description="Manage collab requests and credits"     onClick={() => setActiveTab('collabs')}   color="bg-cyan-500/20" />
              <LinkCard icon={BarChart3}      label="Analytics"      description="Track performance and stream data"      path="/dashboard?tab=analytics" color="bg-indigo-500/20" />
              <LinkCard icon={MessageCircle}  label="Chat Rooms"     description="Community conversations"                path="/chat"                    color="bg-violet-500/20" />
              <button
                onClick={openLiveModal}
                disabled={startingSession}
                className="w-full flex items-center space-x-4 p-4 bg-red-500/10 rounded-xl border border-red-500/20 hover:bg-red-500/15 active:bg-red-500/20 transition text-left group disabled:opacity-50"
              >
                <div className="w-11 h-11 rounded-lg bg-red-500/20 flex items-center justify-center flex-shrink-0">
                  {startingSession
                    ? <Loader className="w-5 h-5 text-red-400 animate-spin" />
                    : <Radio className="w-5 h-5 text-red-400" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-white">Go Live</p>
                  <p className="text-[11px] text-white/30 mt-0.5">Stream music or plug in a YouTube live for your followers</p>
                </div>
                <div className="flex items-center space-x-1.5 flex-shrink-0">
                  <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                  <span className="text-xs font-semibold text-red-400">LIVE</span>
                </div>
              </button>
            </Section>
          )}

          {/* Account */}
          <Section title="Account" icon={User}>
            <LinkCard icon={Palette}    label="Profile & Appearance" description="Edit bio, socials, and theme"   path="/profile"      color="bg-pink-500/20" />
            <LinkCard icon={Bell}       label="Notifications"         description="Collabs, followers, milestones" path="/notifications" color="bg-orange-500/20" />
            {isArtist && (
              <LinkCard icon={DollarSign} label="Payments" description="PayPal settings and earnings" path="/profile" color="bg-emerald-500/20" />
            )}
            <LinkCard icon={Info}  label="About"           description="App info and credits"          path="/about"           color="bg-white/[0.06]" />
            <LinkCard icon={Lock}  label="Privacy Policy"  description="How we handle your data"       path="/privacy-policy"  color="bg-white/[0.06]" />
            <LinkCard icon={Globe} label="Terms of Use"    description="Platform rules and guidelines"  path="/terms-of-use"    color="bg-white/[0.06]" />
          </Section>

          {/* Sign out */}
          <button
            onClick={async () => { await signOut(); navigate('/'); }}
            className="w-full flex items-center justify-center space-x-2 py-3 rounded-xl bg-red-500/10 text-red-400 text-sm font-medium hover:bg-red-500/15 transition mt-2"
          >
            <LogOut className="w-4 h-4" />
            <span>Sign Out</span>
          </button>
        </>
      )}

      {/* ── Admin DM modal ───────────────────────────────────────────────────── */}
      {showDMModal && isAdmin && (
        <div className="fixed inset-0 z-[600] flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm px-4 pb-6 sm:pb-0" onClick={() => setShowDMModal(false)}>
          <div className="w-full max-w-sm bg-[#111] border border-white/10 rounded-2xl p-5 space-y-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <MessageSquare className="w-4 h-4 text-blue-400" />
                <h2 className="text-base font-semibold text-white">Message a User</h2>
              </div>
              <button onClick={() => setShowDMModal(false)} className="w-8 h-8 rounded-full bg-white/[0.06] flex items-center justify-center hover:bg-white/10 transition">
                <X className="w-4 h-4 text-white/60" />
              </button>
            </div>
            {!dmUserId ? (
              <div className="space-y-2">
                <p className="text-xs text-white/30">Search for the user to message:</p>
                <div className="relative">
                  <input value={dmSearch} onChange={e => searchDMUsers(e.target.value)}
                    placeholder="Search by artist name..."
                    className="w-full px-3 py-2.5 bg-white/[0.06] border border-white/[0.08] rounded-xl text-sm text-white placeholder-white/20 focus:outline-none focus:border-blue-500/40" />
                  {dmSearching && <Loader className="absolute right-3 top-3 w-4 h-4 animate-spin text-white/30" />}
                </div>
                {dmResults.length > 0 && (
                  <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl overflow-hidden">
                    {dmResults.map(u => (
                      <button key={u.id} onClick={() => { setDmUserId(u.user_id); setDmUserName(u.artist_name); }}
                        className="w-full flex items-center space-x-3 px-3 py-2.5 hover:bg-white/[0.06] transition text-left border-b border-white/[0.04] last:border-0">
                        <div className="w-8 h-8 rounded-full overflow-hidden bg-white/10 flex-shrink-0 flex items-center justify-center">
                          {u.profile_image_url
                            ? <img src={u.profile_image_url} alt="" className="w-full h-full object-cover" />
                            : <span className="text-xs font-bold text-white/40">{u.artist_name[0]}</span>}
                        </div>
                        <span className="text-sm text-white">{u.artist_name}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center justify-between px-3 py-2 bg-blue-500/10 border border-blue-500/20 rounded-xl">
                  <span className="text-sm text-blue-300 font-medium">To: {dmUserName}</span>
                  <button onClick={() => { setDmUserId(''); setDmUserName(''); }} className="text-white/30 hover:text-white/60 text-xs">change</button>
                </div>
                <textarea value={dmMessage} onChange={e => setDmMessage(e.target.value)}
                  placeholder="Your message to this user..."
                  rows={4} maxLength={500}
                  className="w-full px-3 py-2.5 bg-white/[0.06] border border-white/[0.08] rounded-xl text-sm text-white placeholder-white/20 focus:outline-none focus:border-blue-500/40 resize-none" />
                <button onClick={sendAdminDM} disabled={!dmMessage.trim() || dmSending || dmSent}
                  className="w-full flex items-center justify-center space-x-2 py-3 bg-blue-600 disabled:opacity-40 hover:bg-blue-500 rounded-xl text-sm font-semibold text-white transition">
                  {dmSent ? <Check className="w-4 h-4" /> : dmSending ? <Loader className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  <span>{dmSent ? 'Sent!' : 'Send Message'}</span>
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Go Live setup modal ───────────────────────────────────────────── */}
      {showLiveModal && (
        <div className="fixed inset-0 z-[600] flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm px-4 pb-[calc(1.5rem+env(safe-area-inset-bottom,0px))] sm:pb-0">
          <div className="w-full max-w-sm bg-[#111] border border-white/10 rounded-2xl p-5 space-y-5 overflow-y-auto max-h-[85vh]">
            {/* Header */}
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                <h2 className="text-base font-semibold text-white">Set Up Live Session</h2>
              </div>
              <button onClick={() => setShowLiveModal(false)} className="w-8 h-8 rounded-full bg-white/[0.06] flex items-center justify-center hover:bg-white/10 transition">
                <X className="w-4 h-4 text-white/60" />
              </button>
            </div>

            {/* Session title */}
            <div className="space-y-1.5">
              <label className="text-xs text-white/40 font-medium uppercase tracking-wider">Session Title</label>
              <input
                value={liveTitle}
                onChange={e => setLiveTitle(e.target.value)}
                placeholder="Give your session a name..."
                maxLength={80}
                className="w-full px-3 py-2.5 bg-white/[0.06] border border-white/[0.08] rounded-xl text-sm text-white placeholder-white/25 focus:outline-none focus:border-white/20"
              />
            </div>

            {/* Mode toggle */}
            <div className="space-y-1.5">
              <label className="text-xs text-white/40 font-medium uppercase tracking-wider">Stream Type</label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => setLiveMode('audio')}
                  className={`flex items-center justify-center space-x-2 py-3 rounded-xl border text-sm font-medium transition ${liveMode === 'audio' ? 'bg-white/15 border-white/20 text-white' : 'bg-white/[0.04] border-white/[0.06] text-white/40 hover:bg-white/[0.08]'}`}
                >
                  <Music className="w-4 h-4" />
                  <span>Audio Queue</span>
                </button>
                <button
                  onClick={() => setLiveMode('youtube')}
                  className={`flex items-center justify-center space-x-2 py-3 rounded-xl border text-sm font-medium transition ${liveMode === 'youtube' ? 'bg-red-500/20 border-red-500/30 text-red-400' : 'bg-white/[0.04] border-white/[0.06] text-white/40 hover:bg-white/[0.08]'}`}
                >
                  <Youtube className="w-4 h-4" />
                  <span>YouTube Live</span>
                </button>
              </div>
              <p className="text-[11px] text-white/25 pt-0.5">
                {liveMode === 'audio'
                  ? 'Queue tracks from your library — listeners hear everything in sync.'
                  : 'Optionally paste a YouTube live URL now, or add it once inside the session.'}
              </p>
            </div>

            {/* Audio queue builder */}
            {liveMode === 'audio' && (
              <div className="space-y-2">
                <label className="text-xs text-white/40 font-medium uppercase tracking-wider">Queue Tracks (optional)</label>

                {/* Search input */}
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/30" />
                  <input
                    value={trackSearch}
                    onChange={e => setTrackSearch(e.target.value)}
                    placeholder="Search your tracks..."
                    className="w-full pl-9 pr-3 py-2.5 bg-white/[0.06] border border-white/[0.08] rounded-xl text-sm text-white placeholder-white/25 focus:outline-none focus:border-white/20"
                  />
                  {searchingTracks && (
                    <Loader className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 animate-spin text-white/30" />
                  )}
                </div>

                {/* Search results */}
                {trackResults.length > 0 && (
                  <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl overflow-hidden">
                    {trackResults.map(track => (
                      <button
                        key={track.id}
                        onClick={() => addToQueue(track)}
                        className="w-full flex items-center space-x-3 px-3 py-2.5 hover:bg-white/[0.06] transition text-left border-b border-white/[0.04] last:border-0"
                      >
                        <div className="w-8 h-8 rounded-lg bg-white/[0.06] flex-shrink-0 overflow-hidden">
                          {track.cover_artwork_url
                            ? <img src={track.cover_artwork_url} alt="" className="w-full h-full object-cover" />
                            : <Music className="w-3.5 h-3.5 text-white/20 m-auto mt-2" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-white truncate">{track.title}</p>
                          {track.duration && <p className="text-[10px] text-white/30">{fmtDuration(track.duration)}</p>}
                        </div>
                        <Plus className="w-4 h-4 text-white/40 flex-shrink-0" />
                      </button>
                    ))}
                  </div>
                )}

                {/* Queued tracks */}
                {queueTracks.length > 0 && (
                  <div className="space-y-1">
                    {queueTracks.map((track, i) => (
                      <div key={track.id} className="flex items-center space-x-2.5 px-2 py-2 rounded-xl bg-white/[0.04] border border-white/[0.06]">
                        <span className="text-[10px] text-white/20 w-4 text-center flex-shrink-0">{i + 1}</span>
                        <div className="w-7 h-7 rounded-md bg-white/[0.06] flex-shrink-0 overflow-hidden">
                          {track.cover_artwork_url
                            ? <img src={track.cover_artwork_url} alt="" className="w-full h-full object-cover" />
                            : <Music className="w-3 h-3 text-white/20 m-auto mt-2" />}
                        </div>
                        <p className="text-xs text-white flex-1 truncate">{track.title}</p>
                        {track.duration && <p className="text-[10px] text-white/30 flex-shrink-0">{fmtDuration(track.duration)}</p>}
                        <button onClick={() => removeFromQueue(track.id)} className="p-1 rounded-lg hover:bg-white/[0.08] transition flex-shrink-0">
                          <X className="w-3.5 h-3.5 text-white/30 hover:text-red-400" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {queueTracks.length === 0 && trackSearch.trim().length < 2 && (
                  <p className="text-[10px] text-white/20 text-center py-1">Search above to add tracks, or add them once you're live.</p>
                )}
              </div>
            )}

            {/* YouTube URL input (optional, shown when YouTube mode) */}
            {liveMode === 'youtube' && (
              <div className="space-y-1.5">
                <label className="text-xs text-white/40 font-medium uppercase tracking-wider">YouTube Live URL (optional)</label>
                <input
                  value={liveYoutubeUrl}
                  onChange={e => setLiveYoutubeUrl(e.target.value)}
                  placeholder="https://youtube.com/live/..."
                  className="w-full px-3 py-2.5 bg-white/[0.06] border border-white/[0.08] rounded-xl text-sm text-white placeholder-white/25 focus:outline-none focus:border-red-500/40"
                />
              </div>
            )}

            {/* Schedule toggle */}
            <div className="space-y-2">
              <button
                onClick={() => setScheduleMode(v => !v)}
                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl border text-sm transition ${scheduleMode ? 'bg-purple-500/15 border-purple-500/30 text-purple-300' : 'bg-white/[0.04] border-white/[0.06] text-white/40 hover:bg-white/[0.07]'}`}
              >
                <span>📅 Schedule for later</span>
                <span className="text-xs">{scheduleMode ? 'On' : 'Off'}</span>
              </button>
              {scheduleMode && (
                <input
                  type="datetime-local"
                  value={scheduledAt}
                  onChange={e => setScheduledAt(e.target.value)}
                  min={new Date().toISOString().slice(0,16)}
                  className="w-full px-3 py-2.5 bg-white/[0.06] border border-white/[0.08] rounded-xl text-sm text-white focus:outline-none focus:border-purple-500/40"
                />
              )}
            </div>

            {/* Go Live / Schedule button */}
            <button
              onClick={startLiveSession}
              disabled={startingSession || !liveTitle.trim() || (scheduleMode && !scheduledAt)}
              className={`w-full py-3 rounded-xl disabled:opacity-40 transition text-white font-semibold text-sm flex items-center justify-center space-x-2 ${scheduleMode ? 'bg-purple-500 hover:bg-purple-400' : 'bg-red-500 hover:bg-red-400'}`}
            >
              {startingSession
                ? <><Loader className="w-4 h-4 animate-spin" /><span>{scheduleMode ? 'Scheduling…' : 'Starting…'}</span></>
                : scheduleMode
                  ? <><span>📅</span><span>Schedule Stream</span></>
                  : <><Radio className="w-4 h-4" /><span>Go Live</span></>}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}