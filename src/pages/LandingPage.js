import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';

function LogoIcon({ size = 32 }) {
  return (
    <div style={{
      width: size, height: size,
      backgroundColor: '#8CAB2E',
      borderRadius: size * 0.25,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      flexShrink: 0,
    }}>
      <svg width={size * 0.5} height={size * 0.5} viewBox="0 0 24 24" fill="none"
        stroke="#000" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M9 18V5l12-2v13"/>
        <circle cx="6" cy="18" r="3"/>
        <circle cx="18" cy="16" r="3"/>
      </svg>
    </div>
  );
}

export default function LandingPage() {
  const [apkUrl, setApkUrl] = useState(null);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    // Fetch APK URL from platform_settings
    supabase
      .from('platform_settings')
      .select('value')
      .eq('key', 'apk_url')
      .maybeSingle()
      .then(({ data }) => { if (data?.value) setApkUrl(data.value); });

    // Scroll listener for nav
    const onScroll = () => setScrolled(window.scrollY > 40);
    window.addEventListener('scroll', onScroll);
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Generate waveform bars
  const bars = Array.from({ length: 80 }, (_, i) => ({
    h: 15 + Math.random() * 70,
    d: (0.5 + Math.random() * 1.5).toFixed(2),
    delay: (Math.random() * 1).toFixed(2),
  }));

  const s = {
    // nav
    nav: {
      position: 'fixed', top: 0, left: 0, right: 0, zIndex: 100,
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '18px 32px',
      borderBottom: scrolled ? '1px solid rgba(255,255,255,0.06)' : '1px solid transparent',
      background: scrolled ? 'rgba(0,0,0,0.93)' : 'transparent',
      backdropFilter: scrolled ? 'blur(24px)' : 'none',
      transition: 'all 0.3s',
    },
    logoRow: { display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none' },
    logoName: { fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: 15, color: '#f2f2f2', letterSpacing: '-0.02em' },
    navBtn: {
      display: 'inline-flex', alignItems: 'center', gap: 8,
      background: '#8CAB2E', color: '#000',
      padding: '9px 20px', borderRadius: 8,
      fontSize: 13, fontWeight: 500, textDecoration: 'none',
      transition: 'opacity 0.2s',
    },
    // hero
    hero: {
      minHeight: '85vh', display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      textAlign: 'center', padding: '90px 24px 60px',
      position: 'relative', overflow: 'hidden',
    },
    glow: {
      position: 'absolute', borderRadius: '50%', pointerEvents: 'none',
      background: 'radial-gradient(circle, rgba(140,171,46,0.12) 0%, transparent 70%)',
      width: 700, height: 700, top: '50%', left: '50%',
      transform: 'translate(-50%, -55%)', filter: 'blur(60px)',
    },
    grid: {
      position: 'absolute', inset: 0,
      backgroundImage: 'linear-gradient(rgba(255,255,255,0.025) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.025) 1px, transparent 1px)',
      backgroundSize: '60px 60px',
      WebkitMaskImage: 'radial-gradient(ellipse 80% 60% at 50% 50%, black 0%, transparent 100%)',
      maskImage: 'radial-gradient(ellipse 80% 60% at 50% 50%, black 0%, transparent 100%)',
      pointerEvents: 'none',
    },
    eyebrow: {
      display: 'inline-flex', alignItems: 'center', gap: 8,
      background: 'rgba(140,171,46,0.1)', border: '1px solid rgba(140,171,46,0.25)',
      borderRadius: 6, padding: '6px 14px',
      fontSize: 11, fontWeight: 500, letterSpacing: '0.08em', textTransform: 'uppercase',
      color: '#8CAB2E', marginBottom: 32, position: 'relative',
    },
    dot: {
      width: 6, height: 6, background: '#8CAB2E', borderRadius: '50%',
      animation: 'blink 1.5s ease-in-out infinite',
    },
    h1: {
      fontFamily: "'Syne', sans-serif", fontWeight: 800,
      fontSize: 'clamp(36px, 6vw, 72px)',
      lineHeight: 0.93, letterSpacing: '-0.04em',
      marginBottom: 28, position: 'relative',
    },
    sub: {
      fontSize: 'clamp(14px, 1.8vw, 17px)',
      color: 'rgba(255,255,255,0.35)',
      maxWidth: 420, lineHeight: 1.7, marginBottom: 48,
      position: 'relative',
    },
    btnDl: {
      display: 'inline-flex', alignItems: 'center', gap: 12,
      background: '#8CAB2E', color: '#000',
      padding: '18px 40px', borderRadius: 10,
      fontSize: 16, fontWeight: 500, textDecoration: 'none',
      boxShadow: '0 0 60px rgba(140,171,46,0.2)',
      transition: 'opacity 0.2s, transform 0.15s',
      position: 'relative',
    },
    heroMeta: { marginTop: 16, fontSize: 12, color: 'rgba(255,255,255,0.2)', position: 'relative' },
    wave: {
      position: 'absolute', bottom: 0, left: 0, right: 0,
      height: 80, display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
      gap: 3, padding: '0 24px', pointerEvents: 'none',
    },
  };

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Syne:wght@700;800&family=DM+Sans:wght@300;400;500&display=swap');
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: #000; color: #f2f2f2; font-family: 'DM Sans', sans-serif; font-weight: 300; overflow-x: hidden; -webkit-font-smoothing: antialiased; }
        @keyframes blink { 0%,100%{opacity:1}50%{opacity:0.3} }
        @keyframes wv { from{transform:scaleY(0.15)} to{transform:scaleY(1)} }
        @keyframes fu { from{opacity:0;transform:translateY(18px)} to{opacity:1;transform:translateY(0)} }
        .anim0{animation:fu 0.7s ease both}
        .anim1{animation:fu 0.7s 0.08s ease both}
        .anim2{animation:fu 0.7s 0.16s ease both}
        .anim3{animation:fu 0.7s 0.24s ease both}
        .anim4{animation:fu 0.7s 0.32s ease both}
        .btn-dl:hover{opacity:0.85;transform:translateY(-2px)!important}
        .fcard:hover{background:rgba(255,255,255,0.025)!important}
        .flinks a:hover{color:#f2f2f2!important}
        .nav-btn:hover{opacity:0.85}
      `}</style>

      {/* NAV */}
      <nav style={s.nav}>
        <a href="/" style={s.logoRow}>
          <LogoIcon size={32} />
          <span style={s.logoName}>Feelz Machine</span>
        </a>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <a href="https://www.feelzmachine.com/player" className="nav-btn" style={{
            ...s.navBtn,
            background: 'transparent',
            border: '1px solid rgba(140,171,46,0.4)',
            color: '#8CAB2E',
          }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"/><polygon points="10 8 16 12 10 16 10 8" fill="currentColor" stroke="none"/>
            </svg>
            Listen on Web
          </a>
          <a href={apkUrl || '#download'} className="nav-btn" style={s.navBtn}
            onClick={!apkUrl ? (e) => { e.preventDefault(); document.getElementById('download').scrollIntoView({ behavior: 'smooth' }); } : undefined}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
            </svg>
            Download APK
          </a>
        </div>
      </nav>

      {/* HERO */}
      <section style={s.hero}>
        <div style={s.glow} />
        <div style={s.grid} />
        <div style={s.eyebrow} className="anim0"><span style={s.dot} />Now Available on Android</div>
        <h1 style={s.h1} className="anim1">
          Your music.<br/>
          <span style={{ color: '#8CAB2E' }}>Your rules.</span><br/>
          <span style={{ color: 'rgba(255,255,255,0.18)' }}>No middlemen.</span>
        </h1>
        <p style={s.sub} className="anim2">
          Upload, stream, sell and connect with fans directly. Built for independent artists who want full control of their music.
        </p>
        <div className="anim3">
          <a href={apkUrl || '#download'} className="btn-dl" style={s.btnDl}
            onClick={!apkUrl ? (e) => { e.preventDefault(); document.getElementById('download').scrollIntoView({ behavior: 'smooth' }); } : undefined}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
            </svg>
            Download APK
          </a>
          <p style={s.heroMeta} className="anim4">Android 8.0+ · Free to install · No Play Store needed</p>
        </div>
        <div style={s.wave}>
          {bars.map((b, i) => (
            <span key={i} style={{
              display: 'block', width: 3, height: b.h,
              borderRadius: '2px 2px 0 0', background: '#8CAB2E', opacity: 0.15,
              animation: `wv ${b.d}s ease-in-out infinite alternate`,
              animationDelay: `${b.delay}s`, transformOrigin: 'bottom',
            }} />
          ))}
        </div>
      </section>

      {/* FEATURES */}
      <div style={{ padding: '70px 24px', maxWidth: 1100, margin: '0 auto' }} id="features">
        <p style={{ fontSize: 11, fontWeight: 500, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#8CAB2E', marginBottom: 14 }}>What's inside</p>
        <h2 style={{ fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: 'clamp(32px,4vw,52px)', letterSpacing: '-0.03em', lineHeight: 1.08, marginBottom: 56 }}>
          Everything you need.<br/><span style={{ color: 'rgba(255,255,255,0.3)' }}>Nothing you don't.</span>
        </h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(290px, 1fr))', gap: 1, background: 'rgba(255,255,255,0.06)', borderRadius: 16, overflow: 'hidden' }}>
          {[
            ['🎵', 'Upload & Stream', 'Upload tracks, create albums, and let fans stream instantly from anywhere.'],
            ['💰', 'Sell Downloads', 'Set your own prices. Fans pay via PayPal and get instant high-quality downloads.'],
            ['🤝', 'Collaborations', 'Invite collabs, set royalty splits, and manage credits — all built in.'],
            ['📊', 'Real Analytics', 'Streams, downloads, followers, engagement. Know how your music performs.'],
            ['🎨', 'Custom Profile', 'Build a branded artist page with your own colors, fonts, and themes.'],
            ['📣', 'Community Feed', 'Post updates, embed YouTube videos, connect directly with your fanbase.'],
          ].map(([icon, title, desc]) => (
            <div key={title} className="fcard" style={{ background: '#000', padding: 36, transition: 'background 0.2s' }}>
              <span style={{ fontSize: 28, marginBottom: 16, display: 'block' }}>{icon}</span>
              <div style={{ fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: 18, marginBottom: 8 }}>{title}</div>
              <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.35)', lineHeight: 1.65 }}>{desc}</p>
            </div>
          ))}
        </div>
      </div>

      {/* FOR WHO */}
      <div style={{ padding: '60px 24px', maxWidth: 1040, margin: '0 auto' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
          {[
            { emoji: '🎤', title: 'For Artists', desc: 'Built for independent producers, beatmakers, and musicians who want to own their distribution.', accent: true,
              items: ['Unlimited uploads (Pro+)', 'Sell music directly to fans', 'Custom branded profile', 'Royalty splits with collaborators', 'Stream and engagement analytics', 'Community feed posting'] },
            { emoji: '🎧', title: 'For Listeners', desc: 'Discover independent music, support artists directly, and build your personal library.',accent: false,
              items: ['Stream all published music', 'Follow your favourite artists', 'Build playlists and liked songs', 'Download tracks you purchase', 'Read community posts', 'Free to sign up'] },
          ].map(({ emoji, title, desc, accent, items }) => (
            <div key={title} style={{
              padding: 36, borderRadius: 16,
              border: `1px solid ${accent ? 'rgba(140,171,46,0.2)' : 'rgba(255,255,255,0.06)'}`,
              background: accent ? 'linear-gradient(140deg, rgba(140,171,46,0.06) 0%, #000 60%)' : 'rgba(255,255,255,0.03)',
            }}>
              <span style={{ fontSize: 44, marginBottom: 18, display: 'block' }}>{emoji}</span>
              <div style={{ fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: 26, letterSpacing: '-0.03em', marginBottom: 10 }}>{title}</div>
              <p style={{ fontSize: 15, color: 'rgba(255,255,255,0.35)', lineHeight: 1.65, marginBottom: 20 }}>{desc}</p>
              <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 7 }}>
                {items.map(item => (
                  <li key={item} style={{ fontSize: 14, color: 'rgba(255,255,255,0.45)', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ color: '#8CAB2E', fontSize: 11, flexShrink: 0 }}>—</span>{item}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>

      {/* TIERS */}
      <div style={{ padding: '90px 24px', maxWidth: 860, margin: '0 auto', textAlign: 'center' }} id="tiers">
        <p style={{ fontSize: 11, fontWeight: 500, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#8CAB2E', marginBottom: 14 }}>Plans</p>
        <h2 style={{ fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: 'clamp(28px,4vw,46px)', letterSpacing: '-0.03em' }}>Simple, honest pricing.</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12, marginTop: 56, textAlign: 'left' }}>
          {[
            { name: 'Free', price: '$0', period: '/ forever', desc: 'Get started, no card needed', featured: false,
              items: ['3 track uploads', 'Basic artist profile', 'Stream and discover', 'Follow artists'] },
            { name: 'Pro', price: '$20', period: '/ year', desc: 'For serious independent artists', featured: true,
              items: ['Unlimited uploads', 'Custom profile themes', 'Analytics dashboard', 'Collaborations + splits', 'Lyrics support', 'Chat rooms'] },
            { name: 'Premium', price: '$50', period: '/ year', desc: 'Full platform access', featured: false,
              items: ['Everything in Pro', 'Sell track downloads', 'Priority placement', 'Community feed posting', 'Advanced analytics', 'Trending boost'] },
          ].map(({ name, price, period, desc, featured, items }) => (
            <div key={name} style={{
              background: featured ? 'linear-gradient(160deg, rgba(140,171,46,0.08), #000 60%)' : 'rgba(255,255,255,0.03)',
              border: `1px solid ${featured ? 'rgba(140,171,46,0.3)' : 'rgba(255,255,255,0.06)'}`,
              borderRadius: 14, padding: 26, position: 'relative',
            }}>
              {featured && <div style={{ position: 'absolute', top: -11, left: '50%', transform: 'translateX(-50%)', background: '#8CAB2E', color: '#000', fontSize: 10, fontWeight: 600, letterSpacing: '0.06em', padding: '3px 12px', borderRadius: 100, textTransform: 'uppercase', whiteSpace: 'nowrap' }}>Popular</div>}
              <div style={{ fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: 18, marginBottom: 4 }}>{name}</div>
              <div style={{ fontFamily: "'Syne', sans-serif", fontSize: 30, fontWeight: 800, letterSpacing: '-0.04em', marginBottom: 4 }}>
                {price} <span style={{ fontSize: 13, fontWeight: 300, color: 'rgba(255,255,255,0.35)' }}>{period}</span>
              </div>
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.25)', marginBottom: 18 }}>{desc}</div>
              <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 7 }}>
                {items.map(item => (
                  <li key={item} style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', display: 'flex', gap: 8 }}>
                    <span style={{ color: '#8CAB2E', fontSize: 12, flexShrink: 0 }}>✓</span>{item}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>

      {/* DOWNLOAD BANNER */}
      <div id="download" style={{
        margin: '0 24px 80px',
        border: '1px solid rgba(140,171,46,0.2)', borderRadius: 20,
        background: 'linear-gradient(135deg, rgba(140,171,46,0.07) 0%, rgba(0,0,0,0) 60%)',
        padding: '64px 40px', textAlign: 'center', position: 'relative', overflow: 'hidden',
      }}>
        <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse 60% 80% at 50% 0%, rgba(140,171,46,0.07), transparent 70%)', pointerEvents: 'none' }} />
        <h2 style={{ fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: 'clamp(32px,5vw,60px)', letterSpacing: '-0.04em', marginBottom: 12, position: 'relative' }}>
          Get the app.
        </h2>
        <p style={{ fontSize: 15, color: 'rgba(255,255,255,0.35)', marginBottom: 36, position: 'relative' }}>
          Install directly on Android in three simple steps.
        </p>

        {apkUrl ? (
          <a href={apkUrl} className="btn-dl" style={{ ...s.btnDl, position: 'relative' }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
            </svg>
            Download APK
          </a>
        ) : (
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 10, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, padding: '16px 28px', fontSize: 14, color: 'rgba(255,255,255,0.3)', position: 'relative' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
            APK coming soon — check back shortly
          </div>
        )}

        {/* Install steps */}
        <div style={{ marginTop: 48, maxWidth: 560, margin: '48px auto 0', textAlign: 'left', position: 'relative' }}>
          <p style={{ fontSize: 12, fontWeight: 500, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.25)', marginBottom: 20, textAlign: 'center' }}>
            How to install
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {[
              { step: '1', title: 'Download the APK', desc: 'Tap the download button above. The file will save to your Downloads folder.' },
              { step: '2', title: 'Allow the install', desc: 'Android will ask if you want to allow your browser or file manager to install apps. Tap "Allow" — this is a one-time step just for this install.' },
              { step: '3', title: 'Open and sign in', desc: 'Once installed, open Feelz Machine, create your account or sign in, and you\'re good to go.' },
            ].map(({ step, title, desc }) => (
              <div key={step} style={{
                display: 'flex', gap: 16, alignItems: 'flex-start',
                background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)',
                borderRadius: 12, padding: '16px 20px',
              }}>
                <div style={{
                  width: 28, height: 28, borderRadius: '50%',
                  background: 'rgba(140,171,46,0.15)', border: '1px solid rgba(140,171,46,0.3)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  flexShrink: 0, fontFamily: "'Syne', sans-serif", fontWeight: 700,
                  fontSize: 13, color: '#8CAB2E',
                }}>
                  {step}
                </div>
                <div>
                  <div style={{ fontWeight: 500, fontSize: 14, color: '#f2f2f2', marginBottom: 4 }}>{title}</div>
                  <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.35)', lineHeight: 1.6 }}>{desc}</div>
                </div>
              </div>
            ))}
          </div>
          <p style={{ textAlign: 'center', fontSize: 12, color: 'rgba(255,255,255,0.2)', marginTop: 20 }}>
            Works on Android 8.0 and above · No Play Store required
          </p>
        </div>
      </div>

      {/* FOOTER */}
      <footer style={{ borderTop: '1px solid rgba(255,255,255,0.06)', padding: '36px 32px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 20 }}>
        <a href="/" style={s.logoRow}>
          <LogoIcon size={30} />
          <span style={s.logoName}>Feelz Machine</span>
        </a>
        <ul className="flinks" style={{ display: 'flex', gap: 24, listStyle: 'none' }}>
          <li><a href="/player/privacy-policy" style={{ fontSize: 13, color: 'rgba(255,255,255,0.25)', textDecoration: 'none', transition: 'color 0.2s' }}>Privacy</a></li>
          <li><a href="/player/terms-of-use" style={{ fontSize: 13, color: 'rgba(255,255,255,0.25)', textDecoration: 'none', transition: 'color 0.2s' }}>Terms</a></li>
          <li><a href="/player/login" style={{ fontSize: 13, color: 'rgba(255,255,255,0.25)', textDecoration: 'none', transition: 'color 0.2s' }}>Sign In</a></li>
        </ul>
        <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.15)' }}>© 2026 Project Feelz</span>
      </footer>
    </>
  );
}
