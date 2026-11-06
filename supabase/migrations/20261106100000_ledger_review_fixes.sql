-- ═══════════════════════════════════════════════════════════════════════════
-- إصلاحات مراجعتَي 6 نوفمبر (البند ٢٠٩؛ المالك: «أصلحها وطبّق وانشر»)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- الهجرات 20261106060000 و070000 و080000 مطبَّقةٌ على الإنتاج فلا تُمسّ؛ وهذه تستبدل ما وجد المراجعان فيه خطأً، كلُّ
-- دالّةٍ بنصّها وحرّاسها كما كانت ومعها الإصلاح وحده (يقوله تعليقها). ما يُستبدل يبقى بتوقيعه، فصلاحيّاته كما هي.
--
--   ١) الإقفال مرّتين: كان `ledger_close_income` يقرأ الأرصدة حتى p_to فلا يرى إقفال موسمٍ مؤرَّخاً بعده، فإقفال الموسم
--      (بتاريخ اليوم) ثمّ الفترة حتى أمس يُقفل دخل الموسم مرّتين. صار يقرأ الأرصدة كلّها حتى p_to، بالإقفالات السابقة
--      (فما أُقفل صفر)، ويترك سطور كلّ موسمٍ له إقفالٌ مؤرَّخٌ بعد p_to (أقفله ذلك القيد؛ وتعود سطوره حين تبلغ فترةٌ تاريخه،
--      ومعها قيد إقفاله فتتصافى). ولا يُقفل موسمٌ بتاريخٍ في فترةٍ أُقفل دخلها.
--   ٢) قائمة التغيّر في حقوق الملكيّة تستثني قيد الإقفال في الحركة كما تستثنيه في أوّل الفترة والربح والميزانيّة.
--   ٣) الميزانيّة التقديريّة مقابل الفعليّ والإيضاحات تستثني قيد الإقفال.
--   ٤) `ledger_entry_submit` يبحث عن المفتاح في الطريقين (اليوميّة والمسوّدات) قبل أن يختار، فتبديل «راجع كلّ قيد» بين
--      محاولةٍ وإعادتها لا يكتب القيد مرّتين.
--   ٥) ما يراه المعتمِد: المسوّدة تحفظ حين تُفحص ما حسبته دالّة النشر نفسها (السعر ومصدره ومعادل كلّ سطرٍ بعملة الدفتر)،
--      ويُرفض على سطور المُعِدّ وسمُ موسمٍ أو أرضٍ أو قطيعٍ أو مشروعٍ ليس لصاحب الدفتر. وفي دفتر المنصّة لا يعتمد المسوّدةَ
--      من أعدّها.
--   ٦) دعوة المحاسب: كلُّ محاولةٍ تُعدّ في حدّ اليوم (قبل البحث)، والجواب واحدٌ وُجد الحساب أم لم يوجد (في الردّ والقائمة
--      والسجلّ)، والجوّال يُطابَق بهويّة الدخول نفسها (العنوان الداخليّ الذي يُطوى فيه الرقم، src/lib/phoneIdentity.ts)
--      لا بـ profiles.phone الذي يغيّره صاحبه.
--   ٧) فهرسان على مسار المستند (تقرؤهما سياسة الدلو في كلّ قراءة)، ودالّة قراءةٍ واحدة لقيود الآجل المفتوحة في
--      الرئيسيّة (كانت تُعدّ في أوّل خمسة مواسم وحدها).
-- ═══════════════════════════════════════════════════════════════════════════

-- ── ١. الإقفال لا يتكرّر ─────────────────────────────────────────────────────

-- The period's closing lines: every revenue and expense balance up to p_to, closings included (so what an earlier closing
-- closed is zero), per season tag, turned over, and the net to retained earnings. A season whose own closing is dated after
-- p_to is left out whole: that entry closed its lines, and the first period that reaches its date sees both and nets them.
create function public._ledger_period_closing_lines(p_book uuid, p_to date)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with skip as (
    select c.season_id from public.ledger_closings c
     where c.book_id = p_book and c.scope = 'season' and c.period_to > p_to
  ), net as (
    select a.code, l.season_id,
           sum(case when l.side = 'D' then l.base_minor else -l.base_minor end)::bigint as dr
      from public.journal_lines l
      join public.journal_entries e on e.id = l.entry_id
      join public.ledger_accounts a on a.id = l.account_id and a.book_id = l.book_id
     where l.book_id = p_book
       and a.type in ('revenue', 'expense')
       and a.code not like '9%'
       and e.entry_date <= p_to
       and (l.season_id is null or l.season_id not in (select season_id from skip))
     group by a.code, l.season_id
    having sum(case when l.side = 'D' then l.base_minor else -l.base_minor end) <> 0
  ), cur as (
    select base_currency as c from public.ledger_books where id = p_book
  ), tot as (
    select coalesce(sum(dr), 0)::bigint as t, count(*) as n from net
  )
  select case when (select n from tot) = 0 then '[]'::jsonb else
    (select jsonb_agg(jsonb_build_object('account', code, 'side', case when dr > 0 then 'C' else 'D' end,
                                         'currency', (select c from cur), 'minor', abs(dr), 'season', season_id,
                                         'memo', 'إقفال')
                      order by code, season_id nulls first) from net)
    || case when (select t from tot) = 0 then '[]'::jsonb
            else jsonb_build_array(jsonb_build_object('key', 'retained_earnings',
                                                      'side', case when (select t from tot) > 0 then 'D' else 'C' end,
                                                      'currency', (select c from cur), 'minor', abs((select t from tot)),
                                                      'memo', 'صافي الفترة'))
       end
  end
