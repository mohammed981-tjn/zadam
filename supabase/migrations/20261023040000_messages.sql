-- صندوق الرسائل، المرحلة الأولى (البند ١٣٧).
--
-- The owner, 22 October: «لماذا لا تبني صندوق بريد … الشريك والمستثمر وصاحب
-- الأرض والمنصّة، نظام مراسلات». The research (docs/studies/messaging-ar.md,
-- with Exa on 23 October) found that platforms like this one keep each
-- conversation tied to the deal it is about, not a free chat; that it opens
-- only once both sides have taken a step; and that contact details stay hidden
-- until the right moment. He chose on 23 October that the administration reads
-- every conversation; each thread says so at its top.
--
-- Two kinds of conversation in this phase:
--
-- - partnership: one per partnership request (investor_interests row). It is
--   the same thread before acceptance and through the agreement, so the history
--   of a deal is in one place. Its parties are the investor, the land's owner,
--   and — once an agreement names one — the managing partner company's owner.
--   Before the owner accepts, a phone number or a "WhatsApp me" is refused, as
--   in the land's public note (lands_investor_note_no_phone): the number is
--   revealed by acceptance, not by the chat. A declined or withdrawn request
--   closes the thread to new messages; nothing in it is removed.
-- - support: «راسل سوداقري», one per member, between that member and the
--   administration.
--
-- Administrators read every thread and may write in any, as «سوداقري».
--
-- The tables are reached only through the functions below (security definer,
-- each checking auth.uid()); row-level security is on with no policy, and no
-- table privilege is left to anon or authenticated. Nothing is deleted: there
-- is no function that removes a message, and the tables grant no delete.
--
-- The notifications CHECK is replaced under the same name to add 'message', as
-- every migration that added a kind has done since 20260816200100.
--
-- The owner, later on 23 October: «نظام الرسائل أريده متكاملاً، ويقدر يتابعه
-- المدير، ويكون جيّداً بين الأطراف» (backlog 144). So, before this was ever
-- applied, it grew what a complete inbox needs:
--
-- - a photo or a document in a message, from the sender's own folder in the
--   evidence bucket (the same upload as land documents and inspections), which
--   the others in the thread may open and nobody may delete (two storage
--   policies, as for inspection photos);
-- - «قُرئت»: when the other side last opened the thread;
-- - for the administration: the support threads waiting for its reply and the
--   reported threads in the review list (a read-only policy for admins on
--   conversations), the parties' names inside every thread, and closing a
--   report once it has been looked at, which tells the reporter;
-- - the unread count beside the bell;
-- - and a third kind, market: «وأيضاً المصدّرون يراسلون المنصّة والمزارع»
--   (the owner, 22 October). An exporter or trader writes to whoever posted a
--   crop for sale — or a wish to buy — on the market board (market_offers),
--   one thread per offer and asker, and the administration follows it as it
--   follows the rest. The offer's phone number is public already, so a number
--   in the thread is not refused here; the thread keeps the record. It opens
--   only on an offer that is open, and takes new messages for thirty days
--   after the offer ends, long enough to finish a deal begun on it.

-- ═══════════════════════════════════════════════════════════════════════════
-- ١) الجداول
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.conversations (
  id              uuid primary key default gen_random_uuid(),
  kind            text not null check (kind in ('partnership','support','market')),
  interest_id     uuid unique references public.investor_interests(id) on delete restrict,
  -- support: the member writing to the administration; market: whoever asked
  -- about the offer.
  member_id       uuid references auth.users(id) on delete cascade,
  market_offer_id uuid references public.market_offers(id) on delete restrict,
  created_at      timestamptz not null default now(),
  last_message_at timestamptz,
  reported_at     timestamptz,
  -- A support thread whose last word is the member's: waiting for the administration.
  needs_reply     boolean not null default false,
  constraint conversations_subject_check check (
    (kind = 'partnership' and interest_id is not null and member_id is null and market_offer_id is null)
    or (kind = 'support' and member_id is not null and interest_id is null and market_offer_id is null)
    or (kind = 'market' and market_offer_id is not null and member_id is not null and interest_id is null))
);

