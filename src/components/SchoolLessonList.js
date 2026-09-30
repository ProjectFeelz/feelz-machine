// src/components/SchoolLessonList.js
//
// A course as a numbered list you can see the shape of, rather than one black
// rectangle you have to take on trust.
//
// WHY A LIST AND NOT JUST THE PLAYLIST EMBED
//
// The playlist embed works and it stays. But a playlist tells a student
// nothing before they press play: not how long the course is, not which
// lesson covers splits, and not where they got to when they came back the
// next day. On a page whose whole job is moving a teenager from "I might
// enter" to "I have entered", that is the difference between a course and a
// wall.
//
// ONE PLAYER, NOT FOURTEEN
//
// Fourteen iframes on a phone on school wifi is several megabytes before
// anybody has watched anything, and every one of them can take the audio
// session away from a shortlist song already playing. So exactly one lesson
// is ever mounted: opening a second closes the first. Same reasoning as
// SchoolCourseCard, which this sits beside.
//
// PROGRESS IS A CONVENIENCE, NOT A RECORD
//
// Watched lessons are ticked from localStorage. It is per device and per
// browser and it can come back empty, and that is fine: the worst case is a
// student sees no ticks and watches something twice. It is deliberately NOT
// written to the database. A competition entry must never depend on whether
// somebody's browser kept a flag, and "you did not watch lesson 4" is not a
// thing this platform should be able to say to a sixteen year old.

import React from 'react';
import { PlayCircle, Check } from 'lucide-react';
import { youTubeEmbedSrc, youTubeThumb } from '../utils/youtube';

const STORE_KEY = 'fm_school_lessons_watched';

// Every read and write is wrapped: private windows, blocked site data and
// thumbnail capture all throw here rather than returning empty.
function readWatched() {
  try {
    const raw = window.localStorage.getItem(STORE_KEY);
    const v = raw ? JSON.parse(raw) : [];
    return Array.isArray(v) ? v : [];
  } catch { return []; }
}

function writeWatched(ids) {
  try { window.localStorage.setItem(STORE_KEY, JSON.stringify(ids.slice(-200))); }
  catch { /* nothing to do, and nothing depends on it */ }
}

function runtime(seconds) {
  const s = Number(seconds);
  if (!Number.isFinite(s) || s <= 0) return null;
  const m = Math.floor(s / 60);
  const r = Math.round(s % 60);
  return m > 0 ? `${m}:${String(r).padStart(2, '0')}` : `0:${String(r).padStart(2, '0')}`;
}

