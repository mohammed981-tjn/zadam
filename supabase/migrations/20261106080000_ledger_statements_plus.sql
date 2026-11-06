-- ═══════════════════════════════════════════════════════════════════════════
-- القوائم الماليّة الكاملة (البند ٢٠٥، قرار المالك 6 نوفمبر: «القوائم»)
--
-- دوالّ قراءةٍ فقط فوق دوالّ التقارير القائمة (20261024150000_ledger_reports.sql)، لا تكتب شيئاً ولا تغيّر حارساً أو سياسة:
--
--   ledger_compare_period    الفترة المقابلة: الشهر السابق، أو السنة السابقة، أو الموسم السابق.
--   ledger_income_compare    قائمة الدخل بعمودين (هذه الفترة والسابقة) والتغيّر ونسبته.
--   ledger_balance_compare   الميزانيّة بعمودين، وربح ما لم يُقفل مقسوماً كما في صفحة الدفتر.
--   ledger_cash_flow_compare التدفّقات النقديّة بعمودين، ونقد أوّل الفترة وآخرها لكلٍّ منهما.
--   ledger_equity_statement  قائمة التغيّر في حقوق الملكيّة: أوّل الفترة، المساهمات، السحوبات، الربح، غيرها، آخر الفترة.
--   ledger_ageing            أعمار الذمم المدينة والدائنة (٠–٣٠ / ٣١–٦٠ / ٦١–٩٠ / أكثر من ٩٠ يوماً).
--   ledger_budget_vs_actual  الميزانيّة التقديريّة لكلّ مرحلة موسمٍ مقابل ما صُرف فعلاً في الدفتر.
--   ledger_statement_facts   ما تُكتب منه الإيضاحات: العملات، وأسعار الصرف ومصدرها، والأصول، والإقفال، والقيود.
--
-- كلّها بصلاحية المالك (security definer) وتبدأ بفحصٍ واحد هو قاعدة القراءة نفسها: `_ledger_book_readable` —
-- صاحب الدفتر، والإدارة في دفتر المنصّة، والمدير الفاحص ما دام فحصه قائماً (البند ١٩١). كلُّ ما سواه يُرفض بـ
-- «ليس هذا دفترك»، فلا يعرف الغريب من الرفض شيئاً، ولا يرى شريكٌ دفتر شريكه.
--
-- الأعمار من الدفتر نفسه، كما يُقيَّد فعلاً:
--   • الدين المعلّق في الحساب (١٢١٠ المشترون، ١٢٣٠ المستحق من الشريك، ١٢١٠ رسومٌ مستحقّة للمنصّة؛ ٢١١٠ الموردون،
--     ٢١٢٠ الأجور المستحقة، ٢١٣٠ المستحق للشريك) يُقسَم إلى بنودٍ هي القيود التي زادته، وعمرُ البند من يوم قيده (لا يحمل
--     الدفتر تاريخ استحقاق).
--   • قيد الموسم «الآجل» وسداده («سدّدتُ/قبضتُ» وفرق صرفه) مربوطان بالسطر نفسه، فيُطرح السداد من بنده هو.
--   • وما سوى ذلك من نقصٍ في الحساب (قيدٌ يدويّ، سدادٌ لم يُربط) يُطرح من أقدم البنود أوّلاً (الوارد أوّلاً يُسدَّد أوّلاً).
--   • والقيد المعكوس وعاكسه لا يدخلان. ومجموع الأعمار في كلّ حساب = رصيده في الميزانيّة يومها، تفحصه البوّابة.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── الفحص الواحد ────────────────────────────────────────────────────────────

create function public._ledger_statement_gate(p_book uuid)
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'سجّل الدخول أولاً';
  end if;
  if p_book is null or not public._ledger_book_readable(p_book) then
    raise exception 'ليس هذا دفترك';
  end if;
end $$;

-- التغيّر بالنسبة: إلى القيمة المطلقة للسابق، بمنزلةٍ عشريّة واحدة؛ ولا نسبة لما كان صفراً أو لم يكن.
create function public._ledger_change_pct(p_cur bigint, p_prev bigint)
returns numeric
language sql
immutable
set search_path = public
as $$
  select case when p_prev is null or p_prev = 0 then null
              else round((coalesce(p_cur, 0) - p_prev) * 100.0 / abs(p_prev), 1) end
$$;

