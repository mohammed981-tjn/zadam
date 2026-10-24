-- بوّابةُ القيود المتقابلة (البند ١٨٨ ب).
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
grant all on _ids to anon, authenticated, service_role;

-- Net (debit minus credit) of one account in the dollar, in the book of one owner, optionally of one season.
create or replace function _net(p_owner uuid, p_kind text, p_key text, p_season uuid default null) returns bigint language sql stable as $$
  select coalesce(sum(case l.side when 'D' then l.base_minor else -l.base_minor end), 0)::bigint
    from journal_lines l
    join ledger_accounts a on a.id = l.account_id and a.book_id = l.book_id
    join ledger_books b on b.id = l.book_id
   where b.owner_id = p_owner and b.kind = p_kind and a.system_key = p_key
     and (p_season is null or l.season_id = p_season) $$;
create or replace function _net_cur(p_owner uuid, p_kind text, p_key text, p_cur text) returns bigint language sql stable as $$
  select coalesce(sum(case l.side when 'D' then l.amount_minor else -l.amount_minor end), 0)::bigint
    from journal_lines l
    join ledger_accounts a on a.id = l.account_id and a.book_id = l.book_id
    join ledger_books b on b.id = l.book_id
   where b.owner_id = p_owner and b.kind = p_kind and a.system_key = p_key and l.currency = p_cur $$;
create or replace function _entries_of(p_link uuid) returns integer language sql stable as $$
  select count(*)::int from journal_entries where link_id = p_link $$;
create or replace function _id(p_name text) returns uuid language sql stable as $$ select id from _ids where name = p_name $$;


insert into auth.users (id) values
  ('f1000000-0000-0000-0000-0000000000f1'), ('a1000000-0000-0000-0000-0000000000a1'),
  ('c3000000-0000-0000-0000-0000000000c3'), ('ad000000-0000-0000-0000-0000000000ad')
on conflict (id) do nothing;
insert into profiles (id, full_name, role) values
  ('ad000000-0000-0000-0000-0000000000ad', 'مدير', 'admin'),
  ('f1000000-0000-0000-0000-0000000000f1', 'فاطمة المزارعة', 'investor'),
  ('a1000000-0000-0000-0000-0000000000a1', 'أحمد المستثمر', 'investor'),
  ('c3000000-0000-0000-0000-0000000000c3', 'غريب', 'investor')
on conflict (id) do update set role = excluded.role, full_name = excluded.full_name;

insert into partnership_agreements (id, ref, owner_id, investor_id, model, status) values
  ('aa000000-0000-0000-0000-000000000001', 'SA-1', 'f1000000-0000-0000-0000-0000000000f1', 'a1000000-0000-0000-0000-0000000000a1', 'finance', 'signed'),
  ('aa000000-0000-0000-0000-000000000002', 'SA-2', 'f1000000-0000-0000-0000-0000000000f1', 'a1000000-0000-0000-0000-0000000000a1', 'lease',   'signed'),
  ('aa000000-0000-0000-0000-000000000003', 'SA-3', 'f1000000-0000-0000-0000-0000000000f1', 'a1000000-0000-0000-0000-0000000000a1', 'finance', 'draft'),
  ('aa000000-0000-0000-0000-000000000004', 'SA-4', 'f1000000-0000-0000-0000-0000000000f1', 'c3000000-0000-0000-0000-0000000000c3', 'finance', 'signed');

insert into seasons (id, owner_id, name, crop_key, station_key, irrigation, feddans, planting_date, partnership_id) values
  ('51000000-0000-0000-0000-000000000001', 'f1000000-0000-0000-0000-0000000000f1', 'قمح',  'wheat', 'x', 'canal', 10, current_date - 60, 'aa000000-0000-0000-0000-000000000001'),
  ('52000000-0000-0000-0000-000000000002', 'f1000000-0000-0000-0000-0000000000f1', 'ذرة',  'maize', 'x', 'canal', 10, current_date - 60, null),
  ('53000000-0000-0000-0000-000000000003', 'f1000000-0000-0000-0000-0000000000f1', 'فول',  'faba',  'x', 'canal', 10, current_date - 60, 'aa000000-0000-0000-0000-000000000001'),
  ('54000000-0000-0000-0000-000000000004', 'f1000000-0000-0000-0000-0000000000f1', 'قطن',  'cotton','x', 'canal', 10, current_date - 60, 'aa000000-0000-0000-0000-000000000004');

insert into market_quotes (kind, market, crop, market_date, buy, sell, source_url, status, method) values
  ('fx_parallel', '', '', current_date - 1, 2400, 2450.5, 'https://example.com/q1', 'published', 'manual');

grant usage on schema public, auth to anon, authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated, service_role;
grant select, update on _score to anon, authenticated, service_role;
grant select, update on _who to anon, authenticated, service_role;
grant select on partnership_agreements, seasons, profiles, notifications to authenticated;
grant execute on function _fail(text,text), _pass(text), _act_as(uuid), _eq(anyelement,anyelement,text),
  _refuses(text,text,text), _net(uuid,text,text,uuid), _net_cur(uuid,text,text,text), _entries_of(uuid), _id(text)
  to anon, authenticated, service_role;

