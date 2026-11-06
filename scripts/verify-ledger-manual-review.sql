-- بوّابةُ القيد اليدويّ والمراجعة (البند ٢٠٥؛ الهجرة 20261106070000_ledger_manual_review.sql).
-- على السلسلة الكاملة وبالهويّة كما يضعها PostgREST: القيد غير المتوازن يُرفض؛ والغريب يُرفض؛ وقيد المُعِدّ لا يُرحَّل
-- حتى يعتمده صاحب الدفتر؛ والردّ يُسجَّل؛ وسجلّ التدقيق لا يُعدَّل ولا يُحذف ولو بمفتاح الخدمة أو المدير؛ والفترة المقفلة
-- ترفض القيد ولا يفتحها إلا المدير بسبب؛ وقيد الإقفال يصفّر الإيراد والمصروف في الأرباح المحتجزة ولا يتكرّر؛ والقيود
-- الجاهزة تُرحَّل متوازنة؛ وتقرير الاستثناءات يجد كلّ نوع.

\set ON_ERROR_STOP on
\set QUIET on
set client_min_messages = notice;
\o /dev/null

create table _score (fails integer not null default 0, passes integer not null default 0);
insert into _score values (0, 0);
grant all on _score to authenticated, anon, service_role;
create table _ids (k text primary key, v uuid);
grant all on _ids to authenticated, anon, service_role;

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
create function _as(p uuid, p_aal text default 'aal1') returns void language sql as $$
  select set_config('request.jwt.claims',
    case when p is null then '' else json_build_object('sub', p, 'role', 'authenticated', 'aal', p_aal)::text end, false) $$;
create function _set(k text, v uuid) returns uuid language sql as $$
  insert into _ids values (k, v) on conflict (k) do update set v = excluded.v returning v $$;
create function _id(k text) returns uuid language sql stable as $$ select v from _ids where k = $1 $$;
/* سطرٌ بحسابه (رمزٍ أو مفتاح)، بالدولار. */
create function _l(acc text, side text, minor bigint, cur text default 'USD', season uuid default null) returns jsonb
language sql immutable as $$
  select case when acc ~ '^[0-9]+$' then jsonb_build_object('account', acc) else jsonb_build_object('key', acc) end
         || jsonb_build_object('side', side, 'currency', cur, 'minor', minor)
         || case when season is null then '{}'::jsonb else jsonb_build_object('season', season) end $$;
/* العدّ بصلاحيّة العنقود: ما في الجداول فعلاً، لا ما تسمح السياسات للسائل برؤيته. */
create function _n(q text) returns bigint language plpgsql security definer as $$
declare n bigint; begin execute q into n; return n; end $$;
create function _t(q text) returns text language plpgsql security definer as $$
declare v text; begin execute q into v; return v; end $$;
grant execute on function _fail(text, text), _pass(text), _eq(anyelement, anyelement, text), _refuses(text, text, text),
  _as(uuid, text), _set(text, uuid), _id(text), _l(text, text, bigint, text, uuid), _n(text), _t(text)
  to authenticated, anon, service_role;

-- ── الناس (بصلاحيّة العنقود) ─────────────────────────────────────────────────
-- f1 صاحب الدفتر · f2 مزارعٌ للإقفال · f3 مزارعٌ للاستثناءات · e9 غريب · ac محاسب · a1 وكيلٌ له إذن · ad مدير
insert into auth.users (id, email) values
  ('f1000000-0000-0000-0000-0000000000f1', 'f1@example.com'), ('f2000000-0000-0000-0000-0000000000f2', 'f2@example.com'),
  ('f3000000-0000-0000-0000-0000000000f3', 'f3@example.com'), ('e9000000-0000-0000-0000-0000000000e9', 'e9@example.com'),
  ('ac000000-0000-0000-0000-0000000000ac', 'p249912345678@phone.invalid'), ('a1000000-0000-0000-0000-0000000000a1', 'agent@example.com'),
  ('ad000000-0000-0000-0000-0000000000ad', 'admin@example.com');
insert into profiles (id, full_name, role, phone) values
  ('f1000000-0000-0000-0000-0000000000f1', 'صاحب الدفتر', 'investor', '0911000001'),
  ('f2000000-0000-0000-0000-0000000000f2', 'مزارعٌ ثانٍ', 'investor', '0911000002'),
  ('f3000000-0000-0000-0000-0000000000f3', 'مزارعٌ ثالث', 'investor', '0911000003'),
  ('e9000000-0000-0000-0000-0000000000e9', 'غريب', 'investor', '0911000009'),
  ('ac000000-0000-0000-0000-0000000000ac', 'المحاسب', 'investor', '0912345678'),
  ('a1000000-0000-0000-0000-0000000000a1', 'الوكيل', 'investor', '0911000011'),
  ('ad000000-0000-0000-0000-0000000000ad', 'مدير', 'admin', '0911000099')
on conflict (id) do update set role = excluded.role, full_name = excluded.full_name, phone = excluded.phone;

insert into partner_companies (id, owner_id, name, kinds, states, contact_name, phone, verified_at, active) values
  ('7a000000-0000-0000-0000-00000000007a', 'a1000000-0000-0000-0000-0000000000a1', 'جمعيّة المزارعين', array['extension'], array['سنار'], 'فلان', '0900000001', now(), true);
insert into agent_mandates (id, company_id, farmer_id, scopes, note, phone_tail, status, requested_by, answered_at) values
  ('3a000000-0000-0000-0000-00000000003a', '7a000000-0000-0000-0000-00000000007a', 'f1000000-0000-0000-0000-0000000000f1',
   array['seasons'], 'نتابع موسمك ونرفع أدلّته عنك', '0001', 'active', 'a1000000-0000-0000-0000-0000000000a1', now());

insert into seasons (id, owner_id, name, crop_key, station_key, irrigation, feddans, planting_date) values
  ('52000000-0000-0000-0000-000000000052', 'f2000000-0000-0000-0000-0000000000f2', 'موسم السمسم', 'sesame', 'sennar', 'rainfed', 5, '2026-07-01');

-- الملفّات المرفوعة (كما يرفعها المتصفّح إلى مجلّد صاحبها).
insert into storage.objects (bucket_id, name) values
  ('evidence', 'f1000000-0000-0000-0000-0000000000f1/ledger/invoice-1.jpg'),
  ('evidence', 'ac000000-0000-0000-0000-0000000000ac/ledger/receipt-7.pdf'),
  ('evidence', 'f1000000-0000-0000-0000-0000000000f1/stages/photo.jpg');

