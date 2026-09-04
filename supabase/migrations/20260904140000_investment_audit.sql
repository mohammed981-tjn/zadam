-- تأكيدُ الاستثمار: نتيجةٌ صريحة، وسجلٌّ لا يُمحى.
--
-- WHY THIS FUNCTION AND NOT ANOTHER
--
-- `confirm_investment` is the only place in this platform where a click moves
-- money. It decides that an investor now owns shares and that a project has
-- fewer left to sell. Everything else can be re-entered by hand if it goes
-- wrong; this cannot, because the person who paid believes it happened.
--
-- WHAT WAS ALREADY RIGHT — AND IS NOT TOUCHED
--
--   if not is_admin() then raise exception 'not authorized'; end if;
--   select total_shares, shares_sold ... for update;
--   if v_sold + v_shares > v_total then raise exception ...
--
-- Authorization is checked inside the body, not left to the caller. The project
-- row is locked with FOR UPDATE before the sold count is read, so two admins
-- confirming at the same moment cannot both pass the allocation check. Both are
-- correct and both stay exactly as they are.
--
-- THE ONE LINE THAT WAS WRONG
--
--   if v_project_id is null then return; end if;
--
-- That is the whole reason for this migration. The select above it matches only
-- `status = 'pending'`, so this branch is reached when the investment does not
-- exist, or was already confirmed, or was cancelled. In every one of those
-- cases the function returns **void, with no error** — and `src/app/admin/
-- actions.ts` reads "no error" as success and tells the administrator the
-- investment is confirmed.
--
-- The comment already in that file names the disease exactly: «the result was
-- discarded, so every way this can fail looked like success». A previous round
-- fixed the raised errors. It could not fix this one, because there was nothing
-- to catch: the function said nothing at all.
--
-- This is the same trap that caught the row-level security work three separate
-- times, in a different costume: **the absence of an error is not evidence that
-- the thing happened.** There it was a filtered UPDATE touching zero rows; here
-- it is an early RETURN. Both report success by saying nothing.
--
-- SO: THE FUNCTION NOW ANSWERS
--
-- It returns an outcome code, and the caller decides what to show. And every
-- outcome — the refusals included — is written to an append-only log, because
-- «an investor tried to buy 40 shares and 12 were left» is a fact worth keeping,
-- not an error to swallow.

-- ===========================================================================
-- ١) السجلّ — يُضاف إليه ولا يُعدَّل ولا يُحذف
-- ===========================================================================

create table if not exists investment_events (
  id            uuid primary key default gen_random_uuid(),

  -- بلا `references`: السجلُّ يجب أن يبقى بعد حذف الاستثمار أو المشروع، وإلّا
  -- لأمكن محوُ أثرِ محاولةٍ بحذف صفٍّ آخر — وهو أوّلُ ما يفعله مَن يخفي شيئاً.
  investment_id uuid not null,
  project_id    uuid,

  -- مَن فعل. يُؤخذ من الجلسة لا من وسيطٍ يمرّره المستدعي: الفاعلُ لا يوقّع
  -- باسمِ مَن يشاء.
  actor_id      uuid,

  action        text not null default 'confirm'
    check (action in ('confirm')),

  -- النتيجة. `confirmed` وحدها نجاح؛ وما عداها محاولةٌ لم تغيّر شيئاً — وتُحفظ
  -- لأنّها تُخبر عن ضغطٍ على الطلب، أو عن زرٍّ ضُغط مرّتين، أو عن خللٍ في الشاشة.
  outcome       text not null
    check (outcome in ('confirmed', 'not_pending', 'over_allocated')),

  reason        text,

  shares        integer,
  shares_sold_before integer,
  shares_sold_after  integer,

  created_at    timestamptz not null default now()
);

create index if not exists investment_events_investment_idx
  on investment_events (investment_id, created_at desc);

create index if not exists investment_events_recent_idx
  on investment_events (created_at desc);

alter table investment_events enable row level security;

-- تُقرأ للمدير وحده: فيها مبالغُ ومحاولاتُ مستثمرين.
drop policy if exists investment_events_admin_read on investment_events;
create policy investment_events_admin_read on investment_events
  for select using (is_admin());

-- **ولا سياسةَ كتابةٍ لأحد — ولا للمدير.** الصفوفُ تُكتب من داخل الدالّة
-- `security definer` وحدها. سجلُّ تدقيقٍ يستطيع المدقَّقُ عليه أن يكتب فيه
-- ليس سجلَّ تدقيق.

-- ولا تُعدَّل ولا تُحذف. والزنادُ **يرفع خطأً** ولا يبتلع الأمر صامتاً: محاولةُ
-- التعديل نفسُها خبر، ومَن حاول يجب أن يعلم أنّه فشل.
create or replace function investment_events_append_only()
returns trigger
language plpgsql
as $function$
begin
  raise exception 'سجلُّ الاستثمار يُضاف إليه فقط — لا % ', tg_op;
end $function$;

drop trigger if exists investment_events_no_change on investment_events;
create trigger investment_events_no_change
  before update or delete on investment_events
  for each row execute function investment_events_append_only();

-- ===========================================================================
-- ٢) الدالّة — تُرجع ما حدث
-- ===========================================================================

