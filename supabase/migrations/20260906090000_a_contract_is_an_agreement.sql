-- العقدُ اتّفاقٌ — فلا يُحرّكه طرفٌ وحده، ولا يُعاد تسعيرُه بعد الاتّفاق.
--
-- WHAT WAS FOUND
--
-- `contract_status` has carried six values since the day contracting shipped:
-- draft · proposed · active · completed · cancelled · disputed. And **nothing
-- in the platform ever wrote any of them but the first**. `grep -rn` over
-- `src/` finds `createContract`, `addMilestoneEvidence` and `setMilestoneStatus`
-- — and no action that touches `service_contracts.status` at all. Every
-- contract the platform can build is born `draft` and dies `draft`.
--
-- This is the same shape as `verifyLand`, which existed, redirected, and was
-- never called: a state machine whose states are unreachable. The roadmap has
-- carried it as item ٢ of «فكّ الحصار» since 18 August.
--
-- AND THE HALF NOBODY HAD LOOKED AT
--
-- Writing the missing buttons would have been the wrong fix on its own, because
-- the database has no opinion about who may press them. `contracts_parties` is
-- a single `ALL` policy whose USING and WITH CHECK are the same expression:
--
--     client_id = auth.uid() OR is_admin() OR <caller owns the provider>
--
-- So either party may set any status at any moment. A provider could activate
-- its own offer without the client agreeing; a client could mark a contract
-- `completed` before a single milestone was approved. **The one property that
-- makes a contract a contract — that neither side moves it alone — was not
-- expressed anywhere.**
--
-- `milestones_parties` is the same policy over `can_see_contract(contract_id)`,
-- and that is worse, because milestones are where the money is. `amount` is
-- generated from `quantity * unit_price`, and both are plain updatable columns:
--
--     update contract_milestones set unit_price = unit_price * 3 where ...
--
-- `sync_contract_total` then faithfully recomputes `total_amount` from the new
-- figures. A provider could triple the price of an agreed contract, or a client
-- could zero it after the work was delivered, and the contract would show the
-- new number as though it had always said so. The comment on `unit_price`
-- promises exactly the opposite:
--
--     "The price is frozen into the milestone on purpose. A provider who raises
--      a catalogue price next month must not silently reprice a signed contract"
--
-- It is frozen against the *catalogue*. It was never frozen against the party.
--
-- WHY NOW, WITH ZERO CONTRACTS IN PRODUCTION
--
-- Production holds 0 providers, 0 services, 0 contracts and 0 milestones. So
-- nothing is wrong today, and that is the argument for doing it now rather than
-- against it: `/lands` was empty for the platform's entire life and returned 500
-- to the first farmer who used it. A guard written before the first contract
-- costs a migration; the same guard written after costs a dispute nobody can
-- settle from the record.

-- ═══════════════════════════════════════════════════════════════════════════
-- ١. الانتقالات — ومَن يملك كلَّ واحدٍ منها
-- ═══════════════════════════════════════════════════════════════════════════
--
-- The map is the law for everybody, admins included: an admin is a permitted
-- *actor* on the rows that name it, not a licence to jump the shape. So there
-- is no path from `draft` to `completed` for anyone, which is what stops a
-- contract from being settled without ever having been agreed.
--
--   draft      → proposed    العميل يعرض
--   draft      → cancelled   العميل يتراجع قبل العرض
--   proposed   → draft       العميل يسحب العرض ليعدّله
--   proposed   → active      **مقدّم الخدمة يقبل** — وهذا هو التوقيع
--   proposed   → cancelled   أيُّ الطرفين
--   active     → completed   العميل، وكلُّ المراحل معتمدة أو مدفوعة
--   active     → disputed    أيُّ الطرفين — ولا يُغلق هذا الباب أبداً
--   disputed   → active | cancelled | completed   الإدارة
--   completed | cancelled → disputed              الإدارة، وهو باب العودة
--
-- The asymmetry is the point: the client proposes because the client builds the
-- contract from the provider's own catalogue prices, and the provider accepts
-- because accepting is the act of agreeing to do the work. A contract that one
-- party could both write and activate is an invoice, not an agreement.

create or replace function public.enforce_contract_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  acting_client   boolean;
  acting_provider boolean;
  acting_admin    boolean;
  still_open      int;
  milestone_count int;
  provider_ready  boolean;
