-- بوّابةُ إيجار الجرّار والحجز الجماعيّ (البند ١٦٨).
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
create or replace function _id(p text) returns uuid language sql stable as $$ select id from _ids where name = p $$;
-- Read as the cluster, not as whoever is being played.
create or replace function _contract(p_booking uuid, p_member uuid) returns text language sql security definer as $$
  select c.status::text from service_contracts c join machinery_booking_members m on m.contract_id = c.id
   where m.booking_id = p_booking and m.member_id = p_member order by (m.left_at is null) desc, m.joined_at desc limit 1 $$;
create or replace function _booking(p_booking uuid) returns text language sql security definer as $$
  select status from machinery_bookings where id = p_booking $$;
create or replace function _organiser(p_booking uuid) returns uuid language sql security definer as $$
  select organiser_id from machinery_bookings where id = p_booking $$;

-- People: an administrator, a mechanisation outfit's owner, an engineering office's owner, four farmers, a stranger.
insert into auth.users (id) values
  ('ad000000-0000-0000-0000-0000000000ad'), ('bb000000-0000-0000-0000-0000000000bb'), ('be000000-0000-0000-0000-0000000000be'),
  ('f1000000-0000-0000-0000-0000000000f1'), ('f2000000-0000-0000-0000-0000000000f2'), ('f3000000-0000-0000-0000-0000000000f3'),
  ('f4000000-0000-0000-0000-0000000000f4'), ('f5000000-0000-0000-0000-0000000000f5'), ('ee000000-0000-0000-0000-0000000000ee')
on conflict (id) do nothing;
insert into profiles (id, full_name, role) values
  ('ad000000-0000-0000-0000-0000000000ad', 'مدير', 'admin'),
  ('bb000000-0000-0000-0000-0000000000bb', 'صاحب الجرّارات', 'investor'),
  ('be000000-0000-0000-0000-0000000000be', 'صاحب المكتب', 'investor'),
  ('f1000000-0000-0000-0000-0000000000f1', 'مزارع ١', 'investor'),
  ('f2000000-0000-0000-0000-0000000000f2', 'مزارع ٢', 'investor'),
  ('f3000000-0000-0000-0000-0000000000f3', 'مزارع ٣', 'investor'),
  ('f4000000-0000-0000-0000-0000000000f4', 'مزارع ٤', 'investor'),
  ('f5000000-0000-0000-0000-0000000000f5', 'مزارع ٥', 'investor'),
  ('ee000000-0000-0000-0000-0000000000ee', 'غريب', 'investor')
on conflict (id) do nothing;

-- Lands: two in the same locality, one in another; the fourth farmer's season has no land.
insert into lands (id, owner_id, name, state, locality, feddans, station_key, water_source) values
  ('1a000000-0000-0000-0000-000000000001', 'f1000000-0000-0000-0000-0000000000f1', 'أرض ١', 'الجزيرة', 'الحصاحيصا', 20, 'wad_medani', 'canal'),
  ('1a000000-0000-0000-0000-000000000002', 'f2000000-0000-0000-0000-0000000000f2', 'أرض ٢', 'الجزيرة', ' الحصاحيصا ', 15, 'wad_medani', 'canal'),
  ('1a000000-0000-0000-0000-000000000003', 'f3000000-0000-0000-0000-0000000000f3', 'أرض ٣', 'الجزيرة', 'المناقل', 30, 'wad_medani', 'canal'),
  ('1a000000-0000-0000-0000-000000000005', 'f5000000-0000-0000-0000-0000000000f5', 'أرض ٥', 'الجزيرة', 'الحصاحيصا', 12, 'wad_medani', 'canal'),
  ('1a000000-0000-0000-0000-0000000000bb', 'bb000000-0000-0000-0000-0000000000bb', 'أرض صاحب الجرّارات', 'الجزيرة', 'الحصاحيصا', 50, 'wad_medani', 'canal');
