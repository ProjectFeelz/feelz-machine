// src/pages/SchoolSessionsJudgePanel.js
//
// Judge-facing view for Sessions. Distinct from AdminSchoolSessions — judges
// are NOT admins, and every action here goes through judge_set_finalist /
// judge_set_winner / judge_set_rejected, which only ever touch those columns
// and check judge/admin status server-side. There's no raw table update here.
//
// BUILT FOR A LIVE STREAM.
//
// The old version was a list with a "Listen" link that opened the track page in
// a new tab. On a stream that means leaving the page everyone is watching,
// landing somewhere with its own player and its own navigation, then coming
// back to find your place in the list again. Judging twenty entries that way is
// twenty round trips on camera.
//
// So the song plays HERE. The top of the page is a stage: the artwork at the
// size it deserves, the entrant's name, the controls, and the three verdicts
// right under it. Picking an entry from the list loads it onto the stage. The
// page never changes.

import React from 'react';
import { Helmet } from 'react-helmet-async';
import { useNavigate } from 'react-router-dom';
import { Loader, Trophy, ArrowLeft, Play, Pause, SkipForward, Music, X } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import useSchoolSessions from '../hooks/useSchoolSessions';
import { supabase } from '../supabaseClient';
import { screen } from '../utils/track';
import { coverUrl } from '../utils/coverUrl';
import TikTokEmbed from '../components/TikTokEmbed';