create unique index if not exists conversations_one_support
  on public.conversations (member_id) where kind = 'support';
create unique index if not exists conversations_one_market
  on public.conversations (market_offer_id, member_id) where kind = 'market';
create index if not exists conversations_last_idx
  on public.conversations (last_message_at desc nulls last);

create table if not exists public.conversation_messages (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete restrict,
  sender_id       uuid references auth.users(id) on delete set null,
  sender_role     text not null check (sender_role in ('owner','investor','manager','member','buyer','seller','platform')),
  body            text not null default '' check (length(body) <= 2000),
  -- In the sender's own folder of the evidence bucket: <sender id>/messages/<file>.
  attachment_path text check (attachment_path is null
                              or (attachment_path ~ '^[0-9a-f-]{36}/messages/[^/]+$' and attachment_path !~ '\.\.')),
  attachment_kind text check (attachment_kind in ('photo','document')),
  created_at      timestamptz not null default now(),
  constraint conversation_messages_something check (length(btrim(body)) > 0 or attachment_path is not null),
  constraint conversation_messages_kind_with_file check ((attachment_path is null) = (attachment_kind is null))
);

create index if not exists conversation_messages_thread_idx
  on public.conversation_messages (conversation_id, created_at);

create table if not exists public.conversation_reads (
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_id         uuid not null references auth.users(id) on delete cascade,
  last_read_at    timestamptz not null default now(),
  primary key (conversation_id, user_id)
);

create table if not exists public.conversation_reports (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete restrict,
  reporter_id     uuid references auth.users(id) on delete set null,
  reason          text not null check (length(btrim(reason)) between 5 and 500),
  created_at      timestamptz not null default now()
);

alter table public.conversations enable row level security;
alter table public.conversation_messages enable row level security;
alter table public.conversation_reads enable row level security;
alter table public.conversation_reports enable row level security;

revoke all on public.conversations, public.conversation_messages,
              public.conversation_reads, public.conversation_reports
  from public, anon, authenticated;

-- The review list (src/lib/adminQueue.ts) counts what waits for the
-- administration by reading tables: these columns of conversations, for
-- administrators only. No message text is reachable this way.
grant select (id, kind, last_message_at, reported_at, needs_reply) on public.conversations to authenticated;
create policy conversations_admin_read on public.conversations
  for select to authenticated using (is_admin());

-- ── الإشعارات: نوعٌ جديد ────────────────────────────────────────────────────

alter table public.notifications drop constraint notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check
  check (kind = any (array[
    'land_submitted','land_verified','land_rejected',
    'opportunity_submitted','opportunity_approved','opportunity_rejected',
    'lead_received','feedback_received','feedback_replied',
    'nafir_joined','faza_pledged','shura_answered',
    'judiyya_update','canal_update',
    'locust_near','animal_disease',
    'stage_due',
    'investor_interest','investor_decision',
    'agreement_update','agreement_signed',
    'inspection_update','inspection_report',
    'message'
  ]));

-- ═══════════════════════════════════════════════════════════════════════════
-- ٢) من في المحادثة
-- ═══════════════════════════════════════════════════════════════════════════

