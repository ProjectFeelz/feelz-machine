// src/pages/AboutPage.js
//
// One screen, no scrolling, on every device. Tabs across the top pick the
// account type (About, Artists, Beat Makers, Listeners, Venues); artists and
// beat makers also get a Free / Pro / Premium switch. Each combination is its
// own page that fits the screen. Plan details come from src/data/tiers.js, the
// same list the upgrade page uses, so the two never disagree.

import { Helmet } from 'react-helmet-async';
import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import {
  Check, Mic2, Headphones, Store, Sparkles, Disc3, SlidersHorizontal, ChevronRight,
} from 'lucide-react';
import { BASE_USD, TIER_FEATURES, BEATMAKER_TIER_FEATURES } from '../data/tiers';

const GREEN = '#8CAB2E';

const TABS = [
  { key: 'about',     label: 'About' },
  { key: 'artist',    label: 'Artists' },
  { key: 'beatmaker', label: 'Beat Makers' },
  { key: 'listener',  label: 'Listeners' },
  { key: 'venue',     label: 'Venues' },
];
const TIERS = ['free', 'pro', 'premium'];

function priceLine(slug) {
  if (slug === 'free') return { big: '$0', small: 'free forever' };
  const p = BASE_USD[slug];
  return { big: `$${p.annual}`, small: `a year, or $${p.monthly.toFixed(2)} a month` };
}

const TIER_BLURB = {
  artist: {
    free:    'Put your first songs out and see how it feels.',
    pro:     'For artists releasing properly: unlimited uploads, stats and collabs.',
    premium: 'Everything, plus the tools that bring money in.',
  },
  beatmaker: {
    free:    'Get your first beats in front of artists.',
    pro:     'Sell leases, upload stems and see who is listening.',
    premium: 'Every licence including Exclusive, and top placement.',
  },
};

const STATIC_PAGES = {
  listener: {
    icon: Headphones, color: '#60A5FA',
    eyebrow: 'For listeners',
    title: 'Hear it first. Back it directly.',
    blurb: 'Independent music from the people who made it. Free to join.',
    price: { big: 'Free', small: 'no card needed' },
    items: [
      'Stream every published track',
      'Follow artists and get their drops first',
      'Playlists and liked songs',
      'Buy a track and the money goes to the artist',
      'Tip the artists you love',
      'Share any track as a video to Instagram',
    ],
    cta: { label: 'Start listening', to: '/' },
  },
  venue: {
    icon: Store, color: '#F59E0B',
    eyebrow: 'For shops, bars and salons',
    title: 'Music for your space. Paid to the artists.',
    blurb: 'Feelz Machine Retail plays licensed independent music in your venue, straight from a browser.',
    price: null,
    items: [
      'Only music artists chose to submit',
      'Half of what venues pay goes to the artists played',
      'Paid out to artists every month',
      'Runs on any screen with a browser',
      'Staff logins for your team',
    ],
    cta: { label: 'See Retail', to: '/retail' },
  },
};

// Measures the space between the top of the page and the app's bottom bars,
// so the page is exactly one screen tall whatever the player is doing.
function useFitHeight(ref) {
  const [h, setH] = useState(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const main = el.closest('main');
    const calc = () => {
      const pb = main ? parseFloat(getComputedStyle(main).paddingBottom) || 0 : 0;
      const top = el.getBoundingClientRect().top + window.scrollY;
      setH(Math.max(440, Math.floor(window.innerHeight - top - pb)));
    };
    calc();
    window.addEventListener('resize', calc);
    let ro = null;
    if (main && window.ResizeObserver) {
      ro = new ResizeObserver(calc);
      ro.observe(main, { box: 'border-box' });
    }
    return () => { window.removeEventListener('resize', calc); ro?.disconnect(); };
  }, [ref]);
  return h;
}

