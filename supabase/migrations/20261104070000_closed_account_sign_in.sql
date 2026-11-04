-- شاشة الدخول تعرف الحساب المُغلَق (فحص 3 نوفمبر 2026، web-flows-9؛ المالك، 4 نوفمبر، السؤال 26).
--
-- إغلاق الحساب (20261025140000) يمحو بريده وجوّاله من auth.users، فإذا حاول صاحبه الدخول بعدها قالت الشاشة «لا حساب
-- بهذا الرقم بعد» ودعته إلى حسابٍ جديدٍ بلا تاريخه. والعنوان محفوظٌ في closed_accounts (للمدير وحده) حتى يمحو المدير
-- الهويّة. هذه الدالّة تجيب الخادمَ وحده: هل هذا العنوان لحسابٍ أُغلق؟ — لا أكثر.

create function public.auth_account_closed(p_email text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.closed_accounts
     where lower(email) = lower(btrim(p_email))
       and identity_erased_at is null);
$$;

comment on function public.auth_account_closed(text) is
  'هل هذا العنوان لحسابٍ أُغلق ولم تُمحَ هويّته؟ للخادم وحده، لشاشة الدخول.';

revoke all on function public.auth_account_closed(text) from public, anon, authenticated;
grant execute on function public.auth_account_closed(text) to service_role;
