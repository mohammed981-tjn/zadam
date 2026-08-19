-- الملفّ بعد المسح: ستّة بنود خرجت من خانة «غير معروف».
--
-- WHAT THIS CHANGES AND WHY
--
-- The dossier had sixteen unknowns. Six of them were not unknowns — they were
-- unfetched or uncomputed. ISRIC SoilGrids publishes texture, pH and cation
-- exchange capacity at 250 m; NASA POWER publishes irradiance; and once those
-- two exist, the seepage follows from the texture, the discharge from the water
-- requirement, the section from Manning, the staging from the lift, and the
-- power from ρgQH. None of that needed anyone's permission.
--
-- What is left unknown after this is of a different kind, and the distinction
-- is the point: a soil survey is a measurement nobody had taken, while a water
-- allocation is a decision nobody has made. No satellite produces a permit. The
-- rows that remain blank are blank because they are somebody's signature, or
-- because they need a hand in the soil — and each one now says which.
--
-- TWO CORRECTIONS TO WHAT THIS PLATFORM PUBLISHED
--
-- The energy row said 399 GWh/yr from a static-lift calculation on the annual
-- volume, and noted that it "does not explain" an installed capacity of
-- 350–500 MW. That note was wrong, and wrong in the ordinary way: it compared
-- an average against a peak. Sizing the plant on peak-month demand — which is
-- what sizes a pump — gives 392 MW under flood irrigation. The capacity is
-- corroborated, not contradicted, and the row now says so.
--
-- And the capital rows quoted a total and a rescaled total. Both are replaced
-- by quantities times named unit rates, which is a number a reader can argue
-- with rather than accept.

-- ─────────────────── ما صار مقيساً أو محسوباً ───────────────────

update public.arc_canal_facts set
  status = 'measured',
  value  = 'طميية طينية · طين ٣٣٪',
  unit   = null,
  source = 'ISRIC SoilGrids v2.0 (٢٥٠ م)',
  note   = 'عشر نقاط على طول المسار، متوسّطات مرجّحة بسُمك الطبقات على المتر '
           'العلوي: طين ٢٨–٣٦٪، رمل ٤٣٪، طمي ٢٤٪، سعة تبادلية ٣٩ سنتيمول/كغ. '
           'والسطح أخفّ من العمق، فقناةٌ بعمق تسعة أمتار تُحفر في الطبقة '
           'الثقيلة. هذه ليست تربة الجزيرة الطينية الثقيلة.'
where key = 'soil_survey';

insert into public.arc_canal_facts
  (category, key, label, value, unit, status, source, note, sort_order)
values
('terrain', 'soil_ph', 'درجة حموضة التربة',
 '8.2–8.5', 'pH', 'measured', 'ISRIC SoilGrids v2.0 (٢٥٠ م)',
 'قيدٌ زراعي حقيقي: فوق ٨٫٣ يصير الفوسفور والحديد والزنك شحيحة الإتاحة مهما '
 'أُضيفت. ولا يقول المصدر شيئاً عن الصوديوم المتبادل، وهو الفحص الذي يقرّر '
 'الحاجة إلى الجبس والصرف.', 95)
on conflict (key) do nothing;

update public.arc_canal_facts set
  status = 'derived',
  value  = '237',
  unit   = 'مليون م³/سنة',
  source = 'جداول الفقد المعيارية على قوام SoilGrids',
  note   = '١٢٪ ممّا يدخل القناة، بالغمر ولنصف مليون فدان. معدّل التربة '
           'الطميية الطينية ٠٫١٣ م³ لكل متر مربّع من المحيط المبلول يومياً — '
           'أي نصف ما تفقده تربة طميية رملية، وهذا في صالح المسار.'
where key = 'seepage_losses';

update public.arc_canal_facts set
  status = 'derived',
  value  = '409',
  unit   = 'م³/ث',
  source = 'حساب سودجري',
  note   = 'ذروة الطلب الشهري لخطّة المحاصيل على نصف مليون فدان، مع التسرّب، '
           'موزّعةً على عشرين ساعة تشغيل يومياً لا أربعٍ وعشرين. وبالتنقيط '
           'ينزل إلى ٢٥٢.'
where key = 'design_discharge';

update public.arc_canal_facts set
  status = 'derived',
  value  = 'عمق ٩٫٥ م · عرض علوي ٤٧ م',
  unit   = null,
  source = 'معادلة مانينغ',
  note   = 'مجرى شبه منحرف، ميل جوانب ١٫٥:١ وميل قاع ١٠ سم/كم ومعامل مانينغ '
           '٠٫٠٢٥ لقناة ترابية. السرعة الناتجة ١٫٣١ م/ث — داخل نطاق ٠٫٦–١٫٥ '
           'الذي لا يُطمي القناة ولا يجرف قاعها. وحجم الحفر ٢٩٫٥ مليون م³ '
           'للمنشور وحده.'
