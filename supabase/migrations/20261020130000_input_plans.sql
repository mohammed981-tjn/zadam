-- ═══════════════════════════════════════════════════════════════════════════
-- «مشروعي»: قائمة المدخلات — المرحلة الأولى من المحفظة (البند ١٠٣ و١١٥)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- قرار المالك (20 أكتوبر 2026): «ابنِ المحفظة لكن نفّذ البند الأوّل» — أي المرحلة
-- الأولى من docs/studies/wallet-ar.md: **المنصّة لا تمسك المال أبداً**. تُعدّ
-- قائمة المدخلات من دراسة الجدوى، ويوافق عليها المزارع، ويدفع للمورد مباشرةً
-- من حسابه أو محفظته المرخّصة، ويسجّل هنا ما دفع وما استلم. لا عمودَ هنا يحمل
-- رصيداً، ولا دالّةَ تنقل مالاً.
--
-- ولا يُحذف شيء: البندُ المُزال يُعلَّم «أُزيل» ويبقى في السجلّ (قاعدة المالك:
-- «لا تحذف القديم إطلاقاً»).
--
-- الجداول للقراءة بسياساتٍ لصاحبها وللإدارة؛ والكتابة كلّها بدوالّ تتحقّق
-- من auth.uid().

create table public.input_plans (
  id           uuid primary key default gen_random_uuid(),
  owner_id     uuid not null references auth.users(id) on delete cascade,
  land_id      uuid references public.lands(id) on delete set null,
  title        text not null check (length(btrim(title)) between 2 and 80),
  crop_key     text not null check (crop_key ~ '^[a-z_]{2,30}$'),
  feddans      numeric(10,2) not null check (feddans > 0 and feddans <= 1000000),
  status       text not null default 'draft' check (status in ('draft','approved','closed')),
  approved_at  timestamptz,
  closed_at    timestamptz,
  created_at   timestamptz not null default now(),
  constraint approved_has_time check (status = 'draft' or approved_at is not null)
);

create index input_plans_owner_idx on public.input_plans (owner_id);
create index input_plans_land_idx on public.input_plans (land_id);

create table public.input_plan_items (
  id              uuid primary key default gen_random_uuid(),
  plan_id         uuid not null references public.input_plans(id) on delete cascade,
  name            text not null check (length(btrim(name)) between 2 and 80),
  note            text check (note is null or length(note) <= 200),
  quantity        numeric(12,2) not null check (quantity > 0 and quantity <= 100000000),
  unit            text not null check (length(btrim(unit)) between 1 and 20),
  -- السعر من عرض المورد، بالدولار. فارغٌ حتى يكتبه المزارع: لا سعرَ مُخمَّن.
  unit_price_usd  numeric(12,2) check (unit_price_usd is null or (unit_price_usd >= 0 and unit_price_usd <= 10000000)),
  supplier_name   text check (supplier_name is null or length(btrim(supplier_name)) between 2 and 80),
  -- ما دفعه المزارع للمورد مباشرةً — يسجّله هو، والمنصّة لا تستلمه.
  paid_sdg        numeric(14,2) check (paid_sdg is null or (paid_sdg > 0 and paid_sdg <= 1000000000000)),
  paid_at         date,
  paid_ref        text check (paid_ref is null or length(btrim(paid_ref)) between 2 and 60),
  delivered_at    date,
  delivery_note   text check (delivery_note is null or length(delivery_note) <= 200),
  removed_at      timestamptz,
  created_at      timestamptz not null default now(),
  constraint paid_has_date check ((paid_sdg is null) = (paid_at is null))
);

create index input_plan_items_plan_idx on public.input_plan_items (plan_id);

alter table public.input_plans enable row level security;
alter table public.input_plan_items enable row level security;
revoke insert, update on table public.input_plans from anon, authenticated;
revoke insert, update on table public.input_plan_items from anon, authenticated;

create policy input_plans_read on public.input_plans for select to authenticated using (
  owner_id = (select auth.uid()) or is_admin());