\o
\echo 'أ) الجداول: سياسة صفوفٍ لكلٍّ منها، ولا كتابة مباشرة لأحد، والدوالّ الداخليّة مغلقة'
\o /dev/null
do $$
declare t text; r text;
begin
  foreach t in array array['ledger_entry_templates', 'ledger_book_settings', 'ledger_preparers', 'ledger_drafts',
                           'ledger_entry_meta', 'ledger_closings', 'ledger_period_reopens', 'ledger_audit_log'] loop
    perform _eq((select relrowsecurity from pg_class where oid = ('public.' || t)::regclass), true, t || ': سياسة الصفوف مفعّلة');
    foreach r in array array['anon', 'authenticated', 'service_role'] loop
      perform _eq(has_table_privilege(r, 'public.' || t, 'INSERT') or has_table_privilege(r, 'public.' || t, 'UPDATE')
                  or has_table_privilege(r, 'public.' || t, 'DELETE') or has_table_privilege(r, 'public.' || t, 'TRUNCATE'),
                  false, t || ': لا كتابة مباشرة لـ ' || r);
    end loop;
  end loop;
  foreach r in array array['authenticated', 'service_role', 'anon'] loop
    perform _eq(has_function_privilege(r, 'public._ledger_post_manual(uuid, date, text, jsonb, text, numeric, text, text, text, text, uuid, uuid)', 'execute'),
                false, 'النشر الداخليّ مغلقٌ على ' || r);
    perform _eq(has_function_privilege(r, 'public._ledger_audit(uuid, text, uuid, uuid, jsonb, jsonb, uuid)', 'execute'),
                false, 'وكتابة السجلّ مغلقةٌ على ' || r);
    perform _eq(has_function_privilege(r, 'public._ledger_dry_run(uuid, date, text, jsonb, numeric)', 'execute'),
                false, 'والتجربة مغلقةٌ على ' || r);
    perform _eq(has_function_privilege(r, 'public._ledger_post_src(uuid, date, text, jsonb, text, numeric, text, uuid, uuid, uuid, text)', 'execute'),
                false, 'ودالّة المحرّك مغلقةٌ على ' || r);
  end loop;
  perform _eq(has_function_privilege('anon', 'public.ledger_entry_submit(uuid, date, text, jsonb, text, numeric, text, text, text, text)', 'execute'),
              false, 'الزائر لا يكتب قيداً');
  perform _eq(has_function_privilege('service_role', 'public.ledger_entry_submit(uuid, date, text, jsonb, text, numeric, text, text, text, text)', 'execute'),
              false, 'ومفتاح الخدمة لا يكتب قيداً يدويّاً (لا أحد يكتبه)');
  perform _eq(has_function_privilege('authenticated', 'public.ledger_entry_submit(uuid, date, text, jsonb, text, numeric, text, text, text, text)', 'execute'),
              true, 'والمسجَّل ينادي دالّة القيد');
  perform _eq((select prosecdef from pg_proc where oid = 'public.ledger_entry_submit(uuid, date, text, jsonb, text, numeric, text, text, text, text)'::regprocedure),
              true, 'وهي SECURITY DEFINER');
  perform _eq((select proconfig::text like '%search_path=public%' from pg_proc
                where oid = 'public.ledger_entry_submit(uuid, date, text, jsonb, text, numeric, text, text, text, text)'::regprocedure),
              true, 'وبمسار بحثٍ ثابت');
end $$;

\o
\echo 'ب) صاحب الدفتر يكتب قيده: المتوازن يُرحَّل، وغير المتوازن يُرفض بقواعد المحرّك'
\o /dev/null
set role authenticated;
select _as('f1000000-0000-0000-0000-0000000000f1');
do $$
declare b uuid; r jsonb; n0 bigint;
begin
  b := _set('F', ledger_open_book('farm'));
  r := ledger_entry_submit(b, ledger_today(), 'شراء بذور نقداً',
         jsonb_build_array(_l('5110', 'D', 25000), _l('1110', 'C', 25000)), 'k-b-0001');
  perform _eq(r ->> 'status', 'posted', 'قيدٌ متوازن من صاحبه يُرحَّل في الحال');
  perform _set('E1', (r ->> 'entry_id')::uuid);
  perform _eq(_n(format('select count(*) from journal_lines where entry_id = %L', r ->> 'entry_id')), 2::bigint, 'بسطرين');
  perform _eq(_t(format('select kind || ''/'' || via from ledger_entry_meta where entry_id = %L', r ->> 'entry_id')), 'manual/web',
              'ومعه ما يُعرف عنه: يدويّ، من الموقع');
  perform _eq((ledger_entry_submit(b, ledger_today(), 'شراء بذور نقداً',
                 jsonb_build_array(_l('5110', 'D', 25000), _l('1110', 'C', 25000)), 'k-b-0001') ->> 'entry_id')::uuid,
              _id('E1'), 'وإرساله مرّةً ثانية بالمفتاح نفسه يُرجع القيد نفسه');
  n0 := _n(format('select count(*) from journal_entries where book_id = %L', b));
  perform _refuses(format($q$select ledger_entry_submit(%L, ledger_today(), 'غير متوازن',
                     jsonb_build_array(_l('5110', 'D', 1000), _l('1110', 'C', 900)), 'k-b-0002')$q$, b),
                   'قيدٌ مدينه ١٠ ودائنه ٩ يُرفض', 'غير متوازن');
  perform _refuses(format($q$select ledger_entry_submit(%L, ledger_today(), 'سطرٌ واحد',
                     jsonb_build_array(_l('5110', 'D', 1000)), 'k-b-0003')$q$, b),
                   'وقيدٌ بسطرٍ واحد', 'سطرين');
  perform _refuses(format($q$select ledger_entry_submit(%L, ledger_today(), 'جنيه بلا سعر',
                     jsonb_build_array(_l('5110', 'D', 500000, 'SDG'), _l('1110', 'C', 500000, 'SDG')), 'k-b-0004')$q$, b),
                   'وقيدٌ بالجنيه بلا سعرٍ مكتوب ولا منشور', 'لا سعر صرفٍ منشوراً');
  perform _refuses(format($q$select ledger_entry_submit(%L, ledger_today(), 'حساب تجميعيّ',
                     jsonb_build_array(_l('11', 'D', 1000), _l('1110', 'C', 1000)), 'k-b-0005')$q$, b),
                   'وقيدٌ على حسابٍ تجميعيّ', 'تجميعيّ');
  perform _refuses(format($q$select ledger_entry_submit(%L, ledger_today(), '  ',
                     jsonb_build_array(_l('5110', 'D', 1000), _l('1110', 'C', 1000)), 'k-b-0006')$q$, b),
                   'وقيدٌ بلا بيان', 'اكتب بيان القيد');
  perform _refuses(format($q$select ledger_entry_submit(%L, ledger_today() + 5, 'في المستقبل',
                     jsonb_build_array(_l('5110', 'D', 1000), _l('1110', 'C', 1000)), 'k-b-0007')$q$, b),
                   'وقيدٌ بتاريخٍ في المستقبل', 'المستقبل');
  perform _refuses(format($q$select ledger_entry_submit(%L, ledger_today(), 'قالب مجهول',
                     jsonb_build_array(_l('5110', 'D', 1000), _l('1110', 'C', 1000)), 'k-b-0008', null, 'manual', 'nothing_here')$q$, b),
                   'وقيدٌ جاهز غير معروف', 'قيدٌ جاهز غير معروف');
  perform _eq(_n(format('select count(*) from journal_entries where book_id = %L', b)), n0, 'ولم يُكتب شيءٌ ممّا رُفض');
  r := ledger_entry_submit(b, ledger_today(), 'بذور بالجنيه بسعرٍ مكتوب',
         jsonb_build_array(_l('5110', 'D', 600000, 'SDG'), _l('1110', 'C', 600000, 'SDG')), 'k-b-0009', 2400, 'manual', null, null, 'app');
  perform _eq(r ->> 'status', 'posted', 'وبالجنيه بسعرٍ مكتوب يُرحَّل');
  perform _eq(_n(format('select sum(base_minor) from journal_lines where entry_id = %L and side = ''D''', r ->> 'entry_id')),
              250::bigint, 'ومعادله بالدولار من السعر (٦٠٠٠ جنيه ÷ ٢٤٠٠ = ٢٫٥٠ دولار)');
  perform _eq(_t(format('select via from ledger_entry_meta where entry_id = %L', r ->> 'entry_id')), 'app', 'ومن التطبيق يُسجَّل أنّه من التطبيق');
