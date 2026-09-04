-- الشكاوى: ردٌّ آليٌّ بعد ربع ساعة — **إن لم يردّ إنسان**.
--
-- الفكرة مأخوذةٌ من ZadGo، وما أُخذ منه وما لم يُؤخذ
--
-- ZadGo carries `complaints` + `complaint_messages`: a complaint with a thread,
-- statuses, and an administrator who resolves it with a refund decision. That
-- shape is sound and this platform already has its equivalent — `feedback`,
-- with a kind, a status, and `admin_reply`. So no second inbox is built here;
-- two places to look is how a complaint goes unanswered.
--
-- What ZadGo does **not** have is any automatic reply, and its own design note
-- lists the consequence as an open gap: «رقم الشكوى ومدة الرد المتوقّعة ❌ — لا
-- يُعرض شيء بعد الإرسال سوى رسالة نجاح عابرة». A person writes a complaint and
-- then hears nothing, with no way to tell whether anyone saw it. That silence is
-- what this migration closes.
--
-- لماذا ربعُ ساعة، ولماذا ليس فوراً
--
-- This is the whole design and it is worth stating precisely.
--
-- An **instant** machine reply is worse than none. It arrives before any human
-- could have read the complaint, and the writer knows it — so it reads as being
-- brushed off by a machine, and the next complaint does not get written.
--
-- A **delayed** reply that fires only when no human has answered is a different
-- thing. It says: someone had a chance to answer you, nobody did yet, so here is
-- what the platform can tell you meanwhile. The machine covers the silence
-- rather than replacing the person — and on a quiet afternoon when the operator
-- is in a field with no signal, the visitor is still answered.
--
-- So the rule is not "reply after fifteen minutes". It is **"reply after fifteen
-- minutes if and only if nobody has"**, and `record_feedback_auto_reply`
-- re-checks that at the moment it writes, not when the queue was read. A human
-- reply that lands during the model call wins.
--
-- والمدّةُ بياناتٌ لا كود
--
-- Fifteen minutes is the owner's number today and will not be forever — a
-- growing team answers faster, a holiday answers slower. The project's first
-- rule is that no business rule is compiled into the application, so the delay,
-- whether the feature runs at all, and which kinds it covers all live in a row
-- an administrator can change.

-- ===========================================================================
-- ١) السياسة — صفٌّ واحد
-- ===========================================================================

create table if not exists support_policy (
  -- The single-row pattern: a boolean primary key that may only be true. Two
  -- policy rows would mean two answers to "how long do we wait?", and whichever
  -- the query happened to read would be the one that governed.
  id                boolean primary key default true,
  auto_reply_after  interval not null default '15 minutes',
  enabled           boolean  not null default true,

  -- الاقتراحُ لا ينتظر جواباً. المشكلةُ والسؤالُ ينتظران.
  kinds             text[]   not null default array['problem','question'],

  updated_at        timestamptz not null default now(),
  updated_by        uuid references profiles(id),

  constraint support_policy_single_row check (id),
  -- صفرُ دقائق يجعله ردّاً فورياً، وهو ما وُضعت المهلةُ لتفاديه. والحدُّ الأعلى
  -- يمنع مهلةً تُنسي الميزةَ نفسَها.
  constraint support_policy_window
    check (auto_reply_after >= interval '1 minute'
       and auto_reply_after <= interval '24 hours')
);

insert into support_policy (id) values (true) on conflict (id) do nothing;

alter table support_policy enable row level security;

-- تُقرأ للعموم: صفحةُ الملاحظات تعد الزائرَ بمدّة، والوعدُ يُقرأ من الصفّ نفسِه
-- لا من نصٍّ مكتوبٍ في الصفحة قد يخالفه.
drop policy if exists support_policy_read on support_policy;
create policy support_policy_read on support_policy for select using (true);

drop policy if exists support_policy_admin on support_policy;
create policy support_policy_admin on support_policy
  for all using (is_admin()) with check (is_admin());

-- ===========================================================================
-- ٢) أعمدةُ الردّ الآلي — منفصلةٌ عن ردّ الإنسان
-- ===========================================================================

-- عمودٌ مستقلٌّ لا يشارك `admin_reply`. لو كُتب الردُّ الآليّ في العمود نفسِه:
--   • لَما استطاع أحدٌ بعدها أن يعرف أيُّ الردود كتبه إنسانٌ وأيُّها آلة،
--   • ولَما استطاع مديرٌ أن يضيف ردَّه دون أن يمحو ما قرأه الزائرُ سلفاً،
--   • ولَما أمكن قياسُ الميزة: كم شكوى غطّاها الآليُّ وكم بلغت الإنسان.
alter table feedback
  add column if not exists ai_reply        text,
  add column if not exists ai_replied_at   timestamptz,
  add column if not exists ai_reply_engine text;

-- الطابورُ يُقرأ بالأقدم، والفهرسُ جزئيٌّ على ما ينتظر فقط.
create index if not exists feedback_awaiting_auto_reply_idx
  on feedback (created_at)
  where admin_reply is null and ai_reply is null;

-- ===========================================================================
-- ٣) الطابور — ما استحقّ ردّاً آلياً الآن
-- ===========================================================================

create or replace function public.feedback_awaiting_auto_reply(p_limit integer default 10)
 returns table (id uuid, kind text, body text, page_path text, created_at timestamptz)
 language sql
 stable
 security definer
 set search_path to 'public'
as $function$
  select f.id, f.kind, f.body, f.page_path, f.created_at
    from feedback f
   cross join support_policy p
   where p.enabled
     and f.kind = any(p.kinds)
     -- لم يردّ إنسان، ولم تردّ آلة.
     and f.admin_reply is null
     and f.ai_reply is null
     -- ومضت المهلة.
     and f.created_at + p.auto_reply_after <= now()
   order by f.created_at
   limit least(greatest(p_limit, 1), 50);
$function$;

revoke all on function public.feedback_awaiting_auto_reply(integer) from public, anon, authenticated;
grant execute on function public.feedback_awaiting_auto_reply(integer) to service_role;

-- ===========================================================================
-- ٤) الكتابة — تُعيد فحصَ الشرط لحظةَ الكتابة
-- ===========================================================================

-- هذا هو موضعُ الصحّة كلِّه.
--
-- Between reading the queue and writing the answer, a model call takes seconds
-- and sometimes much longer. In that window an administrator may have replied.
-- Checking only at read time would then post a machine answer underneath a
-- human one — the exact thing the fifteen-minute delay exists to prevent.
--
-- So the conditions are repeated in the WHERE clause of the UPDATE itself, and
-- the function reports whether it actually wrote. A caller that trusts "no
-- error" would report success over a write that correctly did not happen.
create or replace function public.record_feedback_auto_reply(
  p_id     uuid,
  p_reply  text,
  p_engine text
)
 returns boolean
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  written integer;
begin
  if coalesce(btrim(p_reply), '') = '' then
    raise exception 'الردّ الآلي فارغ';
  end if;

  update feedback f
     set ai_reply        = left(btrim(p_reply), 4000),
         ai_replied_at   = now(),
         ai_reply_engine = nullif(left(coalesce(p_engine, ''), 64), '')
   where f.id = p_id
     and f.admin_reply is null   -- سبقه إنسان؟ فالإنسانُ أولى.
     and f.ai_reply is null;     -- ولا يُكتب مرّتين.

  get diagnostics written = row_count;
  return written = 1;
end $function$;

revoke all on function public.record_feedback_auto_reply(uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.record_feedback_auto_reply(uuid, text, text) to service_role;
