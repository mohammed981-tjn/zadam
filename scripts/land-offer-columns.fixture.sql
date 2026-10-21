-- Columns later migrations add to lands and profiles, for gates that stage only
-- the base schema and a few migrations before 20261021220000_land_rows_not_public.sql.
-- Each matches production's type and default; `if not exists` leaves them alone
-- where a staged migration already created them.
alter table public.lands
  add column if not exists open_to_partners boolean not null default false,
  add column if not exists open_to_investors boolean not null default false;
alter table public.profiles
  add column if not exists publish_record boolean not null default false;
