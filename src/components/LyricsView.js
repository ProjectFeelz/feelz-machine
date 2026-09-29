// src/components/LyricsView.js
//
// Lyrics that read along with the song, word by word.
//
//
// HOW THE WORD SWEEP IS DRAWN
//
// Each word in the line being sung is painted with a two-stop gradient that is
// hard-cut at the word's own progress, and clipped to the glyphs:
//
//   background-image: linear-gradient(90deg, sung 0 P%, unsung P% 100%)
//   -webkit-background-clip: text
//   color: transparent
//
// So the colour wipes across the letters left to right in time with the
// singer, rather than the word snapping on at once. That difference is the
// entire effect, and it costs one gradient per word.
//
//
// WHY ONLY THREE LINES GET WORD TREATMENT
//
// currentTime ticks several times a second. A four minute song is forty or
// more lines at ten words each, and re-rendering four hundred gradient spans
// on every tick makes the scroll stutter on a mid-range phone. Only the line
// being sung and its immediate neighbours are drawn as words; everything else
// is one plain paragraph, which looks identical because nothing in it is
// moving.
//
//
// REDUCED MOTION
//
// Someone who has asked their device for less motion gets the line highlight
// and no per-word sweep. The words still change colour as they are sung, they
// just do not animate within a word.

import React from 'react';
import { parseLyrics, activeLineIndex, wordProgress, lyricTheme } from '../utils/lyrics';

const prefersReducedMotion = () => {
  try {
    return window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches === true;
  } catch { return false; }
};

function Word({ word, t, theme, reduced }) {
  const p = wordProgress(word, t);

  // Not started, or finished: one flat colour, no gradient to compute.
  if (p <= 0) return <span style={{ color: theme.unsung }}>{word.text}</span>;
  if (p >= 1) return <span style={{ color: theme.sung }}>{word.text}</span>;

  if (reduced) {
    // Mid-word, but no animation asked for: treat it as sung.
    return <span style={{ color: theme.sung }}>{word.text}</span>;
  }

  const pct = Math.max(0, Math.min(100, p * 100));

  // WHY THE GRADIENT IS FIXED AND THE POSITION MOVES
  //
  // The first version redrew the gradient every tick, hard cut at the word's
  // progress. It was correct and it looked steppy, for a reason that is not
  // in this file: currentTime comes from the audio element's `timeupdate`
  // event (src/contexts/PlayerContext.js:423) and browsers fire that about
  // four times a second. So the fill advanced in 250ms jumps. On a word that
  // lasts 300ms that is one jump, which reads as a flicker rather than a
  // sweep.
  //
  // Interpolating in JS with requestAnimationFrame would fix it and would
  // re-render every line sixty times a second to do it.
  //
  // So the browser does the interpolating instead. The gradient never
  // changes: it is two flat halves of a background twice the width of the
  // word. Moving background-position from 100% to 0% wipes the sung colour
  // across the glyphs, and a linear transition of roughly one tick's length
  // means the paint is still travelling toward the last known position when
  // the next one arrives. Continuous motion, no animation frames, no extra
  // renders, and it degrades to the old behaviour if transitions are off.
  return (
    <span
      style={{
        backgroundImage: `linear-gradient(90deg, ${theme.singing} 0 50%, ${theme.unsung} 50% 100%)`,
        backgroundSize: '200% 100%',
        backgroundPosition: `${100 - pct}% 0`,
        // 260ms rather than 250: a hair longer than the tick it is bridging,
        // so the motion is still in flight when the next tick re-targets it.
        // Shorter and it arrives early and stalls, which is the stutter this
        // is here to remove.
        transition: 'background-position 260ms linear',
        WebkitBackgroundClip: 'text',
        backgroundClip: 'text',
        color: 'transparent',
        // Without this the gradient is measured against the whole line box and
        // every word wipes at the same moment.
        display: 'inline-block',
        whiteSpace: 'pre',
        textShadow: 'none',
      }}
    >
      {word.text}
    </span>
  );
}

