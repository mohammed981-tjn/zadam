-- بوّابةُ اختيار الدور: يقول المرءُ أيَّهما هو، ولا يقول إنّه مدير.
--
-- WHY THE GATE CREATES THE TRIGGER ITSELF
--
-- `profiles_guard_role` exists in production — verified by reading
-- `pg_trigger` there — and is created by **no migration and no fixture**. The
-- same family of gap already documented for `enforce_land_listing_gate` and
-- `enforce_stage_completion`: the function is declared in the repository, the
-- trigger that arms it is not.
--
-- So this gate attaches it explicitly, and says so rather than pretending the
-- migration did it. A guard tested without being armed is not tested.
--
-- والحمولةُ الخبيثةُ تُجرَّب، لا تُفترض
--
-- `handle_new_user` now reads a role out of `raw_user_meta_data`, which is
-- client-written text. So the gate signs up an account whose payload literally
-- says `"role": "admin"` and checks what the profile actually got.

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

create or replace function _act_as(p uuid) returns void
language plpgsql as $$ begin update _who set uid = p; end $$;

-- الزنادان اللذان لا تُنشئهما هجرةٌ ولا تجهيزة، وهما قائمان في الإنتاج.
drop trigger if exists profiles_guard_role on profiles;
create trigger profiles_guard_role
  before update on profiles
  for each row execute function prevent_self_role_escalation();

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- والتجهيزةُ تحمل `auth.users(id)` وحده، فيُضاف ما تقرأه الدالّة.
alter table auth.users add column if not exists raw_user_meta_data jsonb;
alter table auth.users add column if not exists phone text;

insert into profiles (id, full_name, role) values
  ('ad000000-0000-0000-0000-0000000000ad', 'المدير', 'admin');

grant usage on schema public, auth to anon, authenticated;
grant select, insert, update, delete on all tables in schema public to anon, authenticated;
grant execute on function auth.uid() to anon, authenticated;
grant execute on function public.is_admin() to anon, authenticated;

\echo ''
\echo '=========================================================================='
\echo 'أ) التسجيلُ يقرأ الاختيار — والافتراضيُّ مزارع'
\echo '=========================================================================='

do $$
begin
  insert into auth.users (id, raw_user_meta_data) values
    ('fa000000-0000-0000-0000-00000000fa01', '{"full_name":"مزارع","role":"farmer"}'),
    ('fa000000-0000-0000-0000-00000000fa02', '{"full_name":"مستثمر","role":"investor"}'),
    ('fa000000-0000-0000-0000-00000000fa03', '{"full_name":"صامت"}');

  perform _eq((select role::text from profiles where id='fa000000-0000-0000-0000-00000000fa01'),
    'farmer', 'من قال إنّه مزارعٌ صار مزارعاً');
  perform _eq((select role::text from profiles where id='fa000000-0000-0000-0000-00000000fa02'),
    'investor', 'ومن قال مستثمرٌ صار مستثمراً');

  -- المنصّةُ اليومَ لا يعمل استثمارُها، وأمام الواصلِ أرضٌ وموسمٌ وجواز.
  perform _eq((select role::text from profiles where id='fa000000-0000-0000-0000-00000000fa03'),
    'farmer', 'ومن لم يقل شيئاً فمزارعٌ — لا مستثمرٌ كما كان');
end $$;

\echo ''
\echo '=========================================================================='
\echo 'ب) ولا يُسجَّل أحدٌ مديراً مهما كتب في حمولته'
\echo '=========================================================================='

do $$
begin
  -- حمولةٌ مصنوعةٌ باليد. والدالّةُ `security definer` تقرأ نصّاً كتبه العميل.
  insert into auth.users (id, raw_user_meta_data) values
    ('ba000000-0000-0000-0000-00000000ba01', '{"full_name":"طامع","role":"admin"}'),
    ('ba000000-0000-0000-0000-00000000ba02', '{"full_name":"طامعٌ آخر","role":"field_agent"}');

  perform _eq((select role::text from profiles where id='ba000000-0000-0000-0000-00000000ba01'),
    'farmer', 'من كتب «admin» في تسجيله خرج مزارعاً');
  perform _eq((select role::text from profiles where id='ba000000-0000-0000-0000-00000000ba02'),
    'farmer', 'وكذلك من كتب «field_agent»');
  perform _eq((select count(*)::int from profiles where role = 'admin'), 1,
    'ويبقى المديرُ واحداً — الذي أُدرج مباشرةً في التجهيزة');
end $$;

