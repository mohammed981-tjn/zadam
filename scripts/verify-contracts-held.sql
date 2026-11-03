-- حرّاس العقود والتوثيق (20261103010000). كلّ حارسٍ مرّتين: صاحبُ الحقّ ينجح، وغيرُه يُردّ على النقلة نفسها.

\set ON_ERROR_STOP on
\set QUIET on
set client_min_messages = notice;

create table _score (fails integer not null default 0);
insert into _score values (0);
grant all on _score to authenticated;

create function _fail(label text, why text) returns void language plpgsql as $$
begin raise notice '  FAIL  % — %', label, why; update _score set fails = fails + 1; end $$;
create function _pass(label text) returns void language plpgsql as $$ begin raise notice '  PASS  %', label; end $$;
create function _eq(got anyelement, want anyelement, label text) returns void language plpgsql as $$
begin
  if got is not distinct from want then perform _pass(label);
  else perform _fail(label, 'جاء ' || coalesce(got::text, 'null') || ' والمتوقَّع ' || coalesce(want::text, 'null'));
  end if;
end $$;
/* ينجح ويمسّ صفّاً. */
create function _does(stmt text, label text) returns void language plpgsql as $$
declare n integer;
begin
  begin execute stmt; get diagnostics n = row_count;
  exception when others then perform _fail(label, 'رُفض: ' || sqlerrm); return; end;
  if n > 0 then perform _pass(label); else perform _fail(label, 'لم يمسّ صفّاً'); end if;
end $$;
/* يُرفض، والرسالة فيها ما يُنتظر. */
create function _refuses(stmt text, want text, label text) returns void language plpgsql as $$
begin
  begin execute stmt;
  exception when others then
    if sqlerrm like '%' || want || '%' then perform _pass(label);
    else perform _fail(label, 'رُفض بسببٍ آخر: ' || sqlerrm); end if;
    return;
  end;
  perform _fail(label, 'نُفِّذ وكان يجب أن يُرفض');
end $$;
/* لا يمسّ صفّاً (سياسة الصفوف ترشّح بلا خطأ) أو يُرفض. */
create function _changes_nothing(stmt text, label text) returns void language plpgsql as $$
declare n integer;
begin
  begin execute stmt; get diagnostics n = row_count;
  exception when others then perform _pass(label || ' (رُفض)'); return; end;
  if n = 0 then perform _pass(label); else perform _fail(label, 'غيّر ' || n || ' صفّاً'); end if;
end $$;
grant execute on all functions in schema public to authenticated;

