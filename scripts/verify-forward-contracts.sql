-- بوّابةُ العقد الآجل (البند ١٧٠).

\set ON_ERROR_STOP on
\set QUIET on

create table if not exists _score (fails integer not null default 0);
delete from _score;
insert into _score values (0);

create or replace function _fail(label text, why text) returns void
language plpgsql as $$
begin
  raise notice '  FAIL  % — %', label, why;
  update _score set fails = fails + 1;
end $$;

create or replace function _pass(label text) returns void
language plpgsql as $$
begin raise notice '  PASS  %', label; end $$;

create or replace function _eq(got anyelement, want anyelement, label text) returns void
language plpgsql as $$
begin
  if got is not distinct from want then
    perform _pass(label || ' — ' || coalesce(got::text, 'null'));
  else
    perform _fail(label, 'جاء ' || coalesce(got::text, 'null') || ' والمتوقَّع ' || coalesce(want::text, 'null'));
  end if;
end $$;

create or replace function _refuses(stmt text, label text) returns void
language plpgsql as $$
begin
  begin execute stmt;
  exception when others then perform _pass(label); return;
  end;
  perform _fail(label, 'نُفِّذ وكان يجب أن يُرفض');
end $$;

create or replace function _act_as(p uuid) returns void
language plpgsql as $$ begin update _who set uid = p; end $$;

-- A proposal with sensible terms; each check changes the one thing it is about.
create or replace function _propose(
  p_side text, p_phone text, p_offer uuid default null, p_season uuid default null,
  p_from integer default 30, p_to integer default 60)
returns uuid
language sql as $$
  select forward_contract_propose(
    p_side, p_phone, p_offer, 'سمسم', 'أبيض، نقاوة ٩٨٪، رطوبة لا تزيد على ٦٪', 100, 'qintar', 5,
    120000, 'SDG', current_date + p_from, current_date + p_to, 'مخزن الجمعيّة في القضارف',
    'عند التسليم بعد الفحص، تحويلاً بنكيّاً', 10, p_season, null)
$$;

-- b1 مشترٍ · f1 مزارع · x3 لا شأن له · f9 مدير
insert into auth.users (id, phone) values
  ('b1000000-0000-0000-0000-0000000000b1', null), ('f1000000-0000-0000-0000-0000000000f1', '249912000002'),
  ('c3000000-0000-0000-0000-0000000000c3', null), ('f9000000-0000-0000-0000-0000000000f9', null)
on conflict (id) do update set phone = excluded.phone;
insert into profiles (id, full_name, role, phone) values
  ('b1000000-0000-0000-0000-0000000000b1', 'المشتري', 'investor', '0911000001'),
  ('f1000000-0000-0000-0000-0000000000f1', 'المزارع', 'investor', null),
  ('c3000000-0000-0000-0000-0000000000c3', 'غريب', 'investor', '0933000003'),
  ('f9000000-0000-0000-0000-0000000000f9', 'المدير', 'admin', null)
on conflict (id) do update set role = excluded.role, phone = excluded.phone;

insert into seasons (id, owner_id, name, crop_key, station_key, irrigation, feddans, planting_date) values
  ('5f100000-0000-0000-0000-0000000005f1', 'f1000000-0000-0000-0000-0000000000f1', 'موسم السمسم', 'sesame',
   'gedaref', 'rainfed', 20, current_date),
  ('5c300000-0000-0000-0000-0000000005c3', 'c3000000-0000-0000-0000-0000000000c3', 'موسم غيره', 'sesame',
   'gedaref', 'rainfed', 20, current_date),
  ('5b100000-0000-0000-0000-0000000005b1', 'b1000000-0000-0000-0000-0000000000b1', 'موسم المشتري', 'sesame',
   'gedaref', 'rainfed', 5, current_date);

grant usage on schema public, auth to anon, authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated, service_role;
grant select, update on _who to anon, authenticated, service_role;
create table _c (n integer primary key, id uuid);
grant select, insert on _c to authenticated;

\echo ''
\echo 'أ) الاقتراح: برقم الطرف الآخر أو من عرض، بشروطٍ معقولة'

set role anon;
do $$ begin
  perform _act_as(null);
  perform _refuses($q$select _propose('buyer', '0912000002')$q$, 'الزائر لا يقترح');
