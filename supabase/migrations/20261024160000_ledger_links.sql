-- ═══════════════════════════════════════════════════════════════════════════
-- القيود المتقابلة بين دفترين (البند ١٨٨، المرحلة ٣ب)
--
-- ما يجري بين شريكين — تمويل المستثمر مدخلات الموسم، ونصيبه من الحصاد، وتسليمه له، وأجرة الأرض — حدثٌ واحد
-- يراه الطرفان في دفترَيهما. لا يدخل أحدٌ مالَ الآخر دفتراً بلا موافقته: يقترح أحد الشريكين، ويؤكّد الآخر أو
-- يعترض. المقترَح لا يُقيَّد في أيّ دفتر؛ وعند التأكيد يُقيَّد الطرفان في معاملةٍ واحدة بالرابط نفسه
-- (journal_entries.link_id)، فإن تعذّر قيدُ أحدهما (فترة مقفلة مثلاً) لم يُقيَّد شيءٌ ولا يبقى نصفُ قيد.
--
-- الشريكان يُعرفان من عقد شراكةٍ موقَّع (partnership_agreements): لا يقترح أحدٌ على غريب. والمنصّة لا تلمس المال:
-- هي تسجّل أنّ الطرفين أقرّا بما جرى خارجها.
--
-- لا حذف في هذه الهجرة: جدولٌ جديد ودوالّ جديدة وإضافةُ نوع إشعار.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── إشعار جديد ──────────────────────────────────────────────────────────────

do $$
declare
  v_def text;
begin
  select pg_get_constraintdef(oid) into v_def
    from pg_constraint
   where conname = 'notifications_kind_check' and conrelid = 'public.notifications'::regclass;
  if v_def is null then
    raise exception 'notifications_kind_check غير موجود';
  end if;
  if v_def not like '%ledger_link%' then
    -- Add the kind to whatever list is there now, so a kind another migration added is not lost.
    execute 'alter table public.notifications drop constraint notifications_kind_check';
    execute 'alter table public.notifications add constraint notifications_kind_check '
         || regexp_replace(v_def, '\]\)\)\)\s*$', ', ''ledger_link''::text])))');
  end if;
  select pg_get_constraintdef(oid) into v_def
    from pg_constraint
   where conname = 'notifications_kind_check' and conrelid = 'public.notifications'::regclass;
  if v_def not like '%ledger_link%' then
    raise exception 'لم يُضَف نوع الإشعار ledger_link';
  end if;
end $$;

-- ── الجدول ──────────────────────────────────────────────────────────────────

create table public.ledger_links (
  id              uuid primary key default gen_random_uuid(),
  kind            text not null check (kind in ('input_finance', 'harvest_share', 'payout', 'rent_payment')),
  status          text not null default 'pending' check (status in ('pending', 'confirmed', 'rejected', 'cancelled')),
  agreement_id    uuid not null,
  season_id       uuid,
  proposer_owner  uuid not null references auth.users(id) on delete restrict,
  counter_owner   uuid not null references auth.users(id) on delete restrict,
  proposer_book   uuid not null references public.ledger_books(id) on delete restrict,
  -- يُفتح دفتر الطرف الآخر حين يؤكّد إن لم يكن له دفتر.
  counter_book    uuid references public.ledger_books(id) on delete restrict,
  amount_minor    bigint not null check (amount_minor between 1 and 10000000000000),
  -- نصيب الحصاد وحده: ما يُطفئ من التمويل. قد يزيد على النصيب (موسمٌ خاسر).
  principal_minor bigint not null default 0 check (principal_minor between 0 and 10000000000000),
  currency        text not null check (currency in ('USD', 'SDG')),
  fx_rate         numeric(18, 6) check (fx_rate is null or fx_rate > 0),
  fx_source       text check (fx_source in ('parallel', 'bank', 'user')),
  entry_date      date not null check (entry_date >= date '2000-01-01'),
  proposer_account text check (proposer_account in ('cash', 'bank', 'wallet')),
  counter_account  text check (counter_account in ('cash', 'bank', 'wallet')),
  memo            text not null default '' check (length(memo) <= 200),
  idem_key        text not null check (length(idem_key) between 8 and 80),
  proposer_entry  uuid,
  counter_entry   uuid,
  reject_reason   text check (reject_reason is null or length(reject_reason) between 3 and 300),
  created_at      timestamptz not null default now(),
  resolved_at     timestamptz,
  constraint ledger_links_distinct check (proposer_owner <> counter_owner),
  constraint ledger_links_principal check (kind = 'harvest_share' or principal_minor = 0),
  constraint ledger_links_resolved check ((status = 'pending') = (resolved_at is null)),
  constraint ledger_links_confirmed check ((status = 'confirmed') = (proposer_entry is not null and counter_entry is not null)),
  unique (proposer_owner, idem_key)
);

