-- ═══════════════════════════════════════════════════════════════════════════
-- الأسعارُ تتحدّث وحدها (البند ١٣١)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- المالك، 22 أكتوبر 2026: «أريد آليّةً لتحديث الأسعار — العملات والمحاصيل
-- وكلّ شيء — دون تدخّلك».
--
-- A daily job on the server (src/lib/priceRefresh.ts, run by /api/health and
-- by the button on /admin/prices) reads Bank of Khartoum's table, the parallel
-- market and the El Obeid and Gedaref bulletins from the news sites' own feeds,
-- and writes each figure here with its link, the words it was read in and its
-- market day.
--
-- A figure is either published — the pages show it — or held for an
-- administrator: Gedaref's prose always, and anything outside its plausible
-- range or moved further from the last published figure than a day's trading
-- moves it. Nothing here is estimated: a reader that cannot read a figure
-- writes nothing.
--
-- The job writes as the project (the service role); a visitor reads what is
-- published and nothing else; an administrator reads everything and decides
-- the held ones through market_quote_review.

create table public.market_quotes (
  id           uuid primary key default gen_random_uuid(),
  kind         text not null check (kind in ('fx_bank','fx_parallel','crop')),
  -- '' for a currency, so one plain unique key covers every kind.
  market       text not null default '' check (market in ('','gedaref','obeid')),
  crop         text not null default '' check (crop = '' or crop ~ '^[a-z_]{2,40}$'),
  unit         text check (unit is null or unit in ('qintar','ardeb','sack','ton')),
  market_date  date not null,
  buy          numeric(14,2) check (buy is null or buy > 0),
  sell         numeric(14,2) check (sell is null or sell > 0),
  price        numeric(16,2) check (price is null or price > 0),
  source_url   text not null check (source_url ~ '^https://' and length(source_url) <= 1000),
  quote        text check (quote is null or length(quote) <= 600),
  method       text not null default 'auto' check (method in ('auto','manual')),
  status       text not null default 'held' check (status in ('published','held','rejected')),
  reason       text check (reason is null or length(reason) <= 300),
  reviewed_by  uuid references auth.users(id) on delete set null,
  reviewed_at  timestamptz,
  created_at   timestamptz not null default now(),
  unique (kind, market, crop, market_date, source_url),
  check (case when kind = 'crop'
              then market <> '' and crop <> '' and unit is not null and price is not null
              else market = '' and crop = '' and buy is not null and sell is not null and buy <= sell end)
);

create index market_quotes_latest_idx on public.market_quotes (kind, market, crop, market_date desc) where status = 'published';
create index market_quotes_held_idx on public.market_quotes (created_at) where status = 'held';

-- One row per run of the job: what it found, published and held, and what failed.
create table public.price_runs (
  id          uuid primary key default gen_random_uuid(),
  started_at  timestamptz not null default now(),
  finished_at timestamptz,
  trigger     text not null check (trigger in ('cron','admin')),
  found       integer not null default 0,
  published   integer not null default 0,
  held        integer not null default 0,
  errors      text[] not null default '{}'
);

alter table public.market_quotes enable row level security;
alter table public.price_runs enable row level security;

revoke insert, update, delete on table public.market_quotes, public.price_runs from anon, authenticated;

create policy market_quotes_public_read on public.market_quotes
  for select to anon, authenticated using (status = 'published');
create policy market_quotes_admin_read on public.market_quotes
  for select to authenticated using (is_admin());
create policy price_runs_admin_read on public.price_runs
  for select to authenticated using (is_admin());

-- ── قرار الإدارة في المحجوز ─────────────────────────────────────────────────

create or replace function public.market_quote_review(p_id uuid, p_publish boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_admin() then raise exception 'للإدارة وحدها.'; end if;
  update market_quotes
     set status = case when p_publish then 'published' else 'rejected' end,
         reviewed_by = auth.uid(), reviewed_at = now()
   where id = p_id and status = 'held';
  if not found then raise exception 'لا رقمَ محجوزاً بهذا المعرّف.'; end if;
end;
$$;

revoke execute on function public.market_quote_review(uuid, boolean) from public, anon;
grant execute on function public.market_quote_review(uuid, boolean) to authenticated;

-- ── «آخر يومٍ بحثنا فيه» للصفحة ─────────────────────────────────────────────

-- The market page says when the platform last looked, so a quiet season
-- (no bulletin for weeks) reads as quiet, not as a page nobody updates. Only
-- the time of the last finished run leaves this function; the run's errors and
-- counts stay with the administrators.
create or replace function public.price_last_run()
returns timestamptz
language sql
stable
security definer
set search_path = public
as $$
  select max(finished_at) from price_runs;
$$;

revoke execute on function public.price_last_run() from public;
grant execute on function public.price_last_run() to anon, authenticated;
