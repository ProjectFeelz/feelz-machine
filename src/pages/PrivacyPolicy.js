import React from 'react';
import { Helmet } from 'react-helmet-async';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, Shield } from 'lucide-react';

const BASE_URL = 'https://www.feelzmachine.com';

export default function PrivacyPolicy() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-black text-white">
      <Helmet>
        <title>Privacy Policy · Feelz Machine</title>
        <meta name="description" content="Feelz Machine privacy policy — how we collect, use and protect your personal information." />
        <link rel="canonical" href={`${BASE_URL}/privacy-policy`} />
        <meta property="og:title" content="Privacy Policy · Feelz Machine" />
        <meta property="og:url" content={`${BASE_URL}/privacy-policy`} />
      </Helmet>

      <div className="max-w-3xl mx-auto px-6 py-10">
        <button onClick={() => navigate(-1)}
          className="flex items-center space-x-2 text-white/40 hover:text-white/70 mb-8 transition">
          <ChevronLeft className="w-5 h-5" />
          <span className="text-sm">Back</span>
        </button>

        <div className="mb-10">
          <div className="flex items-center space-x-3 mb-3">
            <Shield className="w-6 h-6 text-white/40" />
            <h1 className="text-2xl font-bold text-white">Privacy Policy</h1>
          </div>
          <p className="text-sm text-white/30">Last Updated: March 2026</p>
        </div>

        <div className="space-y-8 text-sm text-white/60 leading-relaxed">

          <section>
            <h2 className="text-base font-semibold text-white mb-3">1. Who We Are</h2>
            <p>Feelz Machine is an independent music streaming and artist distribution platform operated by Project Feelz ("we", "us", "our"). We are based online at <span className="text-white/80">feelzmachine.com</span>. This policy explains how we collect, use, and protect your personal information when you use our platform.</p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-white mb-3">2. Information We Collect</h2>
            <p className="mb-3">We collect the following types of information:</p>
            <ul className="space-y-2 list-none">
              <li className="pl-4 border-l border-white/10"><span className="text-white/80 font-medium">Account Information:</span> Your email address when you register directly, or your Google account name and email if you sign in via Google OAuth.</li>
              <li className="pl-4 border-l border-white/10"><span className="text-white/80 font-medium">Artist Profile:</span> Artist name, bio, profile image, social media links, and other profile details you choose to provide.</li>
              <li className="pl-4 border-l border-white/10"><span className="text-white/80 font-medium">Music Content:</span> Audio files, cover artwork, track metadata, album information, and lyrics you upload.</li>
              <li className="pl-4 border-l border-white/10"><span className="text-white/80 font-medium">Payment Information:</span> PayPal email and merchant ID for processing purchases and payouts. We do not store credit card numbers or full payment details — these are handled entirely by PayPal.</li>
              <li className="pl-4 border-l border-white/10"><span className="text-white/80 font-medium">Collaboration Data:</span> Collaborator credits, roles, and revenue split percentages you assign to other artists on your tracks and albums.</li>
              <li className="pl-4 border-l border-white/10"><span className="text-white/80 font-medium">Usage Data:</span> Stream counts, download activity, follow relationships, search queries, and engagement with the platform.</li>
              <li className="pl-4 border-l border-white/10"><span className="text-white/80 font-medium">Communications:</span> Posts, comments, and chat room messages you create on the platform.</li>
              <li className="pl-4 border-l border-white/10"><span className="text-white/80 font-medium">Moderation Records:</span> If your account is flagged for suspected stream fraud or other policy violations, a record of that flag and any actions taken is retained for platform integrity purposes.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-base font-semibold text-white mb-3">3. How We Use Your Information</h2>
            <p className="mb-3">We use your information to:</p>
            <ul className="space-y-1.5 list-disc list-inside text-white/50">
              <li>Provide and operate the Feelz Machine platform</li>
              <li>Process track and album purchases via PayPal</li>
              <li>Disburse revenue splits to collaborators via PayPal</li>
              <li>Send royalty payouts to artists via PayPal</li>
              <li>Facilitate 1-on-1 support session bookings and payments</li>
              <li>Deliver email notifications relevant to your account</li>
              <li>Display your public artist profile and music to listeners</li>
              <li>Generate analytics and engagement insights for your dashboard</li>
              <li>Operate chat rooms and community features</li>
              <li>Detect and prevent stream fraud and platform abuse</li>
              <li>Improve and develop our platform features</li>
              <li>Enforce our Terms of Service and community guidelines</li>
            </ul>
          </section>

          <section>
            <h2 className="text-base font-semibold text-white mb-3">4. Data Sharing</h2>
            <p className="mb-3">We do not sell your personal data. We share information only in the following circumstances:</p>
            <ul className="space-y-2 list-none">
              <li className="pl-4 border-l border-white/10"><span className="text-white/80 font-medium">Supabase:</span> Our database and storage provider. Your data is stored securely on Supabase infrastructure with row-level security enforced.</li>
              <li className="pl-4 border-l border-white/10"><span className="text-white/80 font-medium">PayPal:</span> Payment processing for purchases, subscriptions, and artist payouts including collaboration revenue splits. Governed by PayPal's privacy policy.</li>
              <li className="pl-4 border-l border-white/10"><span className="text-white/80 font-medium">Google:</span> If you sign in via Google OAuth, your authentication is handled by Google. We receive only your name and email address from Google. Governed by Google's privacy policy.</li>
              <li className="pl-4 border-l border-white/10"><span className="text-white/80 font-medium">Resend:</span> Email delivery service used to send transactional and newsletter emails.</li>
              <li className="pl-4 border-l border-white/10"><span className="text-white/80 font-medium">Collaborators:</span> When you add a collaborator to a track, their name, role, and split percentage are visible to other collaborators on that track.</li>
              <li className="pl-4 border-l border-white/10"><span className="text-white/80 font-medium">Legal requirements:</span> We may disclose information if required by law or to protect the rights and safety of our users.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-base font-semibold text-white mb-3">5. Public Information</h2>
            <p>Your artist profile — including your artist name, bio, profile image, published tracks, albums, collaboration credits, and community posts — is publicly visible to anyone who visits Feelz Machine. Chat room messages are visible to other members of that room. Your email address, payment details, and moderation records are never made public.</p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-white mb-3">6. Data Retention</h2>
            <p>We retain your data for as long as your account is active. If you request account deletion, we will remove your personal data within 30 days, except where we are required to retain it for legal, financial compliance, or fraud prevention purposes. Stream and purchase records may be retained in anonymised form for platform analytics.</p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-white mb-3">7. Your Rights</h2>
            <p className="mb-3">You have the right to:</p>
            <ul className="space-y-1.5 list-disc list-inside text-white/50">
              <li>Access the personal data we hold about you</li>
              <li>Request correction of inaccurate data</li>
              <li>Request deletion of your account and personal data</li>
              <li>Opt out of non-essential communications</li>
              <li>Request a copy of your data in a portable format</li>
            </ul>
            <p className="mt-3">To exercise any of these rights, contact us at <span className="text-white/80">legal@projectfeelz.com</span>.</p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-white mb-3">8. Cookies and Tracking</h2>
            <p>Feelz Machine uses authentication tokens stored in your browser to keep you logged in. If you sign in via Google, Google's OAuth flow may set its own cookies governed by Google's privacy policy. We do not use third-party advertising cookies or tracking pixels. Basic analytics may be collected to understand platform usage in aggregate.</p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-white mb-3">9. Security</h2>
            <p>We implement industry-standard security measures including encrypted connections (HTTPS), row-level security on our database, secure token-based authentication, and leaked password protection on user accounts. No method of transmission over the internet is 100% secure, and we cannot guarantee absolute security.</p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-white mb-3">10. Stream Fraud Detection</h2>
            <p>The platform operates automated systems to detect artificial stream manipulation. These systems analyse streaming patterns and may flag accounts exhibiting unusual activity. Flagged data is retained for platform integrity purposes and reviewed by our moderation team. If you believe your account has been flagged in error, contact us at <span className="text-white/80">legal@projectfeelz.com</span>.</p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-white mb-3">11. Children's Privacy</h2>
            <p>Feelz Machine is not directed at children under the age of 13. We do not knowingly collect personal information from children. If we become aware that a child has provided us with personal data, we will delete it promptly.</p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-white mb-3">12. Changes to This Policy</h2>
            <p>We may update this Privacy Policy from time to time. We will notify you of significant changes by updating the date at the top of this page. Continued use of the platform after changes constitutes acceptance of the updated policy.</p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-white mb-3">13. Contact</h2>
            <p>For privacy-related questions or requests, contact us at <span className="text-white/80">legal@projectfeelz.com</span> or visit <span className="text-white/80">projectfeelz.com</span>.</p>
          </section>

        </div>

        <div className="mt-12 pt-8 border-t border-white/[0.06] text-center">
          <p className="text-xs text-white/20">Feelz Machine · Project Feelz · feelzmachine.com</p>
        </div>
      </div>
    </div>
  );
}
