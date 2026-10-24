-- الأرض لا تُعقد كاملةً لأكثر من مستثمرٍ في المدّة نفسها (BUG-14، البند ١٦٢).
--
-- `partnership_agreement_sign` يتحقّق أنّ مساحة العقد لا تتجاوز مساحة الأرض، ولا ينظر إلى عقودها الأخرى:
-- فأرضٌ من عشرة فدادين تُوقَّع لمستثمرٍ بعشرةٍ ولآخر بعشرةٍ في الموسم نفسه، ويظنّ كلٌّ منهما أنّها له.
-- هنا يُقفل صفّ الأرض عند التوقيع (فلا يوقّع اثنان في اللحظة نفسها وكلاهما يرى الأرض فارغة)، ثمّ تُعدّ
-- مساحة العقود الموقَّعة عليها يوماً يوماً عند بداية كلّ عقدٍ متداخل، فيُرفض التوقيع إن لم يبقَ في أكثر
-- الأيّام ازدحاماً متّسعٌ لهذا العقد. العقود غير الموقَّعة لا تحجز شيئاً.
--
-- الدالّة كما هي في `20261023020000_partnership_managed.sql` بكلّ ما فيها، وزيادةُ هذه الكتلة وحدها
-- (والتصريحات ثلاثة متغيّرات). لا جدولٌ ولا سياسةٌ تُمسّ.

create or replace function public.partnership_agreement_sign(
  p_agreement uuid, p_version integer, p_hash text, p_full_name text, p_signature text, p_user_agent text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_a partnership_agreements;
  v_role text;
  v_feddans numeric;
  v_ref text;
  v_manager uuid;
  v_needed integer;
  v_party uuid;
  v_start date;
  v_end date;
  v_peak numeric;
begin
  if auth.uid() is null then raise exception 'سجّل الدخول أولاً.'; end if;
  select * into v_a from partnership_agreements where id = p_agreement for update;
  if v_a.id is null then raise exception 'لستَ طرفاً في هذا العقد.'; end if;
  if v_a.model = 'managed' and v_a.manager_company_id is not null then
    select owner_id into v_manager from partner_companies where id = v_a.manager_company_id;
  end if;

  v_role := case when auth.uid() = v_a.owner_id then 'owner'
                 when auth.uid() = v_a.investor_id then 'investor'
                 when v_manager is not null and auth.uid() = v_manager then 'manager' end;
  if v_role is null then raise exception 'لستَ طرفاً في هذا العقد.'; end if;
  if v_a.status = 'signed' then raise exception 'العقد موقَّعٌ ومقفل.'; end if;
  if p_version <> v_a.version or p_hash <> v_a.terms_hash then
    raise exception 'عُدِّلت البنود منذ فتحتَ الصفحة. اقرأ النسخة الجديدة ثمّ وقّع.';
  end if;

  select feddans into v_feddans from lands where id = v_a.land_id;
  perform partnership_terms_check(v_a.model, v_a.terms, v_feddans);

  -- BUG-14 (backlog 162): a land is contracted once for a stretch of time. Two signatures
  -- at one moment meet at the land's row; then the area already held by SIGNED agreements
  -- on it is counted day by day, and the busiest day must still leave room for this one.
  perform 1 from lands where id = v_a.land_id for update;
  v_start := (v_a.terms->>'start_date')::date;
  v_end := (v_a.terms->>'end_date')::date;
  select coalesce(max(h.held), 0) into v_peak
    from (
      select d.day, coalesce(sum((o.terms->>'feddans')::numeric), 0) as held
        from (
          select v_start as day
          union
          select (x.terms->>'start_date')::date
            from partnership_agreements x
           where x.land_id = v_a.land_id and x.id <> v_a.id and x.status = 'signed'
             and (x.terms->>'start_date')::date between v_start and v_end
        ) d
        left join partnership_agreements o
          on o.land_id = v_a.land_id and o.id <> v_a.id and o.status = 'signed'
         and (o.terms->>'start_date')::date <= d.day and (o.terms->>'end_date')::date >= d.day
       group by d.day
    ) h;
  if v_peak + (v_a.terms->>'feddans')::numeric > v_feddans then
    raise exception 'الأرض متعاقَدٌ على % من % فداناً في جزءٍ من هذه المدّة، والمتبقّي % فقط. عدّلوا المساحة أو المدّة.',
      trim_scale(v_peak), trim_scale(v_feddans), trim_scale(greatest(v_feddans - v_peak, 0));
  end if;
  if v_a.model = 'managed' and v_manager is null then
    raise exception 'سمِّ الشركة المديرة في البنود قبل التوقيع.';
  end if;

  begin
    insert into partnership_signatures (agreement_id, version, terms_hash, signer_id, role, full_name, signature, user_agent)
    values (v_a.id, v_a.version, v_a.terms_hash, auth.uid(), v_role, btrim(p_full_name), p_signature,
            left(p_user_agent, 400));
  exception when unique_violation then
    raise exception 'وقّعتَ هذه النسخة من قبل.';
  end;

  v_needed := case when v_a.model = 'managed' then 3 else 2 end;

  if (select count(*) from partnership_signatures
       where agreement_id = v_a.id and version = v_a.version) = v_needed then
    v_ref := 'SDQ-' || to_char(now() at time zone 'Africa/Khartoum', 'YYYY') || '-'
             || lpad(nextval('partnership_agreement_ref_seq')::text, 5, '0');
    update partnership_agreements set status = 'signed', signed_at = now(), ref = v_ref where id = v_a.id;
    foreach v_party in array array_remove(array[v_a.owner_id, v_a.investor_id, v_manager], null) loop
      perform notify_user(v_party, 'agreement_signed',
        case when v_needed = 3 then 'وُقِّع عقد الشراكة من الأطراف الثلاثة' else 'وُقِّع عقد الشراكة من الطرفين' end,
        'العقد مقفلٌ الآن، وشهدت عليه سوداقري برقم ' || v_ref || '.', '/invest/agreements/' || v_a.id);
    end loop;
    perform notify_admins('agreement_signed', 'عقد شراكة جديد موقَّع',
      case when v_needed = 3 then 'وقّع صاحب أرضٍ ومستثمرٌ وشركةٌ مديرة عقد شراكة برقم '
           else 'وقّع مستثمرٌ وصاحب أرض عقد شراكة برقم ' end || v_ref || '.',
      '/admin/inbox#agreements');
    return v_ref;
  end if;

  foreach v_party in array array_remove(array[v_a.owner_id, v_a.investor_id, v_manager], null) loop
    if v_party <> auth.uid() and not exists (
         select 1 from partnership_signatures s
          where s.agreement_id = v_a.id and s.version = v_a.version and s.signer_id = v_party) then
      perform notify_user(v_party, 'agreement_update', 'وقّع طرفٌ عقد الشراكة',
        'بقي توقيعك ليُقفل العقد وتشهد عليه سوداقري.', '/invest/agreements/' || v_a.id);
    end if;
  end loop;
  return null;
end;
$$;

revoke execute on function public.partnership_agreement_sign(uuid, integer, text, text, text, text) from public, anon;
grant execute on function public.partnership_agreement_sign(uuid, integer, text, text, text, text) to authenticated;
