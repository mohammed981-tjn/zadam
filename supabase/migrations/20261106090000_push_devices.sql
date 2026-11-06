-- ═══════════════════════════════════════════════════════════════════════════
-- إشعارات الجوّال والتطبيق مغلق (البند ٢٠٧؛ قرار المالك، 6 نوفمبر 2026)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- كلّ ما يكتب صفّاً في `notifications` — تنبيه السعر، والجراد ومرض الماشية قرب الأرض، والقيد الذي ينتظر الاعتماد،
-- والعقد الذي ينتظر التوقيع، والرسالة الجديدة، وغيرها — يصل الآن إلى تطبيق سوداقري على الجوّال وهو مغلق، عبر Firebase
-- Cloud Messaging (FCM). صندوق الإشعارات في التطبيق والموقع كما هو؛ هذا يوصله إلى شاشة الجوّال.
--
-- ما هنا:
--   ١) `push_devices`: رمز FCM لكلّ جوّالٍ دخل صاحبه من التطبيق. يُسجَّل بدالّة تقرأ الجلسة نفسها، فلا يُسجَّل رمزٌ
--      باسم غير صاحبه؛ ويراه صاحبه ويحذفه وحده؛ وعشرة أجهزةٍ لكلّ حساب (الأقدم يخرج حين يدخل الحادي عشر).
--   ٢) `push_prefs`: مفتاح «إشعارات الجوّال» لكلّ حساب (مفعَّلٌ ما لم يُطفئه صاحبه).
--   ٣) `notifications.pushed_at`: متى أخذ المُرسِل الإشعار. يأخذه مرّةً واحدة (`push_claim`، لمفتاح الخدمة وحده)، فلا
--      يصل إشعارٌ مرّتين. والعضو لا يغيّره (زنادٌ جديد؛ حارس `notifications_only_read_at` القائم لا يُمسّ).
--   ٤) الجرس: زنادُ جملةٍ على `notifications` يدقّ `/api/push/dispatch` عبر pg_net فور الإدراج، إن كان لأحد المستلمين
--      جهازٌ مسجَّل. والسرّ الذي يحمله يُولَّد هنا ويُحفظ في `push_hook` لمفتاح الخدمة وحده — لا متغيّر بيئةٍ يُنسى ولا
--      سرٌّ يمرّ في محادثة. وإن لم يكن pg_net فلا يتعطّل شيء: المهمّة اليوميّة تفرغ ما فات.
--
-- ما لم يُضبط بعدُ مشروع Firebase (متغيّر `FCM_SERVICE_ACCOUNT` في Vercel)، لا يُسجَّل جهاز (التطبيق لا يجد إعداده)، ولا
-- يدقّ الجرس، والمُرسِل لا يفعل شيئاً. فلا شيء ينكسر قبل أن يُنشئه المالك (docs/push-setup-ar.md).

-- ── ١) الأجهزة ────────────────────────────────────────────────────────────────

create table public.push_devices (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  token        text not null unique check (length(token) between 20 and 4096),
  platform     text not null check (platform in ('android', 'ios')),
  locale       text not null default 'ar' check (locale in ('ar', 'en')),
  created_at   timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  last_sent_at timestamptz
);
create index push_devices_user_idx on public.push_devices (user_id, last_seen_at desc);

alter table public.push_devices enable row level security;
revoke all on table public.push_devices from public, anon, authenticated;
-- يرى صاحبُ الحساب أجهزته ويحذف منها؛ والإدراج والتحديث بالدالّة وحدها.
grant select, delete on table public.push_devices to authenticated;
grant all on table public.push_devices to service_role;

create policy push_devices_own_read on public.push_devices
  for select to authenticated using (user_id = (select auth.uid()));
create policy push_devices_own_delete on public.push_devices
  for delete to authenticated using (user_id = (select auth.uid()));