-- آخر يوم في شهر اليوم.
create function public._ledger_month_end(p_day date)
returns date
language sql
immutable
set search_path = public
as $$ select (date_trunc('month', p_day) + interval '1 month' - interval '1 day')::date $$;

-- اليوم نفسه قبل شهرٍ أو سنة؛ وآخر الشهر يقابله آخر الشهر (٣٠ نوفمبر ← ٣١ أكتوبر، ٢٩ فبراير ← ٢٨ فبراير).
create function public._ledger_shift_back(p_day date, p_step interval)
returns date
language sql
immutable
set search_path = public
as $$
  select case when p_day = public._ledger_month_end(p_day)
              then public._ledger_month_end((p_day - p_step)::date)
              else (p_day - p_step)::date end
$$;

-- صافي الدخل في فترة (أو حتى يومٍ إن لم تُعطَ بدايتها)، بلا حسابات ٩xxx: من قائمة الدخل القائمة نفسها.
create function public._ledger_net_income(p_book uuid, p_from date, p_to date, p_season uuid default null)
returns bigint
language sql
stable
set search_path = public
as $$
  select coalesce(sum(case when i.type = 'revenue' then i.amount else -i.amount end), 0)::bigint
    from public.ledger_income_statement(p_book, p_from, p_to, p_season) i
$$;

-- رصيد النقد (نقد وبنك ومحفظة) في يوم.
create function public._ledger_cash_at(p_book uuid, p_as_of date)
returns bigint
language sql
stable
set search_path = public
as $$
  select coalesce(sum(b.balance), 0)::bigint
    from public.ledger_balance_sheet(p_book, p_as_of) b
   where b.system_key in ('cash_on_hand', 'bank', 'wallet')
$$;

-- ── الفترة المقابلة ─────────────────────────────────────────────────────────
--
-- p_basis: 'month' أو 'year' — الفترة نفسها قبل شهرٍ أو سنة (سنةٌ حتى اليوم تقابلها السنة السابقة حتى اليوم نفسه)؛
-- 'season' — الموسم المُعطى من مواسم صاحب الدفتر، من يوم زراعته إلى حصاده (أو اليوم)، ومقابلُه الموسم الذي زُرع قبله؛
-- 'none' — بلا مقابلة.

create function public.ledger_compare_period(
  p_book   uuid,
  p_basis  text,
  p_from   date default null,
  p_to     date default null,
  p_season uuid default null
) returns table (
  cur_from         date,
  cur_to           date,
  prev_from        date,
  prev_to          date,
  cur_season       uuid,
  prev_season      uuid,
  cur_season_name  text,
  prev_season_name text
)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_owner uuid;
  v_kind  text;
  s       public.seasons;
  p       public.seasons;
  v_today date := public.ledger_today();
begin
  perform public._ledger_statement_gate(p_book);
  if p_basis is null or p_basis not in ('month', 'year', 'season', 'none') then
    raise exception 'أساس المقارنة غير معروف: %', coalesce(p_basis, '');
  end if;

  if p_basis = 'season' then
    select b.owner_id, b.kind into v_owner, v_kind from public.ledger_books b where b.id = p_book;
    select * into s from public.seasons x where x.id = p_season and x.owner_id = v_owner and v_kind = 'farm';
    if not found then
      raise exception 'هذا الموسم ليس من هذا الدفتر';
    end if;
    select * into p from public.seasons x
     where x.owner_id = v_owner and x.id <> s.id
       and (x.planting_date < s.planting_date or (x.planting_date = s.planting_date and x.created_at < s.created_at))
     order by x.planting_date desc, x.created_at desc
     limit 1;
    return query select
      s.planting_date,
      greatest(s.planting_date, least(coalesce(s.harvest_date, v_today), v_today)),
      p.planting_date,
      case when p.id is null then null::date
           else greatest(p.planting_date, least(coalesce(p.harvest_date, v_today), v_today)) end,
      s.id, p.id, s.name, p.name;
    return;
  end if;

  if p_from is null or p_to is null then
    raise exception 'الفترة تحتاج يوم بدايةٍ ويوم نهاية';
  end if;
  if p_from > p_to then
    raise exception 'بداية الفترة بعد نهايتها';
  end if;

  return query select
    p_from, p_to,
    case p_basis when 'month' then public._ledger_shift_back(p_from, interval '1 month')
                 when 'year'  then public._ledger_shift_back(p_from, interval '1 year') end,
    case p_basis when 'month' then public._ledger_shift_back(p_to, interval '1 month')
                 when 'year'  then public._ledger_shift_back(p_to, interval '1 year') end,
    null::uuid, null::uuid, null::text, null::text;
