import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { useAuth } from '../contexts/AuthContext';
import { LogOut, ChevronRight, User, Music, Globe, Shield, Instagram, Twitter, Youtube, MessageCircle, Loader, Save, Palette, ExternalLink, DollarSign } from 'lucide-react';
import ThemeEditor from '../components/ThemeEditor';
import PaymentSettings from '../components/PaymentSettings';
import TierGate from '../components/TierGate';
import { TierBadge } from '../components/TierGate';

const SOCIALS = [
  { key: 'instagram', label: 'Instagram', icon: Instagram, ph: 'https://instagram.com/yourname' },
  { key: 'twitter', label: 'X (Twitter)', icon: Twitter, ph: 'https://x.com/yourname' },
  { key: 'youtube', label: 'YouTube', icon: Youtube, ph: 'https://youtube.com/yourchannel' },
  { key: 'tiktok', label: 'TikTok', icon: MessageCircle, ph: 'https://tiktok.com/@yourname' },
  { key: 'facebook', label: 'Facebook', icon: Globe, ph: 'https://facebook.com/yourpage' },
  { key: 'discord', label: 'Discord', icon: MessageCircle, ph: 'Discord invite link' },
  { key: 'website', label: 'Website', icon: Globe, ph: 'https://yourwebsite.com' },
];

