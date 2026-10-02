-- الاسمُ العربيّ للمنصّة «سوداغري» (المالك، 2 أكتوبر 2026: «اعتمد سوداغري»).
--
-- What a visitor reads from the database: the source line under the arc-canal
-- figures, and three knowledge entries that name the platform. The logged
-- assistant questions and answers are left as they were: they are a record of
-- what was asked and said at the time, not text the platform shows as its own.
-- The two embedded entries keep their vectors; one word's spelling does not
-- move their meaning.

update public.arc_canal_facts
   set source = replace(source, 'سودجري', 'سوداغري')
 where source like '%سودجري%';

update public.knowledge_entries
   set content = replace(content, 'سودجري', 'سوداغري')
 where content like '%سودجري%';
