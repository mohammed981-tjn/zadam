-- بوّابةُ إشراف المنصّة (البند ١٩١).
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
create or replace function _refuses(q text, expect text, label text) returns void language plpgsql as $$
begin
  execute q; perform _fail(label, 'نُفِّذ ولم يُرفض');
exception when others then
  if sqlerrm like '%' || expect || '%' then perform _pass(label || ' — ' || left(sqlerrm, 70));
  else perform _fail(label, 'رُفض لسببٍ آخر: ' || sqlerrm); end if;
end $$;

create table if not exists _ids (name text primary key, id uuid);
create table if not exists _cfg (k text primary key, d date);
grant all on _ids, _cfg to anon, authenticated, service_role;

-- Users: five farmers, three investors, an administrator, and a plain user.
insert into auth.users (id)
select ('a0000000-0000-0000-0000-00000000000' || i)::uuid from generate_series(1, 5) i
union all select ('c0000000-0000-0000-0000-00000000000' || i)::uuid from generate_series(1, 3) i
union all select 'ad000000-0000-0000-0000-0000000000ad'::uuid
union all select 'ad200000-0000-0000-0000-0000000000ad'::uuid
union all select 'ee000000-0000-0000-0000-0000000000ee'::uuid;
insert into profiles (id, full_name, role)
select ('a0000000-0000-0000-0000-00000000000' || i)::uuid, 'مزارع ' || i, 'investor'::user_role from generate_series(1, 5) i
union all select ('c0000000-0000-0000-0000-00000000000' || i)::uuid, 'مستثمر ' || i, 'investor'::user_role from generate_series(1, 3) i
union all select 'ad000000-0000-0000-0000-0000000000ad'::uuid, 'مدير', 'admin'::user_role
union all select 'ad200000-0000-0000-0000-0000000000ad'::uuid, 'مدير ثانٍ', 'admin'::user_role
union all select 'ee000000-0000-0000-0000-0000000000ee'::uuid, 'عاديّ', 'investor'::user_role;

insert into seasons (id, owner_id, name, crop_key, station_key, irrigation, feddans, planting_date)
select ('5a000000-0000-0000-0000-00000000000' || i)::uuid, ('a0000000-0000-0000-0000-00000000000' || i)::uuid,
       'موسم ' || i, 'wheat', 'x', 'canal', 10, current_date - 200
  from generate_series(1, 5) i;
-- The second administrator farms too, and so owns a book (this month, outside every month the figures below look at).
insert into seasons (id, owner_id, name, crop_key, station_key, irrigation, feddans, planting_date)
values ('5a000000-0000-0000-0000-000000000009', 'ad200000-0000-0000-0000-0000000000ad', 'موسم المدير', 'wheat', 'x', 'canal', 5, current_date - 20);
insert into ledger_entries (season_id, category, amount, entry_date, created_by)
values ('5a000000-0000-0000-0000-000000000009', 'seeds', 5, current_date - 1, 'ad200000-0000-0000-0000-0000000000ad');

-- The months: m0 is a month that is over (the one before last, so every date in it is past in any time zone),
-- m1 the month before it, m2 two before, m3 three before.
insert into _cfg values
  ('m0', (date_trunc('month', current_date) - interval '2 months')::date),
  ('m1', (date_trunc('month', current_date) - interval '3 months')::date),
  ('m2', (date_trunc('month', current_date) - interval '4 months')::date),
  ('m3', (date_trunc('month', current_date) - interval '5 months')::date);

grant usage on schema public, auth to anon, authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated, service_role;
grant select, update on _score to anon, authenticated, service_role;
grant select, update on _who to anon, authenticated, service_role;
grant execute on function _fail(text,text), _pass(text), _act_as(uuid), _eq(anyelement,anyelement,text), _refuses(text,text,text)
  to anon, authenticated, service_role;

-- Farmers' entries through the simple book (which posts to the farm books). Sales U1..U4 = 100,200,300,400; costs
-- U1..U5 = 10 each; U1 also pays 100 in pounds (rate 1000).
insert into ledger_entries (season_id, category, amount, entry_date, created_by)
select ('5a000000-0000-0000-0000-00000000000' || i)::uuid, 'revenue', i * 100, (select d from _cfg where k = 'm0') + 4, ('a0000000-0000-0000-0000-00000000000' || i)::uuid
  from generate_series(1, 4) i;
insert into ledger_entries (season_id, category, amount, entry_date, created_by)
select ('5a000000-0000-0000-0000-00000000000' || i)::uuid, 'seeds', 10, (select d from _cfg where k = 'm0') + 5, ('a0000000-0000-0000-0000-00000000000' || i)::uuid
  from generate_series(1, 5) i;