\echo ''
\echo '=========================================================================='
\echo 'أ) الاقتراح: لا يُقيَّد شيءٌ، ولا يقترح غريب'
\echo '=========================================================================='
set role authenticated;
do $$
begin
  perform _act_as('a1000000-0000-0000-0000-0000000000a1');
  insert into _ids values ('L1', ledger_link_propose('aa000000-0000-0000-0000-000000000001', 'input_finance', 300000, 'USD', current_date - 3, 'bank',
                                                      0, '51000000-0000-0000-0000-000000000001', null, 'بذور وسماد', 'key-input-0001'));
  perform _eq(ledger_link_propose('aa000000-0000-0000-0000-000000000001', 'input_finance', 300000, 'USD', current_date - 3, 'bank',
                                  0, '51000000-0000-0000-0000-000000000001', null, 'بذور وسماد', 'key-input-0001'), _id('L1'), 'الضغط مرّتين اقتراحٌ واحد');
  perform _refuses($q$select ledger_link_propose('aa000000-0000-0000-0000-000000000002', 'input_finance', 1000, 'USD', current_date, 'bank', 0, null, null, '', 'k-lease-0001')$q$,
                   'عقد الإيجار ليس فيه إلا الأجرة', 'عقد الإيجار لا يقبل تمويل مدخلات');
  perform _refuses($q$select ledger_link_propose('aa000000-0000-0000-0000-000000000001', 'rent_payment', 1000, 'USD', current_date, 'bank', 0, null, null, '', 'k-rent-00001')$q$,
                   'الأجرة لعقد الإيجار وحده', 'والأجرة لا تُقترح في غير الإيجار');
  perform _refuses($q$select ledger_link_propose('aa000000-0000-0000-0000-000000000003', 'input_finance', 1000, 'USD', current_date, 'bank', 0, '51000000-0000-0000-0000-000000000001', null, '', 'k-draft-0001')$q$,
                   'لا عقدَ موقَّعاً', 'عقدٌ لم يُوقَّع لا يُبنى عليه');
  perform _refuses($q$select ledger_link_propose('aa000000-0000-0000-0000-000000000004', 'input_finance', 1000, 'USD', current_date, 'bank', 0, '54000000-0000-0000-0000-000000000004', null, '', 'k-other-0001')$q$,
                   'لست طرفاً في هذا العقد', 'ولا يقترح من ليس طرفاً فيه');
  perform _refuses($q$select ledger_link_propose('aa000000-0000-0000-0000-000000000001', 'input_finance', 1000, 'USD', current_date, 'bank', 0, '52000000-0000-0000-0000-000000000002', null, '', 'k-season-001')$q$,
                   'الموسم ليس من هذا العقد', 'وموسمٌ ليس من العقد يُرفض');
  perform _refuses($q$select ledger_link_propose('aa000000-0000-0000-0000-000000000001', 'input_finance', 1000, 'USD', current_date, 'bank', 0, null, null, '', 'k-noseason-1')$q$,
                   'اختر الموسم', 'والتمويل بلا موسم يُرفض');
  perform _refuses($q$select ledger_link_propose('aa000000-0000-0000-0000-000000000001', 'input_finance', 1000, 'USD', current_date, null, 0, '51000000-0000-0000-0000-000000000001', null, '', 'k-noacct-001')$q$,
                   'اختر النقد', 'وبلا جهة دفع');
  perform _refuses($q$select ledger_link_propose('aa000000-0000-0000-0000-000000000001', 'input_finance', 0, 'USD', current_date, 'bank', 0, '51000000-0000-0000-0000-000000000001', null, '', 'k-zero-00001')$q$,
                   'مبلغٌ غير صالح', 'ومبلغٌ صفر');
  perform _refuses($q$select ledger_link_propose('aa000000-0000-0000-0000-000000000001', 'input_finance', 1000, 'EUR', current_date, 'bank', 0, '51000000-0000-0000-0000-000000000001', null, '', 'k-eur-000001')$q$,
                   'عملة غير معروفة', 'وعملةٌ مجهولة');
  perform _refuses($q$select ledger_link_propose('aa000000-0000-0000-0000-000000000001', 'input_finance', 1000, 'USD', current_date + 30, 'bank', 0, '51000000-0000-0000-0000-000000000001', null, '', 'k-future-001')$q$,
                   'تاريخٌ غير صالح', 'وتاريخٌ في المستقبل');
  perform _refuses($q$select ledger_link_propose('aa000000-0000-0000-0000-000000000001', 'input_finance', 1000, 'USD', current_date, 'bank', 500, '51000000-0000-0000-0000-000000000001', null, '', 'k-princ-0001')$q$,
                   'أصل التمويل لنصيب الحصاد وحده', 'وأصلٌ في غير الحصاد');
  perform _refuses($q$select ledger_link_propose('aa000000-0000-0000-0000-000000000001', 'input_finance', 1000, 'SDG', current_date, 'bank', 0, '51000000-0000-0000-0000-000000000001', 0.5, '', 'k-rate-00001')$q$,
                   'سعر الصرف خارج المعقول', 'وسعرٌ غير معقول');
  perform _refuses($q$select ledger_link_propose('aa000000-0000-0000-0000-000000000001', 'harvest_share', 1000, 'USD', current_date, null, 0, '51000000-0000-0000-0000-000000000001', null, '', 'k-wrong-0001')$q$,
                   'يقترحه الطرف الآخر', 'والمستثمر لا يقترح نصيب الحصاد (المزارع يقترحه)');
  perform _act_as('f1000000-0000-0000-0000-0000000000f1');
  perform _refuses($q$select ledger_link_propose('aa000000-0000-0000-0000-000000000001', 'input_finance', 1000, 'USD', current_date, 'bank', 0, '51000000-0000-0000-0000-000000000001', null, '', 'k-farmer-001')$q$,
                   'يقترحه الطرف الآخر', 'والمزارع لا يقترح التمويل (المستثمر يقترحه)');
  perform _act_as('c3000000-0000-0000-0000-0000000000c3');
  perform _refuses($q$select ledger_link_propose('aa000000-0000-0000-0000-000000000001', 'input_finance', 1000, 'USD', current_date, 'bank', 0, '51000000-0000-0000-0000-000000000001', null, '', 'k-strange-01')$q$,
                   'لست طرفاً في هذا العقد', 'والغريب لا يقترح على أحد');
  perform _act_as(null);
  perform _refuses($q$select ledger_link_propose('aa000000-0000-0000-0000-000000000001', 'input_finance', 1000, 'USD', current_date, 'bank', 0, '51000000-0000-0000-0000-000000000001', null, '', 'k-nobody-001')$q$,
                   'سجّل الدخول أولاً', 'ومن غير دخول');
