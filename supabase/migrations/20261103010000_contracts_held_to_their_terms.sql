-- العقود تبقى على ما اتُّفق عليه، والأرض لا تُوثَّق إلا بعد أن تُقرأ مستنداتها (فحص 3 نوفمبر 2026، السؤال 6 للمالك).
--
-- عقود الخدمة (db-a-1، db-a-2، money-logic-1، money-logic-8):
--   - العقد يُنشئه العميل باسمه، مسودّةً بلا توقيع وبمبلغ صفر، على موسمه أو قطيعه. كان أيّ طرفٍ يُدخل عقداً «سارياً»
--     أو «منجزاً» باسم غيره مباشرةً من الواجهة.
--   - بعد الإنشاء لا يتغيّر طرفاه ولا موسمه ولا عملته، ولا مبلغه إلا من مجموع مراحله، ولا تاريخ توقيعه إلا عند قبوله.
--     كان حارس الحالة يخرج مبكراً حين لا تتغيّر الحالة، فيمرّ تعديل المبلغ والطرفين على عقدٍ موقَّع.
--   - لا يُحذف عقدٌ بعد أن عُرض: يُلغى أو يُعلن فيه نزاع. والحذف بالتتابع (حذف الموسم أو القطيع) يمرّ بالحارس نفسه،
--     فلا تمحو مراحلُ معتمدة وأدلّتها ودفعاتها مع موسمها.
--   - المرحلة تبدأ «لم تبدأ» ولا يُكتب اعتمادها بيد أحد، ولا تنتقل إلى عقدٍ آخر، ولا تعود من «معتمدة» أو «مدفوعة»؛
--     وسيرها وتسليمها لمقدّم الخدمة، واعتمادها ودفعها ورفضها للعميل. الإدارة فوق ذلك كلّه، للنزاع.
--
-- الشراكة (money-logic-2): التوقيع يحسب على المساحة التي وثّقتها الإدارة وعلى أرضٍ ما زالت موثّقة، ولا تنقص مساحة
-- الأرض عمّا وُقّع عليه في عقودٍ سارية.
--
-- التوثيق (web-flows-3، data-quality-5): لا يوثّق المدير أرضاً يملكها، ولا أرضاً لم يفتح كلّ مستنداتها؛ ويُحفظ من وثّق
-- ومتى وبأيّ مساحة. وفتح المستند يُسجَّل بدالّة تعطي الإدارة مساره لتفتحه برابطٍ قصير العمر.
--
-- لا حذف لبيانات. الأرض الموثّقة الوحيدة على الموقع تحتفظ بتوثيقها، وتُكتب مساحتها الموثّقة من مساحتها اليوم.

-- ── عقود الخدمة ───────────────────────────────────────────────────────────────

create or replace function public.service_contracts_insert_gate()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or is_admin() then
    return new;
  end if;
  if new.client_id is distinct from auth.uid() then
    raise exception 'العقد يُنشئه العميل باسمه — لا يُنشأ عقدٌ باسم غيرك.';
  end if;
  if new.status <> 'draft' or new.signed_at is not null then
    raise exception 'العقد يبدأ مسودّة: يعرضه العميل ثمّ يقبله مقدّم الخدمة.';
  end if;
  if new.season_id is not null
     and not exists (select 1 from seasons s where s.id = new.season_id and s.owner_id = auth.uid()) then
    raise exception 'العقد على موسمك أنت.';
  end if;
  if new.herd_id is not null
     and not exists (select 1 from herds h where h.id = new.herd_id and h.owner_id = auth.uid()) then
    raise exception 'العقد على قطيعك أنت.';
  end if;
  -- The total is the sum of the phases, written by sync_contract_total as they are added.
  new.total_amount := 0;
  return new;
end $$;

create trigger service_contracts_insert_gate
  before insert on public.service_contracts
  for each row execute function public.service_contracts_insert_gate();