create index ledger_links_counter on public.ledger_links (counter_owner, status, created_at desc);
create index ledger_links_proposer on public.ledger_links (proposer_owner, status, created_at desc);
create index ledger_links_agreement on public.ledger_links (agreement_id);

comment on table public.ledger_links is
  'اقتراحٌ بقيدين متقابلين بين دفترَي شريكين. لا يُقيَّد شيءٌ قبل التأكيد؛ يكتبه ledger_link_* وحدها.';

-- الحالة تتحرّك من المعلّق إلى مآلٍ واحد، والباقي لا يتغيّر.
create function public.ledger_links_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'DELETE' or tg_op = 'TRUNCATE' then
    raise exception 'القيود المتقابلة لا تُحذف';
  end if;
  if old.status <> 'pending' then
    raise exception 'القيد المتقابل بعد البتّ فيه لا يتغيّر';
  end if;
  if new.status not in ('pending', 'confirmed', 'rejected', 'cancelled') then
    raise exception 'حالةٌ غير معروفة';
  end if;
  if (old.id, old.kind, old.agreement_id, old.season_id, old.proposer_owner, old.counter_owner, old.proposer_book,
      old.amount_minor, old.principal_minor, old.currency, old.entry_date, old.proposer_account, old.memo, old.idem_key, old.created_at)
     is distinct from
     (new.id, new.kind, new.agreement_id, new.season_id, new.proposer_owner, new.counter_owner, new.proposer_book,
      new.amount_minor, new.principal_minor, new.currency, new.entry_date, new.proposer_account, new.memo, new.idem_key, new.created_at) then
    raise exception 'لا يتغيّر من القيد المتقابل إلا بتّه';
  end if;
  return new;
end $$;

create trigger ledger_links_guard
  before update or delete on public.ledger_links
  for each row execute function public.ledger_links_guard();
create trigger ledger_links_no_truncate
  before truncate on public.ledger_links
  for each statement execute function public.ledger_links_guard();

alter table public.ledger_links enable row level security;
revoke all on table public.ledger_links from anon, authenticated, service_role;
grant select on public.ledger_links to authenticated;

-- A link is read by its two parties — and, while an inspection stands, by the administrator inspecting either book.
create policy ledger_links_read on public.ledger_links
  for select to authenticated
  using (
    proposer_owner = (select auth.uid())
    or counter_owner = (select auth.uid())
    or public._ledger_inspecting(proposer_book)
    or (counter_book is not null and public._ledger_inspecting(counter_book))
  );

-- ── قوالب القيدين ───────────────────────────────────────────────────────────

create function public._ledger_link_label(p_kind text)
returns text
language sql
immutable
set search_path = public
as $$
  select case p_kind
    when 'input_finance' then 'تمويل مدخلات'
    when 'harvest_share' then 'نصيب من الحصاد'
    when 'payout' then 'تسليم نصيب'
    when 'rent_payment' then 'أجرة أرض'
    else p_kind end
$$;

