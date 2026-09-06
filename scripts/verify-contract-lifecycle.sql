-- بوّابةُ دورة حياة العقد: لا يتحرّك بطرفٍ واحد، ولا يُعاد تسعيرُه بعد العرض.
--
-- WHY BOTH HALVES, AGAIN
--
-- A guard that refuses everything passes any gate built purely of refusals, and
-- would make contracting unusable. So every rule here is checked twice: the
-- entitled party **succeeds**, and the other party **is refused** on the very
-- same transition. The pair is the test; either half alone is not.
--
-- AND WHY REFUSALS ARE MEASURED TWO DIFFERENT WAYS
--
-- `contracts_parties` is one `ALL` policy whose USING and WITH CHECK are the
-- same expression, so a stranger's UPDATE is filtered **silently** — no error,
-- no rows, and the Supabase client reports success. A party's forbidden
-- transition is a different thing: the row is visible to them, so the statement
-- reaches the trigger and the trigger **raises**.
--
-- Those need different assertions. `_changes_nothing` for the policy layer,
-- `_refuses` for the trigger layer. Using the wrong one is how a check passes
-- while proving nothing — which has already happened three times on this
-- project, twice inside gates written for it.

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

/* ينجح **ويمسّ صفّاً** — فالتنفيذ بلا أثر رفضٌ صامت لا نجاح. */
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

/* يُرفع عليه خطأ — طبقةُ الزناد. */
create or replace function _refuses(stmt text, label text) returns void
language plpgsql as $$
begin
  begin
    execute stmt;
  exception when others then
    perform _pass(label);
    return;
  end;
  perform _fail(label, 'نُفِّذ وكان يجب أن يُرفض');
end $$;

/* لا يمسّ صفّاً — طبقةُ سياسة الصفوف، وهي ترشّح بلا خطأ. */
create or replace function _changes_nothing(stmt text, label text) returns void
language plpgsql as $$
declare touched integer;
begin
  begin
    execute stmt;
    get diagnostics touched = row_count;
  exception when others then
    perform _pass(label || ' — رُفض صراحةً');
    return;
  end;
  if touched = 0 then perform _pass(label);
  else perform _fail(label, 'غيّر ' || touched || ' صفّاً وكان يجب ألّا يمسّ شيئاً');
  end if;
end $$;

create or replace function _act_as(p uuid) returns void
language plpgsql as $$ begin update _who set uid = p; end $$;

/* حالةُ العقد الآن — تُقرأ بصلاحية العنقود لا بصلاحية المتظاهر. */
create or replace function _state(c uuid) returns text
language sql security definer as $$
  select status::text from service_contracts where id = c $$;

-- ── الناس ─────────────────────────────────────────────────────────────────
-- `service_providers.owner_id` و`client_id` يشيران إلى `auth.users` لا إلى
-- `profiles`، فيُبذر الجدولان معاً — وإلّا فشل البذرُ على مفتاحٍ أجنبيّ قبل
-- أن يبلغ الفحصُ أوّلَ حارس.
insert into auth.users (id) values
  ('ad000000-0000-0000-0000-0000000000ad'),
  ('c1000000-0000-0000-0000-0000000000c1'),
  ('bb000000-0000-0000-0000-0000000000bb'),
  ('ff000000-0000-0000-0000-0000000000ff')
on conflict (id) do nothing;

insert into profiles (id, full_name, role) values
  ('ad000000-0000-0000-0000-0000000000ad', 'موظّف الإدارة',  'admin'),
  ('c1000000-0000-0000-0000-0000000000c1', 'العميل',        'investor'),
  ('bb000000-0000-0000-0000-0000000000bb', 'مقدّم الخدمة',   'investor'),
  ('ff000000-0000-0000-0000-0000000000ff', 'غريبٌ تماماً',   'investor')
on conflict (id) do nothing;

grant usage on schema public, auth to anon, authenticated;
grant select, insert, update, delete on all tables in schema public to anon, authenticated;
grant usage, select on all sequences in schema public to anon, authenticated;
grant execute on all functions in schema public, auth to anon, authenticated;

