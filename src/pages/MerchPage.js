/**
 * MerchPage.js
 *
 * Artist merch storefront at /artist/:slug/merch
 * Fetches products via printful-proxy (no tokens on client).
 * Taps into existing artist theme for branding.
 */

import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { supabase } from '../supabaseClient';
import { ArrowLeft, ShoppingBag, Loader, Package, AlertCircle } from 'lucide-react';

const BASE_URL = 'https://www.feelzmachine.com';

async function proxyRequest(action, artistId, params = {}) {
  const res = await fetch('/.netlify/functions/printful-proxy', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, artist_id: artistId, ...params }),
  });
  const json = await res.json();
  if (!json.ok) throw new Error(json.error || 'Failed');
  return json;
}

function PriceRange({ variants }) {
  if (!variants?.length) return null;
  const prices = variants.map(v => parseFloat(v.retail_price || 0)).filter(Boolean);
  if (!prices.length) return null;
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  return (
    <span className="text-sm font-bold text-white">
      {min === max ? `$${min.toFixed(2)}` : `$${min.toFixed(2)} – $${max.toFixed(2)}`}
    </span>
  );
}

export default function MerchPage() {
  const { slug }    = useParams();
  const navigate    = useNavigate();

  const [artist, setArtist]       = useState(null);
  const [products, setProducts]   = useState([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState('');
  const [selected, setSelected]   = useState(null); // selected product for detail view

  useEffect(() => {
    const load = async () => {
      try {
        const { data: artistData } = await supabase
          .from('artists')
          .select('id, artist_name, profile_image_url, slug, merch_enabled, printful_store_id')
          .eq('slug', slug)
          .maybeSingle();

        if (!artistData) { setError('Artist not found'); setLoading(false); return; }
        if (!artistData.merch_enabled) { setError('Merch not available'); setLoading(false); return; }

        setArtist(artistData);

        const { products: prods } = await proxyRequest('get_products', artistData.id);
        setProducts(prods || []);
      } catch (err) {
        setError(err.message);
      }
      setLoading(false);
    };
    load();
  }, [slug]);

  if (loading) return (
    <div className="min-h-screen bg-black flex items-center justify-center">
      <Loader className="w-8 h-8 animate-spin text-white/20" />
    </div>
  );

  if (error) return (
    <div className="min-h-screen bg-black flex flex-col items-center justify-center px-6 text-center">
      <Package className="w-12 h-12 text-white/10 mb-4" />
      <p className="text-white/40 text-sm">{error}</p>
      <button onClick={() => navigate(`/artist/${slug}`)}
        className="mt-4 text-xs text-white/30 hover:text-white/50 transition">← Back to profile</button>
    </div>
  );

  // ── Product detail view ──────────────────────────────────────────────────
  if (selected) {
    return <ProductDetail product={selected} artist={artist} onBack={() => setSelected(null)} />;
  }

  // ── Product grid ─────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-black text-white pb-32">
      <Helmet>
        <link rel="icon" href="/favicon.ico" />
        <link rel="apple-touch-icon" href="/logo192.png" />
        <title>{artist?.artist_name} Merch · Feelz Machine</title>
        <meta property="og:url" content={`${BASE_URL}/artist/${slug}/merch`} />
      </Helmet>

      {/* Header */}
      <div className="sticky top-0 z-20 bg-black/95 backdrop-blur-xl border-b border-white/[0.06] px-4 pt-14 pb-3 md:pt-4 flex items-center space-x-3">
        <button onClick={() => navigate(`/artist/${slug}`)}
          className="w-9 h-9 flex items-center justify-center rounded-full bg-white/[0.06] hover:bg-white/[0.1] transition flex-shrink-0">
          <ArrowLeft className="w-4 h-4 text-white/60" />
        </button>
        <div className="flex-1 min-w-0 flex items-center space-x-2">
          {artist?.profile_image_url && (
            <img src={artist.profile_image_url} alt="" className="w-7 h-7 rounded-full object-cover flex-shrink-0" />
          )}
          <div className="min-w-0">
            <p className="text-sm font-bold text-white truncate">{artist?.artist_name}</p>
            <p className="text-[10px] text-white/40">Merch Store</p>
          </div>
        </div>
        <ShoppingBag className="w-4 h-4 text-white/30" />
      </div>

      <div className="px-4 pt-6">
        {products.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <Package className="w-12 h-12 text-white/10 mb-4" />
            <p className="text-white/30 text-sm">No products available yet</p>
          </div>
        ) : (
          <>
            <h1 className="text-2xl font-bold text-white mb-1">Merch</h1>
            <p className="text-sm text-white/40 mb-6">{products.length} item{products.length !== 1 ? 's' : ''}</p>

            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
              {products.map(product => {
                const thumb = product.thumbnail_url || product.sync_product?.thumbnail_url;
                const name  = product.sync_product?.name || product.name;
                const vars  = product.sync_variants || [];
                return (
                  <button key={product.id || product.sync_product?.id}
                    onClick={() => setSelected(product)}
                    className="text-left group rounded-2xl overflow-hidden border border-white/[0.06] hover:border-white/20 transition bg-white/[0.02] hover:bg-white/[0.04] active:scale-[0.98]">
                    <div className="aspect-square overflow-hidden bg-white/[0.03]">
                      {thumb
                        ? <img src={thumb} alt={name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                        : <div className="w-full h-full flex items-center justify-center"><Package className="w-8 h-8 text-white/10" /></div>
                      }
                    </div>
                    <div className="p-3">
                      <p className="text-sm font-semibold text-white truncate mb-1">{name}</p>
                      <PriceRange variants={vars} />
                    </div>
                  </button>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ── Product Detail + Add to Cart ──────────────────────────────────────────────
function ProductDetail({ product, artist, onBack }) {
  const navigate = useNavigate();
  const name     = product.sync_product?.name || product.name;
  const variants = product.sync_variants || [];
  const images   = product.sync_product?.thumbnail_url ? [product.sync_product.thumbnail_url] : [];

  const [selectedVariant, setSelectedVariant] = useState(variants[0] || null);
  const [qty, setQty]                         = useState(1);
  const [imgIdx, setImgIdx]                   = useState(0);

  // Group variants by option (size, color)
  const sizes = [...new Set(variants.map(v => v.size).filter(Boolean))];

  return (
    <div className="min-h-screen bg-black text-white pb-32">
      {/* Header */}
      <div className="sticky top-0 z-20 bg-black/95 backdrop-blur-xl border-b border-white/[0.06] px-4 pt-14 pb-3 md:pt-4 flex items-center space-x-3">
        <button onClick={onBack}
          className="w-9 h-9 flex items-center justify-center rounded-full bg-white/[0.06] hover:bg-white/[0.1] transition flex-shrink-0">
          <ArrowLeft className="w-4 h-4 text-white/60" />
        </button>
        <p className="text-sm font-bold text-white truncate flex-1">{name}</p>
      </div>

      <div className="px-4 pt-4 max-w-lg mx-auto">
        {/* Image */}
        <div className="aspect-square rounded-2xl overflow-hidden mb-5 bg-white/[0.03] border border-white/[0.06]">
          {images[imgIdx]
            ? <img src={images[imgIdx]} alt={name} className="w-full h-full object-cover" />
            : <div className="w-full h-full flex items-center justify-center"><Package className="w-16 h-16 text-white/10" /></div>
          }
        </div>

        {/* Title + price */}
        <div className="flex items-start justify-between mb-4">
          <h1 className="text-xl font-bold text-white leading-tight flex-1 mr-4">{name}</h1>
          {selectedVariant?.retail_price && (
            <span className="text-xl font-black text-white flex-shrink-0">${parseFloat(selectedVariant.retail_price).toFixed(2)}</span>
          )}
        </div>

        {/* Size selector */}
        {sizes.length > 0 && (
          <div className="mb-5">
            <p className="text-xs font-bold text-white/40 uppercase tracking-wider mb-2">Size</p>
            <div className="flex flex-wrap gap-2">
              {sizes.map(size => {
                const v = variants.find(vv => vv.size === size);
                const isSelected = selectedVariant?.size === size;
                return (
                  <button key={size} onClick={() => setSelectedVariant(v)}
                    className={`px-3 py-1.5 rounded-lg text-sm font-semibold border transition ${
                      isSelected
                        ? 'bg-white text-black border-white'
                        : 'bg-white/[0.04] text-white/50 border-white/[0.08] hover:bg-white/[0.08]'
                    }`}>
                    {size}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Quantity */}
        <div className="mb-6">
          <p className="text-xs font-bold text-white/40 uppercase tracking-wider mb-2">Quantity</p>
          <div className="flex items-center space-x-3">
            <button onClick={() => setQty(q => Math.max(1, q - 1))}
              className="w-9 h-9 rounded-xl bg-white/[0.06] flex items-center justify-center text-white text-lg font-bold hover:bg-white/[0.1] transition">−</button>
            <span className="text-base font-bold text-white w-8 text-center">{qty}</span>
            <button onClick={() => setQty(q => Math.min(10, q + 1))}
              className="w-9 h-9 rounded-xl bg-white/[0.06] flex items-center justify-center text-white text-lg font-bold hover:bg-white/[0.1] transition">+</button>
          </div>
        </div>

        {/* Checkout CTA */}
        <button
          onClick={() => navigate(`/artist/${artist.slug}/merch/checkout`, {
            state: { artist, product, variant: selectedVariant, quantity: qty }
          })}
          disabled={!selectedVariant}
          className="w-full py-4 rounded-2xl text-sm font-bold text-white transition active:scale-[0.98] disabled:opacity-40"
          style={{ background: 'linear-gradient(135deg, #a78bfa, #7c3aed)' }}>
          Buy Now · {selectedVariant?.retail_price ? `$${(parseFloat(selectedVariant.retail_price) * qty).toFixed(2)}` : 'Select size'}
        </button>

        <p className="text-[10px] text-white/20 text-center mt-3">
          Fulfilled and shipped by Printful · Powered by Feelz Machine
        </p>
      </div>
    </div>
  );
}