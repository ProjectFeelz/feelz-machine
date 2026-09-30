// src/utils/artistSlug.js
//
// Slug generation for artist vanity URLs.
//
// This lived only in ProfileSetup.js. ProfilePage.js is a near-duplicate of
// that file (both ~1,100 lines, both routed, both exporting a component
// called ProfilePage) and it did not have this logic, so:
//
//   changing your artist name at /setup   -> slug updated
//   changing your artist name at /profile -> slug left pointing at the old name
//
// Same field, same user, different outcome depending on which page they
// happened to open. Extracted here so both use one implementation and the
// two files stop drifting further apart on this at least.

import { supabase } from '../supabaseClient';

export function generateSlug(name) {
  return (name || '')
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')  // strip accents
    .replace(/[^a-z0-9\s-]/g, '')                      // strip special chars
    .trim()
    .replace(/\s+/g, '-')                              // spaces to hyphens
    .replace(/-+/g, '-')                               // collapse hyphens
    .slice(0, 50);
}

// Appends a short random suffix only when the base is already taken by
// someone else. Excluding the current artist matters: without it, saving
// your profile without changing your name would collide with yourself and
// pointlessly churn your own URL.
export async function getUniqueSlug(base, currentArtistId) {
  // The .neq is applied ONLY when there is an id to exclude.
  //
  // It used to be unconditional, and called with null it became `id != null`,
  // which in SQL is never true rather than always true. So the count came back
  // 0 for a slug that was already taken and this handed it straight back,
  // which then fails on the unique index at insert time. That path had no
  // caller until a new artist row was created without one, and it would have
  // been a confusing failure to trace from the error alone.
  let q = supabase
    .from('artists')
    .select('*', { count: 'exact', head: true })
    .eq('slug', base);
  if (currentArtistId) q = q.neq('id', currentArtistId);
  const { count } = await q;
  if (!count) return base;
  const suffix = Math.random().toString(36).slice(2, 6);
  return `${base}-${suffix}`;
}

// The rule both pages should follow: set a slug when there isn't one, or
// when the name has actually changed. Returns null when nothing should
// change, so callers can skip the write.
export async function slugForNameChange(newName, artist) {
  const trimmed = (newName || '').trim();
  const nameChanged = trimmed !== (artist?.artist_name || '').trim();
  if (artist?.slug && !nameChanged) return null;
  const base = generateSlug(trimmed);
  if (!base) return null;
  return getUniqueSlug(base, artist.id);
}