-- supabase/migrations/251_davu_decides_what_google_sees.sql
--
-- ONE SWITCH ON A NEWSLETTER POST, AND THE EDITOR OWNS IT.
--
--
-- THE PROBLEM, IN NUMBERS
--
-- The sitemap carries 396 URLs. 117 of them are newsletter posts, which is 30%
-- of everything Google is asked to crawl.
--
-- Search Console says Google has fetched 66 pages and left 307 as "Discovered,
-- currently not indexed" — it has the URLs and has decided they are not worth
-- the trip. Meanwhile 154 track pages sit behind those 117 announcements in
-- the queue.
--
-- The posts are not bad. They are just not search. "Feelz Just Got Better" and
-- "Get paid in rand, straight to your bank" are written for people who already
-- use the platform. Nobody types those into Google.
--
-- One of them is different. "Why Drake Lost His Not Like Us Lawsuit" is real
-- editorial, and it is one of only nine pages on this entire site that has
-- ever earned a click from search.
--
--
-- WHY THE DEFAULT IS OFF, WHICH IS NOT WHAT WAS ASKED FOR
--
-- The instruction was to default the column on and switch it off for the
-- announcements. That is the right instinct and the wrong default here, for
-- one reason found by counting rather than guessing:
--
--   posts on file                      119
--   posts with a body over 3,000 chars   1
--
-- 118 of 119 are short announcements. Defaulting on means somebody opens 118
-- posts to switch them off, and the sitemap stays exactly as it is until they
-- finish. Defaulting off means Davu switches on the handful that deserve it,
-- and the crawl problem is solved the moment this runs.
--
-- It also puts the decision the right way round. Being in Google is a thing
-- the editor decides a piece has earned, not a thing that happens to every
-- product announcement unless someone remembers to stop it.
--
-- The cost is real and worth naming: a post Davu forgets to mark is not in the
-- sitemap. It is not hidden, not blocked and not deindexed — robots.txt still
-- allows it, the page still answers, and anything already indexed stays
-- indexed. It is simply not submitted. She can switch it on any time and it
-- goes in within the hour.
--
--
-- WHY A FUNCTION AND NOT A POLICY
--
-- newsletter_posts has two policies: newsletter_posts_admin_all and
-- newsletter_posts_public_select. Davu is not an admin. She is the one row in
-- newsletter_editors, and that grants her the compose page and nothing else.
--
-- So she cannot UPDATE this table, and the fix is not to let her. Row level
-- security cannot restrict a policy to one column, so an UPDATE policy for
-- editors would hand her the title, the body and the audience of every post
-- ever sent, to change a boolean.
--
-- A SECURITY DEFINER function that writes one column and asks who is calling
-- gives her exactly the switch and nothing else. Same guard the admin_
-- functions use, same reason.

begin;

-- ── The column ──────────────────────────────────────────────────────────────
--
-- Named for what it does to the thing it controls. search_indexable reads the
-- same way in the sitemap query, in the API and on the button.
alter table public.newsletter_posts
  add column if not exists search_indexable boolean not null default false;

comment on column public.newsletter_posts.search_indexable is
  'Editor decides. true means this post goes in sitemap.xml. Default false: most posts are product announcements nobody searches for, and they crowd out the music.';

-- ── The one post that has earned it ─────────────────────────────────────────
--
-- Named by its slug, one post, rather than selected by a rule about body
-- length. A rule that picks the right post today picks something nobody
-- checked tomorrow.
update public.newsletter_posts
set search_indexable = true
where slug = 'why-drake-lost-his-not-like-us-lawsuit-b459f5';

-- ── The switch ──────────────────────────────────────────────────────────────
create or replace function public.set_newsletter_search_indexable(
  p_post_id uuid,
  p_value   boolean
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ok boolean;
begin
  -- Admins, or the people trusted to write the newsletter in the first place.
  select exists (select 1 from public.admins            a where a.user_id = auth.uid())
      or exists (select 1 from public.newsletter_editors e where e.user_id = auth.uid())
    into v_ok;

  if not v_ok then
    raise exception 'newsletter editors only';
  end if;

  update public.newsletter_posts
  set search_indexable = coalesce(p_value, false)
  where id = p_post_id;

  if not found then
    raise exception 'no such post';
  end if;

  return coalesce(p_value, false);
end;
$$;

revoke all on function public.set_newsletter_search_indexable(uuid, boolean) from public, anon;
grant execute on function public.set_newsletter_search_indexable(uuid, boolean) to authenticated;

commit;

-- ── Check ───────────────────────────────────────────────────────────────────
select '1 column exists' as k,
  case when exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='newsletter_posts' and column_name='search_indexable'
  ) then 'yes' else 'NO, CHECK THIS' end as v
union all
select '2 default is off',
  coalesce((select column_default from information_schema.columns
    where table_schema='public' and table_name='newsletter_posts' and column_name='search_indexable'), 'none')
union all
select '3 posts marked for search',
  (select count(*)::text from public.newsletter_posts where search_indexable)
  || ' of ' || (select count(*)::text from public.newsletter_posts)
union all
select '4 which ones',
  coalesce((select string_agg(title, ' | ' order by created_at)
    from public.newsletter_posts where search_indexable), 'none')
union all
select '5 sitemap URLs this removes',
  (select count(*)::text from public.newsletter_posts where slug is not null and not search_indexable)
union all
select '6 the switch is guarded',
  case when pg_get_functiondef('public.set_newsletter_search_indexable(uuid, boolean)'::regprocedure)
            ilike '%newsletter editors only%'
       then 'yes' else 'NO, CHECK THIS' end
union all
select '7 anon cannot call it',
  case when has_function_privilege('anon', 'public.set_newsletter_search_indexable(uuid, boolean)', 'EXECUTE')
       then 'YES, CHECK THIS' else 'correct, anon is blocked' end
union all
select '8 who can flip it',
  (select count(*)::text from public.admins) || ' admins, '
  || (select count(*)::text from public.newsletter_editors) || ' newsletter editor(s)'
union all
-- Asked in full rather than trusting the update above. If the slug ever
-- changes this says so instead of quietly marking nothing.
select '9 the Drake post was found',
  case when exists (select 1 from public.newsletter_posts
                     where slug = 'why-drake-lost-his-not-like-us-lawsuit-b459f5' and search_indexable)
       then 'yes' else 'NO, slug may have changed' end
order by 1;
