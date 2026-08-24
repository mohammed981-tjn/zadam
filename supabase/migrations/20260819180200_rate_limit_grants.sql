-- ============================================================================
-- The rate limiter stops trusting the caller for the thing it limits by
-- ============================================================================
-- check_assistant_rate_limit is SECURITY DEFINER, takes the client IP as a
-- PARAMETER, writes a row on every call, and was never revoked. Postgres grants
-- EXECUTE on a new function to PUBLIC, and PostgREST publishes every function in
-- an exposed schema as POST /rest/v1/rpc/<name>. So anyone holding the public
-- anon key could call it directly:
--
--   1. Five calls naming a victim's IP exhaust that visitor's minute, locking
--      them out of the assistant. A NAT or campus address locks out everyone
--      behind it.
--   2. A stream of random IPs inserts a row each and grows assistant_requests
--      without bound; the internal DELETE only prunes rows older than a day.
--
-- The function keeps its signature — the route calls it by name — and gains a
-- guard, because the argument stays caller-supplied even from the service role.
--
-- ⚠️ APPLY THIS TOGETHER WITH THE APP CHANGE IN THE SAME DEPLOY.
-- The route previously called this with the ordinary session client. After the
-- revoke below that call fails, and the route's old behaviour on failure was to
-- log and continue — which would have left the paid model completely
-- unthrottled. The route now uses the service-role client and fails closed.
-- Database first, then the app, as always.
-- ============================================================================

set lock_timeout = '5s';

-- Defensive bound on the argument. The IP is supplied by the caller even when
-- the caller is our own server, so an oversized or empty value should be
-- rejected here rather than stored.
create or replace function public.check_assistant_rate_limit(p_ip text)
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_recent_count integer;
begin
  if p_ip is null or length(p_ip) = 0 or length(p_ip) > 64 then
    raise exception 'check_assistant_rate_limit: invalid client address'
      using errcode = '22023';
  end if;

  delete from assistant_requests where created_at < now() - interval '1 day';

  select count(*) into v_recent_count
  from assistant_requests
  where ip = p_ip and created_at > now() - interval '1 minute';

  if v_recent_count >= 5 then
    return false;
  end if;

  insert into assistant_requests (ip) values (p_ip);
  return true;
end;
$function$;

alter function public.check_assistant_rate_limit(text) owner to postgres;

revoke all on function public.check_assistant_rate_limit(text)
  from public, anon, authenticated;
grant execute on function public.check_assistant_rate_limit(text) to service_role;

-- ----------------------------------------------------------------------------
-- Flip the default for everything created from here on.
--
-- One revoke against nineteen functions is not an oversight in one migration,
-- it is a default pointing the wrong way: every new function ships callable by
-- PUBLIC unless somebody remembers. This makes remembering unnecessary.
--
-- It applies only to functions created AFTER this runs, by the role that runs
-- it. It does not retroactively fix anything — for that, sweep proacl:
--
--   select n.nspname, p.proname, p.proacl
--   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--   where n.nspname = 'public'
--     and (p.proacl is null or array_to_string(p.proacl, ',') like '%=X/%');
--   -- proacl NULL means "executable by PUBLIC"
--
-- Trigger functions returning `trigger` are safe to leave: they cannot be
-- invoked meaningfully over PostgREST. The ones worth checking are those that
-- take arguments and write.
-- ----------------------------------------------------------------------------
alter default privileges in schema public revoke execute on functions from public;

notify pgrst, 'reload schema';

-- ============================================================================
-- Verify after applying:
--
--   select proacl from pg_proc where proname = 'check_assistant_rate_limit';
--   -- expect service_role=X/postgres and postgres=X/postgres only,
--   -- with no bare "=X/" entry (that is PUBLIC) and no anon=X/
--
-- And from the browser with the anon key, confirm the RPC now 404s or 403s.
-- ============================================================================