$$;

-- ledger_close_income (20261106070000) as it was, with the lines from _ledger_period_closing_lines.
create or replace function public.ledger_close_income(p_book uuid, p_to date, p_via text default 'web')
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  b       public.ledger_books;
  v_last  date;
  v_from  date;
  v_lines jsonb;
  v_id    uuid := gen_random_uuid();
  v_entry uuid;
begin
  b := public._ledger_book_for_owner(p_book);
  select * into b from public.ledger_books where id = p_book for update;
  if p_to is null or p_to >= public.ledger_today() then
    raise exception 'لا يُقفل إلا يومٌ مضى';
  end if;
  select max(period_to) into v_last from public.ledger_closings where book_id = p_book and scope = 'period';
  if v_last is not null and p_to <= v_last then
    raise exception 'أُقفل دخل الدفتر حتى % من قبل؛ يُقفل ما بعده فقط', v_last;
  end if;
  if b.closed_through is not null and p_to <= b.closed_through then
    raise exception 'الفترة حتى % مقفلة أصلاً؛ يُكتب قيد الإقفال بآخر يومٍ بعدها', b.closed_through;
  end if;
  v_from := v_last + 1;
  v_lines := public._ledger_period_closing_lines(p_book, p_to);
  if jsonb_array_length(v_lines) = 0 then
    raise exception 'لا إيراد ولا مصروف في هذه الفترة يُقفل';
  end if;

  perform set_config('sudagri.ledger_via', case when p_via = 'app' then 'app' else 'web' end, true);
  v_entry := public._ledger_post_src(
    p_book, p_to,
    'قيد إقفال: الإيرادات والمصروفات إلى الأرباح المحتجزة، ' || coalesce('من ' || v_from::text || ' ', '') || 'حتى ' || p_to::text,
    v_lines, 'closing:period:' || p_to::text, null, 'ledger_closing', v_id, null, auth.uid(), null);
  insert into public.ledger_closings (id, book_id, scope, period_from, period_to, entry_id, created_by)
  values (v_id, p_book, 'period', v_from, p_to, v_entry, auth.uid());
  update public.ledger_books set closed_through = p_to where id = p_book;
  perform set_config('sudagri.ledger_via', '', true);
  return v_entry;
end $$;

