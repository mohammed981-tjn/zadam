-- إغلاق الكتابة المباشرة على الصرف والأدلّة والدفتر (البند ١٥٧).
--
-- The review of 23 October (docs/review-2026-10-23-ar.md, SEC-3, DB-2, BUG-3,
-- SEC-4, DB-3, BUG-4, DB-8, BUG-27, DB-6) found one pattern in every table that
-- holds trust or money: the rule is written in a server action or in a trigger
-- that runs on UPDATE alone, while the row-level policy lets the owner write
-- the table directly through PostgREST. So a farmer's browser can:
--
--   - insert a stage that is already «completed», skipping the gate that wants
--     a file first (the gate runs on UPDATE only);
--   - un-complete a stage, rewrite its dates, reorder it, or delete the stage
--     before the one that is still open so a later one «has no open
--     predecessor»;
--   - withdraw approved evidence in two steps — delete the row, then the file
--     (the storage policy refuses the file only while the row still says the
--     stage is complete);
--   - point an evidence row at a path nobody uploaded, or at another person's
--     folder;
--   - rewrite or erase the ledger of a closed season, reopen it, and unlink a
--     season from the partnership it was started from.
--
-- (The live database holds seven «completed» stages with no file at all. They
-- are the test season's, whose evidence rows were deleted at the owner's order
-- on 24 September — backlog 27. Nothing here changes them.)
--
-- THE RULE THESE TRIGGERS SHARE
--
-- Once something was accepted on the strength of a record, the record stays
-- what it was (the sentence the evidence-lock migration already says). A person
-- who is not an administrator, writing through the API, cannot rewrite what an
-- approval relied on. Three things are deliberately left alone:
--
--   - `auth.uid() is null` — the service role and the SQL editor. These
--     triggers guard what a signed-in browser can do, not the operator;
--   - administrators, who correct data and are themselves audited;
--   - everything before the approval: a draft stage, an open season, evidence
--     on a stage not yet closed all stay editable, because someone who uploads
--     the wrong photograph must be able to take it back.
--
-- No policy is dropped or replaced, and no row is deleted or changed. Each
-- guard is a trigger, added beside what already exists, and the app's own
-- writes (seasons/actions.ts, lands/documents/actions.ts) pass through them
-- unchanged: gate/verify-direct-writes.sh proves both halves, that the bypass
-- is refused AND that the ordinary path still works.

-- ═══════════════════════════════════════════════════════════════════════════
-- ١) مراحل الموسم
-- ═══════════════════════════════════════════════════════════════════════════

-- A stage is born open. The completion gate (enforce_stage_completion) runs on
-- UPDATE and wants a file; an INSERT with completed = true never reached it.
create or replace function public.season_stage_insert_gate()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is not null and not is_admin() then
    if new.completed or new.completed_at is not null then
      raise exception 'تُدرَج المرحلة مفتوحةً؛ وتُعتمد بعد رفع دليلها.';
    end if;
  end if;
  return new;
end;
$$;

-- A stage that was approved stays approved, and the order of the plan is fixed
-- (the gate counts open stages with a smaller stage_order, so changing the
-- order or the season would let a later stage close past an open one).
create or replace function public.season_stage_freeze_gate()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is not null and not is_admin() then
    if new.season_id is distinct from old.season_id
       or new.stage_order is distinct from old.stage_order
       or new.stage_key is distinct from old.stage_key then
      raise exception 'خطّة الموسم ثابتة: لا يُنقل ترتيب المراحل ولا موسمها.';
    end if;
    if old.completed then
      if not new.completed then
        raise exception 'مرحلةٌ اعتُمدت لا تُرجَع إلى الفتح.';
      end if;
      if (new.planned_start, new.planned_end, new.actual_start, new.actual_end,
          new.completed_at, new.budget, new.planned_water_m3)
         is distinct from
         (old.planned_start, old.planned_end, old.actual_start, old.actual_end,
          old.completed_at, old.budget, old.planned_water_m3) then
        raise exception 'مرحلةٌ اعتُمدت لا تُعدَّل مواعيدها ولا أرقامها.';
      end if;
    end if;
  end if;
  return new;
end;
$$;

-- No stage that was approved, or that carries a file, or that sits before an
-- approved one, is removed: removing an open predecessor is the other way to
-- close a later stage «with nothing open before it».
create or replace function public.season_stage_delete_gate()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is not null and not is_admin() then
    if old.completed
       or exists (select 1 from stage_evidence where stage_id = old.id)
       or exists (select 1 from season_stages s
                   where s.season_id = old.season_id
                     and s.stage_order > old.stage_order and s.completed) then
      raise exception 'لا تُحذف مرحلةٌ اعتُمدت أو عليها دليل أو قبل مرحلةٍ معتمدة.';
    end if;
  end if;
  return old;
end;
$$;

