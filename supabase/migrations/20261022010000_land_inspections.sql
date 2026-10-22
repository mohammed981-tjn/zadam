-- ═══════════════════════════════════════════════════════════════════════════
-- تقرير معاينةٍ مستقلّ للأرض المعروضة، بأجرٍ ثابت (البند ١٢٨)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- المالك، 22 أكتوبر 2026، باختياره من مصادر الدخل في دراسة البندين ١٢٥ و١٢٦:
-- «تقرير المعاينة بأجر» — يطلب المستثمر زيارةً ميدانيّة للأرض وتقريراً بأجرٍ
-- ثابت قبل أن يقرّر.
--
-- WHY IT IS BUILT THIS WAY (docs/studies/farm-investment-platforms-ar.md, §4 #9, §6 #1)
--
--   • The fee is fixed and paid whatever the verdict. A fee that depends on the
--     land passing would pay Sudagri to pass weak land — the conflict the study
--     ranks this source low on only when the fee is flat.
--   • The share of reports by verdict is public (land_inspection_stats), so an
--     investor can see that inspections do say no.
--   • The owner agrees to the visit first. Nothing is due before they do, and
--     the investor still learns neither their name nor the land's place: only
--     the inspector, who has to visit, sees those.
--   • The inspector is assigned by an administrator, is neither party, has no
--     request of their own on the land — as an investor or as a partner
--     company — and declares no interest when they submit. The report needs at least three photos; each photo's distance
--     from the land's registered point is shown, never the point itself.
--   • A submitted report is sealed with a reference and a SHA-256 fingerprint;
--     the owner may answer it once, beneath it, and nobody edits it.
--
-- APPLIED IN FOUR PARTS
--
-- The apply tool stops at sixty seconds, so production received this file in
-- four consecutive pieces (tables; the writing functions; the reading
-- functions and grants; the bucket policies), as 20261012130000_supply_chain
-- was. The file is the whole, and the gate runs it whole.
--
-- NO MONEY HELD
--
-- The fee is Sudagri's own charge for its own service, paid to it outside the
-- platform; an administrator records that it arrived. During the trial season
-- the amount is empty and the inspection is free (backlog 115: «أنا الآن في
-- التجريب ولم آخذ أجراً»). The owner sets the amount on /admin/inspections.

-- ── الأجر: صفٌّ واحدٌ يضعه المدير، ويقرؤه الجميع ─────────────────────────────

create table public.platform_fees (
  key         text primary key,
  amount_sdg  numeric(14,2) check (amount_sdg is null or amount_sdg > 0),
  updated_at  timestamptz not null default now(),
  updated_by  uuid references auth.users(id) on delete set null
);

insert into public.platform_fees (key, amount_sdg) values ('land_inspection', null)
on conflict (key) do nothing;

alter table public.platform_fees enable row level security;
revoke insert, update, delete on table public.platform_fees from anon, authenticated;
create policy platform_fees_public_read on public.platform_fees for select to anon, authenticated using (true);

-- ── المعاينة ────────────────────────────────────────────────────────────────

create sequence if not exists public.land_inspection_ref_seq;

create table public.land_inspections (
  id                uuid primary key default gen_random_uuid(),
  ref               text unique,
  land_id           uuid not null references public.lands(id) on delete restrict,
  owner_id          uuid not null references auth.users(id) on delete restrict,
  investor_id       uuid not null references auth.users(id) on delete restrict,
  checks            text[] not null check (cardinality(checks) between 1 and 9
                      and checks <@ array['access','boundaries','area','tenure','water','soil',
                                          'current_use','equipment','security']),
  investor_note     text check (investor_note is null or length(investor_note) <= 1000),
  status            text not null default 'requested'
                      check (status in ('requested','declined','accepted','assigned','reported','cancelled')),
  -- The fee as it stood when the request was made; null means free.
  fee_sdg           numeric(14,2) check (fee_sdg is null or fee_sdg > 0),
  fee_status        text not null default 'free' check (fee_status in ('free','due','paid')),
  fee_paid_at       timestamptz,
  owner_decided_at  timestamptz,
  inspector_id      uuid references auth.users(id) on delete restrict,
  assigned_at       timestamptz,
  visit_on          date,
  verdict           text check (verdict in ('clear','conditional','not_recommended')),
  findings          jsonb,
  summary           text check (summary is null or length(summary) between 30 and 3000),
  measured_feddans  numeric(10,2) check (measured_feddans is null or measured_feddans > 0),
  independent       boolean,
  report_hash       text,
  reported_at       timestamptz,
  owner_reply       text check (owner_reply is null or length(owner_reply) between 5 and 1000),
  owner_replied_at  timestamptz,
  cancel_reason     text check (cancel_reason is null or length(cancel_reason) <= 300),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  check (inspector_id is null or (inspector_id <> owner_id and inspector_id <> investor_id))
);

-- One open request per investor and land.
create unique index land_inspections_one_open
  on public.land_inspections (land_id, investor_id)
  where status in ('requested','accepted','assigned');
create index land_inspections_owner_idx on public.land_inspections (owner_id);
create index land_inspections_investor_idx on public.land_inspections (investor_id);
create index land_inspections_inspector_idx on public.land_inspections (inspector_id);

create table public.land_inspection_photos (
  id             uuid primary key default gen_random_uuid(),
  inspection_id  uuid not null references public.land_inspections(id) on delete restrict,
  storage_path   text not null unique,
  caption        text check (caption is null or length(caption) <= 200),
  captured_at    timestamptz,
  latitude       numeric(9,6) check (latitude is null or latitude between -90 and 90),
  longitude      numeric(9,6) check (longitude is null or longitude between -180 and 180),
  created_at     timestamptz not null default now()
);

create index land_inspection_photos_inspection_idx on public.land_inspection_photos (inspection_id);

alter table public.land_inspections enable row level security;
alter table public.land_inspection_photos enable row level security;

-- Writes go through the functions below. Parties read through
-- land_inspection_list and land_inspection_view, which choose what each of them
-- may see — a row read straight from the table would hand the investor the
-- owner's id, and the farm passport would then give them the name.
revoke insert, update, delete on table public.land_inspections, public.land_inspection_photos
  from anon, authenticated;
revoke all on sequence public.land_inspection_ref_seq from anon, authenticated;

create policy land_inspections_admin_read on public.land_inspections
  for select to authenticated using (is_admin());
create policy land_inspection_photos_admin_read on public.land_inspection_photos
  for select to authenticated using (is_admin());

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
    'agreement_update','agreement_signed',
    'inspection_update','inspection_report'
  ]));

