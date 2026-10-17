-- بوّابةُ الشركات الشريكة والاتّفاقات وفهرس المزارع.
--
-- A company shows only once an administrator has seen its registration, and a
-- rename sends it back for review; an agreement is drafted by the company and
-- switched on by an administrator, and cannot be edited once on; a company
-- sees only verified farms whose owners opened them, in its own states and
-- groups, without the owner, the land's name, its village or its coordinates;
-- and the owner's name and phone reach the company only after the owner
-- accepts its request.

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

-- ── الناس: أ وب صاحبا أرض، ش وط صاحبا شركتين، د مدير ─────────────────────
insert into auth.users (id) values
  ('a1000000-0000-0000-0000-0000000000a1'),
  ('b2000000-0000-0000-0000-0000000000b2'),
  ('c3000000-0000-0000-0000-0000000000c3'),
  ('d4000000-0000-0000-0000-0000000000d4'),
  ('f6000000-0000-0000-0000-0000000000f6')
on conflict (id) do nothing;
insert into profiles (id, full_name, role, phone) values
  ('a1000000-0000-0000-0000-0000000000a1', 'الحاج عثمان', 'investor', '0911111111'),
  ('b2000000-0000-0000-0000-0000000000b2', 'ب', 'investor', '0922222222'),
  ('c3000000-0000-0000-0000-0000000000c3', 'ش', 'investor', null),
  ('d4000000-0000-0000-0000-0000000000d4', 'ط', 'investor', null),
  ('f6000000-0000-0000-0000-0000000000f6', 'د', 'admin', null)
on conflict (id) do update set role = excluded.role, phone = excluded.phone, full_name = excluded.full_name;

grant usage on schema public, auth to anon, authenticated;
grant execute on function auth.uid() to anon, authenticated;
grant select, update on _who to anon, authenticated;

create table _ids (k text primary key, id uuid);
grant all on _ids to anon, authenticated;
create or replace function _id(k text) returns uuid language sql stable as $$ select id from _ids where _ids.k = $1 $$;
grant execute on function _id(text) to anon, authenticated;

-- lands predates the default grants above; on Supabase both roles hold these
-- privileges on it, and RLS is what decides. Reproduced so the checks meet RLS.
grant select, insert, update, delete on lands, profiles to anon, authenticated;

-- ── الأراضي، بيد الإعداد ─────────────────────────────────────────────────
--  L1  أ، القضارف، ١٥٠ فداناً، مطريّ، موثّقة ومفتوحة — المطابِقة الوحيدة
--  L2  أ، القضارف، موثّقة لكنّها مغلقة
--  L3  ب، القضارف، مفتوحة لكنّها لم تُوثَّق
--  L4  ب، الجزيرة، موثّقة ومفتوحة، لكن خارج ولايات الشركة وفئتها
do $$ begin perform _act_as(null); end $$;
insert into lands (id, owner_id, name, state, locality, village, latitude, longitude, feddans,
                   station_key, water_source, verification, soil_class, crop_keys, open_to_partners)
values
  ('11000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-0000000000a1', 'أرض الحاج',
   'القضارف', 'الفاو', 'ود الحليو', 14.05, 35.40, 150, 'kassala', 'rainfed', 'verified',
   'Vertisols', array['sorghum','sesame'], true),
  ('11000000-0000-0000-0000-000000000002', 'a1000000-0000-0000-0000-0000000000a1', 'الحوّاشة الثانية',
   'القضارف', 'الفاو', null, null, null, 120, 'kassala', 'rainfed', 'verified',
   'Vertisols', array['sorghum'], false),
  ('11000000-0000-0000-0000-000000000003', 'b2000000-0000-0000-0000-0000000000b2', 'أرض لم تُعاين',
   'القضارف', 'القلابات', null, null, null, 90, 'kassala', 'rainfed', 'submitted',
   'Vertisols', array['sorghum'], true),
  ('11000000-0000-0000-0000-000000000004', 'b2000000-0000-0000-0000-0000000000b2', 'مشروع الجزيرة',
   'الجزيرة', 'الحصاحيصا', null, null, null, 500, 'gezira', 'canal', 'verified',
   'Vertisols', array['sorghum'], true);