comment on table public.push_devices is
  'رموز FCM لأجهزة التطبيق (البند ٢٠٧). تُسجَّل بـpush_device_register لصاحب الجلسة، ويحذفها صاحبها أو المُرسِل حين يقول FCM إنّ الرمز لم يعد مسجَّلاً.';

-- ── ٢) مفتاح «إشعارات الجوّال» ──────────────────────────────────────────────────

create table public.push_prefs (
  user_id     uuid primary key references auth.users(id) on delete cascade,
  app_enabled boolean not null default true,
  updated_at  timestamptz not null default now()
);
alter table public.push_prefs enable row level security;
revoke all on table public.push_prefs from public, anon, authenticated;
grant select on table public.push_prefs to authenticated;
grant all on table public.push_prefs to service_role;

create policy push_prefs_own_read on public.push_prefs
  for select to authenticated using (user_id = (select auth.uid()));

comment on table public.push_prefs is
  'مفتاح «إشعارات الجوّال» لكلّ حساب (البند ٢٠٧). لا صفّ = مفعَّل. يُغيَّر بـpush_app_set وحدها.';

-- ── ٣) التسجيل والنسيان والمفتاح ───────────────────────────────────────────────

-- يسجّل رمز هذا الجوّال لصاحب الجلسة. الرمز نفسه من قبل (التطبيق يُفتح من جديد، أو دخل حسابٌ آخر على الجوّال نفسه):
-- يصير لصاحب الجلسة ويُحدَّث «آخر ظهور». وعشرة أجهزةٍ للحساب: ما زاد يخرج منه الأقدم ظهوراً، فلا يُرفض من أعاد تثبيت
-- التطبيق مرّاتٍ (رموزه القديمة ميتةٌ لا يعرف بها أحدٌ قبل أن يُرسَل إليها).
create function public.push_device_register(p_token text, p_platform text, p_locale text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  me  uuid := auth.uid();
  did uuid;
  tok text := btrim(coalesce(p_token, ''));
begin
  if me is null then
    raise exception 'سجّل الدخول أولاً';
  end if;
  if length(tok) not between 20 and 4096 or tok ~ '\s' then
    raise exception 'رمز الجهاز غير صالح';
  end if;
  if coalesce(p_platform, '') not in ('android', 'ios') then
    raise exception 'نوع الجهاز غير معروف';
  end if;

  insert into public.push_devices (user_id, token, platform, locale, last_seen_at)
  values (me, tok, p_platform, case when p_locale = 'en' then 'en' else 'ar' end, clock_timestamp())
  on conflict (token) do update
    set user_id = excluded.user_id,
        platform = excluded.platform,
        locale = excluded.locale,
        last_seen_at = excluded.last_seen_at
  returning id into did;

  -- The device just registered is never the one that leaves.
  delete from public.push_devices
   where user_id = me and id <> did
     and id in (select id from public.push_devices where user_id = me and id <> did
                 order by last_seen_at desc, created_at desc offset 9);
  return did;
end $$;

-- ينسى رمز هذا الجوّال عند الخروج. رمزُ غيره لا يُمسّ، ولا خطأ: «لم يكن مسجَّلاً» جوابٌ كافٍ.
create function public.push_device_forget(p_token text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'سجّل الدخول أولاً';
  end if;
  delete from public.push_devices where token = btrim(coalesce(p_token, '')) and user_id = auth.uid();
  return found;
end $$;

-- «إشعارات الجوّال»: تشغيلٌ وإطفاء لصاحب الجلسة.
create function public.push_app_set(p_enabled boolean)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'سجّل الدخول أولاً';
  end if;
  insert into public.push_prefs (user_id, app_enabled, updated_at)
  values (auth.uid(), coalesce(p_enabled, true), now())
  on conflict (user_id) do update set app_enabled = excluded.app_enabled, updated_at = now();
  return coalesce(p_enabled, true);
end $$;

-- ما تعرضه الشاشتان: هل المفتاح مفعَّل، وكم جوّالاً مسجَّلاً.
create function public.push_app_status()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'سجّل الدخول أولاً';
  end if;
  return jsonb_build_object(
    'enabled', coalesce((select app_enabled from public.push_prefs where user_id = auth.uid()), true),
    'devices', (select count(*) from public.push_devices where user_id = auth.uid())
  );
end $$;

revoke all on function public.push_device_register(text, text, text) from public, anon;
revoke all on function public.push_device_forget(text) from public, anon;
revoke all on function public.push_app_set(boolean) from public, anon;
revoke all on function public.push_app_status() from public, anon;
grant execute on function public.push_device_register(text, text, text) to authenticated;
grant execute on function public.push_device_forget(text) to authenticated;
grant execute on function public.push_app_set(boolean) to authenticated;
grant execute on function public.push_app_status() to authenticated;

-- الحساب المُغلَق (20261025140000) لا يصله شيء: أجهزته ومفتاحه يُحذفان لحظة إغلاقه. زنادٌ جديد على closed_accounts
-- بدل تعديل account_close نفسها.
create function public.push_forget_closed_account()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.push_devices where user_id = new.user_id;
  delete from public.push_prefs where user_id = new.user_id;
  return null;
end $$;
revoke all on function public.push_forget_closed_account() from public, anon, authenticated;
create trigger closed_accounts_forget_push
  after insert on public.closed_accounts
  for each row execute function public.push_forget_closed_account();

-- ── ٤) الإشعار يُرسَل مرّةً واحدة ──────────────────────────────────────────────

alter table public.notifications add column if not exists pushed_at timestamptz;
-- ما كُتب قبل اليوم وُصل إليه من الصندوق؛ لا يُدفع إلى الجوّال بعد أيّام.
update public.notifications set pushed_at = created_at where pushed_at is null;
create index if not exists notifications_unpushed_idx on public.notifications (created_at) where pushed_at is null;

-- العضو يعلّم إشعاره مقروءاً (notifications_update_own) ولا يغيّر متى أُرسل: لو أعاده فارغاً لعاد إليه مرّةً ثانية.
-- مفتاح الخدمة ودوالّ القاعدة (push_claim) تغيّره. وبرسالة الحارس القائم نفسها.
create function public.notifications_pushed_at_guard()
returns trigger
language plpgsql
as $$
begin
  if new.pushed_at is distinct from old.pushed_at and current_user in ('anon', 'authenticated') then
    raise exception 'يمكن تعديل حالة القراءة فقط';
  end if;
  return new;
end $$;
revoke all on function public.notifications_pushed_at_guard() from public, anon, authenticated;
create trigger notifications_pushed_at_guard
  before update of pushed_at on public.notifications
  for each row execute function public.notifications_pushed_at_guard();

-- يأخذ المُرسِلُ ما لم يُرسَل بعد، ويعلّمه مأخوذاً في الخطوة نفسها (SKIP LOCKED: مُرسِلان معاً لا يأخذان الصفّ نفسه).
-- يُعيد ما يُرسَل فعلاً: صفّاً لكلّ جهاز، بعنوان الإشعار ونصّه ورابطه في التطبيق — لا شيء غيرها. ويُسقط بلا إرسال: ما
-- كان أقدم من يومين، وما لا مستلم له، ومن أطفأ «إشعارات الجوّال»، والحساب المُغلَق.
create function public.push_claim(p_limit integer default 100)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  n_claimed integer;
  sends jsonb;
begin
  with picked as (
    select n.id from public.notifications n
     where n.pushed_at is null
     order by n.created_at
     limit least(greatest(coalesce(p_limit, 100), 1), 500)
     for update skip locked
  ), marked as (
    update public.notifications n set pushed_at = now()
      from picked where n.id = picked.id
    returning n.id, n.recipient_id, n.title, n.body, n.link, n.created_at
  ), counted as (
    select count(*)::int as c from marked
  ), to_send as (
    select m.id, d.token, d.locale, m.title, m.body, m.link
      from marked m
      join public.push_devices d on d.user_id = m.recipient_id
     where m.created_at > now() - interval '2 days'
       and coalesce((select p.app_enabled from public.push_prefs p where p.user_id = m.recipient_id), true)
       and not exists (select 1 from public.closed_accounts c where c.user_id = m.recipient_id)
  )
  select (select c from counted),
         coalesce(jsonb_agg(jsonb_build_object(
           'id', o.id, 'token', o.token, 'locale', o.locale,
           'title', coalesce(o.title, ''), 'body', coalesce(o.body, ''), 'link', o.link)), '[]'::jsonb)
    into n_claimed, sends
    from to_send o;
  return jsonb_build_object('claimed', coalesce(n_claimed, 0), 'sends', sends);
end $$;
revoke all on function public.push_claim(integer) from public, anon, authenticated;
grant execute on function public.push_claim(integer) to service_role;

-- ── ٥) الجرس: الإدراج يدقّ المُرسِل فوراً ───────────────────────────────────────

