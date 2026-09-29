// src/pages/AdminFeed.js
//
// The oversight panel for the For You scoring model.
//
// WHY THIS PAGE EXISTS
//
// Until now the numbers that decide what every listener hears were four
// literals sitting in netlify/functions/compute-behavior-profiles.js. Changing
// one meant a code edit and a deploy, there was no record of what was running
// last month, and there was no way to tell whether a change helped or hurt.
// Migration 202 moved those numbers into feed_weights, versioned, one row per
// set, never edited. This page is the front of that.
//
// The point is not the sliders. The point is the curve above them. A weight is
// meaningless on its own: weight_full = 3 says nothing until you can see that
// 46% of plays land in that band. Drag a threshold and the bars recolour, so
// you are always moving a line across real plays rather than typing a number
// into a box and hoping.
//
// THE HOLDOUT IS THE HONEST PART
//
// A share of listeners stay on the original set whatever is activated. Without
// it, "completion went up after I changed the weights" is a sentence with no
// evidence in it, because completion moves on its own. Test versus control in
// the same fortnight is the only comparison that means anything, and it is at
// the bottom of this page.
//
// WHAT IT DOES NOT DO
//
// It does not tune itself. That is the eventual goal and this is the thing
// that has to exist first: you cannot let a machine optimise a number it has
// no way to measure.
//
// A NOTE ON THE COLOURS
//
// The bars are inline SVG fills with literal hex values rather than Tailwind
// purple classes, on purpose. src/index.css overrides .bg-purple-500 and
// .bg-purple-600 to var(--app-accent) with !important, and the accent shifts
// with the listener theme, so Tailwind purple classes would have collapsed
// every band to one colour and the scale would have said nothing.
//
// The scale is diverging: grey at zero because a weight of zero means no
// signal, purple as a weight goes positive, amber as it goes negative. All
// five steps clear 3:1 against the card surface.

import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { ArrowLeft, Loader, Check, RotateCcw, AlertTriangle, Info } from 'lucide-react';
import { supabase } from '../supabaseClient';
import { useAuth } from '../contexts/AuthContext';

// ── The scale ───────────────────────────────────────────────────────────────

const NEUTRAL = '#6e6e78';
const POS = ['#9a6ff0', '#b794fb'];
const NEG = ['#d1893f', '#e8a855'];

// Colour follows the weight, not the band's position in the row. So when a
// band that scored nothing is given a weight, it lights up, which is the
// feedback that makes the dials legible.
function bandColor(weight, maxAbs) {
  const w = Number(weight) || 0;
  if (w === 0) return NEUTRAL;
  const span = Math.max(maxAbs, 1);
  const strong = Math.abs(w) / span > 0.55;
  return w > 0 ? (strong ? POS[1] : POS[0]) : (strong ? NEG[1] : NEG[0]);
}

const BANDS = [
  { key: 'abandon', wKey: 'weight_abandon', label: 'Abandoned',      hint: 'Stopped almost straight away' },
  { key: 'weak',    wKey: 'weight_weak',    label: 'Barely played',  hint: 'Left early' },
  { key: 'partial', wKey: 'weight_partial', label: 'Part played',    hint: 'Stayed with it a while' },
  { key: 'full',    wKey: 'weight_full',    label: 'Played through', hint: 'Heard it out' },
];

const FIELDS = [
  'threshold_abandon', 'threshold_partial', 'threshold_full',
  'weight_abandon', 'weight_weak', 'weight_partial', 'weight_full',
  'recency_half_life', 'affinity_min_weight',
];

const WINDOWS = [7, 14, 30, 90];

// The band a completion percentage falls in, given a set of thresholds.
function bandIndexAt(pct, s) {
  if (pct < Number(s.threshold_abandon)) return 0;
  if (pct < Number(s.threshold_partial)) return 1;
  if (pct < Number(s.threshold_full)) return 2;
  return 3;
}

const card = 'rounded-2xl border border-white/[0.07] bg-white/[0.02] p-5';
const heading = 'text-xs font-bold text-white/50 uppercase tracking-wide';

