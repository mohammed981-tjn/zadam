-- بوّابةُ محرّك الدفتر المزدوج (البند ١٨٦، المرحلة ١).
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
-- Refused, and for the reason named: a refusal for another reason is a different bug.
create or replace function _refuses(q text, expect text, label text) returns void language plpgsql as $$
begin
  execute q; perform _fail(label, 'نُفِّذ ولم يُرفض');
exception when others then
  if sqlerrm like '%' || expect || '%' then perform _pass(label || ' — ' || left(sqlerrm, 70));
  else perform _fail(label, 'رُفض لسببٍ آخر: ' || sqlerrm); end if;
end $$;
create or replace function _post_refused(label text, expect text, book uuid, d date, lines jsonb, k text, rate numeric default null)
returns void language plpgsql as $$
begin
  perform ledger_post(book, d, 'x', lines, k, rate);
  perform _fail(label, 'قُبل ولم يُرفض');
exception when others then
  if sqlerrm like '%' || expect || '%' then perform _pass(label || ' — ' || left(sqlerrm, 70));
  else perform _fail(label, 'رُفض لسببٍ آخر: ' || sqlerrm); end if;
end $$;
create or replace function _l(acct text, side text, cur text, minor bigint) returns jsonb language sql immutable as $$
  select jsonb_build_object('account', acct, 'side', side, 'currency', cur, 'minor', minor) $$;
create or replace function _k(skey text, side text, cur text, minor bigint) returns jsonb language sql immutable as $$
  select jsonb_build_object('key', skey, 'side', side, 'currency', cur, 'minor', minor) $$;
create table if not exists _ids (name text primary key, id uuid);
create or replace function _bk(n text) returns uuid language sql stable as $$ select id from _ids where name = n $$;


insert into auth.users (id) values
  ('a1000000-0000-0000-0000-0000000000a1'), ('b2000000-0000-0000-0000-0000000000b2'),
  ('c3000000-0000-0000-0000-0000000000c3'), ('ad000000-0000-0000-0000-0000000000ad')
on conflict (id) do nothing;
insert into profiles (id, full_name, role) values
  ('ad000000-0000-0000-0000-0000000000ad', 'مدير', 'admin'),
  ('a1000000-0000-0000-0000-0000000000a1', 'أ', 'investor'),
  ('b2000000-0000-0000-0000-0000000000b2', 'ب', 'investor')
on conflict (id) do update set role = excluded.role;

grant usage on schema public, auth to anon, authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated, service_role;
grant select, update on _score to anon, authenticated, service_role;
grant select, update on _who to anon, authenticated, service_role;
grant all on _ids to anon, authenticated, service_role;
grant execute on function _fail(text,text), _pass(text), _act_as(uuid), _eq(anyelement,anyelement,text),
  _refuses(text,text,text), _post_refused(text,text,uuid,date,jsonb,text,numeric),
  _l(text,text,text,bigint), _k(text,text,text,bigint), _bk(text) to anon, authenticated, service_role;

-- A third currency, only so the "one foreign currency per entry" rule has something to refuse.
insert into ledger_currencies (code, name_ar, minor_digits) values ('EUR', 'يورو', 2);

\echo ''
\echo '=========================================================================='
\echo 'أ) قوالب الشجرة سليمة'
\echo '=========================================================================='
do $$
begin
  perform _eq((select count(*)::int from ledger_chart_templates where kind = 'farm'), 64, 'شجرة المزرعة ٦٤ حساباً');
  perform _eq((select count(*)::int from ledger_chart_templates where kind = 'investor'), 30, 'شجرة المستثمر ٣٠');
  perform _eq((select count(*)::int from ledger_chart_templates where kind = 'platform'), 23, 'شجرة المنصّة ٢٣');
  perform _eq((select count(*)::int from ledger_chart_templates t join ledger_chart_templates p
                on p.kind = t.kind and p.code = t.parent_code where p.type <> t.type), 0, 'نوع كلّ حسابٍ نوعُ أبيه');
  perform _eq((select count(*)::int from ledger_chart_templates t join ledger_chart_templates p
                on p.kind = t.kind and p.code = t.parent_code where p.postable), 0, 'والأب تجميعيّ دائماً');
  perform _eq((select count(*)::int from (select kind from ledger_chart_templates where system_key is not null
                group by kind having count(system_key) <> count(distinct system_key)) q), 0, 'مفتاح الحساب النظاميّ فريدٌ في كلّ شجرة');
  perform _eq((select count(*)::int from ledger_chart_templates where system_key = 'rounding' and postable), 3, 'لكلّ شجرةٍ حسابُ فروق التقريب');
  perform _eq((select count(*)::int from ledger_chart_templates where system_key = 'cash_on_hand'), 3, 'وحسابُ النقد');
end $$;

\echo ''
\echo '=========================================================================='
\echo 'ب) فتح الدفاتر: لصاحبها، مرّةً واحدة، وبشجرتها'
\echo '=========================================================================='
set role authenticated;
do $$
declare f uuid; f2 uuid; i uuid; p uuid; b uuid;
begin
  perform _act_as(null);
  perform _refuses($q$select ledger_open_book('farm')$q$, 'سجّل الدخول', 'بلا دخولٍ لا يُفتح دفتر');

  perform _act_as('a1000000-0000-0000-0000-0000000000a1');
  f := ledger_open_book('farm');
  insert into _ids values ('A_farm', f);
  perform _eq((select count(*)::int from ledger_accounts where book_id = f), 64, 'دفتر المزرعة بشجرته');
  f2 := ledger_open_book('farm');
  perform _eq(f2, f, 'فتحه ثانيةً يُرجع الدفتر نفسه');
  perform _eq((select count(*)::int from ledger_accounts where book_id = f), 64, 'ولا تتضاعف حساباته');
  i := ledger_open_book('investor');
  insert into _ids values ('A_inv', i);
  perform _eq(i <> f, true, 'ودفتر المستثمر غير دفتر المزرعة (حسابٌ واحد بدفترين)');
  perform _eq((select count(*)::int from ledger_accounts where book_id = i), 30, 'بشجرة المستثمر');
  perform _eq((select count(*)::int from ledger_books), 2, 'يرى دفترَيه وحدهما');
  perform _eq((select closed_through from ledger_books where id = f), null, 'ولا فترة مقفلة');
  perform _eq((select base_currency from ledger_books where id = f), 'USD', 'ووحدة القياس الدولار');
  perform _refuses($q$select ledger_open_book('platform')$q$, 'للإدارة وحدها', 'ودفتر المنصّة ليس له');
  perform _refuses($q$select ledger_open_book('gold')$q$, 'نوع دفترٍ', 'ونوعٌ غير معروف يُرفض');

  perform _act_as('b2000000-0000-0000-0000-0000000000b2');
  b := ledger_open_book('farm');
  insert into _ids values ('B_farm', b);
  perform _eq(b <> f, true, 'لكلّ مستخدمٍ دفتره');
  perform _eq((select count(*)::int from ledger_books), 1, 'ولا يرى دفتر غيره');

  perform _act_as('ad000000-0000-0000-0000-0000000000ad');
  p := ledger_open_book('platform');
  insert into _ids values ('PLAT', p);
  perform _eq((select count(*)::int from ledger_accounts where book_id = p), 23, 'المدير يفتح دفتر المنصّة');
  perform _eq(ledger_open_book('platform'), p, 'ومرّةً واحدة');
  perform _eq((select count(*)::int from ledger_books), 1, 'ويرى دفتر المنصّة وحده، لا دفاتر الناس');
end $$;

