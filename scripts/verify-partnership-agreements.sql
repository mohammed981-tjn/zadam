-- بوّابةُ عقد الشراكة (البندان ١٢٤ و١٢٧).
--
-- The land row is closed to everyone but its owner and the administrators; the
-- investor listing carries no village, coordinates, land name or owner. The
-- agreement opens only after the owner accepts, only for the two parties; a
-- signature counts for one version and one hash; a save after a signature
-- starts a new version and the old signature stays on record; two signatures
-- seal it with a reference and nothing changes after.

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


-- ── الناس: م صاحب الأرض، س المستثمر، غ غريب، د مدير ──────────────────────
insert into auth.users (id) values
  ('a1000000-0000-0000-0000-0000000000a1'),
  ('b2000000-0000-0000-0000-0000000000b2'),
  ('c3000000-0000-0000-0000-0000000000c3'),
  ('f6000000-0000-0000-0000-0000000000f6')
on conflict (id) do nothing;
insert into profiles (id, full_name, role, phone) values
  ('a1000000-0000-0000-0000-0000000000a1', 'الحاج عثمان محمد', 'investor', '0911111111'),
  ('b2000000-0000-0000-0000-0000000000b2', 'سلمى أحمد علي', 'investor', '0922222222'),
  ('c3000000-0000-0000-0000-0000000000c3', 'غريب', 'investor', null),
  ('f6000000-0000-0000-0000-0000000000f6', 'المدير', 'admin', null)
on conflict (id) do update set role = excluded.role, phone = excluded.phone, full_name = excluded.full_name;

grant usage on schema public, auth to anon, authenticated;
grant execute on function auth.uid() to anon, authenticated;
grant select, update on _who to anon, authenticated;
create table _ids (k text primary key, id uuid);
grant all on _ids to anon, authenticated;
create or replace function _id(k text) returns uuid language sql stable as $$ select id from _ids where _ids.k = $1 $$;
grant execute on function _id(text) to anon, authenticated;
grant select, insert, update, delete on lands, profiles to anon, authenticated;

do $$ begin perform _act_as(null); end $$;
insert into lands (id, owner_id, name, state, locality, village, latitude, longitude, feddans,
                   station_key, water_source, verification, documents_required,
                   open_to_investors, investor_models)
values ('11000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-0000000000a1', 'الجموعية',
        'الخرطوم', 'البقعة', 'ود البشير', 15.60, 32.50, 4, 'khartoum', 'river_pump', 'verified', 3,
        true, array['sharecrop','lease']);
-- The document count is the trigger's to write; three kinds on file, then listed.
insert into land_documents (land_id, kind, storage_path) values
  ('11000000-0000-0000-0000-000000000001', 'tenure', 'a/tenure.jpg'),
  ('11000000-0000-0000-0000-000000000001', 'photo', 'a/photo.jpg'),
  ('11000000-0000-0000-0000-000000000001', 'permit', 'a/permit.jpg');
update lands set listed = true where id = '11000000-0000-0000-0000-000000000001';

\echo ''
\echo 'أ) صفُّ الأرض لا يُقرأ لغير صاحبه — والعرضُ للمستثمرين بلا اسمٍ ولا موقع'

set role anon;
do $$ begin
  perform _eq((select count(*)::int from lands), 0, 'الزائر لا يقرأ صفَّ الأرض');
  perform _eq((select count(*)::int from investor_open_lands()), 1, 'ويرى العرضَ في فرص الاستثمار');
end $$;
reset role;

do $$ begin
  perform _eq(pg_get_function_result('public.investor_open_lands()'::regprocedure) ~* '(village|latitude|longitude|land_name|owner_id)',
    false, 'والعرضُ لا يُرجع قريةً ولا إحداثيّاتٍ ولا اسمَ أرضٍ ولا صاحبَها');
end $$;

