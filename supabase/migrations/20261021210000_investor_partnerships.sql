-- ═══════════════════════════════════════════════════════════════════════════
-- المستثمر وصاحب الأرض: أرضٌ موثّقة تبحث عن شريك (البند ١٢٤)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- المالك، 21 أكتوبر 2026: «اجعل لها صفحة خاصّة بالفرص والعروض للمستثمرين،
-- وكيف يستفيد المستثمر من صاحب الأرض بواسطة سوداقري — فكّر وابنِ شيئاً
-- متكاملاً».
--
-- WHAT WAS MISSING
--
-- Investors could see projects, and nothing else. A farmer with verified land
-- and no money for the season had one way to them: write a full opportunity
-- with shares and a price. Most farmers do not think in shares — they think
-- «I have the land and the water, who will finance the seed and the tractor,
-- and for what part of the harvest». This is that conversation.
--
-- HOW IT WORKS (the same shape as the partner companies, backlog 111)
--
--   ١) صاحبُ الأرض الموثّقة يفتحها للمستثمرين، ويختار نماذج الشراكة التي يقبلها:
--      المشاركة بالمحصول، أو الإيجار، أو تمويل المدخلات مقابل حصّة. وله أن يكتب
--      سطراً عن أرضه.
--   ٢) يرى الناسُ — ولو بلا حساب — الولايةَ والمحليّةَ والمساحةَ والتربةَ والماءَ
--      ونماذجَ الشراكة. لا اسمَ صاحبها ولا اسمَ الأرض ولا قريتَها ولا إحداثيّاتها.
--   ٣) المستثمرُ يرسل طلبَ شراكة بنموذجٍ ورسالة. يصل صاحبَ الأرض إشعار.
--   ٤) صاحبُ الأرض يقبل أو يعتذر. وبعد القبول وحده يرى كلٌّ منهما اسمَ الآخر
--      وهاتفَه، ويرى المستثمرُ موقعَ الأرض.
--
-- WHAT THE PLATFORM DOES NOT DO
--
-- It does not hold the money (the owner's decision, backlog 115). Nothing here
-- moves money or promises a return; the share, the rent and the term are agreed
-- between the two people, and the binding contract is the one they sign.
--
-- As elsewhere: no direct writes. Reading through RLS, every change through a
-- function that checks auth.uid(), and execute is taken back from the public.

-- ═══════════════════════════════════════════════════════════════════════════
-- ١) الأرض: الموافقة على عرضها للمستثمرين
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.lands
  add column if not exists open_to_investors boolean not null default false,
  add column if not exists investor_models text[] not null default '{}'
    check (investor_models <@ array['sharecrop','lease','finance']),
  add column if not exists investor_note text
    check (investor_note is null or length(btrim(investor_note)) between 10 and 500);

create index if not exists lands_open_to_investors_idx on public.lands (state)
  where open_to_investors and verification = 'verified';

-- ═══════════════════════════════════════════════════════════════════════════
-- ٢) طلبُ الشراكة
-- ═══════════════════════════════════════════════════════════════════════════

create table public.investor_interests (
  id           uuid primary key default gen_random_uuid(),
  investor_id  uuid not null references auth.users(id) on delete cascade,
  land_id      uuid not null references public.lands(id) on delete cascade,
  model        text not null check (model in ('sharecrop','lease','finance')),
  message      text not null check (length(btrim(message)) between 10 and 1000),
  status       text not null default 'pending'
               check (status in ('pending','accepted','declined','withdrawn')),
  created_at   timestamptz not null default now(),
  decided_at   timestamptz
);

create unique index investor_interests_one_open on public.investor_interests (investor_id, land_id)
  where status in ('pending','accepted');
create index investor_interests_land_idx on public.investor_interests (land_id);

alter table public.investor_interests enable row level security;

-- Supabase grants every new table to anon and authenticated by default. No
-- write policy exists, so RLS refuses the writes anyway; taking the privilege
-- back too means a policy added carelessly later still cannot open one.
revoke insert, update, delete on table public.investor_interests from anon, authenticated;

-- الطلبُ لطرفيه: المستثمر وصاحب الأرض. والمشرف.
create policy investor_interests_parties on public.investor_interests for select to authenticated using (
  investor_id = (select auth.uid())
  or exists (select 1 from lands l
              where l.id = land_id and l.owner_id = (select auth.uid()))
  or is_admin());

-- ═══════════════════════════════════════════════════════════════════════════
-- ٣) الإشعارات: نوعان جديدان
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.notifications drop constraint notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check
  check (kind = any (array[
    'land_submitted','land_verified','land_rejected',
    'opportunity_submitted','opportunity_approved','opportunity_rejected',
    'lead_received','feedback_received','feedback_replied',
    'nafir_joined','faza_pledged','shura_answered',
    'judiyya_update','canal_update',
    'locust_near','animal_disease',
    'stage_due',
    'investor_interest','investor_decision'
  ]));

