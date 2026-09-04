-- حفظُ جواب المساعد · وإغلاقُ run_system_check عن الزائر.
--
-- بندان يلتقيان في مبدأ واحد: كلاهما نقطةُ RPC كان الزائرُ يملك تنفيذَها،
-- وكلاهما يُغلق **بعد** أن ينتقل مُنادِيه إلى عميل الإدارة، لا قبله.
--
-- ============================================================================
-- ١) جوابُ المساعد يُحفظ — الميزةُ التي أرادها المالك ونصفُها كان ناقصاً
-- ============================================================================
--
-- The owner described the feature as: a visitor asks, and when the answer is
-- not in the base the assistant finds one and stores it. Half of that was
-- built. `log_assistant_question` recorded the question, how many entries
-- matched, whether it was answered and by which layer — and threw the answer
-- away. So the same question asked tomorrow was paid for twice, and the work
-- of finding it was lost.
--
-- WHY THE ANSWER IS NOT WRITTEN STRAIGHT INTO knowledge_entries
--
-- Because that table's value is that every row carries where it came from —
-- `source_country`, `source_note` — and the site promises the visitor an
-- «إجابة موثّقة». Pouring model output into it unattributed would fill the base
-- with what nobody vouches for, and within a month the assistant would be
-- citing itself. So the answer is parked beside its question and an
-- administrator promotes it, adding the source, through one gate — the same
-- gate this platform already puts in front of opportunities and land records.
--
-- WHY THE FUNCTION IS DROPPED AND RECREATED RATHER THAN OVERLOADED
--
-- Adding a defaulted fifth parameter creates a *second* function in PostgreSQL,
-- not a replacement — and the four-argument one would keep its anon grant,
-- leaving the door this migration exists to close standing wide open beside the
-- new one.

alter table assistant_questions
  add column if not exists answer_text   text,
  add column if not exists promoted_at   timestamptz,
  add column if not exists promoted_by   uuid references profiles(id),
  add column if not exists promoted_entry_id uuid references knowledge_entries(id) on delete set null;

-- الفجوةُ تُقرأ كثيراً والمُعتمَدُ قليل، فالفهرسُ جزئيّ.
create index if not exists assistant_questions_gap_idx
  on assistant_questions (created_at desc)
  where promoted_at is null;

drop function if exists public.log_assistant_question(text, integer, boolean, text);

create or replace function public.log_assistant_question(
  p_question text,
  p_matched  integer,
  p_answered boolean,
  p_source   text default null::text,
  p_answer   text default null::text
)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  insert into assistant_questions
    (question, matched_entries, answered, answer_source, answer_text)
  values (
    left(coalesce(p_question, ''), 500),
    greatest(0, coalesce(p_matched, 0)),
    coalesce(p_answered, true),
    nullif(left(coalesce(p_source, ''), 32), ''),
    -- The answer is clamped too. This column is read by an administrator
    -- deciding whether to publish it, and an unbounded field is a place to
    -- paste something enormous at no cost to the sender.
    nullif(left(coalesce(p_answer, ''), 4000), '')
  );
end $function$;

-- ============================================================================
-- ٢) الأبواب — تُغلق بعد أن انتقل المُنادي، لا قبله
-- ============================================================================

-- `log_assistant_question`: كان `anon` يملك تنفيذها، وكان ذلك **صحيحاً** ما دام
-- الطريقُ ينادِيها بعميل الجلسة. وقد قلتُ للمالك حينها إنّ سحبَها يكسر ميزته،
-- وكان ذلك صحيحاً في حينه. الآن انتقل الطريقُ إلى عميل الإدارة، فصار السحبُ
-- آمناً — والترتيبُ هو الفرق، لا الحكم.
--
-- ولماذا يجب أن يُسحب الآن تحديداً: صارت الدالّةُ تحمل **جواباً** قد يعتمده
-- مديرٌ ويدخل قاعدةَ المعرفة. فنقطةٌ مفتوحةٌ للعموم تكتب أزواجَ سؤالٍ وجوابٍ
-- ملفّقة هي طريقُ حقنٍ إلى القاعدة عبر شاشة الاعتماد. والبوّابةُ البشرية تبقى
-- الحارسَ الأخير، لكنّ حارساً أخيراً لا يُغني عن بابٍ مغلق.
revoke all on function public.log_assistant_question(text, integer, boolean, text, text)
  from public, anon, authenticated;
