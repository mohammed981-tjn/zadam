-- معرّف صاحب الشركة الشريكة ومن وثّقها لا يقرؤهما كلّ مسجَّل (بقيّة DB-12، كما في 20261025230000 للمشاريع والموردين).
--
-- منذ 20261022050000_visitor_columns حُجب `owner_id` و`verified_by` في `partner_companies` عن الزائر، وبقيا لكلّ
-- مسجَّل: معرّف حساب صاحب الشركة، ومعرّف المدير الذي وثّقها. فيُسحبان من `authenticated`، ويقرؤهما صاحب الشركة
-- والإدارة بدالّة، والصفحتان تطلبان ما بقي.
--
-- لا حذف لبيانات: صلاحيّاتٌ تُستبدل ودالّةٌ تُضاف. والكتابة كلّها بالدوالّ منذ 20261017120000، فلا تمسّها.

-- hidden from members: owner_id, verified_by, review_note (the same list a visitor reads)
revoke select on table public.partner_companies from authenticated;
grant select (id, name, commercial_registration_no, kinds, states, contact_name, phone, whatsapp,
              bio, verified_at, active, created_at, updated_at)
  on table public.partner_companies to authenticated;

-- A policy's subquery reads as the reader, so partner_interests_parties (20261017120000) — which asked
-- partner_companies.owner_id directly — would fail for every member once the column is withheld (audit db-b-3,
-- 3 November 2026). It asks the security-definer helper instead, as the policies moved in 20261022050000 do.
alter policy partner_interests_parties on public.partner_interests
  using (owns_partner_company(company_id)
         or exists (select 1 from lands l where l.id = land_id and l.owner_id = (select auth.uid()))
         or is_admin());

-- The withheld columns of the reader's own company, or of all of them for an administrator.
create function public.partner_company_private(p_ids uuid[] default null)
returns table (id uuid, owner_id uuid, verified_by uuid)
language sql
stable
security definer
set search_path = public
as $$
  select c.id, c.owner_id, c.verified_by
    from partner_companies c
   where (p_ids is null or c.id = any (p_ids))
     and (c.owner_id = auth.uid() or is_admin());
$$;

revoke execute on function public.partner_company_private(uuid[]) from public, anon, service_role;
grant execute on function public.partner_company_private(uuid[]) to authenticated;
