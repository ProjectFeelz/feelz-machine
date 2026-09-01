import React from 'react';
import { Helmet } from 'react-helmet-async';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

const COMPANY      = 'Feelz Machine';
const CONTACT      = 'legal@feelzmachine.com';
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

export default function SchoolSessionsTermsPage() {
  const navigate = useNavigate();
  const pageUrl = `${BASE_URL}/schoolsessions/terms`;

  return (
    <div className="min-h-screen bg-black text-white">
      <Helmet>
        <title>School Sessions — Terms & Conditions · Feelz Machine</title>
        <meta name="description" content="Official terms and conditions for the Feelz Machine School Sessions high school competition." />
        <link rel="canonical" href={pageUrl} />
        <meta property="og:title" content="School Sessions — Terms & Conditions" />
        <meta property="og:url" content={pageUrl} />
      </Helmet>

      <div className="sticky top-0 z-10 bg-black/95 backdrop-blur-xl border-b border-white/[0.05] px-4 py-4 flex items-center space-x-3">
        <button onClick={() => navigate(-1)} className="p-1.5 hover:bg-white/[0.06] rounded-lg transition">
          <ArrowLeft className="w-5 h-5 text-white/40" />
        </button>
        <h1 className="text-base font-bold text-white">School Sessions — Terms & Conditions</h1>
      </div>

      <div className="max-w-2xl mx-auto px-5 pt-8 pb-24">
        <p className="text-xs text-white/30 mb-8">Last updated: {LAST_UPDATED}</p>

        <Section title="1. What This Is">
          <p>School Sessions is a competition run by {COMPANY} for high school students in South Africa. Entrants pick a song from a shortlist and submit their own vocal cover performance, solo or as a group, through the {COMPANY} platform.</p>
          <p>Entering School Sessions means you agree to these Terms, in addition to the standard {COMPANY} Terms of Use.</p>
        </Section>

        <Section title="2. Who Can Enter">
          <p>Open to high school students in South Africa, subject to any school allow-list or regional restriction active for the current season. {COMPANY} may verify eligibility and remove entries that don't meet these requirements at any time.</p>
          <p>Entrants under 18 must have a parent or guardian's consent, provided directly at the point of entry. Entries from minors without recorded guardian consent will not be considered.</p>
        </Section>

        <Section title="3. How to Enter">
          <p>Choose a song from the current season's shortlist and record your own vocal performance over it. You may enter solo or as a group. Only entries submitted through the {COMPANY} upload flow, with the School Sessions toggle enabled, are counted.</p>
          <p>One entry per person per season. Group entries must list every member at the time of submission — members can't be added after entries close.</p>
        </Section>

        <Section title="4. Judging & Voting">
          <p>A judging panel selects finalists from all valid entries, and separately decides the competition winner. This decision is final.</p>
          <p>The public vote (announced as "People's Choice") is a separate, parallel recognition and does not determine or override the judges' decision on finalists or the winner.</p>
        </Section>

        <Section title="5. Prizes">
          <p>The total prize pool is R10,000: R5,000 to the winning school, and R5,000 to the winning student, split evenly if the winning entry was a group. {COMPANY} may adjust the prize amount or structure for future seasons; the current season's terms are those in effect when you enter.</p>
          <p>Prizes are paid at {COMPANY}'s reasonable discretion regarding timing and method, and may require the winner (or a guardian, for minors) to provide payment details and identity confirmation before payout. Prizes have no cash-equivalent alternative unless {COMPANY} offers one.</p>
        </Section>

        <Section title="6. Your Entry & Ownership">
          <p>You keep ownership of your own performance. By entering, you grant {COMPANY} a non-exclusive, royalty-free license to host, display, and promote your entry on the {COMPANY} platform and its associated social channels, for as long as reasonably needed to run and promote the competition.</p>
          <p>You're responsible for making sure your entry doesn't infringe anyone else's rights. Entries are covers submitted specifically for this non-commercial competition context — that doesn't transfer any rights in the original song itself, which remain with its rightful owners.</p>
        </Section>

        <Section title="7. Conduct & Disqualification">
          <p>{COMPANY} may disqualify any entry, at any stage, for: providing false information (including about age, school, or identity), plagiarism or misrepresenting someone else's performance as your own, offensive or harmful content, or any attempt to manipulate voting.</p>
        </Section>

        <Section title="8. Changes to the Competition">
          <p>{COMPANY} may change the shortlist, timeline, prize details, or any other aspect of School Sessions before entries close, and may cancel or postpone a season if necessary. Where reasonably possible, we'll communicate material changes on the School Sessions page.</p>
        </Section>

        <Section title="9. Disclaimers & Limitation of Liability">
          <p>School Sessions is provided "as is." {COMPANY} doesn't guarantee the competition will run on any particular schedule, or that any given entry will be reviewed, featured, or responded to individually.</p>
          <p>To the maximum extent permitted by applicable law, {COMPANY} isn't liable for indirect, incidental, or consequential damages arising from your participation in School Sessions.</p>
        </Section>

        <Section title="10. Governing Law">
          <p>These Terms are governed by the laws of South Africa. Disputes will be resolved through good faith negotiation where possible. Nothing in these Terms affects your statutory rights under applicable consumer protection legislation.</p>
        </Section>

        <Section title="11. Contact">
          <p>Questions about School Sessions or these Terms can be sent to <strong className="text-white/70">{CONTACT}</strong>.</p>
        </Section>
      </div>
    </div>
  );
}