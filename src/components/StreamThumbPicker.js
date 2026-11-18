/**
 * src/components/StreamThumbPicker.js
 *
 * A stream's own thumbnail, for Feelz Machine only: Feelz Live, Home, the
 * stream page, the replay, Library and shared link previews. It never touches
 * the video's thumbnail on YouTube.
 *
 * The picture is cropped to 16:9 from the centre and saved as a 1280x720 JPEG
 * in the covers bucket (live/<artist id>/...), then handed back as a URL.
 *
 *   <StreamThumbPicker artistId={artist.id} value={url} onChange={setUrl} />
 *   compact  a single row with a small preview (the host tools on the stream page)
 */

import React, { useRef, useState } from 'react';
import { ImagePlus, Loader, X } from 'lucide-react';
import { supabase } from '../supabaseClient';

const W = 1280, H = 720;

async function toThumbJpeg(file) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((ok, fail) => {
      const i = new Image();
      i.onload = () => ok(i);
      i.onerror = () => fail(new Error('That file is not a picture we can read.'));
      i.src = url;
    });
    // Centre crop to 16:9.
    const want = W / H;
    let sw = img.naturalWidth, sh = img.naturalHeight, sx = 0, sy = 0;
    if (sw / sh > want) { sw = Math.round(sh * want); sx = Math.round((img.naturalWidth - sw) / 2); }
    else { sh = Math.round(sw / want); sy = Math.round((img.naturalHeight - sh) / 2); }
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    c.getContext('2d').drawImage(img, sx, sy, sw, sh, 0, 0, W, H);
    return await new Promise((ok, fail) => c.toBlob(b => (b ? ok(b) : fail(new Error('Could not prepare that picture.'))), 'image/jpeg', 0.86));
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function uploadStreamThumb(artistId, file) {
  if (!file || !/^image\//.test(file.type)) throw new Error('Pick a picture (JPG, PNG or WebP).');
  if (file.size > 20 * 1024 * 1024) throw new Error('That picture is over 20 MB.');
  const blob = await toThumbJpeg(file);
  const path = `live/${artistId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`;
  const { error } = await supabase.storage.from('covers').upload(path, blob, { contentType: 'image/jpeg', cacheControl: '31536000', upsert: false });
  if (error) throw new Error('The upload did not go through. Try again.');
  return supabase.storage.from('covers').getPublicUrl(path).data.publicUrl;
}

export default function StreamThumbPicker({ artistId, value, onChange, compact = false, fallback = null }) {
  const input = useRef(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const pick = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setBusy(true); setErr('');
    try { onChange(await uploadStreamThumb(artistId, file)); }
    catch (x) { setErr(x.message); }
    setBusy(false);
  };

  const shown = value || fallback;
  const fileInput = <input ref={input} type="file" accept="image/*" className="hidden" onChange={pick} />;

  if (compact) {
    return (
      <div className="flex items-center gap-3">
        {fileInput}
        <div className="w-24 aspect-video rounded-lg overflow-hidden bg-white/[0.06] flex-shrink-0 ring-1 ring-white/10">
          {shown && <img src={shown} alt="" className="w-full h-full object-cover" />}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-bold text-white">Thumbnail</p>
          <p className="text-[11px] text-white/45 leading-snug">{err || (value ? 'Shown in Feelz Machine only' : 'Add your own for Feelz Machine')}</p>
        </div>
        <button type="button" onClick={() => input.current?.click()} disabled={busy}
          className="px-3 py-2 rounded-xl bg-white/10 text-xs font-black disabled:opacity-50 inline-flex items-center gap-1.5">
          {busy ? <Loader className="w-3.5 h-3.5 animate-spin" /> : <ImagePlus className="w-3.5 h-3.5" />} {value ? 'Change' : 'Add'}
        </button>
        {value && !busy && (
          <button type="button" onClick={() => onChange(null)} aria-label="Remove the thumbnail"
            className="w-8 h-8 rounded-xl bg-white/[0.06] flex items-center justify-center">
            <X className="w-3.5 h-3.5 text-white/60" />
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {fileInput}
      <button type="button" onClick={() => input.current?.click()} disabled={busy}
        className="relative w-full aspect-video rounded-2xl overflow-hidden border-2 border-dashed border-white/[0.12] bg-white/[0.03] hover:border-white/25 transition flex items-center justify-center">
        {value ? (
          <>
            <img src={value} alt="" className="absolute inset-0 w-full h-full object-cover" />
            <span className="absolute bottom-2 right-2 px-3 py-1.5 rounded-full bg-black/70 backdrop-blur text-xs font-black text-white inline-flex items-center gap-1.5">
              <ImagePlus className="w-3.5 h-3.5" /> Change
            </span>
          </>
        ) : (
          <span className="flex flex-col items-center gap-1.5 text-white/55">
            {busy ? <Loader className="w-6 h-6 animate-spin" /> : <ImagePlus className="w-6 h-6" />}
            <span className="text-sm font-bold">{busy ? 'Uploading' : 'Add a thumbnail'}</span>
            <span className="text-[11px] text-white/35">16:9 works best. Shown in Feelz Machine only.</span>
          </span>
        )}
        {busy && value && <span className="absolute inset-0 bg-black/60 flex items-center justify-center"><Loader className="w-6 h-6 animate-spin text-white" /></span>}
      </button>
      <div className="flex items-center justify-between">
        <p className="text-xs text-white/40">{err || 'Your YouTube thumbnail stays as it is.'}</p>
        {value && !busy && (
          <button type="button" onClick={() => onChange(null)} className="text-xs font-bold text-white/50 hover:text-white">Remove</button>
        )}
      </div>
    </div>
  );
}
