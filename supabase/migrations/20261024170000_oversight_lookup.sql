-- ═══════════════════════════════════════════════════════════════════════════
-- البحث عن دفترٍ لفحصه (البند ١٩١): المدير يختار شخصاً لا رقم دفتر
--
-- فتح الفحص (ledger_inspect_open) يأخذ رقم الدفتر، والمدير لا يقرأ الدفاتر فلا سبيل له إلى رقمه. هذه الدالّة
-- تعطيه رقم دفتر شخصٍ من نوعٍ بعينه — الرقم وحده، لا حرفاً من محتواه — ليفتح به فحصاً بسببٍ مكتوب يُخطَر به
-- صاحب الدفتر. وجود الدفتر نفسه ليس سرّاً على من يملك مفتاح الفحص: يرى الفحصُ الدفترَ كلّه على أيّ حال.
--
-- دالّةٌ جديدة فقط، بلا حذف.
-- ═══════════════════════════════════════════════════════════════════════════

create function public.oversight_find_book(p_user uuid, p_kind text)
returns uuid
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or not is_admin() then
    raise exception 'للإدارة وحدها';
  end if;
  if p_kind not in ('farm', 'investor') then
    raise exception 'نوع دفترٍ غير معروف';
  end if;
  return (select b.id from public.ledger_books b where b.owner_id = p_user and b.kind = p_kind);
end $$;

-- Of an administrator by its own check; closed to the visitor and to the service key (an inspection is opened by a named person).
revoke execute on function public.oversight_find_book(uuid, text) from public, anon, service_role;
grant execute on function public.oversight_find_book(uuid, text) to authenticated;