insert into seasons (id, owner_id, name, crop_key, station_key, irrigation, feddans, planting_date, land_id) values
  ('5a000000-0000-0000-0000-000000000001', 'f1000000-0000-0000-0000-0000000000f1', 'قمح ١', 'wheat', 'wad_medani', 'surface', 20, current_date + 30, '1a000000-0000-0000-0000-000000000001'),
  ('5a000000-0000-0000-0000-000000000002', 'f2000000-0000-0000-0000-0000000000f2', 'قمح ٢', 'wheat', 'wad_medani', 'surface', 15, current_date + 30, '1a000000-0000-0000-0000-000000000002'),
  ('5a000000-0000-0000-0000-000000000003', 'f3000000-0000-0000-0000-0000000000f3', 'قمح ٣', 'wheat', 'wad_medani', 'surface', 30, current_date + 30, '1a000000-0000-0000-0000-000000000003'),
  ('5a000000-0000-0000-0000-000000000004', 'f4000000-0000-0000-0000-0000000000f4', 'قمح ٤', 'wheat', 'wad_medani', 'surface', 10, current_date + 30, null),
  ('5a000000-0000-0000-0000-000000000005', 'f5000000-0000-0000-0000-0000000000f5', 'قمح ٥', 'wheat', 'wad_medani', 'surface', 12, current_date + 30, '1a000000-0000-0000-0000-000000000005'),
  ('5a000000-0000-0000-0000-0000000000bb', 'bb000000-0000-0000-0000-0000000000bb', 'قمح صاحب الجرّارات', 'wheat', 'wad_medani', 'surface', 50, current_date + 30, '1a000000-0000-0000-0000-0000000000bb');

-- Providers are verified as the administrator (verification is an administrative act).
do $$ begin perform _act_as('ad000000-0000-0000-0000-0000000000ad'); end $$;
insert into service_providers (id, owner_id, name, kind, verified_at, active) values
  ('b0000000-0000-0000-0000-0000000000b0', 'bb000000-0000-0000-0000-0000000000bb', 'جرّارات الحصاحيصا', 'mechanization', now(), true),
  ('b0000000-0000-0000-0000-0000000000be', 'be000000-0000-0000-0000-0000000000be', 'مكتب الجزيرة', 'engineering_office', now(), true);
do $$ begin perform _act_as(null); end $$;
insert into services (id, provider_id, service_key, title, unit, price_per_unit, min_units, lead_time_days) values
  ('5e000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-0000000000b0', 'land_leveling', 'تسوية الأرض', 'feddan', 1000, 30, 0);

grant usage on schema public, auth to anon, authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated, service_role;
grant select, update on _score, _who to anon, authenticated, service_role;
grant select on _ids to anon, authenticated;
grant select, insert, update, delete on seasons, lands, profiles to authenticated;
grant execute on function _fail(text,text), _pass(text), _act_as(uuid), _eq(anyelement,anyelement,text), _refuses(text,text,text),
  _id(text), _contract(uuid,uuid), _booking(uuid), _organiser(uuid) to anon, authenticated, service_role;

\echo ''
\echo '=========================================================================='
\echo 'أ) التوفّر: بلحظة قوله، ولمقدّمي الميكنة وحدهم'
\echo '=========================================================================='
set role authenticated;
do $$
declare t timestamptz;
begin
  perform _act_as('bb000000-0000-0000-0000-0000000000bb');
  t := provider_confirm_availability('b0000000-0000-0000-0000-0000000000b0', true);
  perform _eq(t > now() - interval '1 minute', true, 'صاحب الجرّارات يؤكّد توفّره، بلحظة التأكيد');
  update service_providers set availability_confirmed_at = '2020-01-01' where id = 'b0000000-0000-0000-0000-0000000000b0';
  perform _eq((select availability_confirmed_at > now() - interval '1 minute' from service_providers where id = 'b0000000-0000-0000-0000-0000000000b0'),
              true, 'وتاريخٌ يكتبه بيده يصير لحظة كتابته: لا يُزوَّر «آخر تأكيد»');

  perform _act_as('be000000-0000-0000-0000-0000000000be');
  perform _refuses($q$select provider_confirm_availability('b0000000-0000-0000-0000-0000000000be', true)$q$,
                   'لمقدّمي الميكنة', 'المكتب الهندسيّ لا يعلن توفّر جرّار');
  perform _refuses($q$update service_providers set available = true where id = 'b0000000-0000-0000-0000-0000000000be'$q$,
                   'لمقدّمي الميكنة', 'ولا بالكتابة المباشرة');

  perform _act_as('ee000000-0000-0000-0000-0000000000ee');
  perform _refuses($q$select provider_confirm_availability('b0000000-0000-0000-0000-0000000000b0', false)$q$,
                   'ليست هذه جهتك', 'والغريب لا يؤكّد عن جهةٍ ليست له');
