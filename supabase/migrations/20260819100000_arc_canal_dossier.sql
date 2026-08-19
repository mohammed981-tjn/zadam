-- ملف القناة القوسية في قاعدة سودجري — القياس والتصاريح والتشغيل، وما لا نعرفه بعد.
--
-- WHAT WAS ALREADY HERE, AND WHAT WAS NOT
--
-- arc_canal_findings held eighteen claim/verdict rows. Everything else about
-- this project lived in src/lib/arcCanal.ts: the forty-one SRTM samples, the
-- river polylines, the corridor climate. That is a module the charts import,
-- not data — nothing can query it, the assistant cannot answer from it, and
-- correcting a measurement means a deploy.
--
-- This repository already settled that argument once, in the FAOSTAT reference
-- migration: "the engines stay in code... this is measurement, and measurement
-- belongs in a table." The elevations are measurement. So are the coordinates.
--
-- TWO TABLES, BECAUSE THEY ARE TWO DIFFERENT THINGS
--
--   arc_canal_geometry  one row per surveyed point. Long, numeric, machine-read.
--   arc_canal_facts     one row per attribute of the scheme. Short, labelled,
--                       read by people, and deliberately including the blanks.
--
-- WHY THE BLANKS ARE ROWS
--
-- A dossier that lists only what we know reads as complete. This one is not:
-- there is no soil survey, no land tenure position, no permit, no geotechnical
-- work, and no Nile allocation. Those are the items that decide whether any of
-- this is buildable, and a reader who cannot see them missing will assume they
-- exist. So 'unknown' is a status, the value column is null for it, and the
-- check constraint makes the two agree — an unknown can never quietly acquire a
-- number, and a number can never be filed as unknown.
--
-- STATUSES
--
--   measured     we read it off the ground or off an instrument
--   derived      computed here from measured values, by a method named in note
--   study_claim  the project's own documents say it; recorded, not endorsed
--   unknown      nobody has established it, and the platform will not invent it

create table if not exists public.arc_canal_geometry (
  id           bigserial primary key,

  -- 'route' is the alignment itself; the rest are context the map is drawn on.
  feature      text not null
    check (feature in ('route', 'white_nile', 'blue_nile', 'main_nile',
                       'sarurab_transect')),
  seq          integer not null,

  -- Null only for the Sarurab transect, whose samples were taken by distance
  -- west of the river and whose coordinates were not kept. Reconstructing them
  -- would dress arithmetic up as survey.
  lat          double precision,
  lon          double precision,

  elevation_m  integer,
  -- Chainage from Jebel Aulia for the route; distance west of the river for
  -- the transect; null for the rivers, which are not measured along.
  distance_km  double precision,

  source       text not null,

  unique (feature, seq),

  constraint arc_canal_geometry_coords_present check (
    feature = 'sarurab_transect' or (lat is not null and lon is not null)
  )
);

create table if not exists public.arc_canal_facts (
  id           bigserial primary key,

  category     text not null
    check (category in ('terrain', 'engineering', 'area', 'climate', 'water',
                        'energy', 'operations', 'permits', 'cost')),

  -- Stable machine name, so an answer can cite a fact rather than a row number.
  key          text not null unique,
  label        text not null,

  value        text,
  unit         text,

  status       text not null
    check (status in ('measured', 'derived', 'study_claim', 'unknown')),

  source       text not null,
  note         text,
  sort_order   integer not null default 0,

  -- The invariant this table exists for.
  constraint arc_canal_facts_unknown_has_no_value check (
    (status = 'unknown') = (value is null)
  )
);

alter table public.arc_canal_geometry enable row level security;
alter table public.arc_canal_facts    enable row level security;

-- Same posture as arc_canal_findings: the study is published, so the data
-- behind it is readable by anyone. Only an admin writes.
create policy arc_canal_geometry_public_read on public.arc_canal_geometry
  for select using (true);
create policy arc_canal_geometry_admin_write on public.arc_canal_geometry
  for all using (is_admin()) with check (is_admin());

create policy arc_canal_facts_public_read on public.arc_canal_facts
  for select using (true);
create policy arc_canal_facts_admin_write on public.arc_canal_facts
  for all using (is_admin()) with check (is_admin());

create index if not exists arc_canal_geometry_feature_seq
  on public.arc_canal_geometry (feature, seq);
create index if not exists arc_canal_facts_order
  on public.arc_canal_facts (category, sort_order, id);


-- ───────────────────────────── التضاريس ─────────────────────────────

insert into public.arc_canal_facts
  (category, key, label, value, unit, status, source, note, sort_order)
values

('terrain', 'source_elevation', 'منسوب خزان جبل أولياء',
 '377', 'م', 'measured', 'SRTM ٣٠ م',
 'نقطة البداية التي تُقاس منها كل الفروق على هذه الصفحة.', 10),

