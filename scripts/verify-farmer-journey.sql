-- الرحلةُ الذهبيّة: مزارعٌ يبدأ من لا شيء، ومشترٍ يصل إليه.
--
-- WHY THIS GATE EXISTS, AND WHY IT IS THE ONE THAT WAS MISSING
--
-- Across the three gates written before this one there are 124 checks, and 46
-- of them assert that something is **refused**. Not one of them asserts that a
-- legitimate farmer can finish anything.
--
-- That asymmetry is a real hole, and it is invisible from inside those gates: a
-- platform whose every policy denied every write would pass all 124. Each guard
-- was proved to stop an intruder; none was proved to let the owner through. And
-- the failure mode is not theoretical — it is the ordinary result of tightening
-- a policy by one clause too many, which is exactly what the last several
-- weeks of work has consisted of.
--
-- So this gate never checks a refusal. Every step asserts that the *right*
-- actor, doing the *right* thing, **succeeds** — from an empty database to a
-- published offer with a buyer's interest sitting in the administrator's inbox.
--
-- HOW IT RUNS
--
-- As `authenticated` and `anon`, never as the cluster owner: a superuser
-- bypasses row-level security, so a journey walked as one proves only that the
-- columns exist. The identity is swapped between steps with `_act_as`, the way
-- the real session cookie would change between two people.

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

/*
 * الفاحصُ المقلوب: ينجح حين **يُنفَّذ** الأمر ويمسّ صفّاً.
 *
 * The mirror image of `_refuses`, and the reason this file exists. Two ways to
 * fail: the statement raises (a constraint or a WITH CHECK turned the farmer
 * away), or it runs and touches nothing (a USING clause quietly filtered every
 * row). The second is the dangerous one, because it looks like success to the
 * application — the same silent denial that has now bitten this project four
 * separate times.
 */
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

-- ── الناس ─────────────────────────────────────────────────────────────────
insert into profiles (id, role) values
  ('f0000000-0000-0000-0000-00000000000f', 'farmer'),
  ('ad000000-0000-0000-0000-0000000000ad', 'admin')
on conflict (id) do nothing;

-- ومنحُ Supabase الافتراضيّ: استعمالُ المخطّطين وكاملُ صلاحيات الجداول،
-- وحمايةُ الصفوف هي المرشِّح وحدها.
grant usage on schema public, auth to anon, authenticated;
grant select, insert, update, delete on all tables in schema public to anon, authenticated;
grant usage, select on all sequences in schema public to anon, authenticated;
grant execute on all functions in schema public, auth to anon, authenticated;

\echo ''
\echo '=========================================================================='
\echo 'أ) المزارع يكتب عرضه'
\echo '=========================================================================='

do $$ begin perform _act_as('f0000000-0000-0000-0000-00000000000f'); end $$;
set role authenticated;

do $$
declare v_corridor uuid; v_uom text;
begin
  select id into v_corridor from export_corridors limit 1;
  select code into v_uom from export_uom limit 1;

  perform _eq(v_corridor is not null, true, 'والمرجعياتُ مقروءةٌ له — ممرٌّ واحدٌ على الأقلّ');

  -- ١٢٫٥ وحدة بسعر ٢٠٠٠٠٠ = ٢٥٠٠٠٠٠. والقيمةُ محروسةٌ بقيدٍ عند الكتابة،
  -- فخطأٌ في الحساب هنا يُرفض لا يُخزَّن.
  perform _does(format($f$
    insert into export_offers
      (id, reference, owner_id, corridor_id, quantity, uom_code,
       unit_price_minor, value_minor, status)
    values ('e0000000-0000-0000-0000-00000000000e', 'SD-2026-0001',
            'f0000000-0000-0000-0000-00000000000f', %L, 12.5, %L,
            200000, 2500000, 'draft')$f$, v_corridor, v_uom),
    'ينشئ مسوّدةً باسمه');
end $$;