set role authenticated;
do $$ begin
  perform _act_as('c3000000-0000-0000-0000-0000000000c3');
  perform _eq((select count(*)::int from lands), 0, 'والغريبُ المسجَّل لا يقرأه أيضاً');
  perform _act_as('a1000000-0000-0000-0000-0000000000a1');
  perform _eq((select village from lands where id = '11000000-0000-0000-0000-000000000001'), 'ود البشير',
    'وصاحبُها يقرأ أرضه كاملة');
end $$;
reset role;

\echo ''
\echo 'ب) العقدُ بعد القبول، ولطرفيه وحدهما'

set role authenticated;
do $$ begin
  perform _act_as('b2000000-0000-0000-0000-0000000000b2');
  insert into _ids values ('interest',
    investor_express_interest('11000000-0000-0000-0000-000000000001', 'sharecrop', 'أنا مستثمرة من الخرطوم وأريد تمويل الموسم الشتوي'));
  perform _refuses($q$select partnership_agreement_open(_id('interest'))$q$, 'لا عقدَ قبل أن يقبل صاحب الأرض');

  perform _act_as('a1000000-0000-0000-0000-0000000000a1');
  perform land_investor_decide(_id('interest'), true);

  perform _act_as('c3000000-0000-0000-0000-0000000000c3');
  perform _refuses($q$select partnership_agreement_open(_id('interest'))$q$, 'والغريبُ لا يفتح عقداً ليس طرفاً فيه');

  perform _act_as('b2000000-0000-0000-0000-0000000000b2');
  insert into _ids values ('agreement', partnership_agreement_open(_id('interest')));
  perform _eq(_id('agreement') is not null, true, 'المستثمرةُ تفتح العقد بعد القبول');

  perform _act_as('a1000000-0000-0000-0000-0000000000a1');
  perform _eq(partnership_agreement_open(_id('interest')), _id('agreement'), 'وصاحبُ الأرض يفتح العقدَ نفسَه لا عقداً ثانياً');

  perform _act_as('c3000000-0000-0000-0000-0000000000c3');
  perform _eq((select count(*)::int from partnership_agreements), 0, 'الغريبُ لا يرى العقد');
  perform _refuses($q$select partnership_agreement_view(_id('agreement'))$q$, 'ولا يعرضه');
end $$;
reset role;

set role anon;
do $$ begin
  perform _refuses($q$select partnership_agreement_view(_id('agreement'))$q$, 'ولا الزائر');
  perform _eq((select count(*)::int from partnership_agreements), 0, 'ولا يقرأ جدولَه');
end $$;
reset role;

\echo ''
\echo 'ج) التوقيعُ على نسخةٍ وبصمةٍ واحدة، والتعديلُ يُسقطه'

