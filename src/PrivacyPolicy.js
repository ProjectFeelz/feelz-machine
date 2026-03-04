import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, Shield } from 'lucide-react';

export default function PrivacyPolicy() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-black text-white">
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
          <p className="text-sm text-white/30">Last Updated: March 4, 2026</p>
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
              <li className="pl-4 border-l border-white/10"><span className="text-white/80 font-medium">Account Information:</span> Your email address and password when you register.</li>
              <li className="pl-4 border-l border-white/10"><span className="text-white/80 font-medium">Artist Profile:</span> Artist name, bio, profile image, social media links, and other profile details you choose to provide.</li>
              <li className="pl-4 border-l border-white/10"><span className="text-white/80 font-medium">Music Content:</span> Audio files, cover artwork, track metadata, and album information you upload.</li>
              <li className="pl-4 border-l border-white/10"><span className="text-white/80 font-medium">Payment Information:</span> PayPal email and merchant ID for processing payouts. We do not store credit card numbers or full payment details — these are handled by PayPal.</li>
              <li className="pl-4 border-l border-white/10"><span className="text-white/80 font-medium">Usage Data:</span> Stream counts, download activity, follow relationships, and engagement with the platform.</li>
              <li className="pl-4 border-l border-white/10"><span className="text-white/80 font-medium">Communications:</span> Posts, comments, and messages you create on the platform.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-base font-semibold text-white mb-3">3. How We Use Your Information</h2>
            <p className="mb-3">We use your information to:</p>
            <ul className="space-y-1.5 list-disc list-inside text-white/50">
              <li>Provide and operate the Feelz Machine platform</li>
              <li>Process subscription payments and track download sales</li>
              <li>Send royalty payouts to artists via PayPal</li>
              <li>Deliver email notifications relevant to your account</li>
              <li>Display your public artist profile and music to listeners</li>
              <li>Generate analytics and engagement insights for your dashboard</li>
              <li>Improve and develop our platform features</li>
              <li>Enforce our Terms of Use and community guidelines</li>
            </ul>
          </section>

          <section>
            <h2 className="text-base font-semibold text-white mb-3">4. Data Sharing</h2>
            <p className="mb-3">We do not sell your personal data. We share information only in the following circumstances:</p>
            <ul className="space-y-2 list-none">
              <li className="pl-4 border-l border-white/10"><span className="text-white/80 font-medium">Supabase:</span> Our database and storage provider. Your data is stored securely on Supabase infrastructure.</li>
              <li className="pl-4 border-l border-white/10"><span className="text-white/80 font-medium">PayPal:</span> Payment processing for subscriptions and payouts. Governed by PayPal's privacy policy.</li>
              <li className="pl-4 border-l border-white/10"><span className="text-white/80 font-medium">Resend:</span> Email delivery service used to send transactional emails.</li>
              <li className="pl-4 border-l border-white/10"><span className="text-white/80 font-medium">Legal requirements:</span> We may disclose information if required by law or to protect the rights and safety of our users.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-base font-semibold text-white mb-3">5. Public Information</h2>
            <p>Your artist profile, including your artist name, bio, profile image, published tracks, and community posts, is publicly visible to anyone who visits Feelz Machine. Your email address and payment details are never made public.</p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-white mb-3">6. Data Retention</h2>
            <p>We retain your data for as long as your account is active. If you request account deletion, we will remove your personal data within 30 days, except where we are required to retain it for legal or financial compliance purposes.</p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-white mb-3">7. Your Rights</h2>
            <p className="mb-3">You have the right to:</p>
            <ul className="space-y-1.5 list-disc list-inside text-white/50">
              <li>Access the personal data we hold about you</li>
              <li>Request correction of inaccurate data</li>
              <li>Request deletion of your account and personal data</li>
              <li>Opt out of non-essential communications</li>
            </ul>
            <p className="mt-3">To exercise any of these rights, contact us at <span className="text-white/80">support@projectfeelz.com</span>.</p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-white mb-3">8. Cookies and Tracking</h2>
            <p>Feelz Machine uses authentication tokens stored in your browser to keep you logged in. We do not use third-party advertising cookies or tracking pixels. Basic analytics may be collected to understand platform usage in aggregate.</p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-white mb-3">9. Security</h2>
            <p>We implement industry-standard security measures including encrypted connections (HTTPS), row-level security on our database, and secure token-based authentication. No method of transmission over the internet is 100% secure, and we cannot guarantee absolute security.</p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-white mb-3">10. Children's Privacy</h2>
            <p>Feelz Machine is not directed at children under the age of 13. We do not knowingly collect personal information from children. If we become aware that a child has provided us with personal data, we will delete it promptly.</p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-white mb-3">11. Changes to This Policy</h2>
            <p>We may update this Privacy Policy from time to time. We will notify you of significant changes by updating the date at the top of this page. Continued use of the platform after changes constitutes acceptance of the updated policy.</p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-white mb-3">12. Contact</h2>
            <p>For privacy-related questions or requests, contact us at <span className="text-white/80">support@projectfeelz.com</span> or visit <span className="text-white/80">projectfeelz.com</span>.</p>
          </section>

        </div>

        <div className="mt-12 pt-8 border-t border-white/[0.06] text-center">
          <p className="text-xs text-white/20">Feelz Machine · Project Feelz · feelzmachine.com</p>
        </div>
      </div>
    </div>
  );
}
