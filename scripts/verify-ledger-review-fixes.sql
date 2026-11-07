-- بوّابةُ إصلاحات مراجعتَي 6 نوفمبر (البند ٢٠٩؛ الهجرة 20261106100000_ledger_review_fixes.sql).
-- على السلسلة الكاملة وبالهويّة كما يضعها PostgREST:
--   أ) لا إقفال مرّتين: بيعٌ ٥٠٠$ قبل ١١ يوماً وعمالةٌ ٧٠$ لموسم، يُقفل الموسم اليوم ثمّ الفترة حتى أمس، فلا يُقفل دخله ثانية؛
--      وموسمٌ لا يُقفل بتاريخٍ في فترةٍ أُقفل دخلها.
--   ب) قائمة الملكيّة تُقفل على الميزانيّة في فترةٍ فيها إقفال، والميزانيّة التقديريّة والإيضاحات لا تريان قيد الإقفال.
--   ج) المفتاح في الطريقين: تبديل «راجع كلّ قيد» بين المحاولة وإعادتها لا يكتب القيد مرّتين.
--   د) المُعِدّ: وسمٌ ليس لصاحب الدفتر يُرفض، والمسوّدة تحفظ السعر ومعادل كلّ سطر، ولا يتغيّر ذلك.
--   هـ) دعوة المحاسب: جوابٌ واحد وُجد الحساب أم لم يوجد، وكلّ محاولةٍ تُعدّ، والجوّال بهويّة الدخول لا بالملفّ الشخصيّ.
--   و) دفتر المنصّة: لا يعتمد المسوّدةَ من أعدّها.
--   ز) قيود الآجل المفتوحة في الرئيسيّة تُعدّ كلّها، والدوالّ الجديدة مغلقة.

\set ON_ERROR_STOP on
\set QUIET on
set client_min_messages = notice;
\o /dev/null

create table _score (fails integer not null default 0, passes integer not null default 0);
insert into _score values (0, 0);
grant all on _score to authenticated, anon, service_role;
create table _ids (k text primary key, v uuid);
grant all on _ids to authenticated, anon, service_role;

create function _fail(label text, why text) returns void language plpgsql as $$
begin raise notice '  FAIL  % — %', label, why; update _score set fails = fails + 1; end $$;
create function _pass(label text) returns void language plpgsql as $$
begin raise notice '  PASS  %', label; update _score set passes = passes + 1; end $$;
create function _eq(got anyelement, want anyelement, label text) returns void language plpgsql as $$
begin
  if got is not distinct from want then perform _pass(label || ' — ' || coalesce(got::text, 'null'));
  else perform _fail(label, 'جاء ' || coalesce(got::text, 'null') || ' والمتوقَّع ' || coalesce(want::text, 'null')); end if;
end $$;
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
create function _as(p uuid, p_aal text default 'aal1') returns void language sql as $$
  select set_config('request.jwt.claims',
    case when p is null then '' else json_build_object('sub', p, 'role', 'authenticated', 'aal', p_aal)::text end, false) $$;
create function _set(k text, v uuid) returns uuid language sql as $$
  insert into _ids values (k, v) on conflict (k) do update set v = excluded.v returning v $$;
create function _id(k text) returns uuid language sql stable as $$ select v from _ids where k = $1 $$;
create function _l(acc text, side text, minor bigint, cur text default 'USD', season uuid default null) returns jsonb
language sql immutable as $$
  select case when acc ~ '^[0-9]+$' then jsonb_build_object('account', acc) else jsonb_build_object('key', acc) end
         || jsonb_build_object('side', side, 'currency', cur, 'minor', minor)
         || case when season is null then '{}'::jsonb else jsonb_build_object('season', season) end $$;
create function _n(q text) returns bigint language plpgsql security definer as $$
declare n bigint; begin execute q into n; return n; end $$;
create function _t(q text) returns text language plpgsql security definer as $$
declare v text; begin execute q into v; return v; end $$;
grant execute on function _fail(text, text), _pass(text), _eq(anyelement, anyelement, text), _refuses(text, text, text),
  _as(uuid, text), _set(text, uuid), _id(text), _l(text, text, bigint, text, uuid), _n(text), _t(text)
  to authenticated, anon, service_role;

