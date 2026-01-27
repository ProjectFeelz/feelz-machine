import React, { useState, useEffect, useRef } from 'react';
import { supabase } from './supabaseClient';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  X, 
  Play, 
  Pause, 
  Download, 
  Volume2, 
  VolumeX,
  Loader,
  CheckCircle
} from 'lucide-react';
import KnobControl from './KnobControl';

function PackPlayer({ pack, onClose, user, processor }) {
  const [stems, setStems] = useState([]);
  const [midi, setMidi] = useState(null);
  const [loading, setLoading] = useState(true);
  const [playingMain, setPlayingMain] = useState(false);
  const [playingStems, setPlayingStems] = useState({});
  const [stemVolumes, setStemVolumes] = useState({});
  const [mutedStems, setMutedStems] = useState(new Set());
  
  const [effects, setEffects] = useState({
    tape: 0,
    vinyl: 0,
    reverb: 0,
    delay: 0,
    distortion: 0
  });

  const canvasRef = useRef(null);
  const animationRef = useRef(null);

  useEffect(() => {
    if (pack) {
      fetchPackDetails();
    }
    
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [pack]);

  useEffect(() => {
    if (playingMain || Object.values(playingStems).some(v => v)) {
      startVisualization();
    }
  }, [playingMain, playingStems]);

  const fetchPackDetails = async () => {
    setLoading(true);
    
    // Fetch stems
    const { data: stemsData } = await supabase
      .from('sample_stems')
      .select('*')
      .eq('sample_id', pack.id)
      .order('order_index');
    
    setStems(stemsData || []);
    
    // Initialize stem volumes
    const volumes = {};
    stemsData?.forEach(stem => {
      volumes[stem.id] = 1.0;
    });
    setStemVolumes(volumes);
    
    // Fetch MIDI
    if (pack.has_midi) {
      const { data: midiData } = await supabase
        .from('sample_midi')
        .select('*')
        .eq('sample_id', pack.id)
        .single();
      
      setMidi(midiData);
    }
    
    setLoading(false);
  };

  const startVisualization = () => {
    const canvas = canvasRef.current;
    if (!canvas || !processor) return;
    
    const ctx = canvas.getContext('2d');
    
    const draw = () => {
      const dataArray = processor.getAnalyserData();
      const bufferLength = dataArray.length;
      
      ctx.fillStyle = 'rgba(10, 10, 15, 0.3)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      
      const barWidth = (canvas.width / bufferLength) * 2.5;
      let x = 0;
      
      for (let i = 0; i < bufferLength; i++) {
        const barHeight = (dataArray[i] / 255) * canvas.height * 0.8;
        
        const gradient = ctx.createLinearGradient(0, canvas.height - barHeight, 0, canvas.height);
        gradient.addColorStop(0, '#8b5cf6');
        gradient.addColorStop(0.5, '#a78bfa');
        gradient.addColorStop(1, '#c4b5fd');
        
        ctx.fillStyle = gradient;
        ctx.fillRect(x, canvas.height - barHeight, barWidth, barHeight);
        
        x += barWidth + 1;
      }
      
      animationRef.current = requestAnimationFrame(draw);
    };
    
    draw();
  };

  const toggleMainLoop = async () => {
    if (!user) {
      alert('Please sign in to play samples');
      return;
    }

    if (playingMain) {
      processor?.stopAllNotes();
      setPlayingMain(false);
    } else {
      try {
        await processor?.loadAudio(pack.main_loop_url || pack.file_url);
        // Play at normal pitch (no polyphonic, just play the sample)
        const source = processor.audioContext.createBufferSource();
        source.buffer = processor.currentBuffer;
        source.connect(processor.masterGain);
        source.start();
        
        source.onended = () => {
          setPlayingMain(false);
        };
        
        setPlayingMain(true);
        
        // Track interaction
        await supabase.from('sample_interactions').insert([{
          user_id: user.id,
          sample_id: pack.id,
          interaction_type: 'play',
          bpm: pack.bpm,
          key: pack.key,
          genre: pack.genre,
          mood: pack.mood
        }]);
      } catch (error) {
        console.error('Error playing:', error);
        alert('Failed to load audio');
      }
    }
  };

  const toggleStem = async (stem) => {
    if (!user) {
      alert('Please sign in to play samples');
      return;
    }

    const stemId = stem.id;
    
    if (playingStems[stemId]) {
      processor?.stopNote(stemId);
      setPlayingStems(prev => ({ ...prev, [stemId]: false }));
    } else {
      try {
        await processor?.loadAudio(stem.file_url);
        
        const source = processor.audioContext.createBufferSource();
        source.buffer = processor.currentBuffer;
        const gainNode = processor.audioContext.createGain();
        gainNode.gain.value = stemVolumes[stemId] || 1.0;
        source.connect(gainNode);
        gainNode.connect(processor.masterGain);
        source.start();
        
        source.onended = () => {
          setPlayingStems(prev => ({ ...prev, [stemId]: false }));
        };
        
        setPlayingStems(prev => ({ ...prev, [stemId]: true }));
        
        // Track stem interaction
        await supabase.from('sample_interactions').insert([{
          user_id: user.id,
          sample_id: pack.id,
          stem_id: stem.id,
          interaction_type: 'play',
          bpm: pack.bpm,
          key: pack.key,
          genre: pack.genre
        }]);
      } catch (error) {
        console.error('Error playing stem:', error);
      }
    }
  };

  const handleDownload = async (url, filename, itemType = 'main') => {
    if (!user) {
      alert('Please sign in to download');
      return;
    }

    try {
      // Track download
      await supabase.from('user_downloads').insert([{
        user_id: user.id,
        sample_id: pack.id,
        download_type: itemType
      }]);

      // Trigger browser download
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      link.target = '_blank';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (error) {
      console.error('Download error:', error);
      alert('Download failed');
    }
  };

  const handleDownloadAll = () => {
    alert('ZIP download coming soon! For now, download files individually.');
  };

  const handleEffectChange = (effectName, value) => {
    setEffects(prev => ({ ...prev, [effectName]: value }));
    processor?.updateEffect(effectName, value);
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ x: '100%' }}
        animate={{ x: 0 }}
        exit={{ x: '100%' }}
        transition={{ type: 'spring', damping: 30, stiffness: 300 }}
        className="fixed top-0 right-0 h-full w-full lg:w-[35%] bg-black/95 backdrop-blur-xl border-l border-purple-500/30 z-50 overflow-y-auto"
      >
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-3 right-3 p-2 bg-purple-500/20 hover:bg-purple-500/30 rounded-lg transition z-10"
        >
          <X className="w-5 h-5 text-white" />
        </button>

        <div className="p-4 space-y-4">
          {/* Visualizer with Thumbnail */}
          <div className="relative bg-black rounded-xl overflow-hidden border border-purple-500/30">
            {/* Thumbnail Overlay */}
            <div className="absolute top-3 left-3 z-10">
              {pack.thumbnail_url ? (
                <img
                  src={pack.thumbnail_url}
                  alt={pack.name}
                  className="w-16 h-16 rounded-lg shadow-2xl border-2 border-purple-400"
                />
              ) : (
                <div className="w-16 h-16 rounded-lg bg-purple-900 flex items-center justify-center">
                  <Volume2 className="w-8 h-8 text-purple-400" />
                </div>
              )}
            </div>

            {/* Visualizer Canvas */}
            <canvas
              ref={canvasRef}
              width={600}
              height={150}
              className="w-full h-36"
            />
          </div>

          {/* Pack Info */}
          <div>
            <h2 className="text-xl font-bold text-white">{pack.name}</h2>
            <p className="text-purple-300 text-sm">{pack.artist}</p>
            <div className="flex items-center flex-wrap gap-2 text-xs mt-2">
              <span className="px-2 py-1 bg-purple-900/50 text-purple-300 rounded">
                {pack.bpm} BPM
              </span>
              <span className="px-2 py-1 bg-purple-900/50 text-purple-300 rounded">
                {pack.key}
              </span>
              <span className="px-2 py-1 bg-purple-900/50 text-purple-300 rounded">
                {pack.genre}
              </span>
              <span className="px-2 py-1 bg-purple-900/50 text-purple-300 rounded">
                {pack.mood}
              </span>
            </div>
          </div>

          {/* Round Knob Effects */}
          <div className="bg-purple-950/30 rounded-xl p-4 border border-purple-500/20">
            <h3 className="text-base font-bold text-white mb-3">Effects</h3>
            <div className="grid grid-cols-5 gap-2">
              <KnobControl
                label="Tape"
                value={effects.tape}
                onChange={(v) => handleEffectChange('tape', v)}
                color="#8b5cf6"
                size="small"
              />
              <KnobControl
                label="Vinyl"
                value={effects.vinyl}
                onChange={(v) => handleEffectChange('vinyl', v)}
                color="#a78bfa"
                size="small"
              />
              <KnobControl
                label="Reverb"
                value={effects.reverb}
                onChange={(v) => handleEffectChange('reverb', v)}
                color="#c4b5fd"
                size="small"
              />
              <KnobControl
                label="Delay"
                value={effects.delay}
                onChange={(v) => handleEffectChange('delay', v)}
                color="#ddd6fe"
                size="small"
              />
              <KnobControl
                label="Dist"
                value={effects.distortion}
                onChange={(v) => handleEffectChange('distortion', v)}
                color="#ede9fe"
                size="small"
              />
            </div>
          </div>

          {/* Download List */}
          <div className="bg-purple-950/30 rounded-xl p-4 border border-purple-500/20">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-base font-bold text-white">Downloads</h3>
              <button
                onClick={handleDownloadAll}
                className="px-3 py-1.5 bg-purple-500 hover:bg-purple-600 rounded-lg text-xs font-semibold transition flex items-center space-x-1"
              >
                <Download className="w-3 h-3" />
                <span>All</span>
              </button>
            </div>

            {loading ? (
              <div className="text-center py-6">
                <Loader className="w-6 h-6 mx-auto animate-spin text-purple-400" />
              </div>
            ) : (
              <div className="space-y-2">
                {/* Main Loop */}
                <div className="p-2 bg-black/40 rounded-lg border border-purple-500/20">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2 flex-1">
                      <button
                        onClick={toggleMainLoop}
                        className="p-1.5 bg-purple-500 hover:bg-purple-600 rounded transition"
                      >
                        {playingMain ? (
                          <Pause className="w-3 h-3" />
                        ) : (
                          <Play className="w-3 h-3 ml-0.5" />
                        )}
                      </button>
                      <div>
                        <p className="font-semibold text-white text-sm">Main Loop</p>
                        <p className="text-xs text-purple-400">Full mix</p>
                      </div>
                    </div>
                    <button
                      onClick={() => handleDownload(
                        pack.main_loop_url || pack.file_url,
                        `${pack.name}-main.wav`,
                        'main'
                      )}
                      className="p-1.5 bg-purple-900/50 hover:bg-purple-800/50 rounded transition"
                    >
                      <Download className="w-3 h-3 text-purple-300" />
                    </button>
                  </div>
                </div>

                {/* Stems */}
                {stems.map((stem) => (
                  <div
                    key={stem.id}
                    className="p-2 bg-black/40 rounded-lg border border-purple-500/20"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-2 flex-1 min-w-0">
                        <button
                          onClick={() => toggleStem(stem)}
                          disabled={mutedStems.has(stem.id)}
                          className="p-1.5 bg-purple-500 hover:bg-purple-600 disabled:bg-gray-600 rounded transition flex-shrink-0"
                        >
                          {playingStems[stem.id] ? (
                            <Pause className="w-3 h-3" />
                          ) : (
                            <Play className="w-3 h-3 ml-0.5" />
                          )}
                        </button>
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-white text-sm truncate">
                            {stem.name}
                          </p>
                          <p className="text-xs text-purple-400">{stem.stem_type}</p>
                        </div>
                      </div>
                      <button
                        onClick={() => handleDownload(
                          stem.file_url,
                          `${pack.name}-${stem.name}.wav`,
                          'stem'
                        )}
                        className="p-1.5 bg-purple-900/50 hover:bg-purple-800/50 rounded transition ml-2 flex-shrink-0"
                      >
                        <Download className="w-3 h-3 text-purple-300" />
                      </button>
                    </div>
                  </div>
                ))}

                {/* MIDI */}
                {midi && (
                  <div className="p-2 bg-black/40 rounded-lg border border-purple-500/20">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                        <div className="p-1.5 bg-blue-500/20 rounded">
                          <CheckCircle className="w-3 h-3 text-blue-400" />
                        </div>
                        <div>
                          <p className="font-semibold text-white text-sm">MIDI File</p>
                          <p className="text-xs text-purple-400">Musical notation</p>
                        </div>
                      </div>
                      <button
                        onClick={() => handleDownload(
                          midi.file_url,
                          `${pack.name}.mid`,
                          'midi'
                        )}
                        className="p-1.5 bg-purple-900/50 hover:bg-purple-800/50 rounded transition"
                      >
                        <Download className="w-3 h-3 text-purple-300" />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}

export default PackPlayer;