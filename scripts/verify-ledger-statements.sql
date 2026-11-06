-- بوّابةُ القوائم الماليّة الكاملة (البند ٢٠٥؛ الهجرة 20261106080000_ledger_statements_plus.sql).
-- على السلسلة الكاملة وبالهويّة كما يضعها PostgREST: الفترة المقابلة (شهر، سنة، موسم)، وأعمدة المقارنة على دفترٍ مزروع،
-- وأعمار الذمم ببنودها وسدادها ومن الأقدم، والميزانيّة مقابل الفعليّ لكلّ مرحلة، وقائمة الملكيّة تُقفل على ميزانيّة
-- يومها، والإيضاحات، والغريب والزائر والمدير في غير فحصٍ يُرفضون.

\set ON_ERROR_STOP on
\set QUIET on
set client_min_messages = notice;
\o /dev/null

create table _score (fails integer not null default 0, passes integer not null default 0);
insert into _score values (0, 0);
grant all on _score to authenticated, anon;

create function _fail(label text, why text) returns void language plpgsql as $$
begin raise notice '  FAIL  % — %', label, why; update _score set fails = fails + 1; end $$;
create function _pass(label text) returns void language plpgsql as $$
begin raise notice '  PASS  %', label; update _score set passes = passes + 1; end $$;
create function _eq(got anyelement, want anyelement, label text) returns void language plpgsql as $$
begin
  if got is not distinct from want then perform _pass(label || ' — ' || coalesce(got::text, 'null'));
  else perform _fail(label, 'جاء ' || coalesce(got::text, 'null') || ' والمتوقَّع ' || coalesce(want::text, 'null')); end if;
end $$;
/* يُرفض بخطأ؛ وإن أُعطي جزءٌ من الرسالة فبها، لا بخطأٍ آخر. */
create function _refuses(stmt text, label text, want text default null) returns void language plpgsql as $$
begin
  begin execute stmt;
  exception when others then
    if want is null or position(want in sqlerrm) > 0 then perform _pass(label);
    else perform _fail(label, 'رُفض بغير السبب: ' || sqlerrm); end if;
    return;
  end;
  perform _fail(label, 'نُفِّذ وكان يجب أن يُرفض');
end $$;
create function _as(p uuid) returns void language sql as $$
  select set_config('request.jwt.claims',
    case when p is null then '' else json_build_object('sub', p, 'role', 'authenticated', 'aal', 'aal1')::text end, false) $$;
create function _bk(p_owner uuid) returns uuid language sql stable security definer as $$
  select id from ledger_books where owner_id = p_owner and kind = 'farm' $$;
/* المدير بعامله الثاني (البند: الإدارة بعاملين)، كما يدخل فعلاً. */
create function _as_admin(p uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p, 'role', 'authenticated', 'aal', 'aal2')::text, false) $$;
grant execute on function _fail(text, text), _pass(text), _eq(anyelement, anyelement, text), _refuses(text, text, text),
  _as(uuid), _as_admin(uuid), _bk(uuid) to authenticated, anon;

-- ── الناس والمواسم والقيود (بصلاحيّة العنقود) ────────────────────────────────
-- f1 المزارع صاحب الدفتر · e9 غريب · ad مدير لا يفحص هذا الدفتر
insert into auth.users (id) values
  ('f1000000-0000-0000-0000-0000000000f1'), ('e9000000-0000-0000-0000-0000000000e9'),
  ('ad000000-0000-0000-0000-0000000000ad');
insert into profiles (id, full_name, role) values
  ('f1000000-0000-0000-0000-0000000000f1', 'المزارع', 'investor'),
  ('e9000000-0000-0000-0000-0000000000e9', 'غريب', 'investor'),
  ('ad000000-0000-0000-0000-0000000000ad', 'مدير', 'admin')
on conflict (id) do update set role = excluded.role, full_name = excluded.full_name;

