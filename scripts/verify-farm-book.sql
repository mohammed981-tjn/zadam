-- بوّابةُ دفتر المزرعة (البند ١٨٧، المرحلة ٢).
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

-- The farm book's net balance (debit minus credit, in minor units of the dollar) of one account, for one owner.
create or replace function _net(p_owner uuid, p_key text, p_season uuid default null) returns bigint language sql stable as $$
  select coalesce(sum(case l.side when 'D' then l.base_minor else -l.base_minor end), 0)::bigint
    from journal_lines l
    join ledger_accounts a on a.id = l.account_id and a.book_id = l.book_id
    join ledger_books b on b.id = l.book_id
   where b.owner_id = p_owner and b.kind = 'farm' and a.system_key = p_key
     and (p_season is null or l.season_id = p_season) $$;
create or replace function _postings(p_row uuid) returns integer language sql stable as $$
  select count(*)::int from journal_entries where source_type = 'season_entry' and source_id = p_row $$;
create or replace function _entry_of(p_row uuid) returns uuid language sql stable as $$
  select id from journal_entries where source_type = 'season_entry' and source_id = p_row order by entry_no desc limit 1 $$;

create table if not exists _ids (name text primary key, id uuid);
grant all on _ids to anon, authenticated, service_role;

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
  ('51000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-0000000000a1', 'قمح أ',  'wheat', 'x', 'canal', 10, current_date - 60),
  ('52000000-0000-0000-0000-000000000002', 'a1000000-0000-0000-0000-0000000000a1', 'ذرة',    'maize', 'x', 'canal', 10, current_date - 60),
  ('53000000-0000-0000-0000-000000000003', 'a1000000-0000-0000-0000-0000000000a1', 'فول',    'faba',  'x', 'canal', 10, current_date - 60),
  ('54000000-0000-0000-0000-000000000004', 'b2000000-0000-0000-0000-0000000000b2', 'قطن',    'cotton','x', 'canal', 10, current_date - 60);

grant usage on schema public, auth to anon, authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated, service_role;
grant select, update on _score to anon, authenticated, service_role;
grant select, update on _who to anon, authenticated, service_role;
grant execute on function _fail(text,text), _pass(text), _act_as(uuid), _eq(anyelement,anyelement,text),
  _refuses(text,text,text), _net(uuid,text,uuid), _postings(uuid), _entry_of(uuid) to anon, authenticated, service_role;

\echo ''
\echo '=========================================================================='
\echo 'أ) مصروف بالدولار والموسم جارٍ: قيدٌ بأربعة سطور، ورسملة'
\echo '=========================================================================='
insert into ledger_entries (id, season_id, category, amount, description, entry_date, created_by) values
  ('e0000000-0000-0000-0000-000000000001', '51000000-0000-0000-0000-000000000001', 'seeds', 300.00, 'كيس', current_date - 2, 'a1000000-0000-0000-0000-0000000000a1');
do $$
declare a uuid := 'a1000000-0000-0000-0000-0000000000a1'; s1 uuid := '51000000-0000-0000-0000-000000000001'; e uuid := _entry_of('e0000000-0000-0000-0000-000000000001');
begin
  perform _eq((select count(*)::int from ledger_books where owner_id = a and kind = 'farm'), 1, 'فُتح دفتر المزرعة لصاحب الموسم عند أوّل سطر');
  perform _eq((select count(*)::int from ledger_accounts ac join ledger_books b on b.id = ac.book_id where b.owner_id = a), 64, 'بشجرته');
  perform _eq(_postings('e0000000-0000-0000-0000-000000000001'), 1, 'سطر الدفتر البسيط أنتج قيداً واحداً');
  perform _eq((select source_type || '|' || created_by::text from journal_entries where id = e), 'season_entry|a1000000-0000-0000-0000-0000000000a1', 'بمصدره وبمن كتبه');
  perform _eq((select count(*)::int from journal_lines where entry_id = e), 4, 'بأربعة سطور');
  perform _eq(_net(a, 'cost_seeds', s1), 30000::bigint, 'البذور مدينة ٣٠٠$ (بطبيعتها)');
  perform _eq(_net(a, 'cash_on_hand'), -30000::bigint, 'والنقد دائن');
  perform _eq(_net(a, 'crops_in_progress', s1), 30000::bigint, 'والمحاصيل القائمة مدينة بالتكلفة');
  perform _eq(_net(a, 'costs_capitalised', s1), -30000::bigint, 'ومقابلها ٥٩٠٠ دائن');
  perform _eq((select memo from journal_entries where id = e), 'بذور — قمح أ: كيس', 'والوصف بالبند والموسم والملاحظة');
  perform _eq((select count(*)::int from journal_lines where entry_id = e and season_id is null), 0, 'وبُعد الموسم على كلّ سطر');
  perform _eq((select date from (select entry_date as date from journal_entries where id = e) q), current_date - 2, 'وبتاريخ السطر');
  perform _eq(_farm_mirror_post('e0000000-0000-0000-0000-000000000001', 'season_entry:e0000000-0000-0000-0000-000000000001', a), e, 'وإعادة الترحيل بمفتاحه ومحتواه تُرجع القيد نفسه');
  perform _eq(_postings('e0000000-0000-0000-0000-000000000001'), 1, 'ولا تكرّره');
