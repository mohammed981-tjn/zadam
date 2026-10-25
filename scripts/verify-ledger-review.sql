-- بوّابةُ إصلاحات مراجعة دفتر الحسابات (البند ١٩٨). الملف يُكمله فحصُ السباق في verify-ledger-review.sh.
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

-- Net (debit minus credit) of one account in the dollar, in the book of one owner, optionally of one season.
create or replace function _net(p_owner uuid, p_kind text, p_key text, p_season uuid default null) returns bigint language sql stable as $$
  select coalesce(sum(case l.side when 'D' then l.base_minor else -l.base_minor end), 0)::bigint
    from journal_lines l
    join ledger_accounts a on a.id = l.account_id and a.book_id = l.book_id
    join ledger_books b on b.id = l.book_id
   where (b.owner_id = p_owner or (p_owner is null and b.owner_id is null)) and b.kind = p_kind and a.system_key = p_key
     and (p_season is null or l.season_id = p_season) $$;
create or replace function _book(p_owner uuid, p_kind text) returns uuid language sql stable as $$
  select id from ledger_books where owner_id = p_owner and kind = p_kind $$;
create or replace function _posting(p_row uuid) returns uuid language sql stable security definer as $$ select _farm_mirror_current(p_row) $$;

-- The harness cannot wait a month: a record is moved back to the day it would have been made, with the guards off for
-- that one statement (as the engine's own gate does to plant a damaged entry). The month a figure belongs to is the
-- month its record was made.
create or replace function _made_on(p_entry uuid, p_day date) returns void language plpgsql as $$
begin
  perform set_config('session_replication_role', 'replica', true);
  update journal_entries set created_at = (p_day::timestamp + interval '12 hours') at time zone 'Africa/Khartoum'
   where id = p_entry or reversal_of = p_entry;
  perform set_config('session_replication_role', 'origin', true);
end $$;
create or replace function _row_made_on(p_row uuid, p_day date) returns void language plpgsql as $$
declare e uuid;
begin
  for e in select id from journal_entries where source_id = p_row and reversal_of is null loop
    perform _made_on(e, p_day);
  end loop;
end $$;

create table if not exists _cfg (k text primary key, d date);
create table if not exists _ids (name text primary key, id uuid);
-- m0 is the month before last (over in any time zone), m1 the one before it, m2 before that; cur is this month.
insert into _cfg values
  ('m0',  (date_trunc('month', current_date) - interval '2 months')::date),
  ('m1',  (date_trunc('month', current_date) - interval '3 months')::date),
  ('m2',  (date_trunc('month', current_date) - interval '4 months')::date),
  ('cur', date_trunc('month', ledger_today())::date);
create or replace function _d(p text) returns date language sql stable as $$ select d from _cfg where k = p $$;
create or replace function _id(p text) returns uuid language sql stable as $$ select id from _ids where name = p $$;

-- Six farmers, five investors, an administrator who also farms.
insert into auth.users (id)
select ('f' || i || '000000-0000-0000-0000-0000000000f' || i)::uuid from generate_series(1, 6) i
union all select ('b' || i || '000000-0000-0000-0000-0000000000b' || i)::uuid from generate_series(1, 5) i
union all select 'ad000000-0000-0000-0000-0000000000ad'::uuid
on conflict (id) do nothing;
insert into profiles (id, full_name, role)
select ('f' || i || '000000-0000-0000-0000-0000000000f' || i)::uuid, 'مزارع ' || i, 'investor'::user_role from generate_series(1, 6) i
union all select ('b' || i || '000000-0000-0000-0000-0000000000b' || i)::uuid, 'مستثمر ' || i, 'investor'::user_role from generate_series(1, 5) i
union all select 'ad000000-0000-0000-0000-0000000000ad'::uuid, 'مدير', 'admin'::user_role
on conflict (id) do update set role = excluded.role;

insert into seasons (id, owner_id, name, crop_key, station_key, irrigation, feddans, planting_date)
select ('5' || i || '000000-0000-0000-0000-00000000000' || i)::uuid, ('f' || i || '000000-0000-0000-0000-0000000000f' || i)::uuid,
       'موسم ' || i, 'wheat', 'x', 'canal', 10, current_date - 200
  from generate_series(1, 5) i;
insert into seasons (id, owner_id, name, crop_key, station_key, irrigation, feddans, planting_date) values
  ('5e000000-0000-0000-0000-0000000000ee', 'f6000000-0000-0000-0000-0000000000f6', 'موسم السباق', 'wheat', 'x', 'canal', 10, current_date - 90),
  ('5a000000-0000-0000-0000-0000000000aa', 'ad000000-0000-0000-0000-0000000000ad', 'موسم المدير', 'wheat', 'x', 'canal', 5, current_date - 90);

grant usage on schema public, auth to anon, authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated, service_role;
grant select, update on _score, _who to anon, authenticated, service_role;
grant select on _cfg, _ids to authenticated;
grant select, insert, update, delete on ledger_entries to authenticated;
grant select on seasons, profiles to authenticated;
grant execute on function _fail(text,text), _pass(text), _act_as(uuid), _eq(anyelement,anyelement,text), _refuses(text,text,text),
  _d(text), _id(text), _posting(uuid) to anon, authenticated, service_role;

-- The race season has one cost before it closes (10), and the platform's book is open.
insert into ledger_entries (season_id, category, amount, entry_date, created_by)
values ('5e000000-0000-0000-0000-0000000000ee', 'seeds', 10, current_date - 3, 'f6000000-0000-0000-0000-0000000000f6');
select _ledger_open_book(null, 'platform') is not null as platform_open \gset

-- ── الشهر m0: خمسة مزارعين باعوا بمئةٍ يوم ١٠، والأوّل خمسين يوم ٢٠ ─────────────

do $$
declare i integer; r uuid; m0 date := _d('m0');
begin
  for i in 1..5 loop
    insert into ledger_entries (season_id, category, amount, entry_date, created_by)
    values (('5' || i || '000000-0000-0000-0000-00000000000' || i)::uuid, 'revenue', 100, m0 + 9, ('f' || i || '000000-0000-0000-0000-0000000000f' || i)::uuid)
    returning id into r;
    insert into _ids values ('SALE' || i, r);
    perform _row_made_on(r, m0 + 9);
  end loop;
  insert into ledger_entries (season_id, category, amount, entry_date, created_by)
  values ('51000000-0000-0000-0000-000000000001', 'revenue', 50, m0 + 19, 'f1000000-0000-0000-0000-0000000000f1')
  returning id into r;
  perform _row_made_on(r, m0 + 19);
end $$;

-- ── الشهر m1: خمسةٌ بالدولار، والأوّل وحده دفع بالجنيه. الشهر m2: الخمسة بالعملتين ─────

do $$
declare i integer; r uuid; m1 date := _d('m1'); m2 date := _d('m2');
begin
  for i in 1..5 loop
    insert into ledger_entries (season_id, category, amount, entry_date, created_by)
    values (('5' || i || '000000-0000-0000-0000-00000000000' || i)::uuid, 'revenue', 100, m1 + 4, ('f' || i || '000000-0000-0000-0000-0000000000f' || i)::uuid)
    returning id into r;
    perform _row_made_on(r, m1 + 4);
    insert into ledger_entries (season_id, category, amount, entry_date, created_by)
    values (('5' || i || '000000-0000-0000-0000-00000000000' || i)::uuid, 'revenue', 100, m2 + 4, ('f' || i || '000000-0000-0000-0000-0000000000f' || i)::uuid)
    returning id into r;
    perform _row_made_on(r, m2 + 4);
    insert into ledger_entries (season_id, category, amount, entered_amount, currency, fx_rate, entry_date, created_by)
    values (('5' || i || '000000-0000-0000-0000-00000000000' || i)::uuid, 'labour', 1, 100000, 'SDG', 1000, m2 + 5, ('f' || i || '000000-0000-0000-0000-0000000000f' || i)::uuid)
    returning id into r;
    perform _row_made_on(r, m2 + 5);
  end loop;
  -- Two of the five pay in pounds, evenly: neither dominates the pound cell, but two books are too few for it.
  for i in 1..2 loop
    insert into ledger_entries (season_id, category, amount, entered_amount, currency, fx_rate, entry_date, created_by)
    values (('5' || i || '000000-0000-0000-0000-00000000000' || i)::uuid, 'labour', 1, 100000, 'SDG', 1000, m1 + 5, ('f' || i || '000000-0000-0000-0000-0000000000f' || i)::uuid)
    returning id into r;
    perform _row_made_on(r, m1 + 5);
  end loop;
  -- A sale dated in m1 but recorded in m0: it is m0's figure, the month it was recorded.
  insert into ledger_entries (season_id, category, amount, entry_date, created_by)
  values ('52000000-0000-0000-0000-000000000002', 'revenue', 30, m1 + 20, 'f2000000-0000-0000-0000-0000000000f2')
  returning id into r;
  perform _row_made_on(r, m1 + 20 + 15);
end $$;

-- ── الذمّتان: كلّ مزارعٍ مستحقٌّ عليه لشريكه ١٠٠، وكلّ مستثمرٍ مستحقٌّ له ١٠٠ (في m0) ──────

do $$
declare i integer; b uuid; e uuid; m0 date := _d('m0');
begin
  for i in 1..5 loop
    b := ledger_open_book_for(('f' || i || '000000-0000-0000-0000-0000000000f' || i)::uuid, 'farm');
    e := ledger_post_for(b, m0 + 10, 'حصّة الشريك',
      jsonb_build_array(jsonb_build_object('key','cash_on_hand','side','D','currency','USD','minor', 10000),
                        jsonb_build_object('key','due_to_partner','side','C','currency','USD','minor', 10000)),
      'due-farm-' || i, null, 'test', null);
    perform _made_on(e, m0 + 10);
    b := ledger_open_book_for(('b' || i || '000000-0000-0000-0000-0000000000b' || i)::uuid, 'investor');
    e := ledger_post_for(b, m0 + 10, 'حصّتي',
      jsonb_build_array(jsonb_build_object('key','due_from_farmer','side','D','currency','USD','minor', 10000),
                        jsonb_build_object('key','bank','side','C','currency','USD','minor', 10000)),
      'due-inv-' || i, null, 'test', null);
    perform _made_on(e, m0 + 10);
  end loop;
end $$;

\echo ''
\echo '=========================================================================='
\echo 'أ) دفتر الموسم: صاحبه يكتب، والمدير يقرأ ولا يكتب (أ١)، ولا مبلغ دون سنت (أ٩)'
\echo '=========================================================================='
set role authenticated;
do $$
declare n integer; s1 uuid := '51000000-0000-0000-0000-000000000001';
begin
  perform _act_as('ad000000-0000-0000-0000-0000000000ad');
  perform _eq((select count(*)::int > 0 from ledger_entries where season_id = s1), true, 'المدير يقرأ دفتر موسم المزارع');
  perform _refuses($q$insert into ledger_entries (season_id, category, amount, created_by)
                      values ('51000000-0000-0000-0000-000000000001', 'seeds', 5, 'ad000000-0000-0000-0000-0000000000ad')$q$,
                   'row-level security', 'ولا يضيف فيه سطراً');
  update ledger_entries set amount = 999 where season_id = s1;
  get diagnostics n = row_count;
  perform _eq(n, 0, 'ولا يعدّل فيه سطراً');
  delete from ledger_entries where season_id = s1;
  get diagnostics n = row_count;
  perform _eq(n, 0, 'ولا يحذف منه سطراً');

  perform _act_as('f1000000-0000-0000-0000-0000000000f1');
  insert into ledger_entries (season_id, category, amount, created_by) values (s1, 'seeds', 7, 'f1000000-0000-0000-0000-0000000000f1');
  update ledger_entries set amount = 8 where season_id = s1 and amount = 7;
  get diagnostics n = row_count;
  perform _eq(n, 1, 'وصاحب الموسم يضيف ويعدّل');
  delete from ledger_entries where season_id = s1 and amount = 8;
  get diagnostics n = row_count;
  perform _eq(n, 1, 'ويحذف');
  perform _refuses($q$insert into ledger_entries (season_id, category, amount, created_by)
                      values ('52000000-0000-0000-0000-000000000002', 'seeds', 5, 'f1000000-0000-0000-0000-0000000000f1')$q$,
                   'row-level security', 'ولا يكتب في موسم غيره');

  perform _refuses($q$insert into ledger_entries (season_id, category, amount, created_by)
                      values ('51000000-0000-0000-0000-000000000001', 'seeds', -5, 'f1000000-0000-0000-0000-0000000000f1')$q$,
                   'أقلّ من سنت', 'مبلغٌ سالب يُرفض بسبب');
  perform _refuses($q$insert into ledger_entries (season_id, category, amount, created_by)
                      values ('51000000-0000-0000-0000-000000000001', 'seeds', 0.004, 'f1000000-0000-0000-0000-0000000000f1')$q$,
                   'أقلّ من سنت', 'وأقلّ من سنتٍ يُرفض');
  perform _refuses($q$insert into ledger_entries (season_id, category, amount, entered_amount, currency, fx_rate, created_by)
                      values ('51000000-0000-0000-0000-000000000001', 'seeds', 1, 1, 'SDG', 2450, 'f1000000-0000-0000-0000-0000000000f1')$q$,
                   'أقلّ من سنت', 'وجنيهٌ واحد (أقلّ من سنتٍ بالدولار) يُرفض');
  perform _refuses($q$update ledger_entries set amount = 0 where id = _id('SALE1')$q$,
                   'أقلّ من سنت', 'وتعديل المبلغ إلى صفر يُرفض');

  -- The administrator's own season, once closed, is closed to him as to anyone.
  perform _act_as('ad000000-0000-0000-0000-0000000000ad');
  insert into ledger_entries (season_id, category, amount, created_by)
  values ('5a000000-0000-0000-0000-0000000000aa', 'seeds', 3, 'ad000000-0000-0000-0000-0000000000ad');
  perform _pass('والمدير يكتب في دفتر موسمه هو');
end $$;
reset role;
update seasons set status = 'completed' where id = '5a000000-0000-0000-0000-0000000000aa';
set role authenticated;
do $$
begin
  perform _act_as('ad000000-0000-0000-0000-0000000000ad');
  perform _refuses($q$update ledger_entries set amount = 4 where season_id = '5a000000-0000-0000-0000-0000000000aa'$q$,
                   'أُقفل', 'وموسمه المُقفَل لا يعدّله');
  perform _refuses($q$delete from ledger_entries where season_id = '5a000000-0000-0000-0000-0000000000aa'$q$,
                   'أُقفل', 'ولا يحذف منه');
end $$;
reset role;
do $$
begin
  perform _eq((select count(*)::int from ledger_entries where amount = 999), 0, 'وما حاول المدير تعديله باقٍ كما هو');
  perform _eq((select count(*)::int from ledger_entries where season_id = '51000000-0000-0000-0000-000000000001' and category = 'revenue'), 4,
              'وما حاول حذفه باقٍ');
end $$;

\echo ''
\echo '=========================================================================='
\echo 'ب) سلامة الدفاتر: دفتر المنصّة كاملاً، ومن دفاتر الناس المعطوبُ وحده بلا مبالغ (أ٢)'
\echo '=========================================================================='
set role authenticated;
do $$
begin
  perform _act_as('ad000000-0000-0000-0000-0000000000ad');
  perform _eq((select count(*)::int from ledger_integrity() where kind <> 'platform'), 0, 'الدفاتر السليمة لا تظهر للمدير');
  perform _eq((select count(*)::int from ledger_integrity() where kind = 'platform'), 1, 'ودفتر المنصّة يظهر');
  perform _eq((select debit_total is not null and entries is not null from ledger_integrity() where kind = 'platform'), true, 'بمجاميعه');
end $$;
reset role;
begin;
set local session_replication_role = replica;
insert into journal_entries (id, book_id, entry_date, idempotency_key, content_hash)
  values ('f0000000-0000-0000-0000-000000000001', _book('f1000000-0000-0000-0000-0000000000f1', 'farm'), current_date, 'corrupt-0001', repeat('b', 64));
insert into journal_lines (entry_id, book_id, line_no, account_id, side, currency, amount_minor, base_minor)
  select 'f0000000-0000-0000-0000-000000000001', a.book_id, 1, a.id, 'D', 'USD', 700, 700
    from ledger_accounts a where a.book_id = _book('f1000000-0000-0000-0000-0000000000f1', 'farm') and a.system_key = 'cost_other';
set local session_replication_role = origin;
set local role authenticated;
do $$
declare fb uuid;
begin
  perform _act_as('ad000000-0000-0000-0000-0000000000ad');
  perform _eq((select count(*)::int from ledger_integrity() where kind <> 'platform'), 1, 'الدفتر المعطوب يظهر وحده');
  select book_id into fb from ledger_integrity() where kind <> 'platform';
  perform _eq((select ok from ledger_integrity() where book_id = fb), false, 'معلَّماً بالعطب');
  perform _eq((select unbalanced_entries from ledger_integrity() where book_id = fb), 1::bigint, 'وبعدد قيوده المعطوبة');
  perform _eq((select row(entries, lines, debit_total, credit_total)::text from ledger_integrity() where book_id = fb), '(,,,)',
              'بلا مبالغه ولا أعداد قيوده: يفتح المدير فحصاً بسببٍ إن احتاج');
end $$;
-- Committed, so that a failure above is counted; the damage is then taken out the way it went in.
reset role;
commit;
begin;
set local session_replication_role = replica;
delete from journal_lines where entry_id = 'f0000000-0000-0000-0000-000000000001';
delete from journal_entries where id = 'f0000000-0000-0000-0000-000000000001';
commit;

\echo ''
\echo '=========================================================================='
\echo 'ج) الإحصاءات: أشهرٌ منتهية كاملة بشهر التسجيل (أ٣)، والعملات خليّةً خليّة (أ٧)'
\echo '=========================================================================='
-- What is recorded now: a late sale dated in m0, and five sales this month (enough books to be shown the old way).
do $$
declare i integer; m0 date := _d('m0');
begin
  insert into ledger_entries (season_id, category, amount, entry_date, created_by)
  values ('51000000-0000-0000-0000-000000000001', 'revenue', 70, m0 + 25, 'f1000000-0000-0000-0000-0000000000f1');
  for i in 1..5 loop
    insert into ledger_entries (season_id, category, amount, entry_date, created_by)
    values (('5' || i || '000000-0000-0000-0000-00000000000' || i)::uuid, 'revenue', 10 * i, current_date, ('f' || i || '000000-0000-0000-0000-0000000000f' || i)::uuid);
  end loop;
  -- And a late partner's share for the first farm, dated in m0, and one dated today.
  perform ledger_post_for(_book('f1000000-0000-0000-0000-0000000000f1', 'farm'), m0 + 12, 'حصّة متأخّرة',
    jsonb_build_array(jsonb_build_object('key','cash_on_hand','side','D','currency','USD','minor', 3000),
                      jsonb_build_object('key','due_to_partner','side','C','currency','USD','minor', 3000)),
    'due-farm-late', null, 'test', null);
  perform ledger_post_for(_book('f1000000-0000-0000-0000-0000000000f1', 'farm'), current_date, 'حصّة اليوم',
    jsonb_build_array(jsonb_build_object('key','cash_on_hand','side','D','currency','USD','minor', 2000),
                      jsonb_build_object('key','due_to_partner','side','C','currency','USD','minor', 2000)),
    'due-farm-today', null, 'test', null);
end $$;
set role authenticated;
do $$
declare m0 date := _d('m0'); m1 date := _d('m1'); m2 date := _d('m2'); cur date := _d('cur');
begin
  perform _act_as('ad000000-0000-0000-0000-0000000000ad');
  perform _eq((select value_minor from oversight_flows(m0, m0 + 27) where metric = 'farm_sales' and period = m0), 58000::bigint,
              'مبيعات m0: خمسمئة + خمسون + ثلاثون سُجّلت فيه بتاريخٍ من m1');
  perform _eq((select value_minor from oversight_flows(m0, m0 + 18) where metric = 'farm_sales'), 58000::bigint,
              'والمدى حتى يوم ١٩ هو الشهر كلّه');
  perform _eq((select value_minor from oversight_flows(m0, m0 + 19) where metric = 'farm_sales'), 58000::bigint,
              'وحتى يوم ٢٠ كذلك: لا يُطرح يومٌ من يوم فيظهر دفترٌ واحد');
  perform _eq((select value_minor from oversight_flows(m0 + 15, m0 + 16) where metric = 'farm_sales'), 58000::bigint,
              'ويومان من وسط الشهر هما الشهر كلّه');
  perform _eq((select count(*)::int from oversight_flows(cur, ledger_today())), 0,
              'والشهر الجاري لا رقم له قبل أن ينتهي (ولو باع فيه خمسة)');
  perform _eq((select count(*)::int from oversight_flows(m0, ledger_today()) where period >= cur), 0,
              'ولا يدخل في مدىً يمتدّ إليه');

  -- The late sale is this month's record: m0 reads the same as before it, at any later time.
  perform _eq((select value_minor from oversight_flows(m0, m0 + 30) where metric = 'farm_sales' and period = m0), 58000::bigint,
              'والقيد المتأخّر المؤرَّخ في m0 لا يغيّر رقمه: قراءتان لا تكشفان قيداً');

  perform _eq((select value_minor from oversight_flows(m1, m1 + 27) where metric = 'farm_sales' and period = m1), 50000::bigint,
              'ومبيعات m1 ما سُجّل فيه وحده');
  perform _eq((select bool_and(suppressed) from oversight_currency_mix(m1, m1 + 27)), true,
              'مزيج m1: خليّة الجنيه من دفترين (لا يغلب أحدهما)، فيُحجب الشهر كلّه');
  perform _eq((select count(*)::int from oversight_currency_mix(m1, m1 + 27) where share_pct is not null), 0,
              'ولا حصّة تظهر (لا الجنيه ولا الدولار الذي يكشفه بالطرح)');
  perform _eq((select string_agg(currency || '=' || share_pct, ',' order by currency) from oversight_currency_mix(m2, m2 + 27)), 'SDG=50,USD=50',
              'ومزيج m2: الخمسة بالعملتين، فيظهر');
  perform _eq((select count(*)::int from oversight_currency_mix(cur, ledger_today())), 0, 'والشهر الجاري لا مزيج له');

  perform _eq((select due_to_partner_minor from oversight_reconcile(ledger_today())), 50000::bigint,
              'الذمّتان حتى آخر شهرٍ انتهى، بما سُجّل حتى نهايته: لا المتأخّر ولا قيد اليوم');
  perform _eq((select difference_minor from oversight_reconcile(ledger_today())), 0::bigint, 'والفرق صفر');
  perform _eq((select due_to_partner_minor from oversight_reconcile((m0 + interval '1 month - 1 day')::date)), 50000::bigint,
              'وآخر يوم m0 كذلك');
  perform _eq((select suppressed from oversight_reconcile(m0 + 15)), true, 'ووسط m0 هو نهاية الشهر قبله: لا شيء فيه، فمحجوب');
end $$;
reset role;
do $$
declare m0 date := _d('m0'); cur date := _d('cur'); n integer;
begin
  perform _refuses(format('select oversight_snapshot(%L::date)', cur), 'الشهر الجاري', 'والشهر الجاري لا يُسجَّل في دفتر المنصّة');
  n := oversight_snapshot(m0);
  perform _eq(n > 0, true, 'وm0 يُسجَّل');
  perform _eq(-_net(null, 'platform', 'oversight_farm_sales'), 58000::bigint, 'بمبيعاته كما تُقرأ');
  perform _eq(oversight_snapshot(m0), 0, 'وتسجيله مرّةً ثانية لا يضيف قيداً (القيد المتأخّر لا يُعدّ فيه)');
  perform _eq(oversight_snapshot(), 0, 'والتسجيل اليوميّ يأخذ الشهر الذي انتهى وحده');
end $$;

\echo ''
\echo '=========================================================================='
\echo 'د) القيود المتقابلة والمعلّقات بقاعدة الهيمنة (أ٨)'
\echo '=========================================================================='
-- Links as their own functions would leave them, planted with the guards off: five agreements each.
do $$
declare i integer; k integer; m0 date := _d('m0'); f uuid; b uuid; ag uuid;
begin
  perform set_config('session_replication_role', 'replica', true);
  for i in 1..5 loop
    f := ('f' || i || '000000-0000-0000-0000-0000000000f' || i)::uuid;
    b := ('b' || i || '000000-0000-0000-0000-0000000000b' || i)::uuid;
    ag := ('aa000000-0000-0000-0000-00000000000' || i)::uuid;
    -- input_finance: the first agreement a million, the others a dollar — one of them is nearly all of it.
    insert into ledger_links (kind, status, agreement_id, proposer_owner, counter_owner, proposer_book, amount_minor, currency, entry_date, idem_key, created_at)
    values ('input_finance', 'pending', ag, f, b, _book(f, 'farm'), case when i = 1 then 100000000 else 100 end, 'USD', m0 + 5, 'inp-key-' || i,
            (m0 + 5)::timestamp + interval '12 hours');
    -- payout: a thousand each, evenly.
    insert into ledger_links (kind, status, agreement_id, proposer_owner, counter_owner, proposer_book, amount_minor, currency, entry_date, idem_key, created_at)
    values ('payout', 'pending', ag, f, b, _book(f, 'farm'), 100000, 'USD', m0 + 5, 'pay-key-' || i, (m0 + 5)::timestamp + interval '12 hours');
    -- rent_payment: made this month.
    insert into ledger_links (kind, status, agreement_id, proposer_owner, counter_owner, proposer_book, amount_minor, currency, entry_date, idem_key)
    values ('rent_payment', 'pending', ag, f, b, _book(f, 'farm'), 100000, 'USD', current_date, 'rent-key-' || i);
  end loop;
  -- And the first agreement leaves sixty more harvest shares pending: most of what is waiting is one agreement's.
  for k in 1..60 loop
    insert into ledger_links (kind, status, agreement_id, proposer_owner, counter_owner, proposer_book, amount_minor, currency, entry_date, idem_key, created_at)
    values ('harvest_share', 'pending', 'aa000000-0000-0000-0000-000000000001', 'f1000000-0000-0000-0000-0000000000f1',
            'b1000000-0000-0000-0000-0000000000b1', _book('f1000000-0000-0000-0000-0000000000f1', 'farm'), 100, 'USD', m0 + 5,
            'harv-key-' || k, (m0 + 5)::timestamp + interval '12 hours');
  end loop;
  perform set_config('session_replication_role', 'origin', true);
end $$;
set role authenticated;
do $$
declare m0 date := _d('m0');
begin
  perform _act_as('ad000000-0000-0000-0000-0000000000ad');
  perform _eq((select suppressed from oversight_links(m0, m0 + 27) where kind = 'input_finance'), true,
              'تمويل المدخلات: خمسة عقود، أحدها كلّه تقريباً — محجوب');
  perform _eq((select amount_usd_minor from oversight_links(m0, m0 + 27) where kind = 'input_finance'), null, 'فلا مبلغ');
  perform _eq((select row(links, agreements, amount_usd_minor, suppressed)::text from oversight_links(m0, m0 + 27) where kind = 'payout'),
              '(5,5,500000,f)', 'والدفعات المتساوية تظهر');
  perform _eq((select count(*)::int from oversight_links(m0, ledger_today()) where kind = 'rent_payment'), 0,
              'وما أُنشئ هذا الشهر لا يظهر قبل أن ينتهي');
  perform _eq((select suppressed from oversight_stale(7) where what = 'pending_link'), true,
              'والمعلّقات: ٦٢ من ٧٠ لعقدٍ واحد — محجوبة');
  perform _eq((select items from oversight_stale(7) where what = 'pending_link'), null, 'فلا عدد');
  perform _eq((select row(items, suppressed)::text from oversight_stale(7) where what = 'pending_reversal'), '(0,f)',
              'وطلبات الإلغاء الفارغة تظهر صفراً');
end $$;
reset role;

\echo ''
\echo '=========================================================================='
\echo 'هـ) ما يكتبه النظام لا يُعكس يدويّاً (أ٤، أ٥)، والمزامنة تعيد ما سقط'
\echo '=========================================================================='
do $$
declare r uuid; e uuid;
begin
  -- A cost on credit for the second farm, settled (a settlement and its pair are posted for it).
  insert into ledger_entries (season_id, category, amount, entered_amount, currency, fx_rate, paid_from, entry_date, created_by)
  values ('52000000-0000-0000-0000-000000000002', 'seeds', 1, 100000, 'SDG', 1000, 'credit', current_date - 2, 'f2000000-0000-0000-0000-0000000000f2')
  returning id into r;
  insert into _ids values ('CREDIT2', r);
  -- A linked entry and a manual one in the first farm's book.
  e := ledger_post_for(_book('f1000000-0000-0000-0000-0000000000f1', 'farm'), current_date, 'متقابل',
    jsonb_build_array(jsonb_build_object('key','cash_on_hand','side','D','currency','USD','minor', 500),
                      jsonb_build_object('key','due_to_partner','side','C','currency','USD','minor', 500)),
    'linked-entry-1', null, 'ledger_link', null);
  insert into _ids values ('LINKED1', e);
end $$;
grant execute on function farm_settle_entry(uuid, text, date, numeric) to authenticated;
set role authenticated;
do $$
declare e uuid; m uuid;
begin
  perform _act_as('f2000000-0000-0000-0000-0000000000f2');
  perform farm_settle_entry(_id('CREDIT2'), 'cash', current_date, 1000);
  e := (select id from journal_entries where source_type = 'season_entry_settle' and source_id = _id('CREDIT2'));
  perform _refuses(format('select ledger_reverse(%L, %L)', e, 'عكسٌ يدويّ'), 'ألغِ السداد', 'قيد السداد لا يُعكس يدويّاً');
  perform _refuses(format('select ledger_reverse(%L, %L)', _posting(_id('CREDIT2')), 'عكسٌ يدويّ'), 'دفتر الموسم',
                   'وقيد دفتر الموسم لا يُعكس يدويّاً');

  perform _act_as('f1000000-0000-0000-0000-0000000000f1');
  perform _refuses(format('select ledger_reverse(%L, %L)', _id('LINKED1'), 'عكسٌ يدويّ'), 'باتّفاقكما', 'ولا القيد المتقابل');
  m := ledger_post((select id from ledger_books where owner_id = auth.uid() and kind = 'farm'), current_date, 'قيدٌ يدويّ',
    jsonb_build_array(jsonb_build_object('key','cost_other','side','D','currency','USD','minor', 300),
                      jsonb_build_object('key','cash_on_hand','side','C','currency','USD','minor', 300)),
    'manual-entry-0001');
  perform _eq(ledger_reverse(m, 'خطأ') is not null, true, 'والقيد اليدويّ يُعكس كما كان');

  perform _act_as('ad000000-0000-0000-0000-0000000000ad');
  e := (select id from journal_entries where source_type = 'oversight' limit 1);
  perform _refuses(format('select ledger_reverse(%L, %L)', e, 'عكسٌ يدويّ'), 'إحصائيّ', 'ولا القيد الإحصائيّ في دفتر المنصّة');
end $$;
reset role;
do $$
declare r uuid := _id('SALE3');
begin
  -- A posting reversed outside its row's own change (as a manual reversal could before this fix).
  perform _ledger_reverse(_posting(r), 'عكسٌ قديم', null, null, null);
  perform _eq(_posting(r), null, 'سطرٌ سقط ترحيله');
  perform _eq((select unposted_rows from farm_book_reconcile() where season_id = '53000000-0000-0000-0000-000000000003'), 1::bigint,
              'والمطابقة تعدّه غير مرحَّل');
  perform _eq(farm_book_sync(), 1, 'والمزامنة تعيد ترحيله');
  perform _eq(_posting(r) is not null, true, 'فله ترحيلٌ قائم');
  perform _eq((select count(*)::int from farm_book_reconcile() where season_id = '53000000-0000-0000-0000-000000000003'), 0,
              'والدفتران متطابقان');
  perform _eq(farm_book_sync(), 0, 'والمزامنة الثانية لا تضيف شيئاً');
end $$;

-- What the race below closes: the season shows its one cost in growing crops before it.
do $$
begin
  perform _eq(_net('f6000000-0000-0000-0000-0000000000f6', 'farm', 'crops_in_progress', '5e000000-0000-0000-0000-0000000000ee'), 1000::bigint,
              'موسم السباق قبل إغلاقه: ١٠ في «محاصيل قيد النموّ»');
  perform _act_as(null);
end $$;
grant execute on function _eq(anyelement,anyelement,text), _net(uuid,text,text,uuid) to public;
