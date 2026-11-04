-- «نزّل بياناتي» للمزارع الذي سجّلته جمعيّته (البند ١٦٩، الشريحة الثانية — ما بقي منها).
--
-- سجلّ تسجيله في `managed_farmers` تقرؤه الإدارة وحدها (فيه الرقم الوطنيّ)، فلم يكن في ملفّ بياناته ولو تسلّم حسابه.
-- وهو بياناته: اسمه وقريته ورقمه الوطنيّ وجوّال قريبه، ومتى سُجّل ومن سجّله، ومتى اعتُمد ومتى تسلّم حسابه. هذه
-- الدالّة تعطيه صفَّه هو وحده، ولا تعطي معرّفات من سجّله أو راجعه (حسابات غيره)، بل اسم الجمعيّة. ومسارا الصورتين
-- (صورته وورقة الموافقة) في مجلّد الجمعيّة، فيُذكر أنّهما محفوظتان ولا تُعطى مساراتهما.

create function public.managed_farmer_mine()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
           'full_name', m.full_name,
           'state', m.state,
           'locality', m.locality,
           'village', m.village,
           'national_id', m.national_id,
           'contact_phone', m.contact_phone,
           'registered_by', c.name,
           'status', m.status,
           'review_note', m.review_note,
           'photo_and_consent_kept', true,
           'created_at', m.created_at,
           'reviewed_at', m.reviewed_at,
           'claimed_at', m.claimed_at)
    from managed_farmers m
    left join partner_companies c on c.id = m.company_id
   where m.user_id = auth.uid();
$$;

revoke execute on function public.managed_farmer_mine() from public, anon;
grant execute on function public.managed_farmer_mine() to authenticated;
