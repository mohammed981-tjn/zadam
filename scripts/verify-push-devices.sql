-- بوّابةُ إشعارات الجوّال (البند ٢٠٧؛ الهجرة 20261106090000_push_devices.sql).
-- على السلسلة الكاملة وبالهويّة كما يضعها PostgREST: رمز الجوّال يُسجَّل لصاحب الجلسة وحده ولا يراه غيره ولا يحذفه،
-- وعشرة أجهزةٍ للحساب، والمفتاح لصاحبه؛ والإشعار يأخذه المُرسِل مرّةً واحدة ولا يعيده العضو؛ وما لا يُرسَل لا يُرسَل
-- (من أطفأ المفتاح، والحساب المُغلَق، والقديم)؛ والجرس يدقّ مرّةً لكلّ جملة، وحين يكون للمستلم جهازٌ فقط، ولا يمنع
-- الإشعار إن تعطّل؛ والسرّ والأخذ لمفتاح الخدمة وحده.

\set ON_ERROR_STOP on
\set QUIET on
set client_min_messages = notice;
\o /dev/null

create table _score (fails integer not null default 0, passes integer not null default 0);
insert into _score values (0, 0);
grant all on _score to authenticated, anon, service_role;

create function _fail(label text, why text) returns void language plpgsql as $$
begin raise notice '  FAIL  % — %', label, why; update _score set fails = fails + 1; end $$;
create function _pass(label text) returns void language plpgsql as $$
begin raise notice '  PASS  %', label; update _score set passes = passes + 1; end $$;
create function _eq(got anyelement, want anyelement, label text) returns void language plpgsql as $$
begin
  if got is not distinct from want then perform _pass(label || ' — ' || coalesce(got::text, 'null'));
  else perform _fail(label, 'جاء ' || coalesce(got::text, 'null') || ' والمتوقَّع ' || coalesce(want::text, 'null')); end if;
end $$;
create function _refuses(stmt text, label text, want text default null) returns void language plpgsql as $$
begin
  begin execute stmt;
  exception when others then
    if want is null or position(want in sqlerrm) > 0 then perform _pass(label);
    else perform _fail(label, 'رُفض بغير السبب: ' || sqlerrm); end if;
    return;
  end;
  perform _fail(label, 'نُفِّذ وكان يجب أن يُرفض');
end $$;
create function _rows(stmt text, want integer, label text) returns void language plpgsql as $$
declare n integer;
begin
  begin execute stmt; get diagnostics n = row_count;
  exception when others then perform _fail(label, 'رُفض: ' || sqlerrm); return; end;
  perform _eq(n, want, label);
end $$;
create function _as(p uuid) returns void language sql as $$
  select set_config('request.jwt.claims',
    case when p is null then '' else json_build_object('sub', p, 'role', 'authenticated', 'aal', 'aal1')::text end, false) $$;
/* العدّ بصلاحيّة العنقود: ما في الجدول فعلاً، لا ما تسمح السياسات للسائل برؤيته. */
create function _devices(p uuid) returns integer language sql security definer as $$
  select count(*)::integer from push_devices where user_id = p $$;
create function _owner_of(p_token text) returns uuid language sql security definer as $$
  select user_id from push_devices where token = p_token $$;
grant execute on function _fail(text, text), _pass(text), _eq(anyelement, anyelement, text), _refuses(text, text, text),
  _rows(text, integer, text), _as(uuid), _devices(uuid), _owner_of(text) to authenticated, anon, service_role;

-- الصندوق في الموقع يقرأ read_at ويكتبه (لم تحمله base-schema.sql).
alter table notifications add column if not exists read_at timestamptz;

