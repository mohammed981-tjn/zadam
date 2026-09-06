-- بوّابةُ الأخبار: المسوّدةُ لا تُرى، والمنشورُ يُرى، والكاتبُ من الجلسة.
--
-- WHY THIS ONE MATTERS MORE THAN ITS SIZE SUGGESTS
--
-- Every other table on this platform leaks *inward* if its policy is wrong — a
-- farmer sees another farmer's land. This one leaks **outward**: a draft is
-- something the owner wrote and deliberately did not publish, and the row-level
-- policy is the only thing between it and every visitor on the internet.
--
-- And the page that renders it is **cached**. A policy that let a draft through
-- would not leak it once; it would bake it into a cached page served to
-- everyone who arrives next.

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

create or replace function _does(stmt text, label text) returns void
language plpgsql as $$
declare touched integer;
begin
  begin
    execute stmt;
    get diagnostics touched = row_count;
  exception when others then
    perform _fail(label, 'رُفض: ' || sqlerrm);
    return;
  end;
  if touched > 0 then perform _pass(label);
  else perform _fail(label, 'نُفِّذ ولم يمسّ صفّاً — سياسةٌ رشّحت كلَّ شيء بصمت');
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

/* كم خبراً يرى هذا المتظاهر — يُنفَّذ بصلاحيته لا بصلاحية العنقود. */
create or replace function _visible() returns integer
language sql as $$ select count(*)::int from announcements $$;

-- ── الناس ─────────────────────────────────────────────────────────────────
insert into auth.users (id) values
  ('ad000000-0000-0000-0000-0000000000ad'),
  ('ff000000-0000-0000-0000-0000000000ff')
on conflict (id) do nothing;

insert into profiles (id, full_name, role) values
  ('ad000000-0000-0000-0000-0000000000ad', 'المدير',  'admin'),
  ('ff000000-0000-0000-0000-0000000000ff', 'زائرٌ مسجَّل', 'investor')
on conflict (id) do nothing;

grant usage on schema public, auth to anon, authenticated;
grant select, insert, update, delete on all tables in schema public to anon, authenticated;
grant usage, select on all sequences in schema public to anon, authenticated;
grant execute on all functions in schema public, auth to anon, authenticated;

\echo ''
\echo '=========================================================================='
\echo 'أ) المديرُ يكتب — والكاتبُ والتاريخُ من الخادم لا من النموذج'
\echo '=========================================================================='

do $$ begin perform _act_as('ad000000-0000-0000-0000-0000000000ad'); end $$;
set role authenticated;

do $$
begin
  perform _does($q$
    insert into announcements (id, title, body, created_by)
    values ('a1000000-0000-0000-0000-0000000000a1',
            'مسوّدةٌ لم تُنشر',
            'نصٌّ طويلٌ بما يكفي ليعبر القيدَ المكتوب على الجسد.',
            'ff000000-0000-0000-0000-0000000000ff')$q$,
    'المديرُ يكتب مسوّدة');
end $$;

do $$
declare v uuid; d timestamptz;
begin
  select created_by, published_at into v, d from announcements
   where id = 'a1000000-0000-0000-0000-0000000000a1';
  perform _eq(v, 'ad000000-0000-0000-0000-0000000000ad'::uuid,
    'والكاتبُ من الجلسة لا من الحقل المُرسَل');
  perform _eq(d is null, true, 'وتولد غيرَ منشورة');
end $$;

do $$
begin
  perform _refuses($q$
    insert into announcements (title, body, created_by)
    values ('قصير', 'قصير', 'ad000000-0000-0000-0000-0000000000ad')$q$,
    'ونصٌّ أقصرُ من عشرين حرفاً يُرفض');

  perform _refuses($q$
    insert into announcements (title, body, link_path, created_by)
    values ('خبرٌ برابطٍ بلا اسم',
            'نصٌّ طويلٌ بما يكفي ليعبر القيدَ المكتوب على الجسد.',
            '/knowledge', 'ad000000-0000-0000-0000-0000000000ad')$q$,
    'ورابطٌ بلا اسمٍ يُرفض — زرٌّ بلا كلمة');

  perform _refuses($q$
    insert into announcements (title, body, link_path, link_label, created_by)
    values ('خبرٌ برابطٍ خارجيّ',
            'نصٌّ طويلٌ بما يكفي ليعبر القيدَ المكتوب على الجسد.',
            'https://example.com', 'اذهب',
            'ad000000-0000-0000-0000-0000000000ad')$q$,
    'ورابطٌ خارجيٌّ يُرفض — الإعلانُ يقود داخل المنصّة');