\echo ''
\echo '=========================================================================='
\echo 'ج) القيد بالدولار: متوازن، وكلّ ما عدا ذلك يُرفض'
\echo '=========================================================================='
do $$
declare fa uuid := _bk('A_farm'); e1 uuid; n0 int; e2 uuid;
begin
  perform _act_as('a1000000-0000-0000-0000-0000000000a1');
  e1 := ledger_post(fa, current_date - 2, 'بذور', jsonb_build_array(_l('5110','D','USD',30000), _l('1110','C','USD',30000)), 'k-a-0001');
  insert into _ids values ('E1', e1);
  perform _eq((select count(*)::int from journal_entries where book_id = fa), 1, 'قيدٌ واحد');
  perform _eq((select count(*)::int from journal_lines where entry_id = e1), 2, 'بسطرين');
  perform _eq((select source_type from journal_entries where id = e1), 'manual', 'ومصدره يدويّ لا يدّعي غيره');
  perform _eq((select created_by from journal_entries where id = e1), 'a1000000-0000-0000-0000-0000000000a1'::uuid, 'ومن كتبه مسجَّل');
  perform _eq((select fx_rate from journal_entries where id = e1), null, 'بلا سعر صرف');
  perform _eq((select sum(base_minor) filter (where side = 'D') = sum(base_minor) filter (where side = 'C') from journal_lines where entry_id = e1), true, 'والمدين يساوي الدائن');

  select count(*) into n0 from journal_entries where book_id = fa;
  perform _post_refused('غير متوازن', 'القيد غير متوازن', fa, current_date, jsonb_build_array(_l('5110','D','USD',30000), _l('1110','C','USD',29999)), 'k-a-bad-01');
  perform _post_refused('سطرٌ واحد', 'من سطرين', fa, current_date, jsonb_build_array(_l('5110','D','USD',30000)), 'k-a-bad-02');
  perform _post_refused('مبلغٌ صفر', 'عددٌ صحيحٌ موجب', fa, current_date, jsonb_build_array(_l('5110','D','USD',0), _l('1110','C','USD',0)), 'k-a-bad-03');
  perform _post_refused('مبلغٌ سالب', 'عددٌ صحيحٌ موجب', fa, current_date, jsonb_build_array(_l('5110','D','USD',-5), _l('1110','C','USD',-5)), 'k-a-bad-04');
  perform _post_refused('مبلغٌ بكسر', 'عددٌ صحيحٌ موجب', fa, current_date,
    jsonb_build_array(jsonb_build_object('account','5110','side','D','currency','USD','minor',12.5), _l('1110','C','USD',12)), 'k-a-bad-05');
  perform _post_refused('مبلغٌ نصّ', 'عددٌ صحيحٌ موجب', fa, current_date,
    jsonb_build_array(jsonb_build_object('account','5110','side','D','currency','USD','minor','300'), _l('1110','C','USD',300)), 'k-a-bad-06');
  perform _post_refused('حسابٌ غير موجود', 'حسابٌ غير موجود', fa, current_date, jsonb_build_array(_l('9999','D','USD',100), _l('1110','C','USD',100)), 'k-a-bad-07');
  perform _post_refused('حسابٌ تجميعيّ', 'تجميعيّ', fa, current_date, jsonb_build_array(_l('5','D','USD',100), _l('1110','C','USD',100)), 'k-a-bad-08');
  perform _post_refused('جانبٌ مجهول', 'جانب السطر', fa, current_date, jsonb_build_array(_l('5110','X','USD',100), _l('1110','C','USD',100)), 'k-a-bad-09');
  perform _post_refused('عملةٌ مجهولة', 'عملة السطر', fa, current_date, jsonb_build_array(_l('5110','D','XXX',100), _l('1110','C','USD',100)), 'k-a-bad-10');
  perform _post_refused('بلا حساب', 'حدّد حساب', fa, current_date, jsonb_build_array(jsonb_build_object('side','D','currency','USD','minor',100), _l('1110','C','USD',100)), 'k-a-bad-11');
  perform _post_refused('بُعدٌ غير صالح', 'معرّف بُعدٍ', fa, current_date,
    jsonb_build_array(jsonb_build_object('account','5110','side','D','currency','USD','minor',100,'season','not-a-uuid'), _l('1110','C','USD',100)), 'k-a-bad-12');
  perform _post_refused('مفتاحٌ قصير', 'مفتاح القيد غير صالح', fa, current_date, jsonb_build_array(_l('5110','D','USD',100), _l('1110','C','USD',100)), 'short');
  perform _post_refused('بلا تاريخ', 'اكتب تاريخ القيد', fa, null, jsonb_build_array(_l('5110','D','USD',100), _l('1110','C','USD',100)), 'k-a-bad-13');
  perform _post_refused('تاريخٌ في المستقبل', 'في المستقبل', fa, current_date + 5, jsonb_build_array(_l('5110','D','USD',100), _l('1110','C','USD',100)), 'k-a-bad-14');
  perform _post_refused('تاريخٌ قبل ٢٠٠٠', 'entry_date_check', fa, date '1999-12-31', jsonb_build_array(_l('5110','D','USD',100), _l('1110','C','USD',100)), 'k-a-bad-15');
  perform _post_refused('السطور ليست مصفوفة', 'من سطرين', fa, current_date, '{}'::jsonb, 'k-a-bad-16');
  perform _post_refused('عملتان أجنبيّتان في قيد', 'عملةٌ واحدة', fa, current_date,
    jsonb_build_array(_l('5110','D','SDG',100000), _l('1110','C','EUR',100)), 'k-a-bad-17', 1000);
  perform _eq((select count(*)::int from journal_entries where book_id = fa), n0, 'ولم يدخل شيءٌ من المرفوض');

  e2 := ledger_post(fa, current_date - 2, 'عمالة', jsonb_build_array(_k('cost_labour','D','USD',10000), _k('cash_on_hand','C','USD',10000)), 'k-a-0002');
  perform _eq((select a.code from journal_lines l join ledger_accounts a on a.id = l.account_id where l.entry_id = e2 and l.side = 'D'), '5140', 'الحساب بمفتاحه النظاميّ يصل إلى رقمه');

  perform ledger_post(fa, current_date - 2, 'بذور للموسم', jsonb_build_array(
      jsonb_build_object('account','5110','side','D','currency','USD','minor',5000,'season','11111111-1111-1111-1111-111111111111','memo','كيس'),
      _l('1110','C','USD',5000)), 'k-a-0003');
  perform _eq((select season_id from journal_lines where line_memo = 'كيس'), '11111111-1111-1111-1111-111111111111'::uuid, 'وبُعد الموسم يُحفظ على السطر');
end $$;

\echo ''
\echo '=========================================================================='
\echo 'د) الجنيه: سعر الصرف، والتقريب، وحدّ التقريب'
\echo '=========================================================================='
do $$
declare fa uuid := _bk('A_farm'); e uuid; n int;
begin
  perform _act_as('a1000000-0000-0000-0000-0000000000a1');
  perform _post_refused('جنيهٌ بلا سعرٍ ولا سعرَ منشور', 'لا سعر صرف', fa, current_date,
    jsonb_build_array(_l('5120','D','SDG',30000000), _l('1110','C','SDG',30000000)), 'k-a-sdg-00');

  e := ledger_post(fa, current_date - 3, 'سماد بالجنيه', jsonb_build_array(_l('5120','D','SDG',30000000), _l('1110','C','SDG',30000000)), 'k-a-sdg-01', 1000);
  insert into _ids values ('E_SDG', e);
  perform _eq((select fx_rate from journal_entries where id = e), 1000.000000, 'السعر المكتوب يُسجَّل');
  perform _eq((select fx_source from journal_entries where id = e), 'user', 'ويُوسَم «سعر المستخدم»');
  perform _eq((select array_agg(base_minor order by line_no) from journal_lines where entry_id = e), array[30000::bigint, 30000], '٣٠٠٬٠٠٠ جنيه بسعر ١٠٠٠ = ٣٠٠ دولار');
  perform _eq((select array_agg(amount_minor order by line_no) from journal_lines where entry_id = e), array[30000000::bigint, 30000000], 'ومبلغه الأصلي بالجنيه محفوظ');

  -- ١٠٠٠٫٠٠ جنيه ÷ ٣٠٠٠ = ٠٫٣٣٣٣ دولار: سطرٌ مدين يقرَّب إلى ٣٣ سنتاً، وسطران دائنان من ٥٠٠ يقرَّب كلٌّ إلى ١٧ فيكون ٣٤.
  e := ledger_post(fa, current_date - 3, 'تقريب', jsonb_build_array(
      _l('5120','D','SDG',100000), _l('1110','C','SDG',50000), _l('1120','C','SDG',50000)), 'k-a-sdg-02', 3000);
  insert into _ids values ('E_ROUND', e);
  perform _eq((select count(*)::int from journal_lines where entry_id = e), 4, 'فرق التقريب سطرٌ رابع');
  perform _eq((select a.code || l.side || l.amount_minor::text || l.currency from journal_lines l join ledger_accounts a on a.id = l.account_id
                where l.entry_id = e and a.system_key = 'rounding'), '7120D1USD', 'على حساب ٧١٢٠ بسنتٍ واحد من جهة المدين');
  perform _eq((select sum(base_minor) filter (where side = 'D') = sum(base_minor) filter (where side = 'C') from journal_lines where entry_id = e), true, 'والقيد متوازن بعده');

  perform _post_refused('فرقٌ يتجاوز التقريب', 'القيد غير متوازن', fa, current_date - 3,
    jsonb_build_array(_l('5120','D','SDG',15000000), _l('1110','C','USD',10000)), 'k-a-sdg-03', 1000);
  perform _post_refused('جنيهٌ واحد غير متوازن بعملته', 'القيد غير متوازن', fa, current_date - 3,
    jsonb_build_array(_l('5120','D','SDG',10000), _l('1110','C','SDG',9900)), 'k-a-sdg-04', 1000);
  perform _post_refused('سعرٌ صفر', 'خارج المعقول', fa, current_date - 3,
    jsonb_build_array(_l('5120','D','SDG',10000), _l('1110','C','SDG',10000)), 'k-a-sdg-05', 0);
  perform _post_refused('سعرٌ فلكيّ', 'خارج المعقول', fa, current_date - 3,
    jsonb_build_array(_l('5120','D','SDG',10000), _l('1110','C','SDG',10000)), 'k-a-sdg-06', 500000000);

  e := ledger_post(fa, current_date - 3, 'صرف دولار', jsonb_build_array(_l('1120','D','USD',10000), _l('1110','C','SDG',10000000)), 'k-a-sdg-07', 1000);
  perform _eq((select count(*)::int from journal_lines where entry_id = e), 2, 'قيد صرفٍ بعملتين (١٠٠$ ← ١٠٠٬٠٠٠ جنيه) بلا فرق');

  e := ledger_post(fa, current_date - 3, 'سعر بسبع خانات', jsonb_build_array(_l('5120','D','SDG',10000), _l('1110','C','SDG',10000)), 'k-a-sdg-08', 1000.1234567);
  perform _eq((select fx_rate from journal_entries where id = e), 1000.123457, 'السعر يُقرَّب إلى ست خانات ويُسجَّل مقرَّباً');
