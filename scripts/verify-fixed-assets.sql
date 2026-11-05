-- بوّابةُ الأصول الثابتة والإهلاك (البند ١٩٠).
\set ON_ERROR_STOP on
\set QUIET on

create table if not exists _score (fails integer not null default 0);
delete from _score; insert into _score values (0);
create or replace function _fail(label text, why text) returns void language plpgsql as $$
begin raise notice '  FAIL  % — %', label, why; update _score set fails = fails + 1; end $$;
create or replace function _pass(label text) returns void language plpgsql as $$
begin raise notice '  PASS  %', label; end $$;
create or replace function _act_as(p uuid) returns void language plpgsql as $$ begin update _who set uid = p; end $$;
create or replace function _eq(got anyelement, want anyelement, label text) returns void language plpgsql as $$
begin
  if got is not distinct from want then perform _pass(label || ' — ' || coalesce(got::text, 'null'));
  else perform _fail(label, 'جاء ' || coalesce(got::text, 'null') || ' والمتوقَّع ' || coalesce(want::text, 'null')); end if;
end $$;
create or replace function _bk(p_owner uuid) returns uuid language sql stable security definer as $$
  select id from ledger_books where owner_id = p_owner and kind = 'farm' $$;
-- A balance of an account by its system key, debit positive, in cents.
create or replace function _bal(p_book uuid, p_key text) returns bigint language sql stable security definer as $$
  select coalesce(sum(case l.side when 'D' then l.base_minor else -l.base_minor end), 0)::bigint
    from journal_lines l join ledger_accounts a on a.id = l.account_id
   where l.book_id = p_book and a.system_key = p_key $$;
-- Month ends after the acquisition month, up to today, after a closed date.
create or replace function _due(p_acq date, p_life int, p_after date) returns int language sql stable as $$
  select count(*)::int from generate_series(1, p_life) k
   where (date_trunc('month', p_acq) + make_interval(months => k + 1) - interval '1 day')::date <= ledger_today()
     and (p_after is null or (date_trunc('month', p_acq) + make_interval(months => k + 1) - interval '1 day')::date > p_after) $$;

insert into auth.users (id) values
  ('a1000000-0000-0000-0000-0000000000a1'), ('b2000000-0000-0000-0000-0000000000b2'), ('ad000000-0000-0000-0000-0000000000ad')
on conflict (id) do nothing;
insert into profiles (id, full_name, role) values
  ('ad000000-0000-0000-0000-0000000000ad', 'مدير', 'admin'),
  ('a1000000-0000-0000-0000-0000000000a1', 'أ', 'investor'),
  ('b2000000-0000-0000-0000-0000000000b2', 'ب', 'investor')
on conflict (id) do update set role = excluded.role;

select ledger_open_book_for('a1000000-0000-0000-0000-0000000000a1', 'farm') is not null as a_farm;
select ledger_open_book_for('b2000000-0000-0000-0000-0000000000b2', 'farm') is not null as b_farm;
select ledger_open_book_for('b2000000-0000-0000-0000-0000000000b2', 'investor') is not null as b_investor;

grant usage on schema public, auth to anon, authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated, service_role;
grant select, update on _score to anon, authenticated, service_role;
grant select, update on _who to anon, authenticated, service_role;
grant execute on function _fail(text,text), _pass(text), _act_as(uuid), _eq(anyelement,anyelement,text), _bk(uuid),
  _bal(uuid,text), _due(date,int,date) to anon, authenticated, service_role;

create table _ids (k text primary key, id uuid);
grant all on _ids to authenticated, service_role;

