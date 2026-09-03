-- سحبُ الدوال الخمس الباقية من اللوحة إلى المستودع — إغلاقُ ع-4.
--
-- WHAT THIS IS
--
-- Five functions have lived only in the Supabase dashboard since before there
-- was a migrations directory. `20260817120000_document_existing_policies_and_
-- guards.sql` extracted the rest; these five it missed. And the revoke
-- migration two files ago said what was still owed, in those words:
--
--   «STILL OWED AFTER THIS: pulling the definition itself into the repo, so
--    that what it returns can be reviewed rather than inferred from its
--    callers.»
--
-- This is that. Every definition below is `pg_get_functiondef` output read out
-- of production on 2026-09-03, not written from the callers. Nothing here
-- changes behaviour in production: `create or replace` on a function that
-- already exists keeps its body identical and does not touch its ACL.
--
-- WHY IT MATTERS THAT THEY WERE INVISIBLE
--
-- All five are published by PostgREST as RPC endpoints. Four are SECURITY
-- DEFINER, which means they run as their owner and RLS does not apply inside
-- them — they are the one place in this database where a policy can be walked
-- around by design. A reviewer with the repository in front of them could see
-- that `farmer_season_records` was *called*, and had to guess what it returned.
-- The guessing is over.
--
-- The extraction also earned its keep the same way the first one did — it
-- surfaced something nobody had written down. See the ملاحظة at the end about
-- `run_system_check`. It is stated, not fixed, on purpose: closing a grant is a
-- behaviour change and belongs in its own migration with its own message.
--
-- APPLYING THIS TO A FRESH DATABASE
--
-- Like `20260817120000`, this file assumes the tables already exist. It reads
-- `seasons`, `season_stages`, `ledger_entries`, `stage_evidence`, `profiles`,
-- `lands`, `projects`, `knowledge_entries`, `system_checks` and
-- `assistant_questions`, and this repository creates none of them. The base
-- schema is still outside the migrations directory; that gap is bigger than
-- these five functions and is not closed here. Said out loud rather than left
-- for someone to hit mid-restore.
--
-- ONE DEVIATION FROM THE DUMP
--
-- `match_knowledge_entries` takes a `vector`, and production printed the type
-- unqualified because `extensions` sits in that session's search_path. Written
-- unqualified here it would fail on any connection whose search_path is plain
-- `public`. It is written `extensions.vector` below — the same type, named so
-- it resolves regardless of who applies the file.

-- ===========================================================================
-- ١) سجلّ مواسم المزارع — المال
-- ===========================================================================

-- SECURITY DEFINER, and it returns a farmer's per-season planned budget, actual
-- costs and revenue for any owner id passed to it. There is no consent check
-- inside it and no `auth.uid()` — the argument *is* the authorisation. That is
-- exactly why `20260903090000` revoked public execute, and why the grant block
-- at the end of this file re-asserts the revoke instead of letting a fresh
-- creation hand it back to `anon` by default.

create or replace function public.farmer_season_records(p_id uuid)
 returns table(season_id uuid, name text, crop_key text, planting_date date, status text, feddans numeric, planned_budget numeric, actual_costs numeric, revenue numeric, stages_total integer, stages_completed integer, stages_with_evidence integer, stages_on_time integer)
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select
    s.id,
    s.name,
    s.crop_key,
    s.planting_date,
    s.status,
    s.feddans,
    coalesce((select sum(st.budget) from season_stages st where st.season_id = s.id), 0),
    coalesce((select sum(l.amount) from ledger_entries l
              where l.season_id = s.id and l.category <> 'revenue'), 0),
    coalesce((select sum(l.amount) from ledger_entries l
              where l.season_id = s.id and l.category = 'revenue'), 0),
    (select count(*)::int from season_stages st where st.season_id = s.id),
    (select count(*)::int from season_stages st where st.season_id = s.id and st.completed),
    (select count(distinct st.id)::int from season_stages st
       join stage_evidence e on e.stage_id = st.id
      where st.season_id = s.id),
    (select count(*)::int from season_stages st
      where st.season_id = s.id and st.completed
        and (st.actual_end is null or st.actual_end <= st.planned_end))
  from seasons s
  where s.owner_id = p_id
  order by s.planting_date desc;
$function$;

-- ===========================================================================
-- ٢) الملفّ العام للمزارع — الاسم والبلد
-- ===========================================================================

