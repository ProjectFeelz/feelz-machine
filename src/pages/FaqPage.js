// src/pages/FaqPage.js
//
// The questions, at /faq.
//
//
// WHY A PAGE NOBODY READS IS WORTH BUILDING
//
// Almost nobody opens an FAQ page on purpose. That is not what it is for here.
//
// People type questions into Google, in the exact words they would say them:
// "does feelz machine take a cut", "how do artists get paid in rand", "do I
// still need a distributor". A page carrying those questions as headings, with
// a direct answer under each, is a page that matches that query shape better
// than anything else on this site.
//
// It only works because of what shipped alongside it.
// netlify/edge-functions/seo-html.js now puts this content into the document
// before React mounts, so a crawler that never runs JavaScript reads the
// questions and the answers. Without that, this would be the same empty shell
// every other page here served, and it would rank for nothing.
//
//
// ABOUT THE RICH RESULT
//
// This page carries FAQPage structured data, and it is worth being accurate
// about what that buys. In 2023 Google restricted the expandable FAQ rich
// result to government and health sites, so this will almost certainly not get
// those drop-downs in the results page. The schema is still worth having:
// it tells Google unambiguously that these are question and answer pairs,
// which helps it pick the right answer out of the page.
//
// The value here is ranking for the questions, not the decoration around the
// link.
//
//
// WHY EVERY ANSWER IS OPEN
//
// No accordions. A collapsed answer is still in the HTML and Google reads it
// either way, but a person who followed a search result for one question
// should see the answer without a click, and the rest of the page is how they
// find the next thing they were going to ask.

import React from 'react';
import { Helmet } from 'react-helmet-async';
import { Link } from 'react-router-dom';
import { HelpCircle } from 'lucide-react';
import faq from '../data/faq.json';

const DESCRIPTION =
  'Straight answers about selling music on Feelz Machine: what it costs, how artists get paid '
  + 'in rand, whether you still need a distributor, and how the background music licensing works.';

export default function FaqPage() {
  const allQuestions = faq.groups.flatMap(g => g.questions);

  return (
    <div className="min-h-screen px-4 sm:px-6 py-8">
      <Helmet>
        <title>Questions about Feelz Machine, answered | Feelz Machine</title>
        <meta name="description" content={DESCRIPTION} />
        <link rel="canonical" href="https://www.feelzmachine.com/faq" />
        <script type="application/ld+json">
          {JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'FAQPage',
            mainEntity: allQuestions.map(item => ({
              '@type': 'Question',
              name: item.q,
              acceptedAnswer: { '@type': 'Answer', text: item.a },
            })),
          })}
        </script>
      </Helmet>

      <div className="max-w-2xl mx-auto">
        <div className="flex items-center gap-2.5 mb-1">
          <HelpCircle className="w-5 h-5 text-purple-300/70" />
          <h1 className="text-2xl font-bold text-white">Questions, answered</h1>
        </div>
        <p className="text-sm text-white/40 mb-10">{DESCRIPTION}</p>

        <div className="space-y-12">
          {faq.groups.map(group => (
            <section key={group.heading}>
              <h2 className="text-xs font-semibold tracking-[0.12em] uppercase text-white/35 mb-5">
                {group.heading}
              </h2>
              <div className="space-y-7">
                {group.questions.map(item => (
                  <div key={item.q}>
                    {/* h3 rather than a button. The question is the thing a
                        search result matches, so it is a heading in the
                        document, not a control. */}
                    <h3 className="text-base font-semibold text-white leading-snug mb-1.5">{item.q}</h3>
                    <p className="text-sm text-white/55 leading-relaxed">{item.a}</p>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>

        <section className="mt-14">
          <h2 className="text-xs font-semibold tracking-[0.12em] uppercase text-white/35 mb-3">Read next</h2>
          <ul className="space-y-1.5">
            <li><Link to="/guides" className="text-sm text-purple-300 hover:text-purple-200 transition">Guides for independent artists</Link></li>
            <li><Link to="/vs/spotify" className="text-sm text-purple-300 hover:text-purple-200 transition">Feelz Machine vs Spotify</Link></li>
            <li><Link to="/artists" className="text-sm text-purple-300 hover:text-purple-200 transition">Every artist on Feelz Machine</Link></li>
            <li><Link to="/retail" className="text-sm text-purple-300 hover:text-purple-200 transition">Music for your business</Link></li>
          </ul>
        </section>
      </div>
    </div>
  );
}
