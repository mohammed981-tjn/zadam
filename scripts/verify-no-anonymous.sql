-- لا حسابات مجهولة (20261104030000).

\set ON_ERROR_STOP on
\set QUIET on
set client_min_messages = notice;
\o /dev/null

create temp table _score (fails integer not null default 0);
insert into _score values (0);
create function pg_temp._ok(c boolean, label text) returns void language plpgsql as $$
begin
  if c then raise notice '  PASS  %', label;
  else raise notice '  FAIL  %', label; update _score set fails = fails + 1; end if;
end $$;

do $$ declare refused boolean := false; begin
  begin
    insert into auth.users (id, is_anonymous) values ('a0000000-0000-0000-0000-0000000000a0', true);
  exception when others then refused := sqlerrm like '%الدخول بلا حساب مغلقٌ%';
  end;
  perform pg_temp._ok(refused, 'حسابٌ مجهولٌ لا يُنشأ، ويُقال لماذا');
end $$;

insert into auth.users (id) values ('b0000000-0000-0000-0000-0000000000b0');
select pg_temp._ok(exists (select 1 from auth.users where id = 'b0000000-0000-0000-0000-0000000000b0'), 'والحساب العاديّ يُنشأ كما كان');

do $$ declare refused boolean := false; begin
  begin
    update auth.users set is_anonymous = true where id = 'b0000000-0000-0000-0000-0000000000b0';
  exception when others then refused := true;
  end;
  perform pg_temp._ok(refused, 'ولا يصير حسابٌ قائمٌ مجهولاً');
end $$;

select pg_temp._ok(not has_function_privilege('authenticated', 'public.refuse_anonymous_account()', 'execute'), 'والدالّة لا يناديها عضو');

do $$ declare f integer; begin
  select fails into f from _score;
  if f = 0 then raise notice 'ALL CHECKS PASSED'; else raise exception '% CHECK(S) FAILED', f; end if;
end $$;