-- ledger_close_season (20261106070000) as it was, with one refusal more: a season is not closed on a day inside a period
-- whose income was already closed (that closing read the season's lines; a second would count them again).
create or replace function public.ledger_close_season(p_book uuid, p_season uuid, p_date date default null, p_via text default 'web')
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  b       public.ledger_books;
  v_date  date := coalesce(p_date, public.ledger_today());
  v_last  date;
  v_lines jsonb;
  v_id    uuid := gen_random_uuid();
  v_entry uuid;
  v_name  text;
begin
  b := public._ledger_book_for_owner(p_book);
  perform 1 from public.ledger_books where id = p_book for update;
  if p_season is null then
    raise exception 'اختر الموسم';
  end if;
  if exists (select 1 from public.ledger_closings where book_id = p_book and scope = 'season' and season_id = p_season) then
    raise exception 'أُقفل دخل هذا الموسم في الدفتر من قبل';
  end if;
  if not exists (select 1 from public.journal_lines where book_id = p_book and season_id = p_season) then
    raise exception 'لا قيود لهذا الموسم في الدفتر';
  end if;
  if exists (select 1 from public.seasons s where s.id = p_season and s.owner_id = b.owner_id and s.status <> 'completed') then
    raise exception 'أقفل الموسم أوّلاً من صفحته، ثمّ أقفل دخله هنا';
  end if;
  if v_date > public.ledger_today() then
    raise exception 'لا قيد بتاريخٍ في المستقبل';
  end if;
  select max(period_to) into v_last from public.ledger_closings where book_id = p_book and scope = 'period';
  if v_last is not null and v_date <= v_last then
    raise exception 'أُقفل دخل الدفتر حتى %؛ يُقفل دخل الموسم بتاريخٍ بعده', v_last;
  end if;
  v_lines := public._ledger_closing_lines(p_book, null, v_date, p_season);
  if jsonb_array_length(v_lines) = 0 then
    raise exception 'لا إيراد ولا مصروف لهذا الموسم يُقفل';
  end if;
  select name into v_name from public.seasons where id = p_season;

  perform set_config('sudagri.ledger_via', case when p_via = 'app' then 'app' else 'web' end, true);
  v_entry := public._ledger_post_src(
    p_book, v_date,
    left('قيد إقفال موسم: ' || coalesce(v_name, p_season::text) || ' — الإيرادات والمصروفات إلى الأرباح المحتجزة', 500),
    v_lines, 'closing:season:' || p_season::text, null, 'ledger_closing', v_id, null, auth.uid(), null);
  insert into public.ledger_closings (id, book_id, scope, season_id, period_to, entry_id, created_by)
  values (v_id, p_book, 'season', p_season, v_date, v_entry, auth.uid());
  perform set_config('sudagri.ledger_via', '', true);
  return v_entry;
end $$;

-- ── ٢. و٣. القوائم لا ترى قيد الإقفال ───────────────────────────────────────

-- ledger_equity_statement (20261106080000) as it was; the movement lines leave the closing entry out, as the opening, the
-- profit and the balance sheet do — so the closing line equals the balance sheet's equity in a period with a closing.
create or replace function public.ledger_equity_statement(p_book uuid, p_from date, p_to date)
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
         and e.source_type is distinct from 'ledger_closing'
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

-- ledger_budget_vs_actual (20261106080000) as it was; a closing entry turns the costs over, it spends nothing.
create or replace function public.ledger_budget_vs_actual(p_book uuid, p_season uuid default null)
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
       and e.source_type is distinct from 'ledger_closing'
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

-- ledger_statement_facts (20261106080000) as it was; the entries, the currencies and the rates are the period's own
-- entries, without the closing entry that turns them over.
create or replace function public.ledger_statement_facts(p_book uuid, p_from date, p_to date)
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
                 where e.book_id = p_book and e.entry_date between p_from and p_to
                   and e.source_type is distinct from 'ledger_closing'),
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
                 and e.source_type is distinct from 'ledger_closing'
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
              and e.reversal_of is null and e.source_type is distinct from 'ledger_closing'),
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

-- ── ٤. و٥. القيد اليدويّ: المفتاح في الطريقين، وما يراه المعتمِد ───────────────

-- What the posting function worked out when the draft was checked: the rate and its source, and every line in the book's
-- currency (a rounding line included). The owner approves what he saw.
alter table public.ledger_drafts add column checked jsonb;

comment on column public.ledger_drafts.checked is
  'ما حسبته دالّة النشر حين فُحصت المسوّدة: {rate, fx_source, base_currency, lines:[{line, account, side, currency, minor, base, season, land, herd, project, memo}]}. لا يتغيّر.';

-- ledger_drafts_guard (20261106070000) as it was, with the new column among what never changes.
create or replace function public.ledger_drafts_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'DELETE' or tg_op = 'TRUNCATE' then
    raise exception 'القيود المُعَدّة لا تُحذف؛ تُسحب أو تُردّ';
  end if;
  if (new.id, new.book_id, new.client_key, new.prepared_by, new.preparer_ref, new.via, new.kind, new.template_key,
      new.entry_date, new.memo, new.lines, new.rate, new.document_path, new.created_at, new.checked)
     is distinct from
     (old.id, old.book_id, old.client_key, old.prepared_by, old.preparer_ref, old.via, old.kind, old.template_key,
      old.entry_date, old.memo, old.lines, old.rate, old.document_path, old.created_at, old.checked) then
    raise exception 'لا يتغيّر من القيد المُعَدّ إلا البتّ فيه';
  end if;
  if old.status <> 'pending' then
    raise exception 'بُتّ في هذا القيد من قبل';
  end if;
  return new;
end $$;

-- _ledger_dry_run (20261106070000), returning what it computed before the rollback threw it away.
create function public._ledger_dry_run_checked(p_book uuid, p_date date, p_memo text, p_lines jsonb, p_rate numeric)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_entry uuid;
  v_out   jsonb;
begin
  begin
    v_entry := public._ledger_post_src(p_book, p_date, p_memo, p_lines, 'dryrun:' || gen_random_uuid()::text, p_rate,
                                       'manual', null, null, auth.uid(), null);
    select jsonb_build_object(
             'rate', e.fx_rate, 'fx_source', e.fx_source, 'base_currency', b.base_currency,
             'lines', (select jsonb_agg(jsonb_build_object(
                                'line', l.line_no, 'account', a.code, 'side', l.side, 'currency', l.currency,
                                'minor', l.amount_minor, 'base', l.base_minor, 'season', l.season_id, 'land', l.land_id,
                                'herd', l.herd_id, 'project', l.project_id, 'memo', l.line_memo)
                              order by l.line_no)
                         from public.journal_lines l
                         join public.ledger_accounts a on a.id = l.account_id
                        where l.entry_id = v_entry))
      into v_out
      from public.journal_entries e
      join public.ledger_books b on b.id = e.book_id
     where e.id = v_entry;
    raise exception using errcode = 'SA205', message = 'dry run';
  exception when sqlstate 'SA205' then
    null;
  end;
  return v_out;
