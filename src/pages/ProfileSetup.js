import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { useAuth } from '../contexts/AuthContext';
import { Music, Upload, Loader, ArrowRight, User } from 'lucide-react';

function slugify(text) {
  return text.toString().toLowerCase().trim()
    .replace(/\s+/g, '-')
    .replace(/[^\w\-]+/g, '')
    .replace(/\-\-+/g, '-');
}

export default function ProfileSetup() {
  const navigate = useNavigate();
  const { user, refreshProfile } = useAuth();
  const [step, setStep] = useState(1);
  const [artistName, setArtistName] = useState('');
  const [bio, setBio] = useState('');
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleImageChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
  };

  const handleSubmit = async () => {
    if (!artistName.trim()) { setError('Artist name is required'); return; }
    if (!user) { setError('Not signed in'); return; }

    setSaving(true);
    setError('');

    try {
      let profileImageUrl = null;

      // Upload profile image if provided
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

      // Generate unique slug
      let slug = slugify(artistName);
      const { data: existing } = await supabase
        .from('artists')
        .select('slug')
        .eq('slug', slug)
        .single();
      if (existing) slug = `${slug}-${Date.now().toString(36)}`;

      // Create artist record
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

      // Refresh auth context so isArtist becomes true
      await refreshProfile();

      navigate('/hub');
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

  return (
    <div className="min-h-screen bg-black flex flex-col items-center justify-center px-6 py-12">
      <div className="w-full max-w-sm">

        {/* Header */}
        <div className="text-center mb-10">
          <div className="w-14 h-14 rounded-2xl bg-white/[0.06] flex items-center justify-center mx-auto mb-4">
            <Music className="w-7 h-7 text-white/60" />
          </div>
          <h1 className="text-2xl font-bold text-white mb-2">Set Up Your Artist Profile</h1>
          <p className="text-sm text-white/40">This is how other artists and fans will find you</p>
        </div>

        {/* Error */}
        {error && (
          <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
            {error}
          </div>
        )}

        <div className="space-y-5">

          {/* Profile Image */}
          <div className="flex flex-col items-center">
            <div className="relative mb-3">
              <div className="w-24 h-24 rounded-full bg-white/[0.06] border-2 border-dashed border-white/[0.15] flex items-center justify-center overflow-hidden">
                {imagePreview ? (
                  <img src={imagePreview} alt="" className="w-24 h-24 object-cover" />
                ) : (
                  <Upload className="w-6 h-6 text-white/20" />
                )}
              </div>
            </div>
            <label className="cursor-pointer text-xs text-white/40 hover:text-white/60 transition">
              {imagePreview ? 'Change photo' : 'Upload profile photo (optional)'}
              <input type="file" accept=".jpg,.jpeg,.png,.webp" onChange={handleImageChange} className="hidden" />
            </label>
          </div>

          {/* Artist Name */}
          <div>
            <label className="block text-xs text-white/40 mb-1.5">Artist Name *</label>
            <input
              type="text"
              value={artistName}
              onChange={(e) => setArtistName(e.target.value)}
              placeholder="Your artist name"
              maxLength={60}
              className="w-full px-4 py-3 bg-white/[0.06] rounded-xl text-white placeholder-white/20 outline-none focus:bg-white/[0.1] transition text-sm"
            />
            {artistName && (
              <p className="text-[11px] text-white/20 mt-1">
                Profile URL: /artist/{slugify(artistName)}
              </p>
            )}
          </div>

          {/* Bio */}
          <div>
            <label className="block text-xs text-white/40 mb-1.5">Bio (optional)</label>
            <textarea
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              placeholder="Tell people about your music..."
              rows={3}
              maxLength={300}
              className="w-full px-4 py-3 bg-white/[0.06] rounded-xl text-white placeholder-white/20 outline-none focus:bg-white/[0.1] transition text-sm resize-none"
            />
            <p className="text-[11px] text-white/20 mt-1 text-right">{bio.length}/300</p>
          </div>

          {/* Submit */}
          <button
            onClick={handleSubmit}
            disabled={saving || !artistName.trim()}
            className="w-full py-3.5 bg-white text-black font-semibold rounded-xl flex items-center justify-center space-x-2 disabled:opacity-40 transition hover:bg-white/90 active:scale-[0.98]"
          >
            {saving ? (
              <Loader className="w-5 h-5 animate-spin" />
            ) : (
              <>
                <span>Create Artist Profile</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>

          <p className="text-center text-[11px] text-white/20">
            You can always change this later in your profile settings
          </p>
        </div>
      </div>
    </div>
  );
}