create trigger season_stages_insert_gate
  before insert on public.season_stages
  for each row execute function public.season_stage_insert_gate();
create trigger season_stages_freeze_gate
  before update on public.season_stages
  for each row execute function public.season_stage_freeze_gate();
create trigger season_stages_delete_gate
  before delete on public.season_stages
  for each row execute function public.season_stage_delete_gate();

-- ═══════════════════════════════════════════════════════════════════════════
-- ٢) دليل المرحلة
-- ═══════════════════════════════════════════════════════════════════════════

-- The path must be in the writer's own folder and the file must be there. The
-- server action already checks both (seasons/actions.ts); this is the same
-- check where a direct insert cannot skip it.
create or replace function public.stage_evidence_insert_gate()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is not null and not is_admin() and new.storage_path is not null then
    if new.storage_path not like auth.uid()::text || '/%' or new.storage_path like '%..%' then
      raise exception 'مسار الملفّ ليس في مجلّدك.';
    end if;
    if to_regclass('storage.objects') is not null
       and not exists (select 1 from storage.objects
                        where bucket_id = 'evidence' and name = new.storage_path) then
      raise exception 'لم نجد الملفّ المرفوع. ارفعه ثمّ سجّله.';
    end if;
    new.created_by := auth.uid();
  end if;
  return new;
end;
$$;

-- Evidence is not edited, and not withdrawn once its stage was approved (the
-- storage policy refuses the file; this refuses the row, which is what made the
-- two-step bypass possible).
create or replace function public.stage_evidence_keep_gate()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is not null and not is_admin() then
    if tg_op = 'UPDATE' and (new.stage_id is distinct from old.stage_id
                              or new.storage_path is distinct from old.storage_path
                              or new.kind is distinct from old.kind) then
      raise exception 'لا يُعدَّل الدليل: يُحذف ويُرفع من جديد قبل اعتماد المرحلة.';
    end if;
    if exists (select 1 from season_stages where id = old.stage_id and completed) then
      raise exception 'مرحلةٌ اعتُمدت: دليلها يبقى كما هو.';
    end if;
  end if;
  return case tg_op when 'DELETE' then old else new end;
end;
$$;

create trigger stage_evidence_insert_gate
  before insert on public.stage_evidence
  for each row execute function public.stage_evidence_insert_gate();
create trigger stage_evidence_keep_gate
  before update or delete on public.stage_evidence
  for each row execute function public.stage_evidence_keep_gate();

-- ═══════════════════════════════════════════════════════════════════════════
-- ٣) مستندات الأرض ودليل العقود وسلسلة العهدة — بقاعدة الدلو نفسها
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.land_document_insert_gate()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is not null and not is_admin() and new.storage_path is not null then
    if new.storage_path not like auth.uid()::text || '/%' or new.storage_path like '%..%' then
      raise exception 'مسار الملفّ ليس في مجلّدك.';
    end if;
    if to_regclass('storage.objects') is not null
       and not exists (select 1 from storage.objects
                        where bucket_id = 'evidence' and name = new.storage_path) then
      raise exception 'لم نجد الملفّ المرفوع. ارفعه ثمّ سجّله.';
    end if;
  end if;
  return new;
end;
$$;

-- A document the land was verified on stays (the storage policy's rule, at the row).
create or replace function public.land_document_keep_gate()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is not null and not is_admin() then
    if tg_op = 'UPDATE' and (new.land_id is distinct from old.land_id
                              or new.storage_path is distinct from old.storage_path
                              or new.kind is distinct from old.kind) then
      raise exception 'لا يُعدَّل مستند الأرض: يُحذف ويُرفع من جديد قبل التوثيق.';
    end if;
    if exists (select 1 from lands where id = old.land_id and verification = 'verified') then
      raise exception 'أرضٌ وُثِّقت: مستنداتها تبقى.';
    end if;
  end if;
  return case tg_op when 'DELETE' then old else new end;
end;
$$;

-- A milestone that was approved keeps its evidence.
create or replace function public.milestone_evidence_keep_gate()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is not null then
    if exists (select 1 from contract_milestones where id = old.milestone_id and approved_at is not null) then
      raise exception 'مرحلةُ عقدٍ وُوفق عليها: دليلها يبقى كما هو.';
    end if;
  end if;
  return case tg_op when 'DELETE' then old else new end;
end;
$$;

-- The custody chain is appended to and never edited — evidence included.
create or replace function public.custody_evidence_keep_gate()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is not null then
    raise exception 'سلسلة العهدة تُلحَق ولا تُعدَّل: دليلها يبقى.';
  end if;
  return case tg_op when 'DELETE' then old else new end;
end;
$$;

create trigger land_documents_insert_gate
  before insert on public.land_documents
  for each row execute function public.land_document_insert_gate();
create trigger land_documents_keep_gate
  before update or delete on public.land_documents
  for each row execute function public.land_document_keep_gate();
create trigger milestone_evidence_keep_gate
  before update or delete on public.milestone_evidence
  for each row execute function public.milestone_evidence_keep_gate();
create trigger custody_evidence_keep_gate
  before update or delete on public.custody_evidence
  for each row execute function public.custody_evidence_keep_gate();

-- ═══════════════════════════════════════════════════════════════════════════
-- ٤) الدفتر والموسم
-- ═══════════════════════════════════════════════════════════════════════════