end $$;

-- A preparer tags lines only with what is the book owner's: his seasons, lands and herds, a project he invested in or put
-- up. Otherwise a figure would be counted against another person's season in the owner's reports, unseen.
create function public._ledger_tags_owned(p_owner uuid, p_lines jsonb)
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_item jsonb;
  v_i    bigint;
  v_id   uuid;
begin
  for v_item, v_i in select x.value, x.ordinality from jsonb_array_elements(p_lines) with ordinality x loop
    v_id := public._ledger_opt_uuid(v_item ->> 'season');
    if v_id is not null and not exists (select 1 from public.seasons where id = v_id and owner_id = p_owner) then
      raise exception 'السطر % موسومٌ بموسمٍ أو أرضٍ أو قطيعٍ أو مشروعٍ ليس لصاحب الدفتر', v_i;
    end if;
    v_id := public._ledger_opt_uuid(v_item ->> 'land');
    if v_id is not null and not exists (select 1 from public.lands where id = v_id and owner_id = p_owner) then
      raise exception 'السطر % موسومٌ بموسمٍ أو أرضٍ أو قطيعٍ أو مشروعٍ ليس لصاحب الدفتر', v_i;
    end if;
    v_id := public._ledger_opt_uuid(v_item ->> 'herd');
    if v_id is not null and not exists (select 1 from public.herds where id = v_id and owner_id = p_owner) then
      raise exception 'السطر % موسومٌ بموسمٍ أو أرضٍ أو قطيعٍ أو مشروعٍ ليس لصاحب الدفتر', v_i;
    end if;
    v_id := public._ledger_opt_uuid(v_item ->> 'project');
    if v_id is not null
       and not exists (select 1 from public.investments where project_id = v_id and investor_id = p_owner)
       and not exists (select 1 from public.projects where id = v_id and created_by = p_owner) then
      raise exception 'السطر % موسومٌ بموسمٍ أو أرضٍ أو قطيعٍ أو مشروعٍ ليس لصاحب الدفتر', v_i;
    end if;
  end loop;
end $$;