-- ═══════════════════════════════════════════════════════════════════════════
-- ٤) الدوالّ: صاحب الأرض
-- ═══════════════════════════════════════════════════════════════════════════

-- يفتح أرضه الموثّقة للمستثمرين أو يغلقها. ومعها صنفُ التربة (يقرؤه التطبيق
-- من الخريطة بإحداثيّاتها) إن لم يكن محفوظاً.
create or replace function public.land_set_investor_consent(
  p_land uuid, p_open boolean, p_models text[], p_note text, p_soil_class text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_land lands;
begin
  if auth.uid() is null then raise exception 'سجّل الدخول أولاً.'; end if;
  select * into v_land from lands where id = p_land and owner_id = auth.uid();
  if v_land.id is null then raise exception 'ليست لك هذه الأرض.'; end if;

  if coalesce(p_open, false) then
    if v_land.verification <> 'verified' then
      raise exception 'لا تُعرض أرضٌ على المستثمرين قبل أن توثّقها الإدارة.';
    end if;
    if coalesce(cardinality(p_models), 0) = 0 then
      raise exception 'اختر نموذجاً واحداً على الأقلّ من نماذج الشراكة.';
    end if;
  end if;

  update lands
     set open_to_investors = coalesce(p_open, false),
         investor_models = case when coalesce(p_open, false) then p_models else investor_models end,
         investor_note = case when coalesce(p_open, false)
                              then nullif(btrim(p_note), '')
                              else investor_note end,
         soil_class = coalesce(soil_class, nullif(btrim(p_soil_class), ''))
   where id = p_land;
end;
$$;

-- صاحبُ الأرض وحده يقبل أو يعتذر، ويصل المستثمرَ الجواب.
create or replace function public.land_investor_decide(p_interest uuid, p_accept boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_investor uuid;
begin
  update investor_interests i
     set status = case when p_accept then 'accepted' else 'declined' end, decided_at = now()
   where i.id = p_interest and i.status = 'pending'
     and exists (select 1 from lands l where l.id = i.land_id and l.owner_id = auth.uid())
  returning i.investor_id into v_investor;
  if v_investor is null then raise exception 'ليس على أرضك طلبٌ معلّقٌ بهذا المعرّف.'; end if;

  perform notify_user(v_investor, 'investor_decision',
    case when p_accept then 'قَبِل صاحبُ الأرض طلبَ شراكتك'
         else 'اعتذر صاحبُ الأرض عن طلب شراكتك' end,
    case when p_accept then 'ترى الآن اسمَه وهاتفَه وموقعَ الأرض في «طلباتي».'
         else 'تصفّح أراضيَ أخرى في صفحة فرص الاستثمار.' end,
    '/invest/mine');
end;
$$;

-- ما على أراضيه من طلبات: اسمُ المستثمر ونموذجُه ورسالته، وهاتفُه بعد القبول.
create or replace function public.land_investor_requests()
returns table (
  interest_id uuid, land_id uuid, model text, message text, status text,
  investor_name text, investor_phone text, created_at timestamptz, decided_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select i.id, i.land_id, i.model, i.message, i.status,
         p.full_name,
         case when i.status = 'accepted' then p.phone end,
         i.created_at, i.decided_at
    from investor_interests i
    join lands l on l.id = i.land_id
    left join profiles p on p.id = i.investor_id
   where l.owner_id = auth.uid()
     and i.status in ('pending','accepted')
   order by i.created_at desc
   limit 200;
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- ٥) الدوالّ: المستثمر
-- ═══════════════════════════════════════════════════════════════════════════

-- ما يراه الناس: أراضٍ موثّقةٌ فتحها أصحابُها. بلا اسمٍ ولا قريةٍ ولا إحداثيّات
-- ولا معرّفِ صاحب. ولمن سجّل الدخول: حالةُ طلبه، وهل الأرضُ أرضُه.
create or replace function public.investor_open_lands()
returns table (
  land_id uuid, state text, locality text, feddans numeric, area_band text,
  soil_class text, water_source text, water_per_feddan numeric, station_key text,
  crop_keys text[], models text[], note text, documents_on_file integer,
  interest_status text, mine boolean)
language sql
stable
security definer
set search_path = public
as $$
  select l.id, l.state, l.locality, l.feddans, land_area_band(l.feddans),
         l.soil_class, l.water_source, l.water_per_feddan, l.station_key,
         l.crop_keys, l.investor_models, l.investor_note, l.documents_on_file::integer,
         (select i.status from investor_interests i
           where i.investor_id = auth.uid() and i.land_id = l.id
             and i.status in ('pending','accepted')
           limit 1),
         coalesce(l.owner_id = auth.uid(), false)
    from lands l
   where l.verification = 'verified'
     and l.open_to_investors
     and cardinality(l.investor_models) > 0
   order by l.feddans desc
   limit 500;
$$;

-- المستثمرُ يطلب الشراكة بنموذجٍ يقبله صاحبُ الأرض، ويصل صاحبَها إشعار.
create or replace function public.investor_express_interest(p_land uuid, p_model text, p_message text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_land lands;
  v_id uuid;
begin
  if auth.uid() is null then raise exception 'سجّل الدخول أولاً.'; end if;
  select * into v_land from lands
   where id = p_land and verification = 'verified' and open_to_investors;
  if v_land.id is null then raise exception 'هذه الأرض ليست معروضةً للمستثمرين.'; end if;
  if v_land.owner_id = auth.uid() then raise exception 'هذه أرضك.'; end if;
  if not (p_model = any (v_land.investor_models)) then
    raise exception 'صاحبُ الأرض لا يقبل هذا النموذج من الشراكة.';
  end if;

  begin
    insert into investor_interests (investor_id, land_id, model, message)
    values (auth.uid(), p_land, p_model, btrim(p_message))
    returning id into v_id;
  exception when unique_violation then
    raise exception 'أرسلت طلباً على هذه الأرض من قبل.';
  end;

  perform notify_user(v_land.owner_id, 'investor_interest',
    'مستثمرٌ يطلب الشراكة في أرضك',
    format('طلبُ شراكةٍ على الأرض "%s". اقرأه واقبل أو اعتذر — لا يرى المستثمر اسمك ولا هاتفك قبل قبولك.',
           coalesce(v_land.name, 'أرضك')),
    '/lands');
  perform notify_admins('investor_interest',
    'طلبُ شراكةٍ جديد من مستثمر',
    format('على أرضٍ في %s. للاطّلاع في قائمة المراجعة.', coalesce(v_land.state, 'ولاية غير محدّدة')),
    '/admin/inbox');
  return v_id;
end;
$$;

-- المستثمرُ يسحب طلبه ما دام معلّقاً.
create or replace function public.investor_interest_withdraw(p_interest uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update investor_interests set status = 'withdrawn', decided_at = now()
   where id = p_interest and status = 'pending' and investor_id = auth.uid();
  if not found then raise exception 'ليس لك طلبٌ معلّقٌ بهذا المعرّف.'; end if;
end;
$$;

-- طلباتُ المستثمر. وبعد القبول فقط: اسمُ الأرض وموقعُها، واسمُ صاحبها وهاتفُه.
create or replace function public.investor_my_interests()
returns table (
  interest_id uuid, land_id uuid, model text, message text, status text,
  state text, locality text, feddans numeric,
  land_name text, village text, latitude numeric, longitude numeric,
  owner_name text, owner_phone text, created_at timestamptz, decided_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select i.id, l.id, i.model, i.message, i.status,
         l.state, l.locality, l.feddans,
         case when i.status = 'accepted' then l.name end,
         case when i.status = 'accepted' then l.village end,
         case when i.status = 'accepted' then l.latitude end,
         case when i.status = 'accepted' then l.longitude end,
         case when i.status = 'accepted' then p.full_name end,
         case when i.status = 'accepted' then p.phone end,
         i.created_at, i.decided_at
    from investor_interests i
    join lands l on l.id = i.land_id
    left join profiles p on p.id = l.owner_id
   where i.investor_id = auth.uid()
   order by i.created_at desc
   limit 200;
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- الصلاحيات
-- ═══════════════════════════════════════════════════════════════════════════

revoke execute on function public.land_set_investor_consent(uuid, boolean, text[], text, text) from public, anon;
revoke execute on function public.land_investor_decide(uuid, boolean) from public, anon;
revoke execute on function public.land_investor_requests() from public, anon;
revoke execute on function public.investor_open_lands() from public, anon;
revoke execute on function public.investor_express_interest(uuid, text, text) from public, anon;
revoke execute on function public.investor_interest_withdraw(uuid) from public, anon;
revoke execute on function public.investor_my_interests() from public, anon;

grant execute on function public.land_set_investor_consent(uuid, boolean, text[], text, text) to authenticated;
grant execute on function public.land_investor_decide(uuid, boolean) to authenticated;
grant execute on function public.land_investor_requests() to authenticated;
-- The list is for everyone, signed in or not: it carries nothing that names
-- the owner or places the land, and an investor looks before signing up.
grant execute on function public.investor_open_lands() to anon, authenticated;
grant execute on function public.investor_express_interest(uuid, text, text) to authenticated;
grant execute on function public.investor_interest_withdraw(uuid) to authenticated;
grant execute on function public.investor_my_interests() to authenticated;
