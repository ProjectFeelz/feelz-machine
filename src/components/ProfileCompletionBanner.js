import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Sparkles, X, Radio, Music } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

/**
 * ProfileCompletionBanner
 *
 * Shows whenever an artist is missing genre or mood.
 * - Session-only dismiss (sessionStorage) — comes back every new app open.
 * - Completion % bar so it feels like progress not nagging.
 * - compact prop for use inside ProfilePage header.
 */
export default function ProfileCompletionBanner({ compact = false }) {
  const { artist, isArtist } = useAuth();
  const navigate = useNavigate();

  const [dismissed, setDismissed] = useState(
    () => sessionStorage.getItem('fm_profile_banner_dismissed') === '1'
  );

  if (!isArtist || !artist || dismissed) return null;

  const missingGenre = !artist.genre;
  const missingMood  = !artist.mood;
  if (!missingGenre && !missingMood) return null;

  const missing = [
    missingGenre && 'genre',
    missingMood  && 'mood',
  ].filter(Boolean);

  const fields = [
    !!artist.artist_name,
    !!artist.bio,
    !!artist.genre,
    !!artist.mood,
    !!artist.profile_image_url,
  ];
  const pct = Math.round((fields.filter(Boolean).length / fields.length) * 100);

  const handleDismiss = () => {
    sessionStorage.setItem('fm_profile_banner_dismissed', '1');
    setDismissed(true);
  };

  if (compact) {
    return (
      <button
        onClick={() => navigate('/profile')}
        className="w-full flex items-center space-x-3 px-4 py-3 bg-purple-500/[0.08] border border-purple-500/20 rounded-xl mb-4 text-left hover:bg-purple-500/[0.12] transition"
      >
        <Sparkles className="w-4 h-4 text-purple-400 flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold text-white">
            Profile {pct}% complete — add your {missing.join(' & ')}
          </p>
          <div className="mt-1.5 h-1 bg-white/[0.06] rounded-full overflow-hidden">
            <div className="h-full bg-purple-500 rounded-full transition-all" style={{ width: `${pct}%` }} />
          </div>
        </div>
      </button>
    );
  }

  return (
    <div className="mx-4 mb-4 rounded-2xl overflow-hidden"
      style={{ background: 'linear-gradient(135deg, rgba(139,92,246,0.12), rgba(139,92,246,0.04))', border: '1px solid rgba(139,92,246,0.25)' }}>
      <div className="flex items-start space-x-3 p-4">
        <div className="w-9 h-9 rounded-xl bg-purple-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
          <Sparkles className="w-4 h-4 text-purple-400" />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between mb-0.5">
            <p className="text-sm font-bold text-white">Profile {pct}% complete</p>
            <span className="text-[10px] text-purple-400 font-semibold">
              {missing.length} field{missing.length > 1 ? 's' : ''} missing
            </span>
          </div>

          <div className="h-1.5 bg-white/[0.06] rounded-full overflow-hidden mb-2.5">
            <div className="h-full rounded-full transition-all duration-500"
              style={{ width: `${pct}%`, background: 'linear-gradient(90deg, #8B5CF6, #A78BFA)' }} />
          </div>

          <p className="text-xs text-white/50 leading-relaxed mb-1">
            Your <span className="text-white/70 font-medium">{missing.join(' and ')}</span> are
            missing — you won't appear in Collab Radar or recommendations without them.
          </p>

          <div className="flex items-center space-x-3 mt-2 mb-3">
            <div className="flex items-center space-x-1.5">
              <Radio className="w-3 h-3 text-purple-400" />
              <span className="text-[10px] text-white/40">Collab Radar</span>
            </div>
            <div className="flex items-center space-x-1.5">
              <Music className="w-3 h-3 text-purple-400" />
              <span className="text-[10px] text-white/40">Recommendations</span>
            </div>
          </div>

          <button
            onClick={() => navigate('/profile')}
            className="px-4 py-2 bg-purple-600 hover:bg-purple-500 active:scale-95 rounded-xl text-xs font-bold text-white transition-all"
          >
            Complete profile →
          </button>
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