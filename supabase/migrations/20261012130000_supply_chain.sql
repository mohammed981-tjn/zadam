-- سلسلةُ المدخلات: الموردون الموثّقون، والطلبات الجماعية، والتوصيل إلى الأرض،
-- والحماية من الغشّ.
--
-- البند ١٠٤، بالمواصفة التي أقرّها المالك من دراسة docs/studies/suppliers-ar.md
-- (ومن docs/studies/wallet-ar.md: المنصّة لا تمسك المال أبداً).
--
--   ١) دليلُ الموردين — صفحةٌ لكلّ مورد، وقائمةُ منتجاته بأرقام تسجيلها وأسعارها
--      بالدولار حتى تاريخٍ معلن. ولا يظهر للناس إلا بعد أن يرى المشرفُ مستنداتِ
--      رخصته (رخصة المجلس القومي للمبيدات لتاجر المبيدات، وتسجيل الإدارة القومية
--      للتقاوي لتاجر البذور، والسجلّ التجاري للجميع).
--      وأسعارُ الموردين **عروضٌ** لا مرجع: لا تدخل في أيّ متوسّطٍ تنشره المنصّة،
--      لأنّ من يبيع لا يضع سعرَ السوق.
--   ٢) الطلباتُ الجماعية — منظّمٌ (جمعيةٌ أو مندوبُ قسم) يفتح طلباً على موردٍ
--      موثّق، بنقطة استلامٍ ويومِ توصيلٍ معلن (كما يفعل One Acre Fund)، والمزارعون
--      يتعهّدون بكميّاتهم حتى يبلغ الطلبُ حمولةَ شاحنة. والمقدّمُ (١٠٪) يدفعه
--      المزارعُ **مباشرةً** إلى حساب المورد أو الجمعية (بنكك)، والمنظّمُ يسجّل أنّه
--      استلمه برقم التحويل. لا مالَ يمرّ بالمنصّة.
--      ودرسُ One Acre Fund: لا تُعاقَب المجموعةُ بتعثّر فرد — فتعثّرُ عضوٍ يُسقط
--      تعهّده وحده من الحمولة، ولا يمسّ تعهّدات غيره ولا حالتهم.
--   ٣) التوصيلُ إلى الأرض — ناقلون محلّيون يوثّقهم المشرف، وإثباتُ التسليم صورةٌ
--      وموقعٌ ورمزٌ من ستّة أرقام يراه المستلمُ وحده ويعطيه للسائق. والرمزُ يُحفظ
--      **مُجزَّأً** في جدولٍ لا تقرؤه أيُّ سياسة، ويُقفل بعد خمس محاولاتٍ خاطئة.
--      ولا يُعلَّم التوصيلُ «مستحقَّ الدفع» إلا بعد أن يطابق الرمز.
--   ٤) الحمايةُ من الغشّ — بحثٌ برقم التسجيل في منتجات الموردين الموثّقين (وهو
--      ليس سجلّ المجلس الرسمي، والصفحةُ تقول ذلك)، وبلاغٌ عن منتجٍ مشبوه يراجعه
--      المشرف ويحيله إلى المجلس القومي للمبيدات.
--
-- كالترع والجودية: لا كتابةَ مباشرةً في الجداول. القراءةُ بسياسات RLS، وكلُّ
-- تغييرٍ دالّةٌ تتحقّق من صاحبه بـ auth.uid().

-- ═══════════════════════════════════════════════════════════════════════════
-- ٠) أدوات
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.all_sudan_states(a text[])
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(bool_and(public.is_sudan_state(s)), true) from unnest(a) s;
$$;

-- رقمُ التسجيل كما يُقارن: أرقامٌ لاتينية وحروفٌ كبيرة، بلا مسافاتٍ ولا شُرَط.
-- المزارعُ يكتب «ص م ١٢٣-٤» أو «PCPB 1234» كما يراه على العبوة، والمقارنةُ لا
-- ينبغي أن تفشل بسبب شَرطة.
create or replace function public.normalize_registration(s text)
returns text
language sql
immutable
set search_path = ''
as $$
  select upper(regexp_replace(
    translate(coalesce(s, ''), '٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹', '01234567890123456789'),
    '[^0-9A-Za-z؀-ۿ]', '', 'g'));
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- ١) الموردون ومنتجاتهم
-- ═══════════════════════════════════════════════════════════════════════════

create table public.suppliers (
  id                          uuid primary key default gen_random_uuid(),
  owner_id                    uuid not null unique references auth.users(id) on delete cascade,
  name                        text not null check (length(btrim(name)) between 3 and 100),
  state                       text not null check (is_sudan_state(state)),
  locality                    text not null check (length(btrim(locality)) between 2 and 80),
  phone                       text not null check (phone ~ '^\+?[0-9]{7,15}$'),
  whatsapp                    text check (whatsapp is null or whatsapp ~ '^\+?[0-9]{7,15}$'),
  -- نطاقُ التوصيل: الولاياتُ التي يوصل إليها، من القائمة المغلقة.
  delivery_states             text[] not null default '{}'
                              check (cardinality(delivery_states) <= 18 and all_sudan_states(delivery_states)),
  categories                  text[] not null
                              check (cardinality(categories) between 1 and 4
                                     and categories <@ array['fertilizer','seed','pesticide','other']),
  -- رخصة تجارة المبيدات من المجلس القومي للمبيدات (قانون المبيدات 1994).
  pesticide_licence_no        text check (pesticide_licence_no is null or length(btrim(pesticide_licence_no)) between 2 and 60),
  -- تسجيل تاجر التقاوي لدى الإدارة القومية للتقاوي (قانون التقاوي 2010).
  seed_registration_no        text check (seed_registration_no is null or length(btrim(seed_registration_no)) between 2 and 60),
  commercial_registration_no  text check (commercial_registration_no is null or length(btrim(commercial_registration_no)) between 2 and 60),
  -- صورةُ المستندات في دلو الأدلّة الخاصّ، تحت مجلّد صاحبها. يراها المشرف وحده.
  licence_doc_path            text check (licence_doc_path is null or length(licence_doc_path) between 10 and 300),
  bio                         text check (bio is null or length(btrim(bio)) between 10 and 1000),
  verified_at                 timestamptz,
  verified_by                 uuid references auth.users(id) on delete set null,
  review_note                 text check (review_note is null or length(review_note) <= 500),
  active                      boolean not null default true,
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now()
);

create index suppliers_verified_by_idx on public.suppliers (verified_by);
create index suppliers_state_idx on public.suppliers (state) where verified_at is not null and active;

