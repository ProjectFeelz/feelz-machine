import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { useNavigate } from 'react-router-dom';
import { Users } from 'lucide-react';

const ROLE_LABELS = {
  featured: 'ft.',
  producer: 'prod.',
  songwriter: 'written by',
  vocalist: 'vocals',
  remix: 'remix',
  engineer: 'eng.',
};

// Inline credits — e.g. "ft. ArtistName, prod. AnotherArtist"
export function TrackCreditsInline({ trackId }) {
  const [credits, setCredits] = useState([]);

  useEffect(() => {
    if (!trackId) return;
    const fetch = async () => {
      const { data } = await supabase
        .from('collaborations')
        .select('role, artist:artists(id, artist_name, slug)')
        .eq('track_id', trackId)
        .eq('status', 'accepted')
        .order('role');
      setCredits(data || []);
    };
    fetch();
  }, [trackId]);

  if (credits.length === 0) return null;

  return (
    <span className="text-white/40 text-xs">
      {credits.map((c, i) => (
        <span key={i}>
          {i > 0 && ', '}
          {ROLE_LABELS[c.role] || ''} {c.artist?.artist_name}
        </span>
      ))}
    </span>
  );
}

// Full credits block — for track detail pages
export default function TrackCredits({ trackId }) {
  const navigate = useNavigate();
  const [credits, setCredits] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!trackId) return;
    const fetch = async () => {
      setLoading(true);
      const { data } = await supabase
        .from('collaborations')
        .select('role, split_percent, artist:artists(id, artist_name, avatar_url, slug)')
        .eq('track_id', trackId)
        .eq('status', 'accepted')
        .order('split_percent', { ascending: false });
      setCredits(data || []);
      setLoading(false);
    };
    fetch();
  }, [trackId]);

  if (loading || credits.length === 0) return null;

  return (
    <div className="bg-white/[0.03] rounded-xl p-4 border border-white/[0.06]">
      <div className="flex items-center space-x-2 mb-3">
        <Users className="w-4 h-4 text-white/40" />
        <h4 className="text-sm font-semibold text-white">Credits</h4>
      </div>
      <div className="space-y-2">
        {credits.map((c, i) => (
          <button
            key={i}
            onClick={() => c.artist?.slug && navigate(`/artist/${c.artist.slug}`)}
            className="w-full flex items-center space-x-3 p-2 rounded-lg hover:bg-white/[0.04] transition text-left"
          >
            {c.artist?.avatar_url ? (
              <img src={c.artist.avatar_url} alt="" className="w-8 h-8 rounded-full object-cover" />
            ) : (
              <div className="w-8 h-8 rounded-full bg-white/[0.08] flex items-center justify-center">
                <span className="text-xs font-bold text-white/30">
                  {c.artist?.artist_name?.charAt(0)?.toUpperCase()}
                </span>
              </div>
            )}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-white truncate">{c.artist?.artist_name}</p>
              <p className="text-[10px] text-white/30 uppercase tracking-wider">
                {ROLE_LABELS[c.role] || c.role}
              </p>
            </div>
            {c.split_percent > 0 && (
              <span className="text-[10px] text-white/20 font-mono">{c.split_percent}%</span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