end $$;

reset role;
insert into market_quotes (kind, market, crop, market_date, buy, sell, source_url, status, method) values
  ('fx_parallel', '', '', current_date - 30, 1990, 2000,   'https://example.com/q1', 'published', 'manual'),
  ('fx_parallel', '', '', current_date - 1,  2400, 2450.5, 'https://example.com/q2', 'published', 'manual'),
  ('fx_parallel', '', '', current_date,      9990, 9999,   'https://example.com/q3', 'held',      'manual'),
  ('fx_bank',     '', '', current_date - 1,  600,  610,    'https://example.com/q4', 'published', 'manual');
set role authenticated;

\echo ''
\echo '=========================================================================='
\echo 'هـ) السعر الافتراضيّ من السوق: المنشور، والحديث، ولا سعرَ قديماً'
\echo '=========================================================================='
do $$
declare fa uuid := _bk('A_farm'); e uuid;
begin
  perform _act_as('a1000000-0000-0000-0000-0000000000a1');
  perform _eq((select rate from ledger_fx_rate(current_date)), 2450.5, 'يأخذ أحدث سعرٍ منشور لا المحجوز');
  perform _eq((select rate_date from ledger_fx_rate(current_date)), current_date - 1, 'بتاريخه');
  perform _eq((select rate from ledger_fx_rate(current_date, 'bank')), 610.0, 'وللبنك سعره (سعر البيع)');
  perform _eq((select count(*)::int from ledger_fx_rate(current_date - 3)), 0, 'ولا يأخذ سعراً أحدث من تاريخ القيد');
  perform _eq((select count(*)::int from ledger_fx_rate(current_date - 20)), 0, 'ولا سعراً أقدم من ٧ أيام');
  perform _eq((select rate from ledger_fx_rate(current_date - 25)), 2000.0, 'وسعرُ ٥ أيامٍ يصلح');

  e := ledger_post(fa, current_date, 'سوق', jsonb_build_array(_l('5120','D','SDG',24505000), _l('1110','C','SDG',24505000)), 'k-a-mkt-01');
  perform _eq((select fx_rate from journal_entries where id = e), 2450.5, 'القيد بلا سعرٍ يأخذ سعر السوق');
  perform _eq((select fx_source from journal_entries where id = e), 'parallel', 'ويُوسَم «سوق موازية»');
  perform _eq((select array_agg(base_minor order by line_no) from journal_lines where entry_id = e), array[10000::bigint, 10000], 'وبناءً عليه ١٠٠ دولار (٢٤٥٬٠٥٠ جنيه ÷ ٢٤٥٠٫٥)');

  e := ledger_post(fa, current_date - 25, 'قديم لكنه ضمن ٧ أيام', jsonb_build_array(_l('5120','D','SDG',2000000), _l('1110','C','SDG',2000000)), 'k-a-mkt-02');
  perform _eq((select fx_rate from journal_entries where id = e), 2000.0, 'قيدٌ بتاريخٍ قديم يأخذ سعر ذلك اليوم');
  perform _post_refused('لا سعرَ خلال ٧ أيام', 'لا سعر صرف', fa, current_date - 20,
    jsonb_build_array(_l('5120','D','SDG',100000), _l('1110','C','SDG',100000)), 'k-a-mkt-03');
  perform _post_refused('ولا سعرَ مستقبليّ', 'لا سعر صرف', fa, current_date - 3,
    jsonb_build_array(_l('5120','D','SDG',100000), _l('1110','C','SDG',100000)), 'k-a-mkt-04');
end $$;

\echo ''
\echo '=========================================================================='
\echo 'و) تكرار الإرسال: المفتاح نفسه والمحتوى نفسه يُرجع القيد، والمحتوى المختلف يُرفض'
\echo '=========================================================================='
do $$
declare fa uuid := _bk('A_farm'); fb uuid := _bk('B_farm'); e1 uuid := _bk('E1'); again uuid; n0 int; l0 int;
begin
  perform _act_as('a1000000-0000-0000-0000-0000000000a1');
  select count(*) into n0 from journal_entries where book_id = fa;
  select count(*) into l0 from journal_lines where book_id = fa;
  again := ledger_post(fa, current_date - 2, 'بذور', jsonb_build_array(_l('5110','D','USD',30000), _l('1110','C','USD',30000)), 'k-a-0001');
  perform _eq(again, e1, 'إعادة الإرسال تُرجع القيد نفسه');
  perform _eq((select count(*)::int from journal_entries where book_id = fa), n0, 'ولا قيداً جديداً');
  perform _eq((select count(*)::int from journal_lines where book_id = fa), l0, 'ولا سطراً');
  again := ledger_post(fa, current_date - 2, 'بذور', jsonb_build_array(_l('1110','C','USD',30000), _l('5110','D','USD',30000)), 'k-a-0001');
  perform _eq(again, e1, 'وترتيب السطور لا يغيّر شيئاً');
  perform _post_refused('المفتاح نفسه والوصف مختلف', 'استُعمل لقيدٍ مختلف', fa, current_date - 2,
    jsonb_build_array(_l('5110','D','USD',30000), _l('1110','C','USD',30000)), 'k-a-0001');
  perform _eq(ledger_post(fa, current_date - 3, 'سماد بالجنيه', jsonb_build_array(_l('5120','D','SDG',30000000), _l('1110','C','SDG',30000000)), 'k-a-sdg-01', 1000),
              _bk('E_SDG'), 'وقيد الجنيه بسعره المكتوب يُعاد كما هو');
  perform _refuses(format($q$select ledger_post(%L, current_date - 3, 'سماد بالجنيه', %L::jsonb, 'k-a-sdg-01', 1001)$q$,
      fa, jsonb_build_array(_l('5120','D','SDG',30000000), _l('1110','C','SDG',30000000))::text),
    'استُعمل لقيدٍ مختلف', 'والمفتاح نفسه بسعرٍ آخر يُرفض');
  perform _refuses(format($q$select ledger_post(%L, current_date - 2, 'x', %L::jsonb, 'k-a-0001')$q$,
      fa, jsonb_build_array(_l('5110','D','USD',30001), _l('1110','C','USD',30001))::text),
    'استُعمل لقيدٍ مختلف', 'والمفتاح نفسه بمبلغٍ آخر يُرفض');

  perform _act_as('b2000000-0000-0000-0000-0000000000b2');
  perform ledger_post(fb, current_date - 2, 'بذور', jsonb_build_array(_l('5110','D','USD',30000), _l('1110','C','USD',30000)), 'k-a-0001');
  perform _eq((select count(*)::int from journal_entries where book_id = fb), 1, 'والمفتاح نفسه في دفترٍ آخر قيدٌ آخر');
end $$;

