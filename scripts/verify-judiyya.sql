-- بوّابةُ الجودية: الخطواتُ بترتيبها، ولا يراها إلا أهلُها.
--
--
-- A dispute is private to its parties and mediators, and every step has an
-- owner: only the other side can join through the link, nothing moves before
-- both commit, no mediator sits without both sides and his own consent, and
-- only a seated mediator writes the settlement both sides then confirm.

\set ON_ERROR_STOP on
\set QUIET on

create table if not exists _score (fails integer not null default 0);
delete from _score;
insert into _score values (0);

create or replace function _fail(label text, why text) returns void
language plpgsql as $$
begin
  raise notice '  FAIL  % — %', label, why;
  update _score set fails = fails + 1;
end $$;

create or replace function _pass(label text) returns void
language plpgsql as $$
begin raise notice '  PASS  %', label; end $$;

create or replace function _eq(got anyelement, want anyelement, label text) returns void
language plpgsql as $$
begin
  if got is not distinct from want then
    perform _pass(label || ' — ' || coalesce(got::text,'null'));
  else
    perform _fail(label, 'جاء ' || coalesce(got::text,'null') || ' والمتوقَّع ' || coalesce(want::text,'null'));
  end if;
end $$;

create or replace function _does(stmt text, label text) returns void
language plpgsql as $$
declare touched integer;
begin
  begin
    execute stmt;
    get diagnostics touched = row_count;
  exception when others then
    perform _fail(label, 'رُفض: ' || sqlerrm);
    return;
  end;
  if touched > 0 then perform _pass(label);
  else perform _fail(label, 'نُفِّذ ولم يمسّ صفّاً — سياسةٌ رشّحت كلَّ شيء بصمت');
  end if;
end $$;

create or replace function _refuses(stmt text, label text) returns void
language plpgsql as $$
begin
  begin execute stmt;
  exception when others then perform _pass(label); return;
  end;
  perform _fail(label, 'نُفِّذ وكان يجب أن يُرفض');
end $$;

create or replace function _changes_nothing(stmt text, label text) returns void
language plpgsql as $$
declare touched integer;
begin
  begin
    execute stmt;
    get diagnostics touched = row_count;
  exception when others then perform _pass(label || ' — رُفض صراحةً'); return;
  end;
  if touched = 0 then perform _pass(label);
  else perform _fail(label, 'مسّ ' || touched || ' صفّاً وكان يجب ألّا يمسّ شيئاً');
  end if;
end $$;

create or replace function _act_as(p uuid) returns void
language plpgsql as $$ begin update _who set uid = p; end $$;




-- ── الناس: أ وب طرفان، م أجويد، غ غريب، ومدير ─────────────────────────────
insert into auth.users (id) values
  ('ad000000-0000-0000-0000-0000000000ad'),
  ('a1000000-0000-0000-0000-0000000000a1'),
  ('b2000000-0000-0000-0000-0000000000b2'),
  ('e3000000-0000-0000-0000-0000000000e3'),
  ('f4000000-0000-0000-0000-0000000000f4')
on conflict (id) do nothing;
insert into profiles (id, full_name, role) values
  ('ad000000-0000-0000-0000-0000000000ad', 'المدير', 'admin'),
  ('a1000000-0000-0000-0000-0000000000a1', 'أ', 'investor'),
  ('b2000000-0000-0000-0000-0000000000b2', 'ب', 'investor'),
  ('e3000000-0000-0000-0000-0000000000e3', 'م', 'investor'),
  ('f4000000-0000-0000-0000-0000000000f4', 'غ', 'investor')
on conflict (id) do nothing;

grant usage on schema public, auth to anon, authenticated;
grant select, insert, update, delete on all tables in schema public to anon, authenticated;
grant usage, select on all sequences in schema public to anon, authenticated;
grant execute on function auth.uid() to anon, authenticated;

create table _case (id uuid, token text);
grant all on _case to authenticated;

\echo ''
\echo 'أ) الفتح والدعوة — لا يراه غريب، ويدخله الطرف الآخر بالرابط مرّةً واحدة'

