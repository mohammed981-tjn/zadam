-- بوّابةُ وضع الوكيل (البند ١٦٩).

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

-- a1 وكيلٌ لشركةٍ موثّقة · a2 لشركةٍ تنتظر التوثيق · d1 مزارعٌ برقمه في ملفّه · d2 مزارعٌ برقمه في حساب الدخول
-- · d3 مزارعٌ لا شأن للوكيل به · f9 مدير
insert into auth.users (id, phone) values
  ('a1000000-0000-0000-0000-0000000000a1', null), ('a2000000-0000-0000-0000-0000000000a2', null),
  ('d1000000-0000-0000-0000-0000000000d1', null), ('d2000000-0000-0000-0000-0000000000d2', '249911111111'),
  ('d3000000-0000-0000-0000-0000000000d3', null), ('f9000000-0000-0000-0000-0000000000f9', null)
on conflict (id) do update set phone = excluded.phone;
insert into profiles (id, full_name, role, phone) values
  ('a1000000-0000-0000-0000-0000000000a1', 'الوكيل', 'investor', '0900000001'),
  ('a2000000-0000-0000-0000-0000000000a2', 'وكيلٌ ينتظر', 'investor', '0900000002'),
  ('d1000000-0000-0000-0000-0000000000d1', 'المزارع الأوّل', 'investor', '0912345678'),
  ('d2000000-0000-0000-0000-0000000000d2', 'المزارع الثاني', 'investor', null),
  ('d3000000-0000-0000-0000-0000000000d3', 'المزارع الثالث', 'investor', '0933333333'),
  ('f9000000-0000-0000-0000-0000000000f9', 'المدير', 'admin', null)
on conflict (id) do update set role = excluded.role, phone = excluded.phone;

insert into partner_companies (id, owner_id, name, kinds, states, contact_name, phone, verified_at, active) values
  ('7a000000-0000-0000-0000-00000000007a', 'a1000000-0000-0000-0000-0000000000a1', 'جمعيّة المزارعين',
   array['extension'], array['سنار'], 'فلان', '0900000001', now(), true),
  ('7b000000-0000-0000-0000-00000000007b', 'a2000000-0000-0000-0000-0000000000a2', 'شركة تنتظر',
   array['inputs'], array['سنار'], 'علان', '0900000002', null, true);

insert into lands (id, owner_id, name, state, feddans, station_key, water_source) values
  ('1d100000-0000-0000-0000-0000000001d1', 'd1000000-0000-0000-0000-0000000000d1', 'أرض المزارع الأوّل', 'سنار', 10, 'sennar', 'rain'),
  ('1d300000-0000-0000-0000-0000000001d3', 'd3000000-0000-0000-0000-0000000000d3', 'أرض المزارع الثالث', 'سنار', 10, 'sennar', 'rain');
insert into seasons (owner_id, name, crop_key, station_key, irrigation, feddans, planting_date)
values ('d1000000-0000-0000-0000-0000000000d1', 'موسم الذرة', 'sorghum', 'sennar', 'rainfed', 10, '2026-07-01');
insert into herds (owner_id, name, species, head_count, purpose, start_date)
values ('d1000000-0000-0000-0000-0000000000d1', 'قطيع الضأن', 'sheep', 20, 'meat', '2026-01-01');

grant usage on schema public, auth to anon, authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated, service_role;
grant select, update on _who to anon, authenticated, service_role;

\echo ''
\echo 'أ) الطلب: من شركةٍ موثّقة، برقم مزارعٍ له حساب، ولا يُكتب في الجدول إلا به'

