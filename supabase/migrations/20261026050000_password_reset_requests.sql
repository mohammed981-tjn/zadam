-- استعادة كلمة مرور حساب الجوال بيد الإدارة (خطّة إصلاح الفحص، الموجة الأولى §٤، AUTH-05؛ البند ١٤١).
--
-- حساب الجوال لا بريد له يصله رابط، ولا رسائل نصيّة بعد (ينتظر قرار المالك، البند ١٦١). فكان من نسي كلمة مروره
-- يُقال له «تواصل معنا» ولا شيء في المنصّة يستقبله. الآن:
--   - يكتب رقمه واسمه في «نسيت كلمة المرور» → يُسجَّل طلبٌ إن كان للرقم حساب (ويُقال الكلام نفسه في الحالين، فلا
--     تكشف الصفحة أيّ رقمٍ له حساب)، وتُخبَر الإدارة؛
--   - يتّصل المدير بالرقم المسجَّل في الحساب نفسه — لا برقمٍ يُكتب في الطلب — ويتأكّد أنّه صاحبه؛
--   - يُصدر كلمة مرورٍ مؤقّتة يقرؤها له في المكالمة، فيدخل بها، ويُطلب منه أن يضع كلمته هو قبل أيّ شيء.
-- كلمة المرور المؤقّتة لا تُحفظ في القاعدة ولا تمرّ بها: يضعها الخادم في حساب الدخول مباشرةً.

do $$
declare v_def text;
begin
  select pg_get_constraintdef(oid) into v_def
    from pg_constraint
   where conname = 'notifications_kind_check' and conrelid = 'public.notifications'::regclass;
  -- The production check lists every kind; one written another way (the gates' base schema) is left alone.
  if v_def like '%ARRAY[%' and v_def not like '%password_reset%' then
    execute 'alter table public.notifications drop constraint notifications_kind_check';
    execute 'alter table public.notifications add constraint notifications_kind_check '
         || regexp_replace(v_def, '\]\)\)\)\s*$', ', ''password_reset''::text])))');
    select pg_get_constraintdef(oid) into v_def
      from pg_constraint
     where conname = 'notifications_kind_check' and conrelid = 'public.notifications'::regclass;
    if v_def not like '%password_reset%' then
      raise exception 'لم يُضَف نوع الإشعار password_reset';
    end if;
  end if;
end $$;

create table public.password_reset_requests (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  -- كما كتبه الطالب، ليقارنه المدير بما في الحساب.
  given_name  text not null check (length(btrim(given_name)) between 2 and 120),
  status      text not null default 'open' check (status in ('open', 'reset', 'refused')),
  note        text check (note is null or length(btrim(note)) between 3 and 300),
  created_at  timestamptz not null default now(),
  handled_at  timestamptz,
  handled_by  uuid references auth.users(id) on delete set null,
  check ((status = 'open') = (handled_at is null)),
  check (status <> 'refused' or note is not null)
);

-- طلبٌ مفتوحٌ واحد للحساب: من يضغط الزرّ عشر مرّات لا يملأ قائمة الإدارة.
create unique index password_reset_requests_open on public.password_reset_requests (user_id) where status = 'open';

alter table public.password_reset_requests enable row level security;
revoke all on public.password_reset_requests from anon, authenticated;
grant select on public.password_reset_requests to authenticated;

create policy password_reset_requests_admin on public.password_reset_requests
  for select to authenticated using (is_admin());

-- The server, with the visitor's number folded into the account's address, asks for one. Nothing comes back: the page
-- says the same whether or not the number has an account.
create function public.password_reset_request(p_email text, p_given_name text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_user uuid;
begin
  if length(btrim(coalesce(p_given_name, ''))) < 2 then
    return;
  end if;
  select id into v_user from auth.users where lower(email) = lower(btrim(p_email));
  if v_user is null or exists (select 1 from password_reset_requests where user_id = v_user and status = 'open') then
    return;
  end if;
  insert into password_reset_requests (user_id, given_name) values (v_user, left(btrim(p_given_name), 120));
  perform public.notify_admins('password_reset', 'طلب استعادة كلمة مرور حساب جوال',
    'اتّصل بالرقم المسجَّل في الحساب وتأكّد أنّه صاحبه، ثمّ أصدر كلمة مرورٍ مؤقّتة.', '/admin/resets');
end $$;

-- The open requests, with what the account itself says, for the administrator to compare before calling.
create function public.password_reset_pending()
returns table (id uuid, user_id uuid, given_name text, account_name text, account_phone text, created_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select r.id, r.user_id, r.given_name, p.full_name, coalesce(p.phone, u.phone), r.created_at
    from password_reset_requests r
    join auth.users u on u.id = r.user_id
    left join profiles p on p.id = r.user_id
   where r.status = 'open' and is_admin()
   order by r.created_at
$$;

create function public.password_reset_close(p_id uuid, p_reset boolean, p_note text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare v_user uuid;
begin
  if not is_admin() then
    raise exception 'للإدارة وحدها.';
  end if;
  if not p_reset and length(btrim(coalesce(p_note, ''))) < 3 then
    raise exception 'اكتب لماذا لم تُستعَد كلمة المرور.';
  end if;
  update password_reset_requests
     set status = case when p_reset then 'reset' else 'refused' end, handled_at = now(), handled_by = auth.uid(),
         note = nullif(btrim(coalesce(p_note, '')), '')
   where id = p_id and status = 'open'
  returning user_id into v_user;
  if v_user is null then
    raise exception 'هذا الطلب أُغلق من قبل.';
  end if;
  return v_user;
end $$;

revoke execute on function public.password_reset_request(text, text) from public, anon, authenticated;
grant execute on function public.password_reset_request(text, text) to service_role;
revoke execute on function public.password_reset_pending() from public, anon;
revoke execute on function public.password_reset_close(uuid, boolean, text) from public, anon;
grant execute on function public.password_reset_pending() to authenticated;
grant execute on function public.password_reset_close(uuid, boolean, text) to authenticated;