\echo ''
\echo '=========================================================================='
\echo 'ز) العكس: قيدٌ مقابل، مرّةً واحدة، بالمبالغ نفسها'
\echo '=========================================================================='
do $$
declare fa uuid := _bk('A_farm'); e1 uuid := _bk('E1'); r uuid; r2 uuid; es uuid := _bk('E_SDG'); rs uuid; er uuid := _bk('E_ROUND'); rr uuid; n0 int;
begin
  perform _act_as('a1000000-0000-0000-0000-0000000000a1');
  r := ledger_reverse(e1, 'أدخلتُه بالخطأ', null, 'rev-k-0001');
  perform _eq((select reversal_of from journal_entries where id = r), e1, 'العاكس يشير إلى الأصل');
  perform _eq((select count(*)::int from journal_lines o join journal_lines x
                on x.entry_id = r and x.line_no = o.line_no and x.account_id = o.account_id
               where o.entry_id = e1 and x.side <> o.side and x.amount_minor = o.amount_minor and x.base_minor = o.base_minor), 2,
    'سطراه بالحسابين والمبلغين نفسيهما وبجانبٍ معكوس');
  perform _eq((select memo like 'عكس القيد #%: أدخلتُه بالخطأ' from journal_entries where id = r), true, 'ووصفه فيه السبب');
  perform _eq(ledger_reverse(e1, 'أدخلتُه بالخطأ', null, 'rev-k-0001'), r, 'وإعادة الطلب بمفتاحه تُرجعه ولا تعكس ثانيةً');
  select count(*) into n0 from journal_entries where reversal_of = e1;
  perform _eq(n0, 1, 'وعكسٌ واحدٌ لكلّ قيد');
  perform _refuses(format($q$select ledger_reverse(%L, 'مرّة أخرى', null, 'rev-k-0002')$q$, e1), 'عُكس هذا القيد', 'ومفتاحٌ آخر لا يعكسه ثانيةً');
  perform _refuses(format($q$select ledger_reverse(%L, 'عكس العكس')$q$, r), 'قيدٌ عاكس', 'ولا يُعكس العاكس');
  perform _refuses(format($q$select ledger_reverse(%L, '   ')$q$, es), 'اكتب سبب العكس', 'والعكس بلا سبب مرفوض');
  perform _refuses(format($q$select ledger_reverse(%L, null)$q$, es), 'اكتب سبب العكس', 'ولا بسببٍ فارغ');
  perform _refuses(format($q$select ledger_reverse(%L, 'قبل الأصل', current_date - 10)$q$, es), 'العكس لا يسبق', 'والعكس لا يسبق تاريخ الأصل');
  perform _refuses($q$select ledger_reverse(gen_random_uuid(), 'x')$q$, 'ليس هذا قيدك', 'وقيدٌ غير موجود لا يُعكس');

  rs := ledger_reverse(es, 'سعرٌ خاطئ');
  perform _eq((select array_agg(base_minor order by line_no) from journal_lines where entry_id = rs), array[30000::bigint, 30000], 'عكس قيد الجنيه ينسخ معادلاته بالدولار كما هي');
  perform _eq((select fx_rate from journal_entries where id = rs), 1000.000000, 'وسعره');
  rr := ledger_reverse(er, 'تجربة');
  perform _eq((select count(*)::int from journal_lines where entry_id = rr), 4, 'وعكس قيدٍ فيه فرق تقريب يعكس سطره أيضاً');
  perform _eq((select sum(base_minor) filter (where side = 'D') = sum(base_minor) filter (where side = 'C') from journal_lines where entry_id = rr), true, 'ويبقى متوازناً');

  perform _act_as('b2000000-0000-0000-0000-0000000000b2');
  perform _refuses(format($q$select ledger_reverse(%L, 'ليس قيدي')$q$, es), 'ليس هذا قيدك', 'غير صاحب الدفتر لا يعكس قيده');
end $$;

\echo ''
\echo '=========================================================================='
\echo 'ح) إقفال الفترة'
\echo '=========================================================================='
do $$
declare fa uuid := _bk('A_farm'); fb uuid := _bk('B_farm'); eb uuid; r uuid;
begin
  perform _act_as('b2000000-0000-0000-0000-0000000000b2');
  eb := ledger_post(fb, current_date - 20, 'قديم', jsonb_build_array(_l('5110','D','USD',1000), _l('1110','C','USD',1000)), 'k-b-0001');
  perform ledger_post(fb, current_date - 5, 'حديث', jsonb_build_array(_l('5110','D','USD',2000), _l('1110','C','USD',2000)), 'k-b-0002');

  perform _act_as('a1000000-0000-0000-0000-0000000000a1');
  perform _refuses(format($q$select ledger_close_through(%L, current_date - 10)$q$, fb), 'ليس هذا دفترك', 'غير صاحب الدفتر لا يقفله');

  perform _act_as('b2000000-0000-0000-0000-0000000000b2');
  perform _eq(ledger_close_through(fb, current_date - 10), current_date - 10, 'صاحب الدفتر يقفل حتى يوم');
  perform _eq((select closed_through from ledger_books where id = fb), current_date - 10, 'ويُسجَّل');
  perform _post_refused('يوم الإقفال نفسه', 'مقفلة', fb, current_date - 10, jsonb_build_array(_l('5110','D','USD',100), _l('1110','C','USD',100)), 'k-b-c-01');
  perform _post_refused('وقبله', 'مقفلة', fb, current_date - 11, jsonb_build_array(_l('5110','D','USD',100), _l('1110','C','USD',100)), 'k-b-c-02');
  perform ledger_post(fb, current_date - 9, 'بعد الإقفال', jsonb_build_array(_l('5110','D','USD',100), _l('1110','C','USD',100)), 'k-b-c-03');
  perform _pass('وبعده يُقبل');
  perform _refuses(format($q$select ledger_close_through(%L, current_date - 12)$q$, fb), 'مقفلة أصلاً', 'والإقفال لا يتراجع');
  perform _eq(ledger_close_through(fb, current_date - 10), current_date - 10, 'وإقفال اليوم نفسه ثانيةً لا يضرّ');
  perform _refuses(format($q$select ledger_close_through(%L, current_date + 3)$q$, fb), 'يومٌ مضى', 'ولا يُقفل المستقبل');
  perform _refuses(format($q$select ledger_close_through(%L, ledger_today())$q$, fb), 'يومٌ مضى', 'ولا اليوم نفسه');
  perform _refuses(format($q$select ledger_close_through(%L, null)$q$, fb), 'يومٌ مضى', 'ولا يومٌ فارغ');

  r := ledger_reverse(eb, 'تصحيح');
  perform _eq((select entry_date >= ledger_today() - 1 from journal_entries where id = r), true, 'عكسُ قيدٍ في فترةٍ مقفلة يقع في اليوم لا في الفترة المقفلة');
  perform _refuses(format($q$select ledger_reverse(%L, 'x', current_date - 7)$q$,
      (select id from journal_entries where book_id = fb and idempotency_key = 'k-b-0002')),
    'العكس لا يسبق', 'وعكسٌ بتاريخٍ قبل الأصل مرفوض');
  perform _refuses(format($q$select ledger_reverse(%L, 'x', current_date - 12)$q$,
      (select id from journal_entries where book_id = fb and idempotency_key = 'k-b-0002')),
    'مقفلة', 'وعكسٌ بتاريخٍ داخل الفترة المقفلة مرفوض');
end $$;

reset role;
do $$
declare fb uuid := _bk('B_farm');
begin
  perform _refuses(format($q$update ledger_books set closed_through = current_date - 30 where id = %L$q$, fb), 'لا تُفتح من جديد', 'حتى مدير القاعدة لا يتراجع بالإقفال');
  perform _refuses(format($q$update ledger_books set closed_through = null where id = %L$q$, fb), 'لا تُفتح من جديد', 'ولا يمسحه');
end $$;
set role authenticated;

\echo ''
\echo '=========================================================================='
\echo 'ط) إضافة حساب'
\echo '=========================================================================='
do $$
declare fa uuid := _bk('A_farm'); fb uuid := _bk('B_farm'); w uuid; u uuid;
begin
  perform _act_as('a1000000-0000-0000-0000-0000000000a1');
  w := ledger_add_account(fa, '11', '1140', 'بنكك', 'Bankak', null, 'bankak');
  perform _eq((select type || '|' || postable::text || '|' || provider from ledger_accounts where id = w), 'asset|true|bankak', 'محفظة بنكك تحت النقديّة، نوعها نوع أبيها');
  perform ledger_post(fa, current_date - 1, 'تحويل', jsonb_build_array(_l('1140','D','USD',5000), _l('1110','C','USD',5000)), 'k-a-w-01');
  perform _pass('ويُقيَّد عليها');
  perform _refuses(format($q$select ledger_add_account(%L, '11', '1140', 'مكرّر')$q$, fa), 'مستعمل', 'رقمٌ مكرَّر مرفوض');
  perform _refuses(format($q$select ledger_add_account(%L, '1110', '11101', 'تحت حسابٍ يُقيَّد عليه')$q$, fa), 'تحت حسابٍ يُقيَّد عليه', 'ولا تُضاف حساباتٌ تحت حسابٍ يُقيَّد عليه');
  perform _refuses(format($q$select ledger_add_account(%L, '11', '2150', 'رقمٌ من فرعٍ آخر')$q$, fa), 'يبدأ برقم أبيه', 'ورقمٌ لا يبدأ برقم أبيه مرفوض');
  perform _refuses(format($q$select ledger_add_account(%L, '99', '9910', 'أبٌ مجهول')$q$, fa), 'الحساب الأب غير موجود', 'وأبٌ مجهول مرفوض');
  perform _refuses(format($q$select ledger_add_account(%L, '11', '1150', '   ')$q$, fa), 'اسم الحساب', 'واسمٌ فارغ مرفوض');
  perform _refuses(format($q$select ledger_add_account(%L, '11', '1160', 'عملة', null, 'XXX')$q$, fa), 'عملة غير معروفة', 'وعملةٌ مجهولة مرفوضة');
  perform _refuses(format($q$select ledger_add_account(%L, '11', '1160', 'مزوّد', null, null, 'Bad Name')$q$, fa), 'مزوّدٌ غير صالح', 'ومزوّدٌ باسمٍ غير صالح مرفوض');
  u := ledger_add_account(fa, '11', '1150', 'حساب بالدولار', 'USD account', 'USD', 'bank');
  perform _post_refused('حسابٌ بالدولار لا يقبل جنيهاً', 'بعملة USD', fa, current_date - 1,
    jsonb_build_array(_l('1150','D','SDG',100000), _l('5110','C','SDG',100000)), 'k-a-w-02', 1000);
  perform ledger_post(fa, current_date - 1, 'دولار', jsonb_build_array(_l('1150','D','USD',100), _l('5110','C','USD',100)), 'k-a-w-03');
  perform _pass('ويقبل الدولار');

  perform _act_as('b2000000-0000-0000-0000-0000000000b2');
  perform _refuses(format($q$select ledger_add_account(%L, '11', '1170', 'في دفتر غيري')$q$, fa), 'ليس هذا دفترك', 'ولا يضيف حساباً في دفتر غيره');
  perform _refuses(format($q$select ledger_post(%L, current_date, 'x', %L::jsonb, 'k-b-x-0001')$q$, fa,
      jsonb_build_array(_l('5110','D','USD',1), _l('1110','C','USD',1))::text), 'ليس هذا دفترك', 'ولا يقيّد في دفتر غيره');
