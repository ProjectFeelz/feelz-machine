// src/components/FollowUs.js
//
// The platform's own channels, asked for once, in the places people already
// are. Every listener who opens the app is traffic we already have; sending a
// slice of it to Instagram, YouTube and TikTok costs nothing and those
// channels are what brings the next listener in.
//
// The links come from platform_socials() (migration 181), not from constants
// here, so a changed handle is a settings update and not a deploy. If that
// function is missing or the row is empty this renders nothing at all rather
// than showing dead icons.
//
// Deliberately not a popup, not a banner over the feed, and never shown twice
// on the same screen. A follow prompt that interrupts listening is worth fewer
// follows than one that sits quietly where people browse.

import React from 'react';
import { Instagram, Youtube, Music2, ExternalLink } from 'lucide-react';
import { supabase } from '../supabaseClient';

const LABELS = {
  instagram: { label: 'Instagram', Icon: Instagram, colour: '#E1306C' },
  youtube:   { label: 'YouTube',   Icon: Youtube,   colour: '#FF0000' },
  // lucide has no TikTok mark. Music2 is the closest honest stand-in and
  // reads correctly next to the word.
  tiktok:    { label: 'TikTok',    Icon: Music2,    colour: '#25F4EE' },
};

const ORDER = ['instagram', 'tiktok', 'youtube'];

export function usePlatformSocials() {
  const [links, setLinks] = React.useState(null);
  React.useEffect(() => {
    let cancelled = false;
    supabase.rpc('platform_socials').then(({ data, error }) => {
      if (cancelled) return;
      // PGRST202 is "function not found", which just means migration 181 has
      // not run yet. Not worth a console error on every page load.
      if (error && error.code !== 'PGRST202') {
        console.error('[socials] read failed:', error.code, error.message);
      }
      setLinks(data && typeof data === 'object' ? data : {});
    });
    return () => { cancelled = true; };
  }, []);
  return links;
}

/**
 * `variant`:
 *   'card'   a titled block for the Hub and the Library.
 *   'inline' a bare icon row for a footer.
 */
export default function FollowUs({ variant = 'card', className = '' }) {
  const links = usePlatformSocials();
  if (!links) return null;

  const entries = ORDER
    .filter(k => links[k] && LABELS[k])
    .map(k => ({ key: k, url: links[k], ...LABELS[k] }));

  if (entries.length === 0) return null;

  if (variant === 'inline') {
    return (
      <div className={`flex items-center space-x-3 ${className}`}>
        {entries.map(({ key, url, label, Icon }) => (
          <a key={key} href={url} target="_blank" rel="noreferrer" aria-label={label}
            className="w-8 h-8 rounded-full bg-white/[0.06] flex items-center justify-center hover:bg-white/[0.12] transition">
            <Icon className="w-4 h-4 text-white/50" />
          </a>
        ))}
      </div>
    );
  }

  return (
    <div className={`rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4 ${className}`}>
      <p className="text-sm font-bold text-white">Follow Feelz Machine</p>
      <p className="text-[11px] text-white/35 mt-0.5 mb-3 leading-relaxed">
        New music, session clips and School Sessions go up on our channels first.
      </p>
      <div className="grid grid-cols-3 gap-2">
        {entries.map(({ key, url, label, Icon, colour }) => (
          <a key={key} href={url} target="_blank" rel="noreferrer"
            className="flex flex-col items-center justify-center py-3 rounded-xl bg-white/[0.04] border border-white/[0.06] hover:bg-white/[0.08] transition active:scale-95">
            <Icon className="w-5 h-5 mb-1.5" style={{ color: colour }} />
            <span className="text-[11px] font-semibold text-white/70">{label}</span>
          </a>
        ))}
      </div>
      <p className="text-[10px] text-white/20 mt-2.5 flex items-center gap-1">
        <ExternalLink className="w-2.5 h-2.5" /> Opens outside the app
      </p>
    </div>
  );
}