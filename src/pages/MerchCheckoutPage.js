/**
 * MerchCheckoutPage.js
 *
 * Collects shipping details and creates a Printful order.
 * Route: /artist/:slug/merch/checkout
 * Receives: { artist, product, variant, quantity } via location.state
 */

import React, { useState } from 'react';
import { useNavigate, useLocation, useParams } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { supabase } from '../supabaseClient';
import { ArrowLeft, Check, Loader, AlertCircle } from 'lucide-react';

async function createOrder(artistId, payload) {
  const res = await fetch('/.netlify/functions/printful-proxy', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'create_order', artist_id: artistId, ...payload }),
  });
  const json = await res.json();
  if (!json.ok) throw new Error(json.error || 'Order failed');
  return json;
}

const FIELD = ({ label, name, value, onChange, placeholder, type = 'text', half }) => (
  <div className={half ? 'flex-1 min-w-0' : 'w-full'}>
    <label className="block text-[10px] font-bold text-white/40 uppercase tracking-wider mb-1">{label}</label>
    <input type={type} name={name} value={value} onChange={onChange} placeholder={placeholder}
      className="w-full px-3 py-2.5 bg-white/[0.06] rounded-xl text-white text-sm outline-none border border-white/[0.06] focus:border-white/20 transition placeholder-white/15" />
  </div>
);

