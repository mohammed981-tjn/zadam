-- العقد الآجل بين المشتري والمزارع (البند ١٧٠، الغنيمة ٨ من Mozare3).
--
-- يتّفقان قبل الزرع أو أثناءه على محصولٍ ودرجةٍ وكميّةٍ وسعرٍ للوحدة وموعدِ تسليمٍ ومكانه وشروطِ الدفع، فيعرف المزارع
-- سعره قبل أن يحصد، ويعرف المشتري من أين تأتيه بضاعته. والمنصّة تكتب العقد وتحفظ توقيعيه وما جرى عليه بعدهما، ولا
-- تحمل مالاً ولا تضمن تسليماً: الدفع بين الطرفين مباشرةً كما كتبا، كما في عروض السوق وعقود الشراكة.
--
-- المسار:
--   يقترحه أحدهما على الآخر برقم جوّاله (أو من عرضٍ في السوق) → يوقّعه الآخر أو يعتذر، ويسحبه المقترح قبل ذلك؛
--   بعد التوقيع: يسجّل المشتري ما استلم (الكميّة والتاريخ وهل طابقت الدرجة) → يؤكّده المزارع فيُقفل العقد، أو ينازع؛
--   وفي أيّ وقتٍ بعد التوقيع: يطلب أحدهما الإلغاء فيقبله الآخر أو يرفضه، أو يرفع نزاعاً تفصل فيه الإدارة.
-- لا يلغي أحدٌ عقداً موقّعاً وحده، ولا تتغيّر شروطه بعد اقتراحها (يُسحب ويُقترح من جديد)، وكلّ خطوةٍ في سجلٍّ لا يُعدَّل.
--
-- والشرط الجزائيّ (قرار المالك، 26 أكتوبر 2026: «نعم»): من شروط العقد، بنسبٍ يتّفقان عليها في حدود سقفٍ معقول —
-- غرامة تأخيرٍ عن كلّ أسبوعٍ بعد آخر موعد التسليم حتى سقفها، وغرامة إخلالٍ على من يمتنع عن التسليم أو الاستلام —
-- وتُعفى القوّة القاهرة (حربٌ، أو سيلٌ، أو جراد، أو إغلاقُ طريق) إن اختاراها. لا تحسبها المنصّة ولا تحصّلها: تفصل الإدارة
-- في النزاع فتكتب المبلغ ومن يدفعه في السجلّ، ويدفعه الطرف للآخر مباشرةً.
--
-- ومنه «اشترِ لأهلك» (البند ١٧٢، الغنيمة ١٠ من CrowdFarming): المغترب يشتري حصاد مزارعٍ قريبٍ من أهله ويُسلَّم إليهم،
-- فيكتب في العقد من يستلم (اسمه وجوّاله). شراءٌ لا عائد، والدفع بين المغترب والمزارع خارج المنصّة كأيّ عقدٍ آجل.

-- ── نوع الإشعار ─────────────────────────────────────────────────────────────

