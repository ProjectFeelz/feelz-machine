/**
 * WheelRevealPage.js — /wheel
 * Redesigned to match Feelz Machine's Pitch Black aesthetic.
 * Dark slices, white/purple palette, no carnival colors.
 * Also includes a personal spin mode for self-directed challenges.
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { useAuth } from '../contexts/AuthContext';
import {
  ArrowLeft, Trophy, Clock, Music, ChevronRight,
  RefreshCw, Shuffle, Lock, Upload, Check, X,
} from 'lucide-react';

// ── Full prompt library (tiered, with modifiers) ────────────────────────────
// ── Full prompt library (tiered, with modifiers) ────────────────────────────

const SINGER_PROMPTS = [
  // --- COMMON (100 XP) ---
  { id:"sing_common_01", tier:"Common",    points:100,  prompt:"Write a love song set at a Sunday braai — no chorus.",                                              modifier:"Include the sound of tongs clicking twice." },
  { id:"sing_common_02", tier:"Common",    points:100,  prompt:"Write a breakup song told entirely from your local taxi's point of view.",                          modifier:"Must use a sliding door sound effect as a transition." },
  { id:"sing_common_03", tier:"Common",    points:100,  prompt:"Write a hook about stage 6 load shedding that somehow makes people feel hopeful.",                   modifier:"Record the initial take completely in the dark." },
  { id:"sing_common_04", tier:"Common",    points:100,  prompt:"Write an anthem for your first paycheque disappearing in exactly 3 days.",                          modifier:"Tempo must be fast and chaotic." },
  { id:"sing_common_05", tier:"Common",    points:100,  prompt:"Write a heartbreak song about your favourite late-night meal going cold.",                           modifier:"Deliver the verses in a half-spoken, dramatic monotone." },
  { id:"sing_common_06", tier:"Common",    points:100,  prompt:"Write a power anthem about being stuck on the pavement behind a slow walker.",                       modifier:"The chorus must feel like an absolute stampede." },
  { id:"sing_common_07", tier:"Common",    points:100,  prompt:"Write a song about being ghosted by your food delivery driver at 11:30 PM.",                        modifier:"Incorporate mock-crying into the ad-libs." },
  { id:"sing_common_08", tier:"Common",    points:100,  prompt:"Write a love song to the snooze button — make it deeply sincere.",                                  modifier:"Layer your vocals to sound like a drowsy choir." },
  { id:"sing_common_09", tier:"Common",    points:100,  prompt:"Write a short track celebrating the exact moment the power comes back on.",                         modifier:"The first word must be shouted at the top of your lungs." },
  { id:"sing_common_10", tier:"Common",    points:100,  prompt:"Write a song about losing your keys when you're already 15 minutes late.",                          modifier:"Deliver the verses with an increasing, breathless panic." },
  { id:"sing_common_11", tier:"Common",    points:100,  prompt:"Write an ode to the local car wash on a scorching Saturday morning.",                               modifier:"Use phonetic 'shhh' spray sounds as background percussion." },
  { id:"sing_common_12", tier:"Common",    points:100,  prompt:"Write a hook about scrolling through your ex's new vacation photos.",                               modifier:"Keep your vocal performance completely monotone and unbothered (fake it)." },
  { id:"sing_common_13", tier:"Common",    points:100,  prompt:"Write a song dedicated to the cozy warmth of a heavy winter blanket.",                              modifier:"Muffle your microphone slightly with a piece of cloth to make it sound warm." },
  // --- RARE (250 XP) ---
  { id:"sing_rare_01",   tier:"Rare",      points:250,  prompt:"Write a song to your local spaza shop owner using only 4 chords.",                                  modifier:"Shout out at least three specific snacks." },
  { id:"sing_rare_02",   tier:"Rare",      points:250,  prompt:"Write a lullaby for your phone battery dying at 2%.",                                               modifier:"Whisper-sing the entire track." },
  { id:"sing_rare_03",   tier:"Rare",      points:250,  prompt:"Write a love song matching the rhythm of heavy rain on a tin roof.",                                modifier:"No synthetic percussion allowed; use your own snaps and claps." },
  { id:"sing_rare_04",   tier:"Rare",      points:250,  prompt:"Write a full song with absolutely no pronouns — no I, you, we, or they.",                           modifier:"Focus entirely on objects, locations, and descriptions." },
  { id:"sing_rare_05",   tier:"Rare",      points:250,  prompt:"Write a hook so simple it almost embarrasses you — then belt it out.",                              modifier:"Repeat the hook four times consecutively with increasing energy." },
  { id:"sing_rare_06",   tier:"Rare",      points:250,  prompt:"Write a verse about a memory that still hits different — absolutely zero metaphors.",                modifier:"State only cold, hard facts of what happened." },
  { id:"sing_rare_07",   tier:"Rare",      points:250,  prompt:"Write a song about autocorrect completely ruining the most important text of your life.",            modifier:"Use the actual dynamic pacing of typing and waiting for a reply." },
  { id:"sing_rare_08",   tier:"Rare",      points:250,  prompt:"Write a song in the second person — address the listener directly the whole way.",                   modifier:"Make it feel like a face-to-face confrontation." },
  { id:"sing_rare_09",   tier:"Rare",      points:250,  prompt:"Write an entire 16-bar verse in a single breath.",                                                  modifier:"No digital edits or vocal chops to hide gaps — do it live." },
  { id:"sing_rare_10",   tier:"Rare",      points:250,  prompt:"Write a melody that strictly avoids using any plosives (no words starting with P, T, B, K).",      modifier:"Focus on soft, sweeping vowel sounds." },
  { id:"sing_rare_11",   tier:"Rare",      points:250,  prompt:"Write a response track to a famous local song, telling the other side of the story.",               modifier:"Borrow the exact cadence of the original song's chorus." },
  { id:"sing_rare_12",   tier:"Rare",      points:250,  prompt:"Write a hook using code-switching — switch between two or three languages seamlessly.",              modifier:"Every language shift must happen exactly on the downbeat." },
  { id:"sing_rare_13",   tier:"Rare",      points:250,  prompt:"Write a song entirely in falsetto or head voice.",                                                  modifier:"Keep the instrumentation completely stripped back to just a sub-bass or 808." },
  // --- EPIC (500 XP) ---
  { id:"sing_epic_01",   tier:"Epic",      points:500,  prompt:"Write a gospel-style grand outro for a track about finally making it out.",                          modifier:"Stack at least 5 layers of harmony on the final chord." },
  { id:"sing_epic_02",   tier:"Epic",      points:500,  prompt:"Write a duet where both voices never actually agree on the narrative.",                              modifier:"Record both vocal parts yourself using two distinct tones or pitches." },
  { id:"sing_epic_03",   tier:"Epic",      points:500,  prompt:"Write a chorus that seamlessly works as both an R&B love song and a Sunday prayer.",                 modifier:"Use heavy reverb to simulate an empty church hall." },
  { id:"sing_epic_04",   tier:"Epic",      points:500,  prompt:"Write a song set in 2075 Johannesburg — what are the inner-city heartbreaks like?",                  modifier:"Apply a heavy, futuristic vocal effect or vocoder to the bridge." },
  { id:"sing_epic_05",   tier:"Epic",      points:500,  prompt:"Write a topline over an Amapiano log drum groove you've never heard before.",                        modifier:"The vocal rhythm must syncopate perfectly between the log drum hits." },
  { id:"sing_epic_06",   tier:"Epic",      points:500,  prompt:"Write a bridge that completely flips the emotional meaning of the entire song.",                     modifier:"Change your vocal delivery from vulnerable to aggressive mid-sentence." },
  { id:"sing_epic_07",   tier:"Epic",      points:500,  prompt:"Write a track that only makes sense to listen to at exactly 3:00 AM.",                              modifier:"Keep the vocal delivery right up against the mic capsule — ultra-intimate." },
  { id:"sing_epic_08",   tier:"Epic",      points:500,  prompt:"Write a track where the melody moves counter to the beat (syncopation challenge).",                  modifier:"If the beat goes up, your vocal pitch must drop instantly." },
  { id:"sing_epic_09",   tier:"Epic",      points:500,  prompt:"Write a storytelling track that spans three distinct generations of a single family.",               modifier:"Alter your vocal tone/age delivery for each verse." },
  { id:"sing_epic_10",   tier:"Epic",      points:500,  prompt:"Write a fast-paced trap topline that transitions into a traditional choral arrangement at the end.", modifier:"Layer at least 4 tracking takes of yourself to create a mini-choir effect." },
  { id:"sing_epic_11",   tier:"Epic",      points:500,  prompt:"Write a song about an intense conversation held entirely through a locked door.",                    modifier:"Mix the first verse to sound like it's bleeding through a physical wall." },
  // --- LEGENDARY (1000 XP) ---
  { id:"sing_legend_01", tier:"Legendary", points:1000, prompt:"Write the exact song you've been too terrified to write — and commit to it.",                        modifier:"One-take recording only. No vocal tuning or editing allowed." },
  { id:"sing_legend_02", tier:"Legendary", points:1000, prompt:"Write a song to someone who will genuinely never hear it.",                                          modifier:"Use their real initials somewhere hidden in the lyrics." },
  { id:"sing_legend_03", tier:"Legendary", points:1000, prompt:"Write the sincere apology you've never been able to say out loud.",                                  modifier:"The track must end mid-word, like a cut phone call." },
  { id:"sing_legend_04", tier:"Legendary", points:1000, prompt:"Write a love song to the raw, unfiltered version of yourself you left behind years ago.",            modifier:"Incorporate an old voice note or archival audio clip if you have one." },
  { id:"sing_legend_05", tier:"Legendary", points:1000, prompt:"Write a song about a childhood dream you had to actively let go of to survive.",                     modifier:"No tracking over a click or metronome — sing completely free-tempo." },
  { id:"sing_legend_06", tier:"Legendary", points:1000, prompt:"Write a hook using absolutely no real words — only raw, emotional vocalizations.",                   modifier:"It must convey deep heartbreak purely through the tone and delivery of the melody." },
];

const BEATMAKER_PROMPTS = [
  // --- COMMON (100 XP) ---
  { id:"beat_common_01", tier:"Common",    points:100,  prompt:"Make a beat for a braai at 6:00 PM when the energy is transitioning perfectly.",                    modifier:"Incorporate the distinct hiss of lighter fluid or fire crackle into the riser." },
  { id:"beat_common_02", tier:"Common",    points:100,  prompt:"Make a trap beat where the primary percussion is entirely kitchen sounds.",                          modifier:"Replace the hi-hats with the sound of silverware clinking." },
  { id:"beat_common_03", tier:"Common",    points:100,  prompt:"Make a beat that sounds like falling in love in the back row of a taxi.",                            modifier:"Use a rhythmic 3-chord repeating rhodes loop to simulate tires on asphalt." },
  { id:"beat_common_04", tier:"Common",    points:100,  prompt:"Make a Sunday morning beat with heavy church drums, but make them knock like a club track.",         modifier:"Add a deep, distorted sub-bass underneath an organ progression." },
  { id:"beat_common_05", tier:"Common",    points:100,  prompt:"Make a beat in under 2 hours and force yourself to close the project forever.",                      modifier:"No fine-tuning mixes; trust your first instincts on leveling." },
  { id:"beat_common_06", tier:"Common",    points:100,  prompt:"Take your absolute worst, abandoned project file and fix exactly one element to save it.",           modifier:"You cannot add new tracks — only swap or process what's already there." },
  { id:"beat_common_07", tier:"Common",    points:100,  prompt:"Make a hard-hitting beat using a car alarm sound effect as your main transition riser.",             modifier:"Pitch-bend the alarm up right before the drop." },
  { id:"beat_common_08", tier:"Common",    points:100,  prompt:"Make a high-energy beat tailored for blasting out of a car with old, blown-out speakers.",           modifier:"Focus all your energy on making the 80–120Hz frequency range thump." },
  { id:"beat_common_09", tier:"Common",    points:100,  prompt:"Make a lo-fi beat that samples the clicking sound of a pocket lighter.",                             modifier:"Use the click as a subtle pre-snare or pocket element." },
  { id:"beat_common_10", tier:"Common",    points:100,  prompt:"Make a 4-bar loop so catchy that it doesn't need a single arrangement change to stay interesting.",  modifier:"Use subtle panning automation on the percussion to keep it moving." },
  // --- RARE (250 XP) ---
  { id:"beat_rare_01",   tier:"Rare",      points:250,  prompt:"Make a beat using only 3 distinct sound sources — make every single one carry its weight.",          modifier:"Manipulate pitch, delay, and filtering to turn one sound into multiple roles." },
  { id:"beat_rare_02",   tier:"Rare",      points:250,  prompt:"Make a heavy beat with absolutely no kick drum at all.",                                              modifier:"Find an alternative transient or low-end drop to ground the 1." },
  { id:"beat_rare_03",   tier:"Rare",      points:250,  prompt:"Make a full, evolving instrumental using nothing longer than a strict 2-bar loop.",                   modifier:"Keep it dynamic using automated filters, mute groups, and live arrangement shifts." },
  { id:"beat_rare_04",   tier:"Rare",      points:250,  prompt:"Make a beat at a crawling 70 BPM, but configure the percussion to make it feel incredibly fast.",    modifier:"Utilize double-time triplet hi-hats and rapid rimshots." },
  { id:"beat_rare_05",   tier:"Rare",      points:250,  prompt:"Make a beat at a frantic 140 BPM, but structure the melodies to make it feel deeply relaxed.",       modifier:"Use long, sweeping pads and half-time basslines." },
  { id:"beat_rare_06",   tier:"Rare",      points:250,  prompt:"Make a beat where the main vocal sample becomes completely unrecognizable by the drop.",              modifier:"Chop, reverse, and stretch it beyond human recognition." },
  { id:"beat_rare_07",   tier:"Rare",      points:250,  prompt:"Make a beat where an aggressive bassline carries the entire emotional weight of the song.",           modifier:"The melody instruments must remain stark, thin, and cold." },
  { id:"beat_rare_08",   tier:"Rare",      points:250,  prompt:"Make a modern hip-hop beat, but you are forbidden from using any stock or custom hi-hats.",           modifier:"Find an organic sound (shaker, key jangle, or rustle) to fill the high-end gap." },
  { id:"beat_rare_09",   tier:"Rare",      points:250,  prompt:"Sidechain your entire master channel to a transient percussion instrument.",                          modifier:"Make the whole track duck aggressively whenever that accent hits." },
  { id:"beat_rare_10",   tier:"Rare",      points:250,  prompt:"Make a heavy trap beat, but you can only use stock plugins from your DAW for processing.",            modifier:"No third-party plugins — rely strictly on creative leveling and stock saturation." },
  { id:"beat_rare_11",   tier:"Rare",      points:250,  prompt:"Design a massive 808 bass slide that functions as the actual melody of the track.",                   modifier:"The mid-range instruments must stay entirely static while the bass jumps octaves." },
  { id:"beat_rare_12",   tier:"Rare",      points:250,  prompt:"Make a track in 3/4 or 6/8 time signature, but force it to feel like a dancefloor track.",           modifier:"Keep a heavy transient hit on the first beat of every bar." },
  // --- EPIC (500 XP) ---
  { id:"beat_epic_01",   tier:"Epic",      points:500,  prompt:"Make an Amapiano track that feels simultaneously like a somber funeral and a massive celebration.",   modifier:"Juxtapose a minor-key chord progression with an explosive, high-energy log drum." },
  { id:"beat_epic_02",   tier:"Epic",      points:500,  prompt:"Make a drill beat that samples a traditional lullaby — keep both distinct energies fully intact.",    modifier:"The slide bass must glide underneath the delicate melody without drowning it out." },
  { id:"beat_epic_03",   tier:"Epic",      points:500,  prompt:"Make a heavy gqom beat for a high-intensity scene taking place underwater.",                          modifier:"Apply low-pass filters that open and close like a diver surfacing." },
  { id:"beat_epic_04",   tier:"Epic",      points:500,  prompt:"Make an Afrobeats track featuring a complex, authentic classical string arrangement underneath.",     modifier:"Let the violins lead the call-and-response pattern instead of a synth." },
  { id:"beat_epic_05",   tier:"Epic",      points:500,  prompt:"Make a beat that kicks off as classic 90s kwaito and mutates into something unrecognizable by the end.", modifier:"Gradually accelerate the BPM by 15–20 beats over the course of the arrangement." },
  { id:"beat_epic_06",   tier:"Epic",      points:500,  prompt:"Create a Highlife x Phonk crossover track.",                                                          modifier:"Blend clean West African guitar riffs with blown-out, cowbell-driven 808s." },
  { id:"beat_epic_07",   tier:"Epic",      points:500,  prompt:"An Afrofuturist anthem — what does South African electronic music sound like in the year 2080?",      modifier:"Build sound patches using heavily processed real-world metallic field recordings." },
  { id:"beat_epic_08",   tier:"Epic",      points:500,  prompt:"Mashup: Create a heavy Gqom track infused with golden-era 90s Boom-Bap jazz chords.",                modifier:"The bass must be dark and industrial, but the Rhodes keys must stay smooth and soulful." },
  { id:"beat_epic_09",   tier:"Epic",      points:500,  prompt:"Make an Amapiano track, but replace the iconic log drum with a live or synthesized funk slap-bass.",  modifier:"Keep the exact same rhythmic patterns, but shift the sonic texture entirely." },
  { id:"beat_epic_10",   tier:"Epic",      points:500,  prompt:"Produce an entire instrumental that relies entirely on a single chord progression throughout.",        modifier:"Create energy shifts solely by adding or subtracting frequency ranges and layers." },
  { id:"beat_epic_11",   tier:"Epic",      points:500,  prompt:"Make a beat that encapsulates the eerie, quiet stillness of a city street during a blackout.",        modifier:"Use long, spacey delays and sparse, echoing percussive hits." },
  // --- LEGENDARY (1000 XP) ---
  { id:"beat_legend_01", tier:"Legendary", points:1000, prompt:"Open the oldest, most intimidating unfinished masterpiece you have — and finally export the master.", modifier:"No adding sections. Arrange what you have, mix it down, and call it complete." },
  { id:"beat_legend_02", tier:"Legendary", points:1000, prompt:"Remake a legendary, classic local radio instrumental entirely from pure memory.",                     modifier:"Absolutely no looking up the original track, key, samples, or reference material." },
  { id:"beat_legend_03", tier:"Legendary", points:1000, prompt:"Create a complete, hard-hitting beat using exclusively samples generated by your own voice.",         modifier:"Click your tongue for percussion, hum the sub-bass, and snap for claps." },
  { id:"beat_legend_04", tier:"Legendary", points:1000, prompt:"Step out of bounds: produce a track in a genre you have openly disliked or never attempted.",         modifier:"Research its core rhythms for 10 minutes, then build it from scratch." },
  { id:"beat_legend_05", tier:"Legendary", points:1000, prompt:"Create a rich, complex melodic beat using only white noise and filters.",                             modifier:"Synthesize your own kicks, snares, and melodies out of pure static using heavy automation." },
  { id:"beat_legend_06", tier:"Legendary", points:1000, prompt:"Make a track that smoothly accelerates from 90 BPM to 130 BPM across the entire arrangement.",       modifier:"Start at a slow crawl and finish at a frantic sprint — no jarring jump cuts." },
];

// ── Tier config ───────────────────────────────────────────────────────────────
const TIER_CONFIG = {
  Common:    { color: '#9ca3af', bg: 'rgba(156,163,175,0.15)', border: 'rgba(156,163,175,0.3)',  weight: 50 },
  Rare:      { color: '#60a5fa', bg: 'rgba(96,165,250,0.15)',  border: 'rgba(96,165,250,0.3)',   weight: 30 },
  Epic:      { color: '#a78bfa', bg: 'rgba(167,139,250,0.15)', border: 'rgba(167,139,250,0.3)',  weight: 15 },
  Legendary: { color: '#fbbf24', bg: 'rgba(251,191,36,0.15)',  border: 'rgba(251,191,36,0.4)',   weight: 5  },
};

// ── Generic modifiers (combinator pool) ───────────────────────────────────────
const GENERIC_MODIFIERS = [
  "You have exactly 20 minutes to finish this.",
  "Use only one microphone for the entire session.",
  "You can't listen back until the whole project is exported.",
  "Pitch down your final master by 2 semitones.",
  "Upload the raw, unmixed export directly — no final polish.",
  "No headphones — monitor on speakers only.",
  "Start recording within 5 minutes of reading this.",
  "The first take is the final take. No do-overs.",
  "Record in one room with zero acoustic treatment.",
  "Finish it tonight — no saving for tomorrow.",
  "Share a 30-second clip before midnight.",
  "Name the track before you start making it.",
  "No loops — every element must be played or recorded live.",
  "Dedicate it to someone specific before you begin.",
  "The final track must be under 2 minutes.",
  "No compression anywhere in the mix.",
  "Bounce to mono only — no stereo.",
  "You must collaborate with at least one other person on this.",
  "Record somewhere outside your usual setup.",
  "Post your process in real time while you make it.",
];

// ── Combinator engine ─────────────────────────────────────────────────────────
function generateChallenge(mode) {
  const pool = mode === 'singer' ? SINGER_PROMPTS : BEATMAKER_PROMPTS;

  // Weighted random pick by tier
  const totalWeight = pool.reduce((sum, p) => sum + TIER_CONFIG[p.tier].weight, 0);
  let rand = Math.random() * totalWeight;
  let base = pool[pool.length - 1];
  for (const p of pool) {
    rand -= TIER_CONFIG[p.tier].weight;
    if (rand <= 0) { base = p; break; }
  }

  // Append a generic modifier (50% chance)
  const extraMod = Math.random() < 0.5
    ? ' ALSO: ' + GENERIC_MODIFIERS[Math.floor(Math.random() * GENERIC_MODIFIERS.length)]
    : '';

  return { ...base, modifier: base.modifier + extraMod };
}

// Flat exports for weekly-wheel-spin.js compatibility
export const ALL_SINGER_PROMPTS = SINGER_PROMPTS.map(p => p.prompt);
export const ALL_BEATMAKER_PROMPTS = BEATMAKER_PROMPTS.map(p => p.prompt);
export const ALL_PROMPTS = [...ALL_SINGER_PROMPTS, ...ALL_BEATMAKER_PROMPTS];

// ── Slice colors — dark palette matching app aesthetic ───────────────────────
const SLICE_COLORS = [
  ['rgba(139,92,246,0.7)',  'rgba(109,40,217,0.9)'],   // purple
  ['rgba(30,30,40,0.95)',   'rgba(15,15,25,1)'],        // near-black
  ['rgba(79,70,229,0.7)',   'rgba(55,48,163,0.9)'],     // indigo
  ['rgba(20,20,35,0.95)',   'rgba(10,10,20,1)'],        // deep black
  ['rgba(124,58,237,0.65)', 'rgba(91,33,182,0.9)'],     // violet
  ['rgba(25,25,40,0.95)',   'rgba(12,12,28,1)'],        // dark
  ['rgba(67,56,202,0.65)',  'rgba(49,46,129,0.9)'],     // deep indigo
  ['rgba(15,15,30,0.95)',   'rgba(8,8,18,1)'],          // darkest
  ['rgba(109,40,217,0.6)',  'rgba(76,29,149,0.9)'],     // deep purple
  ['rgba(22,22,38,0.95)',   'rgba(11,11,22,1)'],        // near-black 2
];

function chime() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    [[523.25,0],[659.25,0.13],[783.99,0.26],[1046.5,0.39]].forEach(([freq,delay]) => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.connect(g); g.connect(ctx.destination);
      o.type = 'sine'; o.frequency.value = freq;
      const t = ctx.currentTime + delay;
      g.gain.setValueAtTime(0,t);
      g.gain.linearRampToValueAtTime(0.2,t+0.04);
      g.gain.exponentialRampToValueAtTime(0.001,t+0.65);
      o.start(t); o.stop(t+0.7);
    });
  } catch(e) {}
}

function polarToXY(deg, r, cx, cy) {
  const rad = ((deg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function slicePath(i, total, cx, cy, r) {
  const a = 360/total, s = i*a, e = s+a;
  const p1 = polarToXY(s,r,cx,cy), p2 = polarToXY(e,r,cx,cy);
  return `M${cx},${cy} L${p1.x},${p1.y} A${r},${r} 0 ${a>180?1:0},1 ${p2.x},${p2.y} Z`;
}

// Fixed 12-slice wheel — no text, clean color blocks
const WHEEL_SLICES = 12;
const WHEEL_COLORS = [
  ['rgba(139,92,246,0.85)',  'rgba(109,40,217,1)'],    // purple
  ['rgba(30,30,50,0.95)',    'rgba(15,15,30,1)'],       // near-black
  ['rgba(99,102,241,0.8)',   'rgba(67,56,202,1)'],      // indigo
  ['rgba(20,20,40,0.95)',    'rgba(10,10,25,1)'],       // deep black
  ['rgba(124,58,237,0.85)',  'rgba(91,33,182,1)'],      // violet
  ['rgba(25,25,45,0.95)',    'rgba(12,12,28,1)'],       // dark
  ['rgba(79,70,229,0.8)',    'rgba(55,48,163,1)'],      // deep indigo
  ['rgba(15,15,35,0.95)',    'rgba(8,8,20,1)'],         // darkest
  ['rgba(109,40,217,0.8)',   'rgba(76,29,149,1)'],      // deep purple
  ['rgba(22,22,42,0.95)',    'rgba(11,11,24,1)'],       // near-black 2
  ['rgba(167,139,250,0.5)',  'rgba(139,92,246,0.8)'],   // light purple
  ['rgba(18,18,38,0.95)',    'rgba(9,9,20,1)'],         // darkest 2
];

function WheelSVG({ rotation, size }) {
  const cx = size/2, cy = size/2, r = size/2 - 4;
  const total = WHEEL_SLICES;
  const sa = 360 / total;

  return (
    <svg width={size} height={size}
      style={{ transform: `rotate(${rotation}deg)`, transition: 'transform 0s', display: 'block' }}>
      <defs>
        {WHEEL_COLORS.map(([c1,c2],i) => (
          <radialGradient key={i} id={`wfm${i}`} cx="35%" cy="25%" r="85%">
            <stop offset="0%" stopColor={c1}/>
            <stop offset="100%" stopColor={c2}/>
          </radialGradient>
        ))}
        <radialGradient id="wfmhub" cx="40%" cy="30%" r="70%">
          <stop offset="0%" stopColor="rgba(139,92,246,0.5)"/>
          <stop offset="100%" stopColor="rgba(0,0,0,0.95)"/>
        </radialGradient>
        <radialGradient id="wfmshine" cx="40%" cy="15%" r="65%">
          <stop offset="0%" stopColor="rgba(255,255,255,0.07)"/>
          <stop offset="100%" stopColor="rgba(255,255,255,0)"/>
        </radialGradient>
      </defs>

      {Array.from({ length: total }).map((_, i) => {
        const ci = i % WHEEL_COLORS.length;
        return (
          <path
            key={i}
            d={slicePath(i, total, cx, cy, r)}
            fill={`url(#wfm${ci})`}
            stroke="rgba(0,0,0,0.4)"
            strokeWidth="1.2"
          />
        );
      })}

      {/* Subtle shine overlay */}
      <circle cx={cx} cy={cy} r={r} fill="url(#wfmshine)" style={{ pointerEvents: 'none' }}/>

      {/* Rim */}
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="rgba(139,92,246,0.25)" strokeWidth="1.5"/>

      {/* Hub */}
      <circle cx={cx} cy={cy} r={20} fill="url(#wfmhub)" stroke="rgba(139,92,246,0.35)" strokeWidth="1.5"/>
      <circle cx={cx} cy={cy} r={9} fill="rgba(139,92,246,0.7)"/>
      <circle cx={cx-3} cy={cy-3} r={3} fill="rgba(255,255,255,0.25)"/>
    </svg>
  );
}

