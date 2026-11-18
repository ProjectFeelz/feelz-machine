/**
 * src/components/DirectStreamSettings.js
 *
 * Live Studio card for direct streaming (Cloudflare Stream): the server and
 * stream key to paste into OBS, and the other platforms the stream is copied
 * to at the same time. The stream key is fetched from Cloudflare when asked
 * for and is hidden until shown. Renders a short note when direct streaming
 * is not switched on.
 */

import React, { useState } from 'react';
import { Radio, Copy, Check, Eye, EyeOff, Loader, Plus, X, Share2 } from 'lucide-react';
import { supabase } from '../supabaseClient';
import useDirectLive from '../hooks/useDirectLive';

const PLATFORMS = [
  { id: 'youtube',  label: 'YouTube',  url: 'rtmp://a.rtmp.youtube.com/live2' },
  { id: 'twitch',   label: 'Twitch',   url: 'rtmp://live.twitch.tv/app' },
  { id: 'facebook', label: 'Facebook', url: 'rtmps://live-api-s.facebook.com:443/rtmp/' },
  { id: 'custom',   label: 'Other',    url: '' },
];

async function call(body) {
  const { data: { session } } = await supabase.auth.getSession();
  const res = await fetch('/.netlify/functions/cf-live', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...body, token: session?.access_token }),
  });
  return res.json().catch(() => ({}));
}

