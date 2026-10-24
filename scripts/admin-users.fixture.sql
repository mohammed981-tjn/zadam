-- ما في auth على Supabase ولا يحمله الأساس المحلّيّ: أعمدة المستخدمين والهويّات.
alter table auth.users
  add column if not exists email text,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists last_sign_in_at timestamptz,
  add column if not exists email_confirmed_at timestamptz,
  add column if not exists raw_user_meta_data jsonb not null default '{}';
create table if not exists auth.identities (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null);
alter table public.profiles add column if not exists phone text;
