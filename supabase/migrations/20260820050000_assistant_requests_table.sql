-- ============================================================================
-- assistant_requests: the table the rate limiter has always written to
-- ============================================================================
-- check_assistant_rate_limit reads and writes this table, but no migration ever
-- created it — it exists only in the dashboard. So its shape, its grants and
-- whether RLS is even enabled on it were all unverifiable from the repository,
-- while the function that depends on it was fully described here.
--
-- Everything below is IF NOT EXISTS, so on the live project this is a no-op
-- that simply records what is already there. What it does change is that
-- `supabase db reset` on a branch, or a fresh local stack, now produces a
-- working limiter instead of a function that raises on a missing relation.
--
-- The column set is read off the function's own usage — it inserts `ip` and
-- filters on `created_at` — so a live table with extra columns is unaffected.
--
-- ⚠️ If the live table differs from this in a way that matters, `supabase db
-- pull` is the authority and should replace this file. This is a floor, not a
-- claim.
-- ============================================================================

set lock_timeout = '5s';

create table if not exists public.assistant_requests (
  id         bigint generated always as identity primary key,
  ip         text        not null,
  created_at timestamptz not null default now()
);

-- The limiter's hot path is "rows for this ip in the last minute", and its
-- housekeeping is "everything older than a day". One index serves both.
create index if not exists assistant_requests_ip_created_at_idx
  on public.assistant_requests (ip, created_at desc);

create index if not exists assistant_requests_created_at_idx
  on public.assistant_requests (created_at);

-- RLS on, no policies, no grants: nothing client-facing touches this table.
-- The only writer is check_assistant_rate_limit, which is SECURITY DEFINER and
-- executable by service_role alone.
alter table public.assistant_requests enable row level security;
revoke all on table public.assistant_requests from anon, authenticated;

comment on table public.assistant_requests is
  'One row per assistant question, keyed by client address, for rate limiting. '
  'Written only by public.check_assistant_rate_limit(). Holds visitor IP '
  'addresses, so it is never readable by anon or authenticated, and rows older '
  'than a day are deleted by that function on every call.';

-- ============================================================================
-- Still outside the repository after this file, and worth pulling next:
--
--   run_system_check          — called by /api/health
--   log_assistant_question    — called by the assistant route
--   public_farmer_profile     — check this one first; the name suggests it
--                               returns personal data, and its grants and
--                               row filtering cannot be reviewed from here
--   farmer_season_records     — called by the farmer profile page
--
--   supabase link --project-ref ngcbgagtjbhbbscvsfwt && supabase db pull
-- ============================================================================
