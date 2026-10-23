-- بوّابةُ صندوق الرسائل (البند ١٣٧).
--
-- A partnership thread is the investor's, the land owner's, and — once an
-- agreement names one — the managing company's; the administration reads every
-- thread and may write as «سوداقري». Before acceptance no phone number passes.
-- A declined request closes its thread to new messages. The tables are not
-- reachable directly, and nothing is removed.

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

-- ── الناس: م صاحب الأرض، س المستثمرة، غ غريب، ش صاحب الشركة، د مدير ────────
insert into auth.users (id) values
  ('a1000000-0000-0000-0000-0000000000a1'),
  ('b2000000-0000-0000-0000-0000000000b2'),
  ('c3000000-0000-0000-0000-0000000000c3'),
  ('d4000000-0000-0000-0000-0000000000d4'),
  ('f6000000-0000-0000-0000-0000000000f6')
on conflict (id) do nothing;
insert into profiles (id, full_name, role, phone) values
  ('a1000000-0000-0000-0000-0000000000a1', 'الحاج عثمان محمد', 'investor', '249911111111'),
  ('b2000000-0000-0000-0000-0000000000b2', 'سلمى أحمد علي', 'investor', '966500000000'),
  ('c3000000-0000-0000-0000-0000000000c3', 'غريب', 'investor', null),
  ('d4000000-0000-0000-0000-0000000000d4', 'شركة الجزيرة للخدمات', 'investor', null),
  ('f6000000-0000-0000-0000-0000000000f6', 'المدير', 'admin', null)
on conflict (id) do update set role = excluded.role, phone = excluded.phone, full_name = excluded.full_name;

grant usage on schema public, auth to anon, authenticated;
grant execute on function auth.uid() to anon, authenticated;
grant select, update on _who to anon, authenticated;
create table _ids (k text primary key, id uuid);
grant all on _ids to anon, authenticated;
create or replace function _id(k text) returns uuid language sql stable as $$ select id from _ids where _ids.k = $1 $$;
grant execute on function _id(text) to anon, authenticated;
grant select on notifications to authenticated;

do $$ begin perform _act_as(null); end $$;
insert into partner_companies (id, owner_id, name, kinds, states, contact_name, phone, verified_at, active) values
  ('cc000000-0000-0000-0000-0000000000c1', 'd4000000-0000-0000-0000-0000000000d4', 'شركة الجزيرة للخدمات',
   array['supervision'], array['الخرطوم'], 'عمر الطيب', '0912000000', now(), true);
insert into lands (id, owner_id, name, state, locality, village, latitude, longitude, feddans,
                   station_key, water_source, verification, documents_required,
                   open_to_investors, investor_models)
values ('11000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-0000000000a1', 'الجموعية',
        'الخرطوم', 'جبل أولياء', 'ود البشير', 15.30, 32.50, 20, 'khartoum', 'river_pump', 'verified', 3,
        true, array['sharecrop','lease']);
delete from notifications;

\echo ''
\echo 'أ) المحادثة لأطراف الطلب وحدهم'

set role authenticated;
do $$ begin
  perform _act_as('b2000000-0000-0000-0000-0000000000b2');
  insert into _ids values ('interest',
    investor_express_interest('11000000-0000-0000-0000-000000000001', 'sharecrop',
                              'أنا مستثمرة من الرياض وأريد تمويل الموسم الشتوي', true));
  insert into _ids values ('conv', conversation_for_interest(_id('interest')));

  perform _act_as('a1000000-0000-0000-0000-0000000000a1');
  perform _eq(conversation_for_interest(_id('interest')), _id('conv'), 'صاحب الأرض يفتح المحادثة نفسها');

  perform _act_as('c3000000-0000-0000-0000-0000000000c3');
  perform _refuses($q$select conversation_for_interest(_id('interest'))$q$, 'والغريب لا يفتحها');
  perform _refuses($q$select conversation_view(_id('conv'))$q$, 'ولا يقرؤها');
  perform _refuses($q$select conversation_send(_id('conv'), 'مرحباً')$q$, 'ولا يكتب فيها');
  perform _eq((select count(*)::int from my_conversations()), 0, 'ولا تظهر في قائمته');
  perform _refuses($q$select count(*) from conversation_messages$q$, 'وجدول الرسائل لا يُقرأ مباشرةً');
  perform _refuses($q$insert into conversation_messages (conversation_id, sender_role, body) values (_id('conv'), 'owner', 'x')$q$,
    'ولا يُكتب فيه مباشرةً');
