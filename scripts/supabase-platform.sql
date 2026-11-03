-- ما يوفّره Supabase نفسه ولا تحمله scripts/base-schema.sql — لبوّابة السلسلة الكاملة وحدها.
--
-- base-schema.sql يجهّز الجداول الأقدم من الهجرات بأقلّ ما يحتاجه كلّ حارس. أمّا verify-migration-chain.sh فيطبّق
-- الهجرات كلّها بالترتيب كما طُبّقت على الموقع، فيحتاج ما يقدّمه Supabase لكلّ مشروع: أعمدة auth.users، وجدولَي
-- الهويّات والجلسات، ومخطّط الامتدادات، ودور PostgREST. القيم هنا من شكلها على Supabase، لا من الذاكرة؛ وما لا
-- تقرؤه أيّ هجرة لا يُضاف.
--
-- والصلاحيّات الافتراضيّة كما يبدأ بها كلّ مشروع Supabase: كلّ ما يُنشأ في public مفتوحٌ للأدوار الثلاثة، حتّى
-- سحبتها 20261024030000. فلا تُمنح هنا صلاحيّةٌ بعد ذلك، وكلّ جدولٍ أو دالّةٍ تنساها هجرةٌ لاحقة يظهر مغلقاً كما
-- في الموقع (فحص 3 نوفمبر، db-b-1 وdb-b-2: بوّابات كلّ ميزة كانت تمنح الصلاحيّات بنفسها فأخفت النسيان).

alter table storage.buckets add column if not exists name text;
alter table storage.buckets add column if not exists owner uuid;
alter table storage.buckets add column if not exists created_at timestamptz default now();
alter table storage.buckets add column if not exists updated_at timestamptz default now();
alter table storage.objects add column if not exists updated_at timestamptz default now();
alter table storage.objects add column if not exists metadata jsonb;
alter table storage.objects add column if not exists path_tokens text[];
-- Supabase keeps extensions in their own schema, on the search path.
create schema if not exists extensions;
grant usage on schema extensions to anon, authenticated, service_role;
alter extension vector set schema extensions;
alter database postgres set search_path = "$user", public, extensions;
-- The parts of Supabase's auth schema the migrations read (columns as on the platform).
alter table auth.users add column if not exists email text;
alter table auth.users add column if not exists phone text;
alter table auth.users add column if not exists created_at timestamptz default now();
alter table auth.users add column if not exists last_sign_in_at timestamptz;
alter table auth.users add column if not exists email_confirmed_at timestamptz;
alter table auth.users add column if not exists raw_user_meta_data jsonb default '{}';
alter table auth.users add column if not exists raw_app_meta_data jsonb default '{}';
alter table auth.users add column if not exists banned_until timestamptz;
alter table auth.users add column if not exists deleted_at timestamptz;
create table if not exists auth.identities (id uuid primary key default gen_random_uuid(), user_id uuid references auth.users(id), provider text, identity_data jsonb, created_at timestamptz default now());
create table if not exists auth.sessions (id uuid primary key default gen_random_uuid(), user_id uuid references auth.users(id), aal text, created_at timestamptz default now());
create table if not exists auth.mfa_factors (id uuid primary key default gen_random_uuid(), user_id uuid references auth.users(id), factor_type text, status text, created_at timestamptz default now());
create or replace function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
create or replace function auth.role() returns text language sql stable as $$ select coalesce(auth.jwt() ->> 'role', current_user) $$;
grant usage on schema auth to anon, authenticated, service_role;
-- PostgREST's login role on the platform.
do $$ begin if not exists (select 1 from pg_roles where rolname = 'authenticator') then create role authenticator noinherit; end if; end $$;
grant anon, authenticated, service_role to authenticator;