-- ── الناس (بصلاحيّة العنقود) ──────────────────────────────────────────────────
-- a1 صاحب الجوّال · b2 غريب · c3 بلا جهاز · d4 أطفأ المفتاح · e5 حسابٌ يُغلَق
insert into auth.users (id) values
  ('a1000000-0000-0000-0000-0000000000a1'), ('b2000000-0000-0000-0000-0000000000b2'),
  ('c3000000-0000-0000-0000-0000000000c3'), ('d4000000-0000-0000-0000-0000000000d4'),
  ('e5000000-0000-0000-0000-0000000000e5');

-- الجرس يُسمع هنا: net.http_post بديلٌ يكتب ما طُلب منه (pg_net على Supabase بالتوقيع نفسه).
create schema if not exists net;
create table _bell (url text, headers jsonb, at timestamptz default clock_timestamp());
create table _bell_mode (broken boolean not null default false);
insert into _bell_mode values (false);
create function net.http_post(url text, body jsonb default '{}', params jsonb default '{}',
                              headers jsonb default '{}', timeout_milliseconds integer default 5000)
returns bigint language plpgsql as $$
begin
  if (select broken from public._bell_mode) then raise exception 'pg_net down'; end if;
  insert into public._bell (url, headers) values (url, headers);
  return 1;
end $$;

\o
\echo 'أ) الصلاحيّات: الدوالّ للمسجَّل، والأخذ والسرّ لمفتاح الخدمة وحده'
\o /dev/null
do $$
declare f text; r text;
begin
  foreach f in array array['public.push_device_register(text, text, text)', 'public.push_device_forget(text)',
                           'public.push_app_set(boolean)', 'public.push_app_status()'] loop
    perform _eq(has_function_privilege('authenticated', f, 'execute'), true, 'المسجَّل ينادي ' || f);
    perform _eq(has_function_privilege('anon', f, 'execute'), false, 'والزائر لا ينادي ' || f);
    perform _eq((select prosecdef and proconfig::text like '%search_path=public%' from pg_proc where oid = f::regprocedure),
                true, 'وهي SECURITY DEFINER بمسار بحثٍ ثابت: ' || f);
  end loop;
  perform _eq(has_function_privilege('authenticated', 'public.push_claim(integer)', 'execute'), false, 'العضو لا يأخذ الإشعارات');
  perform _eq(has_function_privilege('anon', 'public.push_claim(integer)', 'execute'), false, 'ولا الزائر');
  perform _eq(has_function_privilege('service_role', 'public.push_claim(integer)', 'execute'), true, 'ومفتاح الخدمة يأخذها');
  foreach f in array array['public.notifications_push_bell()', 'public.notifications_pushed_at_guard()',
                           'public.push_forget_closed_account()'] loop
    foreach r in array array['anon', 'authenticated'] loop
      perform _eq(has_function_privilege(r, f, 'execute'), false, 'دالّة الزناد مغلقةٌ على ' || r || ': ' || f);
    end loop;
  end loop;
  foreach r in array array['anon', 'authenticated'] loop
    perform _eq(has_table_privilege(r, 'public.push_hook', 'SELECT'), false, 'سرّ الجرس لا يقرؤه ' || r);
    perform _eq(has_table_privilege(r, 'public.push_devices', 'INSERT') or has_table_privilege(r, 'public.push_devices', 'UPDATE'),
                false, 'ولا يكتب ' || r || ' جهازاً مباشرة');
    perform _eq(has_table_privilege(r, 'public.push_prefs', 'INSERT') or has_table_privilege(r, 'public.push_prefs', 'UPDATE')
                or has_table_privilege(r, 'public.push_prefs', 'DELETE'), false, 'ولا مفتاحاً مباشرة: ' || r);
  end loop;
  perform _eq(has_table_privilege('anon', 'public.push_devices', 'SELECT'), false, 'والزائر لا يرى الأجهزة');
  perform _eq(has_table_privilege('service_role', 'public.push_hook', 'SELECT'), true, 'ومفتاح الخدمة يقرأ السرّ');
  perform _eq((select relrowsecurity from pg_class where oid = 'public.push_devices'::regclass), true, 'push_devices: سياسة الصفوف مفعّلة');
  perform _eq((select relrowsecurity from pg_class where oid = 'public.push_prefs'::regclass), true, 'push_prefs: سياسة الصفوف مفعّلة');
  perform _eq((select relrowsecurity from pg_class where oid = 'public.push_hook'::regclass), true, 'push_hook: سياسة الصفوف مفعّلة');
  perform _eq((select length(secret) from push_hook where one), 64, 'وللجرس سرٌّ وُلِّد في الهجرة');
  perform _eq((select url from push_hook where one), 'https://zadam-khaki.vercel.app/api/push/dispatch', 'وعنوانه الموقع المنشور');