end $$;
reset role;
do $$
begin
  perform _eq(has_function_privilege('anon', 'provider_confirm_availability(uuid,boolean)', 'execute'), false, 'ولا يناديها الزائر');
  perform _eq(has_column_privilege('anon', 'service_providers', 'availability_confirmed_at', 'select'), true,
              'والزائر يقرأ «آخر تأكيدٍ للتوفّر» في القائمة');
end $$;

-- A confirmation fifteen days old is stale: moved back with the triggers off, as time would.
begin;
set local session_replication_role = replica;
update service_providers set availability_confirmed_at = now() - interval '15 days' where id = 'b0000000-0000-0000-0000-0000000000b0';
commit;

\echo ''
\echo '=========================================================================='
\echo 'ب) فتح الحجز: على مقدّمٍ أكّد توفّره، ومن موسمٍ بأرضٍ معروفة المحليّة'
\echo '=========================================================================='
set role authenticated;
do $$
begin
  perform _act_as('f1000000-0000-0000-0000-0000000000f1');
  perform _refuses($q$select machinery_booking_open('5e000000-0000-0000-0000-000000000001', '5a000000-0000-0000-0000-000000000001', 20,
                      current_date + 3, current_date + 10, 'مزارع الحصاحيصا')$q$,
                   'لم يؤكّد مقدّم الخدمة توفّره', 'تأكيدٌ عمره ١٥ يوماً قديم: لا حجز عليه');
  perform _act_as('bb000000-0000-0000-0000-0000000000bb');
  perform provider_confirm_availability('b0000000-0000-0000-0000-0000000000b0', true);
  perform _refuses($q$select machinery_booking_open('5e000000-0000-0000-0000-000000000001', '5a000000-0000-0000-0000-000000000001', 20,
                      current_date + 3, current_date + 10, 'صاحب الجرّارات')$q$,
                   'لا تحجز من جهتك', 'صاحب الجرّارات لا يحجز من نفسه');

  perform _act_as('f4000000-0000-0000-0000-0000000000f4');
  perform _refuses($q$select machinery_booking_open('5e000000-0000-0000-0000-000000000001', '5a000000-0000-0000-0000-000000000004', 5,
                      current_date + 3, current_date + 10, 'مزارع ٤')$q$,
                   'اربط موسمك', 'موسمٌ بلا أرض: لا تُعرف محليّته');

  perform _act_as('f1000000-0000-0000-0000-0000000000f1');
  perform _refuses($q$select machinery_booking_open('5e000000-0000-0000-0000-000000000001', '5a000000-0000-0000-0000-000000000002', 10,
                      current_date + 3, current_date + 10, 'مزارع ١')$q$,
                   'من مواسمك', 'ولا بموسم غيره');
  perform _refuses($q$select machinery_booking_open('5e000000-0000-0000-0000-000000000001', '5a000000-0000-0000-0000-000000000001', 25,
                      current_date + 3, current_date + 10, 'مزارع ١')$q$,
                   'أكبر من مساحة موسمك', 'ولا بأكثر من مساحة موسمه');
  perform _refuses($q$select machinery_booking_open('5e000000-0000-0000-0000-000000000001', '5a000000-0000-0000-0000-000000000001', 20,
                      current_date + 3, current_date + 10, 'اتصل ٠٩١٢ ٣٤٥ ٦٧٨')$q$,
                   'لا أرقام هواتف', 'ولا رقم هاتفٍ في الاسم، ولو بأرقامٍ عربيّة وفواصل');
  perform _refuses($q$select machinery_booking_open('5e000000-0000-0000-0000-000000000001', '5a000000-0000-0000-0000-000000000001', 20,
                      current_date + 3, current_date + 90, 'مزارع ١')$q$,
                   'ستّين يوماً', 'ولا مدّة أطول من ستّين يوماً');

  insert into _ids values ('B1', machinery_booking_open('5e000000-0000-0000-0000-000000000001', '5a000000-0000-0000-0000-000000000001', 20,
                                                       current_date + 3, current_date + 10, 'مزارع الحصاحيصا'));
  perform _pass('ويفتح الحجز بموسمه وكمّيّته');
  perform _eq(_contract(_id('B1'), 'f1000000-0000-0000-0000-0000000000f1'), 'proposed', 'وعقده مع مقدّم الخدمة معروضٌ عليه في اللحظة نفسها');
  perform _eq((select locality from machinery_bookings_list() where id = _id('B1')), 'الحصاحيصا', 'والمحليّة من أرضه، لا مكتوبة');

  perform _refuses($q$select * from machinery_bookings$q$, 'permission denied', 'ولا يقرأ الحجوزات من الجدول مباشرةً');
  perform _refuses($q$insert into machinery_bookings (provider_id, service_id, organiser_id, state, locality, window_from, window_to, service_title, unit, unit_price, min_units)
                      values ('b0000000-0000-0000-0000-0000000000b0', '5e000000-0000-0000-0000-000000000001', auth.uid(), 'x', 'y', current_date, current_date, 't', 'feddan', 0, 1)$q$,
                   'permission denied', 'ولا يكتب فيه مباشرةً (وبسعرٍ صفر)');
  perform _refuses($q$insert into service_contracts (season_id, provider_id, client_id, title, booking_id)
                      values ('5a000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-0000000000b0', auth.uid(), 'دخيل', _id('B1'))$q$,
                   'يُنشأ من الحجز', 'ولا يُلحق عقداً بالحجز من خارجه');
