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

import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { useAuth, pendingCreatorRole } from '../contexts/AuthContext';
import { generateSlug, getUniqueSlug } from '../utils/artistSlug';
import { Camera, Check, Loader, ArrowRight, ArrowLeft, Sparkles, Upload, Headphones, Mic2, Disc3, Users } from 'lucide-react';

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

// ── The step that stops the role being wrong ─────────────────────────────────
//
// The choice is made on the login page, and until now that was the only time
// it was ever asked. If the answer did not survive the trip from that form to
// the first signed-in page load, and for email sign-ups it frequently did not,
// the person was quietly made a listener and there was no screen anywhere that
// would have let them say otherwise.
//
// Asking again here costs one tap from somebody who is about to tap four more
// times anyway, and it means the role can never be decided by whether a
// localStorage key survived a mail client. It is only shown to accounts with no
// confirmed role, so an artist who has already been set up never sees it.
const ROLE_STEP = {
  kind: 'role', label: 'You',
  title: 'What brings you here?',
  blurb: 'This sets up the right half of the app for you. You can change it later in your profile.',
};

const ROLE_OPTIONS = [
  { k: 'listener',  Icon: Headphones, title: 'I am here to listen',
    blurb: 'A feed that learns what you play, and artists who see you in their comments.' },
  { k: 'artist',    Icon: Mic2,       title: 'I release music',
    blurb: 'Your own page and link, uploads, listener stats and payouts.' },
  { k: 'beatmaker', Icon: Disc3,      title: 'I sell beats',
    blurb: 'A beat store with licence tiers, and artists browsing for your sound.' },
];

// ── Follow ───────────────────────────────────────────────────────────────────
//
// On every flow, including the two creator ones, and that is deliberate. An
// artist arriving with nobody followed has no feed, sees no other artist
// working, and has nothing to reply to. Collaborations start with one person
// hearing another, so an empty follow list is a cold start for a creator in a
// way it is not for a listener.
const FOLLOW_STEP_LISTENER = {
  kind: 'follow', label: 'Follow',
  title: 'Follow a few artists',
  blurb: 'This is what fills your feed. Three is enough to start it off, and you can unfollow any of them later.',
};