do $$ begin perform _act_as('a1000000-0000-0000-0000-0000000000a1'); end $$;
set role authenticated;
do $$
declare v uuid;
begin
  v := judiyya_open('water', 'نوبة الماء في الترعة الفرعية', 'اختلفنا على نوبة الماء في الليل منذ الموسم الماضي', 'الجزيرة', 'الحصاحيصا', 'أحمد');
  insert into _case select v, invite_token from judiyya_cases where id = v;
  perform _eq((select count(*)::int from judiyya_cases), 1, 'أ يفتح الطلب ويراه');
  perform _changes_nothing($q$update judiyya_cases set status = 'settled'$q$, 'ولا يكتب الجدول مباشرةً — لا سياسة كتابة، فكلّ خطوةٍ عبر دالّتها');
  perform _refuses($q$select judiyya_commit((select id from _case))$q$, 'ولا يلتزم قبل دخول الطرف الآخر');
end $$;

reset role;
do $$ begin perform _act_as('f4000000-0000-0000-0000-0000000000f4'); end $$;
set role authenticated;
do $$ begin
  perform _eq((select count(*)::int from judiyya_cases), 0, 'والغريب لا يرى الطلب');
  perform _refuses($q$select judiyya_join('ليس-رابطاً', 'غريب')$q$, 'ولا يدخل برابطٍ مخترَع');
end $$;

reset role;
do $$ begin perform _act_as('b2000000-0000-0000-0000-0000000000b2'); end $$;
set role authenticated;
do $$ begin
  perform _eq(judiyya_join((select token from _case), 'بشير'), (select id from _case), 'ب يدخل بالرابط');
  perform _eq((select count(*)::int from judiyya_parties), 2, 'ويرى الطرفين');
end $$;

reset role;
do $$ begin perform _act_as('f4000000-0000-0000-0000-0000000000f4'); end $$;
set role authenticated;
do $$ begin
  perform _refuses($q$select judiyya_join((select token from _case), 'متسلّل')$q$, 'والرابط لا يعمل مرّةً ثانية');
end $$;

\echo ''
\echo 'ب) الالتزام قبل السماع — ثمّ اللجنة برضا الطرفين وقبول الأجويد'

reset role;
do $$ begin perform _act_as('e3000000-0000-0000-0000-0000000000e3'); end $$;
set role authenticated;
do $$ begin
  perform judiyya_volunteer('العمدة محمد', 'الجزيرة', 'عمدة قرية، صالحتُ في نزاعات ماءٍ عشرين سنة');
  perform _eq((select verified_at is null from judiyya_mediators), true, 'م يتطوّع أجويداً ولا يُتحقَّق منه بنفسه');
end $$;

reset role;
do $$ begin perform _act_as('a1000000-0000-0000-0000-0000000000a1'); end $$;
set role authenticated;
do $$ begin
  perform judiyya_commit((select id from _case));
  perform _eq((select status from judiyya_cases), 'forming', 'أ يلتزم والطلب ينتظر الآخر');
  perform _refuses($q$select judiyya_approve((select id from _case), 'e3000000-0000-0000-0000-0000000000e3', true)$q$, 'ولا تُختار اللجنة قبل الالتزامين');
  perform _refuses($q$select judiyya_verify_mediator('e3000000-0000-0000-0000-0000000000e3')$q$, 'ولا يتحقّق طرفٌ من أجويد');
end $$;

reset role;
do $$ begin perform _act_as('b2000000-0000-0000-0000-0000000000b2'); end $$;
set role authenticated;
do $$ begin
  perform judiyya_commit((select id from _case));
  perform _eq((select status from judiyya_cases), 'active', 'ب يلتزم فيجري الطلب');
  perform _refuses($q$select judiyya_approve((select id from _case), 'e3000000-0000-0000-0000-0000000000e3', true)$q$, 'ولا يُختار أجويدٌ لم يُتحقَّق منه');
end $$;

reset role;
do $$ begin perform _act_as('ad000000-0000-0000-0000-0000000000ad'); end $$;
set role authenticated;
do $$ begin perform judiyya_verify_mediator('e3000000-0000-0000-0000-0000000000e3');
  perform _eq((select verified_at is not null from judiyya_mediators), true, 'المدير يتحقّق من الأجويد'); end $$;

reset role;
do $$ begin perform _act_as('a1000000-0000-0000-0000-0000000000a1'); end $$;
set role authenticated;
do $$ begin
  perform judiyya_approve((select id from _case), 'e3000000-0000-0000-0000-0000000000e3', true);
end $$;

