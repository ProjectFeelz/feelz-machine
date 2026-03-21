import React from 'react';
import { useNavigate } from 'react-router-dom';

const features = [
  { emoji: '🎵', title: 'Upload & Stream', desc: 'Upload tracks, create albums, and let fans stream instantly from anywhere.' },
  { emoji: '💰', title: 'Sell Downloads', desc: 'Set your own prices. Fans pay via PayPal and get instant high-quality downloads.' },
  { emoji: '🤝', title: 'Collaborations', desc: 'Invite collabs, set royalty splits, and manage credits — all built in.' },
  { emoji: '📊', title: 'Real Analytics', desc: 'Streams, downloads, followers, engagement. Know how your music performs.' },
  { emoji: '🎨', title: 'Custom Profile', desc: 'Build a branded artist page with your own colors, fonts, and themes.' },
  { emoji: '📣', title: 'Community Feed', desc: 'Post updates, embed YouTube videos, connect directly with your fanbase.' },
  ];

const tiers = [
  {
        name: 'Free',
        price: '$0',
        period: '/ forever',
        desc: 'Get started, no card needed',
        featured: false,
        items: ['3 track uploads', 'Basic artist profile', 'Stream and discover', 'Follow artists'],
  },
  {
        name: 'Pro',
        price: '$20',
        period: '/ year',
        desc: 'For serious independent artists',
        featured: true,
        items: ['Unlimited uploads', 'Custom profile themes', 'Analytics dashboard', 'Collaborations + splits', 'Lyrics support', 'Chat rooms'],
  },
  {
        name: 'Premium',
        price: '$50',
        period: '/ year',
        desc: 'Full platform access',
        featured: false,
        items: ['Everything in Pro', 'Sell track downloads', 'Priority placement', 'Community feed posting', 'Advanced analytics', 'Trending boost'],
  },
  ];

