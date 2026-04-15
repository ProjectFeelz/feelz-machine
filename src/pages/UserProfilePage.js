import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { useAuth } from '../contexts/AuthContext';
import { Camera, Check, Loader, ChevronLeft, User } from 'lucide-react';

const GENRES = [
  'Hip Hop','Trap','Drill','Boom Bap','Lo-Fi','R&B','Neo Soul','Pop',
  'Electronic','House','Deep House','Tech House','Techno','Dubstep',
  'Drum & Bass','Ambient','Downtempo','Future Bass','Jersey Club',
  'Jazz','Funk','Soul','Rock','Metal','Indie','Alternative',
  'Afrobeat','Amapiano','Reggae','Dancehall','Latin','Reggaeton',
  'Country','EDM','Trance','Hardstyle','UK Garage','Grime',
  'Experimental','Vaporwave','Synthwave','Other',
];

const MOODS = [
  'Dark','Happy','Sad','Aggressive','Chill','Energetic','Melancholic',
  'Uplifting','Mysterious','Peaceful','Intense','Dreamy','Romantic',
  'Angry','Hopeful','Nostalgic','Epic','Smooth','Bouncy','Atmospheric',
  'Moody','Vibey','Hard','Soft','Ethereal','Groovy','Other',
];

function FieldLabel({ children }) {
  return (
    <label className="block text-xs font-semibold text-white/40 uppercase tracking-wider mb-2">
      {children}
    </label>
  );
}

// Multi-select pill grid
function PillGrid({ options, selected = [], onToggle }) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map(opt => {
        const isSelected = selected.includes(opt);
        return (
          <button
            key={opt}
            type="button"
            onClick={() => onToggle(opt)}
            className={`flex items-center space-x-1 px-3 py-1.5 rounded-full text-xs font-medium transition active:scale-95 ${
              isSelected
                ? 'bg-white text-black'
                : 'bg-white/[0.06] text-white/50 hover:bg-white/[0.1] hover:text-white/70'
            }`}
          >
            {isSelected && <Check className="w-3 h-3" strokeWidth={3} />}
            <span>{opt}</span>
          </button>
        );
      })}
    </div>
  );
}

// Single-select pill grid (for mood)
function SinglePillGrid({ options, selected, onToggle }) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map(opt => {
        const isSelected = selected === opt;
        return (
          <button
            key={opt}
            type="button"
            onClick={() => onToggle(opt)}
            className={`flex items-center space-x-1 px-3 py-1.5 rounded-full text-xs font-medium transition active:scale-95 ${
              isSelected
                ? 'bg-white text-black'
                : 'bg-white/[0.06] text-white/50 hover:bg-white/[0.1] hover:text-white/70'
            }`}
          >
            {isSelected && <Check className="w-3 h-3" strokeWidth={3} />}
            <span>{opt}</span>
          </button>
        );
      })}
    </div>
  );
}

