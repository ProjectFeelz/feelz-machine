import React, { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Disc3, Sparkles, ArrowRight, Music, Zap, Users } from 'lucide-react';

function LandingPage({ onEnter }) {
  const canvasRef = useRef(null);
  const particlesRef = useRef([]);
  const mouseRef = useRef({ x: 0, y: 0 });
  const animationRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    
    // Set canvas size
    const resizeCanvas = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    // Particle class
    class Particle {
      constructor(x, y) {
        this.x = x;
        this.y = y;
        this.vx = (Math.random() - 0.5) * 2;
        this.vy = (Math.random() - 0.5) * 2;
        this.life = 100;
        this.maxLife = 100;
        this.size = Math.random() * 3 + 1;
        this.color = this.getRandomColor();
      }

      getRandomColor() {
        const colors = [
          'rgba(59, 130, 246, ', // blue
          'rgba(139, 92, 246, ', // purple
          'rgba(236, 72, 153, ', // pink
          'rgba(167, 139, 250, ', // light purple
        ];
        return colors[Math.floor(Math.random() * colors.length)];
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
        
        // Glow effect
        const gradient = ctx.createRadialGradient(
          this.x, this.y, 0,
          this.x, this.y, this.size * 4
        );
        gradient.addColorStop(0, this.color + opacity + ')');
        gradient.addColorStop(0.5, this.color + (opacity * 0.5) + ')');
        gradient.addColorStop(1, this.color + '0)');
        
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size * 4, 0, Math.PI * 2);
        ctx.fill();

        // Core
        ctx.fillStyle = this.color + opacity + ')';
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
        ctx.fill();
      }

      isDead() {
        return this.life <= 0;
      }
    }

    // Mouse move handler
    const handleMouseMove = (e) => {
      mouseRef.current = {
        x: e.clientX,
        y: e.clientY
      };

      // Create particles at mouse position
      for (let i = 0; i < 5; i++) {
        particlesRef.current.push(
          new Particle(
            e.clientX + (Math.random() - 0.5) * 20,
            e.clientY + (Math.random() - 0.5) * 20
          )
        );
      }
    };

    // Touch support for mobile
    const handleTouchMove = (e) => {
      const touch = e.touches[0];
      handleMouseMove({
        clientX: touch.clientX,
        clientY: touch.clientY
      });
    };

    canvas.addEventListener('mousemove', handleMouseMove);
    canvas.addEventListener('touchmove', handleTouchMove);

    // Animation loop
    const animate = () => {
      // Fade effect instead of clear
      ctx.fillStyle = 'rgba(10, 10, 15, 0.1)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Update and draw particles
      particlesRef.current = particlesRef.current.filter(particle => {
        particle.update();
        particle.draw(ctx);
        return !particle.isDead();
      });

      // Limit particles
      if (particlesRef.current.length > 500) {
        particlesRef.current = particlesRef.current.slice(-500);
      }

      animationRef.current = requestAnimationFrame(animate);
    };

    animate();

    return () => {
      window.removeEventListener('resize', resizeCanvas);
      canvas.removeEventListener('mousemove', handleMouseMove);
      canvas.removeEventListener('touchmove', handleTouchMove);
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, []);

  return (
    <div className="relative min-h-screen overflow-hidden bg-gradient-to-br from-gray-900 via-purple-900 to-black">
      {/* Bioluminescent Canvas */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 z-0"
      />

      {/* Ambient Waves Background */}
      <div className="absolute inset-0 z-0 opacity-30">
        <div className="absolute inset-0 bg-gradient-to-t from-blue-500/20 via-purple-500/20 to-transparent animate-pulse"></div>
        <div className="absolute inset-0 bg-gradient-to-b from-pink-500/10 via-purple-500/10 to-transparent animate-pulse" style={{ animationDelay: '1s' }}></div>
      </div>

      {/* Content */}
      <div className="relative z-10 min-h-screen flex flex-col items-center justify-center px-6 text-center">
        {/* Logo */}
        <motion.div
          initial={{ scale: 0, rotate: -180 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ type: 'spring', duration: 1, delay: 0.2 }}
          className="mb-8"
        >
          <Disc3 className="w-24 h-24 text-purple-400 mx-auto animate-spin-slow" />
        </motion.div>

        {/* Title */}
        <motion.h1
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.4 }}
          className="text-6xl md:text-8xl font-bold mb-6"
        >
          <span className="bg-gradient-to-r from-blue-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">
            Feelz Machine
          </span>
        </motion.h1>

        {/* Subtitle */}
        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.6 }}
          className="text-xl md:text-2xl text-purple-300 mb-12 max-w-2xl"
        >
          Discover, play, and download premium sample packs.
          <br />
          <span className="text-purple-400">Interactive. Polyphonic. Professional.</span>
        </motion.p>

        {/* Features */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.8 }}
          className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12 max-w-4xl"
        >
          <div className="bg-black/40 backdrop-blur-xl rounded-2xl p-6 border border-purple-500/30 hover:border-purple-400/70 transition">
            <Music className="w-8 h-8 text-purple-400 mx-auto mb-3" />
            <h3 className="text-lg font-bold text-white mb-2">Piano Mode</h3>
            <p className="text-sm text-purple-300">Play samples across a polyphonic keyboard</p>
          </div>

          <div className="bg-black/40 backdrop-blur-xl rounded-2xl p-6 border border-purple-500/30 hover:border-purple-400/70 transition">
            <Zap className="w-8 h-8 text-purple-400 mx-auto mb-3" />
            <h3 className="text-lg font-bold text-white mb-2">Analog Effects</h3>
            <p className="text-sm text-purple-300">Tape, vinyl, reverb, delay, and distortion</p>
          </div>

          <div className="bg-black/40 backdrop-blur-xl rounded-2xl p-6 border border-purple-500/30 hover:border-purple-400/70 transition">
            <Users className="w-8 h-8 text-purple-400 mx-auto mb-3" />
            <h3 className="text-lg font-bold text-white mb-2">Stems Included</h3>
            <p className="text-sm text-purple-300">Download individual stems + MIDI files</p>
          </div>
        </motion.div>

        {/* CTA Button */}
        <motion.button
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.8, delay: 1 }}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={onEnter}
          className="group relative px-12 py-5 bg-gradient-to-r from-purple-500 to-pink-500 rounded-full text-white text-xl font-bold shadow-2xl shadow-purple-500/50 hover:shadow-purple-500/70 transition-all"
        >
          <span className="flex items-center space-x-3">
            <span>Enter Feelz Machine</span>
            <ArrowRight className="w-6 h-6 group-hover:translate-x-2 transition-transform" />
          </span>
          
          {/* Glow effect */}
          <div className="absolute inset-0 rounded-full bg-gradient-to-r from-purple-400 to-pink-400 opacity-0 group-hover:opacity-30 blur-xl transition-opacity"></div>
        </motion.button>

        {/* Hint text */}
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 1, delay: 1.2 }}
          className="mt-8 text-sm text-purple-400/70"
        >
          Move your mouse to create bioluminescent trails ✨
        </motion.p>
      </div>

      {/* Bottom gradient */}
      <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-black to-transparent z-5"></div>
    </div>
  );
}

export default LandingPage;