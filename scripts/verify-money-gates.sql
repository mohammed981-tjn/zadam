-- بوّابةُ الكتابة المباشرة على الاستثمار والفرصة وسجلّ المنفّذ.

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

create or replace function _act_as(p uuid) returns void
language plpgsql as $$ begin update _who set uid = p; end $$;

create or replace function _eq(got anyelement, want anyelement, label text) returns void
language plpgsql as $$
begin
  if got is not distinct from want then perform _pass(label || ' — ' || coalesce(got::text, 'null'));
  else perform _fail(label, 'جاء ' || coalesce(got::text, 'null') || ' والمتوقَّع ' || coalesce(want::text, 'null'));
  end if;
end $$;

create or replace function _refuses(q text, label text) returns void
language plpgsql as $$
begin
  execute q;
  perform _fail(label, 'نُفِّذ ولم يُرفض');
exception when others then
  if sqlerrm ~* 'permission denied|row-level security' then
    perform _fail(label, 'رُفض بالصلاحيّة لا بالزناد: ' || sqlerrm);
  else
    perform _pass(label || ' — ' || left(sqlerrm, 70));
  end if;
end $$;

create or replace function _works(q text, label text, want_rows integer default null) returns void
language plpgsql as $$
declare n integer;
begin
  execute q;
  get diagnostics n = row_count;
  if want_rows is not null and n <> want_rows then
    perform _fail(label, 'غيّر ' || n || ' صفّاً والمتوقَّع ' || want_rows);
  else
    perform _pass(label);
  end if;
exception when others then
  perform _fail(label, 'رُفض والمفروض أن يعمل: ' || sqlerrm);
end $$;

-- ── الناس والأشياء ────────────────────────────────────────────────────────
insert into auth.users (id) values
  ('ad000000-0000-0000-0000-0000000000ad'), ('1b000000-0000-0000-0000-0000000000a1'),
  ('fa000000-0000-0000-0000-0000000000fa') on conflict do nothing;
insert into profiles (id, full_name, role) values
  ('ad000000-0000-0000-0000-0000000000ad', 'الإدارة',  'admin'),
  ('1b000000-0000-0000-0000-0000000000a1', 'المستثمر', 'investor'),
  ('fa000000-0000-0000-0000-0000000000fa', 'المزارع',  'investor');

insert into projects (id, slug, name, location, total_feddans, price_per_share, total_shares, status, review_status, is_demo) values
  ('90000000-0000-0000-0000-000000000001', 'open-real',  'مفتوحة', 'الجزيرة', 50, 100, 10, 'open',  'approved', false),
  ('90000000-0000-0000-0000-000000000002', 'open-demo',  'تجريبيّة', 'الجزيرة', 50, 100, 10, 'open',  'approved', true),
  ('90000000-0000-0000-0000-000000000003', 'draft-real', 'مسوّدة', 'الجزيرة', 50, 100, 10, 'draft', 'approved', false);

-- المشغّل الذي يعيد حساب سجلّ المنفّذ يوم يُقفل موسم (في الإنتاج يمدّه `seasons_operator_record`).
create trigger seasons_operator_record after update on public.seasons
  for each row execute function public.refresh_operator_record();
insert into seasons (id, owner_id, name, crop_key, station_key, irrigation, feddans, planting_date) values
  ('5e000000-0000-0000-0000-000000000001', 'fa000000-0000-0000-0000-0000000000fa', 'موسم', 'sesame', 'wad_medani', 'canal', 5, date '2026-06-01');

grant usage on schema public, auth to anon, authenticated;
grant select, insert, update, delete on all tables in schema public to anon, authenticated;
revoke all on public.platform_flags from anon, authenticated;
grant select on public.platform_flags to anon, authenticated;
grant usage, select on all sequences in schema public to anon, authenticated;
grant execute on all functions in schema public, auth to anon, authenticated;

\echo ''
\echo '=========================================================================='
\echo 'أ) الاستثمار: لا طلبَ إلا حيث يحقّ'
\echo '=========================================================================='

do $$ begin perform _act_as('1b000000-0000-0000-0000-0000000000a1'); end $$;
set role authenticated;

do $$
begin
  perform _refuses($q$insert into investments (project_id, investor_id, shares, amount, status)
    values ('90000000-0000-0000-0000-000000000001', '1b000000-0000-0000-0000-0000000000a1', 1, 100, 'pending')$q$,
    'والمفتاح مغلق: لا طلبَ استثمارٍ مباشراً (كان التجاوزُ بإدراجٍ من المتصفّح)');
  perform _eq((select enabled from platform_flags where key = 'investment_live'), false,
    'والمفتاح مغلقٌ كما كان الثابتُ في الكود');
