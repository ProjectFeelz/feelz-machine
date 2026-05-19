/**
 * weekly-wheel-spin.js
 *
 * Netlify scheduled function — Monday 9:00am UTC
 * 1. Picks a random prompt (alternating singer/beatmaker week)
 * 2. Creates a competition with correct dates
 * 3. Inserts a wheel_challenges row
 * 4. Marks previous challenge as not current
 * 5. Notifies all artists + listeners via push
 */

const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const SINGER_PROMPTS = [
  "Sing about falling in love with your WiFi password",
  "A heartbreak song about your meal going cold",
  "Serenade a parking ticket you just received",
  "Love song to your 3AM fridge raid",
  "Ballad of the last pair of clean socks",
  "Sing about missing someone but it's your nap",
  "Power anthem about forgetting your charger",
  "Gospel song about finding money in old jeans",
  "Sad song about your plant that didn't survive",
  "Bop about being stuck behind a slow walker",
  "Sing about autocorrect ruining your life",
  "A lullaby for your dead phone battery",
  "Ode to the person who ate your food",
  "Breakup song to your alarm clock",
  "Anthem for surviving a Monday morning",
  "Sing about being ghosted by your delivery driver",
  "Love song to the snooze button",
  "Aria about running out of mobile data",
  "Your ex but they're a streaming service",
  "Protest song about the queue at the bank",
  "Ballad about your favourite takeaway order",
  "Sad song about WiFi dropping mid-call",
  "Hype track for cleaning your room",
  "Blues song about slow internet connection",
  "Victory song for finding a parking spot",
  "Lament about your laundry pile growing",
  "Bop about being on hold forever",
  "Torch song for a cancelled TV show",
  "Emotional send-off for your dying laptop",
  "Stadium anthem about cooking with no gas",
];

const BEATMAKER_PROMPTS = [
  "A beat like a haunted kitchen at midnight",
  "Afrobeats meets elevator music — make it slap",
  "Built around the sound of rain on tin roof",
  "Jazz x Trap x something your grandma approves of",
  "Cinematic beat like a heist in slow motion",
  "Lo-fi but you're floating on the moon",
  "Drill beat with a lullaby melody twist",
  "Sounds like the ocean is rapping",
  "Build a beat around an animal sound",
  "A beat so weird it somehow works",
  "Amapiano but set in outer space",
  "Trap beat using only kitchen sounds",
  "A beat that feels like a sunrise",
  "Afro-fusion meets cold winter vibes",
  "Slaps but also somehow makes you cry",
  "A beat your ancestors would dance to",
  "Highlife x Phonk — trust the vision",
  "A carnival beat that feels lonely",
  "Percussion-only beat that tells a story",
  "Chaos slowly becoming peace",
  "Beat inspired by the sound of traffic",
  "Gqom meets classical orchestra — go wild",
  "A beat that sounds like falling in love",
  "Lo-fi hip hop set in Lagos circa 1975",
  "A beat that feels like pure nostalgia",
  "Makes you want to just sprint somewhere",
  "Starts gentle then hits like a truck",
  "Afrobeats but underwater — you heard me",
  "Score for a movie scene that doesn't exist",
  "Samples silence and somehow makes it fire",
];

exports.handler = async () => {
  try {
    const now = new Date();

    // Determine mode — alternate singer/beatmaker each week
    const { data: lastChallenge } = await supabase
      .from('wheel_challenges')
      .select('mode, prompt')
      .order('spun_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const lastMode = lastChallenge?.mode || 'beatmaker';
    const mode = lastMode === 'singer' ? 'beatmaker' : 'singer';
    const pool = mode === 'singer' ? SINGER_PROMPTS : BEATMAKER_PROMPTS;

    // Pick a prompt not used recently
    const { data: recentChallenges } = await supabase
      .from('wheel_challenges')
      .select('prompt')
      .order('spun_at', { ascending: false })
      .limit(20);
    const recentPrompts = new Set((recentChallenges || []).map(c => c.prompt));
    const available = pool.filter(p => !recentPrompts.has(p));
    const promptPool = available.length > 0 ? available : pool;
    const prompt = promptPool[Math.floor(Math.random() * promptPool.length)];

    // Competition date windows — 2 week cycle
    // Announced Sunday → entries close following Sunday 5pm UTC → voting 5pm–11:59pm UTC
    const nextSunday = new Date(now);
    const daysUntilSunday = (7 - now.getDay()) % 7 || 7;
    nextSunday.setDate(now.getDate() + daysUntilSunday);
    const entriesClose = new Date(nextSunday);
    entriesClose.setUTCHours(17, 0, 0, 0);
    const votingClose = new Date(nextSunday);
    votingClose.setUTCHours(23, 59, 0, 0);

    const title = `Collab Roulette — Week of ${now.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;

    // Create the competition
    const { data: competition, error: compErr } = await supabase
      .from('competitions')
      .insert({
        title,
        description: `This week's challenge: "${prompt}"\n\nUpload your original track inspired by this prompt. Fans vote for their favourite — winner gets 3 months Pro FREE.`,
        prize_description: '3 Months Pro Access — extended automatically on win',
        cash_prize_amount: 0,
        status: 'open',
        entries_open_at: now.toISOString(),
        entries_close_at: entriesClose.toISOString(),
        voting_open_at: entriesClose.toISOString(),
        voting_close_at: votingClose.toISOString(),
        max_votes_per_user: 2,
        wheel_challenge: true,
        competition_type: 'wheel',
        max_votes_per_user: 2,
        created_at: now.toISOString(),
        updated_at: now.toISOString(),
      })
      .select()
      .single();

    if (compErr) throw compErr;

    // Mark previous challenge as not current
    await supabase
      .from('wheel_challenges')
      .update({ is_current: false })
      .eq('is_current', true);

    // Insert new wheel challenge
    const { error: wErr } = await supabase.from('wheel_challenges').insert({
      prompt,
      mode,
      competition_id: competition.id,
      is_current: true,
      spun_at: now.toISOString(),
    });
    if (wErr) throw wErr;

    // Notify all users
    const { data: allUsers } = await supabase
      .from('user_profiles')
      .select('user_id')
      .limit(5000);

    const userIds = (allUsers || []).map(u => u.user_id);
    if (userIds.length > 0) {
      // Batch insert notifications 100 at a time
      for (let i = 0; i < userIds.length; i += 100) {
        const batch = userIds.slice(i, i + 100);
        await supabase.from('notifications').insert(
          batch.map(uid => ({
            user_id: uid,
            type: 'wheel_challenge',
            title: '🎲 New Collab Roulette Challenge!',
            message: `This week: "${prompt}" — Enter your track and win 3 months Pro!`,
            metadata: { competition_id: competition.id, prompt, mode },
          }))
        ).catch(() => {});
      }

      // Push notification
      await fetch(`${process.env.URL}/.netlify/functions/send-push`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-internal-secret': process.env.INTERNAL_FUNCTION_SECRET || '',
        },
        body: JSON.stringify({
          user_ids: userIds.slice(0, 1000), // push cap
          title: '🎲 Collab Roulette — New Challenge!',
          body: prompt.split('\n').join(' '),
          url: '/wheel',
          tag: `wheel-${competition.id}`,
        }),
      }).catch(() => {});
    }

    console.log(`[weekly-wheel-spin] Created challenge: "${prompt}" (${mode}) — competition ${competition.id}`);
    return { statusCode: 200, body: `Challenge created: ${prompt}` };

  } catch (err) {
    console.error('[weekly-wheel-spin] Error:', err.message);
    return { statusCode: 500, body: err.message };
  }
};
