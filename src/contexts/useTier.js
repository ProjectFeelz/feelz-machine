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
    chat_rooms: true,
    analytics: false,
    collaborations: false,
    priority_trending: false,
    download_sales: false,
    pre_order: false,
    custom_branding: false,
    advanced_analytics: false,
  },
  pro: {
    max_singles: Infinity,
    max_albums: Infinity,
    lyrics: true,
    custom_theme: true,
    chat_rooms: true,
    analytics: true,
    collaborations: true,
    priority_trending: false,
    download_sales: true,
    download_sales_monthly_limit: 2,   // Pro: 2 paid download tracks per month
    pre_order: false,
    custom_branding: true,
    advanced_analytics: false,
    community_post: true,
    daily_thought: true,
  },

  premium: {
    max_singles: Infinity,
    max_albums: Infinity,
    lyrics: true,
    custom_theme: true,
    chat_rooms: true,
    analytics: true,
    collaborations: true,
    priority_trending: true,
    download_sales: true,
    download_sales_monthly_limit: Infinity, // Premium: unlimited
    pre_order: true,
    custom_branding: true,
    advanced_analytics: true,
    community_post: true,
    daily_thought: true,
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
  download_sales: { name: 'Download Sales', description: 'Sell track downloads directly to fans (Pro: 2/month, Premium: unlimited)', minTier: 'pro' },
  custom_branding: { name: 'Custom Branding', description: 'Full branding control on your profile', minTier: 'pro' },
  advanced_analytics: { name: 'Advanced Analytics', description: 'Deep audience insights and export tools', minTier: 'premium' },
  community_post: { name: 'Community Posts', description: 'Share updates and music with your fans', minTier: 'pro' },
  unlimited_uploads: { name: 'Unlimited Uploads', description: 'Upload unlimited tracks and albums', minTier: 'pro' },
  daily_thought: { name: 'Daily Thought', description: 'Post a daily message on your artist profile', minTier: 'pro' },
  pre_order: { name: 'Pre-order Releases', description: 'Let fans pre-save upcoming releases before they drop', minTier: 'premium' },
}

export function useTier() {
  const { artist, isAdmin } = useAuth();
  const [tierSlug, setTierSlug] = useState('free');
  const [tierData, setTierData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [trackCount, setTrackCount] = useState(0);
  const [monthlyDownloadSalesCount, setMonthlyDownloadSalesCount] = useState(0);

  useEffect(() => {
    if (isAdmin) {
      setTierSlug('premium');
      setLoading(false);
      return;
    }
    if (artist) {
      fetchTier(artist.id);
      fetchTrackCount(artist.id);
      fetchMonthlyDownloadSalesCount(artist.id);
    } else {
      setTierSlug('free');
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [artist?.id, isAdmin]);

  // Re-check tier when user returns from Safari (iOS PayPal hop)
  useEffect(() => {
    if (!artist?.id || isAdmin) return;
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        fetchTier(artist.id);
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [artist?.id, isAdmin]);

  const fetchTier = async (artistId) => {
    if (!artistId) return;
    try {
      const { data: sub, error: subErr } = await supabase
        .from('artist_tier_subscriptions')
        .select('tier_id, status')
        .eq('artist_id', artistId)
        .eq('status', 'active')
        .maybeSingle();

      if (sub?.tier_id) {
        // Step 2: get tier slug separately
        const { data: tierRow } = await supabase
          .from('platform_tiers')
          .select('*')
          .eq('id', sub.tier_id)
          .maybeSingle();
        if (tierRow) {
          setTierSlug(['master','premium'].includes(tierRow.slug) ? 'premium' : tierRow.slug === 'pro' ? 'pro' : 'free');
          setTierData(tierRow);
          setLoading(false);
          return;
        }
      }

      // Fallback: use artists.tier column directly
      const { data: artistRow } = await supabase
        .from('artists')
        .select('tier')
        .eq('id', artistId)
        .maybeSingle();
      const fallback = artistRow?.tier || 'free';
      setTierSlug(['master','premium'].includes(fallback) ? 'premium' : fallback === 'pro' ? 'pro' : 'free');
    } catch {
      const fallback = artist?.tier || 'free';
      setTierSlug(['master','premium'].includes(fallback) ? 'premium' : fallback === 'pro' ? 'pro' : 'free');
    }
    setLoading(false);
  };

  const fetchTrackCount = async (artistId) => {
    if (!artistId) return;
    const { count } = await supabase
      .from('tracks')
      .select('*', { count: 'exact', head: true })
      .eq('artist_id', artistId);
    setTrackCount(count || 0);
  };

  const fetchMonthlyDownloadSalesCount = async (artistId) => {
    if (!artistId) return;
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);
    const { count } = await supabase
      .from('tracks')
      .select('*', { count: 'exact', head: true })
      .eq('artist_id', artistId)
      .gt('download_price', 0)
      .gte('created_at', startOfMonth.toISOString());
    setMonthlyDownloadSalesCount(count || 0);
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

  const downloadSalesLimit = access.download_sales_monthly_limit ?? 0;
  const canAddDownloadSale = isPremium
    ? true
    : (access.download_sales && monthlyDownloadSalesCount < downloadSalesLimit);
  const downloadSalesRemaining = isPremium
    ? Infinity
    : Math.max(0, downloadSalesLimit - monthlyDownloadSalesCount);

  return {
    tierSlug,
    tierData,
    tierLevel,
    access,
    tierLoading: loading,
    trackCount,
    isPro,
    isPremium,
    isFree,
    hasFeature,
    canUpload,
    uploadsRemaining,
    getMinTier,
    getFeatureInfo,
    refreshTier: () => {
      if (artist?.id) {
        fetchTier(artist.id);
        fetchMonthlyDownloadSalesCount(artist.id);
      }
    },
    // Download sales limit enforcement
    downloadSalesLimit,
    downloadSalesUsed: monthlyDownloadSalesCount,
    downloadSalesRemaining,
    canAddDownloadSale,
  };
}

export { TIER_ACCESS, FEATURE_LABELS };
