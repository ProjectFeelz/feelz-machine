-- Feelz Run: clean slate for every player. Backs everything up first.
begin;

create table if not exists public.game_players_backup_20261123 as table public.game_players with no data;
create table if not exists public.game_runs_backup_20261123   as table public.game_runs   with no data;
alter table public.game_players_backup_20261123 enable row level security;
alter table public.game_runs_backup_20261123   enable row level security;
revoke all on public.game_players_backup_20261123, public.game_runs_backup_20261123 from anon, authenticated;

insert into public.game_players_backup_20261123 select * from public.game_players;
insert into public.game_runs_backup_20261123   select * from public.game_runs;

insert into public.game_credit_log (user_id, change, balance_after, reason)
select user_id, -credits, 0, 'full_reset_20261123' from public.game_players where credits <> 0;

update public.game_players set
  xp = 0, rp_bank = 0, credits = 0,
  stash_records = 0, stash_notes = 0, stash_pages = 0, stash_coins = 0,
  vinyl_total = 0, notes_total = 0, kos_total = 0, coins_total = 0,
  journal = '{}', runs = 0, best = '{}'::jsonb, unlocks = '{}',
  outfit = 'gold', dance = 'default', coin_missions = '{}';

delete from public.game_runs;

update public.game_vouchers set status = 'expired', expires_at = now()
 where status in ('active', 'reserved');

commit;

select player_name, xp, rp_bank, credits, runs from public.game_players;
