-- الكركديه المجفّف إلى أوروبا: شهادة الصحّة النباتيّة «يُنصح بها» لا «إلزاميّة».
--
-- قرار المالك (6 نوفمبر 2026، سؤالٌ واختيار): «نجعلها يُنصح بها».
--
-- WHY
--
-- The seed of 20260903190000 required a phytosanitary certificate on every hibiscus corridor. The EU plant-health
-- regulation (2019/2072, Annex XI Part B) lists heading 1211 90 86 only when fresh or chilled, so dried calyces —
-- what Sudan exports — need none at the EU border. Some buyers still ask for one, so the owner chose to keep it on
-- the list as advice rather than drop it.
--
-- HOW
--
-- A rule is dated data: offers already submitted froze the rule as it was, so the old row is ended (effective_to)
-- rather than edited, and a new row starts the same day. Other destinations (Egypt requires it, decree 562/2019)
-- are untouched. Applying this twice changes nothing.

update export_corridor_requirements r
   set effective_to = date '2026-11-06'
  from export_corridors cr, export_commodities c, export_destinations d, export_document_types dt
 where r.corridor_id = cr.id and cr.commodity_id = c.id and cr.destination_id = d.id and r.document_type_id = dt.id
   and c.code = 'hibiscus' and d.code = 'EU' and dt.code = 'phytosanitary'
   and r.mode = 'required' and r.effective_to is null
   and r.effective_from < date '2026-11-06';

insert into export_corridor_requirements (corridor_id, document_type_id, mode, effective_from, effective_to)
select cr.id, dt.id, 'recommended', date '2026-11-06', null
  from export_corridors cr
  join export_commodities c on c.id = cr.commodity_id and c.code = 'hibiscus'
  join export_destinations d on d.id = cr.destination_id and d.code = 'EU'
  join export_document_types dt on dt.code = 'phytosanitary'
 where not exists (
   select 1 from export_corridor_requirements x
    where x.corridor_id = cr.id and x.document_type_id = dt.id and x.effective_to is null
 );

insert into export_corridor_reviews (corridor_id, reviewed_at, reviewed_by, source_note, outcome)
select cr.id, '2026-11-06 00:00+00', null, v.note, 'amended'
  from (values (
    'قرار المالك 6 نوفمبر 2026: شهادة الصحّة النباتيّة للكركديه المجفّف إلى أوروبا «يُنصح بها». لائحة الاتحاد الأوروبيّ '
    || '2019/2072 (الملحق الحادي عشر، الجزء ب) تذكر البند 1211 90 86 طازجاً أو مبرَّداً وحده، فالمجفّف لا يحتاجها عند الحدود؛ '
    || 'وبعض المشترين يطلبونها، فتبقى نصيحة. legislation.gov.uk/eur/2019/2072/annex/XI'
  )) as v(note)
  join export_commodities c on c.code = 'hibiscus'
  join export_destinations d on d.code = 'EU'
  join export_corridors cr on cr.commodity_id = c.id and cr.destination_id = d.id
 where not exists (
   select 1 from export_corridor_reviews x where x.corridor_id = cr.id and x.source_note = v.note
 );
