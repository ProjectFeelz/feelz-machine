import React, { useState, useEffect, useRef } from 'react';
import { supabase } from './supabaseClient';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Disc3,
  Piano as PianoIcon,
  Sparkles,
  LogIn,
  X
} from 'lucide-react';
import StorefrontGrid from './StorefrontGrid';
import PackPlayer from './PackPlayer';

// Audio Processor (same as before)
class AnalogProcessor {
  constructor() {
    this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
    this.masterGain = this.audioContext.createGain();
    this.analyser = this.audioContext.createAnalyser();
    this.analyser.fftSize = 2048;
    
    this.tapeNode = this.audioContext.createWaveShaper();
    this.reverbNode = this.audioContext.createConvolver();
    this.delayNode = this.audioContext.createDelay();
    this.delayFeedback = this.audioContext.createGain();
    this.distortionNode = this.audioContext.createWaveShaper();
    this.filterNode = this.audioContext.createBiquadFilter();
    
    this.filterNode.type = 'lowpass';
    this.filterNode.frequency.value = 20000;
    this.delayNode.delayTime.value = 0.3;
    this.delayFeedback.gain.value = 0.3;
    
    this.distortionNode.curve = this.makeDistortionCurve(0);
    this.tapeNode.curve = this.makeTapeCurve(0);
    
    this.createVinylNoise();
    this.createReverbImpulse();
    
    this.activeVoices = new Map();
    this.currentBuffer = null;
    this.vinylNode = null;
    this.currentEffects = {};
    
    this.masterGain.connect(this.analyser);
    this.masterGain.connect(this.audioContext.destination);
  }
  
  makeDistortionCurve(amount) {
    const samples = 44100;
    const curve = new Float32Array(samples);
    const deg = Math.PI / 180;
    for (let i = 0; i < samples; i++) {
      const x = (i * 2) / samples - 1;
      curve[i] = ((3 + amount) * x * 20 * deg) / (Math.PI + amount * Math.abs(x));
    }
    return curve;
  }
  
  makeTapeCurve(amount) {
    const samples = 44100;
    const curve = new Float32Array(samples);
    for (let i = 0; i < samples; i++) {
      const x = (i * 2) / samples - 1;
      const saturation = (1 + amount) * x / (1 + amount * Math.abs(x));
      curve[i] = saturation;
    }
    return curve;
  }
  
  createVinylNoise() {
    const bufferSize = this.audioContext.sampleRate * 2;
    const buffer = this.audioContext.createBuffer(1, bufferSize, this.audioContext.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * 0.02;
    }
    this.vinylBuffer = buffer;
  }
  
  async createReverbImpulse() {
    const length = this.audioContext.sampleRate * 2;
    const impulse = this.audioContext.createBuffer(2, length, this.audioContext.sampleRate);
    const left = impulse.getChannelData(0);
    const right = impulse.getChannelData(1);
    for (let i = 0; i < length; i++) {
      const decay = Math.exp(-i / (this.audioContext.sampleRate * 0.5));
      left[i] = (Math.random() * 2 - 1) * decay;
      right[i] = (Math.random() * 2 - 1) * decay;
    }
    this.reverbNode.buffer = impulse;
  }
  
  async loadAudio(url) {
    const response = await fetch(url);
    const arrayBuffer = await response.arrayBuffer();
    this.currentBuffer = await this.audioContext.decodeAudioData(arrayBuffer);
    return this.currentBuffer;
  }
  
  playNote(noteId, pitchShift, velocity = 1.0, effects = {}) {
    if (!this.currentBuffer) return;
    
    this.stopNote(noteId);
    
    const source = this.audioContext.createBufferSource();
    source.buffer = this.currentBuffer;
    
    const rate = Math.pow(2, pitchShift / 12);
    source.playbackRate.value = rate;
    
    const gainNode = this.audioContext.createGain();
    gainNode.gain.value = velocity * 0.7;
    
    source.connect(gainNode);
    gainNode.connect(this.masterGain);
    
    source.start();
    
    this.activeVoices.set(noteId, {
      source,
      gainNode,
      startTime: this.audioContext.currentTime
    });
    
    source.onended = () => {
      this.stopNote(noteId);
    };
  }
  
  stopNote(noteId) {
    const voice = this.activeVoices.get(noteId);
    if (voice) {
      try {
        voice.source.stop();
      } catch (e) {}
      voice.source.disconnect();
      voice.gainNode.disconnect();
      this.activeVoices.delete(noteId);
    }
  }
  
