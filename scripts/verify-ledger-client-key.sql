-- بوّابةُ مفتاح القيد (البند ٢٠٣، متابعة القيد بلا شبكة؛ الهجرة 20261106060000_ledger_client_key.sql).
-- على السلسلة الكاملة وبالهويّة كما يضعها PostgREST: القيد يُرسَل مرّتين بمفتاحه فيُحفظ مرّة، ويُرحَّل مرّة؛ ومفاتيح
-- مختلفة قيودٌ مختلفة؛ وما لا مفتاح له كما كان؛ وغير صاحب الموسم لا يكتب بالمفتاح ولا يقرأ به ولا يصطدم به؛ والمفتاح
-- لا يتغيّر بعد الحفظ؛ وحرّاس الدفتر القائمة على حالها.

\set ON_ERROR_STOP on
\set QUIET on
set client_min_messages = notice;
\o /dev/null

create table _score (fails integer not null default 0, passes integer not null default 0);
insert into _score values (0, 0);
grant all on _score to authenticated, anon;

create function _fail(label text, why text) returns void language plpgsql as $$
begin raise notice '  FAIL  % — %', label, why; update _score set fails = fails + 1; end $$;
create function _pass(label text) returns void language plpgsql as $$
begin raise notice '  PASS  %', label; update _score set passes = passes + 1; end $$;
create function _eq(got anyelement, want anyelement, label text) returns void language plpgsql as $$
begin
  if got is not distinct from want then perform _pass(label || ' — ' || coalesce(got::text, 'null'));
  else perform _fail(label, 'جاء ' || coalesce(got::text, 'null') || ' والمتوقَّع ' || coalesce(want::text, 'null')); end if;
end $$;
/* يُرفض بخطأ؛ وإن أُعطي جزءٌ من الرسالة فبها، لا بخطأٍ آخر. */
create function _refuses(stmt text, label text, want text default null) returns void language plpgsql as $$
begin
  begin execute stmt;
  exception when others then
    if want is null or position(want in sqlerrm) > 0 then perform _pass(label);
    else perform _fail(label, 'رُفض بغير السبب: ' || sqlerrm); end if;
    return;
  end;
  perform _fail(label, 'نُفِّذ وكان يجب أن يُرفض');
end $$;
/* الحالة التي ينتهي بها الأمر: 'ok'، أو رمز الخطأ واسم القيد الذي رفضه (كما يقرؤه الخادم من PostgREST). */
create function _outcome(stmt text) returns text language plpgsql as $$
declare c text;
begin
  begin execute stmt;
  exception when others then
    get stacked diagnostics c = constraint_name;
    return sqlstate || coalesce(':' || nullif(c, ''), '');
  end;
  return 'ok';
end $$;
/* ينفَّذ ويمسّ عدداً بعينه من الصفوف. */
create function _rows(stmt text, want integer, label text) returns void language plpgsql as $$
declare n integer;
begin
  begin execute stmt; get diagnostics n = row_count;
  exception when others then perform _fail(label, 'رُفض: ' || sqlerrm); return; end;
  perform _eq(n, want, label);
end $$;
create function _as(p uuid) returns void language sql as $$
  select set_config('request.jwt.claims',
    case when p is null then '' else json_build_object('sub', p, 'role', 'authenticated', 'aal', 'aal1')::text end, false) $$;
/* العدّ بصلاحيّة العنقود: ما في الجدول فعلاً، لا ما تسمح السياسات للسائل برؤيته. */
create function _n_entries(p_season uuid, p_key uuid default null) returns integer language sql security definer as $$
  select count(*)::integer from ledger_entries
   where season_id = p_season and (p_key is null or client_key = p_key) $$;
create function _n_null(p_season uuid) returns integer language sql security definer as $$
  select count(*)::integer from ledger_entries where season_id = p_season and client_key is null $$;
/* القيود المرحَّلة إلى دفتر المزرعة من سطور هذا الموسم (الترحيل الأصليّ، لا عكسه). */
create function _n_posted(p_season uuid) returns integer language sql security definer as $$
  select count(*)::integer from journal_entries j
   where j.source_type = 'season_entry' and j.reversal_of is null
     and j.source_id in (select id from ledger_entries where season_id = p_season) $$;