end $$;

\o
\echo 'ج) المستند: من مجلّد الكاتب، ومرفوعٌ فعلاً'
\o /dev/null
do $$
declare b uuid := _id('F'); r jsonb;
begin
  perform _refuses(format($q$select ledger_entry_submit(%L, ledger_today(), 'مستند غيري',
                     jsonb_build_array(_l('5120', 'D', 1000), _l('1110', 'C', 1000)), 'k-c-0001', null, 'manual', null,
                     'ac000000-0000-0000-0000-0000000000ac/ledger/receipt-7.pdf')$q$, b),
                   'مستندٌ في مجلّد غيري يُرفض', 'ليس في مجلّدك');
  perform _refuses(format($q$select ledger_entry_submit(%L, ledger_today(), 'مستند في غير مجلّده',
                     jsonb_build_array(_l('5120', 'D', 1000), _l('1110', 'C', 1000)), 'k-c-0002', null, 'manual', null,
                     'f1000000-0000-0000-0000-0000000000f1/stages/photo.jpg')$q$, b),
                   'ومستندٌ خارج مجلّد الدفتر', 'ليس في مجلّدك');
  perform _refuses(format($q$select ledger_entry_submit(%L, ledger_today(), 'مستند لم يُرفع',
                     jsonb_build_array(_l('5120', 'D', 1000), _l('1110', 'C', 1000)), 'k-c-0003', null, 'manual', null,
                     'f1000000-0000-0000-0000-0000000000f1/ledger/missing.jpg')$q$, b),
                   'ومستندٌ لم يُرفع', 'لم نجد الملفّ');
  r := ledger_entry_submit(b, ledger_today(), 'سماد بفاتورته',
         jsonb_build_array(_l('5120', 'D', 1000), _l('1110', 'C', 1000)), 'k-c-0004', null, 'manual', null,
         'f1000000-0000-0000-0000-0000000000f1/ledger/invoice-1.jpg');
  perform _eq(_t(format('select document_path from ledger_entry_meta where entry_id = %L', r ->> 'entry_id')),
              'f1000000-0000-0000-0000-0000000000f1/ledger/invoice-1.jpg', 'ومستندٌ في مجلّد الدفتر يُرفق بقيده');
  perform _eq(ledger_document_readable('f1000000-0000-0000-0000-0000000000f1/ledger/invoice-1.jpg'), true, 'ويقرؤه صاحب الدفتر');
end $$;
select _as('e9000000-0000-0000-0000-0000000000e9');
do $$ begin
  perform _eq(ledger_document_readable('f1000000-0000-0000-0000-0000000000f1/ledger/invoice-1.jpg'), false, 'ولا يقرؤه الغريب');
end $$;

\o
\echo 'د) الغريب: لا يكتب في دفترٍ ليس له ولا يقرأ منه شيئاً'
\o /dev/null
do $$
declare b uuid := _id('F');
begin
  perform _refuses(format($q$select ledger_entry_submit(%L, ledger_today(), 'من غريب',
                     jsonb_build_array(_l('5110', 'D', 1000), _l('1110', 'C', 1000)), 'k-d-0001')$q$, b),
                   'الغريب لا يكتب قيداً', 'ليس هذا دفترك');
  perform _refuses(format($q$select * from ledger_preparer_chart(%L)$q$, b), 'ولا يقرأ شجرة الحسابات', 'ليس هذا دفترك');
  perform _refuses(format($q$select ledger_period_close(%L, ledger_today() - 1)$q$, b), 'ولا يقفل الفترة', 'ليس هذا دفترك');
  perform _refuses(format($q$select ledger_close_income(%L, ledger_today() - 1)$q$, b), 'ولا يكتب قيد الإقفال', 'ليس هذا دفترك');
  perform _refuses(format($q$select ledger_review_set(%L, true)$q$, b), 'ولا يغيّر إعداد المراجعة', 'ليس هذا دفترك');
  perform _refuses(format($q$select ledger_preparer_invite(%L, '0912345678')$q$, b), 'ولا يدعو مُعِدّاً', 'ليس هذا دفترك');
  perform _eq((select count(*) from ledger_audit_log where book_id = b), 0::bigint, 'ولا يرى سجلّ تدقيقه');
  perform _eq((select count(*) from ledger_exceptions(b)), 0::bigint, 'ولا استثناءاته');
  perform _eq((select count(*) from ledger_entry_meta where book_id = b), 0::bigint, 'ولا ما يُعرف عن قيوده');
end $$;

\o
\echo 'هـ) المحاسب المُعِدّ: قيده لا يُرحَّل حتى يعتمده صاحب الدفتر، والردّ يُسجَّل'
\o /dev/null
select _as('f1000000-0000-0000-0000-0000000000f1');
do $$
declare b uuid := _id('F');
begin
  -- (البند ٢٠٩) جوابٌ واحد: رقمٌ بلا حساب، ورقم صاحب الدفتر، يُجابان كما يُجاب رقمٌ له حساب، ولا يُدعى بهما أحد.
  perform _set('X1', ledger_preparer_invite(b, '0911999999'));
  perform _eq((select status from ledger_preparers_list(b) where id = _id('X1')), 'invited', 'رقمٌ بلا حساب يُجاب كما يُجاب رقمٌ له حساب');
  perform _set('X2', ledger_preparer_invite(b, '0911000001'));
  perform _eq(_n(format('select count(*) from ledger_preparers where id in (%L, %L)', _id('X1'), _id('X2'))), 0::bigint,
              'ولا يُدعى بهما أحد، ولا صاحب الدفتر نفسه');
  perform _set('P1', ledger_preparer_invite(b, '+249 912 345 678'));
  perform _eq(_t(format('select status || ''/'' || contact_tail from ledger_preparers where id = %L', _id('P1'))), 'invited/5678',
              'المحاسب مدعوٌّ برقمه (بهويّة دخوله)، ويُعرف بآخر أربعة أرقام');
  perform _set('X3', ledger_preparer_invite(b, 'p249912345678@phone.invalid'));
  perform _eq(_n(format('select count(*) from ledger_preparers where book_id = %L and preparer_id = %L', b, 'ac000000-0000-0000-0000-0000000000ac')),
              1::bigint, 'ولا تتكرّر دعوته');
  perform ledger_preparer_end(_id('X1'));
  perform ledger_preparer_end(_id('X2'));
  perform ledger_preparer_end(_id('X3'));
  perform _eq((select full_name from ledger_preparers_list(b) where id = _id('P1')), null::text, 'ولا يُرى اسمه قبل أن يقبل');
