-- ═══════════════════════════════════════════════════════════════════════════
-- إشراف المنصّة على الحركة الماليّة (البند ١٩١)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- المالك، 24 أكتوبر 2026: «يمكن للمنصّة حساب المال الداخل والخارج ومراقبة الحركة الماليّة كالبنك المركزيّ
-- لبقيّة البنوك، هي لا تستطيع الكتابة على الدفاتر الأخرى ولا في الأموال التي لا تخصّها… ابحث عن طريقة
-- مناسبة وتربط حسابات الدفاتر بحسابات المنصّة».
--
-- للمنصّة قبّعتان لا تختلطان:
--   - **طرفٌ** له دفتره (رسومه ومصروفاته): تقرأ وتكتب فيه وحدها.
--   - **مشرِفة** على دفاتر الناس: تقرأ بقدرٍ وبقواعد، ولا تكتب حرفاً. الكتابة في دفتر غير دفترها مستحيلة في
--     المحرّك (`ledger_post` لا يقبل إلا صاحب الدفتر)، وكلُّ ما في هذا الملف قراءةٌ أو سجلٌّ في دفترها هي.
--
-- ثلاثة مستويات اطّلاع، على نهج الإشراف على أنظمة الدفع (BIS: المشرِف يطلب البيانات ويستقبلها بمستوياتٍ
-- بحسب حاجته، ويفصل عمله عن التشغيل، ويفحص ميدانيّاً بسببٍ):
--
--   ١) **إحصاءات مجمَّعة بلا أسماء** (`oversight_flows` و`oversight_currency_mix`): لكلّ شهرٍ وبندٍ ماليّ.
--      يُحجب كلُّ رقمٍ يساهم فيه أقلّ من ٣ دفاتر (الحدّ الأدنى عند البنك المركزيّ الأوروبيّ ومكاتب الإحصاء)
--      أو يزيد أكبرُ المساهمين فيه على ٨٥٪ منه (قاعدة الهيمنة عند البنك المركزيّ الأوروبيّ)، فلا يُعاد
--      تعريف أحدٍ من مجموع. الحدّان في جدول الإعدادات، لا في الشيفرة.
--   ٢) **القيود المتقابلة التي تتوسّطها المنصّة** (المرحلة ٣: تمويل المستثمر، رسوم المنصّة، قسمة الحصاد)
--      بأسماء طرفيها، لأنّها طرفٌ أو وسيطٌ فيها. لا يُبنى هنا.
--   ٣) **فحصٌ لدفترٍ بعينه** (`ledger_inspect_open`): بسببٍ مكتوب (١٠ أحرفٍ فأكثر) ومدّةٍ محدودة (٢٤ ساعة،
--      وحدّها الأقصى ٧٢)، يُخطَر به صاحب الدفتر في لحظته ويرى سجلّه، ويفتح للمدير القراءة في ذلك الدفتر وحده
--      بالدوالّ نفسها التي يقرأ بها صاحبه (سياسة الصفوف تتّسع له ما دام الفحص قائماً). ينتهي بانتهاء مدّته
--      أو بإغلاقه، ولا يُحذف سجلّه.
--
-- والربط بحسابات المنصّة (`oversight_snapshot`): المجاميع غير المحجوبة تُسجَّل شهريّاً في حساباتٍ إحصائيّة
-- في دفتر المنصّة (٩٢xx، خارج الميزانيّة، مقابلها ٩١٢٠)، فيظهر في ميزان المنصّة وكشف حساباتها ما يجري في
-- الشبكة. وما تغيّر بعد تسجيل الشهر (قيدٌ متأخّر) يُسجَّل فرقُه بقيدٍ جديد، فيطابق رصيدُ الحساب الإحصائيّ
-- آخر حسابٍ دائماً.

-- ── الإعدادات ───────────────────────────────────────────────────────────────

