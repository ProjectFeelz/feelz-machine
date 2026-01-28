import React, { useState, useEffect, useRef } from 'react';
import { supabase } from './supabaseClient';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  X, 
  Play, 
  Pause, 
  Download, 
  Loader
} from 'lucide-react';
import KnobControl from './KnobControl';
import audioBufferToWav from 'audiobuffer-to-wav';

function PackPlayer({ pack, onClose, user, processor }) {
  const [stems, setStems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentAudio, setCurrentAudio] = useState('main');
  const [processingEffect, setProcessingEffect] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });
  
  const [effects, setEffects] = useState({
    tape: 0,
    vinyl: 0,
    reverb: 0,
    delay: 0,
    distortion: 0,
    pitch: 0,
    speed: 1.0
  });

  const canvasRef = useRef(null);
  const animationRef = useRef(null);

  useEffect(() => {
    if (pack) {
      fetchPackDetails();
      loadMainAudio();
    }
    
    return () => {
      processor?.stop();
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [pack]);

  useEffect(() => {
    if (isPlaying) {
      startVisualization();
    }
  }, [isPlaying]);

  const fetchPackDetails = async () => {
    setLoading(true);
    
    const { data: stemsData } = await supabase
      .from('sample_stems')
      .select('*')
      .eq('sample_id', pack.id)
      .order('order_index');
    
    setStems(stemsData || []);
    setLoading(false);
  };

  const loadMainAudio = async () => {
    try {
      await processor?.loadAudio(pack.main_loop_url || pack.file_url);
      setCurrentAudio('main');
    } catch (error) {
      console.error('Error loading audio:', error);
      alert('Failed to load audio');
    }
  };

  const loadStemAudio = async (stem) => {
    try {
      await processor?.loadAudio(stem.file_url);
      setCurrentAudio(stem.id);
    } catch (error) {
      console.error('Error loading stem:', error);
      alert('Failed to load stem');
    }
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
        gradient.addColorStop(0, '#3b82f6');
        gradient.addColorStop(0.5, '#06b6d4');
        gradient.addColorStop(1, '#10b981');
        
        ctx.fillStyle = gradient;
        ctx.fillRect(x, canvas.height - barHeight, barWidth, barHeight);
        
        x += barWidth + 1;
      }
      
      if (isPlaying) {
        animationRef.current = requestAnimationFrame(draw);
      }
    };
    
    draw();
  };

  const togglePlayPause = async () => {
    if (!user) {
      alert('Please sign in to play samples');
      return;
    }

    if (isPlaying) {
      processor?.stop();
      setIsPlaying(false);
    } else {
      try {
        processor?.play(effects, effects.pitch, effects.speed);
        setIsPlaying(true);
        
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
        alert('Failed to play audio');
      }
    }
  };

  const handleStemSelect = async (stem) => {
    if (!user) {
      alert('Please sign in to play samples');
      return;
    }

    if (isPlaying) {
      processor?.stop();
      setIsPlaying(false);
    }

    await loadStemAudio(stem);
    
    try {
      processor?.play(effects, effects.pitch, effects.speed);
      setIsPlaying(true);
      
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
  };

  const handleMainSelect = async () => {
    if (currentAudio === 'main') return;
    
    if (isPlaying) {
      processor?.stop();
      setIsPlaying(false);
    }

    await loadMainAudio();
  };

  const cleanFilename = (name) => {
    return name.replace(/[^a-z0-9]/gi, '-').toLowerCase();
  };

  const handleDownload = async (url, filename, itemType = 'main') => {
    if (!user) {
      alert('Please sign in to download');
      return;
    }

    try {
      await supabase.from('user_downloads').insert([{
        user_id: user.id,
        sample_id: pack.id,
        download_type: itemType
      }]);

      const response = await fetch(url);
      const blob = await response.blob();
      const blobUrl = window.URL.createObjectURL(blob);
      
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      window.URL.revokeObjectURL(blobUrl);
    } catch (error) {
      console.error('Download error:', error);
      alert('Download failed');
    }
  };

  const handleDownloadEffected = async () => {
    if (!user) {
      alert('Please sign in to download');
      return;
    }

    // Check if any effects are active
    const hasEffects = effects.tape > 0 || 
                       effects.vinyl > 0 || 
                       effects.reverb > 0 || 
                       effects.delay > 0 || 
                       effects.distortion > 0 || 
                       effects.pitch !== 0 || 
                       effects.speed !== 1.0;

    if (!hasEffects) {
      alert('No effects applied! Adjust the knobs to add effects, then download.');
      return;
    }

    setProcessingEffect(true);
    setMessage({ type: 'info', text: 'Processing audio with effects... This may take 5-10 seconds.' });

    try {
      // Render audio with effects offline
      const renderedBuffer = await processor.renderWithEffects(
        effects,
        effects.pitch,
        effects.speed
      );

      if (!renderedBuffer) {
        throw new Error('Failed to render audio');
      }

      // Convert AudioBuffer to WAV
      const wav = audioBufferToWav(renderedBuffer);
      const blob = new Blob([wav], { type: 'audio/wav' });
      
      // Create download
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${cleanFilename(pack.name)}-effected.wav`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      // Track download
      await supabase.from('user_downloads').insert([{
        user_id: user.id,
        sample_id: pack.id,
        download_type: 'effected'
      }]);

      setMessage({ type: 'success', text: 'Download complete! ✓' });
      setTimeout(() => setMessage({ type: '', text: '' }), 3000);
    } catch (error) {
      console.error('Effect download error:', error);
      setMessage({ type: 'error', text: 'Failed to process audio: ' + error.message });
      setTimeout(() => setMessage({ type: '', text: '' }), 5000);
    } finally {
      setProcessingEffect(false);
    }
  };

  const handleDownloadAll = () => {
    alert('ZIP download coming soon! For now, download files individually.');
  };

  const handleEffectChange = (effectName, value) => {
    const newEffects = { ...effects, [effectName]: value };
    setEffects(newEffects);
    
    if (isPlaying) {
      processor?.stop();
      processor?.play(newEffects, newEffects.pitch, newEffects.speed);
    }
  };

  const handlePitchChange = (value) => {
    const pitch = (value - 0.5) * 24;
    handleEffectChange('pitch', pitch);
  };

  const handleSpeedChange = (value) => {
    const speed = 0.5 + (value * 1.5);
    handleEffectChange('speed', speed);
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ x: '100%' }}
        animate={{ x: 0 }}
        exit={{ x: '100%' }}
        transition={{ type: 'spring', damping: 30, stiffness: 300 }}
        className="fixed top-0 right-0 h-full w-full lg:w-[35%] bg-black/30 backdrop-blur-2xl border-l border-cyan-400/20 z-50 overflow-y-auto shadow-2xl shadow-black/60"
      >
        <button
          onClick={onClose}
          className="absolute top-3 right-3 p-2 bg-cyan-500/20 hover:bg-cyan-500/30 rounded-lg transition z-10"
        >
          <X className="w-5 h-5 text-white" />
        </button>

        <div className="p-4 space-y-4">
          {/* Message Banner */}
          {message.text && (
            <div className={`p-3 rounded-lg text-sm ${
              message.type === 'success' 
                ? 'bg-green-500/20 border border-green-500/50 text-green-300'
                : message.type === 'error'
                ? 'bg-red-500/20 border border-red-500/50 text-red-300'
                : 'bg-blue-500/20 border border-blue-500/50 text-blue-300'
            }`}>
              {message.text}
            </div>
          )}

          {/* Visualizer */}
          <div className="relative bg-black/40 backdrop-blur-xl rounded-2xl overflow-hidden border border-cyan-400/20 shadow-xl shadow-cyan-500/10">
            <canvas
              ref={canvasRef}
              width={600}
              height={150}
              className="w-full h-36"
            />

            <div className="absolute top-3 right-3">
              <button
                onClick={togglePlayPause}
                className="p-3 bg-gradient-to-br from-blue-500/90 to-cyan-500/90 hover:from-blue-600/90 hover:to-cyan-600/90 rounded-full shadow-2xl shadow-blue-500/50 transition backdrop-blur-xl border border-white/20"
              >
                {isPlaying ? (
                  <Pause className="w-6 h-6" />
                ) : (
                  <Play className="w-6 h-6 ml-0.5" />
                )}
              </button>
            </div>
          </div>

          {/* Pack Info */}
          <div>
            <h2 className="text-xl font-bold text-white">{pack.name}</h2>
            <p className="text-cyan-300 text-sm">{pack.artist}</p>
            <div className="flex items-center flex-wrap gap-2 text-xs mt-2">
              <span className="px-2 py-1 bg-white/10 text-cyan-300 rounded backdrop-blur-md border border-white/10">
                {pack.bpm} BPM
              </span>
              <span className="px-2 py-1 bg-white/10 text-cyan-300 rounded backdrop-blur-md border border-white/10">
                {pack.key}
              </span>
              <span className="px-2 py-1 bg-white/10 text-cyan-300 rounded backdrop-blur-md border border-white/10">
                {pack.genre}
              </span>
              <span className="px-2 py-1 bg-white/10 text-cyan-300 rounded backdrop-blur-md border border-white/10">
                {pack.mood}
              </span>
            </div>
          </div>

          {/* Effects */}
          <div className="bg-white/5 backdrop-blur-2xl rounded-2xl p-4 border border-cyan-400/20 shadow-xl shadow-black/30">
            <h3 className="text-base font-bold text-white mb-3">Effects</h3>
            <div className="grid grid-cols-4 gap-3 mb-3">
              <KnobControl
                label="Tape"
                value={effects.tape}
                onChange={(v) => handleEffectChange('tape', v)}
                color="#3b82f6"
                size="small"
              />
              <KnobControl
                label="Vinyl"
                value={effects.vinyl}
                onChange={(v) => handleEffectChange('vinyl', v)}
                color="#06b6d4"
                size="small"
              />
              <KnobControl
                label="Reverb"
                value={effects.reverb}
                onChange={(v) => handleEffectChange('reverb', v)}
                color="#10b981"
                size="small"
              />
              <KnobControl
                label="Delay"
                value={effects.delay}
                onChange={(v) => handleEffectChange('delay', v)}
                color="#0ea5e9"
                size="small"
              />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <KnobControl
                label="Dist"
                value={effects.distortion}
                onChange={(v) => handleEffectChange('distortion', v)}
                color="#60a5fa"
                size="small"
              />
              <KnobControl
                label="Pitch"
                value={(effects.pitch + 12) / 24}
                onChange={handlePitchChange}
                color="#14b8a6"
                size="small"
              />
              <KnobControl
                label="Speed"
                value={(effects.speed - 0.5) / 1.5}
                onChange={handleSpeedChange}
                color="#22d3ee"
                size="small"
              />
            </div>
            <div className="mt-2 text-xs text-cyan-400 text-center">
              Pitch: {effects.pitch > 0 ? '+' : ''}{Math.round(effects.pitch)} semitones • 
              Speed: {effects.speed.toFixed(2)}x
            </div>
          </div>

          {/* Download with Effects */}
          <button
            onClick={handleDownloadEffected}
            disabled={processingEffect}
            className="w-full py-2.5 bg-gradient-to-r from-blue-500/90 to-cyan-500/90 hover:from-blue-600/90 hover:to-cyan-600/90 disabled:from-gray-600/90 disabled:to-gray-700/90 disabled:cursor-not-allowed rounded-xl font-semibold transition flex items-center justify-center space-x-2 shadow-xl shadow-cyan-500/30 backdrop-blur-xl border border-white/20"
          >
            {processingEffect ? (
              <>
                <Loader className="w-4 h-4 animate-spin" />
                <span>Processing...</span>
              </>
            ) : (
              <>
                <Download className="w-4 h-4" />
                <span>Download with Effects</span>
              </>
            )}
          </button>

          {/* Download List */}
          <div className="bg-white/5 backdrop-blur-2xl rounded-2xl p-4 border border-cyan-400/20 shadow-xl shadow-black/30">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-base font-bold text-white">Original Files</h3>
              <button
                onClick={handleDownloadAll}
                className="px-3 py-1.5 bg-blue-500 hover:bg-blue-600 rounded-lg text-xs font-semibold transition flex items-center space-x-1"
              >
                <Download className="w-3 h-3" />
                <span>All</span>
              </button>
            </div>

            {loading ? (
              <div className="text-center py-6">
                <Loader className="w-6 h-6 mx-auto animate-spin text-cyan-400" />
              </div>
            ) : (
              <div className="space-y-2">
                {/* Main Loop */}
                <div 
                  className={`p-2 bg-white/5 backdrop-blur-xl rounded-lg border transition cursor-pointer ${
                    currentAudio === 'main' 
                      ? 'border-cyan-400/60 bg-cyan-500/10 shadow-lg shadow-cyan-500/20' 
                      : 'border-white/10 hover:border-cyan-400/40 hover:bg-white/10'
                  }`}
                  onClick={handleMainSelect}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2 flex-1">
                      <div className={`p-1.5 rounded transition backdrop-blur-xl ${
                        currentAudio === 'main' ? 'bg-gradient-to-br from-blue-500/90 to-cyan-500/90 shadow-md shadow-blue-500/50' : 'bg-white/10 border border-white/10'
                      }`}>
                        <Play className="w-3 h-3" />
                      </div>
                      <div>
                        <p className="font-semibold text-white text-sm">Main Loop</p>
                        <p className="text-xs text-cyan-400">Full mix</p>
                      </div>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDownload(
                          pack.main_loop_url || pack.file_url,
                          `${cleanFilename(pack.name)}-main.wav`,
                          'main'
                        );
                      }}
                      className="p-1.5 bg-blue-900/50 hover:bg-blue-800/50 rounded transition"
                    >
                      <Download className="w-3 h-3 text-cyan-300" />
                    </button>
                  </div>
                </div>

                {/* Stems */}
                {stems.map((stem) => (
                  <div
                    key={stem.id}
                    className={`p-2 bg-white/5 backdrop-blur-xl rounded-lg border transition cursor-pointer ${
                      currentAudio === stem.id 
                        ? 'border-cyan-400/60 bg-cyan-500/10 shadow-lg shadow-cyan-500/20' 
                        : 'border-white/10 hover:border-cyan-400/40 hover:bg-white/10'
                    }`}
                    onClick={() => handleStemSelect(stem)}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-2 flex-1 min-w-0">
                        <div className={`p-1.5 rounded transition backdrop-blur-xl ${
                          currentAudio === stem.id ? 'bg-gradient-to-br from-blue-500/90 to-cyan-500/90 shadow-md shadow-blue-500/50' : 'bg-white/10 border border-white/10'
                        }`}>
                          <Play className="w-3 h-3" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-white text-sm truncate">
                            {stem.name}
                          </p>
                          <p className="text-xs text-cyan-400">{stem.stem_type}</p>
                        </div>
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDownload(
                            stem.file_url,
                            `${cleanFilename(pack.name)}-${cleanFilename(stem.name)}.wav`,
                            'stem'
                          );
                        }}
                        className="p-1.5 bg-blue-900/50 hover:bg-blue-800/50 rounded transition ml-2 flex-shrink-0"
                      >
                        <Download className="w-3 h-3 text-cyan-300" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}

export default PackPlayer;