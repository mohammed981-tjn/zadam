-- ═══════════════════════════════════════════════════════════════════════════
-- إيجار الجرّار: «آخر تأكيدٍ للتوفّر»، ثمّ الحجز الجماعيّ (البند ١٦٨)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- من الغنيمة ٥ في docs/studies/spoils-konoz-hawasha-ar.md: الوقود شحيح والجرّار يُستأجر لا يُشترى، وHello Tractor لا
-- يُرسل جرّاره إلا إذا اجتمع ما يكفي من الأرض في رقعةٍ صغيرة. فعلى الخدمات التعاقديّة القائمة، لا بجانبها:
--
--   ١) **التوفّر بتاريخه.** مقدّم الميكنة يقول «أنا متوفّر» أو «لست متوفّراً»، ويُختم القول بلحظة قوله لا بتاريخٍ
--      يكتبه (الزناد يكتب now() مهما أُرسل). والقائمة تُظهر «آخر تأكيدٍ للتوفّر»، وما مضى عليه أكثر من ١٤ يوماً
--      قديمٌ لا يُفتح عليه حجزٌ جديد حتى يؤكّد من جديد.
--
--   ٢) **الحجز الجماعيّ.** مزارعٌ يفتح حجزاً على خدمة ميكنةٍ لمقدّمٍ موثّق، فيُعرض على من في **ولايته ومحليّته** —
--      مأخوذتين من الأرض المربوطة بموسمه، لا مكتوبتين — فينضمّون بمواسمهم وكمّيّاتهم. وكلّ منضمٍّ يعرض في اللحظة
--      نفسها **عقد خدمةٍ عاديّاً** على مقدّم الخدمة (هو العميل، بسعر الكتالوج يوم فُتح الحجز، بمرحلةٍ واحدة)، فلا
--      يحتاج الحجز آلةً عقودٍ ثانية. فإذا بلغ المجموع الحدّ الأدنى للخدمة أرسله المنظّم، فإن قبل مقدّم الخدمة صارت
--      العقود كلّها سارية معاً، وإن رفض أُلغيت معاً. ولا يُقبل عقدٌ من حجزٍ وحده، ولا يُعاد مسودّةً تُعدَّل.
--
-- ولا مال في المنصّة (الدفع خارجها كما في كلّ مكان)، ولا هاتف: الحجز يحمل اسماً معروضاً وكمّيّة، ويُرفض اسمٌ فيه
-- رقمٌ طويل. وكلّ القراءة والكتابة بدوالّ؛ الجدولان لا يُقرآن ولا يُكتبان مباشرةً لأحد.

-- ── ١) التوفّر ───────────────────────────────────────────────────────────────

alter table public.service_providers
  add column available boolean not null default false,
  add column availability_confirmed_at timestamptz;

comment on column public.service_providers.available is
  'مقدّم الميكنة متوفّرٌ الآن لعملٍ جديد، بقوله هو. لغير الميكنة يبقى false.';
comment on column public.service_providers.availability_confirmed_at is
  'لحظة آخر تأكيدٍ للتوفّر أو عدمه. يكتبها الزناد now()، لا يكتبها أحد.';

-- How long a confirmation stays good for a new booking.
create function public.machinery_fresh_days()
returns integer
language sql
immutable
set search_path = public
as $$ select 14 $$;

create function public.providers_availability_stamp()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if new.available and new.kind <> 'mechanization' then
      raise exception 'التوفّر لمقدّمي الميكنة والجرّارات وحدهم';
    end if;
    new.availability_confirmed_at := case when new.available then now() end;
    return new;
  end if;
  if new.available is distinct from old.available
     or new.availability_confirmed_at is distinct from old.availability_confirmed_at then
    if new.available and new.kind <> 'mechanization' then
      raise exception 'التوفّر لمقدّمي الميكنة والجرّارات وحدهم';
    end if;
    -- The moment of saying it, whatever was sent.
    new.availability_confirmed_at := now();
  end if;
  return new;
end $$;

create trigger service_providers_availability_stamp
  before insert or update on public.service_providers
  for each row execute function public.providers_availability_stamp();

-- Visitors read the listing's columns one by one (20261022050000); the two new ones are part of the listing.
grant select (available, availability_confirmed_at) on public.service_providers to anon;