-- Runs after service_contracts_status_gate (triggers fire in name order), which stamps signed_at on acceptance.
create or replace function public.service_contracts_terms_frozen()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or is_admin() then
    return new;
  end if;
  if new.client_id is distinct from old.client_id
     or new.provider_id is distinct from old.provider_id
     or new.season_id is distinct from old.season_id
     or new.herd_id is distinct from old.herd_id
     or new.project_id is distinct from old.project_id
     or new.currency is distinct from old.currency then
    raise exception 'طرفا العقد وموسمه وعملته لا تتغيّر — لغير ذلك عقدٌ جديد.';
  end if;
  if new.total_amount is distinct from old.total_amount
     and coalesce(current_setting('app.contract_total_sync', true), '') <> 'on' then
    raise exception 'مبلغ العقد هو مجموع مراحله، ولا يُكتب بيد أحد.';
  end if;
  if new.signed_at is distinct from old.signed_at
     and not (old.signed_at is null and old.status = 'proposed' and new.status = 'active') then
    raise exception 'تاريخ توقيع العقد يُكتب حين يقبله مقدّم الخدمة، ولا يتغيّر بعده.';
  end if;
  if new.title is distinct from old.title and old.status <> 'draft' then
    raise exception 'عنوان العقد تجمّد حين عُرض.';
  end if;
  return new;
end $$;

create trigger service_contracts_terms_frozen
  before update on public.service_contracts
  for each row execute function public.service_contracts_terms_frozen();

create or replace function public.service_contracts_delete_gate()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or is_admin() then
    return old;
  end if;
  if old.status <> 'draft' then
    raise exception 'لا يُحذف عقدٌ بعد أن عُرض (حالته «%»): يُلغى أو يُعلَن فيه نزاع. ولا يُحذف موسمٌ أو قطيعٌ عليه عقدٌ كهذا.',
      old.status;
  end if;
  return old;
end $$;

create trigger service_contracts_delete_gate
  before delete on public.service_contracts
  for each row execute function public.service_contracts_delete_gate();

-- The total is written by its sync alone; the flag lets the frozen-terms gate tell it from a hand.
create or replace function public.sync_contract_total()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target uuid := coalesce(new.contract_id, old.contract_id);
begin
  perform set_config('app.contract_total_sync', 'on', true);
  update service_contracts c
     set total_amount = coalesce(
           (select sum(m.amount) from contract_milestones m where m.contract_id = target), 0)
   where c.id = target;
  perform set_config('app.contract_total_sync', '', true);
  return null;
end $$;

-- ── مراحل العقد ───────────────────────────────────────────────────────────────

create or replace function public.contract_milestones_insert_gate()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or is_admin() then
    return new;
  end if;
  if new.status <> 'pending' or new.approved_by is not null or new.approved_at is not null then
    raise exception 'المرحلة تبدأ «لم تبدأ»، ولا يُكتب اعتمادها بيد أحد.';
  end if;
  return new;
end $$;

create trigger contract_milestones_insert_gate
  before insert on public.contract_milestones
  for each row execute function public.contract_milestones_insert_gate();

-- Runs after contract_milestones_a_terms_gate and contract_milestones_approval_gate (name order): the approval gate
-- stamps approved_by/approved_at on the move to approved, and this one lets that stamp through and no other.
create or replace function public.contract_milestones_moves_gate()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_client   boolean;
  v_provider boolean;
begin
  if new.contract_id is distinct from old.contract_id and auth.uid() is not null then
    raise exception 'المرحلة لا تنتقل إلى عقدٍ آخر.';
  end if;
  if auth.uid() is null or is_admin() then
    return new;
  end if;
  if (new.approved_by is distinct from old.approved_by or new.approved_at is distinct from old.approved_at)
     and not (new.status = 'approved' and old.status is distinct from 'approved') then
    raise exception 'اعتماد المرحلة يُكتب حين تُعتمد، ولا يتغيّر بعده.';
  end if;
  if new.status is not distinct from old.status then
    return new;
  end if;
  if old.status in ('approved', 'paid') and not (old.status = 'approved' and new.status = 'paid') then
    raise exception 'المرحلة المعتمدة لا تعود إلى الوراء. إن كان بينكما خلاف فأعلنا نزاعاً على العقد، وتفصل فيه الإدارة.';
  end if;
  select c.client_id = auth.uid(),
         exists (select 1 from service_providers p where p.id = c.provider_id and p.owner_id = auth.uid())
    into v_client, v_provider
    from service_contracts c where c.id = new.contract_id;
  if new.status = 'pending' then
    raise exception 'المرحلة لا تعود إلى «لم تبدأ».';
  end if;
  if new.status in ('in_progress', 'submitted') and not coalesce(v_provider, false) then
    raise exception 'سير المرحلة وتسليمها من صلاحية مقدّم الخدمة.';
  end if;
  if new.status in ('approved', 'paid', 'rejected') and not coalesce(v_client, false) then
    raise exception 'اعتماد المرحلة ودفعها ورفضها من صلاحية العميل.';
  end if;
  return new;
