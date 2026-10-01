/**
 * ArtistStories.js
 *
 * Two exports:
 *   StoriesRail    , horizontal scroll of artist story bubbles (for HomePage)
 *   ArtistStoryView, full-screen story viewer (for ArtistProfilePage)
 *   StoryUpload    , upload new story (shown to artist on their own profile)
 *
 * Stories expire after 24 hours. Media can be audio, image, or short video.
 * View counts increment on open.
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { visibleNow } from '../utils/stories';
import { sendNotification } from '../utils/notify';
import { useAuth } from '../contexts/AuthContext';
import { useHaptics } from '../hooks/useHaptics';
import {
  X, Plus, Upload, Loader, Play, Pause, Music, Image, Video,
  Eye, Clock, Download, Heart, Sparkles, Trash2,
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
export function StoryUpload({ artistId, onUploaded, inline = false }) {
  const { tap } = useHaptics();
  // `inline` was already being PASSED by both call sites, CreateMenuModal
  // and the profile's own + menu, and this component never declared it. So
  // it rendered its trigger button and its own full-screen overlay inside a
  // sheet that was already a modal: you opened "Add Story" and were shown a
  // second "Add Story" button, and tapping that threw a bottom sheet over the
  // card you were already looking at. In inline mode the form is now the
  // content, with no trigger and no overlay.
  const [open, setOpen]         = useState(inline);
  const [file, setFile]         = useState(null);
  const [caption, setCaption]   = useState('');
  const [uploading, setUploading] = useState(false);
  const [error, setError]       = useState('');
  const [preview, setPreview]   = useState(null);
  const [taggedTrack, setTaggedTrack] = useState(null); // { id, title, file_url }
  const [showTrackPicker, setShowTrackPicker] = useState(false);
  const [myTracks, setMyTracks] = useState([]);
  const fileRef                 = useRef(null);

  // The artist's own stories that have not expired yet.
  //
  // There was no way to see what you had posted and no way to take it down , 
  // the only remedy for a mistake was to wait out the full 24 hours. Now the
  // sheet you post from is also the sheet you manage from.
  const [mine, setMine]             = useState([]);
  const [mineLoading, setMineLoading] = useState(false);
  const [deletingId, setDeletingId]   = useState(null);

  const ACCEPT = 'image/*,audio/*,video/mp4,video/webm';
  const MAX_MB = 50;

  const loadMine = useCallback(async () => {
    if (!artistId) return;
    setMineLoading(true);
    const { data, error } = await visibleNow(
      supabase
        .from('artist_stories')
        .select('id, media_url, media_type, caption, view_count, like_count, expires_at, created_at')
        .eq('artist_id', artistId))
      .order('created_at', { ascending: false });
    if (error) console.error('[story] own stories load failed:', error.code, error.message);
    setMine(data || []);
    setMineLoading(false);
  }, [artistId]);

  useEffect(() => { if (open) loadMine(); }, [open, loadMine]);

  const deleteStory = async (story) => {
    setDeletingId(story.id);
    // The row first. If the row goes and the file lingers, the story is gone
    // from the app and the orphan costs a few KB. Deleting the file first and
    // then failing to delete the row would leave a story that renders as a
    // broken image, the worse of the two failures, so it is the one that
    // cannot happen.
    const { error } = await supabase.from('artist_stories').delete().eq('id', story.id);
    if (error) {
      console.error('[story] delete refused:', error.code, error.message);
      setError(`Could not delete: ${error.message}`);
      setDeletingId(null);
      return;
    }
    // Best-effort file cleanup.
    //
    // This looked right and removed nothing, for a reason worth spelling out:
    // the BUCKET is called stories and the key inside it ALSO starts with
    // stories/, because the upload above writes
    // `stories/${artistId}/${Date.now()}.${ext}`. So a public URL reads
    //
    //   .../object/public/stories/stories/<artistId>/<ts>.<ext>
    //                    ^bucket  ^key
    //
    // and indexOf('/stories/') finds the BUCKET segment, not the key. The old
    // line handed remove() `stories/stories/<artistId>/<ts>.<ext>`, one level
    // too deep, which matches no object. remove() reports that in its return
    // value rather than throwing, and the return value was discarded, so every
    // manually deleted story left its media file sitting in a public bucket.
    // The row vanished from the app and the file stayed reachable by URL to
    // anyone who had it.
    //
    // Split on the bucket segment and keep everything after it, which is the
    // key by definition however many path parts it has.
    try {
      const marker = '/object/public/stories/';
      const i = story.media_url.indexOf(marker);
      const key = i === -1 ? null : story.media_url.slice(i + marker.length).split('?')[0];
      if (key) {
        const { error: rmErr } = await supabase.storage.from('stories').remove([key]);
        // Logged, not shown. The story is already gone as far as the artist is
        // concerned, but a silent failure here is what hid this for months.
        if (rmErr) console.error('[story] media file not removed:', key, rmErr.message);
      }
    } catch (err) {
      console.error('[story] media cleanup threw:', err?.message);
    }
    setMine(prev => prev.filter(x => x.id !== story.id));
    setDeletingId(null);
    onUploaded?.();
  };

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
    // Always create object URL for preview, works for all types
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

    const res = await fetch('/.netlify/functions/convert-to-mp4-background', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ video: base64, mimeType: videoFile.type }),
    });

    if (!res.ok) throw new Error('Video conversion failed, try uploading an MP4 directly');
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

      // The error was discarded here.
      //
      // The file uploaded to storage, this line ran, whatever the database
      // said was thrown away, the modal closed and everything looked like it
      // had worked. If the row was refused there was no story and no message
      // saying so, which is exactly the "I uploaded a story but it's not
      // showing" symptom, and it is unfalsifiable from the outside because
      // success and failure produce identical screens.
      const { error: insErr } = await supabase.from('artist_stories').insert({
        artist_id:       artistId,
        media_url:       publicUrl,
        media_type:      mediaType,
        caption:         caption.trim() || null,
        tagged_track_id: taggedTrack?.id || null,
        expires_at:      new Date(Date.now() + 24 * 3600000).toISOString(),
      });
      if (insErr) {
        console.error('[story] insert refused:', insErr.code, insErr.message, insErr.details || '', insErr.hint || '');
        throw new Error(
          insErr.code === '42501' || /row-level security/i.test(insErr.message)
            ? 'The file uploaded but the story could not be saved, your account is not allowed to post stories for this artist.'
            : `Story could not be saved: ${insErr.message}`
        );
      }

      setFile(null);
      setCaption('');
      setPreview(null);
      setTaggedTrack(null);
      loadMine();
      if (!inline) setOpen(false);
      onUploaded?.();
    } catch (err) { setError(err.message); }
    setUploading(false);
  };

  // ── The form body, shared by both modes ────────────────────────────────
  const body = (
    <>
      <p className="text-xs text-white/35 mb-4 leading-relaxed">
        Stories disappear after 24 hours. Share audio clips, images, or short
        videos with your followers.
      </p>

      {/* Your live stories, see them, and take one down.
          This is the half that did not exist. An artist could post and then
          had no view of what was up and no way to remove it short of waiting
          out the full day. */}
      {(mineLoading || mine.length > 0) && (
        <div className="mb-4">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-white/30 mb-2">
            Live now {mine.length > 0 && `(${mine.length})`}
          </p>
          {mineLoading ? (
            <div className="py-4 flex justify-center"><Loader className="w-4 h-4 animate-spin text-white/25" /></div>
          ) : (
            <div className="space-y-2">
              {mine.map(st => (
                <div key={st.id} className="flex items-center gap-3 p-2 rounded-xl bg-white/[0.04] border border-white/[0.06]">
                  <div className="w-11 h-11 rounded-lg overflow-hidden bg-black flex-shrink-0 flex items-center justify-center">
                    {st.media_type === 'image'
                      ? <img src={st.media_url} alt="" className="w-full h-full object-cover" />
                      : st.media_type === 'video'
                        ? <Video className="w-5 h-5 text-white/35" />
                        : <Music className="w-5 h-5 text-white/35" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-white/80 truncate">
                      {st.caption || `${st.media_type[0].toUpperCase()}${st.media_type.slice(1)} story`}
                    </p>
                    <div className="flex items-center gap-2.5 mt-0.5 text-[10px] text-white/30">
                      <span className="inline-flex items-center gap-1"><Eye className="w-2.5 h-2.5" />{st.view_count || 0}</span>
                      <span className="inline-flex items-center gap-1"><Heart className="w-2.5 h-2.5" />{st.like_count || 0}</span>
                      <span className="inline-flex items-center gap-1"><Clock className="w-2.5 h-2.5" />{timeLeft(st.expires_at) || 'expiring'}</span>
                    </div>
                  </div>
                  <button
                    onClick={() => deleteStory(st)}
                    disabled={deletingId === st.id}
                    title="Delete this story"
                    className="w-8 h-8 flex items-center justify-center rounded-full bg-white/[0.06] hover:bg-red-500/20 transition active:scale-90 flex-shrink-0 disabled:opacity-40"
                  >
                    {deletingId === st.id
                      ? <Loader className="w-3.5 h-3.5 animate-spin text-white/40" />
                      : <Trash2 className="w-3.5 h-3.5 text-white/40" />}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

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
              <div className="w-10 h-10 rounded-full bg-purple-500/20 flex items-center justify-center flex-shrink-0">
                <Music className="w-5 h-5 text-purple-400" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm text-white truncate">{file.name}</p>
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
    </>
  );

  // Inline: the caller already owns a modal shell. Render the content only , 
  // no trigger button, no second overlay.
  if (inline) return <div>{body}</div>;

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

      {/* A centre-floating card, matching CreateMenuModal and MerchConnectSheet.
          This was the only sheet in the app that slid up from the bottom edge
          and squared off its top corners, so it read as a different app's
          component every time it appeared. Same shell as the others now:
          items-center, max-w-sm, rounded-3xl, #0f0f0f, a header row with a
          close button, and its own scroll so a long list of live stories
          cannot push the Share button off a short screen. */}
      {open && (
        <div className="fixed inset-0 z-[600] flex items-center justify-center bg-black/70 backdrop-blur-sm px-4 py-6"
          onClick={() => setOpen(false)}>
          <div className="w-full max-w-sm rounded-3xl overflow-hidden flex flex-col"
            style={{ maxHeight: 'calc(100vh - 48px)', backgroundColor: '#0f0f0f', border: '1px solid rgba(255,255,255,0.08)', boxShadow: '0 32px 64px rgba(0,0,0,0.6)' }}
            onClick={e => e.stopPropagation()}>

            <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.06]">
              <p className="text-sm font-bold text-white">Add a Story</p>
              <button onClick={() => setOpen(false)}
                className="w-8 h-8 flex items-center justify-center rounded-full bg-white/[0.08] hover:bg-white/[0.15] transition">
                <X className="w-4 h-4 text-white/60" />
              </button>
            </div>

            <div className="p-5 overflow-y-auto flex-1">{body}</div>
          </div>
        </div>
      )}
    </>
  );
}

// ── The platform's own account ────────────────────────────────────────────────
//
// Migration 191 creates this artist row with artist_name 'Feelz Machine' and
// slug 'feelz-machine', and sets no profile image, because the artists table
// has no column it could have put one in that the migration was willing to
// guess at. So every bubble, every story header and every mention of the
// platform account fell through to the first letter of the name and rendered
// as a grey circle with an F in it.
//
// Matched on the slug rather than REACT_APP_PLATFORM_ARTIST_ID. That env var
// is read a few lines down and, by the admission of the comment next to it,
// has never been set, so anything depending on it does nothing. The slug is
// what migration 191 creates, what platform_story_artist_id() looks up, and
// what every other half of this feature already keys on.
const PLATFORM_SLUG = 'feelz-machine';
const PLATFORM_LOGO = '/logo.png';

export function isPlatformArtist(artist, envId) {
  if (!artist) return false;
  if (envId && artist.id === envId) return true;
  return artist.slug === PLATFORM_SLUG;
}

// What to draw in the circle. Null means there is genuinely nothing, and the
// caller falls back to the initial, which is still the right answer for an
// ordinary artist who has not uploaded a picture.
export function storyAvatarSrc(artist) {
  if (artist?.profile_image_url) return artist.profile_image_url;
  if (artist?.slug === PLATFORM_SLUG) return PLATFORM_LOGO;
  return null;
}

// The logo is a rounded square on black, not a photograph. object-cover would
// crop its corners against a circular mask and cut the green outline, so it is
// inset and contained instead. An artist's own photo still covers, because
// cropping a photo to a circle is correct.
export function storyAvatarClass(artist) {
  return artist?.profile_image_url
    ? 'w-full h-full object-cover'
    : 'w-full h-full object-contain p-1.5 bg-black';
}

// ── Story Bubble ──────────────────────────────────────────────────────────────
//
// Two modes.
//
// GROUPED, one bubble per artist, every story behind it. This is the normal
// rail and it is what every app does, because with twenty artists posting you
// want twenty faces, not two hundred circles.
//
// EXPANDED, one bubble per story, used when almost nobody has posted. The
// grouped rail is correct and still looks broken on a quiet day: five stories
// from the platform account collapse into a single circle sitting alone in a
// full width panel, which reads as "there is nothing here" when there are
// actually five things here. In expanded mode each story gets its own bubble,
// showing its own image where it has one, so the rail fills with what is
// actually there.
function StoryBubble({ artist, stories, story, label, viewed, onClick }) {
  const hasUnviewed = story ? !viewed.has(story.id) : stories.some(s => !viewed.has(s.id));
  const src   = story?.media_type === 'image' ? story.media_url : storyAvatarSrc(artist);
  const cls   = story?.media_type === 'image' ? 'w-full h-full object-cover' : storyAvatarClass(artist);
  const badge = story && story.media_type !== 'image' ? story.media_type : null;
  return (
    <button onClick={onClick}
      className="flex-shrink-0 flex flex-col items-center space-y-1.5 w-[68px]">
      {/* The ring, made to read as a ring.
          It was a 2px (p-0.5) two-stop gradient, which at 64px across is a
          hairline, on a dark page next to full-colour artwork it reads as an
          edge on the avatar rather than as the "there is something new here"
          signal every other app has trained people to look for. Three
          changes: 3px so it has actual width, a three-stop gradient so it
          does not flatten into one purple, and a soft coloured glow so it
          separates from the black behind it. Viewed stories stay deliberately
          flat and grey, the contrast between the two states is the whole
          point, and brightening both would have destroyed it. */}
      <div
        className={`w-16 h-16 rounded-full ${hasUnviewed
          ? 'p-[3px] bg-gradient-to-tr from-fuchsia-500 via-pink-500 to-amber-400'
          : 'p-[2px] bg-white/15'}`}
        style={hasUnviewed ? { boxShadow: '0 0 12px rgba(236,72,153,0.45)' } : undefined}
      >
        <div className="relative w-full h-full rounded-full overflow-hidden bg-black border-2 border-black">
          {src
            ? <img src={src} alt={artist.artist_name} className={cls} />
            : <div className="w-full h-full bg-white/10 flex items-center justify-center text-sm font-bold text-white/40">
                {artist.artist_name?.[0]}
              </div>}
          {/* An expanded bubble for audio or video has no still to show, so it
              says which it is rather than looking like a duplicate of the one
              beside it. */}
          {badge && (
            <span className="absolute bottom-0 right-0 w-5 h-5 rounded-full bg-black/80 border border-white/15 flex items-center justify-center">
              {badge === 'video'
                ? <Video className="w-2.5 h-2.5 text-white/70" />
                : <Music className="w-2.5 h-2.5 text-white/70" />}
            </span>
          )}
        </div>
      </div>
      <span className={`text-[10px] truncate max-w-[68px] ${hasUnviewed ? 'text-white/80 font-semibold' : 'text-white/40'}`}>
        {label || artist.artist_name}
      </span>
    </button>
  );
}

// ── Full-screen Story Viewer ──────────────────────────────────────────────────
export function ArtistStoryView({ stories, artist, initialIndex = 0, onClose }) {
  const { user } = useAuth();
  const { tap }  = useHaptics();
  const navigate = useNavigate();
  const [idx, setIdx]               = useState(initialIndex);
  const [playing, setPlaying]       = useState(false);
  const [progress, setProgress]     = useState(0);
  const [likedIds, setLikedIds]     = useState(new Set());
  const [likeCounts, setLikeCounts] = useState({});
  const taggedAudioRef              = useRef(null);
  const audioRef                    = useRef(null);
  const videoRef                    = useRef(null);
  const progressRef                 = useRef(null);
  const DURATION_IMAGE_MS           = 5000;

  // Load liked state
  useEffect(() => {
    if (!user) return;
    const ids = stories.map(s => s.id);
    supabase.from('story_likes').select('story_id').eq('user_id', user.id).in('story_id', ids)
      .then(({ data }) => setLikedIds(new Set((data || []).map(l => l.story_id))));
    const counts = {};
    stories.forEach(s => { counts[s.id] = s.like_count || 0; });
    setLikeCounts(counts);
  }, [stories, user]);

  const handleLike = async (e) => {
    e.stopPropagation();
    if (!user || !story) return;
    const storyId = story.id;
    const isLiked = likedIds.has(storyId);
    setLikedIds(prev => { const n = new Set(prev); isLiked ? n.delete(storyId) : n.add(storyId); return n; });
    setLikeCounts(prev => ({ ...prev, [storyId]: Math.max(0, (prev[storyId] || 0) + (isLiked ? -1 : 1)) }));
    if (isLiked) {
      await supabase.from('story_likes').delete().eq('story_id', storyId).eq('user_id', user.id);
    } else {
      await supabase.from('story_likes').insert({ story_id: storyId, user_id: user.id });
      if (artist?.id) {
        supabase.from('artists').select('id, artist_name, profile_image_url, user_id').eq('user_id', user.id).maybeSingle()
          .then(({ data: liker }) => {
            if (liker && artist.user_id && artist.user_id !== user.id) {
              // .catch() on a supabase insert never fires for a database
              // error, supabase-js resolves { data, error } rather than
              // throwing, so this was a 403 nobody could see. Through the
              // RPC, and the helper reads the error.
              sendNotification(supabase, 'story like (stories)', {
                type:     'track_liked',
                artistId: artist.id,
                title:    `${liker.artist_name || 'Someone'} liked your story`,
                message:  story.caption || '',
                metadata: {
                  story_id: storyId,
                  from_artist_id: liker.id || null,
                  from_artist_name: liker.artist_name,
                  from_artist_image: liker.profile_image_url,
                },
              });
            }
          });
      }
    }
  };

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
            {storyAvatarSrc(artist)
              ? <img src={storyAvatarSrc(artist)} alt="" className={storyAvatarClass(artist)} />
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

      {/* Bottom bar, track pill + like */}
      <div className="absolute bottom-4 left-4 right-4 z-20 flex items-end justify-between">
        {story.tracks ? (
          <button
            onClick={(e) => { e.stopPropagation(); onClose(); navigate(`/track/${story.tracks.slug || story.tracks.id}`); }}
            className="inline-flex items-center space-x-2 px-3 py-2 rounded-full active:scale-95 transition"
            style={{ background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(12px)', border: '1px solid rgba(255,255,255,0.2)', maxWidth: 'calc(100% - 64px)' }}>
            {story.tracks.cover_artwork_url
              ? <img src={story.tracks.cover_artwork_url} alt="" className="w-6 h-6 rounded object-cover flex-shrink-0" />
              : <span className="text-sm flex-shrink-0">🎵</span>}
            <div className="flex flex-col min-w-0">
              <p className="text-[11px] font-bold text-white truncate">{story.tracks.title}</p>
              <p className="text-[9px] text-purple-300/80 uppercase tracking-wider">Listen now →</p>
            </div>
          </button>
        ) : (
          <button
            onClick={(e) => { e.stopPropagation(); onClose(); navigate(`/artist/${artist.slug}`); }}
            className="inline-flex items-center space-x-2 px-3 py-2 rounded-full active:scale-95 transition"
            style={{ background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(12px)', border: '1px solid rgba(255,255,255,0.15)' }}>
            <p className="text-[11px] font-semibold text-white/70">{artist.artist_name}</p>
            <p className="text-[9px] text-purple-300/60">View profile →</p>
          </button>
        )}

        <button onClick={handleLike} className="flex flex-col items-center space-y-0.5 active:scale-90 transition ml-3 flex-shrink-0">
          <div className="w-11 h-11 rounded-full flex items-center justify-center"
            style={{ background: 'rgba(0,0,0,0.5)', border: '1px solid rgba(255,255,255,0.15)' }}>
            <Heart className="w-5 h-5 transition-all"
              style={likedIds.has(story.id)
                ? { fill: '#f43f5e', color: '#f43f5e' }
                : { color: 'rgba(255,255,255,0.7)' }} />
          </div>
          {(likeCounts[story.id] || 0) > 0 && (
            <span className="text-[10px] font-semibold text-white/50">{likeCounts[story.id]}</span>
          )}
        </button>
      </div>

      {/* Caption */}
      {story.caption && (
        <div className="px-5 pt-2 pb-20 flex-shrink-0">
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
        // Pins the platform's own stories to the front of the rail. This
        // already existed and reads an env var; migration 191 creates the
        // artist it is meant to point at, looked up by the slug
        // 'feelz-machine'. Set REACT_APP_PLATFORM_ARTIST_ID to that id, or
        // leave it unset and the pin simply does nothing, which is what it
        // has been doing.
        const platformArtistId = process.env.REACT_APP_PLATFORM_ARTIST_ID;

        // Get all active (non-expired) stories
        // visibleNow, not a bare expires_at check.
        //
        // This is the fifth story read in the app and the one that was missed
        // when publish_at was added, because it lives in a different component
        // in this same file rather than in one of the pages. It is also the
        // widest: no artist filter, limit 100, every live story on the
        // platform. Left as it was, it is the one surface that would have
        // shown December's planned stories in September, to the two people
        // the database policy exempts.
        const { data: stories } = await visibleNow(
          supabase
            .from('artist_stories')
            .select('*, tracks:tagged_track_id(id, title, slug, file_url, cover_artwork_url), artists(id, artist_name, slug, profile_image_url, user_id)'))
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

        // Pin the platform's stories first.
        //
        // This matched on REACT_APP_PLATFORM_ARTIST_ID alone, which is not
        // set, so the pin has never once fired. isPlatformArtist falls back to
        // the slug migration 191 creates, which needs no configuration and
        // cannot drift per environment.
        const platformIdx = groupList.findIndex(g => isPlatformArtist(g.artist, platformArtistId));
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

  // ── What the rail actually shows ──────────────────────────────────────────
  //
  // Grouped by artist once enough artists are posting, expanded to one bubble
  // per story when they are not. See StoryBubble for why.
  //
  // EXPAND_BELOW is 3 because 2 bubbles in a full width panel still reads as
  // empty and 3 reads as a row. Capped at MAX_EXPANDED so a day when the
  // platform posts twenty times does not produce a rail nobody can scroll to
  // the end of.
  const EXPAND_BELOW = 3;
  const MAX_EXPANDED = 12;

  const expanded = storyGroups.length < EXPAND_BELOW;

  const bubbles = expanded
    ? storyGroups.flatMap(({ artist, stories }) =>
        stories.map((story, idx) => ({
          key:   story.id,
          artist,
          // The viewer still receives the whole group, so opening the third
          // bubble starts on the third story and carries on through the rest
          // rather than closing after one.
          stories,
          idx,
          story,
          label: story.caption?.trim() || artist.artist_name,
        }))
      ).slice(0, MAX_EXPANDED)
    : storyGroups.map(({ artist, stories }) => ({
        key: artist.id, artist, stories, idx: 0, story: null, label: null,
      }));

  return (
    <>
      {/* Given a heading and real vertical space.
          On Home this sat directly under "Welcome back" as a lone avatar with
          no label and no margin, it looked like a stray account chip rather
          than a row of stories, which is exactly how it was being read. Every
          other rail on that page has a labelled header; this one now matches. */}
      <div className="mb-5">
        <div className="flex items-center space-x-2 mb-3 px-6">
          <Sparkles className="w-3.5 h-3.5 text-pink-400/70" />
          <span className="section-label">Stories</span>
          <span className="text-[10px] text-white/25">24h</span>
        </div>
        <div className="flex space-x-4 overflow-x-auto px-6 pb-1 scrollbar-hide" style={{ WebkitOverflowScrolling: 'touch' }}>
        {bubbles.map(({ key, artist, stories, idx, story, label }) => (
          <StoryBubble
            key={key}
            artist={artist}
            stories={stories}
            story={story}
            label={label}
            viewed={viewedIds}
            onClick={() => setViewing({ artist, stories, idx })}
          />
        ))}
        </div>
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