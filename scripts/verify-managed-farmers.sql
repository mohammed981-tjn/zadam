-- بوّابةُ المزارع بلا جوّال (البند ١٦٩، الشريحة الثانية).

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


-- a1 جمعيّةٌ موثّقة · a2 تنتظر التوثيق · m1 وm2 حسابان فتحهما الخادم لمزارعين بلا جوّال · u1 حسابٌ عاديّ · f9 مدير
insert into auth.users (id, email, raw_user_meta_data, created_at) values
  ('a1000000-0000-0000-0000-0000000000a1', 'a1@example.org', '{}', now()),
  ('a2000000-0000-0000-0000-0000000000a2', 'a2@example.org', '{}', now()),
  ('e1000000-0000-0000-0000-0000000000e1', 'm1@managed.invalid', '{"managed": true}', now()),
  ('e2000000-0000-0000-0000-0000000000e2', 'm2@managed.invalid', '{"managed": true}', now()),
  ('e3000000-0000-0000-0000-0000000000e3', 'm3@managed.invalid', '{"managed": true}', now() - interval '1 hour'),
  ('e4000000-0000-0000-0000-0000000000e4', 'm4@managed.invalid', '{}', now()),
  ('d1000000-0000-0000-0000-0000000000d1', 'p249912000001@phone.sudagri.local', '{}', now()),
  ('f9000000-0000-0000-0000-0000000000f9', 'admin@example.org', '{}', now())
on conflict (id) do nothing;
insert into profiles (id, full_name, role) values
  ('a1000000-0000-0000-0000-0000000000a1', 'الجمعيّة', 'investor'),
  ('a2000000-0000-0000-0000-0000000000a2', 'تنتظر', 'investor'),
  ('d1000000-0000-0000-0000-0000000000d1', 'عضوٌ عاديّ', 'investor'),
  ('f9000000-0000-0000-0000-0000000000f9', 'المدير', 'admin')
on conflict (id) do update set role = excluded.role;
update profiles set phone = '+249911222333' where id = 'd1000000-0000-0000-0000-0000000000d1';
insert into partner_companies (id, owner_id, name, kinds, states, contact_name, phone, verified_at, active) values
  ('7a000000-0000-0000-0000-00000000007a', 'a1000000-0000-0000-0000-0000000000a1', 'جمعيّة مزارعي القرية',
   array['extension'], array['سنار'], 'فلان', '0900000001', now(), true),
  ('7b000000-0000-0000-0000-00000000007b', 'a2000000-0000-0000-0000-0000000000a2', 'شركة تنتظر',
   array['inputs'], array['سنار'], 'علان', '0900000002', null, true);
insert into storage.objects (bucket_id, name) values
  ('evidence', 'a1000000-0000-0000-0000-0000000000a1/managed/11111111-1111-1111-1111-111111111111-consent.jpg'),
  ('evidence', 'a1000000-0000-0000-0000-0000000000a1/managed/11111111-1111-1111-1111-111111111111-photo.jpg'),
  ('evidence', 'a1000000-0000-0000-0000-0000000000a1/managed/22222222-2222-2222-2222-222222222222-consent.jpg'),
  ('evidence', 'a1000000-0000-0000-0000-0000000000a1/managed/22222222-2222-2222-2222-222222222222-photo.jpg'),
  ('evidence', 'a2000000-0000-0000-0000-0000000000a2/managed/11111111-1111-1111-1111-111111111111-consent.jpg'),
  ('evidence', 'a2000000-0000-0000-0000-0000000000a2/managed/11111111-1111-1111-1111-111111111111-photo.jpg');

grant usage on schema public, auth to anon, authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated, service_role;
grant select, update on _who to anon, authenticated, service_role;

create or replace function _reg(p_user uuid, p_n text, p_nid text default null, p_folder text default 'a1000000-0000-0000-0000-0000000000a1')
returns void language sql as $$
  select managed_farmer_register(p_user, 'حاج أحمد', 'سنار', 'سنجة', 'ود النيّل', p_nid, '0912 345 678',
    p_folder || '/managed/' || p_n || '-consent.jpg', p_folder || '/managed/' || p_n || '-photo.jpg',
    array['lands', 'seasons'], 'أحمد عضوٌ في الجمعيّة منذ سنين وبصم على الورقة أمام اللجنة')
$$;

\echo ''
\echo 'أ) تسجّله جمعيّةٌ موثّقة على حسابٍ فتحه الخادم لهذا، بصورتين من مجلّدها'