-- ── الناس ────────────────────────────────────────────────────────────────────
-- g1 مزارعٌ يقفل موسمه ثمّ فترته · g2 يقفل فترته ثمّ موسمه · o2 صاحب دفترٍ له محاسب · ac المحاسب (حسابٌ بالجوّال)
-- st غريبٌ له موسم · i1 صاحب دفترٍ يدعو · t2 صاحب رقمٍ حقيقيّ · m1 و m2 يكتبان رقم غيرهما في ملفّهما · ad1 و ad2 مديران
insert into auth.users (id, email) values
  ('91000000-0000-0000-0000-000000000091', 'g1@example.com'),
  ('92000000-0000-0000-0000-000000000092', 'g2@example.com'),
  ('02000000-0000-0000-0000-000000000002', 'o2@example.com'),
  ('ac000000-0000-0000-0000-0000000000ac', 'p249912000111@phone.invalid'),
  ('57000000-0000-0000-0000-000000000057', 'st@example.com'),
  ('11000000-0000-0000-0000-000000000011', 'i1@example.com'),
  ('72000000-0000-0000-0000-000000000072', 'p249912000222@phone.invalid'),
  ('a1000000-0000-0000-0000-0000000000a1', 'm1@example.com'),
  ('a2000000-0000-0000-0000-0000000000a2', 'm2@example.com'),
  ('ad100000-0000-0000-0000-0000000000a1', 'ad1@example.com'),
  ('ad200000-0000-0000-0000-0000000000a2', 'ad2@example.com');
insert into profiles (id, full_name, role, phone) values
  ('91000000-0000-0000-0000-000000000091', 'مزارعٌ أوّل', 'investor', null),
  ('92000000-0000-0000-0000-000000000092', 'مزارعٌ ثانٍ', 'investor', null),
  ('02000000-0000-0000-0000-000000000002', 'صاحب الدفتر', 'investor', null),
  ('ac000000-0000-0000-0000-0000000000ac', 'المحاسب', 'investor', '0912000111'),
  ('57000000-0000-0000-0000-000000000057', 'غريب', 'investor', null),
  ('11000000-0000-0000-0000-000000000011', 'من يدعو', 'investor', null),
  ('72000000-0000-0000-0000-000000000072', 'صاحب الرقم', 'investor', '0912000222'),
  ('a1000000-0000-0000-0000-0000000000a1', 'منتحل', 'investor', '0912000222'),
  ('a2000000-0000-0000-0000-0000000000a2', 'منتحلٌ آخر', 'investor', '0912000333'),
  ('ad100000-0000-0000-0000-0000000000a1', 'مديرٌ أوّل', 'admin', null),
  ('ad200000-0000-0000-0000-0000000000a2', 'مديرٌ ثانٍ', 'admin', null)
on conflict (id) do update set role = excluded.role, full_name = excluded.full_name, phone = excluded.phone;

insert into seasons (id, owner_id, name, crop_key, station_key, irrigation, feddans, planting_date) values
  ('51000000-0000-0000-0000-000000000051', '91000000-0000-0000-0000-000000000091', 'موسم السمسم', 'sesame', 'sennar', 'rainfed', 5, '2026-07-01'),
  ('52000000-0000-0000-0000-000000000052', '92000000-0000-0000-0000-000000000092', 'موسم الذرة', 'sorghum', 'sennar', 'rainfed', 5, '2026-07-01'),
  ('53000000-0000-0000-0000-000000000053', '02000000-0000-0000-0000-000000000002', 'موسم صاحب الدفتر', 'sorghum', 'sennar', 'rainfed', 5, '2026-07-01'),
  ('54000000-0000-0000-0000-000000000054', '57000000-0000-0000-0000-000000000057', 'موسم الغريب', 'sorghum', 'sennar', 'rainfed', 5, '2026-07-01');
insert into season_stages (id, season_id, stage_key, stage_order, planned_start, planned_end, budget) values
  ('5a000000-0000-0000-0000-000000000001', '51000000-0000-0000-0000-000000000051', 'land_prep', 1, '2026-07-01', '2026-07-20', 100);