end $$;

-- ── قائمة الدخل المقارنة ────────────────────────────────────────────────────
--
-- عمود «السابقة» يُحسب إن أُعطيت فترته أو موسمه، وإلا فهو فارغ (لا صفر): لا مقابلة لا تعني أنّ السابق كان صفراً.

create function public.ledger_income_compare(
  p_book        uuid,
  p_from        date,
  p_to          date,
  p_prev_from   date default null,
  p_prev_to     date default null,
  p_season      uuid default null,
  p_prev_season uuid default null
) returns table (
  account_id     uuid,
  code           text,
  name_ar        text,
  name_en        text,
  type           text,
  system_key     text,
  current_minor  bigint,
  previous_minor bigint,
  change_minor   bigint,
  change_pct     numeric
)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_has_prev boolean := p_prev_from is not null or p_prev_to is not null or p_prev_season is not null;
begin
  perform public._ledger_statement_gate(p_book);
  return query
  with cur as (
    select * from public.ledger_income_statement(p_book, p_from, p_to, p_season)
  ), prev as (
    select * from public.ledger_income_statement(p_book, p_prev_from, p_prev_to, p_prev_season) where v_has_prev
  ), j as (
    select coalesce(c.account_id, q.account_id) as account_id,
           coalesce(c.code, q.code) as code, coalesce(c.name_ar, q.name_ar) as name_ar,
           coalesce(c.name_en, q.name_en) as name_en, coalesce(c.type, q.type) as type,
           coalesce(c.system_key, q.system_key) as system_key,
           coalesce(c.amount, 0)::bigint as cur_m,
           case when v_has_prev then coalesce(q.amount, 0)::bigint end as prev_m
      from cur c full join prev q on q.account_id = c.account_id
  )
  select j.account_id, j.code, j.name_ar, j.name_en, j.type, j.system_key,
         j.cur_m, j.prev_m,
         case when v_has_prev then j.cur_m - j.prev_m end,
         public._ledger_change_pct(j.cur_m, j.prev_m)
    from j
   order by j.code;
end $$;

-- ── الميزانيّة المقارنة ─────────────────────────────────────────────────────
--
-- حسابات الأصول والالتزامات والملكيّة في يومين، ومعها سطران محسوبان كما في صفحة الدفتر (لا قيد إقفالٍ في دفترٍ لا
-- يُعدَّل): أرباح السنوات السابقة (`_income_prior`) وربح سنة القائمة حتى يومها (`_income_current`)، كلٌّ بسنة عموده.

create function public.ledger_balance_compare(
  p_book        uuid,
  p_as_of       date,
  p_prev_as_of  date default null
) returns table (
  account_id     uuid,
  code           text,
  name_ar        text,
  name_en        text,
  type           text,
  system_key     text,
  current_minor  bigint,
  previous_minor bigint,
  change_minor   bigint,
  change_pct     numeric
)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_has_prev boolean := p_prev_as_of is not null;
  v_cur_prior bigint;
  v_cur_year  bigint;
  v_prev_prior bigint;
  v_prev_year  bigint;
begin
  perform public._ledger_statement_gate(p_book);
  if p_as_of is null then
    raise exception 'الفترة تحتاج يوم بدايةٍ ويوم نهاية';
  end if;
  v_cur_prior := public._ledger_net_income(p_book, null, (date_trunc('year', p_as_of) - interval '1 day')::date);
  v_cur_year  := public._ledger_net_income(p_book, null, p_as_of) - v_cur_prior;
  if v_has_prev then
    v_prev_prior := public._ledger_net_income(p_book, null, (date_trunc('year', p_prev_as_of) - interval '1 day')::date);
    v_prev_year  := public._ledger_net_income(p_book, null, p_prev_as_of) - v_prev_prior;
  end if;

  return query
  with cur as (
    select * from public.ledger_balance_sheet(p_book, p_as_of)
  ), prev as (
    select * from public.ledger_balance_sheet(p_book, p_prev_as_of) where v_has_prev
  ), j as (
    select coalesce(c.account_id, q.account_id) as account_id,
           coalesce(c.code, q.code) as code, coalesce(c.name_ar, q.name_ar) as name_ar,
           coalesce(c.name_en, q.name_en) as name_en, coalesce(c.type, q.type) as type,
           coalesce(c.system_key, q.system_key) as system_key,
           coalesce(c.balance, 0)::bigint as cur_m,
           case when v_has_prev then coalesce(q.balance, 0)::bigint end as prev_m
      from cur c full join prev q on q.account_id = c.account_id
    union all
    select null::uuid, '3990', 'أرباح السنوات السابقة (لم تُقفل بقيد)', 'Profit of earlier years (not closed by an entry)',
           'equity', '_income_prior', v_cur_prior, v_prev_prior
    union all
    select null::uuid, '3991', 'ربح سنة القائمة حتى يومها', 'Profit of the statement''s year to its date',
           'equity', '_income_current', v_cur_year, v_prev_year
  )
  select j.account_id, j.code, j.name_ar, j.name_en, j.type, j.system_key,
         j.cur_m, j.prev_m,
         case when v_has_prev then j.cur_m - j.prev_m end,
         public._ledger_change_pct(j.cur_m, j.prev_m)
    from j
   order by j.type, j.code;