end $$;

\o
\echo 'ب) التسجيل: لصاحب الجلسة، والرمز الغريب يُرفض'
\o /dev/null
select _as(null);
set role authenticated;
select _refuses($$select push_device_register('tok-a1-phone-0000000000001', 'android', 'ar')$$, 'بلا جلسة: يُرفض', 'سجّل الدخول أولاً');
select _as('a1000000-0000-0000-0000-0000000000a1');
select _refuses($$select push_device_register('short', 'android', 'ar')$$, 'رمزٌ قصير يُرفض', 'رمز الجهاز غير صالح');
select _refuses($$select push_device_register('tok with spaces 000000000000', 'android', 'ar')$$, 'ورمزٌ بمسافات', 'رمز الجهاز غير صالح');
select _refuses($$select push_device_register(repeat('x', 4097), 'android', 'ar')$$, 'ورمزٌ أطول من ٤٠٩٦', 'رمز الجهاز غير صالح');
select _refuses($$select push_device_register('tok-a1-phone-0000000000001', 'windows', 'ar')$$, 'ونوع جهازٍ غير معروف', 'نوع الجهاز غير معروف');
select _refuses($$insert into push_devices (user_id, token, platform) values ('a1000000-0000-0000-0000-0000000000a1', 'tok-direct-00000000000000', 'android')$$,
                'ولا يُدرج جهازٌ مباشرة');
select push_device_register('tok-a1-phone-0000000000001', 'android', 'en');
reset role;
do $$ begin
  perform _eq(_owner_of('tok-a1-phone-0000000000001'), 'a1000000-0000-0000-0000-0000000000a1'::uuid, 'سُجِّل لصاحب الجلسة');
  perform _eq((select locale from push_devices where token = 'tok-a1-phone-0000000000001'), 'en', 'بلغته');
end $$;
set role authenticated;
select push_device_register('tok-a1-phone-0000000000001', 'android', 'fr');
reset role;
do $$ begin
  perform _eq(_devices('a1000000-0000-0000-0000-0000000000a1'), 1, 'الرمز نفسه مرّةً ثانية لا يصير جهازين');
  perform _eq((select locale from push_devices where token = 'tok-a1-phone-0000000000001'), 'ar', 'واللغة الغريبة تصير عربيّة');
end $$;

\o
\echo 'ج) الغريب لا يرى جهاز غيره ولا يحذفه ولا ينساه'
\o /dev/null
select _as('b2000000-0000-0000-0000-0000000000b2');
set role authenticated;
select _eq((select count(*)::int from push_devices), 0, 'الغريب لا يرى أجهزة غيره');
select _rows($$delete from push_devices where token = 'tok-a1-phone-0000000000001'$$, 0, 'ولا يحذفها');
select _eq(push_device_forget('tok-a1-phone-0000000000001'), false, 'ولا ينساها بالدالّة');
select _refuses($$update push_devices set user_id = 'b2000000-0000-0000-0000-0000000000b2'$$, 'ولا ينقلها إليه بالتحديث');
select _as('a1000000-0000-0000-0000-0000000000a1');
select _eq((select count(*)::int from push_devices), 1, 'وصاحبها يراها');
reset role;
select _eq(_devices('a1000000-0000-0000-0000-0000000000a1'), 1, 'وما زالت له');