\echo ''
\echo 'أ) الشركة — الشارة بعد السجلّ، وتسقط بتغيير الاسم'

reset role;
do $$ begin perform _act_as(null); end $$;
set role anon;
do $$ begin
  perform _refuses($q$select partner_save('دخيل', null, array['mechanization'], array['القضارف'], 'فلان', '0912345678', null, null)$q$,
    'الزائر لا يسجّل شركة');
end $$;

reset role;
do $$ begin perform _act_as('c3000000-0000-0000-0000-0000000000c3'); end $$;
set role authenticated;
do $$ begin
  perform _refuses($q$select partner_save('شركة', null, array['farming'], array['القضارف'], 'فلان', '0912345678', null, null)$q$,
    'نوعُ خدمةٍ خارج القائمة يُرفض');
  perform _refuses($q$select partner_save('شركة', null, array['mechanization'], array['القاهرة'], 'فلان', '0912345678', null, null)$q$,
    'وولايةٌ خارج السودان تُرفض');
  insert into _ids values ('c', partner_save('شركة القضارف للميكنة', null, array['mechanization','harvest'],
    array['القضارف','كسلا'], 'عبد الله', '0912345678', null, 'ميكنة وحصاد في القضارف منذ ٢٠١٠'));
  perform _eq((select count(*)::int from partner_companies), 1, 'صاحبُها يرى شركته قبل التوثيق');
  perform _changes_nothing($q$insert into partner_companies (owner_id, name, kinds, states, contact_name, phone, verified_at)
    values ('d4000000-0000-0000-0000-0000000000d4', 'دخيلة', array['inputs'], array['سنار'], 'فلان', '0912345678', now())$q$,
    'لا يُكتب جدول الشركات مباشرةً');
  perform _changes_nothing($q$update partner_companies set verified_at = now()$q$, 'ولا توثّق الشركة نفسها');
  perform _refuses($q$select partner_review(_id('c'), true, null)$q$, 'ولا تُراجع نفسها');
end $$;

reset role;
do $$ begin perform _act_as(null); end $$;
set role anon;
do $$ begin
  perform _eq((select count(*)::int from partner_companies), 0, 'الزائر لا يرى شركةً لم تُوثَّق');
end $$;

reset role;
do $$ begin perform _act_as('f6000000-0000-0000-0000-0000000000f6'); end $$;
set role authenticated;
do $$ begin
  perform _refuses($q$select partner_review(_id('c'), true, null)$q$, 'لا تُوثَّق شركة بلا سجلّ تجاري');
end $$;

reset role;
do $$ begin perform _act_as('c3000000-0000-0000-0000-0000000000c3'); end $$;
set role authenticated;
do $$ begin
  perform partner_save('شركة القضارف للميكنة', 'CR-9001', array['mechanization','harvest'],
    array['القضارف','كسلا'], 'عبد الله', '0912345678', null, 'ميكنة وحصاد في القضارف منذ ٢٠١٠');
end $$;

reset role;
do $$ begin perform _act_as('f6000000-0000-0000-0000-0000000000f6'); end $$;
set role authenticated;
do $$ begin
  perform partner_review(_id('c'), true, 'رأيتُ السجلّ');
  perform _eq((select verified_by from partner_companies where id = _id('c')),
    'f6000000-0000-0000-0000-0000000000f6'::uuid, 'المشرف يوثّق بعد السجلّ');
end $$;

reset role;
do $$ begin perform _act_as(null); end $$;
set role anon;
do $$ begin
  perform _eq((select count(*)::int from partner_companies), 1, 'والموثّقةُ تظهر للزائر');
end $$;

reset role;
do $$ begin perform _act_as('c3000000-0000-0000-0000-0000000000c3'); end $$;
set role authenticated;
do $$ begin
  perform partner_save('شركة القضارف للميكنة والحصاد', 'CR-9001', array['mechanization','harvest'],
    array['القضارف','كسلا'], 'عبد الله', '0912345678', null, 'ميكنة وحصاد في القضارف منذ ٢٠١٠');
  perform _eq((select verified_at is null from partner_companies where id = _id('c')), true,
    'تغييرُ الاسم يُعيدها إلى المراجعة');
