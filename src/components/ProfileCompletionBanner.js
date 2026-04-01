import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Sparkles, X } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

/**
 * ProfileCompletionBanner
 *
 * Shows a subtle prompt when an artist's profile is missing genre or mood.
 * These fields power Recommendations and Collab Radar — completing them
 * directly improves the artist's discoverability.
 *
 * Place near the top of ArtistDashboard or HubPage (artist view only).
 */
export default function ProfileCompletionBanner() {
  const { artist, isArtist } = useAuth();
  const navigate = useNavigate();
  const [dismissed, setDismissed] = useState(
    () => localStorage.getItem('fm_profile_banner_dismissed') === '1'
  );

  if (!isArtist || !artist || dismissed) return null;

  // Only show if genre or mood is missing
  const missingGenre = !artist.genre;
  const missingMood  = !artist.mood;
  if (!missingGenre && !missingMood) return null;

  const missing = [
    missingGenre && 'genre',
    missingMood  && 'mood',
  ].filter(Boolean);

  const handleDismiss = () => {
    localStorage.setItem('fm_profile_banner_dismissed', '1');
    setDismissed(true);
  };

  return (
    <div className="mx-4 mb-4 rounded-2xl border border-purple-500/20 bg-purple-500/[0.06] overflow-hidden">
      <div className="flex items-start space-x-3 p-4">
        <div className="w-8 h-8 rounded-xl bg-purple-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
          <Sparkles className="w-4 h-4 text-purple-400" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-white mb-0.5">
            Complete your profile
          </p>
          <p className="text-xs text-white/40 leading-relaxed">
            Adding your {missing.join(' and ')} helps fans discover you and improves Collab Radar matching.
          </p>
          <button
            onClick={() => navigate('/profile/edit')}
            className="mt-2.5 text-xs font-semibold text-purple-400 hover:text-purple-300 transition"
          >
            Update profile →
          </button>
        </div>
        <button
          onClick={handleDismiss}
          className="w-6 h-6 flex items-center justify-center rounded-full hover:bg-white/[0.06] transition flex-shrink-0"
        >
          <X className="w-3.5 h-3.5 text-white/30" />
        </button>
      </div>
    </div>
  );
}
