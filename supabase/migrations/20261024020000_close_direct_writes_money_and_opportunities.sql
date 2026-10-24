-- إغلاق الكتابة المباشرة على الاستثمار والفرصة وسجلّ المنفّذ (البند ١٥٨).
--
-- The review of 23 October (SEC-2, DB-1, BUG-1, BUG-2, DB-18, SEC-6, DB-4, BUG-5,
-- DB-5, BUG-6) found the same pattern as in 20261024010000, now on the money path:
-- the rule is in a server action, while row-level security lets the browser write
-- the table.
--
--   - `investments_insert` lets an investor insert a pending request straight
--     through PostgREST: any project (draft, demo, closed), any share count (the
--     remaining capacity is checked only in the action), any amount (the action
--     derives it from the price; the table accepts whatever comes);
--   - the administrator's UPDATE policy lets «confirmed» be written directly,
--     around `confirm_investment`, which is the only place that checks capacity,
--     locks the project row and writes the audit log;
--   - `confirm_investment` itself confirms a request on a demo or draft project;
--   - a farmer submitting an opportunity can write the shares «sold» and the
--     expected annual return, and later change its risk level;
--   - a user can write their own track record, `profiles.completed_seasons` and
--     `reporting_rate`, which the platform computes from closed seasons.
--
-- INVESTMENT_LIVE was a TypeScript constant: the database could not know it. A
-- database refuses the money path now, and a forged request got through only
-- because the refusal lived in the action. The switch moves into a table,
-- `platform_flags`, read by the app and by the trigger — one switch, one place.
-- It is `false`, as the constant was; nothing here opens investment.
--
-- Like the previous migration, nothing is dropped or replaced except the audit
-- outcome list (one more word, same constraint name) and two functions replaced
-- with their own text plus the new lines. The guards leave alone `auth.uid() is
-- null` (the service role and the SQL editor) and administrators, except that
-- no one — an administrator included — confirms an investment around the
-- function or edits a request after it is made.

-- ═══════════════════════════════════════════════════════════════════════════
-- ١) مفاتيح المنصّة: مفتاح الاستثمار في القاعدة لا في الكود
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.platform_flags (
  key        text primary key check (key ~ '^[a-z_]{2,40}$'),
  enabled    boolean not null default false,
  note       text,
  updated_at timestamptz not null default now()
);

alter table public.platform_flags enable row level security;
revoke all on public.platform_flags from public, anon, authenticated;
grant select on public.platform_flags to anon, authenticated;
create policy platform_flags_read on public.platform_flags
  for select to anon, authenticated using (true);

insert into public.platform_flags (key, enabled, note) values
  ('investment_live', false,
   'يبقى false حتى تُوجد فرصٌ حقيقيّةٌ موثّقة. يقلبه المالك من محرّر SQL: update platform_flags set enabled = true, updated_at = now() where key = ''investment_live''.')
  on conflict (key) do nothing;

-- ═══════════════════════════════════════════════════════════════════════════
-- ٢) الاستثمار: لا طلبَ إلا على فرصةٍ مفتوحة، بحصصٍ متبقّية، بمبلغٍ من سعر الحصّة
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.investment_insert_gate()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare v projects;
begin
  if auth.uid() is not null and not is_admin() then
    if not coalesce((select enabled from platform_flags where key = 'investment_live'), false) then
      raise exception 'الاستثمار غير مفتوح بعد. سجّل اهتمامك وسنبلغك فور إتاحته.';
    end if;
    select * into v from projects where id = new.project_id;
    if v.id is null or v.status <> 'open' or v.is_demo or v.review_status <> 'approved' then
      raise exception 'هذه الفرصة غير مفتوحةٍ للاستثمار.';
    end if;
    if new.shares is null or new.shares < 1 then
      raise exception 'عدد الحصص غير صالح.';
    end if;
    if new.shares > v.total_shares - v.shares_sold then
      raise exception 'المتبقّي % حصة فقط.', v.total_shares - v.shares_sold;
    end if;
    if new.amount is distinct from new.shares * v.price_per_share then
      raise exception 'المبلغ يُحسب من سعر حصّة المشروع، لا من الطلب.';
    end if;
  end if;
  return new;
end;
$$;

-- A request is not edited after it is made, and «confirmed» is written only by
-- confirm_investment, which says so through a setting that lives for its own
-- transaction.
create or replace function public.investment_keep_gate()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is not null then
    if new.project_id is distinct from old.project_id
       or new.investor_id is distinct from old.investor_id
       or new.shares is distinct from old.shares
       or new.amount is distinct from old.amount then
      raise exception 'لا يُعدَّل طلبُ استثمارٍ بعد رفعه.';
    end if;
    if new.status = 'confirmed' and old.status is distinct from 'confirmed'
       and coalesce(current_setting('app.confirming_investment', true), '') <> '1' then
      raise exception 'يُؤكَّد الاستثمار بدالّة التأكيد وحدها.';
    end if;
  end if;
  return new;
end;
$$;

create trigger investments_insert_gate
  before insert on public.investments
  for each row execute function public.investment_insert_gate();
create trigger investments_keep_gate
  before update on public.investments
  for each row execute function public.investment_keep_gate();

-- The audit log learns one more refusal: a request on a project that is not open.
alter table public.investment_events drop constraint investment_events_outcome_check;
alter table public.investment_events add constraint investment_events_outcome_check
  check (outcome = any (array['confirmed', 'not_pending', 'over_allocated', 'not_open']));