create table public.supplier_products (
  id                 uuid primary key default gen_random_uuid(),
  supplier_id        uuid not null references public.suppliers(id) on delete cascade,
  category           text not null check (category in ('fertilizer','seed','pesticide','other')),
  -- يربط المنتجَ بمدخلات دراسة الجدوى (يوريا، داب…)، فيجده زرّ «من أين أشتري؟».
  input_key          text check (input_key is null or input_key in
                       ('urea','DAP','TSP','NPK','seed','insecticide','herbicide','fungicide')),
  name               text not null check (length(btrim(name)) between 2 and 120),
  active_ingredient  text check (active_ingredient is null or length(btrim(active_ingredient)) between 2 and 200),
  -- رقم تسجيل المبيد لدى المجلس، أو اسم الصنف المعتمد للبذور.
  registration_no    text check (registration_no is null or length(btrim(registration_no)) between 2 and 60),
  -- رقم لوط الإكثار المعتمد (للبذور).
  cert_lot           text check (cert_lot is null or length(btrim(cert_lot)) between 2 and 60),
  registration_norm  text generated always as (normalize_registration(registration_no)) stored,
  lot_norm           text generated always as (normalize_registration(cert_lot)) stored,
  pack_size          numeric(10,3) not null check (pack_size > 0 and pack_size <= 100000),
  pack_unit          text not null check (pack_unit in ('kg','g','l','ml','unit')),
  price_usd          numeric(12,2) not null check (price_usd > 0 and price_usd <= 1000000),
  valid_until        date not null,
  active             boolean not null default true,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint pesticide_needs_registration check (category <> 'pesticide' or registration_no is not null),
  constraint seed_needs_variety check (category <> 'seed' or registration_no is not null)
);

create index supplier_products_supplier_idx on public.supplier_products (supplier_id);
create index supplier_products_registration_idx on public.supplier_products (registration_norm) where registration_norm <> '';
create index supplier_products_lot_idx on public.supplier_products (lot_norm) where lot_norm <> '';

alter table public.suppliers enable row level security;
alter table public.supplier_products enable row level security;

-- الموثّقُ النشطُ للناس، والمسجَّلُ لصاحبه، والكلُّ للمشرف.
create policy suppliers_read on public.suppliers for select using (
  (verified_at is not null and active)
  or owner_id = (select auth.uid())
  or is_admin());

create policy supplier_products_read on public.supplier_products for select using (
  (active and exists (select 1 from suppliers s
                       where s.id = supplier_id and s.verified_at is not null and s.active))
  or exists (select 1 from suppliers s where s.id = supplier_id and s.owner_id = (select auth.uid()))
  or is_admin());