set role authenticated;
do $$
declare v jsonb; h text; n integer; ref text;
begin
  perform _act_as('b2000000-0000-0000-0000-0000000000b2');
  perform _changes_nothing($q$update partnership_agreements set status = 'signed'$q$, 'لا كتابةَ مباشرةً في الجدول');
  perform _refuses($q$insert into partnership_signatures (agreement_id, version, terms_hash, signer_id, role, full_name, signature)
                      values (_id('agreement'), 1, 'x', auth.uid(), 'investor', 'سلمى أحمد علي', 'M 1 1 L 2 2 L 3 3 L 4 4')$q$,
    'ولا توقيعَ يُكتب في الجدول باليد');

  v := partnership_agreement_view(_id('agreement'));
  perform _refuses(format($q$select partnership_agreement_sign(%L, %s, %L, 'سلمى أحمد علي', 'M 1 1 L 20 20 L 30 30', null)$q$,
                          _id('agreement'), v->>'version', v->>'terms_hash'),
    'لا توقيعَ على بنودٍ ناقصة');

  perform _refuses(format($q$select partnership_agreement_save(%L, %L::jsonb)$q$, _id('agreement'),
    '{"crop":"قمح","season":"الشتوي ٢٠٢٦/٢٧","start_date":"2026-11-01","end_date":"2027-04-30","feddans":4,"owner_provides":["land","water"],"investor_provides":["seed"],"owner_share":50,"investor_share":40,"loss_rule":"by_contribution"}'),
    'الحصّتان لا تجمعان ١٠٠ — رُفض');
  perform _refuses(format($q$select partnership_agreement_save(%L, %L::jsonb)$q$, _id('agreement'),
    '{"crop":"قمح","season":"الشتوي ٢٠٢٦/٢٧","start_date":"2026-11-01","end_date":"2027-04-30","feddans":9,"owner_provides":["land"],"investor_provides":["seed"],"owner_share":50,"investor_share":50,"loss_rule":"by_contribution"}'),
    'مساحةٌ أكبر من الأرض — رُفضت');
  perform _refuses(format($q$select partnership_agreement_save(%L, %L::jsonb)$q$, _id('agreement'),
    '{"crop":"قمح","season":"الشتوي ٢٠٢٦/٢٧","start_date":"2026-11-01","end_date":"2027-04-30","feddans":4,"owner_provides":["land","seed"],"investor_provides":["seed"],"owner_share":50,"investor_share":50,"loss_rule":"by_contribution"}'),
    'البندُ الواحد لا يقدّمه الطرفان معاً');

  perform _eq(partnership_agreement_save(_id('agreement'),
    '{"crop":"قمح","season":"الشتوي ٢٠٢٦/٢٧","start_date":"2026-11-01","end_date":"2027-04-30","feddans":4,"owner_provides":["land","water","labour"],"investor_provides":["seed","fertiliser","fuel"],"owner_share":60,"investor_share":40,"loss_rule":"by_contribution"}'::jsonb),
    2, 'بنودٌ كاملة تُحفظ نسخةً ثانية');

  perform _act_as('a1000000-0000-0000-0000-0000000000a1');
  v := partnership_agreement_view(_id('agreement'));
  perform _refuses(format($q$select partnership_agreement_sign(%L, %s, 'deadbeef', 'الحاج عثمان محمد', 'M 1 1 L 20 20 L 30 30', null)$q$,
                          _id('agreement'), v->>'version'),
    'بصمةٌ غير بصمة البنود المحفوظة — رُفض');
  perform _refuses(format($q$select partnership_agreement_sign(%L, %s, %L, 'الحاج عثمان محمد', '<script>alert(1)</script>', null)$q$,
                          _id('agreement'), v->>'version', v->>'terms_hash'),
    'والتوقيعُ مسارُ رسمٍ لا غير');
  perform _eq(partnership_agreement_sign(_id('agreement'), (v->>'version')::int, v->>'terms_hash',
                                         'الحاج عثمان محمد', 'M 10 10 L 40 60 L 80 20 L 120 70', 'test'),
    null::text, 'صاحبُ الأرض يوقّع النسخة الثانية — والعقدُ ينتظر الطرف الآخر');
  perform _refuses(format($q$select partnership_agreement_sign(%L, %s, %L, 'الحاج عثمان محمد', 'M 1 1 L 20 20 L 30 30', null)$q$,
                          _id('agreement'), v->>'version', v->>'terms_hash'),
    'ولا يوقّع النسخةَ نفسها مرّتين');

  perform _act_as('b2000000-0000-0000-0000-0000000000b2');
  perform _eq(partnership_agreement_save(_id('agreement'),
    '{"crop":"قمح","season":"الشتوي ٢٠٢٦/٢٧","start_date":"2026-11-01","end_date":"2027-04-30","feddans":4,"owner_provides":["land","water","labour"],"investor_provides":["seed","fertiliser","fuel"],"owner_share":55,"investor_share":45,"loss_rule":"by_contribution"}'::jsonb),
    3, 'المستثمرةُ تعدّل الحصّة — نسخةٌ ثالثة');
  v := partnership_agreement_view(_id('agreement'));
  perform _eq(jsonb_array_length(v->'signatures'), 0, 'فلا توقيعَ يُحسب على النسخة الجديدة');
  perform _eq((v->>'earlier_signatures')::int, 1, 'والتوقيعُ القديم محفوظٌ لا يُمحى');

  perform _act_as('a1000000-0000-0000-0000-0000000000a1');
  v := partnership_agreement_view(_id('agreement'));
  perform partnership_agreement_sign(_id('agreement'), (v->>'version')::int, v->>'terms_hash',
                                     'الحاج عثمان محمد', 'M 10 10 L 40 60 L 80 20 L 120 70', 'test');
  perform _act_as('b2000000-0000-0000-0000-0000000000b2');
  ref := partnership_agreement_sign(_id('agreement'), (v->>'version')::int, v->>'terms_hash',
                                    'سلمى أحمد علي', 'M 5 50 L 60 10 L 90 80 L 140 30', 'test');
  perform _eq(ref like 'SDQ-%', true, 'التوقيعُ الثاني يُقفل العقد برقمٍ — ' || coalesce(ref, 'null'));
  v := partnership_agreement_view(_id('agreement'));
  perform _eq(v->>'status', 'signed', 'والعقدُ موقَّعٌ من الطرفين');
  perform _eq(jsonb_array_length(v->'signatures'), 2, 'بتوقيعين على النسخة نفسها');

  perform _refuses(format($q$select partnership_agreement_save(%L, %L::jsonb)$q$, _id('agreement'),
    '{"crop":"قمح","season":"الشتوي","start_date":"2026-11-01","end_date":"2027-04-30","feddans":4,"owner_provides":["land"],"investor_provides":["seed"],"owner_share":10,"investor_share":90,"loss_rule":"by_contribution"}'),
    'وبعد القفل لا يُعدَّل');
