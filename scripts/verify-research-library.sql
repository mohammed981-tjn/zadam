-- بوّابةُ مكتبة الدراسات والبحوث (البند ٢٠٢).

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

-- c1 باحثٌ مسجَّل · c2 عضوٌ آخر · f9 مدير
insert into auth.users (id) values
  ('c1000000-0000-0000-0000-0000000000c1'), ('c2000000-0000-0000-0000-0000000000c2'),
  ('f9000000-0000-0000-0000-0000000000f9')
on conflict (id) do nothing;
insert into profiles (id, full_name, role) values
  ('c1000000-0000-0000-0000-0000000000c1', 'الباحث', 'investor'),
  ('c2000000-0000-0000-0000-0000000000c2', 'عضو', 'investor'),
  ('f9000000-0000-0000-0000-0000000000f9', 'المدير', 'admin')
on conflict (id) do update set role = excluded.role;

grant usage on schema public, auth to anon, authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated, service_role;
grant select, update on _who to anon, authenticated, service_role;

\echo ''
\echo 'أ) الكتابة من الخادم وحده، وكلّ ما يكتبه ينتظر المراجعة'

do $$ begin perform _act_as(null); end $$;
set role anon;
do $$ begin
  perform _refuses($q$insert into research_items (kind, title, authors, abstract, link_url, consent)
                      values ('research', 'بحثٌ من الزائر', 'زائر', repeat('ملخّص ', 10), 'https://example.org/a.pdf', true)$q$,
                   'الزائر لا يكتب في الجدول بالمفتاح العامّ');
end $$;
reset role;
set role authenticated;
do $$ begin
  perform _act_as('c1000000-0000-0000-0000-0000000000c1');
  perform _refuses($q$insert into research_items (kind, title, authors, abstract, link_url, consent)
                      values ('research', 'بحثٌ من العضو', 'عضو', repeat('ملخّص ', 10), 'https://example.org/a.pdf', true)$q$,
                   'ولا العضو');
end $$;
reset role;

set role service_role;
do $$
declare v uuid;
begin
  -- What the server writes: a work that asks to be published already starts pending all the same.
  insert into research_items (kind, title, authors, institution, year, crop, state, abstract, file_path, contact,
                              submitted_by, consent, status, published_at)
  values ('feasibility', 'جدوى زراعة السمسم في القضارف', 'الباحث وزملاؤه', 'جامعة القضارف', 2025, 'السمسم', 'القضارف',
          repeat('ملخّص الدراسة ', 6), 'incoming/11111111-1111-1111-1111-111111111111.pdf', '0912000000',
          'c1000000-0000-0000-0000-0000000000c1', true, 'published', now())
  returning id into v;
  perform _eq((select status from research_items where id = v), 'pending', 'الخادم يكتب، وما يكتبه ينتظر مهما طلب');
  perform _eq((select published_at from research_items where id = v), null::timestamptz, 'بلا تاريخ نشر');
  insert into research_items (kind, title, authors, abstract, link_url, consent)
  values ('research', 'بحثٌ برابطٍ من زائر', 'زائرٌ باحث', repeat('ملخّص البحث ', 6), 'https://example.org/b.pdf', true);
end $$;
do $$ begin
  perform _refuses($q$insert into research_items (kind, title, authors, abstract, link_url, consent)
                      values ('research', 'بلا إقرار', 'فلان', repeat('ملخّص ', 10), 'https://example.org/c.pdf', false)$q$,
                   'ولا يُقبل عملٌ بلا إقرارٍ بحقّ نشره');
  perform _refuses($q$insert into research_items (kind, title, authors, abstract, consent)
                      values ('research', 'بلا ملفّ ولا رابط', 'فلان', repeat('ملخّص ', 10), true)$q$,
                   'ولا عملٌ بلا ملفٍّ ولا رابط');
  perform _refuses($q$insert into research_items (kind, title, authors, abstract, file_path, consent)
                      values ('research', 'ملفٌّ خارج مكانه', 'فلان', repeat('ملخّص ', 10), 'c1/../secret.pdf', true)$q$,
                   'ولا ملفٌّ في غير مجلّد الوارد');
  perform _refuses($q$insert into research_items (kind, title, authors, abstract, link_url, consent)
                      values ('research', 'رابطٌ غير آمن', 'فلان', repeat('ملخّص ', 10), 'javascript:alert(1)', true)$q$,
                   'ولا رابطٌ غير https');
  perform _refuses($q$insert into research_items (kind, title, authors, abstract, file_path, consent)
                      values ('research', 'الملفّ نفسه مرّتين', 'فلان', repeat('ملخّص ', 10),
                              'incoming/11111111-1111-1111-1111-111111111111.pdf', true)$q$,
                   'ولا يُسجَّل الملفّ نفسه مرّتين');
