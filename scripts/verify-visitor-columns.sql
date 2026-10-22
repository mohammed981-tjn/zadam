-- بوّابةُ ما يقرؤه الزائر (البند ١٣٢).
--
-- A signed-out visitor reads what the pages show — and not who did it, what
-- the administration wrote to itself, how to reach whoever wrote feedback, or
-- where export goods lie to the metre. A member does not read another's
-- review note or a writer's contact. The pages' own column lists still read;
-- the policies on other tables that used to read owner_id still answer.

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

create or replace function _runs(stmt text, label text) returns void
language plpgsql as $$
begin
  execute stmt;
  perform _pass(label);
exception when others then
  perform _fail(label, sqlerrm);
end $$;

create or replace function _act_as(p uuid) returns void
language plpgsql as $$ begin update _who set uid = p; end $$;

-- ── الناس ───────────────────────────────────────────────────────────────────
-- a1 مورد موثّق · a2 مورد ينتظر · b2 شركة موثّقة · b3 شركة تنتظر · d4 مقدّم موثّق ·
-- d5 مقدّم ينتظر · c3 عضوٌ آخر · e5 منظّم طلب جماعيّ · 07 صاحب أرض · f6 مدير
insert into auth.users (id) values
  ('a1000000-0000-0000-0000-0000000000a1'), ('a2000000-0000-0000-0000-0000000000a2'),
  ('b2000000-0000-0000-0000-0000000000b2'), ('b3000000-0000-0000-0000-0000000000b3'),
  ('d5000000-0000-0000-0000-0000000000d5'),
  ('c3000000-0000-0000-0000-0000000000c3'), ('d4000000-0000-0000-0000-0000000000d4'),
  ('e5000000-0000-0000-0000-0000000000e5'), ('07000000-0000-0000-0000-000000000007'),
  ('f6000000-0000-0000-0000-0000000000f6')
on conflict (id) do nothing;
insert into profiles (id, full_name, role) values
  ('a1000000-0000-0000-0000-0000000000a1', 'المورد', 'investor'),
  ('a2000000-0000-0000-0000-0000000000a2', 'مورد آخر', 'investor'),
  ('b3000000-0000-0000-0000-0000000000b3', 'شركة أخرى', 'investor'),
  ('d5000000-0000-0000-0000-0000000000d5', 'مقدّم آخر', 'investor'),
  ('b2000000-0000-0000-0000-0000000000b2', 'الشركة', 'investor'),
  ('c3000000-0000-0000-0000-0000000000c3', 'عضو', 'investor'),
  ('d4000000-0000-0000-0000-0000000000d4', 'مقدّم الخدمة', 'investor'),
  ('e5000000-0000-0000-0000-0000000000e5', 'المنظّم', 'investor'),
  ('07000000-0000-0000-0000-000000000007', 'صاحب الأرض', 'investor'),
  ('f6000000-0000-0000-0000-0000000000f6', 'المدير', 'admin')
on conflict (id) do update set role = excluded.role;

grant usage on schema public, auth to anon, authenticated;
grant execute on function auth.uid() to anon, authenticated;
grant select, update on _who to anon, authenticated;

-- ── ما في الجداول ───────────────────────────────────────────────────────────
-- Written as the database owner, the way the review functions would leave it.
do $$ begin perform _act_as('f6000000-0000-0000-0000-0000000000f6'); end $$;

insert into suppliers (id, owner_id, name, state, locality, phone, categories, commercial_registration_no,
                       licence_doc_path, verified_at, review_note, active)
values ('5a000000-0000-0000-0000-00000000005a', 'a1000000-0000-0000-0000-0000000000a1', 'مورد موثّق', 'الجزيرة', 'مدني',
        '0912345678', array['fertilizer'], 'CR-1', 'a1000000-0000-0000-0000-0000000000a1/licence.pdf', now(),
        'اتّصلنا بالمكتب وتحقّقنا من السجلّ', true),
       ('5b000000-0000-0000-0000-00000000005b', 'a2000000-0000-0000-0000-0000000000a2', 'مورد ينتظر', 'سنار', 'سنجة',
        '0912345679', array['fertilizer'], null, null, null, 'ينقص رقم السجلّ التجاري', true);
