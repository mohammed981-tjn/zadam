-- بوّابةُ تسوية القيود الآجلة (البند ١٨٧ ٢ج).
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

-- Net (debit minus credit) of one account across everything booked for one simple-ledger row: its own posting,
-- its settlement, and the exchange difference — in dollars, or in the minor units of one currency.
create or replace function _row_net(p_row uuid, p_key text, p_cur text default null) returns bigint language sql stable as $$
  with own as (
    select id from journal_entries
     where source_id = p_row and source_type in ('season_entry', 'season_entry_settle', 'season_entry_settle_fx')
  )
  select coalesce(sum(case l.side when 'D' then 1 else -1 end * case when p_cur is null then l.base_minor else l.amount_minor end), 0)::bigint
    from journal_lines l
    join journal_entries e on e.id = l.entry_id
    join ledger_accounts a on a.id = l.account_id and a.book_id = l.book_id
   where (e.id in (select id from own) or e.reversal_of in (select id from own))
     and a.system_key = p_key and (p_cur is null or l.currency = p_cur) $$;
create or replace function _settles(p_row uuid) returns integer language sql stable as $$
  select count(*)::int from journal_entries where source_type = 'season_entry_settle' and source_id = p_row and reversal_of is null $$;
create or replace function _fx_entries(p_row uuid) returns integer language sql stable as $$
  select count(*)::int from journal_entries where source_type = 'season_entry_settle_fx' and source_id = p_row and reversal_of is null $$;

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
  ('52000000-0000-0000-0000-000000000002', 'a1000000-0000-0000-0000-0000000000a1', 'ذرة',   'maize', 'x', 'canal', 10, current_date - 60),
  ('54000000-0000-0000-0000-000000000004', 'b2000000-0000-0000-0000-0000000000b2', 'قطن',   'cotton','x', 'canal', 10, current_date - 60);

insert into market_quotes (kind, market, crop, market_date, buy, sell, source_url, status, method) values
  ('fx_parallel', '', '', current_date - 10, 1990, 2000,   'https://example.com/q1', 'published', 'manual'),
  ('fx_parallel', '', '', current_date - 1,  2400, 2450.5, 'https://example.com/q2', 'published', 'manual'),
  ('fx_parallel', '', '', current_date,      9990, 9999,   'https://example.com/q3', 'held',      'manual');

grant usage on schema public, auth to anon, authenticated, service_role;
-- The owner edits and deletes their own simple-ledger rows straight through the API in production (policy ledger_own).
grant select, insert, update, delete on ledger_entries to authenticated;
grant select on seasons to authenticated;
create policy seasons_own on seasons for select to authenticated using (owner_id = auth.uid());
create policy ledger_own on ledger_entries for all to authenticated
  using (exists (select 1 from seasons s where s.id = season_id and s.owner_id = auth.uid()))
  with check (exists (select 1 from seasons s where s.id = season_id and s.owner_id = auth.uid()));
grant execute on function auth.uid() to anon, authenticated, service_role;
grant select, update on _score to anon, authenticated, service_role;
grant select, update on _who to anon, authenticated, service_role;
grant execute on function _fail(text,text), _pass(text), _act_as(uuid), _eq(anyelement,anyelement,text),
  _refuses(text,text,text), _row_net(uuid,text,text), _settles(uuid), _fx_entries(uuid) to anon, authenticated, service_role;

