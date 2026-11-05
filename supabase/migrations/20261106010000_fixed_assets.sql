-- الأصول الثابتة وإهلاكها الشهريّ (البند ١٩٠، تعميق الدفاتر؛ المالك، 5 نوفمبر 2026: «أبدأ فيها كلّها… بلا توقّف»).
--
-- دليل حسابات المزرعة فيه منذ البداية «آلات ومعدّات» (1510) و«تحسينات أرض» (1520) و«مجمّع الإهلاك» (1530)
-- و«إهلاك» (6130)، ولا شيء يكتب فيها إلا قيدٌ يدويّ. وهنا سجلُّ الأصل وقيدا عمره:
--
--   • ledger_asset_add — يسجّل الأصل ويقيّد شراءه في القيد نفسه: مدين الآلات أو التحسينات، دائن ما دُفع منه
--     (نقد، بنك، محفظة) أو رأس المال لأصلٍ كان عند المزارع قبل الدفتر. شيءٌ واحد: إن رفض الدفتر القيد (فترةٌ مقفلة)
--     لم يُسجَّل الأصل.
--   • القسط الثابت، شهراً بعد شهر من الشهر التالي للشراء: (التكلفة − الخردة) ÷ العمر بالأشهر، والشهر الأخير يأخذ
--     الباقي فيبلغ المجمّع (التكلفة − الخردة) تماماً. كلُّ شهرٍ قيدٌ بمفتاحه («dep:<الأصل>:<الشهر>»)، فالتكرار لا يقيّد
--     مرّتين، ويُقيَّد بآخر يومٍ في شهره، ولا يُقيَّد شهرٌ لم ينتهِ ولا شهرٌ في فترةٍ مقفلة.
--   • ledger_asset_depreciate يقيّد ما استحقّ لصاحب الدفتر بزرّ، وledger_depreciate_all يقيّده للجميع في مسك
--     الدفاتر اليوميّ.
--
-- لا يُكتب الجدول مباشرةً: الدوالّ وحدها، والقراءة لصاحب الدفتر وللمدير.

create table public.ledger_fixed_assets (
  id             uuid primary key default gen_random_uuid(),
  book_id        uuid not null references public.ledger_books(id) on delete restrict,
  name           text not null check (length(btrim(name)) between 2 and 120),
  account_key    text not null check (account_key in ('machinery', 'land_improvements')),
  acquired_on    date not null check (acquired_on >= date '2000-01-01'),
  cost_minor     bigint not null check (cost_minor between 100 and 100000000000),
  salvage_minor  bigint not null default 0 check (salvage_minor >= 0),
  life_months    integer not null check (life_months between 6 and 600),
  paid_from      text not null check (paid_from in ('cash_on_hand', 'bank', 'wallet', 'owner_capital')),
  purchase_entry uuid,
  created_by     uuid,
  created_at     timestamptz not null default now(),
  constraint ledger_fixed_assets_salvage check (salvage_minor < cost_minor)
);
create index ledger_fixed_assets_book on public.ledger_fixed_assets (book_id);

alter table public.ledger_fixed_assets enable row level security;
create policy ledger_fixed_assets_read on public.ledger_fixed_assets for select to authenticated
  using (exists (select 1 from public.ledger_books b where b.id = book_id and b.owner_id = auth.uid()) or is_admin());
revoke all on public.ledger_fixed_assets from public, anon, authenticated;
grant select on public.ledger_fixed_assets to authenticated;
grant all on public.ledger_fixed_assets to service_role;

