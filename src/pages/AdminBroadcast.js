import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { sendAdminBroadcast, sendNotification } from '../utils/notify';
import { useAuth } from '../contexts/AuthContext';
import {
    ChevronLeft, Send, Loader, Check, AlertCircle,
    Megaphone, Youtube, Link, Users, ExternalLink
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

export default function AdminBroadcast({ embedded = false }) {
    const navigate = useNavigate();
    const { isAdmin, loading: authLoading } = useAuth();
    // The APK upload and the two store link fields were here. Feelz Machine is
    // a PWA and is staying one: there is no Android build to host and no store
    // listing to link to, so the whole apk-releases path is gone from the app.
    // The bucket and the platform_settings keys are left where they are rather
    // than dropped, so nothing here depends on a migration being run first.

    // Broadcast
    const [title, setTitle] = useState('');
    const [message, setMessage] = useState('');
    const [youtubeUrl, setYoutubeUrl] = useState('');
    const [linkButtonUrl, setLinkButtonUrl] = useState('');
    const [linkButtonLabel, setLinkButtonLabel] = useState('');
    const [sending, setSending] = useState(false);
    const [sent, setSent] = useState(false);
    const [sendError, setSendError] = useState('');
    const [recipientCount, setRecipientCount] = useState(0);
    const [preview, setPreview] = useState(null);

    // Direct message to artist
    const [dmSearch, setDmSearch]       = useState('');
    const [dmResults, setDmResults]     = useState([]);
    const [dmSearching, setDmSearching] = useState(false);
    const [dmTarget, setDmTarget]       = useState(null);
    const [dmTitle, setDmTitle]         = useState('');
    const [dmMessage, setDmMessage]     = useState('');
    const [dmSending, setDmSending]     = useState(false);
    const [dmSent, setDmSent]           = useState(false);
    const [dmError, setDmError]         = useState('');

    useEffect(() => {
        if (!authLoading && !isAdmin && !embedded) { navigate('/hub'); return; }
        countRecipients();
    }, [isAdmin]);

    useEffect(() => {
        setPreview(youtubeUrl ? extractYouTubeId(youtubeUrl) : null);
    }, [youtubeUrl]);

    const searchArtists = async (q) => {
        setDmSearch(q);
        if (q.length < 2) { setDmResults([]); return; }
        setDmSearching(true);
        const { data } = await supabase.from('artists')
            .select('id, user_id, artist_name, profile_image_url')
            .ilike('artist_name', `%${q}%`).limit(8);
        setDmResults(data || []);
        setDmSearching(false);
    };

    const sendDM = async () => {
        if (!dmTarget || !dmTitle.trim() || !dmMessage.trim() || dmSending) return;
        setDmSending(true);
        setDmError('');
        try {
            // Migration 106 — admin-only type, admin verified server-side.
            await sendNotification(supabase, 'admin DM (broadcast)', {
                type:            'admin_message',
                recipientUserId: dmTarget.user_id,
                artistId:        dmTarget.id,
                title:           dmTitle.trim(),
                message:         dmMessage.trim(),
                metadata:        { from_admin: true },
            });
            setDmSent(true);
            setTimeout(() => {
                setDmSent(false); setDmTarget(null); setDmTitle('');
                setDmMessage(''); setDmSearch(''); setDmResults('');
            }, 2000);
        } catch (err) {
            setDmError(err.message);
        }
        setDmSending(false);
    };

    const countRecipients = async () => {
        const { count } = await supabase.from('artists').select('*', { count: 'exact', head: true });
        setRecipientCount(count || 0);
    };

    const sendBroadcast = async () => {
        if (!title.trim() || !message.trim()) return;
        setSending(true);
        setSendError('');
        try {
            const { data: artists, error: fetchErr } = await supabase.from('artists').select('id');
            if (fetchErr) throw fetchErr;
            const youtubeData = youtubeUrl ? extractYouTubeId(youtubeUrl) : null;
            // One call. This used to build 100-row batches and insert them
            // directly, which the notifications INSERT policy refuses — the
            // rows are addressed to every artist on the platform. So no
            // announcement has ever been delivered. send_admin_broadcast
            // (migration 108) checks the admins table and writes them all in
            // a single statement.
            const { sent, error: bcErr } = await sendAdminBroadcast(supabase, 'platform announcement', {
                type:    'announcement',
                title:   title.trim(),
                message: message.trim(),
                metadata: {
                    youtube_id:  youtubeData?.id || null,
                    is_short:    youtubeData?.isShort || false,
                    youtube_url: youtubeUrl || null,
                    link_url:    linkButtonUrl.trim() || null,
                    link_label:  linkButtonLabel.trim() || null,
                },
            });
            if (bcErr) throw bcErr;
            if (!sent) throw new Error('The announcement reached nobody — check you are signed in as an admin.');
            setSent(true);
            setTitle(''); setMessage(''); setYoutubeUrl(''); setPreview(null);
            setLinkButtonUrl(''); setLinkButtonLabel('');
            setTimeout(() => setSent(false), 4000);
        } catch (err) {
            setSendError(err.message);
        }
        setSending(false);
    };

    return (
        <div className="pt-4 pb-8 px-4 md:px-0">
            <div className="flex items-center space-x-3 mb-8">
                <button onClick={() => navigate('/hub')}
                    className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-white/[0.06] transition">
                    <ChevronLeft className="w-4 h-4 text-white/40" />
                </button>
                <div>
                    <h1 className="text-xl font-bold text-white">Broadcast</h1>
                    <p className="text-xs text-white/30">Announcements to every artist, or a message to one.</p>
                </div>
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
                    <input type="text" value={title} onChange={e => setTitle(e.target.value)}
                        placeholder="Title"
                        className="w-full px-3 py-2.5 bg-white/[0.04] rounded-lg text-sm text-white placeholder-white/20 outline-none border border-white/[0.06] focus:border-white/[0.15] transition" />
                    <textarea value={message} onChange={e => setMessage(e.target.value)}
                        placeholder="Your message to all artists..."
                        rows={4}
                        className="w-full px-3 py-2.5 bg-white/[0.04] rounded-lg text-sm text-white placeholder-white/20 outline-none border border-white/[0.06] focus:border-white/[0.15] transition resize-none" />
                    <div className="flex items-center space-x-2 bg-white/[0.04] rounded-lg px-3 border border-white/[0.06] focus-within:border-white/[0.15] transition">
                        <Youtube className="w-3.5 h-3.5 text-red-400 flex-shrink-0" />
                        <input type="url" value={youtubeUrl} onChange={e => setYoutubeUrl(e.target.value)}
                            placeholder="YouTube link (optional)"
                            className="flex-1 bg-transparent py-2.5 text-sm text-white placeholder-white/20 outline-none" />
                    </div>

                    {/* Link Button */}
                    <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3 space-y-2">
                        <p className="text-[11px] text-white/30 flex items-center space-x-1.5">
                            <ExternalLink className="w-3 h-3" />
                            <span>Link Button (optional)</span>
                        </p>
                        <input type="text" value={linkButtonLabel} onChange={e => setLinkButtonLabel(e.target.value)}
                            placeholder="Button label (e.g. Learn More)"
                            className="w-full px-3 py-2 bg-white/[0.04] rounded-lg text-sm text-white placeholder-white/20 outline-none border border-white/[0.06] focus:border-white/[0.15] transition" />
                        <div className="flex items-center space-x-2 bg-white/[0.04] rounded-lg px-3 border border-white/[0.06] focus-within:border-white/[0.15] transition">
                            <Link className="w-3.5 h-3.5 text-blue-400 flex-shrink-0" />
                            <input type="url" value={linkButtonUrl} onChange={e => setLinkButtonUrl(e.target.value)}
                                placeholder="https://..."
                                className="flex-1 bg-transparent py-2.5 text-sm text-white placeholder-white/20 outline-none" />
                        </div>
                        {linkButtonUrl && linkButtonLabel && (
                            <div className="flex items-center space-x-2 p-2 bg-blue-500/10 rounded-lg border border-blue-500/20">
                                <ExternalLink className="w-3 h-3 text-blue-400 flex-shrink-0" />
                                <p className="text-xs text-blue-400">
                                    Preview: "{linkButtonLabel}" → {linkButtonUrl.length > 40 ? linkButtonUrl.substring(0, 40) + '…' : linkButtonUrl}
                                </p>
                            </div>
                        )}
                    </div>

                    {preview && (
                        <div className="rounded-xl overflow-hidden aspect-video bg-black">
                            <iframe src={`https://www.youtube.com/embed/${preview.id}`}
                                className="w-full h-full" allowFullScreen title="preview" />
                        </div>
                    )}

                    <button onClick={sendBroadcast} disabled={sending || !title.trim() || !message.trim()}
                        className="w-full flex items-center justify-center space-x-2 py-3 bg-white text-black rounded-xl font-semibold text-sm disabled:opacity-40 transition">
                        {sending ? <Loader className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                        <span>{sending ? 'Sending...' : `Send to ${recipientCount} Artists`}</span>
                    </button>
                </div>
            </div>
        </div>
    );
}