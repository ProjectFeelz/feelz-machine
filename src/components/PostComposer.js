import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../supabaseClient';
import { useAuth } from '../contexts/AuthContext';
import { Send, Loader, X, Music, Search, Plus, Calendar } from 'lucide-react';

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

  // Track tagging
  const [showTrackPicker, setShowTrackPicker] = useState(false);
  const [trackSearch, setTrackSearch] = useState('');
  const [trackResults, setTrackResults] = useState([]);
  const [taggedTrack, setTaggedTrack] = useState(null);
  const [searchingTracks, setSearchingTracks] = useState(false);

  const editorRef = useRef(null);
  const tagTimeoutRef = useRef(null);
  const trackTimeoutRef = useRef(null);

  const youtubeId = extractYouTubeId(content);
  const blocked = hasBlockedLinks(content);

  // Focus textarea when opened
  useEffect(() => {
    if (open) setTimeout(() => editorRef.current?.focus(), 100);
  }, [open]);

  // Lock body scroll when open
  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [open]);

  // Artist @mention detection
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

  // Track search
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
      const { data: adminCheck } = await supabase.from('admins').select('id').eq('user_id', user.id).maybeSingle();
      if (!adminCheck) {
        const startOfDay = new Date();
        startOfDay.setHours(0, 0, 0, 0);
        const { count } = await supabase.from('posts')
          .select('*', { count: 'exact', head: true })
          .eq('artist_id', artist.id)
          .gte('created_at', startOfDay.toISOString());
        if (count >= 1) {
          setError('You can only post once per day. Come back tomorrow!');
          setPosting(false);
          return;
        }
      }

      const postPayload = {
        artist_id: artist.id,
        user_id: user.id,
        content: content.trim(),
        tagged_artist_ids: taggedArtists.map(a => a.id),
        youtube_id: youtubeId || null,
        track_id: taggedTrack?.id || null,
        scheduled_at: scheduledAt || null,
        media_urls: [],
        is_auto_generated: false,
      };

      // Try allowed post_type values in order until one works
      let data, postError;
      for (const pt of ['blog', 'standard', 'track_share', 'news']) {
        const result = await supabase.from('posts').insert({ ...postPayload, post_type: pt }).select().single();
        data = result.data;
        postError = result.error;
        if (!postError) break;
        if (!postError.message?.includes('post_type_check')) break;
      }
      if (postError) throw postError;

      // Notify followers
      const { data: followers } = await supabase.from('follows').select('follower_id').eq('artist_id', artist.id);
      if (followers?.length > 0) {
        const notifs = followers.map(f => ({
          artist_id: null, user_id: f.follower_id, type: 'new_post',
          title: `${artist.artist_name} posted something new`,
          message: content.substring(0, 100),
          metadata: { post_id: data.id, artist_id: artist.id, artist_name: artist.artist_name },
        }));
        try { await supabase.from('notifications').insert(notifs); } catch {}
      }
      for (const ta of taggedArtists) {
        await supabase.from('notifications').insert({
          artist_id: ta.id, type: 'mention',
          title: `${artist.artist_name} mentioned you in a post`,
          message: content.substring(0, 100),
          metadata: { post_id: data.id, tagger_artist_id: artist.id },
        });
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
      {/* Floating + button */}
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-24 right-5 z-40 w-14 h-14 rounded-full bg-white flex items-center justify-center transition-all duration-200 active:scale-90 hover:scale-105"
        style={{ boxShadow: '0 4px 24px rgba(255,255,255,0.18), 0 2px 8px rgba(0,0,0,0.4)' }}
      >
        <Plus className="w-6 h-6 text-black" strokeWidth={2.5} />
      </button>

      {/* Backdrop */}
      {open && (
        <div
          className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm"
          style={{ animation: 'pcFadeIn 0.2s ease' }}
          onClick={handleClose}
        />
      )}

      {/* Bottom sheet */}
      {open && (
        <div
          className="fixed bottom-0 left-0 right-0 z-50 rounded-t-2xl flex flex-col"
          style={{
            backgroundColor: '#0f0f0f',
            border: '1px solid rgba(255,255,255,0.08)',
            borderBottom: 'none',
            animation: 'pcSlideUp 0.28s cubic-bezier(0.32, 0.72, 0, 1)',
            maxHeight: '90vh',
          }}
          onClick={e => e.stopPropagation()}
        >
          {/* Handle bar */}
          <div className="flex justify-center pt-3 pb-1 flex-shrink-0">
            <div className="w-10 h-1 rounded-full bg-white/10" />
          </div>

          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 flex-shrink-0">
            <div className="flex items-center space-x-2.5">
              <div className="w-8 h-8 rounded-full overflow-hidden bg-gradient-to-br from-purple-600 to-blue-600 flex items-center justify-center flex-shrink-0">
                {artist.profile_image_url
                  ? <img src={artist.profile_image_url} alt="" className="w-full h-full object-cover" />
                  : <span className="text-xs font-bold text-white">{artist.artist_name?.[0]}</span>}
              </div>
              <span className="text-sm font-semibold text-white">{artist.artist_name}</span>
            </div>
            <button
              onClick={handleClose}
              className="w-8 h-8 flex items-center justify-center rounded-full bg-white/[0.06] hover:bg-white/[0.1] transition"
            >
              <X className="w-4 h-4 text-white/60" />
            </button>
          </div>

          {/* Scrollable body */}
          <div className="flex-1 overflow-y-auto px-4 pb-2 min-h-0">
            {/* Textarea */}
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
              {/* Artist tag dropdown */}
              {showTagDropdown && tagResults.length > 0 && (
                <div
                  className="absolute left-0 z-50 w-64 rounded-xl overflow-hidden shadow-2xl"
                  style={{ backgroundColor: '#1a1a1a', border: '1px solid rgba(255,255,255,0.08)', top: '100%' }}
                >
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

            {/* YouTube preview */}
            {youtubeId && (
              <div className="mt-2 rounded-lg overflow-hidden">
                <img src={`https://img.youtube.com/vi/${youtubeId}/mqdefault.jpg`} alt="YouTube thumbnail" className="w-full rounded-lg opacity-70" />
              </div>
            )}

            {/* Tagged track */}
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

            {/* Tagged artists */}
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

            {/* Schedule picker */}
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

            {/* Track picker */}
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

          {/* Fixed bottom toolbar */}
          <div
            className="flex-shrink-0 px-4 pt-3 pb-6 border-t border-white/[0.06]"
            style={{ paddingBottom: 'max(1.5rem, env(safe-area-inset-bottom))' }}
          >
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
        @keyframes pcFadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes pcSlideUp {
          from { transform: translateY(100%); }
          to { transform: translateY(0); }
        }
      `}</style>
    </>
  );
}