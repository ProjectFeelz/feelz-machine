/**
 * BirthYearField.js
 *
 * "What year were you born?" — optional, skippable, and it refuses to store an
 * under-13 answer.
 *
 * Self-contained on purpose: it fetches its own value, saves through
 * set_my_birth_year(), and handles every status that RPC can return. Dropping
 * it into a settings page or an onboarding step costs one line and needs no
 * state from the parent, so the same behaviour appears wherever it is asked
 * rather than being reimplemented per surface.
 *
 * WHY IT ASKS THE WAY IT DOES
 *
 * A year dropdown, not a date picker, because birth year is all the artist
 * dashboard needs for age bands and a full date of birth is materially more
 * sensitive to hold for no extra benefit.
 *
 * The reason for asking is stated next to the question. A demographic question
 * with no explanation reads as data harvesting, and people either lie or leave
 * — which produces worse data than not asking.
 *
 * The floor lives in the database (migration 84), not here. The dropdown stops
 * at the cutoff year the RPC reports, so under-13 is not offered — but the
 * client is not what enforces it, because a client never is.
 *
 * Props:
 *   onDone   - called after a successful save, clear or skip. Optional; used by
 *              onboarding to advance a step.
 *   compact  - true for a settings row, false for a standalone prompt card.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../supabaseClient';
import { Cake, Loader, Check, Info } from 'lucide-react';

export default function BirthYearField({ onDone, compact = false }) {
  const [year, setYear]         = useState('');     // '' means unanswered
  const [range, setRange]       = useState(null);   // { min_year, max_year }
  const [loading, setLoading]   = useState(true);
  const [saving, setSaving]     = useState(false);
  const [status, setStatus]     = useState(null);   // 'ok' | 'cleared' | 'under_minimum' | 'invalid' | 'error'
  const [showWhy, setShowWhy]   = useState(false);

  const load = useCallback(async () => {
    // get_my_birth_year also returns the valid range, computed from the current
    // date server-side. Hardcoding a cutoff year in the client would quietly
    // become wrong every January.
    const { data, error } = await supabase.rpc('get_my_birth_year');
    if (error) {
      console.warn('[birth year] load failed:', error.code, error.message);
      setStatus('error');
      setLoading(false);
      return;
    }
    if (data?.birth_year) setYear(String(data.birth_year));
    setRange({ min_year: data?.min_year, max_year: data?.max_year });
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const save = async (value) => {
    setSaving(true);
    setStatus(null);
    const { data, error } = await supabase.rpc('set_my_birth_year', {
      p_year: value === '' ? null : parseInt(value, 10),
    });
    setSaving(false);

    if (error) {
      // Reading only `data` here is how a total failure looks like a success
      // in this codebase. It gets read.
      console.warn('[birth year] save failed:', error.code, error.message, error.hint || '');
      setStatus('error');
      return;
    }

    setStatus(data?.status || 'error');

    if (data?.status === 'under_minimum') {
      // Nothing was stored, by design. Clear the input so the UI matches the
      // database rather than showing a value that does not exist.
      setYear('');
      return;
    }
    if (data?.status === 'ok' || data?.status === 'cleared') {
      if (onDone) onDone();
    }
  };

  if (loading) {
    return (
      <div className="flex items-center space-x-2 py-3">
        <Loader className="w-3.5 h-3.5 text-white/25 animate-spin" />
        <span className="text-xs text-white/25">Loading…</span>
      </div>
    );
  }

  const years = [];
  if (range?.max_year && range?.min_year) {
    for (let y = range.max_year; y >= range.min_year; y--) years.push(y);
  }

  const message = {
    ok:            { text: 'Saved. Thanks.',                                         tone: 'text-green-400' },
    cleared:       { text: 'Removed.',                                               tone: 'text-white/40' },
    under_minimum: { text: 'You need to be at least 13 to use Feelz Machine. Nothing was saved.', tone: 'text-amber-400' },
    invalid:       { text: "That year does not look right.",                         tone: 'text-amber-400' },
    error:         { text: 'Could not save that. Try again in a moment.',            tone: 'text-red-400' },
    not_signed_in: { text: 'Sign in to answer this.',                                tone: 'text-white/40' },
  }[status];

  return (
    <div className={compact ? 'py-2' : 'p-4 rounded-2xl bg-white/[0.03] border border-white/[0.06]'}>
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-center space-x-2">
          <Cake className="w-3.5 h-3.5 text-white/30 flex-shrink-0" />
          <span className="text-xs font-semibold text-white/70">Year you were born</span>
          <span className="text-[10px] text-white/25">optional</span>
        </div>
        <button
          type="button"
          onClick={() => setShowWhy(w => !w)}
          className="p-1 rounded-lg hover:bg-white/[0.06] transition"
          aria-label="Why we ask"
        >
          <Info className="w-3 h-3 text-white/25" />
        </button>
      </div>

      {showWhy && (
        <p className="text-[11px] text-white/40 leading-relaxed mb-2.5">
          Artists see the age mix of their listeners as ranges — never your year, never
          your name, and never a group small enough to point at one person. It helps them
          decide where to play and who to make music for. Leave it blank if you would
          rather not, nothing changes either way.
        </p>
      )}

      <div className="flex items-center gap-2">
        <select
          value={year}
          onChange={e => setYear(e.target.value)}
          className="flex-1 bg-white/[0.06] rounded-xl px-3 py-2.5 text-sm text-white outline-none appearance-none"
        >
          <option value="">Prefer not to say</option>
          {years.map(y => <option key={y} value={y}>{y}</option>)}
        </select>

        <button
          type="button"
          onClick={() => save(year)}
          disabled={saving}
          className="flex items-center space-x-1.5 px-3.5 py-2.5 rounded-xl text-xs font-semibold bg-white text-black disabled:opacity-50 transition active:scale-95"
        >
          {saving ? <Loader className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
          <span>{saving ? 'Saving' : 'Save'}</span>
        </button>

        {/* Skip is a real answer, not a nag to dismiss. It closes the prompt
            without writing anything. */}
        {!compact && (
          <button
            type="button"
            onClick={() => { if (onDone) onDone(); }}
            className="px-3 py-2.5 text-xs text-white/30 hover:text-white/60 transition"
          >
            Skip
          </button>
        )}
      </div>

      {message && <p className={`text-[11px] mt-2 ${message.tone}`}>{message.text}</p>}
    </div>
  );
}