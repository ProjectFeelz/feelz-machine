import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, Shield } from 'lucide-react';

function PrivacyPolicy() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-blue-900 to-gray-900 text-white p-4 md:p-8">
      <div className="max-w-4xl mx-auto">
        {/* Back Button */}
        <button
          onClick={() => navigate('/')}
          className="flex items-center space-x-2 text-cyan-300 hover:text-cyan-200 mb-6 transition"
        >
          <ChevronLeft className="w-5 h-5" />
          <span>Back to Home</span>
        </button>

        {/* Header */}
        <div className="mb-8 text-center">
          <div className="flex items-center justify-center space-x-3 mb-4">
            <Shield className="w-8 h-8 text-cyan-400" />
            <h1 className="text-3xl md:text-4xl font-bold bg-gradient-to-r from-blue-400 to-cyan-400 bg-clip-text text-transparent">
              Privacy Policy
            </h1>
          </div>
          <p className="text-cyan-300">Last Updated: February 3, 2026</p>
        </div>

        {/* Content */}
        <div className="bg-white/5 backdrop-blur-xl rounded-2xl p-6 md:p-8 border border-cyan-400/20 space-y-6">
          
          <section>
            <h2 className="text-2xl font-bold text-cyan-400 mb-3">1. Introduction</h2>
            <p className="text-gray-300 leading-relaxed">
              Welcome to Feelz Machine. We respect your privacy and are committed to protecting your personal data. 
              This privacy policy explains how we collect, use, and safeguard your information when you use our 
              sample pack library platform.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-cyan-400 mb-3">2. Information We Collect</h2>
            <div className="space-y-3">
              <div>
                <h3 className="text-lg font-semibold text-cyan-300 mb-2">Account Information via Google OAuth</h3>
                <p className="text-gray-300 mb-2">
                  When you sign in using Google OAuth, we collect the following information from your Google account:
                </p>
                <ul className="list-disc list-inside text-gray-300 space-y-1 ml-4">
                  <li><strong className="text-cyan-300">Email address</strong> - We collect your email address from Google for account identification, communications, and to send you updates about new sample packs and features</li>
                  <li><strong className="text-cyan-300">Name</strong> - Your display name from your Google account</li>
                  <li><strong className="text-cyan-300">Profile picture</strong> - Your Google profile photo (if available)</li>
                  <li><strong className="text-cyan-300">Google User ID</strong> - A unique identifier provided by Google</li>
                </ul>
                <p className="text-gray-400 text-sm mt-2 italic">
                  Note: We do NOT receive or store your Google password. Authentication is handled securely by Google.
                </p>
              </div>

              <div>
                <h3 className="text-lg font-semibold text-cyan-300 mb-2">Profile Information</h3>
                <p className="text-gray-300 mb-2">
                  During profile setup, you provide:
                </p>
                <ul className="list-disc list-inside text-gray-300 space-y-1 ml-4">
                  <li>Name (required)</li>
                  <li>Email address (required - confirmed from Google)</li>
                  <li>Age (optional)</li>
                  <li>Country and city (optional)</li>
                  <li>Favorite music genres (required)</li>
                  <li>Production experience level (optional)</li>
                  <li>DAW (Digital Audio Workstation) preference (optional)</li>
                </ul>
              </div>

              <div>
                <h3 className="text-lg font-semibold text-cyan-300 mb-2">Usage Data</h3>
                <ul className="list-disc list-inside text-gray-300 space-y-1 ml-4">
                  <li>Sample packs you play and download</li>
                  <li>Interaction timestamps and frequency</li>
                  <li>BPM, key, genre, and mood preferences</li>
                  <li>Pitch and tempo adjustments you make</li>
                </ul>
              </div>

              <div>
                <h3 className="text-lg font-semibold text-cyan-300 mb-2">Technical Data</h3>
                <ul className="list-disc list-inside text-gray-300 space-y-1 ml-4">
                  <li>IP address and browser type</li>
                  <li>Device information</li>
                  <li>Session data and cookies</li>
                </ul>
              </div>
            </div>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-cyan-400 mb-3">3. How We Use Your Information</h2>
            <p className="text-gray-300 leading-relaxed mb-3">We use your data to:</p>
            <ul className="list-disc list-inside text-gray-300 space-y-2 ml-4">
              <li>Provide and improve our sample pack library service</li>
              <li>Personalize your experience with recommendations</li>
              <li>Analyze usage patterns to understand user preferences</li>
              <li>Send you updates about new sample packs and features via email</li>
              <li>Send newsletters with production tips and news (you can opt-out anytime)</li>
              <li>Communicate important service announcements</li>
              <li>Maintain security and prevent fraud</li>
              <li>Comply with legal obligations</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-cyan-400 mb-3">4. Email Marketing & Communications</h2>
            <p className="text-gray-300 leading-relaxed mb-3">
              By creating an account, you agree to receive:
            </p>
            <ul className="list-disc list-inside text-gray-300 space-y-2 ml-4">
              <li>Updates about new sample packs added to the library</li>
              <li>Newsletter with music production tips and industry news</li>
              <li>Important service announcements and account notifications</li>
            </ul>
            <div className="mt-3 p-4 bg-blue-500/10 border border-blue-500/30 rounded-lg">
              <p className="text-gray-300 mb-2">
                <strong className="text-cyan-300">Opt-Out:</strong> You can unsubscribe from marketing emails at any time by:
              </p>
              <ul className="list-disc list-inside text-gray-300 space-y-1 ml-4">
                <li>Clicking the "unsubscribe" link in any email we send</li>
                <li>Contacting us at{' '}
                  <a href="mailto:steve@projectfeelz.com" className="text-cyan-400 hover:text-cyan-300 underline">
                    steve@projectfeelz.com
                  </a>
                </li>
              </ul>
              <p className="text-gray-400 text-sm mt-2 italic">
                Note: You cannot opt-out of essential service emails (account security alerts, terms updates, etc.)
              </p>
            </div>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-cyan-400 mb-3">5. Google OAuth & Authentication</h2>
            <p className="text-gray-300 leading-relaxed mb-3">
              When you sign in with Google:
            </p>
            <ul className="list-disc list-inside text-gray-300 space-y-2 ml-4">
              <li>Google shares your email address, name, and profile picture with us</li>
              <li>We receive an authentication token (NOT your password)</li>
              <li>Your Google credentials remain secure with Google</li>
              <li>You can revoke our access anytime in your{' '}
                <a 
                  href="https://myaccount.google.com/permissions" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-cyan-400 hover:text-cyan-300 underline"
                >
                  Google Account settings
                </a>
              </li>
            </ul>
            <p className="text-gray-300 mt-3">
              For more information about Google's data practices, review{' '}
              <a 
                href="https://policies.google.com/privacy" 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-cyan-400 hover:text-cyan-300 underline"
              >
                Google's Privacy Policy
              </a>
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-cyan-400 mb-3">6. Data Sharing and Disclosure</h2>
            <p className="text-gray-300 leading-relaxed mb-3">
              We do NOT sell your personal data. We may share your information only in these circumstances:
            </p>
            <ul className="list-disc list-inside text-gray-300 space-y-2 ml-4">
              <li><strong className="text-cyan-300">Service Providers:</strong> Third-party services that help us operate our platform:
                <ul className="list-disc list-inside text-gray-400 space-y-1 ml-6 mt-1">
                  <li>Supabase (database and authentication - GDPR compliant)</li>
                  <li>Google (OAuth authentication provider)</li>
                  <li>Netlify (website hosting)</li>
                </ul>
              </li>
              <li><strong className="text-cyan-300">Legal Requirements:</strong> If required by law or to protect our rights</li>
              <li><strong className="text-cyan-300">Business Transfers:</strong> In case of merger, acquisition, or sale of assets</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-cyan-400 mb-3">7. Data Retention</h2>
            <p className="text-gray-300 leading-relaxed mb-3">
              We retain your personal data:
            </p>
            <ul className="list-disc list-inside text-gray-300 space-y-2 ml-4">
              <li><strong className="text-cyan-300">While your account is active:</strong> All account and usage data</li>
              <li><strong className="text-cyan-300">After account deletion:</strong> Anonymized analytics data for 90 days</li>
              <li><strong className="text-cyan-300">Download records:</strong> 2 years for copyright compliance purposes</li>
            </ul>
            <p className="text-gray-300 mt-3">
              You may request deletion of your account and data at any time by contacting us at{' '}
              <a href="mailto:steve@projectfeelz.com" className="text-cyan-400 hover:text-cyan-300 underline">
                steve@projectfeelz.com
              </a>
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-cyan-400 mb-3">8. Your Rights</h2>
            <p className="text-gray-300 leading-relaxed mb-3">You have the right to:</p>
            <ul className="list-disc list-inside text-gray-300 space-y-2 ml-4">
              <li><strong className="text-cyan-300">Access:</strong> Request a copy of your personal data</li>
              <li><strong className="text-cyan-300">Correction:</strong> Update or correct inaccurate data</li>
              <li><strong className="text-cyan-300">Deletion:</strong> Request deletion of your account and data</li>
              <li><strong className="text-cyan-300">Portability:</strong> Export your data in a common format</li>
              <li><strong className="text-cyan-300">Object:</strong> Object to certain data processing activities</li>
              <li><strong className="text-cyan-300">Withdraw Consent:</strong> Opt-out of marketing communications at any time</li>
            </ul>
            <p className="text-gray-300 mt-3">
              To exercise these rights, contact us at{' '}
              <a href="mailto:steve@projectfeelz.com" className="text-cyan-400 hover:text-cyan-300 underline">
                steve@projectfeelz.com
              </a>
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-cyan-400 mb-3">9. Security</h2>
            <p className="text-gray-300 leading-relaxed">
              We implement industry-standard security measures to protect your data:
            </p>
            <ul className="list-disc list-inside text-gray-300 space-y-2 ml-4 mt-2">
              <li>Data encryption at rest and in transit (HTTPS)</li>
              <li>Secure authentication via Google OAuth</li>
              <li>Regular security audits and updates</li>
              <li>Access controls and monitoring</li>
            </ul>
            <p className="text-gray-300 mt-3">
              However, no method of transmission over the internet is 100% secure. While we strive to protect 
              your information, we cannot guarantee absolute security.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-cyan-400 mb-3">10. Cookies and Tracking</h2>
            <p className="text-gray-300 leading-relaxed mb-3">
              We use:
            </p>
            <ul className="list-disc list-inside text-gray-300 space-y-2 ml-4">
              <li><strong className="text-cyan-300">Session cookies:</strong> To keep you signed in and maintain your session</li>
              <li><strong className="text-cyan-300">Local storage:</strong> To remember your preferences and settings</li>
              <li><strong className="text-cyan-300">Analytics:</strong> To understand how you use our platform and improve our service</li>
            </ul>
            <p className="text-gray-300 mt-3">
              We do NOT use third-party advertising cookies or trackers. You can control cookies through your browser settings.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-cyan-400 mb-3">11. Children's Privacy</h2>
            <p className="text-gray-300 leading-relaxed">
              Our service is not intended for users under 13 years of age. We do not knowingly collect 
              information from children under 13. If you believe we have collected data from a child, 
              please contact us immediately at{' '}
              <a href="mailto:steve@projectfeelz.com" className="text-cyan-400 hover:text-cyan-300 underline">
                steve@projectfeelz.com
              </a>
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-cyan-400 mb-3">12. International Users</h2>
            <p className="text-gray-300 leading-relaxed">
              Your information may be transferred to and processed in countries other than your own. 
              By using our service, you consent to such transfers. We ensure appropriate safeguards 
              are in place for international data transfers in compliance with applicable data protection laws.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-cyan-400 mb-3">13. Changes to This Policy</h2>
            <p className="text-gray-300 leading-relaxed mb-3">
              We may update this privacy policy from time to time. We will notify you of significant changes by:
            </p>
            <ul className="list-disc list-inside text-gray-300 space-y-2 ml-4">
              <li>Posting the new policy on this page</li>
              <li>Updating the "Last Updated" date</li>
              <li>Sending you an email notification (for material changes)</li>
            </ul>
            <p className="text-gray-300 mt-3">
              Your continued use of our service after changes constitutes acceptance of the updated policy.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-cyan-400 mb-3">14. Contact Us</h2>
            <p className="text-gray-300 leading-relaxed mb-3">
              If you have questions about this privacy policy or our data practices, please contact us:
            </p>
            <div className="mt-3 p-4 bg-cyan-500/10 border border-cyan-500/30 rounded-lg">
              <p className="text-cyan-300">
                <strong>Email:</strong>{' '}
                <a href="mailto:steve@projectfeelz.com" className="text-cyan-400 hover:text-cyan-300 underline">
                  steve@projectfeelz.com
                </a>
              </p>
              <p className="text-cyan-300 mt-1">
                <strong>Discord:</strong>{' '}
                <a 
                  href="https://discord.gg/jwZU6YSKnf" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-cyan-400 hover:text-cyan-300 underline"
                >
                  Join our Discord
                </a>
              </p>
              <p className="text-cyan-300 mt-1">
                <strong>Website:</strong>{' '}
                <a 
                  href="https://www.feelzmachine.com" 
                  className="text-cyan-400 hover:text-cyan-300 underline"
                >
                  www.feelzmachine.com
                </a>
              </p>
            </div>
          </section>

          <section className="border-t border-cyan-500/30 pt-6">
            <p className="text-gray-400 text-sm italic">
              By using Feelz Machine, you consent to this Privacy Policy and our collection and use of 
              information as described herein.
            </p>
            <p className="text-gray-500 text-xs mt-4 text-center">
              © 2026 Feelz Machine - Sample Pack Library - All Rights Reserved
            </p>
          </section>
        </div>

        {/* Back to Top */}
        <div className="text-center mt-8">
          <button
            onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
            className="text-cyan-400 hover:text-cyan-300 transition"
          >
            ↑ Back to Top
          </button>
        </div>
      </div>
    </div>
  );
}

export default PrivacyPolicy;