const FOLLOW_STEP_CREATOR = {
  kind: 'follow', label: 'Follow',
  title: 'Who are you listening to?',
  blurb: 'Following the artists around you is how collaborations start. They see it, and their work starts showing in your feed.',
};

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
      FOLLOW_STEP_LISTENER,
    ],
  },

  artist: {
    eyebrow: 'Set up your page',
    done: 'Go to my page',
    doneTo: '/dashboard',
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
      FOLLOW_STEP_CREATOR,
      { kind: 'outro',  label: 'Done',
        title: 'That is your page done',
        blurb: 'Next is the part that matters. Upload a song, add your cover art, and it is live.',
        cta: 'Upload a track', ctaTo: '/dashboard?tab=upload' },
    ],
  },

  beatmaker: {
    eyebrow: 'Set up your page',
    done: 'Go to my page',
    doneTo: '/dashboard',
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
      FOLLOW_STEP_CREATOR,
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
  const { user, artist, listener, refreshProfile } = useAuth();

  // Which flow.
  //
  // THREE SOURCES, AND THE ORDER MATTERS
  //
  //   1. The person's answer on the role step below. Always wins, because it
  //      was given on this screen, seconds ago.
  //   2. The artists row, once it exists. That row IS the decision, made and
  //      recorded.
  //   3. pendingCreatorRole: the login page's choice, from localStorage if this
  //      is the same browser and from user_metadata if it is not.
  //
  // (3) used to read localStorage and nothing else, and AuthContext clears that
  // key the moment it uses it. So on an email sign-up confirmed from a mail
  // client in a different browser, the key was never written in this browser at
  // all: no artists row got created, and this line fell through to 'listener'.
  // Somebody who picked Release music got the listener flow, the listener
  // questions, and a listener account. That is the whole bug.
  //
  // pendingCreatorRole is imported rather than reimplemented so that this
  // screen and AuthContext cannot reach different answers about the same
  // person, which is how the first version of this went wrong.
  const detected = artist?.role === 'beatmaker' ? 'beatmaker'
                 : artist ? 'artist'
                 : pendingCreatorRole(user) || 'listener';

  // ALWAYS ASKED, AND THE DATA IS WHY.
  //
  // This used to be `!artist?.role_confirmed`, on the reasoning that somebody
  // whose role was already settled should not be asked again. The live rows
  // show what that actually did:
  //
  //   +t7  metadata artist, artists row, role_confirmed true
  //   +t6  metadata null,   artists row, role_confirmed true
  //   +t1  metadata null,   artists row, role_confirmed true
  //
  // AuthContext creates the artists row with role_confirmed true BEFORE this
  // screen ever renders. So by the time anybody reaches onboarding the role is
  // always settled, this was always false, the role step never appeared, and
  // `detected` fell to `artist ? 'artist'` every single time. Every account
  // got the artist flow no matter what was chosen, which is exactly what it
  // looked like from the outside.
  //
  // Asking always costs one tap on a screen somebody is already tapping
  // through, and the card for the detected role is preselected, so for anybody
  // who chose correctly it is a confirmation rather than a question. What it
  // buys is that the role can never be silently wrong in either direction: a
  // mis-tap on the login page is now recoverable, and the choice is visible
  // instead of being inferred from a row the person never sees.
  const needsRoleStep = true;

  const [picked, setPicked] = useState(null);
  const role = picked || detected;
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

  // The role question goes in front of the flow's own steps when it is needed.
  // Nothing downstream has to know about it: the progress bar, Next, Back and
  // isLast all read `steps`.
  const steps   = needsRoleStep ? [ROLE_STEP, ...flow.steps] : flow.steps;
  const safeStep = Math.min(step, steps.length - 1);
  const current = steps[safeStep];
  const isLast  = safeStep === steps.length - 1;

  // ── Follow suggestions ────────────────────────────────────────────────────
  //
  // Loaded when the step is reached, not on mount, so nobody pays for a query
  // whose screen they skip past.
  const [sugg, setSugg]               = useState([]);
  const [suggLoading, setSuggLoading] = useState(false);
  const [followed, setFollowed]       = useState({});
  const suggAsked = useRef(false);

  useEffect(() => {
    if (current?.kind !== 'follow' || suggAsked.current || !user) return;
    suggAsked.current = true;
    let dead = false;

    (async () => {
      setSuggLoading(true);

      // Through tracks, so only artists with something to actually play can be
      // suggested. Following somebody with an empty page teaches a new person
      // that following does nothing.
      //
      // Column names here are the ones src/components/ArtistFollowPrompt.js
      // already queries live, rather than a guess at the schema.
      const { data: rows, error } = await supabase
        .from('tracks')
        .select('artist_id, artists(id, user_id, artist_name, slug, profile_image_url, is_verified, genre)')
        .eq('is_published', true)
        .not('file_url', 'is', null)
        .neq('file_url', '')
        .order('stream_count', { ascending: false })
        .limit(300);

      if (error) console.warn('[welcome] follow suggestions failed:', error.message);

      const seen = new Set();
      const list = [];
      for (const r of (rows || [])) {
        const a = r.artists;
        // a.user_id, not a.id. The old prompt compared an artist id against a
        // user id, which can never match, so a creator was always offered
        // themselves to follow.
        if (!a || seen.has(a.id) || a.user_id === user.id) continue;
        seen.add(a.id);
        list.push(a);
      }

      // Genre first, then a picture, then whatever order the stream count gave
      // them. A face and a sound you said you liked are the two things that
      // make a suggestion worth tapping.
      const norm = (x) => (x || '').toLowerCase().replace(/[^a-z0-9]/g, '');
      const want = new Set(genres.map(norm));
      const score = (a) => (want.size && want.has(norm(a.genre)) ? 2 : 0)
                         + (a.profile_image_url ? 1 : 0);
      list.sort((x, y) => score(y) - score(x));

      const top = list.slice(0, 12);

      // What they already follow, so the buttons are not lying on an account
      // that has been here before.
      let already = {};
      if (top.length) {
        const { data: f } = await supabase
          .from('follows')
          .select('artist_id')
          .eq('follower_id', user.id)
          .in('artist_id', top.map(a => a.id));
        for (const row of (f || [])) already[row.artist_id] = true;
      }

      if (dead) return;
      setFollowed(p => ({ ...already, ...p }));
      setSugg(top);
      setSuggLoading(false);
    })();

    return () => { dead = true; };
  }, [current?.kind, user, genres]); // eslint-disable-line

  // Written the moment it is tapped, not held until the end.
  //
  // A follow is the one answer on this screen that is worth something on its
  // own, and somebody who taps three artists and then closes the tab should
  // keep those three. Everything else here is a field on their own profile and
  // can wait for finish().
  const toggleFollow = async (a) => {
    if (!user) return;
    const on = !!followed[a.id];
    setFollowed(p => ({ ...p, [a.id]: !on }));

    if (on) {
      const { error } = await supabase.from('follows')
        .delete().eq('artist_id', a.id).eq('follower_id', user.id);
      if (error) setFollowed(p => ({ ...p, [a.id]: true }));
      return;
    }

    const { error } = await supabase.from('follows')
      .insert({ artist_id: a.id, follower_id: user.id });
    // 23505 is the row already being there, which is the state the tap was
    // asking for. Anything else and the button goes back, because a button
    // that says Following when nothing was written is worse than a failure.
    if (error && error.code !== '23505') {
      console.warn('[welcome] follow failed:', error.code, error.message);
      setFollowed(p => ({ ...p, [a.id]: false }));
    }
  };

  const followCount = Object.values(followed).filter(Boolean).length;

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
    let finalSlug = artist?.slug || null;
    try {
      let avatarUrl = null;
      if (avatarFile) {
        const ext  = (avatarFile.name.split('.').pop() || 'jpg').toLowerCase();
        const path = `${user.id}/${Date.now()}.${ext}`;
        // Two buckets, tried in order, and the error is logged rather than
        // swallowed.
        //
        // The listener path pointed at 'profile-images' and that upload comes
        // back 400 on the live site, which nothing reported because the result
        // was only ever checked for truthiness. 'artist-images' is the bucket
        // the rest of the app writes to and it demonstrably works, so it is the
        // fallback. Both paths are namespaced by user id, so nothing collides.
        //
        // If both fail the answers still save. A picture is the one optional
        // thing on this screen and it must never cost somebody their name.
        const buckets = role === 'listener'
          ? ['profile-images', 'artist-images']
          : ['artist-images'];
        for (const bucket of buckets) {
          const { error: upErr } = await supabase.storage
            .from(bucket).upload(path, avatarFile, { contentType: avatarFile.type, upsert: true });
          if (!upErr) {
            const { data } = supabase.storage.from(bucket).getPublicUrl(path);
            avatarUrl = data?.publicUrl || null;
            break;
          }
          console.warn(`[welcome] avatar upload to ${bucket} failed:`, upErr.message);
        }
      }

      const finalName = name.trim()
        || artist?.artist_name || listener?.display_name
        || user.email?.split('@')[0] || null;

      // finalSlug is declared outside this try, because the navigation that
      // reads it happens after it. The last button says "Go to my page" and it
      // needs to know which page that is. It used to send creators to /setup,
      // which is the settings screen this whole flow exists to spare them:
      // five questions answered and then a wall of fields asking several of
      // them again.

      if (role === 'listener') {
        await supabase.from('user_profiles').upsert({
          user_id: user.id, name: finalName,
          genre: genres[0] || null, genre_preferences: genres, mood: mood || null,
          ...(avatarUrl ? { avatar_url: avatarUrl } : {}),
          updated_at: new Date().toISOString(),
        }, { onConflict: 'user_id' });

        // UPSERT, not update.
        //
        // This was `.update(...).eq('user_id', user.id)`, which matches zero
        // rows when the account has no listeners row yet and returns success
        // anyway, because updating nothing is not an error. So the flow
        // finished, navigated away, and created nothing.
        //
        // The guard in AppRouter sends anybody with no artist AND no listener
        // row back to /welcome. Between the two, an account that never got a
        // listeners row was asked what it wanted to be on every single sign
        // in, forever, with no way out. That is the feelzmachine@gmail loop.
        const { error: lErr } = await supabase.from('listeners').upsert({
          user_id: user.id,
          display_name: finalName,
          ...(avatarUrl ? { avatar_url: avatarUrl } : {}),
          updated_at: new Date().toISOString(),
        }, { onConflict: 'user_id' });
        if (lErr) throw lErr;
      } else if (role !== 'listener' && !artist?.id) {
        // No artist row yet, which the old code handled by doing nothing at
        // all: not the artists row, not even user_profiles. Somebody who
        // signed up to release music and whose row had not been created got
        // every answer thrown away and was then asked again next time.
        //
        // user_profiles first, so the name survives even if the artists
        // insert is refused.
        await supabase.from('user_profiles').upsert({
          user_id: user.id, name: finalName, bio: bio.trim() || null,
          genre: genres[0] || null, genre_preferences: genres,
          ...(avatarUrl ? { avatar_url: avatarUrl } : {}),
          updated_at: new Date().toISOString(),
        }, { onConflict: 'user_id' });

        const base = generateSlug(finalName || '');
        if (base) finalSlug = await getUniqueSlug(base, null);
        const { error: aErr } = await supabase.from('artists').insert({
          user_id: user.id,
          artist_name: finalName,
          bio: bio.trim() || null,
          genre: genres[0] || null,
          role,
          role_confirmed: true,
          ...(finalSlug ? { slug: finalSlug } : {}),
          ...(avatarUrl ? { profile_image_url: avatarUrl } : {}),
        });
        if (aErr) throw aErr;
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
          if (base) { update.slug = await getUniqueSlug(base, artist.id); finalSlug = update.slug; }
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
    // THE DURABLE MARKER. This is the one that stops the loop.
    //
    // Everything above writes the ANSWERS. None of it records the fact that
    // the person was here, and a skip writes an empty genres array, which the
    // old completion test read as "not done". So a skip was remembered only
    // in localStorage, and the app asked again on every new browser, every
    // installed-app session, every cleared cache, forever.
    //
    // Written outside the try above on purpose: if saving the answers failed,
    // the person still went through this and must not be asked again. Losing
    // their genres is a worse feed. Losing this is an account that nags.
    //
    // The error is READ, not caught. supabase-js resolves { data, error } for a
    // database refusal rather than throwing, so the try/catch that used to be
    // here could never fire: a refused write looked identical to a successful
    // one and this marker could go missing with nothing anywhere saying so.
    // That is how an account ends up being asked to onboard on every new
    // device forever, and nobody finds out until somebody reads the table.
    {
      const { error: doneErr } = await supabase.from('user_profiles').upsert({
        user_id: user.id,
        welcome_completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id' });
      if (doneErr) {
        console.error('[welcome] could not record completion:', doneErr.code, doneErr.message, doneErr.details || '');
      }
    }

    // Local as well, because it is free and it is the common case.
    markWelcomeSeen(user.id);

    // GO AND LOOK AGAIN BEFORE LEAVING.
    //
    // finish() may have just created the artists row. AuthContext has no idea:
    // its `artist` is still null and userRow is still holding the empty read
    // that was true a minute ago. So the app carried on treating a brand new
    // artist as a listener, with the listener navigation and the listener
    // half of every screen, until the person reloaded the page by hand and the
    // whole thing was read again from scratch.
    //
    // refreshProfile drops those cached rows and refetches all three, which is
    // exactly the state a reload would have produced, minus the reload. The
    // spinner on the button is already up, so the wait is covered.
    //
    // Guarded on time as well as on error. If the refetch hangs, the person is
    // still leaving this screen: a stale role is a bad half-hour, being stuck
    // on the last step of onboarding forever is worse.
    try {
      await Promise.race([
        refreshProfile(),
        new Promise(res => setTimeout(res, 4000)),
      ]);
    } catch (err) {
      console.warn('[welcome] could not refresh auth state before leaving:', err?.message);
    }

    // Where "Go to my page" actually goes.
    //
    // flow.doneTo for a creator was /setup. That is the settings page, and
    // sending somebody there straight after they have just given their name,
    // photo, genres and bio is asking them for all of it a second time. Their
    // own page is what the button says and what they want to see.
    const dest = goTo
      || (role !== 'listener' && finalSlug ? `/artist/${finalSlug}` : null)
      || flow.doneTo;
    navigate(dest, { replace: true });
  };

  const skipAll = () => finish({ silent: true });
  // From safeStep, not from the raw step. Changing the role on step 0 swaps the
  // flow underneath, and the listener flow is shorter than the creator ones, so
  // the raw counter can sit past the end of the array it is now indexing.
  const next    = () => (isLast ? finish() : setStep(safeStep + 1));
  const back    = () => setStep(Math.max(0, safeStep - 1));

  return (
    // NOT min-h-screen, and not a pinned footer.
    //
    // This screen renders INSIDE the app shell, which on a desktop adds its own
    // top padding and a player bar. A child asking for a full viewport height
    // inside that is taller than what is left, so the footer holding Next and
    // Skip was pushed below the fold and simply was not there. On a phone the
    // shell adds nothing, so it fit, which is why it only broke on desktop.
    //
    // Flowing instead of pinning: the content sizes to itself and the buttons
    // follow it. They are under the question on every screen, which is where
    // somebody looks for them anyway.
    <div className="bg-black text-white flex flex-col">
      <div className="flex-shrink-0 px-6 pt-6">
        {/* Bars, not "step 2 of 5". They say the same thing and nobody has to
            read them. */}
        <div className="flex items-center gap-1.5 mb-6">
          {steps.map((s, i) => (
            <div key={s.label} className="flex-1 h-1 rounded-full transition-colors duration-300"
              style={{ background: i <= safeStep ? '#8CAB2E' : 'rgba(255,255,255,0.10)' }} />
          ))}
        </div>
      </div>

      <div className="px-6 pb-6">
        <div className={current.kind === 'genres' || current.kind === 'mood' || current.kind === 'follow' ? 'max-w-2xl mx-auto' : 'max-w-md mx-auto'}>
          {safeStep === 0 && (
            <div className="flex items-center gap-2 mb-2">
              <Sparkles className="w-4 h-4" style={{ color: '#8CAB2E' }} />
              <span className="text-xs font-semibold tracking-wider uppercase text-white/40">
                {current.kind === 'role' ? 'Welcome' : flow.eyebrow}
              </span>
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

          {current.kind === 'role' && (
            <div className="space-y-2.5">
              {ROLE_OPTIONS.map(({ k, Icon, title, blurb }) => {
                const on = role === k;
                return (
                  <button type="button" key={k} onClick={() => {
                    setPicked(k);
                    // Stashed as well as held in state. finish() creates the
                    // artists row for a creator, but if that write is refused
                    // the choice would be gone again, and this is the key
                    // AuthContext reads on the next load to make the row
                    // itself. Cheap belt and braces on the exact failure that
                    // produced listener accounts in the first place.
                    try {
                      if (k === 'artist' || k === 'beatmaker') localStorage.setItem('pending_creator_role', k);
                      else localStorage.removeItem('pending_creator_role');
                    } catch {}
                  }}
                    className="w-full text-left p-4 rounded-2xl transition active:scale-[0.99] flex items-start gap-3.5"
                    style={on
                      ? { background: 'rgba(140,171,46,0.12)', border: '1px solid rgba(140,171,46,0.50)' }
                      : { background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
                    <div className="w-10 h-10 flex-shrink-0 rounded-xl flex items-center justify-center"
                      style={{ background: on ? 'rgba(140,171,46,0.18)' : 'rgba(255,255,255,0.05)' }}>
                      <Icon className="w-5 h-5" style={{ color: on ? '#c7e06a' : 'rgba(255,255,255,0.45)' }} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold" style={{ color: on ? '#fff' : 'rgba(255,255,255,0.80)' }}>{title}</p>
                      <p className="text-[12px] text-white/40 mt-0.5 leading-relaxed">{blurb}</p>
                    </div>
                    {on && <Check className="w-4 h-4 flex-shrink-0 mt-1" style={{ color: '#c7e06a' }} />}
                  </button>
                );
              })}
            </div>
          )}

          {current.kind === 'follow' && (
            <>
              {suggLoading && (
                <div className="py-10 flex items-center justify-center">
                  <Loader className="w-5 h-5 animate-spin text-white/30" />
                </div>
              )}

              {!suggLoading && !sugg.length && (
                <div className="py-8 text-center">
                  <Users className="w-7 h-7 mx-auto text-white/15" />
                  <p className="text-sm text-white/35 mt-3">
                    Nobody to suggest just yet. Browse will have people in it the moment there are.
                  </p>
                </div>
              )}

              {!suggLoading && !!sugg.length && (
                <>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                    {sugg.map(a => {
                      const on = !!followed[a.id];
                      const initial = (a.artist_name || '?').trim().charAt(0).toUpperCase();
                      return (
                        <button type="button" key={a.id} onClick={() => toggleFollow(a)}
                          className="p-3 rounded-2xl text-center transition active:scale-[0.97] flex flex-col items-center"
                          style={on
                            ? { background: 'rgba(140,171,46,0.12)', border: '1px solid rgba(140,171,46,0.50)' }
                            : { background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
                          <div className="w-14 h-14 rounded-full overflow-hidden flex items-center justify-center"
                            style={{ background: 'rgba(255,255,255,0.06)' }}>
                            {a.profile_image_url
                              ? <img src={a.profile_image_url} alt="" className="w-full h-full object-cover" loading="lazy" />
                              : <span className="text-lg font-bold text-white/30">{initial}</span>}
                          </div>
                          {/* min-w-0 and w-full on the text wrapper, so a long
                              artist name truncates instead of widening the card
                              and pushing the grid off the side of the screen. */}
                          <div className="w-full min-w-0 mt-2">
                            <p className="text-[12px] font-semibold truncate"
                              style={{ color: on ? '#fff' : 'rgba(255,255,255,0.80)' }}>{a.artist_name}</p>
                            {a.genre && <p className="text-[10px] text-white/30 truncate mt-0.5">{a.genre}</p>}
                          </div>
                          <span className="mt-2 text-[11px] font-bold px-3 py-1 rounded-full"
                            style={on
                              ? { background: '#8CAB2E', color: '#000' }
                              : { background: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.65)' }}>
                            {on ? 'Following' : 'Follow'}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                  <p className="text-[11px] text-white/25 mt-3 text-center">
                    {followCount === 0
                      ? 'Tap any of them. It saves straight away.'
                      : `Following ${followCount}. Tap again to undo.`}
                  </p>
                </>
              )}
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
      <div className="px-6 pt-2" style={{ paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 32px)' }}>
        <div className="max-w-md mx-auto flex items-center gap-3">
          {safeStep > 0 && (
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

// KEYED TO THE PERSON, NOT TO THE BROWSER.
//
// This was one global key, 'fm_welcome_seen'. localStorage belongs to the
// ORIGIN, not to the account, so once anybody had been through onboarding on a
// device, every account that signed in afterwards on that same device was
// treated as having been through it too.
//
// Caught on a live test account. A brand new sign-up landed straight in the
// app, never saw /welcome, and finished with a listeners row, an
// auto-generated artist name and NO user_profiles row at all, because finish()
// is what writes welcome_completed_at and finish() never ran. From the
// outside it looked like onboarding was broken. It was never reached.
//
// This is not an edge case. It is every phone handed to a friend, every shared
// computer, every time somebody signs out and somebody else signs up, and
// every test account anybody has ever made on their own machine. The last one
// is why it stayed invisible: the people testing it were exactly the people
// who had already set the key.
//
// The old global key is removed when a per-person one is written, so a device
// that already carries it stops leaking it to the next account.
const SEEN_PREFIX = 'fm_welcome_seen_';
const LEGACY_KEY  = 'fm_welcome_seen';

const seenKey = (userId) => SEEN_PREFIX + userId;

export function markWelcomeSeen(userId) {
  if (!userId) return;
  try {
    localStorage.setItem(seenKey(userId), '1');
    localStorage.removeItem(LEGACY_KEY);
  } catch {}
}

// Synchronous, for the router guard, which renders and cannot await.
export function hasSeenWelcome(userId) {
  if (!userId) return false;
  try { return localStorage.getItem(seenKey(userId)) === '1'; } catch { return false; }
}

export async function needsWelcome(user, artist) {
  if (!user) return false;
  try { if (localStorage.getItem(seenKey(user.id)) === '1') return false; } catch {}
  try {
    // The durable marker, asked before anything else and before any guessing.
    //
    // Everything below this line is inference: has a name, picked genres, has
    // a slug. Inference is how this went wrong, because somebody who SKIPS
    // satisfies none of it and is therefore asked again forever, on a screen
    // whose own copy promises skipping is a real option.
    //
    // welcome_completed_at is not an inference. It is set the moment somebody
    // finishes or skips, and once it is set nothing here may ask again.
    const { data: doneRow } = await supabase
      .from('user_profiles')
      .select('welcome_completed_at')
      .eq('user_id', user.id)
      .maybeSingle();
    if (doneRow?.welcome_completed_at) { markWelcomeSeen(user.id); return false; }

    // An artist who has named themselves has been set up, here or in /setup.
    // The auto-generated placeholder name contains a dash and six random
    // characters, so it is not evidence of anything.
    if (artist) {
      const named = artist.artist_name && artist.slug
        && !/^[a-z0-9]+-[a-z0-9]{6}$/i.test(artist.artist_name);
      if (named) { markWelcomeSeen(user.id); return false; }
      return true;
    }
    const { data } = await supabase
      .from('user_profiles')
      .select('genre_preferences')
      .eq('user_id', user.id)
      .maybeSingle();
    const done = Array.isArray(data?.genre_preferences) && data.genre_preferences.length > 0;
    if (done) markWelcomeSeen(user.id);
    return !done;
  } catch {
    // If we cannot tell, do not interrupt anybody.
    return false;
  }
}