insert into supplier_products (supplier_id, category, name, pack_size, pack_unit, price_usd, valid_until, active)
values ('5a000000-0000-0000-0000-00000000005a', 'fertilizer', 'يوريا', 50, 'kg', 30, current_date + 30, true),
       ('5b000000-0000-0000-0000-00000000005b', 'fertilizer', 'داب', 50, 'kg', 35, current_date + 30, true);

insert into partner_companies (id, owner_id, name, kinds, states, contact_name, phone, commercial_registration_no,
                               verified_at, review_note, active)
values ('6a000000-0000-0000-0000-00000000006a', 'b2000000-0000-0000-0000-0000000000b2', 'شركة موثّقة', array['inputs'],
        array['سنار'], 'فلان', '0912345670', 'CR-2', now(), 'ملاحظة المراجع الداخليّة', true),
       ('6b000000-0000-0000-0000-00000000006b', 'b3000000-0000-0000-0000-0000000000b3', 'شركة تنتظر', array['inputs'],
        array['سنار'], 'فلان', '0912345671', null, null, 'أرسلوا السجلّ', true);
insert into partner_agreements (company_id, title, services, terms, valid_from, valid_until, status)
values ('6a000000-0000-0000-0000-00000000006a', 'اتّفاقٌ قائم', array['survey'], 'شروطٌ وأسعارٌ إرشاديّة بكلام الشركة',
        current_date, current_date + 365, 'active'),
       ('6b000000-0000-0000-0000-00000000006b', 'مسوّدة الشركة', array['survey'], 'شروطٌ وأسعارٌ إرشاديّة بكلام الشركة',
        current_date, current_date + 365, 'draft');

insert into service_providers (id, owner_id, name, kind, phone, verified_at, active)
values ('7a000000-0000-0000-0000-00000000007a', 'd4000000-0000-0000-0000-0000000000d4', 'مقدّم موثّق', 'engineering_office', '0912345672', now(), true),
       ('7b000000-0000-0000-0000-00000000007b', 'd5000000-0000-0000-0000-0000000000d5', 'مقدّم ينتظر', 'engineering_office', '0912345673', null, true);
insert into services (provider_id, service_key, title, unit, price_per_unit, active)
values ('7a000000-0000-0000-0000-00000000007a', 'soil_test', 'مسح', 'feddan', 100, true),
       ('7b000000-0000-0000-0000-00000000007b', 'soil_test', 'مسح لم يُوثَّق', 'feddan', 100, true);

insert into feedback (id, author_id, display_name, contact, kind, body, published)
values ('8a000000-0000-0000-0000-00000000008a', 'c3000000-0000-0000-0000-0000000000c3', 'عضو',
        '0911111111', 'suggestion', 'ملاحظة منشورة يقرؤها الجميع', true);

insert into group_orders (id, organiser_id, organiser_name, organiser_phone, supplier_id, title, pickup_name,
                          pickup_locality, pickup_state, drop_day, deadline, target_tonnes, deposit_pct, payee,
                          payee_account, status)
values ('9a000000-0000-0000-0000-00000000009a', 'e5000000-0000-0000-0000-0000000000e5', 'المنظّم', '0912222222',
        '5a000000-0000-0000-0000-00000000005a', 'طلبٌ مفتوح', 'المخزن', 'مدني', 'الجزيرة',
        current_date + 20, current_date + 10, 5, 10, 'cooperative', 'بنك الخرطوم 1234567', 'open'),
       ('9b000000-0000-0000-0000-00000000009b', 'e5000000-0000-0000-0000-0000000000e5', 'المنظّم', '0912222222',
        '5a000000-0000-0000-0000-00000000005a', 'طلبٌ أُلغي', 'المخزن', 'مدني', 'الجزيرة',
        current_date + 20, current_date + 10, 5, 10, 'cooperative', 'بنك الخرطوم 1234567', 'cancelled');

insert into lands (id, owner_id, name, state, locality, feddans, station_key, water_source, verification, listed)
values ('0a000000-0000-0000-0000-00000000000a', '07000000-0000-0000-0000-000000000007', 'أرض الوادي',
        'سنار', 'سنجة', 40, 'khartoum', 'river_pump', 'verified', false);

do $$ begin perform _act_as(null); end $$;