create function public.provider_confirm_availability(p_provider uuid, p_available boolean)
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  p public.service_providers;
begin
  if auth.uid() is null then raise exception 'سجّل الدخول أولاً.'; end if;
  select * into p from public.service_providers where id = p_provider for update;
  if not found or p.owner_id <> auth.uid() then raise exception 'ليست هذه جهتك.'; end if;
  if p.kind <> 'mechanization' then raise exception 'التوفّر لمقدّمي الميكنة والجرّارات وحدهم'; end if;
  update public.service_providers
     set available = coalesce(p_available, false), availability_confirmed_at = now()
   where id = p_provider
  returning availability_confirmed_at into p.availability_confirmed_at;
  return p.availability_confirmed_at;
end $$;

-- ── ٢) الحجز الجماعيّ ────────────────────────────────────────────────────────

create table public.machinery_bookings (
  id            uuid primary key default gen_random_uuid(),
  provider_id   uuid not null references public.service_providers(id) on delete restrict,
  service_id    uuid not null references public.services(id) on delete restrict,
  organiser_id  uuid not null references auth.users(id) on delete restrict,
  state         text not null,
  locality      text not null,
  window_from   date not null,
  window_to     date not null,
  -- The catalogue's terms on the day the booking opened: what every member's contract carries.
  service_title text not null,
  unit          public.service_unit not null,
  unit_price    numeric(14,2) not null check (unit_price >= 0),
  min_units     numeric(12,2) not null check (min_units > 0),
  status        text not null default 'open'
                check (status in ('open', 'requested', 'accepted', 'declined', 'cancelled')),
  decided_at    timestamptz,
  decline_reason text check (decline_reason is null or length(decline_reason) between 3 and 300),
  created_at    timestamptz not null default now(),
  constraint machinery_bookings_window check (window_to >= window_from and window_to - window_from <= 60),
  constraint machinery_bookings_decided check ((status in ('accepted', 'declined')) = (decided_at is not null))
);

create index machinery_bookings_open on public.machinery_bookings (state, locality) where status = 'open';
create index machinery_bookings_provider on public.machinery_bookings (provider_id, status);

create table public.machinery_booking_members (
  id           uuid primary key default gen_random_uuid(),
  booking_id   uuid not null references public.machinery_bookings(id) on delete restrict,
  member_id    uuid not null references auth.users(id) on delete restrict,
  season_id    uuid not null references public.seasons(id) on delete restrict,
  quantity     numeric(12,2) not null check (quantity > 0),
  display_name text not null check (length(btrim(display_name)) between 2 and 60),
  contract_id  uuid not null unique references public.service_contracts(id) on delete restrict,
  joined_at    timestamptz not null default now(),
  left_at      timestamptz
);

create unique index machinery_booking_members_once
  on public.machinery_booking_members (booking_id, member_id) where left_at is null;

alter table public.service_contracts
  add column booking_id uuid references public.machinery_bookings(id) on delete restrict;

comment on column public.service_contracts.booking_id is
  'الحجز الجماعيّ الذي وُلد منه العقد. يُقبل مع الحجز كلّه، ولا يُعاد مسودّة.';

alter table public.machinery_bookings enable row level security;
alter table public.machinery_booking_members enable row level security;
-- Nobody reads or writes these directly; the functions below are the only way in and out.
revoke all on table public.machinery_bookings, public.machinery_booking_members from anon, authenticated, service_role;

-- A contract born of a booking: made only by the booking functions, accepted only with the whole booking, and never
-- pulled back to a draft whose price could then be edited before it is offered again.
create function public.service_contracts_booking_gate()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if new.booking_id is not null
       and coalesce(current_setting('app.machinery_booking', true), '') <> new.booking_id::text then
      raise exception 'عقد الحجز الجماعيّ يُنشأ من الحجز نفسه';
    end if;
    return new;
  end if;
  if new.booking_id is distinct from old.booking_id then
    raise exception 'لا يُنقل عقدٌ إلى حجزٍ آخر أو منه';
  end if;
  if old.booking_id is null or new.status is not distinct from old.status then
    return new;
  end if;
  if new.status = 'draft' then
    raise exception 'عقد الحجز الجماعيّ لا يُعاد مسودّة؛ انسحب من الحجز بدلاً من ذلك';
  end if;
  if new.status = 'active'
     and not exists (select 1 from public.machinery_bookings b where b.id = old.booking_id and b.status = 'accepted') then
    raise exception 'عقد الحجز الجماعيّ يُقبل مع الحجز كلّه، من صفحة الحجز';
  end if;
  return new;