end $$;

\echo ''
\echo '=========================================================================='
\echo 'ب) الإيراد، وجهات الدفع، والكسور'
\echo '=========================================================================='
insert into ledger_entries (id, season_id, category, amount, entry_date, created_by, paid_from) values
  ('e0000000-0000-0000-0000-000000000002', '51000000-0000-0000-0000-000000000001', 'revenue', 1000.50, current_date - 1, 'a1000000-0000-0000-0000-0000000000a1', 'cash'),
  ('e0000000-0000-0000-0000-000000000003', '51000000-0000-0000-0000-000000000001', 'labour',  100,    current_date - 1, 'a1000000-0000-0000-0000-0000000000a1', 'bank'),
  ('e0000000-0000-0000-0000-000000000004', '51000000-0000-0000-0000-000000000001', 'pesticide', 50,   current_date - 1, 'a1000000-0000-0000-0000-0000000000a1', 'credit'),
  ('e0000000-0000-0000-0000-000000000005', '51000000-0000-0000-0000-000000000001', 'transport', 20,  current_date - 1, 'a1000000-0000-0000-0000-0000000000a1', 'wallet'),
  ('e0000000-0000-0000-0000-000000000006', '51000000-0000-0000-0000-000000000001', 'revenue', 75,    current_date - 1, 'a1000000-0000-0000-0000-0000000000a1', 'credit'),
  ('e0000000-0000-0000-0000-000000000007', '51000000-0000-0000-0000-000000000001', 'other',   12.345, current_date - 1, 'a1000000-0000-0000-0000-0000000000a1', 'cash');
do $$
declare a uuid := 'a1000000-0000-0000-0000-0000000000a1'; s1 uuid := '51000000-0000-0000-0000-000000000001';
begin
  perform _eq((select count(*)::int from journal_lines where entry_id = _entry_of('e0000000-0000-0000-0000-000000000002')), 2, 'الإيراد قيدٌ بسطرين (بلا رسملة)');
  perform _eq(_net(a, 'sales_crops', s1), -(100050 + 7500)::bigint, 'مبيعات المحاصيل دائنة ١٠٧٥٫٥٠$');
  perform _eq(_net(a, 'bank'), -10000::bigint, 'من البنك');
  perform _eq(_net(a, 'payables_suppliers'), -5000::bigint, 'بالأجل: موردون دائنون');
  perform _eq(_net(a, 'wallet'), -2000::bigint, 'ومن المحفظة');
  perform _eq(_net(a, 'receivable_buyers'), 7500::bigint, 'وإيرادٌ بالأجل: مشترون مدينون');
  perform _eq(_net(a, 'cash_on_hand'), -30000::bigint + 100050 - 1235, 'والنقد يجمع الكلّ');
  perform _eq((select amount from ledger_entries where id = 'e0000000-0000-0000-0000-000000000007'), 12.35, '١٢٫٣٤٥ يُحفظ ١٢٫٣٥ (يقرَّب نصفاً للأعلى) فيتّفق الدفتران');
  perform _eq(_net(a, 'cost_other', s1), 1235::bigint, 'وفي دفتر المزرعة ١٢٫٣٥');
  perform _eq((select balanced from ledger_trial_balance_proof((select id from ledger_books where owner_id = a and kind = 'farm'))), true, 'ودفتر المزرعة متوازن');
  perform _eq((select equation_holds from ledger_trial_balance_proof((select id from ledger_books where owner_id = a and kind = 'farm'))), true, 'والأصول = الالتزامات + الملكيّة + صافي الدخل');