export default function ProfilePage() {
  const nav = useNavigate();
  const { user, profile, artist, isAdmin, isArtist, signOut, refreshProfile } = useAuth();
  const [activeSection, setActiveSection] = useState('info');
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const [profileImgFile, setProfileImgFile] = useState(null);
  const [form, setForm] = useState({ artist_name: '', bio: '', instagram: '', twitter: '', youtube: '', tiktok: '', facebook: '', discord: '', website: '' });

  useEffect(() => {
    if (artist) {
      const s = artist.social_links || {};
      setForm({
        artist_name: artist.artist_name || '', bio: artist.bio || '',
        instagram: s.instagram || '', twitter: s.twitter || '', youtube: s.youtube || '',
        tiktok: s.tiktok || '', facebook: s.facebook || '', discord: s.discord || '', website: s.website || ''
      });
    }
  }, [artist]);

  const uploadFile = async (file, folder) => {
    const ext = file.name.split('.').pop();
    const name = `${folder}${Date.now()}-${Math.random().toString(36).substring(7)}.${ext}`;
    const { error } = await supabase.storage.from('feelz-samples').upload(name, file);
    if (error) throw error;
    const { data: { publicUrl } } = supabase.storage.from('feelz-samples').getPublicUrl(name);
    return publicUrl;
  };

  const save = async () => {
    if (!artist) return;
    setSaving(true);
    try {
      const sl = {};
      SOCIALS.forEach(p => { if (form[p.key]?.trim()) sl[p.key] = form[p.key].trim(); });

      const updateData = {
        artist_name: form.artist_name, bio: form.bio,
        social_links: sl, updated_at: new Date().toISOString()
      };

      if (profileImgFile) {
        const imgUrl = await uploadFile(profileImgFile, 'profile-images/');
        updateData.profile_image_url = imgUrl;
      }

      const { error } = await supabase.from('artists').update(updateData).eq('id', artist.id);
      if (error) throw error;
      setMsg('Saved!'); setEditing(false); setProfileImgFile(null);
      refreshProfile();
      setTimeout(() => setMsg(''), 3000);
    } catch (e) { setMsg('Error: ' + e.message); }
    setSaving(false);
  };

  if (!user) {
    return (
      <div className="pt-16 md:pt-4 pb-4 px-4 text-center">
        <User className="w-16 h-16 mx-auto text-white/10 mb-4" />
        <h2 className="text-lg font-semibold text-white mb-2">Not signed in</h2>
        <button onClick={() => nav('/login')} className="px-6 py-2.5 bg-white text-black rounded-lg font-medium text-sm">Sign In</button>
      </div>
    );
  }

  return (
    <div className="pt-12 md:pt-0 pb-4 px-6 md:px-0 md:max-w-3xl">
      <h1 className="text-2xl font-bold text-white mb-4">Profile</h1>
      {msg && <div className={`mb-4 p-3 rounded-lg text-sm ${msg.startsWith('Error') ? 'bg-red-500/10 text-red-400' : 'bg-green-500/10 text-green-400'}`}>{msg}</div>}

      {/* Avatar card */}
      <div className="bg-white/[0.03] rounded-xl p-4 border border-white/[0.06] mb-4">
        <div className="flex items-center space-x-3">
          <div className="w-14 h-14 rounded-full bg-gradient-to-br from-purple-600 to-blue-600 flex items-center justify-center overflow-hidden">
            {artist?.profile_image_url ? <img src={artist.profile_image_url} alt="" className="w-14 h-14 rounded-full object-cover" /> : <span className="text-xl font-bold text-white">{(artist?.artist_name || user.email)?.[0]?.toUpperCase()}</span>}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-base font-semibold text-white truncate">{artist?.artist_name || profile?.name || user.email}</p>
            <p className="text-xs text-white/40 truncate">{user.email}</p>
            {isArtist && (
              <div className="flex items-center space-x-2 mt-1">
                <span className="text-[10px] px-1.5 py-0.5 bg-purple-500/10 text-purple-400 rounded">Artist</span>
                {artist?.is_verified && <span className="text-[10px] px-1.5 py-0.5 bg-blue-500/10 text-blue-400 rounded">Verified</span>}
                {artist?.is_master && <span className="text-[10px] px-1.5 py-0.5 bg-yellow-500/10 text-yellow-400 rounded">Master</span>}
                <TierBadge size="xs" />
              </div>
            )}
          </div>
        </div>
        {/* Public profile link */}
        {isArtist && artist?.slug && (
          <a href={`/artist/${artist.slug}`} target="_blank" rel="noopener noreferrer"
            className="mt-3 flex items-center space-x-1.5 text-xs text-white/30 hover:text-white/50 transition">
            <ExternalLink className="w-3 h-3" />
            <span>View public profile: /artist/{artist.slug}</span>
          </a>
        )}
      </div>

      {/* Section tabs for artists */}
      {isArtist && (
        <div className="flex space-x-1 bg-white/[0.03] rounded-lg p-1 mb-4">
          {[
            { key: 'info', label: 'Info & Socials' },
            { key: 'theme', label: 'Theme' },
            { key: 'payments', label: 'Payments' },
          ].map(({ key, label }) => (
            <button key={key} onClick={() => setActiveSection(key)}
              className={`flex-1 py-2 rounded-md text-xs font-medium transition ${
                activeSection === key ? 'bg-white text-black' : 'text-white/50'
              }`}>{label}</button>
          ))}
        </div>
      )}

      {/* Info & Socials section */}
      {(activeSection === 'info' || !isArtist) && isArtist && (
        <div className="bg-white/[0.03] rounded-xl p-4 border border-white/[0.06] mb-4 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-white">Artist Profile</h3>
            <button onClick={() => setEditing(!editing)} className="text-xs text-white/40 hover:text-white/60">{editing ? 'Cancel' : 'Edit'}</button>
          </div>
          {editing ? (
            <div className="space-y-3">
              <div>
                <label className="block text-xs text-white/40 mb-1">Artist Name</label>
                <input type="text" value={form.artist_name} onChange={e => setForm({...form, artist_name: e.target.value})}
                  className="w-full px-3 py-2.5 bg-white/[0.06] rounded-lg text-white text-sm outline-none" />
              </div>
              <div>
                <label className="block text-xs text-white/40 mb-1">Profile Image</label>
                <input type="file" accept=".jpg,.jpeg,.png,.webp"
                  onChange={(e) => setProfileImgFile(e.target.files[0])}
                  className="w-full text-sm text-white/60 file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border-0 file:bg-white/[0.06] file:text-white/60 file:text-sm" />
                {profileImgFile && <p className="text-xs text-green-400 mt-1">{profileImgFile.name}</p>}
              </div>
              <div>
                <label className="block text-xs text-white/40 mb-1">Bio</label>
                <textarea rows={3} value={form.bio} onChange={e => setForm({...form, bio: e.target.value})}
                  className="w-full px-3 py-2.5 bg-white/[0.06] rounded-lg text-white text-sm outline-none resize-none" />
              </div>
              <div>
                <h4 className="text-xs font-medium text-white/50 mb-3">Social Links</h4>
                <div className="space-y-2">
                  {SOCIALS.map(({ key, icon: I, ph }) => (
                    <div key={key} className="flex items-center space-x-2">
                      <I className="w-4 h-4 text-white/30 flex-shrink-0" />
                      <input type="text" value={form[key]} onChange={e => setForm({...form, [key]: e.target.value})}
                        placeholder={ph} className="flex-1 px-3 py-2 bg-white/[0.06] rounded-lg text-white text-sm outline-none placeholder-white/20" />
                    </div>
                  ))}
                </div>
              </div>
              <button onClick={save} disabled={saving}
                className="w-full py-2.5 bg-white text-black rounded-lg font-medium text-sm flex items-center justify-center space-x-2 disabled:opacity-50">
                {saving ? <Loader className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                <span>{saving ? 'Saving...' : 'Save Changes'}</span>
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              {form.bio && <p className="text-sm text-white/60">{form.bio}</p>}
              {SOCIALS.filter(p => form[p.key]).map(({ key, icon: I }) => (
                <div key={key} className="flex items-center space-x-2 text-sm">
                  <I className="w-3.5 h-3.5 text-white/30" /><span className="text-white/50">{form[key]}</span>
                </div>
              ))}
              {!form.bio && !SOCIALS.some(p => form[p.key]) && <p className="text-xs text-white/20">No bio or social links yet. Tap Edit to add.</p>}
            </div>
          )}
        </div>
      )}

      {/* Theme section */}
      {activeSection === 'theme' && isArtist && (
        <div className="mb-4">
          <TierGate feature="custom_theme">
            <div className="bg-white/[0.03] rounded-xl p-4 border border-white/[0.06]">
              <div className="flex items-center space-x-2 mb-4">
                <Palette className="w-4 h-4 text-white/40" />
                <h3 className="text-sm font-semibold text-white">Customize Your Page</h3>
              </div>
              <ThemeEditor />
            </div>
          </TierGate>
        </div>
      )}

      {/* Payments section */}
      {activeSection === 'payments' && isArtist && (
        <div className="bg-white/[0.03] rounded-xl p-4 border border-white/[0.06] mb-4">
          <div className="flex items-center space-x-2 mb-4">
            <DollarSign className="w-4 h-4 text-white/40" />
            <h3 className="text-sm font-semibold text-white">Payments & Subscription</h3>
          </div>
          <PaymentSettings />
        </div>
      )}

      {/* Navigation links */}
      <div className="bg-white/[0.03] rounded-xl border border-white/[0.06] overflow-hidden mb-4">
        {isArtist && (
          <button onClick={() => nav('/dashboard')} className="w-full flex items-center justify-between p-4 hover:bg-white/[0.03] transition border-b border-white/[0.04]">
            <div className="flex items-center space-x-3"><Music className="w-5 h-5 text-purple-400" /><span className="text-sm text-white">Artist Dashboard</span></div>
            <ChevronRight className="w-4 h-4 text-white/20" />
          </button>
        )}
        {isAdmin && (
          <button onClick={() => nav('/admin')} className="w-full flex items-center justify-between p-4 hover:bg-white/[0.03] transition border-b border-white/[0.04]">
            <div className="flex items-center space-x-3"><Shield className="w-5 h-5 text-yellow-400" /><span className="text-sm text-white">Admin Panel (Legacy)</span></div>
            <ChevronRight className="w-4 h-4 text-white/20" />
          </button>
        )}
        <button onClick={() => nav('/privacy-policy')} className="w-full flex items-center justify-between p-4 hover:bg-white/[0.03] transition border-b border-white/[0.04]">
          <div className="flex items-center space-x-3"><Globe className="w-5 h-5 text-white/30" /><span className="text-sm text-white">Privacy Policy</span></div>
          <ChevronRight className="w-4 h-4 text-white/20" />
        </button>
        <button onClick={() => nav('/terms-of-use')} className="w-full flex items-center justify-between p-4 hover:bg-white/[0.03] transition">
          <div className="flex items-center space-x-3"><Globe className="w-5 h-5 text-white/30" /><span className="text-sm text-white">Terms of Use</span></div>
          <ChevronRight className="w-4 h-4 text-white/20" />
        </button>
      </div>

      <button onClick={async () => { await signOut(); nav('/'); }}
        className="w-full py-3 bg-red-500/10 text-red-400 rounded-xl font-medium text-sm flex items-center justify-center space-x-2 hover:bg-red-500/15 transition">
        <LogOut className="w-4 h-4" /><span>Sign Out</span>
      </button>
    </div>
  );
}


