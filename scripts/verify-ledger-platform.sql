-- بوّابةُ الدفتر العامّ للمنصّة والمحافظ (البند ١٨٩).
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
create or replace function _id(p text) returns uuid language sql stable as $$ select id from _ids where name = p $$;

-- Net (debit minus credit) of one account in the dollar, in the book of one owner (null: the platform's).
create or replace function _net(p_owner uuid, p_kind text, p_key text) returns bigint language sql stable security definer as $$
  select coalesce(sum(case l.side when 'D' then l.base_minor else -l.base_minor end), 0)::bigint
    from journal_lines l
    join ledger_accounts a on a.id = l.account_id and a.book_id = l.book_id
    join ledger_books b on b.id = l.book_id
   where b.owner_id is not distinct from p_owner and b.kind = p_kind and a.system_key = p_key $$;
create or replace function _acc(p_owner uuid, p_kind text, p_key text) returns uuid language sql stable security definer as $$
  select a.id from ledger_accounts a join ledger_books b on b.id = a.book_id
   where b.owner_id is not distinct from p_owner and b.kind = p_kind and a.system_key = p_key $$;
-- The line of an entry on one account.
create or replace function _line(p_entry uuid, p_key text) returns uuid language sql stable security definer as $$
  select l.id from journal_lines l join ledger_accounts a on a.id = l.account_id
   where l.entry_id = p_entry and a.system_key = p_key $$;
create or replace function _fee_entries(p_fee uuid) returns integer language sql stable security definer as $$
  select count(*)::int from journal_entries where source_type = 'ledger_fee' and source_id = p_fee $$;
create or replace function _status(p_rows text, p_status text) returns integer language plpgsql as $$
declare n integer;
begin execute format('select count(*)::int from (%s) x where x.status = %L', p_rows, p_status) into n; return n; end $$;

insert into auth.users (id) values
  ('ad000000-0000-0000-0000-0000000000ad'), ('ad200000-0000-0000-0000-0000000000ad'),
  ('f1000000-0000-0000-0000-0000000000f1'), ('f2000000-0000-0000-0000-0000000000f2'),
  ('b1000000-0000-0000-0000-0000000000b1')
on conflict (id) do nothing;
insert into profiles (id, full_name, role) values
  ('ad000000-0000-0000-0000-0000000000ad', 'مدير', 'admin'),
  ('ad200000-0000-0000-0000-0000000000ad', 'مدير ثانٍ', 'admin'),
  ('f1000000-0000-0000-0000-0000000000f1', 'فاطمة المزارعة', 'investor'),
  ('f2000000-0000-0000-0000-0000000000f2', 'مزارع ثانٍ', 'investor'),
  ('b1000000-0000-0000-0000-0000000000b1', 'أحمد المستثمر', 'investor')
on conflict (id) do update set role = excluded.role, full_name = excluded.full_name;

grant usage on schema public, auth to anon, authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated, service_role;
grant select, update on _score, _who to anon, authenticated, service_role;
grant select, insert on _ids to authenticated;
grant select on profiles, notifications to authenticated;
grant execute on function _fail(text,text), _pass(text), _act_as(uuid), _eq(anyelement,anyelement,text),
  _refuses(text,text,text), _id(text), _net(uuid,text,text), _acc(uuid,text,text), _line(uuid,text),
  _fee_entries(uuid), _status(text,text)
  to anon, authenticated, service_role;

-- The books the checks write in: the platform's, the investor's, two farms.
select _ledger_open_book(null, 'platform') is not null as p,
       _ledger_open_book('b1000000-0000-0000-0000-0000000000b1', 'investor') is not null as i,
       _ledger_open_book('f1000000-0000-0000-0000-0000000000f1', 'farm') is not null as f1,
       _ledger_open_book('f2000000-0000-0000-0000-0000000000f2', 'farm') is not null as f2 \gset

\echo ''
\echo '=========================================================================='
\echo 'أ) رسوم المنصّة: يقترحها المدير، ولا تُقيَّد قبل تأكيد دافعها'
\echo '=========================================================================='
set role authenticated;
do $$
begin
  perform _act_as('f1000000-0000-0000-0000-0000000000f1');
  perform _refuses($q$select ledger_fee_propose('b1000000-0000-0000-0000-0000000000b1', 'investor', 'inspection', 5000, 'USD', current_date)$q$,
                   'للإدارة وحدها', 'غير المدير لا يقترح رسماً');
  perform _refuses($q$insert into ledger_fees (kind, payer_owner, payer_kind, amount_minor, currency, entry_date, proposed_by, idem_key)
                      values ('service', 'f1000000-0000-0000-0000-0000000000f1', 'farm', 1, 'USD', current_date, 'ad000000-0000-0000-0000-0000000000ad', 'direct-key-01')$q$,
                   'permission denied', 'ولا يكتب أحدٌ في جدول الرسوم مباشرةً');

  perform _act_as('ad000000-0000-0000-0000-0000000000ad');
  perform _refuses($q$select ledger_fee_propose('ad000000-0000-0000-0000-0000000000ad', 'farm', 'service', 5000, 'USD', current_date)$q$,
                   'على نفسه', 'ولا يقترح المدير رسماً على نفسه');
  perform _refuses($q$select ledger_fee_propose('ad200000-0000-0000-0000-0000000000ad', 'farm', 'service', 5000, 'USD', current_date)$q$,
                   'لا على مديريها', 'ولا على مديرٍ آخر');
  perform _refuses($q$select ledger_fee_propose('b1000000-0000-0000-0000-0000000000b1', 'investor', 'gift', 5000, 'USD', current_date)$q$,
                   'نوع رسمٍ غير معروف', 'ونوعٌ غير معروف يُرفض');
  perform _refuses($q$select ledger_fee_propose('b1000000-0000-0000-0000-0000000000b1', 'investor', 'inspection', 0, 'USD', current_date)$q$,
                   'مبلغٌ غير صالح', 'ومبلغ صفر يُرفض');
  perform _refuses($q$select ledger_fee_propose('b1000000-0000-0000-0000-0000000000b1', 'investor', 'inspection', 5000, 'USD', current_date + 5)$q$,
                   'تاريخٌ غير صالح', 'وتاريخٌ في المستقبل يُرفض');

  insert into _ids values ('FEE1', ledger_fee_propose('b1000000-0000-0000-0000-0000000000b1', 'investor', 'inspection', 5000, 'USD',
                                                      current_date - 2, null, 'معاينة أرض الجزيرة', 'fee-key-0001'));
  perform _eq(ledger_fee_propose('b1000000-0000-0000-0000-0000000000b1', 'investor', 'inspection', 5000, 'USD',
                                 current_date - 2, null, 'معاينة أرض الجزيرة', 'fee-key-0001'), _id('FEE1'),
              'والضغطة الثانية بالمفتاح نفسه هي الاقتراح نفسه');
  perform _eq(_fee_entries(_id('FEE1')), 0, 'ولا يُقيَّد شيءٌ قبل التأكيد');
  perform _eq((select payer_name from ledger_fees_list() where id = _id('FEE1')), 'أحمد المستثمر', 'والمدير يرى اسم الدافع');
end $$;
reset role;
do $$
begin
  perform _eq((select count(*)::int from notifications where recipient_id = 'b1000000-0000-0000-0000-0000000000b1' and kind = 'ledger_fee'), 1,
              'ويصل الدافعَ إشعارٌ بالرسم');
end $$;
set role authenticated;
do $$
begin
  perform _act_as('b1000000-0000-0000-0000-0000000000b1');
  perform _eq((select count(*)::int from ledger_fees_list()), 1, 'الدافع يرى رسمه');
  perform _eq((select payer_name from ledger_fees_list() where id = _id('FEE1')), null, 'بلا حاجةٍ إلى اسمه');
  perform _eq((select count(*)::int from ledger_fees), 1, 'ويقرأ صفّه من الجدول');

  perform _act_as('f1000000-0000-0000-0000-0000000000f1');
  perform _eq((select count(*)::int from ledger_fees_list()), 0, 'وغيره لا يرى رسوم غيره');
  perform _eq((select count(*)::int from ledger_fees), 0, 'ولا يقرؤها من الجدول');
  perform _refuses(format('select ledger_fee_confirm(%L, %L)', _id('FEE1'), 'bank'), 'ليس هذا رسماً عليك', 'ولا يؤكّد رسم غيره');
  perform _refuses(format('select ledger_fee_reject(%L, %L)', _id('FEE1'), 'لم أدفع'), 'ليس هذا رسماً عليك', 'ولا يعترض عليه');

  perform _act_as('b1000000-0000-0000-0000-0000000000b1');
  perform _refuses(format('select ledger_fee_confirm(%L, %L)', _id('FEE1'), 'gold'), 'من أين دفعت', 'التأكيد يحتاج من أين دفع');
  perform _refuses(format('select ledger_fee_cancel(%L)', _id('FEE1')), 'للإدارة وحدها', 'والدافع لا يلغي الرسم');
  perform ledger_fee_confirm(_id('FEE1'), 'bank');
  perform _eq((select status from ledger_fees where id = _id('FEE1')), 'confirmed', 'أكّد الدافع');
  perform _refuses(format('select ledger_fee_confirm(%L, %L)', _id('FEE1'), 'bank'), 'سُبق البتّ', 'والتأكيد الثاني يُرفض');
end $$;
reset role;
do $$
declare b uuid := 'b1000000-0000-0000-0000-0000000000b1';
begin
  perform _eq(_fee_entries(_id('FEE1')), 2, 'قيدان: في دفتر المنصّة ودفتر الدافع');
  perform _eq((select count(distinct link_id)::int from journal_entries where source_type = 'ledger_fee' and source_id = _id('FEE1')), 1, 'برابطٍ واحد');
  perform _eq((select link_id from journal_entries where source_type = 'ledger_fee' and source_id = _id('FEE1') limit 1), _id('FEE1'), 'هو معرّف الرسم');
  perform _eq(_net(null, 'platform', 'cash_on_hand'), 5000::bigint, 'المنصّة: نقدها ٥٠$ مدين');
  perform _eq(_net(null, 'platform', 'fee_inspection'), -5000::bigint, 'وإيراد رسم المعاينة ٥٠$ دائن');
  perform _eq(_net(b, 'investor', 'inspection_fees'), 5000::bigint, 'المستثمر: رسوم المعاينة ٥٠$ مصروف');
  perform _eq(_net(b, 'investor', 'bank'), -5000::bigint, 'من البنك الذي اختاره');
  perform _act_as('ad000000-0000-0000-0000-0000000000ad');
  perform _eq((select bool_and(ok) from ledger_integrity()), true, 'والدفاتر كلّها سليمة');
  perform _refuses(format('update ledger_fees set memo = %L where id = %L', 'غيّرته', _id('FEE1')), 'بعد البتّ', 'والرسم المؤكَّد لا يتغيّر');
  perform _refuses(format('delete from ledger_fees where id = %L', _id('FEE1')), 'لا يُحذف', 'ولا يُحذف');
end $$;

-- A fee in pounds at the administrator's rate, for a farm; then one in pounds without a rate.
set role authenticated;
do $$
begin
  perform _act_as('ad000000-0000-0000-0000-0000000000ad');
  insert into _ids values ('FEE2', ledger_fee_propose('f1000000-0000-0000-0000-0000000000f1', 'farm', 'service', 1000000, 'SDG',
                                                      current_date - 1, 2000, 'خدمة إشراف', 'fee-key-0002'));
  insert into _ids values ('FEE3', ledger_fee_propose('f1000000-0000-0000-0000-0000000000f1', 'farm', 'agreement', 500000, 'SDG',
                                                      current_date - 1, null, '', 'fee-key-0003'));
  insert into _ids values ('FEE4', ledger_fee_propose('f1000000-0000-0000-0000-0000000000f1', 'farm', 'service', 700, 'USD',
                                                      current_date, null, 'لم يُدفع', 'fee-key-0004'));
  insert into _ids values ('FEE5', ledger_fee_propose('f1000000-0000-0000-0000-0000000000f1', 'farm', 'service', 900, 'USD',
                                                      current_date, null, 'خطأ', 'fee-key-0005'));

  perform _act_as('f1000000-0000-0000-0000-0000000000f1');
  perform ledger_fee_confirm(_id('FEE2'), 'wallet');
  perform _refuses(format('select ledger_fee_confirm(%L, %L)', _id('FEE3'), 'cash'), 'لا سعر صرف', 'جنيهٌ بلا سعرٍ منشور ولا مكتوب لا يُقيَّد');
  perform _refuses(format('select ledger_fee_reject(%L, %L)', _id('FEE4'), 'لا'), '٣ أحرف', 'والاعتراض يحتاج سبباً');
  perform ledger_fee_reject(_id('FEE4'), 'لم أدفع هذا الرسم');

  perform _act_as('ad000000-0000-0000-0000-0000000000ad');
  perform ledger_fee_cancel(_id('FEE5'));
  perform _refuses(format('select ledger_fee_cancel(%L)', _id('FEE2')), 'سُبق البتّ', 'والمؤكَّد لا يُلغى');
end $$;
reset role;
do $$
declare f uuid := 'f1000000-0000-0000-0000-0000000000f1';
begin
  perform _eq(_net(f, 'farm', 'platform_fees'), 500::bigint, 'المزرعة: ١٠٬٠٠٠ جنيه بسعر ٢٠٠٠ = ٥$ رسوم منصّة');
  perform _eq(_net(f, 'farm', 'wallet'), -500::bigint, 'من محفظته');
  perform _eq(_net(null, 'platform', 'fee_service'), -500::bigint, 'والمنصّة: رسم خدمة ٥$');
  perform _eq((select count(distinct fx_rate)::int from journal_entries where source_type = 'ledger_fee' and source_id = _id('FEE2')), 1,
              'بالسعر نفسه في الدفترين');
  perform _eq((select fx_rate from journal_entries where source_type = 'ledger_fee' and source_id = _id('FEE2') limit 1), 2000.000000::numeric(18,6),
              'سعر المدير');
  perform _eq(_fee_entries(_id('FEE3')), 0, 'وما رُفض تأكيده لم يُقيَّد منه شيء');
  perform _eq((select status || '/' || reject_reason from ledger_fees where id = _id('FEE4')), 'rejected/لم أدفع هذا الرسم', 'والمعترَض عليه بسببه');
  perform _eq(_fee_entries(_id('FEE4')) + _fee_entries(_id('FEE5')), 0, 'والمعترَض عليه والملغى لا قيد لهما');
  perform _eq((select status from ledger_fees where id = _id('FEE5')), 'cancelled', 'وألغى المدير ما أخطأ فيه');
end $$;

-- With a published rate, the pound fee is booked at it.
insert into market_quotes (kind, market, crop, market_date, buy, sell, source_url, status, method) values
  ('fx_parallel', '', '', current_date - 2, 2400, 2500, 'https://example.com/q1', 'published', 'manual');
set role authenticated;
do $$
begin
  perform _act_as('f1000000-0000-0000-0000-0000000000f1');
  perform ledger_fee_confirm(_id('FEE3'), 'cash');
  perform _eq((select fx_rate from ledger_fees where id = _id('FEE3')), 2500.000000::numeric(18,6), 'وبسعرٍ منشور يُقيَّد به');
  perform _eq(_net('f1000000-0000-0000-0000-0000000000f1', 'farm', 'platform_fees'), 700::bigint, '٥٬٠٠٠ جنيه بسعر ٢٥٠٠ = ٢$ أخرى');

  -- Neither side of a fee is reversed alone.
  perform _refuses(format('select ledger_reverse(%L, %L)',
                          (select id from journal_entries where source_type = 'ledger_fee' and source_id = _id('FEE3') and book_id = (select id from ledger_books where owner_id = auth.uid() and kind = 'farm')),
                          'خطأ'), 'رسمٍ للمنصّة', 'الدافع لا يعكس قيد الرسم في دفتره وحده');
  perform _act_as('ad000000-0000-0000-0000-0000000000ad');
  perform _refuses(format('select ledger_reverse(%L, %L)',
                          (select id from journal_entries where source_type = 'ledger_fee' and source_id = _id('FEE3') and book_id = (select id from ledger_books where kind = 'platform')),
                          'خطأ'), 'رسمٍ للمنصّة', 'والمدير لا يعكسه في دفتر المنصّة وحده');
end $$;
reset role;

\echo ''
\echo '=========================================================================='
\echo 'ب) كشف المزوّد: يُرفع ويُطابَق بقيود الحساب النقديّ، ولا يكتب في الدفتر'
\echo '=========================================================================='
-- The farm's own entries on its bank account: in 1000, out 250 twice, out 70 (then reversed), out 30.
set role authenticated;
do $$
declare bk uuid;
begin
  perform _act_as('f1000000-0000-0000-0000-0000000000f1');
  bk := (select id from ledger_books where owner_id = auth.uid() and kind = 'farm');
  insert into _ids values ('E1', ledger_post(bk, current_date - 10, 'رأس مال',
    jsonb_build_array(jsonb_build_object('key','bank','side','D','currency','USD','minor', 100000),
                      jsonb_build_object('key','owner_capital','side','C','currency','USD','minor', 100000)), 'stmt-e1-key'));
  insert into _ids values ('E2', ledger_post(bk, current_date - 8, 'بذور',
    jsonb_build_array(jsonb_build_object('key','cost_other','side','D','currency','USD','minor', 25000),
                      jsonb_build_object('key','bank','side','C','currency','USD','minor', 25000)), 'stmt-e2-key'));
  insert into _ids values ('E3', ledger_post(bk, current_date - 5, 'سماد',
    jsonb_build_array(jsonb_build_object('key','cost_other','side','D','currency','USD','minor', 25000),
                      jsonb_build_object('key','bank','side','C','currency','USD','minor', 25000)), 'stmt-e3-key'));
  insert into _ids values ('E4', ledger_post(bk, current_date - 4, 'خطأ',
    jsonb_build_array(jsonb_build_object('key','cost_other','side','D','currency','USD','minor', 7000),
                      jsonb_build_object('key','bank','side','C','currency','USD','minor', 7000)), 'stmt-e4-key'));
  perform ledger_reverse(_id('E4'), 'قيدٌ خاطئ');
  insert into _ids values ('E5', ledger_post(bk, current_date - 2, 'نقل',
    jsonb_build_array(jsonb_build_object('key','cost_other','side','D','currency','USD','minor', 3000),
                      jsonb_build_object('key','bank','side','C','currency','USD','minor', 3000)), 'stmt-e5-key'));
  insert into _ids values ('E6', ledger_post(bk, current_date - 15, 'وقود',
    jsonb_build_array(jsonb_build_object('key','cost_other','side','D','currency','USD','minor', 4000),
                      jsonb_build_object('key','bank','side','C','currency','USD','minor', 4000)), 'stmt-e6-key'));
  insert into _ids values ('E7', ledger_post(bk, current_date - 18, 'عمالة',
    jsonb_build_array(jsonb_build_object('key','cost_other','side','D','currency','USD','minor', 6000),
                      jsonb_build_object('key','bank','side','C','currency','USD','minor', 6000)), 'stmt-e7-key'));
end $$;
reset role;
insert into _ids values ('BANK1', _acc('f1000000-0000-0000-0000-0000000000f1', 'farm', 'bank')),
                        ('COST1', _acc('f1000000-0000-0000-0000-0000000000f1', 'farm', 'cost_other')),
                        ('PCASH', _acc(null, 'platform', 'cash_on_hand'));
create table _rows (j jsonb);
insert into _rows values (jsonb_build_array(
  jsonb_build_object('date', current_date - 9,  'minor',  100000, 'description', 'إيداع', 'reference', 'TX1'),
  jsonb_build_object('date', current_date - 8,  'minor', -25000, 'description', 'سحب', 'reference', 'TX2'),
  jsonb_build_object('date', current_date - 6,  'minor', -25000, 'description', 'سحب', 'reference', 'TX3'),
  jsonb_build_object('date', current_date - 4,  'minor',  -7000, 'description', 'سحب', 'reference', 'TX4'),
  jsonb_build_object('date', current_date - 20, 'minor',   -999, 'description', 'رسوم بنك', 'reference', ''),
  jsonb_build_object('date', current_date - 1,  'minor', -25000, 'description', 'سحب', 'reference', 'TX6'),
  jsonb_build_object('date', current_date - 3,  'minor',  -1000, 'description', 'عمولة', 'reference', ''),
  jsonb_build_object('date', current_date - 3,  'minor',  -1000, 'description', 'عمولة', 'reference', ''),
  -- Ten days from the only book line of its amount: too far to be the same movement.
  jsonb_build_object('date', current_date - 12, 'minor',  -3000, 'description', 'سحب', 'reference', 'TX7'),
  -- Two withdrawals of the same amount, one book line: one of them only.
  jsonb_build_object('date', current_date - 15, 'minor',  -4000, 'description', 'سحب', 'reference', 'TX8'),
  jsonb_build_object('date', current_date - 14, 'minor',  -4000, 'description', 'سحب', 'reference', 'TX9'),
  -- Money in, of the amount of a payment out the same day: not that payment.
  jsonb_build_object('date', current_date - 18, 'minor',   6000, 'description', 'إيداع', 'reference', 'TX10')));
grant select on _rows to authenticated;
create or replace function _sline(p_ref text, p_minor bigint default null) returns uuid language sql stable security definer as $$
  select id from ledger_statement_lines where reference = p_ref and (p_minor is null or amount_minor = p_minor) order by line_no limit 1 $$;
create or replace function _matched(p_ref text) returns uuid language sql stable security definer as $$
  select matched_line from ledger_statement_lines where reference = p_ref $$;
grant execute on function _sline(text, bigint), _matched(text) to authenticated;

set role authenticated;
do $$
declare r record; n0 integer;
begin
  perform _act_as('f2000000-0000-0000-0000-0000000000f2');
  perform _refuses(format('select * from ledger_statement_import(%L, %L, %L, %L::jsonb)', _id('BANK1'), 'USD', 'x.csv', (select j from _rows)),
                   'ليس هذا حساباً في دفترك', 'غير صاحب الدفتر لا يرفع كشفاً على حسابه');
  perform _act_as('ad000000-0000-0000-0000-0000000000ad');
  perform _refuses(format('select * from ledger_statement_import(%L, %L, %L, %L::jsonb)', _id('BANK1'), 'USD', 'x.csv', (select j from _rows)),
                   'ليس هذا حساباً في دفترك', 'ولا المدير');

  perform _act_as('f1000000-0000-0000-0000-0000000000f1');
  perform _refuses(format('select * from ledger_statement_import(%L, %L, %L, %L::jsonb)', _id('COST1'), 'USD', 'x.csv', (select j from _rows)),
                   'بحسابٍ نقديّ', 'والكشف على حسابٍ نقديّ وحده');
  perform _refuses(format('select * from ledger_statement_import(%L, %L, %L, %L::jsonb)', _id('BANK1'), 'XYZ', 'x.csv', (select j from _rows)),
                   'اختر عملة الكشف', 'وبعملةٍ معروفة');
  perform _refuses(format('select * from ledger_statement_import(%L, %L, %L, %L::jsonb)', _id('BANK1'), 'USD', 'x.csv',
                          jsonb_build_array(jsonb_build_object('date', current_date, 'minor', 100), jsonb_build_object('date', 'أمس', 'minor', 100))),
                   'السطر 2', 'وسطرٌ غير مقروء يُرفض برقمه');
  perform _eq((select count(*)::int from ledger_statements), 0, 'ولا يبقى من الرفض المرفوض شيء');
  perform _refuses(format('select * from ledger_statement_import(%L, %L, %L, %L::jsonb)', _id('BANK1'), 'USD', 'x.csv',
                          jsonb_build_array(jsonb_build_object('date', current_date, 'minor', 0))),
                   'مبلغٌ غير صالح', 'ومبلغ صفر يُرفض');

  n0 := (select count(*)::int from journal_entries where book_id = (select id from ledger_books where owner_id = auth.uid() and kind = 'farm'));
  select * into r from ledger_statement_import(_id('BANK1'), 'USD', 'bankak-oct.csv', (select j from _rows));
  perform _eq(r.imported, 12, 'رُفعت السطور الاثنا عشر (ومنها سطران متطابقان: حركتان)');
  perform _eq(r.matched, 4, 'وطوبق أربعة آليّاً');
  perform _eq((select count(*)::int from journal_entries where book_id = (select id from ledger_books where owner_id = auth.uid() and kind = 'farm')), n0,
              'ولم يُكتب في الدفتر قيدٌ واحد');
  perform _eq(_matched('TX1'), _line(_id('E1'), 'bank'), 'الإيداع طابق قيد رأس المال (فرق يوم)');
  perform _eq(_matched('TX2'), _line(_id('E2'), 'bank'), 'والسحب الأوّل طابق قيده في اليوم نفسه');
  perform _eq(_matched('TX3'), _line(_id('E3'), 'bank'), 'والثاني بالمبلغ نفسه طابق القيد الآخر لا الأوّل');
  perform _eq(_matched('TX4'), null, 'والقيد المعكوس لا يُطابَق');
  perform _eq(_matched('TX6'), null, 'وسحبٌ لا قيد له في ثلاثة أيّام يبقى في الكشف وحده');
  perform _eq(_matched('TX7'), null, 'وقيدٌ بالمبلغ نفسه على بعد عشرة أيّام ليس حركته');
  perform _eq(_matched('TX8'), _line(_id('E6'), 'bank'), 'وسحبان بالمبلغ نفسه وقيدٌ واحد: يطابق الأقرب');
  perform _eq(_matched('TX9'), null, 'ويبقى الآخر في الكشف وحده');
  perform _eq(_matched('TX10'), null, 'والداخل لا يطابق خارجاً بمبلغه');

  select * into r from ledger_statement_import(_id('BANK1'), 'USD', 'bankak-oct.csv', (select j from _rows));
  perform _eq(r.imported || '/' || r.skipped || '/' || coalesce(r.statement_id::text, 'none'), '0/12/none', 'ورفع الكشف نفسه مرّةً ثانية لا يكرّر شيئاً');
  perform _eq((select count(*)::int from ledger_statements), 1, 'ولا يترك كشفاً فارغاً');

  perform _eq(_status(format('select * from ledger_reconciliation(%L, %L, %L)', _id('BANK1'), current_date - 30, current_date), 'matched'), 4, 'المطابقة: أربعة في الاثنين');
  perform _eq(_status(format('select * from ledger_reconciliation(%L, %L, %L)', _id('BANK1'), current_date - 30, current_date), 'statement_only'), 8, 'وثمانية في الكشف وحده');
  perform _eq(_status(format('select * from ledger_reconciliation(%L, %L, %L)', _id('BANK1'), current_date - 30, current_date), 'book_only'), 2,
              'واثنان في الدفتر وحده (النقل والعمالة)، لا المعكوس ولا عاكسه');
  perform _eq((select count(*)::int from ledger_reconciliation(_id('BANK1'), current_date - 30, current_date)
                where status = 'book_only' and journal_line in (_line(_id('E5'), 'bank'), _line(_id('E7'), 'bank'))), 2,
              'وهما قيدا النقل والعمالة');

  -- By hand.
  perform _refuses(format('select ledger_statement_match(%L, %L)', _sline('TX6'), _line(_id('E5'), 'bank')), 'لا تطابق', 'مبلغٌ مختلف لا يُطابَق يدويّاً');
  perform _refuses(format('select ledger_statement_match(%L, %L)', _sline('TX4'), _line(_id('E4'), 'bank')), 'عُكس', 'ولا القيد المعكوس');
  perform _refuses(format('select ledger_statement_match(%L, %L)', _sline('TX6'), _line(_id('E3'), 'bank')), 'مطابَقٌ بسطرٍ آخر', 'ولا قيدٌ طابق سطراً آخر');
  perform _refuses(format('select ledger_statement_match(%L, %L)', _sline('TX6'), _line(_id('E3'), 'cost_other')), 'ليس في هذا الحساب', 'ولا سطرٌ من حسابٍ آخر');
  perform ledger_statement_unmatch(_sline('TX3'));
  perform _eq(_matched('TX3'), null, 'فُكّت مطابقة السحب الثاني');
  perform ledger_statement_match(_sline('TX6'), _line(_id('E3'), 'bank'));
  perform _eq((select match_kind from ledger_statement_lines where id = _sline('TX6')), 'manual', 'وطوبق يدويّاً بسحبٍ آخر (فرق خمسة أيّام)');
  perform _refuses(format('select ledger_statement_match(%L, %L)', _sline('TX6'), _line(_id('E5'), 'bank')), 'مطابَقٌ من قبل', 'والسطر المطابَق لا يُطابَق ثانيةً قبل فكّه');

  -- A matched entry reversed afterwards: the movement is back to "in the statement only".
  perform ledger_reverse(_id('E1'), 'كان خطأ');
  perform _eq((select status from ledger_reconciliation(_id('BANK1'), current_date - 30, current_date) where statement_line = _sline('TX1')), 'statement_only',
              'وقيدٌ طوبق ثمّ عُكس: يعود سطر الكشف إلى الكشف وحده');
  perform _eq((select count(*)::int from ledger_reconciliation(_id('BANK1'), current_date - 30, current_date) where journal_line = _line(_id('E1'), 'bank')), 0,
              'ولا يظهر القيد المعكوس في الدفتر وحده');

  perform _refuses($q$insert into ledger_statement_lines (statement_id, account_id, line_no, txn_date, amount_minor, currency, row_hash)
                      select id, account_id, 99, current_date, 5, 'USD', md5('x') from ledger_statements limit 1$q$,
                   'permission denied', 'ولا يكتب أحدٌ في سطور الكشف مباشرةً');
  perform _refuses($q$update ledger_statement_lines set matched_line = null$q$, 'permission denied', 'ولا يعدّلها');

  perform _act_as('f2000000-0000-0000-0000-0000000000f2');
  perform _eq((select count(*)::int from ledger_statement_lines), 0, 'وغيره لا يرى سطور كشفه');
  perform _refuses(format('select * from ledger_reconciliation(%L, %L, %L)', _id('BANK1'), current_date - 30, current_date), 'ليس هذا حساباً في دفترك',
                   'ولا مطابقته');
  perform _refuses(format('select ledger_statement_unmatch(%L)', _sline('TX6')), 'ليس هذا حساباً في دفترك', 'ولا يفكّ مطابقته');

  perform _refuses(format('select ledger_account_set_provider(%L, %L)', _id('BANK1'), 'bankak'), 'ليس هذا حساباً في دفترك', 'ولا يسمّي مزوّد حسابه');

  perform _act_as('f1000000-0000-0000-0000-0000000000f1');
  perform ledger_account_set_provider(_id('BANK1'), 'bankak');
  perform _eq((select provider from ledger_accounts where id = _id('BANK1')), 'bankak', 'وصاحب الدفتر يسمّي مزوّد حسابه: بنكك');
  perform _refuses(format('select ledger_account_set_provider(%L, %L)', _id('BANK1'), 'Bank Of X'), 'مزوّدٌ غير صالح', 'باسمٍ من القائمة');
  perform _refuses(format('select ledger_account_set_provider(%L, %L)', _id('COST1'), 'bankak'), 'بحسابٍ نقديّ', 'ولحسابٍ نقديّ وحده');

  perform _act_as('ad000000-0000-0000-0000-0000000000ad');
  perform _eq((select count(*)::int from ledger_statement_lines), 0, 'ولا المدير بلا فحص');
  select * into r from ledger_statement_import(_id('PCASH'), 'USD', 'platform.csv',
                                               jsonb_build_array(jsonb_build_object('date', current_date - 2, 'minor', 5000, 'reference', 'FEE')));
  perform _eq(r.matched, 1, 'والمدير يطابق نقد المنصّة بكشفه: رسم المعاينة');
end $$;
reset role;

-- An administrator inspecting the farm reads its reconciliation, and writes nothing.
insert into ledger_inspections (book_id, opened_by, reason, expires_at)
values ((select id from ledger_books where owner_id = 'f1000000-0000-0000-0000-0000000000f1' and kind = 'farm'),
        'ad000000-0000-0000-0000-0000000000ad', 'فحصٌ للتجربة في البوّابة', now() + interval '2 hours');
set role authenticated;
do $$
begin
  perform _act_as('ad000000-0000-0000-0000-0000000000ad');
  perform _eq((select count(*)::int from ledger_statement_lines where account_id = _id('BANK1')), 12, 'المدير الفاحص يقرأ الكشف');
  perform _eq((select count(*)::int from ledger_reconciliation(_id('BANK1'), current_date - 30, current_date)) > 0, true, 'ومطابقته');
  perform _refuses(format('select ledger_statement_unmatch(%L)', _sline('TX6')), 'ليس هذا حساباً في دفترك', 'ولا يفكّ مطابقةً فيه');

  perform _act_as('f1000000-0000-0000-0000-0000000000f1');
  perform ledger_statement_delete((select id from ledger_statements where account_id = _id('BANK1')));
  perform _eq((select count(*)::int from ledger_statement_lines where account_id = _id('BANK1')), 0, 'وصاحب الدفتر يحذف كشفاً رفعه خطأً بسطوره');
  perform _eq((select count(*)::int from journal_entries where id in (_id('E2'), _id('E3'), _id('E5'))), 3, 'وقيوده باقية كما هي');
end $$;
reset role;

\echo ''
\echo 'هـ) العقود القائمة في الحسابات النظاميّة (٩١١٠/٩١٢٠): العقد الموقَّع بمبلغٍ معلَن، مرّةً واحدة'

insert into partnership_agreements (id, ref, owner_id, investor_id, model, status, terms, signed_at) values
  ('a9100000-0000-0000-0000-000000000001', 'AG-1', 'f1000000-0000-0000-0000-0000000000f1', 'b1000000-0000-0000-0000-0000000000b1',
   'lease', 'signed', '{"rent_amount": 1200, "currency": "USD"}', now() - interval '3 days'),
  ('a9100000-0000-0000-0000-000000000002', 'AG-2', 'f1000000-0000-0000-0000-0000000000f1', 'b1000000-0000-0000-0000-0000000000b1',
   'finance', 'signed', '{"finance_amount": 250000, "currency": "SDG"}', now() - interval '1 day'),
  ('a9100000-0000-0000-0000-000000000003', 'AG-3', 'f1000000-0000-0000-0000-0000000000f1', 'b1000000-0000-0000-0000-0000000000b1',
   'sharecrop', 'signed', '{"owner_share": 60, "investor_share": 40}', now() - interval '2 days'),
  ('a9100000-0000-0000-0000-000000000004', 'AG-4', 'f1000000-0000-0000-0000-0000000000f1', 'b1000000-0000-0000-0000-0000000000b1',
   'lease', 'draft', '{"rent_amount": 999, "currency": "USD"}', null),
  -- بالجنيه قبل أيّ سعرٍ منشور: يبقى للغد ولا يُقيَّد بلا سعر.
  ('a9100000-0000-0000-0000-000000000005', 'AG-5', 'f1000000-0000-0000-0000-0000000000f1', 'b1000000-0000-0000-0000-0000000000b1',
   'lease', 'signed', '{"rent_amount": 5000, "currency": "SDG"}', now() - interval '400 days');

do $$
declare r record;
begin
  -- As the daily bookkeeping runs it: the service role, no user.
  perform _act_as(null);
  select * into r from agreement_memo_sync();
  perform _eq(r.posted, 2, 'يُقيَّد العقدان الموقَّعان بمبلغ: الإيجار بالدولار والتمويل بالجنيه بسعر يومه');
  perform _eq(r.without_amount, 1, 'والمزارعة بلا مبلغٍ تُعدّ ولا تُقيَّد قيمةً');
  perform _eq(r.skipped, 1, 'وعقدٌ بالجنيه بلا سعرٍ منشور ليومه يبقى للغد');
  perform _eq(_net(null, 'platform', 'memo_agreements'), 120000 + round(250000 * 100 / 2500.0)::bigint,
              'رصيد ٩١١٠ = ١٬٢٠٠$ + ٢٥٠٬٠٠٠ ج بسعر ٢٬٥٠٠ = ١٬٣٠٠$');
  perform _eq(-_net(null, 'platform', 'memo_contra'), _net(null, 'platform', 'memo_agreements'), 'ومقابله ٩١٢٠ دائنٌ بالقيمة نفسها');
  perform _eq((select count(*)::int from journal_entries where source_type = 'agreement_memo'
                  and source_id = 'a9100000-0000-0000-0000-000000000004'), 0, 'والمسوّدة لا تُقيَّد');
  perform _eq((select count(*)::int from journal_entries e join ledger_books b on b.id = e.book_id
                where e.source_type = 'agreement_memo' and b.kind <> 'platform'), 0, 'ولا يُكتب حرفٌ في دفتر أحد');

  select * into r from agreement_memo_sync();
  perform _eq(r.posted, 0, 'وتشغيله ثانيةً لا يكرّر شيئاً');
  perform _eq((select count(*)::int from journal_entries where source_type = 'agreement_memo'), 2, 'قيدان لا أكثر');
end $$;

set role authenticated;
do $$ begin
  perform _act_as('f1000000-0000-0000-0000-0000000000f1');
  perform _refuses('select agreement_memo_sync()', 'للإدارة وحدها', 'والمستخدم لا يشغّله');
  perform _act_as('ad000000-0000-0000-0000-0000000000ad');
  perform _refuses(format('select ledger_reverse(%L, %L)',
                          (select id from journal_entries where source_type = 'agreement_memo' limit 1), 'تجربة عكس'),
                   'قيدٌ نظاميّ', 'ولا يعكس المدير قيد العقد يدويّاً');
end $$;
reset role;
set role anon;
do $$ begin
  perform _act_as(null);
  perform _refuses('select agreement_memo_sync()', 'permission denied', 'والزائر لا يستدعيه');
end $$;
reset role;

do $$
declare n integer;
begin
  select fails into n from _score;
  if n > 0 then raise exception '% فحصاً فشل', n; end if;
end $$;
\echo ''
\echo 'OK'
