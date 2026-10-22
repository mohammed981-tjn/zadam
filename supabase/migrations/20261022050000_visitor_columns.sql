-- ═══════════════════════════════════════════════════════════════════════════
-- ما يقرؤه الزائر، وما لا يقرؤه (البند ١٣٢)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- المالك، 22 أكتوبر 2026: «هناك أشياء لا يجب أن يطّلع عليها كلّ زائر،
-- والعكس». ثمّ اختار، بعد أن رأى المراجعة (docs/studies/visitor-visibility-ar.md):
-- «نعم، سدّها كلّها».
--
-- WHY COLUMNS, NOT ROWS
--
-- The public key is in every browser, so whatever a row-level policy lets
-- `anon` read, anyone can read straight from the API — whether or not a page
-- prints it. Row-level security decides which rows; it cannot hide a column of
-- a row it lets through. Column privileges can. So for each table whose rows a
-- visitor may read, `anon` loses SELECT on the table and gets it back on every
-- column except those listed beside it below.
--
--   • who did it — the account id that ties one person's charter signature to
--     their export offer and their market offer, and the administrator's id;
--   • what the administration wrote to itself — `review_note`;
--   • how to reach someone who wrote feedback — `contact`;
--   • where export goods and their plots are, to the metre — the coordinates
--     (a buyer who signs in still sees them: they are the proof of origin);
--   • storage paths that begin with the uploader's account id;
--   • the land under a project — the one column that ties an anonymous land
--     offer on /invest to the farmer named on the project.
--
-- Two of these are not a visitor's business nor any other member's: the
-- administration's review note on a supplier or a partner company, and the
-- contact of whoever wrote feedback. Signed-in members lose those as well; the
-- owner and the administrators read them through review_notes() and
-- feedback_contacts(). A project's review note is not shown to anyone: an
-- approval clears it and a refused project stays a draft, which only the
-- administrators read.
--
-- A NEW COLUMN IS INVISIBLE TO VISITORS UNTIL IT IS GRANTED
--
-- With the table-level grant gone, a column added later reaches `anon` only
-- when a migration grants it — and a page that asks for `*` as a visitor then
-- fails. That is the safe direction to fail in, and it is why the pages name
-- their columns (src/lib/visitorColumns.ts). scripts/verify-visitor-columns.ts
-- holds those names to the grants here, and the SQL gate holds the grants to
-- the tables.
--
-- NOTHING LEAKED BEFORE THIS
--
-- On 22 October 2026 every table touched here had no row a visitor could read
-- that carried any of these columns. This closes them before they fill.

-- ── الموردون ────────────────────────────────────────────────────────────────
-- hidden from visitors: owner_id, licence_doc_path, verified_by, review_note
-- hidden from members:  review_note
revoke select on table public.suppliers from anon, authenticated;
grant select (id, name, state, locality, phone, whatsapp, delivery_states, categories,
              pesticide_licence_no, seed_registration_no, commercial_registration_no,
              bio, verified_at, active, created_at, updated_at)
  on table public.suppliers to anon;
grant select (id, owner_id, name, state, locality, phone, whatsapp, delivery_states, categories,
              pesticide_licence_no, seed_registration_no, commercial_registration_no,
              licence_doc_path, bio, verified_at, verified_by, active, created_at, updated_at)
  on table public.suppliers to authenticated;

-- ── الشركات الشريكة ─────────────────────────────────────────────────────────
-- hidden from visitors: owner_id, verified_by, review_note
-- hidden from members:  review_note
revoke select on table public.partner_companies from anon, authenticated;
grant select (id, name, commercial_registration_no, kinds, states, contact_name, phone, whatsapp,
              bio, verified_at, active, created_at, updated_at)
  on table public.partner_companies to anon;
grant select (id, owner_id, name, commercial_registration_no, kinds, states, contact_name, phone,
              whatsapp, bio, verified_at, verified_by, active, created_at, updated_at)
  on table public.partner_companies to authenticated;