function Line({ line, index, active, t, theme, reduced, asWords, lineRef }) {
  const isPast   = index < active;
  const isActive = index === active;

  if (!line.text.trim()) return <div ref={lineRef} className="h-4" />;

  const base = {
    fontSize:   isActive ? '1.45rem' : '1.05rem',
    fontWeight: isActive ? 700 : 500,
    lineHeight: 1.35,
    transition: 'font-size 220ms ease, opacity 220ms ease, transform 220ms ease',
    transform:  isActive ? 'translateX(3px)' : 'translateX(0)',
    opacity:    isActive ? 1 : isPast ? 0.55 : 0.75,
    // A soft glow behind the line being sung, in the theme's own colour, so a
    // light lyric colour still separates from bright artwork.
    textShadow: isActive && !reduced ? `0 0 22px ${theme.glow}` : 'none',
  };

  if (isActive && asWords && line.words?.length) {
    return (
      <p ref={lineRef} className="text-left" style={base}>
        {line.words.map((w, i) => (
          <Word key={i} word={w} t={t} theme={theme} reduced={reduced} />
        ))}
      </p>
    );
  }

  // Only the line being sung carries the theme colour. Lines already sung go
  // neutral and dim rather than staying lime or violet: with every line
  // coloured, the colour stops meaning "here" and the page just looks tinted,
  // which is what it looked like before this comment existed.
  return (
    <p ref={lineRef} className="text-left"
       style={{ ...base, color: isPast ? 'rgba(255,255,255,0.40)' : theme.unsung }}>
      {line.text}
    </p>
  );
}

/**
 * @param {string} lyrics    raw lyrics, any supported format
 * @param {number} currentTime
 * @param {number} duration  used only to scroll unsynced lyrics
 * @param {string} themeKey  a key from LYRIC_THEMES
 * @param {node}   empty     what to show when there are no lyrics
 */
export default function LyricsView({ lyrics, currentTime = 0, duration = 0, themeKey, empty = null }) {
  const scrollRef     = React.useRef(null);
  const lineRefs      = React.useRef([]);
  const userScrollRef = React.useRef(false);
  const resumeTimer   = React.useRef(null);
  const reduced       = React.useMemo(prefersReducedMotion, []);

  const theme = lyricTheme(themeKey);

  // Parsing is not free and the blob only changes with the track.
  const { synced, lines } = React.useMemo(() => parseLyrics(lyrics), [lyrics]);

  const active = synced ? activeLineIndex(lines, currentTime) : -1;

  // Follow the song, unless the listener has taken the scroll themselves.
  React.useEffect(() => {
    if (!synced || active < 0 || userScrollRef.current) return;
    const el = lineRefs.current[active];
    const box = scrollRef.current;
    if (!el || !box) return;
    box.scrollTo({
      top: Math.max(0, el.offsetTop - box.clientHeight / 2 + el.offsetHeight / 2),
      behavior: reduced ? 'auto' : 'smooth',
    });
  }, [active, synced, reduced]);

  // Unsynced lyrics: drift down the block in proportion to the song, every
  // three seconds rather than every tick, which is enough to keep up and
  // cheap enough not to fight the listener's own scrolling.
  const coarse = Math.floor(currentTime / 3);
  React.useEffect(() => {
    if (synced || userScrollRef.current || !duration) return;
    const box = scrollRef.current;
    if (!box) return;
    const max = box.scrollHeight - box.clientHeight;
    if (max <= 0) return;
    box.scrollTo({ top: (currentTime / duration) * max * 0.85, behavior: 'smooth' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coarse, synced, duration]);

  const onScroll = () => {
    userScrollRef.current = true;
    clearTimeout(resumeTimer.current);
    resumeTimer.current = setTimeout(() => { userScrollRef.current = false; }, 3000);
  };

  React.useEffect(() => {
    userScrollRef.current = false;
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
  }, [lyrics]);

  React.useEffect(() => () => clearTimeout(resumeTimer.current), []);

  if (!lyrics || lines.length === 0) return empty;

  return (
    <div className="flex-1 relative min-h-0">
      <div className="absolute top-0 left-0 right-0 h-12 bg-gradient-to-b from-black to-transparent z-10 pointer-events-none" />
      <div
        ref={scrollRef}
        onScroll={onScroll}
        className="h-full overflow-y-auto px-8 py-12 scrollbar-hide"
      >
        <div className="space-y-5 pb-32">
          {lines.map((line, i) => (
            <Line
              key={i}
              line={line}
              index={i}
              active={active}
              t={currentTime}
              theme={theme}
              reduced={reduced}
              // Only the sung line and its neighbours are drawn word by word.
              asWords={synced && Math.abs(i - active) <= 1}
              lineRef={el => { lineRefs.current[i] = el; }}
            />
          ))}
        </div>
      </div>
      <div className="absolute bottom-0 left-0 right-0 h-16 bg-gradient-to-t from-black to-transparent z-10 pointer-events-none" />
    </div>
  );
}