end $$;
reset role;

\echo ''
\echo 'ب) قبل المراجعة لا يراه أحدٌ غير الإدارة والمرسِل'

set role anon;
do $$ begin
  perform _eq((select count(*)::int from research_items), 0, 'الزائر لا يرى ما ينتظر');
  perform _refuses($q$select contact from research_items$q$, 'ولا يقرأ وسيلة تواصل المرسِل');
  perform _refuses($q$select submitted_by from research_items$q$, 'ولا معرّفه');
  perform _refuses($q$select review_note from research_items$q$, 'ولا ملاحظة المراجع');
  perform _refuses($q$select * from research_items_pending()$q$, 'ولا ينادي دالّة الانتظار');
end $$;
reset role;
set role authenticated;
do $$ begin
  perform _act_as('c2000000-0000-0000-0000-0000000000c2');
  perform _eq((select count(*)::int from research_items), 0, 'والعضو الآخر لا يراه');
  perform _eq((select count(*)::int from research_pending()), 0, 'ولا يرى قائمة الانتظار');
  perform _eq((select count(*)::int from research_mine()), 0, 'وليس له شيءٌ أرسله');
  perform _act_as('c1000000-0000-0000-0000-0000000000c1');
  perform _eq((select count(*)::int from research_mine()), 1, 'والمرسِل يرى ما أرسل');
  perform _eq((select status from research_mine()), 'pending', 'وأنّه ينتظر');
  perform _refuses(format('select research_review(%L, true)', (select id from research_mine())), 'ولا ينشر عمله بنفسه');
  perform _act_as('f9000000-0000-0000-0000-0000000000f9');
  perform _eq((select count(*)::int from research_pending()), 2, 'والإدارة ترى العملين المنتظرين');
  perform _eq((select contact from research_pending() where title like 'جدوى%'), '0912000000', 'ووسيلة التواصل');
end $$;
reset role;

\echo ''
\echo 'ج) الإدارة تنشر أو تردّ بسبب، ويُخبَر المرسِل'

set role authenticated;
do $$
declare d uuid; v uuid;
begin
  perform _act_as('f9000000-0000-0000-0000-0000000000f9');
  select id into d from research_pending() where title like 'جدوى%';
  select id into v from research_pending() where title like 'بحثٌ برابط%';
  perform research_review(d, true);
  perform _refuses(format('select research_review(%L, false)', v), 'والردّ بلا سبب لا يُقبل');
  perform research_review(v, false, 'الرابط لا يفتح؛ أرسل الملفّ نفسه');
  perform _eq((select count(*)::int from research_pending()), 0, 'فلا يبقى شيءٌ ينتظر');
end $$;
reset role;
do $$ begin perform _act_as(null); end $$;
set role anon;
do $$ begin
  perform _eq((select count(*)::int from research_items), 1, 'والزائر يرى المنشور وحده');
  perform _eq((select title from research_items), 'جدوى زراعة السمسم في القضارف', 'وهو الدراسة المنشورة');
  perform _eq((select published_at is not null from research_items), true, 'بتاريخ نشرها');
end $$;
reset role;
set role authenticated;
do $$ begin
  perform _act_as('c1000000-0000-0000-0000-0000000000c1');
  perform _eq((select status from research_mine()), 'published', 'والمرسِل يرى أنّها نُشرت');
end $$;
reset role;
do $$ begin
  perform _eq((select count(*)::int from notifications where recipient_id = 'c1000000-0000-0000-0000-0000000000c1'
                 and kind = 'research_reviewed' and link like '/library/%' and title like 'نُشر عملك%'), 1,
              'ويُخبَر بإشعارٍ إلى صفحتها');
  perform _eq((select count(*)::int from notifications where kind = 'research_reviewed'), 1,
              'وزائرٌ بلا حساب لا يُخبَر بشيء (لا حساب له)');
  perform _eq((select review_note from research_items where title like 'بحثٌ برابط%'), 'الرابط لا يفتح؛ أرسل الملفّ نفسه',
              'والمردود يحفظ سببه');
  perform _eq(has_function_privilege('anon', 'research_review(uuid,boolean,text)', 'execute'), false,
              'والزائر لا ينادي المراجعة');
  perform _eq(has_function_privilege('authenticated', 'research_items_insert_gate()', 'execute'), false,
              'ولا ينادي أحدٌ حارس الكتابة');
end $$;

do $$
declare n integer;
begin
  select fails into n from _score;
  if n > 0 then raise exception '% فحصاً فشل', n; end if;
end $$;
\echo ''
\echo 'OK'