do $$
declare v_def text;
begin
  select pg_get_constraintdef(oid) into v_def
    from pg_constraint
   where conname = 'notifications_kind_check' and conrelid = 'public.notifications'::regclass;
  -- The production check lists every kind; one written another way (the gates' base schema) is left alone.
  if v_def like '%ARRAY[%' and v_def not like '%forward_contract%' then
    execute 'alter table public.notifications drop constraint notifications_kind_check';
    execute 'alter table public.notifications add constraint notifications_kind_check '
         || regexp_replace(v_def, '\]\)\)\)\s*$', ', ''forward_contract''::text])))');
    select pg_get_constraintdef(oid) into v_def
      from pg_constraint
     where conname = 'notifications_kind_check' and conrelid = 'public.notifications'::regclass;
    if v_def not like '%forward_contract%' then
      raise exception 'لم يُضَف نوع الإشعار forward_contract';
    end if;
  end if;
end $$;

-- The last nine digits of a Sudanese number are the number (also in 20261026020000_agent_mandates).
create or replace function public.phone_key(p text)
returns text
language sql
immutable
as $$
  select nullif(right(regexp_replace(coalesce(p, ''), '\D', '', 'g'), 9), '')
$$;

create function public.forward_unit_ar(p text)
returns text
language sql
immutable
as $$
  select case p when 'qintar' then 'قنطار' when 'ardeb' then 'أردب' when 'sack' then 'جوال' when 'ton' then 'طن'
                else 'كيلوغرام' end
$$;

-- ── العقد ───────────────────────────────────────────────────────────────────

create table public.forward_contracts (
  id                  uuid primary key default gen_random_uuid(),
  ref                 text not null unique
                      default 'FC-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8)),
  buyer_id            uuid not null references auth.users(id) on delete restrict,
  farmer_id           uuid not null references auth.users(id) on delete restrict,
  proposed_by         uuid not null references auth.users(id) on delete restrict,
  -- آخر أربعة أرقامٍ من جوّال الطرف الآخر كما كتبه المقترح، ليعرف أيّ عقدٍ هذا قبل أن يُوقَّع.
  phone_tail          text not null check (phone_tail ~ '^[0-9]{4}$'),

  -- الشروط: تُكتب مرّةً عند الاقتراح ولا تتغيّر.
  crop                text not null check (length(btrim(crop)) between 2 and 60),
  grade               text not null check (length(btrim(grade)) between 5 and 300),
  quantity            numeric(12,2) not null check (quantity > 0 and quantity <= 1000000),
  unit                text not null check (unit in ('qintar', 'ardeb', 'sack', 'ton', 'kg')),
  -- كم تزيد الكميّة المسلَّمة أو تنقص ولا يُعدّ ذلك إخلالاً.
  tolerance_percent   numeric(4,1) not null default 5 check (tolerance_percent between 0 and 20),
  price               numeric(16,2) not null check (price > 0),
  currency            text not null check (currency in ('SDG', 'USD')),
  delivery_from       date not null,
  delivery_to         date not null,
  delivery_place      text not null check (length(btrim(delivery_place)) between 3 and 200),
  payment_terms       text not null check (length(btrim(payment_terms)) between 5 and 500),
  -- ما يدفعه المشتري مقدّماً للمزارع مباشرةً، إن اتّفقا؛ المنصّة لا تمسّه.
  advance_percent     numeric(4,1) check (advance_percent is null or advance_percent between 0 and 100),
  -- الشرط الجزائيّ: نسبٌ من قيمة العقد.
  late_penalty_pct_week numeric(4,1) not null default 1 check (late_penalty_pct_week between 0 and 5),
  late_penalty_cap_pct  numeric(4,1) not null default 10 check (late_penalty_cap_pct between 0 and 30),
  breach_penalty_pct    numeric(4,1) not null default 10 check (breach_penalty_pct between 0 and 30),
  force_majeure         boolean not null default true,
  -- ما حكمت به الإدارة في نزاع، ومن يدفعه للآخر.
  penalty_awarded     numeric(16,2) check (penalty_awarded is null or penalty_awarded > 0),
  penalty_payer       text check (penalty_payer is null or penalty_payer in ('buyer', 'farmer')),
  notes               text check (notes is null or length(btrim(notes)) between 2 and 1000),
  season_id           uuid references public.seasons(id) on delete set null,
  offer_id            uuid references public.market_offers(id) on delete set null,
  -- من يستلم عن المشتري، حين يشتري لأهله (البند ١٧٢). يكتبه المشتري وحده، وهو من الشروط.
  consignee_name      text check (consignee_name is null or length(btrim(consignee_name)) between 2 and 120),
  consignee_phone     text check (consignee_phone is null or consignee_phone ~ '^\+?[0-9]{7,15}$'),

  status              text not null default 'proposed'
                      check (status in ('proposed', 'declined', 'withdrawn', 'signed', 'delivered', 'completed',
                                        'cancel_requested', 'cancelled', 'disputed')),
  proposed_at         timestamptz not null default now(),
  signed_at           timestamptz,

  -- التسليم كما سجّله المشتري.
  delivered_quantity  numeric(12,2) check (delivered_quantity is null or delivered_quantity >= 0),
  delivered_on        date,
  grade_met           boolean,
  delivery_note       text check (delivery_note is null or length(btrim(delivery_note)) between 2 and 500),

  cancel_requested_by uuid references auth.users(id),
  -- الحال قبل النزاع أو طلب الإلغاء، يعود إليها العقد إن رُفض الطلب.
  status_before       text check (status_before is null or status_before in ('signed', 'delivered')),
  closed_at           timestamptz,
  updated_at          timestamptz not null default now(),

  check (buyer_id <> farmer_id),
  check (proposed_by in (buyer_id, farmer_id)),
  check ((consignee_name is null) = (consignee_phone is null)),
  check ((penalty_awarded is null) = (penalty_payer is null)),
  check (consignee_name is null or proposed_by = buyer_id),
  check (delivery_to >= delivery_from),
  check ((signed_at is null) = (status in ('proposed', 'declined', 'withdrawn'))),
  check ((delivered_on is null) = (delivered_quantity is null)),
  check ((closed_at is not null) = (status in ('declined', 'withdrawn', 'completed', 'cancelled')))
);

create index forward_contracts_buyer on public.forward_contracts (buyer_id, proposed_at desc);
create index forward_contracts_farmer on public.forward_contracts (farmer_id, proposed_at desc);
create index forward_contracts_open on public.forward_contracts (status) where status = 'disputed';

alter table public.forward_contracts enable row level security;
revoke all on public.forward_contracts from anon;
revoke insert, update, delete, truncate on public.forward_contracts from authenticated;

create policy forward_contracts_parties on public.forward_contracts
  for select to authenticated
  using (buyer_id = auth.uid() or farmer_id = auth.uid() or is_admin());

-- Terms are written once. The functions below never touch them; this keeps it so if one is ever written wrong.
create function public.forward_contract_terms_fixed()
returns trigger
language plpgsql
as $$
begin
  if (new.buyer_id, new.farmer_id, new.proposed_by, new.crop, new.grade, new.quantity, new.unit, new.tolerance_percent,
      new.price, new.currency, new.delivery_from, new.delivery_to, new.delivery_place, new.payment_terms,
      new.advance_percent, new.notes, new.season_id, new.offer_id, new.consignee_name, new.consignee_phone,
      new.late_penalty_pct_week, new.late_penalty_cap_pct, new.breach_penalty_pct, new.force_majeure,
      new.proposed_at, new.ref)
     is distinct from
     (old.buyer_id, old.farmer_id, old.proposed_by, old.crop, old.grade, old.quantity, old.unit, old.tolerance_percent,
      old.price, old.currency, old.delivery_from, old.delivery_to, old.delivery_place, old.payment_terms,
      old.advance_percent, old.notes, old.season_id, old.offer_id, old.consignee_name, old.consignee_phone,
      old.late_penalty_pct_week, old.late_penalty_cap_pct, old.breach_penalty_pct, old.force_majeure,
      old.proposed_at, old.ref) then
    raise exception 'شروط العقد لا تتغيّر بعد اقتراحها: اسحبه واقترح غيره.';
  end if;
  new.updated_at := now();
  return new;
end $$;

create trigger forward_contract_terms_fixed
  before update on public.forward_contracts
  for each row execute function public.forward_contract_terms_fixed();

create function public.forward_contract_no_delete()
returns trigger
language plpgsql
as $$
begin
  raise exception 'العقد يبقى ولا يُحذف.';
end $$;

create trigger forward_contract_no_delete
  before delete on public.forward_contracts
  for each row execute function public.forward_contract_no_delete();

-- ── سجلّ ما جرى ─────────────────────────────────────────────────────────────

create table public.forward_contract_events (
  id           bigint generated always as identity primary key,
  contract_id  uuid not null references public.forward_contracts(id) on delete restrict,
  actor_id     uuid references auth.users(id),
  event        text not null check (event in ('proposed', 'signed', 'declined', 'withdrawn', 'delivered', 'completed',
                                              'cancel_requested', 'cancel_refused', 'cancelled', 'disputed', 'resolved')),
  note         text check (note is null or length(note) <= 1000),
  at           timestamptz not null default now()
);

create index forward_contract_events_contract on public.forward_contract_events (contract_id, id);

alter table public.forward_contract_events enable row level security;
revoke all on public.forward_contract_events from anon;
revoke insert, update, delete, truncate on public.forward_contract_events from authenticated;

create policy forward_contract_events_parties on public.forward_contract_events
  for select to authenticated
  using (exists (select 1 from public.forward_contracts c
                  where c.id = contract_id and (c.buyer_id = auth.uid() or c.farmer_id = auth.uid() or is_admin())));

create function public.forward_contract_events_keep()
returns trigger
language plpgsql
as $$
begin
  raise exception 'سجلّ العقد يُلحَق ولا يُعدَّل.';
end $$;

create trigger forward_contract_events_keep
  before update or delete on public.forward_contract_events
  for each row execute function public.forward_contract_events_keep();

-- ── أدوات ───────────────────────────────────────────────────────────────────

-- The contract as the caller may act on it, locked, or an error in words.
create function public.forward_contract_lock(p_id uuid)
returns public.forward_contracts
language plpgsql
security definer
set search_path = public
as $$
declare c forward_contracts%rowtype;
begin
  select * into c from forward_contracts where id = p_id for update;
  if not found or auth.uid() is null or auth.uid() not in (c.buyer_id, c.farmer_id) then
    raise exception 'لا عقد بهذا.';
  end if;
  return c;
end $$;

-- One step: the event, and a word to the other side.
create function public.forward_contract_step(
  c public.forward_contracts, p_event text, p_note text, p_title text, p_body text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_other uuid := case when auth.uid() = c.buyer_id then c.farmer_id else c.buyer_id end;
begin
  insert into forward_contract_events (contract_id, actor_id, event, note) values (c.id, auth.uid(), p_event, p_note);
  perform public.notify_user(v_other, 'forward_contract', p_title || ' (' || c.ref || ')', p_body,
                             '/market/forward/' || c.id);
end $$;

revoke execute on function public.forward_contract_lock(uuid) from public, anon, authenticated;
revoke execute on function public.forward_contract_step(public.forward_contracts, text, text, text, text)
  from public, anon, authenticated;

-- ── الاقتراح ────────────────────────────────────────────────────────────────

create function public.forward_contract_propose(
  p_side text, p_phone text, p_offer uuid,
  p_crop text, p_grade text, p_quantity numeric, p_unit text, p_tolerance_percent numeric,
  p_price numeric, p_currency text, p_delivery_from date, p_delivery_to date, p_delivery_place text,
  p_payment_terms text, p_advance_percent numeric, p_season uuid, p_notes text,
  p_consignee_name text default null, p_consignee_phone text default null,
  p_late_pct_week numeric default null, p_late_cap_pct numeric default null, p_breach_pct numeric default null,
  p_force_majeure boolean default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
  v_key text;
  v_other uuid;
  v_others uuid[];
  v_id uuid;
  v_ref text;
  v_today date := (now() at time zone 'Africa/Khartoum')::date;
begin
  if v_me is null then
    raise exception 'سجّل الدخول أوّلاً.';
  end if;
  if p_side not in ('buyer', 'farmer') then
    raise exception 'قل أأنت المشتري أم المزارع.';
  end if;

  if p_offer is not null then
    -- From a notice on the board: the other side is whoever posted it, and its phone is the one it shows.
    select created_by, public.phone_key(contact_phone) into v_other, v_key
      from market_offers where id = p_offer and status = 'open' and expires_at > now();
    if v_other is null then
      raise exception 'هذا العرض أُغلق أو انتهى.';
    end if;
  else
    v_key := public.phone_key(p_phone);
    if v_key is null or length(v_key) < 9 then
      raise exception 'اكتب رقم جوّال الطرف الآخر كاملاً.';
    end if;
    select array_agg(distinct x.id) into v_others from (
      select p.id from profiles p where public.phone_key(p.phone) = v_key
      union
      select u.id from auth.users u where public.phone_key(u.phone) = v_key
    ) x;
    if v_others is null then
      raise exception 'لا حساب بهذا الرقم. يسجّل الطرف الآخر أوّلاً برقمه، ثمّ تقترح عليه العقد.';
    end if;
    if cardinality(v_others) > 1 then
      raise exception 'لهذا الرقم أكثر من حساب؛ تواصل مع الإدارة لتحدّد أيّها.';
    end if;
    v_other := v_others[1];
  end if;
  if v_other = v_me then
    raise exception 'لا تعقد مع نفسك.';
  end if;

  if p_delivery_from is null or p_delivery_to is null or p_delivery_from < v_today then
    raise exception 'موعد التسليم يبدأ من اليوم فما بعده.';
  end if;
  if p_delivery_to > v_today + interval '24 months' then
    raise exception 'موعد التسليم في حدود سنتين من اليوم.';
  end if;
  if p_season is not null and (p_side <> 'farmer'
       or not exists (select 1 from seasons where id = p_season and owner_id = v_me)) then
    raise exception 'يُربط بالعقد موسمٌ للمزارع نفسه.';
  end if;
  if nullif(btrim(p_consignee_name), '') is not null and p_side <> 'buyer' then
    raise exception 'من يستلم عن المشتري يكتبه المشتري.';
  end if;
  if (nullif(btrim(p_consignee_name), '') is null) <> (nullif(btrim(p_consignee_phone), '') is null) then
    raise exception 'اكتب اسم من يستلم وجوّاله معاً.';
  end if;
  if (select count(*) from forward_contracts where proposed_by = v_me and proposed_at > now() - interval '1 day') >= 20 then
    raise exception 'عشرون اقتراحاً في اليوم حدّ الحساب. أكمل غداً.';
  end if;

  insert into forward_contracts (
    buyer_id, farmer_id, proposed_by, phone_tail, crop, grade, quantity, unit, tolerance_percent, price, currency,
    delivery_from, delivery_to, delivery_place, payment_terms, advance_percent, notes, season_id, offer_id,
    consignee_name, consignee_phone, late_penalty_pct_week, late_penalty_cap_pct, breach_penalty_pct, force_majeure)
  values (
    case p_side when 'buyer' then v_me else v_other end,
    case p_side when 'farmer' then v_me else v_other end,
    v_me, right(v_key, 4), btrim(p_crop), btrim(p_grade), p_quantity, p_unit, coalesce(p_tolerance_percent, 5),
    p_price, p_currency, p_delivery_from, p_delivery_to, btrim(p_delivery_place), btrim(p_payment_terms),
    p_advance_percent, nullif(btrim(p_notes), ''), p_season, p_offer,
    nullif(btrim(p_consignee_name), ''), nullif(regexp_replace(coalesce(p_consignee_phone, ''), '[\s-]', '', 'g'), ''),
    coalesce(p_late_pct_week, 1), coalesce(p_late_cap_pct, 10), coalesce(p_breach_pct, 10), coalesce(p_force_majeure, true))
  returning id, ref into v_id, v_ref;

  insert into forward_contract_events (contract_id, actor_id, event) values (v_id, v_me, 'proposed');
  perform public.notify_user(
    v_other, 'forward_contract', 'عقدٌ آجلٌ يُقترح عليك (' || v_ref || ')',
    btrim(p_crop) || '، ' || p_quantity || ' ' || public.forward_unit_ar(p_unit) || ' بسعر ' || p_price || ' ' || p_currency
      || ' للوحدة، تسليمٌ بين ' || p_delivery_from || ' و' || p_delivery_to
      || case when nullif(btrim(p_consignee_name), '') is not null
              then ' إلى ' || btrim(p_consignee_name) || ' عن المشتري' else '' end
      || '. اقرأه ووقّعه أو اعتذر.',
    '/market/forward/' || v_id);
  return v_id;
end $$;

-- ── التوقيع والاعتذار والسحب ────────────────────────────────────────────────

create function public.forward_contract_answer(p_id uuid, p_sign boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare c forward_contracts%rowtype := public.forward_contract_lock(p_id);
begin
  if c.proposed_by = auth.uid() then
    raise exception 'وقّع المقترح حين اقترح؛ التوقيع الثاني للطرف الآخر.';
  end if;
  if c.status <> 'proposed' then
    raise exception 'أُجيب هذا الاقتراح أو سُحب.';
  end if;
  if p_sign then
    update forward_contracts set status = 'signed', signed_at = now() where id = p_id;
    perform public.forward_contract_step(c, 'signed', null, 'وُقّع العقد الآجل',
      'وقّعه الطرف الآخر، فصار ملزماً لكما بشروطه. التسليم بين ' || c.delivery_from || ' و' || c.delivery_to || '.');
  else
    update forward_contracts set status = 'declined', closed_at = now() where id = p_id;
    perform public.forward_contract_step(c, 'declined', null, 'اعتذر الطرف الآخر عن العقد الآجل',
      'لم يوقّعه. لا شيء على أحد.');
  end if;
end $$;

create function public.forward_contract_withdraw(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare c forward_contracts%rowtype := public.forward_contract_lock(p_id);
begin
  if c.proposed_by <> auth.uid() or c.status <> 'proposed' then
    raise exception 'يسحب المقترحُ اقتراحه قبل أن يُجاب فقط.';
  end if;
  update forward_contracts set status = 'withdrawn', closed_at = now() where id = p_id;
  perform public.forward_contract_step(c, 'withdrawn', null, 'سُحب اقتراح العقد الآجل', 'سحبه مقترحه قبل أن تجيب.');
end $$;

-- ── التسليم ─────────────────────────────────────────────────────────────────

create function public.forward_contract_deliver(
  p_id uuid, p_quantity numeric, p_on date, p_grade_met boolean, p_note text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare c forward_contracts%rowtype := public.forward_contract_lock(p_id);
begin
  if c.buyer_id <> auth.uid() then
    raise exception 'يسجّل التسليمَ المشتري الذي استلم.';
  end if;
  if c.status <> 'signed' then
    raise exception 'يُسجَّل التسليم لعقدٍ موقّعٍ لم يُسجَّل تسليمه.';
  end if;
  if p_quantity is null or p_quantity < 0 or p_on is null or p_grade_met is null then
    raise exception 'اكتب ما استلمت وتاريخه، وهل طابق الدرجة المتّفق عليها.';
  end if;
  if p_on > (now() at time zone 'Africa/Khartoum')::date then
    raise exception 'لا يُسجَّل تسليمٌ في يومٍ لم يأتِ.';
  end if;
  if not p_grade_met and nullif(btrim(p_note), '') is null then
    raise exception 'قل فيمَ خالفت البضاعة الدرجة.';
  end if;
  update forward_contracts
     set status = 'delivered', delivered_quantity = p_quantity, delivered_on = p_on, grade_met = p_grade_met,
         delivery_note = nullif(btrim(p_note), '')
   where id = p_id;
  perform public.forward_contract_step(c, 'delivered', nullif(btrim(p_note), ''), 'سجّل المشتري ما استلم',
    'استلم ' || p_quantity || ' ' || public.forward_unit_ar(c.unit) || ' في ' || p_on
      || case when p_grade_met then '، مطابقاً للدرجة' else '، وقال إنّه خالف الدرجة' end
      || '. أكّد ما سجّله أو نازِع فيه.');
end $$;

create function public.forward_contract_confirm(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare c forward_contracts%rowtype := public.forward_contract_lock(p_id);
begin
  if c.farmer_id <> auth.uid() or c.status <> 'delivered' then
    raise exception 'يؤكّد المزارعُ تسليماً سجّله المشتري.';
  end if;
  update forward_contracts set status = 'completed', closed_at = now() where id = p_id;
  perform public.forward_contract_step(c, 'completed', null, 'أكّد المزارع التسليم، وأُقفل العقد',
    'تمّ العقد بما سُجّل. شكراً لكما.');
end $$;

-- ── الإلغاء بالاتّفاق، والنزاع ──────────────────────────────────────────────

create function public.forward_contract_cancel_request(p_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare c forward_contracts%rowtype := public.forward_contract_lock(p_id);
begin
  if c.status not in ('signed', 'delivered') then
    raise exception 'يُطلب الإلغاء لعقدٍ موقّعٍ لم يُقفل.';
  end if;
  if length(btrim(coalesce(p_reason, ''))) < 5 then
    raise exception 'اكتب سبب طلب الإلغاء.';
  end if;
  update forward_contracts
     set status = 'cancel_requested', cancel_requested_by = auth.uid(), status_before = c.status
   where id = p_id;
  perform public.forward_contract_step(c, 'cancel_requested', btrim(p_reason), 'يطلب الطرف الآخر إلغاء العقد',
    'سببه: ' || btrim(p_reason) || '. لا يُلغى إلا إن قبلت.');
end $$;

create function public.forward_contract_cancel_answer(p_id uuid, p_agree boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare c forward_contracts%rowtype := public.forward_contract_lock(p_id);
begin
  if c.status <> 'cancel_requested' then
    raise exception 'لا طلب إلغاءٍ قائمٌ على هذا العقد.';
  end if;
  if c.cancel_requested_by = auth.uid() then
    raise exception 'يجيب طلب الإلغاء الطرف الآخر.';
  end if;
  if p_agree then
    update forward_contracts set status = 'cancelled', closed_at = now() where id = p_id;
    perform public.forward_contract_step(c, 'cancelled', null, 'أُلغي العقد بالاتّفاق', 'قبل الطرف الآخر طلبك.');
  else
    update forward_contracts set status = c.status_before, cancel_requested_by = null, status_before = null
     where id = p_id;
    perform public.forward_contract_step(c, 'cancel_refused', null, 'رُفض طلب الإلغاء',
      'العقد قائمٌ بشروطه. وإن تعذّر الاتّفاق فارفع نزاعاً إلى الإدارة.');
  end if;
end $$;

create function public.forward_contract_dispute(p_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare c forward_contracts%rowtype := public.forward_contract_lock(p_id);
begin
  if c.status not in ('signed', 'delivered', 'cancel_requested') then
    raise exception 'يُرفع النزاع على عقدٍ موقّعٍ لم يُقفل.';
  end if;
  if length(btrim(coalesce(p_reason, ''))) < 10 then
    raise exception 'اشرح النزاع في جملةٍ على الأقلّ.';
  end if;
  update forward_contracts
     set status = 'disputed', status_before = coalesce(c.status_before, c.status), cancel_requested_by = null
   where id = p_id;
  perform public.forward_contract_step(c, 'disputed', btrim(p_reason), 'رُفع نزاعٌ على العقد إلى الإدارة',
    'سببه: ' || btrim(p_reason) || '. تتواصل الإدارة معكما.');
  perform public.notify_admins('forward_contract', 'نزاعٌ على عقدٍ آجل (' || c.ref || ')', btrim(p_reason),
                               '/market/forward/' || c.id);
end $$;

-- The administration settles a dispute: the contract stands where it was, is closed as done, or is cancelled.
create function public.forward_contract_resolve(
  p_id uuid, p_outcome text, p_note text, p_penalty numeric default null, p_penalty_payer text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare c forward_contracts%rowtype;
begin
  if not is_admin() then
    raise exception 'تفصل الإدارة وحدها في النزاع.';
  end if;
  select * into c from forward_contracts where id = p_id for update;
  if not found or c.status <> 'disputed' then
    raise exception 'لا نزاع قائمٌ على هذا العقد.';
  end if;
  if p_outcome not in ('resume', 'completed', 'cancelled') then
    raise exception 'الفصل: يستمرّ العقد، أو يُقفل تامّاً، أو يُلغى.';
  end if;
  if length(btrim(coalesce(p_note, ''))) < 10 then
    raise exception 'اكتب ما فصلت به وسببه؛ يقرؤه الطرفان.';
  end if;
  -- The penalty the contract allows, and no more: the larger of its two clauses, as a share of the contract's value.
  if p_penalty is not null then
    if p_penalty <= 0 or p_penalty_payer not in ('buyer', 'farmer') then
      raise exception 'الغرامة مبلغٌ موجب، ومعه من يدفعها: المشتري أو المزارع.';
    end if;
    if p_penalty > round(c.price * c.quantity * greatest(c.late_penalty_cap_pct, c.breach_penalty_pct) / 100, 2) then
      raise exception 'الغرامة أكبر ممّا يسمح به الشرط الجزائيّ في العقد.';
    end if;
    update forward_contracts set penalty_awarded = p_penalty, penalty_payer = p_penalty_payer where id = p_id;
  elsif p_penalty_payer is not null then
    raise exception 'اكتب مبلغ الغرامة.';
  end if;
  if p_outcome = 'resume' then
    update forward_contracts set status = c.status_before, status_before = null where id = p_id;
  else
    update forward_contracts set status = p_outcome, closed_at = now() where id = p_id;
  end if;
  insert into forward_contract_events (contract_id, actor_id, event, note)
  values (p_id, auth.uid(), 'resolved', p_outcome || ': ' || btrim(p_note)
          || case when p_penalty is not null
                  then ' — غرامة ' || p_penalty || ' ' || c.currency || ' يدفعها '
                       || case p_penalty_payer when 'buyer' then 'المشتري' else 'المزارع' end || ' للآخر مباشرةً'
                  else '' end);
  perform public.notify_user(r, 'forward_contract', 'فصلت الإدارة في نزاع العقد (' || c.ref || ')', btrim(p_note),
                             '/market/forward/' || c.id)
     from unnest(array[c.buyer_id, c.farmer_id]) r;
end $$;

-- ── ما يقرؤه الطرفان ────────────────────────────────────────────────────────

-- اسم الطرف الآخر وجوّاله: للمقترَح عليه من الاقتراح (ليعرف من يقترح)، وللمقترح بعد التوقيع فقط.
create function public.forward_contract_parties(p_id uuid)
returns table (buyer_name text, buyer_phone text, farmer_name text, farmer_phone text)
language sql
stable
security definer
set search_path = public
as $$
  select case when c.buyer_id = auth.uid() or is_admin() or c.proposed_by = c.buyer_id or c.signed_at is not null
              then b.full_name end,
         case when c.buyer_id = auth.uid() or is_admin() or c.proposed_by = c.buyer_id or c.signed_at is not null
              then b.phone end,
         case when c.farmer_id = auth.uid() or is_admin() or c.proposed_by = c.farmer_id or c.signed_at is not null
              then f.full_name end,
         case when c.farmer_id = auth.uid() or is_admin() or c.proposed_by = c.farmer_id or c.signed_at is not null
              then f.phone end
    from forward_contracts c
    left join profiles b on b.id = c.buyer_id
    left join profiles f on f.id = c.farmer_id
   where c.id = p_id and (auth.uid() in (c.buyer_id, c.farmer_id) or is_admin())
$$;

do $$
declare f text;
begin
  foreach f in array array[
    'forward_contract_propose(text, text, uuid, text, text, numeric, text, numeric, numeric, text, date, date, text, text, numeric, uuid, text, text, text, numeric, numeric, numeric, boolean)',
    'forward_contract_answer(uuid, boolean)', 'forward_contract_withdraw(uuid)',
    'forward_contract_deliver(uuid, numeric, date, boolean, text)', 'forward_contract_confirm(uuid)',
    'forward_contract_cancel_request(uuid, text)', 'forward_contract_cancel_answer(uuid, boolean)',
    'forward_contract_dispute(uuid, text)', 'forward_contract_resolve(uuid, text, text, numeric, text)',
    'forward_contract_parties(uuid)'
  ] loop
    execute format('revoke execute on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