\echo ''
\echo '=========================================================================='
\echo 'ج) والانتقالُ بين الدورين اللذين لا يمنحان شيئاً — مسموح'
\echo '=========================================================================='

do $$ begin perform _act_as('fa000000-0000-0000-0000-00000000fa02'); end $$;
set role authenticated;

do $$
begin
  update profiles set role = 'farmer' where id = 'fa000000-0000-0000-0000-00000000fa02';
  perform _eq((select role::text from profiles where id='fa000000-0000-0000-0000-00000000fa02'),
    'farmer', 'مستثمرٌ اكتشف أنّه يزرع فصار مزارعاً');

  update profiles set role = 'investor' where id = 'fa000000-0000-0000-0000-00000000fa02';
  perform _eq((select role::text from profiles where id='fa000000-0000-0000-0000-00000000fa02'),
    'investor', 'ويعود إن شاء — فلا أحدَ من الاتّجاهين يفتح باباً');
end $$;

reset role;

\echo ''
\echo '=========================================================================='
\echo 'د) وما يمنح صلاحيةً يُرجَع بصمت — كما كان'
\echo '=========================================================================='

do $$ begin perform _act_as('fa000000-0000-0000-0000-00000000fa01'); end $$;
set role authenticated;

do $$
begin
  -- لا خطأ يُرفع: الرجوعُ صامتٌ عمداً، فلا يعرف الجاسُّ أيَّ حقلٍ يُراقَب.
  update profiles set role = 'admin' where id = 'fa000000-0000-0000-0000-00000000fa01';
  perform _eq((select role::text from profiles where id='fa000000-0000-0000-0000-00000000fa01'),
    'farmer', 'مزارعٌ يرفع نفسَه مديراً — يُرجَع ويبقى مزارعاً');

  update profiles set role = 'field_agent' where id = 'fa000000-0000-0000-0000-00000000fa01';
  perform _eq((select role::text from profiles where id='fa000000-0000-0000-0000-00000000fa01'),
    'farmer', 'ولا يصير مندوباً ميدانياً — وهو دورٌ لم يُفتح للاختيار');
end $$;

reset role;

-- وعدُّ المديرين يجري بعد `reset role` عمداً.
--
-- كتبتُه أوّلاً داخل جلسة المزارع فجاء صفراً، فظننتُ لحظةً أنّ صفَّ المدير
-- اختفى — وإنّما كانت سياسةُ القراءة ترشّحه عن عينِ من لا يملكه. فحصٌ كهذا
-- يقيس الرؤيةَ لا الوجود، ويمرّ أو يسقط لسببٍ غير الذي كُتب له.
do $$
begin
  perform _eq((select count(*)::int from profiles where role = 'admin'), 1,
    'وعددُ المديرين لم يتغيّر — ويُقرأ بلا دورٍ مقيَّد');
end $$;

\echo ''
\echo '=========================================================================='
\echo 'هـ) ولا يمسّ أحدٌ دورَ غيره'
\echo '=========================================================================='

do $$ begin perform _act_as('fa000000-0000-0000-0000-00000000fa01'); end $$;
set role authenticated;

do $$
declare touched integer;
begin
  update profiles set role = 'admin' where id = 'ad000000-0000-0000-0000-0000000000ad';
  get diagnostics touched = row_count;
  perform _eq(touched, 0, 'ولا يكتب في صفّ غيره أصلاً — السياسةُ ترشّحه');
end $$;

reset role;

\echo ''
\echo '=========================================================================='
\echo 'و) والمديرُ يبقى قادراً على التعيين'
\echo '=========================================================================='

do $$ begin perform _act_as('ad000000-0000-0000-0000-0000000000ad'); end $$;
set role authenticated;

do $$
begin
  -- ولولا هذا لصارت المنصّةُ بلا طريقٍ لتعيين موظّفٍ أبداً.
  update profiles set role = 'field_agent' where id = 'fa000000-0000-0000-0000-00000000fa03';
  perform _eq((select role::text from profiles where id='fa000000-0000-0000-0000-00000000fa03'),
    'field_agent', 'المديرُ يعيّن مندوباً ميدانياً');
end $$;

reset role;

\echo ''
\echo '=========================================================================='

do $$
declare f integer;
begin
  select fails into f from _score;
  if f > 0 then raise exception 'فشل % فحصاً.', f; end if;
  raise notice 'ALL CHECKS PASSED — يقول المرءُ أيَّهما هو ولا يقول إنّه مدير';
end $$;
