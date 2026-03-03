import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Lock, Zap, Crown, ChevronRight } from 'lucide-react';
import { useTier, FEATURE_LABELS } from '../contexts/useTier';

/**
 * TierGate - Wraps content that requires a specific tier.
 * 
 * Usage:
 *   <TierGate feature="lyrics">
 *     <LyricsEditor />
 *   </TierGate>
 * 
 *   <TierGate feature="analytics" inline>
 *     <AnalyticsDashboard />
 *   </TierGate>
 * 
 * Props:
 *   feature  - key from FEATURE_LABELS (e.g. 'lyrics', 'custom_theme', 'chat_rooms')
 *   children - content to show when unlocked
 *   inline   - if true, shows a compact inline lock instead of full card
 *   fallback - optional custom locked state component
 */
export default function TierGate({ feature, children, inline = false, fallback }) {
  const navigate = useNavigate();
  const { hasFeature, getFeatureInfo, tierSlug } = useTier();

  const unlocked = hasFeature(feature);

  if (unlocked) return <>{children}</>;

  // Custom fallback
  if (fallback) return <>{fallback}</>;

  const info = getFeatureInfo(feature);
  const minTier = info.minTier || 'pro';
  const isProFeature = minTier === 'pro';
  const color = isProFeature ? '#8B5CF6' : '#F59E0B';
  const Icon = isProFeature ? Zap : Crown;
  const tierName = isProFeature ? 'Pro' : 'Premium';

  // Inline compact lock
  if (inline) {
    return (
      <button
        onClick={() => navigate('/upgrade')}
        className="flex items-center space-x-2 px-3 py-2 rounded-lg transition hover:bg-white/[0.04]"
        style={{ backgroundColor: `${color}08` }}
      >
        <Lock className="w-3.5 h-3.5 flex-shrink-0" style={{ color }} />
        <span className="text-xs font-medium" style={{ color }}>
          {info.name} — {tierName} feature
        </span>
        <ChevronRight className="w-3 h-3 flex-shrink-0" style={{ color, opacity: 0.5 }} />
      </button>
    );
  }

  // Full card lock
  return (
    <div className="rounded-xl border overflow-hidden" style={{ borderColor: `${color}20` }}>
      <div className="p-5 text-center">
        {/* Lock icon */}
        <div className="w-12 h-12 rounded-2xl mx-auto mb-3 flex items-center justify-center"
          style={{ backgroundColor: `${color}15` }}>
          <Icon className="w-6 h-6" style={{ color }} />
        </div>

        {/* Feature name */}
        <h3 className="text-base font-bold text-white mb-1">{info.name}</h3>
        <p className="text-sm text-white/40 mb-4 max-w-xs mx-auto">{info.description}</p>

        {/* Tier badge */}
        <div className="inline-flex items-center space-x-1.5 px-3 py-1 rounded-full mb-4"
          style={{ backgroundColor: `${color}10` }}>
          <Icon className="w-3.5 h-3.5" style={{ color }} />
          <span className="text-xs font-semibold" style={{ color }}>
            Requires {tierName} plan
          </span>
        </div>

        {/* Upgrade button */}
        <button
          onClick={() => navigate('/upgrade')}
          className="w-full py-2.5 rounded-lg font-semibold text-sm transition active:scale-[0.98] text-black"
          style={{ backgroundColor: color }}
        >
          Upgrade to {tierName}
        </button>

        {/* Current tier note */}
        <p className="text-[10px] text-white/20 mt-3">
          You're on the <span className="capitalize font-medium text-white/30">{tierSlug}</span> plan
        </p>
      </div>
    </div>
  );
}

/**
 * UploadGate - Special gate for upload limits
 * Shows remaining uploads for free tier
 */
export function UploadGate({ children }) {
  const navigate = useNavigate();
  const { canUpload, uploadsRemaining, isFree, trackCount } = useTier();

  if (canUpload()) {
    return (
      <>
        {isFree && (
          <div className="mb-3 px-3 py-2 rounded-lg bg-yellow-500/10 border border-yellow-500/15">
            <p className="text-xs text-yellow-400">
              Free plan: <span className="font-semibold">{uploadsRemaining()}</span> upload{uploadsRemaining() !== 1 ? 's' : ''} remaining
              <button onClick={() => navigate('/upgrade')} className="ml-2 underline text-yellow-300 hover:text-yellow-200">
                Go unlimited
              </button>
            </p>
          </div>
        )}
        {children}
      </>
    );
  }

  return (
    <div className="rounded-xl border border-yellow-500/20 p-5 text-center">
      <div className="w-12 h-12 rounded-2xl mx-auto mb-3 bg-yellow-500/15 flex items-center justify-center">
        <Lock className="w-6 h-6 text-yellow-400" />
      </div>
      <h3 className="text-base font-bold text-white mb-1">Upload Limit Reached</h3>
      <p className="text-sm text-white/40 mb-1">
        Free plan allows up to 2 singles ({trackCount} uploaded)
      </p>
      <p className="text-xs text-white/25 mb-4">Upgrade to Pro for unlimited uploads</p>
      <button
        onClick={() => navigate('/upgrade')}
        className="w-full py-2.5 rounded-lg font-semibold text-sm bg-yellow-500 text-black transition active:scale-[0.98]"
      >
        Upgrade to Pro
      </button>
    </div>
  );
}

/**
 * TierBadge - Small badge showing current tier
 */
export function TierBadge({ size = 'sm' }) {
  const { tierSlug } = useTier();

  const config = {
    free: { label: 'Free', color: '#737373', icon: null },
    pro: { label: 'Pro', color: '#8B5CF6', icon: Zap },
    premium: { label: 'Premium', color: '#F59E0B', icon: Crown },
  };

  const c = config[tierSlug] || config.free;
  const Icon = c.icon;

  if (size === 'xs') {
    return (
      <span className="inline-flex items-center space-x-1 px-1.5 py-0.5 rounded text-[9px] font-bold"
        style={{ backgroundColor: `${c.color}15`, color: c.color }}>
        {Icon && <Icon className="w-2.5 h-2.5" />}
        <span>{c.label}</span>
      </span>
    );
  }

  return (
    <span className="inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-full text-xs font-semibold"
      style={{ backgroundColor: `${c.color}15`, color: c.color }}>
      {Icon && <Icon className="w-3.5 h-3.5" />}
      <span>{c.label}</span>
    </span>
  );
}
