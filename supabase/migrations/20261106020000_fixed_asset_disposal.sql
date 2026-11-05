-- بيع الأصل الثابت أو استبعاده (البند ١٩٠، ما بقي منه؛ المالك، 5 نوفمبر 2026: «كمّل بلا توقّف»).
--
-- ledger_asset_dispose يُخرج الأصل من الدفتر بقيدٍ واحد: مدين مجمّع إهلاكه وما قُبض من ثمنه (إن بيع)، دائن حسابه
-- بثمنه الأصليّ، والفرق ربحٌ في «إيرادات أخرى» (4900) أو خسارةٌ في حسابٍ جديد «خسائر بيع أو استبعاد أصول» (7140).
-- ويقف إهلاكه عند تاريخ البيع: لا يُقيَّد شهرٌ ينتهي بعده، ولا يُقبل تاريخٌ قبل آخر شهرٍ قُيِّد.

alter table public.ledger_fixed_assets
  add column disposed_on    date,
  add column proceeds_minor bigint check (proceeds_minor is null or proceeds_minor >= 0),
  add column disposal_entry uuid;

-- ── حساب الخسارة: في القالب، وفي كلّ دفتر مزرعةٍ قائم ──────────────────────────
insert into public.ledger_chart_templates (kind, code, parent_code, name_ar, name_en, type, postable, system_key)
values ('farm', '7140', '7', 'خسائر بيع أو استبعاد أصول', 'Losses on disposal of assets', 'expense', true, 'asset_disposal_loss')
on conflict (kind, code) do nothing;

create function public._ledger_ensure_disposal_loss(p_book uuid) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code text;
begin
  if exists (select 1 from ledger_accounts where book_id = p_book and system_key = 'asset_disposal_loss') then
    return;
  end if;
  -- 7140 if free, otherwise the first free code after it under the same parent.
  select c into v_code from generate_series(7140, 7199) g(n), lateral (select n::text as c) x
   where not exists (select 1 from ledger_accounts where book_id = p_book and code = x.c)
   order by n limit 1;
  insert into ledger_accounts (book_id, code, parent_code, name_ar, name_en, type, postable, system_key)
  values (p_book, v_code, '7', 'خسائر بيع أو استبعاد أصول', 'Losses on disposal of assets', 'expense', true, 'asset_disposal_loss');
end $$;

do $$
declare b uuid;
begin
  for b in select id from public.ledger_books where kind = 'farm' loop
    perform public._ledger_ensure_disposal_loss(b);
  end loop;
end $$;

-- ── الإهلاك يقف عند البيع ─────────────────────────────────────────────────────
create or replace function public._ledger_depreciate(p_asset uuid, p_actor uuid) returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  a        ledger_fixed_assets;
  v_closed date;
  v_until  date;
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
  v_until := least(ledger_today(), coalesce(a.disposed_on, ledger_today()));
  v_base := a.cost_minor - a.salvage_minor;
  v_per := v_base / a.life_months;
  for v_k in 1 .. a.life_months loop
    v_end := (date_trunc('month', a.acquired_on) + make_interval(months => v_k + 1) - interval '1 day')::date;
    exit when v_end > v_until;
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

