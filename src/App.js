import React, { useState, useEffect, useRef } from 'react';
import { supabase } from './supabaseClient';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Sparkles,
  LogIn,
  Loader
} from 'lucide-react';
import StorefrontGrid from './StorefrontGrid';
import PackPlayer from './PackPlayer';

// Audio Processor with Effects + Offline Rendering - WORKING VERSION
class AnalogProcessor {
  constructor() {
    this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
    this.masterGain = this.audioContext.createGain();
    this.masterGain.gain.value = 0.8;
    this.analyser = this.audioContext.createAnalyser();
    this.analyser.fftSize = 2048;
    
    this.createVinylNoise();
    this.createReverbImpulse();
    
    this.currentBuffer = null;
    this.currentSource = null;
    this.vinylNode = null;
    this.lastEffects = {};
    
    this.reverbNode = this.audioContext.createConvolver();
    this.delayNode = this.audioContext.createDelay(1.0);
    this.delayNode.delayTime.value = 0.3;
    this.delayFeedback = this.audioContext.createGain();
    this.delayFeedback.gain.value = 0;
    
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
    const length = this.audioContext.sampleRate * 3;
    const impulse = this.audioContext.createBuffer(2, length, this.audioContext.sampleRate);
    const left = impulse.getChannelData(0);
    const right = impulse.getChannelData(1);
    for (let i = 0; i < length; i++) {
      const decay = Math.exp(-i / (this.audioContext.sampleRate * 1.0));
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
  
  play(effects, pitch, speed) {
    if (!this.currentBuffer) return;
    
    this.stop();
    
    const source = this.audioContext.createBufferSource();
    source.buffer = this.currentBuffer;
    source.loop = true;
    
    const pitchRate = Math.pow(2, pitch / 12);
    source.playbackRate.value = pitchRate * speed;
    
    let node = source;
    
    if (effects.tape > 0) {
      const tapeFilter = this.audioContext.createBiquadFilter();
      tapeFilter.type = 'lowpass';
      tapeFilter.frequency.value = 20000 - (effects.tape * 15000);
      
      const tapeDistortion = this.audioContext.createWaveShaper();
      tapeDistortion.curve = this.makeTapeCurve(effects.tape);
      tapeDistortion.oversample = '4x';
      
      node.connect(tapeDistortion);
      tapeDistortion.connect(tapeFilter);
      node = tapeFilter;
    }
    
    if (effects.distortion > 0) {
      const distortion = this.audioContext.createWaveShaper();
      distortion.curve = this.makeDistortionCurve(effects.distortion * 100);
      distortion.oversample = '4x';
      
      node.connect(distortion);
      node = distortion;
    }
    
    const dryGain = this.audioContext.createGain();
    dryGain.gain.value = 1.0;
    node.connect(dryGain);
    dryGain.connect(this.masterGain);
    
    if (effects.reverb > 0) {
      const reverbSend = this.audioContext.createGain();
      reverbSend.gain.value = effects.reverb * 0.7;
      
      node.connect(reverbSend);
      reverbSend.connect(this.reverbNode);
      this.reverbNode.connect(this.masterGain);
      
      console.log('Reverb connected:', effects.reverb);
    }
    
    if (effects.delay > 0) {
      const delaySend = this.audioContext.createGain();
      delaySend.gain.value = effects.delay * 0.6;
      
      this.delayFeedback.gain.value = effects.delay * 0.5;
      
      node.connect(delaySend);
      delaySend.connect(this.delayNode);
      
      this.delayNode.connect(this.delayFeedback);
      this.delayFeedback.connect(this.delayNode);
      
      const delayOutput = this.audioContext.createGain();
      delayOutput.gain.value = 1.0;
      this.delayNode.connect(delayOutput);
      delayOutput.connect(this.masterGain);
      
      console.log('Delay connected:', effects.delay);
    }
    
    source.start();
    this.currentSource = source;
    this.currentNode = node;
    this.lastEffects = Object.assign({}, effects);
    
    if (effects.vinyl > 0 && !this.vinylNode) {
      this.startVinyl(effects.vinyl);
    } else if (effects.vinyl === 0 && this.vinylNode) {
      this.stopVinyl();
    } else if (this.vinylNode && effects.vinyl > 0) {
      if (this.vinylNode.gainNode) {
        this.vinylNode.gainNode.gain.value = effects.vinyl * 0.08;
      }
    }
  }

  updateEffects(effects, pitch, speed) {
    if (!this.currentSource) return;
    
    try {
      const pitchRate = Math.pow(2, pitch / 12);
      this.currentSource.playbackRate.value = pitchRate * speed;
      
      const lastEffects = this.lastEffects || {};
      
      const hasSignificantChange = 
        Math.abs(effects.tape - (lastEffects.tape || 0)) > 0.1 ||
        Math.abs(effects.distortion - (lastEffects.distortion || 0)) > 0.1 ||
        Math.abs(effects.reverb - (lastEffects.reverb || 0)) > 0.1 ||
        Math.abs(effects.delay - (lastEffects.delay || 0)) > 0.1;
      
      if (hasSignificantChange) {
        this.play(effects, pitch, speed);
        return;
      }
      
      if (effects.vinyl > 0 && !this.vinylNode) {
        this.startVinyl(effects.vinyl);
      } else if (effects.vinyl === 0 && this.vinylNode) {
        this.stopVinyl();
      } else if (this.vinylNode && this.vinylNode.gainNode) {
        const rampTime = this.audioContext.currentTime + 0.015;
        this.vinylNode.gainNode.gain.linearRampToValueAtTime(effects.vinyl * 0.08, rampTime);
      }
      
      this.lastEffects = Object.assign({}, effects);
    } catch (error) {
      console.error('Error updating effects:', error);
    }
  }

  async renderWithEffects(effects, pitch, speed) {
    if (!this.currentBuffer) {
      throw new Error('No audio loaded');
    }

    const pitchRate = Math.pow(2, pitch / 12);
    const totalRate = pitchRate * speed;
    const newLength = Math.floor(this.currentBuffer.length / totalRate);
    
    const offlineCtx = new OfflineAudioContext(
      this.currentBuffer.numberOfChannels,
      newLength,
      this.currentBuffer.sampleRate
    );

    const source = offlineCtx.createBufferSource();
    source.buffer = this.currentBuffer;
    source.playbackRate.value = totalRate;

    let node = source;
    
    if (effects.tape > 0) {
      const tapeFilter = offlineCtx.createBiquadFilter();
      tapeFilter.type = 'lowpass';
      tapeFilter.frequency.value = 20000 - (effects.tape * 15000);
      
      const tapeDistortion = offlineCtx.createWaveShaper();
      tapeDistortion.curve = this.makeTapeCurve(effects.tape);
      
      node.connect(tapeDistortion);
      tapeDistortion.connect(tapeFilter);
      node = tapeFilter;
    }
    
    if (effects.distortion > 0) {
      const distortion = offlineCtx.createWaveShaper();
      distortion.curve = this.makeDistortionCurve(effects.distortion * 100);
      
      node.connect(distortion);
      node = distortion;
    }

    node.connect(offlineCtx.destination);

    if (effects.reverb > 0) {
      const offlineReverb = offlineCtx.createConvolver();
      const length = offlineCtx.sampleRate * 3;
      const impulse = offlineCtx.createBuffer(2, length, offlineCtx.sampleRate);
      const left = impulse.getChannelData(0);
      const right = impulse.getChannelData(1);
      for (let i = 0; i < length; i++) {
        const decay = Math.exp(-i / (offlineCtx.sampleRate * 1.0));
        left[i] = (Math.random() * 2 - 1) * decay;
        right[i] = (Math.random() * 2 - 1) * decay;
      }
      offlineReverb.buffer = impulse;

      const reverbGain = offlineCtx.createGain();
      reverbGain.gain.value = effects.reverb * 0.7;
      
      node.connect(reverbGain);
      reverbGain.connect(offlineReverb);
      offlineReverb.connect(offlineCtx.destination);
    }

    if (effects.delay > 0) {
      const delay = offlineCtx.createDelay(1.0);
      const feedback = offlineCtx.createGain();
      const delayGain = offlineCtx.createGain();
      
      delay.delayTime.value = 0.3;
      feedback.gain.value = effects.delay * 0.5;
      delayGain.gain.value = effects.delay * 0.6;
      
      node.connect(delayGain);
      delayGain.connect(delay);
      delay.connect(feedback);
      feedback.connect(delay);
      delay.connect(offlineCtx.destination);
    }

    if (effects.vinyl > 0) {
      const vinylSource = offlineCtx.createBufferSource();
      const vinylBuffer = offlineCtx.createBuffer(1, newLength, offlineCtx.sampleRate);
      const vinylData = vinylBuffer.getChannelData(0);
      for (let i = 0; i < newLength; i++) {
        vinylData[i] = (Math.random() * 2 - 1) * 0.02 * effects.vinyl;
      }
      vinylSource.buffer = vinylBuffer;
      const vinylGain = offlineCtx.createGain();
      vinylGain.gain.value = 0.08;
      vinylSource.connect(vinylGain);
      vinylGain.connect(offlineCtx.destination);
      vinylSource.start();
    }

    source.start();

    const renderedBuffer = await offlineCtx.startRendering();
    return renderedBuffer;
  }
  
  stop() {
    if (this.currentSource) {
      try {
        this.currentSource.stop();
      } catch (e) {
        // Ignore
      }
      this.currentSource.disconnect();
      this.currentSource = null;
    }
  }
  
  startVinyl(amount) {
    if (this.vinylBuffer && !this.vinylNode) {
      const source = this.audioContext.createBufferSource();
      source.buffer = this.vinylBuffer;
      source.loop = true;
      const gain = this.audioContext.createGain();
      gain.gain.value = amount * 0.08;
      source.connect(gain);
      gain.connect(this.masterGain);
      source.start();
      source.gainNode = gain;
      this.vinylNode = source;
    }
  }
  
  stopVinyl() {
    if (this.vinylNode) {
      try {
        this.vinylNode.stop();
      } catch (e) {
        // Ignore
      }
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
        this.vx = (Math.random() - 0.5) * 1.5;
        this.vy = (Math.random() - 0.5) * 1.5;
        this.life = 80;
        this.maxLife = 80;
        this.size = Math.random() * 2.5 + 1;
        const colors = [
          'rgba(59, 130, 246, ',
          'rgba(6, 182, 212, ',
          'rgba(16, 185, 129, ',
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
          this.x, this.y, this.size * 4
        );
        gradient.addColorStop(0, this.color + (opacity * 0.8) + ')');
        gradient.addColorStop(0.5, this.color + (opacity * 0.4) + ')');
        gradient.addColorStop(1, this.color + '0)');
        
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size * 4, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = this.color + opacity + ')';
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
        ctx.fill();
      }

      isDead() {
        return this.life <= 0;
      }
    }

    const handleMouseMove = (e) => {
      for (let i = 0; i < 3; i++) {
        particlesRef.current.push(
          new Particle(
            e.clientX + (Math.random() - 0.5) * 15,
            e.clientY + (Math.random() - 0.5) * 15
          )
        );
      }
    };

    const handleTouchMove = (e) => {
      const touch = e.touches[0];
      for (let i = 0; i < 3; i++) {
        particlesRef.current.push(
          new Particle(
            touch.clientX + (Math.random() - 0.5) * 15,
            touch.clientY + (Math.random() - 0.5) * 15
          )
        );
      }
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('touchmove', handleTouchMove);

    const animate = () => {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.05)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      particlesRef.current = particlesRef.current.filter(particle => {
        particle.update();
        particle.draw(ctx);
        return !particle.isDead();
      });

      if (particlesRef.current.length > 300) {
        particlesRef.current = particlesRef.current.slice(-300);
      }

      animationRef.current = requestAnimationFrame(animate);
    };

    animate();

    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('touchmove', handleTouchMove);
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 pointer-events-none z-0"
      style={{ opacity: 0.6, touchAction: 'none' }}
    />
  );
};

// Main App
function FeelzMachine({ user, profile }) {
  const [selectedPack, setSelectedPack] = useState(null);
  const [signingIn, setSigningIn] = useState(false);
  const [showSignInModal, setShowSignInModal] = useState(false);
  const [emailInput, setEmailInput] = useState('');
  const processorRef = useRef(null);

  useEffect(() => {
    const initAudio = () => {
      if (!processorRef.current) {
        try {
          processorRef.current = new AnalogProcessor();
          document.removeEventListener('click', initAudio);
        } catch (error) {
          console.error('Failed to initialize audio:', error);
        }
      }
    };
    
    document.addEventListener('click', initAudio);
    
    return () => {
      document.removeEventListener('click', initAudio);
      if (processorRef.current) {
        processorRef.current.stop();
      }
    };
  }, []);

  const handlePackSelect = (pack) => {
    setSelectedPack(pack);
    if (processorRef.current) {
      processorRef.current.stop();
    }
  };

  const handlePackClose = () => {
    setSelectedPack(null);
    if (processorRef.current) {
      processorRef.current.stop();
    }
  };

  const handleSignIn = async () => {
    if (!emailInput.includes('@')) {
      alert('Please enter a valid email address');
      return;
    }
    
    setSigningIn(true);
    
    const { error } = await supabase.auth.signInWithOtp({
      email: emailInput.trim(),
      options: {
        emailRedirectTo: window.location.origin
      }
    });
    
    setSigningIn(false);
    setShowSignInModal(false);
    setEmailInput('');
    
    if (error) {
      alert('Error: ' + error.message);
    } else {
      alert('✓ Check your email for the magic link!');
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-blue-900 to-gray-900 text-white relative overflow-hidden">
      <BioluminescentParticles />
      
      <header className="border-b border-cyan-500/20 backdrop-blur-xl bg-white/5 sticky top-0 z-40 shadow-lg shadow-black/20">
        <div className="max-w-[1800px] mx-auto px-8 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <img 
                src={`${process.env.PUBLIC_URL}/logo.png`}
                alt="Feelz Machine" 
                className="w-10 h-10 object-contain"
              />
              <div>
                <h1 className="text-2xl font-bold bg-gradient-to-r from-blue-400 to-cyan-400 bg-clip-text text-transparent">
                  Feelz Machine
                </h1>
                <p className="text-xs text-cyan-300">Sample Pack Library</p>
              </div>
            </div>
            
            <div className="flex items-center space-x-3">
              {user && profile ? (
                <div className="flex items-center space-x-2">
                  <span className="text-xs text-cyan-300">Hey, {profile.name}!</span>
                  <Sparkles className="w-4 h-4 text-cyan-400" />
                </div>
              ) : (
                <button 
                  onClick={() => setShowSignInModal(true)}
                  className="flex items-center space-x-1 px-3 py-1.5 text-sm bg-blue-500 hover:bg-blue-600 rounded-lg transition"
                >
                  <LogIn className="w-3 h-3" />
                  <span>Sign In</span>
                </button>
              )}
            </div>
          </div>
        </div>
      </header>

      <AnimatePresence>
        {showSignInModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-gradient-to-br from-gray-900 to-blue-900 rounded-2xl p-6 border border-cyan-400/30 shadow-2xl max-w-md w-full mx-4"
            >
              <h2 className="text-2xl font-bold text-white mb-2">Sign In</h2>
              <p className="text-cyan-300 text-sm mb-4">Enter your email to receive a magic link</p>
              
              <input
                type="email"
                value={emailInput}
                onChange={(e) => setEmailInput(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleSignIn()}
                placeholder="your@email.com"
                className="w-full px-4 py-3 bg-blue-950/50 border border-cyan-500/30 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500 text-white mb-4"
                autoFocus
              />
              
              <div className="flex space-x-3">
                <button
                  onClick={handleSignIn}
                  disabled={signingIn}
                  className="flex-1 py-2.5 bg-gradient-to-r from-blue-500 to-cyan-500 hover:from-blue-600 hover:to-cyan-600 disabled:from-gray-600 disabled:to-gray-700 disabled:cursor-not-allowed rounded-lg font-semibold transition flex items-center justify-center space-x-2"
                >
                  {signingIn ? (
                    <>
                      <Loader className="w-4 h-4 animate-spin" />
                      <span>Sending...</span>
                    </>
                  ) : (
                    <span>Send Magic Link</span>
                  )}
                </button>
                
                <button
                  onClick={() => {
                    setShowSignInModal(false);
                    setEmailInput('');
                  }}
                  className="px-4 py-2.5 bg-white/10 hover:bg-white/20 rounded-lg transition"
                >
                  Cancel
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <div className="relative">
        <div className={`max-w-[1800px] mx-auto transition-all duration-300 ${
          selectedPack ? 'lg:mr-[36%] px-4' : 'px-8'
        } py-6`}>
          <StorefrontGrid 
            onPackSelect={handlePackSelect}
            selectedPack={selectedPack}
          />
        </div>

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