end $$;

\echo ''
\echo '=========================================================================='
\echo 'ب) والمسوّدةُ لا يراها أحدٌ سواه — وهذه هي التي تُسرَّب لو أخطأت السياسة'
\echo '=========================================================================='

do $$ begin perform _eq(_visible(), 1, 'المديرُ يرى مسوّدتَه'); end $$;

reset role;
do $$ begin perform _act_as('ff000000-0000-0000-0000-0000000000ff'); end $$;
set role authenticated;
do $$ begin perform _eq(_visible(), 0, 'ومستخدمٌ مسجَّلٌ لا يراها'); end $$;

reset role;
do $$ begin perform _act_as(null); end $$;
set role anon;
do $$ begin perform _eq(_visible(), 0, 'والزائرُ المجهولُ لا يراها'); end $$;

reset role;
do $$ begin perform _act_as('ff000000-0000-0000-0000-0000000000ff'); end $$;
set role authenticated;
do $$
begin
  perform _changes_nothing($q$
    update announcements set published_at = now()
     where id = 'a1000000-0000-0000-0000-0000000000a1'$q$,
    'ولا ينشرها غيرُ المدير — ترشيحٌ صامتٌ لا خطأ');
  perform _changes_nothing($q$
    insert into announcements (title, body, created_by)
    select 'خبرٌ من غير مدير',
           'نصٌّ طويلٌ بما يكفي ليعبر القيدَ المكتوب على الجسد.',
           'ff000000-0000-0000-0000-0000000000ff'$q$,
    'ولا يكتب خبراً أصلاً');
end $$;

\echo ''
\echo '=========================================================================='
\echo 'ج) والنشرُ يُري الجميع — والسحبُ يُخفي ولا يمحو'
\echo '=========================================================================='

reset role;
do $$ begin perform _act_as('ad000000-0000-0000-0000-0000000000ad'); end $$;
set role authenticated;

do $$
begin
  perform _does($q$
    update announcements set published_at = now()
     where id = 'a1000000-0000-0000-0000-0000000000a1'$q$,
    'المديرُ ينشرها');
end $$;

reset role;
do $$ begin perform _act_as(null); end $$;
set role anon;
do $$ begin perform _eq(_visible(), 1, 'فيراها الزائرُ المجهول'); end $$;

-- ومجدولٌ في المستقبل يُقرأ غيرَ منشورٍ حتّى يحلّ وقتُه.
reset role;
insert into announcements (id, title, body, published_at, created_by)
values ('a2000000-0000-0000-0000-0000000000a2', 'خبرٌ مجدول',
        'نصٌّ طويلٌ بما يكفي ليعبر القيدَ المكتوب على الجسد.',
        now() + interval '3 days', 'ad000000-0000-0000-0000-0000000000ad');

do $$ begin perform _act_as(null); end $$;
set role anon;
do $$
begin
  perform _eq(_visible(), 1,
    'والمجدولُ للمستقبل لا يُرى قبل وقته — و`published_at is not null` وحدها كانت ستُظهره');
end $$;

reset role;
do $$ begin perform _act_as('ad000000-0000-0000-0000-0000000000ad'); end $$;
set role authenticated;

do $$
begin
  perform _does($q$
    update announcements set published_at = null
     where id = 'a1000000-0000-0000-0000-0000000000a1'$q$,
    'والمديرُ يسحبها من النشر');
end $$;

reset role;
do $$ begin perform _act_as(null); end $$;
set role anon;
do $$ begin perform _eq(_visible(), 0, 'فتختفي عن الزائر ويبقى نصُّها محفوظاً'); end $$;

reset role;

\echo ''
do $$
declare f integer;
begin
  select fails into f from _score;
  if f = 0 then raise notice 'ALL CHECKS PASSED';
  else raise exception '% CHECK(S) FAILED', f;
  end if;
end $$;
