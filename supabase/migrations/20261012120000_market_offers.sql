-- «عروض البيع والشراء»: لوحةُ إعلاناتٍ تصل المزارع بالتاجر، ولا تمسّ المال.
--
-- المالك، 12 أكتوبر 2026: عروضٌ مبوّبة — بيعٌ أو شراء، محصولٌ وكميةٌ ووحدة،
-- ولايةٌ ومحلية، وسعرٌ إن شاء صاحبه، ورقمٌ يُتّصل عليه.
--
-- WHAT THE PLATFORM DOES NOT DO
--
-- It holds no money, takes no commission and guarantees no delivery. An offer
-- is a notice with a phone number; the deal is made between the two people,
-- in the market, goods inspected and paid for on delivery. The pages say so
-- beside every offer. That is why there is no escrow column, no "accepted"
-- state and no buyer recorded here: recording a deal the platform cannot
-- enforce would imply a guarantee it does not give.
--
-- WHO WRITES
--
-- Like the canals and the judiyya, nobody writes the table directly. An offer
-- is created and closed through two security-definer functions that check
-- auth.uid(), cap how many offers one account keeps open (a board flooded by
-- one trader is a board nobody reads), and stamp the owner themselves — the
-- owner is never a value the caller supplies.
--
-- WHO READS
--
-- Everyone, signed in or not, reads the open offers that have not expired:
-- a farmer in Gedaref without an account must still find the buyer. The phone
-- number is public by design — it is the whole point of the notice — and the
-- form says so before it is submitted. An owner also reads his own closed and
-- expired offers, to know what he has posted.

create table public.market_offers (
  id            uuid primary key default gen_random_uuid(),
  kind          text not null check (kind in ('sell','buy')),
  crop          text not null check (length(btrim(crop)) between 2 and 60),
  quantity      numeric(12,2) not null check (quantity > 0 and quantity <= 1000000),
  unit          text not null check (unit in ('qintar','ardeb','sack','ton','kg')),
  grade         text check (grade is null or length(btrim(grade)) between 2 and 200),
  state         text not null check (is_sudan_state(state)),
  locality      text not null check (length(btrim(locality)) between 2 and 80),
  -- Either price, both, or neither ("on inspection") — a buyer's notice often
  -- names no price at all.
  price_sdg     numeric(16,2) check (price_sdg is null or price_sdg > 0),
  price_usd     numeric(12,2) check (price_usd is null or price_usd > 0),
  -- E.164 without the plus, as src/lib/phone.ts normalises it.
  contact_phone text not null check (contact_phone ~ '^[1-9][0-9]{7,14}$'),
  whatsapp      boolean not null default true,
  notes         text check (notes is null or length(btrim(notes)) between 2 and 1000),
  -- A storage path, for when photo upload is wired; nothing writes it yet.
  photo_path    text check (photo_path is null or length(photo_path) between 3 and 300),
  status        text not null default 'open' check (status in ('open','closed')),
  expires_at    timestamptz not null default now() + interval '30 days',
  created_by    uuid not null references auth.users(id) on delete cascade,
  created_at    timestamptz not null default now(),
  closed_at     timestamptz
);

create index market_offers_open_idx on public.market_offers (expires_at desc) where status = 'open';
create index market_offers_created_by_idx on public.market_offers (created_by);
create index market_offers_crop_state_idx on public.market_offers (crop, state);

alter table public.market_offers enable row level security;

create policy market_offers_public_read on public.market_offers
  for select using (status = 'open' and expires_at > now());

create policy market_offers_own_read on public.market_offers
  for select to authenticated using (created_by = (select auth.uid()));

-- No insert, update or delete policy: with RLS on, that already refuses every
-- direct write. Taking the privileges away as well means a policy added by
-- mistake later still cannot open the table.
revoke insert, update, delete on public.market_offers from anon, authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- الخطوتان
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.market_offer_create(
  p_kind text, p_crop text, p_quantity numeric, p_unit text, p_grade text,
  p_state text, p_locality text, p_price_sdg numeric, p_price_usd numeric,
  p_phone text, p_whatsapp boolean, p_notes text, p_days integer)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if auth.uid() is null then raise exception 'سجّل الدخول أولاً.'; end if;
  -- Ten open at once is a busy trader; more is a flood.
  if (select count(*) from market_offers
        where created_by = auth.uid() and status = 'open' and expires_at > now()) >= 10 then
    raise exception 'لديك عشرة عروضٍ مفتوحة. أغلق واحداً قبل أن تضيف غيره.';
  end if;
  -- And closing to reopen is not a way round it.
  if (select count(*) from market_offers
        where created_by = auth.uid() and created_at > now() - interval '1 day') >= 20 then
    raise exception 'أضفتَ عشرين عرضاً اليوم. عُد غداً.';
  end if;
  insert into market_offers (kind, crop, quantity, unit, grade, state, locality,
                             price_sdg, price_usd, contact_phone, whatsapp, notes,
                             expires_at, created_by)
  values (p_kind, btrim(p_crop), p_quantity, p_unit, nullif(btrim(p_grade), ''), p_state, btrim(p_locality),
          p_price_sdg, p_price_usd, p_phone, coalesce(p_whatsapp, true), nullif(btrim(p_notes), ''),
          now() + make_interval(days => case when p_days between 1 and 60 then p_days else 30 end),
          auth.uid())
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.market_offer_close(p_offer uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'سجّل الدخول أولاً.'; end if;
  update market_offers set status = 'closed', closed_at = now()
    where id = p_offer and created_by = auth.uid() and status = 'open';
  if not found then raise exception 'لا عرضَ مفتوحاً لك بهذا الرقم.'; end if;
end;
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- الصلاحيات
-- ═══════════════════════════════════════════════════════════════════════════

revoke execute on function public.market_offer_create(text, text, numeric, text, text, text, text, numeric, numeric, text, boolean, text, integer) from public, anon;
revoke execute on function public.market_offer_close(uuid) from public, anon;

grant execute on function public.market_offer_create(text, text, numeric, text, text, text, text, numeric, numeric, text, boolean, text, integer) to authenticated;
grant execute on function public.market_offer_close(uuid) to authenticated;

comment on table public.market_offers is 'عروض البيع والشراء: إعلانٌ برقم هاتف. المنصّة لا تمسك مالاً ولا تضمن تسليماً.';
