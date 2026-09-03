// src/pages/RetailPrivacyPage.js
// Privacy notice for Feelz Retail venue subscribers.
//
// The play-logging section is deliberately specific. The service records
// every qualifying play with venue, location, playlist and timestamp,
// because that data drives artist payouts. A venue should know that before
// they sign up, not discover it later.

import React from 'react';
import { Helmet } from 'react-helmet-async';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

const CONTACT      = 'jane@projectfeelz.com';
const LAST_UPDATED = 'September 2026';
const BASE_URL     = 'https://www.feelzmachine.com';

function Section({ title, children }) {
  return (
    <section className="mb-8">
      <h2 className="text-base font-bold text-white mb-3 pb-2 border-b border-white/[0.06]">{title}</h2>
      <div className="space-y-3 text-sm text-white/55 leading-relaxed">{children}</div>
    </section>
  );
}

export default function RetailPrivacyPage() {
  const navigate = useNavigate();
  const pageUrl = `${BASE_URL}/retail/privacy`;

  return (
    <div className="min-h-screen bg-black text-white">
      <Helmet>
        <title>Feelz Retail, Privacy Notice · Feelz Machine</title>
        <meta name="description" content="How Feelz Retail handles venue data." />
        <link rel="canonical" href={pageUrl} />
      </Helmet>

      <div className="sticky top-0 z-10 bg-black/95 backdrop-blur-xl border-b border-white/[0.05] px-4 py-4 flex items-center space-x-3">
        <button onClick={() => navigate(-1)} className="p-1.5 hover:bg-white/[0.06] rounded-lg transition">
          <ArrowLeft className="w-5 h-5 text-white/40" />
        </button>
        <h1 className="text-base font-bold text-white">Feelz Retail, Privacy Notice</h1>
      </div>

      <div className="max-w-2xl mx-auto px-5 pt-8 pb-24">
        <p className="text-xs text-white/30 mb-8">Last updated: {LAST_UPDATED}</p>

        <Section title="1. Who we are">
          <p>Feelz Retail is operated by Feelz Machine (Project Feelz), based in South Africa. This notice covers venue accounts specifically. It is written to align with the Protection of Personal Information Act (POPIA).</p>
        </Section>

        <Section title="2. What we collect about your business">
          <p><span className="text-white/80 font-semibold">Account details:</span> your business name, contact name, contact email and phone number, and the locations you register.</p>
          <p><span className="text-white/80 font-semibold">Login details:</span> the email address you sign in with. Passwords are handled by our authentication provider and are never visible to us.</p>
          <p><span className="text-white/80 font-semibold">Billing:</span> your subscription status and payment history. Card details are handled entirely by PayPal. We never see or store your card number.</p>
        </Section>

        <Section title="3. What we record about what you play">
          <p>This is the part worth reading properly, because we record more here than a typical music app.</p>
          <p>Every time a track plays for at least 30 seconds in your venue, we record: which track, which of your locations, which playlist, the timestamp, and how many seconds played. We record the same for advertisements.</p>
          <p><span className="text-white/80 font-semibold">Why:</span> this is how artists get paid. Payouts are calculated from actual play counts, so without this record we could not pay anyone accurately or prove that we had.</p>
          <p>We also record which tracks your account marks as liked, which helps us suggest playlists.</p>
          <p>We do not record audio, we do not listen to your premises, and the service has no microphone access of any kind.</p>
        </Section>

        <Section title="4. How we use it">
          <p>To run your subscription, calculate and pay artist royalties, produce aggregate analytics about the service, suggest playlists that suit your venue, and contact you about your account or the service.</p>
          <p>We do not sell your data, and we do not use it for advertising targeting.</p>
        </Section>

        <Section title="5. Who else sees it">
          <p><span className="text-white/80 font-semibold">Artists</span> see aggregate play counts for their own music. They do not see which specific venue played it.</p>
          <p><span className="text-white/80 font-semibold">Our service providers:</span> Supabase (database and authentication), Netlify (hosting), and PayPal (payments). Each only receives what it needs to do its job.</p>
          <p>We do not share your details with anyone else unless the law requires it.</p>
        </Section>

        <Section title="6. How long we keep it">
          <p>Account details are kept while your subscription is active and for a reasonable period afterwards in case you return.</p>
          <p>Play records are kept long-term, because they are the evidence base for royalty payments already made and may need to be produced if a payment is ever questioned.</p>
        </Section>

        <Section title="7. Your rights">
          <p>Under POPIA you can ask us what we hold about your business, ask for corrections, ask for deletion (subject to the record-keeping above), or object to how we are using it.</p>
          <p>Email <span className="text-white/70">{CONTACT}</span> and we will respond within a reasonable time.</p>
        </Section>

        <Section title="8. Security">
          <p>Access is restricted by authentication and database-level access rules, so one venue cannot see another venue's data. Connections are encrypted. We cannot promise any system is perfectly secure, but if a breach affected you we would tell you.</p>
        </Section>

        <Section title="9. Changes">
          <p>If we change this notice materially we will tell you through the player or by email.</p>
        </Section>

        <Section title="10. Contact">
          <p>Questions about your data: <span className="text-white/70">{CONTACT}</span></p>
        </Section>
      </div>
    </div>
  );
}