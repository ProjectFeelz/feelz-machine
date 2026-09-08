/**
 * profileShared.js
 *
 * The parts of ProfilePage and ProfileSetup that were byte-identical in both.
 *
 * WHAT THIS IS AND IS NOT
 *
 * These two files had drifted 395 lines apart while doing largely the same job.
 * Every constant and both shared components below were character-for-character
 * identical in the two files — the only difference across the whole 83-line
 * block was a stray `── Slug generation ──` comment header in ProfileSetup,
 * left behind when the slug logic moved out to utils/artistSlug.
 *
 * So extracting them is provably behaviour-preserving, which is the only kind
 * of merge worth doing without a test suite to catch a mistake.
 *
 * This is NOT the whole merge. The two component bodies still differ on ~405
 * substantive lines across about thirty hunks, and those are not duplication —
 * they are divergence. Each one is either a fix that landed in one file and not
 * the other (a latent bug) or a deliberate difference between "set up your
 * profile" and "edit your profile". Collapsing them needs those hunks read one
 * at a time, and picking winners mechanically is how a blanket rewrite broke
 * the build once already.
 *
 * KEEPING THE OLD NAMES
 *
 * GENRES_LIST and MOODS_LIST were defined twice per file — identical to GENRES
 * and MOODS, four copies of two lists in total. They are re-exported as
 * aliases rather than removed, so neither component body needed a single edit.
 * Zero call-site changes is what makes this safe to deploy without retesting
 * both pages line by line.
 *
 * Anything that becomes identical in both files later belongs here too.
 */

import React from 'react';
import {
  Instagram, Twitter, Youtube, MessageCircle, Globe,
  User, Camera, Palette, DollarSign, Check,
} from 'lucide-react';

export const TikTokIcon = ({ className }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor">
    <path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-2.88 2.5 2.89 2.89 0 01-2.89-2.89 2.89 2.89 0 012.89-2.89c.28 0 .54.04.79.1V9.01a6.33 6.33 0 00-.79-.05 6.34 6.34 0 00-6.34 6.34 6.34 6.34 0 006.34 6.34 6.34 6.34 0 006.33-6.34V8.75a8.16 8.16 0 004.77 1.52V6.82a4.85 4.85 0 01-1-.13z"/>
  </svg>
);

export const SOCIALS = [
  { key: 'instagram', label: 'Instagram',   icon: Instagram,     ph: 'https://instagram.com/yourname' },
  { key: 'twitter',   label: 'X (Twitter)', icon: Twitter,       ph: 'https://x.com/yourname' },
  { key: 'youtube',   label: 'YouTube',     icon: Youtube,       ph: 'https://youtube.com/yourchannel' },
  { key: 'tiktok',    label: 'TikTok',      icon: TikTokIcon,    ph: 'https://tiktok.com/@yourname' },
  { key: 'facebook',  label: 'Facebook',    icon: Globe,         ph: 'https://facebook.com/yourpage' },
  { key: 'discord',   label: 'Discord',     icon: MessageCircle, ph: 'Discord invite link' },
  { key: 'website',   label: 'Website',     icon: Globe,         ph: 'https://yourwebsite.com' },
];

export const GENRES = [
  'Hip Hop','Trap','Drill','Boom Bap','Lo-Fi','R&B','Neo Soul','Pop',
  'Electronic','House','Deep House','Tech House','Techno','Dubstep',
  'Drum & Bass','Ambient','Downtempo','Future Bass','Jersey Club',
  'Jazz','Funk','Soul','Rock','Metal','Indie','Alternative',
  'Afrobeat','Amapiano','Reggae','Dancehall','Latin','Reggaeton',
  'Country','EDM','Trance','Hardstyle','UK Garage','Grime',
  'Experimental','Vaporwave','Synthwave','Other',
];

export const MOODS = [
  'Dark','Happy','Sad','Aggressive','Chill','Energetic','Melancholic',
  'Uplifting','Mysterious','Peaceful','Intense','Dreamy','Romantic',
  'Angry','Hopeful','Nostalgic','Epic','Smooth','Bouncy','Atmospheric',
  'Moody','Vibey','Hard','Soft','Ethereal','Groovy','Other',
];

// Aliases. GENRES_LIST/MOODS_LIST were separate but identical declarations in
// both files. Keeping the names means the component bodies are untouched.
export const GENRES_LIST = GENRES;
export const MOODS_LIST  = MOODS;

export const PROFILE_IMAGE_BUCKET = 'artist-images';
export const MAX_DAILY_THOUGHTS   = 3;
export const THOUGHT_TTL_MS       = 24 * 60 * 60 * 1000;
export const BIO_MAX              = 300;

export const ARTIST_TABS = [
  { key: 'profile',  label: 'Profile',  icon: User },
  { key: 'edit',     label: 'Edit',     icon: Camera },
  { key: 'theme',    label: 'Theme',    icon: Palette },
  { key: 'payments', label: 'Payments', icon: DollarSign },
];

export function PillSelect({ options, selected, onToggle, multi = false }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map(opt => {
        const isSelected = multi ? selected.includes(opt) : selected === opt;
        return (
          <button key={opt} type="button" onClick={() => onToggle(opt)}
            className={`flex items-center space-x-1 px-2.5 py-1 rounded-full text-xs font-medium transition active:scale-95 ${
              isSelected
                ? 'bg-white text-black'
                : 'bg-white/[0.06] text-white/40 hover:bg-white/[0.1] hover:text-white/60'
            }`}>
            {isSelected && <Check className="w-2.5 h-2.5" strokeWidth={3} />}
            <span>{opt}</span>
          </button>
        );
      })}
    </div>
  );
}