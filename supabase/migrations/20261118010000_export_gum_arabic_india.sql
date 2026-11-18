-- شروط الصمغ العربيّ إلى الهند (البند ١١٨: «الصمغ إلى الهند بلا قواعد حتى يُوجد مصدرٌ يحسم إذن الاستيراد»؛
-- المالك، 18 نوفمبر 2026: «كمل كل شي ليس له علاقة بسبيس»).
--
-- المصادر الرسميّة (قُرئت في 18 نوفمبر 2026):
--   - هيئة سلامة الأغذية الهنديّة (FSSAI)، قائمة رموز النظام المنسَّق المربوطة بلوائحها (إعلان 13 فبراير 2020،
--     fssai.gov.in)، الصفّ ١٣٦٤: «13012000 … Gum arabic | LOW | 99.1 | 3.2.11.5» — فالصمغ غذاءٌ مضاف تفحصه
--     الهيئة عند الوصول؛ وهو في القائمة (ب) من الملحق الخامس لسياسة التجارة الخارجيّة (dgft.gov.in): «926. 13012000
--     … Gum Arabic | LOW»، فلا يدخل إلّا من موانئ الأغذية المعتمدة.
--   - دليل استيراد الأغذية للهيئة نفسها (Food Imports Manual): «لا يستورد أحدٌ غذاءً بلا ترخيص استيرادٍ من سلطة
--     الترخيص المركزيّة»، والشحنة تُعرض على الهيئة في نظام FICS عبر بوّابة الجمارك؛ و«شهادة المنشأ» من المستندات
--     الإلزاميّة لكلّ شحنة غذاء.
--   - الحجر النباتيّ: الصمغ غير مذكورٍ في جداول لائحة 2003، والبند 3(7)(ii) منها يعفي «المنتجات المعالَجة» التي لا
--     تحمل آفة من التصريح؛ وقائمة المنتجات المعالَجة المعفاة (وزارة الصناعات الغذائيّة، foodprocessingindia.gov.in)
--     بندها الأوّل: «Asafoetida (Hing) & Exudes (gum)/extracts of various trees» — فلا شهادة حجرٍ ولا إذن استيراد.
--
-- وسياسة الاستيراد (DGFT) «حرّة» على الأرجح، لكنّ سطرها الرسميّ لهذا الرمز لم يُقرأ، فلا تُكتب قاعدةً.
-- لا يُمسّ شيءٌ قائم: نوع مستندٍ جديد، والطريق، وشرطان، ومراجعة؛ والتكرار لا يضيف شيئاً.

insert into export_document_types (code, name_ar, note_ar) values
  ('food_import_licence', 'ترخيص استيراد أغذية لدى المستورد',
   'يستخرجه المستورد من سلطة الغذاء في بلده، وتُعرض الشحنة عليها عند الوصول')
on conflict (code) do nothing;

insert into export_corridors (commodity_id, destination_id)
select c.id, d.id
from export_commodities c, export_destinations d
where c.code = 'gum_arabic' and d.code = 'IN'
on conflict (commodity_id, destination_id) do nothing;

insert into export_corridor_requirements (corridor_id, document_type_id, mode, effective_from, effective_to)
select cr.id, dt.id, v.mode, '2020-02-13'::date, null
from (values
  ('food_import_licence',   'required'),
  ('certificate_of_origin', 'required')
) as v(doc, mode)
join export_commodities    c  on c.code = 'gum_arabic'
join export_destinations   d  on d.code = 'IN'
join export_corridors      cr on cr.commodity_id = c.id and cr.destination_id = d.id
join export_document_types dt on dt.code = v.doc
where not exists (
  select 1 from export_corridor_requirements x
   where x.corridor_id = cr.id and x.document_type_id = dt.id and x.effective_to is null
);

insert into export_corridor_reviews (corridor_id, reviewed_at, reviewed_by, source_note, outcome)
select cr.id, '2026-11-18 06:00+00', null, v.note, 'amended'
from (values (
  'بحث 18 نوفمبر 2026: هيئة سلامة الأغذية الهنديّة (FSSAI) تعدّ الصمغ العربيّ (13012000) غذاءً قليل الخطر (قائمة الرموز، الصفّ ١٣٦٤؛ والملحق الخامس، القائمة ب، الصفّ ٩٢٦) — المستورد يحمل ترخيص استيراد أغذية، والشحنة تُعرض على الهيئة في نظام FICS وتدخل من موانئ الأغذية المعتمدة، ومعها شهادة منشأ. ولا تُطلب شهادة حجرٍ نباتيّ ولا إذن استيراد: صمغ الأشجار في قائمة المنتجات المعالَجة المعفاة من الحجر (البند ١، foodprocessingindia.gov.in، بموجب البند 3(7)(ii) من لائحة 2003).'
)) as v(note)
join export_commodities  c  on c.code = 'gum_arabic'
join export_destinations d  on d.code = 'IN'
join export_corridors    cr on cr.commodity_id = c.id and cr.destination_id = d.id
where not exists (select 1 from export_corridor_reviews r where r.corridor_id = cr.id and r.source_note = v.note);
