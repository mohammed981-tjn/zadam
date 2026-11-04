-- حرّاس 4 نوفمبر: 20261104040000 و20261104050000 و20261104060000.

\set ON_ERROR_STOP on
\set QUIET on
set client_min_messages = notice;
\o /dev/null

create table _score (fails integer not null default 0);
insert into _score values (0);
grant all on _score to public;
create function _ok(c boolean, label text) returns void language plpgsql as $$
begin
  if coalesce(c, false) then raise notice '  PASS  %', label;
  else raise notice '  FAIL  %', label; update _score set fails = fails + 1; end if;
end $$;
create function _refused(stmt text, want text, label text) returns void language plpgsql as $$
begin
  begin execute stmt;
  exception when others then
    perform _ok(sqlerrm like '%' || want || '%', label || case when sqlerrm like '%' || want || '%' then '' else ' — ' || sqlerrm end);
    return;
  end;
  perform _ok(false, label || ' — نُفِّذ');
end $$;
grant execute on function _ok(boolean, text), _refused(text, text, text) to public;
create function _as(p uuid, admin boolean default false) returns void language sql as $$
  select set_config('request.jwt.claims',
    case when p is null then '' else json_build_object('sub', p, 'role', 'authenticated', 'aal', case when admin then 'aal2' else 'aal1' end)::text end,
    false) $$;
grant execute on function _as(uuid, boolean) to public;
grant usage on schema storage to authenticated;
grant select, insert on storage.objects to authenticated;

insert into auth.users (id) values
  ('ad000000-0000-0000-0000-0000000000ad'), ('0a000000-0000-0000-0000-00000000000a'),
  ('1a000000-0000-0000-0000-00000000001a'), ('ee000000-0000-0000-0000-0000000000ee');
insert into profiles (id, full_name, role) values
  ('ad000000-0000-0000-0000-0000000000ad', 'المدير', 'admin'),
  ('0a000000-0000-0000-0000-00000000000a', 'صاحب الأرض', 'investor'),
  ('1a000000-0000-0000-0000-00000000001a', 'المستثمر', 'investor'),
  ('ee000000-0000-0000-0000-0000000000ee', 'غريب', 'investor')
on conflict (id) do update set role = excluded.role;

set session_replication_role = replica;
insert into lands (id, owner_id, name, state, locality, feddans, station_key, water_source, verification, open_to_investors, investor_models, investor_note)
values ('1d000000-0000-0000-0000-0000000000d1', '0a000000-0000-0000-0000-00000000000a', 'أرض التجربة', 'الجزيرة', 'المناقل', 37,
        'wad_medani', 'canal', 'verified', true, array['sharecrop'], 'أرضٌ للشراكة بالمحاصصة');
insert into investor_interests (id, investor_id, land_id, model, message, status)
values ('11000000-0000-0000-0000-0000000000a1', '1a000000-0000-0000-0000-00000000001a', '1d000000-0000-0000-0000-0000000000d1',
        'sharecrop', 'أرغب في الشراكة على هذه الأرض', 'pending');
set session_replication_role = origin;

\echo 'أ) تفاصيل الأرض بعد القبول (السؤال 18)'
select _as('1a000000-0000-0000-0000-00000000001a');
set role authenticated;
select _ok((select locality is null and feddans is null and area_band = 'medium' from investor_my_interests() limit 1),
           'قبل القبول: لا محلّيّة ولا فدادين، وفئةُ المساحة وحدها');
reset role;
update investor_interests set status = 'accepted' where id = '11000000-0000-0000-0000-0000000000a1';
set role authenticated;
select _ok((select locality = 'المناقل' and feddans = 37 from investor_my_interests() limit 1), 'وبعد القبول: المحلّيّة والمساحة');
reset role;

\echo 'ب) مصدر الماء من القائمة (السؤال 20)'
select _refused($$update lands set water_source = 'toString' where id = '1d000000-0000-0000-0000-0000000000d1'$$,
                'lands_water_source_known', 'قيمةٌ ليست في القائمة تُرفض');