end $$;
reset role;
do $$
declare l uuid := _id('L1');
begin
  perform _eq((select status from ledger_links where id = l), 'pending', 'الاقتراح معلّق');
  perform _eq((select count(*)::int from journal_entries), 0, 'ولا قيدَ في أيّ دفتر');
  perform _eq((select count(*)::int from ledger_books where kind = 'investor' and owner_id = 'a1000000-0000-0000-0000-0000000000a1'), 1, 'فُتح دفتر المستثمر لمقترِحه');
  perform _eq((select counter_book is null from ledger_links where id = l), true, 'ودفتر الطرف الآخر لم يُفتح بعد (لا نفتح دفتراً لمن لم يؤكّد)');
  perform _eq((select count(*)::int from ledger_links), 1, 'واقتراحٌ واحد في الجدول');
  perform _eq((select count(*)::int from notifications where recipient_id = 'f1000000-0000-0000-0000-0000000000f1' and kind = 'ledger_link'), 1, 'وأُشعر الطرف الآخر');
  perform _eq((select title from notifications where recipient_id = 'f1000000-0000-0000-0000-0000000000f1' and kind = 'ledger_link'), 'اقتراح قيدٍ في دفترك: تمويل مدخلات', 'بعنوانٍ يقول ما هو');
end $$;

\echo ''
\echo '=========================================================================='
\echo 'ب) التأكيد: الدفتران في معاملةٍ واحدة بالرابط نفسه'
\echo '=========================================================================='
set role authenticated;
do $$
begin
  perform _act_as('a1000000-0000-0000-0000-0000000000a1');
  perform _refuses(format($q$select ledger_link_confirm(%L)$q$, _id('L1')), 'ليس هذا اقتراحاً موجّهاً إليك', 'المقترِح لا يؤكّد اقتراحه');
  perform _act_as('c3000000-0000-0000-0000-0000000000c3');
  perform _refuses(format($q$select ledger_link_confirm(%L)$q$, _id('L1')), 'ليس هذا اقتراحاً موجّهاً إليك', 'والغريب لا يؤكّد');
  perform _act_as('f1000000-0000-0000-0000-0000000000f1');
  perform ledger_link_confirm(_id('L1'));
  perform _refuses(format($q$select ledger_link_confirm(%L)$q$, _id('L1')), 'سُبق البتّ', 'والتأكيد مرّتين يُرفض');
  perform _refuses(format($q$select ledger_link_reject(%L, 'غلط')$q$, _id('L1')), 'سُبق البتّ', 'والاعتراض بعد التأكيد');