-- A season that was closed has a book that was closed with it: nothing in it is
-- edited or erased, and an entry cannot be moved to another season. Correcting
-- a mistake is a new entry; before the close the book stays editable.
create or replace function public.ledger_entries_history_gate()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare v_status text;
begin
  if auth.uid() is not null and not is_admin() then
    if tg_op = 'UPDATE' and new.season_id is distinct from old.season_id then
      raise exception 'لا يُنقل قيدٌ إلى موسمٍ آخر.';
    end if;
    select status into v_status from seasons where id = old.season_id;
    if v_status = 'completed' then
      raise exception 'دفتر موسمٍ أُقفل لا يُعدَّل ولا يُحذف منه شيء؛ أضِف قيداً مصحِّحاً.';
    end if;
  end if;
  return case tg_op when 'DELETE' then old else new end;
end;
$$;

create trigger ledger_entries_history_gate
  before update or delete on public.ledger_entries
  for each row execute function public.ledger_entries_history_gate();

-- A closed season is not reopened or reweighed; a season born of a partnership
-- is not unlinked from it; and a season with a history is not erased. A season
-- with none can still be withdrawn (the app does exactly that when saving its
-- stages fails).
create or replace function public.seasons_history_gate()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is not null and not is_admin() then
    if tg_op = 'UPDATE' then
      if old.partnership_id is not null and new.partnership_id is distinct from old.partnership_id then
        raise exception 'موسمٌ بدأ من عقد شراكةٍ لا يُفكّ عنه.';
      end if;
      if old.status = 'completed' then
        if new.status is distinct from old.status then
          raise exception 'موسمٌ أُقفل لا يُعاد فتحه.';
        end if;
        if new.harvest_kg is distinct from old.harvest_kg then
          raise exception 'وزن حصاد موسمٍ أُقفل لا يتغيّر.';
        end if;
      end if;
      return new;
    end if;
    if (old.status = 'completed' or old.partnership_id is not null)
       and (exists (select 1 from season_stages where season_id = old.id)
            or exists (select 1 from ledger_entries where season_id = old.id)) then
      raise exception 'موسمٌ له تاريخٌ لا يُحذف.';
    end if;
  end if;
  return case tg_op when 'DELETE' then old else new end;
end;
$$;

create trigger seasons_history_gate
  before update or delete on public.seasons
  for each row execute function public.seasons_history_gate();

-- ═══════════════════════════════════════════════════════════════════════════
-- ٥) سجلّ دفعات العقود: تُكتب بغير الطرفين
-- ═══════════════════════════════════════════════════════════════════════════

-- `payments_parties` lets both parties of a contract write the payment record
-- (cmd ALL). Nothing in the app writes it — release goes through the milestone
-- approval — so the parties' write access is only a hole. A restrictive policy
-- is added beside it instead of replacing it: it ANDs with the permissive one,
-- so writes now need an administrator, and reads are untouched.
create policy payments_no_direct_insert on public.contract_payments
  as restrictive for insert to public with check (is_admin());
create policy payments_no_direct_update on public.contract_payments
  as restrictive for update to public using (is_admin()) with check (is_admin());
create policy payments_no_direct_delete on public.contract_payments
  as restrictive for delete to public using (is_admin());

-- ═══════════════════════════════════════════════════════════════════════════
-- الصلاحيّات: دوالّ الزنادات لا يستدعيها أحد
-- ═══════════════════════════════════════════════════════════════════════════

revoke execute on function public.season_stage_insert_gate() from public, anon, authenticated;
revoke execute on function public.season_stage_freeze_gate() from public, anon, authenticated;
revoke execute on function public.season_stage_delete_gate() from public, anon, authenticated;
revoke execute on function public.stage_evidence_insert_gate() from public, anon, authenticated;
revoke execute on function public.stage_evidence_keep_gate() from public, anon, authenticated;
revoke execute on function public.land_document_insert_gate() from public, anon, authenticated;
revoke execute on function public.land_document_keep_gate() from public, anon, authenticated;
revoke execute on function public.milestone_evidence_keep_gate() from public, anon, authenticated;
revoke execute on function public.custody_evidence_keep_gate() from public, anon, authenticated;
revoke execute on function public.ledger_entries_history_gate() from public, anon, authenticated;
revoke execute on function public.seasons_history_gate() from public, anon, authenticated;
