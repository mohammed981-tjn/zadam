-- نطاق المشاهدة في مرجعية FAOSTAT.
--
-- The table was built for one FAOSTAT domain — Crops and livestock products —
-- and its key is (area, element, item, year). Two more domains are arriving:
-- Producer Prices and Trade of crops and livestock products.
--
-- Strictly, the key still holds: "Producer Price (USD/tonne)" and "Export
-- quantity" are element names that appear in no other domain, so nothing can
-- collide. The column is added anyway, for two reasons that outlive the
-- collision argument.
--
-- The first is that the safety is accidental. It rests on FAO never reusing an
-- element label across domains, which is a promise FAO has not made. A key that
-- is correct by luck is a key that breaks on someone else's release note.
--
-- The second is provenance. Every row in this table can be traced back to a
-- published FAOSTAT bulk file, and which file is part of what the row means. A
-- yield and a producer price are answers to different questions, and a reader
-- comparing them ought to be able to see that from the row rather than by
-- knowing the element vocabulary by heart.
--
-- Existing rows are Crops and livestock products, so QCL is both the default
-- and the correct backfill.

alter table public.faostat_observations
  add column if not exists domain text not null default 'QCL';

comment on column public.faostat_observations.domain is
  'FAOSTAT domain code: QCL crops and livestock products, PP producer prices, TCL trade.';

alter table public.faostat_observations
  drop constraint if exists faostat_observations_area_element_item_year_key;

create unique index if not exists faostat_observations_key
  on public.faostat_observations (domain, area, element, item, year);

-- The lookups the platform performs are always inside one domain: "what does a
-- tonne of sorghum fetch", "what is the yield", "how much was exported". Both
-- indexes lead with the domain for that reason.
drop index if exists public.faostat_lookup_idx;
drop index if exists public.faostat_area_idx;

create index if not exists faostat_lookup_idx
  on public.faostat_observations (domain, item, element, year desc);

create index if not exists faostat_area_idx
  on public.faostat_observations (domain, area, element, year desc);
