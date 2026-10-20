-- بوّابةُ جاهزيّة الماشية للتصدير: السجلّ لصاحب القطيع وحده، والقيدُ الخاطئ
-- يُسحب ولا يُحذف، ورقمُ الأذن تتغيّر حالته ولا يُمحى.

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

-- ── الناس: أ مربٍّ، ب مربٍّ آخر ─────────────────────────────────────────
insert into auth.users (id) values
  ('a1000000-0000-0000-0000-0000000000a1'),
  ('b2000000-0000-0000-0000-0000000000b2')
on conflict (id) do nothing;
insert into profiles (id, full_name, role) values
  ('a1000000-0000-0000-0000-0000000000a1', 'أ', 'investor'),
  ('b2000000-0000-0000-0000-0000000000b2', 'ب', 'investor')
on conflict (id) do update set role = excluded.role;

grant usage on schema public, auth to anon, authenticated;
grant execute on function auth.uid() to anon, authenticated;
grant select, update on _who to anon, authenticated;
grant execute on function _refuses(text, text), _changes_nothing(text, text), _eq(anyelement, anyelement, text),
  _pass(text), _fail(text, text) to anon, authenticated;
grant select, update on _score to anon, authenticated;

do $$ begin perform _act_as(null); end $$;
insert into herds (id, owner_id, name, species, head_count, purpose, start_date) values
  ('c1000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-0000000000a1', 'ضأن أ', 'sheep', 60, 'fattening', current_date - 30),
  ('c1000000-0000-0000-0000-000000000002', 'b2000000-0000-0000-0000-0000000000b2', 'إبل ب', 'camel', 20, 'meat', current_date - 30),
  ('c1000000-0000-0000-0000-000000000003', 'a1000000-0000-0000-0000-0000000000a1', 'دورة مُغلقة', 'goat', 10, 'meat', current_date - 300);
update herds set status = 'completed' where id = 'c1000000-0000-0000-0000-000000000003';

\echo ''
\echo 'أ) سجلّ الصحّة لصاحب القطيع'

do $$ begin perform _act_as('a1000000-0000-0000-0000-0000000000a1'); end $$;
set role authenticated;
do $$ begin
  perform herd_health_add('c1000000-0000-0000-0000-000000000001', 'vaccination', 'ppr', current_date - 10, 60,
    null, 'لقاح الطاعون', 'B-77', 'د. عثمان', null);
  perform _eq((select count(*)::int from herd_health_records), 1, 'يسجّل تطعيماً لقطيعه');
  perform herd_health_add('c1000000-0000-0000-0000-000000000001', 'test', 'brucellosis', current_date - 5, 60,
    'negative', null, null, 'معمل الولاية', null);
  perform _eq((select result from herd_health_records where kind = 'test'), 'negative', 'ويسجّل فحصاً بنتيجته');
  perform _refuses($q$select herd_health_add('c1000000-0000-0000-0000-000000000001', 'test', 'brucellosis', current_date, 60, null, null, null, null, null)$q$,
    'الفحص بلا نتيجة يُرفض');
  perform _refuses($q$select herd_health_add('c1000000-0000-0000-0000-000000000001', 'vaccination', 'ppr', current_date + 1, 60, null, null, null, null, null)$q$,
    'وتاريخٌ في المستقبل يُرفض');
  perform _refuses($q$select herd_health_add('c1000000-0000-0000-0000-000000000001', 'vaccination', 'ppr', current_date, 61, null, null, null, null, null)$q$,
    'ورؤوسٌ أكثر من القطيع تُرفض');
  perform _refuses($q$select herd_health_add('c1000000-0000-0000-0000-000000000002', 'vaccination', 'ppr', current_date, 5, null, null, null, null, null)$q$,
    'ولا يسجّل في قطيع غيره');
  perform _refuses($q$select herd_health_add('c1000000-0000-0000-0000-000000000003', 'vaccination', 'ppr', current_date, 5, null, null, null, null, null)$q$,
    'ولا في دورةٍ مُغلقة');
  perform _refuses($q$insert into herd_health_records (herd_id, kind, item_key, done_on, heads, created_by) values ('c1000000-0000-0000-0000-000000000001', 'vaccination', 'ppr', current_date, 1, 'a1000000-0000-0000-0000-0000000000a1')$q$,
    'ولا يكتب في الجدول مباشرةً');
end $$;

\echo ''
\echo 'ب) القيد الخاطئ يُسحب ولا يُحذف'

