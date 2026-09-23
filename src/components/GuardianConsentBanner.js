// src/components/GuardianConsentBanner.js
//
// Shown on the dashboard to an artist under 18 whose parent or guardian has
// not consented, or has consented and is waiting on us.
//
// Renders NOTHING for everybody else, including every account that has not
// given a date of birth yet, so it cannot become a nag on an adult's
// dashboard. It asks for the date of birth once, on the page it links to, and
// stays quiet afterwards unless the answer was under 18.
//
// Reads its own state rather than taking it from AuthContext: date_of_birth is
// not in the artist row the context loads, and adding it there would put a
// minor's date of birth in memory on every page in the app for the sake of one
// banner.

import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ShieldAlert, Clock } from 'lucide-react';
import { supabase } from '../supabaseClient';

export default function GuardianConsentBanner({ artistId }) {
  const navigate = useNavigate();
  const [state, setState] = React.useState(null);   // null = nothing to show

  React.useEffect(() => {
    if (!artistId) return;
    let cancelled = false;
    (async () => {
      const [{ data: a, error: aErr }, { data: c, error: cErr }] = await Promise.all([
        supabase.from('artists').select('date_of_birth').eq('id', artistId).maybeSingle(),
        supabase.from('artist_guardian_consents')
          .select('status').eq('artist_id', artistId)
          .order('created_at', { ascending: false }).limit(1),
      ]);
      if (aErr) console.error('[GuardianBanner] dob read failed:', aErr.code, aErr.message);
      if (cErr) console.error('[GuardianBanner] consent read failed:', cErr.code, cErr.message);
      if (cancelled) return;

      const dob = a?.date_of_birth;
      if (!dob) { setState(null); return; }        // not answered: say nothing
      const eighteen = new Date();
      eighteen.setFullYear(eighteen.getFullYear() - 18);
      if (new Date(dob + 'T00:00:00') <= eighteen) { setState(null); return; }

      const status = c?.[0]?.status || null;
      if (status === 'verified') { setState(null); return; }
      setState(status === 'pending' ? 'pending' : 'needed');
    })();
    return () => { cancelled = true; };
  }, [artistId]);

  if (!state) return null;

  const pending = state === 'pending';

  return (
    <button
      onClick={() => navigate('/guardian-consent')}
      className={`w-full text-left flex items-start space-x-2.5 p-3.5 mb-4 rounded-xl transition ${
        pending
          ? 'bg-amber-500/10 border border-amber-500/20 hover:bg-amber-500/15'
          : 'bg-purple-500/10 border border-purple-500/25 hover:bg-purple-500/15'
      }`}>
      {pending
        ? <Clock className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
        : <ShieldAlert className="w-4 h-4 text-purple-300 flex-shrink-0 mt-0.5" />}
      <div>
        <p className={`text-sm font-semibold ${pending ? 'text-amber-300' : 'text-purple-200'}`}>
          {pending ? 'We are confirming your guardian' : 'A parent or guardian needs to agree'}
        </p>
        <p className="text-[11px] text-white/40 mt-0.5 leading-relaxed">
          {pending
            ? 'They have agreed and we are contacting them. Selling opens once we have. Everything else works as normal.'
            : 'Until they do, your music cannot be sold. Uploading, publishing and being played all carry on as normal. Tap to open the form.'}
        </p>
      </div>
    </button>
  );
}