end $$;

insert into ledger_entries (id, season_id, category, amount, entry_date, created_by) values
  ('e0000000-0000-0000-0000-000000000008', '51000000-0000-0000-0000-000000000001', 'other', 0, current_date - 1, 'a1000000-0000-0000-0000-0000000000a1');
do $$
begin
  perform _eq(_postings('e0000000-0000-0000-0000-000000000008'), 0, 'مبلغٌ صفر لا قيد له');
end $$;

\echo ''
\echo '=========================================================================='
\echo 'ج) الجنيه: المبلغ الأصلي، والسعر، والدولار المحسوب'
\echo '=========================================================================='
insert into market_quotes (kind, market, crop, market_date, buy, sell, source_url, status, method) values
  ('fx_parallel', '', '', current_date - 30, 1990, 2000,   'https://example.com/q1', 'published', 'manual'),
  ('fx_parallel', '', '', current_date - 1,  2400, 2450.5, 'https://example.com/q2', 'published', 'manual'),
  ('fx_parallel', '', '', current_date,      9990, 9999,   'https://example.com/q3', 'held',      'manual');
insert into ledger_entries (id, season_id, category, amount, entered_amount, currency, fx_rate, entry_date, created_by) values
  ('e0000000-0000-0000-0000-000000000010', '51000000-0000-0000-0000-000000000001', 'fertiliser', 999, 300000, 'SDG', 1000, current_date - 3, 'a1000000-0000-0000-0000-0000000000a1'),
  ('e0000000-0000-0000-0000-000000000011', '51000000-0000-0000-0000-000000000001', 'pesticide', 1, 1000, 'SDG', 3000, current_date - 3, 'a1000000-0000-0000-0000-0000000000a1'),
  ('e0000000-0000-0000-0000-000000000012', '51000000-0000-0000-0000-000000000001', 'labour', 1, 245050, 'SDG', null, current_date, 'a1000000-0000-0000-0000-0000000000a1');
do $$
declare a uuid := 'a1000000-0000-0000-0000-0000000000a1'; e uuid;
begin
  perform _eq((select amount || '|' || entered_amount || '|' || fx_rate || '|' || fx_source from ledger_entries where id = 'e0000000-0000-0000-0000-000000000010'),
              '300.00|300000.00|1000.000000|user', 'جنيه بسعرٍ كتبه صاحبه: الدولار يُحسب (٣٠٠) لا ما أرسله العميل (٩٩٩)');
  e := _entry_of('e0000000-0000-0000-0000-000000000010');
  perform _eq((select array_agg(currency || amount_minor::text order by line_no) from journal_lines where entry_id = e), array['SDG30000000','SDG30000000','SDG30000000','SDG30000000'], 'والقيد بالجنيه كما دُفع');
  perform _eq((select fx_rate::text || '|' || fx_source from journal_entries where id = e), '1000.000000|user', 'بسعره ومصدره');
  perform _eq(_net('a1000000-0000-0000-0000-0000000000a1', 'cost_fertiliser', '51000000-0000-0000-0000-000000000001'), 30000::bigint, 'وفي الميزان ٣٠٠$');

  perform _eq((select amount from ledger_entries where id = 'e0000000-0000-0000-0000-000000000011'), 0.33, '١٠٠٠ جنيه بسعر ٣٠٠٠ = ٠٫٣٣$ (يقرَّب كالقاعدة)');
  perform _eq(_net('a1000000-0000-0000-0000-0000000000a1', 'cost_pesticide', '51000000-0000-0000-0000-000000000001'), 5033::bigint, 'ويتّفق الدفتران (٥٠$ بالأجل + ٠٫٣٣)');

  perform _eq((select fx_rate::text || '|' || fx_source || '|' || amount from ledger_entries where id = 'e0000000-0000-0000-0000-000000000012'), '2450.500000|parallel|100.00', 'بلا سعرٍ مكتوب: آخر سعر منشور للسوق الموازي، لا المحجوز');
  perform _eq((select fx_source from journal_entries where id = _entry_of('e0000000-0000-0000-0000-000000000012')), 'parallel', 'ويُوسَم القيد «سوق موازية»');
  perform _eq((select sum(case l.side when 'D' then 1 else -1 end * l.base_minor) from journal_lines l where l.entry_id = _entry_of('e0000000-0000-0000-0000-000000000012')), 0::numeric, 'ومتوازن');
