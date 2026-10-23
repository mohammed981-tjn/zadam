-- الشراكة الثلاثيّة: أرضٌ ومالٌ وشركةٌ تدير (البند ١٣٦).
--
-- The owner chose, on 23 October, the model Sudanese Islamic banks run as a
-- three-party musharaka (docs/studies/partnership-models-ar.md): the landowner
-- brings the land, the investor the money, and a manager the work — here a
-- verified partner company (backlog 111), which takes an agreed share of the
-- net profit for managing, the rest split between the other two by the
-- shares written. It suits the investor abroad who will not farm himself.
--
-- The company becomes a third party to the agreement:
--
-- - named in the terms (`manager_company`), so the fingerprint every party
--   signs covers who manages; mirrored into `manager_company_id` by the save
--   function, so row-level security can let that company read it;
-- - verified and active when named, and not owned by either of the other two;
-- - signing as 'manager'; a managed agreement seals on the third signature,
--   a two-party one on the second, as before.
--
-- Written in «رسائل» (docs/coordination.md, 2026-10-23) before the two
-- policies below were altered.
--
-- Run after 20261023010000_partnership_trust.sql: partnership_terms_check here
-- is that migration's, with the managed model added.

-- ═══════════════════════════════════════════════════════════════════════════
-- ١) النموذج والطرف الثالث
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.lands
  drop constraint if exists lands_investor_models_check,
  add constraint lands_investor_models_check
    check (investor_models <@ array['sharecrop','lease','finance','musaqah','managed']);

alter table public.investor_interests
  drop constraint if exists investor_interests_model_check,
  add constraint investor_interests_model_check
    check (model in ('sharecrop','lease','finance','musaqah','managed'));

alter table public.partnership_agreements
  drop constraint if exists partnership_agreements_model_check,
  add constraint partnership_agreements_model_check
    check (model in ('sharecrop','lease','finance','musaqah','managed'));

alter table public.partnership_agreements
  add column if not exists manager_company_id uuid references public.partner_companies(id) on delete restrict;

create index if not exists partnership_agreements_manager_idx
  on public.partnership_agreements (manager_company_id) where manager_company_id is not null;

alter table public.partnership_signatures
  drop constraint if exists partnership_signatures_role_check,
  add constraint partnership_signatures_role_check
    check (role in ('owner','investor','manager'));

-- ═══════════════════════════════════════════════════════════════════════════
-- ٢) البنود
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.partnership_terms_check(p_model text, p_terms jsonb, p_land_feddans numeric)
returns void
language plpgsql
immutable
set search_path = public
as $$
declare
  items constant text[] := array['land','water','labour','ploughing','seed','fertiliser','pesticide',
                                 'fuel','irrigation','harvest','transport','storage',
                                 'trees','pruning'];
  v_owner text[];
  v_investor text[];
  v_start date;
  v_end date;
  v_feddans numeric;
  v_os numeric;
  v_is numeric;
  v_ms numeric;