end $$;
reset role;

do $$ begin
  perform _eq((select count(*)::int from notifications where kind = 'agreement_signed'), 3,
    'وإشعارُ التوقيع يصل الطرفين والمدير');
end $$;

\echo ''
\echo 'د) الصلاحيات'

do $$ begin
  perform _eq((select count(*)::int from pg_proc p
                where p.pronamespace = 'public'::regnamespace
                  and p.proname like 'partnership_%'
                  and has_function_privilege('anon', p.oid, 'execute')), 0,
    'الزائرُ لا ينفّذ أيّاً من دوالّ العقد');
  perform _eq(has_table_privilege('authenticated', 'public.partnership_signatures', 'insert'), false,
    'ولا يكتب المسجَّلُ في جدول التواقيع');
end $$;

\echo ''
\echo 'هـ) تنبيه المخاطرة، وتعريف المستثمر، والمساقاة (البند ١٣٦)'

-- An orchard of the same owner, offered for musaqah only; the stranger's
-- account carries a Saudi number, as the website writes it: digits, no plus.
do $$ begin perform _act_as(null); end $$;
update profiles set phone = '966512345678' where id = 'c3000000-0000-0000-0000-0000000000c3';
insert into lands (id, owner_id, name, state, locality, village, latitude, longitude, feddans,
                   station_key, water_source, verification, documents_required,
                   open_to_investors, investor_models)
values ('11000000-0000-0000-0000-000000000002', 'a1000000-0000-0000-0000-0000000000a1', 'بستان النخيل',
        'الشمالية', 'دنقلا', 'لبب', 19.17, 30.48, 3, 'dongola', 'river_pump', 'verified', 3,
        true, array['musaqah']);

