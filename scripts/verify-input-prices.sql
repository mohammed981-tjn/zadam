-- بوّابةُ بلاغات السماد والوقود: البلاغُ بدالّةٍ لصاحب الجلسة، بتاريخِ هذا
-- الأسبوع ووحدةٍ تناسب الصنف؛ والناسُ يقرؤون بلا اسم المُبلِّغ؛ والسحبُ والإخفاء
-- علامةٌ لا حذف؛ والإخفاءُ للإدارة وحدها.

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

grant usage on schema public, auth to anon, authenticated;
grant execute on function _refuses(text, text), _pass(text), _fail(text, text) to anon, authenticated;
grant select, update on _score to anon, authenticated;
grant select, update on _who to anon, authenticated;

insert into auth.users (id) values
  ('a1000000-0000-0000-0000-0000000000a1'),
  ('b2000000-0000-0000-0000-0000000000b2'),
  ('c3000000-0000-0000-0000-0000000000c3')
on conflict (id) do nothing;
insert into profiles (id, full_name, role) values
  ('a1000000-0000-0000-0000-0000000000a1', 'مزارع', 'investor'),
  ('b2000000-0000-0000-0000-0000000000b2', 'تاجر', 'investor'),
  ('c3000000-0000-0000-0000-0000000000c3', 'المشرف', 'admin')
on conflict (id) do nothing;

\echo ''
\echo 'أ) البلاغ بدالّةٍ، بتاريخ هذا الأسبوع ووحدةٍ تناسب الصنف'

delete from _who; insert into _who values ('a1000000-0000-0000-0000-0000000000a1');
set role authenticated;
do $$
declare r uuid;
begin
  r := input_price_report_add('urea', 'sack_50kg', null, 'الجزيرة', 'سوق المعيليق', 300000, 'available', (now() at time zone 'Africa/Khartoum')::date, null);
  perform _eq(r is not null, true, 'بلاغُ اليوريا بالجوال يُقبل');
  perform _eq((select reporter_id from input_price_reports where id = r), 'a1000000-0000-0000-0000-0000000000a1'::uuid, 'ويُسجَّل لصاحب الجلسة');
  r := input_price_report_add('diesel', 'gallon', 'parallel', 'القضارف', 'القضارف', 90000, 'limited', (now() at time zone 'Africa/Khartoum')::date - 3, 'في محطّة واحدة');
  perform _eq(r is not null, true, 'وبلاغُ الجازولين بالجالون من السوق الموازي');
  r := input_price_report_add('dap', 'sack_50kg', null, 'سنار', 'سنجة', 450000, 'unavailable', (now() at time zone 'Africa/Khartoum')::date - 1, null);
  perform _eq((select price_sdg from input_price_reports where id = r), null::numeric, 'و«غير موجود» يُقبل ويُحفظ بلا سعر');
  perform _refuses($q$select input_price_report_add('urea', 'liter', null, 'الجزيرة', 'مدني', 1000, 'available', (now() at time zone 'Africa/Khartoum')::date, null)$q$,
    'السماد باللتر يُرفض');
  perform _refuses($q$select input_price_report_add('diesel', 'sack_50kg', 'official', 'الجزيرة', 'مدني', 1000, 'available', (now() at time zone 'Africa/Khartoum')::date, null)$q$,
    'والوقود بالجوال يُرفض');
  perform _refuses($q$select input_price_report_add('diesel', 'liter', null, 'الجزيرة', 'مدني', 1000, 'available', (now() at time zone 'Africa/Khartoum')::date, null)$q$,
    'والوقود بلا «رسميّ أو موازٍ» يُرفض');
  perform _refuses($q$select input_price_report_add('urea', 'sack_50kg', null, 'الجزيرة', 'مدني', null, 'available', (now() at time zone 'Africa/Khartoum')::date, null)$q$,
    'و«موجود» بلا سعر يُرفض');
  perform _refuses($q$select input_price_report_add('urea', 'sack_50kg', null, 'الجزيرة', 'مدني', 1000, 'available', (now() at time zone 'Africa/Khartoum')::date - 15, null)$q$,
    'وتاريخٌ أقدم من أربعة عشر يوماً يُرفض');
  perform _refuses($q$select input_price_report_add('urea', 'sack_50kg', null, 'الجزيرة', 'مدني', 1000, 'available', (now() at time zone 'Africa/Khartoum')::date + 1, null)$q$,
    'ويومٌ لم يأتِ يُرفض');
  perform _refuses($q$select input_price_report_add('urea', 'sack_50kg', null, 'ولاية الخيال', 'مدني', 1000, 'available', (now() at time zone 'Africa/Khartoum')::date, null)$q$,
    'وولايةٌ خارج القائمة تُرفض');
  perform _refuses($q$select input_price_report_add('gold', 'kg', null, 'الجزيرة', 'مدني', 1000, 'available', (now() at time zone 'Africa/Khartoum')::date, null)$q$,
    'وصنفٌ خارج القائمة يُرفض');
  perform _refuses($q$select input_price_report_add('urea', 'sack_50kg', null, 'الجزيرة', ' سوق المعيليق ', 310000, 'available', (now() at time zone 'Africa/Khartoum')::date, null)$q$,
    'والبلاغُ نفسه مرّتين في اليوم يُرفض');
  perform _refuses($q$insert into input_price_reports (item, unit, state, locality, price_sdg, availability, observed_on, reporter_id) values ('urea','kg','الجزيرة','مدني',1,'available',(now() at time zone 'Africa/Khartoum')::date,'a1000000-0000-0000-0000-0000000000a1')$q$,
    'ولا يكتب المستخدم في الجدول مباشرةً');
