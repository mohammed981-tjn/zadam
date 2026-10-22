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
\echo '=========================================================================='

do $$
declare f integer;
begin
  select fails into f from _score;
  if f > 0 then raise exception 'فشل % فحصاً.', f; end if;
  raise notice 'ALL CHECKS PASSED — الزائرُ يرى المنشور وحده، والمحجوزُ ينتظر المدير';
end $$;
