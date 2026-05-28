/**
 * ArtistStories.js
 *
 * Two exports:
 *   StoriesRail     — horizontal scroll of artist story bubbles (for HomePage)
 *   ArtistStoryView — full-screen story viewer (for ArtistProfilePage)
 *   StoryUpload     — upload new story (shown to artist on their own profile)
 *
 * Stories expire after 24 hours. Media can be audio, image, or short video.
 * View counts increment on open.
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { useAuth } from '../contexts/AuthContext';
import { useHaptics } from '../hooks/useHaptics';
import {
  X, Plus, Upload, Loader, Play, Pause, Music, Image, Video,
  Eye, Clock, Download,
} from 'lucide-react';

// ── Helpers ───────────────────────────────────────────────────────────────────
function timeLeft(expiresAt) {
  const ms = new Date(expiresAt).getTime() - Date.now();
  if (ms <= 0) return null;
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  if (h >= 1) return `${h}h`;
  return `${m}m`;
}

// ── Story Upload ──────────────────────────────────────────────────────────────
export function StoryUpload({ artistId, onUploaded }) {
  const { tap } = useHaptics();
  const [open, setOpen]         = useState(false);
  const [file, setFile]         = useState(null);
  const [caption, setCaption]   = useState('');
  const [uploading, setUploading] = useState(false);
  const [error, setError]       = useState('');
  const [preview, setPreview]   = useState(null);
  const [taggedTrack, setTaggedTrack] = useState(null); // { id, title, file_url }
  const [showTrackPicker, setShowTrackPicker] = useState(false);
  const [myTracks, setMyTracks] = useState([]);
  const fileRef                 = useRef(null);

  const ACCEPT = 'image/*,audio/*,video/mp4,video/webm';
  const MAX_MB = 50;

  const openTrackPicker = async () => {
    if (!myTracks.length) {
      const { data } = await supabase.from('tracks')
        .select('id, title, cover_artwork_url, file_url')
        .eq('artist_id', artistId).eq('is_published', true)
        .order('created_at', { ascending: false }).limit(30);
      setMyTracks(data || []);
    }
    setShowTrackPicker(true);
  };

  const handleFile = (e) => {
    const f = e.target.files[0];
    if (!f) return;
    if (f.size > MAX_MB * 1024 * 1024) { setError(`Max file size is ${MAX_MB}MB`); return; }
    setFile(f);
    setError('');
    // Always create object URL for preview — works for all types
    setPreview(URL.createObjectURL(f));
  };

  const convertToMp4 = async (videoFile) => {
    // Read file as base64
    const base64 = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload  = () => resolve(reader.result.split(',')[1]);
      reader.onerror = reject;
      reader.readAsDataURL(videoFile);
    });

    const res = await fetch('/.netlify/functions/convert-to-mp4', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ video: base64, mimeType: videoFile.type }),
    });

    if (!res.ok) throw new Error('Video conversion failed — try uploading an MP4 directly');
    const { mp4 } = await res.json();

    // Convert base64 back to File
    const bytes = Uint8Array.from(atob(mp4), c => c.charCodeAt(0));
    const blob  = new Blob([bytes], { type: 'video/mp4' });
    return new File([blob], videoFile.name.replace(/\.[^.]+$/, '.mp4'), { type: 'video/mp4' });
  };

  const mediaType = file
    ? file.type.startsWith('audio') ? 'audio'
    : file.type.startsWith('video') ? 'video'
    : 'image'
    : null;

  const handleUpload = async () => {
    if (!file || !artistId) return;
    setUploading(true);
    setError('');
    try {
      let uploadFile = file;

      // Convert WebM/video to MP4 for universal playback (Safari, iOS etc)
      if (mediaType === 'video' && (file.type === 'video/webm' || file.name.endsWith('.webm'))) {
        setError('Converting video…');
        uploadFile = await convertToMp4(file);
        setError('');
      }

      const ext  = uploadFile.name.split('.').pop().toLowerCase();
      const storagePath = `stories/${artistId}/${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from('stories')
        .upload(storagePath, uploadFile, { upsert: false, contentType: uploadFile.type });
      if (upErr) throw upErr;

      const { data: { publicUrl } } = supabase.storage.from('stories').getPublicUrl(storagePath);

      await supabase.from('artist_stories').insert({
        artist_id:       artistId,
        media_url:       publicUrl,
        media_type:      mediaType,
        caption:         caption.trim() || null,
        tagged_track_id: taggedTrack?.id || null,
        expires_at:      new Date(Date.now() + 24 * 3600000).toISOString(),
      });

      setOpen(false);
      setFile(null);
      setCaption('');
      setPreview(null);
      setTaggedTrack(null);
      onUploaded?.();
    } catch (err) { setError(err.message); }
    setUploading(false);
  };

  return (
    <>
      <button
        onClick={() => { tap(); setOpen(true); }}
        className="flex-shrink-0 flex flex-col items-center space-y-1.5"
      >
        <div className="w-16 h-16 rounded-full border-2 border-dashed border-white/20 flex items-center justify-center bg-white/[0.04] hover:bg-white/[0.07] transition">
          <Plus className="w-6 h-6 text-white/40" />
        </div>
        <span className="text-[10px] text-white/30">Add Story</span>
      </button>

      {open && (
        <div className="fixed inset-0 z-[600] flex items-end justify-center bg-black/80 backdrop-blur-sm"
          onClick={() => setOpen(false)}>
          <div className="w-full max-w-lg bg-neutral-900 rounded-t-2xl p-5 border-t border-white/[0.08]"
            onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold text-white">Add a Story</h3>
              <button onClick={() => setOpen(false)}><X className="w-4 h-4 text-white/30" /></button>
            </div>
            <p className="text-xs text-white/30 mb-4">Stories disappear after 24 hours. Share audio clips, images, or short videos with your followers.</p>

            {/* File picker */}
            {!file ? (
              <button onClick={() => fileRef.current?.click()}
                className="w-full py-8 rounded-2xl border-2 border-dashed border-white/15 flex flex-col items-center space-y-2 text-white/30 hover:border-white/25 hover:text-white/50 transition mb-3">
                <Upload className="w-8 h-8" />
                <span className="text-sm">Tap to choose audio, image, or video</span>
                <span className="text-[10px] text-white/20 mt-1">Videos convert to MP4 automatically</span>
                <span className="text-xs">Max {MAX_MB}MB</span>
              </button>
            ) : (
              <div className="rounded-2xl overflow-hidden bg-black mb-3 relative">
                {mediaType === 'image' && <img src={preview} alt="" className="w-full max-h-48 object-contain" />}
                {mediaType === 'audio' && (
                  <div className="flex items-center space-x-3 p-4">
                    <div className="w-10 h-10 rounded-full bg-purple-500/20 flex items-center justify-center">
                      <Music className="w-5 h-5 text-purple-400" />
                    </div>
                    <div>
                      <p className="text-sm text-white">{file.name}</p>
                      <audio controls src={preview} className="mt-1 w-full" style={{ height: 32 }} />
                    </div>
                  </div>
                )}
                {mediaType === 'video' && <video src={preview} controls className="w-full max-h-48" />}
                <button onClick={() => { setFile(null); setPreview(null); }}
                  className="absolute top-2 right-2 w-7 h-7 rounded-full bg-black/60 flex items-center justify-center">
                  <X className="w-3.5 h-3.5 text-white" />
                </button>
              </div>
            )}

            <input ref={fileRef} type="file" accept={ACCEPT} onChange={handleFile} className="hidden" />

            <input value={caption} onChange={e => setCaption(e.target.value)} maxLength={150}
              placeholder="Add a caption (optional)"
              className="w-full bg-white/[0.06] rounded-xl px-3 py-2.5 text-sm text-white placeholder-white/20 outline-none mb-3" />

            {error && <p className="text-xs text-red-400 mb-3">{error}</p>}

            <button onClick={handleUpload} disabled={!file || uploading}
              className="w-full py-3 bg-purple-600 rounded-xl text-sm font-semibold text-white disabled:opacity-40 transition flex items-center justify-center space-x-2">
              {uploading ? <Loader className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
              <span>{uploading ? (error === 'Converting video…' ? 'Converting...' : 'Uploading...') : 'Share Story'}</span>
            </button>
          </div>
        </div>
      )}
    </>
  );
}

