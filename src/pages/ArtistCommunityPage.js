/**
 * ArtistCommunityPage.js
 *
 * Full-screen community page for an artist.
 * Accessed via /artist/:slug/community
 * Shows: Top Listeners, Stories, Listener Comments, Thoughts, Voice Memos
 * with a Chat Rooms shortcut at the top.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { useAuth } from '../contexts/AuthContext';
import { ArrowLeft, MessageCircle, Users } from 'lucide-react';
import ArtistGuestbook from '../components/ArtistGuestbook';
import { VoiceMemoCard } from '../components/VoiceMemo';
import { ArtistStoryView } from '../components/ArtistStories';

export default function ArtistCommunityPage() {
  const { slug }         = useParams();
  const navigate         = useNavigate();
  const { user }         = useAuth();

  const [artist, setArtist]           = useState(null);
  const [topListeners, setTopListeners] = useState([]);
  const [thoughts, setThoughts]       = useState([]);
  const [voiceMemos, setVoiceMemos]   = useState([]);
  const [stories, setStories]         = useState([]);
  const [viewingStory, setViewingStory] = useState(false);
  const [loading, setLoading]         = useState(true);

  const isOwner = user?.id && artist?.user_id && user.id === artist.user_id;

  const load = useCallback(async () => {
    if (!slug) return;
    const { data: artistData } = await supabase
      .from('artists').select('*').eq('slug', slug).maybeSingle();
    if (!artistData) { setLoading(false); return; }
    setArtist(artistData);

    const [
      { data: listenersData },
      { data: thoughtsData },
      { data: memosData },
      { data: storiesData },
    ] = await Promise.all([
      supabase.from('streams')
        .select('user_id, listeners(display_name, avatar_url, user_id)')
        .eq('artist_id', artistData.id)
        .limit(200),
      supabase.from('artist_thoughts')
        .select('*').eq('artist_id', artistData.id)
        .order('created_at', { ascending: false }).limit(20),
      supabase.from('artist_voice_memos')
        .select('*').eq('artist_id', artistData.id)
        .order('created_at', { ascending: false }).limit(10),
      supabase.from('artist_stories')
        .select('*').eq('artist_id', artistData.id)
        .gt('expires_at', new Date().toISOString())
        .order('created_at', { ascending: false }).limit(20),
    ]);

    // Tally top listeners
    const counts = {};
    (listenersData || []).forEach(s => {
      if (!s.listeners) return;
      const id = s.listeners.user_id;
      if (!counts[id]) counts[id] = { ...s.listeners, count: 0 };
      counts[id].count++;
    });
    setTopListeners(Object.values(counts).sort((a, b) => b.count - a.count).slice(0, 10));
    setThoughts(thoughtsData || []);
    setVoiceMemos(memosData || []);
    setStories(storiesData || []);
    setLoading(false);
  }, [slug]);

  useEffect(() => { load(); }, [load]);

  if (loading) return (
    <div className="min-h-screen bg-black flex items-center justify-center">
      <div className="w-6 h-6 rounded-full border-2 border-white/20 border-t-white animate-spin" />
    </div>
  );

  if (!artist) return (
    <div className="min-h-screen bg-black flex items-center justify-center">
      <p className="text-white/40">Artist not found</p>
    </div>
  );

  const primaryColor = artist.primary_color || '#8B5CF6';
  const textColor    = artist.text_color    || '#ffffff';
  const bgColor      = artist.bg_color      || '#000000';

  return (
    <div className="min-h-screen pb-24" style={{ backgroundColor: bgColor }}>

      {/* Header */}
      <div className="sticky top-0 z-40 flex items-center justify-between px-4 py-3 border-b border-white/[0.06]"
        style={{ backgroundColor: bgColor }}>
        <button onClick={() => navigate(-1)}
          className="w-9 h-9 flex items-center justify-center rounded-full bg-white/[0.08] hover:bg-white/[0.15] transition">
          <ArrowLeft className="w-4 h-4 text-white/70" />
        </button>
        <div className="text-center">
          <p className="text-sm font-bold" style={{ color: textColor }}>Community</p>
          <p className="text-xs" style={{ color: `${textColor}50` }}>{artist.artist_name}</p>
        </div>
        <button onClick={() => navigate('/community')}
          className="flex items-center space-x-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition"
          style={{ backgroundColor: `${primaryColor}20`, color: primaryColor, border: `1px solid ${primaryColor}30` }}>
          <MessageCircle className="w-3 h-3" />
          <span>Chat Rooms</span>
        </button>
      </div>

      <div className="px-5 py-5 space-y-8">

        {/* Stories */}
        {stories.length > 0 && (
          <section>
            <p className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: `${textColor}40` }}>Stories</p>
            <button onClick={() => setViewingStory(true)}
              className="flex items-center space-x-3 w-full p-3 rounded-2xl transition hover:bg-white/[0.04]"
              style={{ border: '1px solid rgba(255,255,255,0.06)' }}>
              <div className="w-12 h-12 rounded-full p-0.5 flex-shrink-0"
                style={{ background: 'linear-gradient(135deg, #8B5CF6, #06B6D4)' }}>
                <div className="w-full h-full rounded-full overflow-hidden" style={{ backgroundColor: bgColor }}>
                  {artist.profile_image_url
                    ? <img src={artist.profile_image_url} alt="" className="w-full h-full object-cover" />
                    : <div className="w-full h-full flex items-center justify-center text-xs font-bold"
                        style={{ color: textColor }}>{artist.artist_name?.[0]}</div>}
                </div>
              </div>
              <div className="text-left">
                <p className="text-sm font-medium" style={{ color: textColor }}>{artist.artist_name}</p>
                <p className="text-xs" style={{ color: `${textColor}40` }}>
                  {stories.length} active {stories.length === 1 ? 'story' : 'stories'}
                </p>
              </div>
            </button>
          </section>
        )}

        {/* Top Listeners */}
        {topListeners.length > 0 && (
          <section>
            <div className="flex items-center space-x-2 mb-3">
              <Users className="w-3.5 h-3.5" style={{ color: `${textColor}40` }} />
              <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: `${textColor}40` }}>Top Listeners</p>
            </div>
            <div className="flex flex-wrap gap-4">
              {topListeners.map((listener, i) => (
                <div key={listener.user_id} className="flex flex-col items-center">
                  <div className="relative">
                    <div className="w-12 h-12 rounded-full overflow-hidden border-2"
                      style={{ borderColor: i === 0 ? primaryColor : `${textColor}20` }}>
                      {listener.avatar_url
                        ? <img src={listener.avatar_url} alt={listener.display_name} className="w-full h-full object-cover" />
                        : <div className="w-full h-full flex items-center justify-center text-sm font-bold"
                            style={{ background: `${primaryColor}30`, color: textColor }}>
                            {listener.display_name?.[0]}
                          </div>}
                    </div>
                    {i === 0 && <span className="absolute -top-1 -right-1 text-[11px]">👑</span>}
                  </div>
                  <p className="text-[10px] mt-1 max-w-[48px] truncate text-center" style={{ color: `${textColor}50` }}>
                    {listener.count} plays
                  </p>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Listener Comments */}
        <section>
          <p className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: `${textColor}40` }}>Listener Comments</p>
          <ArtistGuestbook artistId={artist.id} textColor={textColor} accentColor={primaryColor} isOwner={isOwner} />
        </section>

        {/* Thoughts */}
        {thoughts.length > 0 && (
          <section>
            <p className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: `${textColor}40` }}>Thoughts</p>
            <div className="space-y-3">
              {thoughts.map(thought => (
                <div key={thought.id} className="p-4 rounded-2xl border border-white/[0.06]"
                  style={{ background: 'rgba(255,255,255,0.02)' }}>
                  <p className="text-sm leading-relaxed" style={{ color: textColor }}>{thought.content}</p>
                  <p className="text-[10px] mt-2" style={{ color: `${textColor}30` }}>
                    {new Date(thought.created_at).toLocaleDateString()}
                  </p>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Voice Memos */}
        {voiceMemos.length > 0 && (
          <section>
            <p className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: `${textColor}40` }}>Voice Memos</p>
            <div className="space-y-2">
              {voiceMemos.map(memo => (
                <VoiceMemoCard key={memo.id} memo={memo} canDelete={false} />
              ))}
            </div>
          </section>
        )}

        {thoughts.length === 0 && voiceMemos.length === 0 && stories.length === 0 && topListeners.length === 0 && (
          <p className="text-sm text-white/20 text-center py-12">Nothing here yet — check back soon</p>
        )}
      </div>

      {/* Story viewer */}
      {viewingStory && stories.length > 0 && (
        <ArtistStoryView
          stories={stories}
          artist={artist}
          isOwner={isOwner}
          onDelete={async (storyId) => {
            await supabase.from('artist_stories').delete().eq('id', storyId);
            setStories(prev => { const r = prev.filter(s => s.id !== storyId); if (!r.length) setViewingStory(false); return r; });
          }}
          onClose={() => setViewingStory(false)}
        />
      )}
    </div>
  );
}