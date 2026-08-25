-- ============================================================================
-- The farmer's money leaves the public API; the public profile gains a subject
-- ============================================================================
-- Two functions from the same sweep, reviewed together because they serve the
-- same page and fail in opposite directions: one hands out too much, the other
-- hands out the wrong people.
--
--
-- 1. farmer_season_records — revoked from anon
--
-- It returns, per season, planned_budget, actual_costs and REVENUE. One
-- season's revenue is that farmer's income for that season; it is not an
-- aggregate that protects anybody. The page consuming it never prints these —
-- it computes a trust score and shows the score — so the design intent was
-- always right, and the endpoint contradicted it.
--
-- SECURITY DEFINER with EXECUTE to PUBLIC meant anyone holding the anon key,
-- which every browser on the site holds, could call it for any owner id.
--
-- The app change shipped first (PR #42): /farmers/[id] now reads this with the
-- service-role client, and distinguishes "could not read" from "no seasons"
-- rather than rendering an outage as a verdict on the person.
--
--
-- 2. public_farmer_profile — gains the filter its name implies
--
-- It returned full_name and country for ANY profile id, bypassing the RLS that
-- otherwise shows a visitor zero rows. Not just farmers: administrators,
-- investors, service-provider owners.
--
-- The obvious fix — `and p.role = 'farmer'` — is impossible: user_role is
-- (investor, admin, field_agent) and has no farmer value at all. There are, at
-- the time of writing, zero farmers by any definition and six profiles that are
-- not farmers, so a role filter was never going to be the answer.
--
-- The filter that does hold is by subject rather than by label: disclose the
-- name only for someone who actually has a season on record. That is exactly
-- the population this page exists for — it displays a season history — and a
-- profile with no seasons has nothing to show, so there is no reason to
-- disclose the name attached to it.
--
--
-- WHAT THIS DOES NOT DECIDE
--
-- Whether a farmer's record should be public at all is a product question, not
-- a security one, and it is left open deliberately. There is no consent flag on
-- profiles today: anyone with a record has it published to whoever knows their
-- id. Recommended, and not implemented here because it is the owner's call:
-- default the flag to false and let the farmer publish when they want to show
-- an investor their history — so the score is a paper in their hand rather than
-- a verdict on them.
-- ============================================================================

set lock_timeout = '5s';

revoke all on function public.farmer_season_records(uuid)
  from public, anon, authenticated;
grant execute on function public.farmer_season_records(uuid) to service_role;

create or replace function public.public_farmer_profile(p_id uuid)
returns table(id uuid, full_name text, country text, created_at timestamptz)
language sql
stable
security definer
set search_path to 'public'
as $function$
  select p.id, p.full_name, p.country, p.created_at
  from profiles p
  where p.id = p_id
    -- Not a role check: there is no farmer role. The subject of this page is
    -- someone with a season history, and that is what makes the disclosure
    -- proportionate.
    and exists (select 1 from seasons s where s.owner_id = p.id);
$function$;

-- create or replace preserves the grants, so anon keeps EXECUTE here. That is
-- intended: this is the public profile, and after the filter above it discloses
-- a name only for someone who has a public record to go with it. The phone
-- column is not selected, and never was.
grant execute on function public.public_farmer_profile(uuid)
  to anon, authenticated, service_role;

notify pgrst, 'reload schema';

-- ============================================================================
-- Verify after applying:
--
--   as anon:  farmer_season_records(<any id>)  → permission denied
--   as anon:  public_farmer_profile(<id with no seasons>)  → zero rows
--   as anon:  public_farmer_profile(<id with a season>)    → one row
--   as service_role: farmer_season_records(<id>) → still returns the record
--
-- The last one is the control. Without it this migration might have closed the
-- farmer profile page rather than the hole in it.
-- ============================================================================
