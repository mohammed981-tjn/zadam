-- بوّابةُ إلغاء القيد المتقابل باتّفاق الطرفين، وأعداد المطابقة للإدارة (البند ١٩٢).
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

-- Six more people for the aggregate checks: three farms and three investors, each with a book of its own.
insert into auth.users (id) values
  ('f2000000-0000-0000-0000-0000000000f2'), ('f3000000-0000-0000-0000-0000000000f3'), ('f4000000-0000-0000-0000-0000000000f4'),
  ('a2000000-0000-0000-0000-0000000000a2'), ('a3000000-0000-0000-0000-0000000000a3'), ('a4000000-0000-0000-0000-0000000000a4')
on conflict (id) do nothing;
insert into profiles (id, full_name, role) values
  ('f2000000-0000-0000-0000-0000000000f2', 'مزارع ٢', 'investor'), ('f3000000-0000-0000-0000-0000000000f3', 'مزارع ٣', 'investor'),
  ('f4000000-0000-0000-0000-0000000000f4', 'مزارع ٤', 'investor'), ('a2000000-0000-0000-0000-0000000000a2', 'مستثمر ٢', 'investor'),
  ('a3000000-0000-0000-0000-0000000000a3', 'مستثمر ٣', 'investor'), ('a4000000-0000-0000-0000-0000000000a4', 'مستثمر ٤', 'investor')
on conflict (id) do nothing;

\echo ''
\echo '=========================================================================='
\echo 'أ) التجهيز: ثلاثة قيودٍ متقابلة مؤكَّدة'
\echo '=========================================================================='
set role authenticated;
do $$
begin
  perform _act_as('a1000000-0000-0000-0000-0000000000a1');
  insert into _ids values ('L1', ledger_link_propose('aa000000-0000-0000-0000-000000000001', 'input_finance', 300000, 'USD', current_date - 3, 'bank',
                                                      0, '51000000-0000-0000-0000-000000000001', null, 'بذور وسماد', 'key-input-0001'));
  insert into _ids values ('L3', ledger_link_propose('aa000000-0000-0000-0000-000000000001', 'input_finance', 250000, 'USD', current_date - 3, 'wallet',
                                                      0, '53000000-0000-0000-0000-000000000003', null, 'تمويل الفول', 'key-input-0003'));
  perform _act_as('f1000000-0000-0000-0000-0000000000f1');
  perform ledger_link_confirm(_id('L1'));
  perform ledger_link_confirm(_id('L3'));
  insert into _ids values ('L2', ledger_link_propose('aa000000-0000-0000-0000-000000000001', 'harvest_share', 600000, 'USD', current_date - 1, null,
                                                      300000, '51000000-0000-0000-0000-000000000001', null, 'حصاد القمح', 'key-share-0001'));
  perform _act_as('a1000000-0000-0000-0000-0000000000a1');
  perform ledger_link_confirm(_id('L2'));
  -- One left pending, for the refusal of cancelling what was never confirmed.
  insert into _ids values ('LP', ledger_link_propose('aa000000-0000-0000-0000-000000000001', 'input_finance', 1000, 'USD', current_date, 'bank',
                                                      0, '51000000-0000-0000-0000-000000000001', null, 'معلّق', 'key-pending-01'));
end $$;
reset role;
do $$
declare i uuid := 'a1000000-0000-0000-0000-0000000000a1'; f uuid := 'f1000000-0000-0000-0000-0000000000f1'; s1 uuid := '51000000-0000-0000-0000-000000000001';
begin
  perform _eq((select count(*)::int from ledger_links where status = 'confirmed'), 3, 'ثلاثة قيودٍ مؤكَّدة');
  perform _eq(_net(i, 'investor', 'bank'), -300000::bigint, 'المستثمر: ٣٬٠٠٠$ خرجت من بنكه للقمح، قبل الإلغاء');
  perform _eq(_net(f, 'farm', 'crops_in_progress', s1), 300000::bigint, 'والمزارع: محاصيل قائمة في القمح ٣٬٠٠٠$');
  perform _eq(_net(f, 'farm', 'financing_from_investor', s1), 0::bigint, 'والتمويل أُطفئ بنصيب الحصاد (٣٬٠٠٠ − ٣٬٠٠٠)');
  perform _eq((select count(*)::int from journal_entries where reversal_of is not null), 0, 'ولا قيدَ عكسٍ بعد');
