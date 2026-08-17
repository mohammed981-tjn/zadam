-- توثيق السياسات والحُرّاس القائمة — أول إخراج لها من القاعدة إلى المستودع.
--
-- Everything in this file already exists in the live database and has since
-- before there was a migrations directory. Nothing here changes behaviour: it
-- is `create or replace` and `create policy if not exists`-equivalent, written
-- so a reviewer can read the platform's access rules without database
-- credentials.
--
-- WHY THIS FILE MATTERS MORE THAN IT LOOKS
--
-- mobile/README promises that "every table is protected by row-level
-- policies". That was true and unverifiable — no reader could check it, and
-- neither could any contributor. A security claim nobody can audit is worth
-- very little, however correct it happens to be.
--
-- Extracting them proved the point twice over. Reading these definitions
-- surfaced two things nobody had written down:
--
--   1. confirm_investment increments projects.shares_sold with no check against
--      total_shares, so a project can be confirmed past its own capacity. See
--      the comment at that function.
--   2. check_assistant_rate_limit deletes a day of rows on every single call,
--      and its count-then-insert is not atomic. Neither is urgent at current
--      traffic; both are invisible while the function lives only in the
--      database.
--
-- APPLYING THIS TO A FRESH DATABASE
--
-- This file assumes the tables, enums and triggers already exist — it captures
-- policies and functions only. A from-scratch rebuild needs the table
-- definitions too, which are not yet extracted. That gap is stated here rather
-- than left for someone to discover mid-restore.

-- ===========================================================================
-- Core identity and authorisation
-- ===========================================================================

-- The predicate almost every policy in this file rests on. SECURITY DEFINER so
-- it can read profiles regardless of the caller's own access to that table.
create or replace function public.is_admin()
 returns boolean
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select exists (
    select 1 from profiles where id = auth.uid() and role = 'admin'
  );
$function$;

-- Every new auth user gets a profile, as an investor. The role is never taken
-- from signup input — see prevent_self_role_escalation for the other half.
create or replace function public.handle_new_user()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  insert into profiles (id, full_name, role, phone)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    'investor',
    -- new.phone is set only by Supabase's own phone provider; the metadata key
    -- is what this platform's signup writes. Either may be absent.
    nullif(coalesce(new.phone, new.raw_user_meta_data->>'phone', ''), '')
  );
  return new;
end;
$function$;

-- profiles_update lets a user update their own row, and that row carries their
-- role. This is what stops the obvious consequence.
--
-- Note it reverts silently rather than raising. That is a deliberate choice: an
-- error would tell someone probing exactly which field the guard watches, while
-- a silent revert leaves them with a successful-looking write and no change.
create or replace function public.prevent_self_role_escalation()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  if new.role is distinct from old.role
     and auth.uid() is not null
     and not is_admin() then
    new.role := old.role;
  end if;
  return new;
end $function$;

-- ===========================================================================
-- The rate limiter — the platform's only guard on its public endpoints
-- ===========================================================================

-- Five requests per key per minute. /api/assistant and /api/leads both depend
-- on this and on nothing else.
--
-- Two things are worth knowing now that it is readable:
--
--   · It deletes a day's expired rows on every call. That is a scan and a write
--     on the hot path of the platform's busiest endpoint. Fine at current
--     traffic, and the first thing to move to a scheduled job if that changes.
--   · count-then-insert is not atomic, so two simultaneous requests can both
--     see four and both insert. The window overshoots slightly under
--     concurrency. Acceptable for abuse prevention, wrong for anything
--     billed.
create or replace function public.check_assistant_rate_limit(p_ip text)
 returns boolean
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_recent_count integer;
begin
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

-- ===========================================================================
-- Publication gates — what may become visible, and who may make it so
-- ===========================================================================

create or replace function public.enforce_publication_gate()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  if new.status <> 'draft' and new.review_status <> 'approved' then
    raise exception 'لا يمكن نشر مشروع قبل اعتماد المراجعة';
  end if;

  if new.status <> 'draft'
     and new.is_demo = false
     and new.documents_on_file < new.documents_required then
    raise exception 'لا يمكن نشر مشروع بتوثيق ناقص (% من %)',
      new.documents_on_file, new.documents_required;
  end if;

  -- An authenticated non-admin is a farmer and may not move a project through
  -- review. auth.uid() is null only for the service role and the SQL editor.
  if auth.uid() is not null and not is_admin() then
    if tg_op = 'UPDATE' and
       (new.review_status is distinct from old.review_status
        or new.status is distinct from old.status
        or new.risk_score is distinct from old.risk_score
        or new.is_demo is distinct from old.is_demo) then
      raise exception 'تغيير حالة المراجعة أو النشر متاح للإدارة فقط';
    end if;
    if tg_op = 'INSERT' and (new.review_status <> 'submitted' or new.status <> 'draft') then
      raise exception 'الفرص الجديدة تُرفع كمسودة قيد المراجعة';
    end if;
  end if;

  return new;
end $function$;

