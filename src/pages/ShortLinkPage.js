// src/pages/ShortLinkPage.js
//
// /t/<code> and /a/<code>: the short share links from migration 185.
//
// This page renders nothing anybody is meant to look at. It resolves the code
// and redirects to the canonical page.
//
// WHY REDIRECT RATHER THAN RENDER IN PLACE
//
// Two URLs serving the same content splits that page's search ranking and
// gives the crawler two things to index. The short form is for pasting into a
// message; the long form stays the one Google sees. Same reasoning as the
// /@handle URLs in src/AppRouter.js, and the same `replace` so the short link
// does not sit in history and trap the back button.
//
// WHY A CODE AND NOT JUST THE SLUG
//
// Track and album slugs are unique per ARTIST, not globally
// (tracks_artist_id_slug_key), so two artists can both have a song called
// "Intro" and /track/intro is genuinely ambiguous. A short code is unique
// across both tables, so it always means exactly one thing.

import React from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Loader } from 'lucide-react';
import { supabase } from '../supabaseClient';

export default function ShortLinkPage() {
  const { code } = useParams();
  const navigate = useNavigate();
  const [failed, setFailed] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!code) { setFailed(true); return; }
      const { data, error } = await supabase.rpc('resolve_short_code', { p_code: code });
      if (cancelled) return;

      if (error) {
        console.error('[shortlink] resolve failed:', error.code, error.message);
        setFailed(true);
        return;
      }
      const hit = Array.isArray(data) ? data[0] : data;
      if (!hit) { setFailed(true); return; }

      if (hit.kind === 'track' && hit.slug) {
        navigate(`/track/${hit.slug}`, { replace: true });
      } else if (hit.kind === 'album') {
        // The album route takes an id or a slug. The id is used because an
        // album slug is only unique per artist, same as a track's.
        navigate(`/album/${hit.id}`, { replace: true });
      } else {
        setFailed(true);
      }
    })();
    return () => { cancelled = true; };
  }, [code, navigate]);

  if (failed) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center px-6 text-center">
        <p className="text-white font-semibold mb-1">That link has expired or never existed</p>
        <p className="text-sm text-white/40 mb-5">
          The music may have been taken down, or the code was typed slightly wrong.
        </p>
        <button onClick={() => navigate('/browse')}
          className="px-5 py-2.5 rounded-xl bg-white text-black text-sm font-bold">
          Find something to listen to
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-[60vh] flex items-center justify-center">
      <Loader className="w-5 h-5 animate-spin text-white/20" />
    </div>
  );
}