end $$;

\echo ''
\echo '=========================================================================='
\echo 'ب) الطلب: لا يُمسّ دفترٌ، ولا يطلب غريب'
\echo '=========================================================================='
set role authenticated;
do $$
begin
  perform _act_as('c3000000-0000-0000-0000-0000000000c3');
  perform _refuses(format($q$select ledger_link_reversal_request(%L, 'سبب كافٍ')$q$, _id('L1')), 'ليس هذا قيداً من قيودك', 'الغريب لا يطلب إلغاء قيدِ غيره');
  perform _act_as('a1000000-0000-0000-0000-0000000000a1');
  perform _refuses(format($q$select ledger_link_reversal_request(%L, 'سبب كافٍ')$q$, _id('LP')), 'لا يُطلب إلغاء إلا لقيدٍ مؤكَّد', 'والمعلّق لا يُطلب إلغاؤه (يُلغى بالإلغاء العاديّ)');
  perform _refuses(format($q$select ledger_link_reversal_request(%L, 'ab')$q$, _id('L1')), 'اكتب سبب الإلغاء', 'والسبب القصير يُرفض');
  perform _refuses(format($q$select ledger_link_reversal_request(%L, '   ')$q$, _id('L1')), 'اكتب سبب الإلغاء', 'والفارغ');
  insert into _ids values ('R1', ledger_link_reversal_request(_id('L1'), 'كُتب المبلغ خطأً'));
  perform _eq(ledger_link_reversal_request(_id('L1'), 'كُتب المبلغ خطأً'), _id('R1'), 'الطلب نفسه مرّتين طلبٌ واحد');
  perform _act_as('f1000000-0000-0000-0000-0000000000f1');
  perform _refuses(format($q$select ledger_link_reversal_request(%L, 'وأنا أيضاً')$q$, _id('L1')), 'شريكك طلب إلغاءه من قبل', 'والطرف الآخر لا يفتح طلباً ثانياً على قيدٍ له طلب');
  perform _act_as(null);
  perform _refuses(format($q$select ledger_link_reversal_request(%L, 'سبب كافٍ')$q$, _id('L1')), 'سجّل الدخول أولاً', 'ومن غير دخول');
end $$;
reset role;
do $$
declare l uuid := _id('L1'); r uuid := _id('R1');
begin
  perform _eq((select status from ledger_link_reversals where id = r), 'pending', 'الطلب معلّق');
  perform _eq((select other_party from ledger_link_reversals where id = r), 'f1000000-0000-0000-0000-0000000000f1'::uuid, 'موجَّهٌ إلى المزارع');
  perform _eq((select requested_by from ledger_link_reversals where id = r), 'a1000000-0000-0000-0000-0000000000a1'::uuid, 'من المستثمر');
  perform _eq((select count(*)::int from ledger_link_reversals), 1, 'وطلبٌ واحد في الجدول');
  perform _eq((select count(*)::int from journal_entries where reversal_of is not null), 0, 'ولم يُعكس قيد');
  perform _eq(_entries_of(l), 2, 'والقيدان باقيان');
  perform _eq((select title from notifications where recipient_id = 'f1000000-0000-0000-0000-0000000000f1' and title like 'طلب إلغاء%'), 'طلب إلغاء قيدٍ متقابل: تمويل مدخلات', 'وأُشعر الطرف الآخر');
end $$;