-- Every row below is written by its owner, A unless it says B; all are on credit unless it says otherwise.
insert into ledger_entries (id, season_id, category, amount, entered_amount, currency, fx_rate, paid_from, entry_date, created_by) values
  ('e1000000-0000-0000-0000-000000000001', '51000000-0000-0000-0000-000000000001', 'seeds',      200, null,    'USD', null, 'credit', current_date - 5, 'a1000000-0000-0000-0000-0000000000a1'),
  ('e1000000-0000-0000-0000-000000000002', '51000000-0000-0000-0000-000000000001', 'revenue',    500, null,    'USD', null, 'credit', current_date - 5, 'a1000000-0000-0000-0000-0000000000a1'),
  ('e1000000-0000-0000-0000-000000000003', '51000000-0000-0000-0000-000000000001', 'fertiliser',   0, 2450500, 'SDG', null, 'credit', current_date - 5, 'a1000000-0000-0000-0000-0000000000a1'),
  ('e1000000-0000-0000-0000-000000000004', '51000000-0000-0000-0000-000000000001', 'revenue',      0, 2450500, 'SDG', null, 'credit', current_date - 5, 'a1000000-0000-0000-0000-0000000000a1'),
  ('e1000000-0000-0000-0000-000000000005', '51000000-0000-0000-0000-000000000001', 'transport',   0, 1000000, 'SDG', 2500, 'credit', current_date - 5, 'a1000000-0000-0000-0000-0000000000a1'),
  ('e1000000-0000-0000-0000-000000000006', '51000000-0000-0000-0000-000000000001', 'revenue',      0, 1000000, 'SDG', 2500, 'credit', current_date - 5, 'a1000000-0000-0000-0000-0000000000a1'),
  ('e1000000-0000-0000-0000-000000000007', '51000000-0000-0000-0000-000000000001', 'labour',     100, null,    'USD', null, 'cash',   current_date - 5, 'a1000000-0000-0000-0000-0000000000a1'),
  ('e1000000-0000-0000-0000-000000000008', '51000000-0000-0000-0000-000000000001', 'pesticide',    0, 2450500, 'SDG', 2450.5, 'credit', current_date - 5, 'a1000000-0000-0000-0000-0000000000a1'),
  ('e1000000-0000-0000-0000-000000000009', '51000000-0000-0000-0000-000000000001', 'other',        0, 500000,  'SDG', 2000, 'credit', current_date - 40, 'a1000000-0000-0000-0000-0000000000a1'),
  ('e1000000-0000-0000-0000-000000000010', '51000000-0000-0000-0000-000000000001', 'irrigation', 300, null,    'USD', null, 'credit', current_date - 5, 'a1000000-0000-0000-0000-0000000000a1'),
  ('e1000000-0000-0000-0000-000000000011', '52000000-0000-0000-0000-000000000002', 'seeds',      150, null,    'USD', null, 'credit', current_date - 5, 'a1000000-0000-0000-0000-0000000000a1'),
  ('e1000000-0000-0000-0000-000000000012', '54000000-0000-0000-0000-000000000004', 'seeds',       80, null,    'USD', null, 'credit', current_date - 3, 'b2000000-0000-0000-0000-0000000000b2');

\echo ''
\echo '=========================================================================='
\echo 'أ) قبل التسوية: الدين مقيَّد، والوضع معلوم'
\echo '=========================================================================='
do $$
begin
  perform _eq(_row_net('e1000000-0000-0000-0000-000000000001', 'payables_suppliers'), -20000::bigint, 'مصروفٌ آجل: الموردون دائنون ٢٠٠$');
  perform _eq(_row_net('e1000000-0000-0000-0000-000000000002', 'receivable_buyers'), 50000::bigint, 'وإيرادٌ آجل: المشترون مدينون ٥٠٠$');
  perform _eq(_row_net('e1000000-0000-0000-0000-000000000003', 'payables_suppliers'), -122525::bigint, 'ومصروفٌ آجل بالجنيه بآخر سعرٍ منشور (٢٠٠٠): ١٢٢٥٫٢٥$');
  perform _eq(_settles('e1000000-0000-0000-0000-000000000001'), 0, 'ولا سداد بعد');
end $$;

\echo ''
\echo '=========================================================================='
\echo 'ب) سداد مصروفٍ بالدولار، وقبض إيراد'
\echo '=========================================================================='
set role authenticated;
do $$
begin
  perform _act_as('a1000000-0000-0000-0000-0000000000a1');
  perform farm_settle_entry('e1000000-0000-0000-0000-000000000001', 'bank');
  perform farm_settle_entry('e1000000-0000-0000-0000-000000000002', 'cash');
