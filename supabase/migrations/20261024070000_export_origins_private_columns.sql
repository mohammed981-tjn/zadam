-- إحداثيّات مصدر الشحنة وحدودها لا يقرؤها كلُّ مسجَّل (DB-12، البند ١٧٥، الجزء الأوّل).
--
-- 20261022050000_visitor_columns.sql حجبت عن الزائر (anon) خطَّ العرض والطول وحدودَ المزرعة في
-- export_offer_origins. لكنّ سياسة القراءة تفتح صفوف العروض «المنشورة» لكلّ أحد، و`authenticated` يملك
-- SELECT على الجدول كلّه — فمن سجّل حساباً مجّانيّاً قرأ من واجهة PostgREST مكانَ كلّ مزرعةٍ تصدّر
-- وحدودَها. هذا هو الجزء الذي كان الزائر محجوباً عنه عمداً.
--
-- هنا يُسحب SELECT الجدوليّ من `authenticated` وتُمنح الأعمدة الأربعة العامّة صراحةً (كما للزائر)،
-- وتُقرأ الأعمدة الثلاثة الخاصّة بدالّة تعيدها لصاحب العرض وللمدير وحدهما. الكتابة (INSERT وUPDATE)
-- لم تُمسّ، فنموذج العرض يكتب الإحداثيّات كما كان.
--
-- ما لم يدخل هنا: أعمدة projects وsuppliers التي يقرؤها المسجَّل (معرّف المنشئ وملاحظة المراجعة
-- ومسار الرخصة)؛ هي معرّفاتٌ لا مواقع، وبنود الطابور ١٨١.

revoke select on table public.export_offer_origins from authenticated;
grant select (id, offer_id, plot_ref, area_hectares)
  on table public.export_offer_origins to authenticated;

create or replace function public.export_offer_origins_detail(p_offer_ids uuid[])
returns table (
  offer_id uuid,
  plot_ref text,
  area_hectares numeric,
  latitude numeric,
  longitude numeric,
  boundary jsonb
)
language sql
stable
security definer
set search_path = public
as $$
  select o.offer_id, o.plot_ref, o.area_hectares, o.latitude, o.longitude, o.boundary
    from export_offer_origins o
    join export_offers e on e.id = o.offer_id
   where o.offer_id = any (p_offer_ids)
     and (e.owner_id = auth.uid() or is_admin());
$$;

revoke execute on function public.export_offer_origins_detail(uuid[]) from public, anon;
grant execute on function public.export_offer_origins_detail(uuid[]) to authenticated;
