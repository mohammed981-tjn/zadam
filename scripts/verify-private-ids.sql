-- بوّابةُ معرّفات الحسابات في المشاريع والموردين (البند ١٨١): لا يقرؤها كلّ عضو، ويقرؤها صاحبها والمدير بدالّتين.
--
-- Built on the fixture of verify-visitor-columns.sql (its first part is the same, so the rows are the same rows).

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

-- Two projects of the land owner 07: one on a land open to investors, one on a closed land; and a third land, open.
insert into lands (id, owner_id, name, state, locality, feddans, station_key, water_source, verification, listed,
                   open_to_investors, investor_models)
values ('0b000000-0000-0000-0000-00000000000b', '07000000-0000-0000-0000-000000000007', 'أرض معروضة',
        'سنار', 'سنجة', 30, 'khartoum', 'river_pump', 'verified', false, true, array['sharecrop']);
insert into projects (id, slug, name, location, total_feddans, price_per_share, total_shares, status,
                      created_by, submitted_by, review_note, land_id)
values ('1a000000-0000-0000-0000-00000000001a', 'open-land', 'على أرضٍ معروضة', 'سنجة', 30, 100, 10, 'open',
        '07000000-0000-0000-0000-000000000007', '07000000-0000-0000-0000-000000000007', 'ملاحظة المراجع', '0b000000-0000-0000-0000-00000000000b'),
       ('1b000000-0000-0000-0000-00000000001b', 'closed-land', 'على أرضٍ غير معروضة', 'سنجة', 40, 100, 10, 'open',
        '07000000-0000-0000-0000-000000000007', '07000000-0000-0000-0000-000000000007', null, '0a000000-0000-0000-0000-00000000000a');

-- The closed land has investor models but is not open: only its owner and the admins find it from the project.
update lands set investor_models = array['lease'] where id = '0a000000-0000-0000-0000-00000000000a';
grant select on lands to authenticated;

\echo ''
\echo 'أ) العضو لا يقرأ معرّفات الحسابات ولا مسار مستند الترخيص'

do $$
declare r record;
begin
  for r in select * from (values
    ('suppliers','owner_id'), ('suppliers','licence_doc_path'), ('suppliers','verified_by'), ('suppliers','review_note'),
    ('projects','created_by'), ('projects','review_note'), ('projects','land_id'),
    ('partner_companies','owner_id'), ('partner_companies','verified_by'), ('partner_companies','review_note')
  ) as t(tbl, col) loop
    perform _eq(has_column_privilege('authenticated', format('public.%I', r.tbl), r.col, 'SELECT'), false,
                format('العضو لا يقرأ %s.%s', r.tbl, r.col));
  end loop;
end $$;

set role authenticated;
do $$ begin
  perform _act_as('c3000000-0000-0000-0000-0000000000c3');
  perform _runs($q$select id, name, state, locality, phone, whatsapp, delivery_states, categories, pesticide_licence_no, seed_registration_no, commercial_registration_no, bio, verified_at, active, created_at, updated_at from suppliers$q$, 'وما تطلبه صفحات الموردين يُقرأ');
  perform _runs($q$select id, slug, name, location, description, total_feddans, price_per_share, total_shares, shares_sold, status, risk_level, expected_annual_return, cover_image_url, created_at, is_demo, review_status, submitted_by, risk_score, crop_key, station_key, planting_month, irrigation, water_source, declared_water_per_feddan, documents_on_file, documents_required, km_to_market from projects$q$, 'وما تطلبه صفحات المشاريع يُقرأ');
  perform _refuses($q$select owner_id from suppliers$q$, 'وصاحب المورد يُرفض للعضو');
  perform _refuses($q$select licence_doc_path from suppliers$q$, 'ومسار مستند الترخيص يُرفض');
  perform _refuses($q$select land_id from projects$q$, 'وأرض المشروع تُرفض من الجدول');
  perform _refuses($q$select * from projects$q$, 'و«كلّ الأعمدة» من المشاريع تُرفض للعضو');
  perform _runs($q$select id, name, commercial_registration_no, kinds, states, contact_name, phone, whatsapp, bio, verified_at, active, created_at, updated_at from partner_companies$q$, 'وما تطلبه صفحات الشركات الشريكة يُقرأ');
  perform _refuses($q$select owner_id from partner_companies$q$, 'وصاحب الشركة الشريكة يُرفض للعضو');