-- ── الأشياء ───────────────────────────────────────────────────────────────
-- تُبذر بصلاحية العنقود، لكن بهويّةِ الإدارة.
--
-- `guard_provider_verification` هو الحارسُ الوحيدُ في هذا المخطّط بلا مخرجٍ
-- لـ`auth.uid() is null`: يطلب `is_admin()` مطلقاً، فلا يستطيع حتّى مفتاحُ
-- الخدمة توثيقَ مقدّمٍ. فالبذرُ يتظاهر بالإدارة لا بالعدم — والفرقُ ليس
-- تفصيلاً في البوّابة، بل هو ما يعنيه أنّ التوثيق فعلٌ إداريٌّ مسجَّل.
do $$ begin perform _act_as('ad000000-0000-0000-0000-0000000000ad'); end $$;

insert into service_providers (id, owner_id, name, kind, verified_at, active) values
  ('b0000000-0000-0000-0000-0000000000b0',
   'bb000000-0000-0000-0000-0000000000bb', 'مكتب الجزيرة الهندسي',
   'engineering_office', now(), true);

do $$ begin perform _act_as(null); end $$;

insert into seasons (id, owner_id, name, crop_key, station_key, irrigation,
                     feddans, budget_per_feddan, planting_date)
values ('50000000-0000-0000-0000-000000000050',
        'c1000000-0000-0000-0000-0000000000c1', 'قمح ٢٠٢٦',
        'wheat', 'wad_medani', 'surface', 40, 75000, '2025-11-15');

-- عقدان: واحدٌ للرحلة الكاملة، وآخرُ للحالات التي تحتاج بدايةً نظيفة.
insert into service_contracts (id, season_id, provider_id, client_id, title) values
  ('cc000000-0000-0000-0000-0000000000c1',
   '50000000-0000-0000-0000-000000000050',
   'b0000000-0000-0000-0000-0000000000b0',
   'c1000000-0000-0000-0000-0000000000c1', 'إعداد الأرض والري'),
  ('cc000000-0000-0000-0000-0000000000c2',
   '50000000-0000-0000-0000-000000000050',
   'b0000000-0000-0000-0000-0000000000b0',
   'c1000000-0000-0000-0000-0000000000c1', 'عقدٌ ثانٍ للحالات الطرفيّة');

insert into contract_milestones (id, contract_id, seq, title, unit, quantity, unit_price) values
  ('11000000-0000-0000-0000-000000000011', 'cc000000-0000-0000-0000-0000000000c1',
   1, 'إعداد الأرض', 'feddan', 40, 5000),
  ('22000000-0000-0000-0000-000000000022', 'cc000000-0000-0000-0000-0000000000c1',
   2, 'شبكة الري',   'feddan', 40, 12000),
  ('33000000-0000-0000-0000-000000000033', 'cc000000-0000-0000-0000-0000000000c2',
   1, 'مرحلةٌ وحيدة', 'lump', 1, 1000);

\echo ''
\echo '=========================================================================='
\echo 'أ) الحالةُ الابتدائيّة — وما كان مكسوراً قبل هذه الهجرة'
\echo '=========================================================================='

do $$
declare v numeric;
begin
  perform _eq(_state('cc000000-0000-0000-0000-0000000000c1'), 'draft',
    'العقدُ يولد مسودّة');

  select total_amount into v from service_contracts
   where id = 'cc000000-0000-0000-0000-0000000000c1';
  perform _eq(v, 680000::numeric,
    'والإجماليُّ مشتقٌّ من المراحل — ٤٠×٥٠٠٠ + ٤٠×١٢٠٠٠');
end $$;

\echo ''
\echo '=========================================================================='
\echo 'ب) العرض — العميل يعرض، ومقدّمُ الخدمة لا يعرض على نفسه'
\echo '=========================================================================='

do $$ begin perform _act_as('bb000000-0000-0000-0000-0000000000bb'); end $$;
set role authenticated;

