-- بوّابةُ سلسلة المدخلات.
--
-- A badge needs the licence that fits what is sold; a supplier's own edit to
-- that licence takes the badge away; a pledge is its farmer's and its
-- organiser's business; one member's default does not move anyone else; and a
-- delivery is confirmed by the recipient's code — which nobody can read back —
-- and locks after five wrong tries.

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
    perform _pass(label || ' — ' || coalesce(got::text,'null'));
  else
    perform _fail(label, 'جاء ' || coalesce(got::text,'null') || ' والمتوقَّع ' || coalesce(want::text,'null'));
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

create or replace function _changes_nothing(stmt text, label text) returns void
language plpgsql as $$
declare touched integer;
begin
  begin
    execute stmt;
    get diagnostics touched = row_count;
  exception when others then perform _pass(label || ' — رُفض صراحةً'); return;
  end;
  if touched = 0 then perform _pass(label);
  else perform _fail(label, 'مسّ ' || touched || ' صفّاً وكان يجب ألّا يمسّ شيئاً');
  end if;
end $$;

create or replace function _act_as(p uuid) returns void
language plpgsql as $$ begin update _who set uid = p; end $$;

-- ── الناس: م مورد، ن منظّم، ف وغ مزارعان، ك ناقل، د مدير ──────────────────
insert into auth.users (id) values
  ('a1000000-0000-0000-0000-0000000000a1'),
  ('b2000000-0000-0000-0000-0000000000b2'),
  ('c3000000-0000-0000-0000-0000000000c3'),
  ('d4000000-0000-0000-0000-0000000000d4'),
  ('e5000000-0000-0000-0000-0000000000e5'),
  ('f6000000-0000-0000-0000-0000000000f6')
on conflict (id) do nothing;
insert into profiles (id, full_name, role) values
  ('a1000000-0000-0000-0000-0000000000a1', 'م', 'investor'),
  ('b2000000-0000-0000-0000-0000000000b2', 'ن', 'investor'),
  ('c3000000-0000-0000-0000-0000000000c3', 'ف', 'investor'),
  ('d4000000-0000-0000-0000-0000000000d4', 'غ', 'investor'),
  ('e5000000-0000-0000-0000-0000000000e5', 'ك', 'investor'),
  ('f6000000-0000-0000-0000-0000000000f6', 'د', 'admin')
on conflict (id) do update set role = excluded.role;

grant usage on schema public, auth to anon, authenticated;
grant execute on function auth.uid() to anon, authenticated;
grant select, update on _who to anon, authenticated;

create table _ids (k text primary key, id uuid);
grant all on _ids to anon, authenticated;
create or replace function _id(k text) returns uuid language sql stable as $$ select id from _ids where _ids.k = $1 $$;
grant execute on function _id(text) to anon, authenticated;
create table _code (v text);
grant all on _code to anon, authenticated;

\echo ''
\echo 'أ) المورد — الشارة بعد الرخصة، وتسقط بتعديلها'