grant execute on function public.log_assistant_question(text, integer, boolean, text, text)
  to service_role;

-- `run_system_check`: مسجَّلةٌ في هجرة توثيق الدوال الخمس، ومنادِيها الوحيد
-- `/api/health` — وهي مهمّةٌ مجدولة بلا جلسة، فكانت تعمل بصلاحية `anon` وحدها.
--
-- وما كانت تسرّبه: عددَ حسابات الإدارة (و«صفر» جوابٌ يستحقّ المعرفة لمن ينوي
-- سوءاً)، وكم طلباً ينتظر مراجعة، وكم فرصةً نُشرت دون اعتماد — وهي الأرقامُ
-- نفسُها التي وُضعت سياسةُ `system_checks_admin_read` لحجبها. وليست قراءةً
-- فقط: كلُّ نداءٍ يُدخل صفّاً ويُجري حذفاً على الجدول، بلا حدٍّ لمعدّله.
--
-- انتقل الطريقُ إلى عميل الإدارة في هذه الدفعة نفسِها، فالسحبُ يغلق الباب
-- المباشر دون أن يوقف المهمّة.
revoke all on function public.run_system_check() from public, anon, authenticated;
grant execute on function public.run_system_check() to service_role;

-- ============================================================================
-- ٣) اعتمادُ الجواب مُدخلَ معرفة — بدالّة، لا بإدراجٍ من الشاشة
-- ============================================================================

-- Two writes that must not come apart: the entry is created and the question is
-- marked promoted with a pointer to it. Done from the screen as two calls, a
-- failure between them leaves either an orphan entry nobody knows the origin
-- of, or a question marked promoted with nothing to show.
--
-- SECURITY DEFINER with an explicit is_admin() check rather than relying on the
-- caller's policies: the function writes to two tables whose policies differ,
-- and one refusal returning zero rows in the middle of the pair is exactly the
-- silent half-write this platform has been bitten by.
create or replace function public.promote_assistant_answer(
  p_question_id  uuid,
  p_crop         text,
  p_topic        text,
  p_title        text,
  p_content      text,
  p_source_note  text,
  p_source_country text default null
)
 returns uuid
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  new_id uuid;
  already uuid;
begin
  if not is_admin() then
    raise exception 'الاعتماد للإدارة وحدها';
  end if;

  if coalesce(btrim(p_title), '') = '' or coalesce(btrim(p_content), '') = '' then
    raise exception 'العنوان والمحتوى مطلوبان';
  end if;

  -- المصدرُ إلزاميٌّ هنا وإن كان العمودُ يقبل الفراغ. هذا هو الفرقُ كلُّه بين
  -- قاعدةِ معرفةٍ وبين مكبٍّ لنصوصِ نموذج: مُدخلٌ بلا مصدرٍ يجعل المساعدَ بعد
  -- شهرٍ يستشهد بنفسه.
  if coalesce(btrim(p_source_note), '') = '' then
    raise exception 'المصدر مطلوب — مُدخلٌ بلا مصدرٍ لا يدخل قاعدة المعرفة';
  end if;

  select promoted_entry_id into already
    from assistant_questions where id = p_question_id;
  if already is not null then
    raise exception 'هذا السؤال اعتُمد من قبل';
  end if;

  insert into knowledge_entries
    (crop, topic, title, content, source_note, source_country, created_by)
  values (
    coalesce(nullif(btrim(p_crop), ''), 'عام'),
    p_topic,
    btrim(p_title),
    btrim(p_content),
    btrim(p_source_note),
    nullif(btrim(coalesce(p_source_country, '')), ''),
    auth.uid()
  )
  returning id into new_id;

  update assistant_questions
     set promoted_at = now(),
         promoted_by = auth.uid(),
         promoted_entry_id = new_id
   where id = p_question_id;

  return new_id;
end $function$;

revoke all on function public.promote_assistant_answer(uuid, text, text, text, text, text, text)
  from public, anon;
grant execute on function public.promote_assistant_answer(uuid, text, text, text, text, text, text)
  to authenticated, service_role;
