// src/data/tiers.js
//
// Plan names, prices and what each includes. One copy, read by the upgrade
// page and the About page so they can never disagree.

import { Crown, Zap, Star } from 'lucide-react';

// ── Base prices in USD ────────────────────────────────────────
export const BASE_USD = {
  pro:     { monthly: 2.00,  annual: 17.00 },
  premium: { monthly: 5.00,  annual: 42.00 },
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
      { text: 'Analytics dashboard', included: true },
      { text: 'Collaboration & splits', included: true },
      { text: 'Competition entry', included: true },
      { text: 'Community posting (1/day)', included: true },
      { text: 'Pre-order releases', included: false },
      { text: 'Priority in browse/trending', included: false },
      { text: 'Download sales (2 tracks/month)', included: true },
      { text: 'Offline listening, play with no signal', included: true },
      { text: 'YouTube video backdrop', included: false },
      { text: 'Live streaming', included: false },
    ],
  },
  premium: {
    name: 'Premium',
    icon: Crown,
    color: '#F59E0B',
    features: [
      { text: 'Unlimited uploads', included: true },
      { text: 'Full artist profile', included: true },
      { text: 'Lyrics on tracks', included: true },
      { text: 'Custom theme & branding', included: true },
      { text: 'Chat rooms (unlimited)', included: true },
      { text: 'Advanced analytics', included: true },
      { text: 'Collaboration & splits', included: true },
      { text: 'Competition entry', included: true },
      { text: 'Priority in browse/trending', included: true },
      { text: 'Download sales', included: true },
      { text: 'Offline listening, play with no signal', included: true },
      { text: 'Pre-order releases', included: true },
      { text: 'YouTube video backdrop', included: true },
      { text: 'Featured track placement', included: true },
      { text: 'Live streaming to followers', included: true },
      { text: 'Tip goals & fan fundraising', included: true },
      { text: 'Merch store with Printful', included: true },
    ],
  },
};