-- بيانات FAOSTAT المرجعية.
--
-- The platform derives what a crop needs — water, dates, a phase plan — and had
-- no way to say whether the harvest that followed was good. lib/cropBenchmark.ts
-- shipped almost empty and said so: the sources were unreachable from the build
-- environment, and filling a reference from memory would reproduce exactly the
-- failure agronomy.ts opens by describing.
--
-- This is that gap closed with real data: FAOSTAT's Crops and livestock products
-- domain for 2023–2024, twenty-two countries, 262 items, area harvested, yield,
-- production, live animal stocks, carcass weight, milking and laying animals.
--
-- WHY A TABLE RATHER THAN A CONSTANT
--
-- Two reasons, and the second is the one that matters.
--
-- It is 12,799 observations. A TypeScript array that size is a file nobody
-- reads, that slows every build, and that ships to a browser which needed four
-- numbers out of it.
--
-- And it is a fact about the world, not a decision about the platform. FAO
-- republishes annually; a constant in the source would be a snapshot pretending
-- to be current, and updating it would mean a deploy. A row carries its own
-- year, so a query can ask for the latest and a new release is a load rather
-- than a release.
--
-- The engines stay in code. Crop coefficients, DSE ratings, service units — all
-- of those are the platform's reasoning and belong where they can be tested.
-- This is measurement, and measurement belongs in a table.

create table if not exists public.faostat_observations (
  id          bigserial primary key,

  -- Kept as FAOSTAT's own English labels rather than translated or mapped to
  -- the platform's crop keys. A mapping belongs in the application, where it
  -- can be corrected without touching the data; baking it in here would make
  -- the table a derivative that can no longer be checked against the source.
  area        text   not null,
  element     text   not null,
  item        text   not null,
  year        smallint not null,
  unit        text   not null,
  value       numeric not null,

  -- FAOSTAT's own confidence marker: E estimated, I imputed, A official, and so
  -- on. Carried because a comparison resting on an imputed figure deserves to
  -- be labelled as such rather than presented with the same weight as a
  -- reported one.
  flag        text,

  loaded_at   timestamptz not null default now(),

  unique (area, element, item, year)
);

-- The lookup the platform actually performs: this crop, this measure, these
-- countries, most recent year first.
create index if not exists faostat_lookup_idx
  on public.faostat_observations (item, element, year desc);

create index if not exists faostat_area_idx
  on public.faostat_observations (area, element, year desc);

alter table public.faostat_observations enable row level security;

-- Public data, published by the FAO for exactly this purpose. Readable by
-- everyone including anonymous visitors, because the comparison it powers is
-- shown on pages that do not require an account.
create policy faostat_public_read on public.faostat_observations
  for select using (true);

-- Written only by admins. A benchmark anyone could edit is not a benchmark.
create policy faostat_admin_write on public.faostat_observations
  for all using (is_admin()) with check (is_admin());
