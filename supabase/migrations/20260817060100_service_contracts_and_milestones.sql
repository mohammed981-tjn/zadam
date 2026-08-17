-- التعاقد المرحلي: عقد لكل مرحلة، ودفعة لا تُفرَج إلا بإثبات.
--
-- The request this answers: separate financial contracting for each time-phase
-- of production, after a detailed feasibility study per phase, sequenced
-- against agreed schedules and progress.
--
-- What the platform had instead: ledger_entries, which records money already
-- spent, under categories like seeds and labour. Spending is not agreement.
-- Nothing recorded who owed what to whom, for which piece of work, releasable
-- on what proof. In a country where nobody will hand over a season's budget up
-- front, that missing record is the reason a deal does not start.
--
-- The shape here is deliberate: the contract is the relationship, the milestone
-- is the money. Splitting them lets one contract carry several tranches, and
-- lets a contract be scoped to exactly one production phase for those who want
-- a genuinely separate contract per phase — both readings of the request are
-- expressible, and the second is just a contract with stage_id set.

create type public.contract_status as enum (
  'draft',      -- مسودة
  'proposed',   -- معروض على الطرف الآخر
  'active',     -- سارٍ
  'completed',  -- منجز
  'cancelled',  -- ملغى
  'disputed'    -- متنازع عليه
);

create type public.milestone_status as enum (
  'pending',      -- لم تبدأ
  'in_progress',  -- جارية
  'submitted',    -- سُلّمت وتنتظر الاعتماد
  'approved',     -- معتمدة
  'paid',         -- مدفوعة
  'rejected'      -- مرفوضة
);

create table public.service_contracts (
  id           uuid primary key default gen_random_uuid(),
  project_id   uuid references projects(id) on delete set null,

  -- The production unit being served. Exactly one of these, enforced below:
  -- a contract serves a crop season or an animal herd, never both and never
  -- neither. This is what lets the same contracting machinery cover the plant
  -- and the livestock side without a second copy of it.
  season_id    uuid references seasons(id) on delete cascade,
  herd_id      uuid,  -- FK added in the livestock migration, which creates herds

  -- Optional narrowing to a single production phase. Set it and the contract is
  -- "the contract for land preparation"; leave it null and the contract spans
  -- the season with its phases as milestones.
  stage_id     uuid references season_stages(id) on delete set null,

  provider_id  uuid not null references service_providers(id) on delete restrict,
  client_id    uuid not null references auth.users(id) on delete cascade,

  title        text not null,
  status       contract_status not null default 'draft',
  currency     text not null default 'SDG',

  -- Derived from the milestones by trigger, never written by hand, so the
  -- headline figure cannot drift from the phases that make it up.
  total_amount numeric(14,2) not null default 0,

  signed_at    timestamptz,
  created_at   timestamptz not null default now(),

  constraint contract_one_production_unit
    check ((season_id is not null) <> (herd_id is not null))
);

create table public.contract_milestones (
  id           uuid primary key default gen_random_uuid(),
  contract_id  uuid not null references service_contracts(id) on delete cascade,
  seq          smallint not null,
  title        text not null,

  -- The catalogue entry this phase buys. Kept as a reference rather than copied
  -- so the service can be inspected, but unit/quantity/price are copied below.
  service_id   uuid references services(id) on delete set null,

  -- The price is frozen into the milestone on purpose. A provider who raises a
  -- catalogue price next month must not silently reprice a signed contract, and
  -- a milestone must stay readable after the service is delisted.
  unit         service_unit not null,
  quantity     numeric(12,2) not null check (quantity > 0),
  unit_price   numeric(14,2) not null check (unit_price >= 0),
  amount       numeric(14,2) generated always as (quantity * unit_price) stored,

  planned_start date,
  planned_end   date,
  actual_start  date,
  actual_end    date,

  status       milestone_status not null default 'pending',

  -- The per-phase feasibility study. jsonb rather than columns because its
  -- shape differs by service — a drone survey's study is not an irrigation
  -- network's — and because the app derives most of it from the FAO-56 engine
  -- rather than collecting it as free text.
  feasibility  jsonb,

  -- Set false only for phases with nothing physical to show. Defaults to true,
  -- because the entire point is that money follows proof.
  requires_evidence boolean not null default true,

  approved_by  uuid references auth.users(id),
  approved_at  timestamptz,
  note         text,

  unique (contract_id, seq)
);

-- Proof of delivery, stamped where and when it was taken.
--
-- Deliberately the same shape as stage_evidence, including the coordinates and
-- the capture time read from the photo's EXIF before compression. A payment
-- released against a photo that could have been taken anywhere, any time, is
-- not released against proof.
create table public.milestone_evidence (
  id           uuid primary key default gen_random_uuid(),
  milestone_id uuid not null references contract_milestones(id) on delete cascade,
  kind         text not null check (kind in ('photo','invoice','inspection','report','note')),
  storage_path text,
  caption      text,
  captured_at  timestamptz,
  latitude     double precision,
  longitude    double precision,
  created_by   uuid not null references auth.users(id),
  created_at   timestamptz not null default now()
);