\echo ''
\echo 'أ) الزائر لا يقرأ من فعل، ولا ما كُتب للإدارة، ولا المواقع الدقيقة'

do $$
declare r record;
begin
  for r in select * from (values
    ('suppliers','owner_id'), ('suppliers','licence_doc_path'), ('suppliers','verified_by'), ('suppliers','review_note'),
    ('partner_companies','owner_id'), ('partner_companies','verified_by'), ('partner_companies','review_note'),
    ('service_providers','owner_id'), ('service_providers','verified_by'),
    ('projects','created_by'), ('projects','review_note'), ('projects','land_id'),
    ('feedback','author_id'), ('feedback','contact'), ('feedback','replied_by'),
    ('charter_signatures','user_id'), ('nafir_calls','organizer_id'), ('nafir_joins','user_id'),
    ('faza_requests','requester_id'), ('faza_pledges','pledger_id'), ('judiyya_mediators','user_id'),
    ('shura_items','author_id'), ('shura_items','answered_by'),
    ('market_offers','created_by'), ('market_offers','photo_path'),
    ('export_offers','owner_id'), ('export_offers','reviewed_by'), ('export_offer_events','actor_id'),
    ('export_offer_custody','latitude'), ('export_offer_custody','longitude'),
    ('export_offer_origins','latitude'), ('export_offer_origins','longitude'), ('export_offer_origins','boundary'),
    ('export_offer_evidence','latitude'), ('export_offer_evidence','longitude'), ('export_offer_evidence','storage_path')
  ) as t(tbl, col) loop
    perform _eq(has_column_privilege('anon', format('public.%I', r.tbl), r.col, 'SELECT'), false,
                format('الزائر لا يقرأ %s.%s', r.tbl, r.col));
  end loop;
end $$;

\echo ''
\echo 'ب) والعضو لا يقرأ ملاحظة الإدارة على غيره، ولا وسيلة تواصل كاتب الملاحظة'

do $$ begin
  perform _eq(has_column_privilege('authenticated', 'public.suppliers', 'review_note', 'SELECT'), false, 'العضو لا يقرأ suppliers.review_note');
  perform _eq(has_column_privilege('authenticated', 'public.partner_companies', 'review_note', 'SELECT'), false, 'ولا partner_companies.review_note');
  perform _eq(has_column_privilege('authenticated', 'public.feedback', 'contact', 'SELECT'), false, 'ولا feedback.contact');
  perform _eq(has_column_privilege('authenticated', 'public.suppliers', 'owner_id', 'SELECT'), true, 'ويقرأ owner_id ليجد ما له');
  perform _eq(has_column_privilege('authenticated', 'public.nafir_joins', 'user_id', 'SELECT'), true, 'ويقرأ من انضمّ ليعرف أنّه انضمّ');
end $$;

\echo ''
\echo 'ج) ما تطلبه الصفحات يُقرأ للزائر، و«كلّ الأعمدة» لا تُقرأ'