set role authenticated;
do $$
declare v jsonb;
begin
  perform _act_as('c3000000-0000-0000-0000-0000000000c3');
  perform _refuses($q$select investor_express_interest('11000000-0000-0000-0000-000000000002', 'musaqah',
                      'أرعى النخيل بنفسي ولي خبرة عشر سنوات في دنقلا', false)$q$,
    'لا طلبَ شراكةٍ دون الإقرار بالمخاطرة');
  insert into _ids values ('orchard', investor_express_interest('11000000-0000-0000-0000-000000000002', 'musaqah',
                      'أرعى النخيل بنفسي ولي خبرة عشر سنوات في دنقلا', true));
  perform _eq(_id('orchard') is not null, true, 'وبالإقرار يُرسل طلبُ مساقاةٍ على بستانٍ يقبلها');
  perform _eq((select count(*)::int from land_investor_profiles()), 0, 'والمستثمرُ لا يقرأ تعريفات الطالبين');

  perform _act_as('a1000000-0000-0000-0000-0000000000a1');
  perform _eq((select risk_acknowledged from land_investor_profiles() where interest_id = _id('orchard')), true,
    'صاحبُ البستان يرى أنّ الطالب أقرّ بالمخاطرة');
  perform _eq((select dial_code from land_investor_profiles() where interest_id = _id('orchard')), '966',
    'ويرى بلده من رقمه، لا رقمه');
  perform _eq((select agreements_signed from land_investor_profiles() where interest_id = _id('interest')), 1,
    'ويرى عقود المستثمرة الموقّعة');
  perform _eq(pg_get_function_result('public.land_investor_profiles()'::regprocedure) ~* 'phone',
    false, 'والتعريفُ لا يُرجع هاتفاً');

  perform land_investor_decide(_id('orchard'), true);
  perform _act_as('c3000000-0000-0000-0000-0000000000c3');
  insert into _ids values ('musaqah', partnership_agreement_open(_id('orchard')));
  perform _refuses(format($q$select partnership_agreement_save(%L, %L::jsonb)$q$, _id('musaqah'),
    '{"crop":"نخيل بركاوي","season":"موسم ٢٠٢٧","start_date":"2027-01-01","end_date":"2027-10-31","feddans":3,"owner_provides":["land","water"],"investor_provides":["pruning","harvest"],"owner_share":70,"investor_share":30,"loss_rule":"by_contribution"}'),
    'في المساقاة الشجرُ من صاحب الأرض — وإلّا رُفض');
  perform _eq(partnership_agreement_save(_id('musaqah'),
    '{"crop":"نخيل بركاوي","season":"موسم ٢٠٢٧","start_date":"2027-01-01","end_date":"2027-10-31","feddans":3,"owner_provides":["land","water","trees"],"investor_provides":["pruning","irrigation","harvest"],"owner_share":70,"investor_share":30,"loss_rule":"by_contribution"}'::jsonb),
    2, 'وعقدُ مساقاةٍ بالشجر من صاحبه وحصّتين من الثمر يُحفظ');
  v := partnership_agreement_view(_id('musaqah'));
  perform _eq(v->>'model', 'musaqah', 'والعقدُ عقدُ مساقاة');
end $$;
reset role;

do $$ begin
  perform _eq(has_function_privilege('anon', 'public.land_investor_profiles()', 'execute'), false,
    'الزائرُ لا يقرأ تعريف المستثمرين');
  perform _eq(has_function_privilege('anon', 'public.investor_express_interest(uuid, text, text, boolean)', 'execute'), false,
    'ولا يرسل طلب شراكة');
  perform _eq((select risk_ack_at is not null from investor_interests where id = _id('orchard')), true,
    'ووقتُ الإقرار محفوظٌ مع الطلب');
end $$;

\echo ''
\echo 'و) الشراكة الثلاثيّة: أرضٌ ومالٌ وشركةٌ تدير (البند ١٣٦)'

