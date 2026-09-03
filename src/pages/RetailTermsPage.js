// src/pages/RetailTermsPage.js
// Terms for Feelz Retail venue subscribers.
//
// IMPORTANT: this is a plain-language operational agreement describing how
// the service actually works. It has NOT been reviewed by a lawyer. The
// licensing position (SAMRO / SAMPRA) is deliberately stated as something
// the venue should confirm for itself rather than as a warranty from us,
// because that question is genuinely unresolved. See the legal briefing
// document before changing any of that wording.

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

export default function RetailTermsPage() {
  const navigate = useNavigate();
  const pageUrl = `${BASE_URL}/retail/terms`;

  return (
    <div className="min-h-screen bg-black text-white">
      <Helmet>
        <title>Feelz Retail, Terms of Service · Feelz Machine</title>
        <meta name="description" content="Terms of service for venues subscribing to Feelz Retail background music." />
        <link rel="canonical" href={pageUrl} />
      </Helmet>

      <div className="sticky top-0 z-10 bg-black/95 backdrop-blur-xl border-b border-white/[0.05] px-4 py-4 flex items-center space-x-3">
        <button onClick={() => navigate(-1)} className="p-1.5 hover:bg-white/[0.06] rounded-lg transition">
          <ArrowLeft className="w-5 h-5 text-white/40" />
        </button>
        <h1 className="text-base font-bold text-white">Feelz Retail, Terms of Service</h1>
      </div>

      <div className="max-w-2xl mx-auto px-5 pt-8 pb-24">
        <p className="text-xs text-white/30 mb-8">Last updated: {LAST_UPDATED}</p>

        <Section title="1. What this service is">
          <p>Feelz Retail is a background music service for commercial premises. You pay a monthly subscription and stream curated playlists into your venue during trading hours.</p>
          <p>All music comes from independent artists who uploaded their own recordings to Feelz Machine. There is no major-label catalogue.</p>
        </Section>

        <Section title="2. Your subscription">
          <p>Your monthly rate is agreed with us directly rather than set by a public price list, because it depends on your venue.</p>
          <p>Billing is processed through PayPal and charged in US dollars. We may quote you a rand figure for convenience, but the transaction itself is in USD, so the exact rand amount you see on your statement can vary slightly with the exchange rate. You do not need a PayPal account; a card works directly.</p>
          <p>Subscriptions renew monthly until cancelled. You can cancel at any time and will retain access until the end of the period you have paid for. We do not refund part-months.</p>
        </Section>

        <Section title="3. What you can do">
          <p>Stream the playlists available to you, during your trading hours, on the premises registered to your account. If you operate more than one location, each must be registered.</p>
          <p>You may run your own audio advertisements between tracks, or subscribe to an ad-free tier.</p>
        </Section>

        <Section title="4. What you cannot do">
          <p>You may not download, record, copy, or redistribute any audio from the service. You may not use it outside the premises registered to your account, share your login, or use the service for broadcast, streaming, or any public transmission beyond playing music in your own venue.</p>
          <p>You may not represent the music as your own or imply that any artist endorses your business.</p>
        </Section>

        <Section title="5. Music licensing, please read this carefully">
          <p>Every recording on this service is supplied to us directly by the independent artist who made it, and a share of what you pay is passed back to those artists based on what actually plays in your venue.</p>
          <p><span className="text-white/80 font-semibold">However:</span> playing recorded music in a commercial space in South Africa may also engage separate rights administered by collecting societies such as SAMRO and SAMPRA. Those obligations, where they apply, generally sit with the venue.</p>
          <p><span className="text-white/80 font-semibold">We do not warrant that your subscription to Feelz Retail discharges any obligation you may have to a collecting society.</span> You are responsible for confirming your own licensing position for your premises. If you are unsure, speak to SAMRO, SAMPRA, or your own legal adviser.</p>
          <p>We are happy to tell you exactly what is played in your venue and to provide play records to support any enquiry you need to make.</p>
        </Section>

        <Section title="6. How artists are paid">
          <p>We pool a share of subscription and advertising revenue and distribute it to artists in proportion to how much their music actually played across the service. A play counts once at least 30 seconds have been heard.</p>
          <p>This means your subscription genuinely reaches the artists whose music plays in your venue.</p>
        </Section>

        <Section title="7. Availability">
          <p>We aim to keep the service running continuously but cannot guarantee uninterrupted access. The service depends on your internet connection, which is your responsibility.</p>
          <p>Playlists change over time as artists add music and as we curate. We may add, remove, or alter playlists without notice.</p>
        </Section>

        <Section title="8. Suspension and termination">
          <p>We may suspend or terminate your access if payment fails, if these terms are breached, or if the service is being used in a way that risks the rights of our artists.</p>
          <p>You may cancel at any time by contacting us.</p>
        </Section>

        <Section title="9. Liability">
          <p>We provide the service as it is. To the extent the law allows, we are not liable for indirect or consequential loss arising from your use of it, including any claim brought against you by a third party in respect of music performance rights, which remains your responsibility as set out in section 5.</p>
        </Section>

        <Section title="10. Changes">
          <p>We may update these terms. If we make a material change we will tell you through the player or by email before it takes effect.</p>
        </Section>

        <Section title="11. Contact">
          <p>Questions about these terms or your subscription: <span className="text-white/70">{CONTACT}</span></p>
        </Section>

        <p className="text-[11px] text-white/20 leading-relaxed mt-10 pt-6 border-t border-white/[0.06]">
          These terms describe how the service operates in plain language. They are not a substitute for your own legal advice, particularly regarding music performance licensing for your premises.
        </p>
      </div>
    </div>
  );
}