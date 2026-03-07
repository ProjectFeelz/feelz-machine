import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../supabaseClient';
import { useAuth } from '../contexts/AuthContext';
import { Send, Loader, X, Music, Search } from 'lucide-react';
import TierGate from './TierGate';

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
  const [content, setContent] = useState('');
  const [posting, setPosting] = useState(false);
  const [tagSearch, setTagSearch] = useState('');
  const [tagResults, setTagResults] = useState([]);
  const [taggedArtists, setTaggedArtists] = useState([]);
  const [showTagDropdown, setShowTagDropdown] = useState(false);
  const [cursorPos, setCursorPos] = useState(0);
  const [error, setError] = useState('');

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

  // Artist @mention detection
  useEffect(() => {
    if (!content) { setShowTagDropdown(false); return; }
    const textBeforeCursor = content.substring(0, cursorPos);
    const atMatch = textBeforeCursor.match(/@(\w*)$/);
    if (atMatch) {
      const query = atMatch[1];
      setTagSearch(query);
      if (tagTimeoutRef.current) clearTimeout(tagTimeoutRef.current);
      tagTimeoutRef.current = setTimeout(() => searchArtists(query), 200);
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
      else q = q.eq('artist_id', artist.id); // default: own tracks
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
    setTimeout(() => { if (editorRef.current) editorRef.current.focus(); }, 50);
  };

  const selectTrack = (track) => {
    setTaggedTrack(track);
    setShowTrackPicker(false);
    setTrackSearch('');
  };

  const removeTag = (artistId) => setTaggedArtists(taggedArtists.filter(a => a.id !== artistId));

  const handleSubmit = async () => {
    if (!content.trim() || !user || !artist) return;
    if (blocked) { setError('External links are not allowed. You can share YouTube links only.'); return; }
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
      const taggedIds = taggedArtists.map(a => a.id);
      const { data, error: postError } = await supabase.from('posts').insert({
        artist_id: artist.id,
        user_id: user.id,
        content: content.trim(),
        tagged_artist_ids: taggedIds,
        post_type: taggedTrack ? 'track_share' : 'standard',
        youtube_id: youtubeId || null,
        track_id: taggedTrack?.id || null,
        is_auto_generated: false,
      }).select().single();
      if (postError) throw postError;

      // Notify followers
      const { data: followers } = await supabase.from('follows').select('follower_id').eq('artist_id', artist.id);
      if (followers && followers.length > 0) {
        const notifs = followers.map(f => ({
          artist_id: null, user_id: f.follower_id, type: 'new_post',
          title: `${artist.artist_name} posted something new`,
          message: content.substring(0, 100),
          metadata: { post_id: data.id, artist_id: artist.id, artist_name: artist.artist_name },
        }));
        await supabase.from('notifications').insert(notifs).catch(() => {});
      }
      for (const ta of taggedArtists) {
        await supabase.from('notifications').insert({
          artist_id: ta.id, type: 'mention',
          title: `${artist.artist_name} mentioned you in a post`,
          message: content.substring(0, 100),
          metadata: { post_id: data.id, tagger_artist_id: artist.id },
        }).catch(() => {});
      }

      setContent('');
      setTaggedArtists([]);
      setTaggedTrack(null);
      if (onPostCreated) onPostCreated(data);
    } catch (err) {
      console.error('Post error:', err);
      setError(`Failed to post: ${err?.message || JSON.stringify(err)}`);
    }
    setPosting(false);
  };

  if (!user || !artist) return null;

  return (
    <TierGate feature="community_post">
      <div className="bg-white/[0.03] rounded-xl border border-white/[0.06] p-4 mb-4">
        {/* Author header */}
        <div className="flex items-center space-x-3 mb-3">
          <div className="w-9 h-9 rounded-full bg-gradient-to-br from-purple-600 to-blue-600 flex items-center justify-center overflow-hidden flex-shrink-0">
            {artist.profile_image_url
              ? <img src={artist.profile_image_url} alt="" className="w-full h-full object-cover" />
              : <span className="text-sm font-bold text-white">{artist.artist_name?.[0]}</span>
            }
          </div>
          <p className="text-sm font-medium text-white">{artist.artist_name}</p>
        </div>

        {/* Textarea */}
        <div className="relative">
          <textarea
            ref={editorRef}
            value={content}
            onChange={(e) => { setContent(e.target.value); setCursorPos(e.target.selectionStart); }}
            onKeyUp={(e) => setCursorPos(e.target.selectionStart)}
            onClick={(e) => setCursorPos(e.target.selectionStart)}
            placeholder="Share something with your community... (use @ to tag artists)"
            rows={3}
            className="w-full bg-transparent text-white text-sm placeholder-white/20 outline-none resize-none leading-relaxed"
          />

          {/* Artist tag dropdown */}
          {showTagDropdown && tagResults.length > 0 && (
            <div className="absolute left-0 z-50 w-64 rounded-xl overflow-hidden shadow-2xl"
              style={{ backgroundColor: '#1a1a1a', border: '1px solid rgba(255,255,255,0.08)', top: '100%' }}>
              {tagResults.map(a => (
                <button key={a.id} onClick={() => insertTag(a)}
                  className="w-full flex items-center space-x-2 px-3 py-2.5 hover:bg-white/[0.06] transition text-left">
                  <div className="w-7 h-7 rounded-full overflow-hidden bg-white/10 flex-shrink-0">
                    {a.profile_image_url
                      ? <img src={a.profile_image_url} alt="" className="w-full h-full object-cover" />
                      : <span className="w-full h-full flex items-center justify-center text-xs text-white/50">{a.artist_name?.[0]}</span>
                    }
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

        {/* Tagged track preview */}
        {taggedTrack && (
          <div className="mt-3 flex items-center space-x-3 p-2.5 rounded-xl bg-white/[0.04] border border-white/[0.06]">
            <div className="w-9 h-9 rounded-lg overflow-hidden flex-shrink-0 bg-white/10">
              {taggedTrack.cover_artwork_url
                ? <img src={taggedTrack.cover_artwork_url} alt="" className="w-full h-full object-cover" />
                : <div className="w-full h-full flex items-center justify-center"><Music className="w-4 h-4 text-white/20" /></div>
              }
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-white truncate">{taggedTrack.title}</p>
              <p className="text-[10px] text-white/40">Tagged track</p>
            </div>
            <button onClick={() => setTaggedTrack(null)} className="text-white/30 hover:text-white/60 transition flex-shrink-0">
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

        {/* Track picker modal */}
        {showTrackPicker && (
          <div className="mt-3 rounded-xl overflow-hidden border border-white/[0.08]" style={{ backgroundColor: '#111' }}>
            <div className="flex items-center space-x-2 px-3 py-2.5 border-b border-white/[0.06]">
              <Search className="w-3.5 h-3.5 text-white/30" />
              <input
                type="text"
                value={trackSearch}
                onChange={(e) => setTrackSearch(e.target.value)}
                placeholder="Search tracks..."
                autoFocus
                className="flex-1 bg-transparent text-sm text-white placeholder-white/20 outline-none"
              />
              <button onClick={() => setShowTrackPicker(false)} className="text-white/30 hover:text-white/60">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
            <div className="max-h-48 overflow-y-auto">
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
                          : <div className="w-full h-full flex items-center justify-center"><Music className="w-3 h-3 text-white/20" /></div>
                        }
                      </div>
                      <p className="text-sm text-white truncate">{t.title}</p>
                    </button>
                  ))
              }
            </div>
          </div>
        )}

        {error && <p className="text-xs text-red-400 mt-2">{error}</p>}
        {blocked && <p className="text-xs text-yellow-400/70 mt-2">External links aren't allowed. YouTube links only.</p>}

        {/* Toolbar */}
        <div className="flex items-center justify-between mt-3 pt-3 border-t border-white/[0.05]">
          <div className="flex items-center space-x-1">
            <button
              onClick={() => { setShowTrackPicker(p => !p); if (!showTrackPicker) searchTracks(''); }}
              className={`flex items-center space-x-1.5 px-2.5 py-1.5 rounded-lg text-xs transition ${taggedTrack ? 'bg-purple-500/20 text-purple-400' : 'text-white/30 hover:text-white/60 hover:bg-white/[0.04]'}`}
              title="Tag a track">
              <Music className="w-3.5 h-3.5" />
              <span>Tag Track</span>
            </button>
          </div>
          <button
            onClick={handleSubmit}
            disabled={posting || !content.trim() || blocked}
            className="flex items-center space-x-1.5 px-4 py-2 rounded-lg text-sm font-medium transition disabled:opacity-40"
            style={{ backgroundColor: 'white', color: 'black' }}>
            {posting ? <Loader className="w-4 h-4 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
            <span>{posting ? 'Posting...' : 'Post'}</span>
          </button>
        </div>
      </div>
    </TierGate>
  );
}