-- بوّابةُ إغلاق الحساب (البند ١٩٥).
--
-- The owner of an account asks; an administrator closes it. Closing stops the sign-in, hides the name, phone and
-- email from everyone, clears what belongs to no one else, and keeps what another party has a right to. The real
-- identity stays with the administrators alone until one of them erases it, with a reason.

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

-- ── الناس: أ صاحب الحساب، ب غيره، د مدير ────────────────────────────────────
insert into auth.users (id, email, phone, raw_user_meta_data) values
  ('a1000000-0000-0000-0000-0000000000a1', 'ahmed@example.sd', '249912000001', '{"full_name":"أحمد"}'),
  ('b2000000-0000-0000-0000-0000000000b2', 'b@example.sd', '249912000002', '{}'),
  ('f6000000-0000-0000-0000-0000000000f6', 'admin@example.sd', null, '{}');
insert into profiles (id, full_name, role, phone) values
  ('a1000000-0000-0000-0000-0000000000a1', 'أحمد علي', 'investor', '0912000001'),
  ('b2000000-0000-0000-0000-0000000000b2', 'بكري', 'investor', '0912000002'),
  ('f6000000-0000-0000-0000-0000000000f6', 'المدير', 'admin', null)
on conflict (id) do update set full_name = excluded.full_name, role = excluded.role, phone = excluded.phone;

insert into auth.sessions (user_id) values ('a1000000-0000-0000-0000-0000000000a1'), ('b2000000-0000-0000-0000-0000000000b2');
insert into auth.identities (user_id, identity_data) values ('a1000000-0000-0000-0000-0000000000a1', '{"email":"ahmed@example.sd"}');
insert into notifications (recipient_id, kind, title) values
  ('a1000000-0000-0000-0000-0000000000a1', 'x', 'لأحمد'), ('b2000000-0000-0000-0000-0000000000b2', 'x', 'لبكري');
insert into push_subscriptions (user_id) values ('a1000000-0000-0000-0000-0000000000a1');
insert into price_alerts (user_id) values ('a1000000-0000-0000-0000-0000000000a1'), ('b2000000-0000-0000-0000-0000000000b2');
insert into field_alerts_sent (recipient_id) values ('a1000000-0000-0000-0000-0000000000a1');
insert into lands (owner_id, name, state, feddans, station_key, water_source) values ('a1000000-0000-0000-0000-0000000000a1', 'أرض أحمد', 'الجزيرة', 10, 'gezira', 'canal');

grant usage on schema public, auth to anon, authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated, service_role;
grant select, update on _who to anon, authenticated, service_role;

\echo ''
\echo 'أ) صاحب الحساب يطلب الإغلاق ويسحب طلبه'

set role authenticated;
do $$ begin
  perform _act_as('a1000000-0000-0000-0000-0000000000a1');
  perform _eq(account_close_request('لم أعد أزرع') is not null, true, 'يطلب الإغلاق');
  perform _refuses($q$select account_close_request(null)$q$, 'ولا طلبين قائمين معاً');
  perform _eq((select count(*)::int from account_closure_requests), 1, 'ويرى طلبه');
  perform account_close_withdraw();
  perform _eq((select status from account_closure_requests), 'withdrawn', 'ويسحبه');
  perform _refuses($q$select account_close_withdraw()$q$, 'ولا يسحب ما لا طلب له');
  perform _eq(account_close_request(null) is not null, true, 'ويطلب من جديد');
  perform _refuses($q$insert into account_closure_requests (user_id) values (auth.uid())$q$, 'ولا يكتب في الجدول بيده');
  perform _refuses($q$select account_close('a1000000-0000-0000-0000-0000000000a1', 'أغلق نفسي')$q$, 'ولا يُغلق بنفسه — ينفّذه المدير');

  perform _act_as('b2000000-0000-0000-0000-0000000000b2');
  perform _eq((select count(*)::int from account_closure_requests), 0, 'وغيره لا يرى طلبه');
  perform _refuses($q$select account_close('a1000000-0000-0000-0000-0000000000a1', 'سبب كافٍ')$q$, 'ولا يُغلق حساب غيره');
end $$;
reset role;

set role anon;
do $$ begin
  perform _refuses($q$select account_close_request(null)$q$, 'والزائر لا يطلب');
end $$;
reset role;

\echo ''
\echo 'ب) المدير يُغلق'