// The artwork beside each page: rings, a centre badge and a live-looking
// level meter in the page's colour. Pure decoration.
function Visual({ icon: Icon, color, compact }) {
  const size = compact ? 150 : 300;
  return (
    <div className="relative flex items-center justify-center select-none" style={{ width: size, height: size }} aria-hidden="true">
      <div className="absolute inset-0 rounded-full"
        style={{ background: `radial-gradient(circle, ${color}33 0%, ${color}0d 45%, transparent 70%)` }} />
      <svg viewBox="0 0 200 200" className="absolute inset-0 w-full h-full">
        <circle cx="100" cy="100" r="92" fill="none" stroke={`${color}22`} strokeWidth="1" />
        <circle cx="100" cy="100" r="74" fill="none" stroke={`${color}33`} strokeWidth="1" />
        <g className="about-spin" style={{ transformOrigin: '100px 100px' }}>
          <circle cx="100" cy="100" r="83" fill="none" stroke={color} strokeOpacity="0.55" strokeWidth="2" strokeDasharray="2 10" strokeLinecap="round" />
          <circle cx="183" cy="100" r="4" fill={color} />
        </g>
        <circle cx="100" cy="100" r="56" fill="#0d0d0d" stroke={`${color}55`} strokeWidth="1.5" />
      </svg>
      <div className="relative flex flex-col items-center">
        <Icon style={{ color, width: compact ? 30 : 56, height: compact ? 30 : 56 }} strokeWidth={1.6} />
        <div className="flex items-end mt-2" style={{ gap: compact ? 2 : 3, height: compact ? 12 : 22 }}>
          {[0, 1, 2, 3, 4].map(i => (
            <span key={i} className="about-eq rounded-full"
              style={{ width: compact ? 3 : 4, background: color, animationDelay: `${i * 0.13}s`, height: '100%' }} />
          ))}
        </div>
      </div>
    </div>
  );
}

function FeatureList({ items, color, max }) {
  return (
    <ul className="grid grid-cols-1 lg:grid-cols-2 gap-x-5 gap-y-1.5 sm:gap-y-2">
      {items.slice(0, max).map(t => (
        <li key={t} className="flex items-start space-x-2 text-[13px] sm:text-sm text-white/65 leading-snug">
          <Check className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" style={{ color }} strokeWidth={3} />
          <span>{t}</span>
        </li>
      ))}
    </ul>
  );
}