-- pg_net على Supabase يرسل الطلب بعد أن تُثبَّت المعاملة. وإن تعذّر تفعيله هنا (قاعدةٌ محلّيّة) فلا يمنع شيئاً.
do $$
begin
  create extension if not exists pg_net with schema extensions;
exception when others then
  raise notice 'pg_net غير متاح هنا (%). الجرس صامت، والمهمّة اليوميّة تفرغ ما فات.', sqlerrm;
end $$;

-- العنوان الذي يُدقّ، والسرّ الذي يحمله. صفٌّ واحد، لمفتاح الخدمة وحده. السرّ يُولَّد هنا؛ والعنوان عنوان الموقع
-- المنشور (src/lib/site.ts)، يُغيَّر بسطرٍ إن تغيّر النطاق:
--   update public.push_hook set url = 'https://<النطاق>/api/push/dispatch';
create table public.push_hook (
  one        boolean primary key default true check (one),
  url        text check (url is null or url ~ '^https://[^/]+/'),
  secret     text not null default (replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '')),
  updated_at timestamptz not null default now()
);
alter table public.push_hook enable row level security;
revoke all on table public.push_hook from public, anon, authenticated;
grant select on table public.push_hook to service_role;
insert into public.push_hook (one, url) values (true, 'https://zadam-khaki.vercel.app/api/push/dispatch')
on conflict (one) do nothing;