set role anon;
do $$ begin
  perform _runs($q$select id, name, state, locality, phone, whatsapp, delivery_states, categories, pesticide_licence_no, seed_registration_no, commercial_registration_no, bio, verified_at, active, created_at, updated_at from suppliers$q$, 'الموردون');
  perform _runs($q$select id, name, commercial_registration_no, kinds, states, contact_name, phone, whatsapp, bio, verified_at, active, created_at, updated_at from partner_companies$q$, 'الشركات');
  perform _runs($q$select id, name, kind, bio, phone, regions, verified_at, active, created_at, paused_by_owner from service_providers$q$, 'مقدّمو الخدمة');
  perform _runs($q$select id, slug, name, location, description, total_feddans, price_per_share, total_shares, shares_sold, status, risk_level, expected_annual_return, cover_image_url, created_at, is_demo, review_status, submitted_by, risk_score, crop_key, station_key, planting_month, irrigation, water_source, declared_water_per_feddan, documents_on_file, documents_required, km_to_market from projects$q$, 'المشاريع');
  perform _runs($q$select id, display_name, page_path, kind, body, status, admin_reply, replied_at, published, created_at, ai_reply, ai_replied_at, ai_reply_engine from feedback$q$, 'الملاحظات');
  perform _runs($q$select charter_version, role, display_name, pledge, state, signed_at, verified_at from charter_signatures$q$, 'الميثاق');
  perform _runs($q$select id, display_name, kind, title, description, state, locality, starts_on, needed, hosting, bring_tools, status, outcome, attended, created_at, closed_at, canal_id from nafir_calls$q$, 'النفير');
  perform _runs($q$select call_id, display_name, brings, joined_at from nafir_joins$q$, 'من انضمّ');
  perform _runs($q$select id, display_name, cause, title, description, state, locality, needs, status, created_at, closed_at from faza_requests$q$, 'الفزعة');
  perform _runs($q$select id, request_id, display_name, kind, detail, kept_at, created_at from faza_pledges$q$, 'التعهّدات');
  perform _runs($q$select display_name, state, about, created_at, verified_at from judiyya_mediators$q$, 'الوسطاء');
  perform _runs($q$select id, display_name, kind, title, body, answer, answer_name, answered_at, created_at from shura_items$q$, 'الشورى');
  perform _runs($q$select id, kind, crop, quantity, unit, grade, state, locality, price_sdg, price_usd, contact_phone, whatsapp, notes, status, expires_at, created_at, closed_at from market_offers$q$, 'عروض البيع');
  perform _runs($q$select id, reference, season_id, corridor_id, grade_id, quantity, uom_code, unit_price_minor, currency_code, value_minor, status, shipment_date, requirements_frozen_at, submitted_at, reviewed_at, rejection_reason, created_at, updated_at from export_offers$q$, 'عروض التصدير');
  perform _refuses($q$select * from suppliers$q$, 'و«كلّ الأعمدة» من الموردين تُرفض للزائر');
  perform _refuses($q$select contact from feedback$q$, 'ووسيلة التواصل تُرفض له صراحةً');
end $$;

\echo ''
\echo 'د) السياسات التي كانت تقرأ owner_id بنفسها ما زالت تجيب'

do $$ begin
  perform _eq((select count(*)::int from supplier_products), 1, 'الزائر يرى منتجات المورد الموثّق وحده');
  perform _eq((select count(*)::int from partner_agreements), 1, 'واتّفاق الشركة الموثّقة القائم وحده');
  perform _eq((select count(*)::int from services), 1, 'وخدمة المقدّم الموثّق وحدها');
end $$;
reset role;

set role authenticated;
do $$ begin
  perform _act_as('a2000000-0000-0000-0000-0000000000a2');
  perform _eq((select count(*)::int from supplier_products), 2, 'المورد الذي ينتظر يرى منتجه، ومنتج الموثّق');
  perform _act_as('b3000000-0000-0000-0000-0000000000b3');
  perform _eq((select count(*)::int from partner_agreements), 2, 'والشركة التي تنتظر ترى مسوّدتها');
  perform _act_as('d5000000-0000-0000-0000-0000000000d5');
  perform _eq((select count(*)::int from services), 2, 'ومقدّم الخدمة الذي ينتظر يرى خدمته');
  perform _act_as('c3000000-0000-0000-0000-0000000000c3');
  perform _eq((select count(*)::int from supplier_products), 1, 'والعضو الآخر كالزائر في المنتجات');
  perform _eq((select count(*)::int from services), 1, 'وفي الخدمات');
end $$;
reset role;

\echo ''
\echo 'هـ) ملاحظة الإدارة لصاحبها والإدارة، ووسيلة التواصل للإدارة'

set role authenticated;
do $$ begin
  perform _act_as('a1000000-0000-0000-0000-0000000000a1');
  perform _eq((select review_note from review_notes('supplier')), 'اتّصلنا بالمكتب وتحقّقنا من السجلّ', 'المورد يقرأ ملاحظة الإدارة على مورده وحده');
  perform _eq((select count(*)::int from review_notes('partner_company')), 0, 'ولا يقرأ ملاحظات الشركات');
  perform _act_as('b2000000-0000-0000-0000-0000000000b2');
  perform _eq((select review_note from review_notes('partner_company') where id = '6a000000-0000-0000-0000-00000000006a'),
              'ملاحظة المراجع الداخليّة', 'والشركة تقرأ ملاحظتها');
  perform _act_as('c3000000-0000-0000-0000-0000000000c3');
  perform _eq((select count(*)::int from review_notes('supplier')), 0, 'والعضو الآخر لا يقرأ شيئاً');
  perform _eq((select count(*)::int from feedback_contacts()), 0, 'ولا يقرأ وسائل التواصل، ولو كتب الملاحظة بنفسه');
  perform _refuses($q$select review_note from suppliers$q$, 'ولا يقرأ الملاحظة من الجدول');
  perform _act_as('f6000000-0000-0000-0000-0000000000f6');
  perform _eq((select count(*)::int from review_notes('supplier')), 2, 'والمدير يقرأ ملاحظات الموردين');
  perform _eq((select contact from feedback_contacts() where id = '8a000000-0000-0000-0000-00000000008a'),
              '0911111111', 'ووسيلة تواصل كاتب الملاحظة');