end $$;
reset role;
set role authenticated;
do $$ begin
  perform _act_as('b1000000-0000-0000-0000-0000000000b1');
  perform _refuses($q$select _propose('buyer', '0999999999')$q$, 'لا عقد مع رقمٍ لا حساب له');
  perform _refuses($q$select _propose('buyer', '0911000001')$q$, 'ولا مع النفس');
  perform _refuses($q$select _propose('trader', '0912000002')$q$, 'ولا بلا جانبٍ معروف');
  perform _refuses($q$select _propose('buyer', '0912000002', null, null, -1, 30)$q$, 'ولا تسليمٌ يبدأ قبل اليوم');
  perform _refuses($q$select _propose('buyer', '0912000002', null, null, 30, 10)$q$, 'ولا ينتهي قبل أن يبدأ');
  perform _refuses($q$select _propose('buyer', '0912000002', null, null, 30, 800)$q$, 'ولا أبعد من سنتين');
  perform _refuses($q$select _propose('buyer', '0912000002', null, '5f100000-0000-0000-0000-0000000005f1')$q$,
                   'ولا يربط المشتري موسم المزارع');
  perform _refuses($q$select _propose('buyer', '0912000002', null, '5b100000-0000-0000-0000-0000000005b1')$q$,
                   'ولا موسماً له هو: الموسم في العقد موسم من يزرع');
  perform _refuses($q$insert into forward_contracts (buyer_id, farmer_id, proposed_by, phone_tail, crop, grade, quantity,
                        unit, price, currency, delivery_from, delivery_to, delivery_place, payment_terms, status, signed_at)
                      values ('b1000000-0000-0000-0000-0000000000b1', 'f1000000-0000-0000-0000-0000000000f1',
                              'b1000000-0000-0000-0000-0000000000b1', '0002', 'سمسم', 'أبيض نقيّ', 1, 'qintar', 1,
                              'SDG', current_date, current_date, 'هنا', 'نقداً', 'signed', now())$q$,
                   'ولا يكتب أحدٌ عقداً موقّعاً بيده');
  insert into _c values (1, _propose('buyer', '+249 912 000 002'));
  perform _eq((select status from forward_contracts where id = (select id from _c where n = 1)), 'proposed',
              'المشتري يقترح برقم المزارع بأيّ صيغة');
  perform _eq((select farmer_id from forward_contracts where id = (select id from _c where n = 1)),
              'f1000000-0000-0000-0000-0000000000f1'::uuid, 'ويصير صاحب الرقم هو المزارع');
  perform _eq((select farmer_name from forward_contract_parties((select id from _c where n = 1))), null::text,
              'ولا يرى المقترح اسم الطرف الآخر قبل التوقيع');
  perform _act_as('c3000000-0000-0000-0000-0000000000c3');
  perform _refuses($q$select _propose('farmer', '0911000001', null, '5f100000-0000-0000-0000-0000000005f1')$q$,
                   'ولا يربط مزارعٌ موسم غيره');
  perform _eq((select count(*)::int from forward_contracts), 0, 'والغريب لا يرى العقد');
  perform _eq((select count(*)::int from forward_contract_parties((select id from _c where n = 1))), 0,
              'ولا أسماء طرفيه');
  perform _act_as('f1000000-0000-0000-0000-0000000000f1');
  perform _eq((select buyer_name from forward_contract_parties((select id from _c where n = 1))), 'المشتري',
              'والمقترَح عليه يرى من يقترح');
end $$;
reset role;
do $$ begin
  perform _eq((select count(*)::int from notifications where recipient_id = 'f1000000-0000-0000-0000-0000000000f1'
                 and kind = 'forward_contract' and body like 'سمسم، 100 قنطار بسعر 120000 SDG%'), 1,
              'ويُخبَر المزارع بالشروط');
end $$;

\echo ''
\echo 'ب) التوقيع الثاني للطرف الآخر وحده، والشروط لا تتغيّر'

set role authenticated;
do $$ begin
  perform _act_as('b1000000-0000-0000-0000-0000000000b1');
  perform _refuses(format('select forward_contract_answer(%L, true)', (select id from _c where n = 1)),
                   'المقترح لا يوقّع مرّةً ثانية');
  perform _act_as('c3000000-0000-0000-0000-0000000000c3');
  perform _refuses(format('select forward_contract_answer(%L, true)', (select id from _c where n = 1)),
                   'ولا يوقّع الغريب');
  perform _act_as('f1000000-0000-0000-0000-0000000000f1');
  perform forward_contract_answer((select id from _c where n = 1), true);
  perform _refuses(format('select forward_contract_answer(%L, false)', (select id from _c where n = 1)),
                   'ولا يُجاب مرّتين');
  perform _act_as('b1000000-0000-0000-0000-0000000000b1');
  perform _eq((select farmer_name from forward_contract_parties((select id from _c where n = 1))), 'المزارع',
              'وبعد التوقيع يرى المقترح اسم الطرف الآخر');
