/**
 * src/pages/MerchCheckoutPage.js
 * Shipping details, live shipping options with the full price, then PayPal.
 *
 * The buyer pays the artist's own PayPal first (netlify/functions/merch-order.js),
 * and only once PayPal confirms the payment does the order go to Printful for
 * printing. The old page sent the order to Printful without taking any payment.
 */

import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import useGoBack from '../hooks/useGoBack';
import { Helmet } from 'react-helmet-async';
import { useAuth } from '../contexts/AuthContext';
import { ArrowLeft, Loader, Truck, Check, Package, ChevronDown } from 'lucide-react';

const COUNTRIES = [
  { code: 'ZA', name: 'South Africa' },
  { code: 'US', name: 'United States' },
  { code: 'GB', name: 'United Kingdom' },
  { code: 'CA', name: 'Canada' },
  { code: 'AU', name: 'Australia' },
  { code: 'NG', name: 'Nigeria' },
  { code: 'GH', name: 'Ghana' },
  { code: 'KE', name: 'Kenya' },
  { code: 'DE', name: 'Germany' },
  { code: 'FR', name: 'France' },
  { code: 'NL', name: 'Netherlands' },
  { code: 'SE', name: 'Sweden' },
  { code: 'NO', name: 'Norway' },
  { code: 'NZ', name: 'New Zealand' },
  { code: 'JP', name: 'Japan' },
  { code: 'BR', name: 'Brazil' },
];

const PAYPAL_CLIENT_ID = process.env.REACT_APP_PAYPAL_CLIENT_ID;