where key = 'cross_section';

update public.arc_canal_facts set
  status = 'derived',
  value  = '4',
  unit   = 'محطة',
  source = 'حساب سودجري',
  note   = 'الرفع الكلّي ٧٣ متراً — ٦٤ ساكنة و٩٫٤ احتكاكاً على ميل القاع — '
           'موزّعةً على محطات يرفع كلٌّ منها عشرين متراً، وهو نطاق مضخّة '
           'محورية واحدة المرحلة. أي أربع محطات عادية بدل واحدة مستحيلة.'
where key = 'pump_stations';

update public.arc_canal_facts set
  label  = 'القدرة المركّبة للضخّ',
  status = 'derived',
  value  = '392',
  unit   = 'ميغاواط',
  source = 'حساب سودجري — ρgQH',
  note   = 'على تصرّف الذروة ٤٠٩ م³/ث ورفعٍ كلّي ٧٣ م وكفاءة ٧٥٪. وبالتنقيط '
           '٢٤٢ ميغاواط. وهذه قدرة محطة كهرباء متوسّطة، وهي ما يجعل مصدر '
           'الطاقة سؤالاً سيادياً لا هندسياً.'
where key = 'installed_power_claim';

update public.arc_canal_facts set
  value  = '521',
  note   = 'ρ·g·V·H ÷ كفاءة، بـ H = ٧٣ م (٦٤ ساكنة و٩٫٤ احتكاكاً) وV شاملاً '
           'التسرّب. والرقم المنشور سابقاً ٣٩٩ كان يهمل الاحتكاك والتسرّب معاً.'
where key = 'lift_energy_flood';

update public.arc_canal_facts set
  value  = '332',
  note   = 'بالمعادلة نفسها على الطلب بالتنقيط شاملاً تسرّبه.'
where key = 'lift_energy_drip';

update public.arc_canal_facts set
  status = 'derived',
  value  = 'شمسي — ٢٧٧ ميغاواط ذروة',
  unit   = null,
  source = 'NASA POWER + حساب سودجري',
  note   = 'الإشعاع الواصل ٦٫٦ ك.و.س/م²/يوم سنوياً، وبمعامل أداء ٠٫٧٨ تغطّي '
           'مصفوفة بهذا الحجم ضخّ السنة كلّها للحجم الكامل. وللنواة ٠٫٩ '
           'ميغاواط ذروة فقط — أي مصفوفة قرية، لا قرار في الشبكة القومية.'
where key = 'power_source';

-- ─────────────────── الكلفة من الكميّات لا من رقم منقول ───────────────────

delete from public.arc_canal_facts where key in ('capex_study', 'capex_rescaled');

insert into public.arc_canal_facts
  (category, key, label, value, unit, status, source, note, sort_order)
values
('cost', 'earthwork_volume', 'حجم الحفر',
 '29.5', 'مليون م³', 'derived', 'مقطع مانينغ × الطول',
 'المنشور وحده، بلا نقل مخلّفات ولا سدود جانبية ولا منشآت ولا معابر ولا '
 'بطانة. فهو حدٌّ أدنى لا تقدير.', 10),

('cost', 'capex_quantities', 'الكلفة الرأسمالية من الكميّات',
 '514–760', 'مليون دولار', 'derived', 'كميّات × أسعار وحدة مذكورة',
 'حفر ٢٩٫٥ مليون م³ عند ٢–٤ $/م³، وضخّ ٣٩٢ ميغاواط عند ٧٠٠–١٬٠٠٠ $/ك.و، '
 'وشمسي ٢٧٧ ميغاواط ذروة عند ٦٥٠–٩٠٠ $/ك.و.ذ. وبالتنقيط ٣٢٥–٤٨٣ مليوناً. '
 'الرقم أرضيةٌ لأن الكميّة أرضية.', 20),

('cost', 'fixed_cost_per_feddan', 'الكلفة الثابتة للماء',
 '96–142', '$/فدان/سنة', 'derived', 'استرداد رأس المال ٨٪ على ٢٥ سنة',
 'بالغمر وللحجم الكامل. وبالتنقيط ٦١–٩٠. وعند النواة ٩–١٣ دولاراً فقط، '
 'لأن الرفع ستة أمتار لا ثلاثة وسبعين والقناة اثنا عشر كيلومتراً لا '
 'أربعة وتسعون. وهذا هو الفرق بين أرضٍ تحتمل الذرة وأرضٍ لا تحتمل إلا '
 'أعلى المحاصيل قيمةً.', 30),