insert into seasons (id, owner_id, name, crop_key, station_key, irrigation, feddans, planting_date, harvest_date) values
  ('5a000000-0000-0000-0000-00000000005a', 'f1000000-0000-0000-0000-0000000000f1', 'ذرة ٢٠٢٥', 'sorghum', 'sennar', 'rainfed', 10, '2025-06-01', '2025-11-30'),
  ('5b000000-0000-0000-0000-00000000005b', 'f1000000-0000-0000-0000-0000000000f1', 'ذرة ٢٠٢٦', 'sorghum', 'sennar', 'rainfed', 10, '2026-06-01', null),
  ('5e000000-0000-0000-0000-00000000005e', 'e9000000-0000-0000-0000-0000000000e9', 'موسم الغريب', 'sorghum', 'sennar', 'rainfed', 5, '2026-06-01', null);
insert into season_stages (id, season_id, stage_key, stage_order, planned_start, planned_end, budget) values
  ('57000000-0000-0000-0000-000000000001', '5b000000-0000-0000-0000-00000000005b', 'land_prep', 1, '2026-06-01', '2026-06-20', 300),
  ('57000000-0000-0000-0000-000000000002', '5b000000-0000-0000-0000-00000000005b', 'planting',  2, '2026-06-21', '2026-07-31', 200),
  ('57000000-0000-0000-0000-000000000003', '5b000000-0000-0000-0000-00000000005b', 'harvest',   3, '2026-10-01', '2026-11-30', 0);

-- دفتر الموسم البسيط: كلّ سطرٍ يُرحَّل إلى دفتر المزرعة في معاملته.
insert into ledger_entries (id, season_id, stage_id, category, amount, paid_from, entry_date, created_by) values
  ('e1000000-0000-0000-0000-000000000001', '5a000000-0000-0000-0000-00000000005a', null, 'seeds',      100, 'cash',   '2025-07-10', 'f1000000-0000-0000-0000-0000000000f1'),
  ('e1000000-0000-0000-0000-000000000002', '5a000000-0000-0000-0000-00000000005a', null, 'revenue',    400, 'cash',   '2025-09-15', 'f1000000-0000-0000-0000-0000000000f1'),
  ('e1000000-0000-0000-0000-000000000003', '5b000000-0000-0000-0000-00000000005b', '57000000-0000-0000-0000-000000000001', 'seeds', 150, 'cash', '2026-07-05', 'f1000000-0000-0000-0000-0000000000f1'),
  ('e1000000-0000-0000-0000-000000000004', '5b000000-0000-0000-0000-00000000005b', '57000000-0000-0000-0000-000000000002', 'labour', 80, 'credit', '2026-07-20', 'f1000000-0000-0000-0000-0000000000f1'),
  ('e1000000-0000-0000-0000-000000000005', '5b000000-0000-0000-0000-00000000005b', null, 'revenue',    300, 'credit', '2026-08-01', 'f1000000-0000-0000-0000-0000000000f1'),
  ('e1000000-0000-0000-0000-000000000006', '5b000000-0000-0000-0000-00000000005b', null, 'fertiliser',  60, 'credit', '2026-09-01', 'f1000000-0000-0000-0000-0000000000f1'),
  ('e1000000-0000-0000-0000-000000000007', '5b000000-0000-0000-0000-00000000005b', null, 'revenue',    120, 'credit', '2026-10-20', 'f1000000-0000-0000-0000-0000000000f1'),
  ('e1000000-0000-0000-0000-000000000008', '5b000000-0000-0000-0000-00000000005b', '57000000-0000-0000-0000-000000000001', 'seeds', 40, 'credit', ledger_today(), 'f1000000-0000-0000-0000-0000000000f1');
-- A row written today then deleted: its posting is reversed the same day and must count nowhere.
delete from ledger_entries where id = 'e1000000-0000-0000-0000-000000000008';
-- The stranger's own row, so that he has a book of his own.
insert into ledger_entries (season_id, category, amount, paid_from, entry_date, created_by) values
  ('5e000000-0000-0000-0000-00000000005e', 'seeds', 10, 'cash', '2026-07-01', 'e9000000-0000-0000-0000-0000000000e9');

-- Straight to the engine: capital, more capital, a drawing, a sale on credit by hand and a receipt not tied to it.
select ledger_post_for(_bk('f1000000-0000-0000-0000-0000000000f1'), '2025-01-05', 'رأس مال',
  '[{"key":"bank","side":"D","currency":"USD","minor":100000},{"key":"owner_capital","side":"C","currency":"USD","minor":100000}]'::jsonb,
  'st-capital-1', null, 'manual', null, null, 'f1000000-0000-0000-0000-0000000000f1');