end $$;

\echo ''
\echo 'ب) صاحب الصفّ والمدير يقرآنها بالدالّتين، وغيرهما لا شيء'

do $$ begin
  perform _act_as('c3000000-0000-0000-0000-0000000000c3');
  perform _eq((select count(*)::int from supplier_private()), 0, 'عضوٌ آخر: لا صفّ من الموردين');
  perform _eq((select count(*)::int from project_private()), 0, 'ولا من المشاريع');
  perform _eq((select count(*)::int from partner_company_private()), 0, 'ولا من الشركات الشريكة');

  perform _act_as('b3000000-0000-0000-0000-0000000000b3');
  perform _eq((select count(*)::int from partner_company_private()), 1, 'صاحب الشركة يرى صفّها وحده');
  perform _eq((select owner_id from partner_company_private()), 'b3000000-0000-0000-0000-0000000000b3'::uuid, 'بمعرّفه');
  perform _eq((select count(*)::int from partner_company_private(array['6a000000-0000-0000-0000-00000000006a'::uuid])), 0,
              'ولا يرى شركة غيره ولو سمّاها');

  perform _act_as('a1000000-0000-0000-0000-0000000000a1');
  perform _eq((select count(*)::int from supplier_private()), 1, 'المورد يرى صفّه وحده');
  perform _eq((select licence_doc_path from supplier_private()), 'a1000000-0000-0000-0000-0000000000a1/licence.pdf', 'بمسار مستنده');
  perform _eq((select count(*)::int from supplier_private(array['5b000000-0000-0000-0000-00000000005b'::uuid])), 0, 'ولا يرى صفّ غيره ولو سمّاه');

  perform _act_as('07000000-0000-0000-0000-000000000007');
  perform _eq((select count(*)::int from project_private()), 2, 'صاحب المشروعين يراهما');
  perform _eq((select review_note from project_private(array['1a000000-0000-0000-0000-00000000001a'::uuid])), 'ملاحظة المراجع', 'وملاحظة المراجعة على مشروعه');

  perform _act_as('f6000000-0000-0000-0000-0000000000f6');
  perform _eq((select count(*)::int from supplier_private()), 2, 'والمدير يرى الموردين كلّهم');
  perform _eq((select count(*)::int from project_private()), 2, 'والمشاريع كلّها');
  perform _eq((select count(*)::int from partner_company_private()), 2, 'والشركات الشريكة كلّها');
end $$;

\echo ''
\echo 'ج) أرض المشروع لصفحته: حين تكون معروضةً للمستثمرين، أو لصاحبه والمدير'

do $$ begin
  perform _act_as('c3000000-0000-0000-0000-0000000000c3');
  perform _eq(project_open_land('1a000000-0000-0000-0000-00000000001a'), '0b000000-0000-0000-0000-00000000000b'::uuid, 'العضو يجد الأرض المعروضة');
  perform _eq(project_open_land('1b000000-0000-0000-0000-00000000001b'), null::uuid, 'ولا يجد أرضاً غير معروضة');
  perform _act_as('07000000-0000-0000-0000-000000000007');
  perform _eq(project_open_land('1b000000-0000-0000-0000-00000000001b'), '0a000000-0000-0000-0000-00000000000a'::uuid, 'وصاحب المشروع يجد أرضه');
  perform _act_as('f6000000-0000-0000-0000-0000000000f6');
  perform _eq(project_open_land('1b000000-0000-0000-0000-00000000001b'), '0a000000-0000-0000-0000-00000000000a'::uuid, 'والمدير كذلك');
  perform _act_as(null);
end $$;
reset role;

do $$ begin
  perform _eq(has_function_privilege('anon', 'project_open_land(uuid)', 'execute')
              or has_function_privilege('anon', 'supplier_private(uuid[])', 'execute')
              or has_function_privilege('anon', 'project_private(uuid[])', 'execute')
              or has_function_privilege('anon', 'partner_company_private(uuid[])', 'execute'), false, 'والزائر لا ينادي الدوالّ الأربع');
end $$;

do $$
declare n integer;
begin
  select fails into n from _score;
  if n > 0 then raise exception '% فحصاً فشل', n; end if;
end $$;
\echo ''
\echo 'OK'
