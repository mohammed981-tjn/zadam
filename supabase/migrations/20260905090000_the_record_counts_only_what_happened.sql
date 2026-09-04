-- السجلُّ لا يعدّ إلّا ما حدث.
--
-- جوازُ المزرعة يبدأ من هنا، لا من صفحةٍ جديدة
--
-- The passport is a public claim about a farm, and every number on it comes
-- from `farmer_season_records`. So before there is a passport, those numbers
-- have to be true — and two of them are not.
--
-- ١) «الانضباط في التوثيق» يعدّ ما ترفضه القاعدةُ نفسُها دليلاً
--
-- `enforce_stage_completion` refuses to close a stage without a file, and says
-- so in the exception it raises:
--
--     «لا يمكن اعتماد المرحلة قبل رفع ملف واحد على الأقل (صورة أو فاتورة) —
--      الملاحظة النصية وحدها ليست دليلاً»
--
--     select count(*) ... from stage_evidence
--      where stage_id = new.id and storage_path is not null;
--
-- And `farmer_season_records` counted the same thing without that condition:
--
--     select count(distinct st.id) from season_stages st
--       join stage_evidence e on e.stage_id = st.id
--
-- `stage_evidence.storage_path` is nullable and `kind` may be `'note'`. So a
-- typed note with no file counted toward «الانضباط في التوثيق» — the heaviest
-- factor in the trust score at twenty-five points — while the trigger three
-- files away refuses to accept that same row as evidence of anything.
--
-- The platform states the rule in the one place it enforces it and contradicts
-- itself in the one place it publishes it. This makes the published number
-- agree with the enforced rule, and the enforced rule was the correct one.
--
-- ٢) «الالتزام بالمواعيد» يعدّ المجهولَ التزاماً
--
--     and (st.actual_end is null or st.actual_end <= st.planned_end)
--
-- A completed stage with no recorded end date counted as on time. Twenty more
-- points. And `actual_end` is written only by `completeStage` in `src/` — the
-- trigger sets `completed_at`, never `actual_end` — so any client speaking to
-- PostgREST directly closes stages with no date at all and scores a perfect
-- record for punctuality it never demonstrated.
--
-- Forty-five of the hundred points could be earned without doing the thing
-- being measured.
--
-- ولماذا المجهولُ يُستبعد ولا يُحتسب تأخيراً
--
-- The tempting fix is to count an undated stage as late. That is the opposite
-- lie: we do not know that it was late, and a score that punishes missing data
-- teaches people to stop recording rather than to record honestly.
--
-- So the function now returns `stages_dated` beside `stages_on_time`, and
-- punctuality is measured over the stages whose dates we actually have. A
-- farmer with no dates gets no punctuality claim — neither credit nor penalty —
-- and the score is renormalised over the factors that do have evidence behind
-- them. What we cannot show, we do not assert.
--
-- ولماذا `drop` لا `create or replace`
--
-- The return type gains a column, and PostgreSQL refuses to replace a function
-- whose `returns table` changed. A drop hands `EXECUTE` back to `PUBLIC` by
-- default — which is exactly the hole `20260903090000` closed, on this very
-- function, because it returns budgets, costs and revenue for any owner id
-- passed to it and asks nothing about who is calling. So the revoke is
-- re-asserted below, in the same migration, and not left to be remembered.

-- ===========================================================================
-- ١) السجلّ — ويعدّ الدليلَ الذي له ملفّ وحده
-- ===========================================================================

drop function if exists public.farmer_season_records(uuid);

create function public.farmer_season_records(p_id uuid)
 returns table (
   season_id            uuid,
   name                 text,
   crop_key             text,
   planting_date        date,
   status               text,
   feddans              numeric,
   planned_budget       numeric,
   actual_costs         numeric,
   revenue              numeric,
   stages_total         integer,
   stages_completed     integer,
   stages_with_evidence integer,
   -- المراحلُ التي نملك مواعيدَها — مقامُ الالتزام. وبدونه كان المجهولُ يدخل
   -- الحسبةَ في صالح صاحبه.
   stages_dated         integer,
   stages_on_time       integer
 )
 language sql
 stable
 security definer
 set search_path to 'public'
as $function$
  select
    s.id,
    s.name,
    s.crop_key,
    s.planting_date,
    s.status,
    s.feddans,
    coalesce((select sum(st.budget) from season_stages st where st.season_id = s.id), 0),
    coalesce((select sum(l.amount) from ledger_entries l
              where l.season_id = s.id and l.category <> 'revenue'), 0),
    coalesce((select sum(l.amount) from ledger_entries l
              where l.season_id = s.id and l.category = 'revenue'), 0),

    (select count(*)::int from season_stages st where st.season_id = s.id),

    (select count(*)::int from season_stages st
      where st.season_id = s.id and st.completed),

    -- والشرطُ الجديد هو شرطُ الزناد حرفاً بحرف: ملفٌّ مرفوع. والملاحظةُ النصّية
    -- تبقى نافعةً للمزارع ولا تُحسب انضباطاً في التوثيق.
    (select count(distinct st.id)::int from season_stages st
       join stage_evidence e on e.stage_id = st.id
      where st.season_id = s.id
        and e.storage_path is not null),

    -- ولا موعدَ بلا خطّةٍ يُقاس عليها. و`planned_end` اليومَ `not null`، فهذا
    -- الشرطُ لا يستبعد صفّاً قائماً — يحرس تغييراً لاحقاً يجعله اختيارياً،
    -- ويمنع أن يعود «المجهولُ التزاماً» من بابٍ آخر.
    (select count(*)::int from season_stages st
      where st.season_id = s.id and st.completed
        and st.actual_end is not null
        and st.planned_end is not null),

    (select count(*)::int from season_stages st
      where st.season_id = s.id and st.completed
        and st.actual_end is not null
        and st.planned_end is not null
        and st.actual_end <= st.planned_end)

  from seasons s
  where s.owner_id = p_id
  order by s.planting_date desc;
$function$;

-- ===========================================================================
-- ٢) والصلاحيّة تُغلق في الهجرة نفسِها
-- ===========================================================================

-- `drop` أعادت `EXECUTE` إلى `PUBLIC` تلقائياً، وهي الثغرةُ التي أُغلقت في
-- `20260903090000` على هذه الدالّة بعينها: تُرجع الميزانيةَ والتكاليفَ
-- والإيرادَ لأيّ معرّفٍ يُمرَّر إليها ولا تسأل عمّن يسأل. فمن يحمل مفتاحَ
-- `anon` — وكلُّ متصفّحٍ يحمله — كان يقرأ المالَ الذي تمتنع الصفحةُ عن طبعه.
revoke all on function public.farmer_season_records(uuid) from public, anon, authenticated;
grant execute on function public.farmer_season_records(uuid) to service_role;