function slugify(text) {
  const base = text.toString().toLowerCase().trim()
    .replace(/\s+/g, '-').replace(/[^\w\-]+/g, '').replace(/\-\-+/g, '-');
  return `${base}-${Date.now().toString(36)}`;
}

function timeLeft(date) {
  if (!date) return null;
  const ms = new Date(date).getTime() - Date.now();
  if (ms <= 0) return 'Ended';
  const d = Math.floor(ms/86400000);
  const h = Math.floor((ms%86400000)/3600000);
  const m = Math.floor((ms%3600000)/60000);
  if (d > 0) return `${d}d ${h}h left`;
  if (h > 0) return `${h}h ${m}m left`;
  return `${m}m left`;
}



// ── ChallengeUploadSheet ──────────────────────────────────────────────────────
// Bottom sheet that appears when "Upload + Complete" is tapped on a personal
// challenge card. Only shows title, audio upload, and cover — all other upload
// features are locked. On submit: saves track, records challenge_completion,
// and upserts challenge_xp.


function ChallengeUploadSheet({ challenge, user, onClose, onComplete }) {
  const [title, setTitle]       = useState('');
  const [audioFile, setAudio]   = useState(null);
  const [coverFile, setCover]   = useState(null);
  const [coverPreview, setCP]   = useState(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError]       = useState('');
  const audioRef                = React.useRef();
  const coverRef                = React.useRef();

  const tc = {
    Common:    { color: '#9ca3af', bg: 'rgba(156,163,175,0.12)', border: 'rgba(156,163,175,0.25)' },
    Rare:      { color: '#60a5fa', bg: 'rgba(96,165,250,0.12)',  border: 'rgba(96,165,250,0.25)'  },
    Epic:      { color: '#a78bfa', bg: 'rgba(167,139,250,0.12)', border: 'rgba(167,139,250,0.25)' },
    Legendary: { color: '#fbbf24', bg: 'rgba(251,191,36,0.12)',  border: 'rgba(251,191,36,0.3)'   },
  }[challenge.tier] || { color: '#9ca3af', bg: 'rgba(156,163,175,0.12)', border: 'rgba(156,163,175,0.25)' };

  const handleCover = e => {
    const f = e.target.files?.[0];
    if (!f) return;
    setCover(f);
    setCP(URL.createObjectURL(f));
  };

  const handleSubmit = async () => {
    if (!title.trim()) { setError('Track title is required.'); return; }
    if (!audioFile)    { setError('Please select an audio file.'); return; }
    setError('');
    setUploading(true);

    try {
      const { data: { user: u } } = await supabase.auth.getUser();
      if (!u) throw new Error('Not logged in');

      // Get artist
      const { data: artist } = await supabase.from('artists').select('id').eq('user_id', u.id).maybeSingle();
      if (!artist) throw new Error('Artist profile not found');

      // Upload audio
      const audioExt = audioFile.name.split('.').pop();
      const audioPath = `${u.id}/${Date.now()}_challenge.${audioExt}`;
      const { error: audioErr } = await supabase.storage.from('tracks').upload(audioPath, audioFile, { cacheControl: '31536000' });
      if (audioErr) throw audioErr;
      const { data: { publicUrl: audioUrl } } = supabase.storage.from('tracks').getPublicUrl(audioPath);

      // Upload cover (optional)
      let coverUrl = null;
      if (coverFile) {
        const coverExt = coverFile.name.split('.').pop();
        const coverPath = `${u.id}/${Date.now()}_challenge_cover.${coverExt}`;
        const { error: covErr } = await supabase.storage.from('covers').upload(coverPath, coverFile, { cacheControl: '31536000' });
        if (!covErr) {
          const { data: { publicUrl } } = supabase.storage.from('covers').getPublicUrl(coverPath);
          coverUrl = publicUrl;
        }
      }

      // Insert track — challenge-tagged, other features locked off
      const { data: track, error: trackErr } = await supabase.from('tracks').insert({
        artist_id:         artist.id,
        title:             title.trim(),
        slug:              slugify(title.trim()),
        file_url:          audioUrl,
        cover_artwork_url: coverUrl,
        is_published:      true,
        is_explicit:       false,
        is_downloadable:   false,
        is_premium:        false,
        pay_what_you_want: false,
        is_preorder:       false,
        created_at:        new Date().toISOString(),
        updated_at:        new Date().toISOString(),
      }).select().single();
      if (trackErr) throw trackErr;

      // Record completion
      await supabase.from('challenge_completions').insert({
        user_id:          u.id,
        challenge_id:     challenge.id,
        challenge_tier:   challenge.tier,
        challenge_points: challenge.points,
        challenge_prompt: challenge.prompt,
        track_id:         track.id,
        completed_at:     new Date().toISOString(),
      });

      // Upsert XP
      const tierCol = `${challenge.tier.toLowerCase()}_count`;
      const { data: existing } = await supabase.from('challenge_xp').select('*').eq('user_id', u.id).maybeSingle();
      if (existing) {
        await supabase.from('challenge_xp').update({
          total_xp:    existing.total_xp + challenge.points,
          [tierCol]:   (existing[tierCol] || 0) + 1,
          updated_at:  new Date().toISOString(),
        }).eq('user_id', u.id);
      } else {
        await supabase.from('challenge_xp').insert({
          user_id:    u.id,
          total_xp:   challenge.points,
          [tierCol]:  1,
          updated_at: new Date().toISOString(),
        });
      }

      onComplete();
    } catch (err) {
      setError(err.message || 'Upload failed. Please try again.');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[600] flex items-end justify-center bg-black/70 backdrop-blur-sm"
      onClick={onClose}>
      <div className="w-full max-w-lg bg-neutral-900 rounded-t-2xl border-t border-white/[0.08]"
        onClick={e => e.stopPropagation()}>

        {/* Handle */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full bg-white/10" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-2 pb-4 border-b border-white/[0.06]">
          <div>
            <h3 className="text-sm font-bold text-white">Submit Challenge Track</h3>
            <p className="text-[11px] text-white/30 mt-0.5">Upload your track to claim your XP</p>
          </div>
          <button onClick={onClose}><X className="w-4 h-4 text-white/30" /></button>
        </div>

        <div className="px-5 py-4 overflow-y-auto max-h-[75vh] space-y-4">

          {/* Challenge recap */}
          <div className="rounded-xl p-3" style={{ background: tc.bg, border: `1px solid ${tc.border}` }}>
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: tc.color }}>{challenge.tier}</span>
              <span className="text-[10px] font-bold" style={{ color: tc.color }}>+{challenge.points} XP</span>
            </div>
            <p className="text-xs text-white/70 leading-relaxed">{challenge.prompt}</p>
          </div>

          {/* Title */}
          <div>
            <label className="text-[11px] text-white/40 uppercase tracking-wider block mb-1.5">Track Title *</label>
            <input
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="Name your track"
              maxLength={100}
              className="w-full bg-white/[0.06] rounded-xl px-3 py-2.5 text-sm text-white placeholder-white/20 outline-none border border-white/[0.06] focus:border-white/20"
            />
          </div>

          {/* Audio upload */}
          <div>
            <label className="text-[11px] text-white/40 uppercase tracking-wider block mb-1.5">Audio File *</label>
            <button onClick={() => audioRef.current?.click()}
              className="w-full rounded-xl px-3 py-3 text-sm border border-dashed border-white/[0.12] bg-white/[0.03] text-white/40 hover:bg-white/[0.06] transition flex items-center justify-center space-x-2">
              <Upload className="w-4 h-4" />
              <span>{audioFile ? audioFile.name : 'Choose MP3, WAV, or AAC'}</span>
            </button>
            <input ref={audioRef} type="file" accept="audio/*" className="hidden" onChange={e => setAudio(e.target.files?.[0] || null)} />
          </div>

          {/* Cover (optional) */}
          <div>
            <label className="text-[11px] text-white/40 uppercase tracking-wider block mb-1.5">Cover Art <span className="normal-case text-white/20">(optional)</span></label>
            <div className="flex items-center space-x-3">
              {coverPreview
                ? <img src={coverPreview} alt="" className="w-14 h-14 rounded-xl object-cover border border-white/10" />
                : <div className="w-14 h-14 rounded-xl bg-white/[0.06] border border-dashed border-white/[0.10] flex items-center justify-center">
                    <Music className="w-5 h-5 text-white/20" />
                  </div>
              }
              <button onClick={() => coverRef.current?.click()}
                className="text-xs text-white/40 hover:text-white/60 transition">
                {coverPreview ? 'Change image' : 'Upload image'}
              </button>
            </div>
            <input ref={coverRef} type="file" accept="image/*" className="hidden" onChange={handleCover} />
          </div>

          {/* Locked features notice */}
          <div className="rounded-xl px-3 py-2.5 bg-white/[0.02] border border-white/[0.05]">
            <p className="text-xs text-white/50 leading-relaxed">
              This is a challenge upload. Album assignment, download pricing, collaborators, and presave are not available here. Use the full upload panel from your dashboard for those features.
            </p>
          </div>

          {error && <p className="text-xs text-red-400">{error}</p>}

          {/* Submit */}
          <button onClick={handleSubmit} disabled={uploading}
            className="w-full py-3 rounded-xl text-sm font-bold text-white transition disabled:opacity-40 flex items-center justify-center space-x-2"
            style={{ background: tc.color }}>
            {uploading
              ? <><div className="w-4 h-4 rounded-full border-2 border-white/20 border-t-white animate-spin" /><span>Uploading...</span></>
              : <><Upload className="w-4 h-4" /><span>Upload & Claim {challenge.points} XP</span></>
            }
          </button>
        </div>
      </div>
    </div>
  );
}

