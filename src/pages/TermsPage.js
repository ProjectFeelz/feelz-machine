import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, ChevronDown, ChevronUp } from 'lucide-react';

const LAST_UPDATED = 'March 2026';
const PLATFORM_NAME = 'Feelz Machine';
const COMPANY = 'Project Feelz';
const CONTACT_EMAIL = 'legal@projectfeelz.com';

function Section({ title, children }) {
  const [open, setOpen] = useState(true);
  return (
    <div className="border border-white/[0.06] rounded-xl overflow-hidden mb-3">
      <button onClick={() => setOpen(p => !p)}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-white/[0.02] transition text-left">
        <h2 className="text-sm font-semibold text-white">{title}</h2>
        {open ? <ChevronUp className="w-4 h-4 text-white/30 flex-shrink-0" /> : <ChevronDown className="w-4 h-4 text-white/30 flex-shrink-0" />}
      </button>
      {open && (
        <div className="px-5 pb-5 text-sm text-white/50 leading-relaxed space-y-3">
          {children}
        </div>
      )}
    </div>
  );
}

export default function TermsPage() {
  const navigate = useNavigate();
  return (
    <div className="min-h-screen bg-black text-white pt-14 md:pt-0 pb-32">
      <div className="max-w-2xl mx-auto px-4">
        {/* Header */}
        <div className="flex items-center space-x-3 py-6 mb-2">
          <button onClick={() => navigate(-1)} className="p-2 -ml-2 hover:bg-white/[0.05] rounded-lg transition">
            <ArrowLeft className="w-5 h-5 text-white/40" />
          </button>
          <div>
            <h1 className="text-xl font-bold text-white">Terms of Service &amp; Legal Policies</h1>
            <p className="text-xs text-white/30 mt-0.5">Last updated: {LAST_UPDATED}</p>
          </div>
        </div>

        {/* Intro */}
        <div className="rounded-xl p-4 mb-6 border border-white/[0.05]" style={{ backgroundColor: 'rgba(255,255,255,0.02)' }}>
          <p className="text-sm text-white/50 leading-relaxed">
            By accessing or using {PLATFORM_NAME} ("the Platform") you agree to these Terms of Service. If you do not agree, do not use the Platform.
            These terms govern all users including listeners, artists, and visitors.
          </p>
        </div>

        <Section title="1. Platform Description">
          <p>
            {PLATFORM_NAME} is an independent music hosting and distribution platform operated by {COMPANY}. We provide infrastructure that allows
            artists to upload, publish, and monetise their music, and allows listeners to stream and purchase music directly from those artists.
          </p>
          <p>
            {COMPANY} acts solely as a <strong className="text-white/70">technology host and facilitator</strong>. We do not produce, commission, own,
            or claim any rights over any music, lyrics, artwork, or other creative content uploaded by artists.
          </p>
        </Section>

        <Section title="2. User-Generated Content & DMCA Safe Harbour">
          <p>
            All music, lyrics, artwork, samples, and other content on the Platform is uploaded exclusively by registered artists and users.
            {COMPANY} does not review, curate, or endorse any uploaded content prior to publication.
          </p>
          <p>
            <strong className="text-white/70">Copyright Responsibility:</strong> By uploading content to the Platform, each artist and user represents
            and warrants that they hold all necessary rights, licences, and permissions to upload, distribute, and monetise that content on the Platform.
            Artists are solely and exclusively responsible for ensuring that their uploads do not infringe any third-party intellectual property rights
            including copyrights, trademarks, performance rights, and synchronisation rights.
          </p>
          <p>
            <strong className="text-white/70">DMCA Safe Harbour:</strong> {PLATFORM_NAME} qualifies as a service provider under the Digital Millennium
            Copyright Act (DMCA), 17 U.S.C. § 512, and equivalent legislation in other jurisdictions including the EU Directive on Copyright in the
            Digital Single Market (Article 17 / formerly Article 13). We are not liable for infringing content uploaded by users where we:
          </p>
          <ul className="list-disc pl-5 space-y-1">
            <li>Did not have actual knowledge of the infringing material;</li>
            <li>Upon obtaining such knowledge, acted expeditiously to remove or disable access to the material;</li>
            <li>Do not receive a direct financial benefit attributable to the infringing activity where we have the right and ability to control it.</li>
          </ul>
          <p>
            <strong className="text-white/70">Takedown Notice:</strong> If you believe content on the Platform infringes your copyright, please send
            a formal DMCA takedown notice to <span className="text-white/70">{CONTACT_EMAIL}</span> including: (a) identification of the copyrighted
            work; (b) identification of the allegedly infringing material and its location on the Platform; (c) your contact information; (d) a statement
            of good faith belief; (e) a statement of accuracy under penalty of perjury; and (f) your physical or electronic signature. We will respond
            expeditiously.
          </p>
          <p>
            <strong className="text-white/70">Indemnification:</strong> Each artist and user agrees to indemnify, defend, and hold harmless {COMPANY},
            its officers, directors, employees, agents, and affiliates from and against any and all claims, liabilities, damages, losses, costs, and
            expenses (including reasonable legal fees) arising out of or related to: (i) content they upload or publish on the Platform; (ii) their
            violation of these Terms; or (iii) their infringement of any third-party rights including intellectual property rights. {COMPANY} shall not
            be liable to any third party for copyright infringement or any other intellectual property violation committed by users of the Platform.
          </p>
        </Section>

        <Section title="3. No Ownership Claim by the Platform">
          <p>
            {COMPANY} claims <strong className="text-white/70">no ownership, authorship, or intellectual property rights</strong> over any music,
            artwork, lyrics, samples, or other creative works uploaded to the Platform. Artists retain full ownership of their content.
          </p>
          <p>
            By uploading content, artists grant {COMPANY} a limited, non-exclusive, royalty-free licence solely to host, display, stream, and
            distribute the content to users of the Platform for the purpose of operating the service. This licence terminates when the content is
            removed from the Platform. {COMPANY} does not sub-licence, sell, or transfer ownership of any artist content to any third party.
          </p>
          <p>
            {COMPANY} does not collect or retain any portion of royalties, streaming revenue, or download sales revenue generated through third-party
            rights organisations (PROs, CMOs) on behalf of artists. Any platform service fees charged are solely for hosting and technology services.
          </p>
        </Section>

        <Section title="4. Prohibited Content">
          <p>Users must not upload content that:</p>
          <ul className="list-disc pl-5 space-y-1">
            <li>Infringes any copyright, trademark, or other intellectual property right;</li>
            <li>Contains unlicensed samples or interpolations without appropriate clearance;</li>
            <li>Promotes illegal activity, violence, or hatred;</li>
            <li>Contains content involving minors in a sexual context;</li>
            <li>Constitutes defamation, harassment, or invasion of privacy;</li>
            <li>Violates any applicable law or regulation.</li>
          </ul>
          <p>
            Violation of these prohibitions may result in immediate content removal, account suspension, and referral to relevant authorities where
            required by law.
          </p>
        </Section>

        <Section title="5. Streaming & Listening Limits">
          <p>
            Free music designated by the artist as free-to-stream may be listened to an unlimited number of times by any user, for as long as the
            artist keeps it designated as free. Artists may change this designation at any time at their sole discretion.
          </p>
          <p>
            Music designated by the artist as paid or download-only content may be previewed up to <strong className="text-white/70">5 times</strong> per
            track by a listener before a purchase prompt is displayed. To continue listening after 5 plays, the listener must purchase the track or album
            at the price set by the artist. This limit is enforced at the device level and is not a guarantee of complete copy protection.
          </p>
        </Section>

        <Section title="6. Payments & Refunds">
          <p>
            Purchases are processed via PayPal. {COMPANY} does not store payment card details. All transactions are subject to PayPal's terms of service.
          </p>
          <p>
            All sales of digital downloads are <strong className="text-white/70">final and non-refundable</strong> once the download has been delivered,
            due to the nature of digital goods. Refund requests for failed or duplicate transactions should be directed to {CONTACT_EMAIL} within 7 days.
          </p>
          <p>
            Artist tier subscriptions (Pro, Premium) are billed periodically or granted by admin. Cancellation takes effect at the end of the current
            billing period.
          </p>
        </Section>

        <Section title="7. Platform Liability Limitations">
          <p>
            To the maximum extent permitted by applicable law, {COMPANY} and its affiliates, officers, employees, and licensors shall not be liable for:
          </p>
          <ul className="list-disc pl-5 space-y-1">
            <li>Any indirect, incidental, special, consequential, or punitive damages;</li>
            <li>Loss of profits, revenue, data, goodwill, or other intangible losses;</li>
            <li>Damages arising from user-uploaded content including copyright infringement;</li>
            <li>Interruption or cessation of the Platform;</li>
            <li>Unauthorised access to or alteration of your data.</li>
          </ul>
          <p>
            {COMPANY}'s total aggregate liability to any user for any claims arising under these Terms shall not exceed the greater of (a) the amount
            paid by that user to {COMPANY} in the 12 months preceding the claim or (b) USD $100.
          </p>
        </Section>

        <Section title="8. Privacy">
          <p>
            We collect limited personal data necessary to operate the Platform including account registration data, usage analytics, and payment
            transaction records (processed by PayPal — we do not receive full payment details). We do not sell user data to third parties.
          </p>
          <p>
            For users in the European Economic Area, your data is processed on the basis of contract performance and legitimate interests.
            You have the right to access, correct, and delete your personal data. Contact {CONTACT_EMAIL} for data requests.
          </p>
        </Section>

        <Section title="9. Governing Law & Disputes">
          <p>
            These Terms are governed by and construed in accordance with the laws of the Republic of South Africa, without regard to conflict of law
            principles. Any disputes shall first be subject to good faith negotiation, and if unresolved, submitted to binding arbitration or the
            competent courts of South Africa.
          </p>
          <p>
            If any provision of these Terms is found to be unenforceable, the remaining provisions shall continue in full force and effect.
          </p>
        </Section>

        <Section title="10. Changes to These Terms">
          <p>
            We reserve the right to update these Terms at any time. Changes will be posted on this page with an updated date. Continued use of the
            Platform after changes constitutes acceptance of the revised Terms.
          </p>
        </Section>

        {/* Footer */}
        <div className="mt-8 py-6 border-t border-white/[0.06] text-center">
          <p className="text-xs text-white/20">
            Questions about these terms? Contact us at{' '}
            <a href={`mailto:${CONTACT_EMAIL}`} className="text-white/40 hover:text-white/60 transition">{CONTACT_EMAIL}</a>
          </p>
          <p className="text-xs text-white/15 mt-2">© {new Date().getFullYear()} {COMPANY}. All rights reserved.</p>
        </div>
      </div>
    </div>
  );
}