('terrain', 'peak_elevation', 'أعلى نقطة على المسار',
 '441', 'م', 'measured', 'SRTM ٣٠ م',
 'عند ١٥٫٤٢٧°ش، ٣٢٫٢٤٤°ق — على الساق الجنوبية لا عند أقصى الغرب. '
 'والدراسات تضع أعلى نقطة عند ٤١٠–٤٣٠ م.', 20),

('terrain', 'terminus_elevation', 'منسوب السروراب — نهاية المسار',
 '409', 'م', 'measured', 'SRTM ٣٠ م', null, 30),

('terrain', 'static_lift', 'الرفع الساكن من الخزان إلى القمّة',
 '64', 'م', 'derived', 'قياس SRTM ٣٠ م',
 '٤٤١ − ٣٧٧. أكبر من أعلى تقدير في الدراسات (٤٠–٥٥ م)، وقدرة الضخّ تتناسب '
 'طردياً معه.', 40),

('terrain', 'terminus_above_source', 'ارتفاع النهاية فوق المصدر',
 '32', 'م', 'derived', 'قياس SRTM ٣٠ م',
 'السروراب فوق الخزان الذي يفترض أن يغذّيه. ولا واحدة من العيّنات الإحدى '
 'والأربعين تنزل تحت منسوب المصدر — فلا موضع لجريان بالجاذبية بأي تصميم.', 50),

('terrain', 'ridge_count', 'عدد الحواجز التي يعبرها المسار',
 '2', 'حاجز', 'derived', 'قياس SRTM ٣٠ م',
 'بالبروز الطوبوغرافي عند حدّ ٢٠ م: ٤٤١ م جنوباً و٤٣٧ م شمالاً، وبينهما '
 'سرج ٤١٧ م عند أقصى الغرب. والدراسات تذكر حاجزاً واحداً.', 60),

('terrain', 'low_lift_segment', 'الأرض على منسوب الخزان غرب جبل أولياء',
 '12', 'كم', 'measured', 'SRTM ٣٠ م',
 'العيّنات ٠–٤ بين ٣٧٧ و٣٩٤ م، أي مستوى الماء تقريباً. هذه هي الأرض المرشّحة '
 'لنواة تجريبية، لا الطرف الشمالي.', 70),

('terrain', 'sarurab_lift_5km', 'الارتفاع خمسة كيلومترات غرب النيل عند السروراب',
 '28', 'م', 'measured', 'SRTM ٣٠ م',
 'النهر عند ٣٨١ م والأرض عند ٤٠٩ م. سجّل هنا لأنه يكذّب ما نشرته هذه المنصّة '
 'نفسها حين وصفت الرفع هناك بـ«بضعة أمتار».', 80),

('terrain', 'soil_survey', 'مسح التربة وتصنيفها الزراعي',
 null, null, 'unknown', '—',
 'لا يوجد في أي من الوثائق. وصلاحية نصف مليون فدان للريّ لا تُفترض من صورة '
 'قمر صناعي.', 90),

('terrain', 'geotechnical', 'الدراسات الجيوتقنية على المسار',
 null, null, 'unknown', '—',
 'الحفر في صخر أو في رمل ليسا التكلفة نفسها، ولا الميل نفسه، ولا البطانة '
 'نفسها.', 100),


-- ───────────────────────────── الهندسة ─────────────────────────────

('engineering', 'route_length', 'طول المسار',
 '94', 'كم', 'derived', 'هندسة الطرفين المسمّيين في الدراسة',
 'الطرفان اللذان تسمّيهما الدراسة — خزان جبل أولياء والسروراب — يبعدان ٦٠ كم، '
 'ونصف الدائرة على هذا الوتر نصف قطرها ٣٠ كم وطولها π×٣٠ ≈ ٩٤. والدراسات '
 'تقول ٢٣٦–٢٩٥ كم.', 10),

('engineering', 'arc_radius', 'نصف قطر القوس',
 '30', 'كم', 'derived', 'هندسة الطرفين المسمّيين في الدراسة', null, 20),

('engineering', 'western_extreme', 'أقصى غرب المسار',
 '32.230', '°ق', 'measured', 'SRTM ٣٠ م',
 '٢٨ كم غرب أم درمان — وهو وصف الدراسة نفسها لموقع المشروع. فالهندسة تتّفق مع '
 'كلامها وتخالف حسابها.', 30),

('engineering', 'endpoint_separation', 'المسافة بين الطرفين',
 '60', 'كم', 'measured', 'إحداثيات الطرفين', null, 40),

