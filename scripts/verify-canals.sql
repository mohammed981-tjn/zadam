-- بوّابةُ الترع: الحدود، والنصيب بقدر الفدادين، والجدول لأهله.
--
--
-- A canal's roster and turns are its members' business: an applicant waits for
-- a steward, only a steward sets feddans and turns, a turn goes only to a
-- member, a canal never loses its last steward, and a nafir is tied to a
-- canal only by one of its members.

\set ON_ERROR_STOP on
\set QUIET on

create table if not exists _score (fails integer not null default 0);
delete from _score;
insert into _score values (0);

create or replace function _fail(label text, why text) returns void
language plpgsql as $$
begin
  raise notice '  FAIL  % — %', label, why;
  update _score set fails = fails + 1;
end $$;

create or replace function _pass(label text) returns void
language plpgsql as $$
begin raise notice '  PASS  %', label; end $$;

create or replace function _eq(got anyelement, want anyelement, label text) returns void
language plpgsql as $$
begin
  if got is not distinct from want then
    perform _pass(label || ' — ' || coalesce(got::text,'null'));
  else
    perform _fail(label, 'جاء ' || coalesce(got::text,'null') || ' والمتوقَّع ' || coalesce(want::text,'null'));
  end if;
end $$;

create or replace function _does(stmt text, label text) returns void
language plpgsql as $$
declare touched integer;
begin
  begin
    execute stmt;
    get diagnostics touched = row_count;
  exception when others then
    perform _fail(label, 'رُفض: ' || sqlerrm);
    return;
  end;
  if touched > 0 then perform _pass(label);
  else perform _fail(label, 'نُفِّذ ولم يمسّ صفّاً — سياسةٌ رشّحت كلَّ شيء بصمت');
  end if;
end $$;

create or replace function _refuses(stmt text, label text) returns void
language plpgsql as $$
begin
  begin execute stmt;
  exception when others then perform _pass(label); return;
  end;
  perform _fail(label, 'نُفِّذ وكان يجب أن يُرفض');
end $$;

create or replace function _changes_nothing(stmt text, label text) returns void
language plpgsql as $$
declare touched integer;
begin
  begin
    execute stmt;
    get diagnostics touched = row_count;
  exception when others then perform _pass(label || ' — رُفض صراحةً'); return;
  end;
  if touched = 0 then perform _pass(label);
  else perform _fail(label, 'مسّ ' || touched || ' صفّاً وكان يجب ألّا يمسّ شيئاً');
  end if;
end $$;

create or replace function _act_as(p uuid) returns void
language plpgsql as $$ begin update _who set uid = p; end $$;





-- ── الناس: ق قيّم، ع عضو، غ غريب ───────────────────────────────────────────
insert into auth.users (id) values
  ('a1000000-0000-0000-0000-0000000000a1'),
  ('b2000000-0000-0000-0000-0000000000b2'),
  ('f4000000-0000-0000-0000-0000000000f4')
on conflict (id) do nothing;
insert into profiles (id, full_name, role) values
  ('a1000000-0000-0000-0000-0000000000a1', 'ق', 'investor'),
  ('b2000000-0000-0000-0000-0000000000b2', 'ع', 'investor'),
  ('f4000000-0000-0000-0000-0000000000f4', 'غ', 'investor')
on conflict (id) do nothing;

grant usage on schema public, auth to anon, authenticated;
grant select, insert, update, delete on all tables in schema public to anon, authenticated;
grant usage, select on all sequences in schema public to anon, authenticated;
grant execute on function auth.uid() to anon, authenticated;

create table _c (id uuid);
grant all on _c to authenticated;

\echo ''
\echo 'أ) الحدود — القيّم يسجّل الترعة، والعضو يطلب، والقيّم يقبل'

do $$ begin perform _act_as('a1000000-0000-0000-0000-0000000000a1'); end $$;
set role authenticated;
do $$ begin
  insert into _c values (canal_create('ميسقة ٧ — الحصاحيصا', 'الجزيرة', 'الحصاحيصا', 'ميسقةٌ فرعيةٌ على الكنار الشرقي', 'القيّم', 30));
  perform _eq(canal_role((select id from _c)), 'steward', 'مَن يسجّل الترعة قيّمُها');
  perform _changes_nothing($q$insert into canal_members (canal_id, user_id, display_name, feddans, status) select id, 'f4000000-0000-0000-0000-0000000000f4', 'دخيل', 5, 'member' from _c$q$,
    'ولا يُكتب جدول الأعضاء مباشرةً');
end $$;

