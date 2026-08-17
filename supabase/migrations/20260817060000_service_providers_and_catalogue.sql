-- الرافعة الخدمية: من يقدّم الخدمة، وماذا يقدّم.
--
-- The platform can describe land, crops, water and money, and has no way to
-- describe the people who do the work. user_role is investor | admin |
-- field_agent, so a group of agricultural engineers forming a contracting arm
-- has nowhere to exist — they can hold an account and nothing more.
--
-- Two tables fix that. A provider is an organisation; a service is one priced,
-- offerable thing that organisation does. They are separate because a single
-- engineering office offers drone survey and irrigation design and extension
-- visits, each with its own unit and its own price, and because a service has
-- to be referenced from a contract milestone long after the provider's own
-- details have changed.

-- What kind of outfit this is. Kept coarse on purpose: it drives filtering and
-- iconography, not billing.
create type public.service_kind as enum (
  'engineering_office',   -- مكتب هندسة زراعية
  'drone',                -- خدمات الطائرات المسيّرة
  'irrigation',           -- الري الحديث
  'mechanization',        -- الميكنة وإعداد الأرض
  'advisory',             -- الإرشاد ونقل المعرفة
  'veterinary',           -- الخدمات البيطرية
  'laboratory',           -- تحاليل التربة والمياه
  'logistics'             -- النقل والتخزين
);

-- The unit a service is sold in. This is the field that makes a contract
-- computable rather than negotiated in prose: a quantity in a known unit can be
-- derived from the season it serves (feddans from the season, m³ from the
-- FAO-56 water requirement already computed in src/lib/agronomy.ts, head from
-- the herd) instead of typed in and argued about later.
create type public.service_unit as enum (
  'feddan',   -- بالفدان
  'hour',     -- بالساعة
  'visit',    -- بالزيارة
  'head',     -- بالرأس
  'm3',       -- بالمتر المكعب
  'month',    -- بالشهر
  'lump'      -- مقطوعية
);

-- Which side of production a service belongs to. This is the column that
-- answers the request for a separate plant and livestock section without
-- splitting the platform in two: one catalogue, filtered.
create type public.production_kind as enum ('plant', 'livestock', 'both');

-- The standard operations, as distinct from crop phenology.
--
-- season_stages.stage_key is a plant's biology — land_prep, planting,
-- vegetative, flowering, harvest. It cannot express "survey this land by drone"
-- or "install the irrigation network", because those are not things the crop
-- does, they are things a contractor delivers. That distinction is the whole
-- reason this enum exists alongside the other one: services are scheduled
-- against the biological calendar but are contracted independently of it.
create type public.service_key as enum (
  'drone_survey',        -- مسح ورفع مساحي بالدرون
  'topo_survey',         -- رفع طوبوغرافي
  'soil_test',           -- تحليل تربة
  'water_test',          -- تحليل مياه
  'land_clearing',       -- إزالة وتنظيف
  'land_leveling',       -- تسوية بالليزر
  'irrigation_design',   -- تصميم شبكة ري
  'irrigation_install',  -- تنفيذ شبكة ري
  'mechanized_planting', -- زراعة ميكانيكية
  'crop_protection',     -- مكافحة
  'fertigation',         -- تسميد
  'harvest_service',     -- حصاد
  'extension_visit',     -- زيارة إرشادية
  'feasibility_study',   -- دراسة جدوى
  'vet_program',         -- برنامج بيطري
  'feed_plan',           -- برنامج تغذية
  'herd_health',         -- متابعة صحة القطيع
  'transport'            -- نقل
);

create table public.service_providers (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references auth.users(id) on delete cascade,
  name        text not null,
  kind        service_kind not null,
  bio         text,
  phone       text,
  -- States/regions served. Free text rather than an enum because the platform's
  -- station list covers six locations and the country has eighteen states —
  -- constraining this now would exclude providers the platform cannot yet plan
  -- for, which is the wrong way round.
  regions     text[] not null default '{}',
  -- An unverified provider is listed but not contractable. Verification is an
  -- admin act, and it is recorded rather than implied so it can be audited.
  verified_at timestamptz,
  verified_by uuid references auth.users(id),
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

create table public.services (
  id              uuid primary key default gen_random_uuid(),
  provider_id     uuid not null references service_providers(id) on delete cascade,
  service_key     service_key not null,
  title           text not null,
  description     text,
  unit            service_unit not null,
  price_per_unit  numeric(14,2) not null check (price_per_unit >= 0),
  min_units       numeric(12,2) not null default 1 check (min_units > 0),
  production_kind production_kind not null default 'plant',
  -- How long the provider needs between order and start. Feeds the scheduler:
  -- a milestone cannot be planned to start sooner than this.
  lead_time_days  smallint not null default 0 check (lead_time_days >= 0),
  active          boolean not null default true,
  created_at      timestamptz not null default now(),

  unique (provider_id, service_key, title)
);

create index services_lookup_idx
  on services (production_kind, service_key) where active;

alter table public.service_providers enable row level security;
alter table public.services          enable row level security;

-- A catalogue nobody can read is not a catalogue. Verified and active
-- providers are public, exactly like open projects; the rest are visible to
-- their owner and to admins while they are being set up or after suspension.
create policy providers_public_read on public.service_providers
  for select using (active and verified_at is not null);

create policy providers_own on public.service_providers
  for all using (owner_id = auth.uid() or is_admin())
  with check (owner_id = auth.uid() or is_admin());

-- Verification is deliberately not self-service: the owner policy above would
-- otherwise let a provider mark itself verified. Admins only.
create policy providers_verify on public.service_providers
  for update using (is_admin()) with check (is_admin());

create policy services_public_read on public.services
  for select using (
    active and exists (
      select 1 from service_providers p
      where p.id = services.provider_id
        and p.active and p.verified_at is not null
    )
  );

create policy services_own on public.services
  for all using (
    exists (
      select 1 from service_providers p
      where p.id = services.provider_id
        and (p.owner_id = auth.uid() or is_admin())
    )
  )
  with check (
    exists (
      select 1 from service_providers p
      where p.id = services.provider_id
        and (p.owner_id = auth.uid() or is_admin())
    )
  );

-- Self-verification, blocked at the row rather than trusted to the UI.
--
-- providers_own grants the owner UPDATE, and an owner who can set any column
-- can set verified_at. RLS has no column-level grant to express "everything
-- except this", so the rule lives in a trigger: an admin may change the
-- verification fields, nobody else may, whatever request they craft.
create or replace function public.guard_provider_verification()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (new.verified_at is distinct from old.verified_at
      or new.verified_by is distinct from old.verified_by)
     and not is_admin() then
    raise exception 'توثيق مقدّم الخدمة من صلاحية الإدارة وحدها';
  end if;

  if new.verified_at is not null and old.verified_at is null then
    new.verified_by := auth.uid();
  end if;

  return new;
end $$;

create trigger service_providers_verification_guard
before update on public.service_providers
for each row execute function public.guard_provider_verification();
