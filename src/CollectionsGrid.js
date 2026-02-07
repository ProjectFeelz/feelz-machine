import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from './supabaseClient';
import { Folder, Music, ChevronLeft, Loader, Play, Youtube } from 'lucide-react';

function CollectionsGrid() {
  const navigate = useNavigate();
  const [collections, setCollections] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchCollections();
  }, []);

  const fetchCollections = async () => {
    setLoading(true);
    
    try {
      // Fetch all public collections with pack counts
      const { data: collectionsData, error } = await supabase
        .from('collections')
        .select(`
          *,
          samples (count)
        `)
        .eq('is_public', true)
        .order('created_at', { ascending: false });

      if (error) throw error;

      setCollections(collectionsData || []);
    } catch (error) {
      console.error('Error fetching collections:', error);
    }

    setLoading(false);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-blue-900 to-gray-900 flex items-center justify-center">
        <Loader className="w-12 h-12 text-cyan-400 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-blue-900 to-gray-900 text-white p-4 md:p-8">
      <div className="max-w-7xl mx-auto">
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
          <h1 className="text-3xl md:text-5xl font-bold bg-gradient-to-r from-blue-400 to-cyan-400 bg-clip-text text-transparent mb-2">
            Browse Collections
          </h1>
          <p className="text-cyan-300">
            Curated sample pack collections for your productions
          </p>
        </div>

        {/* Collections Grid */}
        {collections.length === 0 ? (
          <div className="text-center py-16 bg-white/5 backdrop-blur-xl rounded-2xl border border-cyan-400/20">
            <Folder className="w-16 h-16 mx-auto mb-4 text-cyan-400 opacity-50" />
            <p className="text-xl text-cyan-400">No collections available yet</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {collections.map((collection) => (
              <button
                key={collection.id}
                onClick={() => navigate(`/collection/${collection.id}`)}
                className="group bg-white/5 backdrop-blur-xl rounded-2xl border border-cyan-400/20 hover:border-cyan-400/60 transition overflow-hidden text-left"
              >
                {/* Cover Image */}
                {collection.cover_image_url ? (
                  <div className="aspect-square overflow-hidden relative">
                    <img
                      src={collection.cover_image_url}
                      alt={collection.name}
                      className="w-full h-full object-cover group-hover:scale-105 transition duration-300"
                    />
                    {collection.youtube_url && (
                      <div className="absolute top-3 right-3 bg-red-600 p-2 rounded-lg shadow-lg">
                        <Youtube className="w-5 h-5 text-white" />
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="aspect-square bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center">
                    <Folder className="w-24 h-24 text-white opacity-50" />
                  </div>
                )}

                {/* Info */}
                <div className="p-6">
                  <h3 className="text-xl font-bold text-white mb-2 group-hover:text-cyan-300 transition">
                    {collection.name}
                  </h3>
                  
                  {collection.description && (
                    <p className="text-cyan-400 text-sm mb-4 line-clamp-2">
                      {collection.description}
                    </p>
                  )}

                  <div className="flex items-center justify-between text-cyan-500 text-sm">
                    <div className="flex items-center space-x-2">
                      <Music className="w-4 h-4" />
                      <span>{collection.samples?.[0]?.count || 0} Packs</span>
                    </div>
                    {collection.youtube_url && (
                      <div className="flex items-center space-x-1 text-red-400">
                        <Play className="w-4 h-4" />
                        <span>Video</span>
                      </div>
                    )}
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default CollectionsGrid;