insert into ledger_entries (season_id, category, amount, entered_amount, currency, fx_rate, entry_date, created_by) values
  ('5a000000-0000-0000-0000-000000000001', 'labour', 1, 100000, 'SDG', 1000, (select d from _cfg where k = 'm0') + 6, 'a0000000-0000-0000-0000-000000000001');

-- m1: two sellers only (too few). m2: three sellers, one of them 98% of it (dominated).
insert into ledger_entries (season_id, category, amount, entry_date, created_by)
select ('5a000000-0000-0000-0000-00000000000' || i)::uuid, 'revenue', v, (select d from _cfg where k = 'm1') + 3, ('a0000000-0000-0000-0000-00000000000' || i)::uuid
  from (values (1, 50), (2, 60)) t(i, v);
insert into ledger_entries (season_id, category, amount, entry_date, created_by)
select ('5a000000-0000-0000-0000-00000000000' || i)::uuid, 'revenue', v, (select d from _cfg where k = 'm2') + 3, ('a0000000-0000-0000-0000-00000000000' || i)::uuid
  from (values (1, 1), (2, 1), (3, 98)) t(i, v);
-- m3: three farmers with costs only (10, 20, 30): net cash is a negative figure.
insert into ledger_entries (season_id, category, amount, entry_date, created_by)
select ('5a000000-0000-0000-0000-00000000000' || i)::uuid, 'seeds', v, (select d from _cfg where k = 'm3') + 3, ('a0000000-0000-0000-0000-00000000000' || i)::uuid
  from (values (1, 10), (2, 20), (3, 30)) t(i, v);

-- Investors deploy 1000, 2000, 3000 in m0 (service key writes their books, as the contract flow will).
do $$
declare i integer; b uuid; d date := (select d from _cfg where k = 'm0') + 7;
begin
  for i in 1..3 loop
    b := ledger_open_book_for(('c0000000-0000-0000-0000-00000000000' || i)::uuid, 'investor');
    insert into _ids values ('INV' || i, b);
    perform ledger_post_for(b, d, 'توظيف في موسم',
      jsonb_build_array(jsonb_build_object('key','deployed_season','side','D','currency','USD','minor', i * 100000),
                        jsonb_build_object('key','bank','side','C','currency','USD','minor', i * 100000)),
      'inv-deploy-' || i, null, 'test', null);
  end loop;
end $$;
insert into _ids select 'U' || i, id from ledger_books b, generate_series(1, 5) i
 where b.kind = 'farm' and b.owner_id = ('a0000000-0000-0000-0000-00000000000' || i)::uuid;

\echo ''
\echo '=========================================================================='
\echo 'أ) المستوى ١: الإحصاءات المجمَّعة بلا أسماء'
\echo '=========================================================================='
do $$
declare m0 date := (select d from _cfg where k = 'm0'); m1 date := (select d from _cfg where k = 'm1'); m2 date := (select d from _cfg where k = 'm2');
begin
  perform _eq((select value_minor from oversight_flows(m0, m0 + 27) where metric = 'farm_sales' and period = m0), 100000::bigint, 'مبيعات المزارع في الشهر: ١٠٠+٢٠٠+٣٠٠+٤٠٠ = ١٬٠٠٠$');
  perform _eq((select books from oversight_flows(m0, m0 + 27) where metric = 'farm_sales' and period = m0), 4, 'من أربعة دفاتر');
  perform _eq((select suppressed from oversight_flows(m0, m0 + 27) where metric = 'farm_sales' and period = m0), false, 'ظاهرةً');
  perform _eq((select value_minor from oversight_flows(m0, m0 + 27) where metric = 'farm_costs' and period = m0), 15000::bigint, 'وتكاليف الإنتاج: ٥×١٠ + ١٠٠ جنيهاً بسعر ١٠٠٠ = ١٥٠$');
  perform _eq((select books from oversight_flows(m0, m0 + 27) where metric = 'farm_costs' and period = m0), 5, 'من خمسة دفاتر');
  perform _eq((select value_minor from oversight_flows(m0, m0 + 27) where metric = 'farm_cash_net' and period = m0), 85000::bigint, 'وصافي النقد الداخل: ١٬٠٠٠ − ١٥٠ = ٨٥٠$');
  perform _eq((select value_minor from oversight_flows(m0, m0 + 27) where metric = 'investor_deployed' and period = m0), 600000::bigint, 'وتوظيف المستثمرين ٦٬٠٠٠$');
  perform _eq((select books from oversight_flows(m0, m0 + 27) where metric = 'investor_deployed' and period = m0), 3, 'من ثلاثة دفاتر (الحدّ الأدنى)');
  perform _eq((select count(*)::int from oversight_flows(m0, m0 + 27) where metric = 'fees_paid'), 0, 'وما لم يحدث لا يظهر');

  perform _eq((select suppressed from oversight_flows(m1, m1 + 27) where metric = 'farm_sales'), true, 'شهرٌ باعَ فيه دفتران فقط: محجوب');
  perform _eq((select value_minor from oversight_flows(m1, m1 + 27) where metric = 'farm_sales'), null, 'فلا رقم');
  perform _eq((select books from oversight_flows(m1, m1 + 27) where metric = 'farm_sales'), null, 'ولا عدد دفاتر');
  perform _eq((select entries from oversight_flows(m1, m1 + 27) where metric = 'farm_sales'), null, 'ولا عدد قيود');

  perform _eq((select suppressed from oversight_flows(m2, m2 + 27) where metric = 'farm_sales'), true, 'وثلاثةٌ يهيمن أحدهم بـ٩٨٪: محجوب أيضاً');
  perform _eq((select value_minor from oversight_flows(m2, m2 + 27) where metric = 'farm_sales'), null, 'فلا يُستنتج المهيمن من المجموع');

  perform _eq((select count(*)::int from oversight_flows(m0 - 200, m0 + 27) where period < m0 - 100), 0, 'ومدى بلا حركة لا صفوف فيه');
  perform _eq(pg_get_function_result('oversight_flows(date,date)'::regprocedure),
              'TABLE(period date, metric text, label_ar text, value_minor bigint, books integer, entries integer, suppressed boolean)',
              'والنتيجة بلا هويّة: لا معرّف دفتر ولا مستخدم');
