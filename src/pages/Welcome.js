// src/pages/Welcome.js
//
// The first five minutes, for all three kinds of account.
//
// WHY THIS EXISTS
//
// There was no onboarding at all. Whoever you were, you signed in and were
// dropped either into a feed that knew nothing about you, or onto /setup, which
// is a settings page. A settings page is a wall of fields. It asks you to give
// things to a platform you have not decided you trust yet, and it never says
// what any of it is for.
//
// WHY ONE FILE AND NOT THREE
//
// A listener, an artist and a beatmaker need different questions, but they need
// the same shape: a few short steps, one job each, a plain sentence saying what
// the answer buys you, and a way out at every point. Three files would be that
// shape copied three times, and within a month they would have drifted, the way
// /setup and /profile did.
//
// So the shape lives here once and the questions are data. Adding a fourth kind
// of account later is a new entry in FLOWS, not a new page.
//
// WHERE IT WRITES
//
//   listener            user_profiles  (name, avatar, genre_preferences, mood)
//                       listeners      (display_name, avatar_url)
//   artist / beatmaker  artists        (artist_name, bio, genre, slug, avatar)
//                       user_profiles  (mirrored, the listener side of the app
//                                       reads it for comments and guestbooks)
//
// The mirror is not a nicety. ProfileSetup does the same thing, because an
// artist is also a listener everywhere outside their own dashboard, and a
// missing user_profiles row is why some people show as "Listener" in their own
// comment threads.
//
// NOTHING HERE IS REQUIRED. Skip is on every step, at full weight. A person who
// skips the lot lands exactly where they would have landed before this existed.