end $$;
do $$
declare s1 text := '51000000-0000-0000-0000-000000000001'; a text := 'a1000000-0000-0000-0000-0000000000a1';
begin
  perform _refuses(format($q$insert into ledger_entries (season_id, category, amount, entered_amount, currency, entry_date, created_by) values (%L, 'seeds', 1, 1000, 'SDG', current_date - 20, %L)$q$, s1, a),
    'لا سعر صرف', 'بلا سعرٍ منشور خلال ٧ أيام: يُرفض ويُطلب السعر');
  perform _refuses(format($q$insert into ledger_entries (season_id, category, amount, currency, fx_rate, entry_date, created_by) values (%L, 'seeds', 1, 'SDG', 1000, current_date, %L)$q$, s1, a),
    'اكتب المبلغ بالجنيه', 'والجنيه بلا مبلغه الأصلي يُرفض');
  perform _refuses(format($q$insert into ledger_entries (season_id, category, amount, entered_amount, currency, fx_rate, entry_date, created_by) values (%L, 'seeds', 1, 1000, 'SDG', 0.5, current_date, %L)$q$, s1, a),
    'خارج المعقول', 'وسعرٌ فلكيّ يُرفض');
  perform _refuses(format($q$insert into ledger_entries (season_id, category, amount, entered_amount, currency, fx_rate, entry_date, created_by) values (%L, 'seeds', 1, 100, 'EUR', 1000, current_date, %L)$q$, s1, a),
    'currency_check', 'وعملةٌ غير الدولار والجنيه');
  perform _refuses(format($q$insert into ledger_entries (season_id, category, amount, entry_date, created_by, paid_from) values (%L, 'seeds', 1, current_date, %L, 'cheque')$q$, s1, a),
    'paid_from_check', 'وجهة دفعٍ غير معروفة');
end $$;
\echo ''
\echo '=========================================================================='
\echo 'د) التعديل والحذف يعكسان القيد'
\echo '=========================================================================='
insert into ledger_entries (id, season_id, category, amount, entry_date, created_by) values
  ('e0000000-0000-0000-0000-000000000020', '52000000-0000-0000-0000-000000000002', 'seeds', 300, current_date - 3, 'a1000000-0000-0000-0000-0000000000a1');
do $$
declare a uuid := 'a1000000-0000-0000-0000-0000000000a1'; s2 uuid := '52000000-0000-0000-0000-000000000002'; first_e uuid := _entry_of('e0000000-0000-0000-0000-000000000020');
begin
  update ledger_entries set amount = 450 where id = 'e0000000-0000-0000-0000-000000000020';
  perform _eq(_postings('e0000000-0000-0000-0000-000000000020'), 2, 'التعديل: قيدٌ قديم وقيدٌ جديد');
  perform _eq((select count(*)::int from journal_entries where reversal_of = first_e), 1, 'والقديم معكوس');
  perform _eq(_net(a, 'cost_seeds', s2), 45000::bigint, 'والبذور الآن ٤٥٠$');
  perform _eq(_net(a, 'crops_in_progress', s2), 45000::bigint, 'والمحاصيل القائمة مثلها');
  update ledger_entries set created_by = created_by where id = 'e0000000-0000-0000-0000-000000000020';
  perform _eq(_postings('e0000000-0000-0000-0000-000000000020'), 2, 'وتعديلٌ لا يغيّر شيئاً مما يُقيَّد لا يُنتج قيداً');
  update ledger_entries set category = 'labour' where id = 'e0000000-0000-0000-0000-000000000020';
  perform _eq(_net(a, 'cost_seeds', s2), 0::bigint, 'تغيير البند: البذور صفر');
  perform _eq(_net(a, 'cost_labour', s2), 45000::bigint, 'والعمالة ٤٥٠$');
  delete from ledger_entries where id = 'e0000000-0000-0000-0000-000000000020';
  perform _eq(_net(a, 'cost_labour', s2), 0::bigint, 'الحذف: العمالة صفر');
  perform _eq(_net(a, 'crops_in_progress', s2), 0::bigint, 'والمحاصيل القائمة صفر');
  perform _eq(_net(a, 'cash_on_hand', s2), 0::bigint, 'والنقد صفر');
  perform _eq((select count(*)::int from journal_entries where source_type = 'season_entry' and source_id = 'e0000000-0000-0000-0000-000000000020'), 3, 'والأثر باقٍ في الدفتر: ثلاثة قيود وعكساها');
