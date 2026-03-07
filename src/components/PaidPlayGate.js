/**
 * PaidPlayGate
 *
 * Wrap your play logic with this component/hook integration.
 * Shows a modal when a user has used up their 5 free plays on a paid track.
 *
 * Usage in TrackCard, SquareCard, AlbumDetailPage etc.:
 *
 *   import { usePaidPlayLimit } from '../hooks/usePaidPlayLimit';
 *   import PaidPlayGate from '../components/PaidPlayGate';
 *
 *   const { checkPlayLimit, recordPlay } = usePaidPlayLimit();
 *   const [limitedTrack, setLimitedTrack] = useState(null);
 *
 *   const handlePlay = (track) => {
 *     const { allowed } = checkPlayLimit(track);
 *     if (!allowed) { setLimitedTrack(track); return; }
 *     recordPlay(track.id);
 *     actuallyPlay(track);
 *   };
 *
 *   <PaidPlayGate
 *     track={limitedTrack}
 *     artist={artist}
 *     onClose={() => setLimitedTrack(null)}
 *     onPurchaseComplete={(track) => { resetPlayCount(track.id); actuallyPlay(track); setLimitedTrack(null); }}
 *   />
 */

import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { Music, Loader, ShoppingCart, X, Headphones } from 'lucide-react';
import { usePaidPlayLimit } from '../hooks/usePaidPlayLimit';

const PAYPAL_CLIENT_ID = 'AXhUqyXxTmBJ8Q6bqt0yiOEuLxqbbhnP93YONXL5Oiy3btUntKK8M7F2WfOeUzoVPxjHEalbRRRU52yY';

export default function PaidPlayGate({ track, artist, onClose, onPurchaseComplete }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { FREE_PLAY_LIMIT } = usePaidPlayLimit();

  const [paypalReady, setPaypalReady] = useState(false);
  const [purchasing, setPurchasing] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!track) return;
    setPaypalReady(false); setError(''); setSuccess(false);
    const existing = document.getElementById('paypal-sdk-gate');
    if (existing) existing.remove();
    const script = document.createElement('script');
    script.id = 'paypal-sdk-gate';
    script.src = `https://www.paypal.com/sdk/js?client-id=${PAYPAL_CLIENT_ID}&currency=USD`;
    script.async = true;
    script.onload = () => setPaypalReady(true);
    script.onerror = () => setError('Failed to load PayPal.');
    document.head.appendChild(script);
  }, [track?.id]);

  useEffect(() => {
    if (!paypalReady || !track || !window.paypal) return;
    const container = document.getElementById('paypal-gate-container');
    if (!container) return;
    container.innerHTML = '';
    window.paypal.Buttons({
      style: { layout: 'vertical', color: 'gold', shape: 'rect', label: 'pay' },
      createOrder: async () => {
        setPurchasing(true); setError('');
        try {
          const res = await fetch('/.netlify/functions/paypal-order', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'create', trackId: track.id, amount: track.download_price, trackTitle: track.title, artistName: artist?.artist_name }),
          });
          const { orderId, error: err } = await res.json();
          if (err || !orderId) throw new Error(err || 'Failed to create order');
          return orderId;
        } catch (e) { setError(e.message); setPurchasing(false); throw e; }
      },
      onApprove: async (data) => {
        try {
          const res = await fetch('/.netlify/functions/paypal-order', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'capture', orderId: data.orderID }),
          });
          const captureData = await res.json();
          if (!captureData.success) throw new Error('Payment capture failed');
          if (user) {
            await supabase.from('downloads').insert({ user_id: user.id, track_id: track.id, amount_paid: track.download_price }).catch(() => {});
            await fetch('/.netlify/functions/process-split-payout', {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ track_id: track.id, transaction_id: captureData.captureId, total_amount: track.download_price, buyer_user_id: user.id }),
            }).catch(() => {});
          }
          setSuccess(true); setPurchasing(false);
          setTimeout(() => { onPurchaseComplete?.(track); }, 1500);
        } catch (e) { setError(e.message); setPurchasing(false); }
      },
      onError: () => { setError('Payment failed. Please try again.'); setPurchasing(false); },
      onCancel: () => setPurchasing(false),
    }).render('#paypal-gate-container');
  }, [paypalReady, track?.id]);

  if (!track) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.88)' }}
      onClick={() => { if (!purchasing) onClose?.(); }}>
      <div className="w-full max-w-sm rounded-2xl overflow-hidden"
        style={{ backgroundColor: '#0c0c0c', border: '1px solid rgba(255,255,255,0.10)' }}
        onClick={(e) => e.stopPropagation()}>

        {success ? (
          <div className="p-8 text-center">
            <div className="w-14 h-14 rounded-full bg-white/10 flex items-center justify-center mx-auto mb-3">
              <Headphones className="w-7 h-7 text-white" />
            </div>
            <p className="font-semibold text-white text-lg">Unlocked!</p>
            <p className="text-sm text-white/40 mt-1">Enjoy unlimited plays</p>
          </div>
        ) : (
          <>
            {/* Header */}
            <div className="flex items-center justify-between px-5 pt-5 pb-4">
              <div className="flex items-center space-x-3">
                <div className="w-11 h-11 rounded-xl overflow-hidden bg-white/10 flex-shrink-0">
                  {track.cover_artwork_url
                    ? <img src={track.cover_artwork_url} alt="" className="w-full h-full object-cover" />
                    : <div className="w-full h-full flex items-center justify-center"><Music className="w-5 h-5 text-white/30" /></div>}
                </div>
                <div className="min-w-0">
                  <p className="font-semibold text-white text-sm truncate">{track.title}</p>
                  <p className="text-xs text-white/40">{artist?.artist_name}</p>
                </div>
              </div>
              <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-white/10 transition flex-shrink-0 ml-2">
                <X className="w-4 h-4 text-white/40" />
              </button>
            </div>

            {/* Message */}
            <div className="px-5 pb-4">
              <div className="rounded-xl p-4 text-center" style={{ backgroundColor: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}>
                <p className="text-sm font-semibold text-white mb-1">
                  You've used your {FREE_PLAY_LIMIT} free plays
                </p>
                <p className="text-xs text-white/40">
                  Purchase this track for <span className="text-white font-semibold">${track.download_price?.toFixed(2)}</span> to unlock unlimited listening + download
                </p>
              </div>
            </div>

            {/* PayPal */}
            <div className="px-5 pb-5 space-y-3">
              {error && <p className="text-xs text-red-400 text-center">{error}</p>}
              {!user && (
                <button onClick={() => navigate('/login')}
                  className="w-full py-3 rounded-xl text-sm font-semibold bg-white text-black transition hover:bg-white/90 flex items-center justify-center space-x-2">
                  <ShoppingCart className="w-4 h-4" />
                  <span>Sign in to purchase · ${track.download_price?.toFixed(2)}</span>
                </button>
              )}
              {user && !paypalReady && !error && (
                <div className="flex justify-center py-3"><Loader className="w-5 h-5 animate-spin text-white/30" /></div>
              )}
              {user && <div id="paypal-gate-container" style={{ backgroundColor: '#fff', borderRadius: '8px', padding: '4px' }} />}
              <button onClick={onClose} className="w-full py-2 text-xs text-white/25 hover:text-white/40 transition">
                Maybe later
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
