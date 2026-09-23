// src/pages/AdminPersonas.js
//
// Seed personas: create them, see them, move music onto them, wind them down.
//
// A persona is a platform-owned artist account used to seed the catalogue.
// It cannot sell and cannot be paid: migration 177 forces is_platform_owned,
// blanks PayPal on every write, and makes artist_can_sell false for it
// permanently. So none of the controls on this page can leak money, whatever
// gets typed into them.
//
// A PERSONA HAS NO LOGIN. Nobody signs in as one, and migration 179 forces
// artists.user_id to null on every write, so one cannot be given a login by
// this page, by a script, or by hand in the SQL editor.
//
// Music gets onto a persona one way: upload the track from any normal account
// exactly as usual, then tap "Assign a track" here and pick it. The release
// moves with the track, so the album page and the track page can never credit
// different artists, and nothing is re-uploaded.
//
// Everything here reads and writes through the admin_ functions, which check
// admin themselves, so the browser never holds a policy that can rewrite
// artists.

import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import {
  ArrowLeft, Loader, Plus, Search, Music, UserPlus,
  Pause, Play, Archive, X, ExternalLink,
} from 'lucide-react';
import { supabase } from '../supabaseClient';
import { useAuth } from '../contexts/AuthContext';

const inputCls =
  'w-full px-3 py-2.5 bg-white/[0.06] rounded-lg text-white text-sm outline-none focus:bg-white/[0.1] transition border border-white/[0.06] focus:border-white/20';

// The lanes from the migration's arithmetic: ten lanes, three personas each,
// so no single name carries a playlist. Free text, this is only a shortcut.
const LANES = [
  'lofi', 'soul rnb', 'amapiano', 'afro house', 'jazz lounge',
  'acoustic folk', 'indie pop', 'deep house', 'hip hop instrumental', 'ambient',
];

const STATUS_STYLE = {
  active:   'bg-green-500/15 text-green-300',
  retiring: 'bg-amber-500/15 text-amber-300',
  retired:  'bg-white/[0.06] text-white/40',
};

function readableError(e) {
  return (e?.message || 'That did not work.').replace(/^ERROR:\s*/i, '');
}