do $$
declare r uuid;
begin
  select id into r from herd_health_records where kind = 'vaccination';
  perform _refuses(format('select herd_health_withdraw(%L, %L)', r, ''), 'السحب بلا سبب يُرفض');
  perform herd_health_withdraw(r, 'التاريخ خطأ');
  perform _eq((select withdrawn_at is not null from herd_health_records where id = r), true, 'يُسحب بسببه');
  perform _eq((select count(*)::int from herd_health_records), 2, 'ويبقى في السجلّ');
  perform _refuses(format('select herd_health_withdraw(%L, %L)', r, 'مرّة ثانية'), 'ولا يُسحب مرّتين');
  perform _changes_nothing('delete from herd_health_records', 'ولا يُحذف شيءٌ مباشرةً');
end $$;

\echo ''
\echo 'ج) أرقام الآذان'

do $$ begin
  perform _eq(herd_tags_add_range('c1000000-0000-0000-0000-000000000001', 'SD-', 1, 50), 50, 'يضيف خمسين رقماً متتالياً');
  perform _eq(herd_tags_add_range('c1000000-0000-0000-0000-000000000001', 'SD-', 41, 60), 10, 'وما سُجّل من قبل يُترك');
  perform _refuses($q$select herd_tags_add_range('c1000000-0000-0000-0000-000000000001', 'SD-', 61, 61)$q$,
    'ولا تزيد الأرقام على رؤوس القطيع');
  perform _eq((select count(*)::int from herd_tags), 60, 'والرفضُ لا يُبقي شيئاً ممّا حاول');
  perform herd_tag_set_status('c1000000-0000-0000-0000-000000000001', 'SD-7', 'dead');
  perform _eq((select status from herd_tags where tag = 'SD-7'), 'dead', 'الرأس النافق تتغيّر حالته');
  perform _eq((select count(*)::int from herd_tags), 60, 'ولا يُمحى رقمه');
  perform _eq(herd_tags_add_range('c1000000-0000-0000-0000-000000000001', 'SD-', 61, 61), 1, 'فيُضاف رأسٌ مكانه');
  perform _refuses($q$select herd_tag_set_status('c1000000-0000-0000-0000-000000000001', 'XX-1', 'sold')$q$, 'ورقمٌ غير مسجّل يُرفض');
  perform _refuses($q$select herd_tags_add_range('c1000000-0000-0000-0000-000000000001', 'س-', 1, 2)$q$, 'والحرف الثابت لاتينيّ');
  perform _refuses($q$select herd_tags_add_range('c1000000-0000-0000-0000-000000000002', 'B-', 1, 2)$q$, 'ولا يرقّم قطيع غيره');
  perform _changes_nothing('delete from herd_tags', 'ولا يُحذف رقمٌ مباشرةً');
end $$;

\echo ''
\echo 'د) غير صاحبه لا يرى ولا يكتب'

reset role;
do $$ begin perform _act_as('b2000000-0000-0000-0000-0000000000b2'); end $$;
set role authenticated;
do $$ begin
  perform _eq((select count(*)::int from herd_health_records), 0, 'مربٍّ آخر لا يرى سجلّ الصحّة');
  perform _eq((select count(*)::int from herd_tags), 0, 'ولا أرقام الآذان');
  perform _refuses($q$select herd_tag_set_status('c1000000-0000-0000-0000-000000000001', 'SD-1', 'sold')$q$, 'ولا يغيّر حالة رأس');
end $$;

reset role;
do $$ begin perform _act_as(null); end $$;
set role anon;
do $$ begin
  perform _eq((select count(*)::int from herd_tags), 0, 'والزائر لا يرى شيئاً');
end $$;

reset role;
do $$ begin
  perform _eq((select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                where n.nspname = 'public' and p.proname in ('herd_owned_active','herd_health_add','herd_health_withdraw','herd_tags_add_range','herd_tag_set_status')
                  and has_function_privilege('anon', p.oid, 'execute')), 0, 'لا دالّةَ هنا ينفّذها الزائر');
  perform _eq(has_function_privilege('authenticated', 'public.herd_owned_active(uuid)', 'execute'), false,
    'والحارسُ المشترك لا يُستدعى من الخارج');
end $$;

do $$
declare f integer;
begin
  select fails into f from _score;
  if f = 0 then raise notice 'ALL CHECKS PASSED';
  else raise exception '% CHECK(S) FAILED', f;
  end if;
end $$;
