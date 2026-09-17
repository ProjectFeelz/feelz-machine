// src/components/MerchParked.js
//
// What people see where the shop used to be.
//
// A feature that disappears without explanation reads as a bug, and an artist
// who spent an evening connecting a store deserves to be told why it is not
// there rather than left to work it out. This is deliberately a plain, honest
// panel: what happened, what it means for them, what happens next.

import React from 'react';
import { useNavigate } from 'react-router-dom';
import { PauseCircle, ArrowLeft } from 'lucide-react';
import { MERCH_PARKED_HEADLINE, MERCH_PARKED_BODY } from '../config/features';

export default function MerchParked({ full = true, onClose }) {
  const navigate = useNavigate();

  const panel = (
    <div
      className="w-full max-w-md rounded-2xl px-6 py-7"
      style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.09)' }}
    >
      <div className="flex items-center gap-3">
        <div
          className="w-11 h-11 rounded-full flex items-center justify-center flex-shrink-0"
          style={{ background: 'rgba(251,191,36,0.12)', border: '1px solid rgba(251,191,36,0.30)' }}
        >
          <PauseCircle className="w-5 h-5" style={{ color: '#FBBF24' }} />
        </div>
        <h2 className="text-lg font-bold text-white">{MERCH_PARKED_HEADLINE}</h2>
      </div>

      <p className="mt-4 text-sm leading-relaxed text-white/55">{MERCH_PARKED_BODY}</p>

      <div className="mt-6 flex gap-2">
        <button
          onClick={() => (onClose ? onClose() : navigate(-1))}
          className="flex-1 py-3 rounded-xl text-sm font-semibold transition"
          style={{ background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.75)' }}
        >
          {onClose ? 'Close' : 'Go back'}
        </button>
        <button
          onClick={() => { onClose?.(); navigate('/dashboard'); }}
          className="flex-1 py-3 rounded-xl text-sm font-bold text-white transition active:scale-[0.99]"
          style={{ background: 'linear-gradient(145deg, #8B5CF6, #6D28D9)' }}
        >
          Back to your music
        </button>
      </div>
    </div>
  );

  if (!full) return panel;

  return (
    <div className="min-h-screen bg-black flex flex-col items-center justify-center px-5">
      <button
        onClick={() => navigate(-1)}
        className="self-start mb-6 flex items-center gap-2 text-sm text-white/45 hover:text-white/70 transition"
      >
        <ArrowLeft className="w-4 h-4" /> Back
      </button>
      {panel}
    </div>
  );
}