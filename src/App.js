import React, { useState, useEffect, useRef } from 'react';
import { supabase } from './supabaseClient';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Disc3,
  Sparkles,
  LogIn
} from 'lucide-react';
import StorefrontGrid from './StorefrontGrid';
import PackPlayer from './PackPlayer';

// Audio Processor with Effects
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
    
    this.currentBuffer = null;
    this.currentSource = null;
    this.vinylNode = null;
    
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
  
  buildEffectChain(source, effects) {
    let currentNode = source;
    
    // Tape
    if (effects.tape > 0) {
      const tape = this.audioContext.createWaveShaper();
      tape.curve = this.makeTapeCurve(effects.tape);
      currentNode.connect(tape);
      currentNode = tape;
    }
    
    // Distortion
    if (effects.distortion > 0) {
      const dist = this.audioContext.createWaveShaper();
      dist.curve = this.makeDistortionCurve(effects.distortion * 100);
      currentNode.connect(dist);
      currentNode = dist;
    }
    
    // Filter
    const filter = this.audioContext.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = effects.tape ? 20000 - (effects.tape * 15000) : 20000;
    currentNode.connect(filter);
    currentNode = filter;
    
    // Main output
    currentNode.connect(this.masterGain);
    
    // Delay (parallel)
    if (effects.delay > 0) {
      const delay = this.audioContext.createDelay();
      const feedback = this.audioContext.createGain();
      delay.delayTime.value = 0.3;
      feedback.gain.value = effects.delay * 0.7;
      
      currentNode.connect(delay);
      delay.connect(feedback);
      feedback.connect(delay);
      delay.connect(this.masterGain);
    }
    
    // Reverb (parallel)
    if (effects.reverb > 0) {
      const reverbGain = this.audioContext.createGain();
      reverbGain.gain.value = effects.reverb;
      currentNode.connect(reverbGain);
      reverbGain.connect(this.reverbNode);
      this.reverbNode.connect(this.masterGain);
    }
  }
  
  play(effects = {}, pitch = 0, speed = 1.0) {
    if (!this.currentBuffer) return;
    
    this.stop();
    
    const source = this.audioContext.createBufferSource();
    source.buffer = this.currentBuffer;
    source.loop = true;
    
    // Pitch shift (semitones)
    // Speed control (0.5 = half speed, 2.0 = double speed)
    const pitchRate = Math.pow(2, pitch / 12);
    source.playbackRate.value = pitchRate * speed;
    
    this.buildEffectChain(source, effects);
    
    source.start();
    this.currentSource = source;
    
    // Vinyl if enabled
    if (effects.vinyl > 0 && !this.vinylNode) {
      this.startVinyl();
    } else if (effects.vinyl === 0 && this.vinylNode) {
      this.stopVinyl();
    }
  }
  
  stop() {
    if (this.currentSource) {
      try {
        this.currentSource.stop();
      } catch (e) {}
      this.currentSource.disconnect();
      this.currentSource = null;
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
      } catch (e) {}
      this.vinylNode = null;
    }
  }
  
  getAnalyserData() {
    const dataArray = new Uint8Array(this.analyser.frequencyBinCount);
    this.analyser.getByteFrequencyData(dataArray);
    return dataArray;
  }
  
  isPlaying() {
    return this.currentSource !== null;
  }
}

// Bioluminescent Particles
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
  const processorRef = useRef(new AnalogProcessor());

  const handlePackSelect = (pack) => {
    setSelectedPack(pack);
    processorRef.current.stop();
  };

  const handlePackClose = () => {
    setSelectedPack(null);
    processorRef.current.stop();
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
    </div>
  );
}

export default FeelzMachine;