const fmt = (s) => {
  if (!Number.isFinite(s)) return '0:00';
  const m = Math.floor(s / 60);
  return `${m}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
};

export default function SchoolSessionsJudgePanel() {
  // One line, and the reports on /admin/app-usage have something to say.
  React.useEffect(() => screen('sessions_judge'), []);

  const navigate = useNavigate();
  const { user, isAdmin } = useAuth();
  const gate = useSchoolSessions();
  const [checking, setChecking] = React.useState(true);
  const [isJudge, setIsJudge] = React.useState(false);
  const [entries, setEntries] = React.useState([]);
  const [loadingEntries, setLoadingEntries] = React.useState(false);
  const [busyId, setBusyId] = React.useState(null);
  const [actionError, setActionError] = React.useState(null);

  // ── The stage ───────────────────────────────────────────────────────────────
  const [nowPlaying, setNowPlaying] = React.useState(null);  // an entry
  const [playing, setPlaying]       = React.useState(false);
  const [elapsed, setElapsed]       = React.useState(0);
  const [duration, setDuration]     = React.useState(0);
  const audioRef = React.useRef(null);

  const compId = gate.config?.competition?.id;

  React.useEffect(() => {
    if (!user || !compId) return;
    if (isAdmin) { setIsJudge(true); setChecking(false); return; }
    supabase.from('school_sessions_judges')
      .select('id')
      .eq('user_id', user.id)
      .eq('competition_id', compId)
      .maybeSingle()
      .then(({ data }) => { setIsJudge(!!data); setChecking(false); });
  }, [user, compId, isAdmin]);

  const loadEntries = React.useCallback(() => {
    if (!compId) return;
    setLoadingEntries(true);
    supabase.from('school_sessions_entries')
      // The track id, cover and file_url are the additions. Without them the
      // stage has nothing to show and nothing to sign.
      //
      // The id comes from the EMBED, as tracks.id, not from entries.track_id.
      // school_sessions_entries is granted column by column because it holds
      // entrant emails and guardian details, so asking it for a column nobody
      // granted returns 403 for the whole request, not a null for that field.
      .select('id, entrant_full_name, is_group, is_finalist, is_winner, is_rejected, created_at, school:school_sessions_schools(name), school_name_freetext, song:school_sessions_shortlist_songs(title), tiktok_video_url, tiktok_video_id, track:tracks(id, title, slug, file_url, cover_artwork_url, artists!tracks_artist_id_fkey(artist_name)), members:school_sessions_entry_members(member_name)')
      .eq('competition_id', compId)
      .order('created_at', { ascending: false })
      .then(({ data }) => { setEntries(data || []); setLoadingEntries(false); });
  }, [compId]);

  React.useEffect(() => {
    if (isJudge) loadEntries();
  }, [isJudge, loadEntries]);

  // ── Signed audio ────────────────────────────────────────────────────────────
  //
  // THE BUCKET IS PRIVATE. tracks.file_url is a public object URL that stopped
  // resolving the day feelz-samples was closed, so assigning it to an audio
  // element gives a format error and silence. Every player in the app goes
  // through stream-url, which signs the stored path with the service role and
  // hands back a URL good for two hours. This page has to do the same.
  //
  // Signed up front, in one request, rather than on each play. A judge on a
  // live stream should not be waiting on a round trip to Frankfurt between one
  // entry and the next, and two hours covers a judging session comfortably.
  // WHY THE STAGE STOPS BEING STICKY.
  //
  // The stage is pinned to the top so a judge can scroll the list while a
  // song plays. Open a TikTok inside it and the stage becomes taller than the
  // window, and a sticky element taller than the window pins its top and
  // leaves no room for anything else: the list underneath becomes
  // unreachable and the page looks frozen.
  //
  // So while a video is open the stage is an ordinary block and scrolls away
  // like everything else. Close the video and it pins again.
  const [videoOpen, setVideoOpen] = React.useState(false);
  const [signed, setSigned] = React.useState({});
  const [signing, setSigning] = React.useState(false);

  const signAll = React.useCallback(async (rows) => {
    const ids = [...new Set(rows.map(e => e.track?.id).filter(Boolean))];
    if (ids.length === 0) return;
    setSigning(true);
    try {
      const { data: sess } = await supabase.auth.getSession();
      const token = sess?.session?.access_token;
      const out = {};
      // stream-url signs at most 25 ids per call, so a big season is chunked
      // rather than silently truncated.
      for (let i = 0; i < ids.length; i += 25) {
        const res = await fetch('/.netlify/functions/stream-url', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({ trackIds: ids.slice(i, i + 25) }),
        });
        if (!res.ok) continue;
        const body = await res.json();
        Object.entries(body.tracks || {}).forEach(([id, r]) => {
          if (r?.url) out[id] = r.url;
        });
      }
      setSigned(prev => ({ ...prev, ...out }));
    } catch (e) {
      setActionError('Could not load the audio. Reload the page and try again.');
    }
    setSigning(false);
  }, []);

  React.useEffect(() => {
    if (entries.length) signAll(entries);
  }, [entries, signAll]);

  // ── What the public decided ─────────────────────────────────────────────────
  //
  // Phase one is theirs. The ranking is read, not computed here, because the
  // same numbers decide what judge_set_finalist will accept and two places
  // counting votes separately is two places that can disagree on camera.
  const [ranking, setRanking] = React.useState({});
  const shortlistSize = gate.config?.shortlist_size ?? 20;
  const finalistCap   = gate.config?.finalist_cap ?? 10;

  const loadRanking = React.useCallback(() => {
    if (!compId) return;
    supabase.rpc('sessions_vote_ranking', { p_competition_id: compId })
      .then(({ data, error }) => {
        if (error) { console.warn('[judge] ranking unavailable:', error.message); return; }
        const m = {};
        (data || []).forEach(r => { m[r.entry_id] = { votes: Number(r.votes), rank: Number(r.rank) }; });
        setRanking(m);
      });
  }, [compId]);

  React.useEffect(() => { if (isJudge) loadRanking(); }, [isJudge, loadRanking]);

  // UNWRAP THE SHORT LINKS, ONCE.
  //
  // 13 of the first 14 entries pasted a vm.tiktok.com link, which is what
  // TikTok's share sheet gives you on a phone. The id is behind a redirect a
  // browser cannot read, so a function follows it server side and writes the
  // answer to the row. Fired here because the judges page is the first place
  // anybody needs these, and it is idempotent: the second call finds nothing
  // left to do and returns.
  React.useEffect(() => {
    if (!isJudge || !compId || entries.length === 0) return;
    if (!entries.some(e => e.tiktok_video_url && !e.tiktok_video_id)) return;
    let dead = false;
    fetch('/.netlify/functions/tiktok-resolve', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ competitionId: compId }),
    })
      .then(r => (r.ok ? r.json() : null))
      .then(out => {
        if (dead || !out || !out.resolved) return;
        const got = out.resolved;
        if (Object.keys(got).length === 0) return;
        setEntries(prev => prev.map(e => (got[e.id] ? { ...e, tiktok_video_id: got[e.id] } : e)));
      })
      .catch(() => {});
    return () => { dead = true; };
  }, [isJudge, compId, entries]);

  const finalistCount = entries.filter(e => e.is_finalist).length;
  const anyVotes = Object.values(ranking).some(r => r.votes > 0);

  // ── Playback ────────────────────────────────────────────────────────────────
  //
  // One audio element for the whole page, re-pointed as the judge moves down
  // the list. Making one per row would mean twenty buffered songs on a laptop
  // that is also running a stream.
  const playEntry = React.useCallback((entry) => {
    const trackId = entry?.track?.id;
    if (!trackId || !entry?.track?.file_url) {
      setActionError('That entry has no audio on it.');
      return;
    }
    const url = signed[trackId];
    if (!url) {
      // Either the signing round trip has not landed yet, or stream-url
      // refused this one. Say which, rather than failing silently the way an
      // unplayable src does.
      setActionError(signing
        ? 'Still loading the audio, give it a second.'
        : 'That song would not load. Reload the page and try again.');
      setNowPlaying(entry);
      return;
    }
    setActionError(null);
    setNowPlaying(entry);
    const a = audioRef.current;
    if (!a) return;
    if (a.src !== url) { a.src = url; setElapsed(0); setDuration(0); }
    a.play().then(() => setPlaying(true)).catch(() => setPlaying(false));
  }, [signed, signing]);

  const togglePlay = React.useCallback(() => {
    const a = audioRef.current;
    if (!a || !nowPlaying) return;
    if (a.paused) a.play().then(() => setPlaying(true)).catch(() => {});
    else { a.pause(); setPlaying(false); }
  }, [nowPlaying]);

  // Space bar plays and pauses, because on a stream your hands are not on the
  // mouse. Ignored while typing, so it never eats a keystroke in a field.
  React.useEffect(() => {
    const onKey = (e) => {
      const tag = (e.target?.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'textarea' || e.target?.isContentEditable) return;
      if (e.code === 'Space') { e.preventDefault(); togglePlay(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [togglePlay]);

  const playNext = React.useCallback(() => {
    if (!nowPlaying) return;
    const i = entries.findIndex(e => e.id === nowPlaying.id);
    // Skip over anything that will not play, so Next never lands the stream on
    // a dead entry.
    const next = entries.slice(i + 1).find(e => e.track?.id && signed[e.track.id]);
    if (next) playEntry(next);
    else { setPlaying(false); }
  }, [entries, nowPlaying, playEntry, signed]);

  // ── Verdicts ────────────────────────────────────────────────────────────────
  //
  // One helper for all three, because they differ only in which RPC they call
  // and which column they flip. Three near-identical functions is how the
  // third one ends up missing a piece the other two have.
  const setVerdict = async (entry, kind) => {
    const map = {
      finalist: { rpc: 'judge_set_finalist', field: 'is_finalist' },
      winner:   { rpc: 'judge_set_winner',   field: 'is_winner'   },
      rejected: { rpc: 'judge_set_rejected', field: 'is_rejected' },
    }[kind];
    const nextValue = !entry[map.field];
    setBusyId(entry.id);
    setActionError(null);
    const { error } = await supabase.rpc(map.rpc, { p_entry_id: entry.id, p_value: nextValue });
    if (error) {
      setActionError(`Could not save that. ${error.message}`);
    } else {
      setEntries(prev => prev.map(e => {
        if (e.id !== entry.id) return e;
        const updated = { ...e, [map.field]: nextValue };
        // Mirrors what judge_set_rejected does in the database, so the screen
        // agrees with the row without a refetch.
        if (kind === 'rejected' && nextValue) { updated.is_finalist = false; updated.is_winner = false; }
        if (kind !== 'rejected' && nextValue) { updated.is_rejected = false; }
        return updated;
      }));
      setNowPlaying(np => (np && np.id === entry.id ? { ...np, [map.field]: nextValue } : np));
    }
    setBusyId(null);
  };

  if (!user) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center px-6 text-center">
        <p className="text-sm text-white/50">Log in to access the judge panel.</p>
      </div>
    );
  }

  if (checking || gate.loading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <Loader className="w-5 h-5 text-white/30 animate-spin" />
      </div>
    );
  }

  if (!isJudge) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center px-6 text-center">
        <p className="text-sm text-white/50">You don't have judge access for the current Sessions competition.</p>
      </div>
    );
  }

  const np = nowPlaying;
  const npCover = np?.track?.cover_artwork_url;

  // Outside the public's cut, so the database will refuse it. Said on the
  // button before it is pressed rather than as an error afterwards, because
  // on a stream a refusal you did not expect looks like a broken page.
  const outOfShortlist = (entry) => {
    if (!anyVotes) return false;
    const r = ranking[entry.id]?.rank;
    return !r || r > shortlistSize;
  };

  const VerdictButtons = ({ entry, size = 'sm' }) => {
    const pad = size === 'lg' ? 'px-4 py-2.5 text-xs' : 'px-2.5 py-1 text-[10px]';
    const full = finalistCount >= finalistCap;
    const blocked = !entry.is_finalist && (outOfShortlist(entry) || full);

    // NOT DISABLED, DIMMED.
    //
    // A disabled button on a touch screen says nothing: there is no hover, so
    // the tooltip never appears and the button simply does not respond, which
    // on a stream reads as the page having frozen. It stays pressable and
    // answers in words instead.
    const onFinalist = () => {
      if (blocked) {
        setActionError(outOfShortlist(entry)
          ? `That entry is number ${ranking[entry.id]?.rank ?? '?'} in the public vote, and only the top ${shortlistSize} can be finalists.`
          : `All ${finalistCap} finalist places are taken. Tap a green Finalist button to free one up, then come back.`);
        return;
      }
      setVerdict(entry, 'finalist');
    };

    return (
      <div className="flex items-center gap-2 flex-wrap">
        {/* Pressing it again takes it off. That is the whole swap: drop one,
            add another, and the count frees up straight away. The label says
            so, because "Finalist" on its own looks like a label rather than a
            button you can press back. */}
        <button onClick={onFinalist} disabled={busyId === entry.id}
          title={entry.is_finalist
            ? 'Tap to take this one off the finalists'
            : blocked
              ? (outOfShortlist(entry) ? `Outside the public's top ${shortlistSize}` : `All ${finalistCap} places are taken`)
              : undefined}
          className={`font-bold rounded-full transition disabled:opacity-40 inline-flex items-center gap-1 ${pad} ${
            entry.is_finalist
              ? 'bg-lime-400/20 text-lime-400 hover:bg-red-500/20 hover:text-red-300'
              : blocked
                ? 'bg-white/[0.04] text-white/20'
                : 'bg-white/[0.06] text-white/40 hover:bg-white/[0.1]'}`}>
          {entry.is_finalist && <X className={size === 'lg' ? 'w-3 h-3' : 'w-2.5 h-2.5'} />}
          <span>{entry.is_finalist ? 'Finalist, tap to drop' : 'Mark finalist'}</span>
        </button>
        <button onClick={() => setVerdict(entry, 'winner')} disabled={busyId === entry.id}
          className={`flex items-center gap-1 font-bold rounded-full transition disabled:opacity-40 ${pad} ${entry.is_winner ? 'bg-lime-400 text-black' : 'bg-white/[0.06] text-white/40 hover:bg-white/[0.1]'}`}>
          <Trophy className={size === 'lg' ? 'w-3.5 h-3.5' : 'w-2.5 h-2.5'} />
          <span>{entry.is_winner ? 'Winner' : 'Mark winner'}</span>
        </button>
        {/* The no.
         *
         * Loud on purpose, and red, because it is the one verdict you want to
         * be certain you pressed deliberately. It also clears finalist and
         * winner, both here and in the database. */}
        <button onClick={() => setVerdict(entry, 'rejected')} disabled={busyId === entry.id}
          className={`flex items-center gap-1 font-black tracking-wide rounded-full transition disabled:opacity-40 ${pad} ${entry.is_rejected ? 'bg-red-500 text-white' : 'bg-white/[0.06] text-white/40 hover:bg-red-500/20 hover:text-red-300'}`}>
          <X className={size === 'lg' ? 'w-3.5 h-3.5' : 'w-2.5 h-2.5'} />
          <span>NAH!!!</span>
        </button>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-black text-white">
      <Helmet><title>Judge Panel, Sessions</title><meta name="robots" content="noindex, nofollow" /></Helmet>

      {/* One element for the page. */}
      <audio
        ref={audioRef}
        onTimeUpdate={e => setElapsed(e.currentTarget.currentTime)}
        onLoadedMetadata={e => setDuration(e.currentTarget.duration)}
        onEnded={() => { setPlaying(false); playNext(); }}
        onPause={() => setPlaying(false)}
        onPlay={() => setPlaying(true)}
      />

      <div className="px-5 pt-8 pb-24 max-w-5xl mx-auto">
        <div className="flex items-start space-x-3 mb-1">
          <button onClick={() => navigate('/hub')}
            className="w-9 h-9 flex items-center justify-center rounded-full bg-white/[0.06] hover:bg-white/[0.1] transition flex-shrink-0 mt-1">
            <ArrowLeft className="w-4 h-4 text-white" />
          </button>
          <div>
            <p className="text-lime-400 text-xs font-bold tracking-widest uppercase mb-1">Sessions</p>
            <h1 className="text-2xl font-bold">Judge Panel</h1>
          </div>
        </div>
        <p className="text-sm text-white/40 mb-4">
          Pick an entry to play it here. Space bar starts and stops it.
        </p>

        {/* WHERE YOU ARE IN THE THREE PHASES, in one line.
            Ten of twenty, with the winner still to come, is the only thing a
            judge needs on screen while the stream is running. */}
        <div className="mb-6 flex flex-wrap items-center gap-2 text-[11px] font-semibold">
          <span className="px-2.5 py-1 rounded-full bg-white/[0.06] text-white/50">
            {anyVotes
              ? `Public vote picked the top ${shortlistSize}`
              : 'No public votes yet, every entry is open'}
          </span>
          <span className={`px-2.5 py-1 rounded-full ${finalistCount >= finalistCap ? 'bg-lime-400/20 text-lime-400' : 'bg-white/[0.06] text-white/50'}`}>
            {finalistCount} of {finalistCap} finalists
          </span>
          <span className={`px-2.5 py-1 rounded-full ${entries.some(e => e.is_winner) ? 'bg-lime-400 text-black' : 'bg-white/[0.06] text-white/50'}`}>
            {entries.some(e => e.is_winner) ? 'Winner picked' : 'Winner not picked'}
          </span>
        </div>

        {gate.adminPreview && (
          <div className="mb-4 rounded-xl border border-yellow-500/20 bg-yellow-500/10 px-4 py-2.5">
            <p className="text-xs text-yellow-400">Admin preview: the public toggle is off. Judging still works normally for testing.</p>
          </div>
        )}

        {actionError && <p className="text-xs text-red-400 mb-4">{actionError}</p>}

        {/* ── The stage ──────────────────────────────────────────────────────
            Sticky, so it stays on screen while the judge scrolls the list.
            On a stream the artwork is the shot, so it is given real size
            rather than being a thumbnail beside a row. */}
        {np && (
          <div className={`${videoOpen ? 'relative' : 'sticky top-0 z-20'} -mx-5 px-5 pb-5 pt-3 mb-6`}
            style={{ background: 'linear-gradient(180deg, #000 70%, rgba(0,0,0,0.92) 100%)' }}>
            <div className="rounded-2xl border border-white/[0.08] p-4 sm:p-5"
              style={{ background: 'linear-gradient(135deg, rgba(140,171,46,0.10), rgba(10,10,10,0.95))' }}>
              <div className="flex flex-col sm:flex-row gap-5">
                <div className="w-full sm:w-56 aspect-square rounded-xl overflow-hidden flex-shrink-0 bg-white/[0.04] flex items-center justify-center">
                  {npCover
                    ? <img src={coverUrl(npCover, 700)} alt="" className="w-full h-full object-cover" />
                    : <Music className="w-10 h-10 text-white/15" />}
                </div>

                <div className="flex-1 min-w-0 flex flex-col justify-between">
                  <div className="min-w-0">
                    <p className="text-[11px] uppercase tracking-widest text-lime-400 font-bold mb-1">Now judging</p>
                    <h2 className="text-xl sm:text-2xl font-bold text-white leading-tight truncate">
                      {np.entrant_full_name}{np.is_group && np.members?.length > 0 ? ` + ${np.members.length}` : ''}
                    </h2>
                    <p className="text-sm text-white/50 truncate mt-0.5">
                      covering "{np.song?.title || np.track?.title}"
                    </p>
                    {np.track?.artists?.artist_name && (
                      <p className="text-xs text-white/30 truncate">as {np.track.artists.artist_name}</p>
                    )}
                  </div>

                  <div className="mt-4">
                    <div className="flex items-center gap-3 mb-3">
                      <button onClick={togglePlay}
                        className="w-12 h-12 rounded-full bg-lime-400 text-black flex items-center justify-center flex-shrink-0 transition active:scale-95">
                        {playing ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5 ml-0.5" />}
                      </button>
                      <button onClick={playNext} title="Next entry"
                        className="w-10 h-10 rounded-full bg-white/[0.06] hover:bg-white/[0.12] flex items-center justify-center flex-shrink-0 transition">
                        <SkipForward className="w-4 h-4 text-white/70" />
                      </button>
                      <div className="flex-1 min-w-0">
                        <input type="range" min={0} max={duration || 0} value={elapsed}
                          onChange={e => { const a = audioRef.current; if (a) { a.currentTime = Number(e.target.value); setElapsed(Number(e.target.value)); } }}
                          className="w-full accent-lime-400" />
                        <div className="flex justify-between text-[10px] text-white/30 mt-0.5">
                          <span>{fmt(elapsed)}</span><span>{fmt(duration)}</span>
                        </div>
                      </div>
                    </div>
                    <VerdictButtons entry={np} size="lg" />
                  </div>
                </div>
              </div>

              {/* THE PERFORMANCE, not just the audio.
                  Every entry carries a TikTok link because the entry form
                  demands one. Watching it meant leaving the page mid stream
                  until now. Nothing loads until it is asked for. */}
              {np.tiktok_video_url && (
                <div className="mt-4 max-w-sm">
                  <TikTokEmbed url={np.tiktok_video_url} videoId={np.tiktok_video_id} onOpenChange={setVideoOpen} title={`${np.entrant_full_name} on TikTok`} />
                  {/* On a phone the video fills the screen, so the list is a
                      scroll away and not obviously still there. */}
                  {videoOpen && (
                    <button
                      onClick={() => {
                        const list = document.getElementById('judge-entry-list');
                        if (list) list.scrollIntoView({ behavior: 'smooth', block: 'start' });
                      }}
                      className="mt-2 w-full py-2 rounded-xl bg-white/[0.06] hover:bg-white/[0.1] text-xs font-semibold text-white/60 hover:text-white transition"
                    >
                      Back to the entries
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {loadingEntries ? (
          <div className="flex justify-center py-12"><Loader className="w-5 h-5 text-white/30 animate-spin" /></div>
        ) : entries.length === 0 ? (
          <p className="text-sm text-white/30 text-center py-12">No entries yet.</p>
        ) : (
          <div id="judge-entry-list" className="space-y-2 scroll-mt-4">
            {entries.map(e => {
              const isNow = np?.id === e.id;
              const border = e.is_rejected ? 'bg-red-500/[0.04] border-red-500/20'
                : e.is_winner ? 'bg-lime-400/[0.08] border-lime-400/40'
                : e.is_finalist ? 'bg-lime-400/[0.04] border-lime-400/20'
                : 'bg-white/[0.03] border-white/[0.06]';
              return (
                <div key={e.id}
                  className={`px-4 py-3 rounded-xl text-sm border transition ${border} ${isNow ? 'ring-1 ring-lime-400/50' : ''} ${e.is_rejected ? 'opacity-60' : ''}`}>
                  <div className="flex items-center justify-between gap-3">
                    <button onClick={() => playEntry(e)} className="flex items-center gap-3 min-w-0 text-left flex-1">
                      {/* Where the public put them. The number is the whole
                          point of phase one, so it sits on the row rather
                          than in a tooltip. */}
                      {anyVotes && (
                        <span className={`w-7 flex-shrink-0 text-center text-xs font-bold tabular-nums ${
                          outOfShortlist(e) ? 'text-white/20' : 'text-lime-400'}`}>
                          {ranking[e.id]?.rank ?? '–'}
                        </span>
                      )}
                      <div className="w-10 h-10 rounded-lg overflow-hidden bg-white/[0.06] flex-shrink-0 flex items-center justify-center">
                        {e.track?.cover_artwork_url
                          ? <img src={coverUrl(e.track.cover_artwork_url, 120)} alt="" className="w-full h-full object-cover" />
                          : <Music className="w-4 h-4 text-white/20" />}
                      </div>
                      <div className="min-w-0">
                        <p className={`font-semibold truncate ${e.is_rejected ? 'text-white/50 line-through' : 'text-white'}`}>
                          {e.entrant_full_name}{e.is_group && e.members?.length > 0 ? ` + ${e.members.length} more` : ''}
                        </p>
                        <p className="text-xs text-white/40 truncate">
                          {/* The school is only present on first season rows, so
                              the separator has to come with it or every new entry
                              reads as " · covering ...". */}
                          {(e.school?.name || e.school_name_freetext)
                            ? `${e.school?.name || e.school_name_freetext} · `
                            : ''}covering "{e.song?.title || e.track?.title}"
                          {anyVotes && ranking[e.id] != null && (
                            <span className="text-white/30">
                              {' '}· {ranking[e.id].votes} vote{ranking[e.id].votes === 1 ? '' : 's'}
                            </span>
                          )}
                        </p>
                      </div>
                    </button>
                    {/* Three states, not two. "Loading" while the signing
                        round trip is in flight, "no audio" when the row has
                        no file at all, and "won't load" when it has one that
                        stream-url refused. Silence with no label is what sent
                        me looking for a bug that was not there. */}
                    {!e.track?.file_url ? (
                      <span className="text-[10px] text-white/25 flex-shrink-0">no audio</span>
                    ) : !e.track?.id || !signed[e.track.id] ? (
                      <span className="text-[10px] text-white/25 flex-shrink-0">
                        {signing ? 'loading…' : "won't load"}
                      </span>
                    ) : null}
                  </div>
                  <div className="mt-2.5">
                    <VerdictButtons entry={e} />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
