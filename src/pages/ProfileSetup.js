import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { useAuth } from '../contexts/AuthContext';
import { Music, Headphones, Upload, Loader, User, ArrowRight, ArrowLeft } from 'lucide-react';

function slugify(text) {
  return text.toString().toLowerCase().trim()
    .replace(/\s+/g, '-')
    .replace(/[^\w\-]+/g, '')
    .replace(/\-\-+/g, '-');
}

export default function ProfileSetup() {
  const navigate = useNavigate();
  const { user, refreshProfile } = useAuth();
  const [step, setStep] = useState(0); // 0 = choose type, 1 = artist setup, 2 = listener setup
  const [accountType, setAccountType] = useState(null);

  // Artist fields
  const [artistName, setArtistName] = useState('');
  const [bio, setBio] = useState('');
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);

  // Listener fields
  const [displayName, setDisplayName] = useState('');

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleImageChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
  };

  const handleChooseType = (type) => {
    setAccountType(type);
    setStep(type === 'artist' ? 1 : 2);
  };

  const handleArtistSubmit = async () => {
    if (!artistName.trim()) { setError('Artist name is required'); return; }
    if (!user) { setError('Not signed in'); return; }
    setSaving(true);
    setError('');
    try {
      let profileImageUrl = null;
      if (imageFile) {
        const ext = imageFile.name.split('.').pop();
        const fileName = `profile-images/${Date.now()}-${Math.random().toString(36).substring(7)}.${ext}`;
        const { error: uploadErr } = await supabase.storage
          .from('feelz-samples')
          .upload(fileName, imageFile);
        if (uploadErr) throw uploadErr;
        const { data: { publicUrl } } = supabase.storage
          .from('feelz-samples')
          .getPublicUrl(fileName);
        profileImageUrl = publicUrl;
      }

      let slug = slugify(artistName);
      const { data: existing } = await supabase
        .from('artists')
        .select('slug')
        .eq('slug', slug)
        .single();
      if (existing) slug = `${slug}-${Date.now().toString(36)}`;

      const { error: insertErr } = await supabase.from('artists').insert({
        user_id: user.id,
        artist_name: artistName.trim(),
        slug,
        bio: bio.trim() || null,
        profile_image_url: profileImageUrl,
        is_verified: false,
        is_master: false,
        is_approved: true,
        tier: 'free',
      });
      if (insertErr) throw insertErr;

      await refreshProfile();
      navigate('/hub');
    } catch (err) {
      setError(err.message);
    }
    setSaving(false);
  };

  const handleListenerSubmit = async () => {
    if (!user) { setError('Not signed in'); return; }
    setSaving(true);
    setError('');
    try {
      const { error: insertErr } = await supabase.from('listeners').insert({
        user_id: user.id,
        display_name: displayName.trim() || user.email.split('@')[0],
      });
      if (insertErr) throw insertErr;
      await refreshProfile();
      navigate('/');
    } catch (err) {
      setError(err.message);
    }
    setSaving(false);
  };

  if (!user) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center px-6">
        <div className="text-center">
          <User className="w-12 h-12 mx-auto text-white/10 mb-4" />
          <p className="text-white/40 text-sm mb-4">You need to be signed in first</p>
          <button onClick={() => navigate('/login')}
            className="px-6 py-2.5 bg-white text-black rounded-lg font-medium text-sm">
            Sign In
          </button>
        </div>
      </div>
    );
  }

  // Step 0 — Choose account type
  if (step === 0) {
    return (
      <div className="min-h-screen bg-black flex flex-col items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm">
          <div className="text-center mb-10">
            <div className="w-14 h-14 rounded-2xl bg-white/[0.06] flex items-center justify-center mx-auto mb-4">
              <Music className="w-7 h-7 text-white/60" />
            </div>
            <h1 className="text-2xl font-bold text-white mb-2">Welcome to Feelz Machine</h1>
            <p className="text-sm text-white/40">How do you want to use the platform?</p>
          </div>

          <div className="space-y-3">
            <button
              onClick={() => handleChooseType('artist')}
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

            <button
              onClick={() => handleChooseType('listener')}
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

          <p className="text-center text-xs text-white/20 mt-8">
            You can always upgrade to an artist account later
          </p>
        </div>
      </div>
    );
  }

  // Step 1 — Artist setup
  if (step === 1) {
    return (
      <div className="min-h-screen bg-black flex flex-col items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm">
          <button onClick={() => setStep(0)}
            className="flex items-center space-x-2 text-white/40 hover:text-white/60 mb-8 transition">
            <ArrowLeft className="w-4 h-4" />
            <span className="text-sm">Back</span>
          </button>

          <div className="text-center mb-8">
            <div className="w-14 h-14 rounded-2xl bg-purple-500/20 flex items-center justify-center mx-auto mb-4">
              <Music className="w-7 h-7 text-purple-400" />
            </div>
            <h1 className="text-2xl font-bold text-white mb-2">Set Up Your Artist Profile</h1>
            <p className="text-sm text-white/40">This is how fans and other artists will find you</p>
          </div>

          {error && (
            <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
              {error}
            </div>
          )}

          <div className="space-y-5">
            {/* Profile image */}
            <div className="flex flex-col items-center">
              <div className="relative mb-3">
                <div className="w-24 h-24 rounded-full bg-white/[0.06] border-2 border-dashed border-white/[0.15] flex items-center justify-center overflow-hidden">
                  {imagePreview ? (
                    <img src={imagePreview} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <Upload className="w-6 h-6 text-white/20" />
                  )}
                </div>
                <label className="absolute -bottom-1 -right-1 w-8 h-8 rounded-full bg-white flex items-center justify-center cursor-pointer shadow-lg hover:bg-white/90 transition">
                  <Upload className="w-3.5 h-3.5 text-black" />
                  <input type="file" accept="image/*" onChange={handleImageChange} className="hidden" />
                </label>
              </div>
              <p className="text-xs text-white/30">Profile photo (optional)</p>
            </div>

            {/* Artist name */}
            <div>
              <label className="block text-xs font-medium text-white/50 mb-2">Artist Name *</label>
              <input
                type="text"
                value={artistName}
                onChange={(e) => setArtistName(e.target.value)}
                placeholder="Your artist name"
                maxLength={50}
                className="w-full px-4 py-3 bg-white/[0.04] border border-white/[0.08] rounded-xl text-white placeholder-white/20 text-sm focus:outline-none focus:border-white/[0.2] transition"
              />
            </div>

            {/* Bio */}
            <div>
              <label className="block text-xs font-medium text-white/50 mb-2">Bio (optional)</label>
              <textarea
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                placeholder="Tell people about your music..."
                rows={3}
                maxLength={300}
                className="w-full px-4 py-3 bg-white/[0.04] border border-white/[0.08] rounded-xl text-white placeholder-white/20 text-sm focus:outline-none focus:border-white/[0.2] transition resize-none"
              />
            </div>

            <button
              onClick={handleArtistSubmit}
              disabled={saving || !artistName.trim()}
              className="w-full py-3.5 bg-white text-black rounded-xl font-semibold text-sm flex items-center justify-center space-x-2 disabled:opacity-30 hover:bg-white/90 transition active:scale-[0.98]">
              {saving ? <Loader className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
              <span>{saving ? 'Setting up...' : 'Create Artist Profile'}</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Step 2 — Listener setup
  return (
    <div className="min-h-screen bg-black flex flex-col items-center justify-center px-6 py-12">
      <div className="w-full max-w-sm">
        <button onClick={() => setStep(0)}
          className="flex items-center space-x-2 text-white/40 hover:text-white/60 mb-8 transition">
          <ArrowLeft className="w-4 h-4" />
          <span className="text-sm">Back</span>
        </button>

        <div className="text-center mb-8">
          <div className="w-14 h-14 rounded-2xl bg-blue-500/20 flex items-center justify-center mx-auto mb-4">
            <Headphones className="w-7 h-7 text-blue-400" />
          </div>
          <h1 className="text-2xl font-bold text-white mb-2">Almost there</h1>
          <p className="text-sm text-white/40">Just one quick thing and you're in</p>
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
            {error}
          </div>
        )}

        <div className="space-y-5">
          <div>
            <label className="block text-xs font-medium text-white/50 mb-2">Display Name (optional)</label>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder={user.email.split('@')[0]}
              maxLength={40}
              className="w-full px-4 py-3 bg-white/[0.04] border border-white/[0.08] rounded-xl text-white placeholder-white/20 text-sm focus:outline-none focus:border-white/[0.2] transition"
            />
            <p className="text-xs text-white/25 mt-1.5">Defaults to your email username</p>
          </div>

          <button
            onClick={handleListenerSubmit}
            disabled={saving}
            className="w-full py-3.5 bg-white text-black rounded-xl font-semibold text-sm flex items-center justify-center space-x-2 disabled:opacity-30 hover:bg-white/90 transition active:scale-[0.98]">
            {saving ? <Loader className="w-4 h-4 animate-spin" /> : <Headphones className="w-4 h-4" />}
            <span>{saving ? 'Setting up...' : 'Start Listening'}</span>
          </button>
        </div>

        <p className="text-center text-xs text-white/20 mt-8">
          Want to share your music?{' '}
          <button onClick={() => setStep(1)} className="text-white/40 hover:text-white/60 underline transition">
            Create an artist profile instead
          </button>
        </p>
      </div>
    </div>
  );
}
