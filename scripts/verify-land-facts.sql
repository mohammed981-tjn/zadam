-- بوّابةُ الدفعة صفر (البند ١٤٢).
--
-- A verified land's facts — where, how big, its water, soil and tenure — do
-- not change under the seal: the owner's change sends it back to review and
-- off the map, and he still cannot verify it himself. A land registered near
-- another owner's is flagged to the administrators. Whether an address has an
-- account is the server's question, not a visitor's. And the partnership
-- request without the risk acknowledgement is closed.

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

create or replace function _act_as(p uuid) returns void
language plpgsql as $$ begin update _who set uid = p; end $$;

-- ── الناس: م صاحب الأرض، ج جارٌ بمالكٍ آخر، د مدير ─────────────────────────
insert into auth.users (id, email) values
  ('a1000000-0000-0000-0000-0000000000a1', 'p249911111111@phone.invalid'),
  ('b2000000-0000-0000-0000-0000000000b2', 'Salma@Example.com'),
  ('f6000000-0000-0000-0000-0000000000f6', 'admin@example.com')
on conflict (id) do update set email = excluded.email;
insert into profiles (id, full_name, role, phone) values
  ('a1000000-0000-0000-0000-0000000000a1', 'الحاج عثمان محمد', 'investor', '249911111111'),
  ('b2000000-0000-0000-0000-0000000000b2', 'سلمى أحمد علي', 'investor', null),
  ('f6000000-0000-0000-0000-0000000000f6', 'المدير', 'admin', null)
on conflict (id) do update set role = excluded.role, phone = excluded.phone, full_name = excluded.full_name;

grant usage on schema public, auth to anon, authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated, service_role;
grant select, update on _who to anon, authenticated, service_role;
grant select, insert, update, delete on lands, profiles to anon, authenticated;
grant select on notifications to authenticated;
grant select on auth.users to postgres;

do $$ begin perform _act_as(null); end $$;
insert into lands (id, owner_id, name, state, locality, village, latitude, longitude, feddans,
                   station_key, water_source, verification, documents_required, tenure)
values ('11000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-0000000000a1', 'الجموعية',
        'الخرطوم', 'جبل أولياء', 'ود البشير', 15.3000, 32.5000, 20, 'khartoum', 'river_pump', 'verified', 3,
        'freehold');
insert into land_documents (land_id, kind, storage_path) values
  ('11000000-0000-0000-0000-000000000001', 'tenure', 'a/tenure.jpg'),
  ('11000000-0000-0000-0000-000000000001', 'photo', 'a/photo.jpg'),
  ('11000000-0000-0000-0000-000000000001', 'permit', 'a/permit.jpg');
update lands set listed = true where id = '11000000-0000-0000-0000-000000000001';
delete from notifications;

\echo ''
\echo 'أ) هل لهذا العنوان حساب؟ — للخادم وحده'

do $$ begin
  perform _eq(has_function_privilege('anon', 'public.auth_account_exists(text)', 'execute'), false,
    'الزائر لا يسأل هل لعنوانٍ حساب');
  perform _eq(has_function_privilege('authenticated', 'public.auth_account_exists(text)', 'execute'), false,
    'ولا المسجَّل');
  perform _eq(has_function_privilege('service_role', 'public.auth_account_exists(text)', 'execute'), true,
    'والخادم وحده يسأل');
end $$;

set role service_role;
do $$ begin
  perform _eq(auth_account_exists('p249911111111@phone.invalid'), true, 'رقمٌ له حساب');
  perform _eq(auth_account_exists('  salma@EXAMPLE.com '), true, 'وبريدٌ له حساب، بلا اعتبارٍ للأحرف والمسافات');
  perform _eq(auth_account_exists('p249922222222@phone.invalid'), false, 'ورقمٌ لا حساب له');
end $$;
reset role;

\echo ''
\echo 'ب) طلب الشراكة بلا إقرارٍ بالمخاطرة مُغلق'

do $$ begin
  perform _eq(has_function_privilege('authenticated', 'public.investor_express_interest(uuid,text,text)', 'execute'), false,
    'الطلب القديم بثلاثة مدخلات مغلق');
  perform _eq(has_function_privilege('authenticated', 'public.investor_express_interest(uuid,text,text,boolean)', 'execute'), true,
    'والطلب مع الإقرار مفتوح');
end $$;

\echo ''
\echo 'ج) وقائع الأرض الموثّقة لا تتغيّر تحت الختم'

set role authenticated;
do $$ begin
  perform _act_as('a1000000-0000-0000-0000-0000000000a1');

  update lands set name = 'الجموعية الشرقية', previous_crops = 'ذرة'
   where id = '11000000-0000-0000-0000-000000000001';
  perform _eq((select verification from lands where id = '11000000-0000-0000-0000-000000000001'), 'verified',
    'تغيير الاسم والمحاصيل السابقة لا يمسّ التوثيق');
  perform _eq((select listed from lands where id = '11000000-0000-0000-0000-000000000001'), true,
    'وتبقى الأرض معروضة');

  update lands set feddans = 200 where id = '11000000-0000-0000-0000-000000000001';
  perform _eq((select verification from lands where id = '11000000-0000-0000-0000-000000000001'), 'submitted',
    'تغيير المساحة بعد التوثيق يعيد الأرض إلى المراجعة');
  perform _eq((select listed from lands where id = '11000000-0000-0000-0000-000000000001'), false,
    'وتُرفع من العرض');
  perform _eq((select verification_note ~ 'المساحة' from lands where id = '11000000-0000-0000-0000-000000000001'), true,
    'والملاحظة تسمّي ما تغيّر');
  perform _eq((select count(*)::int from notifications
                where recipient_id = 'a1000000-0000-0000-0000-0000000000a1' and title = 'عادت أرضك إلى المراجعة'), 1,
    'ويُبلَّغ صاحبها');

  perform _refuses($q$update lands set verification = 'verified' where id = '11000000-0000-0000-0000-000000000001'$q$,
    'وصاحبها لا يعيد التوثيق بنفسه');
