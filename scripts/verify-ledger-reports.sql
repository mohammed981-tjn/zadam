-- بوّابةُ تقارير الدفاتر (البند ١٨٧ ٢د).
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
create or replace function _bk(p_owner uuid) returns uuid language sql stable as $$
  select id from ledger_books where owner_id = p_owner and kind = 'farm' $$;

insert into auth.users (id) values
  ('a1000000-0000-0000-0000-0000000000a1'), ('b2000000-0000-0000-0000-0000000000b2'),
  ('ad000000-0000-0000-0000-0000000000ad')
on conflict (id) do nothing;
insert into profiles (id, full_name, role) values
  ('ad000000-0000-0000-0000-0000000000ad', 'مدير', 'admin'),
  ('a1000000-0000-0000-0000-0000000000a1', 'أ', 'investor'),
  ('b2000000-0000-0000-0000-0000000000b2', 'ب', 'investor')
on conflict (id) do update set role = excluded.role;

insert into seasons (id, owner_id, name, crop_key, station_key, irrigation, feddans, planting_date) values
  ('51000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-0000000000a1', 'قمح أ', 'wheat', 'x', 'canal', 10, current_date - 60),
  ('52000000-0000-0000-0000-000000000002', 'a1000000-0000-0000-0000-0000000000a1', 'ذرة',   'maize', 'x', 'canal', 10, current_date - 60);

grant usage on schema public, auth to anon, authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated, service_role;
grant select, update on _score to anon, authenticated, service_role;
grant select, update on _who to anon, authenticated, service_role;
grant execute on function _fail(text,text), _pass(text), _act_as(uuid), _eq(anyelement,anyelement,text), _bk(uuid)
  to anon, authenticated, service_role;

-- A's farm book: revenue and costs through the simple ledger, capital and a machine posted straight to the engine.
insert into ledger_entries (id, season_id, category, amount, paid_from, entry_date, created_by) values
  ('e1000000-0000-0000-0000-000000000001', '51000000-0000-0000-0000-000000000001', 'revenue', 100, 'cash',   current_date - 40, 'a1000000-0000-0000-0000-0000000000a1'),
  ('e1000000-0000-0000-0000-000000000002', '51000000-0000-0000-0000-000000000001', 'revenue', 500, 'cash',   current_date - 3,  'a1000000-0000-0000-0000-0000000000a1'),
  ('e1000000-0000-0000-0000-000000000003', '51000000-0000-0000-0000-000000000001', 'seeds',   200, 'cash',   current_date - 3,  'a1000000-0000-0000-0000-0000000000a1'),
  ('e1000000-0000-0000-0000-000000000004', '51000000-0000-0000-0000-000000000001', 'labour',  100, 'credit', current_date - 3,  'a1000000-0000-0000-0000-0000000000a1'),
  ('e1000000-0000-0000-0000-000000000005', '52000000-0000-0000-0000-000000000002', 'seeds',    50, 'bank',   current_date - 3,  'a1000000-0000-0000-0000-0000000000a1'),
  ('e1000000-0000-0000-0000-000000000006', '52000000-0000-0000-0000-000000000002', 'revenue',  80, 'credit', current_date - 3,  'a1000000-0000-0000-0000-0000000000a1');
select ledger_post_for(_bk('a1000000-0000-0000-0000-0000000000a1'), current_date - 5, 'رأس مال',
  '[{"key":"bank","side":"D","currency":"USD","minor":100000},{"key":"owner_capital","side":"C","currency":"USD","minor":100000}]'::jsonb,
  'rep-capital', null, 'manual', null, null, 'a1000000-0000-0000-0000-0000000000a1') is not null as capital_posted;
select ledger_post_for(_bk('a1000000-0000-0000-0000-0000000000a1'), current_date - 5, 'جرّار',
  '[{"key":"machinery","side":"D","currency":"USD","minor":30000},{"key":"cash_on_hand","side":"C","currency":"USD","minor":30000}]'::jsonb,
  'rep-machine', null, 'manual', null, null, 'a1000000-0000-0000-0000-0000000000a1') is not null as machine_posted;

-- Totals by type, so a statement can be compared with another without listing its lines.
create or replace function _is_total(p_book uuid, p_type text, p_from date default null, p_to date default null, p_season uuid default null) returns bigint language sql stable as $$
  select coalesce(sum(amount), 0)::bigint from ledger_income_statement(p_book, p_from, p_to, p_season) where type = p_type $$;
