// src/pages/NewsletterComposePage.js
// One panel, one send path, two audiences that can never both be selected
// at once, the toggle below is deliberately either/or, not checkboxes,
// so an editor physically cannot send to both lists in a single send.
// Accessible to full admins and to anyone granted newsletter_editors
// access; an editor gets exactly this page and nothing else on the
// platform opens up to them.

import React from 'react';
import { Helmet } from 'react-helmet-async';
import { Loader, Send, Users, Store, Plus, X } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../supabaseClient';

const inputCls = "w-full px-3 py-2.5 bg-white/[0.06] rounded-lg text-white text-sm outline-none focus:bg-white/[0.1] transition";

export default function NewsletterComposePage() {
  const { user, isAdmin } = useAuth();
  const [checking, setChecking] = React.useState(true);
  const [authorized, setAuthorized] = React.useState(false);
  const [audience, setAudience] = React.useState(null); // 'main_app' | 'retail' | null
  const [title, setTitle] = React.useState('');
  const [excerpt, setExcerpt] = React.useState('');
  const [body, setBody] = React.useState('');
  const [youtubeUrl, setYoutubeUrl] = React.useState('');
  const bodyRef = React.useRef(null);
  const imageInputRef = React.useRef(null);
  const [uploadingImage, setUploadingImage] = React.useState(false);
  const [sending, setSending] = React.useState(false);
  const [confirmOpen, setConfirmOpen] = React.useState(false);
  const [posts, setPosts] = React.useState([]);
  const [editors, setEditors] = React.useState([]);
  const [newEditorEmail, setNewEditorEmail] = React.useState('');
  const [newEditorName, setNewEditorName] = React.useState('');
  const [toast, setToast] = React.useState('');

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(''), 2500); };

  React.useEffect(() => {
    if (!user) { setChecking(false); return; }
    if (isAdmin) { setAuthorized(true); setChecking(false); return; }
    supabase.from('newsletter_editors').select('id').eq('user_id', user.id).maybeSingle()
      .then(({ data }) => { setAuthorized(!!data); setChecking(false); });
  }, [user, isAdmin]);

  const loadPosts = React.useCallback(() => {
    supabase.from('newsletter_posts').select('*').order('created_at', { ascending: false }).limit(20)
      .then(({ data }) => setPosts(data || []));
  }, []);

  React.useEffect(() => { if (authorized) loadPosts(); }, [authorized, loadPosts]);

  React.useEffect(() => {
    if (authorized && isAdmin) {
      supabase.from('newsletter_editors').select('*').order('created_at', { ascending: false })
        .then(({ data }) => setEditors(data || []));
    }
  }, [authorized, isAdmin]);

  const setBodyFromEditor = () => {
    if (bodyRef.current) setBody(bodyRef.current.innerHTML);
  };

  const format = (command, value = null) => {
    bodyRef.current?.focus();
    document.execCommand(command, false, value);
    setBodyFromEditor();
  };

  const insertImage = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingImage(true);
    const path = `newsletter/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.]/g, '_')}`;
    const { error: upErr } = await supabase.storage.from('covers').upload(path, file, { cacheControl: '31536000' });
    if (upErr) { showToast('Image upload failed: ' + upErr.message); setUploadingImage(false); e.target.value = ''; return; }
    const { data: { publicUrl } } = supabase.storage.from('covers').getPublicUrl(path);
    format('insertImage', publicUrl);
    setUploadingImage(false);
    e.target.value = '';
  };

  const send = async () => {
    setSending(true);
    const { error } = await supabase.rpc('send_newsletter', {
      p_title: title.trim(), p_excerpt: excerpt.trim(), p_body: body.trim(), p_audience: audience,
      p_youtube_url: youtubeUrl.trim() || null,
    });
    setSending(false);
    setConfirmOpen(false);
    if (error) { showToast('Error: ' + error.message); return; }
    showToast(`Sent to ${audience === 'retail' ? 'retail venues' : 'the main app'}`);
    setTitle(''); setExcerpt(''); setBody(''); setYoutubeUrl(''); setAudience(null);
    if (bodyRef.current) bodyRef.current.innerHTML = '';
    loadPosts();
  };

  const addEditor = async () => {
    if (!newEditorEmail.trim()) return;
    const { data: foundUserId, error: lookupError } = await supabase.rpc('admin_find_user_by_email', { p_email: newEditorEmail.trim() });
    if (lookupError || !foundUserId) { showToast('No account found with that email'); return; }
    const { data, error } = await supabase.from('newsletter_editors')
      .insert({ user_id: foundUserId, editor_name: newEditorName.trim() || null })
      .select().single();
    if (error) { showToast('Error: ' + error.message); return; }
    setEditors(prev => [data, ...prev]);
    setNewEditorEmail(''); setNewEditorName('');
    showToast('Editor added');
  };

  const removeEditor = async (id) => {
    await supabase.from('newsletter_editors').delete().eq('id', id);
    setEditors(prev => prev.filter(e => e.id !== id));
  };

  if (!user) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center px-6 text-center">
        <p className="text-sm text-white/50">Log in to access the newsletter panel.</p>
      </div>
    );
  }
  if (checking) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <Loader className="w-5 h-5 text-white/30 animate-spin" />
      </div>
    );
  }
  if (!authorized) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center px-6 text-center">
        <p className="text-sm text-white/50">You don't have newsletter access.</p>
      </div>
    );
  }

  const canSend = title.trim() && excerpt.trim() && body.trim() && audience;

  return (
    <div className="min-h-screen bg-black text-white pb-24">
      <Helmet><title>Newsletter</title><meta name="robots" content="noindex, nofollow" /></Helmet>

      {toast && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-xl bg-white/10 backdrop-blur-md border border-white/10 text-sm text-white font-medium shadow-lg">
          {toast}
        </div>
      )}

      <div className="max-w-xl lg:max-w-3xl mx-auto px-5 pt-8 space-y-6">
        <div>
          <p className="text-purple-400 text-xs font-bold tracking-widest uppercase mb-1">Newsletter</p>
          <h1 className="text-2xl font-bold">Compose</h1>
          <p className="text-xs text-white/30 mt-1">
            Signed in as <span className="text-white/60">{user.email}</span>
            <span className="mx-1.5 text-white/15">·</span>
            <span className={`font-semibold ${isAdmin ? 'text-yellow-400' : 'text-purple-400'}`}>{isAdmin ? 'Admin' : 'Newsletter Editor'}</span>
          </p>
        </div>

        <div className="space-y-3">
          <p className="text-xs font-bold text-white/50 uppercase tracking-wide">Who's this going to?</p>
          <div className="grid grid-cols-2 gap-2">
            <button onClick={() => setAudience('main_app')}
              className={`flex items-center justify-center space-x-2 py-4 rounded-xl border-2 transition ${audience === 'main_app' ? 'bg-purple-500 border-purple-500 text-white' : 'bg-white/[0.03] border-white/10 text-white/50'}`}>
              <Users className="w-4 h-4" /><span className="text-sm font-bold">Main App</span>
            </button>
            <button onClick={() => setAudience('retail')}
              className={`flex items-center justify-center space-x-2 py-4 rounded-xl border-2 transition ${audience === 'retail' ? 'bg-purple-500 border-purple-500 text-white' : 'bg-white/[0.03] border-white/10 text-white/50'}`}>
              <Store className="w-4 h-4" /><span className="text-sm font-bold">Retail</span>
            </button>
          </div>
          {audience && (
            <p className="text-[11px] text-white/30">
              {audience === 'main_app' ? 'Goes to every artist on the platform.' : 'Goes to every currently active retail venue.'}
            </p>
          )}
        </div>

        <div className="space-y-3">
          <input className={inputCls} placeholder="Title" value={title} onChange={e => setTitle(e.target.value)} />
          <textarea className={inputCls} placeholder="Short excerpt, this is what shows in the notification itself"
            rows={2} value={excerpt} onChange={e => setExcerpt(e.target.value)} />

          <div>
            <div className="flex items-center flex-wrap gap-1 mb-2 p-1.5 rounded-lg bg-white/[0.04] border border-white/[0.06]">
              <button type="button" onClick={() => format('bold')} onMouseDown={e => e.preventDefault()} title="Bold"
                className="px-2.5 py-1.5 rounded text-sm font-bold text-white/70 hover:bg-white/[0.08] transition">B</button>
              <button type="button" onClick={() => format('italic')} onMouseDown={e => e.preventDefault()} title="Italic"
                className="px-2.5 py-1.5 rounded text-sm italic text-white/70 hover:bg-white/[0.08] transition">I</button>
              <div className="w-px h-5 bg-white/10 mx-1" />
              <button type="button" onClick={() => format('formatBlock', 'h2')} onMouseDown={e => e.preventDefault()} title="Heading"
                className="px-2.5 py-1.5 rounded text-xs font-bold text-white/70 hover:bg-white/[0.08] transition">H2</button>
              <button type="button" onClick={() => format('formatBlock', 'h3')} onMouseDown={e => e.preventDefault()} title="Subheading"
                className="px-2.5 py-1.5 rounded text-xs font-bold text-white/70 hover:bg-white/[0.08] transition">H3</button>
              <button type="button" onClick={() => format('formatBlock', 'p')} onMouseDown={e => e.preventDefault()} title="Paragraph"
                className="px-2.5 py-1.5 rounded text-xs text-white/70 hover:bg-white/[0.08] transition">P</button>
              <div className="w-px h-5 bg-white/10 mx-1" />
              <button type="button" onClick={() => format('insertUnorderedList')} onMouseDown={e => e.preventDefault()} title="Bullet list"
                className="px-2.5 py-1.5 rounded text-xs text-white/70 hover:bg-white/[0.08] transition">• List</button>
              <div className="w-px h-5 bg-white/10 mx-1" />
              <label title="Text color" className="flex items-center px-1.5 py-1 rounded hover:bg-white/[0.08] transition cursor-pointer">
                <span className="text-xs text-white/70 mr-1">A</span>
                <input type="color" defaultValue="#c6ff3d" onChange={e => format('foreColor', e.target.value)}
                  className="w-5 h-5 rounded cursor-pointer bg-transparent" />
              </label>
              <div className="w-px h-5 bg-white/10 mx-1" />
              <button type="button" onClick={() => imageInputRef.current?.click()} disabled={uploadingImage}
                className="px-2.5 py-1.5 rounded text-xs font-semibold text-purple-300 hover:bg-white/[0.08] transition disabled:opacity-40">
                {uploadingImage ? 'Uploading…' : '+ Image'}
              </button>
              <input ref={imageInputRef} type="file" accept="image/*" onChange={insertImage} className="hidden" />
            </div>
            <div
              ref={bodyRef}
              contentEditable
              onInput={setBodyFromEditor}
              data-placeholder="Full content, this becomes the linked page"
              className={`${inputCls} min-h-[220px] max-h-[420px] overflow-y-auto [&_h2]:text-xl [&_h2]:font-bold [&_h2]:mt-3 [&_h2]:mb-1.5 [&_h3]:text-base [&_h3]:font-bold [&_h3]:mt-2 [&_h3]:mb-1 [&_img]:max-w-full [&_img]:rounded-lg [&_img]:my-2 [&_ul]:list-disc [&_ul]:pl-5 empty:before:content-[attr(data-placeholder)] empty:before:text-white/25`}
            />
          </div>

          <input className={inputCls} placeholder="YouTube video link (optional)" value={youtubeUrl}
            onChange={e => setYoutubeUrl(e.target.value)} />
        </div>

        <button onClick={() => setConfirmOpen(true)} disabled={!canSend}
          className="w-full py-3 rounded-xl bg-purple-500 text-white font-bold hover:bg-purple-400 transition disabled:opacity-30 flex items-center justify-center space-x-2">
          <Send className="w-4 h-4" /><span>Send</span>
        </button>

        {confirmOpen && (
          <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center px-6" onClick={() => setConfirmOpen(false)}>
            <div className="bg-black border border-white/10 rounded-2xl p-5 max-w-sm w-full" onClick={e => e.stopPropagation()}>
              <p className="text-sm font-bold text-white mb-2">
                Send to {audience === 'retail' ? 'every active retail venue' : 'every artist on the platform'}?
              </p>
              <p className="text-xs text-white/40 mb-4">This can't be recalled once sent.</p>
              <div className="flex space-x-2">
                <button onClick={() => setConfirmOpen(false)} className="flex-1 py-2.5 rounded-lg bg-white/[0.06] text-white/60 text-sm font-semibold">Cancel</button>
                <button onClick={send} disabled={sending} className="flex-1 py-2.5 rounded-lg bg-purple-500 text-white text-sm font-bold disabled:opacity-40">
                  {sending ? 'Sending…' : 'Confirm send'}
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="space-y-2 pt-4 border-t border-white/[0.06]">
          <p className="text-xs font-bold text-white/50 uppercase tracking-wide">Sent</p>
          {posts.length === 0 ? (
            <p className="text-xs text-white/30 py-2">Nothing sent yet.</p>
          ) : posts.map(p => (
            <div key={p.id} className="flex items-center justify-between px-3 py-2 rounded-lg bg-white/[0.03] text-sm">
              <span className="text-white/70 truncate">{p.title}</span>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full flex-shrink-0 ml-2 ${p.audience === 'retail' ? 'bg-purple-500/15 text-purple-300' : 'bg-cyan-500/15 text-cyan-300'}`}>
                {p.audience === 'retail' ? 'Retail' : 'Main App'}
              </span>
            </div>
          ))}
        </div>

        {isAdmin && (
          <div className="space-y-3 pt-4 border-t border-white/[0.06]">
            <p className="text-xs font-bold text-white/50 uppercase tracking-wide">Newsletter editors ({editors.length})</p>
            <p className="text-[11px] text-white/30">Someone with editor access can compose and send from this exact panel, nothing else on the platform opens up to them. Admins already have full access and don't need to be added here, this list is only for granting access to people who aren't admins.</p>
            <div className="flex space-x-2">
              <input className={inputCls} placeholder="Editor's email" value={newEditorEmail} onChange={e => setNewEditorEmail(e.target.value)} />
              <input className={inputCls} placeholder="Name (optional)" value={newEditorName} onChange={e => setNewEditorName(e.target.value)} />
              <button onClick={addEditor} className="px-3.5 py-2.5 rounded-lg bg-purple-500 text-white flex-shrink-0"><Plus className="w-4 h-4" /></button>
            </div>
            <div className="space-y-1.5">
              {editors.map(ed => (
                <div key={ed.id} className="flex items-center justify-between px-3 py-2 rounded-lg bg-white/[0.03]">
                  <span className="text-sm text-white">{ed.editor_name || ed.user_id}</span>
                  <button onClick={() => removeEditor(ed.id)} className="text-white/20 hover:text-red-400"><X className="w-3.5 h-3.5" /></button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}