\o
\echo 'د) جوّالٌ واحد دخله حسابٌ آخر: الرمز ينتقل إليه'
\o /dev/null
select _as('b2000000-0000-0000-0000-0000000000b2');
set role authenticated;
select push_device_register('tok-shared-phone-00000000001', 'android', 'ar');
select _as('a1000000-0000-0000-0000-0000000000a1');
select push_device_register('tok-shared-phone-00000000001', 'android', 'ar');
reset role;
select _eq(_owner_of('tok-shared-phone-00000000001'), 'a1000000-0000-0000-0000-0000000000a1'::uuid, 'صار لمن دخل أخيراً');
select _eq(_devices('b2000000-0000-0000-0000-0000000000b2'), 0, 'ولم يبقَ للأوّل');

\o
\echo 'هـ) عشرة أجهزةٍ للحساب: الحادي عشر يُخرج الأقدم ظهوراً'
\o /dev/null
select _as('a1000000-0000-0000-0000-0000000000a1');
set role authenticated;
do $$ begin
  for i in 1..12 loop
    perform push_device_register('tok-a1-many-' || lpad(i::text, 16, '0'), 'android', 'ar');
  end loop;
end $$;
reset role;
select _eq(_devices('a1000000-0000-0000-0000-0000000000a1'), 10, 'عشرة لا أكثر');
select _eq(_owner_of('tok-a1-many-0000000000000012'), 'a1000000-0000-0000-0000-0000000000a1'::uuid, 'والأحدث باقٍ');
select _eq(_owner_of('tok-a1-phone-0000000000001'), null::uuid, 'والأقدم خرج');
-- ونعيد الجوّال الأوّل، ونُبقي جهازين اثنين للفحوص التالية.
delete from push_devices where user_id = 'a1000000-0000-0000-0000-0000000000a1';
select _as('a1000000-0000-0000-0000-0000000000a1');
set role authenticated;
select push_device_register('tok-a1-phone-0000000000001', 'android', 'ar');
select push_device_register('tok-a1-tablet-000000000001', 'android', 'en');
select _eq(push_device_forget('tok-a1-tablet-000000000001'), true, 'صاحبه ينساه عند الخروج');
select _eq(push_device_forget('tok-a1-tablet-000000000001'), false, 'ومرّةً ثانية: لم يكن مسجَّلاً، بلا خطأ');
select push_device_register('tok-a1-tablet-000000000001', 'android', 'en');
reset role;
select _eq(_devices('a1000000-0000-0000-0000-0000000000a1'), 2, 'جهازان لصاحب الجوّال');

\o
\echo 'و) مفتاح «إشعارات الجوّال» لصاحبه'
\o /dev/null
select _as('d4000000-0000-0000-0000-0000000000d4');
set role authenticated;
select push_device_register('tok-d4-phone-0000000000001', 'android', 'ar');
select _eq(push_app_status() ->> 'enabled', 'true', 'مفعَّلٌ ما لم يُطفأ');
select _eq(push_app_status() ->> 'devices', '1', 'ويعدّ جوّاله');
select _eq(push_app_set(false), false, 'يُطفئه');
select _eq(push_app_status() ->> 'enabled', 'false', 'فيقرؤه مطفأً');
select _refuses($$update push_prefs set app_enabled = true$$, 'ولا يغيّره إلّا بالدالّة');
select _as('b2000000-0000-0000-0000-0000000000b2');
select _eq((select count(*)::int from push_prefs), 0, 'والغريب لا يرى مفتاح غيره');
select _eq(push_app_status() ->> 'enabled', 'true', 'ومفتاح الغريب على حاله');
select _as(null);
select _refuses($$select push_app_status()$$, 'وبلا جلسة لا حالة', 'سجّل الدخول أولاً');
select _refuses($$select push_app_set(true)$$, 'ولا تغيير', 'سجّل الدخول أولاً');
reset role;