-- confirm_investment, as it is, plus two things: the project must be open and
-- real (BUG-2), and the function announces itself to investment_keep_gate.
create or replace function public.confirm_investment(p_investment_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_project_id uuid;
  v_shares     integer;
  v_status     text;
  v_total      integer;
  v_sold       integer;
  v_pstatus    text;
  v_demo       boolean;
begin
  if not is_admin() then
    raise exception 'not authorized';
  end if;

  select i.project_id, i.shares, i.status::text
    into v_project_id, v_shares, v_status
    from investments i
   where i.id = p_investment_id;

  if not found then
    return 'not_found';
  end if;

  if v_status <> 'pending' then
    insert into investment_events
      (investment_id, project_id, actor_id, outcome, reason, shares)
    values (p_investment_id, v_project_id, auth.uid(), 'not_pending',
            'حالةُ الطلب ' || v_status, v_shares);
    return 'not_pending';
  end if;

  select p.total_shares, p.shares_sold, p.status::text, p.is_demo
    into v_total, v_sold, v_pstatus, v_demo
    from projects p
   where p.id = v_project_id
     for update;

  if v_pstatus <> 'open' or v_demo then
    insert into investment_events
      (investment_id, project_id, actor_id, outcome, reason, shares)
    values (p_investment_id, v_project_id, auth.uid(), 'not_open',
            case when v_demo then 'مشروعٌ تجريبيّ' else 'حالةُ المشروع ' || v_pstatus end, v_shares);
    return 'not_open';
  end if;

  if v_sold + v_shares > v_total then
    insert into investment_events
      (investment_id, project_id, actor_id, outcome, reason,
       shares, shares_sold_before, shares_sold_after)
    values (p_investment_id, v_project_id, auth.uid(), 'over_allocated',
            format('طُلبت %s حصة والمتبقّي %s من أصل %s',
                   v_shares, v_total - v_sold, v_total),
            v_shares, v_sold, v_sold);
    return 'over_allocated';
  end if;

  perform set_config('app.confirming_investment', '1', true);

  update investments
     set status = 'confirmed'
   where id = p_investment_id and status = 'pending';

  update projects
     set shares_sold = shares_sold + v_shares
   where id = v_project_id;

  insert into investment_events
    (investment_id, project_id, actor_id, outcome,
     shares, shares_sold_before, shares_sold_after)
  values (p_investment_id, v_project_id, auth.uid(), 'confirmed',
          v_shares, v_sold, v_sold + v_shares);

  perform set_config('app.confirming_investment', '', true);
  return 'confirmed';
end $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- ٣) الفرصة: ما يكتبه الرافع وما لا يكتبه
-- ═══════════════════════════════════════════════════════════════════════════

-- The farmer says what the opportunity is. The platform says what sold and what
-- it is worth: the shares sold start at zero, the expected return is the
-- administration's to publish, and the risk level assessed at submission is
-- not changed afterwards by the one it describes.
create or replace function public.project_submission_gate()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is not null and not is_admin() then
    if tg_op = 'INSERT' then
      if new.shares_sold <> 0 or new.expected_annual_return is not null then
        raise exception 'المباع والعائد المتوقّع تكتبهما الإدارة، لا الرافع.';
      end if;
    else
      if new.shares_sold is distinct from old.shares_sold
         or new.expected_annual_return is distinct from old.expected_annual_return
         or new.risk_level is distinct from old.risk_level then
        raise exception 'المباع والعائد ودرجة المخاطرة تكتبها الإدارة، لا الرافع.';
      end if;
    end if;
  end if;
  return new;
end;
$$;

create trigger projects_submission_gate
  before insert or update on public.projects
  for each row execute function public.project_submission_gate();

-- ═══════════════════════════════════════════════════════════════════════════
-- ٤) سجلّ المنفّذ: تحسبه المنصّة من المواسم المُقفلة
-- ═══════════════════════════════════════════════════════════════════════════

-- `profiles_update` lets a user write their own row, so completed_seasons and
-- reporting_rate, which price their own opportunities, were theirs to write.
-- The columns now keep their value unless the platform's own function moves
-- them (refresh_operator_record, below). Reverted, not refused, as the role
-- guard does: a form that updates the name does not fail because of them.
create or replace function public.profile_operator_record_gate()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is not null and not is_admin()
     and coalesce(current_setting('app.operator_record', true), '') <> '1' then
    new.completed_seasons := old.completed_seasons;
    new.reporting_rate := old.reporting_rate;
  end if;
  return new;
end;
$$;

create trigger profiles_operator_record_gate
  before update on public.profiles
  for each row execute function public.profile_operator_record_gate();

-- Production already has this function (the 9 live functions with no file, DB-10);
-- it is written here as it is, plus the one line that says the platform is the writer.
create or replace function public.refresh_operator_record()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  done int;
  total_stages int;
  signed_stages int;
begin
  if new.status = 'completed' and coalesce(old.status,'') <> 'completed' then
    select count(*) into done from seasons
      where owner_id = new.owner_id and status = 'completed';

    select count(*), count(*) filter (where completed)
      into total_stages, signed_stages
      from season_stages st join seasons s on s.id = st.season_id
      where s.owner_id = new.owner_id;

    perform set_config('app.operator_record', '1', true);

    update profiles
      set completed_seasons = done,
          reporting_rate = case when total_stages > 0
                                then round((signed_stages::numeric / total_stages), 2)
                                else 0 end
      where id = new.owner_id;

    perform set_config('app.operator_record', '', true);
  end if;
  return new;
end $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- الصلاحيّات
-- ═══════════════════════════════════════════════════════════════════════════

revoke execute on function public.investment_insert_gate() from public, anon, authenticated;
revoke execute on function public.investment_keep_gate() from public, anon, authenticated;
revoke execute on function public.project_submission_gate() from public, anon, authenticated;
revoke execute on function public.profile_operator_record_gate() from public, anon, authenticated;
