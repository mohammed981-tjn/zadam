-- بوّابةُ النفير: الميثاق والنفير والفزعة والشورى ونبضُ الثقة.
--
--
-- Each of these tables is written by ordinary signed-in people and read by
-- everyone, so the guards are the whole of the trust: the writer is the
-- session, a closed call stays closed, a promise is marked kept only by the
-- one it was made to, a shura answer comes only from a verified leader, and a
-- trust-pulse answer is never readable by anyone but its author.

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



-- ── الناس ─────────────────────────────────────────────────────────────────
insert into auth.users (id) values
  ('ad000000-0000-0000-0000-0000000000ad'),
  ('a1000000-0000-0000-0000-0000000000a1'),
  ('b2000000-0000-0000-0000-0000000000b2'),
  ('c3000000-0000-0000-0000-0000000000c3')
on conflict (id) do nothing;

insert into profiles (id, full_name, role) values
  ('ad000000-0000-0000-0000-0000000000ad', 'المدير', 'admin'),
  ('a1000000-0000-0000-0000-0000000000a1', 'أحمد',   'investor'),
  ('b2000000-0000-0000-0000-0000000000b2', 'بخيتة',  'investor'),
  ('c3000000-0000-0000-0000-0000000000c3', 'الشيخ',  'investor')
on conflict (id) do nothing;

grant usage on schema public, auth to anon, authenticated;
grant select, insert, update, delete on all tables in schema public to anon, authenticated;
grant usage, select on all sequences in schema public to anon, authenticated;
grant execute on all functions in schema public, auth to anon, authenticated;

\echo ''
\echo 'أ) الميثاق — يُوقَّع باسم الجلسة، والقائد لا يُجيب قبل أن يُتحقَّق منه'

do $$ begin perform _act_as('c3000000-0000-0000-0000-0000000000c3'); end $$;
set role authenticated;
do $$
begin
  perform _does($q$insert into charter_signatures (user_id, charter_version, role, display_name, pledge, state)
    values ('a1000000-0000-0000-0000-0000000000a1', 1, 'leader', 'الشيخ عمر', 'ألتزم أن أُسأل وأُجيب', 'الجزيرة')$q$,
    'الشيخ يوقّع قائداً');
  perform _eq((select user_id from charter_signatures where display_name = 'الشيخ عمر'),
    'c3000000-0000-0000-0000-0000000000c3'::uuid, 'والموقِّعُ من الجلسة لا من الحقل');
  perform _eq(is_charter_leader(), false, 'ولا يُعدّ قائداً مجيباً قبل التحقّق');
  perform _refuses($q$insert into charter_signatures (charter_version, role, display_name, state)
    values (2, 'member', 'س', 'تكساس')$q$, 'وولايةٌ خارج القائمة تُرفض');
  perform _changes_nothing($q$update charter_signatures set verified_at = now()$q$,
    'ولا يتحقّق من نفسه');
end $$;

reset role;
do $$ begin perform _act_as('ad000000-0000-0000-0000-0000000000ad'); end $$;
set role authenticated;
do $$ begin
  perform _does($q$update charter_signatures set verified_at = now()
    where user_id = 'c3000000-0000-0000-0000-0000000000c3'$q$, 'المدير يتحقّق من القائد');
end $$;

reset role;
do $$ begin perform _act_as(null); end $$;
set role anon;
do $$ begin
  perform _eq((select count(*)::int from charter_signatures), 1, 'والزائر يرى الموقّعين');
end $$;

\echo ''
\echo 'ب) النفير — يُدعى إليه، ويُلبّى، ويُغلق بما أُنجز، ثمّ لا يُفتح'

