-- ═══════════════════════════════════════════════════════════════════════════
-- تنبيهات الهاتف (Web Push): الإشعار يصل إلى شاشة الهاتف والموقع مغلق (البند ١١٩)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- الإشعارات كلّها كانت تُقرأ من صفحة /notifications لمن يفتحها. هذا يوصلها
-- إلى الهاتف نفسه عبر المتصفّح (Web Push): لا تطبيق، ولا رسائل مدفوعة، ولا
-- رقم هاتف. المستخدم يضغط «فعّل تنبيهات الهاتف» مرّةً، فيعطي المتصفّحُ عنوانَ
-- اشتراكٍ نحفظه هنا، والمهمّة اليوميّة تدفع إليه ما كتبته من إشعارات.
--
-- المفاتيح (VAPID) تُولَّد مرّةً واحدة وتُحفظ في `push_keys`: لا متغيّر بيئةٍ
-- يُنسى، ولا مفتاحٌ يمرّ في محادثة. لا يقرؤها إلّا مفتاح الخدمة.
--
-- ولا يُحذف اشتراك: ما رفضه المتصفّح (410) يُعلَّم `failed_at` ويبقى.

create table public.push_keys (
  one         boolean primary key default true check (one),
  public_key  text not null,
  private_key text not null,
  created_at  timestamptz not null default now()
);
alter table public.push_keys enable row level security;
revoke all on table public.push_keys from anon, authenticated;

create table public.push_subscriptions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  endpoint    text not null unique check (length(endpoint) between 20 and 2000),
  p256dh      text not null check (length(p256dh) between 20 and 300),
  auth        text not null check (length(auth) between 10 and 100),
  user_agent  text check (length(user_agent) <= 300),
  created_at  timestamptz not null default now(),
  last_sent_at timestamptz,
  failed_at   timestamptz,
  failed_note text check (length(failed_note) <= 200)
);
create index push_subscriptions_user_idx on public.push_subscriptions (user_id) where failed_at is null;

alter table public.push_subscriptions enable row level security;
revoke insert, update, delete on table public.push_subscriptions from anon, authenticated;

-- المستخدم يرى اشتراكاته (ليعرف أنّ هاتفه مفعَّل)، ولا يرى اشتراك غيره.
create policy push_subscriptions_own_read on public.push_subscriptions
  for select using (user_id = (select auth.uid()));

comment on table public.push_keys is 'مفاتيح VAPID لتنبيهات الهاتف، تُولَّد مرّةً وتبقى. لمفتاح الخدمة وحده.';
comment on table public.push_subscriptions is 'اشتراكات متصفّحات المستخدمين في تنبيهات الهاتف. لا يُحذف اشتراك: يُعلَّم failed_at.';

-- يسجّل اشتراك هذا الهاتف لصاحب الجلسة. العنوان نفسه من قبل: يُحدَّث ويُعاد تفعيله.
create function public.push_subscribe(p_endpoint text, p_p256dh text, p_auth text, p_user_agent text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  sid uuid;
begin
  if auth.uid() is null then
    raise exception 'سجّل الدخول أولاً';
  end if;
  if p_endpoint !~ '^https://' then
    raise exception 'عنوان الاشتراك غير صالح';
  end if;
  insert into public.push_subscriptions (user_id, endpoint, p256dh, auth, user_agent)
  values (auth.uid(), p_endpoint, p_p256dh, p_auth, nullif(btrim(coalesce(p_user_agent, '')), ''))
  on conflict (endpoint) do update
    set user_id = excluded.user_id,
        p256dh = excluded.p256dh,
        auth = excluded.auth,
        user_agent = excluded.user_agent,
        failed_at = null,
        failed_note = null
  returning id into sid;
  return sid;
end $$;

-- يوقف اشتراك هذا الهاتف: يُعلَّم «أوقفه صاحبه» ولا يُحذف.
create function public.push_unsubscribe(p_endpoint text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'سجّل الدخول أولاً';
  end if;
  update public.push_subscriptions
     set failed_at = now(), failed_note = 'أوقفه صاحبه'
   where endpoint = p_endpoint and user_id = auth.uid() and failed_at is null;
  return found;
end $$;

revoke execute on function public.push_subscribe(text, text, text, text) from public, anon;
revoke execute on function public.push_unsubscribe(text) from public, anon;
grant execute on function public.push_subscribe(text, text, text, text) to authenticated;
grant execute on function public.push_unsubscribe(text) to authenticated;
