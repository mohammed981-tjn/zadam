-- بوّابةُ الأسعار التلقائيّة (البند ١٣١).
--
-- The daily run writes as the project; a visitor reads what is published and
-- when the platform last looked, and nothing else; an administrator reads all
-- of it and decides the held figures. The table refuses an incomplete figure.

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


-- ── الناس: غ زائرٌ مسجَّل، د مدير ──────────────────────────────────────────
insert into auth.users (id) values
  ('c3000000-0000-0000-0000-0000000000c3'),
  ('f6000000-0000-0000-0000-0000000000f6')
on conflict (id) do nothing;
insert into profiles (id, full_name, role) values
  ('c3000000-0000-0000-0000-0000000000c3', 'زائر', 'investor'),
  ('f6000000-0000-0000-0000-0000000000f6', 'المدير', 'admin')
on conflict (id) do update set role = excluded.role;

grant usage on schema public, auth to anon, authenticated;
grant execute on function auth.uid() to anon, authenticated;
grant select, update on _who to anon, authenticated;

-- What the job writes, as the service role does (no RLS for the owner role here).
insert into market_quotes (kind, market_date, buy, sell, source_url, quote, status) values
  ('fx_bank', '2026-10-21', 4850, 4886.38, 'https://iqraa24.com/45070/', 'الدولار الأمريكي: شراء النقد 4850.00 · سعر البيع 4886.38', 'published'),
  ('fx_parallel', '2026-10-22', 12000, 13000, 'https://bajnews.net/x/', 'وبلغ سعر شراء الدولار 12,000', 'held');
insert into market_quotes (kind, market, crop, unit, market_date, price, source_url, status, reason) values
  ('crop', 'obeid', 'hibiscus', 'qintar', '2026-10-14', 630000, 'https://sudafax.com/585058/', 'published', null),
  ('crop', 'gedaref', 'sesame', 'qintar', '2026-10-13', 520000, 'https://ainelhagega.com/?p=46364', 'held', 'نصٌّ حرّ');
insert into price_runs (trigger, finished_at, found, published, held, errors)
values ('cron', '2026-10-22 06:00:00+00', 4, 2, 2, array['tagpress.net: 403']);

\echo ''
\echo 'أ) الزائر يرى المنشور وحده، ولا يرى سجلّ التشغيل'

set role anon;
do $$ begin
  perform _eq((select count(*)::int from market_quotes), 2, 'الزائرُ يرى الرقمين المنشورين');
  perform _eq((select count(*)::int from market_quotes where status = 'held'), 0, 'ولا يرى المحجوز');
  perform _eq((select count(*)::int from price_runs), 0, 'ولا سجلَّ التشغيل وأخطاءه');
  perform _eq(price_last_run(), '2026-10-22 06:00:00+00'::timestamptz, 'ويعرف متى بحثت المنصّة آخر مرّة');
  perform _refuses($q$insert into market_quotes (kind, market_date, buy, sell, source_url) values ('fx_bank', '2026-10-23', 1, 2, 'https://x.sd/')$q$,
    'ولا يكتب سعراً');
  perform _refuses($q$select market_quote_review((select id from market_quotes limit 1), true)$q$, 'ولا يقرّر في المحجوز');
end $$;
reset role;

\echo ''
\echo 'ب) المدير يرى الكلّ، ويقرّر في المحجوز وحده'

set role authenticated;
do $$
declare held_fx uuid; held_crop uuid; pub uuid;
begin
  perform _act_as('c3000000-0000-0000-0000-0000000000c3');
  perform _eq((select count(*)::int from market_quotes), 2, 'المسجَّلُ كالزائر');
  perform _changes_nothing($q$update market_quotes set status = 'published'$q$, 'ولا ينشر بيده');

  perform _act_as('f6000000-0000-0000-0000-0000000000f6');
  perform _eq((select count(*)::int from market_quotes), 4, 'المديرُ يرى المنشور والمحجوز');
  perform _eq((select count(*)::int from price_runs), 1, 'وسجلَّ التشغيل');
  select id into held_fx from market_quotes where kind = 'fx_parallel';
  select id into held_crop from market_quotes where crop = 'sesame';
  select id into pub from market_quotes where kind = 'fx_bank';
  perform market_quote_review(held_crop, true);
  perform _eq((select status from market_quotes where id = held_crop), 'published', 'ينشر المحجوز');
  perform market_quote_review(held_fx, false);
  perform _eq((select status from market_quotes where id = held_fx), 'rejected', 'ويرفضه');
  perform _refuses(format($q$select market_quote_review(%L, false)$q$, pub), 'ولا يُرفض ما نُشر من قبل بهذه الدالّة');
end $$;
reset role;

\echo ''
\echo 'ج) الجدول يرفض الرقم الناقص'

