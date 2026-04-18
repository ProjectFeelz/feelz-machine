import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Music, Clock, Users, TrendingUp, ChevronRight, Star } from 'lucide-react';

function StatPill({ icon: Icon, value, label, color }) {
  return (
    <div className="flex flex-col items-center justify-center p-3 rounded-2xl bg-white/[0.04] border border-white/[0.06] flex-1 min-w-0">
      <Icon className={`w-4 h-4 mb-1.5 ${color}`} />
      <span className="text-base font-bold text-white leading-none">{value}</span>
      <span className="text-[10px] text-white/35 mt-1 text-center leading-tight">{label}</span>
    </div>
  );
}

export default function WrappedCard({ notification, compact = false }) {
  const navigate = useNavigate();
  const [expanded, setExpanded] = useState(!compact);

  if (!notification) return null;

  const meta = notification.metadata || {};
  const {
    monthLabel,
    totalStreams,
    totalMinutes,
    uniqueArtists,
    topArtists = [],
    topTracks = [],
    isTopSupporter,
    rankPercentile,
  } = meta;

  const gradientStyle = {
    background: 'linear-gradient(135deg, rgba(236,72,153,0.12) 0%, rgba(168,85,247,0.10) 50%, rgba(59,130,246,0.08) 100%)',
  };

  if (compact) {
    return (
      <button
        onClick={() => setExpanded(e => !e)}
        className="w-full text-left"
      >
        <div
          className="rounded-2xl border border-pink-500/20 p-4 mb-1"
          style={gradientStyle}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xl flex-shrink-0"
                style={{ background: 'rgba(236,72,153,0.15)' }}>
                🎁
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-white truncate">{notification.title}</p>
                <p className="text-xs text-white/40 truncate mt-0.5">{notification.message}</p>
              </div>
            </div>
            <ChevronRight className={`w-4 h-4 text-white/30 flex-shrink-0 transition-transform ${expanded ? 'rotate-90' : ''}`} />
          </div>

          {expanded && (
            <div className="mt-4 pt-4 border-t border-white/[0.06]">
              <WrappedBody
                totalStreams={totalStreams}
                totalMinutes={totalMinutes}
                uniqueArtists={uniqueArtists}
                topArtists={topArtists}
                topTracks={topTracks}
                isTopSupporter={isTopSupporter}
                rankPercentile={rankPercentile}
                monthLabel={monthLabel}
                navigate={navigate}
              />
            </div>
          )}
        </div>
      </button>
    );
  }

  return (
    <div className="rounded-2xl border border-pink-500/20 p-5" style={gradientStyle}>
      <div className="flex items-center space-x-3 mb-5">
        <div className="w-11 h-11 rounded-xl flex items-center justify-center text-2xl flex-shrink-0"
          style={{ background: 'rgba(236,72,153,0.15)' }}>
          🎁
        </div>
        <div>
          <p className="text-base font-bold text-white">{notification.title}</p>
          {monthLabel && <p className="text-xs text-white/40 mt-0.5">{monthLabel} — your listening recap</p>}
        </div>
      </div>
      <WrappedBody
        totalStreams={totalStreams}
        totalMinutes={totalMinutes}
        uniqueArtists={uniqueArtists}
        topArtists={topArtists}
        topTracks={topTracks}
        isTopSupporter={isTopSupporter}
        rankPercentile={rankPercentile}
        monthLabel={monthLabel}
        navigate={navigate}
      />
    </div>
  );
}

function WrappedBody({ totalStreams, totalMinutes, uniqueArtists, topArtists, topTracks, isTopSupporter, rankPercentile, navigate }) {
  const hours = totalMinutes ? Math.floor(totalMinutes / 60) : 0;
  const mins = totalMinutes ? totalMinutes % 60 : 0;
  const timeLabel = hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;

  return (
    <div className="space-y-4">
      {/* Stats row */}
      <div className="flex space-x-2">
        <StatPill icon={Music}    value={totalStreams || 0}  label="Streams"  color="text-pink-400" />
        <StatPill icon={Clock}    value={timeLabel}          label="Listened" color="text-purple-400" />
        <StatPill icon={Users}    value={uniqueArtists || 0} label="Artists"  color="text-blue-400" />
      </div>

      {/* Top supporter badge */}
      {isTopSupporter && rankPercentile != null && (
        <div className="flex items-center space-x-2.5 p-3 rounded-xl bg-yellow-500/10 border border-yellow-500/20">
          <Star className="w-4 h-4 text-yellow-400 flex-shrink-0" />
          <p className="text-xs text-yellow-300/80 font-medium">
            You're in the top {100 - rankPercentile}% of Feelz Machine supporters this month
          </p>
        </div>
      )}

      {/* Top artists */}
      {topArtists.length > 0 && (
        <div>
          <p className="text-[10px] uppercase tracking-widest text-white/25 font-semibold mb-2">Top Artists</p>
          <div className="space-y-1.5">
            {topArtists.slice(0, 3).map((a, i) => (
              <button
                key={a.id || i}
                onClick={() => a.slug && navigate(`/artist/${a.slug}`)}
                className="w-full flex items-center justify-between py-2 px-3 rounded-xl hover:bg-white/[0.04] transition group"
              >
                <div className="flex items-center space-x-3 min-w-0">
                  <span className="text-xs text-white/20 font-bold w-4 flex-shrink-0">{i + 1}</span>
                  <span className="text-sm text-white truncate font-medium">{a.name}</span>
                </div>
                <span className="text-xs text-white/30 flex-shrink-0 ml-2">{a.plays} plays</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Top track */}
      {topTracks.length > 0 && (
        <div>
          <p className="text-[10px] uppercase tracking-widest text-white/25 font-semibold mb-2">Most Played</p>
          <div className="flex items-center space-x-3 py-2 px-3 rounded-xl bg-white/[0.03] border border-white/[0.04]">
            <TrendingUp className="w-4 h-4 text-pink-400 flex-shrink-0" />
            <div className="min-w-0">
              <p className="text-sm text-white font-medium truncate">{topTracks[0].title}</p>
              <p className="text-xs text-white/35 truncate">{topTracks[0].artist} · {topTracks[0].plays} plays</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}