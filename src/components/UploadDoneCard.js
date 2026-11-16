// src/components/UploadDoneCard.js
//
// The card an artist sees the moment a track or a release is up. Upload is
// the thing artists do most, so this is where we say well done, show them
// where it lives, and invite them to tell a friend about Feelz Machine.

import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { CheckCircle, X, ExternalLink, Gift, Plus, Copy } from 'lucide-react';
import { tap } from '../utils/track';

const BASE_URL = 'https://www.feelzmachine.com';

/**
 * done: {
 *   kind:      'track' | 'album' | 'ep' | 'mixtape' | 'beat' | ...  (what was uploaded)
 *   title:     string
 *   cover:     string | null
 *   published: boolean
 *   href:      string | null   (in-app path to it, e.g. /track/<slug>)
 *   count:     number | undefined  (tracks on a release)
 * }
 */
export default function UploadDoneCard({ done, onClose }) {
  const navigate = useNavigate();
  const [copied, setCopied] = React.useState(false);

  useEffect(() => {
    if (!done) return undefined;
    tap('upload_done_card', done.kind);
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [done, onClose]);

  if (!done) return null;

  const isRelease = done.kind && done.kind !== 'track' && done.kind !== 'beat';
  const kindLabel = done.kind === 'ep' ? 'EP' : done.kind;
  const what = isRelease ? `Your ${kindLabel}` : done.kind === 'beat' ? 'Your beat' : 'Your song';
  const heading = done.published ? `${what} is live!` : `${what} is saved`;
  const sub = done.published
    ? (isRelease && done.count ? `${done.count} track${done.count === 1 ? '' : 's'} are out now for everyone to hear.` : 'It is out now for everyone to hear.')
    : 'It is a draft for now. Only you can see it. Publish it when you are ready.';

  const link = done.href ? BASE_URL + done.href : null;

  const copyLink = async () => {
    if (!link) return;
    try { await navigator.clipboard.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 1800); } catch { /* clipboard blocked */ }
    tap('upload_done_copy', done.kind);
  };

  const goAffiliate = () => {
    tap('upload_done_affiliate', done.kind);
    onClose();
    navigate('/affiliates');
  };

  const goSee = () => {
    tap('upload_done_view', done.kind);
    onClose();
    navigate(done.href);
  };

  return (
    <div className="fixed inset-0 z-[90] flex items-end sm:items-center justify-center p-0 sm:p-4"
      role="dialog" aria-modal="true" aria-label={heading}>
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />

      <div className="relative w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl border border-white/[0.08] bg-[#111114] p-5 pb-7 sm:pb-5 shadow-2xl"
        style={{ paddingBottom: 'max(1.75rem, env(safe-area-inset-bottom))' }}>
        <button onClick={onClose} aria-label="Close"
          className="absolute top-3 right-3 w-8 h-8 flex items-center justify-center rounded-full bg-white/[0.06] text-white/60">
          <X className="w-4 h-4" />
        </button>

        {/* What went up */}
        <div className="flex items-center gap-4">
          <div className="relative w-20 h-20 flex-shrink-0 rounded-2xl overflow-hidden bg-white/[0.05]">
            {done.cover
              ? <img src={done.cover} alt="" className="w-full h-full object-cover" />
              : <div className="w-full h-full flex items-center justify-center text-white/20 text-3xl">♪</div>}
            <div className="absolute -bottom-1 -right-1 w-8 h-8 rounded-full bg-green-500 flex items-center justify-center border-2 border-[#111114]">
              <CheckCircle className="w-5 h-5 text-white" />
            </div>
          </div>
          <div className="min-w-0 pr-6">
            <p className="text-lg font-black text-white leading-tight">{heading}</p>
            <p className="text-sm text-white/80 font-semibold truncate mt-0.5">{done.title}</p>
            <p className="text-xs text-white/45 mt-1 leading-snug">{sub}</p>
          </div>
        </div>

        {/* Where it lives */}
        {done.published && done.href && (
          <div className="grid grid-cols-2 gap-2 mt-4">
            <button onClick={goSee}
              className="flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-white/[0.07] border border-white/[0.08] text-sm font-semibold text-white">
              <ExternalLink className="w-4 h-4" /> See it
            </button>
            <button onClick={copyLink}
              className="flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-white/[0.07] border border-white/[0.08] text-sm font-semibold text-white">
              <Copy className="w-4 h-4" /> {copied ? 'Copied!' : 'Copy link'}
            </button>
          </div>
        )}

        {/* Tell a friend and earn */}
        <button onClick={goAffiliate}
          className="mt-4 w-full text-left rounded-2xl p-4 border border-purple-400/30 transition active:scale-[0.98]"
          style={{ background: 'linear-gradient(135deg, rgba(167,139,250,0.18), rgba(236,72,153,0.12))' }}>
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 flex-shrink-0 rounded-xl bg-purple-500/25 flex items-center justify-center">
              <Gift className="w-6 h-6 text-purple-300" />
            </div>
            <div className="min-w-0">
              <p className="text-base font-black text-white">Tell a friend about Feelz Machine</p>
              <p className="text-xs text-white/60 mt-0.5">When they join and pay for a plan, you get 20%. Every month.</p>
            </div>
          </div>
          <div className="mt-3 w-full py-2.5 rounded-xl text-center text-sm font-bold text-white"
            style={{ background: 'linear-gradient(135deg, #a78bfa, #7c3aed)' }}>
            Tell a friend and earn
          </div>
        </button>

        <button onClick={onClose}
          className="mt-3 w-full flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-sm font-semibold text-white/60">
          <Plus className="w-4 h-4" /> Upload another
        </button>
      </div>
    </div>
  );
}