-- ledger_entry_submit (20261106070000) as it was, with three changes:
--   • one attempt of a key at a time, and the key looked up in both places before a way is chosen: a draft with it is
--     that draft, an entry posted with it is that entry (or a refusal if the content differs) — whatever «review every
--     entry» says now;
--   • a draft keeps what the posting function computed when it was checked (`checked`);
--   • a preparer's line tags must be the owner's.
create or replace function public.ledger_entry_submit(
  p_book     uuid,
  p_date     date,
  p_memo     text,
  p_lines    jsonb,
  p_key      text,
  p_rate     numeric default null,
  p_kind     text default 'manual',
  p_template text default null,
  p_document text default null,
  p_via      text default 'web'
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_book    public.ledger_books;
  v_owner   boolean;
  v_prep    public.ledger_preparers;
  v_tpl     public.ledger_entry_templates;
  v_kind    text;
  v_via     text := case when p_via = 'app' then 'app' else 'web' end;
  v_memo    text := btrim(coalesce(p_memo, ''));
  v_doc     text;
  v_review  boolean;
  v_entry   uuid;
  v_posted  uuid;
  v_draft   public.ledger_drafts;
  v_checked jsonb;
  v_id      uuid;
  v_name    text;
begin
  if auth.uid() is null then
    raise exception 'سجّل الدخول أولاً';
  end if;
  select * into v_book from public.ledger_books where id = p_book;
  if not found then
    raise exception 'ليس هذا دفترك';
  end if;
  v_owner := v_book.owner_id = auth.uid() or (v_book.kind = 'platform' and is_admin());
  if not v_owner then
    v_prep := public._ledger_preparer_active(p_book);
    if v_prep.id is null then
      raise exception 'ليس هذا دفترك';
    end if;
    if v_prep.role = 'agent' then
      v_via := 'agent';
    end if;
  end if;

  if p_key is null or length(p_key) not between 8 and 120 then
    raise exception 'مفتاح القيد غير صالح';
  end if;
  if length(v_memo) not between 1 and 500 then
    raise exception 'اكتب بيان القيد (حتى ٥٠٠ حرف)';
  end if;
  if p_template is not null and p_template <> '' then
    select * into v_tpl from public.ledger_entry_templates where key = p_template and v_book.kind = any (book_kinds);
    if not found then
      raise exception 'قيدٌ جاهز غير معروف لهذا الدفتر';
    end if;
    v_kind := case v_tpl.grp when 'adjusting' then 'adjusting' else 'template' end;
  else
    if coalesce(p_kind, 'manual') not in ('manual', 'adjusting') then
      raise exception 'نوع القيد إمّا يدويّ أو تسوية أو من قيدٍ جاهز';
    end if;
    v_kind := coalesce(p_kind, 'manual');
  end if;
  v_doc := public._ledger_document_ok(p_document);

  -- One attempt of this key at a time: a retry that arrives while the first is still running waits for its answer.
  perform pg_advisory_xact_lock(hashtextextended('ledger_entry_submit:' || p_book::text || ':' || p_key, 0));

  -- The same key again is the same draft (a reply that was lost); the same key with other content is refused.
  select * into v_draft from public.ledger_drafts where book_id = p_book and client_key = p_key;
  if found then
    if v_draft.prepared_by = auth.uid() and v_draft.entry_date is not distinct from p_date and v_draft.memo = v_memo
       and v_draft.lines = p_lines and v_draft.rate is not distinct from round(p_rate, 6)
       and v_draft.document_path is not distinct from v_doc and v_draft.template_key is not distinct from v_tpl.key then
      return jsonb_build_object('status', case when v_draft.status = 'posted' then 'posted' else v_draft.status end,
                                'draft_id', v_draft.id, 'entry_id', v_draft.entry_id);
    end if;
    raise exception 'مفتاح القيد هذا استُعمل لقيدٍ مختلف';
  end if;

  select always_review into v_review from public.ledger_book_settings where book_id = p_book;
  select id into v_posted from public.journal_entries where book_id = p_book and idempotency_key = 'manual:' || p_key;

  -- Posted before with this key (or the owner's entry with no review asked): the posting function gives back the same
  -- entry for the same content, and refuses another.
  if v_posted is not null or (v_owner and not coalesce(v_review, false)) then
    if not v_owner then
      raise exception 'مفتاح القيد هذا استُعمل لقيدٍ مختلف';
    end if;
    v_entry := public._ledger_post_manual(p_book, p_date, v_memo, p_lines, 'manual:' || p_key, p_rate, v_kind,
                                          v_tpl.key, v_doc, v_via, auth.uid(), null);
    return jsonb_build_object('status', 'posted', 'entry_id', v_entry);
  end if;

  if (select count(*) from public.ledger_drafts where book_id = p_book and status = 'pending') >= 200 then
    raise exception 'في هذا الدفتر ٢٠٠ قيدٍ ينتظر المراجعة؛ يُبتّ فيها أوّلاً';
  end if;

  v_checked := public._ledger_dry_run_checked(p_book, p_date, v_memo, p_lines, p_rate);
  if not v_owner then
    perform public._ledger_tags_owned(v_book.owner_id, p_lines);
  end if;

  perform set_config('sudagri.ledger_via', v_via, true);
  insert into public.ledger_drafts
    (book_id, client_key, prepared_by, preparer_ref, via, kind, template_key, entry_date, memo, lines, rate, document_path, checked)
  values
    (p_book, p_key, auth.uid(), v_prep.id, v_via, v_kind, v_tpl.key, p_date, v_memo, p_lines, round(p_rate, 6), v_doc, v_checked)
  returning id into v_id;
  perform set_config('sudagri.ledger_via', '', true);

  if not v_owner then
    v_name := public._ledger_actor_name(auth.uid());
    perform public.notify_user(
      v_book.owner_id, 'ledger_review', 'قيدٌ مُعَدّ ينتظر اعتمادك',
      coalesce(nullif(v_name, ''), 'مُعِدّ دفترك') || ' أعدّ قيداً بتاريخ ' || p_date::text || ': ' || left(v_memo, 120)
        || '. لا يُرحَّل في دفترك حتى تعتمده، ولك أن تردّه بسبب.',
      '/books/review');
  end if;
  return jsonb_build_object('status', 'pending', 'draft_id', v_id);
end $$;

-- ledger_draft_approve (20261106070000) as it was, with one refusal more: in the platform's book (any administrator is
-- its owner) the administrator who prepared a draft does not approve it.
create or replace function public.ledger_draft_approve(p_draft uuid, p_via text default 'web')
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  d       public.ledger_drafts;
  b       public.ledger_books;
  v_entry uuid;
  v_via   text := case when p_via = 'app' then 'app' else 'web' end;
begin
  if auth.uid() is null then
    raise exception 'سجّل الدخول أولاً';
  end if;
  select * into d from public.ledger_drafts where id = p_draft for update;
  if not found then
    raise exception 'ليس هذا دفترك';
  end if;
  b := public._ledger_book_for_owner(d.book_id);
  if d.status <> 'pending' then
    raise exception 'بُتّ في هذا القيد من قبل';
  end if;
  if b.kind = 'platform' and d.prepared_by = auth.uid() then
    raise exception 'في دفتر المنصّة يعتمد القيدَ مديرٌ غيرُ من أعدّه';
  end if;

  v_entry := public._ledger_post_manual(d.book_id, d.entry_date, d.memo, d.lines, 'draft:' || d.id::text, d.rate,
                                        d.kind, d.template_key, d.document_path, d.via, d.prepared_by, d.id);
  perform set_config('sudagri.ledger_via', v_via, true);
  update public.ledger_drafts
     set status = 'posted', decided_by = auth.uid(), decided_at = now(), entry_id = v_entry
   where id = d.id;
  perform set_config('sudagri.ledger_via', '', true);

  if d.prepared_by <> auth.uid() then
    perform public.notify_user(d.prepared_by, 'ledger_review', 'اعتُمد القيد الذي أعددته',
      'رُحِّل في الدفتر: ' || left(d.memo, 120), '/books/review');
  end if;
  return v_entry;
end $$;

-- ── ٦. دعوة المحاسب ─────────────────────────────────────────────────────────

-- Every invitation the owner sent, whether it found an account or not: the day's limit counts these, and the owner's list
-- shows one that found nobody exactly as one that found somebody who has not answered. `preparer_ref` is the invitation
-- it made (the same id), null when it made none. Read only through the definer functions below.
create table public.ledger_preparer_invites (
  id           uuid primary key default gen_random_uuid(),
  book_id      uuid not null references public.ledger_books(id) on delete restrict,
  invited_by   uuid not null,
  contact_tail text not null check (length(contact_tail) between 1 and 80),
  preparer_ref uuid references public.ledger_preparers(id) on delete restrict,
  at           timestamptz not null default now(),
  ended_at     timestamptz
);

create index ledger_preparer_invites_by on public.ledger_preparer_invites (invited_by, at desc);
create index ledger_preparer_invites_book on public.ledger_preparer_invites (book_id) where preparer_ref is null;

alter table public.ledger_preparer_invites enable row level security;
revoke all on table public.ledger_preparer_invites from public, anon, authenticated, service_role;

create function public.ledger_preparer_invites_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'DELETE' or tg_op = 'TRUNCATE' then
    raise exception 'سجلّ الدعوات لا يُحذف';
  end if;
  if (new.id, new.book_id, new.invited_by, new.contact_tail, new.at)
     is distinct from (old.id, old.book_id, old.invited_by, old.contact_tail, old.at)
     or (old.preparer_ref is not null and new.preparer_ref is distinct from old.preparer_ref)
     or (old.ended_at is not null and new.ended_at is distinct from old.ended_at) then
    raise exception 'لا يتغيّر من الدعوة إلا ما صنعته وإنهاؤها';
  end if;
  return new;
end $$;

create trigger ledger_preparer_invites_guard before update or delete on public.ledger_preparer_invites
  for each row execute function public.ledger_preparer_invites_guard();
create trigger ledger_preparer_invites_no_truncate before truncate on public.ledger_preparer_invites
  for each statement execute function public.ledger_preparer_invites_guard();

-- The owner reads a preparer's row once that person answered (or once his agent was added); before that only through
-- ledger_preparers_list, which shows an invitation that found nobody the same way.
drop policy ledger_preparers_read on public.ledger_preparers;
create policy ledger_preparers_read on public.ledger_preparers
  for select to authenticated
  using (preparer_id = (select auth.uid())
         or (public._ledger_book_readable(book_id) and (role = 'agent' or answered_at is not null)));

-- _ledger_audit_preparer (20261106070000) as it was; who an invitation reached is written once he answered, so the owner's
-- log reads the same for an invitation that found an account and one that did not.
create or replace function public._ledger_audit_preparer()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_after jsonb := jsonb_build_object('preparer_ref', new.id,
                                      'preparer_id', case when new.role = 'agent' or new.answered_at is not null then new.preparer_id end,
                                      'role', new.role, 'mandate_id', new.mandate_id, 'contact_tail', new.contact_tail,
                                      'status', new.status);
begin
  if tg_op = 'INSERT' then
    perform public._ledger_audit(new.book_id, case when new.status = 'active' then 'preparer_added' else 'preparer_invited' end,
                                 null, null, null, v_after);
  elsif new.status is distinct from old.status then
    perform public._ledger_audit(new.book_id,
      case new.status when 'active' then 'preparer_accepted' when 'declined' then 'preparer_declined' else 'preparer_ended' end,
      null, null, jsonb_build_object('status', old.status), v_after);
  end if;
  return null;
end $$;

-- ledger_preparer_invite (20261106070000), with the same refusals for what the owner typed and three changes:
--   • the day's ten are counted first, from every attempt, whatever it found (the attempt is kept even when it finds
--     nobody, so it counts);
--   • the answer is the same either way: the attempt's id, with the same row in the list and the log;
--   • a number is matched with the address a phone account signs in with (p<digits>@phone.invalid) or the account's
--     own phone, never with profiles.phone, which its holder types himself.
create or replace function public.ledger_preparer_invite(p_book uuid, p_contact text, p_via text default 'web')
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  b       public.ledger_books;
  v_raw   text := lower(btrim(coalesce(p_contact, '')));
  v_key   text;
  v_tail  text;
  v_users uuid[];
  v_id    uuid := gen_random_uuid();
  v_name  text;