set role authenticated;
do $$ begin
  perform _act_as('a2000000-0000-0000-0000-0000000000a2');
  perform _refuses($q$select agent_mandate_request('0912345678', array['lands'], 'نسجّل أرضك ونتابعها عنك')$q$,
                   'شركةٌ لم توثَّق لا تطلب');
  perform _act_as('a1000000-0000-0000-0000-0000000000a1');
  perform _refuses($q$select agent_mandate_request('0999999999', array['lands'], 'نسجّل أرضك ونتابعها عنك')$q$,
                   'ولا يُطلب رقمٌ لا حساب له');
  perform _refuses($q$select agent_mandate_request('0900000001', array['lands'], 'نسجّل أرضك ونتابعها عنك')$q$,
                   'ولا يطلب الوكيل نفسه');
  perform _refuses($q$select agent_mandate_request('0912345678', array['wallet'], 'نسجّل أرضك ونتابعها عنك')$q$,
                   'ولا إذنٌ في غير الأراضي والمواسم والقطيع');
  perform _refuses($q$select agent_mandate_request('0912345678', array['lands'], 'قصير')$q$,
                   'ولا طلبٌ بلا سببٍ يقرؤه المزارع');
  perform _refuses($q$insert into agent_mandates (company_id, farmer_id, scopes, note, phone_tail, requested_by, status, answered_at)
                      values ('7a000000-0000-0000-0000-00000000007a', 'd3000000-0000-0000-0000-0000000000d3', array['lands'],
                              'إذنٌ كتبته بنفسي', '3333', 'a1000000-0000-0000-0000-0000000000a1', 'active', now())$q$,
                   'ولا يكتب الوكيل إذناً قائماً بيده');
  perform agent_mandate_request('+249 912 345 678', array['lands', 'herds', 'lands'], 'نسجّل أرضك ونتابعها عنك');
  perform _eq((select status from agent_mandates), 'pending', 'وبالرقم بأيّ صيغةٍ كُتب يصل الطلب، وينتظر');
  perform _eq((select scopes from agent_mandates), array['herds', 'lands'], 'وما طُلب مرّتين يُحفظ مرّة');
  perform _eq((select phone_tail from agent_mandates), '5678', 'وآخر أربعة أرقامٍ ليعرفه الوكيل');
  perform _refuses($q$select agent_mandate_request('0912345678', array['seasons'], 'نتابع موسمك عنك أيضاً')$q$,
                   'ولا طلبٌ ثانٍ وبينهما طلبٌ مفتوح');
  perform _eq((select full_name from agent_my_farmers()), null::text, 'والوكيل لا يرى اسم المزارع قبل قبوله');
  perform _eq((select phone from agent_my_farmers()), null::text, 'ولا جوّاله');
end $$;
reset role;
do $$ begin
  perform _eq((select count(*)::int from notifications where recipient_id = 'd1000000-0000-0000-0000-0000000000d1'
                 and kind = 'agent_mandate' and link = '/account/agents' and body like '%أراضيك وقطيعك%'), 1,
              'والمزارع يُخبَر بما يُطلب منه وسببه');
end $$;

\echo ''
\echo 'ب) قبل القبول: لا شيء للوكيل'

set role authenticated;
do $$ begin
  perform _act_as('a1000000-0000-0000-0000-0000000000a1');
  perform _eq((select count(*)::int from lands), 0, 'لا يرى أرض المزارع');
  perform _refuses($q$insert into lands (owner_id, name, state, feddans, station_key, water_source)
                      values ('d1000000-0000-0000-0000-0000000000d1', 'أرضٌ قبل الإذن', 'سنار', 5, 'sennar', 'rain')$q$,
                   'ولا يسجّل له أرضاً');
  perform _refuses(format('select agent_mandate_answer(%L, true)', (select id from agent_mandates)),
                   'ولا يقبل الطلب عن المزارع');
  perform _act_as('d3000000-0000-0000-0000-0000000000d3');
  perform _refuses(format('select agent_mandate_answer(%L, true)', (select id from agent_mandates)),
                   'ولا يقبله مزارعٌ آخر');
  perform _eq((select count(*)::int from agent_mandates), 0, 'ولا يراه مزارعٌ آخر');
end $$;
reset role;

\echo ''
\echo 'ج) يقبل المزارع من حسابه، فيعمل الوكيل في ما أُذن فيه وحده'

