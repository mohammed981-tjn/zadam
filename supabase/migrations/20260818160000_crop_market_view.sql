-- منظور السوق لكل محصول — الغلّة والسعر في صفٍّ واحد.
--
-- The phased feasibility study needs four numbers per crop: what Sudan yields,
-- what a comparable country yields, what the crop sells for, and which of those
-- prices is the trustworthy one. All four are already in faostat_observations,
-- spread across three domains and thousands of rows.
--
-- WHY A VIEW RATHER THAN QUERIES IN THE APPLICATION
--
-- The alternative was three PostgREST calls and a reduce in TypeScript. Two
-- reasons against it.
--
-- FAOSTAT item names carry commas and parentheses — "Onions and shallots, dry
-- (excluding dehydrated)", "Groundnuts, excluding shelled". Passing those
-- through an `in.(...)` filter means trusting a quoting rule at the edge of the
-- stack for correctness of the whole study, and a mis-quoted item does not
-- error: it silently returns nothing, and a crop quietly loses its price.
--
-- And the aggregation is the analysis. Deciding that the comparison is Egypt
-- and the peer median — never the world maximum, which is a Belgian glasshouse
-- at 452 t/ha of tomatoes — is reasoning that deserves to sit in one reviewable
-- place rather than being reassembled by whichever screen happens to need it.
--
-- security_invoker means the view is read with the caller's own permissions, so
-- the public-read policy on faostat_observations governs it rather than being
-- bypassed. The data is public either way; inheriting the policy keeps it that
-- way by construction instead of by coincidence.

create or replace view public.crop_market
with (security_invoker = on) as
with peers(area) as (
  values ('Egypt'), ('Ethiopia'), ('India'), ('Niger'),
         ('Iraq'), ('Algeria'), ('Saudi Arabia')
),
-- The most recent year each item actually has a Sudanese yield for. Fixing a
-- single year across all crops would drop any crop FAO happened to publish late.
latest as (
  select item, max(year) as year
  from public.faostat_observations
  where domain = 'QCL' and element = 'Yield' and area = 'Sudan'
  group by item
),
yields as (
  select o.item, o.area, o.value as kg_ha, o.year
  from public.faostat_observations o
  join latest l on l.item = o.item and l.year = o.year
  where o.domain = 'QCL' and o.element = 'Yield'
),
-- Sudan's own export unit value: money received divided by tonnes shipped.
sudan_price as (
  select item,
         sum(value) filter (where element = 'Export value') * 1000
           / nullif(sum(value) filter (where element = 'Export quantity'), 0)
           as usd_per_tonne
  from public.faostat_observations
  where domain = 'TCL' and area = 'Sudan' and year >= 2022
  group by item
),
-- The fallback. Averaged over recent years because a single year of one
-- country's farm gate is noisier than the thing it is standing in for.
regional_price as (
  select item, avg(value) as usd_per_tonne
  from public.faostat_observations
  where domain = 'PP'
    and area in (select area from peers)
    and year >= 2022
  group by item
)
select
  l.item,
  l.year,
  (select kg_ha from yields y where y.item = l.item and y.area = 'Sudan')
    as sudan_kg_ha,
  (select kg_ha from yields y where y.item = l.item and y.area = 'Egypt')
    as egypt_kg_ha,
  (select percentile_cont(0.5) within group (order by kg_ha)
     from yields y where y.item = l.item and y.area in (select area from peers))
    as peer_median_kg_ha,
  sp.usd_per_tonne as sudan_export_usd_per_tonne,
  rp.usd_per_tonne as regional_producer_usd_per_tonne
from latest l
left join sudan_price sp on sp.item = l.item
left join regional_price rp on rp.item = l.item;

comment on view public.crop_market is
  'Yield and price per FAOSTAT item: Sudan, Egypt, the arid peer median, and both price bases. Feeds the phased feasibility study.';

grant select on public.crop_market to anon, authenticated;
