import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { useAuth } from '../contexts/AuthContext';
import { usePlayer } from '../contexts/PlayerContext';
import {
  ChevronLeft, Play, Pause, Heart, Share2, Download,
  Music, MessageCircle, Loader, ShoppingBag, Check,
  Zap, Star, Crown, Package
} from 'lucide-react';

function fmt(n) {
  if (!n) return '0';
  if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
  if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
  return String(n);
}

const LICENCE_META = {
  free:      { label: 'Free',        badge: '🎁', color: '#9ca3af', bg: 'rgba(156,163,175,0.1)',  border: 'rgba(156,163,175,0.2)',  terms: ['MP3 download', 'Non-commercial use only', 'Credit required', 'Stream anywhere'] },
  basic:     { label: 'Basic Lease', badge: '📄', color: '#60a5fa', bg: 'rgba(96,165,250,0.1)',   border: 'rgba(96,165,250,0.25)',  terms: ['MP3 + WAV download', 'Up to 10K streams', 'For profit use', 'Credit required'] },
  premium:   { label: 'Premium',     badge: '⭐', color: '#a78bfa', bg: 'rgba(167,139,250,0.1)', border: 'rgba(167,139,250,0.25)', terms: ['MP3 + WAV + tracked stems', 'Up to 100K streams', 'For profit use', 'Credit required'] },
  unlimited: { label: 'Unlimited',   badge: '🚀', color: '#f59e0b', bg: 'rgba(245,158,11,0.1)',  border: 'rgba(245,158,11,0.25)',  terms: ['All files including stems', 'Unlimited streams', 'Full commercial use', 'No credit required'] },
  exclusive: { label: 'Exclusive',   badge: '💎', color: '#ec4899', bg: 'rgba(236,72,153,0.1)',  border: 'rgba(236,72,153,0.3)',   terms: ['All files + stems', 'Unlimited streams', 'Beat removed from sale', 'Full ownership transfer'] },
};