set role authenticated;
do $$ begin
  perform _act_as('a2000000-0000-0000-0000-0000000000a2');
  perform _refuses($q$select _reg('e1000000-0000-0000-0000-0000000000e1', '11111111-1111-1111-1111-111111111111', null, 'a2000000-0000-0000-0000-0000000000a2')$q$,
                   'شركةٌ لم توثَّق لا تسجّل');
  perform _act_as('a1000000-0000-0000-0000-0000000000a1');
  perform _refuses($q$select _reg('d1000000-0000-0000-0000-0000000000d1', '11111111-1111-1111-1111-111111111111')$q$,
                   'ولا تسجّل على حسابٍ عاديّ لم يُفتح لهذا');
  perform _refuses($q$select _reg('e4000000-0000-0000-0000-0000000000e4', '11111111-1111-1111-1111-111111111111')$q$,
                   'ولا على حسابٍ بالعنوان الداخليّ لم يُعلَّم أنّه لمزارعٍ بلا جوّال');
  perform _refuses($q$select _reg('e3000000-0000-0000-0000-0000000000e3', '11111111-1111-1111-1111-111111111111')$q$,
                   'ولا على حسابٍ قديمٍ ولو كان من هذا النوع');
  perform _refuses($q$select _reg('e1000000-0000-0000-0000-0000000000e1', '33333333-3333-3333-3333-333333333333')$q$,
                   'ولا بصورتين لم تُرفعا');
  perform _refuses($q$select _reg('e1000000-0000-0000-0000-0000000000e1', '11111111-1111-1111-1111-111111111111', null, 'f9000000-0000-0000-0000-0000000000f9')$q$,
                   'ولا بصورتين من مجلّد غيرها');
  perform _reg('e1000000-0000-0000-0000-0000000000e1', '11111111-1111-1111-1111-111111111111', '1990-12345');
  perform _refuses($q$select _reg('e1000000-0000-0000-0000-0000000000e1', '22222222-2222-2222-2222-222222222222')$q$,
                   'ولا يُسجَّل الحساب مرّتين');
  perform _refuses($q$select _reg('e2000000-0000-0000-0000-0000000000e2', '22222222-2222-2222-2222-222222222222', '1990-12345')$q$,
                   'ولا الرقم الوطنيّ نفسه لمزارعٍ ثانٍ');
  perform _eq((select count(*)::int from lands), 0, 'والجمعيّة لا ترى شيئاً قبل اعتماد الإدارة');
  perform _eq((select count(*)::int from managed_farmers), 0, 'ولا تقرأ الجمعيّة الجدول مباشرةً (فيه الرقم الوطنيّ)');
end $$;
reset role;
do $$ begin
  perform _eq((select status from agent_mandates where farmer_id = 'e1000000-0000-0000-0000-0000000000e1'), 'pending',
              'والإذن ينتظر');
  perform _eq((select contact_phone from managed_farmers), '0912345678', 'ويُحفظ جوّال القريب بلا فراغات');
  perform _eq((select count(*)::int from notifications where recipient_id = 'f9000000-0000-0000-0000-0000000000f9'
                 and link = '/admin/managed'), 1, 'وتُخبَر الإدارة');
  perform _eq((select full_name from profiles where id = 'e1000000-0000-0000-0000-0000000000e1'), 'حاج أحمد',
              'وللحساب اسم المزارع');
end $$;

\echo ''
\echo 'ب) الإدارة تراجع الورقة والصورة وتعتمد أو تردّ بسبب'

insert into lands (owner_id, name, state, feddans, station_key, water_source)
values ('e1000000-0000-0000-0000-0000000000e1', 'حواشة أحمد', 'سنار', 5, 'sennar', 'rain');
set role authenticated;
do $$ begin
  perform _act_as('a1000000-0000-0000-0000-0000000000a1');
  perform _refuses($q$select managed_farmer_review('e1000000-0000-0000-0000-0000000000e1', true, null)$q$,
                   'الجمعيّة لا تعتمد تسجيلها بنفسها');
  perform _eq((select count(*)::int from managed_farmers_pending()), 0, 'ولا ترى قائمة الإدارة');
  perform _act_as('f9000000-0000-0000-0000-0000000000f9');
  perform _eq((select national_id from managed_farmers_pending()), '1990-12345', 'والإدارة ترى الرقم الوطنيّ والصورتين');
  perform _eq((select count(*)::int from managed_farmers where status = 'pending'), 1, 'وتعدّه قائمة مراجعتها');
  perform _refuses($q$select managed_farmer_review('e1000000-0000-0000-0000-0000000000e1', false, null)$q$,
                   'ولا تردّ بلا سبب');
  perform managed_farmer_review('e1000000-0000-0000-0000-0000000000e1', true, null);
  perform _refuses($q$select managed_farmer_review('e1000000-0000-0000-0000-0000000000e1', true, null)$q$,
                   'ولا يُعتمد مرّتين');
  perform _act_as('a1000000-0000-0000-0000-0000000000a1');
  perform _eq((select count(*)::int from lands), 1, 'فتعمل الجمعيّة عنه بعد الاعتماد');
  perform _eq((select full_name from agent_my_farmers() where status = 'active'), 'حاج أحمد', 'ويظهر في «مزارعيّ»');
end $$;
reset role;

\echo ''
\echo 'ج) حين يصير له جوّال: الإدارة وحدها تسلّمه حسابه'

