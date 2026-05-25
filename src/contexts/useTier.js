import React, { useState, useEffect, useCallback, createContext, useContext } from 'react';
import { supabase } from '../supabaseClient';
import { useAuth } from './AuthContext';

const TierContext = createContext(null);

export function TierProvider({ children }) {
  const tier = useTierInternal();
  return <TierContext.Provider value={tier}>{children}</TierContext.Provider>;
}

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
    // Beatmaker limits
    max_beats: 3,                        // Free: 3 beats total
    beat_licences: ['free', 'basic'],    // Free: only Free and Basic Lease
    stems_upload: false,                 // Free: no stem uploads
    beat_analytics: false,               // Free: no beat analytics
    exclusive_licence: false,            // Free: no Exclusive licence tier
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
    download_sales_monthly_limit: 2,
    pre_order: false,
    custom_branding: true,
    advanced_analytics: false,
    community_post: true,
    daily_thought: true,
    // Beatmaker limits
    max_beats: 20,                                              // Pro: 20 beats
    beat_licences: ['free', 'basic', 'premium', 'unlimited'],  // Pro: all except Exclusive
    stems_upload: true,
    beat_analytics: true,
    exclusive_licence: false,                                   // Pro: no Exclusive
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
    download_sales_monthly_limit: Infinity,
    pre_order: true,
    custom_branding: true,
    advanced_analytics: true,
    community_post: true,
    daily_thought: true,
    // Beatmaker limits
    max_beats: Infinity,                                                      // Premium: unlimited
    beat_licences: ['free', 'basic', 'premium', 'unlimited', 'exclusive'],   // Premium: all tiers
    stems_upload: true,
    beat_analytics: true,
    exclusive_licence: true,
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
  stems_upload: { name: 'Stem Uploads', description: 'Attach stems to your beats for buyers to download', minTier: 'pro' },
  beat_analytics: { name: 'Beat Analytics', description: 'Per-beat plays, licence views and purchase tracking', minTier: 'pro' },
  exclusive_licence: { name: 'Exclusive Licence', description: 'Offer full exclusive rights on your beats', minTier: 'premium' },
}

function useTierInternal() {
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
  }, [artist?.id, artist?.role, isAdmin]);

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
  }, [artist?.id, artist?.role, isAdmin]);

  const fetchTier = async (artistId) => {
    if (!artistId) return;
    try {
      // Fetch active subscription then resolve tier slug separately
      // (two FK constraints to platform_tiers prevent reliable PostgREST join)
      const { data: subs } = await supabase
        .from('artist_tier_subscriptions')
        .select('tier_id, status')
        .eq('artist_id', artistId)
        .eq('status', 'active')
        .order('created_at', { ascending: false })
        .limit(1);

      const sub = subs?.[0];
      console.log('[useTier] active sub:', JSON.stringify(sub));

      if (sub?.tier_id) {
        // Hardcoded tier_id → slug mapping to avoid platform_tiers RLS issues
        const TIER_ID_MAP = {
          '289f65ec-4b2f-4868-b71f-9f560d493225': 'free',
          'a421dac1-f492-461c-88a5-f01b6942a042': 'pro',
          'f0b8b8f5-bfc2-496e-9fb4-8904d9dc6fe4': 'premium',
        };
        const slug = TIER_ID_MAP[sub.tier_id];
        console.log('[useTier] tier slug from map:', slug, 'for tier_id:', sub.tier_id);
        if (slug) {
          setTierSlug(['master','premium'].includes(slug) ? 'premium' : slug === 'pro' ? 'pro' : 'free');
          setLoading(false);
          return;
        }
        // Fallback: try platform_tiers query
        try {
          const { data: tierRow } = await supabase
            .from('platform_tiers')
            .select('id, slug')
            .eq('id', sub.tier_id)
            .single();
          console.log('[useTier] tier row:', JSON.stringify(tierRow));
          if (tierRow?.slug) {
            setTierSlug(['master','premium'].includes(tierRow.slug) ? 'premium' : tierRow.slug === 'pro' ? 'pro' : 'free');
            setLoading(false);
            return;
          }
        } catch {}
      }

      // Fallback: check artists.tier column
      const { data: artistRow } = await supabase
        .from('artists')
        .select('tier')
        .eq('id', artistId)
        .maybeSingle();
      const fallback = artistRow?.tier || 'free';
      setTierSlug(['master','premium'].includes(fallback) ? 'premium' : fallback === 'pro' ? 'pro' : 'free');
    } catch (err) {
      console.error('fetchTier error:', err);
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
  const beatLicences      = access.beat_licences || ['free', 'basic'];
  const maxBeats          = access.max_beats ?? 3;
  const canUploadStems    = access.stems_upload ?? false;
  const canUseBeatAnalytics = access.beat_analytics ?? false;
  const canUseExclusive   = access.exclusive_licence ?? false;

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
    // Beat maker features
    beatLicences,
    maxBeats,
    canUploadStems,
    canUseBeatAnalytics,
    canUseExclusive,
  };
}

export function useTier() {
  const ctx = useContext(TierContext);
  // If context not available, return safe free-tier defaults
  // This prevents crashes if something renders outside TierProvider
  if (!ctx) {
    console.warn('[useTier] called outside TierProvider — returning free defaults');
    return {
      tierSlug: 'free', tierLevel: 1, tierLoading: false, isPro: false,
      isPremium: false, isFree: true, beatLicences: ['free','basic'],
      canUploadStems: false, canUseBeatAnalytics: false, canUseExclusive: false,
      maxBeats: 3, canAddDownloadSale: false, downloadSalesRemaining: 0,
      downloadSalesLimit: 0, downloadSalesUsed: 0, access: {},
      hasFeature: () => false, canUpload: true, uploadsRemaining: 999,
      getMinTier: () => 'free', getFeatureInfo: () => ({}),
      refreshTier: () => {},
    };
  }
  return ctx;
}

export { TIER_ACCESS, FEATURE_LABELS };