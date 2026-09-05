-- قاعدةٌ انتهى عملُها لا تبقى مطلوبة.
--
-- عطبٌ في `20260904230000`، وأنا كتبتُها
--
-- `export_offer_requirements` freezes on submit, and the function that freezes
-- them — written before mine — reads the corridor's rules like this:
--
--     where r.corridor_id = new.corridor_id
--       and r.effective_from <= current_date
--       and (r.effective_to is null or r.effective_to > current_date)
--
-- And `export_offer_readiness_detail`, which reads the same table for the live
-- half, dropped the second condition:
--
--     where cr.corridor_id = (select corridor_id from offer)
--       and cr.effective_from <= current_date
--
-- So the two disagree about the same rule. Retire a requirement by setting
-- `effective_to`, and it correctly disappears from every offer frozen after
-- that — while every **draft** goes on being measured against it. The farmer is
-- told to fetch a document nobody asks for any more, and the readiness can
-- never reach a hundred: the missing list holds a row that no longer exists in
-- the rules the corridor will actually apply.
--
-- ولا صفَّ اليومَ له `effective_to`
--
-- Nothing in production is wrong at this moment — no rule has an expiry set, so
-- the two queries currently return the same thing. This is a latent fault: it
-- becomes a live one the first time an administrator retires a requirement,
-- which is the ordinary way regulation changes and the exact case the column
-- was added for.
--
-- ولماذا يُقال هذا صراحةً
--
-- Requirements are the one dataset on this platform where being out of date has
-- a physical consequence: a shipment rejected at a border. Two functions that
-- disagree about which rules are in force are worse than one that is merely
-- old, because nothing looks broken from either side.

create or replace function public.export_offer_readiness_detail(p_offer_id uuid)
 returns table (
   document_type_id uuid,
   code             text,
   name_ar          text,
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
       and (o.owner_id = auth.uid() or o.status = 'published' or is_admin())
  ),
  rules as (
    select r.document_type_id, r.mode, 'frozen'::text as source
      from export_offer_requirements r
     where r.offer_id = (select id from offer)
    union all
    select cr.document_type_id, cr.mode, 'live'::text
      from export_corridor_requirements cr
     where cr.corridor_id = (select corridor_id from offer)
       and cr.effective_from <= current_date
       -- الشرطُ الذي سقط منّي، وهو حرفياً شرطُ دالّة التجميد. والنافذتان يجب
       -- أن تصفا القواعدَ نفسَها، وإلّا قِيست المسوّدةُ بغير ما سيُجمَّد لها.
       and (cr.effective_to is null or cr.effective_to > current_date)
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

-- `create or replace` أبقت الصلاحيّات كما هي — لم يتغيّر التوقيع. وتُعاد كتابتها
-- هنا مع ذلك، لأنّ الاعتمادَ على «لم تتغيّر فبقيت» هو كيف تُفتح الثقوب.
grant execute on function public.export_offer_readiness_detail(uuid) to anon, authenticated, service_role;