export default function UserProfilePage() {
  const navigate = useNavigate();
  const { user, refreshProfile } = useAuth();
  const fileRef = useRef(null);

  const [displayName, setDisplayName]     = useState('');
  const [bio, setBio]                     = useState('');
  const [genres, setGenres]               = useState([]); // multi-select array
  const [mood, setMood]                   = useState('');
  const [avatarUrl, setAvatarUrl]         = useState('');
  const [avatarFile, setAvatarFile]       = useState(null);
  const [avatarPreview, setAvatarPreview] = useState('');
  const [saving, setSaving]               = useState(false);
  const [saved, setSaved]                 = useState(false);
  const [error, setError]                 = useState('');
  const [loading, setLoading]             = useState(true);

  useEffect(() => {
    if (!user) return;
    const fetchProfile = async () => {
      const { data } = await supabase
        .from('user_profiles')
        .select('name, avatar_url, genre, genre_preferences, mood, bio')
        .eq('user_id', user.id)
        .maybeSingle();
      if (data) {
        setDisplayName(data.name || '');
        setBio(data.bio || '');
        // Support both old single genre and new multi-genre
        const savedGenres = data.genre_preferences?.length
          ? data.genre_preferences
          : data.genre ? [data.genre] : [];
        setGenres(savedGenres);
        setMood(data.mood || '');
        setAvatarUrl(data.avatar_url || user.user_metadata?.avatar_url || user.user_metadata?.picture || '');
      } else {
        setDisplayName(user.user_metadata?.display_name || user.email?.split('@')[0] || '');
      }
      setLoading(false);
    };
    fetchProfile();
  }, [user]);

  const handleAvatarChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setAvatarFile(file);
    setAvatarPreview(URL.createObjectURL(file));
  };

  const toggleGenre = (g) => {
    setGenres(prev =>
      prev.includes(g) ? prev.filter(x => x !== g) : [...prev, g]
    );
  };

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);
    setError('');
    try {
      let newAvatarUrl = avatarUrl;
      if (avatarFile) {
        const ext  = avatarFile.name.split('.').pop();
        const path = `user-avatars/${user.id}.${ext}`;
        const { error: uploadErr } = await supabase.storage
          .from('feelz-samples')
          .upload(path, avatarFile, { contentType: avatarFile.type, upsert: true });
        if (uploadErr) throw uploadErr;
        const { data: urlData } = supabase.storage.from('feelz-samples').getPublicUrl(path);
        newAvatarUrl = urlData.publicUrl;
      }

      // Always upsert — handles both new and existing profiles
      const { error: upsertErr } = await supabase
        .from('user_profiles')
        .upsert({
          user_id:          user.id,
          name:             displayName.trim() || user.email?.split('@')[0],
          bio:              bio.trim() || null,
          genre:            genres[0] || null,       // keep single genre for backwards compat
          genre_preferences: genres,                 // new multi-genre array
          mood:             mood || null,
          avatar_url:       newAvatarUrl,
          updated_at:       new Date().toISOString(),
        }, { onConflict: 'user_id' });

      if (upsertErr) throw upsertErr;

      setAvatarUrl(newAvatarUrl);
      if (newAvatarUrl) await supabase.auth.updateUser({ data: { avatar_url: newAvatarUrl } });
      setAvatarFile(null);
      setAvatarPreview('');
      if (refreshProfile) await refreshProfile();
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (err) {
      setError(err.message || 'Failed to save. Please try again.');
    }
    setSaving(false);
  };

  if (!user) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <p className="text-white/40 text-sm">Sign in to edit your profile</p>
      </div>
    );
  }

  const currentAvatar = avatarPreview || avatarUrl;

  return (
    <div className="min-h-screen bg-black text-white">
      <div className="max-w-lg mx-auto px-4 py-6 pb-32">

        {/* Header */}
        <div className="flex items-center space-x-3 mb-8">
          <button onClick={() => navigate(-1)}
            className="w-9 h-9 flex items-center justify-center rounded-full bg-white/[0.06] hover:bg-white/[0.1] transition">
            <ChevronLeft className="w-5 h-5 text-white" />
          </button>
          <h1 className="text-xl font-bold">Edit Profile</h1>
        </div>

        {loading ? (
          <div className="flex justify-center py-16">
            <Loader className="w-5 h-5 animate-spin text-white/30" />
          </div>
        ) : (
          <div className="space-y-6">

            {/* Avatar */}
            <div className="flex flex-col items-center space-y-3">
              <div className="relative">
                <div className="w-24 h-24 rounded-full overflow-hidden bg-white/[0.06] flex items-center justify-center">
                  {currentAvatar
                    ? <img src={currentAvatar} alt="Avatar" className="w-full h-full object-cover" />
                    : <User className="w-10 h-10 text-white/20" />}
                </div>
                <button onClick={() => fileRef.current?.click()}
                  className="absolute bottom-0 right-0 w-8 h-8 bg-white rounded-full flex items-center justify-center shadow-lg hover:bg-white/90 transition">
                  <Camera className="w-4 h-4 text-black" />
                </button>
                <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarChange} />
              </div>
              <p className="text-xs text-white/30">Tap the camera to change your photo</p>
            </div>

            {/* Display Name */}
            <div>
              <FieldLabel>Display Name</FieldLabel>
              <input type="text" value={displayName}
                onChange={e => setDisplayName(e.target.value)}
                placeholder="Your name" maxLength={50}
                className="w-full px-4 py-3 bg-white/[0.06] rounded-xl text-white placeholder-white/20 outline-none focus:ring-1 focus:ring-white/20 transition text-sm" />
            </div>

            {/* Bio */}
            <div>
              <FieldLabel>Bio</FieldLabel>
              <textarea value={bio} onChange={e => setBio(e.target.value)}
                placeholder="Tell us a little about yourself..."
                rows={3} maxLength={200}
                className="w-full px-4 py-3 bg-white/[0.06] rounded-xl text-white placeholder-white/20 outline-none focus:ring-1 focus:ring-white/20 transition text-sm resize-none" />
              <p className="text-right text-[10px] text-white/20 mt-1">{bio.length}/200</p>
            </div>

            {/* Genre — multi select */}
            <div>
              <FieldLabel>Favourite Genre{genres.length > 1 ? 's' : ''}</FieldLabel>
              <p className="text-xs text-white/25 mb-3">Select all that apply — used to personalise your recommendations</p>
              <PillGrid
                options={GENRES}
                selected={genres}
                onToggle={toggleGenre}
              />
              {genres.length > 0 && (
                <button
                  type="button"
                  onClick={() => setGenres([])}
                  className="mt-2 text-[10px] text-white/20 hover:text-white/40 transition"
                >
                  Clear all
                </button>
              )}
            </div>

            {/* Mood — single select */}
            <div>
              <FieldLabel>Favourite Mood</FieldLabel>
              <p className="text-xs text-white/25 mb-3">Helps us find music that matches your vibe</p>
              <SinglePillGrid
                options={MOODS}
                selected={mood}
                onToggle={(m) => setMood(prev => prev === m ? '' : m)}
              />
            </div>

            {/* Email (read-only) */}
            <div>
              <FieldLabel>Email</FieldLabel>
              <div className="w-full px-4 py-3 bg-white/[0.03] rounded-xl text-white/30 text-sm border border-white/[0.04]">
                {user.email}
              </div>
            </div>

            {/* Error */}
            {error && (
              <div className="px-4 py-3 bg-red-500/10 border border-red-500/20 rounded-xl">
                <p className="text-red-400 text-sm">{error}</p>
              </div>
            )}

            {/* Save */}
            <button onClick={handleSave} disabled={saving}
              className="w-full py-3.5 rounded-xl font-semibold text-sm transition disabled:opacity-50 flex items-center justify-center space-x-2"
              style={{ backgroundColor: saved ? '#16a34a' : '#fff', color: '#000' }}>
              {saving
                ? <Loader className="w-4 h-4 animate-spin" />
                : saved
                  ? <><Check className="w-4 h-4 text-white" /><span className="text-white">Saved!</span></>
                  : <span>Save Changes</span>}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