\o
\echo 'أ) لا إقفال مرّتين: الموسم اليوم ثمّ الفترة حتى أمس'
\o /dev/null
set role authenticated;
select _as('91000000-0000-0000-0000-000000000091');
do $$
declare b uuid; s uuid := '51000000-0000-0000-0000-000000000051';
begin
  b := _set('G1', ledger_open_book('farm'));
  perform ledger_entry_submit(b, ledger_today() - 20, 'رأس مال', jsonb_build_array(_l('1110', 'D', 100000), _l('3110', 'C', 100000)), 'k-a-0000');
  perform ledger_entry_submit(b, ledger_today() - 11, 'بيع سمسم الموسم',
            jsonb_build_array(_l('1110', 'D', 50000), _l('4110', 'C', 50000, 'USD', s)), 'k-a-0001');
  perform ledger_entry_submit(b, ledger_today() - 11, 'عمالة الموسم',
            jsonb_build_array(_l('5140', 'D', 7000, 'USD', s), _l('1110', 'C', 7000)), 'k-a-0002');
  perform ledger_entry_submit(b, ledger_today() - 5, 'بيعٌ بلا موسم',
            jsonb_build_array(_l('1110', 'D', 10000), _l('4110', 'C', 10000)), 'k-a-0003');
end $$;
reset role;
select _as(null);
update seasons set status = 'completed' where id in ('51000000-0000-0000-0000-000000000051', '52000000-0000-0000-0000-000000000052');
set role authenticated;
select _as('91000000-0000-0000-0000-000000000091');
do $$
declare b uuid := _id('G1'); s uuid := '51000000-0000-0000-0000-000000000051'; cs uuid; cp uuid;
begin
  cs := _set('CS1', ledger_close_season(b, s));
  perform _eq(_t(format('select entry_date::text from journal_entries where id = %L', cs)), ledger_today()::text,
              'إقفال الموسم بتاريخ اليوم (افتراضيّه)');
  cp := _set('CP1', ledger_close_income(b, ledger_today() - 1));
  perform _eq(_n(format('select count(*) from journal_lines where entry_id = %L and season_id = %L', cp, s)), 0::bigint,
              'وإقفال الفترة حتى أمس لا يمسّ سطور الموسم (أقفلها قيده المؤرَّخ بعد الفترة)');
  perform _eq((select count(*) from ledger_trial_balance(b) where type in ('revenue', 'expense') and (debit_balance <> 0 or credit_balance <> 0)),
              0::bigint, 'فلا إيراد ولا مصروف بقي في ميزان المراجعة، ولا نُقض شيءٌ بالسالب');
  perform _eq((select credit_balance from ledger_trial_balance(b) where code = '3210'), 53000::bigint,
              'والأرباح المحتجزة ٥٣٠$ مرّةً واحدة: ربح الموسم ٤٣٠$ والبيع الآخر ١٠٠$ (كانت ٩٦٠$ بالإقفال المزدوج)');
  perform _eq((select balanced and equation_holds from ledger_trial_balance_proof(b)), true, 'والميزان متوازن والمعادلة قائمة');
  perform _eq((select revenue - expense from ledger_profit_by_season(b) where season_id = s), 43000::bigint, 'وربحيّة الموسم كما كانت');
end $$;

select _as('92000000-0000-0000-0000-000000000092');
do $$
declare b uuid; s uuid := '52000000-0000-0000-0000-000000000052';
begin
  b := _set('G2', ledger_open_book('farm'));
  perform ledger_entry_submit(b, ledger_today() - 11, 'بيع ذرة الموسم',
            jsonb_build_array(_l('1110', 'D', 50000), _l('4110', 'C', 50000, 'USD', s)), 'k-a-0101');
  perform ledger_entry_submit(b, ledger_today() - 11, 'عمالة الموسم',
            jsonb_build_array(_l('5140', 'D', 7000, 'USD', s), _l('1110', 'C', 7000)), 'k-a-0102');
  perform ledger_close_income(b, ledger_today() - 1);
  perform _refuses(format($q$select ledger_close_season(%L, %L, ledger_today() - 1)$q$, b, s),
                   'وبالعكس: موسمٌ لا يُقفل بتاريخٍ في فترةٍ أُقفل دخلها', 'يُقفل دخل الموسم بتاريخٍ بعده');
  perform _refuses(format($q$select ledger_close_season(%L, %L)$q$, b, s),
                   'وإقفاله اليوم لا يجد ما يُقفل (أقفله قيد الفترة)', 'لا إيراد ولا مصروف لهذا الموسم');
  perform _eq((select credit_balance from ledger_trial_balance(b) where code = '3210'), 43000::bigint, 'والأرباح المحتجزة ٤٣٠$ مرّةً واحدة');
