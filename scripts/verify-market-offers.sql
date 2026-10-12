-- بوّابةُ عروض البيع والشراء: يقرأ الناسُ المفتوح، ويكتب كلٌّ عرضه بدالّة.
--
-- Strangers read open, unexpired offers and nothing else; an owner also reads
-- his own closed ones; nobody writes the table directly; only the owner closes
-- an offer; one account keeps at most ten open and adds at most twenty a day;
-- and anon cannot call either function.
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

-- Refused, and for the reason the label claims: a cap test that passes
-- because of a typo elsewhere proves nothing.
create or replace function _refuses_with(stmt text, msg text, label text) returns void
language plpgsql as $$
begin
  begin execute stmt;
  exception when others then
    if sqlerrm = msg then perform _pass(label);
    else perform _fail(label, 'رُفض بسببٍ آخر: ' || sqlerrm);
    end if;
    return;
  end;
  perform _fail(label, 'نُفِّذ وكان يجب أن يُرفض');
end $$;

create or replace function _act_as(p uuid) returns void
language plpgsql as $$ begin update _who set uid = p; end $$;

-- An offer as the current role would publish it from the form.
create or replace function _mk(p_state text default 'القضارف') returns uuid
language sql as $$
  select market_offer_create('sell', 'سمسم', 50, 'qintar', 'أبيض نظيف', p_state, 'سوق القضارف',
                             280000, null, '249912345678', true, null, 30)
$$;

insert into auth.users (id) values
  ('a1000000-0000-0000-0000-0000000000a1'),
  ('b2000000-0000-0000-0000-0000000000b2')
on conflict (id) do nothing;

grant usage on schema public, auth to anon, authenticated;
grant execute on function auth.uid() to anon, authenticated;
create table _c (id uuid);
grant all on _c, _score, _who to anon, authenticated;
grant execute on function _mk(text), _fail(text, text), _pass(text), _refuses(text, text), _refuses_with(text, text, text), _changes_nothing(text, text) to anon, authenticated;

\echo ''
\echo 'أ) المزارع ينشر عرضه بالدالّة، ولا يكتب الجدول مباشرة'

do $$ begin perform _act_as('a1000000-0000-0000-0000-0000000000a1'); end $$;
set role authenticated;
do $$ begin
  insert into _c values (_mk());
  perform _eq((select created_by from market_offers where id = (select id from _c)),
              'a1000000-0000-0000-0000-0000000000a1'::uuid, 'صاحب العرض هو مَن نشره، لا قيمةٌ يرسلها');
  perform _refuses($q$insert into market_offers (kind, crop, quantity, unit, state, locality, contact_phone, created_by)
    values ('sell', 'سمسم', 1, 'qintar', 'القضارف', 'السوق', '249912345678', 'b2000000-0000-0000-0000-0000000000b2')$q$,
    'ولا يُكتب الجدول مباشرةً');
  perform _changes_nothing($q$update market_offers set price_sdg = 1$q$, 'ولا يُعدَّل مباشرةً');
  perform _changes_nothing($q$delete from market_offers$q$, 'ولا يُحذف مباشرةً');
  perform _refuses($q$select _mk('ولاية لا وجود لها')$q$, 'والولاية من القائمة المغلقة');
end $$;

\echo ''
\echo 'ب) الزائر بلا حساب يقرأ المفتوح ولا يكتب'

reset role;
do $$ begin perform _act_as(null); end $$;
set role anon;
do $$ begin
  perform _eq((select count(*)::int from market_offers), 1, 'يرى العرض المفتوح');
  perform _refuses($q$select _mk()$q$, 'ولا ينادي دالّة النشر');
  perform _refuses($q$select market_offer_close((select id from _c))$q$, 'ولا دالّة الإغلاق');
end $$;

\echo ''
\echo 'ج) الإغلاق لصاحبه وحده'

reset role;
do $$ begin perform _act_as('b2000000-0000-0000-0000-0000000000b2'); end $$;
set role authenticated;
do $$ begin
  perform _refuses_with($q$select market_offer_close((select id from _c))$q$, 'لا عرضَ مفتوحاً لك بهذا الرقم.', 'الغريب لا يغلق عرض غيره');
end $$;

reset role;
do $$ begin perform _act_as('a1000000-0000-0000-0000-0000000000a1'); end $$;
set role authenticated;
do $$ begin
  perform market_offer_close((select id from _c));
  perform _eq((select status from market_offers where id = (select id from _c)), 'closed', 'صاحبه يغلقه، ويبقى يراه في عروضه');
  perform _refuses($q$select market_offer_close((select id from _c))$q$, 'ولا يُغلق مرّتين');
end $$;

reset role;
do $$ begin perform _act_as(null); end $$;
set role anon;
do $$ begin
  perform _eq((select count(*)::int from market_offers), 0, 'والمغلق لا يراه الناس');
end $$;

\echo ''
\echo 'د) المنتهية مدّته يختفي، والسقف عشرة مفتوحة وعشرون في اليوم'

reset role;
do $$ begin perform _act_as('a1000000-0000-0000-0000-0000000000a1'); end $$;
set role authenticated;
do $$ begin
  for i in 1..10 loop perform _mk(); end loop;
  perform _refuses_with($q$select _mk()$q$, 'لديك عشرة عروضٍ مفتوحة. أغلق واحداً قبل أن تضيف غيره.', 'العرض الحادي عشر المفتوح يُرفض');
end $$;

reset role;
update market_offers set expires_at = now() - interval '1 minute'
  where id = (select id from market_offers where status = 'open' order by created_at limit 1);
do $$ begin perform _act_as(null); end $$;
set role anon;
do $$ begin
  perform _eq((select count(*)::int from market_offers), 9, 'المنتهية مدّته لا يراه الناس');
end $$;

reset role;
do $$ begin perform _act_as('a1000000-0000-0000-0000-0000000000a1'); end $$;
set role authenticated;
do $$ begin
  -- One slot freed by the expiry: 1 + 10 + this one = 12 today.
  perform _mk();
  for i in 1..9 loop
    perform market_offer_close((select id from market_offers where status = 'open' and expires_at > now() order by created_at limit 1));
  end loop;
  for i in 1..8 loop perform _mk(); end loop;  -- 20 created today, 9 of them open
  perform _refuses_with($q$select _mk()$q$, 'أضفتَ عشرين عرضاً اليوم. عُد غداً.', 'والعرض الحادي والعشرون في اليوم يُرفض وإن أُغلق ما قبله');
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
