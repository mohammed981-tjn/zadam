-- مراجعة مشروع القناة القوسية الكبرى.
--
-- Eleven files arrived describing a scheme to irrigate half a million feddan
-- west of Omdurman from a 236–295 km canal. Six of them are distinct: two
-- feasibility documents, one hydrological review, and three dashboards.
--
-- WHY THIS IS A TABLE AND NOT A PAGE OF PROSE
--
-- The platform is about to show this project to investors. What makes that
-- defensible rather than promotional is that every claim carries a verdict and
-- the arithmetic behind it — and verdicts change. Field measurement is exactly
-- what the studies themselves ask for, and when it arrives an "overstated" row
-- becomes a "sound" one. In a page that means a deploy; in a table it means an
-- update, which is what a living assessment needs.
--
-- It also keeps the honest and the flattering in one place. A reader can see
-- that six of these rows say the study is right, and that is what makes the
-- rows saying it is wrong worth believing.
--
-- WHAT THE VERDICTS MEAN
--
--   sound          checked and it holds
--   self_corrected the studies caught their own error before we did, and said
--                  so in print — recorded because it is the strongest evidence
--                  of good faith in the whole dossier
--   overstated     the direction is right, the magnitude is not
--   unsupported    no basis given, and none found

create table if not exists public.arc_canal_findings (
  id            bigserial primary key,

  axis          text not null,
  claim         text not null,
  study_figure  text,

  verdict       text not null
    check (verdict in ('sound', 'self_corrected', 'overstated', 'unsupported')),

  -- What this platform's own data or engines say. Null where we have nothing
  -- to add and are simply reporting the study's own position.
  platform_figure text,

  -- How the platform figure was arrived at. Required: a counter-number without
  -- a method is exactly the failure being criticised.
  basis         text not null,

  source_doc    text not null,
  sort_order    integer not null default 0
);

alter table public.arc_canal_findings enable row level security;

create policy arc_canal_public_read on public.arc_canal_findings
  for select using (true);

create policy arc_canal_admin_write on public.arc_canal_findings
  for all using (is_admin()) with check (is_admin());

create index if not exists arc_canal_findings_order
  on public.arc_canal_findings (sort_order, id);

insert into public.arc_canal_findings
  (axis, claim, study_figure, verdict, platform_figure, basis, source_doc, sort_order)
values

-- ── الموقع والهندسة ────────────────────────────────────────────────────────
('الموقع',
 'الموقع المقترح غرب أم درمان صالح لخزان ومحور توزيع',
 '١٥٫٥°ش، ٣٢٫١°ق · ارتفاع ٣٩٥–٤٠٥ م · ٧٦/١٠٠',
 'sound',
 'أمطار الموقع ٩٩ ملم/سنة',
 'NASA POWER — مناخ MERRA-2 ‏٢٠٠١–٢٠٢٠ عند الإحداثيات نفسها. الموقع على مجرى '
 'الجريان الطبيعي لخيران المرخيات، وارتفاعه يسمح بتوزيع جزئي بالجاذبية. '
 'التقييم الذاتي ٧٦/١٠٠ متّسق مع ما نراه.',
 'ملف الموقع (KML)', 10),

('الهندسة',
 'العقبة الرئيسية هي رفع المياه من منسوب جبل أولياء إلى هضبة المرخيات',
 'رفع ٤٠–٥٥ م · ٣٥٠–٥٠٠ ميغاواط',
 'sound',
 null,
 'فرق المنسوب مذكور صراحةً (٣٧٥–٣٨٠ م عند الخزان مقابل ٤١٠–٤٣٠ م عند '
 'المرخيات) والحساب متّسق مع Q×H×ρ×g/الكفاءة. الدراسة تُقرّ بنفسها أن هذه '
 'القدرة تتجاوز ٣٠٪ من إنتاج السودان الكهربائي كلّه.',
 'دراسة الجدوى الشاملة', 20),

('الهندسة',
 'طول القناة يُحسب بنصف محيط دائرة نصف قطرها ٧٥ كم',
 '٢٣٦ كم نظرياً · ٢٧٠–٢٩٥ كم فعلياً',
 'sound',
 null,
 'π × ٧٥ = ٢٣٥٫٦ كم، والزيادة ١٥–٢٥٪ للالتفافات الطبوغرافية ممارسة معتادة. '
 'الدراسة صحّحت هنا معادلةً ناقصة في النسخة الأصلية.',
 'دراسة الجدوى الشاملة', 30),