reset role;
do $$ begin perform _act_as('b2000000-0000-0000-0000-0000000000b2'); end $$;
set role authenticated;
do $$ begin
  perform canal_request_join((select id from _c), 'عثمان', 15);
  perform _eq(canal_role((select id from _c)), 'pending', 'ع يطلب فينتظر');
  perform _eq((select count(*)::int from canal_members), 1, 'ويرى طلبه وحده لا القائمة');
  perform _refuses($q$select canal_set_turns((select id from _c), '[]'::jsonb)$q$, 'ولا يكتب الجدول');
  perform _refuses($q$select canal_decide((select id from _c), 'b2000000-0000-0000-0000-0000000000b2', true, null)$q$, 'ولا يقبل نفسه');
  perform _refuses($q$insert into nafir_calls (display_name, kind, title, description, state, locality, starts_on, needed, canal_id)
    select 'عثمان', 'canal', 'تطهير الميسقة', 'تطهير الميسقة قبل الري', 'الجزيرة', 'الحصاحيصا', current_date + 2, 10, id from _c$q$,
    'ولا يربط نفيراً بترعةٍ لم يُقبل فيها');
end $$;

reset role;
do $$ begin perform _act_as('a1000000-0000-0000-0000-0000000000a1'); end $$;
set role authenticated;
do $$ begin
  perform canal_decide((select id from _c), 'b2000000-0000-0000-0000-0000000000b2', true, 12);
  perform _eq((select feddans from canal_members where user_id = 'b2000000-0000-0000-0000-0000000000b2'), 12.00::numeric(8,2),
    'القيّم يقبل ويثبّت الفدادين التي يُحسب عليها النصيب');
end $$;

\echo ''
\echo 'ب) الجدول — للأعضاء وحدهم، ويكتبه القيّم'

do $$ begin
  perform canal_set_turns((select id from _c), jsonb_build_array(
    jsonb_build_object('user_id','a1000000-0000-0000-0000-0000000000a1','weekday',6,'starts','18:00','ends','06:00'),
    jsonb_build_object('user_id','b2000000-0000-0000-0000-0000000000b2','weekday',0,'starts','06:00','ends','14:00')));
  perform _eq((select count(*)::int from canal_turns), 2, 'القيّم يكتب نوبتين');
  perform _refuses($q$select canal_set_turns((select id from _c), jsonb_build_array(
    jsonb_build_object('user_id','f4000000-0000-0000-0000-0000000000f4','weekday',1,'starts','06:00','ends','08:00')))$q$,
    'ولا نوبةَ لغير عضو');
  perform _eq((select count(*)::int from canal_turns), 2, 'والجدول الفاشل لا يمسح القائم');
  perform _refuses($q$select canal_set_member((select id from _c), 'a1000000-0000-0000-0000-0000000000a1', 30, 'member')$q$,
    'ولا يُنزل القيّم الأخير نفسه');
end $$;

reset role;
do $$ begin perform _act_as('b2000000-0000-0000-0000-0000000000b2'); end $$;
set role authenticated;
do $$ begin
  perform _eq((select count(*)::int from canal_members), 2, 'والعضو المقبول يرى القائمة');
  perform _eq((select count(*)::int from canal_turns), 2, 'ويرى الجدول');
  perform _does($q$insert into nafir_calls (display_name, kind, title, description, state, locality, starts_on, needed, canal_id)
    select 'عثمان', 'canal', 'تطهير الميسقة', 'تطهير الميسقة قبل الري', 'الجزيرة', 'الحصاحيصا', current_date + 2, 10, id from _c$q$,
    'ويربط نفير التطهير بترعته');
end $$;

reset role;
do $$ begin perform _act_as('f4000000-0000-0000-0000-0000000000f4'); end $$;
set role authenticated;
do $$ begin
  perform _eq((select count(*)::int from canal_members), 0, 'والغريب لا يرى الأعضاء');
  perform _eq((select count(*)::int from canal_turns), 0, 'ولا الجدول');
  perform _eq((select members::int from canal_directory()), 2, 'ويرى في الدليل عددَهم');
  perform _eq((select feddans from canal_directory()), 42.00::numeric, 'ومساحتَهم');
end $$;

reset role;
do $$ begin perform _act_as(null); end $$;
set role anon;
do $$ begin
  perform _eq((select count(*)::int from canal_members), 0, 'والزائر لا يرى الأعضاء — بلا خطأ');
  perform _eq((select count(*)::int from canals), 1, 'ويرى الترعة');
end $$;

\echo ''
\echo 'ج) المغادرة'

reset role;
do $$ begin perform _act_as('a1000000-0000-0000-0000-0000000000a1'); end $$;
set role authenticated;
do $$ begin
  perform _refuses($q$select canal_leave((select id from _c))$q$, 'القيّم الأخير لا يغادر وفي الترعة غيره');
  perform canal_set_member((select id from _c), 'b2000000-0000-0000-0000-0000000000b2', 12, 'steward');
  perform canal_leave((select id from _c));
  perform _eq(canal_role((select id from _c)), null::text, 'فإن سلّم القيامة غادر');
end $$;

reset role;
do $$ begin
  perform _eq((select count(*)::int from canal_turns where user_id = 'a1000000-0000-0000-0000-0000000000a1'), 0, 'وتسقط نوباته معه');
end $$;

do $$
declare f integer;
begin
  select fails into f from _score;
  if f = 0 then raise notice 'ALL CHECKS PASSED';
  else raise exception '% CHECK(S) FAILED', f;
  end if;
end $$;