-- The consent gate #43 added. SECURITY DEFINER so it can read `profiles` for a
-- visitor who has no access to that table, and it returns nothing unless the
-- farmer set `publish_record` *and* actually has a season. Note what it does
-- not return: no phone, no email, no role. This is the whole of what the
-- public farmer page is allowed to know.

create or replace function public.public_farmer_profile(p_id uuid)
 returns table(id uuid, full_name text, country text, created_at timestamp with time zone)
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select p.id, p.full_name, p.country, p.created_at
  from profiles p
  where p.id = p_id
    and p.publish_record
    and exists (select 1 from seasons s where s.owner_id = p.id);
$function$;

-- ===========================================================================
-- ٣) فحص حالة النظام
-- ===========================================================================

-- SECURITY DEFINER, reads five counts, writes a row to `system_checks`, and
-- prunes that table past sixty days. Both writes are the reason its grant is
-- worth a second look — see the ملاحظة at the end of this file.

create or replace function public.run_system_check()
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  admins integer;
  entries integer;
  pending_lands integer;
  pending_projects integer;
  published_unapproved integer;
  problems text[] := array[]::text[];
  result jsonb;
  healthy boolean;
begin
  select count(*) into admins from profiles where role = 'admin';
  select count(*) into entries from knowledge_entries;
  select count(*) into pending_lands from lands where verification = 'submitted';
  select count(*) into pending_projects
    from projects where review_status::text = 'submitted';

  select count(*) into published_unapproved
  from projects
  where status::text <> 'draft'
    and review_status::text is distinct from 'approved'
    and coalesce(is_demo, false) = false;

  if admins = 0 then
    problems := problems || 'لا يوجد حساب إدارة — طلبات المراجعة لا تصل لأحد'::text;
  end if;
  if entries = 0 then
    problems := problems || 'قاعدة المعرفة فارغة'::text;
  end if;
  if published_unapproved > 0 then
    problems := problems ||
      format('%s فرصة منشورة دون اعتماد', published_unapproved)::text;
  end if;
  if admins = 0 and (pending_lands + pending_projects) > 0 then
    problems := problems ||
      format('%s طلب ينتظر مراجعة ولا مراجِع',
             pending_lands + pending_projects)::text;
  end if;

  healthy := array_length(problems, 1) is null;

  result := jsonb_build_object(
    'admins', admins,
    'knowledge_entries', entries,
    'pending_lands', pending_lands,
    'pending_projects', pending_projects,
    'published_unapproved', published_unapproved,
    'problems', to_jsonb(problems)
  );

  insert into system_checks (ok, details) values (healthy, result);
  delete from system_checks where checked_at < now() - interval '60 days';

  return jsonb_build_object('ok', healthy, 'details', result);
end $function$;

-- ===========================================================================
-- ٤) تسجيل سؤال المساعد
-- ===========================================================================

-- SECURITY DEFINER and executable by `anon`, and that is deliberate rather than
-- an oversight: `src/app/api/assistant/route.ts` calls it with the session
-- client, so a visitor's unanswered question is what gets recorded — the input
-- the knowledge base is meant to grow from. Revoking `anon` would break that
-- feature as the route is written today; moving the route to the admin client
-- first is the order that keeps it.
--
-- What makes the open grant tolerable meanwhile is that it is append-only and
-- bounded by its own body: the question is truncated to 500 characters, the
-- match count is floored at zero, and the source to 32. It writes one row of
-- clamped text and returns nothing. `assistant_questions` itself is
-- RLS-protected and only an admin can read it back.

create or replace function public.log_assistant_question(p_question text, p_matched integer, p_answered boolean, p_source text default null::text)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  insert into assistant_questions (question, matched_entries, answered, answer_source)
  values (
    left(coalesce(p_question, ''), 500),
    greatest(0, coalesce(p_matched, 0)),
    coalesce(p_answered, true),
    nullif(left(coalesce(p_source, ''), 32), '')
  );
end $function$;

-- ===========================================================================
-- ٥) البحث الدلالي في قاعدة المعرفة
-- ===========================================================================

-- The one of the five that is **not** SECURITY DEFINER, and it does not need to
-- be. It runs as the caller, so RLS on `knowledge_entries` applies inside it —
-- and that table's select policy is `using (true)`, a knowledge base meant to
-- be read. So `PUBLIC` keeping execute here grants nothing a visitor could not
-- already select. The grant block below leaves it as production has it.
--
-- `limit least(greatest(p_match_count, 1), 50)` is the part worth noticing: the
-- caller cannot ask for the whole table by passing a large count, and cannot
-- ask for zero rows by passing a small one.