do $$ begin perform _act_as('a1000000-0000-0000-0000-0000000000a1'); end $$;
set role authenticated;
do $$ begin
  insert into _ids values ('s', supplier_save('مخازن النيل للمدخلات', 'الجزيرة', 'ود مدني', '0912345678', null,
    array['الجزيرة','سنار'], array['fertilizer','pesticide'], null, null, 'CR-5521', 'تاجر مدخلات منذ ٢٠١٢ في سوق مدني'));
  perform _changes_nothing($q$insert into suppliers (owner_id, name, state, locality, phone, categories, verified_at)
    values ('d4000000-0000-0000-0000-0000000000d4', 'دخيل', 'الجزيرة', 'مدني', '0912345678', array['seed'], now())$q$,
    'لا يُكتب جدول الموردين مباشرةً');
  perform _changes_nothing($q$update suppliers set verified_at = now()$q$, 'ولا يوثّق المورد نفسه');
  perform _refuses($q$select supplier_set_document('d4000000-0000-0000-0000-0000000000d4/licence.jpg')$q$,
    'ولا يرفع مستنداً من مجلّد غيره');
  perform supplier_set_document('a1000000-0000-0000-0000-0000000000a1/suppliers/licence.jpg');
  perform _refuses($q$select supplier_product_save(null, 'pesticide', 'insecticide', 'دايمثويت', 'Dimethoate 40%', null, null, 1, 'l', 9, current_date + 30)$q$,
    'المبيد بلا رقم تسجيلٍ لا يُعرض');
  insert into _ids values ('p1', supplier_product_save(null, 'pesticide', 'insecticide', 'دايمثويت ٤٠', 'Dimethoate 40%', 'PCB-1234/2024', null, 1, 'l', 9, current_date + 30));
  insert into _ids values ('p2', supplier_product_save(null, 'fertilizer', 'urea', 'يوريا ٤٦٪', null, null, null, 50, 'kg', 54, current_date + 30));
  perform _refuses($q$select supplier_product_save(null, 'fertilizer', 'urea', 'يوريا قديمة', null, null, null, 50, 'kg', 54, current_date - 1)$q$,
    'ولا سعرٌ انتهت صلاحيته');
end $$;

reset role;
do $$ begin perform _act_as(null); end $$;
set role anon;
do $$ begin
  perform _eq((select count(*)::int from suppliers), 0, 'الزائر لا يرى مورداً لم يوثَّق');
  perform _eq((select count(*)::int from verify_registration('PCB-1234/2024')), 0, 'ولا يجد منتجه في التحقّق');
end $$;

reset role;
do $$ begin perform _act_as('f6000000-0000-0000-0000-0000000000f6'); end $$;
set role authenticated;
do $$ begin
  perform _refuses($q$select supplier_review(_id('s'), true, null)$q$, 'تاجر مبيدات بلا رخصة المجلس لا يوثَّق');
end $$;

reset role;
do $$ begin perform _act_as('a1000000-0000-0000-0000-0000000000a1'); end $$;
set role authenticated;
do $$ begin
  perform supplier_save('مخازن النيل للمدخلات', 'الجزيرة', 'ود مدني', '0912345678', null,
    array['الجزيرة','سنار'], array['fertilizer','pesticide'], 'NPC-778', null, 'CR-5521', 'تاجر مدخلات منذ ٢٠١٢ في سوق مدني');
end $$;

reset role;
do $$ begin perform _act_as('b2000000-0000-0000-0000-0000000000b2'); end $$;
set role authenticated;
do $$ begin
  perform _refuses($q$select supplier_review(_id('s'), true, null)$q$, 'والتوثيق ليس لغير المشرف');
end $$;

reset role;
do $$ begin perform _act_as('f6000000-0000-0000-0000-0000000000f6'); end $$;
set role authenticated;
do $$ begin
  perform supplier_review(_id('s'), true, 'رأيتُ الرخصة والسجلّ');
  perform _eq((select verified_by from suppliers where id = _id('s')), 'f6000000-0000-0000-0000-0000000000f6'::uuid, 'المشرف يوثّق بعد الرخصة');
end $$;

reset role;
do $$ begin perform _act_as(null); end $$;
set role anon;
do $$ begin
  perform _eq((select count(*)::int from suppliers), 1, 'فيراه الزائر');
  perform _eq((select count(*)::int from supplier_products), 2, 'ويرى منتجاته');
  perform _eq((select count(*)::int from verify_registration('pcb 1234 2024')), 1, 'والتحقّق يجد الرقم بلا شُرَطٍ ولا حروفٍ كبيرة');
  perform _eq((select count(*)::int from verify_registration('PCB-١٢٣٤/٢٠٢٤')), 1, 'وبالأرقام العربية');
  perform _eq((select count(*)::int from verify_registration('PCB-9999')), 0, 'ولا يجد رقماً غير مسجّل');
  perform _refuses($q$select supplier_save('x', 'الجزيرة', 'x', '0912345678', null, '{}', array['seed'], null, null, null, null)$q$,
    'والزائر لا ينادي دوالّ الكتابة');