end $$;

-- ── التدفّقات النقديّة المقارنة ─────────────────────────────────────────────
--
-- السطور كما في `ledger_cash_flow`، ومعها سطران في القسم 'cash': نقد أوّل الفترة (`_opening`) وآخرها (`_closing`).

create function public.ledger_cash_flow_compare(
  p_book      uuid,
  p_from      date,
  p_to        date,
  p_prev_from date default null,
  p_prev_to   date default null
) returns table (
  section        text,
  account_id     uuid,
  code           text,
  name_ar        text,
  name_en        text,
  current_minor  bigint,
  previous_minor bigint,
  change_minor   bigint,
  change_pct     numeric
)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_has_prev boolean := p_prev_from is not null and p_prev_to is not null;
begin
  perform public._ledger_statement_gate(p_book);
  if p_from is null or p_to is null then
    raise exception 'الفترة تحتاج يوم بدايةٍ ويوم نهاية';
  end if;
  return query
  with cur as (
    select * from public.ledger_cash_flow(p_book, p_from, p_to)
  ), prev as (
    select * from public.ledger_cash_flow(p_book, p_prev_from, p_prev_to) where v_has_prev
  ), j as (
    select coalesce(c.section, q.section) as section, coalesce(c.account_id, q.account_id) as account_id,
           coalesce(c.code, q.code) as code, coalesce(c.name_ar, q.name_ar) as name_ar,
           coalesce(c.name_en, q.name_en) as name_en,
           coalesce(c.amount, 0)::bigint as cur_m,
           case when v_has_prev then coalesce(q.amount, 0)::bigint end as prev_m
      from cur c full join prev q on q.account_id = c.account_id and q.section = c.section
    union all
    select 'cash', null::uuid, '_opening', 'النقد أوّل الفترة', 'Cash at the start of the period',
           public._ledger_cash_at(p_book, p_from - 1),
           case when v_has_prev then public._ledger_cash_at(p_book, p_prev_from - 1) end
    union all
    select 'cash', null::uuid, '_closing', 'النقد آخر الفترة', 'Cash at the end of the period',
           public._ledger_cash_at(p_book, p_to),
           case when v_has_prev then public._ledger_cash_at(p_book, p_prev_to) end
  )
  select j.section, j.account_id, j.code, j.name_ar, j.name_en,
         j.cur_m, j.prev_m,
         case when v_has_prev then j.cur_m - j.prev_m end,
         public._ledger_change_pct(j.cur_m, j.prev_m)
    from j
   order by case j.section when 'operating' then 1 when 'investing' then 2 when 'financing' then 3 else 4 end, j.code;
end $$;

-- ── قائمة التغيّر في حقوق الملكيّة ───────────────────────────────────────────
--
-- الملكيّة هنا بربح ما لم يُقفل، كما في الميزانيّة: آخر الفترة = مجموع الملكيّة في ميزانيّة يومها الأخير، تماماً.
--   أوّل الفترة   = حسابات الملكيّة + صافي الدخل كلّه، حتى اليوم السابق لبدايتها
--   المساهمات     = حركة رأس المال ومساهمات الشريك فيها (٣١١٠ و٣١٢٠)
--   السحوبات      = حركة السحوبات فيها (٣١٣٠)، سالبة
--   الربح أو الخسارة = صافي دخل الفترة
--   غيرها         = حركة ما بقي من حسابات الملكيّة (الأرباح المحتجزة وغيرها)
--   آخر الفترة    = أوّلها + ما بينهما