end $$;
reset role;
do $$
begin
  perform _eq((select m.unit_price::text || '×' || m.quantity::text from contract_milestones m join machinery_booking_members b on b.contract_id = m.contract_id
                where b.booking_id = _id('B1')), '1000.00×20.00', 'ومرحلة عقده بسعر الكتالوج يوم الحجز وكمّيّته');
  perform _eq((select c.booking_id from service_contracts c join machinery_booking_members b on b.contract_id = c.id where b.booking_id = _id('B1')),
              _id('B1'), 'والعقد معلَّمٌ بحجزه');
end $$;

\echo ''
\echo '=========================================================================='
\echo 'ج) الانضمام: لأهل المحليّة نفسها، مرّةً واحدة'
\echo '=========================================================================='
set role authenticated;
do $$
begin
  perform _act_as('f1000000-0000-0000-0000-0000000000f1');
  perform _refuses(format('select machinery_booking_request(%L)', _id('B1')), 'لا يُرسل الحجز قبل أن يبلغ', 'عشرون فداناً لا تبلغ الحدّ الأدنى (٣٠): لا يُرسل');

  perform _act_as('f3000000-0000-0000-0000-0000000000f3');
  perform _eq((select members from machinery_bookings_list() where id = _id('B1')), 1, 'من في محليّةٍ أخرى يرى الحجز المفتوح');
  perform _eq((select my_quantity from machinery_bookings_list() where id = _id('B1')), null::numeric, 'بلا حصّةٍ له فيه');
  perform _refuses(format('select machinery_booking_join(%L, %L, 10, %L)', _id('B1'), '5a000000-0000-0000-0000-000000000003', 'مزارع ٣'),
                   'لمن أرضه في', 'ولا ينضمّ: أرضه في المناقل');

  perform _act_as('bb000000-0000-0000-0000-0000000000bb');
  perform _refuses(format('select machinery_booking_join(%L, %L, 10, %L)', _id('B1'), '5a000000-0000-0000-0000-0000000000bb', 'صاحب الجرّارات'),
                   'لا تنضمّ', 'وصاحب الجرّارات لا ينضمّ إلى حجزٍ على جهته، ولو كانت أرضه في المحليّة');

  perform _act_as('f2000000-0000-0000-0000-0000000000f2');
  perform machinery_booking_join(_id('B1'), '5a000000-0000-0000-0000-000000000002', 15, 'جار الحصاحيصا');
  perform _pass('وجاره في الحصاحيصا ينضمّ بموسمه (والمسافات حول اسم المحليّة لا تفرّق)');
  perform _refuses(format('select machinery_booking_join(%L, %L, 5, %L)', _id('B1'), '5a000000-0000-0000-0000-000000000002', 'جار'),
                   'من قبل', 'ولا ينضمّ مرّتين');
  perform _eq((select total from machinery_bookings_list() where id = _id('B1')), 35::numeric, 'المجموع ٣٥ فداناً');
  perform _eq((select count(*)::int from machinery_booking_members(_id('B1'))), 0, 'والمنضمّ لا يرى أسماء غيره');

  perform _act_as('f1000000-0000-0000-0000-0000000000f1');
  perform _eq((select count(*)::int from machinery_booking_members(_id('B1'))), 2, 'والمنظّم يراهم بأسمائهم وكمّيّاتهم');
  perform _eq((select count(*)::int from information_schema.columns where table_name = 'machinery_booking_members' and column_name ilike '%phone%'), 0,
              'ولا هاتف في الحجز أصلاً');

  perform _act_as('bb000000-0000-0000-0000-0000000000bb');
  perform _eq((select count(*)::int from machinery_booking_members(_id('B1'))), 0, 'ومقدّم الخدمة لا يراهم قبل أن يُرسل إليه');

  -- Its own contracts, straight from the contract page: not one by one, and not back to a draft.
  perform _refuses(format($q$update service_contracts set status = 'active'
                             where id = (select contract_id from machinery_booking_members where booking_id = %L limit 1)$q$, _id('B1')),
                   'permission denied', 'ومقدّم الخدمة لا يصل جدول الأعضاء ليلتفّ');