end $$;

create trigger service_contracts_booking_gate
  before insert or update on public.service_contracts
  for each row execute function public.service_contracts_booking_gate();

-- ── المساعدات ────────────────────────────────────────────────────────────────

-- A name shown to the organiser and the provider: no phone number hidden in it.
create function public._machinery_name(p_name text)
returns text
language plpgsql
immutable
set search_path = public
as $$
declare
  v text := btrim(coalesce(p_name, ''));
  digits text;
begin
  if length(v) not between 2 and 60 then
    raise exception 'اكتب اسماً يعرفك به المنظّم ومقدّم الخدمة (من حرفين إلى ٦٠)';
  end if;
  digits := regexp_replace(translate(v, '٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹', '01234567890123456789'), '[^0-9]', '', 'g');
  if length(digits) >= 6 then
    raise exception 'لا أرقام هواتف في الاسم: يصلك مقدّم الخدمة بعد قبول الحجز';
  end if;
  return v;
end $$;

-- The provider can take a new booking: verified, listed, a mechanisation outfit, and said so recently.
create function public._machinery_provider_ready(p_provider uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.service_providers p
     where p.id = p_provider and p.kind = 'mechanization'
       and p.verified_at is not null and p.active and not p.paused_by_owner
       and p.available
       and p.availability_confirmed_at >= now() - make_interval(days => public.machinery_fresh_days()))
$$;