end $$;

reset role;
do $$ begin perform _act_as('a1000000-0000-0000-0000-0000000000a1'); end $$;
set role authenticated;
do $$ begin
  perform supplier_save('مخازن النيل للمدخلات', 'الجزيرة', 'ود مدني', '0912345678', null,
    array['الجزيرة','سنار'], array['fertilizer','pesticide'], 'NPC-779', null, 'CR-5521', 'تاجر مدخلات منذ ٢٠١٢ في سوق مدني');
  perform _eq((select verified_at from suppliers where id = _id('s')), null::timestamptz, 'تغيير رقم الرخصة يُسقط الشارة');
end $$;

reset role;
do $$ begin perform _act_as('f6000000-0000-0000-0000-0000000000f6'); end $$;
set role authenticated;
do $$ begin perform supplier_review(_id('s'), true, null); end $$;

\echo ''
\echo 'ب) الطلب الجماعي — التعهّد لصاحبه، والتعثّر لا يعاقب الجماعة'

reset role;
do $$ begin perform _act_as('b2000000-0000-0000-0000-0000000000b2'); end $$;
set role authenticated;
do $$ begin
  insert into _ids values ('o', group_order_create(_id('s'), 'يوريا قسم الحصاحيصا', 'جمعية الحصاحيصا', '0911111111',
    'مكتب القسم', 'الحصاحيصا', 'الجزيرة', 14.7, 33.3, current_date + 20, current_date + 10, 30, 10,
    'cooperative', 'بنكك 1234567 — جمعية الحصاحيصا',  null,
    jsonb_build_array(jsonb_build_object('product_id', _id('p2'), 'name', 'يوريا ٤٦٪', 'unit_label', 'جوال ٥٠ كجم', 'unit_kg', 50, 'unit_price_usd', 54))));
  insert into _ids select 'l', id from group_order_lines where order_id = _id('o');
  perform _refuses($q$select group_order_create(_id('s'), 'طلب', 'ن', '0911111111', 'مكتب', 'الحصاحيصا', 'الجزيرة', null, null,
    current_date + 20, current_date + 10, 30, 10, 'supplier', 'بنكك 1', null,
    jsonb_build_array(jsonb_build_object('name', 'x', 'unit_label', 'x', 'unit_kg', 50, 'unit_price_usd', 1))) $q$,
    'حسابُ الدفع أقصرُ من أن يكون حساباً');
  perform _changes_nothing($q$update group_orders set status = 'delivered'$q$, 'ولا يُكتب الطلب مباشرةً');
end $$;

reset role;
do $$ begin perform _act_as('c3000000-0000-0000-0000-0000000000c3'); end $$;
set role authenticated;
do $$ begin
  insert into _ids values ('pf', group_order_pledge(_id('l'), 200, 'فاطمة', '0922222222'));
  perform _eq((select payee_account from group_order_detail(_id('o'))), 'بنكك 1234567 — جمعية الحصاحيصا', 'المتعهّدة ترى حساب الدفع');
  perform _refuses($q$select group_order_mark_deposit(_id('pf'), 'TRX-0001')$q$, 'ولا تسجّل مقدّمها بنفسها');
end $$;

reset role;
do $$ begin perform _act_as('d4000000-0000-0000-0000-0000000000d4'); end $$;
set role authenticated;
do $$ begin
  insert into _ids values ('pg', group_order_pledge(_id('l'), 400, 'غازي', null));
  perform _eq((select count(*)::int from group_order_pledges), 1, 'غازي يرى تعهّده وحده لا تعهّد جارته');
end $$;