create or replace function public.enforce_land_listing_gate()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  if new.listed and new.verification <> 'verified' then
    raise exception 'لا يمكن نشر أرض قبل التحقق منها';
  end if;

  if new.listed and new.documents_on_file < new.documents_required then
    raise exception 'لا يمكن نشر أرض بتوثيق ناقص (% من %)',
      new.documents_on_file, new.documents_required;
  end if;

  if auth.uid() is not null and not is_admin() then
    if tg_op = 'UPDATE' and
       (new.verification is distinct from old.verification
        or new.listed is distinct from old.listed) then
      raise exception 'التحقق والنشر من صلاحية الإدارة';
    end if;
    if tg_op = 'INSERT' and (new.verification not in ('unverified','submitted') or new.listed) then
      raise exception 'الأرض الجديدة تُسجَّل غير محقّقة';
    end if;
  end if;

  return new;
end $function$;

-- ===========================================================================
-- Money
-- ===========================================================================

-- Confirming an investment: admin only, idempotent, and it is what moves
-- shares_sold.
--
-- KNOWN GAP, visible for the first time now that this is in the repository:
-- there is no capacity check. shares_sold is incremented with no comparison
-- against projects.total_shares, so confirming enough pending investments
-- oversells a project past its own size, silently. The `status = 'pending'`
-- clause makes a repeated call harmless, which is why this has never shown up
-- as a double-count — but two different investors filling the last hundred
-- shares each will both be confirmable.
--
-- Not fixed in this file on purpose: this migration documents what exists, and
-- changing behaviour here would hide the change inside a file whose whole claim
-- is that it changes nothing. It belongs with the other half of the same
-- problem — invest() still takes price_per_share from the browser — and both
-- should be fixed together before INVESTMENT_LIVE is turned on.
create or replace function public.confirm_investment(p_investment_id uuid)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_project_id uuid;
  v_shares integer;
begin
  if not is_admin() then
    raise exception 'not authorized';
  end if;

  update investments
  set status = 'confirmed'
  where id = p_investment_id and status = 'pending'
  returning project_id, shares into v_project_id, v_shares;

  if v_project_id is null then
    return;
  end if;

  update projects
  set shares_sold = shares_sold + v_shares
  where id = v_project_id;
end;
$function$;

-- ===========================================================================
-- Notifications
-- ===========================================================================

-- A recipient may mark a notification read and change nothing else. Without
-- this, notifications_update_own would let anyone rewrite the text of their own
-- notifications — harmless alone, misleading in a screenshot.
create or replace function public.notifications_only_read_at()
 returns trigger
 language plpgsql
as $function$
begin
  if new.recipient_id is distinct from old.recipient_id
     or new.kind is distinct from old.kind
     or new.title is distinct from old.title
     or new.body is distinct from old.body
     or new.link is distinct from old.link
     or new.created_at is distinct from old.created_at then
    raise exception 'يمكن تعديل حالة القراءة فقط';
  end if;
  return new;
end $function$;

-- ===========================================================================
-- Row-level policies, as they stand in the live database
-- ===========================================================================
--
-- Dropped and recreated so this file is idempotent. The shape is consistent
-- across the platform: ownership is walked up the parent chain to a single
-- owner, with `or is_admin()` beside it. service_contracts is the one exception
-- and is documented in its own migration, being the first table with two
-- legitimate parties.

do $$
declare r record;
begin
  for r in
    select c.relname as tbl, p.polname
    from pg_policy p
    join pg_class c on c.oid = p.polrelid
    join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
    where c.relname in (
      'assistant_answers','assistant_questions','custody_events','custody_evidence',
      'gold_lots','investments','knowledge_entries','land_documents','lands','leads',
      'ledger_entries','mine_sites','notifications','profiles','project_updates',
      'projects','season_stages','seasons','stage_evidence','system_checks')
  loop
    execute format('drop policy if exists %I on public.%I', r.polname, r.tbl);
  end loop;
end $$;

-- profiles: a user sees and edits their own row; role changes are reverted by
-- prevent_self_role_escalation above.
create policy profiles_select on public.profiles
  for select using ((id = auth.uid()) or is_admin());
create policy profiles_insert on public.profiles
  for insert with check (id = auth.uid());
create policy profiles_update on public.profiles
  for update using ((id = auth.uid()) or is_admin());

-- projects: drafts are invisible except to their author and admins.
create policy projects_select on public.projects
  for select using ((status <> 'draft'::project_status) or is_admin());
create policy projects_select_own on public.projects
  for select to authenticated using (submitted_by = auth.uid());
create policy projects_submit on public.projects
  for insert to authenticated
  with check (submitted_by = auth.uid()
              and review_status = 'submitted'::review_status
              and status = 'draft'::project_status
              and is_demo = false);
create policy projects_update_own on public.projects
  for update to authenticated
  using (submitted_by = auth.uid() and review_status = 'submitted'::review_status)
  with check (submitted_by = auth.uid()
              and review_status = 'submitted'::review_status
              and status = 'draft'::project_status);
create policy projects_admin_all on public.projects
  for all using (is_admin()) with check (is_admin());

create policy project_updates_select on public.project_updates
  for select using (true);
