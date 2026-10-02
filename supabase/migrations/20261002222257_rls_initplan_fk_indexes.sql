-- أداء قاعدة البيانات (المالك، 2 أكتوبر 2026، من نتائج الفحص في البند ٦٧):
-- اثنان ممّا نبّه إليه مستشار Supabase، ولا يغيّر أيٌّ منها مَن يرى ماذا.
--
-- 1. Row-level security that re-evaluates auth.uid() for every row.
--    A policy written `owner_id = auth.uid()` calls the function once per row
--    scanned; `owner_id = (select auth.uid())` lets the planner compute it once
--    per statement (an InitPlan). Same value, same answer, same rows — the
--    function is stable within a statement — only cheaper as tables grow. The
--    advisor counted 59 such policies; this rewrites every policy in `public`
--    that calls auth.uid(), auth.jwt(), auth.role() or current_setting()
--    unwrapped, by editing the stored expression rather than restating 59
--    policies by hand, so nothing can drift between the old text and the new.
--    Policies written later in the plain form are caught by the advisor again.
--
-- 2. Foreign keys without an index on the referencing column(s): every
--    delete or key update on the parent then scans the child table, and the
--    joins the pages make (stage → evidence, contract → milestone…) have no
--    index to use. One btree per such key, named after it.
--
-- Not here: the duplicate (ip, created_at) index on assistant_requests,
-- `idx_assistant_requests_ip_time`. It exists only in the live database (no
-- migration creates it), and dropping it waits on the owner's confirmation.
--
-- Left as they are, deliberately: "multiple permissive policies" (143) —
-- merging an admin policy into an owner policy changes how a reader reasons
-- about who can see a row, which is worth more than the planner time; and
-- "unused index" (17) — unused on today's traffic is not unused.

-- 1 ─────────────────────────────────────────────────────────────────────────
do $$
declare
  p record;
  wrap text := 'auth\.(uid|jwt|role)\(\)';
  setting text := 'current_setting\(([^()]*)\)';
  q text;
  c text;
  stmt text;
begin
  for p in
    select tablename, policyname, qual, with_check
      from pg_policies
     where schemaname = 'public'
       and coalesce(qual, '') || coalesce(with_check, '') ~ (wrap || '|' || setting)
       and coalesce(qual, '') || coalesce(with_check, '') !~ 'SELECT (auth\.|current_setting)'
  loop
    q := regexp_replace(regexp_replace(p.qual, wrap, '(select auth.\1())', 'g'),
                        setting, '(select current_setting(\1))', 'g');
    c := regexp_replace(regexp_replace(p.with_check, wrap, '(select auth.\1())', 'g'),
                        setting, '(select current_setting(\1))', 'g');
    stmt := format('alter policy %I on public.%I', p.policyname, p.tablename);
    if q is not null then stmt := stmt || format(' using (%s)', q); end if;
    if c is not null then stmt := stmt || format(' with check (%s)', c); end if;
    execute stmt;
  end loop;
end $$;

-- 2 ─────────────────────────────────────────────────────────────────────────
do $$
declare
  fk record;
  cols text;
  idx text;
begin
  for fk in
    select con.conrelid, con.conname, con.conkey, cls.relname
      from pg_constraint con
      join pg_class cls on cls.oid = con.conrelid
      join pg_namespace ns on ns.oid = cls.relnamespace
     where con.contype = 'f'
       and ns.nspname = 'public'
       -- No index whose leading columns are exactly the key's columns.
       and not exists (
         select 1
           from pg_index i
          where i.indrelid = con.conrelid
            and (i.indkey::int2[])[0:array_length(con.conkey, 1) - 1] @> con.conkey
            and (i.indkey::int2[])[0:array_length(con.conkey, 1) - 1] <@ con.conkey
       )
  loop
    select string_agg(format('%I', a.attname), ', ' order by k.ord)
      into cols
      from unnest(fk.conkey) with ordinality as k(attnum, ord)
      join pg_attribute a on a.attrelid = fk.conrelid and a.attnum = k.attnum;
    idx := left(fk.conname, 55) || '_fk_idx';
    execute format('create index if not exists %I on public.%I (%s)', idx, fk.relname, cols);
  end loop;
end $$;