do $$
begin
  -- الصفُّ مرئيٌّ له (هو طرفٌ)، فالأمرُ يبلغ الزنادَ ويُرفع عليه خطأ.
  perform _refuses($q$
    update service_contracts set status = 'proposed'
     where id = 'cc000000-0000-0000-0000-0000000000c1'$q$,
    'مقدّمُ الخدمة لا يعرض العقدَ على نفسه');

  -- وهذه هي الثغرةُ التي كانت مفتوحة: القفزُ من المسودّة إلى السريان مباشرةً.
  perform _refuses($q$
    update service_contracts set status = 'active'
     where id = 'cc000000-0000-0000-0000-0000000000c1'$q$,
    'ولا يُفعّلها من المسودّة قفزاً — والخريطةُ لا تحوي هذا الانتقال');
end $$;

reset role;
do $$ begin perform _act_as('ff000000-0000-0000-0000-0000000000ff'); end $$;
set role authenticated;

do $$
begin
  -- والغريبُ لا يرى الصفَّ أصلاً، فالسياسةُ ترشّحه بلا خطأ — قياسٌ آخر تماماً.
  perform _changes_nothing($q$
    update service_contracts set status = 'proposed'
     where id = 'cc000000-0000-0000-0000-0000000000c1'$q$,
    'والغريبُ لا يمسّ العقدَ — ترشيحٌ صامتٌ لا خطأ');
end $$;

reset role;
do $$ begin perform _act_as('c1000000-0000-0000-0000-0000000000c1'); end $$;
set role authenticated;

do $$
begin
  perform _does($q$
    update service_contracts set status = 'proposed'
     where id = 'cc000000-0000-0000-0000-0000000000c1'$q$,
    'والعميلُ يعرضه');
  perform _eq(_state('cc000000-0000-0000-0000-0000000000c1'), 'proposed',
    'فصار معروضاً');
end $$;

\echo ''
\echo '=========================================================================='
\echo 'ج) الشروطُ تجمّدت لحظةَ العرض — وهذا هو بابُ المال'
\echo '=========================================================================='

do $$
begin
  perform _refuses($q$
    update contract_milestones set unit_price = 36000
     where id = '11000000-0000-0000-0000-000000000011'$q$,
    'العميلُ لا يخفض السعرَ بعد العرض');

  perform _refuses($q$
    update contract_milestones set quantity = 4
     where id = '11000000-0000-0000-0000-000000000011'$q$,
    'ولا يغيّر الكميّة');

  perform _refuses($q$
    delete from contract_milestones
     where id = '22000000-0000-0000-0000-000000000022'$q$,
    'ولا يحذف مرحلةً — وحذفُها يخفض الإجماليَّ بلا مساس بعمودٍ مجمَّد');

  perform _refuses($q$
    insert into contract_milestones (contract_id, seq, title, unit, quantity, unit_price)
    values ('cc000000-0000-0000-0000-0000000000c1', 9, 'مرحلةٌ مدسوسة',
            'lump', 1, 500000)$q$,
    'ولا يدسّ مرحلةً جديدة');
end $$;

reset role;
do $$ begin perform _act_as('bb000000-0000-0000-0000-0000000000bb'); end $$;
set role authenticated;

do $$
declare v numeric;
begin
  perform _refuses($q$
    update contract_milestones set unit_price = 36000
     where id = '11000000-0000-0000-0000-000000000011'$q$,
    'ومقدّمُ الخدمة لا يرفعه — وهو الاتّجاهُ الذي يكلّف العميل');

  select total_amount into v from service_contracts
   where id = 'cc000000-0000-0000-0000-0000000000c1';
  perform _eq(v, 680000::numeric, 'والإجماليُّ لم يتحرّك');
end $$;

\echo ''
\echo '=========================================================================='
\echo 'د) القبول — التوقيع، ومَن يملكه'
\echo '=========================================================================='

do $$
begin
  perform _does($q$
    update service_contracts set status = 'active'
     where id = 'cc000000-0000-0000-0000-0000000000c1'$q$,
    'مقدّمُ الخدمة يقبل');
  perform _eq(_state('cc000000-0000-0000-0000-0000000000c1'), 'active',
    'فصار سارياً');
