-- الأساسُ الذي ليس في الهجرات — تجهيزةٌ مأخوذةٌ من الإنتاج.
--
-- WHY THIS FILE EXISTS
--
-- The oldest tables in this platform — profiles, projects, investments, lands,
-- seasons — were created before the migrations directory existed, and they are
-- still not in it. Every gate therefore has to conjure them, and until now each
-- one conjured its own: four scripts, four different `profiles`, one of them
-- carrying `publish_record` and the others not.
--
-- THE BUG THAT MADE THIS WORTH DOING
--
-- Every one of those stubs declared `role text default 'farmer'`.
--
-- There is no `farmer`. The production column is `user_role`, an enum whose
-- only values are `investor`, `admin` and `field_agent`. A `text` stub accepted
-- the value happily; the real column would have rejected every insert. It
-- changed no verdict — the guards test `= 'admin'` or ownership, and neither
-- cares what a non-admin is called — which is exactly why it survived four
-- gates and 147 checks without anyone noticing.
--
-- That is the failure mode a stub has and a fixture does not: it is not that
-- the test fails, it is that the test passes against a database that could not
-- exist. So the shapes below are read out of production rather than
-- remembered, enums included.
--
-- HOW TO REGENERATE
--
-- The shapes come from `information_schema.columns` and `pg_enum` on the
-- production project. When a base table changes, re-read them rather than
-- hand-editing here — the whole point is that this file is not written from
-- memory. Keys and constraints are added below, since those are the part a
-- column dump does not carry.
--
-- WHAT IT DELIBERATELY LEAVES OUT
--
-- No row-level security and no policies. Those belong to the migrations, and a
-- gate that invented its own policies would be grading its own homework. This
-- file provides only what the migrations assume already exists.

-- ===========================================================================
-- ١) الأنواع التعدادية — بقيمها الحقيقية
-- ===========================================================================

create type user_role        as enum ('investor', 'admin', 'field_agent');
create type investment_status as enum ('pending', 'confirmed', 'cancelled');
create type project_status   as enum ('draft', 'open', 'funded', 'in_progress', 'completed');
create type review_status    as enum ('submitted', 'approved', 'rejected');
create type risk_level       as enum ('low', 'medium', 'high');
create type stage_key        as enum ('land_prep', 'planting', 'establishment',
                                      'vegetative', 'flowering', 'maturity', 'harvest');
create type ledger_category  as enum ('seeds', 'fertiliser', 'pesticide', 'labour',
                                      'irrigation', 'transport', 'other', 'revenue');

-- ===========================================================================
-- ٢) الهوية — قابلةٌ للتبديل بين الفحوص
-- ===========================================================================

create schema if not exists auth;
create table auth.users (id uuid primary key);

-- في الإنتاج تأتي الهويّة من رمز الدخول. هنا تأتي من صفٍّ يُبدَّل، فيتصرّف
-- فحصٌ كمزارع وآخرُ كمدير وآخرُ كزائرٍ بلا حساب.
create table _who (uid uuid);
insert into _who values (null);

create or replace function auth.uid() returns uuid
  language sql stable as $$ select uid from _who $$;

-- ===========================================================================
-- ٣) الجداول
-- ===========================================================================

create table profiles (
  id                 uuid primary key,
  full_name          text not null default '',
  -- لا وجود لـ 'farmer'. والافتراضيُّ مستثمر: المنصّةُ تفرّق بالمِلكيّة لا بالدور.
  role               user_role not null default 'investor',
  phone              text,
  country            text,
  created_at         timestamptz not null default now(),
  completed_seasons  smallint not null default 0,
  reporting_rate     numeric not null default 0,
  publish_record     boolean not null default false
);

create table projects (
  id                        uuid primary key default gen_random_uuid(),
  slug                      text not null unique,
  name                      text not null,
  location                  text not null,
  description               text,
  total_feddans             numeric not null,
  price_per_share           numeric not null,
  total_shares              integer not null,
  shares_sold               integer not null default 0,
  status                    project_status not null default 'draft',
  risk_level                risk_level not null default 'medium',
  expected_annual_return    numeric,
  cover_image_url           text,
  created_by                uuid references profiles(id),
  created_at                timestamptz not null default now(),
  is_demo                   boolean not null default false,
  review_status             review_status not null default 'approved',
  submitted_by              uuid references profiles(id),
  review_note               text,
  risk_score                numeric,
  crop_key                  text,
  station_key               text,
  planting_month            smallint,
  irrigation                text,
  water_source              text,
  declared_water_per_feddan numeric,
  documents_on_file         smallint not null default 0,
  documents_required        smallint not null default 4,
  km_to_market              numeric
);

