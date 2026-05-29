/**
 * MerchOrdersPage.js — /artist/:slug/merch/orders
 * Shows the logged-in user's past orders from this artist's merch store.
 */

import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { supabase } from '../supabaseClient';
import { useAuth } from '../contexts/AuthContext';
import { ArrowLeft, Loader, Package, ExternalLink } from 'lucide-react';

const STATUS_COLOR = {
  draft:     'text-white/30',
  pending:   'text-yellow-400',
  inprocess: 'text-blue-400',
  partial:   'text-blue-400',
  fulfilled: 'text-green-400',
  canceled:  'text-red-400/60',
};

async function proxyRequest(action, artistId, params = {}, authToken = null) {
  const headers = { 'Content-Type': 'application/json' };
  if (authToken) headers['Authorization'] = `Bearer ${authToken}`;
  const res = await fetch('/.netlify/functions/printful-proxy', {
    method: 'POST', headers,
    body: JSON.stringify({ action, artist_id: artistId, ...params }),
  });
  const json = await res.json();
  if (!json.ok) throw new Error(json.error || 'Failed');
  return json;
}

export default function MerchOrdersPage() {
  const { slug }  = useParams();
  const navigate  = useNavigate();
  const { user }  = useAuth();

  const [artist,  setArtist]  = useState(null);
  const [orders,  setOrders]  = useState([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState('');

  useEffect(() => {
    if (!user) { navigate(`/artist/${slug}/merch`, { replace: true }); return; }
    const load = async () => {
      try {
        const { data: artistData } = await supabase
          .from('artists').select('id, artist_name, profile_image_url, slug, merch_enabled')
          .eq('slug', slug).maybeSingle();
        if (!artistData?.merch_enabled) { setError('Merch not available'); setLoading(false); return; }
        setArtist(artistData);

        const { data: { session } } = await supabase.auth.getSession();
        const { orders: orderList } = await proxyRequest('get_orders', artistData.id, {}, session?.access_token);
        setOrders(orderList || []);
      } catch (err) { setError(err.message); }
      setLoading(false);
    };
    load();
  }, [slug, user]); // eslint-disable-line

  return (
    <div className="min-h-screen bg-black text-white pb-32">
      <Helmet>
        <title>My Orders · Feelz Machine</title>
        <link rel="icon" href="/favicon.ico" />
        <link rel="apple-touch-icon" href="/logo192.png" />
      </Helmet>

      <div className="sticky top-0 z-20 bg-black/95 backdrop-blur-xl border-b border-white/[0.06] px-4 pt-14 pb-3 md:pt-4 flex items-center space-x-3">
        <button onClick={() => navigate(`/artist/${slug}/merch`)}
          className="w-9 h-9 flex items-center justify-center rounded-full bg-white/[0.06] hover:bg-white/[0.1] transition flex-shrink-0">
          <ArrowLeft className="w-4 h-4 text-white/60" />
        </button>
        <div>
          <p className="text-sm font-bold text-white">My Orders</p>
          {artist && <p className="text-[10px] text-white/40">{artist.artist_name} Merch</p>}
        </div>
      </div>

      <div className="px-4 pt-5 max-w-lg mx-auto">
        {loading ? (
          <div className="flex justify-center py-16"><Loader className="w-6 h-6 animate-spin text-white/20" /></div>
        ) : error ? (
          <p className="text-center text-white/30 text-sm py-16">{error}</p>
        ) : orders.length === 0 ? (
          <div className="flex flex-col items-center py-16 text-center">
            <Package className="w-12 h-12 text-white/10 mb-3" />
            <p className="text-white/30 text-sm">No orders yet</p>
            <button onClick={() => navigate(`/artist/${slug}/merch`)}
              className="mt-4 text-xs text-white/30 hover:text-white/50 transition">Browse merch →</button>
          </div>
        ) : (
          <div className="space-y-3">
            {orders.map(order => {
              const status = order.status || 'draft';
              const statusColor = STATUS_COLOR[status] || 'text-white/40';
              const date = order.created ? new Date(order.created * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '';
              return (
                <div key={order.id} className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-4">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <p className="text-sm font-bold text-white">Order #{order.id}</p>
                      {date && <p className="text-[11px] text-white/30 mt-0.5">{date}</p>}
                    </div>
                    <span className={`text-[11px] font-semibold capitalize ${statusColor}`}>
                      {status === 'inprocess' ? 'In Production' : status}
                    </span>
                  </div>

                  {/* Items */}
                  <div className="space-y-2 mb-3">
                    {(order.items || []).slice(0, 3).map((item, i) => (
                      <div key={i} className="flex items-center space-x-2">
                        {item.product?.image && (
                          <img src={item.product.image} alt="" className="w-9 h-9 rounded-lg object-cover flex-shrink-0" />
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="text-xs text-white/70 truncate">{item.name || item.product?.name}</p>
                          <p className="text-[10px] text-white/30">Qty: {item.quantity}</p>
                        </div>
                        <span className="text-xs font-semibold text-white flex-shrink-0">${parseFloat(item.retail_price || 0).toFixed(2)}</span>
                      </div>
                    ))}
                    {order.items?.length > 3 && (
                      <p className="text-[10px] text-white/20">+{order.items.length - 3} more items</p>
                    )}
                  </div>

                  {/* Shipping info */}
                  {order.shipping_service_name && (
                    <p className="text-[11px] text-white/30 mb-2">
                      Shipping: {order.shipping_service_name}
                      {order.costs?.shipping && ` · $${parseFloat(order.costs.shipping).toFixed(2)}`}
                    </p>
                  )}

                  {/* Total */}
                  <div className="flex items-center justify-between pt-2 border-t border-white/[0.05]">
                    <span className="text-xs text-white/40">Total</span>
                    <span className="text-sm font-bold text-white">
                      ${parseFloat(order.costs?.total || order.retail_costs?.total || 0).toFixed(2)}
                    </span>
                  </div>

                  {/* Tracking */}
                  {order.shipments?.[0]?.tracking_url && (
                    <a href={order.shipments[0].tracking_url} target="_blank" rel="noopener noreferrer"
                      className="mt-2 flex items-center space-x-1 text-[11px] text-purple-400 hover:text-purple-300 transition">
                      <ExternalLink className="w-3 h-3" />
                      <span>Track shipment</span>
                    </a>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
