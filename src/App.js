import React, { useState, useEffect, useRef } from 'react';
import { supabase } from './supabaseClient';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Disc3,
  Piano as PianoIcon,
  Sparkles,
  LogIn
} from 'lucide-react';
import StorefrontGrid from './StorefrontGrid';
import PackPlayer from './PackPlayer';

// Enhanced Audio Processing Engine with Polyphonic Support
class AnalogProcessor {
  constructor() {
    this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
    this.masterGain = this.audioContext.createGain();
    this.analyser = this.audioContext.createAnalyser();
    this.analyser.fftSize = 2048;
    
    // Effects nodes
    this.tapeNode = this.audioContext.createWaveShaper();
    this.reverbNode = this.audioContext.createConvolver();
    this.delayNode = this.audioContext.createDelay();
    this.delayFeedback = this.audioContext.createGain();
    this.distortionNode = this.audioContext.createWaveShaper();
    this.filterNode = this.audioContext.createBiquadFilter();
    
    // Configure defaults
    this.filterNode.type = 'lowpass';
    this.filterNode.frequency.value = 20000;
    this.delayNode.delayTime.value = 0.3;
    this.delayFeedback.gain.value = 0.3;
    
    // Create curves
    this.distortionNode.curve = this.makeDistortionCurve(0);
    this.tapeNode.curve = this.makeTapeCurve(0);
    
    // Create effects
    this.createVinylNoise();
    this.createReverbImpulse();
    
    // Polyphonic voice management
    this.activeVoices = new Map();
    this.currentBuffer = null;
    this.vinylNode = null;
    this.currentEffects = {};
    
    // Connect master chain
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
  
  buildVoiceChain(gainNode, effects) {
    let lastNode = gainNode;
    
    if (effects.tape) {
      const tapeNode = this.audioContext.createWaveShaper();
      tapeNode.curve = this.makeTapeCurve(effects.tape);
      lastNode.connect(tapeNode);
      lastNode = tapeNode;
    }
    
    if (effects.distortion > 0) {
      const distNode = this.audioContext.createWaveShaper();
      distNode.curve = this.makeDistortionCurve(effects.distortion * 100);
      lastNode.connect(distNode);
      lastNode = distNode;
    }
    
    const filter = this.audioContext.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = effects.tape ? 20000 - (effects.tape * 15000) : 20000;
    lastNode.connect(filter);
    lastNode = filter;
    
    lastNode.connect(this.masterGain);
    
    if (effects.delay > 0) {
      const delayNode = this.audioContext.createDelay();
      const feedback = this.audioContext.createGain();
      delayNode.delayTime.value = 0.3;
      feedback.gain.value = effects.delay;
      lastNode.connect(delayNode);
      delayNode.connect(feedback);
      feedback.connect(delayNode);
      delayNode.connect(this.masterGain);
    }
    
    if (effects.reverb > 0) {
      const reverbGain = this.audioContext.createGain();
      reverbGain.gain.value = effects.reverb;
      lastNode.connect(reverbGain);
      reverbGain.connect(this.reverbNode);
      this.reverbNode.connect(this.masterGain);
    }
    
    return lastNode;
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
    
    this.buildVoiceChain(gainNode, effects);
    
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
      } catch (e) {
        // Already stopped
      }
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
    
    switch (effectName) {
      case 'tape':
        this.tapeNode.curve = this.makeTapeCurve(value);
        this.filterNode.frequency.value = 20000 - (value * 15000);
        break;
      case 'distortion':
        this.distortionNode.curve = this.makeDistortionCurve(value * 100);
        break;
      case 'delay':
        this.delayFeedback.gain.value = value;
        break;
      default:
        break;
    }
  }
  
  startVinyl() {
    if (this.vinylBuffer && !this.vinylNode) {
      const source = this.audioContext.createBufferSource();
      source.buffer = this.vinylBuffer;
      source.loop = true;
      const gain = this.audioContext.createGain();
      gain.gain.value = 0.05;
      source.connect(gain);
      gain.connect(this.masterGain);
      source.start();
      this.vinylNode = source;
    }
  }
  
  stopVinyl() {
    if (this.vinylNode) {
      try {
        this.vinylNode.stop();
      } catch (e) {
        // Already stopped
      }
      this.vinylNode = null;
    }
  }
  
