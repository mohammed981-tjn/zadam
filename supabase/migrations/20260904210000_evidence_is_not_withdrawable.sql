-- الدليلُ الذي اعتُمد عليه لا يُسحب.
--
-- المرحلةُ ٣ تبدأ من هنا، لا من درجة الثقة
--
-- The study's third phase is Trust — a verification score, a farm passport, a
-- readiness percentage. Every one of those is a number computed from evidence.
--
-- And today the person being scored can delete the evidence afterwards.
--
-- `export_offer_evidence` rows freeze the moment an offer leaves draft: the
-- write policy requires `status in ('draft','rejected')`. But the **file** in
-- storage is governed by a policy that knows nothing about status:
--
--   evidence_delete_own — using (bucket_id = 'evidence'
--                            and (storage.foldername(name))[1] = auth.uid()::text)
--
-- Ownership of the folder, and nothing else. So a farmer whose offer is
-- published can delete the photograph a buyer is about to open, and the frozen
-- row stays behind pointing at nothing.
--
-- A trust score built on that is not a trust score. It is a number describing
-- files that may or may not still exist.
--
-- ما يُقفل ومتى — والقاعدةُ واحدة
--
-- Not "evidence cannot be deleted": someone who uploads the wrong file to a
-- draft must be able to remove it, and refusing that would make the platform
-- unusable for the ordinary case. The rule is narrower and follows the same
-- principle everywhere:
--
--   **once something was accepted on the strength of a file, that file stays.**
--
--   • عرضُ صادر    → خرج من المسوّدة (قُدِّم أو نُشر)
--   • مرحلةُ موسم  → اعتُمدت
--   • مرحلةُ عقد   → وُوفق عليها
--   • مستندُ أرض   → وُثِّقت الأرض عليه
--   • عهدةُ ذهب    → دائماً — السلسلةُ تُلحَق ولا تُعدَّل، فدليلُها كذلك
--
-- Before those moments the file is the uploader's to withdraw. After them it is
-- part of a record someone else relied on.
--
-- ولماذا الملفّ كلُّه هنا لا في الشيفرة
--
-- The upload goes from the browser straight to Supabase Storage; no server code
-- sees it. So `storage.objects` policies are not one layer of the defence —
-- they are the whole of it, and a check in `src/` would be decoration.
--
-- ولماذا تُعاد كتابةُ السياسات كلِّها
--
-- These policies have lived in the Supabase dashboard, outside the repository,
-- exactly like the base schema — and the same lesson applies: this migration
-- declares **all** of them, not only the one it changes. A migration that
-- edited one policy and assumed six others were already there would be one more
-- file that cannot rebuild what it describes.
--
-- تحفّظ: `sha256` يكشف الاستبدالَ لا الحذف
--
-- `export_offer_evidence` carries a hash, so nobody can swap a file for a
-- different one unnoticed. That is worth having and it is not what this fixes:
-- a hash proves what a file *was*, and a buyer opening a deleted file still
-- finds nothing.

-- ===========================================================================
-- ١) الدلاء
-- ===========================================================================

-- تُعلن هنا كي تكون الهجرةُ قادرةً على إعادة بناء ما تصفه. والقيمُ هي القائمة
-- في الإنتاج اليوم: `evidence` خاصّ، و`media` عامّ، وكلاهما بسقفِ عشرة ميغابايت
-- وقائمةِ أنواعٍ مغلقة.
insert into storage.buckets (id, public, file_size_limit, allowed_mime_types) values
  ('evidence', false, 10485760,
   array['image/jpeg','image/png','image/webp','image/heic','application/pdf']),
  ('media',    true,  10485760,
   array['image/jpeg','image/png','image/webp'])
on conflict (id) do update
   set public             = excluded.public,
       file_size_limit    = excluded.file_size_limit,
       allowed_mime_types = excluded.allowed_mime_types;

-- ===========================================================================
-- ٢) دلوُ الأدلّة
-- ===========================================================================

-- الرفعُ في مجلّد صاحبه وحده. وأوّلُ مقطعٍ من المسار هو معرّفُه، فلا يكتب أحدٌ
-- في مجلّد غيره.
drop policy if exists evidence_insert_own on storage.objects;
create policy evidence_insert_own on storage.objects
  for insert to authenticated
  with check (bucket_id = 'evidence'
              and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists evidence_read_own on storage.objects;
create policy evidence_read_own on storage.objects
  for select to authenticated
  using (bucket_id = 'evidence'
         and ((storage.foldername(name))[1] = auth.uid()::text or is_admin()));

-- ولا سياسةَ تحديثٍ على الدلو، عمداً وكما كان: ملفُّ دليلٍ يُستبدَل محتواه في
-- مكانه هو أسوأُ من ملفٍّ يُحذف، لأنّ الحذفَ يُرى والاستبدالَ لا يُرى.

-- والحذف: ملكيّةُ المجلّد **وألّا يكون شيءٌ قد اعتُمد عليه**.
drop policy if exists evidence_delete_own on storage.objects;
create policy evidence_delete_own on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'evidence'
    and (storage.foldername(name))[1] = auth.uid()::text

    -- عرضُ صادرٍ خرج من المسوّدة
    and not exists (
      select 1 from export_offer_evidence e
        join export_offers o on o.id = e.offer_id
       where e.storage_path = storage.objects.name
         and o.status not in ('draft', 'rejected'))

    -- مرحلةُ موسمٍ اعتُمدت
    and not exists (
      select 1 from stage_evidence se
        join season_stages ss on ss.id = se.stage_id
       where se.storage_path = storage.objects.name
         and ss.completed)

    -- مرحلةُ عقدٍ وُوفق عليها
    and not exists (
      select 1 from milestone_evidence me
        join contract_milestones cm on cm.id = me.milestone_id
       where me.storage_path = storage.objects.name
         and cm.approved_at is not null)

    -- أرضٌ وُثِّقت
    and not exists (
      select 1 from land_documents ld
        join lands l on l.id = ld.land_id
       where ld.storage_path = storage.objects.name
         and l.verification = 'verified')

    -- وسلسلةُ العهدة: لا شرطَ ولا استثناء. الأحداثُ تُلحَق ولا تُعدَّل ولا
    -- تُحذف — وقاعدةٌ كهذه لا تعني شيئاً إن جاز سحبُ الصور التي تسندها.
    and not exists (
      select 1 from custody_evidence ce
       where ce.storage_path = storage.objects.name)
  );

-- ===========================================================================
-- ٣) دلوُ الوسائط — للعموم قراءةً، وللإدارة كتابةً
-- ===========================================================================

drop policy if exists media_public_read on storage.objects;
create policy media_public_read on storage.objects
  for select using (bucket_id = 'media');

drop policy if exists media_admin_insert on storage.objects;
create policy media_admin_insert on storage.objects
  for insert with check (bucket_id = 'media' and is_admin());

drop policy if exists media_admin_update on storage.objects;
create policy media_admin_update on storage.objects
  for update using (bucket_id = 'media' and is_admin())
         with check (bucket_id = 'media' and is_admin());

drop policy if exists media_admin_delete on storage.objects;
create policy media_admin_delete on storage.objects
  for delete using (bucket_id = 'media' and is_admin());
