import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { useAuth } from '../contexts/AuthContext';
import {
  Music, Headphones, Upload, Loader, User,
  ArrowRight, ArrowLeft, Check, Sparkles
} from 'lucide-react';
import ArtistFollowPrompt from '../components/ArtistFollowPrompt';

const PROFILE_IMAGE_BUCKET = 'artist-images';

const GENRE_OPTIONS = [
  'Hip Hop', 'R&B', 'Pop', 'Electronic', 'Rock', 'Afrobeats',
  'Latin', 'Soul', 'Jazz', 'Indie', 'Lo-Fi', 'Drill', 'Trap', 'House',
];

function slugify(text) {
  return text.toString().toLowerCase().trim()
    .replace(/\s+/g, '-')
    .replace(/[^\w\-]+/g, '')
    .replace(/\-\-+/g, '-');
}

export default function ProfileSetup() {
  const navigate = useNavigate();
  const { user, refreshProfile } = useAuth();

  // step: 0 = choose type, 1 = artist setup, 2 = listener name,
  //       3 = listener genres, 4 = listener done
  const [step, setStep]               = useState(0);
  const [accountType, setAccountType] = useState(null);
  const [ageConfirmed, setAgeConfirmed] = useState(false);
  const [ageError, setAgeError]       = useState(false);
  const [showFollowPrompt, setShowFollowPrompt] = useState(false);

  // Artist fields
  const [artistName, setArtistName]     = useState('');
  const [bio, setBio]                   = useState('');
  const [imageFile, setImageFile]       = useState(null);
  const [imagePreview, setImagePreview] = useState(null);

  // Listener fields
  const [displayName, setDisplayName]       = useState('');
  const [selectedGenres, setSelectedGenres] = useState([]);

  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState('');

  const handleImageChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
  };

  // Save terms + age acceptance to DB — called once when user picks account type
  const saveTermsAcceptance = async () => {
    if (!user) return;
    try {
      await supabase.from('user_profiles').upsert({
        user_id: user.id,
        terms_accepted_at: new Date().toISOString(),
        age_confirmed: true,
      }, { onConflict: 'user_id' });
    } catch (err) {
      console.warn('Terms save error:', err.message);
    }
  };

  const handleChooseType = (type) => {
    if (!ageConfirmed) { setAgeError(true); return; }
    setAgeError(false);
    setAccountType(type);
    saveTermsAcceptance(); // fire and forget — non-blocking
    setStep(type === 'artist' ? 1 : 2);
  };

  const toggleGenre = (genre) => {
    setSelectedGenres(prev =>
      prev.includes(genre) ? prev.filter(g => g !== genre) : [...prev, genre]
    );
  };

  const handleArtistSubmit = async () => {
    if (!artistName.trim()) { setError('Artist name is required'); return; }
    if (!user) { setError('Not signed in'); return; }
    setSaving(true); setError('');
    try {
      let profileImageUrl = null;
      if (imageFile) {
        const ext = imageFile.name.split('.').pop();
        const fileName = `profile-images/${Date.now()}-${Math.random().toString(36).substring(7)}.${ext}`;
        const { error: uploadErr } = await supabase.storage
          .from(PROFILE_IMAGE_BUCKET).upload(fileName, imageFile);
        if (uploadErr) throw new Error(`Image upload failed: ${uploadErr.message}`);
        const { data: { publicUrl } } = supabase.storage
          .from(PROFILE_IMAGE_BUCKET).getPublicUrl(fileName);
        profileImageUrl = publicUrl;
      }
      let slug = slugify(artistName);
      const { data: existing } = await supabase.from('artists')
        .select('slug').eq('slug', slug).maybeSingle();
      if (existing) slug = `${slug}-${Date.now().toString(36)}`;
      const { error: insertErr } = await supabase.from('artists').insert({
        user_id: user.id, artist_name: artistName.trim(), slug,
        bio: bio.trim() || null, profile_image_url: profileImageUrl,
        is_verified: false, is_master: false, is_approved: true, tier: 'free',
      });
      if (insertErr) throw insertErr;
      await refreshProfile();
      // Show the follow prompt — new artists pick artists to follow before landing on Hub
      setShowFollowPrompt(true);
    } catch (err) { setError(err.message); }
    setSaving(false);
  };

  const handleListenerNameSubmit = async () => {
    if (!user) { setError('Not signed in'); return; }
    setSaving(true); setError('');
    try {
      const name = displayName.trim() || user.email.split('@')[0];
      const { error: updateErr } = await supabase.from('profiles')
        .update({ display_name: name }).eq('id', user.id);
      if (updateErr) console.warn('Profile name update:', updateErr.message);
      await refreshProfile();
    } catch (err) { setError(err.message); }
    setSaving(false);
    setStep(3);
  };

  const handleGenreSubmit = async () => {
    setSaving(true);
    try {
      if (selectedGenres.length > 0) {
        await supabase.from('user_profiles')
          .upsert({ user_id: user.id, genre_preferences: selectedGenres }, { onConflict: 'user_id' });
      }
    } catch (err) { console.warn('Genre save error:', err.message); }
    setSaving(false);
    setStep(4);
  };

  if (!user) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center px-6">
        <div className="text-center">
          <User className="w-12 h-12 mx-auto text-white/10 mb-4" />
          <p className="text-white/40 text-sm mb-4">You need to be signed in first</p>
          <button onClick={() => navigate('/login')}
            className="px-6 py-2.5 bg-white text-black rounded-lg font-medium text-sm">Sign In</button>
        </div>
      </div>
    );
  }

  // ── Artist follow prompt — shown after artist profile is created ──────────
  if (showFollowPrompt) {
    return <ArtistFollowPrompt onDone={() => navigate('/hub')} />;
  }

  // ── Step 0 — Choose type ──────────────────────────────────────────────────
  if (step === 0) {
    return (
      <div className="min-h-screen bg-black flex flex-col items-center justify-center px-6 py-12">
        <div className="w-full max-w-md">
          <div className="text-center mb-10">
            <div className="w-14 h-14 rounded-2xl bg-white/[0.06] flex items-center justify-center mx-auto mb-4">
              <Music className="w-7 h-7 text-white/60" />
            </div>
            <h1 className="text-2xl font-bold text-white mb-2">Welcome to Feelz Machine</h1>
            <p className="text-sm text-white/40">How do you want to use the platform?</p>
          </div>

          <label className={`flex items-start space-x-3 mb-5 cursor-pointer group p-3 rounded-xl border transition ${
            ageError ? 'border-red-500/40 bg-red-500/5' : 'border-white/[0.06] hover:border-white/[0.12]'
          }`}>
            <div className="relative flex-shrink-0 mt-0.5">
              <input type="checkbox" checked={ageConfirmed}
                onChange={e => { setAgeConfirmed(e.target.checked); setAgeError(false); }}
                className="sr-only" />
              <div className={`w-5 h-5 rounded flex items-center justify-center border transition ${
                ageConfirmed ? 'bg-white border-white' : ageError ? 'border-red-500/60' : 'border-white/20'
              }`}>
                {ageConfirmed && <Check className="w-3 h-3 text-black" strokeWidth={3} />}
              </div>
            </div>
            <span className={`text-xs leading-relaxed transition ${ageError ? 'text-red-400' : 'text-white/40'}`}>
              {ageError ? 'Please confirm your age to continue' : 'I confirm that I am 13 years of age or older'}
            </span>
          </label>

          <div className="space-y-3">
            <button onClick={() => handleChooseType('artist')}
              className="w-full flex items-center space-x-4 p-5 rounded-2xl bg-white/[0.04] border border-white/[0.08] hover:bg-white/[0.07] hover:border-white/[0.15] transition-all group text-left">
              <div className="w-12 h-12 rounded-xl bg-purple-500/20 flex items-center justify-center flex-shrink-0">
                <Music className="w-6 h-6 text-purple-400" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-base font-semibold text-white">I'm an Artist</p>
                <p className="text-sm text-white/40 mt-0.5">Upload music, build a profile, grow your fanbase</p>
              </div>
              <ArrowRight className="w-4 h-4 text-white/20 group-hover:text-white/40 transition flex-shrink-0" />
            </button>

            <button onClick={() => handleChooseType('listener')}
              className="w-full flex items-center space-x-4 p-5 rounded-2xl bg-white/[0.04] border border-white/[0.08] hover:bg-white/[0.07] hover:border-white/[0.15] transition-all group text-left">
              <div className="w-12 h-12 rounded-xl bg-blue-500/20 flex items-center justify-center flex-shrink-0">
                <Headphones className="w-6 h-6 text-blue-400" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-base font-semibold text-white">I'm a Listener</p>
                <p className="text-sm text-white/40 mt-0.5">Discover music, follow artists, build playlists</p>
              </div>
              <ArrowRight className="w-4 h-4 text-white/20 group-hover:text-white/40 transition flex-shrink-0" />
            </button>
          </div>

          <p className="text-center text-sm text-white/20 mt-8">
            You can always upgrade to an artist account later
          </p>
        </div>
      </div>
    );
  }

  // ── Step 1 — Artist setup ─────────────────────────────────────────────────
  if (step === 1) {
    return (
      <div className="min-h-screen bg-black flex flex-col items-center justify-center px-6 py-12">
        <div className="w-full max-w-md">
          <button onClick={() => setStep(0)}
            className="flex items-center space-x-2 text-white/40 hover:text-white/60 mb-8 transition">
            <ArrowLeft className="w-4 h-4" /><span className="text-sm">Back</span>
          </button>
          <div className="text-center mb-8">
            <div className="w-14 h-14 rounded-2xl bg-purple-500/20 flex items-center justify-center mx-auto mb-4">
              <Music className="w-7 h-7 text-purple-400" />
            </div>
            <h1 className="text-2xl font-bold text-white mb-2">Set Up Your Artist Profile</h1>
            <p className="text-sm text-white/40">This is how fans and other artists will find you</p>
          </div>
          {error && <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">{error}</div>}
          <div className="space-y-5">
            <div className="flex flex-col items-center">
              <div className="relative mb-3">
                <div className="w-24 h-24 rounded-full bg-white/[0.06] border-2 border-dashed border-white/[0.15] flex items-center justify-center overflow-hidden">
                  {imagePreview
                    ? <img src={imagePreview} alt="" className="w-full h-full object-cover" />
                    : <Upload className="w-6 h-6 text-white/20" />}
                </div>
                <label className="absolute -bottom-1 -right-1 w-8 h-8 rounded-full bg-white flex items-center justify-center cursor-pointer shadow-lg hover:bg-white/90 transition">
                  <Upload className="w-3.5 h-3.5 text-black" />
                  <input type="file" accept="image/*" onChange={handleImageChange} className="hidden" />
                </label>
              </div>
              <p className="text-sm text-white/30">Profile photo (optional)</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-white/50 mb-2">Artist Name *</label>
              <input type="text" value={artistName}
                onChange={e => setArtistName(e.target.value)}
                placeholder="Your artist name" maxLength={50}
                className="w-full px-4 py-3 bg-white/[0.04] border border-white/[0.08] rounded-xl text-white placeholder-white/20 text-sm focus:outline-none focus:border-white/[0.2] transition" />
            </div>
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-medium text-white/50">Bio (optional)</label>
                <span className="text-xs text-white/20">{bio.length}/300</span>
              </div>
              <textarea value={bio} onChange={e => setBio(e.target.value)}
                placeholder="Tell people about your music..." rows={3} maxLength={300}
                className="w-full px-4 py-3 bg-white/[0.04] border border-white/[0.08] rounded-xl text-white placeholder-white/20 text-sm focus:outline-none focus:border-white/[0.2] transition resize-none" />
            </div>
            <button onClick={handleArtistSubmit} disabled={saving || !artistName.trim()}
              className="w-full py-3.5 bg-white text-black rounded-xl font-semibold text-sm flex items-center justify-center space-x-2 disabled:opacity-30 hover:bg-white/90 transition active:scale-[0.98]">
              {saving ? <Loader className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
              <span>{saving ? 'Setting up...' : 'Create Artist Profile'}</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Step 2 — Listener name ────────────────────────────────────────────────
  if (step === 2) {
    return (
      <div className="min-h-screen bg-black flex flex-col items-center justify-center px-6 py-12">
        <div className="w-full max-w-md">
          <button onClick={() => setStep(0)}
            className="flex items-center space-x-2 text-white/40 hover:text-white/60 mb-8 transition">
            <ArrowLeft className="w-4 h-4" /><span className="text-sm">Back</span>
          </button>
          <div className="text-center mb-8">
            <div className="w-14 h-14 rounded-2xl bg-blue-500/20 flex items-center justify-center mx-auto mb-4">
              <Headphones className="w-7 h-7 text-blue-400" />
            </div>
            <h1 className="text-2xl font-bold text-white mb-2">What should we call you?</h1>
            <p className="text-sm text-white/40">Step 1 of 2</p>
          </div>
          {error && <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">{error}</div>}
          <div className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-white/50 mb-2">Display Name (optional)</label>
              <input type="text" value={displayName}
                onChange={e => setDisplayName(e.target.value)}
                placeholder={user.email.split('@')[0]} maxLength={40}
                className="w-full px-4 py-3 bg-white/[0.04] border border-white/[0.08] rounded-xl text-white placeholder-white/20 text-sm focus:outline-none focus:border-white/[0.2] transition" />
              <p className="text-sm text-white/25 mt-1.5">Defaults to your email username</p>
            </div>
            <button onClick={handleListenerNameSubmit} disabled={saving}
              className="w-full py-3.5 bg-white text-black rounded-xl font-semibold text-sm flex items-center justify-center space-x-2 disabled:opacity-30 hover:bg-white/90 transition active:scale-[0.98]">
              {saving ? <Loader className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
              <span>{saving ? 'Saving...' : 'Next'}</span>
            </button>
          </div>
          <p className="text-center text-sm text-white/20 mt-8">
            Want to share your music?{' '}
            <button onClick={() => setStep(1)} className="text-white/40 hover:text-white/60 underline transition">
              Create an artist profile instead
            </button>
          </p>
        </div>
      </div>
    );
  }

  // ── Step 3 — Genre preferences ────────────────────────────────────────────
  if (step === 3) {
    return (
      <div className="min-h-screen bg-black flex flex-col items-center justify-center px-6 py-12">
        <div className="w-full max-w-md">
          <div className="text-center mb-8">
            <div className="w-14 h-14 rounded-2xl bg-purple-500/20 flex items-center justify-center mx-auto mb-4">
              <Sparkles className="w-7 h-7 text-purple-400" />
            </div>
            <h1 className="text-2xl font-bold text-white mb-2">What do you vibe with?</h1>
            <p className="text-sm text-white/40">Step 2 of 2 · Pick your genres for better recommendations</p>
          </div>
          <div className="flex flex-wrap gap-2 mb-8">
            {GENRE_OPTIONS.map(genre => {
              const selected = selectedGenres.includes(genre);
              return (
                <button key={genre} onClick={() => toggleGenre(genre)}
                  className={`flex items-center space-x-1.5 px-4 py-2 rounded-full text-sm font-medium transition active:scale-95 ${
                    selected
                      ? 'bg-white text-black'
                      : 'bg-white/[0.06] text-white/50 hover:bg-white/[0.1] hover:text-white/70'
                  }`}>
                  {selected && <Check className="w-3.5 h-3.5" strokeWidth={3} />}
                  <span>{genre}</span>
                </button>
              );
            })}
          </div>
          <button onClick={handleGenreSubmit} disabled={saving}
            className="w-full py-3.5 bg-white text-black rounded-xl font-semibold text-sm flex items-center justify-center space-x-2 disabled:opacity-30 hover:bg-white/90 transition active:scale-[0.98]">
            {saving ? <Loader className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
            <span>{saving ? 'Saving...' : selectedGenres.length > 0 ? 'Continue' : 'Skip for now'}</span>
          </button>
        </div>
      </div>
    );
  }

  // ── Step 4 — Listener welcome ─────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-black flex flex-col items-center justify-center px-6 py-12">
      <div className="w-full max-w-md">
        <div className="text-center mb-10">
          <div className="w-16 h-16 rounded-2xl bg-green-500/20 flex items-center justify-center mx-auto mb-4">
            <Check className="w-8 h-8 text-green-400" strokeWidth={2.5} />
          </div>
          <h1 className="text-2xl font-bold text-white mb-2">You're all set!</h1>
          <p className="text-sm text-white/40">Here's how to get the most out of Feelz Machine</p>
        </div>
        <div className="space-y-3 mb-8">
          {[
            { icon: Music,      color: 'bg-purple-500/20 text-purple-400', title: 'Browse music',       desc: 'Explore featured tracks, new releases and trending music',         path: '/browse' },
            { icon: Headphones, color: 'bg-blue-500/20 text-blue-400',     title: 'Follow artists',     desc: 'Follow your favourites to get notified when they drop new music', path: '/browse?tab=artists' },
            { icon: Sparkles,   color: 'bg-yellow-500/20 text-yellow-400', title: 'Discover your feed', desc: 'See posts and updates from artists you follow',                    path: '/community' },
          ].map(({ icon: Icon, color, title, desc, path }) => (
            <button key={title} onClick={() => navigate(path)}
              className="w-full flex items-center space-x-4 p-4 rounded-2xl bg-white/[0.03] border border-white/[0.06] hover:bg-white/[0.06] transition text-left group">
              <div className={`w-10 h-10 rounded-xl ${color} flex items-center justify-center flex-shrink-0`}>
                <Icon className="w-5 h-5" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-white">{title}</p>
                <p className="text-xs text-white/30 mt-0.5">{desc}</p>
              </div>
              <ArrowRight className="w-4 h-4 text-white/15 group-hover:text-white/30 transition flex-shrink-0" />
            </button>
          ))}
        </div>
        <button onClick={() => navigate('/')}
          className="w-full py-3.5 bg-white text-black rounded-xl font-semibold text-sm hover:bg-white/90 transition active:scale-[0.98]">
          Go to Home
        </button>
      </div>
    </div>
  );
}
