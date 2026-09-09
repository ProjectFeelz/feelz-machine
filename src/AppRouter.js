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
// Returns { show, dismiss } after auth loads.
// Persists completion to BOTH localStorage (instant) AND user_profiles in
// Supabase (syncs across devices — phone done = PC skips tour too).
// ─────────────────────────────────────────────────────────────────────────────
export function useTourState(isArtist, ready) {
  const { user, hasProfile } = useAuth();
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (!ready || !user?.id) return;

    // An account with neither an artists row nor a listeners row cannot use
    // the app at all — AppLayout bounces it to /setup from every page, and
    // ProfileSetup can only edit a profile that already exists. So show the
    // role picker regardless of what the done flags say.
    //
    // This is what un-traps the accounts broken by the old artist branch:
    // they picked "artist", nothing was created, dismiss() recorded the tour
    // as done anyway, and the picker never came back. Checking hasProfile
    // first means it does. Anyone who already has music has an artists row by
    // definition, so they are never asked again.
    if (!hasProfile) { setShow(true); return; }

    const localKey = `feelz_tour_done_${user.id}`;

    // Fast path: localStorage already set on this device
    if (localStorage.getItem(localKey)) return;

    // Slow path: check Supabase in case they completed on another device
    const checkRemote = async () => {
      try {
        const { data, error } = await supabase
          .from('user_profiles')
          .select('onboarding_done')
          .eq('user_id', user.id)
          .maybeSingle();

        // 400 = column doesn't exist yet (migration pending) — show tour
        if (error) { setShow(true); return; }

        if (data?.onboarding_done) {
          // Already done on another device — mirror to localStorage and stay hidden
          localStorage.setItem(localKey, '1');
          return;
        }
        // Not done anywhere — show tour
        setShow(true);
      } catch {
        // If DB check fails, fall back to showing tour (safe default)
        setShow(true);
      }
    };

    checkRemote();
  }, [ready, user?.id, hasProfile]);

  const dismiss = useCallback(async () => {
    setShow(false);
    if (!user?.id) return;

    // Never record the tour as done while the account still has no profile.
    // Writing onboarding_done before a profile exists is exactly what made
    // the old trap permanent — the flag outlived the failure that caused it.
    if (!hasProfile) return;

    // 1. Instant local write so dismiss feels instant
    localStorage.setItem(`feelz_tour_done_${user.id}`, '1');

    // 2. Persist to Supabase so other devices skip the tour
    // Silently skips if onboarding_done column doesn't exist yet
    try {
      const { error } = await supabase
        .from('user_profiles')
        .upsert(
          { user_id: user.id, onboarding_done: true },
          { onConflict: 'user_id' }
        );
      if (error) console.warn('Tour sync skipped (run schema migration):', error.message);
    } catch {
      // Non-fatal — localStorage is the fallback for this device
    }
  }, [user?.id, hasProfile]);

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
  const [selected,  setSelected]  = useState(null);
  const [saving,    setSaving]    = useState(false);
  const [saveError, setSaveError] = useState('');
  const { user, artist, listener, refreshProfile } = useAuth();

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
    setSaveError('');

    try {
      if (selected === 'listener') {
        if (!listener) {
          const displayName =
            user.user_metadata?.full_name ||
            user.user_metadata?.name ||
            user.email?.split('@')[0] ||
            null;
          const { error } = await supabase.from('listeners').upsert(
            { user_id: user.id, display_name: displayName, updated_at: new Date().toISOString() },
            { onConflict: 'user_id' }
          );
          if (error) throw error;
        }
      } else if (artist?.id) {
        // Has a profile already — just record which kind of creator they are.
        const { error } = await supabase
          .from('artists')
          .update({ role: selected === 'beatmaker' ? 'beatmaker' : 'artist', role_confirmed: true })
          .eq('id', artist.id);
        if (error) throw error;
      } else {
        // No profile yet. THIS is the branch that used to do nothing at all:
        // the old code was `if (artist?.id) { update ... }` with no else, and
        // since nothing in the app has ever created an artists row, every
        // account that chose artist or beatmaker ended up with no profile and
        // was then bounced to /setup forever.
        //
        // create_my_artist_profile (migration 97) settles the globally-unique
        // artist_name and slug server-side, which the client cannot do without
        // a racy read-then-write.
        const { error } = await supabase.rpc('create_my_artist_profile', {
          p_role: selected === 'beatmaker' ? 'beatmaker' : 'artist',
        });
        if (error) throw error;
      }

      // Pull the new row into context before advancing, so hasProfile is true
      // by the time dismiss() decides whether it may record the tour as done.
      if (refreshProfile) await refreshProfile();
    } catch (err) {
      // Not swallowed. If this fails the account has no profile, and letting
      // the tour close anyway is what produced accounts nobody could rescue.
      console.error('[tour] could not save role:', err?.code, err?.message, err?.hint || '');
      setSaveError(
        err?.code === 'PGRST202' || err?.code === '42883'
          ? 'Setup is not finished on our side yet — migration 97 has not run. Nothing was lost; try again shortly.'
          : 'We could not finish setting up your account. Please try again.'
      );
      setSaving(false);
      return;
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
          {/* A failure here means the account has no profile and cannot use
              the app, so it has to be visible rather than console-only. */}
          {saveError && (
            <p className="text-xs text-red-300 mb-3 text-center px-2">{saveError}</p>
          )}

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

  // Block ForYouPage's window wheel listener from firing while tour is open.
  // ForYouPage attaches a non-passive 'wheel' listener to window — we capture
  // it first and stop it reaching the feed underneath.
  useEffect(() => {
    const block = (e) => { e.stopPropagation(); };
    window.addEventListener('wheel',      block, { capture: true, passive: false });
    window.addEventListener('touchstart', block, { capture: true, passive: false });
    window.addEventListener('touchmove',  block, { capture: true, passive: false });
    window.addEventListener('touchend',   block, { capture: true, passive: false });
    return () => {
      window.removeEventListener('wheel',      block, { capture: true });
      window.removeEventListener('touchstart', block, { capture: true });
      window.removeEventListener('touchmove',  block, { capture: true });
      window.removeEventListener('touchend',   block, { capture: true });
    };
  }, []);

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