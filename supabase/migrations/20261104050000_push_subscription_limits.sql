-- اشتراكات تنبيهات الهاتف: حدٌّ لكلّ مستخدم، ومزوّدو الإشعارات المعروفون وحدهم (فحص 3 نوفمبر 2026، public-api-3؛ المالك،
-- 4 نوفمبر، السؤال 20).
--
-- كان push_subscribe يقبل أيّ عنوان https وأيّ عددٍ من الاشتراكات لحسابٍ واحد، والإرسال يمرّ عليها واحداً واحداً: حسابٌ
-- يسجّل آلاف العناوين البطيئة يُبطئ تنبيهات الجميع. الآن: عشرة أجهزة عاملة لكلّ حساب، وعنوانٌ عند مزوّد إشعاراتٍ معروف
-- (Google وMozilla وApple وMicrosoft)، ومفاتيح بطولها المعقول. والإرسال نفسه بمهلةٍ في الخادم (src/lib/push.ts).

create or replace function public.push_subscribe(p_endpoint text, p_p256dh text, p_auth text, p_user_agent text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  sid uuid;
  host text;
begin
  if auth.uid() is null then
    raise exception 'سجّل الدخول أولاً';
  end if;
  if p_endpoint !~ '^https://' or length(p_endpoint) > 1000 then
    raise exception 'عنوان الاشتراك غير صالح';
  end if;
  host := lower(substring(p_endpoint from '^https://([^/:?#]+)'));
  if host is null or not (
       host = 'fcm.googleapis.com'
    or host = 'updates.push.services.mozilla.com'
    or host = 'web.push.apple.com' or host like '%.push.apple.com'
    or host like '%.notify.windows.com') then
    raise exception 'مزوّد إشعاراتٍ غير معروف';
  end if;
  if length(coalesce(p_p256dh, '')) not between 40 and 200 or length(coalesce(p_auth, '')) not between 16 and 100 then
    raise exception 'عنوان الاشتراك غير صالح';
  end if;
  -- Ten working devices per account; the same browser subscribing again is not a new one.
  if (select count(*) from push_subscriptions
       where user_id = auth.uid() and failed_at is null and endpoint <> p_endpoint) >= 10 then
    raise exception 'لحسابك عشرة أجهزةٍ تصلها التنبيهات. أوقفها في جهازٍ لا تستعمله ثمّ أعد المحاولة.';
  end if;
  insert into public.push_subscriptions (user_id, endpoint, p256dh, auth, user_agent)
  values (auth.uid(), p_endpoint, p_p256dh, p_auth, left(nullif(btrim(coalesce(p_user_agent, '')), ''), 300))
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

revoke all on function public.push_subscribe(text, text, text, text) from public, anon;
grant execute on function public.push_subscribe(text, text, text, text) to authenticated;