create function public._ledger_link_line(p_key text, p_side text, p_cur text, p_minor bigint, p_season uuid)
returns jsonb
language sql
immutable
set search_path = public
as $$
  select jsonb_strip_nulls(jsonb_build_object('key', p_key, 'side', p_side, 'currency', p_cur, 'minor', p_minor, 'season', p_season::text))
$$;

-- The lines one side of a link posts. `proposer` or `counter`; the cash account of that side where it has one.
--   input_finance  investor pays the supplier for the farmer's season inputs.
--   harvest_share  the farmer recognises the investor's share of the crop; `principal` of it settles the financing,
--                  the rest is the investor's gain — or, when the share is less than the financing, the difference
--                  is the financing the farmer is not asked to repay and the investor's loss (the agreement's loss rule).
--   payout         the farmer hands the investor what he owes.
--   rent_payment   the investor pays the landowner's rent.
create function public._ledger_link_lines(
  p_kind text, p_side text, p_cur text, p_amount bigint, p_principal bigint, p_account text, p_season uuid
) returns jsonb
language plpgsql
immutable
set search_path = public
as $$
declare
  v_pay text := case p_account when 'bank' then 'bank' when 'wallet' then 'wallet' else 'cash_on_hand' end;
  v_l   jsonb := '[]'::jsonb;
begin
  if p_kind = 'input_finance' then
    if p_side = 'proposer' then
      return jsonb_build_array(public._ledger_link_line('deployed_season', 'D', p_cur, p_amount, p_season),
                               public._ledger_link_line(v_pay, 'C', p_cur, p_amount, p_season));
    end if;
    return jsonb_build_array(public._ledger_link_line('crops_in_progress', 'D', p_cur, p_amount, p_season),
                             public._ledger_link_line('financing_from_investor', 'C', p_cur, p_amount, p_season));

  elsif p_kind = 'harvest_share' then
    if p_side = 'proposer' then
      if p_principal > 0 then
        v_l := v_l || public._ledger_link_line('financing_from_investor', 'D', p_cur, p_principal, p_season);
      end if;
      if p_amount > p_principal then
        v_l := v_l || public._ledger_link_line('partner_share', 'D', p_cur, p_amount - p_principal, p_season);
      end if;
      v_l := v_l || public._ledger_link_line('due_to_partner', 'C', p_cur, p_amount, p_season);
      if p_principal > p_amount then
        v_l := v_l || public._ledger_link_line('other_income', 'C', p_cur, p_principal - p_amount, p_season);
      end if;
      return v_l;
    end if;
    v_l := v_l || public._ledger_link_line('due_from_farmer', 'D', p_cur, p_amount, p_season);
    if p_principal > p_amount then
      v_l := v_l || public._ledger_link_line('crop_loss', 'D', p_cur, p_principal - p_amount, p_season);
    end if;
    if p_principal > 0 then
      v_l := v_l || public._ledger_link_line('deployed_season', 'C', p_cur, p_principal, p_season);
    end if;
    if p_amount > p_principal then
      v_l := v_l || public._ledger_link_line('share_of_harvest', 'C', p_cur, p_amount - p_principal, p_season);
    end if;
    return v_l;

  elsif p_kind = 'payout' then
    if p_side = 'proposer' then
      return jsonb_build_array(public._ledger_link_line('due_to_partner', 'D', p_cur, p_amount, p_season),
                               public._ledger_link_line(v_pay, 'C', p_cur, p_amount, p_season));
    end if;
    return jsonb_build_array(public._ledger_link_line(v_pay, 'D', p_cur, p_amount, p_season),
                             public._ledger_link_line('due_from_farmer', 'C', p_cur, p_amount, p_season));

  elsif p_kind = 'rent_payment' then
    if p_side = 'proposer' then
      return jsonb_build_array(public._ledger_link_line('prepaid_rent', 'D', p_cur, p_amount, p_season),
                               public._ledger_link_line(v_pay, 'C', p_cur, p_amount, p_season));
    end if;
    return jsonb_build_array(public._ledger_link_line(v_pay, 'D', p_cur, p_amount, p_season),
                             public._ledger_link_line('service_income', 'C', p_cur, p_amount, p_season));
  end if;
  raise exception 'نوعٌ غير معروف من القيود المتقابلة';