end $$;
reset role;
do $$ begin
  perform _eq((select status from forward_contracts where id = (select id from _c where n = 1)), 'signed', 'وقّعه المزارع');
  perform _refuses(format('update forward_contracts set price = 1 where id = %L', (select id from _c where n = 1)),
                   'ولا يتغيّر السعر بعد ذلك، حتى بيد صاحب القاعدة');
  perform _refuses(format('update forward_contracts set delivery_to = delivery_to + 30 where id = %L',
                          (select id from _c where n = 1)), 'ولا موعد التسليم');
  perform _refuses(format('delete from forward_contracts where id = %L', (select id from _c where n = 1)),
                   'ولا يُحذف العقد');
end $$;

\echo ''
\echo 'ج) التسليم: يسجّله المشتري ويؤكّده المزارع'

set role authenticated;
do $$ begin
  perform _act_as('f1000000-0000-0000-0000-0000000000f1');
  perform _refuses(format('select forward_contract_deliver(%L, 95, current_date, true, null)', (select id from _c where n = 1)),
                   'المزارع لا يسجّل التسليم عن المشتري');
  perform _act_as('b1000000-0000-0000-0000-0000000000b1');
  perform _refuses(format('select forward_contract_deliver(%L, 95, current_date + 1, true, null)', (select id from _c where n = 1)),
                   'ولا تسليمٌ في يومٍ لم يأتِ');
  perform _refuses(format('select forward_contract_deliver(%L, 95, current_date, false, null)', (select id from _c where n = 1)),
                   'ولا مخالفةٌ للدرجة بلا بيانها');
  perform _refuses(format('select forward_contract_confirm(%L)', (select id from _c where n = 1)),
                   'ولا يُؤكَّد تسليمٌ لم يُسجَّل');
  perform forward_contract_deliver((select id from _c where n = 1), 95, current_date, true, null);
  perform _refuses(format('select forward_contract_confirm(%L)', (select id from _c where n = 1)),
                   'والمشتري لا يؤكّد تسليمه بنفسه');
  perform _act_as('f1000000-0000-0000-0000-0000000000f1');
  perform forward_contract_confirm((select id from _c where n = 1));
  perform _refuses(format('select forward_contract_cancel_request(%L, %L)', (select id from _c where n = 1), 'نريد الإلغاء'),
                   'وعقدٌ أُقفل لا يُطلب إلغاؤه');
  perform _refuses(format('select forward_contract_dispute(%L, %L)', (select id from _c where n = 1), 'نزاعٌ بعد الإقفال'),
                   'ولا يُنازَع فيه');
end $$;
reset role;
do $$ begin
  perform _eq((select status || ':' || delivered_quantity from forward_contracts where id = (select id from _c where n = 1)),
              'completed:95.00', 'أُقفل العقد بما سُجّل');
  perform _eq((select string_agg(event, ',' order by id) from forward_contract_events
                where contract_id = (select id from _c where n = 1)), 'proposed,signed,delivered,completed',
              'وكلّ خطوةٍ في السجلّ');
  perform _refuses($q$update forward_contract_events set note = 'تعديل'$q$, 'والسجلّ لا يُعدَّل');
  perform _refuses($q$delete from forward_contract_events$q$, 'ولا يُمحى');
end $$;

\echo ''
\echo 'د) لا يُلغى عقدٌ موقّعٌ إلا باتّفاق الطرفين'

