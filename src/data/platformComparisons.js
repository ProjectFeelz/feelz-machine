// src/data/platformComparisons.js
//
// Real, sourced facts for each platform comparison page. Every stat here
// should be traceable to actual reporting — Spotify's own Loud & Clear
// report, SoundCloud's and Bandcamp's own published payout data, and
// cross-referenced industry per-stream rate reporting for Apple Music.
// If any of these figures change (they do, regularly), update here first —
// every comparison page pulls from this single source of truth.

const platformComparisons = {
  spotify: {
    slug: 'spotify',
    name: 'Spotify',
    metaTitle: 'Feelz Machine vs Spotify — What Independent Artists Actually Get Paid',
    metaDescription: 'A factual look at how Spotify pays independent artists in 2025-2026, and what Feelz Machine does differently: direct fan contact, transparent payouts, and no algorithm gatekeeping.',
    heroStat: '$7,300',
    heroStatLabel: "what the 100,000th highest-earning artist made on Spotify in all of 2025",
    intro: "Spotify paid the music industry more than $11 billion in 2025 — its biggest year ever. That number gets used to sell the platform to artists. Here's the part that doesn't make the pitch: most of that money never reaches most artists.",
    facts: [
      { stat: '$11 billion', detail: 'paid out by Spotify in 2025, a record year (Spotify Loud & Clear report)' },
      { stat: '$0.003–$0.005', detail: 'typical per-stream payout, pooled across all listeners in a country (pro-rata model)' },
      { stat: '$7,300', detail: "what the 100,000th highest-earning artist on the entire platform made in 2025 — for the full year" },
      { stat: '13,800 artists', detail: 'earned at least $100,000 in 2025, out of many millions with music on the platform' },
    ],
    howItWorks: "Spotify pools all subscription and ad revenue in a country, then pays each artist a share based on their percentage of total streams that month. It's not a fixed rate per play — your payout depends on how many other streams happened platform-wide, not just your own numbers.",
    whatFMDoesDifferently: [
      { title: 'You keep your fan contacts', desc: "On Spotify, you never see who's actually listening. Feelz Machine lets you export your own fan contact list — it's yours, not locked inside the platform." },
      { title: 'Direct fan messaging', desc: 'Reach the people who follow you directly, instead of hoping the algorithm surfaces you in someone\'s Discover Weekly.' },
      { title: 'Instant upload, no gatekeeping', desc: 'No editorial pitching, no waiting on playlist placement to be seen. Your music is live and discoverable the moment you upload it.' },
      { title: 'Stories for real-time connection', desc: "Post updates, behind-the-scenes clips, and announcements directly to your fans, the way they'd expect from any platform built for connection, not just passive listening." },
    ],
    honestNote: "Spotify still has the largest audience of any platform by a wide margin, and most independent artists should keep releasing there. This isn't about leaving Spotify. It's about not treating it as the only place that matters.",
  },

  soundcloud: {
    slug: 'soundcloud',
    name: 'SoundCloud',
    metaTitle: 'Feelz Machine vs SoundCloud — Payouts, Reach, and What Each Platform Actually Offers',
    metaDescription: 'How SoundCloud pays independent artists in 2025-2026 compared to Feelz Machine, covering Fan-Powered Royalties, reach, and direct fan ownership.',
    heroStat: '76 million',
    heroStatLabel: "SoundCloud's monthly active listeners, versus Spotify's 675 million",
    intro: "SoundCloud made a real, artist-friendly change in November 2025: it now pays out 100% of distribution royalties, up from an 80% share. That's genuinely good. It doesn't change the fact that SoundCloud's own audience is a fraction of the size of the platforms most listeners actually use.",
    facts: [
      { stat: '100%', detail: 'of distribution royalties now kept by artists on paid plans, as of November 2025 (up from 80%)' },
      { stat: '$0.0025–$0.004', detail: 'typical payout per stream on SoundCloud itself, under its Fan-Powered Royalties model' },
      { stat: '76 million', detail: "SoundCloud's monthly active listeners, compared to roughly 675 million on Spotify" },
      { stat: 'Fan-Powered Royalties', detail: "a subscriber's fee goes toward the specific artists they actually listened to, not a platform-wide pool" },
    ],
    howItWorks: "SoundCloud's Fan-Powered Royalties model is different from most platforms — instead of pooling everyone's subscription fees together, your share of a listener's payment is based on how much they specifically listened to you. It rewards a smaller, loyal audience more fairly than pooled models do.",
    whatFMDoesDifferently: [
      { title: 'Built for artists first, not producers testing beats', desc: "SoundCloud's strength is discovery and demos. Feelz Machine is built around an artist's actual release, profile, and direct relationship with fans." },
      { title: 'Exportable fan contacts', desc: 'Your fan list is yours to take with you — not tied permanently to one platform\'s ecosystem.' },
      { title: 'No monetization eligibility requirements', desc: "SoundCloud requires 500 eligible plays in the past month before you can monetize at all. There's no equivalent barrier on Feelz Machine." },
      { title: 'Stories and direct messaging', desc: "Connect with fans directly, not just through comments and reposts." },
    ],
    honestNote: "SoundCloud genuinely is strong for demos, remixes, and community-driven genres like electronic and hip-hop production. Many artists use it alongside other platforms rather than instead of them, and that's a reasonable approach.",
  },

  bandcamp: {
    slug: 'bandcamp',
    name: 'Bandcamp',
    metaTitle: 'Feelz Machine vs Bandcamp — Direct Sales, Revenue Share, and Fan Ownership',
    metaDescription: 'How Bandcamp\'s revenue share and direct-sales model compares to Feelz Machine for independent artists in 2025-2026.',
    heroStat: '82%',
    heroStatLabel: 'average revenue share Bandcamp artists keep on a typical sale',
    intro: "Bandcamp deserves real credit here: it's one of the few platforms actually built to pay artists fairly. It's a direct-sales marketplace, not a streaming service — a fundamentally different model, and a genuinely good one for the right kind of release.",
    facts: [
      { stat: '82%', detail: 'average revenue artists keep per digital sale, after Bandcamp\'s fee' },
      { stat: '15% / 10%', detail: "Bandcamp's digital sales fee (drops to 10% after $5,000 in lifetime sales), plus 10% on physical merch" },
      { stat: '$1.68 billion+', detail: 'paid to artists and labels through Bandcamp since the platform launched' },
      { stat: 'Bandcamp Fridays', detail: 'select days where Bandcamp waives its fee entirely — artists keep the full sale price' },
    ],
    howItWorks: "Bandcamp isn't a streaming platform at all — it's a storefront. Fans buy your music directly (often paying more than the asking price voluntarily), and you keep the large majority of every sale. There's no per-stream math because there's no streaming; it's a purchase.",
    whatFMDoesDifferently: [
      { title: 'Streaming and direct connection together', desc: "Bandcamp is sales-first. Feelz Machine combines streaming discovery with direct fan messaging, so you're not choosing between reach and revenue." },
      { title: 'Built-in stories and community feed', desc: "Bandcamp doesn't have a native way to post updates or connect with fans day-to-day beyond a purchase. Feelz Machine does." },
      { title: 'No purchase required to build your audience', desc: 'Fans can follow, stream, and engage with your profile without needing to make a purchase first.' },
      { title: 'Instant upload', desc: 'No waiting on release-day timing conventions — your music goes live the moment you publish it.' },
    ],
    honestNote: "If direct sales and superfan support are your main goal, Bandcamp is genuinely excellent, and there's no reason not to use both. Many of the strongest independent artist income strategies combine a direct-sales storefront with a platform built for ongoing fan connection.",
  },

  'apple-music': {
    slug: 'apple-music',
    name: 'Apple Music',
    metaTitle: 'Feelz Machine vs Apple Music — Per-Stream Rates and What Independent Artists Actually Need',
    metaDescription: 'How Apple Music\'s per-stream payouts compare to Feelz Machine for independent artists, including reach, editorial gatekeeping, and direct fan access.',
    heroStat: '~2x',
    heroStatLabel: "Apple Music's typical per-stream rate compared to Spotify's",
    intro: "Apple Music pays a meaningfully higher rate per stream than Spotify — genuinely true, and worth knowing. What that number leaves out: reach, discovery, and whether you ever get to actually talk to the people listening.",
    facts: [
      { stat: '$0.006–$0.01', detail: 'typical per-stream payout on Apple Music, roughly double Spotify\'s rate' },
      { stat: 'No free tier', detail: 'every Apple Music stream comes from a paying subscriber — there\'s no ad-supported listening' },
      { stat: '~100 million', detail: "Apple Music's estimated paid subscriber base, versus Spotify's 290 million+ paid subscribers" },
      { stat: 'No stream minimum', detail: 'Apple Music pays from the very first stream, unlike platforms with a minimum threshold before royalties start' },
    ],
    howItWorks: "Apple Music has no free, ad-supported tier — every listener is already paying a subscription, which is the main reason its per-stream rate runs higher than Spotify's. But a smaller, more Apple-ecosystem-skewed user base means less total reach for most independent artists than the raw rate suggests.",
    whatFMDoesDifferently: [
      { title: 'No editorial pitch required to be discovered', desc: "Apple Music's editorial team reviews one pitch per release. Feelz Machine doesn't gate discovery behind a single submission." },
      { title: 'Direct fan relationship, not just a higher rate', desc: "A better per-stream rate doesn't tell you who's listening. Feelz Machine gives you their contact info, not just a royalty statement." },
      { title: 'Built specifically for independent artists', desc: 'No competing for shelf space against major-label catalogs and algorithmic promotion budgets.' },
      { title: 'Stories, direct messaging, and instant upload', desc: 'Tools built around an ongoing relationship with fans, not a one-time editorial submission.' },
    ],
    honestNote: "Apple Music's higher per-stream rate is real and worth factoring into your release strategy — it's a legitimate part of a diversified distribution plan, not a reason to pick one platform over another entirely.",
  },
};

export default platformComparisons;