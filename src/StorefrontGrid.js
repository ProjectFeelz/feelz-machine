import React, { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';
import { motion } from 'framer-motion';
import { Search, Filter, TrendingUp, Clock, Star, Loader, Music, Layers, FileText } from 'lucide-react';

function StorefrontGrid({ onPackSelect, selectedPack }) {
  const [packs, setPacks] = useState([]);
  const [filteredPacks, setFilteredPacks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState('all');
  const [filters, setFilters] = useState({ genre: '', mood: '', bpm: '', key: '' });
  const [showFilters, setShowFilters] = useState(false);

  useEffect(() => {
    fetchPacks();
  }, []);

  useEffect(() => {
    applyFilters();
  }, [searchTerm, activeTab, filters, packs]);

  const fetchPacks = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('samples')
      .select('*')
      .eq('is_pack', true)
      .order('created_at', { ascending: false });

    if (!error) {
      setPacks(data || []);
    }
    setLoading(false);
  };

  const applyFilters = () => {
    let filtered = packs;

    if (searchTerm) {
      filtered = filtered.filter(p =>
        p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (p.artist && p.artist.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (p.genre && p.genre.toLowerCase().includes(searchTerm.toLowerCase()))
      );
    }

    if (activeTab === 'featured') {
      filtered = filtered.filter(p => p.featured);
    } else if (activeTab === 'trending') {
      filtered = filtered.sort((a, b) => b.plays - a.plays).slice(0, 20);
    } else if (activeTab === 'new') {
      filtered = filtered.sort((a, b) => 
        new Date(b.created_at) - new Date(a.created_at)
      ).slice(0, 20);
    }

    if (filters.genre) {
      filtered = filtered.filter(p => p.genre === filters.genre);
    }
    if (filters.mood) {
      filtered = filtered.filter(p => p.mood === filters.mood);
    }
    if (filters.key) {
      filtered = filtered.filter(p => p.key === filters.key);
    }
    if (filters.bpm) {
      const targetBpm = parseInt(filters.bpm);
      filtered = filtered.filter(p => Math.abs(p.bpm - targetBpm) <= 10);
    }

    setFilteredPacks(filtered);
  };

  const genres = [...new Set(packs.map(p => p.genre).filter(Boolean))];
  const moods = [...new Set(packs.map(p => p.mood).filter(Boolean))];
  const keys = [...new Set(packs.map(p => p.key).filter(Boolean))];

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader className="w-12 h-12 animate-spin text-cyan-400" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="bg-white/5 backdrop-blur-2xl rounded-2xl p-4 border border-cyan-400/20 shadow-2xl shadow-black/40">
        <div className="flex flex-col lg:flex-row gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-cyan-400" />
            <input
              type="text"
              placeholder="Search packs..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-3 bg-blue-950/50 border border-cyan-500/30 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500 text-white"
            />
          </div>

          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`flex items-center space-x-2 px-6 py-3 rounded-lg transition ${
              showFilters
                ? 'bg-blue-500 text-white'
                : 'bg-blue-950/50 text-cyan-300 hover:bg-blue-900/50'
            }`}
          >
            <Filter className="w-5 h-5" />
            <span>Filters</span>
          </button>
        </div>

        <div className="flex flex-wrap gap-2 mt-4">
          <button
            onClick={() => setActiveTab('all')}
            className={`flex items-center space-x-2 px-4 py-2 rounded-lg transition ${
              activeTab === 'all'
                ? 'bg-gradient-to-r from-blue-500/90 to-cyan-500/90 text-white shadow-lg shadow-blue-500/50 backdrop-blur-xl'
                : 'bg-white/5 text-cyan-300 hover:bg-white/10 backdrop-blur-xl border border-cyan-500/20'
            }`}
          >
            <Music className="w-4 h-4" />
            <span className="text-sm">All Packs</span>
          </button>

          <button
            onClick={() => setActiveTab('featured')}
            className={`flex items-center space-x-2 px-4 py-2 rounded-lg transition ${
              activeTab === 'featured'
                ? 'bg-gradient-to-r from-blue-500/90 to-cyan-500/90 text-white shadow-lg shadow-blue-500/50 backdrop-blur-xl'
                : 'bg-white/5 text-cyan-300 hover:bg-white/10 backdrop-blur-xl border border-cyan-500/20'
            }`}
          >
            <Star className="w-4 h-4" />
            <span className="text-sm">Featured</span>
          </button>

          <button
            onClick={() => setActiveTab('trending')}
            className={`flex items-center space-x-2 px-4 py-2 rounded-lg transition ${
              activeTab === 'trending'
                ? 'bg-gradient-to-r from-blue-500/90 to-cyan-500/90 text-white shadow-lg shadow-blue-500/50 backdrop-blur-xl'
                : 'bg-white/5 text-cyan-300 hover:bg-white/10 backdrop-blur-xl border border-cyan-500/20'
            }`}
          >
            <TrendingUp className="w-4 h-4" />
            <span className="text-sm">Trending</span>
          </button>

          <button
            onClick={() => setActiveTab('new')}
            className={`flex items-center space-x-2 px-4 py-2 rounded-lg transition ${
              activeTab === 'new'
                ? 'bg-gradient-to-r from-blue-500/90 to-cyan-500/90 text-white shadow-lg shadow-blue-500/50 backdrop-blur-xl'
                : 'bg-white/5 text-cyan-300 hover:bg-white/10 backdrop-blur-xl border border-cyan-500/20'
            }`}
          >
            <Clock className="w-4 h-4" />
            <span className="text-sm">New</span>
          </button>
        </div>

        {showFilters && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="grid grid-cols-2 lg:grid-cols-4 gap-3 mt-4 pt-4 border-t border-cyan-500/20"
          >
            <select
              value={filters.genre}
              onChange={(e) => setFilters({ ...filters, genre: e.target.value })}
              className="px-3 py-2 bg-blue-950/50 border border-cyan-500/30 rounded-lg text-white text-sm"
            >
              <option value="">All Genres</option>
              {genres.map(genre => (
                <option key={genre} value={genre}>{genre}</option>
              ))}
            </select>

            <select
              value={filters.mood}
              onChange={(e) => setFilters({ ...filters, mood: e.target.value })}
              className="px-3 py-2 bg-blue-950/50 border border-cyan-500/30 rounded-lg text-white text-sm"
            >
              <option value="">All Moods</option>
              {moods.map(mood => (
                <option key={mood} value={mood}>{mood}</option>
              ))}
            </select>

            <select
              value={filters.key}
              onChange={(e) => setFilters({ ...filters, key: e.target.value })}
              className="px-3 py-2 bg-blue-950/50 border border-cyan-500/30 rounded-lg text-white text-sm"
            >
              <option value="">All Keys</option>
              {keys.map(key => (
                <option key={key} value={key}>{key}</option>
              ))}
            </select>

            <input
              type="number"
              placeholder="BPM"
              value={filters.bpm}
              onChange={(e) => setFilters({ ...filters, bpm: e.target.value })}
              className="px-3 py-2 bg-blue-950/50 border border-cyan-500/30 rounded-lg text-white text-sm"
            />
          </motion.div>
        )}
      </div>

      {filteredPacks.length === 0 ? (
        <div className="text-center py-20">
          <Music className="w-16 h-16 mx-auto mb-4 text-cyan-400 opacity-50" />
          <p className="text-xl text-cyan-300">No packs found</p>
          <p className="text-sm text-cyan-400 mt-2">Try adjusting your filters</p>
        </div>
      ) : (
        <div className={`grid gap-3 ${
          selectedPack 
            ? 'grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5'
            : 'grid-cols-2 md:grid-cols-3 lg:grid-cols-5 xl:grid-cols-7 2xl:grid-cols-8'
        }`}>
          {filteredPacks.map((pack) => (
            <motion.div
              key={pack.id}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => onPackSelect(pack)}
              className={`cursor-pointer rounded-xl overflow-hidden border transition-all ${
                selectedPack?.id === pack.id
                  ? 'border-cyan-400/60 shadow-2xl shadow-cyan-500/50 ring-2 ring-cyan-400/30'
                  : 'border-cyan-500/20 hover:border-cyan-400/40 hover:shadow-xl hover:shadow-cyan-500/20'
              }`}
            >
              <div className="aspect-square relative bg-gradient-to-br from-blue-900 to-black">
                {pack.thumbnail_url ? (
                  <img
                    src={pack.thumbnail_url}
                    alt={pack.name}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <Music className="w-16 h-16 text-cyan-400 opacity-50" />
                  </div>
                )}

                {pack.featured && (
                  <div className="absolute top-2 left-2 px-2 py-1 bg-cyan-500 text-black text-xs font-bold rounded flex items-center space-x-1">
                    <Star className="w-3 h-3" />
                    <span>Featured</span>
                  </div>
                )}

                <div className="absolute bottom-2 left-2 flex space-x-1">
                  {pack.has_stems && (
                    <div className="px-2 py-0.5 bg-black/70 backdrop-blur-sm text-white text-xs rounded flex items-center space-x-1">
                      <Layers className="w-3 h-3" />
                    </div>
                  )}
                  {pack.has_midi && (
                    <div className="px-2 py-0.5 bg-black/70 backdrop-blur-sm text-white text-xs rounded flex items-center space-x-1">
                      <FileText className="w-3 h-3" />
                    </div>
                  )}
                </div>
              </div>

              <div className="p-3 bg-black/20 backdrop-blur-xl border-t border-white/10">
                <h3 className="font-bold text-white text-sm truncate mb-1">{pack.name}</h3>
                <p className="text-xs text-cyan-300 truncate mb-2">{pack.artist}</p>
                <div className="flex items-center justify-between text-xs">
                  <span className="px-2 py-0.5 bg-white/10 text-cyan-300 rounded backdrop-blur-md border border-white/10">
                    {pack.bpm} BPM
                  </span>
                  <span className="px-2 py-0.5 bg-white/10 text-cyan-300 rounded backdrop-blur-md border border-white/10">
                    {pack.key}
                  </span>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}

export default StorefrontGrid;