end $$;

\echo ''
\echo '=========================================================================='
\echo 'ب) الحدّان من الإعدادات، وصورة العملات، ومن يُسمح له'
\echo '=========================================================================='
do $$
declare m0 date := (select d from _cfg where k = 'm0'); m1 date := (select d from _cfg where k = 'm1');
begin
  perform _eq((select min_books || '|' || max_top_share || '|' || inspection_hours || '|' || inspection_max_hours from oversight_settings), '3|0.85|24|72', 'الإعدادات: ٣ دفاتر، وأكبر حصّة ٨٥٪، وفحصٌ ٢٤ ساعة حدّه ٧٢');
  perform _eq((select count(*)::int from oversight_currency_mix(m0, m0 + 27) where not suppressed), 2, 'صورة العملات: الدولار والجنيه ظاهران في الشهر');
  perform _eq((select sum(share_pct) between 99 and 101 from oversight_currency_mix(m0, m0 + 27)), true, 'ومجموع الحصص مئة');
  perform _eq((select share_pct > 0 from oversight_currency_mix(m0, m0 + 27) where currency = 'SDG'), true, 'وللجنيه حصّةٌ لأنّ مزارعاً دفع به');
  perform _eq((select bool_and(suppressed) from oversight_currency_mix(m1, m1 + 27)), true, 'وشهرٌ باعَ فيه دفتران محجوب');
  perform _eq((select bool_and(share_pct is null) from oversight_currency_mix(m1, m1 + 27)), true, 'فلا حصص');
  perform _refuses($q$select * from oversight_flows(current_date, current_date - 1)$q$, 'مدىً غير صالح', 'مدىً مقلوب يُرفض');
  perform _refuses($q$select * from oversight_flows(current_date - 2000, current_date)$q$, 'مدىً غير صالح', 'ومدىً أطول من ثلاث سنوات');
end $$;

set role authenticated;
do $$
declare m0 date := (select d from _cfg where k = 'm0');
begin
  perform _act_as('ee000000-0000-0000-0000-0000000000ee');
  perform _refuses(format($q$select * from oversight_flows(%L, %L)$q$, m0, m0 + 27), 'للإدارة وحدها', 'مستخدمٌ عاديّ لا يرى الإحصاءات');
  perform _refuses(format($q$select * from oversight_currency_mix(%L, %L)$q$, m0, m0 + 27), 'للإدارة وحدها', 'ولا صورة العملات');
  perform _refuses($q$select oversight_snapshot()$q$, 'للإدارة وحدها', 'ولا يسجّل في دفتر المنصّة');
  perform _eq((select count(*)::int from oversight_settings), 0, 'ولا يقرأ جدول الإعدادات (سياسة الصفوف للمدير وحده)');
  perform _eq((select count(*)::int from oversight_metrics), 0, 'ولا خريطة البنود');
  perform _act_as('ad000000-0000-0000-0000-0000000000ad');
  perform _eq((select count(*)::int from oversight_flows(m0, m0 + 27) where not suppressed), 4, 'والمدير يراها (أربعة بنود ظاهرة في الشهر)');
  perform _eq((select count(*)::int from oversight_settings), 1, 'ويقرأ الإعدادات');
  perform _eq((select count(*)::int from oversight_metrics) > 20, true, 'وخريطة البنود');