end $$;

reset role;
do $$ begin perform _act_as('f6000000-0000-0000-0000-0000000000f6'); end $$;
set role authenticated;
do $$ begin perform partner_review(_id('c'), true, 'الاسم الجديد مطابق للسجلّ'); end $$;

\echo ''
\echo 'ب) الاتّفاق المبدئيّ — مسوّدةٌ من الشركة، وتفعيلٌ من المشرف'

reset role;
do $$ begin perform _act_as('c3000000-0000-0000-0000-0000000000c3'); end $$;
set role authenticated;
do $$ begin
  perform _refuses($q$select partner_agreement_save(null, 'اتّفاق القضارف', null, null, null, array['huge'], null,
    array['mechanized_planting'], 'حراثة وزراعة بسعرٍ إرشاديٍّ للفدان', current_date - 1, current_date + 365)$q$,
    'فئةُ مساحةٍ خارج القائمة تُرفض');
  perform _refuses($q$select partner_agreement_save(null, 'اتّفاق القضارف', null, null, array['vertisols'], null, null,
    array['mechanized_planting'], 'حراثة وزراعة بسعرٍ إرشاديٍّ للفدان', current_date - 1, current_date + 365)$q$,
    'وصنفُ تربةٍ بغير اسمه العلميّ يُرفض');
  perform _refuses($q$select partner_agreement_save(null, 'اتّفاق القضارف', null, null, null, null, null,
    array['mechanized_planting'], 'حراثة وزراعة بسعرٍ إرشاديٍّ للفدان', current_date + 10, current_date)$q$,
    'ونهايةٌ قبل البداية تُرفض');
  insert into _ids values ('a', partner_agreement_save(null, 'القضارف المطريّة — الطينيّة المتوسّطة',
    array['القضارف'], array['rainfed'], array['Vertisols'], array['medium'], array['sorghum'],
    array['mechanized_planting','harvest_service'], 'حراثة وزراعة وحصاد بسعرٍ إرشاديٍّ يُكتب في عقد الخدمة',
    current_date - 1, current_date + 365));
  perform _eq((select count(*)::int from partner_matching_lands()), 0, 'المسوّدةُ لا تُطابق شيئاً');
  perform _refuses($q$select partner_agreement_activate(_id('a'))$q$, 'والشركة لا تفعّل اتّفاقها');
end $$;

reset role;
do $$ begin perform _act_as(null); end $$;
set role anon;
do $$ begin
  perform _eq((select count(*)::int from partner_agreements), 0, 'الزائر لا يرى المسوّدة');
end $$;

reset role;
do $$ begin perform _act_as('f6000000-0000-0000-0000-0000000000f6'); end $$;
set role authenticated;
do $$ begin
  perform partner_agreement_activate(_id('a'));
  perform _eq((select status from partner_agreements where id = _id('a')), 'active', 'المشرف يفعّله');
end $$;

reset role;
do $$ begin perform _act_as(null); end $$;
set role anon;
do $$ begin
  perform _eq((select count(*)::int from partner_agreements), 1, 'والمفعَّلُ يظهر للزائر');
end $$;

reset role;
do $$ begin perform _act_as('c3000000-0000-0000-0000-0000000000c3'); end $$;
set role authenticated;
do $$ begin
  perform _refuses($q$select partner_agreement_save(_id('a'), 'اتّفاق موسّع', null, null, null, null, null,
    array['mechanized_planting'], 'حراثة وزراعة بسعرٍ إرشاديٍّ للفدان', current_date - 1, current_date + 365)$q$,
    'والمفعَّلُ لا يُعدَّل');
  perform _changes_nothing($q$update partner_agreements set area_bands = '{}'$q$, 'ولا يُوسَّع من الجدول');
end $$;

