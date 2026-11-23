/**
 * netlify/lib/emailMobile.js
 *
 * Makes any email HTML fit a phone screen.
 *
 * Email apps do not load the app's stylesheet, so an image uploaded at
 * 1920px wide arrives at 1920px wide and the whole message is laid out that
 * wide; the reader has to zoom out and then in again to read it. The same
 * goes for a table or a box given a fixed pixel width.
 *
 * This caps every image, table and fixed-width box at the width of the
 * screen it is read on, with inline styles (which every client honours) and
 * a small media query for the clients that read one.
 */

const MOBILE_CSS =
  '<style>' +
  '@media only screen and (max-width:640px){' +
  'table,td,div{max-width:100%!important;box-sizing:border-box}' +
  'img{max-width:100%!important;height:auto!important}' +
  '}' +
  'p,td,div,a,span,li{overflow-wrap:break-word;word-break:break-word}' +
  'pre{white-space:pre-wrap}' +
  '</style>';

const VIEWPORT = '<meta name="viewport" content="width=device-width,initial-scale=1">';

// Adds declarations to a tag's style attribute, creating it if absent.
function addStyle(tag, decl) {
  if (/\sstyle\s*=\s*"/i.test(tag)) {
    return tag.replace(/\sstyle\s*=\s*"([^"]*)"/i, (m, s) => {
      const base = s.trim().replace(/;?$/, ';');
      return ` style="${base === ';' ? '' : base}${decl}"`;
    });
  }
  if (/\sstyle\s*=\s*'/i.test(tag)) {
    return tag.replace(/\sstyle\s*=\s*'([^']*)'/i, (m, s) => {
      const base = s.trim().replace(/;?$/, ';');
      return ` style='${base === ';' ? '' : base}${decl}'`;
    });
  }
  return tag.replace(/^<(\w+)/, `<$1 style="${decl}"`);
}

function styleOf(tag) {
  const m = tag.match(/\sstyle\s*=\s*("([^"]*)"|'([^']*)')/i);
  return m ? (m[2] != null ? m[2] : m[3]) : '';
}

// A fixed pixel width in a style ("width:600px") becomes "width:100%" with the
// pixels kept as the maximum. min-width and max-width are left alone.
function relaxStyleWidths(tag) {
  return tag.replace(/(\sstyle\s*=\s*)("([^"]*)"|'([^']*)')/i, (m, pre, quoted, dq, sq) => {
    const q = dq != null ? '"' : "'";
    let s = dq != null ? dq : sq;
    let capped = 0;
    s = s.replace(/(^|[;\s])width\s*:\s*(\d{3,4})px\s*(!important)?/gi, (w, lead, px) => {
      const n = Number(px);
      if (n < 300) return w;
      capped = n;
      return `${lead}width:100%;box-sizing:border-box`;
    });
    if (capped) {
      // Keep the original width as the ceiling on a big screen. A max-width
      // given as a percentage is replaced, since 100% of the screen is now
      // what width says anyway.
      if (/max-width\s*:\s*[\d.]+%/i.test(s)) {
        s = s.replace(/max-width\s*:\s*[\d.]+%/i, `max-width:${capped}px`);
      } else if (!/max-width\s*:/i.test(s)) {
        s = `${s.replace(/;?\s*$/, ';')}max-width:${capped}px`;
      }
    }
    s = s.replace(/(^|[;\s])min-width\s*:\s*(\d{3,4})px\s*(!important)?;?/gi,
      (w, lead, px) => (Number(px) >= 300 ? lead : w));
    return `${pre}${q}${s}${q}`;
  });
}

function mobileSafeEmail(html) {
  let out = String(html || '');
  if (!out) return out;

  // Images: never wider than the screen.
  out = out.replace(/<img\b[^>]*>/gi, (tag) => {
    let t = relaxStyleWidths(tag);
    const s = styleOf(t);
    if (!/max-width\s*:/i.test(s)) t = addStyle(t, 'max-width:100%;');
    if (!/height\s*:/i.test(styleOf(t))) t = addStyle(t, 'height:auto;');
    return t;
  });

  // Tables and boxes with a fixed width wider than a phone.
  out = out.replace(/<(table|td|div)\b[^>]*>/gi, (tag) => {
    let t = relaxStyleWidths(tag);
    const wm = t.match(/\swidth\s*=\s*["']?(\d{3,4})["']?/i);
    if (wm && Number(wm[1]) >= 300) {
      const s = styleOf(t);
      if (!/(^|[;\s])width\s*:/i.test(s)) t = addStyle(t, 'width:100%;');
      if (!/max-width\s*:/i.test(styleOf(t))) t = addStyle(t, `max-width:${wm[1]}px;`);
    }
    return t;
  });

  if (!/name\s*=\s*["']viewport/i.test(out)) {
    out = /<head[^>]*>/i.test(out)
      ? out.replace(/<head[^>]*>/i, (h) => `${h}${VIEWPORT}`)
      : `${VIEWPORT}${out}`;
  }
  out = /<\/head>/i.test(out)
    ? out.replace(/<\/head>/i, `${MOBILE_CSS}</head>`)
    : `${MOBILE_CSS}${out}`;

  return out;
}

module.exports = { mobileSafeEmail };
