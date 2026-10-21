-- ═══════════════════════════════════════════════════════════════════════════
-- عقد الشراكة يُكتب ويُوقَّع داخل المنصّة (البند ١٢٧)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- المالك، 21 أكتوبر 2026: «رسم كتابة عقد المزارعة وتوثيقه: بعد القبول تكتب
-- سوداقري العقد بين الطرفين ببنود واضحة (الحصّة، المدّة، من يدفع ماذا، ماذا
-- يحدث عند الخسارة)، وتحفظ نسخةً منه وتشهد عليه… العقد يُوقَّع في صفحة المنصّة
-- بدون نسخ أو تنزيل. ابنِ توقيعاً».
--
-- HOW IT HOLDS TOGETHER
--
--   • One agreement per accepted investor request. Either party writes the
--     terms; every save raises the version and recomputes the terms hash.
--   • A signature is for one version and one hash. A save after a signature
--     moves the version on, so the old signature no longer counts — both sign
--     the same text or nobody has signed. Old signatures are kept, never
--     deleted: they are the record that an earlier text was once agreed.
--   • When both parties have signed the current version the agreement is
--     sealed: status 'signed', a reference number, and no further saves. The
--     platform's witness is that seal — who signed, when, and the hash of the
--     exact terms.
--   • The hash is computed here, from the stored terms, never sent by the
--     browser; the browser sends the hash it displayed, and a signature is
--     refused unless the two agree. A person signs what they saw.
--
-- THE LAW THIS LEANS ON
--
-- قانون المعاملات الإلكترونيّة لسنة 2007، المادّة 8: لا يُنكر الأثر القانونيّ
-- للتوقيع لمجرّد وروده في شكلٍ إلكترونيّ؛ ومعادلته للتوقيع اليدويّ مع قرينة الصحّة
-- تحتاج شهادةً معتمدة من جهةٍ مرخَّصة (البند 4)، وليست عندنا. والمادّة 10(4):
-- يُقدَّر السجلّ الإلكترونيّ بالثقة في طريقة إنشائه وحفظه وتوقيعه وسلامة ما فيه —
-- وهذا ما يحفظه هذا الملفّ: الحساب، والاسم، والتوقيع، والوقت، والبصمة، والقفل.
--
-- NO MONEY
--
-- The documentation fee is paid by both parties equally (the owner's words),
-- and its amount is the owner's to set after the trial season (backlog 115).
-- Nothing here takes or moves money.

create sequence if not exists public.partnership_agreement_ref_seq;

create table public.partnership_agreements (
  id           uuid primary key default gen_random_uuid(),
  ref          text unique,
  interest_id  uuid not null unique references public.investor_interests(id) on delete restrict,
  land_id      uuid not null references public.lands(id) on delete restrict,
  owner_id     uuid not null references auth.users(id) on delete restrict,
  investor_id  uuid not null references auth.users(id) on delete restrict,
  model        text not null check (model in ('sharecrop','lease','finance')),
  terms        jsonb not null default '{}'::jsonb,
  version      integer not null default 1 check (version >= 1),
  terms_hash   text not null,
  status       text not null default 'draft' check (status in ('draft','signed')),
  updated_by   uuid references auth.users(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  signed_at    timestamptz
);

create index partnership_agreements_owner_idx on public.partnership_agreements (owner_id);
create index partnership_agreements_investor_idx on public.partnership_agreements (investor_id);
create index partnership_agreements_land_idx on public.partnership_agreements (land_id);

create table public.partnership_signatures (
  id            uuid primary key default gen_random_uuid(),
  agreement_id  uuid not null references public.partnership_agreements(id) on delete restrict,
  version       integer not null,
  terms_hash    text not null,
  signer_id     uuid not null references auth.users(id) on delete restrict,
  role          text not null check (role in ('owner','investor')),
  full_name     text not null check (length(btrim(full_name)) between 5 and 120),
  -- An SVG path drawn with a finger: move and line commands and numbers only.
  signature     text not null check (length(signature) between 20 and 30000
                                     and signature ~ '^[ML0-9 .-]+$'),
  user_agent    text check (user_agent is null or length(user_agent) <= 400),
  signed_at     timestamptz not null default now(),
  unique (agreement_id, version, role)
);

create index partnership_signatures_signer_idx on public.partnership_signatures (signer_id);

alter table public.partnership_agreements enable row level security;
alter table public.partnership_signatures enable row level security;

-- Writes go through the functions below and nowhere else.
revoke insert, update, delete on table public.partnership_agreements, public.partnership_signatures
  from anon, authenticated;
revoke all on sequence public.partnership_agreement_ref_seq from anon, authenticated;

create policy partnership_agreements_parties on public.partnership_agreements for select to authenticated using (
  owner_id = (select auth.uid()) or investor_id = (select auth.uid()) or is_admin());

create policy partnership_signatures_parties on public.partnership_signatures for select to authenticated using (
  exists (select 1 from partnership_agreements a
           where a.id = agreement_id
             and (a.owner_id = (select auth.uid()) or a.investor_id = (select auth.uid())))
  or is_admin());

-- ── الإشعارات: نوعان جديدان ─────────────────────────────────────────────────

alter table public.notifications drop constraint notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check
  check (kind = any (array[
    'land_submitted','land_verified','land_rejected',
    'opportunity_submitted','opportunity_approved','opportunity_rejected',
    'lead_received','feedback_received','feedback_replied',
    'nafir_joined','faza_pledged','shura_answered',
    'judiyya_update','canal_update',
    'locust_near','animal_disease',
    'stage_due',
    'investor_interest','investor_decision',
    'agreement_update','agreement_signed'
  ]));

-- ── البصمة ──────────────────────────────────────────────────────────────────

-- jsonb's text form is canonical (keys ordered), so the same terms always hash
-- the same. The parties, the land, the model and the version are part of it:
-- the same terms between other people, or a later version, is another text.
create or replace function public.partnership_terms_hash(
  p_id uuid, p_version integer, p_model text, p_owner uuid, p_investor uuid, p_land uuid, p_terms jsonb)
returns text
language sql
immutable
set search_path = public
as $$
  select encode(sha256(convert_to(
    concat_ws('|', p_id::text, p_version::text, p_model, p_owner::text, p_investor::text,
              p_land::text, p_terms::text), 'UTF8')), 'hex');
$$;

-- ── البنود: ما يُقبل وما يُرفض ──────────────────────────────────────────────

create or replace function public.partnership_terms_check(p_model text, p_terms jsonb, p_land_feddans numeric)
returns void
language plpgsql
immutable
set search_path = public
as $$
declare
  items constant text[] := array['land','water','labour','ploughing','seed','fertiliser','pesticide',
                                 'fuel','irrigation','harvest','transport','storage'];
  v_owner text[];
  v_investor text[];
  v_start date;
  v_end date;
  v_feddans numeric;
  v_os numeric;
  v_is numeric;
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

  if p_model in ('sharecrop','finance') then
    v_os := (p_terms->>'owner_share')::numeric;
    v_is := (p_terms->>'investor_share')::numeric;
    if v_os is null or v_is is null or v_os < 1 or v_is < 1 or v_os + v_is <> 100 then
      raise exception 'حصّتا المحصول نسبتان تجمعان ١٠٠٪، ولكلّ طرفٍ ١٪ على الأقلّ.';
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

-- ── الطرفان ─────────────────────────────────────────────────────────────────

-- Opens the agreement of an accepted request, or returns the one already open.
create or replace function public.partnership_agreement_open(p_interest uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_i investor_interests;
  v_land lands;
  v_id uuid;
  v_terms jsonb;
begin
  if auth.uid() is null then raise exception 'سجّل الدخول أولاً.'; end if;
  select * into v_i from investor_interests where id = p_interest;
  if v_i.id is null then raise exception 'لا طلب بهذا المعرّف.'; end if;
  select * into v_land from lands where id = v_i.land_id;
  if auth.uid() not in (v_i.investor_id, v_land.owner_id) then raise exception 'لستَ طرفاً في هذا الطلب.'; end if;
  if v_i.status <> 'accepted' then raise exception 'يُكتب العقد بعد أن يقبل صاحب الأرض الطلب.'; end if;

  select id into v_id from partnership_agreements where interest_id = p_interest;
  if v_id is not null then return v_id; end if;

  v_id := gen_random_uuid();
  v_terms := jsonb_build_object('feddans', v_land.feddans, 'owner_provides', '["land"]'::jsonb,
                                'investor_provides', '[]'::jsonb, 'loss_rule', 'by_contribution');
  insert into partnership_agreements (id, interest_id, land_id, owner_id, investor_id, model, terms, terms_hash, updated_by)
  values (v_id, p_interest, v_land.id, v_land.owner_id, v_i.investor_id, v_i.model, v_terms,
          partnership_terms_hash(v_id, 1, v_i.model, v_land.owner_id, v_i.investor_id, v_land.id, v_terms),
          auth.uid());
  return v_id;
end;
$$;

-- Saves the terms. Every save is a new version; signatures of the old one stay
-- on record but no longer count.
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
begin
  if auth.uid() is null then raise exception 'سجّل الدخول أولاً.'; end if;
  select * into v_a from partnership_agreements where id = p_agreement for update;
  if v_a.id is null or auth.uid() not in (v_a.owner_id, v_a.investor_id) then
    raise exception 'لستَ طرفاً في هذا العقد.';
  end if;
  if v_a.status = 'signed' then raise exception 'العقد موقَّعٌ من الطرفين ومقفل — لا يُعدَّل.'; end if;

  select feddans into v_feddans from lands where id = v_a.land_id;
  perform partnership_terms_check(v_a.model, p_terms, v_feddans);

  update partnership_agreements
     set terms = p_terms,
         version = v_a.version + 1,
         terms_hash = partnership_terms_hash(v_a.id, v_a.version + 1, v_a.model, v_a.owner_id,
                                             v_a.investor_id, v_a.land_id, p_terms),
         updated_by = auth.uid(),
         updated_at = now()
   where id = v_a.id;

  v_other := case when auth.uid() = v_a.owner_id then v_a.investor_id else v_a.owner_id end;
  perform notify_user(v_other, 'agreement_update', 'عُدِّلت بنود عقد الشراكة',
    'اقرأ البنود الجديدة ووقّعها إن وافقت عليها — أيّ توقيعٍ سابق لم يعد يكفي.',
    '/invest/agreements/' || v_a.id);
  return v_a.version + 1;
end;
$$;

-- Signs the current version. The browser sends the version and the hash it
-- showed; both must match what is stored.
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
  v_other uuid;
begin
  if auth.uid() is null then raise exception 'سجّل الدخول أولاً.'; end if;
  select * into v_a from partnership_agreements where id = p_agreement for update;
  if v_a.id is null or auth.uid() not in (v_a.owner_id, v_a.investor_id) then
    raise exception 'لستَ طرفاً في هذا العقد.';
  end if;
  if v_a.status = 'signed' then raise exception 'العقد موقَّعٌ من الطرفين.'; end if;
  if p_version <> v_a.version or p_hash <> v_a.terms_hash then
    raise exception 'عُدِّلت البنود منذ فتحتَ الصفحة. اقرأ النسخة الجديدة ثمّ وقّع.';
  end if;

  -- The terms must be complete before anyone signs them.
  select feddans into v_feddans from lands where id = v_a.land_id;
  perform partnership_terms_check(v_a.model, v_a.terms, v_feddans);

  v_role := case when auth.uid() = v_a.owner_id then 'owner' else 'investor' end;
  begin
    insert into partnership_signatures (agreement_id, version, terms_hash, signer_id, role, full_name, signature, user_agent)
    values (v_a.id, v_a.version, v_a.terms_hash, auth.uid(), v_role, btrim(p_full_name), p_signature,
            left(p_user_agent, 400));
  exception when unique_violation then
    raise exception 'وقّعتَ هذه النسخة من قبل.';
  end;

  v_other := case when v_role = 'owner' then v_a.investor_id else v_a.owner_id end;

  if (select count(*) from partnership_signatures
       where agreement_id = v_a.id and version = v_a.version) = 2 then
    v_ref := 'SDQ-' || to_char(now() at time zone 'Africa/Khartoum', 'YYYY') || '-'
             || lpad(nextval('partnership_agreement_ref_seq')::text, 5, '0');
    update partnership_agreements set status = 'signed', signed_at = now(), ref = v_ref where id = v_a.id;
    perform notify_user(v_a.owner_id, 'agreement_signed', 'وُقِّع عقد الشراكة من الطرفين',
      'العقد مقفلٌ الآن، وشهدت عليه سوداقري برقم ' || v_ref || '.', '/invest/agreements/' || v_a.id);
    perform notify_user(v_a.investor_id, 'agreement_signed', 'وُقِّع عقد الشراكة من الطرفين',
      'العقد مقفلٌ الآن، وشهدت عليه سوداقري برقم ' || v_ref || '.', '/invest/agreements/' || v_a.id);
    perform notify_admins('agreement_signed', 'عقد شراكة جديد موقَّع',
      'وقّع مستثمرٌ وصاحب أرض عقد شراكة برقم ' || v_ref || '.', '/admin/inbox#agreements');
    return v_ref;
  end if;

  perform notify_user(v_other, 'agreement_update', 'وقّع الطرف الآخر عقد الشراكة',
    'بقي توقيعك ليُقفل العقد وتشهد عليه سوداقري.', '/invest/agreements/' || v_a.id);
  return null;
end;
$$;

-- What a party sees: the agreement, both names, the land, and the signatures of
-- the current version. Names and the land's place are visible here because the
-- owner accepted the request — the same moment investor_my_interests reveals
-- them.
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
begin
  if auth.uid() is null then raise exception 'سجّل الدخول أولاً.'; end if;
  select * into v_a from partnership_agreements where id = p_agreement;
  if v_a.id is null or not (auth.uid() in (v_a.owner_id, v_a.investor_id) or is_admin()) then
    raise exception 'لستَ طرفاً في هذا العقد.';
  end if;
  select * into v_land from lands where id = v_a.land_id;
  return jsonb_build_object(
    'id', v_a.id, 'ref', v_a.ref, 'model', v_a.model, 'terms', v_a.terms, 'version', v_a.version,
    'terms_hash', v_a.terms_hash, 'status', v_a.status, 'signed_at', v_a.signed_at,
    'updated_at', v_a.updated_at, 'created_at', v_a.created_at,
    'me', case when auth.uid() = v_a.owner_id then 'owner'
               when auth.uid() = v_a.investor_id then 'investor' else 'admin' end,
    'owner_name', (select full_name from profiles where id = v_a.owner_id),
    'investor_name', (select full_name from profiles where id = v_a.investor_id),
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

-- ── الصلاحيات ───────────────────────────────────────────────────────────────

revoke execute on function public.partnership_terms_hash(uuid, integer, text, uuid, uuid, uuid, jsonb) from public, anon;
revoke execute on function public.partnership_terms_check(text, jsonb, numeric) from public, anon;
revoke execute on function public.partnership_agreement_open(uuid) from public, anon;
revoke execute on function public.partnership_agreement_save(uuid, jsonb) from public, anon;
revoke execute on function public.partnership_agreement_sign(uuid, integer, text, text, text, text) from public, anon;
revoke execute on function public.partnership_agreement_view(uuid) from public, anon;

grant execute on function public.partnership_agreement_open(uuid) to authenticated;
grant execute on function public.partnership_agreement_save(uuid, jsonb) to authenticated;
grant execute on function public.partnership_agreement_sign(uuid, integer, text, text, text, text) to authenticated;
grant execute on function public.partnership_agreement_view(uuid) to authenticated;