  getAnalyserData() {
    const dataArray = new Uint8Array(this.analyser.frequencyBinCount);
    this.analyser.getByteFrequencyData(dataArray);
    return dataArray;
  }
}

// Piano Keyboard Component
const PianoKeyboard = ({ onNoteOn, onNoteOff, activeNotes, octaveShift }) => {
  const whiteKeys = [
    { note: 'C', midi: 60, key: 'A' },
    { note: 'D', midi: 62, key: 'S' },
    { note: 'E', midi: 64, key: 'D' },
    { note: 'F', midi: 65, key: 'F' },
    { note: 'G', midi: 67, key: 'G' },
    { note: 'A', midi: 69, key: 'H' },
    { note: 'B', midi: 71, key: 'J' },
    { note: 'C', midi: 72, key: 'K' },
    { note: 'D', midi: 74, key: 'L' },
    { note: 'E', midi: 76, key: ';' },
  ];
  
  const blackKeys = [
    { note: 'C#', midi: 61, key: 'W', position: 0 },
    { note: 'D#', midi: 63, key: 'E', position: 1 },
    { note: 'F#', midi: 66, key: 'T', position: 3 },
    { note: 'G#', midi: 68, key: 'Y', position: 4 },
    { note: 'A#', midi: 70, key: 'U', position: 5 },
    { note: 'C#', midi: 73, key: 'O', position: 7 },
    { note: 'D#', midi: 75, key: 'P', position: 8 },
  ];
  
  return (
    <div className="relative">
      <div className="flex justify-center items-end h-32 bg-gradient-to-b from-gray-800 to-gray-900 rounded-xl p-4 border border-purple-500/30">
        <div className="flex relative">
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
                  w-10 h-24 mx-0.5 rounded-b-lg cursor-pointer transition-all
                  flex flex-col items-center justify-end pb-2
                  ${isActive 
                    ? 'bg-gradient-to-b from-purple-400 to-purple-500 shadow-lg shadow-purple-500/50' 
                    : 'bg-gradient-to-b from-white to-gray-100 hover:from-gray-100 hover:to-gray-200'
                  }
                  border-2 ${isActive ? 'border-purple-300' : 'border-gray-300'}
                `}
              >
                <span className={`text-xs font-bold ${isActive ? 'text-white' : 'text-gray-600'}`}>
                  {keyData.note}
                </span>
                <span className={`text-[10px] ${isActive ? 'text-purple-100' : 'text-gray-400'}`}>
                  {keyData.key}
                </span>
              </motion.div>
            );
          })}
          
          <div className="absolute top-0 left-0 w-full h-16 pointer-events-none">
            {blackKeys.map((keyData, i) => {
              const midiNote = keyData.midi + (octaveShift * 12);
              const isActive = activeNotes.has(midiNote);
              const leftPosition = (keyData.position * 40) + 30;
              
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
                    absolute w-7 h-16 rounded-b-lg cursor-pointer pointer-events-auto
                    flex flex-col items-center justify-end pb-1 transition-all
                    ${isActive
                      ? 'bg-gradient-to-b from-purple-600 to-purple-700 shadow-lg shadow-purple-600/50'
                      : 'bg-gradient-to-b from-gray-800 to-black hover:from-gray-700 hover:to-gray-900'
                    }
                    border ${isActive ? 'border-purple-400' : 'border-gray-900'}
                  `}
                >
                  <span className={`text-[10px] font-bold ${isActive ? 'text-white' : 'text-gray-400'}`}>
                    {keyData.note}
                  </span>
                  <span className={`text-[8px] ${isActive ? 'text-purple-200' : 'text-gray-600'}`}>
                    {keyData.key}
                  </span>
                </motion.div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};

