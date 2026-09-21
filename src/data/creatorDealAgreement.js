// src/data/creatorDealAgreement.js
//
// The Creator Empowerment Deal agreement, filled in from the offer.
//
// The admin screen builds the text from this template, the database stores
// exactly that text with its SHA-256 fingerprint (offer_creator_deal), and the
// artist signs that stored text (sign_creator_deal). Changing this file only
// affects offers sent afterwards; signed deals keep the words they were signed
// with. Bump AGREEMENT_VERSION whenever the wording changes.
//
// DRAFT: to be reviewed by a South African music lawyer before real use.

export const AGREEMENT_VERSION = 'ced-v1-2026-09';

const R = n => 'R' + Number(n || 0).toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * @param {object} o
 * @param {{name, regNo, address, email}} o.company
 * @param {string} o.stageName
 * @param {string} o.seriesName
 * @param {number} o.songCount
 * @param {number} o.advanceZar
 * @param {string} o.advanceSchedule
 * @param {number} o.recordingBudgetZar
 * @param {number} o.artistSharePct
 * @param {number} o.exclusivityDays
 * @param {number} o.termMonths
 * @returns {string} plain text, headings start with '## '
 */
export function buildAgreement(o) {
  const c = o.company || {};
  const fm = 100 - Number(o.artistSharePct);
  const a = Number(o.artistSharePct);
  const budget = Number(o.recordingBudgetZar) > 0
    ? `Feelz Machine pays for studio time, mixing and mastering for the Project up to ${R(o.recordingBudgetZar)} in total. These recording costs are not recoupable: they are not taken from your share.`
    : 'You are responsible for your own recording costs, unless we agree otherwise in writing for a particular song.';

  const s = [];
  const h = t => s.push('## ' + t);
  const p = t => s.push(t);

  s.push(`CREATOR EMPOWERMENT DEAL`);
  s.push(`Agreement version ${AGREEMENT_VERSION}`);

  h('1. The parties');
  p(`1.1 ${c.name || '[company legal name]'} (registration number ${c.regNo || '[registration number]'}), trading as Feelz Machine, of ${c.address || '[company address]'} ("Feelz Machine", "we", "us").`);
  p(`1.2 The artist professionally known as ${o.stageName}, being the person who signs this agreement in the Feelz Machine app and whose full legal name, identity or passport number and address are recorded with it at signing ("the Artist", "you").`);

  h('2. What this deal is');
  p(`2.1 This is a project deal, not a long-term signing. You record one project with us: ${o.songCount} songs released as a series called "${o.seriesName}" (the "Project" or "Series"). When the Project is done you are free. You are not tied to Feelz Machine for any future music.`);
  p(`2.2 In return for the advance, promotion and platform support below, the Project recordings are co-owned by both of us and the income from them and from Project merchandise is shared ${a}% to you and ${fm}% to Feelz Machine, for as long as they earn.`);

  h('3. Definitions');
  p(`3.1 "Recordings" means the final master recordings of the ${o.songCount} Project songs and any versions of them made for the Project (radio edits, instrumentals, acapellas, sped-up or slowed versions, live versions recorded for the Project, and music videos).`);
  p('3.2 "Compositions" means the underlying songs: lyrics and music.');
  p('3.3 "Project Merchandise" means products that use the Series name, the Series or single artwork, or your name or likeness together with any of those, sold through Feelz Machine or any shop set up for the Project.');
  p('3.4 "Net Receipts" means all money actually received by either party from the Recordings or Project Merchandise, less only: payment processor fees (for example PayPal), distributor fees (for example the distributor\'s share of Meta or streaming income), and print and shipping costs charged by the merchandise supplier (for example Printful). No other costs may be deducted unless both parties agree in writing.');
  p('3.5 "Release Date" means the date each song is first made available to the public.');

  h('4. The Project');
  p(`4.1 You will write and record the ${o.songCount} songs. We will agree the song list and delivery dates in writing (messages in the Feelz Machine app or email count).`);
  p(`4.2 Recording costs: ${budget}`);
  p('4.3 Each Recording must be of professional, releasable quality. If we think a Recording is not ready we will tell you within 7 days of delivery, say why, and give you a fair chance to fix it.');
  p('4.4 We agree the release schedule together. As a guide, the songs are released as a series roughly every 3 to 4 weeks.');

  h('5. Advance');
  p(`5.1 We pay you an advance of ${R(o.advanceZar)}, as follows: ${o.advanceSchedule}.`);
  p('5.2 The advance is recoupable: it is repaid only out of your share of Net Receipts under clause 6. Until your share has repaid the advance, your share is credited against it. After that, your share is paid to you.');
  p('5.3 The advance is not returnable. If the Project never earns enough to repay it, you owe us nothing, except as set out in clause 12.4.');

  h(`6. Money: the ${a}/${fm} split`);
  p(`6.1 Net Receipts from the Recordings, from every source, are split ${a}% to you and ${fm}% to Feelz Machine. This includes streaming, downloads and sales, Feelz Retail, Meta (Instagram and Facebook) and other user-generated content platforms, other stores after the Exclusivity Window, and synchronisation (film, TV, adverts, games).`);
  p(`6.2 Net Receipts from Project Merchandise are split ${a}% to you and ${fm}% to Feelz Machine.`);
  p('6.3 Whoever receives the money pays the other party their share. Buyers on Feelz Machine may pay one party directly (for example a sale paid into your PayPal). The party who received it pays the other party\'s share within 30 days of the end of the month in which it was received.');
  p('6.4 Each month in which there is income, Feelz Machine makes a statement available in the app showing every source, the Net Receipts, each party\'s share and the balance of the advance. You may check our records once a year on 14 days\' notice. If an error of more than 5% against you is found, we pay the reasonable cost of the check.');
  p('6.5 Money paid by collecting societies to recording owners (for example SAMPRA) is registered by both parties for the Recordings and shared in the same way. Performer shares paid to you personally stay yours.');

  h(`7. Exclusivity: streaming only, ${o.exclusivityDays} days`);
  p(`7.1 For ${o.exclusivityDays} days from each song's Release Date, that song may be streamed only on Feelz Machine (the "Exclusivity Window").`);
  p('7.2 The Exclusivity Window covers streaming services only (for example Spotify, Apple Music, YouTube Music, Deezer, SoundCloud, Audiomack). It does not stop: Instagram and Facebook music libraries and other user-generated content platforms; radio and TV; live performance; social media clips and teasers; or sync licensing.');
  p('7.3 After the Exclusivity Window the song may be distributed to any streaming service. Unless both parties agree otherwise, Feelz Machine arranges that distribution and the income is shared under clause 6.');

  h('8. Ownership');
  p('8.1 The Recordings are co-owned by both parties in equal shares, from creation, worldwide, for the full period of copyright.');
  p('8.2 Neither party may sell, give away or exclusively license its share of the Recordings without first offering it to the other party on the same terms. The other party has 30 days to accept.');
  p('8.3 Feelz Machine administers the Recordings (registration, ISRC codes, distribution, licensing requests) and consults you on anything outside normal release and promotion. Any sync licence, or any use in political, religious or adult content, needs your written approval, which you will not unreasonably refuse.');
  p('8.4 You keep your Compositions. This agreement gives Feelz Machine no share of your publishing or songwriter income. You give us permission to use the Compositions as needed to release and promote the Recordings.');
  p('8.5 Co-ownership and the income split continue after the Project ends and after this agreement ends for any reason.');

  h('9. What Feelz Machine does');
  p('9.1 Pays the advance on time.');
  p('9.2 Features the Series on Feelz Machine: homepage and editorial placement for each release, and a dedicated Series page.');
  p('9.3 Submits the Recordings to Feelz Retail so they can play in paying venues and earn from the artist pool, under the Retail rules that apply to all artists (for example, no explicit tracks in venues).');
  p('9.4 Assigns ISRC codes and delivers each qualifying Recording to Meta\'s music library (Instagram and Facebook) when it is released.');
  p('9.5 Sets up and runs Project Merchandise with you, including design support.');
  p('9.6 Plans and runs promotion for each release, and keeps you informed.');

  h('10. What you do');
  p(`10.1 Deliver the ${o.songCount} Recordings as agreed.`);
  p('10.2 Take part in reasonable promotion for each release, at times agreed in advance.');
  p('10.3 Let Feelz Machine use your name, stage name, approved photos, likeness and biography to promote the Project and Project Merchandise, during this agreement and afterwards for as long as the Recordings are available.');
  p('10.4 Credit the Series as "Released on Feelz Machine" when you share or promote it.');

  h('11. Promises');
  p('11.1 You are 18 or older, free to sign this agreement, and not under any other contract that conflicts with it.');
  p('11.2 The Recordings and Compositions are original. They contain no samples, loops, beats or other material you do not have the rights to, and are not built on purchased or free "type beats" unless we both agree in writing and the rights are cleared.');
  p('11.3 You have the permission of everyone who performed on or co-wrote the Recordings, and you will give us their names and agreed splits.');
  p('11.4 If a claim is made against Feelz Machine because one of your promises was untrue, you will cover the reasonable cost of dealing with it, up to the amount you have received under this agreement, unless the claim was caused by our own actions.');
  p('11.5 Feelz Machine is free to enter into this agreement, will account honestly and pay on time, and will not use the Recordings or your name in any way this agreement does not allow.');

  h('12. Ending the agreement');
  p(`12.1 The Project ends when the last song's Exclusivity Window ends, or ${o.termMonths} months after signing, whichever is later. After that you have no obligations to Feelz Machine except under clauses 6 and 8, which continue.`);
  p('12.2 Either party may end this agreement if the other seriously breaks it and does not fix the problem within 30 days of written notice.');
  p('12.3 If Feelz Machine does not pay the advance or any share of income when due, and does not fix it within 30 days of notice, you may end this agreement and the Exclusivity Window for all songs ends immediately.');
  p(`12.4 If you stop working on the Project without good reason and do not deliver, Feelz Machine may end this agreement and you will repay the part of the advance for the undelivered songs (${R(Number(o.advanceZar) / Number(o.songCount))} per undelivered song). Delivered Recordings stay co-owned under clause 8. Illness, family emergencies and similar reasons are good reasons: we pause the schedule instead.`);

  h('13. Disputes');
  p('13.1 We will first try to sort out any disagreement by talking. If that fails within 30 days, either party may refer it to mediation with a mediator both agree on.');
  p('13.2 If mediation does not resolve it within 60 days, the dispute may go to the courts of South Africa. South African law applies to this agreement.');

  h('14. Signing and general terms');
  p('14.1 This agreement is concluded electronically. You sign it in the Feelz Machine app by entering your full legal name, identity or passport number and address, and confirming that you accept it. That is your signature under the Electronic Communications and Transactions Act 25 of 2002. Feelz Machine accepts by sending the offer. The exact text you sign is stored with a digital fingerprint, and you can download a copy at any time.');
  p('14.2 This is the whole agreement about the Project. Changes are only valid if in writing and agreed by both parties; messages in the app or emails between the parties count.');
  p('14.3 Neither party may transfer this agreement without the other\'s written consent, except that Feelz Machine may transfer it to a company that takes over the Feelz Machine platform, on the same terms.');
  p(`14.4 Notices may be sent to ${c.email || '[company email]'} and to the email address on your Feelz Machine account.`);
  p('14.5 Your personal information is handled under the Protection of Personal Information Act (POPIA) and the Feelz Machine privacy policy, only for this agreement.');
  p('14.6 You confirm that you have had the chance to get independent legal advice before signing.');

  return s.join('\n\n');
}