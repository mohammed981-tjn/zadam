-- ما ينمو بلا سقفٍ يُقلَّم — وحدُّ المعدّل يكفّ عن مسح يومٍ في كلّ نداء.
--
-- WHAT THE MEASUREMENT FOUND
--
-- `docs/consumption-2026-09-06.md` measured production rather than guessing at
-- it: 32 MB of 500 in `public`, and the largest table by far is FAOSTAT
-- reference data that does not grow. Storage is not the pressure.
--
-- Three things do grow without a ceiling, and two of them are here.
--
-- ١. حدُّ المعدّل كان يمسح يوماً كاملاً في كلّ نداء
--
-- `check_assistant_rate_limit` opened with:
--
--     delete from assistant_requests where created_at < now() - interval '1 day';
--
-- With five rows that is free. With a hundred thousand requests a day it is a
-- full-table delete **per question a visitor asks** — the roadmap has carried
-- it as item ٤ since 18 August. Housekeeping belongs on a schedule, not on the
-- hot path of the thing it is housekeeping for.
--
-- ٢. وعدُّه ثمّ إدراجُه لم يكونا ذرّيّين
--
-- This is the half the roadmap named but nobody had fixed: the function counted
-- in one statement and inserted in another. Two concurrent requests from the
-- same address both read four and both proceed, so a limit of "five a minute"
-- becomes six or seven exactly when the traffic that justifies it arrives.
--
-- `pg_advisory_xact_lock` serialises per address, and costs nothing when
-- addresses differ — which is the ordinary case. The lock is transaction-scoped
-- so it releases on commit or on error without a release path to forget.
--
-- ٣. وجدولان يكبران إلى الأبد
--
-- `assistant_questions` keeps a row per question **with the full answer text**;
-- `system_checks` keeps a row per scheduled run. Neither had a retention rule.
--
-- WHAT IS KEPT, AND WHY THE RULE IS NOT "DELETE OLD ROWS"
--
-- `assistant_questions` is not a log. It is the gap list that `/admin/analytics`
-- is built on, and the record of which answers became knowledge entries. So the
-- rule keeps exactly what is still useful:
--
--   • unanswered questions — those ARE the gaps, and they are the point
--   • promoted questions   — the provenance of a knowledge entry
--   • everything else, for ninety days
--
-- A three-month-old answered question nobody promoted is not going to be
-- promoted. Keeping it costs storage and lengthens the list the administrator
-- has to read, which is the more expensive of the two.

-- ═══════════════════════════════════════════════════════════════════════════
-- ١. حدُّ المعدّل: ذرّيٌّ، وبلا كنسٍ في المسار الساخن
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.check_assistant_rate_limit(p_ip text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_recent_count integer;
begin
  if p_ip is null or length(p_ip) = 0 or length(p_ip) > 64 then
    raise exception 'check_assistant_rate_limit: invalid client address'
      using errcode = '22023';
  end if;

  -- والقفلُ على العنوان لا على الجدول: طلبان من عنوانٍ واحدٍ يصطفّان، وطلبان
  -- من عنوانين لا يلتقيان أصلاً. وهو قفلُ معاملةٍ يُفكّ بالإيداع أو بالخطأ،
  -- فلا مسارَ إطلاقٍ يُنسى.
  perform pg_advisory_xact_lock(hashtext(p_ip));

  select count(*) into v_recent_count
  from assistant_requests
  where ip = p_ip and created_at > now() - interval '1 minute';

  if v_recent_count >= 5 then
    return false;
  end if;

  insert into assistant_requests (ip) values (p_ip);
  return true;
end;
$$;

-- الصلاحياتُ تُعاد تأكيدُها: `create or replace` يحفظها، لكنّ تأكيدَها هنا
-- يجعل الهجرةَ تصفُ الحالةَ النهائيّة كاملةً بدل أن تعتمد على ما سبقها.
revoke all on function public.check_assistant_rate_limit(text)
  from public, anon, authenticated;
grant execute on function public.check_assistant_rate_limit(text) to service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- ٢. التقليم — دالّةٌ واحدةٌ تناديها المهمّةُ اليوميّة
-- ═══════════════════════════════════════════════════════════════════════════
--
-- تُرجع ما حذفته لا مجرّد نجاح: مهمّةٌ مجدولةٌ تقول «تمّ» ولا تقول «ماذا» هي
-- مهمّةٌ لا يلاحظ أحدٌ توقّفَها.
create or replace function public.prune_ephemeral_rows()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_requests  integer;
  v_questions integer;
  v_checks    integer;
begin
  delete from assistant_requests
   where created_at < now() - interval '1 day';
  get diagnostics v_requests = row_count;

  -- ما لم يُجَب فجوةٌ تُحفظ، وما رُقّي سندُ مُدخلٍ في قاعدة المعرفة يُحفظ،
  -- وما سواهما يُقلَّم بعد تسعين يوماً.
  delete from assistant_questions
   where answered
     and promoted_at is null
     and created_at < now() - interval '90 days';
  get diagnostics v_questions = row_count;

  delete from system_checks
   where checked_at < now() - interval '90 days';
  get diagnostics v_checks = row_count;

  return jsonb_build_object(
    'assistant_requests',  v_requests,
    'assistant_questions', v_questions,
    'system_checks',       v_checks
  );
end;
$$;

revoke all on function public.prune_ephemeral_rows() from public, anon, authenticated;
grant execute on function public.prune_ephemeral_rows() to service_role;