end $$;
reset role;

\echo ''
\echo 'ب) لا رقمَ هاتفٍ قبل القبول'

set role authenticated;
do $$ begin
  perform _act_as('b2000000-0000-0000-0000-0000000000b2');
  perform _refuses($q$select conversation_send(_id('conv'), 'كلّمني على 0912 345 678')$q$, 'رقمٌ بمسافات يُرفض قبل القبول');
  perform _refuses($q$select conversation_send(_id('conv'), 'رقمي ٠٩١٢٣٤٥٦٧٨')$q$, 'وبالأرقام العربيّة');
  perform _refuses($q$select conversation_send(_id('conv'), 'راسلني واتساب')$q$, 'و«واتساب» يُرفض');
  perform conversation_send(_id('conv'), 'كم فداناً تصلح للقمح هذا الموسم؟ والمساحة ٢٠ فداناً.');
  perform conversation_send(_id('conv'), 'وهل الماء من النيل مباشرة؟');
  perform _eq((select count(*)::int from my_conversations() where id = _id('conv')), 1, 'المحادثة في قائمة المستثمرة');
  perform _eq((select title !~ 'الجموعية' from my_conversations() where id = _id('conv')), true,
    'وعنوانها لا يكشف اسم الأرض قبل القبول');
end $$;
reset role;

do $$ begin
  perform _eq((select count(*)::int from notifications
                where recipient_id = 'a1000000-0000-0000-0000-0000000000a1' and kind = 'message'), 1,
    'رسالتان تُشعران صاحب الأرض مرّةً واحدة ما دام الإشعار غير مقروء');
end $$;

set role authenticated;
do $$ begin
  perform _act_as('a1000000-0000-0000-0000-0000000000a1');
  perform _eq((select unread from my_conversations() where id = _id('conv')), 2, 'لصاحب الأرض رسالتان غير مقروءتين');
  perform _eq((select title ~ 'سلمى' and title ~ 'الجموعية' from my_conversations() where id = _id('conv')), true,
    'ويرى في العنوان اسم المستثمرة وأرضه');
  perform conversation_mark_read(_id('conv'));
  perform _eq((select unread from my_conversations() where id = _id('conv')), 0, 'وبعد القراءة لا شيء غير مقروء');
  perform _eq((select (conversation_view(_id('conv'))->'request'->>'message') ~ 'الرياض'), true,
    'ورسالة الطلب الأولى في رأس المحادثة');
  perform _eq((select jsonb_array_length(conversation_view(_id('conv'))->'messages')), 2, 'والرسالتان فيها');
  perform _eq((select (conversation_view(_id('conv'))->'messages'->0->>'role')), 'investor', 'باسم دورها لا باسم صاحبتها');
end $$;
reset role;

do $$ begin
  perform _eq((select count(*)::int from notifications
                where recipient_id = 'a1000000-0000-0000-0000-0000000000a1' and kind = 'message' and read_at is null), 0,
    'وقراءة المحادثة تُطفئ إشعارها');
end $$;

\echo ''
\echo 'ج) بعد القبول: الهاتف مسموح، والشركة المديرة تدخل'

