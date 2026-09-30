// src/utils/lyrics.js
//
// One lyrics parser for the whole app.
//
//
// WHY THIS EXISTS
//
// FullPlayer had a parser that accepted exactly one format:
//
//   /^\[(\d{1,2}):(\d{2})(?:[.:](\d{1,3}))?\]\s*(.*)$/
//
// A timestamp in square brackets, at the start of the line, and nothing else.
// Anything it did not match was treated as not-lyrics at all, and the whole
// block was rendered as plain text. So a file pasted in any other shape
// displayed its own timestamps to the listener:
//
//   00:33.88 I got mud on the toes Your name stuck under my tongue
//   [00:44.94 → 00:52.88] Picking up pieces that don't fit together
//
// Neither of those lines matches, so `matched` never reached 2, the parser
// returned null, and the player printed the timestamps as if they were words.
//
//
// WHAT IS ACCEPTED NOW
//
//   [00:12.34] text            classic LRC
//   [00:12]    text            no fraction
//   00:12.34   text            no brackets, which is what most transcription
//                              tools and Whisper exports produce
//   [00:12.34 -> 00:20.00] text a range. The separator may be an arrow, a
//                              hyphen, an en or em dash, or the word 'to'.
//                              Those characters appear in RANGE_SEP below and
//                              are matched, not written by us, so they stay.
//   <00:12.34> word <00:13.1> word   enhanced LRC, per word
//   1:02:33.5  text            hours, for a long mix or a podcast
//
// A RANGE IS THE BEST CASE and is worth saying out loud: it gives a real end
// time for the line, so word timing inside that line is measured rather than
// guessed. Without one, a line ends when the next line starts, which is
// usually right and occasionally makes a held last word look rushed.
//
//
// WORD TIMING
//
// Two sources, in order of preference:
//
//   1. Real per-word times from enhanced LRC <tags>. Used as given.
//   2. Spread across the line's own duration, weighted by word length, so
//      "constellation" holds longer than "a". Punctuation and spaces are
//      carried with the word they belong to so nothing jumps on its own.
//
// The spread is an approximation and is not pretending otherwise. It is what
// makes a line read left to right in time with a singer rather than lighting
// up all at once, and for a lyric a listener is reading along to, that is the
// whole effect.

// Anywhere in a line: [00:12.34] or 00:12.34 or 1:02:33.5, with an optional
// closing half of a range. Deliberately not anchored to the start, because a
// range's end timestamp sits in the middle of the line.
const STAMP = String.raw`(?:(\d{1,2}):)?(\d{1,2}):(\d{2})(?:[.,:](\d{1,3}))?`;

// Range separators, LONGEST FIRST. The ordering is the whole point.
//
// This list was `(?:→|->|—|–|-|to)` and it broke on `-->`, which is what
// Whisper and most transcription exports actually emit. Tracing why is worth
// keeping, because the failure looked like the separator was simply absent:
//
//   `->` needs `-` then `>`; the input has `-` then `-`, so it fails.
//   `-` then matches the FIRST hyphen, leaving `-> 00:22.16]` where the end
//   timestamp should be. That is not a timestamp, so the whole optional range
//   group backtracks out, the closing `]` never matches either, and every
//   character from the second hyphen onward falls into the lyric text.
//
// So the line kept its correct start time and displayed `--> 00:22.16] I found
// a coin...`, and the word sweep then spent real seconds crawling through
// `-->` and `00:22.16]` before it reached an actual word. That is the delay:
// the highlight was not late, it was busy highlighting the timestamp.
//
// A font with arrow ligatures draws `-->` as a single arrow, which is why the
// player appeared to be printing `→ 00:37.40]` rather than three ASCII
// characters. Same text, prettier rendering of the wrong thing.
//
// An alternation is only as good as its longest branch, so anything that
// starts with a shorter branch has to come after it.
const RANGE_SEP = String.raw`\s*(?:-->|–>|—>|->|=>|>>|\.\.\.|\.\.|→|⟶|➞|~|—|–|-|to|until)\s*`;

// [start] or [start → end] or [start-end], the whole group optional-bracketed.
const LINE_RE = new RegExp(
  String.raw`^\s*(?:\[\s*)?${STAMP}(?:${RANGE_SEP}${STAMP})?(?:\s*\])?\s*(.*)$`
);

// Enhanced LRC word tags: <00:12.34>
const WORD_TAG_RE = new RegExp(String.raw`<\s*${STAMP}\s*>`, 'g');

