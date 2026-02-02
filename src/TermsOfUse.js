import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, FileText } from 'lucide-react';

function TermsOfUse() {
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
            <FileText className="w-8 h-8 text-cyan-400" />
            <h1 className="text-3xl md:text-4xl font-bold bg-gradient-to-r from-blue-400 to-cyan-400 bg-clip-text text-transparent">
              Terms of Use
            </h1>
          </div>
          <p className="text-cyan-300">Last Updated: February 2, 2025</p>
        </div>

        {/* Content */}
        <div className="bg-white/5 backdrop-blur-xl rounded-2xl p-6 md:p-8 border border-cyan-400/20 space-y-6">
          
          <section>
            <h2 className="text-2xl font-bold text-cyan-400 mb-3">1. Acceptance of Terms</h2>
            <p className="text-gray-300 leading-relaxed">
              By accessing and using Feelz Machine ("the Platform"), you accept and agree to be bound by these 
              Terms of Use. If you do not agree to these terms, please do not use our service.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-cyan-400 mb-3">2. Description of Service</h2>
            <p className="text-gray-300 leading-relaxed">
              Feelz Machine is a sample pack library platform that provides music producers with access to 
              audio samples, loops, and stems. We offer features including audio preview, pitch adjustment, 
              tempo stretching, and sample downloads.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-cyan-400 mb-3">3. User Accounts</h2>
            <div className="space-y-3">
              <p className="text-gray-300 leading-relaxed">When you create an account, you agree to:</p>
              <ul className="list-disc list-inside text-gray-300 space-y-2 ml-4">
                <li>Provide accurate and complete information</li>
                <li>Maintain the security of your account credentials</li>
                <li>Notify us immediately of any unauthorized access</li>
                <li>Be responsible for all activity under your account</li>
                <li>Not share your account with others</li>
              </ul>
            </div>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-cyan-400 mb-3">4. License and Usage Rights</h2>
            <div className="space-y-3">
              <h3 className="text-lg font-semibold text-cyan-300 mb-2">Sample Pack Licenses</h3>
              <p className="text-gray-300 leading-relaxed">
                By downloading sample packs from Feelz Machine, you are granted a non-exclusive, 
                non-transferable license to:
              </p>
              <ul className="list-disc list-inside text-gray-300 space-y-2 ml-4">
                <li>Use samples in your original music productions</li>
                <li>Modify and process samples for creative purposes</li>
                <li>Release and monetize music containing our samples</li>
              </ul>

              <h3 className="text-lg font-semibold text-cyan-300 mb-2 mt-4">Restrictions</h3>
              <p className="text-gray-300 leading-relaxed">You may NOT:</p>
              <ul className="list-disc list-inside text-gray-300 space-y-2 ml-4">
                <li>Resell, redistribute, or share sample packs with others</li>
                <li>Use samples as standalone audio files (e.g., sound effects in games/videos)</li>
                <li>Register samples with content ID systems</li>
                <li>Claim ownership of original samples</li>
                <li>Reverse engineer or extract samples from other users' music</li>
              </ul>
            </div>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-cyan-400 mb-3">5. Prohibited Conduct</h2>
            <p className="text-gray-300 leading-relaxed mb-3">You agree NOT to:</p>
            <ul className="list-disc list-inside text-gray-300 space-y-2 ml-4">
              <li>Violate any laws or regulations</li>
              <li>Infringe on intellectual property rights</li>
              <li>Upload malicious code or viruses</li>
              <li>Attempt to gain unauthorized access to our systems</li>
              <li>Scrape or automate downloads without permission</li>
              <li>Harass or abuse other users or our staff</li>
              <li>Use the platform for spam or commercial solicitation</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-cyan-400 mb-3">6. Intellectual Property</h2>
            <p className="text-gray-300 leading-relaxed">
              All content on Feelz Machine, including but not limited to sample packs, user interface, 
              graphics, logos, and code, is protected by copyright and other intellectual property laws. 
              Our trademarks and branding may not be used without express permission.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-cyan-400 mb-3">7. User-Generated Content</h2>
            <p className="text-gray-300 leading-relaxed">
              If you submit feedback, suggestions, or other content to us (e.g., through our Discord or 
              feedback system), you grant us a worldwide, perpetual, royalty-free license to use, modify, 
              and incorporate that content into our services.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-cyan-400 mb-3">8. Payment and Subscriptions</h2>
            <p className="text-gray-300 leading-relaxed">
              Currently, Feelz Machine is free to use. If we introduce paid features or subscriptions 
              in the future, we will update these terms and notify users. Any payments will be processed 
              through secure third-party payment processors.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-cyan-400 mb-3">9. Disclaimers and Limitations</h2>
            <div className="space-y-3">
              <div className="p-4 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
                <p className="text-yellow-200 font-semibold mb-2">Important Notice:</p>
                <p className="text-gray-300 leading-relaxed">
                  THE PLATFORM IS PROVIDED "AS IS" WITHOUT WARRANTIES OF ANY KIND. WE DO NOT GUARANTEE 
                  UNINTERRUPTED ACCESS, ERROR-FREE OPERATION, OR THAT SAMPLES WILL MEET YOUR REQUIREMENTS.
                </p>
              </div>

              <p className="text-gray-300 leading-relaxed">
                TO THE MAXIMUM EXTENT PERMITTED BY LAW, FEELZ MACHINE SHALL NOT BE LIABLE FOR ANY 
                INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES ARISING FROM YOUR 
                USE OF THE PLATFORM.
              </p>
            </div>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-cyan-400 mb-3">10. Termination</h2>
            <p className="text-gray-300 leading-relaxed">
              We reserve the right to suspend or terminate your account at any time for violation of 
              these terms. You may also terminate your account by contacting us. Upon termination, 
              your license to use downloaded samples remains valid for previously downloaded content.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-cyan-400 mb-3">11. Changes to Terms</h2>
            <p className="text-gray-300 leading-relaxed">
              We may modify these Terms of Use at any time. Significant changes will be announced on 
              our platform and via email. Continued use of the service after changes constitutes 
              acceptance of the new terms.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-cyan-400 mb-3">12. Governing Law</h2>
            <p className="text-gray-300 leading-relaxed">
              These Terms of Use shall be governed by and construed in accordance with applicable laws. 
              Any disputes shall be resolved through binding arbitration or in courts of competent jurisdiction.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-cyan-400 mb-3">13. Contact Information</h2>
            <p className="text-gray-300 leading-relaxed">
              For questions about these Terms of Use, please contact us:
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

          <section className="border-t border-cyan-500/20 pt-6 mt-8">
            <h2 className="text-2xl font-bold text-cyan-400 mb-3">14. Acknowledgment</h2>
            <p className="text-gray-300 leading-relaxed">
              BY USING FEELZ MACHINE, YOU ACKNOWLEDGE THAT YOU HAVE READ, UNDERSTOOD, AND AGREE TO BE 
              BOUND BY THESE TERMS OF USE AND OUR PRIVACY POLICY.
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

export default TermsOfUse;