-- بوّابةُ الصلاحيّات الافتراضيّة وكتابات الزائر.
\set ON_ERROR_STOP on
\set QUIET on

create table if not exists _score (fails integer not null default 0);
delete from _score; insert into _score values (0);
create or replace function _fail(label text, why text) returns void language plpgsql as $$
begin raise notice '  FAIL  % — %', label, why; update _score set fails = fails + 1; end $$;
create or replace function _pass(label text) returns void language plpgsql as $$
begin raise notice '  PASS  %', label; end $$;
create or replace function _act_as(p uuid) returns void language plpgsql as $$ begin update _who set uid = p; end $$;
create or replace function _eq(got anyelement, want anyelement, label text) returns void language plpgsql as $$
begin
  if got is not distinct from want then perform _pass(label || ' — ' || coalesce(got::text, 'null'));
  else perform _fail(label, 'جاء ' || coalesce(got::text, 'null') || ' والمتوقَّع ' || coalesce(want::text, 'null')); end if;
end $$;
create or replace function _refuses(q text, label text) returns void language plpgsql as $$
begin
  execute q; perform _fail(label, 'نُفِّذ ولم يُرفض');
exception when others then
  if sqlerrm ~* 'permission denied|row-level security' then perform _fail(label, 'رُفض بالصلاحيّة لا بالزناد: ' || sqlerrm);
  else perform _pass(label || ' — ' || left(sqlerrm, 60)); end if;
end $$;
create or replace function _works(q text, label text, want_rows integer default null) returns void language plpgsql as $$
declare n integer;
begin
  execute q; get diagnostics n = row_count;
  if want_rows is not null and n <> want_rows then perform _fail(label, 'غيّر ' || n || ' صفّاً والمتوقَّع ' || want_rows);
  else perform _pass(label); end if;
exception when others then perform _fail(label, 'رُفض والمفروض أن يعمل: ' || sqlerrm); end $$;

-- أدوات الفحص نفسها أُنشئت بعد الهجرة، فلا تبلغ أحداً حتى تُمنح كأيّ شيءٍ جديد.
grant update, select on _score to anon, authenticated;
grant select on _who to anon, authenticated;
grant execute on function _fail(text, text), _pass(text), _act_as(uuid), _eq(anyelement, anyelement, text),
  _refuses(text, text), _works(text, text, integer) to anon, authenticated;

\echo ''
\echo '=========================================================================='
\echo 'أ) ما يُنشأ بعد الهجرة لا يبلغ أحداً حتى يُمنح'
\echo '=========================================================================='

create function public._new_fn() returns int language sql as $$ select 1 $$;
create table public._new_tbl (id int);
create sequence public._new_seq;

do $$
begin
  perform _eq(has_function_privilege('anon', 'public._new_fn()', 'execute'), false, 'دالّةٌ جديدة لا يستدعيها الزائر');
  perform _eq(has_function_privilege('authenticated', 'public._new_fn()', 'execute'), false, 'ولا المسجَّل');
  perform _eq(has_table_privilege('anon', 'public._new_tbl', 'select'), false, 'وجدولٌ جديد لا يقرؤه الزائر');
  perform _eq(has_table_privilege('authenticated', 'public._new_tbl', 'insert'), false, 'ولا يكتبه المسجَّل');
  perform _eq(has_sequence_privilege('authenticated', 'public._new_seq', 'usage'), false, 'وتسلسلٌ جديد');
end $$;

grant execute on function public._new_fn() to authenticated;
do $$ begin
  perform _eq(has_function_privilege('authenticated', 'public._new_fn()', 'execute'), true, 'ويصل المسجَّلَ بعد أن يُمنح صراحةً');
end $$;

\echo ''
\echo '=========================================================================='
\echo 'ب) دوالّ الزنادات: لا استدعاءَ لها'
\echo '=========================================================================='

do $$
declare bad text;
begin
  select string_agg(p.proname, ', ') into bad
    from pg_proc p
   where p.pronamespace = 'public'::regnamespace and p.prorettype = 'trigger'::regtype
     and (has_function_privilege('anon', p.oid, 'execute') or has_function_privilege('authenticated', p.oid, 'execute'));
  perform _eq(coalesce(bad, ''), '', 'لا دالّةَ زنادٍ في public يستدعيها الزائر أو المسجَّل');
  perform _eq((select count(*)::int from pg_proc p where p.pronamespace = 'public'::regnamespace and p.prorettype = 'trigger'::regtype) > 5, true,
    'وهي كثيرة (الفحص ليس فارغاً)');
end $$;

\echo ''
\echo '=========================================================================='
\echo 'ج) الملفّ الشخصيّ والأدوار'
\echo '=========================================================================='

insert into auth.users (id) values
  ('ad000000-0000-0000-0000-0000000000ad'), ('a1000000-0000-0000-0000-0000000000a1'),
  ('a2000000-0000-0000-0000-0000000000a2') on conflict do nothing;
