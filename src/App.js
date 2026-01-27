import React, { useState, useEffect, useRef } from 'react';
import { createClient } from '@supabase/supabase-js';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Play,
  Pause,
  Download,
  Heart,
  Search,
  Filter,
  Disc3,
  Radio,
  Sparkles,
  Volume2,
  RotateCcw,
  Music,
  Layers,
  Piano as PianoIcon,
  VolumeX
} from 'lucide-react';

// Initialize Supabase
const supabaseUrl = process.env.REACT_APP_SUPABASE_URL;
const supabaseKey = process.env.REACT_APP_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

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
    this.activeVoices = new Map(); // noteId -> voice object
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
  
  // Build effects chain for a voice
  buildVoiceChain(gainNode, effects) {
    let lastNode = gainNode;
    
    // Tape emulation
    if (effects.tape) {
      const tapeNode = this.audioContext.createWaveShaper();
      tapeNode.curve = this.makeTapeCurve(effects.tape);
      lastNode.connect(tapeNode);
      lastNode = tapeNode;
    }
    
    // Distortion
    if (effects.distortion > 0) {
      const distNode = this.audioContext.createWaveShaper();
      distNode.curve = this.makeDistortionCurve(effects.distortion * 100);
      lastNode.connect(distNode);
      lastNode = distNode;
    }
    
    // Filter
    const filter = this.audioContext.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = effects.tape ? 20000 - (effects.tape * 15000) : 20000;
    lastNode.connect(filter);
    lastNode = filter;
    
    // Connect to master
    lastNode.connect(this.masterGain);
    
    // Delay (master level)
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
    
    // Reverb (master level)
    if (effects.reverb > 0) {
      const reverbGain = this.audioContext.createGain();
      reverbGain.gain.value = effects.reverb;
      lastNode.connect(reverbGain);
      reverbGain.connect(this.reverbNode);
      this.reverbNode.connect(this.masterGain);
    }
    
    return lastNode;
  }
  
  // Play a note with polyphonic support
  playNote(noteId, pitchShift, velocity = 1.0, effects = {}) {
    if (!this.currentBuffer) return;
    
    // Stop existing note if playing
    this.stopNote(noteId);
    
    // Create voice
    const source = this.audioContext.createBufferSource();
    source.buffer = this.currentBuffer;
    
    // Calculate playback rate for pitch shift
    const rate = Math.pow(2, pitchShift / 12);
    source.playbackRate.value = rate;
    
    // Create gain for this voice
    const gainNode = this.audioContext.createGain();
    gainNode.gain.value = velocity * 0.7; // Scale down to prevent clipping
    
    // Connect source to gain
    source.connect(gainNode);
    
    // Build effects chain
    this.buildVoiceChain(gainNode, effects);
    
    // Start playback
    source.start();
    
    // Store voice
    this.activeVoices.set(noteId, {
      source,
      gainNode,
      startTime: this.audioContext.currentTime
    });
    
    // Auto-cleanup when finished
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
  
  async exportAudio() {
    // Export not available in polyphonic mode
    alert('Export feature coming soon for polyphonic mode!');
    return null;
  }
}