export default function AdminFeed() {
  const navigate = useNavigate();
  const { isAdmin, user } = useAuth();

  const [loading, setLoading] = React.useState(true);
  const [sets, setSets] = React.useState([]);
  const [draft, setDraft] = React.useState(null);
  const [days, setDays] = React.useState(30);
  const [histogram, setHistogram] = React.useState([]);
  const [sources, setSources] = React.useState([]);
  const [arms, setArms] = React.useState([]);
  const [entries, setEntries] = React.useState(null);
  const [holdout, setHoldout] = React.useState('10');
  const [holdoutSaved, setHoldoutSaved] = React.useState('10');
  const [label, setLabel] = React.useState('');
  const [note, setNote] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [toast, setToast] = React.useState('');
  const [error, setError] = React.useState('');
  const [hover, setHover] = React.useState(null);

  // Up here with the other hooks rather than beside the chart they belong to,
  // because the admin guard below returns early and a hook after it would not
  // run on every render.
  const svgRef = React.useRef(null);
  const dragging = React.useRef(null);

  const showToast = (m) => { setToast(m); setTimeout(() => setToast(''), 3000); };

  React.useEffect(() => { if (!isAdmin) navigate('/hub'); }, [isAdmin, navigate]);

  // ── Loading ───────────────────────────────────────────────────────────────

  const loadSets = React.useCallback(async () => {
    const { data, error: e } = await supabase
      .from('feed_weights')
      .select('*')
      .order('id', { ascending: false });
    if (e) { setError('Could not read the weight sets: ' + e.message); setLoading(false); return; }
    setSets(data || []);
    const live = (data || []).find(r => r.is_active);
    if (live) setDraft(Object.fromEntries(FIELDS.map(f => [f, Number(live[f])])));
    setLoading(false);
  }, []);

  const loadStats = React.useCallback(async (d) => {
    const [h, s, a, en, ps] = await Promise.all([
      supabase.rpc('feed_completion_histogram', { p_days: d }),
      supabase.rpc('feed_source_stats', { p_days: d }),
      supabase.rpc('feed_holdout_compare', { p_days: d }),
      // Added by migration 203. Missing on a database where only 202 has been
      // run, and the page carries on without the table rather than failing.
      supabase.rpc('feed_entry_stats', { p_days: d }),
      supabase.from('platform_settings').select('value').eq('key', 'feed_holdout_pct').maybeSingle(),
    ]);
    // Buckets with no plays come back missing, not as zero. Filling them in
    // matters: a gap in the middle of the curve would be drawn as if the
    // neighbouring bars were adjacent, which quietly changes the shape.
    const byFrom = Object.fromEntries((h.data || []).map(r => [Number(r.bucket_from), Number(r.plays)]));
    setHistogram(Array.from({ length: 10 }, (_, i) => ({
      from: i * 10, to: i * 10 + 10, plays: byFrom[i * 10] || 0,
    })));
    setSources(s.data || []);
    setArms(a.data || []);
    setEntries(en.error ? null : (en.data || []));
    const pct = ps.data?.value ?? '10';
    setHoldout(String(pct));
    setHoldoutSaved(String(pct));
  }, []);

  React.useEffect(() => { if (isAdmin) loadSets(); }, [isAdmin, loadSets]);
  React.useEffect(() => { if (isAdmin) loadStats(days); }, [isAdmin, days, loadStats]);

  const active = sets.find(r => r.is_active) || null;
  const control = sets.length ? sets[sets.length - 1] : null; // oldest, by the same rule feed_weights_for uses

  const dirty = React.useMemo(() => {
    if (!active || !draft) return false;
    return FIELDS.some(f => Number(active[f]) !== Number(draft[f]));
  }, [active, draft]);

  // ── The numbers under the curve ───────────────────────────────────────────

  const totalPlays = histogram.reduce((n, b) => n + b.plays, 0);

  // Share of plays per band. Thresholds are exact percentages and the
  // histogram is bucketed in tens, so a threshold inside a bucket is
  // apportioned across it. That is an estimate and the page says so.
  const bandShare = React.useCallback((s) => {
    const out = [0, 0, 0, 0];
    if (!s) return out;
    for (const b of histogram) {
      if (!b.plays) continue;
      const perPct = b.plays / 10;
      for (let p = b.from; p < b.to; p++) out[bandIndexAt(p, s)] += perPct;
    }
    return out;
  }, [histogram]);

  const activeShare = React.useMemo(() => bandShare(active), [bandShare, active]);
  const draftShare = React.useMemo(() => bandShare(draft), [bandShare, draft]);

  const meanScore = React.useCallback((s, share) => {
    if (!s || !totalPlays) return 0;
    return share.reduce((n, plays, i) => n + plays * Number(s[BANDS[i].wKey]), 0) / totalPlays;
  }, [totalPlays]);

  const zeroShare = React.useCallback((s, share) => {
    if (!s || !totalPlays) return 0;
    return 100 * share.reduce((n, plays, i) => n + (Number(s[BANDS[i].wKey]) === 0 ? plays : 0), 0) / totalPlays;
  }, [totalPlays]);

  const maxAbsWeight = draft
    ? Math.max(...BANDS.map(b => Math.abs(Number(draft[b.wKey]) || 0)), 1)
    : 1;

  // ── Editing ───────────────────────────────────────────────────────────────

  // Thresholds are kept in order as they are dragged rather than being allowed
  // to cross and then rejected on save. A crossed pair is not an error to
  // report, it is a state the model cannot be in.
  const setField = (field, raw) => {
    setDraft(d => {
      // GAP is 5 rather than 1 for a reason found by testing: at 1 the three
      // handles can be dragged into a pile a few percent wide, where they
      // physically overlap on screen and only the topmost one can be picked up
      // again. The two underneath become unreachable and the only way out is a
      // reload. A five point minimum also rules out a band so narrow that
      // almost no play ever lands in it, which is not a model anybody wants.
      const GAP = 5;
      const n = { ...d, [field]: Number(raw) };
      if (field === 'threshold_abandon') {
        n.threshold_partial = Math.max(n.threshold_partial, n.threshold_abandon + GAP);
        n.threshold_full = Math.max(n.threshold_full, n.threshold_partial + GAP);
      }
      if (field === 'threshold_partial') {
        n.threshold_abandon = Math.min(n.threshold_abandon, n.threshold_partial - GAP);
        n.threshold_full = Math.max(n.threshold_full, n.threshold_partial + GAP);
      }
      if (field === 'threshold_full') {
        n.threshold_partial = Math.min(n.threshold_partial, n.threshold_full - GAP);
        n.threshold_abandon = Math.min(n.threshold_abandon, n.threshold_partial - GAP);
      }
      // Clamped last, and upwards, so a handle pushed against the end of the
      // scale cannot drag the others off it.
      n.threshold_abandon = Math.max(1, Math.min(100 - 2 * GAP, n.threshold_abandon));
      n.threshold_partial = Math.max(n.threshold_abandon + GAP, Math.min(100 - GAP, n.threshold_partial));
      n.threshold_full = Math.max(n.threshold_partial + GAP, Math.min(100, n.threshold_full));
      return n;
    });
  };

  const resetDraft = () => {
    if (!active) return;
    setDraft(Object.fromEntries(FIELDS.map(f => [f, Number(active[f])])));
    setLabel(''); setNote('');
  };

  // A save always writes a new row. Editing a row in place would rewrite what
  // was running when last month's numbers were measured, which is the one
  // thing this table exists to prevent. There is no update policy on the
  // table either, so this is enforced in the database and not just here.
  const saveAndActivate = async () => {
    if (!draft || busy) return;
    const name = label.trim() || `Change of ${new Date().toLocaleDateString('en-GB')}`;
    const ok = window.confirm(
      `Make "${name}" live?\n\n` +
      `Every listener outside the ${holdoutSaved}% holdout moves to these weights the next time ` +
      `profiles are computed. The set you are on now stays stored and you can put it back in one click.`
    );
    if (!ok) return;
    setBusy(true); setError('');

    const row = { ...Object.fromEntries(FIELDS.map(f => [f, Number(draft[f])])), label: name, created_by: user?.id || null };
    if (note.trim()) row.note = note.trim();

    const { data: made, error: e1 } = await supabase
      .from('feed_weights').insert(row).select('id').single();
    if (e1 || !made) { setError('Could not save the set: ' + (e1?.message || 'no row returned')); setBusy(false); return; }

    const { error: e2 } = await supabase.rpc('activate_feed_weights', { p_id: made.id });
    if (e2) {
      setError('The set was saved but could not be made live: ' + e2.message + '. It is in the list below, so you can activate it from there.');
      setBusy(false); await loadSets(); return;
    }
    setLabel(''); setNote('');
    await loadSets();
    setBusy(false);
    showToast(`"${name}" is live.`);
  };

  const activateExisting = async (row) => {
    if (busy) return;
    const ok = window.confirm(`Go back to "${row.label}"?\n\nThis is what was running ${row.activated_at ? `from ${new Date(row.activated_at).toLocaleDateString('en-GB')}` : 'before'}.`);
    if (!ok) return;
    setBusy(true); setError('');
    const { error: e } = await supabase.rpc('activate_feed_weights', { p_id: row.id });
    if (e) { setError('Could not switch: ' + e.message); setBusy(false); return; }
    await loadSets();
    setBusy(false);
    showToast(`"${row.label}" is live.`);
  };

  const saveHoldout = async () => {
    const n = parseInt(holdout, 10);
    if (!Number.isFinite(n) || n < 0 || n > 50) { setError('The holdout has to be between 0 and 50 percent.'); return; }
    setBusy(true); setError('');
    const { error: e } = await supabase.from('platform_settings')
      .upsert({ key: 'feed_holdout_pct', value: String(n), updated_at: new Date().toISOString() });
    setBusy(false);
    if (e) { setError('Could not save the holdout: ' + e.message); return; }
    setHoldoutSaved(String(n));
    showToast(n === 0 ? 'Holdout off. Nothing is being measured against a control any more.' : `Holdout is ${n}%.`);
  };

  if (!isAdmin) return null;

  // ── The curve ─────────────────────────────────────────────────────────────

  const W = 720, H = 260, PAD_L = 44, PAD_R = 14, PAD_T = 16, PAD_B = 34;
  const plotW = W - PAD_L - PAD_R, plotH = H - PAD_T - PAD_B;
  const maxPlays = Math.max(1, ...histogram.map(b => b.plays));
  const xAt = (pct) => PAD_L + (pct / 100) * plotW;
  const yAt = (plays) => PAD_T + plotH - (plays / maxPlays) * plotH;

  const pctFromEvent = (e) => {
    const svg = svgRef.current;
    if (!svg) return 0;
    const r = svg.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * W;
    return Math.round(Math.max(0, Math.min(100, ((x - PAD_L) / plotW) * 100)));
  };

  const onHandleDown = (field) => (e) => {
    e.preventDefault();
    dragging.current = field;
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };
  const onPointerMove = (e) => {
    if (!dragging.current) return;
    setField(dragging.current, pctFromEvent(e));
  };
  const onPointerUp = () => { dragging.current = null; };

  const handles = draft ? [
    { field: 'threshold_abandon', value: Number(draft.threshold_abandon) },
    { field: 'threshold_partial', value: Number(draft.threshold_partial) },
    { field: 'threshold_full', value: Number(draft.threshold_full) },
  ] : [];

  return (
    <div className="pt-4 pb-32 px-4 md:px-8 max-w-6xl mx-auto">
      <Helmet><title>Feed Weights</title><meta name="robots" content="noindex, nofollow" /></Helmet>

      {/* Range inputs are styled here rather than with accent-color. On this
          dark page the browser's default unfilled track is white, which made
          every dial read as very nearly at its maximum whatever it was set to:
          a slider at zero looked like a slider at ten. accent-color only
          colours the filled part and the thumb, so it does not help. */}
      <style>{`
        .fm-dial {
          -webkit-appearance: none; appearance: none;
          width: 100%; height: 18px; background: transparent; cursor: pointer;
        }
        .fm-dial::-webkit-slider-runnable-track {
          height: 4px; border-radius: 999px; background: rgba(255,255,255,0.12);
        }
        .fm-dial::-moz-range-track {
          height: 4px; border-radius: 999px; background: rgba(255,255,255,0.12);
        }
        .fm-dial::-moz-range-progress {
          height: 4px; border-radius: 999px; background: var(--app-accent, #8B5CF6);
        }
        .fm-dial::-webkit-slider-thumb {
          -webkit-appearance: none; appearance: none;
          width: 16px; height: 16px; margin-top: -6px; border-radius: 999px;
          background: #ffffff; border: 3px solid var(--app-accent, #8B5CF6);
        }
        .fm-dial::-moz-range-thumb {
          width: 16px; height: 16px; border-radius: 999px;
          background: #ffffff; border: 3px solid var(--app-accent, #8B5CF6);
        }
        .fm-dial:focus-visible { outline: 2px solid rgba(255,255,255,0.4); outline-offset: 4px; }
      `}</style>

      {toast && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-xl bg-white/10 backdrop-blur-md border border-white/10 text-sm text-white font-medium shadow-lg">
          {toast}
        </div>
      )}

      <div className="flex items-center space-x-3 mb-6">
        <button onClick={() => navigate('/hub')} className="w-9 h-9 flex items-center justify-center rounded-full bg-white/[0.06] hover:bg-white/[0.1] transition">
          <ArrowLeft className="w-4 h-4 text-white" />
        </button>
        <div>
          <h1 className="text-xl font-bold text-white">Feed Weights</h1>
          <p className="text-xs text-white/30">
            What a play is worth to the For You model, and whether changing it helped.
          </p>
        </div>
      </div>

      {error && (
        <div className="mb-5 flex items-start gap-2.5 rounded-xl border border-amber-500/20 bg-amber-500/[0.07] p-3.5">
          <AlertTriangle className="w-4 h-4 text-amber-300 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-amber-100/80">{error}</p>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-16"><Loader className="w-5 h-5 text-white/30 animate-spin" /></div>
      ) : !active || !draft ? (
        <div className={card}>
          <p className="text-sm text-white/60">No weight sets are stored.</p>
          <p className="text-xs text-white/30 mt-1.5">
            Run migration 202_feed_weights.sql in Supabase. It seeds the set the code is already
            using, so applying it changes nothing for anybody.
          </p>
        </div>
      ) : (
        <>
          {/* ── Window ──────────────────────────────────────────────────── */}
          <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
            <div className="flex items-center gap-1.5">
              {WINDOWS.map(d => (
                <button key={d} onClick={() => setDays(d)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                    days === d ? 'bg-white/[0.14] text-white' : 'bg-white/[0.04] text-white/40 hover:bg-white/[0.08]'
                  }`}>
                  {d} days
                </button>
              ))}
            </div>
            <p className="text-xs text-white/30">
              {totalPlays.toLocaleString()} scorable {totalPlays === 1 ? 'play' : 'plays'} in this window
            </p>
          </div>

          {/* ── The curve ───────────────────────────────────────────────── */}
          <div className={`${card} mb-5`}>
            <div className="flex items-baseline justify-between mb-1">
              <p className={heading}>How far people actually get</p>
              <p className="text-xs text-white/25">Drag the lines</p>
            </div>
            <p className="text-xs text-white/30 mb-4">
              Every bar is a tenth of a track. The lines are the band edges, and the colour of a bar
              is what a play there is worth: grey scores nothing, purple counts for, amber counts against.
            </p>

            {totalPlays === 0 ? (
              <p className="text-sm text-white/40 py-8 text-center">
                No plays with a completion figure in the last {days} days.
              </p>
            ) : (
              <div className="relative">
                <svg
                  ref={svgRef}
                  viewBox={`0 0 ${W} ${H}`}
                  className="w-full select-none touch-none"
                  style={{ height: 'auto' }}
                  onPointerMove={onPointerMove}
                  onPointerUp={onPointerUp}
                  onPointerLeave={() => { onPointerUp(); setHover(null); }}
                >
                  <defs>
                    {histogram.map((b, i) => (
                      <clipPath key={i} id={`fmbar${i}`}>
                        <rect
                          x={xAt(b.from) + 1} y={yAt(b.plays)}
                          width={Math.max(0, (plotW / 10) - 2)}
                          height={Math.max(0, PAD_T + plotH - yAt(b.plays))}
                          rx="4" ry="4"
                        />
                      </clipPath>
                    ))}
                  </defs>

                  {/* Grid. Recessive on purpose: it is a reference, not content. */}
                  {[0, 0.25, 0.5, 0.75, 1].map(f => (
                    <line key={f}
                      x1={PAD_L} x2={W - PAD_R}
                      y1={PAD_T + plotH - f * plotH} y2={PAD_T + plotH - f * plotH}
                      stroke="rgba(255,255,255,0.06)" strokeWidth="1" />
                  ))}
                  {[0, 0.5, 1].map(f => (
                    <text key={f} x={PAD_L - 8} y={PAD_T + plotH - f * plotH + 3}
                      textAnchor="end" fill="rgba(255,255,255,0.3)" fontSize="10">
                      {Math.round(f * maxPlays).toLocaleString()}
                    </text>
                  ))}

                  {/* The bars, each clipped to a rounded top and painted in
                      band segments, so a threshold visibly cuts through a bar
                      rather than snapping to the nearest tenth. */}
                  {histogram.map((b, i) => {
                    const y = yAt(b.plays);
                    const h = Math.max(0, PAD_T + plotH - y);
                    const edges = [0, Number(draft.threshold_abandon), Number(draft.threshold_partial), Number(draft.threshold_full), 100];
                    return (
                      <g key={i} clipPath={`url(#fmbar${i})`}>
                        {BANDS.map((band, bi) => {
                          const lo = Math.max(b.from, edges[bi]);
                          const hi = Math.min(b.to, edges[bi + 1]);
                          if (hi <= lo) return null;
                          return (
                            <rect key={band.key}
                              x={xAt(lo)} y={y} width={xAt(hi) - xAt(lo)} height={h}
                              fill={bandColor(draft[band.wKey], maxAbsWeight)} />
                          );
                        })}
                      </g>
                    );
                  })}

                  {/* Hover targets: full-height so a short bar is still easy
                      to hit, which a 3px bar never is. */}
                  {histogram.map((b, i) => (
                    <rect key={`h${i}`}
                      x={xAt(b.from)} y={PAD_T} width={plotW / 10} height={plotH}
                      fill="transparent"
                      onPointerEnter={() => !dragging.current && setHover(i)}
                    />
                  ))}

                  {/* Threshold lines and their handles. */}
                  {handles.map(hd => (
                    <g key={hd.field}>
                      <line x1={xAt(hd.value)} x2={xAt(hd.value)} y1={PAD_T - 6} y2={PAD_T + plotH}
                        stroke="rgba(255,255,255,0.8)" strokeWidth="2" />
                      {/* The visible pill is 28 units wide, about 26 real
                          pixels on a phone, which is too small for a thumb.
                          This invisible rect behind it is the target you
                          actually hit. It is kept to the strip around the
                          axis rather than run up the full height of the
                          plot, because a tall one would sit over the bars and
                          swallow the hover tooltip in a band either side of
                          every threshold. */}
                      <rect
                        x={xAt(hd.value) - 24} y={PAD_T + plotH - 12}
                        width="48" height="34"
                        fill="transparent"
                        className="cursor-ew-resize"
                        onPointerDown={onHandleDown(hd.field)}
                      />
                      <rect
                        x={xAt(hd.value) - 14} y={PAD_T + plotH}
                        width="28" height="20" rx="6"
                        fill="rgba(255,255,255,0.14)" stroke="rgba(255,255,255,0.3)" strokeWidth="1"
                        className="cursor-ew-resize"
                        onPointerDown={onHandleDown(hd.field)}
                      />
                      <text x={xAt(hd.value)} y={PAD_T + plotH + 14} textAnchor="middle"
                        fill="#ffffff" fontSize="10" fontWeight="700" pointerEvents="none">
                        {hd.value}
                      </text>
                    </g>
                  ))}

                  <text x={PAD_L} y={H - 4} fill="rgba(255,255,255,0.3)" fontSize="10">0%</text>
                  <text x={W - PAD_R} y={H - 4} textAnchor="end" fill="rgba(255,255,255,0.3)" fontSize="10">100% of the track</text>
                </svg>

                {hover !== null && histogram[hover] && (
                  <div
                    className="absolute -top-1 px-2.5 py-1.5 rounded-lg bg-black/85 border border-white/10 text-xs text-white pointer-events-none whitespace-nowrap"
                    style={{ left: `${(xAt(histogram[hover].from + 5) / W) * 100}%`, transform: 'translateX(-50%)' }}
                  >
                    {histogram[hover].from} to {histogram[hover].to}% ·{' '}
                    {histogram[hover].plays.toLocaleString()} plays ·{' '}
                    {totalPlays ? Math.round(100 * histogram[hover].plays / totalPlays) : 0}% of the window
                  </div>
                )}
              </div>
            )}

            {/* The bands, as a table. This is the legend and the readout in one:
                colour is never the only thing carrying identity. */}
            <div className="mt-5 grid grid-cols-2 lg:grid-cols-4 gap-2">
              {BANDS.map((band, i) => {
                const edges = [0, Number(draft.threshold_abandon), Number(draft.threshold_partial), Number(draft.threshold_full), 100];
                const share = totalPlays ? (100 * draftShare[i] / totalPlays) : 0;
                const w = Number(draft[band.wKey]);
                return (
                  <div key={band.key} className="rounded-xl bg-white/[0.03] border border-white/[0.05] p-3">
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0"
                        style={{ backgroundColor: bandColor(w, maxAbsWeight) }} />
                      <p className="text-xs font-semibold text-white truncate">{band.label}</p>
                    </div>
                    <p className="text-[11px] text-white/35 mb-2">{band.hint}</p>
                    <p className="text-[11px] text-white/50">
                      {edges[i]} to {edges[i + 1]}% · {share.toFixed(0)}% of plays
                    </p>
                    <p className="text-sm font-bold mt-1" style={{ color: bandColor(w, maxAbsWeight) }}>
                      {w === 0 ? 'scores nothing' : `worth ${w > 0 ? '+' : ''}${w}`}
                    </p>
                  </div>
                );
              })}
            </div>

            <p className="text-[11px] text-white/25 mt-3">
              Shares are worked out to the nearest tenth of a track, because that is how the plays
              are counted. A threshold inside a bar is split across it.
            </p>
          </div>

          {/* ── The dials ───────────────────────────────────────────────── */}
          <div className={`${card} mb-5`}>
            <p className={`${heading} mb-1`}>The dials</p>
            <p className="text-xs text-white/30 mb-5">
              A weight is what one play in that band adds to a track's, artist's or genre's score for
              one listener. Zero means the play is ignored. Below zero means it counts against.
            </p>

            <div className="space-y-4">
              {BANDS.map(band => (
                <Dial key={band.wKey}
                  label={`${band.label} is worth`}
                  hint={band.key === 'abandon'
                    ? 'Kept at zero today: a fast skip is mostly about the mood somebody is in, not the song'
                    : band.key === 'weak'
                    ? 'Also zero today. This is the one worth testing first'
                    : null}
                  min={-5} max={10} step={0.5}
                  value={draft[band.wKey]}
                  was={Number(active[band.wKey])}
                  onChange={v => setDraft(d => ({ ...d, [band.wKey]: v }))}
                  format={v => (v === 0 ? '0' : `${v > 0 ? '+' : ''}${v}`)}
                />
              ))}

              <div className="h-px bg-white/[0.06]" />

              <Dial
                label="Forgetting speed"
                hint="Days for a play to be worth half as much. Zero means a play from last month counts the same as one from this morning, which is what happens today."
                min={0} max={90} step={1}
                value={draft.recency_half_life}
                was={Number(active.recency_half_life)}
                onChange={v => setDraft(d => ({ ...d, recency_half_life: v }))}
                format={v => (v === 0 ? 'off' : `${v} days`)}
              />

              <Dial
                label="Counts towards an artist from"
                hint="The smallest weight a play must be worth before it counts as liking the artist, rather than just the track."
                min={0} max={5} step={0.5}
                value={draft.affinity_min_weight}
                was={Number(active.affinity_min_weight)}
                onChange={v => setDraft(d => ({ ...d, affinity_min_weight: v }))}
                format={v => `${v}`}
              />
            </div>
          </div>

          {/* ── What this would change ──────────────────────────────────── */}
          <div className={`${card} mb-5`}>
            <p className={`${heading} mb-4`}>What this would change</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Delta
                label="Plays that count for nothing"
                now={zeroShare(active, activeShare)}
                next={zeroShare(draft, draftShare)}
                suffix="%"
                lowerIsBetter
              />
              <Delta
                label="Average score a play carries"
                now={meanScore(active, activeShare)}
                next={meanScore(draft, draftShare)}
                decimals={2}
              />
            </div>
            <p className="text-xs text-white/30 mt-4">
              Worked out over the {totalPlays.toLocaleString()} plays in this window. It says what the
              model would have made of plays that already happened, not what people will do next.
            </p>
          </div>

          {/* ── Save ────────────────────────────────────────────────────── */}
          <div className={`${card} mb-5`}>
            <p className={`${heading} mb-4`}>Make it live</p>

            {!dirty ? (
              <p className="text-sm text-white/40">
                Nothing has moved. This is "{active.label}", running since{' '}
                {active.activated_at ? new Date(active.activated_at).toLocaleDateString('en-GB') : 'the start'}.
              </p>
            ) : (
              <>
                <input
                  className="w-full px-3 py-2.5 bg-white/[0.06] rounded-lg text-white text-sm outline-none focus:bg-white/[0.1] transition mb-2"
                  placeholder="Name this change, so it means something in six months"
                  value={label} onChange={e => setLabel(e.target.value)} maxLength={80}
                />
                <input
                  className="w-full px-3 py-2.5 bg-white/[0.06] rounded-lg text-white text-sm outline-none focus:bg-white/[0.1] transition mb-4"
                  placeholder="Why, in a line. Optional."
                  value={note} onChange={e => setNote(e.target.value)} maxLength={200}
                />
                <div className="flex items-center gap-2 flex-wrap">
                  <button onClick={saveAndActivate} disabled={busy}
                    className="px-4 py-2.5 rounded-xl bg-white text-black text-sm font-bold hover:bg-white/90 transition disabled:opacity-40 flex items-center gap-2">
                    {busy ? <Loader className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                    Save and make live
                  </button>
                  <button onClick={resetDraft} disabled={busy}
                    className="px-4 py-2.5 rounded-xl bg-white/[0.06] text-white/70 text-sm font-semibold hover:bg-white/[0.1] transition disabled:opacity-40 flex items-center gap-2">
                    <RotateCcw className="w-4 h-4" />
                    Put it back
                  </button>
                </div>
                <p className="text-xs text-white/30 mt-3">
                  This writes a new set rather than editing the one you are on, so going back is one
                  click and the record of what was running stays true.
                </p>
              </>
            )}
          </div>

          {/* ── Holdout ─────────────────────────────────────────────────── */}
          <div className={`${card} mb-5`}>
            <p className={`${heading} mb-1`}>The holdout</p>
            <p className="text-xs text-white/30 mb-4">
              This share of listeners stay on the oldest set no matter what is made live. They are the
              only reason the comparison at the bottom of this page means anything. The same people
              stay on the same side, so nobody is flipped about.
            </p>
            <div className="flex items-center gap-3 flex-wrap">
              <input type="number" min="0" max="50"
                className="w-24 px-3 py-2.5 bg-white/[0.06] rounded-lg text-white text-sm outline-none focus:bg-white/[0.1] transition"
                value={holdout} onChange={e => setHoldout(e.target.value)} />
              <span className="text-sm text-white/40">percent</span>
              <button onClick={saveHoldout} disabled={busy || holdout === holdoutSaved}
                className="px-4 py-2.5 rounded-xl bg-white/[0.06] text-white/70 text-sm font-semibold hover:bg-white/[0.1] transition disabled:opacity-30">
                Save
              </button>
              {control && (
                <span className="text-xs text-white/25">
                  Control set: "{control.label}"
                </span>
              )}
            </div>
            {holdoutSaved === '0' && (
              <div className="mt-3 flex items-start gap-2 text-xs text-amber-200/70">
                <Info className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                <p>At zero there is no control group, so a change in completion cannot be told apart from an ordinary week.</p>
              </div>
            )}
          </div>

          {/* ── Test against control ────────────────────────────────────── */}
          <div className={`${card} mb-5`}>
            <p className={`${heading} mb-1`}>Test against control</p>
            <p className="text-xs text-white/30 mb-4">
              The same {days} days, the two groups side by side. This is the only number that can
              honestly say whether a change worked.
            </p>
            <Table
              head={['Group', 'Listeners', 'Plays', 'Average completion', 'Skip rate']}
              rows={arms.map(a => [
                a.arm, Number(a.listeners).toLocaleString(), Number(a.plays).toLocaleString(),
                `${a.avg_completion ?? '-'}%`, `${a.skip_rate_pct ?? '-'}%`,
              ])}
              empty="Nothing to compare yet."
            />
            {arms.length === 2 && (
              <p className="text-xs text-white/30 mt-3">
                {(() => {
                  const t = arms.find(a => a.arm.startsWith('test'));
                  const c = arms.find(a => a.arm.startsWith('control'));
                  if (!t || !c || !t.avg_completion || !c.avg_completion) return 'Not enough plays on both sides yet.';
                  const d = Number(t.avg_completion) - Number(c.avg_completion);
                  const thin = Number(c.plays) < 200 || Number(t.plays) < 200;
                  if (thin) return `Test is ${d >= 0 ? 'up' : 'down'} ${Math.abs(d).toFixed(1)} points, but one side has under 200 plays, so this is still noise. Leave it a fortnight.`;
                  if (Math.abs(d) < 1.5) return 'The two sides are within a point and a half of each other. That is the same, not an improvement.';
                  return `Test is ${d > 0 ? 'ahead' : 'behind'} by ${Math.abs(d).toFixed(1)} points of completion.`;
                })()}
              </p>
            )}
          </div>

          {/* ── Surfaces ────────────────────────────────────────────────── */}
          <div className={`${card} mb-5`}>
            <p className={`${heading} mb-1`}>Where the plays come from</p>
            <p className="text-xs text-white/30 mb-4">
              If For You completion drops after a change, this is the row that says so.
            </p>
            <Table
              head={['Surface', 'Plays', 'Share', 'Average completion', 'Skip rate']}
              rows={sources.map(s => [
                s.source, Number(s.plays).toLocaleString(),
                s.share_pct != null ? `${s.share_pct}%` : '',
                `${s.avg_completion ?? '-'}%`, `${s.skip_rate_pct ?? '-'}%`,
              ])}
              empty="No plays in this window."
            />
            {sources.some(s => s.source === 'unknown' && Number(s.share_pct) > 5) && (
              <div className="mt-3 flex items-start gap-2 text-xs text-white/40">
                <Info className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                <p>
                  Anything still landing in "unknown" was recorded before the surface fix went out.
                  Only For You, the Home card, artist profiles and School Sessions used to tag
                  themselves, so Library, Browse, albums, playlists and the rest all ended up here.
                  It should fall away over the days after the deploy.
                </p>
              </div>
            )}
          </div>

          {/* ── Where visits came from ──────────────────────────────────── */}
          {entries !== null && (
            <div className={`${card} mb-5`}>
              <p className={`${heading} mb-1`}>Where the visit came from</p>
              <p className="text-xs text-white/30 mb-4">
                Anyone arriving on a link carrying ?from= shows up on their own row. Add
                <span className="text-white/50"> ?from=plugingallery</span> or
                <span className="text-white/50"> ?from=fivem</span> to the links on those
                sites and their plays stop being invisible inside everyone else's.
              </p>
              <Table
                head={['Came from', 'Plays', 'Listeners', 'Average completion', 'Skip rate']}
                rows={entries.map(e => [
                  e.entry, Number(e.plays).toLocaleString(), Number(e.listeners).toLocaleString(),
                  `${e.avg_completion ?? '-'}%`, `${e.skip_rate_pct ?? '-'}%`,
                ])}
                empty="No plays in this window."
              />
            </div>
          )}

          {/* ── History ─────────────────────────────────────────────────── */}
          <div className={card}>
            <p className={`${heading} mb-1`}>Every set that has been live</p>
            <p className="text-xs text-white/30 mb-4">
              Sets are never edited or deleted, so going back to any of these is one click.
            </p>
            <div className="space-y-2">
              {sets.map(s => (
                <div key={s.id}
                  className={`flex items-center gap-3 p-3 rounded-xl border transition ${
                    s.is_active ? 'bg-white/[0.05] border-white/[0.12]' : 'bg-white/[0.02] border-white/[0.05]'
                  }`}>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm text-white truncate">{s.label}</p>
                      {s.is_active && (
                        <span className="px-2 py-0.5 rounded-md bg-white/[0.12] text-[10px] font-bold text-white uppercase tracking-wide">Live</span>
                      )}
                      {control && s.id === control.id && (
                        <span className="px-2 py-0.5 rounded-md bg-white/[0.06] text-[10px] font-bold text-white/50 uppercase tracking-wide">Control</span>
                      )}
                    </div>
                    <p className="text-xs text-white/35 mt-0.5">
                      {s.threshold_abandon}/{s.threshold_partial}/{s.threshold_full} ·{' '}
                      {[s.weight_abandon, s.weight_weak, s.weight_partial, s.weight_full].join(' / ')}
                      {Number(s.recency_half_life) > 0 ? ` · halves in ${s.recency_half_life}d` : ''}
                    </p>
                    {s.note && <p className="text-xs text-white/25 mt-1">{s.note}</p>}
                  </div>
                  {!s.is_active && (
                    <button onClick={() => activateExisting(s)} disabled={busy}
                      className="px-3 py-2 rounded-lg bg-white/[0.06] text-white/70 text-xs font-semibold hover:bg-white/[0.12] transition disabled:opacity-30 flex-shrink-0">
                      Make live
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ── Pieces ──────────────────────────────────────────────────────────────────

function Dial({ label, hint, min, max, step, value, was, onChange, format }) {
  const changed = Number(value) !== Number(was);
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3 mb-1.5">
        <p className="text-sm text-white/80">{label}</p>
        <p className={`text-sm font-bold tabular-nums ${changed ? 'text-white' : 'text-white/50'}`}>
          {format(Number(value))}
          {changed && <span className="text-xs font-normal text-white/30 ml-2">was {format(Number(was))}</span>}
        </p>
      </div>
      <input
        type="range" min={min} max={max} step={step} value={value}
        onChange={e => onChange(Number(e.target.value))}
        className="fm-dial"
      />
      {hint && <p className="text-[11px] text-white/30 mt-1.5">{hint}</p>}
    </div>
  );
}

function Delta({ label, now, next, suffix = '', decimals = 1, lowerIsBetter = false }) {
  const d = next - now;
  const moved = Math.abs(d) >= Math.pow(10, -decimals) / 2;
  const good = lowerIsBetter ? d < 0 : d > 0;
  return (
    <div className="rounded-xl bg-white/[0.03] border border-white/[0.05] p-4">
      <p className="text-xs text-white/40 mb-2">{label}</p>
      <div className="flex items-baseline gap-2 flex-wrap">
        <span className="text-2xl font-bold text-white tabular-nums">
          {next.toFixed(decimals)}{suffix}
        </span>
        {moved && (
          <span className="text-xs tabular-nums" style={{ color: good ? POS[1] : NEG[1] }}>
            {d > 0 ? '+' : ''}{d.toFixed(decimals)}{suffix} from {now.toFixed(decimals)}{suffix}
          </span>
        )}
        {!moved && <span className="text-xs text-white/25">unchanged</span>}
      </div>
    </div>
  );
}

function Table({ head, rows, empty }) {
  if (!rows.length) return <p className="text-sm text-white/40">{empty}</p>;
  return (
    <div className="overflow-x-auto -mx-1 px-1">
      <table className="w-full text-sm">
        <thead>
          <tr>
            {head.map((h, i) => (
              <th key={h} className={`pb-2 text-xs font-semibold text-white/35 ${i === 0 ? 'text-left' : 'text-right'}`}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-t border-white/[0.05]">
              {r.map((c, j) => (
                <td key={j} className={`py-2.5 tabular-nums ${j === 0 ? 'text-left text-white/80' : 'text-right text-white/60'}`}>{c}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}