end $$;
reset role;

\echo ''
\echo 'ب) عشرون بلاغاً في اليوم حدٌّ'

delete from _who; insert into _who values ('b2000000-0000-0000-0000-0000000000b2');
set role authenticated;
do $$
declare i int;
begin
  for i in 1..20 loop
    perform input_price_report_add('petrol', 'liter', 'official', 'كسلا', 'سوق ' || i, 5000 + i, 'available', (now() at time zone 'Africa/Khartoum')::date, null);
  end loop;
  perform _refuses($q$select input_price_report_add('petrol', 'liter', 'official', 'كسلا', 'سوق ٢١', 5021, 'available', (now() at time zone 'Africa/Khartoum')::date, null)$q$,
    'البلاغُ الحادي والعشرون في اليوم يُرفض');
end $$;
reset role;

\echo ''
\echo 'ج) الناس يقرؤون بلا اسم المُبلِّغ'

delete from _who;
set role anon;
do $$ begin
  perform _eq((select count(*)::int from input_price_reports_recent(14)), 23, 'الزائر يقرأ كلّ البلاغات الظاهرة');
  perform _eq((select reporters from input_price_summary(14) where item = 'petrol'), 1, 'والملخّص يعدّ الأشخاص لا البلاغات وحدها');
  perform _eq((select reports from input_price_summary(14) where item = 'petrol'), 20, 'وعدد البلاغات');
  perform _eq((select median from input_price_summary(14) where item = 'petrol'), 5010.5::numeric, 'والوسيطُ محسوبٌ من أرقام الناس');
  perform _eq((select unavailable from input_price_summary(14) where item = 'dap'), 1, 'و«غير موجود» معدودٌ');
  perform _refuses($q$select * from input_price_reports$q$, 'ولا يقرأ الجدول نفسه (ففيه المُبلِّغ)');
  perform _refuses($q$select input_price_report_add('urea', 'kg', null, 'الجزيرة', 'مدني', 1000, 'available', (now() at time zone 'Africa/Khartoum')::date, null)$q$,
    'ولا يُبلّغ الزائر');