end $$;

do $$
declare v timestamptz;
begin
  select signed_at into v from service_contracts
   where id = 'cc000000-0000-0000-0000-0000000000c1';
  perform _eq(v is not null, true, 'ووقتُ التوقيع مختومٌ من الزناد لا من الشاشة');
end $$;

-- والعميلُ على العقد الثاني: يعرض ثمّ يحاول التوقيعَ نيابةً عن الطرف الآخر.
reset role;
do $$ begin perform _act_as('c1000000-0000-0000-0000-0000000000c1'); end $$;
set role authenticated;

do $$
begin
  perform _does($q$
    update service_contracts set status = 'proposed'
     where id = 'cc000000-0000-0000-0000-0000000000c2'$q$,
    'والعميلُ يعرض عقدَه الثاني');
  perform _refuses($q$
    update service_contracts set status = 'active'
     where id = 'cc000000-0000-0000-0000-0000000000c2'$q$,
    'ثمّ لا يوقّع نيابةً عن مقدّم الخدمة — وهذا هو معنى أنّه اتّفاق');
  perform _does($q$
    update service_contracts set status = 'draft'
     where id = 'cc000000-0000-0000-0000-0000000000c2'$q$,
    'لكنّه يسحب عرضَه ليعدّله');
  perform _does($q$
    update contract_milestones set unit_price = 2000
     where id = '33000000-0000-0000-0000-000000000033'$q$,
    'وفي المسودّة يعود السعرُ قابلاً للتعديل — والتجميدُ ليس شللاً');
end $$;

\echo ''
\echo '=========================================================================='
\echo 'هـ) العملُ لا يتحرّك إلّا على عقدٍ سارٍ'
\echo '=========================================================================='

do $$
begin
  -- العقدُ الثاني مسودّةٌ الآن: لا مرحلةَ فيه تتحرّك.
  perform _refuses($q$
    update contract_milestones set status = 'in_progress'
     where id = '33000000-0000-0000-0000-000000000033'$q$,
    'لا تبدأ مرحلةٌ على عقدٍ لم يُتّفق عليه');
end $$;

reset role;
do $$ begin perform _act_as('bb000000-0000-0000-0000-0000000000bb'); end $$;
set role authenticated;

do $$
begin
  perform _does($q$
    update contract_milestones set status = 'in_progress'
     where id = '11000000-0000-0000-0000-000000000011'$q$,
    'وتبدأ على العقد الساري');
  perform _does($q$
    update contract_milestones set status = 'submitted'
     where id = '11000000-0000-0000-0000-000000000011'$q$,
    'ويسلّمها مقدّمُ الخدمة');
end $$;

\echo ''
\echo '=========================================================================='
\echo 'و) الإقفال — لا يُقفل عقدٌ ومراحلُه مفتوحة'
\echo '=========================================================================='

reset role;
do $$ begin perform _act_as('c1000000-0000-0000-0000-0000000000c1'); end $$;
set role authenticated;

do $$
begin
  perform _refuses($q$
    update service_contracts set status = 'completed'
     where id = 'cc000000-0000-0000-0000-0000000000c1'$q$,
    'لا يُقفل والمراحلُ لم تُعتمد');
end $$;

-- الاعتمادُ يحتاج دليلاً — وذاك حارسٌ آخر مفحوصٌ في بوّابته. فيُرفع هنا
-- بصلاحية العنقود لنصل إلى ما تفحصه هذه البوّابة: الإقفال.
reset role;
insert into milestone_evidence (milestone_id, kind, storage_path, created_by) values
  ('11000000-0000-0000-0000-000000000011', 'photo', 'x/1.jpg',
   'bb000000-0000-0000-0000-0000000000bb'),
  ('22000000-0000-0000-0000-000000000022', 'photo', 'x/2.jpg',
   'bb000000-0000-0000-0000-0000000000bb');

do $$ begin perform _act_as('c1000000-0000-0000-0000-0000000000c1'); end $$;
set role authenticated;

