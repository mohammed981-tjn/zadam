-- رحلةُ المستثمر: يرى مشروعاً، ويشتري حصّة، ويتابعها — وحدَه.
--
-- WHY THIS ONE IS SEPARATE FROM verify-investment-audit
--
-- That gate proves what `confirm_investment` refuses and what it records. It
-- never asks whether an investor can create an investment in the first place —
-- it inserts the rows itself, as the cluster owner, with row-level security
-- bypassed entirely.
--
-- So the whole investment product could be unreachable to every actual investor
-- and all 32 of its checks would still pass. This walks the other half: a real
-- `authenticated` session, a real `anon` visitor, and the real policies from
-- `20260817120000_document_existing_policies_and_guards.sql` — not policies
-- invented by the fixture, which would be the gate grading its own homework.
--
-- WHAT THE MONEY RULE ACTUALLY IS
--
-- An investor may create only a `pending` investment, only for themselves. The
-- move from pending to confirmed is not theirs at all — it belongs to
-- `confirm_investment`, which checks `is_admin()` inside its own body. The
-- checks below prove both halves: that the investor gets through the first
-- door, and that the second one does not open for them.

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
  exception when others then perform _pass(label || ' — رُفض'); return;
  end;
  perform _fail(label, 'نُفِّذ وكان يجب أن يُرفض');
end $$;

-- ينجح حين يُنفَّذ الأمرُ **ويمسّ صفّاً**. سياسةٌ ترشّح كلَّ شيء تُنفَّذ بلا خطأ،
-- فتقرؤها الشاشةُ نجاحاً — وهذا هو الفشلُ الذي لا تراه فحوصُ الرفض.
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
  if touched > 0 then perform _pass(label || ' — مسّ ' || touched || ' صفّاً');
  else perform _fail(label, 'نُفِّذ ولم يمسّ صفّاً — سياسةٌ رشّحت كلَّ شيء بصمت');
  end if;
end $$;

create or replace function _act_as(p uuid) returns void
language plpgsql as $$ begin update _who set uid = p; end $$;

insert into profiles (id, full_name, role) values
  ('ad000000-0000-0000-0000-0000000000ad', 'موظّف المراجعة', 'admin'),
  ('11100000-0000-0000-0000-000000000111', 'مستثمر أوّل',   'investor'),
  ('22200000-0000-0000-0000-000000000222', 'مستثمر ثانٍ',   'investor');

grant usage on schema public, auth to anon, authenticated;
grant select, insert, update, delete on all tables in schema public to anon, authenticated;
grant usage, select on all sequences in schema public to anon, authenticated;
grant execute on all functions in schema public, auth to anon, authenticated;

\echo ''
\echo '=========================================================================='
\echo 'أ) المدير يفتح مشروعاً'
\echo '=========================================================================='

do $$ begin perform _act_as('ad000000-0000-0000-0000-0000000000ad'); end $$;
set role authenticated;

do $$
begin
  perform _does($f$
    insert into projects
      (id, slug, name, location, total_feddans, price_per_share,
       total_shares, shares_sold, status)
    values ('99900000-0000-0000-0000-000000000999', 'sennar-sorghum',
            'ذرة سنّار', 'ولاية سنّار', 400, 500, 100, 0, 'open')$f$,
    'المديرُ ينشئ مشروعاً مفتوحاً');

  -- ومسوّدةٌ لا تُعرض: مشروعٌ لم يُراجَع بعد ليس معروضاً على أحد.
  perform _does($f$
    insert into projects
      (id, slug, name, location, total_feddans, price_per_share,
       total_shares, status)
    values ('88800000-0000-0000-0000-000000000888', 'draft-plot',
            'مشروعٌ قيد الإعداد', 'ولاية النيل الأبيض', 100, 500, 50, 'draft')$f$,
    'ومسوّدةً لم تُفتح بعد');
end $$;

\echo ''
\echo '=========================================================================='
\echo 'ب) والزائرُ يتصفّح — قبل أن يسجّل'
\echo '=========================================================================='

reset role;
do $$ begin perform _act_as(null); end $$;
set role anon;

do $$
begin
  -- بابُ المنصّة التجاريّ: مَن لا حسابَ له يجب أن يرى ما يُستثمر فيه، وإلّا
  -- طُلب منه أن يسجّل ليعرف فيمَ يسجّل.
  perform _eq((select count(*)::int from projects), 1,
    'زائرٌ بلا حساب يرى المشروعَ المفتوح');
  perform _eq((select slug from projects), 'sennar-sorghum',
    'وهو المفتوحُ لا المسوّدة');

  -- ولا يستثمر: لا هويّةَ له تُنسب إليها حصّة.
  perform _refuses($f$
    insert into investments (project_id, investor_id, shares, amount)
    values ('99900000-0000-0000-0000-000000000999',
            '11100000-0000-0000-0000-000000000111', 5, 2500)$f$,
    'ولا يشتري حصّةً باسم غيره');
