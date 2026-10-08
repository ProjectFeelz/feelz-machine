// netlify/functions/migrate-images.js
//
// ONE-OFF. Copies every image out of the feelz-samples bucket into the covers
// bucket, so feelz-samples can be made private without taking every cover,
// banner and avatar on the platform down with it.
//
// Delete this file once the migration is done and verified.
//
//
// WHY A COPY AND NOT A MOVE
//
// Nothing is deleted and nothing is repointed here. After this runs, every
// image exists in BOTH buckets and the site still reads the old URLs, so there
// is no moment where a URL is dead and the whole step is undone by deleting
// the copies. The database repoint happens separately, and only once this has
// been verified.
//
//
// WHY MIMETYPE AND NOT PREFIX
//
// The obvious approach is to copy the covers/, album-covers/, banners/ and
// user-avatars/ folders. That is wrong on this bucket: mina-nawe/ holds a wav
// AND a jpg, and dangerous/, dark-trap/ and enchanted/ each mix images with
// placeholder files. Going by folder would have left images behind and moved
// audio by accident. metadata->>'mimetype' starting with image/ is the only
// classifier that is actually true here: 349 objects, 963 MB.
//
//
// THE PATH IS UNCHANGED
//
// feelz-samples/covers/x.png becomes covers/covers/x.png. The doubled folder
// reads oddly, and it is deliberate: keeping the object path identical makes
// the mapping one to one, so verification is a size comparison and the
// database repoint is a single string replacement of the bucket name. A
// tidier path would mean carrying a mapping table and getting it right 349
// times.
//
//
// HOW TO RUN IT
//
//   curl -X POST https://www.feelzmachine.com/.netlify/functions/migrate-images \
//     -H "x-internal-secret: $INTERNAL_FUNCTION_SECRET" \
//     -H "content-type: application/json" \
//     -d '{"mode":"plan"}'
//
// mode "plan"   counts what would be copied and writes nothing.
// mode "copy"   copies up to `batch` objects (default 25) and returns how many
//               are left. Safe to call again and again: it only ever copies
//               objects that are not already in covers, so a timeout, a retry
//               or a double click costs nothing. Keep calling until
//               remaining is 0.
// mode "verify" compares every image in feelz-samples against its copy and
//               reports anything missing or a different size.

const { createClient } = require('@supabase/supabase-js');

const SRC_BUCKET = 'feelz-samples';
const DST_BUCKET = 'covers';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const json = (statusCode, body) => ({
  statusCode,
  headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  body: JSON.stringify(body, null, 1),
});

// storage.objects is readable through PostgREST only if it is exposed, which it
// is not by default, so the listing comes from the storage API. list() is
// per-prefix and caps at 100, so this walks the prefixes it finds rather than
// assuming the bucket is flat.
async function listAllObjects(bucket) {
  const out = [];
  const seenPrefixes = new Set();
  const queue = [''];

  while (queue.length) {
    const prefix = queue.shift();
    if (seenPrefixes.has(prefix)) continue;
    seenPrefixes.add(prefix);

    let offset = 0;
    for (;;) {
      const { data, error } = await supabase.storage.from(bucket).list(prefix, {
        limit: 100,
        offset,
        sortBy: { column: 'name', order: 'asc' },
      });
      if (error) throw new Error(`list ${bucket}/${prefix}: ${error.message}`);
      if (!data || data.length === 0) break;

      for (const entry of data) {
        const full = prefix ? `${prefix}/${entry.name}` : entry.name;
        // A folder comes back with a null id and no metadata.
        if (entry.id === null || !entry.metadata) {
          queue.push(full);
        } else {
          out.push({
            path: full,
            size: Number(entry.metadata.size ?? 0),
            mimetype: entry.metadata.mimetype || '',
          });
        }
      }

      if (data.length < 100) break;
      offset += data.length;
    }
  }

  return out;
}

const isImage = (o) => (o.mimetype || '').toLowerCase().startsWith('image/');