do $$
begin
  perform _does($f$
    insert into export_offer_origins
      (offer_id, plot_ref, area_hectares, latitude, longitude, boundary)
    values ('e0000000-0000-0000-0000-00000000000e', 'قطعة ١٧', 9.5,
            14.033, 32.533,
            '{"type":"Polygon","coordinates":[[[32.5,14.0],[32.6,14.0],[32.6,14.1],[32.5,14.0]]]}'::jsonb)$f$,
    'ويضيف منشأً — ٩٫٥ هكتار، فالحدودُ مطلوبةٌ ومرفقة');

  perform _does($f$
    insert into export_offer_evidence (offer_id, kind, storage_path, sha256)
    values ('e0000000-0000-0000-0000-00000000000e', 'photo',
            'f0000000-0000-0000-0000-00000000000f/export/a.jpg',
            repeat('a', 64))$f$,
    'ويرفع دليلاً');

  perform _does($f$
    insert into export_offer_custody (offer_id, sequence, occurred_at, place_name)
    values ('e0000000-0000-0000-0000-00000000000e', 1, now() - interval '2 days',
            'مخزن ودمدني')$f$,
    'ويفتح سلسلةَ العهدة');
end $$;

\echo ''
\echo '=========================================================================='
\echo 'ب) يُرسل — والمتطلّباتُ تُجمَّد لحظتَها'
\echo '=========================================================================='

do $$
begin
  perform _does($f$
    update export_offers
       set status = 'submitted', submitted_at = now()
     where id = 'e0000000-0000-0000-0000-00000000000e'$f$,
    'يُرسل عرضه');

  perform _eq((select status from export_offers
                where id = 'e0000000-0000-0000-0000-00000000000e'), 'submitted',
    'والحالةُ صارت مُرسَلاً');

  -- التجميدُ هو ما يحمي المزارعَ من قاعدةٍ تتغيّر بعد إرساله.
  perform _eq((select count(*) > 0 from export_offer_requirements
                where offer_id = 'e0000000-0000-0000-0000-00000000000e'), true,
    'ونسخةُ المتطلّبات جُمِّدت — فلا تتغيّر القاعدةُ تحته بعد الإرسال');
end $$;

\echo ''
\echo '=========================================================================='
\echo 'ج) الموظّف يراجع — يردّ أوّلاً، ثمّ ينشر'
\echo '=========================================================================='

reset role;
do $$ begin perform _act_as('ad000000-0000-0000-0000-0000000000ad'); end $$;
set role authenticated;

do $$
begin
  perform _does($f$
    update export_offers
       set status = 'rejected',
           rejection_reason = 'صورةُ الوزن غير واضحة، أعد رفعها من فضلك',
           reviewed_at = now(), reviewed_by = auth.uid()
     where id = 'e0000000-0000-0000-0000-00000000000e'$f$,
    'الموظّفُ يردّ العرضَ بسببٍ مكتوب');
end $$;

-- والمزارعُ يصلح ويعيد الإرسال — وهذا هو الطريقُ الطبيعيّ، لا الاستثناء.
reset role;
do $$ begin perform _act_as('f0000000-0000-0000-0000-00000000000f'); end $$;
set role authenticated;

/*
 * والطريقُ خطوتان لا واحدة: مردودٌ ← مسوّدة ← مُرسَل.
 *
 * The first run of this gate tried to go straight from `rejected` to
 * `submitted` and was refused — and I took that for a bug, because the write
 * policy does let an owner edit a rejected offer. It is not a bug. The
 * transition table allows `rejected → draft` with the comment «ليُصلح ما ذُكر
 * في السبب ثم يُرسل ثانية», and the trigger clears `reviewed_at` and
 * `reviewed_by` on the way into draft.
 *
 * That step is the point: without it a corrected offer would arrive back at the
 * reviewer still carrying the stamps of the review it just failed, and would
 * read as already approved. So the detour through draft is what keeps a second
 * review honest, and this gate now walks it the way a farmer actually would.
 */
do $$
begin
  perform _does($f$
    update export_offers set status = 'draft'
     where id = 'e0000000-0000-0000-0000-00000000000e'$f$,
    'والمزارعُ يعيده مسوّدةً ليصلحه');

  perform _eq((select reviewed_by is null and reviewed_at is null
                 from export_offers
                where id = 'e0000000-0000-0000-0000-00000000000e'), true,
    'وأثرُ المراجعة السابقة مُسح — فلا يعود إليه مختوماً بمراجعةٍ رسب فيها');

  perform _does($f$
    update export_offers set status = 'submitted', submitted_at = now()
     where id = 'e0000000-0000-0000-0000-00000000000e'$f$,
    'ثمّ يُرسله ثانية');