create table investments (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references projects(id),
  investor_id uuid not null references profiles(id),
  shares      integer not null,
  amount      numeric not null,
  status      investment_status not null default 'pending',
  created_at  timestamptz not null default now()
);

create table lands (
  id                 uuid primary key default gen_random_uuid(),
  owner_id           uuid not null references profiles(id),
  name               text not null,
  state              text not null,
  locality           text,
  village            text,
  latitude           numeric,
  longitude          numeric,
  feddans            numeric not null,
  station_key        text not null,
  water_source       text not null,
  water_per_feddan   numeric,
  soil_note          text,
  previous_crops     text,
  km_to_market       numeric,
  tenure             text not null default 'unspecified',
  documents_on_file  smallint not null default 0,
  documents_required smallint not null default 3,
  verification       text not null default 'unverified',
  verification_note  text,
  listed             boolean not null default false,
  created_at         timestamptz not null default now()
);

create table land_documents (
  id           uuid primary key default gen_random_uuid(),
  land_id      uuid not null references lands(id) on delete cascade,
  kind         text not null,
  storage_path text not null,
  caption      text,
  created_by   uuid references profiles(id),
  created_at   timestamptz not null default now(),
  captured_at  timestamptz,
  latitude     double precision,
  longitude    double precision
);

create table seasons (
  id                uuid primary key default gen_random_uuid(),
  owner_id          uuid not null references profiles(id),
  project_id        uuid references projects(id),
  name              text not null,
  location          text,
  crop_key          text not null,
  station_key       text not null,
  irrigation        text not null,
  feddans           numeric not null,
  budget_per_feddan numeric not null default 0,
  planting_date     date not null,
  harvest_date      date,
  status            text not null default 'active',
  created_at        timestamptz not null default now(),
  land_id           uuid references lands(id)
);

create table season_stages (
  id                uuid primary key default gen_random_uuid(),
  season_id         uuid not null references seasons(id) on delete cascade,
  stage_key         stage_key not null,
  stage_order       smallint not null,
  planned_start     date not null,
  planned_end       date not null,
  actual_start      date,
  actual_end        date,
  planned_water_m3  numeric not null default 0,
  budget            numeric not null default 0,
  completed         boolean not null default false,
  completed_at      timestamptz,
  note              text
);

create table stage_evidence (
  id           uuid primary key default gen_random_uuid(),
  stage_id     uuid not null references season_stages(id) on delete cascade,
  kind         text not null,
  url          text,
  caption      text,
  created_by   uuid references profiles(id),
  created_at   timestamptz not null default now(),
  storage_path text,
  captured_at  timestamptz,
  latitude     double precision,
  longitude    double precision
);

create table ledger_entries (
  id          uuid primary key default gen_random_uuid(),
  season_id   uuid not null references seasons(id) on delete cascade,
  stage_id    uuid references season_stages(id) on delete set null,
  category    ledger_category not null,
  amount      numeric not null,
  description text,
  entry_date  date not null default current_date,
  created_by  uuid references profiles(id),
  created_at  timestamptz not null default now()
);

create table notifications (
  id           uuid primary key default gen_random_uuid(),
  recipient_id uuid,
  kind         text not null,
  title        text,
  body         text,
  link         text,
  created_at   timestamptz not null default now(),
  constraint notifications_kind_check check (kind is not null)
);

-- ===========================================================================
-- ٤) الحارس الذي تستدعيه كلُّ سياسةٍ تقريباً
-- ===========================================================================

create or replace function public.is_admin() returns boolean
  language sql stable as $$
  select exists (select 1 from profiles where id = auth.uid() and role = 'admin') $$;

-- ===========================================================================
-- ٥) أدوار Supabase
-- ===========================================================================
--
-- `anon` هو الدورُ الذي يحمله المفتاحُ المنشور في كلّ صفحة، و`authenticated`
-- دورُ كلّ من سجّل دخوله — بما فيهم المدير. فالتفريقُ بين مديرٍ وغيرِه ليس
-- بالدور بل بـ `is_admin()` داخل السياسات.

create role anon          nologin;
create role authenticated nologin;
create role service_role  nologin;

-- ودورٌ عاديٌّ لا وجود له في الإنتاج، تستعمله بوّابةُ الصادر لتسأل: ماذا يرى
-- دورٌ مُنح كلَّ صلاحيات الجداول ولم يُمنح شيئاً بعدها؟ وهو أوسعُ من `anon`
-- عمداً، فما يُمنع عنه مُنع عن كلّ أحد.
create role app_user nologin;
