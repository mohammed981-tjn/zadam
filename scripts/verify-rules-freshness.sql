-- بوّابةُ عمر اللائحة: الصمتُ لا يُقرأ حداثة، والشهادةُ لا تُعدَّل.

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

/* المرشَّحُ بصمتٍ لا يُميَّز عن الناجح إلّا بالعدّ. */
create or replace function _changes_nothing(stmt text, label text) returns void
language plpgsql as $$
declare touched integer;
begin
  begin
    execute stmt;
    get diagnostics touched = row_count;
  exception when others then perform _pass(label || ' — رُفض'); return;
  end;
  if touched = 0 then perform _pass(label || ' — لم يمسّ صفّاً');
  else perform _fail(label, 'مسّ ' || touched || ' صفّاً');
  end if;
end $$;

create or replace function _act_as(p uuid) returns void
language plpgsql as $$ begin update _who set uid = p; end $$;

insert into profiles (id, full_name, role) values
  ('ad000000-0000-0000-0000-0000000000ad', 'موظّف المراجعة', 'admin'),
  ('fa000000-0000-0000-0000-0000000000fa', 'مزارع',          'investor');

grant usage on schema public, auth to anon, authenticated;
grant select, insert, update, delete on all tables in schema public to anon, authenticated;
grant execute on function auth.uid() to anon, authenticated;
grant execute on function public.is_admin() to anon, authenticated;
grant execute on function public.export_corridor_rules_status(uuid) to anon, authenticated;

\echo ''
\echo '=========================================================================='
\echo 'أ) ممرٌّ لم يُراجَع قطّ — متأخّرٌ لا حديث'
\echo '=========================================================================='

do $$
declare v_corridor uuid; r record;
begin
  select id into v_corridor from export_corridors limit 1;

  select * into r from export_corridor_rules_status(v_corridor);

  -- هذا هو الفحصُ الذي يمسك العطبَ الصامت: `null > 180` تساوي false في SQL،
  -- فالصياغةُ الساذجةُ تقول عن ممرٍّ لم يُفحص قطّ إنّه حديث.
  perform _eq(r.stale, true, 'ممرٌّ بلا مراجعةٍ قطّ يُقرأ متأخّراً');
  perform _eq(r.last_reviewed_at is null, true, 'ولا تاريخَ له');
  perform _eq(r.reviewed_count, 0, 'وعددُ مراجعاته صفر');
  perform _eq(r.review_days, 180, 'والمدّةُ من صفٍّ لا من ثابت');
end $$;

\echo ''
\echo '=========================================================================='
\echo 'ب) والإدارةُ وحدها تسجّل مراجعة — بمصدرٍ مكتوب'
\echo '=========================================================================='

do $$ begin perform _act_as('fa000000-0000-0000-0000-0000000000fa'); end $$;
set role authenticated;

do $$
declare v_corridor uuid;
begin
  select id into v_corridor from export_corridors limit 1;
  perform _changes_nothing(format($f$
    insert into export_corridor_reviews (corridor_id, source_note)
    values (%L, 'مزارعٌ يشهد لنفسه بمراجعةٍ لم تقع')$f$, v_corridor),
    'مزارعٌ يسجّل مراجعة');
end $$;

reset role;
do $$ begin perform _act_as('ad000000-0000-0000-0000-0000000000ad'); end $$;
set role authenticated;

do $$
declare v_corridor uuid; r record;
begin
  select id into v_corridor from export_corridors limit 1;

  -- «راجعتُها» بلا مصدرٍ دعوى. والقيدُ يرفض ما دون عشرة أحرف.
  perform _refuses(format($f$
    insert into export_corridor_reviews (corridor_id, source_note)
    values (%L, 'تمّ')$f$, v_corridor),
    'ومراجعةٌ بلا مصدرٍ مكتوب');

  insert into export_corridor_reviews (corridor_id, reviewed_by, source_note, outcome)
  values (v_corridor, 'ad000000-0000-0000-0000-0000000000ad',
          'لائحة الاتّحاد الأوروبي 2026/45 — فُحصت المستنداتُ الثمانية', 'unchanged');

  select * into r from export_corridor_rules_status(v_corridor);
  perform _eq(r.stale, false, 'فلمّا رُوجعت اليومَ لم تعد متأخّرة');
  perform _eq(r.days_since, 0, 'وعمرُها صفرُ يوم');
  perform _eq(r.reviewed_count, 1, 'ومراجعةٌ واحدةٌ في سجلّها');
  perform _eq(r.source_note like 'لائحة الاتّحاد%', true, 'ومصدرُها معها');
end $$;

reset role;

\echo ''
\echo '=========================================================================='
\echo 'ج) والمدّةُ تُغيَّر من صفٍّ فتتغيّر الحالةُ معها'
\echo '=========================================================================='

do $$
declare v_corridor uuid; r record;
begin
  select id into v_corridor from export_corridors limit 1;

  -- مراجعةٌ عمرُها مئتا يوم: حديثةٌ عند ٣٦٥، متأخّرةٌ عند ١٨٠.
  insert into export_corridor_reviews (corridor_id, reviewed_at, source_note)
  values (v_corridor, now() - interval '200 days', 'مراجعةٌ قديمةٌ لاختبار الحدّ');

  -- والأحدثُ هو ما يُقاس عليه، لا الأقدم: فالسجلُّ الآنَ فيه اثنتان.
  select * into r from export_corridor_rules_status(v_corridor);
  perform _eq(r.stale, false, 'والأحدثُ هو ما يُقاس عليه لا الأقدم');
  perform _eq(r.reviewed_count, 2, 'والسجلُّ يحفظ الاثنتين — لا يُستبدل');
