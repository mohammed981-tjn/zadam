-- ═══════════════════════════════════════════════════════════════════════════
-- صفُّ الأرض لا يُقرأ كاملاً لغير صاحبها (البند ١٢٧)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- WHAT WAS WRONG
--
-- `lands_public_read` let anyone — anon or signed in — select every column of
-- a verified, listed land: its name, village, coordinates and owner_id. RLS
-- chooses rows, not columns, and both roles held SELECT on all 28 columns.
--
-- Two promises the product makes were therefore true only on screen:
--   • the partner companies (backlog 111): «لا ترى الشركة اسم صاحب الأرض ولا
--     موقعها حتى يقبل طلبها»;
--   • the investors (backlog 124): «لا يرى المستثمر اسمك ولا موقعها حتى تقبل».
-- A request to /rest/v1/lands?open_to_investors=eq.true returned the land's
-- village and its owner's id, and public_farmer_profile turned the id into a
-- name. Checked on 21 October 2026: one land readable by anon, village and all.
--
-- WHAT REPLACES IT
--
-- The table is read by its owner and by administrators only (lands_own, which
-- stays). The two public pages that read other people's land get exactly what
-- they show, through two narrow functions:
--
--   • public_farmer_lands(owner) — the farm passport's land list. A land its
--     owner has opened to investors or partner companies appears there by
--     state only, without its name, locality, area or id — otherwise the
--     passport would undo the anonymity the listing promises.
--   • public_land_cells() — the rain map's land layer: how many verified lands
--     fall in each 1.5° cell, never a coordinate.
--
-- The policy is kept and closed (`using (false)`) rather than dropped: the
-- name stays where the earlier migrations and gates refer to it, and nothing a
-- visitor needs from it is lost.

alter policy lands_public_read on public.lands using (false);

create or replace function public.public_farmer_lands(p_owner uuid)
returns table (
  id uuid, name text, state text, locality text, feddans numeric,
  tenure text, verification_note text, offered boolean)
language sql
stable
security definer
set search_path = public
as $$
  select case when l.open_to_investors or l.open_to_partners then null else l.id end,
         case when l.open_to_investors or l.open_to_partners then null else l.name end,
         l.state,
         case when l.open_to_investors or l.open_to_partners then null else l.locality end,
         case when l.open_to_investors or l.open_to_partners then null else l.feddans end,
         l.tenure,
         l.verification_note,
         (l.open_to_investors or l.open_to_partners)
    from lands l
   where l.owner_id = p_owner
     and l.listed
     and l.verification = 'verified'
     -- The same consent the passport itself rests on.
     and exists (select 1 from profiles p where p.id = p_owner and p.publish_record)
   order by l.name;
$$;

-- The grid is src/lib/rainMap.ts: CELL_DEG 1.5 from LON_MIN 21.75 and LAT_MIN
-- 8.5. Each land is snapped to its cell's centre here, so the coordinate never
-- leaves the database.
create or replace function public.public_land_cells()
returns table (longitude numeric, latitude numeric, lands integer)
language sql
stable
security definer
set search_path = public
as $$
  select 21.75 + (floor((l.longitude - 21.75) / 1.5) + 0.5) * 1.5,
         8.5 + (floor((l.latitude - 8.5) / 1.5) + 0.5) * 1.5,
         count(*)::integer
    from lands l
   where l.listed
     and l.verification = 'verified'
     and l.latitude is not null
     and l.longitude is not null
   group by 1, 2;
$$;

revoke execute on function public.public_farmer_lands(uuid) from public;
revoke execute on function public.public_land_cells() from public;
grant execute on function public.public_farmer_lands(uuid) to anon, authenticated;
grant execute on function public.public_land_cells() to anon, authenticated;
