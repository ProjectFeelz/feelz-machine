// src/components/SchoolCourseCard.js
//
// A School Sessions course that plays where it is, instead of throwing a
// teenager into a new tab.
//
//
// WHY THIS IS NOT JUST AN IFRAME
//
// The obvious version drops two YouTube players onto the page on load. On the
// School Sessions page that is the wrong trade twice over: it is a page a
// student reaches on a phone, and it carries a live countdown, a shortlist
// that plays through the app's own audio player, and an entry form. Two
// embedded players cost roughly a megabyte before anybody has asked for a
// video, and a YouTube iframe will happily take the audio session away from
// a shortlist song that is already playing.
//
// So nothing loads until it is tapped. Until then it is a still and a play
// button, which is the same pattern already used for the podcast in
// src/components/HomeAsideCard.js and, more to the point, the same shape as
// the card it replaces. A student who never opens a course pays nothing for
// it.
//
//
// WHEN IT IS NOT A YOUTUBE LINK
//
// It falls back to exactly the link card that was there before. A Drive
// folder, a PDF, a page on another site: all still work, they just open out
// the way they always did. That is deliberate. The alternative is a course
// block that breaks the day somebody pastes a link this file did not expect,
// on the one page that cannot afford it.

import React from 'react';
import { PlayCircle, ExternalLink } from 'lucide-react';
import { youTubeEmbedSrc, youTubeThumb } from '../utils/youtube';

// Vertical, and why it is not simply a taller box.
//
// The audience arrives from TikTok, on a phone, and the platform course is a
// screen recording of a phone. So 9:16 is the honest frame: put a vertical
// video in a 16:9 one and YouTube pillarboxes it, wasting half the width on
// black bars and shrinking the UI the course is trying to show.
//
// The catch is the desktop. These cards sit in a lg:grid-cols-2 grid, so a
// 9:16 video at half a laptop's width comes out around 890px tall and shoves
// the entry button off the bottom of the screen. Capping the media width
// keeps a vertical course phone-shaped on every screen instead of letting it
// grow to fill one.
const VERTICAL_MAX_W = 300;

export default function SchoolCourseCard({ url, title, desc, icon: Icon = PlayCircle, vertical }) {
  const [open, setOpen] = React.useState(false);
  if (!url) return null;

  // A /shorts/ link is vertical by definition, so it does not need declaring.
  // Anything else says so explicitly, because the aspect ratio of an ordinary
  // YouTube video cannot be known from its url.
  const isVertical = vertical ?? /\/shorts\//.test(url);
  const frame = isVertical
    ? { aspectRatio: '9 / 16', maxWidth: VERTICAL_MAX_W, marginLeft: 'auto', marginRight: 'auto' }
    : { aspectRatio: '16 / 9' };

  const embed = youTubeEmbedSrc(url, { autoplay: true });
  const thumb = youTubeThumb(url);

  // Not YouTube. Behave exactly as before.
  if (!embed) {
    return (
      <a href={url} target="_blank" rel="noopener noreferrer"
        className="flex items-center space-x-3 rounded-xl bg-white/[0.03] border border-white/[0.06] p-3.5 lg:p-4 hover:bg-white/[0.05] transition">
        <Icon className="w-4 h-4 text-lime-400 flex-shrink-0" />
        <div className="min-w-0">
          <p className="text-sm font-semibold text-white">{title}</p>
          <p className="text-xs text-white/40 mt-0.5">{desc}</p>
        </div>
        <ExternalLink className="w-3.5 h-3.5 text-white/25 flex-shrink-0 ml-auto" />
      </a>
    );
  }

  return (
    <div className="rounded-xl bg-white/[0.03] border border-white/[0.06] overflow-hidden">
      {open ? (
        <div className="relative w-full bg-black" style={frame}>
          <iframe
            src={embed}
            title={title}
            className="absolute inset-0 w-full h-full"
            style={{ border: 0 }}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowFullScreen
            loading="lazy"
          />
        </div>
      ) : (
        <button
          onClick={() => setOpen(true)}
          aria-label={`Play ${title}`}
          className="relative w-full block text-left group"
          style={frame}
        >
          {thumb ? (
            <img src={thumb} alt="" loading="lazy"
              className="absolute inset-0 w-full h-full object-cover" />
          ) : (
            // A BARE PLAYLIST URL, which has no single video to take a frame
            // from, so youTubeThumb returns null.
            //
            // This used to be a lime wash at 15% with the same dark scrim laid
            // over it as a real thumbnail gets. The scrim exists to keep the
            // play button readable on top of a photograph; over a near
            // transparent gradient it simply wins, and the card rendered as a
            // black rectangle with a button floating in it. It read as a
            // broken image rather than as a course.
            //
            // Stronger, and no scrim over it, so it looks deliberate.
            <span className="absolute inset-0"
              style={{ background: 'linear-gradient(145deg, rgba(163,230,53,0.22) 0%, rgba(163,230,53,0.06) 45%, rgba(0,0,0,0.35) 100%)' }} />
          )}
          {thumb && (
            <span className="absolute inset-0"
              style={{ background: 'linear-gradient(180deg, rgba(0,0,0,0.15) 0%, rgba(0,0,0,0.8) 100%)' }} />
          )}
          {!thumb && (
            // Says what it is. A playlist is a course with several lessons in
            // it, and somebody looking at a poster frame should be able to
            // tell that before they tap.
            <span className="absolute left-0 right-0 bottom-0 p-3 text-center">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-lime-300/80">
                Lesson playlist
              </span>
            </span>
          )}
          <span className="absolute inset-0 flex items-center justify-center">
            <span className="w-12 h-12 rounded-full bg-lime-400 text-black flex items-center justify-center shadow-lg group-hover:scale-105 transition">
              <PlayCircle className="w-6 h-6" />
            </span>
          </span>
        </button>
      )}

      <div className="flex items-start space-x-3 p-3.5 lg:p-4">
        <Icon className="w-4 h-4 text-lime-400 flex-shrink-0 mt-0.5" />
        <div className="min-w-0">
          <p className="text-sm font-semibold text-white">{title}</p>
          <p className="text-xs text-white/40 mt-0.5">{desc}</p>
        </div>
      </div>
    </div>
  );
}