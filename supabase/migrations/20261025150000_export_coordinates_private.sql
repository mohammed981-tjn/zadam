-- إحداثيّات عروض الصادر ومسارات الأدلّة لصاحب العرض وللمدير وحدهما (البند ١٩٨، بقرار المالك 25 أكتوبر 2026).
--
-- 20261024070000 أغلقت موقع المزرعة في export_offer_origins وحدها، وبقي `authenticated` يقرأ خطّ العرض والطول في
-- محطّات الشحنة وفي صور الأدلّة (تُنسخ من بيانات الصورة فهي المزرعة غالباً) ومسار ملفّ الدليل. المالك: «الزائر لا يرى
-- أيّ شيء إطلاقاً»، والمسجَّل غير صاحب العرض كذلك. يُسحب ذلك ويُقرأ بدالّتين لصاحب العرض وللمدير — كما فُعل بالمصدر.
--
-- جزءٌ من الموجة الأولى لمراجعة البند ١٩٨ (docs/review-198-ar.md).

-- ── ١. الصادر ───────────────────────────────────────────────────────────────

revoke select on table public.export_offer_custody from authenticated;
grant select (id, offer_id, sequence, occurred_at, place_name, note, created_at)
  on table public.export_offer_custody to authenticated;

revoke select on table public.export_offer_evidence from authenticated;
grant select (id, offer_id, kind, captured_at, sha256, created_at, document_type_id)
  on table public.export_offer_evidence to authenticated;

create function public.export_offer_custody_detail(p_offer uuid)
returns table (sequence integer, occurred_at timestamptz, place_name text, latitude numeric, longitude numeric, note text)
language sql
stable
security definer
set search_path = public
as $$
  select c.sequence, c.occurred_at, c.place_name, c.latitude, c.longitude, c.note
    from export_offer_custody c
    join export_offers e on e.id = c.offer_id
   where c.offer_id = p_offer
     and (e.owner_id = auth.uid() or is_admin())
   order by c.sequence;
$$;

create function public.export_offer_evidence_detail(p_offer uuid)
returns table (id uuid, kind text, captured_at timestamptz, latitude numeric, longitude numeric,
               storage_path text, sha256 text, document_type_id uuid, created_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select v.id, v.kind, v.captured_at, v.latitude, v.longitude, v.storage_path, v.sha256, v.document_type_id, v.created_at
    from export_offer_evidence v
    join export_offers e on e.id = v.offer_id
   where v.offer_id = p_offer
     and (e.owner_id = auth.uid() or is_admin())
   order by v.created_at;
$$;

revoke execute on function public.export_offer_custody_detail(uuid), public.export_offer_evidence_detail(uuid) from public, anon;
grant execute on function public.export_offer_custody_detail(uuid), public.export_offer_evidence_detail(uuid) to authenticated;
