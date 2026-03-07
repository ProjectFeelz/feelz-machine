import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { useAuth } from '../contexts/AuthContext';
import {
  Upload, Trash2, Loader, Plus, Save, Music,
  Edit, Search, ChevronDown, ChevronUp, X, ArrowLeft
} from 'lucide-react';
import CollaboratorSearch from '../components/CollaboratorSearch';
import { notifyCollabRequest } from '../components/notificationTriggers';
import TierGate from '../components/TierGate';

const GENRES = [
  'Hip Hop', 'Trap', 'Drill', 'Boom Bap', 'Lo-Fi', 'R&B', 'Neo Soul', 'Pop',
  'Electronic', 'House', 'Deep House', 'Tech House', 'Techno', 'Dubstep',
  'Drum & Bass', 'Ambient', 'Downtempo', 'Future Bass', 'Jersey Club',
  'Jazz', 'Funk', 'Soul', 'Rock', 'Metal', 'Indie', 'Alternative',
  'Afrobeat', 'Amapiano', 'Reggae', 'Dancehall', 'Latin', 'Reggaeton',
  'Country', 'EDM', 'Trance', 'Hardstyle', 'UK Garage', 'Grime',
  'Experimental', 'Vaporwave', 'Synthwave', 'Other'
];
const MOODS = [
  'Dark', 'Happy', 'Sad', 'Aggressive', 'Chill', 'Energetic', 'Melancholic',
  'Uplifting', 'Mysterious', 'Peaceful', 'Intense', 'Dreamy', 'Romantic',
  'Angry', 'Hopeful', 'Nostalgic', 'Epic', 'Smooth', 'Bouncy', 'Atmospheric',
  'Moody', 'Vibey', 'Hard', 'Soft', 'Ethereal', 'Groovy', 'Other'
];
const VERSION_TYPES = [
  { value: 'original', label: 'Original Mix' },
  { value: 'radio_edit', label: 'Radio Edit' },
  { value: 'acoustic', label: 'Acoustic' },
  { value: 'live', label: 'Live Performance' },
  { value: 'remix', label: 'Remix' },
  { value: 'instrumental', label: 'Instrumental' },
  { value: 'acapella', label: 'Acapella' },
  { value: 'extended', label: 'Extended Version' },
  { value: 'clean', label: 'Clean Version' },
];

function slugify(text, unique = false) {
  const base = text.toString().toLowerCase().trim()
    .replace(/\s+/g, '-').replace(/[^\w\-]+/g, '').replace(/\-\-+/g, '-');
  return unique ? `${base}-${Date.now().toString(36)}` : base;
}

const BLANK_TRACK = {
  title: '', genre: '', mood: '', lyrics: '',
  is_explicit: false, is_downloadable: true, is_published: true,
  is_premium: false, download_price: '0', featured: false,
  album_id: '', track_number: '1',
  audio_file: null, cover_file: null, has_versions: false,
};
const BLANK_ALBUM = {
  title: '', description: '', release_type: 'album',
  release_date: '', is_published: false, price: '0', cover_file: null,
};