end $$;
reset role;
do $$
declare l uuid := _id('L1'); i uuid := 'a1000000-0000-0000-0000-0000000000a1'; f uuid := 'f1000000-0000-0000-0000-0000000000f1'; s1 uuid := '51000000-0000-0000-0000-000000000001';
begin
  perform _eq((select status from ledger_links where id = l), 'confirmed', 'أُكِّد');
  perform _eq(_entries_of(l), 2, 'وقُيِّد قيدان بالرابط نفسه');
  perform _eq((select count(distinct book_id)::int from journal_entries where link_id = l), 2, 'في دفترين مختلفين');
  perform _eq(_net(i, 'investor', 'deployed_season', s1), 300000::bigint, 'المستثمر: توظيفٌ في الموسم ٣٬٠٠٠$ (مدين)');
  perform _eq(_net(i, 'investor', 'bank'), -300000::bigint, 'ومن بنكه (دائن)');
  perform _eq(_net(f, 'farm', 'crops_in_progress', s1), 300000::bigint, 'والمزارع: محاصيل قائمة ٣٬٠٠٠$ (مدين)');
  perform _eq(_net(f, 'farm', 'financing_from_investor', s1), -300000::bigint, 'مقابل تمويل مدخلات من مستثمر (دائن)');
  perform _eq((select count(*)::int from ledger_links where id = l and proposer_entry is not null and counter_entry is not null and counter_book is not null), 1, 'والاقتراح يحمل القيدين والدفترين');
  perform _eq((select count(*)::int from journal_entries where link_id = l and source_type = 'ledger_link' and source_id = l), 2, 'ومصدرهما الاقتراح');
  perform _eq((select created_by from journal_entries where id = (select proposer_entry from ledger_links where id = l)), i, 'قيد المقترِح باسمه');
  perform _eq((select created_by from journal_entries where id = (select counter_entry from ledger_links where id = l)), f, 'وقيد المؤكِّد باسمه');
  perform _eq((select entry_date from journal_entries where id = (select counter_entry from ledger_links where id = l)), current_date - 3, 'بتاريخ الاقتراح');
  perform _eq((select count(*)::int from notifications where recipient_id = i and kind = 'ledger_link'), 1, 'وأُشعر المقترِح بالتأكيد');
  perform _eq((select balanced from ledger_trial_balance_proof((select id from ledger_books where owner_id = i and kind = 'investor'))), true, 'دفتر المستثمر متوازن');
  perform _eq((select balanced from ledger_trial_balance_proof((select id from ledger_books where owner_id = f and kind = 'farm'))), true, 'ودفتر المزارع متوازن');
end $$;

\echo ''
\echo '=========================================================================='
\echo 'ج) نصيب الحصاد: التمويل يُطفأ والباقي ربح، أو خسارة'
\echo '=========================================================================='
set role authenticated;
do $$
begin
  perform _act_as('f1000000-0000-0000-0000-0000000000f1');
  insert into _ids values ('L2', ledger_link_propose('aa000000-0000-0000-0000-000000000001', 'harvest_share', 600000, 'USD', current_date - 1, null,
                                                      300000, '51000000-0000-0000-0000-000000000001', null, 'حصاد القمح', 'key-share-0001'));
  perform _act_as('a1000000-0000-0000-0000-0000000000a1');
  perform ledger_link_confirm(_id('L2'));
  -- A second season, financed 3,000 and yielding the investor only 1,000: the shortfall is the investor's loss.
  insert into _ids values ('L3', ledger_link_propose('aa000000-0000-0000-0000-000000000001', 'input_finance', 300000, 'USD', current_date - 3, 'wallet',
                                                      0, '53000000-0000-0000-0000-000000000003', null, '', 'key-input-0003'));
  perform _act_as('f1000000-0000-0000-0000-0000000000f1');
  perform ledger_link_confirm(_id('L3'));
  insert into _ids values ('L4', ledger_link_propose('aa000000-0000-0000-0000-000000000001', 'harvest_share', 100000, 'USD', current_date - 1, null,
                                                      300000, '53000000-0000-0000-0000-000000000003', null, 'موسم خاسر', 'key-share-0002'));
  perform _act_as('a1000000-0000-0000-0000-0000000000a1');
  perform ledger_link_confirm(_id('L4'));
end $$;
reset role;
do $$
declare i uuid := 'a1000000-0000-0000-0000-0000000000a1'; f uuid := 'f1000000-0000-0000-0000-0000000000f1';
        s1 uuid := '51000000-0000-0000-0000-000000000001'; s3 uuid := '53000000-0000-0000-0000-000000000003';
