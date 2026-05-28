import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { useAuth } from '../contexts/AuthContext';
import { usePlayer } from '../contexts/PlayerContext';
import ShareCard from '../components/ShareCard';
import {
  ChevronLeft, Play, Pause, Heart, Share2, Download,
  Music, Users, MessageCircle, Loader, ExternalLink,
  Clock, BarChart2, ShoppingBag
} from 'lucide-react';
import { useTier } from '../contexts/useTier';

function fmt(n) {
  if (!n) return '0';
  if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
  if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
  return String(n);
}

function formatDuration(secs) {
  if (!secs) return null;
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export default function TrackDetailPage() {
  const { slug } = useParams();
  const navigate  = useNavigate();
  const { user, artist: myArtist } = useAuth();
  const { playTrack, currentTrack, isPlaying, togglePlay } = usePlayer();

  const [track, setTrack]         = useState(null);
  const [artist, setArtist]       = useState(null);
  const [credits, setCredits]     = useState([]);
  const [comments, setComments]   = useState([]);
  const [liked, setLiked]         = useState(false);
  const [likeCount, setLikeCount] = useState(0);
  const [following, setFollowing] = useState(false);
  const [loading, setLoading]     = useState(true);
  const [commenting, setCommenting] = useState(false);
  const [commentText, setCommentText] = useState('');
  const [posting, setPosting]     = useState(false);
  const [shareCard, setShareCard]   = useState(null);

  const isCurrentTrack = currentTrack?.id === track?.id;

  useEffect(() => {
    if (!slug) return;
    const load = async () => {
      setLoading(true);
      // Fetch by slug
      // Try slug first, fall back to id
      let { data: t } = await supabase
        .from('tracks')
        .select('*, artists(id, artist_name, slug, profile_image_url, is_verified, total_streams), albums(id, title, cover_artwork_url)')
        .eq('slug', slug)
        .maybeSingle();
      // If not found by slug, try by id (in case slug param is actually an id)
      if (!t) {
        const { data: t2 } = await supabase
          .from('tracks')
          .select('*, artists(id, artist_name, slug, profile_image_url, is_verified, total_streams), albums(id, title, cover_artwork_url)')
          .eq('id', slug)
          .maybeSingle();
        t = t2;
      }

      if (!t) { setLoading(false); return; }
      setTrack(t);
      setArtist(t.artists);
      setLikeCount(t.like_count || 0);

      // Credits
      const { data: collabs } = await supabase
        .from('track_collaborations')
        .select('role, artists(id, artist_name, slug, profile_image_url)')
        .eq('track_id', t.id);
      setCredits(collabs || []);

      // Comments
      const { data: rawComments } = await supabase
        .from('track_comments')
        .select('id, content, created_at, user_id')
        .eq('track_id', t.id)
        .order('created_at', { ascending: false })
        .limit(30);

      if (rawComments?.length) {
        const uids = [...new Set(rawComments.map(c => c.user_id).filter(Boolean))];
        const [{ data: artists }, { data: profiles }] = await Promise.all([
          supabase.from('artists').select('user_id, artist_name, profile_image_url').in('user_id', uids),
          supabase.from('user_profiles').select('user_id, name, avatar_url').in('user_id', uids),
        ]);
        const aMap = Object.fromEntries((artists || []).map(a => [a.user_id, a]));
        const pMap = Object.fromEntries((profiles || []).map(p => [p.user_id, p]));
        setComments(rawComments.map(c => ({ ...c, artist: aMap[c.user_id], profile: pMap[c.user_id] })));
      }

      // Liked?
      if (user) {
        const { data: lk } = await supabase.from('track_likes').select('id').eq('track_id', t.id).eq('user_id', user.id).maybeSingle();
        setLiked(!!lk);
        // Following artist?
        if (t.artists?.id) {
          const { data: fw } = await supabase.from('follows').select('id').eq('artist_id', t.artists.id).eq('follower_id', user.id).maybeSingle();
          setFollowing(!!fw);
        }
      }
      setLoading(false);
    };
    load();
  }, [slug, user?.id]);

  const handlePlay = () => {
    if (!track?.file_url) return;
    if (isCurrentTrack) { togglePlay(); return; }
    playTrack({ ...track, artist_name: artist?.artist_name, artist_slug: artist?.slug }, []);
  };

  const handleLike = async () => {
    if (!user || !track) return;
    if (liked) {
      await supabase.from('track_likes').delete().eq('track_id', track.id).eq('user_id', user.id);
      setLiked(false); setLikeCount(p => Math.max(0, p - 1));
    } else {
      await supabase.from('track_likes').insert({ track_id: track.id, user_id: user.id });
      setLiked(true); setLikeCount(p => p + 1);
    }
  };

  const handleFollow = async () => {
    if (!user || !artist) return;
    if (following) {
      await supabase.from('follows').delete().eq('artist_id', artist.id).eq('follower_id', user.id);
      setFollowing(false);
    } else {
      await supabase.from('follows').insert({ artist_id: artist.id, follower_id: user.id });
      setFollowing(true);
    }
  };

  const handleShare = () => {
    const url = `${window.location.origin}/track/${slug}`;
    setShareCard({
      artist: { ...artist, artist_name: artist?.artist_name, slug: artist?.slug, profile_image_url: artist?.profile_image_url },
      track,
      url,
    });
  };

  const postComment = async () => {
    if (!commentText.trim() || !user || posting) return;
    setPosting(true);
    const { data } = await supabase.from('track_comments')
      .insert({ track_id: track.id, user_id: user.id, content: commentText.trim() })
      .select('id, content, created_at, user_id').single();
    if (data) {
      const name = myArtist?.artist_name || 'Listener';
      setComments(prev => [{ ...data, artist: myArtist, profile: { name } }, ...prev]);
      // Notify artist
      if (artist && artist.user_id !== user.id) {
        supabase.from('notifications').insert({
          user_id: artist.user_id, artist_id: artist.id,
          type: 'track_commented',
          title: `${name} commented on "${track.title}"`,
          message: commentText.trim().slice(0, 100),
          track_id: track.id,
          metadata: { track_id: track.id, track_title: track.title },
        }).catch(() => {});
      }
    }
    setCommentText(''); setPosting(false);
  };

  if (loading) return (
    <div className="min-h-screen bg-black flex items-center justify-center">
      <Loader className="w-6 h-6 animate-spin text-white/20" />
    </div>
  );

  if (!track) return (
    <div className="min-h-screen bg-black flex items-center justify-center px-6 text-center">
      <div>
        <Music className="w-12 h-12 mx-auto text-white/10 mb-4" />
        <p className="text-white/40 text-sm">Track not found</p>
        <button onClick={() => navigate(-1)} className="mt-4 text-xs text-white/30 hover:text-white/50 transition">← Go back</button>
      </div>
    </div>
  );

  const coverSrc = track.cover_artwork_url || track.albums?.cover_artwork_url;
  const streamCount = track.stream_count || 0;

  return (
    <div className="min-h-screen bg-black text-white pb-32">
      {/* ── Hero ── */}
      <div className="relative">
        {/* Blurred bg */}
        <div className="absolute inset-0 overflow-hidden">
          {coverSrc && <img src={coverSrc} alt="" className="w-full h-full object-cover scale-110 blur-2xl opacity-20" />}
          <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-black/40 to-black" />
        </div>

        {/* Back button */}
        <div className="relative z-10 pt-14 px-4 pb-4">
          <button onClick={() => navigate(-1)}
            className="w-9 h-9 flex items-center justify-center rounded-full bg-black/40 backdrop-blur-sm border border-white/10">
            <ChevronLeft className="w-5 h-5 text-white" />
          </button>
        </div>

        {/* Artwork + info */}
        <div className="relative z-10 px-6 pb-8 flex flex-col items-center text-center">
          <div className="w-52 h-52 rounded-2xl overflow-hidden shadow-2xl border border-white/10 mb-6"
            style={{ boxShadow: '0 32px 64px rgba(0,0,0,0.6)' }}>
            {coverSrc
              ? <img src={coverSrc} alt={track.title} className="w-full h-full object-cover" />
              : <div className="w-full h-full bg-white/[0.06] flex items-center justify-center">
                  <Music className="w-16 h-16 text-white/20" />
                </div>}
          </div>

          <h1 className="text-2xl font-black text-white mb-1 leading-tight">{track.title}</h1>
          <button onClick={() => navigate(`/artist/${artist?.slug}`)}
            className="text-sm text-white/50 hover:text-white transition mb-1">
            {artist?.artist_name}
          </button>
          {track.albums?.title && (
            <p className="text-xs text-white/25">from <span className="text-white/40">{track.albums.title}</span></p>
          )}

          {/* Pills */}
          <div className="flex flex-wrap items-center justify-center gap-2 mt-3">
            {track.genre && (
              <span className="text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full"
                style={{ background: 'rgba(167,139,250,0.15)', color: '#a78bfa', border: '1px solid rgba(167,139,250,0.25)' }}>
                {track.genre}
              </span>
            )}
            {track.mood && (
              <span className="text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full"
                style={{ background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.4)' }}>
                {track.mood}
              </span>
            )}
            {track.is_explicit && (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-red-500/20 text-red-400">E</span>
            )}
          </div>

          {/* Stats row */}
          <div className="flex items-center space-x-5 mt-4">
            <div className="text-center">
              <p className="text-base font-black text-white">{fmt(streamCount)}</p>
              <p className="text-[10px] text-white/30">plays</p>
            </div>
            <div className="w-px h-6 bg-white/10" />
            <div className="text-center">
              <p className="text-base font-black text-white">{fmt(likeCount)}</p>
              <p className="text-[10px] text-white/30">likes</p>
            </div>
            <div className="w-px h-6 bg-white/10" />
            <div className="text-center">
              <p className="text-base font-black text-white">{fmt(comments.length)}</p>
              <p className="text-[10px] text-white/30">comments</p>
            </div>
          </div>
        </div>
      </div>

      {/* ── Action buttons ── */}
      <div className="px-6 mb-6">
        <div className="flex items-center space-x-3">
          {/* Play */}
          <button onClick={handlePlay}
            disabled={!track.file_url}
            className="flex-1 flex items-center justify-center space-x-2 py-3.5 rounded-2xl font-bold text-sm transition active:scale-[0.98] disabled:opacity-30"
            style={{ background: 'linear-gradient(135deg, #a78bfa, #7c3aed)' }}>
            {isCurrentTrack && isPlaying
              ? <><Pause className="w-5 h-5" /><span>Pause</span></>
              : <><Play className="w-5 h-5 fill-white" /><span>Play</span></>}
          </button>

          {/* Like */}
          <button onClick={handleLike}
            className="w-13 h-13 flex items-center justify-center rounded-2xl border transition active:scale-95"
            style={{ background: liked ? 'rgba(239,68,68,0.15)' : 'rgba(255,255,255,0.04)', borderColor: liked ? 'rgba(239,68,68,0.3)' : 'rgba(255,255,255,0.08)' }}>
            <Heart className="w-5 h-5" fill={liked ? '#ef4444' : 'none'} color={liked ? '#ef4444' : 'rgba(255,255,255,0.6)'} strokeWidth={liked ? 0 : 2} />
          </button>

          {/* Download */}
          {track.is_downloadable && (track.download_price === 0 || !track.download_price) && (
            <a href={track.file_url} download={`${track.title} - ${artist?.artist_name || ""}.mp3`} onClick={(e) => { e.preventDefault(); const a = document.createElement("a"); a.href = track.file_url; a.download = `${track.title} - ${artist?.artist_name || ""}.mp3`; document.body.appendChild(a); a.click(); document.body.removeChild(a); }}
              className="w-13 h-13 flex items-center justify-center rounded-2xl border border-white/[0.08] bg-white/[0.04] transition active:scale-95">
              <Download className="w-5 h-5 text-white/60" />
            </a>
          )}

          {/* Share */}
          <button onClick={handleShare}
            className="w-13 h-13 flex items-center justify-center rounded-2xl border border-white/[0.08] bg-white/[0.04] transition active:scale-95">
            <Share2 className="w-5 h-5 text-white/60" />
          </button>
        </div>
      </div>

      <div className="px-6 space-y-4">
        {/* ── Artist card ── */}
        <div className="rounded-2xl border border-white/[0.06] p-4 flex items-center space-x-3"
          style={{ background: 'rgba(255,255,255,0.02)' }}>
          <button onClick={() => navigate(`/artist/${artist?.slug}`)}
            className="w-12 h-12 rounded-full overflow-hidden border border-white/10 flex-shrink-0">
            {artist?.profile_image_url
              ? <img src={artist.profile_image_url} alt="" className="w-full h-full object-cover" />
              : <div className="w-full h-full bg-purple-500/20 flex items-center justify-center text-sm font-bold">{artist?.artist_name?.[0]}</div>}
          </button>
          <div className="flex-1 min-w-0">
            <button onClick={() => navigate(`/artist/${artist?.slug}`)}
              className="text-sm font-bold text-white hover:text-white/80 transition block truncate text-left">
              {artist?.artist_name}
            </button>
            <p className="text-xs text-white/30">{fmt(artist?.total_streams || 0)} streams</p>
          </div>
          {user && myArtist?.id !== artist?.id && (
            <button onClick={handleFollow}
              className="px-4 py-1.5 rounded-xl text-xs font-bold transition border"
              style={following
                ? { background: 'transparent', borderColor: 'rgba(255,255,255,0.2)', color: 'rgba(255,255,255,0.5)' }
                : { background: 'rgba(167,139,250,0.15)', borderColor: 'rgba(167,139,250,0.3)', color: '#a78bfa' }}>
              {following ? 'Following' : 'Follow'}
            </button>
          )}
        </div>

        {/* ── Credits ── */}
        {credits.length > 0 && (
          <div className="rounded-2xl border border-white/[0.06] overflow-hidden"
            style={{ background: 'rgba(255,255,255,0.02)' }}>
            <p className="text-xs text-white/40 font-semibold uppercase tracking-wider px-4 py-3 border-b border-white/[0.05]">
              Credits
            </p>
            <div className="divide-y divide-white/[0.04]">
              {credits.map((c, i) => (
                <div key={i} className="flex items-center space-x-3 px-4 py-3">
                  <button onClick={() => navigate(`/artist/${c.artists?.slug}`)}
                    className="w-8 h-8 rounded-full overflow-hidden border border-white/10 flex-shrink-0">
                    {c.artists?.profile_image_url
                      ? <img src={c.artists.profile_image_url} alt="" className="w-full h-full object-cover" />
                      : <div className="w-full h-full bg-white/10 flex items-center justify-center text-xs font-bold">{c.artists?.artist_name?.[0]}</div>}
                  </button>
                  <div className="flex-1">
                    <p className="text-sm text-white">{c.artists?.artist_name}</p>
                    <p className="text-[10px] text-white/30 capitalize">{c.role || 'Featured'}</p>
                  </div>
                  <ExternalLink className="w-3.5 h-3.5 text-white/20" />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Paid download ── */}
        {track.is_downloadable && track.download_price > 0 && (
          <div className="rounded-2xl border border-white/[0.06] p-4"
            style={{ background: 'rgba(255,255,255,0.02)' }}>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-bold text-white">Download</p>
                <p className="text-xs text-white/30 mt-0.5">High quality audio file</p>
              </div>
              <button className="flex items-center space-x-2 px-4 py-2 rounded-xl font-semibold text-sm transition active:scale-95"
                style={{ background: 'rgba(34,197,94,0.15)', border: '1px solid rgba(34,197,94,0.3)', color: '#22c55e' }}>
                <Download className="w-4 h-4" />
                <span>${track.download_price}</span>
              </button>
            </div>
          </div>
        )}

        {/* ── Comments ── */}
        <div className="rounded-2xl border border-white/[0.06] overflow-hidden"
          style={{ background: 'rgba(255,255,255,0.02)' }}>
          <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.05]">
            <p className="text-sm font-semibold text-white flex items-center space-x-2">
              <MessageCircle className="w-4 h-4 text-white/40" />
              <span>Comments</span>
            </p>
            <span className="text-xs text-white/30">{comments.length}</span>
          </div>

          {/* Comment input */}
          {user && (
            <div className="px-4 py-3 border-b border-white/[0.05] flex items-center space-x-3">
              <div className="w-8 h-8 rounded-full bg-white/10 overflow-hidden flex-shrink-0 flex items-center justify-center">
                {myArtist?.profile_image_url
                  ? <img src={myArtist.profile_image_url} alt="" className="w-full h-full object-cover" />
                  : <span className="text-xs font-bold text-white/40">{myArtist?.artist_name?.[0] || user.email?.[0]?.toUpperCase()}</span>}
              </div>
              <input
                value={commentText}
                onChange={e => setCommentText(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && postComment()}
                placeholder="Add a comment…"
                maxLength={300}
                className="flex-1 bg-white/[0.06] rounded-xl px-3 py-2 text-sm text-white placeholder-white/25 outline-none border border-white/[0.06] focus:border-white/20 transition"
              />
              <button onClick={postComment} disabled={!commentText.trim() || posting}
                className="w-8 h-8 flex items-center justify-center rounded-xl transition disabled:opacity-30"
                style={{ background: 'rgba(167,139,250,0.2)', border: '1px solid rgba(167,139,250,0.3)' }}>
                {posting ? <Loader className="w-3.5 h-3.5 animate-spin text-purple-400" />
                  : <svg className="w-3.5 h-3.5 text-purple-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>}
              </button>
            </div>
          )}

          {/* Comment list */}
          <div className="divide-y divide-white/[0.04] max-h-80 overflow-y-auto">
            {comments.length === 0
              ? <p className="text-center text-white/20 text-sm py-6">No comments yet</p>
              : comments.map(c => (
                <div key={c.id} className="flex items-start space-x-3 px-4 py-3">
                  <div className="w-8 h-8 rounded-full bg-white/10 overflow-hidden flex-shrink-0 flex items-center justify-center">
                    {(c.artist?.profile_image_url || c.profile?.avatar_url)
                      ? <img src={c.artist?.profile_image_url || c.profile?.avatar_url} alt="" className="w-full h-full object-cover" />
                      : <span className="text-xs font-bold text-white/30">{(c.artist?.artist_name || c.profile?.name || '?')[0]}</span>}
                  </div>
                  <div className="flex-1">
                    <p className="text-[11px] font-semibold text-white/50 mb-0.5">{c.artist?.artist_name || c.profile?.name || 'Listener'}</p>
                    <p className="text-sm text-white/80">{c.content}</p>
                  </div>
                </div>
              ))}
          </div>
        </div>
      </div>
      {shareCard && (
        <ShareCard
          artist={shareCard.artist}
          track={shareCard.track}
          shareUrl={shareCard.url}
          onClose={() => setShareCard(null)}
        />
      )}
    </div>
  );
}