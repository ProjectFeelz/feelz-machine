import { Helmet } from 'react-helmet-async';
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useStreakContext } from '../contexts/StreakContext';
import { useTier } from '../contexts/useTier';
import { supabase } from '../supabaseClient';
import CollabThread from '../components/CollabThread';
import ProfileCompletionBanner from '../components/ProfileCompletionBanner';
import RoleConfirmationPrompt from '../components/RoleConfirmationPrompt';
import {
  Shield, Users, BarChart3, Music, Flame,
  Upload, HeartHandshake, Bell, Palette, MessageCircle,
  ChevronRight, Crown, Zap, Star, LayoutDashboard,
  User, LogOut, DollarSign, Radio, Mic2,
  Loader, X, Youtube, Info, Search,
  Plus, MessageSquare, Check, Send, Store, Trophy, Sparkles, EyeOff,
} from 'lucide-react';

function LinkCard({ icon: Icon, label, description, path, color, onClick }) {
  const navigate = useNavigate();
  return (
    <button
      onClick={() => onClick ? onClick() : navigate(path)}
      className="w-full flex items-center space-x-4 p-4 bg-white/[0.05] rounded-xl border border-white/[0.10] hover:bg-white/[0.08] active:bg-white/[0.10] transition text-left group"
    >
      <div className={`w-11 h-11 rounded-lg ${color} flex items-center justify-center flex-shrink-0`}>
        <Icon className="w-5 h-5 text-white" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-white">{label}</p>
        {description && <p className="text-xs text-white/50 mt-0.5">{description}</p>}
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
      <div className="space-y-2 md:grid md:grid-cols-2 md:gap-2 md:space-y-0">{children}</div>
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
  const { tierSlug, tierLoading, isPremium } = useTier();
  const { streak } = useStreakContext();
  const [activeTab, setActiveTab] = useState('home');
  const [isRetailVenue, setIsRetailVenue] = useState(false);
  const [isNewsletterEditor, setIsNewsletterEditor] = useState(false);
  const [isSchoolSessionsJudge, setIsSchoolSessionsJudge] = useState(false);

  useEffect(() => {
    if (!user) return;
    supabase.from('school_sessions_judges').select('id').eq('user_id', user.id).limit(1)
      .then(({ data }) => setIsSchoolSessionsJudge((data || []).length > 0));
  }, [user]);

  useEffect(() => {
    if (!user) return;
    supabase.from('newsletter_editors').select('id').eq('user_id', user.id).maybeSingle()
      .then(({ data }) => setIsNewsletterEditor(!!data));
  }, [user]);

  useEffect(() => {
    if (!user) return;
    supabase.from('retail_venues').select('id').eq('user_id', user.id).maybeSingle()
      .then(({ data }) => setIsRetailVenue(!!data));
  }, [user]);

  const [showDMModal, setShowDMModal]           = useState(false);
  const [dmUserId, setDmUserId]                 = useState('');
  const [dmArtistId, setDmArtistId]             = useState('');
  const [dmUserName, setDmUserName]             = useState('');
  const [dmMessage, setDmMessage]               = useState('');
  const [dmSending, setDmSending]               = useState(false);
  const [dmSent, setDmSent]                     = useState(false);
  const [dmSearch, setDmSearch]                 = useState('');
  const [dmResults, setDmResults]               = useState([]);
  const [dmSearching, setDmSearching]           = useState(false);
  const fmtDuration = (s) => {
    if (!s) return '';
    const m = Math.floor(s / 60);
    return `${m}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
  };

  const searchDMUsers = async (q) => {
    setDmSearch(q);
    if (q.length < 2) { setDmResults([]); return; }
    setDmSearching(true);
    const { data } = await supabase.from('artists')
      .select('id, user_id, artist_name, profile_image_url')
      .ilike('artist_name', `%${q}%`).limit(8);
    setDmResults(data || []);
    setDmSearching(false);
  };

  const sendAdminDM = async () => {
    if (!dmUserId || !dmMessage.trim() || dmSending) return;
    setDmSending(true);
    try {
      await supabase.from('notifications').insert({
        user_id:   dmUserId,
        artist_id: dmArtistId || null,
        type:      'admin_message',
        title:     'Message from Feelz Machine',
        message:   dmMessage.trim(),
        metadata:  { from_admin: true },
      });
      setDmSent(true);
      setTimeout(() => {
        setDmSent(false); setShowDMModal(false);
        setDmMessage(''); setDmUserId(''); setDmArtistId(''); setDmUserName(''); setDmSearch(''); setDmResults([]);
      }, 2000);
    } catch (err) { console.error('Admin DM error:', err); }
    setDmSending(false);
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
        <link rel="icon" href="/favicon.ico" />
        <link rel="apple-touch-icon" href="/logo192.png" />
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
          {isArtist && <RoleConfirmationPrompt />}
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
            <>
            <Section title="Platform Admin" icon={Shield}>
              <LinkCard icon={Shield} label="Admin Panel" description="Broadcast · Analytics · Moderation · Users" path="/admin" color="bg-yellow-500/20" />
              <LinkCard icon={Sparkles} label="Home Hero" description="Control the big slot at the top of Home" path="/admin/home-hero" color="bg-yellow-500/20" />
              <LinkCard icon={Star} label="Cold Start Picks" description="What a brand new listener hears first" path="/admin/cold-start" color="bg-yellow-500/20" />
              <LinkCard icon={Send} label="Newsletter" description="Compose updates for the app or retail venues" path="/newsletter/compose" color="bg-yellow-500/20" />
            </Section>

            <Section title="Retail Admin" icon={Store}>
              <LinkCard icon={Store} label="Retail Admin" description="Standalone panel · playlists · venues · ads" path="/retail-admin" color="bg-purple-500/20" />
              <LinkCard icon={Store} label="Venue Invites" description="Add a venue and copy its signup link" path="/retail-admin?sub=venues" color="bg-purple-500/20" />
              <LinkCard icon={Radio} label="Retail Player" description="The venue-facing player, admin preview" path="/retail/player" color="bg-purple-500/20" />
              <LinkCard icon={Users} label="Retail Staff" description="Who can manage catalogue, venues and ads" path="/admin/retail-staff" color="bg-purple-500/20" />
            </Section>

            <Section title="School Sessions" icon={Trophy}>
              <LinkCard icon={Trophy} label="Public Page Preview" description="See it even while it's switched off" path="/schoolsessions" color="bg-lime-500/20" />
              <LinkCard icon={Trophy} label="Judge Panel" description="Mark finalists and pick the winner" path="/schoolsessions/judge" color="bg-lime-500/20" />
            </Section>
            </>
          )}

          {/* Newsletter editor — non-admin */}
          {!isAdmin && isNewsletterEditor && (
            <Section title="Newsletter" icon={Send}>
              <LinkCard icon={Send} label="Compose" description="Write an update for the app or retail venues" path="/newsletter/compose" color="bg-purple-500/20" />
            </Section>
          )}

          {/* School Sessions judge — non-admin. Admins already get this in
              the Admin section above, so this would otherwise double up. */}
          {!isAdmin && isSchoolSessionsJudge && (
            <Section title="School Sessions" icon={Trophy}>
              <LinkCard icon={Trophy} label="Judge Panel" description="Mark finalists and pick the winner" path="/schoolsessions/judge" color="bg-lime-500/20" />
            </Section>
          )}

          {/* Retail venue. Admins get the player under Retail Admin above, so
              this is gated to non-admins to avoid the same link twice. A real
              venue owner is not an admin and still needs this. */}
          {isRetailVenue && !isAdmin && (
            <Section title="Feelz Retail" icon={Store}>
              <LinkCard icon={Store} label="Retail Player" description="Pick a mood, play music for your venue" path="/retail/player" color="bg-purple-500/20" />
            </Section>
          )}

          {/* Listener */}
          {!isArtist && (
            <Section title="Discover" icon={Music}>
              <LinkCard icon={Music}         label="Browse Music"     description="Find new tracks and artists"   path="/browse"             color="bg-purple-500/20" />
              <LinkCard icon={Mic2}          label="Discover Artists" description="Find and follow new artists"   path="/browse?tab=artists" color="bg-indigo-500/20" />
              <LinkCard icon={Users}         label="Following"        description="Artists you follow"            path="/library/following"  color="bg-cyan-500/20" />
              <LinkCard icon={MessageCircle} label="Community"        description="Feed, posts and artist updates"           path="/community"          color="bg-teal-500/20" />
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
            </Section>
          )}

          {/* Account — Privacy Policy and Terms moved to About page */}
          <Section title="Account" icon={User}>
            <LinkCard icon={Palette}    label="Profile & Appearance" description="Edit bio, socials, and theme"   path="/profile"      color="bg-pink-500/20" />
            <LinkCard icon={Bell}       label="Notifications"         description="Collabs, followers, milestones" path="/notifications" color="bg-orange-500/20" />
            {isArtist && (
              <LinkCard icon={DollarSign} label="Payments" description="PayPal settings and earnings" path="/profile" color="bg-emerald-500/20" />
            )}
            <LinkCard icon={EyeOff} label="Hidden" description="Artists and tracks you took out of your feed" path="/hidden" color="bg-white/[0.06]" />
            <LinkCard icon={Info} label="About" description="App info, plans, privacy and terms" path="/about" color="bg-white/[0.06]" />
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
        <div className="fixed inset-0 z-[600] flex items-center justify-center px-6 bg-black/80 backdrop-blur-sm" onClick={() => setShowDMModal(false)}>
          <div className="w-full overflow-hidden rounded-3xl p-5 space-y-4" style={{ maxWidth: 360, backgroundColor: '#0f0f0f', border: '1px solid rgba(255,255,255,0.08)', boxShadow: '0 32px 64px rgba(0,0,0,0.6)' }} onClick={e => e.stopPropagation()}>
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
                      <button key={u.id} onClick={() => { setDmUserId(u.user_id); setDmUserName(u.artist_name); setDmArtistId(u.id); }}
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
                  <button onClick={() => { setDmUserId(''); setDmArtistId(''); setDmUserName(''); }} className="text-white/30 hover:text-white/60 text-xs">change</button>
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

    </div>
  );
}