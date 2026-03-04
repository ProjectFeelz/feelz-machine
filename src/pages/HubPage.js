import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import {
  Shield, Users, BarChart3, AlertTriangle, Music, Upload,
  HeartHandshake, Bell, Palette, MessageCircle, ChevronRight,
  Crown, Mic2, LayoutDashboard, User
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
    <div className="mb-8">
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
  const { user, artist, isAdmin, isArtist } = useAuth();

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
    <div className="pt-14 pb-32 px-4 max-w-2xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center space-x-3 mb-1">
          <LayoutDashboard className="w-6 h-6 text-white/60" />
          <h1 className="text-2xl font-bold text-white">Hub</h1>
        </div>
        <p className="text-sm text-white/40 ml-9">Your control center</p><p className="text-xs text-red-400 ml-9 mt-1">DEBUG: user={user ? 'yes' : 'no'} artist={artist ? 'yes' : 'no'} isAdmin={isAdmin ? 'yes' : 'no'} isArtist={isArtist ? 'yes' : 'no'}</p>
      </div>

      {/* Admin Section */}
      {isAdmin && (
        <Section title="Admin" icon={Shield}>
          <LinkCard
            icon={Users}
            label="User Management"
            description="Manage artists, roles, and permissions"
            path="/admin"
            color="bg-yellow-500/20"
          />
          <LinkCard
            icon={Mic2}
            label="All Artists Overview"
            description="Browse and manage all artist dashboards"
            path="/admin/artists"
            color="bg-purple-500/20"
          />
          <LinkCard
            icon={BarChart3}
            label="Platform Analytics"
            description="Streams, signups, engagement metrics"
            path="/admin/analytics"
            color="bg-blue-500/20"
          />
          <LinkCard
            icon={AlertTriangle}
            label="Content Moderation"
            description="Flagged tracks, reports, and reviews"
            path="/admin/moderation"
            color="bg-red-500/20"
          />
        </Section>
      )}

      {/* Artist Section */}
      {isArtist && (
        <Section title="Artist Tools" icon={Music}>
          <LinkCard
            icon={Upload}
            label="Upload Track"
            description="Upload and publish new music"
            path="/dashboard"
            color="bg-green-500/20"
          />
          <LinkCard
            icon={HeartHandshake}
            label="Collaborations"
            description="Manage collab requests and credits"
            path="/dashboard"
            color="bg-cyan-500/20"
          />
          <LinkCard
            icon={BarChart3}
            label="My Analytics"
            description="Track performance and stream data"
            path="/dashboard"
            color="bg-indigo-500/20"
          />
          <LinkCard
            icon={Palette}
            label="Profile & Theme"
            description="Edit bio, socials, and appearance"
            path="/profile"
            color="bg-pink-500/20"
          />
          <LinkCard
            icon={Bell}
            label="Notifications"
            description="Collabs, followers, milestones"
            path="/notifications"
            color="bg-orange-500/20"
          />
          <LinkCard
            icon={MessageCircle}
            label="Chat Rooms"
            description="Community conversations"
            path="/community"
            color="bg-violet-500/20"
          />
        </Section>
      )}

      {/* General - always visible for logged in users */}
      <Section title="Account" icon={User}>
        <LinkCard
          icon={User}
          label="Profile Settings"
          description="Name, email, social links"
          path="/profile"
          color="bg-white/[0.08]"
        />
        <LinkCard
          icon={Bell}
          label="Notifications"
          description="View all notifications"
          path="/notifications"
          color="bg-white/[0.08]"
        />
      </Section>

      {/* Tier badge */}
      {artist && (
        <div className="mt-4 flex items-center justify-center space-x-2 py-3 px-4 bg-white/[0.02] rounded-xl border border-white/[0.04]">
          <Crown className="w-4 h-4 text-yellow-400/60" />
          <span className="text-xs text-white/30">
            {artist.tier === 'premium' ? 'Premium' : artist.tier === 'pro' ? 'Pro' : 'Free'} Plan
          </span>
        </div>
      )}
    </div>
  );
}