end $$;

-- ── الاقتراح ────────────────────────────────────────────────────────────────

create function public.ledger_link_propose(
  p_agreement uuid,
  p_kind      text,
  p_amount_minor bigint,
  p_currency  text,
  p_date      date,
  p_account   text default null,
  p_principal_minor bigint default 0,
  p_season    uuid default null,
  p_rate      numeric default null,
  p_memo      text default '',
  p_key       text default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid     uuid := auth.uid();
  a         public.partnership_agreements;
  s         public.seasons;
  v_role    text;
  v_counter uuid;
  v_book    uuid;
  v_cbook   uuid;
  v_id      uuid;
  v_key     text := coalesce(nullif(btrim(p_key), ''), gen_random_uuid()::text);
  v_rate    numeric;
  v_src     text;
  v_needs_account boolean;
begin
  if v_uid is null then
    raise exception 'سجّل الدخول أولاً';
  end if;
  if p_kind not in ('input_finance', 'harvest_share', 'payout', 'rent_payment') then
    raise exception 'نوعٌ غير معروف من القيود المتقابلة';
  end if;
  if p_currency not in ('USD', 'SDG') then
    raise exception 'عملة غير معروفة';
  end if;
  if p_amount_minor is null or p_amount_minor < 1 or p_amount_minor > 10000000000000 then
    raise exception 'مبلغٌ غير صالح';
  end if;
  if p_date is null or p_date < date '2000-01-01' or p_date > public.ledger_today() + 1 then
    raise exception 'تاريخٌ غير صالح';
  end if;
  if p_kind <> 'harvest_share' and coalesce(p_principal_minor, 0) <> 0 then
    raise exception 'أصل التمويل لنصيب الحصاد وحده';
  end if;
  if coalesce(p_principal_minor, 0) < 0 then
    raise exception 'مبلغٌ غير صالح';
  end if;

  -- The same key from the same person is the same proposal: a second tap returns it.
  select id into v_id from public.ledger_links where proposer_owner = v_uid and idem_key = v_key;
  if found then
    return v_id;
  end if;

  select * into a from public.partnership_agreements where id = p_agreement;
  if not found or a.status <> 'signed' then
    raise exception 'لا عقدَ موقَّعاً بهذا الرقم';
  end if;
  v_role := case when a.owner_id = v_uid then 'owner' when a.investor_id = v_uid then 'investor' else null end;
  if v_role is null then
    raise exception 'لست طرفاً في هذا العقد';
  end if;
  v_counter := case v_role when 'owner' then a.investor_id else a.owner_id end;

  -- Who proposes what: the investor funds and pays rent; the farmer recognises the share and hands it over.
  if (p_kind in ('input_finance', 'rent_payment') and v_role <> 'investor')
     or (p_kind in ('harvest_share', 'payout') and v_role <> 'owner') then
    raise exception 'هذا القيد يقترحه الطرف الآخر';
  end if;
  if (p_kind = 'rent_payment') <> (a.model = 'lease') then
    raise exception '%', case when p_kind = 'rent_payment' then 'الأجرة لعقد الإيجار وحده' else 'عقد الإيجار ليس فيه إلا الأجرة' end;
  end if;

  if p_kind in ('input_finance', 'harvest_share') and p_season is null then
    raise exception 'اختر الموسم';
  end if;
  if p_season is not null then
    select * into s from public.seasons where id = p_season;
    if not found or s.partnership_id is distinct from a.id or s.owner_id is distinct from a.owner_id then
      raise exception 'الموسم ليس من هذا العقد';
    end if;
  end if;

  v_needs_account := p_kind in ('input_finance', 'payout', 'rent_payment');
  if v_needs_account and coalesce(p_account, '') not in ('cash', 'bank', 'wallet') then
    raise exception 'اختر النقد أو البنك أو المحفظة';
  end if;

  if p_currency = 'SDG' and p_rate is not null then
    if p_rate < 1 or p_rate > 100000000 then
      raise exception 'سعر الصرف خارج المعقول';
    end if;
    v_rate := round(p_rate, 6);
    v_src := 'user';
  end if;

  if (select count(*) from public.ledger_links where proposer_owner = v_uid and status = 'pending') >= 20 then
    raise exception 'لديك عشرون اقتراحاً معلّقاً؛ انتظر ردّ أصحابها أو ألغِ بعضها';
  end if;

  v_book := public._ledger_open_book(v_uid, case v_role when 'owner' then 'farm' else 'investor' end);
  select id into v_cbook from public.ledger_books
   where owner_id = v_counter and kind = case v_role when 'owner' then 'investor' else 'farm' end;

  insert into public.ledger_links
    (kind, agreement_id, season_id, proposer_owner, counter_owner, proposer_book, counter_book, amount_minor,
     principal_minor, currency, fx_rate, fx_source, entry_date, proposer_account, memo, idem_key)
  values
    (p_kind, a.id, p_season, v_uid, v_counter, v_book, v_cbook, p_amount_minor,
     coalesce(p_principal_minor, 0), p_currency, v_rate, v_src, p_date,
     case when v_needs_account then p_account else null end, left(btrim(coalesce(p_memo, '')), 200), v_key)
  returning id into v_id;

  perform public.notify_user(
    v_counter, 'ledger_link', 'اقتراح قيدٍ في دفترك: ' || public._ledger_link_label(p_kind),
    'اقترح شريكك في العقد ' || coalesce(a.ref, '') || ' قيداً متقابلاً (' || public._ledger_link_label(p_kind)
      || '). لا يدخل دفترك إلا إن أكّدته؛ وإن اختلف عمّا جرى فاعترض عليه.',
    '/books?r=links');
  return v_id;
end $$;

-- ── التأكيد ─────────────────────────────────────────────────────────────────

create function public.ledger_link_confirm(p_link uuid, p_account text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid   uuid := auth.uid();
  l       public.ledger_links;
  a       public.partnership_agreements;
  v_pbk   text;
  v_cbk   text;
  v_cbook uuid;
  v_rate  numeric;
  v_src   text;
  v_label text;
  v_pe    uuid;
  v_ce    uuid;
  v_needs boolean;
begin
  if v_uid is null then
    raise exception 'سجّل الدخول أولاً';
  end if;
  select * into l from public.ledger_links where id = p_link for update;
  if not found or l.counter_owner <> v_uid then
    raise exception 'ليس هذا اقتراحاً موجّهاً إليك';
  end if;
  if l.status <> 'pending' then
    raise exception 'سُبق البتّ في هذا الاقتراح';
  end if;
  select * into a from public.partnership_agreements where id = l.agreement_id;

  -- The proposer is the investor in input_finance and rent_payment, the farmer in the others.
  v_pbk := case when l.kind in ('input_finance', 'rent_payment') then 'investor' else 'farm' end;
  v_cbk := case v_pbk when 'investor' then 'farm' else 'investor' end;

  v_needs := l.kind in ('payout', 'rent_payment');
  if v_needs and coalesce(p_account, '') not in ('cash', 'bank', 'wallet') then
    raise exception 'اختر أين استلمت: النقد أو البنك أو المحفظة';
  end if;

  -- One rate for both books: what the proposer typed, else the latest published one for the day.
  if l.currency = 'SDG' then
    if l.fx_rate is not null then
      v_rate := l.fx_rate;
      v_src := l.fx_source;
    else
      select f.rate into v_rate from public.ledger_fx_rate(l.entry_date, 'parallel') f;
      v_src := 'parallel';
      if v_rate is null then
        raise exception 'لا سعر صرفٍ منشوراً خلال ٧ أيام قبل %؛ يكتب مقترِحُ القيد السعر الذي صرف به', l.entry_date;
      end if;
    end if;
  end if;

  v_cbook := public._ledger_open_book(v_uid, v_cbk);
  v_label := public._ledger_link_label(l.kind) || coalesce(': ' || nullif(l.memo, ''), '');

  v_pe := public._ledger_post_src(
    l.proposer_book, l.entry_date, v_label,
    public._ledger_link_lines(l.kind, 'proposer', l.currency, l.amount_minor, l.principal_minor, l.proposer_account, l.season_id),
    'ledger_link:' || l.id::text || ':p', v_rate, 'ledger_link', l.id, l.id, l.proposer_owner, v_src);
  v_ce := public._ledger_post_src(
    v_cbook, l.entry_date, v_label,
    public._ledger_link_lines(l.kind, 'counter', l.currency, l.amount_minor, l.principal_minor,
                              case when v_needs then p_account else null end, l.season_id),
    'ledger_link:' || l.id::text || ':c', v_rate, 'ledger_link', l.id, l.id, v_uid, v_src);

  update public.ledger_links
     set status = 'confirmed', counter_book = v_cbook, counter_account = case when v_needs then p_account else null end,
         fx_rate = v_rate, fx_source = v_src, proposer_entry = v_pe, counter_entry = v_ce, resolved_at = now()
   where id = l.id;

  -- Financed inputs sit in "growing crops": if the season has already closed, they move to the cost of the crop sold.
  if l.season_id is not null then
    perform public._farm_trueup(l.season_id, v_uid);
  end if;

  perform public.notify_user(
    l.proposer_owner, 'ledger_link', 'أُكِّد القيد المتقابل: ' || public._ledger_link_label(l.kind),
    'أكّد شريكك في العقد ' || coalesce(a.ref, '') || ' اقتراحك، فقُيِّد في الدفترين.', '/books?r=links');
end $$;

-- ── الاعتراض والإلغاء ───────────────────────────────────────────────────────

create function public.ledger_link_reject(p_link uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  l     public.ledger_links;
begin
  if v_uid is null then
    raise exception 'سجّل الدخول أولاً';
  end if;
  if length(btrim(coalesce(p_reason, ''))) not between 3 and 300 then
    raise exception 'اكتب سبب الاعتراض (٣ أحرفٍ فأكثر): يراه صاحب الاقتراح';
  end if;
  select * into l from public.ledger_links where id = p_link for update;
  if not found or l.counter_owner <> v_uid then
    raise exception 'ليس هذا اقتراحاً موجّهاً إليك';
  end if;
  if l.status <> 'pending' then
    raise exception 'سُبق البتّ في هذا الاقتراح';
  end if;
  update public.ledger_links set status = 'rejected', reject_reason = btrim(p_reason), resolved_at = now() where id = l.id;
  perform public.notify_user(
    l.proposer_owner, 'ledger_link', 'اعترض شريكك على قيدٍ اقترحته: ' || public._ledger_link_label(l.kind),
    'السبب: ' || btrim(p_reason) || '. لم يُقيَّد شيءٌ في أيّ دفتر؛ صحّح الاقتراح وأعد إرساله إن شئت.', '/books?r=links');
end $$;

create function public.ledger_link_cancel(p_link uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  l     public.ledger_links;
begin
  if v_uid is null then
    raise exception 'سجّل الدخول أولاً';
  end if;
  select * into l from public.ledger_links where id = p_link for update;
  if not found or l.proposer_owner <> v_uid then
    raise exception 'ليس هذا اقتراحك';
  end if;
  if l.status <> 'pending' then
    raise exception 'سُبق البتّ في هذا الاقتراح';
  end if;
  update public.ledger_links set status = 'cancelled', resolved_at = now() where id = l.id;
end $$;

-- ── القائمة: ما يخصّني، مع اسم الطرف الآخر ──────────────────────────────────

create function public.ledger_links_list()
returns table (
  id              uuid,
  kind            text,
  status          text,
  mine            boolean,
  other_name      text,
  agreement_id    uuid,
  agreement_ref   text,
  season_id       uuid,
  amount_minor    bigint,
  principal_minor bigint,
  currency        text,
  fx_rate         numeric,
  entry_date      date,
  memo            text,
  reject_reason   text,
  created_at      timestamptz,
  resolved_at     timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select l.id, l.kind, l.status, (l.proposer_owner = auth.uid()),
         coalesce(p.full_name, '—'), l.agreement_id, a.ref, l.season_id, l.amount_minor, l.principal_minor,
         l.currency, l.fx_rate, l.entry_date, l.memo, l.reject_reason, l.created_at, l.resolved_at
    from public.ledger_links l
    left join public.partnership_agreements a on a.id = l.agreement_id
    left join public.profiles p on p.id = case when l.proposer_owner = auth.uid() then l.counter_owner else l.proposer_owner end
   where auth.uid() is not null and (l.proposer_owner = auth.uid() or l.counter_owner = auth.uid())
   order by (l.status = 'pending') desc, l.created_at desc
   limit 200
$$;

-- ── الإشراف: أعدادٌ ومجاميع بلا أسماء، تُحجب الخليّة إن ساهم فيها أقلّ من ٣ عقود (المستوى ٢ من البند ١٩١) ──

create function public.oversight_links(p_from date, p_to date)
returns table (
  kind       text,
  status     text,
  links      bigint,
  agreements bigint,
  amount_usd_minor bigint,
  suppressed boolean
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  s public.oversight_settings;
begin
  if auth.uid() is not null and not is_admin() then
    raise exception 'للإدارة وحدها';
  end if;
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 1100 then
    raise exception 'مدىً غير صالح';
  end if;
  select * into s from public.oversight_settings;
  return query
  with x as (
    select l.kind, l.status, count(*)::bigint as n,
           count(distinct l.agreement_id) as people,
           coalesce(sum(case when l.currency = 'USD' then l.amount_minor
                             when l.fx_rate is not null then public.ledger_to_base(l.amount_minor, l.fx_rate)
                             else 0 end), 0)::bigint as total
      from public.ledger_links l
     where l.created_at::date between p_from and p_to
     group by l.kind, l.status
  )
  select x.kind, x.status,
         case when x.people < s.min_books then null else x.n end,
         case when x.people < s.min_books then null else x.people::bigint end,
         case when x.people < s.min_books or x.total is null then null else x.total end,
         x.people < s.min_books
    from x
   order by x.kind, x.status;
end $$;

-- ── الصلاحيّات ──────────────────────────────────────────────────────────────

revoke execute on function
  public.ledger_links_guard(), public._ledger_link_label(text), public._ledger_link_line(text, text, text, bigint, uuid),
  public._ledger_link_lines(text, text, text, bigint, bigint, text, uuid)
  from public, anon, authenticated, service_role;

revoke execute on function
  public.ledger_link_propose(uuid, text, bigint, text, date, text, bigint, uuid, numeric, text, text),
  public.ledger_link_confirm(uuid, text),
  public.ledger_link_reject(uuid, text),
  public.ledger_link_cancel(uuid),
  public.ledger_links_list(),
  public.oversight_links(date, date)
  from public, anon, service_role;

grant execute on function
  public.ledger_link_propose(uuid, text, bigint, text, date, text, bigint, uuid, numeric, text, text),
  public.ledger_link_confirm(uuid, text),
  public.ledger_link_reject(uuid, text),
  public.ledger_link_cancel(uuid),
  public.ledger_links_list(),
  public.oversight_links(date, date)
  to authenticated;

grant execute on function public.oversight_links(date, date) to service_role;
