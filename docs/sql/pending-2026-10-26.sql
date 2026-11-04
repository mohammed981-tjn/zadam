-- ما لم يُطبَّق على قاعدة الموقع من الهجرات، بالترتيب، مبنيٌّ بـ scripts/build-pending-sql.py لا باليد.
-- معاملةٌ واحدة: إن توقّف عند خطأ لا يُطبَّق شيءٌ منه.
-- يُطبَّق لاحقاً لا الآن:
--   20261025200300_visitor_writes_through_server.sql: بعد نشر الكود: يسحب الكتابة المباشرة في نموذجَي التواصل، والموقع القديم يكتب فيهما مباشرة
--   20261026040000_admin_second_factor.sql: الرمز الثاني للإدارة: بعد أن يتأكّد المالك أنّ TOTP مفعّل ويقرّر (الكود يعمل بدونه: الدور وحده يقرّر)
begin;

-- ═══ 20261025160000_ledger_review_fixes.sql ═══
-- ═══════════════════════════════════════════════════════════════════════════
-- إصلاحات مراجعة دفتر الحسابات (البند ١٩٨، الموجة ١ — أ١ إلى أ٩ ما عدا ما يغيّر ما يراه الناس)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- كلّ بندٍ هنا ثبت بتجربةٍ على قاعدةٍ مؤقّتة (docs/review-198-ar.md)، ومعه فحصٌ في scripts/verify-ledger-review.sql
-- يُعيد العيب فيسقط:
--
--   أ١  المدير كان يكتب في دفتر موسم أيّ مزارع (سياسة ledger_own لكلّ العمليّات، للمالك «أو المدير»)، والزناد
--       يرحّل ما يكتبه إلى دفتر مزرعة ذلك المزارع. الرقابة تقرأ ولا تكتب: الكتابة لصاحب الموسم وحده، والقراءة
--       كما كانت (صاحبه والمدير والشريك بسياسته). وحارس الموسم المُقفَل يسري على المدير في دفتر موسمه هو أيضاً.
--   أ٢  ledger_integrity كانت تعطي المدير مجاميع كلّ دفترٍ بعينه (مدينه ودائنه وعدد قيوده) بلا فحصٍ ولا إشعار.
--       الآن: دفتر المنصّة كاملاً، ومن دفاتر الناس **المعطوبُ وحده** بمعرّفه وعدد قيوده المعطوبة، بلا مبالغ ولا
--       أعداد — فيفتح المدير فحصاً بسببٍ على ما يحتاجه.
--   أ٣  حجب الأقلّ من ٥ دفاتر كان يُهزم بطرح مدَيين متداخلين (١–١٩ ثمّ ١–٢٠ = حركة يومٍ واحد، وقد تكون دفتراً
--       واحداً)، أو بطرح يومين من أيّام الشهر الجاري، أو بطرح قراءتين في زمنين لشهرٍ مضى (قيدٌ متأخّر واحد).
--       الآن تُحسب الإحصاءات **بشهر تسجيل القيد** (بتوقيت الخرطوم) و**للأشهر التي انتهت وحدها**، بأشهرٍ كاملة:
--       الشهر الذي انتهى لا يدخله قيدٌ بعد انتهائه، فرقمه ثابتٌ لا يتغيّر بين قراءتين، ولا جزءَ شهرٍ يُطرح من جزء.
--       وكذلك المطابقة بين الذمّتين: حتى آخر شهرٍ انتهى، بما سُجّل حتى نهايته.
--   أ٤  عكسُ قيد تسويةٍ يدويّاً (ledger_reverse) كان يُبقي قيد فرق الصرف فيتضاعف، وأ٥ عكسُ قيدٍ آليٍّ يدويّاً كان
--       يُسقطه من الدفتر ولا تعيده المزامنة. القيود التي يكتبها النظام لا تُعكس يدويّاً: يُعدَّل الأصل أو يُحذف من
--       دفتر الموسم، أو يُلغى السداد، أو يُلغى القيد المتقابل باتّفاق الطرفين. والمزامنة تعيد ترحيل ما لا ترحيلَ
--       قائماً له (لا ما لم يُرحَّل قطّ وحده).
--   أ٦  إغلاق الموسم أثناء تسجيل تكلفة يترك مالاً في «محاصيل قيد النموّ»: الترحيل يقرأ الموسم بقفلٍ مشترك، فينتظر
--       الإغلاق الجاري ويقرأ حالته بعده، أو يُنهي قبله فيرى الإغلاق قيده.
--   أ٧  مزيج العملات كان يحكم على الشهر كلّه، فخليّة عملةٍ يساهم فيها دفترٌ واحد تظهر حصّتها. الآن كلّ خليّة
--       (شهر × عملة) بالقاعدتين، وإن حُجبت خليّةٌ حُجب الشهر كلّه (وإلا عُرفت من الباقي: ١٠٠ − الظاهر).
--   أ٨  oversight_links وoversight_stale بلا قاعدة «لا يغلب عقدٌ واحد» — أُضيفت (بالمبلغ في الأولى وبالعدد في الثانية).
--   أ٩  مبلغٌ سالب أو أقلّ من سنتٍ في دفتر الموسم كان يُحفظ ولا يُرحَّل ولا يُرفض: يُرفض الآن بسبب.
--
-- لا حذفَ لبيانات: سياساتٌ ودوالّ تُستبدل، وقيدٌ يُضاف (بيانات الإنتاج تحقّقه: ٥ صفوف، لا سالب ولا أقلّ من سنت).
-- ═══════════════════════════════════════════════════════════════════════════

-- ── أ١: الكتابة في دفتر الموسم لصاحبه وحده ──────────────────────────────────

drop policy ledger_own on public.ledger_entries;

create policy ledger_read on public.ledger_entries
  for select to authenticated
  using (exists (select 1 from public.seasons s
                  where s.id = ledger_entries.season_id
                    and (s.owner_id = (select auth.uid()) or (select is_admin()))));

create policy ledger_owner_insert on public.ledger_entries
  for insert to authenticated
  with check (exists (select 1 from public.seasons s
                       where s.id = ledger_entries.season_id and s.owner_id = (select auth.uid())));

create policy ledger_owner_update on public.ledger_entries
  for update to authenticated
  using (exists (select 1 from public.seasons s
                  where s.id = ledger_entries.season_id and s.owner_id = (select auth.uid())))
  with check (exists (select 1 from public.seasons s
                       where s.id = ledger_entries.season_id and s.owner_id = (select auth.uid())));

create policy ledger_owner_delete on public.ledger_entries
  for delete to authenticated
  using (exists (select 1 from public.seasons s
                  where s.id = ledger_entries.season_id and s.owner_id = (select auth.uid())));

-- The closed-season guard held for everyone signed in but the administrator; an administrator who farms is a farmer
-- in his own book. Only the service key (no one signed in) passes, as before.
create or replace function public.ledger_entries_history_gate()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare v_status text;
begin
  if auth.uid() is not null then
    if tg_op = 'UPDATE' and new.season_id is distinct from old.season_id then
      raise exception 'لا يُنقل قيدٌ إلى موسمٍ آخر.';
    end if;
    select status into v_status from seasons where id = old.season_id;
    if v_status = 'completed' then
      raise exception 'دفتر موسمٍ أُقفل لا يُعدَّل ولا يُحذف منه شيء؛ أضِف قيداً مصحِّحاً.';
    end if;
  end if;
  return case tg_op when 'DELETE' then old else new end;
end;
$$;

-- ── أ٩: لا مبلغ أقلّ من سنت ─────────────────────────────────────────────────

-- Runs after ledger_entries_prepare (triggers fire in name order), so it judges the dollar figure the row will keep.
create function public.ledger_entries_positive()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.amount is null or new.amount < 0.01 then
    raise exception 'المبلغ أقلّ من سنتٍ واحد أو سالب؛ اكتب المبلغ الصحيح (والتصحيح قيدٌ جديد أو تعديل القيد نفسه)';
  end if;
  return new;
end $$;

create trigger ledger_entries_prepare_positive
  before insert or update on public.ledger_entries
  for each row execute function public.ledger_entries_positive();

alter table public.ledger_entries
  add constraint ledger_entries_amount_positive check (amount >= 0.01);

revoke execute on function public.ledger_entries_positive() from public, anon, authenticated, service_role;

-- ── أ٢: سلامة الدفاتر بلا مجاميع أحد ────────────────────────────────────────

create or replace function public.ledger_integrity()
returns table (
  book_id             uuid,
  kind                text,
  entries             bigint,
  lines               bigint,
  debit_total         bigint,
  credit_total        bigint,
  unbalanced_entries  bigint,
  entries_under_two_lines bigint,
  ok                  boolean
)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
begin
  if not is_admin() then
    raise exception 'للإدارة وحدها';
  end if;
  return query
  with per_entry as (
    select e.book_id, e.id,
           coalesce(sum(l.base_minor) filter (where l.side = 'D'), 0) as d,
           coalesce(sum(l.base_minor) filter (where l.side = 'C'), 0) as c,
           count(l.id) as n
      from public.journal_entries e
      left join public.journal_lines l on l.entry_id = e.id
     group by e.book_id, e.id
  ), per_book as (
    select p.book_id,
           count(*) as entries,
           sum(p.n) as lines,
           sum(p.d) as d,
           sum(p.c) as c,
           count(*) filter (where p.d <> p.c) as unbalanced,
           count(*) filter (where p.n < 2) as empty
      from per_entry p
     group by p.book_id
  ), judged as (
    select b.id, b.kind, b.created_at,
           coalesce(pb.entries, 0)::bigint as entries, coalesce(pb.lines, 0)::bigint as lines,
           coalesce(pb.d, 0)::bigint as d, coalesce(pb.c, 0)::bigint as c,
           coalesce(pb.unbalanced, 0)::bigint as unbalanced, coalesce(pb.empty, 0)::bigint as empty,
           (coalesce(pb.d, 0) = coalesce(pb.c, 0) and coalesce(pb.unbalanced, 0) = 0 and coalesce(pb.empty, 0) = 0) as ok
      from public.ledger_books b
      left join per_book pb on pb.book_id = b.id
  )
  -- The platform's own book in full; of everyone else's, only a book that fails, and only how it fails.
  select j.id, j.kind,
         case when j.kind = 'platform' then j.entries end,
         case when j.kind = 'platform' then j.lines end,
         case when j.kind = 'platform' then j.d end,
         case when j.kind = 'platform' then j.c end,
         j.unbalanced, j.empty, j.ok
    from judged j
   where j.kind = 'platform' or not j.ok
   order by j.kind, j.created_at;
end $$;

-- ── أ٣: الأشهر المنتهية وحدها، بشهر تسجيل القيد ────────────────────────────

-- The day a ledger record was made, in Khartoum — the month a figure belongs to. A month that is over takes no more.
create function public._oversight_day(p_at timestamptz)
returns date
language sql
immutable
set search_path = public
as $$ select (p_at at time zone 'Africa/Khartoum')::date $$;

-- The whole months the asked range touches, cut at the last month that is over: (from, to), or to < from if none.
create function public._oversight_window(p_from date, p_to date)
returns table (w_from date, w_to date)
language sql
stable
set search_path = public
as $$
  select date_trunc('month', p_from)::date,
         least((date_trunc('month', p_to) + interval '1 month - 1 day')::date,
               (date_trunc('month', public.ledger_today()) - interval '1 day')::date)
$$;

create or replace function public.oversight_flows(p_from date, p_to date)
returns table (
  period       date,
  metric       text,
  label_ar     text,
  value_minor  bigint,
  books        integer,
  entries      integer,
  suppressed   boolean
)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  s public.oversight_settings;
  v_from date;
  v_to   date;
begin
  if auth.uid() is not null and not is_admin() then
    raise exception 'للإدارة وحدها';
  end if;
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 1100 then
    raise exception 'مدىً غير صالح (حتى ثلاث سنوات)';
  end if;
  select * into s from public.oversight_settings;
  select w.w_from, w.w_to into v_from, v_to from public._oversight_window(p_from, p_to) w;

  return query
  with cells as (
    select date_trunc('month', public._oversight_day(e.created_at))::date as period,
           m.metric,
           l.book_id,
           sum(case when m.direction = 'debit'
                    then (case l.side when 'D' then l.base_minor else -l.base_minor end)
                    else (case l.side when 'C' then l.base_minor else -l.base_minor end) end)::bigint as v,
           count(distinct e.id)::integer as n
      from public.journal_lines l
      join public.journal_entries e on e.id = l.entry_id
      join public.ledger_books b on b.id = l.book_id and b.kind in ('farm', 'investor')
      join public.ledger_accounts a on a.id = l.account_id and a.book_id = l.book_id
      join public.oversight_metrics m on m.book_kind = b.kind and m.system_key = a.system_key
     where public._oversight_day(e.created_at) between v_from and v_to
     group by 1, 2, l.book_id
  ), agg as (
    select c.period, c.metric,
           sum(c.v)::bigint as total,
           count(*) filter (where c.v <> 0)::integer as books,
           sum(c.n)::integer as entries,
           coalesce(max(abs(c.v)), 0) as top,
           coalesce(sum(abs(c.v)), 0) as sum_abs
      from cells c
     group by 1, 2
  ), labels as (
    select om.metric, min(om.label_ar) as label_ar from public.oversight_metrics om group by om.metric
  ), judged as (
    select a.*, (a.books >= s.min_books and (a.sum_abs = 0 or a.top::numeric / a.sum_abs <= s.max_top_share)) as shown
      from agg a
  )
  select j.period, j.metric, l.label_ar,
         case when j.shown then j.total end,
         case when j.shown then j.books end,
         case when j.shown then j.entries end,
         not j.shown
    from judged j
    join labels l on l.metric = j.metric
   order by j.period, j.metric;
end $$;

-- ── أ٧: مزيج العملات، كلّ خليّةٍ بالقاعدتين ─────────────────────────────────

create or replace function public.oversight_currency_mix(p_from date, p_to date)
returns table (
  period     date,
  currency   text,
  share_pct  integer,
  suppressed boolean
)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  s public.oversight_settings;
  v_from date;
  v_to   date;
begin
  if auth.uid() is not null and not is_admin() then
    raise exception 'للإدارة وحدها';
  end if;
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 1100 then
    raise exception 'مدىً غير صالح (حتى ثلاث سنوات)';
  end if;
  select * into s from public.oversight_settings;
  select w.w_from, w.w_to into v_from, v_to from public._oversight_window(p_from, p_to) w;

  return query
  with cells as (
    select date_trunc('month', public._oversight_day(e.created_at))::date as period, l.currency, l.book_id,
           sum(l.base_minor)::numeric as vol
      from public.journal_lines l
      join public.journal_entries e on e.id = l.entry_id
      join public.ledger_books b on b.id = l.book_id and b.kind in ('farm', 'investor')
      join public.ledger_accounts a on a.id = l.account_id and a.book_id = l.book_id
      join public.oversight_metrics m on m.book_kind = b.kind and m.system_key = a.system_key
     where public._oversight_day(e.created_at) between v_from and v_to
     group by 1, 2, 3
  ), per_cur as (
    -- Each (month, currency) cell by both rules: enough books, and none of them most of it.
    select c.period, c.currency, sum(c.vol) as vol,
           (count(*) filter (where c.vol <> 0) >= s.min_books
            and (sum(c.vol) = 0 or max(c.vol) / sum(c.vol) <= s.max_top_share)) as ok
      from cells c
     group by 1, 2
  ), month_ok as (
    -- One cell withheld withholds its month: with the others shown it would be a hundred less their sum.
    select pc.period, bool_and(pc.ok) as shown, sum(pc.vol) as total
      from per_cur pc
     group by pc.period
  )
  select pc.period, pc.currency,
         case when mo.shown and mo.total > 0 then round(100 * pc.vol / mo.total)::integer end,
         not mo.shown
    from per_cur pc
    join month_ok mo on mo.period = pc.period
   order by pc.period, pc.currency;
end $$;

-- ── أ٨: القيود المتقابلة بقاعدة الهيمنة، وبأشهرٍ كاملة منتهية ──────────────