end $$;
reset role;
do $$
begin
  perform _eq(_row_net('e1000000-0000-0000-0000-000000000001', 'payables_suppliers'), 0::bigint, 'سُدِّد المورّد: الدين صفر');
  perform _eq(_row_net('e1000000-0000-0000-0000-000000000001', 'bank'), -20000::bigint, 'والبنك دائن بما دُفع');
  perform _eq(_row_net('e1000000-0000-0000-0000-000000000001', 'cost_seeds'), 20000::bigint, 'والتكلفة كما هي لم تتغيّر');
  perform _eq(_fx_entries('e1000000-0000-0000-0000-000000000001'), 0, 'وبالدولار لا فرق صرف');
  perform _eq(_row_net('e1000000-0000-0000-0000-000000000002', 'receivable_buyers'), 0::bigint, 'وقُبض من المشتري: الذمّة صفر');
  perform _eq(_row_net('e1000000-0000-0000-0000-000000000002', 'cash_on_hand'), 50000::bigint, 'والنقد مدين بما قُبض');
  perform _eq(_row_net('e1000000-0000-0000-0000-000000000002', 'sales_crops'), -50000::bigint, 'والإيراد كما هو');
  perform _eq((select memo from journal_entries where source_type = 'season_entry_settle' and source_id = 'e1000000-0000-0000-0000-000000000001'), 'سداد — بذور — قمح أ', 'والوصف يقول سداد');
  perform _eq((select memo from journal_entries where source_type = 'season_entry_settle' and source_id = 'e1000000-0000-0000-0000-000000000002'), 'قبض — إيراد بيع — قمح أ', 'وللقبض: قبض');
  perform _eq((select entry_date from journal_entries where source_type = 'season_entry_settle' and source_id = 'e1000000-0000-0000-0000-000000000001'), ledger_today(), 'بتاريخ اليوم');
end $$;

\echo ''
\echo '=========================================================================='
\echo 'ج) الجنيه: فرق الصرف يُقفل في المعاملة نفسها'
\echo '=========================================================================='
set role authenticated;
do $$
begin
  perform _act_as('a1000000-0000-0000-0000-0000000000a1');
  -- A payable of 2,450,500 pounds booked at 2000 ($1225.25), paid at 2450.5 ($1000.00): the pound lost value, a gain.
  perform farm_settle_entry('e1000000-0000-0000-0000-000000000003', 'wallet', null, 2450.5);
  -- The same figure owed TO the farmer, collected at 2450.5: the pound lost value, a loss.
  perform farm_settle_entry('e1000000-0000-0000-0000-000000000004', 'cash', null, 2450.5);
  -- A payable booked at 2500 ($400) and paid at 2000 ($500): the pound gained, a loss.
  perform farm_settle_entry('e1000000-0000-0000-0000-000000000005', 'bank', null, 2000);
  -- A receivable booked at 2500 ($400) and collected at 2000 ($500): a gain.
  perform farm_settle_entry('e1000000-0000-0000-0000-000000000006', 'bank', null, 2000);
end $$;
reset role;
do $$
begin
  perform _eq(_row_net('e1000000-0000-0000-0000-000000000003', 'payables_suppliers'), 0::bigint, 'ديـنٌ بالجنيه: صفرٌ بالدولار بعد السداد');
  perform _eq(_row_net('e1000000-0000-0000-0000-000000000003', 'payables_suppliers', 'SDG'), 0::bigint, 'وصفرٌ بالجنيه');
  perform _eq(_row_net('e1000000-0000-0000-0000-000000000003', 'fx_gain'), -22525::bigint, 'وربحُ فرق الصرف ٢٢٥٫٢٥$ (الجنيه نزل قبل السداد)');
  perform _eq(_row_net('e1000000-0000-0000-0000-000000000003', 'wallet', 'SDG'), -245050000::bigint, 'والمحفظة دائنة بالجنيه كما دُفع');
  perform _eq(_row_net('e1000000-0000-0000-0000-000000000003', 'wallet'), -100000::bigint, 'وبمعادله يوم السداد ١٠٠٠$');
  perform _eq(_fx_entries('e1000000-0000-0000-0000-000000000003'), 1, 'وقيدُ فرقٍ واحد');
  perform _eq((select bool_and(l.currency = 'USD') from journal_lines l join journal_entries e on e.id = l.entry_id
               where e.source_type = 'season_entry_settle_fx' and e.source_id = 'e1000000-0000-0000-0000-000000000003'), true, 'بالدولار وحده');
  perform _eq((select fx_source from journal_entries where source_type = 'season_entry_settle' and source_id = 'e1000000-0000-0000-0000-000000000003'), 'user', 'وسعر السداد «سعر المستخدم»');

  perform _eq(_row_net('e1000000-0000-0000-0000-000000000004', 'receivable_buyers'), 0::bigint, 'ذمّةٌ بالجنيه: صفرٌ بالدولار');
  perform _eq(_row_net('e1000000-0000-0000-0000-000000000004', 'receivable_buyers', 'SDG'), 0::bigint, 'وبالجنيه');
  perform _eq(_row_net('e1000000-0000-0000-0000-000000000004', 'fx_loss'), 22525::bigint, 'وخسارةُ فرق الصرف ٢٢٥٫٢٥$ (ما قُبض أقلّ قيمةً)');
  perform _eq(_row_net('e1000000-0000-0000-0000-000000000004', 'cash_on_hand'), 100000::bigint, 'والنقد مدينٌ بمعادل يوم القبض');

  perform _eq(_row_net('e1000000-0000-0000-0000-000000000005', 'payables_suppliers'), 0::bigint, 'ودينٌ سُدِّد والجنيه أقوى: صفر');
  perform _eq(_row_net('e1000000-0000-0000-0000-000000000005', 'fx_loss'), 10000::bigint, 'خسارةُ ١٠٠$');
  perform _eq(_row_net('e1000000-0000-0000-0000-000000000006', 'receivable_buyers'), 0::bigint, 'وذمّةٌ قُبضت والجنيه أقوى: صفر');
  perform _eq(_row_net('e1000000-0000-0000-0000-000000000006', 'fx_gain'), -10000::bigint, 'ربحُ ١٠٠$');