do $$ begin
  perform _refuses($q$insert into market_quotes (kind, market_date, buy, sell, source_url) values ('fx_bank', '2026-10-24', 5000, 4000, 'https://x.sd/a')$q$,
    'شراءٌ أعلى من البيع');
  perform _refuses($q$insert into market_quotes (kind, market, crop, market_date, price, source_url) values ('crop', 'obeid', 'millet', '2026-10-24', 1, 'https://x.sd/b')$q$,
    'محصولٌ بلا وحدة');
  perform _refuses($q$insert into market_quotes (kind, market_date, buy, sell, source_url) values ('fx_bank', '2026-10-24', 1, 2, 'http://x.sd/c')$q$,
    'مصدرٌ بلا https');
  perform _refuses($q$insert into market_quotes (kind, market_date, buy, sell, source_url) values ('fx_bank', '2026-10-21', 4850, 4886.38, 'https://iqraa24.com/45070/')$q$,
    'ولا يُكتب اليومُ نفسُه من المصدر نفسه مرّتين');
end $$;

\echo ''
\echo 'د) ما يُقرأ يُحفظ ولا يمحوه إلا المدير (البند ١٩٦)'

insert into market_quotes (kind, market_date, buy, sell, source_url, quote, status, reason) values
  ('fx_bank', '2026-10-24', 4900, 4950, 'https://bajnews.net/a/', 'جملة', 'held', 'قراءة موثوقة تنتظر اعتماد الإدارة'),
  ('fx_parallel', '2026-10-24', 9600, 10100, 'https://bajnews.net/b/', 'جملة', 'held', 'قراءة موثوقة تنتظر اعتماد الإدارة'),
  ('fx_parallel', '2026-10-23', 90000, 100000, 'https://bajnews.net/c/', 'جملة', 'held', 'قفزة عن آخر رقم — يُراجَع');
insert into market_quotes (kind, market, crop, unit, market_date, price, source_url, status, reason) values
  ('crop', 'obeid', 'millet', 'qintar', '2026-10-24', 410000, 'https://sudafax.com/d/', 'held', 'قراءة موثوقة تنتظر اعتماد الإدارة');

-- Nobody deletes: not the owner role, not a visitor, not an administrator by a plain DELETE, not a truncate.
do $$ begin
  perform _refuses($q$delete from market_quotes$q$, 'لا حذفَ مباشراً حتى بصلاحية صاحب الجدول');
  perform _refuses($q$delete from market_quotes where status = 'rejected'$q$, 'ولا حذفَ المرفوض');
  perform _refuses($q$truncate market_quotes$q$, 'ولا تفريغ');
end $$;
set role authenticated;
do $$ begin
  perform _act_as('f6000000-0000-0000-0000-0000000000f6');
  perform _refuses($q$delete from market_quotes$q$, 'والمديرُ نفسه لا يحذف بـDELETE (يمحو بالدالّة وحدها)');
  perform _refuses($q$truncate market_quotes$q$, 'ولا يفرّغ');
end $$;
reset role;
set role anon;
do $$ begin
  perform _refuses($q$delete from market_quotes$q$, 'والزائر لا يحذف');
  perform _refuses($q$select market_quote_erase((select id from market_quotes limit 1), 'سبب كافٍ')$q$, 'ولا يمحو بالدالّة');
  perform _refuses($q$select market_quote_review_all()$q$, 'ولا يعتمد بنقرة');
end $$;
reset role;

-- The administrator's erasure: a reason is needed, a snapshot is kept, and the row goes.
set role authenticated;
do $$
declare victim uuid; n_before integer; n_after integer; snap jsonb;
begin
  perform _act_as('c3000000-0000-0000-0000-0000000000c3');
  perform _refuses($q$select market_quote_erase((select id from market_quotes limit 1), 'سبب كافٍ')$q$, 'المسجَّل غير المدير لا يمحو');
  perform _refuses($q$select market_quote_review_all()$q$, 'ولا يعتمد بنقرة');
  perform _act_as('f6000000-0000-0000-0000-0000000000f6');
  select id into victim from market_quotes where reason like 'قفزة%';
  perform _refuses(format($q$select market_quote_erase(%L, 'ab')$q$, victim), 'والمحو بلا سببٍ كافٍ يُرفض');
  perform _refuses($q$select market_quote_erase('00000000-0000-0000-0000-000000000000', 'سبب كافٍ')$q$, 'ورقمٌ غير موجود');
  select count(*) into n_before from market_quotes;
  perform market_quote_erase(victim, 'قراءة خاطئة: القفزة من خطأ طباعة في الخبر');
  select count(*) into n_after from market_quotes;
  perform _eq(n_before - n_after, 1, 'المديرُ يمحو صفّاً واحداً بالدالّة');
  perform _eq((select count(*)::int from market_quotes where id = victim), 0, 'وهو الصفّ المطلوب');
  select quote into snap from market_quote_erasures order by erased_at desc limit 1;
  perform _eq(snap ->> 'source_url', 'https://bajnews.net/c/', 'ولقطته محفوظة بمصدرها');
  perform _eq((snap ->> 'sell')::numeric, 100000::numeric, 'وبرقمها');
  perform _eq((select erased_by from market_quote_erasures order by erased_at desc limit 1), 'f6000000-0000-0000-0000-0000000000f6'::uuid, 'ومن محاه');
  perform _eq((select reason from market_quote_erasures order by erased_at desc limit 1), 'قراءة خاطئة: القفزة من خطأ طباعة في الخبر', 'وسببه');
  perform _eq((select count(*)::int from market_quote_erasures), 1, 'ولا سجلّ محوٍ غيره');
  perform _act_as('c3000000-0000-0000-0000-0000000000c3');
  perform _eq((select count(*)::int from market_quote_erasures), 0, 'وغير المدير لا يقرأ سجلّ المحو');