grant execute on function _fail(text, text), _pass(text), _eq(anyelement, anyelement, text), _refuses(text, text, text),
  _outcome(text), _rows(text, integer, text), _as(uuid), _n_entries(uuid, uuid), _n_null(uuid), _n_posted(uuid)
  to authenticated, anon;

-- ── الناس والمواسم (بصلاحيّة العنقود) ────────────────────────────────────────
-- d1 المزارع صاحب الموسمين · e9 غريبٌ له موسمه
insert into auth.users (id) values
  ('d1000000-0000-0000-0000-0000000000d1'), ('e9000000-0000-0000-0000-0000000000e9');
insert into profiles (id, full_name, role) values
  ('d1000000-0000-0000-0000-0000000000d1', 'المزارع', 'investor'),
  ('e9000000-0000-0000-0000-0000000000e9', 'غريب', 'investor')
on conflict (id) do update set role = excluded.role, full_name = excluded.full_name;

insert into seasons (id, owner_id, name, crop_key, station_key, irrigation, feddans, planting_date) values
  ('5a000000-0000-0000-0000-00000000005a', 'd1000000-0000-0000-0000-0000000000d1', 'موسم الذرة', 'sorghum', 'sennar', 'rainfed', 10, '2026-07-01'),
  ('5b000000-0000-0000-0000-00000000005b', 'd1000000-0000-0000-0000-0000000000d1', 'موسمٌ مضى', 'sorghum', 'sennar', 'rainfed', 10, '2025-07-01'),
  ('5e000000-0000-0000-0000-00000000005e', 'e9000000-0000-0000-0000-0000000000e9', 'موسم الغريب', 'sorghum', 'sennar', 'rainfed', 5, '2026-07-01');
update seasons set status = 'completed' where id = '5b000000-0000-0000-0000-00000000005b';

\o
\echo 'أ) العمود والفهرس كما وُصفا'
\o /dev/null
do $$ begin
  perform _eq((select data_type from information_schema.columns
                where table_schema = 'public' and table_name = 'ledger_entries' and column_name = 'client_key'),
              'uuid', 'العمود client_key من نوع uuid');
  perform _eq((select is_nullable from information_schema.columns
                where table_schema = 'public' and table_name = 'ledger_entries' and column_name = 'client_key'),
              'YES', 'ويقبل الفراغ (القيود القديمة وما يكتبه غير الهاتف)');
  perform _eq((select i.indisunique from pg_index i join pg_class c on c.oid = i.indexrelid
                where c.relname = 'ledger_entries_season_client_key'),
              true, 'الفهرس فريد');
  perform _eq((select pg_get_expr(i.indpred, i.indrelid) from pg_index i join pg_class c on c.oid = i.indexrelid
                where c.relname = 'ledger_entries_season_client_key'),
              '(client_key IS NOT NULL)', 'وجزئيّ: لما له مفتاحٌ وحده');
  perform _eq((select pg_get_indexdef(c.oid) like '%(season_id, client_key)%' from pg_class c
                where c.relname = 'ledger_entries_season_client_key'),
              true, 'وعلى (الموسم، المفتاح)');
end $$;