set role authenticated;
do $$ begin
  perform _act_as('f6000000-0000-0000-0000-0000000000f6');
  perform _eq((select count(*)::int from account_closure_requests where status = 'open'), 1, 'المدير يرى الطلب القائم');
  perform _refuses($q$select account_close('a1000000-0000-0000-0000-0000000000a1', 'لا')$q$, 'ولا إغلاق بلا سبب كافٍ');
  perform _refuses($q$select account_close('f6000000-0000-0000-0000-0000000000f6', 'سبب كافٍ')$q$, 'ولا يُغلَق حساب مدير');
  perform _refuses($q$select account_close('00000000-0000-0000-0000-000000000000', 'سبب كافٍ')$q$, 'ولا حسابٌ غير موجود');
  perform account_close('a1000000-0000-0000-0000-0000000000a1', 'بطلبه في ٢٥ أكتوبر');
end $$;
reset role;

do $$ begin
  perform _eq((select full_name from profiles where id = 'a1000000-0000-0000-0000-0000000000a1'), 'حساب مُغلَق', 'الاسم اختفى عن الناس');
  perform _eq((select phone from profiles where id = 'a1000000-0000-0000-0000-0000000000a1'), null::text, 'والجوّال');
  perform _eq((select email from auth.users where id = 'a1000000-0000-0000-0000-0000000000a1'), null::text, 'ولا بريد يُدخَل به');
  perform _eq((select phone from auth.users where id = 'a1000000-0000-0000-0000-0000000000a1'), null::text, 'ولا جوّال يُدخَل به');
  perform _eq((select raw_user_meta_data from auth.users where id = 'a1000000-0000-0000-0000-0000000000a1'), '{}'::jsonb, 'ولا اسمٌ في بيانات الدخول');
  perform _eq((select banned_until from auth.users where id = 'a1000000-0000-0000-0000-0000000000a1'), 'infinity'::timestamptz, 'والدخول موقوفٌ أبداً');
  perform _eq((select count(*)::int from auth.sessions where user_id = 'a1000000-0000-0000-0000-0000000000a1'), 0, 'وجلساته حُذفت');
  perform _eq((select count(*)::int from auth.sessions), 1, 'وجلسة غيره باقية');
  perform _eq((select count(*)::int from auth.identities), 0, 'وهويّات الدخول المرتبطة حُذفت');
  perform _eq((select count(*)::int from notifications where recipient_id = 'a1000000-0000-0000-0000-0000000000a1'), 0, 'وإشعاراته');
  perform _eq((select count(*)::int from notifications), 1, 'وإشعار غيره باقٍ');
  perform _eq((select count(*)::int from push_subscriptions), 0, 'واشتراك جهازه');
  perform _eq((select count(*)::int from price_alerts), 1, 'وتنبيهات أسعاره (وتنبيه غيره باقٍ)');
  perform _eq((select count(*)::int from field_alerts_sent), 0, 'وسجلّ تنبيهات حقله');
  perform _eq((select name from lands where owner_id = 'a1000000-0000-0000-0000-0000000000a1'), 'أرض أحمد', 'وأرضُه وما بُني عليها باقية');
  perform _eq((select status from account_closure_requests where status <> 'withdrawn'), 'closed', 'والطلب صار مُنفَّذاً');
  perform _eq((select decided_by from account_closure_requests where status = 'closed'), 'f6000000-0000-0000-0000-0000000000f6'::uuid, 'بيد المدير');
  perform _eq((select full_name from closed_accounts), 'أحمد علي', 'والاسم الحقيقيّ محفوظ عند الإدارة');
  perform _eq((select phone from closed_accounts), '0912000001', 'والجوّال');
  perform _eq((select email from closed_accounts), 'ahmed@example.sd', 'والبريد');
  perform _eq((select auth_phone from closed_accounts), '249912000001', 'وجوّال الدخول');
  perform _eq((select closed_by from closed_accounts), 'f6000000-0000-0000-0000-0000000000f6'::uuid, 'ومن أغلق');
  perform _eq((select reason from closed_accounts), 'بطلبه في ٢٥ أكتوبر', 'ولماذا');
end $$;

set role authenticated;
do $$ begin
  perform _act_as('f6000000-0000-0000-0000-0000000000f6');
  perform _refuses($q$select account_close('a1000000-0000-0000-0000-0000000000a1', 'مرّة ثانية')$q$, 'ولا يُغلَق مرّتين');
  perform _eq((select count(*)::int from closed_accounts), 1, 'المدير يرى الهويّة المحفوظة');
  perform _act_as('b2000000-0000-0000-0000-0000000000b2');
  perform _eq((select count(*)::int from closed_accounts), 0, 'وغيره لا يراها');
  perform _act_as('a1000000-0000-0000-0000-0000000000a1');
  perform _eq((select count(*)::int from closed_accounts), 0, 'ولا صاحبها');
  perform _refuses($q$select account_close_request(null)$q$, 'ولا يطلب من أُغلق حسابه');