end $$;
reset role;

set role authenticated;
do $$ begin
  perform _act_as('f6000000-0000-0000-0000-0000000000f6');
  update lands set verification = 'verified', verification_note = null
   where id = '11000000-0000-0000-0000-000000000001';
  perform _eq((select verification from lands where id = '11000000-0000-0000-0000-000000000001'), 'verified',
    'المدير يعتمدها من جديد');
  update lands set feddans = 180 where id = '11000000-0000-0000-0000-000000000001';
  perform _eq((select verification from lands where id = '11000000-0000-0000-0000-000000000001'), 'verified',
    'وتصحيح المدير لا يعيدها إلى المراجعة');

  perform _act_as('a1000000-0000-0000-0000-0000000000a1');
  update lands set latitude = 15.3010 where id = '11000000-0000-0000-0000-000000000001';
  perform _eq((select verification_note ~ 'الموقع' from lands where id = '11000000-0000-0000-0000-000000000001'), true,
    'وتغيير الموقع يعيدها أيضاً');
  update lands set water_source = 'borehole', tenure = 'lease' where id = '11000000-0000-0000-0000-000000000001';
  perform _eq((select verification from lands where id = '11000000-0000-0000-0000-000000000001'), 'submitted',
    'وأرضٌ تحت المراجعة تُعدَّل بحرّيّة');
  perform _eq((select verification_note ~ 'الموقع' and verification_note !~ 'الماء'
                 from lands where id = '11000000-0000-0000-0000-000000000001'), true,
    'ولا تُعاد كتابة ملاحظتها');
end $$;
reset role;

do $$ begin
  perform _act_as(null);
  update lands set verification = 'verified', verification_note = null
   where id = '11000000-0000-0000-0000-000000000001';
  update lands set soil_class = 'Vertisols' where id = '11000000-0000-0000-0000-000000000001';
  perform _eq((select verification from lands where id = '11000000-0000-0000-0000-000000000001'), 'verified',
    'وكتابة الخادم (بلا مستخدم) لا تعيدها');
end $$;

\echo ''
\echo 'د) أرضٌ قريبة من أرضٍ باسمٍ آخر'

delete from notifications;
set role authenticated;
do $$ begin
  perform _act_as('b2000000-0000-0000-0000-0000000000b2');
  -- About 150 m north of the first land.
  insert into lands (id, owner_id, name, state, latitude, longitude, feddans, station_key, water_source, verification)
  values ('22000000-0000-0000-0000-000000000002', 'b2000000-0000-0000-0000-0000000000b2', 'أرض سلمى',
          'الخرطوم', 15.3024, 32.5000, 10, 'khartoum', 'river_pump', 'submitted');
  -- About 55 km away.
  insert into lands (id, owner_id, name, state, latitude, longitude, feddans, station_key, water_source, verification)
  values ('22000000-0000-0000-0000-000000000003', 'b2000000-0000-0000-0000-0000000000b2', 'أرضٌ بعيدة',
          'الجزيرة', 14.8000, 32.5000, 10, 'wad_medani', 'canal', 'submitted');
end $$;
reset role;

do $$ begin
  perform _eq((select count(*)::int from notifications
                where recipient_id = 'f6000000-0000-0000-0000-0000000000f6'
                  and title = 'أرضٌ قريبة من أرضٍ مسجّلة باسمٍ آخر'), 1,
    'أرضٌ على ١٥٠ متراً من أرض مالكٍ آخر تُنبَّه لها الإدارة، والبعيدة لا');
  perform _eq((select body ~ 'الجموعية' from notifications
                where title = 'أرضٌ قريبة من أرضٍ مسجّلة باسمٍ آخر' limit 1), true,
    'والتنبيه يسمّي الأرض القريبة');
end $$;

delete from notifications;
set role authenticated;
do $$ begin
  perform _act_as('a1000000-0000-0000-0000-0000000000a1');
  -- His second plot, 60 m from Salma's: flagged for hers, not for his own
  -- first land beside it.
  insert into lands (id, owner_id, name, state, latitude, longitude, feddans, station_key, water_source, verification)
  values ('11000000-0000-0000-0000-000000000004', 'a1000000-0000-0000-0000-0000000000a1', 'الجموعية ٢',
          'الخرطوم', 15.3030, 32.5000, 5, 'khartoum', 'river_pump', 'submitted');

  perform _act_as('b2000000-0000-0000-0000-0000000000b2');
  update lands set name = 'أرض سلمى الغربية' where id = '22000000-0000-0000-0000-000000000002';
end $$;
reset role;

do $$ begin
  perform _eq((select count(*)::int from notifications where title = 'أرضٌ قريبة من أرضٍ مسجّلة باسمٍ آخر'), 1,
    'أرضه الثانية تُنبَّه لأنّها قرب أرض سلمى، لا لأنّها قرب أرضه، وتغيير الاسم لا يكرّر التنبيه');
  perform _eq((select body ~ 'أرض سلمى' from notifications
                where title = 'أرضٌ قريبة من أرضٍ مسجّلة باسمٍ آخر' limit 1), true,
    'والجارة المسمّاة أرضُ سلمى');
end $$;

\echo ''
\echo '=========================================================================='

do $$
declare f integer;
begin
  select fails into f from _score;
  if f > 0 then raise exception 'فشل % فحصاً.', f; end if;
  raise notice 'ALL CHECKS PASSED — الأرض الموثّقة لا تتغيّر تحت الختم، والجارة تُنبَّه لها الإدارة';
end $$;
