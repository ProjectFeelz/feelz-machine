// src/pages/AdminNews.js
//
// Two things live here because they are the two things that fill the card on
// the right of the PC home page:
//
//   NEWS      the platform_news rows behind "What's New & Trending". Paste a
//             YouTube link and the card shows that episode as a thumbnail; no
//             API key, nothing to expire, and the video does not load until
//             somebody clicks it.
//
//   FEATURED  the board. It rotates on its own every night (migration 128),
//             so this panel is not for choosing who is on it — it is for
//             seeing why they are, and for pinning the handful you want to
//             stay put. Pinned rows are never taken down by the rotation.
//
// Modelled on AdminHomeHero so it behaves the same way: create at the top,
// the list below, a toast for everything.

import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { ArrowLeft, Loader, Trash2, Pin, PinOff, Youtube, Eye, EyeOff, Newspaper, Star } from 'lucide-react';
import { supabase } from '../supabaseClient';
import { useAuth } from '../contexts/AuthContext';
import { youTubeId } from '../components/HomeAsideCard';

const inputCls = "w-full px-3 py-2.5 bg-white/[0.06] rounded-lg text-white text-sm outline-none focus:bg-white/[0.1] transition";

export default function AdminNews() {
  const navigate = useNavigate();
  const { isAdmin } = useAuth();

  const [tab, setTab]         = React.useState('news');
  const [items, setItems]     = React.useState([]);
  const [board, setBoard]     = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving]   = React.useState(false);
  const [toast, setToast]     = React.useState('');

  const [form, setForm] = React.useState({
    title: '', body: '', link_url: '', link_label: '', youtube_url: '',
  });

  const showToast = (m) => { setToast(m); setTimeout(() => setToast(''), 3000); };

  const load = React.useCallback(async () => {
    const [newsRes, boardRes] = await Promise.all([
      supabase.from('platform_news').select('*')
        .order('pinned', { ascending: false })
        .order('published_at', { ascending: false }),
      supabase.from('tracks')
        .select('id, title, featured, featured_at, featured_until, featured_reason, featured_locked, artists!tracks_artist_id_fkey(artist_name)')
        .eq('featured', true)
        .order('featured_at', { ascending: false }),
    ]);
    if (newsRes.error)  console.warn('[admin news] news:',  newsRes.error.code, newsRes.error.message);
    if (boardRes.error) console.warn('[admin news] board:', boardRes.error.code, boardRes.error.message);
    setItems(newsRes.data || []);
    setBoard((boardRes.data || []).map(t => ({ ...t, artist_name: t.artists?.artist_name || 'Unknown' })));
    setLoading(false);
  }, []);

  React.useEffect(() => { load(); }, [load]);
  React.useEffect(() => { if (isAdmin === false) navigate('/hub'); }, [isAdmin, navigate]);

  const ytPreview = youTubeId(form.youtube_url);

  const create = async () => {
    if (!form.title.trim()) { showToast('A title is the one thing it needs'); return; }
    if (form.youtube_url.trim() && !ytPreview) {
      showToast('That YouTube link is not one I can read — paste the address from the browser bar');
      return;
    }
    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase.from('platform_news').insert({
      title:       form.title.trim(),
      body:        form.body.trim() || null,
      link_url:    form.link_url.trim() || null,
      link_label:  form.link_label.trim() || null,
      youtube_url: form.youtube_url.trim() || null,
      created_by:  user?.id || null,
    });
    setSaving(false);
    if (error) { showToast('Error: ' + error.message); return; }
    setForm({ title: '', body: '', link_url: '', link_label: '', youtube_url: '' });
    showToast('Live on the home card');
    load();
  };

  const setField = async (id, patch, msg) => {
    const { error } = await supabase.from('platform_news').update(patch).eq('id', id);
    if (error) { showToast('Error: ' + error.message); return; }
    if (msg) showToast(msg);
    load();
  };

  const remove = async (id) => {
    if (!window.confirm('Delete this post? It disappears from the home card straight away.')) return;
    const { error } = await supabase.from('platform_news').delete().eq('id', id);
    if (error) { showToast('Error: ' + error.message); return; }
    load();
  };

  const setLock = async (trackId, locked) => {
    const { error } = await supabase.from('tracks')
      .update({ featured_locked: locked }).eq('id', trackId);
    if (error) { showToast('Error: ' + error.message); return; }
    showToast(locked ? 'Pinned — the nightly rotation will leave it alone' : 'Unpinned — it rotates out with the rest');
    load();
  };

  const unfeature = async (trackId) => {
    const { error } = await supabase.from('tracks')
      .update({ featured: false, featured_locked: false, featured_reason: null }).eq('id', trackId);
    if (error) { showToast('Error: ' + error.message); return; }
    showToast('Taken off the board');
    load();
  };

  const daysLeft = (until) => {
    if (!until) return null;
    const d = Math.ceil((new Date(until) - Date.now()) / 86400000);
    return d;
  };

  if (!isAdmin) return null;

  const TabBtn = ({ id, label, icon: Icon, count }) => (
    <button onClick={() => setTab(id)}
      className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm font-semibold transition ${
        tab === id ? 'bg-white text-black' : 'text-white/40 hover:text-white/70'
      }`}>
      <Icon className="w-4 h-4" />
      <span>{label}</span>
      <span className={`text-[11px] ${tab === id ? 'text-black/40' : 'text-white/25'}`}>{count}</span>
    </button>
  );

  return (
    <div className="pt-4 pb-32 px-4 md:px-8">
      <Helmet><title>What's New</title><meta name="robots" content="noindex, nofollow" /></Helmet>

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
          <h1 className="text-xl font-bold text-white">What's New</h1>
          <p className="text-xs text-white/30">The card on the right of Home, on a computer.</p>
        </div>
      </div>

      <div className="flex gap-1 mb-6 bg-white/[0.03] rounded-xl p-1 w-fit">
        <TabBtn id="news"  label="Posts"    icon={Newspaper} count={items.length} />
        <TabBtn id="board" label="Featured" icon={Star}      count={board.length} />
      </div>

      {/* ── POSTS ──────────────────────────────────────────────────────── */}
      {tab === 'news' && (
        <>
          <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-5 space-y-3 mb-8 max-w-2xl">
            <p className="text-xs font-bold text-white/50 uppercase tracking-wide">New post</p>

            <input className={inputCls} placeholder="Title" value={form.title}
              onChange={e => setForm({ ...form, title: e.target.value })} />

            <textarea className={inputCls + ' min-h-[90px] resize-y'} placeholder="What happened (optional)"
              value={form.body} onChange={e => setForm({ ...form, body: e.target.value })} />

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* A path like /profile/edit opens inside the app; anything
                  starting with http opens in a new tab. The card works out
                  which from the first character. */}
              <input className={inputCls} placeholder="Link — /dashboard, or https://…" value={form.link_url}
                onChange={e => setForm({ ...form, link_url: e.target.value })} />
              <input className={inputCls} placeholder="Link wording (e.g. Read more)" value={form.link_label}
                onChange={e => setForm({ ...form, link_label: e.target.value })} />
            </div>

            <div>
              <input className={inputCls} placeholder="YouTube link — paste it straight from the address bar"
                value={form.youtube_url}
                onChange={e => setForm({ ...form, youtube_url: e.target.value })} />
              <p className="mt-1.5 text-[11px] text-white/25 flex items-center gap-1.5">
                <Youtube className="w-3.5 h-3.5" />
                {form.youtube_url.trim()
                  ? (ytPreview
                      ? 'Good — that episode will show as a thumbnail. Nothing plays until somebody clicks it.'
                      : 'I cannot read that one. A watch, youtu.be, shorts or live link all work.')
                  : 'Optional. A podcast episode shows as a thumbnail on the card.'}
              </p>
              {ytPreview && (
                <img src={`https://i.ytimg.com/vi/${ytPreview}/hqdefault.jpg`} alt=""
                  className="mt-2 w-48 rounded-lg border border-white/10" />
              )}
            </div>

            <button onClick={create} disabled={saving}
              className="w-full py-2.5 rounded-lg bg-purple-500 text-white text-sm font-bold hover:bg-purple-400 transition disabled:opacity-40">
              {saving ? 'Posting…' : 'Post it'}
            </button>
          </div>

          {loading ? (
            <div className="flex justify-center py-16"><Loader className="w-5 h-5 animate-spin text-white/20" /></div>
          ) : items.length === 0 ? (
            <p className="text-xs text-white/30 py-4">Nothing posted yet.</p>
          ) : (
            <div className="space-y-2 max-w-2xl">
              {items.map(n => {
                const vid = youTubeId(n.youtube_url);
                return (
                  <div key={n.id} className={`rounded-xl border p-4 flex items-start gap-4 ${
                    n.pinned ? 'border-purple-400/30 bg-purple-400/[0.04]' : 'border-white/[0.06] bg-white/[0.02]'
                  } ${n.is_published ? '' : 'opacity-50'}`}>
                    {vid && (
                      <img src={`https://i.ytimg.com/vi/${vid}/default.jpg`} alt=""
                        className="w-20 h-14 rounded-lg object-cover flex-shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-white">{n.title}</p>
                      {n.body && <p className="text-xs text-white/35 line-clamp-2 mt-0.5">{n.body}</p>}
                      <p className="text-[10px] text-white/20 mt-1">
                        {new Date(n.published_at).toLocaleDateString()}
                        {n.link_url ? ` · links to ${n.link_url}` : ''}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button onClick={() => setField(n.id, { pinned: !n.pinned }, n.pinned ? 'Unpinned' : 'Pinned to the top')}
                        className="p-1.5 rounded-lg hover:bg-white/[0.08] transition" title={n.pinned ? 'Unpin' : 'Pin to the top'}>
                        {n.pinned ? <Pin className="w-3.5 h-3.5 text-purple-300" /> : <PinOff className="w-3.5 h-3.5 text-white/30" />}
                      </button>
                      <button onClick={() => setField(n.id, { is_published: !n.is_published }, n.is_published ? 'Hidden' : 'Showing again')}
                        className="p-1.5 rounded-lg hover:bg-white/[0.08] transition" title={n.is_published ? 'Hide' : 'Show'}>
                        {n.is_published ? <Eye className="w-3.5 h-3.5 text-white/40" /> : <EyeOff className="w-3.5 h-3.5 text-white/25" />}
                      </button>
                      <button onClick={() => remove(n.id)} className="p-1.5 rounded-lg hover:bg-red-500/10 transition" title="Delete">
                        <Trash2 className="w-3.5 h-3.5 text-red-400" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* ── FEATURED BOARD ─────────────────────────────────────────────── */}
      {tab === 'board' && (
        <div className="max-w-2xl">
          <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-4 mb-5">
            <p className="text-xs text-white/40 leading-relaxed">
              The board fills itself every night. A track earns a week on it by
              passing a stream milestone, by being one of the week's biggest
              risers among smaller tracks, by being one of the most liked, or by
              being a new release from an artist with a finished profile. One
              slot per artist, and tier counts for nothing here.
              <br /><br />
              <strong className="text-white/60">Pin</strong> anything you want to
              stay put — pinned rows are never taken down by the rotation.
            </p>
          </div>

          {loading ? (
            <div className="flex justify-center py-16"><Loader className="w-5 h-5 animate-spin text-white/20" /></div>
          ) : board.length === 0 ? (
            <p className="text-xs text-white/30 py-4">
              Nothing featured. If migration 128 has not run yet, that is why.
            </p>
          ) : (
            <div className="space-y-2">
              {board.map(t => {
                const d = daysLeft(t.featured_until);
                return (
                  <div key={t.id} className={`rounded-xl border p-4 flex items-center gap-4 ${
                    t.featured_locked ? 'border-purple-400/30 bg-purple-400/[0.04]' : 'border-white/[0.06] bg-white/[0.02]'
                  }`}>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-white truncate">{t.title}</p>
                      <p className="text-xs text-white/35 truncate">{t.artist_name}</p>
                      <p className="text-[10px] text-white/25 mt-1">
                        {t.featured_reason || 'no reason recorded'}
                        {t.featured_locked
                          ? ' · pinned, stays up'
                          : d != null ? ` · ${d > 0 ? `${d} day${d === 1 ? '' : 's'} left` : 'comes down tonight'}` : ''}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button onClick={() => setLock(t.id, !t.featured_locked)}
                        className="p-1.5 rounded-lg hover:bg-white/[0.08] transition"
                        title={t.featured_locked ? 'Unpin' : 'Pin so the rotation leaves it alone'}>
                        {t.featured_locked ? <Pin className="w-3.5 h-3.5 text-purple-300" /> : <PinOff className="w-3.5 h-3.5 text-white/30" />}
                      </button>
                      <button onClick={() => unfeature(t.id)}
                        className="text-[11px] font-bold px-2.5 py-1 rounded-lg bg-white/[0.06] text-white/50 hover:bg-white/[0.1] hover:text-white transition">
                        Take down
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}