end $$;

create trigger contract_milestones_moves_gate
  before update on public.contract_milestones
  for each row execute function public.contract_milestones_moves_gate();

revoke all on function public.service_contracts_insert_gate(), public.service_contracts_terms_frozen(),
  public.service_contracts_delete_gate(), public.contract_milestones_insert_gate(),
  public.contract_milestones_moves_gate(), public.sync_contract_total()
  from public, anon, authenticated;

-- ── توثيق الأرض ───────────────────────────────────────────────────────────────

alter table public.lands
  add column verified_by uuid references auth.users(id) on delete set null,
  add column verified_at timestamptz,
  add column verified_feddans numeric;

comment on column public.lands.verified_feddans is
  'المساحة التي وثّقتها الإدارة آخر مرّة. التوقيع على الشراكة يحسب عليها، لا على المساحة الحاليّة التي يكتبها المالك.';

-- The land verified before this column existed keeps its verification, at its area today; who verified it and when
-- were not recorded then, and are not invented now.
update public.lands set verified_feddans = feddans where verification = 'verified';

-- Who opened which document, to verify a land (one row per document and administrator, the first opening).
create table public.land_document_views (
  document_id uuid not null references public.land_documents(id) on delete cascade,
  admin_id    uuid not null references auth.users(id) on delete cascade,
  opened_at   timestamptz not null default now(),
  primary key (document_id, admin_id)
);

alter table public.land_document_views enable row level security;
revoke all on public.land_document_views from anon, authenticated;
grant select on public.land_document_views to authenticated;
create policy land_document_views_admin on public.land_document_views
  for select to authenticated using (is_admin());