end $$;

\echo ''
\echo '=========================================================================='
\echo 'هـ) إقفال الموسم ينقل ما بقي من التكلفة إلى «المباع»'
\echo '=========================================================================='
insert into ledger_entries (id, season_id, category, amount, entry_date, created_by) values
  ('e0000000-0000-0000-0000-000000000030', '53000000-0000-0000-0000-000000000003', 'seeds',  100, current_date - 4, 'a1000000-0000-0000-0000-0000000000a1'),
  ('e0000000-0000-0000-0000-000000000031', '53000000-0000-0000-0000-000000000003', 'labour', 200, current_date - 4, 'a1000000-0000-0000-0000-0000000000a1');
do $$
declare a uuid := 'a1000000-0000-0000-0000-0000000000a1'; s3 uuid := '53000000-0000-0000-0000-000000000003';
begin
  perform _eq(_net(a, 'crops_in_progress', s3), 30000::bigint, 'قبل الإقفال: ٣٠٠$ في المحاصيل القائمة');
  perform _eq(_net(a, 'cost_of_sales', s3), 0::bigint, 'ولا تكلفة مباعة بعد');
  update seasons set status = 'completed' where id = s3;
  perform _eq(_net(a, 'crops_in_progress', s3), 0::bigint, 'بعد الإقفال: لا يبقى شيء في المحاصيل القائمة');
  perform _eq(_net(a, 'cost_of_sales', s3), 30000::bigint, 'وتكلفة المحصول المباع ٣٠٠$');
  perform _eq((select count(*)::int from journal_entries where source_type = 'season_close' and source_id = s3), 1, 'بقيدٍ واحد');
  update seasons set status = 'completed' where id = s3;
  perform _eq((select count(*)::int from journal_entries where source_type = 'season_close' and source_id = s3), 1, 'وإعادة الإقفال لا تكرّره');
end $$;
insert into ledger_entries (id, season_id, category, amount, entry_date, created_by) values
  ('e0000000-0000-0000-0000-000000000032', '53000000-0000-0000-0000-000000000003', 'transport', 50, current_date - 1, 'a1000000-0000-0000-0000-0000000000a1');
do $$
declare a uuid := 'a1000000-0000-0000-0000-0000000000a1'; s3 uuid := '53000000-0000-0000-0000-000000000003';
begin
  perform _eq((select count(*)::int from journal_lines where entry_id = _entry_of('e0000000-0000-0000-0000-000000000032')), 2, 'سطرٌ بعد الإقفال: مصروفٌ في يومه، بلا رسملة');
  perform _eq(_net(a, 'crops_in_progress', s3), 0::bigint, 'والمحاصيل القائمة تبقى صفراً');
  delete from ledger_entries where id = 'e0000000-0000-0000-0000-000000000030';
  perform _eq(_net(a, 'crops_in_progress', s3), 0::bigint, 'حذفُ سطرٍ مرسمَلٍ بعد الإقفال يُصحَّح بقيدٍ مماثل');
  perform _eq(_net(a, 'cost_of_sales', s3), 20000::bigint, 'فتبقى تكلفة المباع ٢٠٠$ (العمالة وحدها)');
  perform _eq((select balanced from ledger_trial_balance_proof((select id from ledger_books where owner_id = a and kind = 'farm'))), true, 'والدفتر متوازن');
end $$;