select ledger_post_for(_bk('f1000000-0000-0000-0000-0000000000f1'), '2026-02-01', 'رأس مال إضافيّ',
  '[{"key":"bank","side":"D","currency":"USD","minor":20000},{"key":"owner_capital","side":"C","currency":"USD","minor":20000}]'::jsonb,
  'st-capital-2', null, 'manual', null, null, 'f1000000-0000-0000-0000-0000000000f1');
select ledger_post_for(_bk('f1000000-0000-0000-0000-0000000000f1'), '2026-03-01', 'سحب',
  '[{"key":"owner_drawings","side":"D","currency":"USD","minor":5000},{"key":"cash_on_hand","side":"C","currency":"USD","minor":5000}]'::jsonb,
  'st-draw-1', null, 'manual', null, null, 'f1000000-0000-0000-0000-0000000000f1');
select ledger_post_for(_bk('f1000000-0000-0000-0000-0000000000f1'), '2026-04-01', 'تصحيحٌ في الأرباح المحتجزة',
  '[{"key":"retained_earnings","side":"D","currency":"USD","minor":1000},{"key":"cash_on_hand","side":"C","currency":"USD","minor":1000}]'::jsonb,
  'st-retained', null, 'manual', null, null, 'f1000000-0000-0000-0000-0000000000f1');
select ledger_post_for(_bk('f1000000-0000-0000-0000-0000000000f1'), '2026-05-01', 'بيعٌ آجل باليد',
  '[{"key":"receivable_buyers","side":"D","currency":"USD","minor":5000},{"key":"sales_crops","side":"C","currency":"USD","minor":5000}]'::jsonb,
  'st-ar-manual', null, 'manual', null, null, 'f1000000-0000-0000-0000-0000000000f1');
select ledger_post_for(_bk('f1000000-0000-0000-0000-0000000000f1'), '2026-10-01', 'قبضٌ غير مربوط',
  '[{"key":"cash_on_hand","side":"D","currency":"USD","minor":3000},{"key":"receivable_buyers","side":"C","currency":"USD","minor":3000}]'::jsonb,
  'st-ar-receipt', null, 'manual', null, null, 'f1000000-0000-0000-0000-0000000000f1');

-- «سدّدتُ» العمالة الآجلة يوم ١٠ سبتمبر، بيد صاحبها.
set role authenticated;
select _as('f1000000-0000-0000-0000-0000000000f1');
select farm_settle_entry('e1000000-0000-0000-0000-000000000004', 'cash', '2026-09-10');
reset role;
select _as(null);

-- What a statement must agree with, read at the cluster's own rights.
create function _is(p_from date, p_to date, p_key text, p_season uuid default null) returns bigint language sql stable as $$
  select coalesce(sum(amount), 0)::bigint from ledger_income_statement(_bk('f1000000-0000-0000-0000-0000000000f1'), p_from, p_to, p_season)
   where system_key = p_key $$;
create function _ni(p_to date) returns bigint language sql stable as $$
  select coalesce(sum(case when type = 'revenue' then amount else -amount end), 0)::bigint
    from ledger_income_statement(_bk('f1000000-0000-0000-0000-0000000000f1'), null, p_to, null) $$;
create function _bs(p_as_of date, p_key text) returns bigint language sql stable as $$
  select coalesce(sum(balance), 0)::bigint from ledger_balance_sheet(_bk('f1000000-0000-0000-0000-0000000000f1'), p_as_of)
   where system_key = p_key $$;
create function _bs_type(p_as_of date, p_type text) returns bigint language sql stable as $$
  select coalesce(sum(balance), 0)::bigint from ledger_balance_sheet(_bk('f1000000-0000-0000-0000-0000000000f1'), p_as_of)
   where type = p_type $$;
grant execute on function _is(date, date, text, uuid), _ni(date), _bs(date, text), _bs_type(date, text) to authenticated;