create policy project_updates_admin_all on public.project_updates
  for all using (is_admin()) with check (is_admin());

-- investments: an investor sees only their own, and may only ever create a
-- pending one. Confirmation goes through confirm_investment.
create policy investments_select on public.investments
  for select using ((investor_id = auth.uid()) or is_admin());
create policy investments_insert on public.investments
  for insert with check (investor_id = auth.uid()
                         and status = 'pending'::investment_status);
create policy investments_admin_update on public.investments
  for update using (is_admin());

-- lands and their documents.
create policy lands_own on public.lands
  for all to authenticated
  using ((owner_id = auth.uid()) or is_admin())
  with check ((owner_id = auth.uid()) or is_admin());
create policy lands_public_read on public.lands
  for select to authenticated, anon
  using (listed and (verification = 'verified'::text));
create policy land_documents_own on public.land_documents
  for all to authenticated
  using (exists (select 1 from lands l
                  where l.id = land_documents.land_id
                    and ((l.owner_id = auth.uid()) or is_admin())))
  with check (exists (select 1 from lands l
                       where l.id = land_documents.land_id
                         and ((l.owner_id = auth.uid()) or is_admin())));

-- seasons, their stages, their evidence and their ledger: one ownership chain.
create policy seasons_own on public.seasons
  for all to authenticated
  using ((owner_id = auth.uid()) or is_admin())
  with check ((owner_id = auth.uid()) or is_admin());
create policy stages_own on public.season_stages
  for all to authenticated
  using (exists (select 1 from seasons s
                  where s.id = season_stages.season_id
                    and ((s.owner_id = auth.uid()) or is_admin())))
  with check (exists (select 1 from seasons s
                       where s.id = season_stages.season_id
                         and ((s.owner_id = auth.uid()) or is_admin())));
create policy evidence_own on public.stage_evidence
  for all to authenticated
  using (exists (select 1 from season_stages st
                   join seasons s on s.id = st.season_id
                  where st.id = stage_evidence.stage_id
                    and ((s.owner_id = auth.uid()) or is_admin())))
  with check (exists (select 1 from season_stages st
                        join seasons s on s.id = st.season_id
                       where st.id = stage_evidence.stage_id
                         and ((s.owner_id = auth.uid()) or is_admin())));
create policy ledger_own on public.ledger_entries
  for all to authenticated
  using (exists (select 1 from seasons s
                  where s.id = ledger_entries.season_id
                    and ((s.owner_id = auth.uid()) or is_admin())))
  with check (exists (select 1 from seasons s
                       where s.id = ledger_entries.season_id
                         and ((s.owner_id = auth.uid()) or is_admin())));

-- mining: the same chain, one level deeper.
create policy mine_sites_own on public.mine_sites
  for all to authenticated
  using ((owner_id = auth.uid()) or is_admin())
  with check ((owner_id = auth.uid()) or is_admin());
create policy gold_lots_own on public.gold_lots
  for all to authenticated
  using ((owner_id = auth.uid()) or is_admin())
  with check ((owner_id = auth.uid()) or is_admin());
create policy custody_events_own on public.custody_events
  for all to authenticated
  using (exists (select 1 from gold_lots l
                  where l.id = custody_events.lot_id
                    and ((l.owner_id = auth.uid()) or is_admin())))
  with check (exists (select 1 from gold_lots l
                       where l.id = custody_events.lot_id
                         and ((l.owner_id = auth.uid()) or is_admin())));
create policy custody_evidence_own on public.custody_evidence
  for all to authenticated
  using (exists (select 1 from custody_events e
                   join gold_lots l on l.id = e.lot_id
                  where e.id = custody_evidence.event_id
                    and ((l.owner_id = auth.uid()) or is_admin())))
  with check (exists (select 1 from custody_events e
                        join gold_lots l on l.id = e.lot_id
                       where e.id = custody_evidence.event_id
                         and ((l.owner_id = auth.uid()) or is_admin())));

-- The knowledge base is world-readable by design. src/types/database.ts says
-- the same thing at assistant_only: that flag is a presentation choice, not
-- access control, and nothing confidential belongs in this table.
create policy knowledge_entries_select on public.knowledge_entries
  for select using (true);
create policy knowledge_entries_admin_all on public.knowledge_entries
  for all using (is_admin()) with check (is_admin());

-- leads: anyone may submit, only admins may read. The insert policy is
-- deliberately `with check (true)` — a visitor has no account to own the row.
create policy leads_insert_public on public.leads
  for insert with check (true);
create policy leads_select_admin on public.leads
  for select using (is_admin());

create policy notifications_read_own on public.notifications
  for select using (recipient_id = auth.uid());
create policy notifications_update_own on public.notifications
  for update using (recipient_id = auth.uid())
  with check (recipient_id = auth.uid());

create policy assistant_questions_admin_read on public.assistant_questions
  for select to authenticated using (is_admin());
create policy assistant_answers_admin_all on public.assistant_answers
  for all using (is_admin());

create policy system_checks_admin_read on public.system_checks
  for select using (exists (select 1 from profiles p
                             where p.id = auth.uid()
                               and p.role = 'admin'::user_role));
