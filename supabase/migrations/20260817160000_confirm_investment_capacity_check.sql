-- فحص السعة عند تأكيد الاستثمار.
--
-- The gap this closes became visible only when the function was extracted into
-- the repository: confirm_investment incremented projects.shares_sold with no
-- comparison against total_shares. The `status = 'pending'` clause made a
-- repeated call harmless, which is why it had never shown up as a double-count —
-- but two investors each asking for the last hundred shares were both
-- confirmable, and the project oversold itself silently.
--
-- This is the far half of a two-part fix. The near half is in invest(), which
-- now refuses to record a request larger than the remaining capacity. Both are
-- needed and neither is sufficient:
--
--   · Without the check in invest(), a project accumulates pending requests it
--     can never honour and an admin has to reject them one by one.
--   · Without the check here, those requests are still confirmable, because
--     an admin confirming from the review screen never passes through the
--     application's validation at all.
--
-- The row lock is the part that matters most and is easiest to leave out. Two
-- admins confirming two investments at the same moment would both read the same
-- shares_sold, both find room, and both write — the classic lost update, and
-- the oversell survives a capacity check that lacks it. `for update` makes the
-- second wait for the first to commit, so it reads the number the first one
-- left behind.

create or replace function public.confirm_investment(p_investment_id uuid)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_project_id uuid;
  v_shares integer;
  v_total integer;
  v_sold integer;
begin
  if not is_admin() then
    raise exception 'not authorized';
  end if;

  -- Read the investment first, without changing it, so a request that fails
  -- the capacity check below stays pending and reviewable rather than being
  -- marked confirmed and then rolled back.
  select project_id, shares into v_project_id, v_shares
  from investments
  where id = p_investment_id and status = 'pending';

  -- Already confirmed, cancelled, or gone. Silent return keeps the call
  -- idempotent, which is what makes a double-click harmless.
  if v_project_id is null then
    return;
  end if;

  -- Lock the project row for the rest of this transaction. Everything after
  -- this line reads a shares_sold that no concurrent confirmation can move.
  select total_shares, shares_sold into v_total, v_sold
  from projects
  where id = v_project_id
  for update;

  if v_sold + v_shares > v_total then
    raise exception
      'لا يمكن تأكيد % حصة — المتبقّي % من أصل % حصة',
      v_shares, v_total - v_sold, v_total;
  end if;

  update investments
  set status = 'confirmed'
  where id = p_investment_id and status = 'pending';

  update projects
  set shares_sold = shares_sold + v_shares
  where id = v_project_id;
end;
$function$;

-- The database's own backstop, independent of any function.
--
-- The check above lives in the one routine that is supposed to move
-- shares_sold. This constraint holds even if a future migration, a manual
-- correction in the SQL editor, or a second confirmation path forgets it —
-- overselling stops being something code must remember not to do and becomes
-- something the table will not hold.
--
-- NOT VALID so existing rows are not re-checked on creation: nothing is
-- currently oversold, and validating a live table takes a lock this does not
-- need. New and updated rows are checked from now on.
alter table public.projects
  drop constraint if exists projects_shares_sold_within_total;

alter table public.projects
  add constraint projects_shares_sold_within_total
  check (shares_sold >= 0 and shares_sold <= total_shares)
  not valid;