create function public.ledger_equity_statement(p_book uuid, p_from date, p_to date)
returns table (
  ord     integer,
  line    text,
  name_ar text,
  name_en text,
  amount  bigint
)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_open    bigint;
  v_contrib bigint;
  v_draw    bigint;
  v_other   bigint;
  v_profit  bigint;
begin
  perform public._ledger_statement_gate(p_book);
  if p_from is null or p_to is null then
    raise exception 'الفترة تحتاج يوم بدايةٍ ويوم نهاية';
  end if;
  if p_from > p_to then
    raise exception 'بداية الفترة بعد نهايتها';
  end if;

  select coalesce(sum(b.balance), 0)::bigint into v_open
    from public.ledger_balance_sheet(p_book, p_from - 1) b where b.type = 'equity';
  v_open := v_open + public._ledger_net_income(p_book, null, p_from - 1);

  select coalesce(sum(m.amt) filter (where m.system_key in ('owner_capital', 'partner_contributions')), 0)::bigint,
         coalesce(sum(m.amt) filter (where m.system_key = 'owner_drawings'), 0)::bigint,
         coalesce(sum(m.amt) filter (where coalesce(m.system_key, '') not in ('owner_capital', 'partner_contributions', 'owner_drawings')), 0)::bigint
    into v_contrib, v_draw, v_other
    from (
      select a.system_key, case when l.side = 'C' then l.base_minor else -l.base_minor end as amt
        from public.journal_lines l
        join public.journal_entries e on e.id = l.entry_id
        join public.ledger_accounts a on a.id = l.account_id and a.book_id = l.book_id
       where l.book_id = p_book and a.type = 'equity' and a.code not like '9%'
         and e.entry_date between p_from and p_to
    ) m;
  v_profit := public._ledger_net_income(p_book, p_from, p_to);

  return query values
    (1, 'opening',       'الملكيّة أوّل الفترة',                 'Equity at the start of the period', v_open),
    (2, 'contributions', 'رأس مالٍ ومساهماتٌ أُضيفت',            'Capital and contributions added',   v_contrib),
    (3, 'drawings',      'سحوبات',                               'Drawings',                          v_draw),
    (4, 'profit',        'ربح الفترة أو خسارتها',                'Profit or loss for the period',     v_profit),
    (5, 'other',         'حركاتٌ أخرى في الملكيّة',              'Other movements in equity',         v_other),
    (6, 'closing',       'الملكيّة آخر الفترة',                  'Equity at the end of the period',
       v_open + v_contrib + v_draw + v_profit + v_other);
end $$;

-- ── أعمار الذمم ─────────────────────────────────────────────────────────────