export default function TrackUploadPanel() {
  const { artist } = useAuth();
  const [activeTab, setActiveTab] = useState('upload');
  const [albums, setAlbums] = useState([]);
  const [tracks, setTracks] = useState([]);
  const [filteredTracks, setFilteredTracks] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [editCollaborators, setEditCollaborators] = useState([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });

  // Track upload form
  const [trackForm, setTrackForm] = useState(BLANK_TRACK);
  const [versionFiles, setVersionFiles] = useState([]);
  const [collaborators, setCollaborators] = useState([]);

  // Album state — step-based wizard
  const [albumForm, setAlbumForm] = useState(BLANK_ALBUM);
  const [albumStep, setAlbumStep] = useState('list'); // 'list' | 'create' | 'tracks'
  const [activeAlbum, setActiveAlbum] = useState(null);
  const [albumCollaborators, setAlbumCollaborators] = useState([]);

  // Album inline edit
  const [editingAlbumId, setEditingAlbumId] = useState(null);
  const [editAlbumForm, setEditAlbumForm] = useState({});
  const [editAlbumCollaborators, setEditAlbumCollaborators] = useState([]);

  // Album track manager
  const [selectedAlbumId, setSelectedAlbumId] = useState('');
  const [albumTracks, setAlbumTracks] = useState([]);
  const [loadingAlbumTracks, setLoadingAlbumTracks] = useState(false);
  const [unassignedTracks, setUnassignedTracks] = useState([]);

  // Quick upload to album
  const [quickTrackForm, setQuickTrackForm] = useState(BLANK_TRACK);
  const [quickVersionFiles, setQuickVersionFiles] = useState([]);
  const [quickCollaborators, setQuickCollaborators] = useState([]);
  const [showQuickUpload, setShowQuickUpload] = useState(false);

  useEffect(() => { if (artist) fetchAlbums(); }, [artist]);
  useEffect(() => { if (activeTab === 'manage') fetchTracks(); }, [activeTab]);
  useEffect(() => {
    setFilteredTracks(searchTerm
      ? tracks.filter(t =>
          t.title?.toLowerCase().includes(searchTerm.toLowerCase()) ||
          t.genre?.toLowerCase().includes(searchTerm.toLowerCase()))
      : tracks);
  }, [searchTerm, tracks]);

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
  const fetchAlbumTracks = async (albumId) => {
    if (!albumId) { setAlbumTracks([]); setUnassignedTracks([]); return; }
    setLoadingAlbumTracks(true);
    const [{ data: inAlbum }, { data: available }] = await Promise.all([
      supabase.from('tracks').select('id, title, cover_artwork_url, track_number')
        .eq('album_id', albumId).order('track_number', { ascending: true }),
      supabase.from('tracks').select('id, title, cover_artwork_url')
        .eq('artist_id', artist.id).is('album_id', null),
    ]);
    setAlbumTracks(inAlbum || []);
    setUnassignedTracks(available || []);
    setLoadingAlbumTracks(false);
  };
  const showMessage = (type, text) => {
    setMessage({ type, text });
    setTimeout(() => setMessage({ type: '', text: '' }), 4000);
  };
  const uploadFile = async (file, folder = '') => {
    const fileExt = file.name.split('.').pop();
    const fileName = `${folder}${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;
    const { error } = await supabase.storage.from('feelz-samples').upload(fileName, file);
    if (error) throw error;
    const { data: { publicUrl } } = supabase.storage.from('feelz-samples').getPublicUrl(fileName);
    return publicUrl;
  };

  // ==================== TRACK UPLOAD ====================
  const handleTrackUpload = async (e, form = trackForm, versionsArr = versionFiles, collabArr = collaborators, isQuick = false) => {
    e.preventDefault();
    if (!form.audio_file) { showMessage('error', 'Audio file is required'); return; }
    if (!artist) { showMessage('error', 'No artist profile found'); return; }
    setUploading(true);
    try {
      showMessage('info', 'Uploading audio...');
      const fileUrl = await uploadFile(form.audio_file, 'tracks/');
      let coverUrl = null;
      if (form.cover_file) { showMessage('info', 'Uploading cover artwork...'); coverUrl = await uploadFile(form.cover_file, 'covers/'); }
      showMessage('info', 'Saving track...');
      const { data, error } = await supabase.from('tracks').insert([{
        artist_id: artist.id,
        album_id: form.album_id || null,
        title: form.title, slug: slugify(form.title, true),
        genre: form.genre, mood: form.mood, lyrics: form.lyrics || null,
        file_url: fileUrl, cover_artwork_url: coverUrl,
        track_number: parseInt(form.track_number) || 1,
        is_explicit: form.is_explicit, is_downloadable: form.is_downloadable,
        is_published: form.is_published, is_premium: form.is_premium,
        download_price: parseFloat(form.download_price) || 0,
        featured: form.featured, has_versions: form.has_versions,
      }]).select();
      if (error) throw error;
      const trackId = data[0].id;
      if (form.has_versions && versionsArr.length > 0) {
        for (const ver of versionsArr) {
          if (ver.file) {
            showMessage('info', `Uploading ${ver.version_name}...`);
            const verUrl = await uploadFile(ver.file, 'versions/');
            await supabase.from('track_versions').insert([{
              track_id: trackId, version_name: ver.version_name,
              version_type: ver.version_type, file_url: verUrl,
            }]);
          }
        }
      }
      if (collabArr.length > 0) {
        showMessage('info', 'Sending collab requests...');
        await saveCollaborations(trackId, collabArr);
      }
      showMessage('success', 'Track uploaded successfully!');
      if (isQuick) {
        setQuickTrackForm({ ...BLANK_TRACK, album_id: activeAlbum?.id || '' });
        setQuickVersionFiles([]); setQuickCollaborators([]);
        setShowQuickUpload(false);
        fetchAlbumTracks(activeAlbum?.id);
      } else {
        resetTrackForm();
      }
      fetchTracks();
    } catch (err) { showMessage('error', 'Upload failed: ' + err.message); }
    setUploading(false);
  };

  const saveCollaborations = async (trackId, collabArr) => {
    for (const collab of collabArr) {
      try {
        const { data: collabData, error: collabErr } = await supabase
          .from('collaborations').insert([{
            track_id: trackId, artist_id: collab.artist_id,
            role: collab.role, split_percent: collab.split_percent,
            status: 'pending', invited_by: artist.id,
          }]).select().single();
        if (collabErr) { console.error('Collab insert error:', collabErr); continue; }
        await supabase.from('collab_requests').insert([{
          collaboration_id: collabData.id,
          from_artist_id: artist.id, to_artist_id: collab.artist_id,
          track_id: trackId, message: collab.message || null, status: 'pending',
        }]);
      } catch (err) { console.error('Save collab error:', err); }
    }
  };

  const resetTrackForm = () => {
    setTrackForm(BLANK_TRACK);
    setVersionFiles([]); setCollaborators([]);
  };

  // ==================== ALBUM CREATE ====================
  const handleAlbumCreate = async (e) => {
    e.preventDefault();
    if (!artist) return;
    setUploading(true);
    try {
      let coverUrl = null;
      if (albumForm.cover_file) { showMessage('info', 'Uploading album artwork...'); coverUrl = await uploadFile(albumForm.cover_file, 'album-covers/'); }
      const { data, error } = await supabase.from('albums').insert([{
        artist_id: artist.id, title: albumForm.title, slug: slugify(albumForm.title, true),
        description: albumForm.description, cover_artwork_url: coverUrl,
        release_date: albumForm.release_date || null, release_type: albumForm.release_type,
        is_published: albumForm.is_published, price: parseFloat(albumForm.price) || 0,
      }]).select().single();
      if (error) throw error;
      // Album-level collaborators
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
      showMessage('success', 'Album created! Now add tracks.');
      setAlbumForm(BLANK_ALBUM); setAlbumCollaborators([]);
      await fetchAlbums();
      // Go straight to track manager for this album
      setActiveAlbum(data);
      setQuickTrackForm({ ...BLANK_TRACK, album_id: data.id });
      fetchAlbumTracks(data.id);
      setAlbumStep('tracks');
    } catch (err) { showMessage('error', 'Failed: ' + err.message); }
    setUploading(false);
  };

  // ==================== ALBUM EDIT ====================
  const startEditAlbum = async (album) => {
    setEditingAlbumId(album.id);
    setEditAlbumForm({
      title: album.title, description: album.description || '',
      release_type: album.release_type || 'album',
      release_date: album.release_date?.split('T')[0] || '',
      is_published: album.is_published,
      price: album.price?.toString() || '0',
      cover_file: null,
    });
    const { data } = await supabase.from('collaborations')
      .select('*, artists(artist_name, profile_image_url)').eq('album_id', album.id);
    setEditAlbumCollaborators((data || []).map(c => ({
      artist_id: c.artist_id, artist_name: c.artists?.artist_name,
      role: c.role, split_percent: c.split_percent,
    })));
  };

  const saveAlbumEdit = async (albumId) => {
    setUploading(true);
    try {
      let coverUrl = null;
      if (editAlbumForm.cover_file) { coverUrl = await uploadFile(editAlbumForm.cover_file, 'album-covers/'); }
      const updateData = {
        title: editAlbumForm.title, description: editAlbumForm.description,
        release_type: editAlbumForm.release_type,
        release_date: editAlbumForm.release_date || null,
        is_published: editAlbumForm.is_published,
        price: parseFloat(editAlbumForm.price) || 0,
        updated_at: new Date().toISOString(),
      };
      if (coverUrl) updateData.cover_artwork_url = coverUrl;
      const { error } = await supabase.from('albums').update(updateData).eq('id', albumId);
      if (error) throw error;
      // Replace album collaborators
      await supabase.from('collaborations').delete().eq('album_id', albumId);
      for (const collab of editAlbumCollaborators) {
        try {
          const { data: cd } = await supabase.from('collaborations').insert([{
            album_id: albumId, artist_id: collab.artist_id, role: collab.role,
            split_percent: collab.split_percent, status: 'pending', invited_by: artist.id,
          }]).select().single();
          await supabase.from('collab_requests').insert([{
            collaboration_id: cd.id, from_artist_id: artist.id,
            to_artist_id: collab.artist_id, message: collab.message || null, status: 'pending',
          }]);
        } catch {}
      }
      showMessage('success', 'Album updated!');
      setEditingAlbumId(null);
      fetchAlbums();
    } catch (err) { showMessage('error', 'Failed: ' + err.message); }
    setUploading(false);
  };

  const deleteAlbum = async (id, title) => {
    if (!window.confirm(`Delete album "${title}"? Tracks won't be deleted but will be unlinked.`)) return;
    try {
      const { error } = await supabase.from('albums').delete().eq('id', id);
      if (error) throw error;
      showMessage('success', 'Album deleted');
      fetchAlbums();
      if (activeAlbum?.id === id) { setActiveAlbum(null); setAlbumStep('list'); }
    } catch (err) { showMessage('error', 'Failed: ' + err.message); }
  };

  const removeTrackFromAlbum = async (trackId) => {
    await supabase.from('tracks').update({ album_id: null }).eq('id', trackId);
    fetchAlbumTracks(activeAlbum?.id || selectedAlbumId);
  };
  const addTrackToAlbum = async (trackId) => {
    const albumId = activeAlbum?.id || selectedAlbumId;
    await supabase.from('tracks').update({ album_id: albumId }).eq('id', trackId);
    fetchAlbumTracks(albumId);
  };

  // ==================== TRACK EDIT ====================
  const startEdit = async (track) => {
    setEditingId(track.id);
    setEditForm({
      title: track.title, genre: track.genre || '', mood: track.mood || '',
      lyrics: track.lyrics || '', is_explicit: track.is_explicit,
      is_downloadable: track.is_downloadable, is_published: track.is_published,
      is_premium: track.is_premium, download_price: track.download_price || 0,
      featured: track.featured, album_id: track.album_id || '',
      track_number: track.track_number || 1,
    });
    const { data } = await supabase.from('collaborations')
      .select('*, artists(artist_name, profile_image_url)').eq('track_id', track.id);
    setEditCollaborators((data || []).map(c => ({
      artist_id: c.artist_id, artist_name: c.artists?.artist_name,
      role: c.role, split_percent: c.split_percent,
    })));
  };

  const saveEdit = async (id) => {
    try {
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
        title: editForm.title, slug: slugify(editForm.title, true),
        genre: editForm.genre, mood: editForm.mood, lyrics: editForm.lyrics,
        is_explicit: editForm.is_explicit, is_downloadable: editForm.is_downloadable,
        is_published: editForm.is_published, is_premium: editForm.is_premium,
        download_price: parseFloat(editForm.download_price) || 0,
        featured: editForm.featured, album_id: editForm.album_id || null,
        track_number: parseInt(editForm.track_number) || 1,
        updated_at: new Date().toISOString(),
      }).eq('id', id);
      if (error) throw error;
      showMessage('success', 'Track updated!');
      setEditingId(null); fetchTracks();
    } catch (err) { showMessage('error', 'Failed: ' + err.message); }
  };

  const deleteTrack = async (id, title) => {
    if (!window.confirm(`Delete "${title}"? This cannot be undone.`)) return;
    try {
      const { error } = await supabase.from('tracks').delete().eq('id', id);
      if (error) throw error;
      showMessage('success', 'Track deleted'); fetchTracks();
    } catch (err) { showMessage('error', 'Failed: ' + err.message); }
  };

  // Version helpers
  const addVersion = (isQuick = false) => {
    const setter = isQuick ? setQuickVersionFiles : setVersionFiles;
    const arr = isQuick ? quickVersionFiles : versionFiles;
    setter([...arr, { version_name: '', version_type: 'remix', file: null }]);
  };
  const removeVersion = (i, isQuick = false) => {
    const setter = isQuick ? setQuickVersionFiles : setVersionFiles;
    const arr = isQuick ? quickVersionFiles : versionFiles;
    setter(arr.filter((_, idx) => idx !== i));
  };
  const updateVersion = (i, field, val, isQuick = false) => {
    const setter = isQuick ? setQuickVersionFiles : setVersionFiles;
    const arr = isQuick ? [...quickVersionFiles] : [...versionFiles];
    arr[i][field] = val; setter(arr);
  };

  if (!artist) return (
    <div className="text-center py-20">
      <Music className="w-12 h-12 mx-auto text-white/20 mb-4" />
      <p className="text-white/40">No artist profile found. Create one first.</p>
    </div>
  );

  const tabs = [
    { key: 'upload', label: 'Upload Track', icon: Upload },
    { key: 'albums', label: 'Albums', icon: Music },
    { key: 'manage', label: 'Manage Tracks', icon: Edit },
  ];

  // Shared track form fields component
  const TrackFormFields = ({ form, setForm }) => (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs text-white/40 mb-1.5">Track Title *</label>
          <input type="text" required value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            className="w-full px-3 py-2.5 bg-white/[0.06] rounded-lg text-white text-sm outline-none focus:bg-white/[0.1] transition" />
        </div>
        <div>
          <label className="block text-xs text-white/40 mb-1.5">Album (optional)</label>
          <select value={form.album_id} onChange={(e) => setForm({ ...form, album_id: e.target.value })}
            className="w-full px-3 py-2.5 bg-white/[0.06] rounded-lg text-white text-sm outline-none">
            <option value="">No Album (Single)</option>
            {albums.map(a => <option key={a.id} value={a.id}>{a.title}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs text-white/40 mb-1.5">Genre</label>
          <select value={form.genre} onChange={(e) => setForm({ ...form, genre: e.target.value })}
            className="w-full px-3 py-2.5 bg-white/[0.06] rounded-lg text-white text-sm outline-none">
            <option value="">Select genre...</option>
            {GENRES.map(g => <option key={g} value={g}>{g}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs text-white/40 mb-1.5">Mood</label>
          <select value={form.mood} onChange={(e) => setForm({ ...form, mood: e.target.value })}
            className="w-full px-3 py-2.5 bg-white/[0.06] rounded-lg text-white text-sm outline-none">
            <option value="">Select mood...</option>
            {MOODS.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs text-white/40 mb-1.5">Track Number</label>
          <input type="number" min="1" value={form.track_number}
            onChange={(e) => setForm({ ...form, track_number: e.target.value })}
            className="w-full px-3 py-2.5 bg-white/[0.06] rounded-lg text-white text-sm outline-none" />
        </div>
        <TierGate feature="download_sales" inline>
          <div>
            <label className="block text-xs text-white/40 mb-1.5">Download Price (USD)</label>
            <input type="number" min="0" step="0.01" value={form.download_price}
              onChange={(e) => setForm({ ...form, download_price: e.target.value })}
              className="w-full px-3 py-2.5 bg-white/[0.06] rounded-lg text-white text-sm outline-none" />
          </div>
        </TierGate>
      </div>
      <TierGate feature="lyrics" inline>
        <div>
          <label className="block text-xs text-white/40 mb-1.5">Lyrics (optional)</label>
          <textarea rows={3} value={form.lyrics} onChange={(e) => setForm({ ...form, lyrics: e.target.value })}
            placeholder="Paste lyrics here..."
            className="w-full px-3 py-2.5 bg-white/[0.06] rounded-lg text-white text-sm outline-none resize-none" />
        </div>
      </TierGate>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs text-white/40 mb-1.5">Audio File * (.mp3, .wav, .flac)</label>
          <input type="file" accept=".wav,.mp3,.flac,.m4a,.ogg"
            onChange={(e) => {
              const f = e.target.files[0];
              if (f && f.size > 500 * 1024 * 1024) { showMessage('error', 'File too large! Max 500MB'); return; }
              setForm({ ...form, audio_file: f });
            }}
            className="w-full text-sm text-white/60 file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border-0 file:bg-white/[0.06] file:text-white/60 file:text-sm hover:file:bg-white/[0.1]" />
          {form.audio_file && (
            <p className="text-xs text-white/30 mt-1">{form.audio_file.name} ({(form.audio_file.size / (1024 * 1024)).toFixed(1)}MB)</p>
          )}
        </div>
        <div>
          <label className="block text-xs text-white/40 mb-1.5">Cover Artwork (.jpg, .png)</label>
          <input type="file" accept=".jpg,.jpeg,.png,.webp"
            onChange={(e) => setForm({ ...form, cover_file: e.target.files[0] })}
            className="w-full text-sm text-white/60 file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border-0 file:bg-white/[0.06] file:text-white/60 file:text-sm hover:file:bg-white/[0.1]" />
        </div>
      </div>
      <div className="flex flex-wrap gap-4">
        {[
          { key: 'is_published', label: 'Published' },
          { key: 'featured', label: 'Featured' },
          { key: 'is_explicit', label: 'Explicit' },
          { key: 'is_downloadable', label: 'Downloadable' },
          { key: 'is_premium', label: 'Premium', premiumOnly: true },
          { key: 'has_versions', label: 'Has Versions' },
        ].map(({ key, label, premiumOnly }) => (
          <label key={key} className="flex items-center space-x-2 cursor-pointer">
            {premiumOnly ? (
              <TierGate feature="download_sales" inline>
                <div className={`w-8 h-5 rounded-full transition-colors flex items-center px-0.5 ${form[key] ? 'bg-white' : 'bg-white/10'}`}
                  onClick={() => setForm({ ...form, [key]: !form[key] })}>
                  <div className={`w-4 h-4 rounded-full transition-transform ${form[key] ? 'translate-x-3 bg-black' : 'translate-x-0 bg-white/30'}`} />
                </div>
              </TierGate>
            ) : (
              <div className={`w-8 h-5 rounded-full transition-colors flex items-center px-0.5 ${form[key] ? 'bg-white' : 'bg-white/10'}`}
                onClick={() => setForm({ ...form, [key]: !form[key] })}>
                <div className={`w-4 h-4 rounded-full transition-transform ${form[key] ? 'translate-x-3 bg-black' : 'translate-x-0 bg-white/30'}`} />
              </div>
            )}
            <span className="text-xs text-white/50">{label}</span>
          </label>
        ))}
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      {message.text && (
        <div className={`p-3 rounded-lg text-sm ${
          message.type === 'success' ? 'bg-green-500/10 border border-green-500/20 text-green-400'
          : message.type === 'info' ? 'bg-blue-500/10 border border-blue-500/20 text-blue-400'
          : 'bg-red-500/10 border border-red-500/20 text-red-400'
        }`}>{message.text}</div>
      )}

      <div className="flex space-x-1 bg-white/[0.03] rounded-lg p-1">
        {tabs.map(({ key, label, icon: Icon }) => (
          <button key={key} onClick={() => setActiveTab(key)}
            className={`flex-1 flex items-center justify-center space-x-2 py-2.5 rounded-md text-sm font-medium transition ${
              activeTab === key ? 'bg-white text-black' : 'text-white/50 hover:text-white/70'
            }`}>
            <Icon className="w-4 h-4" /><span>{label}</span>
          </button>
        ))}
      </div>

      {/* ==================== UPLOAD TAB ==================== */}
      {activeTab === 'upload' && (
        <form onSubmit={(e) => handleTrackUpload(e)} className="space-y-4">
          <div className="bg-white/[0.03] rounded-xl p-5 border border-white/[0.06] space-y-4">
            <h3 className="text-base font-semibold text-white">Track Details</h3>
            <TrackFormFields form={trackForm} setForm={setTrackForm} />
            <TierGate feature="collaborations" inline>
              <CollaboratorSearch collaborators={collaborators} setCollaborators={setCollaborators} currentArtistId={artist.id} />
            </TierGate>
            {trackForm.has_versions && (
              <div className="bg-white/[0.02] rounded-lg p-4 border border-white/[0.06] space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-medium text-white">Alternate Versions</h4>
                  <button type="button" onClick={() => addVersion(false)}
                    className="flex items-center space-x-1 px-3 py-1.5 bg-white/[0.06] rounded-lg text-xs text-white/60 hover:bg-white/[0.1] transition">
                    <Plus className="w-3 h-3" /><span>Add Version</span>
                  </button>
                </div>
                {versionFiles.map((ver, i) => (
                  <div key={i} className="grid grid-cols-1 md:grid-cols-3 gap-2 p-3 bg-white/[0.03] rounded-lg">
                    <input type="text" placeholder="Version name" value={ver.version_name}
                      onChange={(e) => updateVersion(i, 'version_name', e.target.value)}
                      className="px-3 py-2 bg-white/[0.06] rounded-lg text-white text-sm outline-none" />
                    <select value={ver.version_type} onChange={(e) => updateVersion(i, 'version_type', e.target.value)}
                      className="px-3 py-2 bg-white/[0.06] rounded-lg text-white text-sm outline-none">
                      {VERSION_TYPES.map(v => <option key={v.value} value={v.value}>{v.label}</option>)}
                    </select>
                    <div className="flex items-center space-x-2">
                      <input type="file" accept=".wav,.mp3,.flac,.m4a" onChange={(e) => updateVersion(i, 'file', e.target.files[0])}
                        className="flex-1 text-xs text-white/40 file:mr-2 file:py-1.5 file:px-2 file:rounded file:border-0 file:bg-white/[0.06] file:text-white/50 file:text-xs" />
                      <button type="button" onClick={() => removeVersion(i)}
                        className="p-1.5 bg-red-500/10 rounded hover:bg-red-500/20 transition">
                        <Trash2 className="w-3.5 h-3.5 text-red-400" />
                      </button>
                    </div>
                  </div>
                ))}
                {versionFiles.length === 0 && (
                  <p className="text-center text-white/20 text-xs py-4">No versions added. Click "Add Version" above.</p>
                )}
              </div>
            )}
            <button type="submit" disabled={uploading}
              className="w-full py-3 bg-white text-black font-semibold rounded-lg hover:bg-white/90 disabled:opacity-50 transition flex items-center justify-center space-x-2">
              {uploading ? <Loader className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
              <span>{uploading ? 'Uploading...' : 'Upload Track'}</span>
            </button>
          </div>
        </form>
      )}

      {/* ==================== ALBUMS TAB ==================== */}
      {activeTab === 'albums' && (
        <div className="space-y-6">

          {/* STEP: TRACKS for active album */}
          {albumStep === 'tracks' && activeAlbum && (
            <div className="space-y-4">
              <div className="flex items-center space-x-3">
                <button onClick={() => { setAlbumStep('list'); setActiveAlbum(null); setShowQuickUpload(false); }}
                  className="p-2 hover:bg-white/[0.06] rounded-lg transition">
                  <ArrowLeft className="w-4 h-4 text-white/40" />
                </button>
                <div className="flex items-center space-x-3 flex-1 min-w-0">
                  {activeAlbum.cover_artwork_url && (
                    <img src={activeAlbum.cover_artwork_url} alt="" className="w-10 h-10 rounded-lg object-cover flex-shrink-0" />
                  )}
                  <div className="min-w-0">
                    <h3 className="text-base font-semibold text-white truncate">{activeAlbum.title}</h3>
                    <p className="text-xs text-white/40">{activeAlbum.release_type?.toUpperCase()}</p>
                  </div>
                </div>
              </div>

              {/* Tracks in album */}
              <div className="bg-white/[0.03] rounded-xl p-4 border border-white/[0.06] space-y-3">
                <p className="text-xs text-white/40 font-medium">Tracks in this album ({albumTracks.length})</p>
                {loadingAlbumTracks ? (
                  <div className="flex justify-center py-4"><Loader className="w-4 h-4 animate-spin text-white/30" /></div>
                ) : (
                  <div className="space-y-1.5">
                    {albumTracks.map((t, i) => (
                      <div key={t.id} className="flex items-center space-x-3 p-2.5 bg-white/[0.03] rounded-lg">
                        <span className="text-xs text-white/20 w-5 flex-shrink-0 text-center">{i + 1}</span>
                        <div className="w-8 h-8 rounded-md overflow-hidden flex-shrink-0 bg-white/10">
                          {t.cover_artwork_url ? <img src={t.cover_artwork_url} alt="" className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center"><Music className="w-3 h-3 text-white/20" /></div>}
                        </div>
                        <p className="text-sm text-white flex-1 truncate">{t.title}</p>
                        <button onClick={() => removeTrackFromAlbum(t.id)} className="p-1.5 bg-red-500/10 rounded hover:bg-red-500/20 transition">
                          <X className="w-3.5 h-3.5 text-red-400" />
                        </button>
                      </div>
                    ))}
                    {albumTracks.length === 0 && <p className="text-xs text-white/20 text-center py-3">No tracks yet. Add some below.</p>}
                  </div>
                )}
              </div>

              {/* Existing singles to add */}
              {unassignedTracks.length > 0 && (
                <div className="bg-white/[0.03] rounded-xl p-4 border border-white/[0.06] space-y-3">
                  <p className="text-xs text-white/40 font-medium">Add from your existing singles</p>
                  <div className="space-y-1.5">
                    {unassignedTracks.map(t => (
                      <div key={t.id} className="flex items-center space-x-3 p-2.5 bg-white/[0.03] rounded-lg">
                        <div className="w-8 h-8 rounded-md overflow-hidden flex-shrink-0 bg-white/10">
                          {t.cover_artwork_url ? <img src={t.cover_artwork_url} alt="" className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center"><Music className="w-3 h-3 text-white/20" /></div>}
                        </div>
                        <p className="text-sm text-white flex-1 truncate">{t.title}</p>
                        <button onClick={() => addTrackToAlbum(t.id)} className="p-1.5 bg-white/10 rounded hover:bg-white/20 transition">
                          <Plus className="w-3.5 h-3.5 text-white/60" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Quick upload new track directly to album */}
              <div className="bg-white/[0.03] rounded-xl border border-white/[0.06] overflow-hidden">
                <button onClick={() => setShowQuickUpload(p => !p)}
                  className="w-full flex items-center justify-between px-5 py-4 hover:bg-white/[0.02] transition">
                  <div className="flex items-center space-x-2">
                    <Plus className="w-4 h-4 text-white/40" />
                    <span className="text-sm font-medium text-white/70">Upload new track to this album</span>
                  </div>
                  {showQuickUpload ? <ChevronUp className="w-4 h-4 text-white/30" /> : <ChevronDown className="w-4 h-4 text-white/30" />}
                </button>
                {showQuickUpload && (
                  <form onSubmit={(e) => handleTrackUpload(e, quickTrackForm, quickVersionFiles, quickCollaborators, true)}
                    className="px-5 pb-5 space-y-4 border-t border-white/[0.06]">
                    <div className="pt-4">
                      <TrackFormFields form={quickTrackForm} setForm={setQuickTrackForm} />
                    </div>
                    <TierGate feature="collaborations" inline>
                      <CollaboratorSearch collaborators={quickCollaborators} setCollaborators={setQuickCollaborators} currentArtistId={artist.id} />
                    </TierGate>
                    {quickTrackForm.has_versions && (
                      <div className="bg-white/[0.02] rounded-lg p-4 border border-white/[0.06] space-y-3">
                        <div className="flex items-center justify-between">
                          <h4 className="text-sm font-medium text-white">Alternate Versions</h4>
                          <button type="button" onClick={() => addVersion(true)}
                            className="flex items-center space-x-1 px-3 py-1.5 bg-white/[0.06] rounded-lg text-xs text-white/60 hover:bg-white/[0.1] transition">
                            <Plus className="w-3 h-3" /><span>Add Version</span>
                          </button>
                        </div>
                        {quickVersionFiles.map((ver, i) => (
                          <div key={i} className="grid grid-cols-1 md:grid-cols-3 gap-2 p-3 bg-white/[0.03] rounded-lg">
                            <input type="text" placeholder="Version name" value={ver.version_name}
                              onChange={(e) => updateVersion(i, 'version_name', e.target.value, true)}
                              className="px-3 py-2 bg-white/[0.06] rounded-lg text-white text-sm outline-none" />
                            <select value={ver.version_type} onChange={(e) => updateVersion(i, 'version_type', e.target.value, true)}
                              className="px-3 py-2 bg-white/[0.06] rounded-lg text-white text-sm outline-none">
                              {VERSION_TYPES.map(v => <option key={v.value} value={v.value}>{v.label}</option>)}
                            </select>
                            <div className="flex items-center space-x-2">
                              <input type="file" accept=".wav,.mp3,.flac,.m4a" onChange={(e) => updateVersion(i, 'file', e.target.files[0], true)}
                                className="flex-1 text-xs text-white/40 file:mr-2 file:py-1.5 file:px-2 file:rounded file:border-0 file:bg-white/[0.06] file:text-white/50 file:text-xs" />
                              <button type="button" onClick={() => removeVersion(i, true)}
                                className="p-1.5 bg-red-500/10 rounded hover:bg-red-500/20 transition">
                                <Trash2 className="w-3.5 h-3.5 text-red-400" />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                    <button type="submit" disabled={uploading}
                      className="w-full py-3 bg-white text-black font-semibold rounded-lg hover:bg-white/90 disabled:opacity-50 transition flex items-center justify-center space-x-2">
                      {uploading ? <Loader className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                      <span>{uploading ? 'Uploading...' : 'Upload to Album'}</span>
                    </button>
                  </form>
                )}
              </div>
            </div>
          )}

          {/* STEP: CREATE */}
          {albumStep === 'create' && (
            <div className="space-y-4">
              <div className="flex items-center space-x-3 mb-2">
                <button onClick={() => setAlbumStep('list')} className="p-2 hover:bg-white/[0.06] rounded-lg transition">
                  <ArrowLeft className="w-4 h-4 text-white/40" />
                </button>
                <h3 className="text-base font-semibold text-white">Create Album</h3>
              </div>
              <form onSubmit={handleAlbumCreate} className="bg-white/[0.03] rounded-xl p-5 border border-white/[0.06] space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs text-white/40 mb-1.5">Album Title *</label>
                    <input type="text" required value={albumForm.title}
                      onChange={(e) => setAlbumForm({ ...albumForm, title: e.target.value })}
                      className="w-full px-3 py-2.5 bg-white/[0.06] rounded-lg text-white text-sm outline-none focus:bg-white/[0.1] transition" />
                  </div>
                  <div>
                    <label className="block text-xs text-white/40 mb-1.5">Release Type</label>
                    <select value={albumForm.release_type} onChange={(e) => setAlbumForm({ ...albumForm, release_type: e.target.value })}
                      className="w-full px-3 py-2.5 bg-white/[0.06] rounded-lg text-white text-sm outline-none">
                      {['single','ep','album','mixtape','live','compilation'].map(t => (
                        <option key={t} value={t}>{t.charAt(0).toUpperCase()+t.slice(1)}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-white/40 mb-1.5">Release Date</label>
                    <input type="date" value={albumForm.release_date}
                      onChange={(e) => setAlbumForm({ ...albumForm, release_date: e.target.value })}
                      className="w-full px-3 py-2.5 bg-white/[0.06] rounded-lg text-white text-sm outline-none" />
                  </div>
                  <div>
                    <label className="block text-xs text-white/40 mb-1.5">Price (USD, 0 = free)</label>
                    <input type="number" min="0" step="0.01" value={albumForm.price}
                      onChange={(e) => setAlbumForm({ ...albumForm, price: e.target.value })}
                      className="w-full px-3 py-2.5 bg-white/[0.06] rounded-lg text-white text-sm outline-none" />
                  </div>
                </div>
                <div>
                  <label className="block text-xs text-white/40 mb-1.5">Description</label>
                  <textarea rows={3} value={albumForm.description}
                    onChange={(e) => setAlbumForm({ ...albumForm, description: e.target.value })}
                    className="w-full px-3 py-2.5 bg-white/[0.06] rounded-lg text-white text-sm outline-none resize-none" />
                </div>
                <div>
                  <label className="block text-xs text-white/40 mb-1.5">Cover Artwork</label>
                  <input type="file" accept=".jpg,.jpeg,.png,.webp"
                    onChange={(e) => setAlbumForm({ ...albumForm, cover_file: e.target.files[0] })}
                    className="w-full text-sm text-white/60 file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border-0 file:bg-white/[0.06] file:text-white/60 file:text-sm hover:file:bg-white/[0.1]" />
                </div>
                <label className="flex items-center space-x-2 cursor-pointer">
                  <div className={`w-8 h-5 rounded-full transition-colors flex items-center px-0.5 ${albumForm.is_published ? 'bg-white' : 'bg-white/10'}`}
                    onClick={() => setAlbumForm({ ...albumForm, is_published: !albumForm.is_published })}>
                    <div className={`w-4 h-4 rounded-full transition-transform ${albumForm.is_published ? 'translate-x-3 bg-black' : 'translate-x-0 bg-white/30'}`} />
                  </div>
                  <span className="text-xs text-white/50">Published</span>
                </label>
                <TierGate feature="collaborations" inline>
                  <div>
                    <label className="block text-xs text-white/40 mb-2">Album Collaborators</label>
                    <CollaboratorSearch collaborators={albumCollaborators} setCollaborators={setAlbumCollaborators} currentArtistId={artist.id} />
                  </div>
                </TierGate>
                <button type="submit" disabled={uploading}
                  className="w-full py-3 bg-white text-black font-semibold rounded-lg hover:bg-white/90 disabled:opacity-50 transition flex items-center justify-center space-x-2">
                  {uploading ? <Loader className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                  <span>{uploading ? 'Creating...' : 'Create Album & Add Tracks →'}</span>
                </button>
              </form>
            </div>
          )}

          {/* STEP: LIST */}
          {albumStep === 'list' && (
            <div className="space-y-4">
              <button onClick={() => setAlbumStep('create')}
                className="w-full py-3 bg-white/[0.06] text-white/70 font-medium rounded-lg hover:bg-white/[0.1] transition flex items-center justify-center space-x-2">
                <Plus className="w-4 h-4" /><span>Create New Album</span>
              </button>
              {albums.length === 0 ? (
                <div className="text-center py-12">
                  <Music className="w-10 h-10 mx-auto text-white/10 mb-3" />
                  <p className="text-white/30 text-sm">No albums yet</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {albums.map(album => (
                    <div key={album.id} className="bg-white/[0.03] rounded-xl border border-white/[0.06] overflow-hidden">
                      <div className="flex items-center space-x-3 p-3">
                        {album.cover_artwork_url
                          ? <img src={album.cover_artwork_url} alt={album.title} className="w-14 h-14 rounded-lg object-cover flex-shrink-0" />
                          : <div className="w-14 h-14 rounded-lg bg-white/[0.06] flex items-center justify-center flex-shrink-0"><Music className="w-5 h-5 text-white/20" /></div>}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-white truncate">{album.title}</p>
                          <p className="text-xs text-white/40">{album.release_type?.toUpperCase()} · {album.is_published ? 'Live' : 'Draft'}</p>
                        </div>
                        <div className="flex items-center space-x-1 flex-shrink-0">
                          <button
                            onClick={() => { setActiveAlbum(album); fetchAlbumTracks(album.id); setQuickTrackForm({ ...BLANK_TRACK, album_id: album.id }); setAlbumStep('tracks'); }}
                            className="px-3 py-1.5 bg-white/[0.06] rounded-lg text-xs text-white/60 hover:bg-white/[0.1] transition">
                            Tracks
                          </button>
                          <button onClick={() => editingAlbumId === album.id ? setEditingAlbumId(null) : startEditAlbum(album)}
                            className="p-2 bg-white/[0.04] rounded-lg hover:bg-white/[0.08] transition">
                            <Edit className="w-4 h-4 text-white/40" />
                          </button>
                          <button onClick={() => deleteAlbum(album.id, album.title)}
                            className="p-2 bg-red-500/[0.06] rounded-lg hover:bg-red-500/[0.12] transition">
                            <Trash2 className="w-4 h-4 text-red-400/60" />
                          </button>
                        </div>
                      </div>

                      {/* Inline edit */}
                      {editingAlbumId === album.id && (
                        <div className="border-t border-white/[0.06] p-4 space-y-4">
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                              <label className="block text-xs text-white/40 mb-1.5">Title</label>
                              <input type="text" value={editAlbumForm.title}
                                onChange={(e) => setEditAlbumForm({ ...editAlbumForm, title: e.target.value })}
                                className="w-full px-3 py-2.5 bg-white/[0.06] rounded-lg text-white text-sm outline-none focus:bg-white/[0.1]" />
                            </div>
                            <div>
                              <label className="block text-xs text-white/40 mb-1.5">Release Type</label>
                              <select value={editAlbumForm.release_type}
                                onChange={(e) => setEditAlbumForm({ ...editAlbumForm, release_type: e.target.value })}
                                className="w-full px-3 py-2.5 bg-white/[0.06] rounded-lg text-white text-sm outline-none">
                                {['single','ep','album','mixtape','live','compilation'].map(t => (
                                  <option key={t} value={t}>{t.charAt(0).toUpperCase()+t.slice(1)}</option>
                                ))}
                              </select>
                            </div>
                            <div>
                              <label className="block text-xs text-white/40 mb-1.5">Release Date</label>
                              <input type="date" value={editAlbumForm.release_date}
                                onChange={(e) => setEditAlbumForm({ ...editAlbumForm, release_date: e.target.value })}
                                className="w-full px-3 py-2.5 bg-white/[0.06] rounded-lg text-white text-sm outline-none" />
                            </div>
                            <div>
                              <label className="block text-xs text-white/40 mb-1.5">Price (USD)</label>
                              <input type="number" min="0" step="0.01" value={editAlbumForm.price}
                                onChange={(e) => setEditAlbumForm({ ...editAlbumForm, price: e.target.value })}
                                className="w-full px-3 py-2.5 bg-white/[0.06] rounded-lg text-white text-sm outline-none" />
                            </div>
                          </div>
                          <div>
                            <label className="block text-xs text-white/40 mb-1.5">Description</label>
                            <textarea rows={2} value={editAlbumForm.description}
                              onChange={(e) => setEditAlbumForm({ ...editAlbumForm, description: e.target.value })}
                              className="w-full px-3 py-2.5 bg-white/[0.06] rounded-lg text-white text-sm outline-none resize-none" />
                          </div>
                          <div>
                            <label className="block text-xs text-white/40 mb-1.5">Replace Artwork</label>
                            <input type="file" accept=".jpg,.jpeg,.png,.webp"
                              onChange={(e) => setEditAlbumForm({ ...editAlbumForm, cover_file: e.target.files[0] })}
                              className="w-full text-sm text-white/60 file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border-0 file:bg-white/[0.06] file:text-white/60 file:text-sm hover:file:bg-white/[0.1]" />
                          </div>
                          <label className="flex items-center space-x-2 cursor-pointer">
                            <div className={`w-8 h-5 rounded-full transition-colors flex items-center px-0.5 ${editAlbumForm.is_published ? 'bg-white' : 'bg-white/10'}`}
                              onClick={() => setEditAlbumForm({ ...editAlbumForm, is_published: !editAlbumForm.is_published })}>
                              <div className={`w-4 h-4 rounded-full transition-transform ${editAlbumForm.is_published ? 'translate-x-3 bg-black' : 'translate-x-0 bg-white/30'}`} />
                            </div>
                            <span className="text-xs text-white/50">Published</span>
                          </label>
                          <TierGate feature="collaborations" inline>
                            <div>
                              <label className="block text-xs text-white/40 mb-2">Album Collaborators</label>
                              <CollaboratorSearch collaborators={editAlbumCollaborators} setCollaborators={setEditAlbumCollaborators} currentArtistId={artist.id} />
                            </div>
                          </TierGate>
                          <div className="flex space-x-2">
                            <button onClick={() => saveAlbumEdit(album.id)} disabled={uploading}
                              className="px-4 py-2 bg-white text-black rounded-lg text-sm font-medium flex items-center space-x-1 disabled:opacity-50">
                              {uploading ? <Loader className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                              <span>Save</span>
                            </button>
                            <button onClick={() => setEditingAlbumId(null)}
                              className="px-4 py-2 bg-white/[0.06] text-white/60 rounded-lg text-sm flex items-center space-x-1">
                              <X className="w-3.5 h-3.5" /><span>Cancel</span>
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
      )}

      {/* ==================== MANAGE TAB ==================== */}
      {activeTab === 'manage' && (
        <div className="space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
            <input type="text" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search tracks..."
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
                <div key={track.id} className="bg-white/[0.03] rounded-lg p-4 border border-white/[0.06]">
                  {editingId === track.id ? (
                    <div className="space-y-3">
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                        <div><label className="block text-xs text-white/40 mb-1">Title</label>
                          <input type="text" value={editForm.title} onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
                            className="w-full px-3 py-2 bg-white/[0.06] rounded text-white text-sm outline-none" /></div>
                        <div><label className="block text-xs text-white/40 mb-1">Genre</label>
                          <select value={editForm.genre} onChange={(e) => setEditForm({ ...editForm, genre: e.target.value })}
                            className="w-full px-3 py-2 bg-white/[0.06] rounded text-white text-sm outline-none">
                            <option value="">None</option>{GENRES.map(g => <option key={g} value={g}>{g}</option>)}
                          </select></div>
                        <div><label className="block text-xs text-white/40 mb-1">Mood</label>
                          <select value={editForm.mood} onChange={(e) => setEditForm({ ...editForm, mood: e.target.value })}
                            className="w-full px-3 py-2 bg-white/[0.06] rounded text-white text-sm outline-none">
                            <option value="">None</option>{MOODS.map(m => <option key={m} value={m}>{m}</option>)}
                          </select></div>
                        <div><label className="block text-xs text-white/40 mb-1">Album</label>
                          <select value={editForm.album_id} onChange={(e) => setEditForm({ ...editForm, album_id: e.target.value })}
                            className="w-full px-3 py-2 bg-white/[0.06] rounded text-white text-sm outline-none">
                            <option value="">No Album</option>{albums.map(a => <option key={a.id} value={a.id}>{a.title}</option>)}
                          </select></div>
                        <div><label className="block text-xs text-white/40 mb-1">Track #</label>
                          <input type="number" min="1" value={editForm.track_number} onChange={(e) => setEditForm({ ...editForm, track_number: e.target.value })}
                            className="w-full px-3 py-2 bg-white/[0.06] rounded text-white text-sm outline-none" /></div>
                        <div><label className="block text-xs text-white/40 mb-1">Price</label>
                          <input type="number" min="0" step="0.01" value={editForm.download_price} onChange={(e) => setEditForm({ ...editForm, download_price: e.target.value })}
                            className="w-full px-3 py-2 bg-white/[0.06] rounded text-white text-sm outline-none" /></div>
                      </div>
                      <div><label className="block text-xs text-white/40 mb-1">Lyrics</label>
                        <textarea rows={2} value={editForm.lyrics} onChange={(e) => setEditForm({ ...editForm, lyrics: e.target.value })}
                          className="w-full px-3 py-2 bg-white/[0.06] rounded text-white text-sm outline-none resize-none" /></div>
                      <div className="flex flex-wrap gap-3">
                        {['is_published', 'featured', 'is_explicit', 'is_downloadable', 'is_premium'].map(key => (
                          <label key={key} className="flex items-center space-x-1.5 text-xs text-white/40 cursor-pointer">
                            <input type="checkbox" checked={editForm[key]} onChange={(e) => setEditForm({ ...editForm, [key]: e.target.checked })}
                              className="rounded border-white/20" />
                            <span>{key.replace('is_', '').replace('_', ' ')}</span>
                          </label>
                        ))}
                      </div>
                      <div className="mt-3">
                        <label className="block text-xs text-white/40 mb-2">Collaborators</label>
                        <CollaboratorSearch collaborators={editCollaborators} setCollaborators={setEditCollaborators} currentArtistId={artist.id} />
                      </div>
                      <div className="flex space-x-2">
                        <button onClick={() => saveEdit(track.id)}
                          className="px-4 py-2 bg-white text-black rounded-lg text-sm font-medium flex items-center space-x-1">
                          <Save className="w-3.5 h-3.5" /><span>Save</span>
                        </button>
                        <button onClick={() => setEditingId(null)}
                          className="px-4 py-2 bg-white/[0.06] text-white/60 rounded-lg text-sm flex items-center space-x-1">
                          <X className="w-3.5 h-3.5" /><span>Cancel</span>
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-3 flex-1 min-w-0">
                        {track.cover_artwork_url
                          ? <img src={track.cover_artwork_url} alt={track.title} className="w-12 h-12 rounded-md object-cover flex-shrink-0" />
                          : <div className="w-12 h-12 rounded-md bg-white/[0.06] flex items-center justify-center flex-shrink-0"><Music className="w-5 h-5 text-white/20" /></div>}
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-white truncate">{track.title}</p>
                          <p className="text-xs text-white/40 truncate">{track.genre || 'No genre'} {track.albums?.title ? `on ${track.albums.title}` : '(Single)'}</p>
                          <div className="flex items-center space-x-2 mt-1">
                            {track.is_published
                              ? <span className="text-[10px] px-1.5 py-0.5 bg-green-500/10 text-green-400 rounded">Live</span>
                              : <span className="text-[10px] px-1.5 py-0.5 bg-white/[0.06] text-white/30 rounded">Draft</span>}
                            {track.featured && <span className="text-[10px] px-1.5 py-0.5 bg-yellow-500/10 text-yellow-400 rounded">Featured</span>}
                            {track.is_explicit && <span className="text-[10px] px-1.5 py-0.5 bg-white/[0.06] text-white/30 rounded">E</span>}
                            <span className="text-[10px] text-white/20">{track.stream_count || 0} streams</span>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center space-x-1 ml-2">
                        <button onClick={() => startEdit(track)} className="p-2 bg-white/[0.04] rounded-lg hover:bg-white/[0.08] transition">
                          <Edit className="w-4 h-4 text-white/40" />
                        </button>
                        <button onClick={() => deleteTrack(track.id, track.title)} className="p-2 bg-red-500/[0.06] rounded-lg hover:bg-red-500/[0.12] transition">
                          <Trash2 className="w-4 h-4 text-red-400/60" />
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