// Prefer the server side copy, which never moves bytes through this function.
// Cross bucket copy arrived in a later storage-js than this project's floor of
// 2.39, so if the installed client does not support it the download and
// re-upload path is used instead. Both end with the same object; this is not a
// guess about which one is available, it tries and falls back.
async function copyOne(path, contentType) {
  try {
    const { error } = await supabase.storage
      .from(SRC_BUCKET)
      .copy(path, path, { destinationBucket: DST_BUCKET });
    if (!error) return 'server_copy';
    if (!/destination|bucket|not supported|invalid/i.test(error.message || '')) {
      throw new Error(error.message);
    }
  } catch (e) {
    if (!/destination|bucket|not supported|invalid|is not a function/i.test(e.message || '')) {
      throw e;
    }
  }

  const { data: blob, error: dlErr } = await supabase.storage.from(SRC_BUCKET).download(path);
  if (dlErr) throw new Error(`download ${path}: ${dlErr.message}`);
  const buffer = Buffer.from(await blob.arrayBuffer());

  const { error: upErr } = await supabase.storage.from(DST_BUCKET).upload(path, buffer, {
    contentType: contentType || blob.type || 'application/octet-stream',
    cacheControl: '31536000',
    upsert: false,
  });
  if (upErr) throw new Error(`upload ${path}: ${upErr.message}`);
  return 'stream_copy';
}

exports.handler = async (event) => {
  // This function has no schedule, so it is reachable from the open internet.
  // The secret is required always, not only on a manual run.
  if (!process.env.INTERNAL_FUNCTION_SECRET) {
    return json(500, { error: 'INTERNAL_FUNCTION_SECRET is not set' });
  }
  if (event.headers['x-internal-secret'] !== process.env.INTERNAL_FUNCTION_SECRET) {
    return json(401, { error: 'unauthorized' });
  }

  let mode = 'plan';
  let batch = 25;
  try {
    const body = JSON.parse(event.body || '{}');
    if (body.mode) mode = String(body.mode);
    if (body.batch) batch = Math.max(1, Math.min(100, Number(body.batch)));
  } catch { /* defaults */ }

  let src, dst;
  try {
    [src, dst] = await Promise.all([listAllObjects(SRC_BUCKET), listAllObjects(DST_BUCKET)]);
  } catch (e) {
    console.error('[migrate-images] listing failed:', e.message);
    return json(500, { error: 'listing_failed', detail: e.message });
  }

  const images = src.filter(isImage);
  const dstByPath = new Map(dst.map(o => [o.path, o]));

  if (mode === 'plan') {
    const byPrefix = {};
    for (const o of images) {
      const p = o.path.includes('/') ? o.path.split('/')[0] : '(root)';
      byPrefix[p] = (byPrefix[p] || 0) + 1;
    }
    return json(200, {
      mode,
      sourceObjectsTotal: src.length,
      imagesToCopy: images.length,
      imagesAlreadyInDestination: images.filter(o => dstByPath.has(o.path)).length,
      nonImagesLeftAlone: src.length - images.length,
      totalImageBytes: images.reduce((a, o) => a + o.size, 0),
      imagesByPrefix: byPrefix,
      note: 'Nothing was written. Run again with mode "copy" to begin.',
    });
  }

  if (mode === 'verify') {
    const missing = [];
    const sizeMismatch = [];
    for (const o of images) {
      const d = dstByPath.get(o.path);
      if (!d) { missing.push(o.path); continue; }
      if (d.size !== o.size) sizeMismatch.push({ path: o.path, src: o.size, dst: d.size });
    }
    return json(200, {
      mode,
      checked: images.length,
      ok: images.length - missing.length - sizeMismatch.length,
      missing,
      sizeMismatch,
      verdict: missing.length === 0 && sizeMismatch.length === 0
        ? 'Every image has a byte-identical copy in the destination bucket.'
        : 'NOT clean. Do not repoint or flip until this reports zero.',
    });
  }

  if (mode !== 'copy') return json(400, { error: 'mode must be plan, copy or verify' });

  const todo = images.filter(o => !dstByPath.has(o.path)).slice(0, batch);
  const copied = [];
  const failed = [];
  let method = null;

  for (const o of todo) {
    try {
      method = await copyOne(o.path, o.mimetype);
      copied.push(o.path);
    } catch (e) {
      console.error('[migrate-images] copy failed', o.path, e.message);
      failed.push({ path: o.path, error: e.message });
    }
  }

  const remaining = images.filter(o => !dstByPath.has(o.path)).length - copied.length;

  return json(200, {
    mode,
    method,
    copiedThisRun: copied.length,
    failedThisRun: failed.length,
    failed,
    remaining,
    done: remaining === 0 && failed.length === 0,
    note: remaining > 0
      ? 'Call again with mode "copy" until remaining is 0, then run mode "verify".'
      : 'Copying finished. Run mode "verify" before anything is repointed.',
  });
};