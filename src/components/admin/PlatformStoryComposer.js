// src/components/admin/PlatformStoryComposer.js
//
// The platform's story calendar, on the page Davu already knows.
//
// It sits inside NewsletterComposePage rather than on a screen of its own,
// because the job is the same job: plan what the platform says, weeks out,
// and let it go out on a date. Putting it behind a separate route would have
// meant a second place to check and a second thing to forget.
//
// Everything it writes is an ordinary row in artist_stories owned by the
// platform artist, so it needs no new reader anywhere. The For You rail, the
// profile ring and the What's New rail all pick it up through the queries
// they already run.
//
// What may be posted here is decided by the database, not by this file.
// Migration 191 gates insert, update and delete on newsletter_editors or
// admins, scoped to the platform artist. This component hides itself when the
// RPC says there is no platform artist yet, which is what "191 has not run"
// looks like from here.

import React from 'react';
import { supabase } from '../../supabaseClient';
import { platformStoryArtistId } from '../../utils/stories';
import { Image as ImageIcon, Trash2, Clock, Loader, Plus } from 'lucide-react';

const MAX_MB = 50;
const ACCEPT = 'image/*,video/mp4,video/webm';

const inputCls =
  'w-full px-3 py-2.5 bg-white/[0.06] rounded-lg text-white text-sm outline-none focus:bg-white/[0.1] transition';

const pad = (n) => String(n).padStart(2, '0');

// A value for <input type="datetime-local">, in the editor's own time zone.
const toLocalInput = (d) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;

// Tomorrow at 09:00, because a story is a morning thing and nobody plans one
// for the minute they happen to be sitting at the screen.
const defaultWhen = () => {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(9, 0, 0, 0);
  return toLocalInput(d);
};

const fmtWhen = (iso) =>
  iso
    ? new Date(iso).toLocaleString(undefined, {
        weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
      })
    : 'now';

