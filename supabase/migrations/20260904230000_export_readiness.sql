-- جاهزيّةُ العرض: ٧ من ٨ — وما هو الثامن.
--
-- الفجوةُ التي وجدتُها
--
-- The platform already does the two hard halves of this and never joined them.
--
--   • `export_offer_requirements` freezes, at submission, exactly which
--     document types this corridor demanded on that day.
--   • `export_offer_evidence` collects the files.
--
-- And `evidence.kind` is free text with no reference to
-- `export_document_types`. So the database knows an offer needs eight documents
-- and holds six files, and **cannot say whether any of the six is one of the
-- eight**. «٧ من ٨» was not a number anyone could compute.
--
-- That is why this comes before a verification score rather than after it. A
-- percentage over data that cannot be joined is a percentage of nothing.
--
-- لماذا تعمل على المسوّدة أيضاً — وهذا هو نصفُ قيمتها
--
-- Requirements freeze on submit, so a draft has no frozen rows. A readiness
-- function that needed them would answer only for offers already sent — which
-- is precisely when the answer stops being useful.
--
-- The farmer needs the checklist **before** submitting: what is still missing,
-- so it can be fetched. So the function reads the frozen copy when it exists
-- and the corridor's live rules when it does not, and says which it used.
--
-- ولماذا رقمان لا رقم
--
-- A single percentage hides the question a buyer actually asks. Ninety percent
-- with the certificate of origin missing is not ninety percent shippable; it is
-- not shippable.
--
-- So: `ready` is true only when every **required** document is present, and the
-- score is the weighted proportion — useful for showing progress, never for
-- deciding. And beside both, the list of what is missing, because a number that
-- does not tell you the next step is a number you cannot act on.
--
-- والأوزانُ بيانات
--
-- The project's first rule is that no business rule is compiled into the
-- application. What a `conditional` document is worth against a `required` one
-- is a judgement that will change — so it lives in a row an administrator edits,
-- not in a constant anyone would have to redeploy to move.

-- ===========================================================================
-- ١) الرابطُ الناقص
-- ===========================================================================

-- اختياريّ: ليس كلُّ دليلٍ مستنداً. صورةُ الحقل دليلٌ ولا نوعَ مستندٍ لها، وفرضُ
-- النوع كان سيمنع رفعَها — أو يدفع الناسَ إلى وسمها كذباً بنوعٍ لا يخصّها،
-- وهو أسوأ.
alter table export_offer_evidence
  add column if not exists document_type_id uuid references export_document_types(id);

create index if not exists export_offer_evidence_doc_type_idx
  on export_offer_evidence (offer_id, document_type_id)
  where document_type_id is not null;

-- ===========================================================================
-- ٢) الأوزان — صفٌّ لكلّ نمط
-- ===========================================================================

create table if not exists export_readiness_weights (
  mode    text primary key
    check (mode in ('required', 'conditional', 'recommended')),
  weight  integer not null check (weight between 0 and 100),
  note_ar text
);

insert into export_readiness_weights (mode, weight, note_ar) values
  ('required',    100, 'لا تُشحن البضاعةُ بدونه — وغيابُه وحده يجعل العرضَ غيرَ جاهز'),
  ('conditional',  50, 'يلزم في حالاتٍ بعينها: وجهةٍ، أو سلعةٍ، أو كمّيةٍ فوق حدّ'),
  ('recommended',  20, 'يقوّي الملفَّ ولا يُبطله')
on conflict (mode) do nothing;

alter table export_readiness_weights enable row level security;

-- تُقرأ للعموم: المشتري الذي يرى «٧٦٪» من حقّه أن يعرف كيف حُسبت.
drop policy if exists export_readiness_weights_read on export_readiness_weights;
create policy export_readiness_weights_read on export_readiness_weights
  for select using (true);

drop policy if exists export_readiness_weights_admin on export_readiness_weights;
create policy export_readiness_weights_admin on export_readiness_weights
  for all using (is_admin()) with check (is_admin());

-- ===========================================================================
-- ٣) التفصيل — سطرٌ لكلّ مستندٍ مطلوب
-- ===========================================================================