\o
\echo 'ب) المفتاح نفسه مرّتين: قيدٌ واحد، وترحيلٌ واحد'
\o /dev/null
set role authenticated;
select _as('d1000000-0000-0000-0000-0000000000d1');
do $$ begin
  perform _eq(_outcome($q$insert into ledger_entries (season_id, category, amount, description, created_by, client_key)
                values ('5a000000-0000-0000-0000-00000000005a', 'seeds', 120, 'بذور', 'd1000000-0000-0000-0000-0000000000d1',
                        'c1000000-0000-4000-8000-0000000000c1')$q$),
              'ok', 'المرّة الأولى تُحفظ');
  perform _eq(_outcome($q$insert into ledger_entries (season_id, category, amount, description, created_by, client_key)
                values ('5a000000-0000-0000-0000-00000000005a', 'seeds', 120, 'بذور', 'd1000000-0000-0000-0000-0000000000d1',
                        'c1000000-0000-4000-8000-0000000000c1')$q$),
              '23505:ledger_entries_season_client_key',
              'والثانية بالمفتاح نفسه تُرفض بالفهرس وحده (23505 على ledger_entries_season_client_key) — وهذا ما يقرؤه الخادم «حُفظ من قبل»');
  perform _eq(_outcome($q$insert into ledger_entries (season_id, category, amount, description, created_by, client_key)
                values ('5a000000-0000-0000-0000-00000000005a', 'labour', 999, 'غير ذلك', 'd1000000-0000-0000-0000-0000000000d1',
                        'c1000000-0000-4000-8000-0000000000c1')$q$),
              '23505:ledger_entries_season_client_key', 'ولو تغيّر ما في القيد: المفتاح هو المحاولة نفسها');
  perform _eq(_n_entries('5a000000-0000-0000-0000-00000000005a', 'c1000000-0000-4000-8000-0000000000c1'), 1,
              'في الدفتر قيدٌ واحدٌ بهذا المفتاح');
  perform _eq(_n_entries('5a000000-0000-0000-0000-00000000005a'), 1, 'وفي الموسم قيدٌ واحد');
  perform _eq(_n_posted('5a000000-0000-0000-0000-00000000005a'), 1,
              'وفي دفتر المزرعة ترحيلٌ واحد: المرفوض لم يبلغ زناد الترحيل');
end $$;

\o
\echo 'ج) مفاتيح مختلفة: قيودٌ مختلفة — ولو تطابق ما فيها (شراءان حقيقيّان)'
\o /dev/null
do $$ begin
  perform _rows($q$insert into ledger_entries (season_id, category, amount, description, created_by, client_key)
                values ('5a000000-0000-0000-0000-00000000005a', 'seeds', 120, 'بذور', 'd1000000-0000-0000-0000-0000000000d1',
                        'c2000000-0000-4000-8000-0000000000c2')$q$, 1, 'مفتاحٌ آخر بالأرقام نفسها يُحفظ');
  perform _eq(_n_entries('5a000000-0000-0000-0000-00000000005a'), 2, 'فصار في الموسم قيدان');
  perform _eq(_n_posted('5a000000-0000-0000-0000-00000000005a'), 2, 'وترحيلان');
end $$;

\o
\echo 'د) ما لا مفتاح له كما كان: لا يصطدم بشيء'
\o /dev/null
do $$ begin
  perform _rows($q$insert into ledger_entries (season_id, category, amount, description, created_by)
                values ('5a000000-0000-0000-0000-00000000005a', 'transport', 30, 'نقل', 'd1000000-0000-0000-0000-0000000000d1')$q$,
                1, 'قيدٌ بلا مفتاح يُحفظ');
  perform _rows($q$insert into ledger_entries (season_id, category, amount, description, created_by, client_key)
                values ('5a000000-0000-0000-0000-00000000005a', 'transport', 30, 'نقل', 'd1000000-0000-0000-0000-0000000000d1', null)$q$,
                1, 'ومثله مرّةً ثانية، بمفتاحٍ فارغٍ صراحةً');
  perform _eq(_n_null('5a000000-0000-0000-0000-00000000005a'), 2, 'فالقيدان بلا مفتاح كلاهما في الدفتر');
  perform _eq(_n_posted('5a000000-0000-0000-0000-00000000005a'), 4, 'وكلاهما رُحِّل');
end $$;