('engineering', 'design_discharge', 'التصرّف التصميمي للقناة',
 null, 'م³/ث', 'unknown', '—',
 'لا يرد في أي وثيقة. وبدونه لا مقطع عرضي، ولا سرعة، ولا محطات ضخّ.', 50),

('engineering', 'cross_section', 'المقطع العرضي والبطانة',
 null, null, 'unknown', '—',
 'العرض والعمق والميل ونوع البطانة — لا شيء منها منشور. والفاقد بالتسرّب في '
 'قناة غير مبطّنة بهذا الطول ليس تفصيلاً.', 60),

('engineering', 'pump_stations', 'عدد محطات الضخّ ومناسيبها',
 null, null, 'unknown', '—',
 'الرفع ٦٤ متراً موزّعة على ٩٤ كم، وتوزيعها على المحطات هو ما يحدّد الكلفة '
 'الرأسمالية والتشغيلية معاً.', 70),

('engineering', 'installed_power_claim', 'قدرة الضخّ المركّبة كما تقدّرها الدراسة',
 '350–500', 'ميغاواط', 'study_claim', 'وثائق الجدوى',
 'مسجّلة لا معتمدة. تقديرنا للطاقة السنوية أدناه لا يفسّر رقماً بهذا الحجم '
 'إلا بذروة تشغيل حادّة أو بضخّ ضغطٍ داخل الحقول — ولا واحد منهما موصوف.', 80),


-- ───────────────────────────── المساحة ─────────────────────────────

('area', 'target_area', 'المساحة المستهدفة',
 '500,000', 'فدان', 'study_claim', 'وثائق الجدوى', null, 10),

('area', 'crop_plan_total', 'مجموع مساحات خطّة المحاصيل في الدراسة',
 '550,000', 'فدان', 'study_claim', 'وثائق الجدوى',
 'ذرة ١٨٠ + قمح ١٢٠ + برسيم ١٥٠ + طماطم ٨٠ + بصل ٢٠ ألف فدان. وهو يزيد '
 'خمسين ألف فدان على المساحة المعلنة في الوثيقة نفسها. حسابات المياه هنا '
 'تستخدم نسب هذه الخطة على ٥٠٠ ألف فدان.', 20),

('area', 'pilot_area', 'النواة التجريبية المقترحة',
 '20,000', 'فدان', 'derived', 'تحليل سودجري',
 'غرب خزان جبل أولياء مباشرةً، حيث الأرض على منسوب الماء. تحتاج ٤٢ مليون م³ '
 'بالتنقيط — أي جزءٌ من خمسة وعشرين ممّا يطلبه المشروع بحجمه المعلن، وبلا '
 'حاجة إلى قرار سيادي بحصة.', 30),

('area', 'land_tenure', 'وضع حيازة الأرض',
 null, null, 'unknown', '—',
 'من يملك هذه المساحة الآن، وما وضع الحيازات العرفية عليها. لا يرد ذكره.', 40),


-- ───────────────────────────── المناخ ─────────────────────────────

('climate', 'corridor_rainfall', 'المطر السنوي على الممرّ',
 '140', 'ملم', 'measured', 'NASA POWER (MERRA-2)',
 'مجموع السلسلة الشهرية التي يعمل عليها حساب المياه.', 10),

('climate', 'end_rainfall_south', 'المطر عند الطرف الجنوبي',
 '204', 'ملم', 'measured', 'NASA POWER (MERRA-2)', 'خليّة مجاورة.', 20),

('climate', 'end_rainfall_north', 'المطر عند الطرف الشمالي',
 '96', 'ملم', 'measured', 'NASA POWER (MERRA-2)', 'خليّة مجاورة.', 30),

('climate', 'grid_resolution', 'دقّة شبكة المناخ',
 '55×67', 'كم', 'measured', 'MERRA-2',
 'نصف درجة عرض في ٠٫٦٢٥ درجة طول. والقناة كلّها تقع داخل البكسل الواحد، '
 'فلا يمكن نشر مناخ لكل قطاع دون اختراع دقّة لا يملكها المصدر.', 40),


-- ───────────────────────────── المياه ─────────────────────────────

('water', 'demand_flood', 'الطلب السنوي على المياه بالغمر',
 '1.72', 'مليار م³', 'derived', 'FAO-56 على مناخ الممرّ',
 'لـ٥٠٠ ألف فدان بنسب خطّة محاصيل الدراسة — ٣٬٤٣٠ م³ للفدان.', 10),

('water', 'demand_drip', 'الطلب السنوي على المياه بالتنقيط',
 '1.05', 'مليار م³', 'derived', 'FAO-56 على مناخ الممرّ',
 '٢٬٠٩٦ م³ للفدان. الدراسة تشترط كفاءة ريّ ≥٧٥٪ — وهي كفاءة التنقيط — ثم '
 'تحسب ميزانيتها المائية بأرقام الغمر.', 20),

