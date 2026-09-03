-- الهجرة التي وعد بها #42 ولم تصل.
--
-- WHAT THIS CLOSES
--
-- #42 moved the farmer profile page to read `farmer_season_records` with the
-- service-role client, and its own message named the exposure precisely:
--
--   «والدالة SECURITY DEFINER وصلاحيتها للعموم، ومفتاح anon في كل متصفح
--    يفتح الموقع. فمن يعرف معرّف المالك ينادي النقطة مباشرة ويقرأ المال
--    الذي تمتنع الصفحة عن طباعته عمداً.»
--
-- It then said, correctly, that the revoke belongs in a later migration —
-- because code-before-grant is the safe order, and the reverse breaks the page.
-- That later migration never arrived. #43 was the next one and it adds the
-- consent column and `public_farmer_profile`; it does not touch this grant.
--
-- So the app-side half has been live since 2026-08-24 and the boundary half has
-- not. The page stopped printing the figures; the endpoint kept serving them.
--
-- WHY IT IS REACHABLE, NOT MERELY THEORETICAL
--
-- The owner id is not a secret to guess. `src/app/projects/[slug]/page.tsx`
-- links to `/farmers/${submitted_by}` on every public project page, so any
-- visitor reads a real owner uuid out of the markup, then calls the endpoint
-- with the anon key and gets that farmer's per-season planned budget, actual
-- costs and revenue.
--
-- AND CONSENT DOES NOT COVER IT
--
-- This is the part worth stating plainly, because #43 reads as if it did.
-- `publish_record` is checked inside `public_farmer_profile` — the name and
-- country page. `farmer_season_records` has no such check, and an attacker
-- calling it directly never passes through the profile function at all. So a
-- farmer who was never asked, and never consented, still has season figures
-- readable today. The consent switch governs the page, not the money.
--
-- WHY A LOOP RATHER THAN A NAMED SIGNATURE
--
-- The function still lives only in the Supabase dashboard (ع-4), so its exact
-- argument types cannot be read from this repository. Naming a signature that
-- turns out to be wrong would make this migration fail on production — the one
-- place it must not. Looping over `pg_proc` revokes every overload by its real
-- signature, whatever it is.
--
-- And when the function is absent the loop simply does not run: a database
-- built from these migrations alone has never had it, so raising there would
-- break `supabase db reset` for a function this repo does not create. The
-- notice says so out loud instead of passing silently.
--
-- STILL OWED AFTER THIS: pulling the definition itself into the repo
-- (`supabase db pull`), so that what it returns can be reviewed rather than
-- inferred from its callers.

do $$
declare
  fn    record;
  found integer := 0;
begin
  for fn in
    select p.oid::regprocedure as sig
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname = 'farmer_season_records'
  loop
    execute format('revoke all on function %s from public, anon, authenticated', fn.sig);
    execute format('grant execute on function %s to service_role', fn.sig);
    found := found + 1;
    raise notice 'سُحبت صلاحية التنفيذ العامة عن %', fn.sig;
  end loop;

  if found = 0 then
    raise notice
      'لا وجود لـ farmer_season_records في هذه القاعدة — لا شيء يُسحب. '
      'هذا متوقَّع في قاعدةٍ بُنيت من الهجرات وحدها، ومقلقٌ في الإنتاج.';
  end if;
end $$;