-- `security definer` لأنّها تقرأ `export_offer_evidence`، وسياسةُ قراءته تقصره
-- على صاحب العرض والإدارة. والمشتري يحتاج أن يعرف **أيُّ المستندات موجود** دون
-- أن يرى الملفّاتِ نفسَها — وهذا هو الفرقُ الذي تبيعه المنصّة: يُعرف أنّ الدليل
-- موجودٌ ومراجَع، ولا يُسلَّم قبل الاتّفاق.
--
-- ولذلك تُرجع الحالةَ لا المسارات: لا `storage_path` في مخرجاتها.
create or replace function public.export_offer_readiness_detail(p_offer_id uuid)
 returns table (
   document_type_id uuid,
   code             text,
   name_ar          text,
   -- ما هو ولماذا يُطلب. يخرج معه لا في استعلامٍ ثانٍ: الشاشةُ التي تعرض اسمَ
   -- مستندٍ بلا شرحٍ تترك المزارعَ يبحث عن معنى «شهادة المنشأ» في مكانٍ آخر.
   note_ar          text,
   mode             text,
   weight           integer,
   satisfied        boolean,
   source           text
 )
 language sql
 stable
 security definer
 set search_path to 'public'
as $function$
  with offer as (
    select o.id, o.corridor_id, o.status
      from export_offers o
     where o.id = p_offer_id
       -- الحاجزُ نفسُه الذي على الجدول: صاحبُه، أو منشور، أو إدارة. ولولاه
       -- لكشفت الدالّةُ وجودَ عروضِ الناس لمن يخمّن معرّفاتٍ.
       and (o.owner_id = auth.uid() or o.status = 'published' or is_admin())
  ),
  -- المجمَّدةُ إن وُجدت، وإلّا فقواعدُ الممرّ الحيّة — فالمسوّدةُ تحتاج القائمةَ
  -- قبل الإرسال لا بعده.
  rules as (
    select r.document_type_id, r.mode, 'frozen'::text as source
      from export_offer_requirements r
     where r.offer_id = (select id from offer)
    union all
    select cr.document_type_id, cr.mode, 'live'::text
      from export_corridor_requirements cr
     where cr.corridor_id = (select corridor_id from offer)
       and cr.effective_from <= current_date
       and not exists (select 1 from export_offer_requirements fr
                        where fr.offer_id = (select id from offer))
  )
  select d.id, d.code, d.name_ar, d.note_ar, rules.mode,
         coalesce(w.weight, 0),
         exists (select 1 from export_offer_evidence e
                  where e.offer_id = (select id from offer)
                    and e.document_type_id = rules.document_type_id),
         rules.source
    from rules
    join export_document_types d on d.id = rules.document_type_id
    left join export_readiness_weights w on w.mode = rules.mode
   order by coalesce(w.weight, 0) desc, d.name_ar;
$function$;

-- ===========================================================================
-- ٤) الخلاصة — جاهزٌ أم لا، وكم، وما الناقص
-- ===========================================================================

create or replace function public.export_offer_readiness(p_offer_id uuid)
 returns table (
   ready          boolean,
   score          integer,
   required_total integer,
   required_met   integer,
   missing        text[],
   source         text
 )
 language sql
 stable
 security definer
 set search_path to 'public'
as $function$
  with d as (select * from export_offer_readiness_detail(p_offer_id))
  select
    -- الجاهزيّةُ ليست نسبةً: مستندٌ إلزاميٌّ واحدٌ ناقصٌ يعني «لا».
    coalesce(bool_and(satisfied) filter (where mode = 'required'), true),

    -- والنسبةُ للتقدّم لا للقرار.
    --
    -- والـ `coalesce` على البسط ليست تزيّناً: `filter` بلا صفٍّ مطابقٍ يُرجع
    -- NULL لا صفراً، فعرضٌ لم يُرفع له مستندٌ واحدٌ كان يُرجع «لا شيء» بدل
    -- «صفر بالمئة» — وشاشةٌ تعرض NULL تعرض فراغاً. اكتشفته البوّابةُ في أوّل
    -- تشغيل، وهو أوّلُ ما يراه كلُّ مستخدمٍ جديد.
    --
    -- والمقامُ صفرٌ حين لا متطلّباتِ أصلاً: عرضٌ بلا قواعدَ جاهزٌ بالكامل لا
    -- صفرٌ بالمئة.
    case when coalesce(sum(weight), 0) = 0 then 100
         else round(100.0 * coalesce(sum(weight) filter (where satisfied), 0)
                    / sum(weight))::int
    end,

    count(*) filter (where mode = 'required')::int,
    count(*) filter (where mode = 'required' and satisfied)::int,

    -- وما ينقص بالاسم. رقمٌ لا يقول الخطوةَ التالية رقمٌ لا يُعمل به.
    coalesce(array_agg(name_ar order by weight desc, name_ar)
               filter (where not satisfied), array[]::text[]),

    coalesce(max(source), 'none')
  from d;
$function$;

-- تُنادى من الشاشات بدور المستخدم، والحاجزُ داخل الدالّة لا في الباب.
grant execute on function public.export_offer_readiness_detail(uuid) to anon, authenticated, service_role;
grant execute on function public.export_offer_readiness(uuid)        to anon, authenticated, service_role;
