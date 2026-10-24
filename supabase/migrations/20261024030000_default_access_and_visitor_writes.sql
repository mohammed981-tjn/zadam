-- الصلاحيّات الافتراضيّة، وإدراج الملفّ الشخصيّ، وسجلّ الأدوار، وكتابات الزائر (البند ١٥٩).
--
-- The review of 23 October (DB-11, DB-13, DB-15, SEC-18, DB-19) found four small things that
-- share one cause: what the database grants by default is more than what anyone decided.
--
--   - Every function the database creates is executable by PUBLIC, and every table and
--     sequence the migrations create is granted to `anon` and `authenticated` by Supabase's
--     default ACL. Each migration then revokes what it should not give (and the gates
--     prove it), so the safe state has been kept by discipline, one migration at a time.
--     Now the default is the safe state: a function or table made by a migration reaches no
--     one until the migration grants it, which every migration here already does.
--   - Trigger functions need no EXECUTE for anyone: a trigger runs whoever fires it, and
--     the privilege is checked when the trigger is created. Eleven already had it revoked
--     by their own migrations; the rest are revoked here.
--   - `profiles_insert` checks the id and not the role, so a signed-in user without a
--     profile row could insert themselves as «admin». handle_new_user creates the row at
--     signup so this is not open in practice, but nothing in the database says so.
--   - A change of role leaves no trace (DB-15); the second administrator is a deliberate
--     decision of the owner (22 October) that the database could not show.
--   - `leads` and `feedback` take an INSERT from anyone, with no ceiling on length or
--     frequency. The forms (and the app's own rate limit) are the only brake.
--
-- Nothing is dropped, nothing existing is edited, and no row is touched. The new defaults
-- apply only to what is created after this migration.

-- ═══════════════════════════════════════════════════════════════════════════
-- ١) دوالّ الزنادات لا يستدعيها أحد
-- ═══════════════════════════════════════════════════════════════════════════

do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as sig
      from pg_proc p
     where p.pronamespace = 'public'::regnamespace
       and p.prorettype = 'trigger'::regtype
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', f.sig);
  end loop;
end $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- ٢) ما يُمنح افتراضيّاً لما سيُنشأ بعد اليوم
-- ═══════════════════════════════════════════════════════════════════════════

alter default privileges for role postgres revoke execute on functions from public;
alter default privileges for role postgres in schema public revoke all on functions from anon, authenticated;
alter default privileges for role postgres in schema public revoke all on tables from anon, authenticated;
alter default privileges for role postgres in schema public revoke all on sequences from anon, authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- ٣) الملفّ الشخصيّ: الدور عند الإدراج، وسجلّ التغيير
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.profile_role_insert_gate()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is not null and not is_admin() and new.role::text not in ('investor', 'farmer') then
    raise exception 'يُنشأ الملفّ الشخصيّ مزارعاً أو مستثمراً؛ ويمنح غيرَ ذلك المالك.';
  end if;
  return new;
end;
$$;

create trigger profiles_role_insert_gate
  before insert on public.profiles
  for each row execute function public.profile_role_insert_gate();

create table if not exists public.role_changes (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null,
  old_role   text,
  new_role   text not null,
  changed_by uuid,
  changed_at timestamptz not null default now()
);

alter table public.role_changes enable row level security;
revoke all on public.role_changes from public, anon, authenticated;
grant select on public.role_changes to authenticated;
create policy role_changes_admin_read on public.role_changes
  for select to authenticated using (is_admin());

create or replace function public.log_role_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into role_changes (user_id, old_role, new_role, changed_by)
  values (new.id, old.role::text, new.role::text, auth.uid());
  return new;
end;
$$;

create trigger profiles_role_change_log
  after update of role on public.profiles
  for each row when (old.role is distinct from new.role)
  execute function public.log_role_change();

-- ═══════════════════════════════════════════════════════════════════════════
-- ٤) كتابات الزائر: سقفُ الطول وسقفُ الازدحام
-- ═══════════════════════════════════════════════════════════════════════════

-- Only what arrives through the API (the roles `anon` and `authenticated`, read from the `role`
-- setting because this function runs as its owner) is held to these ceilings. An hour's worth of three hundred is far above any real day of this platform, and
-- far below what a script can post: it turns a flood into a refusal instead of a full table.
create or replace function public.visitor_write_gate()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(current_setting('role', true), '') in ('anon', 'authenticated') then
    if tg_table_name = 'leads' then
      if length(coalesce(new.full_name, '')) > 120 or length(coalesce(new.contact, '')) > 200
         or length(coalesce(new.interest, '')) > 200 or length(coalesce(new.message, '')) > 2000 then
        raise exception 'النصّ أطول من المسموح.';
      end if;
      if (select count(*) from leads where created_at > now() - interval '1 hour') >= 300 then
        raise exception 'الطلبات كثيرةٌ الآن. أعد المحاولة بعد قليل.';
      end if;
    else
      if length(coalesce(new.display_name, '')) > 120 or length(coalesce(new.contact, '')) > 200
         or length(coalesce(new.page_path, '')) > 300 then
        raise exception 'النصّ أطول من المسموح.';
      end if;
      if (select count(*) from feedback where created_at > now() - interval '1 hour') >= 300 then
        raise exception 'الملاحظات كثيرةٌ الآن. أعد المحاولة بعد قليل.';
      end if;
    end if;
  end if;
  return new;
end;
$$;

create trigger leads_visitor_gate
  before insert on public.leads
  for each row execute function public.visitor_write_gate();
create trigger feedback_visitor_gate
  before insert on public.feedback
  for each row execute function public.visitor_write_gate();

revoke execute on function public.profile_role_insert_gate() from public, anon, authenticated;
revoke execute on function public.log_role_change() from public, anon, authenticated;
revoke execute on function public.visitor_write_gate() from public, anon, authenticated;
