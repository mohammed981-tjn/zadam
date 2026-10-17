-- سوداقري شركةُ خدماتٍ ومعلوماتٍ للمنتجين: الشركاتُ الزراعيّة الشريكة،
-- واتّفاقاتُها المبدئيّة، وفهرسُ المزارع، والموافقةُ قبل الكشف.
--
-- البند ١١١، بالتصميم في docs/studies/services-company-ar.md.
--
--   ١) الشركاتُ الشريكة — شركةٌ لكلّ حساب، بسجلّها التجاريّ وأنواع خدماتها
--      والولايات التي تعمل فيها. لا تظهر للناس إلا بعد أن يوثّقها المشرف، وأيُّ
--      تغييرٍ في الاسم أو السجلّ أو توسيعٌ للأنواع يُعيدها إلى المراجعة.
--   ٢) الاتّفاقُ المبدئيّ — تكتبه الشركة مسوّدةً: المجموعاتُ التي تخدمها (الولايات
--      ومصادرُ الماء وأصنافُ التربة وفئاتُ المساحة والمحاصيل)، والخدمات، والشروط
--      والأسعار الإرشاديّة، والمدّة. ويفعّله المشرف وحده، ولا يُعدَّل بعد تفعيله.
--      وهو ليس عقداً ملزماً لأيّ مزرعة: العقدُ الملزم هو عقدُ الخدمة الموجود،
--      بمراحله ودفعه بعد الإثبات. والمصفوفةُ الفارغة في أيّ بُعدٍ تعني «أيّاً كان».
--   ٣) فهرسُ المزارع — كلُّ أرضٍ تُصنَّف بالولاية وفئة المساحة وصنف التربة ومصدر
--      الماء والمحاصيل. وصنفُ التربة يُقرأ في التطبيق من خريطة التربة الوطنية
--      بإحداثيّات الأرض (data/sudan-soil.json، ‏SoilGrids)، ويُحفظ هنا حين يفتح
--      صاحبُ الأرض أرضه للشركاء.
--   ٤) الموافقةُ قبل الكشف — لا تُعرض أرضٌ على شركةٍ إلا موثّقةً، وإلا إذا فتحها
--      صاحبُها للشركاء. وحتى حينها لا ترى الشركة إلا الولاية والمحليّة والمساحة
--      والمجموعة: لا اسمَ صاحبها ولا اسمَ الأرض ولا قريتَها ولا إحداثيّاتها. فإن
--      أرادت أن تخدمها أرسلت طلبَ اهتمام، ولا ترى بيانات التواصل إلا بعد أن يقبله
--      صاحبُ الأرض.
--
-- كالموردين: لا كتابةَ مباشرةً في الجداول الجديدة. القراءةُ بسياسات RLS، وكلُّ
-- تغييرٍ دالّةٌ تتحقّق من صاحبه بـ auth.uid()، ويُسحب تنفيذها من العامّة.

-- ═══════════════════════════════════════════════════════════════════════════
-- ٠) أدوات
-- ═══════════════════════════════════════════════════════════════════════════

-- كما في 20261012130000_supply_chain.sql، ويُعاد تعريفها هنا حتى لا تتوقّف هذه
-- الهجرة على تلك.
create or replace function public.all_sudan_states(a text[])
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(bool_and(public.is_sudan_state(s)), true) from unnest(a) s;
$$;

-- فئةُ المساحة. الحدّان (٢٠ و٢٠٠ فدان) مقترحان، والقرارُ فيهما للمالك (القسم ٩
-- من الدراسة). يُغيَّران هنا وفي src/lib/partners.ts معاً.
create or replace function public.land_area_band(p_feddans numeric)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when p_feddans is null then null
    when p_feddans < 20 then 'small'
    when p_feddans < 200 then 'medium'
    else 'large'
  end;
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- ١) الأرض: صنفُ التربة، والمحاصيل، والموافقة
-- ═══════════════════════════════════════════════════════════════════════════

-- صاحبُ الأرض يكتب هذه الأعمدة بسياسة lands_own كما يكتب وصف أرضه، والدالّة
-- land_set_partner_consent هي الطريق الذي يسلكه التطبيق. ولا تمسّ التحقّق ولا
-- النشر: enforce_land_listing_gate ما زال يحرسهما.
alter table public.lands
  add column if not exists soil_class text
    check (soil_class is null or soil_class ~ '^[A-Z][a-z]{3,20}$'),
  add column if not exists crop_keys text[] not null default '{}'
    check (cardinality(crop_keys) <= 8
           and array_to_string(crop_keys, ',') ~ '^([a-z_]{2,30}(,[a-z_]{2,30})*)?$'),
  add column if not exists open_to_partners boolean not null default false;

