// src/components/HomeAsideCard.js
//
// The column to the right of the feed, on a computer.
//
// SHAPE (settled with Steve, 24 Sep)
//
//   The column itself is CREATORS. Three artists a day, chosen by
//   pick_creator_highlights() so everyone loading the page today sees the
//   same three and nobody comes round again inside a week. It is the column's
//   permanent content because it is the part with artwork in it — a strip of
//   text posts next to a record player is a dead strip.
//
//   WHAT'S NEW & TRENDING is a button, not a tab. It opens over the page, so
//   the posts get a readable measure instead of a 380px gutter, and the
//   pinned post gets to look like the thing you are meant to read first.
//
// THE RULE THIS FILE EXISTS TO KEEP
//
//   It must never disturb the music. No <iframe> is rendered until somebody
//   clicks a thumbnail — a YouTube embed that merely exists can autoplay —
//   and the click pauses the audio player before the iframe mounts. Nothing
//   here calls playTrack on its own.
//
// COLOUR
//
//   Everything in here is neutral: near-black surfaces, chrome hairlines, one
//   violet accent used only on things you can press. That is deliberate. The
//   content IS the colour — artist photos, cover art, video thumbnails — and
//   any hue in the furniture would end up fighting whatever artwork loaded
//   next to it. Contrast comes from luminance and edges, not from paint.

import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Newspaper, Sparkles, Play, ExternalLink, ChevronRight, ArrowUpRight,
  Users, Music2, X, Pin,
} from 'lucide-react';
import { supabase } from '../supabaseClient';
import { usePlayer } from '../contexts/PlayerContext';
import { useAuth } from '../contexts/AuthContext';

// ── Tokens ─────────────────────────────────────────────────────────────
// Named once so the panel and the overlay cannot drift apart, and so the
// whole thing can be re-toned by editing five lines.
const T = {
  panel:   '#08080B',              // the column: black with the faintest blue in it,
                                   // so it reads as a surface beside the feed's true black
  surface: 'rgba(255,255,255,0.05)',
  surfaceUp:'rgba(255,255,255,0.08)',
  edge:    'rgba(255,255,255,0.10)',
  edgeUp:  'rgba(255,255,255,0.22)',
  accent:  '#A78BFA',              // violet. Pressable things only.
  accentDim:'rgba(167,139,250,0.14)',
};

// Accepts whatever Steve pastes: watch?v=, youtu.be/, /embed/, /shorts/,
// /live/, with or without extra query junk. Returns null for anything else,
// which is what keeps a mistyped link from rendering a broken player.
export function youTubeId(url) {
  if (!url || typeof url !== 'string') return null;
  const patterns = [
    /[?&]v=([A-Za-z0-9_-]{11})/,
    /youtu\.be\/([A-Za-z0-9_-]{11})/,
    /\/embed\/([A-Za-z0-9_-]{11})/,
    /\/shorts\/([A-Za-z0-9_-]{11})/,
    /\/live\/([A-Za-z0-9_-]{11})/,
  ];
  for (const p of patterns) {
    const m = url.match(p);
    if (m) return m[1];
  }
  // A bare id, pasted on its own
  if (/^[A-Za-z0-9_-]{11}$/.test(url.trim())) return url.trim();
  return null;
}

const fmt = (n) => {
  const v = Number(n) || 0;
  if (v >= 1000000) return `${(v / 1000000).toFixed(1)}M`;
  if (v >= 1000)    return `${(v / 1000).toFixed(1)}K`;
  return String(v);
};