create or replace function _is_line(p_book uuid, p_key text, p_from date default null, p_to date default null, p_season uuid default null) returns bigint language sql stable as $$
  select coalesce(sum(amount), 0)::bigint from ledger_income_statement(p_book, p_from, p_to, p_season) where system_key = p_key $$;
create or replace function _bs_total(p_book uuid, p_type text, p_as_of date default null) returns bigint language sql stable as $$
  select coalesce(sum(balance), 0)::bigint from ledger_balance_sheet(p_book, p_as_of) where type = p_type $$;
create or replace function _cf_total(p_book uuid, p_section text, p_from date default null, p_to date default null) returns bigint language sql stable as $$
  select coalesce(sum(amount), 0)::bigint from ledger_cash_flow(p_book, p_from, p_to) where section = p_section $$;
create or replace function _cash_at(p_book uuid, p_as_of date) returns bigint language sql stable as $$
  select coalesce(sum(balance), 0)::bigint from ledger_balance_sheet(p_book, p_as_of) where system_key in ('cash_on_hand', 'bank', 'wallet') $$;
grant execute on function _is_total(uuid,text,date,date,uuid), _is_line(uuid,text,date,date,uuid), _bs_total(uuid,text,date),
  _cf_total(uuid,text,date,date), _cash_at(uuid,date) to anon, authenticated, service_role;

\echo ''
\echo '=========================================================================='
\echo 'أ) قائمة الدخل، والمواسم جارية: التكلفة مرسملة فلا ربح قبل البيع'
\echo '=========================================================================='
do $$
declare b uuid := _bk('a1000000-0000-0000-0000-0000000000a1'); s1 uuid := '51000000-0000-0000-0000-000000000001'; s2 uuid := '52000000-0000-0000-0000-000000000002';
begin
  perform _eq(_is_total(b, 'revenue'), 68000::bigint, 'الإيراد ٦٨٠$ (١٠٠ قديمة + ٥٠٠ + ٨٠)');
  perform _eq(_is_line(b, 'sales_crops'), 68000::bigint, 'كلّه مبيعات محاصيل');
  perform _eq(_is_line(b, 'cost_seeds'), 25000::bigint, 'البذور ٢٥٠$');
  perform _eq(_is_line(b, 'cost_labour'), 10000::bigint, 'والعمالة ١٠٠$');
  perform _eq(_is_line(b, 'costs_capitalised'), -35000::bigint, 'والمرسمل (٥٩٠٠) سالبٌ بقدر التكاليف: ٣٥٠$');
  perform _eq(_is_total(b, 'expense'), 0::bigint, 'فصافي المصروف صفر والمواسم جارية');
  perform _eq(_is_total(b, 'revenue') - _is_total(b, 'expense'), 68000::bigint, 'وصافي الدخل = الإيراد');
  perform _eq(_is_total(b, 'revenue', current_date - 10), 58000::bigint, 'وبفترةٍ تبدأ قبل عشرة أيام: ٥٨٠$ (القديم خرج)');
  perform _eq(_is_total(b, 'revenue', null, current_date - 20), 10000::bigint, 'وحتى قبل عشرين يوماً: القديم وحده');
  perform _eq(_is_total(b, 'revenue', null, null, s1), 60000::bigint, 'وللموسم الأوّل ٦٠٠$');
  perform _eq(_is_total(b, 'revenue', null, null, s2), 8000::bigint, 'وللثاني ٨٠$');
  perform _eq((select count(*)::int from ledger_income_statement(b) where type not in ('revenue', 'expense')), 0, 'ولا حسابٌ من نوعٍ آخر في القائمة');
  perform _eq((select count(*)::int from ledger_income_statement(b) where amount = 0), 0, 'ولا سطرٌ بلا حركة');
end $$;