begin
  perform _eq(_net(f, 'farm', 'financing_from_investor', s1), 0::bigint, 'المزارع: التمويل أُطفئ بالحصّة');
  perform _eq(_net(f, 'farm', 'partner_share', s1), 300000::bigint, 'وحصّة الشريك الصافية ٣٬٠٠٠$ مصروف');
  perform _eq(_net(f, 'farm', 'due_to_partner', s1), -600000::bigint, 'ومستحقٌّ للمستثمر ٦٬٠٠٠$');
  perform _eq(_net(i, 'investor', 'due_from_farmer', s1), 600000::bigint, 'المستثمر: مستحقٌّ من المزارع ٦٬٠٠٠$');
  perform _eq(_net(i, 'investor', 'deployed_season', s1), 0::bigint, 'والتوظيف رجع كاملاً');
  perform _eq(_net(i, 'investor', 'share_of_harvest', s1), -300000::bigint, 'وربحه ٣٬٠٠٠$ إيراد');
  perform _eq(_net(i, 'investor', 'due_from_farmer', s1) + _net(f, 'farm', 'due_to_partner', s1), 0::bigint, 'وما على المزارع = ما للمستثمر: تتطابق الذمّتان');

  perform _eq(_net(f, 'farm', 'financing_from_investor', s3), 0::bigint, 'موسم الخسارة: التمويل أُطفئ كلّه');
  perform _eq(_net(f, 'farm', 'due_to_partner', s3), -100000::bigint, 'ولا يستحقّ المستثمر إلا حصّته ١٬٠٠٠$');
  perform _eq(_net(f, 'farm', 'other_income', s3), -200000::bigint, 'وما لا يُسترَدّ من التمويل (٢٬٠٠٠$) دخلٌ للمزارع');
  perform _eq(_net(f, 'farm', 'partner_share', s3), 0::bigint, 'ولا حصّة ربح');
  perform _eq(_net(i, 'investor', 'crop_loss', s3), 200000::bigint, 'والمستثمر يخسر ٢٬٠٠٠$');
  perform _eq(_net(i, 'investor', 'deployed_season', s3), 0::bigint, 'والتوظيف أُغلق');
  perform _eq(_net(i, 'investor', 'due_from_farmer', s3) + _net(f, 'farm', 'due_to_partner', s3), 0::bigint, 'والذمّتان تتطابقان');
  perform _eq((select balanced from ledger_trial_balance_proof((select id from ledger_books where owner_id = i and kind = 'investor'))), true, 'والدفتران متوازنان');
  perform _eq((select equation_holds from ledger_trial_balance_proof((select id from ledger_books where owner_id = f and kind = 'farm'))), true, 'والمعادلة تتحقّق');
end $$;

\echo ''
\echo '=========================================================================='
\echo 'د) التسليم والأجرة'
\echo '=========================================================================='
set role authenticated;
do $$
begin
  perform _act_as('f1000000-0000-0000-0000-0000000000f1');
  insert into _ids values ('L5', ledger_link_propose('aa000000-0000-0000-0000-000000000001', 'payout', 600000, 'USD', current_date, 'cash',
                                                      0, '51000000-0000-0000-0000-000000000001', null, '', 'key-payout-001'));
  perform _act_as('a1000000-0000-0000-0000-0000000000a1');
  perform _refuses(format($q$select ledger_link_confirm(%L)$q$, _id('L5')), 'اختر أين استلمت', 'الاستلام بلا جهة يُرفض');
  perform ledger_link_confirm(_id('L5'), 'wallet');
  insert into _ids values ('L6', ledger_link_propose('aa000000-0000-0000-0000-000000000002', 'rent_payment', 500000, 'USD', current_date - 2, 'bank',
                                                      0, null, null, 'إيجار الموسم', 'key-rent-00001'));
  perform _act_as('f1000000-0000-0000-0000-0000000000f1');
  perform ledger_link_confirm(_id('L6'), 'cash');
end $$;
reset role;
do $$
declare i uuid := 'a1000000-0000-0000-0000-0000000000a1'; f uuid := 'f1000000-0000-0000-0000-0000000000f1'; s1 uuid := '51000000-0000-0000-0000-000000000001';
begin
  perform _eq(_net(f, 'farm', 'due_to_partner', s1), 0::bigint, 'التسليم: المزارع صفّى ما عليه');
  perform _eq(_net(i, 'investor', 'due_from_farmer', s1), 0::bigint, 'والمستثمر استلم ما له');
  perform _eq(_net(i, 'investor', 'wallet'), 300000::bigint, 'ومحفظة المستثمر: دخلها ٦٬٠٠٠$ وخرج منها ٣٬٠٠٠$ للموسم الثاني');
  perform _eq((select counter_account from ledger_links where id = _id('L5')), 'wallet', 'وجهة الاستلام محفوظة');
  perform _eq(_net(i, 'investor', 'prepaid_rent'), 500000::bigint, 'الأجرة: المستثمر دفع ٥٬٠٠٠$ (إيجار مدفوع)');
  perform _eq(_net(f, 'farm', 'service_income'), -500000::bigint, 'والمالك إيراد ٥٬٠٠٠$');
  perform _eq(_net(f, 'farm', 'cash_on_hand'), -100000::bigint, 'ونقد المزارع: خرج ٦٬٠٠٠$ تسليماً ودخل ٥٬٠٠٠$ أجرة');
  perform _eq(_entries_of(_id('L6')), 2, 'بقيدين');
end $$;