end $$;
reset role;
set role anon;
do $$
declare m0 date := (select d from _cfg where k = 'm0');
begin
  perform _refuses(format($q$select * from oversight_flows(%L, %L)$q$, m0, m0 + 27), 'permission denied', 'الزائر لا يستدعيها');
  perform _refuses($q$select * from ledger_inspections_list()$q$, 'permission denied', 'ولا يرى الفحوص');
end $$;
reset role;

\echo ''
\echo '=========================================================================='
\echo 'ج) المدير لا يكتب في دفاتر الناس، ولا يقرؤها بلا فحص'
\echo '=========================================================================='
set role authenticated;
do $$
declare u2 uuid := (select id from _ids where name = 'U2'); e2 uuid; plat_before int;
begin
  perform _act_as('ad000000-0000-0000-0000-0000000000ad');
  perform _eq((select count(*)::int from ledger_books), 0, 'بلا فحص: لا يرى المدير دفتراً لأحد');
  perform _eq((select count(*)::int from journal_entries), 0, 'ولا قيداً');
  perform _eq((select count(*)::int from journal_lines), 0, 'ولا سطراً');
  perform _eq((select count(*)::int from ledger_trial_balance(u2)), 0, 'ولا ميزان مراجعة');
  select id into e2 from journal_entries limit 1;
  perform _refuses(format($q$select ledger_post(%L, current_date, 'x', %L::jsonb, 'adm-write-0001')$q$, u2,
      jsonb_build_array(jsonb_build_object('key','cost_other','side','D','currency','USD','minor',1),
                        jsonb_build_object('key','cash_on_hand','side','C','currency','USD','minor',1))::text),
    'ليس هذا دفترك', 'ولا يكتب فيها');
  perform _refuses(format($q$select ledger_close_through(%L, current_date - 40)$q$, u2), 'ليس هذا دفترك', 'ولا يُقفل فترةً فيها');
  perform _refuses(format($q$select ledger_add_account(%L, '11', '1160', 'x')$q$, u2), 'ليس هذا دفترك', 'ولا يضيف حساباً');
  perform _refuses(format($q$insert into journal_entries (book_id, entry_date, idempotency_key, content_hash) values (%L, current_date, 'adm-direct-0001', repeat('a',64))$q$, u2),
    'permission denied', 'ولا إدراج مباشر');
end $$;
reset role;

