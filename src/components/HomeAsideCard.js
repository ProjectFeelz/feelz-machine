// src/components/HomeAsideCard.js
//
// The card that sits to the right of the feed on a computer. Two tabs:
//
//   What's New & Trending   platform_news rows you write in /admin/news,
//                           the latest Feelz Machine podcast episode, and a
//                           short trending strip
//   Creator Highlights      three artists a day, chosen by
//                           pick_creator_highlights() so everyone loading the
//                           page today sees the same three, and nobody comes
//                           round again inside a week
//
// THE ONE RULE THIS FILE EXISTS TO KEEP
//
// It must never disturb the music. So:
//   * no <iframe> is rendered until somebody clicks a thumbnail. Until then
//     the video is a still image and a play triangle — YouTube's embed can
//     and does autoplay, and an iframe that merely EXISTS is an iframe that
//     can start making noise.
//   * clicking it pauses the audio player first, so the two never overlap.
//   * nothing here calls playTrack on its own. The trending strip plays only
//     on a click, like any other track row.
//
// It is also deliberately quiet about failure: if a query comes back empty or
// the table is not there yet, that section simply is not drawn. A card on the
// home page is not worth an error state.

import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Newspaper, Sparkles, Play, ExternalLink, ChevronRight, Users, Music2 } from 'lucide-react';
import { supabase } from '../supabaseClient';
import { usePlayer } from '../contexts/PlayerContext';
import { useAuth } from '../contexts/AuthContext';

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

// ── One news row ───────────────────────────────────────────────────────
function NewsItem({ item }) {
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
    <div className="rounded-xl bg-white/[0.04] border border-white/[0.06] overflow-hidden">
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
            <button
              onClick={startVideo}
              className="group absolute inset-0 w-full h-full"
              aria-label={`Play ${item.title}`}
            >
              <img
                src={`https://i.ytimg.com/vi/${vid}/hqdefault.jpg`}
                alt=""
                className="absolute inset-0 w-full h-full object-cover"
                loading="lazy"
              />
              <span className="absolute inset-0 bg-black/30 group-hover:bg-black/15 transition" />
              <span className="absolute inset-0 flex items-center justify-center">
                <span className="w-12 h-12 rounded-full bg-black/70 border border-white/25 flex items-center justify-center group-hover:scale-110 transition">
                  <Play className="w-5 h-5 text-white ml-0.5" fill="white" />
                </span>
              </span>
            </button>
          )}
        </div>
      )}

      <div className="p-3">
        <p className="text-sm font-semibold text-white leading-snug">{item.title}</p>
        {item.body && (
          <p className="mt-1 text-[12px] text-white/45 leading-relaxed whitespace-pre-line">
            {item.body}
          </p>
        )}
        {item.link_url && (
          internal ? (
            <button
              onClick={() => navigate(item.link_url)}
              className="mt-2 inline-flex items-center gap-1 text-[12px] font-semibold text-indigo-300 hover:text-indigo-200"
            >
              {item.link_label || 'Open'}
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          ) : (
            <a
              href={item.link_url}
              target="_blank"
              rel="noreferrer"
              className="mt-2 inline-flex items-center gap-1 text-[12px] font-semibold text-indigo-300 hover:text-indigo-200"
            >
              {item.link_label || 'Read more'}
              <ExternalLink className="w-3 h-3" />
            </a>
          )
        )}
      </div>
    </div>
  );
}