create function public.ledger_ageing(p_book uuid, p_as_of date default null)
returns table (
  side         text,
  account_id   uuid,
  code         text,
  name_ar      text,
  name_en      text,
  bucket       text,
  items        integer,
  amount_minor bigint
)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_as_of date := coalesce(p_as_of, public.ledger_today());
begin
  perform public._ledger_statement_gate(p_book);
  return query
  with acc as (
    select a.id, a.code, a.name_ar, a.name_en, a.type,
           case when a.system_key in ('receivable_buyers', 'due_from_partner', 'due_from_farmer', 'fees_receivable')
                then 'receivable' else 'payable' end as side
      from public.ledger_accounts a
     where a.book_id = p_book
       and a.system_key in ('receivable_buyers', 'due_from_partner', 'due_from_farmer', 'fees_receivable',
                            'payables_suppliers', 'accrued_wages', 'due_to_partner', 'payables')
  ), live as (
    -- Entries that stood on the day: neither a reversal nor reversed by then.
    select e.id, e.entry_no, e.entry_date, e.source_type, e.source_id
      from public.journal_entries e
     where e.book_id = p_book and e.entry_date <= v_as_of and e.reversal_of is null
       and not exists (select 1 from public.journal_entries r where r.reversal_of = e.id and r.entry_date <= v_as_of)
  ), mv as (
    -- Each line in the account's own direction: + grows the debt, − pays it.
    select l.account_id, e.id as entry_id, e.entry_no, e.entry_date, l.line_no, e.source_type, e.source_id,
           (case when (acc.type = 'asset') = (l.side = 'D') then l.base_minor else -l.base_minor end)::bigint as amt
      from public.journal_lines l
      join live e on e.id = l.entry_id
      join acc on acc.id = l.account_id
     where l.book_id = p_book
  ), settle as (
    select m.account_id, m.source_id, sum(m.amt)::bigint as adj
      from mv m
     where m.source_type in ('season_entry_settle', 'season_entry_settle_fx')
     group by m.account_id, m.source_id
  ), items as (
    select m.*,
           row_number() over (partition by m.account_id, m.source_type, m.source_id order by m.entry_no, m.line_no) as rn
      from mv m
     where m.amt > 0 and coalesce(m.source_type, '') not in ('season_entry_settle', 'season_entry_settle_fx')
  ), items2 as (
    -- A season row's own settlement is taken from it first.
    select i.account_id, i.entry_date, i.entry_no, i.line_no,
           i.amt + case when i.source_type = 'season_entry' and i.rn = 1 then coalesce(s.adj, 0) else 0 end as open0,
           (i.source_type = 'season_entry' and i.rn = 1 and s.adj is not null) as took
      from items i
      left join settle s on s.account_id = i.account_id and s.source_id = i.source_id
  ), pool as (
    -- What is left to apply oldest-first: every decrease not tied to a row, settlements whose row is not open, and
    -- whatever a row's settlement paid beyond the row.
    select a.id as account_id,
           coalesce((select sum(m.amt) from mv m
                      where m.account_id = a.id and m.amt <= 0
                        and coalesce(m.source_type, '') not in ('season_entry_settle', 'season_entry_settle_fx')), 0)
         + coalesce((select sum(s.adj) from settle s
                      where s.account_id = a.id
                        and not exists (select 1 from items i where i.account_id = s.account_id and i.source_type = 'season_entry'
                                                                and i.source_id = s.source_id and i.rn = 1)), 0)
         + coalesce((select sum(least(x.open0, 0)) from items2 x where x.account_id = a.id), 0) as net
      from acc a
  ), fifo as (
    select x.account_id, x.entry_date, greatest(x.open0, 0) as open1,
           sum(greatest(x.open0, 0)) over (partition by x.account_id order by x.entry_date, x.entry_no, x.line_no) as cum
      from items2 x
  ), aged as (
    select f.account_id, f.entry_date,
           greatest(0, least(f.open1, f.cum - greatest(-p.net, 0)))::bigint as remaining
      from fifo f join pool p on p.account_id = f.account_id
    union all
    -- A settlement that grew a debt with no row to sit on (an exchange difference on a row since reversed): due today.
    select p.account_id, v_as_of, p.net::bigint from pool p where p.net > 0
  ), extra as (
    -- More paid than owed: an advance, shown as its own negative line.
    select p.account_id, -(greatest(-p.net, 0) - coalesce((select sum(f.open1) from fifo f where f.account_id = p.account_id), 0))::bigint as adv
      from pool p
     where greatest(-p.net, 0) > coalesce((select sum(f.open1) from fifo f where f.account_id = p.account_id), 0)
  ), outrows as (
    select ag.account_id,
           case when v_as_of - ag.entry_date <= 30 then '0_30'
                when v_as_of - ag.entry_date <= 60 then '31_60'
                when v_as_of - ag.entry_date <= 90 then '61_90'
                else '90_plus' end as bucket,
           ag.remaining
      from aged ag where ag.remaining > 0
    union all
    select x.account_id, 'advance', x.adv from extra x
  )
  select a.side, a.id, a.code, a.name_ar, a.name_en, r.bucket, count(*)::integer, sum(r.remaining)::bigint
    from outrows r join acc a on a.id = r.account_id
   group by a.side, a.id, a.code, a.name_ar, a.name_en, r.bucket
   order by a.side desc, a.code,
            case r.bucket when '0_30' then 1 when '31_60' then 2 when '61_90' then 3 when '90_plus' then 4 else 5 end;
end $$;

-- ── الميزانيّة التقديريّة مقابل الفعليّ لكلّ موسم ─────────────────────────────
--
-- الخطّة: ميزانيّة كلّ مرحلة (season_stages.budget، بالدولار). الفعليّ: ما قُيِّد في الدفتر على حسابات المصروف لذلك
-- الموسم، بالدولار يوم القيد، دون زوج الرسملة (٥٩٠٠) ولا نقل «تكلفة المباع» (٥٨٠٠) — فهما نقلٌ لا صرف. يُنسب إلى المرحلة
-- ما كُتب في دفتر الموسم باختيار مرحلةٍ منه؛ وما سواه سطرٌ وحده بلا مرحلة (`stage_id` فارغ)، لا يُوزَّع بالتخمين.