end $$;

\echo ''
\echo '=========================================================================='
\echo 'ي) لا تعديل ولا حذف، حتى على مدير القاعدة'
\echo '=========================================================================='
reset role;
do $$
declare fa uuid := _bk('A_farm'); w uuid;
begin
  perform _refuses($q$update journal_lines set amount_minor = amount_minor + 1$q$, 'لا يُعدَّل', 'لا تعديل في السطور');
  perform _refuses($q$update journal_lines set base_minor = 1$q$, 'لا يُعدَّل', 'ولا في المعادل بالدولار');
  perform _refuses($q$delete from journal_lines$q$, 'لا يُعدَّل', 'ولا حذف سطور');
  perform _refuses($q$update journal_entries set memo = 'x'$q$, 'لا يُعدَّل', 'ولا تعديل في القيود');
  perform _refuses($q$update journal_entries set entry_date = entry_date - 1$q$, 'لا يُعدَّل', 'ولا في تواريخها');
  perform _refuses($q$delete from journal_entries$q$, 'لا يُعدَّل', 'ولا حذف قيود');
  perform _refuses($q$truncate journal_lines$q$, 'لا يُعدَّل', 'ولا TRUNCATE للسطور');
  perform _refuses($q$truncate journal_entries, journal_lines$q$, 'لا يُعدَّل', 'ولا للقيود');
  perform _refuses($q$truncate ledger_accounts, journal_lines, journal_entries, ledger_books$q$, 'لا يُعدَّل', 'ولا للحسابات والدفاتر');
  perform _refuses($q$delete from ledger_accounts$q$, 'تُوقَف', 'الحسابات لا تُحذف');
  perform _refuses($q$update ledger_accounts set code = code || '9'$q$, 'لا يتغيّر من الحساب', 'ورقم الحساب لا يتغيّر');
  perform _refuses($q$update ledger_accounts set type = 'revenue' where code = '5110'$q$, 'لا يتغيّر من الحساب', 'ولا نوعه');
  perform _refuses($q$update ledger_accounts set postable = false where code = '5110'$q$, 'لا يتغيّر من الحساب', 'ولا كونه يُقيَّد عليه');
  perform _refuses($q$update ledger_accounts set active = false where system_key = 'rounding'$q$, 'حسابٌ نظاميّ', 'والحساب النظاميّ لا يُوقَف');
  update ledger_accounts set name_ar = 'بنكك (الرئيسيّة)' where code = '1140' and book_id = fa;
  perform _pass('أمّا الاسم فيتغيّر');
  update ledger_accounts set active = false where code = '1140' and book_id = fa;
  perform _eq((select active from ledger_accounts where code = '1140' and book_id = fa), false, 'والحساب غير النظاميّ يُوقَف');
end $$;

\echo ''
\echo '=========================================================================='
\echo 'ك) الإدخال المباشر لا يتجاوز الحرّاس'
\echo '=========================================================================='
do $$
declare
  fa uuid := _bk('A_farm'); fb uuid := _bk('B_farm'); e uuid;
  a5110 uuid := (select id from ledger_accounts where book_id = _bk('A_farm') and code = '5110');
  a1110 uuid := (select id from ledger_accounts where book_id = _bk('A_farm') and code = '1110');
  a1140 uuid := (select id from ledger_accounts where book_id = _bk('A_farm') and code = '1140');
  a1150 uuid := (select id from ledger_accounts where book_id = _bk('A_farm') and code = '1150');
  g5 uuid := (select id from ledger_accounts where book_id = _bk('A_farm') and code = '5');
  b1110 uuid := (select id from ledger_accounts where book_id = _bk('B_farm') and code = '1110');
  e1 uuid := _bk('E1');
  rev uuid := (select id from journal_entries where reversal_of = _bk('E1'));
  n0 int := (select count(*) from journal_entries);
begin
  -- متوازنٌ مباشرةً: يُقبل (ويُرجَع عنه، فلا يبقى في القاعدة)
  e := gen_random_uuid();
  begin
    execute format($q$
      insert into journal_entries (id, book_id, entry_date, idempotency_key, content_hash) values (%L, %L, current_date, 'raw-good-001', repeat('a', 64));
      insert into journal_lines (entry_id, book_id, line_no, account_id, side, currency, amount_minor, base_minor) values
        (%L, %L, 1, %L, 'D', 'USD', 500, 500), (%L, %L, 2, %L, 'C', 'USD', 500, 500);
      set constraints all immediate;$q$, e, fa, e, fa, a5110, e, fa, a1110);
    perform _pass('إدخالٌ مباشرٌ متوازن يُقبل (ضابط الفحص)');
    raise exception 'rollback-control';
  exception when others then
    if sqlerrm <> 'rollback-control' then perform _fail('الضابط', sqlerrm); end if;
  end;

  e := gen_random_uuid();
  perform _refuses(format($q$
      insert into journal_entries (id, book_id, entry_date, idempotency_key, content_hash) values (%L, %L, current_date, 'raw-unbal-01', repeat('a', 64));
      insert into journal_lines (entry_id, book_id, line_no, account_id, side, currency, amount_minor, base_minor) values
        (%L, %L, 1, %L, 'D', 'USD', 500, 500), (%L, %L, 2, %L, 'C', 'USD', 400, 400);
      set constraints all immediate;$q$, e, fa, e, fa, a5110, e, fa, a1110),
    'غير متوازن', 'قيدٌ غير متوازن لا يُحفظ ولو أُدخل مباشرةً');

  e := gen_random_uuid();
  perform _refuses(format($q$
      insert into journal_entries (id, book_id, entry_date, idempotency_key, content_hash) values (%L, %L, current_date, 'raw-one-0001', repeat('a', 64));
      insert into journal_lines (entry_id, book_id, line_no, account_id, side, currency, amount_minor, base_minor) values
        (%L, %L, 1, %L, 'D', 'USD', 500, 500);
      set constraints all immediate;$q$, e, fa, e, fa, a5110),
    'سطرين', 'ولا قيدٌ بسطرٍ واحد');

  e := gen_random_uuid();
  perform _refuses(format($q$
      insert into journal_entries (id, book_id, entry_date, idempotency_key, content_hash) values (%L, %L, current_date, 'raw-none-001', repeat('a', 64));
      set constraints all immediate;$q$, e, fa),
    'سطرين', 'ولا رأسٌ بلا سطور');

  e := gen_random_uuid();
  perform _refuses(format($q$
      insert into journal_entries (id, book_id, entry_date, idempotency_key, content_hash) values (%L, %L, current_date, 'raw-grp-0001', repeat('a', 64));
      insert into journal_lines (entry_id, book_id, line_no, account_id, side, currency, amount_minor, base_minor) values (%L, %L, 1, %L, 'D', 'USD', 500, 500)$q$, e, fa, e, fa, g5),
    'تجميعيّ', 'ولا سطرٌ على حسابٍ تجميعيّ');

  e := gen_random_uuid();
  perform _refuses(format($q$
      insert into journal_entries (id, book_id, entry_date, idempotency_key, content_hash) values (%L, %L, current_date, 'raw-xbk-0001', repeat('a', 64));
      insert into journal_lines (entry_id, book_id, line_no, account_id, side, currency, amount_minor, base_minor) values (%L, %L, 1, %L, 'D', 'USD', 500, 500)$q$, e, fa, e, fa, b1110),
    'foreign key', 'ولا سطرٌ على حسابٍ من دفترٍ آخر');

  e := gen_random_uuid();
  perform _refuses(format($q$
      insert into journal_entries (id, book_id, entry_date, idempotency_key, content_hash) values (%L, %L, current_date, 'raw-inact-001', repeat('a', 64));
      insert into journal_lines (entry_id, book_id, line_no, account_id, side, currency, amount_minor, base_minor) values (%L, %L, 1, %L, 'D', 'USD', 500, 500)$q$, e, fa, e, fa, a1140),
    'موقوف', 'ولا سطرٌ على حسابٍ موقوف');

  e := gen_random_uuid();
  perform _refuses(format($q$
      insert into journal_entries (id, book_id, entry_date, idempotency_key, content_hash) values (%L, %L, current_date, 'raw-cur-0001', repeat('a', 64));
      insert into journal_lines (entry_id, book_id, line_no, account_id, side, currency, amount_minor, base_minor) values (%L, %L, 1, %L, 'D', 'SDG', 500, 1)$q$, e, fa, e, fa, a1150),
    'بعملة USD', 'ولا بعملةٍ غير عملة الحساب');

  e := gen_random_uuid();
  perform _refuses(format($q$
      insert into journal_entries (id, book_id, entry_date, idempotency_key, content_hash) values (%L, %L, current_date, 'raw-norate-01', repeat('a', 64));
      insert into journal_lines (entry_id, book_id, line_no, account_id, side, currency, amount_minor, base_minor) values (%L, %L, 1, %L, 'D', 'SDG', 100000, 100)$q$, e, fa, e, fa, a5110),
    'بلا سعر صرف', 'ولا جنيهٌ بلا سعر على القيد');

  e := gen_random_uuid();
  perform _refuses(format($q$
      insert into journal_entries (id, book_id, entry_date, idempotency_key, content_hash, fx_rate, fx_source) values (%L, %L, current_date, 'raw-wrongb-01', repeat('a', 64), 1000, 'user');
      insert into journal_lines (entry_id, book_id, line_no, account_id, side, currency, amount_minor, base_minor) values (%L, %L, 1, %L, 'D', 'SDG', 100000, 99)$q$, e, fa, e, fa, a5110),
    'لا يطابق سعر القيد', 'ولا معادلٌ بالدولار مكتوبٌ بيد');

  e := gen_random_uuid();
  perform _refuses(format($q$
      insert into journal_entries (id, book_id, entry_date, idempotency_key, content_hash) values (%L, %L, current_date, 'raw-usdb-0001', repeat('a', 64));
      insert into journal_lines (entry_id, book_id, line_no, account_id, side, currency, amount_minor, base_minor) values (%L, %L, 1, %L, 'D', 'USD', 500, 499)$q$, e, fa, e, fa, a5110),
    'يساوي مبلغه', 'ولا معادلٌ لسطرٍ بالدولار يخالف مبلغه');

  e := gen_random_uuid();
  perform _refuses(format($q$
      insert into journal_entries (id, book_id, entry_date, idempotency_key, content_hash) values (%L, %L, current_date, 'raw-zero-0001', repeat('a', 64));
      insert into journal_lines (entry_id, book_id, line_no, account_id, side, currency, amount_minor, base_minor) values (%L, %L, 1, %L, 'D', 'USD', 0, 0)$q$, e, fa, e, fa, a5110),
    'amount_minor_check', 'ولا مبلغٌ صفر');

  e := gen_random_uuid();
  perform _refuses(format($q$
      insert into journal_entries (id, book_id, entry_date, idempotency_key, content_hash) values (%L, %L, current_date - 15, 'raw-closed-01', repeat('a', 64))$q$, e, fb),
    'مقفلة', 'ولا قيدٌ في فترةٍ مقفلة');

  e := gen_random_uuid();
  perform _refuses(format($q$
      insert into journal_entries (id, book_id, entry_date, idempotency_key, content_hash) values (%L, %L, current_date + 9, 'raw-future-01', repeat('a', 64))$q$, e, fa),
    'في المستقبل', 'ولا قيدٌ بتاريخ المستقبل');

  e := gen_random_uuid();
  perform _refuses(format($q$
      insert into journal_entries (id, book_id, entry_date, idempotency_key, content_hash, reversal_of) values (%L, %L, current_date, 'raw-revrev-01', repeat('a', 64), %L)$q$, e, fa, rev),
    'قيدٌ عاكس', 'ولا عكسٌ لقيدٍ عاكس');

  e := gen_random_uuid();
  perform _refuses(format($q$
      insert into journal_entries (id, book_id, entry_date, idempotency_key, content_hash, reversal_of) values (%L, %L, current_date, 'raw-revtwo-01', repeat('a', 64), %L)$q$, e, fa, e1),
    'reversal_of_key', 'ولا عكسٌ ثانٍ للقيد نفسه');

  e := gen_random_uuid();
  perform _refuses(format($q$
      insert into journal_entries (id, book_id, entry_date, idempotency_key, content_hash) values (%L, %L, current_date, 'k-a-0001', repeat('a', 64))$q$, e, fa),
    'idempotency_key', 'ولا مفتاحٌ مكرَّر في الدفتر');

  perform _refuses(format($q$
      insert into journal_lines (entry_id, book_id, line_no, account_id, side, currency, amount_minor, base_minor) values (%L, %L, 3, %L, 'D', 'USD', 100, 100);
      set constraints all immediate;$q$, e1, fa, a5110),
    'غير متوازن', 'ولا سطرٌ يُضاف إلى قيدٍ قائمٍ فيُخلّ بتوازنه');

  perform _eq((select count(*)::int from journal_entries), n0, 'ولم يبقَ من المرفوض شيء');
