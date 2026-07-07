import React, { useState } from 'react';
import { X } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../supabaseClient';

/**
 * RoleConfirmationPrompt
 *
 * Recovers users whose creator role was never actually confirmed —
 * this covers everyone caught by the original bug, where the Artist /
 * Beat Maker choice on the login page never reached the database at
 * all (it only controlled which pricing plans were displayed).
 *
 * Shows once per session until answered. Answering writes directly to
 * the artists row and sets role_confirmed = true, so this permanently
 * stops appearing for that user once they've actually answered it.
 */
export default function RoleConfirmationPrompt() {
  const { artist, isArtist, refreshProfile } = useAuth();
  const [dismissed, setDismissed] = useState(
    () => sessionStorage.getItem('fm_role_prompt_dismissed') === '1'
  );
  const [saving, setSaving] = useState(false);

  if (!isArtist || !artist || dismissed || artist.role_confirmed) return null;

  const handleDismiss = () => {
    sessionStorage.setItem('fm_role_prompt_dismissed', '1');
    setDismissed(true);
  };

  const handleChoose = async (role) => {
    setSaving(true);
    await supabase.from('artists').update({ role, role_confirmed: true }).eq('id', artist.id);
    await refreshProfile();
    setSaving(false);
  };

  return (
    <div className="mx-4 mb-4 rounded-2xl overflow-hidden"
      style={{ background: 'linear-gradient(135deg, rgba(140,171,46,0.12), rgba(140,171,46,0.04))', border: '1px solid rgba(140,171,46,0.25)' }}>
      <div className="flex items-start space-x-3 p-4">
        <div className="w-9 h-9 rounded-xl bg-[#8CAB2E]/20 flex items-center justify-center flex-shrink-0 mt-0.5 text-lg">
          🎧
        </div>

        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-white mb-1">Quick question</p>
          <p className="text-xs text-white/50 leading-relaxed mb-3">
            Are you mainly an artist, or a beat maker? This helps us show you the right tools and collaborators.
          </p>

          <div className="flex gap-2">
            <button
              onClick={() => handleChoose('artist')}
              disabled={saving}
              className="flex-1 py-2.5 rounded-xl text-xs font-semibold bg-white/[0.06] hover:bg-white/[0.1] text-white transition disabled:opacity-50"
            >
              🎤 Artist
            </button>
            <button
              onClick={() => handleChoose('beatmaker')}
              disabled={saving}
              className="flex-1 py-2.5 rounded-xl text-xs font-semibold bg-white/[0.06] hover:bg-white/[0.1] text-white transition disabled:opacity-50"
            >
              🎛️ Beat Maker
            </button>
          </div>
        </div>

        <button onClick={handleDismiss}
          className="w-6 h-6 flex items-center justify-center rounded-full hover:bg-white/[0.06] transition flex-shrink-0 mt-0.5"
          aria-label="Dismiss for this session">
          <X className="w-3.5 h-3.5 text-white/20" />
        </button>
      </div>
    </div>
  );
}