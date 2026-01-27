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
  Mail
} from 'lucide-react';
import EmailCampaigns from './EmailCampaigns';

function AdminPanel({ user, onLogout }) {
  const [activeTab, setActiveTab] = useState('upload'); // upload, email
  const [samples, setSamples] = useState([]);
  const [uploadLogs, setUploadLogs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });

  const [formData, setFormData] = useState({
    name: '',
    artist: 'Project Feelz',
    bpm: '',
    key: 'C Minor',
    genre: 'Electronic',
    mood: 'Energetic',
    featured: false
  });

  const [mainLoopFile, setMainLoopFile] = useState(null);
  const [thumbnailFile, setThumbnailFile] = useState(null);
  const [stems, setStems] = useState([
    { id: 1, name: '', type: 'Melody', file: null },
    { id: 2, name: '', type: 'Counter Melody', file: null },
    { id: 3, name: '', type: 'Bass', file: null },
    { id: 4, name: '', type: 'Synth', file: null },
    { id: 5, name: '', type: 'Drums', file: null }
  ]);

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
    if (activeTab === 'upload') {
      fetchSamples();
      fetchUploadLogs();
    }
  }, [activeTab]);

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
      const packFolderName = formData.name.toLowerCase().replace(/[^a-z0-9]/g, '-');

      const mainLoopUrl = await uploadFile(mainLoopFile, 'main', packFolderName);
      const thumbnailUrl = await uploadFile(thumbnailFile, 'thumbnails', packFolderName);

      const uploadedStems = stems.filter(s => s.file);
      const hasStems = uploadedStems.length > 0;

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
            file_url: mainLoopUrl,
            main_loop_url: mainLoopUrl,
            thumbnail_url: thumbnailUrl,
            featured: formData.featured,
            is_pack: true,
            has_stems: hasStems,
            has_midi: false
          }
        ])
        .select()
        .single();

      if (sampleError) throw sampleError;

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
              stems: uploadedStems.length
            }
          }
        ]);

      setMessage({ type: 'success', text: 'Sample pack uploaded successfully!' });
      
      setFormData({
        name: '',
        artist: 'Project Feelz',
        bpm: '',
        key: 'C Minor',
        genre: 'Electronic',
        mood: 'Energetic',
        featured: false
      });
      setMainLoopFile(null);
      setThumbnailFile(null);
      setStems([
        { id: 1, name: '', type: 'Melody', file: null },
        { id: 2, name: '', type: 'Counter Melody', file: null },
        { id: 3, name: '', type: 'Bass', file: null },
        { id: 4, name: '', type: 'Synth', file: null },
        { id: 5, name: '', type: 'Drums', file: null }
      ]);
      
      fetchSamples();
      fetchUploadLogs();

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
      const { error: dbError } = await supabase
        .from('samples')
        .delete()
        .eq('id', sample.id);

      if (dbError) throw dbError;

      const packFolderName = sample.name.toLowerCase().replace(/[^a-z0-9]/g, '-');
      
      const { data: files } = await supabase.storage
        .from('feelz-samples')
        .list(packFolderName, { limit: 100 });

      if (files && files.length > 0) {
        const filePaths = files.map(file => `${packFolderName}/${file.name}`);
        await supabase.storage
          .from('feelz-samples')
          .remove(filePaths);
      }

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
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-blue-900 to-gray-900 text-white">
      {/* Header */}
      <header className="border-b border-cyan-500/30 backdrop-blur-lg bg-black/30">
        <div className="container mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-cyan-400">Admin Panel</h1>
              <p className="text-sm text-cyan-300">Feelz Machine Management</p>
            </div>
            
            <div className="flex items-center space-x-4">
              <span className="text-sm text-cyan-300">{user.email}</span>
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

        {/* Navigation Tabs */}
        <div className="flex space-x-2 mb-8">
          <button
            onClick={() => setActiveTab('upload')}
            className={`flex items-center space-x-2 px-6 py-3 rounded-lg transition ${
              activeTab === 'upload'
                ? 'bg-blue-500 text-white'
                : 'bg-blue-950/50 text-cyan-300 hover:bg-blue-900/50'
            }`}
          >
            <Upload className="w-5 h-5" />
            <span>Upload Samples</span>
          </button>

          <button
            onClick={() => setActiveTab('email')}
            className={`flex items-center space-x-2 px-6 py-3 rounded-lg transition ${
              activeTab === 'email'
                ? 'bg-blue-500 text-white'
                : 'bg-blue-950/50 text-cyan-300 hover:bg-blue-900/50'
            }`}
          >
            <Mail className="w-5 h-5" />
            <span>Email Campaigns</span>
          </button>
        </div>

        {/* Upload Tab */}
        {activeTab === 'upload' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Upload Form */}
            <div className="lg:col-span-2 bg-black/40 backdrop-blur-xl rounded-2xl p-6 border border-cyan-500/30">
              <h2 className="text-xl font-bold mb-6 flex items-center space-x-2">
                <Upload className="w-5 h-5" />
                <span>Upload New Sample Pack</span>
              </h2>

              <form onSubmit={handleSubmit} className="space-y-6">
                {/* Main Loop */}
                <div className="bg-blue-950/30 rounded-lg p-4 border border-cyan-500/20">
                  <label className="block text-sm font-semibold text-cyan-300 mb-2">
                    <Music className="w-4 h-4 inline mr-2" />
                    Main Loop (Full Mix) *
                  </label>
                  <input
                    type="file"
                    accept="audio/*"
                    onChange={(e) => setMainLoopFile(e.target.files[0])}
                    required
                    className="w-full px-4 py-2 bg-blue-950/50 border border-cyan-500/30 rounded-lg text-white file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-cyan-500 file:text-white hover:file:bg-cyan-600"
                  />
                  {mainLoopFile && (
                    <p className="text-xs text-cyan-400 mt-1">✓ {mainLoopFile.name}</p>
                  )}
                </div>

                {/* Thumbnail */}
                <div className="bg-blue-950/30 rounded-lg p-4 border border-cyan-500/20">
                  <label className="block text-sm font-semibold text-cyan-300 mb-2">
                    <ImageIcon className="w-4 h-4 inline mr-2" />
                    Thumbnail *
                  </label>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => setThumbnailFile(e.target.files[0])}
                    required
                    className="w-full px-4 py-2 bg-blue-950/50 border border-cyan-500/30 rounded-lg text-white file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-cyan-500 file:text-white hover:file:bg-cyan-600"
                  />
                  {thumbnailFile && (
                    <p className="text-xs text-cyan-400 mt-1">✓ {thumbnailFile.name}</p>
                  )}
                </div>

                {/* Pack Details */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-semibold text-cyan-300 mb-2">
                      Pack Name *
                    </label>
                    <input
                      type="text"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      required
                      placeholder="e.g., Dark Trap Bundle"
                      className="w-full px-4 py-2 bg-blue-950/50 border border-cyan-500/30 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500 text-white"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-cyan-300 mb-2">
                      Artist
                    </label>
                    <input
                      type="text"
                      value={formData.artist}
                      onChange={(e) => setFormData({ ...formData, artist: e.target.value })}
                      className="w-full px-4 py-2 bg-blue-950/50 border border-cyan-500/30 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500 text-white"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-cyan-300 mb-2">
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
                      className="w-full px-4 py-2 bg-blue-950/50 border border-cyan-500/30 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500 text-white"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-cyan-300 mb-2">
                      Key *
                    </label>
                    <select
                      value={formData.key}
                      onChange={(e) => setFormData({ ...formData, key: e.target.value })}
                      className="w-full px-4 py-2 bg-blue-950/50 border border-cyan-500/30 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500 text-white"
                    >
                      {keys.map(key => (
                        <option key={key} value={key}>{key}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-cyan-300 mb-2">
                      Genre
                    </label>
                    <select
                      value={formData.genre}
                      onChange={(e) => setFormData({ ...formData, genre: e.target.value })}
                      className="w-full px-4 py-2 bg-blue-950/50 border border-cyan-500/30 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500 text-white"
                    >
                      {genres.map(genre => (
                        <option key={genre} value={genre}>{genre}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-cyan-300 mb-2">
                      Mood
                    </label>
                    <select
                      value={formData.mood}
                      onChange={(e) => setFormData({ ...formData, mood: e.target.value })}
                      className="w-full px-4 py-2 bg-blue-950/50 border border-cyan-500/30 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500 text-white"
                    >
                      {moods.map(mood => (
                        <option key={mood} value={mood}>{mood}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Stems Section */}
                <div className="bg-blue-950/30 rounded-lg p-4 border border-cyan-500/20">
                  <h3 className="text-lg font-bold mb-4 flex items-center space-x-2 text-cyan-300">
                    <Layers className="w-5 h-5" />
                    <span>Stems (Optional - up to 5)</span>
                  </h3>
                  
                  <div className="space-y-3">
                    {stems.map((stem) => (
                      <div key={stem.id} className="grid grid-cols-12 gap-2 items-end">
                        <div className="col-span-3">
                          <label className="block text-xs text-cyan-400 mb-1">Type</label>
                          <select
                            value={stem.type}
                            onChange={(e) => handleStemTypeChange(stem.id, e.target.value)}
                            className="w-full px-2 py-1.5 text-sm bg-blue-950/50 border border-cyan-500/30 rounded-lg text-white"
                          >
                            {stemTypes.map(type => (
                              <option key={type} value={type}>{type}</option>
                            ))}
                          </select>
                        </div>
                        
                        <div className="col-span-3">
                          <label className="block text-xs text-cyan-400 mb-1">Custom Name</label>
                          <input
                            type="text"
                            value={stem.name}
                            onChange={(e) => handleStemNameChange(stem.id, e.target.value)}
                            placeholder="Optional"
                            className="w-full px-2 py-1.5 text-sm bg-blue-950/50 border border-cyan-500/30 rounded-lg text-white"
                          />
                        </div>
                        
                        <div className="col-span-6">
                          <label className="block text-xs text-cyan-400 mb-1">Audio File</label>
                          <input
                            type="file"
                            accept="audio/*"
                            onChange={(e) => handleStemFileChange(stem.id, e.target.files[0])}
                            className="w-full text-xs bg-blue-950/50 border border-cyan-500/30 rounded-lg text-white file:mr-2 file:py-1 file:px-2 file:rounded file:border-0 file:bg-cyan-500 file:text-white file:text-xs"
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

                {/* Featured */}
                <div className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    id="featured"
                    checked={formData.featured}
                    onChange={(e) => setFormData({ ...formData, featured: e.target.checked })}
                    className="w-4 h-4 accent-cyan-500"
                  />
                  <label htmlFor="featured" className="text-sm text-cyan-300">
                    Mark as Featured
                  </label>
                </div>

                {/* Submit Button */}
                <button
                  type="submit"
                  disabled={uploading}
                  className="w-full py-3 bg-gradient-to-r from-blue-500 to-cyan-500 hover:from-blue-600 hover:to-cyan-600 disabled:from-gray-600 disabled:to-gray-700 disabled:cursor-not-allowed rounded-lg font-semibold transition flex items-center justify-center space-x-2"
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
              <div className="bg-black/40 backdrop-blur-xl rounded-2xl p-6 border border-cyan-500/30">
                <h2 className="text-xl font-bold mb-4">Recent Packs ({samples.length})</h2>
                
                {loading ? (
                  <div className="text-center py-8">
                    <Loader className="w-8 h-8 mx-auto animate-spin text-cyan-400" />
                  </div>
                ) : samples.length === 0 ? (
                  <p className="text-center text-cyan-300 py-8">No packs yet. Upload your first one!</p>
                ) : (
                  <div className="space-y-2 max-h-96 overflow-y-auto">
                    {samples.map((sample) => (
                      <div
                        key={sample.id}
                        className="p-3 bg-blue-950/30 rounded-lg border border-cyan-500/20 hover:border-cyan-400/50 transition"
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center space-x-2">
                              <p className="font-semibold truncate">{sample.name}</p>
                            </div>
                            <p className="text-xs text-cyan-300">
                              {sample.bpm} BPM • {sample.key} • {sample.genre}
                            </p>
                            <div className="flex items-center space-x-2 mt-1">
                              {sample.has_stems && (
                                <span className="text-xs px-2 py-0.5 bg-cyan-500/20 text-cyan-300 rounded">
                                  Stems
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
              <div className="bg-black/40 backdrop-blur-xl rounded-2xl p-6 border border-cyan-500/30">
                <h2 className="text-xl font-bold mb-4 flex items-center space-x-2">
                  <Clock className="w-5 h-5" />
                  <span>Activity Log</span>
                </h2>
                
                {uploadLogs.length === 0 ? (
                  <p className="text-center text-cyan-300 py-4">No activity yet</p>
                ) : (
                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    {uploadLogs.map((log) => (
                      <div
                        key={log.id}
                        className="p-2 bg-blue-950/20 rounded-lg text-sm"
                      >
                        <p className="text-cyan-300">
                          <span className={`font-semibold ${
                            log.action === 'upload' ? 'text-green-400' : 'text-red-400'
                          }`}>
                            {log.action === 'upload' ? '↑ Uploaded' : '↓ Deleted'}
                          </span>
                          {' '}{log.details?.name}
                        </p>
                        <p className="text-xs text-cyan-400">
                          {new Date(log.created_at).toLocaleString()}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Email Tab */}
        {activeTab === 'email' && (
          <EmailCampaigns user={user} />
        )}
      </div>
    </div>
  );
}

export default AdminPanel;