// Piano Keyboard Component
const PianoKeyboard = ({ onNoteOn, onNoteOff, activeNotes, octaveShift }) => {
  // Piano keys configuration (2 octaves starting from C3)
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
      <div className="flex justify-center items-end h-40 bg-gradient-to-b from-gray-800 to-gray-900 rounded-xl p-4 border border-purple-500/30">
        {/* White keys */}
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
                  w-12 h-32 mx-0.5 rounded-b-lg cursor-pointer transition-all
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
          
          {/* Black keys overlay */}
          <div className="absolute top-0 left-0 w-full h-20 pointer-events-none">
            {blackKeys.map((keyData, i) => {
              const midiNote = keyData.midi + (octaveShift * 12);
              const isActive = activeNotes.has(midiNote);
              const leftPosition = (keyData.position * 48) + 36; // 48px per white key, offset by 36px
              
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
                    absolute w-8 h-20 rounded-b-lg cursor-pointer pointer-events-auto
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

// Audio Visualizer Component
const AudioVisualizer = ({ processor, isActive }) => {
  const canvasRef = useRef(null);
  const animationRef = useRef(null);
  
  useEffect(() => {
    if (!isActive || !processor) return;
    
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    
    const draw = () => {
      const dataArray = processor.getAnalyserData();
      const bufferLength = dataArray.length;
      
      ctx.fillStyle = 'rgb(10, 10, 15)';
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
    
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [isActive, processor]);
  
  return (
    <canvas
      ref={canvasRef}
      width={800}
      height={120}
      className="w-full h-full rounded-lg"
    />
  );
};

// Stem Control Component
const StemControl = ({ stem, volume, onVolumeChange, onMute, isMuted }) => {
  return (
    <div className="bg-purple-950/30 rounded-lg p-3 border border-purple-500/20">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center space-x-2">
          <Layers className="w-4 h-4 text-purple-400" />
          <span className="text-sm font-semibold text-purple-200">{stem.name}</span>
        </div>
        <button
          onClick={onMute}
          className={`p-1.5 rounded transition ${
            isMuted ? 'bg-red-500/20 text-red-400' : 'bg-purple-500/20 text-purple-400'
          }`}
        >
          {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
        </button>
      </div>
      <input
        type="range"
        min="0"
        max="1"
        step="0.01"
        value={volume}
        onChange={(e) => onVolumeChange(parseFloat(e.target.value))}
        disabled={isMuted}
        className="w-full accent-purple-500"
      />
      <div className="text-xs text-purple-400 text-right mt-1">
        {isMuted ? 'Muted' : `${Math.round(volume * 100)}%`}
      </div>
    </div>
  );
};

// Main App Component
function FeelzMachine() {
  const [samples, setSamples] = useState([]);
  const [filteredSamples, setFilteredSamples] = useState([]);
  const [currentSample, setCurrentSample] = useState(null);
  const [stems, setStems] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState('all');
  const [filters, setFilters] = useState({ mood: '', genre: '', key: '', bpm: '' });
  const [showFilters, setShowFilters] = useState(false);
  
  // Piano mode state
  const [pianoMode, setPianoMode] = useState(true);
  const [activeNotes, setActiveNotes] = useState(new Set());
  const [octaveShift, setOctaveShift] = useState(0);
  
  // Effects state
  const [effects, setEffects] = useState({
    tape: false,
    vinyl: false,
    reverb: 0,
    delay: 0,
    distortion: 0
  });
  
  // Stem state
  const [stemVolumes, setStemVolumes] = useState({});
  const [mutedStems, setMutedStems] = useState(new Set());
  
  const processorRef = useRef(new AnalogProcessor());
  
  // Keyboard mapping
  const keyToMidi = {
    'a': 60, 'w': 61, 's': 62, 'e': 63, 'd': 64,
    'f': 65, 't': 66, 'g': 67, 'y': 68, 'h': 69,
    'u': 70, 'j': 71, 'k': 72, 'o': 73, 'l': 74,
    'p': 75, ';': 76
  };
  
  // Fetch samples from Supabase
  useEffect(() => {
    fetchSamples();
  }, []);
  
  const fetchSamples = async () => {
    const { data, error } = await supabase
      .from('samples')
      .select('*')
      .order('created_at', { ascending: false });
    
    if (error) {
      console.error('Error fetching samples:', error);
      return;
    }
    
    setSamples(data || []);
    setFilteredSamples(data || []);
  };
  
  const fetchStems = async (sampleId) => {
    const { data, error } = await supabase
      .from('sample_stems')
      .select('*')
      .eq('sample_id', sampleId)
      .order('order_index');
    
    if (error) {
      console.error('Error fetching stems:', error);
      return;
    }
    
    setStems(data || []);
    
    // Initialize stem volumes
    const volumes = {};
    data?.forEach(stem => {
      volumes[stem.id] = 1.0;
    });
    setStemVolumes(volumes);
    setMutedStems(new Set());
  };
  
  // Apply filters
  useEffect(() => {
    let filtered = samples;
    
    if (searchTerm) {
      filtered = filtered.filter(s =>
        s.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (s.artist && s.artist.toLowerCase().includes(searchTerm.toLowerCase()))
      );
    }
    
    if (activeTab === 'featured') {
      filtered = filtered.filter(s => s.featured).sort((a, b) => b.likes - a.likes).slice(0, 10);
    }
    
    if (filters.mood) filtered = filtered.filter(s => s.mood === filters.mood);
    if (filters.genre) filtered = filtered.filter(s => s.genre === filters.genre);
    if (filters.key) filtered = filtered.filter(s => s.key === filters.key);
    if (filters.bpm) {
      const targetBpm = parseInt(filters.bpm);
      filtered = filtered.filter(s => Math.abs(s.bpm - targetBpm) <= 10);
    }
    
    setFilteredSamples(filtered);
  }, [searchTerm, activeTab, filters, samples]);
  
  // Keyboard input handler
  useEffect(() => {
    if (!pianoMode || !currentSample) return;
    
    const handleKeyDown = (e) => {
      const key = e.key.toLowerCase();
      if (keyToMidi[key] && !e.repeat) {
        const midiNote = keyToMidi[key] + (octaveShift * 12);
        handleNoteOn(midiNote);
      }
      
      // Octave controls
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
  }, [pianoMode, currentSample, octaveShift]);
  
  // MIDI input support
  useEffect(() => {
    if (!pianoMode || !currentSample) return;
    
    const setupMIDI = async () => {
      try {
        const midiAccess = await navigator.requestMIDIAccess();
        
        for (const input of midiAccess.inputs.values()) {
          input.onmidimessage = (message) => {
            const [command, note, velocity] = message.data;
            
            if (command === 144 && velocity > 0) {
              // Note on
              handleNoteOn(note, velocity / 127);
            } else if (command === 128 || (command === 144 && velocity === 0)) {
              // Note off
              handleNoteOff(note);
            }
          };
        }
      } catch (e) {
        console.log('MIDI not available:', e);
      }
    };
    
    setupMIDI();
  }, [pianoMode, currentSample]);
  
  const handleSampleSelect = async (sample) => {
    const processor = processorRef.current;
    
    // Stop all notes
    processor.stopAllNotes();
    setActiveNotes(new Set());
    
    setCurrentSample(sample);
    
    // Load main audio
    try {
      await processor.loadAudio(sample.file_url);
      
      // Fetch stems if available
      if (sample.has_stems) {
        await fetchStems(sample.id);
      } else {
        setStems([]);
      }
      
      // Update plays count
      await supabase
        .from('samples')
        .update({ plays: sample.plays + 1 })
        .eq('id', sample.id);
    } catch (error) {
      console.error('Error loading audio:', error);
      alert('Failed to load audio file. Please check the file URL.');
    }
  };
  
  const handleNoteOn = (midiNote, velocity = 1.0) => {
    const processor = processorRef.current;
    if (!processor.currentBuffer) return;
    
    // Calculate pitch shift from middle C (60)
    const pitchShift = midiNote - 60;
    
    processor.playNote(midiNote, pitchShift, velocity, effects);
    setActiveNotes(prev => new Set(prev).add(midiNote));
  };
  
  const handleNoteOff = (midiNote) => {
    const processor = processorRef.current;
    processor.stopNote(midiNote);
    setActiveNotes(prev => {
      const next = new Set(prev);
      next.delete(midiNote);
      return next;
    });
  };
  
  const handleEffectChange = (effectName, value) => {
    const newEffects = { ...effects, [effectName]: value };
    setEffects(newEffects);
    
    const processor = processorRef.current;
    processor.updateEffect(effectName, value);
    processor.currentEffects = newEffects;
    
    // Handle vinyl
    if (effectName === 'vinyl') {
      if (value) {
        processor.startVinyl();
      } else {
        processor.stopVinyl();
      }
    }
  };
  
  const handleLike = async (sample) => {
    const { error } = await supabase
      .from('samples')
      .update({ likes: sample.likes + 1 })
      .eq('id', sample.id);
    
    if (!error) {
      fetchSamples();
    }
  };
  
  const resetEffects = () => {
    setEffects({
      tape: false,
      vinyl: false,
      reverb: 0,
      delay: 0,
      distortion: 0
    });
    setOctaveShift(0);
    processorRef.current.stopVinyl();
  };
  
  const isActive = activeNotes.size > 0;
  
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-purple-900 to-gray-900 text-white">
      {/* Header */}
      <header className="border-b border-purple-500/30 backdrop-blur-lg bg-black/30">
        <div className="container mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <Disc3 className="w-10 h-10 text-purple-400 animate-spin-slow" />
              <div>
                <h1 className="text-3xl font-bold bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent">
                  Feelz Machine
                </h1>
                <p className="text-sm text-purple-300">Polyphonic Audio Sampler</p>
              </div>
            </div>
            
            <div className="flex items-center space-x-4">
              <button
                onClick={() => setPianoMode(!pianoMode)}
                className={`flex items-center space-x-2 px-4 py-2 rounded-lg transition ${
                  pianoMode
                    ? 'bg-purple-500 text-white'
                    : 'bg-purple-900/50 text-purple-300 hover:bg-purple-800/50'
                }`}
              >
                <PianoIcon className="w-5 h-5" />
                <span>Piano Mode</span>
              </button>
              <button className="p-2 hover:bg-purple-500/20 rounded-lg transition">
                <Sparkles className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>
      </header>
      
      <div className="container mx-auto px-6 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Left: Sample Browser */}
          <div className="lg:col-span-1 space-y-4">
            {/* Search & Filter */}
            <div className="bg-black/40 backdrop-blur-xl rounded-2xl p-4 border border-purple-500/30">
              <div className="relative mb-4">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-purple-400" />
                <input
                  type="text"
                  placeholder="Search samples..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 bg-purple-950/50 border border-purple-500/30 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 text-white"
                />
              </div>
              
              {/* Tabs */}
              <div className="flex space-x-2 mb-4">
                <button
                  onClick={() => setActiveTab('all')}
                  className={`flex-1 py-2 rounded-lg transition ${
                    activeTab === 'all'
                      ? 'bg-purple-500 text-white'
                      : 'bg-purple-950/50 text-purple-300 hover:bg-purple-900/50'
                  }`}
                >
                  All
                </button>
                <button
                  onClick={() => setActiveTab('featured')}
                  className={`flex-1 py-2 rounded-lg transition ${
                    activeTab === 'featured'
                      ? 'bg-purple-500 text-white'
                      : 'bg-purple-950/50 text-purple-300 hover:bg-purple-900/50'
                  }`}
                >
                  Featured
                </button>
              </div>
              
              {/* Filter Toggle */}
              <button
                onClick={() => setShowFilters(!showFilters)}
                className="w-full flex items-center justify-center space-x-2 py-2 bg-purple-950/50 hover:bg-purple-900/50 rounded-lg transition"
              >
                <Filter className="w-4 h-4" />
                <span>Filters</span>
              </button>
              
              {/* Advanced Filters */}
              <AnimatePresence>
                {showFilters && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="mt-4 space-y-2 overflow-hidden"
                  >
                    <input
                      type="text"
                      placeholder="Mood"
                      value={filters.mood}
                      onChange={(e) => setFilters({ ...filters, mood: e.target.value })}
                      className="w-full px-3 py-2 bg-purple-950/50 border border-purple-500/30 rounded-lg text-sm text-white"
                    />
                    <input
                      type="text"
                      placeholder="Genre"
                      value={filters.genre}
                      onChange={(e) => setFilters({ ...filters, genre: e.target.value })}
                      className="w-full px-3 py-2 bg-purple-950/50 border border-purple-500/30 rounded-lg text-sm text-white"
                    />
                    <input
                      type="text"
                      placeholder="Key"
                      value={filters.key}
                      onChange={(e) => setFilters({ ...filters, key: e.target.value })}
                      className="w-full px-3 py-2 bg-purple-950/50 border border-purple-500/30 rounded-lg text-sm text-white"
                    />
                    <input
                      type="number"
                      placeholder="BPM"
                      value={filters.bpm}
                      onChange={(e) => setFilters({ ...filters, bpm: e.target.value })}
                      className="w-full px-3 py-2 bg-purple-950/50 border border-purple-500/30 rounded-lg text-sm text-white"
                    />
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
            
            {/* Sample List */}
            <div className="bg-black/40 backdrop-blur-xl rounded-2xl p-4 border border-purple-500/30 max-h-[600px] overflow-y-auto custom-scrollbar">
              {filteredSamples.length === 0 ? (
                <div className="text-center py-8 text-purple-300">
                  <p>No samples found.</p>
                  <p className="text-sm mt-2">Add samples to your Supabase database to get started!</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {filteredSamples.map((sample) => (
                    <motion.div
                      key={sample.id}
                      whileHover={{ scale: 1.02 }}
                      onClick={() => handleSampleSelect(sample)}
                      className={`p-3 rounded-lg cursor-pointer transition ${
                        currentSample?.id === sample.id
                          ? 'bg-purple-500/30 border border-purple-400'
                          : 'bg-purple-950/30 hover:bg-purple-900/30 border border-transparent'
                      }`}
                    >
                      <div className="flex items-center space-x-3">
                        {sample.thumbnail_url ? (
                          <img
                            src={sample.thumbnail_url}
                            alt={sample.name}
                            className="w-12 h-12 rounded-lg object-cover"
                          />
                        ) : (
                          <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
                            <Radio className="w-6 h-6" />
                          </div>
                        )}
                        
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold truncate flex items-center space-x-2">
                            <span>{sample.name}</span>
                            {sample.has_stems && (
                              <Layers className="w-3 h-3 text-purple-400" />
                            )}
                          </p>
                          <p className="text-xs text-purple-300 truncate">
                            {sample.artist || 'Unknown Artist'}
                          </p>
                        </div>
                        
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleLike(sample);
                          }}
                          className="p-2 hover:bg-purple-500/20 rounded-lg transition"
                        >
                          <Heart className="w-4 h-4" />
                        </button>
                      </div>
                      
                      <div className="flex items-center space-x-2 mt-2 text-xs text-purple-300">
                        <span className="px-2 py-1 bg-purple-900/50 rounded">{sample.bpm} BPM</span>
                        <span className="px-2 py-1 bg-purple-900/50 rounded">{sample.key}</span>
                        {sample.genre && (
                          <span className="px-2 py-1 bg-purple-900/50 rounded">{sample.genre}</span>
                        )}
                        <span className="ml-auto">❤️ {sample.likes}</span>
                      </div>
                    </motion.div>
                  ))}
                </div>
              )}
            </div>
          </div>
          
          {/* Right: Player & Piano */}
          <div className="lg:col-span-2 space-y-6">
            {/* Main Player */}
            <div className="bg-black/40 backdrop-blur-xl rounded-2xl p-6 border border-purple-500/30">
              {currentSample ? (
                <div className="space-y-6">
                  {/* Album Art & Info */}
                  <div className="flex items-start space-x-6">
                    {currentSample.thumbnail_url ? (
                      <img
                        src={currentSample.thumbnail_url}
                        alt={currentSample.name}
                        className="w-32 h-32 rounded-xl object-cover shadow-2xl"
                      />
                    ) : (
                      <div className="w-32 h-32 rounded-xl bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center shadow-2xl">
                        <Radio className="w-16 h-16" />
                      </div>
                    )}
                    
                    <div className="flex-1">
                      <h2 className="text-2xl font-bold mb-1 flex items-center space-x-2">
                        <span>{currentSample.name}</span>
                        {currentSample.has_stems && (
                          <span className="text-sm px-2 py-1 bg-purple-500/20 rounded-lg text-purple-300">
                            Stems
                          </span>
                        )}
                      </h2>
                      <p className="text-purple-300 mb-4">{currentSample.artist || 'Unknown Artist'}</p>
                      
                      <div className="flex items-center space-x-3">
                        {pianoMode ? (
                          <div className="flex items-center space-x-2 px-4 py-2 bg-purple-500/20 rounded-lg">
                            <Music className="w-5 h-5 text-purple-400" />
                            <span className="text-sm text-purple-300">
                              Play notes on keyboard or click piano
                            </span>
                          </div>
                        ) : (
                          <>
                            <button className="p-4 bg-purple-500 hover:bg-purple-600 rounded-full transition transform hover:scale-105">
                              <Play className="w-6 h-6 ml-1" />
                            </button>
                            <button className="p-3 bg-purple-900/50 hover:bg-purple-800/50 rounded-full transition">
                              <Download className="w-5 h-5" />
                            </button>
                          </>
                        )}
                        
                        <button
                          onClick={resetEffects}
                          className="p-3 bg-purple-900/50 hover:bg-purple-800/50 rounded-full transition"
                        >
                          <RotateCcw className="w-5 h-5" />
                        </button>
                      </div>
                    </div>
                  </div>
                  
                  {/* Piano Keyboard */}
                  {pianoMode && (
                    <div className="space-y-4">
                      <PianoKeyboard
                        onNoteOn={handleNoteOn}
                        onNoteOff={handleNoteOff}
                        activeNotes={activeNotes}
                        octaveShift={octaveShift}
                      />
                      
                      {/* Octave Control */}
                      <div className="flex items-center justify-center space-x-4">
                        <button
                          onClick={() => setOctaveShift(Math.max(-2, octaveShift - 1))}
                          disabled={octaveShift <= -2}
                          className="px-4 py-2 bg-purple-900/50 hover:bg-purple-800/50 disabled:opacity-30 rounded-lg transition"
                        >
                          Octave -
                        </button>
                        <span className="text-purple-300 font-semibold">
                          Octave: {octaveShift >= 0 ? '+' : ''}{octaveShift}
                        </span>
                        <button
                          onClick={() => setOctaveShift(Math.min(2, octaveShift + 1))}
                          disabled={octaveShift >= 2}
                          className="px-4 py-2 bg-purple-900/50 hover:bg-purple-800/50 disabled:opacity-30 rounded-lg transition"
                        >
                          Octave +
                        </button>
                      </div>
                      
                      <p className="text-xs text-center text-purple-400">
                        Use Z/X keys to change octave • A-; keys for white notes • W-P keys for black notes
                      </p>
                    </div>
                  )}
                  
                  {/* Visualizer */}
                  <div className="bg-black/60 rounded-xl p-4 border border-purple-500/20">
                    <AudioVisualizer processor={processorRef.current} isActive={isActive} />
                  </div>
                </div>
              ) : (
                <div className="text-center py-20">
                  <PianoIcon className="w-20 h-20 mx-auto mb-4 text-purple-400" />
                  <p className="text-xl text-purple-300">Select a sample to begin</p>
                  <p className="text-sm text-purple-400 mt-2">
                    Piano mode enabled - play samples across the keyboard!
                  </p>
                </div>
              )}
            </div>
            
            {/* Stems Panel */}
            {currentSample && stems.length > 0 && (
              <div className="bg-black/40 backdrop-blur-xl rounded-2xl p-6 border border-purple-500/30">
                <h3 className="text-xl font-bold mb-4 flex items-center space-x-2">
                  <Layers className="w-5 h-5" />
                  <span>Individual Stems</span>
                </h3>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {stems.map((stem) => (
                    <StemControl
                      key={stem.id}
                      stem={stem}
                      volume={stemVolumes[stem.id] || 1.0}
                      onVolumeChange={(vol) => setStemVolumes({ ...stemVolumes, [stem.id]: vol })}
                      onMute={() => {
                        const newMuted = new Set(mutedStems);
                        if (newMuted.has(stem.id)) {
                          newMuted.delete(stem.id);
                        } else {
                          newMuted.add(stem.id);
                        }
                        setMutedStems(newMuted);
                      }}
                      isMuted={mutedStems.has(stem.id)}
                    />
                  ))}
                </div>
              </div>
            )}
            
            {/* Effects Panel */}
            {currentSample && (
              <div className="bg-black/40 backdrop-blur-xl rounded-2xl p-6 border border-purple-500/30">
                <h3 className="text-xl font-bold mb-6 flex items-center space-x-2">
                  <Volume2 className="w-5 h-5" />
                  <span>Analog Processing</span>
                </h3>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Tape Emulation */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="text-sm font-semibold text-purple-300">Tape Emulation</label>
                      <button
                        onClick={() => handleEffectChange('tape', !effects.tape ? 0.5 : false)}
                        className={`px-3 py-1 rounded-lg text-xs transition ${
                          effects.tape
                            ? 'bg-purple-500 text-white'
                            : 'bg-purple-900/50 text-purple-300'
                        }`}
                      >
                        {effects.tape ? 'ON' : 'OFF'}
                      </button>
                    </div>
                    {effects.tape && (
                      <input
                        type="range"
                        min="0"
                        max="1"
                        step="0.01"
                        value={effects.tape}
                        onChange={(e) => handleEffectChange('tape', parseFloat(e.target.value))}
                        className="w-full accent-purple-500"
                      />
                    )}
                  </div>
                  
                  {/* Vinyl Crackle */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="text-sm font-semibold text-purple-300">Vinyl Crackle</label>
                      <button
                        onClick={() => handleEffectChange('vinyl', !effects.vinyl)}
                        className={`px-3 py-1 rounded-lg text-xs transition ${
                          effects.vinyl
                            ? 'bg-purple-500 text-white'
                            : 'bg-purple-900/50 text-purple-300'
                        }`}
                      >
                        {effects.vinyl ? 'ON' : 'OFF'}
                      </button>
                    </div>
                  </div>
                  
                  {/* Reverb */}
                  <div className="space-y-2">
                    <label className="text-sm font-semibold text-purple-300">Reverb</label>
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step="0.01"
                      value={effects.reverb}
                      onChange={(e) => handleEffectChange('reverb', parseFloat(e.target.value))}
                      className="w-full accent-purple-500"
                    />
                    <div className="text-xs text-purple-400 text-right">{Math.round(effects.reverb * 100)}%</div>
                  </div>
                  
                  {/* Delay */}
                  <div className="space-y-2">
                    <label className="text-sm font-semibold text-purple-300">Delay</label>
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step="0.01"
                      value={effects.delay}
                      onChange={(e) => handleEffectChange('delay', parseFloat(e.target.value))}
                      className="w-full accent-purple-500"
                    />
                    <div className="text-xs text-purple-400 text-right">{Math.round(effects.delay * 100)}%</div>
                  </div>
                  
                  {/* Distortion */}
                  <div className="space-y-2">
                    <label className="text-sm font-semibold text-purple-300">Distortion</label>
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step="0.01"
                      value={effects.distortion}
                      onChange={(e) => handleEffectChange('distortion', parseFloat(e.target.value))}
                      className="w-full accent-purple-500"
                    />
                    <div className="text-xs text-purple-400 text-right">{Math.round(effects.distortion * 100)}%</div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default FeelzMachine;