-- بوّابةُ «مشروعي»: قائمة المدخلات لصاحبها وحده، والدفعُ يسجّله المزارع والمنصّة
-- لا تمسك مالاً، ولا يُحذف شيء.

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

-- ── الناس: أ مزارع، ب مزارعٌ آخر، د مدير ─────────────────────────────────
insert into auth.users (id) values
  ('a1000000-0000-0000-0000-0000000000a1'),
  ('b2000000-0000-0000-0000-0000000000b2'),
  ('f6000000-0000-0000-0000-0000000000f6')
on conflict (id) do nothing;
insert into profiles (id, full_name, role) values
  ('a1000000-0000-0000-0000-0000000000a1', 'أ', 'investor'),
  ('b2000000-0000-0000-0000-0000000000b2', 'ب', 'investor'),
  ('f6000000-0000-0000-0000-0000000000f6', 'د', 'admin')
on conflict (id) do update set role = excluded.role;

grant usage on schema public, auth to anon, authenticated;
grant execute on function auth.uid() to anon, authenticated;
grant select, update on _who to anon, authenticated;
create table _ids (k text primary key, id uuid);
grant all on _ids to anon, authenticated;
create or replace function _id(k text) returns uuid language sql stable as $$ select id from _ids where _ids.k = $1 $$;
grant execute on function _id(text) to anon, authenticated;
grant select, insert, update, delete on lands, profiles to anon, authenticated;

do $$ begin perform _act_as(null); end $$;
insert into lands (id, owner_id, name, state, feddans, station_key, water_source) values
  ('11000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-0000000000a1', 'أرض أ', 'القضارف', 50, 'kassala', 'rainfed'),
  ('11000000-0000-0000-0000-000000000002', 'b2000000-0000-0000-0000-0000000000b2', 'أرض ب', 'الجزيرة', 20, 'gezira', 'canal');

\echo ''
\echo 'أ) الخطّة لصاحبها: يُنشئها من دراسة الجدوى ويوافق عليها'

do $$ begin perform _act_as('a1000000-0000-0000-0000-0000000000a1'); end $$;
set role authenticated;
do $$ begin
  insert into _ids values ('p', input_plan_create('ذرة الموسم', 'sorghum', 50, '11000000-0000-0000-0000-000000000001',
    '[{"name":"تقاوي ذرة","note":"٣–٥ كجم للفدان","quantity":150,"unit":"كجم"},{"name":"يوريا","quantity":2500,"unit":"كجم"}]'::jsonb));
  perform _eq((select count(*)::int from input_plan_items where plan_id = _id('p')), 2, 'خطّةٌ ببندَيها');
  perform _eq((select status from input_plans where id = _id('p')), 'draft', 'تبدأ مسوّدة');
  perform _refuses($q$select input_plan_create('خطّة', 'sorghum', 10, '11000000-0000-0000-0000-000000000002', '[]'::jsonb)$q$,
    'ولا تُربط بأرض غيره');
  perform _refuses($q$insert into input_plans (owner_id, title, crop_key, feddans) values ('a1000000-0000-0000-0000-0000000000a1', 'مباشر', 'sorghum', 1)$q$,
    'ولا يكتب في الجدول مباشرةً');
  insert into _ids values ('i1', (select id from input_plan_items where plan_id = _id('p') and name = 'يوريا'));
  insert into _ids values ('i2', (select id from input_plan_items where plan_id = _id('p') and name = 'تقاوي ذرة'));
  perform _refuses($q$select input_plan_item_paid(_id('i1'), 1000000, current_date, 'TRX-1')$q$, 'ولا يسجّل دفعاً قبل الموافقة');
  perform input_plan_item_set(_id('i1'), 2500, 0.8, 'مورّد القضارف');
  perform _eq((select unit_price_usd from input_plan_items where id = _id('i1')), 0.80::numeric, 'يكتب السعر من عرض المورد');
  perform input_plan_approve(_id('p'));
  perform _eq((select status from input_plans where id = _id('p')), 'approved', 'ويوافق عليها');
end $$;