create or replace function public.match_knowledge_entries(p_query_embedding extensions.vector, p_match_count integer default 12, p_min_similarity double precision default 0.0, p_model text default null::text)
 returns table(crop text, topic text, title text, content text, source_country text, source_note text, similarity double precision)
 language sql
 stable
 set search_path to 'public', 'extensions'
as $function$
  select
    k.crop,
    k.topic,
    k.title,
    k.content,
    k.source_country,
    k.source_note,
    1 - (k.embedding <=> p_query_embedding) as similarity
  from public.knowledge_entries k
  where k.embedding is not null
    and (p_model is null or k.embedding_model = p_model)
    and 1 - (k.embedding <=> p_query_embedding) >= p_min_similarity
  order by k.embedding <=> p_query_embedding
  limit least(greatest(p_match_count, 1), 50);
$function$;

-- ===========================================================================
-- الصلاحيات — تُعاد كتابتها لأن الإنشاء وحده يمنح العموم
-- ===========================================================================

-- This block is not decoration and it is not a change. `create or replace` on
-- an existing function leaves its ACL untouched, so on production every line
-- below re-states what is already true. But on a database where the function is
-- created for the first time, Postgres grants EXECUTE to `PUBLIC` by default —
-- and without this block that would silently hand `anon` the money endpoint
-- that `20260903090000` was written to take away from it.
--
-- A migration that documents a function must therefore document its door too,
-- or it undoes the migration before it. Each line matches `proacl` as read from
-- production on 2026-09-03.

-- المال: لخادمٍ موثوق فقط (٢٠٢٦٠٩٠٣٠٩٠٠٠٠)
revoke all on function public.farmer_season_records(uuid) from public, anon, authenticated;
grant execute on function public.farmer_season_records(uuid) to service_role;

-- الملفّ العام: للزائر، والإذنُ محروسٌ داخل الدالّة
revoke all on function public.public_farmer_profile(uuid) from public;
grant execute on function public.public_farmer_profile(uuid) to anon, authenticated, service_role;

-- فحص النظام: كما هو في الإنتاج اليوم — وانظر الملاحظة أسفله
revoke all on function public.run_system_check() from public;
grant execute on function public.run_system_check() to anon, authenticated, service_role;

-- تسجيل السؤال: مفتوحٌ للزائر عن قصد، والدالّة تقصّ ما تكتب
revoke all on function public.log_assistant_question(text, integer, boolean, text) from public;
grant execute on function public.log_assistant_question(text, integer, boolean, text) to anon, authenticated, service_role;

-- البحث الدلالي: ليست SECURITY DEFINER، وسياسة القراءة عامة أصلاً
grant execute on function public.match_knowledge_entries(extensions.vector, integer, double precision, text) to public, anon, authenticated, service_role;

-- ===========================================================================
-- ملاحظةٌ خرجت من هذا الاستخراج — run_system_check
-- ===========================================================================

-- Recorded here because extraction is what made it visible, and left for its
-- own migration because closing it is a behaviour change.
--
-- `system_checks` has RLS on and exactly one policy: `system_checks_admin_read`.
-- Someone decided these counts are for administrators. But `run_system_check`
-- is SECURITY DEFINER and `anon` can execute it, so any visitor holding the
-- public key — which is every visitor — calls the RPC and is handed the same
-- figures the policy exists to withhold: how many administrators the platform
-- has (`admins: 0` is an answer worth having if you mean harm), how many
-- submissions are queued unreviewed, and how many opportunities are published
-- without approval.
--
-- And it is not only a read. Each call inserts a row and runs a delete across
-- the table. An unauthenticated caller can therefore write to `system_checks`
-- as fast as it can call, through a function whose declared purpose is to be
-- run by an administrator looking at a dashboard.
--
-- Unlike `log_assistant_question` above, nothing here is intended: no product
-- feature asks a visitor to run a system check. The likely fix is to restrict
-- it to `service_role` and have the admin page call it with the admin client —
-- the same shape #42 used for `farmer_season_records`. Checking the call sites
-- comes before the revoke, in that order, for the reason #42 gave: revoking
-- before the code moves breaks the page.