end $$;

reset role;
do $$ begin perform _act_as('ad000000-0000-0000-0000-0000000000ad'); end $$;
set role authenticated;

do $$
begin
  -- `reviewed_by` من `auth.uid()` لا من وسيط: النشرُ فعلُ إنسانٍ يُعرف اسمُه.
  perform _does($f$
    update export_offers
       set status = 'published', reviewed_at = now(), reviewed_by = auth.uid()
     where id = 'e0000000-0000-0000-0000-00000000000e'$f$,
    'ثمّ ينشره');

  perform _eq((select reviewed_by from export_offers
                where id = 'e0000000-0000-0000-0000-00000000000e'),
    'ad000000-0000-0000-0000-0000000000ad'::uuid,
    'والناشرُ مسمّىً — من الجلسة');
end $$;

\echo ''
\echo '=========================================================================='
\echo 'د) والزائرُ يراه — وهذه هي وظيفةُ المنصّة كلُّها'
\echo '=========================================================================='

reset role;
do $$ begin perform _act_as(null); end $$;   -- زائرٌ بلا حساب
set role anon;

do $$
begin
  -- الفحصُ الذي لا تُغني عنه كلُّ فحوص الرفض: هل يصل المشتري إلى العرض أصلاً؟
  perform _eq((select count(*)::int from export_offers where status = 'published'), 1,
    'زائرٌ بلا حساب يرى العرضَ المنشور');

  perform _eq((select count(*)::int from export_offers where status <> 'published'), 0,
    'ولا يرى ما لم يُنشر — لا مسوّدةً ولا مردوداً');

  perform _does($f$
    insert into export_offer_interests
      (offer_id, buyer_name, buyer_company, buyer_phone, buyer_country,
       quantity_wanted, message)
    values ('e0000000-0000-0000-0000-00000000000e', 'مراد أوزتورك',
            'شركة الأناضول للحبوب', '+905321234567', 'TR',
            500, 'نطلب ٥٠٠ طن، ونحتاج شهادة المنشأ')$f$,
    'ويرسل اهتمامَه بلا حساب — والحسابُ عائقٌ لا فائدة منه هنا');
end $$;

\echo ''
\echo '=========================================================================='
\echo 'هـ) والطلبُ يصل الموظّف — ولا يصل المزارع'
\echo '=========================================================================='

reset role;
do $$ begin perform _act_as('ad000000-0000-0000-0000-0000000000ad'); end $$;
set role authenticated;

do $$
begin
  perform _eq((select count(*)::int from export_offer_interests), 1,
    'الموظّفُ يقرأ طلبَ الاهتمام');
  perform _eq((select buyer_phone from export_offer_interests limit 1),
    '+905321234567', 'وبيانات التواصل كاملة');
  perform _eq((select status from export_offer_interests limit 1), 'new',
    'وحالتُه الابتدائيّةُ مثبَّتة — لا يختارها المرسِل');
end $$;

reset role;
do $$ begin perform _act_as('f0000000-0000-0000-0000-00000000000f'); end $$;
set role authenticated;

do $$
begin
  -- وهذا ليس تضييقاً بل هو نموذجُ العمل: المنصّةُ تبيع الوساطة، فلو رأى
  -- المزارعُ رقمَ المشتري لانتهت الصفقةُ خارجها.
  perform _eq((select count(*)::int from export_offer_interests), 0,
    'والمزارعُ لا يرى رقمَ المشتري — التعريفُ يمرّ بالمنصّة');

  perform _eq((select status from export_offers
                where id = 'e0000000-0000-0000-0000-00000000000e'), 'published',
    'ويرى أنّ عرضَه منشور');
end $$;

reset role;

\echo ''
\echo '=========================================================================='

do $$
declare n integer;
begin
  select fails into n from _score;
  if n > 0 then raise exception 'فشل % فحصاً — رحلةٌ لا تكتمل.', n; end if;
  raise notice 'ALL CHECKS PASSED — الرحلةُ تكتمل';
end $$;