end $$;

\echo ''
\echo '=========================================================================='
\echo 'د) السعر الافتراضيّ، وغيابه'
\echo '=========================================================================='
set role authenticated;
do $$
begin
  perform _act_as('a1000000-0000-0000-0000-0000000000a1');
  -- Booked at 2450.5 by hand; the settlement takes the latest published parallel rate, which is also 2450.5: no difference.
  perform farm_settle_entry('e1000000-0000-0000-0000-000000000008', 'cash');
  -- Settled on a day with no published rate in the seven days before it, and no rate typed.
  perform _refuses(format($q$select farm_settle_entry('e1000000-0000-0000-0000-000000000009', 'cash', %L)$q$, current_date - 30), 'لا سعر صرفٍ منشوراً', 'بلا سعرٍ منشورٍ ولا مكتوب يُرفض');
  perform _refuses(format($q$select farm_settle_entry('e1000000-0000-0000-0000-000000000009', 'cash', %L, 0.5)$q$, current_date - 30), 'سعر الصرف خارج المعقول', 'وسعرٌ غير معقول يُرفض');
end $$;
reset role;
do $$
begin
  perform _eq((select fx_source from journal_entries where source_type = 'season_entry_settle' and source_id = 'e1000000-0000-0000-0000-000000000008'), 'parallel', 'بلا سعرٍ مكتوب: السوق الموازية');
  perform _eq((select fx_rate from journal_entries where source_type = 'season_entry_settle' and source_id = 'e1000000-0000-0000-0000-000000000008'), 2450.5, 'بسعر ٢٤٥٠٫٥ المنشور لا المحجوز');
  perform _eq(_fx_entries('e1000000-0000-0000-0000-000000000008'), 0, 'والسعران واحد: لا قيد فرق');
  perform _eq(_row_net('e1000000-0000-0000-0000-000000000008', 'payables_suppliers'), 0::bigint, 'والدين صفر');
  perform _eq(_settles('e1000000-0000-0000-0000-000000000009'), 0, 'وما رُفض لم يُسدَّد');
end $$;

