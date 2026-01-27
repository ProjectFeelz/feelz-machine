import React, { useState } from 'react';
import { supabase } from './supabaseClient';
import { User, Loader, CheckCircle } from 'lucide-react';

const COUNTRIES = [
  'United States', 'United Kingdom', 'Canada', 'Australia', 'Germany', 'France',
  'Netherlands', 'Spain', 'Italy', 'Sweden', 'Norway', 'Denmark', 'Finland',
  'Belgium', 'Switzerland', 'Austria', 'Ireland', 'Poland', 'Portugal', 'Greece',
  'South Africa', 'Nigeria', 'Kenya', 'Egypt', 'Morocco', 'Japan', 'China',
  'South Korea', 'India', 'Singapore', 'Thailand', 'Philippines', 'Indonesia',
  'Malaysia', 'Vietnam', 'Brazil', 'Argentina', 'Mexico', 'Colombia', 'Chile',
  'Peru', 'Other'
];

const GENRES = [
  'Hip Hop', 'Trap', 'Drill', 'Boom Bap', 'Lo-Fi', 'R&B', 'Pop', 
  'Electronic', 'House', 'Techno', 'Dubstep', 'Drum & Bass', 'Ambient',
  'Jazz', 'Rock', 'Metal', 'Indie', 'Alternative', 'Other'
];

const EXPERIENCE_LEVELS = [
  { value: 'beginner', label: 'Beginner (Just started)' },
  { value: 'intermediate', label: 'Intermediate (1-3 years)' },
  { value: 'advanced', label: 'Advanced (3-5 years)' },
  { value: 'professional', label: 'Professional (5+ years)' }
];

const DAWS = [
  'FL Studio', 'Ableton Live', 'Logic Pro', 'Pro Tools', 'Cubase',
  'Studio One', 'Reason', 'Reaper', 'Bitwig', 'GarageBand', 'Other', 'None yet'
];

function ProfileSetup({ user, onComplete }) {
  const [formData, setFormData] = useState({
    name: '',
    age: '',
    country: '',
    city: '',
    favorite_genres: [],
    production_experience: '',
    daw: ''
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleGenreToggle = (genre) => {
    setFormData(prev => ({
      ...prev,
      favorite_genres: prev.favorite_genres.includes(genre)
        ? prev.favorite_genres.filter(g => g !== genre)
        : [...prev.favorite_genres, genre]
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!formData.name.trim()) {
      setError('Name is required');
      return;
    }

    if (formData.favorite_genres.length === 0) {
      setError('Please select at least one favorite genre');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const { error: profileError } = await supabase
        .from('user_profiles')
        .insert([{
          user_id: user.id,
          name: formData.name.trim(),
          age: formData.age ? parseInt(formData.age) : null,
          country: formData.country || null,
          city: formData.city.trim() || null,
          favorite_genres: formData.favorite_genres,
          production_experience: formData.production_experience || null,
          daw: formData.daw || null,
          profile_completed: true
        }]);

      if (profileError) throw profileError;

      onComplete();
    } catch (error) {
      console.error('Profile setup error:', error);
      setError(error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-purple-900 to-gray-900 flex items-center justify-center p-6">
      <div className="bg-black/40 backdrop-blur-xl rounded-2xl p-8 border border-purple-500/30 max-w-2xl w-full">
        <div className="text-center mb-8">
          <User className="w-16 h-16 mx-auto mb-4 text-purple-400" />
          <h1 className="text-3xl font-bold text-white mb-2">Complete Your Profile</h1>
          <p className="text-purple-300">Help us personalize your experience (one-time setup)</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Name */}
          <div>
            <label className="block text-sm font-semibold text-purple-300 mb-2">
              Name *
            </label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              required
              className="w-full px-4 py-3 bg-purple-950/50 border border-purple-500/30 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 text-white"
              placeholder="Your name"
            />
          </div>

          {/* Age and Country */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-purple-300 mb-2">
                Age
              </label>
              <input
                type="number"
                value={formData.age}
                onChange={(e) => setFormData({ ...formData, age: e.target.value })}
                min="13"
                max="100"
                className="w-full px-4 py-3 bg-purple-950/50 border border-purple-500/30 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 text-white"
                placeholder="Optional"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-purple-300 mb-2">
                Country
              </label>
              <select
                value={formData.country}
                onChange={(e) => setFormData({ ...formData, country: e.target.value })}
                className="w-full px-4 py-3 bg-purple-950/50 border border-purple-500/30 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 text-white"
              >
                <option value="">Select...</option>
                {COUNTRIES.map(country => (
                  <option key={country} value={country}>{country}</option>
                ))}
              </select>
            </div>
          </div>

          {/* City */}
          <div>
            <label className="block text-sm font-semibold text-purple-300 mb-2">
              City
            </label>
            <input
              type="text"
              value={formData.city}
              onChange={(e) => setFormData({ ...formData, city: e.target.value })}
              className="w-full px-4 py-3 bg-purple-950/50 border border-purple-500/30 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 text-white"
              placeholder="Optional"
            />
          </div>

          {/* Favorite Genres */}
          <div>
            <label className="block text-sm font-semibold text-purple-300 mb-3">
              Favorite Genres * (select multiple)
            </label>
            <div className="grid grid-cols-3 gap-2">
              {GENRES.map(genre => (
                <button
                  key={genre}
                  type="button"
                  onClick={() => handleGenreToggle(genre)}
                  className={`px-3 py-2 rounded-lg text-sm transition ${
                    formData.favorite_genres.includes(genre)
                      ? 'bg-purple-500 text-white border-2 border-purple-400'
                      : 'bg-purple-950/50 text-purple-300 border-2 border-purple-500/30 hover:border-purple-400'
                  }`}
                >
                  {genre}
                </button>
              ))}
            </div>
          </div>

          {/* Production Experience */}
          <div>
            <label className="block text-sm font-semibold text-purple-300 mb-2">
              Production Experience
            </label>
            <select
              value={formData.production_experience}
              onChange={(e) => setFormData({ ...formData, production_experience: e.target.value })}
              className="w-full px-4 py-3 bg-purple-950/50 border border-purple-500/30 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 text-white"
            >
              <option value="">Select your level...</option>
              {EXPERIENCE_LEVELS.map(level => (
                <option key={level.value} value={level.value}>{level.label}</option>
              ))}
            </select>
          </div>

          {/* DAW */}
          <div>
            <label className="block text-sm font-semibold text-purple-300 mb-2">
              DAW (Digital Audio Workstation)
            </label>
            <select
              value={formData.daw}
              onChange={(e) => setFormData({ ...formData, daw: e.target.value })}
              className="w-full px-4 py-3 bg-purple-950/50 border border-purple-500/30 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 text-white"
            >
              <option value="">Select your DAW...</option>
              {DAWS.map(daw => (
                <option key={daw} value={daw}>{daw}</option>
              ))}
            </select>
          </div>

          {error && (
            <div className="bg-red-500/20 border border-red-500/50 rounded-lg p-3 text-red-300 text-sm">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 bg-purple-500 hover:bg-purple-600 disabled:bg-purple-900 disabled:cursor-not-allowed rounded-lg font-semibold text-white transition flex items-center justify-center space-x-2"
          >
            {loading ? (
              <>
                <Loader className="w-5 h-5 animate-spin" />
                <span>Setting up...</span>
              </>
            ) : (
              <>
                <CheckCircle className="w-5 h-5" />
                <span>Complete Setup</span>
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
}

export default ProfileSetup;