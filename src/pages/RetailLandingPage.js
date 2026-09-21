// src/pages/RetailLandingPage.js
// The public front door for Feelz Retail. Until now /retail went straight
// to the player, which requires a linked venue row, so anyone who wasn't
// already a set-up venue hit a dead end. This is what they see instead:
// what the product is, and a way in.
//
// Routing logic lives here rather than in the player: signed-in venues get
// sent straight through to /retail/player, everyone else sees the pitch.

import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { Store, Music, Users, Loader, ArrowRight, Check } from 'lucide-react';
import { supabase } from '../supabaseClient';
import { useAuth } from '../contexts/AuthContext';
import useRetailManifest from '../hooks/useRetailManifest';

export default function RetailLandingPage() {
  useRetailManifest();
  const navigate = useNavigate();
  const { user, isAdmin } = useAuth();
  const [checking, setChecking] = React.useState(true);
  // { priceUsd, trialDays } from retail-signup. A null price means self-serve
  // is off and the page falls back to "get in touch".
  const [pricing, setPricing] = React.useState(null);

  React.useEffect(() => {
    fetch('/.netlify/functions/retail-signup', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'pricing' }),
    }).then(r => r.json()).then(setPricing).catch(() => setPricing({ priceUsd: null, trialDays: 0 }));
  }, []);

  React.useEffect(() => {
    if (!user) { setChecking(false); return; }
    supabase.from('retail_venues').select('id').eq('user_id', user.id).maybeSingle()
      .then(({ data }) => {
        if (data) { navigate('/retail/player', { replace: true }); return; }
        setChecking(false);
      });
  }, [user, navigate]);

  const selfServe = !!pricing?.priceUsd;
  const trialDays = pricing?.trialDays || 0;

  if (checking) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <Loader className="w-5 h-5 text-white/30 animate-spin" />
      </div>
    );
  }

  const features = [
    { icon: Music, title: 'Real playlists', body: 'Pick a mood and hit play. We build and maintain them so you never think about it again.' },
    { icon: Users, title: 'Supports real artists', body: 'Half of what we receive from subscriptions, after payment fees, is split every month between the artists whose music plays in your space.' },
    { icon: Store, title: 'Ten minute setup', body: 'Works in any browser, or install it as an app. No hardware, no installation visit.' },
  ];

  const steps = selfServe ? [
    'Create a login and add your business name.',
    trialDays
      ? `Add PayPal or a card. Nothing is charged for ${trialDays} days, and you can cancel before then.`
      : 'Add PayPal or a card to start your subscription.',
    'Pick a mood playlist, hit play, and get on with your day.',
  ] : [
    'Get in touch and we agree a monthly rate that fits your venue.',
    'We set you up and send you a link to create your login.',
    'Pick a mood playlist, hit play, and get on with your day.',
  ];

  // Phones scroll as one column. From tablet width up the page is exactly one
  // screen tall with two columns: the pitch and the button on the left, what
  // you get and how it works on the right. The page is at least one screen
  // tall rather than exactly one, so on a very short laptop window it scrolls a
  // little instead of the footer landing on top of the content. The headline
  // size follows the window height as well as the width for the same reason.
  return (
    <div className="min-h-[100dvh] bg-black text-white flex flex-col">

      {/* Without these, this page inherited index.html's canonical, which points
          at the homepage, so the sitemap submitted the page for indexing while
          the page itself told Google it WAS the homepage. Google settles that by
          dropping the page: "Alternate page with proper canonical tag". */}
      {/* One Helmet, not two. This page already had a title and description,
          kept because that wording is better than anything I'd substitute,
          and what it was missing was the canonical. */}
      <Helmet>
        <title>Feelz Retail, background music for your venue</title>
        <meta name="description" content="Curated background music for stores, cafes and pubs, built entirely from independent South African artists. Half of what we receive goes back to the artists whose music plays." />
        <link rel="canonical" href="https://www.feelzmachine.com/retail" />
        <meta property="og:type" content="website" />
        <meta property="og:url" content="https://www.feelzmachine.com/retail" />
        <meta property="og:title" content="Feelz Retail, background music for your venue" />
        <meta property="og:description" content="Curated background music for stores, cafes and pubs, built entirely from independent South African artists. Half of what we receive goes back to the artists whose music plays." />
        <meta name="twitter:title" content="Feelz Retail, background music for your venue" />
        <meta name="twitter:description" content="Curated background music for stores, cafes and pubs, built entirely from independent South African artists. Half of what we receive goes back to the artists whose music plays." />
      </Helmet>

      <main className="flex-1 min-h-0 w-full max-w-6xl mx-auto px-6 md:px-10 pt-12 pb-10 md:py-6 md:grid md:grid-cols-2 md:gap-10 lg:gap-16 md:items-center">

        {/* Left: the pitch and the way in */}
        <div>
          <div className="flex items-center space-x-2.5 mb-6 md:mb-4">
            <div className="w-9 h-9 rounded-lg border border-purple-400 flex items-center justify-center">
              <span className="text-purple-400 font-bold text-sm">FM</span>
            </div>
            <div>
              <p className="text-sm font-bold">Feelz Machine</p>
              <p className="text-[10px] text-white/30 tracking-wider">MUSIC PLATFORM</p>
            </div>
          </div>

          <p className="text-purple-400 text-xs font-bold tracking-[0.2em] uppercase mb-3">Feelz Retail</p>
          <h1 className="text-4xl sm:text-5xl md:text-[clamp(1.6rem,min(3.4vw,6.5vh),3.1rem)] md:whitespace-nowrap font-black leading-tight mb-4">
            Background music<br />for your venue,<br />
            <span className="text-purple-400">done properly.</span>
          </h1>
          <p className="text-white/50 text-base md:text-sm lg:text-base leading-relaxed max-w-xl mb-8 md:mb-5">
            Curated, mood-matched playlists built entirely from independent South African artists.
            Streams to whatever device you already have behind the counter. No new hardware,
            no long contract.
          </p>

          <div className="rounded-2xl border border-purple-500/20 bg-purple-500/[0.06] p-6 md:p-5 mb-12 md:mb-0">
            {selfServe ? (
              <>
                <h2 className="text-xl font-bold mb-1.5">{trialDays ? `Try it free for ${trialDays} days` : 'Start today'}</h2>
                <p className="text-sm text-white/50 mb-4">
                  Then ${pricing.priceUsd.toFixed(2)} a month. Cancel any time and the music keeps playing
                  until the end of the month you've paid for.
                </p>
                <button onClick={() => navigate('/retail/start')}
                  className="inline-flex items-center space-x-2 px-5 py-3 rounded-xl bg-purple-500 text-white font-bold text-sm hover:bg-purple-400 transition">
                  <span>{trialDays ? 'Start my free trial' : 'Get started'}</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </>
            ) : (
              <>
                <h2 className="text-xl font-bold mb-1.5">Interested in your venue?</h2>
                <p className="text-sm text-white/50 mb-4">
                  Get in touch and we'll tell you what it costs for your venue.
                </p>
                <a href="mailto:jane@projectfeelz.com?subject=Feelz%20Retail%20enquiry"
                  className="inline-flex items-center space-x-2 px-5 py-3 rounded-xl bg-purple-500 text-white font-bold text-sm hover:bg-purple-400 transition">
                  <span>Get in touch</span>
                  <ArrowRight className="w-4 h-4" />
                </a>
              </>
            )}
          </div>
        </div>

        {/* Right: what you get, how it works */}
        <div>
          <div className="space-y-3 mb-10 md:mb-8">
            {features.map(({ icon: Icon, title, body }) => (
              <div key={title} className="flex items-start space-x-4 rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4 lg:p-5">
                <Icon className="w-5 h-5 text-purple-400 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold text-sm mb-1">{title}</p>
                  <p className="text-xs text-white/40 leading-relaxed">{body}</p>
                </div>
              </div>
            ))}
          </div>

          <p className="text-[10px] uppercase tracking-widest text-white/25 font-semibold mb-3">How it works</p>
          <div className="space-y-2.5">
            {steps.map((step, i) => (
              <div key={i} className="flex items-start space-x-3">
                <div className="w-6 h-6 rounded-full bg-purple-500/15 text-purple-300 text-xs font-bold flex items-center justify-center flex-shrink-0">
                  {i + 1}
                </div>
                <p className="text-sm text-white/60 leading-relaxed">{step}</p>
              </div>
            ))}
          </div>
        </div>
      </main>

      {/* Footer: legal links and the way back in for existing venues */}
      <footer className="w-full max-w-6xl mx-auto px-6 md:px-10 py-5 md:py-4 border-t border-white/[0.06] flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div className="flex items-center space-x-4">
          <button onClick={() => navigate('/retail/terms')} className="text-xs text-white/30 hover:text-white/60 transition underline whitespace-nowrap">Terms of Service</button>
          <button onClick={() => navigate('/retail/privacy')} className="text-xs text-white/30 hover:text-white/60 transition underline whitespace-nowrap">Privacy Notice</button>
        </div>
        {user ? (
          <p className="text-xs text-white/35 leading-relaxed flex items-start md:max-w-xl">
            <Check className="w-3.5 h-3.5 text-white/25 flex-shrink-0 mt-0.5 mr-2" />
            <span>
              This account isn't linked to a venue yet. Been set up already? Use your invite link.
              {selfServe ? ' Otherwise start your trial above.' : " Or get in touch and we'll sort it out."}
              {isAdmin && (
                <>
                  {' '}
                  <button onClick={() => navigate('/retail/player')} className="text-purple-400 hover:text-purple-300 underline">
                    Open the player as an admin
                  </button>
                  .
                </>
              )}
            </span>
          </p>
        ) : (
          <p className="text-xs text-white/35">
            Already set up as a venue?{' '}
            <button onClick={() => navigate('/login?redirect=/retail')} className="text-purple-400 hover:text-purple-300 underline">
              Sign in
            </button>
            .
          </p>
        )}
      </footer>
    </div>
  );
}