end $$;

/*
 * والحدُّ يُختبر على ممرٍّ ثانٍ — لا بحذف مراجعةٍ من الأوّل.
 *
 * كتبتُه أوّلاً بحذف المراجعة الحديثة ليبقى القديمُ وحده، فرفعت البوّابةُ
 * خطأً — والزنادُ هو الذي منعني، وهو الزنادُ الذي كتبتُه في هذه الهجرة نفسِها.
 * فحصٌ يحتاج نقضَ القاعدة التي يفحصها فحصٌ خاطئُ التصميم، لا قاعدةٌ ضيّقة.
 */
do $$
declare v_second uuid; r record;
begin
  select id into v_second from export_corridors offset 1 limit 1;

  insert into export_corridor_reviews (corridor_id, reviewed_at, source_note)
  values (v_second, now() - interval '200 days', 'مراجعةٌ عمرُها مئتا يومٍ لاختبار الحدّ');

  update export_rules_policy set review_days = 365 where id;
  select * into r from export_corridor_rules_status(v_second);
  perform _eq(r.stale, false, 'مراجعةٌ عمرُها ٢٠٠ يومٍ حديثةٌ عند حدِّ ٣٦٥');

  update export_rules_policy set review_days = 180 where id;
  select * into r from export_corridor_rules_status(v_second);
  perform _eq(r.stale, true, 'ومتأخّرةٌ عند ١٨٠ — والحدُّ قاعدةُ عملٍ في صفّ');
  perform _eq(r.days_since, 200, 'وعمرُها معلنٌ بالأيّام');
end $$;

\echo ''
\echo '=========================================================================='
\echo 'د) والشهادةُ لا تُعدَّل ولا تُحذف'
\echo '=========================================================================='

do $$ begin perform _act_as('ad000000-0000-0000-0000-0000000000ad'); end $$;
set role authenticated;

/*
 * والحمايةُ طبقتان مختلفتان، وتُفحصان كلٌّ بسؤالها.
 *
 * كتبتُ الفحصين أوّلاً بـ`_refuses` فسقطا، وكان الظنُّ أنّ الزنادَ لا يعمل.
 * والحقيقةُ أدقّ: لا سياسةَ تحديثٍ ولا حذفٍ على الجدول، فترشّح RLS كلَّ الصفوف
 * عن جلسة المدير — فتنجح الجملةُ ولا تمسّ شيئاً، **ولا يصل الزنادَ صفٌّ ليرفع
 * عليه**.
 *
 * فالمديرُ يُمنع بالسياسة صمتاً، ومن يتجاوز السياسةَ (مفتاحُ الخدمة، أو مالكُ
 * القاعدة) يُمنع بالزناد صراحةً. وفحصٌ واحدٌ لا يرى الطبقتين.
 */
do $$
begin
  perform _changes_nothing($f$
    update export_corridor_reviews set source_note = 'مصدرٌ آخر'$f$,
    'المديرُ يعدّل مراجعةً قديمة — السياسةُ ترشّحها');
  perform _changes_nothing($f$
    delete from export_corridor_reviews$f$,
    'والمديرُ يحذفها');
end $$;

reset role;

-- وبتجاوز السياسة — كما يفعل مفتاحُ الخدمة — يرفع الزنادُ صراحةً.
do $$
begin
  perform _refuses($f$
    update export_corridor_reviews set source_note = 'مصدرٌ آخر'$f$,
    'ومن يتجاوز السياسةَ يرفع عليه الزناد');
  perform _refuses($f$
    delete from export_corridor_reviews$f$,
    'والحذفُ كذلك');
end $$;

do $$
begin
  perform _eq((select count(*)::int from export_corridor_reviews), 3,
    'والسجلُّ باقٍ كما هو — ثلاثُ شهاداتٍ لم تُمسّ');
end $$;

\echo ''
\echo '=========================================================================='
\echo 'هـ) ويقرأ الزائرُ عمرَ اللائحة — فمن يحمل الكلفةَ يرى الحالة'
\echo '=========================================================================='

do $$ begin perform _act_as(null); end $$;
set role anon;

do $$
declare v_corridor uuid; r record;
begin
  select id into v_corridor from export_corridors offset 1 limit 1;
  select * into r from export_corridor_rules_status(v_corridor);
  perform _eq(r.stale, true, 'زائرٌ بلا حساب يرى أنّ اللائحةَ متأخّرة');
  perform _eq((select count(*)::int from export_corridor_reviews), 3,
    'ويقرأ سجلَّ المراجعات');
  perform _eq((select review_days from export_rules_policy), 180,
    'ويقرأ الحدَّ الذي حُكم به');
end $$;

reset role;

\echo ''
\echo '=========================================================================='

do $$
declare f integer;
begin
  select fails into f from _score;
  if f > 0 then raise exception 'فشل % فحصاً.', f; end if;
  raise notice 'ALL CHECKS PASSED — اللائحةُ تُعلن عمرَها ولا تدّعي حداثة';
end $$;
