import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { useAuth } from '../contexts/AuthContext';
import {
  ChevronLeft, Send, Loader, Check, AlertCircle,
  Smartphone, Megaphone, Youtube, Link, Users
} from 'lucide-react';

const YOUTUBE_SHORT_REGEX = /(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/shorts\/|youtu\.be\/)([a-zA-Z0-9_-]{11})/;
const YOUTUBE_REGEX = /(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/;

function extractYouTubeId(url) {
  const short = url.match(YOUTUBE_SHORT_REGEX);
  if (short) return { id: short[1], isShort: true };
  const reg = url.match(YOUTUBE_REGEX);
  if (reg) return { id: reg[1], isShort: false };
  return null;
}

export default function AdminBroadcast() {
  const navigate = useNavigate();
  const { isAdmin } = useAuth();

  // APK settings
  const [apkUrl, setApkUrl] = useState('');
  const [apkSaving, setApkSaving] = useState(false);
  const [apkSaved, setApkSaved] = useState(false);
  const [apkError, setApkError] = useState('');

  // Broadcast
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [youtubeUrl, setYoutubeUrl] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [sendError, setSendError] = useState('');
  const [recipientCount, setRecipientCount] = useState(0);
  const [preview, setPreview] = useState(null);

  useEffect(() => {
    if (!isAdmin) { navigate('/hub'); return; }
    loadSettings();
    countRecipients();
  }, [isAdmin]);

  useEffect(() => {
    if (youtubeUrl) {
      const result = extractYouTubeId(youtubeUrl);
      setPreview(result);
    } else {
      setPreview(null);
    }
  }, [youtubeUrl]);

  const loadSettings = async () => {
    const { data } = await supabase
      .from('platform_settings')
      .select('value')
      .eq('key', 'apk_url')
      .maybeSingle();
    if (data?.value) setApkUrl(data.value);
  };

  const countRecipients = async () => {
    const { count } = await supabase
      .from('artists')
      .select('*', { count: 'exact', head: true });
    setRecipientCount(count || 0);
  };

  const saveApkUrl = async () => {
    setApkSaving(true);
    setApkError('');
    try {
      const { error } = await supabase
        .from('platform_settings')
        .upsert({ key: 'apk_url', value: apkUrl.trim(), updated_at: new Date().toISOString() });
      if (error) throw error;
      setApkSaved(true);
      setTimeout(() => setApkSaved(false), 3000);
    } catch (err) {
      setApkError(err.message);
    }
    setApkSaving(false);
  };

  const sendBroadcast = async () => {
    if (!title.trim() || !message.trim()) return;
    setSending(true);
    setSendError('');
    try {
      // Fetch all artist IDs
      const { data: artists, error: fetchErr } = await supabase
        .from('artists')
        .select('id');
      if (fetchErr) throw fetchErr;

      const youtubeData = youtubeUrl ? extractYouTubeId(youtubeUrl) : null;

      // Insert notifications in batches of 100
      const batchSize = 100;
      for (let i = 0; i < artists.length; i += batchSize) {
        const batch = artists.slice(i, i + batchSize).map(a => ({
          artist_id: a.id,
          type: 'announcement',
          title: title.trim(),
          message: message.trim(),
          metadata: {
            youtube_id: youtubeData?.id || null,
            is_short: youtubeData?.isShort || false,
            youtube_url: youtubeUrl || null,
          },
        }));
        const { error: insertErr } = await supabase.from('notifications').insert(batch);
        if (insertErr) throw insertErr;
      }

      setSent(true);
      setTitle('');
      setMessage('');
      setYoutubeUrl('');
      setPreview(null);
      setTimeout(() => setSent(false), 4000);
    } catch (err) {
      setSendError(err.message);
    }
    setSending(false);
  };

  return (
    <div className="pt-10 pb-8 px-5 max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex items-center space-x-3 mb-8">
        <button onClick={() => navigate('/hub')}
          className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-white/[0.06] transition">
          <ChevronLeft className="w-4 h-4 text-white/40" />
        </button>
        <div>
          <h1 className="text-xl font-bold text-white">Broadcast & Settings</h1>
          <p className="text-xs text-white/30">Send updates to all users · Manage platform settings</p>
        </div>
      </div>

      {/* APK URL */}
      <div className="bg-white/[0.03] rounded-2xl border border-white/[0.06] p-5 mb-5">
        <div className="flex items-center space-x-3 mb-4">
          <div className="w-9 h-9 rounded-lg bg-green-500/15 flex items-center justify-center">
            <Smartphone className="w-4 h-4 text-green-400" />
          </div>
          <div>
            <p className="text-sm font-semibold text-white">Android APK Link</p>
            <p className="text-xs text-white/30">Update whenever you release a new version</p>
          </div>
        </div>

        {apkError && (
          <div className="flex items-center space-x-2 mb-3 p-2.5 bg-red-500/10 rounded-lg border border-red-500/20">
            <AlertCircle className="w-3.5 h-3.5 text-red-400 flex-shrink-0" />
            <p className="text-xs text-red-400">{apkError}</p>
          </div>
        )}

        <div className="flex space-x-2">
          <div className="flex-1 flex items-center space-x-2 bg-white/[0.04] rounded-lg px-3 border border-white/[0.06] focus-within:border-white/[0.15] transition">
            <Link className="w-3.5 h-3.5 text-white/20 flex-shrink-0" />
            <input
              type="url"
              value={apkUrl}
              onChange={e => setApkUrl(e.target.value)}
              placeholder="https://your-storage.com/feelzmachine.apk"
              className="flex-1 bg-transparent py-2.5 text-sm text-white placeholder-white/20 outline-none"
            />
          </div>
          <button
            onClick={saveApkUrl}
            disabled={apkSaving || !apkUrl.trim()}
            className="flex items-center space-x-2 px-4 py-2.5 bg-white text-black rounded-lg text-sm font-semibold disabled:opacity-30 transition hover:bg-white/90">
            {apkSaving ? <Loader className="w-3.5 h-3.5 animate-spin" /> : apkSaved ? <Check className="w-3.5 h-3.5 text-green-600" /> : null}
            <span>{apkSaved ? 'Saved!' : 'Save'}</span>
          </button>
        </div>

        {apkUrl && (
          <a href={apkUrl} target="_blank" rel="noreferrer"
            className="inline-flex items-center space-x-1.5 mt-2 text-xs text-white/25 hover:text-white/50 transition">
            <span>Test link →</span>
          </a>
        )}
      </div>

      {/* Broadcast */}
      <div className="bg-white/[0.03] rounded-2xl border border-white/[0.06] p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center space-x-3">
            <div className="w-9 h-9 rounded-lg bg-purple-500/15 flex items-center justify-center">
              <Megaphone className="w-4 h-4 text-purple-400" />
            </div>
            <div>
              <p className="text-sm font-semibold text-white">Broadcast Message</p>
              <p className="text-xs text-white/30">Sends to all artists as a notification</p>
            </div>
          </div>
          <div className="flex items-center space-x-1.5 px-2.5 py-1 bg-white/[0.04] rounded-lg">
            <Users className="w-3 h-3 text-white/30" />
            <span className="text-xs text-white/40">{recipientCount} artists</span>
          </div>
        </div>

        {sendError && (
          <div className="flex items-center space-x-2 mb-3 p-2.5 bg-red-500/10 rounded-lg border border-red-500/20">
            <AlertCircle className="w-3.5 h-3.5 text-red-400 flex-shrink-0" />
            <p className="text-xs text-red-400">{sendError}</p>
          </div>
        )}

        {sent && (
          <div className="flex items-center space-x-2 mb-3 p-2.5 bg-green-500/10 rounded-lg border border-green-500/20">
            <Check className="w-3.5 h-3.5 text-green-400 flex-shrink-0" />
            <p className="text-xs text-green-400">Broadcast sent to {recipientCount} artists!</p>
          </div>
        )}

        <div className="space-y-3">
          {/* Title */}
          <div>
            <label className="block text-xs text-white/30 mb-1.5">Title</label>
            <input
              type="text"
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="e.g. New feature update, App v1.2 released..."
              maxLength={80}
              className="w-full bg-white/[0.04] border border-white/[0.06] rounded-lg px-4 py-2.5 text-sm text-white placeholder-white/20 outline-none focus:border-white/[0.15] transition"
            />
          </div>

          {/* Message */}
          <div>
            <label className="block text-xs text-white/30 mb-1.5">Message</label>
            <textarea
              value={message}
              onChange={e => setMessage(e.target.value)}
              placeholder="Write your update, how-to, or announcement here..."
              rows={4}
              maxLength={600}
              className="w-full bg-white/[0.04] border border-white/[0.06] rounded-lg px-4 py-2.5 text-sm text-white placeholder-white/20 outline-none focus:border-white/[0.15] transition resize-none"
            />
            <p className="text-right text-[10px] text-white/20 mt-1">{message.length}/600</p>
          </div>

          {/* YouTube URL */}
          <div>
            <label className="block text-xs text-white/30 mb-1.5">
              YouTube / Shorts link <span className="text-white/20">(optional)</span>
            </label>
            <div className="flex items-center space-x-2 bg-white/[0.04] rounded-lg px-3 border border-white/[0.06] focus-within:border-white/[0.15] transition">
              <Youtube className="w-3.5 h-3.5 text-red-400/60 flex-shrink-0" />
              <input
                type="url"
                value={youtubeUrl}
                onChange={e => setYoutubeUrl(e.target.value)}
                placeholder="https://youtube.com/shorts/..."
                className="flex-1 bg-transparent py-2.5 text-sm text-white placeholder-white/20 outline-none"
              />
            </div>
          </div>

          {/* YouTube preview */}
          {preview && (
            <div className="rounded-xl overflow-hidden bg-black" style={{ aspectRatio: preview.isShort ? '9/16' : '16/9', maxHeight: preview.isShort ? 400 : 'auto' }}>
              <iframe
                src={`https://www.youtube.com/embed/${preview.id}`}
                className="w-full h-full"
                allowFullScreen
                title="Preview"
              />
            </div>
          )}

          <button
            onClick={sendBroadcast}
            disabled={sending || !title.trim() || !message.trim()}
            className="w-full flex items-center justify-center space-x-2 py-3 bg-white text-black rounded-xl text-sm font-semibold disabled:opacity-30 transition hover:bg-white/90 active:scale-[0.98]">
            {sending ? <Loader className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            <span>{sending ? `Sending to ${recipientCount} artists...` : `Send to All Artists`}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
