-- When someone signs up to the Affiliate Programme, every admin gets a
-- notification and an email, so approvals do not wait unseen.
-- Run once in the Supabase SQL editor for the feelz-machine project.

create or replace function public.notify_admins_affiliate_signup()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_name text;
begin
  select coalesce(
           (select artist_name from artists where user_id = new.user_id limit 1),
           (select nullif(trim(name), '') from user_profiles where user_id = new.user_id limit 1),
           (select email from auth.users where id = new.user_id),
           'Someone')
    into v_name;

  insert into notifications (user_id, type, title, message, metadata, email_requested)
  select a.user_id,
         'admin_message',
         'New affiliate sign-up: ' || v_name,
         v_name || ' signed up for the Affiliate Programme and is waiting for approval.',
         jsonb_build_object('url', '/admin/affiliates', 'affiliate_user_id', new.user_id, 'kind', 'affiliate_signup'),
         true
    from admins a;
  return new;
exception when others then
  raise warning 'affiliate sign-up alert skipped: %', sqlerrm;
  return new;
end;
$$;

drop trigger if exists affiliates_signup_alert on public.affiliates;
create trigger affiliates_signup_alert
  after insert on public.affiliates
  for each row execute function public.notify_admins_affiliate_signup();