create table public.oversight_settings (
  id                   boolean primary key default true check (id),
  -- أقلّ عددٍ من الدفاتر يساهم في رقمٍ مجمَّع حتى يُعرض.
  min_books            integer not null default 3 check (min_books >= 3),
  -- أكبر حصّةٍ لدفترٍ واحد في رقمٍ مجمَّع حتى يُعرض.
  max_top_share        numeric not null default 0.85 check (max_top_share > 0 and max_top_share <= 0.95),
  inspection_hours     integer not null default 24 check (inspection_hours between 1 and 72),
  inspection_max_hours integer not null default 72 check (inspection_max_hours between 1 and 168)
);

insert into public.oversight_settings default values;

-- ── ما يُحسب «داخلاً» و«خارجاً» ─────────────────────────────────────────────
--
-- كلُّ بندٍ مجموعُ حركةِ حساباتٍ نظاميّة (system_key) في نوعٍ من الدفاتر: `debit` تعني مدين − دائن، و`credit`
-- دائن − مدين. تُضاف بنودٌ بصفٍّ هنا لا بتعديل دالّة.

create table public.oversight_metrics (
  metric     text not null check (metric ~ '^[a-z_]{2,30}$'),
  book_kind  text not null check (book_kind in ('farm', 'investor')),
  system_key text not null,
  direction  text not null check (direction in ('debit', 'credit')),
  label_ar   text not null,
  label_en   text not null,
  primary key (metric, book_kind, system_key)
);

insert into public.oversight_metrics (metric, book_kind, system_key, direction, label_ar, label_en) values
  ('farm_sales',           'farm',     'sales_crops',          'credit', 'مبيعات المزارع', 'Farm sales'),
  ('farm_sales',           'farm',     'sales_livestock',      'credit', 'مبيعات المزارع', 'Farm sales'),
  ('farm_costs',           'farm',     'cost_seeds',           'debit',  'تكاليف الإنتاج', 'Production costs'),
  ('farm_costs',           'farm',     'cost_fertiliser',      'debit',  'تكاليف الإنتاج', 'Production costs'),
  ('farm_costs',           'farm',     'cost_pesticide',       'debit',  'تكاليف الإنتاج', 'Production costs'),
  ('farm_costs',           'farm',     'cost_labour',          'debit',  'تكاليف الإنتاج', 'Production costs'),
  ('farm_costs',           'farm',     'cost_irrigation',      'debit',  'تكاليف الإنتاج', 'Production costs'),
  ('farm_costs',           'farm',     'cost_transport',       'debit',  'تكاليف الإنتاج', 'Production costs'),
  ('farm_costs',           'farm',     'cost_land_rent',       'debit',  'تكاليف الإنتاج', 'Production costs'),
  ('farm_costs',           'farm',     'cost_repairs',         'debit',  'تكاليف الإنتاج', 'Production costs'),
  ('farm_costs',           'farm',     'cost_insurance',       'debit',  'تكاليف الإنتاج', 'Production costs'),
  ('farm_costs',           'farm',     'cost_other',           'debit',  'تكاليف الإنتاج', 'Production costs'),
  ('farm_cash_net',        'farm',     'cash_on_hand',         'debit',  'صافي حركة النقد في المزارع', 'Farm net cash movement'),
  ('farm_cash_net',        'farm',     'bank',                 'debit',  'صافي حركة النقد في المزارع', 'Farm net cash movement'),
  ('farm_cash_net',        'farm',     'wallet',               'debit',  'صافي حركة النقد في المزارع', 'Farm net cash movement'),
  ('farm_capital_in',      'farm',     'owner_capital',        'credit', 'رأس مال داخل المزارع', 'Capital into farms'),
  ('farm_capital_in',      'farm',     'partner_contributions','credit', 'رأس مال داخل المزارع', 'Capital into farms'),
  ('farm_drawings',        'farm',     'owner_drawings',       'debit',  'سحوبات أصحاب المزارع', 'Farm owner drawings'),
  ('investor_deployed',    'investor', 'deployed_season',      'debit',  'توظيف المستثمرين في المواسم', 'Investor deployments'),
  ('investor_deployed',    'investor', 'prepaid_rent',         'debit',  'توظيف المستثمرين في المواسم', 'Investor deployments'),
  ('investor_returns',     'investor', 'share_of_harvest',     'credit', 'عوائد المستثمرين من الحصاد', 'Investor harvest returns'),
  ('investor_capital_in',  'investor', 'owner_capital',        'credit', 'رأس مال المستثمرين', 'Investor capital'),
  ('fees_paid',            'farm',     'platform_fees',        'debit',  'رسوم دُفعت للمنصّة', 'Fees paid to the platform'),
  ('fees_paid',            'investor', 'platform_fees',        'debit',  'رسوم دُفعت للمنصّة', 'Fees paid to the platform'),
  ('fees_paid',            'investor', 'inspection_fees',      'debit',  'رسوم دُفعت للمنصّة', 'Fees paid to the platform');

