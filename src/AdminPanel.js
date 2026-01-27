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
  Clock
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
    featured: false
  });
  const [audioFile, setAudioFile] = useState(null);
  const [thumbnailFile, setThumbnailFile] = useState(null);

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
    'Hip Hop', 'Trap', 'Electronic', 'House', 'Techno',
    'Ambient', 'Lo-Fi', 'Jazz', 'Rock', 'Pop', 'R&B', 'Other'
  ];

  const moods = [
    'Energetic', 'Dark', 'Chill', 'Happy', 'Sad',
    'Aggressive', 'Dreamy', 'Uplifting', 'Melancholic'
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

  const handleFileChange = (e, type) => {
    const file = e.target.files[0];
    if (type === 'audio') {
      setAudioFile(file);
    } else {
      setThumbnailFile(file);
    }
  };

  const uploadFile = async (file, folder) => {
    const fileExt = file.name.split('.').pop();
    const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;
    const filePath = `${folder}/${fileName}`;

    const { data, error } = await supabase.storage
      .from('feelz-samples')
      .upload(filePath, file);

    if (error) throw error;

    const { data: { publicUrl } } = supabase.storage
      .from('feelz-samples')
      .getPublicUrl(filePath);

    return publicUrl;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!audioFile) {
      setMessage({ type: 'error', text: 'Please select an audio file' });
      return;
    }

    setUploading(true);
    setMessage({ type: '', text: '' });

    try {
      // Upload audio file
      const audioUrl = await uploadFile(audioFile, 'audio');

      // Upload thumbnail if provided
      let thumbnailUrl = null;
      if (thumbnailFile) {
        thumbnailUrl = await uploadFile(thumbnailFile, 'thumbnails');
      }

      // Insert sample into database
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
            file_url: audioUrl,
            thumbnail_url: thumbnailUrl,
            featured: formData.featured
          }
        ])
        .select()
        .single();

      if (sampleError) throw sampleError;

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
            details: { name: formData.name, bpm: formData.bpm }
          }
        ]);

      setMessage({ type: 'success', text: 'Sample uploaded successfully!' });
      
      // Reset form
      setFormData({
        name: '',
        artist: 'Project Feelz',
        bpm: '',
        key: 'C Minor',
        genre: 'Electronic',
        mood: 'Energetic',
        featured: false
      });
      setAudioFile(null);
      setThumbnailFile(null);
      
      // Refresh lists
      fetchSamples();
      fetchUploadLogs();

      // Clear message after 3 seconds
      setTimeout(() => setMessage({ type: '', text: '' }), 3000);
    } catch (error) {
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
      // Delete from database
      const { error: dbError } = await supabase
        .from('samples')
        .delete()
        .eq('id', sample.id);

      if (dbError) throw dbError;

      // Delete files from storage
      if (sample.file_url) {
        const audioPath = sample.file_url.split('/feelz-samples/')[1];
        await supabase.storage.from('feelz-samples').remove([audioPath]);
      }

      if (sample.thumbnail_url) {
        const thumbPath = sample.thumbnail_url.split('/feelz-samples/')[1];
        await supabase.storage.from('feelz-samples').remove([thumbPath]);
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

      setMessage({ type: 'success', text: 'Sample deleted successfully!' });
      fetchSamples();
      fetchUploadLogs();
      
      setTimeout(() => setMessage({ type: '', text: '' }), 3000);
    } catch (error) {
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
              <p className="text-sm text-purple-300">Feelz Machine</p>
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

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Upload Form */}
          <div className="bg-black/40 backdrop-blur-xl rounded-2xl p-6 border border-purple-500/30">
            <h2 className="text-xl font-bold mb-6 flex items-center space-x-2">
              <Upload className="w-5 h-5" />
              <span>Upload New Sample</span>
            </h2>

            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Audio File */}
              <div>
                <label className="block text-sm font-semibold text-purple-300 mb-2">
                  <Music className="w-4 h-4 inline mr-2" />
                  Audio File *
                </label>
                <input
                  type="file"
                  accept="audio/*"
                  onChange={(e) => handleFileChange(e, 'audio')}
                  required
                  className="w-full px-4 py-2 bg-purple-950/50 border border-purple-500/30 rounded-lg text-white file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-purple-500 file:text-white hover:file:bg-purple-600"
                />
                {audioFile && (
                  <p className="text-xs text-purple-400 mt-1">Selected: {audioFile.name}</p>
                )}
              </div>

              {/* Thumbnail */}
              <div>
                <label className="block text-sm font-semibold text-purple-300 mb-2">
                  <ImageIcon className="w-4 h-4 inline mr-2" />
                  Thumbnail (Optional)
                </label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => handleFileChange(e, 'thumbnail')}
                  className="w-full px-4 py-2 bg-purple-950/50 border border-purple-500/30 rounded-lg text-white file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-purple-500 file:text-white hover:file:bg-purple-600"
                />
                {thumbnailFile && (
                  <p className="text-xs text-purple-400 mt-1">Selected: {thumbnailFile.name}</p>
                )}
              </div>

              {/* Name */}
              <div>
                <label className="block text-sm font-semibold text-purple-300 mb-2">
                  Sample Name *
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  required
                  placeholder="e.g., Dark Trap Drums"
                  className="w-full px-4 py-2 bg-purple-950/50 border border-purple-500/30 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 text-white"
                />
              </div>

              {/* Artist */}
              <div>
                <label className="block text-sm font-semibold text-purple-300 mb-2">
                  Artist
                </label>
                <input
                  type="text"
                  value={formData.artist}
                  onChange={(e) => setFormData({ ...formData, artist: e.target.value })}
                  placeholder="Project Feelz"
                  className="w-full px-4 py-2 bg-purple-950/50 border border-purple-500/30 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 text-white"
                />
              </div>

              {/* BPM and Key */}
              <div className="grid grid-cols-2 gap-4">
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
              </div>

              {/* Genre and Mood */}
              <div className="grid grid-cols-2 gap-4">
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
                    <span>Uploading...</span>
                  </>
                ) : (
                  <>
                    <Upload className="w-5 h-5" />
                    <span>Upload Sample</span>
                  </>
                )}
              </button>
            </form>
          </div>

          {/* Sample List & Logs */}
          <div className="space-y-6">
            {/* Recent Samples */}
            <div className="bg-black/40 backdrop-blur-xl rounded-2xl p-6 border border-purple-500/30">
              <h2 className="text-xl font-bold mb-4">Recent Uploads ({samples.length})</h2>
              
              {loading ? (
                <div className="text-center py-8">
                  <Loader className="w-8 h-8 mx-auto animate-spin text-purple-400" />
                </div>
              ) : samples.length === 0 ? (
                <p className="text-center text-purple-300 py-8">No samples yet. Upload your first one!</p>
              ) : (
                <div className="space-y-2 max-h-96 overflow-y-auto custom-scrollbar">
                  {samples.map((sample) => (
                    <div
                      key={sample.id}
                      className="p-3 bg-purple-950/30 rounded-lg border border-purple-500/20 hover:border-purple-400/50 transition"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold truncate">{sample.name}</p>
                          <p className="text-xs text-purple-300">
                            {sample.bpm} BPM • {sample.key} • {sample.genre}
                          </p>
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