reset role;
do $$ begin perform _act_as('e3000000-0000-0000-0000-0000000000e3'); end $$;
set role authenticated;
do $$ begin
  perform _refuses($q$select judiyya_accept((select id from _case))$q$, 'ولا يقبل الأجويد قبل أن يرضاه الطرفان كلاهما');
end $$;

reset role;
do $$ begin perform _act_as('b2000000-0000-0000-0000-0000000000b2'); end $$;
set role authenticated;
do $$ begin
  perform judiyya_approve((select id from _case), 'e3000000-0000-0000-0000-0000000000e3', true);
  perform _refuses($q$select judiyya_write_settlement((select id from _case), 'صلحٌ يكتبه طرفٌ لنفسه ولا يصحّ', 'بشير')$q$, 'ولا يكتب الطرفُ الصلح');
end $$;

reset role;
do $$ begin perform _act_as('e3000000-0000-0000-0000-0000000000e3'); end $$;
set role authenticated;
do $$ begin
  perform _refuses($q$select judiyya_write_settlement((select id from _case), 'صلحٌ قبل أن يقبل الأجويد مهمّته', 'العمدة')$q$, 'ولا يكتب الأجويد قبل أن يقبل');
  perform judiyya_accept((select id from _case));
  perform _eq((select count(*)::int from judiyya_cases), 1, 'والأجويد يرى الطلب حين يدخل اللجنة');
  perform judiyya_write_settlement((select id from _case), 'نوبة الليل لأحمد يوم السبت والاثنين، ولبشير الأحد والثلاثاء، ويتقاسمان الخميس', 'العمدة محمد');
  perform _eq((select settled_by from judiyya_cases), 'e3000000-0000-0000-0000-0000000000e3'::uuid, 'ويكتب الصلح باسمه من الجلسة');
end $$;

\echo ''
\echo 'ج) الإقرار — كلُّ طرفٍ باسمه، والختم بالإقرارين'

reset role;
do $$ begin perform _act_as('a1000000-0000-0000-0000-0000000000a1'); end $$;
set role authenticated;
do $$ begin
  perform judiyya_confirm((select id from _case));
  perform _eq((select status from judiyya_cases), 'active', 'أ يُقرّ والطلب ينتظر إقرار الآخر');
end $$;

reset role;
do $$ begin perform _act_as('e3000000-0000-0000-0000-0000000000e3'); end $$;
set role authenticated;
do $$ begin
  perform judiyya_write_settlement((select id from _case), 'نصٌّ معدَّل: نوبة الليل تُقسم بالتساوي، ويتقاسمان الخميس والجمعة', 'العمدة محمد');
end $$;

reset role;
do $$ begin
  perform _eq((select count(*)::int from judiyya_parties where confirmed_at is not null), 0,
    'وتعديلُ النصّ يُسقط الإقرار السابق — يُقَرّ نصٌّ لا طلب');
end $$;

do $$ begin perform _act_as('a1000000-0000-0000-0000-0000000000a1'); end $$;
set role authenticated;
do $$ begin perform judiyya_confirm((select id from _case)); end $$;
reset role;
do $$ begin perform _act_as('b2000000-0000-0000-0000-0000000000b2'); end $$;
set role authenticated;
do $$ begin
  perform judiyya_confirm((select id from _case));
  perform _eq((select status from judiyya_cases), 'settled', 'ب يُقرّ فيُختم الصلح');
  perform _refuses($q$select judiyya_withdraw((select id from _case))$q$, 'ولا يُسحب صلحٌ خُتم');
end $$;

\echo ''
\echo 'د) ما يُعلن — أعدادٌ لا أسماء'

reset role;
do $$ begin perform _act_as(null); end $$;
set role anon;
do $$
declare r record;
begin
  perform _eq((select count(*)::int from judiyya_cases), 0, 'الزائر لا يرى أيَّ طلب');
  select * into r from judiyya_counts();
  perform _eq(r.cases_settled::int, 1, 'ويرى أنّ صلحاً واحداً خُتم');
  perform _eq(r.mediators_verified::int, 1, 'وأنّ أجويداً واحداً مُتحقَّقٌ منه');
  perform _eq((select count(*)::int from judiyya_mediators), 1, 'ويرى سجلّ الأجاويد');
end $$;

reset role;
do $$
declare f integer;
begin
  select fails into f from _score;
  if f = 0 then raise notice 'ALL CHECKS PASSED';
  else raise exception '% CHECK(S) FAILED', f;
  end if;
end $$;
