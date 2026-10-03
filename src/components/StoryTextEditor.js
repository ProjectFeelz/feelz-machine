// src/components/StoryTextEditor.js
//
// Put words on a story picture, drag them where you want them, and upload the
// result as one flat image.
//
// WHY THE PREVIEW IS A CANVAS AND NOT DOM TEXT OVER AN <img>
//
// The obvious build is an absolutely positioned <div> over the picture, and
// then a canvas at save time to burn it in. That gives you two renderers for
// the same thing: the browser's text layout for the preview and the canvas text
// API for the output. They disagree about line breaks, letter spacing and how
// a shadow is drawn, so what somebody drags into place is not what lands in
// their story, and the error grows with the size of the text.
//
// So there is one renderer. The preview IS the canvas, drawn by the same
// function that writes the final file, at a smaller scale. What you see is
// what uploads, by construction rather than by careful matching.
//
// GEOMETRY IS STORED AS FRACTIONS
//
// Position is 0 to 1 across the picture and font size is a fraction of its
// width, so the same numbers draw correctly at preview scale and at full
// resolution. Storing pixels would mean every export had to convert, and that
// conversion is where this kind of feature usually drifts.
//
// WHAT IT DELIBERATELY IS NOT
//
// Not stickers, not polls, not mentions, not GIFs, not animated text. This is
// a platform for music rather than another feed to perform in, and each of
// those turns the editor into a layer system with a toolbar. One text layer,
// moved with a finger, is the part that earns its place: it is how somebody
// says what the picture is.

import React from 'react';
import { X, Check, Type, Loader } from 'lucide-react';

// System stacks on purpose. A web font has to be loaded and ready before
// canvas can draw with it, and a canvas that renders one frame before
// document.fonts.ready resolves silently falls back to a different typeface,
// which is the kind of bug that only shows up on somebody else's phone.
const FONTS = [
  { key: 'sans',    label: 'Clean',   css: '700 {size}px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif' },
  { key: 'serif',   label: 'Classic', css: '700 {size}px Georgia, "Times New Roman", serif' },
  { key: 'mono',    label: 'Mono',    css: '700 {size}px ui-monospace, "SF Mono", Menlo, Consolas, monospace' },
  { key: 'round',   label: 'Round',   css: '800 {size}px "Trebuchet MS", "Gill Sans", system-ui, sans-serif' },
  { key: 'impact',  label: 'Loud',    css: '900 {size}px Impact, "Haettenschweiler", "Arial Black", sans-serif' },
];

const COLOURS = ['#FFFFFF', '#000000', '#C6FF3D', '#FB7185', '#60A5FA', '#FBBF24'];

// The longest edge of the uploaded file. Phone cameras produce 4000px images
// and a story is viewed at about 400. Anything above this is bytes nobody sees,
// on connections where that is the difference between a story loading and not.
const MAX_EDGE = 1440;

function wrapLines(ctx, text, maxWidth) {
  const out = [];
  for (const paragraph of text.split('\n')) {
    const words = paragraph.split(/\s+/).filter(Boolean);
    if (!words.length) { out.push(''); continue; }
    let line = words[0];
    for (let i = 1; i < words.length; i++) {
      const next = line + ' ' + words[i];
      if (ctx.measureText(next).width <= maxWidth) line = next;
      else { out.push(line); line = words[i]; }
    }
    out.push(line);
  }
  return out;
}

// The one renderer. Called for the preview every frame and once more for the
// file that gets uploaded.
function draw(ctx, img, W, H, layer) {
  ctx.clearRect(0, 0, W, H);
  ctx.drawImage(img, 0, 0, W, H);
  if (!layer.text.trim()) return;

  const size = Math.max(10, layer.sizeFrac * W);
  const font = FONTS.find(f => f.key === layer.font) || FONTS[0];
  ctx.font = font.css.replace('{size}', String(size));
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  const maxWidth = W * 0.86;
  const lines = wrapLines(ctx, layer.text, maxWidth);
  const lineHeight = size * 1.18;
  const x = layer.xFrac * W;
  const startY = layer.yFrac * H - ((lines.length - 1) * lineHeight) / 2;

  // A shadow rather than an outline. White text on a bright photograph is
  // unreadable without something behind it, and a stroke at this weight turns
  // into a cartoon. This is the same treatment the caption already uses.
  ctx.shadowColor = 'rgba(0,0,0,0.55)';
  ctx.shadowBlur = size * 0.22;
  ctx.shadowOffsetY = size * 0.04;
  ctx.fillStyle = layer.colour;

  lines.forEach((line, i) => ctx.fillText(line, x, startY + i * lineHeight));

  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;
}