reset role;
do $$ begin perform _act_as('a1000000-0000-0000-0000-0000000000a1'); end $$;
set role authenticated;
do $$ begin
  perform _does($q$insert into nafir_calls (id, organizer_id, display_name, kind, title, description, state, locality, starts_on, needed)
    values ('11111111-0000-0000-0000-000000000001', 'b2000000-0000-0000-0000-0000000000b2', 'أحمد', 'harvest',
            'حصاد السمسم في الحواتة', 'نحتاج أيدياً لحصاد عشرين فداناً قبل المطر', 'القضارف', 'الحواتة',
            current_date + 3, 20)$q$, 'أحمد يدعو إلى نفير');
  perform _eq((select organizer_id from nafir_calls where id = '11111111-0000-0000-0000-000000000001'),
    'a1000000-0000-0000-0000-0000000000a1'::uuid, 'والداعي من الجلسة');
  perform _refuses($q$insert into nafir_calls (display_name, kind, title, description, state, locality, starts_on, needed)
    values ('أحمد', 'harvest', 'نفيرٌ في الماضي', 'وصفٌ يكفي طولاً للقيد', 'القضارف', 'الحواتة', current_date - 1, 5)$q$,
    'ولا يُدعى إلى يومٍ مضى');
  perform _refuses($q$insert into nafir_joins (call_id, user_id, display_name)
    values ('11111111-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-0000000000a1', 'أحمد')$q$,
    'وصاحب الدعوة لا يلبّي نفسه');
  perform _refuses($q$update nafir_calls set status = 'done' where id = '11111111-0000-0000-0000-000000000001'$q$,
    'ولا يُغلق «منجَزاً» بلا ما أُنجز');
end $$;

reset role;
do $$ begin perform _act_as('b2000000-0000-0000-0000-0000000000b2'); end $$;
set role authenticated;
do $$ begin
  perform _does($q$insert into nafir_joins (call_id, user_id, display_name, brings)
    values ('11111111-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-0000000000a1', 'بخيتة', 'منجلان')$q$,
    'بخيتة تلبّي');
  perform _eq((select user_id from nafir_joins limit 1), 'b2000000-0000-0000-0000-0000000000b2'::uuid,
    'والملبّي من الجلسة');
  perform _changes_nothing($q$update nafir_calls set title = 'عنوانٌ مسروق' where id = '11111111-0000-0000-0000-000000000001'$q$,
    'ولا تعدّل دعوةَ غيرها');
end $$;

reset role;
do $$ begin perform _eq((select count(*)::int from notifications where kind = 'nafir_joined'
  and recipient_id = 'a1000000-0000-0000-0000-0000000000a1'), 1, 'والداعي يُبلَّغ'); end $$;

do $$ begin perform _act_as('a1000000-0000-0000-0000-0000000000a1'); end $$;
set role authenticated;
do $$ begin
  perform _does($q$update nafir_calls set status = 'done', outcome = 'حُصد عشرون فداناً في يوم', attended = 14
    where id = '11111111-0000-0000-0000-000000000001'$q$, 'ويُغلق بما أُنجز');
  perform _refuses($q$update nafir_calls set status = 'open' where id = '11111111-0000-0000-0000-000000000001'$q$,
    'ثمّ لا يُعاد فتحه');
end $$;

reset role;
do $$ begin perform _act_as('c3000000-0000-0000-0000-0000000000c3'); end $$;
set role authenticated;
do $$ begin
  perform _refuses($q$insert into nafir_joins (call_id, user_id, display_name)
    values ('11111111-0000-0000-0000-000000000001', 'c3000000-0000-0000-0000-0000000000c3', 'الشيخ')$q$,
    'ولا يُلبّى نفيرٌ أُغلق');
end $$;

\echo ''
\echo 'ج) الفزعة — لا مال، والوفاءُ بالوعد يُثبته المُعان وحده'