end $$;

\o
\echo 'ب) الملكيّة والميزانيّة التقديريّة والإيضاحات في فترةٍ فيها إقفال'
\o /dev/null
select _as('91000000-0000-0000-0000-000000000091');
do $$
declare b uuid := _id('G1'); s uuid := '51000000-0000-0000-0000-000000000051';
begin
  perform _eq((select amount from ledger_equity_statement(b, ledger_today() - 30, ledger_today()) where line = 'closing'),
              (select sum(current_minor)::bigint from ledger_balance_compare(b, ledger_today()) where type = 'equity'),
              'آخر قائمة الملكيّة = ملكيّة الميزانيّة يومها، وفي الفترة إقفالان');
  perform _eq((select amount from ledger_equity_statement(b, ledger_today() - 30, ledger_today()) where line = 'other'), 0::bigint,
              'وقيد الإقفال ليس «حركةً أخرى» في الملكيّة');
  perform _eq((select amount from ledger_equity_statement(b, ledger_today() - 30, ledger_today()) where line = 'closing'), 153000::bigint,
              'رأس المال ١٠٠٠$ والربح ٥٣٠$');
  perform _eq((select sum(actual_minor)::bigint from ledger_budget_vs_actual(b, s)), 7000::bigint,
              'والميزانيّة التقديريّة ترى ما صُرف (٧٠$) لا ما أُقفل');
  perform _eq((ledger_statement_facts(b, ledger_today() - 30, ledger_today()) ->> 'entries')::integer, 4,
              'والإيضاحات تعدّ قيود الفترة الأربعة بلا قيدي الإقفال');
  perform _eq((select (x ->> 'base_minor')::bigint from jsonb_array_elements(ledger_statement_facts(b, ledger_today() - 30, ledger_today()) -> 'currencies') x
                where x ->> 'currency' = 'USD'), 167000::bigint, 'ومجموع حركتها بالدولار بلا الإقفال');
end $$;

\o
\echo 'ج) المفتاح في الطريقين: تبديل «راجع كلّ قيد» بين المحاولة وإعادتها لا يكتب مرّتين'
\o /dev/null
select _as('02000000-0000-0000-0000-000000000002');
do $$
declare b uuid; r jsonb; e uuid; d uuid;
begin
  b := _set('O', ledger_open_book('farm'));
  r := ledger_entry_submit(b, ledger_today(), 'بذور', jsonb_build_array(_l('5110', 'D', 1200), _l('1110', 'C', 1200)), 'k-c-0001');
  e := (r ->> 'entry_id')::uuid;
  perform _eq(r ->> 'status', 'posted', 'قيدٌ يُرحَّل والمراجعة موقوفة');
  perform ledger_review_set(b, true);
  r := ledger_entry_submit(b, ledger_today(), 'بذور', jsonb_build_array(_l('5110', 'D', 1200), _l('1110', 'C', 1200)), 'k-c-0001');
  perform _eq((r ->> 'entry_id')::uuid, e, 'وإعادته بعد طلب المراجعة تُرجع القيد نفسه');
  perform _eq(_n(format('select count(*) from ledger_drafts where book_id = %L and client_key = ''k-c-0001''', b)), 0::bigint,
              'ولا تصنع مسوّدةً تُرحَّل ثانيةً');
  perform _refuses(format($q$select ledger_entry_submit(%L, ledger_today(), 'غيره', jsonb_build_array(_l('5110', 'D', 999), _l('1110', 'C', 999)), 'k-c-0001')$q$, b),
                   'وبمحتوى آخر يُرفض', 'استُعمل لقيدٍ مختلف');

  r := ledger_entry_submit(b, ledger_today(), 'سماد', jsonb_build_array(_l('5120', 'D', 800), _l('1110', 'C', 800)), 'k-c-0002');
  d := (r ->> 'draft_id')::uuid;
  perform _eq(r ->> 'status', 'pending', 'والمراجعة مطلوبة: القيد مسوّدة');
  perform ledger_review_set(b, false);
  r := ledger_entry_submit(b, ledger_today(), 'سماد', jsonb_build_array(_l('5120', 'D', 800), _l('1110', 'C', 800)), 'k-c-0002');
  perform _eq(r ->> 'status' || '/' || (r ->> 'draft_id'), 'pending/' || d, 'وإعادتها بعد إيقاف المراجعة تُرجع المسوّدة نفسها');
  perform _eq(_n(format('select count(*) from journal_entries where book_id = %L and idempotency_key = ''manual:k-c-0002''', b)), 0::bigint,
              'ولا تُرحِّل القيد من الباب الآخر');