end $$;

\echo ''
\echo '=========================================================================='
\echo 'ل) العزل: كلٌّ يرى دفتره، والإدارة دفتر المنصّة وحده، والزائر لا يرى'
\echo '=========================================================================='
set role authenticated;
do $$
declare fa uuid := _bk('A_farm'); ai uuid := _bk('A_inv'); fb uuid := _bk('B_farm'); plat uuid := _bk('PLAT'); e uuid;
begin
  perform _act_as('a1000000-0000-0000-0000-0000000000a1');
  perform _eq((select count(*)::int from journal_entries where book_id not in (fa, ai)), 0, 'أ لا يرى قيداً من خارج دفتريه');
  perform _eq((select count(*)::int from journal_lines where book_id not in (fa, ai)), 0, 'ولا سطراً');
  perform _eq((select count(*)::int from ledger_accounts where book_id not in (fa, ai)), 0, 'ولا حساباً');
  perform _eq((select count(*)::int from ledger_trial_balance(fb)), 0, 'ولا ميزان مراجعة دفترِ غيره');
  perform _eq((select entries from ledger_trial_balance_proof(fb)), 0::bigint, 'ولا إثباته');
  perform _eq((select count(*)::int from ledger_account_statement(fb, (select id from ledger_accounts where book_id = fb and code = '1110'))), 0, 'ولا كشف حسابٍ فيه');
  perform _refuses(format($q$select ledger_post(%L, current_date, 'x', %L::jsonb, 'k-a-plat-01')$q$, plat,
      jsonb_build_array(_l('6110','D','USD',1), _l('1110','C','USD',1))::text), 'ليس هذا دفترك', 'وغير الإدارة لا يقيّد في دفتر المنصّة');
  perform _refuses(format($q$select ledger_post(%L, current_date - 1, 'x', %L::jsonb, 'k-a-inact-01')$q$, fa,
      jsonb_build_array(_l('1140','D','USD',1), _l('1110','C','USD',1))::text), 'موقوف', 'ولا على حسابٍ موقوف');

  perform _act_as('b2000000-0000-0000-0000-0000000000b2');
  perform _eq((select count(*)::int from journal_entries where book_id in (fa, ai)), 0, 'ب لا يرى قيود أ');
  perform _eq((select count(*)::int from journal_lines where book_id in (fa, ai)), 0, 'ولا سطورها');
  perform _eq((select count(*)::int from ledger_accounts where book_id in (fa, ai)), 0, 'ولا حساباتها');
  perform _eq((select count(*)::int from ledger_books where id in (fa, ai)), 0, 'ولا دفاترها');

  perform _act_as('ad000000-0000-0000-0000-0000000000ad');
  perform _eq((select count(*)::int from ledger_books), 1, 'المدير لا يرى إلا دفتر المنصّة');
  perform _eq((select count(*)::int from journal_entries where book_id in (fa, ai, fb)), 0, 'ولا قيود الناس');
  e := ledger_post(plat, current_date - 1, 'رسم معاينة', jsonb_build_array(_k('cash_on_hand','D','USD',5000), _k('fee_inspection','C','USD',5000)), 'k-plat-0001');
  perform _eq((select count(*)::int from journal_entries where book_id = plat), 1, 'ويقيّد في دفتر المنصّة');
  perform _refuses(format($q$select ledger_post(%L, current_date, 'x', %L::jsonb, 'k-adm-a-0001')$q$, fa,
      jsonb_build_array(_l('5110','D','USD',1), _l('1110','C','USD',1))::text), 'ليس هذا دفترك', 'لا في دفتر مزارع');
  perform _refuses(format($q$select ledger_reverse(%L, 'x')$q$, _bk('E1')), 'ليس هذا قيدك', 'ولا يعكس قيده');
  perform _eq(ledger_reverse(e, 'تجربة')  is not null, true, 'لكنّه يعكس قيدَ المنصّة');
end $$;

reset role;
set role anon;
do $$
begin
  perform _refuses($q$select * from ledger_books$q$, 'permission denied', 'الزائر لا يقرأ الدفاتر');
  perform _refuses($q$select * from journal_lines$q$, 'permission denied', 'ولا السطور');
  perform _refuses($q$select * from ledger_chart_templates$q$, 'permission denied', 'ولا القوالب');
  perform _refuses($q$select ledger_open_book('farm')$q$, 'permission denied', 'ولا يفتح دفتراً');
  perform _refuses($q$select ledger_to_base(100, 1000)$q$, 'permission denied', 'ولا يحسب');
end $$;
reset role;