\echo ''
\echo '=========================================================================='
\echo 'د) المستوى ٣: الفحص بسببٍ ومدّة، ويُخطَر به صاحبه'
\echo '=========================================================================='
set role authenticated;
do $$
declare u2 uuid := (select id from _ids where name = 'U2'); u3 uuid := (select id from _ids where name = 'U3'); i uuid; i2 uuid;
begin
  perform _act_as('ee000000-0000-0000-0000-0000000000ee');
  perform _refuses(format($q$select ledger_inspect_open(%L, 'سبب كافٍ للفحص هنا')$q$, u2), 'للإدارة وحدها', 'غير المدير لا يفحص');

  perform _act_as('ad000000-0000-0000-0000-0000000000ad');
  perform _refuses(format($q$select ledger_inspect_open(%L, 'قصير')$q$, u2), 'اكتب سبب الفحص', 'بلا سببٍ كافٍ يُرفض');
  perform _refuses(format($q$select ledger_inspect_open(%L, 'سبب كافٍ للفحص هنا', 0)$q$, u2), 'مدّة الفحص', 'ومدّةٌ صفر');
  perform _refuses(format($q$select ledger_inspect_open(%L, 'سبب كافٍ للفحص هنا', 100)$q$, u2), 'مدّة الفحص', 'وأطول من ٧٢ ساعة');
  perform _refuses($q$select ledger_inspect_open(gen_random_uuid(), 'سبب كافٍ للفحص هنا')$q$, 'الدفتر غير موجود', 'ودفترٌ مجهول');
  perform _act_as('ad200000-0000-0000-0000-0000000000ad');
  perform _refuses(format($q$select ledger_inspect_open(%L, 'سبب كافٍ للفحص هنا')$q$, (select id from ledger_books where owner_id = 'ad200000-0000-0000-0000-0000000000ad')), 'هذا دفترك أنت', 'والمدير لا يفتح فحصاً على دفتره هو');
  perform _act_as('ad000000-0000-0000-0000-0000000000ad');

  i := ledger_inspect_open(u2, 'شكوى مشترٍ في موسم ٢ تحتاج مراجعة القيود');
  perform _eq(i is not null, true, 'المدير يفتح فحصاً على دفتر المزارع ٢');
  i2 := ledger_inspect_open(u2, 'سببٌ آخر لنفس الدفتر وقد فُتح فحصٌ');
  perform _eq(i2, i, 'وفتحه ثانيةً يُرجع القائم');

  perform _eq((select count(*)::int from ledger_books), 1, 'يرى دفتراً واحداً: المفحوص');
  perform _eq((select id from ledger_books), u2, 'هو دفتر المزارع ٢');
  perform _eq((select count(*)::int from ledger_accounts where book_id <> u2), 0, 'ولا حساباً من غيره');
  perform _eq((select count(*)::int from journal_entries where book_id <> u2), 0, 'ولا قيداً من غيره');
  perform _eq((select count(*)::int from journal_entries where book_id = u2) > 0, true, 'لكنّه يرى قيود المفحوص');
  perform _eq((select count(*)::int from ledger_trial_balance(u2)) > 0, true, 'ويقرأ ميزان مراجعته بالدالّة نفسها');
  perform _eq((select balanced from ledger_trial_balance_proof(u2)), true, 'وإثباته');
  perform _eq((select count(*)::int from ledger_trial_balance(u3)), 0, 'ولا ميزان غيره');

  perform _refuses(format($q$select ledger_post(%L, current_date, 'x', %L::jsonb, 'adm-write-0002')$q$, u2,
      jsonb_build_array(jsonb_build_object('key','cost_other','side','D','currency','USD','minor',1),
                        jsonb_build_object('key','cash_on_hand','side','C','currency','USD','minor',1))::text),
    'ليس هذا دفترك', 'ومع الفحص لا يكتب فيه');
  perform _refuses(format($q$select ledger_reverse(%L, 'لن أعكسه')$q$, (select id from journal_entries where book_id = u2 limit 1)), 'ليس هذا قيدك', 'ولا يعكس');
  perform _refuses(format($q$select ledger_close_through(%L, current_date - 40)$q$, u2), 'ليس هذا دفترك', 'ولا يُقفل');
  perform _refuses(format($q$update ledger_books set closed_through = current_date - 1 where id = %L$q$, u2), 'permission denied', 'ولا يعدّل الدفتر');

  perform _act_as('a0000000-0000-0000-0000-000000000003');
  perform _eq((select count(*)::int from ledger_inspections), 0, 'صاحب دفترٍ آخر لا يرى فحصاً ليس على دفتره');
  perform _act_as('a0000000-0000-0000-0000-000000000002');
  perform _eq((select count(*)::int from ledger_inspections), 1, 'وصاحب الدفتر المفحوص يراه');
  perform _eq((select reason from ledger_inspections), 'شكوى مشترٍ في موسم ٢ تحتاج مراجعة القيود', 'بسببه');
  perform _eq((select closed_at from ledger_inspections), null, 'قائماً');
  perform _refuses($q$select opened_by from ledger_inspections$q$, 'permission denied', 'ولا يرى أيّ مدير فتحه');
  perform _eq((select count(*)::int from journal_entries where book_id = (select id from _ids where name = 'U2')) > 0, true, 'ويبقى يرى دفتره');
  perform _refuses($q$select * from ledger_inspections_list()$q$, 'للإدارة وحدها', 'وقائمة الفحوص الكاملة للإدارة');
end $$;
reset role;
do $$
begin
  perform _eq((select count(*)::int from notifications where recipient_id = 'a0000000-0000-0000-0000-000000000002' and kind = 'ledger_inspection'), 1, 'وصله إشعارٌ لحظة الفتح');
  perform _eq((select body like '%شكوى مشترٍ%' and body like '%24 ساعة%' from notifications where recipient_id = 'a0000000-0000-0000-0000-000000000002' and kind = 'ledger_inspection'), true, 'يذكر السبب والمدّة');
  perform _eq((select count(*)::int from notifications where kind = 'ledger_inspection' and recipient_id <> 'a0000000-0000-0000-0000-000000000002'), 0, 'ولم يصل غيرَه');
end $$;

set role authenticated;
do $$
declare u2 uuid := (select id from _ids where name = 'U2'); i uuid;
begin
  perform _act_as('ad000000-0000-0000-0000-0000000000ad');
  select id into i from ledger_inspections_list() where book_id = u2;
  perform _eq((select book_kind from ledger_inspections_list() where id = i), 'farm', 'قائمة الإدارة: نوع الدفتر');
  perform _eq((select opened_by from ledger_inspections_list() where id = i), 'ad000000-0000-0000-0000-0000000000ad'::uuid, 'ومن فتحه');
  perform _eq((select active from ledger_inspections_list() where id = i), true, 'قائماً');
  perform _eq(ledger_inspect_close(i), true, 'ويُغلق');
  perform _eq(ledger_inspect_close(i), false, 'وإغلاقه ثانيةً لا يفعل شيئاً');
  perform _eq((select count(*)::int from ledger_books), 0, 'بعد الإغلاق لا يرى المدير الدفتر');
  perform _eq((select count(*)::int from ledger_trial_balance(u2)), 0, 'ولا ميزانه');