reset role;
do $$ begin perform _act_as('b2000000-0000-0000-0000-0000000000b2'); end $$;
set role authenticated;
do $$ begin
  perform _does($q$insert into faza_requests (id, display_name, cause, title, description, state, locality, needs)
    values ('22222222-0000-0000-0000-000000000002', 'بخيتة', 'flood', 'غمر السيل مزرعتي',
            'جرف السيل البذور ونحتاج إعادة الزراعة', 'سنار', 'سنجة', array['seeds','labor'])$q$, 'بخيتة تطلب فزعة');
  perform _refuses($q$insert into faza_requests (display_name, cause, title, description, state, locality, needs)
    values ('بخيتة', 'flood', 'طلب مال', 'أريد مالاً نقداً الآن', 'سنار', 'سنجة', array['cash'])$q$,
    'ولا يُطلب مال');
end $$;

reset role;
do $$ begin perform _act_as('a1000000-0000-0000-0000-0000000000a1'); end $$;
set role authenticated;
do $$ begin
  perform _does($q$insert into faza_pledges (id, request_id, pledger_id, display_name, kind, detail)
    values ('33333333-0000-0000-0000-000000000003', '22222222-0000-0000-0000-000000000002',
            'c3000000-0000-0000-0000-0000000000c3', 'أحمد', 'seeds', 'جوالان من بذور الذرة')$q$, 'أحمد يعاهد');
  perform _eq((select pledger_id from faza_pledges where id = '33333333-0000-0000-0000-000000000003'),
    'a1000000-0000-0000-0000-0000000000a1'::uuid, 'والمعاهِد من الجلسة');
  perform _refuses($q$insert into faza_pledges (request_id, display_name, kind, detail)
    values ('22222222-0000-0000-0000-000000000002', 'أحمد', 'cash', 'مبلغ')$q$, 'ولا عهدَ بالمال');
  update faza_pledges set kept_at = now() where id = '33333333-0000-0000-0000-000000000003';
  perform _eq((select kept_at is null from faza_pledges where id = '33333333-0000-0000-0000-000000000003'),
    true, 'والمعاهِد لا يشهد لنفسه بالوفاء');
end $$;

reset role;
do $$ begin perform _act_as('b2000000-0000-0000-0000-0000000000b2'); end $$;
set role authenticated;
do $$ begin
  perform _refuses($q$insert into faza_pledges (request_id, display_name, kind, detail)
    values ('22222222-0000-0000-0000-000000000002', 'بخيتة', 'labor', 'أعين نفسي')$q$, 'ولا يعاهد المرءُ نفسَه');
  perform _does($q$update faza_pledges set kept_at = now(), detail = 'تغيّر النص'
    where id = '33333333-0000-0000-0000-000000000003'$q$, 'والمُعانة تشهد بالوفاء');
  perform _eq((select detail from faza_pledges where id = '33333333-0000-0000-0000-000000000003'),
    'جوالان من بذور الذرة', 'ولا تغيّر نصَّ العهد');
  perform _eq((select kept_at is not null from faza_pledges where id = '33333333-0000-0000-0000-000000000003'),
    true, 'والوفاءُ مسجَّل');
end $$;

\echo ''
\echo 'د) الشورى — يُسأل القادة علناً، ويجيب المتحقَّق منهم وحدهم'

reset role;
do $$ begin perform _act_as('b2000000-0000-0000-0000-0000000000b2'); end $$;
set role authenticated;
do $$ begin
  perform _does($q$insert into shura_items (id, display_name, kind, title, body, answer, answer_name, answered_at)
    values ('44444444-0000-0000-0000-000000000004', 'بخيتة', 'question', 'كيف يُوزَّع عائد الموسم؟',
            'نريد أن نعرف القاعدة قبل الزراعة لا بعدها', null, null, null)$q$, 'بخيتة تسأل');
  perform _does($q$insert into shura_supports (item_id, user_id) values ('44444444-0000-0000-0000-000000000004',
    'a1000000-0000-0000-0000-0000000000a1')$q$, 'وتؤيّد السؤال');
end $$;

