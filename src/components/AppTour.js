import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../supabaseClient';
import ArtistFollowPrompt from './ArtistFollowPrompt';
import ArtistWelcomeTour from './ArtistWelcomeTour';
import ListenerWelcomeTour from './ListenerWelcomeTour';
import { ArrowRight, Check, Loader } from 'lucide-react';

// ─────────────────────────────────────────────────────────────────────────────
// useTourState — called by AppLayout
// Returns { show, dismiss } after auth loads
// Persists completion in localStorage, keyed by user id
// ─────────────────────────────────────────────────────────────────────────────
export function useTourState(isArtist, ready) {
  const { user } = useAuth();
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (!ready || !user?.id) return;
    const key = `feelz_tour_done_${user.id}`;
    const done = localStorage.getItem(key);
    if (!done) setShow(true);
  }, [ready, user?.id]);

  const dismiss = useCallback(() => {
    if (user?.id) {
      localStorage.setItem(`feelz_tour_done_${user.id}`, '1');
    }
    setShow(false);
  }, [user?.id]);

  return { show, dismiss };
}

// ─────────────────────────────────────────────────────────────────────────────
// Tour steps
// ─────────────────────────────────────────────────────────────────────────────
const STEP_ROLE    = 'role';
const STEP_FOLLOW  = 'follow';
const STEP_WELCOME = 'welcome';