\echo ''
\echo '=========================================================================='
\echo 'ه) الجنيه: سعرٌ واحد للدفترين'
\echo '=========================================================================='
set role authenticated;
do $$
begin
  perform _act_as('a1000000-0000-0000-0000-0000000000a1');
  -- 2,450,500 pounds at a typed 3000 (not the published 2450.5) are $816.83.
  insert into _ids values ('L7', ledger_link_propose('aa000000-0000-0000-0000-000000000001', 'input_finance', 245050000, 'SDG', current_date - 3, 'bank',
                                                      0, '51000000-0000-0000-0000-000000000001', 3000, 'بالجنيه', 'key-sdg-000001'));
  -- The same without a typed rate takes the latest published one.
  insert into _ids values ('L8', ledger_link_propose('aa000000-0000-0000-0000-000000000001', 'input_finance', 245050000, 'SDG', current_date, 'bank',
                                                      0, '51000000-0000-0000-0000-000000000001', null, 'بلا سعر', 'key-sdg-000002'));
  -- And one dated when no rate is published within seven days.
  insert into _ids values ('L9', ledger_link_propose('aa000000-0000-0000-0000-000000000001', 'input_finance', 245050000, 'SDG', current_date - 40, 'bank',
                                                      0, '51000000-0000-0000-0000-000000000001', null, 'قديم', 'key-sdg-000003'));
  perform _act_as('f1000000-0000-0000-0000-0000000000f1');
  perform ledger_link_confirm(_id('L7'));
  perform ledger_link_confirm(_id('L8'));
  perform _refuses(format($q$select ledger_link_confirm(%L)$q$, _id('L9')), 'لا سعر صرفٍ منشوراً', 'ولا سعرَ منشوراً ولا مكتوباً: لا يُؤكَّد');
end $$;
reset role;
do $$
declare i uuid := 'a1000000-0000-0000-0000-0000000000a1'; f uuid := 'f1000000-0000-0000-0000-0000000000f1'; s1 uuid := '51000000-0000-0000-0000-000000000001';
begin
  perform _eq((select fx_rate from ledger_links where id = _id('L7')), 3000.000000::numeric, 'سعر الاقتراح المكتوب محفوظ');
  perform _eq((select array_agg(distinct fx_rate)::text from journal_entries where link_id = _id('L7')), '{3000.000000}', 'وهو سعر القيدين معاً (لا السعر المنشور)');
  perform _eq((select fx_source from ledger_links where id = _id('L7')), 'user', 'مصدره «سعر المستخدم»');
  perform _eq((select array_agg(distinct fx_rate)::text from journal_entries where link_id = _id('L8')), '{2450.500000}', 'وبلا سعرٍ مكتوب: السعر المنشور للقيدين معاً');
  perform _eq((select fx_source from ledger_links where id = _id('L8')), 'parallel', 'ومصدره «سوق موازية»');
  perform _eq((select array_agg(distinct base_minor order by base_minor)::text from journal_lines where entry_id in (select id from journal_entries where link_id = _id('L7'))), '{81683}', 'والدولار ٨١٦٫٨٣$ في كلّ سطر');
  perform _eq((select array_agg(distinct base_minor order by base_minor)::text from journal_lines where entry_id in (select id from journal_entries where link_id = _id('L8'))), '{100000}', 'وبالسعر المنشور ١٬٠٠٠$');
  perform _eq((select status from ledger_links where id = _id('L9')), 'pending', 'وما رُفض بقي معلّقاً');
  perform _eq(_entries_of(_id('L9')), 0, 'ولم يُقيَّد منه شيء');
  perform _eq(_net_cur(i, 'investor', 'deployed_season', 'SDG'), 490100000::bigint, 'ويحتفظ الدفتران بالجنيه كما دُفع');
end $$;

\echo ''
\echo '=========================================================================='
\echo 'و) الاعتراض والإلغاء لا يمسّان دفتراً'
\echo '=========================================================================='
set role authenticated;
do $$
begin
  perform _act_as('a1000000-0000-0000-0000-0000000000a1');
  insert into _ids values ('L10', ledger_link_propose('aa000000-0000-0000-0000-000000000001', 'input_finance', 100000, 'USD', current_date - 2, 'cash',
                                                       0, '51000000-0000-0000-0000-000000000001', null, 'للاعتراض', 'key-reject-001'));
  insert into _ids values ('L11', ledger_link_propose('aa000000-0000-0000-0000-000000000001', 'input_finance', 100000, 'USD', current_date - 2, 'cash',
                                                       0, '51000000-0000-0000-0000-000000000001', null, 'للإلغاء', 'key-cancel-001'));