\o
\echo 'أ) الفترة المقابلة: الشهر والسنة والموسم'
\o /dev/null
set role authenticated;
select _as('f1000000-0000-0000-0000-0000000000f1');
do $$ declare b uuid := _bk('f1000000-0000-0000-0000-0000000000f1'); r record; begin
  select * into r from ledger_compare_period(b, 'month', '2026-10-01', '2026-10-31');
  perform _eq(r.prev_from || '..' || r.prev_to, '2026-09-01..2026-09-30', 'أكتوبر يقابله سبتمبر كاملاً (آخر الشهر بآخر الشهر)');
  select * into r from ledger_compare_period(b, 'month', '2026-09-01', '2026-09-30');
  perform _eq(r.prev_from || '..' || r.prev_to, '2026-08-01..2026-08-31', 'وسبتمبر (٣٠ يوماً) يقابله أغسطس كاملاً بيومه الحادي والثلاثين');
  select * into r from ledger_compare_period(b, 'year', '2029-01-01', '2029-02-28');
  perform _eq(r.prev_to, '2028-02-29'::date, 'وآخر فبراير ٢٠٢٩ يقابله آخر فبراير ٢٠٢٨ (٢٩)');
  select * into r from ledger_compare_period(b, 'month', '2026-03-15', '2026-03-20');
  perform _eq(r.prev_from || '..' || r.prev_to, '2026-02-15..2026-02-20', 'وأيّامٌ من مارس تقابلها الأيّام نفسها من فبراير');
  select * into r from ledger_compare_period(b, 'year', '2026-01-01', '2026-10-31');
  perform _eq(r.prev_from || '..' || r.prev_to, '2025-01-01..2025-10-31', 'السنة حتى ٣١ أكتوبر تقابلها السابقة حتى ٣١ أكتوبر');
  select * into r from ledger_compare_period(b, 'year', '2028-01-01', '2028-02-29');
  perform _eq(r.prev_to, '2027-02-28'::date, 'و٢٩ فبراير يقابله ٢٨ فبراير');
  select * into r from ledger_compare_period(b, 'season', null, null, '5b000000-0000-0000-0000-00000000005b');
  perform _eq(r.prev_season, '5a000000-0000-0000-0000-00000000005a'::uuid, 'الموسم يقابله الموسم الذي زُرع قبله');
  perform _eq(r.cur_from || '..' || (r.cur_to = ledger_today()), '2026-06-01..true', 'من يوم زراعته إلى اليوم (لم يُحصد بعد)');
  perform _eq(r.prev_from || '..' || r.prev_to, '2025-06-01..2025-11-30', 'والسابق من زراعته إلى حصاده');
  perform _eq(r.prev_season_name, 'ذرة ٢٠٢٥', 'باسمه');
  select * into r from ledger_compare_period(b, 'season', null, null, '5a000000-0000-0000-0000-00000000005a');
  perform _eq(r.prev_season, null::uuid, 'وأوّل المواسم بلا مقابل');
  perform _refuses($q$select * from ledger_compare_period(_bk('f1000000-0000-0000-0000-0000000000f1'), 'season', null, null,
                     '5e000000-0000-0000-0000-00000000005e')$q$, 'وموسم غيره لا يُقارَن به', 'هذا الموسم ليس من هذا الدفتر');
  perform _refuses($q$select * from ledger_compare_period(_bk('f1000000-0000-0000-0000-0000000000f1'), 'week', '2026-01-01', '2026-01-07')$q$,
                   'وأساسٌ غير معروف يُرفض', 'أساس المقارنة غير معروف');
  perform _refuses($q$select * from ledger_compare_period(_bk('f1000000-0000-0000-0000-0000000000f1'), 'month', '2026-02-01', '2026-01-01')$q$,
                   'وفترةٌ مقلوبة تُرفض', 'بداية الفترة بعد نهايتها');
end $$;

