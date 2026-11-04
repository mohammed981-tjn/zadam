-- إغلاق الحساب بدل حذفه (البند ١٩٥).
--
-- حذف المستخدم محجوبٌ لكلّ من له دفترٌ أو قيدٌ مقترَح أو عقدٌ أو توقيعٌ أو معاينة (`restrict` في مفاتيحها)، وهذا
-- مقصود: ما يخصّ طرفاً آخر يبقى عنده. فوعدُ «نحذف حسابك» لا يُنفَّذ لمن وقّع عقداً. والبديل الذي اختاره المالك
-- (25 أكتوبر 2026):
--
--  - **يطلب صاحب الحساب الإغلاق، وينفّذه المدير** (`account_close_request` ثمّ `account_close`).
--  - الإغلاق يوقف الدخول (`banned_until`، وتُحذف الجلسات والهويّات المرتبطة)، ويُخفي الاسم والجوّال والبريد عن الناس
--    كلّهم، ويحذف ما لا يخصّ غيره (الإشعارات واشتراكات التنبيه على الجهاز وتنبيهات الأسعار وسجلّ تنبيهات الحقل)،
--    ويُبقي الدفاتر والعقود والرسائل تحت «حساب مُغلَق».
--  - والاسم والجوّال يُمحيان أيضاً حيث نُسخا لصفٍّ يراه غيره (النفير والفزعة والشورى والميثاق والجوديّة والقنوات
--    والملاحظات والطلب الجماعي)، وما كان عرضاً للناس يُغلق (عرض السوق، والطلب الجماعي المفتوح، والمورّد والناقل
--    والشركة ومقدّم الخدمة) — البند ١٩٨ ج٩.
--  - ورمز الدخول الذي بقي في يده لا يفتح شيئاً من لحظة الإغلاق: كلّ طلبٍ إلى الواجهة يُفحص قبل تنفيذه، ورفع الملفّات
--    له سياسةٌ بالشرط نفسه — البند ١٩٨ ج١٠.
--  - **«يحفظ ولا يمحي إلا من الإدارة»:** الاسم والجوّال والبريد الحقيقيّة تبقى في `closed_accounts` يراها المدير
--    وحده، حتى يمحوها المدير بفعلٍ صريح وسبب (`account_identity_erase`)، ويبقى في الصفّ من محا ومتى ولماذا.

-- ── طلبات الإغلاق ───────────────────────────────────────────────────────────

create table public.account_closure_requests (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete restrict,
  reason       text check (reason is null or length(reason) <= 500),
  status       text not null default 'open' check (status in ('open', 'closed', 'withdrawn')),
  requested_at timestamptz not null default now(),
  decided_by   uuid references auth.users(id) on delete set null,
  decided_at   timestamptz,
  check ((status = 'open') = (decided_at is null))
);
create unique index account_closure_one_open on public.account_closure_requests (user_id) where status = 'open';

-- ── الحسابات المُغلَقة: الهويّة الحقيقيّة عند المدير وحده ──────────────────────

create table public.closed_accounts (
  user_id            uuid primary key references auth.users(id) on delete restrict,
  full_name          text,
  phone              text,
  email              text,
  auth_phone         text,
  closed_at          timestamptz not null default now(),
  closed_by          uuid references auth.users(id) on delete set null,
  reason             text not null check (length(reason) between 3 and 300),
  identity_erased_at timestamptz,
  identity_erased_by uuid references auth.users(id) on delete set null,
  erase_reason       text check (erase_reason is null or length(erase_reason) between 3 and 300),
  check ((identity_erased_at is null) = (erase_reason is null))
);

alter table public.account_closure_requests enable row level security;
alter table public.closed_accounts enable row level security;
revoke all on table public.account_closure_requests, public.closed_accounts from anon, authenticated, service_role;
grant select on public.account_closure_requests, public.closed_accounts to authenticated;

create policy account_closure_requests_read on public.account_closure_requests
  for select to authenticated using (user_id = auth.uid() or is_admin());
create policy closed_accounts_admin_read on public.closed_accounts
  for select to authenticated using (is_admin());