begin
  b := public._ledger_book_for_owner(p_book);
  if b.owner_id is null then
    raise exception 'دفتر المنصّة لا يُدعى إليه أحد';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('ledger_preparer_invite:' || auth.uid()::text, 0));
  if (select count(*) from public.ledger_preparer_invites where invited_by = auth.uid() and at > now() - interval '1 day') >= 10 then
    raise exception 'عشر دعواتٍ في اليوم حدُّ الدفتر. أكمل غداً.';
  end if;

  if position('@' in v_raw) > 1 then
    if v_raw !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or length(v_raw) > 254 then
      raise exception 'اكتب رقم جوّال المحاسب كاملاً أو بريده';
    end if;
    v_tail := left(v_raw, 2) || '…@' || split_part(v_raw, '@', 2);
  else
    v_key := public.phone_key(v_raw);
    if v_key is null or length(v_key) < 9 then
      raise exception 'اكتب رقم جوّال المحاسب كاملاً أو بريده';
    end if;
    v_tail := right(v_key, 4);
  end if;

  if (select count(*) from public.ledger_preparers where book_id = p_book and status in ('invited', 'active'))
     + (select count(*) from public.ledger_preparer_invites where book_id = p_book and preparer_ref is null and ended_at is null) >= 5 then
    raise exception 'لهذا الدفتر خمسة مُعِدّين؛ أنهِ إذن أحدهم أوّلاً.';
  end if;

  perform set_config('sudagri.ledger_via', case when p_via = 'app' then 'app' else 'web' end, true);
  insert into public.ledger_preparer_invites (id, book_id, invited_by, contact_tail) values (v_id, p_book, auth.uid(), v_tail);

  if v_key is null then
    select array_agg(distinct u.id) into v_users from auth.users u
     where lower(u.email) = v_raw and u.id <> auth.uid()
       and not exists (select 1 from public.closed_accounts c where c.user_id = u.id);
  else
    select array_agg(distinct u.id) into v_users from auth.users u
     where (lower(u.email) ~ ('^p[0-9]{0,6}' || v_key || '@phone\.invalid$') or public.phone_key(u.phone) = v_key)
       and u.id <> auth.uid()
       and not exists (select 1 from public.closed_accounts c where c.user_id = u.id);
  end if;

  if v_users is not null and cardinality(v_users) = 1
     and not exists (select 1 from public.ledger_preparers
                      where book_id = p_book and preparer_id = v_users[1] and status in ('invited', 'active')) then
    insert into public.ledger_preparers (id, book_id, preparer_id, role, contact_tail, status, invited_by)
    values (v_id, p_book, v_users[1], 'accountant', v_tail, 'invited', auth.uid());
    update public.ledger_preparer_invites set preparer_ref = v_id where id = v_id;
    v_name := public._ledger_actor_name(auth.uid());
    perform public.notify_user(v_users[1], 'ledger_review', 'دعوةٌ لإعداد قيود دفتر',
      coalesce(nullif(v_name, ''), 'صاحب دفتر') || ' يدعوك لتُعِدّ قيود دفتره. لا يُرحَّل شيءٌ ممّا تُعِدّه حتى يعتمده هو، '
        || 'ولا ترى من دفتره إلا شجرة حساباته وما أعددت. اقبل أو اعتذر من صفحة المراجعة.',
      '/books/review');
  else
    -- No account, more than one, or one already invited: the log reads as for an invitation sent.
    perform public._ledger_audit(p_book, 'preparer_invited', null, null, null,
      jsonb_build_object('preparer_ref', v_id, 'preparer_id', null, 'role', 'accountant', 'mandate_id', null,
                         'contact_tail', v_tail, 'status', 'invited'));
  end if;
  perform set_config('sudagri.ledger_via', '', true);
  return v_id;
