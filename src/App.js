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

// Simplified Audio Processor - Pitch/Tempo/Speed Only
class AnalogProcessor {
  constructor() {
    this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
    this.masterGain = this.audioContext.createGain();
    this.masterGain.gain.value = 1.0;
    this.analyser = this.audioContext.createAnalyser();
    this.analyser.fftSize = 2048;
    
    this.currentBuffer = null;
    this.currentSource = null;
    
    this.masterGain.connect(this.analyser);
    this.masterGain.connect(this.audioContext.destination);
  }
  
  async loadAudio(url) {
    const response = await fetch(url);
    const arrayBuffer = await response.arrayBuffer();
    this.currentBuffer = await this.audioContext.decodeAudioData(arrayBuffer);
    return this.currentBuffer;
  }
  
  play(pitch, speed) {
    if (!this.currentBuffer) return;
    
    this.stop();
    
    const source = this.audioContext.createBufferSource();
    source.buffer = this.currentBuffer;
    source.loop = true;
    
    const pitchRate = Math.pow(2, pitch / 12);
    source.playbackRate.value = pitchRate * speed;
    
    source.connect(this.masterGain);
    source.start();
    
    this.currentSource = source;
  }

  updatePlayback(pitch, speed) {
    if (!this.currentSource) return;
    
    try {
      const pitchRate = Math.pow(2, pitch / 12);
      this.currentSource.playbackRate.value = pitchRate * speed;
    } catch (error) {
      console.error('Error updating playback:', error);
    }
  }

  async renderWithEffects(pitch, speed) {
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
    
    source.connect(offlineCtx.destination);
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