import React, { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { useAuth } from '../contexts/AuthContext';
import { generateSlug, getUniqueSlug } from '../utils/artistSlug';
import { Camera, Check, Loader, ArrowRight, ArrowLeft, Sparkles, Upload } from 'lucide-react';

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

// ── The three flows ──────────────────────────────────────────────────────────
//
// `kind` is what the step renders. `label` is the progress bar's name for it.
// The copy is the part that matters: every step says what the answer is FOR, in
// one line, because "why are you asking me this" is the reason people abandon
// onboarding.
const FLOWS = {
  listener: {
    eyebrow: 'Welcome',
    done: 'Start listening',
    doneTo: '/',
    steps: [
      { kind: 'name',   label: 'Name',
        title: 'What should we call you?',
        blurb: 'This is the name artists see when you comment on their music. You can change it whenever you like.',
        placeholder: 'Your name' },
      { kind: 'photo',  label: 'Photo',
        title: 'Add a photo',
        blurb: 'Optional. A comment from a face gets a reply more often than a comment from a letter.' },
      { kind: 'genres', label: 'Sounds',
        title: 'What do you listen to?',
        blurb: 'Pick as many as you like. This is what your feed starts from, before it learns anything from what you play.' },
      { kind: 'mood',   label: 'Mood',
        title: 'And how do you like it to feel?',
        blurb: 'One is enough. Two songs in the same genre can be completely different moods, and this is how we tell them apart.' },
    ],
  },

  artist: {
    eyebrow: 'Set up your page',
    done: 'Go to my page',
    doneTo: '/setup',
    steps: [
      { kind: 'name',   label: 'Name',
        title: 'What name do you release under?',
        blurb: 'This is the name on your songs and on your page, and it makes your link. Get it right now and the link never has to change.',
        placeholder: 'Your artist name' },
      { kind: 'photo',  label: 'Photo',
        title: 'Put a face to the name',
        blurb: 'This is the picture on your page and on every link you share. A page with no picture is the one people scroll past.' },
      { kind: 'genres', label: 'Sound',
        title: 'What do you make?',
        blurb: 'This is how you get found in Browse, and how the feed knows who to play you to.' },
      { kind: 'bio',    label: 'Bio',
        title: 'Say something about yourself',
        blurb: 'Three lines is plenty. It shows on your page and under your name when somebody shares you.',
        placeholder: 'Where you are from, what you make, what you are working on...' },
      { kind: 'outro',  label: 'Done',
        title: 'That is your page done',
        blurb: 'Next is the part that matters. Upload a song, add your cover art, and it is live.',
        cta: 'Upload a track', ctaTo: '/dashboard?tab=upload' },
    ],
  },

  beatmaker: {
    eyebrow: 'Set up your page',
    done: 'Go to my page',
    doneTo: '/setup',
    steps: [
      { kind: 'name',   label: 'Name',
        title: 'What do you produce under?',
        blurb: 'This is the name buyers credit on their releases, and it makes your link.',
        placeholder: 'Your producer name' },
      { kind: 'photo',  label: 'Photo',
        title: 'Put a face to the name',
        blurb: 'This is the picture on your page and on every beat you share.' },
      { kind: 'genres', label: 'Sound',
        title: 'What do you make beats in?',
        blurb: 'This is how artists looking for your sound find you in Browse.' },
      { kind: 'bio',    label: 'Bio',
        title: 'Say something about yourself',
        blurb: 'Three lines is plenty. Who you have worked with is worth more here than anything else.',
        placeholder: 'What you make, who you have produced for...' },
      { kind: 'outro',  label: 'Done',
        title: 'That is your page done',
        blurb: 'Next, upload a beat and set your licence prices. Buyers pick which licence they want, so you only set them once.',
        cta: 'Upload a beat', ctaTo: '/dashboard?tab=upload' },
    ],
  },
};

function Pill({ label, on, onClick }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={on}
      className="px-3.5 py-2 rounded-full text-[13px] font-medium transition active:scale-95"
      style={on
        ? { background: 'rgba(140,171,46,0.16)', color: '#c7e06a', border: '1px solid rgba(140,171,46,0.45)' }
        : { background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.55)', border: '1px solid rgba(255,255,255,0.08)' }}>
      {label}
    </button>
  );
}

export default function Welcome() {
  const navigate = useNavigate();
  const { user, artist, listener } = useAuth();

  // Which flow. The artist row is the truth once it exists; before that, the
  // choice made at sign-up is all we have. AuthContext clears that key the
  // moment it uses it, so if it is still set the row has not been made yet.
  let pendingRole = null;
  try { pendingRole = localStorage.getItem('pending_creator_role'); } catch {}
  const role = artist?.role === 'beatmaker' || pendingRole === 'beatmaker' ? 'beatmaker'
             : artist || pendingRole === 'artist' ? 'artist'
             : 'listener';
  const flow = FLOWS[role];

  const [step, setStep] = useState(0);
  const [name, setName] = useState(artist?.artist_name || listener?.display_name || '');
  const [bio, setBio]   = useState(artist?.bio || '');
  const [avatarFile, setAvatarFile]       = useState(null);
  const [avatarPreview, setAvatarPreview] = useState('');
  const [genres, setGenres] = useState([]);
  const [mood, setMood]     = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState('');
  const fileRef = useRef(null);

  const current = flow.steps[step];
  const isLast  = step === flow.steps.length - 1;

  const toggleGenre = (g) => setGenres(p => p.includes(g) ? p.filter(x => x !== g) : [...p, g]);

  const pickAvatar = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setAvatarFile(f);
    setAvatarPreview(URL.createObjectURL(f));
  };

  // Everything saves once, at the end.
  //
  // Saving per step would leave anyone who closes the tab halfway half set up,
  // and would put a network wait between them and the next screen four or five
  // times over. The answers are cheap to hold; a stall between taps is what
  // makes an app feel slow.
  const finish = async ({ silent = false, goTo = null } = {}) => {
    if (!user) { navigate('/'); return; }
    setSaving(true);
    setError('');
    try {
      let avatarUrl = null;
      if (avatarFile) {
        const ext  = (avatarFile.name.split('.').pop() || 'jpg').toLowerCase();
        const path = `${user.id}/${Date.now()}.${ext}`;
        const bucket = role === 'listener' ? 'profile-images' : 'artist-images';
        const { error: upErr } = await supabase.storage
          .from(bucket).upload(path, avatarFile, { contentType: avatarFile.type, upsert: true });
        // A picture that will not upload is not a reason to lose the answers.
        if (!upErr) {
          const { data } = supabase.storage.from(bucket).getPublicUrl(path);
          avatarUrl = data?.publicUrl || null;
        }
      }

      const finalName = name.trim()
        || artist?.artist_name || listener?.display_name
        || user.email?.split('@')[0] || null;

      if (role === 'listener') {
        await supabase.from('user_profiles').upsert({
          user_id: user.id, name: finalName,
          genre: genres[0] || null, genre_preferences: genres, mood: mood || null,
          ...(avatarUrl ? { avatar_url: avatarUrl } : {}),
          updated_at: new Date().toISOString(),
        }, { onConflict: 'user_id' });

        await supabase.from('listeners').update({
          display_name: finalName,
          ...(avatarUrl ? { avatar_url: avatarUrl } : {}),
          updated_at: new Date().toISOString(),
        }).eq('user_id', user.id);
      } else if (artist?.id) {
        const update = {
          artist_name: finalName,
          bio: bio.trim() || null,
          genre: genres[0] || null,
          role,
          role_confirmed: true,
          ...(avatarUrl ? { profile_image_url: avatarUrl } : {}),
          updated_at: new Date().toISOString(),
        };
        // The slug is the link. Made from the name they just chose, and only
        // when there isn't one or the name has changed, so an artist who has
        // already shared a link does not have it moved under them.
        if (!artist.slug || finalName !== artist.artist_name) {
          const base = generateSlug(finalName || '');
          if (base) update.slug = await getUniqueSlug(base, artist.id);
        }
        await supabase.from('artists').update(update).eq('id', artist.id);

        // Mirrored, same as ProfileSetup does. An artist is a listener
        // everywhere outside their own dashboard.
        await supabase.from('user_profiles').upsert({
          user_id: user.id, name: finalName, bio: bio.trim() || null,
          genre: genres[0] || null, genre_preferences: genres,
          ...(avatarUrl ? { avatar_url: avatarUrl } : {}),
          updated_at: new Date().toISOString(),
        }, { onConflict: 'user_id' });
      }
    } catch {
      if (!silent) {
        setError('That did not save. You can set it in your profile instead.');
        setSaving(false);
        return;
      }
    }
    // Remembered locally as well as in the database, so this never reappears
    // because of a slow query. markWelcomeSeen is what the guard reads.
    markWelcomeSeen();
    navigate(goTo || flow.doneTo, { replace: true });
  };

  const skipAll = () => finish({ silent: true });
  const next    = () => (isLast ? finish() : setStep(s => s + 1));
  const back    = () => setStep(s => Math.max(0, s - 1));

  return (
    <div className="min-h-screen bg-black text-white flex flex-col">
      <div className="flex-shrink-0 px-6 pt-6">
        {/* Bars, not "step 2 of 5". They say the same thing and nobody has to
            read them. */}
        <div className="flex items-center gap-1.5 mb-6">
          {flow.steps.map((s, i) => (
            <div key={s.label} className="flex-1 h-1 rounded-full transition-colors duration-300"
              style={{ background: i <= step ? '#8CAB2E' : 'rgba(255,255,255,0.10)' }} />
          ))}
        </div>
      </div>

      <div className="flex-1 px-6 pb-6 overflow-y-auto">
        <div className={current.kind === 'genres' || current.kind === 'mood' ? 'max-w-2xl mx-auto' : 'max-w-md mx-auto'}>
          {step === 0 && (
            <div className="flex items-center gap-2 mb-2">
              <Sparkles className="w-4 h-4" style={{ color: '#8CAB2E' }} />
              <span className="text-xs font-semibold tracking-wider uppercase text-white/40">{flow.eyebrow}</span>
            </div>
          )}
          <h1 className="text-2xl font-bold mb-2">{current.title}</h1>
          <p className="text-sm text-white/40 mb-6 leading-relaxed">{current.blurb}</p>

          {current.kind === 'name' && (
            <input value={name} onChange={e => setName(e.target.value)}
              placeholder={current.placeholder} maxLength={50} autoFocus
              className="w-full px-4 py-3.5 rounded-xl bg-white/[0.06] border border-white/[0.08] outline-none focus:border-white/25 transition" />
          )}

          {current.kind === 'bio' && (
            <>
              <textarea value={bio} onChange={e => setBio(e.target.value)}
                placeholder={current.placeholder} maxLength={300} rows={4}
                className="w-full px-4 py-3.5 rounded-xl bg-white/[0.06] border border-white/[0.08] outline-none focus:border-white/25 transition resize-none" />
              <p className="text-[11px] text-white/25 mt-1.5 text-right">{bio.length}/300</p>
            </>
          )}

          {current.kind === 'photo' && (
            <>
              <button type="button" onClick={() => fileRef.current?.click()}
                className="w-28 h-28 rounded-full overflow-hidden flex items-center justify-center mx-auto transition active:scale-95"
                style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.10)' }}>
                {avatarPreview
                  ? <img src={avatarPreview} alt="" className="w-full h-full object-cover" />
                  : <Camera className="w-7 h-7 text-white/30" />}
              </button>
              <p className="text-center text-xs text-white/25 mt-3">Tap to choose a picture</p>
              <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={pickAvatar} />
            </>
          )}

          {current.kind === 'genres' && (
            <div className="flex flex-wrap gap-2">
              {GENRES.map(g => <Pill key={g} label={g} on={genres.includes(g)} onClick={() => toggleGenre(g)} />)}
            </div>
          )}

          {current.kind === 'mood' && (
            <div className="flex flex-wrap gap-2">
              {MOODS.map(m => <Pill key={m} label={m} on={mood === m} onClick={() => setMood(mood === m ? '' : m)} />)}
            </div>
          )}

          {current.kind === 'outro' && (
            <button onClick={() => finish({ goTo: current.ctaTo })} disabled={saving}
              className="w-full h-12 flex items-center justify-center gap-2 rounded-xl font-semibold text-sm text-black transition active:scale-[0.98] disabled:opacity-40"
              style={{ background: '#8CAB2E' }}>
              {saving ? <Loader className="w-4 h-4 animate-spin" /> : <><Upload className="w-4 h-4" /><span>{current.cta}</span></>}
            </button>
          )}

          {error && <p className="mt-5 text-sm text-red-400 text-center">{error}</p>}
        </div>
      </div>

      {/* Skip is always visible, at the same weight it would have if it were
          the intended path. Onboarding that hides its exit is onboarding people
          resent. */}
      <div className="flex-shrink-0 px-6 pt-2" style={{ paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 32px)' }}>
        <div className="max-w-md mx-auto flex items-center gap-3">
          {step > 0 && (
            <button onClick={back} disabled={saving}
              className="w-12 h-12 flex-shrink-0 flex items-center justify-center rounded-xl bg-white/[0.06] transition active:scale-95 disabled:opacity-30">
              <ArrowLeft className="w-4 h-4 text-white/60" />
            </button>
          )}
          <button onClick={next} disabled={saving}
            className="flex-1 h-12 flex items-center justify-center gap-2 rounded-xl font-semibold text-sm transition active:scale-[0.98] disabled:opacity-40"
            style={current.kind === 'outro'
              ? { background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.75)' }
              : { background: '#8CAB2E', color: '#000' }}>
            {saving ? <Loader className="w-4 h-4 animate-spin" />
              : isLast ? <><Check className="w-4 h-4" /><span>{flow.done}</span></>
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

// ── Has this person been through it? ─────────────────────────────────────────
//
// Exported so the router and the landing page can ask without importing the
// whole page.
//
// The local flag is checked first because it is free and it is the common case.
// The database is only asked when there is no flag, which means a new device or
// a cleared browser.

const SEEN_KEY = 'fm_welcome_seen';

export function markWelcomeSeen() {
  try { localStorage.setItem(SEEN_KEY, '1'); } catch {}
}

export async function needsWelcome(user, artist) {
  if (!user) return false;
  try { if (localStorage.getItem(SEEN_KEY) === '1') return false; } catch {}
  try {
    // An artist who has named themselves has been set up, here or in /setup.
    // The auto-generated placeholder name contains a dash and six random
    // characters, so it is not evidence of anything.
    if (artist) {
      const named = artist.artist_name && artist.slug
        && !/^[a-z0-9]+-[a-z0-9]{6}$/i.test(artist.artist_name);
      if (named) { markWelcomeSeen(); return false; }
      return true;
    }
    const { data } = await supabase
      .from('user_profiles')
      .select('genre_preferences')
      .eq('user_id', user.id)
      .maybeSingle();
    const done = Array.isArray(data?.genre_preferences) && data.genre_preferences.length > 0;
    if (done) markWelcomeSeen();
    return !done;
  } catch {
    // If we cannot tell, do not interrupt anybody.
    return false;
  }
}