-- النشر الآليّ للموثوق والتنبيه على التوقّف (20261104020000).

\set ON_ERROR_STOP on
\set QUIET on
set client_min_messages = notice;
\o /dev/null

create table _score (fails integer not null default 0);
insert into _score values (0);
grant all on _score to public;
create function _fail(label text, why text) returns void language plpgsql as $$
begin raise notice '  FAIL  % — %', label, why; update _score set fails = fails + 1; end $$;
create function _pass(label text) returns void language plpgsql as $$ begin raise notice '  PASS  %', label; end $$;
create function _eq(got anyelement, want anyelement, label text) returns void language plpgsql as $$
begin
  if got is not distinct from want then perform _pass(label);
  else perform _fail(label, 'جاء ' || coalesce(got::text, 'null') || ' والمتوقَّع ' || coalesce(want::text, 'null'));
  end if;
end $$;
grant execute on function _fail(text, text), _pass(text) to public;
grant execute on function _eq(anyelement, anyelement, text) to public;

insert into auth.users (id) values ('ad000000-0000-0000-0000-0000000000ad');
insert into profiles (id, full_name, role) values ('ad000000-0000-0000-0000-0000000000ad', 'المدير', 'admin')
on conflict (id) do update set role = excluded.role;

-- ما قرأه الفحص للتوّ: موثوق (أ)، وشاذّ (ب)، ونصٌّ حرّ (ج)؛ وموثوقٌ قديم من فحصٍ سابق (د).
insert into market_quotes (id, kind, market_date, buy, sell, source_url, quote, status, reason, created_at) values
  ('a0000000-0000-0000-0000-00000000000a', 'fx_bank', '2026-11-03', 4900, 4950, 'https://bajnews.net/a/', 'جملة', 'held', 'قراءة موثوقة تنتظر اعتماد الإدارة', now()),
  ('b0000000-0000-0000-0000-00000000000b', 'fx_parallel', '2026-11-03', 9600, 14100, 'https://bajnews.net/b/', 'جملة', 'held', 'بعيدٌ عن آخر رقم — يُراجَع', now()),
  ('d0000000-0000-0000-0000-00000000000d', 'fx_bank', '2026-10-30', 4800, 4850, 'https://bajnews.net/d/', 'جملة', 'held', 'قراءة موثوقة تنتظر اعتماد الإدارة', now() - interval '3 days');
insert into market_quotes (id, kind, market, crop, unit, market_date, price, source_url, status, reason, created_at) values
  ('c0000000-0000-0000-0000-00000000000c', 'crop', 'gedaref', 'sorghum', 'sack', '2026-11-03', 90000, 'https://sudafax.com/c/', 'held', 'نصٌّ حرّ من نشرة القضارف — يُنشر بعد المراجعة', now());

\echo 'أ) مفتاح الخدمة لا ينشر بنفسه، والدالّة تنشر الموثوق الجديد وحده'
set role service_role;
do $$ begin
  begin
    update market_quotes set status = 'published' where id = 'b0000000-0000-0000-0000-00000000000b';
  exception when others then null;  -- the guard refuses it; on Supabase, where the key passes RLS, that is what stops it
  end;
end $$;
reset role;
select _eq((select status from market_quotes where id = 'b0000000-0000-0000-0000-00000000000b'), 'held', 'مفتاح الخدمة لا ينشر الشاذّ مباشرةً');
set role service_role;
select _eq(public.market_quotes_publish_trusted(array[
  'a0000000-0000-0000-0000-00000000000a', 'b0000000-0000-0000-0000-00000000000b',
  'c0000000-0000-0000-0000-00000000000c', 'd0000000-0000-0000-0000-00000000000d']::uuid[]), 1,
  'من أربعة أُرسلت يُنشر واحد: الموثوقُ الذي قُرئ للتوّ');
reset role;
select _eq((select status || ' | ' || reason from market_quotes where id = 'a0000000-0000-0000-0000-00000000000a'),
           'published | نُشر آليّاً: قراءة موثوقة ضمن حركة اليوم (المالك، 4 نوفمبر 2026)', 'وسببُه يقول إنّه نُشر آليّاً');
select _eq((select string_agg(status, ',' order by id) from market_quotes where id <> 'a0000000-0000-0000-0000-00000000000a'),
           'held,held,held', 'والشاذّ والنصّ الحرّ والقديم تبقى للمدير');
select _eq(public.market_quotes_publish_trusted('{}'::uuid[]), 0, 'وقائمةٌ فارغة لا تفعل شيئاً');

\echo 'ب) التنبيه: مرّةً في اليوم، للمدير، داخل المنصّة'
set role service_role;
select _eq(public.price_feeds_alert(array['خلاصة بنك الخرطوم متوقّفة منذ 12 يوماً']), 1, 'خلاصةٌ متوقّفة: يصل المديرَ إشعار');
select _eq(public.price_feeds_alert(array['خلاصة بنك الخرطوم متوقّفة منذ 12 يوماً']), 0, 'وفحصٌ ثانٍ في اليوم نفسه لا يكرّره');
reset role;
select _eq((select kind || ' | ' || link from notifications where kind = 'system_alert'), 'system_alert | /admin/prices', 'والإشعار يفتح صفحة الأسعار');
select _eq((select body like '%رقماً محجوزاً منذ أكثر من يومين%' from notifications where kind = 'system_alert'), true,
           'ويذكر ما بقي محجوزاً أكثر من يومين');
delete from notifications where kind = 'system_alert';
update market_quotes set status = 'rejected' where id = 'd0000000-0000-0000-0000-00000000000d';
set role service_role;
select _eq(public.price_feeds_alert('{}'::text[]), 0, 'ولا شيء متوقّفاً ولا قديماً: لا إشعار');
reset role;

\echo 'ج) الدالّتان للخادم وحده'
select _eq(has_function_privilege('authenticated', 'public.market_quotes_publish_trusted(uuid[])', 'execute'), false, 'العضو لا ينشر بها');
select _eq(has_function_privilege('anon', 'public.price_feeds_alert(text[])', 'execute'), false, 'والزائر لا ينبّه بها');

do $$ declare f integer; begin
  select fails into f from _score;
  if f = 0 then raise notice 'ALL CHECKS PASSED'; else raise exception '% CHECK(S) FAILED', f; end if;
end $$;
