-- ما يقوم عليه الإنتاج ولا يحمله الأساس المحلّيّ: جدولا leads وfeedback بأعمدتهما،
-- وأدوار Supabase، وقائمةُ الصلاحيّات الافتراضيّة كما هي عندهم (تمنح كلَّ جديد لـanon وauthenticated).
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
end $$;

create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(), full_name text, contact text, role text,
  interest text, message text, created_at timestamptz not null default now());
create table if not exists public.feedback (
  id uuid primary key default gen_random_uuid(), author_id uuid, display_name text, contact text,
  page_path text, kind text, body text, status text default 'new', created_at timestamptz not null default now());

alter default privileges for role postgres in schema public grant all on tables to anon, authenticated;
alter default privileges for role postgres in schema public grant all on functions to anon, authenticated;
alter default privileges for role postgres in schema public grant all on sequences to anon, authenticated;
