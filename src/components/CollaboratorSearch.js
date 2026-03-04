import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../supabaseClient';
import { Search, X, Users, Percent, ChevronDown, AlertCircle } from 'lucide-react';

const ROLES = [
  { value: 'featured', label: 'Featured Artist' },
  { value: 'producer', label: 'Producer' },
  { value: 'songwriter', label: 'Songwriter' },
  { value: 'vocalist', label: 'Vocalist' },
  { value: 'remix', label: 'Remix' },
  { value: 'engineer', label: 'Engineer' },
];

export default function CollaboratorSearch({ collaborators, setCollaborators, currentArtistId }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const searchRef = useRef(null);
  const debounceRef = useRef(null);

  // Calculate total split
  const totalSplit = collaborators.reduce((sum, c) => sum + (parseFloat(c.split_percent) || 0), 0);
  const splitValid = totalSplit <= 100;

  // Search artists as user types
  useEffect(() => {
    if (!query.trim() || query.length < 2) {
      setResults([]);
      setShowDropdown(false);
      return;
    }

    if (debounceRef.current) clearTimeout(debounceRef.current);

    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const { data } = await supabase
          .from('artists')
          .select('id, artist_name, profile_image_url, slug')
          .ilike('artist_name', `%${query}%`)
          .neq('id', currentArtistId) // exclude self
          .limit(8);

        // Filter out already-added collaborators
        const addedIds = collaborators.map(c => c.artist_id);
        const filtered = (data || []).filter(a => !addedIds.includes(a.id));

        setResults(filtered);
        setShowDropdown(filtered.length > 0);
      } catch (err) {
        console.error('Search error:', err);
      }
      setSearching(false);
    }, 300);

    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query, currentArtistId, collaborators]);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClick = (e) => {
      if (searchRef.current && !searchRef.current.contains(e.target)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const addCollaborator = (artist) => {
    setCollaborators([
      ...collaborators,
      {
        artist_id: artist.id,
        artist_name: artist.artist_name,
        profile_image_url: artist.profile_image_url,
        role: 'featured',
        split_percent: 0,
        message: '',
      }
    ]);
    setQuery('');
    setResults([]);
    setShowDropdown(false);
  };

  const removeCollaborator = (artistId) => {
    setCollaborators(collaborators.filter(c => c.artist_id !== artistId));
  };

  const updateCollaborator = (artistId, field, value) => {
    setCollaborators(collaborators.map(c =>
      c.artist_id === artistId ? { ...c, [field]: value } : c
    ));
  };

  return (
    <div className="bg-white/[0.03] rounded-xl p-5 border border-white/[0.06] space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <Users className="w-4 h-4 text-white/40" />
          <h3 className="text-base font-semibold text-white">Collaborators</h3>
        </div>
        {collaborators.length > 0 && (
          <div className={`flex items-center space-x-1 text-xs px-2 py-1 rounded-full ${
            splitValid ? 'bg-white/[0.06] text-white/40' : 'bg-red-500/10 text-red-400'
          }`}>
            <Percent className="w-3 h-3" />
            <span>{totalSplit}% allocated</span>
          </div>
        )}
      </div>

      {/* Search Input */}
      <div ref={searchRef} className="relative">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => results.length > 0 && setShowDropdown(true)}
            placeholder="Search artists to collaborate with..."
            className="w-full pl-10 pr-4 py-2.5 bg-white/[0.06] rounded-lg text-sm text-white placeholder-white/30 outline-none focus:bg-white/[0.1] transition"
          />
          {searching && (
            <div className="absolute right-3 top-1/2 -translate-y-1/2">
              <div className="w-4 h-4 border-2 border-white/20 border-t-white/60 rounded-full animate-spin" />
            </div>
          )}
        </div>

        {/* Search Results Dropdown */}
        {showDropdown && (
          <div className="absolute z-20 w-full mt-1 bg-[#1a1a1a] border border-white/[0.1] rounded-lg shadow-xl max-h-60 overflow-y-auto">
            {results.map((artist) => (
              <button
                key={artist.id}
                type="button"
                onClick={() => addCollaborator(artist)}
                className="w-full flex items-center space-x-3 px-4 py-3 hover:bg-white/[0.06] transition text-left"
              >
                {artist.profile_image_url ? (
                  <img src={artist.profile_image_url} alt="" className="w-8 h-8 rounded-full object-cover" />
                ) : (
                  <div className="w-8 h-8 rounded-full bg-white/[0.1] flex items-center justify-center">
                    <span className="text-xs font-bold text-white/40">
                      {artist.artist_name?.charAt(0)?.toUpperCase()}
                    </span>
                  </div>
                )}
                <div>
                  <p className="text-sm font-medium text-white">{artist.artist_name}</p>
                  <p className="text-xs text-white/30">@{artist.slug || artist.artist_name?.toLowerCase().replace(/\s+/g, '')}</p>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Added Collaborators */}
      {collaborators.length > 0 && (
        <div className="space-y-3">
          {collaborators.map((collab) => (
            <div key={collab.artist_id} className="bg-white/[0.02] rounded-lg p-4 border border-white/[0.06] space-y-3">
              {/* Artist Info Row */}
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  {collab.profile_image_url ? (
                    <img src={collab.profile_image_url} alt="" className="w-9 h-9 rounded-full object-cover" />
                  ) : (
                    <div className="w-9 h-9 rounded-full bg-white/[0.1] flex items-center justify-center">
                      <span className="text-xs font-bold text-white/40">
                        {collab.artist_name?.charAt(0)?.toUpperCase()}
                      </span>
                    </div>
                  )}
                  <div>
                    <p className="text-sm font-medium text-white">{collab.artist_name}</p>
                    <p className="text-[10px] text-white/30 uppercase tracking-wider">
                      {ROLES.find(r => r.value === collab.role)?.label || 'Featured'}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => removeCollaborator(collab.artist_id)}
                  className="p-1.5 bg-red-500/10 rounded-lg hover:bg-red-500/20 transition"
                >
                  <X className="w-3.5 h-3.5 text-red-400" />
                </button>
              </div>

              {/* Role + Split Row */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] text-white/30 mb-1 uppercase tracking-wider">Role</label>
                  <div className="relative">
                    <select
                      value={collab.role}
                      onChange={(e) => updateCollaborator(collab.artist_id, 'role', e.target.value)}
                      className="w-full px-3 py-2 bg-white/[0.06] rounded-lg text-white text-sm outline-none appearance-none cursor-pointer"
                    >
                      {ROLES.map(r => (
                        <option key={r.value} value={r.value}>{r.label}</option>
                      ))}
                    </select>
                    <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/30 pointer-events-none" />
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] text-white/30 mb-1 uppercase tracking-wider">Royalty Split %</label>
                  <div className="relative">
                    <input
                      type="number"
                      min="0"
                      max="100"
                      step="0.5"
                      value={collab.split_percent}
                      onChange={(e) => updateCollaborator(collab.artist_id, 'split_percent', parseFloat(e.target.value) || 0)}
                      className="w-full px-3 py-2 bg-white/[0.06] rounded-lg text-white text-sm outline-none pr-8"
                    />
                    <Percent className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/30 pointer-events-none" />
                  </div>
                </div>
              </div>

              {/* Optional Message */}
              <div>
                <label className="block text-[10px] text-white/30 mb-1 uppercase tracking-wider">Message (optional)</label>
                <input
                  type="text"
                  value={collab.message || ''}
                  onChange={(e) => updateCollaborator(collab.artist_id, 'message', e.target.value)}
                  placeholder="Hey, let's collab on this..."
                  className="w-full px-3 py-2 bg-white/[0.06] rounded-lg text-white text-xs outline-none placeholder-white/20"
                />
              </div>
            </div>
          ))}

          {/* Split Warning */}
          {!splitValid && (
            <div className="flex items-center space-x-2 px-3 py-2 bg-red-500/10 rounded-lg border border-red-500/20">
              <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
              <p className="text-xs text-red-400">
                Total split is {totalSplit}% — must be 100% or less.
              </p>
            </div>
          )}

          {/* Split Summary */}
          {collaborators.length > 0 && splitValid && (
            <div className="px-3 py-2 bg-white/[0.02] rounded-lg">
              <div className="flex items-center justify-between text-xs">
                <span className="text-white/30">Your share (owner)</span>
                <span className="text-white font-medium">{(100 - totalSplit).toFixed(1)}%</span>
              </div>
              {collaborators.map(c => (
                <div key={c.artist_id} className="flex items-center justify-between text-xs mt-1">
                  <span className="text-white/30">{c.artist_name}</span>
                  <span className="text-white/60">{c.split_percent}%</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {collaborators.length === 0 && (
        <p className="text-center text-white/20 text-xs py-2">
          Search above to add collaborators. They'll receive a request to approve.
        </p>
      )}
    </div>
  );
}