create index if not exists lands_open_to_partners_idx on public.lands (state)
  where open_to_partners and verification = 'verified';

-- ═══════════════════════════════════════════════════════════════════════════
-- ٢) الشركات الشريكة
-- ═══════════════════════════════════════════════════════════════════════════

create table public.partner_companies (
  id                          uuid primary key default gen_random_uuid(),
  owner_id                    uuid not null unique references auth.users(id) on delete cascade,
  name                        text not null check (length(btrim(name)) between 3 and 120),
  commercial_registration_no  text check (commercial_registration_no is null
                                          or length(btrim(commercial_registration_no)) between 2 and 60),
  -- ماذا تقدّم: من القائمة المغلقة نفسها التي في الدراسة.
  kinds                       text[] not null
                              check (cardinality(kinds) between 1 and 8
                                     and kinds <@ array['mechanization','irrigation','inputs','harvest',
                                                        'packing','transport','extension','supervision']),
  -- الولاياتُ التي تعمل فيها.
  states                      text[] not null
                              check (cardinality(states) between 1 and 18 and all_sudan_states(states)),
  contact_name                text not null check (length(btrim(contact_name)) between 3 and 80),
  phone                       text not null check (phone ~ '^\+?[0-9]{7,15}$'),
  whatsapp                    text check (whatsapp is null or whatsapp ~ '^\+?[0-9]{7,15}$'),
  bio                         text check (bio is null or length(btrim(bio)) between 10 and 1000),
  verified_at                 timestamptz,
  verified_by                 uuid references auth.users(id) on delete set null,
  review_note                 text check (review_note is null or length(review_note) <= 500),
  active                      boolean not null default true,
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now()
);

create index partner_companies_verified_by_idx on public.partner_companies (verified_by);

create table public.partner_agreements (
  id             uuid primary key default gen_random_uuid(),
  company_id     uuid not null references public.partner_companies(id) on delete cascade,
  title          text not null check (length(btrim(title)) between 5 and 120),
  -- أبعادُ المجموعة. الفارغُ «أيّاً كان».
  states         text[] not null default '{}'
                 check (cardinality(states) <= 18 and all_sudan_states(states)),
  water_sources  text[] not null default '{}'
                 check (water_sources <@ array['canal','river_pump','borehole','rainfed']),
  soil_classes   text[] not null default '{}'
                 check (cardinality(soil_classes) <= 20
                        and array_to_string(soil_classes, ',') ~ '^([A-Z][a-z]{3,20}(,[A-Z][a-z]{3,20})*)?$'),
  area_bands     text[] not null default '{}'
                 check (area_bands <@ array['small','medium','large']),
  crop_keys      text[] not null default '{}'
                 check (cardinality(crop_keys) <= 20
                        and array_to_string(crop_keys, ',') ~ '^([a-z_]{2,30}(,[a-z_]{2,30})*)?$'),
  -- مفاتيحُ الكتالوج (src/lib/services.ts). نصٌّ لا service_key، فالكتالوج يكبر
  -- بهجرةٍ ولا ينبغي أن تنتظره اتّفاقاتٌ مكتوبة.
  services       text[] not null
                 check (cardinality(services) between 1 and 45
                        and array_to_string(services, ',') ~ '^[a-z_]{2,40}(,[a-z_]{2,40})*$'),
  -- الشروطُ والأسعارُ الإرشاديّة بكلام الشركة.
  terms          text not null check (length(btrim(terms)) between 20 and 3000),
  valid_from     date not null,
  valid_until    date not null,
  status         text not null default 'draft' check (status in ('draft','active','ended')),
  activated_at   timestamptz,
  activated_by   uuid references auth.users(id) on delete set null,
  ended_at       timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint partner_agreement_dates
    check (valid_until > valid_from and valid_until <= valid_from + 1096)
);

create index partner_agreements_company_idx on public.partner_agreements (company_id);
create index partner_agreements_activated_by_idx on public.partner_agreements (activated_by);

-- طلبُ الاهتمام: شركةٌ مطابقة تطلب أن تخدم أرضاً، وصاحبُها يقبل أو يعتذر.
create table public.partner_interests (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null references public.partner_companies(id) on delete cascade,
  land_id       uuid not null references public.lands(id) on delete cascade,
  agreement_id  uuid references public.partner_agreements(id) on delete set null,
  message       text not null check (length(btrim(message)) between 10 and 1000),
  status        text not null default 'pending'
                check (status in ('pending','accepted','declined','withdrawn')),
  created_at    timestamptz not null default now(),
  decided_at    timestamptz
);