// ── Story Bubble ──────────────────────────────────────────────────────────────
function StoryBubble({ artist, stories, viewed, onClick }) {
  const hasUnviewed = stories.some(s => !viewed.has(s.id));
  return (
    <button onClick={onClick}
      className="flex-shrink-0 flex flex-col items-center space-y-1.5 w-16">
      <div className={`w-16 h-16 rounded-full p-0.5 ${hasUnviewed ? 'bg-gradient-to-tr from-purple-500 to-pink-400' : 'bg-white/20'}`}>
        <div className="w-full h-full rounded-full overflow-hidden bg-black border border-black">
          {artist.profile_image_url
            ? <img src={artist.profile_image_url} alt={artist.artist_name} className="w-full h-full object-cover" />
            : <div className="w-full h-full bg-white/10 flex items-center justify-center text-sm font-bold text-white/40">
                {artist.artist_name?.[0]}
              </div>}
        </div>
      </div>
      <span className="text-[10px] text-white/50 truncate max-w-[64px]">{artist.artist_name}</span>
    </button>
  );
}

// ── Full-screen Story Viewer ──────────────────────────────────────────────────
export function ArtistStoryView({ stories, artist, initialIndex = 0, onClose }) {
  const { user } = useAuth();
  const { tap }  = useHaptics();
  const [idx, setIdx]             = useState(initialIndex);
  const [playing, setPlaying]     = useState(false);
  const [progress, setProgress]   = useState(0);
  const taggedAudioRef            = useRef(null);
  const audioRef                  = useRef(null);
  const videoRef                  = useRef(null);
  const progressRef               = useRef(null);
  const DURATION_IMAGE_MS         = 5000;

  const story = stories[idx];

  const markViewed = useCallback(async (storyId) => {
    if (!user) return;
    try {
      await supabase.from('story_views').upsert({ story_id: storyId, user_id: user.id }, { onConflict: 'story_id,user_id', ignoreDuplicates: true });
      try {
        await supabase.rpc('increment_story_views', { story_id_input: storyId });
      } catch {
        try { await supabase.from('artist_stories').update({ view_count: (story.view_count || 0) + 1 }).eq('id', storyId); } catch {}
      }
    } catch {}
  }, [user, story?.view_count]);

  useEffect(() => {
    if (!story) return;
    markViewed(story.id);
    setProgress(0);
    setPlaying(false);

    if (story.media_type === 'image') {
      clearInterval(progressRef.current);
      let elapsed = 0;
      progressRef.current = setInterval(() => {
        elapsed += 100;
        setProgress(Math.min(100, (elapsed / DURATION_IMAGE_MS) * 100));
        if (elapsed >= DURATION_IMAGE_MS) {
          clearInterval(progressRef.current);
          goNext();
        }
      }, 100);
    }
    return () => clearInterval(progressRef.current);
  }, [idx]);

  const goNext = () => {
    tap();
    if (idx < stories.length - 1) setIdx(p => p + 1);
    else onClose();
  };

  const goPrev = () => {
    tap();
    if (idx > 0) setIdx(p => p - 1);
  };

  if (!story) return null;

  return (
    <div className="fixed inset-0 z-[700] bg-black flex flex-col">
      {/* Progress bars */}
      <div className="flex space-x-1 px-3 pt-safe pt-4 flex-shrink-0">
        {stories.map((s, i) => (
          <div key={s.id} className="flex-1 h-0.5 rounded-full bg-white/20 overflow-hidden">
            <div className="h-full bg-white rounded-full transition-none"
              style={{ width: i < idx ? '100%' : i === idx ? `${progress}%` : '0%' }} />
          </div>
        ))}
      </div>

      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 flex-shrink-0">
        <div className="flex items-center space-x-2.5">
          <div className="w-8 h-8 rounded-full overflow-hidden bg-white/10">
            {artist.profile_image_url
              ? <img src={artist.profile_image_url} alt="" className="w-full h-full object-cover" />
              : <div className="w-full h-full flex items-center justify-center text-xs font-bold text-white/40">{artist.artist_name?.[0]}</div>}
          </div>
          <div>
            <p className="text-sm font-semibold text-white">{artist.artist_name}</p>
            <div className="flex items-center space-x-1">
              <Clock className="w-2.5 h-2.5 text-white/30" />
              <span className="text-[10px] text-white/30">{timeLeft(story.expires_at)} left</span>
              {story.view_count > 0 && (
                <>
                  <Eye className="w-2.5 h-2.5 text-white/30 ml-1" />
                  <span className="text-[10px] text-white/30">{story.view_count}</span>
                </>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center space-x-2">
          {(story.media_type === 'image' || story.media_type === 'video') && (
            <button onClick={() => {
              const a = document.createElement('a');
              a.href = story.media_url;
              a.download = `feelzmachine-story.${story.media_type === 'video' ? 'mp4' : 'png'}`;
              a.target = '_blank';
              document.body.appendChild(a); a.click(); document.body.removeChild(a);
            }} className="w-8 h-8 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 transition">
              <Download className="w-4 h-4 text-white/70" />
            </button>
          )}
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 transition">
            <X className="w-4 h-4 text-white/70" />
          </button>
        </div>
      </div>

      {/* Media */}
      <div className="flex-1 flex items-center justify-center relative overflow-hidden">
        {story.media_type === 'image' && (
          <img src={story.media_url} alt={story.caption || ''} className="max-w-full max-h-full object-contain" />
        )}
        {story.media_type === 'audio' && (
          <div className="flex flex-col items-center space-y-6 px-8">
            <div className="w-32 h-32 rounded-full bg-purple-500/20 flex items-center justify-center">
              <Music className="w-16 h-16 text-purple-400" />
            </div>
            <audio ref={audioRef} src={story.media_url} controls
              className="w-full" onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)}
              onEnded={goNext} autoPlay />
          </div>
        )}
        {story.media_type === 'video' && (
          <video
            muted={!!story.tracks?.file_url} ref={videoRef} src={story.media_url} controls autoPlay
            className="max-w-full max-h-full" onEnded={goNext} />
        )}

        {/* Tap zones for navigation */}
        <button className="absolute left-0 top-0 bottom-0 w-1/3" onClick={goPrev} />
        <button className="absolute right-0 top-0 bottom-0 w-1/3" onClick={goNext} />
      </div>

      {/* Tagged track pill */}
      {story.tracks && (
        <div className="absolute bottom-20 left-4 right-4 z-20">
          <div className="inline-flex items-center space-x-2 px-3 py-1.5 rounded-full"
            style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(8px)', border: '1px solid rgba(255,255,255,0.15)' }}>
            <span className="text-sm">🎵</span>
            <div className="flex flex-col min-w-0">
              <p className="text-[11px] font-bold text-white truncate max-w-[160px]">{story.tracks.title}</p>
              <p className="text-[9px] text-white/40 uppercase tracking-wider">Tagged track</p>
            </div>
          </div>
        </div>
      )}

      {/* Caption */}
      {story.caption && (
        <div className="px-5 py-4 flex-shrink-0">
          <p className="text-sm text-white/80 leading-relaxed text-center">{story.caption}</p>
        </div>
      )}
    </div>
  );
}