// ── The card ───────────────────────────────────────────────────────────
export default function HomeAsideCard() {
  const navigate = useNavigate();
  const { playTrack, currentTrack, isPlaying, togglePlay } = usePlayer();
  const { isAdmin } = useAuth();

  const [tab, setTab]             = useState('news');
  const [news, setNews]           = useState([]);
  const [trending, setTrending]   = useState([]);
  const [creators, setCreators]   = useState([]);
  const [loaded, setLoaded]       = useState(false);

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
          .limit(4),
        supabase
          .from('tracks')
          .select('id, title, slug, file_url, cover_artwork_url, stream_count, is_published, artists!tracks_artist_id_fkey(artist_name, slug)')
          .eq('is_published', true)
          .order('engagement_score', { ascending: false })
          .limit(4),
        supabase.rpc('pick_creator_highlights', { p_count: 3, p_max_admin: 1 }),
      ]);

      if (cancelled) return;

      // Logged, never shown. Before migration 128 runs, the news table and
      // the RPC do not exist and these come back 404/42883 — the card just
      // renders what it has.
      if (newsRes.error)    console.warn('[home card] news:',     newsRes.error.code, newsRes.error.message);
      if (trendRes.error)   console.warn('[home card] trending:', trendRes.error.code, trendRes.error.message);
      if (creatorRes.error) console.warn('[home card] creators:', creatorRes.error.code, creatorRes.error.message);

      setNews((newsRes.data || []));
      setTrending((trendRes.data || []).map(t => ({
        ...t,
        artist_name: t.artists?.artist_name || 'Unknown',
        artist_slug: t.artists?.slug || null,
      })));
      setCreators(creatorRes.data || []);
      setLoaded(true);
    })();

    return () => { cancelled = true; };
  }, []);

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

  const TabButton = ({ id, label, icon: Icon }) => (
    <button
      onClick={() => setTab(id)}
      // whitespace-nowrap and shrink-0 on the icon: at browser zoom the long
      // label was wrapping onto two lines and making the tab bar twice as
      // tall as the other one. A tab that changes height when you zoom is a
      // tab that looks broken.
      className={`flex-1 min-w-0 flex items-center justify-center gap-1.5 px-2 py-2 rounded-lg text-[11.5px] font-semibold whitespace-nowrap transition ${
        tab === id ? 'bg-white text-black' : 'text-white/40 hover:text-white/70'
      }`}
    >
      <Icon className="w-3.5 h-3.5 flex-shrink-0" />
      <span className="truncate">{label}</span>
    </button>
  );

  return (
    <aside
      // data-feelz-scroll tells ForYouPage's window-level wheel handler to
      // leave this alone. Without it, scrolling this card flipped the song
      // underneath and the card itself would not move — the handler calls
      // preventDefault on every wheel event it takes.
      data-feelz-scroll
      className="hidden xl:flex fixed top-0 bottom-0 right-0 w-[380px] flex-col bg-black border-l border-white/[0.07] z-30"
      // Not inside the feed's card stack on purpose: the stack is translated
      // as one block on every swipe, and anything living in it would ride
      // along. This is a sibling, so it stays put while the feed moves.
    >
      <div className="px-4 pt-5 pb-3">
        <div className="flex gap-1 bg-white/[0.03] rounded-xl p-1">
          <TabButton id="news"     label="What's New & Trending" icon={Newspaper} />
          <TabButton id="creators" label="Creators"              icon={Sparkles} />
        </div>
      </div>

      {/* scrollbar-hide: Steve's rule, no visible scrollbars anywhere */}
      <div className="flex-1 overflow-y-auto scrollbar-hide px-4 pb-8 space-y-3">

        {tab === 'news' && (
          <>
            {news.map(item => <NewsItem key={item.id} item={item} />)}

            {/* No posts yet — which is the normal state on day one and every
                quiet week after. Two different silences:

                  * a listener gets NO box at all when there is trending music
                    to show. "Nothing new yet" written across the top of a home
                    page is an announcement that the place is empty, and it is
                    not: the tab still has the chart under it. The box only
                    appears if there is genuinely nothing in the whole tab.
                  * Steve gets a line nobody else sees, with the door to it,
                    because the failure mode of a card you fill by hand is
                    forgetting it exists. */}
            {loaded && !news.length && !trending.length && (
              <div className="rounded-xl bg-white/[0.03] border border-white/[0.06] p-4">
                <p className="text-sm font-semibold text-white">Nothing new yet</p>
                <p className="mt-1 text-[12px] text-white/40 leading-relaxed">
                  Platform news and new podcast episodes will show up here.
                </p>
              </div>
            )}

            {loaded && !news.length && isAdmin && (
              <button
                onClick={() => navigate('/admin/news')}
                className="w-full text-left rounded-xl border border-dashed border-white/15 bg-white/[0.02] p-3.5 hover:border-white/30 hover:bg-white/[0.04] transition"
              >
                <p className="text-[12px] font-semibold text-white/70">No posts yet</p>
                <p className="mt-0.5 text-[11px] text-white/35 leading-relaxed">
                  Write one, or paste a podcast episode link. Only you can see this.
                </p>
              </button>
            )}

            {trending.length > 0 && (
              <div className="pt-2">
                <p className="px-1 pb-2 text-[11px] font-bold tracking-wider text-white/30 uppercase">
                  Trending right now
                </p>
                <div className="space-y-1">
                  {trending.map((t, i) => {
                    const isThisOne = currentTrack?.id === t.id;
                    return (
                      <button
                        key={t.id}
                        onClick={() => playFromStrip(t)}
                        className="w-full flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-white/[0.05] transition text-left"
                      >
                        <span className="w-4 text-[12px] font-bold text-white/25 tabular-nums">{i + 1}</span>
                        {t.cover_artwork_url ? (
                          <img src={t.cover_artwork_url} alt="" className="w-9 h-9 rounded-md object-cover" loading="lazy" />
                        ) : (
                          <span className="w-9 h-9 rounded-md bg-white/[0.06] flex items-center justify-center">
                            <Music2 className="w-4 h-4 text-white/25" />
                          </span>
                        )}
                        <span className="min-w-0 flex-1">
                          <span className="block text-[13px] font-semibold text-white truncate">{t.title}</span>
                          <span className="block text-[11px] text-white/35 truncate">{t.artist_name}</span>
                        </span>
                        {isThisOne && isPlaying
                          ? <span className="text-[10px] font-bold text-indigo-300">PLAYING</span>
                          : <Play className="w-3.5 h-3.5 text-white/25" />}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </>
        )}

        {tab === 'creators' && (
          <>
            {creators.map(c => (
              <button
                key={c.id}
                onClick={() => c.slug && navigate(`/artist/${c.slug}`)}
                className="w-full text-left rounded-xl bg-white/[0.04] border border-white/[0.06] overflow-hidden hover:border-white/20 transition"
              >
                {/* The artist's own image IS the artwork — that was the point
                    of this tab, so it gets the whole top of the card. */}
                <div className="relative w-full" style={{ aspectRatio: '4 / 3' }}>
                  <img
                    src={c.profile_image_url}
                    alt={c.artist_name}
                    className="absolute inset-0 w-full h-full object-cover"
                    loading="lazy"
                  />
                  <span className="absolute inset-0 bg-gradient-to-t from-black via-black/20 to-transparent" />
                  <span className="absolute left-3 right-3 bottom-2">
                    <span className="block text-sm font-bold text-white truncate">{c.artist_name}</span>
                    <span className="flex items-center gap-3 mt-0.5 text-[11px] text-white/50">
                      <span className="inline-flex items-center gap-1">
                        <Users className="w-3 h-3" />{fmt(c.follower_count)}
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <Music2 className="w-3 h-3" />{fmt(c.track_count)}
                      </span>
                    </span>
                  </span>
                </div>
                {c.bio && (
                  <p className="px-3 py-2.5 text-[12px] text-white/45 leading-relaxed line-clamp-3">
                    {c.bio}
                  </p>
                )}
              </button>
            ))}

            {!creators.length && loaded && (
              <div className="rounded-xl bg-white/[0.03] border border-white/[0.06] p-4">
                <p className="text-sm font-semibold text-white">No highlights today</p>
                <p className="mt-1 text-[12px] text-white/40 leading-relaxed">
                  Artists show up here once their profile has a picture, a bio
                  and a released track.
                </p>
              </div>
            )}
          </>
        )}
      </div>
    </aside>
  );
}