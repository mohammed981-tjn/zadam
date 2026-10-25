-- نموذج التواصل والملاحظات لا يوقفه زائرٌ واحد (البند ١٩٨: د٩).
--
-- كان سقفُ الازدحام (٣٠٠ صفّ في الساعة، 20261024030000) يُعدّ على الجدول كلّه لا على المرسِل، والنموذجُ يكتب بالمفتاح
-- العامّ نفسه الذي يملكه كلّ من فتح الموقع. فسكربتٌ يرسل ٣٠٠ صفٍّ مباشرةً إلى الواجهة يوقف النموذج الحقيقيّ ساعةً
-- للناس كلّهم.
--
-- الآن:
--   - لا يكتب أحدٌ في `leads` ولا `feedback` مباشرةً من المتصفّح أو الواجهة العامّة: الكتابة من خادم الموقع وحده
--     (‎/api/leads و‎/api/feedback‎)، بعد حدّه لكلّ عنوانٍ على حدة (خمسة في الدقيقة، كما كان)، وبمفتاح الخدمة.
--   - ويبقى على ما يكتبه الخادم سقفُ الطول، وسقفٌ عامّ عالٍ (٣٠٠٠ في الساعة لكلّ جدول) لا يبلغه إلا هجومٌ من آلاف
--     العناوين: حاجزٌ أخير يحفظ الجدول، لا بابٌ يغلقه زائرٌ واحد.
--   - وما كُتب بمدير القاعدة (الهجرات والصيانة) لا يُحدّ.

revoke insert on public.leads, public.feedback from anon, authenticated;

create or replace function public.visitor_write_gate()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text := coalesce(current_setting('role', true), '');
  v_cap integer;
begin
  if v_role in ('anon', 'authenticated', 'service_role') then
    -- The site's server writes with the service key after its own per-address limit; a caller with the public key
    -- holds no INSERT any more, and the old ceiling stays for them in case a grant ever comes back.
    v_cap := case when v_role = 'service_role' then 3000 else 300 end;
    if tg_table_name = 'leads' then
      if length(coalesce(new.full_name, '')) > 120 or length(coalesce(new.contact, '')) > 200
         or length(coalesce(new.interest, '')) > 500 or length(coalesce(new.message, '')) > 2000 then
        raise exception 'النصّ أطول من المسموح.';
      end if;
      if (select count(*) from leads where created_at > now() - interval '1 hour') >= v_cap then
        raise exception 'الطلبات كثيرةٌ الآن. أعد المحاولة بعد قليل.';
      end if;
    else
      if length(coalesce(new.display_name, '')) > 120 or length(coalesce(new.contact, '')) > 200
         or length(coalesce(new.page_path, '')) > 300 then
        raise exception 'النصّ أطول من المسموح.';
      end if;
      if (select count(*) from feedback where created_at > now() - interval '1 hour') >= v_cap then
        raise exception 'الملاحظات كثيرةٌ الآن. أعد المحاولة بعد قليل.';
      end if;
    end if;
  end if;
  return new;
end;
$$;

revoke execute on function public.visitor_write_gate() from public, anon, authenticated;