-- ── الفحص: سجلٌّ لا يُمحى ───────────────────────────────────────────────────

create table public.ledger_inspections (
  id         uuid primary key default gen_random_uuid(),
  book_id    uuid not null references public.ledger_books(id) on delete restrict,
  opened_by  uuid not null,
  reason     text not null check (length(btrim(reason)) between 10 and 500),
  opened_at  timestamptz not null default now(),
  expires_at timestamptz not null,
  closed_at  timestamptz,
  constraint ledger_inspections_span check (expires_at > opened_at)
);

create index ledger_inspections_book on public.ledger_inspections (book_id, opened_at desc);

comment on table public.ledger_inspections is
  'فحصُ المدير لدفترٍ بعينه: بسبب ومدّة، يُخطَر به صاحبه. لا يُحذف ولا يُعدَّل إلا بإغلاقه.';

create function public.ledger_inspections_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'DELETE' or tg_op = 'TRUNCATE' then
    raise exception 'سجلّ الفحوص لا يُحذف';
  end if;
  if (new.id, new.book_id, new.opened_by, new.reason, new.opened_at, new.expires_at)
     is distinct from (old.id, old.book_id, old.opened_by, old.reason, old.opened_at, old.expires_at) then
    raise exception 'لا يتغيّر من الفحص إلا إغلاقه';
  end if;
  if old.closed_at is not null and new.closed_at is distinct from old.closed_at then
    raise exception 'الفحص المغلق لا يُعاد';
  end if;
  return new;
end $$;

create trigger ledger_inspections_guard
  before update or delete on public.ledger_inspections
  for each row execute function public.ledger_inspections_guard();
create trigger ledger_inspections_no_truncate
  before truncate on public.ledger_inspections
  for each statement execute function public.ledger_inspections_guard();

-- Helpers the row-level policies call. They read the tables as their owner, so a policy on one ledger
-- table that has to look at another does not recurse into that one's own policy.
create function public._ledger_inspecting(p_book uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.ledger_inspections i
     where i.book_id = p_book and i.opened_by = auth.uid()
       and i.closed_at is null and i.expires_at > now())
$$;

create function public._ledger_book_owned(p_book uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.ledger_books b where b.id = p_book and b.owner_id = auth.uid())
$$;

-- ── صلاحيّات الجداول وسياساتها ──────────────────────────────────────────────

alter table public.oversight_settings enable row level security;
alter table public.oversight_metrics enable row level security;
alter table public.ledger_inspections enable row level security;

revoke all on table public.oversight_settings, public.oversight_metrics, public.ledger_inspections
  from anon, authenticated, service_role;

grant select on public.oversight_settings, public.oversight_metrics to authenticated, service_role;
-- The inspected person sees why, when and for how long; which administrator it was is for the administrators.
grant select (id, book_id, reason, opened_at, expires_at, closed_at) on public.ledger_inspections to authenticated;
grant select on public.ledger_inspections to service_role;

create policy oversight_settings_admin_read on public.oversight_settings
  for select to authenticated using ((select is_admin()));
create policy oversight_metrics_admin_read on public.oversight_metrics
  for select to authenticated using ((select is_admin()));
create policy ledger_inspections_read on public.ledger_inspections
  for select to authenticated
  using ((select is_admin()) or public._ledger_book_owned(book_id));