// A line that is only a tag, like [ar:Big Feelz] or [00:12.34] with no words.
const META_RE = /^\s*\[[a-z]{2,10}:[^\]]*\]\s*$/i;

// ── The backstop ────────────────────────────────────────────────────────────
//
// Adding `-->` above fixes the format we know about. This fixes the class.
//
// Twice now a separator nobody listed has put timestamps on a listener's
// screen, and the next unlisted one would do it again. So after the line is
// parsed, whatever the parse made of it, anything still shaped like parser
// residue is removed before the text can reach a screen.
//
// The rule is deliberately narrow: a timestamp is only removed when it is
// bracketed, or preceded by a separator, or followed by a closing bracket.
// A bare number at the start of a line is left exactly where it is, because
// "3:15 in the morning" is a lyric and eating it would be a worse bug than
// the one being fixed here. That single condition is what separates a
// backstop from a blunt instrument.
const RESIDUE_RE = new RegExp(
  String.raw`^\s*(?:` +
    // a separator, then a timestamp, with or without its brackets
    String.raw`(?:${RANGE_SEP})(?:\[\s*)?${STAMP}\s*\]?` +
    String.raw`|` +
    // or a timestamp that still has its closing bracket attached
    String.raw`(?:\[\s*)?${STAMP}\s*\]` +
    String.raw`|` +
    // or a bracket left behind on its own
    String.raw`\]` +
  String.raw`)\s*`
);

// A fully bracketed stamp or range anywhere in the line: [00:12.34],
// [00:12.34 --> 00:22.16]. Always residue, never a lyric.
const BRACKETED_RE = new RegExp(
  String.raw`\[\s*${STAMP}(?:${RANGE_SEP}${STAMP})?\s*\]`, 'g'
);

function scrubResidue(text) {
  let out = String(text || '').replace(BRACKETED_RE, ' ');
  // Loop because one line can carry more than one leftover, and each pass can
  // expose the next. Capped so a pathological input cannot spin here.
  for (let i = 0; i < 6; i++) {
    const next = out.replace(RESIDUE_RE, '');
    if (next === out) break;
    out = next;
  }
  return out.replace(/\s+/g, ' ').trim();
}

function toSeconds(h, m, s, frac) {
  const hours = h ? parseInt(h, 10) : 0;
  const mins  = parseInt(m, 10);
  const secs  = parseInt(s, 10);
  // '5' means half a second, '05' means 50ms, '005' means 5ms. Padding right
  // rather than left is the difference between those three.
  const ms    = frac ? parseInt(String(frac).padEnd(3, '0'), 10) : 0;
  return hours * 3600 + mins * 60 + secs + ms / 1000;
}

/**
 * Split a line into words carrying their own trailing whitespace, so a word
 * and the space after it move together and nothing reflows while highlighting.
 */
function splitWords(text) {
  const out = [];
  const re = /\S+\s*/g;
  let m;
  while ((m = re.exec(text)) !== null) out.push(m[0]);
  return out;
}

/**
 * Weight by visible length, not by word count. Timing every word equally
 * makes long words feel rushed and short ones feel stuck.
 */
function spreadWords(words, start, end) {
  const total = words.reduce((n, w) => n + Math.max(1, w.trim().length), 0);
  if (!(end > start) || total === 0) {
    return words.map(w => ({ text: w, start, end: start }));
  }
  const span = end - start;
  let at = start;
  return words.map(w => {
    const share = (Math.max(1, w.trim().length) / total) * span;
    const from = at;
    at += share;
    return { text: w, start: from, end: at };
  });
}

/**
 * Parse a lyrics blob.
 *
 * @returns {{ synced: boolean, lines: Array }}
 *   synced  true when at least two timed lines were found. Below that it is
 *           more likely a stray number in plain lyrics than a timed file, and
 *           treating it as timed would jump the display around.
 *   lines   [{ start, end, text, words: [{ text, start, end }] }]
 *           For unsynced lyrics: one entry per line, start/end null.
 */
// A leading timestamp with no brackets, optionally a range: the shape most
// transcription tools emit. Anchored to the start of the line ONLY, because
// "meet me at 3:15" is a lyric and eating it mid-line would be a worse bug
// than the one this fixes.
const LEADING_BARE_RE = new RegExp(
  String.raw`^\s*${STAMP}(?:${RANGE_SEP}${STAMP})?\s*`
);

