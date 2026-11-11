// src/pages/SchoolSessionsEntryPage.js
// /sessions/entry/:id (and the /schoolsessions/entry/:id alias)
//
// One entry, on its own page, so an entrant has something to send people.
//
//
// WHY THIS EXISTS SEPARATELY FROM THE VOTE PAGE
//
// The vote page is a list you scroll. That is the wrong thing to paste into a
// TikTok bio: the person arrives, sees nine entries and has to find yours.
// This is the page for "vote for me" — one name, one song, one button.
//
//
// IT WORKS BEFORE VOTING OPENS, ON PURPOSE
//
// Entries close on 30 November and voting runs after that, so for most of the
// competition a shared link is pointing at something nobody can vote on yet.
// That is fine and it is the point: the page still plays the song, still
// names the entrant, and says when the button comes alive. A link that works
// the day you record is worth far more than one that only exists in December,
// because the sharing happens while the excitement is there.
//
//
// WHO CAN SEE IT VERSUS WHO CAN VOTE
//
// Sessions is gated to South Africa. That gate stays on the VOTE, because
// R10,000 and open worldwide voting do not belong in the same sentence. It is
// deliberately NOT on the page: an entrant with family abroad should be able
// to send them the song, and a share that opens on "not available in your
// country" is a share nobody makes twice.

import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { Loader, Play, Pause, Check, ThumbsUp, Trophy, Share2, Lock, ArrowLeft } from 'lucide-react';
import { supabase } from '../supabaseClient';
import { useAuth } from '../contexts/AuthContext';
import { usePlayer } from '../contexts/PlayerContext';
import useSchoolSessions from '../hooks/useSchoolSessions';

const BASE_URL = 'https://www.feelzmachine.com';

function phaseFromDates(comp) {
  if (!comp) return 'unknown';
  const now = Date.now();
  const opens  = comp.voting_open_at  ? new Date(comp.voting_open_at).getTime()  : null;
  const closes = comp.voting_close_at ? new Date(comp.voting_close_at).getTime() : null;
  if (closes && now > closes) return 'closed';
  if (opens  && now < opens)  return 'not_open';
  return 'open';
}

const longDate = (iso) =>
  iso ? new Date(iso).toLocaleDateString('en-ZA', { day: 'numeric', month: 'long' }) : 'soon';