reset role;
do $$ begin perform _act_as('a1000000-0000-0000-0000-0000000000a1'); end $$;
set role authenticated;
do $$ begin
  perform _does($q$insert into shura_supports (item_id) values ('44444444-0000-0000-0000-000000000004')$q$, 'وأحمد يؤيّد');
  perform _eq((select count(*)::int from shura_supports), 1, 'ولا يرى أحمد مَن أيّد غيره');
  update shura_items set answer = 'جوابٌ من غير قائدٍ متحقَّق منه', answer_name = 'أحمد'
    where id = '44444444-0000-0000-0000-000000000004';
  perform _eq((select answer from shura_items where id = '44444444-0000-0000-0000-000000000004'),
    null::text, 'وغيرُ القائد لا يجيب');
end $$;

reset role;
do $$ begin perform _act_as('c3000000-0000-0000-0000-0000000000c3'); end $$;
set role authenticated;
do $$ begin
  perform _does($q$update shura_items set answer = 'تُعلن القاعدة في اجتماعٍ قبل الزراعة', answer_name = 'الشيخ عمر',
    title = 'عنوانٌ غيّره القائد' where id = '44444444-0000-0000-0000-000000000004'$q$, 'والقائد المتحقَّق منه يجيب');
  perform _eq((select answered_by from shura_items where id = '44444444-0000-0000-0000-000000000004'),
    'c3000000-0000-0000-0000-0000000000c3'::uuid, 'والمجيب من الجلسة');
  perform _eq((select title from shura_items where id = '44444444-0000-0000-0000-000000000004'),
    'كيف يُوزَّع عائد الموسم؟', 'ولا يغيّر نصَّ السؤال');
end $$;

reset role;
do $$ begin
  perform _eq((select supports::int from shura_support_counts() where item_id = '44444444-0000-0000-0000-000000000004'),
    2, 'والعدد يُقرأ مجمّعاً');
  perform _eq((select count(*)::int from notifications where kind = 'shura_answered'), 1, 'والسائلة تُبلَّغ بالجواب');
end $$;

\echo ''
\echo 'هـ) نبضُ الثقة — لا يقرؤه إلا صاحبه، ولا يُعلن تحت عشرة'

do $$ begin perform _act_as('a1000000-0000-0000-0000-0000000000a1'); end $$;
set role authenticated;
do $$ begin
  perform _does($q$insert into trust_pulse (period, q_trust_people, q_trust_leaders, q_help_expected, q_voice_heard)
    values (to_char(now(), 'YYYY') || '-Q' || to_char(now(), 'Q'), 4, 3, 5, 2)$q$, 'أحمد يجيب');
  perform _refuses($q$insert into trust_pulse (period, q_trust_people, q_trust_leaders, q_help_expected, q_voice_heard)
    values (to_char(now(), 'YYYY') || '-Q' || to_char(now(), 'Q'), 1, 1, 1, 1)$q$, 'ومرّةً واحدة في الربع');
end $$;

reset role;
do $$ begin perform _act_as('ad000000-0000-0000-0000-0000000000ad'); end $$;
set role authenticated;
do $$ begin
  perform _eq((select count(*)::int from trust_pulse), 0, 'ولا يقرأ المديرُ الإجاباتِ فرداً فرداً');
end $$;

reset role;
do $$ begin perform _act_as(null); end $$;
set role anon;
do $$
declare r record;
begin
  select * into r from nafir_indicators();
  perform _eq(r.pulse_count::int, 1, 'والمؤشّر يعدّ الإجابات');
  perform _eq(r.pulse_trust_people, null::numeric, 'ولا يكشف متوسّطاً تحت العشرة');
  perform _eq(r.nafir_done::int, 1, 'ونفيرٌ واحدٌ منجَز');
  perform _eq(r.nafir_attended::int, 14, 'وحضره أربعة عشر');
  perform _eq(r.pledges_kept::int, 1, 'وعهدٌ واحدٌ وُفّي');
  perform _eq(r.shura_answered::int, 1, 'وسؤالٌ واحدٌ أُجيب');
  perform _eq(r.signers_leaders::int, 1, 'وقائدٌ واحدٌ وقّع');
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