end $$;
reset role;

set role anon;
do $$ begin
  perform _act_as(null);
  perform _refuses($q$select * from review_notes('supplier')$q$, 'والزائر لا يستدعي الدالّة أصلاً');
  perform _refuses($q$select * from feedback_contacts()$q$, 'ولا دالّة التواصل');
end $$;
reset role;

\echo ''
\echo 'و) الطلب الجماعيّ الملغى لا يراه إلا أعضاؤه'

set role anon;
do $$ begin
  perform _act_as(null);
  perform _eq((select count(*)::int from group_order_detail('9a000000-0000-0000-0000-00000000009a')), 1, 'الزائر يرى الطلب المفتوح');
  perform _eq((select count(*)::int from group_order_detail('9b000000-0000-0000-0000-00000000009b')), 0, 'ولا يرى الملغى');
  perform _eq((select organiser_phone from group_order_detail('9a000000-0000-0000-0000-00000000009a')), null::text, 'ولا هاتف المنظّم، كما كان');
end $$;
reset role;

set role authenticated;
do $$ begin
  perform _act_as('e5000000-0000-0000-0000-0000000000e5');
  perform _eq((select count(*)::int from group_order_detail('9b000000-0000-0000-0000-00000000009b')), 1, 'والمنظّم يرى طلبه الملغى');
  perform _act_as('f6000000-0000-0000-0000-0000000000f6');
  perform _eq((select count(*)::int from group_order_detail('9b000000-0000-0000-0000-00000000009b')), 1, 'والمدير');
end $$;
reset role;

\echo ''
\echo 'ز) لا رقم هاتفٍ في ملاحظة الأرض المعروضة'

set role authenticated;
do $$ begin
  perform _act_as('07000000-0000-0000-0000-000000000007');
  perform _refuses($q$select land_set_investor_consent('0a000000-0000-0000-0000-00000000000a', true, array['sharecrop'], 'أرض على النيل، اتّصل بي 0912345678', null)$q$,
    'الدالّة ترفض رقماً بالأرقام الغربيّة');
  perform _refuses($q$select land_set_investor_consent('0a000000-0000-0000-0000-00000000000a', true, array['sharecrop'], 'أرض على النيل، هاتفي ٠٩١٢ ٣٤٥ ٦٧٨', null)$q$,
    'وبالأرقام العربيّة مع مسافات');
  perform _refuses($q$select land_set_investor_consent('0a000000-0000-0000-0000-00000000000a', true, array['sharecrop'], 'للتواصل +249-912-345-678 مساءً', null)$q$,
    'وبمفتاح الدولة والشرطات');
  perform _refuses($q$update lands set investor_note = 'رقمي 0912345678 للتواصل المباشر' where id = '0a000000-0000-0000-0000-00000000000a'$q$,
    'والجدول يرفضه إن كُتب مباشرةً');
  perform land_set_investor_consent('0a000000-0000-0000-0000-00000000000a', true, array['sharecrop'],
    'أرض على النيل، ٤٠ فداناً، زرعتُها ذرة في 2025 وأريد شريكاً بنصف المحصول', null);
end $$;
reset role;

do $$ begin
  perform _eq((select open_to_investors from lands where id = '0a000000-0000-0000-0000-00000000000a'), true,
    'والمساحة والسنة ليستا رقم هاتف');
end $$;

\echo ''
select case when fails = 0 then 'ALL CHECKS PASSED' else fails || ' FAILED' end as result from _score;
do $$ begin if (select fails from _score) > 0 then raise exception 'visitor columns gate failed'; end if; end $$;
