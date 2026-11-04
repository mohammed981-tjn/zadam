-- فحوص السلسلة الكاملة (scripts/verify-migration-chain.sh): ما يقرؤه الموقع وما يناديه، بحساب عضوٍ عاديّ، على قاعدةٍ
-- طُبّقت عليها الهجرات كلّها بالترتيب وبصلاحيّات Supabase الافتراضيّة وحدها.

\set ON_ERROR_STOP 1
set client_min_messages = notice;

create temp table chain_failures (what text);
grant all on chain_failures to authenticated;

-- ── أ) كلّ جدولٍ يقرؤه الموقع يقرؤه العضو ─────────────────────────────────────
--
-- Not read as a member, and why:
--   field_alerts_sent, push_keys  the server's alone (api/field-alerts and lib/push read them with the service key);
--   system_health                 a view made on the site outside the migrations (the drift guard's other side).
-- A name that is a storage bucket (`storage.from("evidence")`) is not a table.
do $$
declare
  t text; n int := 0;
  server_only text[] := array['field_alerts_sent', 'push_keys', 'system_health'];
begin
  foreach t in array string_to_array(current_setting('chain.tables'), ',') loop
    continue when t = any (server_only) or exists (select 1 from storage.buckets b where b.id = t);
    if to_regclass('public.' || t) is null then
      insert into chain_failures values (format('الموقع يقرأ جدولاً لا تنشئه أيّ هجرة: %s', t));
      continue;
    end if;
    n := n + 1;
    begin
      perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000aa","role":"authenticated"}', true);
      set local role authenticated;
      execute format('select count(*) from public.%I', t);
      reset role;
    exception when others then
      reset role;
      insert into chain_failures values (format('العضو لا يقرأ %s: %s', t, sqlerrm));
    end;
  end loop;
  raise notice 'أ) قُرئ % جدولاً بحساب عضو', n;
end $$;

-- ── ب) كلّ دالّةٍ يناديها قيدُ تحقّق ينفّذها العضو ───────────────────────────────
insert into chain_failures
select format('قيد %s على %s ينادي %s ولا ينفّذها العضو', c.conname, c.conrelid::regclass, p.oid::regprocedure)
  from pg_constraint c
  join pg_depend d on d.classid = 'pg_constraint'::regclass and d.objid = c.oid and d.refclassid = 'pg_proc'::regclass
  join pg_proc p on p.oid = d.refobjid
 where c.contype = 'c' and not has_function_privilege('authenticated', p.oid, 'execute');

-- ── ج) كلّ دالّةٍ يناديها الموقع موجودة، وما لا ينفّذه العضو هو قائمة الخادم وحدها ────────
--
-- These are called with the service key (lib/supabase/admin.ts and its counted callers) and must stay closed to
-- members. A function the site calls that a member cannot run, and is not here, is either a forgotten grant or a new
-- server-only caller — either way someone decides, here.
insert into chain_failures
select format('الموقع ينادي دالّةً لا تنشئها أيّ هجرة: %s', r)
  from unnest(string_to_array(current_setting('chain.rpcs'), ',')) r
 where not exists (select 1 from pg_proc p join pg_namespace s on s.oid = p.pronamespace
                    where s.nspname = 'public' and p.proname = r);

insert into chain_failures
select format('الموقع ينادي %s والعضو لا ينفّذها، وليست في قائمة الخادم', p.proname)
  from pg_proc p join pg_namespace s on s.oid = p.pronamespace
 where s.nspname = 'public'
   and p.proname = any (string_to_array(current_setting('chain.rpcs'), ','))
   and p.proname <> all (array[
         'auth_account_exists', 'check_assistant_rate_limit', 'check_model_budget', 'farm_book_sync',
         'farmer_season_records', 'feedback_awaiting_auto_reply', 'field_alert_send', 'land_set_soil_estimate',
         'log_assistant_question', 'market_quotes_publish_trusted', 'password_reset_request', 'price_alert_fire',
         'price_feeds_alert', 'prune_ephemeral_rows',
         'run_system_check'])
   -- An overload the site no longer calls (the 3-argument investor_express_interest) may stay closed.
   and not exists (select 1 from pg_proc q where q.proname = p.proname and q.pronamespace = p.pronamespace
                     and has_function_privilege('authenticated', q.oid, 'execute'))
   and not has_function_privilege('authenticated', p.oid, 'execute');

-- ── النتيجة ───────────────────────────────────────────────────────────────────
do $$
declare r record; bad int;
begin
  select count(*) into bad from chain_failures;
  for r in select what from chain_failures order by 1 loop
    raise notice 'FAIL  %', r.what;
  end loop;
  if bad > 0 then
    raise exception 'السلسلة الكاملة: % فحصاً فشل', bad;
  end if;
  raise notice 'OK — السلسلة كاملةً، وما يقرؤه الموقع وما يناديه مفتوحٌ لمن يحتاجه';
end $$;