create unique index partner_interests_one_open on public.partner_interests (company_id, land_id)
  where status in ('pending','accepted');
create index partner_interests_land_idx on public.partner_interests (land_id);
create index partner_interests_agreement_idx on public.partner_interests (agreement_id);

alter table public.partner_companies enable row level security;
alter table public.partner_agreements enable row level security;
alter table public.partner_interests enable row level security;

-- Supabase grants every new table to anon and authenticated by default. No
-- write policy exists, so RLS refuses the writes anyway; taking the privilege
-- back too means a policy added carelessly later still cannot open one.
revoke insert, update, delete on table public.partner_companies, public.partner_agreements,
  public.partner_interests from anon, authenticated;

-- الموثّقةُ النشطة للناس، والمسجَّلةُ لصاحبها، والكلُّ للمشرف.
create policy partner_companies_read on public.partner_companies for select using (
  (verified_at is not null and active)
  or owner_id = (select auth.uid())
  or is_admin());

-- المفعَّلُ من اتّفاقات الشركات الموثّقة للناس — فهو ما يقول أيّ المزارع تخدم —
-- والمسوّداتُ لصاحبها وللمشرف.
create policy partner_agreements_read on public.partner_agreements for select using (
  (status = 'active'
   and exists (select 1 from partner_companies c
                where c.id = company_id and c.verified_at is not null and c.active))
  or exists (select 1 from partner_companies c
              where c.id = company_id and c.owner_id = (select auth.uid()))
  or is_admin());

-- الطلبُ لطرفيه: الشركة وصاحب الأرض. والمشرف.
create policy partner_interests_parties on public.partner_interests for select to authenticated using (
  exists (select 1 from partner_companies c
           where c.id = company_id and c.owner_id = (select auth.uid()))
  or exists (select 1 from lands l
              where l.id = land_id and l.owner_id = (select auth.uid()))
  or is_admin());

-- ═══════════════════════════════════════════════════════════════════════════
-- ٣) الدوالّ: الشركة
-- ═══════════════════════════════════════════════════════════════════════════