-- جهازٌ لحسابٍ سيُغلق.
select _as('e5000000-0000-0000-0000-0000000000e5');
set role authenticated;
select push_device_register('tok-e5-phone-0000000000001', 'android', 'ar');
reset role;
select _as(null);

\o
\echo 'ز) الجرس: يدقّ مرّةً لكلّ جملة، وحين يكون للمستلم جهازٌ فقط'
\o /dev/null
delete from _bell;
insert into notifications (recipient_id, kind, title, body, link)
values ('c3000000-0000-0000-0000-0000000000c3', 'message', 'رسالة', 'لمن لا جهاز له', '/messages');
select _eq((select count(*)::int from _bell), 0, 'لا جهاز للمستلم: لا طلب');
insert into notifications (recipient_id, kind, title, body, link)
values ('a1000000-0000-0000-0000-0000000000a1', 'message', 'رسالة جديدة', 'في محادثة الشراكة', '/messages/x');
select _eq((select count(*)::int from _bell), 1, 'للمستلم جهاز: طلبٌ واحد');
select _eq((select url from _bell limit 1), 'https://zadam-khaki.vercel.app/api/push/dispatch', 'إلى عنوان المُرسِل');
select _eq((select headers ->> 'Authorization' from _bell limit 1), 'Bearer ' || (select secret from push_hook), 'وبسرّ الجرس');
delete from _bell;
insert into notifications (recipient_id, kind, title, body, link)
select u, 'message', 'للجميع', 'جملةٌ واحدة', '/notifications'
  from unnest(array['a1000000-0000-0000-0000-0000000000a1', 'c3000000-0000-0000-0000-0000000000c3',
                    'd4000000-0000-0000-0000-0000000000d4']::uuid[]) u;
select _eq((select count(*)::int from _bell), 1, 'ثلاثة إشعاراتٍ في جملةٍ واحدة: طلبٌ واحد');
update _bell_mode set broken = true;
select _rows($$insert into notifications (recipient_id, kind, title, body, link)
               values ('a1000000-0000-0000-0000-0000000000a1', 'message', 'والجرس معطّل', 'يبقى الإشعار', '/notifications')$$,
             1, 'والجرس المعطّل لا يمنع الإشعار');
update _bell_mode set broken = false;
update push_hook set url = null;
delete from _bell;
insert into notifications (recipient_id, kind, title, body, link)
values ('a1000000-0000-0000-0000-0000000000a1', 'message', 'بلا عنوان', 'لا يدقّ', '/notifications');
select _eq((select count(*)::int from _bell), 0, 'وبلا عنوانٍ لا يدقّ');
update push_hook set url = 'https://zadam-khaki.vercel.app/api/push/dispatch';
select _refuses($$update push_hook set url = 'http://example.com/x'$$, 'والعنوان https وحده');

\o
\echo 'ح) العضو يعلّم إشعاره مقروءاً ولا يغيّر متى أُرسل'
\o /dev/null
select _as('a1000000-0000-0000-0000-0000000000a1');
set role authenticated;
select _rows($$update notifications set read_at = now() where title = 'رسالة جديدة'$$, 1, 'يعلّمه مقروءاً');
select _refuses($$update notifications set pushed_at = now() where title = 'رسالة جديدة'$$, 'ولا يعلّمه مُرسَلاً', 'يمكن تعديل حالة القراءة فقط');
reset role;
select _as(null);

