// src/pages/GuidePage.js
//
// Renders one answer page from src/data/guides.js at /guides/:slug.
//
// The content lives in the data file and the reasoning for these pages
// existing at all lives in its header. This file only draws it.
//
// Deliberately plain. These pages are read by somebody who typed a question
// into Google and wants the answer, and every decorative thing between them
// and it is a reason to go back and click the next result.

import React from 'react';
import { Helmet } from 'react-helmet-async';
import { Link, useParams, Navigate } from 'react-router-dom';
import { ArrowLeft, Check, Info } from 'lucide-react';
import guides from '../data/guides';

export default function GuidePage() {
  const { slug } = useParams();
  const guide = guides[slug];

  // A slug with no guide behind it goes to the list rather than rendering an
  // empty page. A soft 404 that returns 200 with nothing on it is its own
  // Search Console error.
  if (!guide) return <Navigate to="/guides" replace />;

  const pageUrl = `https://www.feelzmachine.com/guides/${guide.slug}`;

  return (
    <div className="min-h-screen px-4 sm:px-6 py-8">
      <Helmet>
        <title>{guide.metaTitle}</title>
        <meta name="description" content={guide.metaDescription} />
        <link rel="canonical" href={pageUrl} />
        <meta property="og:title" content={guide.metaTitle} />
        <meta property="og:description" content={guide.metaDescription} />
        <meta property="og:url" content={pageUrl} />
        <meta property="og:type" content="article" />
        <meta name="twitter:card" content="summary_large_image" />
        <script type="application/ld+json">
          {JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'Article',
            headline: guide.title,
            description: guide.metaDescription,
            mainEntityOfPage: pageUrl,
            publisher: { '@type': 'Organization', name: 'Feelz Machine' },
          })}
        </script>
      </Helmet>

      <article className="max-w-2xl mx-auto">
        <Link to="/guides" className="inline-flex items-center gap-1.5 text-xs text-white/40 hover:text-white/70 transition mb-6">
          <ArrowLeft className="w-3.5 h-3.5" />
          Guides
        </Link>

        <h1 className="text-3xl font-bold text-white leading-tight mb-4">{guide.title}</h1>
        <p className="text-base text-white/60 leading-relaxed mb-10">{guide.intro}</p>

        <div className="space-y-8">
          {guide.sections.map(section => (
            <section key={section.heading}>
              <h2 className="text-lg font-semibold text-white mb-2">{section.heading}</h2>
              <p className="text-sm text-white/55 leading-relaxed">{section.body}</p>
            </section>
          ))}
        </div>

        {guide.steps?.length > 0 && (
          <section className="mt-12 rounded-2xl border border-white/[0.08] bg-white/[0.02] p-5">
            <h2 className="text-sm font-semibold tracking-wide uppercase text-white/40 mb-4">What to do</h2>
            <ul className="space-y-3">
              {guide.steps.map(step => (
                <li key={step} className="flex items-start gap-2.5">
                  <Check className="w-4 h-4 text-purple-300/70 flex-shrink-0 mt-0.5" />
                  <span className="text-sm text-white/70 leading-relaxed">{step}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {guide.honestNote && (
          <section className="mt-6 rounded-2xl border border-sky-400/20 bg-sky-500/[0.06] p-5">
            <div className="flex items-start gap-2.5">
              <Info className="w-4 h-4 text-sky-300 flex-shrink-0 mt-0.5" />
              <div>
                <h2 className="text-sm font-semibold text-sky-100 mb-1.5">Where this is not the answer</h2>
                <p className="text-sm text-sky-100/75 leading-relaxed">{guide.honestNote}</p>
              </div>
            </div>
          </section>
        )}

        {guide.related?.length > 0 && (
          <section className="mt-10">
            <h2 className="text-xs font-semibold tracking-[0.12em] uppercase text-white/35 mb-3">Read next</h2>
            <ul className="space-y-1.5">
              {guide.related.map(r => (
                <li key={r.href}>
                  <Link to={r.href} className="text-sm text-purple-300 hover:text-purple-200 transition">
                    {r.label}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}
      </article>
    </div>
  );
}