\echo ''
\echo '=========================================================================='
\echo 'أ) الشراء قيدٌ واحد، والإهلاك يبلغ (التكلفة − الخردة) تماماً'
\echo '=========================================================================='
set role authenticated;
do $$
declare b uuid := _bk('a1000000-0000-0000-0000-0000000000a1'); acq date := (date_trunc('month', ledger_today()) - interval '20 months')::date + 9; v uuid; n int;
begin
  perform _act_as('a1000000-0000-0000-0000-0000000000a1');
  v := ledger_asset_add(b, 'جرّار ماسي', 'machinery', acq, 1000, 100, 7, 'cash_on_hand');
  insert into _ids values ('tractor', v);
  perform _eq(_bal(b, 'machinery'), 100000::bigint, 'الآلات مدينةٌ بالثمن ١٠٠٠$');
  perform _eq(_bal(b, 'cash_on_hand'), -100000::bigint, 'والنقد دائنٌ به');
  perform _eq((select count(*)::int from journal_entries where book_id = b and source_type = 'fixed_asset' and source_id = v), 1, 'قيدُ شراءٍ واحد بمصدره');
  n := ledger_asset_depreciate(b);
  perform _eq(n, 7, 'سبعة أشهر قُيِّدت (عمر الأصل كلّه مضى)');
  perform _eq(_bal(b, 'depreciation'), 90000::bigint, 'مصروف الإهلاك ٩٠٠$ = الثمن − الخردة، لا سنتاً زائداً');
  perform _eq(_bal(b, 'accumulated_depreciation'), -90000::bigint, 'والمجمّع دائنٌ بها');
  perform _eq((select max(l.base_minor) - min(l.base_minor) from journal_entries e join journal_lines l on l.entry_id = e.id and l.side = 'D'
                where e.book_id = b and e.source_type = 'depreciation' and e.source_id = v)::int, 1,
              'القسط ١٢٨٫٥٧$، والشهر الأخير ١٢٨٫٥٨$ يأخذ الباقي');
  perform _eq((select min(entry_date) from journal_entries where book_id = b and source_type = 'depreciation' and source_id = v),
              (date_trunc('month', acq) + interval '2 months' - interval '1 day')::date, 'أوّل قسطٍ بآخر يومٍ من الشهر التالي للشراء');
  perform _eq(ledger_asset_depreciate(b), 0, 'وتكرار الزرّ لا يقيّد شيئاً');
  perform _eq((select months_posted from ledger_fixed_assets_summary(b) where id = v), 7, 'السجلّ: ٧ أشهر');
  perform _eq((select book_value_minor from ledger_fixed_assets_summary(b) where id = v), 10000::bigint, 'والقيمة الدفتريّة ١٠٠$ = الخردة');
end $$;

\echo ''
\echo '=========================================================================='
\echo 'ب) أصلٌ عمره طويل: ما انتهى من الأشهر وحده، ولا شيءَ في فترةٍ مقفلة'
\echo '=========================================================================='
do $$
declare b uuid := _bk('a1000000-0000-0000-0000-0000000000a1'); acq date := (date_trunc('month', ledger_today()) - interval '6 months')::date + 3;
        closed date := (date_trunc('month', ledger_today()) - interval '3 months' - interval '1 day')::date; v uuid; want int;
begin
  perform _act_as('a1000000-0000-0000-0000-0000000000a1');
  v := ledger_asset_add(b, 'بئرٌ ومضخّة', 'land_improvements', acq, 6000, 0, 120, 'owner_capital');
  insert into _ids values ('well', v);
  perform _eq(_bal(b, 'owner_capital'), -600000::bigint, 'أصلٌ كان عنده قبل الدفتر: رأس المال دائن');
  perform ledger_close_through(b, closed);
  want := _due(acq, 120, closed);
  perform _eq(ledger_asset_depreciate(b), want, 'قُيِّدت الأشهر المنتهية بعد الإقفال وحدها');
  perform _eq((select count(*)::int from journal_entries where book_id = b and source_type = 'depreciation' and source_id = v and entry_date <= closed), 0,
              'ولا قيدَ في الفترة المقفلة');
  perform _eq((select count(*)::int from journal_entries where book_id = b and source_type = 'depreciation' and source_id = v and entry_date > ledger_today()), 0,
              'ولا قيدَ لشهرٍ لم ينتهِ');
  perform _eq((select bool_and(l.base_minor = 5000) from journal_entries e join journal_lines l on l.entry_id = e.id and l.side = 'D'
                where e.book_id = b and e.source_type = 'depreciation' and e.source_id = v), true, 'القسط ٥٠$ (٦٠٠٠ ÷ ١٢٠)');
end $$;

\echo ''
\echo '=========================================================================='
\echo 'ج) ما يُرفض'
\echo '=========================================================================='
do $$
declare b uuid := _bk('a1000000-0000-0000-0000-0000000000a1'); bb uuid := _bk('b2000000-0000-0000-0000-0000000000b2');
        binv uuid := (select id from ledger_books where owner_id = 'b2000000-0000-0000-0000-0000000000b2' and kind = 'investor');
        closed date := (select closed_through from ledger_books where id = b);
  procedure_ok boolean;