end $$;
reset role;
do $$
declare c uuid := (select contract_id from machinery_booking_members where booking_id = _id('B1') and member_id = 'f1000000-0000-0000-0000-0000000000f1');
begin
  insert into _ids values ('C1', c);
end $$;
set role authenticated;
do $$
begin
  perform _act_as('bb000000-0000-0000-0000-0000000000bb');
  perform _refuses(format($q$update service_contracts set status = 'active' where id = %L$q$, _id('C1')),
                   'يُقبل مع الحجز كلّه', 'ولا يقبل عقد مزارعٍ وحده من صفحة العقود');
  perform _act_as('f1000000-0000-0000-0000-0000000000f1');
  perform _refuses(format($q$update service_contracts set status = 'draft' where id = %L$q$, _id('C1')),
                   'لا يُعاد مسودّة', 'والمزارع لا يعيد عقده مسودّةً يعدّل سعرها');
  perform _refuses(format($q$update contract_milestones set unit_price = 1 where contract_id = %L$q$, _id('C1')),
                   'تجمّدت', 'ولا يغيّر سعر مرحلته وهو معروض');
end $$;

\echo ''
\echo '=========================================================================='
\echo 'د) الإرسال والقبول: الحجز كلّه معاً'
\echo '=========================================================================='
do $$
begin
  perform _act_as('f2000000-0000-0000-0000-0000000000f2');
  perform _refuses(format('select machinery_booking_request(%L)', _id('B1')), 'للمنظّم وحده', 'غير المنظّم لا يرسل');
  perform _act_as('f1000000-0000-0000-0000-0000000000f1');
  perform machinery_booking_request(_id('B1'));
  perform _eq(_booking(_id('B1')), 'requested', 'والمنظّم يرسله حين بلغ ٣٥ من ٣٠');
  perform _act_as('f3000000-0000-0000-0000-0000000000f3');
  perform _eq((select count(*)::int from machinery_bookings_list() where id = _id('B1')), 0, 'ولم يعد يظهر لغير أهله بعد إرساله');

  perform _act_as('f5000000-0000-0000-0000-0000000000f5');
  perform _refuses(format('select machinery_booking_join(%L, %L, 5, %L)', _id('B1'), '5a000000-0000-0000-0000-000000000005', 'مزارع ٥'),
                   'لم يعد مفتوحاً', 'ولا انضمام بعد الإرسال، ولو من أهل المحليّة');

  perform _act_as('bb000000-0000-0000-0000-0000000000bb');
  perform _eq((select count(*)::int from machinery_booking_members(_id('B1'))), 2, 'ومقدّم الخدمة يرى الأعضاء الآن');
  perform _eq((select is_provider from machinery_bookings_list() where id = _id('B1')), true, 'ويرى الحجز في قائمته');

  perform _act_as('f1000000-0000-0000-0000-0000000000f1');
  perform _refuses(format('select machinery_booking_decide(%L, true)', _id('B1')), 'لمقدّم الخدمة وحده', 'المنظّم لا يقبل عن مقدّم الخدمة');

  perform _act_as('bb000000-0000-0000-0000-0000000000bb');
  perform _refuses(format('select machinery_booking_decide(%L, false)', _id('B1')), 'سبب الاعتذار', 'والاعتذار بلا سبب لا يُقبل');
  perform _eq(machinery_booking_decide(_id('B1'), true), 2, 'ومقدّم الخدمة يقبل الحجز كلّه');
  perform _eq(_booking(_id('B1')), 'accepted', 'فيصير مقبولاً');
  perform _eq(_contract(_id('B1'), 'f1000000-0000-0000-0000-0000000000f1') || '/' || _contract(_id('B1'), 'f2000000-0000-0000-0000-0000000000f2'),
              'active/active', 'وعقدا العضوين ساريان معاً');
  perform _refuses(format('select machinery_booking_decide(%L, true)', _id('B1')), 'ليس بانتظار قرارك', 'ولا يُبتّ فيه مرّتين');

  perform _act_as('f2000000-0000-0000-0000-0000000000f2');
  perform _refuses(format('select machinery_booking_leave(%L)', _id('B1')), 'بُتّ في هذا الحجز', 'ولا انسحاب بعد القبول: العقد في صفحة العقود');