\o
\echo 'ب) قائمة الدخل المقارنة: هذه السنة والسابقة'
\o /dev/null
do $$ declare b uuid := _bk('f1000000-0000-0000-0000-0000000000f1'); r record; begin
  select * into r from ledger_income_compare(b, '2026-01-01', '2026-10-31', '2025-01-01', '2025-10-31') where system_key = 'sales_crops';
  perform _eq(r.current_minor, 47000::bigint, 'المبيعات هذه السنة ٤٧٠$ (٣٠٠ + ١٢٠ آجلاً + ٥٠ باليد)');
  perform _eq(r.previous_minor, 40000::bigint, 'والسنة السابقة ٤٠٠$');
  perform _eq(r.change_minor, 7000::bigint, 'والتغيّر ٧٠$');
  perform _eq(r.change_pct, 17.5::numeric, 'و١٧٫٥٪');
  select * into r from ledger_income_compare(b, '2026-01-01', '2026-10-31', '2025-01-01', '2025-10-31') where system_key = 'cost_seeds';
  perform _eq(r.current_minor || '/' || r.previous_minor || '/' || r.change_pct, '15000/10000/50.0',
              'البذور ١٥٠$ مقابل ١٠٠$: +٥٠٪ — والبذور المحذوفة لا تُعدّ');
  perform _eq((select count(*)::integer from ledger_income_compare(b, '2026-01-01', '2026-10-31', '2025-01-01', '2025-10-31')
                where current_minor is distinct from _is('2026-01-01', '2026-10-31', system_key)
                   or previous_minor is distinct from _is('2025-01-01', '2025-10-31', system_key)),
              0, 'وكلّ سطرٍ في العمودين = قائمة الدخل القائمة لفترته');
  select * into r from ledger_income_compare(b, '2026-01-01', '2026-10-31') where system_key = 'sales_crops';
  perform _eq(r.previous_minor is null and r.change_minor is null and r.change_pct is null, true,
              'وبلا فترةٍ سابقة: العمود فارغ لا صفر');
  select * into r from ledger_income_compare(b, null, null, null, null,
                    '5b000000-0000-0000-0000-00000000005b', '5a000000-0000-0000-0000-00000000005a') where system_key = 'sales_crops';
  perform _eq(r.current_minor || '/' || r.previous_minor, '42000/40000', 'وبالموسم: ٤٢٠$ مقابل ٤٠٠$ (البيع باليد بلا موسم)');
  select * into r from ledger_income_compare(b, '2026-01-01', '2026-10-31', '2025-01-01', '2025-10-31') where system_key = 'cost_labour';
  perform _eq(r.previous_minor || '/' || coalesce(r.change_pct::text, 'null'), '0/null', 'وما لم يكن في السابقة صفرٌ بلا نسبة');
end $$;

\o
\echo 'ج) الميزانيّة المقارنة: ٣١ أكتوبر من السنتين'
\o /dev/null
do $$ declare b uuid := _bk('f1000000-0000-0000-0000-0000000000f1'); r record; begin
  select * into r from ledger_balance_compare(b, '2026-10-31', '2025-10-31') where system_key = 'receivable_buyers';
  perform _eq(r.current_minor || '/' || r.previous_minor, '44000/0', 'المشترون ٤٤٠$ (٣٠٠ + ١٢٠ + ٥٠ − ٣٠) مقابل صفر');
  perform _eq((select count(*)::integer from ledger_balance_compare(b, '2026-10-31', '2025-10-31')
                where system_key not like '\_%' and (current_minor is distinct from _bs('2026-10-31', system_key)
                                                     or previous_minor is distinct from _bs('2025-10-31', system_key))),
              0, 'وكلّ حسابٍ في العمودين = الميزانيّة القائمة ليومه');
  select * into r from ledger_balance_compare(b, '2026-10-31', '2025-10-31') where system_key = '_income_prior';
  perform _eq(r.current_minor || '/' || r.previous_minor, _ni('2025-12-31') || '/' || _ni('2024-12-31'),
              'وأرباح السنوات السابقة لكلّ عمودٍ بسنته');
  perform _eq((select sum(current_minor) filter (where type = 'asset')
                    = sum(current_minor) filter (where type in ('liability', 'equity'))
                  and sum(previous_minor) filter (where type = 'asset')
                    = sum(previous_minor) filter (where type in ('liability', 'equity'))
                 from ledger_balance_compare(b, '2026-10-31', '2025-10-31')),
              true, 'والعمودان متوازنان: الأصول = الالتزامات + الملكيّة بربحها');
end $$;

