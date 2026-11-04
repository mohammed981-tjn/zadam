-- قراءة التربة «عند الإحداثيّة» يكتبها الخادم وحده بعد أن يقرأها بنفسه (البند ١٩٨).
--
-- كان صاحب الأرض يستدعي land_set_soil_estimate بأيّ صنفٍ يشاء فيُكتب «قراءة عند الإحداثيّة» ولا تعود الأرض
-- الموثّقة للمراجعة. الدالّة الآن لمفتاح الخادم وحده، بعد أن يقرأ الخادم التربة بنفسه، ومعها معرّف من طلبها لتتحقّق
-- أنّه صاحب الأرض أو مدير.
--
-- جزءٌ من الموجة الأولى لمراجعة البند ١٩٨ (docs/review-198-ar.md).

-- ── ٤. قراءة التربة ─────────────────────────────────────────────────────────

drop function public.land_set_soil_estimate(uuid, text, integer);

create function public.land_set_soil_estimate(p_land uuid, p_actor uuid, p_class text, p_pct integer)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_found boolean;
begin
  if p_actor is null then
    raise exception 'سجّل الدخول أولاً';
  end if;
  if p_class is null or p_class !~ '^[A-Z][a-z]{3,20}$' then
    raise exception 'صنف تربة غير صالح';
  end if;
  if p_pct is null or p_pct < 0 or p_pct > 100 then
    raise exception 'احتمال التربة بين ٠ و١٠٠';
  end if;

  -- The triggers let this one write through; nothing else does.
  perform set_config('sudagri.soil_estimate', '1', true);
  update public.lands
     set soil_class = p_class, soil_source = 'point', soil_pct = p_pct
   where id = p_land
     and (owner_id = p_actor or exists (select 1 from profiles p where p.id = p_actor and p.role = 'admin'));
  v_found := found;
  perform set_config('sudagri.soil_estimate', '', true);

  if not v_found then
    raise exception 'ليست لك هذه الأرض';
  end if;
end $$;

-- The server reads the soil itself and calls this with the service key; nobody calls it with a class of their choosing.
revoke execute on function public.land_set_soil_estimate(uuid, uuid, text, integer) from public, anon, authenticated;
grant execute on function public.land_set_soil_estimate(uuid, uuid, text, integer) to service_role;