set role authenticated;
do $$ begin
  perform _act_as('d1000000-0000-0000-0000-0000000000d1');
  perform _eq((select company_name from agent_my_agents()), 'جمعيّة المزارعين', 'المزارع يرى من يطلب');
  perform agent_mandate_answer((select id from agent_mandates), true);
  perform _eq((select status from agent_mandates), 'active', 'وقبل، فقام الإذن');
  perform _refuses(format('select agent_mandate_answer(%L, false)', (select id from agent_mandates)),
                   'ولا يُجاب الطلب مرّتين');

  perform _act_as('a1000000-0000-0000-0000-0000000000a1');
  perform _eq((select full_name from agent_my_farmers()), 'المزارع الأوّل', 'والوكيل يرى اسمه الآن');
  perform _eq((select count(*)::int from lands), 1, 'ويرى أرضه وحدها');
  perform _eq((select count(*)::int from agent_farmer_herds('d1000000-0000-0000-0000-0000000000d1')), 1,
              'وقطيعه، لأنّه أُذن فيه');
  perform _eq((select count(*)::int from agent_farmer_seasons('d1000000-0000-0000-0000-0000000000d1')), 0,
              'ولا يرى مواسمه، فلم يُؤذن فيها');
  perform _eq((select count(*)::int from herds), 0, 'وقائمة القطيع العامّة لا تخلط قطيع موكِّله بقطيعه');
  perform _eq((select count(*)::int from agent_farmer_herds('d3000000-0000-0000-0000-0000000000d3')), 0,
              'ولا يرى قطيع من لم يأذن له');

  perform _refuses($q$insert into lands (owner_id, name, state, feddans, station_key, water_source, verification, listed)
                      values ('d1000000-0000-0000-0000-0000000000d1', 'أرضٌ موثّقةٌ بيد الوكيل', 'سنار', 7, 'sennar',
                              'rain', 'verified', true)$q$,
                   'لا يسجّل أرضاً موثّقةً معروضة: حارس النشر عليه كما على صاحبها');
  insert into lands (id, owner_id, name, state, feddans, station_key, water_source)
  values ('1d110000-0000-0000-0000-0000000001d1', 'd1000000-0000-0000-0000-0000000000d1', 'أرضٌ سجّلها الوكيل',
          'سنار', 7, 'sennar', 'rain');
  perform _eq((select verification from lands where id = '1d110000-0000-0000-0000-0000000001d1'), 'unverified',
              'ويسجّل له أرضاً، تبدأ غير موثّقةٍ كأيّ أرض');
  update lands set name = 'أرضٌ سجّلها الوكيل وصحّح اسمها' where id = '1d110000-0000-0000-0000-0000000001d1';
  perform _eq((select name from lands where id = '1d110000-0000-0000-0000-0000000001d1'),
              'أرضٌ سجّلها الوكيل وصحّح اسمها', 'ويعدّلها');
  insert into land_documents (land_id, kind, storage_path, created_by)
  values ('1d110000-0000-0000-0000-0000000001d1', 'tenure', 'a1000000-0000-0000-0000-0000000000a1/sak.jpg',
          'a1000000-0000-0000-0000-0000000000a1');
  perform _eq((select count(*)::int from land_documents), 1, 'ويرفع مستنداتها');

  perform _refuses($q$update lands set owner_id = 'd3000000-0000-0000-0000-0000000000d3'
                      where id = '1d110000-0000-0000-0000-0000000001d1'$q$,
                   'ولا ينقل الأرض إلى مزارعٍ آخر');
  perform _refuses($q$update lands set owner_id = 'a1000000-0000-0000-0000-0000000000a1'
                      where id = '1d110000-0000-0000-0000-0000000001d1'$q$,
                   'ولا إلى نفسه');
  delete from lands where id = '1d100000-0000-0000-0000-0000000001d1';
  perform _refuses($q$insert into lands (owner_id, name, state, feddans, station_key, water_source)
                      values ('d3000000-0000-0000-0000-0000000000d3', 'أرضٌ لغير موكِّله', 'سنار', 5, 'sennar', 'rain')$q$,
                   'ولا يسجّل أرضاً لمن لم يأذن له');
  perform _refuses($q$update agent_actions set action = 'update'$q$, 'ولا يعدّل سجلّ ما فعل');
  perform _refuses($q$delete from agent_actions$q$, 'ولا يمحوه');
end $$;
reset role;
do $$ begin
  perform _eq((select count(*)::int from lands where id = '1d100000-0000-0000-0000-0000000001d1'), 1,
              'ولا يحذف أرض المزارع');
  perform _eq((select string_agg(subject || ':' || action, ',' order by id) from agent_actions),
              'land:insert,land:update,land_document:insert',
              'وكلّ ما كتبه في السجلّ، ولا يُعدّ إحصاء المستندات تعديلاً ثانياً');
  perform _eq((select count(*)::int from notifications where recipient_id = 'd1000000-0000-0000-0000-0000000000d1'
                 and title like 'سجّل وكيلك أرضاً باسمك%'), 1, 'والمزارع يُخبَر بالأرض التي سُجّلت باسمه');
  perform _eq((select count(*)::int from notifications where recipient_id = 'a1000000-0000-0000-0000-0000000000a1'
                 and title like 'قبل المزارع إذنك%'), 1, 'والوكيل يُخبَر بالقبول');