end $$;
do $$
begin
  perform _act_as('f1000000-0000-0000-0000-0000000000f1');
  perform _refuses(format($q$select ledger_link_reject(%L, 'لا')$q$, _id('L10')), 'اكتب سبب الاعتراض', 'الاعتراض بلا سببٍ مفهوم يُرفض');
  perform _refuses(format($q$select ledger_link_cancel(%L)$q$, _id('L10')), 'ليس هذا اقتراحك', 'والمؤكِّد لا يلغي اقتراح غيره');
  perform ledger_link_reject(_id('L10'), 'المبلغ ليس ما دُفع');
  perform _refuses(format($q$select ledger_link_confirm(%L)$q$, _id('L10')), 'سُبق البتّ', 'ولا يُؤكَّد ما اعتُرض عليه');
  perform _act_as('a1000000-0000-0000-0000-0000000000a1');
  perform ledger_link_cancel(_id('L11'));
  perform _refuses(format($q$select ledger_link_cancel(%L)$q$, _id('L11')), 'سُبق البتّ', 'ولا يُلغى مرّتين');
  perform _act_as('f1000000-0000-0000-0000-0000000000f1');
  perform _refuses(format($q$select ledger_link_confirm(%L)$q$, _id('L11')), 'سُبق البتّ', 'ولا يُؤكَّد ما أُلغي');
end $$;
reset role;
do $$
begin
  perform _eq((select status || '|' || reject_reason from ledger_links where id = _id('L10')), 'rejected|المبلغ ليس ما دُفع', 'الاعتراض بسببه محفوظ');
  perform _eq((select status from ledger_links where id = _id('L11')), 'cancelled', 'والإلغاء محفوظ');
  perform _eq(_entries_of(_id('L10')) + _entries_of(_id('L11')), 0, 'ولم يُقيَّد شيء');
  perform _eq((select count(*)::int from notifications where recipient_id = 'a1000000-0000-0000-0000-0000000000a1' and title like 'اعترض شريكك%'), 1, 'وأُشعر المقترِح بالاعتراض وسببه');
end $$;

\echo ''
\echo '=========================================================================='
\echo 'ز) الفترة المقفلة: لا يُقيَّد أحد الدفترين وحده'
\echo '=========================================================================='
update ledger_books set closed_through = current_date - 2 where owner_id = 'f1000000-0000-0000-0000-0000000000f1' and kind = 'farm';
set role authenticated;
do $$
begin
  perform _act_as('a1000000-0000-0000-0000-0000000000a1');
  insert into _ids values ('L12', ledger_link_propose('aa000000-0000-0000-0000-000000000001', 'input_finance', 100000, 'USD', current_date - 3, 'cash',
                                                       0, '51000000-0000-0000-0000-000000000001', null, 'في فترة مقفلة', 'key-closed-001'));
  perform _act_as('f1000000-0000-0000-0000-0000000000f1');
  perform _refuses(format($q$select ledger_link_confirm(%L)$q$, _id('L12')), 'مقفلة', 'المؤكِّد دفتره مقفل في ذلك التاريخ: يُرفض');
end $$;
reset role;
do $$
begin
  perform _eq(_entries_of(_id('L12')), 0, 'ولم يُقيَّد قيدُ المقترِح أيضاً (معاملةٌ واحدة)');
  perform _eq((select status from ledger_links where id = _id('L12')), 'pending', 'والاقتراح باقٍ معلّقاً يؤكَّد بعد تعديل التاريخ أو يُلغى');
end $$;

\echo ''
\echo '=========================================================================='
\echo 'ح) لا تغيير بعد البتّ، ولا حذف'
\echo '=========================================================================='
do $$
begin
  perform _refuses(format($q$update ledger_links set amount_minor = 1 where id = %L$q$, _id('L1')), 'بعد البتّ فيه لا يتغيّر', 'المؤكَّد لا يتغيّر');
  perform _refuses(format($q$update ledger_links set amount_minor = 1 where id = %L$q$, _id('L12')), 'لا يتغيّر من القيد المتقابل إلا بتّه', 'والمعلّق لا يتغيّر مبلغه');
  perform _refuses(format($q$update ledger_links set proposer_owner = counter_owner where id = %L$q$, _id('L12')), 'لا يتغيّر من القيد المتقابل إلا بتّه', 'ولا طرفاه');
  perform _refuses(format($q$delete from ledger_links where id = %L$q$, _id('L12')), 'لا تُحذف', 'ولا يُحذف');
  perform _refuses($q$truncate ledger_links$q$, 'لا تُحذف', 'ولا يُفرَّغ الجدول');
  perform _refuses(format($q$update ledger_links set status = 'confirmed' where id = %L$q$, _id('L12')), 'violates check constraint', 'ولا يُؤكَّد بلا قيدين');
end $$;

