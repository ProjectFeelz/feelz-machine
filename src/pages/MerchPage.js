/**
 * MerchPage.js — Artist merch storefront at /artist/:slug/merch
 * Improvements: skeleton loader, variant front/back image switcher,
 * product description, out-of-stock disabling, category filter,
 * share button, removed dead ShoppingBag icon, "New" badge.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { supabase } from '../supabaseClient';
import { useAuth } from '../contexts/AuthContext';
import {
  ArrowLeft, Loader, Package, ChevronRight,
  Truck, History, Share2, ChevronLeft, Tag,
} from 'lucide-react';

const BASE_URL = 'https://www.feelzmachine.com';

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

function PriceRange({ variants }) {
  const prices = (variants || []).map(v => parseFloat(v.retail_price || 0)).filter(Boolean);
  if (!prices.length) return null;
  const min = Math.min(...prices), max = Math.max(...prices);
  return (
    <span className="text-sm font-bold text-white">
      {min === max ? `$${min.toFixed(2)}` : `$${min.toFixed(2)} – $${max.toFixed(2)}`}
    </span>
  );
}

// ── Skeleton ──────────────────────────────────────────────────────────────────
function MerchSkeleton() {
  return (
    <div className="min-h-screen bg-black text-white pb-32">
      <div className="sticky top-0 z-20 bg-black/95 backdrop-blur-xl border-b border-white/[0.06] px-4 pt-14 pb-3 md:pt-4 h-16" />
      <div className="px-4 pt-6">
        <div className="h-7 w-24 rounded-lg bg-white/[0.06] mb-2" style={{ animation: 'merch-shimmer 1.4s infinite' }} />
        <div className="h-4 w-16 rounded bg-white/[0.04] mb-6" />
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
          {[1,2,3,4].map(i => (
            <div key={i} className="rounded-2xl overflow-hidden border border-white/[0.06]">
              <div className="aspect-square bg-white/[0.04]" style={{ animation: 'merch-shimmer 1.4s infinite', animationDelay: `${i * 0.1}s` }} />
              <div className="p-3 space-y-2">
                <div className="h-4 rounded bg-white/[0.06] w-3/4" />
                <div className="h-3 rounded bg-white/[0.04] w-1/3" />
              </div>
            </div>
          ))}
        </div>
      </div>
      <style>{`
        @keyframes merch-shimmer {
          0%   { opacity: 0.5; }
          50%  { opacity: 1; }
          100% { opacity: 0.5; }
        }
      `}</style>
    </div>
  );
}

// ── Product Detail ────────────────────────────────────────────────────────────
function ProductDetail({ product, artist, onBack }) {
  const navigate  = useNavigate();
  const name      = product.sync_product?.name || product.name;
  const variants  = product.sync_variants || [];
  const desc      = product.sync_product?.description || product.description || '';
  const createdAt = product.sync_product?.created;
  const isNew     = createdAt && (Date.now() / 1000 - createdAt) < 30 * 24 * 3600;

  // Build colour groups
  const colourMap = {};
  variants.forEach(v => {
    const colour = v.color || v.option_value || 'Default';
    if (!colourMap[colour]) colourMap[colour] = [];
    colourMap[colour].push(v);
  });
  const colours = Object.keys(colourMap);
  const sizes   = [...new Set(variants.map(v => v.size).filter(Boolean))];

  const [selectedColour,  setSelectedColour]  = useState(colours[0] || null);
  const [selectedVariant, setSelectedVariant] = useState(variants[0] || null);
  const [qty,             setQty]             = useState(1);
  const [imageIdx,        setImageIdx]        = useState(0);
  const [shared,          setShared]          = useState(false);

  // Build image gallery from variant files
  const variantFiles = selectedVariant?.files || [];
  const gallery = [
    ...variantFiles.filter(f => f.type === 'preview').map(f => f.preview_url),
    ...variantFiles.filter(f => f.type !== 'preview' && f.preview_url).map(f => f.preview_url),
  ].filter(Boolean);
  if (!gallery.length && product.sync_product?.thumbnail_url) {
    gallery.push(product.sync_product.thumbnail_url);
  }
  const currentImage = gallery[imageIdx] || gallery[0];

  const selectVariant = useCallback((colour, size) => {
    const pool = colourMap[colour] || variants;
    const match = pool.find(v => v.size === size) || pool[0];
    setSelectedColour(colour);
    setSelectedVariant(match);
    setImageIdx(0); // reset to first image when variant changes
  }, [variants]); // eslint-disable-line

  const isOutOfStock = (v) => v?.availability_status && v.availability_status !== 'active';

  const handleShare = async () => {
    const url = `${BASE_URL}/artist/${artist.slug}/merch`;
    try {
      if (navigator.share) {
        await navigator.share({ title: name, text: `Check out ${name} from ${artist.artist_name}`, url });
      } else {
        await navigator.clipboard.writeText(url);
        setShared(true);
        setTimeout(() => setShared(false), 2000);
      }
    } catch {}
  };

  return (
    <div className="min-h-screen bg-black text-white pb-32">
      <div className="sticky top-0 z-20 bg-black/95 backdrop-blur-xl border-b border-white/[0.06] px-4 pt-14 pb-3 md:pt-4 flex items-center space-x-3">
        <button onClick={onBack}
          className="w-9 h-9 flex items-center justify-center rounded-full bg-white/[0.06] hover:bg-white/[0.1] transition flex-shrink-0">
          <ArrowLeft className="w-4 h-4 text-white/60" />
        </button>
        <p className="text-sm font-bold text-white truncate flex-1">{name}</p>
        <button onClick={handleShare}
          className="w-9 h-9 flex items-center justify-center rounded-full bg-white/[0.06] hover:bg-white/[0.1] transition flex-shrink-0">
          {shared
            ? <span className="text-[10px] text-green-400 font-bold">✓</span>
            : <Share2 className="w-4 h-4 text-white/40" />}
        </button>
      </div>

      <div className="px-4 pt-4 max-w-lg mx-auto">

        {/* Main image */}
        <div className="aspect-square rounded-2xl overflow-hidden mb-3 bg-white/[0.03] border border-white/[0.06] relative">
          {currentImage
            ? <img src={currentImage} alt={name} className="w-full h-full object-cover transition-opacity duration-300" />
            : <div className="w-full h-full flex items-center justify-center"><Package className="w-16 h-16 text-white/10" /></div>}
          {isNew && (
            <div className="absolute top-3 left-3 px-2 py-0.5 rounded-full text-[10px] font-bold"
              style={{ background: 'rgba(139,92,246,0.9)', color: '#fff' }}>
              NEW
            </div>
          )}
          {/* Prev/Next arrows for gallery */}
          {gallery.length > 1 && (
            <>
              <button onClick={() => setImageIdx(i => (i - 1 + gallery.length) % gallery.length)}
                className="absolute left-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full flex items-center justify-center transition"
                style={{ background: 'rgba(0,0,0,0.5)' }}>
                <ChevronLeft className="w-4 h-4 text-white" />
              </button>
              <button onClick={() => setImageIdx(i => (i + 1) % gallery.length)}
                className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full flex items-center justify-center transition"
                style={{ background: 'rgba(0,0,0,0.5)' }}>
                <ChevronRight className="w-4 h-4 text-white" />
              </button>
            </>
          )}
        </div>

        {/* Thumbnail strip */}
        {gallery.length > 1 && (
          <div className="flex space-x-2 mb-5 overflow-x-auto scrollbar-hide">
            {gallery.map((src, i) => (
              <button key={i} onClick={() => setImageIdx(i)}
                className="flex-shrink-0 w-14 h-14 rounded-xl overflow-hidden border-2 transition"
                style={{ borderColor: i === imageIdx ? 'rgba(255,255,255,0.8)' : 'rgba(255,255,255,0.1)' }}>
                <img src={src} alt="" className="w-full h-full object-cover" />
              </button>
            ))}
          </div>
        )}

        {/* Title + price */}
        <div className="flex items-start justify-between mb-3">
          <h1 className="text-xl font-bold text-white leading-tight flex-1 mr-4">{name}</h1>
          {selectedVariant?.retail_price && (
            <span className="text-xl font-black text-white flex-shrink-0">
              ${(parseFloat(selectedVariant.retail_price) * qty).toFixed(2)}
            </span>
          )}
        </div>

        {/* Description */}
        {desc && (
          <p className="text-sm text-white/50 leading-relaxed mb-5">{desc}</p>
        )}

        {/* Colour selector */}
        {colours.length > 1 && (
          <div className="mb-5">
            <p className="text-xs font-bold text-white/40 uppercase tracking-wider mb-2">
              Colour — <span className="text-white/60 font-normal normal-case">{selectedColour}</span>
            </p>
            <div className="flex flex-wrap gap-2">
              {colours.map(colour => {
                const v = colourMap[colour]?.[0];
                const hex = v?.color_code || v?.color_code2 || null;
                const isSelected = selectedColour === colour;
                const oos = colourMap[colour]?.every(isOutOfStock);
                return (
                  <button key={colour}
                    onClick={() => !oos && selectVariant(colour, selectedVariant?.size)}
                    title={colour}
                    disabled={oos}
                    className={`w-8 h-8 rounded-full border-2 transition active:scale-90 ${
                      oos ? 'opacity-30 cursor-not-allowed' :
                      isSelected ? 'border-white scale-110' : 'border-transparent hover:border-white/40'
                    }`}
                    style={hex ? { backgroundColor: hex } : { background: 'rgba(255,255,255,0.08)' }}>
                    {!hex && <span className="text-[8px] text-white/50 truncate block px-0.5">{colour.slice(0,2)}</span>}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Size selector */}
        {sizes.length > 0 && (
          <div className="mb-5">
            <p className="text-xs font-bold text-white/40 uppercase tracking-wider mb-2">Size</p>
            <div className="flex flex-wrap gap-2">
              {sizes.map(size => {
                const v = (colourMap[selectedColour] || variants).find(x => x.size === size);
                const isSelected = selectedVariant?.size === size;
                const oos = isOutOfStock(v);
                return (
                  <button key={size}
                    onClick={() => !oos && selectVariant(selectedColour, size)}
                    disabled={oos}
                    className={`px-3 py-1.5 rounded-lg text-sm font-semibold border transition relative ${
                      oos
                        ? 'opacity-30 cursor-not-allowed bg-white/[0.02] text-white/30 border-white/[0.05]'
                        : isSelected
                          ? 'bg-white text-black border-white'
                          : 'bg-white/[0.04] text-white/50 border-white/[0.08] hover:bg-white/[0.08]'
                    }`}>
                    {size}
                    {oos && <span className="block text-[8px] leading-tight">sold out</span>}
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

        {/* Shipping note */}
        <div className="flex items-center space-x-2 mb-4 p-3 rounded-xl bg-white/[0.03] border border-white/[0.05]">
          <Truck className="w-4 h-4 text-white/30 flex-shrink-0" />
          <p className="text-xs text-white/40">Shipping calculated at checkout based on your location</p>
        </div>

        {/* Buy Now */}
        <button
          onClick={() => navigate(`/artist/${artist.slug}/merch/checkout`, {
            state: { artist, product, variant: selectedVariant, quantity: qty }
          })}
          disabled={!selectedVariant || isOutOfStock(selectedVariant)}
          className="w-full py-4 rounded-2xl text-sm font-bold text-white transition active:scale-[0.98] disabled:opacity-40"
          style={{ background: 'linear-gradient(135deg, #a78bfa, #7c3aed)' }}>
          {isOutOfStock(selectedVariant)
            ? 'Out of Stock'
            : `Checkout · ${selectedVariant?.retail_price
                ? `$${(parseFloat(selectedVariant.retail_price) * qty).toFixed(2)}`
                : 'Select options'}`}
        </button>
        <p className="text-[10px] text-white/20 text-center mt-3">
          Fulfilled and shipped by Printful · Powered by Feelz Machine
        </p>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function MerchPage() {
  const { slug }    = useParams();
  const navigate    = useNavigate();
  const { user }    = useAuth();

  const [artist,      setArtist]      = useState(null);
  const [products,    setProducts]    = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState('');
  const [selected,    setSelected]    = useState(null);
  const [activeType,  setActiveType]  = useState('All');

  useEffect(() => {
    const load = async () => {
      try {
        const { data: artistData } = await supabase
          .from('artists')
          .select('id, artist_name, profile_image_url, slug, merch_enabled, printful_store_id')
          .eq('slug', slug).maybeSingle();

        if (!artistData)               { setError('Artist not found');    setLoading(false); return; }
        if (!artistData.merch_enabled) { setError('Merch not available'); setLoading(false); return; }

        setArtist(artistData);
        const { products: prods } = await proxyRequest('get_products', artistData.id);
        setProducts(prods || []);
      } catch (err) { setError(err.message); }
      setLoading(false);
    };
    load();
  }, [slug]);

  // Derive product types for filter tabs
  const productTypes = ['All', ...new Set(
    products.map(p => {
      const name = (p.sync_product?.name || p.name || '').toLowerCase();
      if (name.includes('hoodie') || name.includes('sweatshirt')) return 'Hoodies';
      if (name.includes('t-shirt') || name.includes('tee') || name.includes('shirt')) return 'T-Shirts';
      if (name.includes('hat') || name.includes('cap') || name.includes('beanie')) return 'Hats';
      if (name.includes('mug') || name.includes('cup')) return 'Mugs';
      if (name.includes('poster') || name.includes('print')) return 'Prints';
      return 'Other';
    })
  )].filter((t, i, arr) => t === 'All' || arr.indexOf(t) === i);

  const filteredProducts = activeType === 'All' ? products : products.filter(p => {
    const name = (p.sync_product?.name || p.name || '').toLowerCase();
    if (activeType === 'Hoodies')  return name.includes('hoodie') || name.includes('sweatshirt');
    if (activeType === 'T-Shirts') return name.includes('t-shirt') || name.includes('tee') || name.includes('shirt');
    if (activeType === 'Hats')     return name.includes('hat') || name.includes('cap') || name.includes('beanie');
    if (activeType === 'Mugs')     return name.includes('mug') || name.includes('cup');
    if (activeType === 'Prints')   return name.includes('poster') || name.includes('print');
    return true;
  });

  if (loading) return <MerchSkeleton />;

  if (error) return (
    <div className="min-h-screen bg-black flex flex-col items-center justify-center px-6 text-center">
      <Package className="w-12 h-12 text-white/10 mb-4" />
      <p className="text-white/40 text-sm">{error}</p>
      <button onClick={() => navigate(`/artist/${slug}`)}
        className="mt-4 text-xs text-white/30 hover:text-white/50 transition">← Back to profile</button>
    </div>
  );

  if (selected) {
    return <ProductDetail product={selected} artist={artist} onBack={() => setSelected(null)} />;
  }

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
        {user && (
          <button onClick={() => navigate(`/artist/${slug}/merch/orders`)}
            className="w-8 h-8 flex items-center justify-center rounded-full bg-white/[0.06] hover:bg-white/[0.1] transition"
            title="Order history">
            <History className="w-4 h-4 text-white/40" />
          </button>
        )}
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
            <p className="text-sm text-white/40 mb-4">{products.length} item{products.length !== 1 ? 's' : ''}</p>

            {/* Category filter tabs — only show if more than one type */}
            {productTypes.length > 2 && (
              <div className="flex space-x-2 overflow-x-auto scrollbar-hide mb-5 -mx-1 px-1">
                {productTypes.map(type => (
                  <button key={type} onClick={() => setActiveType(type)}
                    className="flex-shrink-0 flex items-center space-x-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition"
                    style={activeType === type
                      ? { background: 'white', color: 'black' }
                      : { background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.45)' }}>
                    {type === 'All' && <Tag className="w-3 h-3" />}
                    <span>{type}</span>
                  </button>
                ))}
              </div>
            )}

            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
              {filteredProducts.map(product => {
                const thumb    = product.sync_product?.thumbnail_url || product.thumbnail_url;
                const name     = product.sync_product?.name || product.name;
                const vars     = product.sync_variants || [];
                const created  = product.sync_product?.created;
                const isNew    = created && (Date.now() / 1000 - created) < 30 * 24 * 3600;
                const allOOS   = vars.length > 0 && vars.every(v => v.availability_status && v.availability_status !== 'active');
                return (
                  <button key={product.id || product.sync_product?.id}
                    onClick={() => !allOOS && setSelected(product)}
                    disabled={allOOS}
                    className={`text-left group rounded-2xl overflow-hidden border transition ${
                      allOOS
                        ? 'opacity-50 cursor-not-allowed border-white/[0.04] bg-white/[0.01]'
                        : 'border-white/[0.06] hover:border-white/20 bg-white/[0.02] hover:bg-white/[0.04] active:scale-[0.98]'
                    }`}>
                    <div className="aspect-square overflow-hidden bg-white/[0.03] relative">
                      {thumb
                        ? <img src={thumb} alt={name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                        : <div className="w-full h-full flex items-center justify-center"><Package className="w-8 h-8 text-white/10" /></div>}
                      {isNew && !allOOS && (
                        <div className="absolute top-2 left-2 px-1.5 py-0.5 rounded-full text-[9px] font-bold"
                          style={{ background: 'rgba(139,92,246,0.9)', color: '#fff' }}>
                          NEW
                        </div>
                      )}
                      {allOOS && (
                        <div className="absolute inset-0 flex items-center justify-center"
                          style={{ background: 'rgba(0,0,0,0.5)' }}>
                          <span className="text-xs font-bold text-white/50 bg-black/60 px-2 py-1 rounded-lg">Sold Out</span>
                        </div>
                      )}
                      {!allOOS && (
                        <div className="absolute inset-0 flex items-end justify-end p-2 opacity-0 group-hover:opacity-100 transition">
                          <div className="backdrop-blur-sm rounded-lg px-2 py-1 flex items-center space-x-1"
                            style={{ background: 'rgba(255,255,255,0.1)' }}>
                            <span className="text-[10px] text-white font-medium">View</span>
                            <ChevronRight className="w-3 h-3 text-white" />
                          </div>
                        </div>
                      )}
                    </div>
                    <div className="p-3">
                      <p className="text-sm font-semibold text-white truncate mb-1">{name}</p>
                      {allOOS
                        ? <span className="text-xs text-white/30">Sold out</span>
                        : <PriceRange variants={vars} />}
                    </div>
                  </button>
                );
              })}
            </div>

            <p className="text-[10px] text-white/20 text-center mt-8">
              All orders fulfilled and shipped by Printful
            </p>
          </>
        )}
      </div>
    </div>
  );
}