set role authenticated;
do $$ begin
  perform _act_as('a1000000-0000-0000-0000-0000000000a1');
  perform land_investor_decide(_id('interest'), true);
  perform conversation_send(_id('conv'), 'قبلتُ. رقمي 0911 111 111 ونلتقي في الجمعة.');
  perform _pass('بعد القبول يُكتب الرقم');

  perform _act_as('b2000000-0000-0000-0000-0000000000b2');
  perform _eq((select title ~ 'الجموعية' from my_conversations() where id = _id('conv')), true,
    'وبعد القبول يظهر للمستثمرة اسم الأرض');
  insert into _ids values ('agreement', partnership_agreement_open(_id('interest')));

  perform _act_as('d4000000-0000-0000-0000-0000000000d4');
  perform _refuses($q$select conversation_view(_id('conv'))$q$, 'الشركة لا تقرأ قبل أن يسمّيها العقد');
end $$;
reset role;

update partnership_agreements set manager_company_id = 'cc000000-0000-0000-0000-0000000000c1'
 where id = (select id from _ids where k = 'agreement');

set role authenticated;
do $$ begin
  perform _act_as('d4000000-0000-0000-0000-0000000000d4');
  perform _eq(conversation_role(_id('conv')), 'manager', 'وبعد أن يسمّيها العقد تدخل بدور المدير');
  perform conversation_send(_id('conv'), 'نستلم الإدارة من أوّل نوفمبر إن وقّعتما.');
  perform _eq((select (conversation_view(_id('conv'))->>'agreement_id') is not null), true, 'والمحادثة تعرف عقدها');
end $$;
reset role;

do $$ begin
  -- The investor still has the unread notice of the owner's reply, so the
  -- company's message does not ring her bell twice; the owner, who had read
  -- his, gets a new one.
  perform _eq((select count(distinct recipient_id)::int from notifications
                where recipient_id in ('a1000000-0000-0000-0000-0000000000a1','b2000000-0000-0000-0000-0000000000b2')
                  and kind = 'message' and read_at is null and link = '/messages/' || _id('conv')), 2,
    'ورسالة الشركة تترك عند الطرفين إشعاراً غير مقروء');
end $$;

\echo ''
\echo 'د) الإدارة تقرأ كلّ شيء، والبلاغ يصلها'

set role authenticated;
do $$ begin
  perform _act_as('f6000000-0000-0000-0000-0000000000f6');
  perform _eq(conversation_role(_id('conv')), 'admin', 'المدير يقرأ المحادثة');
  perform _eq((select count(*)::int from my_conversations() where id = _id('conv')), 1, 'وهي في قائمته');
  perform conversation_send(_id('conv'), 'من إدارة سوداقري: العقد يُكتب ويُوقَّع في المنصّة.');
  perform _eq((select (conversation_view(_id('conv'))->'messages'->-1->>'role')), 'platform', 'ويكتب باسم سوداقري');
  perform _refuses($q$select conversation_report(_id('conv'), 'بلاغ من المدير')$q$, 'والمدير لا يبلّغ عن محادثة');

  perform _act_as('b2000000-0000-0000-0000-0000000000b2');
  perform conversation_report(_id('conv'), 'طلب منّي دفعاً خارج العقد');
  perform _eq((select reported from my_conversations() where id = _id('conv')), true, 'المستثمرة تبلّغ');
  perform _eq(jsonb_typeof(conversation_view(_id('conv'))->'reports'), 'null', 'ولا ترى سجلّ البلاغات');

  perform _act_as('f6000000-0000-0000-0000-0000000000f6');
  perform _eq((select jsonb_array_length(conversation_view(_id('conv'))->'reports')), 1, 'والمدير يرى البلاغ وسببه');
end $$;
reset role;

do $$ begin
  perform _eq((select count(*)::int from notifications
                where recipient_id = 'f6000000-0000-0000-0000-0000000000f6' and title = 'بلاغٌ عن محادثة'), 1,
    'ويصل المديرَ إشعارٌ بالبلاغ');
end $$;