// ── Lyrics as plain text, for pages with no playhead ────────────────────────
//
// WHY THIS EXISTS AS A SHARED FUNCTION
//
// TrackPage had its own inline regex for this:
//
//   /\[\d{1,2}:\d{2}(?:[.:]\d{1,3})?\]/g
//
// which strips [00:12.34] and nothing else. Every track transcribed by a tool
// that emits ranges, [00:11.56 --> 00:16.08], sailed straight through it and
// the timestamps were printed to the reader as though they were words. Davu
// found it on a track page; it was never right, it just needed a track whose
// lyrics came from a transcriber rather than being typed by hand.
//
// The player never had this problem because it uses parseLyrics, which knows
// all six formats. The fix is not a better regex in the page, it is the page
// using the same knowledge as the player, so a seventh format only has to be
// taught to this file.
//
// Line breaks are preserved, unlike scrubResidue, because a lyric sheet read
// as a paragraph is not a lyric sheet. Runs of blank lines collapse to one so
// a verse break survives without leaving a hole in the page.
export function lyricsToPlainText(raw) {
  if (!raw) return '';
  const out = [];
  let blanks = 0;

  for (const line of String(raw).split(/\r?\n/)) {
    // [ar:...], [ti:...] and friends are file metadata, never words.
    if (META_RE.test(line)) continue;

    let text = line
      // Per-word <00:12.34> tags from enhanced LRC. Stripped FIRST: they sit
      // between words, so leaving them until after the leading-stamp pass
      // means the line still reads "<00:12.34> Hello <00:13.10> world" to a
      // person with no playhead to sync them against.
      .replace(WORD_TAG_RE, ' ')
      .replace(BRACKETED_RE, ' ')
      .replace(LEADING_BARE_RE, '');

    // Same loop as scrubResidue: one line can carry more than one leftover
    // and each pass can expose the next. Capped so a pathological input
    // cannot spin here.
    for (let i = 0; i < 6; i++) {
      const next = text.replace(RESIDUE_RE, '');
      if (next === text) break;
      text = next;
    }

    // Collapse runs of spaces WITHIN the line only. Trailing whitespace goes;
    // a leading indent the writer chose is not ours to remove.
    text = text.replace(/[ \t]+/g, ' ').trimEnd();

    if (!text.trim()) { blanks++; continue; }
    if (blanks > 0 && out.length > 0) out.push('');   // keep one verse break
    blanks = 0;
    out.push(text.trim());
  }

  return out.join('\n');
}

export function parseLyrics(raw) {
  if (!raw || typeof raw !== 'string') return { synced: false, lines: [] };

  const rawLines = raw.replace(/\r\n?/g, '\n').split('\n');
  const timed = [];
  const plain = [];

  for (const line of rawLines) {
    if (META_RE.test(line)) continue;             // [ar:...] and friends

    const m = line.match(LINE_RE);
    if (!m) { plain.push(line); continue; }

    const start = toSeconds(m[1], m[2], m[3], m[4]);
    // Groups 5 to 8 are the range's end, present only when there was one.
    const end   = m[6] ? toSeconds(m[5], m[6], m[7], m[8]) : null;
    // scrubResidue, not just trim. If the separator in this file is one we
    // have not met, the end timestamp is sitting at the front of this string
    // right now, and it is about to become the first two words of the lyric.
    let text    = scrubResidue(m[9] || '');

    // Enhanced LRC: pull the word tags out before anything else looks at the
    // text, so their timestamps never reach the screen.
    let words = null;
    if (text.includes('<')) {
      const marks = [];
      let last = 0;
      let wm;
      WORD_TAG_RE.lastIndex = 0;
      while ((wm = WORD_TAG_RE.exec(text)) !== null) {
        marks.push({ at: wm.index, len: wm[0].length, t: toSeconds(wm[1], wm[2], wm[3], wm[4]) });
      }
      if (marks.length) {
        words = [];
        for (let i = 0; i < marks.length; i++) {
          const from = marks[i].at + marks[i].len;
          const to   = i + 1 < marks.length ? marks[i + 1].at : text.length;
          const chunk = text.slice(from, to);
          if (chunk.trim()) {
            words.push({ text: chunk, start: marks[i].t, end: null });
          }
          last = to;
        }
        // Each word ends where the next begins; the last runs to the line end.
        for (let i = 0; i < words.length; i++) {
          words[i].end = i + 1 < words.length ? words[i + 1].start : (end ?? null);
        }
        text = scrubResidue(text.replace(WORD_TAG_RE, ''));
        void last;
      }
    }

    timed.push({ start, end, text, words });
  }

  if (timed.length >= 2) {
    timed.sort((a, b) => a.start - b.start);

    // Fill in any end time we were not given: the next line's start. The last
    // line has no next, so it gets a sensible hold rather than zero length.
    for (let i = 0; i < timed.length; i++) {
      if (timed[i].end == null) {
        const next = timed[i + 1];
        timed[i].end = next ? next.start : timed[i].start + 4;
      }
      // A range that overlaps the next line is trusted for the words but not
      // allowed to keep the line highlighted past its successor.
      if (timed[i + 1] && timed[i].end > timed[i + 1].start) {
        timed[i].displayEnd = timed[i + 1].start;
      } else {
        timed[i].displayEnd = timed[i].end;
      }
      if (!timed[i].words) {
        timed[i].words = spreadWords(splitWords(timed[i].text), timed[i].start, timed[i].end);
      } else {
        // Enhanced LRC whose last word had no end because the line had no range.
        const w = timed[i].words;
        if (w.length && w[w.length - 1].end == null) w[w.length - 1].end = timed[i].end;
      }
    }
    return { synced: true, lines: timed };
  }

  // Not timed. Keep every line, including the ones that looked like they had
  // a timestamp, because a single "3:15" in a verse is a lyric, not a cue.
  // scrubResidue runs here too. A file with exactly one timed line lands in
  // this branch, and it would otherwise print its own timestamp. The rule
  // above still protects a real "3:15" in a verse: no separator, no bracket,
  // nothing to strip.
  const all = rawLines
    .filter(l => !META_RE.test(l))
    .map(l => ({ start: null, end: null, displayEnd: null, text: scrubResidue(l), words: null }));
  void plain;
  return { synced: false, lines: all };
}

