-- الأرض المعروضة للمستثمرين: الولاية وفئة المساحة للناس، والمحليّة والمساحة الدقيقة لصاحبها (البند ١٩٨، بقرار المالك).
--
-- كانت القائمة العامّة تعطي المحليّة والمساحة بالفدّان، وفي محليّةٍ صغيرة يُعرف المالك منهما (وصفحة المزارع تخفيهما
-- لهذا بالذات). الآن الولاية وفئة المساحة للناس، والتفاصيل لصاحبها، وتصل المستثمرَ بعد قبول المالك كما كانت.
--
-- جزءٌ من الموجة الأولى لمراجعة البند ١٩٨ (docs/review-198-ar.md).

-- ── ٣. الأرض المعروضة ───────────────────────────────────────────────────────

create or replace function public.investor_open_lands()
returns table (land_id uuid, state text, locality text, feddans numeric, area_band text, soil_class text,
               water_source text, water_per_feddan numeric, station_key text, crop_keys text[], models text[],
               note text, documents_on_file integer, interest_status text, mine boolean)
language sql
stable
security definer
set search_path = public
as $$
  select l.id, l.state,
         case when l.owner_id = auth.uid() then l.locality end,
         case when l.owner_id = auth.uid() then l.feddans end,
         land_area_band(l.feddans),
         l.soil_class, l.water_source, l.water_per_feddan, l.station_key,
         l.crop_keys, l.investor_models, l.investor_note, l.documents_on_file::integer,
         (select i.status from investor_interests i
           where i.investor_id = auth.uid() and i.land_id = l.id
             and i.status in ('pending','accepted')
           limit 1),
         coalesce(l.owner_id = auth.uid(), false)
    from lands l
   where l.verification = 'verified'
     and l.open_to_investors
     and cardinality(l.investor_models) > 0
   order by l.feddans desc
   limit 500;
$$;
