-- الدفعة صفر من خطّة الإصلاح (البند ١٤٢، docs/review-fix-plan-ar.md).
--
-- The owner, 23 October: «راجع تسجيل الدخول فهو متلخبط جدّاً … هناك خطورة أن
-- يسجّل كلّ زائرٍ أرضه وتحصل نزاعات — التسجيل ليس عشوائيّاً إلّا بعد اعتماد
-- المنصّة وإثبات الحيازة». Four things, each small:
--
-- ① auth_account_exists(): the one sign-in screen asks it, after a failed
--   sign-in, whether to say «كلمة المرور غير صحيحة» or to open the name field
--   and create the account. Server only — the service role calls it, after the
--   route's rate limit. It says no more than the signup form already says
--   («هذا الرقم مسجّل بالفعل»).
--
-- ② The three-argument investor_express_interest is closed. The site calls the
--   four-argument one, with the risk acknowledgement, since #194 was deployed
--   (20261023010000_partnership_trust.sql said this would follow). Revoked,
--   not dropped.
--
-- ③ A verified land's facts do not change under the seal (MAP-2, DB-9 in the
--   audit). The owner may still write to the row — the site has no form that
--   does, but the API grants it — and a change to where the land is, how big,
--   its water, its soil or its tenure sends it back to review and off the
--   public map, with a note naming what changed. Administrators and the
--   service role are not reopened: they are the review.
--
-- ④ A land registered near another owner's land is flagged to the
--   administrators before anyone verifies it. Points only until the map
--   drawing of backlog 134 brings boundaries: two lands are "near" when their
--   centres are closer than the radii their areas imply, added, or 300 m,
--   whichever is larger. No PostGIS on this project; the haversine is enough at
--   this scale.
--
-- No policy is changed. Notifications reuse the kind 'land_submitted', so the
-- notifications CHECK is not touched.

-- ═══════════════════════════════════════════════════════════════════════════
-- ① هل لهذا العنوان حساب؟
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.auth_account_exists(p_email text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from auth.users where lower(email) = lower(btrim(p_email)));
$$;

revoke execute on function public.auth_account_exists(text) from public, anon, authenticated;
grant execute on function public.auth_account_exists(text) to service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- ② الطلب بلا إقرارٍ بالمخاطرة يُغلق
-- ═══════════════════════════════════════════════════════════════════════════

revoke execute on function public.investor_express_interest(uuid, text, text) from public, anon, authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- ③ وقائع الأرض الموثّقة لا تتغيّر تحت الختم
-- ═══════════════════════════════════════════════════════════════════════════

-- Runs after lands_listing_gate (triggers fire in name order), so the gate
-- sees the owner's own change and this one then moves the land to review: the
-- gate refuses an owner who sets verification himself, not this.
create or replace function public.reopen_land_on_fact_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_changed text[];
begin
  if old.verification <> 'verified' then return new; end if;
  if auth.uid() is null or is_admin() then return new; end if;

  v_changed := array_remove(array[
    case when new.latitude is distinct from old.latitude
           or new.longitude is distinct from old.longitude then 'الموقع' end,
    case when (new.state, new.locality, new.village)
           is distinct from (old.state, old.locality, old.village) then 'الولاية أو المحلّيّة أو القرية' end,
    case when new.feddans is distinct from old.feddans then 'المساحة' end,
    case when (new.water_source, new.water_per_feddan)
           is distinct from (old.water_source, old.water_per_feddan) then 'الماء' end,
    case when (new.soil_class, new.soil_note)
           is distinct from (old.soil_class, old.soil_note) then 'التربة' end,
    case when new.tenure is distinct from old.tenure then 'نوع الحيازة' end
  ], null);

  if cardinality(v_changed) = 0 then return new; end if;

  new.verification := 'submitted';
  new.listed := false;
  new.verification_note := 'عُدِّل بعد التوثيق: ' || array_to_string(v_changed, '، ')
                           || '. تُراجَع الأرض من جديد قبل أن تُعرض.';

  perform notify_user(new.owner_id, 'land_submitted',
    'عادت أرضك إلى المراجعة',
    format('غيّرتَ %s في الأرض "%s" بعد توثيقها، فلا تُعرض حتى تراجعها الإدارة من جديد.',
           array_to_string(v_changed, '، '), coalesce(new.name, 'أرضك')),
    '/lands');
  return new;
end;
$$;

revoke execute on function public.reopen_land_on_fact_change() from public, anon;

create or replace trigger lands_reopen_on_fact_change
  before update on public.lands
  for each row execute function public.reopen_land_on_fact_change();

-- ═══════════════════════════════════════════════════════════════════════════
-- ④ أرضٌ قريبة من أرضٍ باسمٍ آخر
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.land_distance_m(
  p_lat1 numeric, p_lon1 numeric, p_lat2 numeric, p_lon2 numeric)
returns double precision
language sql
immutable
set search_path = public
as $$
  select 2 * 6371000 * asin(sqrt(
           power(sin(radians((p_lat2 - p_lat1)::float8 / 2)), 2)
           + cos(radians(p_lat1::float8)) * cos(radians(p_lat2::float8))
             * power(sin(radians((p_lon2 - p_lon1)::float8 / 2)), 2)));
$$;

revoke execute on function public.land_distance_m(numeric, numeric, numeric, numeric) from public, anon;
grant execute on function public.land_distance_m(numeric, numeric, numeric, numeric) to authenticated;

-- A feddan is 4,200 m²; a land's radius is that of a circle of its area.
create or replace function public.flag_land_neighbours()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text;
  v_dist double precision;
begin
  if new.latitude is null or new.longitude is null then return new; end if;
  if tg_op = 'UPDATE' and new.latitude is not distinct from old.latitude
     and new.longitude is not distinct from old.longitude then
    return new;
  end if;

  select l.name, x.d into v_name, v_dist
    from lands l
    cross join lateral (select land_distance_m(new.latitude, new.longitude, l.latitude, l.longitude) as d) x
   where l.id <> new.id
     and l.owner_id <> new.owner_id
     and l.latitude is not null and l.longitude is not null
     and abs(l.latitude - new.latitude) < 0.2
     and abs(l.longitude - new.longitude) < 0.2
     and x.d < greatest(300, sqrt(coalesce(new.feddans, 0) * 4200 / pi())
                             + sqrt(coalesce(l.feddans, 0) * 4200 / pi()))
   order by x.d
   limit 1;

  if v_name is not null then
    perform notify_admins('land_submitted',
      'أرضٌ قريبة من أرضٍ مسجّلة باسمٍ آخر',
      format('الأرض "%s" على نحو %s متر من الأرض "%s" المسجّلة لمالكٍ آخر. تحقّق من الحيازة والحدود قبل التوثيق.',
             coalesce(new.name, 'بلا اسم'), round(v_dist)::int, v_name),
      '/admin/lands');
  end if;
  return new;
end;
$$;

revoke execute on function public.flag_land_neighbours() from public, anon;

create or replace trigger lands_flag_neighbours
  after insert or update of latitude, longitude on public.lands
  for each row execute function public.flag_land_neighbours();
