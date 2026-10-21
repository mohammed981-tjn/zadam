-- بوّابةُ تنبيهات الهاتف: الاشتراكُ يُسجَّل لصاحب الجلسة وحده، ولا يراه غيره،
-- والإيقافُ علامةٌ لا حذف، والمفاتيحُ لا يقرؤها إلّا مفتاح الخدمة.

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

grant usage on schema public, auth to anon, authenticated, service_role;
grant execute on function _refuses(text, text), _pass(text), _fail(text, text) to anon, authenticated, service_role;
grant select, update on _score to anon, authenticated, service_role;
grant select, update on _who to anon, authenticated;
alter role service_role bypassrls;

insert into auth.users (id) values
  ('a1000000-0000-0000-0000-0000000000a1'),
  ('b2000000-0000-0000-0000-0000000000b2')
on conflict (id) do nothing;

\echo ''
\echo 'أ) المستخدم يسجّل هاتفه ويوقفه، والإيقاف علامةٌ لا حذف'

delete from _who; insert into _who values ('a1000000-0000-0000-0000-0000000000a1');
set role authenticated;
do $$
declare first_id uuid; again_id uuid;
begin
  first_id := push_subscribe('https://fcm.googleapis.com/fcm/send/abc123456789', 'p256dh-key-of-twenty-plus-characters', 'auth-secret-16', 'Chrome Android');
  perform _eq(first_id is not null, true, 'الاشتراك يُسجَّل ويُعاد رقمه');
  perform _eq((select user_id from push_subscriptions where id = first_id), 'a1000000-0000-0000-0000-0000000000a1'::uuid, 'لصاحب الجلسة');
  again_id := push_subscribe('https://fcm.googleapis.com/fcm/send/abc123456789', 'p256dh-key-of-twenty-plus-characters-2', 'auth-secret-17', 'Chrome Android');
  perform _eq(again_id, first_id, 'والعنوان نفسه مرّةً ثانية يُحدَّث لا يُكرَّر');
  perform _eq((select count(*)::int from push_subscriptions), 1, 'فيبقى اشتراكٌ واحد');
  perform _eq(push_unsubscribe('https://fcm.googleapis.com/fcm/send/abc123456789'), true, 'والإيقاف يُقبل');
  perform _eq((select count(*)::int from push_subscriptions where failed_at is not null and failed_note = 'أوقفه صاحبه'), 1, 'فيُعلَّم «أوقفه صاحبه»');
  perform _eq((select count(*)::int from push_subscriptions), 1, 'ولا يُحذف');
  perform _eq(push_unsubscribe('https://fcm.googleapis.com/fcm/send/abc123456789'), false, 'وإيقافُ الموقوف لا يفعل شيئاً');
  again_id := push_subscribe('https://fcm.googleapis.com/fcm/send/abc123456789', 'p256dh-key-of-twenty-plus-characters-3', 'auth-secret-18', null);
  perform _eq((select failed_at is null from push_subscriptions where id = again_id), true, 'وإعادةُ التفعيل تمسح العلامة');
  perform _refuses($q$select push_subscribe('http://evil.example/x', 'p256dh-key-of-twenty-plus-characters', 'auth-secret-16', null)$q$,
    'وعنوانٌ ليس https يُرفض');
  perform _refuses($q$select push_subscribe('https://fcm.googleapis.com/fcm/send/short', 'tiny', 'auth-secret-16', null)$q$,
    'ومفتاحٌ قصيرٌ يُرفض');
  perform _refuses($q$insert into push_subscriptions (user_id, endpoint, p256dh, auth) values ('a1000000-0000-0000-0000-0000000000a1', 'https://fcm.googleapis.com/fcm/send/direct-insert', 'p256dh-key-of-twenty-plus-characters', 'auth-secret-16')$q$,
    'ولا يكتب المستخدم في الجدول مباشرةً');
end $$;
reset role;

\echo ''
\echo 'ب) لا يرى المستخدم اشتراك غيره ولا يوقفه'

delete from _who; insert into _who values ('b2000000-0000-0000-0000-0000000000b2');
set role authenticated;
do $$ begin
  perform _eq((select count(*)::int from push_subscriptions), 0, 'ب لا يرى اشتراك أ');
  perform _eq(push_unsubscribe('https://fcm.googleapis.com/fcm/send/abc123456789'), false, 'ولا يوقفه');
  perform _refuses($q$select * from push_keys$q$, 'ولا يقرأ المفاتيح');
end $$;
reset role;
do $$ begin
  perform _eq((select failed_at is null from push_subscriptions where endpoint = 'https://fcm.googleapis.com/fcm/send/abc123456789'), true, 'فاشتراكُ أ ما زال فاعلاً');
end $$;

\echo ''
\echo 'ج) الزائر لا يسجّل ولا يقرأ، ومفتاح الخدمة يقرأ الكلّ'

delete from _who;
set role anon;
do $$ begin
  perform _refuses($q$select push_subscribe('https://fcm.googleapis.com/fcm/send/anon-try-12345', 'p256dh-key-of-twenty-plus-characters', 'auth-secret-16', null)$q$,
    'الزائر لا يسجّل اشتراكاً');
  perform _refuses($q$select * from push_keys$q$, 'ولا يقرأ المفاتيح');
end $$;
reset role;

do $$ begin
  perform _eq(has_function_privilege('anon', 'public.push_subscribe(text, text, text, text)', 'execute'), false, 'ولا يملك استدعاء التسجيل');
  perform _eq(has_function_privilege('anon', 'public.push_unsubscribe(text)', 'execute'), false, 'ولا الإيقاف');
  perform _eq(has_function_privilege('authenticated', 'public.push_subscribe(text, text, text, text)', 'execute'), true, 'والمستخدم المسجّل يملكهما');
  perform _eq(has_table_privilege('anon', 'public.push_keys', 'select'), false, 'والزائر لا يقرأ جدول المفاتيح');
  perform _eq(has_table_privilege('authenticated', 'public.push_keys', 'select'), false, 'ولا المستخدم المسجّل');
  perform _eq(has_table_privilege('authenticated', 'public.push_subscriptions', 'delete'), false, 'ولا يحذف المستخدم اشتراكاً');
  perform _eq((select relrowsecurity from pg_class where oid = 'public.push_keys'::regclass), true, 'وحمايةُ الصفوف على المفاتيح');
  perform _eq((select relrowsecurity from pg_class where oid = 'public.push_subscriptions'::regclass), true, 'وعلى الاشتراكات');
end $$;

set role service_role;
do $$ begin
  perform _eq((select count(*)::int from push_subscriptions where failed_at is null), 1, 'ومفتاح الخدمة يقرأ الاشتراكات الفاعلة ليدفع إليها');
  insert into push_keys (one, public_key, private_key) values (true, 'pub', 'priv');
  perform _eq((select count(*)::int from push_keys), 1, 'ويحفظ المفاتيح مرّةً');
  perform _refuses($q$insert into push_keys (one, public_key, private_key) values (false, 'pub2', 'priv2')$q$, 'ولا صفَّ ثانياً للمفاتيح');
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