('الهندسة',
 'التكلفة لكل كيلومتر متّسقة مع مشاريع مرجعية',
 '٤٫٤–٦٫٧ مليون $/كم',
 'sound',
 null,
 'قناة السلام (مصر) ٦٫٩ مليون $/كم، ومشروع تشاد ٥٫٠. التقدير المُعدَّل داخل '
 'النطاق؛ التقدير الأصلي (٤٣٨ مليون $ إجمالاً) كان خارجه بكثير.',
 'دراسة الجدوى الشاملة', 40),

-- ── التصحيحات الذاتية ──────────────────────────────────────────────────────
('المياه',
 'حصاد مياه الخيران مورد تكميلي معتبر',
 'صُحّح إلى ٠٫٥–٢٫٤٪ من الاحتياج',
 'self_corrected',
 null,
 'النسخة الأولى افترضت ٤٠٪. المراجعة الفنية أعادت الحساب بمعامل جريان '
 'C = 0.10–0.20 موثّق للتربة الرملية شبه الجافة، فخرجت بـ١٠–٤٨ مليون م³ مقابل '
 'احتياج ٢٬٠٠٠–٣٬٠٠٠ مليون. وقالت ذلك صراحةً.',
 'المراجعة الهيدرولوجية', 50),

('الطاقة',
 'الحصاد المائي يوفّر ١٥٠–٢٠٠ ميغاواط من طاقة الرفع',
 'صُحّح إلى ٣–٨ ميغاواط',
 'self_corrected',
 null,
 'توفير الطاقة يساوي نسبة المياه المُوفَّرة: ١٨ من ٢٬٥٠٠ مليون م³ × ٤٠٠ '
 'ميغاواط = ٢٫٩ ميغاواط. أي أقل من ٢٪. المراجعة حذفت هذا المبرر من الدراسة.',
 'المراجعة الهيدرولوجية', 60),

('المال',
 'التكلفة التأسيسية ٤٣٨ مليون دولار',
 'صُحّح إلى ١٬٢٠٠–١٬٨٠٠ مليون',
 'self_corrected',
 null,
 'الرقم الأصلي أغفل الطاقة والطرق والدراسات واحتياطي الطوارئ — وهي بنود '
 'إلزامية في أي تمويل دولي. التكلفة المُعدَّلة أعلى ٢٫٧–٤ أضعاف، والمراجعة '
 'كتبت أن الأصلية «لا يمكن الدفاع عنها أمام الممولين».',
 'دراسة الجدوى الشاملة', 70),

-- ── ما لم تُصحّحه الدراسات ────────────────────────────────────────────────
('المياه',
 'أمطار القطاع الشمالي (وادي سيدنا) ٢٢٠–٢٦٠ ملم/سنة',
 '٢٤٨ ملم/سنة',
 'overstated',
 '١٣٩ ملم/سنة',
 'NASA POWER عند وادي سيدنا نفسه (١٥٫٦٨°ش، ٣٢٫٥٢°ق)، والسروراب ٩٦ ملم. '
 'الرقم المستعمل أعلى بنحو ١٫٨ ضعفاً، ويدخل خطّياً في حجم الجريان — فتقديرات '
 'الحصاد الـ«واقعية» (٢٩–١١٦ مليون م³) تنزل هي نفسها إلى نحو ١٦–٦٥ مليون. '
 'وعندها تتقارب الوثيقتان المستقلّتان.',
 'دراسة حصاد المياه', 80),

('المال',
 'العائد يبرّر المشروع عند إنتاجية تتجاوز ٢٬٠٠٠ دولار للفدان',
 'يُفترض ٣٬٠٠٠–٥٬٠٠٠ $/فدان',
 'overstated',
 'لا محصول حقلي يبلغ العتبة',
 'حُسب من غلّة السودان المقيسة (FAOSTAT ٢٠٢٣) في قيمة الوحدة التصديرية '
 'للسودان نفسه: ذرة رفيعة ٧١ $/فدان · ذرة شامية ١٣٩ · سمسم ١٨٠ · دخن ٢٠١ · '
 'فول سوداني ٣٧١ · بطيخ ١٬٢٤٠ · بصل ١٬٨٢٧. أعلاها دون العتبة.',
 'لوحة الخزان', 90),

