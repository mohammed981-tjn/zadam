-- الاسمُ العربيّ للمنصّة «سوداقري» (المالك، 6 أكتوبر 2026: «سوداقري في الكلّ»
-- حتى في الشعارات)، بالقاف كما يُنطق. يحلّ محلّ «سودغري» الذي كتبته
-- 20261002205556_brand_name_sudghri في الموضعين نفسيهما؛ وأسئلةُ الزوّار
-- المسجّلة تبقى كما كُتبت.

update public.arc_canal_facts
   set source = replace(source, 'سودغري', 'سوداقري'),
       note   = replace(note, 'سودغري', 'سوداقري'),
       label  = replace(label, 'سودغري', 'سوداقري')
 where coalesce(source, '') || coalesce(note, '') || coalesce(label, '') like '%سودغري%';

update public.knowledge_entries
   set title   = replace(title, 'سودغري', 'سوداقري'),
       content = replace(content, 'سودغري', 'سوداقري')
 where title || content like '%سودغري%';