-- الناتجُ يتغيّر من `void` إلى `text`، وهذا لا يقبله `create or replace`،
-- فلا بدّ من الحذف أوّلاً.
--
-- ⚠️ وهنا فخٌّ يستحقّ التسمية: الحذفُ يُسقط قائمةَ الصلاحيات معه، و PostgreSQL
-- يمنح `EXECUTE` لـ `PUBLIC` على كلّ دالّةٍ **جديدة** افتراضياً. فلو اكتُفي
-- بالحذف والإنشاء، لخرجت دالّةُ المال من هذه الهجرة **أوسعَ بابًا** ممّا دخلت.
-- ولذلك تُعاد المنحُ صراحةً في آخر الملفّ.
drop function if exists public.confirm_investment(uuid);

create function public.confirm_investment(p_investment_id uuid)
 returns text
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_project_id uuid;
  v_shares     integer;
  v_status     text;
  v_total      integer;
  v_sold       integer;
begin
  -- التفويضُ كما كان: داخل الجسم، لا في الباب.
  --
  -- ويُرفع خطأً ولا يُقيَّد في السجلّ عمداً. لو قُيِّد، لصار كلُّ حسابٍ مسجَّلٍ
  -- قادراً على ملء جدول التدقيق بنداءاتٍ متكرّرة — وسجلٌّ يستطيع الغريبُ
  -- إغراقَه يفقد قيمتَه ساعةَ يُحتاج إليه.
  if not is_admin() then
    raise exception 'not authorized';
  end if;

  -- الحالةُ تُقرأ صراحةً بدل ترشيحها في WHERE. الفرقُ هو الفرقُ كلُّه: الترشيحُ
  -- يجعل «غيرُ موجود» و«مؤكَّدٌ سلفاً» صفراً من الصفوف، فلا يُميَّز بينهما.
  select i.project_id, i.shares, i.status::text
    into v_project_id, v_shares, v_status
    from investments i
   where i.id = p_investment_id;

  if not found then
    -- لا صفَّ ولا مشروع، فلا شيءَ يُقيَّد عنه بمعنى. والمستدعي يُخبَر.
    return 'not_found';
  end if;

  if v_status <> 'pending' then
    -- الطلبُ نفسُه أُكِّد أو أُلغي من قبل. وهذا هو **الطريقُ الصامتُ سابقاً**:
    -- زرٌّ ضُغط مرّتين، أو لسانان مفتوحان، فيُقال للمدير «تمّ» مرّتين وقد تمّ
    -- مرّةً واحدة.
    insert into investment_events
      (investment_id, project_id, actor_id, outcome, reason, shares)
    values (p_investment_id, v_project_id, auth.uid(), 'not_pending',
            'حالةُ الطلب ' || v_status, v_shares);
    return 'not_pending';
  end if;

  -- القفلُ قبل القراءة، كما كان: تأكيدان متزامنان لا يمرّان معاً.
  select p.total_shares, p.shares_sold
    into v_total, v_sold
    from projects p
   where p.id = v_project_id
     for update;

  if v_sold + v_shares > v_total then
    insert into investment_events
      (investment_id, project_id, actor_id, outcome, reason,
       shares, shares_sold_before, shares_sold_after)
    values (p_investment_id, v_project_id, auth.uid(), 'over_allocated',
            format('طُلبت %s حصة والمتبقّي %s من أصل %s',
                   v_shares, v_total - v_sold, v_total),
            v_shares, v_sold, v_sold);
    return 'over_allocated';
  end if;

  update investments
     set status = 'confirmed'
   where id = p_investment_id and status = 'pending';

  update projects
     set shares_sold = shares_sold + v_shares
   where id = v_project_id;

  insert into investment_events
    (investment_id, project_id, actor_id, outcome,
     shares, shares_sold_before, shares_sold_after)
  values (p_investment_id, v_project_id, auth.uid(), 'confirmed',
          v_shares, v_sold, v_sold + v_shares);

  return 'confirmed';
end $function$;

-- ===========================================================================
-- ٣) الأبواب
-- ===========================================================================

-- يُسحب أوّلاً ما منحه PostgreSQL تلقائياً للدالّة الجديدة، ثمّ يُمنح المطلوب
-- وحده.
revoke all on function public.confirm_investment(uuid) from public, anon;

-- ويبقى `authenticated`: المديرُ نفسُه يحمل هذا الدور، والحارسُ `is_admin()`
-- داخل الجسم لا في الباب. أمّا `anon` فلا مدير فيه أصلاً، فمنحُه تنفيذَ دالّةِ
-- مالٍ توسيعٌ بلا مقابل.
grant execute on function public.confirm_investment(uuid) to authenticated, service_role;

-- ⚠️ ولا تُسحب `is_admin()` ولا `can_see_contract()` عن `anon` رغم أنّهما
-- مفتوحتان له.
--
-- تحقّقتُ قبل كتابة هذا السطر: كلتاهما تُنادى **داخل تعابير سياسات RLS**، وفي
-- PostgreSQL يحتاج الدورُ المنفِّذُ للاستعلام صلاحيةَ `EXECUTE` على أيّ دالّةٍ
-- تستدعيها سياسةٌ تنطبق عليه. وسحبُهما يكسر كلَّ قراءةٍ في المنصّة — قائمةَ
-- المشاريع العامّة أوّلَها. تبدوان ثغرةً في أيّ تدقيقٍ سريع، وليستا كذلك.
