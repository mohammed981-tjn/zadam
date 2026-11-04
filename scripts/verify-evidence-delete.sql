-- الحذفُ من التخزين (20261104010000). قبلها كان كلُّ حذفٍ يُردّ لأنّ السياسة تقرأ عموداً سُحب من العضو.

\set ON_ERROR_STOP on
\set QUIET on
set client_min_messages = notice;
\o /dev/null

create table _score (fails integer not null default 0);
insert into _score values (0);
grant all on _score to authenticated;

create function _fail(label text, why text) returns void language plpgsql as $$
begin raise notice '  FAIL  % — %', label, why; update _score set fails = fails + 1; end $$;
create function _pass(label text) returns void language plpgsql as $$ begin raise notice '  PASS  %', label; end $$;
/* ينجح ويحذف صفّاً واحداً بالضبط. */
create function _deletes(stmt text, label text) returns void language plpgsql as $$
declare n integer;
begin
  begin execute stmt; get diagnostics n = row_count;
  exception when others then perform _fail(label, 'رُفض: ' || sqlerrm); return; end;
  if n = 1 then perform _pass(label); else perform _fail(label, 'حذف ' || n || ' صفّاً'); end if;
end $$;
/* لا يحذف شيئاً (السياسة ترشّح) ولا يُردّ بخطأ: الخطأُ هنا هو العطلُ نفسُه. */
create function _keeps(stmt text, label text) returns void language plpgsql as $$
declare n integer;
begin
  begin execute stmt; get diagnostics n = row_count;
  exception when others then perform _fail(label, 'رُفض بخطأ: ' || sqlerrm); return; end;
  if n = 0 then perform _pass(label); else perform _fail(label, 'حذف ' || n || ' صفّاً'); end if;
end $$;
grant execute on function _fail(text, text), _pass(text), _deletes(text, text), _keeps(text, text) to authenticated;

create function _as(p uuid, admin boolean default false) returns void language sql as $$
  select set_config('request.jwt.claims',
    case when p is null then '' else json_build_object('sub', p, 'role', 'authenticated', 'aal', case when admin then 'aal2' else 'aal1' end)::text end,
    false) $$;
grant execute on function _as(uuid, boolean) to authenticated;

-- What Supabase itself grants on its storage schema (not a migration's to give).
grant usage on schema storage to authenticated;
grant select, insert, delete on storage.objects to authenticated;

-- ── الناس والملفّات (بصلاحيّة العنقود) ────────────────────────────────────────
insert into auth.users (id) values
  ('ad000000-0000-0000-0000-0000000000ad'), ('a1000000-0000-0000-0000-0000000000a1'), ('b2000000-0000-0000-0000-0000000000b2');
insert into profiles (id, full_name, role) values
  ('ad000000-0000-0000-0000-0000000000ad', 'المدير', 'admin'),
  ('a1000000-0000-0000-0000-0000000000a1', 'المزارع', 'investor'),
  ('b2000000-0000-0000-0000-0000000000b2', 'غيره', 'investor')
on conflict (id) do update set role = excluded.role;

insert into storage.objects (bucket_id, name, owner) values
  ('evidence', 'a1000000-0000-0000-0000-0000000000a1/free.jpg',    'a1000000-0000-0000-0000-0000000000a1'),
  ('evidence', 'a1000000-0000-0000-0000-0000000000a1/custody.jpg', 'a1000000-0000-0000-0000-0000000000a1'),
  ('evidence', 'b2000000-0000-0000-0000-0000000000b2/theirs.jpg',  'b2000000-0000-0000-0000-0000000000b2'),
  ('media',    'banners/old.jpg',                                   'ad000000-0000-0000-0000-0000000000ad');

-- A photo in a custody chain: the one reference with no condition. Seeded with the keys off, its lot and event beside the point.
set session_replication_role = replica;
insert into custody_evidence (event_id, kind, caption, storage_path)
values (gen_random_uuid(), 'photo', 'تسليم', 'a1000000-0000-0000-0000-0000000000a1/custody.jpg');
set session_replication_role = origin;

set role authenticated;

\echo 'أ) صاحبُ الملفّ يحذف ما لم يُعتمد عليه'
select _as('a1000000-0000-0000-0000-0000000000a1');
select _deletes($$delete from storage.objects where bucket_id = 'evidence' and name = 'a1000000-0000-0000-0000-0000000000a1/free.jpg'$$,
                'صورةٌ رُفعت خطأً تُحذف (كانت تُردّ بـ permission denied)');

\echo 'ب) وما اعتُمد عليه، أو ليس له، يبقى — بلا خطأ'
select _keeps($$delete from storage.objects where bucket_id = 'evidence' and name = 'a1000000-0000-0000-0000-0000000000a1/custody.jpg'$$,
              'صورةٌ في سلسلة العهدة تبقى');
select _keeps($$delete from storage.objects where bucket_id = 'evidence' and name = 'b2000000-0000-0000-0000-0000000000b2/theirs.jpg'$$,
              'وملفُّ غيره يبقى');

\echo 'ج) والدالّة لا تكشف عن ملفّ غيره'
do $$ begin
  if public.evidence_object_withdrawable('b2000000-0000-0000-0000-0000000000b2/theirs.jpg') then
    perform _fail('ملفُّ غيره', 'قالت الدالّة إنّه يُحذف');
  else perform _pass('الدالّة تجيب «لا» عن ملفّ غيره'); end if;
end $$;

\echo 'د) والمدير يحذف من دلو الوسائط'
select _as('ad000000-0000-0000-0000-0000000000ad', true);
select _deletes($$delete from storage.objects where bucket_id = 'media' and name = 'banners/old.jpg'$$,
                'صورةُ وسائط قديمة تُحذف (كانت تُردّ هي أيضاً)');

reset role;
\echo 'هـ) والزائر لا يستدعي الدالّة'
do $$ begin
  if has_function_privilege('anon', 'public.evidence_object_withdrawable(text)', 'execute') then
    perform _fail('الزائر', 'يستطيع استدعاءها');
  else perform _pass('anon لا يستدعيها'); end if;
end $$;

do $$ declare f integer; begin
  select fails into f from _score;
  if f = 0 then raise notice 'ALL CHECKS PASSED'; else raise exception '% CHECK(S) FAILED', f; end if;
end $$;