set role authenticated;
do $$ begin
  perform _act_as('a1000000-0000-0000-0000-0000000000a1');
  perform _refuses($q$select managed_farmer_claimed('e1000000-0000-0000-0000-0000000000e1', '+249912000111')$q$,
                   'الجمعيّة لا تسلّم الحساب');
  perform _act_as('f9000000-0000-0000-0000-0000000000f9');
  perform _refuses($q$select managed_farmer_claimed('e1000000-0000-0000-0000-0000000000e1', '12')$q$, 'ولا برقمٍ ناقص');
  perform _refuses($q$select managed_farmer_claimed('e1000000-0000-0000-0000-0000000000e1', '0911 222 333')$q$,
                   'ولا برقم حسابٍ آخر');
  perform managed_farmer_claimed('e1000000-0000-0000-0000-0000000000e1', '+249912000111');
  perform _refuses($q$select managed_farmer_claimed('e1000000-0000-0000-0000-0000000000e1', '+249912000111')$q$,
                   'ولا يُسلَّم مرّتين');
end $$;
reset role;
do $$ begin
  perform _eq((select status from managed_farmers), 'claimed', 'صار حسابه هو');
  perform _eq((select phone from profiles where id = 'e1000000-0000-0000-0000-0000000000e1'), '+249912000111',
              'ورقمه في ملفّه، فيجده الوكلاء به');
  perform _eq((select status from agent_mandates where farmer_id = 'e1000000-0000-0000-0000-0000000000e1'), 'active',
              'وإذن الجمعيّة قائمٌ حتى يُنهيه هو');
end $$;

\echo ''
\echo 'ج٢) «نزّل بياناتي»: سجلّ تسجيله له وحده، بلا معرّفات غيره'

set role authenticated;
do $$
declare r jsonb;
begin
  perform _act_as('e1000000-0000-0000-0000-0000000000e1');
  r := managed_farmer_mine();
  perform _eq(r ->> 'national_id', '1990-12345', 'يجد المزارع رقمه الوطنيّ في ملفّه');
  perform _eq(r ->> 'registered_by', 'جمعيّة مزارعي القرية', 'واسم الجمعيّة التي سجّلته');
  perform _eq(r ->> 'status', 'claimed', 'وأنّه تسلّم حسابه');
  perform _eq((r ? 'created_by') or (r ? 'reviewed_by') or (r ? 'company_id') or (r::text ~ 'a1000000|f9000000'), false,
              'ولا معرّفَ لحساب من سجّله أو راجعه');
  perform _eq((r::text ~ '/managed/'), false, 'ولا مسارَ لصورتيه في مجلّد الجمعيّة');
  perform _act_as('a1000000-0000-0000-0000-0000000000a1');
  perform _eq(managed_farmer_mine(), null::jsonb, 'والجمعيّة لا تقرأ به سجلَّ مزارعها');
  perform _act_as('f9000000-0000-0000-0000-0000000000f9');
  perform _eq(managed_farmer_mine(), null::jsonb, 'ولا المدير (له قائمته)');
end $$;
reset role;
set role anon;
do $$ begin
  perform _act_as(null);
  perform _refuses($q$select managed_farmer_mine()$q$, 'والزائر لا يستدعيها');
end $$;
reset role;

\echo ''
\echo 'د) حدّ اليوم، والزائر'

insert into auth.users (id, email, raw_user_meta_data) select ('e9000000-0000-0000-0000-' || lpad(g::text, 12, '0'))::uuid,
  'mx' || g || '@managed.invalid', '{"managed": true}' from generate_series(1, 9) g;
insert into managed_farmers (user_id, company_id, created_by, full_name, state, village, consent_path, photo_path)
select ('e9000000-0000-0000-0000-' || lpad(g::text, 12, '0'))::uuid, '7a000000-0000-0000-0000-00000000007a',
       'a1000000-0000-0000-0000-0000000000a1', 'مزارع ' || g, 'سنار', 'قرية',
       'a1000000-0000-0000-0000-0000000000a1/managed/' || lpad(g::text, 8, '0') || '-1111-1111-1111-111111111111-consent.jpg',
       'a1000000-0000-0000-0000-0000000000a1/managed/' || lpad(g::text, 8, '0') || '-1111-1111-1111-111111111111-photo.jpg'
  from generate_series(1, 9) g;
set role authenticated;
do $$ begin
  perform _act_as('a1000000-0000-0000-0000-0000000000a1');
  perform _refuses($q$select managed_farmer_can_register()$q$, 'عشرة مزارعين في اليوم حدّ الجمعيّة');
end $$;
reset role;
set role anon;
do $$ begin
  perform _act_as(null);
  perform _refuses($q$select managed_farmer_can_register()$q$, 'والزائر لا يسجّل');
  perform _refuses($q$select * from managed_farmers_pending()$q$, 'ولا يرى القائمة');
  perform _refuses($q$select * from managed_farmers$q$, 'ولا الجدول');
end $$;
reset role;

do $$
declare n integer;
begin
  select fails into n from _score;
  if n > 0 then raise exception '% فحصاً فشل', n; end if;
end $$;
\echo ''
\echo 'OK'