export default function SchoolSessionsEntryPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const gate = useSchoolSessions();
  const { playTrack, currentTrack, isPlaying } = usePlayer();

  const [entry, setEntry]       = useState(null);
  const [comp, setComp]         = useState(null);
  const [votes, setVotes]       = useState(0);
  const [myVoteId, setMyVoteId] = useState(null);
  const [loading, setLoading]   = useState(true);
  const [voting, setVoting]     = useState(false);
  const [copied, setCopied]     = useState(false);
  const [error, setError]       = useState('');

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);

    // The artists embed is named. There is more than one foreign key between
    // these tables and an unnamed embed answers 300 the day a second one is
    // added, which has taken parts of this site down before.
    const { data: e, error: entryErr } = await supabase
      .from('school_sessions_entries')
      .select(`
        id, competition_id, entrant_full_name, is_group, entrant_tiktok_handle,
        is_finalist, is_winner, created_at,
        song:school_sessions_shortlist_songs(title),
        track:tracks(id, title, slug, cover_artwork_url, file_url, duration, artist_id,
                     artists!tracks_artist_id_fkey(artist_name, slug)),
        members:school_sessions_entry_members(member_name)
      `)
      .eq('id', id)
      .maybeSingle();

    if (entryErr) console.error('[sessions entry] load failed:', entryErr.code, entryErr.message);
    if (!e) { setEntry(null); setLoading(false); return; }
    setEntry(e);

    // Fetched by id rather than taken from the gate config, so the dates are
    // right even for a visitor the gate turns away.
    if (e.competition_id) {
      const { data: c } = await supabase
        .from('competitions')
        .select('id, title, voting_open_at, voting_close_at')
        .eq('id', e.competition_id)
        .maybeSingle();
      setComp(c || null);

      const { data: counts } = await supabase.rpc('get_school_sessions_vote_counts', {
        p_competition_id: e.competition_id,
      });
      const mine = (counts || []).find(c2 => c2.entry_id === e.id);
      setVotes(mine ? Number(mine.votes) : 0);

      if (user) {
        const { data: v } = await supabase
          .from('school_sessions_votes')
          .select('entry_id')
          .eq('competition_id', e.competition_id)
          .eq('user_id', user.id)
          .maybeSingle();
        setMyVoteId(v?.entry_id || null);
      }
    }

    setLoading(false);
  }, [id, user]);

  useEffect(() => { load(); }, [load]);

  const shareUrl = `${BASE_URL}/sessions/entry/${id}`;
  const phase = phaseFromDates(comp);
  const track = entry?.track;
  const isThis = track && currentTrack?.id === track.id;
  const votedForThis = myVoteId && entry && myVoteId === entry.id;
  const votedElsewhere = myVoteId && entry && myVoteId !== entry.id;

  const play = () => {
    if (!track?.id) return;
    window.__feelz_play_source = 'school_sessions';
    window.__feelz_play_source_at = Date.now();
    playTrack({
      ...track,
      artist_name: track.artists?.artist_name || entry.entrant_full_name,
      artist_slug: track.artists?.slug || null,
    }, [track]);
  };

  const share = async () => {
    const title = `${entry?.entrant_full_name} on Feelz Machine Sessions`;
    try {
      if (navigator.share) {
        await navigator.share({ title, url: shareUrl });
        return;
      }
    } catch { /* the sheet was dismissed, fall through to copying */ }
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      setError('Could not copy. The link is in your address bar.');
    }
  };

  const castVote = async () => {
    if (!user) { navigate(`/login?next=${encodeURIComponent(`/sessions/entry/${id}`)}`); return; }
    setVoting(true);
    setError('');
    try {
      const { error: voteErr } = await supabase.from('school_sessions_votes').insert({
        competition_id: entry.competition_id,
        entry_id: entry.id,
        user_id: user.id,
      });
      if (voteErr) throw voteErr;
      setMyVoteId(entry.id);
      setVotes(v => v + 1);
    } catch (err) {
      setError(
        /duplicate/i.test(err.message || '')
          ? 'You have already used your vote in this competition.'
          : 'Could not cast your vote. Try again in a moment.'
      );
    }
    setVoting(false);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <Loader className="w-5 h-5 text-white/30 animate-spin" />
      </div>
    );
  }

  if (!entry) {
    return (
      <div className="min-h-screen bg-black flex flex-col items-center justify-center px-6 text-center space-y-3">
        <h1 className="text-lg font-bold text-white">That entry is not here</h1>
        <p className="text-sm text-white/40 max-w-xs">
          It may have been withdrawn, or the link was copied short.
        </p>
        <Link to="/sessions" className="text-sm text-lime-400">Back to Sessions</Link>
      </div>
    );
  }

  const who = entry.entrant_full_name
    + (entry.is_group && entry.members?.length ? ` + ${entry.members.length} more` : '');
  const cardTitle = `Vote for ${entry.entrant_full_name} · Feelz Machine Sessions`;
  const cardDesc = entry.song?.title
    ? `${who} on "${entry.song.title}". ${phase === 'open' ? 'Vote now.' : `Voting opens ${longDate(comp?.voting_open_at)}.`}`
    : `${who} in Feelz Machine Sessions.`;

  return (
    <div className="min-h-screen bg-black text-white">
      <Helmet>
        <title>{cardTitle}</title>
        <meta name="description" content={cardDesc} />
        <link rel="canonical" href={shareUrl} />
      </Helmet>

      <div className="px-6 pt-14 pb-28 max-w-xl mx-auto space-y-6">
        <Link to="/sessions" className="inline-flex items-center gap-1.5 text-xs text-white/40 hover:text-white/70">
          <ArrowLeft className="w-3.5 h-3.5" /> Sessions
        </Link>

        <div className="flex items-center space-x-2.5">
          <div className="w-8 h-8 rounded-lg border border-lime-400 flex items-center justify-center text-lime-400 font-bold text-xs">FM</div>
          <div>
            <p className="font-bold text-sm leading-none">FEELZ MACHINE</p>
            <p className="text-[10px] text-white/30 tracking-wider mt-0.5">SESSIONS</p>
          </div>
        </div>

        {/* The entry itself */}
        <div className="rounded-2xl border border-white/[0.07] bg-white/[0.03] overflow-hidden">
          {track?.cover_artwork_url && (
            <img src={track.cover_artwork_url} alt="" className="w-full aspect-square object-cover" />
          )}

          <div className="p-5 space-y-3">
            <div className="flex items-center gap-1.5 flex-wrap">
              {entry.is_winner && (
                <span className="flex items-center gap-1 text-[10px] font-bold text-lime-400 bg-lime-400/10 px-1.5 py-0.5 rounded">
                  <Trophy className="w-3 h-3" /> WINNER
                </span>
              )}
              {entry.is_finalist && !entry.is_winner && (
                <span className="text-[10px] font-bold text-lime-400 bg-lime-400/10 px-1.5 py-0.5 rounded">FINALIST</span>
              )}
            </div>

            <div>
              <h1 className="text-2xl font-bold leading-tight">{who}</h1>
              {entry.song?.title && (
                <p className="text-sm text-white/50 mt-1">
                  Their verses on <span className="text-white/80">{entry.song.title}</span>
                </p>
              )}
            </div>

            {track && (
              <button onClick={play}
                className="w-full flex items-center gap-3 rounded-xl bg-white/[0.05] hover:bg-white/[0.08] transition px-4 py-3 text-left">
                <span className="w-10 h-10 rounded-full bg-lime-400 text-black flex items-center justify-center flex-shrink-0">
                  {isThis && isPlaying
                    ? <Pause className="w-4 h-4" fill="currentColor" />
                    : <Play className="w-4 h-4 ml-0.5" fill="currentColor" />}
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-semibold truncate">{track.title}</span>
                  <span className="block text-xs text-white/40">
                    {isThis && isPlaying ? 'Playing' : 'Listen to the entry'}
                  </span>
                </span>
              </button>
            )}

            {entry.entrant_tiktok_handle && (
              <a href={`https://tiktok.com/@${entry.entrant_tiktok_handle}`}
                target="_blank" rel="noopener noreferrer"
                className="inline-block text-[11px] text-lime-400/70 hover:text-lime-300">
                @{entry.entrant_tiktok_handle} on TikTok
              </a>
            )}
          </div>
        </div>

        {/* The vote */}
        <div className="rounded-2xl border border-white/[0.07] bg-white/[0.03] p-5 space-y-3">
          <div className="flex items-baseline justify-between">
            <p className="text-sm font-semibold">People&rsquo;s Choice</p>
            <p className="text-xs text-white/40">{votes} vote{votes === 1 ? '' : 's'}</p>
          </div>

          {phase === 'not_open' && (
            <div className="flex items-start gap-2.5 rounded-xl border border-white/10 bg-white/[0.03] p-3.5">
              <Lock className="w-4 h-4 text-white/30 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-white/50">
                Voting opens <span className="text-white">{longDate(comp?.voting_open_at)}</span>.
                Send this link to anyone who will vote for {entry.entrant_full_name.split(' ')[0]} then.
              </p>
            </div>
          )}

          {phase === 'closed' && (
            <p className="text-sm text-white/50">Voting has closed. Final count above.</p>
          )}

          {phase === 'open' && !gate.loading && !gate.allowed && (
            <p className="text-sm text-white/50">
              Voting is open to South Africa only. You can still listen and share.
            </p>
          )}

          {phase === 'open' && gate.allowed && (
            votedForThis ? (
              <p className="flex items-center gap-1.5 text-sm text-lime-400 font-semibold">
                <Check className="w-4 h-4" /> You voted for this entry
              </p>
            ) : votedElsewhere ? (
              <p className="text-sm text-white/40">
                You have already used your vote in this competition.{' '}
                <Link to="/sessions/vote" className="text-lime-400">See all entries</Link>
              </p>
            ) : (
              <button onClick={castVote} disabled={voting}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-lime-400 text-black text-sm font-bold disabled:opacity-50">
                {voting ? <Loader className="w-4 h-4 animate-spin" /> : <ThumbsUp className="w-4 h-4" />}
                {user ? `Vote for ${entry.entrant_full_name.split(' ')[0]}` : 'Sign in to vote'}
              </button>
            )
          )}

          <p className="text-[11px] text-white/25">
            One vote per person. Judges pick the winner; this is the separate People&rsquo;s Choice pick.
          </p>

          {error && <p className="text-xs text-red-400">{error}</p>}
        </div>

        <button onClick={share}
          className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl border border-white/10 bg-white/[0.03] hover:bg-white/[0.06] transition text-sm font-semibold">
          {copied ? <Check className="w-4 h-4 text-lime-400" /> : <Share2 className="w-4 h-4" />}
          {copied ? 'Link copied' : 'Share this entry'}
        </button>

        <p className="text-center text-xs text-white/25">
          <Link to="/sessions/vote" className="hover:text-white/50">See every entry</Link>
        </p>
      </div>
    </div>
  );
}