// ── One news row, inside the overlay ───────────────────────────────────
function NewsItem({ item, featured }) {
  const [playing, setPlaying] = useState(false);
  const { isPlaying, togglePlay } = usePlayer();
  const navigate = useNavigate();
  const vid = youTubeId(item.youtube_url);

  // A link can be either — "/profile/edit" or "https://…". An internal path
  // put through an <a href> would tear the whole app down and rebuild it,
  // losing the playing track on the way, so those go through the router.
  const internal = !!item.link_url && item.link_url.startsWith('/');

  const startVideo = () => {
    // Pause the music BEFORE the iframe exists, not after.
    if (isPlaying) togglePlay();
    setPlaying(true);
  };

  return (
    <article
      className="rounded-2xl overflow-hidden"
      style={{
        background: featured ? 'rgba(167,139,250,0.06)' : T.surface,
        border: `1px solid ${featured ? 'rgba(167,139,250,0.30)' : T.edge}`,
        boxShadow: featured ? '0 0 0 1px rgba(167,139,250,0.08), 0 18px 40px rgba(0,0,0,0.5)' : 'none',
      }}
    >
      {vid && (
        <div className="relative w-full" style={{ aspectRatio: '16 / 9' }}>
          {playing ? (
            <iframe
              title={item.title}
              src={`https://www.youtube.com/embed/${vid}?autoplay=1&rel=0&modestbranding=1`}
              allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
              className="absolute inset-0 w-full h-full"
              frameBorder="0"
            />
          ) : (
            <button onClick={startVideo} className="group absolute inset-0 w-full h-full"
              aria-label={`Play ${item.title}`}>
              <img src={`https://i.ytimg.com/vi/${vid}/hqdefault.jpg`} alt=""
                className="absolute inset-0 w-full h-full object-cover" loading="lazy" />
              <span className="absolute inset-0 bg-black/35 group-hover:bg-black/15 transition" />
              <span className="absolute inset-0 flex items-center justify-center">
                <span className="w-14 h-14 rounded-full bg-black/75 border border-white/25 flex items-center justify-center group-hover:scale-110 transition">
                  <Play className="w-6 h-6 text-white ml-0.5" fill="white" />
                </span>
              </span>
            </button>
          )}
        </div>
      )}

      <div className="p-5">
        {featured && (
          <p className="mb-2 inline-flex items-center gap-1.5 text-[10px] font-bold tracking-[0.14em] uppercase"
            style={{ color: T.accent }}>
            <Pin className="w-3 h-3" /> Start here
          </p>
        )}
        <h3 className={`font-bold text-white leading-snug ${featured ? 'text-xl' : 'text-base'}`}>
          {item.title}
        </h3>
        {item.body && (
          <p className={`mt-2 text-white/55 leading-relaxed whitespace-pre-line ${featured ? 'text-[14px]' : 'text-[13px]'}`}>
            {item.body}
          </p>
        )}
        {item.link_url && (
          internal ? (
            <button onClick={() => navigate(item.link_url)}
              className="mt-3 inline-flex items-center gap-1 text-[13px] font-semibold hover:opacity-80 transition"
              style={{ color: T.accent }}>
              {item.link_label || 'Open'}<ChevronRight className="w-4 h-4" />
            </button>
          ) : (
            <a href={item.link_url} target="_blank" rel="noreferrer"
              className="mt-3 inline-flex items-center gap-1 text-[13px] font-semibold hover:opacity-80 transition"
              style={{ color: T.accent }}>
              {item.link_label || 'Read more'}<ExternalLink className="w-3.5 h-3.5" />
            </a>
          )
        )}
      </div>
    </article>
  );
}

