import React, { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';
import { 
  Upload, 
  Trash2, 
  LogOut, 
  Music, 
  Image as ImageIcon,
  Loader,
  CheckCircle,
  XCircle,
  Clock,
  DollarSign,
  FileMusic,
  Layers,
  X
} from 'lucide-react';

function AdminPanel({ user, onLogout }) {
  const [samples, setSamples] = useState([]);
  const [uploadLogs, setUploadLogs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });

  // Form state
  const [formData, setFormData] = useState({
    name: '',
    artist: 'Project Feelz',
    bpm: '',
    key: 'C Minor',
    genre: 'Electronic',
    mood: 'Energetic',
    featured: false,
    is_premium: false,
    price: '0.00'
  });

  const [mainLoopFile, setMainLoopFile] = useState(null);
  const [thumbnailFile, setThumbnailFile] = useState(null);
  const [midiFile, setMidiFile] = useState(null);
  const [stems, setStems] = useState([
    { id: 1, name: '', type: 'Melody', file: null },
    { id: 2, name: '', type: 'Counter Melody', file: null },
    { id: 3, name: '', type: 'Bass', file: null },
    { id: 4, name: '', type: 'Synth', file: null },
    { id: 5, name: '', type: 'Drums', file: null }
  ]);

  // Predefined options
  const keys = [
    'C Major', 'C Minor', 'C# Major', 'C# Minor',
    'D Major', 'D Minor', 'D# Major', 'D# Minor',
    'E Major', 'E Minor', 'F Major', 'F Minor',
    'F# Major', 'F# Minor', 'G Major', 'G Minor',
    'G# Major', 'G# Minor', 'A Major', 'A Minor',
    'A# Major', 'A# Minor', 'B Major', 'B Minor'
  ];

  const genres = [
    'Hip Hop', 'Trap', 'Drill', 'Boom Bap', 'Lo-Fi',
    'Electronic', 'House', 'Techno', 'Dubstep', 'Drum & Bass',
    'Ambient', 'Jazz', 'R&B', 'Pop', 'Rock', 'Other'
  ];

  const moods = [
    'Energetic', 'Dark', 'Chill', 'Happy', 'Sad',
    'Aggressive', 'Dreamy', 'Uplifting', 'Melancholic'
  ];

  const stemTypes = [
    'Melody', 'Counter Melody', 'Bass', 'Sub Bass', 'Synth',
    'Lead', 'Pad', 'Drums', 'Hi-Hats', 'Percussion', 'FX',
    'Vocals', 'Custom'
  ];

  useEffect(() => {
    fetchSamples();
    fetchUploadLogs();
  }, []);

  const fetchSamples = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('samples')
      .select('*')
      .order('created_at', { ascending: false });

    if (!error) {
      setSamples(data || []);
    }
    setLoading(false);
  };

  const fetchUploadLogs = async () => {
    const { data, error } = await supabase
      .from('upload_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(10);

    if (!error) {
      setUploadLogs(data || []);
    }
  };

  const handleStemFileChange = (stemId, file) => {
    setStems(stems.map(stem => 
      stem.id === stemId ? { ...stem, file } : stem
    ));
  };

  const handleStemNameChange = (stemId, name) => {
    setStems(stems.map(stem => 
      stem.id === stemId ? { ...stem, name } : stem
    ));
  };

  const handleStemTypeChange = (stemId, type) => {
    setStems(stems.map(stem => 
      stem.id === stemId ? { ...stem, type } : stem
    ));
  };

  const uploadFile = async (file, folder, packName) => {
    const fileExt = file.name.split('.').pop();
    const fileName = `${packName}/${folder}/${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;

    const { error } = await supabase.storage
      .from('feelz-samples')
      .upload(fileName, file);

    if (error) throw error;

    const { data: { publicUrl } } = supabase.storage
      .from('feelz-samples')
      .getPublicUrl(fileName);

    return publicUrl;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!mainLoopFile) {
      setMessage({ type: 'error', text: 'Please select a main loop audio file' });
      return;
    }

    if (!thumbnailFile) {
      setMessage({ type: 'error', text: 'Please select a thumbnail image' });
      return;
    }

    setUploading(true);
    setMessage({ type: '', text: '' });

    try {
      // Create pack folder name
      const packFolderName = formData.name.toLowerCase().replace(/[^a-z0-9]/g, '-');

      // Upload main loop
      const mainLoopUrl = await uploadFile(mainLoopFile, 'main', packFolderName);

      // Upload thumbnail
      const thumbnailUrl = await uploadFile(thumbnailFile, 'thumbnails', packFolderName);

      // Upload MIDI if provided
      let midiUrl = null;
      if (midiFile) {
        midiUrl = await uploadFile(midiFile, 'midi', packFolderName);
      }

      // Count stems
      const uploadedStems = stems.filter(s => s.file);
      const hasStems = uploadedStems.length > 0;
      const hasMidi = midiFile !== null;

      // Insert sample pack into database
      const { data: sampleData, error: sampleError } = await supabase
        .from('samples')
        .insert([
          {
            name: formData.name,
            artist: formData.artist,
            bpm: parseInt(formData.bpm),
            key: formData.key,
            genre: formData.genre,
            mood: formData.mood,
            file_url: mainLoopUrl, // Keep for backward compatibility
            main_loop_url: mainLoopUrl,
            thumbnail_url: thumbnailUrl,
            featured: formData.featured,
            is_pack: true,
            has_stems: hasStems,
            has_midi: hasMidi,
            is_premium: formData.is_premium,
            price: formData.is_premium ? parseFloat(formData.price) : 0
          }
        ])
        .select()
        .single();

      if (sampleError) throw sampleError;

      // Upload stems
      for (const stem of uploadedStems) {
        const stemUrl = await uploadFile(stem.file, 'stems', packFolderName);
        
        await supabase
          .from('sample_stems')
          .insert([
            {
              sample_id: sampleData.id,
              name: stem.name || stem.type,
              stem_type: stem.type,
              file_url: stemUrl,
              order_index: stem.id
            }
          ]);
      }

      // Upload MIDI
      if (midiUrl) {
        await supabase
          .from('sample_midi')
          .insert([
            {
              sample_id: sampleData.id,
              file_url: midiUrl
            }
          ]);
      }

      // Log the upload
      const { data: adminData } = await supabase
        .from('admins')
        .select('id')
        .eq('user_id', user.id)
        .single();

      await supabase
        .from('upload_logs')
        .insert([
          {
            admin_id: adminData?.id,
            sample_id: sampleData.id,
            action: 'upload',
            details: { 
              name: formData.name, 
              bpm: formData.bpm,
              stems: uploadedStems.length,
              has_midi: hasMidi,
              is_premium: formData.is_premium
            }
          }
        ]);

      setMessage({ type: 'success', text: 'Sample pack uploaded successfully!' });
      
      // Reset form
      setFormData({
        name: '',
        artist: 'Project Feelz',
        bpm: '',
        key: 'C Minor',
        genre: 'Electronic',
        mood: 'Energetic',
        featured: false,
        is_premium: false,
        price: '0.00'
      });
      setMainLoopFile(null);
      setThumbnailFile(null);
      setMidiFile(null);
      setStems([
        { id: 1, name: '', type: 'Melody', file: null },
        { id: 2, name: '', type: 'Counter Melody', file: null },
        { id: 3, name: '', type: 'Bass', file: null },
        { id: 4, name: '', type: 'Synth', file: null },
        { id: 5, name: '', type: 'Drums', file: null }
      ]);
      
      // Refresh lists
      fetchSamples();
      fetchUploadLogs();

      // Clear message after 5 seconds
      setTimeout(() => setMessage({ type: '', text: '' }), 5000);
    } catch (error) {
      console.error('Upload error:', error);
      setMessage({ type: 'error', text: error.message });
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (sample) => {
    if (!window.confirm(`Are you sure you want to delete "${sample.name}"?`)) {
      return;
    }

    try {
      // Delete from database (cascades to stems and midi)
      const { error: dbError } = await supabase
        .from('samples')
        .delete()
        .eq('id', sample.id);

      if (dbError) throw dbError;

      // Delete pack folder from storage
      const packFolderName = sample.name.toLowerCase().replace(/[^a-z0-9]/g, '-');
      
      // List all files in pack folder
      const { data: files } = await supabase.storage
        .from('feelz-samples')
        .list(packFolderName, { limit: 100 });

      if (files && files.length > 0) {
        const filePaths = files.map(file => `${packFolderName}/${file.name}`);
        await supabase.storage
          .from('feelz-samples')
          .remove(filePaths);
      }

      // Log the deletion
      const { data: adminData } = await supabase
        .from('admins')
        .select('id')
        .eq('user_id', user.id)
        .single();

      await supabase
        .from('upload_logs')
        .insert([
          {
            admin_id: adminData?.id,
            sample_id: sample.id,
            action: 'delete',
            details: { name: sample.name }
          }
        ]);

      setMessage({ type: 'success', text: 'Sample pack deleted successfully!' });
      fetchSamples();
      fetchUploadLogs();
      
      setTimeout(() => setMessage({ type: '', text: '' }), 3000);
    } catch (error) {
      console.error('Delete error:', error);
      setMessage({ type: 'error', text: error.message });
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-purple-900 to-gray-900 text-white">
      {/* Header */}
      <header className="border-b border-purple-500/30 backdrop-blur-lg bg-black/30">
        <div className="container mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-purple-400">Admin Panel</h1>
              <p className="text-sm text-purple-300">Feelz Machine - Sample Pack Manager</p>
            </div>
            
            <div className="flex items-center space-x-4">
              <span className="text-sm text-purple-300">{user.email}</span>
              <button
                onClick={onLogout}
                className="flex items-center space-x-2 px-4 py-2 bg-red-500/20 hover:bg-red-500/30 rounded-lg transition"
              >
                <LogOut className="w-4 h-4" />
                <span>Logout</span>
              </button>
            </div>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-6 py-8">
        {/* Message Banner */}
        {message.text && (
          <div className={`mb-6 p-4 rounded-lg flex items-center space-x-3 ${
            message.type === 'success' 
              ? 'bg-green-500/20 border border-green-500/50 text-green-300'
              : 'bg-red-500/20 border border-red-500/50 text-red-300'
          }`}>
            {message.type === 'success' ? (
              <CheckCircle className="w-5 h-5" />
            ) : (
              <XCircle className="w-5 h-5" />
            )}
            <span>{message.text}</span>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Upload Form */}
          <div className="lg:col-span-2 bg-black/40 backdrop-blur-xl rounded-2xl p-6 border border-purple-500/30">
            <h2 className="text-xl font-bold mb-6 flex items-center space-x-2">
              <Upload className="w-5 h-5" />
              <span>Upload New Sample Pack</span>
            </h2>

            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Main Loop */}
              <div className="bg-purple-950/30 rounded-lg p-4 border border-purple-500/20">
                <label className="block text-sm font-semibold text-purple-300 mb-2">
                  <Music className="w-4 h-4 inline mr-2" />
                  Main Loop (Full Mix) *
                </label>
                <input
                  type="file"
                  accept="audio/*"
                  onChange={(e) => setMainLoopFile(e.target.files[0])}
                  required
                  className="w-full px-4 py-2 bg-purple-950/50 border border-purple-500/30 rounded-lg text-white file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-purple-500 file:text-white hover:file:bg-purple-600"
                />
                {mainLoopFile && (
                  <p className="text-xs text-purple-400 mt-1">✓ {mainLoopFile.name}</p>
                )}
              </div>

              {/* Thumbnail */}
              <div className="bg-purple-950/30 rounded-lg p-4 border border-purple-500/20">
                <label className="block text-sm font-semibold text-purple-300 mb-2">
                  <ImageIcon className="w-4 h-4 inline mr-2" />
                  Thumbnail *
                </label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => setThumbnailFile(e.target.files[0])}
                  required
                  className="w-full px-4 py-2 bg-purple-950/50 border border-purple-500/30 rounded-lg text-white file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-purple-500 file:text-white hover:file:bg-purple-600"
                />
                {thumbnailFile && (
                  <p className="text-xs text-purple-400 mt-1">✓ {thumbnailFile.name}</p>
                )}
              </div>

              {/* Pack Details */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-purple-300 mb-2">
                    Pack Name *
                  </label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    required
                    placeholder="e.g., Dark Trap Bundle"
                    className="w-full px-4 py-2 bg-purple-950/50 border border-purple-500/30 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 text-white"
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-purple-300 mb-2">
                    Artist
                  </label>
                  <input
                    type="text"
                    value={formData.artist}
                    onChange={(e) => setFormData({ ...formData, artist: e.target.value })}
                    className="w-full px-4 py-2 bg-purple-950/50 border border-purple-500/30 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 text-white"
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-purple-300 mb-2">
                    BPM *
                  </label>
                  <input
                    type="number"
                    value={formData.bpm}
                    onChange={(e) => setFormData({ ...formData, bpm: e.target.value })}
                    required
                    min="40"
                    max="200"
                    placeholder="120"
                    className="w-full px-4 py-2 bg-purple-950/50 border border-purple-500/30 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 text-white"
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-purple-300 mb-2">
                    Key *
                  </label>
                  <select
                    value={formData.key}
                    onChange={(e) => setFormData({ ...formData, key: e.target.value })}
                    className="w-full px-4 py-2 bg-purple-950/50 border border-purple-500/30 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 text-white"
                  >
                    {keys.map(key => (
                      <option key={key} value={key}>{key}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-purple-300 mb-2">
                    Genre
                  </label>
                  <select
                    value={formData.genre}
                    onChange={(e) => setFormData({ ...formData, genre: e.target.value })}
                    className="w-full px-4 py-2 bg-purple-950/50 border border-purple-500/30 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 text-white"
                  >
                    {genres.map(genre => (
                      <option key={genre} value={genre}>{genre}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-purple-300 mb-2">
                    Mood
                  </label>
                  <select
                    value={formData.mood}
                    onChange={(e) => setFormData({ ...formData, mood: e.target.value })}
                    className="w-full px-4 py-2 bg-purple-950/50 border border-purple-500/30 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 text-white"
                  >
                    {moods.map(mood => (
                      <option key={mood} value={mood}>{mood}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Stems Section */}
              <div className="bg-purple-950/30 rounded-lg p-4 border border-purple-500/20">
                <h3 className="text-lg font-bold mb-4 flex items-center space-x-2 text-purple-300">
                  <Layers className="w-5 h-5" />
                  <span>Stems (Optional - up to 5)</span>
                </h3>
                
                <div className="space-y-3">
                  {stems.map((stem) => (
                    <div key={stem.id} className="grid grid-cols-12 gap-2 items-end">
                      <div className="col-span-3">
                        <label className="block text-xs text-purple-400 mb-1">Type</label>
                        <select
                          value={stem.type}
                          onChange={(e) => handleStemTypeChange(stem.id, e.target.value)}
                          className="w-full px-2 py-1.5 text-sm bg-purple-950/50 border border-purple-500/30 rounded-lg text-white"
                        >
                          {stemTypes.map(type => (
                            <option key={type} value={type}>{type}</option>
                          ))}
                        </select>
                      </div>
                      
                      <div className="col-span-3">
                        <label className="block text-xs text-purple-400 mb-1">Custom Name</label>
                        <input
                          type="text"
                          value={stem.name}
                          onChange={(e) => handleStemNameChange(stem.id, e.target.value)}
                          placeholder="Optional"
                          className="w-full px-2 py-1.5 text-sm bg-purple-950/50 border border-purple-500/30 rounded-lg text-white"
                        />
                      </div>
                      
                      <div className="col-span-6">
                        <label className="block text-xs text-purple-400 mb-1">Audio File</label>
                        <input
                          type="file"
                          accept="audio/*"
                          onChange={(e) => handleStemFileChange(stem.id, e.target.files[0])}
                          className="w-full text-xs bg-purple-950/50 border border-purple-500/30 rounded-lg text-white file:mr-2 file:py-1 file:px-2 file:rounded file:border-0 file:bg-purple-500 file:text-white file:text-xs"
                        />
                      </div>
                      
                      {stem.file && (
                        <div className="col-span-12">
                          <p className="text-xs text-green-400">✓ {stem.file.name}</p>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* MIDI File */}
              <div className="bg-purple-950/30 rounded-lg p-4 border border-purple-500/20">
                <label className="block text-sm font-semibold text-purple-300 mb-2">
                  <FileMusic className="w-4 h-4 inline mr-2" />
                  MIDI File (Optional)
                </label>
                <input
                  type="file"
                  accept=".mid,.midi"
                  onChange={(e) => setMidiFile(e.target.files[0])}
                  className="w-full px-4 py-2 bg-purple-950/50 border border-purple-500/30 rounded-lg text-white file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-purple-500 file:text-white hover:file:bg-purple-600"
                />
                {midiFile && (
                  <p className="text-xs text-purple-400 mt-1">✓ {midiFile.name}</p>
                )}
              </div>

              {/* Pricing */}
              <div className="bg-purple-950/30 rounded-lg p-4 border border-purple-500/20">
                <div className="flex items-center space-x-3 mb-3">
                  <input
                    type="checkbox"
                    id="is_premium"
                    checked={formData.is_premium}
                    onChange={(e) => setFormData({ ...formData, is_premium: e.target.checked })}
                    className="w-4 h-4 accent-purple-500"
                  />
                  <label htmlFor="is_premium" className="text-sm font-semibold text-purple-300 flex items-center space-x-2">
                    <DollarSign className="w-4 h-4" />
                    <span>Premium Pack (Requires Payment)</span>
                  </label>
                </div>
                
                {formData.is_premium && (
                  <div className="ml-7">
                    <label className="block text-xs text-purple-400 mb-1">Price (USD)</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0.99"
                      value={formData.price}
                      onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                      placeholder="9.99"
                      className="w-32 px-3 py-1.5 text-sm bg-purple-950/50 border border-purple-500/30 rounded-lg text-white"
                    />
                  </div>
                )}
              </div>

              {/* Featured */}
              <div className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  id="featured"
                  checked={formData.featured}
                  onChange={(e) => setFormData({ ...formData, featured: e.target.checked })}
                  className="w-4 h-4 accent-purple-500"
                />
                <label htmlFor="featured" className="text-sm text-purple-300">
                  Mark as Featured
                </label>
              </div>

              {/* Submit Button */}
              <button
                type="submit"
                disabled={uploading}
                className="w-full py-3 bg-purple-500 hover:bg-purple-600 disabled:bg-purple-900 disabled:cursor-not-allowed rounded-lg font-semibold transition flex items-center justify-center space-x-2"
              >
                {uploading ? (
                  <>
                    <Loader className="w-5 h-5 animate-spin" />
                    <span>Uploading Pack...</span>
                  </>
                ) : (
                  <>
                    <Upload className="w-5 h-5" />
                    <span>Upload Sample Pack</span>
                  </>
                )}
              </button>
            </form>
          </div>

          {/* Sample List & Logs */}
          <div className="space-y-6">
            {/* Recent Samples */}
            <div className="bg-black/40 backdrop-blur-xl rounded-2xl p-6 border border-purple-500/30">
              <h2 className="text-xl font-bold mb-4">Recent Packs ({samples.length})</h2>
              
              {loading ? (
                <div className="text-center py-8">
                  <Loader className="w-8 h-8 mx-auto animate-spin text-purple-400" />
                </div>
              ) : samples.length === 0 ? (
                <p className="text-center text-purple-300 py-8">No packs yet. Upload your first one!</p>
              ) : (
                <div className="space-y-2 max-h-96 overflow-y-auto custom-scrollbar">
                  {samples.map((sample) => (
                    <div
                      key={sample.id}
                      className="p-3 bg-purple-950/30 rounded-lg border border-purple-500/20 hover:border-purple-400/50 transition"
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center space-x-2">
                            <p className="font-semibold truncate">{sample.name}</p>
                            {sample.is_premium && (
                              <span className="px-2 py-0.5 bg-yellow-500/20 text-yellow-300 text-xs rounded">
                                ${sample.price}
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-purple-300">
                            {sample.bpm} BPM • {sample.key} • {sample.genre}
                          </p>
                          <div className="flex items-center space-x-2 mt-1">
                            {sample.has_stems && (
                              <span className="text-xs px-2 py-0.5 bg-purple-500/20 text-purple-300 rounded">
                                Stems
                              </span>
                            )}
                            {sample.has_midi && (
                              <span className="text-xs px-2 py-0.5 bg-blue-500/20 text-blue-300 rounded">
                                MIDI
                              </span>
                            )}
                          </div>
                        </div>
                        <button
                          onClick={() => handleDelete(sample)}
                          className="ml-3 p-2 bg-red-500/20 hover:bg-red-500/30 rounded-lg transition"
                        >
                          <Trash2 className="w-4 h-4 text-red-400" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Upload Logs */}
            <div className="bg-black/40 backdrop-blur-xl rounded-2xl p-6 border border-purple-500/30">
              <h2 className="text-xl font-bold mb-4 flex items-center space-x-2">
                <Clock className="w-5 h-5" />
                <span>Activity Log</span>
              </h2>
              
              {uploadLogs.length === 0 ? (
                <p className="text-center text-purple-300 py-4">No activity yet</p>
              ) : (
                <div className="space-y-2 max-h-64 overflow-y-auto custom-scrollbar">
                  {uploadLogs.map((log) => (
                    <div
                      key={log.id}
                      className="p-2 bg-purple-950/20 rounded-lg text-sm"
                    >
                      <p className="text-purple-300">
                        <span className={`font-semibold ${
                          log.action === 'upload' ? 'text-green-400' : 'text-red-400'
                        }`}>
                          {log.action === 'upload' ? '↑ Uploaded' : '↓ Deleted'}
                        </span>
                        {' '}{log.details?.name}
                      </p>
                      <p className="text-xs text-purple-400">
                        {new Date(log.created_at).toLocaleString()}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default AdminPanel;