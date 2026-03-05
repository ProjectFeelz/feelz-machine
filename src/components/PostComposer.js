import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../supabaseClient';
import { useAuth } from '../contexts/AuthContext';
import { Send, Loader, AtSign, X, Bold, Italic, Youtube, AlertCircle } from 'lucide-react';
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
  const editorRef = useRef(null);
  const tagTimeoutRef = useRef(null);

  const youtubeId = extractYouTubeId(content);
  const blocked = hasBlockedLinks(content);

  useEffect(() => {
    if (!content) { setShowTagDropdown(false); return; }
    const textBeforeCursor = content.substring(0, cursorPos);
    const atMatch = textBeforeCursor.match(/@(\w*)$/);
    if (atMatch) {
      const query = atMatch[1];
      setTagSearch(query);
      if (query.length >= 1) {
        if (tagTimeoutRef.current) clearTimeout(tagTimeoutRef.current);
        tagTimeoutRef.current = setTimeout(() => searchArtists(query), 200);
      } else {
        setShowTagDropdown(true);
        searchArtists('');
      }
    } else {
      setShowTagDropdown(false);
    }
  }, [content, cursorPos]);

  const searchArtists = async (query) => {
    try {
      let q = supabase.from('artists').select('id, artist_name, slug, profile_image_url, is_verified').limit(6);
      if (query) q = q.ilike('artist_name', `%${query}%`);
      const { data } = await q;
      setTagResults(data || []);
      setShowTagDropdown(true);
    } catch (err) {
      console.error('Tag search error:', err);
    }
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

  const removeTag = (artistId) => {
    setTaggedArtists(taggedArtists.filter(a => a.id !== artistId));
  };

  const formatText = (type) => {
    const textarea = editorRef.current;
    if (!textarea) return;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selected = content.substring(start, end);
    if (!selected) return;
    let wrapped;
    if (type === 'bold') wrapped = `**${selected}**`;
    else if (type === 'italic') wrapped = `*${selected}*`;
    else return;
    const newContent = content.substring(0, start) + wrapped + content.substring(end);
    setContent(newContent);
  };

  const handleSubmit = async () => {
    if (!content.trim() || !user || !artist) return;
    if (blocked) {
      setError('External links are not allowed. You can share YouTube links only.');
      return;
    }
    setPosting(true);
    setError('');
    try {
      // Check daily post limit (1/day for non-admins)
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
        post_type: 'standard',
        youtube_id: youtubeId || null,
        is_auto_generated: false,
      }).select().single();

      if (postError) throw postError;
      
      // Notify all followers of new post
      const { data: followers } = await supabase
        .from('follows')
        .select('follower_id')
        .eq('artist_id', artist.id);
      if (followers && followers.length > 0) {
        const notifs = followers.map(f => ({
          artist_id: null,
          user_id: f.follower_id,
          type: 'new_post',
          title: `${artist.artist_name} posted something new`,
          message: content.substring(0, 100),
          metadata: { post_id: data.id, artist_id: artist.id, artist_name: artist.artist_name },
        }));
        await supabase.from('notifications').insert(notifs).catch(() => {});
      }

      for (const ta of taggedArtists) {
        await supabase.from('notifications').insert({
          artist_id: ta.id,
          type: 'mention',
          title: `${artist.artist_name} mentioned you in a post`,
          message: content.substring(0, 100),
          metadata: { post_id: data.id, tagger_artist_id: artist.id },
        }).catch(() => {});
      }

      setContent('');
      setTaggedArtists([]);
      if (onPostCreated) onPostCreated(data);
    } catch (err) {
      console.error('Post error:', err);
      setError(`Failed to post: ${err?.message || JSON.stringify(err)}`);
    }
    setPosting(false);
  };

  // Only artists can post
  if (!user || !artist) return null;

  return (
    <TierGate feature="community_post">
      <div className="bg-white/[0.03] rounded-xl border border-white/[0.06] p-4 mb-4">
        {/* Author header */}
        <div className="flex items-center space-x-3 mb-3">
          <div className="w-9 h-9 rounded-full bg-gradient-to-br from-purple-600 to-blue-600 flex items-center justify-center overflow-hidden flex-shrink-0">
            {artist.profile_image_url
              ? <img src={artist.profile_image_url} alt="" className="w-9 h-9 rounded-full object-cover" />
              : <span className="text-sm font-bold text-white">{artist.artist_name?.[0]?.toUpperCase()}</span>}
          </div>
          <div>
            <p className="text-sm font-medium text-white">{artist.artist_name}</p>
            <p className="text-[10px] text-white/30">Share with your fans</p>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="flex items-center space-x-2 mb-3 p-2.5 bg-red-500/10 rounded-lg border border-red-500/20">
            <AlertCircle className="w-3.5 h-3.5 text-red-400 flex-shrink-0" />
            <p className="text-xs text-red-400">{error}</p>
          </div>
        )}

        {/* Link warning */}
        {blocked && (
          <div className="flex items-center space-x-2 mb-3 p-2.5 bg-yellow-500/10 rounded-lg border border-yellow-500/20">
            <AlertCircle className="w-3.5 h-3.5 text-yellow-400 flex-shrink-0" />
            <p className="text-xs text-yellow-400">External links are not allowed. Only YouTube links are supported.</p>
          </div>
        )}

        {/* YouTube preview */}
        {youtubeId && (
          <div className="mb-3 rounded-lg overflow-hidden aspect-video bg-black">
            <iframe
              src={`https://www.youtube.com/embed/${youtubeId}`}
              className="w-full h-full"
              allowFullScreen
              title="YouTube preview"
            />
          </div>
        )}

        {/* Text area */}
        <div className="relative">
          <textarea
            ref={editorRef}
            value={content}
            onChange={(e) => { setContent(e.target.value); setCursorPos(e.target.selectionStart); setError(''); }}
            onClick={(e) => setCursorPos(e.target.selectionStart)}
            onKeyUp={(e) => setCursorPos(e.target.selectionStart)}
            placeholder="Share a release, update, or YouTube link with your fans..."
            rows={3}
            maxLength={1000}
            className="w-full bg-white/[0.04] rounded-lg px-4 py-3 text-sm text-white placeholder-white/20 outline-none resize-none"
          />

          {/* @ mention dropdown */}
          {showTagDropdown && tagResults.length > 0 && (
            <div className="absolute left-0 right-0 top-full mt-1 bg-neutral-900 border border-white/[0.08] rounded-lg overflow-hidden z-20 shadow-xl">
              {tagResults.map(a => (
                <button key={a.id} onClick={() => insertTag(a)}
                  className="w-full flex items-center space-x-3 px-4 py-2.5 hover:bg-white/[0.05] transition text-left">
                  <div className="w-7 h-7 rounded-full bg-gradient-to-br from-purple-600 to-blue-600 flex items-center justify-center overflow-hidden flex-shrink-0">
                    {a.profile_image_url
                      ? <img src={a.profile_image_url} alt="" className="w-7 h-7 rounded-full object-cover" />
                      : <span className="text-xs font-bold text-white">{a.artist_name?.[0]?.toUpperCase()}</span>}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-white truncate">{a.artist_name}</p>
                    <p className="text-[10px] text-white/30">@{a.slug}</p>
                  </div>
                  {a.is_verified && <span className="text-[9px] text-blue-400">Verified</span>}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Tagged artists */}
        {taggedArtists.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-2">
            {taggedArtists.map(a => (
              <span key={a.id} className="flex items-center space-x-1 px-2 py-1 bg-purple-500/15 rounded-full text-xs text-purple-300">
                <span>@{a.artist_name}</span>
                <button onClick={() => removeTag(a.id)}>
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))}
          </div>
        )}

        {/* Toolbar */}
        <div className="flex items-center justify-between mt-3">
          <div className="flex items-center space-x-1">
            <button onClick={() => formatText('bold')}
              className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-white/[0.06] transition text-white/40 hover:text-white/70">
              <Bold className="w-3.5 h-3.5" />
            </button>
            <button onClick={() => formatText('italic')}
              className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-white/[0.06] transition text-white/40 hover:text-white/70">
              <Italic className="w-3.5 h-3.5" />
            </button>
            <div className="w-px h-4 bg-white/10 mx-1" />
            <button
              className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-white/[0.06] transition text-white/40 hover:text-white/70"
              title="Paste a YouTube link in your post to embed it">
              <Youtube className="w-3.5 h-3.5" />
            </button>
            <button
              className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-white/[0.06] transition text-white/40 hover:text-white/70"
              onClick={() => {
                const pos = editorRef.current?.selectionStart || content.length;
                const newContent = content.substring(0, pos) + '@' + content.substring(pos);
                setContent(newContent);
                setTimeout(() => editorRef.current?.focus(), 50);
              }}>
              <AtSign className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="flex items-center space-x-3">
            <span className="text-[10px] text-white/20">{content.length}/1000</span>
            <button
              onClick={handleSubmit}
              disabled={posting || !content.trim() || blocked}
              className="flex items-center space-x-2 px-4 py-2 bg-white text-black rounded-lg text-sm font-semibold disabled:opacity-30 transition hover:bg-white/90 active:scale-95">
              {posting ? <Loader className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
              <span>{posting ? 'Posting...' : 'Post'}</span>
            </button>
          </div>
        </div>
      </div>
    </TierGate>
  );
}
