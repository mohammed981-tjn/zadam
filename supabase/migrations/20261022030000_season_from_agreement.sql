-- ═══════════════════════════════════════════════════════════════════════════
-- الموسمُ يبدأ من العقد الموقَّع، ويراه المستثمر (البند ١٢٩، الخطوة الثانية)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- المالك، 22 أكتوبر 2026: «أقصد بأريد أفضل… فكرة المنصّة وترتيب وإضافة ما
-- يربط حقولها»، ثمّ وافق على الخطّة كلّها بالترتيب: «نعم، ابنِه كلّه».
--
-- WHAT WAS BROKEN
--
-- A signed partnership agreement promised the investor "season stages recorded
-- with photo reports both parties can see" (src/lib/agreements.ts), and nothing
-- delivered it: the agreement had no season, and a season was readable by its
-- owner and the administrators only. The season form had no land field either,
-- and listed every published project — anyone's — to attach to.
--
-- WHAT THIS DOES
--
--   • seasons.partnership_id: the signed agreement a season carries out.
--   • A guard on the three links a season can hold. The land is the season
--     owner's own; the project is one they submitted; the agreement is signed,
--     theirs as the landowner, and on the same land (which it fills in when the
--     form left it empty). An administrator may set any of them.
--   • The investor of a signed agreement reads the season it carries out: its
--     stages, the evidence and the ledger — read only. Every write stays with
--     the owner, through the policies that were there.
--   • The evidence photos of those stages open for that investor in the bucket.
--
-- NOTHING IS REMOVED. New column, new function, new trigger, four new
-- read-only policies and one new bucket policy; the existing ones stand.

alter table public.seasons
  add column if not exists partnership_id uuid references public.partnership_agreements(id) on delete set null;

create index if not exists seasons_partnership_idx
  on public.seasons (partnership_id) where partnership_id is not null;

-- ── الحارس ──────────────────────────────────────────────────────────────────

create or replace function public.enforce_season_links()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare v_a partnership_agreements;
begin
  if is_admin() then return new; end if;

  if new.partnership_id is not null then
    select * into v_a from partnership_agreements where id = new.partnership_id;
    if v_a.id is null or v_a.status <> 'signed' or v_a.owner_id <> new.owner_id then
      raise exception 'يبدأ الموسمَ من العقد صاحبُ الأرض، بعد أن يوقّعه الطرفان.';
    end if;
    if new.land_id is null then new.land_id := v_a.land_id; end if;
    if new.land_id <> v_a.land_id then
      raise exception 'الموسم على أرض العقد نفسها.';
    end if;
  end if;

  if new.land_id is not null
     and not exists (select 1 from lands where id = new.land_id and owner_id = new.owner_id) then
    raise exception 'يُربط الموسم بأرضٍ يملكها صاحبه.';
  end if;

  if new.project_id is not null
     and not exists (select 1 from projects where id = new.project_id and submitted_by = new.owner_id) then
    raise exception 'يُربط الموسم بمشروعٍ رفعه صاحبه.';
  end if;

  return new;
end;
$$;

revoke all on function public.enforce_season_links() from public, anon;

create or replace trigger seasons_links_guard
  before insert or update of land_id, project_id, partnership_id, owner_id on public.seasons
  for each row execute function public.enforce_season_links();

-- ── المستثمر يقرأ موسمَ عقده ────────────────────────────────────────────────

-- Security definer so the policies below do not depend on the caller being able
-- to read partnership_agreements under its own policy, and stay one lookup.
create or replace function public.is_season_partner(p_season uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from seasons s join partnership_agreements a on a.id = s.partnership_id
     where s.id = p_season and a.status = 'signed' and a.investor_id = auth.uid());
$$;

revoke execute on function public.is_season_partner(uuid) from public, anon;
grant execute on function public.is_season_partner(uuid) to authenticated;

create policy seasons_partner_read on public.seasons
  for select to authenticated using (public.is_season_partner(id));

create policy stages_partner_read on public.season_stages
  for select to authenticated using (public.is_season_partner(season_id));

create policy evidence_partner_read on public.stage_evidence
  for select to authenticated using (
    exists (select 1 from season_stages st where st.id = stage_evidence.stage_id
             and public.is_season_partner(st.season_id)));

create policy ledger_partner_read on public.ledger_entries
  for select to authenticated using (public.is_season_partner(season_id));

-- ── وصور المراحل في الدلو ───────────────────────────────────────────────────

create or replace function public.partner_stage_photo_readable(p_name text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from stage_evidence se join season_stages st on st.id = se.stage_id
     where se.storage_path = p_name and public.is_season_partner(st.season_id));
$$;

revoke execute on function public.partner_stage_photo_readable(text) from public, anon;
grant execute on function public.partner_stage_photo_readable(text) to authenticated;

create policy evidence_read_partner_season on storage.objects
  for select to authenticated
  using (bucket_id = 'evidence' and public.partner_stage_photo_readable(name));