begin
  perform _act_as('a1000000-0000-0000-0000-0000000000a1');
  begin perform ledger_asset_add(b, 'مضخّة', 'machinery', ledger_today() + 1, 500, 0, 24, 'bank'); perform _fail('تاريخٌ بعد اليوم', 'قُبل');
  exception when others then perform _pass('تاريخ شراءٍ بعد اليوم يُرفض'); end;
  begin perform ledger_asset_add(b, 'مضخّة', 'machinery', ledger_today(), 500, 500, 24, 'bank'); perform _fail('خردةٌ بالثمن', 'قُبلت');
  exception when others then perform _pass('خردةٌ تساوي الثمن تُرفض'); end;
  begin perform ledger_asset_add(b, 'مضخّة', 'machinery', ledger_today(), 500, 0, 3, 'bank'); perform _fail('عمر ٣ أشهر', 'قُبل');
  exception when others then perform _pass('عمرٌ أقلّ من ٦ أشهر يُرفض'); end;
  begin perform ledger_asset_add(b, 'مضخّة', 'livestock', ledger_today(), 500, 0, 24, 'bank'); perform _fail('حسابٌ غير الأصول', 'قُبل');
  exception when others then perform _pass('حسابٌ غير الآلات والتحسينات يُرفض'); end;
  begin perform ledger_asset_add(b, 'مضخّة', 'machinery', closed, 500, 0, 24, 'bank'); perform _fail('شراءٌ في فترةٍ مقفلة', 'قُبل');
  exception when others then perform _pass('شراءٌ في فترةٍ مقفلة يُرفض');
  end;
  perform _eq((select count(*)::int from ledger_fixed_assets where name = 'مضخّة'), 0, 'ولم يبقَ أصلٌ من محاولةٍ رُفضت (الأصل والقيد معاً أو لا شيء)');

  perform _act_as('b2000000-0000-0000-0000-0000000000b2');
  begin perform ledger_asset_add(b, 'سرقة', 'machinery', ledger_today(), 500, 0, 24, 'bank'); perform _fail('دفتر غيره', 'قُبل');
  exception when others then perform _pass('لا يسجّل أحدٌ أصلاً في دفتر غيره'); end;
  begin perform ledger_asset_depreciate(b); perform _fail('إهلاك دفتر غيره', 'قُبل');
  exception when others then perform _pass('ولا يقيّد إهلاكه'); end;
  perform _eq((select count(*)::int from ledger_fixed_assets_summary(b)), 0, 'ولا يقرأ سجلّه');
  perform _eq((select count(*)::int from ledger_fixed_assets), 0, 'ولا صفوفه في الجدول');
  begin perform ledger_asset_add(binv, 'جرّار', 'machinery', ledger_today(), 500, 0, 24, 'bank'); perform _fail('دفتر المستثمر', 'قُبل');
  exception when others then perform _pass('دفتر المستثمر لا أصول ثابتة فيه'); end;
  begin insert into ledger_fixed_assets (book_id, name, account_key, acquired_on, cost_minor, life_months, paid_from)
        values (bb, 'مباشر', 'machinery', ledger_today(), 10000, 24, 'bank'); perform _fail('كتابةٌ مباشرة', 'قُبلت');
  exception when others then perform _pass('ولا يُكتب الجدول مباشرةً'); end;
  begin perform ledger_depreciate_all(); perform _fail('إهلاك الجميع من مسجَّل', 'قُبل');
  exception when others then perform _pass('ولا يستدعي مسجَّلٌ إهلاك الجميع'); end;

  perform _act_as('ad000000-0000-0000-0000-0000000000ad');
  perform _eq((select count(*)::int from ledger_fixed_assets_summary(b)), 2, 'والمدير يقرأ السجلّ');
end $$;
reset role;

\echo ''
\echo '=========================================================================='
\echo 'د) مسك الدفاتر اليوميّ، والميزان'
\echo '=========================================================================='
do $$
declare b uuid := _bk('b2000000-0000-0000-0000-0000000000b2'); acq date := (date_trunc('month', ledger_today()) - interval '4 months')::date; v uuid; want int;
begin
  perform _act_as('b2000000-0000-0000-0000-0000000000b2');
  v := ledger_asset_add(b, 'محراث', 'machinery', acq, 1200, 0, 24, 'bank');
  want := _due(acq, 24, null);
  perform _act_as(null);
  perform _eq(ledger_depreciate_all(), want, 'الإهلاك اليوميّ قيّد ما استحقّ للمحراث وحده (ما سبق قُيِّد، والمقفل لا يُقيَّد)');
  perform _eq(ledger_depreciate_all(), 0, 'وتكراره في اليوم لا يقيّد شيئاً');
  perform _eq((select sum(case side when 'D' then base_minor else -base_minor end) from journal_lines)::bigint, 0::bigint, 'الدفاتر كلّها متوازنة: المدين = الدائن');
end $$;
do $$
begin
  perform _eq(has_function_privilege('anon', 'ledger_asset_add(uuid,text,text,date,numeric,numeric,integer,text)', 'execute')
              or has_function_privilege('anon', 'ledger_asset_depreciate(uuid)', 'execute')
              or has_function_privilege('anon', 'ledger_fixed_assets_summary(uuid)', 'execute'), false, 'الزائر لا يستدعي شيئاً');
  perform _eq(has_function_privilege('authenticated', '_ledger_depreciate(uuid,uuid)', 'execute'), false, 'ولا يستدعي المسجَّل الدالّةَ الداخليّة');
  perform _eq(has_function_privilege('service_role', 'ledger_depreciate_all()', 'execute'), true, 'ومفتاح الخدمة يستدعي الإهلاك اليوميّ');
end $$;

do $$
declare n integer;
begin
  select fails into n from _score;
  if n > 0 then raise exception '% فحصاً فشل', n; end if;
end $$;
\echo ''
\echo 'OK'