\o
\echo 'هـ) الغريب: لا يكتب بالمفتاح، ولا يقرأ به، ولا يصطدم به'
\o /dev/null
select _as('e9000000-0000-0000-0000-0000000000e9');
do $$ begin
  perform _eq(_outcome($q$insert into ledger_entries (season_id, category, amount, created_by, client_key)
                values ('5a000000-0000-0000-0000-00000000005a', 'seeds', 120, 'e9000000-0000-0000-0000-0000000000e9',
                        'c1000000-0000-4000-8000-0000000000c1')$q$),
              '42501', 'بمفتاحٍ مأخوذٍ في موسم غيره: ترفضه سياسة الكتابة قبل الفهرس، فلا يعلم أنّ المفتاح مأخوذ');
  perform _eq(_outcome($q$insert into ledger_entries (season_id, category, amount, created_by, client_key)
                values ('5a000000-0000-0000-0000-00000000005a', 'seeds', 120, 'e9000000-0000-0000-0000-0000000000e9',
                        'c9000000-0000-4000-8000-0000000000c9')$q$),
              '42501', 'وبمفتاحٍ جديد: الرفض نفسه، فلا فرق يُقرأ بين المفتاحين');
  perform _eq((select count(*)::integer from ledger_entries where client_key = 'c1000000-0000-4000-8000-0000000000c1'), 0,
              'ولا يجد صفّاً بالسؤال عن المفتاح');
  perform _eq((select count(*)::integer from ledger_entries where season_id = '5a000000-0000-0000-0000-00000000005a'), 0,
              'ولا يرى من دفتر الموسم شيئاً');
  perform _rows($q$update ledger_entries set client_key = 'c9000000-0000-4000-8000-0000000000c9'
                 where season_id = '5a000000-0000-0000-0000-00000000005a'$q$, 0, 'ولا يمسّ مفتاح قيدٍ ليس له');
  perform _rows($q$insert into ledger_entries (season_id, category, amount, created_by, client_key)
                values ('5e000000-0000-0000-0000-00000000005e', 'seeds', 120, 'e9000000-0000-0000-0000-0000000000e9',
                        'c1000000-0000-4000-8000-0000000000c1')$q$,
                1, 'والمفتاح نفسه في موسمه هو يُحفظ: المفتاح للموسم، فلا يحجب أحدٌ قيد أحد');
end $$;
select _as('d1000000-0000-0000-0000-0000000000d1');
do $$ begin
  perform _eq(_n_entries('5a000000-0000-0000-0000-00000000005a', 'c1000000-0000-4000-8000-0000000000c1'), 1,
              'وقيد المزارع بمفتاحه باقٍ كما هو');
  perform _eq(_outcome($q$insert into ledger_entries (season_id, category, amount, created_by, client_key)
                values ('5a000000-0000-0000-0000-00000000005a', 'seeds', 120, 'd1000000-0000-0000-0000-0000000000d1',
                        'c1000000-0000-4000-8000-0000000000c1')$q$),
              '23505:ledger_entries_season_client_key', 'وإعادة إرساله ما زالت «حُفظ من قبل»');
end $$;

\o
\echo 'و) المفتاح يُكتب مع القيد ولا يتغيّر بعده'
\o /dev/null
do $$ begin
  perform _refuses($q$update ledger_entries set client_key = 'c3000000-0000-4000-8000-0000000000c3'
                    where client_key = 'c2000000-0000-4000-8000-0000000000c2'$q$,
                   'صاحب الموسم لا يغيّر مفتاح قيده', 'مفتاح القيد يُكتب مع القيد ولا يتغيّر بعده');
  perform _refuses($q$update ledger_entries set client_key = 'c1000000-0000-4000-8000-0000000000c1'
                    where client_key = 'c2000000-0000-4000-8000-0000000000c2'$q$,
                   'ولا يعطيه مفتاح قيدٍ آخر', 'مفتاح القيد يُكتب مع القيد ولا يتغيّر بعده');
  perform _refuses($q$update ledger_entries set client_key = null
                    where client_key = 'c2000000-0000-4000-8000-0000000000c2'$q$,
                   'ولا يمحوه', 'مفتاح القيد يُكتب مع القيد ولا يتغيّر بعده');
  perform _refuses($q$update ledger_entries set client_key = 'c4000000-0000-4000-8000-0000000000c4'
                    where season_id = '5a000000-0000-0000-0000-00000000005a' and client_key is null$q$,
                   'ولا يضع مفتاحاً لقيدٍ حُفظ بلا مفتاح', 'مفتاح القيد يُكتب مع القيد ولا يتغيّر بعده');
  perform _rows($q$update ledger_entries set description = 'بذور محسّنة'
                 where client_key = 'c2000000-0000-4000-8000-0000000000c2'$q$, 1,
                'وتعديل القيد نفسه في موسمٍ جارٍ كما كان (والمفتاح معه)');
  perform _eq(_n_entries('5a000000-0000-0000-0000-00000000005a', 'c2000000-0000-4000-8000-0000000000c2'), 1, 'والمفتاح باقٍ عليه');
end $$;
reset role;
select _as(null);
do $$ begin
  perform _refuses($q$update ledger_entries set client_key = gen_random_uuid()
                    where client_key = 'c2000000-0000-4000-8000-0000000000c2'$q$,
                   'ولا صاحب العنقود (مفتاح الخادم) يغيّره', 'مفتاح القيد يُكتب مع القيد ولا يتغيّر بعده');
