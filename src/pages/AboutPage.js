import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { Lock, Globe, ChevronRight } from 'lucide-react';

const features = [
  { emoji: '🎵', title: 'Upload & Stream',   desc: 'Upload tracks, create albums, and let fans stream instantly from anywhere.' },
  { emoji: '💰', title: 'Sell Downloads',    desc: 'Set your own prices. Fans pay via PayPal and get instant high-quality downloads.' },
  { emoji: '🤝', title: 'Collaborations',    desc: 'Invite collabs, set royalty splits, and manage credits — all built in.' },
  { emoji: '📊', title: 'Real Analytics',    desc: 'Streams, downloads, followers, engagement. Know how your music performs.' },
  { emoji: '🎨', title: 'Custom Profile',    desc: 'Build a branded artist page with your own colors, fonts, and themes.' },
  { emoji: '📣', title: 'Community Feed',    desc: 'Post updates, embed YouTube videos, connect directly with your fanbase.' },
];

const tiers = [
  {
    name: 'Free', price: '$0', period: '/ forever',
    desc: 'Get started, no card needed', featured: false,
    items: ['3 track uploads', 'Basic artist profile', 'Stream and discover', 'Follow artists'],
  },
  {
    name: 'Pro', price: '$20', period: '/ year',
    desc: 'For serious independent artists', featured: true,
    items: ['Unlimited uploads', 'Custom profile themes', 'Analytics dashboard', 'Collaborations + splits', 'Lyrics support', 'Chat rooms'],
  },
  {
    name: 'Premium', price: '$50', period: '/ year',
    desc: 'Full platform access', featured: false,
    items: ['Everything in Pro', 'Sell track downloads', 'Priority placement', 'Community feed posting', 'Advanced analytics', 'Trending boost'],
  },
];

function LegalCard({ icon: Icon, label, description, path }) {
  const navigate = useNavigate();
  return (
    <button
      onClick={() => navigate(path)}
      style={{
        width: '100%', display: 'flex', alignItems: 'center', gap: 16,
        padding: 16, background: 'rgba(255,255,255,0.03)',
        border: '1px solid rgba(255,255,255,0.07)',
        borderRadius: 12, cursor: 'pointer', textAlign: 'left',
        transition: 'background 0.15s',
      }}
      onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.06)'}
      onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.03)'}
    >
      <div style={{
        width: 44, height: 44, borderRadius: 10, flexShrink: 0,
        background: 'rgba(255,255,255,0.06)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <Icon size={20} color="rgba(255,255,255,0.7)" />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontSize: 14, fontWeight: 500, color: '#fff', margin: 0 }}>{label}</p>
        <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', margin: '2px 0 0' }}>{description}</p>
      </div>
      <ChevronRight size={16} color="rgba(255,255,255,0.2)" style={{ flexShrink: 0 }} />
    </button>
  );
}

export default function AboutPage() {
  const navigate = useNavigate();
  const [playStoreUrl, setPlayStoreUrl] = useState('');
  const [appStoreUrl, setAppStoreUrl]   = useState('');

  useEffect(() => {
    supabase
      .from('platform_settings')
      .select('key, value')
      .in('key', ['play_store_url', 'app_store_url'])
      .then(({ data }) => {
        (data || []).forEach(row => {
          if (row.key === 'play_store_url') setPlayStoreUrl(row.value || '');
          if (row.key === 'app_store_url')  setAppStoreUrl(row.value  || '');
        });
      });
  }, []);

  const hasAppButtons = playStoreUrl || appStoreUrl;

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
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
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

        {hasAppButtons && (
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap', marginTop: 16 }}>
            {playStoreUrl && (
              <a href={playStoreUrl} target="_blank" rel="noopener noreferrer"
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 10,
                  background: '#000', border: '1px solid rgba(255,255,255,0.15)',
                  borderRadius: 10, padding: '10px 20px', textDecoration: 'none', color: '#fff',
                }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="#fff">
                  <path d="M3.18 23.76a2.5 2.5 0 0 0 2.35-.28l11.05-6.37-3.08-3.08zM1.5 1.3C1.19 1.64 1 2.16 1 2.83v18.34c0 .67.19 1.19.5 1.53l.08.08 10.27-10.27v-.24L1.58 1.22zM20.37 9.96l-2.68-1.55-3.42 3.42 3.42 3.42 2.7-1.56c.77-.44.77-1.16 0-1.6zM5.53.52L16.58 6.9l-3.08 3.08L5.53.52z"/>
                </svg>
                <div style={{ textAlign: 'left' }}>
                  <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.5)', letterSpacing: '0.05em' }}>GET IT ON</div>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>Google Play</div>
                </div>
              </a>
            )}
            {appStoreUrl && (
              <a href={appStoreUrl} target="_blank" rel="noopener noreferrer"
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 10,
                  background: '#000', border: '1px solid rgba(255,255,255,0.15)',
                  borderRadius: 10, padding: '10px 20px', textDecoration: 'none', color: '#fff',
                }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="#fff">
                  <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/>
                </svg>
                <div style={{ textAlign: 'left' }}>
                  <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.5)', letterSpacing: '0.05em' }}>DOWNLOAD ON THE</div>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>App Store</div>
                </div>
              </a>
            )}
          </div>
        )}
      </div>

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
            <div key={title} style={{ background: '#0a0a0a', padding: 28 }}>
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
                    <span style={{ color: '#8CAB2E', fontSize: 11, flexShrink: 0 }}>-</span>{item}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>

      {/* Legal — promoted to proper nav cards */}
      <div style={{ padding: '0 24px', maxWidth: 600, margin: '0 auto 48px' }}>
        <p style={{ fontSize: 11, fontWeight: 500, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.25)', marginBottom: 16 }}>
          Legal
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <LegalCard
            icon={Lock}
            label="Privacy Policy"
            description="How we handle your data"
            path="/privacy-policy"
          />
          <LegalCard
            icon={Globe}
            label="Terms of Use"
            description="Platform rules and guidelines"
            path="/terms-of-use"
          />
        </div>
      </div>

      {/* Footer */}
      <div style={{ textAlign: 'center', paddingBottom: 16 }}>
        <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.15)' }}>© 2026 Project Feelz</p>
      </div>

    </div>
  );
}