\echo ''
\echo '=========================================================================='
\echo 'ج) الرفض والسحب: يبقى القيدان'
\echo '=========================================================================='
set role authenticated;
do $$
begin
  perform _act_as('a1000000-0000-0000-0000-0000000000a1');
  perform _refuses(format($q$select ledger_link_reversal_accept(%L)$q$, _id('R1')), 'ليس هذا طلباً موجّهاً إليك', 'صاحب الطلب لا يقبل طلبه');
  perform _refuses(format($q$select ledger_link_reversal_reject(%L, 'سبب كافٍ')$q$, _id('R1')), 'ليس هذا طلباً موجّهاً إليك', 'ولا يرفضه');
  perform _act_as('c3000000-0000-0000-0000-0000000000c3');
  perform _refuses(format($q$select ledger_link_reversal_accept(%L)$q$, _id('R1')), 'ليس هذا طلباً موجّهاً إليك', 'والغريب لا يقبل');
  perform _refuses(format($q$select ledger_link_reversal_withdraw(%L)$q$, _id('R1')), 'ليس هذا طلبك', 'ولا يسحب');
  perform _act_as('f1000000-0000-0000-0000-0000000000f1');
  perform _refuses(format($q$select ledger_link_reversal_withdraw(%L)$q$, _id('R1')), 'ليس هذا طلبك', 'والمطلوب منه لا يسحب طلب غيره');
  perform _refuses(format($q$select ledger_link_reversal_reject(%L, 'لا')$q$, _id('R1')), 'اكتب سبب الرفض', 'والرفض بلا سببٍ كافٍ');
  perform ledger_link_reversal_reject(_id('R1'), 'المبلغ صحيح وقد تسلّمته');
  perform _refuses(format($q$select ledger_link_reversal_accept(%L)$q$, _id('R1')), 'سُبق البتّ', 'والقبول بعد الرفض');
  perform _act_as('a1000000-0000-0000-0000-0000000000a1');
  perform _refuses(format($q$select ledger_link_reversal_withdraw(%L)$q$, _id('R1')), 'سُبق البتّ', 'والسحب بعد الرفض');
  -- A rejected request does not close the door: he may ask again, and take it back.
  insert into _ids values ('R2', ledger_link_reversal_request(_id('L1'), 'طلبٌ ثانٍ بسببٍ مفصَّل'));
  perform ledger_link_reversal_withdraw(_id('R2'));
end $$;
reset role;
do $$
begin
  perform _eq((select status from ledger_link_reversals where id = _id('R1')), 'rejected', 'الطلب الأوّل مرفوض');
  perform _eq((select reject_reason from ledger_link_reversals where id = _id('R1')), 'المبلغ صحيح وقد تسلّمته', 'وسببه محفوظ');
  perform _eq((select status from ledger_link_reversals where id = _id('R2')), 'withdrawn', 'والثاني مسحوب');
  perform _eq((select count(*)::int from journal_entries where reversal_of is not null), 0, 'ولم يُعكس قيدٌ في الحالتين');
  perform _eq((select status from ledger_links where id = _id('L1')), 'confirmed', 'والقيد المتقابل مؤكَّدٌ كما كان');
  perform _eq((select count(*)::int from notifications where recipient_id = 'a1000000-0000-0000-0000-0000000000a1' and title like 'رفض شريكك إلغاء%'), 1, 'وأُشعر صاحب الطلب بالرفض');
  perform _refuses($q$update ledger_link_reversals set reason = 'غُيِّر' where id = (select id from ledger_link_reversals limit 1)$q$, 'بعد البتّ', 'ولا يتغيّر طلبٌ بُتّ فيه');
  perform _refuses($q$delete from ledger_link_reversals$q$, 'لا تُحذف', 'ولا يُحذف');
  perform _refuses($q$truncate ledger_link_reversals$q$, 'لا تُحذف', 'ولا يُفرَّغ');
end $$;

\echo ''
\echo '=========================================================================='
\echo 'د) القبول: القيدان يُعكسان معاً في معاملةٍ واحدة'
\echo '=========================================================================='
set role authenticated;
do $$
begin
  perform _act_as('a1000000-0000-0000-0000-0000000000a1');
  insert into _ids values ('R3', ledger_link_reversal_request(_id('L3'), 'الموسم أُلغي قبل الصرف'));
  perform _act_as('f1000000-0000-0000-0000-0000000000f1');
  perform ledger_link_reversal_accept(_id('R3'));
  perform _refuses(format($q$select ledger_link_reversal_accept(%L)$q$, _id('R3')), 'سُبق البتّ', 'والقبول مرّتين يُرفض');
  perform _act_as('a1000000-0000-0000-0000-0000000000a1');
  perform _refuses(format($q$select ledger_link_reversal_request(%L, 'مرّةً أخرى')$q$, _id('L3')), 'أُلغي هذا القيد من قبل', 'وما أُلغي لا يُطلب إلغاؤه ثانية');