-- السجلّ لا يُحذف ولا يُفرَّغ، ولا يتغيّر منه إلا محوُ الهويّة بدالّة المدير.
create function public.closed_accounts_keep()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' and coalesce(current_setting('app.account_erase', true), '') = 'on' then
    return new;
  end if;
  raise exception 'سجلّ الحسابات المُغلَقة لا يتغيّر إلا بمحو المدير';
end $$;

create trigger closed_accounts_keep
  before update or delete on public.closed_accounts
  for each row execute function public.closed_accounts_keep();
create trigger closed_accounts_no_truncate
  before truncate on public.closed_accounts
  for each statement execute function public.closed_accounts_keep();
revoke execute on function public.closed_accounts_keep() from public, anon, authenticated, service_role;

-- The organiser's phone is erased with the account (البند ١٩٨ ج٩), so the column takes no number then; the check on
-- its shape still holds for every number written.
alter table public.group_orders alter column organiser_phone drop not null;

-- Two guards keep a name as it was written, against anyone (a promise in a faza, a question in the shura): history must
-- not be rewritten by its author. The closure is the one exception, and it says so for its own transaction alone; these
-- triggers run after the guards (triggers fire in name order) and write «حساب مُغلَق» where the row is the closed person's.
create function public.closing_account_name()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if (to_jsonb(new) ->> tg_argv[0]) = nullif(current_setting('app.closing_account', true), '')
     and (to_jsonb(new) ->> tg_argv[1]) is not null then
    new := jsonb_populate_record(new, jsonb_build_object(tg_argv[1], 'حساب مُغلَق'));
  end if;
  return new;
end $$;

create trigger zz_closing_account_name
  before update on public.faza_pledges
  for each row execute function public.closing_account_name('pledger_id', 'display_name');
create trigger zz_closing_account_name_author
  before update on public.shura_items
  for each row execute function public.closing_account_name('author_id', 'display_name');
create trigger zz_closing_account_name_answer
  before update on public.shura_items
  for each row execute function public.closing_account_name('answered_by', 'answer_name');
revoke execute on function public.closing_account_name() from public, anon, authenticated, service_role;

-- ── صاحب الحساب: يطلب، أو يسحب طلبه ─────────────────────────────────────────

