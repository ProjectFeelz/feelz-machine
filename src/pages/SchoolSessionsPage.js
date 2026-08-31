// src/pages/SchoolSessionsPage.js
// Public landing page at /schoolsessions — linked from the flyer/card QR
// codes. ALWAYS visible to anyone, regardless of the enabled/region gate —
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

function Countdown({ to, label }) {
  const [now, setNow] = React.useState(Date.now());
  React.useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000 * 30);
    return () => clearInterval(t);
  }, []);
  if (!to) return null;
  const diff = new Date(to).getTime() - now;
  if (diff <= 0) return null;
  const days = Math.floor(diff / 86400000);
  const hours = Math.floor((diff % 86400000) / 3600000);
  return <span>{days}d {hours}h {label}</span>;
}

// Which of the three phases we're in, based on the linked competition's
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

  if (gate.loading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <Loader className="w-5 h-5 text-white/30 animate-spin" />
      </div>
    );
  }

  // Eligible = the current season is switched on AND this visitor passes
  // the region/school gate. Everything below this point renders regardless
  // — eligibility only changes which call-to-action shows at the bottom.
  const eligible = gate.enabled && gate.allowed;
  const comp = gate.config?.competition;
  const phase = currentPhase(comp);
  const viralCourseUrl = gate.config?.viral_course_url;
  const platformCourseUrl = gate.config?.platform_course_url;
  const nextSeason = (gate.config?.season || 1) + 1;

  const BASE_URL = 'https://www.feelzmachine.com';
  const pageUrl = `${BASE_URL}/schoolsessions`;
  const pageTitle = 'School Sessions — a high school music competition · Feelz Machine';
  const pageDesc = comp?.prize_breakdown_text || comp?.prize_description
    || 'Pick a song from the shortlist and cover it. Cash prizes for the winning school and student — judged by a panel, with a public People\u2019s Choice vote too.';

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
      <div className="max-w-lg mx-auto px-6 pt-14 pb-24 space-y-10">

        {/* Brand */}
        <div className="flex items-center space-x-2.5">
          <div className="w-8 h-8 rounded-lg border border-lime-400 flex items-center justify-center text-lime-400 font-bold text-xs">FM</div>
          <div>
            <p className="font-bold text-sm leading-none">FEELZ MACHINE</p>
            <p className="text-[10px] text-white/30 tracking-wider mt-0.5">MUSIC PLATFORM</p>
          </div>
        </div>

        {/* Hero */}
        <div className="space-y-3">
          <p className="text-lime-400 text-xs font-bold tracking-[0.2em] uppercase">
            High School Competition {gate.config?.season ? `· Season ${gate.config.season}` : ''}
          </p>
          <h1 className="text-4xl font-bold leading-[0.98] uppercase">
            School<br /><span className="text-lime-400">Sessions</span>
          </h1>
          <p className="text-white/50 text-sm leading-relaxed">
            Pick a song from the shortlist and cover it — your own vocal performance. Your school could walk away with cash.
          </p>
          {eligible && phase === 'submissions' && comp?.entries_close_at && (
            <p className="text-xs text-white/40 font-medium"><Countdown to={comp.entries_close_at} label="left to submit" /></p>
          )}
          {eligible && phase === 'voting' && comp?.voting_close_at && (
            <p className="text-xs text-white/40 font-medium"><Countdown to={comp.voting_close_at} label="left to vote" /></p>
          )}
          {!eligible && (
            <p className="text-xs text-white/30">
              {!gate.enabled ? "Not currently running — see below to put your district forward for next time." : "Not running in your district right now — nominate it below."}
            </p>
          )}
        </div>

        {/* Prize pot */}
        <div className="rounded-xl border border-white/10 bg-lime-400/[0.04] p-5">
          <p className="text-3xl font-bold text-lime-400">{comp?.prize_description || 'R10,000 CASH'}</p>
          <p className="text-xs text-white/50 mt-2 leading-relaxed">
            {comp?.prize_breakdown_text || 'R5,000 to the winning school + R5,000 to the winning student — split among the group if you enter as one.'}
          </p>
        </div>

        {/* How it works */}
        <p className="text-xs text-white/50 leading-relaxed border-l-2 border-lime-400 pl-3">
          <span className="text-white font-semibold">Pick a song from the shortlist and cover it</span> — your own vocal performance over the original track. Solo or as a group; if your group wins, the R5,000 student prize splits evenly across everyone listed.
        </p>

        {/* Song shortlist */}
        {songs.length > 0 && (
          <div className="space-y-2.5">
            <p className="text-lime-400 text-xs font-bold tracking-widest uppercase">Songs up for grabs</p>
            <div className="space-y-1.5">
              {songs.map(s => (
                <div key={s.id} className="flex items-center space-x-3 rounded-xl bg-white/[0.03] border border-white/[0.06] px-3.5 py-2.5">
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

        {/* Judges + public vote */}
        <div className="rounded-xl border border-white/[0.06] bg-white/[0.03] p-4 flex items-start space-x-3">
          <ThumbsUp className="w-4 h-4 text-lime-400 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-white/50 leading-relaxed">
            <span className="text-white font-semibold">A judging panel picks the finalists and the winner</span> (announced closer to the time). The public vote runs alongside as a separate <span className="text-white font-semibold">People's Choice</span> pick — post your cover on TikTok and rally votes.
          </p>
        </div>

        {/* Three-phase timeline */}
        <div className="space-y-3">
          <p className="text-lime-400 text-xs font-bold tracking-widest uppercase">Three months, three phases</p>
          {[
            { key: 'awareness', icon: Megaphone, title: 'Awareness', desc: 'Get ready — take the courses below, check the song shortlist, spread the word.' },
            { key: 'submissions', icon: UploadIcon, title: 'Submissions', desc: 'Pick a song from the shortlist, record your cover, and toggle "Enter into School Sessions" when you upload.' },
            { key: 'voting', icon: ThumbsUp, title: 'Voting', desc: 'Judges announce finalists and pick the winner. The public votes separately for the People\u2019s Choice pick.' },
          ].map((p, i) => {
            const active = eligible && p.key === phase;
            return (
              <div key={p.key} className={`flex items-start space-x-3 rounded-xl p-3.5 border ${active ? 'border-lime-400/40 bg-lime-400/[0.06]' : 'border-white/[0.06] bg-white/[0.02]'}`}>
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

        {/* Courses */}
        {(viralCourseUrl || platformCourseUrl) && (
          <div className="space-y-3">
            <p className="text-lime-400 text-xs font-bold tracking-widest uppercase">Free courses to get you ready</p>
            <div className="space-y-2.5">
              {platformCourseUrl && (
                <a href={platformCourseUrl} target="_blank" rel="noopener noreferrer"
                  className="flex items-center space-x-3 rounded-xl bg-white/[0.03] border border-white/[0.06] p-3.5 hover:bg-white/[0.05] transition">
                  <PlayCircle className="w-4 h-4 text-lime-400 flex-shrink-0" />
                  <div>
                    <p className="text-sm font-semibold text-white">How to Use Feelz Machine</p>
                    <p className="text-xs text-white/40 mt-0.5">Recording, uploading, splits — so nobody's at a disadvantage.</p>
                  </div>
                </a>
              )}
              {viralCourseUrl && (
                <a href={viralCourseUrl} target="_blank" rel="noopener noreferrer"
                  className="flex items-center space-x-3 rounded-xl bg-white/[0.03] border border-white/[0.06] p-3.5 hover:bg-white/[0.05] transition">
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

        {/* CTA — gated by eligibility; the rest of the page never is */}
        {eligible ? (
          phase === 'voting' || phase === 'done' ? (
            <button
              onClick={() => navigate('/schoolsessions/vote')}
              className="w-full py-3.5 bg-lime-400 text-black font-bold rounded-xl flex items-center justify-center space-x-2 hover:bg-lime-300 transition">
              <span>{phase === 'done' ? 'See the results' : "Vote — People's Choice"}</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          ) : (
            <button
              onClick={() => navigate(user ? '/dashboard' : '/login')}
              className="w-full py-3.5 bg-lime-400 text-black font-bold rounded-xl flex items-center justify-center space-x-2 hover:bg-lime-300 transition">
              <span>{user ? 'Upload your entry' : 'Get started'}</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          )
        ) : null}

        {/* Always visible, regardless of eligibility — this is the whole
            point: schools outside the current run need a way in too. */}
        <DistrictNomination nextSeason={nextSeason} />

        <p className="text-center text-[11px] text-white/30">
          Want us to visit your school for a tutorial? Ask your teacher to get in touch.
        </p>
      </div>
    </div>
  );
}