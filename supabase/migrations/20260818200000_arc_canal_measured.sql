-- ثلاثة بنود من القياس لا من الوثائق.
--
-- The original fifteen findings all read one document against another, or
-- against FAOSTAT. These three come from the ground: forty-one SRTM 30 m
-- samples along the alignment, which is the first independent measurement
-- anyone in this dossier has taken.
--
-- They belong in the same table as the rest because the page's whole structure
-- is claim → verdict → basis, and these are exactly that. The difference is the
-- source column, which names a measurement instead of a study.
--
-- One of them is favourable to the project, and by a wide margin. That is worth
-- stating plainly: a review that only ever finds against the thing it reviews is
-- not reviewing, and the length finding cuts the capital cost by roughly two
-- thirds using the studies' own cost per kilometre.

insert into public.arc_canal_findings
  (axis, claim, study_figure, verdict, platform_figure, basis, source_doc, sort_order)
values

('الهندسة',
 'طول القناة نصف محيط دائرة نصف قطرها ٧٥ كم',
 '٢٣٦ كم نظرياً · ٢٧٠–٢٩٥ فعلياً',
 'overstated',
 '~٩٤ كم',
 'الطرفان اللذان تسمّيهما الدراسة نفسها — خزان جبل أولياء والسروراب — يبعدان '
 '٦٠ كم. ونصف الدائرة المرسومة على هذا الوتر نصف قطرها ٣٠ كم لا ٧٥، وطولها '
 'π×٣٠ ≈ ٩٤ كم. والفاصل في الأمر أن أقصى غرب هذا القوس يقع عند ٣٢٫٢٣°ق، أي '
 '٢٨ كم غرب أم درمان — وهو وصف الدراسة نفسها لموقع المشروع. فالهندسة تتّفق مع '
 'كلامها وتخالف حسابها. وبسعرها هي (٤٫٤–٦٫٧ مليون $/كم) تصير التكلفة '
 '٤١٤–٦٣٠ مليون دولار بدل ١٬٢٠٠–١٬٨٠٠ — وهذا في صالح المشروع لا ضدّه.',
 'قياس SRTM ٣٠ م', 160),

('الهندسة',
 'أعلى نقطة على المسار هضبة المرخيات، والرفع منها ٤٠–٥٥ متراً',
 '٤١٠–٤٣٠ م · رفع ٤٠–٥٥ م',
 'overstated',
 'أعلى نقطة ٤٤١ م · رفع ٦٤ م · حاجزان',
 'أعلى نقطة مقيسة ٤٤١ م عند ١٥٫٤٢٧°ش، ٣٢٫٢٤٤°ق — على الساق الجنوبية لا عند '
 'أقصى الغرب. والرفع من منسوب الخزان (٣٧٧ م) ٦٤ متراً، أي أكبر من أعلى تقدير '
 'في الدراسات. وقدرة الضخّ تتناسب طردياً مع الارتفاع، فتقدير ٣٥٠–٥٠٠ ميغاواط '
 'ناقصٌ بالنسبة نفسها. والمسار يعبر حاجزين لا حاجزاً واحداً — بروز ٣٧ م و٢٩ م — '
 'بينهما سرج ٤١٧ م عند أقصى الغرب.',
 'قياس SRTM ٣٠ م', 170),

('الهندسة',
 'توزيع جزئي بالجاذبية من القناة إلى مناطق الري',
 'يرد في أكثر من وثيقة',
 'unsupported',
 'لا مقطع ينساب — النهاية فوق المصدر بـ٣٢ م',
 'السروراب على ٤٠٩ م والخزان الذي يغذّيه على ٣٧٧ م. ولا واحدة من العيّنات '
 'الإحدى والأربعين تنزل تحت منسوب المصدر. فالمسار صاعدٌ من أوّله إلى آخره، '
 'ولا موضع فيه لجريانٍ بالجاذبية بأي تصميم.',
 'قياس SRTM ٣٠ م', 180);