create function public.account_close_request(p_reason text default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  rid uuid;
begin
  if me is null then raise exception 'سجّل دخولك أولاً.'; end if;
  if exists (select 1 from public.closed_accounts where user_id = me) then raise exception 'الحساب مُغلَق من قبل.'; end if;
  if exists (select 1 from public.account_closure_requests where user_id = me and status = 'open') then
    raise exception 'طلبك بإغلاق الحساب قائمٌ من قبل.';
  end if;
  insert into public.account_closure_requests (user_id, reason)
  values (me, nullif(btrim(coalesce(p_reason, '')), ''))
  returning id into rid;
  return rid;
end $$;

create function public.account_close_withdraw()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'سجّل دخولك أولاً.'; end if;
  update public.account_closure_requests
     set status = 'withdrawn', decided_by = auth.uid(), decided_at = now()
   where user_id = auth.uid() and status = 'open';
  if not found then raise exception 'لا طلب إغلاقٍ قائمٌ لك.'; end if;
end $$;

-- ── المدير: يُغلق ─────────────────────────────────────────────────────────────

create function public.account_close(p_user uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  p public.profiles;
  u_email text;
  u_phone text;
begin
  if not is_admin() then raise exception 'للإدارة وحدها.'; end if;
  if length(btrim(coalesce(p_reason, ''))) not between 3 and 300 then
    raise exception 'اكتب سبب الإغلاق (٣ أحرفٍ فأكثر).';
  end if;
  select * into p from public.profiles where id = p_user;
  if not found then raise exception 'لا حساب بهذا المعرّف.'; end if;
  if p.role = 'admin' then raise exception 'لا يُغلَق حساب مدير؛ اسحب صلاحيّته أولاً.'; end if;
  if exists (select 1 from public.closed_accounts where user_id = p_user) then raise exception 'الحساب مُغلَق من قبل.'; end if;

  select email, phone into u_email, u_phone from auth.users where id = p_user;

  -- الهويّة الحقيقيّة تُحفظ عند المدير قبل أن تُخفى.
  insert into public.closed_accounts (user_id, full_name, phone, email, auth_phone, closed_by, reason)
  values (p_user, p.full_name, p.phone, u_email, u_phone, auth.uid(), btrim(p_reason));

  -- وتُخفى عن الناس كلّهم.
  update public.profiles set full_name = 'حساب مُغلَق', phone = null, publish_record = false where id = p_user;

  -- وحيث نُسخ الاسم أو الجوّال إلى صفٍّ يراه غيره (البند ١٩٨ ج٩): يُكتب «حساب مُغلَق» مكان الاسم ويُمحى الجوّال، ويبقى
  -- الصفّ نفسه لأنّه يخصّ من شاركه (دعوة نفيرٍ أو طلبٌ جماعيّ أو قناة). وما كان عرضاً للناس يُطلب به (عرضٌ في السوق،
  -- طلبٌ جماعيّ مفتوح، شركةٌ أو مورّدٌ أو ناقلٌ أو مقدّم خدمة) يُغلق، فلا يُعرض للناس عرضٌ لا أحد وراءه.
  -- توقيع عقد الشراكة (partnership_signatures) يبقى كما هو: سجلّ العقد عند الطرف الآخر، ولا يراه غير طرفيه والمدير.
  perform set_config('app.closing_account', p_user::text, true);
  update public.charter_signatures set display_name = 'حساب مُغلَق' where user_id = p_user;
  update public.nafir_calls        set display_name = 'حساب مُغلَق' where organizer_id = p_user;
  update public.nafir_joins        set display_name = 'حساب مُغلَق' where user_id = p_user;
  update public.faza_requests      set display_name = 'حساب مُغلَق' where requester_id = p_user;
  update public.faza_pledges       set display_name = 'حساب مُغلَق' where pledger_id = p_user;
  update public.shura_items        set display_name = 'حساب مُغلَق' where author_id = p_user;
  update public.shura_items        set answer_name = 'حساب مُغلَق' where answered_by = p_user and answer_name is not null;
  update public.judiyya_mediators  set display_name = 'حساب مُغلَق' where user_id = p_user;
  update public.judiyya_parties    set display_name = 'حساب مُغلَق' where user_id = p_user;
  update public.canal_members      set display_name = 'حساب مُغلَق' where user_id = p_user;
  update public.feedback           set display_name = null where author_id = p_user;
  update public.group_order_pledges set display_name = 'حساب مُغلَق', phone = null where user_id = p_user;
  update public.group_orders       set organiser_name = 'حساب مُغلَق', organiser_phone = null where organiser_id = p_user;
  update public.group_orders       set status = 'closed' where organiser_id = p_user and status = 'open';
  update public.market_offers      set status = 'closed', closed_at = now() where created_by = p_user and status = 'open';
  update public.suppliers          set active = false where owner_id = p_user;
  update public.carriers           set active = false where owner_id = p_user;
  update public.partner_companies  set active = false where owner_id = p_user;
  update public.service_providers  set active = false where owner_id = p_user;
  perform set_config('app.closing_account', '', true);

  -- ويتوقّف الدخول: لا بريد ولا جوّال يُدخَل بهما، ولا جلسة تتجدّد.
  update auth.users
     set email = null, phone = null, raw_user_meta_data = '{}'::jsonb, banned_until = 'infinity'
   where id = p_user;
  delete from auth.sessions where user_id = p_user;
  delete from auth.identities where user_id = p_user;

  -- وما لا يخصّ غيره يُحذف.
  delete from public.notifications where recipient_id = p_user;
  delete from public.push_subscriptions where user_id = p_user;
  delete from public.price_alerts where user_id = p_user;
  delete from public.field_alerts_sent where recipient_id = p_user;

  update public.account_closure_requests
     set status = 'closed', decided_by = auth.uid(), decided_at = now()
   where user_id = p_user and status = 'open';
end $$;

-- ── المدير: يمحو الهويّة المحفوظة، بسبب ──────────────────────────────────────

create function public.account_identity_erase(p_user uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_admin() then raise exception 'للإدارة وحدها.'; end if;
  if length(btrim(coalesce(p_reason, ''))) not between 3 and 300 then
    raise exception 'اكتب سبب المحو (٣ أحرفٍ فأكثر).';
  end if;
  if not exists (select 1 from public.closed_accounts where user_id = p_user) then
    raise exception 'لا يُمحى إلا حسابٌ مُغلَق.';
  end if;
  if exists (select 1 from public.closed_accounts where user_id = p_user and identity_erased_at is not null) then
    raise exception 'مُحيت هويّة هذا الحساب من قبل.';
  end if;
  perform set_config('app.account_erase', 'on', true);
  update public.closed_accounts
     set full_name = null, phone = null, email = null, auth_phone = null,
         identity_erased_at = now(), identity_erased_by = auth.uid(), erase_reason = btrim(p_reason)
   where user_id = p_user;
  perform set_config('app.account_erase', 'off', true);
end $$;

revoke execute on function
  public.account_close_request(text), public.account_close_withdraw(),
  public.account_close(uuid, text), public.account_identity_erase(uuid, text)
  from public, anon, service_role;
grant execute on function
  public.account_close_request(text), public.account_close_withdraw(),
  public.account_close(uuid, text), public.account_identity_erase(uuid, text)
  to authenticated;

-- ── الحساب المُغلَق لا يكتب ولا يقرأ من لحظة إغلاقه (البند ١٩٨ ج١٠) ─────────────────
--
-- الإغلاق يحذف الجلسات ويمنع الدخول، لكنّ رمز الدخول الذي في يد صاحبه صالحٌ حتى تنتهي ساعته، فيبقى يكتب ويقرأ بسياسات
-- الصفوف كأنّ شيئاً لم يكن. فكلّ طلبٍ يصل القاعدة عبر واجهتها (PostgREST: الجداول والدوالّ كلّها) يمرّ قبل تنفيذه بفحصٍ
-- واحد: إن كان صاحب الرمز حساباً مُغلَقاً رُفض الطلب. ورفع الملفّات (storage.objects) لا يمرّ بالواجهة نفسها، فله
-- سياسةٌ مقيِّدة بالشرط نفسه.

-- Indexed by the primary key: one lookup a request, nothing for a visitor.
create function public.account_is_open(p_user uuid default null)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(p_user, auth.uid()) is null
      or not exists (select 1 from public.closed_accounts c where c.user_id = coalesce(p_user, auth.uid()))
$$;

-- PostgREST calls this before every request, once the request's token is known (`pgrst.db_pre_request`).
create function public.closed_account_gate()
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.account_is_open() then
    raise exception 'هذا الحساب مُغلَق.' using errcode = '42501';
  end if;
end $$;

revoke execute on function public.account_is_open(uuid), public.closed_account_gate() from public;
grant execute on function public.account_is_open(uuid), public.closed_account_gate() to anon, authenticated, service_role;

-- The setting lives on the role the API connects as. Another pre-request hook already set there is not overwritten: the
-- migration stops, so the two are joined by hand rather than one silently replacing the other.
do $$
declare v_cur text;
begin
  if not exists (select 1 from pg_roles where rolname = 'authenticator') then
    raise exception 'لا دور authenticator: هذه القاعدة ليست قاعدة Supabase';
  end if;
  select substr(s, length('pgrst.db_pre_request=') + 1) into v_cur
    from pg_db_role_setting rs
    join pg_roles r on r.oid = rs.setrole
    cross join lateral unnest(rs.setconfig) s
   where r.rolname = 'authenticator' and s like 'pgrst.db_pre_request=%'
   limit 1;
  if v_cur is not null and v_cur not in ('public.closed_account_gate', 'closed_account_gate') then
    raise exception 'pgrst.db_pre_request مضبوطٌ من قبل على %؛ ادمج الفحصين يدويّاً', v_cur;
  end if;
  execute 'alter role authenticator set pgrst.db_pre_request = ''public.closed_account_gate''';
end $$;
notify pgrst, 'reload config';

create policy closed_account_no_storage_writes on storage.objects
  as restrictive for insert to authenticated with check (public.account_is_open());
create policy closed_account_no_storage_updates on storage.objects
  as restrictive for update to authenticated using (public.account_is_open());
create policy closed_account_no_storage_deletes on storage.objects
  as restrictive for delete to authenticated using (public.account_is_open());