/** Index of the line that should be lit at `t`, or -1. */
export function activeLineIndex(lines, t) {
  if (!lines?.length) return -1;
  let lo = 0, hi = lines.length - 1, best = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (lines[mid].start <= t) { best = mid; lo = mid + 1; } else { hi = mid - 1; }
  }
  return best;
}

/**
 * How far through a word we are at time t, 0 to 1.
 * Used to sweep the fill across the word rather than snapping it on, which is
 * what separates this from a line highlight.
 */
export function wordProgress(word, t) {
  if (!word || word.start == null) return 0;
  if (t <= word.start) return 0;
  if (word.end == null || word.end <= word.start) return 1;
  if (t >= word.end) return 1;
  return (t - word.start) / (word.end - word.start);
}

// ── Colour themes for the lyric sweep ───────────────────────────────────────
//
// Chosen to stay readable on the player's near-black background and on
// artwork behind a scrim. Each is { sung, singing, unsung } so a theme can be
// judged as a whole rather than as three separate pickers, and so an artist
// picks a look rather than three hex codes.
export const LYRIC_THEMES = {
  classic:   { label: 'Classic',    sung: '#ffffff',  singing: '#ffffff', unsung: 'rgba(255,255,255,0.35)', glow: 'rgba(255,255,255,0.35)' },
  lime:      { label: 'Feelz Lime', sung: '#d7ff3e',  singing: '#eaff8a', unsung: 'rgba(255,255,255,0.30)', glow: 'rgba(215,255,62,0.45)' },
  sunset:    { label: 'Sunset',     sung: '#ff8a3d',  singing: '#ffd08a', unsung: 'rgba(255,255,255,0.30)', glow: 'rgba(255,138,61,0.45)' },
  violet:    { label: 'Violet',     sung: '#a78bfa',  singing: '#d8ccff', unsung: 'rgba(255,255,255,0.30)', glow: 'rgba(167,139,250,0.45)' },
  ice:       { label: 'Ice',        sung: '#67e8f9',  singing: '#c4f5fd', unsung: 'rgba(255,255,255,0.30)', glow: 'rgba(103,232,249,0.45)' },
  rose:      { label: 'Rose',       sung: '#fb7185',  singing: '#ffc2cb', unsung: 'rgba(255,255,255,0.30)', glow: 'rgba(251,113,133,0.45)' },
  gold:      { label: 'Gold',       sung: '#fbbf24',  singing: '#ffe6a3', unsung: 'rgba(255,255,255,0.30)', glow: 'rgba(251,191,36,0.45)' },
  mint:      { label: 'Mint',       sung: '#4ade80',  singing: '#bbf7d0', unsung: 'rgba(255,255,255,0.30)', glow: 'rgba(74,222,128,0.45)' },
};

export const DEFAULT_LYRIC_THEME = 'classic';

export function lyricTheme(key) {
  return LYRIC_THEMES[key] || LYRIC_THEMES[DEFAULT_LYRIC_THEME];
}

export default parseLyrics;