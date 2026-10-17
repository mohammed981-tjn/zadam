-- خدمتان جديدتان في الكتالوج: الإشرافُ الكامل، والتعبئة.
--
-- البند ١١١ (docs/studies/services-company-ar.md، القسم ٣). سوداقري تكسب من
-- الخدمة والإشراف اللذين تقدّمهما، لا من حصّةٍ في الأرض — وهاتان هما الخدمتان
-- اللتان لم تكونا في الكتالوج:
--
--   full_supervision — مشرفٌ يتابع الأرض موسماً كاملاً: زياراتٌ منتظمة، واعتمادُ
--                      كلِّ مرحلةٍ بدليلها، وتقريرٌ شهريّ، وتنسيقُ الشركات المنفّذة.
--                      يُقاس بالفدان للموسم كلّه.
--   packing          — تعبئةُ المحصول في أكياسٍ أو عبواتٍ موسومة بعد الدراس
--                      والتنظيف والتجفيف، وقبل التخزين أو النقل.
--
-- In its own file because a value added to an enum cannot be used in the same
-- transaction that adds it; nothing here uses them, and the catalogue in
-- src/lib/services.ts is what offers them.

alter type public.service_key add value if not exists 'full_supervision';
alter type public.service_key add value if not exists 'packing';