end $$;
reset role;
do $$
declare l uuid := _id('L3'); i uuid := 'a1000000-0000-0000-0000-0000000000a1'; f uuid := 'f1000000-0000-0000-0000-0000000000f1'; s3 uuid := '53000000-0000-0000-0000-000000000003';
begin
  perform _eq((select status from ledger_link_reversals where id = _id('R3')), 'accepted', 'الطلب مقبول');
  perform _eq((select count(*)::int from journal_entries where reversal_of in (select proposer_entry from ledger_links where id = l union select counter_entry from ledger_links where id = l)), 2, 'قيدا عكسٍ بالضبط');
  perform _eq((select count(*)::int from ledger_link_reversals r where r.id = _id('R3') and proposer_reversal is not null and counter_reversal is not null), 1, 'والطلب يحملهما');
  perform _eq(_net(i, 'investor', 'deployed_season', s3), 0::bigint, 'المستثمر: عاد التوظيف في موسم الفول إلى صفر');
  perform _eq(_net(i, 'investor', 'wallet'), 0::bigint, 'ومحفظته عادت');
  perform _eq(_net(f, 'farm', 'crops_in_progress', s3), 0::bigint, 'والمزارع: عادت المحاصيل القائمة إلى صفر');
  perform _eq(_net(f, 'farm', 'financing_from_investor', s3), 0::bigint, 'وعاد التمويل إلى صفر');
  perform _eq((select status from ledger_links where id = l), 'confirmed', 'والقيد المتقابل نفسه لم يُمسّ (مؤكَّدٌ في السجلّ)');
  perform _eq(_entries_of(l), 2, 'وقيداه الأصليّان باقيان');
  perform _eq((select count(*)::int from journal_entries where link_id is not null and reversal_of is not null), 0, 'وقيدا العكس بلا رابط (فيبقى لكلّ رابطٍ قيدان)');
  perform _eq((select created_by from journal_entries where reversal_of = (select proposer_entry from ledger_links where id = l)), i, 'عكس المستثمر باسمه');
  perform _eq((select created_by from journal_entries where reversal_of = (select counter_entry from ledger_links where id = l)), f, 'وعكس المزارع باسمه');
  perform _eq((select count(*)::int from notifications where recipient_id = i and title like 'وافق شريكك على إلغاء%'), 1, 'وأُشعر صاحب الطلب');
  perform _eq(_net(i, 'investor', 'bank'), -300000::bigint, 'وقيد القمح الآخر (L1) لم يُمسّ: بنك المستثمر ما زال ناقصاً ٣٬٠٠٠$');
end $$;

\echo ''
\echo '=========================================================================='
\echo 'هـ) طرفٌ عكس قيده بنفسه من قبل: الاتّفاق يعكس الباقي ولا يُفشل'
\echo '=========================================================================='
set role authenticated;
do $$
begin
  perform _act_as('a1000000-0000-0000-0000-0000000000a1');
  -- He reverses his own side of L1 by hand, which leaves the two books apart.
  perform ledger_reverse((select proposer_entry from ledger_links where id = _id('L1')), 'عكسته بنفسي');
  insert into _ids values ('R4', ledger_link_reversal_request(_id('L1'), 'لنتّفق على إلغائه كلّه'));
  perform _act_as('f1000000-0000-0000-0000-0000000000f1');
  perform ledger_link_reversal_accept(_id('R4'));
end $$;
reset role;
do $$
declare l uuid := _id('L1'); i uuid := 'a1000000-0000-0000-0000-0000000000a1'; f uuid := 'f1000000-0000-0000-0000-0000000000f1'; s1 uuid := '51000000-0000-0000-0000-000000000001';
begin
  perform _eq((select proposer_reversal is null from ledger_link_reversals where id = _id('R4')), true, 'جانب المستثمر لم يُعكس ثانية (عُكس بيده)');
  perform _eq((select counter_reversal is not null from ledger_link_reversals where id = _id('R4')), true, 'وجانب المزارع عُكس بالاتّفاق');
  perform _eq(_net(i, 'investor', 'bank'), 0::bigint, 'المستثمر: عاد بنكه إلى صفر (عكس قيده بيده)');
  perform _eq((select count(*)::int from journal_entries where reversal_of = (select proposer_entry from ledger_links where id = l)), 1, 'وقيد عكسٍ واحدٌ لجانبه، لا اثنان');
  perform _eq(_net(f, 'farm', 'crops_in_progress', s1), 0::bigint, 'والمزارع: عادت المحاصيل القائمة في القمح إلى صفر بالاتّفاق');
