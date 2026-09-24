-- عنوانٌ واحدٌ لمُدخلٍ واحد — حارسُ التكرار في القاعدة لا في نصّ المهمّة وحده.
--
-- WHY NOW
--
-- The knowledge base is fed daily by a scheduled job (the owner's standing
-- rule of 24 September 2026). Its instructions say "search before you add",
-- and that is the right first defence — but it is a sentence in a prompt, and
-- a sentence is followed most days, not every day. Two runs that pick the same
-- subject, or one run retried after a timeout, would put the same entry in
-- twice, and the assistant would then quote it twice.
--
-- So the database refuses an exact repeat. Checked before creating it: no two
-- existing titles collide under this normalisation, so the index builds clean.
--
-- WHY THE TITLE AND NOT THE CONTENT
--
-- Two entries on the same subject with different findings are both wanted —
-- Striga resistance and Striga intercropping are separate facts. What is never
-- wanted is the same headline twice, which is what a duplicated run produces.
-- The title is also what a person scanning /knowledge sees, so a repeat there
-- is the one that looks like a broken site.

create unique index if not exists knowledge_entries_title_once
  on public.knowledge_entries (lower(btrim(title)));