set role authenticated;
do $$ begin
  perform _act_as('f1000000-0000-0000-0000-0000000000f1');
  insert into _c values (2, _propose('farmer', '0911000001', null, '5f100000-0000-0000-0000-0000000005f1'));
  perform _eq((select buyer_name from forward_contract_parties((select id from _c where n = 2))), null::text,
              'والمزارع المقترح لا يرى اسم المشتري قبل توقيعه');
  perform _act_as('b1000000-0000-0000-0000-0000000000b1');
  perform forward_contract_answer((select id from _c where n = 2), true);
  perform _act_as('f1000000-0000-0000-0000-0000000000f1');
  perform _refuses(format('select forward_contract_withdraw(%L)', (select id from _c where n = 2)),
                   'ولا يُسحب عقدٌ بعد توقيعه');
  perform _refuses(format('select forward_contract_cancel_request(%L, %L)', (select id from _c where n = 2), 'لا'),
                   'ولا طلب إلغاءٍ بلا سبب');
  perform forward_contract_cancel_request((select id from _c where n = 2), 'المطر تأخّر هذه السنة');
  perform _refuses(format('select forward_contract_cancel_answer(%L, true)', (select id from _c where n = 2)),
                   'وطالب الإلغاء لا يقبله بنفسه');
  perform _act_as('b1000000-0000-0000-0000-0000000000b1');
  perform forward_contract_cancel_answer((select id from _c where n = 2), false);
end $$;
reset role;
do $$ begin
  perform _eq((select status from forward_contracts where id = (select id from _c where n = 2)), 'signed',
              'رفض المشتري فبقي العقد قائماً');
  perform _eq((select season_id from forward_contracts where id = (select id from _c where n = 2)),
              '5f100000-0000-0000-0000-0000000005f1'::uuid, 'والمزارع ربط به موسمه');
end $$;
set role authenticated;
do $$ begin
  perform _act_as('b1000000-0000-0000-0000-0000000000b1');
  perform forward_contract_cancel_request((select id from _c where n = 2), 'تغيّر عقد التصدير عندنا');
  perform _act_as('f1000000-0000-0000-0000-0000000000f1');
  perform forward_contract_cancel_answer((select id from _c where n = 2), true);
end $$;
reset role;
do $$ begin
  perform _eq((select status from forward_contracts where id = (select id from _c where n = 2)), 'cancelled',
              'وطلبه المشتري فقبل المزارع، فأُلغي');
end $$;

\echo ''
\echo 'هـ) من عرضٍ في السوق، والنزاع تفصل فيه الإدارة'

insert into market_offers (id, kind, crop, quantity, unit, state, locality, contact_phone, created_by)
values ('0ff00000-0000-0000-0000-000000000ff1', 'buy', 'سمسم', 500, 'qintar', 'القضارف', 'القضارف', '249911000001',
        'b1000000-0000-0000-0000-0000000000b1');
set role authenticated;
do $$ begin
  perform _act_as('f1000000-0000-0000-0000-0000000000f1');
  insert into _c values (3, _propose('farmer', null, '0ff00000-0000-0000-0000-000000000ff1'));
  perform _act_as('b1000000-0000-0000-0000-0000000000b1');
  perform _eq((select buyer_id from forward_contracts where id = (select id from _c where n = 3)),
              'b1000000-0000-0000-0000-0000000000b1'::uuid, 'من عرض شراء: المشتري هو صاحب العرض');
  perform _refuses($q$select _propose('buyer', null, '0ff00000-0000-0000-0000-000000000ff1')$q$,
                   'ولا يقترح صاحب العرض على نفسه');
  perform forward_contract_answer((select id from _c where n = 3), true);
  perform _refuses(format('select forward_contract_dispute(%L, %L)', (select id from _c where n = 3), 'قصير'),
                   'ولا نزاعٌ بلا شرح');
  perform forward_contract_dispute((select id from _c where n = 3), 'المزارع لم يسلّم في الموعد ولا يردّ');
  perform _refuses(format('select forward_contract_resolve(%L, %L, %L)', (select id from _c where n = 3), 'cancelled',
                          'أفصل لنفسي في نزاعي'), 'ولا يفصل طرفٌ في نزاعه');
  perform _act_as('f9000000-0000-0000-0000-0000000000f9');
  perform _refuses(format('select forward_contract_resolve(%L, %L, %L)', (select id from _c where n = 3), 'resume', 'قصير'),
                   'والإدارة تفصل بسببٍ يقرؤه الطرفان');
  perform forward_contract_resolve((select id from _c where n = 3), 'resume', 'تواصلنا معهما: يسلّم الأسبوع القادم');
  perform _eq((select status from forward_contracts where id = (select id from _c where n = 3)), 'signed',
              'فصلت الإدارة: يستمرّ العقد كما كان');
  perform _act_as('f1000000-0000-0000-0000-0000000000f1');
  perform forward_contract_cancel_request((select id from _c where n = 3), 'لم يبقَ عندي محصول');
  perform forward_contract_dispute((select id from _c where n = 3), 'المشتري لا يجيب طلب الإلغاء منذ شهر');
  perform _act_as('f9000000-0000-0000-0000-0000000000f9');
  perform _refuses(format('select forward_contract_resolve(%L, %L, %L, %s, %L)', (select id from _c where n = 3), 'cancelled',
                          'امتنع المزارع عن التسليم بلا عذر', 2000000, 'farmer'),
                   'ولا غرامة فوق ما يسمح به الشرط الجزائيّ (١٠٪ من قيمة العقد)');
  perform _refuses(format('select forward_contract_resolve(%L, %L, %L, %s, %L)', (select id from _c where n = 3), 'cancelled',
                          'امتنع المزارع عن التسليم بلا عذر', 600000, 'nobody'), 'ولا غرامة بلا من يدفعها');
  perform forward_contract_resolve((select id from _c where n = 3), 'cancelled', 'امتنع المزارع عن التسليم بلا عذر؛ يُلغى وعليه غرامة الإخلال',
                                   600000, 'farmer');
