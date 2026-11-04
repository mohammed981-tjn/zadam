-- ثلاثة حرّاس صغار من فحص 3 نوفمبر 2026 (المالك، 4 نوفمبر: الأسئلة 20 و21 و23).

-- ── ١. مصدر الماء من القائمة (app-api-3) ───────────────────────────────────
-- كان الفحص في الكود بـ `in`، فقيمةٌ مثل "toString" تمرّ وتُسقط صفحة الأرض حين تُعرض. والقاعدة تقول القائمة الآن أيضاً.
alter table public.lands
  add constraint lands_water_source_known
  check (water_source is null or water_source in ('canal', 'river_pump', 'borehole', 'rainfed'));

-- ── ٢. سقف التخزين: 100 ميجابايت لكلّ حساب (ops-5) ─────────────────────────
-- لا سقف كان لما يرفعه حسابٌ من صورٍ ومستندات، والتخزين المجّانيّ كلّه 1 جيجابايت: حسابٌ واحد يوقف الرفع للجميع.
-- ما رفعه الحساب يُعدّ قبل كلّ رفعٍ جديد؛ وكلّ ملفٍّ لا يتجاوز 10 ميجابايت (حدّ الدلو)، فأقصى ما يبلغه الحساب 110.
-- والمدير بلا سقف.
create function public.storage_used_by(p_user uuid)
returns bigint
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(sum((o.metadata ->> 'size')::bigint), 0)
    from storage.objects o
   where o.owner = p_user
$$;

comment on function public.storage_used_by(uuid) is 'ما رفعه حسابٌ إلى التخزين بالبايت. يسألها سقف storage_quota_per_account.';
revoke all on function public.storage_used_by(uuid) from public, anon;
grant execute on function public.storage_used_by(uuid) to authenticated, service_role;

create policy storage_quota_per_account on storage.objects
  as restrictive for insert to authenticated
  with check (public.is_admin() or public.storage_used_by(auth.uid()) < 100 * 1024 * 1024);

-- ── ٣. العرض على المستثمرين والشركاء للمالك والمدير وحدهما (db-b-4 / money-logic-5) ──
-- الوكيل (20261026020000) يكتب في أرض المزارع الذي فوّضه، وكان يستطيع أيضاً عرضها على المستثمرين والشركاء. العرض قرار
-- المالك: يسجّل الوكيل الأرض ويحدّث بياناتها، ولا يغيّر هذه الأعمدة.
create function public.lands_offer_owner_only()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if auth.uid() is null or auth.uid() = new.owner_id or is_admin() then
    return new;
  end if;
  if (tg_op = 'INSERT' and (new.open_to_investors or new.open_to_partners
                            or cardinality(new.investor_models) > 0 or new.investor_note is not null))
     or (tg_op = 'UPDATE' and (new.open_to_investors is distinct from old.open_to_investors
                            or new.open_to_partners is distinct from old.open_to_partners
                            or new.investor_models is distinct from old.investor_models
                            or new.investor_note is distinct from old.investor_note)) then
    raise exception 'عرض الأرض على المستثمرين أو الشركاء قرارُ صاحبها وحده.';
  end if;
  return new;
end $$;

revoke all on function public.lands_offer_owner_only() from public, anon, authenticated;

create trigger lands_offer_owner_only
  before insert or update on public.lands
  for each row execute function public.lands_offer_owner_only();