set role authenticated;
do $$
declare fa uuid := _bk('A_farm');
begin
  perform _act_as('a1000000-0000-0000-0000-0000000000a1');
  perform _refuses(format($q$insert into journal_entries (book_id, entry_date, idempotency_key, content_hash) values (%L, current_date, 'direct-0001', repeat('a',64))$q$, fa), 'permission denied', 'لا إدراج مباشر في القيود');
  perform _refuses(format($q$insert into journal_lines (entry_id, book_id, line_no, account_id, side, currency, amount_minor, base_minor) values (gen_random_uuid(), %L, 1, gen_random_uuid(), 'D', 'USD', 1, 1)$q$, fa), 'permission denied', 'ولا في السطور');
  perform _refuses(format($q$insert into ledger_accounts (book_id, code, name_ar, type, postable) values (%L, '9999', 'x', 'asset', true)$q$, fa), 'permission denied', 'ولا في الحسابات');
  perform _refuses($q$insert into ledger_books (owner_id, kind) values ('a1000000-0000-0000-0000-0000000000a1', 'farm')$q$, 'permission denied', 'ولا في الدفاتر');
  perform _refuses(format($q$update ledger_books set closed_through = current_date where id = %L$q$, fa), 'permission denied', 'ولا تعديل إقفال');
  perform _refuses($q$delete from journal_entries$q$, 'permission denied', 'ولا حذف');
  perform _refuses($q$update journal_lines set amount_minor = 1$q$, 'permission denied', 'ولا تعديل');
  perform _eq((select count(*)::int from ledger_chart_templates) > 0, true, 'لكنّه يقرأ القوالب');
  perform _eq((select count(*)::int from ledger_currencies), 3, 'والعملات');
  perform _refuses($q$select ledger_post_for(gen_random_uuid(), current_date, 'x', '[]'::jsonb, 'k-svc-denied')$q$, 'permission denied', 'ودالّة الخدمة ليست له');
  perform _refuses($q$select ledger_open_book_for('a1000000-0000-0000-0000-0000000000a1', 'farm')$q$, 'permission denied', 'ولا فتح دفترٍ لغيره');
  perform _refuses($q$select ledger_reverse_for(gen_random_uuid(), 'x')$q$, 'permission denied', 'ولا عكسٌ بمفتاح الخدمة');
  perform _refuses($q$select _ledger_post(gen_random_uuid(), current_date, 'x', '[]'::jsonb, 'k-internal', null, null, null, null, null)$q$, 'permission denied', 'ولا الدالّة الداخليّة');
  perform _refuses($q$select _ledger_open_book(null, 'platform')$q$, 'permission denied', 'ولا فتح الدفتر الداخلي');
end $$;
reset role;

\echo ''
\echo '=========================================================================='
\echo 'م) ميزان المراجعة وكشف الحساب من سطورٍ حقيقيّة (دفتر المستثمر)'
\echo '=========================================================================='
set role authenticated;
do $$
declare ai uuid := _bk('A_inv'); acc uuid;
begin
  perform _act_as('a1000000-0000-0000-0000-0000000000a1');
  perform ledger_post(ai, current_date - 30, 'رأس المال',      jsonb_build_array(_l('1120','D','USD',100000), _l('3110','C','USD',100000)), 'inv-a-0001');
  perform ledger_post(ai, current_date - 20, 'توظيف في موسم',  jsonb_build_array(_l('1430','D','USD',60000),  _l('1120','C','USD',60000)),  'inv-a-0002');
  perform ledger_post(ai, current_date - 10, 'حصاد',          jsonb_build_array(_l('1120','D','USD',90000), _l('1430','C','USD',60000), _l('4150','C','USD',30000)), 'inv-a-0003');
  perform ledger_post(ai, current_date - 5,  'رسم المنصّة',   jsonb_build_array(_l('6110','D','USD',2000),  _l('1120','C','USD',2000)),   'inv-a-0004');

  perform _eq((select string_agg(code, ',' order by code) from ledger_trial_balance(ai)), '1120,1430,3110,4150,6110', 'الميزان يعرض الحسابات ذات الحركة مرتّبةً');
  perform _eq((select debit_total || '/' || credit_total || '/' || debit_balance || '/' || credit_balance from ledger_trial_balance(ai) where code = '1120'),
              '190000/62000/128000/0', 'البنك: مدين ١٩٠٬٠٠٠، دائن ٦٢٬٠٠٠، رصيده مدين ١٢٨٬٠٠٠');
  perform _eq((select debit_balance || '/' || credit_balance from ledger_trial_balance(ai) where code = '1430'), '0/0', 'والتوظيف رُدّ فصار صفراً');
  perform _eq((select debit_balance || '/' || credit_balance from ledger_trial_balance(ai) where code = '3110'), '0/100000', 'ورأس المال رصيده دائن');
  perform _eq((select sum(debit_total) from ledger_trial_balance(ai)), 252000::numeric, 'مجموع المدين ٢٥٢٬٠٠٠');
  perform _eq((select sum(credit_total) from ledger_trial_balance(ai)), 252000::numeric, 'ومجموع الدائن مثله');
  perform _eq((select sum(debit_balance) from ledger_trial_balance(ai)), (select sum(credit_balance) from ledger_trial_balance(ai)), 'وأرصدة المدين = أرصدة الدائن');

  perform _eq((select entries || '/' || lines || '/' || balanced || '/' || assets || '/' || liabilities || '/' || equity || '/' || net_income || '/' || equation_holds
                 from ledger_trial_balance_proof(ai)), '4/9/true/128000/0/100000/28000/true', 'إثبات الميزان: متوازن، والأصول = الالتزامات + الملكيّة + صافي الدخل');
  perform _eq((select assets || '/' || equity || '/' || net_income || '/' || equation_holds from ledger_trial_balance_proof(ai, current_date - 20)), '100000/100000/0/true', 'والميزان إلى تاريخٍ معيّن');
  perform _eq((select entries || '/' || assets from ledger_trial_balance_proof(ai, current_date - 25)), '1/100000', 'وإلى تاريخٍ أبكر');
  perform _eq((select count(*)::int from ledger_trial_balance(ai, current_date - 40)), 0, 'وقبل أول حركة لا شيء');

  select id into acc from ledger_accounts where book_id = ai and code = '1120';
  perform _eq((select array_agg(running_base order by entry_date, entry_no) from ledger_account_statement(ai, acc)),
              array[100000::bigint, 40000, 130000, 128000], 'كشف حساب البنك برصيده الجاري');
  perform _eq((select array_agg(signed_base order by entry_date, entry_no) from ledger_account_statement(ai, acc)),
              array[100000::bigint, -60000, 90000, -2000], 'وحركاته بإشارتها (مدين موجب لحساب أصل)');
  perform _eq((select row_type || '/' || running_base from ledger_account_statement(ai, acc, current_date - 15) where row_type = 'opening'), 'opening/40000', 'ورصيد أول الفترة يسبق الحركات');
  perform _eq((select array_agg(running_base order by entry_date, entry_no) filter (where row_type = 'line') from ledger_account_statement(ai, acc, current_date - 15)),
              array[130000::bigint, 128000], 'وحركات الفترة تتابع منه');
  perform _eq((select count(*)::int from ledger_account_statement(ai, acc, null, current_date - 15)), 2, 'وإلى تاريخ');
  select id into acc from ledger_accounts where book_id = ai and code = '3110';
  perform _eq((select running_base from ledger_account_statement(ai, acc)), 100000::bigint, 'وحسابٌ دائن الطبع يظهر رصيده موجباً');
end $$;

do $$
declare fa uuid := _bk('A_farm'); acc uuid; usd bigint; last_usd bigint;
begin
  perform _act_as('a1000000-0000-0000-0000-0000000000a1');
  select id into acc from ledger_accounts where book_id = fa and code = '1110';
  select sum(case l.side when 'D' then l.amount_minor else -l.amount_minor end) into usd
    from journal_lines l where l.account_id = acc and l.currency = 'USD';
  select running_native into last_usd from ledger_account_statement(fa, acc)
   where currency = 'USD' order by entry_date desc, entry_no desc, line_no desc limit 1;
  perform _eq(last_usd, usd, 'الرصيد الجاري بعملة السطر لا يخلط الدولار بالجنيه');
  perform _eq((select count(distinct currency)::int from ledger_account_statement(fa, acc) where row_type = 'line'), 2, 'ويحمل الحسابُ الواحد دولاراً وجنيهاً');
end $$;
reset role;