end $$;
select _as('ac000000-0000-0000-0000-0000000000ac');
do $$
declare b uuid := _id('F'); r jsonb; n0 bigint;
begin
  perform _refuses(format($q$select ledger_entry_submit(%L, ledger_today(), 'قبل القبول',
                     jsonb_build_array(_l('5130', 'D', 3000), _l('1110', 'C', 3000)), 'k-e-0001')$q$, b),
                   'المدعوّ لا يُعِدّ قبل أن يقبل', 'ليس هذا دفترك');
  perform _eq((select count(*) from ledger_preparer_mine() where status = 'invited'), 1::bigint, 'ويرى دعوته');
  perform ledger_preparer_answer(_id('P1'), true);
  perform _eq((select count(*) from ledger_preparer_chart(b)) > 10, true, 'وبعد القبول يقرأ شجرة الحسابات');
  perform _eq((select count(*) from journal_entries where book_id = b), 0::bigint, 'ولا يقرأ قيود الدفتر');
  n0 := _n(format('select count(*) from journal_entries where book_id = %L', b));
  r := ledger_entry_submit(b, ledger_today(), 'مبيدات أعدّها المحاسب',
         jsonb_build_array(_l('5130', 'D', 3000), _l('1110', 'C', 3000)), 'k-e-0002', null, 'manual', null,
         'ac000000-0000-0000-0000-0000000000ac/ledger/receipt-7.pdf');
  perform _eq(r ->> 'status', 'pending', 'قيد المُعِدّ ينتظر');
  perform _set('D1', (r ->> 'draft_id')::uuid);
  perform _eq(_n(format('select count(*) from journal_entries where book_id = %L', b)), n0, 'ولم يُرحَّل في الدفتر شيء');
  perform _eq((ledger_entry_submit(b, ledger_today(), 'مبيدات أعدّها المحاسب',
                 jsonb_build_array(_l('5130', 'D', 3000), _l('1110', 'C', 3000)), 'k-e-0002', null, 'manual', null,
                 'ac000000-0000-0000-0000-0000000000ac/ledger/receipt-7.pdf') ->> 'draft_id')::uuid,
              _id('D1'), 'وإرساله ثانيةً بالمفتاح نفسه يُرجع المسوّدة نفسها');
  perform _refuses(format($q$select ledger_entry_submit(%L, ledger_today(), 'محتوى آخر',
                     jsonb_build_array(_l('5130', 'D', 4000), _l('1110', 'C', 4000)), 'k-e-0002')$q$, b),
                   'وبمحتوى آخر يُرفض', 'استُعمل لقيدٍ مختلف');
  perform _refuses(format($q$select ledger_entry_submit(%L, ledger_today(), 'غير متوازن من المحاسب',
                     jsonb_build_array(_l('5130', 'D', 4000), _l('1110', 'C', 3999)), 'k-e-0003')$q$, b),
                   'ومسوّدةٌ غير متوازنة تُرفض قبل أن تُحفظ', 'غير متوازن');
  perform _eq(_n(format('select count(*) from ledger_drafts where book_id = %L and client_key = ''k-e-0003''', b)), 0::bigint,
              'ولا يبقى منها صفّ');
  perform _refuses(format($q$select ledger_draft_approve(%L)$q$, _id('D1')), 'المُعِدّ لا يعتمد قيده', 'ليس هذا دفترك');
  perform _eq(ledger_document_readable('ac000000-0000-0000-0000-0000000000ac/ledger/receipt-7.pdf'), true, 'ويقرأ مستنده');
  r := ledger_entry_submit(b, ledger_today(), 'نقل أعدّه المحاسب',
         jsonb_build_array(_l('5160', 'D', 1500), _l('1110', 'C', 1500)), 'k-e-0004');
  perform _set('D2', (r ->> 'draft_id')::uuid);
  r := ledger_entry_submit(b, ledger_today(), 'قيدٌ سيُسحب',
         jsonb_build_array(_l('5160', 'D', 800), _l('1110', 'C', 800)), 'k-e-0005');
  perform _set('D3', (r ->> 'draft_id')::uuid);
  perform ledger_draft_withdraw(_id('D3'));
  perform _eq(_t(format('select status from ledger_drafts where id = %L', _id('D3'))), 'withdrawn', 'ويسحب ما أعدّه قبل البتّ');
end $$;
select _as('e9000000-0000-0000-0000-0000000000e9');
do $$ begin
  perform _refuses(format($q$select ledger_draft_approve(%L)$q$, _id('D1')), 'والغريب لا يعتمد', 'ليس هذا دفترك');
  perform _refuses(format($q$select ledger_draft_reject(%L, 'لا يصحّ هذا')$q$, _id('D1')), 'ولا يردّ', 'ليس هذا دفترك');
  perform _eq((select count(*) from ledger_drafts where id = _id('D1')), 0::bigint, 'ولا يرى المسوّدة');
end $$;
select _as('f1000000-0000-0000-0000-0000000000f1');
do $$
declare b uuid := _id('F'); e uuid;
begin
  perform _eq((select full_name from ledger_preparers_list(b) where id = _id('P1')), 'المحاسب', 'صاحب الدفتر يرى اسم المحاسب بعد قبوله');
  perform _eq(ledger_document_readable('ac000000-0000-0000-0000-0000000000ac/ledger/receipt-7.pdf'), true,
              'ويقرأ المستند الذي أرفقه المحاسب من مجلّده');
  e := ledger_draft_approve(_id('D1'));
  perform _eq(_t(format('select status from ledger_drafts where id = %L', _id('D1'))), 'posted', 'صاحب الدفتر يعتمده فيُرحَّل');
  perform _eq(_n(format('select count(*) from journal_lines where entry_id = %L', e)), 2::bigint, 'بسطوره كما أُعِدّت');
  perform _eq(_t(format('select (prepared_by = %L and approved_by = %L)::text from ledger_entry_meta where entry_id = %L',
                        'ac000000-0000-0000-0000-0000000000ac', 'f1000000-0000-0000-0000-0000000000f1', e)), 'true',
              'ويُعرف من أعدّه ومن اعتمده');
  perform _refuses(format($q$select ledger_draft_approve(%L)$q$, _id('D1')), 'ولا يُعتمد مرّتين', 'بُتّ في هذا القيد');
  perform _refuses(format($q$select ledger_draft_reject(%L, 'لا')$q$, _id('D2')), 'الردّ بلا سببٍ يُرفض', 'اكتب سبب الردّ');
  perform ledger_draft_reject(_id('D2'), 'المبلغ لا يطابق الإيصال');
  perform _eq(_t(format('select status || ''/'' || decision_note from ledger_drafts where id = %L', _id('D2'))),
              'rejected/المبلغ لا يطابق الإيصال', 'ويُردّ بسببه');
  perform _eq(_n(format('select count(*) from journal_entries where source_type = ''manual'' and source_id = %L', _id('D2'))), 0::bigint,
              'والمردود لا يُرحَّل');
  perform _eq((select count(*) from ledger_audit_log where draft_id = _id('D2') and action = 'draft_rejected'
                 and after ->> 'note' = 'المبلغ لا يطابق الإيصال' and actor_id = 'f1000000-0000-0000-0000-0000000000f1'), 1::bigint,
              'والردّ في سجلّ التدقيق بسببه ومن ردّه');
  perform _eq((select count(*) from ledger_audit_log where draft_id = _id('D1') and action = 'draft_submitted'
                 and actor_id = 'ac000000-0000-0000-0000-0000000000ac' and actor_name = 'المحاسب'), 1::bigint,
              'والإعداد بمن أعدّه واسمه');
  perform _eq((select count(*) from ledger_audit_log where draft_id = _id('D1') and action = 'draft_approved'
                 and actor_id = 'f1000000-0000-0000-0000-0000000000f1'), 1::bigint, 'والاعتماد بمن اعتمد');
  perform _eq((select count(*) from ledger_audit_log where draft_id = _id('D3') and action = 'draft_withdrawn'), 1::bigint, 'والسحب');
  perform _eq((select count(*) from ledger_audit_log where entry_id = e and action in ('entry_posted', 'lines_posted')), 2::bigint,
              'والقيد المرحَّل وسطوره');
  perform ledger_preparer_end(_id('P1'));
  perform _eq(_t(format('select status from ledger_preparers where id = %L', _id('P1'))), 'ended', 'وصاحب الدفتر يُنهي الإذن');
