// src/components/retail/RetailPitchesTab.js
//
// Artist submissions to Feelz Retail.
//
// The submit side has existed for a while: TrackUploadPanel writes a row to
// retail_pitches when an artist pitches a track. Nothing has ever read that
// table. The Pitches tab was listed as not built, so a submission went into
// the database and stopped there — no queue, no decision, no reply. Nobody
// has pitched yet, so nothing was lost, but the first artist who tried would
// have been submitting into a void.
//
// This closes the loop. Approving writes the track into retail_catalog, which
// is what the playlist picker reads, so an approval is what actually makes a
// track available to venues.

import React from 'react';
import { Music, Play, Pause, Check, X, Loader, Inbox, ShieldCheck } from 'lucide-react';
import { supabase } from '../../supabaseClient';
import { useAuth } from '../../contexts/AuthContext';
import { usePlayer } from '../../contexts/PlayerContext';

const FILTERS = [
  { key: 'pending',  label: 'Waiting' },
  { key: 'approved', label: 'Approved' },
  { key: 'rejected', label: 'Declined' },
];

export default function RetailPitchesTab({ showToast }) {
  const { user } = useAuth();
  const { playTrack, currentTrack, isPlaying, togglePlay } = usePlayer();

  const [filter, setFilter]   = React.useState('pending');
  const [rows, setRows]       = React.useState([]);
  const [counts, setCounts]   = React.useState({ pending: 0, approved: 0, rejected: 0 });
  const [loading, setLoading] = React.useState(true);
  const [busy, setBusy]       = React.useState(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    const [{ data, error }, tally] = await Promise.all([
      supabase
        .from('retail_pitches')
        .select(`
          id, pitch_note, status, rejection_reason, created_at, reviewed_at,
          track:tracks ( id, title, file_url, cover_artwork_url, is_explicit, is_published,
                         artist:artists ( id, artist_name ) ),
          acceptances:legal_acceptances ( accepted_at, document:legal_documents ( slug, version ) )
        `)
        .eq('status', filter)
        .order('created_at', { ascending: false }),
      supabase.from('retail_pitches').select('status'),
    ]);

    setLoading(false);

    if (error) {
      console.error('[retail-pitches] read failed:', error.code, error.message);
      showToast?.('Could not load submissions: ' + error.message);
      return;
    }
    setRows((data || []).filter(r => r.track));

    const c = { pending: 0, approved: 0, rejected: 0 };
    (tally.data || []).forEach(r => { if (c[r.status] !== undefined) c[r.status] += 1; });
    setCounts(c);
  }, [filter, showToast]);

  React.useEffect(() => { load(); }, [load]);

  const handlePlay = (track) => {
    if (currentTrack?.id === track.id) { togglePlay(); return; }
    playTrack(track, rows.map(r => r.track));
  };

  const approve = async (row) => {
    setBusy(row.id);
    try {
      // Catalogue first. If this fails the pitch stays in the queue, which is
      // the recoverable order — the opposite would mark it approved with the
      // track never reaching a playlist, and nothing would show that.
      const { error: catErr } = await supabase
        .from('retail_catalog')
        .insert({ track_id: row.track.id, pitch_id: row.id, added_by: user?.id || null });

      // 23505 is the track already being in the catalogue, which is a fine
      // state to end up in — approve the pitch and move on.
      if (catErr && catErr.code !== '23505') {
        showToast?.('Could not add it to the catalogue: ' + catErr.message);
        return;
      }

      const { error } = await supabase
        .from('retail_pitches')
        .update({ status: 'approved', reviewed_by: user?.id || null, reviewed_at: new Date().toISOString() })
        .eq('id', row.id);

      if (error) { showToast?.('Catalogue updated but the pitch did not: ' + error.message); return; }

      showToast?.(`"${row.track.title}" is now available to venues`);
      load();
    } finally {
      setBusy(null);
    }
  };

  const decline = async (row) => {
    const reason = window.prompt(
      `Decline "${row.track.title}"? A short reason helps the artist — they see this.`,
      ''
    );
    if (reason === null) return;

    setBusy(row.id);
    try {
      const { error } = await supabase
        .from('retail_pitches')
        .update({
          status: 'rejected',
          rejection_reason: reason.trim() || null,
          reviewed_by: user?.id || null,
          reviewed_at: new Date().toISOString(),
        })
        .eq('id', row.id);

      if (error) { showToast?.('Error: ' + error.message); return; }
      showToast?.('Declined');
      load();
    } finally {
      setBusy(null);
    }
  };

  return (
    <div>
      <div className="flex items-center gap-1 p-1 rounded-xl bg-white/[0.03] border border-white/[0.06] mb-6 w-fit">
        {FILTERS.map(f => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`px-3.5 py-2 rounded-lg text-sm font-semibold transition whitespace-nowrap ${
              filter === f.key ? 'bg-purple-500 text-white' : 'text-white/45 hover:text-white/80'
            }`}
          >
            {f.label}
            {counts[f.key] > 0 && (
              <span className={`ml-1.5 text-[11px] ${filter === f.key ? 'text-white/70' : 'text-white/30'}`}>
                {counts[f.key]}
              </span>
            )}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader className="w-5 h-5 text-white/30 animate-spin" /></div>
      ) : rows.length === 0 ? (
        <div className="py-16 text-center">
          <Inbox className="w-9 h-9 text-white/10 mx-auto mb-3" />
          <p className="text-sm text-white/30">
            {filter === 'pending'
              ? 'No submissions waiting. Artists pitch a track from their upload panel.'
              : `Nothing ${filter === 'approved' ? 'approved' : 'declined'} yet.`}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {rows.map(row => {
            const t = row.track;
            const isCurrent = currentTrack?.id === t.id;
            const isBusy = busy === row.id;

            return (
              <div
                key={row.id}
                className={`flex items-start gap-3 p-3 rounded-xl border transition ${
                  isCurrent ? 'bg-purple-500/10 border-purple-500/30' : 'bg-white/[0.03] border-white/[0.06]'
                }`}
              >
                <button
                  onClick={() => handlePlay(t)}
                  className="relative w-12 h-12 rounded-lg overflow-hidden bg-white/[0.06] flex-shrink-0 group"
                  title={isCurrent && isPlaying ? 'Pause' : 'Play'}
                >
                  {t.cover_artwork_url ? (
                    <img src={t.cover_artwork_url} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <Music className="w-4 h-4 text-white/20" />
                    </div>
                  )}
                  <div className={`absolute inset-0 flex items-center justify-center bg-black/55 transition ${
                    isCurrent ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                  }`}>
                    {isCurrent && isPlaying
                      ? <Pause className="w-4 h-4 text-white" />
                      : <Play className="w-4 h-4 text-white" />}
                  </div>
                </button>

                <div className="min-w-0 flex-1">
                  <p className={`text-sm font-medium truncate ${isCurrent ? 'text-purple-300' : 'text-white'}`}>
                    {t.title}
                  </p>
                  <p className="text-xs text-white/40 truncate">
                    {t.artist?.artist_name || 'Unknown artist'}
                    <span className="mx-1.5 text-white/15">·</span>
                    {new Date(row.created_at).toLocaleDateString()}
                  </p>

                  {row.pitch_note && (
                    <p className="text-xs text-white/55 mt-1.5 italic break-words">“{row.pitch_note}”</p>
                  )}

                  {/* Whether the terms were actually agreed to, and which
                      version. A reviewer should never have to take that on
                      trust, and a pitch from before the gate existed has no
                      acceptance on file — which is worth seeing rather than
                      hiding behind a default tick. */}
                  {(() => {
                    const lic = (row.acceptances || []).find(a => a.document?.slug === 'retail-licence');
                    const sub = (row.acceptances || []).find(a => a.document?.slug === 'retail-submission-terms');
                    if (lic && sub) {
                      return (
                        <p className="text-[11px] text-emerald-300/70 mt-1.5 flex items-center gap-1">
                          <ShieldCheck className="w-3 h-3 flex-shrink-0" />
                          Terms agreed v{sub.document.version}/{lic.document.version} on{' '}
                          {new Date(sub.accepted_at).toLocaleDateString()}
                        </p>
                      );
                    }
                    return (
                      <p className="text-[11px] text-amber-300/80 mt-1.5 flex items-center gap-1">
                        <ShieldCheck className="w-3 h-3 flex-shrink-0" />
                        Submitted before the terms gate existed — no agreement on file
                      </p>
                    );
                  })()}

                  {t.is_explicit && (
                    <p className="text-[11px] text-amber-300/90 mt-1.5">
                      Marked explicit — retail playlists refuse explicit tracks, so approving this
                      puts it in the catalogue but it still cannot be added to a playlist.
                    </p>
                  )}

                  {row.status === 'rejected' && row.rejection_reason && (
                    <p className="text-[11px] text-white/35 mt-1.5">Declined: {row.rejection_reason}</p>
                  )}
                </div>

                {row.status === 'pending' && (
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <button
                      onClick={() => approve(row)}
                      disabled={isBusy}
                      title="Approve — adds it to the retail catalogue"
                      className="w-9 h-9 flex items-center justify-center rounded-lg bg-emerald-500/15 hover:bg-emerald-500/30 transition disabled:opacity-40"
                    >
                      {isBusy
                        ? <Loader className="w-4 h-4 text-emerald-300 animate-spin" />
                        : <Check className="w-4 h-4 text-emerald-300" />}
                    </button>
                    <button
                      onClick={() => decline(row)}
                      disabled={isBusy}
                      title="Decline"
                      className="w-9 h-9 flex items-center justify-center rounded-lg bg-white/[0.05] hover:bg-red-500/20 transition disabled:opacity-40"
                    >
                      <X className="w-4 h-4 text-white/45" />
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}