\echo ''
\echo '=========================================================================='
\echo 'و) الترحيل الأوّل والمطابقة'
\echo '=========================================================================='
begin;
set local session_replication_role = replica;
insert into ledger_entries (id, season_id, category, amount, entry_date, created_by) values
  ('e0000000-0000-0000-0000-000000000040', '51000000-0000-0000-0000-000000000001', 'other', 40, current_date - 1, 'a1000000-0000-0000-0000-0000000000a1');
commit;
do $$
declare s1 uuid := '51000000-0000-0000-0000-000000000001'; n integer;
begin
  perform _eq(_postings('e0000000-0000-0000-0000-000000000040'), 0, 'سطرٌ أُدخل بلا زنادات: لا قيد له');
  perform _eq((select unposted_rows from farm_book_reconcile() where season_id = s1), 1::bigint, 'والمطابقة تكشفه');
  perform _eq((select simple_costs - book_costs from farm_book_reconcile() where season_id = s1), 4000::bigint, 'وفرقه ٤٠$');
  n := farm_book_sync();
  perform _eq(n, 1, 'الترحيل يرحّله وحده');
  perform _eq(_postings('e0000000-0000-0000-0000-000000000040'), 1, 'بقيدٍ واحد');
  perform _eq(farm_book_sync(), 0, 'وتكراره لا يفعل شيئاً');
  perform _eq((select count(*)::int from farm_book_reconcile()), 0, 'وبعده لا فرق في أيّ موسم');
end $$;

\echo ''
\echo '=========================================================================='
\echo 'ز) الدفتر لصاحب الموسم لا لمن كتب، والإقفال يمنع التاريخ المقفل'
\echo '=========================================================================='
insert into ledger_entries (id, season_id, category, amount, entry_date, created_by) values
  ('e0000000-0000-0000-0000-000000000050', '54000000-0000-0000-0000-000000000004', 'seeds', 80, current_date - 20, 'ad000000-0000-0000-0000-0000000000ad'),
  ('e0000000-0000-0000-0000-000000000051', '54000000-0000-0000-0000-000000000004', 'seeds', 60, current_date - 5,  'b2000000-0000-0000-0000-0000000000b2');
do $$
declare b uuid := 'b2000000-0000-0000-0000-0000000000b2'; adm uuid := 'ad000000-0000-0000-0000-0000000000ad';
begin
  perform _eq((select count(*)::int from ledger_books where owner_id = adm), 0, 'مديرٌ كتب في موسم غيره لا يُفتح له دفتر');
  perform _eq((select b2.owner_id from journal_entries je join ledger_books b2 on b2.id = je.book_id where je.id = _entry_of('e0000000-0000-0000-0000-000000000050')), b, 'والقيد في دفتر صاحب الموسم');
  perform _eq((select created_by from journal_entries where id = _entry_of('e0000000-0000-0000-0000-000000000050')), adm, 'ومن كتبه مسجَّل');
end $$;
set role authenticated;
do $$
declare bk uuid;
begin
  perform _act_as('b2000000-0000-0000-0000-0000000000b2');
  select id into bk from ledger_books where kind = 'farm';
  perform _eq(ledger_close_through(bk, current_date - 10), current_date - 10, 'صاحب الدفتر يقفل حتى قبل ١٠ أيام');
end $$;
reset role;
do $$
declare s4 text := '54000000-0000-0000-0000-000000000004'; b text := 'b2000000-0000-0000-0000-0000000000b2';
begin
  perform _refuses(format($q$insert into ledger_entries (season_id, category, amount, entry_date, created_by) values (%L, 'seeds', 10, current_date - 12, %L)$q$, s4, b),
    'مقفلة', 'سطرٌ بتاريخٍ في الفترة المقفلة يُرفض كلّه');
  perform _eq((select count(*)::int from ledger_entries where season_id = s4::uuid and entry_date = current_date - 12), 0, 'فلا يبقى في الدفتر البسيط ما ليس في المحرّك');
  insert into ledger_entries (season_id, category, amount, entry_date, created_by) values (s4::uuid, 'seeds', 10, current_date - 9, b::uuid);
  perform _pass('وما بعد الإقفال يُقبل');
end $$;

