// src/components/CoursePrompt.js
//
// A one-time nudge towards the course, for somebody who has just arrived.
//
// WHY IT IS A BAR AND NOT A MODAL
//
// A modal on login is the obvious build and it is the wrong one here. This bar
// exists BECAUSE the welcome tour was deleted: thirty slides, sixteen for a
// listener and fourteen for an artist, firing before anybody had got anything
// out of the app. Replacing that with another thing demanding a tap would be
// repeating the mistake in a smaller box.
//
// A course is an offer, not an instruction. Somebody who wants to upload a
// track immediately should be able to, and find this again later from either
// plus menu or from About. So it sits at the top of the page until it is used
// or dismissed, and once dismissed it never returns.
//
// WHERE IT REMEMBERS THAT
//
// localStorage, keyed to the user id, and deliberately NOT mirrored into
// user_profiles the way AppTour does. The tour mirrors because replaying a
// five step tour on a second device is genuinely annoying. Being offered a
// course once more on a new phone is not, and it is not worth a schema change
// or a write on every login to prevent. Every read and write is wrapped:
// private windows and blocked site data throw here rather than returning
// empty, and the worst case is the bar shows again.

// WHO IT IS FOR
//
// Artists only. The course is "Recording, uploading, splits and getting
// paid", which is four things a listener will never do, and the bar was
// offering it to everybody who signed in because it gated on nothing but
// having an account. Seen on the live site: a listener account was shown
// "New here? There is a short course" above a feed of music.
//
// rawIsArtist rather than isArtist, because isArtist follows the admin
// "view as" switch. Who this bar is for is a fact about the person, not
// about which lens an admin is currently looking through.
//
// /learn stays open to everyone, and both plus menus and About still link to
// it. This only stops the platform pushing artist material at people who did
// not come here to make anything. When there is a listener course worth
// watching, give it course_key 'listener' in school_course_lessons and this
// bar can offer that one instead, with its own copy.

import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { GraduationCap, X } from 'lucide-react';

const key = (userId) => `fm_course_prompt_${userId}`;

function alreadyHandled(userId) {
  if (!userId) return true;                 // logged out, nothing to offer
  try { return !!window.localStorage.getItem(key(userId)); } catch { return false; }
}

function markHandled(userId) {
  try { window.localStorage.setItem(key(userId), '1'); } catch { /* fine */ }
}

export default function CoursePrompt({ userId }) {
  const navigate = useNavigate();
  const { rawIsArtist } = useAuth();
  const [show, setShow] = React.useState(false);

  React.useEffect(() => {
    if (!rawIsArtist) { setShow(false); return; }
    if (!userId || alreadyHandled(userId)) { setShow(false); return; }

    // A short delay rather than appearing the instant the app paints. The
    // first thing somebody should see after signing up is the app working,
    // not another thing asking for a tap. Four seconds is long enough for the
    // feed to load and for them to look at it, and short enough that it does
    // not arrive as an interruption halfway through something.
    //
    // An earlier version waited for the welcome tour to finish. There is no
    // tour any more, and had that check been left in place this bar would
    // have waited forever for a key nothing writes.
    const t = setTimeout(() => setShow(true), 4000);
    return () => clearTimeout(t);
  }, [userId]);

  if (!show) return null;

  const dismiss = () => { markHandled(userId); setShow(false); };
  const open = () => { markHandled(userId); setShow(false); navigate('/learn'); };

  return (
    <div className="px-4 md:px-8 pt-3">
      <div className="flex items-center gap-3 rounded-xl border border-lime-400/20 bg-lime-400/[0.05] p-3.5">
        <span className="w-9 h-9 rounded-lg bg-lime-400/15 flex items-center justify-center flex-shrink-0">
          <GraduationCap className="w-4.5 h-4.5 text-lime-300" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-white">New here? There is a short course.</p>
          <p className="text-xs text-white/40 mt-0.5">
            Recording, uploading, splits and getting paid. A few minutes, and you can stop anywhere.
          </p>
        </div>
        <button onClick={open}
          className="px-3 py-1.5 rounded-lg bg-lime-400 text-black text-xs font-bold hover:bg-lime-300 transition flex-shrink-0">
          Watch
        </button>
        <button onClick={dismiss} aria-label="Dismiss"
          className="w-7 h-7 rounded-lg hover:bg-white/[0.08] transition flex items-center justify-center flex-shrink-0">
          <X className="w-3.5 h-3.5 text-white/40" />
        </button>
      </div>
    </div>
  );
}