\echo ''
\echo 'ج) المطابقة — المجموعة بلا صاحبٍ ولا موقع'

reset role;
do $$ begin perform _act_as('c3000000-0000-0000-0000-0000000000c3'); end $$;
set role authenticated;
do $$ begin
  perform _eq((select count(*)::int from partner_matching_lands()), 1,
    'أرضٌ واحدة: الموثّقةُ المفتوحة في ولاية الشركة ومجموعتها');
  perform _eq((select land_id from partner_matching_lands()), '11000000-0000-0000-0000-000000000001'::uuid,
    'وهي L1');
  perform _eq((select area_band from partner_matching_lands()), 'medium', 'بفئتها: متوسّطة');
  perform _eq((select count(*)::int from lands), 0, 'والشركة لا تقرأ الأرض نفسها من الجدول');
end $$;

reset role;
do $$ begin
  perform _eq(
    (select pg_get_function_result('public.partner_matching_lands()'::regprocedure)
            ~ '(name|village|latitude|longitude|owner)'),
    false, 'ولا في نتيجة المطابقة اسمٌ ولا قريةٌ ولا إحداثيّاتٌ ولا صاحب');
end $$;

reset role;
do $$ begin perform _act_as('d4000000-0000-0000-0000-0000000000d4'); end $$;
set role authenticated;
do $$ begin
  perform _refuses($q$select * from partner_matching_lands()$q$, 'من لا شركةَ موثّقةً له لا يرى المزارع');
end $$;

reset role;
do $$ begin perform _act_as(null); end $$;
set role anon;
do $$ begin
  perform _refuses($q$select * from partner_matching_lands()$q$, 'ولا الزائر');
end $$;

\echo ''
\echo 'د) طلبُ الاهتمام — والتواصلُ بعد قبول صاحب الأرض'

reset role;
do $$ begin perform _act_as('c3000000-0000-0000-0000-0000000000c3'); end $$;
set role authenticated;
do $$ begin
  perform _refuses($q$select partner_express_interest('11000000-0000-0000-0000-000000000002', 'نودّ خدمة أرضكم هذا الموسم')$q$,
    'لا طلبَ على أرضٍ مغلقة');
  insert into _ids values ('i', partner_express_interest('11000000-0000-0000-0000-000000000001',
    'نودّ حراثة أرضكم وزراعتها هذا الموسم'));
  perform _refuses($q$select partner_express_interest('11000000-0000-0000-0000-000000000001', 'طلبٌ ثانٍ على الأرض نفسها')$q$,
    'ولا طلبين على أرضٍ واحدة');
  perform _eq((select interest_status from partner_matching_lands()), 'pending', 'والمطابقةُ تذكر أنّه معلّق');
  perform _eq((select count(*)::int from partner_interest_contacts()), 0, 'ولا تواصلَ قبل القبول');
  perform _refuses($q$select land_interest_decide(_id('i'), true)$q$, 'والشركة لا تقبل طلبها');
end $$;

reset role;
do $$ begin perform _act_as('b2000000-0000-0000-0000-0000000000b2'); end $$;
set role authenticated;
do $$ begin
  perform _eq((select count(*)::int from partner_interests), 0, 'صاحبُ أرضٍ أخرى لا يرى الطلب');
  perform _refuses($q$select land_interest_decide(_id('i'), true)$q$, 'ولا يقبله');
end $$;

reset role;
do $$ begin perform _act_as('a1000000-0000-0000-0000-0000000000a1'); end $$;
set role authenticated;
do $$ begin
  perform _eq((select count(*)::int from partner_interests), 1, 'صاحبُ الأرض يرى الطلب');
  perform land_interest_decide(_id('i'), true);
  perform _eq((select status from partner_interests where id = _id('i')), 'accepted', 'ويقبله');
end $$;

reset role;
do $$ begin perform _act_as('c3000000-0000-0000-0000-0000000000c3'); end $$;
set role authenticated;
do $$ begin
  perform _eq((select owner_phone from partner_interest_contacts()), '0911111111', 'بعد القبول: هاتفُ صاحبها');
  perform _eq((select land_name from partner_interest_contacts()), 'أرض الحاج', 'واسمُ الأرض');