end $$;

reset role;
update platform_flags set enabled = true where key = 'investment_live';
set role authenticated;

do $$
begin
  perform _refuses($q$insert into investments (project_id, investor_id, shares, amount, status)
    values ('90000000-0000-0000-0000-000000000002', '1b000000-0000-0000-0000-0000000000a1', 1, 100, 'pending')$q$,
    'ومفتوحاً: لا طلبَ على مشروعٍ تجريبيّ');
  perform _refuses($q$insert into investments (project_id, investor_id, shares, amount, status)
    values ('90000000-0000-0000-0000-000000000003', '1b000000-0000-0000-0000-0000000000a1', 1, 100, 'pending')$q$,
    'ولا على مسوّدة');
  perform _refuses($q$insert into investments (project_id, investor_id, shares, amount, status)
    values ('90000000-0000-0000-0000-000000000001', '1b000000-0000-0000-0000-0000000000a1', 11, 1100, 'pending')$q$,
    'ولا بحصصٍ أكثر من المتبقّي');
  perform _refuses($q$insert into investments (project_id, investor_id, shares, amount, status)
    values ('90000000-0000-0000-0000-000000000001', '1b000000-0000-0000-0000-0000000000a1', 0, 0, 'pending')$q$,
    'ولا بحصّةٍ صفر');
  perform _refuses($q$insert into investments (project_id, investor_id, shares, amount, status)
    values ('90000000-0000-0000-0000-000000000001', '1b000000-0000-0000-0000-0000000000a1', 2, 100, 'pending')$q$,
    'ولا بمبلغٍ غير سعر الحصّة (حصّتان بمئة)');
  perform _works($q$insert into investments (project_id, investor_id, shares, amount, status)
    values ('90000000-0000-0000-0000-000000000001', '1b000000-0000-0000-0000-0000000000a1', 2, 200, 'pending')$q$,
    'ويُقبل طلبٌ صحيح كما يرسله التطبيق: حصّتان بمئتين على فرصةٍ مفتوحة', 1);
end $$;

reset role;
do $$ begin perform _act_as('ad000000-0000-0000-0000-0000000000ad'); end $$;
set role authenticated;

\echo ''
\echo '=========================================================================='
\echo 'ب) التأكيد: بدالّته وحدها'
\echo '=========================================================================='

do $$
declare inv uuid; demo_inv uuid; r text;
begin
  select id into inv from investments where project_id = '90000000-0000-0000-0000-000000000001';
  perform _refuses(format($q$update investments set status = 'confirmed' where id = %L$q$, inv),
    'لا يؤكّد المدير استثماراً بتحديثٍ مباشر خارج الدالّة');
  perform _refuses(format($q$update investments set shares = 9 where id = %L$q$, inv),
    'ولا يُعدَّل طلبٌ بعد رفعه، ولا من المدير');

  r := confirm_investment(inv);
  perform _eq(r, 'confirmed', 'والدالّة تؤكّد الطلب الصحيح');
  perform _eq((select shares_sold from projects where id = '90000000-0000-0000-0000-000000000001'), 2,
    'وتزيد المباع بحصّتين');
  perform _eq((select status::text from investments where id = inv), 'confirmed', 'ويصير الطلب مؤكَّداً');
end $$;

reset role;
insert into investments (id, project_id, investor_id, shares, amount, status) values
  ('1e000000-0000-0000-0000-00000000000d', '90000000-0000-0000-0000-000000000002', '1b000000-0000-0000-0000-0000000000a1', 1, 100, 'pending'),
  ('1e000000-0000-0000-0000-00000000000e', '90000000-0000-0000-0000-000000000003', '1b000000-0000-0000-0000-0000000000a1', 1, 100, 'pending');
do $$ begin perform _act_as('ad000000-0000-0000-0000-0000000000ad'); end $$;
set role authenticated;

do $$
begin
  perform _eq(confirm_investment('1e000000-0000-0000-0000-00000000000d'), 'not_open',
    'ولا تؤكّد الدالّةُ طلباً على مشروعٍ تجريبيّ');
  perform _eq(confirm_investment('1e000000-0000-0000-0000-00000000000e'), 'not_open',
    'ولا على مسوّدة');
  perform _eq((select count(*)::int from investment_events where outcome = 'not_open'), 2,
    'والرفضان مسجَّلان في سجلّ التدقيق');
  perform _eq((select shares_sold from projects where id = '90000000-0000-0000-0000-000000000002'), 0,
    'ولم يتغيّر مباعُ التجريبيّ');
  perform _works($q$update investments set status = 'cancelled' where id = '1e000000-0000-0000-0000-00000000000d'$q$,
    'والإلغاء المباشر مباحٌ للمدير: ما يُمنع هو التأكيد وحده', 1);
