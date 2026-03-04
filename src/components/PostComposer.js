import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../supabaseClient';
import { useAuth } from '../contexts/AuthContext';
import { Send, Loader, AtSign, X, Bold, Italic, Underline } from 'lucide-react';

export default function PostComposer({ onPostCreated }) {
  const { user, artist } = useAuth();
  const [content, setContent] = useState('');
  const [posting, setPosting] = useState(false);
  const [tagSearch, setTagSearch] = useState('');
  const [tagResults, setTagResults] = useState([]);
  const [taggedArtists, setTaggedArtists] = useState([]);
  const [showTagDropdown, setShowTagDropdown] = useState(false);
  const [cursorPos, setCursorPos] = useState(0);
  const editorRef = useRef(null);
  const tagTimeoutRef = useRef(null);

  // Watch for @ mentions in content
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

    // Focus back
    setTimeout(() => {
      if (editorRef.current) {
        editorRef.current.focus();
      }
    }, 50);
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
    else if (type === 'underline') wrapped = `__${selected}__`;
    else return;

    const newContent = content.substring(0, start) + wrapped + content.substring(end);
    setContent(newContent);
  };

  const handleSubmit = async () => {
    if (!content.trim() || !user) return;
    setPosting(true);

    try {
      const taggedIds = taggedArtists.map(a => a.id);

      const { data, error } = await supabase.from('posts').insert({
        artist_id: artist?.id || null,
        content: content.trim(),
        tagged_artist_ids: taggedIds,
        post_type: 'standard',
        is_auto_generated: false,
      }).select().single();

      if (error) throw error;

      // Notify tagged artists
      for (const ta of taggedArtists) {
        await supabase.from('notifications').insert({
          user_id: ta.user_id || user.id,
          type: 'mention',
          title: `${artist?.artist_name || 'Someone'} mentioned you in a post`,
          message: content.substring(0, 100),
          action_url: `/feed`,
          metadata: { post_id: data.id, tagger_artist_id: artist?.id },
        }).catch(() => {});
      }

      setContent('');
      setTaggedArtists([]);
      if (onPostCreated) onPostCreated(data);
    } catch (err) {
      console.error('Post error:', err);
    }
    setPosting(false);
  };

  if (!user) return null;

  return (
    <div className="bg-white/[0.03] rounded-xl border border-white/[0.06] p-4 mb-4">
      {/* Author header */}
      <div className="flex items-center space-x-3 mb-3">
        <div className="w-9 h-9 rounded-full bg-gradient-to-br from-purple-600 to-blue-600 flex items-center justify-center overflow-hidden flex-shrink-0">
          {artist?.profile_image_url
            ? <img src={artist.profile_image_url} alt="" className="w-9 h-9 rounded-full object-cover" />
            : <span className="text-sm font-bold text-white">{(artist?.artist_name || user.email)?.[0]?.toUpperCase()}</span>}
        </div>
        <div>
          <p className="text-sm font-medium text-white">{artist?.artist_name || 'Anonymous'}</p>
          <p className="text-[10px] text-white/30">Posting to feed</p>
        </div>
      </div>

      {/* Text area */}
      <div className="relative">
        <textarea
          ref={editorRef}
          value={content}
          onChange={(e) => { setContent(e.target.value); setCursorPos(e.target.selectionStart); }}
          onClick={(e) => setCursorPos(e.target.selectionStart)}
          onKeyUp={(e) => setCursorPos(e.target.selectionStart)}
          placeholder="What's on your mind? Use @ to tag artists..."
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

      {/* Tagged artists pills */}
      {taggedArtists.length > 0 && (
        <div className="flex flex-wrap gap-2 mt-2">
          {taggedArtists.map(a => (
            <span key={a.id} className="inline-flex items-center space-x-1 px-2 py-1 bg-purple-500/10 text-purple-400 rounded-md text-xs">
              <AtSign className="w-3 h-3" />
              <span>{a.artist_name}</span>
              <button onClick={() => removeTag(a.id)} className="hover:text-purple-300"><X className="w-3 h-3" /></button>
            </span>
          ))}
        </div>
      )}

      {/* Bottom bar */}
      <div className="flex items-center justify-between mt-3">
        {/* Format buttons */}
        <div className="flex items-center space-x-1">
          <button onClick={() => formatText('bold')} className="w-7 h-7 flex items-center justify-center rounded text-white/30 hover:text-white/60 hover:bg-white/[0.05] transition">
            <Bold className="w-3.5 h-3.5" />
          </button>
          <button onClick={() => formatText('italic')} className="w-7 h-7 flex items-center justify-center rounded text-white/30 hover:text-white/60 hover:bg-white/[0.05] transition">
            <Italic className="w-3.5 h-3.5" />
          </button>
          <button onClick={() => formatText('underline')} className="w-7 h-7 flex items-center justify-center rounded text-white/30 hover:text-white/60 hover:bg-white/[0.05] transition">
            <Underline className="w-3.5 h-3.5" />
          </button>
          <span className="text-[10px] text-white/15 ml-2">{content.length}/1000</span>
        </div>

        <button onClick={handleSubmit} disabled={!content.trim() || posting}
          className="flex items-center space-x-2 px-4 py-2 bg-white text-black rounded-lg text-sm font-medium disabled:opacity-30 transition active:scale-95">
          {posting ? <Loader className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          <span>Post</span>
        </button>
      </div>
    </div>
  );
}
