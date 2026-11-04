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
  ('a1000000-0000-0000-0000-0000000000a1', 'nafir_joined', 'لأحمد'), ('b2000000-0000-0000-0000-0000000000b2', 'nafir_joined', 'لبكري');
insert into push_subscriptions (user_id) values ('a1000000-0000-0000-0000-0000000000a1');
insert into price_alerts (user_id) values ('a1000000-0000-0000-0000-0000000000a1'), ('b2000000-0000-0000-0000-0000000000b2');
insert into field_alerts_sent (recipient_id) values ('a1000000-0000-0000-0000-0000000000a1');
insert into lands (owner_id, name, state, feddans, station_key, water_source) values ('a1000000-0000-0000-0000-0000000000a1', 'أرض أحمد', 'الجزيرة', 10, 'gezira', 'canal');

-- Where the name or phone was copied for others to see (البند ١٩٨ ج٩): one row of each, for him and one for بكري. Planted
-- with the guards off, as the guards stamp the session's own id; the closure itself then runs with them on.
set session_replication_role = replica;
insert into charter_signatures (user_id, charter_version, role, display_name) values
  ('a1000000-0000-0000-0000-0000000000a1', 1, 'member', 'أحمد علي'), ('b2000000-0000-0000-0000-0000000000b2', 1, 'member', 'بكري');
insert into nafir_calls (id, organizer_id, display_name, kind, title, description, state, locality, starts_on, needed) values
  ('c0000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-0000000000a1', 'أحمد علي', 'harvest', 'حصاد القمح', 'نحتاج أيادي للحصاد يوم السبت', 'الجزيرة', 'ود مدني', current_date + 3, 5);
insert into nafir_joins (call_id, user_id, display_name) values
  ('c0000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-0000000000a1', 'أحمد علي'),
  ('c0000000-0000-0000-0000-000000000001', 'b2000000-0000-0000-0000-0000000000b2', 'بكري');
insert into faza_requests (id, requester_id, display_name, cause, title, description, state, locality, needs) values
  ('c0000000-0000-0000-0000-000000000002', 'a1000000-0000-0000-0000-0000000000a1', 'أحمد علي', 'flood', 'غرقت الأرض', 'غمرت المياه نصف الأرض أمس', 'الجزيرة', 'ود مدني', array['labor']);
insert into faza_pledges (request_id, pledger_id, display_name, kind, detail) values
  ('c0000000-0000-0000-0000-000000000002', 'a1000000-0000-0000-0000-0000000000a1', 'أحمد علي', 'labor', 'يومان'),
  ('c0000000-0000-0000-0000-000000000002', 'b2000000-0000-0000-0000-0000000000b2', 'بكري', 'tools', 'مضخّة');
insert into shura_items (author_id, display_name, kind, title, body) values
  ('a1000000-0000-0000-0000-0000000000a1', 'أحمد علي', 'question', 'سؤال عن الري', 'متى يُفتح الري في القناة؟');
insert into shura_items (author_id, display_name, kind, title, body, answer, answered_by, answer_name, answered_at) values
  ('b2000000-0000-0000-0000-0000000000b2', 'بكري', 'question', 'سؤال عن السماد', 'أين يُباع السماد المدعوم؟',
   'في مكتب المشروع كلّ أحد', 'a1000000-0000-0000-0000-0000000000a1', 'أحمد علي', now());
insert into judiyya_mediators (user_id, display_name, state, about) values
  ('a1000000-0000-0000-0000-0000000000a1', 'أحمد علي', 'الجزيرة', 'أصلح بين الجيران في نزاعات الماء منذ سنين');
insert into judiyya_cases (id, opened_by, kind, title, summary, state, locality) values
  ('c0000000-0000-0000-0000-000000000003', 'b2000000-0000-0000-0000-0000000000b2', 'water', 'نوبة الري', 'خلافٌ على نوبة الري بين أرضين متجاورتين', 'الجزيرة', 'ود مدني');
insert into judiyya_parties (case_id, side, user_id, display_name) values
  ('c0000000-0000-0000-0000-000000000003', 'a', 'b2000000-0000-0000-0000-0000000000b2', 'بكري'),
  ('c0000000-0000-0000-0000-000000000003', 'b', 'a1000000-0000-0000-0000-0000000000a1', 'أحمد علي');
insert into canals (id, name, state, locality, created_by) values
  ('c0000000-0000-0000-0000-000000000004', 'ترعة الشرق', 'الجزيرة', 'ود مدني', 'b2000000-0000-0000-0000-0000000000b2');