end $$;

\o
\echo 'د) المُعِدّ: وسمٌ ليس لصاحب الدفتر يُرفض، والمسوّدة تحفظ السعر ومعادل كلّ سطر'
\o /dev/null
do $$ begin
  perform _set('PA', ledger_preparer_invite(_id('O'), '0912000111'));
end $$;
select _as('ac000000-0000-0000-0000-0000000000ac');
do $$
declare b uuid := _id('O'); r jsonb; c jsonb;
begin
  perform ledger_preparer_answer(_id('PA'), true);
  perform _refuses(format($q$select ledger_entry_submit(%L, ledger_today(), 'على موسم غيره',
                     jsonb_build_array(_l('5140', 'D', 500, 'USD', '54000000-0000-0000-0000-000000000054'), _l('1110', 'C', 500)), 'k-d-0001')$q$, b),
                   'وسم موسمٍ ليس لصاحب الدفتر يُرفض على سطر المُعِدّ', 'ليس لصاحب الدفتر');
  perform _refuses(format($q$select ledger_entry_submit(%L, ledger_today(), 'على مشروعٍ لا يخصّه',
                     jsonb_build_array(_l('5140', 'D', 500) || '{"project":"6f000000-0000-0000-0000-00000000006f"}'::jsonb, _l('1110', 'C', 500)), 'k-d-0002')$q$, b),
                   'ووسم مشروعٍ لا يخصّه', 'ليس لصاحب الدفتر');
  perform _refuses(format($q$select ledger_entry_submit(%L, ledger_today(), 'على أرض غيره',
                     jsonb_build_array(_l('5140', 'D', 500) || '{"land":"6e000000-0000-0000-0000-00000000006e"}'::jsonb, _l('1110', 'C', 500)), 'k-d-0003')$q$, b),
                   'ووسم أرضٍ لا يخصّه', 'ليس لصاحب الدفتر');
  r := ledger_entry_submit(b, ledger_today(), 'عمالة موسم صاحب الدفتر',
         jsonb_build_array(_l('5140', 'D', 500, 'USD', '53000000-0000-0000-0000-000000000053'), _l('1110', 'C', 500)), 'k-d-0004');
  perform _eq(r ->> 'status', 'pending', 'ووسم موسم صاحب الدفتر يُقبل');
  r := ledger_entry_submit(b, ledger_today(), 'بذور بالجنيه بسعرٍ كتبه المُعِدّ',
         jsonb_build_array(_l('5110', 'D', 600000, 'SDG'), _l('1110', 'C', 600000, 'SDG')), 'k-d-0005', 2400);
  perform _set('DS', (r ->> 'draft_id')::uuid);
end $$;
select _as('02000000-0000-0000-0000-000000000002');
do $$
declare c jsonb;
begin
  select checked into c from ledger_drafts where id = _id('DS');
  perform _eq((c ->> 'rate')::numeric, 2400::numeric, 'صاحب الدفتر يرى السعر الذي كتبه المُعِدّ');
  perform _eq(c ->> 'fx_source', 'user', 'ومصدره: كتبه كاتب القيد');
  perform _eq(c ->> 'base_currency', 'USD', 'وعملة الدفتر');
  perform _eq((select sum((x ->> 'base')::bigint)::bigint from jsonb_array_elements(c -> 'lines') x where x ->> 'side' = 'D'), 250::bigint,
              'ومعادل السطور بعملة الدفتر كما ستُرحَّل (٦٠٠٠ جنيه ÷ ٢٤٠٠ = ٢٫٥٠$)');
  perform _eq(jsonb_array_length(c -> 'lines'), 2, 'سطراً سطراً');