reset role;
do $$ begin perform _act_as(null); end $$;
set role anon;
do $$ begin
  perform _eq((select pledged_tonnes from group_order_directory() where id = _id('o')), 30.0::numeric, 'الزائر يرى الحمولة: ٦٠٠ جوال × ٥٠ كجم = ٣٠ طناً');
  perform _eq((select payee_account from group_order_detail(_id('o'))), null::text, 'ولا يرى حساب الدفع');
  perform _eq((select organiser_phone from group_order_detail(_id('o'))), null::text, 'ولا هاتف المنظّم');
  perform _eq((select count(*)::int from group_order_pledges), 0, 'ولا التعهّدات');
  -- The owner, 25 October 2026: the pickup place «is seen only by those who ordered, and the administration».
  perform _eq((select pickup_lat from group_order_detail(_id('o'))), null::numeric, 'ولا إحداثيّة الاستلام');
  perform _eq((select pickup_name from group_order_detail(_id('o'))), null::text, 'ولا اسم مكان الاستلام');
  perform _eq((select organiser_name from group_order_detail(_id('o'))), null::text, 'ولا اسم المنظّم');
  perform _eq((select pickup_name from group_order_directory() where id = _id('o')), null::text, 'ولا اسم المكان في القائمة');
  perform _eq((select pickup_locality from group_order_detail(_id('o'))), 'الحصاحيصا', 'ويرى المحليّة ليعرف أهو قريب');
end $$;

reset role;
do $$ begin perform _act_as('e5000000-0000-0000-0000-0000000000e5'); end $$;
set role authenticated;
do $$ begin
  perform _eq((select pickup_lat from group_order_detail(_id('o'))), null::numeric, 'والمسجَّل الذي لم ينضمّ لا يرى الإحداثيّة');
end $$;

reset role;
do $$ begin perform _act_as('c3000000-0000-0000-0000-0000000000c3'); end $$;
set role authenticated;
do $$ begin
  perform _eq((select pickup_lat from group_order_detail(_id('o'))), 14.7::numeric, 'والمتعهّدة ترى إحداثيّة الاستلام');
  perform _eq((select pickup_name from group_order_detail(_id('o'))), 'مكتب القسم', 'واسم المكان');
  perform _eq((select organiser_name from group_order_detail(_id('o'))), 'جمعية الحصاحيصا', 'واسم المنظّم');
  perform _eq((select pickup_name from group_order_directory() where id = _id('o')), 'مكتب القسم', 'وفي القائمة');
end $$;

reset role;
do $$ begin perform _act_as('b2000000-0000-0000-0000-0000000000b2'); end $$;
set role authenticated;
do $$ begin
  perform _eq((select count(*)::int from group_order_pledges), 2, 'المنظّم يرى التعهّدين');
  perform _refuses($q$select group_order_mark_deposit(_id('pf'), 'ab')$q$, 'المقدّم برقم تحويلٍ حقيقيّ');
  perform group_order_mark_deposit(_id('pf'), 'BNK-778812');
  perform group_order_set_pledge(_id('pg'), 'defaulted', 'لم يدفع المقدّم');
  perform _eq((select status from group_order_pledges where id = _id('pf')), 'deposit_received', 'تعثّر غازي لا يمسّ فاطمة');
  perform _eq((select pledged_tonnes from group_order_directory() where id = _id('o')), 10.0::numeric, 'ويُسقط تعهّده وحده من الحمولة');
end $$;

reset role;
do $$ begin perform _act_as('c3000000-0000-0000-0000-0000000000c3'); end $$;
set role authenticated;
do $$ begin
  perform _refuses($q$select group_order_withdraw(_id('pf'))$q$, 'وبعد استلام المقدّم لا تنسحب وحدها');
  perform _refuses($q$select group_order_pledge(_id('l'), 1, 'فاطمة', null)$q$, 'ولا تعدّل كميّتها وحدها');
end $$;

\echo ''
\echo 'ج) التوصيل — الرمز للمستلم وحده، ولا يُقرأ، ويُقفل بعد خمس'

reset role;
do $$ begin perform _act_as('e5000000-0000-0000-0000-0000000000e5'); end $$;
set role authenticated;
do $$ begin
  insert into _ids values ('k', carrier_save('ترحيلات الشرق', '0933333333', 'دفار ٧ طن', 7, array['الجزيرة']));
