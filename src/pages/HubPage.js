import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useTier } from '../contexts/useTier';
import {
  Shield, Users, BarChart3, AlertTriangle, Music,
  Upload, HeartHandshake, Bell, Palette, MessageCircle,
  ChevronRight, Crown, Zap, Star, Mic2, LayoutDashboard,
  User, LogOut, DollarSign, Megaphone
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

function Section({ title, icon: Icon, children }) {
  return (
    <div className="mb-6">
      <div className="flex items-center space-x-2 mb-3 px-1">
        <Icon className="w-4 h-4 text-white/30" />
        <h2 className="text-xs uppercase tracking-wider text-white/30 font-semibold">{title}</h2>
      </div>
      <div className="space-y-2">
        {children}
      </div>
    </div>
  );
}

export default function HubPage() {
  const navigate = useNavigate();
  const { user, artist, isAdmin, isArtist, isListener, signOut } = useAuth();
  const { tierSlug } = useTier();

  const tierConfig = {
    premium: { label: 'Premium', color: 'text-yellow-400', bg: 'bg-yellow-500/10', icon: Crown },
    pro: { label: 'Pro', color: 'text-purple-400', bg: 'bg-purple-500/10', icon: Zap },
    free: { label: 'Free', color: 'text-white/30', bg: 'bg-white/[0.04]', icon: Star },
  };
  const tier = tierConfig[tierSlug] || tierConfig.free;
  const TierIcon = tier.icon;

  if (!user) {
    return (
      <div className="min-h-screen bg-black flex flex-col items-center justify-center px-6">
        <User className="w-12 h-12 text-white/10 mb-4" />
        <h2 className="text-lg font-semibold text-white mb-2">Sign in to continue</h2>
        <button onClick={() => navigate('/login')}
          className="px-6 py-2.5 bg-white text-black rounded-lg font-medium text-sm">
          Sign In
        </button>
      </div>
    );
  }

  return (
    <div className="pt-14 md:pt-0 pb-32 px-4 max-w-2xl mx-auto">

      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center space-x-3 mb-1">
          <LayoutDashboard className="w-6 h-6 text-white/60" />
          <h1 className="text-2xl font-bold text-white">Hub</h1>
        </div>
        <p className="text-sm text-white/40 ml-9">Your control center</p>
      </div>

      {/* Tier card — only for artists */}
      {isArtist && (
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

      {/* Admin Section */}
      {isAdmin && (
        <Section title="Admin" icon={Shield}>
          <LinkCard icon={Users} label="User Management" description="Manage artists, roles, and permissions" path="/admin" color="bg-yellow-500/20" />
          <LinkCard icon={Mic2} label="All Artists" description="Browse and manage all artist profiles" path="/admin/artists" color="bg-purple-500/20" />
          <LinkCard icon={BarChart3} label="Platform Analytics" description="Streams, signups, engagement metrics" path="/admin/analytics" color="bg-blue-500/20" />
          <LinkCard icon={AlertTriangle} label="Content Moderation" description="Flagged tracks, reports, and reviews" path="/admin/moderation" color="bg-red-500/20" />
          <LinkCard icon={Megaphone} label="Broadcast & APK" description="Send updates to all users · Manage APK link" path="/admin/broadcast" color="bg-purple-500/20" />
        </Section>
      )}

      {/* Listener Section */}
      {!isArtist && (
        <Section title="Discover" icon={Music}>
          <LinkCard icon={Music} label="Browse Music" description="Find new tracks and artists" path="/browse" color="bg-purple-500/20" />
          <LinkCard icon={Users} label="Following" description="Artists you follow" path="/library/following" color="bg-cyan-500/20" />
          <LinkCard icon={MessageCircle} label="Community" description="Feed and chat rooms" path="/community" color="bg-teal-500/20" />
          <LinkCard icon={Star} label="Liked Songs" description="Your saved tracks" path="/library/likes" color="bg-pink-500/20" />
        </Section>
      )}

      {/* Artist Tools */}
      {isArtist && <Section title="Artist Tools" icon={Music}>
          <LinkCard icon={Upload} label="Upload Track" description="Upload and publish new music" path="/dashboard?tab=upload" color="bg-green-500/20" />
<LinkCard icon={HeartHandshake} label="Collaborations" description="Manage collab requests and credits" path="/dashboard?tab=collabs" color="bg-cyan-500/20" />
<LinkCard icon={BarChart3} label="Analytics" description="Track performance and stream data" path="/dashboard?tab=analytics" color="bg-indigo-500/20" />
          <LinkCard icon={MessageCircle} label="Chat Rooms" description="Community conversations" path="/chat" color="bg-violet-500/20" />
          <LinkCard icon={Users} label="Community Feed" description="Posts, updates and activity" path="/community" color="bg-teal-500/20" />
        </Section>}

      {/* Account */}
      <Section title="Account" icon={User}>
        <LinkCard icon={Palette} label="Profile & Appearance" description="Edit bio, socials, and theme" path="/profile" color="bg-pink-500/20" />
        <LinkCard icon={Bell} label="Notifications" description="Collabs, followers, milestones" path="/notifications" color="bg-orange-500/20" />
        {isArtist && (
          <LinkCard icon={DollarSign} label="Payments" description="PayPal settings and earnings" path="/profile" color="bg-emerald-500/20" />
        )}
      </Section>

      {/* Sign out */}
      <button
        onClick={async () => { await signOut(); navigate('/'); }}
        className="w-full flex items-center justify-center space-x-2 py-3 rounded-xl bg-red-500/10 text-red-400 text-sm font-medium hover:bg-red-500/15 transition mt-2"
      >
        <LogOut className="w-4 h-4" />
        <span>Sign Out</span>
      </button>
    </div>
  );
}



