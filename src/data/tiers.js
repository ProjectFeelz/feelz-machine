// src/data/tiers.js
//
// Plan names, prices and what each includes. One copy, read by the upgrade
// page and the About page so they can never disagree.

import { Crown, Zap, Star } from 'lucide-react';

// ── Base prices in USD ────────────────────────────────────────
// The prices shown on /upgrade. platform_tiers holds the same numbers and is
// what actually gets charged in rand, so these two MUST be kept in step: a gap
// between them is a customer quoted one price and billed another, which is
// exactly what happened before migration 259 (table said 20, this said 17).
// Making the page read platform_tiers is the real fix and has not been done.
//
// Raised in migration 260. The annual discount stays at about 30%.
export const BASE_USD = {
  pro:     { monthly: 5.00,  annual:  42.00 },
  premium: { monthly: 12.00, annual: 100.00 },
};

export const BEATMAKER_TIER_FEATURES = {
  free: {
    name: 'Free',
    icon: Star,
    color: '#737373',
    features: [
      { text: 'Upload up to 3 beats', included: true },
      { text: 'Basic producer profile', included: true },
      { text: 'Free & Basic Lease licences only', included: true },
      { text: 'Beat discovery in For You feed', included: true },
      { text: 'Stem uploads', included: false },
      { text: 'Beat analytics', included: false },
      { text: 'Premium & Unlimited Lease', included: false },
      { text: 'Exclusive Licence tier', included: false },
      { text: 'Collaboration & splits', included: false },
      { text: 'Custom theme & branding', included: false },
      { text: 'Offline listening', included: false },
    ],
  },
  pro: {
    name: 'Pro',
    icon: Zap,
    color: '#8B5CF6',
    popular: true,
    features: [
      { text: 'Upload up to 20 beats', included: true },
      { text: 'Full producer profile', included: true },
      { text: 'All licences except Exclusive', included: true },
      { text: 'Stem uploads', included: true },
      { text: 'Beat analytics dashboard', included: true },
      { text: 'Per-beat streams, plays & licence views', included: true },
      { text: 'Collaboration & revenue splits', included: true },
      { text: 'Custom theme & branding', included: true },
      { text: 'Competition entry', included: true },
      { text: 'Offline listening, play with no signal', included: true },
      { text: 'Exclusive Licence tier', included: false },
      { text: 'Priority in beats feed', included: false },
    ],
  },
  premium: {
    name: 'Premium',
    icon: Crown,
    color: '#F59E0B',
    features: [
      { text: 'Unlimited beat uploads', included: true },
      { text: 'Full producer profile', included: true },
      { text: 'All 5 licence tiers including Exclusive', included: true },
      { text: 'Stem uploads', included: true },
      { text: 'Advanced beat analytics & CSV export', included: true },
      { text: 'Collaboration & revenue splits', included: true },
      { text: 'Custom theme & branding', included: true },
      { text: 'Priority placement in beats feed', included: true },
      { text: 'Featured beat placement', included: true },
      { text: 'Competition entry', included: true },
      { text: 'Offline listening, play with no signal', included: true },
      { text: 'Merch store with Printful', included: true },
    ],
  },
};