  stopAllNotes() {
    for (const noteId of this.activeVoices.keys()) {
      this.stopNote(noteId);
    }
  }
  
  updateEffect(effectName, value) {
    this.currentEffects[effectName] = value;
  }
  
  getAnalyserData() {
    const dataArray = new Uint8Array(this.analyser.frequencyBinCount);
    this.analyser.getByteFrequencyData(dataArray);
    return dataArray;
  }
}

// Compact Piano Keyboard (Left Side)
const PianoKeyboard = ({ onNoteOn, onNoteOff, activeNotes, octaveShift, onClose }) => {
  const whiteKeys = [
    { note: 'C', midi: 60, key: 'A' },
    { note: 'D', midi: 62, key: 'S' },
    { note: 'E', midi: 64, key: 'D' },
    { note: 'F', midi: 65, key: 'F' },
    { note: 'G', midi: 67, key: 'G' },
    { note: 'A', midi: 69, key: 'H' },
    { note: 'B', midi: 71, key: 'J' },
    { note: 'C', midi: 72, key: 'K' },
  ];
  
  const blackKeys = [
    { note: 'C#', midi: 61, key: 'W', position: 0 },
    { note: 'D#', midi: 63, key: 'E', position: 1 },
    { note: 'F#', midi: 66, key: 'T', position: 3 },
    { note: 'G#', midi: 68, key: 'Y', position: 4 },
    { note: 'A#', midi: 70, key: 'U', position: 5 },
  ];
  
  return (
    <div className="relative bg-gradient-to-b from-gray-800 to-gray-900 rounded-xl p-3 border border-purple-500/30">
      <button
        onClick={onClose}
        className="absolute -top-2 -right-2 p-1 bg-purple-500 hover:bg-purple-600 rounded-full transition z-10"
      >
        <X className="w-3 h-3 text-white" />
      </button>
      
      <div className="flex relative justify-center">
        {whiteKeys.map((keyData, i) => {
          const midiNote = keyData.midi + (octaveShift * 12);
          const isActive = activeNotes.has(midiNote);
          
          return (
            <motion.div
              key={`white-${i}`}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onMouseDown={() => onNoteOn(midiNote)}
              onMouseUp={() => onNoteOff(midiNote)}
              onMouseLeave={() => onNoteOff(midiNote)}
              className={`
                w-8 h-20 mx-0.5 rounded-b-lg cursor-pointer transition-all
                flex flex-col items-center justify-end pb-1
                ${isActive 
                  ? 'bg-gradient-to-b from-purple-400 to-purple-500 shadow-lg shadow-purple-500/50' 
                  : 'bg-gradient-to-b from-white to-gray-100 hover:from-gray-100 hover:to-gray-200'
                }
                border-2 ${isActive ? 'border-purple-300' : 'border-gray-300'}
              `}
            >
              <span className={`text-[10px] font-bold ${isActive ? 'text-white' : 'text-gray-600'}`}>
                {keyData.note}
              </span>
              <span className={`text-[8px] ${isActive ? 'text-purple-100' : 'text-gray-400'}`}>
                {keyData.key}
              </span>
            </motion.div>
          );
        })}
        
        <div className="absolute top-0 left-0 w-full h-12 pointer-events-none">
          {blackKeys.map((keyData, i) => {
            const midiNote = keyData.midi + (octaveShift * 12);
            const isActive = activeNotes.has(midiNote);
            const leftPosition = (keyData.position * 32) + 24;
            
            return (
              <motion.div
                key={`black-${i}`}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onMouseDown={() => onNoteOn(midiNote)}
                onMouseUp={() => onNoteOff(midiNote)}
                onMouseLeave={() => onNoteOff(midiNote)}
                style={{ left: `${leftPosition}px` }}
                className={`
                  absolute w-6 h-14 rounded-b-lg cursor-pointer pointer-events-auto
                  flex flex-col items-center justify-end pb-1 transition-all
                  ${isActive
                    ? 'bg-gradient-to-b from-purple-600 to-purple-700 shadow-lg shadow-purple-600/50'
                    : 'bg-gradient-to-b from-gray-800 to-black hover:from-gray-700 hover:to-gray-900'
                  }
                  border ${isActive ? 'border-purple-400' : 'border-gray-900'}
                `}
              >
                <span className={`text-[9px] font-bold ${isActive ? 'text-white' : 'text-gray-400'}`}>
                  {keyData.note}
                </span>
                <span className={`text-[7px] ${isActive ? 'text-purple-200' : 'text-gray-600'}`}>
                  {keyData.key}
                </span>
              </motion.div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

// Bioluminescent Particles Component
const BioluminescentParticles = () => {
  const canvasRef = useRef(null);
  const particlesRef = useRef([]);
  const animationRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    const handleResize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    window.addEventListener('resize', handleResize);

    class Particle {
      constructor(x, y) {
        this.x = x;
        this.y = y;
        this.vx = (Math.random() - 0.5) * 1;
        this.vy = (Math.random() - 0.5) * 1;
        this.life = 60;
        this.maxLife = 60;
        this.size = Math.random() * 2 + 0.5;
        const colors = [
          'rgba(59, 130, 246, ',
          'rgba(139, 92, 246, ',
          'rgba(236, 72, 153, ',
        ];
        this.color = colors[Math.floor(Math.random() * colors.length)];
      }

      update() {
        this.x += this.vx;
        this.y += this.vy;
        this.vx *= 0.98;
        this.vy *= 0.98;
        this.life -= 1;
      }

      draw(ctx) {
        const opacity = this.life / this.maxLife;
        const gradient = ctx.createRadialGradient(
          this.x, this.y, 0,
          this.x, this.y, this.size * 3
        );
        gradient.addColorStop(0, this.color + opacity * 0.6 + ')');
        gradient.addColorStop(1, this.color + '0)');
        
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size * 3, 0, Math.PI * 2);
        ctx.fill();
      }

      isDead() {
        return this.life <= 0;
      }
    }

    const handleMouseMove = (e) => {
      for (let i = 0; i < 2; i++) {
        particlesRef.current.push(
          new Particle(
            e.clientX + (Math.random() - 0.5) * 15,
            e.clientY + (Math.random() - 0.5) * 15
          )
        );
      }
    };

    canvas.addEventListener('mousemove', handleMouseMove);

    const animate = () => {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.05)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      particlesRef.current = particlesRef.current.filter(particle => {
        particle.update();
        particle.draw(ctx);
        return !particle.isDead();
      });

      if (particlesRef.current.length > 200) {
        particlesRef.current = particlesRef.current.slice(-200);
      }

      animationRef.current = requestAnimationFrame(animate);
    };

    animate();

    return () => {
      window.removeEventListener('resize', handleResize);
      canvas.removeEventListener('mousemove', handleMouseMove);
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 pointer-events-none z-0"
      style={{ opacity: 0.4 }}
    />
  );
};

// Main App
function FeelzMachine({ user, profile }) {
  const [selectedPack, setSelectedPack] = useState(null);
  const [pianoMode, setPianoMode] = useState(false);
  const [activeNotes, setActiveNotes] = useState(new Set());
  const [octaveShift, setOctaveShift] = useState(0);
  
  const processorRef = useRef(new AnalogProcessor());
  
  const keyToMidi = React.useMemo(() => ({
    'a': 60, 'w': 61, 's': 62, 'e': 63, 'd': 64,
    'f': 65, 't': 66, 'g': 67, 'y': 68, 'h': 69,
    'u': 70, 'j': 71, 'k': 72
  }), []);
  
  const handleNoteOn = React.useCallback((midiNote, velocity = 1.0) => {
    const processor = processorRef.current;
    if (!processor.currentBuffer) return;
    
    const pitchShift = midiNote - 60;
    processor.playNote(midiNote, pitchShift, velocity, {});
    setActiveNotes(prev => new Set(prev).add(midiNote));
  }, []);
  
  const handleNoteOff = React.useCallback((midiNote) => {
    const processor = processorRef.current;
    processor.stopNote(midiNote);
    setActiveNotes(prev => {
      const next = new Set(prev);
      next.delete(midiNote);
      return next;
    });
  }, []);
  
  useEffect(() => {
    if (!pianoMode || !selectedPack) return;
    
    const handleKeyDown = (e) => {
      const key = e.key.toLowerCase();
      if (keyToMidi[key] && !e.repeat) {
        const midiNote = keyToMidi[key] + (octaveShift * 12);
        handleNoteOn(midiNote);
      }
      
      if (e.key === 'z' && octaveShift > -2) setOctaveShift(octaveShift - 1);
      if (e.key === 'x' && octaveShift < 2) setOctaveShift(octaveShift + 1);
    };
    
    const handleKeyUp = (e) => {
      const key = e.key.toLowerCase();
      if (keyToMidi[key]) {
        const midiNote = keyToMidi[key] + (octaveShift * 12);
        handleNoteOff(midiNote);
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [pianoMode, selectedPack, octaveShift, handleNoteOn, handleNoteOff, keyToMidi]);

  const handlePackSelect = (pack) => {
    setSelectedPack(pack);
    setPianoMode(true); // Auto-show piano
    processorRef.current.stopAllNotes();
    setActiveNotes(new Set());
  };

  const handlePackClose = () => {
    setSelectedPack(null);
    setPianoMode(false);
    processorRef.current.stopAllNotes();
    setActiveNotes(new Set());
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-purple-900 to-gray-900 text-white relative overflow-hidden">
      {/* Bioluminescent Background */}
      <BioluminescentParticles />
      
      {/* Header */}
      <header className="border-b border-purple-500/30 backdrop-blur-lg bg-black/30 sticky top-0 z-40">
        <div className="container mx-auto px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Disc3 className="w-8 h-8 text-purple-400 animate-spin-slow" />
              <div>
                <h1 className="text-2xl font-bold bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent">
                  Feelz Machine
                </h1>
                <p className="text-xs text-purple-300">Sample Pack Library</p>
              </div>
            </div>
            
            <div className="flex items-center space-x-3">
              {user && profile ? (
                <div className="flex items-center space-x-2">
                  <span className="text-xs text-purple-300">Hey, {profile.name}!</span>
                  <Sparkles className="w-4 h-4 text-purple-400" />
                </div>
              ) : (
                <button className="flex items-center space-x-1 px-3 py-1.5 text-sm bg-purple-500 hover:bg-purple-600 rounded-lg transition">
                  <LogIn className="w-3 h-3" />
                  <span>Sign In</span>
                </button>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="relative">
        <div className={`container mx-auto px-4 py-6 transition-all duration-300 ${
          selectedPack ? 'lg:mr-[35%]' : ''
        }`}>
          <StorefrontGrid 
            onPackSelect={handlePackSelect}
            selectedPack={selectedPack}
          />
        </div>

        {/* Side Panel Player */}
        <AnimatePresence>
          {selectedPack && (
            <PackPlayer
              pack={selectedPack}
              onClose={handlePackClose}
              user={user}
              processor={processorRef.current}
            />
          )}
        </AnimatePresence>
      </div>

      {/* Compact Piano (Left Bottom Corner) */}
      <AnimatePresence>
        {selectedPack && pianoMode && (
          <motion.div
            initial={{ x: '-100%', opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: '-100%', opacity: 0 }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="fixed bottom-4 left-4 z-40 w-72"
          >
            <PianoKeyboard
              onNoteOn={handleNoteOn}
              onNoteOff={handleNoteOff}
              activeNotes={activeNotes}
              octaveShift={octaveShift}
              onClose={() => setPianoMode(false)}
            />
            
            <div className="mt-2 flex items-center justify-center space-x-2 bg-black/80 backdrop-blur-xl rounded-lg p-2 border border-purple-500/30">
              <button
                onClick={() => setOctaveShift(Math.max(-2, octaveShift - 1))}
                disabled={octaveShift <= -2}
                className="px-2 py-1 text-xs bg-purple-900/50 hover:bg-purple-800/50 disabled:opacity-30 disabled:cursor-not-allowed rounded transition font-semibold"
              >
                −
              </button>
              <span className="text-xs text-purple-300 font-semibold min-w-[60px] text-center">
                Oct: {octaveShift >= 0 ? '+' : ''}{octaveShift}
              </span>
              <button
                onClick={() => setOctaveShift(Math.min(2, octaveShift + 1))}
                disabled={octaveShift >= 2}
                className="px-2 py-1 text-xs bg-purple-900/50 hover:bg-purple-800/50 disabled:opacity-30 disabled:cursor-not-allowed rounded transition font-semibold"
              >
                +
              </button>
            </div>
            
            <p className="text-[10px] text-center text-purple-400 mt-1">
              Z/X: Octave • A-K: Notes
            </p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Piano Toggle (when hidden) */}
      {selectedPack && !pianoMode && (
        <button
          onClick={() => setPianoMode(true)}
          className="fixed bottom-4 left-4 px-4 py-2 text-sm bg-purple-500 hover:bg-purple-600 rounded-full shadow-lg shadow-purple-500/50 transition flex items-center space-x-2 z-40"
        >
          <PianoIcon className="w-4 h-4" />
          <span className="font-semibold">Show Piano</span>
        </button>
      )}
    </div>
  );
}

export default FeelzMachine;