end $$;
set role authenticated;
do $$ begin
  perform _act_as('d1000000-0000-0000-0000-0000000000d1');
  perform _eq((select count(*)::int from agent_actions), 3, 'والمزارع يقرأ ما كتبه الوكيل عنه');
  perform _eq((select count(*)::int from lands), 2, 'ويرى الأرض التي سُجّلت باسمه');
  perform _act_as('d3000000-0000-0000-0000-0000000000d3');
  perform _eq((select count(*)::int from agent_actions), 0, 'ولا يقرؤه غيره');
end $$;
reset role;

\echo ''
\echo 'د) يسقط الإذن وحده إن سُحب توثيق الشركة أو أُغلق حساب المزارع'

update partner_companies set verified_at = null where id = '7a000000-0000-0000-0000-00000000007a';
set role authenticated;
do $$ begin
  perform _act_as('a1000000-0000-0000-0000-0000000000a1');
  perform _eq((select count(*)::int from lands), 0, 'شركةٌ سُحب توثيقها لا ترى شيئاً');
end $$;
reset role;
update partner_companies set verified_at = now(), active = false where id = '7a000000-0000-0000-0000-00000000007a';
set role authenticated;
do $$ begin
  perform _act_as('a1000000-0000-0000-0000-0000000000a1');
  perform _eq((select count(*)::int from lands), 0, 'ولا شركةٌ عُطّلت');
end $$;
reset role;
update partner_companies set active = true where id = '7a000000-0000-0000-0000-00000000007a';
insert into closed_accounts (user_id) values ('d1000000-0000-0000-0000-0000000000d1');
set role authenticated;
do $$ begin
  perform _act_as('a1000000-0000-0000-0000-0000000000a1');
  perform _eq((select count(*)::int from lands), 0, 'ولا يعمل الوكيل عن حسابٍ أُغلق');
end $$;
reset role;
delete from closed_accounts;
set role authenticated;
do $$ begin
  perform _act_as('a1000000-0000-0000-0000-0000000000a1');
  perform _eq((select count(*)::int from lands), 2, 'ويعود حين يعود الحال');
end $$;
reset role;

\echo ''
\echo 'هـ) الإنهاء: بيد أيٍّ منهما، فيسقط كلّ شيءٍ ويبقى السجلّ'

create table _m as select id from agent_mandates where status = 'active';
grant select on _m to authenticated;
set role authenticated;
do $$ begin
  perform _act_as('d3000000-0000-0000-0000-0000000000d3');
  perform _refuses(format('select agent_mandate_end(%L)', (select id from _m)), 'لا يُنهي الإذنَ غيرُ طرفيه');
  perform _act_as('d1000000-0000-0000-0000-0000000000d1');
  perform agent_mandate_end((select id from _m));
end $$;
reset role;
do $$ begin
  perform _eq((select status from agent_mandates where id = (select id from _m)), 'revoked', 'والمزارع يُنهيه');
  perform _eq((select ended_by from agent_mandates where id = (select id from _m)),
              'd1000000-0000-0000-0000-0000000000d1'::uuid, 'ويُحفظ من أنهاه');
  perform _eq((select count(*)::int from notifications where recipient_id = 'a1000000-0000-0000-0000-0000000000a1'
                 and title like 'أنهى المزارع إذنك%'), 1, 'والوكيل يُخبَر');