end $$;
select _as('ac000000-0000-0000-0000-0000000000ac');
do $$ begin
  perform _refuses(format($q$select ledger_entry_submit(%L, ledger_today(), 'بعد الإنهاء',
                     jsonb_build_array(_l('5130', 'D', 3000), _l('1110', 'C', 3000)), 'k-e-0009')$q$, _id('F')),
                   'فلا يُعِدّ بعده', 'ليس هذا دفترك');
  perform _refuses(format($q$select * from ledger_preparer_chart(%L)$q$, _id('F')), 'ولا يقرأ الشجرة', 'ليس هذا دفترك');
end $$;

\o
\echo 'و) الوكيل بإذنه: يُعِدّ ولا يُرحِّل، ويسقط ذلك بسقوط الإذن'
\o /dev/null
select _as('f1000000-0000-0000-0000-0000000000f1');
do $$ begin
  perform _set('P2', ledger_preparer_add_agent(_id('F'), '3a000000-0000-0000-0000-00000000003a'));
  perform _eq(_t(format('select role || ''/'' || status from ledger_preparers where id = %L', _id('P2'))), 'agent/active',
              'صاحب الدفتر يجعل وكيله مُعِدّاً بإذنه القائم');
end $$;
select _as('a1000000-0000-0000-0000-0000000000a1');
do $$
declare r jsonb;
begin
  r := ledger_entry_submit(_id('F'), ledger_today(), 'وقود أعدّه الوكيل',
         jsonb_build_array(_l('5150', 'D', 2000), _l('1110', 'C', 2000)), 'k-f-0001', null, 'manual', null, null, 'app');
  perform _eq(r ->> 'status', 'pending', 'قيد الوكيل ينتظر');
  perform _eq(_t(format('select via from ledger_drafts where id = %L', r ->> 'draft_id')), 'agent', 'ويُوسَم أنّه من الوكيل');
  perform _eq(_n(format('select count(*) from ledger_audit_log where draft_id = %L and via = ''agent''', r ->> 'draft_id')), 1::bigint,
              'وفي السجلّ كذلك');
end $$;
select _as('f1000000-0000-0000-0000-0000000000f1');
select agent_mandate_end('3a000000-0000-0000-0000-00000000003a');
select _as('a1000000-0000-0000-0000-0000000000a1');
do $$ begin
  perform _refuses(format($q$select ledger_entry_submit(%L, ledger_today(), 'بعد سقوط الإذن',
                     jsonb_build_array(_l('5150', 'D', 2000), _l('1110', 'C', 2000)), 'k-f-0002')$q$, _id('F')),
                   'وبعد إنهاء الإذن لا يُعِدّ', 'ليس هذا دفترك');
end $$;

\o
\echo 'ز) «راجع كلّ قيد»: قيد صاحب الدفتر نفسه ينتظر اعتماده'
\o /dev/null
select _as('f1000000-0000-0000-0000-0000000000f1');
do $$
declare b uuid := _id('F'); r jsonb;
begin
  perform ledger_review_set(b, true);
  r := ledger_entry_submit(b, ledger_today(), 'قيدي ينتظر مراجعتي',
         jsonb_build_array(_l('5180', 'D', 700), _l('1110', 'C', 700)), 'k-g-0001');
  perform _eq(r ->> 'status', 'pending', 'قيد صاحب الدفتر ينتظر حين طلب المراجعة');
  perform _refuses(format($q$select ledger_post(%L, ledger_today(), 'من الباب القديم',
                     jsonb_build_array(_l('5180', 'D', 700), _l('1110', 'C', 700)), 'k-g-0002')$q$, b),
                   'والباب القديم لا يتجاوز المراجعة', 'يطلب مراجعة كلّ قيد');
  perform ledger_draft_approve((r ->> 'draft_id')::uuid);
  perform _eq(_t(format('select status from ledger_drafts where id = %L', r ->> 'draft_id')), 'posted', 'ويعتمده هو فيُرحَّل');
  perform ledger_review_set(b, false);
  perform _eq(ledger_entry_submit(b, ledger_today(), 'بعد إيقاف المراجعة',
                jsonb_build_array(_l('5180', 'D', 701), _l('1110', 'C', 701)), 'k-g-0003') ->> 'status', 'posted',
              'وبعد إيقافها يُرحَّل في الحال');
  perform _eq((select count(*) from ledger_audit_log where book_id = b and action = 'review_setting'), 2::bigint,
              'وتغيير الإعداد مرّتين في السجلّ');
end $$;

\o
\echo 'ح) سجلّ التدقيق لا يُعدَّل ولا يُحذف ولا يُفرَّغ: لا بمالك القاعدة ولا بمفتاح الخدمة ولا بالمدير'
\o /dev/null
reset role;
select _as(null);
do $$ begin
  perform _eq((select count(*) from ledger_audit_log) > 10, true, 'في السجلّ ما يُختبر');
  perform _refuses('update ledger_audit_log set actor_name = ''مزوَّر''', 'مالك القاعدة لا يعدّل السجلّ', 'يُلحَق ولا يُعدَّل');
  perform _refuses('delete from ledger_audit_log', 'ولا يحذف منه', 'يُلحَق ولا يُعدَّل');
  perform _refuses('truncate ledger_audit_log', 'ولا يفرّغه', 'يُلحَق ولا يُعدَّل');
  perform _refuses('update ledger_entry_meta set document_path = null', 'ولا يعدّل ما يُعرف عن القيد', 'يُلحَق ولا يُعدَّل');
  perform _refuses('delete from ledger_drafts', 'ولا يحذف قيداً مُعَدّاً', 'لا تُحذف');
  perform _refuses(format('update ledger_drafts set memo = ''غيّرته'' where id = %L', _id('D2')), 'ولا يعدّل محتواه', 'إلا البتّ فيه');
  perform _refuses('truncate ledger_period_reopens', 'ولا يفرّغ سجلّ إعادة الفتح', 'يُلحَق ولا يُعدَّل');
end $$;
set role service_role;
do $$ begin
  perform _refuses('update ledger_audit_log set actor_name = ''مزوَّر''', 'مفتاح الخدمة لا يعدّل السجلّ');
  perform _refuses('delete from ledger_audit_log', 'ولا يحذف منه');
  perform _refuses($q$insert into ledger_audit_log (book_id, via, action) select id, 'system', 'entry_posted' from ledger_books limit 1$q$,
                   'ولا يكتب فيه');
  perform _refuses($q$update ledger_drafts set status = 'posted'$q$, 'ولا يغيّر حال مسوّدة');
end $$;
set role authenticated;
select _as('ad000000-0000-0000-0000-0000000000ad', 'aal2');
do $$ begin
  perform _eq(is_admin(), true, 'المدير مديرٌ في هذه الجلسة');
  perform _refuses('delete from ledger_audit_log', 'والمدير لا يحذف من السجلّ');
  perform _refuses('update ledger_audit_log set via = ''web''', 'ولا يعدّله');
  perform _eq((select count(*) from ledger_audit_log where book_id = _id('F')), 0::bigint, 'ولا يقرأ سجلّ دفترٍ لم يفتح فحصه');
  perform ledger_inspect_open(_id('F'), 'مراجعة شكوى مقدّمة من صاحب الدفتر', 2);
  perform _eq((select count(*) from ledger_audit_log where book_id = _id('F')) > 0, true, 'وحين يفتح فحصاً بسببٍ يقرؤه كما تسمح قواعد الفحص');
  perform _eq((select count(*) from ledger_exceptions(_id('F'))) >= 0, true, 'ويقرأ استثناءاته أثناء الفحص');
