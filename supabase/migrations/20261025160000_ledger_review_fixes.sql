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
