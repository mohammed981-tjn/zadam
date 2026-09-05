-- اللائحةُ تُعلن عمرَها.
--
-- المسألة
--
-- `export_corridor_requirements` is the one dataset on this platform whose
-- staleness has a physical cost. Yield statistics going out of date make a
-- number less precise; a retired customs requirement going unnoticed makes the
-- platform tell a farmer «جاهز» about a consignment that will be turned back at
-- a border — the exact harm the export corridor was built to prevent.
--
-- And the table records **when a rule takes effect**, never **when a human last
-- checked that it is still the rule**. Those are different facts. A requirement
-- effective from 2018 with no end date is indistinguishable from a requirement
-- nobody has looked at since 2018, and the second is a claim the platform has
-- no basis for. Thirty-five rules across nine corridors, no review date on any
-- of them, and no automation that could supply one: regulation changes by
-- announcement, not by feed.
--
-- ولماذا سجلٌّ لا عمود
--
-- A `last_reviewed_at` column answers "when" and destroys "how often, by whom,
-- against what". A corridor reviewed four times against named sources is in a
-- different condition from one touched once, and a column cannot tell them
-- apart because each write erases the last. The log is append-only for the same
-- reason `investment_events` is: a record of diligence that its own subject can
-- quietly rewrite is not a record of diligence.
--
-- ولماذا يُعرض للمزارع لا للإدارة وحدها
--
-- The person who bears the cost of a stale rule is the one shipping the goods.
-- Telling only the administrators that a corridor is overdue puts the knowledge
-- where the loss is not. So the freshness travels with the number: whoever sees
-- «٧ من ٨» can see what that eight was last checked against, and a corridor past
-- its interval says so in place of implying currency it does not have.
--
-- والمدّةُ صفٌّ لا ثابت — كبقيّة قواعد العمل على هذه المنصّة.

-- ===========================================================================
-- ١) مدّةُ الصلاحية
-- ===========================================================================

create table if not exists export_rules_policy (
  id                 boolean primary key default true check (id),
  review_days        integer not null default 180
                       check (review_days between 1 and 3650),
  note_ar            text
);

insert into export_rules_policy (id, review_days, note_ar)
values (true, 180,
        'ستّةُ أشهر. واللوائحُ تتغيّر بإعلانٍ لا بجدول، فالمدّةُ حدٌّ للتذكير لا وعدٌ بأنّ ما دونها صحيح.')
on conflict (id) do nothing;

alter table export_rules_policy enable row level security;

drop policy if exists export_rules_policy_read on export_rules_policy;
create policy export_rules_policy_read on export_rules_policy
  for select using (true);

drop policy if exists export_rules_policy_admin on export_rules_policy;
create policy export_rules_policy_admin on export_rules_policy
  for all using (is_admin()) with check (is_admin());

-- ===========================================================================
-- ٢) سجلُّ المراجعات — يُلحَق ولا يُعدَّل
-- ===========================================================================

create table if not exists export_corridor_reviews (
  id           uuid primary key default gen_random_uuid(),
  corridor_id  uuid not null references export_corridors(id) on delete cascade,
  reviewed_at  timestamptz not null default now(),
  reviewed_by  uuid references profiles(id),
  -- ما رُوجع عليه. «راجعتُها» بلا مصدرٍ دعوى، و«راجعتُها على لائحة الاتّحاد
  -- الأوروبي 2026/45» شيءٌ يستطيع غيري أن يتحقّق منه.
  source_note  text not null check (length(btrim(source_note)) >= 10),
  outcome      text not null default 'unchanged'
                 check (outcome in ('unchanged', 'amended')),
  created_at   timestamptz not null default now()
);

create index if not exists export_corridor_reviews_corridor_idx
  on export_corridor_reviews (corridor_id, reviewed_at desc);

alter table export_corridor_reviews enable row level security;

-- تُقرأ للعموم: المشتري الذي يقرأ «٧ من ٨» من حقّه أن يعرف متى فُحصت الثمانية.
drop policy if exists export_corridor_reviews_read on export_corridor_reviews;
create policy export_corridor_reviews_read on export_corridor_reviews
  for select using (true);

drop policy if exists export_corridor_reviews_insert on export_corridor_reviews;
create policy export_corridor_reviews_insert on export_corridor_reviews
  for insert with check (is_admin());

-- ولا سياسةَ تحديثٍ ولا حذف، عمداً. وزنادٌ يرفع بدل أن يصمت: صفٌّ يشهد بأنّ
-- أحداً فحص شيئاً في تاريخ، إن جاز تعديلُه لم يعد شهادة.
create or replace function public.export_corridor_reviews_append_only()
 returns trigger
 language plpgsql
as $function$
begin
  raise exception 'سجلُّ مراجعات الممرّات يُلحَق ولا يُعدَّل ولا يُحذف — سجّل مراجعةً جديدة بدل تغيير قديمة';
end $function$;

drop trigger if exists export_corridor_reviews_immutable on export_corridor_reviews;
create trigger export_corridor_reviews_immutable
  before update or delete on export_corridor_reviews
  for each row execute function export_corridor_reviews_append_only();

-- ===========================================================================
-- ٣) حالةُ القواعد — متى رُوجعت، وهل تأخّرت
-- ===========================================================================

-- تُرجع صفّاً دائماً، حتى لممرٍّ لم يُراجَع قطّ: و`never_reviewed` ليست
-- «حديثة»، بل أسوأُ من متأخّرة — لأنّ المتأخّرةَ فُحصت مرّةً على الأقلّ.
create or replace function public.export_corridor_rules_status(p_corridor_id uuid)
 returns table (
   last_reviewed_at timestamptz,
   reviewed_count   integer,
   days_since       integer,
   review_days      integer,
   stale            boolean,
   source_note      text
 )
 language sql
 stable
 security definer
 set search_path to 'public'
as $function$
  select
    r.last_at,
    coalesce(r.n, 0)::int,
    case when r.last_at is null then null
         else (current_date - r.last_at::date)::int end,
    p.review_days,
    -- بلا مراجعةٍ قطّ = متأخّرة. والصمتُ لا يُقرأ حداثة.
    case when r.last_at is null then true
         else (current_date - r.last_at::date) > p.review_days
    end,
    r.last_note
  from (select review_days from export_rules_policy where id) p
  left join lateral (
    select max(reviewed_at) as last_at,
           count(*)         as n,
           (select source_note from export_corridor_reviews x
             where x.corridor_id = p_corridor_id
             order by x.reviewed_at desc limit 1) as last_note
      from export_corridor_reviews
     where corridor_id = p_corridor_id
  ) r on true;
$function$;

grant execute on function public.export_corridor_rules_status(uuid) to anon, authenticated, service_role;
