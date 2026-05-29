import { Helmet } from 'react-helmet-async';
import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { useAuth } from '../contexts/AuthContext';
import {
  LogOut, ChevronRight, User, Music, Globe, Shield, Trophy,
  Instagram, Twitter, Youtube, MessageCircle, Loader,
  Save, Palette, ExternalLink, DollarSign, Camera, Check,
  Link, Zap, Crown, Star, Trash2, AlertTriangle, Plus, Mic
} from 'lucide-react';
import ThemeEditor from '../components/ThemeEditor';
import PaymentSettings from '../components/PaymentSettings';
import TierGate from '../components/TierGate';
import { TierBadge } from '../components/TierGate';
import { useTier } from '../contexts/useTier';
import ProfileCompletionBanner from '../components/ProfileCompletionBanner';
import { useStreakContext } from '../contexts/StreakContext';

const TikTokIcon = ({ className }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor">
    <path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-2.88 2.5 2.89 2.89 0 01-2.89-2.89 2.89 2.89 0 012.89-2.89c.28 0 .54.04.79.1V9.01a6.33 6.33 0 00-.79-.05 6.34 6.34 0 00-6.34 6.34 6.34 6.34 0 006.34 6.34 6.34 6.34 0 006.33-6.34V8.75a8.16 8.16 0 004.77 1.52V6.82a4.85 4.85 0 01-1-.13z"/>
  </svg>
);

const SOCIALS = [
  { key: 'instagram', label: 'Instagram',   icon: Instagram,     ph: 'https://instagram.com/yourname' },
  { key: 'twitter',   label: 'X (Twitter)', icon: Twitter,       ph: 'https://x.com/yourname' },
  { key: 'youtube',   label: 'YouTube',     icon: Youtube,       ph: 'https://youtube.com/yourchannel' },
  { key: 'tiktok',    label: 'TikTok',      icon: TikTokIcon,    ph: 'https://tiktok.com/@yourname' },
  { key: 'facebook',  label: 'Facebook',    icon: Globe,         ph: 'https://facebook.com/yourpage' },
  { key: 'discord',   label: 'Discord',     icon: MessageCircle, ph: 'Discord invite link' },
  { key: 'website',   label: 'Website',     icon: Globe,         ph: 'https://yourwebsite.com' },
];

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

const PROFILE_IMAGE_BUCKET = 'artist-images';
const MAX_DAILY_THOUGHTS   = 3;
const THOUGHT_TTL_MS       = 24 * 60 * 60 * 1000;
const BIO_MAX              = 300;

const ARTIST_TABS = [
  { key: 'profile',  label: 'Profile',  icon: User },
  { key: 'edit',     label: 'Edit',     icon: Camera },
  { key: 'theme',    label: 'Theme',    icon: Palette },
  { key: 'payments', label: 'Payments', icon: DollarSign },
];

const GENRES_LIST = [
  'Hip Hop','Trap','Drill','Boom Bap','Lo-Fi','R&B','Neo Soul','Pop',
  'Electronic','House','Deep House','Tech House','Techno','Dubstep',
  'Drum & Bass','Ambient','Downtempo','Future Bass','Jersey Club',
  'Jazz','Funk','Soul','Rock','Metal','Indie','Alternative',
  'Afrobeat','Amapiano','Reggae','Dancehall','Latin','Reggaeton',
  'Country','EDM','Trance','Hardstyle','UK Garage','Grime',
  'Experimental','Vaporwave','Synthwave','Other',
];

const MOODS_LIST = [
  'Dark','Happy','Sad','Aggressive','Chill','Energetic','Melancholic',
  'Uplifting','Mysterious','Peaceful','Intense','Dreamy','Romantic',
  'Angry','Hopeful','Nostalgic','Epic','Smooth','Bouncy','Atmospheric',
  'Moody','Vibey','Hard','Soft','Ethereal','Groovy','Other',
];

function PillSelect({ options, selected, onToggle, multi = false }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map(opt => {
        const isSelected = multi ? selected.includes(opt) : selected === opt;
        return (
          <button key={opt} type="button" onClick={() => onToggle(opt)}
            className={`flex items-center space-x-1 px-2.5 py-1 rounded-full text-xs font-medium transition active:scale-95 ${
              isSelected
                ? 'bg-white text-black'
                : 'bg-white/[0.06] text-white/40 hover:bg-white/[0.1] hover:text-white/60'
            }`}>
            {isSelected && <Check className="w-2.5 h-2.5" strokeWidth={3} />}
            <span>{opt}</span>
          </button>
        );
      })}
    </div>
  );
}