end $$;
reset role;

do $$ begin
  perform _eq((select count(*)::int from pg_proc
                where proname in ('input_price_reports_recent', 'input_price_summary')
                  and pg_get_function_result(oid) like '%reporter_id%'), 0,
    'ولا تُرجع دالّتا القراءة عمودَ المُبلِّغ');
  perform _eq(has_function_privilege('anon', 'public.input_price_report_add(text, text, text, text, text, numeric, text, date, text)', 'execute'), false,
    'والزائر لا يملك دالّة البلاغ');
  perform _eq(has_function_privilege('anon', 'public.input_price_report_hide(uuid, text)', 'execute'), false, 'ولا دالّة الإخفاء');
  perform _eq((select relrowsecurity from pg_class where oid = 'public.input_price_reports'::regclass), true, 'وحمايةُ الصفوف على الجدول');
end $$;

\echo ''
\echo 'د) السحب والإخفاء علامةٌ لا حذف، والإخفاء للإدارة وحدها'

delete from _who; insert into _who values ('b2000000-0000-0000-0000-0000000000b2');
set role authenticated;
do $$
declare urea uuid;
begin
  select id into urea from input_price_reports_recent(14) where item = 'urea' limit 1;
  perform _refuses(format('select input_price_report_withdraw(%L)', urea), 'التاجر لا يسحب بلاغ المزارع');
  perform _refuses(format('select input_price_report_hide(%L, %L)', urea, 'مضلِّل'), 'ولا يُخفيه');
  perform _eq((select count(*)::int from input_price_reports where item = 'urea'), 0, 'ولا يرى صفّه في الجدول');
end $$;
reset role;

delete from _who; insert into _who values ('a1000000-0000-0000-0000-0000000000a1');
set role authenticated;
do $$
declare urea uuid;
begin
  select id into urea from input_price_reports where item = 'urea';
  perform input_price_report_withdraw(urea);
  perform _eq((select hidden_note from input_price_reports where id = urea), 'سحبه صاحبه', 'المزارع يسحب بلاغه: يُعلَّم «سحبه صاحبه»');
  perform _eq((select count(*)::int from input_price_reports where id = urea), 1, 'ويبقى صفّه');
  perform _eq((select count(*)::int from input_price_reports_recent(14) where id = urea), 0, 'ويختفي من القراءة العامّة');
  perform _refuses(format('select input_price_report_withdraw(%L)', urea), 'وسحبُ المسحوب يُرفض');
  -- وبعد السحب يُصحَّح البلاغ نفسه.
  perform _eq(input_price_report_add('urea', 'sack_50kg', null, 'الجزيرة', 'سوق المعيليق', 305000, 'available', (now() at time zone 'Africa/Khartoum')::date, null) is not null, true,
    'وبعد السحب يُرسل بلاغه مصحَّحاً');
end $$;
reset role;

delete from _who; insert into _who values ('c3000000-0000-0000-0000-0000000000c3');
set role authenticated;
do $$
declare d uuid;
begin
  select id into d from input_price_reports where item = 'diesel';
  perform _refuses(format('select input_price_report_hide(%L, %L)', d, ' '), 'الإخفاء بلا سبب يُرفض');
  perform input_price_report_hide(d, 'سعرٌ مكرَّر من مصدرٍ واحد');
  perform _eq((select hidden_note from input_price_reports where id = d), 'سعرٌ مكرَّر من مصدرٍ واحد', 'والمشرف يُخفي بسببٍ مكتوب');
  -- ثلاثةٌ من المزارع، وعشرون من التاجر، وبلاغُ اليوريا المصحَّح.
  perform _eq((select count(*)::int from input_price_reports), 24, 'ولا يُحذف شيء: كلّ الصفوف باقية');
  perform _eq((select count(*)::int from input_price_reports_recent(14)), 22, 'والظاهرُ ما لم يُسحب أو يُخفَ');
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
