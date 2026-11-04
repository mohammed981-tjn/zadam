-- الاسم في حجز الجرّار الجماعي يُخفى حين يُغلق صاحبه حسابه (البند ١٦٨، مع إغلاق الحساب في البند ١٩٥ وج٩ من ١٩٨).
--
-- `account_close` يكتب «حساب مُغلَق» مكان الاسم في كلّ جدولٍ عامّ نُسخ إليه الاسم، وكُتب قبل أن يوجد حجز الجرّار؛
-- فالاسم الذي كتبه العضو في حجزه (`machinery_booking_members.display_name`) يُخفى هنا، لحظةَ يُسجَّل الحساب في
-- `closed_accounts` — في المعاملة نفسها التي تُغلقه.

create function public.machinery_hide_closed_name()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.machinery_booking_members set display_name = 'حساب مُغلَق' where member_id = new.user_id;
  return null;
end $$;

create trigger machinery_hide_closed_name
  after insert on public.closed_accounts
  for each row execute function public.machinery_hide_closed_name();

revoke execute on function public.machinery_hide_closed_name() from public, anon, authenticated, service_role;