create function public.ledger_budget_vs_actual(p_book uuid, p_season uuid default null)
returns table (
  season_id      uuid,
  season_name    text,
  stage_id       uuid,
  stage_key      text,
  stage_order    integer,
  budget_minor   bigint,
  actual_minor   bigint,
  variance_minor bigint,
  used_pct       numeric
)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_owner uuid;
  v_kind  text;
begin
  perform public._ledger_statement_gate(p_book);
  select b.owner_id, b.kind into v_owner, v_kind from public.ledger_books b where b.id = p_book;
  if v_kind <> 'farm' then
    return;
  end if;
  return query
  with ss as (
    select s.id, s.name, s.planting_date, s.created_at
      from public.seasons s
     where s.owner_id = v_owner and (p_season is null or s.id = p_season)
  ), spent as (
    select l.season_id,
           case when st.id is not null and st.season_id = l.season_id then st.id end as stage_id,
           sum(case when l.side = 'D' then l.base_minor else -l.base_minor end)::bigint as amt
      from public.journal_lines l
      join public.journal_entries e on e.id = l.entry_id
      join public.ledger_accounts a on a.id = l.account_id and a.book_id = l.book_id
      left join public.journal_entries o on o.id = e.reversal_of
      left join public.ledger_entries le
             on le.id = case when e.reversal_of is null then e.source_id else o.source_id end
            and coalesce(o.source_type, e.source_type) = 'season_entry'
      left join public.season_stages st on st.id = le.stage_id
     where l.book_id = p_book and a.type = 'expense' and a.code not like '9%'
       and coalesce(a.system_key, '') not in ('costs_capitalised', 'cost_of_sales')
       and l.season_id in (select id from ss)
     group by 1, 2
  ), stages as (
    select ss.id as season_id, ss.name, st.id as stage_id, st.stage_key::text as stage_key, st.stage_order::integer as stage_order,
           round(coalesce(st.budget, 0) * 100)::bigint as budget_m,
           coalesce((select sp.amt from spent sp where sp.season_id = ss.id and sp.stage_id = st.id), 0)::bigint as actual_m,
           ss.planting_date, ss.created_at
      from ss join public.season_stages st on st.season_id = ss.id
    union all
    select ss.id, ss.name, null::uuid, null::text, 99, 0::bigint, sp.amt, ss.planting_date, ss.created_at
      from ss join spent sp on sp.season_id = ss.id and sp.stage_id is null
     where sp.amt <> 0
  )
  select x.season_id, x.name, x.stage_id, x.stage_key, x.stage_order, x.budget_m, x.actual_m,
         x.budget_m - x.actual_m,
         case when x.budget_m > 0 then round(x.actual_m * 100.0 / x.budget_m, 1) end
    from stages x
   order by x.planting_date desc, x.created_at desc, x.stage_order;
end $$;

-- ── ما تُكتب منه الإيضاحات ──────────────────────────────────────────────────

create function public.ledger_statement_facts(p_book uuid, p_from date, p_to date)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  b public.ledger_books;
  v jsonb;