-- ── مقدّمو الخدمة ───────────────────────────────────────────────────────────
-- hidden from visitors: owner_id, verified_by
revoke select on table public.service_providers from anon;
grant select (id, name, kind, bio, phone, regions, verified_at, active, created_at, paused_by_owner)
  on table public.service_providers to anon;

-- ── المشاريع ────────────────────────────────────────────────────────────────
-- hidden from visitors: created_by, review_note, land_id
-- submitted_by stays: /projects/[slug] links it to /farmers/[id], which shows
-- nothing unless that farmer chose to publish their record.
revoke select on table public.projects from anon;
grant select (id, slug, name, location, description, total_feddans, price_per_share, total_shares,
              shares_sold, status, risk_level, expected_annual_return, cover_image_url, created_at,
              is_demo, review_status, submitted_by, risk_score, crop_key, station_key,
              planting_month, irrigation, water_source, declared_water_per_feddan,
              documents_on_file, documents_required, km_to_market)
  on table public.projects to anon;

-- ── الملاحظات ───────────────────────────────────────────────────────────────
-- hidden from visitors: author_id, contact, replied_by
-- hidden from members:  contact
revoke select on table public.feedback from anon, authenticated;
grant select (id, display_name, page_path, kind, body, status, admin_reply, replied_at, published,
              created_at, ai_reply, ai_replied_at, ai_reply_engine)
  on table public.feedback to anon;
grant select (id, author_id, display_name, page_path, kind, body, status, admin_reply, replied_at,
              replied_by, published, created_at, ai_reply, ai_replied_at, ai_reply_engine)
  on table public.feedback to authenticated;

-- ── النفير والفزعة والميثاق والشورى والجوديّة ──────────────────────────────
-- hidden from visitors: the account id of each person
revoke select on table public.charter_signatures from anon;
grant select (charter_version, role, display_name, pledge, state, signed_at, verified_at)
  on table public.charter_signatures to anon;

revoke select on table public.nafir_calls from anon;
grant select (id, display_name, kind, title, description, state, locality, starts_on, needed,
              hosting, bring_tools, status, outcome, attended, created_at, closed_at, canal_id)
  on table public.nafir_calls to anon;

revoke select on table public.nafir_joins from anon;
grant select (call_id, display_name, brings, joined_at)
  on table public.nafir_joins to anon;

revoke select on table public.faza_requests from anon;
grant select (id, display_name, cause, title, description, state, locality, needs, status,
              created_at, closed_at)
  on table public.faza_requests to anon;

revoke select on table public.faza_pledges from anon;
grant select (id, request_id, display_name, kind, detail, kept_at, created_at)
  on table public.faza_pledges to anon;

revoke select on table public.judiyya_mediators from anon;
grant select (display_name, state, about, created_at, verified_at)
  on table public.judiyya_mediators to anon;

-- hidden from visitors: author_id, answered_by
revoke select on table public.shura_items from anon;
grant select (id, display_name, kind, title, body, answer, answer_name, answered_at, created_at)
  on table public.shura_items to anon;

-- ── عروض البيع والشراء ──────────────────────────────────────────────────────
-- hidden from visitors: created_by, photo_path (no page shows it)
revoke select on table public.market_offers from anon;
grant select (id, kind, crop, quantity, unit, grade, state, locality, price_sdg, price_usd,
              contact_phone, whatsapp, notes, status, expires_at, created_at, closed_at)
  on table public.market_offers to anon;

-- ── عروض التصدير ────────────────────────────────────────────────────────────
-- hidden from visitors: owner_id, reviewed_by; the actor of each event;
-- coordinates, plot boundaries and evidence storage paths
revoke select on table public.export_offers from anon;
grant select (id, reference, season_id, corridor_id, grade_id, quantity, uom_code, unit_price_minor,
              currency_code, value_minor, status, shipment_date, requirements_frozen_at,
              submitted_at, reviewed_at, rejection_reason, created_at, updated_at)
  on table public.export_offers to anon;

revoke select on table public.export_offer_events from anon;
grant select (id, offer_id, from_status, to_status, reason, occurred_at)
  on table public.export_offer_events to anon;

