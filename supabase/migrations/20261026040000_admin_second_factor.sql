-- الإدارة لا تعمل إلا بالرمز الثاني (خطّة إصلاح الفحص، الموجة الأولى §٤، AUTH-04؛ البند ١٤١).
--
-- حسابا الإدارة يعتمدان المراحل ويوثّقان الأراضي ويفصلان في النزاعات ويرون ما لا يراه غيرهما. كلمة مرورٍ تسرّبت تكفي
-- اليوم لكلّ ذلك. فصار `is_admin()` — الحارس الذي تقرؤه كلّ سياسةٍ تقريباً — لا يقول «مدير» إلا لجلسةٍ دخلت بالرمز
-- الثاني (تطبيق مصادقة: Google Authenticator أو Microsoft Authenticator)، أي أنّ رمز الدخول يحمل `aal2`.
--
-- ولا يُقفل الباب على المدير: صفحات الإدارة تعرض له، حين لا يكون رمزٌ في جلسته، أن يضيف تطبيق المصادقة (رمز QR) أو
-- يكتب رمزه، ثمّ تعمل. ومفتاحٌ واحد يوقف الشرط عند الحاجة، لا يقلبه إلا مديرٌ دخل بالرمز الثاني؛ وإن ضاع هاتف المدير
-- فيُوقَف من محرّر SQL في لوحة Supabase بيد المالك:
--   update public.security_settings set admin_requires_second_factor = false;

create table public.security_settings (
  id                            boolean primary key default true check (id),
  admin_requires_second_factor  boolean not null default true,
  updated_at                    timestamptz not null default now(),
  updated_by                    uuid references auth.users(id) on delete set null
);

insert into public.security_settings (id) values (true);

alter table public.security_settings enable row level security;
revoke all on public.security_settings from anon, authenticated;

create function public.admin_second_factor_required()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select admin_requires_second_factor from security_settings), true)
$$;

-- The session's assurance level, as the access token carries it.
create function public.session_aal()
returns text
language sql
stable
as $$
  select coalesce(auth.jwt() ->> 'aal', '')
$$;

create or replace function public.is_admin()
 returns boolean
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select exists (select 1 from profiles where id = auth.uid() and role = 'admin')
     and (public.session_aal() = 'aal2' or not public.admin_second_factor_required());
$function$;

-- What the admin pages ask: is this account an administrator, and what does it lack to act as one?
create function public.admin_session_state()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case
           when not exists (select 1 from profiles where id = auth.uid() and role = 'admin') then 'not_admin'
           when public.is_admin() then 'ok'
           else 'needs_second_factor'
         end
$$;

create function public.admin_second_factor_set(p_required boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Turning it off needs an administrator who is one now; so does turning it back on.
  if not public.is_admin() then
    raise exception 'للإدارة وحدها، بالرمز الثاني.';
  end if;
  update security_settings set admin_requires_second_factor = p_required, updated_at = now(), updated_by = auth.uid();
end $$;

revoke execute on function public.admin_second_factor_set(boolean) from public, anon;
revoke execute on function public.admin_session_state() from public, anon;
grant execute on function public.admin_second_factor_set(boolean) to authenticated;
grant execute on function public.admin_session_state() to authenticated;