end $$;

\echo ''
\echo '=========================================================================='
\echo 'و) للإدارة: ما تأخّر، والفرق بين الذمّتين'
\echo '=========================================================================='
-- Three farms and three investors each carrying one position, so that the aggregate has enough books to be shown.
select _act_as(null);
do $$
declare
  fk uuid[] := array['f2000000-0000-0000-0000-0000000000f2', 'f3000000-0000-0000-0000-0000000000f3', 'f4000000-0000-0000-0000-0000000000f4']::uuid[];
  ik uuid[] := array['a2000000-0000-0000-0000-0000000000a2', 'a3000000-0000-0000-0000-0000000000a3', 'a4000000-0000-0000-0000-0000000000a4']::uuid[];
  fa bigint[] := array[100000, 200000, 150000];
  ia bigint[] := array[100000, 200000, 140000];
  b uuid;
  n integer;
begin
  -- Before them: two books, one farm and one investor — too few to show a figure.
  perform _eq((select suppressed from oversight_reconcile()), true, 'بدفترين فقط: الفرق محجوب');
  perform _eq((select difference_minor from oversight_reconcile()) is null, true, 'ولا يُكتب له رقم');
  for n in 1..3 loop
    b := _ledger_open_book(fk[n], 'farm');
    perform _ledger_post_src(b, current_date - 2, 'حصّة', jsonb_build_array(
      jsonb_build_object('key', 'partner_share', 'side', 'D', 'currency', 'USD', 'minor', fa[n]),
      jsonb_build_object('key', 'due_to_partner', 'side', 'C', 'currency', 'USD', 'minor', fa[n])),
      'agg-farm-' || n, null, 'test', null, null, fk[n], null);
    b := _ledger_open_book(ik[n], 'investor');
    perform _ledger_post_src(b, current_date - 2, 'حصّة', jsonb_build_array(
      jsonb_build_object('key', 'due_from_farmer', 'side', 'D', 'currency', 'USD', 'minor', ia[n]),
      jsonb_build_object('key', 'share_of_harvest', 'side', 'C', 'currency', 'USD', 'minor', ia[n])),
      'agg-inv-' || n, null, 'test', null, null, ik[n], null);
  end loop;
end $$;
set role authenticated;
do $$
begin
  perform _act_as('f1000000-0000-0000-0000-0000000000f1');
  perform _refuses($q$select * from oversight_reconcile()$q$, 'للإدارة وحدها', 'ليس للمزارع أن يرى الفرق');
  perform _refuses($q$select * from oversight_stale(7)$q$, 'للإدارة وحدها', 'ولا ما تأخّر');
  perform _act_as('ad000000-0000-0000-0000-0000000000ad');
end $$;
reset role;
do $$
declare r record;
begin
  -- f1's farm book now holds L2's 6,000 share (3,000 of it financing principal... the share itself, 6,000, is due to the partner);
  -- the investor a1's mirror entry was reversed by hand in section هـ only for L1, which has no share, so the two sides agree there.
  perform _act_as('ad000000-0000-0000-0000-0000000000ad');
  select * into r from oversight_reconcile();
  perform _eq(r.suppressed, false, 'بأربعة دفاترَ في كلّ جانبٍ يُعرض');
  perform _eq(r.farm_books, 4, 'أربعة دفاتر مزارع');
  perform _eq(r.investor_books, 4, 'وأربعة دفاتر مستثمرين');
  perform _eq(r.difference_minor, r.due_to_partner_minor - r.due_from_farmer_minor, 'الفرق = ما عند المزارعين − ما عند المستثمرين');
  perform _eq(r.difference_minor, 10000::bigint, 'وهو ١٠٠$ بالضبط: فرق المصطنَع (٤٫٥٠٠$ مقابل ٤٫٤٠٠$)، والقيود المتقابلة الحقيقيّة متطابقة');
