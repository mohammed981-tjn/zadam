-- ═══════════════════════════════════════════════════════════════════════════
-- تقارير الدفاتر: قائمة الدخل، والميزانيّة، والتدفّقات النقديّة، وربحيّة المواسم (البند ١٨٧، المرحلة ٢د)
--
-- كلّها تقرأ من السطور المقيَّدة بالدولار (وحدة القياس) وبصلاحية المنادي (security invoker)، فتحمي سياسةُ
-- الصفوف قراءتَها: مستخدمٌ يرى دفتره، والمدير دفتر المنصّة، والمفحوص أثناء فحصٍ جارٍ (البند ١٩١).
-- ميزان المراجعة وكشف الحساب وإثبات التوازن موجودة في المحرّك. لا يُكتب هنا شيء.
--
-- الإشارة: المبلغ في اتجاه الحساب الطبيعيّ — مدين للأصول والمصروفات، دائن للالتزامات والملكيّة والإيرادات.
-- حسابات ٩xxx إحصائيّة (البند ١٩١) خارج الميزانيّة وقائمة الدخل دائماً.
-- ═══════════════════════════════════════════════════════════════════════════

-- حركة حسابات الإيراد والمصروف في فترة، ولموسمٍ بعينه إن طُلب.
create function public.ledger_income_statement(
  p_book   uuid,
  p_from   date default null,
  p_to     date default null,
  p_season uuid default null
) returns table (
  account_id uuid,
  code       text,
  name_ar    text,
  name_en    text,
  type       text,
  system_key text,
  amount     bigint
)
language sql
stable
security invoker
set search_path = public
as $$
  select a.id, a.code, a.name_ar, a.name_en, a.type, a.system_key,
         sum(case when (a.type = 'revenue') = (l.side = 'C') then l.base_minor else -l.base_minor end)::bigint
    from public.ledger_accounts a
    join public.journal_lines l on l.account_id = a.id and l.book_id = a.book_id
    join public.journal_entries e on e.id = l.entry_id
   where a.book_id = p_book
     and a.type in ('revenue', 'expense')
     and a.code not like '9%'
     and (p_from is null or e.entry_date >= p_from)
     and (p_to is null or e.entry_date <= p_to)
     and (p_season is null or l.season_id = p_season)
   group by a.id, a.code, a.name_ar, a.name_en, a.type, a.system_key
  having sum(case when (a.type = 'revenue') = (l.side = 'C') then l.base_minor else -l.base_minor end) <> 0
   order by a.code;
$$;

-- أرصدة الأصول والالتزامات والملكيّة في يوم. صافي الدخل غير المقفل يُحسب من قائمة الدخل حتى اليوم نفسه.
create function public.ledger_balance_sheet(p_book uuid, p_as_of date default null)
returns table (
  account_id uuid,
  code       text,
  name_ar    text,
  name_en    text,
  type       text,
  system_key text,
  balance    bigint
)
language sql
stable
security invoker
set search_path = public
as $$
  select a.id, a.code, a.name_ar, a.name_en, a.type, a.system_key,
         sum(case when (a.type = 'asset') = (l.side = 'D') then l.base_minor else -l.base_minor end)::bigint
    from public.ledger_accounts a
    join public.journal_lines l on l.account_id = a.id and l.book_id = a.book_id
    join public.journal_entries e on e.id = l.entry_id
   where a.book_id = p_book
     and a.type in ('asset', 'liability', 'equity')
     and a.code not like '9%'
     and (p_as_of is null or e.entry_date <= p_as_of)
   group by a.id, a.code, a.name_ar, a.name_en, a.type, a.system_key
  having sum(case when (a.type = 'asset') = (l.side = 'D') then l.base_minor else -l.base_minor end) <> 0
   order by a.code;
$$;

-- إيراد كلّ موسمٍ ومصروفه (الموسم بُعدٌ على السطر). سطورٌ بلا موسم تظهر تحت null.
create function public.ledger_profit_by_season(p_book uuid, p_from date default null, p_to date default null)
returns table (
  season_id uuid,
  revenue   bigint,
  expense   bigint
)
language sql
stable
security invoker
set search_path = public
as $$
  select l.season_id,
         coalesce(sum(case when l.side = 'C' then l.base_minor else -l.base_minor end) filter (where a.type = 'revenue'), 0)::bigint,
         coalesce(sum(case when l.side = 'D' then l.base_minor else -l.base_minor end) filter (where a.type = 'expense'), 0)::bigint
    from public.journal_lines l
    join public.ledger_accounts a on a.id = l.account_id and a.book_id = l.book_id
    join public.journal_entries e on e.id = l.entry_id
   where l.book_id = p_book
     and a.type in ('revenue', 'expense')
     and a.code not like '9%'
     and (p_from is null or e.entry_date >= p_from)
     and (p_to is null or e.entry_date <= p_to)
   group by l.season_id
  having coalesce(sum(case when l.side = 'C' then l.base_minor else -l.base_minor end) filter (where a.type = 'revenue'), 0) <> 0
      or coalesce(sum(case when l.side = 'D' then l.base_minor else -l.base_minor end) filter (where a.type = 'expense'), 0) <> 0
   order by l.season_id nulls last;
