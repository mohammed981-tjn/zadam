-- Columns later migrations add to seasons, for the direct-writes gate, which does not
-- stage the whole partnership chain. Each matches production's type; the foreign key to
-- partnership_agreements is left out because the gate only needs «linked or not».
alter table public.seasons
  add column if not exists partnership_id uuid,
  add column if not exists harvest_kg numeric;