-- Who is acting: the claims PostgREST would set (an administrator's session carries the second factor).
create function _as(p uuid, admin boolean default false) returns void language sql as $$
  select set_config('request.jwt.claims',
    case when p is null then '' else json_build_object('sub', p, 'role', 'authenticated', 'aal', case when admin then 'aal2' else 'aal1' end)::text end,
    false) $$;

-- ── الناس والأشياء (بصلاحيّة العنقود) ─────────────────────────────────────────
insert into auth.users (id) values
  ('ad000000-0000-0000-0000-0000000000ad'), ('c1000000-0000-0000-0000-0000000000c1'),
  ('bb000000-0000-0000-0000-0000000000bb'), ('ff000000-0000-0000-0000-0000000000ff'),
  ('0d000000-0000-0000-0000-00000000000d'), ('11000000-0000-0000-0000-000000000011'),
  ('12000000-0000-0000-0000-000000000012');
insert into profiles (id, full_name, role) values
  ('ad000000-0000-0000-0000-0000000000ad', 'المدير', 'admin'),
  ('c1000000-0000-0000-0000-0000000000c1', 'العميل', 'investor'),
  ('bb000000-0000-0000-0000-0000000000bb', 'مقدّم الخدمة', 'investor'),
  ('ff000000-0000-0000-0000-0000000000ff', 'غريب', 'investor'),
  ('0d000000-0000-0000-0000-00000000000d', 'صاحب الأرض', 'investor'),
  ('11000000-0000-0000-0000-000000000011', 'المستثمر', 'investor'),
  ('12000000-0000-0000-0000-000000000012', 'المستثمر الثاني', 'investor');

select _as('ad000000-0000-0000-0000-0000000000ad', true);
insert into service_providers (id, owner_id, name, kind, verified_at, active)
values ('b0000000-0000-0000-0000-0000000000b0', 'bb000000-0000-0000-0000-0000000000bb', 'مكتب الجزيرة', 'engineering_office', now(), true);
select _as(null);

insert into seasons (id, owner_id, name, crop_key, station_key, irrigation, feddans, planting_date) values
  ('5c000000-0000-0000-0000-0000000000c1', 'c1000000-0000-0000-0000-0000000000c1', 'قمح العميل', 'wheat', 'gezira', 'canal', 10, current_date),
  ('5c000000-0000-0000-0000-0000000000ff', 'ff000000-0000-0000-0000-0000000000ff', 'قمح الغريب', 'wheat', 'gezira', 'canal', 10, current_date);

\echo ''
\echo '── أ) العقد يُنشأ مسودّةً للعميل نفسه'
select _as('c1000000-0000-0000-0000-0000000000c1');
set role authenticated;
select _refuses($q$insert into service_contracts (season_id, provider_id, client_id, title, status)
  values ('5c000000-0000-0000-0000-0000000000c1', 'b0000000-0000-0000-0000-0000000000b0', 'c1000000-0000-0000-0000-0000000000c1', 'x', 'active')$q$,
  'يبدأ مسودّة', 'العميل لا يُدخل عقداً «سارياً» لم يقبله المقدّم');
select _refuses($q$insert into service_contracts (season_id, provider_id, client_id, title, status, signed_at)
  values ('5c000000-0000-0000-0000-0000000000c1', 'b0000000-0000-0000-0000-0000000000b0', 'c1000000-0000-0000-0000-0000000000c1', 'x', 'draft', now())$q$,
  'يبدأ مسودّة', 'ولا مسودّةً بتاريخ توقيع');
select _refuses($q$insert into service_contracts (season_id, provider_id, client_id, title)
  values ('5c000000-0000-0000-0000-0000000000ff', 'b0000000-0000-0000-0000-0000000000b0', 'c1000000-0000-0000-0000-0000000000c1', 'x')$q$,
  'موسمك أنت', 'ولا على موسم غيره');
select _does($q$insert into service_contracts (id, season_id, provider_id, client_id, title, total_amount)
  values ('cc000000-0000-0000-0000-0000000000c1', '5c000000-0000-0000-0000-0000000000c1', 'b0000000-0000-0000-0000-0000000000b0', 'c1000000-0000-0000-0000-0000000000c1', 'تحضير الأرض', 999999)$q$,
  'ومسودّته على موسمه تُنشأ');
reset role;
select _eq((select total_amount from service_contracts where id = 'cc000000-0000-0000-0000-0000000000c1'), 0::numeric, 'ومبلغها صفر مهما كُتب: هو مجموع المراحل');

select _as('bb000000-0000-0000-0000-0000000000bb');
set role authenticated;
select _refuses($q$insert into service_contracts (season_id, provider_id, client_id, title)
  values ('5c000000-0000-0000-0000-0000000000c1', 'b0000000-0000-0000-0000-0000000000b0', 'c1000000-0000-0000-0000-0000000000c1', 'x')$q$,
  'باسم غيرك', 'المقدّم لا يُنشئ عقداً باسم عميل');
reset role;

\echo ''
\echo '── ب) المرحلة تبدأ «لم تبدأ»'
select _as('c1000000-0000-0000-0000-0000000000c1');
set role authenticated;
select _refuses($q$insert into contract_milestones (contract_id, seq, title, unit, quantity, unit_price, status)
  values ('cc000000-0000-0000-0000-0000000000c1', 1, 'حرث', 'feddan', 10, 1000, 'paid')$q$,
  'تبدأ «لم تبدأ»', 'لا تُدخل مرحلةٌ «مدفوعة»');
select _refuses($q$insert into contract_milestones (contract_id, seq, title, unit, quantity, unit_price, approved_at)
  values ('cc000000-0000-0000-0000-0000000000c1', 1, 'حرث', 'feddan', 10, 1000, now())$q$,
  'تبدأ «لم تبدأ»', 'ولا باعتمادٍ مكتوبٍ بيد');
select _does($q$insert into contract_milestones (id, contract_id, seq, title, unit, quantity, unit_price, requires_evidence)
  values ('aa000000-0000-0000-0000-0000000000a1', 'cc000000-0000-0000-0000-0000000000c1', 1, 'حرث', 'feddan', 10, 1000, false)$q$,
  'والمرحلة العاديّة تُضاف');
reset role;
select _eq((select total_amount from service_contracts where id = 'cc000000-0000-0000-0000-0000000000c1'), 10000::numeric, 'ومبلغ العقد صار مجموعها، بالمزامنة وحدها');

select _as('c1000000-0000-0000-0000-0000000000c1');
set role authenticated;
select _does($q$update service_contracts set status = 'proposed' where id = 'cc000000-0000-0000-0000-0000000000c1'$q$, 'العميل يعرض العقد');
reset role;
select _as('bb000000-0000-0000-0000-0000000000bb');
set role authenticated;
select _does($q$update service_contracts set status = 'active' where id = 'cc000000-0000-0000-0000-0000000000c1'$q$, 'والمقدّم يقبله');
reset role;
select _eq((select signed_at is not null from service_contracts where id = 'cc000000-0000-0000-0000-0000000000c1'), true, 'وتاريخ التوقيع كُتب عند القبول');

\echo ''
\echo '── ج) العقد الموقَّع لا تتغيّر شروطه'
select _as('c1000000-0000-0000-0000-0000000000c1');
set role authenticated;
select _refuses($q$update service_contracts set total_amount = 1 where id = 'cc000000-0000-0000-0000-0000000000c1'$q$, 'مجموع مراحله', 'العميل لا يُنقص المبلغ');
select _refuses($q$update service_contracts set currency = 'USD' where id = 'cc000000-0000-0000-0000-0000000000c1'$q$, 'لا تتغيّر', 'ولا يغيّر العملة');
select _refuses($q$update service_contracts set signed_at = now() - interval '1 year' where id = 'cc000000-0000-0000-0000-0000000000c1'$q$, 'تاريخ توقيع', 'ولا تاريخ التوقيع');
select _refuses($q$update service_contracts set title = 'آخر' where id = 'cc000000-0000-0000-0000-0000000000c1'$q$, 'عنوان العقد', 'ولا العنوان بعد العرض');
reset role;
select _as('bb000000-0000-0000-0000-0000000000bb');
set role authenticated;
select _refuses($q$update service_contracts set total_amount = 50000000 where id = 'cc000000-0000-0000-0000-0000000000c1'$q$, 'مجموع مراحله', 'المقدّم لا يرفع المبلغ');
select _refuses($q$update service_contracts set client_id = 'ff000000-0000-0000-0000-0000000000ff' where id = 'cc000000-0000-0000-0000-0000000000c1'$q$, 'لا تتغيّر', 'ولا ينقل العقد إلى عميلٍ آخر');
reset role;

\echo ''
\echo '── د) المرحلة: لكلّ نقلةٍ صاحبها، ولا رجوع عن الاعتماد'
select _as('c1000000-0000-0000-0000-0000000000c1');
set role authenticated;
select _refuses($q$update contract_milestones set status = 'in_progress' where id = 'aa000000-0000-0000-0000-0000000000a1'$q$, 'مقدّم الخدمة', 'العميل لا يبدأ المرحلة عن المقدّم');
reset role;
select _as('bb000000-0000-0000-0000-0000000000bb');
set role authenticated;
select _does($q$update contract_milestones set status = 'in_progress' where id = 'aa000000-0000-0000-0000-0000000000a1'$q$, 'المقدّم يبدأها');
select _does($q$update contract_milestones set status = 'submitted' where id = 'aa000000-0000-0000-0000-0000000000a1'$q$, 'ويسلّمها');
select _refuses($q$update contract_milestones set status = 'approved' where id = 'aa000000-0000-0000-0000-0000000000a1'$q$, 'العميل', 'ولا يعتمدها لنفسه');
reset role;
select _as('c1000000-0000-0000-0000-0000000000c1');
set role authenticated;
select _does($q$update contract_milestones set status = 'approved' where id = 'aa000000-0000-0000-0000-0000000000a1'$q$, 'العميل يعتمدها');
select _does($q$update contract_milestones set status = 'paid' where id = 'aa000000-0000-0000-0000-0000000000a1'$q$, 'ويسجّل دفعها');
select _refuses($q$update contract_milestones set status = 'approved' where id = 'aa000000-0000-0000-0000-0000000000a1'$q$, 'لا تعود إلى الوراء', 'ولا يرجعها من «مدفوعة»');
reset role;
select _as('bb000000-0000-0000-0000-0000000000bb');
set role authenticated;
select _refuses($q$update contract_milestones set status = 'submitted' where id = 'aa000000-0000-0000-0000-0000000000a1'$q$, 'لا تعود إلى الوراء', 'والمقدّم لا يمحو الدفع بإرجاعها (money-logic-8)');
reset role;

-- A second contract of the provider's, to splice into.
select _as('c1000000-0000-0000-0000-0000000000c1');
set role authenticated;
select _does($q$insert into service_contracts (id, season_id, provider_id, client_id, title)
  values ('cc000000-0000-0000-0000-0000000000c2', '5c000000-0000-0000-0000-0000000000c1', 'b0000000-0000-0000-0000-0000000000b0', 'c1000000-0000-0000-0000-0000000000c1', 'مسودّة ثانية')$q$, 'مسودّةٌ ثانية');
select _does($q$insert into contract_milestones (id, contract_id, seq, title, unit, quantity, unit_price)
  values ('aa000000-0000-0000-0000-0000000000a2', 'cc000000-0000-0000-0000-0000000000c2', 1, 'ري', 'feddan', 10, 500)$q$, 'ومرحلتها');
select _refuses($q$update contract_milestones set contract_id = 'cc000000-0000-0000-0000-0000000000c1' where id = 'aa000000-0000-0000-0000-0000000000a2'$q$, 'عقدٍ آخر', 'المرحلة لا تُنقل إلى العقد الساري (db-a-1)');
reset role;

\echo ''
\echo '── هـ) لا يُحذف عقدٌ بعد أن عُرض، ولا معه موسمه'
select _as('c1000000-0000-0000-0000-0000000000c1');
set role authenticated;
select _refuses($q$delete from service_contracts where id = 'cc000000-0000-0000-0000-0000000000c1'$q$, 'لا يُحذف عقدٌ', 'العميل لا يمحو العقد الساري بمراحله ودفعاته');
select _refuses($q$delete from seasons where id = '5c000000-0000-0000-0000-0000000000c1'$q$, 'لا يُحذف عقدٌ', 'ولا يمحوه بحذف الموسم (db-a-2)');
select _does($q$delete from service_contracts where id = 'cc000000-0000-0000-0000-0000000000c2'$q$, 'والمسودّة تُحذف (تراجع الإنشاء)');
reset role;
select _as('ff000000-0000-0000-0000-0000000000ff');
set role authenticated;
select _changes_nothing($q$delete from service_contracts where id = 'cc000000-0000-0000-0000-0000000000c1'$q$, 'والغريب لا يرى العقد أصلاً');
reset role;
select _eq((select count(*)::int from contract_milestones where contract_id = 'cc000000-0000-0000-0000-0000000000c1'), 1, 'والعقد الساري ما زال بمرحلته المدفوعة');

select _as('ad000000-0000-0000-0000-0000000000ad', true);
set role authenticated;
select _does($q$update contract_milestones set status = 'approved' where id = 'aa000000-0000-0000-0000-0000000000a1'$q$, 'والإدارة تفصل في النزاع فتُرجع المرحلة');
reset role;

\echo ''
\echo '── و) التوثيق بعد فتح المستندات، ولا يوثّق المدير أرضه'
select _as(null);
insert into lands (id, owner_id, name, state, feddans, station_key, water_source, verification) values
  ('1a000000-0000-0000-0000-0000000000a1', '0d000000-0000-0000-0000-00000000000d', 'أرض صاحب الأرض', 'الجزيرة', 10, 'gezira', 'canal', 'submitted'),
  ('1a000000-0000-0000-0000-0000000000a2', 'ad000000-0000-0000-0000-0000000000ad', 'أرض المدير', 'الجزيرة', 4, 'gezira', 'canal', 'submitted');
insert into land_documents (id, land_id, kind, storage_path) values
  ('d0000000-0000-0000-0000-0000000000d1', '1a000000-0000-0000-0000-0000000000a1', 'tenure', '0d000000-0000-0000-0000-00000000000d/tenure.pdf'),
  ('d0000000-0000-0000-0000-0000000000d2', '1a000000-0000-0000-0000-0000000000a1', 'photo',  '0d000000-0000-0000-0000-00000000000d/photo.jpg'),
  ('d0000000-0000-0000-0000-0000000000d3', '1a000000-0000-0000-0000-0000000000a2', 'tenure', 'ad000000-0000-0000-0000-0000000000ad/tenure.pdf');

select _as('0d000000-0000-0000-0000-00000000000d');
set role authenticated;
select _refuses($q$select land_document_open('d0000000-0000-0000-0000-0000000000d1')$q$, 'للإدارة', 'غير المدير لا يفتح المستند بهذه الدالّة');
select _refuses($q$update lands set verified_feddans = 100 where id = '1a000000-0000-0000-0000-0000000000a1'$q$, 'عند التوثيق وحده', 'ولا يكتب صاحب الأرض مساحةً «موثّقة»');
reset role;

select _as('ad000000-0000-0000-0000-0000000000ad', true);
set role authenticated;
select _refuses($q$update lands set verification = 'verified' where id = '1a000000-0000-0000-0000-0000000000a1'$q$, 'بقي 2', 'المدير لا يوثّق أرضاً لم يفتح مستنداتها');
select _eq(land_document_open('d0000000-0000-0000-0000-0000000000d1'), '0d000000-0000-0000-0000-00000000000d/tenure.pdf', 'فتح المستند يعطي مساره');
select _refuses($q$update lands set verification = 'verified' where id = '1a000000-0000-0000-0000-0000000000a1'$q$, 'بقي 1', 'ولا بعد فتح بعضها');
select _eq(land_document_open('d0000000-0000-0000-0000-0000000000d2'), '0d000000-0000-0000-0000-00000000000d/photo.jpg', 'ويفتح الثاني');
select _does($q$update lands set verification = 'verified' where id = '1a000000-0000-0000-0000-0000000000a1'$q$, 'فيوثّقها بعد فتحها كلّها');
select _eq(land_document_open('d0000000-0000-0000-0000-0000000000d3') is not null, true, 'ويفتح مستند أرضه');
select _refuses($q$update lands set verification = 'verified' where id = '1a000000-0000-0000-0000-0000000000a2'$q$, 'أرضاً يملكها', 'لكنّه لا يوثّق أرضاً يملكها (data-quality-5)');
reset role;
select _eq((select verified_by from lands where id = '1a000000-0000-0000-0000-0000000000a1'), 'ad000000-0000-0000-0000-0000000000ad'::uuid, 'ويُحفظ من وثّق');
select _eq((select verified_feddans from lands where id = '1a000000-0000-0000-0000-0000000000a1'), 10::numeric, 'وبأيّ مساحة');
select _eq((select count(*)::int from land_document_views), 3, 'وكلّ فتحٍ مسجَّل');

\echo ''
\echo '── ز) الشراكة على المساحة الموثّقة، ولا تنقص الأرض عمّا وُقّع'
select _as(null);
insert into investor_interests (id, investor_id, land_id, model, message, status) values
  ('1e000000-0000-0000-0000-0000000000e1', '11000000-0000-0000-0000-000000000011', '1a000000-0000-0000-0000-0000000000a1', 'lease', 'أريد استئجار الأرض لموسم الشتاء', 'accepted'),
  ('1e000000-0000-0000-0000-0000000000e2', '12000000-0000-0000-0000-000000000012', '1a000000-0000-0000-0000-0000000000a1', 'lease', 'أريد استئجار بقيّة الأرض أيضاً', 'accepted');
insert into partnership_agreements (id, interest_id, land_id, owner_id, investor_id, model, terms, terms_hash, status, signed_at) values
  ('a9000000-0000-0000-0000-0000000000a1', '1e000000-0000-0000-0000-0000000000e1', '1a000000-0000-0000-0000-0000000000a1',
   '0d000000-0000-0000-0000-00000000000d', '11000000-0000-0000-0000-000000000011', 'lease',
   jsonb_build_object('feddans', 6, 'start_date', current_date - 10, 'end_date', current_date + 150), 'h1', 'signed', now());
insert into partnership_agreements (id, interest_id, land_id, owner_id, investor_id, model, terms, terms_hash) values
  ('a9000000-0000-0000-0000-0000000000a2', '1e000000-0000-0000-0000-0000000000e2', '1a000000-0000-0000-0000-0000000000a1',
   '0d000000-0000-0000-0000-00000000000d', '12000000-0000-0000-0000-000000000012', 'lease',
   jsonb_build_object('feddans', 4, 'start_date', current_date, 'end_date', current_date + 120), 'h2');

select _as('0d000000-0000-0000-0000-00000000000d');
set role authenticated;
select _refuses($q$update lands set feddans = 5 where id = '1a000000-0000-0000-0000-0000000000a1'$q$, 'على 6 فداناً', 'صاحب الأرض لا ينقص المساحة عمّا وُقّع عليه');
select _does($q$update lands set feddans = 20 where id = '1a000000-0000-0000-0000-0000000000a1'$q$, 'ويرفعها (فتعود الأرض إلى المراجعة)');
select _refuses($q$select partnership_agreement_sign('a9000000-0000-0000-0000-0000000000a2', 1, 'h2', 'صاحب الأرض', 'sig', 'ua')$q$,
  'ليست موثّقةً الآن', 'ولا يوقّع على أرضٍ عادت إلى المراجعة (money-logic-2)');
reset role;
select _eq((select verified_feddans from lands where id = '1a000000-0000-0000-0000-0000000000a1'), 10::numeric, 'والمساحة الموثّقة بقيت 10 لا 20');

\echo ''
do $$
declare f integer;
begin
  select fails into f from _score;
  if f = 0 then raise notice 'ALL CHECKS PASSED';
  else raise exception '% CHECK(S) FAILED', f;
  end if;
end $$;