end $$;
set role authenticated;
do $$ begin
  perform _act_as('a1000000-0000-0000-0000-0000000000a1');
  perform _eq((select count(*)::int from lands), 0, 'فلا يرى الوكيل شيئاً بعده');
  update lands set name = 'بعد الإنهاء' where id = '1d110000-0000-0000-0000-0000000001d1';
  perform _eq((select full_name from agent_my_farmers() where status = 'revoked'), null::text,
              'ولا يرى اسمه بعد الإنهاء');
  perform _act_as('d1000000-0000-0000-0000-0000000000d1');
  perform _eq((select name from lands where id = '1d110000-0000-0000-0000-0000000001d1'),
              'أرضٌ سجّلها الوكيل وصحّح اسمها', 'ولا يعدّل');
  perform _eq((select count(*)::int from agent_actions), 3, 'والسجلّ يبقى عند المزارع');
  perform _eq((select count(*)::int from lands), 2, 'وما سُجّل باسمه يبقى له');

  -- طلبٌ جديدٌ بعد الإنهاء ممكن؛ والمزارع يعتذر.
  perform _act_as('a1000000-0000-0000-0000-0000000000a1');
  perform agent_mandate_request('0912345678', array['seasons'], 'نتابع موسمك عنك هذه المرّة');
  perform _act_as('d1000000-0000-0000-0000-0000000000d1');
  perform agent_mandate_answer((select id from agent_mandates where status = 'pending'), false);
  perform _eq((select count(*)::int from agent_mandates where status = 'declined'), 1, 'ويُطلب من جديد، ويعتذر المزارع');
  perform _act_as('a1000000-0000-0000-0000-0000000000a1');
  perform _eq((select count(*)::int from agent_farmer_seasons('d1000000-0000-0000-0000-0000000000d1')), 0,
              'فلا يرى الوكيل مواسمه');
  perform _eq((select count(*)::int from agent_farmer_herds('d1000000-0000-0000-0000-0000000000d1')), 0,
              'ولا قطيعه بعد إنهاء الإذن');

  -- برقم حساب الدخول؛ والوكيل يسحب طلبه قبل أن يُجاب.
  perform agent_mandate_request('0911111111', array['lands'], 'نسجّل أرضك ونتابعها عنك');
  perform _eq((select count(*)::int from agent_my_farmers() where status = 'pending'), 1,
              'ويصل الطلب برقم حساب الدخول أيضاً');
  perform agent_mandate_end((select id from agent_my_farmers() where status = 'pending'));
  perform _eq((select count(*)::int from agent_my_farmers() where status = 'withdrawn'), 1, 'ويسحبه الوكيل');
  perform _act_as('d2000000-0000-0000-0000-0000000000d2');
  perform _refuses(format('select agent_mandate_answer(%L, true)',
                          (select id from agent_mandates where status = 'withdrawn')), 'فلا يُقبل بعد سحبه');
end $$;
reset role;

\echo ''
\echo 'و) حدُّ اليوم، والزائر'

insert into auth.users (id) select ('e0000000-0000-0000-0000-' || lpad(g::text, 12, '0'))::uuid from generate_series(1, 27) g;
insert into agent_mandates (company_id, farmer_id, scopes, note, phone_tail, requested_by, status, ended_at, ended_by)
select '7a000000-0000-0000-0000-00000000007a', ('e0000000-0000-0000-0000-' || lpad(g::text, 12, '0'))::uuid,
       array['lands'], 'طلبٌ من طلبات اليوم', '0000', 'a1000000-0000-0000-0000-0000000000a1',
       'withdrawn', now(), 'a1000000-0000-0000-0000-0000000000a1'
  from generate_series(1, 27) g;
set role authenticated;
do $$ begin
  perform _act_as('a1000000-0000-0000-0000-0000000000a1');
  perform _refuses($q$select agent_mandate_request('0933333333', array['lands'], 'نسجّل أرضك ونتابعها عنك')$q$,
                   'ثلاثون طلباً في اليوم حدُّ الوكيل');
end $$;
reset role;
set role anon;
do $$ begin
  perform _act_as(null);
  perform _refuses($q$select agent_mandate_request('0933333333', array['lands'], 'نسجّل أرضك ونتابعها عنك')$q$,
                   'والزائر لا يطلب');
  perform _refuses($q$select count(*) from agent_mandates$q$, 'ولا يقرأ الأذونات');
  perform _refuses($q$select count(*) from agent_actions$q$, 'ولا السجلّ');
end $$;
reset role;
do $$ begin
  perform _eq(has_function_privilege('anon', 'is_agent_for(uuid,text)', 'execute'), false, 'ولا ينادي فحص الوكيل');
  perform _eq(has_table_privilege('authenticated', 'agent_mandates', 'insert'), false,
              'ولا يكتب أحدٌ في الأذونات بغير الدوالّ');
end $$;

do $$
declare n integer;
begin
  select fails into n from _score;
  if n > 0 then raise exception '% فحصاً فشل', n; end if;
end $$;
\echo ''
\echo 'OK'