export default function PlatformStoryComposer({ onToast }) {
  const [artistId, setArtistId] = React.useState(null);
  const [checking, setChecking] = React.useState(true);

  const [file, setFile]       = React.useState(null);
  const [preview, setPreview] = React.useState(null);
  const [caption, setCaption] = React.useState('');
  const [when, setWhen]       = React.useState(defaultWhen);
  const [saving, setSaving]   = React.useState(false);
  const [error, setError]     = React.useState('');

  const [rows, setRows]       = React.useState([]);
  const [queue, setQueue]     = React.useState([]);
  const [fromQueue, setFromQueue] = React.useState(null);   // queue row id
  const [loading, setLoading] = React.useState(false);
  const [armed, setArmed]     = React.useState(null);

  const fileRef = React.useRef(null);
  const toast = (m) => (onToast ? onToast(m) : undefined);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      const id = await platformStoryArtistId(supabase);
      if (!cancelled) { setArtistId(id); setChecking(false); }
    })();
    return () => { cancelled = true; };
  }, []);

  // The whole calendar, past and future.
  //
  // Deliberately NOT filtered through visibleNow. Every other surface asks
  // "what should a listener see right now"; this one asks "what have we
  // planned", and a schedule you cannot see is not a schedule. The restrictive
  // policy in migration 191 lets editors read ahead for exactly this.
  const load = React.useCallback(async () => {
    if (!artistId) return;
    setLoading(true);
    const { data, error: err } = await supabase
      .from('artist_stories')
      .select('id, media_url, media_type, caption, publish_at, expires_at, created_at, view_count')
      .eq('artist_id', artistId)
      .order('publish_at', { ascending: true, nullsFirst: false })
      .limit(200);
    if (err) {
      console.error('[platform story] load failed:', err.code, err.message);
      setError(err.message);
    }
    setRows(data || []);

    // The written-but-not-illustrated pile, seeded by migration 192 from the
    // updates that actually went out. Absent table means 192 has not run,
    // which is not an error, just an empty queue.
    const { data: q, error: qErr } = await supabase
      .from('platform_story_queue')
      .select('id, caption, suggested_at, note')
      .is('used_story_id', null)
      // dropped_at is a tombstone, not a delete: the row stays so its source
      // keeps migration 192 from queueing the same update again. Open means
      // neither used nor dropped. See migration 195.
      .is('dropped_at', null)
      .order('suggested_at', { ascending: true })
      .limit(100);
    if (qErr && qErr.code !== '42P01' && qErr.code !== 'PGRST205') {
      console.error('[platform story] queue load failed:', qErr.code, qErr.message);
    }
    setQueue(q || []);
    setLoading(false);
  }, [artistId]);

  React.useEffect(() => { load(); }, [load]);

  const pick = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.size > MAX_MB * 1024 * 1024) { setError(`Max file size is ${MAX_MB}MB`); return; }
    setError('');
    setFile(f);
    setPreview(URL.createObjectURL(f));
  };

  const clear = () => {
    setFile(null);
    if (preview) URL.revokeObjectURL(preview);
    setPreview(null);
    setCaption('');
    setWhen(defaultWhen());
    setFromQueue(null);
    if (fileRef.current) fileRef.current.value = '';
  };

  const schedule = async () => {
    if (!file || !artistId) return;
    setSaving(true);
    setError('');
    try {
      const ext  = (file.name.split('.').pop() || 'jpg').toLowerCase();
      // The same shape ArtistStories.js uses, which means the bucket is
      // `stories` AND the key begins `stories/`. That doubling is why deleting
      // one by hand used to leave the file behind, so the delete below splits
      // on the bucket segment rather than guessing at slashes.
      const key = `stories/${artistId}/${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from('stories')
        .upload(key, file, { upsert: false, contentType: file.type });
      if (upErr) throw upErr;

      const { data: { publicUrl } } = supabase.storage.from('stories').getPublicUrl(key);
      const publishIso = new Date(when).toISOString();

      // expires_at is left out on purpose. The trigger from migration 191 sets
      // it to publish_at plus 24 hours, so a story planned for December cannot
      // be given a September expiry by a client that computed it at save time.
      // That was the bug that made planning impossible in the first place.
      const { data: created, error: insErr } = await supabase.from('artist_stories').insert({
        artist_id:  artistId,
        media_url:  publicUrl,
        media_type: file.type.startsWith('video') ? 'video' : 'image',
        caption:    caption.trim() || null,
        publish_at: publishIso,
      }).select('id').single();
      if (insErr) {
        // The upload already happened. Leaving the object behind on a refused
        // insert is the orphan this feature can actually avoid, so it does.
        await supabase.storage.from('stories').remove([key]);
        throw insErr;
      }

      // Close the queue row only once the story exists. Marking it used any
      // earlier and a failed insert would lose the text for good, which is
      // the one thing in this flow that is not recoverable: the image can be
      // uploaded again, the words cannot be written again from nothing.
      if (fromQueue && created?.id) {
        const { error: qErr } = await supabase
          .from('platform_story_queue')
          .update({ used_story_id: created.id, used_at: new Date().toISOString() })
          .eq('id', fromQueue);
        if (qErr) console.error('[platform story] queue not closed:', qErr.code, qErr.message);
      }

      toast(`Scheduled for ${fmtWhen(publishIso)}`);
      clear();
      load();
    } catch (err) {
      console.error('[platform story] schedule failed:', err?.message);
      setError(err?.message || 'Could not schedule that story.');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (row) => {
    setArmed(null);
    const { error: delErr } = await supabase.from('artist_stories').delete().eq('id', row.id);
    if (delErr) { toast('Could not delete: ' + delErr.message); return; }

    // Same key extraction as the fixed version in ArtistStories.js. Split on
    // the bucket segment and keep everything after it, which is the key by
    // definition however many path parts it has.
    try {
      const marker = '/object/public/stories/';
      const i = row.media_url.indexOf(marker);
      const key = i === -1 ? null : row.media_url.slice(i + marker.length).split('?')[0];
      if (key) {
        const { error: rmErr } = await supabase.storage.from('stories').remove([key]);
        if (rmErr) console.error('[platform story] media not removed:', key, rmErr.message);
      }
    } catch (err) {
      console.error('[platform story] media cleanup threw:', err?.message);
    }
    setRows(prev => prev.filter(r => r.id !== row.id));
  };

  if (checking) return null;

  if (!artistId) {
    return (
      <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-4">
        <p className="text-sm font-semibold text-white">Platform stories are not set up yet</p>
        <p className="mt-1 text-xs text-white/40 leading-relaxed">
          Migration 191 creates the platform artist these are posted as. Run it and reload this page.
        </p>
      </div>
    );
  }

  const now  = Date.now();
  const live = rows.filter(r => Date.parse(r.expires_at) > now && Date.parse(r.publish_at || r.created_at) <= now);
  const soon = rows.filter(r => Date.parse(r.publish_at || r.created_at) > now);

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-sm font-bold text-white">Platform stories</h2>
        <p className="text-xs text-white/40 mt-0.5 leading-relaxed">
          These run at the top of What's New and in the story rail, the same as an artist's story.
          Each one shows for 24 hours from the time you pick. Plan as far ahead as you like.
        </p>
      </div>

      {/* ── Written, waiting for an image ── */}
      {queue.length > 0 && (
        <div>
          <p className="text-[11px] font-semibold text-white/45 mb-1.5">
            Written and waiting for an image ({queue.length})
          </p>
          <p className="text-[10px] text-white/25 mb-2 leading-relaxed">
            Recreated from the updates that already went out. Tap one, add the picture, adjust the date if you want it.
          </p>
          <div className="space-y-1.5 max-h-64 overflow-y-auto pr-1">
            {queue.map(q => (
              <button
                key={q.id}
                onClick={() => {
                  setFromQueue(q.id);
                  setCaption(q.caption || '');
                  if (q.suggested_at) {
                    const d = new Date(q.suggested_at);
                    if (d.getTime() > Date.now()) setWhen(toLocalInput(d));
                  }
                  setError('');
                  fileRef.current?.click();
                }}
                className={`w-full text-left rounded-lg border p-2.5 transition ${
                  fromQueue === q.id
                    ? 'border-purple-500/50 bg-purple-500/10'
                    : 'border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.04]'
                }`}>
                <p className="text-xs text-white/75 leading-snug">{q.caption}</p>
                <p className="text-[10px] text-white/30 mt-1">
                  {q.note}{q.suggested_at ? ` · suggested ${fmtWhen(q.suggested_at)}` : ''}
                </p>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Compose ── */}
      <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-3 space-y-3">
        <input ref={fileRef} type="file" accept={ACCEPT} onChange={pick} className="hidden" />

        {preview ? (
          <div className="relative rounded-lg overflow-hidden bg-black" style={{ aspectRatio: '9 / 16', maxHeight: 260 }}>
            {file?.type?.startsWith('video')
              ? <video src={preview} className="w-full h-full object-contain" muted playsInline />
              : <img src={preview} alt="" className="w-full h-full object-contain" />}
            <button
              onClick={clear}
              className="absolute top-2 right-2 px-2 py-1 rounded-md bg-black/70 text-[11px] font-semibold text-white/80">
              Change
            </button>
          </div>
        ) : (
          <button
            onClick={() => fileRef.current?.click()}
            className="w-full flex items-center justify-center gap-2 py-8 rounded-lg border border-dashed border-white/15 text-white/40 hover:text-white/70 hover:border-white/25 transition">
            <ImageIcon className="w-4 h-4" />
            <span className="text-sm">Choose an image or a short video</span>
          </button>
        )}

        <input
          className={inputCls}
          placeholder="Caption, optional"
          value={caption}
          maxLength={200}
          onChange={e => setCaption(e.target.value)}
        />

        <div>
          <label className="block text-[11px] font-semibold text-white/45 mb-1">Goes live</label>
          <input
            type="datetime-local"
            className={inputCls}
            value={when}
            onChange={e => setWhen(e.target.value)}
          />
          <p className="text-[10px] text-white/25 mt-1">
            Your time zone. It comes down 24 hours later, by itself.
          </p>
        </div>

        {error && <p className="text-xs text-red-300">{error}</p>}

        <button
          onClick={schedule}
          disabled={!file || saving}
          className="w-full h-11 rounded-lg font-bold text-sm flex items-center justify-center gap-2 bg-purple-500 text-white disabled:opacity-40 disabled:cursor-not-allowed transition active:scale-[0.99]">
          {saving ? <Loader className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
          <span>{saving ? 'Scheduling…' : 'Add to the calendar'}</span>
        </button>
      </div>

      {/* ── The calendar ── */}
      {loading ? (
        <p className="text-xs text-white/30">Loading the calendar…</p>
      ) : (
        <>
          <Group title={`Showing now (${live.length})`} rows={live} armed={armed} setArmed={setArmed} remove={remove} live />
          <Group title={`Planned (${soon.length})`}     rows={soon} armed={armed} setArmed={setArmed} remove={remove} />
          {rows.length === 0 && (
            <p className="text-xs text-white/30">
              Nothing planned yet. Anything you add here shows up wherever stories already show.
            </p>
          )}
        </>
      )}
    </div>
  );
}

function Group({ title, rows, armed, setArmed, remove, live }) {
  if (!rows.length) return null;
  return (
    <div>
      <p className="text-[11px] font-semibold text-white/45 mb-1.5">{title}</p>
      <div className="space-y-1.5">
        {rows.map(r => (
          <div key={r.id} className="flex items-center gap-3 rounded-lg border border-white/[0.06] bg-white/[0.02] p-2">
            <div className="w-10 h-14 rounded-md overflow-hidden bg-black flex-shrink-0">
              {r.media_type === 'video'
                ? <video src={r.media_url} className="w-full h-full object-cover" muted playsInline />
                : <img src={r.media_url} alt="" className="w-full h-full object-cover" loading="lazy" />}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs text-white/75 truncate">{r.caption || <span className="text-white/30">No caption</span>}</p>
              <p className="text-[10px] text-white/35 mt-0.5 flex items-center gap-1">
                <Clock className="w-2.5 h-2.5" />
                {live ? `until ${fmtWhen(r.expires_at)}` : fmtWhen(r.publish_at)}
              </p>
            </div>
            {armed === r.id ? (
              <div className="flex items-center gap-1 flex-shrink-0">
                <button onClick={() => remove(r)}
                  className="px-2 py-1 rounded-md bg-red-500/20 text-[11px] font-semibold text-red-300">Delete</button>
                <button onClick={() => setArmed(null)}
                  className="px-2 py-1 rounded-md bg-white/[0.06] text-[11px] text-white/50">Keep</button>
              </div>
            ) : (
              <button onClick={() => setArmed(r.id)}
                className="p-1.5 rounded-md text-white/25 hover:text-red-300 transition flex-shrink-0"
                aria-label="Delete this story">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}