end $$;

reset role;
do $$ begin perform _act_as('b2000000-0000-0000-0000-0000000000b2'); end $$;
set role authenticated;
do $$ begin
  perform _refuses($q$select delivery_assign(_id('o'), _id('pf'), _id('k'), 'حواشة ١٢ — الحصاحيصا', null, null, 15)$q$,
    'لا يُسند التوصيل لناقلٍ لم يوثَّق');
end $$;

reset role;
do $$ begin perform _act_as('f6000000-0000-0000-0000-0000000000f6'); end $$;
set role authenticated;
do $$ begin perform carrier_review(_id('k'), true, null); end $$;

reset role;
do $$ begin perform _act_as('b2000000-0000-0000-0000-0000000000b2'); end $$;
set role authenticated;
do $$ begin
  perform _refuses($q$select delivery_assign(_id('o'), _id('pg'), _id('k'), 'حواشة ٣', null, null, 15)$q$,
    'ولا لتعهّدٍ متعثّر');
  insert into _ids values ('d', delivery_assign(_id('o'), _id('pf'), _id('k'), 'حواشة ١٢ — الحصاحيصا', null, null, 15));
  insert into _ids values ('d2', delivery_assign(_id('o'), null, _id('k'), 'مكتب القسم', 14.7, 33.3, 120));
  perform _refuses($q$select delivery_issue_code(_id('d'))$q$, 'المنظّم لا يُصدر رمز فاطمة');
  perform _refuses($q$select delivery_mark_paid(_id('d'), 'PAY-0001')$q$, 'ولا يُدفع للناقل قبل التأكيد');
end $$;

reset role;
do $$ begin perform _act_as('c3000000-0000-0000-0000-0000000000c3'); end $$;
set role authenticated;
do $$ begin
  insert into _code select delivery_issue_code(_id('d'));
  perform _eq((select v ~ '^[0-9]{6}$' from _code), true, 'فاطمة تُصدر رمزاً من ستّة أرقام');
  perform _refuses($q$select * from delivery_codes$q$, 'ولا يُقرأ الرمز المجزّأ من الجدول');
end $$;

reset role;
do $$ begin perform _act_as('e5000000-0000-0000-0000-0000000000e5'); end $$;
set role authenticated;
do $$ begin
  perform _refuses($q$select * from delivery_codes$q$, 'ولا يقرؤه الناقل');
  perform _eq((select count(*)::int from deliveries), 2, 'الناقل يرى ما أُسند إليه');
  perform _refuses($q$select delivery_confirm(_id('d'), (select v from _code), 'c3000000-0000-0000-0000-0000000000c3/x.jpg', 14.7, 33.3, 10)$q$,
    'الصورة من مجلّد الناقل لا من غيره');
  perform _refuses($q$select delivery_confirm(_id('d'), (select v from _code), 'e5000000-0000-0000-0000-0000000000e5/d/x.jpg', 51.5, 0.1, 10)$q$,
    'والموقع من داخل السودان');
  perform _eq(delivery_confirm(_id('d'), case when (select v from _code) = '000000' then '111111' else '000000' end,
    'e5000000-0000-0000-0000-0000000000e5/d/x.jpg', 14.7, 33.3, 10), 'wrong_code', 'رمزٌ خاطئ لا يؤكّد');
  perform _eq((select status from deliveries where id = _id('d')), 'assigned', 'والتوصيل باقٍ بانتظار التسليم');
  perform _eq(delivery_confirm(_id('d'), (select v from _code), 'e5000000-0000-0000-0000-0000000000e5/d/x.jpg', 14.7, 33.3, 10), 'confirmed', 'والرمز الصحيح يؤكّد');
  perform _eq((select status from group_order_pledges where id = _id('pf')), null::text, 'والناقل لا يرى التعهّد نفسه');
end $$;