export default function StoryTextEditor({ file, onCancel, onDone }) {
  const canvasRef = React.useRef(null);
  const imgRef    = React.useRef(null);
  const wrapRef   = React.useRef(null);
  const [ready, setReady]     = React.useState(false);
  const [saving, setSaving]   = React.useState(false);
  const [editing, setEditing] = React.useState(false);
  const [error, setError]     = React.useState('');

  const [layer, setLayer] = React.useState({
    text: '',
    xFrac: 0.5,
    yFrac: 0.78,     // Low by default: the top of a story is where the artist
                     // name and the progress bars live.
    sizeFrac: 0.085,
    colour: '#FFFFFF',
    font: 'sans',
  });

  // Load the picture once.
  React.useEffect(() => {
    let dead = false;
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { if (!dead) { imgRef.current = img; setReady(true); } };
    img.onerror = () => { if (!dead) setError('That image could not be opened.'); };
    img.src = url;
    return () => { dead = true; URL.revokeObjectURL(url); };
  }, [file]);

  // Size the preview canvas to the box it sits in, at device resolution so the
  // text is not soft on a retina screen.
  const paint = React.useCallback(() => {
    const canvas = canvasRef.current, img = imgRef.current, wrap = wrapRef.current;
    if (!canvas || !img || !wrap) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    const boxW = wrap.clientWidth;
    const boxH = wrap.clientHeight;
    const scale = Math.min(boxW / img.width, boxH / img.height);
    const w = Math.round(img.width * scale);
    const h = Math.round(img.height * scale);
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    const ctx = canvas.getContext('2d');
    draw(ctx, img, canvas.width, canvas.height, layer);
  }, [layer]);

  React.useEffect(() => { if (ready) paint(); }, [ready, paint]);
  React.useEffect(() => {
    const onResize = () => paint();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [paint]);

  // Dragging. Pointer events rather than touch events, so one code path covers
  // a finger, a mouse and a stylus, and setPointerCapture keeps the drag alive
  // when the finger leaves the canvas.
  const onPointerDown = (e) => {
    if (!layer.text.trim()) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    move(e);
  };
  const onPointerMove = (e) => {
    if (e.buttons === 0 && e.pointerType === 'mouse') return;
    if (!e.currentTarget.hasPointerCapture?.(e.pointerId)) return;
    move(e);
  };
  const move = (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    const xFrac = Math.min(0.95, Math.max(0.05, (e.clientX - r.left) / r.width));
    const yFrac = Math.min(0.95, Math.max(0.05, (e.clientY - r.top) / r.height));
    setLayer(l => ({ ...l, xFrac, yFrac }));
  };

  const save = async () => {
    const img = imgRef.current;
    if (!img) return;
    setSaving(true);
    setError('');
    try {
      const scale = Math.min(1, MAX_EDGE / Math.max(img.width, img.height));
      const W = Math.round(img.width * scale);
      const H = Math.round(img.height * scale);
      const out = document.createElement('canvas');
      out.width = W; out.height = H;
      draw(out.getContext('2d'), img, W, H, layer);

      const blob = await new Promise((res, rej) =>
        out.toBlob(b => (b ? res(b) : rej(new Error('Could not render the image'))), 'image/jpeg', 0.9));

      const base = (file.name || 'story').replace(/\.[^.]+$/, '');
      onDone(new File([blob], `${base}.jpg`, { type: 'image/jpeg' }));
    } catch (err) {
      // Never leave somebody stuck on this screen. If the render fails they
      // can still post the picture as it was.
      setError(err.message || 'Could not save that. You can post without text.');
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[650] bg-black flex flex-col">

      <div className="flex items-center justify-between px-4 py-3 flex-shrink-0">
        <button onClick={onCancel} aria-label="Cancel"
          className="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center">
          <X className="w-4 h-4 text-white/70" />
        </button>
        <button
          onClick={() => setEditing(true)}
          className="inline-flex items-center gap-1.5 px-3 h-9 rounded-full bg-white/10 text-xs font-semibold text-white">
          <Type className="w-3.5 h-3.5" />
          {layer.text.trim() ? 'Edit text' : 'Add text'}
        </button>
        <button onClick={save} disabled={saving || !ready} aria-label="Done"
          className="w-9 h-9 rounded-full bg-lime-400 flex items-center justify-center disabled:opacity-40">
          {saving ? <Loader className="w-4 h-4 text-black animate-spin" /> : <Check className="w-4 h-4 text-black" />}
        </button>
      </div>

      <div ref={wrapRef} className="flex-1 min-h-0 flex items-center justify-center px-3">
        {ready ? (
          <canvas
            ref={canvasRef}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            className={`rounded-xl ${layer.text.trim() ? 'cursor-move touch-none' : ''}`}
            style={{ touchAction: layer.text.trim() ? 'none' : 'auto' }}
          />
        ) : (
          <Loader className="w-5 h-5 text-white/30 animate-spin" />
        )}
      </div>

      {layer.text.trim() && (
        <p className="text-[11px] text-white/35 text-center px-6 pb-1 flex-shrink-0">
          Drag the words where you want them
        </p>
      )}
      {error && <p className="text-xs text-red-400 text-center px-6 pb-1 flex-shrink-0">{error}</p>}

      {/* Controls. Only once there is text: a font picker above an empty
          picture is five buttons that do nothing visible. */}
      {layer.text.trim() && (
        <div className="flex-shrink-0 px-4 pb-4 pt-2 space-y-3">
          <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide">
            {FONTS.map(f => (
              <button key={f.key} onClick={() => setLayer(l => ({ ...l, font: f.key }))}
                className={`flex-shrink-0 px-3 h-9 rounded-full text-xs font-semibold transition
                  ${layer.font === f.key ? 'bg-white text-black' : 'bg-white/10 text-white/70'}`}>
                {f.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2.5">
            {COLOURS.map(c => (
              <button key={c} onClick={() => setLayer(l => ({ ...l, colour: c }))}
                aria-label={`Colour ${c}`}
                className={`w-8 h-8 rounded-full flex-shrink-0 transition ${layer.colour === c ? 'ring-2 ring-white ring-offset-2 ring-offset-black' : ''}`}
                style={{ background: c, border: '1px solid rgba(255,255,255,0.25)' }} />
            ))}
          </div>

          <div className="flex items-center gap-3">
            <span className="text-[10px] text-white/35 w-8 flex-shrink-0">Size</span>
            <input
              type="range" min="40" max="180" step="1"
              value={Math.round(layer.sizeFrac * 1000)}
              onChange={e => setLayer(l => ({ ...l, sizeFrac: Number(e.target.value) / 1000 }))}
              className="flex-1 accent-lime-400"
              aria-label="Text size"
            />
          </div>
        </div>
      )}

      {/* The text itself is typed in a plain textarea rather than on the
          canvas. Typing directly onto a canvas means reimplementing the caret,
          selection, autocorrect and every language's input method, badly. */}
      {editing && (
        <div className="absolute inset-0 z-10 bg-black/85 backdrop-blur-sm flex flex-col px-5 py-6">
          <textarea
            autoFocus
            value={layer.text}
            onChange={e => setLayer(l => ({ ...l, text: e.target.value.slice(0, 180) }))}
            placeholder="Say something"
            rows={4}
            className="w-full bg-transparent text-2xl font-bold text-white text-center placeholder-white/25 outline-none resize-none"
          />
          <p className="text-[11px] text-white/30 text-center mt-2">{layer.text.length} of 180</p>
          <button onClick={() => setEditing(false)}
            className="mt-auto w-full py-3 rounded-xl bg-white text-black text-sm font-bold">
            Done
          </button>
        </div>
      )}
    </div>
  );
}