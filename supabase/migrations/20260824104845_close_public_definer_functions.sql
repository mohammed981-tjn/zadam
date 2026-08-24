-- ============================================================================
-- Four more SECURITY DEFINER functions that took arguments and trusted nobody
-- in particular
-- ============================================================================
-- Found by the sweep that 20260819180200 asked for, run immediately after
-- closing the same hole on check_assistant_rate_limit — and what it turned up
-- is worse than what it was following up on.
--
-- Postgres grants EXECUTE on a new function to PUBLIC, and PostgREST publishes
-- every function in an exposed schema as POST /rest/v1/rpc/<name>. The anon key
-- is in every browser that opens the site. So each of these was callable by
-- anyone, with arguments of their choosing:
--
--   notify_user(recipient, kind, title, body, link)
--     No authorization check of any kind — it inserts straight into
--     notifications. Anyone could send any user a notice with a chosen title,
--     body and LINK, rendered inside the platform as though the platform had
--     sent it. A phishing vector wearing our name.
--
--   notify_admins(kind, title, body, link)
--     The same, aimed at every administrator at once.
--
--   set_cached_answer(key, question, answer, ...)
--     Guards only that the key is non-empty. Anyone could write an answer of
--     their own composition into the assistant's cache under a key of their
--     choosing — putting words in the platform's mouth, which is worse than
--     locking a visitor out of it.
--
--   get_cached_answer(key)
--     Reads back whatever is there. Lower severity; revoked with its pair.
--
-- WHY THIS NEEDS NO APP CHANGE, AND HOW THAT WAS ESTABLISHED
--
-- The rate-limit migration had to ship with its code because the routes called
-- the function with the session client. These four do not, and both halves were
-- checked rather than assumed:
--
--   1. Nothing in src/ names any of them. answerCache.ts is in-process memory,
--      not this table.
--   2. Their only callers are four trigger functions — notify_admins_of_lead,
--      notify_admins_of_feedback, notify_on_land_change, notify_on_project_review
--      — and every one is SECURITY DEFINER, so it runs as its owner, who keeps
--      EXECUTE. Verified by probe: an anonymous INSERT into leads still produces
--      the administrators' notification after this ran.
--
-- confirm_investment appeared in the same sweep and is deliberately NOT here:
-- it opens with `if not is_admin() then raise exception`. It was opened and
-- read rather than judged by its shape.
-- ============================================================================

set lock_timeout = '5s';

revoke all on function public.notify_user(uuid, text, text, text, text)
  from public, anon, authenticated;

revoke all on function public.notify_admins(text, text, text, text)
  from public, anon, authenticated;

revoke all on function
  public.set_cached_answer(text, text, text, text, vector, text, integer)
  from public, anon, authenticated;

revoke all on function public.get_cached_answer(text)
  from public, anon, authenticated;

-- service_role keeps them: it is the server's own path, and a future feature
-- that needs to notify a user will go through it rather than through the
-- browser.
grant execute on function public.notify_user(uuid, text, text, text, text)
  to service_role;
grant execute on function public.notify_admins(text, text, text, text)
  to service_role;
grant execute on function
  public.set_cached_answer(text, text, text, text, vector, text, integer)
  to service_role;
grant execute on function public.get_cached_answer(text) to service_role;

notify pgrst, 'reload schema';

-- ============================================================================
-- Verified after applying, as anon:
--
--   notify_user(...)        → permission denied for function notify_user
--   notify_admins(...)      → permission denied for function notify_admins
--   set_cached_answer(...)  → permission denied for function set_cached_answer
--
-- and the controls, which matter more than the three above:
--
--   anonymous INSERT into leads → administrators' notification still fires
--   service_role set_cached_answer → still works
--
-- STILL OPEN, and next in this sweep — these return data about people and
-- their grants have not been reviewed:
--
--   public_farmer_profile(p_id uuid)
--   farmer_season_records(p_id uuid)
--
-- Both are SECURITY DEFINER and callable by anon. That may well be intended —
-- a public farmer profile is a feature — but "intended" has to be read off the
-- function body, not off the name.
-- ============================================================================