\o
\echo 'د) التدفّقات النقديّة المقارنة'
\o /dev/null
do $$ declare b uuid := _bk('f1000000-0000-0000-0000-0000000000f1'); o record; c record; s1 bigint; s0 bigint; begin
  select * into o from ledger_cash_flow_compare(b, '2026-01-01', '2026-10-31', '2025-01-01', '2025-10-31') where code = '_opening';
  select * into c from ledger_cash_flow_compare(b, '2026-01-01', '2026-10-31', '2025-01-01', '2025-10-31') where code = '_closing';
  select sum(current_minor), sum(previous_minor) into s1, s0
    from ledger_cash_flow_compare(b, '2026-01-01', '2026-10-31', '2025-01-01', '2025-10-31') where section <> 'cash';
  perform _eq(o.current_minor + s1 = c.current_minor, true, 'هذه السنة: نقد أوّلها + الحركة = نقد آخرها');
  perform _eq(o.previous_minor + s0 = c.previous_minor, true, 'والسابقة كذلك');
  perform _eq(c.current_minor, _bs('2026-10-31', 'cash_on_hand') + _bs('2026-10-31', 'bank') + _bs('2026-10-31', 'wallet'),
              'ونقد آخرها = النقد في الميزانيّة');
  perform _eq(o.previous_minor, 0::bigint, 'وأوّل ٢٠٢٥ لا نقد');
  perform _eq((select current_minor from ledger_cash_flow_compare(b, '2026-01-01', '2026-10-31', '2025-01-01', '2025-10-31')
                where section = 'financing' and code = '3130'), -5000::bigint, 'والسحب ٥٠$ خارجٌ في التمويليّة');
end $$;

\o
\echo 'هـ) قائمة التغيّر في حقوق الملكيّة تُقفل على الميزانيّة'
\o /dev/null
do $$ declare b uuid := _bk('f1000000-0000-0000-0000-0000000000f1'); begin
  perform _eq((select string_agg(line || '=' || amount, ' ' order by ord) from ledger_equity_statement(b, '2026-01-01', '2026-10-31')),
              'opening=' || (100000 + _ni('2025-12-31')) || ' contributions=20000 drawings=-5000 profit='
                || (_ni('2026-10-31') - _ni('2025-12-31')) || ' other=-1000 closing='
                || (100000 + _ni('2025-12-31') + 20000 - 5000 + _ni('2026-10-31') - _ni('2025-12-31') - 1000),
              'أوّلها رأس المال وربح ٢٠٢٥، وساهم ٢٠٠$، وسحب ٥٠$، وربح السنة، وتصحيح ١٠$ في المحتجزة');
  perform _eq((select amount from ledger_equity_statement(b, '2026-01-01', '2026-10-31') where line = 'closing'),
              _bs_type('2026-10-31', 'equity') + _ni('2026-10-31'), 'وآخرها = ملكيّة الميزانيّة يوم ٣١ أكتوبر بربحها، تماماً');
  perform _eq((select amount from ledger_equity_statement(b, '2026-01-01', '2026-10-31') where line = 'closing'),
              (select sum(current_minor)::bigint from ledger_balance_compare(b, '2026-10-31') where type = 'equity'),
              'وهو سطر الملكيّة في الميزانيّة المقارنة نفسها');
  perform _eq((select amount from ledger_equity_statement(b, '2025-01-01', '2025-12-31') where line = 'closing'),
              (select amount from ledger_equity_statement(b, '2026-01-01', '2026-10-31') where line = 'opening'),
              'وآخر ٢٠٢٥ هو أوّل ٢٠٢٦');
end $$;

\o
\echo 'و) أعمار الذمم: البند وسداده، ومن الأقدم'
\o /dev/null
do $$ declare b uuid := _bk('f1000000-0000-0000-0000-0000000000f1'); begin
  perform _eq((select string_agg(bucket || ':' || items || ':' || amount_minor, ' ' order by bucket)
                 from ledger_ageing(b, '2026-11-06') where side = 'receivable'),
              '0_30:1:12000 90_plus:2:32000',
              'المشترون: ١٢٠$ عمرها ١٧ يوماً، و٣٠٠$ + ٢٠$ باقية من البيع باليد بعد قبض ٣٠$ من الأقدم');
  perform _eq((select string_agg(bucket || ':' || items || ':' || amount_minor, ' ' order by bucket)
                 from ledger_ageing(b, '2026-11-06') where side = 'payable'),
              '61_90:1:6000', 'الموردون: السماد ٦٠$ وحده؛ العمالة سُدِّدت، والبذور المحذوفة لا تُعدّ');
  perform _eq((select string_agg(bucket || ':' || items || ':' || amount_minor, ' ' order by bucket)
                 from ledger_ageing(b, '2026-09-05') where side = 'payable'),
              '0_30:1:6000 31_60:1:8000', 'ويوم ٥ سبتمبر (قبل السداد): العمالة ٨٠$ عمرها ٤٧ يوماً، والسماد ٤ أيّام');
  perform _eq((select sum(amount_minor)::bigint from ledger_ageing(b, '2026-11-06') where code = '1210'),
              _bs('2026-11-06', 'receivable_buyers'), 'ومجموع الأعمار = رصيد المشترين في الميزانيّة');
  perform _eq((select sum(amount_minor)::bigint from ledger_ageing(b, '2026-09-05') where code = '2110'),
              _bs('2026-09-05', 'payables_suppliers'), 'و= رصيد الموردين يومها');
  perform _eq((select count(*)::integer from ledger_ageing(b, '2025-12-31')), 0, 'وفي آخر ٢٠٢٥ لا ذمم');
  perform _eq((select sum(amount_minor)::bigint from ledger_ageing(b) where side = 'payable'), 6000::bigint,
              'واليوم: الآجل المحذوف اليوم لا يظهر، والسماد وحده');