end $$;
reset role;
select _as(null);
do $$ begin
  perform _refuses(format('update ledger_drafts set checked = null where id = %L', _id('DS')), 'وما حُسب لا يُغيَّر بعد الفحص', 'إلا البتّ فيه');
end $$;

\o
\echo 'هـ) دعوة المحاسب: جوابٌ واحد، وكلّ محاولةٍ تُعدّ، والجوّال بهويّة الدخول'
\o /dev/null
set role authenticated;
select _as('11000000-0000-0000-0000-000000000011');
do $$
declare b uuid; a uuid; z uuid; i integer;
begin
  b := _set('I', ledger_open_book('farm'));
  a := _set('IA', ledger_preparer_invite(b, '0912000222'));
  z := _set('IZ', ledger_preparer_invite(b, '0912000333'));
  perform _eq(a is not null and z is not null, true, 'رقمٌ له حساب ورقمٌ بلا حساب: لا رفض لأيٍّ منهما');
  perform _eq(_t(format('select preparer_id::text from ledger_preparers where id = %L', a)), '72000000-0000-0000-0000-000000000072',
              'والدعوة تصل صاحب الرقم الذي يدخل به');
  perform _eq(_n($q$select count(*) from ledger_preparers where preparer_id in ('a1000000-0000-0000-0000-0000000000a1', 'a2000000-0000-0000-0000-0000000000a2')$q$),
              0::bigint, 'لا من كتب الرقم في ملفّه الشخصيّ');
  perform _eq(_n(format('select count(*) from ledger_preparers where id = %L', z)), 0::bigint, 'والرقم بلا حسابٍ لا يُدعى به أحد');
  perform _eq((select row(role, status, full_name, company_name, answered_at, ended_at, standing)::text from ledger_preparers_list(b) where id = a),
              (select row(role, status, full_name, company_name, answered_at, ended_at, standing)::text from ledger_preparers_list(b) where id = z),
              'وفي قائمة صاحب الدفتر يبدوان سواء');
  perform _eq((select (after - 'preparer_ref' - 'contact_tail')::text from ledger_audit_log where action = 'preparer_invited' and after ->> 'preparer_ref' = a::text),
              (select (after - 'preparer_ref' - 'contact_tail')::text from ledger_audit_log where action = 'preparer_invited' and after ->> 'preparer_ref' = z::text),
              'وفي سجلّ التدقيق سواء، بلا من وصلته');
  perform _eq((select count(*) from ledger_preparers where book_id = b), 0::bigint, 'ولا يقرأ صاحب الدفتر صفّ الدعوة قبل أن يُجاب');
  perform _refuses('select count(*) from ledger_preparer_invites', 'ولا سجلّ المحاولات', 'permission denied');
  perform ledger_preparer_end(a);
  perform ledger_preparer_end(z);
  perform _eq((select string_agg(status, ',' order by status) from ledger_preparers_list(b)), 'ended,ended', 'وإنهاء الاثنين سواء');
  for i in 1..8 loop
    perform ledger_preparer_end(ledger_preparer_invite(b, '09130000' || lpad(i::text, 2, '0')));
  end loop;
  perform _refuses(format($q$select ledger_preparer_invite(%L, '0912000222')$q$, b),
                   'والحادية عشرة تُرفض قبل البحث، وقد كانت ثمانٍ منها بلا حساب', 'عشر دعواتٍ في اليوم');
end $$;
reset role;
select _as(null);
do $$ begin
  perform _eq((select count(*) from notifications where recipient_id = '72000000-0000-0000-0000-000000000072' and title = 'دعوةٌ لإعداد قيود دفتر'), 1::bigint,
              'صاحب الرقم أُخبر بدعوته');
  perform _eq((select count(*) from notifications where recipient_id in ('a1000000-0000-0000-0000-0000000000a1', 'a2000000-0000-0000-0000-0000000000a2')), 0::bigint,
              'ومن كتب الرقم في ملفّه لم يُخبَر بشيء');
  perform _eq((select count(*) from ledger_preparer_invites where book_id = _id('I')), 10::bigint, 'والمحاولات العشر محفوظة');
end $$;
set role service_role;
do $$ begin
  perform _refuses('delete from ledger_preparer_invites', 'ولا يحذفها مفتاح الخدمة');