\echo ''
\echo '=========================================================================='
\echo 'ه) ما يُرفض'
\echo '=========================================================================='
set role authenticated;
do $$
begin
  perform _act_as('a1000000-0000-0000-0000-0000000000a1');
  perform _refuses($q$select farm_settle_entry('e1000000-0000-0000-0000-000000000001', 'cash')$q$, 'سُدِّد هذا القيد من قبل', 'التسديد مرّتين يُرفض');
  perform _refuses($q$select farm_settle_entry('e1000000-0000-0000-0000-000000000007', 'cash')$q$, 'ليس آجلاً', 'قيدٌ مدفوعٌ نقداً لا يُسدَّد');
  perform _refuses($q$select farm_settle_entry('e1000000-0000-0000-0000-000000000010', 'credit')$q$, 'اختر النقد', 'والسداد «آجلاً» يُرفض');
  perform _refuses($q$select farm_settle_entry('e1000000-0000-0000-0000-000000000010', null)$q$, 'اختر النقد', 'ومن غير جهة');
  perform _refuses(format($q$select farm_settle_entry('e1000000-0000-0000-0000-000000000010', 'cash', %L)$q$, current_date - 100), 'السداد لا يسبق القيد', 'ولا قبل تاريخ القيد');
  perform _refuses($q$select farm_settle_entry('e1000000-0000-0000-0000-0000000000ff', 'cash')$q$, 'القيد غير موجود', 'وقيدٌ لا وجود له');
  perform _refuses(format($q$select farm_settle_entry('e1000000-0000-0000-0000-000000000010', 'cash', %L)$q$, current_date + 5), 'لا قيد بتاريخٍ في المستقبل', 'ولا في المستقبل');
  perform _act_as('b2000000-0000-0000-0000-0000000000b2');
  perform _refuses($q$select farm_settle_entry('e1000000-0000-0000-0000-000000000010', 'cash')$q$, 'ليس هذا قيدك', 'ولا يسدّد أحدٌ قيدَ غيره');
  perform _refuses($q$select farm_unsettle_entry('e1000000-0000-0000-0000-000000000001')$q$, 'ليس هذا قيدك', 'ولا يلغي سداده');
  perform _act_as(null);
  perform _refuses($q$select farm_settle_entry('e1000000-0000-0000-0000-000000000010', 'cash')$q$, 'سجّل الدخول أولاً', 'ومن غير دخول');
end $$;
reset role;
do $$
begin
  perform _eq(_settles('e1000000-0000-0000-0000-000000000010'), 0, 'وما رُفض لم يُقيَّد');
  perform _eq(_row_net('e1000000-0000-0000-0000-000000000010', 'payables_suppliers'), -30000::bigint, 'والدين كما هو');
end $$;

\echo ''
\echo '=========================================================================='
\echo 'و) ما سُدِّد لا يتغيّر حتى يُلغى السداد'
\echo '=========================================================================='
set role authenticated;
do $$
begin
  perform _act_as('a1000000-0000-0000-0000-0000000000a1');
  perform _refuses($q$update ledger_entries set entered_amount = 3000000 where id = 'e1000000-0000-0000-0000-000000000003'$q$, 'ألغِ السداد أولاً ثم عدّله', 'تعديل المبلغ يُرفض');
  perform _refuses($q$update ledger_entries set paid_from = 'cash' where id = 'e1000000-0000-0000-0000-000000000003'$q$, 'ألغِ السداد أولاً ثم عدّله', 'وتعديل جهة الدفع');
  perform _refuses($q$update ledger_entries set category = 'labour' where id = 'e1000000-0000-0000-0000-000000000003'$q$, 'ألغِ السداد أولاً ثم عدّله', 'وتعديل البند');
  perform _refuses($q$delete from ledger_entries where id = 'e1000000-0000-0000-0000-000000000003'$q$, 'ألغِ السداد أولاً ثم احذفه', 'والحذف');
  update ledger_entries set description = 'بعد السداد' where id = 'e1000000-0000-0000-0000-000000000003';
  perform _pass('وتعديل الوصف وحده يمرّ');
end $$;
reset role;
do $$
begin
  perform _eq(_row_net('e1000000-0000-0000-0000-000000000003', 'payables_suppliers'), 0::bigint, 'والدين ما زال صفراً بعد تعديل الوصف');
  perform _eq((select description from ledger_entries where id = 'e1000000-0000-0000-0000-000000000003'), 'بعد السداد', 'والوصف تغيّر');
end $$;

set role authenticated;
do $$
begin
  perform _act_as('a1000000-0000-0000-0000-0000000000a1');
  perform farm_unsettle_entry('e1000000-0000-0000-0000-000000000003');
  perform _refuses($q$select farm_unsettle_entry('e1000000-0000-0000-0000-000000000003')$q$, 'لم يُسدَّد هذا القيد', 'وإلغاؤه مرّتين يُرفض');
