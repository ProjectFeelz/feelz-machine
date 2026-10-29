-- 218_platform_media_bucket.sql
--
-- A bucket for images the platform generates about itself, so the daily story
-- can be an SVG without letting any artist upload one.
--
--
-- THE BUG THIS FIXES
--
-- platform-daily-story has never once posted a story. It generates a 1080x1920
-- SVG of the platform's own numbers and uploads it to the `stories` bucket
-- with contentType image/svg+xml. That bucket's allowed_mime_types is:
--
--   image/jpeg, image/png, image/webp, image/gif,
--   video/mp4, video/webm, video/quicktime,
--   audio/mpeg, audio/mp4, audio/wav
--
-- No SVG. So every run got "mime type image/svg+xml is not supported", threw,
-- and returned 500. Six recorded runs, six failures, zero stories.
--
--
-- WHY NOT JUST ADD image/svg+xml TO `stories`
--
-- Because `stories` is a public bucket that artists write to:
--
--   policy "Artists and admins can upload to stories"
--   with check (bucket_id = 'stories' and (exists (select 1 from artists
--               where user_id = auth.uid()) or is_platform_admin()))
--
-- Any signed-in user with an artist row can put a file there. An SVG is a
-- document, not a picture: it can carry <script>. Everywhere the app DRAWS a
-- story it uses <img src>, where scripts do not run — but the download button
-- in ArtistStories.js sets a.href to media_url with target="_blank", which is a
-- top-level navigation to the stored file. A scripted SVG would execute at the
-- Supabase storage origin, which is the origin serving every artist's uploads
-- and the storage API.
--
-- So the allowlist on `stories` stays exactly as it is. The one SVG that is not
-- user content gets its own bucket instead.
--
--
-- WHY NOT RASTERISE IT TO PNG
--
-- sharp is already a dependency, so this looks like the obvious answer. It is
-- not: the SVG draws all its text with font-family="system-ui,sans-serif", and
-- the Lambda the function runs in has no fonts installed. librsvg would resolve
-- that to nothing and upload a correct-looking gradient with no words on it —
-- and it would upload successfully, so nothing would report a problem. A silent
-- blank image is worse than the current loud failure. Bundling a font file into
-- the function is a bigger change than this migration and can be done later if
-- a raster is ever wanted for another reason.
--
--
-- WHAT THIS CREATES
--
-- `platform-media`: public to read, SVG and the raster types allowed, 10MB cap.
--
-- It gets NO policies on storage.objects, and that is the design. The service
-- role bypasses RLS, so the scheduled function can write; every signed-in user
-- is the `authenticated` role and there is no policy granting it INSERT,
-- UPDATE or DELETE here, so no user can write to it at all. Public read still
-- works, because a public bucket serves reads through the CDN path without
-- consulting policies.
--
-- Nothing user-submitted may be uploaded here. If that ever changes, this
-- bucket's allowlist has to lose image/svg+xml on the same day.

begin;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'platform-media',
  'platform-media',
  true,
  10485760,
  array['image/svg+xml', 'image/png', 'image/jpeg', 'image/webp']
)
on conflict (id) do update
  set public             = excluded.public,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

commit;


-- ── Verification ─────────────────────────────────────────────────────────
--
-- Expect:
--   bucket_public            t
--   svg_allowed              t
--   write_policies_for_users 0   <- the point. Service role only.
--   stories_still_no_svg     t   <- the artist-upload bucket is unchanged.

select
  (select public from storage.buckets where id = 'platform-media')                   as bucket_public,
  (select 'image/svg+xml' = any(allowed_mime_types)
     from storage.buckets where id = 'platform-media')                               as svg_allowed,
  (select count(*) from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and cmd in ('INSERT', 'UPDATE', 'DELETE')
      and (coalesce(qual, '') || coalesce(with_check, '')) like '%platform-media%')   as write_policies_for_users,
  (select not ('image/svg+xml' = any(allowed_mime_types))
     from storage.buckets where id = 'stories')                                      as stories_still_no_svg;