-- يسجّل المستخدم مورداً واحداً، ويعدّله. وأيُّ تغييرٍ في الاسم أو الرخص يُسقط
-- التوثيق حتى يراه المشرف من جديد: الشارةُ شهادةٌ على ما رآه، لا على ما كُتب بعده.
create or replace function public.supplier_save(
  p_name text, p_state text, p_locality text, p_phone text, p_whatsapp text,
  p_delivery_states text[], p_categories text[],
  p_pesticide_licence text, p_seed_registration text, p_commercial_registration text,
  p_bio text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_old suppliers;
  v_id uuid;
begin
  if v_uid is null then raise exception 'سجّل الدخول أولاً.'; end if;
  select * into v_old from suppliers where owner_id = v_uid;
  if v_old.id is null then
    insert into suppliers (owner_id, name, state, locality, phone, whatsapp, delivery_states,
                           categories, pesticide_licence_no, seed_registration_no,
                           commercial_registration_no, bio)
    values (v_uid, btrim(p_name), p_state, btrim(p_locality), p_phone, nullif(btrim(p_whatsapp), ''),
            coalesce(p_delivery_states, '{}'), p_categories,
            nullif(btrim(p_pesticide_licence), ''), nullif(btrim(p_seed_registration), ''),
            nullif(btrim(p_commercial_registration), ''), nullif(btrim(p_bio), ''))
    returning id into v_id;
    return v_id;
  end if;

  update suppliers set
    name = btrim(p_name), state = p_state, locality = btrim(p_locality), phone = p_phone,
    whatsapp = nullif(btrim(p_whatsapp), ''), delivery_states = coalesce(p_delivery_states, '{}'),
    categories = p_categories,
    pesticide_licence_no = nullif(btrim(p_pesticide_licence), ''),
    seed_registration_no = nullif(btrim(p_seed_registration), ''),
    commercial_registration_no = nullif(btrim(p_commercial_registration), ''),
    bio = nullif(btrim(p_bio), ''),
    updated_at = now()
  where id = v_old.id;

  if btrim(p_name) is distinct from v_old.name
     or nullif(btrim(p_pesticide_licence), '') is distinct from v_old.pesticide_licence_no
     or nullif(btrim(p_seed_registration), '') is distinct from v_old.seed_registration_no
     or nullif(btrim(p_commercial_registration), '') is distinct from v_old.commercial_registration_no
     or not (p_categories <@ v_old.categories) then
    update suppliers set verified_at = null, verified_by = null,
           review_note = 'تغيّرت بياناتُ الرخصة، فعاد الطلب إلى المراجعة.'
     where id = v_old.id and verified_at is not null;
  end if;
  return v_old.id;
end;
$$;

-- صورةُ المستندات: مسارٌ في دلو الأدلّة تحت مجلّد صاحبها، ورفعُ جديدٍ يعيد المراجعة.
create or replace function public.supplier_set_document(p_path text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'سجّل الدخول أولاً.'; end if;
  if p_path is null or p_path not like v_uid::text || '/%' then
    raise exception 'الملفّ ليس في مجلّدك.';
  end if;
  update suppliers set licence_doc_path = p_path, verified_at = null, verified_by = null,
         updated_at = now()
   where owner_id = v_uid;
  if not found then raise exception 'سجّل بيانات المورد أولاً.'; end if;
end;
$$;

-- التوثيق للمشرف وحده، وبعد أن يرى المستندات: لا شارةَ بلا رخصةٍ تناسب ما يبيع.
create or replace function public.supplier_review(p_supplier uuid, p_verify boolean, p_note text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v suppliers;
begin
  if not is_admin() then raise exception 'التحقّق للإدارة وحدها.'; end if;
  select * into v from suppliers where id = p_supplier;
  if v.id is null then raise exception 'لا مورد بهذا المعرّف.'; end if;
  if p_verify then
    if v.licence_doc_path is null then
      raise exception 'لا يُوثَّق مورد قبل رفع صورة مستنداته.';
    end if;
    if v.commercial_registration_no is null then
      raise exception 'لا يُوثَّق مورد بلا رقم سجلّ تجاري.';
    end if;
    if 'pesticide' = any (v.categories) and v.pesticide_licence_no is null then
      raise exception 'لا يُوثَّق تاجر مبيدات بلا رقم رخصة المجلس القومي للمبيدات.';
    end if;
    if 'seed' = any (v.categories) and v.seed_registration_no is null then
      raise exception 'لا يُوثَّق تاجر تقاوٍ بلا رقم تسجيل الإدارة القومية للتقاوي.';
    end if;
    update suppliers set verified_at = now(), verified_by = auth.uid(),
           review_note = nullif(btrim(p_note), '')
     where id = p_supplier;
  else
    if length(btrim(coalesce(p_note, ''))) < 5 then
      raise exception 'اكتب سبب الردّ ليعرف المورد ما يصلحه.';
    end if;
    update suppliers set verified_at = null, verified_by = null, review_note = btrim(p_note)
     where id = p_supplier;
  end if;
end;
$$;

-- الإيقاف المؤقّت: صاحبُه أو المشرف. لا يمسّ التوثيق.
create or replace function public.supplier_set_active(p_supplier uuid, p_active boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update suppliers set active = p_active, updated_at = now()
   where id = p_supplier and (owner_id = auth.uid() or is_admin());
  if not found then raise exception 'ليس لك هذا المورد.'; end if;
end;
$$;

create or replace function public.supplier_product_save(
  p_id uuid, p_category text, p_input_key text, p_name text, p_active_ingredient text,
  p_registration_no text, p_cert_lot text, p_pack_size numeric, p_pack_unit text,
  p_price_usd numeric, p_valid_until date)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_supplier uuid;
  v_id uuid;
begin
  if v_uid is null then raise exception 'سجّل الدخول أولاً.'; end if;
  select id into v_supplier from suppliers where owner_id = v_uid;
  if v_supplier is null then raise exception 'سجّل بيانات المورد أولاً.'; end if;
  if p_valid_until is null or p_valid_until < current_date or p_valid_until > current_date + 365 then
    raise exception 'صلاحيةُ السعر من اليوم إلى سنةٍ على الأكثر.';
  end if;
  if p_category = 'pesticide' and nullif(btrim(p_registration_no), '') is null then
    raise exception 'المبيد بلا رقم تسجيلٍ لدى المجلس لا يُعرض.';
  end if;
  if p_category = 'seed' and nullif(btrim(p_registration_no), '') is null then
    raise exception 'البذور تُعرض باسم صنفها المعتمد.';
  end if;

  if p_id is null then
    if (select count(*) from supplier_products where supplier_id = v_supplier and active) >= 200 then
      raise exception 'مئتا منتجٍ نشط حدٌّ أعلى. أوقف بعضها أولاً.';
    end if;
    insert into supplier_products (supplier_id, category, input_key, name, active_ingredient,
                                   registration_no, cert_lot, pack_size, pack_unit, price_usd, valid_until)
    values (v_supplier, p_category, nullif(p_input_key, ''), btrim(p_name),
            nullif(btrim(p_active_ingredient), ''), nullif(btrim(p_registration_no), ''),
            nullif(btrim(p_cert_lot), ''), p_pack_size, p_pack_unit, p_price_usd, p_valid_until)
    returning id into v_id;
    return v_id;
  end if;

  update supplier_products set
    category = p_category, input_key = nullif(p_input_key, ''), name = btrim(p_name),
    active_ingredient = nullif(btrim(p_active_ingredient), ''),
    registration_no = nullif(btrim(p_registration_no), ''), cert_lot = nullif(btrim(p_cert_lot), ''),
    pack_size = p_pack_size, pack_unit = p_pack_unit, price_usd = p_price_usd,
    valid_until = p_valid_until, active = true, updated_at = now()
  where id = p_id and supplier_id = v_supplier;
  if not found then raise exception 'ليس لك هذا المنتج.'; end if;
  return p_id;
end;
$$;

create or replace function public.supplier_product_remove(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update supplier_products p set active = false, updated_at = now()
    from suppliers s
   where p.id = p_id and s.id = p.supplier_id and (s.owner_id = auth.uid() or is_admin());
  if not found then raise exception 'ليس لك هذا المنتج.'; end if;
end;
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- ٢) الطلبات الجماعية
-- ═══════════════════════════════════════════════════════════════════════════

create table public.group_orders (
  id               uuid primary key default gen_random_uuid(),
  organiser_id     uuid not null references auth.users(id) on delete cascade,
  organiser_name   text not null check (length(btrim(organiser_name)) between 2 and 60),
  organiser_phone  text not null check (organiser_phone ~ '^\+?[0-9]{7,15}$'),
  supplier_id      uuid not null references public.suppliers(id) on delete restrict,
  title            text not null check (length(btrim(title)) between 3 and 100),
  -- نقطة الاستلام: الجمعية، أو مكتب القسم، أو مخزن تاجرٍ شريك.
  pickup_name      text not null check (length(btrim(pickup_name)) between 3 and 100),
  pickup_locality  text not null check (length(btrim(pickup_locality)) between 2 and 80),
  pickup_state     text not null check (is_sudan_state(pickup_state)),
  pickup_lat       numeric(8,5) check (pickup_lat is null or pickup_lat between 3 and 23),
  pickup_lng       numeric(8,5) check (pickup_lng is null or pickup_lng between 21 and 39),
  drop_day         date not null,
  deadline         date not null,
  target_tonnes    numeric(8,2) not null check (target_tonnes > 0 and target_tonnes <= 1000),
  deposit_pct      numeric(4,1) not null default 10 check (deposit_pct between 0 and 50),
  -- لمن يُدفع المقدّم: المورد أو الجمعية — مباشرةً، لا عبر المنصّة.
  payee            text not null check (payee in ('supplier','cooperative')),
  payee_account    text not null check (length(btrim(payee_account)) between 4 and 200),
  notes            text check (notes is null or length(btrim(notes)) <= 1000),
  status           text not null default 'open' check (status in ('open','closed','delivered','cancelled')),
  created_at       timestamptz not null default now(),
  constraint pickup_point_both_or_neither check ((pickup_lat is null) = (pickup_lng is null)),
  constraint deadline_before_drop check (deadline <= drop_day)
);

create index group_orders_organiser_idx on public.group_orders (organiser_id);
create index group_orders_supplier_idx on public.group_orders (supplier_id);

create table public.group_order_lines (
  id              uuid primary key default gen_random_uuid(),
  order_id        uuid not null references public.group_orders(id) on delete cascade,
  product_id      uuid references public.supplier_products(id) on delete set null,
  name            text not null check (length(btrim(name)) between 2 and 120),
  unit_label      text not null check (length(btrim(unit_label)) between 1 and 40),
  -- وزن الوحدة بالكيلوجرام، ومنه تُحسب الحمولة بالطن.
  unit_kg         numeric(10,3) not null check (unit_kg > 0 and unit_kg <= 5000),
  unit_price_usd  numeric(12,2) not null check (unit_price_usd > 0 and unit_price_usd <= 1000000),
  position        smallint not null default 0
);

create index group_order_lines_order_idx on public.group_order_lines (order_id);
create index group_order_lines_product_idx on public.group_order_lines (product_id);

create table public.group_order_pledges (
  id                 uuid primary key default gen_random_uuid(),
  order_id           uuid not null references public.group_orders(id) on delete cascade,
  line_id            uuid not null references public.group_order_lines(id) on delete cascade,
  user_id            uuid not null references auth.users(id) on delete cascade,
  display_name       text not null check (length(btrim(display_name)) between 2 and 60),
  phone              text check (phone is null or phone ~ '^\+?[0-9]{7,15}$'),
  quantity           numeric(10,2) not null check (quantity > 0 and quantity <= 100000),
  status             text not null default 'pledged'
                     check (status in ('pledged','deposit_received','collected','withdrawn','defaulted')),
  deposit_ref        text check (deposit_ref is null or length(btrim(deposit_ref)) between 4 and 60),
  deposit_marked_at  timestamptz,
  status_note        text check (status_note is null or length(status_note) <= 300),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (line_id, user_id)
);

create index group_order_pledges_order_idx on public.group_order_pledges (order_id);
create index group_order_pledges_user_idx on public.group_order_pledges (user_id);

alter table public.group_orders enable row level security;
alter table public.group_order_lines enable row level security;
alter table public.group_order_pledges enable row level security;

create or replace function public.group_order_role(p_order uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  -- 'organiser', 'member' (has a live pledge) or null.
  select case
    when exists (select 1 from group_orders where id = p_order and organiser_id = auth.uid()) then 'organiser'
    when exists (select 1 from group_order_pledges where order_id = p_order and user_id = auth.uid()
                  and status <> 'withdrawn') then 'member'
  end;
$$;

-- الطلبُ نفسُه يُقرأ للناس عبر group_order_directory / group_order_detail، اللتين
-- لا تُظهران هاتف المنظّم ولا حساب الدفع إلا لأهل الطلب.
create policy group_orders_inside on public.group_orders for select to authenticated using (
  organiser_id = (select auth.uid()) or is_admin());
create policy group_order_lines_read on public.group_order_lines for select using (true);
-- تعهّدُ المزارع له وللمنظّم: الاسمُ والهاتفُ والكميّةُ ليست شأنَ الجيران.
create policy group_order_pledges_inside on public.group_order_pledges for select to authenticated using (
  user_id = (select auth.uid()) or group_order_role(order_id) = 'organiser' or is_admin());

create or replace function public.group_order_create(
  p_supplier uuid, p_title text, p_organiser_name text, p_organiser_phone text,
  p_pickup_name text, p_pickup_locality text, p_pickup_state text,
  p_pickup_lat numeric, p_pickup_lng numeric,
  p_drop_day date, p_deadline date, p_target_tonnes numeric,
  p_deposit_pct numeric, p_payee text, p_payee_account text, p_notes text,
  p_lines jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_id uuid;
  l jsonb;
  i int := 0;
  v_product uuid;
begin
  if v_uid is null then raise exception 'سجّل الدخول أولاً.'; end if;
  if not exists (select 1 from suppliers where id = p_supplier and verified_at is not null and active) then
    raise exception 'الطلب الجماعي على موردٍ موثّقٍ نشط وحده.';
  end if;
  if (select count(*) from group_orders where organiser_id = v_uid and status in ('open','closed')) >= 5 then
    raise exception 'لديك خمسة طلباتٍ جارية. أتمّ واحداً قبل أن تفتح غيره.';
  end if;
  if p_deadline < current_date or p_drop_day > current_date + 365 then
    raise exception 'آخر موعدٍ للانضمام من اليوم، ويوم التوصيل خلال سنة.';
  end if;
  if jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) not between 1 and 20 then
    raise exception 'الطلب من صنفٍ واحدٍ إلى عشرين.';
  end if;

  insert into group_orders (organiser_id, organiser_name, organiser_phone, supplier_id, title,
                            pickup_name, pickup_locality, pickup_state, pickup_lat, pickup_lng,
                            drop_day, deadline, target_tonnes, deposit_pct, payee, payee_account, notes)
  values (v_uid, btrim(p_organiser_name), p_organiser_phone, p_supplier, btrim(p_title),
          btrim(p_pickup_name), btrim(p_pickup_locality), p_pickup_state, p_pickup_lat, p_pickup_lng,
          p_drop_day, p_deadline, p_target_tonnes, coalesce(p_deposit_pct, 10), p_payee,
          btrim(p_payee_account), nullif(btrim(p_notes), ''))
  returning id into v_id;

  for l in select * from jsonb_array_elements(p_lines) loop
    v_product := nullif(l->>'product_id', '')::uuid;
    if v_product is not null and not exists (
      select 1 from supplier_products where id = v_product and supplier_id = p_supplier and active) then
      raise exception 'الصنف ليس من منتجات هذا المورد.';
    end if;
    insert into group_order_lines (order_id, product_id, name, unit_label, unit_kg, unit_price_usd, position)
    values (v_id, v_product, btrim(l->>'name'), btrim(l->>'unit_label'),
            (l->>'unit_kg')::numeric, (l->>'unit_price_usd')::numeric, i);
    i := i + 1;
  end loop;
  return v_id;
end;
$$;

-- ما يُعلن للناس: الطلب ومورده ونقطته ويومه، وكم بلغت الحمولة. لا أسماء ولا هواتف.
create or replace function public.group_order_directory()
returns table (id uuid, title text, supplier_id uuid, supplier_name text,
               pickup_name text, pickup_locality text, pickup_state text,
               drop_day date, deadline date, target_tonnes numeric, pledged_tonnes numeric,
               members bigint, deposit_pct numeric, status text)
language sql
stable
security definer
set search_path = public
as $$
  select o.id, o.title, o.supplier_id, s.name, o.pickup_name, o.pickup_locality, o.pickup_state,
         o.drop_day, o.deadline, o.target_tonnes,
         coalesce((select round(sum(p.quantity * l.unit_kg) / 1000, 2)
                     from group_order_pledges p join group_order_lines l on l.id = p.line_id
                    where p.order_id = o.id and p.status in ('pledged','deposit_received','collected')), 0),
         (select count(distinct p.user_id) from group_order_pledges p
           where p.order_id = o.id and p.status in ('pledged','deposit_received','collected')),
         o.deposit_pct, o.status
    from group_orders o join suppliers s on s.id = o.supplier_id
   where o.status <> 'cancelled' or o.organiser_id = auth.uid()
   order by (o.status = 'open') desc, o.drop_day asc
   limit 200;
$$;

-- الطلب الواحد. هاتفُ المنظّم وحسابُ الدفع لمن تعهّد أو نظّم وحده.
create or replace function public.group_order_detail(p_order uuid)
returns table (id uuid, title text, supplier_id uuid, supplier_name text, supplier_phone text,
               organiser_name text, organiser_phone text,
               pickup_name text, pickup_locality text, pickup_state text,
               pickup_lat numeric, pickup_lng numeric,
               drop_day date, deadline date, target_tonnes numeric, pledged_tonnes numeric,
               members bigint, deposit_pct numeric, payee text, payee_account text,
               notes text, status text, my_role text)
language sql
stable
security definer
set search_path = public
as $$
  with r as (select group_order_role(p_order) as role)
  select o.id, o.title, o.supplier_id, s.name, s.phone,
         o.organiser_name,
         case when r.role is not null or is_admin() then o.organiser_phone end,
         o.pickup_name, o.pickup_locality, o.pickup_state, o.pickup_lat, o.pickup_lng,
         o.drop_day, o.deadline, o.target_tonnes,
         coalesce((select round(sum(p.quantity * l.unit_kg) / 1000, 2)
                     from group_order_pledges p join group_order_lines l on l.id = p.line_id
                    where p.order_id = o.id and p.status in ('pledged','deposit_received','collected')), 0),
         (select count(distinct p.user_id) from group_order_pledges p
           where p.order_id = o.id and p.status in ('pledged','deposit_received','collected')),
         o.deposit_pct, o.payee,
         case when r.role is not null or is_admin() then o.payee_account end,
         o.notes, o.status, r.role
    from group_orders o join suppliers s on s.id = o.supplier_id, r
   where o.id = p_order;
$$;

-- كميّةُ كلّ صنفٍ حتى الآن — مجموعٌ بلا أسماء.
create or replace function public.group_order_line_totals(p_order uuid)
returns table (line_id uuid, pledged_qty numeric)
language sql
stable
security definer
set search_path = public
as $$
  select l.id, coalesce(sum(p.quantity) filter (where p.status in ('pledged','deposit_received','collected')), 0)
    from group_order_lines l left join group_order_pledges p on p.line_id = l.id
   where l.order_id = p_order
   group by l.id;
$$;

create or replace function public.group_order_pledge(
  p_line uuid, p_quantity numeric, p_display_name text, p_phone text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_order group_orders;
  v_existing group_order_pledges;
  v_id uuid;
begin
  if v_uid is null then raise exception 'سجّل الدخول أولاً.'; end if;
  select o.* into v_order from group_orders o join group_order_lines l on l.order_id = o.id
   where l.id = p_line;
  if v_order.id is null then raise exception 'لا صنف بهذا المعرّف.'; end if;
  if v_order.status <> 'open' or v_order.deadline < current_date then
    raise exception 'أُغلق باب الانضمام إلى هذا الطلب.';
  end if;
  select * into v_existing from group_order_pledges where line_id = p_line and user_id = v_uid;
  if v_existing.id is not null then
    if v_existing.status not in ('pledged','withdrawn') then
      raise exception 'سُجّل مقدّمك على هذا الصنف؛ تعديل الكميّة الآن عند المنظّم.';
    end if;
    update group_order_pledges set quantity = p_quantity, display_name = btrim(p_display_name),
           phone = nullif(p_phone, ''), status = 'pledged', updated_at = now()
     where id = v_existing.id;
    return v_existing.id;
  end if;
  insert into group_order_pledges (order_id, line_id, user_id, display_name, phone, quantity)
  values (v_order.id, p_line, v_uid, btrim(p_display_name), nullif(p_phone, ''), p_quantity)
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.group_order_withdraw(p_pledge uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v group_order_pledges;
begin
  select * into v from group_order_pledges where id = p_pledge and user_id = auth.uid();
  if v.id is null then raise exception 'ليس لك هذا التعهّد.'; end if;
  if v.status <> 'pledged' then
    raise exception 'استُلم مقدّمك أو سُلّمت بضاعتك؛ الانسحاب الآن عند المنظّم.';
  end if;
  update group_order_pledges set status = 'withdrawn', updated_at = now() where id = p_pledge;
end;
$$;

-- المنظّم يسجّل أنّ المقدّم وصل الحساب، برقم التحويل. المالُ لم يمرّ بالمنصّة.
create or replace function public.group_order_mark_deposit(p_pledge uuid, p_reference text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v group_order_pledges;
begin
  select * into v from group_order_pledges where id = p_pledge;
  if v.id is null or group_order_role(v.order_id) is distinct from 'organiser' then
    raise exception 'تسجيل المقدّم لمنظّم الطلب.';
  end if;
  if v.status <> 'pledged' then raise exception 'هذا التعهّد ليس بانتظار المقدّم.'; end if;
  if length(btrim(coalesce(p_reference, ''))) not between 4 and 60 then
    raise exception 'اكتب رقم التحويل كما في إشعار البنك.';
  end if;
  update group_order_pledges set status = 'deposit_received', deposit_ref = btrim(p_reference),
         deposit_marked_at = now(), updated_at = now()
   where id = p_pledge;
end;
$$;

-- حالُ عضوٍ واحد. التعثّرُ يُسقط تعهّده وحده من الحمولة، ولا يمسّ غيره —
-- درسُ One Acre Fund: معاقبةُ المجموعة بفردٍ تُفقدها كلَّها.
create or replace function public.group_order_set_pledge(p_pledge uuid, p_status text, p_note text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v group_order_pledges;
begin
  select * into v from group_order_pledges where id = p_pledge;
  if v.id is null or group_order_role(v.order_id) is distinct from 'organiser' then
    raise exception 'تعديل التعهّد لمنظّم الطلب.';
  end if;
  if p_status not in ('pledged','collected','defaulted') then
    raise exception 'حالةٌ غير معروفة.';
  end if;
  if v.status = 'withdrawn' then raise exception 'انسحب صاحب هذا التعهّد.'; end if;
  update group_order_pledges set status = p_status, status_note = nullif(btrim(p_note), ''),
         updated_at = now()
   where id = p_pledge;
end;
$$;

create or replace function public.group_order_set_status(p_order uuid, p_status text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v group_orders;
begin
  select * into v from group_orders where id = p_order;
  if v.id is null or (v.organiser_id <> auth.uid() and not is_admin()) then
    raise exception 'هذا لمنظّم الطلب.';
  end if;
  if not ((v.status = 'open' and p_status in ('closed','cancelled'))
       or (v.status = 'closed' and p_status in ('open','delivered','cancelled'))) then
    raise exception 'انتقالٌ غير مسموح: % ← %', v.status, p_status;
  end if;
  if p_status = 'open' and v.deadline < current_date then
    raise exception 'مضى آخر موعدٍ للانضمام.';
  end if;
  update group_orders set status = p_status where id = p_order;
end;
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- ٣) الناقلون والتوصيل إلى الأرض
-- ═══════════════════════════════════════════════════════════════════════════

create table public.carriers (
  id               uuid primary key default gen_random_uuid(),
  owner_id         uuid not null unique references auth.users(id) on delete cascade,
  name             text not null check (length(btrim(name)) between 2 and 80),
  phone            text not null check (phone ~ '^\+?[0-9]{7,15}$'),
  vehicle          text not null check (length(btrim(vehicle)) between 2 and 80),
  capacity_tonnes  numeric(6,2) not null check (capacity_tonnes > 0 and capacity_tonnes <= 100),
  states           text[] not null check (cardinality(states) between 1 and 18 and all_sudan_states(states)),
  verified_at      timestamptz,
  verified_by      uuid references auth.users(id) on delete set null,
  review_note      text check (review_note is null or length(review_note) <= 500),
  active           boolean not null default true,
  created_at       timestamptz not null default now()
);

create index carriers_verified_by_idx on public.carriers (verified_by);

create table public.deliveries (
  id              uuid primary key default gen_random_uuid(),
  carrier_id      uuid not null references public.carriers(id) on delete restrict,
  order_id        uuid not null references public.group_orders(id) on delete cascade,
  -- إلى أرض عضوٍ بعينه، أو حمولةُ الطلب كلُّها إلى نقطة الاستلام.
  pledge_id       uuid references public.group_order_pledges(id) on delete cascade,
  kind            text not null check (kind in ('to_farm','to_pickup')),
  -- مَن يحمل الرمز: صاحبُ التعهّد، أو المنظّمُ عند نقطة الاستلام.
  recipient_id    uuid not null references auth.users(id) on delete cascade,
  assigned_by     uuid not null references auth.users(id) on delete cascade,
  destination     text not null check (length(btrim(destination)) between 3 and 200),
  dest_lat        numeric(8,5) check (dest_lat is null or dest_lat between 3 and 23),
  dest_lng        numeric(8,5) check (dest_lng is null or dest_lng between 21 and 39),
  fee_usd         numeric(10,2) check (fee_usd is null or (fee_usd >= 0 and fee_usd <= 100000)),
  status          text not null default 'assigned' check (status in ('assigned','confirmed','paid','cancelled')),
  photo_path      text check (photo_path is null or length(photo_path) between 10 and 300),
  gps_lat         numeric(9,6),
  gps_lng         numeric(9,6),
  gps_accuracy_m  numeric(8,1),
  confirmed_at    timestamptz,
  paid_at         timestamptz,
  paid_ref        text check (paid_ref is null or length(btrim(paid_ref)) between 4 and 60),
  created_at      timestamptz not null default now(),
  constraint delivery_kind_matches check ((kind = 'to_farm') = (pledge_id is not null)),
  constraint confirmed_has_proof check (
    status in ('assigned','cancelled')
    or (photo_path is not null and gps_lat is not null and gps_lng is not null and confirmed_at is not null))
);

create index deliveries_carrier_idx on public.deliveries (carrier_id);
create index deliveries_order_idx on public.deliveries (order_id);
create index deliveries_pledge_idx on public.deliveries (pledge_id);
create index deliveries_recipient_idx on public.deliveries (recipient_id);
create index deliveries_assigned_by_idx on public.deliveries (assigned_by);
create unique index deliveries_one_live_per_pledge on public.deliveries (pledge_id)
  where pledge_id is not null and status <> 'cancelled';

-- الرمزُ مُجزَّأً بملحٍ، في جدولٍ لا تقرؤه سياسة: لا الناقلُ يراه ولا المستلمُ
-- يقرؤه من جديد — يُعرض مرّةً لحظةَ إصداره، وإصدارُ جديدٍ يُبطل القديم.
create table public.delivery_codes (
  delivery_id  uuid primary key references public.deliveries(id) on delete cascade,
  code_hash    text not null,
  salt         text not null,
  attempts     smallint not null default 0,
  issued_at    timestamptz not null default now()
);

alter table public.carriers enable row level security;
alter table public.deliveries enable row level security;
alter table public.delivery_codes enable row level security;
revoke all on table public.delivery_codes from anon, authenticated;

create policy carriers_read on public.carriers for select to authenticated using (
  (verified_at is not null and active) or owner_id = (select auth.uid()) or is_admin());

create policy deliveries_parties on public.deliveries for select to authenticated using (
  recipient_id = (select auth.uid())
  or assigned_by = (select auth.uid())
  or exists (select 1 from carriers c where c.id = carrier_id and c.owner_id = (select auth.uid()))
  or is_admin());

create or replace function public.carrier_save(
  p_name text, p_phone text, p_vehicle text, p_capacity numeric, p_states text[])
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_id uuid;
begin
  if v_uid is null then raise exception 'سجّل الدخول أولاً.'; end if;
  insert into carriers (owner_id, name, phone, vehicle, capacity_tonnes, states)
  values (v_uid, btrim(p_name), p_phone, btrim(p_vehicle), p_capacity, p_states)
  on conflict (owner_id) do update set
    name = excluded.name, phone = excluded.phone, vehicle = excluded.vehicle,
    capacity_tonnes = excluded.capacity_tonnes, states = excluded.states,
    -- اسمٌ آخر أو مركبةٌ أخرى ليست ما رآه المشرف.
    verified_at = case when carriers.name = excluded.name and carriers.vehicle = excluded.vehicle
                       then carriers.verified_at end,
    verified_by = case when carriers.name = excluded.name and carriers.vehicle = excluded.vehicle
                       then carriers.verified_by end
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.carrier_review(p_carrier uuid, p_verify boolean, p_note text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_admin() then raise exception 'التحقّق للإدارة وحدها.'; end if;
  if not p_verify and length(btrim(coalesce(p_note, ''))) < 5 then
    raise exception 'اكتب سبب الردّ ليعرف الناقل ما يصلحه.';
  end if;
  update carriers set
    verified_at = case when p_verify then now() end,
    verified_by = case when p_verify then auth.uid() end,
    review_note = nullif(btrim(p_note), '')
   where id = p_carrier;
  if not found then raise exception 'لا ناقل بهذا المعرّف.'; end if;
end;
$$;

create or replace function public.delivery_assign(
  p_order uuid, p_pledge uuid, p_carrier uuid, p_destination text,
  p_lat numeric, p_lng numeric, p_fee_usd numeric)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order group_orders;
  v_pledge group_order_pledges;
  v_id uuid;
begin
  select * into v_order from group_orders where id = p_order;
  if v_order.id is null or (v_order.organiser_id <> auth.uid() and not is_admin()) then
    raise exception 'إسناد التوصيل لمنظّم الطلب.';
  end if;
  if v_order.status = 'cancelled' then raise exception 'أُلغي هذا الطلب.'; end if;
  if not exists (select 1 from carriers where id = p_carrier and verified_at is not null and active) then
    raise exception 'يُسند التوصيل إلى ناقلٍ موثّقٍ نشط وحده.';
  end if;
  if p_pledge is not null then
    select * into v_pledge from group_order_pledges where id = p_pledge and order_id = p_order;
    if v_pledge.id is null then raise exception 'التعهّد ليس من هذا الطلب.'; end if;
    if v_pledge.status in ('withdrawn','defaulted') then
      raise exception 'لا يُوصَّل لتعهّدٍ منسحبٍ أو متعثّر.';
    end if;
    insert into deliveries (carrier_id, order_id, pledge_id, kind, recipient_id, assigned_by,
                            destination, dest_lat, dest_lng, fee_usd)
    values (p_carrier, p_order, p_pledge, 'to_farm', v_pledge.user_id, auth.uid(),
            btrim(p_destination), p_lat, p_lng, p_fee_usd)
    returning id into v_id;
  else
    insert into deliveries (carrier_id, order_id, kind, recipient_id, assigned_by,
                            destination, dest_lat, dest_lng, fee_usd)
    values (p_carrier, p_order, 'to_pickup', v_order.organiser_id, auth.uid(),
            btrim(p_destination), p_lat, p_lng, p_fee_usd)
    returning id into v_id;
  end if;
  return v_id;
end;
$$;

-- المستلم يُصدر رمزه. يُعاد مرّةً واحدة ولا يُخزَّن إلا مجزّأً.
-- ستّةُ أرقامٍ من بايتاتٍ عشوائيّةٍ قويّة (gen_random_uuid)، لا من random().
create or replace function public.delivery_issue_code(p_delivery uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v deliveries;
  v_code text;
  v_salt text := replace(gen_random_uuid()::text, '-', '');
begin
  select * into v from deliveries where id = p_delivery;
  if v.id is null or v.recipient_id <> auth.uid() then
    raise exception 'الرمز لمستلم التوصيل وحده.';
  end if;
  if v.status <> 'assigned' then raise exception 'هذا التوصيل ليس بانتظار التسليم.'; end if;
  v_code := lpad(((('x' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8))::bit(32)::bigint)
                  % 1000000)::text, 6, '0');
  insert into delivery_codes (delivery_id, code_hash, salt, attempts, issued_at)
  values (p_delivery, encode(sha256(convert_to(v_salt || v_code, 'UTF8')), 'hex'), v_salt, 0, now())
  on conflict (delivery_id) do update set
    code_hash = excluded.code_hash, salt = excluded.salt, attempts = 0, issued_at = now();
  return v_code;
end;
$$;

-- الناقل يُثبت التسليم: صورةٌ في مجلّده، وموقعٌ من المتصفّح، ورمزُ المستلم.
-- يُرجع 'confirmed' أو 'wrong_code' أو 'locked' بدل أن يرفع خطأً عند الرمز
-- الخاطئ — لأنّ الرفع يُرجع عدّادَ المحاولات معه فلا يُقفل شيءٌ أبداً.
create or replace function public.delivery_confirm(
  p_delivery uuid, p_code text, p_photo_path text,
  p_lat numeric, p_lng numeric, p_accuracy numeric)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v deliveries;
  c delivery_codes;
begin
  select d.* into v from deliveries d join carriers k on k.id = d.carrier_id
   where d.id = p_delivery and k.owner_id = auth.uid();
  if v.id is null then raise exception 'إثبات التسليم لناقل هذا التوصيل.'; end if;
  if v.status <> 'assigned' then raise exception 'هذا التوصيل ليس بانتظار التسليم.'; end if;
  if p_photo_path is null or p_photo_path not like auth.uid()::text || '/%' then
    raise exception 'صورة التسليم مطلوبة، من مجلّدك.';
  end if;
  if p_lat is null or p_lng is null or p_lat not between 3 and 23 or p_lng not between 21 and 39 then
    raise exception 'الموقع مطلوب، من داخل السودان.';
  end if;
  select * into c from delivery_codes where delivery_id = p_delivery for update;
  if c.delivery_id is null then raise exception 'لم يُصدر المستلم رمزه بعد.'; end if;
  if c.attempts >= 5 then return 'locked'; end if;
  if encode(sha256(convert_to(c.salt || btrim(coalesce(p_code, '')), 'UTF8')), 'hex') <> c.code_hash then
    update delivery_codes set attempts = attempts + 1 where delivery_id = p_delivery;
    return case when c.attempts + 1 >= 5 then 'locked' else 'wrong_code' end;
  end if;
  update deliveries set status = 'confirmed', photo_path = p_photo_path, gps_lat = p_lat,
         gps_lng = p_lng, gps_accuracy_m = p_accuracy, confirmed_at = now()
   where id = p_delivery;
  delete from delivery_codes where delivery_id = p_delivery;
  if v.pledge_id is not null then
    update group_order_pledges set status = 'collected', updated_at = now()
     where id = v.pledge_id and status in ('pledged','deposit_received');
  end if;
  return 'confirmed';
end;
$$;

-- مَن أسند التوصيل يسجّل أنّه دفع للناقل — بعد التأكيد وحده.
create or replace function public.delivery_mark_paid(p_delivery uuid, p_reference text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v deliveries;
begin
  select * into v from deliveries where id = p_delivery;
  if v.id is null or (v.assigned_by <> auth.uid() and not is_admin()) then
    raise exception 'هذا لمن أسند التوصيل.';
  end if;
  if v.status <> 'confirmed' then raise exception 'لا يُدفع للناقل قبل تأكيد التسليم بالرمز.'; end if;
  if length(btrim(coalesce(p_reference, ''))) not between 4 and 60 then
    raise exception 'اكتب رقم التحويل كما في إشعار البنك.';
  end if;
  update deliveries set status = 'paid', paid_at = now(), paid_ref = btrim(p_reference)
   where id = p_delivery;
end;
$$;

create or replace function public.delivery_cancel(p_delivery uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update deliveries set status = 'cancelled'
   where id = p_delivery and status = 'assigned' and (assigned_by = auth.uid() or is_admin());
  if not found then raise exception 'لا يُلغى إلا توصيلٌ لم يُسلَّم، ممّن أسنده.'; end if;
  delete from delivery_codes where delivery_id = p_delivery;
end;
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- ٤) الحماية من الغشّ
-- ═══════════════════════════════════════════════════════════════════════════

create table public.product_reports (
  id               uuid primary key default gen_random_uuid(),
  reporter_id      uuid references auth.users(id) on delete set null,
  product_name     text not null check (length(btrim(product_name)) between 2 and 120),
  registration_no  text check (registration_no is null or length(btrim(registration_no)) between 2 and 60),
  where_bought     text not null check (length(btrim(where_bought)) between 2 and 200),
  state            text not null check (is_sudan_state(state)),
  photo_path       text check (photo_path is null or length(photo_path) between 10 and 300),
  details          text check (details is null or length(btrim(details)) <= 1000),
  status           text not null default 'new' check (status in ('new','forwarded','dismissed')),
  admin_note       text check (admin_note is null or length(admin_note) <= 500),
  reviewed_at      timestamptz,
  created_at       timestamptz not null default now()
);

create index product_reports_reporter_idx on public.product_reports (reporter_id);
create index product_reports_status_idx on public.product_reports (status, created_at);

alter table public.product_reports enable row level security;

create policy product_reports_inside on public.product_reports for select to authenticated using (
  reporter_id = (select auth.uid()) or is_admin());

create or replace function public.product_report_submit(
  p_product_name text, p_registration_no text, p_where_bought text, p_state text,
  p_photo_path text, p_details text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_id uuid;
begin
  if v_uid is null then raise exception 'سجّل الدخول أولاً.'; end if;
  if (select count(*) from product_reports
       where reporter_id = v_uid and created_at > now() - interval '1 day') >= 10 then
    raise exception 'عشرة بلاغاتٍ في اليوم حدٌّ أعلى.';
  end if;
  if nullif(p_photo_path, '') is not null and p_photo_path not like v_uid::text || '/%' then
    raise exception 'الملفّ ليس في مجلّدك.';
  end if;
  insert into product_reports (reporter_id, product_name, registration_no, where_bought, state,
                               photo_path, details)
  values (v_uid, btrim(p_product_name), nullif(btrim(p_registration_no), ''), btrim(p_where_bought),
          p_state, nullif(p_photo_path, ''), nullif(btrim(p_details), ''))
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.product_report_review(p_report uuid, p_status text, p_note text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_admin() then raise exception 'التحقّق للإدارة وحدها.'; end if;
  if p_status not in ('new','forwarded','dismissed') then raise exception 'حالةٌ غير معروفة.'; end if;
  update product_reports set status = p_status, admin_note = nullif(btrim(p_note), ''),
         reviewed_at = now()
   where id = p_report;
  if not found then raise exception 'لا بلاغ بهذا المعرّف.'; end if;
end;
$$;

-- البحث برقم التسجيل أو رقم اللوط في منتجات الموردين الموثّقين. للزائر أيضاً:
-- المزارعُ في السوق لا يملك حساباً بالضرورة.
create or replace function public.verify_registration(p_code text)
returns table (product_name text, category text, active_ingredient text,
               registration_no text, cert_lot text, pack_size numeric, pack_unit text,
               supplier_id uuid, supplier_name text, supplier_state text)
language sql
stable
security definer
set search_path = public
as $$
  select p.name, p.category, p.active_ingredient, p.registration_no, p.cert_lot,
         p.pack_size, p.pack_unit, s.id, s.name, s.state
    from supplier_products p join suppliers s on s.id = p.supplier_id
   where length(normalize_registration(p_code)) >= 3
     and p.active and s.verified_at is not null and s.active
     and (p.registration_norm = normalize_registration(p_code)
          or p.lot_norm = normalize_registration(p_code))
   order by s.name
   limit 50;
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- الصلاحيات
-- ═══════════════════════════════════════════════════════════════════════════

revoke execute on function public.supplier_save(text, text, text, text, text, text[], text[], text, text, text, text) from public, anon;
revoke execute on function public.supplier_set_document(text) from public, anon;
revoke execute on function public.supplier_review(uuid, boolean, text) from public, anon;
revoke execute on function public.supplier_set_active(uuid, boolean) from public, anon;
revoke execute on function public.supplier_product_save(uuid, text, text, text, text, text, text, numeric, text, numeric, date) from public, anon;
revoke execute on function public.supplier_product_remove(uuid) from public, anon;
revoke execute on function public.group_order_role(uuid) from public, anon;
revoke execute on function public.group_order_create(uuid, text, text, text, text, text, text, numeric, numeric, date, date, numeric, numeric, text, text, text, jsonb) from public, anon;
revoke execute on function public.group_order_directory() from public;
revoke execute on function public.group_order_detail(uuid) from public;
revoke execute on function public.group_order_line_totals(uuid) from public;
revoke execute on function public.group_order_pledge(uuid, numeric, text, text) from public, anon;
revoke execute on function public.group_order_withdraw(uuid) from public, anon;
revoke execute on function public.group_order_mark_deposit(uuid, text) from public, anon;
revoke execute on function public.group_order_set_pledge(uuid, text, text) from public, anon;
revoke execute on function public.group_order_set_status(uuid, text) from public, anon;
revoke execute on function public.carrier_save(text, text, text, numeric, text[]) from public, anon;
revoke execute on function public.carrier_review(uuid, boolean, text) from public, anon;
revoke execute on function public.delivery_assign(uuid, uuid, uuid, text, numeric, numeric, numeric) from public, anon;
revoke execute on function public.delivery_issue_code(uuid) from public, anon;
revoke execute on function public.delivery_confirm(uuid, text, text, numeric, numeric, numeric) from public, anon;
revoke execute on function public.delivery_mark_paid(uuid, text) from public, anon;
revoke execute on function public.delivery_cancel(uuid) from public, anon;
revoke execute on function public.product_report_submit(text, text, text, text, text, text) from public, anon;
revoke execute on function public.product_report_review(uuid, text, text) from public, anon;
revoke execute on function public.verify_registration(text) from public;

grant execute on function public.supplier_save(text, text, text, text, text, text[], text[], text, text, text, text) to authenticated;
grant execute on function public.supplier_set_document(text) to authenticated;
grant execute on function public.supplier_review(uuid, boolean, text) to authenticated;
grant execute on function public.supplier_set_active(uuid, boolean) to authenticated;
grant execute on function public.supplier_product_save(uuid, text, text, text, text, text, text, numeric, text, numeric, date) to authenticated;
grant execute on function public.supplier_product_remove(uuid) to authenticated;
grant execute on function public.group_order_role(uuid) to authenticated;
grant execute on function public.group_order_create(uuid, text, text, text, text, text, text, numeric, numeric, date, date, numeric, numeric, text, text, text, jsonb) to authenticated;
grant execute on function public.group_order_directory() to anon, authenticated;
grant execute on function public.group_order_detail(uuid) to anon, authenticated;
grant execute on function public.group_order_line_totals(uuid) to anon, authenticated;
grant execute on function public.group_order_pledge(uuid, numeric, text, text) to authenticated;
grant execute on function public.group_order_withdraw(uuid) to authenticated;
grant execute on function public.group_order_mark_deposit(uuid, text) to authenticated;
grant execute on function public.group_order_set_pledge(uuid, text, text) to authenticated;
grant execute on function public.group_order_set_status(uuid, text) to authenticated;
grant execute on function public.carrier_save(text, text, text, numeric, text[]) to authenticated;
grant execute on function public.carrier_review(uuid, boolean, text) to authenticated;
grant execute on function public.delivery_assign(uuid, uuid, uuid, text, numeric, numeric, numeric) to authenticated;
grant execute on function public.delivery_issue_code(uuid) to authenticated;
grant execute on function public.delivery_confirm(uuid, text, text, numeric, numeric, numeric) to authenticated;
grant execute on function public.delivery_mark_paid(uuid, text) to authenticated;
grant execute on function public.delivery_cancel(uuid) to authenticated;
grant execute on function public.product_report_submit(text, text, text, text, text, text) to authenticated;
grant execute on function public.product_report_review(uuid, text, text) to authenticated;
grant execute on function public.verify_registration(text) to anon, authenticated;

comment on table public.suppliers is 'موردو المدخلات. يظهر للناس الموثّقُ النشطُ وحده، بعد أن يرى المشرف رخصته.';
comment on table public.supplier_products is 'منتجات الموردين: عروضٌ بالدولار حتى تاريخٍ معلن — لا تدخل في أيّ متوسّطٍ مرجعيّ.';
comment on table public.group_orders is 'الطلبات الجماعية. المقدّم يُدفع مباشرةً للمورد أو الجمعية؛ المنصّة لا تمسك مالاً.';
comment on table public.delivery_codes is 'رموز التسليم مجزّأةً. لا سياسة قراءة عليها: لا يقرؤها إلا delivery_confirm.';
comment on table public.product_reports is 'بلاغات المنتجات المشبوهة، يراجعها المشرف ويحيلها إلى المجلس القومي للمبيدات.';