end $$;
reset role;
do $$
begin
  perform _eq((select count(*)::int from notifications where recipient_id = 'a0000000-0000-0000-0000-000000000002' and kind = 'ledger_inspection'), 2, 'وصاحب الدفتر أُخطر بالإغلاق أيضاً');
end $$;

-- Expiry: a standing inspection past its time grants nothing. (The clock is moved by hand, as the owner of the database.)
set role authenticated;
do $$
declare u4 uuid := (select id from _ids where name = 'U4'); i uuid;
begin
  perform _act_as('ad000000-0000-0000-0000-0000000000ad');
  i := ledger_inspect_open(u4, 'مراجعة قيد بيعٍ معكوس في الموسم ٤', 1);
  perform _eq((select count(*)::int from ledger_books), 1, 'فحصٌ لساعة: يرى الدفتر');
  insert into _ids values ('INSP4', i);
end $$;
reset role;
begin;
set local session_replication_role = replica;
update ledger_inspections set opened_at = now() - interval '3 hours', expires_at = now() - interval '2 hours' where id = (select id from _ids where name = 'INSP4');
commit;
set role authenticated;
do $$
begin
  perform _act_as('ad000000-0000-0000-0000-0000000000ad');
  perform _eq((select count(*)::int from ledger_books), 0, 'انتهت مدّته: لا اطّلاع');
  perform _eq((select count(*)::int from journal_lines), 0, 'ولا سطور');
  perform _eq((select active from ledger_inspections_list() where id = (select id from _ids where name = 'INSP4')), false, 'وقائمة الإدارة تقول إنّه غير قائم');
end $$;
reset role;

\echo ''
\echo '=========================================================================='
\echo 'هـ) سجلّ الفحوص لا يُمحى'
\echo '=========================================================================='
do $$
begin
  perform _refuses($q$delete from ledger_inspections$q$, 'لا يُحذف', 'لا حذف حتى للمشرف على القاعدة');
  perform _refuses($q$truncate ledger_inspections$q$, 'لا يُحذف', 'ولا TRUNCATE');
  perform _refuses($q$update ledger_inspections set reason = 'سبب آخر مختلف تماماً'$q$, 'لا يتغيّر من الفحص', 'ولا تغيير للسبب');
  perform _refuses($q$update ledger_inspections set expires_at = expires_at + interval '10 days'$q$, 'لا يتغيّر من الفحص', 'ولا لمدّة الفحص');
  perform _refuses($q$update ledger_inspections set opened_by = gen_random_uuid()$q$, 'لا يتغيّر من الفحص', 'ولا لمن فتحه');
  perform _refuses($q$update ledger_inspections set closed_at = now() + interval '1 day' where id = (select id from ledger_inspections where closed_at is not null limit 1)$q$,
    'المغلق لا يُعاد', 'والمغلق لا يُغيَّر');
  perform _eq((select count(*)::int from ledger_inspections), 2, 'وفي السجلّ فحصان');
end $$;

\echo ''
\echo '=========================================================================='
\echo 'و) الربط بدفتر المنصّة: المجاميع غير المحجوبة تُسجَّل في حساباتٍ إحصائيّة'
\echo '=========================================================================='
set role service_role;
do $$
declare m0 date := (select d from _cfg where k = 'm0'); n integer;
begin
  perform _act_as(null);
  n := oversight_snapshot(m0);
  perform _eq(n, 4, 'التسجيل يضع أربعة بنودٍ ظاهرة في الشهر');