\o
\echo 'ط) المُرسِل يأخذ الإشعار مرّةً، وما لا يُرسَل لا يُرسَل'
\o /dev/null
-- قديمٌ من قبل يومين لم يُرسَل، وإشعارٌ لمن أطفأ المفتاح، وللحساب الذي سيُغلق.
insert into notifications (recipient_id, kind, title, body, link, created_at)
values ('a1000000-0000-0000-0000-0000000000a1', 'message', 'قديم', 'من ثلاثة أيّام', '/notifications', now() - interval '3 days');
insert into notifications (recipient_id, kind, title, body, link)
values ('e5000000-0000-0000-0000-0000000000e5', 'message', 'لحسابٍ مُغلَق', 'لا يصل', '/notifications');
insert into closed_accounts (user_id, reason) values ('e5000000-0000-0000-0000-0000000000e5', 'فحص البوّابة');
select _eq(_devices('e5000000-0000-0000-0000-0000000000e5'), 0, 'الحساب المُغلَق: أجهزته حُذفت لحظة إغلاقه');
insert into push_devices (user_id, token, platform) values ('e5000000-0000-0000-0000-0000000000e5', 'tok-e5-again-000000000001', 'android');
select _as(null);
create temp table _waiting as select count(*)::int as n from notifications where pushed_at is null;
select set_config('request.jwt.claims', '{"role":"service_role"}', false);
set role service_role;
create temp table _claim1 as select push_claim(100) as r;
create temp table _claim2 as select push_claim(100) as r;
reset role;
select set_config('request.jwt.claims', '', false);
do $$
declare c1 jsonb := (select r from _claim1); s jsonb := c1 -> 'sends';
begin
  perform _eq((c1 ->> 'claimed')::int, (select n from _waiting), 'أخذ كلّ ما لم يُرسَل');
  perform _eq((select count(*)::int from notifications where pushed_at is null), 0, 'ولم يبقَ شيءٌ بلا علامة');
  perform _eq((select count(*)::int from jsonb_array_elements(s) e where e ->> 'title' = 'رسالة جديدة'), 2,
              'رسالةٌ لصاحب الجوّال: إلى جهازيه الاثنين');
  perform _eq((select count(*)::int from jsonb_array_elements(s) e where e ->> 'title' = 'للجميع'), 2,
              'وإشعار الجميع: إلى جهازيه وحدهما (من لا جهاز له لا شيء، ومن أطفأ المفتاح لا شيء)');
  perform _eq((select count(*)::int from jsonb_array_elements(s) e where e ->> 'token' like 'tok-d4%'), 0, 'من أطفأ المفتاح لا يصله شيء');
  perform _eq((select count(*)::int from jsonb_array_elements(s) e where e ->> 'token' like 'tok-e5%'), 0, 'والحساب المُغلَق لا يصله شيء');
  perform _eq((select count(*)::int from jsonb_array_elements(s) e where e ->> 'title' = 'قديم'), 0, 'والقديم لا يُدفع بعد أيّام');
  perform _eq((select string_agg(distinct k, ',' order by k) from jsonb_array_elements(s) e, jsonb_object_keys(e) k),
              'body,id,link,locale,title,token', 'ولا يخرج غير العنوان والنصّ والرابط واللغة والرمز');
  perform _eq((select e ->> 'locale' from jsonb_array_elements(s) e where e ->> 'token' = 'tok-a1-tablet-000000000001' limit 1),
              'en', 'وبلغة الجهاز');
  perform _eq(((select r from _claim2) ->> 'claimed')::int, 0, 'والأخذ الثاني لا يجد شيئاً: لا يُرسَل إشعارٌ مرّتين');
  perform _eq(jsonb_array_length((select r from _claim2) -> 'sends'), 0, 'ولا يُرسل شيئاً');
end $$;
set role anon;
select _refuses($$select push_claim(10)$$, 'والزائر لا يأخذ شيئاً');
set role authenticated;
select _refuses($$select push_claim(10)$$, 'ولا العضو');
reset role;

\o
do $$ declare f integer; p integer; begin
  select fails, passes into f, p from _score;
  if f = 0 then raise notice 'ALL CHECKS PASSED (%)', p; else raise exception '% CHECK(S) FAILED (% passed)', f, p; end if;
end $$;