begin
  perform public._ledger_statement_gate(p_book);
  if p_from is null or p_to is null then
    raise exception 'الفترة تحتاج يوم بدايةٍ ويوم نهاية';
  end if;
  select * into b from public.ledger_books x where x.id = p_book;

  select jsonb_build_object(
    'kind', b.kind,
    'owner_name', (select nullif(btrim(p.full_name), '') from public.profiles p where p.id = b.owner_id),
    'closed_through', b.closed_through,
    'base_currency', 'USD',
    'entries', (select count(*) from public.journal_entries e
                 where e.book_id = p_book and e.entry_date between p_from and p_to),
    'reversals', (select count(*) from public.journal_entries e
                   where e.book_id = p_book and e.entry_date between p_from and p_to and e.reversal_of is not null),
    'manual', (select count(*) from public.journal_entries e
                where e.book_id = p_book and e.entry_date between p_from and p_to and e.source_type = 'manual'),
    'first_entry', (select min(e.entry_date) from public.journal_entries e where e.book_id = p_book),
    'currencies', coalesce((
      select jsonb_agg(jsonb_build_object('currency', c.currency, 'lines', c.n, 'native_minor', c.native, 'base_minor', c.base)
                       order by c.currency)
        from (select l.currency, count(*) as n,
                     sum(l.amount_minor) filter (where l.side = 'D') as native,
                     sum(l.base_minor) filter (where l.side = 'D') as base
                from public.journal_lines l join public.journal_entries e on e.id = l.entry_id
               where l.book_id = p_book and e.entry_date between p_from and p_to
               group by l.currency) c), '[]'::jsonb),
    'fx', (select jsonb_build_object(
                    'entries', count(*),
                    'min_rate', min(e.fx_rate),
                    'max_rate', max(e.fx_rate),
                    'parallel', count(*) filter (where e.fx_source = 'parallel'),
                    'bank', count(*) filter (where e.fx_source = 'bank'),
                    'user', count(*) filter (where e.fx_source = 'user'))
             from public.journal_entries e
            where e.book_id = p_book and e.entry_date between p_from and p_to and e.fx_rate is not null
              and e.reversal_of is null),
    'fx_result', (select coalesce(sum(case when a.system_key = 'fx_gain' then i.amount else -i.amount end), 0)
                    from public.ledger_income_statement(p_book, p_from, p_to, null) i
                    join public.ledger_accounts a on a.id = i.account_id
                   where a.system_key in ('fx_gain', 'fx_loss')),
    'fixed_assets', (select jsonb_build_object(
                        'count', count(*),
                        'cost_minor', coalesce(sum(f.cost_minor), 0),
                        'salvage_minor', coalesce(sum(f.salvage_minor), 0),
                        'min_life', min(f.life_months),
                        'max_life', max(f.life_months))
                       from public.ledger_fixed_assets f
                      where f.book_id = p_book and f.acquired_on <= p_to
                        and (f.disposed_on is null or f.disposed_on > p_to)),
    'depreciation_minor', (select coalesce(sum(i.amount), 0) from public.ledger_income_statement(p_book, p_from, p_to, null) i
                            where i.system_key = 'depreciation'),
    'growing_crops_minor', (select coalesce(sum(x.balance), 0) from public.ledger_balance_sheet(p_book, p_to) x
                             where x.system_key = 'crops_in_progress'),
    'open_credit_rows', (select count(*) from public.ledger_entries le
                           join public.seasons s on s.id = le.season_id
                          where b.kind = 'farm' and s.owner_id = b.owner_id and le.paid_from = 'credit'
                            and le.entry_date <= p_to
                            and public._farm_settlement_current(le.id) is null)
  ) into v;
  return v;
end $$;

-- ── الصلاحيّات: للمسجَّل وحده، والفحص في كلّ دالّة يحدّد الدفتر ──────────────

revoke all on function
  public._ledger_statement_gate(uuid),
  public._ledger_change_pct(bigint, bigint),
  public._ledger_month_end(date),
  public._ledger_shift_back(date, interval),
  public._ledger_net_income(uuid, date, date, uuid),
  public._ledger_cash_at(uuid, date)
  from public, anon, authenticated, service_role;

revoke all on function
  public.ledger_compare_period(uuid, text, date, date, uuid),
  public.ledger_income_compare(uuid, date, date, date, date, uuid, uuid),
  public.ledger_balance_compare(uuid, date, date),
  public.ledger_cash_flow_compare(uuid, date, date, date, date),
  public.ledger_equity_statement(uuid, date, date),
  public.ledger_ageing(uuid, date),
  public.ledger_budget_vs_actual(uuid, uuid),
  public.ledger_statement_facts(uuid, date, date)
  from public, anon, service_role;
grant execute on function
  public.ledger_compare_period(uuid, text, date, date, uuid),
  public.ledger_income_compare(uuid, date, date, date, date, uuid, uuid),
  public.ledger_balance_compare(uuid, date, date),
  public.ledger_cash_flow_compare(uuid, date, date, date, date),
  public.ledger_equity_statement(uuid, date, date),
  public.ledger_ageing(uuid, date),
  public.ledger_budget_vs_actual(uuid, uuid),
  public.ledger_statement_facts(uuid, date, date)
  to authenticated;

comment on function public.ledger_ageing(uuid, date) is
  'أعمار الذمم المدينة والدائنة يوم p_as_of من الدفتر نفسه: سداد قيد الموسم يُطرح من بنده، وما سواه من الأقدم. مجموعها = رصيد الحساب.';
comment on function public.ledger_equity_statement(uuid, date, date) is
  'قائمة التغيّر في حقوق الملكيّة بربح ما لم يُقفل؛ سطر closing = مجموع الملكيّة في ميزانيّة p_to.';