-- The administrator who opened an inspection reads that book while it stands; nobody else gains anything.
alter policy ledger_books_read on public.ledger_books
  using (owner_id = (select auth.uid())
         or (kind = 'platform' and (select is_admin()))
         or public._ledger_inspecting(id));

revoke execute on function public.ledger_inspections_guard() from public, anon, authenticated, service_role;
revoke execute on function public._ledger_inspecting(uuid), public._ledger_book_owned(uuid) from public, anon;
grant execute on function public._ledger_inspecting(uuid), public._ledger_book_owned(uuid) to authenticated, service_role;

-- ── إشعار الفحص ─────────────────────────────────────────────────────────────

alter table public.notifications drop constraint if exists notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check
  check (kind = any (array[
    'land_submitted','land_verified','land_rejected',
    'opportunity_submitted','opportunity_approved','opportunity_rejected',
    'lead_received','feedback_received','feedback_replied',
    'nafir_joined','faza_pledged','shura_answered',
    'judiyya_update','canal_update',
    'locust_near','animal_disease',
    'stage_due',
    'investor_interest','investor_decision',
    'agreement_update','agreement_signed',
    'inspection_update','inspection_report',
    'message',
    'price_alert',
    'ledger_inspection'
  ]));

-- ── المستوى ١: الإحصاءات المجمَّعة ──────────────────────────────────────────