end $$;
reset role;
do $$ begin
  perform _refuses($q$update market_quote_erasures set reason = 'xyz'$q$, 'ولا يُعدَّل سجلّ المحو');
  perform _refuses($q$delete from market_quote_erasures$q$, 'ولا يُحذف منه');
end $$;

-- One click: only what the system held because it publishes nothing itself.
set role authenticated;
do $$
declare n integer;
begin
  perform _act_as('f6000000-0000-0000-0000-0000000000f6');
  perform _eq((select count(*)::int from market_quotes where status = 'held'), 3, 'قبل النقرة: ثلاثة محجوزات مقروءة بيقين (والنصّ الحرّ القديم نُشر في أ)');
  n := market_quote_review_all();
  perform _eq(n, 3, 'النقرة تعتمد ما قُرئ بيقين: دولاران ومحصول');
  perform _eq((select count(*)::int from market_quotes where status = 'published' and reason = 'قراءة موثوقة تنتظر اعتماد الإدارة' and reviewed_by is not null and reviewed_at is not null), 3, 'وتسجّل من اعتمد ومتى');
  perform _eq((select count(*)::int from market_quotes where status = 'held'), 0, 'ولا يبقى محجوزٌ');
  perform _eq(market_quote_review_all(), 0, 'والنقرة الثانية لا تجد شيئاً');
end $$;
reset role;

-- A figure held for its strangeness is not approved by the click.
insert into market_quotes (kind, market_date, buy, sell, source_url, quote, status, reason) values
  ('fx_bank', '2026-10-25', 4900, 99000, 'https://bajnews.net/e/', 'جملة', 'held', 'قفزة عن آخر رقم — يُراجَع'),
  ('fx_bank', '2026-10-26', 4900, 4960, 'https://bajnews.net/f/', 'جملة', 'held', 'قراءة موثوقة تنتظر اعتماد الإدارة');
set role authenticated;
do $$ begin
  perform _act_as('f6000000-0000-0000-0000-0000000000f6');
  perform _eq(market_quote_review_all(), 1, 'النقرة تعتمد المقروء بيقين وحده');
  perform _eq((select status from market_quotes where source_url = 'https://bajnews.net/e/'), 'held', 'وما شذّ يبقى محجوزاً لقرارٍ منفرد');
  perform _eq((select status from market_quotes where source_url = 'https://bajnews.net/f/'), 'published', 'والمقروء بيقين نُشر');
end $$;
reset role;

do $$ begin
  perform _eq(has_function_privilege('anon', 'market_quote_erase(uuid,text)', 'execute'), false, 'المحو ليس للزائر');
  perform _eq(has_function_privilege('service_role', 'market_quote_erase(uuid,text)', 'execute'), false, 'ولا لمفتاح الخدمة');
  perform _eq(has_function_privilege('service_role', 'market_quote_review_all()', 'execute'), false, 'ولا الاعتماد بنقرة');
  perform _eq(has_function_privilege('authenticated', 'market_quotes_keep()', 'execute'), false, 'والحارس الداخليّ لا يستدعيه أحد');
  perform _eq(has_table_privilege('service_role', 'market_quotes', 'delete'), false, 'ومفتاح الخدمة لا يملك DELETE');
  perform _eq(has_table_privilege('service_role', 'market_quotes', 'truncate'), false, 'ولا TRUNCATE');
  perform _eq(has_table_privilege('authenticated', 'market_quotes', 'truncate'), false, 'والمسجَّل لا يملك TRUNCATE');
  perform _eq(has_table_privilege('anon', 'market_quotes', 'truncate'), false, 'والزائر لا يملك TRUNCATE');
end $$;

\echo ''
\echo '=========================================================================='

do $$
declare f integer;
begin
  select fails into f from _score;
  if f > 0 then raise exception 'فشل % فحصاً.', f; end if;
  raise notice 'ALL CHECKS PASSED — الزائرُ يرى المنشور وحده، والمحجوزُ ينتظر المدير';
end $$;
