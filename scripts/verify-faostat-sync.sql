-- بوّابةُ مزامنة بيانات الفاو (البند ١٩٧).
--
-- The sync (running as the service role) puts the difference between the files and the table into
-- faostat_pending and nothing else; a visitor sees the table as it was; an administrator approves
-- the difference with one function, which keeps what it replaces.

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

-- ── الناس: غ زائرٌ مسجَّل، د مدير ──────────────────────────────────────────
insert into auth.users (id) values
  ('c3000000-0000-0000-0000-0000000000c3'),
  ('f6000000-0000-0000-0000-0000000000f6')
on conflict (id) do nothing;
insert into profiles (id, full_name, role) values
  ('c3000000-0000-0000-0000-0000000000c3', 'زائر', 'investor'),
  ('f6000000-0000-0000-0000-0000000000f6', 'المدير', 'admin')
on conflict (id) do update set role = excluded.role;

grant usage on schema public, auth to anon, authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated, service_role;
grant select, update on _who to anon, authenticated, service_role;

-- ما حُمّل من قبل: ثلاثة أرقام في ثلاثة نطاقات، يراها الجميع.
insert into faostat_observations (domain, area, element, item, year, unit, value, flag, loaded_at) values
  ('PP',  'Sudan', 'Producer Price (USD/tonne)', 'Sesame seed', 2023, 'USD', 1200.5, 'A', '2026-08-18 00:00:00+00'),
  ('QCL', 'Sudan', 'Yield', 'Sorghum', 2023, 'kg/ha', 640, 'E', '2026-08-18 00:00:00+00'),
  ('TCL', 'Sudan', 'Export quantity', 'Sheep', 2023, 't', 1000, 'A', '2026-08-18 00:00:00+00');

\echo ''
\echo 'أ) المزامنة (مفتاح الخدمة) تضع الفرق ولا تمسّ الأرقام المحمَّلة'

set role service_role;
do $$ begin
  -- the sync found: Sesame 2023 revised, Sorghum 2024 new, nothing for the Sheep
  insert into faostat_pending (domain, area, element, item, year, unit, value, flag, old_unit, old_value, old_flag) values
    ('PP',  'Sudan', 'Producer Price (USD/tonne)', 'Sesame seed', 2023, 'USD', 1310.0, 'A', 'USD', 1200.5, 'A');
  insert into faostat_pending (domain, area, element, item, year, unit, value, flag) values
    ('QCL', 'Sudan', 'Yield', 'Sorghum', 2024, 'kg/ha', 700, 'E');
  insert into faostat_syncs (trigger, files, new_rows, changed_rows, same_rows, problems)
    values ('cron', '{"PP":{"rows":1},"QCL":{"rows":2}}'::jsonb, 1, 1, 1, array['TCL: لا ملف']);
  perform _eq((select count(*)::int from faostat_pending), 2, 'تضع الفرق: صفٌّ معدَّل وصفٌّ جديد');
  perform _eq((select count(*)::int from faostat_syncs), 1, 'وتسجّل الفحص');
  perform _refuses($q$insert into faostat_observations (domain, area, element, item, year, unit, value) values ('PP','Sudan','x','y',2024,'USD',1)$q$,
    'ولا تكتب في الأرقام المحمَّلة بنفسها');
  perform _refuses($q$update faostat_observations set value = 1$q$, 'ولا تعدّل فيها');
  perform _refuses($q$delete from faostat_observations$q$, 'ولا تحذف منها');
  perform _refuses($q$insert into faostat_loads (new_rows, changed_rows) values (1, 1)$q$, 'ولا تسجّل تحميلاً معتمداً');
  perform _refuses($q$insert into faostat_observation_history (domain, area, element, item, year, unit, value, loaded_at) values ('PP','a','b','c',1,'u',1,now())$q$,
    'ولا تكتب في سجلّ المستبدَل');
  perform _refuses($q$select faostat_apply_pending(0, null)$q$, 'ولا تعتمد بنفسها');
  perform _eq((select count(*)::int from faostat_observations), 3, 'والأرقام المحمَّلة كما هي');
end $$;
reset role;

\echo ''
\echo 'ب) الزائر والمسجَّل لا يريان شيئاً من الفرق'

set role anon;
do $$ begin
  perform _eq((select count(*)::int from faostat_observations), 3, 'الزائرُ يرى الأرقام المحمَّلة وحدها');
  perform _refuses($q$select count(*) from faostat_pending$q$, 'ولا يقرأ الفرق المنتظر');
  perform _refuses($q$select count(*) from faostat_syncs$q$, 'ولا سجلّ الفحص');
  perform _refuses($q$select faostat_apply_pending(0, null)$q$, 'ولا يعتمد');
  perform _refuses($q$select faostat_discard_pending()$q$, 'ولا يرفض');