end $$;

reset role;
do $$ begin perform _act_as('fa000000-0000-0000-0000-0000000000fa'); end $$;
set role authenticated;

\echo ''
\echo '=========================================================================='
\echo 'ج) الفرصة: المباع والعائد والمخاطرة لا يكتبها الرافع'
\echo '=========================================================================='

do $$
begin
  perform _refuses($q$insert into projects (slug, name, location, total_feddans, price_per_share, total_shares, shares_sold,
      status, review_status, is_demo, submitted_by)
    values ('x1', 'فرصة', 'الجزيرة', 10, 100, 10, 5, 'draft', 'submitted', false, 'fa000000-0000-0000-0000-0000000000fa')$q$,
    'لا يرفع المزارع فرصةً «مباعاً» منها خمس حصص');
  perform _refuses($q$insert into projects (slug, name, location, total_feddans, price_per_share, total_shares, expected_annual_return,
      status, review_status, is_demo, submitted_by)
    values ('x2', 'فرصة', 'الجزيرة', 10, 100, 10, 0.4, 'draft', 'submitted', false, 'fa000000-0000-0000-0000-0000000000fa')$q$,
    'ولا بعائدٍ متوقَّعٍ يكتبه هو');
  perform _works($q$insert into projects (slug, name, location, total_feddans, price_per_share, total_shares, shares_sold,
      status, review_status, is_demo, submitted_by, risk_level)
    values ('x3', 'فرصة', 'الجزيرة', 10, 100, 10, 0, 'draft', 'submitted', false, 'fa000000-0000-0000-0000-0000000000fa', 'medium')$q$,
    'ويُرفع طلبُ الفرصة الصحيح كما يفعل التطبيق', 1);
  perform _refuses($q$update projects set risk_level = 'low' where slug = 'x3'$q$,
    'ولا يغيّر مخاطرتها بعد الرفع');
  perform _refuses($q$update projects set expected_annual_return = 0.5 where slug = 'x3'$q$,
    'ولا يكتب عائدها بعد الرفع');
  perform _works($q$update projects set description = 'وصفٌ جديد' where slug = 'x3'$q$,
    'ويعدّل وصفها وهي قيد المراجعة', 1);
end $$;

reset role;
do $$ begin perform _act_as('ad000000-0000-0000-0000-0000000000ad'); end $$;
set role authenticated;
do $$
begin
  perform _works($q$update projects set expected_annual_return = 0.3, risk_level = 'low' where slug = 'x3'$q$,
    'والإدارة تكتب العائد والمخاطرة', 1);
end $$;
reset role;
do $$ begin perform _act_as('fa000000-0000-0000-0000-0000000000fa'); end $$;
set role authenticated;

\echo ''
\echo '=========================================================================='
\echo 'د) سجلّ المنفّذ: تحسبه المنصّة من مواسمه المُقفلة'
\echo '=========================================================================='

do $$
begin
  perform _works($q$update profiles set full_name = 'اسمٌ جديد', completed_seasons = 99, reporting_rate = 1
     where id = 'fa000000-0000-0000-0000-0000000000fa'$q$,
    'يحدّث المزارع ملفّه (الاسم) ولو أرسل معه سجلّاً مكتوباً', 1);
  perform _eq((select full_name from profiles where id = 'fa000000-0000-0000-0000-0000000000fa'), 'اسمٌ جديد',
    'فيتغيّر الاسم');
  perform _eq((select completed_seasons::int from profiles where id = 'fa000000-0000-0000-0000-0000000000fa'), 0,
    'ويبقى سجلّه صفراً: لا يكتب «٩٩ موسماً» لنفسه');
  perform _eq((select reporting_rate from profiles where id = 'fa000000-0000-0000-0000-0000000000fa'), 0::numeric,
    'ونسبة التزامه');
  perform _works($q$update seasons set status = 'completed' where id = '5e000000-0000-0000-0000-000000000001'$q$,
    'ويُقفل موسمَه كما يفعل التطبيق', 1);
  perform _eq((select completed_seasons::int from profiles where id = 'fa000000-0000-0000-0000-0000000000fa'), 1,
    'فتحسب المنصّةُ سجلّه: موسمٌ واحد');
end $$;

reset role;

\echo ''
\echo '=========================================================================='

do $$
declare n integer;
begin
  select fails into n from _score;
  if n > 0 then raise exception 'فشل % فحصاً.', n; end if;
  raise notice 'ALL CHECKS PASSED — المال والفرصة وسجلّ المنفّذ لا تُكتب من المتصفّح';
end $$;