\echo 'ج) العرض للمالك والمدير وحدهما (السؤال 23)'
select _as('ee000000-0000-0000-0000-0000000000ee');
select _refused($$update lands set open_to_investors = false where id = '1d000000-0000-0000-0000-0000000000d1'$$,
                'قرارُ صاحبها وحده', 'غيرُ المالك (الوكيل مثلاً) لا يغيّر العرض');
select _refused($$update lands set investor_note = 'ملاحظةٌ من غير المالك' where id = '1d000000-0000-0000-0000-0000000000d1'$$,
                'قرارُ صاحبها وحده', 'ولا ملاحظة العرض');
update lands set name = 'أرض التجربة الجديدة' where id = '1d000000-0000-0000-0000-0000000000d1';
select _ok((select name = 'أرض التجربة الجديدة' from lands where id = '1d000000-0000-0000-0000-0000000000d1'), 'وسائر البيانات كما كانت');
select _as('0a000000-0000-0000-0000-00000000000a');
update lands set investor_note = 'أرضٌ للشراكة، والماء من الترعة' where id = '1d000000-0000-0000-0000-0000000000d1';
select _ok((select investor_note like '%الترعة%' from lands where id = '1d000000-0000-0000-0000-0000000000d1'), 'والمالك يغيّر العرض');

\echo 'د) سقف التخزين: 100 ميجابايت (السؤال 21)'
insert into storage.objects (bucket_id, name, owner, metadata)
values ('evidence', '0a000000-0000-0000-0000-00000000000a/big.pdf', '0a000000-0000-0000-0000-00000000000a', '{"size": 104857600}');
select _as('0a000000-0000-0000-0000-00000000000a');
set role authenticated;
select _refused($$insert into storage.objects (bucket_id, name, owner) values ('evidence', '0a000000-0000-0000-0000-00000000000a/one-more.jpg', '0a000000-0000-0000-0000-00000000000a')$$,
                'row-level security', 'من بلغ 100 ميجابايت لا يرفع جديداً');
select _as('ee000000-0000-0000-0000-0000000000ee');
do $$ begin
  begin
    insert into storage.objects (bucket_id, name, owner) values ('evidence', 'ee000000-0000-0000-0000-0000000000ee/a.jpg', 'ee000000-0000-0000-0000-0000000000ee');
    perform _ok(true, 'وغيرُه يرفع');
  exception when others then perform _ok(false, 'وغيرُه يرفع — ' || sqlerrm);
  end;
end $$;
reset role;

\echo 'هـ) اشتراكات التنبيهات (السؤال 20)'
select _as('ee000000-0000-0000-0000-0000000000ee');
set role authenticated;
select _refused($$select push_subscribe('https://evil.example/push/1', repeat('k', 87), repeat('a', 22), 'x')$$,
                'مزوّد إشعاراتٍ غير معروف', 'عنوانٌ عند غير مزوّدي الإشعارات يُرفض');
do $$ declare i int; begin
  for i in 1..10 loop
    perform push_subscribe('https://fcm.googleapis.com/fcm/send/dev' || i, repeat('k', 87), repeat('a', 22), 'x');
  end loop;
  perform _ok(true, 'عشرة أجهزة تُقبل');
end $$;
select _refused($$select push_subscribe('https://fcm.googleapis.com/fcm/send/dev11', repeat('k', 87), repeat('a', 22), 'x')$$,
                'عشرة أجهزةٍ', 'والحادي عشر يُرفض برسالةٍ تقول ما يفعل');
do $$ begin
  perform push_subscribe('https://fcm.googleapis.com/fcm/send/dev3', repeat('k', 87), repeat('a', 22), 'x');
  perform _ok(true, 'وجهازٌ مسجَّلٌ يجدّد اشتراكه');
exception when others then perform _ok(false, 'وجهازٌ مسجَّلٌ يجدّد اشتراكه — ' || sqlerrm);
end $$;
reset role;

do $$ declare f integer; begin
  select fails into f from _score;
  if f = 0 then raise notice 'ALL CHECKS PASSED'; else raise exception '% CHECK(S) FAILED', f; end if;
end $$;
