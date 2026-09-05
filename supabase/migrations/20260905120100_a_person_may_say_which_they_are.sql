-- ولمن يسجّل أن يقول أيَّهما هو — ولا يقول إنّه مدير.
--
-- ما كان الحارسُ يحرسه، وما كان يمنعه بالمصادفة
--
-- `prevent_self_role_escalation` reverts **any** role change a non-admin makes,
-- silently. That is right for one reason and one only: `role = 'admin'` is the
-- key to the entire administration surface, and a user who could write their
-- own role could hand it to themselves.
--
-- But the guard was written as "no role change at all", and so it also forbids
-- the change that grants nothing. `investor` and `farmer` confer no privilege
-- anywhere — every `role` check in the application compares against `'admin'`,
-- and no policy reads the column at all. Blocking those two was collateral, not
-- intent, and its cost was that a farmer could never be recorded as one.
--
-- So the rule becomes precise instead of broad: **a person may move between the
-- two roles that grant nothing, and may not touch the two that do.**
--
--   • investor ⇄ farmer      — يسمح
--   • أيُّ شيءٍ من/إلى admin أو field_agent — يُرجَع بصمت، كما كان
--
-- ويبقى الرجوعُ صامتاً، وهو اختيارٌ قديمٌ صائب: خطأٌ صريحٌ يخبر من يجسّ الحارسَ
-- أيَّ حقلٍ يراقب، والرجوعُ الصامتُ يتركه بكتابةٍ تبدو ناجحةً ولا تغيّر شيئاً.
--
-- ولماذا يُقرأ الدورُ من بيانات التسجيل الآن
--
-- `handle_new_user` hard-coded `'investor'`, with a comment saying the role is
-- never taken from signup input. The reasoning was sound and the implementation
-- was blunt: what must never come from signup input is **admin**. So the
-- metadata is read, and then narrowed to the two harmless values — anything
-- else, including a hand-crafted `"admin"` in the sign-up payload, falls back
-- to `farmer`.
--
-- والافتراضيُّ صار `farmer` لا `investor`: من يصل اليومَ إلى منصّةٍ لا يعمل
-- استثمارُها بعدُ، ويجد أمامه أرضاً وموسماً وجوازاً، مزارعٌ حتّى يقول غيرَ ذلك.

-- ===========================================================================
-- ١) الحارس — يمنع ما يمنح، ويسمح بما لا يمنح
-- ===========================================================================

create or replace function public.prevent_self_role_escalation()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  if new.role is distinct from old.role
     and auth.uid() is not null
     and not is_admin()
     -- والشرطُ الجديد: كلا الطرفين بلا صلاحية. فالانتقالُ من `investor` إلى
     -- `farmer` لا يفتح باباً، والانتقالُ إلى `admin` يفتحها كلَّها.
     and not (old.role in ('investor', 'farmer')
              and new.role in ('investor', 'farmer')) then
    new.role := old.role;
  end if;
  return new;
end $function$;

-- ===========================================================================
-- ٢) والتسجيلُ يقرأ الاختيار — ولا يقرأ منه صلاحية
-- ===========================================================================

create or replace function public.handle_new_user()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_role user_role;
begin
  -- ما يأتي من التسجيل نصٌّ يكتبه العميل، فيُضيَّق إلى القيمتين اللتين لا
  -- تمنحان شيئاً. و«admin» مكتوبةً بيدٍ في الحمولة تسقط هنا إلى `farmer`.
  v_role := case new.raw_user_meta_data->>'role'
              when 'investor' then 'investor'::user_role
              else 'farmer'::user_role
            end;

  insert into profiles (id, full_name, role, phone)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    v_role,
    nullif(coalesce(new.phone, new.raw_user_meta_data->>'phone', ''), '')
  );
  return new;
end;
$function$;