('المال',
 'خطة المحاصيل تعطي ٥٦٢ مليون دولار من ٥٥٠ ألف فدان',
 '١٬٠٢٢ $/فدان ضمناً',
 'overstated',
 'نصف عتبة الجدوى المعلنة',
 'الرقم من الدراسة نفسها: ٥٦٢ ÷ ٠٫٥٥ مليون فدان. وسيناريو «مثالي ٩٠٪» يعطي '
 '٨٤٤ $/فدان. أي أن الوثيقة لا تبلغ عتبتها هي، ولا تلاحظ ذلك.',
 'دراسة الجدوى الشاملة', 100),

('السوق',
 'يمكن زراعة المساحة بالمحاصيل عالية القيمة',
 '٥٠٠ ألف فدان',
 'unsupported',
 'مساحة البصل في السودان كلّه ٢١٣ ألف فدان',
 'FAOSTAT ٢٠٢٣: البصل ٨٩٬٧٥١ هكتاراً والطماطم ٤٧٬٣٥٧ — أي ٣٢٦ ألف فدان لكل '
 'السودان معاً. المحصولان الوحيدان اللذان يقتربان من العتبة. زراعة نصف مليون '
 'فدان بهما تعني أكثر من ضعف الإنتاج الوطني، وانهيار السعر قبل اكتمال '
 'المساحة.',
 'دراسة الجدوى الشاملة', 110),

('السياسة',
 'الحصة المائية متاحة ضمن اتفاقية ١٩٥٩',
 '٢٫٥–٣٫٥ مليار م³',
 'overstated',
 '٨٣–١٠٠٪ من كامل الاحتياطي الوطني',
 'الدراسة تذكر أن حصة السودان ١٨٫٥ مليار والاستهلاك ١٤٫٥–١٥٫٥، فالاحتياطي '
 '٣–٤ مليار. المشروع يطلبه كلّه تقريباً — لولاية واحدة، وقبل احتساب أثر سد '
 'النهضة الذي تقدّره بخفض ١٥–٢٥٪ في سنوات الجفاف.',
 'دراسة الجدوى الشاملة', 120),

('التشغيل',
 'الجدول الزمني المثالي أربع سنوات',
 '٤ سنوات · ٦–٨ واقعياً',
 'unsupported',
 null,
 'الدراسة نفسها تكتب لاحقاً «لا يوجد مشروع ري كبير يُنجَز في الوقت والميزانية '
 'الأصليين» وتضع ٧–١٠ سنوات في جدولها التفصيلي. الرقم الأول دعائي.',
 'دراسة الجدوى الشاملة', 130),

('التشغيل',
 'يولّد ١٥٠–٢٠٠ ألف وظيفة',
 '١٥٠٬٠٠٠–٢٠٠٬٠٠٠',
 'unsupported',
 null,
 'لا يرد في أي من الوثائق الست أساسٌ لهذا العدد: لا عمالة لكل فدان ولا مقارنة '
 'بمشروع قائم. الجزيرة يزرع ٢٫١ مليون فدان.',
 'دراسة الجدوى الشاملة', 140),

-- ── ما تضيفه المنصّة ولم يرد في أي وثيقة ──────────────────────────────────
('المياه',
 'الاحتياج المائي يُحسب بـ٥٬٠٠٠–٧٬٠٠٠ م³ للفدان',
 '٢٬٥٠٠–٣٬٥٠٠ مليون م³',
 'overstated',
 '١٬٠٥٠ مليون م³ بالتنقيط · ١٬٧٢٠ بالغمر',
 'حُسب بمحرّك FAO-56 في المنصّة على خطة محاصيل الدراسة نفسها عند مناخ '
 'الخرطوم: ٢٬١٠١ م³/فدان بالتنقيط و٣٬٤٣٨ بالغمر. والدراسة تشترط في مؤشراتها '
 'كفاءة ≥٧٥٪ (تنقيط ومحوري) ثم تحسب ميزانيتها المائية بأرقام الغمر. '
 'تصميمُها لِما تَعِد به يخفض الطلب إلى النصف تقريباً — وهذا أقوى ما في الملف.',
 'محرّك المنصّة (FAO-56)', 150);