end $$;
reset role;
do $$
begin
  perform _eq((select count(*)::int from service_contracts where booking_id = _id('B1') and signed_at is not null), 2, 'وكلّ عقدٍ موقَّع بلحظة القبول');
end $$;

\echo ''
\echo '=========================================================================='
\echo 'هـ) الانسحاب، وانتقال التنظيم، والاعتذار'
\echo '=========================================================================='
set role authenticated;
do $$
begin
  perform _act_as('f1000000-0000-0000-0000-0000000000f1');
  insert into _ids values ('B2', machinery_booking_open('5e000000-0000-0000-0000-000000000001', '5a000000-0000-0000-0000-000000000001', 10,
                                                       current_date + 3, current_date + 10, 'مزارع ١'));
  perform _act_as('f2000000-0000-0000-0000-0000000000f2');
  perform machinery_booking_join(_id('B2'), '5a000000-0000-0000-0000-000000000002', 10, 'مزارع ٢');

  perform _act_as('f1000000-0000-0000-0000-0000000000f1');
  perform machinery_booking_leave(_id('B2'));
  perform _eq(_contract(_id('B2'), 'f1000000-0000-0000-0000-0000000000f1'), 'cancelled', 'المنظّم ينسحب فيُلغى عرضه');
  perform _eq(_organiser(_id('B2')), 'f2000000-0000-0000-0000-0000000000f2'::uuid, 'والتنظيم ينتقل إلى من بقي');
  perform _eq(_booking(_id('B2')), 'open', 'والحجز باقٍ مفتوحاً');

  perform machinery_booking_join(_id('B2'), '5a000000-0000-0000-0000-000000000001', 10, 'مزارع ١');
  perform _eq(_contract(_id('B2'), 'f1000000-0000-0000-0000-0000000000f1'), 'proposed', 'ومن انسحب يعود بعرضٍ جديد');
  perform machinery_booking_leave(_id('B2'));

  perform _act_as('f2000000-0000-0000-0000-0000000000f2');
  -- The last member cancels their offer from the contract page: the booking no longer counts them.
  update service_contracts set status = 'cancelled'
   where client_id = auth.uid() and booking_id = _id('B2') and status = 'proposed';
  perform _eq((select members from machinery_bookings_list() where id = _id('B2')), 0, 'ومن ألغى عرضه من صفحة العقد لا يُعدّ');
  perform machinery_booking_join(_id('B2'), '5a000000-0000-0000-0000-000000000002', 10, 'مزارع ٢');
  perform _eq((select members from machinery_bookings_list() where id = _id('B2')), 1, 'ويعود إن شاء');
  perform machinery_booking_leave(_id('B2'));
  perform _eq(_booking(_id('B2')), 'cancelled', 'وحين ينسحب الأخير يُلغى الحجز');

  perform _act_as('f1000000-0000-0000-0000-0000000000f1');
  insert into _ids values ('B3', machinery_booking_open('5e000000-0000-0000-0000-000000000001', '5a000000-0000-0000-0000-000000000001', 20,
                                                       current_date + 3, current_date + 10, 'مزارع ١'));
  perform _act_as('f2000000-0000-0000-0000-0000000000f2');
  perform machinery_booking_join(_id('B3'), '5a000000-0000-0000-0000-000000000002', 15, 'مزارع ٢');
  -- One who joined and left before the decision is not told of it (the notices, below).
  perform _act_as('f5000000-0000-0000-0000-0000000000f5');
  perform machinery_booking_join(_id('B3'), '5a000000-0000-0000-0000-000000000005', 5, 'مزارع ٥');
  perform machinery_booking_leave(_id('B3'));
  perform _act_as('f1000000-0000-0000-0000-0000000000f1');
  perform machinery_booking_request(_id('B3'));
  perform _act_as('bb000000-0000-0000-0000-0000000000bb');
  perform _eq(machinery_booking_decide(_id('B3'), false, 'الجرّار في صيانة هذا الأسبوع'), 2, 'ومقدّم الخدمة يعتذر بسبب');
  perform _eq(_booking(_id('B3')), 'declined', 'فيُعتذَر عن الحجز كلّه');
  perform _eq(_contract(_id('B3'), 'f1000000-0000-0000-0000-0000000000f1') || '/' || _contract(_id('B3'), 'f2000000-0000-0000-0000-0000000000f2'),
              'cancelled/cancelled', 'وتُلغى العقود معاً');
  perform _act_as('f2000000-0000-0000-0000-0000000000f2');
  perform _eq((select decline_reason from machinery_bookings_list() where id = _id('B3')), 'الجرّار في صيانة هذا الأسبوع', 'والمزارع يقرأ السبب');

  perform _act_as('ee000000-0000-0000-0000-0000000000ee');
  perform _eq((select count(*)::int from machinery_bookings_list() where id in (_id('B1'), _id('B3'))), 0, 'والغريب لا يرى ما ليس مفتوحاً');
  perform _act_as('ad000000-0000-0000-0000-0000000000ad');
  perform _eq((select count(*)::int from machinery_bookings_list() where id in (_id('B1'), _id('B2'), _id('B3'))), 3, 'والإدارة ترى الحجوزات كلّها');
