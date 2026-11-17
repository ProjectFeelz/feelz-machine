import { Helmet } from 'react-helmet-async';
import React from 'react';

import useGoBack from '../hooks/useGoBack';
import { ArrowLeft } from 'lucide-react';

const COMPANY     = 'Feelz Machine';
const CONTACT     = 'legal@projectfeelz.com';
const LAST_UPDATED = 'November 2026';

function Section({ title, children }) {
  return (
    <section className="mb-8">
      <h2 className="text-base font-bold text-white mb-3 pb-2 border-b border-white/[0.06]">{title}</h2>
      <div className="space-y-3 text-sm text-white/55 leading-relaxed">{children}</div>
    </section>
  );
}

export default function TermsOfUse() {
  // Back that works on a cold deep link. navigate(-1) does nothing when
  // this page IS the first history entry, which is every shared link and
  // every tapped push notification. See src/hooks/useGoBack.js.
  const goBack = useGoBack('/hub');
  return (
    <div className="min-h-screen bg-black text-white">

      {/* Without these, this page inherited index.html's canonical, which points
          at the homepage, so the sitemap submitted the page for indexing while
          the page itself told Google it WAS the homepage. Google settles that by
          dropping the page: "Alternate page with proper canonical tag". */}
      <Helmet>
        <title>Terms of Use · Feelz Machine</title>
        <meta name="description" content="The terms covering use of Feelz Machine: accounts, uploads, royalties, downloads and payouts." />
        <link rel="canonical" href="https://www.feelzmachine.com/terms-of-use" />
        <meta property="og:type" content="website" />
        <meta property="og:url" content="https://www.feelzmachine.com/terms-of-use" />
        <meta property="og:title" content="Terms of Use · Feelz Machine" />
        <meta property="og:description" content="The terms covering use of Feelz Machine: accounts, uploads, royalties, downloads and payouts." />
        <meta name="twitter:title" content="Terms of Use · Feelz Machine" />
        <meta name="twitter:description" content="The terms covering use of Feelz Machine: accounts, uploads, royalties, downloads and payouts." />
      </Helmet>
      <div className="sticky top-0 z-10 bg-black/95 backdrop-blur-xl border-b border-white/[0.05] px-4 py-4 flex items-center space-x-3">
        <button onClick={() => goBack()} className="p-1.5 hover:bg-white/[0.06] rounded-lg transition">
          <ArrowLeft className="w-5 h-5 text-white/40" />
        </button>
        <h1 className="text-base font-bold text-white">Terms of Use</h1>
      </div>

      <div className="max-w-2xl mx-auto px-5 pt-8 pb-24">
        <p className="text-xs text-white/30 mb-8">Last updated: {LAST_UPDATED}</p>

        <Section title="1. About These Terms">
          <p>These Terms of Use govern your access to and use of {COMPANY} ("we", "us", "our", "the Platform"), a music streaming and distribution platform and an app of Project Feelz, based in South Africa. By creating an account or using the Platform in any way, you agree to these terms in full. If you do not agree, do not use the Platform.</p>
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

        <Section title="4. Content You Upload: Artist Rights & Licence">
          <p><strong className="text-white/70">You retain ownership</strong> of all music, videos, images, lyrics, artwork, and other content ("Your Content") that you upload to the Platform. We do not claim ownership of Your Content.</p>
          <p><strong className="text-white/70">Licence to us:</strong> By uploading content, you grant {COMPANY} a worldwide, non-exclusive, royalty-free, sublicensable licence to host, store, reproduce, distribute, display, stream, and promote Your Content solely for the purpose of operating and improving the Platform. This includes displaying your content in our algorithmic For You discovery feed, search results, featured sections, and promotional materials about the Platform.</p>
          <p><strong className="text-white/70">You warrant that:</strong> (a) you own or have all necessary rights, licences, and permissions for Your Content; (b) Your Content does not infringe any third party's intellectual property, privacy, or other rights; (c) any music videos, story videos, or audiovisual content you upload do not include samples, compositions, or recordings owned by third parties without the appropriate synchronisation and master licences.</p>
          <p><strong className="text-white/70">Video uploads:</strong> When you upload a music video (MP4), you warrant that you hold the master recording rights and synchronisation rights for all audio and visual elements contained in the file, or have obtained all required licences from the rights holders.</p>
          <p><strong className="text-white/70">For You Feed discovery:</strong> Published tracks and content are eligible for distribution to all users through our algorithmic recommendation system. By publishing content, you consent to this form of distribution within the Platform.</p>
          <p><strong className="text-white/70">Removal:</strong> You may delete Your Content at any time from your dashboard. Upon deletion, we will remove it from active distribution, though residual copies in backups may persist for a limited period.</p>
        </Section>

        <Section title="5. Content You Upload: Prohibited Content">
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
          <p>All purchases are final. Refunds are not offered for digital content once it has been downloaded or streamed beyond the preview limit. If a purchase fails for a technical reason, contact us and we will sort out access; a refund of the payment itself is made by the artist who received it (see Section 8).</p>
        </Section>

        <Section title="8. Sales, Splits & Payments">
          <p><strong className="text-white/70">Paid directly.</strong> Artists set their own prices. When a fan buys a track, album or beat licence, the payment goes straight into the selling artist's own PayPal account at the moment of purchase. {COMPANY} does not receive, hold or forward the money from a sale and takes no commission on it.</p>
          <p><strong className="text-white/70">Processing fee.</strong> PayPal charges a fee on every payment. A processing charge is added at checkout so that the artist receives the price they set, and the buyer sees the artist's price and the processing charge separately before paying. {COMPANY} keeps none of it.</p>
          <p><strong className="text-white/70">PayPal required to sell.</strong> An artist must add a PayPal email in Payment Settings before their music can be bought. Until then, purchases are declined and no one is charged. Artists are responsible for keeping those details correct and for any account restrictions PayPal applies.</p>
          <p><strong className="text-white/70">Collaborator splits.</strong> On a track or album with accepted collaborators, the buyer pays the owner of the track or album. {COMPANY} records each collaborator's agreed share of every sale, calculated on what the owner actually received after PayPal's fee, and notifies both artists. The owner is responsible for paying their collaborators. {COMPANY} is not a party to that payment and is not responsible for disputes between collaborators. Only the owner can add a collaborator, and a split only applies once the collaborator has accepted it; if the owner changes an accepted split, the collaborator must accept it again.</p>
          <p><strong className="text-white/70">Refunds and disputes.</strong> Because the artist receives the payment, a refund, chargeback or PayPal dispute is between the buyer, PayPal and the artist. We will help where we can with records of the sale.</p>
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

        <Section title="12. User-Generated Content: Listeners">
          <p>Listeners may post comments on tracks and interact with artists. Comments must not contain harassment, hate speech, spam, or illegal content. We may remove comments and suspend accounts that violate these standards.</p>
        </Section>

        <Section title="13. Feelz Games">
          <p><strong className="text-white/70">What they are.</strong> Feelz Games, starting with Feelz Run, are games played to music on {COMPANY}. You can play as a guest, with your progress kept only on your device, or signed in, with your progress saved to your account.</p>
          <p><strong className="text-white/70">Points, credits and items.</strong> XP, RP, credits, skills, outfits, dances, journal pages and anything else you earn or unlock in a game are part of the game. They have no cash value. They cannot be sold, transferred, moved between accounts or paid out. We may change how they are earned, what things cost and what they unlock, and we may remove any that were earned by cheating or by mistake.</p>
          <p><strong className="text-white/70">Money off music.</strong> Where an artist allows it, you can use game credits for a voucher that takes money off that artist's song. The artist sets the discount and it comes off the artist's own price. A voucher is not cash and cannot be exchanged for cash.</p>
          <p><strong className="text-white/70">Leaderboards.</strong> Runs posted while you are signed in appear on public leaderboards with your display name and score. Your email address is never shown.</p>
          <p><strong className="text-white/70">Online co-op.</strong> Up to six people can play one mission together by sharing a game code. While a game is running, the players in it see each other's display name, character and position. There is no chat or voice. Only share a code with people you know. Parents and guardians of players under 18 should supervise online play.</p>
          <p><strong className="text-white/70">Streams from games.</strong> When a signed-in player finishes a mission, it counts as one stream of that mission's song, at most once per song per player every 10 minutes. Plays by the artist who owns the song are not counted. These streams follow the same rules as any other stream, including section 17.</p>
          <p><strong className="text-white/70">Fair play.</strong> Runs are checked before they are posted. You may not cheat, use bots or scripts, alter the game, or post results you did not play for. We may remove scores, reset progress and suspend accounts that do.</p>
          <p><strong className="text-white/70">Your health.</strong> The games use flashing light effects, lightning and screen shake. A very small number of people may have a seizure when exposed to flashing lights. If you or anyone in your family has a history of epilepsy or seizures, speak to a doctor before playing. Stop playing at once if you feel dizzy or have blurred vision, eye or muscle twitches, or any loss of awareness. Take regular breaks, and keep aware of your surroundings while you play.</p>
          <p><strong className="text-white/70">Changes.</strong> Games, levels, modes and rewards may change, be paused or be removed at any time.</p>
        </Section>

        <Section title="14. Artist Levels in Feelz Run">
          <p>Artists on a plan that includes it can put their own songs into Feelz Run as levels that fans play. Premium includes one live level, and the Feelz Run add-on adds four more. What each plan includes may change, as described in section 9.</p>
          <p><strong className="text-white/70">Your rights.</strong> When you switch a level on, you confirm that you hold all the rights needed for the song, its artwork and your artist name to be used in an interactive game, including the master recording, the underlying composition and any samples or features in it. You grant {COMPANY} a non-exclusive, royalty-free licence to use the song, its artwork and your artist name inside Feelz Games, on leaderboards, in share links and in promoting the game, for as long as the level is switched on, and afterwards only for runs and scores already recorded. You can switch a level off at any time.</p>
          <p><strong className="text-white/70">Discounts.</strong> If you let fans use game credits for money off your song, the discount you choose comes off your own price, and you receive the discounted price for those sales.</p>
          <p><strong className="text-white/70">The add-on.</strong> The Feelz Run add-on is a monthly subscription, billed through PayPal at the price shown when you take it. You can cancel at any time in PayPal, and it stays on until the end of the period you have paid for. When it ends, any levels beyond what your plan includes stop appearing in the game until you have room for them again.</p>
        </Section>

        <Section title="15. Platform Analytics & Data">
          <p>We collect streaming data, device information, and engagement metrics to provide artists with analytics about their content's performance. This data is used to operate the Platform, power the recommendation algorithm, and provide per-track analytics to artists. See our Privacy Policy for full details.</p>
        </Section>

        {/* Steve's decision, stated in the product rather than left implied:
            following an artist opts you in to hearing from them, and you opt
            out whenever you like. POPIA section 69 permits exactly that for
            people you already have a relationship with, but only while the
            objection stays free and easy, at collection AND in every message.
            So this section has to say three things, and each one is a promise
            the code now actually keeps:

              1. what a follow means             (the notice at collection)
              2. that leaving is one click       (netlify/functions/unsubscribe.js)
              3. that service mail is different  (so opting out is not scary)

            If any of those three stops being true in the product, this clause
            stops being a defence and becomes a misrepresentation. */}
        <Section title="16. Emails & Direct Marketing">
          <p><strong className="text-white/70">How you are subscribed.</strong> When you create an account, you are subscribed to Platform emails about {COMPANY}: new features, releases, competitions and announcements. When you follow an artist, you are added to that artist's contact list and may receive emails from that artist about their music. We do not ask you to tick a box for either; you are opted in by default and you may opt out at any time. This section is that notice.</p>

          <p><strong className="text-white/70">How you opt out.</strong> Every marketing email we send carries an unsubscribe link that works immediately and needs no password and no account. You can also manage everything in one place, artist by artist, under Email Preferences in your Hub, at any time, for free. We act on an objection as soon as we receive it. If something is already in the process of sending, it may still arrive.</p>

          <p><strong className="text-white/70">What opting out does not stop.</strong> Service messages are not marketing and are not covered by an unsubscribe: purchase receipts, download links, payout and earnings notices, collaboration requests, security and account alerts, and messages we are required to send you by law. You receive these for as long as you have an account.</p>

          <p><strong className="text-white/70">Emails from artists.</strong> An artist on a paid plan may export the contact details of followers who have not opted out of hearing from them, and may email that list about their own music. Artists are not given the details of anyone who has opted out. Each exported contact carries its own unsubscribe link, and artists are required to include it in every message they send. An artist emailing their list is acting as the responsible party for that message: they must identify themselves, they must honour any objection immediately, and they may not sell, share or re-use the list for anything other than their own music. Breaching this is grounds for removal from the Platform.</p>

          <p><strong className="text-white/70">What we never do.</strong> We do not sell your contact details. We do not share them with advertisers. We do not give artists the addresses of people who have opted out of their list, and we do not give any artist the Platform's full membership.</p>

          <p><strong className="text-white/70">Your rights.</strong> You may object to direct marketing at any time, without giving a reason and without charge. You may also ask us what we hold about you, ask for it to be corrected, or ask for it to be deleted. Write to {CONTACT}. These rights are set out in the Protection of Personal Information Act 4 of 2013 and, where it applies to you, the General Data Protection Regulation. See our Privacy Policy for the full picture.</p>
        </Section>

        <Section title="17. Prohibited Uses">
          <p>You may not: (a) use bots, scripts, or automated tools to artificially inflate stream counts, follower counts, game scores, or engagement metrics, including through Feelz Games; (b) attempt to gain unauthorised access to other accounts or Platform systems; (c) scrape or harvest Platform data without permission; (d) use the Platform to transmit spam; (e) attempt to reverse engineer the Platform.</p>
          <p>We use automated and manual systems to detect fraud. Accounts found manipulating metrics will be suspended and may have earnings reversed.</p>
        </Section>

        <Section title="18. Termination">
          <p>We may suspend or terminate your account at any time for breach of these Terms. You may delete your account at any time from your profile settings. Upon deletion, your public profile and content will be removed from active circulation.</p>
        </Section>

        <Section title="19. Disclaimers & Limitation of Liability">
          <p>The Platform is provided "as is" without warranties of any kind, express or implied. We do not warrant that the Platform will be uninterrupted, error-free, or that content will be preserved indefinitely.</p>
          <p>To the maximum extent permitted by applicable law, {COMPANY} shall not be liable for indirect, incidental, special, or consequential damages arising from your use of the Platform, including loss of revenue, data, or goodwill.</p>
          <p>Our total liability to you for any claim shall not exceed the amount you paid to us in the 12 months preceding the claim.</p>
        </Section>

        <Section title="20. Governing Law">
          <p>These Terms are governed by the laws of the Republic of South Africa. Disputes will be resolved through good faith negotiation where possible, and otherwise by the South African courts. If you are a consumer, nothing in these Terms affects your rights under the Consumer Protection Act, the Electronic Communications and Transactions Act, or any other consumer protection law that applies to you where you live.</p>
        </Section>

        <Section title="21. Contact">
          <p>For legal notices, copyright takedown requests, or questions about these Terms, contact us at <strong className="text-white/70">{CONTACT}</strong>.</p>
        </Section>
      </div>
    </div>
  );
}