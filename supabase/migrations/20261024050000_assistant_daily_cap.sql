-- سقفٌ يوميّ على النموذج المدفوع (البند ١٦٣، SEC-9).
--
-- The assistant's limiter counts requests per minute per address, and nothing counts the day.
-- The model behind it is paid per call, so the cost of a day was bounded only by how many
-- addresses a caller could rotate through. This adds the two ceilings the review asked for, in
-- the database, so every serverless instance counts into the same place:
--
--   - per address, per day;
--   - in total, per day.
--
-- Only a call that is about to reach the paid model counts. A question the platform answers from
-- its own tables, or from the curated knowledge, costs nothing and is not counted. The check runs
-- right before the model call and fails closed: if it cannot answer, the model is not called and
-- the visitor gets the nearest curated answer, as when every engine is down.
--
-- The two numbers are policy, not measurements. They live in a table, `platform_limits`, so the
-- owner can change them from the SQL editor without a deploy:
--
--   update platform_limits set value = 3000, updated_at = now() where key = 'model_daily_total';
--
-- The rows reuse assistant_requests (key prefix «model:»), which check_assistant_rate_limit
-- already prunes after a day. Nothing is dropped; no existing function is replaced.

create table if not exists public.platform_limits (
  key        text primary key check (key ~ '^[a-z_]{2,40}$'),
  value      integer not null check (value > 0),
  note       text,
  updated_at timestamptz not null default now()
);

-- RLS on and no policy: only the function below (and the SQL editor) reads it.
alter table public.platform_limits enable row level security;

insert into public.platform_limits (key, value, note) values
  ('model_daily_per_address', 60,
   'أقصى ما يطلبه عنوانٌ واحد من النموذج المدفوع في اليوم. يُعدَّل من محرّر SQL.'),
  ('model_daily_total', 1500,
   'أقصى ما تطلبه المنصّة كلّها من النموذج المدفوع في اليوم. يُعدَّل من محرّر SQL.')
  on conflict (key) do nothing;

create or replace function public.check_model_budget(p_ip text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_per_address integer;
  v_total       integer;
  v_used        integer;
begin
  if p_ip is null or length(p_ip) = 0 or length(p_ip) > 64 or p_ip not like 'model:%' then
    raise exception 'check_model_budget: invalid client address'
      using errcode = '22023';
  end if;

  select value into v_per_address from platform_limits where key = 'model_daily_per_address';
  select value into v_total       from platform_limits where key = 'model_daily_total';
  -- A removed row is not an unlimited budget.
  if v_per_address is null or v_total is null then
    return 'unavailable';
  end if;

  -- Two requests at the ceiling at the same moment must not both pass.
  perform pg_advisory_xact_lock(hashtext('model_budget'));

  select count(*) into v_used
    from assistant_requests
   where ip like 'model:%' and created_at > now() - interval '1 day';
  if v_used >= v_total then
    return 'total_day';
  end if;

  select count(*) into v_used
    from assistant_requests
   where ip = p_ip and created_at > now() - interval '1 day';
  if v_used >= v_per_address then
    return 'address_day';
  end if;

  insert into assistant_requests (ip) values (p_ip);
  return 'ok';
end;
$$;

revoke execute on function public.check_model_budget(text) from public, anon, authenticated;
grant execute on function public.check_model_budget(text) to service_role;
