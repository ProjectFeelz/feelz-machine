import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { useAuth } from '../contexts/AuthContext';
import {
  Upload, Trash2, Loader, Plus, Save, Music,
  Edit, Search, X, Zap, Disc, AlertCircle
} from 'lucide-react';
import CollaboratorSearch from '../components/CollaboratorSearch';
import TierGate from '../components/TierGate';
import { useAudioConverter } from '../hooks/useAudioConverter';

// ─── Constants ────────────────────────────────────────────────────────────────

const GENRES = [
  'Hip Hop','Trap','Drill','Boom Bap','Lo-Fi','R&B','Neo Soul','Pop',
  'Electronic','House','Deep House','Tech House','Techno','Dubstep',
  'Drum & Bass','Ambient','Downtempo','Future Bass','Jersey Club',
  'Jazz','Funk','Soul','Rock','Metal','Indie','Alternative',
  'Afrobeat','Amapiano','Reggae','Dancehall','Latin','Reggaeton',
  'Country','EDM','Trance','Hardstyle','UK Garage','Grime',
  'Experimental','Vaporwave','Synthwave','Other',
];

const MOODS = [
  'Dark','Happy','Sad','Aggressive','Chill','Energetic','Melancholic',
  'Uplifting','Mysterious','Peaceful','Intense','Dreamy','Romantic',
  'Angry','Hopeful','Nostalgic','Epic','Smooth','Bouncy','Atmospheric',
  'Moody','Vibey','Hard','Soft','Ethereal','Groovy','Other',
];

const VERSION_TYPES = [
  { value: 'original',     label: 'Original Mix' },
  { value: 'radio_edit',   label: 'Radio Edit' },
  { value: 'acoustic',     label: 'Acoustic' },
  { value: 'live',         label: 'Live Performance' },
  { value: 'remix',        label: 'Remix' },
  { value: 'instrumental', label: 'Instrumental' },
  { value: 'acapella',     label: 'Acapella' },
  { value: 'extended',     label: 'Extended Version' },
  { value: 'clean',        label: 'Clean Version' },
];

const ALBUM_TYPES = ['ep', 'album', 'mixtape', 'live', 'compilation'];

const BLANK_TRACK = {
  title: '', genre: '', mood: '', lyrics: '',
  is_explicit: false, is_downloadable: true, is_published: true,
  is_premium: false, download_price: '0', featured: false,
  pay_what_you_want: false, minimum_price: '0',
  is_preorder: false, release_date: null,
  track_number: '1', audio_file: null, cover_file: null, has_versions: false,
};

const BLANK_RELEASE = {
  release_type: 'single',
  album_title: '',
  album_description: '',
  album_cover_file: null,
  album_release_date: '',
  album_price: '0',
  album_is_published: true,
};

function slugify(text) {
  const base = text.toString().toLowerCase().trim()
    .replace(/\s+/g, '-').replace(/[^\w\-]+/g, '').replace(/\-\-+/g, '-');
  return `${base}-${Date.now().toString(36)}`;
}

// ─── Small reusable components ────────────────────────────────────────────────

function Toggle({ value, onChange }) {
  return (
    <div
      className={`w-8 h-5 rounded-full transition-colors flex items-center px-0.5 cursor-pointer ${value ? 'bg-white' : 'bg-white/10'}`}
      onClick={onChange}>
      <div className={`w-4 h-4 rounded-full transition-transform ${value ? 'translate-x-3 bg-black' : 'translate-x-0 bg-white/30'}`} />
    </div>
  );
}

function ConversionBanner({ progress }) {
  return (
    <div className="rounded-lg p-3 bg-purple-500/10 border border-purple-500/20 space-y-2">
      <div className="flex items-center space-x-2">
        <Zap className="w-3.5 h-3.5 text-purple-400 flex-shrink-0" />
        <p className="text-xs text-purple-400 font-medium">Converting WAV to MP3 (320kbps)… {progress}%</p>
      </div>
      <div className="w-full h-1.5 bg-white/10 rounded-full overflow-hidden">
        <div className="h-full bg-purple-400 rounded-full transition-all duration-300" style={{ width: `${progress}%` }} />
      </div>
    </div>
  );
}

function FieldLabel({ children }) {
  return <label className="block text-xs text-white/40 mb-1.5">{children}</label>;
}

function FInput({ className = '', ...props }) {
  return (
    <input {...props}
      className={`w-full px-3 py-2.5 bg-white/[0.06] rounded-lg text-white text-sm outline-none focus:bg-white/[0.1] transition ${className}`} />
  );
}

function FSelect({ children, className = '', ...props }) {
  return (
    <select {...props}
      className={`w-full px-3 py-2.5 bg-white/[0.06] rounded-lg text-white text-sm outline-none ${className}`}>
      {children}
    </select>
  );
}

// ─── Versions editor ──────────────────────────────────────────────────────────

