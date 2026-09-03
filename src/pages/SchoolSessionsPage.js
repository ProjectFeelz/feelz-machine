// src/pages/SchoolSessionsPage.js
// Public landing page at /schoolsessions. Linked from the flyer/card QR
// codes. ALWAYS visible to anyone, regardless of the enabled/region gate,
// that gate now only controls the "enter" / "vote" call to action, not the
// page itself, since schools outside the current season need to be able to
// see this and nominate their district for next time.
//
// Format: entrants cover a song from a curated shortlist as a vocal
// performance, solo or as a group. Judges pick finalists and the winner
// directly; the public vote is a separate People's Choice pick. Winning
// school gets R5,000, winning student(s) get R5,000 (split across the group
// if applicable).

import React from 'react';
import { Helmet } from 'react-helmet-async';
import { useNavigate, Link } from 'react-router-dom';
import {
  Loader, ArrowRight, Megaphone,
  Upload as UploadIcon, ThumbsUp, PlayCircle, BookOpen, Music,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import useSchoolSessions from '../hooks/useSchoolSessions';
import DistrictNomination from '../components/DistrictNomination';
import { supabase } from '../supabaseClient';

// Prominent hero countdown, ticks every second, shown as separate
// day/hour/min/sec boxes.
function BigCountdown({ to, label }) {
  const [now, setNow] = React.useState(Date.now());
  React.useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  if (!to) return null;
  const diff = new Date(to).getTime() - now;
  if (diff <= 0) return null;
  const units = [
    { label: 'Days', value: Math.floor(diff / 86400000) },
    { label: 'Hrs', value: Math.floor((diff % 86400000) / 3600000) },
    { label: 'Min', value: Math.floor((diff % 3600000) / 60000) },
    { label: 'Sec', value: Math.floor((diff % 60000) / 1000) },
  ];
  return (
    <div className="space-y-2">
      {label && <p className="text-lime-400 text-xs lg:text-sm font-bold tracking-widest uppercase">{label}</p>}
      <div className="flex space-x-2 lg:space-x-3">
        {units.map(u => (
          <div key={u.label} className="flex-1 rounded-xl bg-white/[0.04] border border-white/[0.08] py-2.5 lg:py-3.5 text-center">
            <p className="text-2xl lg:text-4xl font-bold text-white tabular-nums">{String(u.value).padStart(2, '0')}</p>
            <p className="text-[10px] lg:text-xs text-white/40 mt-0.5">{u.label}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

// Public gallery of all entries, not just finalists. Paginated so a large
// competition doesn't load everything at once.
const PAGE_SIZE = 12;
function EntryGallery({ compId }) {
  const [entries, setEntries] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [loadingMore, setLoadingMore] = React.useState(false);
  const [hasMore, setHasMore] = React.useState(true);

  const loadPage = React.useCallback((from) => {
    return supabase.from('school_sessions_entries')
      .select('id, entrant_full_name, is_group, is_finalist, created_at, school:school_sessions_schools(name), school_name_freetext, song:school_sessions_shortlist_songs(title), track:tracks(title, cover_artwork_url), members:school_sessions_entry_members(member_name)')
      .eq('competition_id', compId)
      .order('created_at', { ascending: false })
      .range(from, from + PAGE_SIZE - 1);
  }, [compId]);

  React.useEffect(() => {
    if (!compId) return;
    setLoading(true);
    loadPage(0).then(({ data }) => {
      setEntries(data || []);
      setHasMore((data || []).length === PAGE_SIZE);
      setLoading(false);
    });
  }, [compId, loadPage]);

  const loadMore = async () => {
    setLoadingMore(true);
    const { data } = await loadPage(entries.length);
    setEntries(prev => [...prev, ...(data || [])]);
    setHasMore((data || []).length === PAGE_SIZE);
    setLoadingMore(false);
  };

  if (loading) {
    return <div className="flex justify-center py-8"><Loader className="w-4 h-4 text-white/30 animate-spin" /></div>;
  }
  if (entries.length === 0) return null;

  return (
    <div className="space-y-3 lg:space-y-4">
      <p className="text-lime-400 text-xs lg:text-sm font-bold tracking-widest uppercase">Entries so far</p>
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-2.5 lg:gap-3">
        {entries.map(e => (
          <div key={e.id} className={`rounded-xl overflow-hidden border ${e.is_finalist ? 'border-lime-400/40 bg-lime-400/[0.04]' : 'border-white/[0.06] bg-white/[0.02]'}`}>
            <div className="aspect-square bg-white/[0.04] flex items-center justify-center">
              {e.track?.cover_artwork_url ? (
                <img src={e.track.cover_artwork_url} alt="" className="w-full h-full object-cover" />
              ) : (
                <Music className="w-6 h-6 text-white/20" />
              )}
            </div>
            <div className="p-2.5">
              <p className="text-xs font-semibold text-white truncate">
                {e.entrant_full_name}{e.is_group && e.members?.length > 0 ? ` +${e.members.length}` : ''}
              </p>
              <p className="text-[10px] text-white/40 truncate mt-0.5">
                {e.school?.name || e.school_name_freetext}
              </p>
              <p className="text-[10px] text-white/30 truncate">
                "{e.song?.title || e.track?.title}"
              </p>
              {e.is_finalist && (
                <p className="text-[9px] font-bold text-lime-400 uppercase tracking-wide mt-1">Finalist</p>
              )}
            </div>
          </div>
        ))}
      </div>
      {hasMore && (
        <button onClick={loadMore} disabled={loadingMore}
          className="w-full py-2.5 rounded-xl border border-white/[0.08] text-xs font-semibold text-white/50 hover:text-white hover:bg-white/[0.03] transition disabled:opacity-40">
          {loadingMore ? 'Loading…' : 'Load more entries'}
        </button>
      )}
    </div>
  );
}


// entries_open_at / entries_close_at / voting_open_at / voting_close_at.
function currentPhase(comp) {
  if (!comp) return 'awareness';
  const now = Date.now();
  const t = (d) => d ? new Date(d).getTime() : null;
  const entriesOpen = t(comp.entries_open_at);
  const entriesClose = t(comp.entries_close_at);
  const votingOpen = t(comp.voting_open_at);
  const votingClose = t(comp.voting_close_at);

  if (votingClose && now > votingClose) return 'done';
  if ((votingOpen && now >= votingOpen) || (entriesClose && now >= entriesClose)) return 'voting';
  if (entriesOpen && now >= entriesOpen) return 'submissions';
  return 'awareness';
}

export default function SchoolSessionsPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const gate = useSchoolSessions();
  const [songs, setSongs] = React.useState([]);
  const [entryCount, setEntryCount] = React.useState(null);

  const compId = gate.config?.competition?.id;
  React.useEffect(() => {
    if (!compId) return;
    supabase.from('school_sessions_shortlist_songs')
      .select('id, title, reference_url, reference_track:tracks(slug)')
      .eq('competition_id', compId)
      .eq('is_active', true)
      .order('display_order')
      .then(({ data }) => setSongs(data || []));
  }, [compId]);

  React.useEffect(() => {
    if (!compId) return;
    supabase.from('school_sessions_entries')
      .select('id', { count: 'exact', head: true })
      .eq('competition_id', compId)
      .then(({ count }) => setEntryCount(count ?? 0));
  }, [compId]);

  if (gate.loading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <Loader className="w-5 h-5 text-white/30 animate-spin" />
      </div>
    );
  }

  // Eligible = the current season is switched on AND this visitor passes
  // the region/school gate. Everything below this point renders regardless
  // Eligibility only changes which call-to-action shows at the bottom.
  const eligible = gate.enabled && gate.allowed;
  const comp = gate.config?.competition;
  const phase = currentPhase(comp);
  const viralCourseUrl = gate.config?.viral_course_url;
  const platformCourseUrl = gate.config?.platform_course_url;
  const nextSeason = (gate.config?.season || 1) + 1;

  const BASE_URL = 'https://www.feelzmachine.com';
  const pageUrl = `${BASE_URL}/schoolsessions`;
  const pageTitle = 'School Sessions, a high school music competition · Feelz Machine';
  const pageDesc = comp?.prize_breakdown_text || comp?.prize_description
    || 'Pick a song from the shortlist and cover it. Cash prizes for the winning school and student, judged by a panel, with a public People\u2019s Choice vote too.';

  return (
    <div className="min-h-screen bg-black text-white">
      <Helmet>
        <title>{pageTitle}</title>
        <meta name="description" content={pageDesc} />
        <link rel="canonical" href={pageUrl} />
        <meta property="og:title" content={pageTitle} />
        <meta property="og:description" content={pageDesc} />
        <meta property="og:url" content={pageUrl} />
        <meta property="og:image" content={`${BASE_URL}/og-default.png`} />
        <meta property="og:type" content="website" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={pageTitle} />
        <meta name="twitter:description" content={pageDesc} />
        <meta name="twitter:image" content={`${BASE_URL}/og-default.png`} />
      </Helmet>
      <div className="max-w-lg lg:max-w-3xl mx-auto px-6 lg:px-10 pt-14 lg:pt-20 pb-24 space-y-10 lg:space-y-14">

        {/* Brand */}
        <div className="flex items-center space-x-2.5">
          <div className="w-8 h-8 rounded-lg border border-lime-400 flex items-center justify-center text-lime-400 font-bold text-xs">FM</div>
          <div>
            <p className="font-bold text-sm leading-none">FEELZ MACHINE</p>
            <p className="text-[10px] text-white/30 tracking-wider mt-0.5">MUSIC PLATFORM</p>
          </div>
        </div>

        {/* Hero */}
        <div className="space-y-3 lg:space-y-4">
          <p className="text-lime-400 text-xs lg:text-sm font-bold tracking-[0.2em] uppercase">
            High School Competition {gate.config?.season ? `· Season ${gate.config.season}` : ''}
          </p>
          <h1 className="text-4xl lg:text-6xl font-bold leading-[0.98] uppercase">
            School<br /><span className="text-lime-400">Sessions</span>
          </h1>
          <p className="text-white/50 text-sm lg:text-lg lg:max-w-xl leading-relaxed">
            Pick a song from the shortlist and cover it, your own vocal performance. Your school could walk away with cash.
          </p>
          {entryCount !== null && entryCount > 0 && (
            <p className="text-xs lg:text-sm text-white/40 font-medium">
              <span className="text-lime-400 font-bold">{entryCount}</span> {entryCount === 1 ? 'entry' : 'entries'} submitted so far
            </p>
          )}
          {!eligible && (
            <p className="text-xs text-white/30">
              {!gate.enabled ? "Not currently running. See below to put your district forward for next time." : "Not running in your district right now, nominate it below."}
            </p>
          )}
        </div>

        {eligible && phase === 'awareness' && comp?.entries_open_at && (
          <BigCountdown to={comp.entries_open_at} label="Entries open in" />
        )}
        {eligible && phase === 'submissions' && comp?.entries_close_at && (
          <BigCountdown to={comp.entries_close_at} label="Time left to submit" />
        )}
        {eligible && phase === 'voting' && comp?.voting_close_at && (
          <BigCountdown to={comp.voting_close_at} label="Time left to vote" />
        )}

        {/* Prize pot */}
        <div className="rounded-xl border border-white/10 bg-lime-400/[0.04] p-5 lg:p-8">
          <p className="text-3xl lg:text-5xl font-bold text-lime-400">{comp?.prize_description || 'R10,000 CASH'}</p>
          <p className="text-xs lg:text-sm text-white/50 mt-2 lg:mt-3 leading-relaxed lg:max-w-md">
            {comp?.prize_breakdown_text || 'R5,000 to the winning school + R5,000 to the winning student, split among the group if you enter as one.'}
          </p>
        </div>

        {/* How it works */}
        <p className="text-xs text-white/50 leading-relaxed border-l-2 border-lime-400 pl-3">
          <span className="text-white font-semibold">Pick a song from the shortlist and cover it</span>, your own vocal performance over the original track. Solo or as a group; if your group wins, the R5,000 student prize splits evenly across everyone listed.
        </p>

        {/* Song shortlist */}
        {songs.length > 0 && (
          <div className="space-y-2.5 lg:space-y-3">
            <p className="text-lime-400 text-xs lg:text-sm font-bold tracking-widest uppercase">Songs up for grabs</p>
            <div className="grid lg:grid-cols-2 gap-1.5 lg:gap-2.5">
              {songs.map(s => (
                <div key={s.id} className="flex items-center space-x-3 rounded-xl bg-white/[0.03] border border-white/[0.06] px-3.5 py-2.5 lg:py-3">
                  <Music className="w-3.5 h-3.5 text-lime-400 flex-shrink-0" />
                  <span className="text-sm text-white flex-1 truncate">{s.title}</span>
                  {s.reference_track?.slug ? (
                    <Link to={`/track/${s.reference_track.slug}`}
                      className="text-[11px] text-lime-400/70 flex-shrink-0">Listen</Link>
                  ) : s.reference_url ? (
                    <a href={s.reference_url} target="_blank" rel="noopener noreferrer"
                      className="text-[11px] text-lime-400/70 flex-shrink-0">Listen</a>
                  ) : null}
                </div>
              ))}
            </div>
          </div>
        )}

        {gate.config?.youtube_playlist_url && (
          <a href={gate.config.youtube_playlist_url} target="_blank" rel="noopener noreferrer"
            className="flex items-center space-x-3 rounded-xl bg-white/[0.03] border border-white/[0.06] p-3.5 hover:bg-white/[0.05] transition">
            <PlayCircle className="w-4 h-4 text-lime-400 flex-shrink-0" />
            <div>
              <p className="text-sm font-semibold text-white">Watch the playlist on YouTube</p>
              <p className="text-xs text-white/40 mt-0.5">Hear the songs before you pick one</p>
            </div>
          </a>
        )}

        {/* Judges + public vote */}
        <div className="rounded-xl border border-white/[0.06] bg-white/[0.03] p-4 flex items-start space-x-3">
          <ThumbsUp className="w-4 h-4 text-lime-400 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-white/50 leading-relaxed">
            <span className="text-white font-semibold">A judging panel picks the finalists and the winner</span> (announced closer to the time). The public vote runs alongside as a separate <span className="text-white font-semibold">People's Choice</span> pick, post your cover on TikTok and rally votes.
          </p>
        </div>

        {compId && <EntryGallery compId={compId} />}

        {/* Three-phase timeline */}
        <div className="space-y-3 lg:space-y-4">
          <p className="text-lime-400 text-xs lg:text-sm font-bold tracking-widest uppercase">Three months, three phases</p>
          <div className="space-y-3 lg:space-y-0 lg:grid lg:grid-cols-3 lg:gap-4">
            {[
              { key: 'awareness', icon: Megaphone, title: 'Awareness', desc: 'Get ready, take the courses below, check the song shortlist, spread the word.' },
              { key: 'submissions', icon: UploadIcon, title: 'Submissions', desc: 'Pick a song from the shortlist, record your cover, and toggle "Enter into School Sessions" when you upload.' },
              { key: 'voting', icon: ThumbsUp, title: 'Voting', desc: 'Judges announce finalists and pick the winner. The public votes separately for the People\u2019s Choice pick.' },
            ].map((p, i) => {
              const active = eligible && p.key === phase;
              return (
                <div key={p.key} className={`flex items-start space-x-3 lg:flex-col lg:space-x-0 lg:space-y-3 rounded-xl p-3.5 lg:p-4 border h-full ${active ? 'border-lime-400/40 bg-lime-400/[0.06]' : 'border-white/[0.06] bg-white/[0.02]'}`}>
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${active ? 'bg-lime-400 text-black' : 'bg-white/[0.06] text-white/40'}`}>
                    <p.icon className="w-4 h-4" />
                  </div>
                  <div>
                    <p className={`text-sm font-semibold ${active ? 'text-lime-400' : 'text-white'}`}>
                      {i + 1}. {p.title} {active && <span className="text-[10px] font-bold uppercase tracking-wide ml-1">· Now</span>}
                    </p>
                    <p className="text-xs text-white/40 mt-0.5">{p.desc}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Courses */}
        {(viralCourseUrl || platformCourseUrl) && (
          <div className="space-y-3 lg:space-y-4">
            <p className="text-lime-400 text-xs lg:text-sm font-bold tracking-widest uppercase">Free courses to get you ready</p>
            <div className="grid lg:grid-cols-2 gap-2.5 lg:gap-3">
              {platformCourseUrl && (
                <a href={platformCourseUrl} target="_blank" rel="noopener noreferrer"
                  className="flex items-center space-x-3 rounded-xl bg-white/[0.03] border border-white/[0.06] p-3.5 lg:p-4 hover:bg-white/[0.05] transition">
                  <PlayCircle className="w-4 h-4 text-lime-400 flex-shrink-0" />
                  <div>
                    <p className="text-sm font-semibold text-white">How to Use Feelz Machine</p>
                    <p className="text-xs text-white/40 mt-0.5">Recording, uploading, splits, so nobody's at a disadvantage.</p>
                  </div>
                </a>
              )}
              {viralCourseUrl && (
                <a href={viralCourseUrl} target="_blank" rel="noopener noreferrer"
                  className="flex items-center space-x-3 rounded-xl bg-white/[0.03] border border-white/[0.06] p-3.5 lg:p-4 hover:bg-white/[0.05] transition">
                  <BookOpen className="w-4 h-4 text-lime-400 flex-shrink-0" />
                  <div>
                    <p className="text-sm font-semibold text-white">How to Make Viral Content</p>
                    <p className="text-xs text-white/40 mt-0.5">Get your song seen on TikTok and bring in votes.</p>
                  </div>
                </a>
              )}
            </div>
          </div>
        )}

        {/* CTA, gated by eligibility; the rest of the page never is */}
        {eligible ? (
          phase === 'voting' || phase === 'done' ? (
            <button
              onClick={() => navigate('/schoolsessions/vote')}
              className="w-full lg:w-auto lg:px-10 py-3.5 bg-lime-400 text-black font-bold rounded-xl flex items-center justify-center space-x-2 hover:bg-lime-300 transition">
              <span>{phase === 'done' ? 'See the results' : "Vote, People's Choice"}</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          ) : (
            <button
              onClick={() => navigate(user ? '/dashboard' : '/login')}
              className="w-full lg:w-auto lg:px-10 py-3.5 bg-lime-400 text-black font-bold rounded-xl flex items-center justify-center space-x-2 hover:bg-lime-300 transition">
              <span>{user ? 'Upload your entry' : 'Get started'}</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          )
        ) : null}

        {/* Always visible, regardless of eligibility, this is the whole
            point: schools outside the current run need a way in too. */}
        <DistrictNomination nextSeason={nextSeason} />

        <p className="text-center text-[11px] text-white/30">
          Want us to visit your school for a tutorial? Ask your teacher to get in touch.
        </p>
      </div>
    </div>
  );
}