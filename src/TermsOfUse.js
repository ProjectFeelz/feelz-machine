import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, FileText } from 'lucide-react';

export default function TermsOfUse() {
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
            <FileText className="w-6 h-6 text-white/40" />
            <h1 className="text-2xl font-bold text-white">Terms of Use</h1>
          </div>
          <p className="text-sm text-white/30">Last Updated: March 4, 2026</p>
        </div>

        <div className="space-y-8 text-sm text-white/60 leading-relaxed">

          <section>
            <h2 className="text-base font-semibold text-white mb-3">1. Acceptance of Terms</h2>
            <p>By accessing or using Feelz Machine ("the Platform"), you agree to be bound by these Terms of Use. If you do not agree to these terms, do not use the Platform. These terms apply to all users including visitors, listeners, and registered artists.</p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-white mb-3">2. The Platform</h2>
            <p>Feelz Machine is an independent music streaming and artist distribution platform operated by Project Feelz. The Platform allows artists to upload, publish, and monetize their music, and allows listeners to discover and stream music from independent artists. Feelz Machine does not distribute music to third-party streaming services — all distribution is within the Platform itself.</p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-white mb-3">3. Accounts</h2>
            <p className="mb-3">To access certain features you must register for an account. You are responsible for:</p>
            <ul className="space-y-1.5 list-disc list-inside text-white/50">
              <li>Maintaining the security of your account credentials</li>
              <li>All activity that occurs under your account</li>
              <li>Providing accurate and current information</li>
              <li>Notifying us immediately of any unauthorized access</li>
            </ul>
            <p className="mt-3">We reserve the right to suspend or terminate accounts that violate these terms.</p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-white mb-3">4. Artist Accounts and Content</h2>
            <p className="mb-3">Artists who register on Feelz Machine retain full ownership of their music and content. By uploading content to the Platform, you grant Feelz Machine a non-exclusive, royalty-free license to host, display, stream, and distribute your content to users of the Platform.</p>
            <p className="mb-3">As an artist you represent and warrant that:</p>
            <ul className="space-y-1.5 list-disc list-inside text-white/50">
              <li>You own or have the rights to all content you upload</li>
              <li>Your content does not infringe any third-party intellectual property rights</li>
              <li>Your content does not violate any applicable laws</li>
              <li>You have obtained all necessary licenses, clearances, and permissions</li>
            </ul>
          </section>

          <section>
            <h2 className="text-base font-semibold text-white mb-3">5. Subscription Tiers</h2>
            <p className="mb-3">Feelz Machine offers the following subscription tiers for artists:</p>
            <ul className="space-y-2 list-none">
              <li className="pl-4 border-l border-white/10"><span className="text-white/80 font-medium">Free:</span> Limited uploads, basic profile features.</li>
              <li className="pl-4 border-l border-white/10"><span className="text-white/80 font-medium">Pro ($20/year):</span> Unlimited uploads, custom themes, analytics, collaborations, and more.</li>
              <li className="pl-4 border-l border-white/10"><span className="text-white/80 font-medium">Premium ($50/year):</span> All Pro features plus priority placement in browse and trending, download sales, and community posting.</li>
            </ul>
            <p className="mt-3">Subscriptions are billed annually through PayPal. Cancellations take effect at the end of the current billing period. We do not offer refunds for partially used subscription periods.</p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-white mb-3">6. Track Sales and Payouts</h2>
            <p className="mb-3">Premium artists may sell downloadable tracks through the Platform. Feelz Machine facilitates payments via PayPal. Artists must provide a valid PayPal email address to receive payouts.</p>
            <p>Royalty splits between collaborating artists are calculated automatically based on agreed split percentages. Payouts are processed after a minimum threshold is reached. Feelz Machine reserves the right to withhold payouts in cases of suspected fraud, chargebacks, or policy violations.</p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-white mb-3">7. Community and Posts</h2>
            <p className="mb-3">Premium artists may post updates to the community feed. All posts must be music-related. The following are prohibited in community posts:</p>
            <ul className="space-y-1.5 list-disc list-inside text-white/50">
              <li>External links other than YouTube embeds</li>
              <li>Spam, promotional content unrelated to music</li>
              <li>Hate speech, harassment, or offensive content</li>
              <li>Misinformation or misleading content</li>
              <li>Content that violates any applicable law</li>
            </ul>
            <p className="mt-3">We reserve the right to remove any post that violates these guidelines without notice.</p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-white mb-3">8. Prohibited Content</h2>
            <p className="mb-3">The following content is strictly prohibited on Feelz Machine:</p>
            <ul className="space-y-1.5 list-disc list-inside text-white/50">
              <li>Music or content you do not own or have rights to</li>
              <li>Content containing hate speech, violence, or discrimination</li>
              <li>Pornographic or sexually explicit content</li>
              <li>Content that promotes illegal activities</li>
              <li>Malware, spam, or any harmful code</li>
              <li>Impersonation of other artists or individuals</li>
            </ul>
            <p className="mt-3">Violation of these prohibitions may result in immediate account suspension or termination.</p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-white mb-3">9. Intellectual Property</h2>
            <p>The Feelz Machine platform, including its design, code, branding, and non-user-generated content, is owned by Project Feelz and protected by intellectual property laws. You may not copy, reproduce, or distribute any part of the Platform without our express written permission.</p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-white mb-3">10. Disclaimer of Warranties</h2>
            <p>Feelz Machine is provided "as is" without warranties of any kind, express or implied. We do not warrant that the Platform will be uninterrupted, error-free, or free of viruses or other harmful components. We are not responsible for any loss of data or revenue resulting from use of the Platform.</p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-white mb-3">11. Limitation of Liability</h2>
            <p>To the maximum extent permitted by law, Project Feelz shall not be liable for any indirect, incidental, special, consequential, or punitive damages arising from your use of or inability to use the Platform, even if we have been advised of the possibility of such damages.</p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-white mb-3">12. Termination</h2>
            <p>We reserve the right to suspend or terminate your account at any time for violation of these terms, fraudulent activity, or any other reason at our sole discretion. Upon termination, your right to use the Platform ceases immediately. Provisions that by their nature should survive termination will survive.</p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-white mb-3">13. Changes to Terms</h2>
            <p>We may update these Terms of Use at any time. We will notify users of material changes by updating the date at the top of this page. Continued use of the Platform after changes constitutes acceptance of the updated terms.</p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-white mb-3">14. Governing Law</h2>
            <p>These Terms of Use shall be governed by and construed in accordance with applicable law. Any disputes arising from these terms shall be resolved through good-faith negotiation before pursuing formal legal proceedings.</p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-white mb-3">15. Contact</h2>
            <p>For questions about these Terms of Use, contact us at <span className="text-white/80">support@projectfeelz.com</span> or visit <span className="text-white/80">projectfeelz.com</span>.</p>
          </section>

        </div>

        <div className="mt-12 pt-8 border-t border-white/[0.06] text-center">
          <p className="text-xs text-white/20">Feelz Machine · Project Feelz · feelzmachine.com</p>
        </div>
      </div>
    </div>
  );
}