create table public.contract_payments (
  id           uuid primary key default gen_random_uuid(),
  milestone_id uuid not null references contract_milestones(id) on delete cascade,
  kind         text not null check (kind in ('advance','release','retention','refund')),
  amount       numeric(14,2) not null check (amount > 0),
  status       text not null default 'scheduled'
                 check (status in ('scheduled','released','held')),
  released_at  timestamptz,
  released_by  uuid references auth.users(id),
  note         text,
  created_at   timestamptz not null default now()
);

create index contracts_client_idx   on service_contracts (client_id, status);
create index contracts_provider_idx on service_contracts (provider_id, status);
create index contracts_season_idx   on service_contracts (season_id);
create index milestones_contract_idx on contract_milestones (contract_id, seq);
create index milestone_evidence_idx  on milestone_evidence (milestone_id);

-- ---------------------------------------------------------------------------
-- The gate: approval requires proof, and order.
--
-- Modelled on enforce_stage_completion, which already refuses to close a season
-- stage without an uploaded file and without the earlier stages closed. The
-- same discipline matters more here, because here the consequence is money
-- rather than a tick — so the rule lives in the database, where neither a
-- rewritten client nor a direct API call can go around it.
-- ---------------------------------------------------------------------------
create or replace function public.enforce_milestone_approval()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  proof_count int;
  prior_open  int;
begin
  if new.status = 'approved' and old.status is distinct from 'approved' then
    if new.requires_evidence then
      select count(*) into proof_count
        from milestone_evidence
       where milestone_id = new.id and storage_path is not null;

      if proof_count < 1 then
        raise exception 'لا يمكن اعتماد المرحلة قبل رفع إثبات تنفيذ واحد على الأقل — الملاحظة النصية وحدها ليست دليلاً';
      end if;
    end if;

    select count(*) into prior_open
      from contract_milestones
     where contract_id = new.contract_id
       and seq < new.seq
       and status not in ('approved','paid');

    if prior_open > 0 then
      raise exception 'لا يمكن اعتماد هذه المرحلة قبل اعتماد % مرحلة سابقة', prior_open;
    end if;

    new.approved_at := now();
    new.approved_by := auth.uid();
    if new.actual_end is null then
      new.actual_end := current_date;
    end if;
  end if;

  -- Payment is a step beyond approval, never a substitute for it.
  if new.status = 'paid' and old.status not in ('approved','paid') then
    raise exception 'لا يمكن تسجيل الدفع قبل اعتماد المرحلة';
  end if;

  return new;
end $$;

create trigger contract_milestones_approval_gate
before update on public.contract_milestones
for each row execute function public.enforce_milestone_approval();

-- Keep the contract total equal to the sum of its phases, always.
create or replace function public.sync_contract_total()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target uuid := coalesce(new.contract_id, old.contract_id);
begin
  update service_contracts c
     set total_amount = coalesce(
           (select sum(m.amount) from contract_milestones m where m.contract_id = target), 0)
   where c.id = target;
  return null;
end $$;

create trigger contract_milestones_total_sync
after insert or update or delete on public.contract_milestones
for each row execute function public.sync_contract_total();

-- ---------------------------------------------------------------------------
-- Row security: a contract has two sides, and each sees only its own.
--
-- Every other table here walks ownership up one chain to a single owner. A
-- contract is the first thing on the platform with two legitimate parties, so
-- the predicate names both: the client who commissioned the work and the
-- account behind the provider who does it.
-- ---------------------------------------------------------------------------
create or replace function public.can_see_contract(c_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
      from service_contracts c
      left join service_providers p on p.id = c.provider_id
     where c.id = c_id
       and (c.client_id = auth.uid() or p.owner_id = auth.uid() or is_admin())
  );
$$;

alter table public.service_contracts    enable row level security;
alter table public.contract_milestones  enable row level security;
alter table public.milestone_evidence   enable row level security;
alter table public.contract_payments    enable row level security;

create policy contracts_parties on public.service_contracts
  for all using (
    client_id = auth.uid()
    or is_admin()
    or exists (select 1 from service_providers p
                where p.id = provider_id and p.owner_id = auth.uid())
  )
  with check (
    client_id = auth.uid()
    or is_admin()
    or exists (select 1 from service_providers p
                where p.id = provider_id and p.owner_id = auth.uid())
  );

create policy milestones_parties on public.contract_milestones
  for all using (can_see_contract(contract_id))
  with check (can_see_contract(contract_id));

create policy milestone_evidence_parties on public.milestone_evidence
  for all using (
    exists (select 1 from contract_milestones m
             where m.id = milestone_id and can_see_contract(m.contract_id))
  )
  with check (
    exists (select 1 from contract_milestones m
             where m.id = milestone_id and can_see_contract(m.contract_id))
  );

create policy payments_parties on public.contract_payments
  for all using (
    exists (select 1 from contract_milestones m
             where m.id = milestone_id and can_see_contract(m.contract_id))
  )
  with check (
    exists (select 1 from contract_milestones m
             where m.id = milestone_id and can_see_contract(m.contract_id))
  );