create policy input_plan_items_read on public.input_plan_items for select to authenticated using (
  exists (select 1 from input_plans p where p.id = plan_id and (p.owner_id = (select auth.uid()) or is_admin())));

-- ── الكتابة ────────────────────────────────────────────────────────────────

-- خطّةٌ جديدة ببنودها دفعةً واحدة: [{name, note, quantity, unit}].
create or replace function public.input_plan_create(
  p_title text, p_crop text, p_feddans numeric, p_land uuid, p_items jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_id uuid;
  it jsonb;
begin
  if v_uid is null then raise exception 'سجّل الدخول أولاً.'; end if;
  if p_land is not null and not exists (select 1 from lands where id = p_land and owner_id = v_uid) then
    raise exception 'الأرض ليست لك.';
  end if;
  if jsonb_typeof(coalesce(p_items, '[]'::jsonb)) <> 'array' or jsonb_array_length(coalesce(p_items, '[]'::jsonb)) > 40 then
    raise exception 'قائمة البنود غير صالحة.';
  end if;
  insert into input_plans (owner_id, land_id, title, crop_key, feddans)
  values (v_uid, p_land, btrim(p_title), p_crop, p_feddans)
  returning id into v_id;
  for it in select * from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) loop
    insert into input_plan_items (plan_id, name, note, quantity, unit)
    values (v_id, btrim(it->>'name'), nullif(btrim(coalesce(it->>'note', '')), ''), (it->>'quantity')::numeric, btrim(it->>'unit'));
  end loop;
  return v_id;
end;
$$;

-- حارسٌ مشترك: البند لصاحب الخطّة، والخطّة لم تُقفل.
create or replace function public.input_plan_item_owned(p_item uuid)
returns input_plans
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v input_plans;
begin
  select p.* into v from input_plan_items i join input_plans p on p.id = i.plan_id
   where i.id = p_item and p.owner_id = auth.uid();
  if v.id is null then raise exception 'هذا البند ليس في خطّتك.'; end if;
  if v.status = 'closed' then raise exception 'أُقفلت هذه الخطّة.'; end if;
  return v;
end;
$$;

