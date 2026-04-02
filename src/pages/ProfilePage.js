import { Helmet } from 'react-helmet-async';
import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { useAuth } from '../contexts/AuthContext';
import {
  LogOut, ChevronRight, User, Music, Globe, Shield, Radio,
  Instagram, Twitter, Youtube, MessageCircle, Loader,
  Save, Palette, ExternalLink, DollarSign, Camera,
  Link, Zap, Crown, Star, Trash2, AlertTriangle, Plus
} from 'lucide-react';
import ThemeEditor from '../components/ThemeEditor';
import PaymentSettings from '../components/PaymentSettings';
import TierGate from '../components/TierGate';
import { TierBadge } from '../components/TierGate';
import { useTier } from '../contexts/useTier';

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

const PROFILE_IMAGE_BUCKET = 'artist-images';
const MAX_DAILY_THOUGHTS   = 3;
const THOUGHT_TTL_MS       = 24 * 60 * 60 * 1000;
const BIO_MAX              = 300;

const ARTIST_TABS = [
  { key: 'profile',  label: 'Profile',  icon: User },
  { key: 'theme',    label: 'Theme',    icon: Palette },
  { key: 'links',    label: 'Links',    icon: Link },
  { key: 'payments', label: 'Payments', icon: DollarSign },
];

