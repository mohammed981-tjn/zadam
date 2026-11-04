-- معرّفات الحسابات ومسار مستند الترخيص في `projects` و`suppliers` لا يقرؤها كلّ مسجَّل (البند ١٨١، بقيّة DB-12).
--
-- منذ 20261022050000_visitor_columns حُجبت هذه الأعمدة عن الزائر، وبقيت لكلّ مسجَّل:
--   - `projects`: `created_by` و`review_note` (ملاحظة المراجعة) و`land_id`؛
--   - `suppliers`: `owner_id` و`licence_doc_path` (مسار مستند الترخيص في المخزن) و`verified_by` (من وثّق من الإدارة).
-- الصفوف نفسها لا يراها المسجَّل إلا منشورةً موثّقة، لكنّ أعمدتها هذه لصاحبها وللإدارة وحدهما. فتُسحب من `authenticated`
-- ويقرؤها صاحب الصفّ والمدير بدالّتين، والصفحات تطلب ما بقي.
--
-- ومن صفحة المشروع يحتاج العضو أرض المشروع ليجد بطاقة عرضها للمستثمرين: `project_open_land` تعطيها إن كانت الأرض
-- معروضةً للمستثمرين الآن (بشروط `investor_open_lands` نفسها)، أو كان القارئ صاحب المشروع أو مديراً.
--
-- لا حذف لبيانات: صلاحيّاتٌ تُستبدل ودوالّ تُضاف.

-- ── المشاريع ────────────────────────────────────────────────────────────────
-- hidden from members: created_by, review_note, land_id (the same list a visitor reads)
revoke select on table public.projects from authenticated;
grant select (id, slug, name, location, description, total_feddans, price_per_share, total_shares,
              shares_sold, status, risk_level, expected_annual_return, cover_image_url, created_at,
              is_demo, review_status, submitted_by, risk_score, crop_key, station_key,
              planting_month, irrigation, water_source, declared_water_per_feddan,
              documents_on_file, documents_required, km_to_market)
  on table public.projects to authenticated;

-- ── الموردون ────────────────────────────────────────────────────────────────
-- hidden from members: owner_id, licence_doc_path, verified_by, review_note
revoke select on table public.suppliers from authenticated;
grant select (id, name, state, locality, phone, whatsapp, delivery_states, categories,
              pesticide_licence_no, seed_registration_no, commercial_registration_no,
              bio, verified_at, active, created_at, updated_at)
  on table public.suppliers to authenticated;

-- ── ما حُجب يقرؤه صاحبه والإدارة ────────────────────────────────────────────

-- The withheld columns of the projects the reader submitted or created, or of all of them for an administrator.
create function public.project_private(p_ids uuid[] default null)
returns table (id uuid, created_by uuid, review_note text, land_id uuid)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, p.created_by, p.review_note, p.land_id
    from projects p
   where (p_ids is null or p.id = any (p_ids))
     and (p.submitted_by = auth.uid() or p.created_by = auth.uid() or is_admin());
$$;

-- The withheld columns of the reader's own supplier, or of all of them for an administrator.
create function public.supplier_private(p_ids uuid[] default null)
returns table (id uuid, owner_id uuid, licence_doc_path text, verified_by uuid)
language sql
stable
security definer
set search_path = public
as $$
  select s.id, s.owner_id, s.licence_doc_path, s.verified_by
    from suppliers s
   where (p_ids is null or s.id = any (p_ids))
     and (s.owner_id = auth.uid() or is_admin());
$$;

-- The land a project stands on, for its page: when that land is open to investors now, or to its owner and the admins.
create function public.project_open_land(p_project uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select p.land_id
    from projects p
    join lands l on l.id = p.land_id
   where p.id = p_project
     and ((p.status <> 'draft' and l.verification = 'verified' and l.open_to_investors
           and cardinality(l.investor_models) > 0)
          or p.submitted_by = auth.uid() or p.created_by = auth.uid() or is_admin());
$$;

revoke execute on function public.project_private(uuid[]), public.supplier_private(uuid[]), public.project_open_land(uuid)
  from public, anon, service_role;
grant execute on function public.project_private(uuid[]), public.supplier_private(uuid[]), public.project_open_land(uuid)
  to authenticated;