-- ش: صاحب شركةٍ شريكةٍ موثّقة. والمستثمرة سلمى تملك شركةً أيضاً، فلا تُسمّى مديرةً لعقدها.
do $$ begin perform _act_as(null); end $$;
insert into auth.users (id) values ('d4000000-0000-0000-0000-0000000000d4') on conflict (id) do nothing;
insert into profiles (id, full_name, role) values ('d4000000-0000-0000-0000-0000000000d4', 'شركة الجزيرة للخدمات', 'investor')
on conflict (id) do update set full_name = excluded.full_name;
insert into partner_companies (id, owner_id, name, kinds, states, contact_name, phone, verified_at, active) values
  ('cc000000-0000-0000-0000-0000000000c1', 'd4000000-0000-0000-0000-0000000000d4', 'شركة الجزيرة للخدمات',
   array['supervision','mechanization'], array['الخرطوم'], 'عمر الطيب', '0912000000', now(), true),
  ('cc000000-0000-0000-0000-0000000000c2', 'b2000000-0000-0000-0000-0000000000b2', 'شركة سلمى',
   array['supervision'], array['الخرطوم'], 'سلمى أحمد', '0922000000', now(), true),
  ('cc000000-0000-0000-0000-0000000000c3', 'c3000000-0000-0000-0000-0000000000c3', 'شركة لم تُوثَّق',
   array['supervision'], array['الخرطوم'], 'غريب الدار', '0933000000', null, true);
insert into lands (id, owner_id, name, state, locality, village, latitude, longitude, feddans,
                   station_key, water_source, verification, documents_required,
                   open_to_investors, investor_models)
values ('11000000-0000-0000-0000-000000000003', 'a1000000-0000-0000-0000-0000000000a1', 'مشروع الشريك',
        'الخرطوم', 'البقعة', 'ود البشير', 15.61, 32.51, 10, 'khartoum', 'river_pump', 'verified', 3,
        true, array['managed']);

set role authenticated;
do $$
declare v jsonb; ref text; base jsonb;
begin
  perform _act_as('b2000000-0000-0000-0000-0000000000b2');
  insert into _ids values ('managed_interest', investor_express_interest('11000000-0000-0000-0000-000000000003', 'managed',
    'أموّل الموسم وتديره شركةٌ موثّقة، وأنا في الخارج', true));
  perform _act_as('a1000000-0000-0000-0000-0000000000a1');
  perform land_investor_decide(_id('managed_interest'), true);
  perform _act_as('b2000000-0000-0000-0000-0000000000b2');
  insert into _ids values ('managed', partnership_agreement_open(_id('managed_interest')));

  base := '{"crop":"ذرة","season":"الصيفي ٢٠٢٧","start_date":"2027-06-01","end_date":"2027-11-30","feddans":10,"owner_provides":["land","water"],"investor_provides":["seed","fertiliser","fuel"],"owner_share":40,"investor_share":60,"loss_rule":"by_contribution"}'::jsonb;
  perform _refuses(format($q$select partnership_agreement_save(%L, %L::jsonb)$q$, _id('managed'),
    base || '{"manager_share":20}'), 'لا عقدَ ثلاثيّاً بلا شركةٍ مديرة');
  perform _refuses(format($q$select partnership_agreement_save(%L, %L::jsonb)$q$, _id('managed'),
    base || '{"manager_company":"cc000000-0000-0000-0000-0000000000c1","manager_share":60}'),
    'وحصّة الإدارة لا تتجاوز ٥٠٪ من صافي الربح');
  perform _refuses(format($q$select partnership_agreement_save(%L, %L::jsonb)$q$, _id('managed'),
    base || '{"manager_company":"cc000000-0000-0000-0000-0000000000c3","manager_share":20}'),
    'ولا تُسمّى شركةٌ لم تُوثَّق');
  perform _refuses(format($q$select partnership_agreement_save(%L, %L::jsonb)$q$, _id('managed'),
    base || '{"manager_company":"cc000000-0000-0000-0000-0000000000c2","manager_share":20}'),
    'ولا شركةٌ يملكها أحد الطرفين');
  perform _eq(partnership_agreement_save(_id('managed'),
    base || '{"manager_company":"cc000000-0000-0000-0000-0000000000c1","manager_share":20}'), 2,
    'وبشركةٍ موثّقةٍ مستقلّة وحصّة ٢٠٪ يُحفظ');

  perform _act_as('c3000000-0000-0000-0000-0000000000c3');
  perform _eq((select count(*)::int from partnership_agreements where id = _id('managed')), 0, 'الغريبُ لا يرى العقد الثلاثيّ');

  perform _act_as('d4000000-0000-0000-0000-0000000000d4');
  perform _eq((select count(*)::int from partnership_agreements where id = _id('managed')), 1, 'والشركةُ المسمّاة تقرأ عقدها');
  perform _eq((select count(*)::int from partnership_agreements where id = _id('agreement')), 0, 'ولا تقرأ عقداً لم تُسمَّ فيه');
  v := partnership_agreement_view(_id('managed'));
  perform _eq(v->>'me', 'manager', 'وتراه بصفتها الشركةَ المديرة');
  perform _refuses(format($q$select partnership_agreement_save(%L, %L::jsonb)$q$, _id('managed'),
    base || '{"manager_company":"cc000000-0000-0000-0000-0000000000c1","manager_share":45}'),
    'ولا تعدّل البنود — يكتبها صاحب الأرض والمستثمر');

  perform _act_as('a1000000-0000-0000-0000-0000000000a1');
  v := partnership_agreement_view(_id('managed'));
  perform _eq(partnership_agreement_sign(_id('managed'), (v->>'version')::int, v->>'terms_hash',
                                         'الحاج عثمان محمد', 'M 10 10 L 40 60 L 80 20 L 120 70', 'test'),
    null::text, 'يوقّع صاحب الأرض');
  perform _act_as('b2000000-0000-0000-0000-0000000000b2');
  perform _eq(partnership_agreement_sign(_id('managed'), (v->>'version')::int, v->>'terms_hash',
                                         'سلمى أحمد علي', 'M 5 50 L 60 10 L 90 80 L 140 30', 'test'),
    null::text, 'ثمّ المستثمرة — ولا يُقفل العقد الثلاثيّ بتوقيعين');
  perform _act_as('d4000000-0000-0000-0000-0000000000d4');
  ref := partnership_agreement_sign(_id('managed'), (v->>'version')::int, v->>'terms_hash',
                                    'عمر الطيب عن شركة الجزيرة', 'M 2 2 L 50 70 L 100 10 L 150 60', 'test');
  perform _eq(ref like 'SDQ-%', true, 'وتوقيعُ الشركة الثالث يُقفله برقم — ' || coalesce(ref, 'null'));
  v := partnership_agreement_view(_id('managed'));
  perform _eq(v->>'status', 'signed', 'والعقدُ الثلاثيّ موقَّع');
  perform _eq(jsonb_array_length(v->'signatures'), 3, 'بثلاثة تواقيع على النسخة نفسها');
