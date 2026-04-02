import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { useAuth } from '../contexts/AuthContext';
import { usePlayer } from '../contexts/PlayerContext';
import { downloadTrack } from '../utils/downloadTrack';
import {
    X, Share2, ListMusic, Download, Heart, Play, Music, Loader, Check,
    ChevronLeft, ShoppingCart, Lock, PlusCircle, DollarSign, Clock,
} from 'lucide-react';
import ShareCard from './ShareCard';
import {
    X, Share2, ListMusic, Download, Heart, Play, Music, Loader, Check,
    ChevronLeft, ShoppingCart, Lock, PlusCircle, DollarSign, Clock,
} from 'lucide-react';
import ShareCard from './ShareCard';

const PAYPAL_CLIENT_ID = process.env.REACT_APP_PAYPAL_CLIENT_ID;

function formatReleaseDate(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function TrackActionSheet({ track, artist, onClose }) {
    const navigate = useNavigate();
    const { user } = useAuth();
    const { addToQueue, playTrack } = usePlayer();
    const [view, setView] = useState('main');
    const [playlists, setPlaylists] = useState([]);
    const [addingTo, setAddingTo] = useState(null);
    const [addedTo, setAddedTo] = useState({});
    const [shared, setShared] = useState(false);
    const [showShareCard, setShowShareCard] = useState(false);
    const [showShareCard, setShowShareCard] = useState(false);
    const [downloading, setDownloading] = useState(false);
    const [liked, setLiked] = useState(false);
    const [downloadError, setDownloadError] = useState(null);
    const [newPlaylistName, setNewPlaylistName] = useState('');
    const [creatingPlaylist, setCreatingPlaylist] = useState(false);
    const [showNewPlaylist, setShowNewPlaylist] = useState(false);

    // Purchase state
    const [paypalReady, setPaypalReady] = useState(false);
    const [purchasing, setPurchasing] = useState(false);
    const [purchaseSuccess, setPurchaseSuccess] = useState(false);
    const [purchaseError, setPurchaseError] = useState('');

    // Pay What You Want state
    const isPWYW = track?.pay_what_you_want === true;
    const minimumPrice = track?.minimum_price != null ? parseFloat(track.minimum_price) : 0;

    // Effective download price: track's own price, or album price if joined
    const basePrice = track?.download_price > 0
        ? track.download_price
        : (track?.albums?.price || track?.album_price || 0);

    // For PWYW: fan-entered amount (initialised to base price or minimum)
    const [fanPrice, setFanPrice] = useState('');
    const [fanPriceError, setFanPriceError] = useState('');

    // The actual amount we'll charge
    const effectivePrice = isPWYW ? (parseFloat(fanPrice) || 0) : basePrice;

    // Pre-order state
    const isPreorder = track?.is_preorder === true;
    const releaseDate = track?.release_date || null;
    const isNotYetReleased = isPreorder && releaseDate && new Date(releaseDate) > new Date();
    const [alreadyPreordered, setAlreadyPreordered] = useState(false);

    useEffect(() => {
        if (!track) return;
        if (user) {
            checkLike();
            if (isPreorder) checkAlreadyPreordered();
        }
        if (isPWYW) {
            const suggested = Math.max(basePrice, minimumPrice);
            setFanPrice(suggested > 0 ? suggested.toFixed(2) : '');
        }
    }, [track?.id]);

    // Load PayPal when purchase view opens
    useEffect(() => {
        if (view !== 'purchase' || !track) return;
        // Don't load PayPal at all for free non-PWYW tracks
        if (!isPWYW && effectivePrice <= 0) return;
        setPaypalReady(false);
        setPurchaseError('');
        const existing = document.getElementById('paypal-sdk-tas');
        if (existing) existing.remove();
        const script = document.createElement('script');
        script.id = 'paypal-sdk-tas';
        script.src = `https://www.paypal.com/sdk/js?client-id=${PAYPAL_CLIENT_ID}&currency=USD`;
        script.async = true;
        script.onload = () => setPaypalReady(true);
        script.onerror = () => setPurchaseError('Failed to load PayPal. Please try again.');
        document.head.appendChild(script);
    }, [view, track?.id]);

    // Render PayPal button once SDK is ready
    useEffect(() => {
        if (!paypalReady || view !== 'purchase' || !window.paypal || !track) return;
        if (isPWYW && !validateFanPrice()) return;
        // Never render PayPal for $0
        if (effectivePrice <= 0) return;
        const container = document.getElementById('paypal-tas-container');
        if (!container) return;
        container.innerHTML = '';

        window.paypal.Buttons({
            style: { layout: 'vertical', color: 'gold', shape: 'rect', label: 'pay' },
            createOrder: async () => {
                setPurchasing(true);
                setPurchaseError('');
                try {
                    const res = await fetch('/.netlify/functions/paypal-order', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            action: 'create',
                            trackId: track.id,
                            amount: effectivePrice,
                            trackTitle: track.title,
                            artistName: artist?.artist_name,
                        }),
                    });
                    const { orderId, error } = await res.json();
                    if (error || !orderId) throw new Error(error || 'Failed to create order');
                    return orderId;
                } catch (err) {
                    setPurchaseError(err.message);
                    setPurchasing(false);
                    throw err;
                }
            },
            onApprove: async (data) => {
                try {
                    const res = await fetch('/.netlify/functions/paypal-order', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ action: 'capture', orderId: data.orderID }),
                    });
                    const captureData = await res.json();
                    if (!captureData.success) throw new Error('Payment capture failed');

                    // Record purchase in downloads table
                    await supabase
                        .from('downloads')
                        .insert({ user_id: user.id, track_id: track.id, amount_paid: effectivePrice })
                        .catch(() => {});

                    // Fire split payout
                    await fetch('/.netlify/functions/process-split-payout', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            track_id: track.id,
                            transaction_id: captureData.captureId,
                            total_amount: effectivePrice,
                            buyer_user_id: user.id,
                        }),
                    }).catch(() => {});

                    setPurchaseSuccess(true);
                    setPurchasing(false);

                    if (isPreorder && isNotYetReleased) {
                        setAlreadyPreordered(true);
                        setTimeout(() => { onClose(); }, 2500);
                        return;
                    }

                    setTimeout(async () => {
                        try {
                            const { data: { session } } = await supabase.auth.getSession();
                            await downloadTrack(track.id, track.title, session?.access_token);
                        } catch {}
                        onClose();
                    }, 1500);
                } catch (err) {
                    setPurchaseError(err.message);
                    setPurchasing(false);
                }
            },
            onError: () => {
                setPurchaseError('Payment failed. Please try again.');
                setPurchasing(false);
            },
            onCancel: () => setPurchasing(false),
        }).render('#paypal-tas-container');
    }, [paypalReady, view, track?.id, effectivePrice]);

    const checkAlreadyPreordered = async () => {
        const { data } = await supabase
            .from('downloads')
            .select('id')
            .eq('track_id', track.id)
            .eq('user_id', user.id)
            .maybeSingle();
        setAlreadyPreordered(!!data);
    };

    const validateFanPrice = () => {
        const val = parseFloat(fanPrice);
        if (isNaN(val) || val < 0) { setFanPriceError('Please enter a valid amount'); return false; }
        if (minimumPrice > 0 && val < minimumPrice) { setFanPriceError(`Minimum is $${minimumPrice.toFixed(2)}`); return false; }
        setFanPriceError('');
        return true;
    };

    const checkLike = async () => {
        const { data } = await supabase
            .from('track_likes').select('id')
            .eq('track_id', track.id).eq('user_id', user.id).maybeSingle();
        setLiked(!!data);
    };

    const loadPlaylists = async () => {
        if (!user) { navigate('/login'); onClose(); return; }
        const { data } = await supabase
            .from('playlists').select('id, name')
            .eq('user_id', user.id).order('name');
        setPlaylists(data || []);
        setView('playlists');
    };

    const handleCreatePlaylist = async () => {
        const name = newPlaylistName.trim();
        if (!name || creatingPlaylist) return;
        setCreatingPlaylist(true);
        const { data, error } = await supabase
            .from('playlists')
            .insert({ name, user_id: user.id })
            .select('id, name')
            .single();
        if (!error && data) {
            await handleAddToPlaylist(data.id);
            setPlaylists(prev => [...prev, data]);
        }
        setNewPlaylistName('');
        setShowNewPlaylist(false);
        setCreatingPlaylist(false);
    };

    const handleAddToPlaylist = async (playlistId) => {
        setAddingTo(playlistId);
        const { data: existing } = await supabase
            .from('playlist_tracks').select('id')
            .eq('playlist_id', playlistId).eq('track_id', track.id).maybeSingle();
        if (!existing) {
            const { data: last } = await supabase
                .from('playlist_tracks').select('position')
                .eq('playlist_id', playlistId).order('position', { ascending: false })
                .limit(1).maybeSingle();
            await supabase.from('playlist_tracks').insert({
                playlist_id: playlistId, track_id: track.id,
                position: (last?.position ?? -1) + 1,
            });
        }
        setAddedTo(prev => ({ ...prev, [playlistId]: true }));
        setAddingTo(null);
    };

    const handleShare = () => {
      setShowShareCard(true);
    };

    const handleQueue = () => {
        addToQueue({ ...track, artist_name: artist?.artist_name || track.artist_name });
        onClose();
    };

    const handleLike = async () => {
        if (!user) { navigate('/login'); onClose(); return; }
        if (liked) {
            await supabase.from('track_likes').delete().eq('track_id', track.id).eq('user_id', user.id);
            setLiked(false);
        } else {
            await supabase.from('track_likes').insert({ track_id: track.id, user_id: user.id });
            setLiked(true);
        }
    };

    const handleDownload = async () => {
        if (!user) { navigate('/login'); onClose(); return; }
        setDownloadError(null);
        setDownloading(true);
        try {
            const { data: { session } } = await supabase.auth.getSession();
            const authToken = session?.access_token;
            if (!authToken) throw new Error('Not authenticated');
            await downloadTrack(track.id, track.title, authToken);
            onClose();
        } catch (err) {
            if (err.message === 'purchase_required') {
                setDownloading(false);
                setView('purchase');
                return;
            }
            if (err.message === 'not_released_yet') {
                setDownloading(false);
                setDownloadError(`This track releases on ${formatReleaseDate(releaseDate)}. Check back then!`);
                return;
            }
            setDownloadError('Download failed. Please try again.');
        } finally {
            setDownloading(false);
        }
    };

    if (!track) return null;

    const downloadButtonLabel = () => {
        if (downloading) return 'Downloading...';
        if (isPreorder && isNotYetReleased) {
            if (alreadyPreordered) return `Pre-ordered · Releases ${formatReleaseDate(releaseDate)}`;
            return `Pre-order · ${isPWYW ? 'Pay What You Want' : basePrice > 0 ? `$${basePrice.toFixed(2)}` : 'Free'}`;
        }
        if (isPWYW) return 'Buy & Download · Pay What You Want';
        if (basePrice > 0) return `Buy & Download · $${basePrice.toFixed(2)}`;
        return 'Download';
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-end justify-center" onClick={onClose}>
            <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
            <div
                className="relative w-full max-w-lg rounded-t-2xl overflow-hidden animate-slide-up"
                style={{ backgroundColor: '#111', border: '1px solid rgba(255,255,255,0.08)', borderBottom: 'none' }}
                onClick={(e) => e.stopPropagation()}
            >
                {/* Track info header */}
                <div className="flex items-center space-x-3 p-4 border-b border-white/[0.06]">
                    <div className="w-12 h-12 rounded-lg overflow-hidden bg-white/[0.06] flex-shrink-0">
                        {track.cover_artwork_url
                            ? <img src={track.cover_artwork_url} alt="" className="w-full h-full object-cover" />
                            : <div className="w-full h-full flex items-center justify-center"><Music className="w-5 h-5 text-white/20" /></div>}
                    </div>
                    <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                            <p className="text-sm font-semibold text-white truncate">{track.title}</p>
                            {isPreorder && isNotYetReleased && (
                                <span className="flex-shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-yellow-400/20 text-yellow-300 border border-yellow-400/30 uppercase tracking-wide">
                                    Pre-order
                                </span>
                            )}
                        </div>
                        <button
                            onClick={() => { const slug = artist?.slug || track.artist_slug; if (slug) { navigate(`/artist/${slug}`); onClose(); } }}
                            className="text-xs text-white/40 truncate hover:text-white/70 transition text-left w-full block"
                        >
                            {artist?.artist_name || track.artist_name}
                        </button>
                    </div>
                    <button
                        onClick={view !== 'main' ? () => { setView('main'); setPurchaseError(''); } : onClose}
                        className="w-8 h-8 flex items-center justify-center rounded-full bg-white/[0.06]"
                    >
                        {view !== 'main' ? <ChevronLeft className="w-4 h-4 text-white/50" /> : <X className="w-4 h-4 text-white/50" />}
                    </button>
                </div>

                {/* Views */}
                <div className="py-2">

                    {/* Playlists view */}
                    {view === 'playlists' && (
                        <div>
                            {showNewPlaylist ? (
                                <div className="flex items-center space-x-2 px-4 py-2.5 border-b border-white/[0.05]">
                                    <input
                                        autoFocus type="text" value={newPlaylistName}
                                        onChange={e => setNewPlaylistName(e.target.value)}
                                        onKeyDown={e => { if (e.key === 'Enter') handleCreatePlaylist(); if (e.key === 'Escape') { setShowNewPlaylist(false); setNewPlaylistName(''); } }}
                                        placeholder="Playlist name"
                                        className="flex-1 bg-white/[0.06] text-white text-sm rounded-lg px-3 py-2 outline-none placeholder:text-white/25 border border-white/[0.08] focus:border-white/20"
                                        maxLength={60}
                                    />
                                    <button onClick={handleCreatePlaylist} disabled={!newPlaylistName.trim() || creatingPlaylist}
                                        className="px-3 py-2 rounded-lg text-xs font-semibold text-black bg-white disabled:opacity-40 transition active:scale-95 flex-shrink-0">
                                        {creatingPlaylist ? <Loader className="w-3.5 h-3.5 animate-spin" /> : 'Create'}
                                    </button>
                                    <button onClick={() => { setShowNewPlaylist(false); setNewPlaylistName(''); }} className="p-2 text-white/30 hover:text-white/60 transition flex-shrink-0">
                                        <X className="w-3.5 h-3.5" />
                                    </button>
                                </div>
                            ) : (
                                <button onClick={() => setShowNewPlaylist(true)} className="w-full flex items-center space-x-3 px-5 py-3 text-left hover:bg-white/[0.04] transition border-b border-white/[0.05]">
                                    <PlusCircle className="w-4 h-4 text-white/40" />
                                    <span className="text-sm text-white/60">New playlist</span>
                                </button>
                            )}
                            {playlists.length === 0 && !showNewPlaylist && (
                                <p className="text-xs text-white/30 px-5 py-3">No playlists yet — create one above</p>
                            )}
                            {playlists.map(pl => (
                                <button key={pl.id} onClick={() => handleAddToPlaylist(pl.id)} disabled={addingTo === pl.id}
                                    className="w-full flex items-center justify-between px-5 py-3.5 active:bg-white/[0.04] transition">
                                    <span className="text-sm text-white/70 truncate">{pl.name}</span>
                                    {addedTo[pl.id] ? <Check className="w-4 h-4 text-green-400" /> : addingTo === pl.id ? <Loader className="w-4 h-4 animate-spin text-white/30" /> : null}
                                </button>
                            ))}
                        </div>
                    )}

                    {/* Purchase view */}
                    {view === 'purchase' && (
                        <div className="px-5 py-4 space-y-4">
                            {purchaseSuccess ? (
                                <div className="text-center py-4">
                                    <div className="w-14 h-14 rounded-full bg-white/10 flex items-center justify-center mx-auto mb-3">
                                        {isPreorder && isNotYetReleased
                                            ? <Clock className="w-7 h-7 text-yellow-300" />
                                            : <Check className="w-7 h-7 text-white" />}
                                    </div>
                                    {isPreorder && isNotYetReleased ? (
                                        <>
                                            <p className="font-semibold text-white">Pre-order Confirmed!</p>
                                            <p className="text-sm mt-1 text-white/40">
                                                You'll be able to download this track on {formatReleaseDate(releaseDate)}.
                                            </p>
                                        </>
                                    ) : (
                                        <>
                                            <p className="font-semibold text-white">Purchase Complete!</p>
                                            <p className="text-sm mt-1 text-white/40">Starting download...</p>
                                        </>
                                    )}
                                </div>
                            ) : (
                                <>
                                    {/* Pre-order info banner */}
                                    {isPreorder && isNotYetReleased && (
                                        <div className="flex items-center gap-2 rounded-xl p-3 bg-yellow-400/10 border border-yellow-400/20">
                                            <Clock className="w-4 h-4 text-yellow-300 flex-shrink-0" />
                                            <div>
                                                <p className="text-sm font-semibold text-yellow-200">Pre-order</p>
                                                <p className="text-xs text-yellow-300/70">Releases {formatReleaseDate(releaseDate)} — pay now, download on release day</p>
                                            </div>
                                        </div>
                                    )}

                                    {isPWYW ? (
                                        <div className="space-y-3">
                                            <div className="flex items-center justify-between rounded-xl p-3" style={{ backgroundColor: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}>
                                                <div className="flex items-center space-x-2">
                                                    <DollarSign className="w-4 h-4 text-white/30" />
                                                    <p className="text-sm text-white/60">Pay what you want</p>
                                                </div>
                                                {minimumPrice > 0 && <p className="text-xs text-white/30">min ${minimumPrice.toFixed(2)}</p>}
                                            </div>
                                            <div className="relative">
                                                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40 text-sm">$</span>
                                                <input type="number" min={minimumPrice > 0 ? minimumPrice : 0} step="0.01" value={fanPrice}
                                                    onChange={e => { setFanPrice(e.target.value); setFanPriceError(''); }}
                                                    placeholder="Enter amount"
                                                    className="w-full pl-7 pr-4 py-3 bg-white/[0.06] rounded-xl text-white text-lg font-semibold outline-none focus:bg-white/[0.1] transition placeholder:text-white/20 text-center" />
                                            </div>
                                            {fanPriceError && <p className="text-xs text-red-400 text-center">{fanPriceError}</p>}
                                            {minimumPrice === 0 && <p className="text-xs text-white/30 text-center">Enter $0 to download free</p>}
                                            <div className="flex space-x-2">
                                                {[1, 2, 5, 10].filter(v => v >= minimumPrice).map(v => (
                                                    <button key={v} type="button" onClick={() => { setFanPrice(v.toFixed(2)); setFanPriceError(''); }}
                                                        className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition ${parseFloat(fanPrice) === v ? 'bg-white text-black' : 'bg-white/[0.06] text-white/50 hover:bg-white/[0.1]'}`}>
                                                        ${v}
                                                    </button>
                                                ))}
                                            </div>
                                            {parseFloat(fanPrice) > 0 ? (
                                                <>
                                                    {purchaseError && <p className="text-xs text-red-400 text-center">{purchaseError}</p>}
                                                    {!paypalReady && !purchaseError && <div className="flex justify-center py-2"><Loader className="w-5 h-5 animate-spin text-white/30" /></div>}
                                                    <div id="paypal-tas-container" style={{ backgroundColor: '#fff', borderRadius: '8px', padding: '4px' }} />
                                                </>
                                            ) : (
                                                <button onClick={async () => {
                                                    if (!validateFanPrice()) return;
                                                    try {
                                                        const { data: { session } } = await supabase.auth.getSession();
                                                        if (!(isPreorder && isNotYetReleased)) {
                                                            await downloadTrack(track.id, track.title, session?.access_token);
                                                        } else {
                                                            setAlreadyPreordered(true);
                                                        }
                                                        onClose();
                                                    } catch {}
                                                }} className="w-full py-3 bg-white text-black font-semibold rounded-xl hover:bg-white/90 transition flex items-center justify-center space-x-2">
                                                    <Download className="w-4 h-4" />
                                                    <span>{isPreorder && isNotYetReleased ? 'Confirm Pre-order (Free)' : 'Download Free'}</span>
                                                </button>
                                            )}
                                        </div>
                                    ) : (
                                        <>
                                            <div className="flex items-center justify-between rounded-xl p-3" style={{ backgroundColor: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}>
                                                <div className="flex items-center space-x-2">
                                                    <Lock className="w-4 h-4 text-white/30" />
                                                    <p className="text-sm text-white/60">
                                                        {isPreorder && isNotYetReleased ? 'Pre-order to reserve your copy' : 'Purchase to download'}
                                                    </p>
                                                </div>
                                                <p className="text-lg font-bold text-white">${effectivePrice.toFixed(2)}</p>
                                            </div>
                                            <p className="text-xs text-white/30 text-center">
                                                {isPreorder && isNotYetReleased
                                                    ? `High-quality MP3 delivered automatically on ${formatReleaseDate(releaseDate)}`
                                                    : 'High-quality MP3 delivered instantly after payment'}
                                            </p>
                                            {purchaseError && <p className="text-xs text-red-400 text-center">{purchaseError}</p>}
                                            {/* FREE: show direct download button, never send $0 to PayPal */}
                                            {effectivePrice <= 0 ? (
                                                <button onClick={async () => {
                                                    try {
                                                        const { data: { session } } = await supabase.auth.getSession();
                                                        if (!(isPreorder && isNotYetReleased)) {
                                                            await downloadTrack(track.id, track.title, session?.access_token);
                                                        } else {
                                                            setAlreadyPreordered(true);
                                                        }
                                                        onClose();
                                                    } catch {}
                                                }} className="w-full py-3 bg-white text-black font-semibold rounded-xl hover:bg-white/90 transition flex items-center justify-center space-x-2">
                                                    <Download className="w-4 h-4" />
                                                    <span>{isPreorder && isNotYetReleased ? 'Confirm Pre-order (Free)' : 'Download Free'}</span>
                                                </button>
                                            ) : (
                                                <>
                                                    {!paypalReady && !purchaseError && <div className="flex justify-center py-2"><Loader className="w-5 h-5 animate-spin text-white/30" /></div>}
                                                    <div id="paypal-tas-container" style={{ backgroundColor: '#fff', borderRadius: '8px', padding: '4px' }} />
                                                </>
                                            )}
                                        </>
                                    )}
                                </>
                            )}
                        </div>
                    )}

                    {/* Main view */}
                    {view === 'main' && (
                        <>
                            <button onClick={handleLike} className="w-full flex items-center space-x-4 px-5 py-3.5 active:bg-white/[0.04] transition">
                                <Heart className="w-5 h-5" fill={liked ? '#ef4444' : 'none'} color={liked ? '#ef4444' : 'rgba(255,255,255,0.4)'} />
                                <span className="text-sm text-white/70">{liked ? 'Unlike' : 'Like'}</span>
                            </button>
                            <button onClick={handleQueue} className="w-full flex items-center space-x-4 px-5 py-3.5 active:bg-white/[0.04] transition">
                                <Play className="w-5 h-5 text-white/40" />
                                <span className="text-sm text-white/70">Add to Queue</span>
                            </button>
                            <button onClick={loadPlaylists} className="w-full flex items-center space-x-4 px-5 py-3.5 active:bg-white/[0.04] transition">
                                <ListMusic className="w-5 h-5 text-white/40" />
                                <span className="text-sm text-white/70">Add to Playlist</span>
                            </button>
                            <button onClick={handleShare} className="w-full flex items-center space-x-4 px-5 py-3.5 active:bg-white/[0.04] transition">
                                {shared ? <Check className="w-5 h-5 text-green-400" /> : <Share2 className="w-5 h-5 text-white/40" />}
                                <span className="text-sm text-white/70">{shared ? 'Copied!' : 'Share'}</span>
                            </button>
                            {track.is_downloadable && track.id && (
                                <>
                                    {isPreorder && isNotYetReleased && alreadyPreordered ? (
                                        <div className="w-full flex items-center justify-between px-5 py-3.5">
                                            <div className="flex items-center space-x-4">
                                                <Clock className="w-5 h-5 text-yellow-400/60" />
                                                <span className="text-sm text-yellow-300/70">{downloadButtonLabel()}</span>
                                            </div>
                                        </div>
                                    ) : (
                                        <button onClick={handleDownload} disabled={downloading}
                                            className="w-full flex items-center justify-between px-5 py-3.5 active:bg-white/[0.04] transition">
                                            <div className="flex items-center space-x-4">
                                                {downloading
                                                    ? <Loader className="w-5 h-5 animate-spin text-white/40" />
                                                    : isPreorder && isNotYetReleased
                                                        ? <Clock className="w-5 h-5 text-yellow-400/80" />
                                                        : isPWYW
                                                            ? <DollarSign className="w-5 h-5 text-white/40" />
                                                            : basePrice > 0
                                                                ? <ShoppingCart className="w-5 h-5 text-white/40" />
                                                                : <Download className="w-5 h-5 text-white/40" />}
                                                <span className={`text-sm ${isPreorder && isNotYetReleased ? 'text-yellow-300/80' : 'text-white/70'}`}>
                                                    {downloadButtonLabel()}
                                                </span>
                                            </div>
                                            {isPreorder && isNotYetReleased && !downloading && (
                                                <span className="text-xs text-yellow-400/40 ml-2">pre-order</span>
                                            )}
                                            {isPWYW && !isPreorder && !downloading && (
                                                <span className="text-xs text-white/20 ml-2">you choose</span>
                                            )}
                                        </button>
                                    )}
                                    {downloadError && <p className="text-xs text-red-400 px-5 pb-2">{downloadError}</p>}
                                </>
                            )}
                            <button onClick={() => { const slug = artist?.slug || track?.artist_slug; if (slug) { navigate(`/artist/${slug}`); onClose(); } }}
                                className="w-full flex items-center space-x-4 px-5 py-3.5 active:bg-white/[0.04] transition">
                                <Music className="w-5 h-5 text-white/40" />
                                <span className="text-sm text-white/70">View Artist</span>
                            </button>
                        <button onClick={async () => {
                                const slug = artist?.slug || track?.artist_slug;
                                const artistId = artist?.id || track?.artist_id;
                                if (!artistId) return;
                                const { data } = await supabase.from('tracks')
                                  .select('id, title, file_url, cover_artwork_url, duration, artist_id')
                                  .eq('artist_id', artistId).eq('is_published', true)
                                  .order('engagement_score', { ascending: false }).limit(20);
                                if (data?.length) {
                                  const queue = data.map(t => ({ ...t, artist_name: artist?.artist_name || track?.artist_name, artist_slug: slug }));
                                  playTrack(queue[0], queue);
                                }
                                onClose();
                              }}
                              className="w-full flex items-center space-x-4 px-5 py-3.5 active:bg-white/[0.04] transition">
                              <Play className="w-5 h-5 text-white/40" />
                              <span className="text-sm text-white/70">Play Artist Radio</span>
                            </button>
                        </>
                    )}
                </div>

                {/* Safe area padding */}
                <div className="h-6" />
            </div>
            <style>{`
                @keyframes slideUp { from { transform: translateY(100%); } to { transform: translateY(0); } }
                .animate-slide-up { animation: slideUp 0.25s ease-out; }
            `}</style>
      {showShareCard && (
        <ShareCard track={track} onClose={() => setShowShareCard(false)} />
      )}
      {showShareCard && (
        <ShareCard
          track={track}
          onClose={() => setShowShareCard(false)}
        />
      )}
        </div>
    );
}
