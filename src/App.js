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
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-blue-900 to-gray-900 text-white relative overflow-hidden flex flex-col">
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
              
                href="https://discord.gg/jwZU6YSKnf"
                target="_blank"
                rel="noopener noreferrer"
                className="p-2 bg-blue-500/20 hover:bg-blue-500/30 rounded-lg transition"
                title="Join our Discord"
              >
                <svg className="w-5 h-5 text-blue-400" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515a.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0a12.64 12.64 0 0 0-.617-1.25a.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057a19.9 19.9 0 0 0 5.993 3.03a.078.078 0 0 0 .084-.028a14.09 14.09 0 0 0 1.226-1.994a.076.076 0 0 0-.041-.106a13.107 13.107 0 0 1-1.872-.892a.077.077 0 0 1-.008-.128a10.2 10.2 0 0 0 .372-.292a.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127a12.299 12.299 0 0 1-1.873.892a.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028a19.839 19.839 0 0 0 6.002-3.03a.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419c0-1.333.956-2.419 2.157-2.419c1.21 0 2.176 1.096 2.157 2.42c0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419c0-1.333.955-2.419 2.157-2.419c1.21 0 2.176 1.096 2.157 2.42c0 1.333-.946 2.418-2.157 2.418z"/>
                </svg>
              </a>
              
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
              <p className="text-cyan-300 text-sm mb-4">
                By continuing, you agree to our{' '}
                <a href="/terms-of-use" className="text-cyan-400 hover:text-cyan-300 underline">Terms of Use</a>
                {' '}and{' '}
                <a href="/privacy-policy" className="text-cyan-400 hover:text-cyan-300 underline">Privacy Policy</a>
              </p>
              
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

      <div className="relative flex-1">
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

      {/* Footer */}
      <footer className="border-t border-cyan-500/20 bg-black/40 backdrop-blur-xl mt-auto">
        <div className="max-w-[1800px] mx-auto px-8 py-6">
          <div className="flex flex-col md:flex-row items-center justify-between space-y-4 md:space-y-0">
            <div className="flex items-center space-x-4 text-xs text-cyan-400">
              <a 
                href="/privacy-policy" 
                className="hover:text-cyan-300 transition"
              >
                Privacy Policy
              </a>
              <span className="text-cyan-600">•</span>
              <a 
                href="/terms-of-use" 
                className="hover:text-cyan-300 transition"
              >
                Terms of Use
              </a>
              <span className="text-cyan-600">•</span>
              <a 
                href="mailto:steve@projectfeelz.com" 
                className="hover:text-cyan-300 transition"
              >
                Support
              </a>
            </div>
            
            <div className="flex items-center space-x-3">
              
                href="https://discord.gg/jwZU6YSKnf"
                target="_blank"
                rel="noopener noreferrer"
                className="p-2 bg-blue-500/20 hover:bg-blue-500/30 rounded-lg transition group"
                title="Join our Discord"
              >
                <svg className="w-5 h-5 text-blue-400 group-hover:text-blue-300 transition" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515a.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0a12.64 12.64 0 0 0-.617-1.25a.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057a19.9 19.9 0 0 0 5.993 3.03a.078.078 0 0 0 .084-.028a14.09 14.09 0 0 0 1.226-1.994a.076.076 0 0 0-.041-.106a13.107 13.107 0 0 1-1.872-.892a.077.077 0 0 1-.008-.128a10.2 10.2 0 0 0 .372-.292a.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127a12.299 12.299 0 0 1-1.873.892a.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028a19.839 19.839 0 0 0 6.002-3.03a.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419c0-1.333.956-2.419 2.157-2.419c1.21 0 2.176 1.096 2.157 2.42c0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419c0-1.333.955-2.419 2.157-2.419c1.21 0 2.176 1.096 2.157 2.42c0 1.333-.946 2.418-2.157 2.418z"/>
                </svg>
              </a>
              
              <span className="text-xs text-cyan-600">
                © 2025 Feelz Machine
              </span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}

export default FeelzMachine;