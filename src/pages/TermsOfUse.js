import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

const COMPANY     = 'Feelz Machine';
const CONTACT     = 'legal@feelzmachine.com';
const LAST_UPDATED = 'May 2026';

function Section({ title, children }) {
  return (
    <section className="mb-8">
      <h2 className="text-base font-bold text-white mb-3 pb-2 border-b border-white/[0.06]">{title}</h2>
      <div className="space-y-3 text-sm text-white/55 leading-relaxed">{children}</div>
    </section>
  );
}

export default function TermsOfUse() {
  const navigate = useNavigate();
  return (
    <div className="min-h-screen bg-black text-white">
      <div className="sticky top-0 z-10 bg-black/95 backdrop-blur-xl border-b border-white/[0.05] px-4 py-4 flex items-center space-x-3">
        <button onClick={() => navigate(-1)} className="p-1.5 hover:bg-white/[0.06] rounded-lg transition">
          <ArrowLeft className="w-5 h-5 text-white/40" />
        </button>
        <h1 className="text-base font-bold text-white">Terms of Use</h1>
      </div>

      <div className="max-w-2xl mx-auto px-5 pt-8 pb-24">
        <p className="text-xs text-white/30 mb-8">Last updated: {LAST_UPDATED}</p>

        <Section title="1. About These Terms">
          <p>These Terms of Use govern your access to and use of {COMPANY} ("we", "us", "our", "the Platform"), a music streaming and distribution platform. By creating an account or using the Platform in any way, you agree to these terms in full. If you do not agree, do not use the Platform.</p>
          <p>We may update these Terms from time to time. Continued use of the Platform after changes are posted constitutes acceptance of the updated Terms.</p>
        </Section>

        <Section title="2. Eligibility">
          <p>You must be at least 13 years of age to use this Platform. By registering, you confirm that you meet this requirement. Users under 18 should review these Terms with a parent or guardian.</p>
          <p>You may not use this Platform if you have previously been suspended or removed from it.</p>
        </Section>

        <Section title="3. Your Account">
          <p>You are responsible for maintaining the security of your account credentials and for all activity that occurs under your account. Notify us immediately at {CONTACT} if you suspect unauthorised access.</p>
          <p>You agree to provide accurate information when registering and to keep it updated. Accounts using false information may be suspended.</p>
        </Section>

        <Section title="4. Content You Upload — Artist Rights & Licence">
          <p><strong className="text-white/70">You retain ownership</strong> of all music, videos, images, lyrics, artwork, and other content ("Your Content") that you upload to the Platform. We do not claim ownership of Your Content.</p>
          <p><strong className="text-white/70">Licence to us:</strong> By uploading content, you grant {COMPANY} a worldwide, non-exclusive, royalty-free, sublicensable licence to host, store, reproduce, distribute, display, stream, and promote Your Content solely for the purpose of operating and improving the Platform. This includes displaying your content in our algorithmic For You discovery feed, search results, featured sections, and promotional materials about the Platform.</p>
          <p><strong className="text-white/70">You warrant that:</strong> (a) you own or have all necessary rights, licences, and permissions for Your Content; (b) Your Content does not infringe any third party's intellectual property, privacy, or other rights; (c) any music videos, story videos, or audiovisual content you upload do not include samples, compositions, or recordings owned by third parties without the appropriate synchronisation and master licences.</p>
          <p><strong className="text-white/70">Video uploads:</strong> When you upload a music video (MP4), you warrant that you hold the master recording rights and synchronisation rights for all audio and visual elements contained in the file, or have obtained all required licences from the rights holders.</p>
          <p><strong className="text-white/70">For You Feed discovery:</strong> Published tracks and content are eligible for distribution to all users through our algorithmic recommendation system. By publishing content, you consent to this form of distribution within the Platform.</p>
          <p><strong className="text-white/70">Removal:</strong> You may delete Your Content at any time from your dashboard. Upon deletion, we will remove it from active distribution, though residual copies in backups may persist for a limited period.</p>
        </Section>

        <Section title="5. Content You Upload — Prohibited Content">
          <p>You may not upload content that: (a) infringes any third party's intellectual property rights; (b) contains illegal material, including child sexual abuse material; (c) promotes violence, hatred, or discrimination; (d) contains malware or harmful code; (e) violates any applicable law or regulation.</p>
          <p>We reserve the right to remove any content that violates these Terms or our community standards without notice.</p>
        </Section>

        <Section title="6. DMCA & Copyright Takedown">
          <p>We respect intellectual property rights. If you believe content on the Platform infringes your copyright, please send a takedown notice to {CONTACT} including: (a) identification of the copyrighted work; (b) identification of the infringing material and its location on the Platform; (c) your contact information; (d) a statement that you have a good faith belief the use is not authorised; (e) a statement of accuracy under penalty of perjury; (f) your signature.</p>
          <p>We will process valid notices promptly. Repeat infringers will have their accounts terminated.</p>
          <p>If your content was removed in error, you may submit a counter-notice to {CONTACT}. We are not liable for content removed in good faith response to a takedown notice.</p>
        </Section>

        <Section title="7. Streaming, Downloads & Purchases">
          <p>Free-tier music may be streamed an unlimited number of times by any user, for as long as the artist keeps it designated as free.</p>
          <p>Music designated as paid or download-only may be previewed up to <strong className="text-white/70">5 times</strong> per track before a purchase prompt appears. To continue listening after 5 plays, the listener must purchase the track or album at the price set by the artist.</p>
          <p>All purchases are final. We do not offer refunds for digital content once it has been downloaded or streamed beyond the preview limit. Exceptions may be made at our discretion for technical failures.</p>
        </Section>

        <Section title="8. Revenue, Splits & Payouts">
          <p>Artists set their own prices for downloadable content. {COMPANY} processes payments via PayPal and retains a platform fee as disclosed at the time of transaction.</p>
          <p><strong className="text-white/70">Revenue Splits:</strong> Where an artist designates collaborators with agreed split percentages, the Platform processes revenue splits automatically at the time of purchase. Split payments are disbursed directly to each collaborator's PayPal account. {COMPANY} is not responsible for incorrect PayPal details, failed disbursements due to inactive accounts, or disputes between collaborating artists regarding agreed splits.</p>
          <p>Artists are responsible for their own tax obligations arising from income earned through the Platform.</p>
        </Section>

        <Section title="9. Artist Tiers & Subscriptions">
          <p>Artists may subscribe to Pro or Premium tiers which unlock additional Platform features. Tier features are as described in the Platform at the time of subscription. We reserve the right to modify tier features with reasonable notice.</p>
          <p>Subscription fees are non-refundable except where required by applicable consumer protection law. You may cancel at any time; cancellation takes effect at the end of the current billing period.</p>
          <p>Per-song analytics, detailed listener demographics, and advanced reporting are available to Pro and Premium subscribers only.</p>
        </Section>

        <Section title="10. Collaborative Playlists">
          <p>The Platform allows users to create collaborative playlists and add tracks to them. Adding a track to a playlist is an internal Platform feature and does not constitute redistribution, resale, or any transfer of rights in the underlying recording. Playlist functionality is governed by the same licence granted in Section 4.</p>
        </Section>

        <Section title="11. Stories & Short-Form Video">
          <p>Artists may upload short-form video stories and tag music to play alongside them. By tagging a track to a story video, the artist represents that they hold both the master recording rights and the synchronisation rights for the combination of audio and visual content, or have obtained all required licences.</p>
          <p>Stories expire after 24 hours. We are not responsible for any content in stories that violates third-party rights.</p>
        </Section>

        <Section title="12. User-Generated Content — Listeners">
          <p>Listeners may post comments on tracks and interact with artists. Comments must not contain harassment, hate speech, spam, or illegal content. We may remove comments and suspend accounts that violate these standards.</p>
        </Section>

        <Section title="13. Platform Analytics & Data">
          <p>We collect streaming data, device information, and engagement metrics to provide artists with analytics about their content's performance. This data is used to operate the Platform, power the recommendation algorithm, and provide per-track analytics to artists. See our Privacy Policy for full details.</p>
        </Section>

        <Section title="14. Prohibited Uses">
          <p>You may not: (a) use bots, scripts, or automated tools to artificially inflate stream counts, follower counts, or engagement metrics; (b) attempt to gain unauthorised access to other accounts or Platform systems; (c) scrape or harvest Platform data without permission; (d) use the Platform to transmit spam; (e) attempt to reverse engineer the Platform.</p>
          <p>We use automated and manual systems to detect fraud. Accounts found manipulating metrics will be suspended and may have earnings reversed.</p>
        </Section>

        <Section title="15. Termination">
          <p>We may suspend or terminate your account at any time for breach of these Terms. You may delete your account at any time from your profile settings. Upon deletion, your public profile and content will be removed from active circulation.</p>
        </Section>

        <Section title="16. Disclaimers & Limitation of Liability">
          <p>The Platform is provided "as is" without warranties of any kind, express or implied. We do not warrant that the Platform will be uninterrupted, error-free, or that content will be preserved indefinitely.</p>
          <p>To the maximum extent permitted by applicable law, {COMPANY} shall not be liable for indirect, incidental, special, or consequential damages arising from your use of the Platform, including loss of revenue, data, or goodwill.</p>
          <p>Our total liability to you for any claim shall not exceed the amount you paid to us in the 12 months preceding the claim.</p>
        </Section>

        <Section title="17. Governing Law">
          <p>These Terms are governed by applicable law. Disputes will be resolved through good faith negotiation where possible. If you are a consumer, nothing in these Terms affects your statutory rights under applicable consumer protection legislation.</p>
        </Section>

        <Section title="18. Contact">
          <p>For legal notices, copyright takedown requests, or questions about these Terms, contact us at <strong className="text-white/70">{CONTACT}</strong>.</p>
        </Section>
      </div>
    </div>
  );
}