comment on table public.push_hook is
  'عنوان المُرسِل وسرّه للجرس (البند ٢٠٧). لمفتاح الخدمة وحده؛ السرّ وُلِّد في الهجرة ولا يُكتب في أيّ مكانٍ آخر.';

-- زنادُ جملةٍ لا صفّ: notify_admins تكتب لكلّ مديرٍ في جملةٍ واحدة، فتدقّ مرّةً. ولا يدقّ إلّا إن كان لأحد المستلمين
-- جهاز (قبل Firebase لا جهاز، فلا طلب). وأيّ خطأٍ هنا تحذيرٌ في السجلّ لا رفضٌ للإشعار.
create function public.notifications_push_bell()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  h record;
begin
  if not exists (select 1 from new_rows r join public.push_devices d on d.user_id = r.recipient_id) then
    return null;
  end if;
  if to_regprocedure('net.http_post(text, jsonb, jsonb, jsonb, integer)') is null then
    return null;
  end if;
  select url, secret into h from public.push_hook where one;
  if h.url is null then
    return null;
  end if;
  begin
    execute 'select net.http_post(url := $1, body := $2, params := $3, headers := $4, timeout_milliseconds := $5)'
      using h.url, '{}'::jsonb, '{}'::jsonb,
            jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || h.secret),
            20000;
  exception when others then
    raise warning 'push bell: %', sqlerrm;
  end;
  return null;
end $$;
revoke all on function public.notifications_push_bell() from public, anon, authenticated;
create trigger notifications_push_bell
  after insert on public.notifications
  referencing new table as new_rows
  for each statement execute function public.notifications_push_bell();