insert into _ids select 'B_farm', id from ledger_books where owner_id = 'b2000000-0000-0000-0000-0000000000b2' and kind = 'farm';

\echo ''
\echo '=========================================================================='
\echo 'ح) من ينادي ماذا'
\echo '=========================================================================='
set role authenticated;
do $$
begin
  perform _act_as('a1000000-0000-0000-0000-0000000000a1');
  perform _refuses($q$select farm_book_sync()$q$, 'permission denied', 'الترحيل ليس للمستخدم');
  perform _refuses($q$select _farm_mirror_post(gen_random_uuid(), 'k-user-denied', null)$q$, 'permission denied', 'ولا الدالّة الداخليّة');
  perform _refuses($q$select _farm_trueup(gen_random_uuid(), null)$q$, 'permission denied', 'ولا تصحيح الإقفال');
  perform _refuses($q$select * from farm_book_reconcile()$q$, 'للإدارة وحدها', 'والمطابقة للإدارة وحدها');
  perform _eq((select count(*)::int from journal_entries where book_id not in (select id from ledger_books where owner_id = 'a1000000-0000-0000-0000-0000000000a1')), 0, 'وصاحب الدفتر لا يرى قيود غيره');

  perform _act_as('ad000000-0000-0000-0000-0000000000ad');
  perform _eq((select count(*)::int from farm_book_reconcile()), 0, 'والمدير يطابق: لا فرق');
end $$;
reset role;
set role anon;
do $$
begin
  perform _refuses($q$select * from farm_book_reconcile()$q$, 'permission denied', 'الزائر لا يطابق');
  perform _refuses($q$select farm_book_sync()$q$, 'permission denied', 'ولا يرحّل');
end $$;
reset role;
set role service_role;
do $$
begin
  perform _act_as(null);
  perform _eq(farm_book_sync(), 0, 'مفتاح الخدمة يرحّل (ولا شيء ينقص)');
  perform _eq((select count(*)::int from farm_book_reconcile()), 0, 'ويطابق');
end $$;
reset role;
do $$
declare bk uuid := (select id from _ids where name = 'B_farm');
        lines jsonb := jsonb_build_array(jsonb_build_object('key','cost_other','side','D','currency','SDG','minor',245050000),
                                         jsonb_build_object('key','cash_on_hand','side','C','currency','SDG','minor',245050000));
        e uuid;
        e2 uuid;
begin
  e := _ledger_post_src(bk, current_date - 1, 'سوق', lines, 'svc-src-0001', 2450.5, 'season_entry', gen_random_uuid(), null, null, 'parallel');
  perform _eq((select fx_source from journal_entries where id = e), 'parallel', 'المحرّك يقبل مصدر السعر فيُوسَم القيد «سوق موازية»');
  e2 := _ledger_post(bk, current_date - 1, 'يدوي', lines, 'svc-src-0003', 2450.5, 'manual', null, null, null);
  perform _eq((select fx_source from journal_entries where id = e2), 'user', 'والباب القديم بلا مصدر: «سعر المستخدم»');
  perform _eq(_ledger_post_src(bk, current_date - 1, 'سوق', lines, 'svc-src-0001', 2450.5, 'season_entry', (select source_id from journal_entries where id = e), null, null, 'parallel'), e, 'وإعادة الإرسال بالمفتاح نفسه تُرجعه');
  perform _refuses(format($q$select _ledger_post_src(%L, current_date - 1, 'x', %L::jsonb, 'svc-src-0002', 1000, null, null, null, null, 'moon')$q$, bk, lines::text),
    'مصدر سعر الصرف', 'ومصدرٌ مجهول يُرفض');
  perform _eq((select count(*)::int from pg_proc where proname = '_ledger_post'), 1, 'والباب الداخليّ القديم واحد');
  perform _eq((select count(*)::int from pg_proc where proname = 'ledger_post_for'), 1, 'ونسخة الخدمة واحدة');
  perform _eq(has_function_privilege('authenticated', '_ledger_post_src(uuid,date,text,jsonb,text,numeric,text,uuid,uuid,uuid,text)', 'execute')
              or has_function_privilege('service_role', '_ledger_post_src(uuid,date,text,jsonb,text,numeric,text,uuid,uuid,uuid,text)', 'execute')
              or has_function_privilege('anon', '_ledger_post_src(uuid,date,text,jsonb,text,numeric,text,uuid,uuid,uuid,text)', 'execute'), false, 'ولا يستدعيها أحدٌ مباشرةً');