begin
  if jsonb_typeof(p_terms) <> 'object' then raise exception 'بنود العقد غير صالحة.'; end if;

  if length(btrim(coalesce(p_terms->>'crop', ''))) not between 2 and 80 then
    raise exception 'اكتب المحصول أو النشاط.';
  end if;
  if length(btrim(coalesce(p_terms->>'season', ''))) not between 2 and 80 then
    raise exception 'اكتب الموسم (مثل: الموسم الشتوي ٢٠٢٦/٢٧).';
  end if;

  begin
    v_start := (p_terms->>'start_date')::date;
    v_end := (p_terms->>'end_date')::date;
  exception when others then
    raise exception 'تاريخا البداية والنهاية غير صالحين.';
  end;
  if v_start is null or v_end is null or v_end <= v_start or v_end > v_start + 1096 then
    raise exception 'النهاية بعد البداية، والمدّة ثلاث سنوات على الأكثر.';
  end if;

  v_feddans := (p_terms->>'feddans')::numeric;
  if v_feddans is null or v_feddans <= 0 or v_feddans > p_land_feddans then
    raise exception 'المساحة أكبر من صفر ولا تتجاوز مساحة الأرض.';
  end if;

  select coalesce(array_agg(x), '{}') into v_owner from jsonb_array_elements_text(coalesce(p_terms->'owner_provides', '[]')) x;
  select coalesce(array_agg(x), '{}') into v_investor from jsonb_array_elements_text(coalesce(p_terms->'investor_provides', '[]')) x;
  if not (v_owner <@ items and v_investor <@ items) then raise exception 'بندٌ غير معروف فيما يقدّمه الطرفان.'; end if;
  if v_owner && v_investor then raise exception 'البند الواحد يقدّمه طرفٌ واحد — راجع ما يقدّمه كلٌّ منكما.'; end if;
  if cardinality(v_owner) + cardinality(v_investor) = 0 then raise exception 'اختر ما يقدّمه كلّ طرف.'; end if;

  if p_model in ('sharecrop','finance','musaqah','managed') then
    v_os := (p_terms->>'owner_share')::numeric;
    v_is := (p_terms->>'investor_share')::numeric;
    if v_os is null or v_is is null or v_os < 1 or v_is < 1 or v_os + v_is <> 100 then
      raise exception 'حصّتا المحصول نسبتان تجمعان ١٠٠٪، ولكلّ طرفٍ ١٪ على الأقلّ.';
    end if;
  end if;

  if p_model = 'musaqah' and not ('trees' = any (v_owner)) then
    raise exception 'في المساقاة الشجرُ القائم من صاحب الأرض — اختره فيما يقدّمه.';
  end if;

  -- The manager's share is of the net profit, before the other two divide
  -- the rest; the company is named here so that the signed text names it.
  if p_model = 'managed' then
    if coalesce(p_terms->>'manager_company', '') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      raise exception 'اختر الشركة الشريكة التي تدير الزراعة.';
    end if;
    v_ms := (p_terms->>'manager_share')::numeric;
    if v_ms is null or v_ms < 1 or v_ms > 50 then
      raise exception 'حصّة الشركة المديرة نسبةٌ من صافي الربح بين ١٪ و٥٠٪.';
    end if;
  end if;

  if p_model = 'lease' then
    if (p_terms->>'rent_amount')::numeric is null or (p_terms->>'rent_amount')::numeric <= 0 then
      raise exception 'اكتب مبلغ الأجرة.';
    end if;
    if coalesce(p_terms->>'rent_schedule', '') not in ('upfront','two_parts','after_harvest') then
      raise exception 'اختر موعد دفع الأجرة.';
    end if;
  end if;

  if p_model = 'finance' then
    if (p_terms->>'finance_amount')::numeric is null or (p_terms->>'finance_amount')::numeric <= 0 then
      raise exception 'اكتب مبلغ التمويل.';
    end if;
  end if;

  if p_model in ('lease','finance') and coalesce(p_terms->>'currency', '') not in ('SDG','USD') then
    raise exception 'اختر العملة.';
  end if;

  if coalesce(p_terms->>'loss_rule', '') not in ('by_contribution','investor_inputs','custom') then
    raise exception 'اختر حكم الخسارة.';
  end if;
  if p_terms->>'loss_rule' = 'custom' and length(btrim(coalesce(p_terms->>'loss_text', ''))) < 10 then
    raise exception 'اكتب حكم الخسارة الذي اتّفقتما عليه.';
  end if;

  if length(coalesce(p_terms->>'extra', '')) > 2000 or length(coalesce(p_terms->>'loss_text', '')) > 1000 then
    raise exception 'النصّ أطول من المسموح.';
  end if;
end;
$$;

revoke execute on function public.partnership_terms_check(text, jsonb, numeric) from public, anon;

-- ═══════════════════════════════════════════════════════════════════════════
-- ٣) الحفظ والتوقيع والعرض
-- ═══════════════════════════════════════════════════════════════════════════

-- As in 20261021230000_partnership_agreements.sql, and for a managed
-- agreement: the company named must be verified and active, and owned by
-- neither party; it is written to manager_company_id and told.
create or replace function public.partnership_agreement_save(p_agreement uuid, p_terms jsonb)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_a partnership_agreements;
  v_feddans numeric;
  v_other uuid;
  v_company partner_companies;
begin
  if auth.uid() is null then raise exception 'سجّل الدخول أولاً.'; end if;
  select * into v_a from partnership_agreements where id = p_agreement for update;
  if v_a.id is null or auth.uid() not in (v_a.owner_id, v_a.investor_id) then
    raise exception 'لستَ طرفاً في هذا العقد.';
  end if;
  if v_a.status = 'signed' then raise exception 'العقد موقَّعٌ ومقفل — لا يُعدَّل.'; end if;

  select feddans into v_feddans from lands where id = v_a.land_id;
  perform partnership_terms_check(v_a.model, p_terms, v_feddans);

  if v_a.model = 'managed' then
    select * into v_company from partner_companies where id = (p_terms->>'manager_company')::uuid;
    if v_company.id is null or v_company.verified_at is null or not v_company.active then
      raise exception 'الشركة المديرة يجب أن تكون شركةً شريكةً موثّقةً نشطة.';
    end if;
    if v_company.owner_id in (v_a.owner_id, v_a.investor_id) then
      raise exception 'الشركة المديرة طرفٌ ثالث — لا يملكها صاحب الأرض ولا المستثمر.';
    end if;
  end if;

  update partnership_agreements
     set terms = p_terms,
         version = v_a.version + 1,
         terms_hash = partnership_terms_hash(v_a.id, v_a.version + 1, v_a.model, v_a.owner_id,
                                             v_a.investor_id, v_a.land_id, p_terms),
         manager_company_id = case when v_a.model = 'managed' then v_company.id end,
         updated_by = auth.uid(),
         updated_at = now()
   where id = v_a.id;

  v_other := case when auth.uid() = v_a.owner_id then v_a.investor_id else v_a.owner_id end;
  perform notify_user(v_other, 'agreement_update', 'عُدِّلت بنود عقد الشراكة',
    'اقرأ البنود الجديدة ووقّعها إن وافقت عليها — أيّ توقيعٍ سابق لم يعد يكفي.',
    '/invest/agreements/' || v_a.id);
  if v_a.model = 'managed' then
    perform notify_user(v_company.owner_id, 'agreement_update', 'سُمّيت شركتك لإدارة شراكة',
      'صاحب أرضٍ ومستثمر سمّيا شركتك لإدارة الزراعة بحصّةٍ من صافي الربح. اقرأ العقد ووقّعه إن قبلت.',
      '/invest/agreements/' || v_a.id);
  end if;
  return v_a.version + 1;