end $$;
reset role;
do $$ begin
  perform _eq((select status from forward_contracts where id = (select id from _c where n = 3)), 'cancelled',
              'ثمّ ألغته بعد نزاعٍ ثانٍ');
  perform _eq((select penalty_awarded || ':' || penalty_payer from forward_contracts where id = (select id from _c where n = 3)),
              '600000.00:farmer', 'وكتبت الغرامة ومن يدفعها');
  perform _eq((select late_penalty_pct_week || '/' || late_penalty_cap_pct || '/' || breach_penalty_pct || '/' || force_majeure
                 from forward_contracts where id = (select id from _c where n = 3)), '1.0/10.0/10.0/true',
              'والشرط الجزائيّ الافتراضيّ: ١٪ أسبوعيّاً حتى ١٠٪، و١٠٪ للإخلال، والقوّة القاهرة معفاة');
  perform _refuses(format('update forward_contracts set breach_penalty_pct = 0 where id = %L', (select id from _c where n = 1)),
                   'والشرط الجزائيّ لا يتغيّر بعد الاقتراح');
  perform _refuses($q$insert into forward_contracts (buyer_id, farmer_id, proposed_by, phone_tail, crop, grade, quantity, unit,
                        price, currency, delivery_from, delivery_to, delivery_place, payment_terms, breach_penalty_pct)
                      values ('b1000000-0000-0000-0000-0000000000b1', 'f1000000-0000-0000-0000-0000000000f1',
                              'b1000000-0000-0000-0000-0000000000b1', '0002', 'سمسم', 'أبيض نقيّ', 1, 'qintar', 1,
                              'SDG', current_date, current_date, 'هنا', 'نقداً', 50)$q$,
                   'ولا غرامة إخلالٍ فوق ٣٠٪');
  perform _eq((select count(*)::int from notifications where kind = 'forward_contract'
                 and recipient_id = 'f9000000-0000-0000-0000-0000000000f9' and title like 'نزاعٌ على عقدٍ آجل%'), 2,
              'والإدارة تُخبَر بكلّ نزاع');
  perform _eq((select count(*)::int from notifications where kind = 'forward_contract' and title like 'فصلت الإدارة%'), 4,
              'والطرفان يُخبَران بكلّ فصل');
end $$;

\echo ''
\echo 'هـ٢) «اشترِ لأهلك»: المشتري يكتب من يستلم عنه، وهو من الشروط'

insert into market_offers (id, kind, crop, quantity, unit, state, locality, contact_phone, created_by)
values ('0ff00000-0000-0000-0000-000000000ff2', 'sell', 'ذرة', 40, 'sack', 'سنار', 'سنجة', '249912000002',
        'f1000000-0000-0000-0000-0000000000f1');