\echo ''
\echo '=========================================================================='
\echo 'ب) الميزانيّة: الأصول = الالتزامات + الملكيّة + صافي الدخل'
\echo '=========================================================================='
do $$
declare b uuid := _bk('a1000000-0000-0000-0000-0000000000a1');
begin
  perform _eq(_bs_total(b, 'asset'), 178000::bigint, 'الأصول ١٬٧٨٠$');
  perform _eq(_bs_total(b, 'liability'), 10000::bigint, 'الالتزامات ١٠٠$ (عمالة بالأجل)');
  perform _eq(_bs_total(b, 'equity'), 100000::bigint, 'والملكيّة ١٬٠٠٠$');
  perform _eq(_bs_total(b, 'asset'), _bs_total(b, 'liability') + _bs_total(b, 'equity') + (_is_total(b, 'revenue') - _is_total(b, 'expense')), 'المعادلة تتحقّق');
  perform _eq((select equation_holds from ledger_trial_balance_proof(b)), true, 'ويوافقها إثبات المحرّك');
  perform _eq((select assets from ledger_trial_balance_proof(b)), _bs_total(b, 'asset'), 'وأصوله هي أصول الميزانيّة');
  perform _eq((select balance from ledger_balance_sheet(b) where system_key = 'machinery'), 30000::bigint, 'الآلات ٣٠٠$ بالتكلفة');
  perform _eq((select balance from ledger_balance_sheet(b) where system_key = 'crops_in_progress'), 35000::bigint, 'والمحاصيل القائمة ٣٥٠$ بالتكلفة');
  perform _eq(_bs_total(b, 'asset', current_date - 10), 10000::bigint + 0, 'وقبل عشرة أيام: النقد القديم وحده ١٠٠$') ;
  perform _eq((select count(*)::int from ledger_balance_sheet(b) where balance = 0), 0, 'ولا حسابٌ برصيدٍ صفر');
end $$;

\echo ''
\echo '=========================================================================='
\echo 'ج) التدفّقات النقديّة'
\echo '=========================================================================='
do $$
declare b uuid := _bk('a1000000-0000-0000-0000-0000000000a1');
begin
  perform _eq(_cf_total(b, 'operating'), 35000::bigint, 'التشغيل: ٦٠٠ مبيعات − ٢٥٠ بذور = ٣٥٠$ (الآجل لا يمسّ النقد)');
  perform _eq(_cf_total(b, 'financing'), 100000::bigint, 'التمويل: رأس المال ١٬٠٠٠$');
  perform _eq(_cf_total(b, 'investing'), -30000::bigint, 'والاستثمار: الجرّار −٣٠٠$');
  perform _eq(_cf_total(b, 'operating') + _cf_total(b, 'financing') + _cf_total(b, 'investing'), _cash_at(b, null), 'ومجموعها = رصيد النقد في الميزانيّة');
  perform _eq(_cash_at(b, null), 105000::bigint, 'وهو ١٬٠٥٠$');
  perform _eq((select amount from ledger_cash_flow(b) where code = '4110'), 60000::bigint, 'المبيعات المقبوضة ٦٠٠$');
  perform _eq((select amount from ledger_cash_flow(b) where code = '5110'), -25000::bigint, 'والبذور المدفوعة −٢٥٠$ (نقداً وبنكاً)');
  perform _eq((select count(*)::int from ledger_cash_flow(b) where code in ('1410', '5900', '2110', '1210')), 0, 'ولا رسملة ولا ذمم في التدفّق');
  -- A period: what it opens with, what moves, what it closes with.
  perform _eq(_cash_at(b, current_date - 11), 10000::bigint, 'رصيد أوّل الفترة (قبل ١١ يوماً) ١٠٠$');
  perform _eq(_cf_total(b, 'operating', current_date - 10) + _cf_total(b, 'financing', current_date - 10) + _cf_total(b, 'investing', current_date - 10), 95000::bigint, 'وحركة الفترة ٩٥٠$');
  perform _eq(_cash_at(b, current_date - 11) + 95000, _cash_at(b, null), 'فالأوّل + الحركة = الآخر');
end $$;

\echo ''
\echo '=========================================================================='
\echo 'ج٢) قيدٌ متعدّد المقابل: يُوزَّع النقد بالنسبة ولا يضيع قرش'
\echo '=========================================================================='
-- ٦٦٫٦٦ مبيعات و٣٣٫٣٣ عربونٌ مقدَّم من ١٠٠$ نقداً: القسمة لا تنتهي، وبقيّتها للأكبر.
select ledger_open_book_for('b2000000-0000-0000-0000-0000000000b2', 'farm') is not null as b_book;
select ledger_post_for(_bk('b2000000-0000-0000-0000-0000000000b2'), current_date - 2, 'قبض مع عربون',
  '[{"key":"cash_on_hand","side":"D","currency":"USD","minor":10000},{"key":"receivable_buyers","side":"D","currency":"USD","minor":5000},
    {"key":"sales_crops","side":"C","currency":"USD","minor":10000},{"key":"customer_deposits","side":"C","currency":"USD","minor":5000}]'::jsonb,
  'rep-split', null, 'manual', null, null, 'b2000000-0000-0000-0000-0000000000b2') is not null as split_posted;