end $$;
reset role;
do $$
declare m0 date := (select d from _cfg where k = 'm0'); plat uuid;
begin
  select id into plat from ledger_books where kind = 'platform';
  perform _eq(plat is not null, true, 'وفُتح دفتر المنصّة');
  perform _eq((select count(*)::int from ledger_accounts where book_id = plat and system_key like 'oversight\_%'), 9, 'بتسعة حساباتٍ إحصائيّة');
  perform _eq((select sum(case l.side when 'C' then l.base_minor else -l.base_minor end) from journal_lines l join ledger_accounts a on a.id = l.account_id and a.book_id = l.book_id
                where l.book_id = plat and a.system_key = 'oversight_farm_sales'), 100000::numeric, '٩٢١٠ مبيعات المزارع = ١٬٠٠٠$');
  perform _eq((select sum(case l.side when 'C' then l.base_minor else -l.base_minor end) from journal_lines l join ledger_accounts a on a.id = l.account_id and a.book_id = l.book_id
                where l.book_id = plat and a.system_key = 'oversight_farm_costs'), 15000::numeric, '٩٢٢٠ التكاليف = ١٥٠$');
  perform _eq((select sum(case l.side when 'C' then l.base_minor else -l.base_minor end) from journal_lines l join ledger_accounts a on a.id = l.account_id and a.book_id = l.book_id
                where l.book_id = plat and a.system_key = 'oversight_farm_cash_net'), 85000::numeric, '٩٢٣٠ صافي النقد = ٨٥٠$');
  perform _eq((select sum(case l.side when 'C' then l.base_minor else -l.base_minor end) from journal_lines l join ledger_accounts a on a.id = l.account_id and a.book_id = l.book_id
                where l.book_id = plat and a.system_key = 'oversight_investor_deployed'), 600000::numeric, '٩٢٦٠ توظيف المستثمرين = ٦٬٠٠٠$');
  perform _eq((select sum(case l.side when 'D' then l.base_minor else -l.base_minor end) from journal_lines l join ledger_accounts a on a.id = l.account_id and a.book_id = l.book_id
                where l.book_id = plat and a.system_key = 'memo_contra'), 800000::numeric, 'ومقابلها ٩١٢٠ يجمعها كلَّها (٨٬٠٠٠$)');
  perform _eq((select count(*)::int from journal_entries where book_id = plat and source_type = 'oversight' and entry_date between (select d from _cfg where k = 'm1') and (select d from _cfg where k = 'm1') + 27), 0, 'وما حُجب (شهرا ١ و٢) لم يُسجَّل');
  perform _eq((select balanced and equation_holds from ledger_trial_balance_proof(plat)), true, 'ودفتر المنصّة متوازن');
  perform _eq((select max(entry_date) from journal_entries where book_id = plat), m0 + 27 + (extract(day from (date_trunc('month', m0) + interval '1 month - 1 day'))::int - 28), 'بتاريخ آخر يومٍ من الشهر');
end $$;

do $$
declare m0 date := (select d from _cfg where k = 'm0'); n integer; plat uuid; n_before integer;
begin
  select id into plat from ledger_books where kind = 'platform';
  select count(*) into n_before from journal_entries where book_id = plat;
  n := oversight_snapshot(m0);
  perform _eq(n, 0, 'تكرار التسجيل لا يضيف شيئاً');
  perform _eq((select count(*)::int from journal_entries where book_id = plat), n_before, 'ولا قيداً');

  -- a late sale of 500 in m0 by farmer 5: the figure moves, and only the difference is posted.
  insert into ledger_entries (season_id, category, amount, entry_date, created_by)
  values ('5a000000-0000-0000-0000-000000000005', 'revenue', 500, m0 + 8, 'a0000000-0000-0000-0000-000000000005');
  n := oversight_snapshot(m0);
  perform _eq(n, 2, 'قيدٌ متأخّر: يُسجَّل فرقه في بندين (المبيعات وصافي النقد)');
  perform _eq((select sum(case l.side when 'C' then l.base_minor else -l.base_minor end) from journal_lines l join ledger_accounts a on a.id = l.account_id and a.book_id = l.book_id
                where l.book_id = plat and a.system_key = 'oversight_farm_sales'), 150000::numeric, 'فيصير حساب المبيعات ١٬٥٠٠$');
  perform _eq((select sum(case l.side when 'C' then l.base_minor else -l.base_minor end) from journal_lines l join ledger_accounts a on a.id = l.account_id and a.book_id = l.book_id
                where l.book_id = plat and a.system_key = 'oversight_farm_cash_net'), 135000::numeric, 'وصافي النقد ١٬٣٥٠$');
  perform _eq(oversight_snapshot(m0), 0, 'وتكرار التسجيل بعده بلا أثر');

  -- m3: only costs, three farmers: net cash is negative, so the cash account is debited and the contra credited.
  n := oversight_snapshot((select d from _cfg where k = 'm3'));
  perform _eq(n, 2, 'شهرٌ بتكاليف فقط: بندا التكاليف وصافي النقد');
  perform _eq((select sum(case l.side when 'C' then l.base_minor else -l.base_minor end) from journal_lines l join ledger_accounts a on a.id = l.account_id and a.book_id = l.book_id
                join journal_entries je on je.id = l.entry_id
                where l.book_id = plat and a.system_key = 'oversight_farm_cash_net' and je.source_id = md5(to_char((select d from _cfg where k = 'm3'), 'YYYY-MM') || ':farm_cash_net')::uuid), -6000::numeric, 'صافي النقد السالب يُسجَّل سالباً (−٦٠$)');
  perform _eq((select balanced and equation_holds from ledger_trial_balance_proof(plat)), true, 'والدفتر متوازن بعد ذلك كلّه');
end $$;