begin
  if new.status is not distinct from old.status then
    return new;
  end if;

  -- auth.uid() is null for the service role, for the SQL editor, and for the
  -- migration itself. Those are trusted server-side paths and are left alone,
  -- exactly as `enforce_milestone_approval` and the other guards do it.
  if auth.uid() is null then
    if new.status = 'active' and new.signed_at is null then
      new.signed_at := now();
    end if;
    return new;
  end if;

  acting_admin := is_admin();
  acting_client := old.client_id = auth.uid();
  acting_provider := exists (
    select 1 from service_providers p
     where p.id = old.provider_id and p.owner_id = auth.uid()
  );

  -- والشكلُ أوّلاً، ثمّ الفاعل: انتقالٌ غير موجودٍ في الخريطة مرفوضٌ لكلّ أحد.
  if not (
       (old.status = 'draft'    and new.status in ('proposed', 'cancelled'))
    or (old.status = 'proposed' and new.status in ('draft', 'active', 'cancelled'))
    or (old.status = 'active'   and new.status in ('completed', 'disputed'))
    or (old.status = 'disputed' and new.status in ('active', 'cancelled', 'completed'))
    or (old.status in ('completed', 'cancelled') and new.status = 'disputed')
  ) then
    raise exception
      'انتقالٌ غير مسموح للعقد: من «%» إلى «%»', old.status, new.status;
  end if;

  -- ثمّ الفاعل.
  if old.status = 'draft' and new.status = 'proposed' then
    if not (acting_client or acting_admin) then
      raise exception 'عرضُ العقد من صلاحية العميل — مقدّمُ الخدمة لا يعرض عقداً على نفسه';
    end if;

    -- عرضٌ بلا مراحل ليس عرضاً: لا مبلغ فيه ولا عمل.
    select count(*) into milestone_count
      from contract_milestones where contract_id = old.id;
    if milestone_count = 0 then
      raise exception 'لا يُعرض عقدٌ بلا مراحل — أضف مرحلةً واحدةً على الأقلّ';
    end if;

    -- ولا يُعرض على مقدّمِ خدمةٍ غيرِ موثّق: التوثيق هو ما تعنيه المنصّة حين
    -- تعرض اسمَه، وعرضُ عقدٍ عليه قبله يجعل التوثيقَ زينة.
    select p.verified_at is not null and p.active
      into provider_ready
      from service_providers p where p.id = old.provider_id;
    if not coalesce(provider_ready, false) then
      raise exception 'مقدّمُ الخدمة غيرُ موثّقٍ أو غيرُ نشط — لا يُعرض عليه عقد';
    end if;

  elsif old.status = 'draft' and new.status = 'cancelled' then
    if not (acting_client or acting_admin) then
      raise exception 'إلغاءُ مسودّة العقد من صلاحية العميل';
    end if;

  elsif old.status = 'proposed' and new.status = 'draft' then
    if not (acting_client or acting_admin) then
      raise exception 'سحبُ العرض من صلاحية العميل الذي عرضه';
    end if;

  elsif old.status = 'proposed' and new.status = 'active' then
    -- التوقيع.
    if not (acting_provider or acting_admin) then
      raise exception 'قبولُ العقد من صلاحية مقدّم الخدمة — والعميلُ لا يوقّع نيابةً عنه';
    end if;
    if new.signed_at is null then
      new.signed_at := now();
    end if;

  elsif old.status = 'proposed' and new.status = 'cancelled' then
    if not (acting_client or acting_provider or acting_admin) then
      raise exception 'إلغاءُ العقد من صلاحية أحد طرفيه';
    end if;

  elsif old.status = 'active' and new.status = 'completed' then
    if not (acting_client or acting_admin) then
      raise exception 'إقفالُ العقد من صلاحية العميل — لا يشهد مقدّمُ الخدمة لنفسه بالإنجاز';
    end if;

    select count(*) into still_open
      from contract_milestones
     where contract_id = old.id and status not in ('approved', 'paid');
    if still_open > 0 then
      raise exception
        'لا يُقفل العقد و% مرحلة لم تُعتمد بعد', still_open;
    end if;

  elsif new.status = 'disputed' then
    -- والبابُ مفتوحٌ للطرفين دائماً، من «سارٍ» ومن «منجز» ومن «ملغى» سواء.
    --
    -- نزاعٌ لا يستطيع أحدُ طرفيه إعلانَه ليس نزاعاً بل صمتٌ يُقرأ رضاً. وأكثرُ
    -- ما يُكتشف الخللُ بعد الإقفال لا قبله — فجعلُ هذا الباب إداريّاً كان
    -- يعني أنّ العميلَ الذي رأى العيبَ بعد أسبوع لا يملك إلّا أن يشتكي خارج
    -- المنصّة. وهذا ما أخرجته البوّابةُ من نسختي الأولى.
    if not (acting_client or acting_provider or acting_admin) then
      raise exception 'إعلانُ النزاع من صلاحية أحد طرفي العقد';
    end if;

  else
    -- كلُّ ما تبقّى في الخريطة إداريّ: فضُّ النزاع، وإعادةُ فتح المُقفَل.
    if not acting_admin then
      raise exception 'هذا الانتقال من صلاحية الإدارة وحدها';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists service_contracts_status_gate on public.service_contracts;