// Main App Component
function FeelzMachine({ user, profile }) {
  const [selectedPack, setSelectedPack] = useState(null);
  const [pianoMode, setPianoMode] = useState(true);
  const [activeNotes, setActiveNotes] = useState(new Set());
  const [octaveShift, setOctaveShift] = useState(0);
  
  const processorRef = useRef(new AnalogProcessor());
  
  const keyToMidi = React.useMemo(() => ({
    'a': 60, 'w': 61, 's': 62, 'e': 63, 'd': 64,
    'f': 65, 't': 66, 'g': 67, 'y': 68, 'h': 69,
    'u': 70, 'j': 71, 'k': 72, 'o': 73, 'l': 74,
    'p': 75, ';': 76
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
    processorRef.current.stopAllNotes();
    setActiveNotes(new Set());
  };

  const handlePackClose = () => {
    setSelectedPack(null);
    processorRef.current.stopAllNotes();
    setActiveNotes(new Set());
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-purple-900 to-gray-900 text-white">
      {/* Header */}
      <header className="border-b border-purple-500/30 backdrop-blur-lg bg-black/30 sticky top-0 z-40">
        <div className="container mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <Disc3 className="w-10 h-10 text-purple-400 animate-spin-slow" />
              <div>
                <h1 className="text-3xl font-bold bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent">
                  Feelz Machine
                </h1>
                <p className="text-sm text-purple-300">Sample Pack Library</p>
              </div>
            </div>
            
            <div className="flex items-center space-x-4">
              {user && profile ? (
                <div className="flex items-center space-x-3">
                  <span className="text-sm text-purple-300">Hey, {profile.name}!</span>
                  <Sparkles className="w-5 h-5 text-purple-400" />
                </div>
              ) : (
                <button className="flex items-center space-x-2 px-4 py-2 bg-purple-500 hover:bg-purple-600 rounded-lg transition">
                  <LogIn className="w-4 h-4" />
                  <span>Sign In</span>
                </button>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="relative">
        <div className={`container mx-auto px-6 py-8 transition-all duration-300 ${
          selectedPack ? 'lg:mr-[40%]' : ''
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

      {/* Piano Keyboard (Bottom - only when pack selected) */}
      <AnimatePresence>
        {selectedPack && pianoMode && (
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="fixed bottom-0 left-0 right-0 bg-black/95 backdrop-blur-xl border-t border-purple-500/30 z-40 p-4"
          >
            <div className="container mx-auto">
              <div className="mb-3 flex items-center justify-center space-x-4">
                <button
                  onClick={() => setOctaveShift(Math.max(-2, octaveShift - 1))}
                  disabled={octaveShift <= -2}
                  className="px-4 py-2 bg-purple-900/50 hover:bg-purple-800/50 disabled:opacity-30 disabled:cursor-not-allowed rounded-lg transition text-sm font-semibold"
                >
                  Octave −
                </button>
                <span className="text-purple-300 font-semibold min-w-[100px] text-center">
                  Octave: {octaveShift >= 0 ? '+' : ''}{octaveShift}
                </span>
                <button
                  onClick={() => setOctaveShift(Math.min(2, octaveShift + 1))}
                  disabled={octaveShift >= 2}
                  className="px-4 py-2 bg-purple-900/50 hover:bg-purple-800/50 disabled:opacity-30 disabled:cursor-not-allowed rounded-lg transition text-sm font-semibold"
                >
                  Octave +
                </button>
                <div className="h-6 w-px bg-purple-500/30"></div>
                <button
                  onClick={() => setPianoMode(false)}
                  className="px-4 py-2 bg-red-500/20 hover:bg-red-500/30 rounded-lg transition text-sm font-semibold flex items-center space-x-2"
                >
                  <PianoIcon className="w-4 h-4" />
                  <span>Hide Piano</span>
                </button>
              </div>
              
              <PianoKeyboard
                onNoteOn={handleNoteOn}
                onNoteOff={handleNoteOff}
                activeNotes={activeNotes}
                octaveShift={octaveShift}
              />
              
              <p className="text-xs text-center text-purple-400 mt-2">
                Use Z/X keys to shift octave • A-; for white notes • W-P for black notes • Or click with mouse
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Piano Toggle (when hidden) */}
      {selectedPack && !pianoMode && (
        <button
          onClick={() => setPianoMode(true)}
          className="fixed bottom-6 left-1/2 transform -translate-x-1/2 px-6 py-3 bg-purple-500 hover:bg-purple-600 rounded-full shadow-lg shadow-purple-500/50 transition flex items-center space-x-2 z-40"
        >
          <PianoIcon className="w-5 h-5" />
          <span className="font-semibold">Show Piano Keyboard</span>
        </button>
      )}
    </div>
  );
}

export default FeelzMachine;