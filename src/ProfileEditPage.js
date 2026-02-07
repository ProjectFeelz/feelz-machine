import React, { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';
import { motion } from 'framer-motion';
import { User, Save, Loader, Mail, MapPin, Music, Heart, ChevronLeft, Download } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

function ProfileEditPage({ user, profile, onUpdate }) {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });
  
  const [formData, setFormData] = useState({
    name: '',
    age: '',
    country: '',
    city: '',
    daw: '',
    production_experience: '',
    favorite_genres: []
  });

  const [customGenre, setCustomGenre] = useState('');

  const genreOptions = [
    'Hip Hop',
    'Trap',
    'Lo-Fi',
    'R&B',
    'Pop',
    'Electronic',
    'House',
    'Techno',
    'Ambient',
    'Jazz',
    'Rock',
    'Other'
  ];

  const experienceLevels = [
    'Beginner (0-1 years)',
    'Intermediate (1-3 years)',
    'Advanced (3-5 years)',
    'Professional (5+ years)'
  ];

  const dawOptions = [
    'FL Studio',
    'Ableton Live',
    'Logic Pro',
    'Pro Tools',
    'Cubase',
    'Studio One',
    'Reaper',
    'GarageBand',
    'Other'
  ];

  useEffect(() => {
    if (profile) {
      setFormData({
        name: profile.name || '',
        age: profile.age || '',
        country: profile.country || '',
        city: profile.city || '',
        daw: profile.daw || '',
        production_experience: profile.production_experience || '',
        favorite_genres: profile.favorite_genres || []
      });
    }
  }, [profile]);

  const handleGenreToggle = (genre) => {
    if (formData.favorite_genres.includes(genre)) {
      setFormData({
        ...formData,
        favorite_genres: formData.favorite_genres.filter(g => g !== genre)
      });
    } else {
      setFormData({
        ...formData,
        favorite_genres: [...formData.favorite_genres, genre]
      });
    }
  };

  const handleAddCustomGenre = () => {
    if (customGenre.trim() && !formData.favorite_genres.includes(customGenre.trim())) {
      setFormData({
        ...formData,
        favorite_genres: [...formData.favorite_genres, customGenre.trim()]
      });
      setCustomGenre('');
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      const { error } = await supabase
        .from('user_profiles')
        .update({
          name: formData.name,
          age: parseInt(formData.age) || null,
          country: formData.country,
          city: formData.city,
          daw: formData.daw,
          production_experience: formData.production_experience,
          favorite_genres: formData.favorite_genres,
          updated_at: new Date().toISOString()
        })
        .eq('user_id', user.id);

      if (error) throw error;

      setMessage({ type: 'success', text: '✓ Profile updated successfully!' });
      
      // Call parent update function if provided
      if (onUpdate) {
        onUpdate();
      }

      setTimeout(() => {
        navigate('/');
      }, 1500);
    } catch (error) {
      console.error('Update error:', error);
      setMessage({ type: 'error', text: 'Failed to update profile: ' + error.message });
    }

    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-blue-900 to-gray-900 text-white p-4 md:p-8">
      <div className="max-w-3xl mx-auto">
        {/* Back Button */}
        <button
          onClick={() => navigate('/')}
          className="flex items-center space-x-2 text-cyan-300 hover:text-cyan-200 mb-6 transition"
        >
          <ChevronLeft className="w-5 h-5" />
          <span>Back to Home</span>
        </button>

        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl md:text-4xl font-bold bg-gradient-to-r from-blue-400 to-cyan-400 bg-clip-text text-transparent mb-2">
            Edit Profile
          </h1>
          <p className="text-cyan-300 mb-4">Update your producer profile and preferences</p>

          {/* ✅ NEW: View Downloads Button */}
          <button
            onClick={() => navigate('/profile/downloads')}
            className="px-6 py-3 bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 rounded-lg font-semibold transition flex items-center space-x-2"
          >
            <Download className="w-5 h-5" />
            <span>View Download History</span>
          </button>
        </div>

        {/* Message Banner */}
        {message.text && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            className={`p-4 rounded-lg mb-6 ${
              message.type === 'success'
                ? 'bg-green-500/20 border border-green-500/50 text-green-300'
                : 'bg-red-500/20 border border-red-500/50 text-red-300'
            }`}
          >
            {message.text}
          </motion.div>
        )}

        {/* Profile Form */}
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Basic Info */}
          <div className="bg-white/5 backdrop-blur-xl rounded-2xl p-6 border border-cyan-400/20">
            <h2 className="text-xl font-bold mb-4 flex items-center space-x-2">
              <User className="w-5 h-5 text-cyan-400" />
              <span>Basic Information</span>
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-cyan-300 text-sm mb-2">Name *</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-4 py-2 bg-blue-950/50 border border-cyan-500/30 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
                  required
                />
              </div>

              <div>
                <label className="block text-cyan-300 text-sm mb-2">Age</label>
                <input
                  type="number"
                  value={formData.age}
                  onChange={(e) => setFormData({ ...formData, age: e.target.value })}
                  className="w-full px-4 py-2 bg-blue-950/50 border border-cyan-500/30 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
                />
              </div>

              <div>
                <label className="block text-cyan-300 text-sm mb-2">Email</label>
                <div className="flex items-center space-x-2 px-4 py-2 bg-blue-950/30 border border-cyan-500/20 rounded-lg text-gray-400">
                  <Mail className="w-4 h-4" />
                  <span className="text-sm">{user?.email}</span>
                </div>
                <p className="text-xs text-cyan-500 mt-1">Email cannot be changed here</p>
              </div>
            </div>
          </div>

          {/* Location */}
          <div className="bg-white/5 backdrop-blur-xl rounded-2xl p-6 border border-cyan-400/20">
            <h2 className="text-xl font-bold mb-4 flex items-center space-x-2">
              <MapPin className="w-5 h-5 text-cyan-400" />
              <span>Location</span>
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-cyan-300 text-sm mb-2">Country</label>
                <input
                  type="text"
                  value={formData.country}
                  onChange={(e) => setFormData({ ...formData, country: e.target.value })}
                  placeholder="e.g., United States"
                  className="w-full px-4 py-2 bg-blue-950/50 border border-cyan-500/30 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
                />
              </div>

              <div>
                <label className="block text-cyan-300 text-sm mb-2">City</label>
                <input
                  type="text"
                  value={formData.city}
                  onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                  placeholder="e.g., Los Angeles"
                  className="w-full px-4 py-2 bg-blue-950/50 border border-cyan-500/30 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
                />
              </div>
            </div>
          </div>

          {/* Production Info */}
          <div className="bg-white/5 backdrop-blur-xl rounded-2xl p-6 border border-cyan-400/20">
            <h2 className="text-xl font-bold mb-4 flex items-center space-x-2">
              <Music className="w-5 h-5 text-cyan-400" />
              <span>Production Setup</span>
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-cyan-300 text-sm mb-2">Primary DAW</label>
                <select
                  value={formData.daw}
                  onChange={(e) => setFormData({ ...formData, daw: e.target.value })}
                  className="w-full px-4 py-2 bg-blue-950/50 border border-cyan-500/30 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
                >
                  <option value="">Select DAW</option>
                  {dawOptions.map(daw => (
                    <option key={daw} value={daw}>{daw}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-cyan-300 text-sm mb-2">Experience Level</label>
                <select
                  value={formData.production_experience}
                  onChange={(e) => setFormData({ ...formData, production_experience: e.target.value })}
                  className="w-full px-4 py-2 bg-blue-950/50 border border-cyan-500/30 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
                >
                  <option value="">Select Experience</option>
                  {experienceLevels.map(level => (
                    <option key={level} value={level}>{level}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Favorite Genres */}
          <div className="bg-white/5 backdrop-blur-xl rounded-2xl p-6 border border-cyan-400/20">
            <h2 className="text-xl font-bold mb-4 flex items-center space-x-2">
              <Heart className="w-5 h-5 text-cyan-400" />
              <span>Favorite Genres</span>
            </h2>

            <div className="flex flex-wrap gap-2 mb-4">
              {genreOptions.map(genre => (
                <button
                  key={genre}
                  type="button"
                  onClick={() => handleGenreToggle(genre)}
                  className={`px-4 py-2 rounded-lg transition ${
                    formData.favorite_genres.includes(genre)
                      ? 'bg-gradient-to-r from-blue-500 to-cyan-500 text-white'
                      : 'bg-white/5 text-cyan-300 hover:bg-white/10'
                  }`}
                >
                  {genre}
                </button>
              ))}
            </div>

            {/* Custom Genres */}
            {formData.favorite_genres.filter(g => !genreOptions.includes(g)).length > 0 && (
              <div className="mb-4">
                <p className="text-cyan-400 text-sm mb-2">Custom Genres:</p>
                <div className="flex flex-wrap gap-2">
                  {formData.favorite_genres
                    .filter(g => !genreOptions.includes(g))
                    .map(genre => (
                      <span
                        key={genre}
                        className="px-3 py-1 bg-cyan-500/20 text-cyan-300 rounded-lg text-sm flex items-center space-x-2"
                      >
                        <span>{genre}</span>
                        <button
                          type="button"
                          onClick={() => handleGenreToggle(genre)}
                          className="text-cyan-400 hover:text-red-400"
                        >
                          ×
                        </button>
                      </span>
                    ))}
                </div>
              </div>
            )}

            {/* Add Custom Genre */}
            <div className="flex space-x-2">
              <input
                type="text"
                value={customGenre}
                onChange={(e) => setCustomGenre(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddCustomGenre())}
                placeholder="Add custom genre..."
                className="flex-1 px-4 py-2 bg-blue-950/50 border border-cyan-500/30 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
              />
              <button
                type="button"
                onClick={handleAddCustomGenre}
                className="px-4 py-2 bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 rounded-lg transition"
              >
                Add
              </button>
            </div>
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 bg-gradient-to-r from-blue-500 to-cyan-500 hover:from-blue-600 hover:to-cyan-600 disabled:from-gray-600 disabled:to-gray-700 disabled:cursor-not-allowed rounded-lg font-semibold transition flex items-center justify-center space-x-2"
          >
            {loading ? (
              <>
                <Loader className="w-5 h-5 animate-spin" />
                <span>Saving...</span>
              </>
            ) : (
              <>
                <Save className="w-5 h-5" />
                <span>Save Changes</span>
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
}

export default ProfileEditPage;