-- ── المستثمر يطلب ───────────────────────────────────────────────────────────

create or replace function public.land_inspection_request(p_land uuid, p_checks text[], p_note text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_land lands;
  v_fee numeric;
  v_id uuid;
  v_checks text[];
begin
  if auth.uid() is null then raise exception 'سجّل الدخول أولاً.'; end if;
  select * into v_land from lands where id = p_land;
  -- The same test investor_open_lands() shows the card under, so the button is
  -- never offered on a land that would refuse it.
  if v_land.id is null or v_land.verification <> 'verified'
     or not coalesce(v_land.open_to_investors, false)
     or coalesce(cardinality(v_land.investor_models), 0) = 0 then
    raise exception 'هذه الأرض غير معروضة على المستثمرين.';
  end if;
  if v_land.owner_id = auth.uid() then raise exception 'لا تطلب معاينة أرضك.'; end if;

  select coalesce(array_agg(distinct c), '{}') into v_checks from unnest(p_checks) c;
  if cardinality(v_checks) = 0 then raise exception 'اختر ما تريد أن يُتحقَّق منه.'; end if;
  if not (v_checks <@ array['access','boundaries','area','tenure','water','soil',
                            'current_use','equipment','security']) then
    raise exception 'بندُ معاينةٍ غير معروف.';
  end if;
  if length(coalesce(p_note, '')) > 1000 then raise exception 'الملاحظة أطول من المسموح.'; end if;

  select amount_sdg into v_fee from platform_fees where key = 'land_inspection';

  begin
    insert into land_inspections (land_id, owner_id, investor_id, checks, investor_note, fee_sdg)
    values (v_land.id, v_land.owner_id, auth.uid(), v_checks, nullif(btrim(p_note), ''), v_fee)
    returning id into v_id;
  exception when unique_violation then
    raise exception 'لك طلبُ معاينةٍ مفتوحٌ على هذه الأرض.';
  end;

  perform notify_user(v_land.owner_id, 'inspection_update', 'مستثمرٌ يطلب معاينةً لأرضك',
    format('يريد مستثمرٌ أن يزور مفتّشٌ من سوداقري أرضك "%s" ويكتب تقريراً. وافق أو اعتذر — لا يرى المستثمر اسمك ولا موقعها.',
           coalesce(v_land.name, '')),
    '/lands');
  perform notify_admins('inspection_update', 'طلبُ معاينةٍ جديد',
    format('على أرضٍ في %s، بانتظار موافقة صاحبها.', coalesce(v_land.state, 'ولاية غير محدّدة')),
    '/admin/inspections');
  return v_id;
end;
$$;

create or replace function public.land_inspection_cancel(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_i land_inspections;
begin
  if auth.uid() is null then raise exception 'سجّل الدخول أولاً.'; end if;
  select * into v_i from land_inspections where id = p_id for update;
  if v_i.id is null or v_i.investor_id <> auth.uid() then raise exception 'ليس طلبك.'; end if;
  if v_i.status not in ('requested','accepted') then
    raise exception 'لا يُلغى الطلب بعد أن يُسند إلى مفتّش.';
  end if;
  if v_i.fee_status = 'paid' then
    raise exception 'دُفع أجر المعاينة — تواصل مع الإدارة.';
  end if;
  update land_inspections set status = 'cancelled', updated_at = now() where id = p_id;
end;
$$;

-- ── صاحب الأرض يوافق أو يعتذر ───────────────────────────────────────────────

create or replace function public.land_inspection_owner_decide(p_id uuid, p_accept boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_i land_inspections;
begin
  if auth.uid() is null then raise exception 'سجّل الدخول أولاً.'; end if;
  select * into v_i from land_inspections where id = p_id for update;
  if v_i.id is null or v_i.owner_id <> auth.uid() then raise exception 'ليست أرضك.'; end if;
  if v_i.status <> 'requested' then raise exception 'رددتَ على هذا الطلب من قبل.'; end if;

  update land_inspections
     set status = case when p_accept then 'accepted' else 'declined' end,
         fee_status = case when p_accept and v_i.fee_sdg is not null then 'due' else 'free' end,
         owner_decided_at = now(),
         updated_at = now()
   where id = p_id;

  perform notify_user(v_i.investor_id, 'inspection_update',
    case when p_accept then 'وافق صاحب الأرض على المعاينة' else 'اعتذر صاحب الأرض عن المعاينة' end,
    case when p_accept and v_i.fee_sdg is not null
           then 'تتواصل معك الإدارة لدفع أجر المعاينة، ثمّ يُسند الطلب إلى مفتّش.'
         when p_accept then 'تُسند الإدارة الطلب إلى مفتّشٍ ويُكتب التقرير بعد زيارته.'
         else 'تصفّح أراضيَ أخرى في صفحة فرص الاستثمار.' end,
    '/invest/mine');
  if p_accept then
    perform notify_admins('inspection_update', 'معاينةٌ تنتظر مفتّشاً',
      'وافق صاحب الأرض. أسند المعاينة إلى مفتّش.', '/admin/inspections');
  end if;
end;
$$;

-- ── الإدارة: الأجر، والإسناد، والإلغاء ──────────────────────────────────────

create or replace function public.platform_fee_set(p_key text, p_amount numeric)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_admin() then raise exception 'للإدارة وحدها.'; end if;
  if p_amount is not null and p_amount <= 0 then raise exception 'الأجر أكبر من صفر، أو فارغٌ للمجّانيّ.'; end if;
  update platform_fees set amount_sdg = p_amount, updated_at = now(), updated_by = auth.uid() where key = p_key;
  if not found then raise exception 'لا رسمَ بهذا الاسم.'; end if;
end;
$$;

create or replace function public.land_inspection_mark_paid(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_i land_inspections;
begin
  if not is_admin() then raise exception 'للإدارة وحدها.'; end if;
  select * into v_i from land_inspections where id = p_id for update;
  if v_i.id is null then raise exception 'لا معاينة بهذا المعرّف.'; end if;
  if v_i.fee_status <> 'due' or v_i.status <> 'accepted' then
    raise exception 'لا أجرَ مستحقّاً على هذه المعاينة.';
  end if;
  update land_inspections set fee_status = 'paid', fee_paid_at = now(), updated_at = now() where id = p_id;
end;
$$;

create or replace function public.land_inspection_assign(p_id uuid, p_inspector uuid, p_visit_on date)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_i land_inspections;
begin
  if not is_admin() then raise exception 'للإدارة وحدها.'; end if;
  select * into v_i from land_inspections where id = p_id for update;
  if v_i.id is null then raise exception 'لا معاينة بهذا المعرّف.'; end if;
  if v_i.status not in ('accepted','assigned') then raise exception 'المعاينة ليست بانتظار مفتّش.'; end if;
  if v_i.fee_status = 'due' then raise exception 'لم يُسجَّل دفع الأجر بعد.'; end if;
  if p_inspector is null or not exists (select 1 from profiles where id = p_inspector) then
    raise exception 'اختر مفتّشاً.';
  end if;
  if p_inspector in (v_i.owner_id, v_i.investor_id) then
    raise exception 'المفتّش لا يكون صاحب الأرض ولا المستثمر.';
  end if;
  if exists (select 1 from investor_interests where land_id = v_i.land_id and investor_id = p_inspector)
     or exists (select 1 from partner_interests pi join partner_companies pc on pc.id = pi.company_id
                 where pi.land_id = v_i.land_id and pc.owner_id = p_inspector) then
    raise exception 'لهذا المفتّش طلبُ شراكةٍ على الأرض نفسها — اختر غيره.';
  end if;
  if p_visit_on is not null and p_visit_on < (now() at time zone 'Africa/Khartoum')::date then
    raise exception 'موعد الزيارة في الماضي.';
  end if;

  update land_inspections
     set status = 'assigned', inspector_id = p_inspector, assigned_at = now(),
         visit_on = p_visit_on, updated_at = now()
   where id = p_id;

  perform notify_user(p_inspector, 'inspection_update', 'أُسندت إليك معاينة أرض',
    'افتح الطلب لترى الأرض وصاحبها وما يُتحقَّق منه، ثمّ اكتب التقرير بعد الزيارة.',
    '/invest/inspections/' || p_id);
  perform notify_user(v_i.owner_id, 'inspection_update', 'مفتّشٌ سيزور أرضك',
    'يتواصل معك المفتّش ليحدّد موعد الزيارة.', '/invest/inspections/' || p_id);
  perform notify_user(v_i.investor_id, 'inspection_update', 'أُسندت معاينتك إلى مفتّش',
    'يصلك التقرير هنا بعد زيارته.', '/invest/inspections/' || p_id);
end;
$$;

create or replace function public.land_inspection_admin_cancel(p_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_i land_inspections;
begin
  if not is_admin() then raise exception 'للإدارة وحدها.'; end if;
  select * into v_i from land_inspections where id = p_id for update;
  if v_i.id is null then raise exception 'لا معاينة بهذا المعرّف.'; end if;
  if v_i.status in ('reported','cancelled','declined') then raise exception 'المعاينة منتهية.'; end if;
  if length(btrim(coalesce(p_reason, ''))) < 5 then raise exception 'اكتب سبب الإلغاء.'; end if;
  update land_inspections set status = 'cancelled', cancel_reason = left(btrim(p_reason), 300), updated_at = now()
   where id = p_id;
  perform notify_user(v_i.investor_id, 'inspection_update', 'أُلغيت المعاينة',
    left(btrim(p_reason), 300), '/invest/mine');
end;
$$;

-- ── المفتّش: الصور، ثمّ التقرير ─────────────────────────────────────────────

create or replace function public.land_inspection_add_photo(
  p_id uuid, p_path text, p_caption text, p_captured_at timestamptz, p_latitude numeric, p_longitude numeric)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_i land_inspections;
begin
  if auth.uid() is null then raise exception 'سجّل الدخول أولاً.'; end if;
  select * into v_i from land_inspections where id = p_id for update;
  if v_i.id is null or v_i.inspector_id is distinct from auth.uid() then raise exception 'لم تُسند إليك هذه المعاينة.'; end if;
  if v_i.status <> 'assigned' then raise exception 'التقرير مقفل.'; end if;
  if p_path is null or p_path not like auth.uid()::text || '/inspections/%' then raise exception 'مسار ملف غير صالح.'; end if;
  if (select count(*) from land_inspection_photos where inspection_id = p_id) >= 12 then
    raise exception 'اثنتا عشرة صورةً على الأكثر.';
  end if;
  insert into land_inspection_photos (inspection_id, storage_path, caption, captured_at, latitude, longitude)
  values (p_id, p_path, nullif(left(btrim(coalesce(p_caption, '')), 200), ''), p_captured_at, p_latitude, p_longitude);
end;
$$;

create or replace function public.land_inspection_remove_photo(p_photo uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_i land_inspections;
begin
  if auth.uid() is null then raise exception 'سجّل الدخول أولاً.'; end if;
  select i.* into v_i from land_inspections i join land_inspection_photos p on p.inspection_id = i.id where p.id = p_photo;
  if v_i.id is null or v_i.inspector_id is distinct from auth.uid() then raise exception 'لم تُسند إليك هذه المعاينة.'; end if;
  if v_i.status <> 'assigned' then raise exception 'التقرير مقفل — لا تُحذف صوره.'; end if;
  delete from land_inspection_photos where id = p_photo;
end;
$$;

create or replace function public.land_inspection_report_hash(p_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select encode(sha256(convert_to(concat_ws('|',
           i.id::text, i.ref, i.land_id::text, i.investor_id::text, i.inspector_id::text,
           i.verdict, i.findings::text, i.summary, i.measured_feddans::text,
           (select string_agg(p.storage_path, ',' order by p.storage_path)
              from land_inspection_photos p where p.inspection_id = i.id)), 'UTF8')), 'hex')
    from land_inspections i where i.id = p_id;
$$;

create or replace function public.land_inspection_submit(
  p_id uuid, p_verdict text, p_findings jsonb, p_summary text, p_measured numeric, p_independent boolean)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_i land_inspections;
  v_feddans numeric;
  v_keys text[];
  v_f jsonb;
  v_ref text;
begin
  if auth.uid() is null then raise exception 'سجّل الدخول أولاً.'; end if;
  select * into v_i from land_inspections where id = p_id for update;
  if v_i.id is null or v_i.inspector_id is distinct from auth.uid() then raise exception 'لم تُسند إليك هذه المعاينة.'; end if;
  if v_i.status <> 'assigned' then raise exception 'التقرير مقفل.'; end if;
  if not coalesce(p_independent, false) then
    raise exception 'أقرّ بأن لا قرابة ولا مصلحة لك مع الطرفين، أو اعتذر عن المعاينة للإدارة.';
  end if;
  if p_verdict not in ('clear','conditional','not_recommended') then raise exception 'اختر الخلاصة.'; end if;
  if length(btrim(coalesce(p_summary, ''))) not between 30 and 3000 then
    raise exception 'اكتب خلاصة التقرير في ثلاثين حرفاً على الأقلّ.';
  end if;
  if (select count(*) from land_inspection_photos where inspection_id = p_id) < 3 then
    raise exception 'أرفق ثلاث صورٍ من الأرض على الأقلّ.';
  end if;

  if jsonb_typeof(p_findings) <> 'array' then raise exception 'نتائج المعاينة غير صالحة.'; end if;
  select coalesce(array_agg(e->>'key' order by e->>'key'), '{}') into v_keys from jsonb_array_elements(p_findings) e;
  if v_keys is distinct from (select array_agg(c order by c) from unnest(v_i.checks) c) then
    raise exception 'لكلّ بندٍ طلبه المستثمر نتيجةٌ واحدة.';
  end if;
  for v_f in select * from jsonb_array_elements(p_findings) loop
    if coalesce(v_f->>'result', '') not in ('ok','issue','not_seen') then
      raise exception 'نتيجةُ بندٍ غير معروفة.';
    end if;
    if v_f->>'result' in ('issue','not_seen') and length(btrim(coalesce(v_f->>'note', ''))) < 5 then
      raise exception 'اكتب ما رأيت في كلّ بندٍ فيه ملاحظة أو لم يُتحقَّق منه.';
    end if;
    if length(coalesce(v_f->>'note', '')) > 500 then raise exception 'ملاحظة البند أطول من المسموح.'; end if;
  end loop;

  select feddans into v_feddans from lands where id = v_i.land_id;
  if p_measured is not null and (p_measured <= 0 or p_measured > v_feddans * 10) then
    raise exception 'المساحة المقيسة غير معقولة.';
  end if;

  v_ref := 'INS-' || to_char(now() at time zone 'Africa/Khartoum', 'YYYY') || '-'
           || lpad(nextval('land_inspection_ref_seq')::text, 5, '0');
  update land_inspections
     set status = 'reported', ref = v_ref, verdict = p_verdict,
         findings = (select jsonb_agg(jsonb_build_object('key', e->>'key', 'result', e->>'result',
                                                         'note', nullif(btrim(coalesce(e->>'note', '')), ''))
                                      order by e->>'key')
                       from jsonb_array_elements(p_findings) e),
         summary = btrim(p_summary), measured_feddans = p_measured, independent = true,
         reported_at = now(), updated_at = now()
   where id = p_id;
  update land_inspections set report_hash = land_inspection_report_hash(p_id) where id = p_id;

  perform notify_user(v_i.investor_id, 'inspection_report', 'وصل تقرير معاينة الأرض',
    'اقرأ التقرير برقم ' || v_ref || '.', '/invest/inspections/' || p_id);
  perform notify_user(v_i.owner_id, 'inspection_report', 'كُتب تقرير معاينة أرضك',
    'اقرأه، ولك أن تكتب ردّك تحته مرّةً واحدة.', '/invest/inspections/' || p_id);
  perform notify_admins('inspection_report', 'تقرير معاينة جديد',
    'رقم ' || v_ref || '.', '/admin/inspections');
  return v_ref;
end;
$$;

-- ── صاحب الأرض يردّ على التقرير مرّةً واحدة ─────────────────────────────────

create or replace function public.land_inspection_owner_reply(p_id uuid, p_text text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_i land_inspections;
begin
  if auth.uid() is null then raise exception 'سجّل الدخول أولاً.'; end if;
  select * into v_i from land_inspections where id = p_id for update;
  if v_i.id is null or v_i.owner_id <> auth.uid() then raise exception 'ليست أرضك.'; end if;
  if v_i.status <> 'reported' then raise exception 'لم يُكتب التقرير بعد.'; end if;
  if v_i.owner_reply is not null then raise exception 'كتبتَ ردّك من قبل.'; end if;
  if length(btrim(coalesce(p_text, ''))) not between 5 and 1000 then raise exception 'اكتب ردّك (٥ أحرف إلى ١٠٠٠).'; end if;
  update land_inspections set owner_reply = btrim(p_text), owner_replied_at = now(), updated_at = now() where id = p_id;
  perform notify_user(v_i.investor_id, 'inspection_update', 'ردّ صاحب الأرض على تقرير المعاينة',
    'اقرأ ردّه تحت التقرير.', '/invest/inspections/' || p_id);
end;
$$;

-- ── القراءة ─────────────────────────────────────────────────────────────────

-- Every inspection the caller is part of, with what their role may see.
create or replace function public.land_inspection_list()
returns table (
  id uuid, ref text, role text, land_id uuid, status text, state text, locality text, feddans numeric,
  checks text[], investor_note text, investor_name text, fee_sdg numeric, fee_status text,
  visit_on date, verdict text, created_at timestamptz, reported_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select i.id, i.ref,
         case when i.investor_id = auth.uid() then 'investor'
              when i.owner_id = auth.uid() then 'owner' else 'inspector' end,
         i.land_id, i.status, l.state, l.locality, l.feddans, i.checks, i.investor_note,
         case when i.investor_id <> auth.uid() then (select full_name from profiles where id = i.investor_id) end,
         i.fee_sdg, i.fee_status, i.visit_on, i.verdict, i.created_at, i.reported_at
    from land_inspections i join lands l on l.id = i.land_id
   where auth.uid() in (i.investor_id, i.owner_id)
      or (i.inspector_id = auth.uid() and i.status in ('assigned','reported'))
   order by i.created_at desc;
$$;

create or replace function public.land_inspection_view(p_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_i land_inspections;
  v_land lands;
  v_role text;
  v_sees_place boolean;
begin
  if auth.uid() is null then raise exception 'سجّل الدخول أولاً.'; end if;
  select * into v_i from land_inspections where id = p_id;
  if v_i.id is null then raise exception 'لا معاينة بهذا المعرّف.'; end if;
  v_role := case when auth.uid() = v_i.investor_id then 'investor'
                 when auth.uid() = v_i.owner_id then 'owner'
                 when auth.uid() = v_i.inspector_id and v_i.status in ('assigned','reported') then 'inspector'
                 when is_admin() then 'admin' end;
  if v_role is null then raise exception 'لستَ طرفاً في هذه المعاينة.'; end if;
  select * into v_land from lands where id = v_i.land_id;
  -- The place and the owner's name go to whoever must visit or already owns
  -- it; never to the investor.
  v_sees_place := v_role in ('owner','inspector','admin');

  return jsonb_build_object(
    'id', v_i.id, 'ref', v_i.ref, 'me', v_role, 'status', v_i.status, 'checks', to_jsonb(v_i.checks),
    'investor_note', v_i.investor_note, 'fee_sdg', v_i.fee_sdg, 'fee_status', v_i.fee_status,
    'created_at', v_i.created_at, 'owner_decided_at', v_i.owner_decided_at,
    'assigned_at', v_i.assigned_at, 'visit_on', v_i.visit_on,
    'verdict', v_i.verdict, 'findings', v_i.findings, 'summary', v_i.summary,
    'measured_feddans', v_i.measured_feddans, 'reported_at', v_i.reported_at,
    'report_hash', v_i.report_hash, 'owner_reply', v_i.owner_reply, 'owner_replied_at', v_i.owner_replied_at,
    'cancel_reason', v_i.cancel_reason,
    'investor_name', case when v_role <> 'investor' then (select full_name from profiles where id = v_i.investor_id) end,
    'inspector_name', (select full_name from profiles where id = v_i.inspector_id),
    'owner_name', case when v_sees_place then (select full_name from profiles where id = v_i.owner_id) end,
    'owner_phone', case when v_role in ('inspector','admin') then (select phone from profiles where id = v_i.owner_id) end,
    'land', jsonb_build_object(
      'state', v_land.state, 'locality', v_land.locality, 'feddans', v_land.feddans,
      'water_source', v_land.water_source, 'soil_class', v_land.soil_class,
      'documents_on_file', v_land.documents_on_file,
      'name', case when v_sees_place then v_land.name end,
      'village', case when v_sees_place then v_land.village end,
      'latitude', case when v_sees_place then v_land.latitude end,
      'longitude', case when v_sees_place then v_land.longitude end),
    -- Photos reach the parties once the report is sealed; the inspector and
    -- the administrators see them while it is written.
    'photos', case when v_role in ('inspector','admin') or v_i.status = 'reported' then
      coalesce((select jsonb_agg(jsonb_build_object(
          'id', p.id, 'path', p.storage_path, 'caption', p.caption, 'captured_at', p.captured_at,
          'distance_km', case when p.latitude is not null and p.longitude is not null
                                   and v_land.latitude is not null and v_land.longitude is not null then
            round((6371 * 2 * asin(sqrt(
              power(sin(radians(p.latitude - v_land.latitude) / 2), 2)
              + cos(radians(v_land.latitude)) * cos(radians(p.latitude))
                * power(sin(radians(p.longitude - v_land.longitude) / 2), 2))))::numeric, 1) end)
          order by p.created_at)
        from land_inspection_photos p where p.inspection_id = v_i.id), '[]'::jsonb)
      else '[]'::jsonb end
  );
end;
$$;

-- What anyone may see: how many reports were written, and how many said each
-- thing. An inspection that never says no is not worth paying for.
create or replace function public.land_inspection_stats()
returns table (reported integer, clear integer, conditional integer, not_recommended integer)
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::int,
         count(*) filter (where verdict = 'clear')::int,
         count(*) filter (where verdict = 'conditional')::int,
         count(*) filter (where verdict = 'not_recommended')::int
    from land_inspections where status = 'reported';
$$;

-- ── الصور في الدلو: يقرؤها أطراف المعاينة، ولا تُحذف بعد تسجيلها ───────────

create or replace function public.inspection_photo_readable(p_name text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from land_inspection_photos p join land_inspections i on i.id = p.inspection_id
     where p.storage_path = p_name
       and (i.inspector_id = auth.uid()
            or (i.status = 'reported' and auth.uid() in (i.investor_id, i.owner_id))));
$$;

create or replace function public.inspection_photo_recorded(p_name text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from land_inspection_photos where storage_path = p_name);
$$;

create policy evidence_read_inspection_photos on storage.objects
  for select to authenticated
  using (bucket_id = 'evidence' and public.inspection_photo_readable(name));

-- Restrictive: whatever else allows a delete, a photo a report rests on stays.
create policy evidence_keep_inspection_photos on storage.objects
  as restrictive for delete to authenticated
  using (not (bucket_id = 'evidence' and public.inspection_photo_recorded(name)));

-- ── الصلاحيات ───────────────────────────────────────────────────────────────

revoke execute on function public.land_inspection_request(uuid, text[], text) from public, anon;
revoke execute on function public.land_inspection_cancel(uuid) from public, anon;
revoke execute on function public.land_inspection_owner_decide(uuid, boolean) from public, anon;
revoke execute on function public.platform_fee_set(text, numeric) from public, anon;
revoke execute on function public.land_inspection_mark_paid(uuid) from public, anon;
revoke execute on function public.land_inspection_assign(uuid, uuid, date) from public, anon;
revoke execute on function public.land_inspection_admin_cancel(uuid, text) from public, anon;
revoke execute on function public.land_inspection_add_photo(uuid, text, text, timestamptz, numeric, numeric) from public, anon;
revoke execute on function public.land_inspection_remove_photo(uuid) from public, anon;
revoke execute on function public.land_inspection_report_hash(uuid) from public, anon, authenticated;
revoke execute on function public.land_inspection_submit(uuid, text, jsonb, text, numeric, boolean) from public, anon;
revoke execute on function public.land_inspection_owner_reply(uuid, text) from public, anon;
revoke execute on function public.land_inspection_list() from public, anon;
revoke execute on function public.land_inspection_view(uuid) from public, anon;
revoke execute on function public.land_inspection_stats() from public;
revoke execute on function public.inspection_photo_readable(text) from public, anon;
revoke execute on function public.inspection_photo_recorded(text) from public, anon;

grant execute on function public.land_inspection_request(uuid, text[], text) to authenticated;
grant execute on function public.land_inspection_cancel(uuid) to authenticated;
grant execute on function public.land_inspection_owner_decide(uuid, boolean) to authenticated;
grant execute on function public.platform_fee_set(text, numeric) to authenticated;
grant execute on function public.land_inspection_mark_paid(uuid) to authenticated;
grant execute on function public.land_inspection_assign(uuid, uuid, date) to authenticated;
grant execute on function public.land_inspection_admin_cancel(uuid, text) to authenticated;
grant execute on function public.land_inspection_add_photo(uuid, text, text, timestamptz, numeric, numeric) to authenticated;
grant execute on function public.land_inspection_remove_photo(uuid) to authenticated;
grant execute on function public.land_inspection_submit(uuid, text, jsonb, text, numeric, boolean) to authenticated;
grant execute on function public.land_inspection_owner_reply(uuid, text) to authenticated;
grant execute on function public.land_inspection_list() to authenticated;
grant execute on function public.land_inspection_view(uuid) to authenticated;
grant execute on function public.land_inspection_stats() to anon, authenticated;
grant execute on function public.inspection_photo_readable(text) to authenticated;
grant execute on function public.inspection_photo_recorded(text) to authenticated;