end $$;
reset role;
do $$ begin
  perform _refuses('delete from ledger_preparer_invites', 'ولا مالك القاعدة', 'لا يُحذف');
  perform _refuses(format('update ledger_preparer_invites set contact_tail = ''0000'' where id = %L', _id('IZ')), 'ولا يُغيَّر ما كُتب فيها', 'لا يتغيّر');
end $$;

\o
\echo 'و) دفتر المنصّة: لا يعتمد المسوّدةَ من أعدّها'
\o /dev/null
select _set('P', _ledger_open_book(null, 'platform'));
set role authenticated;
select _as('ad100000-0000-0000-0000-0000000000a1', 'aal2');
do $$
declare r jsonb;
begin
  perform _eq(is_admin(), true, 'المدير الأوّل مديرٌ في جلسته');
  perform ledger_review_set(_id('P'), true);
  r := ledger_entry_submit(_id('P'), ledger_today(), 'رسم معاينة نقداً',
         jsonb_build_array(_l('cash_on_hand', 'D', 5000), _l('fee_inspection', 'C', 5000)), 'k-f-0001');
  perform _eq(r ->> 'status', 'pending', 'قيد المدير في دفتر المنصّة ينتظر');
  perform _set('PD', (r ->> 'draft_id')::uuid);
  perform _refuses(format($q$select ledger_draft_approve(%L)$q$, _id('PD')), 'ولا يعتمده من أعدّه', 'مديرٌ غيرُ من أعدّه');
end $$;
select _as('ad200000-0000-0000-0000-0000000000a2', 'aal2');
do $$ begin
  perform ledger_draft_approve(_id('PD'));
  perform _eq(_t(format('select status from ledger_drafts where id = %L', _id('PD'))), 'posted', 'ويعتمده مديرٌ غيره');
end $$;

\o
\echo 'ز) قيود الآجل المفتوحة كلّها، والدوالّ الجديدة مغلقة'
\o /dev/null
reset role;
select _as(null);
insert into seasons (id, owner_id, name, crop_key, station_key, irrigation, feddans, planting_date)
select ('5c000000-0000-0000-0000-0000000000' || lpad(g::text, 2, '0'))::uuid, '02000000-0000-0000-0000-000000000002',
       'موسم ' || g, 'sorghum', 'sennar', 'rainfed', 1, '2026-07-01'
  from generate_series(1, 7) g;
insert into ledger_entries (season_id, category, amount, paid_from, entry_date, created_by)
select ('5c000000-0000-0000-0000-0000000000' || lpad(g::text, 2, '0'))::uuid, 'seeds', 10, 'credit', ledger_today() - 2,
       '02000000-0000-0000-0000-000000000002'
  from generate_series(1, 7) g;
set role authenticated;
select _as('02000000-0000-0000-0000-000000000002');
do $$ begin
  perform _eq((select sum(open_rows)::integer from farm_open_credit_by_season()), 7, 'سبعة مواسم جارية في كلٍّ قيدٌ آجل: تُعدّ السبعة');
  perform farm_settle_entry((select id from ledger_entries where season_id = '5c000000-0000-0000-0000-000000000007'), 'cash');
  perform _eq((select sum(open_rows)::integer from farm_open_credit_by_season()), 6, 'وما سُدِّد يخرج منها');
end $$;
select _as('57000000-0000-0000-0000-000000000057');
do $$ begin
  perform _eq((select count(*) from farm_open_credit_by_season()), 0::bigint, 'والغريب لا يرى منها شيئاً');
