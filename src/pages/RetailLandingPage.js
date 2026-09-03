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

export default function RetailLandingPage() {
  const navigate = useNavigate();
  const { user, isAdmin } = useAuth();
  const [checking, setChecking] = React.useState(true);

  React.useEffect(() => {
    if (!user) { setChecking(false); return; }
    supabase.from('retail_venues').select('id').eq('user_id', user.id).maybeSingle()
      .then(({ data }) => {
        if (data) { navigate('/retail/player', { replace: true }); return; }
        setChecking(false);
      });
  }, [user, navigate]);

  if (checking) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <Loader className="w-5 h-5 text-white/30 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-white">
      <Helmet>
        <title>Feelz Retail, background music for your venue</title>
        <meta name="description" content="Curated background music for stores, cafes and pubs, built entirely from independent South African artists. Half of what you pay goes back to the artists whose music plays." />
      </Helmet>

      <div className="max-w-4xl mx-auto px-6 pt-16 pb-24">
        {/* Hero */}
        <div className="flex items-center space-x-2.5 mb-6">
          <div className="w-9 h-9 rounded-lg border border-purple-400 flex items-center justify-center">
            <span className="text-purple-400 font-bold text-sm">FM</span>
          </div>
          <div>
            <p className="text-sm font-bold">Feelz Machine</p>
            <p className="text-[10px] text-white/30 tracking-wider">MUSIC PLATFORM</p>
          </div>
        </div>

        <p className="text-purple-400 text-xs font-bold tracking-[0.2em] uppercase mb-3">Feelz Retail</p>
        <h1 className="text-4xl sm:text-5xl font-black leading-tight mb-5">
          Background music<br />for your venue,<br />
          <span className="text-purple-400">done properly.</span>
        </h1>
        <p className="text-white/50 text-base leading-relaxed max-w-xl mb-10">
          Curated, mood-matched playlists built entirely from independent South African artists.
          Streams to whatever device you already have behind the counter. No new hardware,
          no long contract.
        </p>

        {/* What you get */}
        <div className="grid sm:grid-cols-3 gap-4 mb-12">
          {[
            { icon: Music, title: 'Real playlists', body: 'Pick a mood and hit play. We build and maintain them so you never think about it again.' },
            { icon: Users, title: 'Supports real artists', body: 'Half of what you pay is pooled and split with the artists whose music actually plays in your space.' },
            { icon: Store, title: 'Ten minute setup', body: 'Works in any browser, or install it as an app. No hardware, no installation visit.' },
          ].map(({ icon: Icon, title, body }) => (
            <div key={title} className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-5">
              <Icon className="w-5 h-5 text-purple-400 mb-3" />
              <p className="font-semibold text-sm mb-1.5">{title}</p>
              <p className="text-xs text-white/40 leading-relaxed">{body}</p>
            </div>
          ))}
        </div>

        {/* How it works */}
        <p className="text-[10px] uppercase tracking-widest text-white/25 font-semibold mb-4">How it works</p>
        <div className="space-y-3 mb-12">
          {[
            'Get in touch and we agree a monthly rate that fits your venue.',
            'We set you up and send you a link to create your login.',
            'Pick a mood playlist, hit play, and get on with your day.',
          ].map((step, i) => (
            <div key={i} className="flex items-start space-x-3">
              <div className="w-6 h-6 rounded-full bg-purple-500/15 text-purple-300 text-xs font-bold flex items-center justify-center flex-shrink-0 mt-0.5">
                {i + 1}
              </div>
              <p className="text-sm text-white/60 leading-relaxed">{step}</p>
            </div>
          ))}
        </div>

        {/* CTA */}
        <div className="rounded-2xl border border-purple-500/20 bg-purple-500/[0.06] p-6 sm:p-8">
          <h2 className="text-xl font-bold mb-2">Interested in your venue?</h2>
          <p className="text-sm text-white/50 mb-5 max-w-lg">
            Pricing is worked out per venue rather than a fixed rate card, so the quickest way to
            find out what it'd cost you is just to ask.
          </p>
          <a href="mailto:jane@projectfeelz.com?subject=Feelz%20Retail%20enquiry"
            className="inline-flex items-center space-x-2 px-5 py-3 rounded-xl bg-purple-500 text-white font-bold text-sm hover:bg-purple-400 transition">
            <span>Get in touch</span>
            <ArrowRight className="w-4 h-4" />
          </a>
        </div>

        {/* Already a venue */}
        <div className="mt-10 pt-8 border-t border-white/[0.06]">
          {user ? (
            <div className="flex items-start space-x-2.5">
              <Check className="w-4 h-4 text-white/25 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-white/35 leading-relaxed">
                You're signed in, but this account isn't linked to a venue yet. If you've been set up
                already, use the invite link that was sent to you, or get in touch and we'll sort it out.
                {isAdmin && (
                  <>
                    {' '}
                    <button onClick={() => navigate('/retail/player')} className="text-purple-400 hover:text-purple-300 underline">
                      Open the player as an admin
                    </button>
                    .
                  </>
                )}
              </p>
            </div>
          ) : (
            <p className="text-xs text-white/35">
              Already set up as a venue?{' '}
              <button onClick={() => navigate('/login?redirect=/retail')} className="text-purple-400 hover:text-purple-300 underline">
                Sign in
              </button>
              .
            </p>
          )}
        </div>
      </div>
    </div>
  );
}