end $$;

\echo ''
\echo '=========================================================================='
\echo 'ج) المستثمر يشتري — لنفسه، ومعلّقاً'
\echo '=========================================================================='

reset role;
do $$ begin perform _act_as('11100000-0000-0000-0000-000000000111'); end $$;
set role authenticated;

do $$
begin
  perform _does($f$
    insert into investments (id, project_id, investor_id, shares, amount)
    values ('aa000000-0000-0000-0000-0000000000aa',
            '99900000-0000-0000-0000-000000000999',
            '11100000-0000-0000-0000-000000000111', 20, 10000)$f$,
    'المستثمرُ يسجّل حصّةً باسمه');

  perform _eq((select status::text from investments
                where id = 'aa000000-0000-0000-0000-0000000000aa'), 'pending',
    'وتبدأ معلّقةً — لا مؤكَّدةً');

  -- والسياسةُ تثبّت الحالةَ الابتدائية، فلا يُسجّل أحدٌ حصّةً مؤكَّدةً لنفسه.
  perform _refuses($f$
    insert into investments (project_id, investor_id, shares, amount, status)
    values ('99900000-0000-0000-0000-000000000999',
            '11100000-0000-0000-0000-000000000111', 5, 2500, 'confirmed')$f$,
    'ولا يسجّلها مؤكَّدةً ابتداءً');

  -- ولا باسم غيره.
  perform _refuses($f$
    insert into investments (project_id, investor_id, shares, amount)
    values ('99900000-0000-0000-0000-000000000999',
            '22200000-0000-0000-0000-000000000222', 5, 2500)$f$,
    'ولا باسم مستثمرٍ آخر');

  -- ولا يؤكّد نفسَه: التأكيدُ فعلُ الإدارة، والدالّةُ تحرسه من الداخل.
  perform _refuses(
    $f$select confirm_investment('aa000000-0000-0000-0000-0000000000aa')$f$,
    'ولا يؤكّد حصّتَه بنفسه');
end $$;

\echo ''
\echo '=========================================================================='
\echo 'د) ويرى حصّتَه وحدها'
\echo '=========================================================================='

do $$
begin
  perform _eq((select count(*)::int from investments), 1,
    'يرى استثمارَه');
end $$;

reset role;
do $$ begin perform _act_as('22200000-0000-0000-0000-000000000222'); end $$;
set role authenticated;

do $$
begin
  perform _eq((select count(*)::int from investments), 0,
    'ومستثمرٌ آخر لا يرى شيئاً — المحفظةُ خاصّة');
end $$;

\echo ''
\echo '=========================================================================='
\echo 'هـ) المدير يؤكّد — فتتحرّك الحصص'
\echo '=========================================================================='

reset role;
do $$ begin perform _act_as('ad000000-0000-0000-0000-0000000000ad'); end $$;
set role authenticated;

do $$
declare r text;
begin
  select confirm_investment('aa000000-0000-0000-0000-0000000000aa') into r;
  perform _eq(r, 'confirmed', 'المديرُ يؤكّد');

  perform _eq((select shares_sold from projects
                where id = '99900000-0000-0000-0000-000000000999'), 20,
    'والمباعُ صار ٢٠');

  perform _eq((select count(*)::int from investment_events
                where outcome = 'confirmed'), 1,
    'والحدثُ مقيَّدٌ في سجلّ التدقيق');
end $$;

\echo ''
\echo '=========================================================================='
\echo 'و) والمستثمر يرى حصّتَه مؤكَّدة'
\echo '=========================================================================='

reset role;
do $$ begin perform _act_as('11100000-0000-0000-0000-000000000111'); end $$;
set role authenticated;

do $$
begin
  perform _eq((select status::text from investments
                where id = 'aa000000-0000-0000-0000-0000000000aa'), 'confirmed',
    'المستثمرُ يرى حصّتَه مؤكَّدة');

  -- ولا يقرأ سجلَّ التدقيق: فيه محاولاتُ غيره ومبالغُهم.
  perform _eq((select count(*)::int from investment_events), 0,
    'ولا يقرأ سجلَّ التدقيق');
end $$;

reset role;

\echo ''
\echo '=========================================================================='

do $$
declare n integer;
begin
  select fails into n from _score;
  if n > 0 then raise exception 'فشل % فحصاً — رحلةٌ لا تكتمل.', n; end if;
  raise notice 'ALL CHECKS PASSED — رحلةُ المستثمر تكتمل';
end $$;
