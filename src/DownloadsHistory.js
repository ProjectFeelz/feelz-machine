import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from './supabaseClient';
import {
  Download,
  Search,
  Copy,
  RefreshCw,
  ChevronLeft,
  Music,
  Loader,
  Check,
  Calendar,
  User,
  Hash
} from 'lucide-react';

function DownloadsHistory({ user }) {
  const navigate = useNavigate();
  const [downloads, setDownloads] = useState([]);
  const [filteredDownloads, setFilteredDownloads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [copiedId, setCopiedId] = useState(null);
  const [downloadingId, setDownloadingId] = useState(null);

  useEffect(() => {
    fetchDownloads();
  }, [user.id]);

  useEffect(() => {
    if (searchTerm) {
      setFilteredDownloads(
        downloads.filter(d =>
          d.sample.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
          d.sample.artist?.toLowerCase().includes(searchTerm.toLowerCase()) ||
          d.sample.genre?.toLowerCase().includes(searchTerm.toLowerCase())
        )
      );
    } else {
      setFilteredDownloads(downloads);
    }
  }, [searchTerm, downloads]);

  const fetchDownloads = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('user_downloads')
        .select(`
          id,
          sample_id,
          download_type,
          created_at,
          samples (
            id,
            name,
            artist,
            bpm,
            key,
            genre,
            mood,
            thumbnail_url,
            main_loop_url,
            has_stems
          )
        `)
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Transform data to flatten sample info
      const formattedDownloads = data.map(d => ({
        id: d.id,
        sample_id: d.sample_id,
        download_type: d.download_type,
        created_at: d.created_at,
        sample: d.samples
      }));

      setDownloads(formattedDownloads);
      setFilteredDownloads(formattedDownloads);
    } catch (error) {
      console.error('Error fetching downloads:', error);
    }
    setLoading(false);
  };

  const copyCredit = (sample) => {
    const creditText = `Prod. by ${sample.artist}`;
    navigator.clipboard.writeText(creditText);
    setCopiedId(sample.id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleReDownload = async (sample, downloadType) => {
    setDownloadingId(sample.id);

    try {
      if (downloadType === 'loop' || downloadType === 'main_loop') {
        // Download main loop
        const response = await fetch(sample.main_loop_url);
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `${sample.name} - ${sample.artist}.wav`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.URL.revokeObjectURL(url);
      } else if (downloadType === 'stems' && sample.has_stems) {
        // Fetch and download stems
        const { data: stems } = await supabase
          .from('sample_stems')
          .select('*')
          .eq('sample_id', sample.id);

        if (stems && stems.length > 0) {
          for (const stem of stems) {
            const response = await fetch(stem.file_url);
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `${sample.name} - ${stem.name}.wav`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            window.URL.revokeObjectURL(url);
            
            // Small delay between downloads
            await new Promise(resolve => setTimeout(resolve, 500));
          }
        }
      }

      // Log the re-download
      await supabase.from('user_downloads').insert([{
        user_id: user.id,
        sample_id: sample.id,
        download_type: downloadType
      }]);

    } catch (error) {
      console.error('Re-download error:', error);
      alert('Failed to re-download. Please try again.');
    }

    setDownloadingId(null);
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
      <div className="max-w-6xl mx-auto">
        {/* Back Button */}
        <button
          onClick={() => navigate('/profile')}
          className="flex items-center space-x-2 text-cyan-300 hover:text-cyan-200 mb-6 transition"
        >
          <ChevronLeft className="w-5 h-5" />
          <span>Back to Profile</span>
        </button>

        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl md:text-4xl font-bold bg-gradient-to-r from-blue-400 to-cyan-400 bg-clip-text text-transparent mb-2">
            Download History
          </h1>
          <p className="text-cyan-300 text-sm">
            {downloads.length} {downloads.length === 1 ? 'pack' : 'packs'} downloaded
          </p>
        </div>

        {/* Search Bar */}
        <div className="bg-white/5 backdrop-blur-xl rounded-lg p-4 border border-cyan-400/20 mb-6">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-cyan-400" />
            <input
              type="text"
              placeholder="Search by name, artist, or genre..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-3 bg-blue-950/50 border border-cyan-500/30 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
            />
          </div>
        </div>

        {/* Downloads List */}
        {filteredDownloads.length === 0 ? (
          <div className="text-center py-16">
            <Music className="w-16 h-16 mx-auto mb-4 text-cyan-400 opacity-50" />
            <p className="text-xl text-cyan-400 mb-2">
              {searchTerm ? 'No downloads found' : 'No downloads yet'}
            </p>
            {searchTerm && <p className="text-sm text-cyan-500">Try a different search term</p>}
            {!searchTerm && (
              <button
                onClick={() => navigate('/')}
                className="mt-4 px-6 py-2 bg-gradient-to-r from-blue-500 to-cyan-500 hover:from-blue-600 hover:to-cyan-600 rounded-lg font-semibold transition"
              >
                Browse Sample Packs
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            {filteredDownloads.map((download) => (
              <div
                key={download.id}
                className="bg-white/5 backdrop-blur-xl rounded-lg p-4 md:p-6 border border-cyan-400/20 hover:border-cyan-400/40 transition"
              >
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                  {/* Left: Thumbnail + Info */}
                  <div className="flex items-start space-x-4 flex-1">
                    {download.sample.thumbnail_url ? (
                      <img
                        src={download.sample.thumbnail_url}
                        alt={download.sample.name}
                        className="w-20 h-20 md:w-24 md:h-24 rounded-lg object-cover flex-shrink-0"
                      />
                    ) : (
                      <div className="w-20 h-20 md:w-24 md:h-24 rounded-lg bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center flex-shrink-0">
                        <Music className="w-10 h-10 text-white" />
                      </div>
                    )}

                    <div className="flex-1 min-w-0">
                      <h3 className="text-lg md:text-xl font-bold text-white mb-2 truncate">
                        {download.sample.name}
                      </h3>

                      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
                        <div className="flex items-center space-x-1 text-cyan-400">
                          <User className="w-4 h-4" />
                          <span className="truncate">{download.sample.artist}</span>
                        </div>

                        <div className="flex items-center space-x-1 text-cyan-400">
                          <Hash className="w-4 h-4" />
                          <span>{download.sample.bpm} BPM</span>
                        </div>

                        <div className="flex items-center space-x-1 text-cyan-400">
                          <Music className="w-4 h-4" />
                          <span className="truncate">{download.sample.key}</span>
                        </div>

                        <div className="flex items-center space-x-1 text-cyan-400">
                          <span className="truncate">{download.sample.genre}</span>
                        </div>
                      </div>

                      {download.sample.mood && (
                        <p className="text-xs text-cyan-500 mt-2">Mood: {download.sample.mood}</p>
                      )}

                      <div className="flex items-center space-x-1 text-xs text-cyan-600 mt-2">
                        <Calendar className="w-3 h-3" />
                        <span>Downloaded {new Date(download.created_at).toLocaleDateString()}</span>
                      </div>
                    </div>
                  </div>

                  {/* Right: Action Buttons */}
                  <div className="flex flex-col space-y-2 md:w-48">
                    <button
                      onClick={() => copyCredit(download.sample)}
                      className="px-4 py-2 bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-600 hover:to-emerald-600 rounded-lg font-semibold transition flex items-center justify-center space-x-2 text-sm"
                    >
                      {copiedId === download.sample.id ? (
                        <>
                          <Check className="w-4 h-4" />
                          <span>Copied!</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-4 h-4" />
                          <span>Copy Credit</span>
                        </>
                      )}
                    </button>

                    <button
                      onClick={() => handleReDownload(download.sample, download.download_type)}
                      disabled={downloadingId === download.sample.id}
                      className="px-4 py-2 bg-gradient-to-r from-blue-500 to-cyan-500 hover:from-blue-600 hover:to-cyan-600 disabled:from-gray-600 disabled:to-gray-700 disabled:cursor-not-allowed rounded-lg font-semibold transition flex items-center justify-center space-x-2 text-sm"
                    >
                      {downloadingId === download.sample.id ? (
                        <>
                          <Loader className="w-4 h-4 animate-spin" />
                          <span>Downloading...</span>
                        </>
                      ) : (
                        <>
                          <RefreshCw className="w-4 h-4" />
                          <span>Re-Download</span>
                        </>
                      )}
                    </button>

                    {download.sample.has_stems && (
                      <span className="text-xs text-center text-cyan-500 px-2 py-1 bg-cyan-500/10 rounded">
                        Includes Stems
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default DownloadsHistory;