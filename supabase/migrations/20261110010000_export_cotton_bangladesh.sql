-- شروط القطن إلى بنغلاديش (البند ١١٨: «الباقي ينتظر مصدراً رسمياً»؛ المالك، 10 نوفمبر 2026: «القطن فقط»).
--
-- المصدر الرسميّ: لائحة الحجر النباتيّ البنغلاديشيّة 2018 (الجريدة الرسميّة، 10 مايو 2018؛ نسختها على موقع
-- جمارك بنغلاديش hub.bangladeshcustoms.gov.bd)، وصفحة الاستيراد في الجمارك (bangladeshcustoms.gov.bd):
--   - القاعدة 3(1)(c)(vii): «القطن الخام والزغب» يحتاج إذن استيراد، يُطلب قبل فتح الاعتماد المستنديّ (3(5)).
--   - القاعدة 9(2): طلب الإفراج يرافقه إذن الاستيراد وشهادة الحجر النباتيّ.
--   - القاعدة 14: «القطن الأمريكيّ» (المزروع في الأمريكتين) يُبخَّر إلزاماً عند الوصول، وما شُحن معه يُعامل معاملته؛
--     فشهادة المنشأ تُثبت أنّ القطن سودانيّ — يُنصح بها ولا تُشترط.
--
-- والصمغ إلى الهند يبقى بلا قواعد: لائحة الحجر الهنديّة 2003 تطلب شهادة حجرٍ لكلّ منتجٍ نباتيّ، لكنّ الصمغ غير
-- مذكورٍ بالاسم في جداولها، فلا يُعرف بيقينٍ أيحتاج إذن استيراد. لا يُمسّ شيءٌ قائم.

insert into export_corridors (commodity_id, destination_id)
select c.id, d.id
from export_commodities c, export_destinations d
where c.code = 'cotton' and d.code = 'BD'
on conflict (commodity_id, destination_id) do nothing;

insert into export_corridor_requirements (corridor_id, document_type_id, mode, effective_from, effective_to)
select cr.id, dt.id, v.mode, '2018-05-10'::date, null
from (values
  ('import_permit',         'required'),
  ('phytosanitary',         'required'),
  ('certificate_of_origin', 'recommended')
) as v(doc, mode)
join export_commodities    c  on c.code = 'cotton'
join export_destinations   d  on d.code = 'BD'
join export_corridors      cr on cr.commodity_id = c.id and cr.destination_id = d.id
join export_document_types dt on dt.code = v.doc
where not exists (
  select 1 from export_corridor_requirements x
   where x.corridor_id = cr.id and x.document_type_id = dt.id and x.effective_to is null
);

insert into export_corridor_reviews (corridor_id, reviewed_at, reviewed_by, source_note, outcome)
select cr.id, '2026-11-10 06:00+00', null, v.note, 'amended'
from (values (
  'بحث 10 نوفمبر 2026: لائحة الحجر النباتيّ البنغلاديشيّة 2018 (الجريدة الرسميّة، 10 مايو 2018؛ hub.bangladeshcustoms.gov.bd) — إذن استيرادٍ يطلبه المستورد قبل فتح الاعتماد المستنديّ، صالحٌ أربعة أشهر لشحنةٍ واحدة، وشهادة حجرٍ نباتيّ تقول إنّ القطن خالٍ من الآفات أو عولج منها، ويُفحص عند الوصول ويُبخَّر إن وُجدت آفة على حساب المستورد. «القطن الأمريكيّ» يُبخَّر إلزاماً وما شُحن معه على السفينة نفسها، فشهادة المنشأ تُثبت أنّه سودانيّ.'
)) as v(note)
join export_commodities  c  on c.code = 'cotton'
join export_destinations d  on d.code = 'BD'
join export_corridors    cr on cr.commodity_id = c.id and cr.destination_id = d.id
where not exists (select 1 from export_corridor_reviews r where r.corridor_id = cr.id and r.source_note = v.note);