\echo ''
\echo '=========================================================================='
\echo 'ط) من يقرأ، والقائمة، والإشراف، والصلاحيّات'
\echo '=========================================================================='
set role authenticated;
do $$
begin
  perform _act_as('a1000000-0000-0000-0000-0000000000a1');
  perform _eq((select count(*)::int from ledger_links) >= 10, true, 'المستثمر يقرأ اقتراحاته');
  perform _eq((select count(*)::int from ledger_links_list() where other_name = 'فاطمة المزارعة') >= 10, true, 'والقائمة تذكر اسم الطرف الآخر');
  perform _eq((select mine from ledger_links_list() where id = _id('L1')), true, 'وتبيّن أنّه اقتراحه');
  perform _eq((select mine from ledger_links_list() where id = _id('L2')), false, 'وأنّ هذا موجّهٌ إليه');
  perform _eq((select agreement_ref from ledger_links_list() where id = _id('L1')), 'SA-1', 'وعقده');
  perform _act_as('f1000000-0000-0000-0000-0000000000f1');
  perform _eq((select count(*)::int from ledger_links) >= 10, true, 'والمزارع يقرأ ما وُجّه إليه');
  perform _eq((select other_name from ledger_links_list() where id = _id('L1')), 'أحمد المستثمر', 'باسم مقترِحه');
  perform _act_as('c3000000-0000-0000-0000-0000000000c3');
  perform _eq((select count(*)::int from ledger_links), 0, 'والغريب لا يقرأ شيئاً');
  perform _eq((select count(*)::int from ledger_links_list()), 0, 'ولا قائمته');
  perform _act_as('ad000000-0000-0000-0000-0000000000ad');
  perform _eq((select count(*)::int from ledger_links), 0, 'والمدير لا يقرأ اقتراحات الناس');
  perform _eq((select bool_and(suppressed) from oversight_links(current_date - 30, current_date)), true, 'ويرى الإحصاء مجمَّعاً: كلّ خلاياه محجوبة لقلّة الأطراف');
  perform _eq((select count(*)::int from oversight_links(current_date - 30, current_date) where links is not null or amount_usd_minor is not null), 0, 'بلا عددٍ ولا مبلغ');
  perform _act_as('a1000000-0000-0000-0000-0000000000a1');
  perform _refuses($q$select * from oversight_links(current_date - 30, current_date)$q$, 'للإدارة وحدها', 'والمستخدم العاديّ لا يرى الإحصاء');
  perform _refuses($q$insert into ledger_links (kind, agreement_id, proposer_owner, counter_owner, proposer_book, amount_minor, currency, entry_date, idem_key)
                       values ('payout', 'aa000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-0000000000a1', 'f1000000-0000-0000-0000-0000000000f1',
                               gen_random_uuid(), 1, 'USD', current_date, 'direct-insert-1')$q$, 'permission denied', 'ولا كتابة مباشرة في الجدول');
end $$;
reset role;
do $$
declare fns text[] := array['ledger_link_propose(uuid,text,bigint,text,date,text,bigint,uuid,numeric,text,text)', 'ledger_link_confirm(uuid,text)',
                            'ledger_link_reject(uuid,text)', 'ledger_link_cancel(uuid)', 'ledger_links_list()'];
        f text;
begin
  foreach f in array fns loop
    perform _eq(has_function_privilege('anon', f, 'execute') or has_function_privilege('service_role', f, 'execute'), false, 'لا زائر ولا مفتاح خدمة: ' || split_part(f, '(', 1));
    perform _eq(has_function_privilege('authenticated', f, 'execute'), true, 'والمسجَّل يستدعي: ' || split_part(f, '(', 1));
  end loop;
  perform _eq(has_function_privilege('anon', 'oversight_links(date,date)', 'execute'), false, 'والإحصاء ليس للزائر');
  perform _eq(has_function_privilege('authenticated', '_ledger_link_lines(text,text,text,bigint,bigint,text,uuid)', 'execute')
              or has_function_privilege('authenticated', 'ledger_links_guard()', 'execute')
              or has_function_privilege('authenticated', '_ledger_link_label(text)', 'execute'), false, 'والداخليّ لا يستدعيه أحد');
end $$;

\echo ''
\echo '=========================================================================='
\echo 'ي) سلامة الدفاتر كلّها'
\echo '=========================================================================='
do $$
begin
  perform _eq((select count(*)::int from journal_entries e where (select coalesce(sum(base_minor) filter (where side = 'D'), 0) - coalesce(sum(base_minor) filter (where side = 'C'), 0)
                                                                    from journal_lines where entry_id = e.id) <> 0), 0, 'كلّ قيدٍ في القاعدة متوازن');
  perform _eq((select count(*)::int from journal_entries where link_id is not null and source_type is distinct from 'ledger_link'), 0, 'وكلّ قيدٍ مرتبط مصدرُه قيدٌ متقابل');
  perform _eq((select count(*)::int from (select link_id from journal_entries where link_id is not null group by link_id having count(*) <> 2) q), 0, 'وكلّ رابطٍ له قيدان بالضبط');
  perform _eq((select count(*)::int from ledger_links where status = 'confirmed') , (select count(distinct link_id)::int from journal_entries where link_id is not null), 'وعدد المؤكَّد = عدد الروابط المقيَّدة');
end $$;

do $$
declare n integer;
begin
  select fails into n from _score;
  if n > 0 then raise exception '% فحصاً فشل', n; end if;
end $$;
\echo ''
\echo 'OK'
