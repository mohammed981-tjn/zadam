-- الاسمُ العربيّ للمنصّة «سودغري»، كما في الشعار (المالك، 2 أكتوبر 2026:
-- «خلاص سودغري في الكل»). يحلّ محلّ «سوداغري» الذي كتبته
-- 20261002195605_brand_name_sudaghri في الموضعين نفسيهما؛ وأسئلةُ الزوّار
-- المسجّلة تبقى كما كُتبت، للسبب المذكور هناك.

update public.arc_canal_facts
   set source = replace(source, 'سوداغري', 'سودغري')
 where source like '%سوداغري%';

update public.knowledge_entries
   set content = replace(content, 'سوداغري', 'سودغري')
 where content like '%سوداغري%';