do $$
begin
  perform _does($q$
    update contract_milestones set status = 'approved'
     where id = '11000000-0000-0000-0000-000000000011'$q$,
    'العميلُ يعتمد الأولى');
  perform _does($q$
    update contract_milestones set status = 'approved'
     where id = '22000000-0000-0000-0000-000000000022'$q$,
    'ثمّ الثانية');
  perform _does($q$
    update service_contracts set status = 'completed'
     where id = 'cc000000-0000-0000-0000-0000000000c1'$q$,
    'فيُقفل العقد');
end $$;

\echo ''
\echo '=========================================================================='
\echo 'ز) المُقفَلُ لا يُعاد فتحه إلّا إداريّاً — والنزاعُ بابٌ لا يُغلق'
\echo '=========================================================================='

do $$
begin
  perform _refuses($q$
    update service_contracts set status = 'active'
     where id = 'cc000000-0000-0000-0000-0000000000c1'$q$,
    'العميلُ لا يعيد فتح المُقفَل');
  perform _does($q$
    update service_contracts set status = 'disputed'
     where id = 'cc000000-0000-0000-0000-0000000000c1'$q$,
    'لكنّه يعلن النزاعَ عليه');
end $$;

do $$
begin
  perform _refuses($q$
    update service_contracts set status = 'completed'
     where id = 'cc000000-0000-0000-0000-0000000000c1'$q$,
    'ولا يفضّ نزاعَه بنفسه');
end $$;

reset role;
do $$ begin perform _act_as('ad000000-0000-0000-0000-0000000000ad'); end $$;
set role authenticated;

do $$
begin
  perform _does($q$
    update service_contracts set status = 'completed'
     where id = 'cc000000-0000-0000-0000-0000000000c1'$q$,
    'والإدارةُ تفضّه');
  perform _refuses($q$
    update service_contracts set status = 'active'
     where id = 'cc000000-0000-0000-0000-0000000000c1'$q$,
    'ولا تقفز حتّى هي فوق الخريطة — من «منجز» إلى «سارٍ» لا وجودَ له');
end $$;

\echo ''
\echo '=========================================================================='
\echo 'ح) ولا يُعرض عقدٌ على مقدّم خدمةٍ غيرِ موثّق'
\echo '=========================================================================='

reset role;
-- والتوثيقُ حارسُه إداريّ (`guard_provider_verification`)، وهو يقرأ
-- `auth.uid()` لا دورَ الجلسة. فـ`reset role` وحده لا يكفي: تُمحى الهويّةُ
-- المتظاهَرُ بها أيضاً، وإلّا رفض الحارسُ بذرَ البوّابة.
do $$ begin perform _act_as('ad000000-0000-0000-0000-0000000000ad'); end $$;
update service_providers set verified_at = null
 where id = 'b0000000-0000-0000-0000-0000000000b0';

do $$ begin perform _act_as('c1000000-0000-0000-0000-0000000000c1'); end $$;
set role authenticated;

do $$
begin
  perform _refuses($q$
    update service_contracts set status = 'proposed'
     where id = 'cc000000-0000-0000-0000-0000000000c2'$q$,
    'سُحب التوثيقُ فامتنع العرض');
end $$;

reset role;
do $$ begin perform _act_as('ad000000-0000-0000-0000-0000000000ad'); end $$;
update service_providers set verified_at = now()
 where id = 'b0000000-0000-0000-0000-0000000000b0';

do $$ begin perform _act_as('c1000000-0000-0000-0000-0000000000c1'); end $$;
set role authenticated;

do $$
begin
  perform _does($q$
    update service_contracts set status = 'proposed'
     where id = 'cc000000-0000-0000-0000-0000000000c2'$q$,
    'وعاد التوثيقُ فعاد العرض');
end $$;

reset role;

\echo ''
do $$
declare f integer;
begin
  select fails into f from _score;
  if f = 0 then raise notice 'ALL CHECKS PASSED';
  else raise exception '% CHECK(S) FAILED', f;
  end if;
end $$;