\echo ''
\echo 'هـ) الطلب المعتذَر عنه يُغلق محادثته، ولا يُحذف منها شيء'

update lands set investor_models = array['sharecrop','lease'] where id = '11000000-0000-0000-0000-000000000001';
set role authenticated;
do $$ begin
  perform _act_as('c3000000-0000-0000-0000-0000000000c3');
  insert into _ids values ('interest2',
    investor_express_interest('11000000-0000-0000-0000-000000000001', 'lease',
                              'أريد استئجار الأرض لموسمٍ واحد بأجرةٍ مقدّمة', true));
  insert into _ids values ('conv2', conversation_for_interest(_id('interest2')));
  perform conversation_send(_id('conv2'), 'هل تقبل الأجرة على دفعتين؟');

  perform _act_as('a1000000-0000-0000-0000-0000000000a1');
  perform land_investor_decide(_id('interest2'), false);

  perform _act_as('c3000000-0000-0000-0000-0000000000c3');
  perform _refuses($q$select conversation_send(_id('conv2'), 'لماذا؟')$q$, 'بعد الاعتذار لا رسائل جديدة');
  perform _eq((select open from my_conversations() where id = _id('conv2')), false, 'والقائمة تقول إنّها مغلقة');
  perform _eq((select jsonb_array_length(conversation_view(_id('conv2'))->'messages')), 1, 'وما كُتب فيها باقٍ');
end $$;
reset role;

do $$ begin
  perform _eq(has_table_privilege('authenticated', 'public.conversation_messages', 'delete'), false, 'لا حذف للرسائل');
  perform _eq(has_table_privilege('authenticated', 'public.conversation_messages', 'update'), false, 'ولا تعديل');
end $$;

\echo ''
\echo 'و) «راسل سوداقري»'

delete from notifications;
set role authenticated;
do $$ begin
  perform _act_as('b2000000-0000-0000-0000-0000000000b2');
  insert into _ids values ('support', conversation_for_support());
  perform _eq(conversation_for_support(), _id('support'), 'محادثةٌ واحدة لكلّ عضو مع الإدارة');
  perform conversation_send(_id('support'), 'كيف أوثّق حسابي؟');
  perform _eq((select title from my_conversations() where id = _id('support')), 'إدارة سوداقري', 'وعنوانها «إدارة سوداقري»');

  perform _act_as('c3000000-0000-0000-0000-0000000000c3');
  perform _refuses($q$select conversation_view(_id('support'))$q$, 'ولا يقرؤها غيره');
end $$;
reset role;

do $$ begin
  perform _eq((select count(*)::int from notifications
                where recipient_id = 'f6000000-0000-0000-0000-0000000000f6' and title = 'رسالةٌ إلى سوداقري'), 1,
    'ورسالته تصل المدير');
end $$;

set role authenticated;
do $$ begin
  perform _act_as('f6000000-0000-0000-0000-0000000000f6');
  perform _eq((select title ~ 'سلمى' from my_conversations() where id = _id('support')), true, 'والمدير يرى اسم المرسِل');
  perform conversation_send(_id('support'), 'من صفحة «حسابي» ثمّ «وثّق».');
end $$;
reset role;

do $$ begin
  perform _eq((select count(*)::int from notifications
                where recipient_id = 'b2000000-0000-0000-0000-0000000000b2' and title = 'ردّت عليك إدارة سوداقري'), 1,
    'وردّ المدير يصل العضو');
  perform _eq(has_function_privilege('anon', 'public.my_conversations()', 'execute'), false, 'والزائر لا يقرأ شيئاً');
end $$;

\echo ''
\echo '=========================================================================='

do $$
declare f integer;
begin
  select fails into f from _score;
  if f > 0 then raise exception 'فشل % فحصاً.', f; end if;
  raise notice 'ALL CHECKS PASSED — المحادثة لأطرافها والإدارة، ولا رقم قبل القبول، ولا يُحذف شيء';
end $$;