-- The caller's place in a conversation: 'investor', 'owner', 'manager' or
-- 'member' for a party, 'buyer' or 'seller' on a market offer (the one who
-- posted a sale is the seller, and whoever asks about it the buyer; the other
-- way round for a wish to buy), 'admin' for an administrator who is not a
-- party, null for anyone else. A party who is also an administrator answers as
-- the party.
create or replace function public.conversation_role(p_conv uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case
           when c.kind = 'support' and c.member_id = auth.uid() then 'member'
           when c.kind = 'partnership' and i.investor_id = auth.uid() then 'investor'
           when c.kind = 'partnership' and l.owner_id = auth.uid() then 'owner'
           when c.kind = 'partnership' and pc.owner_id = auth.uid() then 'manager'
           when c.kind = 'market' and c.member_id = auth.uid() then case mo.kind when 'sell' then 'buyer' else 'seller' end
           when c.kind = 'market' and mo.created_by = auth.uid() then case mo.kind when 'sell' then 'seller' else 'buyer' end
           when is_admin() then 'admin'
         end
    from conversations c
    left join market_offers mo on mo.id = c.market_offer_id
    left join investor_interests i on i.id = c.interest_id
    left join lands l on l.id = i.land_id
    left join partnership_agreements a on a.interest_id = i.id
    left join partner_companies pc on pc.id = a.manager_company_id
   where c.id = p_conv
     and auth.uid() is not null;
$$;

-- Everyone in a conversation other than the caller, for the notification.
create or replace function public.conversation_others(p_conv uuid)
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select distinct x from (
    select c.member_id as x from conversations c where c.id = p_conv and c.kind in ('support','market')
    union all
    select mo.created_by from conversations c join market_offers mo on mo.id = c.market_offer_id where c.id = p_conv
    union all
    select i.investor_id from conversations c join investor_interests i on i.id = c.interest_id where c.id = p_conv
    union all
    select l.owner_id from conversations c join investor_interests i on i.id = c.interest_id
      join lands l on l.id = i.land_id where c.id = p_conv
    union all
    select pc.owner_id from conversations c join partnership_agreements a on a.interest_id = c.interest_id
      join partner_companies pc on pc.id = a.manager_company_id where c.id = p_conv
  ) s
  where x is not null and x is distinct from auth.uid();
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- ٣) فتح المحادثة
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.conversation_for_interest(p_interest uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_ok boolean;
begin
  if auth.uid() is null then raise exception 'سجّل الدخول أولاً.'; end if;

  select (i.investor_id = auth.uid() or l.owner_id = auth.uid()
          or exists (select 1 from partnership_agreements a join partner_companies pc on pc.id = a.manager_company_id
                      where a.interest_id = i.id and pc.owner_id = auth.uid())
          or is_admin())
    into v_ok
    from investor_interests i join lands l on l.id = i.land_id
   where i.id = p_interest;
  if not coalesce(v_ok, false) then raise exception 'لستَ طرفاً في هذا الطلب.'; end if;

  select id into v_id from conversations where interest_id = p_interest;
  if v_id is null then
    insert into conversations (kind, interest_id) values ('partnership', p_interest)
    on conflict (interest_id) do nothing
    returning id into v_id;
    if v_id is null then select id into v_id from conversations where interest_id = p_interest; end if;
  end if;
  return v_id;
end;
$$;

create or replace function public.conversation_for_support()
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if auth.uid() is null then raise exception 'سجّل الدخول أولاً.'; end if;
  select id into v_id from conversations where kind = 'support' and member_id = auth.uid();
  if v_id is null then
    insert into conversations (kind, member_id) values ('support', auth.uid())
    on conflict do nothing
    returning id into v_id;
    if v_id is null then
      select id into v_id from conversations where kind = 'support' and member_id = auth.uid();
    end if;
  end if;
  return v_id;
end;
$$;

-- Whether a market thread still takes messages: while its offer is open, and
-- for thirty days after it closes or expires.
create or replace function public.market_conversation_open(p_offer uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((
    select case when o.status = 'closed' then least(coalesce(o.closed_at, o.expires_at), o.expires_at)
                else o.expires_at end > now() - interval '30 days'
      from market_offers o where o.id = p_offer), false);
$$;

-- «راسل صاحب العرض»: from the market board, one thread per offer and asker.
-- The offer must be open; the one who posted it does not open a thread with
-- himself; and twenty new threads a day is a busy trader — more is a flood.
create or replace function public.conversation_for_market(p_offer uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_offer market_offers;
begin
  if auth.uid() is null then raise exception 'سجّل الدخول أولاً.'; end if;
  select id into v_id from conversations
   where kind = 'market' and market_offer_id = p_offer and member_id = auth.uid();
  if v_id is not null then return v_id; end if;

  select * into v_offer from market_offers where id = p_offer;
  if v_offer.id is null or v_offer.status <> 'open' or v_offer.expires_at <= now() then
    raise exception 'هذا العرض لم يعد مفتوحاً.';
  end if;
  if v_offer.created_by = auth.uid() then
    raise exception 'هذا عرضك؛ تصلك فيه رسائل من يسألون عنه.';
  end if;
  if (select count(*) from conversations
       where kind = 'market' and member_id = auth.uid() and created_at > now() - interval '1 day') >= 20 then
    raise exception 'فتحتَ عشرين محادثةً في السوق اليوم. عُد غداً.';
  end if;

  insert into conversations (kind, market_offer_id, member_id) values ('market', p_offer, auth.uid())
  on conflict do nothing
  returning id into v_id;
  if v_id is null then
    select id into v_id from conversations
     where kind = 'market' and market_offer_id = p_offer and member_id = auth.uid();
  end if;
  return v_id;
end;
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- ٤) الإرسال
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.conversation_send(
  p_conv uuid, p_body text, p_attachment_path text default null, p_attachment_kind text default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
  v_conv conversations;
  v_status text;
  v_body text := btrim(coalesce(p_body, ''));
  v_plain text;
  v_id uuid;
  v_party uuid;
  v_link text;
begin
  if auth.uid() is null then raise exception 'سجّل الدخول أولاً.'; end if;
  v_role := conversation_role(p_conv);
  if v_role is null then raise exception 'لستَ طرفاً في هذه المحادثة.'; end if;
  if length(v_body) = 0 and p_attachment_path is null then raise exception 'اكتب رسالتك.'; end if;
  if length(v_body) > 2000 then raise exception 'الرسالة أطول من ٢٠٠٠ حرف.'; end if;
  -- A file is the sender's own: the upload went to their folder, and nobody
  -- attaches another person's file by naming its path.
  if p_attachment_path is not null then
    if p_attachment_path not like auth.uid()::text || '/messages/%' or p_attachment_path like '%..%'
       or coalesce(p_attachment_kind, '') not in ('photo','document') then
      raise exception 'الملفّ المرفق غير صالح. ارفعه من جديد.';
    end if;
  end if;

  select * into v_conv from conversations where id = p_conv for update;

  if v_conv.kind = 'market' and not market_conversation_open(v_conv.market_offer_id) then
    raise exception 'انتهى هذا العرض منذ أكثر من ثلاثين يوماً، فلا رسائل جديدة فيه. ما كُتب يبقى محفوظاً.';
  end if;

  if v_conv.kind = 'partnership' then
    select status into v_status from investor_interests where id = v_conv.interest_id;
    if v_status in ('declined','withdrawn')
       and not exists (select 1 from partnership_agreements where interest_id = v_conv.interest_id) then
      raise exception 'أُغلق هذا الطلب، فلا رسائل جديدة فيه. ما كُتب يبقى محفوظاً.';
    end if;
    -- Before acceptance the number is not the chat's to reveal.
    if v_status = 'pending' and v_role <> 'admin' then
      v_plain := translate(v_body, '٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹', '01234567890123456789');
      if v_plain ~ '[0-9]([[:space:]().+-]*[0-9]){8,}'
         or v_plain ~* '(واتس|وتساب|واتساب|whats ?app|تلغرام|تليجرام|تيليجرام|telegram|@)' then
        raise exception 'لا يُكتب رقم هاتفٍ ولا وسيلة تواصلٍ أخرى قبل أن يقبل صاحب الأرض الطلب. بعد القبول يظهر الهاتف لكلٍّ منكما.';
      end if;
    end if;
  end if;

  insert into conversation_messages (conversation_id, sender_id, sender_role, body, attachment_path, attachment_kind)
  values (p_conv, auth.uid(), case v_role when 'admin' then 'platform' else v_role end, v_body,
          p_attachment_path, case when p_attachment_path is not null then p_attachment_kind end)
  returning id into v_id;

  update conversations
     set last_message_at = now(),
         needs_reply = case when kind = 'support' then v_role = 'member' else false end
   where id = p_conv;
  insert into conversation_reads (conversation_id, user_id, last_read_at) values (p_conv, auth.uid(), now())
  on conflict (conversation_id, user_id) do update set last_read_at = excluded.last_read_at;

  -- One unread notice per conversation is enough: a second message while the
  -- first notice is still unread does not ring the bell again.
  v_link := '/messages/' || p_conv;
  for v_party in select * from conversation_others(p_conv) loop
    if not exists (select 1 from notifications n
                    where n.recipient_id = v_party and n.kind = 'message'
                      and n.link = v_link and n.read_at is null) then
      perform notify_user(v_party, 'message',
        case v_conv.kind when 'support' then 'ردّت عليك إدارة سوداقري'
                         when 'market' then 'رسالةٌ عن عرض «' || (select crop from market_offers where id = v_conv.market_offer_id) || '» في السوق'
                         else 'رسالةٌ جديدة في طلب الشراكة' end,
        coalesce(nullif(left(v_body, 140), ''), case p_attachment_kind when 'photo' then 'صورة' else 'مستند' end), v_link);
    end if;
  end loop;

  if v_conv.kind = 'support' and v_role = 'member' then
    perform notify_admins('message', 'رسالةٌ إلى سوداقري',
      coalesce(nullif(left(v_body, 140), ''), case p_attachment_kind when 'photo' then 'صورة' else 'مستند' end), v_link);
  end if;

  return v_id;
end;
$$;

create or replace function public.conversation_mark_read(p_conv uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if conversation_role(p_conv) is null then raise exception 'لستَ طرفاً في هذه المحادثة.'; end if;
  insert into conversation_reads (conversation_id, user_id, last_read_at) values (p_conv, auth.uid(), now())
  on conflict (conversation_id, user_id) do update set last_read_at = excluded.last_read_at;
  update notifications set read_at = now()
   where recipient_id = auth.uid() and kind = 'message'
     and link = '/messages/' || p_conv and read_at is null;
end;
$$;

create or replace function public.conversation_report(p_conv uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text := conversation_role(p_conv);
begin
  if v_role is null or v_role = 'admin' then raise exception 'لستَ طرفاً في هذه المحادثة.'; end if;
  if length(btrim(coalesce(p_reason, ''))) not between 5 and 500 then
    raise exception 'اكتب سبب البلاغ في سطرٍ أو أكثر.';
  end if;
  insert into conversation_reports (conversation_id, reporter_id, reason) values (p_conv, auth.uid(), btrim(p_reason));
  update conversations set reported_at = now() where id = p_conv;
  perform notify_admins('message', 'بلاغٌ عن محادثة', left(btrim(p_reason), 140), '/messages/' || p_conv);
end;
$$;

-- The administration has looked at a reported thread: it leaves the review
-- list, the reports stay on record, and whoever reported is told.
create or replace function public.conversation_resolve_report(p_conv uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reporter uuid;
begin
  if not is_admin() then raise exception 'إغلاق البلاغ للإدارة وحدها.'; end if;
  update conversations set reported_at = null where id = p_conv and reported_at is not null;
  if not found then raise exception 'لا بلاغ مفتوح على هذه المحادثة.'; end if;
  for v_reporter in select distinct reporter_id from conversation_reports
                     where conversation_id = p_conv and reporter_id is not null loop
    perform notify_user(v_reporter, 'message', 'راجعت الإدارة بلاغك',
      'اطّلعت إدارة سوداقري على المحادثة التي أبلغتَ عنها.', '/messages/' || p_conv);
  end loop;
end;
$$;

-- Beside the bell: messages from others in the threads one is a party to.
-- An administrator's own queue is the review list, not this number.
create or replace function public.my_unread_message_count()
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(sum((
           select count(*) from conversation_messages x
            where x.conversation_id = c.id
              and x.sender_id is distinct from auth.uid()
              and x.created_at > coalesce((select rd.last_read_at from conversation_reads rd
                                            where rd.conversation_id = c.id and rd.user_id = auth.uid()),
                                          '-infinity'::timestamptz))), 0)::int
    from conversations c
   where auth.uid() is not null
     and c.last_message_at is not null
     and conversation_role(c.id) in ('investor','owner','manager','member','buyer','seller');
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- ٥) القراءة
-- ═══════════════════════════════════════════════════════════════════════════

-- The title each side sees. Before acceptance the investor does not learn the
-- land's name or the owner's (investor_open_lands hides both); the owner sees
-- the investor's name, as on /lands. On the market, the asker sees the offer,
-- and the one who posted it sees who asked.
create or replace function public.conversation_title(p_conv uuid, p_role text)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case
           when c.kind = 'support' and p_role = 'member' then 'إدارة سوداقري'
           when c.kind = 'support' then 'رسالة من ' || coalesce(nullif(pm.full_name, ''), 'عضو')
           when c.kind = 'market' and c.member_id = auth.uid() then
             (case mo.kind when 'sell' then 'عرض بيع ' else 'طلب شراء ' end) || mo.crop || ' في ' || mo.state
           when c.kind = 'market' and mo.created_by = auth.uid() then
             'سؤال ' || coalesce(nullif(pm.full_name, ''), 'تاجر') || ' عن عرضك: ' || mo.crop
           when c.kind = 'market' then
             'السوق: ' || mo.crop || ' — ' || coalesce(nullif(pm.full_name, ''), 'عضو')
           when p_role = 'investor' and i.status = 'pending' then 'طلب شراكة على أرضٍ في ' || coalesce(l.state, 'السودان')
           when p_role = 'investor' then 'شراكة في «' || coalesce(l.name, 'الأرض') || '»'
           when p_role = 'owner' then 'طلب ' || coalesce(nullif(pi.full_name, ''), 'مستثمر') || ' على «' || coalesce(l.name, 'أرضك') || '»'
           else 'شراكة في «' || coalesce(l.name, 'أرض') || '»'
         end
    from conversations c
    left join profiles pm on pm.id = c.member_id
    left join market_offers mo on mo.id = c.market_offer_id
    left join investor_interests i on i.id = c.interest_id
    left join lands l on l.id = i.land_id
    left join profiles pi on pi.id = i.investor_id
   where c.id = p_conv;
$$;

create or replace function public.my_conversations()
returns table (
  id uuid, kind text, my_role text, title text, last_message_at timestamptz,
  last_body text, unread integer, open boolean, reported boolean, needs_reply boolean)
language sql
stable
security definer
set search_path = public
as $$
  with mine as (
    select c.*, conversation_role(c.id) as r
      from conversations c
     where auth.uid() is not null
  )
  select m.id, m.kind, m.r, conversation_title(m.id, m.r), m.last_message_at,
         (select coalesce(nullif(left(x.body, 120), ''),
                          case x.attachment_kind when 'photo' then '📷 صورة' else '📄 مستند' end)
            from conversation_messages x
           where x.conversation_id = m.id order by x.created_at desc limit 1),
         (select count(*)::int from conversation_messages x
           where x.conversation_id = m.id
             and x.sender_id is distinct from auth.uid()
             and x.created_at > coalesce((select rd.last_read_at from conversation_reads rd
                                           where rd.conversation_id = m.id and rd.user_id = auth.uid()),
                                         '-infinity'::timestamptz)),
         case when m.kind = 'support' then true
              when m.kind = 'market' then market_conversation_open(m.market_offer_id)
              else exists (select 1 from investor_interests i where i.id = m.interest_id and i.status in ('pending','accepted'))
                   or exists (select 1 from partnership_agreements a where a.interest_id = m.interest_id) end,
         m.reported_at is not null,
         m.needs_reply
    from mine m
   where m.r is not null
     -- An administrator's list is every thread that has a message in it.
     and (m.r <> 'admin' or m.last_message_at is not null)
   order by (m.reported_at is not null and m.r = 'admin') desc,
            (m.needs_reply and m.r = 'admin') desc,
            m.last_message_at desc nulls last
   limit 300;
$$;

create or replace function public.conversation_view(p_conv uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_role text := conversation_role(p_conv);
  v_conv conversations;
  v_interest investor_interests;
  v_agreement uuid;
  v_offer market_offers;
begin
  if v_role is null then raise exception 'لستَ طرفاً في هذه المحادثة.'; end if;
  select * into v_conv from conversations where id = p_conv;
  if v_conv.market_offer_id is not null then
    select * into v_offer from market_offers where id = v_conv.market_offer_id;
  end if;
  if v_conv.interest_id is not null then
    select * into v_interest from investor_interests where id = v_conv.interest_id;
    select id into v_agreement from partnership_agreements where interest_id = v_conv.interest_id;
  end if;
  return jsonb_build_object(
    'id', v_conv.id,
    'kind', v_conv.kind,
    'me', v_role,
    'title', conversation_title(p_conv, v_role),
    'status', v_interest.status,
    'request', case when v_interest.id is not null then jsonb_build_object(
                 'message', v_interest.message, 'model', v_interest.model, 'created_at', v_interest.created_at) end,
    'agreement_id', v_agreement,
    -- The market offer the thread is about, as the board shows it.
    'offer', case when v_offer.id is not null then jsonb_build_object(
               'id', v_offer.id, 'kind', v_offer.kind, 'crop', v_offer.crop, 'quantity', v_offer.quantity,
               'unit', v_offer.unit, 'grade', v_offer.grade, 'state', v_offer.state, 'locality', v_offer.locality,
               'price_sdg', v_offer.price_sdg, 'price_usd', v_offer.price_usd, 'notes', v_offer.notes,
               'status', case when v_offer.status = 'open' and v_offer.expires_at > now() then 'open' else 'ended' end,
               'created_at', v_offer.created_at) end,
    'open', case when v_conv.kind = 'support' then true
                 when v_conv.kind = 'market' then market_conversation_open(v_conv.market_offer_id)
                 else v_interest.status in ('pending','accepted') or v_agreement is not null end,
    'reported', v_conv.reported_at is not null,
    'needs_reply', v_conv.needs_reply,
    -- «قُرئت»: when someone on the other side last opened the thread. In a
    -- support thread the other side is the member, or any administrator.
    'others_read_at', (select max(rd.last_read_at) from conversation_reads rd
                        where rd.conversation_id = p_conv and rd.user_id <> auth.uid()
                          and (rd.user_id in (select conversation_others(p_conv))
                               or (v_conv.kind = 'support' and v_role = 'member'
                                   and exists (select 1 from profiles pa where pa.id = rd.user_id and pa.role = 'admin')))),
    -- The administration follows every thread, so it sees who is in it.
    'parties', case when v_role = 'admin' then (
                 select jsonb_agg(jsonb_build_object('role', x.role, 'name', coalesce(nullif(p.full_name, ''), '—'), 'phone', p.phone))
                   from (select 'member' as role, v_conv.member_id as uid where v_conv.kind = 'support'
                         union all select case v_offer.kind when 'sell' then 'buyer' else 'seller' end, v_conv.member_id
                                    where v_conv.kind = 'market'
                         union all select case v_offer.kind when 'sell' then 'seller' else 'buyer' end, v_offer.created_by
                                    where v_conv.kind = 'market'
                         union all select 'investor', v_interest.investor_id where v_interest.id is not null
                         union all select 'owner', (select owner_id from lands where id = v_interest.land_id) where v_interest.id is not null
                         union all select 'manager', (select pc.owner_id from partnership_agreements a
                                                       join partner_companies pc on pc.id = a.manager_company_id
                                                      where a.interest_id = v_interest.id)
                                    where v_interest.id is not null) x
                   left join profiles p on p.id = x.uid
                  where x.uid is not null) end,
    'reports', case when v_role = 'admin' then coalesce((
                 select jsonb_agg(jsonb_build_object('reason', r.reason, 'created_at', r.created_at) order by r.created_at)
                   from conversation_reports r where r.conversation_id = p_conv), '[]'::jsonb) end,
    'messages', coalesce((
       select jsonb_agg(jsonb_build_object(
                'id', x.id, 'role', x.sender_role, 'mine', x.sender_id = auth.uid(),
                'body', x.body, 'attachment_path', x.attachment_path, 'attachment_kind', x.attachment_kind,
                'created_at', x.created_at) order by x.created_at)
         from (select * from conversation_messages
                where conversation_id = p_conv
                order by created_at desc limit 300) x), '[]'::jsonb)
  );
end;
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- ٦) الملفّات في الدلو: يقرؤها من في المحادثة، ولا تُحذف بعد إرسالها
-- ═══════════════════════════════════════════════════════════════════════════

-- As land_inspections does for its photos (20261022010000): the sender's own
-- folder is theirs already (evidence_read_own); these let the others in the
-- thread, and the administration, open what was sent to them.
create or replace function public.conversation_file_readable(p_name text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from conversation_messages x
                  where x.attachment_path = p_name
                    and conversation_role(x.conversation_id) is not null);
$$;

create or replace function public.conversation_file_sent(p_name text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from conversation_messages where attachment_path = p_name);
$$;

revoke execute on function public.conversation_file_readable(text) from public, anon;
revoke execute on function public.conversation_file_sent(text) from public, anon;
grant execute on function public.conversation_file_readable(text) to authenticated;
grant execute on function public.conversation_file_sent(text) to authenticated;

-- Only where Storage exists (the local gates have no storage schema).
do $$
begin
  if to_regclass('storage.objects') is not null then
    execute $p$create policy evidence_read_message_files on storage.objects
               for select to authenticated
               using (bucket_id = 'evidence' and public.conversation_file_readable(name))$p$;
    -- Restrictive: whatever else allows a delete, a file sent in a thread stays.
    execute $p$create policy evidence_keep_message_files on storage.objects
               as restrictive for delete to authenticated
               using (not (bucket_id = 'evidence' and public.conversation_file_sent(name)))$p$;
  end if;
end $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- الصلاحيات
-- ═══════════════════════════════════════════════════════════════════════════

revoke execute on function public.conversation_role(uuid) from public, anon;
revoke execute on function public.conversation_others(uuid) from public, anon, authenticated;
revoke execute on function public.conversation_for_interest(uuid) from public, anon;
revoke execute on function public.conversation_for_support() from public, anon;
revoke execute on function public.conversation_for_market(uuid) from public, anon;
revoke execute on function public.market_conversation_open(uuid) from public, anon, authenticated;
revoke execute on function public.conversation_send(uuid, text, text, text) from public, anon;
revoke execute on function public.conversation_resolve_report(uuid) from public, anon;
revoke execute on function public.my_unread_message_count() from public, anon;
revoke execute on function public.conversation_mark_read(uuid) from public, anon;
revoke execute on function public.conversation_report(uuid, text) from public, anon;
revoke execute on function public.conversation_title(uuid, text) from public, anon, authenticated;
revoke execute on function public.my_conversations() from public, anon;
revoke execute on function public.conversation_view(uuid) from public, anon;

grant execute on function public.conversation_role(uuid) to authenticated;
grant execute on function public.conversation_for_interest(uuid) to authenticated;
grant execute on function public.conversation_for_support() to authenticated;
grant execute on function public.conversation_for_market(uuid) to authenticated;
grant execute on function public.conversation_send(uuid, text, text, text) to authenticated;
grant execute on function public.conversation_resolve_report(uuid) to authenticated;
grant execute on function public.my_unread_message_count() to authenticated;
grant execute on function public.conversation_mark_read(uuid) to authenticated;
grant execute on function public.conversation_report(uuid, text) to authenticated;
grant execute on function public.my_conversations() to authenticated;
grant execute on function public.conversation_view(uuid) to authenticated;