function CopyRow({ label, value, secret }) {
  const [shown, setShown] = useState(!secret);
  const [copied, setCopied] = useState(false);
  return (
    <div>
      <p className="text-[10px] font-black tracking-[0.2em] uppercase text-white/40 mb-1">{label}</p>
      <div className="flex items-center gap-1.5">
        <code className="flex-1 min-w-0 truncate px-3 py-2.5 rounded-xl bg-black/40 border border-white/[0.08] text-xs text-white/90">
          {shown ? value : '•'.repeat(24)}
        </code>
        {secret && (
          <button onClick={() => setShown(v => !v)} aria-label={shown ? 'Hide' : 'Show'} className="w-9 h-9 rounded-xl bg-white/[0.06] flex items-center justify-center">
            {shown ? <EyeOff className="w-4 h-4 text-white/60" /> : <Eye className="w-4 h-4 text-white/60" />}
          </button>
        )}
        <button onClick={() => { navigator.clipboard?.writeText(value).catch(() => {}); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
          aria-label="Copy" className="w-9 h-9 rounded-xl bg-white/[0.06] flex items-center justify-center">
          {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4 text-white/60" />}
        </button>
      </div>
    </div>
  );
}

export default function DirectStreamSettings() {
  const cfg = useDirectLive();
  const [loading, setLoading] = useState(false);
  const [settings, setSettings] = useState(null);
  const [outputs, setOutputs] = useState(null);
  const [adding, setAdding] = useState(false);
  const [platform, setPlatform] = useState(PLATFORMS[0]);
  const [url, setUrl] = useState(PLATFORMS[0].url);
  const [key, setKey] = useState('');
  const [error, setError] = useState('');

  if (cfg.loading) return null;

  if (!cfg.configured || !cfg.canHost) {
    return (
      <section className="rounded-3xl p-5 bg-white/[0.04] border border-white/[0.07]">
        <h2 className="text-base font-black text-white mb-1 flex items-center gap-2"><Radio className="w-4 h-4 text-red-400" /> Direct streaming</h2>
        <p className="text-xs text-white/50">Stream from OBS straight into Feelz Machine, with no YouTube in between. Not switched on yet.</p>
      </section>
    );
  }

  const open = async () => {
    setLoading(true); setError('');
    const r = await call({ action: 'setup' });
    if (!r.uid) setError(r.error || 'Could not load your settings.');
    else {
      setSettings(r);
      const o = await call({ action: 'outputs', op: 'list' });
      setOutputs(o.outputs || []);
    }
    setLoading(false);
  };
  const addOutput = async () => {
    setError('');
    const r = await call({ action: 'outputs', op: 'add', url, streamKey: key });
    if (r.error) { setError(r.error); return; }
    setOutputs(r.outputs || []); setAdding(false); setKey('');
  };
  const removeOutput = async (uid) => {
    const r = await call({ action: 'outputs', op: 'remove', outputUid: uid });
    if (!r.error) setOutputs(r.outputs || []);
  };
  const nameFor = (u) => (PLATFORMS.find(p => p.url && u.startsWith(p.url.replace(/\/+$/, '')))?.label) || u.replace(/^rtmps?:\/\//, '').split('/')[0];

  return (
    <section className="rounded-3xl p-5 bg-gradient-to-br from-red-500/10 to-violet-600/10 border border-red-400/20">
      <h2 className="text-base font-black text-white mb-1 flex items-center gap-2"><Radio className="w-4 h-4 text-red-400" /> Direct from OBS</h2>
      <p className="text-xs text-white/55 mb-4">Stream straight into Feelz Machine. Every stream is recorded for the replay. These settings stay the same for every stream.</p>

      {!settings ? (
        <button onClick={open} disabled={loading}
          className="w-full py-3 rounded-2xl bg-white text-black text-sm font-black flex items-center justify-center gap-2 disabled:opacity-50">
          {loading ? <Loader className="w-4 h-4 animate-spin" /> : null} Show my OBS settings
        </button>
      ) : (
        <div className="space-y-3">
          <p className="text-xs text-white/60">In OBS: Settings, Stream, Service: Custom. Paste these two:</p>
          <CopyRow label="Server" value={settings.rtmps?.url || ''} />
          <CopyRow label="Stream key" value={settings.rtmps?.streamKey || ''} secret />
          <p className="text-[11px] text-white/40">Keep the key private. Anyone with it can stream as you.</p>

          <div className="pt-3 border-t border-white/[0.08]">
            <p className="text-sm font-black text-white flex items-center gap-2 mb-1"><Share2 className="w-4 h-4 text-violet-300" /> Also stream to</p>
            <p className="text-xs text-white/50 mb-3">Feelz Machine sends a copy to these while you are live, so you stream once from OBS.</p>
            {(outputs || []).length === 0 && !adding && <p className="text-xs text-white/40 mb-2">Nowhere else yet.</p>}
            <div className="space-y-1.5 mb-2">
              {(outputs || []).map(o => (
                <div key={o.uid} className="flex items-center gap-2 px-3 py-2 rounded-xl bg-black/30">
                  <span className="text-xs font-bold text-white flex-1 truncate">{nameFor(o.url)}</span>
                  <button onClick={() => removeOutput(o.uid)} aria-label="Stop sending there" className="w-7 h-7 rounded-lg hover:bg-white/10 flex items-center justify-center"><X className="w-3.5 h-3.5 text-white/50" /></button>
                </div>
              ))}
            </div>
            {adding ? (
              <div className="space-y-2 p-3 rounded-2xl bg-black/30 border border-white/[0.08]">
                <div className="flex gap-1.5 flex-wrap">
                  {PLATFORMS.map(p => (
                    <button key={p.id} onClick={() => { setPlatform(p); setUrl(p.url); }}
                      className={`px-3 py-1.5 rounded-lg text-xs font-black ${platform.id === p.id ? 'bg-white text-black' : 'bg-white/[0.06] text-white/60'}`}>{p.label}</button>
                  ))}
                </div>
                {platform.id === 'custom' && (
                  <input value={url} onChange={e => setUrl(e.target.value)} placeholder="rtmp(s)://server/app"
                    className="w-full px-3 py-2.5 rounded-xl bg-white/[0.06] border border-white/[0.08] text-sm text-white placeholder-white/30 outline-none" />
                )}
                <input value={key} onChange={e => setKey(e.target.value)} placeholder={`${platform.label} stream key`} type="password"
                  className="w-full px-3 py-2.5 rounded-xl bg-white/[0.06] border border-white/[0.08] text-sm text-white placeholder-white/30 outline-none" />
                <div className="flex gap-2">
                  <button onClick={addOutput} disabled={!key.trim() || !url.trim()} className="flex-1 py-2.5 rounded-xl bg-white text-black text-xs font-black disabled:opacity-40">Add</button>
                  <button onClick={() => setAdding(false)} className="px-4 py-2.5 rounded-xl bg-white/[0.06] text-xs font-bold text-white/60">Cancel</button>
                </div>
              </div>
            ) : (
              <button onClick={() => setAdding(true)} className="w-full py-2.5 rounded-xl bg-white/[0.06] hover:bg-white/[0.1] text-xs font-black text-white flex items-center justify-center gap-1.5">
                <Plus className="w-3.5 h-3.5" /> Add a platform
              </button>
            )}
          </div>
        </div>
      )}
      {error && <p className="mt-3 text-xs text-red-300">{error}</p>}
    </section>
  );
}
