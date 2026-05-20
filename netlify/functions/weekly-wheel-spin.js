/**
 * weekly-wheel-spin.js
 *
 * Netlify scheduled function — Sunday 9:00am UTC
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
  "Write a love song set at a Sunday braai — no chorus.",
  "Write a breakup song told entirely from your local taxi's point of view.",
  "Write a hook about stage 6 load shedding that somehow makes people feel hopeful.",
  "Write an anthem for your first paycheque disappearing in exactly 3 days.",
  "Write a heartbreak song about your favourite late-night meal going cold.",
  "Write a power anthem about being stuck on the pavement behind a slow walker.",
  "Write a song about being ghosted by your food delivery driver at 11:30 PM.",
  "Write a love song to the snooze button — make it deeply sincere.",
  "Write a short track celebrating the exact moment the power comes back on.",
  "Write a song about losing your keys when you're already 15 minutes late.",
  "Write an ode to the local car wash on a scorching Saturday morning.",
  "Write a hook about scrolling through your ex's new vacation photos.",
  "Write a song dedicated to the cozy warmth of a heavy winter blanket.",
  "Write a song to your local spaza shop owner using only 4 chords.",
  "Write a lullaby for your phone battery dying at 2%.",
  "Write a love song matching the rhythm of heavy rain on a tin roof.",
  "Write a full song with absolutely no pronouns — no I, you, we, or they.",
  "Write a hook so simple it almost embarrasses you — then belt it out.",
  "Write a verse about a memory that still hits different — absolutely zero metaphors.",
  "Write a song about autocorrect completely ruining the most important text of your life.",
  "Write a song in the second person — address the listener directly the whole way.",
  "Write an entire 16-bar verse in a single breath.",
  "Write a melody that strictly avoids using any plosives (no words starting with P, T, B, K).",
  "Write a response track to a famous local song, telling the other side of the story.",
  "Write a hook using code-switching — switch between two or three languages seamlessly.",
  "Write a song entirely in falsetto or head voice.",
  "Write a gospel-style grand outro for a track about finally making it out.",
  "Write a duet where both voices never actually agree on the narrative.",
  "Write a chorus that seamlessly works as both an R&B love song and a Sunday prayer.",
  "Write a song set in 2075 Johannesburg — what are the inner-city heartbreaks like?",
  "Write a topline over an Amapiano log drum groove you've never heard before.",
  "Write a bridge that completely flips the emotional meaning of the entire song.",
  "Write a track that only makes sense to listen to at exactly 3:00 AM.",
  "Write a track where the melody moves counter to the beat (syncopation challenge).",
  "Write a storytelling track that spans three distinct generations of a single family.",
  "Write a fast-paced trap topline that transitions into a traditional choral arrangement at the end.",
  "Write a song about an intense conversation held entirely through a locked door.",
  "Write the exact song you've been too terrified to write — and commit to it.",
  "Write a song to someone who will genuinely never hear it.",
  "Write the sincere apology you've never been able to say out loud.",
  "Write a love song to the raw, unfiltered version of yourself you left behind years ago.",
  "Write a song about a childhood dream you had to actively let go of to survive.",
  "Write a hook using absolutely no real words — only raw, emotional vocalizations.",
];

const BEATMAKER_PROMPTS = [
  "Make a beat for a braai at 6:00 PM when the energy is transitioning perfectly.",
  "Make a trap beat where the primary percussion is entirely kitchen sounds.",
  "Make a beat that sounds like falling in love in the back row of a taxi.",
  "Make a Sunday morning beat with heavy church drums, but make them knock like a club track.",
  "Make a beat in under 2 hours and force yourself to close the project forever.",
  "Take your absolute worst, abandoned project file and fix exactly one element to save it.",
  "Make a hard-hitting beat using a car alarm sound effect as your main transition riser.",
  "Make a high-energy beat tailored for blasting out of a car with old, blown-out speakers.",
  "Make a lo-fi beat that samples the clicking sound of a pocket lighter.",
  "Make a 4-bar loop so catchy that it doesn't need a single arrangement change to stay interesting.",
  "Make a beat using only 3 distinct sound sources — make every single one carry its weight.",
  "Make a heavy beat with absolutely no kick drum at all.",
  "Make a full, evolving instrumental using nothing longer than a strict 2-bar loop.",
  "Make a beat at a crawling 70 BPM, but configure the percussion to make it feel incredibly fast.",
  "Make a beat at a frantic 140 BPM, but structure the melodies to make it feel deeply relaxed.",
  "Make a beat where the main vocal sample becomes completely unrecognizable by the drop.",
  "Make a beat where an aggressive bassline carries the entire emotional weight of the song.",
  "Make a modern hip-hop beat, but you are forbidden from using any stock or custom hi-hats.",
  "Sidechain your entire master channel to a transient percussion instrument.",
  "Make a heavy trap beat, but you can only use stock plugins from your DAW for processing.",
  "Design a massive 808 bass slide that functions as the actual melody of the track.",
  "Make a track in 3/4 or 6/8 time signature, but force it to feel like a dancefloor track.",
  "Make an Amapiano track that feels simultaneously like a somber funeral and a massive celebration.",
  "Make a drill beat that samples a traditional lullaby — keep both distinct energies fully intact.",
  "Make a heavy gqom beat for a high-intensity scene taking place underwater.",
  "Make an Afrobeats track featuring a complex, authentic classical string arrangement underneath.",
  "Make a beat that kicks off as classic 90s kwaito and mutates into something unrecognizable by the end.",
  "Create a Highlife x Phonk crossover track.",
  "An Afrofuturist anthem — what does South African electronic music sound like in the year 2080?",
  "Mashup: Create a heavy Gqom track infused with golden-era 90s Boom-Bap jazz chords.",
  "Make an Amapiano track, but replace the iconic log drum with a live or synthesized funk slap-bass.",
  "Produce an entire instrumental that relies entirely on a single chord progression throughout.",
  "Make a beat that encapsulates the eerie, quiet stillness of a city street during a blackout.",
  "Open the oldest, most intimidating unfinished masterpiece you have — and finally export the master.",
  "Remake a legendary, classic local radio instrumental entirely from pure memory.",
  "Create a complete, hard-hitting beat using exclusively samples generated by your own voice.",
  "Step out of bounds: produce a track in a genre you have openly disliked or never attempted.",
  "Create a rich, complex melodic beat using only white noise and filters.",
  "Make a track that smoothly accelerates from 90 BPM to 130 BPM across the entire arrangement.",
];

const ALL_PROMPTS = [...SINGER_PROMPTS, ...BEATMAKER_PROMPTS];

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

    // Competition date windows
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

      await fetch(`${process.env.URL}/.netlify/functions/send-push`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-internal-secret': process.env.INTERNAL_FUNCTION_SECRET || '',
        },
        body: JSON.stringify({
          user_ids: userIds.slice(0, 1000),
          title: '🎲 Collab Roulette — New Challenge!',
          body: prompt,
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