-- The members who still count: not left, and their contract still offered or in force.
create function public._machinery_active(p_booking uuid)
returns table (member_id uuid, quantity numeric, contract_id uuid, display_name text, joined_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select m.member_id, m.quantity, m.contract_id, m.display_name, m.joined_at
    from public.machinery_booking_members m
    join public.service_contracts c on c.id = m.contract_id
   where m.booking_id = p_booking and m.left_at is null and c.status in ('proposed', 'active')
   order by m.joined_at
$$;

-- One member in: their own contract with the provider, offered at once at the booking's terms.
create function public._machinery_add_member(p_booking uuid, p_season uuid, p_quantity numeric, p_name text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  b    public.machinery_bookings;
  s    public.seasons;
  l    public.lands;
  me   uuid := auth.uid();
  v_c  uuid;
begin
  select * into b from public.machinery_bookings where id = p_booking for update;
  select * into s from public.seasons where id = p_season;
  if not found or s.owner_id <> me then raise exception 'اختر موسماً من مواسمك.'; end if;
  if s.status = 'completed' then raise exception 'هذا الموسم أُقفل.'; end if;
  if s.land_id is null then
    raise exception 'اربط موسمك بأرضك المسجّلة أولاً: منها تُعرف المحليّة التي يجتمع فيها الحجز.';
  end if;
  select * into l from public.lands where id = s.land_id;
  if not found or l.locality is null
     or lower(btrim(l.state)) <> lower(btrim(b.state)) or lower(btrim(l.locality)) <> lower(btrim(b.locality)) then
    raise exception 'هذا الحجز لمن أرضه في % — %.', b.locality, b.state;
  end if;
  if p_quantity is null or p_quantity <= 0 then raise exception 'اكتب الكمّيّة.'; end if;
  if b.unit = 'feddan' and p_quantity > s.feddans then
    raise exception 'الكمّيّة أكبر من مساحة موسمك (% فدان).', s.feddans;
  end if;
  -- Someone who left (or whose offer was cancelled from the contract page) may come back.
  update public.machinery_booking_members m set left_at = now()
   where m.booking_id = p_booking and m.member_id = me and m.left_at is null
     and not exists (select 1 from public.service_contracts c where c.id = m.contract_id and c.status in ('proposed', 'active'));
  if exists (select 1 from public.machinery_booking_members where booking_id = p_booking and member_id = me and left_at is null) then
    raise exception 'أنت في هذا الحجز من قبل.';
  end if;
  if (select count(*) from public._machinery_active(p_booking)) >= 50 then
    raise exception 'اكتمل عدد هذا الحجز (٥٠ مزارعاً)؛ افتح حجزاً آخر.';
  end if;

  perform set_config('app.machinery_booking', p_booking::text, true);
  insert into public.service_contracts (season_id, provider_id, client_id, title, status, booking_id)
  values (s.id, b.provider_id, me, left('حجز جماعيّ: ' || b.service_title, 160), 'draft', p_booking)
  returning id into v_c;
  perform set_config('app.machinery_booking', '', true);

  insert into public.contract_milestones (contract_id, seq, title, service_id, unit, quantity, unit_price,
                                          planned_start, planned_end, feasibility)
  values (v_c, 1, b.service_title, b.service_id, b.unit, p_quantity, b.unit_price, b.window_from, b.window_to,
          jsonb_build_object('basis', 'group_booking', 'booking', p_booking));

  -- The member offers it, as any client offers a contract (the status gate checks that it is the client).
  update public.service_contracts set status = 'proposed' where id = v_c;

  insert into public.machinery_booking_members (booking_id, member_id, season_id, quantity, display_name, contract_id)
  values (p_booking, me, s.id, p_quantity, public._machinery_name(p_name), v_c);
  return v_c;
end $$;

-- ── ما يفعله الناس ──────────────────────────────────────────────────────────

create function public.machinery_booking_open(
  p_service  uuid,
  p_season   uuid,
  p_quantity numeric,
  p_from     date,
  p_to       date,
  p_name     text
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  me  uuid := auth.uid();
  sv  public.services;
  pr  public.service_providers;
  s   public.seasons;
  l   public.lands;
  v_b uuid;
begin
  if me is null then raise exception 'سجّل الدخول أولاً.'; end if;
  select * into sv from public.services where id = p_service;
  if not found or not sv.active then raise exception 'هذه الخدمة غير معروضة.'; end if;
  select * into pr from public.service_providers where id = sv.provider_id;
  if pr.owner_id = me then raise exception 'لا تحجز من جهتك.'; end if;
  if not public._machinery_provider_ready(pr.id) then
    raise exception 'لم يؤكّد مقدّم الخدمة توفّره خلال آخر % يوماً؛ لا يُفتح عليه حجزٌ حتى يؤكّد.', public.machinery_fresh_days();
  end if;
  select * into s from public.seasons where id = p_season;
  if not found or s.owner_id <> me then raise exception 'اختر موسماً من مواسمك.'; end if;
  if s.land_id is null then
    raise exception 'اربط موسمك بأرضك المسجّلة أولاً: منها تُعرف المحليّة التي يجتمع فيها الحجز.';
  end if;
  select * into l from public.lands where id = s.land_id;
  if not found or l.locality is null or btrim(l.locality) = '' then
    raise exception 'أرض موسمك بلا محليّة؛ أكملها في صفحة الأرض.';
  end if;
  if p_from is null or p_to is null or p_from < current_date + sv.lead_time_days then
    raise exception 'أقرب موعدٍ لهذه الخدمة بعد % يوماً من اليوم.', sv.lead_time_days;
  end if;
  if p_to < p_from or p_to - p_from > 60 then
    raise exception 'المدّة من يومٍ إلى ستّين يوماً.';
  end if;

  insert into public.machinery_bookings (provider_id, service_id, organiser_id, state, locality, window_from, window_to,
                                         service_title, unit, unit_price, min_units)
  values (pr.id, sv.id, me, btrim(l.state), btrim(l.locality), p_from, p_to, sv.title, sv.unit, sv.price_per_unit, sv.min_units)
  returning id into v_b;
  perform public._machinery_add_member(v_b, p_season, p_quantity, p_name);
  return v_b;
end $$;

create function public.machinery_booking_join(p_booking uuid, p_season uuid, p_quantity numeric, p_name text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  b public.machinery_bookings;
begin
  if auth.uid() is null then raise exception 'سجّل الدخول أولاً.'; end if;
  select * into b from public.machinery_bookings where id = p_booking;
  if not found then raise exception 'لا حجز بهذا المعرّف.'; end if;
  if b.status <> 'open' then raise exception 'هذا الحجز لم يعد مفتوحاً للانضمام.'; end if;
  if exists (select 1 from public.service_providers where id = b.provider_id and owner_id = auth.uid()) then
    raise exception 'لا تنضمّ إلى حجزٍ على جهتك.';
  end if;
  if not public._machinery_provider_ready(b.provider_id) then
    raise exception 'لم يؤكّد مقدّم الخدمة توفّره خلال آخر % يوماً؛ لا انضمام حتى يؤكّد.', public.machinery_fresh_days();
  end if;
  return public._machinery_add_member(p_booking, p_season, p_quantity, p_name);
end $$;

create function public.machinery_booking_leave(p_booking uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  b  public.machinery_bookings;
  m  public.machinery_booking_members;
  v_next uuid;
begin
  if me is null then raise exception 'سجّل الدخول أولاً.'; end if;
  select * into b from public.machinery_bookings where id = p_booking for update;
  if not found then raise exception 'لا حجز بهذا المعرّف.'; end if;
  if b.status not in ('open', 'requested') then raise exception 'بُتّ في هذا الحجز؛ العقد الآن في صفحة العقود.'; end if;
  select * into m from public.machinery_booking_members
   where booking_id = p_booking and member_id = me and left_at is null;
  if not found then raise exception 'لست في هذا الحجز.'; end if;

  -- The client withdraws their own offer, as on the contract page.
  update public.service_contracts set status = 'cancelled' where id = m.contract_id and status = 'proposed';
  update public.machinery_booking_members set left_at = now() where id = m.id;

  if b.organiser_id = me then
    select a.member_id into v_next from public._machinery_active(p_booking) a limit 1;
    if v_next is null then
      update public.machinery_bookings set status = 'cancelled' where id = p_booking;
    else
      update public.machinery_bookings set organiser_id = v_next where id = p_booking;
    end if;
  end if;
end $$;

create function public.machinery_booking_request(p_booking uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  b public.machinery_bookings;
  v_total numeric;
begin
  if auth.uid() is null then raise exception 'سجّل الدخول أولاً.'; end if;
  select * into b from public.machinery_bookings where id = p_booking for update;
  if not found or b.organiser_id <> auth.uid() then raise exception 'إرسال الحجز للمنظّم وحده.'; end if;
  if b.status <> 'open' then raise exception 'أُرسل هذا الحجز أو بُتّ فيه.'; end if;
  select coalesce(sum(quantity), 0) into v_total from public._machinery_active(p_booking);
  if v_total < b.min_units then
    raise exception 'المجموع % ولا يُرسل الحجز قبل أن يبلغ %، الحدّ الأدنى لهذه الخدمة.', v_total, b.min_units;
  end if;
  update public.machinery_bookings set status = 'requested' where id = p_booking;
end $$;

-- The provider decides for the whole booking: every member's contract comes into force together, or none does.
create function public.machinery_booking_decide(p_booking uuid, p_accept boolean, p_reason text default null)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  b public.machinery_bookings;
  r record;
  n integer := 0;
begin
  if auth.uid() is null then raise exception 'سجّل الدخول أولاً.'; end if;
  select * into b from public.machinery_bookings where id = p_booking for update;
  if not found or not exists (select 1 from public.service_providers where id = b.provider_id and owner_id = auth.uid()) then
    raise exception 'القرار لمقدّم الخدمة وحده.';
  end if;
  if b.status <> 'requested' then raise exception 'هذا الحجز ليس بانتظار قرارك.'; end if;

  if p_accept then
    update public.machinery_bookings set status = 'accepted', decided_at = now() where id = p_booking;
    for r in select contract_id from public._machinery_active(p_booking) loop
      -- The provider signs, as on the contract page; the booking gate lets it through now that the booking is accepted.
      update public.service_contracts set status = 'active' where id = r.contract_id and status = 'proposed';
      n := n + 1;
    end loop;
  else
    if length(btrim(coalesce(p_reason, ''))) not between 3 and 300 then
      raise exception 'اكتب سبب الاعتذار (٣ أحرفٍ فأكثر): يقرؤه المزارعون.';
    end if;
    update public.machinery_bookings set status = 'declined', decided_at = now(), decline_reason = btrim(p_reason)
     where id = p_booking;
    for r in select contract_id from public._machinery_active(p_booking) loop
      update public.service_contracts set status = 'cancelled' where id = r.contract_id and status = 'proposed';
      n := n + 1;
    end loop;
  end if;
  return n;
end $$;

-- ── القراءة ──────────────────────────────────────────────────────────────────

-- What a signed-in person sees: every open booking (to join it), and every booking they are in, organise or provide.
create function public.machinery_bookings_list()
returns table (
  id             uuid,
  provider_id    uuid,
  provider_name  text,
  service_title  text,
  unit           public.service_unit,
  unit_price     numeric,
  min_units      numeric,
  state          text,
  locality       text,
  window_from    date,
  window_to      date,
  status         text,
  decline_reason text,
  members        integer,
  total          numeric,
  my_quantity    numeric,
  is_organiser   boolean,
  is_provider    boolean,
  created_at     timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  -- A member who has not left sees the booking whatever became of it (a declined one, with its reason); what they
  -- still have in it is what their offer still stands for.
  with mine as (
    select m.booking_id,
           sum(m.quantity) filter (where c.status in ('proposed', 'active')) as q
      from public.machinery_booking_members m
      join public.service_contracts c on c.id = m.contract_id
     where m.member_id = auth.uid() and m.left_at is null
     group by m.booking_id
  )
  select b.id, b.provider_id, p.name, b.service_title, b.unit, b.unit_price, b.min_units, b.state, b.locality,
         b.window_from, b.window_to, b.status, b.decline_reason,
         (select count(*)::integer from public._machinery_active(b.id)),
         (select coalesce(sum(a.quantity), 0) from public._machinery_active(b.id) a),
         mine.q,
         b.organiser_id = auth.uid(),
         p.owner_id = auth.uid(),
         b.created_at
    from public.machinery_bookings b
    join public.service_providers p on p.id = b.provider_id
    left join mine on mine.booking_id = b.id
   where auth.uid() is not null
     and (b.status = 'open' or mine.booking_id is not null or b.organiser_id = auth.uid() or p.owner_id = auth.uid() or is_admin())
   order by b.created_at desc
   limit 200
$$;

-- Who is in a booking, by the name each gave and the quantity: for its organiser, for the provider once it is sent to
-- them, and for the administrators. No phone, and no season: those reach the provider through the contract on acceptance.
create function public.machinery_booking_members(p_booking uuid)
returns table (display_name text, quantity numeric, joined_at timestamptz)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  b public.machinery_bookings;
begin
  select * into b from public.machinery_bookings where id = p_booking;
  if not found then return; end if;
  if not (b.organiser_id = auth.uid()
          or is_admin()
          or (b.status <> 'open' and exists (select 1 from public.service_providers p
                                               where p.id = b.provider_id and p.owner_id = auth.uid()))) then
    return;
  end if;
  return query select a.display_name, a.quantity, a.joined_at from public._machinery_active(p_booking) a;
end $$;

-- ── من ينادي ماذا ───────────────────────────────────────────────────────────

revoke execute on function
  public.providers_availability_stamp(), public.service_contracts_booking_gate(),
  public._machinery_name(text), public._machinery_provider_ready(uuid), public._machinery_active(uuid),
  public._machinery_add_member(uuid, uuid, numeric, text)
  from public, anon, authenticated, service_role;

revoke execute on function
  public.provider_confirm_availability(uuid, boolean),
  public.machinery_booking_open(uuid, uuid, numeric, date, date, text),
  public.machinery_booking_join(uuid, uuid, numeric, text),
  public.machinery_booking_leave(uuid),
  public.machinery_booking_request(uuid),
  public.machinery_booking_decide(uuid, boolean, text),
  public.machinery_bookings_list(),
  public.machinery_booking_members(uuid)
  from public, anon, service_role;

grant execute on function
  public.provider_confirm_availability(uuid, boolean),
  public.machinery_booking_open(uuid, uuid, numeric, date, date, text),
  public.machinery_booking_join(uuid, uuid, numeric, text),
  public.machinery_booking_leave(uuid),
  public.machinery_booking_request(uuid),
  public.machinery_booking_decide(uuid, boolean, text),
  public.machinery_bookings_list(),
  public.machinery_booking_members(uuid)
  to authenticated;
