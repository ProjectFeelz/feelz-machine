import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../supabaseClient';
import { useAuth } from './AuthContext';

// Feature access map per tier
const TIER_ACCESS = {
  free: {
    max_singles: 2,
    max_albums: 0,
    lyrics: false,
    custom_theme: false,
    chat_rooms: 0,
    analytics: false,
    collaborations: false,
    priority_trending: false,
    download_sales: false,
    custom_branding: false,
    advanced_analytics: false,
  },
  pro: {
    max_singles: Infinity,
    max_albums: Infinity,
    lyrics: true,
    custom_theme: true,
    chat_rooms: 1,
    analytics: true,
    collaborations: true,
    priority_trending: false,
    download_sales: false,
    custom_branding: true,
    advanced_analytics: false,
  },
  premium: {
    max_singles: Infinity,
    max_albums: Infinity,
    lyrics: true,
    custom_theme: true,
    chat_rooms: Infinity,
    analytics: true,
    collaborations: true,
    priority_trending: true,
    download_sales: true,
    custom_branding: true,
    advanced_analytics: true,
  },
};

// Human-readable feature names for upgrade prompts
const FEATURE_LABELS = {
  lyrics: { name: 'Lyrics', description: 'Add lyrics to your tracks', minTier: 'pro' },
  custom_theme: { name: 'Custom Theme', description: 'Customize your artist profile page', minTier: 'pro' },
  chat_rooms: { name: 'Chat Rooms', description: 'Create chat rooms for your fans', minTier: 'pro' },
  analytics: { name: 'Analytics', description: 'View detailed track and audience analytics', minTier: 'pro' },
  collaborations: { name: 'Collaborations', description: 'Collaborate with other artists and set royalty splits', minTier: 'pro' },
  priority_trending: { name: 'Priority Trending', description: 'Get boosted visibility in browse and trending', minTier: 'premium' },
  download_sales: { name: 'Download Sales', description: 'Sell track downloads directly to fans', minTier: 'premium' },
  custom_branding: { name: 'Custom Branding', description: 'Full branding control on your profile', minTier: 'pro' },
  advanced_analytics: { name: 'Advanced Analytics', description: 'Deep audience insights and export tools', minTier: 'premium' },
  unlimited_uploads: { name: 'Unlimited Uploads', description: 'Upload unlimited tracks and albums', minTier: 'pro' },
};

export function useTier() {
  const { artist } = useAuth();
  const [tierSlug, setTierSlug] = useState('free');
  const [tierData, setTierData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [trackCount, setTrackCount] = useState(0);

  useEffect(() => {
    if (artist) {
      fetchTier();
      fetchTrackCount();
    } else {
      setTierSlug('free');
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [artist?.id]);

  const fetchTier = async () => {
    try {
      const { data: sub } = await supabase
        .from('artist_tier_subscriptions')
        .select('*, platform_tiers(*)')
        .eq('artist_id', artist.id)
        .eq('status', 'active')
        .single();

      if (sub?.platform_tiers) {
        setTierSlug(sub.platform_tiers.slug);
        setTierData(sub.platform_tiers);
      } else {
        setTierSlug('free');
      }
    } catch {
      setTierSlug('free');
    }
    setLoading(false);
  };

  const fetchTrackCount = async () => {
    const { count } = await supabase
      .from('tracks')
      .select('*', { count: 'exact', head: true })
      .eq('artist_id', artist.id);
    setTrackCount(count || 0);
  };

  // Get access rules for current tier
  const access = TIER_ACCESS[tierSlug] || TIER_ACCESS.free;

  // Check if a specific feature is available
  const hasFeature = useCallback((feature) => {
    const rules = TIER_ACCESS[tierSlug] || TIER_ACCESS.free;
    const val = rules[feature];
    if (typeof val === 'boolean') return val;
    if (typeof val === 'number') return val > 0;
    return false;
  }, [tierSlug]);

  // Check if user can upload more tracks
  const canUpload = useCallback(() => {
    if (access.max_singles === Infinity) return true;
    return trackCount < access.max_singles;
  }, [access, trackCount]);

  // Get remaining upload slots
  const uploadsRemaining = useCallback(() => {
    if (access.max_singles === Infinity) return Infinity;
    return Math.max(access.max_singles - trackCount, 0);
  }, [access, trackCount]);

  // Get the minimum tier needed for a feature
  const getMinTier = useCallback((feature) => {
    return FEATURE_LABELS[feature]?.minTier || 'pro';
  }, []);

  // Get feature label info
  const getFeatureInfo = useCallback((feature) => {
    return FEATURE_LABELS[feature] || { name: feature, description: '', minTier: 'pro' };
  }, []);

  // Check tier level (for comparisons)
  const tierLevel = tierSlug === 'premium' ? 3 : tierSlug === 'pro' ? 2 : 1;

  const isPro = tierSlug === 'pro' || tierSlug === 'premium';
  const isPremium = tierSlug === 'premium';
  const isFree = tierSlug === 'free';

  return {
    tierSlug,
    tierData,
    tierLevel,
    access,
    loading,
    trackCount,
    isPro,
    isPremium,
    isFree,
    hasFeature,
    canUpload,
    uploadsRemaining,
    getMinTier,
    getFeatureInfo,
    refreshTier: fetchTier,
  };
}

export { TIER_ACCESS, FEATURE_LABELS };