export default function AboutPage() {
    const navigate = useNavigate();

  return (
        <div style={{ minHeight: '100vh', background: '#0a0a0a', color: '#f2f2f2', paddingBottom: 80 }}>

{/* Header */}
      <div style={{ padding: '48px 24px 32px', maxWidth: 720, margin: '0 auto', textAlign: 'center' }}>
        <div style={{
                  display: 'inline-flex', alignItems: 'center', gap: 8,
                  background: 'rgba(140,171,46,0.1)', border: '1px solid rgba(140,171,46,0.25)',
                  borderRadius: 6, padding: '6px 14px', fontSize: 11, fontWeight: 500,
                  letterSpacing: '0.08em', textTransform: 'uppercase', color: '#8CAB2E', marginBottom: 24,
      }}>
          <span style={{ width: 6, height: 6, background: '#8CAB2E', borderRadius: '50%', display: 'inline-block' }} />
          About Feelz Machine
            </div>
        <h1 style={{ fontSize: 'clamp(28px, 5vw, 48px)', fontWeight: 800, letterSpacing: '-0.03em', lineHeight: 1.1, marginBottom: 16 }}>
          Your music.<br />
                      <span style={{ color: '#8CAB2E' }}>Your rules.</span><br />
                      <span style={{ color: 'rgba(255,255,255,0.25)' }}>No middlemen.</span>
            </h1>
        <p style={{ fontSize: 15, color: 'rgba(255,255,255,0.4)', lineHeight: 1.75, maxWidth: 480, margin: '0 auto 32px' }}>
          Feelz Machine is built for independent artists who want full control of their music —
          upload, stream, sell, and connect with fans directly.
            </p>
        <button
          onClick={() => navigate('/upgrade')}
          style={{
                        background: '#8CAB2E', color: '#000', padding: '12px 28px',
                        borderRadius: 8, fontSize: 14, fontWeight: 600, border: 'none',
                        cursor: 'pointer', letterSpacing: '-0.01em',
          }}
        >
          View Plans
            </button>
            </div>

{/* Divider */}
      <div style={{ maxWidth: 800, margin: '0 auto 48px', height: 1, background: 'rgba(255,255,255,0.06)' }} />

{/* Features */}
      <div style={{ padding: '0 24px', maxWidth: 1000, margin: '0 auto 64px' }}>
        <p style={{ fontSize: 11, fontWeight: 500, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#8CAB2E', marginBottom: 10 }}>
          What's inside
            </p>
        <h2 style={{ fontSize: 'clamp(22px, 3vw, 34px)', fontWeight: 800, letterSpacing: '-0.03em', marginBottom: 40 }}>
          Everything you need.<br />
                      <span style={{ color: 'rgba(255,255,255,0.3)' }}>Nothing you don't.</span>
            </h2>
        <div style={{
                      display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
                      gap: 1, background: 'rgba(255,255,255,0.06)', borderRadius: 16, overflow: 'hidden',
          }}>
{features.map(({ emoji, title, desc }) => (
              <div key={title} style={{ background: '#0a0a0a', padding: 28, transition: 'background 0.2s' }}>
              <span style={{ fontSize: 24, marginBottom: 12, display: 'block' }}>{emoji}</span>
                            <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 6 }}>{title}</div>
                            <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.35)', lineHeight: 1.65 }}>{desc}</p>
              </div>
                        ))}
</div>
  </div>

{/* For Artists / For Listeners */}
      <div style={{ padding: '0 24px', maxWidth: 1000, margin: '0 auto 64px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
{[
  {
                  emoji: '🎤', title: 'For Artists', accent: true,
                  desc: 'Built for independent producers, beatmakers, and musicians who want to own their distribution.',
                  items: ['Unlimited uploads (Pro+)', 'Sell music directly to fans', 'Custom branded profile', 'Royalty splits with collaborators', 'Stream and engagement analytics', 'Community feed posting'],
  },
  {
                  emoji: '🎧', title: 'For Listeners', accent: false,
                  desc: 'Discover independent music, support artists directly, and build your personal library.',
                  items: ['Stream all published music', 'Follow your favourite artists', 'Build playlists and liked songs', 'Download tracks you purchase', 'Read community posts', 'Free to sign up'],
  },
            ].map(({ emoji, title, desc, accent, items }) => (
                          <div key={title} style={{
                                padding: 32, borderRadius: 16,
                                          border: `1px solid ${accent ? 'rgba(140,171,46,0.2)' : 'rgba(255,255,255,0.06)'}`,
                                          background: accent ? 'linear-gradient(140deg, rgba(140,171,46,0.06) 0%, #0a0a0a 60%)' : 'rgba(255,255,255,0.02)',
                          }}>
              <span style={{ fontSize: 36, marginBottom: 14, display: 'block' }}>{emoji}</span>
                                <div style={{ fontWeight: 800, fontSize: 22, letterSpacing: '-0.03em', marginBottom: 8 }}>{title}</div>
                                <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.35)', lineHeight: 1.65, marginBottom: 18 }}>{desc}</p>
                                <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {items.map(item => (
                                      <li key={item} style={{ fontSize: 13, color: 'rgba(255,255,255,0.45)', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ color: '#8CAB2E', fontSize: 11, flexShrink: 0 }}>—</span>{item}
                             </li>
                                             ))}
</ul>
  </div>
          ))}
            </div>
            </div>

{/* Pricing */}
      <div style={{ padding: '0 24px', maxWidth: 860, margin: '0 auto 64px', textAlign: 'center' }}>
        <p style={{ fontSize: 11, fontWeight: 500, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#8CAB2E', marginBottom: 10 }}>
          Plans
            </p>
        <h2 style={{ fontSize: 'clamp(22px, 3vw, 36px)', fontWeight: 800, letterSpacing: '-0.03em', marginBottom: 40 }}>
          Simple, honest pricing.
            </h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12, textAlign: 'left' }}>
{tiers.map(({ name, price, period, desc, featured, items }) => (
              <div key={name} style={{
                         background: featured ? 'linear-gradient(160deg, rgba(140,171,46,0.08), #0a0a0a 60%)' : 'rgba(255,255,255,0.03)',
                              border: `1px solid ${featured ? 'rgba(140,171,46,0.3)' : 'rgba(255,255,255,0.06)'}`,
                              borderRadius: 14, padding: 24, position: 'relative',
              }}>
           {featured && (
                             <div style={{
                             position: 'absolute', top: -11, left: '50%', transform: 'translateX(-50%)',
                                                 background: '#8CAB2E', color: '#000', fontSize: 10, fontWeight: 600,
                                                 letterSpacing: '0.06em', padding: '3px 12px', borderRadius: 100,
                                                 textTransform: 'uppercase', whiteSpace: 'nowrap',
                             }}>Popular</div>
                         )}
              <div style={{ fontWeight: 700, fontSize: 17, marginBottom: 4 }}>{name}</div>
              <div style={{ fontSize: 28, fontWeight: 800, letterSpacing: '-0.04em', marginBottom: 4 }}>
{price} <span style={{ fontSize: 13, fontWeight: 300, color: 'rgba(255,255,255,0.35)' }}>{period}</span>
  </div>
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.25)', marginBottom: 16 }}>{desc}</div>
              <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
{items.map(item => (
                    <li key={item} style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', display: 'flex', gap: 8 }}>
                    <span style={{ color: '#8CAB2E', fontSize: 12, flexShrink: 0 }}>✓</span>{item}
           </li>
                           ))}
</ul>
              <button
                onClick={() => navigate('/upgrade')}
                style={{
                                    marginTop: 20, width: '100%', padding: '10px 0',
                                    background: featured ? '#8CAB2E' : 'rgba(255,255,255,0.05)',
                                    color: featured ? '#000' : 'rgba(255,255,255,0.6)',
                                    border: featured ? 'none' : '1px solid rgba(255,255,255,0.08)',
                                    borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer',
                }}
              >
{name === 'Free' ? 'Get Started' : 'Upgrade'}
</button>
  </div>
          ))}
</div>
            </div>

{/* Legal links */}
      <div style={{ textAlign: 'center', paddingBottom: 16 }}>
        <div style={{ display: 'flex', gap: 24, justifyContent: 'center', flexWrap: 'wrap' }}>
{[
  { label: 'Privacy Policy', path: '/privacy-policy' },
  { label: 'Terms of Use', path: '/terms-of-use' },
            ].map(({ label, path }) => (
                          <button
                                key={label}
               onClick={() => navigate(path)}
               style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.25)', fontSize: 13, cursor: 'pointer' }}
            >
{label}
</button>
          ))}
            </div>
        <p style={{ marginTop: 12, fontSize: 12, color: 'rgba(255,255,255,0.15)' }}>© 2026 Project Feelz</p>
            </div>

            </div>
  );
}
