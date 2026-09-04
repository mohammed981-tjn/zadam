-- طلبُ الاهتمام — الطرفُ الذي كان ناقصاً من الحلقة.
--
-- لماذا نموذجٌ لا محادثة، ولا بريدٌ يتوسّط
--
-- The owner weighed two shapes: a mediated email, or in-platform messaging.
-- Both have a defect the other does not.
--
-- A mediated email hands each side the other's address on the first message.
-- After that the second deal does not need this platform — and the platform's
-- product is the dossier, which it can only charge for on deals that pass
-- through it. The introduction is the moment of value; giving it away in the
-- first reply gives away the business.
--
-- In-platform messaging keeps that, and buys it at a price this market will not
-- pay: an importer in Rotterdam will not open an account to ask one question,
-- and a Sudanese exporter who lives on WhatsApp will not check an inbox here.
-- Messages rot in a mailbox nobody opens, which is worse than no channel at
-- all because it looks like one.
--
-- So: a short form on a published offer. No account. It becomes a row here, an
-- administrator sees it, and the administrator decides when to introduce the
-- two sides. That keeps buyer friction at the level of an email, keeps the
-- record in this database where it can be counted and queried, and keeps the
-- introduction — the thing of value — inside the platform.
--
-- وهو بذرةُ الرسائل الداخلية إن لزمت لاحقاً: الجدولُ نفسُه، تُضاف إليه ردود
-- حين يُعرف أنّ أحداً سيقرؤها. البناءُ الآن على ما لا يُعرف أنه سيُستعمل هو ما
-- يصنع صناديقَ بريدٍ فارغة.
--
-- ولماذا لا يراه المزارع
--
-- Not out of secrecy — because the introduction is a decision, and a farmer who
-- sees the buyer's address before that decision has already had it made for
-- them. When the platform stops being the introducer it stops being able to
-- charge for the dossier, and the farmer loses the thing that raised their
-- price in the first place. An administrator connects the two sides; that is
-- the product, not a gate for its own sake.

create table if not exists export_offer_interests (
  id            uuid primary key default gen_random_uuid(),
  offer_id      uuid not null references export_offers(id) on delete cascade,

  buyer_name    text not null,
  buyer_company text,
  buyer_email   text,
  buyer_phone   text,
  buyer_country text,

  -- ما يريده، لا ما يعرضه العرض. قد يريد نصفَ الكمّية أو أضعافَها، وذلك
  -- بذاته معلومةُ سوقٍ تستحقّ الحفظ.
  quantity_wanted numeric(16,4),
  message       text,

  status        text not null default 'new',
  handled_at    timestamptz,
  handled_by    uuid references profiles(id),
  handled_note  text,

  created_at    timestamptz not null default now(),

  constraint export_interest_status_known
    check (status in ('new','contacted','closed')),
  constraint export_interest_name_present
    check (length(btrim(buyer_name)) >= 2),
  -- بلا وسيلةِ اتّصالٍ لا يوجد طلبُ اهتمام، بل نصٌّ لا يُردّ عليه.
  constraint export_interest_contactable
    check (
      coalesce(btrim(buyer_email), '') <> ''
      or coalesce(btrim(buyer_phone), '') <> ''
    ),
  constraint export_interest_quantity_positive
    check (quantity_wanted is null or quantity_wanted > 0)
);

-- الطابورُ بالأحدث أوّلاً هنا، عكسَ طابور المراجعة.
-- مشترٍ ينتظر ثلاثة أيام يكون قد اشترى من غيرك، ومراجعةٌ تنتظر ثلاثة أيام
-- تبقى مراجعة. اختلافُ الترتيب مقصود.
create index if not exists export_offer_interests_new_idx
  on export_offer_interests (created_at desc) where status = 'new';
create index if not exists export_offer_interests_offer_idx
  on export_offer_interests (offer_id);

alter table export_offer_interests enable row level security;

-- الكتابةُ للعموم — وهذا هو الغرض — لكن **على عرضٍ منشورٍ وحده**.
--
-- بلا هذا الشرط تصير الجدولُ صندوقاً يكتب فيه أيُّ أحدٍ ضدّ أيّ معرّف، بما
-- فيه مسوّداتٌ لم يرها أحد. والشرطُ في `with check` لا في الشاشة، لأنّ
-- PostgREST مفتوحةٌ بالمفتاح العام لمن يعرفها.
drop policy if exists export_offer_interests_public_insert on export_offer_interests;
create policy export_offer_interests_public_insert on export_offer_interests
  for insert
  with check (
    exists (
      select 1 from export_offers o
       where o.id = offer_id and o.status = 'published'
    )
    -- والحالةُ الابتدائية لا يختارها المُرسِل: طلبٌ يصل موسوماً «عولج» طلبٌ
    -- لا يراه أحد.
    and status = 'new'
    and handled_at is null
    and handled_by is null
  );

-- والقراءةُ للإدارة وحدها. لا للزائر — يحمل الصفُّ بريدَ مشترٍ وهاتفَه.
-- ولا للمزارع بعد، للسبب المكتوب في رأس هذا الملفّ.
drop policy if exists export_offer_interests_admin_read on export_offer_interests;
create policy export_offer_interests_admin_read on export_offer_interests
  for select using (is_admin());

drop policy if exists export_offer_interests_admin_write on export_offer_interests;
create policy export_offer_interests_admin_write on export_offer_interests
  for update using (is_admin()) with check (is_admin());

-- ولا سياسةَ حذف: طلبٌ وصل ثم اختفى يجعل «كم مشترياً سأل عن الصمغ؟» سؤالاً
-- بلا جواب، وهو أرخصُ بحثِ سوقٍ تملكه المنصّة.

-- ===========================================================================
-- ختمُ المعالجة يُكتب في القاعدة لا في الشاشة
-- ===========================================================================

create or replace function public.export_interest_stamp()
 returns trigger
 language plpgsql
 set search_path to 'public'
as $function$
begin
  if new.status <> old.status and new.status <> 'new' then
    new.handled_at := coalesce(new.handled_at, now());
    new.handled_by := coalesce(new.handled_by, auth.uid());
  end if;
  return new;
end $function$;

drop trigger if exists export_interest_stamp_trg on export_offer_interests;
create trigger export_interest_stamp_trg
  before update on export_offer_interests
  for each row execute function public.export_interest_stamp();