\echo ''
\echo 'ب) الدفع للمورد مباشرةً — يسجّله المزارع، والمنصّة لا تستلم'

do $$ begin
  perform _refuses($q$select input_plan_item_paid(_id('i1'), 1000000, current_date + 3, 'TRX-1')$q$, 'تاريخ دفعٍ في المستقبل يُرفض');
  perform input_plan_item_paid(_id('i1'), 8400000, current_date, 'TRX-1');
  perform _eq((select paid_sdg from input_plan_items where id = _id('i1')), 8400000.00::numeric, 'يسجّل ما دفعه');
  perform input_plan_item_delivered(_id('i1'), current_date, 'استلمتُ ٥٠ جوالاً');
  perform _eq((select delivered_at from input_plan_items where id = _id('i1')), current_date, 'ويسجّل الاستلام');
  perform _refuses($q$select input_plan_item_remove(_id('i1'))$q$, 'وما دُفع فيه لا يُزال');
  perform input_plan_item_remove(_id('i2'));
  perform _eq((select removed_at is not null from input_plan_items where id = _id('i2')), true, 'والمُزال يُعلَّم ولا يُحذف');
  perform _eq((select count(*)::int from input_plan_items where plan_id = _id('p')), 2, 'فيبقى البندان في السجلّ');
  perform _eq((select count(*)::int from information_schema.columns
                where table_schema = 'public' and table_name in ('input_plans','input_plan_items')
                  and column_name ~ '(balance|wallet|deposit)'), 0, 'ولا عمودَ يحمل رصيداً أو وديعة');
end $$;

\echo ''
\echo 'ج) غيرُ صاحبها لا يرى ولا يكتب'

reset role;
do $$ begin perform _act_as('b2000000-0000-0000-0000-0000000000b2'); end $$;
set role authenticated;
do $$ begin
  perform _eq((select count(*)::int from input_plans), 0, 'مزارعٌ آخر لا يرى الخطّة');
  perform _eq((select count(*)::int from input_plan_items), 0, 'ولا بنودها');
  perform _refuses($q$select input_plan_item_set(_id('i1'), 1, 1, 'x')$q$, 'ولا يعدّل بنداً فيها');
  perform _refuses($q$select input_plan_item_paid(_id('i1'), 1, current_date, 'x')$q$, 'ولا يسجّل فيها دفعاً');
  perform _refuses($q$select input_plan_approve(_id('p'))$q$, 'ولا يوافق عليها');
  perform _refuses($q$select input_plan_item_add(_id('p'), 'بند', null, 1, 'كجم')$q$, 'ولا يضيف إليها');
end $$;

reset role;
do $$ begin perform _act_as('f6000000-0000-0000-0000-0000000000f6'); end $$;
set role authenticated;
do $$ begin
  perform _eq((select count(*)::int from input_plans), 1, 'والمدير يرى الخطّة');
end $$;

\echo ''
\echo 'د) الإقفال والصلاحيات'

reset role;
do $$ begin perform _act_as('a1000000-0000-0000-0000-0000000000a1'); end $$;
set role authenticated;
do $$ begin
  perform input_plan_close(_id('p'));
  perform _eq((select status from input_plans where id = _id('p')), 'closed', 'صاحبها يقفلها');
  perform _refuses($q$select input_plan_item_set(_id('i1'), 1, 1, 'x')$q$, 'والمقفلة لا تُعدَّل');
end $$;

reset role;
do $$ begin
  perform _eq((select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                where n.nspname = 'public' and p.proname like 'input_plan%'
                  and has_function_privilege('anon', p.oid, 'execute')), 0, 'لا دالّةَ للخطط ينفّذها الزائر');
  perform _eq(has_function_privilege('authenticated', 'public.input_plan_item_owned(uuid)', 'execute'), false,
    'والحارسُ المشترك لا يُستدعى من الخارج');
end $$;

reset role;
do $$
declare f integer;
begin
  select fails into f from _score;
  if f = 0 then raise notice 'ALL CHECKS PASSED';
  else raise exception '% CHECK(S) FAILED', f;
  end if;
end $$;