end $$;
-- Now the investor reverses his own side of the harvest share by hand: the two books drift apart, and the figure shows it.
set role authenticated;
do $$
begin
  perform _act_as('a1000000-0000-0000-0000-0000000000a1');
  perform ledger_reverse((select counter_entry from ledger_links where id = _id('L2')), 'عكسته بنفسي');
  perform _act_as('ad000000-0000-0000-0000-0000000000ad');
  perform _eq((select difference_minor from oversight_reconcile()), 610000::bigint, 'عكسُ طرفٍ واحدٍ يُظهر الفرق: ١٠٠$ + ٦٫٠٠٠$');
  perform _eq((select difference_minor from oversight_reconcile(current_date - 5)) is null, true, 'وقبل كلّ القيود لا يُعرض شيء');
  perform _eq((select suppressed from oversight_reconcile(current_date - 5)), true, 'محجوبٌ لقلّة الدفاتر');
end $$;
reset role;

-- Stale proposals: three agreements each with a pending proposal older than a week, so the cell can be shown; and one stale request alone, which cannot.
set role authenticated;
do $$
begin
  perform _act_as('a1000000-0000-0000-0000-0000000000a1');
  insert into _ids values ('LS2', ledger_link_propose('aa000000-0000-0000-0000-000000000002', 'rent_payment', 5000, 'USD', current_date - 9, 'bank', 0, null, null, 'أجرة', 'key-stale-rent'));
  perform _act_as('c3000000-0000-0000-0000-0000000000c3');
  insert into _ids values ('LS4', ledger_link_propose('aa000000-0000-0000-0000-000000000004', 'input_finance', 7000, 'USD', current_date - 9, 'bank', 0, '54000000-0000-0000-0000-000000000004', null, 'قطن', 'key-stale-cotton'));
end $$;
reset role;
alter table ledger_links disable trigger ledger_links_guard;
update ledger_links set created_at = now() - interval '10 days' where status = 'pending';
alter table ledger_links enable trigger ledger_links_guard;
set role authenticated;
do $$
declare r record;
begin
  perform _act_as('ad000000-0000-0000-0000-0000000000ad');
  select * into r from oversight_stale(7) where what = 'pending_link';
  perform _eq(r.items, 3::bigint, 'ثلاثة اقتراحاتٍ معلّقة مضى عليها أكثر من أسبوع');
  perform _eq(r.agreements, 3::bigint, 'من ثلاثة عقود');
  perform _eq(r.suppressed, false, 'فتُعرض');
  perform _eq(r.oldest_days >= 10, true, 'وأقدمها عشرة أيام فأكثر');
  select * into r from oversight_stale(11) where what = 'pending_link';
  perform _eq(r.items, 0::bigint, 'وبحدّ أحد عشر يوماً لا يتأخّر شيء');
  perform _eq(r.suppressed, false, 'والخليّة الفارغة تُعرض فارغة (لا تكشف أحداً)');
  perform _act_as('a1000000-0000-0000-0000-0000000000a1');
  insert into _ids values ('R5', ledger_link_reversal_request(_id('L2'), 'طلب إلغاءٍ متأخّر'));
end $$;
reset role;
alter table ledger_link_reversals disable trigger ledger_link_reversals_guard;
update ledger_link_reversals set created_at = now() - interval '10 days' where status = 'pending';
alter table ledger_link_reversals enable trigger ledger_link_reversals_guard;
set role authenticated;
do $$
declare r record;
begin
  perform _act_as('ad000000-0000-0000-0000-0000000000ad');
  select * into r from oversight_stale(7) where what = 'pending_reversal';
  perform _eq(r.suppressed, true, 'طلب إلغاءٍ واحدٌ متأخّر: محجوب (عقدٌ واحد)');
  perform _eq(r.items is null, true, 'ولا عدد له');
  perform _eq((select count(*)::int from oversight_stale(7)), 2, 'والجواب صفّان: الاقتراحات وطلبات الإلغاء');
  perform _refuses($q$select * from oversight_stale(0)$q$, 'مدىً غير صالح', 'ومدىً صفر');
end $$;
reset role;