export default function AdminPersonas() {
  const navigate = useNavigate();
  const { isAdmin } = useAuth();

  const [roster, setRoster]   = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [busy, setBusy]       = React.useState(false);
  const [toast, setToast]     = React.useState('');
  const [error, setError]     = React.useState('');

  const [showNew, setShowNew] = React.useState(false);
  const [nu, setNu] = React.useState({ name: '', lane: LANES[0], genre: '', mood: '', bio: '', image: '' });

  const [assignFor, setAssignFor] = React.useState(null);   // persona row
  const [query, setQuery]         = React.useState('');
  const [results, setResults]     = React.useState([]);
  const [searching, setSearching] = React.useState(false);

  React.useEffect(() => { if (!isAdmin) navigate('/hub'); }, [isAdmin, navigate]);

  const say = (m) => { setToast(m); setTimeout(() => setToast(''), 3000); };

  const load = React.useCallback(async () => {
    setLoading(true);
    const { data, error: e } = await supabase.rpc('admin_seed_roster');
    if (e) { console.error('[personas] roster failed:', e.code, e.message); setError(readableError(e)); }
    setRoster(data || []);
    setLoading(false);
  }, []);

  React.useEffect(() => { load(); }, [load]);

  const create = async () => {
    setError('');
    if (!nu.name.trim()) { setError('A persona needs a name.'); return; }
    setBusy(true);
    const { error: e } = await supabase.rpc('admin_create_seed_persona', {
      p_artist_name: nu.name.trim(),
      p_lane:        nu.lane || null,
      p_bio:         nu.bio.trim() || null,
      p_genre:       nu.genre.trim() || null,
      p_mood:        nu.mood.trim() || null,
      p_image_url:   nu.image.trim() || null,
    });
    setBusy(false);
    if (e) { setError(readableError(e)); return; }
    setNu({ name: '', lane: nu.lane, genre: '', mood: '', bio: '', image: '' });
    setShowNew(false);
    say('Persona created.');
    load();
  };

  const setStatus = async (row, status) => {
    setBusy(true);
    const { error: e } = await supabase.rpc('admin_set_seed_status', {
      p_artist_id: row.id, p_status: status,
    });
    setBusy(false);
    if (e) { setError(readableError(e)); return; }
    say(
      status === 'retired'  ? `${row.artist_name} retired. Their released tracks are unpublished and remembered, so bringing them back restores the same ones.`
      : status === 'retiring' ? `${row.artist_name} is winding down. Still playing, no longer promoted.`
      : `${row.artist_name} is active again.`
    );
    load();
  };

  // Track search for the assign sheet. Debounced, and it searches titles and
  // artist names, because you usually remember one or the other.
  React.useEffect(() => {
    if (!assignFor) { setResults([]); return; }
    let cancelled = false;
    setSearching(true);
    const t = setTimeout(async () => {
      const { data, error: e } = await supabase.rpc('admin_assignable_tracks', {
        p_search: query || null, p_limit: 50,
      });
      if (cancelled) return;
      if (e) console.error('[personas] track search failed:', e.code, e.message);
      setResults(data || []);
      setSearching(false);
    }, 300);
    return () => { cancelled = true; clearTimeout(t); };
  }, [query, assignFor]);

  const assign = async (track) => {
    setBusy(true);
    const { error: e } = await supabase.rpc('admin_assign_track_to_persona', {
      p_track_id: track.id, p_artist_id: assignFor.id,
    });
    setBusy(false);
    if (e) { setError(readableError(e)); return; }
    say(`"${track.title}" is now ${assignFor.artist_name}.`);
    setResults(rs => rs.map(r => (r.id === track.id
      ? { ...r, artist_id: assignFor.id, artist_name: assignFor.artist_name }
      : r)));
    load();
  };

  const byLane = React.useMemo(() => {
    const m = {};
    roster.forEach(r => { (m[r.seed_lane || 'no lane'] ||= []).push(r); });
    return m;
  }, [roster]);

  const counts = React.useMemo(() => ({
    total:  roster.length,
    active: roster.filter(r => r.seed_status === 'active').length,
    tracks: roster.reduce((n, r) => n + (r.tracks || 0), 0),
    retail: roster.reduce((n, r) => n + (r.retail_tracks || 0), 0),
  }), [roster]);

  return (
    <div className="min-h-screen bg-black text-white pb-28">
      <Helmet><title>Seed personas</title><meta name="robots" content="noindex" /></Helmet>

      {toast && (
        <div className="fixed top-6 left-1/2 -translate-x-1/2 z-[300] px-5 py-3 rounded-xl text-sm bg-white/10 border border-white/15 max-w-[90vw]">
          {toast}
        </div>
      )}

      <div className="flex items-center space-x-3 px-5 pt-6 pb-2">
        <button onClick={() => navigate('/hub')}
          className="w-8 h-8 rounded-full bg-white/[0.06] flex items-center justify-center">
          <ArrowLeft className="w-4 h-4 text-white/60" />
        </button>
        <h1 className="text-lg font-black flex-1">Seed personas</h1>
        <button onClick={() => { setShowNew(s => !s); setError(''); }}
          className="flex items-center space-x-1.5 px-3 py-2 rounded-full bg-white text-black text-xs font-bold">
          <Plus className="w-3.5 h-3.5" /><span>New</span>
        </button>
      </div>

      <p className="px-5 text-[11px] text-white/30 leading-relaxed max-w-lg mb-4">
        Platform-owned accounts that fill the catalogue and the Feelz Retail playlists.
        None of them can sell anything or be paid anything, by design. Target is about 30,
        in 10 lanes of 3, roughly 20 tracks each: three per lane is what stops every
        playlist repeating one name.
      </p>

      <div className="px-5 mb-5 grid grid-cols-4 gap-2 max-w-lg">
        {[
          ['Personas', counts.total], ['Active', counts.active],
          ['Tracks', counts.tracks], ['In Retail', counts.retail],
        ].map(([label, n]) => (
          <div key={label} className="rounded-xl bg-white/[0.03] border border-white/[0.06] p-2.5">
            <p className="text-base font-black">{n}</p>
            <p className="text-[9px] text-white/30 uppercase tracking-wide">{label}</p>
          </div>
        ))}
      </div>

      {error && (
        <div className="mx-5 mb-4 p-3 rounded-xl bg-red-500/10 border border-red-500/20 max-w-lg">
          <p className="text-[11px] text-red-300 leading-relaxed">{error}</p>
        </div>
      )}

      {/* New persona */}
      {showNew && (
        <div className="mx-5 mb-5 p-4 rounded-2xl bg-white/[0.03] border border-white/[0.06] space-y-3 max-w-lg">
          <input className={inputCls} placeholder="Artist name" value={nu.name}
            onChange={e => setNu(v => ({ ...v, name: e.target.value }))} />
          <div className="flex space-x-2">
            <select className={inputCls} value={nu.lane}
              onChange={e => setNu(v => ({ ...v, lane: e.target.value }))}>
              {LANES.map(l => <option key={l} value={l} className="bg-black">{l}</option>)}
            </select>
            <input className={inputCls} placeholder="Genre" value={nu.genre}
              onChange={e => setNu(v => ({ ...v, genre: e.target.value }))} />
          </div>
          <input className={inputCls} placeholder="Mood" value={nu.mood}
            onChange={e => setNu(v => ({ ...v, mood: e.target.value }))} />
          <input className={inputCls} placeholder="Profile image URL" value={nu.image}
            onChange={e => setNu(v => ({ ...v, image: e.target.value }))} />
          <textarea className={`${inputCls} h-20 resize-none`} placeholder="Bio"
            value={nu.bio} onChange={e => setNu(v => ({ ...v, bio: e.target.value }))} />
          <button onClick={create} disabled={busy}
            className="w-full py-3 rounded-xl bg-white text-black text-sm font-bold disabled:opacity-30">
            {busy ? 'Creating…' : 'Create persona'}
          </button>
          <p className="text-[10px] text-white/20 leading-relaxed">
            Personas have no logins. To give one music, upload the track from your own
            account as usual, then use "Assign a track" on its card below.
          </p>
        </div>
      )}

      {/* Roster */}
      <div className="px-5 space-y-5 max-w-lg">
        {loading ? (
          <div className="flex justify-center py-10"><Loader className="w-5 h-5 animate-spin text-white/20" /></div>
        ) : roster.length === 0 ? (
          <div className="flex flex-col items-center py-10 space-y-2">
            <UserPlus className="w-6 h-6 text-white/15" />
            <p className="text-sm text-white/30">No personas yet.</p>
          </div>
        ) : (
          Object.entries(byLane).map(([lane, rows]) => (
            <div key={lane}>
              <div className="flex items-center justify-between mb-2">
                <p className="text-[10px] uppercase tracking-widest text-white/25 font-bold">{lane}</p>
                <p className={`text-[10px] ${rows.length < 3 ? 'text-amber-400/60' : 'text-white/20'}`}>
                  {rows.length} of 3
                </p>
              </div>
              <div className="space-y-2">
                {rows.map(r => (
                  <div key={r.id} className="p-3.5 rounded-2xl bg-white/[0.03] border border-white/[0.06]">
                    <div className="flex items-start justify-between mb-2">
                      <div className="min-w-0">
                        <p className="text-sm font-bold truncate">{r.artist_name}</p>
                        <p className="text-[10px] text-white/30 mt-0.5">
                          {r.tracks} track{r.tracks !== 1 ? 's' : ''} · {r.retail_tracks} in Retail
                        </p>
                      </div>
                      <span className={`text-[9px] font-bold px-2 py-1 rounded-full flex-shrink-0 ${STATUS_STYLE[r.seed_status]}`}>
                        {r.seed_status}
                      </span>
                    </div>

                    <div className="flex flex-wrap gap-1.5">
                      <button onClick={() => { setAssignFor(r); setQuery(''); setError(''); }}
                        className="flex items-center space-x-1 px-2.5 py-1.5 rounded-lg bg-white/[0.06] text-[11px] text-white/60">
                        <Music className="w-3 h-3" /><span>Assign a track</span>
                      </button>
                      <a href={`/artist/${r.slug}`} target="_blank" rel="noreferrer"
                        className="flex items-center space-x-1 px-2.5 py-1.5 rounded-lg bg-white/[0.06] text-[11px] text-white/60">
                        <ExternalLink className="w-3 h-3" /><span>View</span>
                      </a>
                      {r.seed_status === 'active' && (
                        <button disabled={busy} onClick={() => setStatus(r, 'retiring')}
                          className="flex items-center space-x-1 px-2.5 py-1.5 rounded-lg bg-amber-500/10 text-[11px] text-amber-300 disabled:opacity-30">
                          <Pause className="w-3 h-3" /><span>Wind down</span>
                        </button>
                      )}
                      {r.seed_status === 'retiring' && (
                        <>
                          <button disabled={busy} onClick={() => setStatus(r, 'active')}
                            className="flex items-center space-x-1 px-2.5 py-1.5 rounded-lg bg-white/[0.06] text-[11px] text-white/60 disabled:opacity-30">
                            <Play className="w-3 h-3" /><span>Resume</span>
                          </button>
                          <button disabled={busy} onClick={() => setStatus(r, 'retired')}
                            className="flex items-center space-x-1 px-2.5 py-1.5 rounded-lg bg-red-500/10 text-[11px] text-red-300 disabled:opacity-30">
                            <Archive className="w-3 h-3" /><span>Retire</span>
                          </button>
                        </>
                      )}
                      {r.seed_status === 'retired' && (
                        <button disabled={busy} onClick={() => setStatus(r, 'active')}
                          className="flex items-center space-x-1 px-2.5 py-1.5 rounded-lg bg-white/[0.06] text-[11px] text-white/60 disabled:opacity-30">
                          <Play className="w-3 h-3" /><span>Bring back</span>
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Assign a track */}
      {assignFor && (
        <div className="fixed inset-0 z-[250] bg-black/80 backdrop-blur-sm flex items-end sm:items-center justify-center"
          onClick={() => setAssignFor(null)}>
          <div onClick={e => e.stopPropagation()}
            className="w-full sm:max-w-lg h-[80vh] sm:h-[70vh] flex flex-col rounded-t-2xl sm:rounded-2xl overflow-hidden bg-[#0a0a0a] border border-white/[0.08]">
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.06]">
              <div>
                <p className="text-sm font-bold">Assign to {assignFor.artist_name}</p>
                <p className="text-[10px] text-white/30 mt-0.5">The release moves with the track.</p>
              </div>
              <button onClick={() => setAssignFor(null)}
                className="w-7 h-7 rounded-full bg-white/[0.06] flex items-center justify-center">
                <X className="w-3.5 h-3.5 text-white/60" />
              </button>
            </div>
            <div className="px-4 py-3 border-b border-white/[0.04]">
              <div className="flex items-center space-x-2">
                <Search className="w-4 h-4 text-white/25 flex-shrink-0" />
                <input className={inputCls} placeholder="Track or artist name"
                  value={query} onChange={e => setQuery(e.target.value)} />
              </div>
            </div>
            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
              {searching ? (
                <div className="flex justify-center py-8"><Loader className="w-5 h-5 animate-spin text-white/20" /></div>
              ) : results.length === 0 ? (
                <p className="text-center text-white/25 text-sm py-8">Nothing found.</p>
              ) : results.map(t => {
                const mine = t.artist_id === assignFor.id;
                return (
                  <button key={t.id} disabled={mine || busy} onClick={() => assign(t)}
                    className={`w-full text-left p-3 rounded-xl border transition ${
                      mine ? 'bg-white/[0.02] border-white/[0.04] opacity-50'
                           : 'bg-white/[0.04] border-white/[0.06] hover:bg-white/[0.07]'}`}>
                    <p className="text-sm text-white/90 truncate">{t.title}</p>
                    <p className="text-[10px] text-white/30 mt-0.5 truncate">
                      {t.artist_name || 'No artist'}
                      {t.album_title ? ` · ${t.album_title}` : ''}
                      {t.is_published ? '' : ' · draft'}
                      {mine ? ' · already theirs' : ''}
                    </p>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

    </div>
  );
}