export default function ProfilePage() {
  const nav = useNavigate();
  const {
    user, profile, artist, isAdmin, isArtist, signOut, refreshProfile,
    rawIsAdmin, rawIsArtist, rawIsMaster, viewAs, setViewAs, deleteAccount,
  } = useAuth();
  const { tierSlug } = useTier();

  const [activeTab, setActiveTab]             = useState('profile');
  const [editing, setEditing]                 = useState(false);
  const [saving, setSaving]                   = useState(false);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [msg, setMsg]                         = useState('');
  const [profileImgFile, setProfileImgFile]   = useState(null);
  const [previewUrl, setPreviewUrl]           = useState(null);
  const [form, setForm] = useState({
    artist_name: '', bio: '',
    instagram: '', twitter: '', youtube: '',
    tiktok: '', facebook: '', discord: '', website: '',
  });

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [deleting, setDeleting]                   = useState(false);
  const [deleteError, setDeleteError]             = useState('');

  const [thoughts, setThoughts]         = useState([]);
  const [thoughtInput, setThoughtInput] = useState('');
  const [thoughtSaving, setThoughtSaving] = useState(false);
  const [thoughtMsg, setThoughtMsg]     = useState('');
  const [deletingId, setDeletingId]     = useState(null);

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
    if (error) setThoughtMsg('Failed to post');
    else { setThoughtInput(''); setThoughtMsg('Posted!'); fetchThoughts(); }
    setTimeout(() => setThoughtMsg(''), 2500);
  };

  const deleteThought = async (id) => {
    setDeletingId(id);
    await supabase.from('artist_thoughts').delete().eq('id', id);
    setThoughts(prev => prev.filter(t => t.id !== id));
    setDeletingId(null);
  };

  useEffect(() => { if (artist) fetchThoughts(); }, [artist, fetchThoughts]);

  useEffect(() => {
    if (artist) {
      const s = artist.social_links || {};
      setForm({
        artist_name: artist.artist_name || '', bio: artist.bio || '',
        instagram: s.instagram || '', twitter: s.twitter || '',
        youtube: s.youtube || '', tiktok: s.tiktok || '',
        facebook: s.facebook || '', discord: s.discord || '', website: s.website || '',
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
        artist_name: form.artist_name, bio: form.bio,
        social_links: sl, updated_at: new Date().toISOString(),
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
      <div className="pt-16 md:pt-4 pb-4 px-4 text-center">
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
    <div className="pt-12 md:pt-0 pb-8 px-4 md:px-0">
      <Helmet>
        <title>Profile · Feelz Machine</title>
        <meta name="description" content="Manage your Feelz Machine artist profile, theme, social links and payments." />
        <link rel="canonical" href="https://www.feelzmachine.com/profile" />
      </Helmet>

      <h1 className="text-2xl font-bold text-white mb-5 sticky top-0 z-20
        bg-black/90 backdrop-blur-sm md:relative md:top-auto md:bg-transparent
        md:backdrop-blur-none pt-2 pb-2 -mx-4 px-4">Profile</h1>

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
                {/* Upload spinner overlay */}
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

          {/* Profile tab */}
          {activeTab === 'profile' && (
            <>
              {/* Listener preferences — genre/mood for Collab Radar matching */}
              <button onClick={() => nav('/profile/edit')}
                className="w-full flex items-center justify-between p-4 rounded-2xl border border-white/[0.06] mb-4 hover:bg-white/[0.03] transition"
                style={{ background: 'rgba(255,255,255,0.02)' }}>
                <div className="flex items-center space-x-3">
                  <div className="w-8 h-8 rounded-lg bg-purple-500/20 flex items-center justify-center">
                    <Radio className="w-4 h-4 text-purple-400" />
                  </div>
                  <div className="text-left">
                    <p className="text-sm font-medium text-white">Listener Preferences</p>
                    <p className="text-xs text-white/30">Genre & mood — used for Collab Radar matching</p>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-white/20" />
              </button>
                  <button onClick={() => { setEditing(!editing); setMsg(''); }}
                    className="text-xs text-white/40 hover:text-white/60 transition px-2 py-1 rounded-lg hover:bg-white/[0.04]">
                    {editing ? 'Cancel' : 'Edit'}
                  </button>
                </div>
                <div className="p-4">
                  {editing ? (
                    <div className="space-y-3">
                      <div>
                        <label className="block text-xs text-white/40 mb-1">Artist Name</label>
                        <input type="text" value={form.artist_name}
                          onChange={e => setForm({ ...form, artist_name: e.target.value })}
                          className="w-full px-3 py-2.5 bg-white/[0.06] rounded-lg text-white text-sm outline-none border border-white/[0.06] focus:border-white/20 transition" />
                      </div>
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <label className="text-xs text-white/40">Bio</label>
                          <span className={`text-xs transition ${form.bio.length > BIO_MAX * 0.9 ? 'text-yellow-400' : 'text-white/20'}`}>
                            {form.bio.length}/{BIO_MAX}
                          </span>
                        </div>
                        <textarea rows={3} value={form.bio} maxLength={BIO_MAX}
                          onChange={e => setForm({ ...form, bio: e.target.value })}
                          className="w-full px-3 py-2.5 bg-white/[0.06] rounded-lg text-white text-sm outline-none resize-none border border-white/[0.06] focus:border-white/20 transition" />
                      </div>
                      {profileImgFile && (
                        <p className="text-xs text-green-400 flex items-center space-x-1">
                          <Camera className="w-3 h-3" /><span>{profileImgFile.name} selected</span>
                        </p>
                      )}
                      <button onClick={save} disabled={saving}
                        className="w-full py-2.5 bg-white text-black rounded-xl font-semibold text-sm flex items-center justify-center space-x-2 disabled:opacity-50 transition active:scale-[0.98]">
                        {saving ? <Loader className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                        <span>{saving ? 'Saving...' : 'Save Changes'}</span>
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {form.bio
                        ? <p className="text-sm text-white/60 leading-relaxed">{form.bio}</p>
                        : <p className="text-xs text-white/20 italic">No bio yet — tap Edit to add one</p>}
                    </div>
                  )}
                </div>
              </div>

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

          {/* Theme tab */}
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

          {/* Links tab */}
          {activeTab === 'links' && (
            <div className="rounded-2xl border border-white/[0.06] overflow-hidden mb-4" style={{ background: 'rgba(255,255,255,0.02)' }}>
              <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.05]">
                <p className="text-sm font-semibold text-white">Social Links</p>
                {!editing && hasAnyLinks && (
                  <button onClick={() => setEditing(true)}
                    className="text-xs text-white/40 hover:text-white/60 transition px-2 py-1 rounded-lg hover:bg-white/[0.04]">Edit</button>
                )}
                {editing && (
                  <button onClick={() => { setEditing(false); setMsg(''); }}
                    className="text-xs text-white/40 hover:text-white/60 transition px-2 py-1 rounded-lg hover:bg-white/[0.04]">Cancel</button>
                )}
              </div>
              <div className="p-4">
                {editing ? (
                  <div className="space-y-3">
                    {SOCIALS.map(({ key, label, icon: Icon, ph }) => (
                      <div key={key}>
                        <label className="block text-xs text-white/30 mb-1">{label}</label>
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
                    <div className="flex space-x-2 pt-1">
                      <button onClick={() => { setEditing(false); setMsg(''); }}
                        className="flex-1 py-2.5 rounded-xl text-sm font-medium text-white/40 border border-white/[0.08] hover:bg-white/[0.04] transition">Cancel</button>
                      <button onClick={save} disabled={saving}
                        className="flex-1 py-2.5 bg-white text-black rounded-xl font-semibold text-sm flex items-center justify-center space-x-2 disabled:opacity-50 transition active:scale-[0.98]">
                        {saving ? <Loader className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                        <span>{saving ? 'Saving...' : 'Save'}</span>
                      </button>
                    </div>
                  </div>
                ) : hasAnyLinks ? (
                  <div className="space-y-2">
                    {SOCIALS.filter(p => form[p.key]).map(({ key, label, icon: Icon }) => (
                      <div key={key} className="flex items-center space-x-3 py-1.5">
                        <div className="w-7 h-7 rounded-lg bg-white/[0.04] flex items-center justify-center border border-white/[0.06]">
                          <Icon className="w-3.5 h-3.5 text-white/40" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[10px] text-white/30 mb-0.5">{label}</p>
                          <p className="text-xs text-white/60 truncate">{form[key]}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  /* Better empty state */
                  <div className="py-6 text-center">
                    <div className="w-10 h-10 rounded-xl bg-white/[0.04] flex items-center justify-center mx-auto mb-3 border border-white/[0.06]">
                      <Link className="w-4 h-4 text-white/20" />
                    </div>
                    <p className="text-sm text-white/40 mb-1">No social links yet</p>
                    <p className="text-xs text-white/20 mb-4">Add your socials so fans can find you everywhere</p>
                    <button onClick={() => setEditing(true)}
                      className="inline-flex items-center space-x-1.5 px-4 py-2 rounded-lg bg-white/[0.06] hover:bg-white/[0.1] transition text-sm text-white/60 font-medium">
                      <Plus className="w-3.5 h-3.5" />
                      <span>Add Links</span>
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Payments tab */}
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

      {/* ── Nav links ── */}
      <div className="rounded-2xl border border-white/[0.06] overflow-hidden mb-4" style={{ background: 'rgba(255,255,255,0.02)' }}>
        {isArtist && <NavRow icon={Music} label="Artist Dashboard" iconColor="text-purple-400" onClick={() => nav('/dashboard')} />}
        {isAdmin  && <NavRow icon={Shield} label="Admin Panel" iconColor="text-yellow-400" onClick={() => nav('/admin')} border />}
        <NavRow icon={Globe} label="Privacy Policy" onClick={() => nav('/privacy-policy')} border />
        <NavRow icon={Globe} label="Terms of Use"   onClick={() => nav('/terms-of-use')}   border />
      </div>

      {/* ── Role switcher ── */}
      {(rawIsAdmin || rawIsMaster) && (
        <div className="rounded-2xl border border-white/[0.06] p-4 mb-4" style={{ background: 'rgba(255,255,255,0.02)' }}>
          <p className="text-[10px] uppercase tracking-wider text-white/25 font-semibold mb-3">View As</p>
          <div className="flex flex-wrap gap-2">
            {[
              { key: null, label: 'Default' },
              ...(rawIsAdmin  ? [{ key: 'admin',    label: 'Admin' }]  : []),
              ...(rawIsArtist ? [{ key: 'artist',   label: 'Artist' }] : []),
              { key: 'listener', label: 'Listener' },
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

function NavRow({ icon: Icon, label, iconColor = 'text-white/30', onClick, border = false }) {
  return (
    <button onClick={onClick}
      className={`w-full flex items-center justify-between p-4 hover:bg-white/[0.03] transition ${border ? 'border-t border-white/[0.04]' : ''}`}>
      <div className="flex items-center space-x-3">
        <Icon className={`w-5 h-5 ${iconColor}`} /><span className="text-sm text-white">{label}</span>
      </div>
      <ChevronRight className="w-4 h-4 text-white/15" />
    </button>
  );
}
