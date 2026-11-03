-- حدود الأرض نفسها، لا مساحتها ومركزها وحدهما (البند ١٣٤ — ما بقي منه).
--
-- «حدّد أرضك» في التطبيق يرسم الحقل بالمشي حوله أو بالنقر على أركانه، وكان الخادم يحفظ ما حسبه منه (المساحة
-- والمركز) ويرمي الأركان. فيُحفظ الشكل الآن مع الأرض: تراه الإدارة حين تراجعها وتقارن المساحة المعلنة بما يحيط
-- به، ويُرسم على الخريطة لصاحبها.
--
--   - `boundary`: الأركان بترتيبها حول الحقل، [[lat, lng], …]، من ٣ إلى ٥٠٠، كلٌّ في حدود العالم. والقيد يرفض ما
--     ليس كذلك؛ أمّا أنّ الأركان تحيط بمساحةٍ فعلاً فيفحصه الخادم قبل الكتابة (`boundaryOf`).
--   - يقرؤه من يقرأ الصفّ: صاحبه والإدارة (والوكيل المأذون له في الأراضي، بسياسته)؛ وصفّ الأرض لا يُقرأ لغيرهم
--     منذ 20261021220000، والدوالّ العامّة لا تعيد هذا العمود.
--   - وتغييره في أرضٍ موثّقة يُعيدها إلى المراجعة، كتغيير موقعها أو مساحتها.

-- Each corner a pair of numbers inside the world. Immutable, so a check constraint may call it.
create function public.land_boundary_valid(p jsonb)
returns boolean
language sql
immutable
set search_path = public
as $$
  select coalesce(bool_and(
           jsonb_typeof(c) = 'array' and jsonb_array_length(c) = 2
           and jsonb_typeof(c -> 0) = 'number' and jsonb_typeof(c -> 1) = 'number'
           and abs((c ->> 0)::numeric) <= 90 and abs((c ->> 1)::numeric) <= 180), false)
    from jsonb_array_elements(p) c
$$;

-- The check runs as whoever writes the row — a farmer through the site or the app, or the server. Since 20261024030000
-- a new function is executable by nobody until granted (audit db-b-1, 3 November 2026: without this line every
-- insert or update of a land as a signed-in user failed). It reads nothing but its argument.
revoke execute on function public.land_boundary_valid(jsonb) from public;
grant execute on function public.land_boundary_valid(jsonb) to anon, authenticated, service_role;

alter table public.lands
  add column boundary jsonb
  constraint lands_boundary_shape check (
    boundary is null
    or (jsonb_typeof(boundary) = 'array'
        and jsonb_array_length(boundary) between 3 and 500
        and public.land_boundary_valid(boundary))
  );

comment on column public.lands.boundary is
  'أركان الأرض بترتيبها حولها [[lat, lng], …] كما رسمها صاحبها بالمشي أو على الخريطة؛ والمساحة والموقع محسوبان منها.';


-- ── التوثيق: تغيير الحدود يُعيد الأرض الموثّقة إلى المراجعة ──────────────────
-- The body is the one in 20261024100000_land_soil_estimate.sql, word for word, but for the boundary line.

create or replace function public.reopen_land_on_fact_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_changed text[];
  v_machine boolean := coalesce(current_setting('sudagri.soil_estimate', true), '') = '1';
begin
  if old.verification <> 'verified' then return new; end if;
  if auth.uid() is null or is_admin() then return new; end if;

  v_changed := array_remove(array[
    case when new.latitude is distinct from old.latitude
           or new.longitude is distinct from old.longitude then 'الموقع' end,
    case when new.boundary is distinct from old.boundary then 'الحدود' end,
    case when (new.state, new.locality, new.village)
           is distinct from (old.state, old.locality, old.village) then 'الولاية أو المحلّيّة أو القرية' end,
    case when new.feddans is distinct from old.feddans then 'المساحة' end,
    case when (new.water_source, new.water_per_feddan)
           is distinct from (old.water_source, old.water_per_feddan) then 'الماء' end,
    case when (new.soil_class, new.soil_note)
           is distinct from (old.soil_class, old.soil_note)
          and not (v_machine and new.soil_note is not distinct from old.soil_note) then 'التربة' end,
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