create or replace function public.oversight_links(p_from date, p_to date)
returns table (
  kind       text,
  status     text,
  links      bigint,
  agreements bigint,
  amount_usd_minor bigint,
  suppressed boolean
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  s public.oversight_settings;
  v_from date;
  v_to   date;
begin
  if auth.uid() is not null and not is_admin() then
    raise exception 'للإدارة وحدها';
  end if;
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 1100 then
    raise exception 'مدىً غير صالح';
  end if;
  select * into s from public.oversight_settings;
  select w.w_from, w.w_to into v_from, v_to from public._oversight_window(p_from, p_to) w;
  return query
  with per_agreement as (
    select l.kind, l.status, l.agreement_id, count(*)::bigint as n,
           coalesce(sum(case when l.currency = 'USD' then l.amount_minor
                             when l.fx_rate is not null then public.ledger_to_base(l.amount_minor, l.fx_rate)
                             else 0 end), 0)::bigint as total
      from public.ledger_links l
     where public._oversight_day(l.created_at) between v_from and v_to
     group by l.kind, l.status, l.agreement_id
  ), x as (
    select pa.kind, pa.status, sum(pa.n)::bigint as n, count(*)::bigint as people,
           sum(pa.total)::bigint as total, coalesce(max(abs(pa.total)), 0) as top, coalesce(sum(abs(pa.total)), 0) as sum_abs
      from per_agreement pa
     group by pa.kind, pa.status
  ), judged as (
    select x.*, (x.people >= s.min_books and (x.sum_abs = 0 or x.top::numeric / x.sum_abs <= s.max_top_share)) as shown
      from x
  )
  select j.kind, j.status,
         case when j.shown then j.n end,
         case when j.shown then j.people end,
         case when j.shown then j.total end,
         not j.shown
    from judged j
   order by j.kind, j.status;
end $$;

create or replace function public.oversight_stale(p_days integer default 7)
returns table (
  what       text,
  items      bigint,
  agreements bigint,
  oldest_days integer,
  suppressed boolean
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  s public.oversight_settings;
begin
  if auth.uid() is not null and not is_admin() then
    raise exception 'للإدارة وحدها';
  end if;
  if p_days is null or p_days < 1 or p_days > 365 then
    raise exception 'مدىً غير صالح';
  end if;
  select * into s from public.oversight_settings;
  return query
  with per_agreement as (
    select 'pending_link'::text as w, l.agreement_id, count(*)::bigint as n,
           max(extract(day from now() - l.created_at))::integer as oldest
      from public.ledger_links l
     where l.status = 'pending' and l.created_at < now() - make_interval(days => p_days)
     group by l.agreement_id
    union all
    select 'pending_reversal', l.agreement_id, count(*)::bigint,
           max(extract(day from now() - r.created_at))::integer
      from public.ledger_link_reversals r
      join public.ledger_links l on l.id = r.link_id
     where r.status = 'pending' and r.created_at < now() - make_interval(days => p_days)
     group by l.agreement_id
  ), x as (
    select w.w,
           coalesce(sum(pa.n), 0)::bigint as n,
           count(pa.agreement_id)::bigint as people,
           coalesce(max(pa.oldest), 0)::integer as oldest,
           coalesce(max(pa.n), 0) as top
      from (values ('pending_link'::text), ('pending_reversal')) w(w)
      left join per_agreement pa on pa.w = w.w
     group by w.w
  ), judged as (
    -- An empty cell shows no one, so it is shown as empty; a cell with few agreements behind it, or one agreement
    -- holding most of its items, is withheld.
    select x.*, (x.n = 0 or (x.people >= s.min_books and x.top::numeric / nullif(x.n, 0) <= s.max_top_share)) as shown
      from x
  )
  select j.w,
         case when j.shown then j.n end,
         case when j.shown then j.people end,
         case when j.shown then j.oldest end,
         not j.shown
    from judged j
   order by j.w;
end $$;

-- The two sides as at the end of the last month that is over (or of the month asked, if earlier), counting what was
-- recorded by then: a figure that a later reading cannot move, so no two readings tell one book's entry.
create or replace function public.oversight_reconcile(p_as_of date default null)
returns table (
  due_to_partner_minor  bigint,
  due_from_farmer_minor bigint,
  difference_minor      bigint,
  farm_books            integer,
  investor_books        integer,
  suppressed            boolean
)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  s public.oversight_settings;
  v_to date;
begin
  if auth.uid() is not null and not is_admin() then
    raise exception 'للإدارة وحدها';
  end if;
  select * into s from public.oversight_settings;
  -- The asked day if it ends a month, else the end of the month before it; never past the last month that is over.
  v_to := least((date_trunc('month', coalesce(p_as_of, public.ledger_today()) + 1) - interval '1 day')::date,
                (date_trunc('month', public.ledger_today()) - interval '1 day')::date);
  return query
  with bal as (
    select b.kind, l.book_id,
           sum(case when b.kind = 'farm' then (case l.side when 'C' then l.base_minor else -l.base_minor end)
                    else (case l.side when 'D' then l.base_minor else -l.base_minor end) end)::bigint as v
      from public.journal_lines l
      join public.journal_entries e on e.id = l.entry_id
      join public.ledger_books b on b.id = l.book_id and b.kind in ('farm', 'investor')
      join public.ledger_accounts a on a.id = l.account_id and a.book_id = l.book_id
     where e.entry_date <= v_to and public._oversight_day(e.created_at) <= v_to
       and ((b.kind = 'farm' and a.system_key = 'due_to_partner') or (b.kind = 'investor' and a.system_key = 'due_from_farmer'))
     group by b.kind, l.book_id
  ), agg as (
    select coalesce(sum(v) filter (where kind = 'farm'), 0)::bigint     as farm_total,
           coalesce(sum(v) filter (where kind = 'investor'), 0)::bigint as inv_total,
           count(*) filter (where kind = 'farm' and v <> 0)::integer     as farm_n,
           count(*) filter (where kind = 'investor' and v <> 0)::integer as inv_n,
           coalesce(max(abs(v)) filter (where kind = 'farm'), 0)     as farm_top,
           coalesce(max(abs(v)) filter (where kind = 'investor'), 0) as inv_top,
           coalesce(sum(abs(v)) filter (where kind = 'farm'), 0)     as farm_sum,
           coalesce(sum(abs(v)) filter (where kind = 'investor'), 0) as inv_sum
      from bal
  ), judged as (
    select a.*,
           (a.farm_n >= s.min_books and a.inv_n >= s.min_books
            and (a.farm_sum = 0 or a.farm_top::numeric / a.farm_sum <= s.max_top_share)
            and (a.inv_sum = 0 or a.inv_top::numeric / a.inv_sum <= s.max_top_share)) as shown
      from agg a
  )
  select case when j.shown then j.farm_total end,
         case when j.shown then j.inv_total end,
         case when j.shown then j.farm_total - j.inv_total end,
         case when j.shown then j.farm_n end,
         case when j.shown then j.inv_n end,
         not j.shown
    from judged j;
end $$;

-- The monthly posting into the platform's statistical accounts follows: by default the month that ended last (the
-- month under way has no figure yet), and never a month still under way.
create or replace function public.oversight_snapshot(p_month date default null)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_today  date := public.ledger_today();
  v_months date[];
  v_month  date;
  v_book   uuid;
  v_closed date;
  r        record;
  v_posted bigint;
  v_delta  bigint;
  v_src    uuid;
  v_date   date;
  v_n      integer := 0;
  v_seq    integer;
begin
  if auth.uid() is not null and not is_admin() then
    raise exception 'للإدارة وحدها';
  end if;

  v_months := case when p_month is null
                   then array[(date_trunc('month', v_today) - interval '1 month')::date]
                   else array[date_trunc('month', p_month)::date] end;
  if v_months[1] >= date_trunc('month', v_today)::date then
    raise exception 'الشهر الجاري لا يُسجَّل قبل أن ينتهي';
  end if;

  v_book := public._ledger_open_book(null, 'platform');
  perform public._ledger_sync_chart(v_book);
  select closed_through into v_closed from public.ledger_books where id = v_book;

  foreach v_month in array v_months loop
    for r in
      select f.metric, f.label_ar, f.value_minor, f.books
        from public.oversight_flows(v_month, (v_month + interval '1 month - 1 day')::date) f
       where not f.suppressed
    loop
      v_src := md5(to_char(v_month, 'YYYY-MM') || ':' || r.metric)::uuid;

      select coalesce(sum(case l.side when 'C' then l.base_minor else -l.base_minor end), 0)
        into v_posted
        from public.journal_entries je
        join public.journal_lines l on l.entry_id = je.id
        join public.ledger_accounts a on a.id = l.account_id and a.book_id = l.book_id
       where je.book_id = v_book and je.source_type = 'oversight' and je.source_id = v_src
         and a.system_key = 'oversight_' || r.metric;

      v_delta := r.value_minor - v_posted;
      if v_delta = 0 then
        continue;
      end if;

      select count(*) + 1 into v_seq from public.journal_entries
       where book_id = v_book and source_type = 'oversight' and source_id = v_src;
      -- The month's own last day, unless the book is closed past it.
      v_date := greatest((v_month + interval '1 month - 1 day')::date, coalesce(v_closed, date '2000-01-01') + 1);

      perform public._ledger_post_src(
        v_book, v_date,
        left('إحصاء ' || to_char(v_month, 'YYYY-MM') || ' — ' || r.label_ar, 500),
        jsonb_build_array(
          jsonb_build_object('key', case when v_delta > 0 then 'memo_contra' else 'oversight_' || r.metric end,
                             'side', 'D', 'currency', 'USD', 'minor', abs(v_delta),
                             'memo', 'دفاتر مساهِمة: ' || r.books::text),
          jsonb_build_object('key', case when v_delta > 0 then 'oversight_' || r.metric else 'memo_contra' end,
                             'side', 'C', 'currency', 'USD', 'minor', abs(v_delta))),
        'oversight:' || to_char(v_month, 'YYYY-MM') || ':' || r.metric || ':' || v_seq::text,
        null, 'oversight', v_src, null, auth.uid(), null);
      v_n := v_n + 1;
    end loop;
  end loop;
  return v_n;
end $$;

-- ── أ٤ وأ٥: ما يكتبه النظام لا يُعكس يدويّاً ────────────────────────────────

create or replace function public.ledger_reverse(
  p_entry  uuid,
  p_reason text,
  p_date   date default null,
  p_key    text default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_type text;
begin
  if auth.uid() is null then
    raise exception 'سجّل الدخول أولاً';
  end if;
  select e.source_type into v_type
    from public.journal_entries e
    join public.ledger_books b on b.id = e.book_id
   where e.id = p_entry and (b.owner_id = auth.uid() or (b.kind = 'platform' and is_admin()));
  if not found then
    raise exception 'ليس هذا قيدك';
  end if;
  -- What the platform posts for a row elsewhere is undone where that row lives, or the two drift apart.
  if v_type in ('season_entry', 'season_close') then
    raise exception 'هذا القيد من دفتر الموسم: عدّل السطر أو احذفه هناك، فيُعكس هنا وحده';
  elsif v_type in ('season_entry_settle', 'season_entry_settle_fx') then
    raise exception 'هذا قيد سداد: ألغِ السداد من دفتر الموسم، فيُعكس مع فرق صرفه';
  elsif v_type = 'ledger_link' then
    raise exception 'هذا قيدٌ متقابل مع شريكك: يُلغى باتّفاقكما من صفحة القيود المتقابلة';
  elsif v_type = 'oversight' then
    raise exception 'هذا قيدٌ إحصائيّ يتبع مجاميع الشبكة ولا يُعكس يدويّاً';
  end if;
  return public._ledger_reverse(p_entry, p_reason, p_date, p_key, auth.uid());
end $$;

-- A simple-ledger row is posted again when it has no standing posting — never posted, or posted and reversed outside
-- its own change — and not only when it was never posted at all.
create or replace function public.farm_book_sync()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  n integer := 0;
  s uuid;
begin
  for r in
    select le.id, le.created_by,
           exists (select 1 from public.journal_entries je where je.source_type = 'season_entry' and je.source_id = le.id) as posted_before
      from public.ledger_entries le
     where le.amount > 0
       and public._farm_mirror_current(le.id) is null
     order by le.entry_date, le.created_at
  loop
    if public._farm_mirror_post(
         r.id,
         case when r.posted_before then 'season_entry:' || r.id::text || ':sync:' || gen_random_uuid()::text
              else 'season_entry:' || r.id::text end,
         r.created_by) is not null then
      n := n + 1;
    end if;
  end loop;
  for s in select id from public.seasons where status = 'completed' loop
    perform public._farm_trueup(s, null);
  end loop;
  return n;
end $$;

-- The reconciliation counts a row as unposted by the same rule.
create or replace function public.farm_book_reconcile()
returns table (
  season_id        uuid,
  simple_costs     bigint,
  book_costs       bigint,
  simple_revenue   bigint,
  book_revenue     bigint,
  unposted_rows    bigint
)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
begin
  if auth.uid() is not null and not is_admin() then
    raise exception 'للإدارة وحدها';
  end if;
  return query
  with simple as (
    select le.season_id,
           coalesce(sum(round(le.amount * 100)) filter (where le.category <> 'revenue'), 0)::bigint as costs,
           coalesce(sum(round(le.amount * 100)) filter (where le.category = 'revenue'), 0)::bigint as revenue,
           count(*) filter (where le.amount > 0 and public._farm_mirror_current(le.id) is null) as unposted
      from public.ledger_entries le
     group by le.season_id
  ), book as (
    select l.season_id,
           coalesce(sum(case l.side when 'D' then l.base_minor else -l.base_minor end)
                    filter (where a.system_key in ('cost_seeds','cost_fertiliser','cost_pesticide','cost_labour',
                                                   'cost_irrigation','cost_transport','cost_other')), 0)::bigint as costs,
           coalesce(sum(case l.side when 'C' then l.base_minor else -l.base_minor end)
                    filter (where a.system_key = 'sales_crops'), 0)::bigint as revenue
      from public.journal_lines l
      join public.ledger_accounts a on a.id = l.account_id and a.book_id = l.book_id
     where l.season_id is not null
     group by l.season_id
  )
  select s.season_id, s.costs, coalesce(b.costs, 0), s.revenue, coalesce(b.revenue, 0), s.unposted
    from simple s
    left join book b on b.season_id = s.season_id
   where s.costs <> coalesce(b.costs, 0) or s.revenue <> coalesce(b.revenue, 0) or s.unposted > 0
   order by s.season_id;
end $$;

-- ── أ٦: الترحيل ينتظر إغلاق الموسم الجاري ───────────────────────────────────

create or replace function public._farm_mirror_post(p_id uuid, p_key text, p_actor uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  r        public.ledger_entries;
  v_season public.seasons;
  v_minor  bigint;
  v_cost   text;
  v_pay    text;
  v_book   uuid;
  v_lines  jsonb;
  v_dim    text;
  v_memo   text;
begin
  select * into r from public.ledger_entries where id = p_id;
  if not found then
    return null;
  end if;
  -- A shared lock: a close under way (which holds the row) is waited for and its status read after it, and a close
  -- that comes later waits for this posting, so its true-up sees it. Either way nothing is left in growing crops.
  select * into v_season from public.seasons where id = r.season_id for share;
  if not found then
    return null;
  end if;

  v_minor := case when r.currency = 'USD' then round(r.amount * 100) else round(r.entered_amount * 100) end;
  if v_minor < 1 then
    return null;
  end if;

  v_pay := case r.paid_from
             when 'bank' then 'bank'
             when 'wallet' then 'wallet'
             when 'credit' then case when r.category = 'revenue' then 'receivable_buyers' else 'payables_suppliers' end
             else 'cash_on_hand' end;
  v_cost := case r.category::text
              when 'seeds' then 'cost_seeds' when 'fertiliser' then 'cost_fertiliser'
              when 'pesticide' then 'cost_pesticide' when 'labour' then 'cost_labour'
              when 'irrigation' then 'cost_irrigation' when 'transport' then 'cost_transport'
              when 'other' then 'cost_other' else 'sales_crops' end;
  v_dim := v_season.id::text;
  v_memo := left(public._farm_label(r.category) || ' — ' || v_season.name
                 || coalesce(': ' || nullif(btrim(r.description), ''), ''), 500);

  -- (key, side) pairs; every line carries the season.
  if r.category = 'revenue' then
    v_lines := jsonb_build_array(
      jsonb_build_object('key', v_pay, 'side', 'D', 'currency', r.currency, 'minor', v_minor, 'season', v_dim),
      jsonb_build_object('key', 'sales_crops', 'side', 'C', 'currency', r.currency, 'minor', v_minor, 'season', v_dim));
  else
    v_lines := jsonb_build_array(
      jsonb_build_object('key', v_cost, 'side', 'D', 'currency', r.currency, 'minor', v_minor, 'season', v_dim),
      jsonb_build_object('key', v_pay, 'side', 'C', 'currency', r.currency, 'minor', v_minor, 'season', v_dim));
    if v_season.status <> 'completed' then
      v_lines := v_lines || jsonb_build_array(
        jsonb_build_object('key', 'crops_in_progress', 'side', 'D', 'currency', r.currency, 'minor', v_minor, 'season', v_dim),
        jsonb_build_object('key', 'costs_capitalised', 'side', 'C', 'currency', r.currency, 'minor', v_minor, 'season', v_dim));
    end if;
  end if;

  v_book := public._ledger_open_book(v_season.owner_id, 'farm');
  return public._ledger_post_src(
    v_book, r.entry_date, v_memo, v_lines, p_key,
    case when r.currency = 'USD' then null else r.fx_rate end,
    'season_entry', r.id, null, p_actor,
    case when r.currency = 'USD' then null else r.fx_source end);
end $$;

-- ── من ينادي ماذا ───────────────────────────────────────────────────────────

revoke execute on function public._oversight_day(timestamptz), public._oversight_window(date, date)
  from public, anon, authenticated, service_role;
revoke execute on function public._farm_mirror_post(uuid, text, uuid) from public, anon, authenticated, service_role;

insert into supabase_migrations.schema_migrations (version, name) values ('20261025160000', 'ledger_review_fixes') on conflict do nothing;

-- ═══ 20261025210000_platform_fees.sql ═══
-- ═══════════════════════════════════════════════════════════════════════════
-- رسوم المنصّة قيدان متقابلان يؤكّدهما دافعها (البند ١٨٩، المرحلة ٤ من ١٨٦)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- الدراسة (docs/studies/accounting-ledger-ar.md §٣-١٠): «كلُّ رسمٍ تتقاضاه المنصّة قيدان متقابلان — إيرادٌ في دفترها،
-- ومصروفٌ في دفتر دافعه — يربطهما link_id». والمنصّة لا تمسك مال أحد: الرسم يُدفع خارجها (نقداً أو بنكك أو تحويلاً)،
-- ثمّ يُقيَّد. فالدورة كالقيد المتقابل بين شريكين:
--
--   - **المدير يقترح** الرسم: من دفعه، ونوعه (معاينة، توثيق عقد، خدمة)، ومبلغه وعملته ويومه. لا يُقيَّد شيءٌ بعد.
--   - **الدافع يؤكّد** من أين دفع (النقد أو البنك أو المحفظة)، فيُقيَّد الرسم في الدفترين في معاملةٍ واحدة بالرابط نفسه:
--       دفتر المنصّة:  مدين ١١١٠ نقد المنصّة          / دائن ٤١١٠–٤١٣٠ إيراد الرسم
--       دفتر الدافع:   مدين ٦١١٠ رسوم المنصّة (أو ٦١٤٠ رسوم المعاينة في دفتر المستثمر) / دائن النقد أو البنك أو المحفظة
--     فالمنصّة لا تكتب في دفتر أحدٍ إلا بتأكيده، وهي «طرفٌ» هنا لا «مشرِفة».
--   - **أو يعترض** بسبب، فلا يُقيَّد شيء؛ **أو يلغيه المدير** قبل البتّ.
--
-- والسجلّ لا يُحذف، ولا يتغيّر منه بعد البتّ شيء. وقيدا الرسم من قيود النظام: لا يُعكسان يدويّاً بـ ledger_reverse
-- (يُعاد تعريفها هنا لتعرف المصدر الجديد)، فيبقى الدفتران متّفقين.

-- ── الجدول ──────────────────────────────────────────────────────────────────

create table public.ledger_fees (
  id             uuid primary key default gen_random_uuid(),
  kind           text not null check (kind in ('inspection', 'agreement', 'service')),
  status         text not null default 'pending' check (status in ('pending', 'confirmed', 'rejected', 'cancelled')),
  payer_owner    uuid not null references auth.users(id) on delete restrict,
  payer_kind     text not null check (payer_kind in ('farm', 'investor')),
  amount_minor   bigint not null check (amount_minor between 1 and 10000000000000),
  currency       text not null check (currency in ('USD', 'SDG')),
  fx_rate        numeric(18, 6) check (fx_rate is null or fx_rate > 0),
  fx_source      text check (fx_source in ('parallel', 'bank', 'user')),
  entry_date     date not null check (entry_date >= date '2000-01-01'),
  memo           text not null default '' check (length(memo) <= 200),
  proposed_by    uuid not null references auth.users(id) on delete restrict,
  idem_key       text not null check (length(idem_key) between 8 and 80),
  payer_account  text check (payer_account in ('cash', 'bank', 'wallet')),
  platform_entry uuid,
  payer_entry    uuid,
  reject_reason  text check (reject_reason is null or length(reject_reason) between 3 and 300),
  created_at     timestamptz not null default now(),
  resolved_at    timestamptz,
  constraint ledger_fees_payer_not_proposer check (payer_owner <> proposed_by),
  constraint ledger_fees_resolved check ((status = 'pending') = (resolved_at is null)),
  constraint ledger_fees_confirmed check ((status = 'confirmed') = (platform_entry is not null and payer_entry is not null and payer_account is not null)),
  constraint ledger_fees_rejected check ((status = 'rejected') = (reject_reason is not null)),
  unique (proposed_by, idem_key)
);

create index ledger_fees_payer on public.ledger_fees (payer_owner, status, created_at desc);

comment on table public.ledger_fees is
  'رسمٌ للمنصّة يقترحه المدير ويؤكّده دافعه؛ عند التأكيد يُقيَّد في دفتر المنصّة ودفتر الدافع بالرابط نفسه.';

create function public.ledger_fees_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'DELETE' or tg_op = 'TRUNCATE' then
    raise exception 'سجلّ الرسوم لا يُحذف';
  end if;
  if old.status <> 'pending' then
    raise exception 'الرسم بعد البتّ فيه لا يتغيّر';
  end if;
  if (old.id, old.kind, old.payer_owner, old.payer_kind, old.amount_minor, old.currency, old.entry_date, old.memo,
      old.proposed_by, old.idem_key, old.created_at)
     is distinct from
     (new.id, new.kind, new.payer_owner, new.payer_kind, new.amount_minor, new.currency, new.entry_date, new.memo,
      new.proposed_by, new.idem_key, new.created_at) then
    raise exception 'لا يتغيّر من الرسم إلا البتّ فيه';
  end if;
  -- A rate typed by the administrator stays the rate; one taken at confirmation is written once.
  if old.fx_rate is not null and new.fx_rate is distinct from old.fx_rate then
    raise exception 'لا يتغيّر من الرسم إلا البتّ فيه';
  end if;
  return new;
end $$;

create trigger ledger_fees_guard
  before update or delete on public.ledger_fees
  for each row execute function public.ledger_fees_guard();
create trigger ledger_fees_no_truncate
  before truncate on public.ledger_fees
  for each statement execute function public.ledger_fees_guard();

alter table public.ledger_fees enable row level security;
revoke all on table public.ledger_fees from anon, authenticated, service_role;
grant select on public.ledger_fees to authenticated;

-- The payer reads his fees; the administrators read them all (the platform is a party to every one of them).
create policy ledger_fees_read on public.ledger_fees
  for select to authenticated
  using (payer_owner = (select auth.uid()) or (select is_admin()));

-- ── نوع الإشعار ─────────────────────────────────────────────────────────────

do $$
declare v_def text;
begin
  select pg_get_constraintdef(oid) into v_def
    from pg_constraint
   where conname = 'notifications_kind_check' and conrelid = 'public.notifications'::regclass;
  if v_def is null then
    raise exception 'notifications_kind_check غير موجود';
  end if;
  if v_def not like '%ledger_fee%' then
    execute 'alter table public.notifications drop constraint notifications_kind_check';
    execute 'alter table public.notifications add constraint notifications_kind_check '
         || regexp_replace(v_def, '\]\)\)\)\s*$', ', ''ledger_fee''::text])))');
  end if;
  select pg_get_constraintdef(oid) into v_def
    from pg_constraint
   where conname = 'notifications_kind_check' and conrelid = 'public.notifications'::regclass;
  if v_def not like '%ledger_fee%' then
    raise exception 'لم يُضَف نوع الإشعار ledger_fee';
  end if;
end $$;

-- ── التسميات وسطور القيدين ──────────────────────────────────────────────────

create function public._ledger_fee_label(p_kind text)
returns text
language sql
immutable
set search_path = public
as $$
  select case p_kind
    when 'inspection' then 'رسم معاينة'
    when 'agreement' then 'رسم توثيق عقد'
    when 'service' then 'رسم خدمة'
    else p_kind end
$$;

-- The lines one side posts. `platform` or `payer`; the payer's cash account where he paid from.
create function public._ledger_fee_lines(
  p_kind text, p_side text, p_payer_kind text, p_cur text, p_amount bigint, p_account text
) returns jsonb
language plpgsql
immutable
set search_path = public
as $$
declare
  v_pay text := case p_account when 'bank' then 'bank' when 'wallet' then 'wallet' else 'cash_on_hand' end;
begin
  if p_side = 'platform' then
    return jsonb_build_array(
      jsonb_build_object('key', 'cash_on_hand', 'side', 'D', 'currency', p_cur, 'minor', p_amount),
      jsonb_build_object('key', 'fee_' || p_kind, 'side', 'C', 'currency', p_cur, 'minor', p_amount));
  end if;
  return jsonb_build_array(
    jsonb_build_object('key', case when p_kind = 'inspection' and p_payer_kind = 'investor' then 'inspection_fees' else 'platform_fees' end,
                       'side', 'D', 'currency', p_cur, 'minor', p_amount),
    jsonb_build_object('key', v_pay, 'side', 'C', 'currency', p_cur, 'minor', p_amount));
end $$;

-- ── الاقتراح: للمدير ────────────────────────────────────────────────────────

create function public.ledger_fee_propose(
  p_payer        uuid,
  p_payer_kind   text,
  p_kind         text,
  p_amount_minor bigint,
  p_currency     text,
  p_date         date,
  p_rate         numeric default null,
  p_memo         text default '',
  p_key          text default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid  uuid := auth.uid();
  v_key  text := coalesce(nullif(btrim(p_key), ''), gen_random_uuid()::text);
  v_id   uuid;
  v_rate numeric;
  v_src  text;
begin
  if v_uid is null or not is_admin() then
    raise exception 'للإدارة وحدها';
  end if;
  if p_kind not in ('inspection', 'agreement', 'service') then
    raise exception 'نوع رسمٍ غير معروف';
  end if;
  if p_payer_kind not in ('farm', 'investor') then
    raise exception 'اختر دفتر الدافع: المزرعة أو المستثمر';
  end if;
  if p_currency not in ('USD', 'SDG') then
    raise exception 'عملة غير معروفة';
  end if;
  if p_amount_minor is null or p_amount_minor < 1 or p_amount_minor > 10000000000000 then
    raise exception 'مبلغٌ غير صالح';
  end if;
  if p_date is null or p_date < date '2000-01-01' or p_date > public.ledger_today() + 1 then
    raise exception 'تاريخٌ غير صالح';
  end if;
  if p_payer is null or p_payer = v_uid then
    raise exception 'لا يقترح المدير رسماً على نفسه';
  end if;
  if not exists (select 1 from public.profiles where id = p_payer) then
    raise exception 'لا حساب بهذا المعرّف';
  end if;
  if exists (select 1 from public.profiles where id = p_payer and role = 'admin') then
    raise exception 'رسوم المنصّة على مستخدميها، لا على مديريها';
  end if;

  -- The same key from the same administrator is the same proposal: a second tap returns it.
  select id into v_id from public.ledger_fees where proposed_by = v_uid and idem_key = v_key;
  if found then
    return v_id;
  end if;

  if p_currency = 'SDG' and p_rate is not null then
    if p_rate < 1 or p_rate > 100000000 then
      raise exception 'سعر الصرف خارج المعقول';
    end if;
    v_rate := round(p_rate, 6);
    v_src := 'user';
  end if;

  if (select count(*) from public.ledger_fees where payer_owner = p_payer and status = 'pending') >= 20 then
    raise exception 'على هذا الحساب عشرون رسماً تنتظر تأكيده';
  end if;

  insert into public.ledger_fees
    (kind, payer_owner, payer_kind, amount_minor, currency, fx_rate, fx_source, entry_date, memo, proposed_by, idem_key)
  values
    (p_kind, p_payer, p_payer_kind, p_amount_minor, p_currency, v_rate, v_src, p_date,
     left(btrim(coalesce(p_memo, '')), 200), v_uid, v_key)
  returning id into v_id;

  perform public.notify_user(
    p_payer, 'ledger_fee', 'رسمٌ للمنصّة ينتظر تأكيدك: ' || public._ledger_fee_label(p_kind),
    'سجّلت الإدارة أنّك دفعت ' || public._ledger_fee_label(p_kind) || ' للمنصّة. لا يدخل دفترك إلا إن أكّدته '
      || 'واخترت من أين دفعت؛ وإن لم تدفعه فاعترض عليه.',
    '/books/fees');
  return v_id;
end $$;

-- ── التأكيد: للدافع، ويُقيَّد في الدفترين معاً ───────────────────────────────

create function public.ledger_fee_confirm(p_fee uuid, p_account text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid   uuid := auth.uid();
  f       public.ledger_fees;
  v_rate  numeric;
  v_src   text;
  v_pbook uuid;
  v_ubook uuid;
  v_label text;
  v_pe    uuid;
  v_ue    uuid;
begin
  if v_uid is null then
    raise exception 'سجّل الدخول أولاً';
  end if;
  select * into f from public.ledger_fees where id = p_fee for update;
  if not found or f.payer_owner <> v_uid then
    raise exception 'ليس هذا رسماً عليك';
  end if;
  if f.status <> 'pending' then
    raise exception 'سُبق البتّ في هذا الرسم';
  end if;
  if coalesce(p_account, '') not in ('cash', 'bank', 'wallet') then
    raise exception 'اختر من أين دفعت: النقد أو البنك أو المحفظة';
  end if;

  -- One rate for both books: what the administrator typed, else the latest published one for the day.
  if f.currency = 'SDG' then
    if f.fx_rate is not null then
      v_rate := f.fx_rate;
      v_src := f.fx_source;
    else
      select r.rate into v_rate from public.ledger_fx_rate(f.entry_date, 'parallel') r;
      v_src := 'parallel';
      if v_rate is null then
        raise exception 'لا سعر صرفٍ منشوراً خلال ٧ أيام قبل %؛ تكتب الإدارة السعر الذي قُبض به', f.entry_date;
      end if;
    end if;
  end if;

  v_pbook := public._ledger_open_book(null, 'platform');
  v_ubook := public._ledger_open_book(v_uid, f.payer_kind);
  v_label := public._ledger_fee_label(f.kind) || coalesce(': ' || nullif(f.memo, ''), '');

  v_pe := public._ledger_post_src(
    v_pbook, f.entry_date, v_label,
    public._ledger_fee_lines(f.kind, 'platform', f.payer_kind, f.currency, f.amount_minor, null),
    'ledger_fee:' || f.id::text || ':p', v_rate, 'ledger_fee', f.id, f.id, f.proposed_by, v_src);
  v_ue := public._ledger_post_src(
    v_ubook, f.entry_date, v_label,
    public._ledger_fee_lines(f.kind, 'payer', f.payer_kind, f.currency, f.amount_minor, p_account),
    'ledger_fee:' || f.id::text || ':u', v_rate, 'ledger_fee', f.id, f.id, v_uid, v_src);

  update public.ledger_fees
     set status = 'confirmed', payer_account = p_account, fx_rate = v_rate, fx_source = v_src,
         platform_entry = v_pe, payer_entry = v_ue, resolved_at = now()
   where id = f.id;

  perform public.notify_user(
    f.proposed_by, 'ledger_fee', 'أُكِّد رسم: ' || public._ledger_fee_label(f.kind),
    'أكّد الدافع الرسم، فقُيِّد في دفتر المنصّة ودفتره.', '/admin/books');
end $$;

create function public.ledger_fee_reject(p_fee uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  f     public.ledger_fees;
begin
  if v_uid is null then
    raise exception 'سجّل الدخول أولاً';
  end if;
  if length(btrim(coalesce(p_reason, ''))) not between 3 and 300 then
    raise exception 'اكتب سبب الاعتراض (٣ أحرفٍ فأكثر): تراه الإدارة';
  end if;
  select * into f from public.ledger_fees where id = p_fee for update;
  if not found or f.payer_owner <> v_uid then
    raise exception 'ليس هذا رسماً عليك';
  end if;
  if f.status <> 'pending' then
    raise exception 'سُبق البتّ في هذا الرسم';
  end if;
  update public.ledger_fees set status = 'rejected', reject_reason = btrim(p_reason), resolved_at = now() where id = f.id;
  perform public.notify_user(
    f.proposed_by, 'ledger_fee', 'اعترض الدافع على رسم: ' || public._ledger_fee_label(f.kind),
    'السبب: ' || btrim(p_reason) || '. لم يُقيَّد شيءٌ في أيّ دفتر.', '/admin/books');
end $$;

create function public.ledger_fee_cancel(p_fee uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  f public.ledger_fees;
begin
  if auth.uid() is null or not is_admin() then
    raise exception 'للإدارة وحدها';
  end if;
  select * into f from public.ledger_fees where id = p_fee for update;
  if not found then
    raise exception 'لا رسمَ بهذا المعرّف';
  end if;
  if f.status <> 'pending' then
    raise exception 'سُبق البتّ في هذا الرسم';
  end if;
  update public.ledger_fees set status = 'cancelled', resolved_at = now() where id = f.id;
end $$;

-- ── القائمة: للدافع رسومه، وللمدير كلّها باسم الدافع ─────────────────────────

create function public.ledger_fees_list()
returns table (
  id            uuid,
  kind          text,
  status        text,
  payer_owner   uuid,
  payer_name    text,
  payer_kind    text,
  amount_minor  bigint,
  currency      text,
  fx_rate       numeric,
  entry_date    date,
  memo          text,
  payer_account text,
  reject_reason text,
  created_at    timestamptz,
  resolved_at   timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select f.id, f.kind, f.status, f.payer_owner,
         case when is_admin() then coalesce(p.full_name, '—') else null end,
         f.payer_kind, f.amount_minor, f.currency, f.fx_rate, f.entry_date, f.memo, f.payer_account, f.reject_reason,
         f.created_at, f.resolved_at
    from public.ledger_fees f
    left join public.profiles p on p.id = f.payer_owner
   where auth.uid() is not null and (f.payer_owner = auth.uid() or is_admin())
   order by (f.status = 'pending') desc, f.created_at desc
   limit 300
$$;

-- ── قيود الرسم من قيود النظام: لا تُعكس يدويّاً ──────────────────────────────
--
-- كما في 20261025160000 (أ٤ وأ٥)، ومعها المصدر الجديد.

create or replace function public.ledger_reverse(
  p_entry  uuid,
  p_reason text,
  p_date   date default null,
  p_key    text default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_type text;
begin
  if auth.uid() is null then
    raise exception 'سجّل الدخول أولاً';
  end if;
  select e.source_type into v_type
    from public.journal_entries e
    join public.ledger_books b on b.id = e.book_id
   where e.id = p_entry and (b.owner_id = auth.uid() or (b.kind = 'platform' and is_admin()));
  if not found then
    raise exception 'ليس هذا قيدك';
  end if;
  if v_type in ('season_entry', 'season_close') then
    raise exception 'هذا القيد من دفتر الموسم: عدّل السطر أو احذفه هناك، فيُعكس هنا وحده';
  elsif v_type in ('season_entry_settle', 'season_entry_settle_fx') then
    raise exception 'هذا قيد سداد: ألغِ السداد من دفتر الموسم، فيُعكس مع فرق صرفه';
  elsif v_type = 'ledger_link' then
    raise exception 'هذا قيدٌ متقابل مع شريكك: يُلغى باتّفاقكما من صفحة القيود المتقابلة';
  elsif v_type = 'oversight' then
    raise exception 'هذا قيدٌ إحصائيّ يتبع مجاميع الشبكة ولا يُعكس يدويّاً';
  elsif v_type = 'ledger_fee' then
    raise exception 'هذا قيد رسمٍ للمنصّة قُيِّد في دفترين؛ لا يُعكس في أحدهما وحده';
  end if;
  return public._ledger_reverse(p_entry, p_reason, p_date, p_key, auth.uid());
end $$;

-- ── الصلاحيّات ──────────────────────────────────────────────────────────────

revoke execute on function
  public.ledger_fees_guard(), public._ledger_fee_label(text), public._ledger_fee_lines(text, text, text, text, bigint, text)
  from public, anon, authenticated, service_role;

revoke execute on function
  public.ledger_fee_propose(uuid, text, text, bigint, text, date, numeric, text, text),
  public.ledger_fee_confirm(uuid, text),
  public.ledger_fee_reject(uuid, text),
  public.ledger_fee_cancel(uuid),
  public.ledger_fees_list()
  from public, anon, service_role;

grant execute on function
  public.ledger_fee_propose(uuid, text, text, bigint, text, date, numeric, text, text),
  public.ledger_fee_confirm(uuid, text),
  public.ledger_fee_reject(uuid, text),
  public.ledger_fee_cancel(uuid),
  public.ledger_fees_list()
  to authenticated;

insert into supabase_migrations.schema_migrations (version, name) values ('20261025210000', 'platform_fees') on conflict do nothing;

-- ═══ 20261025210100_ledger_statements.sql ═══
-- ═══════════════════════════════════════════════════════════════════════════
-- مطابقة الحساب النقديّ بكشف مزوّده (البند ١٨٩، المرحلة ٤ من ١٨٦)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- الدراسة §٣-٧: «الحساب النقديّ محفظة المستخدم الخاصّة في دفتره، له اسم وعملة ومزوّد (بنكك، MTN…)؛ يرفع المستخدم
-- كشف مزوّده CSV، فيعلّم القيود مطابَقة ويرى الفروق غير المفسَّرة». والمنصّة لا تلمس المال، فالكشف هنا **مرآةٌ
-- يقارن بها صاحب الدفتر ما سجّله**:
--
--   - الكشف لا يكتب قيداً ولا يغيّر قيداً. هو جدولٌ مستقلّ (`ledger_statement_lines`) بسطور الكشف كما جاءت.
--   - المطابقة تربط سطر كشفٍ بسطر قيدٍ في الحساب نفسه وبالعملة نفسها وبالمبلغ نفسه (المال الداخل مدينٌ في الحساب،
--     والخارج دائن). آليّاً: أقرب قيدٍ في ثلاثة أيّام قبل يوم الكشف أو بعده؛ ويدويّاً: يختار صاحب الدفتر.
--   - سطر القيد الواحد لا يطابق إلا سطر كشفٍ واحداً. والقيد الذي عُكس، أو العاكس، لا يُطابَق؛ وإن عُكس قيدٌ بعد
--     مطابقته صار سطر الكشف «في الكشف وحده» من جديد في التقرير، فلا تختفي حركةٌ حقيقيّة وراء قيدٍ أُلغي.
--   - رفع الكشف نفسه مرّةً ثانية لا يكرّر سطوره (بصمة كلّ سطر فريدة في الحساب).
--
-- يرفع الكشفَ ويطابقه صاحب الدفتر وحده (ومدير المنصّة في دفترها)؛ ويقرؤه المدير الفاحص ما دام الفحص قائماً.

-- ── الجداول ─────────────────────────────────────────────────────────────────

create table public.ledger_statements (
  id          uuid primary key default gen_random_uuid(),
  book_id     uuid not null references public.ledger_books(id) on delete restrict,
  account_id  uuid not null,
  file_name   text not null default '' check (length(file_name) <= 120),
  currency    text not null references public.ledger_currencies(code),
  rows_count  integer not null default 0 check (rows_count >= 0),
  imported_by uuid not null,
  imported_at timestamptz not null default now(),
  foreign key (account_id, book_id) references public.ledger_accounts (id, book_id)
);

create index ledger_statements_account on public.ledger_statements (account_id, imported_at desc);

create table public.ledger_statement_lines (
  id           uuid primary key default gen_random_uuid(),
  statement_id uuid not null references public.ledger_statements(id) on delete cascade,
  account_id   uuid not null,
  line_no      integer not null check (line_no between 1 and 5000),
  txn_date     date not null check (txn_date >= date '2000-01-01'),
  -- بالوحدة الصغرى لعملة الكشف: موجبٌ داخلٌ إلى الحساب، سالبٌ خارجٌ منه.
  amount_minor bigint not null check (amount_minor <> 0 and abs(amount_minor) <= 10000000000000),
  currency     text not null references public.ledger_currencies(code),
  description  text not null default '' check (length(description) <= 200),
  reference    text not null default '' check (length(reference) <= 80),
  row_hash     text not null check (row_hash ~ '^[0-9a-f]{32}$'),
  matched_line uuid references public.journal_lines(id) on delete restrict,
  match_kind   text check (match_kind in ('auto', 'manual')),
  matched_at   timestamptz,
  constraint ledger_statement_lines_match check ((matched_line is null) = (match_kind is null) and (matched_line is null) = (matched_at is null)),
  unique (account_id, row_hash)
);

create unique index ledger_statement_lines_one_match on public.ledger_statement_lines (matched_line) where matched_line is not null;
create index ledger_statement_lines_account on public.ledger_statement_lines (account_id, txn_date);

comment on table public.ledger_statement_lines is
  'سطور كشف المزوّد كما رفعها صاحب الدفتر، ومطابقة كلٍّ منها بسطر قيد. لا تكتب في الدفتر شيئاً.';

alter table public.ledger_statements enable row level security;
alter table public.ledger_statement_lines enable row level security;
revoke all on table public.ledger_statements, public.ledger_statement_lines from anon, authenticated, service_role;
grant select on public.ledger_statements, public.ledger_statement_lines to authenticated;

-- Read by the book's owner, by the administrators for the platform's book, and by an administrator inspecting it.
create function public._ledger_book_readable(p_book uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.ledger_books b
     where b.id = p_book
       and (b.owner_id = auth.uid() or (b.kind = 'platform' and is_admin()) or public._ledger_inspecting(b.id)))
$$;

create policy ledger_statements_read on public.ledger_statements
  for select to authenticated using (public._ledger_book_readable(book_id));
create policy ledger_statement_lines_read on public.ledger_statement_lines
  for select to authenticated
  using (exists (select 1 from public.ledger_statements s where s.id = statement_id and public._ledger_book_readable(s.book_id)));

-- ── مساعدات ─────────────────────────────────────────────────────────────────

-- The cash account a statement may be laid against, in a book the caller writes: his own, or the platform's for an
-- administrator. Returns the account; refuses anything else.
create function public._ledger_cash_account(p_account uuid)
returns public.ledger_accounts
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  a public.ledger_accounts;
begin
  if auth.uid() is null then
    raise exception 'سجّل الدخول أولاً';
  end if;
  select ac.* into a
    from public.ledger_accounts ac
    join public.ledger_books b on b.id = ac.book_id
   where ac.id = p_account and (b.owner_id = auth.uid() or (b.kind = 'platform' and is_admin()));
  if not found then
    raise exception 'ليس هذا حساباً في دفترك';
  end if;
  if a.type <> 'asset' or not a.postable or (a.provider is null and coalesce(a.system_key, '') not in ('cash_on_hand', 'bank', 'wallet')) then
    raise exception 'الكشف يُطابَق بحسابٍ نقديّ (نقد أو بنك أو محفظة)';
  end if;
  return a;
end $$;

-- A journal line still standing: its entry is not a reversal and has not been reversed.
create function public._ledger_line_standing(p_line uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.journal_lines l
      join public.journal_entries e on e.id = l.entry_id
     where l.id = p_line and e.reversal_of is null
       and not exists (select 1 from public.journal_entries r where r.reversal_of = e.id))
$$;

-- The best unmatched standing line for one statement line: same account, currency and signed amount, within three
-- days, the nearest day first and then the oldest entry.
create function public._ledger_statement_candidate(p_line uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select l.id
    from public.ledger_statement_lines s
    join public.journal_lines l on l.account_id = s.account_id and l.currency = s.currency
         and (case l.side when 'D' then l.amount_minor else -l.amount_minor end) = s.amount_minor
    join public.journal_entries e on e.id = l.entry_id
   where s.id = p_line
     and abs(e.entry_date - s.txn_date) <= 3
     and e.reversal_of is null
     and not exists (select 1 from public.journal_entries r where r.reversal_of = e.id)
     and not exists (select 1 from public.ledger_statement_lines o where o.matched_line = l.id)
   order by abs(e.entry_date - s.txn_date), e.entry_no, l.line_no
   limit 1
$$;

-- ── مزوّد الحساب النقديّ ─────────────────────────────────────────────────────
--
-- الحسابات النقديّة الثلاثة التي يقيّد عليها دفتر الموسم (نقد، بنك، محفظة) يسمّي صاحبها مزوّدها: «المحفظة» هي بنكك،
-- و«البنك» هو بنك فيصل… فيُعرف أيّ كشفٍ يطابق أيّ حساب. لا يتغيّر بهذا رقمٌ في الدفتر.

create function public.ledger_account_set_provider(p_account uuid, p_provider text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public._ledger_cash_account(p_account);
  if p_provider is null or p_provider !~ '^[a-z_]{2,30}$' then
    raise exception 'مزوّدٌ غير صالح';
  end if;
  update public.ledger_accounts set provider = p_provider where id = p_account;
end $$;

-- ── الرفع ───────────────────────────────────────────────────────────────────
--
-- p_rows: [{ "date": "2026-10-01", "minor": -150000, "description": "…", "reference": "…" }, …] كما قرأتها الصفحة من
-- الملف (src/lib/ledger/statementCsv.ts). يعيد: كم سطراً جديداً، وكم سطراً كان مرفوعاً من قبل، وكم طوبق آليّاً.

create function public.ledger_statement_import(
  p_account   uuid,
  p_currency  text,
  p_file_name text,
  p_rows      jsonb
) returns table (statement_id uuid, imported integer, skipped integer, matched integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  a       public.ledger_accounts;
  v_cur   text := upper(coalesce(p_currency, ''));
  v_sid   uuid;
  v_row   jsonb;
  v_i     integer := 0;
  v_new   integer := 0;
  v_skip  integer := 0;
  v_match integer := 0;
  v_date  date;
  v_minor bigint;
  v_desc  text;
  v_ref   text;
  v_hash  text;
  v_seen  jsonb := '{}'::jsonb;
  v_base  text;
  v_n     integer;
  v_lid   uuid;
  v_cand  uuid;
begin
  a := public._ledger_cash_account(p_account);
  if a.currency is not null then
    v_cur := a.currency;
  end if;
  if not exists (select 1 from public.ledger_currencies where code = v_cur) then
    raise exception 'اختر عملة الكشف';
  end if;
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) = 0 then
    raise exception 'لا سطور في الكشف';
  end if;
  if jsonb_array_length(p_rows) > 2000 then
    raise exception 'الكشف أطول من ٢٬٠٠٠ سطر؛ قسّمه إلى فترات';
  end if;

  insert into public.ledger_statements (book_id, account_id, file_name, currency, imported_by)
  values (a.book_id, a.id, left(btrim(coalesce(p_file_name, '')), 120), v_cur, auth.uid())
  returning id into v_sid;

  for v_row in select value from jsonb_array_elements(p_rows) loop
    v_i := v_i + 1;
    begin
      v_date := (v_row ->> 'date')::date;
      v_minor := (v_row ->> 'minor')::bigint;
    exception when others then
      raise exception 'السطر % من الكشف: تاريخٌ أو مبلغٌ غير مقروء', v_i;
    end;
    if v_date is null or v_date < date '2000-01-01' or v_date > public.ledger_today() + 1 then
      raise exception 'السطر % من الكشف: تاريخٌ غير صالح', v_i;
    end if;
    if v_minor is null or v_minor = 0 or abs(v_minor) > 10000000000000 then
      raise exception 'السطر % من الكشف: مبلغٌ غير صالح', v_i;
    end if;
    v_desc := left(btrim(coalesce(v_row ->> 'description', '')), 200);
    v_ref := left(btrim(coalesce(v_row ->> 'reference', '')), 80);

    -- Two identical rows in one file are two movements; the same file again is the same movements.
    v_base := v_date::text || '|' || v_minor::text || '|' || v_cur || '|' || v_ref || '|' || v_desc;
    v_n := coalesce((v_seen ->> v_base)::integer, 0) + 1;
    v_seen := v_seen || jsonb_build_object(v_base, v_n);
    v_hash := md5(v_base || '|' || v_n::text);

    insert into public.ledger_statement_lines
      (statement_id, account_id, line_no, txn_date, amount_minor, currency, description, reference, row_hash)
    values (v_sid, a.id, v_i, v_date, v_minor, v_cur, v_desc, v_ref, v_hash)
    on conflict (account_id, row_hash) do nothing
    returning id into v_lid;
    if v_lid is null then
      v_skip := v_skip + 1;
      continue;
    end if;
    v_new := v_new + 1;

    v_cand := public._ledger_statement_candidate(v_lid);
    if v_cand is not null then
      update public.ledger_statement_lines set matched_line = v_cand, match_kind = 'auto', matched_at = now() where id = v_lid;
      v_match := v_match + 1;
    end if;
    v_lid := null;
  end loop;

  update public.ledger_statements set rows_count = v_new where id = v_sid;
  -- A file with nothing new leaves no empty statement behind.
  if v_new = 0 then
    delete from public.ledger_statements where id = v_sid;
    v_sid := null;
  end if;
  return query select v_sid, v_new, v_skip, v_match;
end $$;

-- ── المطابقة اليدويّة وفكّها ─────────────────────────────────────────────────

create function public.ledger_statement_match(p_statement_line uuid, p_journal_line uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  s public.ledger_statement_lines;
  l public.journal_lines;
begin
  select * into s from public.ledger_statement_lines where id = p_statement_line for update;
  if not found then
    raise exception 'سطر الكشف غير موجود';
  end if;
  perform public._ledger_cash_account(s.account_id);
  if s.matched_line is not null then
    raise exception 'هذا السطر مطابَقٌ من قبل؛ فكّ مطابقته أولاً';
  end if;
  select * into l from public.journal_lines where id = p_journal_line;
  if not found or l.account_id <> s.account_id then
    raise exception 'القيد ليس في هذا الحساب';
  end if;
  if l.currency <> s.currency or (case l.side when 'D' then l.amount_minor else -l.amount_minor end) <> s.amount_minor then
    raise exception 'المبلغ أو العملة لا تطابق سطر الكشف';
  end if;
  if not public._ledger_line_standing(l.id) then
    raise exception 'هذا قيدٌ عُكس أو قيدٌ عاكس؛ لا يُطابَق';
  end if;
  if exists (select 1 from public.ledger_statement_lines where matched_line = l.id) then
    raise exception 'هذا القيد مطابَقٌ بسطرٍ آخر من الكشف';
  end if;
  update public.ledger_statement_lines set matched_line = l.id, match_kind = 'manual', matched_at = now() where id = s.id;
end $$;

create function public.ledger_statement_unmatch(p_statement_line uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  s public.ledger_statement_lines;
begin
  select * into s from public.ledger_statement_lines where id = p_statement_line for update;
  if not found then
    raise exception 'سطر الكشف غير موجود';
  end if;
  perform public._ledger_cash_account(s.account_id);
  update public.ledger_statement_lines set matched_line = null, match_kind = null, matched_at = null where id = s.id;
end $$;

-- A statement uploaded by mistake is taken out whole (its lines go with it). Nothing in the book changes.
create function public.ledger_statement_delete(p_statement uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_acc uuid;
begin
  select account_id into v_acc from public.ledger_statements where id = p_statement;
  if not found then
    raise exception 'الكشف غير موجود';
  end if;
  perform public._ledger_cash_account(v_acc);
  delete from public.ledger_statements where id = p_statement;
end $$;

-- ── التقرير: ما في الاثنين، وما في الكشف وحده، وما في الدفتر وحده ────────────

create function public.ledger_reconciliation(p_account uuid, p_from date, p_to date)
returns table (
  status         text,
  statement_line uuid,
  journal_line   uuid,
  txn_date       date,
  amount_minor   bigint,
  currency       text,
  description    text,
  reference      text,
  entry_no       bigint,
  entry_date     date,
  memo           text,
  match_kind     text
)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_book uuid;
begin
  select ac.book_id into v_book from public.ledger_accounts ac where ac.id = p_account;
  if v_book is null or not public._ledger_book_readable(v_book) then
    raise exception 'ليس هذا حساباً في دفترك';
  end if;
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 1100 then
    raise exception 'مدىً غير صالح (حتى ثلاث سنوات)';
  end if;
  return query
  with stmt as (
    select s.*, (s.matched_line is not null and public._ledger_line_standing(s.matched_line)) as live
      from public.ledger_statement_lines s
     where s.account_id = p_account and s.txn_date between p_from and p_to
  )
  select case when st.live then 'matched' else 'statement_only' end,
         st.id, case when st.live then st.matched_line end, st.txn_date, st.amount_minor, st.currency, st.description,
         st.reference, case when st.live then e.entry_no end, case when st.live then e.entry_date end,
         case when st.live then e.memo end, case when st.live then st.match_kind end
    from stmt st
    left join public.journal_lines l on l.id = st.matched_line
    left join public.journal_entries e on e.id = l.entry_id
  union all
  select 'book_only', null, l.id, e.entry_date,
         (case l.side when 'D' then l.amount_minor else -l.amount_minor end), l.currency, coalesce(l.line_memo, ''), '',
         e.entry_no, e.entry_date, e.memo, null
    from public.journal_lines l
    join public.journal_entries e on e.id = l.entry_id
   where l.account_id = p_account and e.entry_date between p_from and p_to
     and e.reversal_of is null
     and not exists (select 1 from public.journal_entries r where r.reversal_of = e.id)
     and not exists (select 1 from public.ledger_statement_lines o where o.matched_line = l.id)
  order by 4, 1, 9 nulls last;
end $$;

-- ── الصلاحيّات ──────────────────────────────────────────────────────────────

revoke execute on function
  public._ledger_book_readable(uuid), public._ledger_cash_account(uuid), public._ledger_line_standing(uuid),
  public._ledger_statement_candidate(uuid)
  from public, anon, service_role;
-- The read policy calls this one as the reader.
grant execute on function public._ledger_book_readable(uuid) to authenticated;
revoke execute on function public._ledger_cash_account(uuid), public._ledger_line_standing(uuid), public._ledger_statement_candidate(uuid)
  from authenticated;

revoke execute on function
  public.ledger_account_set_provider(uuid, text),
  public.ledger_statement_import(uuid, text, text, jsonb),
  public.ledger_statement_match(uuid, uuid),
  public.ledger_statement_unmatch(uuid),
  public.ledger_statement_delete(uuid),
  public.ledger_reconciliation(uuid, date, date)
  from public, anon, service_role;
grant execute on function
  public.ledger_account_set_provider(uuid, text),
  public.ledger_statement_import(uuid, text, text, jsonb),
  public.ledger_statement_match(uuid, uuid),
  public.ledger_statement_unmatch(uuid),
  public.ledger_statement_delete(uuid),
  public.ledger_reconciliation(uuid, date, date)
  to authenticated;

insert into supabase_migrations.schema_migrations (version, name) values ('20261025210100', 'ledger_statements') on conflict do nothing;

-- ═══ 20261025220000_machinery_availability_and_group_booking.sql ═══
-- ═══════════════════════════════════════════════════════════════════════════
-- إيجار الجرّار: «آخر تأكيدٍ للتوفّر»، ثمّ الحجز الجماعيّ (البند ١٦٨)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- من الغنيمة ٥ في docs/studies/spoils-konoz-hawasha-ar.md: الوقود شحيح والجرّار يُستأجر لا يُشترى، وHello Tractor لا
-- يُرسل جرّاره إلا إذا اجتمع ما يكفي من الأرض في رقعةٍ صغيرة. فعلى الخدمات التعاقديّة القائمة، لا بجانبها:
--
--   ١) **التوفّر بتاريخه.** مقدّم الميكنة يقول «أنا متوفّر» أو «لست متوفّراً»، ويُختم القول بلحظة قوله لا بتاريخٍ
--      يكتبه (الزناد يكتب now() مهما أُرسل). والقائمة تُظهر «آخر تأكيدٍ للتوفّر»، وما مضى عليه أكثر من ١٤ يوماً
--      قديمٌ لا يُفتح عليه حجزٌ جديد حتى يؤكّد من جديد.
--
--   ٢) **الحجز الجماعيّ.** مزارعٌ يفتح حجزاً على خدمة ميكنةٍ لمقدّمٍ موثّق، فيُعرض على من في **ولايته ومحليّته** —
--      مأخوذتين من الأرض المربوطة بموسمه، لا مكتوبتين — فينضمّون بمواسمهم وكمّيّاتهم. وكلّ منضمٍّ يعرض في اللحظة
--      نفسها **عقد خدمةٍ عاديّاً** على مقدّم الخدمة (هو العميل، بسعر الكتالوج يوم فُتح الحجز، بمرحلةٍ واحدة)، فلا
--      يحتاج الحجز آلةً عقودٍ ثانية. فإذا بلغ المجموع الحدّ الأدنى للخدمة أرسله المنظّم، فإن قبل مقدّم الخدمة صارت
--      العقود كلّها سارية معاً، وإن رفض أُلغيت معاً. ولا يُقبل عقدٌ من حجزٍ وحده، ولا يُعاد مسودّةً تُعدَّل.
--
-- ولا مال في المنصّة (الدفع خارجها كما في كلّ مكان)، ولا هاتف: الحجز يحمل اسماً معروضاً وكمّيّة، ويُرفض اسمٌ فيه
-- رقمٌ طويل. وكلّ القراءة والكتابة بدوالّ؛ الجدولان لا يُقرآن ولا يُكتبان مباشرةً لأحد.

-- ── ١) التوفّر ───────────────────────────────────────────────────────────────

alter table public.service_providers
  add column available boolean not null default false,
  add column availability_confirmed_at timestamptz;

comment on column public.service_providers.available is
  'مقدّم الميكنة متوفّرٌ الآن لعملٍ جديد، بقوله هو. لغير الميكنة يبقى false.';
comment on column public.service_providers.availability_confirmed_at is
  'لحظة آخر تأكيدٍ للتوفّر أو عدمه. يكتبها الزناد now()، لا يكتبها أحد.';

-- How long a confirmation stays good for a new booking.
create function public.machinery_fresh_days()
returns integer
language sql
immutable
set search_path = public
as $$ select 14 $$;

create function public.providers_availability_stamp()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if new.available and new.kind <> 'mechanization' then
      raise exception 'التوفّر لمقدّمي الميكنة والجرّارات وحدهم';
    end if;
    new.availability_confirmed_at := case when new.available then now() end;
    return new;
  end if;
  if new.available is distinct from old.available
     or new.availability_confirmed_at is distinct from old.availability_confirmed_at then
    if new.available and new.kind <> 'mechanization' then
      raise exception 'التوفّر لمقدّمي الميكنة والجرّارات وحدهم';
    end if;
    -- The moment of saying it, whatever was sent.
    new.availability_confirmed_at := now();
  end if;
  return new;
end $$;

create trigger service_providers_availability_stamp
  before insert or update on public.service_providers
  for each row execute function public.providers_availability_stamp();

-- Visitors read the listing's columns one by one (20261022050000); the two new ones are part of the listing.
grant select (available, availability_confirmed_at) on public.service_providers to anon;

create function public.provider_confirm_availability(p_provider uuid, p_available boolean)
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  p public.service_providers;
begin
  if auth.uid() is null then raise exception 'سجّل الدخول أولاً.'; end if;
  select * into p from public.service_providers where id = p_provider for update;
  if not found or p.owner_id <> auth.uid() then raise exception 'ليست هذه جهتك.'; end if;
  if p.kind <> 'mechanization' then raise exception 'التوفّر لمقدّمي الميكنة والجرّارات وحدهم'; end if;
  update public.service_providers
     set available = coalesce(p_available, false), availability_confirmed_at = now()
   where id = p_provider
  returning availability_confirmed_at into p.availability_confirmed_at;
  return p.availability_confirmed_at;
end $$;

-- ── ٢) الحجز الجماعيّ ────────────────────────────────────────────────────────

create table public.machinery_bookings (
  id            uuid primary key default gen_random_uuid(),
  provider_id   uuid not null references public.service_providers(id) on delete restrict,
  service_id    uuid not null references public.services(id) on delete restrict,
  organiser_id  uuid not null references auth.users(id) on delete restrict,
  state         text not null,
  locality      text not null,
  window_from   date not null,
  window_to     date not null,
  -- The catalogue's terms on the day the booking opened: what every member's contract carries.
  service_title text not null,
  unit          public.service_unit not null,
  unit_price    numeric(14,2) not null check (unit_price >= 0),
  min_units     numeric(12,2) not null check (min_units > 0),
  status        text not null default 'open'
                check (status in ('open', 'requested', 'accepted', 'declined', 'cancelled')),
  decided_at    timestamptz,
  decline_reason text check (decline_reason is null or length(decline_reason) between 3 and 300),
  created_at    timestamptz not null default now(),
  constraint machinery_bookings_window check (window_to >= window_from and window_to - window_from <= 60),
  constraint machinery_bookings_decided check ((status in ('accepted', 'declined')) = (decided_at is not null))
);

create index machinery_bookings_open on public.machinery_bookings (state, locality) where status = 'open';
create index machinery_bookings_provider on public.machinery_bookings (provider_id, status);

create table public.machinery_booking_members (
  id           uuid primary key default gen_random_uuid(),
  booking_id   uuid not null references public.machinery_bookings(id) on delete restrict,
  member_id    uuid not null references auth.users(id) on delete restrict,
  season_id    uuid not null references public.seasons(id) on delete restrict,
  quantity     numeric(12,2) not null check (quantity > 0),
  display_name text not null check (length(btrim(display_name)) between 2 and 60),
  contract_id  uuid not null unique references public.service_contracts(id) on delete restrict,
  joined_at    timestamptz not null default now(),
  left_at      timestamptz
);

create unique index machinery_booking_members_once
  on public.machinery_booking_members (booking_id, member_id) where left_at is null;

alter table public.service_contracts
  add column booking_id uuid references public.machinery_bookings(id) on delete restrict;

comment on column public.service_contracts.booking_id is
  'الحجز الجماعيّ الذي وُلد منه العقد. يُقبل مع الحجز كلّه، ولا يُعاد مسودّة.';

alter table public.machinery_bookings enable row level security;
alter table public.machinery_booking_members enable row level security;
-- Nobody reads or writes these directly; the functions below are the only way in and out.
revoke all on table public.machinery_bookings, public.machinery_booking_members from anon, authenticated, service_role;

-- A contract born of a booking: made only by the booking functions, accepted only with the whole booking, and never
-- pulled back to a draft whose price could then be edited before it is offered again.
create function public.service_contracts_booking_gate()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if new.booking_id is not null
       and coalesce(current_setting('app.machinery_booking', true), '') <> new.booking_id::text then
      raise exception 'عقد الحجز الجماعيّ يُنشأ من الحجز نفسه';
    end if;
    return new;
  end if;
  if new.booking_id is distinct from old.booking_id then
    raise exception 'لا يُنقل عقدٌ إلى حجزٍ آخر أو منه';
  end if;
  if old.booking_id is null or new.status is not distinct from old.status then
    return new;
  end if;
  if new.status = 'draft' then
    raise exception 'عقد الحجز الجماعيّ لا يُعاد مسودّة؛ انسحب من الحجز بدلاً من ذلك';
  end if;
  if new.status = 'active'
     and not exists (select 1 from public.machinery_bookings b where b.id = old.booking_id and b.status = 'accepted') then
    raise exception 'عقد الحجز الجماعيّ يُقبل مع الحجز كلّه، من صفحة الحجز';
  end if;
  return new;
end $$;

create trigger service_contracts_booking_gate
  before insert or update on public.service_contracts
  for each row execute function public.service_contracts_booking_gate();

-- ── المساعدات ────────────────────────────────────────────────────────────────

-- A name shown to the organiser and the provider: no phone number hidden in it.
create function public._machinery_name(p_name text)
returns text
language plpgsql
immutable
set search_path = public
as $$
declare
  v text := btrim(coalesce(p_name, ''));
  digits text;
begin
  if length(v) not between 2 and 60 then
    raise exception 'اكتب اسماً يعرفك به المنظّم ومقدّم الخدمة (من حرفين إلى ٦٠)';
  end if;
  digits := regexp_replace(translate(v, '٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹', '01234567890123456789'), '[^0-9]', '', 'g');
  if length(digits) >= 6 then
    raise exception 'لا أرقام هواتف في الاسم: يصلك مقدّم الخدمة بعد قبول الحجز';
  end if;
  return v;
end $$;

-- The provider can take a new booking: verified, listed, a mechanisation outfit, and said so recently.
create function public._machinery_provider_ready(p_provider uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.service_providers p
     where p.id = p_provider and p.kind = 'mechanization'
       and p.verified_at is not null and p.active and not p.paused_by_owner
       and p.available
       and p.availability_confirmed_at >= now() - make_interval(days => public.machinery_fresh_days()))
$$;

-- The members who still count: not left, and their contract still offered or in force.
create function public._machinery_active(p_booking uuid)
returns table (member_id uuid, quantity numeric, contract_id uuid, display_name text, joined_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select m.member_id, m.quantity, m.contract_id, m.display_name, m.joined_at
    from public.machinery_booking_members m
    join public.service_contracts c on c.id = m.contract_id
   where m.booking_id = p_booking and m.left_at is null and c.status in ('proposed', 'active')
   order by m.joined_at
$$;

-- One member in: their own contract with the provider, offered at once at the booking's terms.
create function public._machinery_add_member(p_booking uuid, p_season uuid, p_quantity numeric, p_name text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  b    public.machinery_bookings;
  s    public.seasons;
  l    public.lands;
  me   uuid := auth.uid();
  v_c  uuid;
begin
  select * into b from public.machinery_bookings where id = p_booking for update;
  select * into s from public.seasons where id = p_season;
  if not found or s.owner_id <> me then raise exception 'اختر موسماً من مواسمك.'; end if;
  if s.status = 'completed' then raise exception 'هذا الموسم أُقفل.'; end if;
  if s.land_id is null then
    raise exception 'اربط موسمك بأرضك المسجّلة أولاً: منها تُعرف المحليّة التي يجتمع فيها الحجز.';
  end if;
  select * into l from public.lands where id = s.land_id;
  if not found or l.locality is null
     or lower(btrim(l.state)) <> lower(btrim(b.state)) or lower(btrim(l.locality)) <> lower(btrim(b.locality)) then
    raise exception 'هذا الحجز لمن أرضه في % — %.', b.locality, b.state;
  end if;
  if p_quantity is null or p_quantity <= 0 then raise exception 'اكتب الكمّيّة.'; end if;
  if b.unit = 'feddan' and p_quantity > s.feddans then
    raise exception 'الكمّيّة أكبر من مساحة موسمك (% فدان).', s.feddans;
  end if;
  -- Someone who left (or whose offer was cancelled from the contract page) may come back.
  update public.machinery_booking_members m set left_at = now()
   where m.booking_id = p_booking and m.member_id = me and m.left_at is null
     and not exists (select 1 from public.service_contracts c where c.id = m.contract_id and c.status in ('proposed', 'active'));
  if exists (select 1 from public.machinery_booking_members where booking_id = p_booking and member_id = me and left_at is null) then
    raise exception 'أنت في هذا الحجز من قبل.';
  end if;
  if (select count(*) from public._machinery_active(p_booking)) >= 50 then
    raise exception 'اكتمل عدد هذا الحجز (٥٠ مزارعاً)؛ افتح حجزاً آخر.';
  end if;

  perform set_config('app.machinery_booking', p_booking::text, true);
  insert into public.service_contracts (season_id, provider_id, client_id, title, status, booking_id)
  values (s.id, b.provider_id, me, left('حجز جماعيّ: ' || b.service_title, 160), 'draft', p_booking)
  returning id into v_c;
  perform set_config('app.machinery_booking', '', true);

  insert into public.contract_milestones (contract_id, seq, title, service_id, unit, quantity, unit_price,
                                          planned_start, planned_end, feasibility)
  values (v_c, 1, b.service_title, b.service_id, b.unit, p_quantity, b.unit_price, b.window_from, b.window_to,
          jsonb_build_object('basis', 'group_booking', 'booking', p_booking));

  -- The member offers it, as any client offers a contract (the status gate checks that it is the client).
  update public.service_contracts set status = 'proposed' where id = v_c;

  insert into public.machinery_booking_members (booking_id, member_id, season_id, quantity, display_name, contract_id)
  values (p_booking, me, s.id, p_quantity, public._machinery_name(p_name), v_c);
  return v_c;
end $$;

-- ── ما يفعله الناس ──────────────────────────────────────────────────────────

create function public.machinery_booking_open(
  p_service  uuid,
  p_season   uuid,
  p_quantity numeric,
  p_from     date,
  p_to       date,
  p_name     text
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  me  uuid := auth.uid();
  sv  public.services;
  pr  public.service_providers;
  s   public.seasons;
  l   public.lands;
  v_b uuid;
begin
  if me is null then raise exception 'سجّل الدخول أولاً.'; end if;
  select * into sv from public.services where id = p_service;
  if not found or not sv.active then raise exception 'هذه الخدمة غير معروضة.'; end if;
  select * into pr from public.service_providers where id = sv.provider_id;
  if pr.owner_id = me then raise exception 'لا تحجز من جهتك.'; end if;
  if not public._machinery_provider_ready(pr.id) then
    raise exception 'لم يؤكّد مقدّم الخدمة توفّره خلال آخر % يوماً؛ لا يُفتح عليه حجزٌ حتى يؤكّد.', public.machinery_fresh_days();
  end if;
  select * into s from public.seasons where id = p_season;
  if not found or s.owner_id <> me then raise exception 'اختر موسماً من مواسمك.'; end if;
  if s.land_id is null then
    raise exception 'اربط موسمك بأرضك المسجّلة أولاً: منها تُعرف المحليّة التي يجتمع فيها الحجز.';
  end if;
  select * into l from public.lands where id = s.land_id;
  if not found or l.locality is null or btrim(l.locality) = '' then
    raise exception 'أرض موسمك بلا محليّة؛ أكملها في صفحة الأرض.';
  end if;
  if p_from is null or p_to is null or p_from < current_date + sv.lead_time_days then
    raise exception 'أقرب موعدٍ لهذه الخدمة بعد % يوماً من اليوم.', sv.lead_time_days;
  end if;
  if p_to < p_from or p_to - p_from > 60 then
    raise exception 'المدّة من يومٍ إلى ستّين يوماً.';
  end if;

  insert into public.machinery_bookings (provider_id, service_id, organiser_id, state, locality, window_from, window_to,
                                         service_title, unit, unit_price, min_units)
  values (pr.id, sv.id, me, btrim(l.state), btrim(l.locality), p_from, p_to, sv.title, sv.unit, sv.price_per_unit, sv.min_units)
  returning id into v_b;
  perform public._machinery_add_member(v_b, p_season, p_quantity, p_name);
  return v_b;
end $$;

create function public.machinery_booking_join(p_booking uuid, p_season uuid, p_quantity numeric, p_name text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  b public.machinery_bookings;
begin
  if auth.uid() is null then raise exception 'سجّل الدخول أولاً.'; end if;
  select * into b from public.machinery_bookings where id = p_booking;
  if not found then raise exception 'لا حجز بهذا المعرّف.'; end if;
  if b.status <> 'open' then raise exception 'هذا الحجز لم يعد مفتوحاً للانضمام.'; end if;
  if exists (select 1 from public.service_providers where id = b.provider_id and owner_id = auth.uid()) then
    raise exception 'لا تنضمّ إلى حجزٍ على جهتك.';
  end if;
  if not public._machinery_provider_ready(b.provider_id) then
    raise exception 'لم يؤكّد مقدّم الخدمة توفّره خلال آخر % يوماً؛ لا انضمام حتى يؤكّد.', public.machinery_fresh_days();
  end if;
  return public._machinery_add_member(p_booking, p_season, p_quantity, p_name);
end $$;

create function public.machinery_booking_leave(p_booking uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  b  public.machinery_bookings;
  m  public.machinery_booking_members;
  v_next uuid;
begin
  if me is null then raise exception 'سجّل الدخول أولاً.'; end if;
  select * into b from public.machinery_bookings where id = p_booking for update;
  if not found then raise exception 'لا حجز بهذا المعرّف.'; end if;
  if b.status not in ('open', 'requested') then raise exception 'بُتّ في هذا الحجز؛ العقد الآن في صفحة العقود.'; end if;
  select * into m from public.machinery_booking_members
   where booking_id = p_booking and member_id = me and left_at is null;
  if not found then raise exception 'لست في هذا الحجز.'; end if;

  -- The client withdraws their own offer, as on the contract page.
  update public.service_contracts set status = 'cancelled' where id = m.contract_id and status = 'proposed';
  update public.machinery_booking_members set left_at = now() where id = m.id;

  if b.organiser_id = me then
    select a.member_id into v_next from public._machinery_active(p_booking) a limit 1;
    if v_next is null then
      update public.machinery_bookings set status = 'cancelled' where id = p_booking;
    else
      update public.machinery_bookings set organiser_id = v_next where id = p_booking;
    end if;
  end if;
end $$;

create function public.machinery_booking_request(p_booking uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  b public.machinery_bookings;
  v_total numeric;
begin
  if auth.uid() is null then raise exception 'سجّل الدخول أولاً.'; end if;
  select * into b from public.machinery_bookings where id = p_booking for update;
  if not found or b.organiser_id <> auth.uid() then raise exception 'إرسال الحجز للمنظّم وحده.'; end if;
  if b.status <> 'open' then raise exception 'أُرسل هذا الحجز أو بُتّ فيه.'; end if;
  select coalesce(sum(quantity), 0) into v_total from public._machinery_active(p_booking);
  if v_total < b.min_units then
    raise exception 'المجموع % ولا يُرسل الحجز قبل أن يبلغ %، الحدّ الأدنى لهذه الخدمة.', v_total, b.min_units;
  end if;
  update public.machinery_bookings set status = 'requested' where id = p_booking;
end $$;

-- The provider decides for the whole booking: every member's contract comes into force together, or none does.
create function public.machinery_booking_decide(p_booking uuid, p_accept boolean, p_reason text default null)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  b public.machinery_bookings;
  r record;
  n integer := 0;
begin
  if auth.uid() is null then raise exception 'سجّل الدخول أولاً.'; end if;
  select * into b from public.machinery_bookings where id = p_booking for update;
  if not found or not exists (select 1 from public.service_providers where id = b.provider_id and owner_id = auth.uid()) then
    raise exception 'القرار لمقدّم الخدمة وحده.';
  end if;
  if b.status <> 'requested' then raise exception 'هذا الحجز ليس بانتظار قرارك.'; end if;

  if p_accept then
    update public.machinery_bookings set status = 'accepted', decided_at = now() where id = p_booking;
    for r in select contract_id from public._machinery_active(p_booking) loop
      -- The provider signs, as on the contract page; the booking gate lets it through now that the booking is accepted.
      update public.service_contracts set status = 'active' where id = r.contract_id and status = 'proposed';
      n := n + 1;
    end loop;
  else
    if length(btrim(coalesce(p_reason, ''))) not between 3 and 300 then
      raise exception 'اكتب سبب الاعتذار (٣ أحرفٍ فأكثر): يقرؤه المزارعون.';
    end if;
    update public.machinery_bookings set status = 'declined', decided_at = now(), decline_reason = btrim(p_reason)
     where id = p_booking;
    for r in select contract_id from public._machinery_active(p_booking) loop
      update public.service_contracts set status = 'cancelled' where id = r.contract_id and status = 'proposed';
      n := n + 1;
    end loop;
  end if;
  return n;
end $$;

-- ── القراءة ──────────────────────────────────────────────────────────────────

-- What a signed-in person sees: every open booking (to join it), and every booking they are in, organise or provide.
create function public.machinery_bookings_list()
returns table (
  id             uuid,
  provider_id    uuid,
  provider_name  text,
  service_title  text,
  unit           public.service_unit,
  unit_price     numeric,
  min_units      numeric,
  state          text,
  locality       text,
  window_from    date,
  window_to      date,
  status         text,
  decline_reason text,
  members        integer,
  total          numeric,
  my_quantity    numeric,
  is_organiser   boolean,
  is_provider    boolean,
  created_at     timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  -- A member who has not left sees the booking whatever became of it (a declined one, with its reason); what they
  -- still have in it is what their offer still stands for.
  with mine as (
    select m.booking_id,
           sum(m.quantity) filter (where c.status in ('proposed', 'active')) as q
      from public.machinery_booking_members m
      join public.service_contracts c on c.id = m.contract_id
     where m.member_id = auth.uid() and m.left_at is null
     group by m.booking_id
  )
  select b.id, b.provider_id, p.name, b.service_title, b.unit, b.unit_price, b.min_units, b.state, b.locality,
         b.window_from, b.window_to, b.status, b.decline_reason,
         (select count(*)::integer from public._machinery_active(b.id)),
         (select coalesce(sum(a.quantity), 0) from public._machinery_active(b.id) a),
         mine.q,
         b.organiser_id = auth.uid(),
         p.owner_id = auth.uid(),
         b.created_at
    from public.machinery_bookings b
    join public.service_providers p on p.id = b.provider_id
    left join mine on mine.booking_id = b.id
   where auth.uid() is not null
     and (b.status = 'open' or mine.booking_id is not null or b.organiser_id = auth.uid() or p.owner_id = auth.uid() or is_admin())
   order by b.created_at desc
   limit 200
$$;

-- Who is in a booking, by the name each gave and the quantity: for its organiser, for the provider once it is sent to
-- them, and for the administrators. No phone, and no season: those reach the provider through the contract on acceptance.
create function public.machinery_booking_members(p_booking uuid)
returns table (display_name text, quantity numeric, joined_at timestamptz)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  b public.machinery_bookings;
begin
  select * into b from public.machinery_bookings where id = p_booking;
  if not found then return; end if;
  if not (b.organiser_id = auth.uid()
          or is_admin()
          or (b.status <> 'open' and exists (select 1 from public.service_providers p
                                               where p.id = b.provider_id and p.owner_id = auth.uid()))) then
    return;
  end if;
  return query select a.display_name, a.quantity, a.joined_at from public._machinery_active(p_booking) a;
end $$;

-- ── من ينادي ماذا ───────────────────────────────────────────────────────────

revoke execute on function
  public.providers_availability_stamp(), public.service_contracts_booking_gate(),
  public._machinery_name(text), public._machinery_provider_ready(uuid), public._machinery_active(uuid),
  public._machinery_add_member(uuid, uuid, numeric, text)
  from public, anon, authenticated, service_role;

revoke execute on function
  public.provider_confirm_availability(uuid, boolean),
  public.machinery_booking_open(uuid, uuid, numeric, date, date, text),
  public.machinery_booking_join(uuid, uuid, numeric, text),
  public.machinery_booking_leave(uuid),
  public.machinery_booking_request(uuid),
  public.machinery_booking_decide(uuid, boolean, text),
  public.machinery_bookings_list(),
  public.machinery_booking_members(uuid)
  from public, anon, service_role;

grant execute on function
  public.provider_confirm_availability(uuid, boolean),
  public.machinery_booking_open(uuid, uuid, numeric, date, date, text),
  public.machinery_booking_join(uuid, uuid, numeric, text),
  public.machinery_booking_leave(uuid),
  public.machinery_booking_request(uuid),
  public.machinery_booking_decide(uuid, boolean, text),
  public.machinery_bookings_list(),
  public.machinery_booking_members(uuid)
  to authenticated;

insert into supabase_migrations.schema_migrations (version, name) values ('20261025220000', 'machinery_availability_and_group_booking') on conflict do nothing;

-- ═══ 20261025220100_machinery_closed_account_names.sql ═══
-- الاسم في حجز الجرّار الجماعي يُخفى حين يُغلق صاحبه حسابه (البند ١٦٨، مع إغلاق الحساب في البند ١٩٥ وج٩ من ١٩٨).
--
-- `account_close` يكتب «حساب مُغلَق» مكان الاسم في كلّ جدولٍ عامّ نُسخ إليه الاسم، وكُتب قبل أن يوجد حجز الجرّار؛
-- فالاسم الذي كتبه العضو في حجزه (`machinery_booking_members.display_name`) يُخفى هنا، لحظةَ يُسجَّل الحساب في
-- `closed_accounts` — في المعاملة نفسها التي تُغلقه.

create function public.machinery_hide_closed_name()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.machinery_booking_members set display_name = 'حساب مُغلَق' where member_id = new.user_id;
  return null;
end $$;

create trigger machinery_hide_closed_name
  after insert on public.closed_accounts
  for each row execute function public.machinery_hide_closed_name();

revoke execute on function public.machinery_hide_closed_name() from public, anon, authenticated, service_role;

insert into supabase_migrations.schema_migrations (version, name) values ('20261025220100', 'machinery_closed_account_names') on conflict do nothing;

-- ═══ 20261025220200_machinery_booking_notifications.sql ═══
-- إشعاراتُ الحجز الجماعيّ للجرّار (بقيّة البند ١٦٨).
--
-- الحجز يمرّ بثلاث لحظاتٍ يعني كلٌّ منها شخصاً لم يفعل شيئاً فيها، فلا يعرف بها إلا إن أُخبر:
--   - ينضمّ عضو: يعرف المنظّم، ليرسل الحجز حين يبلغ المجموع حدّه الأدنى؛
--   - يرسل المنظّم الحجز: يعرف مقدّم الخدمة أنّ قراراً ينتظره؛
--   - يقبل مقدّم الخدمة أو يعتذر: يعرف كلّ عضوٍ باقٍ، ومع الاعتذار سببه.
-- بمشغّلين على الجدولين، فتبقى دوالّ الحجز كما هي، ويُخبَر بكلّ لحظةٍ مهما كان الطريق إليها.

-- ── نوع الإشعار ─────────────────────────────────────────────────────────────

do $$
declare v_def text;
begin
  select pg_get_constraintdef(oid) into v_def
    from pg_constraint
   where conname = 'notifications_kind_check' and conrelid = 'public.notifications'::regclass;
  -- The production check lists every kind; one written another way (the gates' base schema) is left alone.
  if v_def like '%ARRAY[%' and v_def not like '%machinery_booking%' then
    execute 'alter table public.notifications drop constraint notifications_kind_check';
    execute 'alter table public.notifications add constraint notifications_kind_check '
         || regexp_replace(v_def, '\]\)\)\)\s*$', ', ''machinery_booking''::text])))');
    select pg_get_constraintdef(oid) into v_def
      from pg_constraint
     where conname = 'notifications_kind_check' and conrelid = 'public.notifications'::regclass;
    if v_def not like '%machinery_booking%' then
      raise exception 'لم يُضَف نوع الإشعار machinery_booking';
    end if;
  end if;
end $$;

-- ── الإرسال، والقرار ────────────────────────────────────────────────────────

create function public.machinery_booking_notify()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_where text := new.service_title || ' في ' || new.locality;
  v_owner uuid;
  r record;
begin
  if old.status = 'open' and new.status = 'requested' then
    select owner_id into v_owner from public.service_providers where id = new.provider_id;
    if v_owner is not null then
      perform public.notify_user(
        v_owner, 'machinery_booking', 'حجزٌ جماعيّ ينتظر قرارك: ' || v_where,
        'بلغ الحجز حدّه الأدنى وأرسله المنظّم. اقبله كلّه أو اعتذر عنه كلّه، من صفحة الحجوزات.',
        '/services/machinery');
    end if;
  elsif old.status = 'requested' and new.status in ('accepted', 'declined') then
    for r in
      select distinct m.member_id from public.machinery_booking_members m
       where m.booking_id = new.id and m.left_at is null
    loop
      perform public.notify_user(
        r.member_id, 'machinery_booking',
        case new.status when 'accepted' then 'قُبل حجزك الجماعيّ: ' else 'اعتذر مقدّم الخدمة عن حجزك: ' end || v_where,
        case new.status
          when 'accepted' then 'صار عقدك مع مقدّم الخدمة سارياً، والموعد بين ' || new.window_from || ' و' || new.window_to || '.'
          else 'السبب: ' || coalesce(new.decline_reason, '') || '. أُلغي عقدك معه، ولا شيء عليك.'
        end,
        '/services/machinery');
    end loop;
  end if;
  return null;
end $$;

create trigger machinery_booking_notify
  after update of status on public.machinery_bookings
  for each row execute function public.machinery_booking_notify();

-- ── الانضمام ────────────────────────────────────────────────────────────────

create function public.machinery_member_notify()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare b public.machinery_bookings;
begin
  select * into b from public.machinery_bookings where id = new.booking_id;
  if found and new.member_id <> b.organiser_id then
    perform public.notify_user(
      b.organiser_id, 'machinery_booking', 'انضمّ عضوٌ إلى حجزك: ' || b.service_title || ' في ' || b.locality,
      'انضمّ ' || new.display_name || ' بـ' || new.quantity || '. أرسل الحجز حين يبلغ المجموع حدّه الأدنى.',
      '/services/machinery');
  end if;
  return null;
end $$;

create trigger machinery_member_notify
  after insert on public.machinery_booking_members
  for each row execute function public.machinery_member_notify();

revoke execute on function public.machinery_booking_notify(), public.machinery_member_notify()
  from public, anon, authenticated, service_role;

insert into supabase_migrations.schema_migrations (version, name) values ('20261025220200', 'machinery_booking_notifications') on conflict do nothing;

-- ═══ 20261025230000_projects_suppliers_private_ids.sql ═══
-- معرّفات الحسابات ومسار مستند الترخيص في `projects` و`suppliers` لا يقرؤها كلّ مسجَّل (البند ١٨١، بقيّة DB-12).
--
-- منذ 20261022050000_visitor_columns حُجبت هذه الأعمدة عن الزائر، وبقيت لكلّ مسجَّل:
--   - `projects`: `created_by` و`review_note` (ملاحظة المراجعة) و`land_id`؛
--   - `suppliers`: `owner_id` و`licence_doc_path` (مسار مستند الترخيص في المخزن) و`verified_by` (من وثّق من الإدارة).
-- الصفوف نفسها لا يراها المسجَّل إلا منشورةً موثّقة، لكنّ أعمدتها هذه لصاحبها وللإدارة وحدهما. فتُسحب من `authenticated`
-- ويقرؤها صاحب الصفّ والمدير بدالّتين، والصفحات تطلب ما بقي.
--
-- ومن صفحة المشروع يحتاج العضو أرض المشروع ليجد بطاقة عرضها للمستثمرين: `project_open_land` تعطيها إن كانت الأرض
-- معروضةً للمستثمرين الآن (بشروط `investor_open_lands` نفسها)، أو كان القارئ صاحب المشروع أو مديراً.
--
-- لا حذف لبيانات: صلاحيّاتٌ تُستبدل ودوالّ تُضاف.

-- ── المشاريع ────────────────────────────────────────────────────────────────
-- hidden from members: created_by, review_note, land_id (the same list a visitor reads)
revoke select on table public.projects from authenticated;
grant select (id, slug, name, location, description, total_feddans, price_per_share, total_shares,
              shares_sold, status, risk_level, expected_annual_return, cover_image_url, created_at,
              is_demo, review_status, submitted_by, risk_score, crop_key, station_key,
              planting_month, irrigation, water_source, declared_water_per_feddan,
              documents_on_file, documents_required, km_to_market)
  on table public.projects to authenticated;

-- ── الموردون ────────────────────────────────────────────────────────────────
-- hidden from members: owner_id, licence_doc_path, verified_by, review_note
revoke select on table public.suppliers from authenticated;
grant select (id, name, state, locality, phone, whatsapp, delivery_states, categories,
              pesticide_licence_no, seed_registration_no, commercial_registration_no,
              bio, verified_at, active, created_at, updated_at)
  on table public.suppliers to authenticated;

-- ── ما حُجب يقرؤه صاحبه والإدارة ────────────────────────────────────────────

-- The withheld columns of the projects the reader submitted or created, or of all of them for an administrator.
create function public.project_private(p_ids uuid[] default null)
returns table (id uuid, created_by uuid, review_note text, land_id uuid)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, p.created_by, p.review_note, p.land_id
    from projects p
   where (p_ids is null or p.id = any (p_ids))
     and (p.submitted_by = auth.uid() or p.created_by = auth.uid() or is_admin());
$$;

-- The withheld columns of the reader's own supplier, or of all of them for an administrator.
create function public.supplier_private(p_ids uuid[] default null)
returns table (id uuid, owner_id uuid, licence_doc_path text, verified_by uuid)
language sql
stable
security definer
set search_path = public
as $$
  select s.id, s.owner_id, s.licence_doc_path, s.verified_by
    from suppliers s
   where (p_ids is null or s.id = any (p_ids))
     and (s.owner_id = auth.uid() or is_admin());
$$;

-- The land a project stands on, for its page: when that land is open to investors now, or to its owner and the admins.
create function public.project_open_land(p_project uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select p.land_id
    from projects p
    join lands l on l.id = p.land_id
   where p.id = p_project
     and ((p.status <> 'draft' and l.verification = 'verified' and l.open_to_investors
           and cardinality(l.investor_models) > 0)
          or p.submitted_by = auth.uid() or p.created_by = auth.uid() or is_admin());
$$;

revoke execute on function public.project_private(uuid[]), public.supplier_private(uuid[]), public.project_open_land(uuid)
  from public, anon, service_role;
grant execute on function public.project_private(uuid[]), public.supplier_private(uuid[]), public.project_open_land(uuid)
  to authenticated;

insert into supabase_migrations.schema_migrations (version, name) values ('20261025230000', 'projects_suppliers_private_ids') on conflict do nothing;

-- ═══ 20261025230100_partner_companies_private_ids.sql ═══
-- معرّف صاحب الشركة الشريكة ومن وثّقها لا يقرؤهما كلّ مسجَّل (بقيّة DB-12، كما في 20261025230000 للمشاريع والموردين).
--
-- منذ 20261022050000_visitor_columns حُجب `owner_id` و`verified_by` في `partner_companies` عن الزائر، وبقيا لكلّ
-- مسجَّل: معرّف حساب صاحب الشركة، ومعرّف المدير الذي وثّقها. فيُسحبان من `authenticated`، ويقرؤهما صاحب الشركة
-- والإدارة بدالّة، والصفحتان تطلبان ما بقي.
--
-- لا حذف لبيانات: صلاحيّاتٌ تُستبدل ودالّةٌ تُضاف. والكتابة كلّها بالدوالّ منذ 20261017120000، فلا تمسّها.

-- hidden from members: owner_id, verified_by, review_note (the same list a visitor reads)
revoke select on table public.partner_companies from authenticated;
grant select (id, name, commercial_registration_no, kinds, states, contact_name, phone, whatsapp,
              bio, verified_at, active, created_at, updated_at)
  on table public.partner_companies to authenticated;

-- A policy's subquery reads as the reader, so partner_interests_parties (20261017120000) — which asked
-- partner_companies.owner_id directly — would fail for every member once the column is withheld (audit db-b-3,
-- 3 November 2026). It asks the security-definer helper instead, as the policies moved in 20261022050000 do.
alter policy partner_interests_parties on public.partner_interests
  using (owns_partner_company(company_id)
         or exists (select 1 from lands l where l.id = land_id and l.owner_id = (select auth.uid()))
         or is_admin());

-- The withheld columns of the reader's own company, or of all of them for an administrator.
create function public.partner_company_private(p_ids uuid[] default null)
returns table (id uuid, owner_id uuid, verified_by uuid)
language sql
stable
security definer
set search_path = public
as $$
  select c.id, c.owner_id, c.verified_by
    from partner_companies c
   where (p_ids is null or c.id = any (p_ids))
     and (c.owner_id = auth.uid() or is_admin());
$$;

revoke execute on function public.partner_company_private(uuid[]) from public, anon, service_role;
grant execute on function public.partner_company_private(uuid[]) to authenticated;

insert into supabase_migrations.schema_migrations (version, name) values ('20261025230100', 'partner_companies_private_ids') on conflict do nothing;

-- ═══ 20261026010000_research_library.sql ═══
-- مكتبة الدراسات والبحوث (البند ٢٠٢؛ المالك، 26 أكتوبر 2026: «إمكانية مشاركة المسجلين والزوار وعرض دراستهم
-- وبحوثهم… لتكون رافد معرفي للمستقبل»).
--
-- يرسل أيّ أحد — زائرٌ أو مسجَّل — دراسة جدوى أو بحثاً أو رسالةً جامعيّة أو تقريراً: ملفّ PDF في دلوٍ خاصّ، أو رابطاً،
-- ومعه ملخّصٌ ومؤلّفون وجهةٌ وسنة. لا يُنشر شيءٌ بإرساله: تراجعه الإدارة فتنشره أو تردّه بسبب.
--
--   - الكتابة من خادم الموقع وحده (‎/api/research‎)، بعد حدٍّ لكلّ عنوان وبمفتاح الخدمة، كنموذج الملاحظات
--     (20261025200300): لا يملك المفتاح العامّ INSERT، فلا يملأ سكربتٌ الجدول.
--   - الزائر والعضو يقرآن المنشور وحده، وبأعمدته العامّة: لا وسيلة تواصل المرسِل، ولا معرّفه، ولا ملاحظة المراجع.
--   - المرسِل المسجَّل يرى ما أرسل وحاله بـ`research_mine()`، والإدارة تقرأ كلّ شيء وتقرّر بـ`research_review()`.
--   - الملفّ في دلو `research` الخاصّ (PDF حتى ٢٠ ميجابايت)، يُرفع إليه برابطٍ موقَّع يصنعه الخادم، ويُقرأ برابطٍ
--     موقَّع للمنشور وحده.

create table public.research_items (
  id            uuid primary key default gen_random_uuid(),
  kind          text not null check (kind in ('feasibility', 'research', 'thesis', 'report', 'other')),
  title         text not null check (length(btrim(title)) between 5 and 200),
  authors       text not null check (length(btrim(authors)) between 2 and 200),
  institution   text check (institution is null or length(institution) <= 200),
  year          integer check (year is null or year between 1950 and 2100),
  language      text not null default 'ar' check (language in ('ar', 'en', 'other')),
  crop          text check (crop is null or length(crop) <= 60),
  state         text check (state is null or length(state) <= 60),
  abstract      text not null check (length(btrim(abstract)) between 40 and 3000),
  file_path     text check (file_path is null or file_path ~ '^incoming/[0-9a-f-]{36}\.pdf$'),
  link_url      text check (link_url is null or (link_url ~ '^https://' and length(link_url) <= 500)),
  -- Private: how the administration reaches the sender, never shown.
  contact       text check (contact is null or length(contact) <= 200),
  submitted_by  uuid references auth.users(id) on delete set null,
  -- The sender says the work is theirs to share, or published already; nothing is taken without it.
  consent       boolean not null check (consent),
  status        text not null default 'pending' check (status in ('pending', 'published', 'rejected')),
  review_note   text check (review_note is null or length(review_note) <= 500),
  reviewed_by   uuid references auth.users(id) on delete set null,
  reviewed_at   timestamptz,
  published_at  timestamptz,
  created_at    timestamptz not null default now(),
  constraint research_items_has_work check (file_path is not null or link_url is not null),
  constraint research_items_one_file unique (file_path),
  constraint research_items_published check ((status = 'published') = (published_at is not null)),
  constraint research_items_rejected_why check (status <> 'rejected' or length(btrim(coalesce(review_note, ''))) >= 3)
);

create index research_items_published_idx on public.research_items (published_at desc) where status = 'published';
create index research_items_pending_idx on public.research_items (created_at) where status = 'pending';

alter table public.research_items enable row level security;

-- Everyone reads what is published; the administrators read everything.
create policy research_items_read on public.research_items
  for select to anon, authenticated
  using (status = 'published' or (select is_admin()));

revoke all on table public.research_items from anon, authenticated;
grant select (id, kind, title, authors, institution, year, language, crop, state, abstract, file_path, link_url,
              status, published_at, created_at)
  on table public.research_items to anon, authenticated;

-- ── ما يكتبه الخادم ──────────────────────────────────────────────────────────

-- The site's server writes with the service key after its own per-address limit (/api/research). Whatever it writes
-- starts pending and unreviewed, and a ceiling of 200 an hour holds the table against an attack from many addresses.
create function public.research_items_insert_gate()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.status := 'pending';
  new.review_note := null;
  new.reviewed_by := null;
  new.reviewed_at := null;
  new.published_at := null;
  new.created_at := now();
  if (select count(*) from research_items where created_at > now() - interval '1 hour') >= 200 then
    raise exception 'الإرسال كثيرٌ الآن. أعد المحاولة بعد قليل.';
  end if;
  return new;
end $$;

create trigger research_items_insert_gate
  before insert on public.research_items
  for each row execute function public.research_items_insert_gate();

-- ── المرسِل ─────────────────────────────────────────────────────────────────

-- What a signed-in sender sent, with its state and the reviewer's note.
create function public.research_mine()
returns table (id uuid, kind text, title text, status text, review_note text, created_at timestamptz,
               published_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select r.id, r.kind, r.title, r.status, r.review_note, r.created_at, r.published_at
    from research_items r
   where r.submitted_by = auth.uid()
   order by r.created_at desc;
$$;

-- ── الإدارة ─────────────────────────────────────────────────────────────────

-- Publish, or return with a reason. A published work can be withdrawn the same way (with a reason).
create function public.research_review(p_id uuid, p_publish boolean, p_note text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.research_items;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
begin
  if not is_admin() then raise exception 'للإدارة وحدها.'; end if;
  select * into r from research_items where id = p_id for update;
  if not found then raise exception 'لا عمل بهذا المعرّف.'; end if;
  if not p_publish and length(coalesce(v_note, '')) < 3 then
    raise exception 'اكتب سبب الردّ (٣ أحرفٍ فأكثر): يقرؤه المرسِل.';
  end if;
  update research_items
     set status = case when p_publish then 'published' else 'rejected' end,
         review_note = left(v_note, 500),
         reviewed_by = auth.uid(),
         reviewed_at = now(),
         published_at = case when p_publish then coalesce(r.published_at, now()) end
   where id = p_id;
  if r.submitted_by is not null then
    perform notify_user(
      r.submitted_by, 'research_reviewed',
      case when p_publish then 'نُشر عملك في مكتبة الدراسات: ' else 'رُدّ عملك المرسَل إلى مكتبة الدراسات: ' end
        || left(r.title, 120),
      case when p_publish then 'صار في المكتبة يقرؤه الجميع. شكراً لمشاركتك.'
           else 'السبب: ' || v_note end,
      case when p_publish then '/library/' || p_id else '/library/mine' end);
  end if;
end $$;

-- Everything waiting, for the review page and the admin queue.
create function public.research_pending()
returns table (id uuid, kind text, title text, authors text, institution text, year integer, crop text, state text,
               abstract text, file_path text, link_url text, contact text, submitted_by uuid, created_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select r.id, r.kind, r.title, r.authors, r.institution, r.year, r.crop, r.state, r.abstract, r.file_path, r.link_url,
         r.contact, r.submitted_by, r.created_at
    from research_items r
   where r.status = 'pending' and is_admin()
   order by r.created_at;
$$;

revoke execute on function public.research_items_insert_gate() from public, anon, authenticated, service_role;
revoke execute on function public.research_mine(), public.research_review(uuid, boolean, text), public.research_pending()
  from public, anon, service_role;
grant execute on function public.research_mine(), public.research_review(uuid, boolean, text), public.research_pending()
  to authenticated;

-- ── نوع الإشعار ─────────────────────────────────────────────────────────────

do $$
declare v_def text;
begin
  select pg_get_constraintdef(oid) into v_def
    from pg_constraint
   where conname = 'notifications_kind_check' and conrelid = 'public.notifications'::regclass;
  if v_def like '%ARRAY[%' and v_def not like '%research_reviewed%' then
    execute 'alter table public.notifications drop constraint notifications_kind_check';
    execute 'alter table public.notifications add constraint notifications_kind_check '
         || regexp_replace(v_def, '\]\)\)\)\s*$', ', ''research_reviewed''::text])))');
    select pg_get_constraintdef(oid) into v_def
      from pg_constraint
     where conname = 'notifications_kind_check' and conrelid = 'public.notifications'::regclass;
    if v_def not like '%research_reviewed%' then
      raise exception 'لم يُضَف نوع الإشعار research_reviewed';
    end if;
  end if;
end $$;

-- ── الدلو ───────────────────────────────────────────────────────────────────

-- Private: no policy lets a visitor or a member read or write it. The server uploads into it with a signed upload URL
-- it makes for one path, and hands out a signed download URL for a published work.
do $$
begin
  if to_regclass('storage.buckets') is null then
    return;
  end if;
  -- Supabase's table names each bucket; a copy without the column (the gates' harness) takes the id alone.
  if exists (select 1 from information_schema.columns
              where table_schema = 'storage' and table_name = 'buckets' and column_name = 'name') then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('research', 'research', false, 20971520, array['application/pdf'])
    on conflict (id) do nothing;
  else
    insert into storage.buckets (id, public, file_size_limit, allowed_mime_types)
    values ('research', false, 20971520, array['application/pdf'])
    on conflict (id) do nothing;
  end if;
end $$;

insert into supabase_migrations.schema_migrations (version, name) values ('20261026010000', 'research_library') on conflict do nothing;

-- ═══ 20261026020000_agent_mandates.sql ═══
-- وضع الوكيل (البند ١٦٩، الغنيمة ٧ من Apollo وMercy Corps).
--
-- شركةٌ أو جمعيّةٌ موثّقة تعمل عن مزارعٍ لا يحسن التطبيق أو لا يصل إليه: تسجّل أرضه وترفع أوراقها، وتتابع مواسمه
-- وقطيعه. ولا يكون ذلك إلا بإذنٍ مسجَّل يعطيه المزارع من حسابه هو:
--   - الوكيل يطلب برقم جوّال المزارع، ويقول لماذا، ويختار ما يطلبه (الأراضي، المواسم، القطيع)؛
--   - المزارع يقبل أو يعتذر، ولا يرى الوكيلُ اسمه قبل القبول؛
--   - يُنهيه أيٌّ منهما متى شاء، فيسقط كلّ ما كان للوكيل في الحال؛
--   - وكلّ ما يكتبه الوكيل باسم المزارع يُسجَّل في سجلٍّ لا يُعدَّل، ويُخبَر به المزارع.
--
-- ما يملكه الوكيل في هذه الشريحة: قراءةُ ما أُذن له فيه، وتسجيلُ أرضٍ للمزارع وتعديلُها ورفعُ مستنداتها. ولا حذفَ
-- لشيءٍ من مال المزارع، ولا نقلَ لأرضٍ من صاحبها إلى غيره (حارسٌ جديد على `lands`). والمواسم والقطيع قراءةٌ فقط
-- حتى الآن: كتابتُها تمرّ بالدفتر والمراحل وحرّاسها، فلها شريحتها.
--
-- والوكيل شركةٌ في `partner_companies` موثّقةٌ وفعّالة؛ يتصرّف عنها صاحبُ حسابها. فإن سُحب توثيقها أو عُطّلت سقط
-- إذنها بلا خطوةٍ أخرى، لأنّ الفحص يقرأ حالها في كلّ مرّة. وكذلك حسابُ مزارعٍ أُغلق.

-- ── نوع الإشعار ─────────────────────────────────────────────────────────────

do $$
declare v_def text;
begin
  select pg_get_constraintdef(oid) into v_def
    from pg_constraint
   where conname = 'notifications_kind_check' and conrelid = 'public.notifications'::regclass;
  -- The production check lists every kind; one written another way (the gates' base schema) is left alone.
  if v_def like '%ARRAY[%' and v_def not like '%agent_mandate%' then
    execute 'alter table public.notifications drop constraint notifications_kind_check';
    execute 'alter table public.notifications add constraint notifications_kind_check '
         || regexp_replace(v_def, '\]\)\)\)\s*$', ', ''agent_mandate''::text])))');
    select pg_get_constraintdef(oid) into v_def
      from pg_constraint
     where conname = 'notifications_kind_check' and conrelid = 'public.notifications'::regclass;
    if v_def not like '%agent_mandate%' then
      raise exception 'لم يُضَف نوع الإشعار agent_mandate';
    end if;
  end if;
end $$;

-- ── الإذن ───────────────────────────────────────────────────────────────────

create table public.agent_mandates (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null references public.partner_companies(id) on delete cascade,
  farmer_id     uuid not null references auth.users(id) on delete cascade,
  scopes        text[] not null
                check (cardinality(scopes) between 1 and 3 and scopes <@ array['lands', 'seasons', 'herds']),
  -- لماذا يطلب: يقرؤه المزارع قبل أن يقبل.
  note          text not null check (length(btrim(note)) between 10 and 300),
  -- آخر أربعة أرقامٍ من الجوّال الذي كُتب، ليعرف الوكيل أيّ طلبٍ هذا قبل أن يُقبل.
  phone_tail    text not null check (phone_tail ~ '^[0-9]{4}$'),
  status        text not null default 'pending'
                check (status in ('pending', 'active', 'declined', 'withdrawn', 'revoked')),
  requested_by  uuid not null references auth.users(id),
  requested_at  timestamptz not null default now(),
  answered_at   timestamptz,
  ended_at      timestamptz,
  ended_by      uuid references auth.users(id),
  check ((answered_at is not null) = (status in ('active', 'declined', 'revoked'))),
  check ((ended_at is not null) = (status in ('withdrawn', 'revoked'))),
  check ((ended_by is not null) = (ended_at is not null))
);

-- طلبٌ مفتوحٌ واحد أو إذنٌ قائمٌ واحد بين الوكيل والمزارع.
create unique index agent_mandates_open on public.agent_mandates (company_id, farmer_id)
  where status in ('pending', 'active');
create index agent_mandates_farmer on public.agent_mandates (farmer_id) where status in ('pending', 'active');

alter table public.agent_mandates enable row level security;

-- لا يكتب فيه أحدٌ إلا بالدوالّ أدناه، ولا يقرؤه زائر.
revoke all on public.agent_mandates from anon;
revoke insert, update, delete, truncate on public.agent_mandates from authenticated;
-- Since 20261024030000 a new table is readable by nobody until granted (audit db-b-2): the policy picks the rows.
grant select on public.agent_mandates to authenticated;

-- The company side is asked through owns_partner_company() (security definer): partner_companies.owner_id is withheld
-- from members by 20261025230100, and a policy's subquery reads as the reader (audit db-b-3).
create policy agent_mandates_read on public.agent_mandates
  for select to authenticated
  using (farmer_id = auth.uid()
         or owns_partner_company(company_id)
         or is_admin());

-- ── السجلّ ──────────────────────────────────────────────────────────────────

-- ما كتبه الوكيل باسم المزارع. يُلحَق ولا يُعدَّل ولا يُحذف، حتى بعد انتهاء الإذن.
create table public.agent_actions (
  id          bigint generated always as identity primary key,
  mandate_id  uuid not null references public.agent_mandates(id) on delete restrict,
  agent_id    uuid not null references auth.users(id),
  farmer_id   uuid not null references auth.users(id),
  subject     text not null check (subject in ('land', 'land_document')),
  subject_id  uuid not null,
  action      text not null check (action in ('insert', 'update')),
  at          timestamptz not null default now()
);

create index agent_actions_farmer on public.agent_actions (farmer_id, at desc);
create index agent_actions_mandate on public.agent_actions (mandate_id, at desc);

alter table public.agent_actions enable row level security;
revoke all on public.agent_actions from anon;
revoke insert, update, delete, truncate on public.agent_actions from authenticated;
grant select on public.agent_actions to authenticated;

create policy agent_actions_read on public.agent_actions
  for select to authenticated
  using (farmer_id = auth.uid() or agent_id = auth.uid() or is_admin());

create function public.agent_actions_keep()
returns trigger
language plpgsql
as $$
begin
  raise exception 'سجلّ الوكيل يُلحَق ولا يُعدَّل.';
end $$;

create trigger agent_actions_keep
  before update or delete on public.agent_actions
  for each row execute function public.agent_actions_keep();

-- ── الفحص الذي تقرؤه السياسات ───────────────────────────────────────────────

-- الإذن القائم الذي يعمل به المنادي عن هذا المزارع في هذا النطاق، أو لا شيء.
create function public.agent_mandate_for(p_farmer uuid, p_scope text)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select m.id
    from agent_mandates m
    join partner_companies c on c.id = m.company_id
   where m.farmer_id = p_farmer
     and m.status = 'active'
     and p_scope = any (m.scopes)
     and c.owner_id = auth.uid()
     and c.verified_at is not null
     and c.active
     and not exists (select 1 from closed_accounts x where x.user_id = m.farmer_id)
   limit 1
$$;

create function public.is_agent_for(p_farmer uuid, p_scope text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_farmer is not null and p_farmer <> auth.uid() and public.agent_mandate_for(p_farmer, p_scope) is not null
$$;

revoke execute on function public.agent_mandate_for(uuid, text) from public, anon;
revoke execute on function public.is_agent_for(uuid, text) from public, anon;
grant execute on function public.agent_mandate_for(uuid, text) to authenticated;
grant execute on function public.is_agent_for(uuid, text) to authenticated;

-- ── ما يراه الوكيل ويكتبه ───────────────────────────────────────────────────

create policy lands_agent_read on public.lands
  for select to authenticated using (public.is_agent_for(owner_id, 'lands'));
create policy lands_agent_insert on public.lands
  for insert to authenticated with check (public.is_agent_for(owner_id, 'lands'));
create policy lands_agent_update on public.lands
  for update to authenticated
  using (public.is_agent_for(owner_id, 'lands'))
  with check (public.is_agent_for(owner_id, 'lands'));

create policy land_documents_agent_read on public.land_documents
  for select to authenticated
  using (exists (select 1 from public.lands l
                  where l.id = land_documents.land_id and public.is_agent_for(l.owner_id, 'lands')));
create policy land_documents_agent_insert on public.land_documents
  for insert to authenticated
  with check (exists (select 1 from public.lands l
                       where l.id = land_documents.land_id and public.is_agent_for(l.owner_id, 'lands')));

-- المواسم والقطيع لا سياسة لها هنا بل دالّتان (في آخر الملفّ): صفحات «مواسمي» و«قطيعي» تقرأ كلّ ما تسمح به
-- السياسات، فلو سُمح للوكيل بها لاختلطت مواسم مزارعيه بمواسمه هو.

-- أرضٌ لا تنتقل من صاحبها بيد أحدٍ غير الإدارة. لم يكن لهذا حارس لأنّ السياسة الوحيدة كانت تُلزم أن يكون الصفّ
-- الجديد لصاحبه؛ أمّا الوكيل فيعمل عن أكثر من مزارع، فلولا هذا لنقل أرضاً من أحدهم إلى آخر.
create function public.lands_owner_fixed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.owner_id is distinct from old.owner_id and auth.uid() is not null and not is_admin() then
    raise exception 'الأرض لا تنتقل من صاحبها.';
  end if;
  return new;
end $$;

create trigger lands_owner_fixed
  before update on public.lands
  for each row execute function public.lands_owner_fixed();

-- ما يكتبه الوكيل يُسجَّل، وتسجيلُ أرضٍ باسم المزارع يُخبَر به.
create function public.agent_action_log()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_farmer uuid;
  v_land uuid;
  v_mandate uuid;
  v_company text;
  v_subject text := case tg_table_name when 'lands' then 'land' else 'land_document' end;
begin
  if auth.uid() is null then
    return null;
  end if;
  if tg_table_name = 'lands' then
    -- A document added recounts the land's papers; that is the document's line in the log, not a second one.
    if tg_op = 'UPDATE' and (to_jsonb(new) - 'documents_on_file') = (to_jsonb(old) - 'documents_on_file') then
      return null;
    end if;
    v_farmer := new.owner_id;
    v_land := new.id;
  else
    select l.owner_id into v_farmer from lands l where l.id = new.land_id;
    v_land := new.land_id;
  end if;
  if v_farmer is null or v_farmer = auth.uid() then
    return null;
  end if;
  v_mandate := public.agent_mandate_for(v_farmer, 'lands');
  if v_mandate is null then
    return null;   -- the admin, or the server's key
  end if;
  insert into agent_actions (mandate_id, agent_id, farmer_id, subject, subject_id, action)
  values (v_mandate, auth.uid(), v_farmer, v_subject, new.id, lower(tg_op));

  if tg_table_name = 'lands' and tg_op = 'INSERT' then
    select c.name into v_company
      from agent_mandates m join partner_companies c on c.id = m.company_id
     where m.id = v_mandate;
    perform public.notify_user(
      v_farmer, 'agent_mandate', 'سجّل وكيلك أرضاً باسمك: ' || new.name,
      'سجّلتها «' || v_company || '» بالإذن الذي أعطيتها. تراها في «أراضيّ»، وما كتبه الوكيل كلّه في «وكلائي».',
      '/lands/' || v_land);
  end if;
  return null;
end $$;

create trigger lands_agent_log
  after insert or update on public.lands
  for each row execute function public.agent_action_log();
create trigger land_documents_agent_log
  after insert on public.land_documents
  for each row execute function public.agent_action_log();

-- ── الطلب والجواب والإنهاء ──────────────────────────────────────────────────

-- The last nine digits of a Sudanese number are the number, whether it was typed as 09…, 2499… or +2499….
create function public.phone_key(p text)
returns text
language sql
immutable
as $$
  select nullif(right(regexp_replace(coalesce(p, ''), '\D', '', 'g'), 9), '')
$$;

create function public.agent_scopes_label(p_scopes text[])
returns text
language sql
immutable
as $$
  select string_agg(case s when 'lands' then 'أراضيك' when 'seasons' then 'مواسمك' else 'قطيعك' end, ' و'
                    order by array_position(array['lands', 'seasons', 'herds'], s))
    from unnest(p_scopes) s
$$;

create function public.agent_mandate_request(p_phone text, p_scopes text[], p_note text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company partner_companies%rowtype;
  v_key text := public.phone_key(p_phone);
  v_farmers uuid[];
  v_id uuid;
begin
  select * into v_company from partner_companies
   where owner_id = auth.uid() and verified_at is not null and active;
  if not found then
    raise exception 'وضع الوكيل لشركةٍ أو جمعيّةٍ موثّقة: سجّلها في «الشركاء» وانتظر توثيقها.';
  end if;
  if v_key is null or length(v_key) < 9 then
    raise exception 'اكتب رقم جوّال المزارع كاملاً.';
  end if;
  if p_scopes is null or cardinality(p_scopes) = 0 then
    raise exception 'اختر ما تطلب الإذن فيه.';
  end if;
  -- A company writing to strangers by the hundred is not acting for farmers it knows.
  if (select count(*) from agent_mandates
       where company_id = v_company.id and requested_at > now() - interval '1 day') >= 30 then
    raise exception 'ثلاثون طلباً في اليوم حدُّ الوكيل. أكمل غداً.';
  end if;

  select array_agg(distinct x.id) into v_farmers from (
    select p.id from profiles p where public.phone_key(p.phone) = v_key
    union
    select u.id from auth.users u where public.phone_key(u.phone) = v_key
  ) x
  where x.id <> auth.uid()
    and not exists (select 1 from closed_accounts c where c.user_id = x.id);

  if v_farmers is null then
    raise exception 'لا حساب بهذا الرقم. يسجّل المزارع أوّلاً برقمه، ثمّ تطلب الإذن.';
  end if;
  if cardinality(v_farmers) > 1 then
    raise exception 'لهذا الرقم أكثر من حساب؛ تواصل مع الإدارة لتحدّد أيّها.';
  end if;

  if exists (select 1 from agent_mandates
              where company_id = v_company.id and farmer_id = v_farmers[1] and status in ('pending', 'active')) then
    raise exception 'بينك وبين صاحب هذا الرقم طلبٌ مفتوح أو إذنٌ قائم.';
  end if;

  insert into agent_mandates (company_id, farmer_id, scopes, note, phone_tail, requested_by)
  values (v_company.id, v_farmers[1], (select array_agg(distinct s order by s) from unnest(p_scopes) s),
          btrim(p_note), right(v_key, 4), auth.uid())
  returning id into v_id;

  perform public.notify_user(
    v_farmers[1], 'agent_mandate', '«' || v_company.name || '» تطلب أن تعمل عنك',
    'تطلب إذناً في: ' || public.agent_scopes_label(p_scopes) || '. وسببها: ' || btrim(p_note)
      || '. اقبل أو اعتذر من «وكلائي»، وتُنهيه متى شئت.',
    '/account/agents');
  return v_id;
end $$;

create function public.agent_mandate_answer(p_id uuid, p_accept boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  m agent_mandates%rowtype;
  v_owner uuid;
begin
  select * into m from agent_mandates where id = p_id and farmer_id = auth.uid() for update;
  if not found then
    raise exception 'لا طلب بهذا.';
  end if;
  if m.status <> 'pending' then
    raise exception 'أُجيب هذا الطلب أو سُحب.';
  end if;
  update agent_mandates
     set status = case when p_accept then 'active' else 'declined' end, answered_at = now()
   where id = p_id;
  select owner_id into v_owner from partner_companies where id = m.company_id;
  perform public.notify_user(
    v_owner, 'agent_mandate',
    case when p_accept then 'قبل المزارع إذنك (…' || m.phone_tail || ')' else 'اعتذر صاحب الرقم …' || m.phone_tail end,
    case when p_accept then 'صرت تعمل عنه في: ' || public.agent_scopes_label(m.scopes) || '. تجده في «مزارعيّ».'
         else 'لم يقبل الإذن. لا شيء عليك.' end,
    '/agent');
end $$;

-- Either side ends it: the company withdraws what is still pending, and either ends what is active.
create function public.agent_mandate_end(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  m agent_mandates%rowtype;
  v_owner uuid;
  v_name text;
  v_farmer_side boolean;
begin
  select * into m from agent_mandates where id = p_id for update;
  if not found then
    raise exception 'لا إذن بهذا.';
  end if;
  select owner_id, name into v_owner, v_name from partner_companies where id = m.company_id;
  v_farmer_side := m.farmer_id = auth.uid();
  if not v_farmer_side and v_owner is distinct from auth.uid() then
    raise exception 'لا إذن بهذا.';
  end if;
  if m.status = 'pending' and not v_farmer_side then
    update agent_mandates set status = 'withdrawn', ended_at = now(), ended_by = auth.uid() where id = p_id;
    return;
  end if;
  if m.status <> 'active' then
    raise exception 'هذا الإذن ليس قائماً.';
  end if;
  update agent_mandates set status = 'revoked', ended_at = now(), ended_by = auth.uid() where id = p_id;
  if v_farmer_side then
    perform public.notify_user(v_owner, 'agent_mandate', 'أنهى المزارع إذنك (…' || m.phone_tail || ')',
      'لم تعد تعمل عنه. ما سجّلته باسمه يبقى له.', '/agent');
  else
    perform public.notify_user(m.farmer_id, 'agent_mandate', 'أنهت «' || v_name || '» عملها عنك',
      'لم تعد تعمل عنك. ما سجّلته باسمك يبقى لك، وسجلّه في «وكلائي».', '/account/agents');
  end if;
end $$;

-- ── ما يقرؤه كلّ طرف ────────────────────────────────────────────────────────

-- للوكيل: طلباته وأذوناته؛ واسم المزارع وجوّاله لا يظهران إلا بعد قبوله وما دام الإذن قائماً.
create function public.agent_my_farmers()
returns table (id uuid, farmer_id uuid, full_name text, phone text, phone_tail text, scopes text[], status text,
               note text, requested_at timestamptz, answered_at timestamptz, ended_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select m.id,
         case when m.status = 'active' then m.farmer_id end,
         case when m.status = 'active' then p.full_name end,
         case when m.status = 'active' then p.phone end,
         m.phone_tail, m.scopes, m.status, m.note, m.requested_at, m.answered_at, m.ended_at
    from agent_mandates m
    join partner_companies c on c.id = m.company_id
    left join profiles p on p.id = m.farmer_id
   where c.owner_id = auth.uid()
   order by (m.status = 'active') desc, (m.status = 'pending') desc, m.requested_at desc
$$;

-- للمزارع: من طلب أن يعمل عنه، وما أُذن فيه، وحاله.
create function public.agent_my_agents()
returns table (id uuid, company_name text, company_phone text, scopes text[], status text, note text,
               requested_at timestamptz, answered_at timestamptz, ended_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select m.id, c.name, c.phone, m.scopes, m.status, m.note, m.requested_at, m.answered_at, m.ended_at
    from agent_mandates m
    join partner_companies c on c.id = m.company_id
   where m.farmer_id = auth.uid()
   order by (m.status = 'pending') desc, (m.status = 'active') desc, m.requested_at desc
$$;

-- مواسم المزارع وقطيعه، لمن أُذن له فيها، بتقدّم مراحلها.
create function public.agent_farmer_seasons(p_farmer uuid)
returns table (id uuid, name text, crop_key text, feddans numeric, planting_date date, harvest_date date, status text,
               land_id uuid, stages_done integer, stages_total integer)
language sql
stable
security definer
set search_path = public
as $$
  select s.id, s.name, s.crop_key, s.feddans, s.planting_date, s.harvest_date, s.status, s.land_id,
         (select count(*)::int from season_stages g where g.season_id = s.id and g.completed),
         (select count(*)::int from season_stages g where g.season_id = s.id)
    from seasons s
   where s.owner_id = p_farmer and public.is_agent_for(p_farmer, 'seasons')
   order by s.planting_date desc
$$;

create function public.agent_farmer_herds(p_farmer uuid)
returns table (id uuid, name text, species text, head_count integer, start_date date, end_date date, status text,
               stages_done integer, stages_total integer)
language sql
stable
security definer
set search_path = public
as $$
  select h.id, h.name, h.species::text, h.head_count, h.start_date, h.end_date, h.status,
         (select count(*)::int from herd_stages g where g.herd_id = h.id and g.completed),
         (select count(*)::int from herd_stages g where g.herd_id = h.id)
    from herds h
   where h.owner_id = p_farmer and public.is_agent_for(p_farmer, 'herds')
   order by h.start_date desc
$$;

revoke execute on function public.agent_farmer_seasons(uuid) from public, anon;
revoke execute on function public.agent_farmer_herds(uuid) from public, anon;
grant execute on function public.agent_farmer_seasons(uuid) to authenticated;
grant execute on function public.agent_farmer_herds(uuid) to authenticated;

revoke execute on function public.agent_mandate_request(text, text[], text) from public, anon;
revoke execute on function public.agent_mandate_answer(uuid, boolean) from public, anon;
revoke execute on function public.agent_mandate_end(uuid) from public, anon;
revoke execute on function public.agent_my_farmers() from public, anon;
revoke execute on function public.agent_my_agents() from public, anon;
grant execute on function public.agent_mandate_request(text, text[], text) to authenticated;
grant execute on function public.agent_mandate_answer(uuid, boolean) to authenticated;
grant execute on function public.agent_mandate_end(uuid) to authenticated;
grant execute on function public.agent_my_farmers() to authenticated;
grant execute on function public.agent_my_agents() to authenticated;

insert into supabase_migrations.schema_migrations (version, name) values ('20261026020000', 'agent_mandates') on conflict do nothing;

-- ═══ 20261026030000_forward_contracts.sql ═══
-- العقد الآجل بين المشتري والمزارع (البند ١٧٠، الغنيمة ٨ من Mozare3).
--
-- يتّفقان قبل الزرع أو أثناءه على محصولٍ ودرجةٍ وكميّةٍ وسعرٍ للوحدة وموعدِ تسليمٍ ومكانه وشروطِ الدفع، فيعرف المزارع
-- سعره قبل أن يحصد، ويعرف المشتري من أين تأتيه بضاعته. والمنصّة تكتب العقد وتحفظ توقيعيه وما جرى عليه بعدهما، ولا
-- تحمل مالاً ولا تضمن تسليماً: الدفع بين الطرفين مباشرةً كما كتبا، كما في عروض السوق وعقود الشراكة.
--
-- المسار:
--   يقترحه أحدهما على الآخر برقم جوّاله (أو من عرضٍ في السوق) → يوقّعه الآخر أو يعتذر، ويسحبه المقترح قبل ذلك؛
--   بعد التوقيع: يسجّل المشتري ما استلم (الكميّة والتاريخ وهل طابقت الدرجة) → يؤكّده المزارع فيُقفل العقد، أو ينازع؛
--   وفي أيّ وقتٍ بعد التوقيع: يطلب أحدهما الإلغاء فيقبله الآخر أو يرفضه، أو يرفع نزاعاً تفصل فيه الإدارة.
-- لا يلغي أحدٌ عقداً موقّعاً وحده، ولا تتغيّر شروطه بعد اقتراحها (يُسحب ويُقترح من جديد)، وكلّ خطوةٍ في سجلٍّ لا يُعدَّل.
--
-- والشرط الجزائيّ (قرار المالك، 26 أكتوبر 2026: «نعم»): من شروط العقد، بنسبٍ يتّفقان عليها في حدود سقفٍ معقول —
-- غرامة تأخيرٍ عن كلّ أسبوعٍ بعد آخر موعد التسليم حتى سقفها، وغرامة إخلالٍ على من يمتنع عن التسليم أو الاستلام —
-- وتُعفى القوّة القاهرة (حربٌ، أو سيلٌ، أو جراد، أو إغلاقُ طريق) إن اختاراها. لا تحسبها المنصّة ولا تحصّلها: تفصل الإدارة
-- في النزاع فتكتب المبلغ ومن يدفعه في السجلّ، ويدفعه الطرف للآخر مباشرةً.
--
-- ومنه «اشترِ لأهلك» (البند ١٧٢، الغنيمة ١٠ من CrowdFarming): المغترب يشتري حصاد مزارعٍ قريبٍ من أهله ويُسلَّم إليهم،
-- فيكتب في العقد من يستلم (اسمه وجوّاله). شراءٌ لا عائد، والدفع بين المغترب والمزارع خارج المنصّة كأيّ عقدٍ آجل.

-- ── نوع الإشعار ─────────────────────────────────────────────────────────────

do $$
declare v_def text;
begin
  select pg_get_constraintdef(oid) into v_def
    from pg_constraint
   where conname = 'notifications_kind_check' and conrelid = 'public.notifications'::regclass;
  -- The production check lists every kind; one written another way (the gates' base schema) is left alone.
  if v_def like '%ARRAY[%' and v_def not like '%forward_contract%' then
    execute 'alter table public.notifications drop constraint notifications_kind_check';
    execute 'alter table public.notifications add constraint notifications_kind_check '
         || regexp_replace(v_def, '\]\)\)\)\s*$', ', ''forward_contract''::text])))');
    select pg_get_constraintdef(oid) into v_def
      from pg_constraint
     where conname = 'notifications_kind_check' and conrelid = 'public.notifications'::regclass;
    if v_def not like '%forward_contract%' then
      raise exception 'لم يُضَف نوع الإشعار forward_contract';
    end if;
  end if;
end $$;

-- The last nine digits of a Sudanese number are the number (also in 20261026020000_agent_mandates).
create or replace function public.phone_key(p text)
returns text
language sql
immutable
as $$
  select nullif(right(regexp_replace(coalesce(p, ''), '\D', '', 'g'), 9), '')
$$;

create function public.forward_unit_ar(p text)
returns text
language sql
immutable
as $$
  select case p when 'qintar' then 'قنطار' when 'ardeb' then 'أردب' when 'sack' then 'جوال' when 'ton' then 'طن'
                else 'كيلوغرام' end
$$;

-- ── العقد ───────────────────────────────────────────────────────────────────

create table public.forward_contracts (
  id                  uuid primary key default gen_random_uuid(),
  ref                 text not null unique
                      default 'FC-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8)),
  buyer_id            uuid not null references auth.users(id) on delete restrict,
  farmer_id           uuid not null references auth.users(id) on delete restrict,
  proposed_by         uuid not null references auth.users(id) on delete restrict,
  -- آخر أربعة أرقامٍ من جوّال الطرف الآخر كما كتبه المقترح، ليعرف أيّ عقدٍ هذا قبل أن يُوقَّع.
  phone_tail          text not null check (phone_tail ~ '^[0-9]{4}$'),

  -- الشروط: تُكتب مرّةً عند الاقتراح ولا تتغيّر.
  crop                text not null check (length(btrim(crop)) between 2 and 60),
  grade               text not null check (length(btrim(grade)) between 5 and 300),
  quantity            numeric(12,2) not null check (quantity > 0 and quantity <= 1000000),
  unit                text not null check (unit in ('qintar', 'ardeb', 'sack', 'ton', 'kg')),
  -- كم تزيد الكميّة المسلَّمة أو تنقص ولا يُعدّ ذلك إخلالاً.
  tolerance_percent   numeric(4,1) not null default 5 check (tolerance_percent between 0 and 20),
  price               numeric(16,2) not null check (price > 0),
  currency            text not null check (currency in ('SDG', 'USD')),
  delivery_from       date not null,
  delivery_to         date not null,
  delivery_place      text not null check (length(btrim(delivery_place)) between 3 and 200),
  payment_terms       text not null check (length(btrim(payment_terms)) between 5 and 500),
  -- ما يدفعه المشتري مقدّماً للمزارع مباشرةً، إن اتّفقا؛ المنصّة لا تمسّه.
  advance_percent     numeric(4,1) check (advance_percent is null or advance_percent between 0 and 100),
  -- الشرط الجزائيّ: نسبٌ من قيمة العقد.
  late_penalty_pct_week numeric(4,1) not null default 1 check (late_penalty_pct_week between 0 and 5),
  late_penalty_cap_pct  numeric(4,1) not null default 10 check (late_penalty_cap_pct between 0 and 30),
  breach_penalty_pct    numeric(4,1) not null default 10 check (breach_penalty_pct between 0 and 30),
  force_majeure         boolean not null default true,
  -- ما حكمت به الإدارة في نزاع، ومن يدفعه للآخر.
  penalty_awarded     numeric(16,2) check (penalty_awarded is null or penalty_awarded > 0),
  penalty_payer       text check (penalty_payer is null or penalty_payer in ('buyer', 'farmer')),
  notes               text check (notes is null or length(btrim(notes)) between 2 and 1000),
  season_id           uuid references public.seasons(id) on delete set null,
  offer_id            uuid references public.market_offers(id) on delete set null,
  -- من يستلم عن المشتري، حين يشتري لأهله (البند ١٧٢). يكتبه المشتري وحده، وهو من الشروط.
  consignee_name      text check (consignee_name is null or length(btrim(consignee_name)) between 2 and 120),
  consignee_phone     text check (consignee_phone is null or consignee_phone ~ '^\+?[0-9]{7,15}$'),

  status              text not null default 'proposed'
                      check (status in ('proposed', 'declined', 'withdrawn', 'signed', 'delivered', 'completed',
                                        'cancel_requested', 'cancelled', 'disputed')),
  proposed_at         timestamptz not null default now(),
  signed_at           timestamptz,

  -- التسليم كما سجّله المشتري.
  delivered_quantity  numeric(12,2) check (delivered_quantity is null or delivered_quantity >= 0),
  delivered_on        date,
  grade_met           boolean,
  delivery_note       text check (delivery_note is null or length(btrim(delivery_note)) between 2 and 500),

  cancel_requested_by uuid references auth.users(id),
  -- الحال قبل النزاع أو طلب الإلغاء، يعود إليها العقد إن رُفض الطلب.
  status_before       text check (status_before is null or status_before in ('signed', 'delivered')),
  closed_at           timestamptz,
  updated_at          timestamptz not null default now(),

  check (buyer_id <> farmer_id),
  check (proposed_by in (buyer_id, farmer_id)),
  check ((consignee_name is null) = (consignee_phone is null)),
  check ((penalty_awarded is null) = (penalty_payer is null)),
  check (consignee_name is null or proposed_by = buyer_id),
  check (delivery_to >= delivery_from),
  check ((signed_at is null) = (status in ('proposed', 'declined', 'withdrawn'))),
  check ((delivered_on is null) = (delivered_quantity is null)),
  check ((closed_at is not null) = (status in ('declined', 'withdrawn', 'completed', 'cancelled')))
);

create index forward_contracts_buyer on public.forward_contracts (buyer_id, proposed_at desc);
create index forward_contracts_farmer on public.forward_contracts (farmer_id, proposed_at desc);
create index forward_contracts_open on public.forward_contracts (status) where status = 'disputed';

alter table public.forward_contracts enable row level security;
revoke all on public.forward_contracts from anon;
revoke insert, update, delete, truncate on public.forward_contracts from authenticated;
-- Since 20261024030000 a new table is readable by nobody until granted (audit db-b-2): the policy below picks the rows.
grant select on public.forward_contracts to authenticated;

create policy forward_contracts_parties on public.forward_contracts
  for select to authenticated
  using (buyer_id = auth.uid() or farmer_id = auth.uid() or is_admin());

-- Terms are written once. The functions below never touch them; this keeps it so if one is ever written wrong.
create function public.forward_contract_terms_fixed()
returns trigger
language plpgsql
as $$
begin
  if (new.buyer_id, new.farmer_id, new.proposed_by, new.crop, new.grade, new.quantity, new.unit, new.tolerance_percent,
      new.price, new.currency, new.delivery_from, new.delivery_to, new.delivery_place, new.payment_terms,
      new.advance_percent, new.notes, new.season_id, new.offer_id, new.consignee_name, new.consignee_phone,
      new.late_penalty_pct_week, new.late_penalty_cap_pct, new.breach_penalty_pct, new.force_majeure,
      new.proposed_at, new.ref)
     is distinct from
     (old.buyer_id, old.farmer_id, old.proposed_by, old.crop, old.grade, old.quantity, old.unit, old.tolerance_percent,
      old.price, old.currency, old.delivery_from, old.delivery_to, old.delivery_place, old.payment_terms,
      old.advance_percent, old.notes, old.season_id, old.offer_id, old.consignee_name, old.consignee_phone,
      old.late_penalty_pct_week, old.late_penalty_cap_pct, old.breach_penalty_pct, old.force_majeure,
      old.proposed_at, old.ref) then
    raise exception 'شروط العقد لا تتغيّر بعد اقتراحها: اسحبه واقترح غيره.';
  end if;
  new.updated_at := now();
  return new;
end $$;

create trigger forward_contract_terms_fixed
  before update on public.forward_contracts
  for each row execute function public.forward_contract_terms_fixed();

create function public.forward_contract_no_delete()
returns trigger
language plpgsql
as $$
begin
  raise exception 'العقد يبقى ولا يُحذف.';
end $$;

create trigger forward_contract_no_delete
  before delete on public.forward_contracts
  for each row execute function public.forward_contract_no_delete();

-- ── سجلّ ما جرى ─────────────────────────────────────────────────────────────

create table public.forward_contract_events (
  id           bigint generated always as identity primary key,
  contract_id  uuid not null references public.forward_contracts(id) on delete restrict,
  actor_id     uuid references auth.users(id),
  event        text not null check (event in ('proposed', 'signed', 'declined', 'withdrawn', 'delivered', 'completed',
                                              'cancel_requested', 'cancel_refused', 'cancelled', 'disputed', 'resolved')),
  note         text check (note is null or length(note) <= 1000),
  at           timestamptz not null default now()
);

create index forward_contract_events_contract on public.forward_contract_events (contract_id, id);

alter table public.forward_contract_events enable row level security;
revoke all on public.forward_contract_events from anon;
revoke insert, update, delete, truncate on public.forward_contract_events from authenticated;
grant select on public.forward_contract_events to authenticated;

create policy forward_contract_events_parties on public.forward_contract_events
  for select to authenticated
  using (exists (select 1 from public.forward_contracts c
                  where c.id = contract_id and (c.buyer_id = auth.uid() or c.farmer_id = auth.uid() or is_admin())));

create function public.forward_contract_events_keep()
returns trigger
language plpgsql
as $$
begin
  raise exception 'سجلّ العقد يُلحَق ولا يُعدَّل.';
end $$;

create trigger forward_contract_events_keep
  before update or delete on public.forward_contract_events
  for each row execute function public.forward_contract_events_keep();

-- ── أدوات ───────────────────────────────────────────────────────────────────

-- The contract as the caller may act on it, locked, or an error in words.
create function public.forward_contract_lock(p_id uuid)
returns public.forward_contracts
language plpgsql
security definer
set search_path = public
as $$
declare c forward_contracts%rowtype;
begin
  select * into c from forward_contracts where id = p_id for update;
  if not found or auth.uid() is null or auth.uid() not in (c.buyer_id, c.farmer_id) then
    raise exception 'لا عقد بهذا.';
  end if;
  return c;
end $$;

-- One step: the event, and a word to the other side.
create function public.forward_contract_step(
  c public.forward_contracts, p_event text, p_note text, p_title text, p_body text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_other uuid := case when auth.uid() = c.buyer_id then c.farmer_id else c.buyer_id end;
begin
  insert into forward_contract_events (contract_id, actor_id, event, note) values (c.id, auth.uid(), p_event, p_note);
  perform public.notify_user(v_other, 'forward_contract', p_title || ' (' || c.ref || ')', p_body,
                             '/market/forward/' || c.id);
end $$;

revoke execute on function public.forward_contract_lock(uuid) from public, anon, authenticated;
revoke execute on function public.forward_contract_step(public.forward_contracts, text, text, text, text)
  from public, anon, authenticated;

-- ── الاقتراح ────────────────────────────────────────────────────────────────

create function public.forward_contract_propose(
  p_side text, p_phone text, p_offer uuid,
  p_crop text, p_grade text, p_quantity numeric, p_unit text, p_tolerance_percent numeric,
  p_price numeric, p_currency text, p_delivery_from date, p_delivery_to date, p_delivery_place text,
  p_payment_terms text, p_advance_percent numeric, p_season uuid, p_notes text,
  p_consignee_name text default null, p_consignee_phone text default null,
  p_late_pct_week numeric default null, p_late_cap_pct numeric default null, p_breach_pct numeric default null,
  p_force_majeure boolean default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
  v_key text;
  v_other uuid;
  v_others uuid[];
  v_id uuid;
  v_ref text;
  v_today date := (now() at time zone 'Africa/Khartoum')::date;
begin
  if v_me is null then
    raise exception 'سجّل الدخول أوّلاً.';
  end if;
  if p_side not in ('buyer', 'farmer') then
    raise exception 'قل أأنت المشتري أم المزارع.';
  end if;

  if p_offer is not null then
    -- From a notice on the board: the other side is whoever posted it, and its phone is the one it shows.
    select created_by, public.phone_key(contact_phone) into v_other, v_key
      from market_offers where id = p_offer and status = 'open' and expires_at > now();
    if v_other is null then
      raise exception 'هذا العرض أُغلق أو انتهى.';
    end if;
  else
    v_key := public.phone_key(p_phone);
    if v_key is null or length(v_key) < 9 then
      raise exception 'اكتب رقم جوّال الطرف الآخر كاملاً.';
    end if;
    select array_agg(distinct x.id) into v_others from (
      select p.id from profiles p where public.phone_key(p.phone) = v_key
      union
      select u.id from auth.users u where public.phone_key(u.phone) = v_key
    ) x;
    if v_others is null then
      raise exception 'لا حساب بهذا الرقم. يسجّل الطرف الآخر أوّلاً برقمه، ثمّ تقترح عليه العقد.';
    end if;
    if cardinality(v_others) > 1 then
      raise exception 'لهذا الرقم أكثر من حساب؛ تواصل مع الإدارة لتحدّد أيّها.';
    end if;
    v_other := v_others[1];
  end if;
  if v_other = v_me then
    raise exception 'لا تعقد مع نفسك.';
  end if;

  if p_delivery_from is null or p_delivery_to is null or p_delivery_from < v_today then
    raise exception 'موعد التسليم يبدأ من اليوم فما بعده.';
  end if;
  if p_delivery_to > v_today + interval '24 months' then
    raise exception 'موعد التسليم في حدود سنتين من اليوم.';
  end if;
  if p_season is not null and (p_side <> 'farmer'
       or not exists (select 1 from seasons where id = p_season and owner_id = v_me)) then
    raise exception 'يُربط بالعقد موسمٌ للمزارع نفسه.';
  end if;
  if nullif(btrim(p_consignee_name), '') is not null and p_side <> 'buyer' then
    raise exception 'من يستلم عن المشتري يكتبه المشتري.';
  end if;
  if (nullif(btrim(p_consignee_name), '') is null) <> (nullif(btrim(p_consignee_phone), '') is null) then
    raise exception 'اكتب اسم من يستلم وجوّاله معاً.';
  end if;
  if (select count(*) from forward_contracts where proposed_by = v_me and proposed_at > now() - interval '1 day') >= 20 then
    raise exception 'عشرون اقتراحاً في اليوم حدّ الحساب. أكمل غداً.';
  end if;

  insert into forward_contracts (
    buyer_id, farmer_id, proposed_by, phone_tail, crop, grade, quantity, unit, tolerance_percent, price, currency,
    delivery_from, delivery_to, delivery_place, payment_terms, advance_percent, notes, season_id, offer_id,
    consignee_name, consignee_phone, late_penalty_pct_week, late_penalty_cap_pct, breach_penalty_pct, force_majeure)
  values (
    case p_side when 'buyer' then v_me else v_other end,
    case p_side when 'farmer' then v_me else v_other end,
    v_me, right(v_key, 4), btrim(p_crop), btrim(p_grade), p_quantity, p_unit, coalesce(p_tolerance_percent, 5),
    p_price, p_currency, p_delivery_from, p_delivery_to, btrim(p_delivery_place), btrim(p_payment_terms),
    p_advance_percent, nullif(btrim(p_notes), ''), p_season, p_offer,
    nullif(btrim(p_consignee_name), ''), nullif(regexp_replace(coalesce(p_consignee_phone, ''), '[\s-]', '', 'g'), ''),
    coalesce(p_late_pct_week, 1), coalesce(p_late_cap_pct, 10), coalesce(p_breach_pct, 10), coalesce(p_force_majeure, true))
  returning id, ref into v_id, v_ref;

  insert into forward_contract_events (contract_id, actor_id, event) values (v_id, v_me, 'proposed');
  perform public.notify_user(
    v_other, 'forward_contract', 'عقدٌ آجلٌ يُقترح عليك (' || v_ref || ')',
    btrim(p_crop) || '، ' || p_quantity || ' ' || public.forward_unit_ar(p_unit) || ' بسعر ' || p_price || ' ' || p_currency
      || ' للوحدة، تسليمٌ بين ' || p_delivery_from || ' و' || p_delivery_to
      || case when nullif(btrim(p_consignee_name), '') is not null
              then ' إلى ' || btrim(p_consignee_name) || ' عن المشتري' else '' end
      || '. اقرأه ووقّعه أو اعتذر.',
    '/market/forward/' || v_id);
  return v_id;
end $$;

-- ── التوقيع والاعتذار والسحب ────────────────────────────────────────────────

create function public.forward_contract_answer(p_id uuid, p_sign boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare c forward_contracts%rowtype := public.forward_contract_lock(p_id);
begin
  if c.proposed_by = auth.uid() then
    raise exception 'وقّع المقترح حين اقترح؛ التوقيع الثاني للطرف الآخر.';
  end if;
  if c.status <> 'proposed' then
    raise exception 'أُجيب هذا الاقتراح أو سُحب.';
  end if;
  if p_sign then
    update forward_contracts set status = 'signed', signed_at = now() where id = p_id;
    perform public.forward_contract_step(c, 'signed', null, 'وُقّع العقد الآجل',
      'وقّعه الطرف الآخر، فصار ملزماً لكما بشروطه. التسليم بين ' || c.delivery_from || ' و' || c.delivery_to || '.');
  else
    update forward_contracts set status = 'declined', closed_at = now() where id = p_id;
    perform public.forward_contract_step(c, 'declined', null, 'اعتذر الطرف الآخر عن العقد الآجل',
      'لم يوقّعه. لا شيء على أحد.');
  end if;
end $$;

create function public.forward_contract_withdraw(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare c forward_contracts%rowtype := public.forward_contract_lock(p_id);
begin
  if c.proposed_by <> auth.uid() or c.status <> 'proposed' then
    raise exception 'يسحب المقترحُ اقتراحه قبل أن يُجاب فقط.';
  end if;
  update forward_contracts set status = 'withdrawn', closed_at = now() where id = p_id;
  perform public.forward_contract_step(c, 'withdrawn', null, 'سُحب اقتراح العقد الآجل', 'سحبه مقترحه قبل أن تجيب.');
end $$;

-- ── التسليم ─────────────────────────────────────────────────────────────────

create function public.forward_contract_deliver(
  p_id uuid, p_quantity numeric, p_on date, p_grade_met boolean, p_note text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare c forward_contracts%rowtype := public.forward_contract_lock(p_id);
begin
  if c.buyer_id <> auth.uid() then
    raise exception 'يسجّل التسليمَ المشتري الذي استلم.';
  end if;
  if c.status <> 'signed' then
    raise exception 'يُسجَّل التسليم لعقدٍ موقّعٍ لم يُسجَّل تسليمه.';
  end if;
  if p_quantity is null or p_quantity < 0 or p_on is null or p_grade_met is null then
    raise exception 'اكتب ما استلمت وتاريخه، وهل طابق الدرجة المتّفق عليها.';
  end if;
  if p_on > (now() at time zone 'Africa/Khartoum')::date then
    raise exception 'لا يُسجَّل تسليمٌ في يومٍ لم يأتِ.';
  end if;
  if not p_grade_met and nullif(btrim(p_note), '') is null then
    raise exception 'قل فيمَ خالفت البضاعة الدرجة.';
  end if;
  update forward_contracts
     set status = 'delivered', delivered_quantity = p_quantity, delivered_on = p_on, grade_met = p_grade_met,
         delivery_note = nullif(btrim(p_note), '')
   where id = p_id;
  perform public.forward_contract_step(c, 'delivered', nullif(btrim(p_note), ''), 'سجّل المشتري ما استلم',
    'استلم ' || p_quantity || ' ' || public.forward_unit_ar(c.unit) || ' في ' || p_on
      || case when p_grade_met then '، مطابقاً للدرجة' else '، وقال إنّه خالف الدرجة' end
      || '. أكّد ما سجّله أو نازِع فيه.');
end $$;

create function public.forward_contract_confirm(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare c forward_contracts%rowtype := public.forward_contract_lock(p_id);
begin
  if c.farmer_id <> auth.uid() or c.status <> 'delivered' then
    raise exception 'يؤكّد المزارعُ تسليماً سجّله المشتري.';
  end if;
  update forward_contracts set status = 'completed', closed_at = now() where id = p_id;
  perform public.forward_contract_step(c, 'completed', null, 'أكّد المزارع التسليم، وأُقفل العقد',
    'تمّ العقد بما سُجّل. شكراً لكما.');
end $$;

-- ── الإلغاء بالاتّفاق، والنزاع ──────────────────────────────────────────────

create function public.forward_contract_cancel_request(p_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare c forward_contracts%rowtype := public.forward_contract_lock(p_id);
begin
  if c.status not in ('signed', 'delivered') then
    raise exception 'يُطلب الإلغاء لعقدٍ موقّعٍ لم يُقفل.';
  end if;
  if length(btrim(coalesce(p_reason, ''))) < 5 then
    raise exception 'اكتب سبب طلب الإلغاء.';
  end if;
  update forward_contracts
     set status = 'cancel_requested', cancel_requested_by = auth.uid(), status_before = c.status
   where id = p_id;
  perform public.forward_contract_step(c, 'cancel_requested', btrim(p_reason), 'يطلب الطرف الآخر إلغاء العقد',
    'سببه: ' || btrim(p_reason) || '. لا يُلغى إلا إن قبلت.');
end $$;

create function public.forward_contract_cancel_answer(p_id uuid, p_agree boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare c forward_contracts%rowtype := public.forward_contract_lock(p_id);
begin
  if c.status <> 'cancel_requested' then
    raise exception 'لا طلب إلغاءٍ قائمٌ على هذا العقد.';
  end if;
  if c.cancel_requested_by = auth.uid() then
    raise exception 'يجيب طلب الإلغاء الطرف الآخر.';
  end if;
  if p_agree then
    update forward_contracts set status = 'cancelled', closed_at = now() where id = p_id;
    perform public.forward_contract_step(c, 'cancelled', null, 'أُلغي العقد بالاتّفاق', 'قبل الطرف الآخر طلبك.');
  else
    update forward_contracts set status = c.status_before, cancel_requested_by = null, status_before = null
     where id = p_id;
    perform public.forward_contract_step(c, 'cancel_refused', null, 'رُفض طلب الإلغاء',
      'العقد قائمٌ بشروطه. وإن تعذّر الاتّفاق فارفع نزاعاً إلى الإدارة.');
  end if;
end $$;

create function public.forward_contract_dispute(p_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare c forward_contracts%rowtype := public.forward_contract_lock(p_id);
begin
  if c.status not in ('signed', 'delivered', 'cancel_requested') then
    raise exception 'يُرفع النزاع على عقدٍ موقّعٍ لم يُقفل.';
  end if;
  if length(btrim(coalesce(p_reason, ''))) < 10 then
    raise exception 'اشرح النزاع في جملةٍ على الأقلّ.';
  end if;
  update forward_contracts
     set status = 'disputed', status_before = coalesce(c.status_before, c.status), cancel_requested_by = null
   where id = p_id;
  perform public.forward_contract_step(c, 'disputed', btrim(p_reason), 'رُفع نزاعٌ على العقد إلى الإدارة',
    'سببه: ' || btrim(p_reason) || '. تتواصل الإدارة معكما.');
  perform public.notify_admins('forward_contract', 'نزاعٌ على عقدٍ آجل (' || c.ref || ')', btrim(p_reason),
                               '/market/forward/' || c.id);
end $$;

-- The administration settles a dispute: the contract stands where it was, is closed as done, or is cancelled.
create function public.forward_contract_resolve(
  p_id uuid, p_outcome text, p_note text, p_penalty numeric default null, p_penalty_payer text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare c forward_contracts%rowtype;
begin
  if not is_admin() then
    raise exception 'تفصل الإدارة وحدها في النزاع.';
  end if;
  select * into c from forward_contracts where id = p_id for update;
  if not found or c.status <> 'disputed' then
    raise exception 'لا نزاع قائمٌ على هذا العقد.';
  end if;
  if p_outcome not in ('resume', 'completed', 'cancelled') then
    raise exception 'الفصل: يستمرّ العقد، أو يُقفل تامّاً، أو يُلغى.';
  end if;
  if length(btrim(coalesce(p_note, ''))) < 10 then
    raise exception 'اكتب ما فصلت به وسببه؛ يقرؤه الطرفان.';
  end if;
  -- The penalty the contract allows, and no more: the larger of its two clauses, as a share of the contract's value.
  if p_penalty is not null then
    if p_penalty <= 0 or p_penalty_payer not in ('buyer', 'farmer') then
      raise exception 'الغرامة مبلغٌ موجب، ومعه من يدفعها: المشتري أو المزارع.';
    end if;
    if p_penalty > round(c.price * c.quantity * greatest(c.late_penalty_cap_pct, c.breach_penalty_pct) / 100, 2) then
      raise exception 'الغرامة أكبر ممّا يسمح به الشرط الجزائيّ في العقد.';
    end if;
    update forward_contracts set penalty_awarded = p_penalty, penalty_payer = p_penalty_payer where id = p_id;
  elsif p_penalty_payer is not null then
    raise exception 'اكتب مبلغ الغرامة.';
  end if;
  if p_outcome = 'resume' then
    update forward_contracts set status = c.status_before, status_before = null where id = p_id;
  else
    update forward_contracts set status = p_outcome, closed_at = now() where id = p_id;
  end if;
  insert into forward_contract_events (contract_id, actor_id, event, note)
  values (p_id, auth.uid(), 'resolved', p_outcome || ': ' || btrim(p_note)
          || case when p_penalty is not null
                  then ' — غرامة ' || p_penalty || ' ' || c.currency || ' يدفعها '
                       || case p_penalty_payer when 'buyer' then 'المشتري' else 'المزارع' end || ' للآخر مباشرةً'
                  else '' end);
  perform public.notify_user(r, 'forward_contract', 'فصلت الإدارة في نزاع العقد (' || c.ref || ')', btrim(p_note),
                             '/market/forward/' || c.id)
     from unnest(array[c.buyer_id, c.farmer_id]) r;
end $$;

-- ── ما يقرؤه الطرفان ────────────────────────────────────────────────────────

-- اسم الطرف الآخر وجوّاله: للمقترَح عليه من الاقتراح (ليعرف من يقترح)، وللمقترح بعد التوقيع فقط.
create function public.forward_contract_parties(p_id uuid)
returns table (buyer_name text, buyer_phone text, farmer_name text, farmer_phone text)
language sql
stable
security definer
set search_path = public
as $$
  select case when c.buyer_id = auth.uid() or is_admin() or c.proposed_by = c.buyer_id or c.signed_at is not null
              then b.full_name end,
         case when c.buyer_id = auth.uid() or is_admin() or c.proposed_by = c.buyer_id or c.signed_at is not null
              then b.phone end,
         case when c.farmer_id = auth.uid() or is_admin() or c.proposed_by = c.farmer_id or c.signed_at is not null
              then f.full_name end,
         case when c.farmer_id = auth.uid() or is_admin() or c.proposed_by = c.farmer_id or c.signed_at is not null
              then f.phone end
    from forward_contracts c
    left join profiles b on b.id = c.buyer_id
    left join profiles f on f.id = c.farmer_id
   where c.id = p_id and (auth.uid() in (c.buyer_id, c.farmer_id) or is_admin())
$$;

do $$
declare f text;
begin
  foreach f in array array[
    'forward_contract_propose(text, text, uuid, text, text, numeric, text, numeric, numeric, text, date, date, text, text, numeric, uuid, text, text, text, numeric, numeric, numeric, boolean)',
    'forward_contract_answer(uuid, boolean)', 'forward_contract_withdraw(uuid)',
    'forward_contract_deliver(uuid, numeric, date, boolean, text)', 'forward_contract_confirm(uuid)',
    'forward_contract_cancel_request(uuid, text)', 'forward_contract_cancel_answer(uuid, boolean)',
    'forward_contract_dispute(uuid, text)', 'forward_contract_resolve(uuid, text, text, numeric, text)',
    'forward_contract_parties(uuid)'
  ] loop
    execute format('revoke execute on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;

insert into supabase_migrations.schema_migrations (version, name) values ('20261026030000', 'forward_contracts') on conflict do nothing;

-- ═══ 20261026060000_managed_farmers.sql ═══
-- مزارعٌ بلا جوّال تسجّله جمعيّته (البند ١٦٩، الشريحة الثانية؛ قرار المالك، 26 أكتوبر 2026: «ابحث وانصح»).
--
-- ما تفعله المنصّات المشابهة (myCoop وOne Acre Fund وسجلّ المزارعين في OpenG2P): الجمعيّة أو المندوب يسجّل المزارع
-- بنفسه، بصورةٍ ووثيقة هويّة وموافقةٍ مكتوبة، ثمّ «مُدقِّقٌ» يعتمد السجلّ قبل أن يُعمل به، حتى لا يُسجَّل مزارعٌ وهميّ.
-- وهو هنا كذلك:
--   - الجمعيّة الموثّقة تفتح للمزارع حساباً بلا جوّال: اسمه وقريته، ورقم هويّته إن وُجد، وجوّال قريبٍ يُتّصل به إن وُجد،
--     وصورة المزارع، وصورة ورقة الموافقة موقَّعةً أو مبصومة؛
--   - يبقى الإذن معلَّقاً حتى تراجع الإدارة الورقة والصورة وتعتمده (أو تردّه بسبب)، فلا تعمل الجمعيّة عنه قبل ذلك؛
--   - الحساب لا يدخله أحد: عنوانٌ داخليّ وكلمة مرورٍ عشوائيّة لا يعرفها أحد؛
--   - حين يصير للمزارع جوّال يحضر إلى الجمعيّة أو يتّصل بالإدارة، فتربط الإدارة رقمه بحسابه وتقرأ له كلمةً مؤقّتة
--     (كاستعادة كلمة المرور)، فيصير حسابه هو، يُنهي إذن الجمعيّة متى شاء؛
--   - عشرة مزارعين في اليوم حدُّ الجمعيّة.

create table public.managed_farmers (
  user_id        uuid primary key references auth.users(id) on delete cascade,
  company_id     uuid not null references public.partner_companies(id) on delete restrict,
  created_by     uuid not null references auth.users(id),
  full_name      text not null check (length(btrim(full_name)) between 3 and 120),
  state          text not null check (length(btrim(state)) between 2 and 60),
  locality       text check (locality is null or length(btrim(locality)) between 2 and 80),
  village        text not null check (length(btrim(village)) between 2 and 80),
  -- رقم الهويّة الوطنيّة أو البطاقة القوميّة، إن وُجد: للإدارة وحدها، لتكشف التكرار.
  national_id    text check (national_id is null or national_id ~ '^[0-9A-Za-z-]{5,30}$'),
  -- جوّال قريبٍ أو جار يُتّصل به عن المزارع؛ ليس للدخول.
  contact_phone  text check (contact_phone is null or contact_phone ~ '^\+?[0-9]{7,15}$'),
  consent_path   text not null check (consent_path ~ '^[0-9a-f-]{36}/managed/[0-9a-f-]{36}-consent\.(jpg|jpeg|png|webp)$'),
  photo_path     text not null check (photo_path ~ '^[0-9a-f-]{36}/managed/[0-9a-f-]{36}-photo\.(jpg|jpeg|png|webp)$'),
  status         text not null default 'pending' check (status in ('pending', 'approved', 'refused', 'claimed')),
  review_note    text check (review_note is null or length(btrim(review_note)) between 3 and 300),
  created_at     timestamptz not null default now(),
  reviewed_at    timestamptz,
  reviewed_by    uuid references auth.users(id) on delete set null,
  claimed_at     timestamptz,
  check ((status = 'pending') = (reviewed_at is null)),
  check (status <> 'refused' or review_note is not null),
  check ((claimed_at is not null) = (status = 'claimed'))
);

create unique index managed_farmers_national_id on public.managed_farmers (national_id)
  where national_id is not null and status <> 'refused';
create index managed_farmers_pending on public.managed_farmers (created_at) where status = 'pending';

alter table public.managed_farmers enable row level security;
revoke all on public.managed_farmers from anon, authenticated;
-- The administration's review list counts it; nobody else reads the table, the company included.
grant select on public.managed_farmers to authenticated;
create policy managed_farmers_admin on public.managed_farmers
  for select to authenticated using (is_admin());

-- ── قبل فتح الحساب ──────────────────────────────────────────────────────────

-- The server asks before it makes the account: is the caller a verified, active company under its day's limit?
create function public.managed_farmer_can_register()
returns uuid
language plpgsql
stable
security definer
set search_path = public
as $$
declare v_company uuid;
begin
  select id into v_company from partner_companies
   where owner_id = auth.uid() and verified_at is not null and active;
  if v_company is null then
    raise exception 'تسجيل المزارعين لجمعيّةٍ أو شركةٍ موثّقة.';
  end if;
  if (select count(*) from managed_farmers where company_id = v_company and created_at > now() - interval '1 day') >= 10 then
    raise exception 'عشرة مزارعين في اليوم حدُّ الجمعيّة. أكمل غداً.';
  end if;
  return v_company;
end $$;

-- ── التسجيل ─────────────────────────────────────────────────────────────────

-- The account was just made by the server for this purpose (marked so, minutes old, never registered); the company
-- records the farmer against it, and a mandate waits for the administration to approve.
create function public.managed_farmer_register(
  p_user uuid, p_full_name text, p_state text, p_locality text, p_village text, p_national_id text,
  p_contact_phone text, p_consent_path text, p_photo_path text, p_scopes text[], p_note text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company uuid := public.managed_farmer_can_register();
  v_folder text := auth.uid()::text || '/managed/';
begin
  if not exists (select 1 from auth.users u
                  where u.id = p_user
                    and u.raw_user_meta_data ->> 'managed' = 'true'
                    and u.email like 'm%@managed.invalid'
                    and u.created_at > now() - interval '10 minutes')
     or exists (select 1 from managed_farmers where user_id = p_user) then
    raise exception 'حسابٌ غير صالحٍ لهذا.';
  end if;
  if p_consent_path not like v_folder || '%' or p_photo_path not like v_folder || '%' then
    raise exception 'الصورتان من مجلّدك أنت.';
  end if;
  if to_regclass('storage.objects') is not null
     and (select count(*) from storage.objects
           where bucket_id = 'evidence' and name in (p_consent_path, p_photo_path)) < 2 then
    raise exception 'لم نجد الصورتين المرفوعتين. ارفعهما ثمّ سجّل.';
  end if;
  if nullif(btrim(p_national_id), '') is not null and exists (
       select 1 from managed_farmers where national_id = btrim(p_national_id) and status <> 'refused') then
    raise exception 'هذا الرقم الوطنيّ مسجَّلٌ لمزارعٍ من قبل.';
  end if;

  insert into managed_farmers (user_id, company_id, created_by, full_name, state, locality, village, national_id,
                               contact_phone, consent_path, photo_path)
  values (p_user, v_company, auth.uid(), btrim(p_full_name), btrim(p_state), nullif(btrim(p_locality), ''),
          btrim(p_village), nullif(btrim(p_national_id), ''),
          nullif(regexp_replace(coalesce(p_contact_phone, ''), '[\s-]', '', 'g'), ''), p_consent_path, p_photo_path);

  -- No phone of his own: the tail is the account's, and the farmer cannot answer; the administration does, with the
  -- paper in front of it.
  insert into agent_mandates (company_id, farmer_id, scopes, note, phone_tail, requested_by)
  values (v_company, p_user, (select array_agg(distinct s order by s) from unnest(p_scopes) s), btrim(p_note), '0000',
          auth.uid());

  insert into profiles (id, full_name) values (p_user, btrim(p_full_name))
  on conflict (id) do update set full_name = excluded.full_name;

  perform public.notify_admins('agent_mandate', 'مزارعٌ بلا جوّال ينتظر الاعتماد: ' || btrim(p_full_name),
    'سجّلته جمعيّته بورقة موافقة وصورة. راجعهما ثمّ اعتمد الإذن أو ردّه بسبب.', '/admin/managed');
end $$;

-- ── المراجعة والربط بجوّال ──────────────────────────────────────────────────

create function public.managed_farmers_pending()
returns table (user_id uuid, company_name text, full_name text, state text, locality text, village text,
               national_id text, contact_phone text, consent_path text, photo_path text, scopes text[], note text,
               status text, created_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select f.user_id, c.name, f.full_name, f.state, f.locality, f.village, f.national_id, f.contact_phone,
         f.consent_path, f.photo_path, m.scopes, m.note, f.status, f.created_at
    from managed_farmers f
    join partner_companies c on c.id = f.company_id
    left join agent_mandates m on m.farmer_id = f.user_id and m.company_id = f.company_id
                              and m.status in ('pending', 'active')
   where is_admin() and f.status in ('pending', 'approved')
   order by (f.status = 'pending') desc, f.created_at
$$;

create function public.managed_farmer_review(p_user uuid, p_approve boolean, p_note text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare f managed_farmers%rowtype;
begin
  if not is_admin() then
    raise exception 'للإدارة وحدها.';
  end if;
  select * into f from managed_farmers where user_id = p_user for update;
  if not found or f.status <> 'pending' then
    raise exception 'لا تسجيل ينتظر بهذا.';
  end if;
  if not p_approve and length(btrim(coalesce(p_note, ''))) < 3 then
    raise exception 'اكتب سبب الردّ؛ تقرؤه الجمعيّة.';
  end if;
  update managed_farmers
     set status = case when p_approve then 'approved' else 'refused' end, reviewed_at = now(), reviewed_by = auth.uid(),
         review_note = nullif(btrim(coalesce(p_note, '')), '')
   where user_id = p_user;
  update agent_mandates
     set status = case when p_approve then 'active' else 'declined' end, answered_at = now()
   where farmer_id = p_user and company_id = f.company_id and status = 'pending';
  perform public.notify_user(f.created_by, 'agent_mandate',
    case when p_approve then 'اعتُمد تسجيل ' || f.full_name else 'رُدّ تسجيل ' || f.full_name end,
    case when p_approve then 'صرتم تعملون عنه في «مزارعيّ».' else 'السبب: ' || btrim(p_note) end, '/agent');
end $$;

-- After the server tied a phone to the account and set a temporary password: the farmer holds it now, and agents find
-- him by that number like anyone else. A number another account already has is refused.
create function public.managed_farmer_claimed(p_user uuid, p_phone text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_key text := public.phone_key(p_phone);
begin
  if not is_admin() then
    raise exception 'للإدارة وحدها.';
  end if;
  if v_key is null or length(v_key) < 9 then
    raise exception 'رقم جوّالٍ غير صالح.';
  end if;
  if exists (select 1 from profiles where id <> p_user and public.phone_key(phone) = v_key) then
    raise exception 'هذا الرقم لحسابٍ آخر.';
  end if;
  update managed_farmers set status = 'claimed', claimed_at = now()
   where user_id = p_user and status = 'approved';
  if not found then
    raise exception 'يُربط بجوّالٍ مزارعٌ اعتُمد تسجيله.';
  end if;
  update profiles set phone = btrim(p_phone) where id = p_user;
end $$;

revoke execute on function public.managed_farmer_can_register() from public, anon;
revoke execute on function public.managed_farmer_register(uuid, text, text, text, text, text, text, text, text, text[], text)
  from public, anon;
revoke execute on function public.managed_farmers_pending() from public, anon;
revoke execute on function public.managed_farmer_review(uuid, boolean, text) from public, anon;
revoke execute on function public.managed_farmer_claimed(uuid, text) from public, anon;
grant execute on function public.managed_farmer_can_register() to authenticated;
grant execute on function public.managed_farmer_register(uuid, text, text, text, text, text, text, text, text, text[], text)
  to authenticated;
grant execute on function public.managed_farmers_pending() to authenticated;
grant execute on function public.managed_farmer_review(uuid, boolean, text) to authenticated;
grant execute on function public.managed_farmer_claimed(uuid, text) to authenticated;

insert into supabase_migrations.schema_migrations (version, name) values ('20261026060000', 'managed_farmers') on conflict do nothing;

-- ═══ 20261028010000_managed_farmer_own_record.sql ═══
-- «نزّل بياناتي» للمزارع الذي سجّلته جمعيّته (البند ١٦٩، الشريحة الثانية — ما بقي منها).
--
-- سجلّ تسجيله في `managed_farmers` تقرؤه الإدارة وحدها (فيه الرقم الوطنيّ)، فلم يكن في ملفّ بياناته ولو تسلّم حسابه.
-- وهو بياناته: اسمه وقريته ورقمه الوطنيّ وجوّال قريبه، ومتى سُجّل ومن سجّله، ومتى اعتُمد ومتى تسلّم حسابه. هذه
-- الدالّة تعطيه صفَّه هو وحده، ولا تعطي معرّفات من سجّله أو راجعه (حسابات غيره)، بل اسم الجمعيّة. ومسارا الصورتين
-- (صورته وورقة الموافقة) في مجلّد الجمعيّة، فيُذكر أنّهما محفوظتان ولا تُعطى مساراتهما.

create function public.managed_farmer_mine()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
           'full_name', m.full_name,
           'state', m.state,
           'locality', m.locality,
           'village', m.village,
           'national_id', m.national_id,
           'contact_phone', m.contact_phone,
           'registered_by', c.name,
           'status', m.status,
           'review_note', m.review_note,
           'photo_and_consent_kept', true,
           'created_at', m.created_at,
           'reviewed_at', m.reviewed_at,
           'claimed_at', m.claimed_at)
    from managed_farmers m
    left join partner_companies c on c.id = m.company_id
   where m.user_id = auth.uid();
$$;

revoke execute on function public.managed_farmer_mine() from public, anon;
grant execute on function public.managed_farmer_mine() to authenticated;

insert into supabase_migrations.schema_migrations (version, name) values ('20261028010000', 'managed_farmer_own_record') on conflict do nothing;

-- ═══ 20261028020000_agreement_memo_accounts.sql ═══
-- ═══════════════════════════════════════════════════════════════════════════
-- عقود الشراكة القائمة في الحسابات النظاميّة للمنصّة (البند ١٨٩ — ما بقي منه: «حسابات ٩١١٠ للعقود القائمة»)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- الدراسة (docs/studies/accounting-ledger-ar.md §٣): في دفتر المنصّة حسابٌ نظاميّ خارج الميزانيّة، «عقود شراكة قائمة»
-- (٩١١٠، مقابله ٩١٢٠)، «ليذكّر الدفتر بما لا تملكه المنصّة ولا تدين به». أُنشئ الحسابان مع المحرّك (20261024110000)
-- ولم يُقيَّد فيهما شيء.
--
-- ما يُقيَّد: كلُّ عقدٍ وُقِّع (status = 'signed') وفيه مبلغٌ معلَن — الإيجار (`rent_amount`) أو مبلغ التمويل
-- (`finance_amount`) بعملته — قيدٌ واحد في دفتر المنصّة: مدين ٩١١٠ / دائن ٩١٢٠، بيوم التوقيع بتوقيت الخرطوم.
-- والمزارعة والمساقاة والإدارة لا مبلغ فيها (حصصٌ من الحصاد)، فلا تُقيَّد قيمةً؛ ويُعدّ كلُّ العقود الموقَّعة في
-- `agreement_memo_sync` لتراها الإدارة.
--
-- لماذا ليس زناداً عند التوقيع: قيدٌ تعذّر (لا سعر صرفٍ منشور لعقدٍ بالجنيه) كان سيُفشل التوقيع نفسه. فيُقيَّد في
-- مسك الدفاتر اليوميّ (`src/lib/bookkeeping.ts`) ما لم يُقيَّد بعد، بمفتاحٍ لكلّ عقدٍ فلا يتكرّر، وما تعذّر يبقى
-- للغد ويُعدّ. وهكذا تُقيَّد العقود القائمة قبل هذه الهجرة في أوّل تشغيل.
--
-- والقيد من قيود النظام: لا يُعكس يدويّاً (`ledger_reverse` يعرف المصدر الجديد).

create function public.agreement_memo_sync()
returns table (posted integer, skipped integer, without_amount integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_book   uuid;
  v_closed date;
  r        record;
  v_cur    text;
  v_amount numeric;
  v_minor  bigint;
  v_date   date;
  v_rate   numeric;
  v_src    text;
begin
  if auth.uid() is not null and not is_admin() then
    raise exception 'للإدارة وحدها';
  end if;
  posted := 0;
  skipped := 0;
  without_amount := 0;

  v_book := public._ledger_open_book(null, 'platform');
  perform public._ledger_sync_chart(v_book);
  select closed_through into v_closed from public.ledger_books where id = v_book;

  for r in
    select a.id, a.ref, a.model, a.terms, a.signed_at
      from public.partnership_agreements a
     where a.status = 'signed'
       and not exists (select 1 from public.journal_entries e
                        where e.book_id = v_book and e.source_type = 'agreement_memo' and e.source_id = a.id)
     order by a.signed_at nulls last, a.id
  loop
    v_amount := case r.model when 'lease' then (r.terms ->> 'rent_amount')::numeric
                             when 'finance' then (r.terms ->> 'finance_amount')::numeric end;
    v_cur := r.terms ->> 'currency';
    if v_amount is null or v_amount <= 0 or coalesce(v_cur, '') not in ('USD', 'SDG') then
      without_amount := without_amount + 1;
      continue;
    end if;
    v_minor := round(v_amount * 100)::bigint;
    v_date := greatest(coalesce((r.signed_at at time zone 'Africa/Khartoum')::date, public.ledger_today()),
                       coalesce(v_closed, date '2000-01-01') + 1);
    v_rate := null;
    v_src := null;
    if v_cur = 'SDG' then
      select x.rate into v_rate from public.ledger_fx_rate(v_date, 'parallel') x;
      if v_rate is null then
        skipped := skipped + 1;
        continue;
      end if;
      v_src := 'parallel';
    end if;

    perform public._ledger_post_src(
      v_book, v_date,
      left('عقد شراكة قائم' || coalesce(' ' || r.ref, '') || ' — '
           || case r.model when 'lease' then 'إيجار' else 'تمويل' end || ' (القيمة المعلنة)', 500),
      jsonb_build_array(
        jsonb_build_object('key', 'memo_agreements', 'side', 'D', 'currency', v_cur, 'minor', v_minor),
        jsonb_build_object('key', 'memo_contra', 'side', 'C', 'currency', v_cur, 'minor', v_minor)),
      'agreement_memo:' || r.id::text, v_rate, 'agreement_memo', r.id, null, auth.uid(), v_src);
    posted := posted + 1;
  end loop;
  return next;
end $$;

-- ── ما يكتبه النظام لا يُعكس يدويّاً ──────────────────────────────────────────
-- كما في 20261025210000، ومعها المصدر الجديد.

create or replace function public.ledger_reverse(
  p_entry  uuid,
  p_reason text,
  p_date   date default null,
  p_key    text default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_type text;
begin
  if auth.uid() is null then
    raise exception 'سجّل الدخول أولاً';
  end if;
  select e.source_type into v_type
    from public.journal_entries e
    join public.ledger_books b on b.id = e.book_id
   where e.id = p_entry and (b.owner_id = auth.uid() or (b.kind = 'platform' and is_admin()));
  if not found then
    raise exception 'ليس هذا قيدك';
  end if;
  if v_type in ('season_entry', 'season_close') then
    raise exception 'هذا القيد من دفتر الموسم: عدّل السطر أو احذفه هناك، فيُعكس هنا وحده';
  elsif v_type in ('season_entry_settle', 'season_entry_settle_fx') then
    raise exception 'هذا قيد سداد: ألغِ السداد من دفتر الموسم، فيُعكس مع فرق صرفه';
  elsif v_type = 'ledger_link' then
    raise exception 'هذا قيدٌ متقابل مع شريكك: يُلغى باتّفاقكما من صفحة القيود المتقابلة';
  elsif v_type = 'oversight' then
    raise exception 'هذا قيدٌ إحصائيّ يتبع مجاميع الشبكة ولا يُعكس يدويّاً';
  elsif v_type = 'ledger_fee' then
    raise exception 'هذا قيد رسمٍ للمنصّة قُيِّد في دفترين؛ لا يُعكس في أحدهما وحده';
  elsif v_type = 'agreement_memo' then
    raise exception 'هذا قيدٌ نظاميّ يتبع عقد الشراكة الموقَّع ولا يُعكس يدويّاً';
  end if;
  return public._ledger_reverse(p_entry, p_reason, p_date, p_key, auth.uid());
end $$;

revoke execute on function public.agreement_memo_sync() from public, anon;
grant execute on function public.agreement_memo_sync() to authenticated, service_role;

insert into supabase_migrations.schema_migrations (version, name) values ('20261028020000', 'agreement_memo_accounts') on conflict do nothing;

-- ═══ 20261031010000_land_boundary.sql ═══
-- حدود الأرض نفسها، لا مساحتها ومركزها وحدهما (البند ١٣٤ — ما بقي منه).
--
-- «حدّد أرضك» في التطبيق يرسم الحقل بالمشي حوله أو بالنقر على أركانه، وكان الخادم يحفظ ما حسبه منه (المساحة
-- والمركز) ويرمي الأركان. فيُحفظ الشكل الآن مع الأرض: تراه الإدارة حين تراجعها وتقارن المساحة المعلنة بما يحيط
-- به، ويُرسم على الخريطة لصاحبها.
--
--   - `boundary`: الأركان بترتيبها حول الحقل، [[lat, lng], …]، من ٣ إلى ٥٠٠، كلٌّ في حدود العالم. والقيد يرفض ما
--     ليس كذلك؛ أمّا أنّ الأركان تحيط بمساحةٍ فعلاً فيفحصه الخادم قبل الكتابة (`boundaryOf`).
--   - يقرؤه من يقرأ الصفّ: صاحبه والإدارة (والوكيل المأذون له في الأراضي، بسياسته)؛ وصفّ الأرض لا يُقرأ لغيرهم
--     منذ 20261021220000، والدوالّ العامّة لا تعيد هذا العمود.
--   - وتغييره في أرضٍ موثّقة يُعيدها إلى المراجعة، كتغيير موقعها أو مساحتها.

-- Each corner a pair of numbers inside the world. Immutable, so a check constraint may call it.
create function public.land_boundary_valid(p jsonb)
returns boolean
language sql
immutable
set search_path = public
as $$
  select coalesce(bool_and(
           jsonb_typeof(c) = 'array' and jsonb_array_length(c) = 2
           and jsonb_typeof(c -> 0) = 'number' and jsonb_typeof(c -> 1) = 'number'
           and abs((c ->> 0)::numeric) <= 90 and abs((c ->> 1)::numeric) <= 180), false)
    from jsonb_array_elements(p) c
$$;

-- The check runs as whoever writes the row — a farmer through the site or the app, or the server. Since 20261024030000
-- a new function is executable by nobody until granted (audit db-b-1, 3 November 2026: without this line every
-- insert or update of a land as a signed-in user failed). It reads nothing but its argument.
revoke execute on function public.land_boundary_valid(jsonb) from public;
grant execute on function public.land_boundary_valid(jsonb) to anon, authenticated, service_role;

alter table public.lands
  add column boundary jsonb
  constraint lands_boundary_shape check (
    boundary is null
    or (jsonb_typeof(boundary) = 'array'
        and jsonb_array_length(boundary) between 3 and 500
        and public.land_boundary_valid(boundary))
  );

comment on column public.lands.boundary is
  'أركان الأرض بترتيبها حولها [[lat, lng], …] كما رسمها صاحبها بالمشي أو على الخريطة؛ والمساحة والموقع محسوبان منها.';


-- ── التوثيق: تغيير الحدود يُعيد الأرض الموثّقة إلى المراجعة ──────────────────
-- The body is the one in 20261024100000_land_soil_estimate.sql, word for word, but for the boundary line.

create or replace function public.reopen_land_on_fact_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_changed text[];
  v_machine boolean := coalesce(current_setting('sudagri.soil_estimate', true), '') = '1';
begin
  if old.verification <> 'verified' then return new; end if;
  if auth.uid() is null or is_admin() then return new; end if;

  v_changed := array_remove(array[
    case when new.latitude is distinct from old.latitude
           or new.longitude is distinct from old.longitude then 'الموقع' end,
    case when new.boundary is distinct from old.boundary then 'الحدود' end,
    case when (new.state, new.locality, new.village)
           is distinct from (old.state, old.locality, old.village) then 'الولاية أو المحلّيّة أو القرية' end,
    case when new.feddans is distinct from old.feddans then 'المساحة' end,
    case when (new.water_source, new.water_per_feddan)
           is distinct from (old.water_source, old.water_per_feddan) then 'الماء' end,
    case when (new.soil_class, new.soil_note)
           is distinct from (old.soil_class, old.soil_note)
          and not (v_machine and new.soil_note is not distinct from old.soil_note) then 'التربة' end,
    case when new.tenure is distinct from old.tenure then 'نوع الحيازة' end
  ], null);

  if cardinality(v_changed) = 0 then return new; end if;

  new.verification := 'submitted';
  new.listed := false;
  new.verification_note := 'عُدِّل بعد التوثيق: ' || array_to_string(v_changed, '، ')
                           || '. تُراجَع الأرض من جديد قبل أن تُعرض.';

  perform notify_user(new.owner_id, 'land_submitted',
    'عادت أرضك إلى المراجعة',
    format('غيّرتَ %s في الأرض "%s" بعد توثيقها، فلا تُعرض حتى تراجعها الإدارة من جديد.',
           array_to_string(v_changed, '، '), coalesce(new.name, 'أرضك')),
    '/lands');
  return new;
end;
$$;

revoke execute on function public.reopen_land_on_fact_change() from public, anon;

insert into supabase_migrations.schema_migrations (version, name) values ('20261031010000', 'land_boundary') on conflict do nothing;

-- ═══ 20261103010000_contracts_held_to_their_terms.sql ═══
-- العقود تبقى على ما اتُّفق عليه، والأرض لا تُوثَّق إلا بعد أن تُقرأ مستنداتها (فحص 3 نوفمبر 2026، السؤال 6 للمالك).
--
-- عقود الخدمة (db-a-1، db-a-2، money-logic-1، money-logic-8):
--   - العقد يُنشئه العميل باسمه، مسودّةً بلا توقيع وبمبلغ صفر، على موسمه أو قطيعه. كان أيّ طرفٍ يُدخل عقداً «سارياً»
--     أو «منجزاً» باسم غيره مباشرةً من الواجهة.
--   - بعد الإنشاء لا يتغيّر طرفاه ولا موسمه ولا عملته، ولا مبلغه إلا من مجموع مراحله، ولا تاريخ توقيعه إلا عند قبوله.
--     كان حارس الحالة يخرج مبكراً حين لا تتغيّر الحالة، فيمرّ تعديل المبلغ والطرفين على عقدٍ موقَّع.
--   - لا يُحذف عقدٌ بعد أن عُرض: يُلغى أو يُعلن فيه نزاع. والحذف بالتتابع (حذف الموسم أو القطيع) يمرّ بالحارس نفسه،
--     فلا تمحو مراحلُ معتمدة وأدلّتها ودفعاتها مع موسمها.
--   - المرحلة تبدأ «لم تبدأ» ولا يُكتب اعتمادها بيد أحد، ولا تنتقل إلى عقدٍ آخر، ولا تعود من «معتمدة» أو «مدفوعة»؛
--     وسيرها وتسليمها لمقدّم الخدمة، واعتمادها ودفعها ورفضها للعميل. الإدارة فوق ذلك كلّه، للنزاع.
--
-- الشراكة (money-logic-2): التوقيع يحسب على المساحة التي وثّقتها الإدارة وعلى أرضٍ ما زالت موثّقة، ولا تنقص مساحة
-- الأرض عمّا وُقّع عليه في عقودٍ سارية.
--
-- التوثيق (web-flows-3، data-quality-5): لا يوثّق المدير أرضاً يملكها، ولا أرضاً لم يفتح كلّ مستنداتها؛ ويُحفظ من وثّق
-- ومتى وبأيّ مساحة. وفتح المستند يُسجَّل بدالّة تعطي الإدارة مساره لتفتحه برابطٍ قصير العمر.
--
-- لا حذف لبيانات. الأرض الموثّقة الوحيدة على الموقع تحتفظ بتوثيقها، وتُكتب مساحتها الموثّقة من مساحتها اليوم.

-- ── عقود الخدمة ───────────────────────────────────────────────────────────────

create or replace function public.service_contracts_insert_gate()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or is_admin() then
    return new;
  end if;
  if new.client_id is distinct from auth.uid() then
    raise exception 'العقد يُنشئه العميل باسمه — لا يُنشأ عقدٌ باسم غيرك.';
  end if;
  if new.status <> 'draft' or new.signed_at is not null then
    raise exception 'العقد يبدأ مسودّة: يعرضه العميل ثمّ يقبله مقدّم الخدمة.';
  end if;
  if new.season_id is not null
     and not exists (select 1 from seasons s where s.id = new.season_id and s.owner_id = auth.uid()) then
    raise exception 'العقد على موسمك أنت.';
  end if;
  if new.herd_id is not null
     and not exists (select 1 from herds h where h.id = new.herd_id and h.owner_id = auth.uid()) then
    raise exception 'العقد على قطيعك أنت.';
  end if;
  -- The total is the sum of the phases, written by sync_contract_total as they are added.
  new.total_amount := 0;
  return new;
end $$;

create trigger service_contracts_insert_gate
  before insert on public.service_contracts
  for each row execute function public.service_contracts_insert_gate();

-- Runs after service_contracts_status_gate (triggers fire in name order), which stamps signed_at on acceptance.
create or replace function public.service_contracts_terms_frozen()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or is_admin() then
    return new;
  end if;
  if new.client_id is distinct from old.client_id
     or new.provider_id is distinct from old.provider_id
     or new.season_id is distinct from old.season_id
     or new.herd_id is distinct from old.herd_id
     or new.project_id is distinct from old.project_id
     or new.currency is distinct from old.currency then
    raise exception 'طرفا العقد وموسمه وعملته لا تتغيّر — لغير ذلك عقدٌ جديد.';
  end if;
  if new.total_amount is distinct from old.total_amount
     and coalesce(current_setting('app.contract_total_sync', true), '') <> 'on' then
    raise exception 'مبلغ العقد هو مجموع مراحله، ولا يُكتب بيد أحد.';
  end if;
  if new.signed_at is distinct from old.signed_at
     and not (old.signed_at is null and old.status = 'proposed' and new.status = 'active') then
    raise exception 'تاريخ توقيع العقد يُكتب حين يقبله مقدّم الخدمة، ولا يتغيّر بعده.';
  end if;
  if new.title is distinct from old.title and old.status <> 'draft' then
    raise exception 'عنوان العقد تجمّد حين عُرض.';
  end if;
  return new;
end $$;

create trigger service_contracts_terms_frozen
  before update on public.service_contracts
  for each row execute function public.service_contracts_terms_frozen();

create or replace function public.service_contracts_delete_gate()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or is_admin() then
    return old;
  end if;
  if old.status <> 'draft' then
    raise exception 'لا يُحذف عقدٌ بعد أن عُرض (حالته «%»): يُلغى أو يُعلَن فيه نزاع. ولا يُحذف موسمٌ أو قطيعٌ عليه عقدٌ كهذا.',
      old.status;
  end if;
  return old;
end $$;

create trigger service_contracts_delete_gate
  before delete on public.service_contracts
  for each row execute function public.service_contracts_delete_gate();

-- The total is written by its sync alone; the flag lets the frozen-terms gate tell it from a hand.
create or replace function public.sync_contract_total()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target uuid := coalesce(new.contract_id, old.contract_id);
begin
  perform set_config('app.contract_total_sync', 'on', true);
  update service_contracts c
     set total_amount = coalesce(
           (select sum(m.amount) from contract_milestones m where m.contract_id = target), 0)
   where c.id = target;
  perform set_config('app.contract_total_sync', '', true);
  return null;
end $$;

-- ── مراحل العقد ───────────────────────────────────────────────────────────────

create or replace function public.contract_milestones_insert_gate()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or is_admin() then
    return new;
  end if;
  if new.status <> 'pending' or new.approved_by is not null or new.approved_at is not null then
    raise exception 'المرحلة تبدأ «لم تبدأ»، ولا يُكتب اعتمادها بيد أحد.';
  end if;
  return new;
end $$;

create trigger contract_milestones_insert_gate
  before insert on public.contract_milestones
  for each row execute function public.contract_milestones_insert_gate();

-- Runs after contract_milestones_a_terms_gate and contract_milestones_approval_gate (name order): the approval gate
-- stamps approved_by/approved_at on the move to approved, and this one lets that stamp through and no other.
create or replace function public.contract_milestones_moves_gate()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_client   boolean;
  v_provider boolean;
begin
  if new.contract_id is distinct from old.contract_id and auth.uid() is not null then
    raise exception 'المرحلة لا تنتقل إلى عقدٍ آخر.';
  end if;
  if auth.uid() is null or is_admin() then
    return new;
  end if;
  if (new.approved_by is distinct from old.approved_by or new.approved_at is distinct from old.approved_at)
     and not (new.status = 'approved' and old.status is distinct from 'approved') then
    raise exception 'اعتماد المرحلة يُكتب حين تُعتمد، ولا يتغيّر بعده.';
  end if;
  if new.status is not distinct from old.status then
    return new;
  end if;
  if old.status in ('approved', 'paid') and not (old.status = 'approved' and new.status = 'paid') then
    raise exception 'المرحلة المعتمدة لا تعود إلى الوراء. إن كان بينكما خلاف فأعلنا نزاعاً على العقد، وتفصل فيه الإدارة.';
  end if;
  select c.client_id = auth.uid(),
         exists (select 1 from service_providers p where p.id = c.provider_id and p.owner_id = auth.uid())
    into v_client, v_provider
    from service_contracts c where c.id = new.contract_id;
  if new.status = 'pending' then
    raise exception 'المرحلة لا تعود إلى «لم تبدأ».';
  end if;
  if new.status in ('in_progress', 'submitted') and not coalesce(v_provider, false) then
    raise exception 'سير المرحلة وتسليمها من صلاحية مقدّم الخدمة.';
  end if;
  if new.status in ('approved', 'paid', 'rejected') and not coalesce(v_client, false) then
    raise exception 'اعتماد المرحلة ودفعها ورفضها من صلاحية العميل.';
  end if;
  return new;
end $$;

create trigger contract_milestones_moves_gate
  before update on public.contract_milestones
  for each row execute function public.contract_milestones_moves_gate();

revoke all on function public.service_contracts_insert_gate(), public.service_contracts_terms_frozen(),
  public.service_contracts_delete_gate(), public.contract_milestones_insert_gate(),
  public.contract_milestones_moves_gate(), public.sync_contract_total()
  from public, anon, authenticated;

-- ── توثيق الأرض ───────────────────────────────────────────────────────────────

alter table public.lands
  add column verified_by uuid references auth.users(id) on delete set null,
  add column verified_at timestamptz,
  add column verified_feddans numeric;

comment on column public.lands.verified_feddans is
  'المساحة التي وثّقتها الإدارة آخر مرّة. التوقيع على الشراكة يحسب عليها، لا على المساحة الحاليّة التي يكتبها المالك.';

-- The land verified before this column existed keeps its verification, at its area today; who verified it and when
-- were not recorded then, and are not invented now.
update public.lands set verified_feddans = feddans where verification = 'verified';

-- Who opened which document, to verify a land (one row per document and administrator, the first opening).
create table public.land_document_views (
  document_id uuid not null references public.land_documents(id) on delete cascade,
  admin_id    uuid not null references auth.users(id) on delete cascade,
  opened_at   timestamptz not null default now(),
  primary key (document_id, admin_id)
);

alter table public.land_document_views enable row level security;
revoke all on public.land_document_views from anon, authenticated;
grant select on public.land_document_views to authenticated;
create policy land_document_views_admin on public.land_document_views
  for select to authenticated using (is_admin());

-- The path of a land document, for an administrator, and the opening recorded. The page makes a short-lived link
-- from it; the bucket's own policy lets an administrator read it (evidence_read_own).
create or replace function public.land_document_open(p_document uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_path text;
begin
  if not is_admin() then
    raise exception 'للإدارة وحدها.';
  end if;
  select storage_path into v_path from land_documents where id = p_document;
  if v_path is null then
    raise exception 'لا مستند بهذا المعرّف.';
  end if;
  insert into land_document_views (document_id, admin_id) values (p_document, auth.uid())
  on conflict do nothing;
  return v_path;
end $$;

revoke execute on function public.land_document_open(uuid) from public, anon;
grant execute on function public.land_document_open(uuid) to authenticated;

create or replace function public.lands_verify_gate()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_unread integer;
  v_held   numeric;
begin
  if tg_op = 'INSERT' then
    if auth.uid() is not null
       and (new.verification = 'verified' or new.verified_by is not null or new.verified_at is not null
            or new.verified_feddans is not null) then
      raise exception 'تُسجَّل الأرض أوّلاً ثمّ تُوثَّق.';
    end if;
    return new;
  end if;

  -- The area cannot fall below what signed partnerships in force hold on any day (money-logic-2).
  if new.feddans < old.feddans then
    select coalesce(max(h.held), 0) into v_held
      from (
        select d.day, sum((a.terms->>'feddans')::numeric) as held
          from (select greatest(current_date, (x.terms->>'start_date')::date) as day
                  from partnership_agreements x
                 where x.land_id = new.id and x.status = 'signed'
                   and (x.terms->>'end_date')::date >= current_date) d
          join partnership_agreements a
            on a.land_id = new.id and a.status = 'signed'
           and (a.terms->>'start_date')::date <= d.day and (a.terms->>'end_date')::date >= d.day
         group by d.day
      ) h;
    if new.feddans < v_held then
      raise exception 'على هذه الأرض عقود شراكة موقَّعة سارية على % فداناً، فلا تنقص مساحتها عن ذلك.', trim_scale(v_held);
    end if;
  end if;

  if new.verification = 'verified' and old.verification is distinct from 'verified' then
    if auth.uid() is not null then
      if new.owner_id = auth.uid() then
        raise exception 'لا يوثّق المدير أرضاً يملكها: يوثّقها مديرٌ آخر، أو معاينةٌ مدفوعة.';
      end if;
      select count(*) into v_unread
        from land_documents d
       where d.land_id = new.id
         and not exists (select 1 from land_document_views v where v.document_id = d.id and v.admin_id = auth.uid());
      if v_unread > 0 then
        raise exception 'افتح مستندات الأرض كلّها قبل توثيقها (بقي % لم يُفتح).', v_unread;
      end if;
    end if;
    new.verified_by := auth.uid();
    new.verified_at := now();
    new.verified_feddans := new.feddans;
  elsif new.verified_by is distinct from old.verified_by
     or new.verified_at is distinct from old.verified_at
     or new.verified_feddans is distinct from old.verified_feddans then
    if auth.uid() is not null then
      raise exception 'من وثّق الأرض ومتى وبأيّ مساحة يُكتب عند التوثيق وحده.';
    end if;
  end if;
  return new;
end $$;

create trigger lands_verify_gate
  before insert or update on public.lands
  for each row execute function public.lands_verify_gate();

revoke all on function public.lands_verify_gate() from public, anon, authenticated;

-- ── التوقيع على الشراكة يحسب على المساحة الموثّقة ──────────────────────────────

create or replace function public.partnership_agreement_sign(
  p_agreement uuid, p_version integer, p_hash text, p_full_name text, p_signature text, p_user_agent text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_a partnership_agreements;
  v_role text;
  v_feddans numeric;
  v_ref text;
  v_manager uuid;
  v_needed integer;
  v_party uuid;
  v_start date;
  v_end date;
  v_peak numeric;
begin
  if auth.uid() is null then raise exception 'سجّل الدخول أولاً.'; end if;
  select * into v_a from partnership_agreements where id = p_agreement for update;
  if v_a.id is null then raise exception 'لستَ طرفاً في هذا العقد.'; end if;
  if v_a.model = 'managed' and v_a.manager_company_id is not null then
    select owner_id into v_manager from partner_companies where id = v_a.manager_company_id;
  end if;

  v_role := case when auth.uid() = v_a.owner_id then 'owner'
                 when auth.uid() = v_a.investor_id then 'investor'
                 when v_manager is not null and auth.uid() = v_manager then 'manager' end;
  if v_role is null then raise exception 'لستَ طرفاً في هذا العقد.'; end if;
  if v_a.status = 'signed' then raise exception 'العقد موقَّعٌ ومقفل.'; end if;
  if p_version <> v_a.version or p_hash <> v_a.terms_hash then
    raise exception 'عُدِّلت البنود منذ فتحتَ الصفحة. اقرأ النسخة الجديدة ثمّ وقّع.';
  end if;

  -- The area a signature counts against is the area the administration verified, on land that is still verified
  -- (audit money-logic-2, 3 November 2026): raising the land's area after a first signature, then signing again,
  -- had let two investors hold the same feddans.
  select case when verification = 'verified' then verified_feddans end into v_feddans from lands where id = v_a.land_id;
  if v_feddans is null then
    raise exception 'الأرض ليست موثّقةً الآن (تغيّرت بياناتها أو لم تُراجَع بعد)، فلا يُوقَّع عليها حتى تعيد الإدارة توثيقها.';
  end if;
  perform partnership_terms_check(v_a.model, v_a.terms, v_feddans);

  -- BUG-14 (backlog 162): a land is contracted once for a stretch of time. Two signatures
  -- at one moment meet at the land's row; then the area already held by SIGNED agreements
  -- on it is counted day by day, and the busiest day must still leave room for this one.
  perform 1 from lands where id = v_a.land_id for update;
  v_start := (v_a.terms->>'start_date')::date;
  v_end := (v_a.terms->>'end_date')::date;
  select coalesce(max(h.held), 0) into v_peak
    from (
      select d.day, coalesce(sum((o.terms->>'feddans')::numeric), 0) as held
        from (
          select v_start as day
          union
          select (x.terms->>'start_date')::date
            from partnership_agreements x
           where x.land_id = v_a.land_id and x.id <> v_a.id and x.status = 'signed'
             and (x.terms->>'start_date')::date between v_start and v_end
        ) d
        left join partnership_agreements o
          on o.land_id = v_a.land_id and o.id <> v_a.id and o.status = 'signed'
         and (o.terms->>'start_date')::date <= d.day and (o.terms->>'end_date')::date >= d.day
       group by d.day
    ) h;
  if v_peak + (v_a.terms->>'feddans')::numeric > v_feddans then
    raise exception 'الأرض متعاقَدٌ على % من % فداناً في جزءٍ من هذه المدّة، والمتبقّي % فقط. عدّلوا المساحة أو المدّة.',
      trim_scale(v_peak), trim_scale(v_feddans), trim_scale(greatest(v_feddans - v_peak, 0));
  end if;
  if v_a.model = 'managed' and v_manager is null then
    raise exception 'سمِّ الشركة المديرة في البنود قبل التوقيع.';
  end if;

  begin
    insert into partnership_signatures (agreement_id, version, terms_hash, signer_id, role, full_name, signature, user_agent)
    values (v_a.id, v_a.version, v_a.terms_hash, auth.uid(), v_role, btrim(p_full_name), p_signature,
            left(p_user_agent, 400));
  exception when unique_violation then
    raise exception 'وقّعتَ هذه النسخة من قبل.';
  end;

  v_needed := case when v_a.model = 'managed' then 3 else 2 end;

  if (select count(*) from partnership_signatures
       where agreement_id = v_a.id and version = v_a.version) = v_needed then
    v_ref := 'SDQ-' || to_char(now() at time zone 'Africa/Khartoum', 'YYYY') || '-'
             || lpad(nextval('partnership_agreement_ref_seq')::text, 5, '0');
    update partnership_agreements set status = 'signed', signed_at = now(), ref = v_ref where id = v_a.id;
    foreach v_party in array array_remove(array[v_a.owner_id, v_a.investor_id, v_manager], null) loop
      perform notify_user(v_party, 'agreement_signed',
        case when v_needed = 3 then 'وُقِّع عقد الشراكة من الأطراف الثلاثة' else 'وُقِّع عقد الشراكة من الطرفين' end,
        'العقد مقفلٌ الآن، وشهدت عليه سوداقري برقم ' || v_ref || '.', '/invest/agreements/' || v_a.id);
    end loop;
    perform notify_admins('agreement_signed', 'عقد شراكة جديد موقَّع',
      case when v_needed = 3 then 'وقّع صاحب أرضٍ ومستثمرٌ وشركةٌ مديرة عقد شراكة برقم '
           else 'وقّع مستثمرٌ وصاحب أرض عقد شراكة برقم ' end || v_ref || '.',
      '/admin/inbox#agreements');
    return v_ref;
  end if;

  foreach v_party in array array_remove(array[v_a.owner_id, v_a.investor_id, v_manager], null) loop
    if v_party <> auth.uid() and not exists (
         select 1 from partnership_signatures s
          where s.agreement_id = v_a.id and s.version = v_a.version and s.signer_id = v_party) then
      perform notify_user(v_party, 'agreement_update', 'وقّع طرفٌ عقد الشراكة',
        'بقي توقيعك ليُقفل العقد وتشهد عليه سوداقري.', '/invest/agreements/' || v_a.id);
    end if;
  end loop;
  return null;
end;
$$;

revoke execute on function public.partnership_agreement_sign(uuid, integer, text, text, text, text) from public, anon;
grant execute on function public.partnership_agreement_sign(uuid, integer, text, text, text, text) to authenticated;

insert into supabase_migrations.schema_migrations (version, name) values ('20261103010000', 'contracts_held_to_their_terms') on conflict do nothing;

-- ═══ 20261103020000_trial_records.sql ═══
-- بيانات التجربة تُوسَم ولا تُحسب سجلّاً (فحص 3 نوفمبر 2026، السؤال 10 للمالك: «نوسمها تجريبيّ»؛ data-quality-1 و-5).
--
-- الفرصة الوحيدة المعروضة على أرض المدير وبيده، وسجلّ منفّذها ودرجة ثقته من موسمٍ اسمه «[تجربة]». فلا يُحذف شيء:
--   - `seasons.trial`: الموسم التجريبيّ لا يدخل سجلّ المنفّذ (farmer_season_records) ولا مواسمه المكتملة ونسبة توثيقه
--     (refresh_operator_record)؛
--   - `projects.trial`: الفرصة التجريبيّة تحمل على صفحتها وبطاقتها «فرصة تجريبيّة: منفّذها من فريق المنصّة».
-- والوسم للإدارة وحدها: صاحب موسمٍ لا يخفي موسماً فاشلاً من سجلّه بوسمه تجريبيّاً.

alter table public.seasons add column trial boolean not null default false;
alter table public.projects add column trial boolean not null default false;

comment on column public.seasons.trial is 'موسمٌ تجريبيّ: لا يُحسب في سجلّ المنفّذ ولا في درجة ثقته. تضعه الإدارة وحدها.';
comment on column public.projects.trial is 'فرصةٌ تجريبيّة يشغّلها فريق المنصّة، وتقول ذلك صفحتها وبطاقتها. تضعه الإدارة وحدها.';

-- Visitors read projects column by column (20261022050000, 20261025230000): the new column is one they may read.
grant select (trial) on public.projects to anon, authenticated;

create or replace function public.trial_flag_admin_only()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or is_admin() then
    return new;
  end if;
  if (tg_op = 'INSERT' and new.trial) or (tg_op = 'UPDATE' and new.trial is distinct from old.trial) then
    raise exception 'وسم «تجريبيّ» للإدارة وحدها.';
  end if;
  return new;
end $$;

create trigger seasons_trial_admin_only
  before insert or update on public.seasons
  for each row execute function public.trial_flag_admin_only();
create trigger projects_trial_admin_only
  before insert or update on public.projects
  for each row execute function public.trial_flag_admin_only();

revoke all on function public.trial_flag_admin_only() from public, anon, authenticated;

-- ── السجلّ يعدّ ما حدث لا ما جُرِّب ─────────────────────────────────────────────

create or replace function public.farmer_season_records(p_id uuid)
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
    (select count(distinct st.id)::int from season_stages st
       join stage_evidence e on e.stage_id = st.id
      where st.season_id = s.id
        and e.storage_path is not null),
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
    and not s.trial
  order by s.planting_date desc;
$function$;
revoke all on function public.farmer_season_records(uuid) from public, anon, authenticated;
grant execute on function public.farmer_season_records(uuid) to service_role;

-- The operator's record on their profile, recomputed for one owner (the trigger below, and once here).
create or replace function public._operator_record_recount(p_owner uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  done int;
  total_stages int;
  signed_stages int;
begin
  select count(*) into done from seasons s
    where s.owner_id = p_owner and s.status = 'completed' and not s.trial
      and exists (select 1 from season_stages st
                   where st.season_id = s.id and st.completed
                     and exists (select 1 from stage_evidence e
                                  where e.stage_id = st.id and e.storage_path is not null));

  select count(*), count(*) filter (where completed)
    into total_stages, signed_stages
    from season_stages st join seasons s on s.id = st.season_id
    where s.owner_id = p_owner and not s.trial;

  perform set_config('app.operator_record', '1', true);
  update profiles
    set completed_seasons = done,
        reporting_rate = case when total_stages > 0
                              then round((signed_stages::numeric / total_stages), 2)
                              else 0 end
    where id = p_owner;
  perform set_config('app.operator_record', '', true);
end $$;

create or replace function public.refresh_operator_record()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (new.status = 'completed' and coalesce(old.status, '') <> 'completed')
     or new.trial is distinct from old.trial then
    perform _operator_record_recount(new.owner_id);
  end if;
  return new;
end $$;

revoke execute on function public.refresh_operator_record() from public, anon, authenticated;
revoke execute on function public._operator_record_recount(uuid) from public, anon, authenticated;

-- ── وسم ما على الموقع اليوم ─────────────────────────────────────────────────────
-- The one season named «[تجربة]», and the one open opportunity an administrator submitted (3 November 2026: one each).
update public.seasons set trial = true where name like '%[تجربة]%';
update public.projects set trial = true
 where status = 'open' and not is_demo
   and submitted_by in (select id from public.profiles where role = 'admin');

do $$
declare r record;
begin
  for r in select distinct owner_id from public.seasons where trial loop
    perform public._operator_record_recount(r.owner_id);
  end loop;
end $$;

insert into supabase_migrations.schema_migrations (version, name) values ('20261103020000', 'trial_records') on conflict do nothing;

-- ═══ 20261104010000_evidence_delete_reads_what_it_needs.sql ═══
-- الحذفُ من التخزين يعمل من جديد، بالحماية نفسها (فحص 3 نوفمبر 2026، db-a-4؛ السؤال 14 للمالك: «نُصلحه في هذه المرحلة»).
--
-- منذ 20261025150000 لا يقرأ `authenticated` عمود export_offer_evidence.storage_path (مواقع المزارع في صور الأدلّة).
-- وسياسةُ الحذف evidence_delete_own (20260904210000) تقرؤه في استعلامٍ فرعيّ، والإذنُ يُفحص عند تخطيط الاستعلام لا عند
-- تنفيذه، وسياساتُ الحذف كلُّها تُضمّ في كلّ حذف. فصار كلُّ حذفٍ من storage.objects يُردّ بـ«permission denied» — من الدلوين،
-- ولصاحب الملفّ وللمدير — ولو لم يمسّ دليلاً.
--
-- الفحوصُ نفسُها تنتقل إلى دالّةٍ تقرأ بصلاحيّة مالكها، والسياسةُ تسألها. لا يتغيّر ما يُسمح بحذفه: صاحبُ المجلّد وحده،
-- وما اعتُمد عليه يبقى (عرضُ صادرٍ خرج من المسوّدة، مرحلةُ موسمٍ أُنجزت، مرحلةُ عقدٍ وُوفق عليها، أرضٌ وُثِّقت، سلسلةُ
-- العهدة). والدالّةُ تجيب عن ملفّات السائل وحده، فلا تكشف عن ملفّ غيره هل اعتُمد عليه.

create or replace function public.evidence_object_withdrawable(p_name text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select (storage.foldername(p_name))[1] = auth.uid()::text

    -- عرضُ صادرٍ خرج من المسوّدة
    and not exists (
      select 1 from export_offer_evidence e
        join export_offers o on o.id = e.offer_id
       where e.storage_path = p_name
         and o.status not in ('draft', 'rejected'))

    -- مرحلةُ موسمٍ اعتُمدت
    and not exists (
      select 1 from stage_evidence se
        join season_stages ss on ss.id = se.stage_id
       where se.storage_path = p_name
         and ss.completed)

    -- مرحلةُ عقدٍ وُوفق عليها
    and not exists (
      select 1 from milestone_evidence me
        join contract_milestones cm on cm.id = me.milestone_id
       where me.storage_path = p_name
         and cm.approved_at is not null)

    -- أرضٌ وُثِّقت
    and not exists (
      select 1 from land_documents ld
        join lands l on l.id = ld.land_id
       where ld.storage_path = p_name
         and l.verification = 'verified')

    -- وسلسلةُ العهدة: لا شرطَ ولا استثناء.
    and not exists (
      select 1 from custody_evidence ce
       where ce.storage_path = p_name)
$$;

comment on function public.evidence_object_withdrawable(text) is
  'ملفٌّ في دلو الأدلّة يملكه السائل ولم يُعتمد عليه بعد، فيجوز له حذفه. تسألها سياسة evidence_delete_own.';

-- Default privileges are revoked since 20261024030000: the policy runs as the member, who must be able to call it.
revoke all on function public.evidence_object_withdrawable(text) from public, anon;
grant execute on function public.evidence_object_withdrawable(text) to authenticated, service_role;

drop policy if exists evidence_delete_own on storage.objects;
create policy evidence_delete_own on storage.objects
  for delete to authenticated
  using (bucket_id = 'evidence' and public.evidence_object_withdrawable(name));

insert into supabase_migrations.schema_migrations (version, name) values ('20261104010000', 'evidence_delete_reads_what_it_needs') on conflict do nothing;

-- ═══ 20261104020000_prices_publish_trusted.sql ═══
-- الأسعار الموثوقة تُنشر بلا انتظار، وتوقّف المصادر يُنبَّه عليه (فحص 3 نوفمبر 2026، ops-6 وdata-quality-7؛ المالك،
-- 4 نوفمبر، السؤال 16: «الأسعار تُنشر بلا اعتمادي»).
--
-- منذ 25 أكتوبر كان كلُّ رقمٍ يقرؤه الفحص اليوميّ يُحجز حتى ينقر المدير، والموثوقُ منها («قراءة موثوقة تنتظر اعتماد
-- الإدارة»: من قارئٍ يقرأ بيقين، وضمن حركة يومٍ من آخر رقمٍ منشور، ولم يختلف عليه مصدرٌ آخر) ينتظر نقرةً لا تقرّر
-- شيئاً. المالك الآن: يُنشر وحده. وما سواه يبقى محجوزاً لقراره كما كان: ما شذّ، وما اختلفت فيه المصادر، ونصّ القضارف الحرّ.
--
-- ومفتاح الخدمة يبقى لا ينشر بنفسه (market_quotes_service_guard): ينشر هذه الدالّةُ، وهي لا تنشر إلا ما قرأه هذا
-- الفحص للتوّ (بمعرّفاته، وفي الساعة الأخيرة) وسببُه «قراءة موثوقة»، وتكتب في السبب أنّه نُشر آليّاً.
--
-- والفحص اليوميّ كتب «سليم» 115 مرّة والأسعار متوقّفة: price_feeds_alert ينبّه المدير داخل المنصّة مرّةً في اليوم حين
-- تتوقّف خلاصةٌ أو يبقى رقمٌ محجوزاً أكثر من يومين.

-- ── نوع الإشعار ──────────────────────────────────────────────────────────────
do $$
declare
  v_def text;
begin
  select pg_get_constraintdef(oid) into v_def
    from pg_constraint
   where conname = 'notifications_kind_check' and conrelid = 'public.notifications'::regclass;
  -- The production check lists every kind; one written another way (the gates' base schema) is left alone.
  if v_def like '%ARRAY[%' and v_def not like '%system_alert%' then
    execute 'alter table public.notifications drop constraint notifications_kind_check';
    execute 'alter table public.notifications add constraint notifications_kind_check '
         || regexp_replace(v_def, '\]\)\)\)\s*$', ', ''system_alert''::text])))');
    select pg_get_constraintdef(oid) into v_def
      from pg_constraint
     where conname = 'notifications_kind_check' and conrelid = 'public.notifications'::regclass;
    if v_def not like '%system_alert%' then
      raise exception 'لم يُضَف نوع الإشعار system_alert';
    end if;
  end if;
end $$;

-- ── النشر الآليّ للموثوق ─────────────────────────────────────────────────────
create function public.market_quotes_publish_trusted(p_ids uuid[])
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  n integer;
begin
  if p_ids is null or cardinality(p_ids) = 0 then
    return 0;
  end if;
  update public.market_quotes
     set status = 'published',
         reviewed_at = now(),
         reason = 'نُشر آليّاً: قراءة موثوقة ضمن حركة اليوم (المالك، 4 نوفمبر 2026)'
   where id = any (p_ids)
     and status = 'held'
     and reason = 'قراءة موثوقة تنتظر اعتماد الإدارة'
     and method = 'auto'
     and created_at > now() - interval '1 hour';
  get diagnostics n = row_count;
  return n;
end $$;

comment on function public.market_quotes_publish_trusted(uuid[]) is
  'ينشر ما قرأه الفحص اليوميّ للتوّ بيقين وضمن حركة اليوم. للخادم وحده؛ ما سواه يبقى محجوزاً لقرار المدير.';

-- ── التنبيه على التوقّف ──────────────────────────────────────────────────────
create function public.price_feeds_alert(p_lines text[])
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  lines text[] := coalesce(p_lines, '{}');
  held_old integer;
  body text;
begin
  select count(*) into held_old
    from public.market_quotes
   where status = 'held' and created_at < now() - interval '2 days';
  if cardinality(lines) = 0 and held_old = 0 then
    return 0;
  end if;
  -- Once a day is enough: the run is daily, and a second run (the «حدّث الآن» button) should not repeat it.
  if exists (select 1 from public.notifications
              where kind = 'system_alert' and link = '/admin/prices' and created_at > now() - interval '20 hours') then
    return 0;
  end if;
  body := array_to_string(lines[1:6], ' · ');
  if held_old > 0 then
    body := concat_ws(' · ', nullif(body, ''), held_old || ' رقماً محجوزاً منذ أكثر من يومين ينتظر قرارك');
  end if;
  return public.notify_admins('system_alert', 'الأسعار تحتاج نظرك', left(body, 500), '/admin/prices');
end $$;

comment on function public.price_feeds_alert(text[]) is
  'ينبّه المدير داخل المنصّة، مرّةً في اليوم، حين تتوقّف خلاصة أسعار أو يبقى رقمٌ محجوزاً أكثر من يومين. للخادم وحده.';

-- ── الصلاحيّات: للخادم وحده ──────────────────────────────────────────────────
revoke all on function public.market_quotes_publish_trusted(uuid[]) from public, anon, authenticated;
revoke all on function public.price_feeds_alert(text[]) from public, anon, authenticated;
grant execute on function public.market_quotes_publish_trusted(uuid[]) to service_role;
grant execute on function public.price_feeds_alert(text[]) to service_role;

insert into supabase_migrations.schema_migrations (version, name) values ('20261104020000', 'prices_publish_trusted') on conflict do nothing;

commit;
