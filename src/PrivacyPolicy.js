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
          <p className="text-cyan-300">Last Updated: February 2, 2025</p>
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
                <h3 className="text-lg font-semibold text-cyan-300 mb-2">Account Information</h3>
                <ul className="list-disc list-inside text-gray-300 space-y-1 ml-4">
                  <li>Email address (for authentication)</li>
                  <li>Profile information (name, age, location, DAW preference, experience level)</li>
                  <li>Music production preferences (favorite genres)</li>
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
              <li>Communicate updates about new sample packs and features</li>
              <li>Maintain security and prevent fraud</li>
              <li>Comply with legal obligations</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-cyan-400 mb-3">4. Data Sharing and Disclosure</h2>
            <p className="text-gray-300 leading-relaxed mb-3">
              We do NOT sell your personal data. We may share your information only in these circumstances:
            </p>
            <ul className="list-disc list-inside text-gray-300 space-y-2 ml-4">
              <li><strong className="text-cyan-300">Service Providers:</strong> Third-party services that help us operate our platform (authentication, storage, analytics)</li>
              <li><strong className="text-cyan-300">Legal Requirements:</strong> If required by law or to protect our rights</li>
              <li><strong className="text-cyan-300">Business Transfers:</strong> In case of merger, acquisition, or sale of assets</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-cyan-400 mb-3">5. Data Retention</h2>
            <p className="text-gray-300 leading-relaxed">
              We retain your personal data for as long as your account is active or as needed to provide you services. 
              You may request deletion of your account and data at any time by contacting us at{' '}
              <a href="mailto:steve@projectfeelz.com" className="text-cyan-400 hover:text-cyan-300 underline">
                steve@projectfeelz.com
              </a>
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-cyan-400 mb-3">6. Your Rights</h2>
            <p className="text-gray-300 leading-relaxed mb-3">You have the right to:</p>
            <ul className="list-disc list-inside text-gray-300 space-y-2 ml-4">
              <li>Access your personal data</li>
              <li>Correct inaccurate data</li>
              <li>Request deletion of your data</li>
              <li>Object to data processing</li>
              <li>Export your data</li>
              <li>Withdraw consent at any time</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-cyan-400 mb-3">7. Security</h2>
            <p className="text-gray-300 leading-relaxed">
              We implement industry-standard security measures to protect your data, including encryption, 
              secure authentication, and regular security audits. However, no method of transmission over 
              the internet is 100% secure.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-cyan-400 mb-3">8. Cookies and Tracking</h2>
            <p className="text-gray-300 leading-relaxed">
              We use essential cookies for authentication and session management. We may also use analytics 
              cookies to understand how you use our platform. You can control cookies through your browser settings.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-cyan-400 mb-3">9. Children's Privacy</h2>
            <p className="text-gray-300 leading-relaxed">
              Our service is not intended for users under 13 years of age. We do not knowingly collect 
              information from children under 13. If you believe we have collected data from a child, 
              please contact us immediately.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-cyan-400 mb-3">10. Changes to This Policy</h2>
            <p className="text-gray-300 leading-relaxed">
              We may update this privacy policy from time to time. We will notify you of significant changes 
              by posting the new policy on this page and updating the "Last Updated" date.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-cyan-400 mb-3">11. Contact Us</h2>
            <p className="text-gray-300 leading-relaxed">
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
            </div>
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