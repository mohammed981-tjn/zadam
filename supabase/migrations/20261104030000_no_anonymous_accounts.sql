-- لا حسابات مجهولة (فحص 3 نوفمبر 2026، db-b-6؛ المالك، 4 نوفمبر، السؤال 17: «تُطفئه، وأضيف حمايةً في القاعدة»).
--
-- «الدخول المجهول» في إعدادات Supabase يصنع حساباً بلا رقمٍ ولا بريد، وله auth.uid() كأيّ عضو، فتعامله دوالُّ تسأل
-- «auth.uid() is null؟» وحدها معاملةَ العضو الحقيقيّ. المنصّة لا تستعمله، ولا حساب مجهولاً اليوم (0 من 9). يُطفأ من
-- اللوحة، وهذا قفلٌ ثانٍ لا يعتمد على تذكّر الزرّ: حسابٌ مجهولٌ لا يُنشأ أصلاً، ولا يصير حسابٌ قائمٌ مجهولاً.

create or replace function public.refuse_anonymous_account()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if coalesce(new.is_anonymous, false) then
    raise exception 'الدخول بلا حساب مغلقٌ في سوداقري: أنشئ حساباً برقم جوالك أو بريدك.';
  end if;
  return new;
end $$;

revoke all on function public.refuse_anonymous_account() from public, anon, authenticated;

drop trigger if exists auth_users_no_anonymous on auth.users;
create trigger auth_users_no_anonymous
  before insert or update of is_anonymous on auth.users
  for each row execute function public.refuse_anonymous_account();