end $$;

-- ledger_preparers_list (20261106070000) as it was, and the invitations that found nobody, as invitations not answered.
create or replace function public.ledger_preparers_list(p_book uuid)
returns table (
  id           uuid,
  role         text,
  status       text,
  full_name    text,
  company_name text,
  contact_tail text,
  invited_at   timestamptz,
  answered_at  timestamptz,
  ended_at     timestamptz,
  standing     boolean
)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
begin
  perform public._ledger_book_for_owner(p_book);
  return query
  select x.* from (
    select p.id, p.role, p.status,
           case when p.answered_at is not null and p.status in ('active', 'ended') then public._ledger_actor_name(p.preparer_id) end,
           (select c.name from public.agent_mandates m join public.partner_companies c on c.id = m.company_id where m.id = p.mandate_id),
           p.contact_tail, p.invited_at, p.answered_at, p.ended_at,
           p.status = 'active' and (p.role = 'accountant'
             or exists (select 1 from public.agent_mandates m join public.partner_companies c on c.id = m.company_id
                         where m.id = p.mandate_id and m.status = 'active' and c.verified_at is not null and c.active
                           and c.owner_id = p.preparer_id))
      from public.ledger_preparers p
     where p.book_id = p_book
    union all
    select i.id, 'accountant'::text, case when i.ended_at is null then 'invited' else 'ended' end,
           null::text, null::text, i.contact_tail, i.at, null::timestamptz, i.ended_at, false
      from public.ledger_preparer_invites i
     where i.book_id = p_book and i.preparer_ref is null
  ) x
  order by x.invited_at desc;