-- ── البيع والاستبعاد ──────────────────────────────────────────────────────────
create function public.ledger_asset_dispose(p_asset uuid, p_date date, p_proceeds numeric, p_received_into text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  a        ledger_fixed_assets;
  v_proc   bigint := round(coalesce(p_proceeds, 0) * 100);
  v_accum  bigint;
  v_diff   bigint;
  v_lines  jsonb := '[]'::jsonb;
  v_entry  uuid;
begin
  if auth.uid() is null then
    raise exception 'سجّل الدخول أولاً';
  end if;
  select * into a from ledger_fixed_assets where id = p_asset for update;
  if not found or not exists (select 1 from ledger_books b where b.id = a.book_id and b.owner_id = auth.uid()) then
    raise exception 'ليس هذا الأصل في دفترك';
  end if;
  if a.disposed_on is not null then
    raise exception 'هذا الأصل بِيع أو استُبعد من قبل';
  end if;
  if p_date is null or p_date < a.acquired_on or p_date > ledger_today() then
    raise exception 'تاريخ البيع بين تاريخ الشراء واليوم';
  end if;
  if v_proc < 0 or v_proc > 100000000000 then
    raise exception 'اكتب ما قُبض من الثمن بالدولار، أو صفراً إن استُبعد بلا ثمن';
  end if;
  if v_proc > 0 and (p_received_into is null or p_received_into not in ('cash_on_hand', 'bank', 'wallet')) then
    raise exception 'أين قُبض الثمن؟ نقداً أو في البنك أو المحفظة';
  end if;
  if exists (select 1 from journal_entries e where e.book_id = a.book_id and e.source_type = 'depreciation'
              and e.source_id = a.id and e.entry_date > p_date
              and not exists (select 1 from journal_entries r where r.reversal_of = e.id)) then
    raise exception 'قُيِّد إهلاكٌ لهذا الأصل بعد هذا التاريخ؛ اختر تاريخاً بعد آخر شهرٍ قُيِّد';
  end if;

  -- What the months up to the sale still owe, booked first, then the sale stops any more.
  update ledger_fixed_assets set disposed_on = p_date where id = a.id;
  perform _ledger_depreciate(a.id, auth.uid());

  select coalesce(sum(l.base_minor), 0) into v_accum
    from journal_entries e join journal_lines l on l.entry_id = e.id and l.side = 'D'
   where e.book_id = a.book_id and e.source_type = 'depreciation' and e.source_id = a.id
     and not exists (select 1 from journal_entries r where r.reversal_of = e.id);

  if v_accum > 0 then
    v_lines := v_lines || jsonb_build_object('key', 'accumulated_depreciation', 'side', 'D', 'currency', 'USD', 'minor', v_accum);
  end if;
  if v_proc > 0 then
    v_lines := v_lines || jsonb_build_object('key', p_received_into, 'side', 'D', 'currency', 'USD', 'minor', v_proc);
  end if;
  v_lines := v_lines || jsonb_build_object('key', a.account_key, 'side', 'C', 'currency', 'USD', 'minor', a.cost_minor);
  v_diff := v_proc + v_accum - a.cost_minor;
  if v_diff > 0 then
    v_lines := v_lines || jsonb_build_object('key', 'other_income', 'side', 'C', 'currency', 'USD', 'minor', v_diff);
  elsif v_diff < 0 then
    perform _ledger_ensure_disposal_loss(a.book_id);
    v_lines := v_lines || jsonb_build_object('key', 'asset_disposal_loss', 'side', 'D', 'currency', 'USD', 'minor', -v_diff);
  end if;

  v_entry := _ledger_post(
    a.book_id, p_date,
    left(case when v_proc > 0 then 'بيع أصل: ' else 'استبعاد أصل: ' end || a.name, 500),
    v_lines, 'dispose:' || a.id::text, null, 'asset_disposal', a.id, null, auth.uid());
  update ledger_fixed_assets set proceeds_minor = v_proc, disposal_entry = v_entry where id = a.id;
  return v_entry;
end $$;

-- ── السجلّ: ومعه البيع ──────────────────────────────────────────────────────────
drop function public.ledger_fixed_assets_summary(uuid);
create function public.ledger_fixed_assets_summary(p_book uuid)
returns table (
  id uuid, name text, account_key text, acquired_on date, cost_minor bigint, salvage_minor bigint,
  life_months integer, months_posted integer, accumulated_minor bigint, book_value_minor bigint,
  disposed_on date, proceeds_minor bigint
)
language sql
stable
security definer
set search_path = public
as $$
  select a.id, a.name, a.account_key, a.acquired_on, a.cost_minor, a.salvage_minor, a.life_months,
         coalesce(d.n, 0)::integer, coalesce(d.total, 0)::bigint,
         case when a.disposed_on is null then a.cost_minor - coalesce(d.total, 0) else 0 end,
         a.disposed_on, a.proceeds_minor
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
   order by a.disposed_on nulls first, a.acquired_on, a.created_at
$$;

revoke all on function public._ledger_ensure_disposal_loss(uuid) from public, anon, authenticated;
revoke all on function public._ledger_depreciate(uuid, uuid) from public, anon, authenticated;
revoke all on function public.ledger_asset_dispose(uuid, date, numeric, text) from public, anon;
revoke all on function public.ledger_fixed_assets_summary(uuid) from public, anon;
grant execute on function public._ledger_ensure_disposal_loss(uuid) to service_role;
grant execute on function public._ledger_depreciate(uuid, uuid) to service_role;
grant execute on function public.ledger_asset_dispose(uuid, date, numeric, text) to authenticated, service_role;
grant execute on function public.ledger_fixed_assets_summary(uuid) to authenticated, service_role;

comment on function public.ledger_asset_dispose(uuid, date, numeric, text) is
  'يبيع الأصل الثابت أو يستبعده بقيدٍ واحد: المجمّع والثمن المقبوض مقابل ثمنه الأصليّ، والفرق ربحٌ أو خسارة (البند ١٩٠).';
