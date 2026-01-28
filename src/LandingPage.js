import React, { useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { ArrowRight, Music, Zap, Layers } from 'lucide-react';

function LandingPage({ onEnter }) {
  const canvasRef = useRef(null);
  const particlesRef = useRef([]);
  const animationRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    
    const resizeCanvas = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    class Particle {
      constructor(x, y) {
        this.x = x;
        this.y = y;
        this.vx = (Math.random() - 0.5) * 2;
        this.vy = (Math.random() - 0.5) * 2;
        this.life = 100;
        this.maxLife = 100;
        this.size = Math.random() * 3 + 1;
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
        gradient.addColorStop(0, this.color + opacity + ')');
        gradient.addColorStop(0.5, this.color + (opacity * 0.5) + ')');
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
      for (let i = 0; i < 5; i++) {
        particlesRef.current.push(
          new Particle(
            e.clientX + (Math.random() - 0.5) * 20,
            e.clientY + (Math.random() - 0.5) * 20
          )
        );
      }
    };

    const handleTouchMove = (e) => {
      const touch = e.touches[0];
      for (let i = 0; i < 5; i++) {
        particlesRef.current.push(
          new Particle(
            touch.clientX + (Math.random() - 0.5) * 20,
            touch.clientY + (Math.random() - 0.5) * 20
          )
        );
      }
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('touchmove', handleTouchMove);

    const animate = () => {
      ctx.fillStyle = 'rgba(10, 10, 15, 0.1)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      particlesRef.current = particlesRef.current.filter(particle => {
        particle.update();
        particle.draw(ctx);
        return !particle.isDead();
      });

      if (particlesRef.current.length > 500) {
        particlesRef.current = particlesRef.current.slice(-500);
      }

      animationRef.current = requestAnimationFrame(animate);
    };

    animate();

    return () => {
      window.removeEventListener('resize', resizeCanvas);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('touchmove', handleTouchMove);
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, []);

  return (
    <div className="relative min-h-screen overflow-hidden bg-gradient-to-br from-gray-900 via-blue-900 to-black">
      <canvas
        ref={canvasRef}
        className="absolute inset-0 z-0"
        style={{ touchAction: 'none' }}
      />

      <div className="absolute inset-0 z-0 opacity-30">
        <div className="absolute inset-0 bg-gradient-to-t from-blue-500/20 via-cyan-500/20 to-transparent animate-pulse"></div>
        <div className="absolute inset-0 bg-gradient-to-b from-green-500/10 via-blue-500/10 to-transparent animate-pulse" style={{ animationDelay: '1s' }}></div>
      </div>

      <div className="relative z-10 min-h-screen flex flex-col items-center justify-center px-6 text-center">
        <motion.div
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', duration: 1, delay: 0.2 }}
          className="mb-8"
        >
          <img 
            src={`${process.env.PUBLIC_URL}/logo.png`}
            alt="Feelz Machine" 
            className="w-32 h-32 object-contain mx-auto"
          />
        </motion.div>

        <motion.h1
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.4 }}
          className="text-6xl md:text-8xl font-bold mb-6"
        >
          <span className="bg-gradient-to-r from-blue-400 via-cyan-400 to-green-400 bg-clip-text text-transparent">
            Feelz Machine
          </span>
        </motion.h1>

        <motion.p
  initial={{ opacity: 0, y: 20 }}
  animate={{ opacity: 1, y: 0 }}
  transition={{ duration: 0.8, delay: 0.6 }}
  className="text-xl md:text-2xl text-cyan-300 mb-12 max-w-2xl"
>
  Royalty-Free samples. Instant playback.
</motion.p>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.8 }}
          className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12 max-w-4xl"
        >
          <div className="bg-white/5 backdrop-blur-2xl rounded-2xl p-6 border border-cyan-400/20 hover:border-cyan-400/40 transition shadow-xl shadow-black/40 hover:shadow-2xl hover:shadow-cyan-500/20">
            <Music className="w-8 h-8 text-cyan-400 mx-auto mb-3" />
            <h3 className="text-lg font-bold text-white mb-2">Instant Preview</h3>
            <p className="text-sm text-cyan-300">Stream and audition samples before downloading</p>
          </div>

          <div className="bg-white/5 backdrop-blur-2xl rounded-2xl p-6 border border-blue-400/20 hover:border-blue-400/40 transition shadow-xl shadow-black/40 hover:shadow-2xl hover:shadow-blue-500/20">
            <Zap className="w-8 h-8 text-blue-400 mx-auto mb-3" />
            <h3 className="text-lg font-bold text-white mb-2">Pitch & Tempo</h3>
            <p className="text-sm text-blue-300">Adjust key and BPM in real-time before download</p>
          </div>

          <div className="bg-white/5 backdrop-blur-2xl rounded-2xl p-6 border border-green-400/20 hover:border-green-400/40 transition shadow-xl shadow-black/40 hover:shadow-2xl hover:shadow-green-500/20">
            <Layers className="w-8 h-8 text-green-400 mx-auto mb-3" />
            <h3 className="text-lg font-bold text-white mb-2">Multi-Track Stems</h3>
            <p className="text-sm text-green-300">Download full mixes or individual instrument stems</p>
          </div>
        </motion.div>

        <motion.button
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.8, delay: 1 }}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={onEnter}
          className="group relative px-12 py-5 bg-gradient-to-r from-blue-500/90 to-cyan-500/90 rounded-full text-white text-xl font-bold shadow-2xl shadow-blue-500/50 hover:shadow-cyan-500/70 transition-all backdrop-blur-xl border border-white/20 hover:border-white/30"
        >
          <span className="flex items-center space-x-3">
            <span>Enter Feelz Machine</span>
            <ArrowRight className="w-6 h-6 group-hover:translate-x-2 transition-transform" />
          </span>
          
          <div className="absolute inset-0 rounded-full bg-gradient-to-r from-blue-400 to-cyan-400 opacity-0 group-hover:opacity-30 blur-xl transition-opacity"></div>
        </motion.button>
      </div>

      <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-black to-transparent z-5"></div>
    </div>
  );
}

export default LandingPage;