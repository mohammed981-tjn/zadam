-- مزارعٌ بلا جوّال تسجّله جمعيّته (البند ١٦٩، الشريحة الثانية؛ قرار المالك، 26 أكتوبر 2026: «ابحث وانصح»).
--
-- ما تفعله المنصّات المشابهة (myCoop وOne Acre Fund وسجلّ المزارعين في OpenG2P): الجمعيّة أو المندوب يسجّل المزارع
-- بنفسه، بصورةٍ ووثيقة هويّة وموافقةٍ مكتوبة، ثمّ «مُدقِّقٌ» يعتمد السجلّ قبل أن يُعمل به، حتى لا يُسجَّل مزارعٌ وهميّ.
-- وهو هنا كذلك:
--   - الجمعيّة الموثّقة تفتح للمزارع حساباً بلا جوّال: اسمه وقريته، ورقم هويّته إن وُجد، وجوّال قريبٍ يُتّصل به إن وُجد،
--     وصورة المزارع، وصورة ورقة الموافقة موقَّعةً أو مبصومة؛
--   - يبقى الإذن معلَّقاً حتى تراجع الإدارة الورقة والصورة وتعتمده (أو تردّه بسبب)، فلا تعمل الجمعيّة عنه قبل ذلك؛
--   - الحساب لا يدخله أحد: عنوانٌ داخليّ وكلمة مرورٍ عشوائيّة لا يعرفها أحد؛
--   - حين يصير للمزارع جوّال يحضر إلى الجمعيّة أو يتّصل بالإدارة، فتربط الإدارة رقمه بحسابه وتقرأ له كلمةً مؤقّتة
--     (كاستعادة كلمة المرور)، فيصير حسابه هو، يُنهي إذن الجمعيّة متى شاء؛
--   - عشرة مزارعين في اليوم حدُّ الجمعيّة.

create table public.managed_farmers (
  user_id        uuid primary key references auth.users(id) on delete cascade,
  company_id     uuid not null references public.partner_companies(id) on delete restrict,
  created_by     uuid not null references auth.users(id),
  full_name      text not null check (length(btrim(full_name)) between 3 and 120),
  state          text not null check (length(btrim(state)) between 2 and 60),
  locality       text check (locality is null or length(btrim(locality)) between 2 and 80),
  village        text not null check (length(btrim(village)) between 2 and 80),
  -- رقم الهويّة الوطنيّة أو البطاقة القوميّة، إن وُجد: للإدارة وحدها، لتكشف التكرار.
  national_id    text check (national_id is null or national_id ~ '^[0-9A-Za-z-]{5,30}$'),
  -- جوّال قريبٍ أو جار يُتّصل به عن المزارع؛ ليس للدخول.
  contact_phone  text check (contact_phone is null or contact_phone ~ '^\+?[0-9]{7,15}$'),
  consent_path   text not null check (consent_path ~ '^[0-9a-f-]{36}/managed/[0-9a-f-]{36}-consent\.(jpg|jpeg|png|webp)$'),
  photo_path     text not null check (photo_path ~ '^[0-9a-f-]{36}/managed/[0-9a-f-]{36}-photo\.(jpg|jpeg|png|webp)$'),
  status         text not null default 'pending' check (status in ('pending', 'approved', 'refused', 'claimed')),
  review_note    text check (review_note is null or length(btrim(review_note)) between 3 and 300),
  created_at     timestamptz not null default now(),
  reviewed_at    timestamptz,
  reviewed_by    uuid references auth.users(id) on delete set null,
  claimed_at     timestamptz,
  check ((status = 'pending') = (reviewed_at is null)),
  check (status <> 'refused' or review_note is not null),
  check ((claimed_at is not null) = (status = 'claimed'))
);

create unique index managed_farmers_national_id on public.managed_farmers (national_id)
  where national_id is not null and status <> 'refused';
create index managed_farmers_pending on public.managed_farmers (created_at) where status = 'pending';