export default function AboutPage() {
  const navigate = useNavigate();
  const rootRef = useRef(null);
  const height = useFitHeight(rootRef);
  const [tab, setTab] = useState('about');
  const [tier, setTier] = useState('pro');
  const [playStoreUrl, setPlayStoreUrl] = useState('');
  const [appStoreUrl, setAppStoreUrl] = useState('');

  useEffect(() => {
    supabase.from('platform_settings').select('key, value')
      .in('key', ['play_store_url', 'app_store_url'])
      .then(({ data }) => {
        (data || []).forEach(row => {
          if (row.key === 'play_store_url') setPlayStoreUrl(row.value || '');
          if (row.key === 'app_store_url') setAppStoreUrl(row.value || '');
        });
      });
  }, []);

  const isPhone = typeof window !== 'undefined' && window.innerWidth < 768;
  const compact = isPhone || (!!height && height < 640);

  // Fit to the screen: if the page is taller than the space, first drop the
  // artwork on phones, then show fewer features, until nothing would scroll.
  const bodyRef = useRef(null);
  const [fit, setFit] = useState({ items: 10, visual: true });
  useLayoutEffect(() => { setFit({ items: 10, visual: true }); }, [tab, tier, height]);
  useLayoutEffect(() => {
    const el = bodyRef.current;
    if (!el) return;
    if (el.scrollHeight <= el.clientHeight + 1) return;
    setFit(f => {
      if (f.visual && isPhone) return { ...f, visual: false };
      if (f.items > 3) return { ...f, items: f.items - 1 };
      return f;
    });
  });
  const maxItems = fit.items;
  const tight = !fit.visual;

  // What the current tab shows.
  let page = null;
  if (tab === 'artist' || tab === 'beatmaker') {
    const src = (tab === 'artist' ? TIER_FEATURES : BEATMAKER_TIER_FEATURES)[tier];
    page = {
      icon: tab === 'artist' ? Mic2 : SlidersHorizontal,
      color: src.color === '#737373' ? '#A3A3A3' : src.color,
      eyebrow: `${tab === 'artist' ? 'Artists' : 'Beat makers'} · ${src.name}`,
      title: src.name,
      blurb: TIER_BLURB[tab][tier],
      price: priceLine(tier),
      items: src.features.filter(f => f.included).map(f => f.text),
      cta: { label: tier === 'free' ? 'Start free' : `Get ${src.name}`, to: '/upgrade' },
    };
  } else if (STATIC_PAGES[tab]) {
    page = STATIC_PAGES[tab];
  }

  return (
    <div ref={rootRef} className="relative overflow-hidden flex flex-col bg-[#0a0a0a] text-white md:rounded-3xl md:border md:border-white/[0.05]"
      style={{ height: height || '100dvh' }}>
      <Helmet>
        <title>About Feelz Machine | Independent Music, Direct to Fans</title>
        <meta name="description" content="Why Feelz Machine exists: independent artists keeping their music, their audience and their money. Streaming, downloads and tips with no middlemen." />
        <link rel="canonical" href="https://www.feelzmachine.com/about" />
        <meta property="og:type" content="website" />
        <meta property="og:url" content="https://www.feelzmachine.com/about" />
        <meta property="og:title" content="About Feelz Machine | Independent Music, Direct to Fans" />
        <meta property="og:description" content="Why Feelz Machine exists: independent artists keeping their music, their audience and their money. Streaming, downloads and tips with no middlemen." />
        <meta name="twitter:title" content="About Feelz Machine | Independent Music, Direct to Fans" />
        <meta name="twitter:description" content="Why Feelz Machine exists: independent artists keeping their music, their audience and their money. Streaming, downloads and tips with no middlemen." />
      </Helmet>
      <style>{`
        @keyframes about-spin { to { transform: rotate(360deg); } }
        .about-spin { animation: about-spin 28s linear infinite; }
        @keyframes about-eq { 0%,100% { transform: scaleY(0.3); } 50% { transform: scaleY(1); } }
        .about-eq { transform-origin: bottom; animation: about-eq 1.1s ease-in-out infinite; }
        @keyframes about-in { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
        .about-in { animation: about-in .35s ease-out both; }
        @media (prefers-reduced-motion: reduce) { .about-spin, .about-eq, .about-in { animation: none; } }
      `}</style>

      {/* Background glow in the current page's colour */}
      <div className="pointer-events-none absolute -top-40 -right-40 w-[520px] h-[520px] rounded-full blur-3xl opacity-20 transition-colors duration-500"
        style={{ background: page?.color || GREEN }} />

      {/* Mobile: leaves room for the floating bell on the right */}
      <div className="md:hidden flex items-center px-4 flex-shrink-0"
        style={{ paddingTop: 'max(env(safe-area-inset-top, 0px), 12px)', height: 'calc(max(env(safe-area-inset-top, 0px), 12px) + 44px)' }}>
        <img src="/icon-192.png" alt="" className="w-6 h-6 rounded-md mr-2" />
        <span className="text-sm font-bold">Feelz Machine</span>
      </div>

      {/* Tabs */}
      <div className="relative flex-shrink-0 px-3 md:px-8 md:pt-6">
        <div className="flex items-center justify-between gap-1 bg-white/[0.04] border border-white/[0.06] rounded-2xl p-1 md:max-w-xl">
          {TABS.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`flex-1 px-1.5 sm:px-3 py-2 rounded-xl text-[11px] sm:text-sm font-semibold whitespace-nowrap transition ${
                tab === t.key ? 'bg-white text-black' : 'text-white/45 hover:text-white/75'
              }`}>
              {t.label}
            </button>
          ))}
        </div>
        {(tab === 'artist' || tab === 'beatmaker') && (
          <div className="flex items-center space-x-1.5 mt-2">
            {TIERS.map(s => {
              const f = (tab === 'artist' ? TIER_FEATURES : BEATMAKER_TIER_FEATURES)[s];
              const on = tier === s;
              return (
                <button key={s} onClick={() => setTier(s)}
                  className="px-3.5 py-1.5 rounded-full text-xs font-bold border transition"
                  style={on
                    ? { background: `${f.color}26`, borderColor: `${f.color}80`, color: f.color === '#737373' ? '#e5e5e5' : f.color }
                    : { background: 'transparent', borderColor: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.45)' }}>
                  {f.name}{f.popular ? ' ★' : ''}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Page */}
      <div ref={bodyRef} key={`${tab}-${tier}`} className="about-in relative flex-1 min-h-0 overflow-hidden px-5 md:px-8 py-3 flex flex-col">
        {tab === 'about' ? (
          <div className="my-auto grid md:grid-cols-[1.1fr_1fr] gap-4 md:gap-10 items-center">
            <div>
              <div className="inline-flex items-center space-x-2 rounded-md px-3 py-1 text-[10px] font-semibold tracking-widest uppercase mb-3 md:mb-5"
                style={{ background: 'rgba(140,171,46,0.1)', border: '1px solid rgba(140,171,46,0.25)', color: GREEN }}>
                <span className="w-1.5 h-1.5 rounded-full" style={{ background: GREEN }} /><span>About Feelz Machine</span>
              </div>
              <h1 className="font-extrabold tracking-tight leading-[1.05]" style={{ fontSize: tight ? 30 : 'clamp(32px, 4.6vw, 58px)' }}>
                Your music.<br /><span style={{ color: GREEN }}>Your rules.</span><br /><span className="text-white/25">No middlemen.</span>
              </h1>
              <p className="text-sm md:text-base text-white/45 mt-3 md:mt-5 max-w-md leading-relaxed">
                Upload, stream, sell and meet your fans directly. When someone buys your music, the money lands in your PayPal. We never hold it.
              </p>
              <div className="flex flex-wrap gap-2 mt-4 md:mt-6">
                <button onClick={() => setTab('artist')} className="px-5 py-2.5 rounded-xl text-sm font-bold text-black" style={{ background: GREEN }}>
                  I make music
                </button>
                <button onClick={() => setTab('listener')} className="px-5 py-2.5 rounded-xl text-sm font-bold bg-white/[0.07] border border-white/[0.1] text-white">
                  I listen
                </button>
              </div>
            </div>
            <div className={`${tight ? 'hidden md:grid' : 'grid'} grid-cols-2 gap-2 md:gap-3`}>
              {[
                { icon: Sparkles, c: GREEN,     big: '0%',   small: 'cut on your sales' },
                { icon: Disc3,    c: '#8B5CF6', big: 'Instant', small: 'paid to your PayPal' },
                { icon: Store,    c: '#F59E0B', big: 'Monthly', small: 'retail pay for artists' },
                { icon: Headphones, c: '#60A5FA', big: 'Free', small: 'for listeners' },
              ].map(({ icon: I, c, big, small }) => (
                <div key={small} className="rounded-2xl p-3 md:p-5 bg-white/[0.03] border border-white/[0.06]">
                  <I className="w-4 h-4 md:w-5 md:h-5 mb-2 md:mb-3" style={{ color: c }} />
                  <p className="text-lg md:text-2xl font-black leading-none">{big}</p>
                  <p className="text-[11px] md:text-xs text-white/40 mt-1">{small}</p>
                </div>
              ))}
            </div>
          </div>
        ) : page && (
          <div className="my-auto grid md:grid-cols-[auto_1fr] gap-3 md:gap-12 items-center">
            <div className={`${tight ? 'hidden' : 'flex'} md:flex justify-center`}>
              <Visual icon={page.icon} color={page.color} compact={compact} />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] md:text-xs font-semibold tracking-widest uppercase mb-1.5" style={{ color: page.color }}>{page.eyebrow}</p>
              <h2 className="font-extrabold tracking-tight leading-tight" style={{ fontSize: compact ? 24 : 'clamp(26px, 3.4vw, 44px)' }}>{page.title}</h2>
              <p className="text-[13px] md:text-base text-white/45 mt-1.5 md:mt-3 leading-relaxed max-w-lg">{page.blurb}</p>
              {page.price && (
                <p className="mt-2 md:mt-4 flex items-baseline space-x-2">
                  <span className="text-2xl md:text-4xl font-black">{page.price.big}</span>
                  <span className="text-xs md:text-sm text-white/40">{page.price.small}</span>
                </p>
              )}
              <div className="mt-3 md:mt-5">
                <FeatureList items={page.items} color={page.color} max={maxItems} />
              </div>
              <button onClick={() => navigate(page.cta.to)}
                className="mt-4 md:mt-6 inline-flex items-center space-x-1.5 px-5 py-2.5 rounded-xl text-sm font-bold text-black"
                style={{ background: page.color === '#A3A3A3' ? '#fff' : page.color }}>
                <span>{page.cta.label}</span><ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="relative flex-shrink-0 flex items-center justify-between gap-2 px-5 md:px-8 py-2.5 border-t border-white/[0.05] text-[11px] text-white/35">
        <div className="flex items-center gap-3 min-w-0 overflow-hidden">
          <button onClick={() => navigate('/privacy-policy')} className="hover:text-white/70 whitespace-nowrap">Privacy</button>
          <button onClick={() => navigate('/terms-of-use')} className="hover:text-white/70 whitespace-nowrap">Terms</button>
          <button onClick={() => navigate('/vs/spotify')} className="hover:text-white/70 whitespace-nowrap hidden sm:inline">vs Spotify</button>
          <button onClick={() => navigate('/vs/bandcamp')} className="hover:text-white/70 whitespace-nowrap hidden sm:inline">vs Bandcamp</button>
          {playStoreUrl && <a href={playStoreUrl} target="_blank" rel="noopener noreferrer" className="hover:text-white/70 whitespace-nowrap">Google Play</a>}
          {appStoreUrl && <a href={appStoreUrl} target="_blank" rel="noopener noreferrer" className="hover:text-white/70 whitespace-nowrap">App Store</a>}
        </div>
        <span className="whitespace-nowrap text-white/20">© 2026 Project Feelz</span>
      </div>
    </div>
  );
}