-- ── التسجيل والشراء ───────────────────────────────────────────────────────────
create function public.ledger_asset_add(
  p_book      uuid,
  p_name      text,
  p_account   text,
  p_date      date,
  p_cost      numeric,
  p_salvage   numeric,
  p_life      integer,
  p_paid_from text
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id      uuid := gen_random_uuid();
  v_cost    bigint;
  v_salvage bigint;
  v_entry   uuid;
begin
  if auth.uid() is null then
    raise exception 'سجّل الدخول أولاً';
  end if;
  if not exists (select 1 from ledger_books b where b.id = p_book and b.owner_id = auth.uid() and b.kind = 'farm') then
    raise exception 'ليس هذا دفتر مزرعتك';
  end if;
  if p_account is null or p_account not in ('machinery', 'land_improvements') then
    raise exception 'نوع الأصل: آلات ومعدّات، أو تحسينات أرض';
  end if;
  if p_paid_from is null or p_paid_from not in ('cash_on_hand', 'bank', 'wallet', 'owner_capital') then
    raise exception 'من أين دُفع ثمن الأصل؟ نقداً أو من البنك أو المحفظة، أو كان عندك قبل الدفتر';
  end if;
  if p_date is null or p_date > ledger_today() then
    raise exception 'تاريخ الشراء لا يكون بعد اليوم';
  end if;
  if p_cost is null or p_cost <= 0 or p_cost > 1000000000 then
    raise exception 'اكتب ثمن الأصل بالدولار';
  end if;
  if p_life is null or p_life not between 6 and 600 then
    raise exception 'عمر الأصل بين ٦ أشهر و٥٠ سنة';
  end if;
  v_cost := round(p_cost * 100);
  v_salvage := round(coalesce(p_salvage, 0) * 100);
  if v_salvage < 0 or v_salvage >= v_cost then
    raise exception 'قيمة الخردة أقلّ من الثمن، ولا تكون سالبة';
  end if;

  insert into ledger_fixed_assets (id, book_id, name, account_key, acquired_on, cost_minor, salvage_minor, life_months, paid_from, created_by)
  values (v_id, p_book, btrim(p_name), p_account, p_date, v_cost, v_salvage, p_life, p_paid_from, auth.uid());

  v_entry := _ledger_post(
    p_book, p_date, left('أصلٌ ثابت: ' || btrim(p_name), 500),
    jsonb_build_array(
      jsonb_build_object('key', p_account, 'side', 'D', 'currency', 'USD', 'minor', v_cost),
      jsonb_build_object('key', p_paid_from, 'side', 'C', 'currency', 'USD', 'minor', v_cost)),
    'asset:' || v_id::text, null, 'fixed_asset', v_id, null, auth.uid());
  update ledger_fixed_assets set purchase_entry = v_entry where id = v_id;
  return v_id;
end $$;

-- ── الإهلاك ─────────────────────────────────────────────────────────────────
-- يقيّد كلَّ شهرٍ استحقّ ولم يُقيَّد، ويعيد عددها.
create function public._ledger_depreciate(p_asset uuid, p_actor uuid) returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  a        ledger_fixed_assets;
  v_closed date;
  v_today  date := ledger_today();
  v_base   bigint;
  v_per    bigint;
  v_k      integer;
  v_end    date;
  v_amount bigint;
  v_key    text;
  v_n      integer := 0;
begin
  select * into a from ledger_fixed_assets where id = p_asset;
  if not found then
    return 0;
  end if;
  select closed_through into v_closed from ledger_books where id = a.book_id;
  v_base := a.cost_minor - a.salvage_minor;
  v_per := v_base / a.life_months;
  for v_k in 1 .. a.life_months loop
    v_end := (date_trunc('month', a.acquired_on) + make_interval(months => v_k + 1) - interval '1 day')::date;
    exit when v_end > v_today;
    continue when v_closed is not null and v_end <= v_closed;
    v_key := 'dep:' || a.id::text || ':' || lpad(v_k::text, 3, '0');
    continue when exists (select 1 from journal_entries where book_id = a.book_id and idempotency_key = v_key);
    v_amount := case when v_k = a.life_months then v_base - v_per * (a.life_months - 1) else v_per end;
    continue when v_amount <= 0;
    perform _ledger_post(
      a.book_id, v_end, left('إهلاك ' || a.name || ' — ' || to_char(v_end, 'YYYY-MM'), 500),
      jsonb_build_array(
        jsonb_build_object('key', 'depreciation', 'side', 'D', 'currency', 'USD', 'minor', v_amount),
        jsonb_build_object('key', 'accumulated_depreciation', 'side', 'C', 'currency', 'USD', 'minor', v_amount)),
      v_key, null, 'depreciation', a.id, null, p_actor);
    v_n := v_n + 1;
  end loop;
  return v_n;
end $$;

create function public.ledger_asset_depreciate(p_book uuid) returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_n  integer := 0;
begin
  if auth.uid() is null then
    raise exception 'سجّل الدخول أولاً';
  end if;
  if not exists (select 1 from ledger_books b where b.id = p_book and b.owner_id = auth.uid()) then
    raise exception 'ليس هذا دفترك';
  end if;
  for v_id in select id from ledger_fixed_assets where book_id = p_book order by acquired_on, created_at loop
    v_n := v_n + _ledger_depreciate(v_id, auth.uid());
  end loop;
  return v_n;
end $$;

-- لمسك الدفاتر اليوميّ (مفتاح الخدمة): أصلٌ تعذّر قيده لا يوقف الباقي.
create function public.ledger_depreciate_all() returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_n  integer := 0;
begin
  for v_id in select id from ledger_fixed_assets order by book_id, acquired_on loop
    begin
      v_n := v_n + _ledger_depreciate(v_id, null);
    exception when others then
      raise warning 'depreciation of % failed: %', v_id, sqlerrm;
    end;
  end loop;
  return v_n;
end $$;

-- ── السجلّ كما يقرؤه صاحبه ─────────────────────────────────────────────────────
create function public.ledger_fixed_assets_summary(p_book uuid)
returns table (
  id uuid, name text, account_key text, acquired_on date, cost_minor bigint, salvage_minor bigint,
  life_months integer, months_posted integer, accumulated_minor bigint, book_value_minor bigint
)
language sql
stable
security definer
set search_path = public
as $$
  select a.id, a.name, a.account_key, a.acquired_on, a.cost_minor, a.salvage_minor, a.life_months,
         coalesce(d.n, 0)::integer, coalesce(d.total, 0)::bigint, a.cost_minor - coalesce(d.total, 0)
    from ledger_fixed_assets a
    left join lateral (
      select count(distinct e.id) as n, sum(l.base_minor) as total
        from journal_entries e
        join journal_lines l on l.entry_id = e.id and l.side = 'D'
       where e.book_id = a.book_id and e.source_type = 'depreciation' and e.source_id = a.id
         and not exists (select 1 from journal_entries r where r.reversal_of = e.id)
    ) d on true
   where a.book_id = p_book
     and exists (select 1 from ledger_books b where b.id = p_book and (b.owner_id = auth.uid() or is_admin()))
   order by a.acquired_on, a.created_at
$$;

revoke all on function public.ledger_asset_add(uuid, text, text, date, numeric, numeric, integer, text) from public, anon;
revoke all on function public._ledger_depreciate(uuid, uuid) from public, anon, authenticated;
revoke all on function public.ledger_asset_depreciate(uuid) from public, anon;
revoke all on function public.ledger_depreciate_all() from public, anon, authenticated;
revoke all on function public.ledger_fixed_assets_summary(uuid) from public, anon;
grant execute on function public.ledger_asset_add(uuid, text, text, date, numeric, numeric, integer, text) to authenticated, service_role;
grant execute on function public.ledger_asset_depreciate(uuid) to authenticated, service_role;
grant execute on function public.ledger_fixed_assets_summary(uuid) to authenticated, service_role;
grant execute on function public._ledger_depreciate(uuid, uuid) to service_role;
grant execute on function public.ledger_depreciate_all() to service_role;

comment on function public.ledger_asset_add(uuid, text, text, date, numeric, numeric, integer, text) is
  'يسجّل أصلاً ثابتاً في دفتر مزرعة صاحبه ويقيّد شراءه في القيد نفسه (البند ١٩٠).';
comment on function public.ledger_depreciate_all() is
  'مسك الدفاتر اليوميّ: يقيّد إهلاك كلّ أصلٍ لكلّ شهرٍ انتهى ولم يُقيَّد. للخادم وحده.';
