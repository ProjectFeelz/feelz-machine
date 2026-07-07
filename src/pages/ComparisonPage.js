import React from 'react';
import { useParams, Link, Navigate } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { ArrowLeft, Check } from 'lucide-react';
import platformComparisons from '../data/platformComparisons';

export default function ComparisonPage() {
  const { platform } = useParams();
  const data = platformComparisons[platform];

  if (!data) return <Navigate to="/about" replace />;

  const pageUrl = `https://www.feelzmachine.com/vs/${data.slug}`;
  const ogImage = 'https://www.feelzmachine.com/og-image.png';

  return (
    <div style={{ minHeight: '100vh', background: '#0a0a0a', color: '#f2f2f2', paddingBottom: 80 }}>

      <Helmet>
        <title>{data.metaTitle}</title>
        <link rel="icon" href="/favicon.ico" />
        <link rel="apple-touch-icon" href="/logo192.png" />
        <meta name="description" content={data.metaDescription} />
        <link rel="canonical" href={pageUrl} />
        <meta property="og:title" content={data.metaTitle} />
        <meta property="og:description" content={data.metaDescription} />
        <meta property="og:url" content={pageUrl} />
        <meta property="og:image" content={ogImage} />
        <meta property="og:type" content="article" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={data.metaTitle} />
        <meta name="twitter:description" content={data.metaDescription} />
        <meta name="twitter:image" content={ogImage} />
      </Helmet>

      {/* Header */}
      <div style={{ padding: '48px 24px 32px', maxWidth: 720, margin: '0 auto' }}>
        <Link to="/about" style={{
          display: 'inline-flex', alignItems: 'center', gap: 6, color: 'rgba(255,255,255,0.4)',
          fontSize: 13, textDecoration: 'none', marginBottom: 24,
        }}>
          <ArrowLeft size={14} /> Back
        </Link>

        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 8,
          background: 'rgba(140,171,46,0.1)', border: '1px solid rgba(140,171,46,0.25)',
          borderRadius: 6, padding: '6px 14px', fontSize: 11, fontWeight: 500,
          letterSpacing: '0.08em', textTransform: 'uppercase', color: '#8CAB2E', marginBottom: 24,
        }}>
          <span style={{ width: 6, height: 6, background: '#8CAB2E', borderRadius: '50%', display: 'inline-block' }} />
          Feelz Machine vs {data.name}
        </div>

        <h1 style={{ fontSize: 'clamp(28px, 5vw, 44px)', fontWeight: 800, letterSpacing: '-0.03em', lineHeight: 1.15, marginBottom: 20 }}>
          {data.heroStat}
          <span style={{ display: 'block', fontSize: 'clamp(16px, 2.5vw, 20px)', fontWeight: 500, color: 'rgba(255,255,255,0.45)', marginTop: 8, lineHeight: 1.5 }}>
            {data.heroStatLabel}
          </span>
        </h1>

        <p style={{ fontSize: 15, color: 'rgba(255,255,255,0.5)', lineHeight: 1.75, maxWidth: 560 }}>
          {data.intro}
        </p>
      </div>

      <div style={{ maxWidth: 720, margin: '0 auto 48px', height: 1, background: 'rgba(255,255,255,0.06)' }} />

      {/* Facts grid */}
      <div style={{ padding: '0 24px', maxWidth: 720, margin: '0 auto 56px' }}>
        <p style={{ fontSize: 11, fontWeight: 500, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#8CAB2E', marginBottom: 20 }}>
          The actual numbers
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 1, background: 'rgba(255,255,255,0.06)', borderRadius: 16, overflow: 'hidden' }}>
          {data.facts.map((f, i) => (
            <div key={i} style={{ background: '#0a0a0a', padding: 24 }}>
              <div style={{ fontSize: 24, fontWeight: 800, color: '#8CAB2E', marginBottom: 8, letterSpacing: '-0.02em' }}>{f.stat}</div>
              <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', lineHeight: 1.6, margin: 0 }}>{f.detail}</p>
            </div>
          ))}
        </div>
      </div>

      {/* How it works */}
      <div style={{ padding: '0 24px', maxWidth: 720, margin: '0 auto 56px' }}>
        <p style={{ fontSize: 11, fontWeight: 500, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.25)', marginBottom: 14 }}>
          How {data.name} actually pays
        </p>
        <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.5)', lineHeight: 1.8 }}>
          {data.howItWorks}
        </p>
      </div>

      {/* What FM does differently */}
      <div style={{ padding: '0 24px', maxWidth: 720, margin: '0 auto 56px' }}>
        <h2 style={{ fontSize: 'clamp(20px, 3vw, 28px)', fontWeight: 800, letterSpacing: '-0.03em', marginBottom: 28 }}>
          What Feelz Machine does differently
        </h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {data.whatFMDoesDifferently.map((item, i) => (
            <div key={i} style={{
              display: 'flex', gap: 14, padding: '18px 20px',
              background: 'rgba(140,171,46,0.04)', border: '1px solid rgba(140,171,46,0.12)',
              borderRadius: 12,
            }}>
              <Check size={18} color="#8CAB2E" style={{ flexShrink: 0, marginTop: 2 }} />
              <div>
                <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 4 }}>{item.title}</div>
                <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.45)', lineHeight: 1.65, margin: 0 }}>{item.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Honest note */}
      <div style={{ padding: '0 24px', maxWidth: 720, margin: '0 auto 56px' }}>
        <div style={{
          padding: 24, borderRadius: 12, background: 'rgba(255,255,255,0.02)',
          border: '1px solid rgba(255,255,255,0.06)',
        }}>
          <p style={{ fontSize: 11, fontWeight: 500, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.25)', marginBottom: 10 }}>
            To be fair to {data.name}
          </p>
          <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.45)', lineHeight: 1.75, margin: 0 }}>
            {data.honestNote}
          </p>
        </div>
      </div>

      {/* CTA */}
      <div style={{ padding: '0 24px', maxWidth: 720, margin: '0 auto', textAlign: 'center' }}>
        <Link to="/setup" style={{
          display: 'inline-block', background: '#8CAB2E', color: '#000', padding: '14px 32px',
          borderRadius: 8, fontSize: 14, fontWeight: 700, textDecoration: 'none', letterSpacing: '-0.01em',
        }}>
          Set up your artist profile
        </Link>
        <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.25)', marginTop: 14 }}>
          Free to join. No card required.
        </p>
      </div>

    </div>
  );
}