export const TIER_FEATURES = {
  free: {
    name: 'Free',
    icon: Star,
    color: '#737373',
    features: [
      { text: 'Upload up to 2 singles', included: true },
      { text: 'Basic artist profile', included: true },
      { text: 'Cover artwork on tracks', included: true },
      { text: 'Lyrics on tracks', included: false },
      { text: 'Custom theme & branding', included: false },
      { text: 'Chat rooms', included: false },
      { text: 'Stories & voice memos', included: false },
      { text: 'Message your followers', included: false },
      { text: 'Analytics dashboard', included: false },
      { text: 'Collaboration & splits', included: false },
      { text: 'Competition entry', included: false },
      { text: 'Download sales', included: false },
      { text: 'Offline listening', included: false },
    ],
  },
  pro: {
    name: 'Pro',
    icon: Zap,
    color: '#8B5CF6',
    popular: true,
    features: [
      { text: 'Unlimited uploads', included: true },
      { text: 'Full artist profile', included: true },
      { text: 'Lyrics on tracks', included: true },
      { text: 'Custom theme & branding', included: true },
      { text: 'Chat rooms (1 room)', included: true },
      { text: 'Play Feelz Run and G.I.L.L.', included: true },
      { text: 'Stories & voice memos', included: true },
      { text: 'Message your followers', included: true },
      { text: 'Analytics dashboard', included: true },
      { text: 'Collaboration & splits', included: true },
      { text: 'Competition entry', included: true },
      { text: 'Community posting (1/day)', included: true },
      // BrowsePage multiplies engagement score by tier: premium 1.5, pro 1.2.
      // This line said "not included" while Pro was already getting 1.2, so Pro
      // artists had a benefit nobody told them about and Premium's headline
      // differentiator was quietly shared. The ladder is real, so say so.
      { text: 'Some priority in browse/trending', included: true },
      { text: 'Download sales (2 tracks/month)', included: true },
      { text: 'Offline listening, play with no signal', included: true },
      { text: 'YouTube video backdrop', included: false },
      { text: 'Live streaming', included: false },
      { text: 'Your song playable in Feelz Run', included: false },
      { text: 'Merch store, tip goals, featured placement', included: false },
    ],
  },
  premium: {
    name: 'Premium',
    icon: Crown,
    color: '#F59E0B',
    // ORDER MATTERS HERE. These used to open with the same five lines as the
    // Pro card, so the two were indistinguishable at a glance and the nine
    // real differences were buried in the middle. Everything Premium alone
    // gives now comes first; the shared ground follows.
    features: [
      // Only on Premium
      { text: 'Merch store with Printful', included: true },
      { text: 'Tip goals & fan fundraising', included: true },
      { text: 'Featured track placement', included: true },
      { text: 'Live streaming to followers', included: true },
      { text: 'YouTube video backdrop', included: true },
      { text: 'Your song playable in Feelz Run', included: true },
      // Bigger on Premium than on Pro
      { text: 'Download sales, no monthly cap', included: true },
      { text: 'Chat rooms, as many as you want', included: true },
      { text: 'Advanced analytics', included: true },
      { text: 'Top priority in browse/trending', included: true },
      // Shared with Pro
      { text: 'Unlimited uploads', included: true },
      { text: 'Full artist profile', included: true },
      { text: 'Lyrics on tracks', included: true },
      { text: 'Custom theme & branding', included: true },
      { text: 'Stories & voice memos', included: true },
      { text: 'Message your followers', included: true },
      { text: 'Collaboration & splits', included: true },
      { text: 'Competition entry', included: true },
      // TIER_ACCESS has community_post true for premium and this card never
      // said so, which made Premium look like it had one fewer feature.
      { text: 'Community posting', included: true },
      { text: 'Offline listening, play with no signal', included: true },
    ],
  },
};

// ── Listeners ─────────────────────────────────────────────────────────────
//
// The About page's Listeners tab showed Free and stopped, on the page whose
// job is to sell Fan Pro. These match what ListenerUpgradePage charges:
// 2.99 a month, or 1.99 a month billed yearly, which is 23.88 for the year.
export const LISTENER_BASE_USD = {
  fan_pro: { monthly: 2.99, annual: 23.88 },
};

export const LISTENER_TIERS = ['free', 'fan_pro'];

export const LISTENER_TIER_FEATURES = {
  free: {
    name: 'Free',
    features: [
      { text: 'Stream every published track', included: true },
      { text: 'Follow artists and get their drops first', included: true },
      { text: 'Playlists and liked songs', included: true },
      { text: 'Play Feelz Run and G.I.L.L.', included: true },
      { text: 'Tip the artists you love', included: true },
      { text: 'Three free downloads a month', included: true },
      { text: 'Unlimited downloads', included: false },
      { text: 'Offline listening', included: false },
      { text: 'Build and keep your own G.I.L.L. worlds', included: false },
      { text: 'Custom app themes', included: false },
      { text: 'Fan badge on tips and comments', included: false },
    ],
  },
  fan_pro: {
    name: 'Fan Pro',
    features: [
      // What Fan Pro alone gives, first, for the same reason as Premium.
      { text: 'Offline listening, play with no signal', included: true },
      { text: 'Downloads with no monthly cap', included: true },
      { text: 'Build and keep your own G.I.L.L. worlds', included: true },
      { text: 'Chat with your favourite artists', included: true },
      { text: '10 custom app themes', included: true },
      { text: 'Fan badge on tips and comments', included: true },
      { text: 'Early access to new features', included: true },
      // Shared with Free
      { text: 'Stream every published track', included: true },
      { text: 'Follow artists and get their drops first', included: true },
      { text: 'Playlists and liked songs', included: true },
      { text: 'Play Feelz Run and G.I.L.L.', included: true },
      { text: 'Tip the artists you love', included: true },
    ],
  },
};