export default function MerchCheckoutPage() {
  const navigate    = useNavigate();
  const location    = useLocation();
  const { slug }    = useParams();

  const { artist, product, variant, quantity } = location.state || {};

  const [form, setForm] = useState({
    email: '', first_name: '', last_name: '',
    address1: '', address2: '',
    city: '', state_code: '', zip: '', country_code: 'US',
  });
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess]       = useState(false);
  const [error, setError]           = useState('');

  if (!artist || !variant) {
    return (
      <div className="min-h-screen bg-black flex flex-col items-center justify-center px-6 text-center">
        <p className="text-white/40 text-sm">Nothing to check out.</p>
        <button onClick={() => navigate(`/artist/${slug}/merch`)}
          className="mt-4 text-xs text-white/30 hover:text-white/50 transition">← Back to merch</button>
      </div>
    );
  }

  const handleChange = e => setForm(f => ({ ...f, [e.target.name]: e.target.value }));

  const handleSubmit = async () => {
    const required = ['email', 'first_name', 'last_name', 'address1', 'city', 'zip', 'country_code'];
    const missing  = required.filter(k => !form[k].trim());
    if (missing.length) { setError('Please fill in all required fields.'); return; }

    setSubmitting(true);
    setError('');
    try {
      await createOrder(artist.id, {
        email: form.email,
        shipping_address: {
          name:         `${form.first_name} ${form.last_name}`,
          address1:     form.address1,
          address2:     form.address2 || undefined,
          city:         form.city,
          state_code:   form.state_code || undefined,
          zip:          form.zip,
          country_code: form.country_code,
        },
        items: [{ variant_id: variant.id, quantity }],
      });
      setSuccess(true);
    } catch (err) {
      setError(err.message);
    }
    setSubmitting(false);
  };

  const name      = product?.sync_product?.name || product?.name || 'Item';
  const price     = (parseFloat(variant.retail_price || 0) * quantity).toFixed(2);
  const thumbUrl  = product?.sync_product?.thumbnail_url;

  if (success) return (
    <div className="min-h-screen bg-black flex flex-col items-center justify-center px-6 text-center">
      <Helmet><title>Order Placed · Feelz Machine</title><link rel="icon" href="/favicon.ico" /><link rel="apple-touch-icon" href="/logo192.png" /></Helmet>
      <div className="w-16 h-16 rounded-full bg-green-500/15 flex items-center justify-center mb-4">
        <Check className="w-8 h-8 text-green-400" />
      </div>
      <h1 className="text-xl font-bold text-white mb-2">Order placed!</h1>
      <p className="text-sm text-white/50 mb-1">Printful will handle printing and shipping.</p>
      <p className="text-xs text-white/30 mb-6">A confirmation will be sent to {form.email}</p>
      <button onClick={() => navigate(`/artist/${slug}/merch`)}
        className="px-6 py-2.5 bg-white text-black rounded-xl text-sm font-semibold">
        Back to Merch
      </button>
    </div>
  );

  return (
    <div className="min-h-screen bg-black text-white pb-32">
      <Helmet><title>Checkout · Feelz Machine</title><link rel="icon" href="/favicon.ico" /><link rel="apple-touch-icon" href="/logo192.png" /></Helmet>

      {/* Header */}
      <div className="sticky top-0 z-20 bg-black/95 backdrop-blur-xl border-b border-white/[0.06] px-4 pt-14 pb-3 md:pt-4 flex items-center space-x-3">
        <button onClick={() => navigate(-1)}
          className="w-9 h-9 flex items-center justify-center rounded-full bg-white/[0.06] hover:bg-white/[0.1] transition flex-shrink-0">
          <ArrowLeft className="w-4 h-4 text-white/60" />
        </button>
        <p className="text-sm font-bold text-white">Checkout</p>
      </div>

      <div className="px-4 pt-5 max-w-lg mx-auto space-y-5">

        {/* Order summary */}
        <div className="rounded-2xl p-4 flex items-center space-x-3 border border-white/[0.06] bg-white/[0.02]">
          <div className="w-14 h-14 rounded-xl overflow-hidden bg-white/[0.04] flex-shrink-0">
            {thumbUrl
              ? <img src={thumbUrl} alt={name} className="w-full h-full object-cover" />
              : <div className="w-full h-full bg-white/[0.04]" />
            }
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-white truncate">{name}</p>
            <p className="text-xs text-white/40 mt-0.5">{variant.size ? `Size: ${variant.size} · ` : ''}Qty: {quantity}</p>
          </div>
          <p className="text-sm font-bold text-white flex-shrink-0">${price}</p>
        </div>

        {/* Shipping form */}
        <div className="space-y-3">
          <p className="text-xs font-bold text-white/40 uppercase tracking-wider">Shipping Details</p>

          <FIELD label="Email *" name="email" value={form.email} onChange={handleChange} placeholder="your@email.com" type="email" />

          <div className="flex space-x-2">
            <FIELD label="First name *" name="first_name" value={form.first_name} onChange={handleChange} placeholder="John" half />
            <FIELD label="Last name *"  name="last_name"  value={form.last_name}  onChange={handleChange} placeholder="Doe" half />
          </div>

          <FIELD label="Address *"  name="address1" value={form.address1} onChange={handleChange} placeholder="123 Main St" />
          <FIELD label="Apt / Suite" name="address2" value={form.address2} onChange={handleChange} placeholder="Apt 4B (optional)" />

          <div className="flex space-x-2">
            <FIELD label="City *" name="city" value={form.city} onChange={handleChange} placeholder="New York" half />
            <FIELD label="State"  name="state_code" value={form.state_code} onChange={handleChange} placeholder="NY" half />
          </div>

          <div className="flex space-x-2">
            <FIELD label="ZIP *"    name="zip"          value={form.zip}          onChange={handleChange} placeholder="10001" half />
            <FIELD label="Country *" name="country_code" value={form.country_code} onChange={handleChange} placeholder="US" half />
          </div>
        </div>

        {error && (
          <div className="rounded-xl p-3 flex items-start space-x-2" style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)' }}>
            <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-red-300">{error}</p>
          </div>
        )}

        <button onClick={handleSubmit} disabled={submitting}
          className="w-full py-4 rounded-2xl text-sm font-bold text-white transition active:scale-[0.98] disabled:opacity-50 flex items-center justify-center space-x-2"
          style={{ background: 'linear-gradient(135deg, #a78bfa, #7c3aed)' }}>
          {submitting ? <Loader className="w-4 h-4 animate-spin" /> : null}
          <span>{submitting ? 'Placing order...' : `Place Order · $${price}`}</span>
        </button>

        <p className="text-[10px] text-white/15 text-center pb-4">
          By ordering you agree to Printful's terms. Orders are non-refundable once in production.
          Shipping times vary by location.
        </p>
      </div>
    </div>
  );
}