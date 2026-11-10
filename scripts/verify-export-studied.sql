-- بوّابةُ الطرق المدروسة (البند ١١٨).
\set ON_ERROR_STOP on
\set QUIET on

create table if not exists _score (fails integer not null default 0);
delete from _score; insert into _score values (0);
create or replace function _fail(label text, why text) returns void language plpgsql as $$
begin raise notice '  FAIL  % — %', label, why; update _score set fails = fails + 1; end $$;
create or replace function _pass(label text) returns void language plpgsql as $$
begin raise notice '  PASS  %', label; end $$;
create or replace function _eq(got anyelement, want anyelement, label text) returns void language plpgsql as $$
begin
  if got is not distinct from want then perform _pass(label || ' — ' || coalesce(got::text, 'null'));
  else perform _fail(label, 'جاء ' || coalesce(got::text, 'null') || ' والمتوقَّع ' || coalesce(want::text, 'null')); end if;
end $$;
create or replace function _reqs(p_comm text, p_dest text) returns int language sql stable as $$
  select count(*)::int from export_corridor_requirements r
    join export_corridors cr on cr.id = r.corridor_id
    join export_commodities c on c.id = cr.commodity_id and c.code = p_comm
    join export_destinations d on d.id = cr.destination_id and d.code = p_dest
   where r.effective_to is null $$;
create or replace function _reviews(p_comm text, p_dest text) returns int language sql stable as $$
  select count(*)::int from export_corridor_reviews v
    join export_corridors cr on cr.id = v.corridor_id
    join export_commodities c on c.id = cr.commodity_id and c.code = p_comm
    join export_destinations d on d.id = cr.destination_id and d.code = p_dest $$;
create or replace function _has(p_comm text, p_dest text, p_doc text, p_mode text) returns boolean language sql stable as $$
  select exists (select 1 from export_corridor_requirements r
    join export_corridors cr on cr.id = r.corridor_id
    join export_commodities c on c.id = cr.commodity_id and c.code = p_comm
    join export_destinations d on d.id = cr.destination_id and d.code = p_dest
    join export_document_types t on t.id = r.document_type_id and t.code = p_doc
   where r.mode = p_mode and r.effective_to is null) $$;

\echo ''
\echo 'الطرق الاثنا عشر: شروطها ومراجعتها، مرّةً واحدة ولو طُبِّقت الهجرة مرّتين'
do $$
begin
  perform _eq((select count(*)::int from export_document_types where code in
    ('import_permit','certificate_of_origin','halal_slaughter','fumigation_cert','prior_notice','facility_registration')), 6, 'ستّة أنواع مستندات جديدة');
  perform _eq(_reqs('live_goats', 'SA'), 3, 'الماعز إلى السعوديّة: ٣ مستندات');
  perform _eq(_reqs('live_camels', 'EG'), 1, 'الإبل إلى مصر: الشهادة البيطريّة');
  perform _eq(_reqs('live_cattle', 'EG'), 1, 'الأبقار إلى مصر: الشهادة البيطريّة');
  perform _eq(_reqs('meat', 'SA'), 3, 'اللحوم إلى السعوديّة: ٣');
  perform _eq(_has('meat', 'SA', 'halal_slaughter', 'required'), true, 'وشهادة الذبح الحلال إلزاميّة');
  perform _eq(_reqs('gum_arabic', 'US'), 3, 'الصمغ إلى أمريكا: ٣');
  perform _eq(_has('gum_arabic', 'US', 'lab_report', 'recommended'), true, 'وتقرير المختبر يُنصح به لا يُلزَم');
  perform _eq(_reqs('sesame', 'JP'), 2, 'السمسم إلى اليابان: ٢');
  perform _eq(_has('sesame', 'JP', 'lab_report', 'conditional'), true, 'وتقرير المختبر مشروط (رصد المبيدات)');
  perform _eq(_reqs('sesame', 'EG') + _reqs('hibiscus', 'EG') + _reqs('melon_seeds', 'EG'), 12, 'السمسم والكركديه وحبّ البطّيخ إلى مصر: ٤ لكلٍّ');
  perform _eq(_reqs('cotton', 'EG'), 3, 'القطن إلى مصر: ٣');
  perform _eq(_has('groundnut', 'CN', 'fumigation_cert', 'required'), true, 'الفول إلى الصين: التبخير إلزاميّ');
  perform _eq(_reqs('groundnut', 'CN'), 3, 'والفول إلى الصين: ٣');
  perform _eq(_reqs('groundnut', 'ID'), 3, 'والفول إلى إندونيسيا: ٣');
  perform _eq((select count(*)::int from export_corridor_reviews where reviewed_at = '2026-11-05 21:00+00'), 12, 'اثنتا عشرة مراجعة، لكلّ طريقٍ واحدة');
  perform _eq(_reviews('groundnut', 'CN'), 1, 'ومراجعة الفول إلى الصين مرّةً واحدة رغم تطبيق الهجرة مرّتين');
  perform _eq((select bool_and(length(source_note) > 80) from export_corridor_reviews where reviewed_at = '2026-11-05 21:00+00'), true, 'وكلّ مراجعةٍ تذكر مصدرها وشروطها');
  perform _eq(_reqs('gum_arabic', 'IN'), 0, 'والصمغ إلى الهند بلا قواعد: لم يُوجد مصدرٌ رسميّ');
  perform _eq(_reqs('cotton', 'BD'), 3, 'القطن إلى بنغلاديش: ٣ (10 نوفمبر)');
  perform _eq(_has('cotton', 'BD', 'import_permit', 'required'), true, 'إذن الاستيراد مطلوب');
  perform _eq(_has('cotton', 'BD', 'phytosanitary', 'required'), true, 'وشهادة الحجر مطلوبة');
  perform _eq(_has('cotton', 'BD', 'certificate_of_origin', 'recommended'), true, 'وشهادة المنشأ يُنصح بها');
  perform _eq(_reviews('cotton', 'BD'), 1, 'ومراجعةٌ واحدة بمصدرها ولو طُبِّقت الهجرة مرّتين');
  perform _eq((select count(*)::int from export_corridor_requirements r join export_corridors cr on cr.id = r.corridor_id
                join export_commodities c on c.id = cr.commodity_id join export_destinations d on d.id = cr.destination_id
               where c.code = 'sesame' and d.code = 'EU' and r.effective_to is null), 6, 'وما كان (السمسم إلى أوروبا) لم يُمسّ');
