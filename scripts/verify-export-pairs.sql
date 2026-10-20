-- بوّابةُ ملفّ الصادر: كلّ المنتجات والوجهات، والطريقُ يُفتح عند الحاجة مرّةً
-- واحدة، وما لم تُدرس شروطُه يقول ذلك.

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

grant usage on schema public, auth to anon, authenticated;
grant execute on function auth.uid() to anon, authenticated;
grant select, update on _who to anon, authenticated;
grant select, update on _score to anon, authenticated;
grant execute on function _refuses(text, text), _eq(anyelement, anyelement, text), _pass(text), _fail(text, text) to anon, authenticated;
create table _ids (k text primary key, id uuid);
grant all on _ids to anon, authenticated;
grant select on export_commodities, export_destinations, export_corridors, export_corridor_requirements to anon, authenticated;

insert into profiles (id, full_name, role) values
  ('fa000000-0000-0000-0000-0000000000fa', 'مزارع', 'investor');

\echo ''
\echo 'أ) كلّ المنتجات والوجهات، بلا تكرار'

do $$ begin
  perform _eq((select count(*)::int from export_commodities), 14, 'أربعة عشر منتجاً: الستّة القديمة وثمانية جديدة');
  perform _eq((select count(*)::int from export_destinations), 34, 'أربعٌ وثلاثون وجهة: الخمس القديمة وتسعٌ وعشرون');
  perform _eq((select count(*)::int from export_corridors), 9, 'والطرقُ التسعة المدروسة كما هي، لم يُنشأ زوجٌ مسبقاً');
  perform _eq((select count(*)::int from export_commodities where code = 'gold'), 0, 'والذهبُ ليس هنا: صادرُه بقواعد البنك المركزيّ');
  perform _eq((select count(*)::int from export_destinations where code = 'EG'), 1, 'ومصرُ وجهة');
  perform _eq((select count(*)::int from export_commodities c where not exists (select 1 from export_uom u where u.code = c.default_uom_code)), 0,
    'ولكلّ منتجٍ وحدةٌ موجودة');
end $$;

\echo ''
\echo 'ب) الطريق يُفتح عند أوّل عرض، مرّةً واحدة'

do $$ begin perform _act_as('fa000000-0000-0000-0000-0000000000fa'); end $$;
set role authenticated;
do $$
declare a uuid; b uuid; c uuid;
begin
  a := export_corridor_for((select id from export_commodities where code = 'live_camels'), (select id from export_destinations where code = 'EG'));
  b := export_corridor_for((select id from export_commodities where code = 'live_camels'), (select id from export_destinations where code = 'EG'));
  perform _eq(a is not null and a = b, true, 'الإبلُ إلى مصر: طريقٌ واحدٌ يُفتح ويُعاد نفسُه');
  perform _eq((select count(*)::int from export_corridors), 10, 'فصارت الطرقُ عشرة');
  c := export_corridor_for((select id from export_commodities where code = 'sesame'), (select id from export_destinations where code = 'CN'));
  perform _eq((select count(*)::int from export_corridor_requirements where corridor_id = c) > 0, true, 'والطريقُ المدروس يعود بقواعده');
  insert into _ids values ('camels_eg', a);
end $$;

reset role;
update export_commodities set active = false where code = 'meat';
update export_corridors set active = false
 where commodity_id = (select id from export_commodities where code = 'sorghum')
   and destination_id = (select id from export_destinations where code = 'SA');
set role authenticated;
do $$ begin
  perform _refuses($q$select export_corridor_for((select id from export_commodities where code = 'meat'), (select id from export_destinations where code = 'SA'))$q$,
    'المنتجُ الموقوف لا يُفتح له طريق');
  perform _refuses($q$select export_corridor_for((select id from export_commodities where code = 'sorghum'), (select id from export_destinations where code = 'SA'))$q$,
    'والطريقُ الذي أوقفته الإدارة لا يعود');
  perform _refuses($q$select export_corridor_for(gen_random_uuid(), (select id from export_destinations where code = 'SA'))$q$,
    'ومنتجٌ غير موجود يُرفض');
end $$;

reset role;
do $$ begin perform _act_as(null); end $$;
set role anon;
do $$ begin
  perform _refuses($q$select export_corridor_for((select id from export_commodities where code = 'cotton'), (select id from export_destinations where code = 'IN'))$q$,
    'والزائرُ لا يفتح طريقاً');
end $$;

\echo ''
\echo 'ج) ما لم تُدرس شروطُه لا يبدو جاهزاً'

reset role;
do $$
declare o uuid := gen_random_uuid();
begin
  insert into export_offers (id, reference, owner_id, corridor_id, quantity, uom_code, unit_price_minor, value_minor, status)
  values (o, 'PAIR-1', 'fa000000-0000-0000-0000-0000000000fa', (select id from _ids where k = 'camels_eg'), 20, 'head', 90000, 1800000, 'draft');
  insert into _ids values ('offer', o);
end $$;
do $$ begin perform _act_as('fa000000-0000-0000-0000-0000000000fa'); end $$;
set role authenticated;
do $$ begin
  perform _eq((select source from export_offer_readiness((select id from _ids where k = 'offer'))), 'none',
    'عرضُ الإبل إلى مصر: «لا قواعد»، والصفحةُ تقول «لم تُدرس» لا «جاهز»');
end $$;

reset role;
do $$ begin
  perform _eq(has_function_privilege('anon', 'public.export_corridor_for(uuid, uuid)', 'execute'), false, 'الزائرُ لا يملك الدالّة');
  perform _eq(has_function_privilege('authenticated', 'public.export_corridor_for(uuid, uuid)', 'execute'), true, 'والمسجّلُ يملكها');
end $$;

do $$
declare f integer;
begin
  select fails into f from _score;
  if f = 0 then raise notice 'ALL CHECKS PASSED';
  else raise exception '% CHECK(S) FAILED', f;
  end if;
end $$;