end $$;
reset role;
do $$
begin
  perform _eq(_row_net('e1000000-0000-0000-0000-000000000003', 'payables_suppliers'), -122525::bigint, 'أُلغي السداد: عاد الدين كاملاً');
  perform _eq(_row_net('e1000000-0000-0000-0000-000000000003', 'payables_suppliers', 'SDG'), -245050000::bigint, 'بالجنيه أيضاً');
  perform _eq(_row_net('e1000000-0000-0000-0000-000000000003', 'wallet'), 0::bigint, 'والمحفظة كما كانت');
  perform _eq(_row_net('e1000000-0000-0000-0000-000000000003', 'fx_gain'), 0::bigint, 'وربح الصرف مُحي بعكسه');
  perform _eq((select count(*)::int from journal_entries r where r.reversal_of in (select id from journal_entries where source_id = 'e1000000-0000-0000-0000-000000000003' and source_type like 'season_entry_settle%')), 2, 'بعكسَين لا بحذف');
  perform _eq(_settles('e1000000-0000-0000-0000-000000000003'), 1, 'والسداد الأصل باقٍ في السجلّ (عُكس ولم يُحذف)');
end $$;

set role authenticated;
do $$
begin
  perform _act_as('a1000000-0000-0000-0000-0000000000a1');
  update ledger_entries set category = 'labour' where id = 'e1000000-0000-0000-0000-000000000003';
  perform _pass('وبعد الإلغاء يُعدَّل القيد');
  perform farm_settle_entry('e1000000-0000-0000-0000-000000000003', 'wallet', null, 2450.5);
  perform _pass('ويُسدَّد من جديد');
end $$;
reset role;
do $$
begin
  perform _eq(_row_net('e1000000-0000-0000-0000-000000000003', 'payables_suppliers'), 0::bigint, 'فالدين صفر');
  perform _eq(_row_net('e1000000-0000-0000-0000-000000000003', 'cost_labour'), 122525::bigint, 'والتكلفة في البند الجديد');
  perform _eq(_row_net('e1000000-0000-0000-0000-000000000003', 'cost_fertiliser'), 0::bigint, 'ولا شيء في القديم');
  perform _eq(_row_net('e1000000-0000-0000-0000-000000000003', 'fx_gain'), -22525::bigint, 'وفرق الصرف مرّةً واحدة');
  perform _eq(_settles('e1000000-0000-0000-0000-000000000003'), 2, 'وسدادان في السجلّ، أحدهما معكوس');
end $$;

\echo ''
\echo '=========================================================================='
\echo 'ز) الفترة المقفلة، والموسم المنتهي'
\echo '=========================================================================='
-- B's farm book was opened by B's first row; close it through the day before the settlement date asked for.
update ledger_books set closed_through = current_date - 2 where owner_id = 'b2000000-0000-0000-0000-0000000000b2' and kind = 'farm';
set role authenticated;
do $$
begin
  perform _act_as('b2000000-0000-0000-0000-0000000000b2');
  perform _refuses(format($q$select farm_settle_entry('e1000000-0000-0000-0000-000000000012', 'cash', %L)$q$, current_date - 2), 'مقفلة', 'السداد في فترةٍ مقفلة يُرفض');
  perform farm_settle_entry('e1000000-0000-0000-0000-000000000012', 'cash');
  perform _pass('وبتاريخ اليوم يمرّ');
end $$;
reset role;
update seasons set status = 'completed' where id = '52000000-0000-0000-0000-000000000002';
set role authenticated;
do $$
begin
  perform _act_as('a1000000-0000-0000-0000-0000000000a1');
  perform farm_settle_entry('e1000000-0000-0000-0000-000000000011', 'bank');
  perform _pass('وقيد موسمٍ منتهٍ يُسدَّد');
end $$;
reset role;
do $$
begin
  perform _eq(_row_net('e1000000-0000-0000-0000-000000000011', 'payables_suppliers'), 0::bigint, 'ودينُه صفر');
  perform _eq(_row_net('e1000000-0000-0000-0000-000000000011', 'bank'), -15000::bigint, 'والبنك دائن');
  perform _eq((select count(*)::int from journal_lines l join journal_entries e on e.id = l.entry_id join ledger_accounts a on a.id = l.account_id and a.book_id = l.book_id
                where e.source_type in ('season_entry_settle', 'season_entry_settle_fx') and e.source_id = 'e1000000-0000-0000-0000-000000000011'
                  and a.system_key in ('crops_in_progress', 'costs_capitalised', 'cost_of_sales')), 0, 'والسداد لا يمسّ «المحاصيل القائمة» ولا «تكلفة المباع»');