create or replace function public.input_plan_item_add(
  p_plan uuid, p_name text, p_note text, p_quantity numeric, p_unit text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if not exists (select 1 from input_plans where id = p_plan and owner_id = auth.uid() and status <> 'closed') then
    raise exception 'الخطّة ليست لك، أو أُقفلت.';
  end if;
  insert into input_plan_items (plan_id, name, note, quantity, unit)
  values (p_plan, btrim(p_name), nullif(btrim(coalesce(p_note, '')), ''), p_quantity, btrim(p_unit))
  returning id into v_id;
  return v_id;
end;
$$;

-- الكمّيّة والسعر والمورد — قبل الدفع وبعده، فالسعر قد يُعرف عند الشراء.
create or replace function public.input_plan_item_set(
  p_item uuid, p_quantity numeric, p_unit_price_usd numeric, p_supplier text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform input_plan_item_owned(p_item);
  update input_plan_items set
    quantity = p_quantity,
    unit_price_usd = p_unit_price_usd,
    supplier_name = nullif(btrim(coalesce(p_supplier, '')), '')
   where id = p_item and removed_at is null;
  if not found then raise exception 'البند أُزيل.'; end if;
end;
$$;

-- يُعلَّم ولا يُحذف. وما دُفع فيه لا يُزال: السجلّ يبقى كما حدث.
create or replace function public.input_plan_item_remove(p_item uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform input_plan_item_owned(p_item);
  update input_plan_items set removed_at = now()
   where id = p_item and removed_at is null and paid_sdg is null;
  if not found then raise exception 'لا يُزال بندٌ دُفع فيه أو أُزيل من قبل.'; end if;
end;
$$;

create or replace function public.input_plan_approve(p_plan uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update input_plans set status = 'approved', approved_at = now()
   where id = p_plan and owner_id = auth.uid() and status = 'draft';
  if not found then raise exception 'الموافقة لصاحب الخطّة وهي مسوّدة.'; end if;
end;
$$;

-- المزارع يسجّل ما دفعه للمورد. المنصّة لا تستلم شيئاً ولا تحوّل شيئاً.
create or replace function public.input_plan_item_paid(
  p_item uuid, p_paid_sdg numeric, p_paid_at date, p_ref text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v input_plans;
begin
  v := input_plan_item_owned(p_item);
  if v.status <> 'approved' then raise exception 'وافق على القائمة أوّلاً، ثمّ ادفع.'; end if;
  if p_paid_at is null or p_paid_at > current_date then raise exception 'تاريخ الدفع مطلوب، ولا يكون في المستقبل.'; end if;
  update input_plan_items set paid_sdg = p_paid_sdg, paid_at = p_paid_at, paid_ref = nullif(btrim(coalesce(p_ref, '')), '')
   where id = p_item and removed_at is null;
  if not found then raise exception 'البند أُزيل.'; end if;
end;
$$;

create or replace function public.input_plan_item_delivered(p_item uuid, p_delivered_at date, p_note text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v input_plans;
begin
  v := input_plan_item_owned(p_item);
  if v.status <> 'approved' then raise exception 'وافق على القائمة أوّلاً.'; end if;
  if p_delivered_at is null or p_delivered_at > current_date then raise exception 'تاريخ الاستلام مطلوب، ولا يكون في المستقبل.'; end if;
  update input_plan_items set delivered_at = p_delivered_at, delivery_note = nullif(btrim(coalesce(p_note, '')), '')
   where id = p_item and removed_at is null;
  if not found then raise exception 'البند أُزيل.'; end if;
end;
$$;

create or replace function public.input_plan_close(p_plan uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update input_plans set status = 'closed', closed_at = now()
   where id = p_plan and owner_id = auth.uid() and status = 'approved';
  if not found then raise exception 'تُقفل الخطّة الموافَق عليها، من صاحبها.'; end if;
end;
$$;

-- ── الصلاحيات ──────────────────────────────────────────────────────────────

revoke execute on function public.input_plan_create(text, text, numeric, uuid, jsonb) from public, anon;
revoke execute on function public.input_plan_item_owned(uuid) from public, anon, authenticated;
revoke execute on function public.input_plan_item_add(uuid, text, text, numeric, text) from public, anon;
revoke execute on function public.input_plan_item_set(uuid, numeric, numeric, text) from public, anon;
revoke execute on function public.input_plan_item_remove(uuid) from public, anon;
revoke execute on function public.input_plan_approve(uuid) from public, anon;
revoke execute on function public.input_plan_item_paid(uuid, numeric, date, text) from public, anon;
revoke execute on function public.input_plan_item_delivered(uuid, date, text) from public, anon;
revoke execute on function public.input_plan_close(uuid) from public, anon;

grant execute on function public.input_plan_create(text, text, numeric, uuid, jsonb) to authenticated;
grant execute on function public.input_plan_item_add(uuid, text, text, numeric, text) to authenticated;
grant execute on function public.input_plan_item_set(uuid, numeric, numeric, text) to authenticated;
grant execute on function public.input_plan_item_remove(uuid) to authenticated;
grant execute on function public.input_plan_approve(uuid) to authenticated;
grant execute on function public.input_plan_item_paid(uuid, numeric, date, text) to authenticated;
grant execute on function public.input_plan_item_delivered(uuid, date, text) to authenticated;
grant execute on function public.input_plan_close(uuid) to authenticated;

comment on table public.input_plans is 'مشروعي: قائمة مدخلات المزارع (المرحلة الأولى من المحفظة). المنصّة لا تمسك المال؛ المزارع يدفع للمورد مباشرةً ويسجّل هنا.';
comment on table public.input_plan_items is 'بنود القائمة. لا تُحذف: المُزال يُعلَّم removed_at.';