insert into canal_members (canal_id, user_id, display_name, feddans) values
  ('c0000000-0000-0000-0000-000000000004', 'a1000000-0000-0000-0000-0000000000a1', 'أحمد علي', 10),
  ('c0000000-0000-0000-0000-000000000004', 'b2000000-0000-0000-0000-0000000000b2', 'بكري', 5);
insert into feedback (author_id, display_name, body) values ('a1000000-0000-0000-0000-0000000000a1', 'أحمد علي', 'اقتراح: أضيفوا الذرة الشاميّة');
insert into market_offers (kind, crop, quantity, unit, state, locality, contact_phone, created_by) values
  ('sell', 'ذرة', 20, 'sack', 'الجزيرة', 'ود مدني', '249912000001', 'a1000000-0000-0000-0000-0000000000a1'),
  ('sell', 'سمسم', 5, 'sack', 'الجزيرة', 'ود مدني', '249912000002', 'b2000000-0000-0000-0000-0000000000b2');
insert into suppliers (id, owner_id, name, state, locality, phone, categories) values
  ('c0000000-0000-0000-0000-000000000005', 'a1000000-0000-0000-0000-0000000000a1', 'مورّد أحمد', 'الجزيرة', 'ود مدني', '0912000001', array['seed']);
insert into group_orders (id, organiser_id, organiser_name, organiser_phone, supplier_id, title, pickup_name, pickup_locality, pickup_state,
                          drop_day, deadline, target_tonnes, payee, payee_account) values
  ('c0000000-0000-0000-0000-000000000006', 'a1000000-0000-0000-0000-0000000000a1', 'أحمد علي', '0912000001', 'c0000000-0000-0000-0000-000000000005',
   'سماد الموسم', 'مخزن الجمعيّة', 'ود مدني', 'الجزيرة', current_date + 20, current_date + 10, 5, 'supplier', 'حساب ١٢٣٤٥');
insert into group_order_lines (id, order_id, name, unit_label, unit_kg, unit_price_usd) values
  ('c0000000-0000-0000-0000-000000000007', 'c0000000-0000-0000-0000-000000000006', 'يوريا', 'شوال', 50, 30);
insert into group_order_pledges (order_id, line_id, user_id, display_name, phone, quantity) values
  ('c0000000-0000-0000-0000-000000000006', 'c0000000-0000-0000-0000-000000000007', 'a1000000-0000-0000-0000-0000000000a1', 'أحمد علي', '0912000001', 4),
  ('c0000000-0000-0000-0000-000000000006', 'c0000000-0000-0000-0000-000000000007', 'b2000000-0000-0000-0000-0000000000b2', 'بكري', '0912000002', 2);
insert into carriers (owner_id, name, phone, vehicle, capacity_tonnes, states) values
  ('a1000000-0000-0000-0000-0000000000a1', 'نقل أحمد', '0912000001', 'دفّار', 5, array['الجزيرة']);
insert into partner_companies (owner_id, name, kinds, states, contact_name, phone) values
  ('a1000000-0000-0000-0000-0000000000a1', 'شركة أحمد', array['inputs'], array['الجزيرة'], 'أحمد علي', '0912000001');
insert into service_providers (owner_id, name, phone, kind) values
  ('a1000000-0000-0000-0000-0000000000a1', 'خدمات أحمد', '0912000001', 'drone');
set session_replication_role = origin;

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