// ── Stories Rail (for HomePage) ───────────────────────────────────────────────
export function StoriesRail({ userId }) {
  const navigate                    = useNavigate();
  const [storyGroups, setStoryGroups] = useState([]); // [{ artist, stories }]
  const [viewedIds, setViewedIds]   = useState(new Set());
  const [viewing, setViewing]       = useState(null); // { artist, stories, idx }
  const [loading, setLoading]       = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const platformArtistId = process.env.REACT_APP_PLATFORM_ARTIST_ID;

        // Get all active (non-expired) stories
        const { data: stories } = await supabase
          .from('artist_stories')
          .select('*, tracks:tagged_track_id(id, title, file_url, cover_artwork_url), artists(id, artist_name, slug, profile_image_url)')
          .gt('expires_at', new Date().toISOString())
          .order('created_at', { ascending: false })
          .limit(100);

        if (!stories?.length) { setLoading(false); return; }

        // Group by artist
        const groups = {};
        stories.forEach(s => {
          const aid = s.artists?.id;
          if (!aid) return;
          if (!groups[aid]) groups[aid] = { artist: s.artists, stories: [] };
          groups[aid].stories.push(s);
        });

        const groupList = Object.values(groups);

        // Pin platform story first if it exists
        const platformIdx = groupList.findIndex(g => g.artist.id === platformArtistId);
        if (platformIdx > 0) {
          const [platform] = groupList.splice(platformIdx, 1);
          groupList.unshift(platform);
        }
        setStoryGroups(groupList);

        // Get viewed story IDs for this user
        if (userId) {
          const storyIds = stories.map(s => s.id);
          const { data: views } = await supabase
            .from('story_views').select('story_id')
            .eq('user_id', userId).in('story_id', storyIds);
          setViewedIds(new Set((views || []).map(v => v.story_id)));
        }
      } catch {}
      setLoading(false);
    };
    load();
  }, [userId]);

  if (loading || !storyGroups.length) return null;

  return (
    <>
      <div className="flex space-x-4 overflow-x-auto px-6 pb-1 scrollbar-hide" style={{ WebkitOverflowScrolling: 'touch' }}>
        {storyGroups.map(({ artist, stories }) => (
          <StoryBubble
            key={artist.id}
            artist={artist}
            stories={stories}
            viewed={viewedIds}
            onClick={() => setViewing({ artist, stories, idx: 0 })}
          />
        ))}
      </div>

      {viewing && (
        <ArtistStoryView
          stories={viewing.stories}
          artist={viewing.artist}
          initialIndex={viewing.idx}
          onClose={() => setViewing(null)}
        />
      )}
    </>
  );
}