end $$;
select _as('f1000000-0000-0000-0000-0000000000f1');
do $$ begin
  perform _refuses($q$insert into ledger_audit_log (book_id, via, action) values ('$q$ || _id('F') || $q$', 'web', 'entry_posted')$q$,
                   'وصاحب الدفتر لا يكتب فيه بيده');
  perform _eq((select count(*) from ledger_audit_log where book_id = _id('F')) > 0, true, 'ويقرؤه');
end $$;

\o
\echo 'ط) إقفال الفترة بيد صاحب الدفتر، ولا يُفتح إلا بيد المدير وبسبب'
\o /dev/null
do $$
declare b uuid := _id('F'); r jsonb;
begin
  perform ledger_review_set(b, true);
  r := ledger_entry_submit(b, ledger_today() - 3, 'قيدٌ ينتظر ثمّ تُقفل فترته',
         jsonb_build_array(_l('5195', 'D', 900), _l('1110', 'C', 900)), 'k-i-0001');
  perform _set('D9', (r ->> 'draft_id')::uuid);
  perform ledger_review_set(b, false);
  perform _eq(ledger_period_close(b, ledger_today() - 2), ledger_today() - 2, 'صاحب الدفتر يقفل حتى يومٍ مضى');
  perform _eq((select count(*) from ledger_audit_log where book_id = b and action = 'period_closed'
                 and after ->> 'closed_through' = (ledger_today() - 2)::text), 1::bigint, 'ويُسجَّل الإقفال');
  perform _refuses(format($q$select ledger_entry_submit(%L, ledger_today() - 4, 'في فترةٍ مقفلة',
                     jsonb_build_array(_l('5195', 'D', 900), _l('1110', 'C', 900)), 'k-i-0002')$q$, b),
                   'الفترة المقفلة ترفض القيد', 'مقفلة');
  perform _refuses(format($q$select ledger_entry_submit(%L, ledger_today() - 2, 'في آخر يومٍ مقفل',
                     jsonb_build_array(_l('5195', 'D', 900), _l('1110', 'C', 900)), 'k-i-0003')$q$, b),
                   'وآخر يومٍ فيها', 'مقفلة');
  perform _refuses(format($q$select ledger_draft_approve(%L)$q$, _id('D9')), 'ولا يُعتمد فيها قيدٌ أُعِدّ قبل الإقفال', 'مقفلة');
  perform _eq(ledger_entry_submit(b, ledger_today() - 1, 'بعد الفترة المقفلة',
                jsonb_build_array(_l('5195', 'D', 900), _l('1110', 'C', 900)), 'k-i-0004') ->> 'status', 'posted',
              'وما بعدها يُرحَّل');
  perform ledger_draft_reject(_id('D9'), 'فترته أُقفلت');
  perform _refuses(format($q$select ledger_period_reopen(%L, ledger_today() - 10, 'أريد أن أصحّح قيداً قديماً')$q$, b),
                   'وصاحب الدفتر لا يعيد فتحها', 'للإدارة وحدها');
  perform _refuses(format($q$select ledger_close_through(%L, ledger_today() - 9)$q$, b), 'ولا يرجع بالإقفال إلى الوراء', 'مقفلة أصلاً');
end $$;
reset role;
select _as(null);
do $$ begin
  perform _refuses(format('update ledger_books set closed_through = ledger_today() - 9 where id = %L', _id('F')),
                   'ولا يفتحها مالك القاعدة بتعديلٍ مباشر', 'لا تُفتح من جديد');
  perform _refuses(format($q$insert into ledger_period_reopens (book_id, was_through, now_through, reason, reopened_by, tx)
                     values (%L, ledger_today() - 2, ledger_today() - 9, 'سببٌ مكتوبٌ بيدٍ', 'ad000000-0000-0000-0000-0000000000ad', 1)$q$, _id('F'))
                   || '; ' || format('update ledger_books set closed_through = ledger_today() - 9 where id = %L', _id('F')),
                   'ولا بسجلّ إعادة فتحٍ من معاملةٍ أخرى', 'لا تُفتح من جديد');
end $$;
set role authenticated;
select _as('ad000000-0000-0000-0000-0000000000ad', 'aal2');
do $$
declare b uuid := _id('F');
begin
  perform _refuses(format($q$select ledger_period_reopen(%L, ledger_today() - 10, 'قصير')$q$, b), 'المدير يكتب سبباً', 'اكتب سبب إعادة الفتح');
  perform _refuses(format($q$select ledger_period_reopen(%L, ledger_today() - 1, 'سببٌ كافٍ للاختبار هنا')$q$, b),
                   'ويُعاد إلى يومٍ قبل الإقفال لا بعده', 'يُعاد الفتح إلى يومٍ قبل');
  perform _eq(ledger_period_reopen(b, ledger_today() - 10, 'طلب صاحب الدفتر تصحيح قيدٍ في أسبوعٍ مضى'), ledger_today() - 10,
              'المدير يعيد فتحها بسببٍ مكتوب');
  perform _eq(_t(format('select closed_through::text from ledger_books where id = %L', b)), (ledger_today() - 10)::text, 'فتُفتح');
  perform _eq(_n(format($q$select count(*) from ledger_audit_log where book_id = %L and action = 'period_reopened'
                           and after ->> 'reason' = 'طلب صاحب الدفتر تصحيح قيدٍ في أسبوعٍ مضى'
                           and actor_id = 'ad000000-0000-0000-0000-0000000000ad'$q$, b)), 1::bigint,
              'وإعادة الفتح في السجلّ بسببها ومن فعلها');
  perform _eq(_n($q$select count(*) from notifications where recipient_id = 'f1000000-0000-0000-0000-0000000000f1'
                    and kind = 'ledger_review' and title like 'أعادت الإدارة%'$q$), 1::bigint, 'ويُخبَر صاحب الدفتر');
end $$;
select _as('f1000000-0000-0000-0000-0000000000f1');
do $$ begin
  perform _eq(ledger_entry_submit(_id('F'), ledger_today() - 4, 'تصحيحٌ بعد إعادة الفتح',
                jsonb_build_array(_l('5195', 'D', 950), _l('1110', 'C', 950)), 'k-i-0009') ->> 'status', 'posted',
              'وبعدها يُكتب القيد المصحِّح');
end $$;

