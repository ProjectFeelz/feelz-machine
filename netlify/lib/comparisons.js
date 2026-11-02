/**
 * netlify/lib/comparisons.js
 *
 * The search-facing half of the /vs/ pages, in a form a Netlify function can
 * read.
 *
 *
 * WHY THIS FILE HAS TO EXIST
 *
 * /vs/spotify, /vs/soundcloud, /vs/bandcamp and /vs/apple-music are the four
 * most valuable pages on this site and Google has never seen any of them.
 * Search Console reports /vs/spotify as "URL is unknown to Google": not
 * crawled and not indexed, despite sitting in the sitemap.
 *
 * The reason is the same one that kept 233 other URLs uncrawled. These pages
 * are React routes, their content and their title are set by react-helmet
 * after JavaScript runs, and seo-html.js was never told about them. So the
 * document a crawler receives is the bare shell, with the home page's title
 * and a body that reads "You need to enable JavaScript to run Feelz Machine".
 *
 * They matter more than the artist pages do, and it is worth being clear why.
 * projectfeelz.com takes 8,600 clicks a fortnight from queries like "fresh air
 * plugin" and "keyzone classic": product names people already knew before they
 * searched. It captures demand rather than creating it. Nobody is yet
 * searching for the artists on Feelz Machine, so artist pages are a long tail
 * that fills in once the domain has standing. "Bandcamp alternative" and "how
 * much does Spotify pay per stream" are the queries with volume behind them
 * TODAY that this site can honestly answer.
 *
 *
 * WHY THE PROSE IS NOT IN HERE
 *
 * src/data/platformComparisons.js holds the real content: sourced figures, the
 * explanation of each payout model, and an honest note on each page saying
 * what the other platform is still better at. That file is the source of
 * truth and it should stay the one place those facts are edited.
 *
 * A Netlify function cannot require it: it is an ES module inside the React
 * app. So only the four fields a crawler reads are repeated here, and both
 * files carry a comment saying the other exists. Four titles that change
 * roughly never is a cheaper problem than two copies of every statistic.
 */

const COMPARISONS = {
  spotify: {
    slug: 'spotify',
    name: 'Spotify',
    title: 'Spotify Alternative for Independent Artists: Feelz Machine vs Spotify',
    description: 'A factual look at how Spotify pays independent artists in 2025-2026, and what Feelz Machine does differently: direct fan contact, transparent payouts, and no algorithm gatekeeping.',
    hook: 'The 100,000th highest-earning artist on Spotify made $7,300 in all of 2025. Here is how the pro-rata model produces that, and what selling direct pays instead.',
  },
  soundcloud: {
    slug: 'soundcloud',
    name: 'SoundCloud',
    title: 'SoundCloud Alternative for Independent Artists: Feelz Machine vs SoundCloud',
    description: 'How SoundCloud pays independent artists in 2025-2026 compared to Feelz Machine, covering Fan-Powered Royalties, reach, and direct fan ownership.',
    hook: 'SoundCloud has 76 million monthly listeners to Spotify’s 675 million. Here is what Fan-Powered Royalties actually pay, and what you keep selling direct instead.',
  },
  bandcamp: {
    slug: 'bandcamp',
    name: 'Bandcamp',
    title: 'Bandcamp Alternative: Sell Music Direct to Fans | Feelz Machine vs Bandcamp',
    description: 'How Bandcamp’s revenue share and direct-sales model compares to Feelz Machine for independent artists in 2025-2026.',
    hook: 'Bandcamp artists keep about 82% of a typical sale. Here is where the other 18% goes, and what the same sale pays on a platform that takes no cut of it.',
  },
  'apple-music': {
    slug: 'apple-music',
    name: 'Apple Music',
    title: 'Apple Music Alternative for Independent Artists: Feelz Machine vs Apple Music',
    description: 'How Apple Music pays independent artists in 2025-2026 compared to Feelz Machine, covering per-stream rates, reach, and owning your fan relationship.',
    hook: 'Apple Music pays roughly twice Spotify’s per-stream rate, which is still a fraction of a cent. Here is what that means at real listener numbers.',
  },
};

const comparisonSlugs = () => Object.keys(COMPARISONS);

module.exports = { COMPARISONS, comparisonSlugs };