-- يسجّل المستخدم شركةً واحدة ويعدّلها. وتغييرُ الاسم أو السجلّ، أو إضافةُ نوعٍ
-- لم يُوثَّق، يُسقط التوثيق حتى يراه المشرف من جديد.
create or replace function public.partner_save(
  p_name text, p_commercial_registration text, p_kinds text[], p_states text[],
  p_contact_name text, p_phone text, p_whatsapp text, p_bio text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_old partner_companies;
  v_id uuid;
begin
  if v_uid is null then raise exception 'سجّل الدخول أولاً.'; end if;
  select * into v_old from partner_companies where owner_id = v_uid;
  if v_old.id is null then
    insert into partner_companies (owner_id, name, commercial_registration_no, kinds, states,
                                   contact_name, phone, whatsapp, bio)
    values (v_uid, btrim(p_name), nullif(btrim(p_commercial_registration), ''), p_kinds, p_states,
            btrim(p_contact_name), p_phone, nullif(btrim(p_whatsapp), ''), nullif(btrim(p_bio), ''))
    returning id into v_id;
    return v_id;
  end if;

  update partner_companies set
    name = btrim(p_name),
    commercial_registration_no = nullif(btrim(p_commercial_registration), ''),
    kinds = p_kinds, states = p_states,
    contact_name = btrim(p_contact_name), phone = p_phone,
    whatsapp = nullif(btrim(p_whatsapp), ''), bio = nullif(btrim(p_bio), ''),
    updated_at = now()
  where id = v_old.id;

  if btrim(p_name) is distinct from v_old.name
     or nullif(btrim(p_commercial_registration), '') is distinct from v_old.commercial_registration_no
     or not (p_kinds <@ v_old.kinds) then
    update partner_companies set verified_at = null, verified_by = null,
           review_note = 'تغيّرت بياناتُ الشركة، فعاد الطلب إلى المراجعة.'
     where id = v_old.id and verified_at is not null;
  end if;
  return v_old.id;
end;
$$;

-- التوثيق للمشرف وحده، وبسجلٍّ تجاريّ: الشارةُ شهادةٌ على ما رآه.
create or replace function public.partner_review(p_company uuid, p_verify boolean, p_note text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v partner_companies;
begin
  if not is_admin() then raise exception 'التوثيق للإدارة وحدها.'; end if;
  select * into v from partner_companies where id = p_company;
  if v.id is null then raise exception 'لا شركة بهذا المعرّف.'; end if;
  if p_verify then
    if v.commercial_registration_no is null then
      raise exception 'لا تُوثَّق شركة بلا رقم سجلّ تجاري.';
    end if;
    update partner_companies set verified_at = now(), verified_by = auth.uid(),
           review_note = nullif(btrim(p_note), '')
     where id = p_company;
  else
    if length(btrim(coalesce(p_note, ''))) < 5 then
      raise exception 'اكتب سبب الردّ لتعرف الشركة ما تصلحه.';
    end if;
    update partner_companies set verified_at = null, verified_by = null, review_note = btrim(p_note)
     where id = p_company;
  end if;
end;
$$;

-- الإيقافُ المؤقّت: صاحبُها أو المشرف. لا يمسّ التوثيق.
create or replace function public.partner_set_active(p_company uuid, p_active boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update partner_companies set active = p_active, updated_at = now()
   where id = p_company and (owner_id = auth.uid() or is_admin());
  if not found then raise exception 'ليست لك هذه الشركة.'; end if;
end;
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- ٤) الدوالّ: الاتّفاق المبدئيّ
-- ═══════════════════════════════════════════════════════════════════════════

-- الشركةُ تكتب المسوّدة وتعدّلها ما دامت مسوّدة. والمفعَّلُ لا يُعدَّل: يُنهى
-- وتُكتب مسوّدةٌ جديدة، فلا يتغيّر تحت المشرف ما وافق عليه.
create or replace function public.partner_agreement_save(
  p_id uuid, p_title text, p_states text[], p_water_sources text[], p_soil_classes text[],
  p_area_bands text[], p_crop_keys text[], p_services text[], p_terms text,
  p_valid_from date, p_valid_until date)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_company uuid;
  v_status text;
  v_id uuid;
begin
  if v_uid is null then raise exception 'سجّل الدخول أولاً.'; end if;
  select id into v_company from partner_companies where owner_id = v_uid;
  if v_company is null then raise exception 'سجّل بيانات الشركة أولاً.'; end if;

  if p_id is null then
    if (select count(*) from partner_agreements where company_id = v_company and status <> 'ended') >= 20 then
      raise exception 'لشركتك عشرون اتّفاقاً قائماً؛ أنهِ بعضها أولاً.';
    end if;
    insert into partner_agreements (company_id, title, states, water_sources, soil_classes,
                                    area_bands, crop_keys, services, terms, valid_from, valid_until)
    values (v_company, btrim(p_title), coalesce(p_states, '{}'), coalesce(p_water_sources, '{}'),
            coalesce(p_soil_classes, '{}'), coalesce(p_area_bands, '{}'), coalesce(p_crop_keys, '{}'),
            p_services, btrim(p_terms), p_valid_from, p_valid_until)
    returning id into v_id;
    return v_id;
  end if;

  select status into v_status from partner_agreements where id = p_id and company_id = v_company;
  if v_status is null then raise exception 'ليس لشركتك هذا الاتّفاق.'; end if;
  if v_status <> 'draft' then
    raise exception 'الاتّفاق المفعَّل لا يُعدَّل؛ أنهِه واكتب مسوّدةً جديدة.';
  end if;
  update partner_agreements set
    title = btrim(p_title), states = coalesce(p_states, '{}'),
    water_sources = coalesce(p_water_sources, '{}'), soil_classes = coalesce(p_soil_classes, '{}'),
    area_bands = coalesce(p_area_bands, '{}'), crop_keys = coalesce(p_crop_keys, '{}'),
    services = p_services, terms = btrim(p_terms),
    valid_from = p_valid_from, valid_until = p_valid_until, updated_at = now()
  where id = p_id;
  return p_id;
end;
$$;

-- التفعيلُ للمشرف وحده، لشركةٍ موثّقةٍ نشطة، ولمسوّدةٍ لم تنتهِ مدّتها.
create or replace function public.partner_agreement_activate(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v partner_agreements;
begin
  if not is_admin() then raise exception 'تفعيل الاتّفاقات للإدارة وحدها.'; end if;
  select * into v from partner_agreements where id = p_id;
  if v.id is null then raise exception 'لا اتّفاق بهذا المعرّف.'; end if;
  if v.status <> 'draft' then raise exception 'لا يُفعَّل إلا اتّفاقٌ مسوّدة.'; end if;
  if v.valid_until < current_date then raise exception 'انتهت مدّة هذا الاتّفاق قبل تفعيله.'; end if;
  if not exists (select 1 from partner_companies c
                  where c.id = v.company_id and c.verified_at is not null and c.active) then
    raise exception 'لا يُفعَّل اتّفاقٌ لشركةٍ غير موثّقة.';
  end if;
  update partner_agreements set status = 'active', activated_at = now(), activated_by = auth.uid(),
         updated_at = now()
   where id = p_id;
end;
$$;

-- الإنهاء: الشركةُ صاحبتُه أو المشرف.
create or replace function public.partner_agreement_end(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update partner_agreements a set status = 'ended', ended_at = now(), updated_at = now()
   where a.id = p_id and a.status <> 'ended'
     and (is_admin() or exists (select 1 from partner_companies c
                                 where c.id = a.company_id and c.owner_id = auth.uid()));
  if not found then raise exception 'ليس لك هذا الاتّفاق، أو أنّه منتهٍ.'; end if;
end;
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- ٥) الدوالّ: الأرض والمطابقة
-- ═══════════════════════════════════════════════════════════════════════════

-- صاحبُ الأرض يفتحها للشركاء أو يغلقها، ومعها صنفُ التربة (يقرؤه التطبيق من
-- الخريطة بإحداثيّاتها) والمحاصيلُ التي يريدها فيها.
create or replace function public.land_set_partner_consent(
  p_land uuid, p_open boolean, p_soil_class text, p_crop_keys text[])
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'سجّل الدخول أولاً.'; end if;
  update lands set open_to_partners = coalesce(p_open, false),
                   soil_class = nullif(btrim(p_soil_class), ''),
                   crop_keys = coalesce(p_crop_keys, '{}')
   where id = p_land and owner_id = auth.uid();
  if not found then raise exception 'ليست لك هذه الأرض.'; end if;
end;
$$;

-- ما تراه الشركة: أراضٍ موثّقةٌ فتحها أصحابُها، في ولاياتها، تطابق اتّفاقاً مفعَّلاً
-- قائماً اليوم. بلا اسمٍ ولا قريةٍ ولا إحداثيّات ولا معرّفِ صاحب.
create or replace function public.partner_matching_lands()
returns table (
  land_id uuid, state text, locality text, feddans numeric, area_band text,
  soil_class text, water_source text, crop_keys text[], station_key text,
  agreement_id uuid, agreement_title text, interest_status text)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_uid uuid := auth.uid();
  v_company partner_companies;
begin
  if v_uid is null then raise exception 'سجّل الدخول أولاً.'; end if;
  select * into v_company from partner_companies
   where owner_id = v_uid and verified_at is not null and active;
  if v_company.id is null then
    raise exception 'لا تُعرض المزارع إلا لشركةٍ موثّقةٍ نشطة.';
  end if;

  return query
  select distinct on (l.id)
         l.id, l.state, l.locality, l.feddans, land_area_band(l.feddans),
         l.soil_class, l.water_source, l.crop_keys, l.station_key,
         a.id, a.title,
         (select i.status from partner_interests i
           where i.company_id = v_company.id and i.land_id = l.id
             and i.status in ('pending','accepted')
           limit 1)
    from lands l
    join partner_agreements a
      on a.company_id = v_company.id
     and a.status = 'active'
     and current_date between a.valid_from and a.valid_until
   where l.verification = 'verified'
     and l.open_to_partners
     and l.owner_id <> v_uid
     and l.state = any (v_company.states)
     and (cardinality(a.states) = 0 or l.state = any (a.states))
     and (cardinality(a.water_sources) = 0 or l.water_source = any (a.water_sources))
     and (cardinality(a.soil_classes) = 0 or l.soil_class = any (a.soil_classes))
     and (cardinality(a.area_bands) = 0 or land_area_band(l.feddans) = any (a.area_bands))
     and (cardinality(a.crop_keys) = 0 or l.crop_keys && a.crop_keys)
   order by l.id, a.activated_at
   limit 500;
end;
$$;

-- الشركةُ المطابقة تطلب أن تخدم أرضاً.
create or replace function public.partner_express_interest(p_land uuid, p_message text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company uuid;
  v_agreement uuid;
  v_id uuid;
begin
  select m.agreement_id into v_agreement from partner_matching_lands() m where m.land_id = p_land;
  if v_agreement is null then
    raise exception 'هذه الأرض لا تطابق اتّفاقاً مفعَّلاً لشركتك.';
  end if;
  select id into v_company from partner_companies where owner_id = auth.uid();
  begin
    insert into partner_interests (company_id, land_id, agreement_id, message)
    values (v_company, p_land, v_agreement, btrim(p_message))
    returning id into v_id;
  exception when unique_violation then
    raise exception 'أرسلت شركتك طلباً على هذه الأرض من قبل.';
  end;
  return v_id;
end;
$$;

-- الشركةُ تسحب طلبها ما دام معلّقاً.
create or replace function public.partner_interest_withdraw(p_interest uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update partner_interests i set status = 'withdrawn', decided_at = now()
   where i.id = p_interest and i.status = 'pending'
     and exists (select 1 from partner_companies c
                  where c.id = i.company_id and c.owner_id = auth.uid());
  if not found then raise exception 'ليس لشركتك طلبٌ معلّقٌ بهذا المعرّف.'; end if;
end;
$$;

-- صاحبُ الأرض وحده يقبل أو يعتذر.
create or replace function public.land_interest_decide(p_interest uuid, p_accept boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update partner_interests i
     set status = case when p_accept then 'accepted' else 'declined' end, decided_at = now()
   where i.id = p_interest and i.status = 'pending'
     and exists (select 1 from lands l where l.id = i.land_id and l.owner_id = auth.uid());
  if not found then raise exception 'ليس على أرضك طلبٌ معلّقٌ بهذا المعرّف.'; end if;
end;
$$;

-- بعد القبول فقط: اسمُ الأرض وموقعُها، واسمُ صاحبها وهاتفُه — للشركة التي قُبل طلبها.
create or replace function public.partner_interest_contacts()
returns table (
  interest_id uuid, land_id uuid, land_name text, state text, locality text, village text,
  feddans numeric, latitude numeric, longitude numeric, owner_name text, owner_phone text,
  decided_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select i.id, l.id, l.name, l.state, l.locality, l.village, l.feddans, l.latitude, l.longitude,
         p.full_name, p.phone, i.decided_at
    from partner_interests i
    join partner_companies c on c.id = i.company_id
    join lands l on l.id = i.land_id
    left join profiles p on p.id = l.owner_id
   where c.owner_id = auth.uid()
     and i.status = 'accepted'
   order by i.decided_at desc
   limit 200;
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- الصلاحيات
-- ═══════════════════════════════════════════════════════════════════════════

revoke execute on function public.partner_save(text, text, text[], text[], text, text, text, text) from public, anon;
revoke execute on function public.partner_review(uuid, boolean, text) from public, anon;
revoke execute on function public.partner_set_active(uuid, boolean) from public, anon;
revoke execute on function public.partner_agreement_save(uuid, text, text[], text[], text[], text[], text[], text[], text, date, date) from public, anon;
revoke execute on function public.partner_agreement_activate(uuid) from public, anon;
revoke execute on function public.partner_agreement_end(uuid) from public, anon;
revoke execute on function public.land_set_partner_consent(uuid, boolean, text, text[]) from public, anon;
revoke execute on function public.partner_matching_lands() from public, anon;
revoke execute on function public.partner_express_interest(uuid, text) from public, anon;
revoke execute on function public.partner_interest_withdraw(uuid) from public, anon;
revoke execute on function public.land_interest_decide(uuid, boolean) from public, anon;
revoke execute on function public.partner_interest_contacts() from public, anon;

grant execute on function public.partner_save(text, text, text[], text[], text, text, text, text) to authenticated;
grant execute on function public.partner_review(uuid, boolean, text) to authenticated;
grant execute on function public.partner_set_active(uuid, boolean) to authenticated;
grant execute on function public.partner_agreement_save(uuid, text, text[], text[], text[], text[], text[], text[], text, date, date) to authenticated;
grant execute on function public.partner_agreement_activate(uuid) to authenticated;
grant execute on function public.partner_agreement_end(uuid) to authenticated;
grant execute on function public.land_set_partner_consent(uuid, boolean, text, text[]) to authenticated;
grant execute on function public.partner_matching_lands() to authenticated;
grant execute on function public.partner_express_interest(uuid, text) to authenticated;
grant execute on function public.partner_interest_withdraw(uuid) to authenticated;
grant execute on function public.land_interest_decide(uuid, boolean) to authenticated;
grant execute on function public.partner_interest_contacts() to authenticated;