end $$;

\o
\echo 'ز) الميزانيّة التقديريّة مقابل الفعليّ'
\o /dev/null
do $$ declare b uuid := _bk('f1000000-0000-0000-0000-0000000000f1'); begin
  perform _eq((select string_agg(coalesce(stage_key, 'none') || ':' || budget_minor || ':' || actual_minor || ':' || variance_minor
                                 || ':' || coalesce(used_pct::text, '-'), ' ' order by stage_order)
                 from ledger_budget_vs_actual(b, '5b000000-0000-0000-0000-00000000005b')),
              'land_prep:30000:15000:15000:50.0 planting:20000:8000:12000:40.0 harvest:0:0:0:- none:0:6000:-6000:-',
              'لكلّ مرحلة خطّتها وما صُرف فيها، والسماد بلا مرحلة سطرٌ وحده، والمحذوف لا يُعدّ');
  perform _eq((select count(distinct season_id)::integer from ledger_budget_vs_actual(b)), 2, 'وبلا موسمٍ: كلّ مواسم صاحب الدفتر');
  perform _eq((select sum(actual_minor)::bigint from ledger_budget_vs_actual(b, '5a000000-0000-0000-0000-00000000005a')), 10000::bigint,
              'وموسم ٢٠٢٥ بلا مراحل: البذور ١٠٠$ في سطر «بلا مرحلة»');
end $$;

\o
\echo 'ح) ما تُكتب منه الإيضاحات'
\o /dev/null
do $$ declare b uuid := _bk('f1000000-0000-0000-0000-0000000000f1'); f jsonb; begin
  f := ledger_statement_facts(b, '2026-01-01', '2026-10-31');
  perform _eq(f->>'owner_name', 'المزارع', 'اسم صاحب الدفتر');
  perform _eq(f->>'kind', 'farm', 'ونوعه');
  perform _eq((f->>'open_credit_rows')::integer, 3, 'وثلاثة قيود آجلة لم تُسدَّد (والمسدَّد والمحذوف لا)');
  perform _eq((f->'currencies'->0->>'currency'), 'USD', 'والعملة الدولار');
  perform _eq((f->>'manual')::integer, 5, 'وخمسة قيودٍ باليد في الفترة');
  perform _eq((f->'fixed_assets'->>'count')::integer, 0, 'ولا أصول ثابتة');
end $$;
reset role;
select _as(null);