\o
\echo 'ي) قيد الإقفال: يصفّر الإيراد والمصروف في الأرباح المحتجزة، ولا يتكرّر، ولا يُعكس، ولا يغيّر القوائم'
\o /dev/null
select _as('f2000000-0000-0000-0000-0000000000f2');
do $$
declare b uuid; s uuid := '52000000-0000-0000-0000-000000000052';
begin
  b := _set('G', ledger_open_book('farm'));
  perform ledger_entry_submit(b, ledger_today() - 20, 'بيع ذرة',
            jsonb_build_array(_l('1110', 'D', 50000), _l('4110', 'C', 50000)), 'k-j-0001');
  perform ledger_entry_submit(b, ledger_today() - 15, 'بذور',
            jsonb_build_array(_l('5110', 'D', 20000), _l('1110', 'C', 20000)), 'k-j-0002');
  perform ledger_entry_submit(b, ledger_today() - 12, 'عمالة الموسم',
            jsonb_build_array(_l('5140', 'D', 7000, 'USD', s), _l('1110', 'C', 7000)), 'k-j-0003');
  perform ledger_entry_submit(b, ledger_today() - 11, 'بيع سمسم الموسم',
            jsonb_build_array(_l('1110', 'D', 9000), _l('4110', 'C', 9000, 'USD', s)), 'k-j-0004');
  perform _eq((select sum(amount) filter (where type = 'revenue') - sum(amount) filter (where type = 'expense')
                 from ledger_income_statement(b, null, ledger_today() - 1)), 32000::numeric, 'صافي الدخل قبل الإقفال ٣٢٠$');
  perform _refuses(format($q$select ledger_close_season(%L, %L, ledger_today() - 10)$q$, b, s),
                   'موسمٌ جارٍ لا يُقفل دخله', 'أقفل الموسم أوّلاً');
end $$;
reset role;
select _as(null);
update seasons set status = 'completed' where id = '52000000-0000-0000-0000-000000000052';
set role authenticated;
select _as('f2000000-0000-0000-0000-0000000000f2');
do $$
declare b uuid := _id('G'); s uuid := '52000000-0000-0000-0000-000000000052'; e uuid; e2 uuid;
begin
  e := ledger_close_season(b, s, ledger_today() - 10);
  perform _set('CS', e);
  perform _eq(_n(format($q$select coalesce(sum(case when l.side = 'D' then l.base_minor else -l.base_minor end), 0)
                           from journal_lines l join ledger_accounts a on a.id = l.account_id
                          where l.book_id = %L and l.season_id = %L and a.type in ('revenue', 'expense')$q$, b, s)), 0::bigint,
              'إقفال الموسم يصفّر إيراده ومصروفه');
  perform _eq(_n(format($q$select sum(case when l.side = 'C' then l.base_minor else -l.base_minor end)
                           from journal_lines l join ledger_accounts a on a.id = l.account_id
                          where l.entry_id = %L and a.system_key = 'retained_earnings'$q$, e)), 2000::bigint,
              'وربحه (٩٠$ − ٧٠$) إلى الأرباح المحتجزة');
  perform _refuses(format($q$select ledger_close_season(%L, %L)$q$, b, s), 'ولا يُقفل الموسم مرّتين', 'من قبل');
  perform _eq((select revenue - expense from ledger_profit_by_season(b) where season_id = s), 2000::bigint,
              'وربحيّة الموسم كما كانت (قيد الإقفال لا يدخلها)');

  e2 := ledger_close_income(b, ledger_today() - 1);
  perform _set('CP', e2);
  perform _eq((select count(*) from ledger_trial_balance(b) where type in ('revenue', 'expense') and (debit_balance <> 0 or credit_balance <> 0)),
              0::bigint, 'إقفال الفترة يصفّر كلّ حسابات الإيراد والمصروف في ميزان المراجعة');
  perform _eq((select credit_balance from ledger_trial_balance(b) where code = '3210'), 32000::bigint,
              'والأرباح المحتجزة ٣٢٠$ (الموسم ٢٠$ والباقي ٣٠٠$)');
  perform _eq((select balanced and equation_holds from ledger_trial_balance_proof(b)), true, 'والميزان متوازن والمعادلة قائمة');
  perform _eq(_t(format('select closed_through::text from ledger_books where id = %L', b)), (ledger_today() - 1)::text,
              'والفترة أُقفلت معه');
  perform _refuses(format($q$select ledger_close_income(%L, ledger_today() - 1)$q$, b), 'ولا يُقفل الدخل مرّتين', 'من قبل');
  perform _refuses(format($q$select ledger_close_income(%L, ledger_today() - 5)$q$, b), 'ولا ما قبله', 'من قبل');
  perform _refuses(format($q$select ledger_reverse(%L, 'أريد إلغاءه')$q$, e2), 'وقيد الإقفال لا يُعكس', 'قيد الإقفال لا يُعكس');
  perform _refuses(format($q$select ledger_entry_submit(%L, ledger_today() - 1, 'بعد الإقفال في الفترة',
                     jsonb_build_array(_l('5110', 'D', 100), _l('1110', 'C', 100)), 'k-j-0009')$q$, b),
                   'ولا قيد في الفترة بعد إقفالها', 'مقفلة');
  perform _eq((select sum(amount) filter (where type = 'revenue') from ledger_income_statement(b, ledger_today() - 30, ledger_today() - 1)),
              59000::numeric, 'وقائمة دخل الفترة كما كانت: ٥٩٠$ إيراداً');
  perform _eq((select sum(amount) filter (where type = 'expense') from ledger_income_statement(b, ledger_today() - 30, ledger_today() - 1)),
              27000::numeric, 'و٢٧٠$ مصروفاً');
  perform _eq((select coalesce(sum(balance) filter (where type = 'asset'), 0) from ledger_balance_sheet(b))
              - (select coalesce(sum(balance) filter (where type in ('liability', 'equity')), 0) from ledger_balance_sheet(b)),
              (select sum(amount) filter (where type = 'revenue') - sum(amount) filter (where type = 'expense') from ledger_income_statement(b))::numeric,
              'والميزانيّة تتوازن مع صافي الدخل كما كانت (لا يُعدّ الربح مرّتين)');
  perform _eq((select count(*) from ledger_audit_log where book_id = b and action = 'closing_posted'), 2::bigint, 'والإقفالان في السجلّ');
end $$;
set role service_role;
do $$ begin
  perform _refuses(format($q$select ledger_reverse_for(%L, 'بمفتاح الخدمة')$q$, _id('CP')), 'ولا يعكسه مفتاح الخدمة', 'قيد الإقفال لا يُعكس');
end $$;

\o
\echo 'ك) القيود الجاهزة تُرحَّل متوازنةً بدالّة القيد نفسها'
\o /dev/null
set role authenticated;
select _as('f1000000-0000-0000-0000-0000000000f1');
do $$
declare
  b uuid := _id('F'); inv uuid; t record; r jsonb; n integer := 0; ni integer := 0; lines jsonb;
