-- ============================================================================
-- A farmer's record becomes public because they said so, not by default
-- ============================================================================
-- The previous migration stopped the money leaking and limited the public
-- profile to people who actually have a season on record. What it deliberately
-- did not decide was whether that record should be public at all — a product
-- question, left to the owner, and now answered: opt-in.
--
-- WHY OPT-IN IS THE CONSISTENT ANSWER, NOT THE CAUTIOUS ONE
--
-- The platform's claim about itself is that it publishes nothing without
-- grounds: no project before its documents are checked, no figure without its
-- source. Publishing a farmer's season history without asking would contradict
-- that in the one place it costs most — this is the same person being asked to
-- hand over their land documents and their season's numbers.
--
-- And a losing season follows its owner in public forever. Farming in Sudan
-- loses for reasons that are not the farmer's doing: rain that came late, a
-- market that collapsed, a road that closed. A score does not know the
-- difference.
--
-- Off by default makes the trust score a paper in the farmer's hand rather than
-- a verdict on them. That is a difference in meaning, not in settings.
--
-- SAFE TO APPLY BEFORE ITS UI
--
-- The column defaults to false and no season exists in the project yet, so the
-- gate below changes nothing visible today. The switch lives on /seasons and
-- ships in the same pull request.
-- ============================================================================

set lock_timeout = '5s';

alter table public.profiles
  add column if not exists publish_record boolean not null default false;

comment on column public.profiles.publish_record is
  'Owner consent for public_farmer_profile to disclose this person. False by '
  'default; only the owner may change it, through /seasons.';

/*
 * The gate goes on the profile function rather than on the record function,
 * and that is the whole enforcement.
 *
 * /farmers/[id] calls public_farmer_profile first and calls notFound() when it
 * returns nothing, so an unpublished record yields a 404 before the season
 * reader is ever reached. One condition, one place, no second copy to drift.
 */
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
    and p.publish_record
    -- Not a role check: there is no farmer role in user_role. The subject of
    -- this page is someone with a season history, and consent without a subject
    -- would publish an empty page carrying a real name.
    and exists (select 1 from seasons s where s.owner_id = p.id);
$function$;

grant execute on function public.public_farmer_profile(uuid)
  to anon, authenticated, service_role;

/*
 * The owner writes this column through the ordinary profiles policy, which is
 * already scoped to their own row — so no new policy is needed and none is
 * added. What is worth stating: the server action reads the id from the
 * session, never from the submitted form.
 */

notify pgrst, 'reload schema';

-- ============================================================================
-- Verify after applying:
--
--   as anon, public_farmer_profile(<id with a season, publish_record false>)
--     → zero rows
--   then set publish_record true for that id
--     → one row
--
-- The second is the control: a consent flag that never lets anyone through is
-- not consent, it is a wall.
-- ============================================================================