function VersionsEditor({ versions, setVersions }) {
  const add    = () => setVersions([...versions, { version_name: '', version_type: 'remix', file: null }]);
  const remove = (i) => setVersions(versions.filter((_, idx) => idx !== i));
  const update = (i, field, val) => { const n = [...versions]; n[i][field] = val; setVersions(n); };

  if (!versions.length) return (
    <button type="button" onClick={add}
      className="flex items-center space-x-1 px-3 py-1.5 bg-white/[0.06] rounded-lg text-xs text-white/60 hover:bg-white/[0.1] transition">
      <Plus className="w-3 h-3" /><span>Add Version</span>
    </button>
  );
  return (
    <div className="space-y-2">
      {versions.map((ver, i) => (
        <div key={i} className="grid grid-cols-1 md:grid-cols-3 gap-2 p-3 bg-white/[0.03] rounded-lg">
          <input type="text" placeholder="Version name" value={ver.version_name}
            onChange={(e) => update(i, 'version_name', e.target.value)}
            className="px-3 py-2 bg-white/[0.06] rounded-lg text-white text-sm outline-none" />
          <select value={ver.version_type} onChange={(e) => update(i, 'version_type', e.target.value)}
            className="px-3 py-2 bg-white/[0.06] rounded-lg text-white text-sm outline-none">
            {VERSION_TYPES.map(v => <option key={v.value} value={v.value}>{v.label}</option>)}
          </select>
          <div className="flex items-center space-x-2">
            <input type="file" accept=".wav,.mp3,.flac,.m4a"
              onChange={(e) => update(i, 'file', e.target.files[0])}
              className="flex-1 text-xs text-white/40 file:mr-2 file:py-1.5 file:px-2 file:rounded file:border-0 file:bg-white/[0.06] file:text-white/50 file:text-xs" />
            <button type="button" onClick={() => remove(i)}
              className="p-1.5 bg-red-500/10 rounded hover:bg-red-500/20 transition">
              <Trash2 className="w-3.5 h-3.5 text-red-400" />
            </button>
          </div>
        </div>
      ))}
      <button type="button" onClick={add}
        className="flex items-center space-x-1 px-3 py-1.5 bg-white/[0.06] rounded-lg text-xs text-white/60 hover:bg-white/[0.1] transition">
        <Plus className="w-3 h-3" /><span>Add Another Version</span>
      </button>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function TrackUploadPanel() {
  const { artist } = useAuth();
  const { convert, converting, progress: convProgress, error: convError } = useAudioConverter();

  const [activeTab, setActiveTab]   = useState('upload');
  const [albums, setAlbums]         = useState([]);
  const [tracks, setTracks]         = useState([]);
  const [filteredTracks, setFilteredTracks] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading]       = useState(false);
  const [uploading, setUploading]   = useState(false);
  const [message, setMessage]       = useState({ type: '', text: '' });

  // Upload state
  const [release, setRelease]                   = useState(BLANK_RELEASE);
  const [trackForm, setTrackForm]               = useState(BLANK_TRACK);
  const [versionFiles, setVersionFiles]         = useState([]);
  const [collaborators, setCollaborators]       = useState([]);
  const [albumCollaborators, setAlbumCollaborators] = useState([]);
  const [albumTrackQueue, setAlbumTrackQueue]   = useState([]);
  const [sessionAlbumId, setSessionAlbumId]     = useState(null);
  const [addingAnother, setAddingAnother]       = useState(false);

  // Edit state
  const [editingId, setEditingId]               = useState(null);
  const [editForm, setEditForm]                 = useState({});
  const [editCollaborators, setEditCollaborators] = useState([]);
  const [editCoverFile, setEditCoverFile]       = useState(null);
  const [editAudioFile, setEditAudioFile]       = useState(null);

  const isAlbumRelease = ALBUM_TYPES.includes(release.release_type);
  const isWorking      = uploading || converting;

  useEffect(() => { if (artist) fetchAlbums(); }, [artist]);
  useEffect(() => { if (activeTab === 'manage') fetchTracks(); }, [activeTab]);
  useEffect(() => {
    setFilteredTracks(searchTerm
      ? tracks.filter(t =>
          t.title?.toLowerCase().includes(searchTerm.toLowerCase()) ||
          t.genre?.toLowerCase().includes(searchTerm.toLowerCase()))
      : tracks);
  }, [searchTerm, tracks]);

  const showMessage = (type, text) => {
    setMessage({ type, text });
    setTimeout(() => setMessage({ type: '', text: '' }), 5000);
  };

  const fetchAlbums = async () => {
    const { data } = await supabase.from('albums').select('*')
      .eq('artist_id', artist.id).order('created_at', { ascending: false });
    setAlbums(data || []);
  };

  const fetchTracks = async () => {
    setLoading(true);
    const { data } = await supabase.from('tracks').select('*, albums(title)')
      .eq('artist_id', artist.id).order('created_at', { ascending: false });
    setTracks(data || []); setFilteredTracks(data || []);
    setLoading(false);
  };

  const uploadFile = async (file, folder = '', retries = 3) => {
    const fileExt  = file.name.split('.').pop();
    const fileName = `${folder}${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;
    for (let attempt = 1; attempt <= retries; attempt++) {
      const { error } = await supabase.storage.from('feelz-samples').upload(fileName, file);
      if (!error) {
        const { data: { publicUrl } } = supabase.storage.from('feelz-samples').getPublicUrl(fileName);
        return publicUrl;
      }
      const is503 = error?.statusCode === 503 || error?.message?.includes('503');
      if (attempt < retries && is503) { await new Promise(r => setTimeout(r, 1500 * attempt)); continue; }
      throw new Error(is503 ? 'Upload service temporarily unavailable.' : error.message);
    }
  };

  const convertAndUploadAudio = async (file, folder = 'tracks/') => {
    const ext = file.name.split('.').pop().toLowerCase();
    if (ext === 'wav') {
      showMessage('info', 'Converting WAV to MP3 (320kbps)…');
      const mp3 = await convert(file);
      if (!mp3) throw new Error('Audio conversion failed. Please try again.');
      showMessage('info', 'Uploading MP3…');
      return uploadFile(mp3, folder);
    }
    showMessage('info', 'Uploading audio…');
    return uploadFile(file, folder);
  };

  const saveCollaborations = async (trackId, collabArr) => {
    for (const collab of collabArr) {
      try {
        const { data: cd, error } = await supabase.from('collaborations').insert([{
          track_id: trackId, artist_id: collab.artist_id, role: collab.role,
          split_percent: collab.split_percent, status: 'pending', invited_by: artist.id,
        }]).select().single();
        if (error) continue;
        await supabase.from('collab_requests').insert([{
          collaboration_id: cd.id, from_artist_id: artist.id,
          to_artist_id: collab.artist_id, track_id: trackId,
          message: collab.message || null, status: 'pending',
        }]);
      } catch {}
    }
  };

  const ensureAlbum = async () => {
    if (sessionAlbumId) return sessionAlbumId;
    if (!release.album_title.trim()) throw new Error('Album title is required');
    showMessage('info', 'Creating album…');
    let coverUrl = null;
    if (release.album_cover_file) coverUrl = await uploadFile(release.album_cover_file, 'album-covers/');
    const { data, error } = await supabase.from('albums').insert([{
      artist_id:         artist.id,
      title:             release.album_title.trim(),
      slug:              slugify(release.album_title),
      description:       release.album_description || null,
      cover_artwork_url: coverUrl,
      release_date:      release.album_release_date || null,
      release_type:      release.release_type,
      is_published:      release.album_is_published,
      price:             parseFloat(release.album_price) || 0,
    }]).select().single();
    if (error) throw error;
    if (albumCollaborators.length > 0) {
      for (const collab of albumCollaborators) {
        try {
          const { data: cd } = await supabase.from('collaborations').insert([{
            album_id: data.id, artist_id: collab.artist_id, role: collab.role,
            split_percent: collab.split_percent, status: 'pending', invited_by: artist.id,
          }]).select().single();
          await supabase.from('collab_requests').insert([{
            collaboration_id: cd.id, from_artist_id: artist.id,
            to_artist_id: collab.artist_id, message: collab.message || null, status: 'pending',
          }]);
        } catch {}
      }
    }
    setSessionAlbumId(data.id);
    await fetchAlbums();
    return data.id;
  };

  const handleUpload = async (e) => {
    e.preventDefault();
    if (!trackForm.audio_file) { showMessage('error', 'Audio file is required'); return; }
    if (!trackForm.title.trim()) { showMessage('error', 'Track title is required'); return; }
    if (!artist) { showMessage('error', 'No artist profile found'); return; }
    setUploading(true);
    try {
      let albumId = null;
      if (isAlbumRelease) albumId = await ensureAlbum();

      const fileUrl = await convertAndUploadAudio(trackForm.audio_file, 'tracks/');
      let coverUrl = null;
      if (trackForm.cover_file) {
        showMessage('info', 'Uploading cover artwork…');
        coverUrl = await uploadFile(trackForm.cover_file, 'covers/');
      }

      showMessage('info', 'Saving track…');
      const { data, error } = await supabase.from('tracks').insert([{
        artist_id:         artist.id,
        album_id:          albumId,
        title:             trackForm.title.trim(),
        slug:              slugify(trackForm.title),
        genre:             trackForm.genre,
        mood:              trackForm.mood,
        lyrics:            trackForm.lyrics || null,
        file_url:          fileUrl,
        cover_artwork_url: coverUrl,
        track_number:      parseInt(trackForm.track_number) || (albumTrackQueue.length + 1),
        is_explicit:       trackForm.is_explicit,
        is_downloadable:   trackForm.is_downloadable,
        is_published:      trackForm.is_published,
        is_premium:        trackForm.is_premium,
        download_price:    parseFloat(trackForm.download_price) || 0,
        featured:          trackForm.featured,
        has_versions:      trackForm.has_versions,
        pay_what_you_want: trackForm.pay_what_you_want || false,
        minimum_price:     parseFloat(trackForm.minimum_price) > 0 ? parseFloat(trackForm.minimum_price) : null,
        is_preorder:       trackForm.is_preorder || false,
        release_date:      trackForm.is_preorder && trackForm.release_date ? trackForm.release_date : null,
      }]).select();
      if (error) throw error;
      const trackId = data[0].id;

      if (trackForm.has_versions && versionFiles.length > 0) {
        for (const ver of versionFiles) {
          if (ver.file) {
            showMessage('info', `Uploading version: ${ver.version_name}…`);
            const verUrl = await convertAndUploadAudio(ver.file, 'versions/');
            await supabase.from('track_versions').insert([{
              track_id: trackId, version_name: ver.version_name,
              version_type: ver.version_type, file_url: verUrl,
            }]);
          }
        }
      }

      if (collaborators.length > 0) {
        showMessage('info', 'Sending collab requests…');
        await saveCollaborations(trackId, collaborators);
      }

      if (trackForm.is_published) {
        try {
          const { data: followers } = await supabase.from('follows')
            .select('follower_id').eq('artist_id', artist.id);
          if (followers?.length > 0) {
            await supabase.from('notifications').insert(followers.map(f => ({
              user_id: f.follower_id, artist_id: artist.id, type: 'new_track',
              title: `${artist.artist_name} uploaded a new track`,
              body: trackForm.title, track_id: trackId,
              metadata: { track_title: trackForm.title, artist_name: artist.artist_name },
            })));
          }
        } catch {}
      }

      if (isAlbumRelease) {
        setAlbumTrackQueue(prev => [...prev, {
          id: trackId, title: trackForm.title,
          cover_artwork_url: coverUrl, _uploaded: true,
        }]);
        showMessage('success', `"${trackForm.title}" added!`);
        setTrackForm({ ...BLANK_TRACK, track_number: String(albumTrackQueue.length + 2) });
        setVersionFiles([]); setCollaborators([]);
        setAddingAnother(false);
      } else {
        showMessage('success', 'Track uploaded successfully!');
        resetAll();
      }
      fetchTracks();
    } catch (err) {
      showMessage('error', 'Upload failed: ' + err.message);
    }
    setUploading(false);
  };

  const resetAll = () => {
    setRelease(BLANK_RELEASE);
    setTrackForm(BLANK_TRACK);
    setVersionFiles([]); setCollaborators([]);
    setAlbumCollaborators([]); setAlbumTrackQueue([]);
    setSessionAlbumId(null); setAddingAnother(false);
  };

  const finishAlbum = () => {
    showMessage('success', `${release.release_type.toUpperCase()} published with ${albumTrackQueue.length} track${albumTrackQueue.length !== 1 ? 's' : ''}!`);
    resetAll();
  };

  const startEdit = async (track) => {
    setEditingId(track.id);
    setEditCoverFile(null); setEditAudioFile(null);
    setEditForm({
      title: track.title, genre: track.genre || '', mood: track.mood || '',
      lyrics: track.lyrics || '', is_explicit: track.is_explicit,
      is_downloadable: track.is_downloadable, is_published: track.is_published,
      is_premium: track.is_premium, download_price: track.download_price || 0,
      featured: track.featured, pay_what_you_want: track.pay_what_you_want || false,
      minimum_price: track.minimum_price?.toString() || '0',
      album_id: track.album_id || '', track_number: track.track_number || 1,
      is_preorder: track.is_preorder || false, release_date: track.release_date || null,
      has_versions: track.has_versions || false, cover_artwork_url: track.cover_artwork_url || '',
    });
    const { data } = await supabase.from('collaborations')
      .select('*, artists(artist_name, profile_image_url)').eq('track_id', track.id);
    setEditCollaborators((data || []).map(c => ({
      artist_id: c.artist_id, artist_name: c.artists?.artist_name,
      role: c.role, split_percent: c.split_percent,
    })));
  };

  const saveEdit = async (id) => {
    setUploading(true);
    try {
      let coverUrl = editForm.cover_artwork_url || '';
      let audioUrl = null;
      if (editCoverFile) coverUrl = await uploadFile(editCoverFile, 'covers/');
      if (editAudioFile) audioUrl = await convertAndUploadAudio(editAudioFile, 'tracks/');
      if (editCollaborators.length > 0) {
        await supabase.from('collaborations').delete().eq('track_id', id);
        for (const collab of editCollaborators) {
          await supabase.from('collaborations').insert({
            track_id: id, artist_id: collab.artist_id, role: collab.role,
            split_percent: collab.split_percent, status: 'pending', invited_by: artist.id,
          });
        }
      }
      const { error } = await supabase.from('tracks').update({
        title: editForm.title, slug: slugify(editForm.title),
        genre: editForm.genre, mood: editForm.mood, lyrics: editForm.lyrics,
        is_explicit: editForm.is_explicit, is_downloadable: editForm.is_downloadable,
        is_published: editForm.is_published, is_premium: editForm.is_premium,
        download_price: parseFloat(editForm.download_price) || 0,
        featured: editForm.featured, pay_what_you_want: editForm.pay_what_you_want || false,
        minimum_price: parseFloat(editForm.minimum_price) > 0 ? parseFloat(editForm.minimum_price) : null,
        album_id: editForm.album_id || null, track_number: parseInt(editForm.track_number) || 1,
        cover_artwork_url: coverUrl, ...(audioUrl && { file_url: audioUrl }),
        is_preorder: editForm.is_preorder || false,
        release_date: editForm.is_preorder && editForm.release_date ? editForm.release_date : null,
        has_versions: editForm.has_versions || false,
        updated_at: new Date().toISOString(),
      }).eq('id', id);
      if (error) throw error;
      showMessage('success', 'Track updated!');
      setEditingId(null); setEditCoverFile(null); setEditAudioFile(null);
      fetchTracks();
    } catch (err) {
      showMessage('error', 'Failed: ' + err.message);
    } finally { setUploading(false); }
  };

  const deleteTrack = async (id, title) => {
    if (!window.confirm(`Delete "${title}"? This cannot be undone.`)) return;
    try {
      const { error } = await supabase.from('tracks').delete().eq('id', id);
      if (error) throw error;
      showMessage('success', 'Track deleted');
      fetchTracks();
    } catch (err) { showMessage('error', 'Failed: ' + err.message); }
  };

  if (!artist) return (
    <div className="text-center py-20">
      <Music className="w-12 h-12 mx-auto text-white/20 mb-4" />
      <p className="text-white/40">No artist profile found.</p>
    </div>
  );

  return (
    <div className="space-y-5">

      {/* Toast */}
      {message.text && (
        <div className={`p-3 rounded-lg text-sm flex items-start space-x-2 ${
          message.type === 'success' ? 'bg-green-500/10 border border-green-500/20 text-green-400'
          : message.type === 'info'  ? 'bg-blue-500/10 border border-blue-500/20 text-blue-400'
          : 'bg-red-500/10 border border-red-500/20 text-red-400'
        }`}>
          {message.type === 'error' && <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />}
          <span>{message.text}</span>
        </div>
      )}
      {converting && <ConversionBanner progress={convProgress} />}
      {convError   && <div className="p-3 rounded-lg text-sm bg-red-500/10 border border-red-500/20 text-red-400">{convError}</div>}

      {/* Tab bar */}
      <div className="flex space-x-1 bg-white/[0.03] rounded-lg p-1">
        {[
          { key: 'upload', label: 'Upload',        icon: Upload },
          { key: 'manage', label: 'Manage Tracks',  icon: Edit },
        ].map(({ key, label, icon: Icon }) => (
          <button key={key} type="button" onClick={() => setActiveTab(key)}
            className={`flex-1 flex items-center justify-center space-x-2 py-2.5 rounded-md text-sm font-medium transition ${
              activeTab === key ? 'bg-white text-black' : 'text-white/50 hover:text-white/70'
            }`}>
            <Icon className="w-4 h-4" /><span>{label}</span>
          </button>
        ))}
      </div>

      {/* ══════════════════ UPLOAD TAB ══════════════════ */}
      {activeTab === 'upload' && (
        <form onSubmit={handleUpload} className="space-y-5">

          {/* Step 1: Release type */}
          <div className="bg-white/[0.03] rounded-xl p-5 border border-white/[0.06] space-y-3">
            <h3 className="text-sm font-semibold text-white">What are you releasing?</h3>
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
              {['single', 'ep', 'album', 'mixtape', 'live', 'compilation'].map(type => (
                <button key={type} type="button"
                  onClick={() => {
                    setRelease({ ...release, release_type: type });
                    if (sessionAlbumId && type !== release.release_type) {
                      setSessionAlbumId(null); setAlbumTrackQueue([]);
                    }
                  }}
                  className={`py-2 rounded-lg text-xs font-medium transition capitalize ${
                    release.release_type === type ? 'bg-white text-black' : 'bg-white/[0.06] text-white/50 hover:bg-white/[0.1]'
                  }`}>
                  {type}
                </button>
              ))}
            </div>
          </div>

          {/* Step 2: Album details (multi-track, not yet created) */}
          {isAlbumRelease && !sessionAlbumId && (
            <div className="bg-white/[0.03] rounded-xl p-5 border border-white/[0.06] space-y-4">
              <div className="flex items-center space-x-2">
                <Disc className="w-4 h-4 text-white/40" />
                <h3 className="text-sm font-semibold text-white capitalize">{release.release_type} Details</h3>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <FieldLabel>{release.release_type.charAt(0).toUpperCase() + release.release_type.slice(1)} Title *</FieldLabel>
                  <FInput type="text" required value={release.album_title}
                    placeholder={`Enter ${release.release_type} title…`}
                    onChange={(e) => setRelease({ ...release, album_title: e.target.value })} />
                </div>
                <div>
                  <FieldLabel>Release Date</FieldLabel>
                  <FInput type="date" value={release.album_release_date}
                    onChange={(e) => setRelease({ ...release, album_release_date: e.target.value })} />
                </div>
                <div>
                  <FieldLabel>Price (USD, 0 = free)</FieldLabel>
                  <FInput type="number" min="0" step="0.01" value={release.album_price}
                    onChange={(e) => setRelease({ ...release, album_price: e.target.value })} />
                </div>
                <div>
                  <FieldLabel>Cover Artwork</FieldLabel>
                  <input type="file" accept=".jpg,.jpeg,.png,.webp"
                    onChange={(e) => setRelease({ ...release, album_cover_file: e.target.files[0] })}
                    className="w-full text-sm text-white/60 file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border-0 file:bg-white/[0.06] file:text-white/60 file:text-sm hover:file:bg-white/[0.1]" />
                </div>
              </div>
              <div>
                <FieldLabel>Description (optional)</FieldLabel>
                <textarea rows={2} value={release.album_description}
                  onChange={(e) => setRelease({ ...release, album_description: e.target.value })}
                  className="w-full px-3 py-2.5 bg-white/[0.06] rounded-lg text-white text-sm outline-none resize-none" />
              </div>
              <label className="flex items-center space-x-2 cursor-pointer">
                <Toggle value={release.album_is_published}
                  onChange={() => setRelease({ ...release, album_is_published: !release.album_is_published })} />
                <span className="text-xs text-white/50">Published</span>
              </label>
              <TierGate feature="collaborations" inline>
                <div>
                  <FieldLabel>Album Collaborators</FieldLabel>
                  <CollaboratorSearch collaborators={albumCollaborators}
                    setCollaborators={setAlbumCollaborators} currentArtistId={artist.id} />
                </div>
              </TierGate>
            </div>
          )}

          {/* Album session summary */}
          {isAlbumRelease && sessionAlbumId && (
            <div className="bg-white/[0.03] rounded-xl p-4 border border-white/[0.06] space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <Disc className="w-4 h-4 text-white/40" />
                  <p className="text-sm font-medium text-white">{release.album_title}</p>
                  <span className="text-[10px] px-1.5 py-0.5 bg-green-500/10 text-green-400 rounded capitalize">{release.release_type}</span>
                </div>
                <span className="text-xs text-white/30">{albumTrackQueue.length} track{albumTrackQueue.length !== 1 ? 's' : ''}</span>
              </div>
              {albumTrackQueue.map((t, i) => (
                <div key={t.id} className="flex items-center space-x-3 p-2 bg-white/[0.03] rounded-lg">
                  <span className="text-xs text-white/20 w-4 text-center">{i + 1}</span>
                  <div className="w-7 h-7 rounded-md overflow-hidden bg-white/10 flex-shrink-0">
                    {t.cover_artwork_url
                      ? <img src={t.cover_artwork_url} alt="" className="w-full h-full object-cover" />
                      : <div className="w-full h-full flex items-center justify-center"><Music className="w-3 h-3 text-white/20" /></div>}
                  </div>
                  <p className="text-sm text-white flex-1 truncate">{t.title}</p>
                  <span className="text-[10px] text-green-400">✓</span>
                </div>
              ))}
            </div>
          )}

          {/* Add another / Done controls (after first track of album) */}
          {isAlbumRelease && albumTrackQueue.length > 0 && !addingAnother ? (
            <div className="space-y-2">
              <button type="button" onClick={() => {
                setAddingAnother(true);
                setTrackForm({ ...BLANK_TRACK, track_number: String(albumTrackQueue.length + 1) });
              }}
                className="w-full py-3 bg-white/[0.06] text-white/70 font-medium rounded-lg hover:bg-white/[0.1] transition flex items-center justify-center space-x-2">
                <Plus className="w-4 h-4" /><span>Add Another Track</span>
              </button>
              <button type="button" onClick={finishAlbum}
                className="w-full py-3 bg-white text-black font-semibold rounded-lg hover:bg-white/90 transition">
                Done — Publish {release.release_type.toUpperCase()}
              </button>
            </div>
          ) : (
            /* ── Track form ── */
            <div className="bg-white/[0.03] rounded-xl p-5 border border-white/[0.06] space-y-4">
              <h3 className="text-sm font-semibold text-white">
                {isAlbumRelease
                  ? albumTrackQueue.length === 0 ? 'First Track' : `Track ${albumTrackQueue.length + 1}`
                  : 'Track Details'}
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <FieldLabel>Track Title *</FieldLabel>
                  <FInput type="text" required value={trackForm.title}
                    onChange={(e) => setTrackForm({ ...trackForm, title: e.target.value })} />
                </div>
                {/* Single: show optional album dropdown */}
                {!isAlbumRelease && (
                  <div>
                    <FieldLabel>Add to Existing Album (optional)</FieldLabel>
                    <FSelect value={trackForm.album_id || ''}
                      onChange={(e) => setTrackForm({ ...trackForm, album_id: e.target.value })}>
                      <option value="">No Album (Single)</option>
                      {albums.map(a => <option key={a.id} value={a.id}>{a.title}</option>)}
                    </FSelect>
                  </div>
                )}
                <div>
                  <FieldLabel>Genre</FieldLabel>
                  <FSelect value={trackForm.genre}
                    onChange={(e) => setTrackForm({ ...trackForm, genre: e.target.value })}>
                    <option value="">Select genre…</option>
                    {GENRES.map(g => <option key={g} value={g}>{g}</option>)}
                  </FSelect>
                </div>
                <div>
                  <FieldLabel>Mood</FieldLabel>
                  <FSelect value={trackForm.mood}
                    onChange={(e) => setTrackForm({ ...trackForm, mood: e.target.value })}>
                    <option value="">Select mood…</option>
                    {MOODS.map(m => <option key={m} value={m}>{m}</option>)}
                  </FSelect>
                </div>
                {isAlbumRelease && (
                  <div>
                    <FieldLabel>Track Number</FieldLabel>
                    <FInput type="number" min="1" value={trackForm.track_number}
                      onChange={(e) => setTrackForm({ ...trackForm, track_number: e.target.value })} />
                  </div>
                )}
                <TierGate feature="download_sales" inline>
                  <div>
                    <FieldLabel>Download Price (USD)</FieldLabel>
                    <FInput type="number" min="0" step="0.01" value={trackForm.download_price}
                      onChange={(e) => setTrackForm({ ...trackForm, download_price: e.target.value })} />
                  </div>
                </TierGate>
                {trackForm.is_downloadable && parseFloat(trackForm.download_price) > 0 && (
                  <div className="md:col-span-2 space-y-2">
                    <div className="flex items-center space-x-3">
                      <Toggle value={trackForm.pay_what_you_want}
                        onChange={() => setTrackForm({ ...trackForm, pay_what_you_want: !trackForm.pay_what_you_want })} />
                      <span className="text-xs text-white/50">Pay What You Want</span>
                    </div>
                    {trackForm.pay_what_you_want && (
                      <div>
                        <FieldLabel>Minimum Price (0 = free)</FieldLabel>
                        <FInput type="number" min="0" step="0.01" value={trackForm.minimum_price}
                          onChange={(e) => setTrackForm({ ...trackForm, minimum_price: e.target.value })} />
                      </div>
                    )}
                  </div>
                )}
              </div>

              <TierGate feature="lyrics" inline>
                <div>
                  <FieldLabel>Lyrics (optional)</FieldLabel>
                  <textarea rows={3} value={trackForm.lyrics}
                    onChange={(e) => setTrackForm({ ...trackForm, lyrics: e.target.value })}
                    placeholder="Paste lyrics here…"
                    className="w-full px-3 py-2.5 bg-white/[0.06] rounded-lg text-white text-sm outline-none resize-none" />
                </div>
              </TierGate>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <FieldLabel>Audio File * (.mp3, .wav, .flac)</FieldLabel>
                  <input type="file" accept=".wav,.mp3,.flac,.m4a,.ogg"
                    onChange={(e) => {
                      const f = e.target.files[0];
                      if (f && f.size > 500 * 1024 * 1024) { showMessage('error', 'File too large! Max 500MB'); return; }
                      setTrackForm({ ...trackForm, audio_file: f });
                    }}
                    className="w-full text-sm text-white/60 file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border-0 file:bg-white/[0.06] file:text-white/60 file:text-sm hover:file:bg-white/[0.1]" />
                  {trackForm.audio_file && (
                    <div className="mt-1 space-y-0.5">
                      <p className="text-xs text-white/30">{trackForm.audio_file.name} ({(trackForm.audio_file.size / (1024 * 1024)).toFixed(1)}MB)</p>
                      {trackForm.audio_file.name.toLowerCase().endsWith('.wav') && (
                        <p className="text-xs text-purple-400/70 flex items-center space-x-1">
                          <Zap className="w-3 h-3" /><span>Will be converted to MP3 at 320kbps</span>
                        </p>
                      )}
                    </div>
                  )}
                </div>
                <div>
                  <FieldLabel>Cover Artwork (.jpg, .png)</FieldLabel>
                  <input type="file" accept=".jpg,.jpeg,.png,.webp"
                    onChange={(e) => setTrackForm({ ...trackForm, cover_file: e.target.files[0] })}
                    className="w-full text-sm text-white/60 file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border-0 file:bg-white/[0.06] file:text-white/60 file:text-sm hover:file:bg-white/[0.1]" />
                </div>
              </div>

              <div className="flex flex-wrap gap-4">
                {[
                  { key: 'is_published',    label: 'Published' },
                  { key: 'featured',        label: 'Featured' },
                  { key: 'is_explicit',     label: 'Explicit' },
                  { key: 'is_downloadable', label: 'Downloadable' },
                  { key: 'has_versions',    label: 'Has Versions' },
                ].map(({ key, label }) => (
                  <label key={key} className="flex items-center space-x-2 cursor-pointer">
                    <Toggle value={trackForm[key]}
                      onChange={() => setTrackForm({ ...trackForm, [key]: !trackForm[key] })} />
                    <span className="text-xs text-white/50">{label}</span>
                  </label>
                ))}
                <TierGate feature="download_sales" inline>
                  <label className="flex items-center space-x-2 cursor-pointer">
                    <Toggle value={trackForm.is_premium}
                      onChange={() => setTrackForm({ ...trackForm, is_premium: !trackForm.is_premium })} />
                    <span className="text-xs text-white/50">Premium</span>
                  </label>
                </TierGate>
                <label className="flex items-center space-x-2 cursor-pointer">
                  <input type="checkbox" checked={trackForm.is_preorder || false}
                    onChange={() => setTrackForm({ ...trackForm, is_preorder: !trackForm.is_preorder })}
                    className="rounded border-white/20" />
                  <span className="text-xs text-white/50">Pre-order</span>
                </label>
              </div>

              {trackForm.is_preorder && (
                <div>
                  <FieldLabel>Release Date</FieldLabel>
                  <FInput type="datetime-local"
                    value={trackForm.release_date ? trackForm.release_date.substring(0, 16) : ''}
                    onChange={(e) => setTrackForm({ ...trackForm, release_date: e.target.value })} />
                </div>
              )}

              {trackForm.has_versions && (
                <div className="bg-white/[0.02] rounded-lg p-4 border border-white/[0.06] space-y-3">
                  <h4 className="text-sm font-medium text-white">Alternate Versions</h4>
                  <VersionsEditor versions={versionFiles} setVersions={setVersionFiles} />
                </div>
              )}

              <TierGate feature="collaborations" inline>
                <CollaboratorSearch collaborators={collaborators}
                  setCollaborators={setCollaborators} currentArtistId={artist.id} />
              </TierGate>

              <button type="submit" disabled={isWorking}
                className="w-full py-3 bg-white text-black font-semibold rounded-lg hover:bg-white/90 disabled:opacity-50 transition flex items-center justify-center space-x-2">
                {isWorking ? <Loader className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                <span>
                  {converting ? `Converting… ${convProgress}%`
                    : uploading ? 'Uploading…'
                    : isAlbumRelease
                      ? albumTrackQueue.length === 0
                        ? `Create ${release.release_type.toUpperCase()} & Add Track`
                        : 'Add Track'
                      : 'Upload Track'}
                </span>
              </button>

              {addingAnother && (
                <button type="button" onClick={() => setAddingAnother(false)}
                  className="w-full py-2 text-xs text-white/30 hover:text-white/50 transition">
                  Cancel — I'm done adding tracks
                </button>
              )}
            </div>
          )}

          {isAlbumRelease && albumTrackQueue.length > 0 && (
            <button type="button"
              onClick={() => { if (window.confirm('Discard this session and start over?')) resetAll(); }}
              className="w-full py-2 text-xs text-white/20 hover:text-red-400/60 transition">
              Discard & start over
            </button>
          )}
        </form>
      )}

      {/* ══════════════════ MANAGE TAB ══════════════════ */}
      {activeTab === 'manage' && (
        <div className="space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
            <input type="text" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search by title or genre…"
              className="w-full pl-10 pr-4 py-2.5 bg-white/[0.06] rounded-lg text-sm text-white placeholder-white/30 outline-none" />
          </div>

          {loading ? (
            <div className="flex justify-center py-12"><Loader className="w-6 h-6 animate-spin text-white/30" /></div>
          ) : filteredTracks.length === 0 ? (
            <div className="text-center py-12">
              <Music className="w-10 h-10 mx-auto text-white/10 mb-3" />
              <p className="text-white/30 text-sm">No tracks found</p>
            </div>
          ) : (
            <div className="space-y-2">
              {filteredTracks.map(track => (
                <div key={track.id} className="bg-white/[0.03] rounded-xl border border-white/[0.06] overflow-hidden">

                  {editingId !== track.id ? (
                    <div className="flex items-center space-x-3 p-3">
                      {track.cover_artwork_url
                        ? <img src={track.cover_artwork_url} alt="" className="w-12 h-12 rounded-lg object-cover flex-shrink-0" />
                        : <div className="w-12 h-12 rounded-lg bg-white/[0.06] flex items-center justify-center flex-shrink-0"><Music className="w-5 h-5 text-white/20" /></div>}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-white truncate">{track.title}</p>
                        <p className="text-xs text-white/40 truncate">
                          {track.genre || 'No genre'} · {track.albums?.title || 'Single'}
                        </p>
                        <div className="flex items-center flex-wrap gap-1.5 mt-1">
                          {track.is_published
                            ? <span className="text-[10px] px-1.5 py-0.5 bg-green-500/10 text-green-400 rounded">Live</span>
                            : <span className="text-[10px] px-1.5 py-0.5 bg-white/[0.06] text-white/30 rounded">Draft</span>}
                          {track.featured   && <span className="text-[10px] px-1.5 py-0.5 bg-yellow-500/10 text-yellow-400 rounded">Featured</span>}
                          {track.is_explicit && <span className="text-[10px] px-1.5 py-0.5 bg-white/[0.06] text-white/30 rounded">E</span>}
                          <span className="text-[10px] text-white/20">{track.stream_count || 0} streams</span>
                        </div>
                      </div>
                      <div className="flex items-center space-x-1 flex-shrink-0">
                        <button type="button" onClick={() => startEdit(track)}
                          className="p-2 bg-white/[0.04] rounded-lg hover:bg-white/[0.08] transition">
                          <Edit className="w-4 h-4 text-white/40" />
                        </button>
                        <button type="button" onClick={() => deleteTrack(track.id, track.title)}
                          className="p-2 bg-red-500/[0.06] rounded-lg hover:bg-red-500/[0.12] transition">
                          <Trash2 className="w-4 h-4 text-red-400/60" />
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="p-4 space-y-4">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-semibold text-white">Editing: {track.title}</p>
                        <button type="button" onClick={() => setEditingId(null)}
                          className="p-1.5 rounded-lg hover:bg-white/[0.06] transition">
                          <X className="w-4 h-4 text-white/30" />
                        </button>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div>
                          <FieldLabel>Title</FieldLabel>
                          <FInput type="text" value={editForm.title}
                            onChange={(e) => setEditForm({ ...editForm, title: e.target.value })} />
                        </div>
                        <div>
                          <FieldLabel>Album</FieldLabel>
                          <FSelect value={editForm.album_id}
                            onChange={(e) => setEditForm({ ...editForm, album_id: e.target.value })}>
                            <option value="">No Album (Single)</option>
                            {albums.map(a => <option key={a.id} value={a.id}>{a.title}</option>)}
                          </FSelect>
                        </div>
                        <div>
                          <FieldLabel>Genre</FieldLabel>
                          <FSelect value={editForm.genre}
                            onChange={(e) => setEditForm({ ...editForm, genre: e.target.value })}>
                            <option value="">None</option>
                            {GENRES.map(g => <option key={g} value={g}>{g}</option>)}
                          </FSelect>
                        </div>
                        <div>
                          <FieldLabel>Mood</FieldLabel>
                          <FSelect value={editForm.mood}
                            onChange={(e) => setEditForm({ ...editForm, mood: e.target.value })}>
                            <option value="">None</option>
                            {MOODS.map(m => <option key={m} value={m}>{m}</option>)}
                          </FSelect>
                        </div>
                        <div>
                          <FieldLabel>Track Number</FieldLabel>
                          <FInput type="number" min="1" value={editForm.track_number}
                            onChange={(e) => setEditForm({ ...editForm, track_number: e.target.value })} />
                        </div>
                        <div>
                          <FieldLabel>Download Price (USD)</FieldLabel>
                          <FInput type="number" min="0" step="0.01" value={editForm.download_price}
                            onChange={(e) => setEditForm({ ...editForm, download_price: e.target.value })} />
                        </div>
                        {parseFloat(editForm.download_price) > 0 && (
                          <div className="md:col-span-2 space-y-2">
                            <div className="flex items-center space-x-3">
                              <Toggle value={editForm.pay_what_you_want}
                                onChange={() => setEditForm({ ...editForm, pay_what_you_want: !editForm.pay_what_you_want })} />
                              <span className="text-xs text-white/50">Pay What You Want</span>
                            </div>
                            {editForm.pay_what_you_want && (
                              <div>
                                <FieldLabel>Minimum Price</FieldLabel>
                                <FInput type="number" min="0" step="0.01" value={editForm.minimum_price || '0'}
                                  onChange={(e) => setEditForm({ ...editForm, minimum_price: e.target.value })} />
                              </div>
                            )}
                          </div>
                        )}
                      </div>

                      <div>
                        <FieldLabel>Lyrics</FieldLabel>
                        <textarea rows={3} value={editForm.lyrics}
                          onChange={(e) => setEditForm({ ...editForm, lyrics: e.target.value })}
                          className="w-full px-3 py-2.5 bg-white/[0.06] rounded-lg text-white text-sm outline-none resize-none" />
                      </div>

                      <div className="flex flex-wrap gap-3">
                        {[
                          { key: 'is_published',    label: 'Published' },
                          { key: 'featured',        label: 'Featured' },
                          { key: 'is_explicit',     label: 'Explicit' },
                          { key: 'is_downloadable', label: 'Downloadable' },
                          { key: 'is_premium',      label: 'Premium' },
                          { key: 'has_versions',    label: 'Has Versions' },
                          { key: 'is_preorder',     label: 'Pre-order' },
                        ].map(({ key, label }) => (
                          <label key={key} className="flex items-center space-x-1.5 text-xs text-white/40 cursor-pointer">
                            <input type="checkbox" checked={editForm[key] || false}
                              onChange={(e) => setEditForm({ ...editForm, [key]: e.target.checked })}
                              className="rounded border-white/20" />
                            <span>{label}</span>
                          </label>
                        ))}
                      </div>

                      {editForm.is_preorder && (
                        <div>
                          <FieldLabel>Release Date</FieldLabel>
                          <FInput type="datetime-local"
                            value={editForm.release_date ? editForm.release_date.substring(0, 16) : ''}
                            onChange={(e) => setEditForm({ ...editForm, release_date: e.target.value })} />
                        </div>
                      )}

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <FieldLabel>Cover Artwork</FieldLabel>
                          <div className="flex items-center gap-3">
                            {(editCoverFile
                              ? URL.createObjectURL(editCoverFile)
                              : editForm.cover_artwork_url) && (
                              <img
                                src={editCoverFile ? URL.createObjectURL(editCoverFile) : editForm.cover_artwork_url}
                                alt="cover" className="w-12 h-12 rounded-lg object-cover flex-shrink-0" />
                            )}
                            <label className="cursor-pointer text-xs px-3 py-1.5 bg-white/[0.06] rounded-lg hover:bg-white/[0.1] text-white/60 transition">
                              Replace
                              <input type="file" accept="image/*" className="hidden"
                                onChange={(e) => setEditCoverFile(e.target.files[0])} />
                            </label>
                          </div>
                        </div>
                        <div>
                          <FieldLabel>Audio File</FieldLabel>
                          <label className="cursor-pointer text-xs px-3 py-1.5 bg-white/[0.06] rounded-lg hover:bg-white/[0.1] text-white/60 transition inline-block">
                            {editAudioFile ? editAudioFile.name : 'Replace audio…'}
                            <input type="file" accept="audio/*" className="hidden"
                              onChange={(e) => setEditAudioFile(e.target.files[0])} />
                          </label>
                          {editAudioFile?.name?.toLowerCase().endsWith('.wav') && (
                            <p className="text-xs text-purple-400/70 mt-1 flex items-center space-x-1">
                              <Zap className="w-3 h-3" /><span>Will convert to MP3 at 320kbps</span>
                            </p>
                          )}
                        </div>
                      </div>

                      <div>
                        <FieldLabel>Collaborators</FieldLabel>
                        <CollaboratorSearch collaborators={editCollaborators}
                          setCollaborators={setEditCollaborators} currentArtistId={artist.id} />
                      </div>

                      <div className="flex space-x-2 pt-1">
                        <button type="button" onClick={() => saveEdit(track.id)} disabled={isWorking}
                          className="px-5 py-2.5 bg-white text-black rounded-lg text-sm font-semibold flex items-center space-x-1.5 disabled:opacity-50 transition">
                          {isWorking ? <Loader className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                          <span>{converting ? `Converting… ${convProgress}%` : 'Save Changes'}</span>
                        </button>
                        <button type="button" onClick={() => setEditingId(null)}
                          className="px-4 py-2.5 bg-white/[0.06] text-white/60 rounded-lg text-sm transition hover:bg-white/[0.1]">
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
