// src/pages/ListenerWelcome.js
//
// The listener's first five minutes.
//
// WHY THIS EXISTS
//
// There was no onboarding. A new listener signed in and arrived at For You with
// a name taken from the front of their email address, no picture, and nothing
// on record about what they like. Everything the app knows about taste it
// learns from listening, so the first session, the one that decides whether
// somebody comes back, was the worst the feed would ever be.
//
// The settings page was not an answer to that. /profile/edit is a form. A form
// asks you to give things to a platform you have not decided you trust yet, and
// it does not say what any of it is for.
//
// So this is four short steps, each doing one thing, each saying plainly what
// it buys you, and every one of them skippable. Nothing here is required. A
// person who taps Skip four times lands exactly where they would have landed
// before, and nothing is worse for it.
//
// WHERE IT WRITES
//
// Two tables, because that is how the app is built, not because it should be.
//
//   listeners.display_name    what the app shows you as
//   user_profiles             name, avatar, genre_preferences, mood
//
// user_profiles is what HomePage reads to pick recommendations, so the taste
// steps are the ones that change what happens next. The name and picture are
// for other people, in comments and guestbooks.

import React, { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { useAuth } from '../contexts/AuthContext';
import { Camera, Check, Loader, ArrowRight, ArrowLeft, Sparkles, User } from 'lucide-react';

// Same lists as the profile editor. If those change, these have to change with
// them, so they are worth keeping in one place the day somebody edits either.
const GENRES = [
  'Hip Hop','Trap','Drill','Boom Bap','Lo-Fi','R&B','Neo Soul','Pop',
  'Electronic','House','Deep House','Tech House','Techno','Dubstep',
  'Drum & Bass','Ambient','Downtempo','Future Bass','Jersey Club',
  'Jazz','Funk','Soul','Rock','Metal','Indie','Alternative',
  'Afrobeat','Amapiano','Reggae','Dancehall','Latin','Reggaeton',
  'Country','EDM','Trance','Hardstyle','UK Garage','Grime',
  'Experimental','Vaporwave','Synthwave','Other',
];

const MOODS = [
  'Dark','Happy','Sad','Aggressive','Chill','Energetic','Melancholic',
  'Uplifting','Mysterious','Peaceful','Intense','Dreamy','Romantic',
  'Angry','Hopeful','Nostalgic','Epic','Smooth','Bouncy','Atmospheric',
  'Moody','Vibey','Hard','Soft','Ethereal','Groovy','Other',
];

const STEPS = ['Name', 'Photo', 'Sounds', 'Mood'];

function Pill({ label, on, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className="px-3.5 py-2 rounded-full text-[13px] font-medium transition active:scale-95"
      style={on
        ? { background: 'rgba(140,171,46,0.16)', color: '#c7e06a', border: '1px solid rgba(140,171,46,0.45)' }
        : { background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.55)', border: '1px solid rgba(255,255,255,0.08)' }}
    >
      {label}
    </button>
  );
}

export default function ListenerWelcome() {
  const navigate = useNavigate();
  const { user, listener } = useAuth();

  const [step, setStep]         = useState(0);
  const [name, setName]         = useState(listener?.display_name || '');
  const [avatarFile, setAvatarFile]       = useState(null);
  const [avatarPreview, setAvatarPreview] = useState('');
  const [genres, setGenres]     = useState([]);
  const [mood, setMood]         = useState('');
  const [saving, setSaving]     = useState(false);
  const [error, setError]       = useState('');
  const fileRef = useRef(null);

  const toggleGenre = (g) =>
    setGenres(prev => prev.includes(g) ? prev.filter(x => x !== g) : [...prev, g]);

  const pickAvatar = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setAvatarFile(f);
    setAvatarPreview(URL.createObjectURL(f));
  };

  // Saving is deliberately all at the end, in one go.
  //
  // Writing after each step would mean a person who closes the tab halfway is
  // left half set up, and it would put a network call between them and the next
  // screen four times over. The steps are cheap to hold in memory; a stall
  // between taps is what makes something feel slow.
  const finish = async ({ silent = false } = {}) => {
    if (!user) { navigate('/'); return; }
    setSaving(true);
    setError('');
    try {
      let avatarUrl = null;
      if (avatarFile) {
        const ext  = (avatarFile.name.split('.').pop() || 'jpg').toLowerCase();
        const path = `${user.id}/${Date.now()}.${ext}`;
        const { error: upErr } = await supabase.storage
          .from('profile-images')
          .upload(path, avatarFile, { contentType: avatarFile.type, upsert: true });
        // A picture that will not upload is not a reason to lose the rest. The
        // person still gets their name and their taste saved.
        if (!upErr) {
          const { data } = supabase.storage.from('profile-images').getPublicUrl(path);
          avatarUrl = data?.publicUrl || null;
        }
      }

      const finalName = name.trim() || listener?.display_name || user.email?.split('@')[0] || null;

      await supabase.from('user_profiles').upsert({
        user_id:           user.id,
        name:              finalName,
        genre:             genres[0] || null,   // the old single column, kept in step
        genre_preferences: genres,
        mood:              mood || null,
        ...(avatarUrl ? { avatar_url: avatarUrl } : {}),
        updated_at:        new Date().toISOString(),
      }, { onConflict: 'user_id' });

      await supabase.from('listeners').update({
        display_name: finalName,
        ...(avatarUrl ? { avatar_url: avatarUrl } : {}),
        updated_at:   new Date().toISOString(),
      }).eq('user_id', user.id);

      if (avatarUrl) {
        try { await supabase.auth.updateUser({ data: { avatar_url: avatarUrl } }); } catch {}
      }
    } catch (e) {
      // Never trap anybody in onboarding. If the save fails on the last step we
      // say so once; if they were skipping anyway we let them go.
      if (!silent) { setError('That did not save. You can set it later in your profile.'); setSaving(false); return; }
    }
    // Remembered so the wizard does not reappear on the next load, whatever the
    // database says. The guard reads this too.
    try { localStorage.setItem('fm_listener_welcomed', '1'); } catch {}
    navigate('/', { replace: true });
  };

  const skipAll = () => finish({ silent: true });
  const next = () => (step === STEPS.length - 1 ? finish() : setStep(s => s + 1));
  const back = () => setStep(s => Math.max(0, s - 1));

  return (
    <div className="min-h-screen bg-black text-white flex flex-col">
      {/* Progress. Four thin bars rather than "Step 2 of 4", because the bars
          say the same thing without anybody having to read them. */}
      <div className="flex-shrink-0 px-6 pt-6">
        <div className="flex items-center gap-1.5 mb-6">
          {STEPS.map((s, i) => (
            <div key={s} className="flex-1 h-1 rounded-full transition-colors duration-300"
              style={{ background: i <= step ? '#8CAB2E' : 'rgba(255,255,255,0.10)' }} />
          ))}
        </div>
      </div>

      <div className="flex-1 px-6 pb-6 overflow-y-auto">
        {step === 0 && (
          <div className="max-w-md mx-auto">
            <div className="flex items-center gap-2 mb-2">
              <Sparkles className="w-4 h-4" style={{ color: '#8CAB2E' }} />
              <span className="text-xs font-semibold tracking-wider uppercase text-white/40">Welcome</span>
            </div>
            <h1 className="text-2xl font-bold mb-2">What should we call you?</h1>
            <p className="text-sm text-white/40 mb-6 leading-relaxed">
              This is the name artists see when you comment on their music. You can change it whenever you like.
            </p>
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Your name"
              maxLength={40}
              autoFocus
              className="w-full px-4 py-3.5 rounded-xl bg-white/[0.06] border border-white/[0.08] outline-none focus:border-white/25 transition"
            />
          </div>
        )}

        {step === 1 && (
          <div className="max-w-md mx-auto">
            <h1 className="text-2xl font-bold mb-2">Add a photo</h1>
            <p className="text-sm text-white/40 mb-6 leading-relaxed">
              Optional. A comment from a face gets a reply more often than a comment from a letter.
            </p>
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="w-28 h-28 rounded-full overflow-hidden flex items-center justify-center mx-auto transition active:scale-95"
              style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.10)' }}
            >
              {avatarPreview
                ? <img src={avatarPreview} alt="" className="w-full h-full object-cover" />
                : <Camera className="w-7 h-7 text-white/30" />}
            </button>
            <p className="text-center text-xs text-white/25 mt-3">Tap to choose a picture</p>
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={pickAvatar} />
          </div>
        )}

        {step === 2 && (
          <div className="max-w-2xl mx-auto">
            <h1 className="text-2xl font-bold mb-2">What do you listen to?</h1>
            <p className="text-sm text-white/40 mb-6 leading-relaxed">
              Pick as many as you like. This is what your feed starts from, before it learns anything from what you play.
            </p>
            <div className="flex flex-wrap gap-2">
              {GENRES.map(g => <Pill key={g} label={g} on={genres.includes(g)} onClick={() => toggleGenre(g)} />)}
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="max-w-2xl mx-auto">
            <h1 className="text-2xl font-bold mb-2">And how do you like it to feel?</h1>
            <p className="text-sm text-white/40 mb-6 leading-relaxed">
              One is enough. Two songs in the same genre can be completely different moods, and this is how we tell them apart.
            </p>
            <div className="flex flex-wrap gap-2">
              {MOODS.map(m => <Pill key={m} label={m} on={mood === m} onClick={() => setMood(mood === m ? '' : m)} />)}
            </div>
          </div>
        )}

        {error && <p className="max-w-md mx-auto mt-5 text-sm text-red-400 text-center">{error}</p>}
      </div>

      {/* Controls. Skip is always there, in plain sight, at the same weight as
          it would be if it were the intended path. Onboarding that hides its
          exit is onboarding people resent. */}
      <div className="flex-shrink-0 px-6 pb-8 pt-2" style={{ paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 32px)' }}>
        <div className="max-w-md mx-auto flex items-center gap-3">
          {step > 0 && (
            <button onClick={back} disabled={saving}
              className="w-12 h-12 flex-shrink-0 flex items-center justify-center rounded-xl bg-white/[0.06] transition active:scale-95 disabled:opacity-30">
              <ArrowLeft className="w-4 h-4 text-white/60" />
            </button>
          )}
          <button
            onClick={next}
            disabled={saving}
            className="flex-1 h-12 flex items-center justify-center gap-2 rounded-xl font-semibold text-sm text-black transition active:scale-[0.98] disabled:opacity-40"
            style={{ background: '#8CAB2E' }}
          >
            {saving
              ? <Loader className="w-4 h-4 animate-spin" />
              : step === STEPS.length - 1
                ? <><Check className="w-4 h-4" /><span>Start listening</span></>
                : <><span>Next</span><ArrowRight className="w-4 h-4" /></>}
          </button>
        </div>
        <div className="max-w-md mx-auto mt-3 text-center">
          <button onClick={skipAll} disabled={saving}
            className="text-xs text-white/30 hover:text-white/60 transition py-2 px-3">
            Skip, I will do this later
          </button>
        </div>
      </div>
    </div>
  );
}

// Has this person been through it?
//
// Exported so the router can ask without pulling the whole page in. The
// localStorage flag is checked first because it is free and it is the common
// case; the database is only asked when there is no flag, which is a person on
// a new device or a cleared browser.
export async function listenerNeedsWelcome(user) {
  if (!user) return false;
  try { if (localStorage.getItem('fm_listener_welcomed') === '1') return false; } catch {}
  try {
    const { data } = await supabase
      .from('user_profiles')
      .select('genre_preferences')
      .eq('user_id', user.id)
      .maybeSingle();
    // A row with taste on it means they have set themselves up, here or in the
    // profile editor. Either way there is nothing left to ask.
    const done = Array.isArray(data?.genre_preferences) && data.genre_preferences.length > 0;
    if (done) { try { localStorage.setItem('fm_listener_welcomed', '1'); } catch {} }
    return !done;
  } catch {
    // If we cannot tell, do not interrupt anybody.
    return false;
  }
}