end $$;

\echo ''
\echo 'الكركديه المجفّف إلى أوروبا: الشهادة النباتيّة يُنصح بها (قرار المالك 6 نوفمبر)'
do $$
declare v_old int; v_now int; v_rev int;
begin
  select count(*)::int into v_old from export_corridor_requirements r
    join export_corridors cr on cr.id = r.corridor_id
    join export_commodities c on c.id = cr.commodity_id and c.code = 'hibiscus'
    join export_destinations d on d.id = cr.destination_id and d.code = 'EU'
    join export_document_types t on t.id = r.document_type_id and t.code = 'phytosanitary'
   where r.mode = 'required' and r.effective_to = date '2026-11-06';
  perform _eq(v_old, 1, 'القاعدة القديمة (إلزاميّة) انتهت في 6 نوفمبر ولم تُحذف');
  perform _eq(_has('hibiscus', 'EU', 'phytosanitary', 'recommended'), true, 'والسارية الآن: يُنصح بها');
  perform _eq(_has('hibiscus', 'EU', 'phytosanitary', 'required'), false, 'ولا قاعدة إلزاميّة سارية معها');
  select count(*)::int into v_now from export_corridor_requirements r
    join export_corridors cr on cr.id = r.corridor_id
    join export_commodities c on c.id = cr.commodity_id and c.code = 'hibiscus'
    join export_destinations d on d.id = cr.destination_id and d.code = 'EU'
    join export_document_types t on t.id = r.document_type_id and t.code = 'phytosanitary'
   where r.effective_to is null;
  perform _eq(v_now, 1, 'وسطرٌ واحدٌ سارٍ ولو طُبِّقت الهجرة مرّتين');
  perform _eq(_has('hibiscus', 'EG', 'phytosanitary', 'required'), true, 'والكركديه إلى مصر ما زال يطلبها إلزاماً');
  select count(*)::int into v_rev from export_corridor_reviews where reviewed_at = '2026-11-06 00:00+00';
  perform _eq(v_rev, 1, 'ومراجعةٌ واحدة تذكر القرار ومصدره');
end $$;

do $$
declare f integer;
begin
  select fails into f from _score;
  if f = 0 then raise notice 'ALL CHECKS PASSED';
  else raise exception '% CHECK(S) FAILED', f;
  end if;
end $$;