const ROLES = [
  {
    id:    'listener',
    emoji: '🎧',
    label: 'Listener',
    sub:   'Discover music, follow artists & support independents',
    color: '#a855f7',
    glow:  'rgba(168,85,247,0.18)',
  },
  {
    id:    'artist',
    emoji: '🎤',
    label: 'Artist',
    sub:   'Release music, build your audience & monetise your art',
    color: '#22d3ee',
    glow:  'rgba(34,211,238,0.15)',
  },
  {
    id:    'beatmaker',
    emoji: '🎛️',
    label: 'Beat Maker',
    sub:   'Upload beats, license your productions & collab with vocalists',
    color: '#f472b6',
    glow:  'rgba(244,114,182,0.15)',
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// RoleCard
// ─────────────────────────────────────────────────────────────────────────────
function RoleCard({ role, selected, onSelect }) {
  return (
    <button
      onClick={() => onSelect(role.id)}
      className="w-full text-left flex items-center space-x-4 px-4 py-4 rounded-2xl border transition-all duration-200 active:scale-[0.98]"
      style={{
        borderColor:     selected ? role.color + '55' : 'rgba(255,255,255,0.07)',
        backgroundColor: selected ? role.color + '10' : 'rgba(255,255,255,0.02)',
      }}
    >
      <div
        className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl flex-shrink-0"
        style={{ backgroundColor: role.color + (selected ? '22' : '10') }}
      >
        {role.emoji}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-bold text-white leading-tight">{role.label}</p>
        <p className="text-xs text-white/40 leading-snug mt-0.5">{role.sub}</p>
      </div>
      <div
        className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 transition-all duration-200"
        style={{
          backgroundColor: selected ? role.color : 'rgba(255,255,255,0.06)',
          transform:        selected ? 'scale(1)' : 'scale(0.85)',
        }}
      >
        {selected && <Check className="w-3.5 h-3.5 text-white" strokeWidth={3} />}
      </div>
    </button>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// RoleStep — first screen
// ─────────────────────────────────────────────────────────────────────────────
function RoleStep({ onContinue }) {
  const [selected, setSelected] = useState(null);
  const [saving,   setSaving]   = useState(false);
  const { user, artist, listener } = useAuth();

  // Pre-select if profile already exists
  useEffect(() => {
    if (artist?.role === 'beatmaker') { setSelected('beatmaker'); return; }
    if (artist)   { setSelected('artist');   return; }
    if (listener) { setSelected('listener'); return; }
  }, [artist, listener]);

  const selectedRole = ROLES.find(r => r.id === selected);

  const handleContinue = async () => {
    if (!selected || saving) return;
    setSaving(true);
    try {
      if (selected === 'listener') {
        if (!listener) {
          const displayName =
            user.user_metadata?.full_name ||
            user.user_metadata?.name ||
            user.email?.split('@')[0] ||
            'Listener';
          await supabase.from('listeners').upsert(
            { user_id: user.id, display_name: displayName, updated_at: new Date().toISOString() },
            { onConflict: 'user_id' }
          );
        }
      } else {
        // artist or beatmaker
        if (artist?.id) {
          await supabase
            .from('artists')
            .update({ role: selected === 'beatmaker' ? 'beatmaker' : 'artist' })
            .eq('id', artist.id);
        }
      }
    } catch (err) {
      console.warn('Tour role save:', err);
    }
    setSaving(false);
    onContinue(selected);
  };

  const glowColor = selectedRole?.glow || 'rgba(168,85,247,0.12)';

  return (
    <div className="fixed inset-0 z-[500] flex flex-col bg-black overflow-hidden">
      {/* Ambient glow */}
      <div
        className="absolute inset-0 pointer-events-none transition-all duration-700"
        style={{
          background: `radial-gradient(ellipse 90% 55% at 50% 0%, ${glowColor}, transparent 65%)`,
        }}
      />

      <div className="relative z-10 flex flex-col flex-1 px-6 pt-16 pb-8 max-w-md mx-auto w-full">

        {/* Wordmark */}
        <div className="flex items-center space-x-2 mb-10">
          <div className="w-8 h-8 rounded-lg bg-purple-500/20 border border-purple-500/30 flex items-center justify-center text-base">
            🎵
          </div>
          <span className="text-sm font-bold text-white/60 tracking-wide uppercase">Feelz Machine</span>
        </div>

        {/* Headline */}
        <div className="mb-8">
          <h1 className="text-[30px] font-black text-white leading-[1.1] mb-3">
            How are you<br />here today?
          </h1>
          <p className="text-sm text-white/40 leading-relaxed">
            Pick the role that fits best — you can always change it later in Settings.
          </p>
        </div>

        {/* Role cards */}
        <div className="flex-1 flex flex-col space-y-3">
          {ROLES.map(role => (
            <RoleCard
              key={role.id}
              role={role}
              selected={selected === role.id}
              onSelect={setSelected}
            />
          ))}
        </div>

        {/* CTA */}
        <div className="mt-8">
          <button
            onClick={handleContinue}
            disabled={!selected || saving}
            className="w-full h-14 rounded-2xl font-bold text-base flex items-center justify-center space-x-2 transition-all duration-200 active:scale-[0.98]"
            style={{
              backgroundColor: selected ? (selectedRole?.color || '#a855f7') : 'rgba(255,255,255,0.06)',
              color:           selected ? '#fff' : 'rgba(255,255,255,0.2)',
              cursor:          selected ? 'pointer' : 'not-allowed',
            }}
          >
            {saving ? (
              <Loader className="w-5 h-5 animate-spin" />
            ) : (
              <>
                <span>Continue</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// AppTour — orchestrates the full onboarding flow
//
//   All roles:   ROLE → FOLLOW (genre + artists) → WELCOME → onDone
//
//   Listener  → ListenerWelcomeTour → lands on ForYou (/)
//   Artist    → ArtistWelcomeTour  → lands on /hub
//   Beatmaker → ArtistWelcomeTour  → lands on /hub
// ─────────────────────────────────────────────────────────────────────────────
export default function AppTour({ isArtist, isBeatmaker, onDone }) {
  const [step,       setStep] = useState(STEP_ROLE);
  const [chosenRole, setRole] = useState(null);
  const { user, artist, listener } = useAuth();
  const navigate = useNavigate();

  const displayName =
    artist?.artist_name ||
    listener?.display_name ||
    user?.user_metadata?.full_name ||
    user?.user_metadata?.name ||
    user?.email?.split('@')[0] ||
    null;

  const handleRoleDone = (role) => {
    setRole(role);
    setStep(STEP_FOLLOW);
  };

  const handleFollowDone = () => {
    setStep(STEP_WELCOME);
  };

  const handleWelcomeDone = () => {
    onDone();
    if (chosenRole !== 'listener') {
      navigate('/hub');
    }
    // Listeners stay on / (ForYouPage)
  };

  if (step === STEP_ROLE) {
    return <RoleStep onContinue={handleRoleDone} />;
  }

  if (step === STEP_FOLLOW) {
    return <ArtistFollowPrompt onDone={handleFollowDone} />;
  }

  if (step === STEP_WELCOME) {
    if (chosenRole === 'listener') {
      return <ListenerWelcomeTour displayName={displayName} onDone={handleWelcomeDone} />;
    }
    return <ArtistWelcomeTour artistName={displayName} onDone={handleWelcomeDone} />;
  }

  return null;
}