create trigger service_contracts_status_gate
  before update on public.service_contracts
  for each row execute function public.enforce_contract_status();

-- ═══════════════════════════════════════════════════════════════════════════
-- ٢. الشروطُ التجاريّة تتجمّد لحظةَ العرض
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Not at signature — at the offer. The client is asked to agree to a number,
-- and the number they agreed to must be the number that was on the screen. If
-- the terms could still move between `proposed` and `active`, "accept" would
-- mean accepting whatever the other side edits next.
--
-- `draft` stays fully editable, which is what `draft` is for.
--
-- WHY THE COLUMNS ARE NAMED RATHER THAN THE ROW LOCKED
--
-- The workflow lives in the same row: `status`, `actual_start`, `actual_end`,
-- `approved_by`, `approved_at` and `note` all move while the work is done, and
-- `enforce_milestone_approval` writes three of them itself. Freezing the row
-- would freeze the contract. So what is frozen is exactly what was agreed: what
-- the work is, how much of it, and at what price.
create or replace function public.enforce_milestone_terms()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  contract_state contract_status;
begin
  select c.status into contract_state
    from service_contracts c where c.id = old.contract_id;

  if auth.uid() is null or is_admin() then
    return new;
  end if;

  -- ولا يتحرّك العملُ على عقدٍ لم يُتّفق عليه بعد.
  --
  -- This is checked **before** the draft shortcut below, and the first version
  -- of this migration had it after — so a milestone on a draft contract could
  -- still be started, submitted and approved, which is the whole hole this
  -- guard exists to close. The gate caught it.
  --
  -- Every milestone action in the platform today runs against a `draft`
  -- contract, because `draft` is the only state that exists. Once the states
  -- are reachable this becomes the rule it always should have been: a provider
  -- does not deliver, and a client does not approve or pay, on an offer nobody
  -- has accepted.
  if new.status is distinct from old.status and contract_state <> 'active' then
    raise exception
      'العقد «%» — ولا تتحرّك مراحلُه إلّا وهو سارٍ', contract_state;
  end if;

  -- والمسودّةُ تبقى قابلةً للتحرير: هذا هو معناها.
  if contract_state = 'draft' then
    return new;
  end if;

  if new.quantity   is distinct from old.quantity
  or new.unit_price is distinct from old.unit_price
  or new.unit       is distinct from old.unit
  or new.seq        is distinct from old.seq
  or new.title      is distinct from old.title
  or new.service_id is distinct from old.service_id
  or new.requires_evidence is distinct from old.requires_evidence then
    raise exception
      'شروطُ المرحلة تجمّدت حين عُرض العقد — لتغييرها أعِد العقد إلى مسودّة';
  end if;

  return new;
end;
$$;

-- ويسبق حارسَ الاعتماد أبجديّاً عمداً: `contract_milestones_approval_gate`
-- يكتب `approved_at` و`approved_by`، وحارسٌ يمنع تغييرَ الشروط يجب أن يرى
-- الصفَّ قبل أن يكتب فيه غيرُه.
drop trigger if exists contract_milestones_a_terms_gate on public.contract_milestones;
create trigger contract_milestones_a_terms_gate
  before update on public.contract_milestones
  for each row execute function public.enforce_milestone_terms();

-- ═══════════════════════════════════════════════════════════════════════════
-- ٣. ولا تُحذف مرحلةٌ من عقدٍ عُرض
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Freezing the terms of each row and leaving the set of rows open would be a
-- lock on the lid of an open box: `sync_contract_total` recomputes the total
-- from whatever milestones remain, so deleting one lowers the contract by its
-- amount without touching a frozen column. Insertion is the same in reverse.
create or replace function public.enforce_milestone_set()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target         uuid := coalesce(new.contract_id, old.contract_id);
  contract_state contract_status;
begin
  select c.status into contract_state
    from service_contracts c where c.id = target;

  if contract_state is null or contract_state = 'draft' then
    return coalesce(new, old);
  end if;

  if auth.uid() is null or is_admin() then
    return coalesce(new, old);
  end if;

  raise exception
    'مراحلُ العقد تجمّدت حين عُرض — لا تُضاف ولا تُحذف إلّا بإعادته مسودّةً';
end;
$$;

drop trigger if exists contract_milestones_set_gate on public.contract_milestones;
create trigger contract_milestones_set_gate
  before insert or delete on public.contract_milestones
  for each row execute function public.enforce_milestone_set();

revoke all on function public.enforce_contract_status() from public, anon, authenticated;
revoke all on function public.enforce_milestone_terms() from public, anon, authenticated;
revoke all on function public.enforce_milestone_set()   from public, anon, authenticated;