('area', 'pilot_design', 'تصميم النواة الجنوبية',
 'قناة ١٫٩ م × محطة واحدة × ٠٫٩ م.و.ذ', null, 'derived', 'حساب سودجري',
 'عشرون ألف فدان بالتنقيط على الاثني عشر كيلومتراً الجنوبية: تصرّف ١٠ م³/ث، '
 'وعمق ماء ١٫٩ م، ومحطة رفع واحدة قدرتها ١٫٣ ميغاواط، ومصفوفة شمسية ٠٫٩ '
 'ميغاواط ذروة. كلفة رأسمالية ٢–٣ مليون دولار.', 35)
on conflict (key) do nothing;

-- ─────────────────── ما بقي، وسببُ بقائه ───────────────────
--
-- Reworded rather than removed. Each one now says what would actually settle
-- it — a signature, or a spade — instead of only saying that it is missing.

update public.arc_canal_facts set
  note = 'يُحسم بحفرة اختبار كل بضعة كيلومترات: عمق الصخر، وقوّة القصّ، '
         'ومنسوب الماء الأرضي. لا يُقرأ من قمر صناعي، وهو ما يحوّل حدّ الحفر '
         'الأدنى أعلاه إلى تكلفة حقيقية.'
where key = 'geotechnical';

update public.arc_canal_facts set
  note = 'قرارٌ لا قياس. ولا تحتاجه النواة الجنوبية أصلاً: ٤٢ مليون م³ '
         'أي واحد من كل خمسة وعشرين ممّا يطلبه الحجم الكامل.'
where key = 'nile_allocation';

update public.arc_canal_facts set
  note = 'يحتاج مسحاً ميدانياً للحيازات العرفية على المسار، لا صورة قمر. '
         'وهو أوّل ما يجب أن تفعله النواة لأنها تحتاج أرضاً واحدة صغيرة.'
where key = 'land_tenure';

update public.arc_canal_facts set
  note = 'قناة بطول ٩٤ كم غرب أم درمان تعبر مسارات رعي ومجاري سيول، والتقييم '
         'إجراءٌ قانوني بجهة مختصّة لا حساب. والنواة على اثني عشر كيلومتراً '
         'داخل حزام زراعي قائم تسقط عنها معظم أسبابه.'
where key = 'environmental_assessment';

-- ─────────────────── «فرضية» حالةٌ رابعة ───────────────────
--
-- Three rows carried the status 'study_claim', which existed so the dossier
-- could record what other documents assert without endorsing it. That category
-- has no place in a study that stands on its own — but the rows underneath it
-- are not all the same thing.
--
-- One was purely a reference to somebody else's water budget, and it is gone.
-- The other two are this study's own scenario: the half-million feddan the
-- canal figures are computed against, and the crop mix the water demand is
-- computed against. Neither is measured and neither is derived — they are
-- inputs chosen so the reader can see what a given size implies. That is an
-- assumption, and calling it one is the honest label.
--
-- The constraint is dropped before the rows move and re-added after, because a
-- check constraint is validated against existing rows the moment it is created.

alter table public.arc_canal_facts drop constraint if exists arc_canal_facts_status_check;

delete from public.arc_canal_facts where key = 'demand_study';

update public.arc_canal_facts set
  label  = 'الحجم الكامل المفترض في هذه الدراسة',
  status = 'assumption',
  source = 'فرضية السيناريو',
  note   = 'ليست قياساً ولا توصية. هي الحجم الذي يُتداول للمشروع، وتُحسب عليه '
           'أرقام القناة والقدرة والكلفة أعلاه كي يُرى ما يعنيه. وخلاصة هذه '
           'الدراسة أن الحجم القابل للتنفيذ اليوم أصغر من ذلك بكثير.'
where key = 'target_area';

update public.arc_canal_facts set
  label  = 'خليط المحاصيل المفترض في الحساب',
  value  = 'ذرة ٣٣٪ · برسيم ٢٧٪ · قمح ٢٢٪ · طماطم ١٥٪ · بصل ٤٪',
  unit   = null,
  status = 'assumption',
  source = 'فرضية السيناريو',
  note   = 'خليط ريّ معقول لهذا المناخ، وهو ما يُحسب عليه الاحتياج المائي '
           'وتصرّف الذروة. تغييره يغيّر كل رقم مائي على الصفحة، ولهذا هو '
           'مكتوبٌ هنا لا مخبوء في الكود.'
where key = 'crop_plan_total';

update public.arc_canal_facts set source = 'فرضية السيناريو + حساب سودجري'
where key = 'pilot_area';

alter table public.arc_canal_facts add constraint arc_canal_facts_status_check
  check (status in ('measured', 'derived', 'assumption', 'unknown'));