end $$;
reset role;
do $$
begin
  perform _eq(has_function_privilege('anon', 'machinery_bookings_list()', 'execute')
              or has_function_privilege('anon', 'machinery_booking_open(uuid,uuid,numeric,date,date,text)', 'execute'), false,
              'والزائر لا يقرأ الحجوزات ولا يفتحها: التسجيل إلزاميّ');
  perform _eq(has_function_privilege('authenticated', '_machinery_add_member(uuid,uuid,numeric,text)', 'execute'), false,
              'ولا ينادي أحدٌ المساعدات الداخليّة');
  perform _eq(has_table_privilege('service_role', 'machinery_bookings', 'insert'), false, 'ولا مفتاح الخدمة يكتب في الحجوزات');
end $$;

\echo ''
\echo 'الحساب المُغلَق: اسمه في الحجز يصير «حساب مُغلَق»'
do $$
declare m uuid; others integer;
begin
  select member_id into m from machinery_booking_members limit 1;
  select count(*) into others from machinery_booking_members where member_id <> m and display_name <> 'حساب مُغلَق';
  insert into closed_accounts (user_id) values (m);
  perform _eq((select count(*)::int from machinery_booking_members where member_id = m and display_name <> 'حساب مُغلَق'), 0,
              'كلّ أسماء العضو في الحجوزات أُخفيت');
  perform _eq((select count(*)::int from machinery_booking_members where member_id <> m and display_name <> 'حساب مُغلَق'), others,
              'وأسماء غيره كما هي');
