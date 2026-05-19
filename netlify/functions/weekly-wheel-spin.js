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
  "Write the song you've",
  "been too scared to release",
  "Sing to the person",
  "who changed your life",
  "without knowing it",
  "One verse. No chorus.",
  "Just say what you",
  "need to say",
  "Write a love song",
  "to the version of yourself",
  "you left behind",
  "Sing to someone who",
  "will never hear it",
  "The apology you've",
  "never been able",
  "to say out loud",
  "Write the song",
  "you wish existed",
  "when you needed it most",
  "Sing from the perspective",
  "of someone who gave up",
  "on their dream",
  "Sing this from",
  "your future self",
  "looking back",
  "Write a song",
  "from the perspective",
  "of the city you're from",
  "Sing it like it's",
  "the last song",
  "you'll ever record",
  "Write the anthem",
  "for your neighbourhood —",
  "everyone knows it but no one made it",
  "Sing the story",
  "of how your parents met —",
  "fill in the gaps",
  "Write a song",
  "from the perspective",
  "of someone who made it",
  "Sing to your",
  "younger self at",
  "the hardest moment",
  "Write the song",
  "that plays at",
  "your braai when the vibe peaks",
  "Load shedding —",
  "no power, just you",
  "and your voice. Go.",
  "Sing about the taxi rank",
  "at 5:30am —",
  "everyone has a story there",
  "Write the song",
  "that would play",
  "in your gogo's kitchen",
  "The first paycheck",
  "you ever got —",
  "where did it go?",
  "Sing about leaving",
  "home for the first time",
  "and what you didn't expect",
  "Your ancestors are",
  "listening. Write the song",
  "that proves you're okay.",
  "Write the Friday",
  "evening song —",
  "after a long week, before the weekend starts",
  "Sing about the person",
  "in your family who",
  "never got their flowers",
  "The hustle no one",
  "sees — write the",
  "song that shows it",
  "One emotion only.",
  "No switching.",
  "Cover to cover.",
  "Start the song",
  "in the middle of",
  "a sentence",
  "Write a song",
  "with no hook —",
  "just verses that hit harder each time",
  "Sing the whole thing",
  "in under 90 seconds.",
  "Make every word count.",
  "Write a song where",
  "the bridge is",
  "the most important part",
  "Sing about loving someone",
  "who loves you back",
  "but the timing is wrong",
  "Write about the friendship",
  "that ended without",
  "a proper goodbye",
  "The relationship everyone",
  "told you to leave —",
  "but you didn't. Why?",
  "Sing to the city",
  "that made you",
  "who you are",
  "Write the song",
  "about almost making it —",
  "not failure, not success, the in-between",
  "Sing about the night",
  "everything changed —",
  "no one else knows what that night was",
  "The version of success",
  "you wanted at 16 —",
  "and where you actually are",
  "Write a song",
  "that tells the truth",
  "about something you've been performing",
  "Sing about what",
  "you do when",
  "no one is watching",
  "Write the song",
  "that only people",
  "from your world will understand",
];

const BEATMAKER_PROMPTS = [
  "Build something that feels",
  "like driving at night",
  "and not wanting to arrive",
  "Make a beat that",
  "feels like good news",
  "arriving too late",
  "A beat that sounds",
  "like relief —",
  "that specific exhale",
  "Something that feels",
  "like the moment before",
  "a decision you can't take back",
  "Build a beat that",
  "hits different at 3am",
  "than it does at noon",
  "Make something that",
  "feels like homesickness —",
  "but also excitement",
  "A beat that captures",
  "the Sunday feeling —",
  "relaxed but with Monday underneath it",
  "Build something that",
  "feels like a secret",
  "between two people",
  "Make a beat that",
  "makes someone think",
  "of a specific person without knowing why",
  "Something that feels",
  "like the last night",
  "before everything changes",
  "Three elements only.",
  "No more.",
  "Make them count.",
  "Start the beat",
  "in the drop —",
  "no build, just pressure from bar one",
  "Build something where",
  "the silence is",
  "as important as the sound",
  "Make a beat",
  "using only sounds",
  "you could record in your house right now",
  "No 808. No snare.",
  "Find another way",
  "to make it slap.",
  "Build something that",
  "grows by one layer",
  "every 8 bars",
  "Make a beat",
  "that doesn't repeat",
  "a single pattern exactly",
  "One sample, chopped",
  "10 different ways.",
  "Build the whole thing around it.",
  "Start slow, end",
  "fast — let the",
  "tempo tell the story",
  "Build something that",
  "works perfectly with",
  "no melody at all",
  "Amapiano but it's",
  "a funeral that becomes",
  "a celebration. You know this feeling.",
  "Gqom energy but",
  "set at sunrise —",
  "not night, morning. Different beast.",
  "Kwaito tempo but",
  "the melody is",
  "from a lullaby your parents knew",
  "Build the beat",
  "that plays in",
  "your neighbourhood at peak hour on a Friday",
  "Take something from",
  "your culture and",
  "build it into something brand new",
  "Township percussion meets",
  "cinematic strings —",
  "make both feel at home",
  "Build something that",
  "sounds like Joburg",
  "but could be anywhere in the world",
  "Make the beat",
  "that would make",
  "your gogo get up",
  "Afrobeats x Jazz —",
  "but the jazz is",
  "melancholy, the Afrobeats is joy. Both at once.",
  "Build a beat",
  "that tells the story",
  "of a place without using words",
  "What would your",
  "city sound like",
  "in 1975? Build it.",
  "Make something cinematic —",
  "score it for a scene",
  "that doesn't exist yet",
  "Build a beat",
  "that could soundtrack",
  "both a fight and a reconciliation",
  "Take your favourite",
  "genre and remove",
  "the thing that defines it. What's left?",
  "Make a beat",
  "that sounds expensive",
  "with the cheapest possible equipment",
  "Build something lo-fi",
  "but with a moment",
  "that hits like a punch",
  "Make a beat",
  "that starts as",
  "one genre and ends as another",
  "Build something that",
  "feels like it's",
  "been playing forever — ancient and new",
  "Make a beat",
  "where the hook",
  "is a rhythm, not a melody",
  "Build the beat",
  "you'd want playing",
  "when you finally make it",
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