do $$
declare b uuid := _bk('b2000000-0000-0000-0000-0000000000b2');
begin
  perform _eq((select amount from ledger_cash_flow(b) where code = '4110'), 6667::bigint, 'الأكبر يأخذ البقيّة: المبيعات ٦٦٫٦٧$');
  perform _eq((select amount from ledger_cash_flow(b) where code = '2310'), 3333::bigint, 'والعربون ٣٣٫٣٣$');
  perform _eq(_cf_total(b, 'operating'), 10000::bigint, 'ومجموعهما ١٠٠$ كاملة');
  perform _eq(_cf_total(b, 'operating'), _cash_at(b, null), 'وهو رصيد النقد');
end $$;

\echo ''
\echo '=========================================================================='
\echo 'د) ربحيّة المواسم'
\echo '=========================================================================='
do $$
declare b uuid := _bk('a1000000-0000-0000-0000-0000000000a1'); s1 uuid := '51000000-0000-0000-0000-000000000001'; s2 uuid := '52000000-0000-0000-0000-000000000002';
begin
  perform _eq((select revenue from ledger_profit_by_season(b) where season_id = s1), 60000::bigint, 'إيراد الأوّل ٦٠٠$');
  perform _eq((select expense from ledger_profit_by_season(b) where season_id = s1), 0::bigint, 'ومصروفه صفرٌ بعد الرسملة');
  perform _eq((select revenue from ledger_profit_by_season(b) where season_id = s2), 8000::bigint, 'وإيراد الثاني ٨٠$');
  perform _eq((select sum(revenue) from ledger_profit_by_season(b))::bigint, _is_total(b, 'revenue'), 'ومجموع المواسم = قائمة الدخل');
  perform _eq((select sum(expense) from ledger_profit_by_season(b))::bigint, _is_total(b, 'expense'), 'ومصروفها كذلك');
end $$;

\echo ''
\echo '=========================================================================='
\echo 'ه) بعد إقفال الموسم الأوّل: تكلفته تصير «تكلفة المباع»'
\echo '=========================================================================='
update seasons set status = 'completed' where id = '51000000-0000-0000-0000-000000000001';
do $$
declare b uuid := _bk('a1000000-0000-0000-0000-0000000000a1'); s1 uuid := '51000000-0000-0000-0000-000000000001';
begin
  perform _eq(_is_line(b, 'cost_of_sales'), 30000::bigint, 'تكلفة المباع ٣٠٠$');
  perform _eq(_is_total(b, 'expense'), 30000::bigint, 'وصافي المصروف ٣٠٠$');
  perform _eq(_is_total(b, 'revenue') - _is_total(b, 'expense'), 38000::bigint, 'وصافي الدخل ٣٨٠$');
  perform _eq(_is_total(b, 'revenue', null, null, s1) - _is_total(b, 'expense', null, null, s1), 30000::bigint, 'وربح الموسم الأوّل ٣٠٠$');
  perform _eq((select revenue - expense from ledger_profit_by_season(b) where season_id = s1), 30000::bigint, 'وكذلك في ربحيّة المواسم');
  perform _eq(_bs_total(b, 'asset'), _bs_total(b, 'liability') + _bs_total(b, 'equity') + (_is_total(b, 'revenue') - _is_total(b, 'expense')), 'والمعادلة ما زالت تتحقّق');
  perform _eq((select balance from ledger_balance_sheet(b) where system_key = 'crops_in_progress'), 5000::bigint, 'والمحاصيل القائمة بقي منها الموسم الثاني ٥٠$');
  perform _eq(_cf_total(b, 'operating'), 35000::bigint, 'والتدفّق النقدي لم يتغيّر (قيدٌ بلا نقد)');
end $$;

\echo ''
\echo '=========================================================================='
\echo 'و) حسابات ٩xxx الإحصائيّة خارج القوائم'
\echo '=========================================================================='
select ledger_post_for(ledger_open_book_for(null, 'platform'), current_date, 'لقطة إحصائيّة',
  '[{"key":"memo_contra","side":"D","currency":"USD","minor":12345},{"key":"oversight_farm_sales","side":"C","currency":"USD","minor":12345}]'::jsonb,
  'rep-memo', null, 'manual', null, null, 'ad000000-0000-0000-0000-0000000000ad') is not null as memo_posted;
do $$
declare p uuid := (select id from ledger_books where kind = 'platform');
begin
  perform _eq((select count(*)::int from ledger_trial_balance(p) where code like '92%'), 1, 'ميزان المراجعة يُظهر الحساب الإحصائيّ');
  perform _eq((select count(*)::int from ledger_balance_sheet(p)), 0, 'والميزانيّة لا تُظهر شيئاً منه');
  perform _eq((select count(*)::int from ledger_income_statement(p)), 0, 'ولا قائمة الدخل');
  perform _eq((select count(*)::int from ledger_cash_flow(p)), 0, 'ولا التدفّق');
  perform _eq((select count(*)::int from ledger_profit_by_season(p)), 0, 'ولا الربحيّة');