end $$;
reset role;

do $$ begin
  perform _eq((select count(*)::int from notifications
                where kind = 'agreement_signed' and recipient_id = 'd4000000-0000-0000-0000-0000000000d4'), 1,
    'وإشعارُ الإقفال يصل الشركة أيضاً');
end $$;

\echo ''
\echo 'ز) الأرض لا تُعقد كاملةً لمستثمرَين في المدّة نفسها (BUG-14، البند ١٦٢)'

-- الأرض ٣ مساحتها ١٠ فدادين، وعقد سلمى الموقَّع عليها: ١٠ فدادين من ٢٠٢٧-٠٦-٠١ إلى ٢٠٢٧-١١-٣٠.
-- غريب (ص) يطلب عليها ويكتب عقداً بالحصّة (sharecrop) في مدّةٍ تتداخل معه.
do $$ begin perform _act_as(null); end $$;
update lands set investor_models = array['managed','sharecrop'] where id = '11000000-0000-0000-0000-000000000003';

set role authenticated;
do $$
declare v jsonb; ref text; base jsonb;
begin
  perform _act_as('c3000000-0000-0000-0000-0000000000c3');
  insert into _ids values ('second_interest', investor_express_interest('11000000-0000-0000-0000-000000000003', 'sharecrop',
    'أزرع القمح الشتويّ وعندي خبرةٌ وآليّاتي', true));
  perform _act_as('a1000000-0000-0000-0000-0000000000a1');
  perform land_investor_decide(_id('second_interest'), true);
  perform _act_as('c3000000-0000-0000-0000-0000000000c3');
  insert into _ids values ('second', partnership_agreement_open(_id('second_interest')));

  base := '{"crop":"قمح","season":"الشتوي","owner_provides":["land","water"],"investor_provides":["seed","fertiliser","fuel"],"owner_share":40,"investor_share":60,"loss_rule":"by_contribution"}'::jsonb;

  -- ١٠ فدادين في مدّةٍ تتداخل مع عقد سلمى (يوليو – ديسمبر): تتجاوز المتاح فيُرفض التوقيع.
  perform _eq(partnership_agreement_save(_id('second'),
    base || '{"start_date":"2027-08-01","end_date":"2027-12-31","feddans":10}'), 2, 'يُحفظ عقدٌ مسوَّدة بعشرة فدادين تتداخل مدّتها (المسوَّدة لا تحجز شيئاً)');
  v := partnership_agreement_view(_id('second'));
  perform _act_as('a1000000-0000-0000-0000-0000000000a1');
  perform _refuses(format($q$select partnership_agreement_sign(%L, %s, %L, 'الحاج عثمان محمد', 'M 1 1 L 20 20 L 30 30', null)$q$,
    _id('second'), v->>'version', v->>'terms_hash'),
    'ويُرفض التوقيع: العشرة محجوزةٌ كلّها في مدّةٍ متداخلة');

  -- أربعة فدادين في المدّة نفسها: لا يبقى إلا صفر، فيُرفض أيضاً.
  perform _act_as('c3000000-0000-0000-0000-0000000000c3');
  perform _eq(partnership_agreement_save(_id('second'),
    base || '{"start_date":"2027-08-01","end_date":"2027-12-31","feddans":4}'), 3, 'ويُعدَّل إلى أربعة فدادين');
  v := partnership_agreement_view(_id('second'));
  perform _act_as('a1000000-0000-0000-0000-0000000000a1');
  perform _refuses(format($q$select partnership_agreement_sign(%L, %s, %L, 'الحاج عثمان محمد', 'M 1 1 L 20 20 L 30 30', null)$q$,
    _id('second'), v->>'version', v->>'terms_hash'),
    'والأربعة أيضاً: لم يبقَ من الأرض شيءٌ في تلك الأيّام');

  -- مدّة لا تتداخل (بعد انتهاء عقد سلمى): تكفي الأرض كلّها.
  perform _act_as('c3000000-0000-0000-0000-0000000000c3');
  perform _eq(partnership_agreement_save(_id('second'),
    base || '{"start_date":"2027-12-01","end_date":"2028-04-30","feddans":10}'), 4, 'وتُعدَّل المدّة إلى ما بعد عقد سلمى');
  v := partnership_agreement_view(_id('second'));
  perform _act_as('a1000000-0000-0000-0000-0000000000a1');
  perform _eq(partnership_agreement_sign(_id('second'), (v->>'version')::int, v->>'terms_hash',
                                         'الحاج عثمان محمد', 'M 1 1 L 20 20 L 30 30', null),
    null::text, 'فيوقّع صاحب الأرض: مدّةٌ لا تتداخل، فالأرض كلّها متاحة');
  perform _act_as('c3000000-0000-0000-0000-0000000000c3');
  ref := partnership_agreement_sign(_id('second'), (v->>'version')::int, v->>'terms_hash',
                                    'عمر غريب الدار', 'M 5 5 L 25 25 L 35 35', null);
  perform _eq(ref like 'SDQ-%', true, 'ويُقفل العقد الثاني برقم — ' || coalesce(ref, 'null'));
end $$;
reset role;

\echo ''
\echo '=========================================================================='

do $$
declare f integer;
begin
  select fails into f from _score;
  if f > 0 then raise exception 'فشل % فحصاً.', f; end if;
  raise notice 'ALL CHECKS PASSED — العقدُ يُوقَّع على نصٍّ واحد، ويُقفل، ولا يراه غيرُ طرفيه';
end $$;