export default function SchoolLessonList({ lessons, title, desc }) {
  const [openId, setOpenId] = React.useState(null);
  const [watched, setWatched] = React.useState(readWatched);

  const list = (lessons || []).filter(l => l && l.url);
  if (list.length === 0) return null;

  const markWatched = (id) => {
    setWatched(prev => {
      if (prev.includes(id)) return prev;
      const next = [...prev, id];
      writeWatched(next);
      return next;
    });
  };

  const open = (lesson) => {
    // Opening a lesson closes whichever one was open, so only one iframe is
    // ever mounted. Tapping the open one closes it.
    setOpenId(cur => (cur === lesson.id ? null : lesson.id));
    // Counted as watched on open rather than on completion. There is no
    // reliable completion signal from an iframe without the YouTube player
    // API, and loading that for a tick is not worth the weight.
    markWatched(lesson.id);
  };

  const doneCount = list.filter(l => watched.includes(l.id)).length;

  // NEXT UP, which is what makes this a drip rather than a wall of fourteen
  // videos. The first lesson they have not opened is marked; everything else
  // stays exactly as watchable as before. A lock would be the obvious way to
  // pace a course and it would be the wrong one here: somebody who wants to
  // binge it the night before they upload should be able to, and somebody who
  // arrives at week nine should not be told to come back in nine weeks.
  const nextUp = list.find(l => !watched.includes(l.id));

  return (
    <div className="rounded-xl bg-white/[0.03] border border-white/[0.06] overflow-hidden">
      <div className="flex items-start gap-3 p-3.5 lg:p-4 border-b border-white/[0.06]">
        <PlayCircle className="w-4 h-4 text-lime-400 flex-shrink-0 mt-0.5" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-white">{title}</p>
          {desc && <p className="text-xs text-white/40 mt-0.5">{desc}</p>}
        </div>
        <p className="text-[11px] text-white/35 flex-shrink-0 tabular-nums">
          {doneCount > 0 ? `${doneCount} of ${list.length}` : `${list.length} lessons`}
        </p>
      </div>

      <ol className="divide-y divide-white/[0.04]">
        {list.map((lesson, i) => {
          const isOpen = openId === lesson.id;
          const seen   = watched.includes(lesson.id);
          const len    = runtime(lesson.duration_s);
          const embed  = youTubeEmbedSrc(lesson.url, { autoplay: true });
          const thumb  = youTubeThumb(lesson.url);

          return (
            <li key={lesson.id}>
              <button
                onClick={() => open(lesson)}
                aria-expanded={isOpen}
                className="w-full flex items-center gap-3 px-3.5 lg:px-4 py-3 text-left hover:bg-white/[0.03] transition"
              >
                {/* The number IS the progress indicator once watched, rather
                    than a tick sitting next to it taking up another column on
                    a phone. */}
                <span className={`w-6 h-6 rounded-full flex-shrink-0 flex items-center justify-center text-[11px] font-bold tabular-nums ${
                  seen ? 'bg-lime-400 text-black' : 'bg-white/[0.07] text-white/50'
                }`}>
                  {seen ? <Check className="w-3.5 h-3.5" /> : i + 1}
                </span>

                {/* A still, small. Enough to tell two lessons apart at a
                    glance without turning the list into a grid of posters. */}
                {thumb && (
                  <span className="w-14 h-9 rounded-md overflow-hidden bg-black/40 flex-shrink-0 hidden sm:block">
                    <img src={thumb} alt="" loading="lazy" className="w-full h-full object-cover" />
                  </span>
                )}

                <span className="min-w-0 flex-1">
                  <span className={`block text-sm truncate ${seen ? 'text-white/55' : 'text-white'}`}>
                    {lesson.title}
                  </span>
                  {nextUp && nextUp.id === lesson.id && doneCount > 0 && (
                    <span className="block text-[10px] font-bold uppercase tracking-wider text-lime-300/80 mt-0.5">
                      Next up
                    </span>
                  )}
                </span>

                {len && <span className="text-[11px] text-white/30 tabular-nums flex-shrink-0">{len}</span>}
              </button>

              {isOpen && embed && (
                // 9:16 and width-capped for the same reason as SchoolCourseCard:
                // these are shorts, shot on a phone, and a vertical video in a
                // 16:9 frame wastes half its width on black bars. Capping the
                // width stops one lesson being 890px tall on a laptop and
                // shoving the entry button off the bottom of the page.
                <div className="px-3.5 lg:px-4 pb-4">
                  <div
                    className="relative w-full bg-black rounded-lg overflow-hidden"
                    style={{ aspectRatio: '9 / 16', maxWidth: 300, marginLeft: 'auto', marginRight: 'auto' }}
                  >
                    <iframe
                      src={embed}
                      title={lesson.title}
                      className="absolute inset-0 w-full h-full"
                      style={{ border: 0 }}
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                      allowFullScreen
                      loading="lazy"
                    />
                  </div>
                </div>
              )}

              {/* Not a YouTube link. It still opens, it just opens out. Same
                  fallback as the single card: a course block must not break
                  the day somebody pastes a Drive folder or a PDF. */}
              {isOpen && !embed && (
                <div className="px-3.5 lg:px-4 pb-4">
                  <a href={lesson.url} target="_blank" rel="noopener noreferrer"
                    className="inline-block text-xs font-semibold text-lime-300 hover:text-lime-200 transition">
                    Open this lesson &rarr;
                  </a>
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}