reset role;
do $$ begin perform _act_as('c3000000-0000-0000-0000-0000000000c3'); end $$;
set role authenticated;
do $$ begin
  perform _eq((select status from group_order_pledges where id = _id('pf')), 'collected', 'وتعهّد فاطمة صار مستلَماً');
  perform _refuses($q$select delivery_issue_code(_id('d'))$q$, 'ولا رمز بعد التأكيد');
end $$;

reset role;
do $$ begin perform _act_as('b2000000-0000-0000-0000-0000000000b2'); end $$;
set role authenticated;
do $$ begin
  perform delivery_mark_paid(_id('d'), 'PAY-0001');
  perform _eq((select status from deliveries where id = _id('d')), 'paid', 'وبعد التأكيد يُسجَّل الدفع للناقل');
  -- القفل: المنظّم مستلمُ حمولة نقطة الاستلام، فيُصدر رمزها.
  delete from _code;
  insert into _code select delivery_issue_code(_id('d2'));
end $$;

reset role;
do $$ begin perform _act_as('e5000000-0000-0000-0000-0000000000e5'); end $$;
set role authenticated;
do $$
declare i int; r text; wrong text;
begin
  wrong := case when (select v from _code) = '000000' then '111111' else '000000' end;
  for i in 1..5 loop
    r := delivery_confirm(_id('d2'), wrong, 'e5000000-0000-0000-0000-0000000000e5/d/y.jpg', 14.7, 33.3, 10);
  end loop;
  perform _eq(r, 'locked', 'الخامسة تُقفل الرمز');
  perform _eq(delivery_confirm(_id('d2'), (select v from _code), 'e5000000-0000-0000-0000-0000000000e5/d/y.jpg', 14.7, 33.3, 10),
    'locked', 'وبعد القفل لا يُقبل حتى الرمز الصحيح');
end $$;

\echo ''
\echo 'د) البلاغات — لصاحبها وللمشرف'

reset role;
do $$ begin perform _act_as(null); end $$;
set role anon;
do $$ begin
  perform _refuses($q$select product_report_submit('مبيد', null, 'سوق مدني', 'الجزيرة', null, null)$q$, 'الزائر لا يبلّغ بلا حساب');
end $$;

reset role;
do $$ begin perform _act_as('c3000000-0000-0000-0000-0000000000c3'); end $$;
set role authenticated;
do $$ begin
  insert into _ids values ('r', product_report_submit('كلوربيريفوس', 'XYZ-1', 'سوق مدني', 'الجزيرة', 'c3000000-0000-0000-0000-0000000000c3/reports/a.jpg', 'العبوة بلا ملصق'));
  perform _refuses($q$select product_report_submit('مبيد', null, 'سوق', 'الجزيرة', 'd4000000-0000-0000-0000-0000000000d4/x.jpg', null)$q$, 'والصورة من مجلّده');
  perform _changes_nothing($q$update product_reports set status = 'dismissed'$q$, 'ولا يغيّر حال بلاغه');
end $$;

reset role;
do $$ begin perform _act_as('d4000000-0000-0000-0000-0000000000d4'); end $$;
set role authenticated;
do $$ begin
  perform _eq((select count(*)::int from product_reports), 0, 'غيره لا يرى البلاغ');
  perform _refuses($q$select product_report_review(_id('r'), 'forwarded', null)$q$, 'ولا يحيله');
end $$;

reset role;
do $$ begin perform _act_as('f6000000-0000-0000-0000-0000000000f6'); end $$;
set role authenticated;
do $$ begin
  perform product_report_review(_id('r'), 'forwarded', 'أُحيل إلى المجلس');
  perform _eq((select status from product_reports where id = _id('r')), 'forwarded', 'المشرف يحيله إلى المجلس');
end $$;

reset role;
do $$
declare f integer;
begin
  select fails into f from _score;
  if f = 0 then raise notice 'ALL CHECKS PASSED';
  else raise exception '% CHECK(S) FAILED', f;
  end if;
end $$;
