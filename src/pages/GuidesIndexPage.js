// src/pages/GuidesIndexPage.js
//
// The list of answer pages, at /guides.
//
// It exists for two reasons. A guide that 404s on a bad slug needs somewhere
// to send people, and a set of pages with no index is a set of orphans: the
// same problem that left 233 URLs on this site discovered and never crawled.

import React from 'react';
import { Helmet } from 'react-helmet-async';
import { Link } from 'react-router-dom';
import { BookOpen } from 'lucide-react';
import guides from '../data/guides';
import platformComparisons from '../data/platformComparisons';

const DESCRIPTION =
  'Straight answers on getting paid for music as an independent artist in South Africa: '
  + 'what distribution costs, how to sell direct, and what each route actually pays.';

export default function GuidesIndexPage() {
  const list = Object.values(guides);
  const comparisons = Object.values(platformComparisons);

  return (
    <div className="min-h-screen px-4 sm:px-6 py-8">
      <Helmet>
        <title>Guides for independent artists | Feelz Machine</title>
        <meta name="description" content={DESCRIPTION} />
        <link rel="canonical" href="https://www.feelzmachine.com/guides" />
      </Helmet>

      <div className="max-w-2xl mx-auto">
        <div className="flex items-center gap-2.5 mb-1">
          <BookOpen className="w-5 h-5 text-purple-300/70" />
          <h1 className="text-2xl font-bold text-white">Guides</h1>
        </div>
        <p className="text-sm text-white/40 mb-10">{DESCRIPTION}</p>

        <ul className="space-y-5">
          {list.map(g => (
            <li key={g.slug}>
              <Link to={`/guides/${g.slug}`} className="group block">
                <p className="text-base font-semibold text-white group-hover:text-purple-300 transition leading-snug">
                  {g.title}
                </p>
                <p className="text-sm text-white/45 mt-1 leading-relaxed">{g.metaDescription}</p>
              </Link>
            </li>
          ))}
        </ul>

        {comparisons.length > 0 && (
          <section className="mt-12">
            <h2 className="text-xs font-semibold tracking-[0.12em] uppercase text-white/35 mb-4">
              How Feelz Machine compares
            </h2>
            <ul className="space-y-1.5">
              {comparisons.map(c => (
                <li key={c.slug}>
                  <Link to={`/vs/${c.slug}`} className="text-sm text-purple-300 hover:text-purple-200 transition">
                    Feelz Machine vs {c.name}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </div>
  );
}
