import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from './supabaseClient';
import ReactPlayer from 'react-player/youtube';
import PackPlayer from './PackPlayer';
import { ChevronLeft, Loader, Music, Play } from 'lucide-react';

function CollectionPage({ user, profile }) {
  const { id } = useParams();
  const navigate = useNavigate();
  const [collection, setCollection] = useState(null);
  const [packs, setPacks] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchCollectionData();
  }, [id]);

  const fetchCollectionData = async () => {
    setLoading(true);
    
    try {
      // Fetch collection details
      const { data: collectionData, error: collectionError } = await supabase
        .from('collections')
        .select('*')
        .eq('id', id)
        .single();

      if (collectionError) throw collectionError;
      setCollection(collectionData);

      // Fetch packs in this collection
      const { data: packsData, error: packsError } = await supabase
        .from('samples')
        .select('*')
        .eq('collection_id', id)
        .order('created_at', { ascending: false });

      if (packsError) throw packsError;
      setPacks(packsData || []);

    } catch (error) {
      console.error('Error fetching collection:', error);
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

  if (!collection) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-blue-900 to-gray-900 flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-white mb-4">Collection Not Found</h1>
          <button
            onClick={() => navigate('/collections')}
            className="px-6 py-2 bg-gradient-to-r from-blue-500 to-cyan-500 hover:from-blue-600 hover:to-cyan-600 rounded-lg font-semibold transition"
          >
            Browse Collections
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-blue-900 to-gray-900 text-white p-4 md:p-8">
      <div className="max-w-7xl mx-auto">
        {/* Back Button */}
        <button
          onClick={() => navigate('/collections')}
          className="flex items-center space-x-2 text-cyan-300 hover:text-cyan-200 mb-6 transition"
        >
          <ChevronLeft className="w-5 h-5" />
          <span>Back to Collections</span>
        </button>

        {/* Collection Header */}
        <div className="mb-8">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
            {/* Cover Image */}
            {collection.cover_image_url && (
              <div className="lg:col-span-1">
                <img
                  src={collection.cover_image_url}
                  alt={collection.name}
                  className="w-full aspect-square rounded-2xl object-cover border-2 border-cyan-400/20"
                />
              </div>
            )}

            {/* Info */}
            <div className={collection.cover_image_url ? "lg:col-span-2" : "lg:col-span-3"}>
              <h1 className="text-3xl md:text-5xl font-bold bg-gradient-to-r from-blue-400 to-cyan-400 bg-clip-text text-transparent mb-4">
                {collection.name}
              </h1>
              
              {collection.description && (
                <p className="text-cyan-300 text-lg mb-6 leading-relaxed">
                  {collection.description}
                </p>
              )}

              <div className="flex items-center space-x-6 text-cyan-400">
                <div className="flex items-center space-x-2">
                  <Music className="w-5 h-5" />
                  <span className="font-semibold">{packs.length} Packs</span>
                </div>
                <div className="flex items-center space-x-2">
                  <Play className="w-5 h-5" />
                  <span>{packs.reduce((acc, pack) => acc + (pack.plays || 0), 0)} Total Plays</span>
                </div>
              </div>
            </div>
          </div>

          {/* YouTube Video */}
          {collection.youtube_url && (
            <div className="bg-white/5 backdrop-blur-xl rounded-2xl p-6 border border-cyan-400/20 mb-8">
              <h2 className="text-xl font-bold mb-4 text-cyan-300">Collection Preview</h2>
              <div className="aspect-video w-full rounded-lg overflow-hidden">
                <ReactPlayer
                  url={collection.youtube_url}
                  width="100%"
                  height="100%"
                  controls={true}
                  config={{
                    youtube: {
                      playerVars: { showinfo: 1 }
                    }
                  }}
                />
              </div>
            </div>
          )}
        </div>

        {/* Packs in Collection */}
        <div>
          <h2 className="text-2xl font-bold mb-6 flex items-center space-x-2">
            <Music className="w-6 h-6 text-cyan-400" />
            <span>Sample Packs in This Collection</span>
          </h2>

          {packs.length === 0 ? (
            <div className="text-center py-16 bg-white/5 backdrop-blur-xl rounded-2xl border border-cyan-400/20">
              <Music className="w-16 h-16 mx-auto mb-4 text-cyan-400 opacity-50" />
              <p className="text-xl text-cyan-400">No packs in this collection yet</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4">
              {packs.map((pack) => (
                <PackPlayer
                  key={pack.id}
                  pack={pack}
                  user={user}
                  profile={profile}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default CollectionPage;