$$;

-- التدفّقات النقديّة بالطريقة المباشرة: لكلّ قيدٍ مسَّ النقد (نقد، بنك، محفظة) ما دخل أو خرج، موزَّعاً على
-- الحسابات المقابلة في الجهة الأخرى من القيد، ومصنَّفاً: تشغيليّ (إيراد ومصروف وذمم ومخزون)، واستثماريّ
-- (أصول ثابتة وثروة حيوانيّة)، وتمويليّ (رأس مال وسحوبات وقروض وتمويل). زوج الرسملة (١٤١٠/٥٩٠٠) أداةُ عرضٍ
-- لا مقابلٌ حقيقيّ فلا يُحتسب. حين يتعدّد المقابل يُوزَّع المبلغ بنسبة السطور، وبقيّة القسمة للأكبر.
create function public.ledger_cash_flow(p_book uuid, p_from date default null, p_to date default null)
returns table (
  section    text,
  account_id uuid,
  code       text,
  name_ar    text,
  name_en    text,
  amount     bigint
)
language sql
stable
security invoker
set search_path = public
as $$
  with cash as (
    select l.entry_id,
           sum(case when l.side = 'D' then l.base_minor else -l.base_minor end)::bigint as net
      from public.journal_lines l
      join public.ledger_accounts a on a.id = l.account_id and a.book_id = l.book_id
      join public.journal_entries e on e.id = l.entry_id
     where l.book_id = p_book
       and a.system_key in ('cash_on_hand', 'bank', 'wallet')
       and (p_from is null or e.entry_date >= p_from)
       and (p_to is null or e.entry_date <= p_to)
     group by l.entry_id
    having sum(case when l.side = 'D' then l.base_minor else -l.base_minor end) <> 0
  ), counter as (
    select c.entry_id, c.net, l.account_id, l.base_minor as w,
           (sum(l.base_minor) over (partition by c.entry_id))::bigint as w_total,
           row_number() over (partition by c.entry_id order by l.base_minor desc, l.line_no) as rn
      from cash c
      join public.journal_lines l on l.entry_id = c.entry_id and l.book_id = p_book
      join public.ledger_accounts a on a.id = l.account_id and a.book_id = l.book_id
     where coalesce(a.system_key, '') not in ('cash_on_hand', 'bank', 'wallet', 'crops_in_progress', 'costs_capitalised')
       and l.side = case when c.net > 0 then 'C' else 'D' end
  ), part as (
    select account_id,
           case when rn = 1
                then net - coalesce(sum((net * w) / w_total) filter (where rn > 1) over (partition by entry_id), 0)
                else (net * w) / w_total end as amt
      from counter
  )
  select case
           when a.system_key in ('owner_capital', 'partner_contributions', 'owner_drawings', 'retained_earnings',
                                 'financing_from_investor', 'loans', 'due_from_partner', 'due_to_partner') then 'financing'
           when a.system_key in ('machinery', 'land_improvements', 'accumulated_depreciation', 'livestock') then 'investing'
           else 'operating'
         end,
         a.id, a.code, a.name_ar, a.name_en,
         sum(p.amt)::bigint
    from part p
    join public.ledger_accounts a on a.id = p.account_id
   where a.book_id = p_book
   group by 1, a.id, a.code, a.name_ar, a.name_en
  having sum(p.amt) <> 0
   order by 1, a.code;
$$;

-- ── الصلاحيّات: للمسجَّل وحده، وسياسة الصفوف تحدّد ما يراه ──────────────────

revoke execute on function
  public.ledger_income_statement(uuid, date, date, uuid),
  public.ledger_balance_sheet(uuid, date),
  public.ledger_profit_by_season(uuid, date, date),
  public.ledger_cash_flow(uuid, date, date)
  from public, anon, service_role;
grant execute on function
  public.ledger_income_statement(uuid, date, date, uuid),
  public.ledger_balance_sheet(uuid, date),
  public.ledger_profit_by_season(uuid, date, date),
  public.ledger_cash_flow(uuid, date, date)
  to authenticated;