export default function WheelRevealPage() {
  const navigate = useNavigate();
  const { user } = useAuth();

  const [mode, setMode] = useState('platform'); // 'platform' | 'personal'
  const [personalMode, setPersonalMode] = useState('both'); // 'singer' | 'beatmaker' | 'both'
  const [challenge, setChallenge]       = useState(null);
  const [pastChallenges, setPast]       = useState([]);
  const [loading, setLoading]           = useState(true);
  const [rotation, setRotation]         = useState(0);
  const [spinning, setSpinning]         = useState(false);
  const [revealed, setRevealed]         = useState(false);
  const [personalResult, setPersonalResult]       = useState(null); // { prompt, modifier, tier, points, id }
  const [showChallengeUpload, setShowChallengeUpload] = useState(false);
  const [completionSaved, setCompletionSaved]         = useState(false);
  const [spinsUsed, setSpinsUsed]           = useState(0);
  const SPIN_CAP = 5;

  const animRef = useRef(null);
  const pendingChallengeRef = useRef(null);
  const stRef   = useRef(null);
  const rotRef  = useRef(0);

  const getPromptPool = () => {
    if (mode === 'personal') {
      if (personalMode === 'singer') return SINGER_PROMPTS;
      if (personalMode === 'beatmaker') return BEATMAKER_PROMPTS;
      return ALL_PROMPTS;
    }
    return ALL_PROMPTS;
  };

  const prompts = getPromptPool();

  const load = useCallback(async () => {
    setLoading(true);
    const { data: current } = await supabase
      .from('wheel_challenges')
      .select('*, competitions(*)')
      .eq('is_current', true)
      .maybeSingle();
    setChallenge(current);

    const { data: past } = await supabase
      .from('wheel_challenges')
      .select('*, competitions(id, title, status)')
      .eq('is_current', false)
      .order('spun_at', { ascending: false })
      .limit(8);
    setPast(past || []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  // Auto-spin to current week's prompt on load
  useEffect(() => {
    if (!user) { navigate('/login'); return; }
    if (!challenge || spinning || revealed || mode !== 'platform') return;
    const idx = ALL_PROMPTS.findIndex(p => p === challenge.prompt);
    if (idx >= 0) {
      const t = setTimeout(() => spinToIndex(idx, ALL_PROMPTS), 600);
      return () => clearTimeout(t);
    }
  }, [challenge, mode]); // eslint-disable-line

  const easeOut = t => 1 - Math.pow(1 - t, 4);

  const spinToIndex = (targetIdx, pool) => {
    setSpinning(true);
    setRevealed(false);
    setPersonalResult(null);
    // Map prompt index to one of the 12 wheel slices
    const sliceIdx = targetIdx % WHEEL_SLICES;
    const total = WHEEL_SLICES;
    const sa = 360 / total;
    const targetDeg = 360 - (sliceIdx * sa + sa / 2);
    const startRot = rotRef.current;
    const totalRotation = startRot + 5 * 360 + ((targetDeg - startRot % 360) + 360) % 360;
    const duration = mode === 'personal' ? 3500 : 4800;
    stRef.current = null;

    const animate = (ts) => {
      if (!stRef.current) stRef.current = ts;
      const p = Math.min((ts - stRef.current) / duration, 1);
      const cur = startRot + easeOut(p) * (totalRotation - startRot);
      setRotation(cur);
      rotRef.current = cur;
      if (p < 1) { animRef.current = requestAnimationFrame(animate); return; }
      setRotation(totalRotation);
      rotRef.current = totalRotation;
      setSpinning(false);
      chime();
      if (mode === 'personal') setPersonalResult(pendingChallengeRef.current || { prompt: pool[targetIdx], tier: 'Common', points: 100, modifier: '' });
      setTimeout(() => setRevealed(true), 250);
    };
    animRef.current = requestAnimationFrame(animate);
  };

  const spinPersonal = () => {
    if (!user) { navigate('/login'); return; }
    if (spinning) return;
    if (spinsUsed >= SPIN_CAP) return;
    const challengeMode = personalMode === 'beatmaker' ? 'beatmaker' : 'singer';
    const challenge = generateChallenge(challengeMode);
    // Map to a wheel slice index for animation
    const pool = getPromptPool();
    const idx = Math.floor(Math.random() * pool.length);
    // Store the full challenge object, spin the wheel
    pendingChallengeRef.current = challenge;
    spinToIndex(idx, pool);
    setSpinsUsed(prev => prev + 1);
  };

  useEffect(() => () => cancelAnimationFrame(animRef.current), []);

  const size = typeof window !== 'undefined' ? Math.min(window.innerWidth - 48, 320) : 300;

  return (
    <div className="min-h-screen bg-black text-white pb-32">

      {/* Header — sticky */}
      <div className="sticky top-0 z-30 bg-black/90 backdrop-blur-sm flex items-center justify-between px-4 pt-14 pb-4 md:pt-6 border-b border-white/[0.04]">
        <button onClick={() => navigate('/competitions')}
          className="w-9 h-9 flex items-center justify-center rounded-full bg-white/[0.06] hover:bg-white/[0.08] transition">
          <ArrowLeft className="w-4 h-4 text-white/60" />
        </button>
        <div className="text-center">
          <h1 className="text-lg font-bold text-white">Collab Roulette</h1>
          <p className="text-xs text-white/50 uppercase tracking-wider">Spin · Create · Drop It</p>
        </div>
        <div className="w-9" />
      </div>

      {/* Mode toggle */}
      <div className="flex space-x-1 mx-4 mb-5 p-1 rounded-xl bg-white/[0.03] border border-white/[0.06]">
        {[
          { key: 'platform', label: '🎲 Weekly Challenge' },
          { key: 'personal', label: '🎯 Spin for Yourself' },
        ].map(({ key, label }) => (
          <button key={key} onClick={() => {
            setMode(key);
            setRevealed(false);
            setPersonalResult(null);
            setRotation(0);
            rotRef.current = 0;
          }}
            className={`flex-1 py-2 rounded-lg text-xs font-semibold transition ${
              mode === key ? 'bg-white text-black' : 'text-white/40 hover:text-white/60'
            }`}>
            {label}
          </button>
        ))}
      </div>

      {/* Personal mode filter */}
      {mode === 'personal' && (
        <div className="flex space-x-2 mx-4 mb-4">
          {[
            { key: 'both', label: 'All' },
            { key: 'singer', label: '🎤 Vocalist' },
            { key: 'beatmaker', label: '🎛️ Producer' },
          ].map(({ key, label }) => (
            <button key={key} onClick={() => {
              setPersonalMode(key);
              setRevealed(false);
              setPersonalResult(null);
            }}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition ${
                personalMode === key
                  ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30'
                  : 'bg-white/[0.04] text-white/40 border border-white/[0.06]'
              }`}>
              {label}
            </button>
          ))}
        </div>
      )}

      {loading && mode === 'platform' ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-6 h-6 rounded-full border-2 border-white/10 border-t-purple-500 animate-spin" />
        </div>
      ) : (
        <div className="flex flex-col items-center px-4">

          {/* Reveal card — shown ABOVE the wheel after spin */}
          {mode === 'platform' && revealed && challenge && (
            <div className="w-full max-w-sm rounded-2xl border border-white/[0.08] bg-white/[0.03] p-5 mb-5"
              style={{ animation: 'fadeUp 0.4s ease' }}>
              <div className="flex items-center space-x-2 mb-3">
                <span className="text-xs text-white/50 uppercase tracking-wider">This week's challenge</span>
                <span className="text-[11px] px-1.5 py-0.5 rounded-full font-bold bg-purple-500/15 text-purple-400 border border-purple-500/20">
                  {challenge.mode === 'singer' ? '🎤 Vocalist' : '🎛️ Producer'}
                </span>
              </div>
              <p className="text-lg font-bold text-white leading-relaxed mb-4"
                style={{ whiteSpace: 'pre-line' }}>
                {challenge.prompt}
              </p>
              {challenge.competitions && (
                <div className="flex space-x-4 mb-4">
                  {challenge.competitions.entries_close_at && challenge.competitions.status === 'open' && (
                    <div>
                      <p className="text-[11px] text-white/25 uppercase tracking-wider mb-0.5">Entries close</p>
                      <p className="text-xs font-bold text-white flex items-center space-x-1">
                        <Clock className="w-3 h-3 text-green-400" />
                        <span>{timeLeft(challenge.competitions.entries_close_at)}</span>
                      </p>
                    </div>
                  )}
                  {challenge.competitions.voting_close_at && challenge.competitions.status === 'voting' && (
                    <div>
                      <p className="text-[11px] text-white/25 uppercase tracking-wider mb-0.5">Voting closes</p>
                      <p className="text-xs font-bold text-white flex items-center space-x-1">
                        <Clock className="w-3 h-3 text-purple-400" />
                        <span>{timeLeft(challenge.competitions.voting_close_at)}</span>
                      </p>
                    </div>
                  )}
                </div>
              )}
              <div className="flex items-center space-x-2 p-3 rounded-xl bg-white/[0.03] border border-white/[0.06] mb-4">
                <Trophy className="w-4 h-4 text-yellow-400/70 flex-shrink-0" />
                <p className="text-xs text-white/60">Win 3 months Pro or Premium — automatically applied</p>
              </div>
              {challenge.competitions?.id && (
                <button
                  onClick={() => navigate(`/competition/${challenge.competitions.id}`)}
                  className="w-full py-3 rounded-xl text-sm font-bold text-white bg-purple-600 hover:bg-purple-500 transition active:scale-[0.98]">
                  {challenge.competitions.status === 'voting' ? '🗳️ Vote Now' :
                   challenge.competitions.status === 'open'   ? '🎵 Enter Challenge' : 'View Challenge'}
                </button>
              )}
            </div>
          )}

          {mode === 'personal' && revealed && personalResult && (() => {
            const tier = personalResult.tier || 'Common';
            const tc = TIER_CONFIG[tier] || TIER_CONFIG.Common;
            const pts = personalResult.points || 100;
            return (
              <div className="w-full max-w-sm rounded-2xl p-5 mb-5"
                style={{ animation: 'fadeUp 0.4s ease', background: 'rgba(255,255,255,0.03)', border: `1px solid ${tc.border}` }}>
                {/* Tier + XP */}
                <div className="flex items-center justify-between mb-3">
                  <span className="text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full"
                    style={{ color: tc.color, background: tc.bg, border: `1px solid ${tc.border}` }}>
                    {tier}
                  </span>
                  <span className="text-[10px] font-bold" style={{ color: tc.color }}>+{pts} XP</span>
                </div>
                {/* Prompt */}
                <p className="text-lg font-bold text-white leading-relaxed mb-3"
                  style={{ whiteSpace: 'pre-line' }}>
                  {personalResult.prompt}
                </p>
                {/* Modifier */}
                {personalResult.modifier && (
                  <div className="rounded-xl px-3 py-2 mb-4"
                    style={{ background: tc.bg, border: `1px solid ${tc.border}` }}>
                    <p className="text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color: tc.color }}>Modifier</p>
                    <p className="text-xs text-white/70">{personalResult.modifier}</p>
                  </div>
                )}
                <div className="flex space-x-2">
                  <button onClick={spinPersonal}
                    disabled={spinsUsed >= SPIN_CAP}
                    className="flex-1 flex items-center justify-center space-x-1.5 py-2.5 rounded-xl text-xs font-medium bg-white/[0.06] text-white/50 hover:bg-white/[0.1] transition border border-white/[0.06] disabled:opacity-30">
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>{spinsUsed >= SPIN_CAP ? 'Done for today' : 'Spin Again'}</span>
                  </button>
                  {user && !completionSaved && (
                    <button onClick={() => setShowChallengeUpload(true)}
                      className="flex-1 flex items-center justify-center space-x-1.5 py-2.5 rounded-xl text-xs font-bold text-white transition"
                      style={{ background: tc.color }}>
                      <Upload className="w-3.5 h-3.5" />
                      <span>Upload + Complete</span>
                    </button>
                  )}
                  {completionSaved && (
                    <div className="flex-1 flex items-center justify-center space-x-1.5 py-2.5 rounded-xl text-xs font-bold text-white/60 bg-white/[0.04] border border-white/[0.06]">
                      <Check className="w-3.5 h-3.5 text-green-400" />
                      <span>XP Saved!</span>
                    </div>
                  )}
                </div>
                <p className="text-xs text-white/45 text-center mt-3">
                  Personal spins are just for fun — no competition entry
                </p>
              </div>
            );
          })()}

          {/* Wheel */}
          <div className="relative mb-6">
            {/* Subtle glow behind wheel */}
            <div className="absolute inset-0 rounded-full blur-2xl opacity-20"
              style={{ background: 'radial-gradient(circle, rgba(139,92,246,0.6) 0%, transparent 70%)' }} />

            {/* Bezel */}
            <div className="relative" style={{
              borderRadius: '50%',
              padding: 6,
              background: 'linear-gradient(145deg, rgba(255,255,255,0.08) 0%, rgba(0,0,0,0.4) 100%)',
              border: '1px solid rgba(255,255,255,0.08)',
              boxShadow: '0 8px 32px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.06)',
            }}>
              <WheelSVG rotation={rotation} size={size} />
            </div>

            {/* Pointer */}
            <div className="absolute" style={{ top: -4, left: '50%', transform: 'translateX(-50%)', zIndex: 20 }}>
              <div style={{
                width: 0, height: 0,
                borderLeft: '9px solid transparent',
                borderRight: '9px solid transparent',
                borderTop: '22px solid rgba(139,92,246,0.9)',
                filter: 'drop-shadow(0 0 6px rgba(139,92,246,0.6))',
              }}/>
            </div>
          </div>

          {/* Spinning indicator */}
          {spinning && (
            <p className="text-xs text-white/30 uppercase tracking-widest mb-4">Spinning...</p>
          )}



          {/* Platform — no active challenge */}
          {mode === 'platform' && !challenge && !loading && (
            <div className="text-center py-8">
              <p className="text-sm text-white/30">Next challenge spins Sunday 9am</p>
            </div>
          )}

          {/* Personal mode — spin button + result */}
          {mode === 'personal' && (
            <>
              <div className="mb-5 flex flex-col items-center space-y-2">
                <button
                  onClick={spinPersonal}
                  disabled={spinning || spinsUsed >= SPIN_CAP}
                  className="flex items-center space-x-2 px-8 py-3 rounded-2xl text-sm font-bold transition active:scale-[0.98] disabled:opacity-40"
                  style={{
                    background: (spinning || spinsUsed >= SPIN_CAP) ? 'rgba(255,255,255,0.04)' : 'rgba(139,92,246,0.2)',
                    border: '1px solid rgba(139,92,246,0.3)',
                    color: (spinning || spinsUsed >= SPIN_CAP) ? 'rgba(255,255,255,0.3)' : '#a78bfa',
                  }}>
                  <Shuffle className="w-4 h-4" />
                  <span>{spinning ? 'Spinning...' : spinsUsed >= SPIN_CAP ? 'Come back tomorrow' : 'Spin the Wheel'}</span>
                </button>
                {spinsUsed > 0 && spinsUsed < SPIN_CAP && (
                  <p className="text-xs text-white/45">{SPIN_CAP - spinsUsed} spin{SPIN_CAP - spinsUsed !== 1 ? 's' : ''} left today</p>
                )}
                {spinsUsed >= SPIN_CAP && (
                  <p className="text-xs text-white/50">Daily limit reached · resets at midnight</p>
                )}
              </div>



              {!spinning && !revealed && (
                <p className="text-xs text-white/20 text-center mb-4">
                  {prompts.length} prompts · spin anytime for inspiration
                </p>
              )}
            </>
          )}

          {/* Past challenges */}
          {mode === 'platform' && pastChallenges.length > 0 && (
            <div className="w-full max-w-sm mt-2">
              <p className="text-xs text-white/50 uppercase tracking-widest font-semibold mb-3">
                Previous Challenges
              </p>
              <div className="space-y-1.5">
                {pastChallenges.map(pc => (
                  <button key={pc.id}
                    onClick={() => pc.competitions?.id && navigate(`/competition/${pc.competitions.id}`)}
                    className="w-full flex items-center space-x-3 p-3 rounded-xl text-left transition hover:bg-white/[0.03] active:scale-[0.98] bg-white/[0.02] border border-white/[0.04]">
                    <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 bg-purple-500/10">
                      <Music className="w-3.5 h-3.5 text-purple-400/60" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-white/70 truncate">
                        {pc.prompt.split('\n').join(' ')}
                      </p>
                      <p className="text-[11px] text-white/25 mt-0.5 uppercase tracking-wide">
                        {new Date(pc.spun_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                        {pc.competitions?.status === 'completed' ? ' · Complete' : ''}
                      </p>
                    </div>
                    {pc.competitions?.id && <ChevronRight className="w-3.5 h-3.5 text-white/15 flex-shrink-0" />}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Challenge upload sheet */}
      {showChallengeUpload && personalResult && (
        <ChallengeUploadSheet
          challenge={personalResult}
          user={user}
          onClose={() => setShowChallengeUpload(false)}
          onComplete={() => {
            setShowChallengeUpload(false);
            setCompletionSaved(true);
          }}
        />
      )}

      {/* Sticky Enter Challenge bar — always visible when active comp exists */}
      {mode === 'platform' && challenge?.competitions?.id &&
       ['open', 'voting'].includes(challenge.competitions.status) && (
        <div className="fixed bottom-16 left-0 right-0 md:left-64 px-4 pb-2 z-40"
          style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.95) 60%, transparent)' }}>
          <button
            onClick={() => navigate(`/competition/${challenge.competitions.id}`)}
            className="w-full py-3.5 rounded-2xl text-sm font-bold text-white bg-purple-600 hover:bg-purple-500 transition active:scale-[0.98] flex items-center justify-center space-x-2">
            <Trophy className="w-4 h-4" />
            <span>{challenge.competitions.status === 'voting' ? 'Vote Now — Voting Open' : "Enter This Week's Challenge"}</span>
          </button>
        </div>
      )}

      <style>{`
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(12px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}