export default function ProfilePage() {
  const nav = useNavigate();
  const {
    user, profile, artist, isAdmin, isArtist, isBeatmaker, signOut, refreshProfile,
    rawIsAdmin, rawIsArtist, rawIsMaster, viewAs, setViewAs, deleteAccount,
  } = useAuth();
  const { tierSlug } = useTier();
  const { streak, longestStreak, discoveryStreak } = useStreakContext();
  const [streakRow, setStreakRow]       = useState(null);
  const [freezing, setFreezing]         = useState(false);
  const [freezeMsg, setFreezeMsg]       = useState('');

  useEffect(() => {
    if (!user) return;
    supabase.from('user_streaks').select('*').eq('user_id', user.id).maybeSingle()
      .then(({ data }) => setStreakRow(data));
  }, [user?.id]);

  const useStreakFreeze = async () => {
    if (!streakRow || !streakRow.freeze_available || freezing) return;
    const thisMonth = new Date().toISOString().slice(0, 7);
    if (streakRow.freeze_used_month === thisMonth) {
      setFreezeMsg('You already used your freeze this month.');
      return;
    }
    setFreezing(true);
    // Extend last_active_date by 1 day so streak doesn't break
    const newDate = new Date();
    newDate.setDate(newDate.getDate() + 1);
    const { error } = await supabase.from('user_streaks').update({
      freeze_used_month: thisMonth,
      freeze_available: false,
      last_active_date: newDate.toISOString().split('T')[0],
    }).eq('user_id', user.id);
    if (!error) {
      setStreakRow(prev => ({ ...prev, freeze_used_month: thisMonth, freeze_available: false }));
      setFreezeMsg('Freeze used! Your streak is protected for today.');
    }
    setFreezing(false);
  };
  const [activeTab, setActiveTab]             = useState('profile');
  const [editing, setEditing]                 = useState(false);
  const [saving, setSaving]                   = useState(false);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [msg, setMsg]                         = useState('');
  const [profileImgFile, setProfileImgFile]   = useState(null);
  const [previewUrl, setPreviewUrl]           = useState(null);
  const [form, setForm] = useState({
    artist_name: '', bio: '', genre: '', mood: '',
    instagram: '', twitter: '', youtube: '',
    tiktok: '', facebook: '', discord: '', website: '',
    paypal_email: '',
  });

  // Edit tab state (unified from UserProfilePage)
  const editFileRef = React.useRef(null);
  const [editDisplayName, setEditDisplayName] = useState('');
  const [editBio, setEditBio]                 = useState('');
  const [editGenres, setEditGenres]           = useState([]);
  const [editMood, setEditMood]               = useState('');
  const [editAvatarFile, setEditAvatarFile]   = useState(null);
  const [editAvatarPreview, setEditAvatarPreview] = useState('');
  const [editSaving, setEditSaving]           = useState(false);
  const [editSaved, setEditSaved]             = useState(false);
  const [editError, setEditError]             = useState('');

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [deleting, setDeleting]                   = useState(false);
  const [deleteError, setDeleteError]             = useState('');

  const [thoughts, setThoughts]           = useState([]);
  const [thoughtInput, setThoughtInput]   = useState('');
  const [thoughtSaving, setThoughtSaving] = useState(false);
  const [thoughtMsg, setThoughtMsg]       = useState('');
  const [deletingId, setDeletingId]       = useState(null);

  const tierConfig = {
    premium: { label: 'Premium', color: '#F59E0B', bg: 'rgba(245,158,11,0.08)', icon: Crown },
    pro:     { label: 'Pro',     color: '#8B5CF6', bg: 'rgba(139,92,246,0.08)', icon: Zap },
    free:    { label: 'Free',    color: '#737373', bg: 'rgba(255,255,255,0.04)', icon: Star },
  };
  const tier     = tierConfig[tierSlug] || tierConfig.free;
  const TierIcon = tier.icon;

  const fetchThoughts = useCallback(async () => {
    if (!artist) return;
    const cutoff = new Date(Date.now() - THOUGHT_TTL_MS).toISOString();
    const { data, error } = await supabase.from('artist_thoughts')
      .select('id, content, created_at').eq('artist_id', artist.id)
      .gte('created_at', cutoff).order('created_at', { ascending: false });
    if (!error) setThoughts(data || []);
  }, [artist]);

  const todayCount     = thoughts.filter(t => {
    const p = new Date(t.created_at), n = new Date();
    return p.getFullYear() === n.getFullYear() && p.getMonth() === n.getMonth() && p.getDate() === n.getDate();
  }).length;
  const remainingToday = MAX_DAILY_THOUGHTS - todayCount;

  const postThought = async () => {
    if (!thoughtInput.trim() || !artist) return;
    if (remainingToday <= 0) {
      setThoughtMsg('Daily limit reached (3/3). Come back tomorrow!');
      setTimeout(() => setThoughtMsg(''), 3000); return;
    }
    setThoughtSaving(true);
    const { error } = await supabase.from('artist_thoughts').insert({
      artist_id: artist.id, content: thoughtInput.trim(),
      created_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + THOUGHT_TTL_MS).toISOString(),
    });
    setThoughtSaving(false);
    if (error) { setThoughtMsg('Failed to post'); }
    else {
      setThoughtInput(''); setThoughtMsg('Posted!'); fetchThoughts();
      // Notify followers
      try {
        const { data: followers } = await supabase
          .from('follows').select('follower_id').eq('artist_id', artist.id);
        if (followers?.length > 0) {
          await supabase.from('notifications').insert(
            followers.map(f => ({
              user_id:    f.follower_id,
              artist_id:  artist.id,
              type:       'artist_thought',
              title:      `${artist.artist_name} posted a thought`,
              message:    thoughtInput.trim().slice(0, 100),
              from_artist_id: artist.id,
              metadata:   { thought: true },
            }))
          );
        }
      } catch {}
    }
    setTimeout(() => setThoughtMsg(''), 2500);
  };

  const deleteThought = async (id) => {
    setDeletingId(id);
    await supabase.from('artist_thoughts').delete().eq('id', id);
    setThoughts(prev => prev.filter(t => t.id !== id));
    setDeletingId(null);
  };

  useEffect(() => { if (artist) fetchThoughts(); }, [artist, fetchThoughts]);

  // Load edit tab data from user_profiles when switching to edit tab
  useEffect(() => {
    if (activeTab !== 'edit' || !user) return;
    supabase.from('user_profiles').select('name, avatar_url, genre, genre_preferences, mood, bio')
      .eq('user_id', user.id).maybeSingle()
      .then(({ data }) => {
        if (data) {
          setEditDisplayName(data.name || artist?.artist_name || '');
          setEditBio(data.bio || artist?.bio || '');
          const savedGenres = data.genre_preferences?.length
            ? data.genre_preferences
            : data.genre ? [data.genre] : (artist?.genre ? [artist.genre] : []);
          setEditGenres(savedGenres);
          setEditMood(data.mood || artist?.mood || '');
        } else {
          setEditDisplayName(artist?.artist_name || '');
          setEditBio(artist?.bio || '');
          setEditGenres(artist?.genre ? [artist.genre] : []);
          setEditMood(artist?.mood || '');
        }
      });
  }, [activeTab, user?.id]); // eslint-disable-line

  useEffect(() => {
    if (artist) {
      const s = artist.social_links || {};
      setForm({
        artist_name: artist.artist_name || '',
        bio:         artist.bio || '',
        genre:       artist.genre || '',
        mood:        artist.mood || '',
        instagram:   s.instagram || '', twitter:   s.twitter  || '',
        youtube:     s.youtube   || '', tiktok:    s.tiktok   || '',
        facebook:    s.facebook  || '', discord:   s.discord  || '',
        website:     s.website   || '',
        paypal_email: artist.paypal_email || '',
      });
    }
  }, [artist]);

  useEffect(() => {
    if (!profileImgFile) { setPreviewUrl(null); return; }
    const url = URL.createObjectURL(profileImgFile);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [profileImgFile]);

  const uploadFile = async (file, folder) => {
    const ext  = file.name.split('.').pop();
    const name = `${folder}${Date.now()}-${Math.random().toString(36).substring(7)}.${ext}`;
    const { error: uploadError } = await supabase.storage
      .from(PROFILE_IMAGE_BUCKET).upload(name, file, { upsert: true });
    if (uploadError) throw new Error(`Image upload failed: ${uploadError.message}`);
    const { data: { publicUrl } } = supabase.storage.from(PROFILE_IMAGE_BUCKET).getPublicUrl(name);
    return publicUrl;
  };

  const save = async () => {
    if (!artist) return;
    setSaving(true); setMsg('');
    try {
      const sl = {};
      SOCIALS.forEach(p => { if (form[p.key]?.trim()) sl[p.key] = form[p.key].trim(); });
      const updateData = {
        artist_name:  form.artist_name,
        bio:          form.bio,
        genre:        form.genre || null,
        mood:         form.mood  || null,
        social_links: sl,
        paypal_email: form.paypal_email?.trim() || null,
        updated_at:   new Date().toISOString(),
      };
      if (profileImgFile) updateData.profile_image_url = await uploadFile(profileImgFile, 'profile-images/');
      const { error } = await supabase.from('artists').update(updateData).eq('id', artist.id);
      if (error) throw error;
      setMsg('Saved!'); setEditing(false); setProfileImgFile(null); setPreviewUrl(null);
      await refreshProfile();
      setTimeout(() => setMsg(''), 3000);
    } catch (e) { setMsg('Error: ' + e.message); }
    setSaving(false);
  };

  const handleEditSave = async () => {
    if (!user) return;
    setEditSaving(true); setEditError('');
    try {
      let newAvatarUrl = artist?.profile_image_url || '';
      if (editAvatarFile) {
        const ext  = editAvatarFile.name.split('.').pop();
        const path = `profile-images/${user.id}-${Date.now()}.${ext}`;
        const { error: uploadErr } = await supabase.storage
          .from('artist-images').upload(path, editAvatarFile, { upsert: true });
        if (uploadErr) throw uploadErr;
        const { data: urlData } = supabase.storage.from('artist-images').getPublicUrl(path);
        newAvatarUrl = urlData.publicUrl;
      }
      // Update artist profile
      const artistUpdate = {
        artist_name: editDisplayName.trim() || artist?.artist_name,
        bio:         editBio.trim() || null,
        genre:       editGenres[0] || null,
        mood:        editMood || null,
        updated_at:  new Date().toISOString(),
      };
      if (newAvatarUrl && newAvatarUrl !== artist?.profile_image_url) {
        artistUpdate.profile_image_url = newAvatarUrl;
      }
      // Save social links from form
      const sl = {};
      SOCIALS.forEach(p => { if (form[p.key]?.trim()) sl[p.key] = form[p.key].trim(); });
      artistUpdate.social_links = sl;

      await supabase.from('artists').update(artistUpdate).eq('id', artist.id);
      // Also upsert user_profiles for listener side
      await supabase.from('user_profiles').upsert({
        user_id:           user.id,
        name:              editDisplayName.trim() || artist?.artist_name,
        bio:               editBio.trim() || null,
        genre:             editGenres[0] || null,
        genre_preferences: editGenres,
        mood:              editMood || null,
        avatar_url:        newAvatarUrl || null,
        updated_at:        new Date().toISOString(),
      }, { onConflict: 'user_id' });
      setEditAvatarFile(null); setEditAvatarPreview('');
      await refreshProfile();
      setEditSaved(true);
      setTimeout(() => setEditSaved(false), 2500);
    } catch (err) { setEditError(err.message || 'Failed to save'); }
    setEditSaving(false);
  };

  const handleSignOut = async () => {
    try { await signOut(); } catch (e) { console.error('Sign out error:', e); }
    nav('/');
  };

  const handleDeleteAccount = async () => {
    if (deleteConfirmText !== 'DELETE') return;
    setDeleting(true); setDeleteError('');
    try { await deleteAccount(); nav('/login'); }
    catch (e) { setDeleteError(e.message || 'Something went wrong.'); setDeleting(false); }
  };

  if (!user) {
    return (
      <div className="pt-14 md:pt-4 pb-4 px-4 text-center">
        <User className="w-16 h-16 mx-auto text-white/10 mb-4" />
        <h2 className="text-lg font-semibold text-white mb-2">Not signed in</h2>
        <button onClick={() => nav('/login')}
          className="px-6 py-2.5 bg-white text-black rounded-lg font-medium text-sm">Sign In</button>
      </div>
    );
  }

  const avatarSrc    = previewUrl || artist?.profile_image_url;
  const avatarLetter = (artist?.artist_name || profile?.display_name || user.email)?.[0]?.toUpperCase();
  const hasAnyLinks  = SOCIALS.some(p => form[p.key]);

  return (
    <div className="pb-8 px-4 md:px-0">
      <Helmet>
        <link rel="icon" href="/favicon.ico" />
        <link rel="apple-touch-icon" href="/logo192.png" />
        <title>Profile · Feelz Machine</title>
        <meta name="description" content="Manage your Feelz Machine artist profile, theme, social links and payments." />
        <link rel="canonical" href="https://www.feelzmachine.com/profile" />
      </Helmet>

      <div className="sticky top-0 z-20 bg-black/95 backdrop-blur-xl md:relative md:top-auto md:bg-transparent md:backdrop-blur-none pt-14 md:pt-4 pb-3 -mx-4 px-4 border-b border-white/[0.04] md:border-none mb-5">
        <h1 className="text-2xl font-bold text-white">Profile</h1>
      </div>

      <ProfileCompletionBanner compact />

      {msg && (
        <div className={`mb-4 p-3 rounded-lg text-sm ${msg.startsWith('Error') ? 'bg-red-500/10 text-red-400' : 'bg-green-500/10 text-green-400'}`}>
          {msg}
        </div>
      )}

      {/* ── Hero card ── */}
      <div className="relative rounded-2xl overflow-hidden border border-white/[0.06] mb-5"
        style={{ background: 'linear-gradient(135deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.02) 100%)' }}>
        <div className="absolute top-0 left-0 right-0 h-px"
          style={{ background: `linear-gradient(90deg, transparent, ${tier.color}60, transparent)` }} />
        <div className="p-5">
          <div className="flex items-center space-x-4">
            <div className="relative flex-shrink-0">
              <div className="w-16 h-16 rounded-2xl overflow-hidden border border-white/10"
                style={{ background: `linear-gradient(135deg, ${tier.color}40, ${tier.color}15)` }}>
                {avatarSrc
                  ? <img src={avatarSrc} alt="" className="w-16 h-16 object-cover" />
                  : <div className="w-full h-full flex items-center justify-center">
                      <span className="text-2xl font-bold text-white">{avatarLetter}</span>
                    </div>}
                {avatarUploading && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/60 rounded-2xl">
                    <Loader className="w-5 h-5 animate-spin text-white" />
                  </div>
                )}
              </div>
              {isArtist && (
                <label className={`absolute -bottom-1 -right-1 w-6 h-6 rounded-full flex items-center justify-center cursor-pointer shadow-lg transition ${
                  avatarUploading ? 'bg-white/40 cursor-not-allowed' : 'bg-white hover:bg-white/90'
                }`}>
                  <Camera className="w-3 h-3 text-black" />
                  <input type="file" accept=".jpg,.jpeg,.png,.webp" className="hidden"
                    disabled={avatarUploading}
                    onChange={async (e) => {
                      const file = e.target.files[0];
                      if (!file) return;
                      setProfileImgFile(file);
                      setPreviewUrl(URL.createObjectURL(file));
                      setAvatarUploading(true); setMsg('');
                      try {
                        const url = await uploadFile(file, 'profile-images/');
                        const { error } = await supabase.from('artists')
                          .update({ profile_image_url: url, updated_at: new Date().toISOString() })
                          .eq('id', artist.id);
                        if (error) throw error;
                        setMsg('Photo updated!');
                        await refreshProfile();
                        setTimeout(() => setMsg(''), 3000);
                      } catch (err) { setMsg('Error: ' + err.message); }
                      setAvatarUploading(false);
                    }} />
                </label>
              )}
            </div>

            <div className="flex-1 min-w-0">
              <p className="text-base font-semibold text-white truncate">
                {artist?.artist_name || profile?.display_name || user.email}
              </p>
              <p className="text-xs text-white/30 truncate mb-1.5">{user.email}</p>
              <div className="flex items-center flex-wrap gap-1.5">
                {isArtist && <span className="text-[10px] px-1.5 py-0.5 bg-purple-500/10 text-purple-400 rounded font-medium">Artist</span>}
                {artist?.is_verified && <span className="text-[10px] px-1.5 py-0.5 bg-blue-500/10 text-blue-400 rounded font-medium">Verified</span>}
                {artist?.is_master && <span className="text-[10px] px-1.5 py-0.5 bg-yellow-500/10 text-yellow-400 rounded font-medium">Master</span>}
                <TierBadge size="xs" />
              </div>
            </div>

            {isArtist && (
              <button onClick={() => nav('/upgrade')}
                className="flex-shrink-0 flex items-center space-x-1.5 px-3 py-1.5 rounded-xl border transition hover:brightness-110"
                style={{ backgroundColor: tier.bg, borderColor: `${tier.color}25` }}>
                <TierIcon className="w-3.5 h-3.5" style={{ color: tier.color }} />
                <span className="text-xs font-semibold" style={{ color: tier.color }}>{tier.label}</span>
              </button>
            )}
          </div>

          {isArtist && artist?.slug && (
            <div className="flex items-center justify-between mt-4 pt-3 border-t border-white/[0.05]">
              <button onClick={() => nav(`/artist/${artist.slug}`)}
                className="flex items-center space-x-1.5 text-xs text-white/30 hover:text-white/50 transition">
                <ExternalLink className="w-3 h-3" /><span>/artist/{artist.slug}</span>
              </button>
              <button onClick={() => navigator.clipboard.writeText(`${window.location.origin}/artist/${artist.slug}`)}
                className="text-xs text-white/20 hover:text-white/40 transition">Copy link</button>
            </div>
          )}

          {!isArtist && (
            <div className="mt-3 pt-3 border-t border-white/[0.05]">
              <button onClick={() => nav('/profile/edit')}
                className="flex items-center space-x-1.5 text-xs text-white/40 hover:text-white/60 transition border border-white/[0.08] rounded-lg px-3 py-2">
                <span>Edit Profile</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ── Artist tabs ── */}
      {isArtist && (
        <>
          <div className="flex space-x-1 p-1 rounded-xl mb-4"
            style={{ backgroundColor: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)' }}>
            {ARTIST_TABS.map(({ key, label, icon: Icon }) => (
              <button key={key} onClick={() => { setActiveTab(key); setEditing(false); }}
                className="flex-1 flex items-center justify-center space-x-1.5 py-2 rounded-lg text-xs font-medium transition"
                style={activeTab === key ? { backgroundColor: '#fff', color: '#000' } : { color: 'rgba(255,255,255,0.4)' }}>
                <Icon className="w-3.5 h-3.5" /><span>{label}</span>
              </button>
            ))}
          </div>

          {/* ── Profile tab ── */}
          {activeTab === 'profile' && (
            <>
              {/* Artist Info card — includes genre + mood */}
              <div className="rounded-2xl border border-white/[0.06] overflow-hidden mb-4"
                style={{ background: 'rgba(255,255,255,0.02)' }}>
                <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.05]">
                  <p className="text-sm font-semibold text-white">Artist Info</p>
                  <button onClick={() => setActiveTab('edit')}
                    className="text-xs text-white/40 hover:text-white/60 transition px-2 py-1 rounded-lg hover:bg-white/[0.04]">
                    Edit →
                  </button>
                </div>
                <div className="p-4">
                  <div className="space-y-3">
                    {form.bio
                      ? <p className="text-sm text-white/60 leading-relaxed">{form.bio}</p>
                      : <p className="text-xs text-white/20 italic">No bio yet — tap Edit to add one</p>}
                    {(form.genre || form.mood) && (
                      <div className="flex flex-wrap gap-1.5 pt-1">
                        {form.genre && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-purple-500/10 text-purple-400 border border-purple-500/20">
                            {form.genre}
                          </span>
                        )}
                        {form.mood && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-blue-500/10 text-blue-400 border border-blue-500/20">
                            {form.mood}
                          </span>
                        )}
                      </div>
                    )}
                    {!form.genre && !form.mood && (
                      <p className="text-xs text-white/20 italic">No genre or mood set — tap Edit →</p>
                    )}
                  </div>
                </div>
              </div>

              {/* Thought of the Day */}
              <TierGate feature="daily_thought">
                <div className="rounded-2xl border border-white/[0.06] overflow-hidden mb-4"
                  style={{ background: 'rgba(255,255,255,0.02)' }}>
                  <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.05]">
                    <p className="text-sm font-semibold text-white">💭 Thought of the Day</p>
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                      remainingToday === 0 ? 'bg-red-500/10 text-red-400' : 'bg-white/[0.06] text-white/30'
                    }`}>{remainingToday}/{MAX_DAILY_THOUGHTS} left today</span>
                  </div>
                  <div className="p-4 space-y-3">
                    <p className="text-xs text-white/30">Share what's on your mind — appears on your profile for 24 hours</p>
                    <textarea rows={3} maxLength={280} value={thoughtInput}
                      onChange={e => setThoughtInput(e.target.value)}
                      placeholder="What's on your mind today?"
                      disabled={remainingToday <= 0}
                      className="w-full px-3 py-2.5 bg-white/[0.06] rounded-lg text-white text-sm outline-none resize-none border border-white/[0.06] focus:border-white/20 transition placeholder-white/15 disabled:opacity-40" />
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-white/20">{thoughtInput.length}/280</span>
                      <div className="flex items-center space-x-3">
                        <button
                          onClick={() => nav('/dashboard?tab=memos')}
                          title="Record a Voice Memo"
                          className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-white/[0.06] border border-white/[0.06] hover:bg-white/[0.1] transition active:scale-95"
                        >
                          <Mic className="w-3.5 h-3.5 text-pink-400" />
                          <span className="text-xs text-white/50">Voice Memo</span>
                        </button>
                        {thoughtMsg && (
                          <span className={`text-xs ${thoughtMsg.includes('Failed') || thoughtMsg.includes('limit') ? 'text-red-400' : 'text-green-400'}`}>
                            {thoughtMsg}
                          </span>
                        )}
                        <button onClick={postThought}
                          disabled={thoughtSaving || !thoughtInput.trim() || remainingToday <= 0}
                          className="px-4 py-1.5 bg-white text-black text-xs font-semibold rounded-lg disabled:opacity-40 transition active:scale-95">
                          {thoughtSaving ? 'Posting...' : 'Post'}
                        </button>
                      </div>
                    </div>
                    {thoughts.length > 0 && (
                      <div className="space-y-2 pt-1">
                        <p className="text-[11px] text-white/20 uppercase tracking-wider font-medium">Active thoughts</p>
                        {thoughts.map(t => {
                          const expiresAt = new Date(t.created_at).getTime() + THOUGHT_TTL_MS;
                          const minsLeft  = Math.max(0, Math.round((expiresAt - Date.now()) / 60000));
                          const hrsLeft   = Math.floor(minsLeft / 60);
                          const timeLabel = hrsLeft > 0 ? `${hrsLeft}h ${minsLeft % 60}m` : `${minsLeft}m`;
                          return (
                            <div key={t.id} className="flex items-start space-x-3 p-3 bg-white/[0.04] rounded-xl border border-white/[0.05]">
                              <div className="flex-1 min-w-0">
                                <p className="text-sm text-white/80 leading-relaxed">{t.content}</p>
                                <p className="text-[10px] text-white/20 mt-1">Expires in {timeLabel}</p>
                              </div>
                              <button onClick={() => deleteThought(t.id)} disabled={deletingId === t.id}
                                className="flex-shrink-0 w-7 h-7 flex items-center justify-center rounded-lg hover:bg-red-500/10 transition">
                                {deletingId === t.id
                                  ? <Loader className="w-3.5 h-3.5 animate-spin text-white/30" />
                                  : <Trash2 className="w-3.5 h-3.5 text-white/20 hover:text-red-400 transition" />}
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              </TierGate>
            </>
          )}

          {/* ── Edit tab ── */}
          {activeTab === 'edit' && (
            <div className="rounded-2xl border border-white/[0.06] overflow-hidden mb-4" style={{ background: 'rgba(255,255,255,0.02)' }}>
              <div className="px-4 py-3 border-b border-white/[0.05]">
                <p className="text-sm font-semibold text-white">Edit Profile</p>
                <p className="text-xs text-white/30 mt-0.5">Changes update your artist page instantly</p>
              </div>
              <div className="p-4 space-y-5">

                {/* ── Creator Type — prominent at top ── */}
                <div className="rounded-2xl border border-white/[0.08] overflow-hidden"
                  style={{ background: 'rgba(255,255,255,0.03)' }}>
                  <div className="px-4 py-3 border-b border-white/[0.05]">
                    <p className="text-sm font-semibold text-white">I am a…</p>
                    <p className="text-[10px] text-white/30 mt-0.5">Changes your nav, default feed and dashboard</p>
                  </div>
                  <div className="p-3 grid grid-cols-2 gap-2">
                    {[
                      { role: 'artist',    emoji: '🎤', label: 'Artist',    sub: 'Upload music & connect with fans' },
                      { role: 'beatmaker', emoji: '🎛️', label: 'Beat Maker', sub: 'Sell beats, stems & licences' },
                    ].map(({ role, emoji, label, sub }) => (
                      <button key={role} type="button"
                        onClick={async () => {
                          await supabase.from('artists').update({ role }).eq('id', artist.id);
                          await refreshProfile();
                        }}
                        className={`flex flex-col items-center py-3 px-2 rounded-xl text-center transition border ${
                          (artist?.role || 'artist') === role
                            ? 'bg-white text-black border-white'
                            : 'bg-white/[0.04] text-white/50 border-white/[0.08] hover:bg-white/[0.08]'
                        }`}>
                        <div className="text-2xl mb-1">{emoji}</div>
                        <p className="text-xs font-bold">{label}</p>
                        <p className={`text-[10px] mt-0.5 ${(artist?.role || 'artist') === role ? 'text-black/50' : 'text-white/25'}`}>{sub}</p>
                      </button>
                    ))}
                  </div>

                  {/* Listen as Fan toggle */}
                  <div className="px-4 pb-3 pt-1 border-t border-white/[0.05] flex items-center justify-between">
                    <div>
                      <p className="text-xs font-semibold text-white">Listen as Fan</p>
                      <p className="text-[10px] text-white/30 mt-0.5">
                        {viewAs === 'listener' ? 'Active — browsing as a listener' : 'Temporarily browse without creator tools'}
                      </p>
                    </div>
                    <button type="button"
                      onClick={() => setViewAs(viewAs === 'listener' ? null : 'listener')}
                      className={`relative w-12 h-6 rounded-full transition-colors flex-shrink-0 ${viewAs === 'listener' ? 'bg-purple-500' : 'bg-white/10'}`}>
                      <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${viewAs === 'listener' ? 'translate-x-7' : 'translate-x-1'}`} />
                    </button>
                  </div>
                </div>

                {/* Avatar */}
                <div className="flex flex-col items-center space-y-3">
                  <div className="relative">
                    <div className="w-20 h-20 rounded-2xl overflow-hidden border border-white/10" style={{ background: 'rgba(255,255,255,0.06)' }}>
                      {(editAvatarPreview || artist?.profile_image_url)
                        ? <img src={editAvatarPreview || artist?.profile_image_url} alt="" className="w-full h-full object-cover" />
                        : <div className="w-full h-full flex items-center justify-center">
                            <span className="text-2xl font-bold text-white/30">{artist?.artist_name?.[0]?.toUpperCase()}</span>
                          </div>}
                    </div>
                    <label className="absolute -bottom-1 -right-1 w-7 h-7 bg-white rounded-full flex items-center justify-center cursor-pointer shadow-lg hover:bg-white/90 transition">
                      <Camera className="w-3.5 h-3.5 text-black" />
                      <input type="file" accept=".jpg,.jpeg,.png,.webp" className="hidden"
                        onChange={e => {
                          const f = e.target.files?.[0];
                          if (!f) return;
                          setEditAvatarFile(f);
                          setEditAvatarPreview(URL.createObjectURL(f));
                        }} />
                    </label>
                  </div>
                  <p className="text-xs text-white/25">Tap camera to change photo</p>
                </div>

                {/* Display name */}
                <div>
                  <label className="block text-xs text-white/40 mb-1.5 font-semibold uppercase tracking-wider">Artist Name</label>
                  <input type="text" value={editDisplayName} onChange={e => setEditDisplayName(e.target.value)}
                    maxLength={50} placeholder="Your artist name"
                    className="w-full px-3 py-2.5 bg-white/[0.06] rounded-xl text-white text-sm outline-none border border-white/[0.06] focus:border-white/20 transition placeholder-white/20" />
                </div>

                {/* Bio */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs text-white/40 font-semibold uppercase tracking-wider">Bio</label>
                    <span className={`text-xs ${editBio.length > 270 ? 'text-yellow-400' : 'text-white/20'}`}>{editBio.length}/300</span>
                  </div>
                  <textarea rows={3} value={editBio} onChange={e => setEditBio(e.target.value)} maxLength={300}
                    placeholder="Tell fans about yourself..."
                    className="w-full px-3 py-2.5 bg-white/[0.06] rounded-xl text-white text-sm outline-none resize-none border border-white/[0.06] focus:border-white/20 transition placeholder-white/20" />
                </div>

                {/* Genre */}
                <div>
                  <label className="block text-xs text-white/40 mb-2 font-semibold uppercase tracking-wider">Genre</label>
                  <div className="flex flex-wrap gap-1.5">
                    {GENRES_LIST.map(g => {
                      const sel = editGenres.includes(g);
                      return (
                        <button key={g} type="button"
                          onClick={() => setEditGenres(prev => sel ? prev.filter(x => x !== g) : [...prev, g])}
                          className={`flex items-center space-x-1 px-2.5 py-1 rounded-full text-xs font-medium transition active:scale-95 ${
                            sel ? 'bg-white text-black' : 'bg-white/[0.06] text-white/40 hover:bg-white/[0.1]'
                          }`}>
                          {sel && <Check className="w-2.5 h-2.5" strokeWidth={3} />}
                          <span>{g}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Mood */}
                <div>
                  <label className="block text-xs text-white/40 mb-2 font-semibold uppercase tracking-wider">Mood</label>
                  <div className="flex flex-wrap gap-1.5">
                    {MOODS_LIST.map(m => {
                      const sel = editMood === m;
                      return (
                        <button key={m} type="button"
                          onClick={() => setEditMood(prev => prev === m ? '' : m)}
                          className={`flex items-center space-x-1 px-2.5 py-1 rounded-full text-xs font-medium transition active:scale-95 ${
                            sel ? 'bg-white text-black' : 'bg-white/[0.06] text-white/40 hover:bg-white/[0.1]'
                          }`}>
                          {sel && <Check className="w-2.5 h-2.5" strokeWidth={3} />}
                          <span>{m}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Social Links */}
                <div>
                  <label className="block text-xs text-white/40 mb-2 font-semibold uppercase tracking-wider">Social Links</label>
                  <div className="space-y-2">
                    {SOCIALS.map(({ key, label, icon: Icon, ph }) => (
                      <div key={key}>
                        <label className="block text-xs text-white/25 mb-1">{label}</label>
                        <div className="flex items-center space-x-2">
                          <div className="w-8 h-8 rounded-lg bg-white/[0.04] flex items-center justify-center flex-shrink-0 border border-white/[0.06]">
                            <Icon className="w-3.5 h-3.5 text-white/30" />
                          </div>
                          <input type="text" value={form[key]}
                            onChange={e => setForm({ ...form, [key]: e.target.value })}
                            placeholder={ph}
                            className="flex-1 px-3 py-2 bg-white/[0.06] rounded-lg text-white text-sm outline-none border border-white/[0.06] focus:border-white/20 transition placeholder-white/15" />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {editError && <p className="text-xs text-red-400">{editError}</p>}

                <button onClick={handleEditSave} disabled={editSaving}
                  className="w-full py-3 rounded-2xl font-semibold text-sm transition disabled:opacity-50 flex items-center justify-center space-x-2 active:scale-[0.98]"
                  style={{ backgroundColor: editSaved ? '#16a34a' : '#fff', color: '#000' }}>
                  {editSaving
                    ? <Loader className="w-4 h-4 animate-spin text-black" />
                    : editSaved
                      ? <><Check className="w-4 h-4 text-white" /><span className="text-white">Saved!</span></>
                      : <><Save className="w-4 h-4" /><span>Save Changes</span></>}
                </button>
              </div>
            </div>
          )}

          {/* ── Theme tab ── */}
          {activeTab === 'theme' && (
            <div className="mb-4">
              <TierGate feature="custom_theme">
                <div className="rounded-2xl border border-white/[0.06] overflow-hidden" style={{ background: 'rgba(255,255,255,0.02)' }}>
                  <div className="flex items-center space-x-2 px-4 py-3 border-b border-white/[0.05]">
                    <Palette className="w-4 h-4 text-white/40" />
                    <p className="text-sm font-semibold text-white">Customize Your Page</p>
                  </div>
                  <div className="p-4"><ThemeEditor /></div>
                </div>
              </TierGate>
            </div>
          )}



          {/* ── Payments tab ── */}
          {activeTab === 'payments' && (
            <div className="rounded-2xl border border-white/[0.06] overflow-hidden mb-4" style={{ background: 'rgba(255,255,255,0.02)' }}>
              <div className="flex items-center space-x-2 px-4 py-3 border-b border-white/[0.05]">
                <DollarSign className="w-4 h-4 text-white/40" />
                <p className="text-sm font-semibold text-white">Payments & Subscription</p>
              </div>
              <div className="p-4"><PaymentSettings /></div>
            </div>
          )}
        </>
      )}

      {/* ── Streak & Discovery card ── */}
      {user && (streak > 0 || discoveryStreak > 0) && (
        <div className="rounded-2xl border border-white/[0.06] p-4 mb-4" style={{ background: 'rgba(255,255,255,0.02)' }}>
          <p className="text-[10px] uppercase tracking-wider text-white/25 font-semibold mb-3">Your Streaks</p>
          <div className="flex space-x-3 mb-4">
            {streak > 0 && (
              <div className="flex-1 p-3 rounded-xl bg-orange-500/10 border border-orange-500/20 text-center">
                <p className="text-2xl font-bold text-orange-400">{streak}</p>
                <p className="text-[10px] text-orange-400/60 mt-0.5">Day streak 🔥</p>
                <p className="text-[10px] text-white/20 mt-1">Best: {longestStreak}</p>
              </div>
            )}
            {discoveryStreak > 0 && (
              <div className="flex-1 p-3 rounded-xl bg-blue-500/10 border border-blue-500/20 text-center">
                <p className="text-2xl font-bold text-blue-400">{discoveryStreak}</p>
                <p className="text-[10px] text-blue-400/60 mt-0.5">Discovery streak 🧭</p>
                <p className="text-[10px] text-white/20 mt-1">New artists daily</p>
              </div>
            )}
          </div>

          {/* Freeze */}
          {streakRow && streak > 2 && (
            <div>
              {streakRow.freeze_available && streakRow.freeze_used_month !== new Date().toISOString().slice(0, 7) ? (
                <button
                  onClick={useStreakFreeze}
                  disabled={freezing}
                  className="w-full py-2.5 rounded-xl border border-blue-500/25 bg-blue-500/10 text-blue-400 text-xs font-semibold hover:bg-blue-500/20 transition disabled:opacity-40"
                >
                  {freezing ? 'Activating...' : '🧊 Use Streak Freeze (1 left this month)'}
                </button>
              ) : (
                <p className="text-[11px] text-white/20 text-center py-1">
                  {streakRow.freeze_used_month === new Date().toISOString().slice(0, 7)
                    ? '🧊 Streak freeze used this month'
                    : 'Keep your streak going — freeze available next month'}
                </p>
              )}
              {freezeMsg && <p className="text-xs text-center mt-2 text-blue-400/70">{freezeMsg}</p>}
            </div>
          )}
        </div>
      )}

      {/* ── Nav links ── */}
      <div className="rounded-2xl border border-white/[0.06] overflow-hidden mb-4" style={{ background: 'rgba(255,255,255,0.02)' }}>
        {isArtist && <NavRow icon={Music} label="Artist Dashboard" iconColor="text-purple-400" onClick={() => nav('/dashboard')} />}
        {isAdmin  && <NavRow icon={Shield} label="Admin Panel" iconColor="text-yellow-400" onClick={() => nav('/admin')} border />}
        <NavRow icon={Trophy} label="Competitions" iconColor="text-yellow-400" onClick={() => nav('/competitions')} border />
        <NavRow icon={Link} label="Affiliate Programme" iconColor="text-green-400" onClick={() => nav('/affiliates')} border badge="Earn" />
        <NavRow icon={Globe} label="Privacy Policy" onClick={() => nav('/privacy-policy')} border />
        <NavRow icon={Globe} label="Terms of Use"   onClick={() => nav('/terms-of-use')}   border />
      </div>

      {/* ── Role switcher ── */}
      {(rawIsAdmin || rawIsMaster) && (
        <div className="rounded-2xl border border-white/[0.06] p-4 mb-4" style={{ background: 'rgba(255,255,255,0.02)' }}>
          <p className="text-[10px] uppercase tracking-wider text-white/25 font-semibold mb-3">View As</p>
          <div className="flex flex-wrap gap-2">
            {[
              { key: null,       label: 'Default'  },
              ...(rawIsAdmin  ? [{ key: 'admin',   label: 'Admin'   }] : []),
              ...(rawIsArtist ? [{ key: 'artist',  label: 'Artist'  }] : []),
              { key: 'listener',  label: 'Listener'   },
              { key: 'beatmaker', label: 'Beat Maker' },
            ].map(opt => (
              <button key={opt.key || 'default'} onClick={() => setViewAs(opt.key)}
                className="px-3 py-1.5 rounded-lg text-xs font-medium transition"
                style={viewAs === opt.key
                  ? { backgroundColor: '#fff', color: '#000' }
                  : { backgroundColor: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.5)' }}>
                {opt.label}
              </button>
            ))}
          </div>
          {viewAs && <p className="text-[10px] text-yellow-400/50 mt-2">Viewing as {viewAs}</p>}
        </div>
      )}

      {/* ── Sign out ── */}
      <button onClick={handleSignOut}
        className="w-full py-3 rounded-2xl font-medium text-sm flex items-center justify-center space-x-2
          bg-red-500/8 text-red-400 border border-red-500/10 hover:bg-red-500/12 transition active:scale-[0.98] mb-3">
        <LogOut className="w-4 h-4" /><span>Sign Out</span>
      </button>

      {/* ── Delete account ── */}
      {!showDeleteConfirm ? (
        <button onClick={() => setShowDeleteConfirm(true)}
          className="w-full py-2.5 rounded-2xl text-xs text-white/20 hover:text-red-400/60
            border border-white/[0.04] hover:border-red-500/10 transition flex items-center justify-center space-x-2">
          <AlertTriangle className="w-3.5 h-3.5" /><span>Delete Account</span>
        </button>
      ) : (
        <div className="rounded-2xl border border-red-500/20 p-4 bg-red-500/5">
          <div className="flex items-start space-x-3 mb-4">
            <AlertTriangle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-red-400 mb-1">Delete your account?</p>
              <p className="text-xs text-white/40 leading-relaxed">
                This permanently deletes your profile, tracks, followers and all associated data. This action cannot be undone.
              </p>
            </div>
          </div>
          <p className="text-xs text-white/40 mb-2">
            Type <span className="font-mono font-bold text-white/60">DELETE</span> to confirm
          </p>
          <input type="text" value={deleteConfirmText}
            onChange={e => setDeleteConfirmText(e.target.value)}
            placeholder="Type DELETE"
            className="w-full px-3 py-2.5 bg-white/[0.06] rounded-lg text-white text-sm outline-none
              border border-red-500/20 focus:border-red-500/40 transition placeholder-white/20 mb-3" />
          {deleteError && <p className="text-xs text-red-400 mb-3">{deleteError}</p>}
          <div className="flex space-x-2">
            <button onClick={() => { setShowDeleteConfirm(false); setDeleteConfirmText(''); setDeleteError(''); }}
              className="flex-1 py-2.5 rounded-xl text-sm text-white/40 border border-white/[0.08] hover:bg-white/[0.04] transition">Cancel</button>
            <button onClick={handleDeleteAccount}
              disabled={deleteConfirmText !== 'DELETE' || deleting}
              className="flex-1 py-2.5 rounded-xl text-sm font-semibold bg-red-500 text-white
                disabled:opacity-30 transition active:scale-[0.98] flex items-center justify-center space-x-2">
              {deleting
                ? <><Loader className="w-4 h-4 animate-spin" /><span>Deleting...</span></>
                : <><Trash2 className="w-4 h-4" /><span>Delete Forever</span></>}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function NavRow({ icon: Icon, label, iconColor = 'text-white/30', onClick, border = false, badge }) {
  return (
    <button onClick={onClick}
      className={`w-full flex items-center justify-between p-4 hover:bg-white/[0.03] transition ${border ? 'border-t border-white/[0.04]' : ''}`}>
      <div className="flex items-center space-x-3">
        <Icon className={`w-5 h-5 ${iconColor}`} /><span className="text-sm text-white">{label}</span>
      </div>
      <div className="flex items-center space-x-2">
        {badge && (
          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-green-500/15 text-green-400 border border-green-500/25">{badge}</span>
        )}
        <ChevronRight className="w-4 h-4 text-white/15" />
      </div>
    </button>
  );
}