set role authenticated;
do $$ begin
  perform _act_as('f1000000-0000-0000-0000-0000000000f1');
  perform _refuses($q$select forward_contract_propose('farmer', '0911000001', null, 'ذرة', 'ذرة نظيفة جافّة', 10, 'sack', 5,
                        50000, 'SDG', current_date + 5, current_date + 20, 'بيت الأهل في سنجة', 'عند التسليم', null, null, null,
                        'أمّ المشتري', '0912333444')$q$, 'المزارع لا يكتب من يستلم عن المشتري');
  perform _act_as('b1000000-0000-0000-0000-0000000000b1');
  perform _refuses($q$select forward_contract_propose('buyer', null, '0ff00000-0000-0000-0000-000000000ff2', 'ذرة',
                        'ذرة نظيفة جافّة', 10, 'sack', 5, 50000, 'SDG', current_date + 5, current_date + 20,
                        'بيت الأهل في سنجة', 'عند التسليم', null, null, null, 'أمّ المشتري', null)$q$,
                   'ولا اسمٌ بلا جوّال');
  insert into _c values (5, forward_contract_propose('buyer', null, '0ff00000-0000-0000-0000-000000000ff2', 'ذرة',
                        'ذرة نظيفة جافّة', 10, 'sack', 5, 50000, 'SDG', current_date + 5, current_date + 20,
                        'بيت الأهل في سنجة', 'يحوّل المشتري من الخارج عند التسليم', null, null, null,
                        'أمّ المشتري', '+249 912-333-444'));
  perform _eq((select consignee_phone from forward_contracts where id = (select id from _c where n = 5)), '+249912333444',
              'المغترب يشتري من عرض بيعٍ لأهله، ويُحفظ جوّال من يستلم');
  perform _eq((select farmer_id from forward_contracts where id = (select id from _c where n = 5)),
              'f1000000-0000-0000-0000-0000000000f1'::uuid, 'والمزارع صاحب العرض');
  perform _act_as('f1000000-0000-0000-0000-0000000000f1');
  perform forward_contract_answer((select id from _c where n = 5), true);
end $$;
reset role;
do $$ begin
  perform _eq((select count(*)::int from notifications where recipient_id = 'f1000000-0000-0000-0000-0000000000f1'
                 and body like '%إلى أمّ المشتري عن المشتري%'), 1, 'والمزارع يعرف إلى من يسلّم');
  perform _refuses(format('update forward_contracts set consignee_phone = %L where id = %L', '0999999999',
                          (select id from _c where n = 5)), 'ومن يستلم لا يتغيّر بعد التوقيع');
end $$;

\echo ''
\echo 'و) السحب قبل الجواب، وحدّ اليوم'

set role authenticated;
do $$ begin
  perform _act_as('b1000000-0000-0000-0000-0000000000b1');
  insert into _c values (4, _propose('buyer', '0912000002'));
  perform _act_as('f1000000-0000-0000-0000-0000000000f1');
  perform _refuses(format('select forward_contract_withdraw(%L)', (select id from _c where n = 4)),
                   'لا يسحب الاقتراحَ غيرُ مقترحه');
  perform _act_as('b1000000-0000-0000-0000-0000000000b1');
  perform forward_contract_withdraw((select id from _c where n = 4));
  perform _act_as('f1000000-0000-0000-0000-0000000000f1');
  perform _refuses(format('select forward_contract_answer(%L, true)', (select id from _c where n = 4)),
                   'ولا يُوقَّع بعد سحبه');
end $$;
reset role;
insert into forward_contracts (buyer_id, farmer_id, proposed_by, phone_tail, crop, grade, quantity, unit, price, currency,
                               delivery_from, delivery_to, delivery_place, payment_terms, status, closed_at)
select 'b1000000-0000-0000-0000-0000000000b1', 'f1000000-0000-0000-0000-0000000000f1',
       'b1000000-0000-0000-0000-0000000000b1', '0002', 'سمسم', 'أبيض نقيّ', 1, 'qintar', 1, 'SDG',
       current_date, current_date, 'هنا', 'نقداً', 'withdrawn', now()
  from generate_series(1, 18);
set role authenticated;
do $$ begin
  perform _act_as('b1000000-0000-0000-0000-0000000000b1');
  perform _refuses($q$select _propose('buyer', '0912000002')$q$, 'عشرون اقتراحاً في اليوم حدّ الحساب');
end $$;
reset role;
do $$ begin
  perform _eq(has_function_privilege('anon',
                'forward_contract_propose(text,text,uuid,text,text,numeric,text,numeric,numeric,text,date,date,text,text,numeric,uuid,text,text,text,numeric,numeric,numeric,boolean)',
                'execute'), false, 'والزائر لا ينادي الاقتراح');
  perform _eq(has_function_privilege('authenticated', 'forward_contract_lock(uuid)', 'execute'), false,
              'ولا ينادي أحدٌ أداة القفل وحدها');
  perform _eq(has_table_privilege('anon', 'forward_contracts', 'select'), false, 'ولا يقرأ الزائر العقود');
end $$;

do $$
declare n integer;
begin
  select fails into n from _score;
  if n > 0 then raise exception '% فحصاً فشل', n; end if;
end $$;
\echo ''
\echo 'OK'
