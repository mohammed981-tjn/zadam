-- ═══════════════════════════════════════════════════════════════════════════
-- المشروعُ يعرف أرضه الموثّقة (البند ١٣٠، وكان في البند ١٢٣)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- المالك، 21 أكتوبر 2026، بعد أن سجّل أرضه ووثّقها: «كيف يتعامل المستثمرون
-- معها؟» — ثمّ وافق: «نعم، ابنِه»: أن يعرض صاحبُ الأرض الموثّقة أرضَه
-- للمستثمرين بضغطة، فتُملأ الفرصة من بيانات أرضه.
--
-- WHY A COLUMN, AND NOT ONLY A FILLED-IN FORM
--
-- Investors browse projects, not land. Until now a project and the land under
-- it were strangers: the opportunity form asked again for the place, the water
-- and the four documents, and the documents were ticked boxes — the farmer's
-- word — even when the same four files sat verified on the land. A project
-- that remembers its land lets the reviewer and the investor see that the land
-- under it was checked, instead of taking a tick for it.
--
-- THE GUARD
--
-- The column is filled by the farmer's own request, so the database decides
-- what it may point at: a land the project's submitter owns, and one the
-- administration has verified. Without this, a hand-made request could hang a
-- stranger's verified land under any project and borrow its standing.
--
-- NOTHING IS DELETED
--
-- If a land is ever removed the project keeps everything it said and only
-- forgets the link (`on delete set null`).
--
-- HISTORY
--
-- Written on 21 October for backlog 123; the apply tool cancelled it and it
-- was not repeated without the owner's word. On 22 October the owner answered
-- «نعم، أعد المحاولة» (backlog 130), as the base of one offer for each land
-- (backlog 129).

alter table public.projects
  add column if not exists land_id uuid references public.lands(id) on delete set null;

create index if not exists projects_land_id_idx
  on public.projects (land_id) where land_id is not null;

create or replace function public.enforce_project_land()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.land_id is null then
    return new;
  end if;

  if not exists (
    select 1 from lands l
    where l.id = new.land_id
      and l.owner_id = new.submitted_by
      and l.verification = 'verified'
  ) then
    raise exception 'تُربط الفرصة بأرضٍ موثّقة يملكها رافعها فقط';
  end if;

  return new;
end $$;

revoke all on function public.enforce_project_land() from public, anon;

-- «create or replace», not drop-then-create: nothing is removed, and the apply
-- tool has no destructive statement to stop on (it stopped this file once).
create or replace trigger projects_land_guard
  before insert or update of land_id, submitted_by on public.projects
  for each row execute function public.enforce_project_land();

comment on column public.projects.land_id is
  'الأرض الموثّقة التي تقوم عليها الفرصة (البند ١٢٣). يحرسها projects_land_guard: أرضٌ يملكها رافع الفرصة ووثّقتها الإدارة.';


-- ── What a visitor may see: that a project stands on a verified land ────────

-- The badge «على أرضٍ موثّقة» and the land's own document count, for every
-- published project that has a verified land under it — never which land, its
-- village or its coordinates. The project already names its place in its own
-- words; this adds only what the administration checked.
create or replace function public.public_project_lands()
returns table (project_id uuid, documents_on_file integer, documents_required integer)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, l.documents_on_file::integer, l.documents_required::integer
    from projects p join lands l on l.id = p.land_id
   where p.status <> 'draft' and l.verification = 'verified';
$$;

revoke execute on function public.public_project_lands() from public;
grant execute on function public.public_project_lands() to anon, authenticated;