\o
\echo 'ط) الغريب والزائر والمدير في غير فحصٍ يُرفضون'
\o /dev/null
set role authenticated;
select _as('e9000000-0000-0000-0000-0000000000e9');
do $$ begin
  perform _refuses($q$select * from ledger_compare_period(_bk('f1000000-0000-0000-0000-0000000000f1'), 'year', '2026-01-01', '2026-10-31')$q$,
                   'الغريب لا يقرأ الفترة', 'ليس هذا دفترك');
  perform _refuses($q$select * from ledger_income_compare(_bk('f1000000-0000-0000-0000-0000000000f1'), '2026-01-01', '2026-10-31')$q$,
                   'ولا قائمة الدخل', 'ليس هذا دفترك');
  perform _refuses($q$select * from ledger_balance_compare(_bk('f1000000-0000-0000-0000-0000000000f1'), '2026-10-31')$q$,
                   'ولا الميزانيّة', 'ليس هذا دفترك');
  perform _refuses($q$select * from ledger_cash_flow_compare(_bk('f1000000-0000-0000-0000-0000000000f1'), '2026-01-01', '2026-10-31')$q$,
                   'ولا التدفّقات', 'ليس هذا دفترك');
  perform _refuses($q$select * from ledger_equity_statement(_bk('f1000000-0000-0000-0000-0000000000f1'), '2026-01-01', '2026-10-31')$q$,
                   'ولا الملكيّة', 'ليس هذا دفترك');
  perform _refuses($q$select * from ledger_ageing(_bk('f1000000-0000-0000-0000-0000000000f1'), '2026-11-06')$q$,
                   'ولا الأعمار', 'ليس هذا دفترك');
  perform _refuses($q$select * from ledger_budget_vs_actual(_bk('f1000000-0000-0000-0000-0000000000f1'))$q$,
                   'ولا الميزانيّة التقديريّة', 'ليس هذا دفترك');
  perform _refuses($q$select ledger_statement_facts(_bk('f1000000-0000-0000-0000-0000000000f1'), '2026-01-01', '2026-10-31')$q$,
                   'ولا الإيضاحات (ولا اسم صاحب الدفتر)', 'ليس هذا دفترك');
  perform _eq((select count(*)::integer from ledger_income_compare(_bk('e9000000-0000-0000-0000-0000000000e9'), '2026-01-01', '2026-10-31')) > 0,
              true, 'وهو يقرأ دفتره هو');
end $$;
select _as_admin('ad000000-0000-0000-0000-0000000000ad');
do $$ declare i uuid; begin
  perform _refuses($q$select * from ledger_ageing(_bk('f1000000-0000-0000-0000-0000000000f1'))$q$,
                   'والمدير بلا فحصٍ قائم لا يقرأ دفتر مزرعة', 'ليس هذا دفترك');
  i := ledger_inspect_open(_bk('f1000000-0000-0000-0000-0000000000f1'), 'مراجعة القوائم الماليّة للبوّابة', 1);
  perform _eq((select amount from ledger_equity_statement(_bk('f1000000-0000-0000-0000-0000000000f1'), '2026-01-01', '2026-10-31')
                where line = 'closing'), 201000::bigint, 'وفي فحصٍ قائمٍ يقرأ القوائم كما يقرؤها صاحبها (قاعدة القراءة نفسها)');
end $$;
select _as(null);
do $$ begin
  perform _refuses($q$select * from ledger_ageing(_bk('f1000000-0000-0000-0000-0000000000f1'))$q$,
                   'ومن لم يدخل يُطلب منه الدخول', 'سجّل الدخول أولاً');
end $$;
reset role;

do $$ begin
  perform _eq(has_function_privilege('anon', 'public.ledger_ageing(uuid, date)', 'execute'), false, 'الزائر لا ينادي الدوالّ');
  perform _eq(has_function_privilege('anon', 'public.ledger_statement_facts(uuid, date, date)', 'execute'), false, 'ولا الإيضاحات');
  perform _eq(has_function_privilege('authenticated', 'public._ledger_statement_gate(uuid)', 'execute'), false,
              'والمساعدات الداخليّة لا يناديها العضو');
  perform _eq(has_function_privilege('authenticated', 'public._ledger_net_income(uuid, date, date, uuid)', 'execute'), false,
              'ولا صافي الدخل بلا فحص');
  perform _eq((select count(*)::integer from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                where n.nspname = 'public' and p.prosecdef
                  and p.proname in ('ledger_compare_period', 'ledger_income_compare', 'ledger_balance_compare', 'ledger_cash_flow_compare',
                                    'ledger_equity_statement', 'ledger_ageing', 'ledger_budget_vs_actual', 'ledger_statement_facts')
                  and pg_get_functiondef(p.oid) like '%_ledger_statement_gate(p_book)%'),
              8, 'وكلّ الدوالّ الثماني تبدأ بالفحص نفسه');
end $$;

\o
do $$ declare f integer; p integer; begin
  select fails, passes into f, p from _score;
  if f = 0 then raise notice 'ALL CHECKS PASSED (%)', p; else raise exception '% CHECK(S) FAILED (% passed)', f, p; end if;
end $$;