revoke select on table public.export_offer_custody from anon;
grant select (id, offer_id, sequence, occurred_at, place_name, note, created_at)
  on table public.export_offer_custody to anon;

revoke select on table public.export_offer_origins from anon;
grant select (id, offer_id, plot_ref, area_hectares)
  on table public.export_offer_origins to anon;

revoke select on table public.export_offer_evidence from anon;
grant select (id, offer_id, kind, captured_at, sha256, created_at, document_type_id)
  on table public.export_offer_evidence to anon;

-- ── سياساتٌ في جداول أخرى كانت تقرأ رقم الحساب بنفسها ───────────────────────
-- A policy's own columns are not checked against the reader's privileges, but
-- a subquery inside it reads another table as the reader. Three policies that
-- a visitor's query meets ask "is this row's company yours?" by reading
-- owner_id from the parent table — which a visitor can no longer read, so the
-- whole query would fail (/suppliers, /market/inputs, /partners, /services).
-- They now ask a function that reads it as the project. Same question, same
-- answer; only who reads owner_id changes. services_own keeps its WITH CHECK,
-- which only a signed-in owner or an administrator ever meets.
-- Left as they are: the export offer children and service_contracts. Their
-- policies read export_offers.owner_id or service_providers.owner_id too, so a
-- visitor reading them directly is now refused outright; no page does, and
-- none of it is a visitor's to read.

create or replace function public.owns_supplier(p_supplier uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from suppliers where id = p_supplier and owner_id = auth.uid());
$$;
revoke execute on function public.owns_supplier(uuid) from public;
grant execute on function public.owns_supplier(uuid) to anon, authenticated;

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

create or replace function public.owns_service_provider(p_provider uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from service_providers where id = p_provider and owner_id = auth.uid());
$$;
revoke execute on function public.owns_service_provider(uuid) from public;
grant execute on function public.owns_service_provider(uuid) to anon, authenticated;

alter policy supplier_products_read on public.supplier_products
  using ((active and exists (select 1 from suppliers s
                              where s.id = supplier_products.supplier_id
                                and s.verified_at is not null and s.active))
         or owns_supplier(supplier_id)
         or is_admin());

alter policy partner_agreements_read on public.partner_agreements
  using ((status = 'active' and exists (select 1 from partner_companies c
                                         where c.id = partner_agreements.company_id
                                           and c.verified_at is not null and c.active))
         or owns_partner_company(company_id)
         or is_admin());

alter policy services_own on public.services
  using (owns_service_provider(provider_id) or is_admin());

-- ── ما حُجب عن الأعضاء يقرؤه صاحبه والإدارة ─────────────────────────────────

-- The review note on one's own supplier or partner company, or on all of them
-- for an administrator.
create or replace function public.review_notes(p_kind text)
returns table (id uuid, review_note text)
language sql
stable
security definer
set search_path = public
as $$
  select s.id, s.review_note from suppliers s
   where p_kind = 'supplier' and s.review_note is not null
     and (s.owner_id = auth.uid() or is_admin())
  union all
  select c.id, c.review_note from partner_companies c
   where p_kind = 'partner_company' and c.review_note is not null
     and (c.owner_id = auth.uid() or is_admin());
$$;
revoke execute on function public.review_notes(text) from public, anon;
grant execute on function public.review_notes(text) to authenticated;

-- How to reach whoever wrote feedback: the administrators only.
create or replace function public.feedback_contacts()
returns table (id uuid, contact text)
language sql
stable
security definer
set search_path = public
as $$
  select f.id, f.contact from feedback f
   where is_admin() and f.contact is not null;
$$;
revoke execute on function public.feedback_contacts() from public, anon;
grant execute on function public.feedback_contacts() to authenticated;