end $$;
reset role;

\echo ''
\echo 'ج) السجلّ لا يتغيّر إلا بمحو المدير'

do $$ begin
  perform _refuses($q$update closed_accounts set full_name = 'غيره'$q$, 'لا تُعدَّل الهويّة المحفوظة');
  perform _refuses($q$delete from closed_accounts$q$, 'ولا يُحذف السجلّ');
  perform _refuses($q$truncate closed_accounts$q$, 'ولا يُفرَّغ');
end $$;

set role authenticated;
do $$ begin
  perform _act_as('b2000000-0000-0000-0000-0000000000b2');
  perform _refuses($q$select account_identity_erase('a1000000-0000-0000-0000-0000000000a1', 'سبب كافٍ')$q$, 'غير المدير لا يمحو');
  perform _act_as('f6000000-0000-0000-0000-0000000000f6');
  perform _refuses($q$select account_identity_erase('b2000000-0000-0000-0000-0000000000b2', 'سبب كافٍ')$q$, 'ولا يُمحى حسابٌ غير مُغلَق');
  perform _refuses($q$select account_identity_erase('a1000000-0000-0000-0000-0000000000a1', 'لا')$q$, 'ولا محو بلا سبب كافٍ');
  perform account_identity_erase('a1000000-0000-0000-0000-0000000000a1', 'انقضت حاجة العقد');
  perform _eq((select full_name from closed_accounts), null::text, 'المدير محا الاسم');
  perform _eq((select coalesce(phone, email, auth_phone) from closed_accounts), null::text, 'والجوّال والبريد');
  perform _eq((select identity_erased_by from closed_accounts), 'f6000000-0000-0000-0000-0000000000f6'::uuid, 'وبقي من محا');
  perform _eq((select erase_reason from closed_accounts), 'انقضت حاجة العقد', 'ولماذا');
  perform _eq((select identity_erased_at is not null from closed_accounts), true, 'ومتى');
  perform _eq((select reason from closed_accounts), 'بطلبه في ٢٥ أكتوبر', 'وسبب الإغلاق باقٍ');
  perform _refuses($q$select account_identity_erase('a1000000-0000-0000-0000-0000000000a1', 'مرّة ثانية')$q$, 'ولا يُمحى مرّتين');
end $$;
reset role;

do $$ begin
  perform _refuses($q$update closed_accounts set erase_reason = 'غيره'$q$, 'وبعد المحو لا يتغيّر شيء');
end $$;

\echo ''
\echo 'د) الصلاحيّات'

do $$ begin
  perform _eq(has_function_privilege('anon', 'account_close(uuid,text)', 'execute'), false, 'الإغلاق ليس للزائر');
  perform _eq(has_function_privilege('service_role', 'account_close(uuid,text)', 'execute'), false, 'ولا لمفتاح الخدمة');
  perform _eq(has_function_privilege('anon', 'account_identity_erase(uuid,text)', 'execute'), false, 'ولا المحو');
  perform _eq(has_function_privilege('service_role', 'account_identity_erase(uuid,text)', 'execute'), false, 'ولا المحو بمفتاح الخدمة');
  perform _eq(has_function_privilege('anon', 'account_close_request(text)', 'execute'), false, 'والطلب ليس للزائر');
  perform _eq(has_function_privilege('authenticated', 'closed_accounts_keep()', 'execute'), false, 'والحارس الداخليّ لا يستدعيه أحد');
  perform _eq(has_table_privilege('authenticated', 'closed_accounts', 'update'), false, 'والمسجَّل لا يعدّل السجلّ');
  perform _eq(has_table_privilege('service_role', 'closed_accounts', 'select'), false, 'ومفتاح الخدمة لا يقرأ الهويّة المحفوظة');
  perform _eq(has_table_privilege('anon', 'account_closure_requests', 'select'), false, 'والزائر لا يقرأ الطلبات');
end $$;

\echo ''
\echo '=========================================================================='

do $$
declare f integer;
begin
  select fails into f from _score;
  if f > 0 then raise exception 'فشل % فحصاً.', f; end if;
  raise notice 'ALL CHECKS PASSED — يُغلَق الحساب ولا يُمحى سجلّه، والهويّة عند المدير حتى يمحوها بسبب';
end $$;