async function merchRequest(action, params = {}) {
  const headers = { 'Content-Type': 'application/json' };
  try {
    const { supabase } = await import('../supabaseClient');
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.access_token) headers.Authorization = `Bearer ${session.access_token}`;
  } catch { /* signed out is fine */ }
  const res = await fetch('/.netlify/functions/merch-order', {
    method: 'POST', headers, body: JSON.stringify({ action, ...params }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.ok === false) throw new Error(json.error || 'Request failed');
  return json;
}

export default function MerchCheckoutPage() {

  const location = useLocation();
  const navigate  = useNavigate();
  // Back that works on a cold deep link. navigate(-1) does nothing when
  // this page IS the first history entry, which is every shared link and
  // every tapped push notification. See src/hooks/useGoBack.js.
  const goBack = useGoBack('/browse');
  const { user }  = useAuth();

  const { artist, product, variant, quantity } = location.state || {};

  const [form, setForm] = useState({
    name: '', email: user?.email || '', phone: '',
    address1: '', address2: '', city: '', state_code: '',
    country_code: 'ZA', zip: '',
  });

  const [shippingRates,    setShippingRates]    = useState([]);
  const [selectedRate,     setSelectedRate]     = useState(null);
  const [ratesLoading,     setRatesLoading]     = useState(false);
  const [ratesError,       setRatesError]       = useState('');
  const [paypalReady,      setPaypalReady]      = useState(false);
  const [orderConfirmed,   setOrderConfirmed]   = useState(null); // order object
  const [error,            setError]            = useState('');

  const set = (key, val) => setForm(p => ({ ...p, [key]: val }));

  const addressComplete = form.name && form.email && form.address1 && form.city && form.country_code && form.zip;

  const fetchRates = async () => {
    if (!addressComplete || !variant || ratesLoading) return;
    setRatesLoading(true);
    setRatesError('');
    setShippingRates([]);
    setSelectedRate(null);
    try {
      const { rates } = await merchRequest('rates', {
        artist_id: artist.id,
        variant_id: variant.id,
        quantity,
        shipping_address: {
          name:         form.name,
          address1:     form.address1,
          city:         form.city,
          state_code:   form.state_code || undefined,
          country_code: form.country_code,
          zip:          form.zip,
        },
      });
      setShippingRates(rates || []);
      if (rates?.length) setSelectedRate(rates[0]);
    } catch (err) {
      setRatesError(err.message || 'Could not get shipping options for that address.');
    }
    setRatesLoading(false);
  };

  // PayPal: load once.
  useEffect(() => {
    if (window.paypal) { setPaypalReady(true); return; }
    const existing = document.getElementById('paypal-sdk-merch');
    if (existing) { existing.addEventListener('load', () => setPaypalReady(true)); return; }
    const script = document.createElement('script');
    script.id = 'paypal-sdk-merch';
    script.src = `https://www.paypal.com/sdk/js?client-id=${PAYPAL_CLIENT_ID}&currency=USD&intent=capture`;
    script.async = true;
    script.onload = () => setPaypalReady(true);
    script.onerror = () => setError('PayPal did not load. Refresh and try again.');
    document.head.appendChild(script);
  }, []);

  // PayPal buttons appear once there is an address and a shipping option,
  // and are rebuilt if either changes so the order always matches the screen.
  const canPay = addressComplete && !!selectedRate;
  useEffect(() => {
    if (!paypalReady || !canPay || !window.paypal || !artist || !variant) return;
    const container = document.getElementById('paypal-merch-container');
    if (!container) return;
    container.innerHTML = '';
    let cancelled = false;

    window.paypal.Buttons({
      style: { layout: 'vertical', color: 'gold', shape: 'rect', label: 'pay' },
      createOrder: async () => {
        setError('');
        try {
          const res = await merchRequest('create', {
            artist_id: artist.id,
            variant_id: variant.id,
            quantity,
            shipping_method: selectedRate.id,
            email: form.email,
            shipping_address: {
              name: form.name, phone: form.phone || undefined,
              address1: form.address1, address2: form.address2 || undefined,
              city: form.city, state_code: form.state_code || undefined,
              country_code: form.country_code, zip: form.zip,
            },
          });
          return res.orderID;
        } catch (err) {
          setError(err.message);
          throw err;
        }
      },
      onApprove: async (data) => {
        try {
          const res = await merchRequest('capture', { orderID: data.orderID });
          if (!cancelled) setOrderConfirmed(res.order || { id: null });
        } catch (err) {
          setError(err.message);
        }
      },
      onError: () => setError('The payment did not go through. Nothing was charged.'),
    }).render(container).catch(() => {});

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paypalReady, canPay, selectedRate?.id, form.email, form.name, form.address1, form.address2, form.city, form.state_code, form.country_code, form.zip, quantity]);

  // ── Order confirmed screen ──────────────────────────────────────────────────
  if (orderConfirmed) {
    return (
      <div className="min-h-screen bg-black flex flex-col items-center justify-center px-6 text-center pb-20">
        <Helmet>
          <title>Order Placed · Feelz Machine</title>
          <link rel="icon" href="/favicon.ico" />
          <link rel="apple-touch-icon" href="/logo192.png" />
        </Helmet>
        <div className="w-16 h-16 rounded-full bg-green-500/20 flex items-center justify-center mb-5">
          <Check className="w-8 h-8 text-green-400" />
        </div>
        <h2 className="text-2xl font-bold text-white mb-2">Order placed!</h2>
        <p className="text-sm text-white/40 mb-6">
          {orderConfirmed.status === 'in_production'
            ? 'Paid and sent to print. The artist has been paid directly.'
            : 'Paid. The artist has been paid directly and is getting your order to print.'}
        </p>

        {/* Order summary */}
        <div className="w-full max-w-sm bg-white/[0.03] border border-white/[0.06] rounded-2xl p-4 mb-6 text-left">
          <div className="flex items-center space-x-3">
            {product?.sync_product?.thumbnail_url && (
              <img src={product.sync_product.thumbnail_url} alt="" className="w-14 h-14 rounded-xl object-cover" />
            )}
            <div>
              <p className="text-sm font-semibold text-white">{product?.sync_product?.name || product?.name}</p>
              <p className="text-xs text-white/40 mt-0.5">
                {variant?.size && `Size: ${variant.size}`}
                {variant?.color && ` · ${variant.color}`}
                {quantity > 1 && ` · Qty: ${quantity}`}
              </p>
              {selectedRate && (
                <p className="text-xs text-white/30 mt-0.5">
                  Shipping: {selectedRate.name}, ${Number(selectedRate.shippingCost).toFixed(2)}
                </p>
              )}
            </div>
          </div>
          <div className="mt-3 pt-3 border-t border-white/[0.06] flex justify-between">
            <span className="text-xs text-white/40">Paid</span>
            <span className="text-sm font-bold text-white">
              ${Number(selectedRate?.buyerPays || 0).toFixed(2)}
            </span>
          </div>
        </div>

        <div className="flex flex-col items-center space-y-2 text-xs text-white/30">
          <p>Order #{orderConfirmed.id ? String(orderConfirmed.id).slice(0, 8) : ''}. Keep this for any questions.</p>
        </div>

        <button onClick={() => navigate(`/artist/${artist?.slug}/merch`)}
          className="mt-8 px-6 py-3 rounded-xl bg-white/[0.06] text-sm text-white/60 hover:bg-white/[0.1] transition">
          Back to merch
        </button>
      </div>
    );
  }

  if (!artist || !variant) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <p className="text-white/30 text-sm">Nothing to checkout</p>
      </div>
    );
  }

  const productName = product?.sync_product?.name || product?.name;
  const itemTotal   = parseFloat(variant.retail_price || 0) * quantity;
  const shippingCost = selectedRate ? Number(selectedRate.shippingCost) : null;
  const serviceFee   = selectedRate ? Number(selectedRate.serviceFee) : null;
  const grandTotal   = selectedRate ? Number(selectedRate.buyerPays) : null;

  return (
    <div className="min-h-screen bg-black text-white pb-32">
      <Helmet>
        <title>Checkout · Feelz Machine</title>
        <link rel="icon" href="/favicon.ico" />
        <link rel="apple-touch-icon" href="/logo192.png" />
      </Helmet>

      {/* Header */}
      <div className="sticky top-0 z-20 bg-black/95 backdrop-blur-xl border-b border-white/[0.06] px-4 pt-14 pb-3 md:pt-4 flex items-center space-x-3">
        <button onClick={() => goBack()}
          className="w-9 h-9 flex items-center justify-center rounded-full bg-white/[0.06] hover:bg-white/[0.1] transition flex-shrink-0">
          <ArrowLeft className="w-4 h-4 text-white/60" />
        </button>
        <p className="text-sm font-bold text-white">Checkout</p>
      </div>

      <div className="px-4 pt-5 max-w-lg mx-auto space-y-5">

        {/* Order summary */}
        <div className="flex items-center space-x-3 p-3.5 rounded-xl bg-white/[0.03] border border-white/[0.06]">
          {product?.sync_product?.thumbnail_url && (
            <img src={product.sync_product.thumbnail_url} alt="" className="w-14 h-14 rounded-xl object-cover flex-shrink-0" />
          )}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-white truncate">{productName}</p>
            <p className="text-xs text-white/40 mt-0.5">
              {variant.size && `Size: ${variant.size}`}
              {variant.color && ` · ${variant.color}`}
              {quantity > 1 && ` · Qty: ${quantity}`}
            </p>
            <p className="text-sm font-bold text-white mt-1">${itemTotal.toFixed(2)}</p>
          </div>
        </div>

        {/* Shipping form */}
        <div className="space-y-3">
          <p className="text-xs font-bold text-white/40 uppercase tracking-wider">Shipping Details</p>

          <input value={form.name} onChange={e => set('name', e.target.value)}
            placeholder="Full name *" className="w-full input-field" />
          <input value={form.email} onChange={e => set('email', e.target.value)}
            placeholder="Email *" type="email" className="w-full input-field" />
          <input value={form.phone} onChange={e => set('phone', e.target.value)}
            placeholder="Phone (optional)" type="tel" className="w-full input-field" />
          <input value={form.address1} onChange={e => set('address1', e.target.value)}
            placeholder="Address line 1 *" className="w-full input-field" />
          <input value={form.address2} onChange={e => set('address2', e.target.value)}
            placeholder="Address line 2 (optional)" className="w-full input-field" />
          <div className="grid grid-cols-2 gap-2">
            <input value={form.city} onChange={e => set('city', e.target.value)}
              placeholder="City *" className="input-field" />
            <input value={form.state_code} onChange={e => set('state_code', e.target.value)}
              placeholder="State / Province" className="input-field" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="relative">
              <select value={form.country_code} onChange={e => set('country_code', e.target.value)}
                className="w-full input-field appearance-none pr-8">
                {COUNTRIES.map(c => <option key={c.code} value={c.code}>{c.name}</option>)}
              </select>
              <ChevronDown className="w-4 h-4 text-white/30 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>
            <input value={form.zip} onChange={e => set('zip', e.target.value)}
              placeholder="Postal code *" className="input-field" />
          </div>
        </div>

        {/* Shipping rates */}
        <div>
          <button
            onClick={fetchRates}
            disabled={!addressComplete || ratesLoading}
            className="w-full py-2.5 rounded-xl bg-white/[0.05] border border-white/[0.08] text-sm text-white/60 hover:bg-white/[0.08] transition disabled:opacity-40 flex items-center justify-center space-x-2"
          >
            {ratesLoading
              ? <><Loader className="w-4 h-4 animate-spin" /><span>Getting shipping options</span></>
              : <><Truck className="w-4 h-4" /><span>Estimate shipping</span></>}
          </button>

          {ratesError && <p className="text-xs text-orange-400/70 mt-2 text-center">{ratesError}</p>}

          {shippingRates.length > 0 && (
            <div className="mt-3 space-y-2">
              <p className="text-xs font-bold text-white/40 uppercase tracking-wider">Shipping options</p>
              {shippingRates.map(rate => (
                <button key={rate.id}
                  onClick={() => setSelectedRate(rate)}
                  className={`w-full flex items-center justify-between p-3 rounded-xl border transition text-left ${
                    selectedRate?.id === rate.id
                      ? 'bg-white/[0.06] border-white/20'
                      : 'bg-white/[0.02] border-white/[0.06] hover:bg-white/[0.04]'
                  }`}>
                  <div>
                    <p className="text-sm font-semibold text-white">{rate.name}</p>
                    <p className="text-[11px] text-white/30 mt-0.5">
                      {rate.minDeliveryDays && rate.maxDeliveryDays
                        ? `Est. ${rate.minDeliveryDays}–${rate.maxDeliveryDays} business days`
                        : 'Delivery time varies'}
                    </p>
                  </div>
                  <div className="flex items-center space-x-2">
                    <span className="text-sm font-bold text-white">${Number(rate.shippingCost).toFixed(2)}</span>
                    {selectedRate?.id === rate.id && <Check className="w-4 h-4 text-green-400" />}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Order total */}
        <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-4 space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-white/40">Items</span>
            <span className="text-white font-medium">${itemTotal.toFixed(2)}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-white/40">Shipping</span>
            <span className="text-white font-medium">
              {shippingCost !== null ? `$${shippingCost.toFixed(2)}` : 'Choose an option'}
            </span>
          </div>
          {serviceFee !== null && serviceFee > 0 && (
            <div className="flex justify-between text-sm">
              <span className="text-white/40">Payment processing (PayPal)</span>
              <span className="text-white font-medium">${serviceFee.toFixed(2)}</span>
            </div>
          )}
          <div className="flex justify-between text-sm border-t border-white/[0.06] pt-2">
            <span className="text-white font-semibold">Total</span>
            <span className="text-white font-bold text-base">
              {grandTotal !== null ? `$${grandTotal.toFixed(2)}` : `$${itemTotal.toFixed(2)} + shipping`}
            </span>
          </div>
        </div>

        {error && (
          <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-sm text-red-400 text-center">
            {error}
          </div>
        )}

        {/* Pay: straight to the artist's PayPal, card or PayPal account */}
        {canPay ? (
          <div className="space-y-2">
            {!paypalReady && (
              <div className="flex items-center justify-center py-4 text-white/40 text-sm">
                <Loader className="w-4 h-4 animate-spin mr-2" />Loading payment
              </div>
            )}
            <div id="paypal-merch-container" />
          </div>
        ) : (
          <div className="w-full py-4 rounded-2xl text-sm font-semibold text-white/40 bg-white/[0.04] flex items-center justify-center space-x-2">
            <Package className="w-4 h-4" /><span>Add your address and pick shipping to pay</span>
          </div>
        )}

        <p className="text-[10px] text-white/25 text-center leading-relaxed">
          You pay the artist directly. Your order goes to print only after the payment clears,
          and it cannot be changed once it is in production.
        </p>
      </div>

      <style>{`
        .input-field {
          background: rgba(255,255,255,0.04);
          border: 1px solid rgba(255,255,255,0.08);
          border-radius: 0.75rem;
          padding: 0.625rem 0.875rem;
          font-size: 0.875rem;
          color: white;
          width: 100%;
          outline: none;
          transition: border-color 0.15s;
        }
        .input-field::placeholder { color: rgba(255,255,255,0.2); }
        .input-field:focus { border-color: rgba(255,255,255,0.25); }
        .input-field option { background: #111; color: white; }
      `}</style>
    </div>
  );
}