end;
$$;

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

  select feddans into v_feddans from lands where id = v_a.land_id;
  perform partnership_terms_check(v_a.model, v_a.terms, v_feddans);
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

create or replace function public.partnership_agreement_view(p_agreement uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_a partnership_agreements;
  v_land lands;
  v_company partner_companies;
begin
  if auth.uid() is null then raise exception 'سجّل الدخول أولاً.'; end if;
  select * into v_a from partnership_agreements where id = p_agreement;
  if v_a.id is null then raise exception 'لستَ طرفاً في هذا العقد.'; end if;
  if v_a.manager_company_id is not null then
    select * into v_company from partner_companies where id = v_a.manager_company_id;
  end if;
  if not (auth.uid() in (v_a.owner_id, v_a.investor_id)
          or (v_company.id is not null and auth.uid() = v_company.owner_id)
          or is_admin()) then
    raise exception 'لستَ طرفاً في هذا العقد.';
  end if;
  select * into v_land from lands where id = v_a.land_id;
  return jsonb_build_object(
    'id', v_a.id, 'ref', v_a.ref, 'model', v_a.model, 'terms', v_a.terms, 'version', v_a.version,
    'terms_hash', v_a.terms_hash, 'status', v_a.status, 'signed_at', v_a.signed_at,
    'updated_at', v_a.updated_at, 'created_at', v_a.created_at,
    'me', case when auth.uid() = v_a.owner_id then 'owner'
               when auth.uid() = v_a.investor_id then 'investor'
               when v_company.id is not null and auth.uid() = v_company.owner_id then 'manager'
               else 'admin' end,
    'owner_name', (select full_name from profiles where id = v_a.owner_id),
    'investor_name', (select full_name from profiles where id = v_a.investor_id),
    'manager_name', v_company.name,
    'land', jsonb_build_object('name', v_land.name, 'state', v_land.state, 'locality', v_land.locality,
                               'village', v_land.village, 'feddans', v_land.feddans,
                               'water_source', v_land.water_source, 'documents_on_file', v_land.documents_on_file),
    'signatures', coalesce((select jsonb_agg(jsonb_build_object(
                     'role', s.role, 'full_name', s.full_name, 'signature', s.signature,
                     'signed_at', s.signed_at, 'version', s.version) order by s.signed_at)
                   from partnership_signatures s
                  where s.agreement_id = v_a.id and s.version = v_a.version), '[]'::jsonb),
    'earlier_signatures', (select count(*) from partnership_signatures s
                            where s.agreement_id = v_a.id and s.version < v_a.version)
  );
end;
$$;

revoke execute on function public.partnership_agreement_save(uuid, jsonb) from public, anon;
revoke execute on function public.partnership_agreement_sign(uuid, integer, text, text, text, text) from public, anon;
revoke execute on function public.partnership_agreement_view(uuid) from public, anon;
grant execute on function public.partnership_agreement_save(uuid, jsonb) to authenticated;
grant execute on function public.partnership_agreement_sign(uuid, integer, text, text, text, text) to authenticated;
grant execute on function public.partnership_agreement_view(uuid) to authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- ٤) القراءة: الشركة المسمّاة تقرأ عقدها وتواقيعه
-- ═══════════════════════════════════════════════════════════════════════════

-- owns_partner_company() is security definer, so the policy does not read
-- partner_companies.owner_id with the reader's own privileges. Defined first in
-- 20261022050000_visitor_columns.sql; restated here unchanged so that this
-- migration stands on its own.
create or replace function public.owns_partner_company(p_company uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from partner_companies where id = p_company and owner_id = auth.uid());
$$;
revoke execute on function public.owns_partner_company(uuid) from public;
grant execute on function public.owns_partner_company(uuid) to anon, authenticated;

alter policy partnership_agreements_parties on public.partnership_agreements using (
  owner_id = (select auth.uid()) or investor_id = (select auth.uid())
  or (manager_company_id is not null and owns_partner_company(manager_company_id))
  or is_admin());

alter policy partnership_signatures_parties on public.partnership_signatures using (
  exists (select 1 from partnership_agreements a
           where a.id = agreement_id
             and (a.owner_id = (select auth.uid()) or a.investor_id = (select auth.uid())
                  or (a.manager_company_id is not null and owns_partner_company(a.manager_company_id))))
  or is_admin());
