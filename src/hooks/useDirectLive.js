// src/hooks/useDirectLive.js
//
// Whether direct streaming (Cloudflare Stream) is switched on, and the code
// for its playback addresses. Asked once per page load.

import { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';

let cached = null;

// configured: direct streams can be watched. canHost: the signed-in person
// may start one (by CF_DIRECT_HOSTS; admins only unless widened).
export default function useDirectLive() {
  const [cfg, setCfg] = useState(cached || { configured: false, canHost: false, customerCode: null, loading: !cached });
  useEffect(() => {
    if (cached) return;
    (async () => {
      try {
        const d = await fetch('/.netlify/functions/cf-live?action=config').then(r => r.json());
        let canHost = false;
        if (d.configured) {
          const { data: { session } } = await supabase.auth.getSession();
          if (session?.access_token) {
            const c = await fetch('/.netlify/functions/cf-live', {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ action: 'can', token: session.access_token }),
            }).then(r => r.json()).catch(() => ({}));
            canHost = !!c.allowed;
          }
        }
        cached = { configured: !!d.configured, canHost, customerCode: d.customerCode || null, loading: false };
        setCfg(cached);
      } catch {
        setCfg({ configured: false, canHost: false, customerCode: null, loading: false });
      }
    })();
  }, []);
  return cfg;
}

/** Cloudflare playback addresses for a live input or a recording. */
export const cfHls = (code, uid) => (code && uid ? `https://customer-${code}.cloudflarestream.com/${uid}/manifest/video.m3u8` : null);
export const cfThumb = (code, uid) => (code && uid ? `https://customer-${code}.cloudflarestream.com/${uid}/thumbnails/thumbnail.jpg` : null);
