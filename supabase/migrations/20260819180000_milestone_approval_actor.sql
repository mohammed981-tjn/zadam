-- ============================================================================
-- Milestone approval belongs to the client, not to whoever claims the work
-- ============================================================================
-- enforce_milestone_approval already checked that evidence exists and that
-- earlier phases were approved first. What it never checked was WHO was moving
-- the phase.
--
-- `milestones_parties` is `for all using (can_see_contract(contract_id))`, and
-- can_see_contract is true for `p.owner_id = auth.uid()` — the provider — just
-- as much as for the client. setMilestoneStatus in the app carries no check of
-- its own and says so, deferring to this trigger. So the provider could upload
-- its own evidence (milestone_evidence_parties allows that too), satisfy the
-- evidence check with it, move the phase to 'approved', and then to 'paid' —
-- walking a whole contract to settled without the client ever acting.
--
-- Approval is the single step that separates "claimed done" from "agreed done".
-- It has to sit with the party being asked to agree.
--
-- The split this installs:
--   provider  : in_progress, submitted   (claiming progress — unchanged)
--   client    : approved, paid           (agreeing, and recording payment)
--   admin     : anything                 (dispute resolution)
--
-- Everything else in the function is preserved exactly as it was.
-- ============================================================================

set lock_timeout = '5s';

create or replace function public.enforce_milestone_approval()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  proof_count int;
  prior_open  int;
  is_client   boolean;
begin
  -- ---------------------------------------------------------------------
  -- Who is acting. Resolved once, and only when it matters: an ordinary
  -- provider-side move to 'in_progress' or 'submitted' pays nothing for this.
  -- ---------------------------------------------------------------------
  if new.status in ('approved', 'paid')
     and new.status is distinct from old.status then

    select exists (
      select 1 from service_contracts c
       where c.id = new.contract_id
         and c.client_id = auth.uid()
    ) into is_client;

    -- auth.uid() is null for the service role and the SQL editor; those are
    -- trusted server-side paths and are left alone, exactly as the other
    -- guards in this schema do it.
    if auth.uid() is not null and not is_client and not is_admin() then
      if new.status = 'approved' then
        raise exception
          'اعتماد المرحلة من صلاحية العميل أو الإدارة — لا يمكن لمقدّم الخدمة اعتماد عمله بنفسه';
      else
        raise exception
          'تسجيل الدفع من صلاحية العميل أو الإدارة وحدهما';
      end if;
    end if;
  end if;

  if new.status = 'approved' and old.status is distinct from 'approved' then
    if new.requires_evidence then
      select count(*) into proof_count
        from milestone_evidence
       where milestone_id = new.id and storage_path is not null;
      if proof_count < 1 then
        raise exception 'لا يمكن اعتماد المرحلة قبل رفع إثبات تنفيذ واحد على الأقل — الملاحظة النصية وحدها ليست دليلاً';
      end if;
    end if;
    select count(*) into prior_open
      from contract_milestones
     where contract_id = new.contract_id
       and seq < new.seq
       and status not in ('approved','paid');
    if prior_open > 0 then
      raise exception 'لا يمكن اعتماد هذه المرحلة قبل اعتماد % مرحلة سابقة', prior_open;
    end if;
    new.approved_at := now();
    new.approved_by := auth.uid();
    if new.actual_end is null then
      new.actual_end := current_date;
    end if;
  end if;

  if new.status = 'paid' and old.status not in ('approved','paid') then
    raise exception 'لا يمكن تسجيل الدفع قبل اعتماد المرحلة';
  end if;

  return new;
end $$;

-- ============================================================================
-- Verify after applying, as the provider's own owner:
--
--   update contract_milestones set status = 'approved' where id = '<theirs>';
--   -- expected: ERROR  اعتماد المرحلة من صلاحية العميل أو الإدارة
--
-- and as the contract's client, that the ordinary path still works.
-- ============================================================================