end $$;

reset role;
do $$ begin perform _act_as('d4000000-0000-0000-0000-0000000000d4'); end $$;
set role authenticated;
do $$ begin
  perform _eq((select count(*)::int from partner_interest_contacts()), 0, 'ولا يراهما غيرُ الشركة');
end $$;

\echo ''
\echo 'هـ) الموافقة — لصاحب الأرض وحده'

reset role;
do $$ begin perform _act_as('b2000000-0000-0000-0000-0000000000b2'); end $$;
set role authenticated;
do $$ begin
  perform _refuses($q$select land_set_partner_consent('11000000-0000-0000-0000-000000000001', false, null, null)$q$,
    'غيرُ صاحبها لا يغلقها');
end $$;

reset role;
do $$ begin perform _act_as('a1000000-0000-0000-0000-0000000000a1'); end $$;
set role authenticated;
do $$ begin
  perform _refuses($q$select land_set_partner_consent('11000000-0000-0000-0000-000000000002', true, 'clay', null)$q$,
    'وصنفُ تربةٍ بغير اسمه يُرفض');
  perform land_set_partner_consent('11000000-0000-0000-0000-000000000001', false, 'Vertisols', array['sorghum']);
  perform _eq((select open_to_partners from lands where id = '11000000-0000-0000-0000-000000000001'), false,
    'صاحبُها يغلقها');
  perform _refuses($q$update lands set listed = true, open_to_partners = true where id = '11000000-0000-0000-0000-000000000002'$q$,
    'والموافقةُ لا تفتح باب النشر الذاتيّ');
end $$;

reset role;
do $$ begin perform _act_as('c3000000-0000-0000-0000-0000000000c3'); end $$;
set role authenticated;
do $$ begin
  perform _eq((select count(*)::int from partner_matching_lands()), 0, 'فتختفي من المطابقة');
end $$;

\echo ''
\echo 'و) الإنهاء والصلاحيات'

reset role;
do $$ begin perform _act_as('d4000000-0000-0000-0000-0000000000d4'); end $$;
set role authenticated;
do $$ begin
  perform _refuses($q$select partner_agreement_end(_id('a'))$q$, 'غيرُ الشركة لا ينهي اتّفاقها');
end $$;

reset role;
do $$ begin perform _act_as('c3000000-0000-0000-0000-0000000000c3'); end $$;
set role authenticated;
do $$ begin
  perform partner_agreement_end(_id('a'));
  perform _eq((select status from partner_agreements where id = _id('a')), 'ended', 'الشركة تنهي اتّفاقها');
end $$;

reset role;
do $$ begin perform _act_as('f6000000-0000-0000-0000-0000000000f6'); end $$;
set role authenticated;
do $$ begin
  perform _refuses($q$select partner_agreement_activate(_id('a'))$q$, 'والمنتهي لا يُعاد تفعيله');
end $$;

reset role;
do $$ begin
  perform _eq((select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                where n.nspname = 'public'
                  and p.proname in ('partner_save','partner_review','partner_set_active',
                                    'partner_agreement_save','partner_agreement_activate','partner_agreement_end',
                                    'land_set_partner_consent','partner_matching_lands','partner_express_interest',
                                    'partner_interest_withdraw','land_interest_decide','partner_interest_contacts')
                  and has_function_privilege('anon', p.oid, 'execute')),
    0, 'لا دالّةَ من الاثنتي عشرة ينفّذها الزائر');
  perform _eq((select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                where n.nspname = 'public'
                  and p.proname in ('partner_save','partner_review','partner_set_active',
                                    'partner_agreement_save','partner_agreement_activate','partner_agreement_end',
                                    'land_set_partner_consent','partner_matching_lands','partner_express_interest',
                                    'partner_interest_withdraw','land_interest_decide','partner_interest_contacts')
                  and has_function_privilege('authenticated', p.oid, 'execute')),
    12, 'والمسجَّلُ ينفّذها كلّها، والحارسُ داخلها');
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