alter table public.managed_farmers enable row level security;
revoke all on public.managed_farmers from anon, authenticated;
-- The administration's review list counts it; nobody else reads the table, the company included.
grant select on public.managed_farmers to authenticated;
create policy managed_farmers_admin on public.managed_farmers
  for select to authenticated using (is_admin());

-- ── قبل فتح الحساب ──────────────────────────────────────────────────────────

-- The server asks before it makes the account: is the caller a verified, active company under its day's limit?
create function public.managed_farmer_can_register()
returns uuid
language plpgsql
stable
security definer
set search_path = public
as $$
declare v_company uuid;
begin
  select id into v_company from partner_companies
   where owner_id = auth.uid() and verified_at is not null and active;
  if v_company is null then
    raise exception 'تسجيل المزارعين لجمعيّةٍ أو شركةٍ موثّقة.';
  end if;
  if (select count(*) from managed_farmers where company_id = v_company and created_at > now() - interval '1 day') >= 10 then
    raise exception 'عشرة مزارعين في اليوم حدُّ الجمعيّة. أكمل غداً.';
  end if;
  return v_company;
end $$;

-- ── التسجيل ─────────────────────────────────────────────────────────────────

-- The account was just made by the server for this purpose (marked so, minutes old, never registered); the company
-- records the farmer against it, and a mandate waits for the administration to approve.
create function public.managed_farmer_register(
  p_user uuid, p_full_name text, p_state text, p_locality text, p_village text, p_national_id text,
  p_contact_phone text, p_consent_path text, p_photo_path text, p_scopes text[], p_note text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company uuid := public.managed_farmer_can_register();
  v_folder text := auth.uid()::text || '/managed/';
begin
  if not exists (select 1 from auth.users u
                  where u.id = p_user
                    and u.raw_user_meta_data ->> 'managed' = 'true'
                    and u.email like 'm%@managed.invalid'
                    and u.created_at > now() - interval '10 minutes')
     or exists (select 1 from managed_farmers where user_id = p_user) then
    raise exception 'حسابٌ غير صالحٍ لهذا.';
  end if;
  if p_consent_path not like v_folder || '%' or p_photo_path not like v_folder || '%' then
    raise exception 'الصورتان من مجلّدك أنت.';
  end if;
  if to_regclass('storage.objects') is not null
     and (select count(*) from storage.objects
           where bucket_id = 'evidence' and name in (p_consent_path, p_photo_path)) < 2 then
    raise exception 'لم نجد الصورتين المرفوعتين. ارفعهما ثمّ سجّل.';
  end if;
  if nullif(btrim(p_national_id), '') is not null and exists (
       select 1 from managed_farmers where national_id = btrim(p_national_id) and status <> 'refused') then
    raise exception 'هذا الرقم الوطنيّ مسجَّلٌ لمزارعٍ من قبل.';
  end if;

  insert into managed_farmers (user_id, company_id, created_by, full_name, state, locality, village, national_id,
                               contact_phone, consent_path, photo_path)
  values (p_user, v_company, auth.uid(), btrim(p_full_name), btrim(p_state), nullif(btrim(p_locality), ''),
          btrim(p_village), nullif(btrim(p_national_id), ''),
          nullif(regexp_replace(coalesce(p_contact_phone, ''), '[\s-]', '', 'g'), ''), p_consent_path, p_photo_path);

  -- No phone of his own: the tail is the account's, and the farmer cannot answer; the administration does, with the
  -- paper in front of it.
  insert into agent_mandates (company_id, farmer_id, scopes, note, phone_tail, requested_by)
  values (v_company, p_user, (select array_agg(distinct s order by s) from unnest(p_scopes) s), btrim(p_note), '0000',
          auth.uid());

  insert into profiles (id, full_name) values (p_user, btrim(p_full_name))
  on conflict (id) do update set full_name = excluded.full_name;

  perform public.notify_admins('agent_mandate', 'مزارعٌ بلا جوّال ينتظر الاعتماد: ' || btrim(p_full_name),
    'سجّلته جمعيّته بورقة موافقة وصورة. راجعهما ثمّ اعتمد الإذن أو ردّه بسبب.', '/admin/managed');
end $$;

-- ── المراجعة والربط بجوّال ──────────────────────────────────────────────────

create function public.managed_farmers_pending()
returns table (user_id uuid, company_name text, full_name text, state text, locality text, village text,
               national_id text, contact_phone text, consent_path text, photo_path text, scopes text[], note text,
               status text, created_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select f.user_id, c.name, f.full_name, f.state, f.locality, f.village, f.national_id, f.contact_phone,
         f.consent_path, f.photo_path, m.scopes, m.note, f.status, f.created_at
    from managed_farmers f
    join partner_companies c on c.id = f.company_id
    left join agent_mandates m on m.farmer_id = f.user_id and m.company_id = f.company_id
                              and m.status in ('pending', 'active')
   where is_admin() and f.status in ('pending', 'approved')
   order by (f.status = 'pending') desc, f.created_at
$$;

create function public.managed_farmer_review(p_user uuid, p_approve boolean, p_note text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare f managed_farmers%rowtype;
begin
  if not is_admin() then
    raise exception 'للإدارة وحدها.';
  end if;
  select * into f from managed_farmers where user_id = p_user for update;
  if not found or f.status <> 'pending' then
    raise exception 'لا تسجيل ينتظر بهذا.';
  end if;
  if not p_approve and length(btrim(coalesce(p_note, ''))) < 3 then
    raise exception 'اكتب سبب الردّ؛ تقرؤه الجمعيّة.';
  end if;
  update managed_farmers
     set status = case when p_approve then 'approved' else 'refused' end, reviewed_at = now(), reviewed_by = auth.uid(),
         review_note = nullif(btrim(coalesce(p_note, '')), '')
   where user_id = p_user;
  update agent_mandates
     set status = case when p_approve then 'active' else 'declined' end, answered_at = now()
   where farmer_id = p_user and company_id = f.company_id and status = 'pending';
  perform public.notify_user(f.created_by, 'agent_mandate',
    case when p_approve then 'اعتُمد تسجيل ' || f.full_name else 'رُدّ تسجيل ' || f.full_name end,
    case when p_approve then 'صرتم تعملون عنه في «مزارعيّ».' else 'السبب: ' || btrim(p_note) end, '/agent');
end $$;

-- After the server tied a phone to the account and set a temporary password: the farmer holds it now, and agents find
-- him by that number like anyone else. A number another account already has is refused.
create function public.managed_farmer_claimed(p_user uuid, p_phone text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_key text := public.phone_key(p_phone);
begin
  if not is_admin() then
    raise exception 'للإدارة وحدها.';
  end if;
  if v_key is null or length(v_key) < 9 then
    raise exception 'رقم جوّالٍ غير صالح.';
  end if;
  if exists (select 1 from profiles where id <> p_user and public.phone_key(phone) = v_key) then
    raise exception 'هذا الرقم لحسابٍ آخر.';
  end if;
  update managed_farmers set status = 'claimed', claimed_at = now()
   where user_id = p_user and status = 'approved';
  if not found then
    raise exception 'يُربط بجوّالٍ مزارعٌ اعتُمد تسجيله.';
  end if;
  update profiles set phone = btrim(p_phone) where id = p_user;
end $$;

revoke execute on function public.managed_farmer_can_register() from public, anon;
revoke execute on function public.managed_farmer_register(uuid, text, text, text, text, text, text, text, text, text[], text)
  from public, anon;
revoke execute on function public.managed_farmers_pending() from public, anon;
revoke execute on function public.managed_farmer_review(uuid, boolean, text) from public, anon;
revoke execute on function public.managed_farmer_claimed(uuid, text) from public, anon;
grant execute on function public.managed_farmer_can_register() to authenticated;
grant execute on function public.managed_farmer_register(uuid, text, text, text, text, text, text, text, text, text[], text)
  to authenticated;
grant execute on function public.managed_farmers_pending() to authenticated;
grant execute on function public.managed_farmer_review(uuid, boolean, text) to authenticated;
grant execute on function public.managed_farmer_claimed(uuid, text) to authenticated;
