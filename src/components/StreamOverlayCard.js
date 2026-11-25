/**
 * src/components/StreamOverlayCard.js
 *
 * Live Studio card: the OBS overlay for Feelz Live. One link per artist that shows
 * tips as big alerts, viewers' reactions floating up and what's playing, live, on
 * top of whatever is streamed (a game, a camera, a DAW). The overlay page itself is
 * the static public/overlay/index.html; it finds the artist's live stream on its own.
 *
 * Two layouts:
 *   Feelz Live  tips, reactions, what's playing. Viewers on Feelz Machine already see
 *               the chat beside the video, so it isn't put in the picture too.
 *   YouTube     the same plus the Feelz chat, for platforms whose viewers can't see it.
 */
import React, { useState } from 'react';
import { Layers, Check, Copy, ExternalLink } from 'lucide-react';

export default function StreamOverlayCard({ artistId }) {
  const [layout, setLayout] = useState('feelz');
  const [sound, setSound] = useState(true);
  const [copied, setCopied] = useState(false);
  if (!artistId) return null;
  const link = `${window.location.origin}/overlay/?a=${artistId}${layout === 'full' ? '&layout=full' : ''}${sound ? '&sound=1' : ''}`;
  const copy = async () => {
    try { await navigator.clipboard.writeText(link); } catch (e) { /* the box can still be copied by hand */ }
    setCopied(true); setTimeout(() => setCopied(false), 1600);
  };
  const pill = (on) => `flex-1 px-3 py-2 rounded-xl text-xs font-bold border transition ${on ? 'bg-amber-400 text-black border-amber-300' : 'bg-black/30 text-white/70 border-white/[0.08] hover:border-amber-300/40'}`;
  return (
    <section className="rounded-3xl p-5 bg-white/[0.04] border border-white/[0.07]">
      <h2 className="text-base font-black text-white mb-1 flex items-center gap-2"><Layers className="w-4 h-4 text-amber-300" /> Stream overlay for OBS</h2>
      <p className="text-xs text-white/45 mb-4">Tips pop up, reactions float up and what's playing shows, live, on top of whatever you stream: a game, your camera, your studio.</p>
      <div className="flex gap-2 mb-3">
        <button type="button" onClick={() => setLayout('feelz')} className={pill(layout === 'feelz')}>For Feelz Live</button>
        <button type="button" onClick={() => setLayout('full')} className={pill(layout === 'full')}>For YouTube too</button>
      </div>
      <p className="text-[11px] text-white/40 mb-3">{layout === 'feelz'
        ? 'Tips, reactions and what\'s playing. Your Feelz chat already shows beside the video, so it stays out of the picture.'
        : 'Adds your Feelz chat into the picture, for viewers on YouTube and other platforms.'}</p>
      <label className="flex items-center gap-2 text-xs text-white/70 mb-3 cursor-pointer">
        <input type="checkbox" checked={sound} onChange={(e) => setSound(e.target.checked)} className="accent-amber-400" /> A chime on every tip
      </label>
      <div className="flex items-center gap-1.5">
        <code className="flex-1 min-w-0 truncate px-3 py-2.5 rounded-xl bg-black/40 border border-white/[0.08] text-xs text-white/90">{link}</code>
        <button type="button" onClick={copy} aria-label="Copy overlay link" className="w-10 h-10 rounded-xl bg-amber-400 text-black flex items-center justify-center flex-shrink-0">
          {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
        </button>
        <a href={`${link}&preview=1`} target="_blank" rel="noopener noreferrer" aria-label="Preview the overlay" className="w-10 h-10 rounded-xl bg-white/[0.06] border border-white/[0.08] text-white flex items-center justify-center flex-shrink-0">
          <ExternalLink className="w-4 h-4" />
        </a>
      </div>
      <ol className="mt-4 space-y-1 text-xs text-white/55 list-decimal list-inside">
        <li>In OBS: Sources, +, Browser.</li>
        <li>Paste the link. Width 1920, height 1080.</li>
        <li>Put it at the top of your sources, above your game or camera.</li>
      </ol>
    </section>
  );
}