insert into profiles (id, full_name, role) values
  ('ad000000-0000-0000-0000-0000000000ad', 'الإدارة', 'admin'),
  ('a1000000-0000-0000-0000-0000000000a1', 'مستثمر', 'investor');

grant usage on schema public, auth to anon, authenticated;
grant select, insert, update on public.profiles, public.leads, public.feedback to anon, authenticated;
grant select on public.role_changes to authenticated;
grant execute on all functions in schema auth to anon, authenticated;
grant execute on function public.is_admin() to anon, authenticated;

do $$ begin perform _act_as('a2000000-0000-0000-0000-0000000000a2'); end $$;
set role authenticated;
do $$
begin
  perform _refuses($q$insert into profiles (id, full_name, role) values ('a2000000-0000-0000-0000-0000000000a2', 'أنا المدير', 'admin')$q$,
    'لا يُدرج مستخدمٌ ملفّه مديراً');
  perform _works($q$insert into profiles (id, full_name, role) values ('a2000000-0000-0000-0000-0000000000a2', 'مزارع', 'farmer')$q$,
    'ويُدرجه مزارعاً أو مستثمراً', 1);
end $$;
reset role;

do $$ begin perform _act_as('a1000000-0000-0000-0000-0000000000a1'); end $$;
set role authenticated;
do $$ begin
  perform _works($q$update profiles set role = 'farmer' where id = 'a1000000-0000-0000-0000-0000000000a1'$q$, 'ويبدّل المستثمر جانبه إلى مزارع كما يفعل الزرّ', 1);
end $$;
reset role;
do $$ begin
  perform _eq((select count(*)::int from role_changes where user_id = 'a1000000-0000-0000-0000-0000000000a1' and old_role = 'investor' and new_role = 'farmer'), 1,
    'والتبديل مسجَّلٌ في سجلّ الأدوار');
  perform _eq((select changed_by::text from role_changes where user_id = 'a1000000-0000-0000-0000-0000000000a1'), 'a1000000-0000-0000-0000-0000000000a1',
    'باسم من بدّل');
end $$;

do $$ begin perform _act_as('a1000000-0000-0000-0000-0000000000a1'); end $$;
set role authenticated;
do $$ begin
  perform _eq((select count(*)::int from role_changes), 0, 'ولا يقرأ السجلَّ مستخدمٌ عاديّ');
end $$;
reset role;
do $$ begin perform _act_as('ad000000-0000-0000-0000-0000000000ad'); end $$;
set role authenticated;
do $$ begin
  perform _eq((select count(*)::int from role_changes), 1, 'ويقرؤه المدير');
end $$;
reset role;

\echo ''
\echo '=========================================================================='
\echo 'د) كتابات الزائر: سقفُ الطول وسقفُ الازدحام'
\echo '=========================================================================='

set role anon;
do $$
begin
  perform _works($q$insert into leads (full_name, contact, role, interest, message) values ('زائر', '0912345678', 'farmer', 'أرض', 'مرحباً')$q$,
    'يُرسل الزائر طلبه العاديّ', 1);
  perform _refuses($q$insert into leads (full_name, contact, role, message) values ('زائر', '0912345678', 'farmer', repeat('ا', 2500))$q$,
    'ولا يرسل رسالةً بألفين وخمسمئة حرف');
  perform _refuses($q$insert into feedback (display_name, body, kind) values (repeat('ب', 200), 'ملاحظةٌ كافية', 'problem')$q$,
    'ولا اسماً بمئتي حرف في الملاحظات');
  perform _works($q$insert into feedback (body, kind) values ('ملاحظةٌ كافية', 'suggestion')$q$, 'وتُقبل ملاحظته العاديّة', 1);
end $$;
reset role;

insert into leads (full_name, contact, role)
  select 'ازدحام', '0900000000', 'other' from generate_series(1, 300);
set role anon;
do $$
begin
  perform _refuses($q$insert into leads (full_name, contact, role) values ('زائر', '0912345678', 'farmer')$q$,
    'ومع ثلاثمئة طلبٍ في الساعة يُرفض الجديد: الفيضان لا يملأ الجدول');
end $$;
reset role;
do $$
begin
  perform _works($q$insert into leads (full_name, contact, role) values ('خدمة', '0900000001', 'other')$q$,
    'ومفتاحُ الخدمة لا يُحدّ (القيد على الزائر والمسجَّل وحدهما)', 1);
end $$;

\echo ''
\echo '=========================================================================='
do $$
declare n integer;
begin
  select fails into n from _score;
  if n > 0 then raise exception 'فشل % فحصاً.', n; end if;
  raise notice 'ALL CHECKS PASSED — الأصل منعٌ، والمنحُ صريح';
end $$;
