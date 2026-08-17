-- الجزء الحيواني: إنتاج لا مقالات.
--
-- 'livestock' already existed on this platform — as a topic on knowledge_entries,
-- an article category. A farmer could read about herds and could not run one.
-- Every operational column was a plant's: crop_key, feddans, planting_date,
-- harvest_date, water in m³ per feddan.
--
-- A herd is to the animal side what a season is to the crop side, so it is
-- shaped like one: an owner, an optional project and land, a start and an end,
-- a status, and an ordered plan of phases underneath it. Deliberately a sibling
-- of seasons rather than a generalisation of it — collapsing both into one
-- "production cycle" table would mean rewriting the working, tested crop path
-- to gain symmetry nobody asked for.
--
-- What is shared instead is the part that matters commercially: service
-- contracts point at a season or a herd, so the whole contracting and
-- milestone-payment machinery serves both sides without a second copy.

create type public.livestock_species as enum (
  'cattle',   -- أبقار
  'sheep',    -- ضأن
  'goat',     -- ماعز
  'camel',    -- إبل
  'poultry',  -- دواجن
  'fish'      -- أسماك
);

create type public.herd_purpose as enum (
  'meat',      -- لحوم
  'dairy',     -- ألبان
  'eggs',      -- بيض
  'breeding',  -- تربية وإكثار
  'fattening'  -- تسمين
);

-- The animal production phases, in the order they occur. The counterpart of
-- stage_key, and just as much a biological calendar rather than a service one —
-- what a contractor delivers against these is a service_key, same as on the
-- crop side.
create type public.herd_stage_key as enum (
  'acquisition',  -- الاقتناء
  'quarantine',   -- الحجر الصحي
  'conditioning', -- التهيئة
  'breeding',     -- التلقيح
  'gestation',    -- الحمل
  'rearing',      -- التربية
  'fattening',    -- التسمين
  'production',   -- الإنتاج
  'offtake'       -- التسويق
);

create table public.herds (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references auth.users(id) on delete cascade,
  project_id  uuid references projects(id) on delete set null,
  land_id     uuid references lands(id) on delete set null,

  name        text not null,
  species     livestock_species not null,
  breed       text,
  head_count  integer not null check (head_count > 0),
  purpose     herd_purpose not null,

  start_date  date not null,
  end_date    date,
  status      text not null default 'active'
                check (status in ('active','completed','cancelled')),
  created_at  timestamptz not null default now()
);

create table public.herd_stages (
  id            uuid primary key default gen_random_uuid(),
  herd_id       uuid not null references herds(id) on delete cascade,
  stage_key     herd_stage_key not null,
  stage_order   smallint not null,

  planned_start date,
  planned_end   date,
  actual_start  date,
  actual_end    date,

  -- Feed is to a herd what water is to a crop: the input that dominates the
  -- budget and the one a plan is worth checking against.
  planned_feed_kg numeric(12,2),
  budget        numeric(14,2),

  completed     boolean not null default false,
  completed_at  timestamptz,
  note          text,

  unique (herd_id, stage_order)
);

create index herds_owner_idx   on herds (owner_id, status);
create index herd_stages_idx   on herd_stages (herd_id, stage_order);

-- The herd_id column on service_contracts was created before this table
-- existed; give it its foreign key now that there is something to point at.
alter table public.service_contracts
  add constraint service_contracts_herd_id_fkey
  foreign key (herd_id) references herds(id) on delete cascade;

create index contracts_herd_idx on service_contracts (herd_id);

alter table public.herds       enable row level security;
alter table public.herd_stages enable row level security;

-- Same ownership shape as seasons and season_stages, so the rule is one anyone
-- who has read the crop side already knows.
create policy herds_own on public.herds
  for all using (owner_id = auth.uid() or is_admin())
  with check (owner_id = auth.uid() or is_admin());

create policy herd_stages_own on public.herd_stages
  for all using (
    exists (select 1 from herds h
             where h.id = herd_stages.herd_id
               and (h.owner_id = auth.uid() or is_admin()))
  )
  with check (
    exists (select 1 from herds h
             where h.id = herd_stages.herd_id
               and (h.owner_id = auth.uid() or is_admin()))
  );

-- Sequential completion, matching season_stages.
--
-- No evidence requirement here, unlike the crop stages: on the animal side the
-- proof that matters commercially hangs off contract milestones, which have
-- their own gate and their own money behind them. Requiring a second, separate
-- upload to tick a planning phase would be ceremony without a payment attached.
create or replace function public.enforce_herd_stage_completion()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  prior_open int;
begin
  if new.completed and not coalesce(old.completed, false) then
    select count(*) into prior_open
      from herd_stages
     where herd_id = new.herd_id
       and stage_order < new.stage_order
       and completed = false;

    if prior_open > 0 then
      raise exception 'لا يمكن اعتماد هذه المرحلة قبل اعتماد % مرحلة سابقة', prior_open;
    end if;

    new.completed_at := now();
  end if;

  return new;
end $$;

create trigger herd_stages_completion_gate
before update on public.herd_stages
for each row execute function public.enforce_herd_stage_completion();
