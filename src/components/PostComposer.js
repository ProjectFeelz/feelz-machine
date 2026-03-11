import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../supabaseClient';
import { useAuth } from '../contexts/AuthContext';
import { Send, Loader, X, Music, Search, Plus, Calendar } from 'lucide-react';
import { usePlayer } from '../contexts/PlayerContext';

const YOUTUBE_REGEX = /(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/;
const EXTERNAL_LINK_REGEX = /https?:\/\/[^\s]+/g;

function extractYouTubeId(text) {
  const match = text.match(YOUTUBE_REGEX);
  return match ? match[1] : null;
}
function hasBlockedLinks(text) {
  const links = text.match(EXTERNAL_LINK_REGEX) || [];
  return links.some(link => !YOUTUBE_REGEX.test(link));
}

export default function PostComposer({ onPostCreated }) {
  const { user, artist } = useAuth();
  const { currentTrack } = usePlayer();

  const NAV_H = 64;
  const MINI_H = currentTrack ? 64 : 0;
  const baseBottom = NAV_H + MINI_H + 8;
  const [open, setOpen] = useState(false);
  const [content, setContent] = useState('');
  const [posting, setPosting] = useState(false);
  const [tagResults, setTagResults] = useState([]);
  const [taggedArtists, setTaggedArtists] = useState([]);
  const [showTagDropdown, setShowTagDropdown] = useState(false);
  const [cursorPos, setCursorPos] = useState(0);
  const [error, setError] = useState('');
  const [scheduledAt, setScheduledAt] = useState('');
  const [showSchedule, setShowSchedule] = useState(false);

  const [showTrackPicker, setShowTrackPicker] = useState(false);
  const [trackSearch, setTrackSearch] = useState('');
  const [trackResults, setTrackResults] = useState([]);
  const [taggedTrack, setTaggedTrack] = useState(null);
  const [searchingTracks, setSearchingTracks] = useState(false);

  const editorRef = useRef(null);
  const tagTimeoutRef = useRef(null);
  const trackTimeoutRef = useRef(null);
  const [keyboardOffset, setKeyboardOffset] = useState(0);

  const youtubeId = extractYouTubeId(content);
  const blocked = hasBlockedLinks(content);

  useEffect(() => {
    if (open) setTimeout(() => editorRef.current?.focus(), 100);
  }, [open]);

  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [open]);

  useEffect(() => {
    if (!open) { setKeyboardOffset(0); return; }
    const vv = window.visualViewport;
    if (!vv) return;
    const onResize = () => {
      const offset = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
      setKeyboardOffset(offset);
    };
    vv.addEventListener('resize', onResize);
    vv.addEventListener('scroll', onResize);
    return () => {
      vv.removeEventListener('resize', onResize);
      vv.removeEventListener('scroll', onResize);
    };
  }, [open]);

  useEffect(() => {
    if (!content) { setShowTagDropdown(false); return; }
    const textBeforeCursor = content.substring(0, cursorPos);
    const atMatch = textBeforeCursor.match(/@(\w*)$/);
    if (atMatch) {
      if (tagTimeoutRef.current) clearTimeout(tagTimeoutRef.current);
      tagTimeoutRef.current = setTimeout(() => searchArtists(atMatch[1]), 200);
    } else {
      setShowTagDropdown(false);
    }
  }, [content, cursorPos]);

  useEffect(() => {
    if (!showTrackPicker) return;
    if (trackTimeoutRef.current) clearTimeout(trackTimeoutRef.current);
    trackTimeoutRef.current = setTimeout(() => searchTracks(trackSearch), 250);
  }, [trackSearch, showTrackPicker]);

  const searchArtists = async (query) => {
    try {
      let q = supabase.from('artists').select('id, artist_name, slug, profile_image_url, is_verified').limit(6);
      if (query) q = q.ilike('artist_name', `%${query}%`);
      const { data } = await q;
      setTagResults(data || []);
      setShowTagDropdown(true);
    } catch (err) { console.error('Tag search error:', err); }
  };

  const searchTracks = async (query) => {
    if (!artist) return;
    setSearchingTracks(true);
    try {
      let q = supabase.from('tracks')
        .select('id, title, cover_artwork_url, artist_id, stream_count')
        .eq('is_published', true)
        .limit(8);
      if (query) q = q.ilike('title', `%${query}%`);
      else q = q.eq('artist_id', artist.id);
      const { data } = await q;
      setTrackResults(data || []);
    } catch (err) { console.error('Track search error:', err); }
    setSearchingTracks(false);
  };

  const insertTag = (tagArtist) => {
    const textBeforeCursor = content.substring(0, cursorPos);
    const textAfterCursor = content.substring(cursorPos);
    const atIndex = textBeforeCursor.lastIndexOf('@');
    const newContent = textBeforeCursor.substring(0, atIndex) + `@${tagArtist.artist_name} ` + textAfterCursor;
    setContent(newContent);
    setShowTagDropdown(false);
    if (!taggedArtists.find(a => a.id === tagArtist.id)) {
      setTaggedArtists([...taggedArtists, tagArtist]);
    }
    setTimeout(() => editorRef.current?.focus(), 50);
  };

  const selectTrack = (track) => {
    setTaggedTrack(track);
    setShowTrackPicker(false);
    setTrackSearch('');
  };

  const removeTag = (artistId) => setTaggedArtists(taggedArtists.filter(a => a.id !== artistId));

  const handleClose = () => {
    setOpen(false);
    setShowTrackPicker(false);
    setShowSchedule(false);
    setShowTagDropdown(false);
  };

  const handleSubmit = async () => {
    if (!content.trim() || !user || !artist) return;
    if (blocked) { setError('External links are not allowed. YouTube links only.'); return; }
    setPosting(true);
    setError('');

    try {
      // FIX 1: Rate limit check against artist_posts not posts
      const { data: adminCheck } = await supabase.from('admins').select('id').eq('user_id', user.id).maybeSingle();
      if (!adminCheck) {
        const startOfDay = new Date();
        startOfDay.setHours(0, 0, 0, 0);
        const { count } = await supabase
          .from('artist_posts')
          .select('*', { count: 'exact', head: true })
          .eq('artist_id', artist.id)
          .gte('created_at', startOfDay.toISOString());
        if (count >= 10) {
          setError('You can only post 10 times per day. Come back tomorrow!');
          setPosting(false);
          return;
        }
      }

      // FIX 2 & 3: Insert into artist_posts with only columns that exist in our schema
      const postPayload = {
        artist_id: artist.id,
        content: content.trim(),
        // Optional extended columns — only included if they exist in your schema
        // Remove any of these lines if you get a "column does not exist" error:
        tagged_artist_ids: taggedArtists.map(a => a.id),
        youtube_id: youtubeId || null,
        track_id: taggedTrack?.id || null,
        scheduled_at: scheduledAt || null,
        image_url: null,
      };

      const { data, error: postError } = await supabase
        .from('artist_posts')
        .insert(postPayload)
        .select()
        .single();

      if (postError) throw postError;

      // Notify followers
      const { data: followers } = await supabase
        .from('follows')
        .select('follower_id')
        .eq('artist_id', artist.id);

      if (followers?.length > 0) {
        const notifs = followers.map(f => ({
          user_id: f.follower_id,
          artist_id: null,
          type: 'new_post',
          title: `${artist.artist_name} posted something new`,
          message: content.substring(0, 100),
          // FIX: store post_id in metadata so notifications can deep-link
          metadata: { post_id: data.id, artist_id: artist.id, artist_name: artist.artist_name },
        }));
        try { await supabase.from('notifications').insert(notifs); } catch (e) {
          console.warn('Notifications insert failed (table may not exist yet):', e.message);
        }
      }

      // Mention notifications
      for (const ta of taggedArtists) {
        try {
          await supabase.from('notifications').insert({
            artist_id: ta.id,
            type: 'mention',
            title: `${artist.artist_name} mentioned you in a post`,
            message: content.substring(0, 100),
            metadata: { post_id: data.id, tagger_artist_id: artist.id },
          });
        } catch (e) {
          console.warn('Mention notification failed:', e.message);
        }
      }

      setContent('');
      setTaggedArtists([]);
      setTaggedTrack(null);
      setScheduledAt('');
      setShowSchedule(false);
      handleClose();
      if (onPostCreated) onPostCreated(data);
    } catch (err) {
      console.error('Post error:', err);
      setError(`Failed to post: ${err?.message || JSON.stringify(err)}`);
    }
    setPosting(false);
  };

  if (!user || !artist) return null;

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="fixed right-5 z-40 w-14 h-14 rounded-full bg-white flex items-center justify-center active:scale-90 hover:scale-105"
        style={{
          bottom: baseBottom,
          boxShadow: '0 4px 24px rgba(255,255,255,0.18), 0 2px 8px rgba(0,0,0,0.4)',
          transition: 'bottom 0.2s ease',
        }}
      >
        <Plus className="w-6 h-6 text-black" strokeWidth={2.5} />
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm"
          style={{ animation: 'pcFadeIn 0.2s ease' }}
          onClick={handleClose}
        />
      )}

      {open && (
        <div
          className="fixed left-0 right-0 z-50 rounded-t-2xl flex flex-col"
          style={{
            bottom: keyboardOffset > 0 ? keyboardOffset : baseBottom - 8,
            backgroundColor: '#0f0f0f',
            border: '1px solid rgba(255,255,255,0.08)',
            borderBottom: 'none',
            animation: 'pcSlideUp 0.28s cubic-bezier(0.32, 0.72, 0, 1)',
            maxHeight: `calc(100vh - ${baseBottom + 16}px)`,
            transition: 'bottom 0.15s ease',
          }}
          onClick={e => e.stopPropagation()}
        >
          <div className="flex justify-center pt-3 pb-1 flex-shrink-0">
            <div className="w-10 h-1 rounded-full bg-white/10" />
          </div>

          <div className="flex items-center justify-between px-4 py-3 flex-shrink-0">
            <div className="flex items-center space-x-2.5">
              <div className="w-8 h-8 rounded-full overflow-hidden bg-gradient-to-br from-purple-600 to-blue-600 flex items-center justify-center flex-shrink-0">
                {artist.profile_image_url
                  ? <img src={artist.profile_image_url} alt="" className="w-full h-full object-cover" />
                  : <span className="text-xs font-bold text-white">{artist.artist_name?.[0]}</span>}
              </div>
              <span className="text-sm font-semibold text-white">{artist.artist_name}</span>
            </div>
            <button onClick={handleClose} className="w-8 h-8 flex items-center justify-center rounded-full bg-white/[0.06] hover:bg-white/[0.1] transition">
              <X className="w-4 h-4 text-white/60" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto px-4 pb-2 min-h-0">
            <div className="relative">
              <textarea
                ref={editorRef}
                value={content}
                onChange={(e) => { setContent(e.target.value); setCursorPos(e.target.selectionStart); }}
                onKeyUp={(e) => setCursorPos(e.target.selectionStart)}
                onClick={(e) => setCursorPos(e.target.selectionStart)}
                placeholder="Share something with your community... (use @ to tag artists)"
                rows={4}
                className="w-full bg-transparent text-white text-sm placeholder-white/20 outline-none resize-none leading-relaxed"
              />
              {showTagDropdown && tagResults.length > 0 && (
                <div className="absolute left-0 z-50 w-64 rounded-xl overflow-hidden shadow-2xl"
                  style={{ backgroundColor: '#1a1a1a', border: '1px solid rgba(255,255,255,0.08)', top: '100%' }}>
                  {tagResults.map(a => (
                    <button key={a.id} onClick={() => insertTag(a)}
                      className="w-full flex items-center space-x-2 px-3 py-2.5 hover:bg-white/[0.06] transition text-left">
                      <div className="w-7 h-7 rounded-full overflow-hidden bg-white/10 flex-shrink-0">
                        {a.profile_image_url
                          ? <img src={a.profile_image_url} alt="" className="w-full h-full object-cover" />
                          : <span className="w-full h-full flex items-center justify-center text-xs text-white/50">{a.artist_name?.[0]}</span>}
                      </div>
                      <span className="text-sm text-white truncate">{a.artist_name}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {youtubeId && (
              <div className="mt-2 rounded-lg overflow-hidden">
                <img src={`https://img.youtube.com/vi/${youtubeId}/mqdefault.jpg`} alt="YouTube thumbnail" className="w-full rounded-lg opacity-70" />
              </div>
            )}

            {taggedTrack && (
              <div className="mt-3 flex items-center space-x-3 p-2.5 rounded-xl bg-white/[0.04] border border-white/[0.06]">
                <div className="w-9 h-9 rounded-lg overflow-hidden flex-shrink-0 bg-white/10">
                  {taggedTrack.cover_artwork_url
                    ? <img src={taggedTrack.cover_artwork_url} alt="" className="w-full h-full object-cover" />
                    : <div className="w-full h-full flex items-center justify-center"><Music className="w-4 h-4 text-white/20" /></div>}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-white truncate">{taggedTrack.title}</p>
                  <p className="text-[10px] text-white/40">Tagged track</p>
                </div>
                <button onClick={() => setTaggedTrack(null)} className="text-white/30 hover:text-white/60 transition">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            {taggedArtists.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {taggedArtists.map(a => (
                  <span key={a.id} className="flex items-center space-x-1 text-xs bg-purple-500/10 text-purple-400 px-2 py-1 rounded-full">
                    <span>@{a.artist_name}</span>
                    <button onClick={() => removeTag(a.id)}><X className="w-3 h-3" /></button>
                  </span>
                ))}
              </div>
            )}

            {showSchedule && (
              <div className="mt-3 flex items-center space-x-2 p-3 rounded-xl bg-white/[0.04] border border-white/[0.06]">
                <Calendar className="w-4 h-4 text-white/30 flex-shrink-0" />
                <input
                  type="datetime-local"
                  value={scheduledAt}
                  onChange={(e) => setScheduledAt(e.target.value)}
                  min={new Date().toISOString().slice(0, 16)}
                  className="flex-1 bg-transparent text-sm text-white/60 outline-none"
                />
                {scheduledAt && (
                  <button onClick={() => setScheduledAt('')} className="text-white/20 hover:text-white/40 transition">
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            )}

            {showTrackPicker && (
              <div className="mt-3 rounded-xl overflow-hidden border border-white/[0.08]" style={{ backgroundColor: '#111' }}>
                <div className="flex items-center space-x-2 px-3 py-2.5 border-b border-white/[0.06]">
                  <Search className="w-3.5 h-3.5 text-white/30" />
                  <input
                    type="text"
                    value={trackSearch}
                    onChange={(e) => setTrackSearch(e.target.value)}
                    placeholder="Search your tracks..."
                    autoFocus
                    className="flex-1 bg-transparent text-sm text-white placeholder-white/20 outline-none"
                  />
                  <button onClick={() => setShowTrackPicker(false)} className="text-white/30 hover:text-white/60">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
                <div className="max-h-44 overflow-y-auto">
                  {searchingTracks
                    ? <div className="flex justify-center py-4"><Loader className="w-4 h-4 animate-spin text-white/30" /></div>
                    : trackResults.length === 0
                    ? <p className="text-center text-white/20 text-xs py-4">No tracks found</p>
                    : trackResults.map(t => (
                        <button key={t.id} onClick={() => selectTrack(t)}
                          className="w-full flex items-center space-x-3 px-3 py-2.5 hover:bg-white/[0.04] transition text-left">
                          <div className="w-8 h-8 rounded-md overflow-hidden flex-shrink-0 bg-white/10">
                            {t.cover_artwork_url
                              ? <img src={t.cover_artwork_url} alt="" className="w-full h-full object-cover" />
                              : <div className="w-full h-full flex items-center justify-center"><Music className="w-3 h-3 text-white/20" /></div>}
                          </div>
                          <p className="text-sm text-white truncate">{t.title}</p>
                        </button>
                      ))
                  }
                </div>
              </div>
            )}

            {error && <p className="text-xs text-red-400 mt-3">{error}</p>}
            {blocked && <p className="text-xs text-yellow-400/70 mt-2">External links aren't allowed. YouTube links only.</p>}
          </div>

          <div className="flex-shrink-0 px-4 pt-3 pb-6 border-t border-white/[0.06]"
            style={{ paddingBottom: 'max(1.5rem, env(safe-area-inset-bottom))' }}>
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1">
                <button
                  onClick={() => { setShowTrackPicker(p => !p); if (!showTrackPicker) searchTracks(''); }}
                  className={`flex items-center space-x-1.5 px-3 py-2 rounded-lg text-xs font-medium transition ${
                    taggedTrack ? 'bg-purple-500/20 text-purple-400' : 'text-white/40 hover:text-white/70 hover:bg-white/[0.06]'
                  }`}
                >
                  <Music className="w-3.5 h-3.5" />
                  <span>Tag Track</span>
                </button>
                <button
                  onClick={() => setShowSchedule(p => !p)}
                  className={`flex items-center space-x-1.5 px-3 py-2 rounded-lg text-xs font-medium transition ${
                    scheduledAt ? 'bg-blue-500/20 text-blue-400' : 'text-white/40 hover:text-white/70 hover:bg-white/[0.06]'
                  }`}
                >
                  <Calendar className="w-3.5 h-3.5" />
                  <span>{scheduledAt ? 'Scheduled' : 'Schedule'}</span>
                </button>
              </div>
              <button
                onClick={handleSubmit}
                disabled={posting || !content.trim() || blocked}
                className="flex items-center space-x-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition disabled:opacity-30 active:scale-95 flex-shrink-0"
                style={{ backgroundColor: 'white', color: 'black' }}
              >
                {posting ? <Loader className="w-4 h-4 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                <span>{posting ? 'Posting...' : scheduledAt ? 'Schedule' : 'Post'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes pcFadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes pcSlideUp { from { transform: translateY(100%); } to { transform: translateY(0); } }
      `}</style>
    </>
  );
}