('water', 'demand_study', 'الميزانية المائية كما تطلبها الدراسة',
 '2.5–3.5', 'مليار م³', 'study_claim', 'وثائق الجدوى',
 '٥٬٠٠٠–٧٬٠٠٠ م³ للفدان.', 30),

('water', 'nile_allocation', 'الحصّة المائية المخصّصة للمشروع',
 null, null, 'unknown', '—',
 'لا قرار ولا تخصيص. وهذا هو البند الذي يقرّر إن كان المشروع بحجمه المعلن '
 'قائماً أصلاً، وتصفه الدراسة نفسها بأن هامشه صفر.', 40),

('water', 'seepage_losses', 'الفاقد بالتسرّب والبخر على طول القناة',
 null, null, 'unknown', '—',
 'يعتمد على البطانة والمقطع، وكلاهما غير منشور. وأرقام الطلب أعلاه عند '
 'الحقل لا عند المأخذ.', 50),


-- ───────────────────────────── الطاقة ─────────────────────────────

('energy', 'lift_energy_flood', 'طاقة الرفع السنوية بالغمر',
 '399', 'جيغاواط·ساعة/سنة', 'derived', 'حساب سودجري',
 'ρ·g·V·H ÷ كفاءة، بـ H = ٦٤ م رفعاً ساكناً و V = ١٫٧٢ مليار م³ وكفاءة '
 'مضخّة ومحرّك ٧٥٪. لا تشمل فاقد الاحتكاك في القناة ولا ضخّ الضغط داخل '
 'الحقول.', 10),

('energy', 'lift_energy_drip', 'طاقة الرفع السنوية بالتنقيط',
 '244', 'جيغاواط·ساعة/سنة', 'derived', 'حساب سودجري',
 'بالمعادلة نفسها على ١٫٠٥ مليار م³.', 20),

('energy', 'power_source', 'مصدر الطاقة للضخّ',
 null, null, 'unknown', '—',
 'شبكة أم توليد مستقلّ أم شمسي. وأربعمئة جيغاواط·ساعة سنوياً ليست حملاً '
 'تستوعبه الشبكة القومية بحالها الراهنة دون قرار.', 30),


-- ───────────────────────────── التشغيل ─────────────────────────────

('operations', 'operator', 'الجهة المشغّلة',
 null, null, 'unknown', '—',
 'من يشغّل القناة ومحطات الضخّ، وبأي صيغة تعاقدية.', 10),

('operations', 'om_cost', 'كلفة التشغيل والصيانة السنوية',
 null, null, 'unknown', '—',
 'لا ترد في أي وثيقة. وهي التي تحدّد سعر المتر المكعّب عند المزارع، وبه وحده '
 'تُعرف جدوى أي محصول على هذه الأرض.', 20),

('operations', 'water_tariff', 'تعرفة المياه على المزارع',
 null, null, 'unknown', '—',
 'بدونها لا يمكن حساب صافي العائد للفدان، وحاسبة الجدوى في المنصّة تحتاجها '
 'مدخلاً لا مخرجاً.', 30),

('operations', 'phasing', 'مراحل التنفيذ والتعاقد',
 null, null, 'unknown', '—',
 'الدراسة تعرض المشروع كتلةً واحدة. ومنهج المنصّة المرحلي يحتاج تقسيماً '
 'يسمح بمخرج آمن عند كل مرحلة.', 40),


-- ───────────────────────────── التصاريح ─────────────────────────────

('permits', 'environmental_assessment', 'تقييم الأثر البيئي والاجتماعي',
 null, null, 'unknown', '—',
 'لا يوجد. وقناة بطول ٩٤ كم غرب أم درمان تعبر مسارات رعي ومجاري سيول.', 10),

('permits', 'water_permit', 'إذن المياه من وزارة الري',
 null, null, 'unknown', '—', null, 20),

('permits', 'land_allocation', 'قرار تخصيص الأرض',
 null, null, 'unknown', '—', null, 30),


-- ───────────────────────────── التكلفة ─────────────────────────────

('cost', 'capex_study', 'الكلفة الرأسمالية كما تقدّرها الدراسة',
 '1,200–1,800', 'مليون دولار', 'study_claim', 'وثائق الجدوى',
 'مبنيّة على طول ٢٣٦–٢٩٥ كم.', 10),

('cost', 'capex_rescaled', 'الكلفة نفسها على الطول المقيس',
 '414–630', 'مليون دولار', 'derived', 'سعر الدراسة نفسها لكل كيلومتر',
 '٤٫٤–٦٫٧ مليون دولار/كم × ٩٤ كم. وهذا في صالح المشروع لا ضدّه: الهندسة '
 'تخفض الكلفة إلى الثلث تقريباً.', 20);