end $$;

\echo ''
\echo '=========================================================================='
\echo 'ز) من يقرأ ماذا، والصلاحيّات'
\echo '=========================================================================='
create table if not exists _ids (name text primary key, id uuid);
grant select on _ids to anon, authenticated, service_role;
insert into _ids values ('A_farm', _bk('a1000000-0000-0000-0000-0000000000a1')), ('platform', (select id from ledger_books where kind = 'platform'));
set role authenticated;
do $$
declare b uuid := (select id from _ids where name = 'A_farm'); p uuid := (select id from _ids where name = 'platform');
begin
  perform _act_as('a1000000-0000-0000-0000-0000000000a1');
  perform _eq((select count(*)::int from ledger_income_statement(b)) > 0, true, 'صاحب الدفتر يقرأ قائمة دخله');
  perform _eq((select count(*)::int from ledger_balance_sheet(b)) > 0, true, 'وميزانيّته');
  perform _eq((select count(*)::int from ledger_cash_flow(b)) > 0, true, 'وتدفّقه');
  perform _eq((select count(*)::int from ledger_profit_by_season(b)) > 0, true, 'وربحيّة مواسمه');
  perform _eq((select count(*)::int from ledger_trial_balance(p)), 0, 'ولا يقرأ دفتر المنصّة');
  perform _act_as('b2000000-0000-0000-0000-0000000000b2');
  perform _eq((select count(*)::int from ledger_income_statement(b)), 0, 'ومستخدمٌ آخر لا يقرأ قائمة دخله');
  perform _eq((select count(*)::int from ledger_balance_sheet(b)), 0, 'ولا ميزانيّته');
  perform _eq((select count(*)::int from ledger_cash_flow(b)), 0, 'ولا تدفّقه');
  perform _eq((select count(*)::int from ledger_profit_by_season(b)), 0, 'ولا ربحيّة مواسمه');
  perform _act_as('ad000000-0000-0000-0000-0000000000ad');
  perform _eq((select count(*)::int from ledger_income_statement(b)), 0, 'والمدير لا يقرأ دفتر مزارعٍ');
  perform _eq((select count(*)::int from ledger_trial_balance(p)) > 0, true, 'ويقرأ دفتر المنصّة');
end $$;
reset role;
do $$
begin
  perform _eq(has_function_privilege('anon', 'ledger_income_statement(uuid,date,date,uuid)', 'execute')
              or has_function_privilege('anon', 'ledger_balance_sheet(uuid,date)', 'execute')
              or has_function_privilege('anon', 'ledger_profit_by_season(uuid,date,date)', 'execute')
              or has_function_privilege('anon', 'ledger_cash_flow(uuid,date,date)', 'execute'), false, 'الزائر لا يستدعي شيئاً من التقارير');
  perform _eq(has_function_privilege('service_role', 'ledger_income_statement(uuid,date,date,uuid)', 'execute')
              or has_function_privilege('service_role', 'ledger_balance_sheet(uuid,date)', 'execute')
              or has_function_privilege('service_role', 'ledger_profit_by_season(uuid,date,date)', 'execute')
              or has_function_privilege('service_role', 'ledger_cash_flow(uuid,date,date)', 'execute'), false, 'ولا مفتاح الخدمة');
  perform _eq(has_function_privilege('authenticated', 'ledger_income_statement(uuid,date,date,uuid)', 'execute')
              and has_function_privilege('authenticated', 'ledger_balance_sheet(uuid,date)', 'execute')
              and has_function_privilege('authenticated', 'ledger_profit_by_season(uuid,date,date)', 'execute')
              and has_function_privilege('authenticated', 'ledger_cash_flow(uuid,date,date)', 'execute'), true, 'والمسجَّل يستدعيها (وسياسة الصفوف تحدّد ما يرى)');
  perform _eq((select bool_and(prosecdef = false) from pg_proc where proname in ('ledger_income_statement', 'ledger_balance_sheet', 'ledger_profit_by_season', 'ledger_cash_flow')), true, 'وكلّها تعمل بصلاحية المنادي لا صلاحية صاحب الدالّة');
end $$;

do $$
declare n integer;
begin
  select fails into n from _score;
  if n > 0 then raise exception '% فحصاً فشل', n; end if;
end $$;
\echo ''
\echo 'OK'
