-- تفاصيل الأرض بعد قبول المالك (فحص 3 نوفمبر 2026، money-logic-4؛ المالك، 4 نوفمبر، السؤال 18: «نُخفيها حتى القبول»).
--
-- القائمة العامّة تعطي الولاية وفئة المساحة منذ 20261025150200، لكنّ طلبات المستثمر (investor_my_interests) ومعايناته
-- (land_inspection_list / land_inspection_view) كانت تعطيه المحلّيّة والمساحة بالفدّان قبل أن يقبله المالك — وفي محلّيّةٍ
-- صغيرة يُعرف المالك منهما. الآن: الولاية وفئة المساحة قبل القبول، والتفاصيل بعده. ولغير المستثمر (المالك، والمعاين،
-- والمدير) كما كان.

-- ── طلبات المستثمر ───────────────────────────────────────────────────────────
drop function if exists public.investor_my_interests();
create function public.investor_my_interests()
returns table (
  interest_id uuid, land_id uuid, model text, message text, status text,
  state text, locality text, feddans numeric,
  land_name text, village text, latitude numeric, longitude numeric,
  owner_name text, owner_phone text, created_at timestamptz, decided_at timestamptz, area_band text)
language sql
stable
security definer
set search_path = public
as $$
  select i.id, l.id, i.model, i.message, i.status,
         l.state,
         case when i.status = 'accepted' then l.locality end,
         case when i.status = 'accepted' then l.feddans end,
         case when i.status = 'accepted' then l.name end,
         case when i.status = 'accepted' then l.village end,
         case when i.status = 'accepted' then l.latitude end,
         case when i.status = 'accepted' then l.longitude end,
         case when i.status = 'accepted' then p.full_name end,
         case when i.status = 'accepted' then p.phone end,
         i.created_at, i.decided_at,
         land_area_band(l.feddans)
    from investor_interests i
    join lands l on l.id = i.land_id
    left join profiles p on p.id = l.owner_id
   where i.investor_id = auth.uid()
   order by i.created_at desc
   limit 200;
$$;
revoke all on function public.investor_my_interests() from public, anon;
grant execute on function public.investor_my_interests() to authenticated;

-- ── معاينات الطرف ───────────────────────────────────────────────────────────
drop function if exists public.land_inspection_list();
create function public.land_inspection_list()
returns table (
  id uuid, ref text, role text, land_id uuid, status text, state text, locality text, feddans numeric,
  checks text[], investor_note text, investor_name text, fee_sdg numeric, fee_status text,
  visit_on date, verdict text, created_at timestamptz, reported_at timestamptz, area_band text)
language sql
stable
security definer
set search_path = public
as $$
  select i.id, i.ref,
         case when i.investor_id = auth.uid() then 'investor'
              when i.owner_id = auth.uid() then 'owner' else 'inspector' end,
         i.land_id, i.status, l.state,
         case when i.investor_id <> auth.uid() or a.accepted then l.locality end,
         case when i.investor_id <> auth.uid() or a.accepted then l.feddans end,
         i.checks, i.investor_note,
         case when i.investor_id <> auth.uid() then (select full_name from profiles where id = i.investor_id) end,
         i.fee_sdg, i.fee_status, i.visit_on, i.verdict, i.created_at, i.reported_at,
         land_area_band(l.feddans)
    from land_inspections i
    join lands l on l.id = i.land_id
    cross join lateral (select exists (
      select 1 from investor_interests ii
       where ii.investor_id = auth.uid() and ii.land_id = i.land_id and ii.status = 'accepted') as accepted) a
   where auth.uid() in (i.investor_id, i.owner_id)
      or (i.inspector_id = auth.uid() and i.status in ('assigned','reported'))
   order by i.created_at desc;
$$;
revoke all on function public.land_inspection_list() from public, anon;
grant execute on function public.land_inspection_list() to authenticated;

-- ── معاينةٌ واحدة ───────────────────────────────────────────────────────────
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
  v_sees_area boolean;
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
  -- The locality and the exact area, too, wait for the owner's yes to this investor (money-logic-4): before it, the
  -- state and the area's band, as on the public list.
  v_sees_area := v_role <> 'investor' or exists (
    select 1 from investor_interests ii
     where ii.investor_id = auth.uid() and ii.land_id = v_i.land_id and ii.status = 'accepted');

  return jsonb_build_object(
    'id', v_i.id, 'ref', v_i.ref, 'me', v_role, 'status', v_i.status, 'checks', to_jsonb(v_i.checks),
    'investor_note', v_i.investor_note, 'fee_sdg', v_i.fee_sdg, 'fee_status', v_i.fee_status,
    'created_at', v_i.created_at, 'owner_decided_at', v_i.owner_decided_at,
    'assigned_at', v_i.assigned_at, 'visit_on', v_i.visit_on,
    'verdict', v_i.verdict, 'findings', v_i.findings, 'summary', v_i.summary,
    'measured_feddans', case when v_sees_area then v_i.measured_feddans end, 'reported_at', v_i.reported_at,
    'report_hash', v_i.report_hash, 'owner_reply', v_i.owner_reply, 'owner_replied_at', v_i.owner_replied_at,
    'cancel_reason', v_i.cancel_reason,
    'investor_name', case when v_role <> 'investor' then (select full_name from profiles where id = v_i.investor_id) end,
    'inspector_name', (select full_name from profiles where id = v_i.inspector_id),
    'owner_name', case when v_sees_place then (select full_name from profiles where id = v_i.owner_id) end,
    'owner_phone', case when v_role in ('inspector','admin') then (select phone from profiles where id = v_i.owner_id) end,
    'land', jsonb_build_object(
      'state', v_land.state,
      'locality', case when v_sees_area then v_land.locality end,
      'feddans', case when v_sees_area then v_land.feddans end,
      'area_band', land_area_band(v_land.feddans),
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