\echo ''
\echo '=========================================================================='
\echo 'ن) دوالّ مفتاح الخدمة: القيود الآليّة بمصدرها وربطها'
\echo '=========================================================================='
insert into auth.users (id) values ('c3000000-0000-0000-0000-0000000000c3') on conflict (id) do nothing;
set role service_role;
do $$
declare fb uuid := _bk('B_farm'); plat uuid := _bk('PLAT'); e uuid; e2 uuid; src uuid := gen_random_uuid(); lnk uuid := gen_random_uuid(); c uuid; r uuid;
begin
  perform _act_as(null);
  e := ledger_post_for(fb, current_date - 1, 'من قيد موسم', jsonb_build_array(_l('5110','D','USD',700), _l('1110','C','USD',700)), 'svc-key-0001', null, 'season_entry', src);
  insert into _ids values ('SVC1', e), ('SVC_SRC', src);
  e2 := ledger_post_for(fb, current_date - 1, 'مرتبط', jsonb_build_array(_l('5110','D','USD',800), _l('1110','C','USD',800)), 'svc-key-0002', null, 'agreement', gen_random_uuid(), lnk);
  insert into _ids values ('SVC2', e2), ('SVC_LNK', lnk);
  perform _eq(ledger_post_for(fb, current_date - 1, 'من قيد موسم', jsonb_build_array(_l('5110','D','USD',700), _l('1110','C','USD',700)), 'svc-key-0001', null, 'season_entry', src),
              e, 'وإعادة الإرسال بمفتاحه تُرجع القيد نفسه');
  perform _refuses(format($q$select ledger_post_for(%L, current_date - 1, 'من قيد موسم', %L::jsonb, 'svc-key-0001', null, 'season_entry', %L)$q$,
      fb, jsonb_build_array(_l('5110','D','USD',701), _l('1110','C','USD',701))::text, src),
    'استُعمل لقيدٍ مختلف', 'والمحتوى المختلف يُرفض');
  perform _refuses(format($q$select ledger_post_for(%L, current_date - 1, 'x', %L::jsonb, 'svc-key-0003')$q$, fb,
      jsonb_build_array(_l('5110','D','USD',5), _l('1110','C','USD',4))::text), 'القيد غير متوازن', 'ومفتاح الخدمة لا يتجاوز التوازن');

  r := ledger_reverse_for(e, 'تصحيح آليّ', null, null, null);
  insert into _ids values ('SVC_REV', r);

  c := ledger_open_book_for('c3000000-0000-0000-0000-0000000000c3', 'farm');
  perform _eq(ledger_open_book_for('c3000000-0000-0000-0000-0000000000c3', 'farm'), c, 'يفتح دفتراً لمستخدم، ومرّةً واحدة');
  perform _eq(ledger_open_book_for(null, 'platform'), plat, 'ودفتر المنصّة هو نفسه');
  perform _refuses($q$select ledger_open_book_for('c3000000-0000-0000-0000-0000000000c3', 'platform')$q$, 'بلا مالك', 'ولا دفتر منصّةٍ بمالك');
  perform _refuses($q$select ledger_open_book_for(null, 'farm')$q$, 'بلا مالك', 'ولا دفتر مزرعةٍ بلا مالك');
  perform _refuses($q$select ledger_close_through(gen_random_uuid(), current_date - 1)$q$, 'permission denied', 'والإقفال ليس للخدمة');
  perform _refuses($q$select ledger_post(gen_random_uuid(), current_date, 'x', '[]'::jsonb, 'k-svc-denied')$q$, 'permission denied', 'ولا النشر اليدويّ');
  perform _refuses($q$select ledger_open_book('farm')$q$, 'permission denied', 'ولا فتح الدفتر بلا مستخدم');
  perform _refuses($q$select ledger_integrity()$q$, 'permission denied', 'ولا فحص السلامة');
  perform _eq((select ledger_to_base(30000000, 1000)), 30000::bigint, 'وتحسب التحويل');
end $$;
reset role;
do $$
begin
  perform _eq((select source_type || '|' || (source_id = _bk('SVC_SRC'))::text || '|' || coalesce(created_by::text, 'null') from journal_entries where id = _bk('SVC1')),
              'season_entry|true|null', 'مصدر القيد الآليّ محفوظ');
  perform _eq((select link_id from journal_entries where id = _bk('SVC2')), _bk('SVC_LNK'), 'ورابط القيد المتقابل');
  perform _eq((select reversal_of from journal_entries where id = _bk('SVC_REV')), _bk('SVC1'), 'والعكس بمفتاح الخدمة');
end $$;

\echo ''
\echo '=========================================================================='
\echo 'س) التحويل بين العملات: يطابق المرجع حالةً حالة (والمكتبة في TypeScript تطابقه)'
\echo '=========================================================================='
\set fx `cat __FIXTURES__`
select count(*) filter (where ledger_to_base(x.minor, x.rate::numeric) <> x.expected) as bad, count(*) as n
  from jsonb_to_recordset((:'fx')::jsonb -> 'toBase') as x(minor bigint, rate text, expected bigint) \gset
select _eq(:bad::int, 0, 'مطابقة ' || :n || ' حالة من المرجع') \g /dev/null
select _eq(:n::int >= 200, true, 'والمرجع واسع') \g /dev/null
do $$
begin
  perform _refuses($q$select ledger_to_base(-1, 1000)$q$, 'مبلغٌ غير صالح', 'مبلغٌ سالب مرفوض');
  perform _refuses($q$select ledger_to_base(100, 0)$q$, 'سعر صرفٍ غير صالح', 'وسعرٌ صفر');
  perform _refuses($q$select ledger_to_base(100, null)$q$, 'سعر صرفٍ غير صالح', 'وسعرٌ فارغ');
  perform _eq(ledger_to_base(1, 2), 1::bigint, 'نصفٌ يُقرَّب للأعلى (١ ÷ ٢)');
  perform _eq(ledger_to_base(3, 2), 2::bigint, 'وواحدٌ ونصف إلى اثنين');
  perform _eq(ledger_to_base(100, 2, 2, 0), 1::bigint, 'وبخانتين إلى صفر خانة');
  perform _eq(ledger_to_base(9999999999999, 1), 9999999999999::bigint, 'وأكبر مبلغٍ مسموح بسعر واحد');
end $$;

\echo ''
\echo '=========================================================================='
\echo 'ع) سلامة الدفاتر: للإدارة، وتكشف التلف إن وقع'
\echo '=========================================================================='
set role authenticated;
do $$
declare ai uuid := _bk('A_inv');
begin
  perform _act_as('a1000000-0000-0000-0000-0000000000a1');
  perform _refuses($q$select * from ledger_integrity()$q$, 'للإدارة وحدها', 'غير المدير لا يفحص');
  perform _act_as('ad000000-0000-0000-0000-0000000000ad');
  perform _eq((select count(*)::int from ledger_integrity()), 5, 'المدير يرى سلامة الدفاتر الخمسة (مزرعتان ومستثمر ومزرعة ثالثة والمنصّة)');
  perform _eq((select bool_and(ok) from ledger_integrity()), true, 'وكلّها سليمة');
  perform _eq((select bool_and(debit_total = credit_total) from ledger_integrity()), true, 'والمدين يساوي الدائن في كلٍّ');
  perform _eq((select entries || '/' || lines from ledger_integrity() where book_id = ai), '4/9', 'وأعداد دفتر المستثمر');
  perform _eq((select count(*)::int from ledger_integrity() where kind = 'platform'), 1, 'والمنصّة بينها');
end $$;
reset role;

-- ثم نُفسد قيداً عمداً (مدير القاعدة مع إيقاف الزنادات) داخل معاملةٍ نتراجع عنها، فنرى أنّ الفحص يكشفه.
begin;
set local session_replication_role = replica;
insert into journal_entries (id, book_id, entry_date, idempotency_key, content_hash)
  values ('f0000000-0000-0000-0000-000000000001', (select id from _ids where name = 'A_farm'), current_date, 'corrupt-0001', repeat('b', 64));
insert into journal_lines (entry_id, book_id, line_no, account_id, side, currency, amount_minor, base_minor)
  select 'f0000000-0000-0000-0000-000000000001', l.id, 1, a.id, 'D', 'USD', 700, 700
    from ledger_books l join ledger_accounts a on a.book_id = l.id and a.code = '5110'
   where l.id = (select id from _ids where name = 'A_farm');
set local session_replication_role = origin;
do $$
declare fa uuid := _bk('A_farm');
begin
  perform _act_as('ad000000-0000-0000-0000-0000000000ad');
  perform _eq((select ok from ledger_integrity() where book_id = fa), false, 'التلف يُكشف');
  perform _eq((select unbalanced_entries from ledger_integrity() where book_id = fa), 1::bigint, 'قيدٌ واحد غير متوازن');
  perform _eq((select entries_under_two_lines from ledger_integrity() where book_id = fa), 1::bigint, 'وقيدٌ بسطرٍ واحد');
  perform _eq((select debit_total - credit_total from ledger_integrity() where book_id = fa), 700::bigint, 'وفرقه ٧٠٠');
  perform _eq((select count(*)::int from ledger_integrity() where ok), 4, 'والدفاتر الأخرى سليمة');
end $$;
-- The rollback would take the failures above with it: the count is carried across it.
select fails as fails_inside from _score \gset
rollback;
update _score set fails = :fails_inside;

do $$
begin
  perform _act_as('ad000000-0000-0000-0000-0000000000ad');
  perform _eq((select count(*)::int from journal_entries where idempotency_key = 'corrupt-0001'), 0, 'والتلف التجريبيّ لم يبقَ');
  perform _eq((select bool_and(ok) from ledger_integrity()), true, 'والدفاتر سليمة بعده');
  perform _act_as(null);
end $$;

do $$
declare n integer;
begin
  select fails into n from _score;
  if n > 0 then raise exception '% فحصاً فشل', n; end if;
end $$;
\echo ''
\echo 'OK'
