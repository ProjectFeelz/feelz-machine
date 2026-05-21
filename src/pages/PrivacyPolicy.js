import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

const COMPANY      = 'Feelz Machine';
const CONTACT      = 'privacy@feelzmachine.com';
const LAST_UPDATED = 'May 2026';

function Section({ title, children }) {
  return (
    <section className="mb-8">
      <h2 className="text-base font-bold text-white mb-3 pb-2 border-b border-white/[0.06]">{title}</h2>
      <div className="space-y-3 text-sm text-white/55 leading-relaxed">{children}</div>
    </section>
  );
}

export default function PrivacyPolicy() {
  const navigate = useNavigate();
  return (
    <div className="min-h-screen bg-black text-white">
      <div className="sticky top-0 z-10 bg-black/95 backdrop-blur-xl border-b border-white/[0.05] px-4 py-4 flex items-center space-x-3">
        <button onClick={() => navigate(-1)} className="p-1.5 hover:bg-white/[0.06] rounded-lg transition">
          <ArrowLeft className="w-5 h-5 text-white/40" />
        </button>
        <h1 className="text-base font-bold text-white">Privacy Policy</h1>
      </div>

      <div className="max-w-2xl mx-auto px-5 pt-8 pb-24">
        <p className="text-xs text-white/30 mb-8">Last updated: {LAST_UPDATED}</p>

        <Section title="1. Who We Are">
          <p>{COMPANY} is a music streaming and distribution platform. This Privacy Policy explains how we collect, use, and protect your personal data when you use our service at feelzmachine.com.</p>
          <p>For privacy-related questions or requests, contact us at <strong className="text-white/70">{CONTACT}</strong>.</p>
        </Section>

        <Section title="2. Data We Collect">
          <p><strong className="text-white/70">Account data:</strong> When you sign up, we collect your email address and, if you sign in with Google, your Google profile name and profile image. We do not store your Google password.</p>
          <p><strong className="text-white/70">Artist profile data:</strong> If you create an artist profile, we store your artist name, bio, profile image, cover art, social media links, and any other information you voluntarily add to your profile.</p>
          <p><strong className="text-white/70">Uploaded content:</strong> We store all files you upload including audio tracks, album artwork, music videos (MP4), story media, and lyrics. This content is stored on Supabase cloud storage infrastructure.</p>
          <p><strong className="text-white/70">Streaming & engagement data:</strong> When you or others stream your tracks, we record the stream event including: timestamp, device type (mobile or desktop), duration played, whether the track was completed, and the platform used. This data powers artist analytics and our recommendation algorithm.</p>
          <p><strong className="text-white/70">Interaction data:</strong> Likes, follows, playlist additions, comments, story reactions, and collab requests are stored and linked to your account.</p>
          <p><strong className="text-white/70">Payment data:</strong> Purchase transactions are processed through PayPal. We do not store your card numbers or full PayPal credentials. We store transaction IDs, amounts, and payout records for accounting and dispute resolution purposes.</p>
          <p><strong className="text-white/70">Usage data:</strong> We collect standard web analytics including pages visited, session duration, and referring URLs to understand how the Platform is used and to improve it.</p>
          <p><strong className="text-white/70">Device & technical data:</strong> Browser type, operating system, IP address, and device identifiers may be collected for security, fraud prevention, and analytics purposes.</p>
          <p><strong className="text-white/70">Notifications:</strong> If you grant push notification permission, we store your push subscription token to deliver notifications about new music from artists you follow, platform updates, and engagement activity.</p>
        </Section>

        <Section title="3. How We Use Your Data">
          <p><strong className="text-white/70">To operate the Platform:</strong> Providing you with access to your account, streaming music, processing purchases, and delivering core features.</p>
          <p><strong className="text-white/70">Artist analytics:</strong> Providing artists with per-track stream counts, likes, completion rates, device breakdowns, and time-series data about their content's performance. This analytics data is visible only to the artist who owns the content and to platform administrators.</p>
          <p><strong className="text-white/70">Recommendation algorithm:</strong> Stream counts, engagement scores, follows, and listening history are used to personalise the For You feed for each user. The algorithm surfaces music from artists you follow and discovers new artists based on your listening patterns.</p>
          <p><strong className="text-white/70">Content discovery:</strong> Published tracks, albums, and artist profiles are indexed and made discoverable across the Platform including search, browse, and algorithmic feeds.</p>
          <p><strong className="text-white/70">Notifications:</strong> If you opt in to push notifications, we send you alerts about new releases from artists you follow, competition results, and platform activity relevant to your account.</p>
          <p><strong className="text-white/70">Security & fraud prevention:</strong> We analyse usage patterns to detect and prevent fake streams, bot activity, and account abuse.</p>
          <p><strong className="text-white/70">Legal compliance:</strong> We may process your data to comply with applicable laws or to respond to lawful requests from authorities.</p>
        </Section>

        <Section title="4. What Is Publicly Visible">
          <p>Your artist profile — including your artist name, bio, profile image, published tracks, albums, playlists, collaboration credits, and follower count — is publicly visible to anyone who visits {COMPANY}.</p>
          <p>Track comments you post are visible to all users on that track. Story content you upload is visible to your followers for 24 hours.</p>
          <p>Your email address, payment details, private messages, moderation records, and analytics data are never made public.</p>
          <p>Your listening history and personal playlist contents are private to you.</p>
        </Section>

        <Section title="5. Data Sharing">
          <p>We do not sell your personal data to third parties.</p>
          <p><strong className="text-white/70">Service providers:</strong> We share data with the following third-party services that power the Platform:</p>
          <p>— <strong className="text-white/70">Supabase</strong> (database and file storage) — stores all platform data and uploaded files<br/>
          — <strong className="text-white/70">Netlify</strong> (hosting and serverless functions) — hosts the Platform<br/>
          — <strong className="text-white/70">PayPal</strong> (payments) — processes all purchase transactions<br/>
          — <strong className="text-white/70">Resend</strong> (email) — sends transactional emails and newsletters<br/>
          — <strong className="text-white/70">Anthropic Claude API</strong> (AI features) — used in certain platform features; no personal data is sent to this service beyond what is necessary for the specific feature</p>
          <p><strong className="text-white/70">Legal requirements:</strong> We may disclose your data if required by law, court order, or to protect the rights and safety of our users or the public.</p>
        </Section>

        <Section title="6. Data Retention">
          <p>We retain your account data and uploaded content for as long as your account is active. If you delete your account, we will delete your personal data and remove your public profile and content from active circulation within a reasonable period. Some residual data may remain in encrypted backups for up to 90 days.</p>
          <p>Stream and analytics data may be retained in anonymised or aggregated form after account deletion for platform analytics purposes.</p>
          <p>Transaction records are retained for 7 years for accounting and legal compliance purposes.</p>
        </Section>

        <Section title="7. Security">
          <p>We implement industry-standard security measures including encrypted data transmission (HTTPS), database-level row security policies, and access controls. Sensitive operations are handled server-side through Netlify Functions rather than client-side code.</p>
          <p>No system is completely secure. We cannot guarantee that your data will never be accessed without authorisation, and we encourage you to use a strong, unique password for your account.</p>
        </Section>

        <Section title="8. Cookies & Local Storage">
          <p>We use browser local storage to maintain your session, remember preferences (such as your last viewed tab or playback settings), and store your daily login streak. We do not use third-party advertising cookies.</p>
          <p>If you use Google Sign-In, Google may set cookies in accordance with Google's own privacy policy.</p>
        </Section>

        <Section title="9. Children's Privacy">
          <p>The Platform is not directed at children under 13. We do not knowingly collect personal data from children under 13. If we become aware that a child under 13 has provided personal data, we will delete it promptly. If you believe we have data from a child under 13, contact us at {CONTACT}.</p>
        </Section>

        <Section title="10. Your Rights">
          <p>Depending on your location, you may have the right to: access the personal data we hold about you; request correction of inaccurate data; request deletion of your data; object to or restrict certain processing; and receive your data in a portable format.</p>
          <p>To exercise any of these rights, contact us at <strong className="text-white/70">{CONTACT}</strong>. We will respond within 30 days. We may need to verify your identity before processing your request.</p>
          <p>You may delete your account and all associated data at any time from your profile settings.</p>
        </Section>

        <Section title="11. International Data Transfers">
          <p>Your data may be processed in countries outside your own by our service providers (Supabase, Netlify, PayPal). These providers maintain appropriate safeguards for international data transfers. By using the Platform, you consent to these transfers.</p>
        </Section>

        <Section title="12. Changes to This Policy">
          <p>We may update this Privacy Policy from time to time. When we make material changes, we will update the "Last updated" date at the top. Continued use of the Platform after changes are posted constitutes acceptance of the updated Policy.</p>
        </Section>

        <Section title="13. Contact">
          <p>For privacy-related queries, data subject requests, or concerns about how we handle your data, contact us at <strong className="text-white/70">{CONTACT}</strong>.</p>
        </Section>
      </div>
    </div>
  );
}