end $$;

\echo ''
\echo '=========================================================================='
\echo 'ح) حالة الآجل للصفحة'
\echo '=========================================================================='
set role authenticated;
do $$
begin
  perform _act_as('a1000000-0000-0000-0000-0000000000a1');
  perform _eq((select count(*)::int from farm_credit_status('51000000-0000-0000-0000-000000000001')), 9, 'تسعة قيودٍ آجلة في الموسم');
  perform _eq((select count(*)::int from farm_credit_status('51000000-0000-0000-0000-000000000001') where settled_on is null), 2, 'اثنان لم يُسدَّدا (٩ و١٠)');
  perform _eq((select settled_on from farm_credit_status('51000000-0000-0000-0000-000000000001') where entry_id = 'e1000000-0000-0000-0000-000000000001'), ledger_today(), 'وتاريخ ما سُدِّد');
  perform _act_as('b2000000-0000-0000-0000-0000000000b2');
  perform _eq((select count(*)::int from farm_credit_status('51000000-0000-0000-0000-000000000001')), 0, 'وغير صاحب الموسم لا يرى منه شيئاً');
end $$;
reset role;

\echo ''
\echo '=========================================================================='
\echo 'ط) الميزان، والمطابقة، والصلاحيّات'
\echo '=========================================================================='
do $$
declare a uuid := 'a1000000-0000-0000-0000-0000000000a1';
begin
  perform _act_as(null);
  perform _eq((select count(*)::int from journal_entries e where (select coalesce(sum(base_minor) filter (where side = 'D'), 0) - coalesce(sum(base_minor) filter (where side = 'C'), 0)
                                                                    from journal_lines where entry_id = e.id) <> 0), 0, 'كلّ قيدٍ في القاعدة متوازن بالدولار');
  perform _eq((select balanced from ledger_trial_balance_proof((select id from ledger_books where owner_id = a and kind = 'farm'))), true, 'ودفتر المزرعة متوازن');
  perform _eq((select equation_holds from ledger_trial_balance_proof((select id from ledger_books where owner_id = a and kind = 'farm'))), true, 'والأصول = الالتزامات + الملكيّة + صافي الدخل');
  perform _eq((select count(*)::int from farm_book_reconcile()), 0, 'والسداد لم يُخلّ بمطابقة الدفتر البسيط');
  perform _eq(has_function_privilege('anon', 'farm_settle_entry(uuid,text,date,numeric)', 'execute'), false, 'الزائر لا يسدّد');
  perform _eq(has_function_privilege('service_role', 'farm_settle_entry(uuid,text,date,numeric)', 'execute'), false, 'ولا مفتاح الخدمة (مالٌ شخصيّ)');
  perform _eq(has_function_privilege('authenticated', 'farm_settle_entry(uuid,text,date,numeric)', 'execute'), true, 'والمسجَّل يسدّد');
  perform _eq(has_function_privilege('anon', 'farm_unsettle_entry(uuid)', 'execute') or has_function_privilege('service_role', 'farm_unsettle_entry(uuid)', 'execute'), false, 'وإلغاء السداد كذلك');
  perform _eq(has_function_privilege('anon', 'farm_credit_status(uuid)', 'execute') or has_function_privilege('service_role', 'farm_credit_status(uuid)', 'execute'), false, 'وحالة الآجل كذلك');
  perform _eq(has_function_privilege('authenticated', '_farm_settlement_current(uuid,text)', 'execute')
              or has_function_privilege('authenticated', 'ledger_entries_settled_guard()', 'execute'), false, 'والداخليّ لا يستدعيه أحد');
  perform _refuses($q$update journal_entries set memo = 'x'$q$, 'لا يُعدَّل', 'والمحرّك ما زال لا يُعدَّل');
end $$;

do $$
declare n integer;
begin
  select fails into n from _score;
  if n > 0 then raise exception '% فحصاً فشل', n; end if;
end $$;
\echo ''
\echo 'OK'