-- The path of a land document, for an administrator, and the opening recorded. The page makes a short-lived link
-- from it; the bucket's own policy lets an administrator read it (evidence_read_own).
create or replace function public.land_document_open(p_document uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_path text;
begin
  if not is_admin() then
    raise exception 'للإدارة وحدها.';
  end if;
  select storage_path into v_path from land_documents where id = p_document;
  if v_path is null then
    raise exception 'لا مستند بهذا المعرّف.';
  end if;
  insert into land_document_views (document_id, admin_id) values (p_document, auth.uid())
  on conflict do nothing;
  return v_path;
end $$;

revoke execute on function public.land_document_open(uuid) from public, anon;
grant execute on function public.land_document_open(uuid) to authenticated;

create or replace function public.lands_verify_gate()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_unread integer;
  v_held   numeric;
begin
  if tg_op = 'INSERT' then
    if auth.uid() is not null
       and (new.verification = 'verified' or new.verified_by is not null or new.verified_at is not null
            or new.verified_feddans is not null) then
      raise exception 'تُسجَّل الأرض أوّلاً ثمّ تُوثَّق.';
    end if;
    return new;
  end if;

  -- The area cannot fall below what signed partnerships in force hold on any day (money-logic-2).
  if new.feddans < old.feddans then
    select coalesce(max(h.held), 0) into v_held
      from (
        select d.day, sum((a.terms->>'feddans')::numeric) as held
          from (select greatest(current_date, (x.terms->>'start_date')::date) as day
                  from partnership_agreements x
                 where x.land_id = new.id and x.status = 'signed'
                   and (x.terms->>'end_date')::date >= current_date) d
          join partnership_agreements a
            on a.land_id = new.id and a.status = 'signed'
           and (a.terms->>'start_date')::date <= d.day and (a.terms->>'end_date')::date >= d.day
         group by d.day
      ) h;
    if new.feddans < v_held then
      raise exception 'على هذه الأرض عقود شراكة موقَّعة سارية على % فداناً، فلا تنقص مساحتها عن ذلك.', trim_scale(v_held);
    end if;
  end if;

  if new.verification = 'verified' and old.verification is distinct from 'verified' then
    if auth.uid() is not null then
      if new.owner_id = auth.uid() then
        raise exception 'لا يوثّق المدير أرضاً يملكها: يوثّقها مديرٌ آخر، أو معاينةٌ مدفوعة.';
      end if;
      select count(*) into v_unread
        from land_documents d
       where d.land_id = new.id
         and not exists (select 1 from land_document_views v where v.document_id = d.id and v.admin_id = auth.uid());
      if v_unread > 0 then
        raise exception 'افتح مستندات الأرض كلّها قبل توثيقها (بقي % لم يُفتح).', v_unread;
      end if;
    end if;
    new.verified_by := auth.uid();
    new.verified_at := now();
    new.verified_feddans := new.feddans;
  elsif new.verified_by is distinct from old.verified_by
     or new.verified_at is distinct from old.verified_at
     or new.verified_feddans is distinct from old.verified_feddans then
    if auth.uid() is not null then
      raise exception 'من وثّق الأرض ومتى وبأيّ مساحة يُكتب عند التوثيق وحده.';
    end if;
  end if;
  return new;
end $$;

create trigger lands_verify_gate
  before insert or update on public.lands
  for each row execute function public.lands_verify_gate();

revoke all on function public.lands_verify_gate() from public, anon, authenticated;

-- ── التوقيع على الشراكة يحسب على المساحة الموثّقة ──────────────────────────────

create or replace function public.partnership_agreement_sign(
  p_agreement uuid, p_version integer, p_hash text, p_full_name text, p_signature text, p_user_agent text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_a partnership_agreements;
  v_role text;
  v_feddans numeric;
  v_ref text;
  v_manager uuid;
  v_needed integer;
  v_party uuid;
  v_start date;
  v_end date;
  v_peak numeric;
begin
  if auth.uid() is null then raise exception 'سجّل الدخول أولاً.'; end if;
  select * into v_a from partnership_agreements where id = p_agreement for update;
  if v_a.id is null then raise exception 'لستَ طرفاً في هذا العقد.'; end if;
  if v_a.model = 'managed' and v_a.manager_company_id is not null then
    select owner_id into v_manager from partner_companies where id = v_a.manager_company_id;
  end if;

  v_role := case when auth.uid() = v_a.owner_id then 'owner'
                 when auth.uid() = v_a.investor_id then 'investor'
                 when v_manager is not null and auth.uid() = v_manager then 'manager' end;
  if v_role is null then raise exception 'لستَ طرفاً في هذا العقد.'; end if;
  if v_a.status = 'signed' then raise exception 'العقد موقَّعٌ ومقفل.'; end if;
  if p_version <> v_a.version or p_hash <> v_a.terms_hash then
    raise exception 'عُدِّلت البنود منذ فتحتَ الصفحة. اقرأ النسخة الجديدة ثمّ وقّع.';
  end if;

  -- The area a signature counts against is the area the administration verified, on land that is still verified
  -- (audit money-logic-2, 3 November 2026): raising the land's area after a first signature, then signing again,
  -- had let two investors hold the same feddans.
  -- Locked first (BUG-14 below, and independent review): an owner's edit that sends the land back to review waits for
  -- this signature, or this signature reads the land as it stands after the edit.
  select case when verification = 'verified' then verified_feddans end into v_feddans
    from lands where id = v_a.land_id for update;
  if v_feddans is null then
    raise exception 'الأرض ليست موثّقةً الآن (تغيّرت بياناتها أو لم تُراجَع بعد)، فلا يُوقَّع عليها حتى تعيد الإدارة توثيقها.';
  end if;
  perform partnership_terms_check(v_a.model, v_a.terms, v_feddans);

  -- BUG-14 (backlog 162): a land is contracted once for a stretch of time. Two signatures
  -- at one moment meet at the land's row; then the area already held by SIGNED agreements
  -- on it is counted day by day, and the busiest day must still leave room for this one.
  v_start := (v_a.terms->>'start_date')::date;
  v_end := (v_a.terms->>'end_date')::date;
  select coalesce(max(h.held), 0) into v_peak
    from (
      select d.day, coalesce(sum((o.terms->>'feddans')::numeric), 0) as held
        from (
          select v_start as day
          union
          select (x.terms->>'start_date')::date
            from partnership_agreements x
           where x.land_id = v_a.land_id and x.id <> v_a.id and x.status = 'signed'
             and (x.terms->>'start_date')::date between v_start and v_end
        ) d
        left join partnership_agreements o
          on o.land_id = v_a.land_id and o.id <> v_a.id and o.status = 'signed'
         and (o.terms->>'start_date')::date <= d.day and (o.terms->>'end_date')::date >= d.day
       group by d.day
    ) h;
  if v_peak + (v_a.terms->>'feddans')::numeric > v_feddans then
    raise exception 'الأرض متعاقَدٌ على % من % فداناً في جزءٍ من هذه المدّة، والمتبقّي % فقط. عدّلوا المساحة أو المدّة.',
      trim_scale(v_peak), trim_scale(v_feddans), trim_scale(greatest(v_feddans - v_peak, 0));
  end if;
  if v_a.model = 'managed' and v_manager is null then
    raise exception 'سمِّ الشركة المديرة في البنود قبل التوقيع.';
  end if;

  begin
    insert into partnership_signatures (agreement_id, version, terms_hash, signer_id, role, full_name, signature, user_agent)
    values (v_a.id, v_a.version, v_a.terms_hash, auth.uid(), v_role, btrim(p_full_name), p_signature,
            left(p_user_agent, 400));
  exception when unique_violation then
    raise exception 'وقّعتَ هذه النسخة من قبل.';
  end;

  v_needed := case when v_a.model = 'managed' then 3 else 2 end;

  if (select count(*) from partnership_signatures
       where agreement_id = v_a.id and version = v_a.version) = v_needed then
    v_ref := 'SDQ-' || to_char(now() at time zone 'Africa/Khartoum', 'YYYY') || '-'
             || lpad(nextval('partnership_agreement_ref_seq')::text, 5, '0');
    update partnership_agreements set status = 'signed', signed_at = now(), ref = v_ref where id = v_a.id;
    foreach v_party in array array_remove(array[v_a.owner_id, v_a.investor_id, v_manager], null) loop
      perform notify_user(v_party, 'agreement_signed',
        case when v_needed = 3 then 'وُقِّع عقد الشراكة من الأطراف الثلاثة' else 'وُقِّع عقد الشراكة من الطرفين' end,
        'العقد مقفلٌ الآن، وشهدت عليه سوداقري برقم ' || v_ref || '.', '/invest/agreements/' || v_a.id);
    end loop;
    perform notify_admins('agreement_signed', 'عقد شراكة جديد موقَّع',
      case when v_needed = 3 then 'وقّع صاحب أرضٍ ومستثمرٌ وشركةٌ مديرة عقد شراكة برقم '
           else 'وقّع مستثمرٌ وصاحب أرض عقد شراكة برقم ' end || v_ref || '.',
      '/admin/inbox#agreements');
    return v_ref;
  end if;

  foreach v_party in array array_remove(array[v_a.owner_id, v_a.investor_id, v_manager], null) loop
    if v_party <> auth.uid() and not exists (
         select 1 from partnership_signatures s
          where s.agreement_id = v_a.id and s.version = v_a.version and s.signer_id = v_party) then
      perform notify_user(v_party, 'agreement_update', 'وقّع طرفٌ عقد الشراكة',
        'بقي توقيعك ليُقفل العقد وتشهد عليه سوداقري.', '/invest/agreements/' || v_a.id);
    end if;
  end loop;
  return null;
end;
$$;

revoke execute on function public.partnership_agreement_sign(uuid, integer, text, text, text, text) from public, anon;
grant execute on function public.partnership_agreement_sign(uuid, integer, text, text, text, text) to authenticated;