end $$;

\o
\echo 'ز) وحرّاس الدفتر القائمة على حالها'
\o /dev/null
set role authenticated;
select _as('d1000000-0000-0000-0000-0000000000d1');
do $$ begin
  perform _rows($q$insert into ledger_entries (season_id, category, amount, description, created_by, client_key)
                values ('5b000000-0000-0000-0000-00000000005b', 'other', 15, 'تصحيح', 'd1000000-0000-0000-0000-0000000000d1',
                        'c5000000-0000-4000-8000-0000000000c5')$q$, 1, 'قيدٌ مصحِّح في موسمٍ أُقفل يُضاف كما كان، بمفتاحه');
  perform _eq(_outcome($q$insert into ledger_entries (season_id, category, amount, description, created_by, client_key)
                values ('5b000000-0000-0000-0000-00000000005b', 'other', 15, 'تصحيح', 'd1000000-0000-0000-0000-0000000000d1',
                        'c5000000-0000-4000-8000-0000000000c5')$q$),
              '23505:ledger_entries_season_client_key', 'وإعادته لا تضيف ثانياً');
  perform _refuses($q$update ledger_entries set description = 'غيّرته' where client_key = 'c5000000-0000-4000-8000-0000000000c5'$q$,
                   'ودفتر الموسم المُقفل لا يُعدَّل', 'دفتر موسمٍ أُقفل');
  perform _refuses($q$insert into ledger_entries (season_id, category, amount, created_by, client_key)
                values ('5a000000-0000-0000-0000-00000000005a', 'seeds', 0, 'd1000000-0000-0000-0000-0000000000d1',
                        'c6000000-0000-4000-8000-0000000000c6')$q$,
                   'والمبلغ الأقلّ من سنت يُرفض بسببه، بمفتاحٍ أو بغيره', 'أقلّ من سنتٍ');
  perform _eq(_n_entries('5a000000-0000-0000-0000-00000000005a', 'c6000000-0000-4000-8000-0000000000c6'), 0,
              'والمرفوض لم يأخذ مفتاحه: يُرسَل مصحَّحاً بالمفتاح نفسه');
  perform _rows($q$insert into ledger_entries (season_id, category, amount, created_by, client_key)
                values ('5a000000-0000-0000-0000-00000000005a', 'seeds', 6, 'd1000000-0000-0000-0000-0000000000d1',
                        'c6000000-0000-4000-8000-0000000000c6')$q$, 1, 'فيُحفظ');
end $$;
reset role;
select _as(null);

\o
\echo 'ح) والصلاحيّات والسياسات'
\o /dev/null
do $$ begin
  perform _eq(has_function_privilege('authenticated', 'public.ledger_entries_client_key_gate()', 'execute'), false,
              'العضو لا ينادي دالّة الزناد');
  perform _eq(has_function_privilege('anon', 'public.ledger_entries_client_key_gate()', 'execute'), false, 'ولا الزائر');
  perform _eq((select string_agg(policyname, ',' order by policyname) from pg_policies
                where schemaname = 'public' and tablename = 'ledger_entries' and cmd in ('INSERT', 'ALL')),
              'ledger_owner_insert', 'وطريق الكتابة واحدٌ كما كان: سياسة صاحب الموسم وحدها');
  perform _eq((select count(*)::integer from pg_trigger t join pg_class c on c.oid = t.tgrelid
                where c.relname = 'ledger_entries' and not t.tgisinternal
                  and t.tgname in ('ledger_entries_prepare', 'ledger_entries_prepare_positive', 'ledger_entries_history_gate',
                                   'ledger_entries_mirror_ins', 'ledger_entries_mirror_upd', 'ledger_entries_mirror_del',
                                   'ledger_entries_client_key_gate')),
              7, 'وزنادات الدفتر كلّها قائمة، والجديد بجانبها');
end $$;

\o
do $$ declare f integer; p integer; begin
  select fails, passes into f, p from _score;
  if f = 0 then raise notice 'ALL CHECKS PASSED (%)', p; else raise exception '% CHECK(S) FAILED (% passed)', f, p; end if;
end $$;