end $$;

-- ledger_preparer_end (20261106070000) as it was; the owner ends an invitation that found nobody the same way.
create or replace function public.ledger_preparer_end(p_id uuid, p_via text default 'web')
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  p     public.ledger_preparers;
  i     public.ledger_preparer_invites;
  v_own uuid;
begin
  if auth.uid() is null then
    raise exception 'سجّل الدخول أولاً';
  end if;
  select * into p from public.ledger_preparers where id = p_id for update;
  if not found then
    select * into i from public.ledger_preparer_invites where id = p_id and preparer_ref is null for update;
    if not found or not exists (select 1 from public.ledger_books where id = i.book_id and owner_id = auth.uid()) then
      raise exception 'ليس هذا إذناً تملكه';
    end if;
    if i.ended_at is not null then
      raise exception 'انتهى هذا الإذن من قبل';
    end if;
    perform set_config('sudagri.ledger_via', case when p_via = 'app' then 'app' else 'web' end, true);
    update public.ledger_preparer_invites set ended_at = now() where id = p_id;
    perform public._ledger_audit(i.book_id, 'preparer_ended', null, null, jsonb_build_object('status', 'invited'),
      jsonb_build_object('preparer_ref', i.id, 'preparer_id', null, 'role', 'accountant', 'mandate_id', null,
                         'contact_tail', i.contact_tail, 'status', 'ended'));
    perform set_config('sudagri.ledger_via', '', true);
    return;
  end if;
  select owner_id into v_own from public.ledger_books where id = p.book_id;
  if auth.uid() is distinct from v_own and auth.uid() <> p.preparer_id then
    raise exception 'ليس هذا إذناً تملكه';
  end if;
  if p.status not in ('invited', 'active') then
    raise exception 'انتهى هذا الإذن من قبل';
  end if;
  perform set_config('sudagri.ledger_via',
    case when p.role = 'agent' and auth.uid() = p.preparer_id then 'agent' when p_via = 'app' then 'app' else 'web' end, true);
  update public.ledger_preparers set status = 'ended', ended_at = now(), ended_by = auth.uid() where id = p_id;
  perform set_config('sudagri.ledger_via', '', true);
  perform public.notify_user(case when auth.uid() = v_own then p.preparer_id else v_own end, 'ledger_review',
    'انتهى إذن إعداد القيود', 'لا تُعَدّ قيودٌ لهذا الدفتر بهذا الإذن بعد اليوم.', '/books/review');
end $$;

-- ── ٧. الفهارس، وقيود الآجل المفتوحة في الرئيسيّة ───────────────────────────

-- The storage policy asks of every read of the evidence bucket whether an entry or a draft carries the path.
create index ledger_entry_meta_document on public.ledger_entry_meta (document_path) where document_path is not null;
create index ledger_drafts_document on public.ledger_drafts (document_path) where document_path is not null;

-- The caller's running seasons with rows kept on credit and not yet settled (farm_credit_status's own rule), all of them
-- in one read: the home page counted only its first five seasons.
create function public.farm_open_credit_by_season()
returns table (season_id uuid, open_rows integer)
language sql
stable
security definer
set search_path = public
as $$
  select le.season_id, count(*)::integer
    from public.ledger_entries le
    join public.seasons s on s.id = le.season_id
   where s.owner_id = auth.uid()
     and s.status = 'active'
     and le.paid_from = 'credit'
     and public._farm_mirror_current(le.id) is not null
     and public._farm_settlement_current(le.id) is null
   group by le.season_id
$$;

-- ── من ينادي ماذا ────────────────────────────────────────────────────────────

revoke execute on function
  public._ledger_period_closing_lines(uuid, date),
  public._ledger_dry_run_checked(uuid, date, text, jsonb, numeric),
  public._ledger_tags_owned(uuid, jsonb),
  public.ledger_preparer_invites_guard()
  from public, anon, authenticated, service_role;

revoke execute on function public.farm_open_credit_by_season() from public, anon, service_role;
grant execute on function public.farm_open_credit_by_season() to authenticated;