end $$;
reset role;

set role authenticated;
do $$ begin
  perform _act_as('c3000000-0000-0000-0000-0000000000c3');
  perform _eq((select count(*)::int from faostat_pending), 0, 'المسجَّلُ لا يرى الفرق المنتظر');
  perform _eq((select count(*)::int from faostat_observation_history), 0, 'ولا سجلّ المستبدَل');
  perform _eq((select count(*)::int from faostat_loads), 0, 'ولا سجلّ التحميلات');
  perform _eq((select count(*)::int from faostat_syncs), 0, 'ولا سجلّ الفحص');
  perform _refuses($q$select faostat_apply_pending(0, null)$q$, 'ولا يعتمد');
  perform _refuses($q$select faostat_discard_pending()$q$, 'ولا يرفض');
  perform _refuses($q$insert into faostat_pending (domain, area, element, item, year, unit, value) values ('PP','a','b','c',1,'u',1)$q$, 'ولا يكتب فرقاً');

  perform _act_as('f6000000-0000-0000-0000-0000000000f6');
  perform _eq((select count(*)::int from faostat_pending), 2, 'المديرُ يرى الفرق: اثنان');
  perform _eq((select count(*)::int from faostat_pending where old_value is null), 1, 'أحدهما جديد');
  perform _eq((select count(*)::int from faostat_syncs), 1, 'ويرى سجلّ الفحص');
end $$;
reset role;

\echo ''
\echo 'ج) المدير يعتمد: يُحفظ القديم، ويدخل الجديد، ويُسجَّل التحميل'

set role authenticated;
do $$
declare r jsonb;
begin
  perform _act_as('f6000000-0000-0000-0000-0000000000f6');
  -- What the page showed: two rows, and the newest of them. Anything else is refused.
  perform _refuses(format('select faostat_apply_pending(%s, %L)', 1, (select max(found_at) from faostat_pending)),
                   'ولا يعتمد عدداً غير الذي رآه');
  perform _refuses(format('select faostat_apply_pending(%s, %L)', 2, (select max(found_at) from faostat_pending) - interval '1 minute'),
                   'ولا فرقاً جدّ فيه صفٌّ بعد أن فتح الصفحة');
  perform _eq((select count(*)::int from faostat_observation_history), 0, 'والرفض لا يمسّ شيئاً');
  r := faostat_apply_pending((select count(*)::int from faostat_pending), (select max(found_at) from faostat_pending));
  perform _eq((r ->> 'new')::int, 1, 'عدد الجديد في الجواب');
  perform _eq((r ->> 'changed')::int, 1, 'وعدد المعدَّل');
  perform _eq((select value from faostat_observations where item = 'Sesame seed' and year = 2023), 1310.0::numeric, 'الرقم المعدَّل صار الجديد');
  perform _eq((select flag from faostat_observations where item = 'Sesame seed' and year = 2023), 'A', 'وعلامته');
  perform _eq((select value from faostat_observations where item = 'Sorghum' and year = 2024), 700::numeric, 'والجديدُ دخل');
  perform _eq((select count(*)::int from faostat_observations), 4, 'أربعة أرقام الآن');
  perform _eq((select value from faostat_observations where item = 'Sheep'), 1000::numeric, 'وما لم يمسّه الفرق كما هو');
  perform _eq((select value from faostat_observations where item = 'Sorghum' and year = 2023), 640::numeric, 'وسنةٌ أخرى للمحصول نفسه كما هي');
  perform _eq((select count(*)::int from faostat_observation_history), 1, 'سجلّ المستبدَل فيه صفٌّ واحد: المعدَّل وحده');
  perform _eq((select value from faostat_observation_history where item = 'Sesame seed'), 1200.5::numeric, 'وفيه الرقم القديم');
  perform _eq((select loaded_at from faostat_observation_history where item = 'Sesame seed'), '2026-08-18 00:00:00+00'::timestamptz, 'ومتى حُمّل');
  perform _eq((select replaced_by from faostat_observation_history where item = 'Sesame seed'), 'f6000000-0000-0000-0000-0000000000f6'::uuid, 'ومن استبدله');
  perform _eq((select count(*)::int from faostat_pending), 0, 'والمنتظِر فرغ');
  perform _eq((select new_rows from faostat_loads), 1, 'سجلّ التحميل: جديد');
  perform _eq((select changed_rows from faostat_loads), 1, 'ومعدَّل');
  perform _refuses($q$select faostat_apply_pending(0, null)$q$, 'ولا اعتماد حين لا شيء ينتظر');
end $$;
reset role;

\echo ''
\echo 'ج٢) صفٌّ ظنّه الفحص جديداً وصار في الجدول قبل الاعتماد: يُحفظ القديم ولا يُمحى (ج١٢)'

