// src/components/legal/RetailSubmitGate.js
//
// The agreement, as a gate in the app rather than a document anyone emails.
//
// It replaces a window.prompt that asked for a pitch note and submitted with
// no terms attached at all. Now the two documents are fetched from
// legal_documents, shown in full, and the submit button stays disabled until
// the artist has actually reached the bottom of each one and ticked the box.
//
// The scroll requirement is not theatre. An agreement nobody could have read
// is worth very little if it is ever tested, and "I had to scroll it" is a
// materially better record than "a checkbox was pre-ticked on a page".
//
// Submitting calls submit_retail_pitch(), which writes the pitch and both
// acceptances in one transaction. There is no path here that creates a pitch
// without a recorded acceptance, because the client does not insert the pitch
// at all — the database does.

import React from 'react';
import { X, Check, Loader, FileText, ArrowDown } from 'lucide-react';
import { supabase } from '../../supabaseClient';
import LegalMarkdown from './LegalMarkdown';

const SLUGS = ['retail-submission-terms', 'retail-licence'];

export default function RetailSubmitGate({ track, onClose, onSubmitted }) {
  const [docs, setDocs]       = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError]     = React.useState('');
  const [tab, setTab]         = React.useState(0);
  const [readEnd, setReadEnd] = React.useState({});   // slug -> reached the bottom
  const [agreed, setAgreed]   = React.useState(false);
  const [note, setNote]       = React.useState('');
  const [busy, setBusy]       = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error: err } = await supabase
        .from('legal_documents')
        .select('id, slug, version, title, summary, body')
        .in('slug', SLUGS)
        .eq('is_current', true);

      if (cancelled) return;
      setLoading(false);

      if (err) {
        // 42P01 / PGRST205 mean migration 123 has not run. Say so plainly
        // rather than showing an empty box.
        setError(
          err.code === '42P01' || err.code === 'PGRST205'
            ? 'The retail terms are not published yet. Nothing was submitted.'
            : 'Could not load the terms: ' + err.message
        );
        return;
      }
      // Submission terms first — it is the one that applies right now.
      const ordered = SLUGS.map(s => (data || []).find(d => d.slug === s)).filter(Boolean);
      if (ordered.length < 2) {
        setError('The retail terms are not published yet. Nothing was submitted.');
        return;
      }
      setDocs(ordered);
    })();
    return () => { cancelled = true; };
  }, []);

  const current = docs[tab];
  const allRead = docs.length > 0 && docs.every(d => readEnd[d.slug]);

  const onScroll = (e) => {
    if (!current) return;
    const el = e.currentTarget;
    // 24px of slack: a trackpad rarely lands exactly on the last pixel.
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 24) {
      setReadEnd(prev => (prev[current.slug] ? prev : { ...prev, [current.slug]: true }));
    }
  };

  const submit = async () => {
    setBusy(true);
    setError('');
    const { data, error: err } = await supabase.rpc('submit_retail_pitch', {
      p_track_id: track.id,
      p_note: note.trim() || null,
    });
    setBusy(false);

    if (err) {
      setError(err.message || 'Could not submit. Nothing was saved.');
      return;
    }
    onSubmitted?.(data);
  };

  return (
    <div
      className="fixed inset-0 z-[300] bg-black/85 backdrop-blur-sm flex items-end sm:items-center justify-center sm:p-6"
      onClick={onClose}
    >
      <div
        className="w-full sm:max-w-2xl max-h-[92vh] sm:max-h-[88vh] flex flex-col rounded-t-2xl sm:rounded-2xl overflow-hidden"
        style={{
          background: 'linear-gradient(180deg, rgba(26,20,44,0.99) 0%, rgba(13,13,17,0.99) 100%)',
          border: '1px solid rgba(167,139,250,0.22)',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3 px-5 pt-5 pb-4 border-b border-white/[0.07] flex-shrink-0">
          <div className="min-w-0">
            <p className="text-[10px] uppercase tracking-[0.2em] text-purple-400 font-bold mb-1">Feelz Retail</p>
            <h2 className="text-lg font-bold text-white truncate">Submit “{track?.title}”</h2>
            <p className="text-xs text-white/35 mt-0.5">Read both, then agree. It takes a few minutes and it is worth it.</p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/[0.06] hover:bg-white/[0.12] flex items-center justify-center flex-shrink-0 transition"
          >
            <X className="w-4 h-4 text-white/60" />
          </button>
        </div>

        {loading ? (
          <div className="flex justify-center py-20"><Loader className="w-5 h-5 text-white/30 animate-spin" /></div>
        ) : error && docs.length === 0 ? (
          <div className="px-5 py-12 text-center">
            <FileText className="w-8 h-8 text-white/10 mx-auto mb-3" />
            <p className="text-sm text-white/50">{error}</p>
          </div>
        ) : (
          <>
            {/* Which document */}
            <div className="flex items-center gap-1 px-5 pt-4 flex-shrink-0">
              {docs.map((d, i) => (
                <button
                  key={d.slug}
                  onClick={() => setTab(i)}
                  className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold transition ${
                    tab === i ? 'bg-white/[0.1] text-white' : 'text-white/40 hover:text-white/70'
                  }`}
                >
                  {readEnd[d.slug] && <Check className="w-3 h-3 text-emerald-400" />}
                  {d.slug === 'retail-licence' ? 'If accepted' : 'On submitting'}
                </button>
              ))}
            </div>

            {current?.summary && (
              <p className="px-5 pt-3 text-xs text-white/45 leading-relaxed flex-shrink-0">{current.summary}</p>
            )}

            {/* The document */}
            <div
              key={current?.slug}
              onScroll={onScroll}
              className="flex-1 overflow-y-auto px-5 py-4 min-h-[180px]"
            >
              <p className="text-[11px] text-white/25 mb-3">
                {current?.title} · version {current?.version}
              </p>
              <LegalMarkdown body={current?.body} />
              <div className="h-2" />
            </div>

            {!readEnd[current?.slug] && (
              <div className="px-5 pb-1 flex items-center gap-1.5 text-[11px] text-amber-300/80 flex-shrink-0">
                <ArrowDown className="w-3 h-3" />
                Scroll to the end of this one to continue
              </div>
            )}

            {/* Agree and submit */}
            <div className="px-5 py-4 border-t border-white/[0.07] flex-shrink-0 space-y-3">
              <input
                className="w-full px-3 py-2.5 bg-white/[0.06] rounded-lg text-white text-sm outline-none focus:bg-white/[0.1] transition"
                placeholder="Where does this fit? Optional, and it is read."
                value={note}
                onChange={e => setNote(e.target.value)}
                maxLength={300}
              />

              <label className={`flex items-start gap-2.5 ${allRead ? 'cursor-pointer' : 'opacity-40 cursor-not-allowed'}`}>
                <input
                  type="checkbox"
                  disabled={!allRead}
                  checked={agreed}
                  onChange={e => setAgreed(e.target.checked)}
                  className="mt-0.5 w-4 h-4 accent-purple-500 flex-shrink-0"
                />
                <span className="text-xs text-white/60 leading-relaxed">
                  I have read both, I agree to them, and I confirm this track is mine to submit —
                  including anyone who features on it, and anything sampled in it.
                </span>
              </label>

              {error && <p className="text-xs text-red-400">{error}</p>}

              <div className="flex items-center gap-2">
                <button
                  onClick={submit}
                  disabled={!allRead || !agreed || busy}
                  className="flex-1 py-3 rounded-xl bg-purple-500 hover:bg-purple-400 text-white text-sm font-bold transition disabled:opacity-30 flex items-center justify-center gap-2"
                >
                  {busy ? <Loader className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                  Agree and submit
                </button>
                <button onClick={onClose} className="px-4 py-3 text-sm text-white/40 hover:text-white/70 transition">
                  Cancel
                </button>
              </div>

              <p className="text-[10px] text-white/20 leading-relaxed">
                Your agreement is recorded against version {docs.map(d => d.version).join(' and ')} of these
                documents. If we change them later, this track stays on the version you agreed to, and you can
                read it any time from your Payment Settings.
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}