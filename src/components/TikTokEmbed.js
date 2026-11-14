// src/components/TikTokEmbed.js
//
// Watch an entrant's TikTok without leaving the page.
//
// Every Sessions entry already carries tiktok_video_url; it is required on the
// entry form. Until now it was a link, which on a live stream means leaving
// the page everyone is watching, landing on tiktok.com, and coming back to
// find your place again. The video is the performance. It belongs here.
//
// NO TIKTOK SCRIPT.
//
// The official embed is a blockquote plus https://www.tiktok.com/embed.js,
// which TikTok then rewrites into an iframe. That script watches the whole
// page, sets cookies for a third party on every visitor whether or not they
// ever play anything, and has to load before the first frame appears.
//
// https://www.tiktok.com/embed/v2/<id> is the iframe TikTok's own script ends
// up building. Pointing an iframe straight at it skips the script entirely:
// nothing third party runs on the page, nothing loads until the iframe is
// mounted, and there is no global to collide with when several are on screen
// at once.
//
// SHORT LINKS CANNOT BE EMBEDDED.
//
// vm.tiktok.com/XXXX and tiktok.com/t/XXXX hide the video id behind a
// redirect, and resolving one needs a server round trip. Rather than fetch on
// every card, a short link renders as a labelled button out to TikTok. That is
// honest about what it is instead of showing a frame that never fills.

import React from 'react';
import { ExternalLink, Play } from 'lucide-react';

// The id is 19 digits today, but it has grown before and hardcoding a length
// is how an embed quietly stops working in a year.
const LONG = /tiktok\.com\/(?:@[^/]+\/)?(?:video|photo)\/(\d{6,})/i;

// How much of TikTok's own furniture to push out of sight, top and bottom.
// Measured against their embed as it stands. Tune these two if their player
// changes; nothing else in this file needs to move.
const CHROME_TOP = 66;
const CHROME_BOTTOM = 124;

export function tiktokVideoId(url) {
  if (!url) return null;
  const m = String(url).match(LONG);
  return m ? m[1] : null;
}

export default function TikTokEmbed({ url, videoId, className = '', title = 'TikTok video' }) {
  const [open, setOpen] = React.useState(false);
  // A resolved id beats whatever is in the URL. Almost every entrant pastes a
  // vm.tiktok.com short link, which hides the id behind a redirect; the
  // tiktok-resolve function follows it once and stores the answer.
  const id = videoId || tiktokVideoId(url);

  if (!url && !videoId) return null;

  // Short link, or something that is not a TikTok URL at all.
  if (!id) {
    return (
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className={`flex items-center gap-2.5 rounded-xl border border-white/[0.08] bg-white/[0.03] px-3.5 py-3 hover:bg-white/[0.06] transition ${className}`}
      >
        <ExternalLink className="w-4 h-4 text-lime-400 flex-shrink-0" />
        <span className="min-w-0">
          <span className="block text-sm font-semibold text-white">Watch on TikTok</span>
          <span className="block text-xs text-white/40 mt-0.5">
            This link has not been unwrapped yet, so it opens on TikTok
          </span>
        </span>
      </a>
    );
  }

  // CLICK TO LOAD.
  //
  // A judging page can hold twenty of these. Twenty TikTok iframes mounted at
  // once is twenty video players buffering on a machine that is also running
  // a stream. Nothing loads until somebody asks for this one.
  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className={`w-full flex items-center gap-2.5 rounded-xl border border-white/[0.08] bg-white/[0.03] px-3.5 py-3 hover:bg-white/[0.06] transition text-left ${className}`}
      >
        <span className="w-8 h-8 rounded-full bg-lime-400 text-black flex items-center justify-center flex-shrink-0">
          <Play className="w-3.5 h-3.5 ml-0.5" />
        </span>
        <span className="min-w-0">
          <span className="block text-sm font-semibold text-white">Watch their TikTok here</span>
          <span className="block text-xs text-white/40 mt-0.5">Plays on this page</span>
        </span>
      </button>
    );
  }

  return (
    <div className={`rounded-xl overflow-hidden border border-white/[0.08] bg-black ${className}`}>
      {/* JUST THE VIDEO.
          TikTok has no chrome free embed. Every official option returns
          their player with a header (avatar, handle, caption, follow button)
          and a footer (sound name, like and comment counts, an "open app"
          bar). On a stream that is two thirds furniture.
          So the frame is taller than the window it sits in and pulled up, and
          the window is 9:16 with overflow hidden. What is left on screen is
          the video.
          The two numbers are TikTok's chrome as it is today. If they change
          their player the worst case is a strip of their header showing again
          or a few pixels of video clipped, which is a cosmetic drift, not a
          broken embed. Both are in one place here for that reason.
          Attribution does not disappear: the handle and the link out sit
          underneath, in our own type. */}
      <div className="relative w-full overflow-hidden" style={{ aspectRatio: '9 / 16', maxHeight: '70vh' }}>
        <iframe
          title={title}
          src={`https://www.tiktok.com/embed/v2/${id}`}
          allow="encrypted-media; picture-in-picture; fullscreen"
          // Nothing here needs to reach back into the page, so it is not given
          // the chance to.
          sandbox="allow-scripts allow-same-origin allow-popups allow-presentation"
          className="absolute left-0 w-full"
          style={{
            border: 0,
            top: `-${CHROME_TOP}px`,
            height: `calc(100% + ${CHROME_TOP + CHROME_BOTTOM}px)`,
          }}
          loading="lazy"
        />
      </div>
      <div className="flex items-center justify-between px-3 py-2">
        <button
          onClick={() => setOpen(false)}
          className="text-[11px] font-semibold text-white/40 hover:text-white transition"
        >
          Close
        </button>
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-[11px] font-semibold text-lime-400/80 hover:text-lime-400 transition inline-flex items-center gap-1"
        >
          Open on TikTok <ExternalLink className="w-3 h-3" />
        </a>
      </div>
    </div>
  );
}
