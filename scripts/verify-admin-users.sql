-- بوّابةُ «المسجَّلون»: للمدير وحده، وحسابُ الجوّال لا يُعرض ببريده الوهميّ، والحسابُ ذو الطريقتين يُعدّ مرّة.
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
create or replace function _refuses(q text, label text) returns void language plpgsql as $$
begin
  execute q; perform _fail(label, 'نُفِّذ ولم يُرفض');
exception when others then
  if sqlerrm ~* 'permission denied' then perform _fail(label, 'رُفض بالصلاحيّة لا بالدالّة: ' || sqlerrm);
  else perform _pass(label || ' — ' || left(sqlerrm, 50)); end if;
end $$;

insert into auth.users (id, email, created_at, last_sign_in_at, email_confirmed_at, raw_user_meta_data) values
  ('ad000000-0000-0000-0000-0000000000ad', 'admin@example.com', now() - interval '60 days', now(), now(), '{}'),
  ('b1000000-0000-0000-0000-0000000000b1', 'p966555608873@phone.invalid', now() - interval '2 hours', now() - interval '1 hour', null, '{"full_name":"محمد (جوّال)"}'),
  ('b2000000-0000-0000-0000-0000000000b2', 'two-ways@example.com', now() - interval '3 days', now() - interval '1 day', now(), '{}'),
  ('b3000000-0000-0000-0000-0000000000b3', 'new-mail@example.com', now() - interval '20 days', null, null, '{}');
insert into profiles (id, full_name, role, phone) values
  ('ad000000-0000-0000-0000-0000000000ad', 'الإدارة', 'admin', null),
  ('b1000000-0000-0000-0000-0000000000b1', 'محمد جوّال', 'farmer', '+966555608873'),
  ('b2000000-0000-0000-0000-0000000000b2', 'ذو طريقتين', 'investor', null);
insert into auth.identities (user_id, provider) values
  ('ad000000-0000-0000-0000-0000000000ad', 'email'),
  ('b1000000-0000-0000-0000-0000000000b1', 'email'),
  ('b2000000-0000-0000-0000-0000000000b2', 'email'),
  ('b2000000-0000-0000-0000-0000000000b2', 'google'),
  ('b3000000-0000-0000-0000-0000000000b3', 'email');
insert into lands (owner_id, name, state, feddans, station_key, water_source)
  values ('b1000000-0000-0000-0000-0000000000b1', 'أرض', 'الجزيرة', 5, 'wad_medani', 'canal');

grant usage on schema public, auth to anon, authenticated;
grant select, update on _score to anon, authenticated;
grant execute on function _fail(text,text), _pass(text), _act_as(uuid), _eq(anyelement,anyelement,text), _refuses(text,text) to anon, authenticated;
grant select on _who to anon, authenticated;
grant select on profiles, lands, projects, seasons to authenticated;
grant execute on function public.is_admin() to authenticated;

\echo ''
\echo '=========================================================================='
\echo 'أ) غير المدير لا يرى شيئاً'
\echo '=========================================================================='
do $$ begin perform _act_as('b2000000-0000-0000-0000-0000000000b2'); end $$;
set role authenticated;
do $$
begin
  perform _refuses($q$select * from admin_users_list()$q$, 'مستخدمٌ عاديّ لا يقرأ قائمة المسجَّلين');
  perform _refuses($q$select admin_users_summary()$q$, 'ولا عدّاداتهم');
end $$;
reset role;
set role anon;
do $$
begin
  perform _eq(has_function_privilege('anon', 'public.admin_users_list(integer,integer,text)', 'execute'), false, 'والزائر لا يستدعي الدالّة أصلاً');
end $$;
reset role;

\echo ''
\echo '=========================================================================='
\echo 'ب) المدير يقرأ، والحسابات تُترجم كما تُخزَّن'
\echo '=========================================================================='
do $$ begin perform _act_as('ad000000-0000-0000-0000-0000000000ad'); end $$;
set role authenticated;
do $$
declare s jsonb := admin_users_summary(); r record;
begin
  perform _eq((s->>'total')::int, 4, 'أربعة حسابات في المجموع');
  perform _eq((s->>'today')::int, 1, 'واحدٌ سجّل اليوم (حساب الجوّال)');
  perform _eq((s->>'week')::int, 2, 'واثنان في الأسبوع');
  perform _eq((s->>'month')::int, 3, 'وثلاثةٌ في الشهر');
  perform _eq((s->>'phone')::int, 1, 'حسابُ جوّالٍ واحد (من البريد الوهميّ)');
  perform _eq((s->>'email')::int, 3, 'وثلاثةٌ ببريدٍ حقيقيّ');
  perform _eq((s->>'google')::int, 1, 'وواحدٌ دخل بجوجل');
  perform _eq((s->>'unconfirmed')::int, 1, 'وبريدٌ واحد لم يُؤكَّد (الجوّال لا يُعدّ منهم)');
  perform _eq((s->>'farmers')::int, 1, 'ومزارعٌ واحد');
  perform _eq((s->>'admins')::int, 1, 'ومديرٌ واحد');

  select * into r from admin_users_list() where id = 'b1000000-0000-0000-0000-0000000000b1';
  perform _eq(r.email, null::text, 'حسابُ الجوّال لا يُعرض ببريده الوهميّ');
  perform _eq(r.phone, '+966555608873', 'بل برقم جوّاله');
  perform _eq(r.ways, array['phone']::text[], 'وطريقتُه «phone» لا «email»');
  perform _eq(r.confirmed, true, 'ولا يُعدّ غير مؤكَّد');
  perform _eq(r.lands, 1, 'وله أرضٌ واحدة');

  select * into r from admin_users_list() where id = 'b2000000-0000-0000-0000-0000000000b2';
  perform _eq(r.ways, array['email', 'google']::text[], 'والحسابُ ذو الطريقتين: بريد وجوجل في صفٍّ واحد');
  perform _eq((select count(*)::int from admin_users_list() where id = 'b2000000-0000-0000-0000-0000000000b2'), 1, 'ولا يتكرّر');

  perform _eq((select count(*)::int from admin_users_list(p_q => 'جوّال')), 1, 'والبحثُ بالاسم يجد');
  perform _eq((select count(*)::int from admin_users_list(p_q => '555608873')), 1, 'وبالرقم');
  perform _eq((select count(*)::int from admin_users_list(p_q => 'two-ways')), 1, 'وبالبريد');
  perform _eq((select count(*)::int from admin_users_list(p_q => 'phone.invalid')), 0, 'ولا يُبحث في البريد الوهميّ');
  perform _eq((select count(*)::int from admin_users_list(p_limit => 2)), 2, 'والحدّ يعمل');
  perform _eq((select id::text from admin_users_list(p_limit => 1)), 'b1000000-0000-0000-0000-0000000000b1', 'والأحدث أوّلاً');
end $$;
reset role;

\echo ''
\echo '=========================================================================='
do $$
declare n integer;
begin
  select fails into n from _score;
  if n > 0 then raise exception 'فشل % فحصاً.', n; end if;
  raise notice 'ALL CHECKS PASSED — المسجَّلون للمدير وحده';
end $$;
