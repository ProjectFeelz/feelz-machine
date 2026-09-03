import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { useAuth } from '../contexts/AuthContext';
import {
    ChevronLeft, Send, Loader, Check, AlertCircle,
    Smartphone, Megaphone, Youtube, Link, Users, Upload,
    Download, Apple, Play, ExternalLink, Trash2
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

function SettingRow({ label, description, icon: Icon, iconColor, children }) {
    return (
        <div className="bg-white/[0.03] rounded-2xl border border-white/[0.06] p-5 mb-4">
            <div className="flex items-center space-x-3 mb-4">
                <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${iconColor}`}>
                    <Icon className="w-4 h-4" />
                </div>
                <div>
                    <p className="text-sm font-semibold text-white">{label}</p>
                    <p className="text-xs text-white/30">{description}</p>
                </div>
            </div>
            {children}
        </div>
    );
}

export default function AdminBroadcast({ embedded = false }) {
    const navigate = useNavigate();
    const { isAdmin, loading: authLoading } = useAuth();
    const apkFileRef = useRef(null);

    // APK direct upload
    const [apkFile, setApkFile] = useState(null);
    const [apkUploading, setApkUploading] = useState(false);
    const [apkUploadedUrl, setApkUploadedUrl] = useState('');
    const [apkUploadedFilename, setApkUploadedFilename] = useState('');
    const [apkUploadError, setApkUploadError] = useState('');
    const [apkDeleting, setApkDeleting] = useState(false);

    // Store links — Play Store and App Store only
    const [playStoreUrl, setPlayStoreUrl] = useState('');
    const [appStoreUrl, setAppStoreUrl] = useState('');
    const [linksSaving, setLinksSaving] = useState(false);
    const [linksSaved, setLinksSaved] = useState(false);
    const [linksError, setLinksError] = useState('');

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
        loadSettings();
        countRecipients();
    }, [isAdmin]);

    useEffect(() => {
        setPreview(youtubeUrl ? extractYouTubeId(youtubeUrl) : null);
    }, [youtubeUrl]);

    const loadSettings = async () => {
        const { data } = await supabase
            .from('platform_settings')
            .select('key, value')
            .in('key', ['apk_direct_url', 'apk_direct_filename', 'play_store_url', 'app_store_url']);
        (data || []).forEach(row => {
            if (row.key === 'apk_direct_url') setApkUploadedUrl(row.value || '');
            if (row.key === 'apk_direct_filename') setApkUploadedFilename(row.value || '');
            if (row.key === 'play_store_url') setPlayStoreUrl(row.value || '');
            if (row.key === 'app_store_url') setAppStoreUrl(row.value || '');
        });
    };

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
            await supabase.from('notifications').insert({
                user_id:  dmTarget.user_id,
                artist_id: dmTarget.id,
                type:     'admin_message',
                title:    dmTitle.trim(),
                message:  dmMessage.trim(),
                metadata: { from_admin: true },
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

    const handleApkFileChange = (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        if (!file.name.endsWith('.apk')) {
            setApkUploadError('Please select a valid .apk file');
            return;
        }
        setApkFile(file);
        setApkUploadError('');
    };

    const uploadApkWithRetry = async (filename, file, retries = 3) => {
        for (let attempt = 1; attempt <= retries; attempt++) {
            const { data, error } = await supabase.storage
                .from('apk-releases')
                .upload(filename, file, {
                    contentType: 'application/vnd.android.package-archive',
                    upsert: true,
                });
            if (!error) return data;
            const is503 = error?.statusCode === 503 || error?.message?.includes('503');
            if (attempt < retries && is503) {
                await new Promise(r => setTimeout(r, 1500 * attempt));
                continue;
            }
            throw Object.assign(error, { is503 });
        }
    };

    const uploadApk = async () => {
        if (!apkFile) return;
        setApkUploading(true);
        setApkUploadError('');
        try {
            const filename = `feelzmachine-${Date.now()}.apk`;
            await uploadApkWithRetry(filename, apkFile);
            const { data: urlData } = supabase.storage.from('apk-releases').getPublicUrl(filename);
            const publicUrl = urlData.publicUrl;
            setApkUploadedUrl(publicUrl);
            setApkUploadedFilename(filename);
            await supabase.from('platform_settings').upsert({ key: 'apk_direct_url', value: publicUrl, updated_at: new Date().toISOString() });
            await supabase.from('platform_settings').upsert({ key: 'apk_direct_filename', value: filename, updated_at: new Date().toISOString() });
            setApkFile(null);
            if (apkFileRef.current) apkFileRef.current.value = '';
        } catch (err) {
            setApkUploadError(err?.is503
                ? 'Upload service temporarily unavailable. Please try again.'
                : err.message);
        }
        setApkUploading(false);
    };

    const deleteApk = async () => {
        if (!window.confirm('Delete the uploaded APK? This cannot be undone.')) return;
        setApkDeleting(true);
        try {
            if (apkUploadedFilename) {
                await supabase.storage.from('apk-releases').remove([apkUploadedFilename]);
            }
            await supabase.from('platform_settings').upsert({ key: 'apk_direct_url', value: '', updated_at: new Date().toISOString() });
            await supabase.from('platform_settings').upsert({ key: 'apk_direct_filename', value: '', updated_at: new Date().toISOString() });
            setApkUploadedUrl('');
            setApkUploadedFilename('');
        } catch (err) {
            setApkUploadError('Failed to delete APK: ' + err.message);
        }
        setApkDeleting(false);
    };

    const saveLinks = async () => {
        setLinksSaving(true);
        setLinksError('');
        try {
            const upserts = [
                { key: 'play_store_url', value: playStoreUrl.trim(), updated_at: new Date().toISOString() },
                { key: 'app_store_url', value: appStoreUrl.trim(), updated_at: new Date().toISOString() },
            ];
            for (const row of upserts) {
                await supabase.from('platform_settings').upsert(row);
            }
            setLinksSaved(true);
            setTimeout(() => setLinksSaved(false), 3000);
        } catch (err) {
            setLinksError(err.message);
        }
        setLinksSaving(false);
    };

    const sendBroadcast = async () => {
        if (!title.trim() || !message.trim()) return;
        setSending(true);
        setSendError('');
        try {
            const { data: artists, error: fetchErr } = await supabase.from('artists').select('id');
            if (fetchErr) throw fetchErr;
            const youtubeData = youtubeUrl ? extractYouTubeId(youtubeUrl) : null;
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
                        link_url: linkButtonUrl.trim() || null,
                        link_label: linkButtonLabel.trim() || null,
                    },
                }));
                const { error: insertErr } = await supabase.from('notifications').insert(batch);
                if (insertErr) throw insertErr;
            }
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
                    <h1 className="text-xl font-bold text-white">Broadcast & App Settings</h1>
                    <p className="text-xs text-white/30">Upload APK · Manage store links · Send announcements</p>
                </div>
            </div>

            {/* Direct APK Upload */}
            <SettingRow
                label="Android APK — Direct Upload"
                description="Upload your .apk file to host it directly on the platform"
                icon={Smartphone}
                iconColor="bg-green-500/15 text-green-400">
                {apkUploadError && (
                    <div className="flex items-center space-x-2 mb-3 p-2.5 bg-red-500/10 rounded-lg">
                        <AlertCircle className="w-3.5 h-3.5 text-red-400 flex-shrink-0" />
                        <p className="text-xs text-red-400">{apkUploadError}</p>
                    </div>
                )}
                <div className="space-y-3">
                    {!apkUploadedUrl ? (
                        <>
                            <div
                                onClick={() => apkFileRef.current?.click()}
                                className="w-full border-2 border-dashed border-white/[0.08] rounded-xl p-6 flex flex-col items-center justify-center cursor-pointer hover:border-white/[0.15] transition">
                                <Upload className="w-6 h-6 text-white/20 mb-2" />
                                <p className="text-sm text-white/40">{apkFile ? apkFile.name : 'Click to select .apk file'}</p>
                                {apkFile && <p className="text-xs text-white/20 mt-1">{(apkFile.size / 1024 / 1024).toFixed(1)} MB</p>}
                            </div>
                            <input ref={apkFileRef} type="file" accept=".apk" onChange={handleApkFileChange} className="hidden" />
                            {apkFile && (
                                <button onClick={uploadApk} disabled={apkUploading}
                                    className="w-full flex items-center justify-center space-x-2 py-2.5 bg-green-500 text-black rounded-xl font-semibold text-sm disabled:opacity-50 transition">
                                    {apkUploading ? <Loader className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                                    <span>{apkUploading ? 'Uploading...' : 'Upload APK'}</span>
                                </button>
                            )}
                        </>
                    ) : (
                        <div className="flex items-center justify-between p-3 bg-green-500/10 rounded-xl border border-green-500/20">
                            <div className="flex items-center space-x-2 flex-1 min-w-0">
                                <Check className="w-4 h-4 text-green-400 flex-shrink-0" />
                                <p className="text-xs text-green-400 truncate">APK hosted — direct download active</p>
                            </div>
                            <div className="flex items-center space-x-2 ml-3 flex-shrink-0">
                                <a href={apkUploadedUrl} download
                                    className="flex items-center space-x-1.5 px-3 py-1.5 bg-green-500 text-black rounded-lg text-xs font-semibold">
                                    <Download className="w-3 h-3" />
                                    <span>Test</span>
                                </a>
                                <button onClick={deleteApk} disabled={apkDeleting}
                                    className="flex items-center space-x-1.5 px-3 py-1.5 bg-red-500/20 text-red-400 rounded-lg text-xs font-semibold hover:bg-red-500/30 transition disabled:opacity-50">
                                    {apkDeleting ? <Loader className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
                                    <span>Delete</span>
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </SettingRow>

            {/* Store Links — Play Store and App Store only */}
            <SettingRow
                label="App Store Links"
                description="Google Play and iOS App Store links — shown in sidebar and About page"
                icon={Link}
                iconColor="bg-blue-500/15 text-blue-400">
                {linksError && (
                    <div className="flex items-center space-x-2 mb-3 p-2.5 bg-red-500/10 rounded-lg">
                        <AlertCircle className="w-3.5 h-3.5 text-red-400 flex-shrink-0" />
                        <p className="text-xs text-red-400">{linksError}</p>
                    </div>
                )}
                <div className="space-y-3">
                    {[
                        { icon: Play, label: 'Google Play Store', value: playStoreUrl, onChange: setPlayStoreUrl, placeholder: 'https://play.google.com/store/apps/...' },
                        { icon: Apple, label: 'iOS App Store', value: appStoreUrl, onChange: setAppStoreUrl, placeholder: 'https://apps.apple.com/app/...' },
                    ].map(({ icon: Icon, label, value, onChange, placeholder }) => (
                        <div key={label}>
                            <p className="text-[11px] text-white/30 mb-1.5 flex items-center space-x-1.5">
                                <Icon className="w-3 h-3" /><span>{label}</span>
                            </p>
                            <input type="url" value={value} onChange={e => onChange(e.target.value)}
                                placeholder={placeholder}
                                className="w-full px-3 py-2.5 bg-white/[0.04] rounded-lg text-sm text-white placeholder-white/20 outline-none border border-white/[0.06] focus:border-white/[0.15] transition" />
                        </div>
                    ))}
                    <button onClick={saveLinks} disabled={linksSaving}
                        className="w-full flex items-center justify-center space-x-2 py-2.5 bg-white text-black rounded-xl font-semibold text-sm disabled:opacity-50 transition">
                        {linksSaving ? <Loader className="w-4 h-4 animate-spin" /> : linksSaved ? <Check className="w-4 h-4 text-green-600" /> : null}
                        <span>{linksSaved ? 'Saved!' : 'Save Links'}</span>
                    </button>
                </div>
            </SettingRow>

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