\echo ''
\echo '=========================================================================='
\echo 'ز) الصلاحيّات: الكتابة بالدوالّ وحدها'
\echo '=========================================================================='
set role authenticated;
do $$
begin
  perform _act_as('a1000000-0000-0000-0000-0000000000a1');
  perform _refuses(format($q$insert into ledger_link_reversals (link_id, requested_by, other_party, reason) values (%L, %L, %L, 'مباشر')$q$,
                          _id('L2'), 'a1000000-0000-0000-0000-0000000000a1', 'f1000000-0000-0000-0000-0000000000f1'), 'permission denied', 'لا إدخال مباشر');
  perform _refuses($q$update ledger_link_reversals set status = 'accepted'$q$, 'permission denied', 'ولا تعديل مباشر');
  perform _eq((select count(*)::int from ledger_link_reversals), (select count(*)::int from ledger_link_reversals where requested_by = 'a1000000-0000-0000-0000-0000000000a1' or other_party = 'a1000000-0000-0000-0000-0000000000a1'), 'ويرى كلٌّ طلباته وحدها');
  perform _act_as('c3000000-0000-0000-0000-0000000000c3');
  perform _eq((select count(*)::int from ledger_link_reversals), 0, 'والغريب لا يرى طلباً');
  perform _eq((select count(*)::int from ledger_link_reversals_list()), 0, 'وقائمته فارغة');
  perform _act_as('f1000000-0000-0000-0000-0000000000f1');
  perform _eq((select count(*)::int from ledger_link_reversals_list() where status = 'pending' and not mine), 1, 'وللمزارع طلبٌ معلّق موجَّهٌ إليه');
end $$;
reset role;
do $$
declare fns text[] := array['ledger_link_reversal_request(uuid,text)', 'ledger_link_reversal_accept(uuid)', 'ledger_link_reversal_reject(uuid,text)',
                            'ledger_link_reversal_withdraw(uuid)', 'ledger_link_reversals_list()', 'oversight_stale(integer)', 'oversight_reconcile(date)'];
        f text;
begin
  foreach f in array fns loop
    perform _eq(has_function_privilege('anon', f, 'execute'), false, 'ليست للزائر: ' || split_part(f, '(', 1));
    perform _eq(has_function_privilege('authenticated', f, 'execute'), true, 'والمسجَّل يستدعي: ' || split_part(f, '(', 1));
  end loop;
  perform _eq(has_function_privilege('service_role', 'ledger_link_reversal_accept(uuid)', 'execute'), false, 'ومفتاح الخدمة لا يقبل نيابةً عن أحد');
  perform _eq(has_function_privilege('authenticated', 'ledger_link_reversals_guard()', 'execute'), false, 'والحارس الداخليّ لا يستدعيه أحد');
end $$;

\echo ''
\echo '=========================================================================='
\echo 'ي) سلامة الدفاتر كلّها'
\echo '=========================================================================='
do $$
begin
  perform _eq((select count(*)::int from journal_entries e where (select coalesce(sum(base_minor) filter (where side = 'D'), 0) - coalesce(sum(base_minor) filter (where side = 'C'), 0)
                                                                    from journal_lines where entry_id = e.id) <> 0), 0, 'كلّ قيدٍ في القاعدة متوازن (ومنها قيود العكس)');
  perform _eq((select count(*)::int from (select link_id from journal_entries where link_id is not null group by link_id having count(*) <> 2) q), 0, 'وكلّ رابطٍ له قيدان بالضبط');
  perform _eq((select count(*)::int from ledger_link_reversals where status = 'accepted'), 2, 'طلبان مقبولان (ولا ثالث)');
  perform _eq((select count(*)::int from (select link_id from ledger_link_reversals where status in ('pending', 'accepted') group by link_id having count(*) > 1) q), 0, 'ولا قيدَ له أكثر من طلبٍ مفتوح');
  -- The database itself, not only the function, refuses a second open request for the same entry.
  perform _refuses(format($q$insert into ledger_link_reversals (link_id, requested_by, other_party, reason, status, resolved_at) values (%L, %L, %L, 'مكرّر', 'accepted', now())$q$,
                          _id('L3'), 'f1000000-0000-0000-0000-0000000000f1', 'a1000000-0000-0000-0000-0000000000a1'), 'duplicate key', 'والفهرس يمنع قبولاً ثانياً لقيدٍ أُلغي');
  perform _refuses(format($q$insert into ledger_link_reversals (link_id, requested_by, other_party, reason) values (%L, %L, %L, 'ذاتي')$q$,
                          _id('L2'), 'f1000000-0000-0000-0000-0000000000f1', 'f1000000-0000-0000-0000-0000000000f1'), 'violates check constraint', 'ولا طلبٌ من النفس إلى النفس');
end $$;

do $$
declare n integer;
begin
  select fails into n from _score;
  if n > 0 then raise exception '% فحصاً فشل', n; end if;
end $$;
\echo ''
\echo 'OK'
