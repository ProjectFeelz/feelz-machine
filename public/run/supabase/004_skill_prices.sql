-- FEELZ RUN: SKILLS COST MORE
-- Unlocking everything now takes dozens of runs and a high level, not a handful.
-- Skills already unlocked stay unlocked.
update public.game_skills s set level_req = v.lvl, rp_cost = v.rp
from (values
  ('air_dash', 4, 2500),
  ('triple_jump', 8, 5500),
  ('power_slide', 7, 4500),
  ('wall_kick', 13, 9000),
  ('ground_pound', 16, 12000),
  ('takedown', 5, 3500),
  ('flying_kick', 12, 8000),
  ('spin_kick', 15, 11000),
  ('heavy_smash', 18, 14000),
  ('record_magnet', 5, 3000),
  ('storm_shield', 10, 7000),
  ('long_boost', 9, 6000),
  ('extra_heart', 20, 16000),
  ('dance_bboy', 3, 1500),
  ('dance_swing', 7, 4000),
  ('dance_robot', 11, 7500),
  ('outfit_ice', 3, 2000),
  ('outfit_crimson', 6, 3500),
  ('outfit_violet', 10, 6500),
  ('outfit_emerald', 14, 10000)
) as v(id, lvl, rp)
where s.id = v.id;
