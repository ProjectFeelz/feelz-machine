// src/pages/AdminHomeHero.js
// Manages the manually-controlled hero slot on Home. One hero is live at a
// time; activating a new one stands the previous one down automatically
// (handled server-side in activate_home_hero, so there's no window where
// two are live at once).

import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { ArrowLeft, Loader, Image as ImageIcon, Check, Trash2 } from 'lucide-react';
import { supabase } from '../supabaseClient';
import { useAuth } from '../contexts/AuthContext';

const ACCENTS = [
  { key: 'lime',   label: 'Lime',   swatch: '#C6FF3D' },
  { key: 'purple', label: 'Purple', swatch: '#A78BFA' },
  { key: 'amber',  label: 'Amber',  swatch: '#FBBF24' },
  { key: 'rose',   label: 'Rose',   swatch: '#FB7185' },
];

const inputCls = "w-full px-3 py-2.5 bg-white/[0.06] rounded-lg text-white text-sm outline-none focus:bg-white/[0.1] transition";

export default function AdminHomeHero() {
  const navigate = useNavigate();
  const { isAdmin } = useAuth();

  const [heroes, setHeroes] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [toast, setToast] = React.useState('');
  const [uploading, setUploading] = React.useState(false);
  const imageRef = React.useRef(null);

  const [form, setForm] = React.useState({
    eyebrow: '', title: '', subtitle: '',
    image_url: '', cta_label: '', cta_path: '', accent: 'lime',
  });

  const showToast = (m) => { setToast(m); setTimeout(() => setToast(''), 2500); };

  const load = React.useCallback(async () => {
    const { data } = await supabase.from('home_hero').select('*').order('created_at', { ascending: false });
    setHeroes(data || []);
    setLoading(false);
  }, []);

  React.useEffect(() => { load(); }, [load]);

  React.useEffect(() => {
    if (!isAdmin) navigate('/hub');
  }, [isAdmin, navigate]);

  const uploadImage = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const path = `home-hero/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.]/g, '_')}`;
    const { error } = await supabase.storage.from('covers').upload(path, file, { cacheControl: '31536000' });
    setUploading(false);
    e.target.value = '';
    if (error) { showToast('Upload failed: ' + error.message); return; }
    const { data: { publicUrl } } = supabase.storage.from('covers').getPublicUrl(path);
    setForm(f => ({ ...f, image_url: publicUrl }));
  };

  const create = async () => {
    if (!form.title.trim()) { showToast('Title is required'); return; }
    setSaving(true);
    const { error } = await supabase.from('home_hero').insert({
      eyebrow: form.eyebrow.trim() || null,
      title: form.title.trim(),
      subtitle: form.subtitle.trim() || null,
      image_url: form.image_url || null,
      cta_label: form.cta_label.trim() || null,
      cta_path: form.cta_path.trim() || null,
      accent: form.accent,
    });
    setSaving(false);
    if (error) { showToast('Error: ' + error.message); return; }
    setForm({ eyebrow: '', title: '', subtitle: '', image_url: '', cta_label: '', cta_path: '', accent: 'lime' });
    showToast('Hero created, activate it below to put it live');
    load();
  };

  const activate = async (id) => {
    const { error } = await supabase.rpc('activate_home_hero', { p_hero_id: id });
    if (error) { showToast('Error: ' + error.message); return; }
    showToast('Now live on Home');
    load();
  };

  const remove = async (id) => {
    if (!window.confirm('Delete this hero?')) return;
    await supabase.from('home_hero').delete().eq('id', id);
    load();
  };

  const clearActive = async () => {
    await supabase.from('home_hero').update({ is_active: false }).eq('is_active', true);
    showToast('Hero cleared, Home will show no hero');
    load();
  };

  if (!isAdmin) return null;

  return (
    <div className="pt-4 pb-32 px-4 md:px-0">
      <Helmet><title>Home Hero</title><meta name="robots" content="noindex, nofollow" /></Helmet>

      {toast && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-xl bg-white/10 backdrop-blur-md border border-white/10 text-sm text-white font-medium shadow-lg">
          {toast}
        </div>
      )}

      <div className="flex items-center space-x-3 mb-6">
        <button onClick={() => navigate('/hub')} className="w-9 h-9 flex items-center justify-center rounded-full bg-white/[0.06] hover:bg-white/[0.1] transition">
          <ArrowLeft className="w-4 h-4 text-white" />
        </button>
        <div>
          <h1 className="text-xl font-bold text-white">Home Hero</h1>
          <p className="text-xs text-white/30">The big slot at the top of Home. One is live at a time.</p>
        </div>
      </div>

      {/* Create */}
      <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-5 space-y-3 max-w-2xl mb-8">
        <p className="text-xs font-bold text-white/50 uppercase tracking-wide">New hero</p>

        <div className="flex items-center space-x-3">
          <button type="button" onClick={() => imageRef.current?.click()}
            className="w-20 h-20 rounded-xl overflow-hidden bg-white/[0.06] border border-white/[0.08] flex items-center justify-center flex-shrink-0 hover:bg-white/[0.1] transition">
            {uploading ? <Loader className="w-5 h-5 text-white/40 animate-spin" />
              : form.image_url ? <img src={form.image_url} alt="" className="w-full h-full object-cover" />
              : <ImageIcon className="w-6 h-6 text-white/20" />}
          </button>
          <input ref={imageRef} type="file" accept="image/*" className="hidden" onChange={uploadImage} />
          <p className="text-[11px] text-white/30 flex-1">
            {form.image_url ? 'Tap to change the background image' : 'Tap to add a background image (optional)'}
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <input className={inputCls} placeholder="Eyebrow (e.g. SCHOOL SESSIONS)" value={form.eyebrow}
            onChange={e => setForm({ ...form, eyebrow: e.target.value })} />
          <input className={inputCls} placeholder="Title" value={form.title}
            onChange={e => setForm({ ...form, title: e.target.value })} />
        </div>
        <input className={inputCls} placeholder="Subtitle (optional)" value={form.subtitle}
          onChange={e => setForm({ ...form, subtitle: e.target.value })} />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <input className={inputCls} placeholder="Button label (e.g. Enter now)" value={form.cta_label}
            onChange={e => setForm({ ...form, cta_label: e.target.value })} />
          <input className={inputCls} placeholder="Button link (e.g. /schoolsessions)" value={form.cta_path}
            onChange={e => setForm({ ...form, cta_path: e.target.value })} />
        </div>

        <div className="flex items-center space-x-2">
          <span className="text-[11px] text-white/30 mr-1">Accent</span>
          {ACCENTS.map(a => (
            <button key={a.key} type="button" onClick={() => setForm({ ...form, accent: a.key })}
              className={`w-7 h-7 rounded-full border-2 transition ${form.accent === a.key ? 'border-white' : 'border-transparent'}`}
              style={{ background: a.swatch }} title={a.label} />
          ))}
        </div>

        <button onClick={create} disabled={saving}
          className="w-full py-2.5 rounded-lg bg-purple-500 text-white text-sm font-bold hover:bg-purple-400 transition disabled:opacity-40">
          {saving ? 'Creating…' : 'Create hero'}
        </button>
      </div>

      {/* Existing */}
      <div className="flex items-center justify-between mb-3 max-w-2xl">
        <p className="text-xs font-bold text-white/50 uppercase tracking-wide">Heroes ({heroes.length})</p>
        {heroes.some(h => h.is_active) && (
          <button onClick={clearActive} className="text-[11px] text-white/30 hover:text-white/60 transition">
            Clear active (show no hero)
          </button>
        )}
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Loader className="w-5 h-5 animate-spin text-white/20" /></div>
      ) : heroes.length === 0 ? (
        <p className="text-xs text-white/30 py-4">No heroes yet. Create one above.</p>
      ) : (
        <div className="space-y-2 max-w-2xl">
          {heroes.map(h => (
            <div key={h.id} className={`rounded-xl border p-4 flex items-center space-x-4 ${h.is_active ? 'border-lime-400/30 bg-lime-400/[0.04]' : 'border-white/[0.06] bg-white/[0.02]'}`}>
              <div className="w-16 h-16 rounded-lg overflow-hidden bg-white/[0.06] flex-shrink-0 flex items-center justify-center">
                {h.image_url ? <img src={h.image_url} alt="" className="w-full h-full object-cover" />
                  : <ImageIcon className="w-5 h-5 text-white/15" />}
              </div>
              <div className="flex-1 min-w-0">
                {h.eyebrow && <p className="text-[10px] uppercase tracking-widest text-white/30">{h.eyebrow}</p>}
                <p className="text-sm font-bold text-white truncate">{h.title}</p>
                {h.subtitle && <p className="text-xs text-white/35 truncate">{h.subtitle}</p>}
                {h.cta_label && <p className="text-[10px] text-white/25 mt-1">Button: {h.cta_label} → {h.cta_path || 'no link'}</p>}
              </div>
              <div className="flex items-center space-x-2 flex-shrink-0">
                {h.is_active ? (
                  <span className="text-[10px] font-bold px-2.5 py-1 rounded-full bg-lime-400/15 text-lime-400 flex items-center space-x-1">
                    <Check className="w-3 h-3" /><span>Live</span>
                  </span>
                ) : (
                  <button onClick={() => activate(h.id)}
                    className="text-[11px] font-bold px-2.5 py-1 rounded-lg bg-white/[0.06] text-white/50 hover:bg-white/[0.1] hover:text-white transition">
                    Make live
                  </button>
                )}
                <button onClick={() => remove(h.id)} className="p-1.5 rounded-lg hover:bg-red-500/10 transition">
                  <Trash2 className="w-3.5 h-3.5 text-red-400" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}