end $$;

\echo ''
\echo 'الإشعارات: المنظّم بمن انضمّ، ومقدّم الخدمة بما أُرسل، والأعضاء بالقرار'
do $$
declare
  f1 uuid := 'f1000000-0000-0000-0000-0000000000f1';
  f2 uuid := 'f2000000-0000-0000-0000-0000000000f2';
  bb uuid := 'bb000000-0000-0000-0000-0000000000bb';
  -- Count one person's notifications of the booking whose title starts with this.
  n_of constant text := 'select count(*)::int from notifications where kind = ''machinery_booking'' and recipient_id = $1 and title like $2';
  n integer;
begin
  execute n_of into n using f1, 'انضمّ عضوٌ إلى حجزك%';
  perform _eq(n, 4, 'المنظّم يُخبَر بكلّ من انضمّ إلى حجزه (ب١ وب٢ وب٣ مرّتين)');
  execute n_of into n using f2, 'انضمّ عضوٌ إلى حجزك%';
  perform _eq(n, 1, 'ومن انتقل إليه التنظيم يُخبَر بمن انضمّ بعده، لا بانضمامه هو');
  execute n_of into n using bb, 'حجزٌ جماعيّ ينتظر قرارك%';
  perform _eq(n, 2, 'ومقدّم الخدمة يُخبَر بكلّ حجزٍ أُرسل إليه');
  execute n_of into n using f2, 'قُبل حجزك الجماعيّ%';
  perform _eq(n, 1, 'والعضو يُخبَر بالقبول');
  execute n_of into n using f1, 'اعتذر مقدّم الخدمة عن حجزك%';
  perform _eq(n, 1, 'وبالاعتذار');
  perform _eq((select count(*)::int from notifications where recipient_id = f2 and kind = 'machinery_booking'
                 and title like 'اعتذر%' and body like '%الجرّار في صيانة هذا الأسبوع%'), 1, 'ومعه سببه');
  perform _eq((select count(*)::int from notifications where kind = 'machinery_booking'
                 and recipient_id = 'f5000000-0000-0000-0000-0000000000f5'), 0, 'ومن انسحب قبل القرار لا يُخبَر به');
  perform _eq((select count(*)::int from notifications where kind = 'machinery_booking'), 11, 'ولا إشعار غير هذه');
  perform _eq(has_function_privilege('authenticated', 'machinery_booking_notify()', 'execute'), false, 'ولا ينادي أحدٌ دالّة الإشعار');
end $$;

do $$
declare n integer;
begin
  select fails into n from _score;
  if n > 0 then raise exception '% فحصاً فشل', n; end if;
end $$;
\echo ''
\echo 'OK'