-- ── الطلب الجماعيّ الملغى لا يراه إلا أعضاؤه ────────────────────────────────
-- group_order_directory already left cancelled orders out for everyone but
-- their organiser; the detail still answered for any id. Same columns, same
-- order; only the last line is new.
create or replace function public.group_order_detail(p_order uuid)
returns table (id uuid, title text, supplier_id uuid, supplier_name text, supplier_phone text,
               organiser_name text, organiser_phone text,
               pickup_name text, pickup_locality text, pickup_state text,
               pickup_lat numeric, pickup_lng numeric,
               drop_day date, deadline date, target_tonnes numeric, pledged_tonnes numeric,
               members bigint, deposit_pct numeric, payee text, payee_account text,
               notes text, status text, my_role text)
language sql
stable
security definer
set search_path = public
as $$
  with r as (select group_order_role(p_order) as role)
  select o.id, o.title, o.supplier_id, s.name, s.phone,
         o.organiser_name,
         case when r.role is not null or is_admin() then o.organiser_phone end,
         o.pickup_name, o.pickup_locality, o.pickup_state, o.pickup_lat, o.pickup_lng,
         o.drop_day, o.deadline, o.target_tonnes,
         coalesce((select round(sum(p.quantity * l.unit_kg) / 1000, 2)
                     from group_order_pledges p join group_order_lines l on l.id = p.line_id
                    where p.order_id = o.id and p.status in ('pledged','deposit_received','collected')), 0),
         (select count(distinct p.user_id) from group_order_pledges p
           where p.order_id = o.id and p.status in ('pledged','deposit_received','collected')),
         o.deposit_pct, o.payee,
         case when r.role is not null or is_admin() then o.payee_account end,
         o.notes, o.status, r.role
    from group_orders o join suppliers s on s.id = o.supplier_id, r
   where o.id = p_order
     and (o.status <> 'cancelled' or r.role is not null or is_admin());
$$;

-- ── لا رقمَ هاتفٍ في ملاحظة الأرض المعروضة ──────────────────────────────────
-- The note is read by every visitor beside a land offered without its owner's
-- name or place. A phone number in it undoes that. Nine digits or more, in
-- Western or Arabic-Indic numerals, with spaces, dots, dashes, brackets or a
-- plus between them, is a phone number here; an area or a price is not that
-- long. The owner may write to the table directly (lands_own), so the table
-- refuses it; the function says why first, in words the owner reads.
alter table public.lands
  add constraint lands_investor_note_no_phone
  check (investor_note is null
         or translate(investor_note, '٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹', '01234567890123456789')
            !~ '[0-9]([[:space:]().+-]*[0-9]){8,}');

create or replace function public.land_set_investor_consent(
  p_land uuid, p_open boolean, p_models text[], p_note text, p_soil_class text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_land lands;
begin
  if auth.uid() is null then raise exception 'سجّل الدخول أولاً.'; end if;
  select * into v_land from lands where id = p_land and owner_id = auth.uid();
  if v_land.id is null then raise exception 'ليست لك هذه الأرض.'; end if;

  if coalesce(p_open, false) then
    if v_land.verification <> 'verified' then
      raise exception 'لا تُعرض أرضٌ على المستثمرين قبل أن توثّقها الإدارة.';
    end if;
    if coalesce(cardinality(p_models), 0) = 0 then
      raise exception 'اختر نموذجاً واحداً على الأقلّ من نماذج الشراكة.';
    end if;
    if translate(coalesce(p_note, ''), '٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹', '01234567890123456789')
       ~ '[0-9]([[:space:]().+-]*[0-9]){8,}' then
      raise exception 'لا تكتب رقم هاتفٍ في ملاحظة الأرض: يراها كلّ زائر، ويصلك المستثمر عبر المنصّة بعد أن تقبل طلبه.';
    end if;
  end if;

  update lands
     set open_to_investors = coalesce(p_open, false),
         investor_models = case when coalesce(p_open, false) then p_models else investor_models end,
         investor_note = case when coalesce(p_open, false)
                              then nullif(btrim(p_note), '')
                              else investor_note end,
         soil_class = coalesce(soil_class, nullif(btrim(p_soil_class), ''))
   where id = p_land;
end;
$$;