end $$;
reset role;
select _as(null);
do $$
declare r text;
begin
  foreach r in array array['anon', 'authenticated', 'service_role'] loop
    perform _eq(has_function_privilege(r, 'public._ledger_period_closing_lines(uuid, date)', 'execute')
             or has_function_privilege(r, 'public._ledger_dry_run_checked(uuid, date, text, jsonb, numeric)', 'execute')
             or has_function_privilege(r, 'public._ledger_tags_owned(uuid, jsonb)', 'execute'), false,
                'الدوالّ الداخليّة الجديدة مغلقةٌ على ' || r);
    perform _eq(has_table_privilege(r, 'public.ledger_preparer_invites', 'SELECT')
             or has_table_privilege(r, 'public.ledger_preparer_invites', 'INSERT'), false, 'وسجلّ المحاولات على ' || r);
  end loop;
  perform _eq(has_function_privilege('anon', 'public.farm_open_credit_by_season()', 'execute'), false, 'والزائر لا يعدّ قيود الآجل');
  perform _eq(has_function_privilege('authenticated', 'public.farm_open_credit_by_season()', 'execute'), true, 'والمسجَّل يعدّ قيوده');
  perform _eq((select bool_and(prosecdef and proconfig::text like '%search_path=public%') from pg_proc
                where oid in ('public.ledger_entry_submit(uuid, date, text, jsonb, text, numeric, text, text, text, text)'::regprocedure,
                              'public.ledger_preparer_invite(uuid, text, text)'::regprocedure,
                              'public.ledger_close_income(uuid, date, text)'::regprocedure,
                              'public.ledger_draft_approve(uuid, text)'::regprocedure,
                              'public._ledger_dry_run_checked(uuid, date, text, jsonb, numeric)'::regprocedure,
                              'public.farm_open_credit_by_season()'::regprocedure)), true,
              'وكلّها SECURITY DEFINER بمسار بحثٍ ثابت');
  perform _eq(has_function_privilege('anon', 'public.ledger_preparer_invite(uuid, text, text)', 'execute'), false, 'والدعوة ما زالت مغلقةً على الزائر');
  perform _eq((select count(*) from pg_indexes where indexname in ('ledger_entry_meta_document', 'ledger_drafts_document')), 2::bigint,
              'وفهرسا مسار المستند قائمان');
end $$;

\o
\echo 'ح) الاعتماد بالسعر الذي رآه صاحب الدفتر (هجرة 20261107010000)'
\o /dev/null
reset role;
select _as(null);
insert into market_quotes (kind, market, crop, market_date, buy, sell, source_url, status, method) values
  ('fx_parallel', '', '', ledger_today(), 1990, 2000, 'https://example.com/fz1', 'published', 'manual');
set role authenticated;
select _as('ac000000-0000-0000-0000-0000000000ac');
do $$
declare r jsonb;
begin
  r := ledger_entry_submit(_id('O'), ledger_today(), 'بذور بالجنيه بسعر السوق',
         jsonb_build_array(_l('5110', 'D', 600000, 'SDG'), _l('1110', 'C', 600000, 'SDG')), 'k-h-0001');
  perform _eq(r ->> 'status', 'pending', 'المُعِدّ يرسل قيداً بالجنيه بلا سعرٍ مكتوب');
  perform _set('DF', (r ->> 'draft_id')::uuid);
end $$;
-- A newer rate is published between the check and the approval.
reset role;
select _as(null);
insert into market_quotes (kind, market, crop, market_date, buy, sell, source_url, status, method) values
  ('fx_parallel', '', '', ledger_today(), 2990, 3000, 'https://example.com/fz2', 'published', 'manual');
set role authenticated;
select _as('02000000-0000-0000-0000-000000000002');
do $$
declare c jsonb; e uuid;
begin
  select checked into c from ledger_drafts where id = _id('DF');
  perform _eq((c ->> 'rate')::numeric, 2000::numeric, 'فُحص بسعر السوق يومها (٢٠٠٠)');
  perform _eq(c ->> 'fx_source', 'parallel', 'ومصدره السوق الموازي');
  e := ledger_draft_approve(_id('DF'));
  perform _eq((select fx_rate from journal_entries where id = e), 2000::numeric,
              'ويُرحَّل بالسعر الذي رآه صاحب الدفتر وإن نُشر بعده سعرٌ أحدث (٣٠٠٠)');
  perform _eq((select fx_source from journal_entries where id = e), 'parallel', 'ومصدر السعر كما رآه');
  perform _eq((select sum(base_minor) from journal_lines where entry_id = e and side = 'D')::bigint, 300::bigint,
              'وبالمعادل الذي رآه: ٦٠٠٠ جنيه ÷ ٢٠٠٠ = ٣$ لا ٢$');
  perform _eq((select status from ledger_drafts where id = _id('DF')), 'posted', 'والمسوّدة اعتُمدت');
end $$;
reset role;
select _as(null);

do $$
declare f integer; p integer;
begin
  select fails, passes into f, p from _score;
  if f > 0 then
    raise exception 'FAIL — % فحصاً لم يمرّ من %', f, f + p;
  end if;
  raise notice 'OK — % فحصاً', p;
end $$;
