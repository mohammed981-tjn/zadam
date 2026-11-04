-- الحذفُ من التخزين يعمل من جديد، بالحماية نفسها (فحص 3 نوفمبر 2026، db-a-4؛ السؤال 14 للمالك: «نُصلحه في هذه المرحلة»).
--
-- منذ 20261025150000 لا يقرأ `authenticated` عمود export_offer_evidence.storage_path (مواقع المزارع في صور الأدلّة).
-- وسياسةُ الحذف evidence_delete_own (20260904210000) تقرؤه في استعلامٍ فرعيّ، والإذنُ يُفحص عند تخطيط الاستعلام لا عند
-- تنفيذه، وسياساتُ الحذف كلُّها تُضمّ في كلّ حذف. فصار كلُّ حذفٍ من storage.objects يُردّ بـ«permission denied» — من الدلوين،
-- ولصاحب الملفّ وللمدير — ولو لم يمسّ دليلاً.
--
-- الفحوصُ نفسُها تنتقل إلى دالّةٍ تقرأ بصلاحيّة مالكها، والسياسةُ تسألها. لا يتغيّر ما يُسمح بحذفه: صاحبُ المجلّد وحده،
-- وما اعتُمد عليه يبقى (عرضُ صادرٍ خرج من المسوّدة، مرحلةُ موسمٍ أُنجزت، مرحلةُ عقدٍ وُوفق عليها، أرضٌ وُثِّقت، سلسلةُ
-- العهدة). والدالّةُ تجيب عن ملفّات السائل وحده، فلا تكشف عن ملفّ غيره هل اعتُمد عليه.

create or replace function public.evidence_object_withdrawable(p_name text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select (storage.foldername(p_name))[1] = auth.uid()::text

    -- عرضُ صادرٍ خرج من المسوّدة
    and not exists (
      select 1 from export_offer_evidence e
        join export_offers o on o.id = e.offer_id
       where e.storage_path = p_name
         and o.status not in ('draft', 'rejected'))

    -- مرحلةُ موسمٍ اعتُمدت
    and not exists (
      select 1 from stage_evidence se
        join season_stages ss on ss.id = se.stage_id
       where se.storage_path = p_name
         and ss.completed)

    -- مرحلةُ عقدٍ وُوفق عليها
    and not exists (
      select 1 from milestone_evidence me
        join contract_milestones cm on cm.id = me.milestone_id
       where me.storage_path = p_name
         and cm.approved_at is not null)

    -- أرضٌ وُثِّقت
    and not exists (
      select 1 from land_documents ld
        join lands l on l.id = ld.land_id
       where ld.storage_path = p_name
         and l.verification = 'verified')

    -- وسلسلةُ العهدة: لا شرطَ ولا استثناء.
    and not exists (
      select 1 from custody_evidence ce
       where ce.storage_path = p_name)
$$;

comment on function public.evidence_object_withdrawable(text) is
  'ملفٌّ في دلو الأدلّة يملكه السائل ولم يُعتمد عليه بعد، فيجوز له حذفه. تسألها سياسة evidence_delete_own.';

-- Default privileges are revoked since 20261024030000: the policy runs as the member, who must be able to call it.
revoke all on function public.evidence_object_withdrawable(text) from public, anon;
grant execute on function public.evidence_object_withdrawable(text) to authenticated, service_role;

drop policy if exists evidence_delete_own on storage.objects;
create policy evidence_delete_own on storage.objects
  for delete to authenticated
  using (bucket_id = 'evidence' and public.evidence_object_withdrawable(name));