insert into faostat_pending (domain, area, element, item, year, unit, value, flag) values
  ('QCL', 'Sudan', 'Yield', 'Sorghum', 2023, 'kg/ha', 9999, 'A');
set role authenticated;
do $$
declare r jsonb;
begin
  perform _act_as('f6000000-0000-0000-0000-0000000000f6');
  r := faostat_apply_pending(1, (select max(found_at) from faostat_pending));
  perform _eq((r ->> 'changed')::int, 1, 'يُعدّ معدَّلاً لا جديداً، بما في الجدول الآن');
  perform _eq((r ->> 'new')::int, 0, 'ولا جديد');
  perform _eq((select value from faostat_observation_history where item = 'Sorghum' and year = 2023), 640::numeric,
              'والرقم القديم (٦٤٠) في سجلّ المستبدَل');
  perform _eq((select value from faostat_observations where item = 'Sorghum' and year = 2023), 9999::numeric, 'والجديد مكانه');
end $$;
reset role;

\echo ''
\echo 'د) ما استُبدل وما اعتُمد لا يتغيّر'

do $$ begin
  perform _refuses($q$update faostat_observation_history set value = 1$q$, 'لا يُعدَّل سجلّ المستبدَل');
  perform _refuses($q$delete from faostat_observation_history$q$, 'ولا يُحذف منه');
  perform _refuses($q$truncate faostat_observation_history$q$, 'ولا يُفرَّغ');
  perform _refuses($q$update faostat_loads set new_rows = 99$q$, 'ولا يُعدَّل سجلّ التحميلات');
  perform _refuses($q$delete from faostat_loads$q$, 'ولا يُحذف منه');
  perform _refuses($q$truncate faostat_loads$q$, 'ولا يُفرَّغ');
end $$;

\echo ''
\echo 'هـ) الرفض: يفرغ المنتظِر ولا يمسّ الأرقام'

insert into faostat_pending (domain, area, element, item, year, unit, value, flag) values
  ('TCL', 'Sudan', 'Export quantity', 'Sheep', 2024, 't', 1100, 'A');
set role authenticated;
do $$ begin
  perform _act_as('c3000000-0000-0000-0000-0000000000c3');
  perform _refuses($q$select faostat_discard_pending()$q$, 'غير المدير لا يرفض');
  perform _act_as('f6000000-0000-0000-0000-0000000000f6');
  perform _eq(faostat_discard_pending(), 1, 'المدير يرفض: صفٌّ واحد');
  perform _eq((select count(*)::int from faostat_pending), 0, 'والمنتظِر فرغ');
  perform _eq((select count(*)::int from faostat_observations), 4, 'والأرقام كما هي');
  perform _eq((select count(*)::int from faostat_loads), 2, 'ولا يُسجَّل تحميلٌ لم يقع');
end $$;
reset role;

\echo ''
\echo 'و) الصلاحيّات'

do $$ begin
  perform _eq(has_function_privilege('anon', 'faostat_apply_pending(integer,timestamptz)', 'execute'), false, 'الاعتماد ليس للزائر');
  perform _eq(has_function_privilege('service_role', 'faostat_apply_pending(integer,timestamptz)', 'execute'), false, 'ولا لمفتاح الخدمة');
  perform _eq(has_function_privilege('authenticated', 'faostat_apply_pending(integer,timestamptz)', 'execute'), true, 'وهو للمسجَّل (والدالّة تسأل: مدير؟)');
  perform _eq(has_function_privilege('service_role', 'faostat_discard_pending()', 'execute'), false, 'والرفض ليس لمفتاح الخدمة');
  perform _eq(has_function_privilege('authenticated', 'faostat_log_keep()', 'execute'), false, 'والحارس الداخليّ لا يستدعيه أحد');
  perform _eq(has_table_privilege('service_role', 'faostat_observations', 'insert'), false, 'ومفتاح الخدمة لا يكتب في الأرقام المحمَّلة');
  perform _eq(has_table_privilege('service_role', 'faostat_observations', 'select'), true, 'لكنّه يقرؤها ليقارن');
  perform _eq(has_table_privilege('service_role', 'faostat_pending', 'update'), false, 'والفرقُ يُكتب ويُحذف ولا يُعدَّل');
  perform _eq(has_table_privilege('authenticated', 'faostat_pending', 'insert'), false, 'والمسجَّل لا يكتب الفرق');
  perform _eq(has_table_privilege('anon', 'faostat_pending', 'select'), false, 'والزائر لا يقرؤه');
end $$;

\echo ''
\echo '=========================================================================='

do $$
declare f integer;
begin
  select fails into f from _score;
  if f > 0 then raise exception 'فشل % فحصاً.', f; end if;
  raise notice 'ALL CHECKS PASSED — الفرقُ ينتظر المدير، وما استُبدل يُحفظ';
end $$;