\echo ''
\echo 'ب٢) اسمه وجوّاله يختفيان حيث نُسخا لغيره، وتبقى الصفوف لمن شاركه (ج٩)'
do $$
declare a uuid := 'a1000000-0000-0000-0000-0000000000a1'; c text := 'حساب مُغلَق';
begin
  perform _eq((select display_name from charter_signatures where user_id = a), c, 'توقيع الميثاق');
  perform _eq((select display_name from charter_signatures where user_id <> a), 'بكري', 'وتوقيع غيره كما هو');
  perform _eq((select display_name from nafir_calls where organizer_id = a), c, 'دعوة النفير');
  perform _eq((select string_agg(display_name, '،' order by user_id) from nafir_joins), c || '،' || 'بكري', 'والمنضمّون إليها: اسمه وحده');
  perform _eq((select display_name from faza_requests where requester_id = a), c, 'طلب الفزعة');
  perform _eq((select count(*)::int from faza_pledges where display_name = 'أحمد علي'), 0, 'وتعهّده فيها');
  perform _eq((select count(*)::int from faza_pledges where display_name = 'بكري'), 1, 'وتعهّد غيره كما هو');
  perform _eq((select display_name from shura_items where author_id = a), c, 'سؤاله في الشورى');
  perform _eq((select answer_name from shura_items where answered_by = a), c, 'وجوابه عن سؤال غيره');
  perform _eq((select display_name from shura_items where author_id <> a), 'بكري', 'وسؤال غيره باسمه');
  perform _eq((select display_name from judiyya_mediators where user_id = a), c, 'الجوديّة: الأجاويد');
  perform _eq((select display_name from judiyya_parties where user_id = a), c, 'وطرفاً في قضيّة');
  perform _eq((select display_name from judiyya_parties where user_id <> a), 'بكري', 'والطرف الآخر كما هو');
  perform _eq((select display_name from canal_members where user_id = a), c, 'عضويّة القناة');
  perform _eq((select display_name from feedback where author_id = a), null::text, 'والملاحظة بلا اسم');
  perform _eq((select display_name || '|' || coalesce(phone, '') from group_order_pledges where user_id = a), c || '|', 'تعهّده في الطلب الجماعي بلا اسم ولا جوّال');
  perform _eq((select display_name || '|' || phone from group_order_pledges where user_id <> a), 'بكري|0912000002', 'وتعهّد غيره كما هو');
  perform _eq((select organiser_name || '|' || coalesce(organiser_phone, '') from group_orders where organiser_id = a), c || '|', 'الطلب الجماعي الذي نظّمه: بلا اسم ولا جوّال');
  perform _eq((select status from group_orders where organiser_id = a), 'closed', 'ويُغلق الانضمام إليه');
  perform _eq((select status from market_offers where created_by = a), 'closed', 'عرضه في السوق أُغلق (لا يراه الزائر)');
  perform _eq((select status from market_offers where created_by <> a), 'open', 'وعرض غيره مفتوح');
  perform _eq((select bool_or(active) from (select active from suppliers where owner_id = a union all select active from carriers where owner_id = a
                union all select active from partner_companies where owner_id = a union all select active from service_providers where owner_id = a) x),
              false, 'والمورّد والناقل والشركة ومقدّم الخدمة لم تعد تُعرض');
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

grant select, update on faza_pledges, shura_items to authenticated;
grant select on faza_requests to authenticated;
set role authenticated;
do $$ begin
  perform _act_as('b2000000-0000-0000-0000-0000000000b2');
  update faza_pledges set display_name = 'اسمٌ آخر' where pledger_id = auth.uid();
  update shura_items set display_name = 'اسمٌ آخر' where author_id = auth.uid();
end $$;
reset role;
do $$ begin
  perform _eq((select display_name from faza_pledges where pledger_id = 'b2000000-0000-0000-0000-0000000000b2'), 'بكري',
              'والحارس باقٍ خارج الإغلاق: لا يغيّر أحدٌ اسمه في تعهّدٍ مضى');
  perform _eq((select display_name from shura_items where author_id = 'b2000000-0000-0000-0000-0000000000b2'), 'بكري',
              'ولا في سؤالٍ أُجيب');
end $$;

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
\echo 'هـ) الحساب المُغلَق لا يكتب ولا يقرأ من لحظة إغلاقه، ولو بقي رمز دخوله صالحاً (ج١٠)'

do $$ begin
  perform _eq((select bool_or(s = 'pgrst.db_pre_request=public.closed_account_gate')
                 from pg_db_role_setting rs join pg_roles r on r.oid = rs.setrole, unnest(rs.setconfig) s
                where r.rolname = 'authenticator'), true, 'كلّ طلبٍ إلى الواجهة يمرّ أوّلاً بفحص الحساب المُغلَق');
end $$;

-- A permissive policy of the harness's own, so that the restrictive one is what refuses.
create policy harness_any_upload on storage.objects for insert to authenticated with check (true);
grant usage on schema storage to authenticated;
grant insert on storage.objects to authenticated;

set role authenticated;
do $$ begin
  perform _act_as('a1000000-0000-0000-0000-0000000000a1');
  perform _refuses($q$select closed_account_gate()$q$, 'صاحب الحساب المُغلَق: كلّ طلبٍ له يُرفض');
  perform _eq(account_is_open(), false, 'وهو حسابٌ غير مفتوح');
  perform _refuses($q$insert into storage.objects (bucket_id, name, owner) values ('evidence', 'x/after-close.jpg', auth.uid())$q$,
                   'ولا يرفع ملفّاً');
  perform _act_as('b2000000-0000-0000-0000-0000000000b2');
  perform closed_account_gate();
  perform _pass('وغيره يمرّ');
  insert into storage.objects (bucket_id, name, owner) values ('evidence', 'x/open.jpg', auth.uid());
  perform _pass('ويرفع');
  perform _act_as(null);
  perform closed_account_gate();
  perform _pass('والزائر يمرّ (يقرأ ما للعامّة)');
end $$;
reset role;

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