create function public.oversight_flows(p_from date, p_to date)
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
begin
  if auth.uid() is not null and not is_admin() then
    raise exception 'للإدارة وحدها';
  end if;
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 1100 then
    raise exception 'مدىً غير صالح (حتى ثلاث سنوات)';
  end if;
  select * into s from public.oversight_settings;

  return query
  with cells as (
    select date_trunc('month', e.entry_date)::date as period,
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
     where e.entry_date between p_from and p_to
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

-- حصّة كلّ عملةٍ من حجم الحركة في الشهر (بالدولار المعادل)، مقرَّبةً إلى عددٍ صحيح، وبالقواعد نفسها.
create function public.oversight_currency_mix(p_from date, p_to date)
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
begin
  if auth.uid() is not null and not is_admin() then
    raise exception 'للإدارة وحدها';
  end if;
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 1100 then
    raise exception 'مدىً غير صالح (حتى ثلاث سنوات)';
  end if;
  select * into s from public.oversight_settings;

  return query
  with cells as (
    select date_trunc('month', e.entry_date)::date as period, l.currency, l.book_id,
           sum(l.base_minor)::numeric as vol
      from public.journal_lines l
      join public.journal_entries e on e.id = l.entry_id
      join public.ledger_books b on b.id = l.book_id and b.kind in ('farm', 'investor')
      join public.ledger_accounts a on a.id = l.account_id and a.book_id = l.book_id
      join public.oversight_metrics m on m.book_kind = b.kind and m.system_key = a.system_key
     where e.entry_date between p_from and p_to
     group by 1, 2, 3
  ), per_book as (
    select c.period, c.book_id, sum(c.vol) as vol from cells c group by 1, 2
  ), month_ok as (
    select pb.period,
           (count(*) >= s.min_books
            and (sum(pb.vol) = 0 or max(pb.vol) / sum(pb.vol) <= s.max_top_share)) as shown,
           sum(pb.vol) as total
      from per_book pb
     group by pb.period
  ), per_cur as (
    select c.period, c.currency, sum(c.vol) as vol from cells c group by 1, 2
  )
  select pc.period, pc.currency,
         case when mo.shown and mo.total > 0 then round(100 * pc.vol / mo.total)::integer end,
         not mo.shown
    from per_cur pc
    join month_ok mo on mo.period = pc.period
   order by pc.period, pc.currency;
end $$;

-- ── المستوى ٣: الفحص ────────────────────────────────────────────────────────

create function public.ledger_inspect_open(p_book uuid, p_reason text, p_hours integer default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  s     public.oversight_settings;
  b     public.ledger_books;
  v_id  uuid;
  v_hrs integer;
begin
  if auth.uid() is null or not is_admin() then
    raise exception 'للإدارة وحدها';
  end if;
  select * into b from public.ledger_books where id = p_book;
  if not found then
    raise exception 'الدفتر غير موجود';
  end if;
  if b.kind = 'platform' then
    raise exception 'دفتر المنصّة مفتوحٌ للإدارة أصلاً';
  end if;
  if b.owner_id = auth.uid() then
    raise exception 'هذا دفترك أنت';
  end if;
  if length(btrim(coalesce(p_reason, ''))) not between 10 and 500 then
    raise exception 'اكتب سبب الفحص (١٠ أحرفٍ فأكثر): يراه صاحب الدفتر';
  end if;
  select * into s from public.oversight_settings;
  v_hrs := coalesce(p_hours, s.inspection_hours);
  if v_hrs < 1 or v_hrs > s.inspection_max_hours then
    raise exception 'مدّة الفحص من ساعة إلى % ساعة', s.inspection_max_hours;
  end if;

  -- An inspection already standing for this administrator on this book is the one asked for.
  select i.id into v_id from public.ledger_inspections i
   where i.book_id = p_book and i.opened_by = auth.uid() and i.closed_at is null and i.expires_at > now();
  if found then
    return v_id;
  end if;

  insert into public.ledger_inspections (book_id, opened_by, reason, expires_at)
  values (p_book, auth.uid(), btrim(p_reason), now() + make_interval(hours => v_hrs))
  returning id into v_id;

  perform public.notify_user(
    b.owner_id, 'ledger_inspection', 'فتحت الإدارة فحصاً على دفترك',
    format('فُتح فحصٌ على دفترك لمدّة %s ساعة، ويقتصر على القراءة (لا تكتب الإدارة في دفترك). السبب: %s',
           v_hrs, btrim(p_reason)),
    '/notifications');
  return v_id;
end $$;

create function public.ledger_inspect_close(p_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  i public.ledger_inspections;
  o uuid;
begin
  if auth.uid() is null or not is_admin() then
    raise exception 'للإدارة وحدها';
  end if;
  update public.ledger_inspections set closed_at = now()
   where id = p_id and closed_at is null
  returning * into i;
  if not found then
    return false;
  end if;
  select owner_id into o from public.ledger_books where id = i.book_id;
  perform public.notify_user(o, 'ledger_inspection', 'أُغلق الفحص على دفترك',
    'أنهت الإدارة الفحص الذي فُتح على دفترك، ولم يعد لها اطّلاعٌ عليه.', '/notifications');
  return true;
end $$;

-- للمدير: كلّ الفحوص، بمن فتحها ونوع الدفتر، بلا اسم صاحبه.
create function public.ledger_inspections_list()
returns table (
  id         uuid,
  book_id    uuid,
  book_kind  text,
  opened_by  uuid,
  reason     text,
  opened_at  timestamptz,
  expires_at timestamptz,
  closed_at  timestamptz,
  active     boolean
)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
begin
  if auth.uid() is null or not is_admin() then
    raise exception 'للإدارة وحدها';
  end if;
  return query
  select i.id, i.book_id, b.kind, i.opened_by, i.reason, i.opened_at, i.expires_at, i.closed_at,
         (i.closed_at is null and i.expires_at > now())
    from public.ledger_inspections i
    join public.ledger_books b on b.id = i.book_id
   order by i.opened_at desc;
end $$;

-- ── الربط بدفتر المنصّة ─────────────────────────────────────────────────────
--
-- حساباتٌ إحصائيّة جديدة في قالب دفتر المنصّة، ودالّةٌ تضيف الناقص من القالب إلى دفترٍ مفتوح فعلاً
-- (فالقالب يتّسع بعد فتح الدفاتر، ولا يُنسخ إلا عند الفتح).

insert into public.ledger_chart_templates (kind, code, parent_code, name_ar, name_en, type, postable, system_key) values
  ('platform', '9210', '9', 'مبيعات المزارع عبر الشبكة (إحصائي)',        'Network farm sales (statistical)',        'equity', true, 'oversight_farm_sales'),
  ('platform', '9220', '9', 'تكاليف إنتاج المزارع عبر الشبكة (إحصائي)',  'Network production costs (statistical)',  'equity', true, 'oversight_farm_costs'),
  ('platform', '9230', '9', 'صافي حركة النقد في المزارع (إحصائي)',       'Farm net cash movement (statistical)',    'equity', true, 'oversight_farm_cash_net'),
  ('platform', '9240', '9', 'رأس مال داخل المزارع (إحصائي)',             'Capital into farms (statistical)',        'equity', true, 'oversight_farm_capital_in'),
  ('platform', '9250', '9', 'سحوبات أصحاب المزارع (إحصائي)',             'Farm owner drawings (statistical)',       'equity', true, 'oversight_farm_drawings'),
  ('platform', '9260', '9', 'توظيف المستثمرين في المواسم (إحصائي)',      'Investor deployments (statistical)',      'equity', true, 'oversight_investor_deployed'),
  ('platform', '9270', '9', 'عوائد المستثمرين من الحصاد (إحصائي)',       'Investor harvest returns (statistical)',  'equity', true, 'oversight_investor_returns'),
  ('platform', '9280', '9', 'رأس مال المستثمرين (إحصائي)',               'Investor capital (statistical)',          'equity', true, 'oversight_investor_capital_in'),
  ('platform', '9290', '9', 'رسوم دُفعت للمنصّة كما تراها الدفاتر (إحصائي)', 'Fees paid, as the books see them (statistical)', 'equity', true, 'oversight_fees_paid');

create function public._ledger_sync_chart(p_book uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_kind text;
  n integer;
begin
  select kind into v_kind from public.ledger_books where id = p_book;
  if v_kind is null then
    raise exception 'الدفتر غير موجود';
  end if;
  insert into public.ledger_accounts (book_id, code, parent_code, name_ar, name_en, type, postable, system_key, currency, provider)
  select p_book, t.code, t.parent_code, t.name_ar, t.name_en, t.type, t.postable, t.system_key, t.currency, t.provider
    from public.ledger_chart_templates t
   where t.kind = v_kind
     and not exists (select 1 from public.ledger_accounts a where a.book_id = p_book and a.code = t.code)
   order by length(t.code), t.code;
  get diagnostics n = row_count;
  return n;
end $$;

-- Posts, for each month asked (default: last month and this one), the metrics the rules let be shown,
-- into the platform's statistical accounts. What was posted before is netted off: a late entry shows up as a
-- small adjusting entry, and the account always equals the latest count. Returns how many entries it posted.
create function public.oversight_snapshot(p_month date default null)
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
                   then array[(date_trunc('month', v_today) - interval '1 month')::date, date_trunc('month', v_today)::date]
                   else array[date_trunc('month', p_month)::date] end;

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
      -- The month's own last day, unless that is still ahead or the book is closed past it.
      v_date := greatest(least((v_month + interval '1 month - 1 day')::date, v_today), coalesce(v_closed, date '2000-01-01') + 1);

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

-- ── من ينادي ماذا ───────────────────────────────────────────────────────────

revoke execute on function public._ledger_sync_chart(uuid) from public, anon, authenticated, service_role;

revoke execute on function
  public.oversight_flows(date, date),
  public.oversight_currency_mix(date, date),
  public.ledger_inspect_open(uuid, text, integer),
  public.ledger_inspect_close(uuid),
  public.ledger_inspections_list(),
  public.oversight_snapshot(date)
  from public, anon;

-- Administrators (the functions check) call the reads and the inspection; the monthly job also uses the key.
grant execute on function
  public.oversight_flows(date, date),
  public.oversight_currency_mix(date, date),
  public.ledger_inspect_open(uuid, text, integer),
  public.ledger_inspect_close(uuid),
  public.ledger_inspections_list(),
  public.oversight_snapshot(date)
  to authenticated;
grant execute on function
  public.oversight_flows(date, date),
  public.oversight_currency_mix(date, date),
  public.oversight_snapshot(date)
  to service_role;
revoke execute on function
  public.ledger_inspect_open(uuid, text, integer),
  public.ledger_inspect_close(uuid),
  public.ledger_inspections_list()
  from service_role;
