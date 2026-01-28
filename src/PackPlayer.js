import React, { useState, useEffect, useRef } from 'react';
import { supabase } from './supabaseClient';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  X, 
  Play, 
  Pause, 
  Download, 
  Loader,
  Gauge
} from 'lucide-react';
import audioBufferToWav from 'audiobuffer-to-wav';
import JSZip from 'jszip';

function PackPlayer({ pack, onClose, user, processor }) {
  const [stems, setStems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentAudio, setCurrentAudio] = useState('main');
  const [processingEffect, setProcessingEffect] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });
  const [targetBpm, setTargetBpm] = useState(pack.bpm);
  const [pitch, setPitch] = useState(0);

  const canvasRef = useRef(null);
  const animationRef = useRef(null);

  useEffect(() => {
    if (pack) {
      fetchPackDetails();
      if (processor) {
        loadMainAudio();
      }
      setTargetBpm(pack.bpm);
    }
    
    return () => {
      if (processor) {
        processor.stop();
      }
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [pack, processor]);

  useEffect(() => {
    if (isPlaying && processor) {
      startVisualization();
    }
  }, [isPlaying, processor]);

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
    if (!processor) return;
    
    try {
      await processor.loadAudio(pack.main_loop_url || pack.file_url);
      setCurrentAudio('main');
    } catch (error) {
      console.error('Error loading audio:', error);
      alert('Failed to load audio');
    }
  };

  const loadStemAudio = async (stem) => {
    if (!processor) return;
    
    try {
      await processor.loadAudio(stem.file_url);
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
    const particles = [];
    const numParticles = 80;
    
    // Initialize particles
    for (let i = 0; i < numParticles; i++) {
      particles.push({
        x: (canvas.width / numParticles) * i,
        baseY: canvas.height / 2,
        y: canvas.height / 2,
        size: Math.random() * 3 + 2,
        speed: Math.random() * 0.02 + 0.01,
        offset: Math.random() * Math.PI * 2,
        color: `rgba(${Math.random() > 0.5 ? '59, 130, 246' : '6, 182, 212'}, `,
      });
    }
    
    const draw = () => {
      const dataArray = processor.getAnalyserData();
      const bufferLength = dataArray.length;
      
      // Fade trail effect
      ctx.fillStyle = 'rgba(10, 10, 15, 0.15)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      
      // Update and draw particles
      particles.forEach((particle, i) => {
        // Get audio data for this particle
        const dataIndex = Math.floor((i / numParticles) * bufferLength);
        const amplitude = dataArray[dataIndex] / 255;
        
        // Calculate wave motion
        const wave = Math.sin(particle.offset + Date.now() * particle.speed) * 20;
        const audioInfluence = amplitude * 60;
        
        // Update position
        particle.y = particle.baseY + wave - audioInfluence;
        particle.offset += 0.02;
        
        // Draw particle with glow
        const glowSize = particle.size * (2 + amplitude * 3);
        
        // Outer glow
        const gradient = ctx.createRadialGradient(
          particle.x, particle.y, 0,
          particle.x, particle.y, glowSize
        );
        gradient.addColorStop(0, particle.color + (0.8 * amplitude) + ')');
        gradient.addColorStop(0.5, particle.color + (0.4 * amplitude) + ')');
        gradient.addColorStop(1, particle.color + '0)');
        
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(particle.x, particle.y, glowSize, 0, Math.PI * 2);
        ctx.fill();
        
        // Core particle
        ctx.fillStyle = particle.color + (0.9 + amplitude * 0.1) + ')';
        ctx.beginPath();
        ctx.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
        ctx.fill();
        
        // Connect particles with lines for wave effect
        if (i < particles.length - 1) {
          const nextParticle = particles[i + 1];
          ctx.strokeStyle = particle.color + (0.3 * amplitude) + ')';
          ctx.lineWidth = 1 + amplitude * 2;
          ctx.beginPath();
          ctx.moveTo(particle.x, particle.y);
          ctx.lineTo(nextParticle.x, nextParticle.y);
          ctx.stroke();
        }
      });
      
      if (isPlaying) {
        animationRef.current = requestAnimationFrame(draw);
      }
    };
    
    draw();
  };

  const calculateFinalSpeed = () => {
    if (!targetBpm || targetBpm <= 0) return 1.0;
    return targetBpm / pack.bpm;
  };

  const togglePlayPause = async () => {
    if (!user) {
      alert('Please sign in to play samples');
      return;
    }

    if (!processor) {
      alert('Audio system not initialized. Please click anywhere on the page first.');
      return;
    }

    if (isPlaying) {
      processor.stop();
      setIsPlaying(false);
    } else {
      try {
        const finalSpeed = calculateFinalSpeed();
        processor.play(pitch, finalSpeed);
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
        alert('Failed to play audio: ' + error.message);
      }
    }
  };

  const handleStemSelect = async (stem) => {
    if (!user) {
      alert('Please sign in to play samples');
      return;
    }

    if (!processor) {
      alert('Audio system not initialized. Please click anywhere on the page first.');
      return;
    }

    if (isPlaying) {
      processor.stop();
      setIsPlaying(false);
    }

    await loadStemAudio(stem);
    
    try {
      const finalSpeed = calculateFinalSpeed();
      processor.play(pitch, finalSpeed);
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
    
    if (isPlaying && processor) {
      processor.stop();
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

    if (!processor) {
      alert('Audio system not initialized. Please refresh the app.');
      return;
    }

    const hasChanges = pitch !== 0 || targetBpm !== pack.bpm;

    if (!hasChanges) {
      alert('No pitch or tempo changes applied! Adjust settings, then download.');
      return;
    }

    setProcessingEffect(true);
    setMessage({ type: 'info', text: 'Processing audio... This may take 5-10 seconds.' });

    try {
      const finalSpeed = calculateFinalSpeed();
      const renderedBuffer = await processor.renderWithEffects(pitch, finalSpeed);

      if (!renderedBuffer) {
        throw new Error('Failed to render audio');
      }

      const wav = audioBufferToWav(renderedBuffer);
      const blob = new Blob([wav], { type: 'audio/wav' });
      
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      const bpmSuffix = targetBpm !== pack.bpm ? `-${targetBpm}bpm` : '';
      const pitchSuffix = pitch !== 0 ? `${pitch > 0 ? '+' : ''}${Math.round(pitch)}st` : '';
      link.download = `${cleanFilename(pack.name)}${bpmSuffix}${pitchSuffix}.wav`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      await supabase.from('user_downloads').insert([{
        user_id: user.id,
        sample_id: pack.id,
        download_type: 'processed'
      }]);

      setMessage({ type: 'success', text: 'Download complete! ✓' });
      setTimeout(() => setMessage({ type: '', text: '' }), 3000);
    } catch (error) {
      console.error('Processing error:', error);
      setMessage({ type: 'error', text: 'Failed to process audio: ' + error.message });
      setTimeout(() => setMessage({ type: '', text: '' }), 5000);
    } finally {
      setProcessingEffect(false);
    }
  };

  const handleDownloadAll = async () => {
    if (!user) {
      alert('Please sign in to download');
      return;
    }

    setMessage({ type: 'info', text: 'Creating ZIP file... This may take a moment.' });

    try {
      const zip = new JSZip();
      const folder = zip.folder(cleanFilename(pack.name));

      const mainResponse = await fetch(pack.main_loop_url || pack.file_url);
      const mainBlob = await mainResponse.blob();
      folder.file(`${cleanFilename(pack.name)}-main.wav`, mainBlob);

      for (let i = 0; i < stems.length; i++) {
        const stem = stems[i];
        const stemResponse = await fetch(stem.file_url);
        const stemBlob = await stemResponse.blob();
        folder.file(`${cleanFilename(pack.name)}-${cleanFilename(stem.name)}.wav`, stemBlob);
      }

      setMessage({ type: 'info', text: 'Finalizing ZIP file...' });
      
      const zipBlob = await zip.generateAsync({ 
        type: 'blob',
        compression: 'DEFLATE',
        compressionOptions: { level: 6 }
      });

      const url = URL.createObjectURL(zipBlob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${cleanFilename(pack.name)}.zip`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      await supabase.from('user_downloads').insert([{
        user_id: user.id,
        sample_id: pack.id,
        download_type: 'zip'
      }]);

      setMessage({ type: 'success', text: 'ZIP downloaded successfully! ✓' });
      setTimeout(() => setMessage({ type: '', text: '' }), 3000);

    } catch (error) {
      console.error('ZIP download error:', error);
      setMessage({ type: 'error', text: 'Failed to create ZIP file' });
      setTimeout(() => setMessage({ type: '', text: '' }), 5000);
    }
  };

  const handlePitchChange = (value) => {
    const newPitch = (value - 0.5) * 24;
    setPitch(newPitch);
    
    if (isPlaying && processor) {
      processor.updatePlayback(newPitch, calculateFinalSpeed());
    }
  };

  const handleTempoChange = (e) => {
    const newBpm = parseInt(e.target.value) || pack.bpm;
    setTargetBpm(newBpm);
    
    if (isPlaying && processor) {
      const finalSpeed = newBpm / pack.bpm;
      processor.updatePlayback(pitch, finalSpeed);
    }
  };

  const resetTempo = () => {
    setTargetBpm(pack.bpm);
    if (isPlaying && processor) {
      processor.updatePlayback(pitch, 1.0);
    }
  };

  if (!processor) {
    return (
      <motion.div
        initial={{ x: '100%' }}
        animate={{ x: 0 }}
        exit={{ x: '100%' }}
        className="fixed top-0 right-0 h-full w-full lg:w-[35%] bg-black/30 backdrop-blur-2xl border-l border-cyan-400/20 z-50 overflow-y-auto"
      >
        <button onClick={onClose} className="absolute top-3 right-3 p-2 bg-cyan-500/20 rounded-lg">
          <X className="w-5 h-5 text-white" />
        </button>
        <div className="p-8 text-center">
          <p className="text-cyan-300 mb-4">Audio system initializing...</p>
          <p className="text-sm text-cyan-500">Please click anywhere on the page first, then try again.</p>
        </div>
      </motion.div>
    );
  }

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

          <div className="bg-white/5 backdrop-blur-2xl rounded-2xl p-4 border border-cyan-400/20 shadow-xl shadow-black/30">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-base font-bold text-white flex items-center space-x-2">
                <Gauge className="w-5 h-5 text-cyan-400" />
                <span>Tempo Stretch</span>
              </h3>
              <button
                onClick={resetTempo}
                className="px-3 py-1 text-xs bg-blue-500/20 hover:bg-blue-500/30 rounded-lg transition text-cyan-300"
              >
                Reset
              </button>
            </div>
            <div className="flex items-center space-x-3">
              <span className="text-sm text-cyan-400 whitespace-nowrap">Target BPM:</span>
              <input
                type="number"
                value={targetBpm}
                onChange={handleTempoChange}
                min="40"
                max="200"
                className="flex-1 px-3 py-2 bg-blue-950/50 border border-cyan-500/30 rounded-lg text-white text-center focus:outline-none focus:ring-2 focus:ring-cyan-500"
              />
              <span className="text-xs text-cyan-400">
                {targetBpm !== pack.bpm && `(${((targetBpm / pack.bpm) * 100).toFixed(0)}%)`}
              </span>
            </div>
            <p className="text-xs text-cyan-500 mt-2 text-center">
              Original: {pack.bpm} BPM → Stretched: {targetBpm} BPM
            </p>
          </div>

          <div className="bg-white/5 backdrop-blur-2xl rounded-2xl p-4 border border-cyan-400/20 shadow-xl shadow-black/30">
            <h3 className="text-base font-bold text-white mb-4">Pitch Control</h3>
            <div className="space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-cyan-400">-12 st</span>
                <span className="text-white font-semibold">
                  {pitch > 0 ? '+' : ''}{Math.round(pitch)} semitones
                </span>
                <span className="text-cyan-400">+12 st</span>
              </div>
              <div className="relative">
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.01"
                  value={(pitch + 12) / 24}
                  onChange={(e) => handlePitchChange(parseFloat(e.target.value))}
                  className="w-full h-2 rounded-lg appearance-none cursor-pointer pitch-slider"
                  style={{
                    background: `linear-gradient(to right, 
                      #14b8a6 0%, 
                      #14b8a6 ${((pitch + 12) / 24) * 100}%, 
                      rgba(59, 130, 246, 0.2) ${((pitch + 12) / 24) * 100}%, 
                      rgba(59, 130, 246, 0.2) 100%)`
                  }}
                />
              </div>
            </div>
          </div>

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
                <span>Download Processed</span>
              </>
            )}
          </button>

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

        <style jsx>{`
          .pitch-slider::-webkit-slider-thumb {
            -webkit-appearance: none;
            appearance: none;
            width: 20px;
            height: 20px;
            border-radius: 50%;
            background: linear-gradient(135deg, #14b8a6, #06b6d4);
            cursor: pointer;
            box-shadow: 0 0 10px rgba(20, 184, 166, 0.5);
            border: 2px solid rgba(255, 255, 255, 0.2);
          }
          
          .pitch-slider::-webkit-slider-thumb:hover {
            box-shadow: 0 0 15px rgba(20, 184, 166, 0.8);
          }
          
          .pitch-slider::-moz-range-thumb {
            width: 20px;
            height: 20px;
            border-radius: 50%;
            background: linear-gradient(135deg, #14b8a6, #06b6d4);
            cursor: pointer;
            box-shadow: 0 0 10px rgba(20, 184, 166, 0.5);
            border: 2px solid rgba(255, 255, 255, 0.2);
          }
          
          .pitch-slider::-moz-range-thumb:hover {
            box-shadow: 0 0 15px rgba(20, 184, 166, 0.8);
          }
        `}</style>
      </motion.div>
    </AnimatePresence>
  );
}

export default PackPlayer;