-- the platform's chart can grow after its book is open: what the template gained is added, once.
do $$
declare plat uuid; n integer;
begin
  select id into plat from ledger_books where kind = 'platform';
  insert into ledger_chart_templates (kind, code, parent_code, name_ar, name_en, type, postable, system_key)
  values ('platform', '9299', '9', 'حسابٌ جديد في القالب', 'New in the template', 'equity', true, 'oversight_test_new');
  n := _ledger_sync_chart(plat);
  perform _eq(n, 1, 'القالب اتّسع: يُضاف الحساب الجديد إلى الدفتر المفتوح');
  perform _eq(_ledger_sync_chart(plat), 0, 'مرّةً واحدة');
end $$;

\echo ''
\echo '=========================================================================='
\echo 'ز) من ينادي ماذا'
\echo '=========================================================================='
set role authenticated;
do $$
begin
  perform _act_as('ee000000-0000-0000-0000-0000000000ee');
  perform _refuses($q$select _ledger_sync_chart(gen_random_uuid())$q$, 'permission denied', 'تهيئة الحسابات ليست لمستخدم');
  perform _refuses($q$select * from ledger_inspections_list()$q$, 'للإدارة وحدها', 'قائمة الفحوص للإدارة');
  perform _refuses($q$select ledger_inspect_close(gen_random_uuid())$q$, 'للإدارة وحدها', 'وإغلاقها');
  perform _eq(has_function_privilege('authenticated', 'oversight_snapshot(date)', 'execute'), true, 'ومن يملك التنفيذ يُسأل داخل الدالّة');
end $$;
reset role;
set role service_role;
do $$
begin
  perform _act_as(null);
  perform _refuses($q$select ledger_inspect_open(gen_random_uuid(), 'سبب كافٍ للفحص هنا')$q$, 'permission denied', 'مفتاح الخدمة لا يفتح فحصاً (يفتحه مديرٌ مسمّى)');
  perform _eq((select count(*)::int from oversight_flows(current_date - 400, current_date)) >= 4, true, 'لكنّه يقرأ الإحصاءات');
end $$;
reset role;

\echo ''
\echo '=========================================================================='
\echo 'ح) البحث عن دفترٍ لفحصه: رقمه وحده، للمدير وحده'
\echo '=========================================================================='
set role authenticated;
do $$
declare u2 uuid := (select id from _ids where name = 'U2');
begin
  perform _act_as('ee000000-0000-0000-0000-0000000000ee');
  perform _refuses($q$select oversight_find_book('a0000000-0000-0000-0000-000000000002', 'farm')$q$, 'للإدارة وحدها', 'غير المدير لا يبحث');
  perform _act_as(null);
  perform _refuses($q$select oversight_find_book('a0000000-0000-0000-0000-000000000002', 'farm')$q$, 'للإدارة وحدها', 'ومن غير دخول');
  perform _act_as('ad000000-0000-0000-0000-0000000000ad');
  perform _eq(oversight_find_book('a0000000-0000-0000-0000-000000000002', 'farm'), u2, 'المدير يأخذ رقم دفتر مزارعٍ بعينه');
  perform _eq(oversight_find_book('a0000000-0000-0000-0000-000000000002', 'investor'), null::uuid, 'ولا دفتر مستثمر لمن ليس له');
  perform _eq(oversight_find_book('c0000000-0000-0000-0000-000000000001', 'investor'), (select id from _ids where name = 'INV1'), 'ودفتر المستثمر');
  perform _eq(oversight_find_book(gen_random_uuid(), 'farm'), null::uuid, 'وشخصٌ لا دفتر له: لا شيء');
  perform _refuses($q$select oversight_find_book('a0000000-0000-0000-0000-000000000002', 'platform')$q$, 'نوع دفترٍ غير معروف', 'ودفتر المنصّة ليس مما يُفحص');
  perform _eq((select count(*)::int from ledger_books where id = u2), 0, 'والرقم لا يفتح الدفتر: القراءة بعد الفحص وحده');
  perform _eq(ledger_inspect_open(oversight_find_book('a0000000-0000-0000-0000-000000000003', 'farm'), 'فحصٌ بالرقم الذي وجده المدير')  is not null, true, 'ويفتح به فحصاً بسببه');
end $$;
reset role;
do $$
begin
  perform _eq(has_function_privilege('anon', 'oversight_find_book(uuid,text)', 'execute')
              or has_function_privilege('service_role', 'oversight_find_book(uuid,text)', 'execute'), false, 'لا زائر ولا مفتاح خدمة');
  perform _eq(has_function_privilege('authenticated', 'oversight_find_book(uuid,text)', 'execute'), true, 'والمسجَّل يُسأل داخل الدالّة');
end $$;

do $$
declare n integer;
begin
  select fails into n from _score;
  if n > 0 then raise exception '% فحصاً فشل', n; end if;
end $$;
\echo ''
\echo 'OK'
