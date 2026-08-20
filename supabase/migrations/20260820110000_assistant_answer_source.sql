-- كم سؤالاً يُجاب بلا نموذج — وأين الفجوة الباقية.
--
-- assistant_questions already records the question, how many entries matched,
-- and whether it was answered. What it never recorded is *what answered it*,
-- and that is now the number worth watching: the deterministic layer grew from
-- three resolvers to seven, each one built on the claim that the platform
-- answers some class of question better and cheaper than a model does. Nothing
-- in the table can confirm or refute that claim.
--
-- Without it the only honest statement about the layer is "we added resolvers".
-- With it the statement is a proportion, and the questions that still reach the
-- model are a list of what to build next — which is the same use the matched
-- count already serves for the knowledge base.
--
-- WHY A DEFAULT, AND WHY THE OLD SIGNATURE GOES
--
-- Adding a fourth parameter with `create or replace` would leave two functions
-- — (text,int,bool) and (text,int,bool,text) — and a three-argument call would
-- then be ambiguous and fail. Dropping the old one first and giving the new
-- parameter a default keeps every existing caller working: a three-argument
-- call resolves to this function with the source left null.
--
-- Null therefore means "logged before this column existed, or by a caller that
-- does not report it", which is a different thing from "answered by the model".
-- The analytics screen has to keep them apart or it will report the backlog as
-- a model cost.

set lock_timeout = '5s';

alter table public.assistant_questions
  add column if not exists answer_source text;

comment on column public.assistant_questions.answer_source is
  'أي طبقة أجابت: canal أو calculator أو climate أو market أو knowledge أو '
  'platform أو model أو cache. وnull يعني أن المستدعي لم يُبلّغ — لا أن '
  'النموذج أجاب.';

drop function if exists public.log_assistant_question(text, integer, boolean);

create function public.log_assistant_question(
  p_question text,
  p_matched  integer,
  p_answered boolean,
  p_source   text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Truncated so an oversized payload cannot bloat the table. The source is
  -- capped hard as well: it is a short enum in practice, and this function is
  -- reachable by anonymous callers.
  insert into assistant_questions (question, matched_entries, answered, answer_source)
  values (
    left(coalesce(p_question, ''), 500),
    greatest(0, coalesce(p_matched, 0)),
    coalesce(p_answered, true),
    nullif(left(coalesce(p_source, ''), 32), '')
  );
end $$;

-- ─────────────────────────── الصلاحيات ───────────────────────────
--
-- Dropping a function takes its grants with it, and CREATE FUNCTION does not
-- restore them — it applies the default, which in PostgreSQL is EXECUTE to
-- PUBLIC. So a migration that drops and recreates silently *widens* access
-- unless it says otherwise, and narrows it unless it names every grantee.
--
-- Both were wrong in the first draft of this file. The live ACL is
--
--   {postgres=X/postgres, anon=X/postgres, authenticated=X/postgres,
--    service_role=X/postgres}
--
-- with no PUBLIC entry — PUBLIC was deliberately revoked on this function and
-- on run_system_check, unlike is_admin and check_assistant_rate_limit which do
-- carry it. The draft granted only anon and authenticated, which would have
-- dropped service_role, and left the fresh PUBLIC grant in place, which would
-- have handed EXECUTE to every role on the instance.
--
-- Reproduced exactly, no wider and no narrower.

revoke all on function public.log_assistant_question(text, integer, boolean, text)
  from public;

grant execute on function public.log_assistant_question(text, integer, boolean, text)
  to anon, authenticated, service_role;

-- PostgREST caches the schema, and an RPC whose signature just changed is
-- resolved against that cache. Without this the first calls after deploy fail
-- to find the function — and this logger swallows its own errors, so the
-- failure would be invisible.
notify pgrst, 'reload schema';

create index if not exists assistant_questions_source
  on public.assistant_questions (answer_source, created_at desc);