begin
  for t in select * from ledger_entry_templates where 'farm' = any (book_kinds) order by sort loop
    select jsonb_agg(jsonb_build_object('key', x ->> 'key', 'side', x ->> 'side', 'currency', 'USD', 'minor', 1234)) into lines
      from jsonb_array_elements(t.lines) x;
    r := ledger_entry_submit(b, ledger_today(), t.name_ar, lines, 'k-tpl-' || t.key, null, 'manual', t.key);
    if r ->> 'status' = 'posted'
       and _n(format($q$select count(*) from journal_lines where entry_id = %L$q$, r ->> 'entry_id')) = 2
       and _n(format($q$select sum(case side when 'D' then base_minor else -base_minor end) from journal_lines where entry_id = %L$q$, r ->> 'entry_id')) = 0
       and (_t(format('select kind from ledger_entry_meta where entry_id = %L', r ->> 'entry_id'))
            = (case t.grp when 'adjusting' then 'adjusting' else 'template' end)) then
      n := n + 1;
    else
      perform _fail('القيد الجاهز ' || t.key, coalesce(r::text, 'null'));
    end if;
  end loop;
  perform _eq(n, (select count(*)::integer from ledger_entry_templates where 'farm' = any (book_kinds)),
              'كلّ القيود الجاهزة لدفتر المزرعة تُرحَّل متوازنة، بنوعها');
  perform _eq(n >= 13, true, 'وهي الشراء والسداد والبيع والتحصيل والسلفة والإيداع والسحب، والتسويات الستّ');

  inv := ledger_open_book('investor');
  for t in select * from ledger_entry_templates where 'investor' = any (book_kinds) order by sort loop
    select jsonb_agg(jsonb_build_object('key', x ->> 'key', 'side', x ->> 'side', 'currency', 'USD', 'minor', 4321)) into lines
      from jsonb_array_elements(t.lines) x;
    r := ledger_entry_submit(inv, ledger_today(), t.name_ar, lines, 'k-tpi-' || t.key, null, 'manual', t.key);
    if r ->> 'status' = 'posted' then ni := ni + 1; end if;
  end loop;
  perform _eq(ni, (select count(*)::integer from ledger_entry_templates where 'investor' = any (book_kinds)),
              'وقيود دفتر المستثمر الجاهزة كذلك');
  perform _refuses(format($q$select ledger_entry_submit(%L, ledger_today(), 'شراء آجل في دفتر المستثمر',
                     jsonb_build_array(_l('1110', 'D', 100), _l('1120', 'C', 100)), 'k-tpi-other', null, 'manual', 'purchase_credit')$q$, inv),
                   'وقيدٌ جاهزٌ لدفترٍ آخر يُرفض', 'قيدٌ جاهز غير معروف');
  perform _refuses(format($q$select ledger_entry_submit(%L, ledger_today(), 'قالب غير متوازن',
                     jsonb_build_array(_l('payables_suppliers', 'D', 100), _l('cash_on_hand', 'C', 99)), 'k-tpl-unbalanced', null, 'manual', 'pay_supplier')$q$, b),
                   'والقيد الجاهز يُفحص كغيره: غير المتوازن يُرفض', 'غير متوازن');
end $$;

\o
\echo 'ل) تقرير الاستثناءات يجد كلّ نوع'
\o /dev/null
select _as('f3000000-0000-0000-0000-0000000000f3');
do $$
declare b uuid;
begin
  b := _set('H', ledger_open_book('farm'));
  perform ledger_entry_submit(b, ledger_today() - 90, 'رأس المال', jsonb_build_array(_l('1110', 'D', 100000), _l('3110', 'C', 100000)), 'k-l-0001',
                              null, 'manual', null, null);
  perform ledger_entry_submit(b, ledger_today() - 30, 'صيانة ١', jsonb_build_array(_l('5195', 'D', 100), _l('1110', 'C', 100)), 'k-l-0002');
  perform ledger_entry_submit(b, ledger_today() - 20, 'صيانة ٢', jsonb_build_array(_l('5195', 'D', 110), _l('1110', 'C', 110)), 'k-l-0003');
  perform ledger_entry_submit(b, ledger_today() - 10, 'صيانة ٣', jsonb_build_array(_l('5195', 'D', 120), _l('1110', 'C', 120)), 'k-l-0004');
  perform _set('LG', (ledger_entry_submit(b, ledger_today() - 2, 'صيانة كبيرة', jsonb_build_array(_l('5195', 'D', 1000), _l('1120', 'C', 1000)), 'k-l-0005') ->> 'entry_id')::uuid);
  perform _set('DA', (ledger_entry_submit(b, ledger_today() - 5, 'بذور', jsonb_build_array(_l('5110', 'D', 555), _l('1110', 'C', 555)), 'k-l-0006') ->> 'entry_id')::uuid);
  perform _set('DB', (ledger_entry_submit(b, ledger_today() - 4, 'بذور مرّةً ثانية؟', jsonb_build_array(_l('5110', 'D', 555), _l('1110', 'C', 555)), 'k-l-0007') ->> 'entry_id')::uuid);
  perform _set('NW', (ledger_entry_submit(b, ledger_today() - 1, 'نقل من المحفظة', jsonb_build_array(_l('5160', 'D', 3000), _l('1130', 'C', 3000)), 'k-l-0008') ->> 'entry_id')::uuid);
  perform ledger_entry_submit(b, ledger_today(), 'بفاتورة', jsonb_build_array(_l('5120', 'D', 333), _l('1110', 'C', 333)), 'k-l-0009');
end $$;
reset role;
select _as(null);
-- An old draft: a row the clock put a week and more in the past (as the cluster; the gate cannot wait ten days).
insert into ledger_drafts (book_id, client_key, prepared_by, via, kind, entry_date, memo, lines, created_at)
select _id('H'), 'k-l-stale', 'f3000000-0000-0000-0000-0000000000f3', 'web', 'manual', ledger_today() - 11, 'مسوّدة قديمة',
       jsonb_build_array(_l('5195', 'D', 50), _l('1110', 'C', 50)), now() - interval '10 days';
set role authenticated;
select _as('f3000000-0000-0000-0000-0000000000f3');
do $$
declare b uuid := _id('H');
begin
  perform _eq((select count(*) from ledger_exceptions(b) where kind = 'no_document') >= 1, true, 'قيدٌ بلا مستند');
  perform _eq((select account_code from ledger_exceptions(b) where kind = 'large_amount' and entry_id = _id('LG')), '5195',
              'ومبلغٌ أكبر من ثلاثة أمثال وسيط حسابه (١٠$ مقابل وسيط ١٫١٠$)');
  perform _eq((select count(*) from ledger_exceptions(b) where kind = 'large_amount' and account_code = '5120'), 0::bigint,
              'ولا يُعدّ كبيراً حسابٌ بلا تاريخٍ يُقاس به');
  perform _eq((select count(*) from ledger_exceptions(b) where kind = 'back_dated'
                 and entry_date = ledger_today() - 90), 1::bigint, 'وقيدٌ بتاريخٍ قبل كتابته بتسعين يوماً');
  perform _eq((select count(*) from ledger_exceptions(b, null, null, 120) where kind = 'back_dated'), 0::bigint,
              'ولا يُعدّ متأخّراً إن طال الحدّ');
  perform _eq((select (detail ->> 'other_entry_id')::uuid from ledger_exceptions(b) where kind = 'duplicate' and entry_id = _id('DB')),
              _id('DA'), 'وقيدان متشابهان بفرق يوم');
  perform _eq((select amount_minor from ledger_exceptions(b) where kind = 'negative_cash' and account_code = '1130'), -3000::bigint,
              'ومحفظةٌ نزلت تحت الصفر');
  perform _eq((select amount_minor from ledger_exceptions(b) where kind = 'negative_cash' and account_code = '1120'), -1000::bigint,
              'وبنكٌ دُفع منه بلا رصيد');
  perform _eq((select count(*) from ledger_exceptions(b) where kind = 'negative_cash' and account_code = '1110'), 0::bigint,
              'والنقد الذي فيه رصيدٌ لا يُعدّ');
  perform _eq((select count(*) from ledger_exceptions(b) where kind = 'stale_draft'), 1::bigint, 'ومسوّدةٌ تنتظر منذ عشرة أيام');
  perform _eq((select count(*) from ledger_exceptions(b, null, null, 30, 30) where kind = 'stale_draft'), 0::bigint,
              'ولا تُعدّ إن طال الحدّ');
end $$;

reset role;
select _as(null);
do $$
declare f integer; p integer;
begin
  select fails, passes into f, p from _score;
  if f > 0 then
    raise exception 'FAIL — % فحصاً لم يمرّ من %', f, f + p;
  end if;
  raise notice 'OK — % فحصاً', p;
end $$;