end $$;

\echo ''
\echo '=========================================================================='
\echo 'ح٢) الشكل الذي يرسله نموذج القيد في الموقع'
\echo '=========================================================================='
-- The form sends the pound figure as entered_amount, a zero dollar amount to be overwritten, and no rate
-- unless the farmer typed one (the database then takes the latest published parallel rate).
insert into ledger_entries (id, season_id, category, amount, entered_amount, currency, fx_rate, paid_from, entry_date, created_by) values
  ('e0000000-0000-0000-0000-0000000000f1', '51000000-0000-0000-0000-000000000001', 'seeds', 0, 1500000.00, 'SDG', null, 'bank', current_date, 'a1000000-0000-0000-0000-0000000000a1'),
  ('e0000000-0000-0000-0000-0000000000f2', '51000000-0000-0000-0000-000000000001', 'seeds', 0, 1.00,       'SDG', 3000, 'cash', current_date, 'a1000000-0000-0000-0000-0000000000a1');
do $$
begin
  perform _eq((select amount from ledger_entries where id = 'e0000000-0000-0000-0000-0000000000f1'), 612.12, 'مليون ونصف جنيه بلا سعرٍ مكتوب: ٦١٢٫١٢$ بآخر سعرٍ منشور');
  perform _eq((select fx_source from ledger_entries where id = 'e0000000-0000-0000-0000-0000000000f1'), 'parallel', 'ومصدر السعر «سوق موازية»');
  perform _eq((select fx_rate from ledger_entries where id = 'e0000000-0000-0000-0000-0000000000f1'), 2450.5, 'والسعر ٢٤٥٠٫٥ (المنشور لا المحجوز)');
  perform _eq(_postings('e0000000-0000-0000-0000-0000000000f1'), 1, 'وله قيدٌ واحد');
  perform _eq((select l.amount_minor from journal_lines l join ledger_accounts ac on ac.id = l.account_id
                where l.entry_id = _entry_of('e0000000-0000-0000-0000-0000000000f1') and ac.system_key = 'bank' and l.side = 'C'),
              150000000::bigint, 'ودائنُ البنك بالجنيه كما دُفع: ١٬٥٠٠٬٠٠٠٫٠٠');
  perform _eq((select amount from ledger_entries where id = 'e0000000-0000-0000-0000-0000000000f2'), 0.00, 'جنيهٌ واحد بثلاثة آلاف: أقلّ من سنتٍ فيُحفظ صفراً بالدولار');
  perform _eq(_postings('e0000000-0000-0000-0000-0000000000f2'), 1, 'ويبقى له قيدٌ بالجنيه، فلا يضيع مبلغٌ مكتوب');
  perform _eq((select balanced from ledger_trial_balance_proof((select id from ledger_books where owner_id = 'a1000000-0000-0000-0000-0000000000a1' and kind = 'farm'))), true, 'والدفتر متوازن بعدهما');
end $$;

\echo ''
\echo '=========================================================================='
\echo 'ط) الحرّاس الباقية'
\echo '=========================================================================='
do $$
begin
  perform _eq((select count(*)::int from journal_entries e where (select coalesce(sum(base_minor) filter (where side = 'D'), 0) - coalesce(sum(base_minor) filter (where side = 'C'), 0)
                                                                    from journal_lines where entry_id = e.id) <> 0), 0, 'كلّ قيدٍ في القاعدة متوازن');
  perform _eq((select count(*)::int from ledger_entries le where le.amount > 0 and le.currency = 'USD' and le.amount <> round(le.amount, 2)), 0, 'وكلّ مبلغٍ في الدفتر البسيط بخانتين');
  perform _refuses($q$update journal_lines set amount_minor = 1$q$, 'لا يُعدَّل', 'والمحرّك ما زال لا يُعدَّل');
end $$;

do $$
declare n integer;
begin
  select fails into n from _score;
  if n > 0 then raise exception '% فحصاً فشل', n; end if;
end $$;
\echo ''
\echo 'OK'