// ── The overlay ────────────────────────────────────────────────────────
export function NewsOverlay({ news, trending, loaded, isAdmin, onClose, onPlay, currentTrack, isPlaying }) {
  const navigate = useNavigate();

  // Escape closes it. Cheap, and people expect it of anything that covers
  // the page.
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const pinned = news.filter(n => n.pinned);
  const rest   = news.filter(n => !n.pinned);

  return (
    <div
      className="fixed inset-0 z-[900] flex items-start justify-center overflow-y-auto scrollbar-hide"
      style={{ background: 'rgba(0,0,0,0.72)', backdropFilter: 'blur(14px)', WebkitBackdropFilter: 'blur(14px)' }}
      onClick={onClose}
      data-feelz-scroll
    >
      <div
        className="relative w-full max-w-2xl my-10 mx-4 rounded-3xl"
        style={{
          background: T.panel,
          border: `1px solid ${T.edge}`,
          boxShadow: '0 40px 120px rgba(0,0,0,0.8)',
        }}
        onClick={e => e.stopPropagation()}
      >
        <header className="sticky top-0 z-10 flex items-center justify-between px-6 py-5 rounded-t-3xl"
          style={{ background: T.panel, borderBottom: `1px solid ${T.edge}` }}>
          <div className="flex items-center gap-2.5">
            <Newspaper className="w-4 h-4" style={{ color: T.accent }} />
            <h2 className="text-[15px] font-bold text-white">What's New &amp; Trending</h2>
          </div>
          <button onClick={onClose}
            className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-white/10 transition"
            style={{ border: `1px solid ${T.edge}` }} aria-label="Close">
            <X className="w-4 h-4 text-white/60" />
          </button>
        </header>

        <div className="px-6 py-6 space-y-4">
          {pinned.map(item => <NewsItem key={item.id} item={item} featured />)}
          {rest.map(item   => <NewsItem key={item.id} item={item} />)}

          {loaded && !news.length && (
            <div className="rounded-2xl p-6 text-center"
              style={{ background: T.surface, border: `1px solid ${T.edge}` }}>
              <p className="text-sm font-semibold text-white">Nothing posted yet</p>
              <p className="mt-1 text-[13px] text-white/40">
                Platform news and podcast episodes land here.
              </p>
            </div>
          )}

          {loaded && !news.length && isAdmin && (
            <button onClick={() => { onClose(); navigate('/admin/news'); }}
              className="w-full text-left rounded-2xl p-4 transition hover:bg-white/[0.04]"
              style={{ border: `1px dashed ${T.edgeUp}` }}>
              <p className="text-[13px] font-semibold text-white/70">Write the first one</p>
              <p className="mt-0.5 text-[12px] text-white/35">Only you can see this.</p>
            </button>
          )}

          {trending.length > 0 && (
            <div className="pt-4">
              <p className="pb-3 text-[11px] font-bold tracking-[0.14em] text-white/30 uppercase">
                Trending right now
              </p>
              <div className="rounded-2xl overflow-hidden" style={{ border: `1px solid ${T.edge}` }}>
                {trending.map((t, i) => {
                  const isThisOne = currentTrack?.id === t.id;
                  return (
                    <button key={t.id} onClick={() => onPlay(t)}
                      className="w-full flex items-center gap-4 px-4 py-3 hover:bg-white/[0.05] transition text-left"
                      style={{ borderTop: i === 0 ? 'none' : `1px solid ${T.edge}` }}>
                      <span className="w-4 text-[13px] font-bold text-white/25 tabular-nums">{i + 1}</span>
                      {t.cover_artwork_url ? (
                        <img src={t.cover_artwork_url} alt="" className="w-11 h-11 rounded-lg object-cover" loading="lazy" />
                      ) : (
                        <span className="w-11 h-11 rounded-lg flex items-center justify-center" style={{ background: T.surface }}>
                          <Music2 className="w-4 h-4 text-white/25" />
                        </span>
                      )}
                      <span className="min-w-0 flex-1">
                        <span className="block text-[14px] font-semibold text-white truncate">{t.title}</span>
                        <span className="block text-[12px] text-white/40 truncate">{t.artist_name}</span>
                      </span>
                      {isThisOne && isPlaying
                        ? <span className="text-[10px] font-bold tracking-wider" style={{ color: T.accent }}>PLAYING</span>
                        : <Play className="w-4 h-4 text-white/25" />}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── The column ─────────────────────────────────────────────────────────
// ── Shared data ────────────────────────────────────────────────────────
// Exported because Browse shows the same two things in its own tab strip.
// One hook rather than two copies of these queries, so a change to what
// "today's creators" means cannot land on one page and not the other.
export function useHomeCardData({ creatorCount = 3 } = {}) {
  const [news, setNews]         = useState([]);
  const [trending, setTrending] = useState([]);
  const [creators, setCreators] = useState([]);
  const [loaded, setLoaded]     = useState(false);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const [newsRes, trendRes, creatorRes] = await Promise.all([
        supabase
          .from('platform_news')
          .select('id, title, body, link_url, link_label, youtube_url, published_at, pinned')
          .eq('is_published', true)
          .order('pinned',       { ascending: false })
          .order('published_at', { ascending: false })
          // Room for the evergreen guides AND a run of update posts. At 8 a
          // busy week of updates pushed "How you get paid here" off the end,
          // which is the wrong thing to lose.
          .limit(16),
        supabase
          .from('tracks')
          .select('id, title, slug, file_url, cover_artwork_url, stream_count, is_published, artists!tracks_artist_id_fkey(artist_name, slug)')
          .eq('is_published', true)
          .order('engagement_score', { ascending: false })
          .limit(5),
        supabase.rpc('pick_creator_highlights', { p_count: creatorCount, p_max_admin: 1 }),
      ]);

      if (cancelled) return;

      // Logged, never shown. Before migration 128 runs, the news table and
      // the RPC do not exist and these come back 404/42883 — the column just
      // renders what it has.
      if (newsRes.error)    console.warn('[home card] news:',     newsRes.error.code, newsRes.error.message);
      if (trendRes.error)   console.warn('[home card] trending:', trendRes.error.code, trendRes.error.message);
      if (creatorRes.error) console.warn('[home card] creators:', creatorRes.error.code, creatorRes.error.message);

      setNews(newsRes.data || []);
      setTrending((trendRes.data || []).map(t => ({
        ...t,
        artist_name: t.artists?.artist_name || 'Unknown',
        artist_slug: t.artists?.slug || null,
      })));
      setCreators(creatorRes.data || []);
      setLoaded(true);
    })();

    return () => { cancelled = true; };
  }, [creatorCount]);

  return { news, trending, creators, loaded };
}

// ── One creator card ───────────────────────────────────────────────────
// Exported so Browse can lay the same card out in a grid.
export function CreatorCard({ creator: c }) {
  const navigate = useNavigate();
  return (
    <button
      onClick={() => c.slug && navigate(`/artist/${c.slug}`)}
      className="group w-full text-left rounded-2xl overflow-hidden transition"
      style={{ background: T.surface, border: `1px solid ${T.edge}` }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = T.edgeUp; }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = T.edge; }}
    >
      {/* The artist's own image IS the artwork. That is the whole point of
          this card, so it gets a proper 4:3 and a scrim heavy enough that
          white type sits on it at any brightness. The artwork is where all
          the colour comes from; everything else here stays neutral so it
          cannot clash with whatever loads next to it. */}
      <div className="relative w-full" style={{ aspectRatio: '4 / 3' }}>
        <img
          src={c.profile_image_url}
          alt={c.artist_name}
          className="absolute inset-0 w-full h-full object-cover transition duration-500 group-hover:scale-[1.04]"
          loading="lazy"
        />
        <span className="absolute inset-0"
          style={{ background: 'linear-gradient(180deg, rgba(0,0,0,0) 30%, rgba(0,0,0,0.55) 68%, rgba(0,0,0,0.92) 100%)' }} />
        <span className="absolute left-3.5 right-3.5 bottom-3">
          <span className="block text-[17px] font-bold text-white leading-tight truncate"
            style={{ textShadow: '0 1px 12px rgba(0,0,0,0.7)' }}>
            {c.artist_name}
          </span>
          <span className="flex items-center gap-3 mt-1 text-[11px] font-semibold text-white/70">
            <span className="inline-flex items-center gap-1"><Users className="w-3 h-3" />{fmt(c.follower_count)}</span>
            <span className="inline-flex items-center gap-1"><Music2 className="w-3 h-3" />{fmt(c.track_count)}</span>
          </span>
        </span>
      </div>

      {c.bio && (
        <p className="px-3.5 py-3 text-[12.5px] text-white/50 leading-relaxed line-clamp-3">
          {c.bio}
        </p>
      )}

      <span className="flex items-center gap-1 px-3.5 pb-3 text-[12px] font-semibold opacity-0 group-hover:opacity-100 transition"
        style={{ color: T.accent }}>
        View profile <ChevronRight className="w-3.5 h-3.5" />
      </span>
    </button>
  );
}

// Shown when there is nobody to show. Exported for the same reason.
export function NoCreators() {
  return (
    <div className="rounded-2xl p-4" style={{ background: T.surface, border: `1px solid ${T.edge}` }}>
      <p className="text-sm font-semibold text-white">No highlights today</p>
      <p className="mt-1 text-[12px] text-white/40 leading-relaxed">
        Artists show up here once their profile has a picture, a bio and a
        released track.
      </p>
    </div>
  );
}

export default function HomeAsideCard() {
  const { playTrack, currentTrack, isPlaying, togglePlay } = usePlayer();
  const { isAdmin } = useAuth();

  const { news, trending, creators, loaded } = useHomeCardData({ creatorCount: 3 });
  const [newsOpen, setNewsOpen] = useState(false);

  const playFromStrip = useCallback((track) => {
    if (!track?.file_url) return;
    if (currentTrack?.id === track.id) { togglePlay(); return; }
    window.__feelz_play_source = 'home_card';
    playTrack(track, trending.filter(t => t?.file_url));
  }, [currentTrack?.id, playTrack, togglePlay, trending]);

  // NOTE — do not add "if there is nothing, render null" here.
  //
  // The feed next door reserves this column with a CSS breakpoint
  // (ForYouPage: xl:right-[380px]), and a media query cannot know whether this
  // component decided to draw. Returning null would leave a 380px strip of
  // black nailed to the side of the page with nothing in it — worse than any
  // empty state. The column is always occupied; what fills it degrades.

  return (
    <>
      <aside
        // data-feelz-scroll tells ForYouPage's window-level wheel handler to
        // leave this alone. Without it, scrolling this card flipped the song
        // underneath and the card itself would not move — the handler calls
        // preventDefault on every wheel event it takes.
        data-feelz-scroll
        className="hidden xl:flex fixed top-0 bottom-0 right-0 w-[380px] flex-col z-30"
        style={{
          background: T.panel,
          // A hairline that is brightest at the top and fades out — the edge
          // of a surface catching light, rather than a drawn border. It is
          // what stops the column reading as a hole cut in the page now that
          // the feed beside it also ends in black.
          borderImage: 'linear-gradient(180deg, rgba(255,255,255,0.16), rgba(255,255,255,0.03) 55%, transparent) 1',
          borderLeft: '1px solid rgba(255,255,255,0.10)',
        }}
      >
        {/* ── Header: one tab, one door ───────────────────────────────── */}
        <div className="px-4 pt-5 pb-4" style={{ borderBottom: `1px solid ${T.edge}` }}>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-2 px-3 py-2 rounded-xl flex-1 min-w-0"
              style={{ background: T.surfaceUp, border: `1px solid ${T.edge}` }}>
              <Sparkles className="w-4 h-4 flex-shrink-0" style={{ color: T.accent }} />
              {/* No TODAY pill any more. "Artist Highlight" is a longer
                  label than "Creators" was, and the row has to hold the
                  What's New button beside it inside 380px. The tagline
                  underneath already says the picks change daily. */}
              <span className="text-[13px] font-bold text-white truncate">Artist Highlight</span>
            </div>

            {/* Not a tab. A door — it opens over the page, because a column
                380px wide is a bad place to read paragraphs. */}
            <button
              onClick={() => setNewsOpen(true)}
              title="What's New & Trending"
              aria-label="What's New and Trending"
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl flex-shrink-0 transition hover:bg-white/[0.08]"
              style={{ border: `1px solid ${T.edge}` }}
            >
              <Newspaper className="w-4 h-4 text-white/45" />
              <span className="text-[12px] font-semibold text-white/55 whitespace-nowrap">What's New</span>
              <ArrowUpRight className="w-3.5 h-3.5 text-white/30" />
              {/* A quiet dot when there is something in there, so the button
                  is not permanently shouting. */}
              {news.length > 0 && (
                <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: T.accent }} />
              )}
            </button>
          </div>
        </div>

        {/* ── Creators ────────────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto scrollbar-hide px-4 py-4 space-y-3">
          {creators.map(c => <CreatorCard key={c.id} creator={c} />)}

          {loaded && !creators.length && <NoCreators />}

          {loaded && creators.length > 0 && (
            <p className="pt-1 pb-2 text-center text-[11px] text-white/20 leading-relaxed">
              Come back tomorrow for more. Get to know your creators.
            </p>
          )}
        </div>
      </aside>

      {newsOpen && (
        <NewsOverlay
          news={news}
          trending={trending}
          loaded={loaded}
          isAdmin={isAdmin}
          onClose={() => setNewsOpen(false)}
          onPlay={playFromStrip}
          currentTrack={currentTrack}
          isPlaying={isPlaying}
        />
      )}
    </>
  );
}