export default function BeatDetailPage() {
  const { slug }  = useParams();
  const navigate  = useNavigate();
  const { user, artist: myArtist } = useAuth();
  const { playTrack, currentTrack, isPlaying, togglePlay } = usePlayer();

  const [track, setTrack]         = useState(null);
  const [artist, setArtist]       = useState(null);
  const [licences, setLicences]   = useState([]);
  const [stems, setStems]         = useState([]);
  const [comments, setComments]   = useState([]);
  const [liked, setLiked]         = useState(false);
  const [likeCount, setLikeCount] = useState(0);
  const [following, setFollowing] = useState(false);
  const [loading, setLoading]     = useState(true);
  const [commentText, setCommentText] = useState('');
  const [posting, setPosting]     = useState(false);
  const [selectedLicence, setSelectedLicence] = useState(null);
  const [purchasing, setPurchasing]       = useState(false);
  const [purchaseSuccess, setPurchaseSuccess] = useState(false);
  const [purchaseError, setPurchaseError] = useState('');
  const [paypalReady, setPaypalReady]     = useState(false);
  const [alreadyPurchased, setAlreadyPurchased] = useState(false);

  const isCurrentTrack = currentTrack?.id === track?.id;

  useEffect(() => {
    if (!slug) return;
    const load = async () => {
      setLoading(true);
      const { data: t } = await supabase
        .from('tracks')
        .select('*, artists(id, artist_name, slug, profile_image_url, is_verified, total_streams, user_id)')
        .eq('slug', slug)
        .eq('is_beat', true)
        .eq('is_published', true)
        .maybeSingle();

      if (!t) { setLoading(false); return; }
      setTrack(t);
      setArtist(t.artists);
      setLikeCount(t.like_count || 0);

      // Parse licence data
      if (t.beat_licence) {
        try {
          const parsed = typeof t.beat_licence === 'string' ? JSON.parse(t.beat_licence) : t.beat_licence;
          if (parsed.enabled && parsed.prices) {
            const enabled = Object.entries(parsed.enabled)
              .filter(([, on]) => on)
              .map(([id]) => ({
                id,
                price: parsed.prices[id] ? parseFloat(parsed.prices[id]) : 0,
                ...LICENCE_META[id],
              }))
              .sort((a, b) => a.price - b.price);
            setLicences(enabled);
            setSelectedLicence(enabled[0]?.id || null);
          } else {
            // Old format — single licence string
            const id = typeof t.beat_licence === 'string' && !t.beat_licence.startsWith('{') ? t.beat_licence : 'basic';
            const meta = LICENCE_META[id] || LICENCE_META.basic;
            setLicences([{ id, price: t.download_price || 0, ...meta }]);
            setSelectedLicence(id);
          }
        } catch {
          setLicences([{ id: 'basic', price: t.download_price || 0, ...LICENCE_META.basic }]);
          setSelectedLicence('basic');
        }
      } else if (t.is_downloadable) {
        setLicences([{ id: 'basic', price: t.download_price || 0, ...LICENCE_META.basic }]);
        setSelectedLicence('basic');
      }

      // Stems
      const { data: stemData } = await supabase.from('track_stems').select('*').eq('track_id', t.id);
      setStems(stemData || []);

      // Comments
      const { data: rawComments } = await supabase
        .from('track_comments').select('id, content, created_at, user_id')
        .eq('track_id', t.id).order('created_at', { ascending: false }).limit(30);
      if (rawComments?.length) {
        const uids = [...new Set(rawComments.map(c => c.user_id).filter(Boolean))];
        const [{ data: artists }, { data: profiles }] = await Promise.all([
          supabase.from('artists').select('user_id, artist_name, profile_image_url').in('user_id', uids),
          supabase.from('user_profiles').select('user_id, name, avatar_url').in('user_id', uids),
        ]);
        const aMap = Object.fromEntries((artists || []).map(a => [a.user_id, a]));
        const pMap = Object.fromEntries((profiles || []).map(p => [p.user_id, p]));
        setComments(rawComments.map(c => ({ ...c, artist: aMap[c.user_id], profile: pMap[c.user_id] })));
      }

      if (user) {
        const { data: lk } = await supabase.from('track_likes').select('id').eq('track_id', t.id).eq('user_id', user.id).maybeSingle();
        setLiked(!!lk);
        if (t.artists?.id) {
          const { data: fw } = await supabase.from('follows').select('id').eq('artist_id', t.artists.id).eq('follower_id', user.id).maybeSingle();
          setFollowing(!!fw);
        }
        // Check if already purchased
        const { data: existingPurchase } = await supabase
          .from('beat_purchases').select('id, licence_type')
          .eq('track_id', t.id).eq('buyer_user_id', user.id).eq('status', 'completed').maybeSingle();
        if (existingPurchase) { setAlreadyPurchased(true); setSelectedLicence(existingPurchase.licence_type); }
      }
      setLoading(false);
      // Load PayPal SDK
      if (!window.paypal) {
        const clientId = process.env.REACT_APP_PAYPAL_CLIENT_ID;
        if (clientId) {
          const script = document.createElement('script');
          script.src = `https://www.paypal.com/sdk/js?client-id=${clientId}&currency=USD&intent=capture`;
          script.onload = () => setPaypalReady(true);
          document.head.appendChild(script);
        }
      } else {
        setPaypalReady(true);
      }
    };
    load();
  }, [slug, user?.id]);

  const handlePlay = () => {
    if (!track?.file_url) return;
    if (isCurrentTrack) { togglePlay(); return; }
    playTrack({ ...track, artist_name: artist?.artist_name, artist_slug: artist?.slug }, []);
  };

  const handleLike = async () => {
    if (!user || !track) return;
    if (liked) {
      await supabase.from('track_likes').delete().eq('track_id', track.id).eq('user_id', user.id);
      setLiked(false); setLikeCount(p => Math.max(0, p - 1));
    } else {
      await supabase.from('track_likes').insert({ track_id: track.id, user_id: user.id });
      setLiked(true); setLikeCount(p => p + 1);
    }
  };

  const handleFollow = async () => {
    if (!user || !artist) return;
    if (following) {
      await supabase.from('follows').delete().eq('artist_id', artist.id).eq('follower_id', user.id);
      setFollowing(false);
    } else {
      await supabase.from('follows').insert({ artist_id: artist.id, follower_id: user.id });
      setFollowing(true);
    }
  };

  const handleShare = () => {
    const url = `${window.location.origin}/beat/${slug}`;
    if (navigator.share) navigator.share({ title: track.title, url });
    else navigator.clipboard.writeText(url);
  };

  const postComment = async () => {
    if (!commentText.trim() || !user || posting) return;
    setPosting(true);
    const { data } = await supabase.from('track_comments')
      .insert({ track_id: track.id, user_id: user.id, content: commentText.trim() })
      .select('id, content, created_at, user_id').single();
    if (data) {
      const name = myArtist?.artist_name || 'Listener';
      setComments(prev => [{ ...data, artist: myArtist, profile: { name } }, ...prev]);
      if (artist && artist.user_id !== user.id) {
        supabase.from('notifications').insert({
          user_id: artist.user_id, artist_id: artist.id,
          type: 'track_commented',
          title: `${name} commented on "${track.title}"`,
          message: commentText.trim().slice(0, 100),
          track_id: track.id,
          metadata: { track_id: track.id, track_title: track.title },
        }).catch(() => {});
      }
    }
    setCommentText(''); setPosting(false);
  };

  const handleBuy = async (lic) => {
    if (!user) { navigate('/login'); return; }
    if (lic.price === 0) {
      // Free licence — record and trigger download
      await supabase.from('beat_purchases').insert({
        track_id: track.id, buyer_user_id: user.id,
        licence_type: lic.id, amount_paid: 0, status: 'completed',
      });
      setAlreadyPurchased(true); setPurchaseSuccess(true);
      if (track.file_url) {
        const a = document.createElement('a');
        a.href = track.file_url; a.download = `${track.title}.mp3`; a.click();
      }
      return;
    }
    setPurchasing(true); setPurchaseError('');
    // Render PayPal buttons into the container
    if (!window.paypal) { setPurchaseError('PayPal not loaded. Please refresh.'); setPurchasing(false); return; }
    const container = document.getElementById('beat-paypal-container');
    if (!container) { setPurchasing(false); return; }
    container.innerHTML = '';
    window.paypal.Buttons({
      style: { layout: 'vertical', color: 'gold', shape: 'rect', label: 'pay' },
      createOrder: async () => {
        try {
          const res = await fetch('/.netlify/functions/paypal-order', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'create', trackId: track.id, amount: lic.price, trackTitle: `${track.title} — ${lic.label} Lease`, artistName: artist?.artist_name }),
          });
          const { orderId, error } = await res.json();
          if (error || !orderId) throw new Error(error || 'Failed to create order');
          return orderId;
        } catch (err) { setPurchaseError(err.message); setPurchasing(false); throw err; }
      },
      onApprove: async (data) => {
        try {
          const res = await fetch('/.netlify/functions/paypal-order', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'capture', orderId: data.orderID }),
          });
          const captureData = await res.json();
          if (!captureData.success) throw new Error('Payment capture failed');
          // Record beat purchase
          await supabase.from('beat_purchases').insert({
            track_id: track.id, buyer_user_id: user.id,
            licence_type: selectedLicence, amount_paid: lic.price,
            paypal_order_id: data.orderID, paypal_capture_id: captureData.captureId,
            status: 'completed',
          });
          // Notify producer
          if (artist?.user_id) {
            supabase.from('notifications').insert({
              user_id: artist.user_id, artist_id: artist.id,
              type: 'download', title: `Someone purchased "${track.title}"`,
              message: `${lic.label} lease — $${lic.price}`,
              track_id: track.id,
              metadata: { track_id: track.id, track_title: track.title, licence: lic.id, amount: lic.price },
            }).catch(() => {});
          }
          setAlreadyPurchased(true); setPurchaseSuccess(true); setPurchasing(false);
          // Trigger download
          if (track.file_url) {
            setTimeout(() => {
              const a = document.createElement('a');
              a.href = track.file_url; a.download = `${track.title}.mp3`; a.click();
            }, 800);
          }
        } catch (err) { setPurchaseError(err.message); setPurchasing(false); }
      },
      onError: () => { setPurchaseError('Payment failed. Please try again.'); setPurchasing(false); },
      onCancel: () => setPurchasing(false),
    }).render('#beat-paypal-container');
  };

  if (loading) return (
    <div className="min-h-screen bg-black flex items-center justify-center">
      <Loader className="w-6 h-6 animate-spin text-white/20" />
    </div>
  );

  if (!track) return (
    <div className="min-h-screen bg-black flex items-center justify-center px-6 text-center">
      <div>
        <Music className="w-12 h-12 mx-auto text-white/10 mb-4" />
        <p className="text-white/40 text-sm">Beat not found</p>
        <button onClick={() => navigate(-1)} className="mt-4 text-xs text-white/30 hover:text-white/50 transition">← Go back</button>
      </div>
    </div>
  );

  const selectedLic = licences.find(l => l.id === selectedLicence);

  return (
    <div className="min-h-screen bg-black text-white pb-32">
      {/* ── Hero ── */}
      <div className="relative">
        <div className="absolute inset-0 overflow-hidden">
          {track.cover_artwork_url && <img src={track.cover_artwork_url} alt="" className="w-full h-full object-cover scale-110 blur-2xl opacity-15" />}
          <div className="absolute inset-0 bg-gradient-to-b from-black/70 via-black/50 to-black" />
        </div>

        <div className="relative z-10 pt-14 px-4 pb-4">
          <button onClick={() => navigate(-1)}
            className="w-9 h-9 flex items-center justify-center rounded-full bg-black/40 backdrop-blur-sm border border-white/10">
            <ChevronLeft className="w-5 h-5 text-white" />
          </button>
        </div>

        <div className="relative z-10 px-6 pb-8">
          <div className="flex items-end space-x-5">
            {/* Artwork */}
            <div className="w-40 h-40 rounded-2xl overflow-hidden shadow-2xl border border-white/10 flex-shrink-0"
              style={{ boxShadow: '0 24px 48px rgba(0,0,0,0.7)' }}>
              {track.cover_artwork_url
                ? <img src={track.cover_artwork_url} alt={track.title} className="w-full h-full object-cover" />
                : <div className="w-full h-full bg-white/[0.06] flex items-center justify-center">
                    <Music className="w-12 h-12 text-white/20" />
                  </div>}
            </div>

            <div className="flex-1 min-w-0 pb-2">
              {/* Beat badge */}
              <span className="text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full mb-2 inline-block"
                style={{ background: 'rgba(234,179,8,0.15)', color: '#facc15', border: '1px solid rgba(234,179,8,0.25)' }}>
                BEAT
              </span>
              <h1 className="text-xl font-black text-white leading-tight mb-1">{track.title}</h1>
              <button onClick={() => navigate(`/artist/${artist?.slug}`)}
                className="text-sm text-white/50 hover:text-white transition block text-left">
                {artist?.artist_name}
              </button>

              {/* BPM / Key pills */}
              <div className="flex flex-wrap gap-1.5 mt-2">
                {track.bpm && (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-white/[0.06] text-white/50">
                    {track.bpm} BPM
                  </span>
                )}
                {track.beat_key && (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-white/[0.06] text-white/50">
                    {track.beat_key} {track.beat_scale || ''}
                  </span>
                )}
                {track.genre && (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                    style={{ background: 'rgba(167,139,250,0.15)', color: '#a78bfa' }}>
                    {track.genre}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Stats */}
          <div className="flex items-center space-x-5 mt-5">
            <div className="text-center">
              <p className="text-base font-black text-white">{fmt(track.stream_count || 0)}</p>
              <p className="text-[10px] text-white/30">plays</p>
            </div>
            <div className="w-px h-6 bg-white/10" />
            <div className="text-center">
              <p className="text-base font-black text-white">{fmt(likeCount)}</p>
              <p className="text-[10px] text-white/30">likes</p>
            </div>
            {stems.length > 0 && (
              <>
                <div className="w-px h-6 bg-white/10" />
                <div className="text-center">
                  <p className="text-base font-black text-white">{stems.length}</p>
                  <p className="text-[10px] text-white/30">stems</p>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="px-6 space-y-4">
        {/* ── Play + actions ── */}
        <div className="flex items-center space-x-3">
          <button onClick={handlePlay} disabled={!track.file_url}
            className="flex-1 flex items-center justify-center space-x-2 py-3.5 rounded-2xl font-bold text-sm transition active:scale-[0.98] disabled:opacity-30"
            style={{ background: 'linear-gradient(135deg, #facc15, #d97706)' }}>
            {isCurrentTrack && isPlaying
              ? <><Pause className="w-5 h-5 text-black" /><span className="text-black">Pause Preview</span></>
              : <><Play className="w-5 h-5 fill-black text-black" /><span className="text-black">Preview Beat</span></>}
          </button>
          <button onClick={handleLike}
            className="w-13 h-13 flex items-center justify-center rounded-2xl border transition active:scale-95"
            style={{ background: liked ? 'rgba(239,68,68,0.15)' : 'rgba(255,255,255,0.04)', borderColor: liked ? 'rgba(239,68,68,0.3)' : 'rgba(255,255,255,0.08)' }}>
            <Heart className="w-5 h-5" fill={liked ? '#ef4444' : 'none'} color={liked ? '#ef4444' : 'rgba(255,255,255,0.6)'} strokeWidth={liked ? 0 : 2} />
          </button>
          <button onClick={handleShare}
            className="w-13 h-13 flex items-center justify-center rounded-2xl border border-white/[0.08] bg-white/[0.04] transition active:scale-95">
            <Share2 className="w-5 h-5 text-white/60" />
          </button>
        </div>

        {/* ── Licence selector ── */}
        {licences.length > 0 && (
          <div className="rounded-2xl border border-white/[0.06] overflow-hidden"
            style={{ background: 'rgba(255,255,255,0.02)' }}>
            <p className="text-xs text-white/40 font-semibold uppercase tracking-wider px-4 py-3 border-b border-white/[0.05]">
              Licence Options
            </p>
            <div className="divide-y divide-white/[0.04]">
              {licences.map(lic => (
                <button key={lic.id}
                  onClick={() => setSelectedLicence(lic.id)}
                  className="w-full flex items-start space-x-3 px-4 py-3.5 transition hover:bg-white/[0.03] text-left">
                  {/* Radio */}
                  <div className="w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0 mt-0.5 transition"
                    style={{ borderColor: selectedLicence === lic.id ? lic.color : 'rgba(255,255,255,0.15)' }}>
                    {selectedLicence === lic.id && (
                      <div className="w-2 h-2 rounded-full" style={{ background: lic.color }} />
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center space-x-2 mb-1">
                      <span className="text-base">{lic.badge}</span>
                      <span className="text-sm font-bold text-white">{lic.label}</span>
                    </div>
                    <div className="space-y-0.5">
                      {lic.terms?.slice(0, 3).map((t, i) => (
                        <p key={i} className="text-[11px] text-white/35 flex items-center space-x-1.5">
                          <Check className="w-2.5 h-2.5 flex-shrink-0" style={{ color: lic.color }} />
                          <span>{t}</span>
                        </p>
                      ))}
                    </div>
                  </div>

                  <div className="text-right flex-shrink-0">
                    {lic.price === 0
                      ? <span className="text-sm font-black" style={{ color: lic.color }}>Free</span>
                      : <span className="text-sm font-black text-white">${lic.price}</span>}
                  </div>
                </button>
              ))}
            </div>

            {/* Buy CTA */}
            {selectedLic && (
              <div className="p-4 border-t border-white/[0.05]">
                {purchaseSuccess || alreadyPurchased ? (
                  <div className="text-center py-2 space-y-1">
                    <div className="w-10 h-10 rounded-full bg-green-500/20 flex items-center justify-center mx-auto mb-2">
                      <Check className="w-5 h-5 text-green-400" />
                    </div>
                    <p className="text-sm font-bold text-green-400">{purchaseSuccess ? 'Purchase complete!' : 'Already purchased'}</p>
                    <p className="text-[11px] text-white/30">{selectedLic.label} licence — download starting</p>
                    {track.file_url && (
                      <a href={track.file_url} download={`${track.title}.mp3`}
                        className="text-xs text-purple-400 hover:text-purple-300 transition mt-1 inline-block">
                        Download again →
                      </a>
                    )}
                  </div>
                ) : purchasing ? (
                  <div>
                    <div id="beat-paypal-container" className="min-h-[48px]" />
                    {purchaseError && <p className="text-xs text-red-400 mt-2 text-center">{purchaseError}</p>}
                  </div>
                ) : (
                  <>
                    <button onClick={() => handleBuy(selectedLic)}
                      className="w-full py-3.5 rounded-xl font-bold text-sm transition active:scale-[0.98] flex items-center justify-center space-x-2"
                      style={{ background: selectedLic.price === 0 ? 'rgba(34,197,94,0.15)' : selectedLic.bg, border: `1px solid ${selectedLic.border}`, color: selectedLic.price === 0 ? '#22c55e' : selectedLic.color }}>
                      {selectedLic.price === 0
                        ? <><Download className="w-4 h-4" /><span>Download Free</span></>
                        : <><ShoppingBag className="w-4 h-4" /><span>Buy {selectedLic.label} — ${selectedLic.price}</span></>}
                    </button>
                    {!user && <p className="text-[10px] text-white/20 text-center mt-2">Sign in to purchase</p>}
                    {purchaseError && <p className="text-xs text-red-400 mt-2 text-center">{purchaseError}</p>}
                  </>
                )}
              </div>
            )}
          </div>
        )}

        {/* ── Stems ── */}
        {stems.length > 0 && (
          <div className="rounded-2xl border border-white/[0.06] overflow-hidden"
            style={{ background: 'rgba(255,255,255,0.02)' }}>
            <p className="text-xs text-white/40 font-semibold uppercase tracking-wider px-4 py-3 border-b border-white/[0.05] flex items-center space-x-2">
              <Package className="w-3.5 h-3.5" />
              <span>Stems Included</span>
            </p>
            <div className="divide-y divide-white/[0.04]">
              {stems.map((s, i) => (
                <div key={i} className="flex items-center space-x-3 px-4 py-3">
                  <div className="w-8 h-8 rounded-lg bg-yellow-500/10 flex items-center justify-center flex-shrink-0">
                    <Music className="w-3.5 h-3.5 text-yellow-400" />
                  </div>
                  <p className="text-sm text-white/70 flex-1 truncate">{s.file_name || s.name || `Stem ${i + 1}`}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Producer card ── */}
        <div className="rounded-2xl border border-white/[0.06] p-4 flex items-center space-x-3"
          style={{ background: 'rgba(255,255,255,0.02)' }}>
          <button onClick={() => navigate(`/artist/${artist?.slug}`)}
            className="w-12 h-12 rounded-full overflow-hidden border border-white/10 flex-shrink-0">
            {artist?.profile_image_url
              ? <img src={artist.profile_image_url} alt="" className="w-full h-full object-cover" />
              : <div className="w-full h-full bg-yellow-500/20 flex items-center justify-center text-sm font-bold text-yellow-400">{artist?.artist_name?.[0]}</div>}
          </button>
          <div className="flex-1 min-w-0">
            <button onClick={() => navigate(`/artist/${artist?.slug}`)}
              className="text-sm font-bold text-white hover:text-white/80 transition block truncate text-left">
              {artist?.artist_name}
            </button>
            <p className="text-xs text-white/30">Beat Maker</p>
          </div>
          {user && myArtist?.id !== artist?.id && (
            <button onClick={handleFollow}
              className="px-4 py-1.5 rounded-xl text-xs font-bold transition border"
              style={following
                ? { background: 'transparent', borderColor: 'rgba(255,255,255,0.2)', color: 'rgba(255,255,255,0.5)' }
                : { background: 'rgba(234,179,8,0.1)', borderColor: 'rgba(234,179,8,0.25)', color: '#facc15' }}>
              {following ? 'Following' : 'Follow'}
            </button>
          )}
        </div>

        {/* ── Comments ── */}
        <div className="rounded-2xl border border-white/[0.06] overflow-hidden"
          style={{ background: 'rgba(255,255,255,0.02)' }}>
          <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.05]">
            <p className="text-sm font-semibold text-white flex items-center space-x-2">
              <MessageCircle className="w-4 h-4 text-white/40" />
              <span>Comments</span>
            </p>
            <span className="text-xs text-white/30">{comments.length}</span>
          </div>
          {user && (
            <div className="px-4 py-3 border-b border-white/[0.05] flex items-center space-x-3">
              <div className="w-8 h-8 rounded-full bg-white/10 overflow-hidden flex-shrink-0 flex items-center justify-center">
                {myArtist?.profile_image_url
                  ? <img src={myArtist.profile_image_url} alt="" className="w-full h-full object-cover" />
                  : <span className="text-xs font-bold text-white/40">{myArtist?.artist_name?.[0] || user.email?.[0]?.toUpperCase()}</span>}
              </div>
              <input value={commentText} onChange={e => setCommentText(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && postComment()}
                placeholder="Add a comment…" maxLength={300}
                className="flex-1 bg-white/[0.06] rounded-xl px-3 py-2 text-sm text-white placeholder-white/25 outline-none border border-white/[0.06] focus:border-white/20 transition" />
              <button onClick={postComment} disabled={!commentText.trim() || posting}
                className="w-8 h-8 flex items-center justify-center rounded-xl transition disabled:opacity-30"
                style={{ background: 'rgba(234,179,8,0.15)', border: '1px solid rgba(234,179,8,0.3)' }}>
                {posting ? <Loader className="w-3.5 h-3.5 animate-spin text-yellow-400" />
                  : <svg className="w-3.5 h-3.5 text-yellow-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>}
              </button>
            </div>
          )}
          <div className="divide-y divide-white/[0.04] max-h-72 overflow-y-auto">
            {comments.length === 0
              ? <p className="text-center text-white/20 text-sm py-6">No comments yet</p>
              : comments.map(c => (
                <div key={c.id} className="flex items-start space-x-3 px-4 py-3">
                  <div className="w-8 h-8 rounded-full bg-white/10 overflow-hidden flex-shrink-0 flex items-center justify-center">
                    {(c.artist?.profile_image_url || c.profile?.avatar_url)
                      ? <img src={c.artist?.profile_image_url || c.profile?.avatar_url} alt="" className="w-full h-full object-cover" />
                      : <span className="text-xs font-bold text-white/30">{(c.artist?.artist_name || c.profile?.name || '?')[0]}</span>}
                  </div>
                  <div className="flex-1">
                    <p className="text-[11px] font-semibold text-white/50 mb-0.5">{c.artist?.artist_name || c.profile?.name || 'Listener'}</p>
                    <p className="text-sm text-white/80">{c.content}</p>
                  </div>
                </div>
              ))}
          </div>
        </div>
      </div>
    </div>
  );
}
