import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { useAuth } from '../contexts/AuthContext';
import {
  Upload, Trash2, Loader, Plus, Save, Music, Image as ImageIcon,
  Edit, Search, ChevronDown, ChevronUp, Eye, EyeOff, Star, X
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

function slugify(text) {
  return text.toString().toLowerCase().trim()
    .replace(/\s+/g, '-').replace(/[^\w\-]+/g, '').replace(/\-\-+/g, '-');
}

export default function TrackUploadPanel() {
  const { artist } = useAuth();
  const [activeTab, setActiveTab] = useState('upload');
  const [albums, setAlbums] = useState([]);
  const [tracks, setTracks] = useState([]);
  const [filteredTracks, setFilteredTracks] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });

  // Track upload form
  const [trackForm, setTrackForm] = useState({
    title: '', genre: '', mood: '', lyrics: '',
    is_explicit: false, is_downloadable: true, is_published: false,
    is_premium: false, download_price: '0', featured: false,
    album_id: '', track_number: '1',
    audio_file: null, cover_file: null,
    has_versions: false,
  });

  const [versionFiles, setVersionFiles] = useState([]);
  const [collaborators, setCollaborators] = useState([]);

  // Album form
  const [albumForm, setAlbumForm] = useState({
    title: '', description: '', release_type: 'album',
    release_date: '', is_published: false, price: '0',
    cover_file: null,
  });

  useEffect(() => {
    if (artist) fetchAlbums();
  }, [artist]);

  useEffect(() => {
    if (activeTab === 'manage') fetchTracks();
  }, [activeTab]);

  useEffect(() => {
    if (searchTerm) {
      setFilteredTracks(tracks.filter(t =>
        t.title?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        t.genre?.toLowerCase().includes(searchTerm.toLowerCase())
      ));
    } else {
      setFilteredTracks(tracks);
    }
  }, [searchTerm, tracks]);

  const fetchAlbums = async () => {
    const { data } = await supabase
      .from('albums')
      .select('*')
      .eq('artist_id', artist.id)
      .order('created_at', { ascending: false });
    setAlbums(data || []);
  };

  const fetchTracks = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('tracks')
      .select('*, albums(title)')
      .eq('artist_id', artist.id)
      .order('created_at', { ascending: false });
    setTracks(data || []);
    setFilteredTracks(data || []);
    setLoading(false);
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
  const handleTrackUpload = async (e) => {
    e.preventDefault();
    if (!trackForm.audio_file) { showMessage('error', 'Audio file is required'); return; }
    if (!artist) { showMessage('error', 'No artist profile found'); return; }

    setUploading(true);
    try {
      showMessage('info', 'Uploading audio...');
      const fileUrl = await uploadFile(trackForm.audio_file, 'tracks/');

      let coverUrl = null;
      if (trackForm.cover_file) {
        showMessage('info', 'Uploading cover artwork...');
        coverUrl = await uploadFile(trackForm.cover_file, 'covers/');
      }

      showMessage('info', 'Saving track...');
      const trackData = {
        artist_id: artist.id,
        album_id: trackForm.album_id || null,
        title: trackForm.title,
        slug: slugify(trackForm.title),
        genre: trackForm.genre,
        mood: trackForm.mood,
        lyrics: trackForm.lyrics || null,
        file_url: fileUrl,
        cover_artwork_url: coverUrl,
        track_number: parseInt(trackForm.track_number) || 1,
        is_explicit: trackForm.is_explicit,
        is_downloadable: trackForm.is_downloadable,
        is_published: trackForm.is_published,
        is_premium: trackForm.is_premium,
        download_price: parseFloat(trackForm.download_price) || 0,
        featured: trackForm.featured,
        has_versions: trackForm.has_versions,
      };

      const { data, error } = await supabase.from('tracks').insert([trackData]).select();
      if (error) throw error;

      const trackId = data[0].id;

      // Upload alternate versions
      if (trackForm.has_versions && versionFiles.length > 0) {
        for (const ver of versionFiles) {
          if (ver.file) {
            showMessage('info', `Uploading ${ver.version_name}...`);
            const verUrl = await uploadFile(ver.file, 'versions/');
            await supabase.from('track_versions').insert([{
              track_id: trackId,
              version_name: ver.version_name,
              version_type: ver.version_type,
              file_url: verUrl,
            }]);
          }
        }
      }

      if (collaborators.length > 0) {
        showMessage('info', 'Sending collab requests...');
        await saveCollaborations(trackId);
      }
      showMessage('success', 'Track uploaded successfully!');
      resetTrackForm();

      fetchTracks();
    } catch (err) {
      showMessage('error', 'Upload failed: ' + err.message);
    }
    setUploading(false);
  };

  const saveCollaborations = async (trackId) => {
    if (collaborators.length === 0) return;
    for (const collab of collaborators) {
      try {
        const { data: collabData, error: collabErr } = await supabase
          .from('collaborations')
          .insert([{
            track_id: trackId,
            artist_id: collab.artist_id,
            role: collab.role,
            split_percent: collab.split_percent,
            status: 'pending',
            invited_by: artist.id,
          }])
          .select()
          .single();
        if (collabErr) { console.error('Collab insert error:', collabErr); continue; }
        await supabase.from('collab_requests').insert([{
          collaboration_id: collabData.id,
          from_artist_id: artist.id,
          to_artist_id: collab.artist_id,
          track_id: trackId,
          message: collab.message || null,
          status: 'pending',
        }]);
      } catch (err) { console.error('Save collab error:', err); }
    }
  };

  const resetTrackForm = () => {
    setTrackForm({
      title: '', genre: '', mood: '', lyrics: '',
      is_explicit: false, is_downloadable: true, is_published: false,
      is_premium: false, download_price: '0', featured: false,
      album_id: '', track_number: '1',
      audio_file: null, cover_file: null, has_versions: false,
    });
    setVersionFiles([]);
    setCollaborators([]);
  };

  // ==================== ALBUM CREATE ====================
  const handleAlbumCreate = async (e) => {
    e.preventDefault();
    if (!artist) return;
    setUploading(true);

    try {
      let coverUrl = null;
      if (albumForm.cover_file) {
        showMessage('info', 'Uploading album artwork...');
        coverUrl = await uploadFile(albumForm.cover_file, 'album-covers/');
      }

      const { error } = await supabase.from('albums').insert([{
        artist_id: artist.id,
        title: albumForm.title,
        slug: slugify(albumForm.title),
        description: albumForm.description,
        cover_artwork_url: coverUrl,
        release_date: albumForm.release_date || null,
        release_type: albumForm.release_type,
        is_published: albumForm.is_published,
        price: parseFloat(albumForm.price) || 0,
      }]);

      if (error) throw error;
      showMessage('success', 'Album created!');
      setAlbumForm({ title: '', description: '', release_type: 'album', release_date: '', is_published: false, price: '0', cover_file: null });
      fetchAlbums();
    } catch (err) {
      showMessage('error', 'Failed: ' + err.message);
    }
    setUploading(false);
  };

  // ==================== TRACK EDIT ====================
  const [editCollaborators, setEditCollaborators] = useState([]);

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
    // Load existing collaborators
    const { data } = await supabase.from('collaborations')
      .select('*, artists(artist_name, profile_image_url)')
      .eq('track_id', track.id);
    setEditCollaborators((data || []).map(c => ({
      artist_id: c.artist_id,
      artist_name: c.artists?.artist_name,
      role: c.role,
      split_percent: c.split_percent,
    })));
  };

  const saveEdit = async (id) => {
    try {
      // Save new collaborators if any added
      if (editCollaborators.length > 0) {
        await supabase.from('collaborations').delete().eq('track_id', id);
        for (const collab of editCollaborators) {
          await supabase.from('collaborations').insert({
            track_id: id, artist_id: collab.artist_id,
            role: collab.role, split_percent: collab.split_percent,
            status: 'pending', invited_by: artist.id,
          });
        }
      }
      const { error } = await supabase.from('tracks').update({
        title: editForm.title, slug: slugify(editForm.title),
        genre: editForm.genre, mood: editForm.mood,
        lyrics: editForm.lyrics, is_explicit: editForm.is_explicit,
        is_downloadable: editForm.is_downloadable, is_published: editForm.is_published,
        is_premium: editForm.is_premium, download_price: parseFloat(editForm.download_price) || 0,
        featured: editForm.featured, album_id: editForm.album_id || null,
        track_number: parseInt(editForm.track_number) || 1,
        updated_at: new Date().toISOString(),
      }).eq('id', id);
      if (error) throw error;
      showMessage('success', 'Track updated!');
      setEditingId(null);
      fetchTracks();
    } catch (err) {
      showMessage('error', 'Failed: ' + err.message);
    }
  };

  const deleteTrack = async (id, title) => {
    if (!window.confirm(`Delete "${title}"? This cannot be undone.`)) return;
    try {
      const { error } = await supabase.from('tracks').delete().eq('id', id);
      if (error) throw error;
      showMessage('success', 'Track deleted');
      fetchTracks();
    } catch (err) {
      showMessage('error', 'Failed: ' + err.message);
    }
  };

  const deleteAlbum = async (id, title) => {
    if (!window.confirm(`Delete album "${title}"? Tracks won't be deleted but will be unlinked.`)) return;
    try {
      const { error } = await supabase.from('albums').delete().eq('id', id);
      if (error) throw error;
      showMessage('success', 'Album deleted');
      fetchAlbums();
    } catch (err) {
      showMessage('error', 'Failed: ' + err.message);
    }
  };

  // Version helpers
  const addVersion = () => setVersionFiles([...versionFiles, { version_name: '', version_type: 'remix', file: null }]);
  const removeVersion = (i) => setVersionFiles(versionFiles.filter((_, idx) => idx !== i));
  const updateVersion = (i, field, val) => {
    const arr = [...versionFiles]; arr[i][field] = val; setVersionFiles(arr);
  };

  if (!artist) {
    return (
      <div className="text-center py-20">
        <Music className="w-12 h-12 mx-auto text-white/20 mb-4" />
        <p className="text-white/40">No artist profile found. Create one first.</p>
      </div>
    );
  }

  const tabs = [
    { key: 'upload', label: 'Upload Track', icon: Upload },
    { key: 'albums', label: 'Albums', icon: Music },
    { key: 'manage', label: 'Manage Tracks', icon: Edit },
  ];

  return (
    <div className="space-y-6">
      {/* Messages */}
      {message.text && (
        <div className={`p-3 rounded-lg text-sm ${
          message.type === 'success' ? 'bg-green-500/10 border border-green-500/20 text-green-400'
          : message.type === 'info' ? 'bg-blue-500/10 border border-blue-500/20 text-blue-400'
          : 'bg-red-500/10 border border-red-500/20 text-red-400'
        }`}>{message.text}</div>
      )}

      {/* Tabs */}
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
        <form onSubmit={handleTrackUpload} className="space-y-4">
          <div className="bg-white/[0.03] rounded-xl p-5 border border-white/[0.06] space-y-4">
            <h3 className="text-base font-semibold text-white">Track Details</h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-white/40 mb-1.5">Track Title *</label>
                <input type="text" required value={trackForm.title}
                  onChange={(e) => setTrackForm({ ...trackForm, title: e.target.value })}
                  className="w-full px-3 py-2.5 bg-white/[0.06] rounded-lg text-white text-sm outline-none focus:bg-white/[0.1] transition" />
              </div>

              <div>
                <label className="block text-xs text-white/40 mb-1.5">Album (optional)</label>
                <select value={trackForm.album_id}
                  onChange={(e) => setTrackForm({ ...trackForm, album_id: e.target.value })}
                  className="w-full px-3 py-2.5 bg-white/[0.06] rounded-lg text-white text-sm outline-none">
                  <option value="">No Album (Single)</option>
                  {albums.map(a => <option key={a.id} value={a.id}>{a.title}</option>)}
                </select>
              </div>

              <div>
                <label className="block text-xs text-white/40 mb-1.5">Genre</label>
                <select value={trackForm.genre}
                  onChange={(e) => setTrackForm({ ...trackForm, genre: e.target.value })}
                  className="w-full px-3 py-2.5 bg-white/[0.06] rounded-lg text-white text-sm outline-none">
                  <option value="">Select genre...</option>
                  {GENRES.map(g => <option key={g} value={g}>{g}</option>)}
                </select>
              </div>

              <div>
                <label className="block text-xs text-white/40 mb-1.5">Mood</label>
                <select value={trackForm.mood}
                  onChange={(e) => setTrackForm({ ...trackForm, mood: e.target.value })}
                  className="w-full px-3 py-2.5 bg-white/[0.06] rounded-lg text-white text-sm outline-none">
                  <option value="">Select mood...</option>
                  {MOODS.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>

              <div>
                <label className="block text-xs text-white/40 mb-1.5">Track Number</label>
                <input type="number" min="1" value={trackForm.track_number}
                  onChange={(e) => setTrackForm({ ...trackForm, track_number: e.target.value })}
                  className="w-full px-3 py-2.5 bg-white/[0.06] rounded-lg text-white text-sm outline-none" />
              </div>

              <TierGate feature="download_sales" inline>
                <div>
                  <label className="block text-xs text-white/40 mb-1.5">Download Price (USD)</label>
                  <input type="number" min="0" step="0.01" value={trackForm.download_price}
                    onChange={(e) => setTrackForm({ ...trackForm, download_price: e.target.value })}
                    className="w-full px-3 py-2.5 bg-white/[0.06] rounded-lg text-white text-sm outline-none" />
                </div>
              </TierGate>
            </div>

            {/* Lyrics */}
            <TierGate feature="lyrics" inline>
              <div>
                <label className="block text-xs text-white/40 mb-1.5">Lyrics (optional)</label>
                <textarea rows={3} value={trackForm.lyrics}
                  onChange={(e) => setTrackForm({ ...trackForm, lyrics: e.target.value })}
                  placeholder="Paste lyrics here..."
                  className="w-full px-3 py-2.5 bg-white/[0.06] rounded-lg text-white text-sm outline-none resize-none" />
              </div>
            </TierGate>

            {/* Files */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-white/40 mb-1.5">Audio File * (.mp3, .wav, .flac)</label>
                <input type="file" accept=".wav,.mp3,.flac,.m4a,.ogg"
                  onChange={(e) => {
                    const f = e.target.files[0];
                    if (f && f.size > 500 * 1024 * 1024) { showMessage('error', 'File too large! Max 500MB'); return; }
                    setTrackForm({ ...trackForm, audio_file: f });
                  }}
                  className="w-full text-sm text-white/60 file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border-0 file:bg-white/[0.06] file:text-white/60 file:text-sm hover:file:bg-white/[0.1]" />
                {trackForm.audio_file && (
                  <p className="text-xs text-white/30 mt-1">{trackForm.audio_file.name} ({(trackForm.audio_file.size / (1024 * 1024)).toFixed(1)}MB)</p>
                )}
              </div>

              <div>
                <label className="block text-xs text-white/40 mb-1.5">Cover Artwork (.jpg, .png)</label>
                <input type="file" accept=".jpg,.jpeg,.png,.webp"
                  onChange={(e) => setTrackForm({ ...trackForm, cover_file: e.target.files[0] })}
                  className="w-full text-sm text-white/60 file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border-0 file:bg-white/[0.06] file:text-white/60 file:text-sm hover:file:bg-white/[0.1]" />
              </div>
            </div>

            {/* Toggles */}
            <div className="flex flex-wrap gap-4">
              {[
                { key: 'is_published', label: 'Published' },
                { key: 'featured', label: 'Featured' },
                { key: 'is_explicit', label: 'Explicit' },
                { key: 'is_downloadable', label: 'Downloadable' },
                { key: 'is_premium', label: 'Premium', premiumOnly: true },
                { key: 'has_versions', label: 'Has Versions' },
              ].map(({ key, label, premiumOnly }) => (
                <label key={key} className="flex items-center space-x-2 cursor-pointer opacity-100">
                  <TierGate feature={premiumOnly ? "download_sales" : null} inline={!!premiumOnly}>
                    <div className={`w-8 h-5 rounded-full transition-colors flex items-center px-0.5 ${
                      trackForm[key] ? 'bg-white' : 'bg-white/10'
                    }`} onClick={() => setTrackForm({ ...trackForm, [key]: !trackForm[key] })}>
                      <div className={`w-4 h-4 rounded-full transition-transform ${
                        trackForm[key] ? 'translate-x-3 bg-black' : 'translate-x-0 bg-white/30'
                      }`} />
                    </div>
                  </TierGate>
                  <span className="text-xs text-white/50">{label}</span>
                </label>
              ))}
            </div>

            {/* Collaborators */}
            <TierGate feature="collaborations" inline>
              <CollaboratorSearch
                collaborators={collaborators}
                setCollaborators={setCollaborators}
                currentArtistId={artist.id}
              />
            </TierGate>

            {/* Alternate Versions */}
            {trackForm.has_versions && (
              <div className="bg-white/[0.02] rounded-lg p-4 border border-white/[0.06] space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-medium text-white">Alternate Versions</h4>
                  <button type="button" onClick={addVersion}
                    className="flex items-center space-x-1 px-3 py-1.5 bg-white/[0.06] rounded-lg text-xs text-white/60 hover:bg-white/[0.1] transition">
                    <Plus className="w-3 h-3" /><span>Add Version</span>
                  </button>
                </div>

                {versionFiles.map((ver, i) => (
                  <div key={i} className="grid grid-cols-1 md:grid-cols-3 gap-2 p-3 bg-white/[0.03] rounded-lg">
                    <input type="text" placeholder="Version name" value={ver.version_name}
                      onChange={(e) => updateVersion(i, 'version_name', e.target.value)}
                      className="px-3 py-2 bg-white/[0.06] rounded-lg text-white text-sm outline-none" />
                    <select value={ver.version_type}
                      onChange={(e) => updateVersion(i, 'version_type', e.target.value)}
                      className="px-3 py-2 bg-white/[0.06] rounded-lg text-white text-sm outline-none">
                      {VERSION_TYPES.map(v => <option key={v.value} value={v.value}>{v.label}</option>)}
                    </select>
                    <div className="flex items-center space-x-2">
                      <input type="file" accept=".wav,.mp3,.flac,.m4a"
                        onChange={(e) => updateVersion(i, 'file', e.target.files[0])}
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

            {/* Submit */}
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
          <form onSubmit={handleAlbumCreate} className="bg-white/[0.03] rounded-xl p-5 border border-white/[0.06] space-y-4">
            <h3 className="text-base font-semibold text-white">Create Album</h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-white/40 mb-1.5">Album Title *</label>
                <input type="text" required value={albumForm.title}
                  onChange={(e) => setAlbumForm({ ...albumForm, title: e.target.value })}
                  className="w-full px-3 py-2.5 bg-white/[0.06] rounded-lg text-white text-sm outline-none focus:bg-white/[0.1] transition" />
              </div>

              <div>
                <label className="block text-xs text-white/40 mb-1.5">Release Type</label>
                <select value={albumForm.release_type}
                  onChange={(e) => setAlbumForm({ ...albumForm, release_type: e.target.value })}
                  className="w-full px-3 py-2.5 bg-white/[0.06] rounded-lg text-white text-sm outline-none">
                  <option value="single">Single</option>
                  <option value="ep">EP</option>
                  <option value="album">Album</option>
                  <option value="mixtape">Mixtape</option>
                  <option value="live">Live Album</option>
                  <option value="compilation">Compilation</option>
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
              <div className={`w-8 h-5 rounded-full transition-colors flex items-center px-0.5 ${
                albumForm.is_published ? 'bg-white' : 'bg-white/10'
              }`} onClick={() => setAlbumForm({ ...albumForm, is_published: !albumForm.is_published })}>
                <div className={`w-4 h-4 rounded-full transition-transform ${
                  albumForm.is_published ? 'translate-x-3 bg-black' : 'translate-x-0 bg-white/30'
                }`} />
              </div>
              <span className="text-xs text-white/50">Published</span>
            </label>

            <button type="submit" disabled={uploading}
              className="w-full py-3 bg-white text-black font-semibold rounded-lg hover:bg-white/90 disabled:opacity-50 transition flex items-center justify-center space-x-2">
              {uploading ? <Loader className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              <span>{uploading ? 'Creating...' : 'Create Album'}</span>
            </button>
          </form>

          {/* Album List */}
          <div className="bg-white/[0.03] rounded-xl p-5 border border-white/[0.06]">
            <h3 className="text-base font-semibold text-white mb-4">Your Albums ({albums.length})</h3>
            <div className="space-y-2">
              {albums.map(album => (
                <div key={album.id} className="flex items-center justify-between p-3 bg-white/[0.03] rounded-lg">
                  <div className="flex items-center space-x-3">
                    {album.cover_artwork_url ? (
                      <img src={album.cover_artwork_url} alt={album.title} className="w-12 h-12 rounded-md object-cover" />
                    ) : (
                      <div className="w-12 h-12 rounded-md bg-white/[0.06] flex items-center justify-center">
                        <Music className="w-5 h-5 text-white/20" />
                      </div>
                    )}
                    <div>
                      <p className="text-sm font-medium text-white">{album.title}</p>
                      <p className="text-xs text-white/40">
                        {album.release_type?.toUpperCase()} {album.is_published ? '' : '(Draft)'}
                      </p>
                    </div>
                  </div>
                  <button onClick={() => deleteAlbum(album.id, album.title)}
                    className="p-2 bg-red-500/10 rounded-lg hover:bg-red-500/20 transition">
                    <Trash2 className="w-4 h-4 text-red-400" />
                  </button>
                </div>
              ))}
              {albums.length === 0 && (
                <p className="text-center text-white/20 text-sm py-6">No albums yet. Create one above.</p>
              )}
            </div>
          </div>
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
                        <div>
                          <label className="block text-xs text-white/40 mb-1">Title</label>
                          <input type="text" value={editForm.title}
                            onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
                            className="w-full px-3 py-2 bg-white/[0.06] rounded text-white text-sm outline-none" />
                        </div>
                        <div>
                          <label className="block text-xs text-white/40 mb-1">Genre</label>
                          <select value={editForm.genre}
                            onChange={(e) => setEditForm({ ...editForm, genre: e.target.value })}
                            className="w-full px-3 py-2 bg-white/[0.06] rounded text-white text-sm outline-none">
                            <option value="">None</option>
                            {GENRES.map(g => <option key={g} value={g}>{g}</option>)}
                          </select>
                        </div>
                        <div>
                          <label className="block text-xs text-white/40 mb-1">Mood</label>
                          <select value={editForm.mood}
                            onChange={(e) => setEditForm({ ...editForm, mood: e.target.value })}
                            className="w-full px-3 py-2 bg-white/[0.06] rounded text-white text-sm outline-none">
                            <option value="">None</option>
                            {MOODS.map(m => <option key={m} value={m}>{m}</option>)}
                          </select>
                        </div>
                        <div>
                          <label className="block text-xs text-white/40 mb-1">Album</label>
                          <select value={editForm.album_id}
                            onChange={(e) => setEditForm({ ...editForm, album_id: e.target.value })}
                            className="w-full px-3 py-2 bg-white/[0.06] rounded text-white text-sm outline-none">
                            <option value="">No Album</option>
                            {albums.map(a => <option key={a.id} value={a.id}>{a.title}</option>)}
                          </select>
                        </div>
                        <div>
                          <label className="block text-xs text-white/40 mb-1">Track #</label>
                          <input type="number" min="1" value={editForm.track_number}
                            onChange={(e) => setEditForm({ ...editForm, track_number: e.target.value })}
                            className="w-full px-3 py-2 bg-white/[0.06] rounded text-white text-sm outline-none" />
                        </div>
                        <div>
                          <label className="block text-xs text-white/40 mb-1">Price</label>
                          <input type="number" min="0" step="0.01" value={editForm.download_price}
                            onChange={(e) => setEditForm({ ...editForm, download_price: e.target.value })}
                            className="w-full px-3 py-2 bg-white/[0.06] rounded text-white text-sm outline-none" />
                        </div>
                      </div>
                      <div>
                        <label className="block text-xs text-white/40 mb-1">Lyrics</label>
                        <textarea rows={2} value={editForm.lyrics}
                          onChange={(e) => setEditForm({ ...editForm, lyrics: e.target.value })}
                          className="w-full px-3 py-2 bg-white/[0.06] rounded text-white text-sm outline-none resize-none" />
                      </div>
                      <div className="flex flex-wrap gap-3">
                        {['is_published', 'featured', 'is_explicit', 'is_downloadable', 'is_premium'].map(key => (
                          <label key={key} className="flex items-center space-x-1.5 text-xs text-white/40 cursor-pointer">
                            <input type="checkbox" checked={editForm[key]}
                              onChange={(e) => setEditForm({ ...editForm, [key]: e.target.checked })}
                              className="rounded border-white/20" />
                            <span>{key.replace('is_', '').replace('_', ' ')}</span>
                          </label>
                        ))}
                      </div>
                      <div className="mt-3">
                        <label className="block text-xs text-white/40 mb-2">Collaborators</label>
                        <CollaboratorSearch collaborators={editCollaborators} onChange={setEditCollaborators} />
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
                        {track.cover_artwork_url ? (
                          <img src={track.cover_artwork_url} alt={track.title} className="w-12 h-12 rounded-md object-cover flex-shrink-0" />
                        ) : (
                          <div className="w-12 h-12 rounded-md bg-white/[0.06] flex items-center justify-center flex-shrink-0">
                            <Music className="w-5 h-5 text-white/20" />
                          </div>
                        )}
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-white truncate">{track.title}</p>
                          <p className="text-xs text-white/40 truncate">
                            {track.genre || 'No genre'} {track.albums?.title ? `on ${track.albums.title}` : '(Single)'}
                          </p>
                          <div className="flex items-center space-x-2 mt-1">
                            {track.is_published ? (
                              <span className="text-[10px] px-1.5 py-0.5 bg-green-500/10 text-green-400 rounded">Live</span>
                            ) : (
                              <span className="text-[10px] px-1.5 py-0.5 bg-white/[0.06] text-white/30 rounded">Draft</span>
                            )}
                            {track.featured && <span className="text-[10px] px-1.5 py-0.5 bg-yellow-500/10 text-yellow-400 rounded">Featured</span>}
                            {track.is_explicit && <span className="text-[10px] px-1.5 py-0.5 bg-white/[0.06] text-white/30 rounded">E</span>}
                            <span className="text-[10px] text-white/20">{track.stream_count || 0} streams</span>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center space-x-1 ml-2">
                        <button onClick={() => startEdit(track)}
                          className="p-2 bg-white/[0.04] rounded-lg hover:bg-white/[0.08] transition">
                          <Edit className="w-4 h-4 text-white/40" />
                        </button>
                        <button onClick={() => deleteTrack(track.id, track.title)}
                          className="p-2 bg-red-500/[0.06] rounded-lg hover:bg-red-500/[0.12] transition">
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
