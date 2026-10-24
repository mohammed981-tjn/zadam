-- بطاقة الحقل: فحوص الماء والتربة بتواريخها (البند ١٦٤).
--
-- «تاريخ الأرض موسماً موسماً وفحوص الماء والتربة بتواريخها، فلا يضيع على المالك الغائب والمدير الجديد»
-- (الغنيمة ٢ من كنوز، docs/studies/spoils-konoz-hawasha-ar.md). المواسم موجودة (seasons.land_id)،
-- وهذا الجدول هو الناقص: ما قاسه صاحب الأرض أو مختبرٌ لها، ومتى.
--
-- WHAT IS DELIBERATELY NOT HERE
--
--  - No verdict column. «Good» or «bad» water is a reading of numbers against a published scale
--    (FAO-29 Table 1), and the page makes that reading from the numbers; storing the reading would
--    let it disagree with them.
--  - No edit. A test is a dated measurement; a mistake is removed (within an hour, by its owner,
--    or by an administrator at any time) and entered again, not overwritten.
--  - No visitor, and no other member: a land's tests are its owner's and the administration's.
--
-- Nothing existing is touched; the table is new and ungranted until the grants below.

create table if not exists public.land_tests (
  id                 uuid primary key default gen_random_uuid(),
  land_id            uuid not null references public.lands (id) on delete cascade,
  kind               text not null check (kind in ('water', 'soil')),
  tested_on          date not null,
  lab                text check (lab is null or length(lab) <= 120),
  ec_dsm             numeric(6, 2) check (ec_dsm is null or ec_dsm between 0 and 100),
  ph                 numeric(4, 2) check (ph is null or ph between 0 and 14),
  sar                numeric(6, 2) check (sar is null or sar between 0 and 100),
  organic_matter_pct numeric(5, 2) check (organic_matter_pct is null or organic_matter_pct between 0 and 100),
  note               text check (note is null or length(note) <= 500),
  created_by         uuid default auth.uid(),
  created_at         timestamptz not null default now(),
  constraint land_tests_some_value
    check (ec_dsm is not null or ph is not null or sar is not null or organic_matter_pct is not null),
  constraint land_tests_soil_only_organic
    check (organic_matter_pct is null or kind = 'soil')
);

create index if not exists land_tests_land_idx on public.land_tests (land_id, tested_on desc);

-- Sanity a CHECK cannot give (it must be immutable): a date in the past but not before the platform's
-- own era, and a ceiling on how many a land can hold.
create or replace function public.land_tests_gate()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.tested_on < date '2000-01-01' or new.tested_on > current_date + 1 then
    raise exception 'تاريخ الفحص غير صالح: لا قبل عام ٢٠٠٠ ولا في المستقبل.';
  end if;
  if (select count(*) from land_tests where land_id = new.land_id) >= 200 then
    raise exception 'بلغت الأرض الحدّ الأقصى من الفحوص (٢٠٠).';
  end if;
  return new;
end;
$$;

revoke execute on function public.land_tests_gate() from public, anon, authenticated;

create trigger land_tests_gate
  before insert on public.land_tests
  for each row execute function public.land_tests_gate();

alter table public.land_tests enable row level security;

create policy land_tests_read on public.land_tests
  for select to authenticated
  using (exists (select 1 from public.lands l where l.id = land_tests.land_id and l.owner_id = auth.uid())
         or public.is_admin());

create policy land_tests_insert on public.land_tests
  for insert to authenticated
  with check (exists (select 1 from public.lands l where l.id = land_tests.land_id and l.owner_id = auth.uid())
              or public.is_admin());

create policy land_tests_delete on public.land_tests
  for delete to authenticated
  using (public.is_admin()
         or (created_at > now() - interval '1 hour'
             and exists (select 1 from public.lands l where l.id = land_tests.land_id and l.owner_id = auth.uid())));

grant select, insert, delete on public.land_tests to authenticated;
