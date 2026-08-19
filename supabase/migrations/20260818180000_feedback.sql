-- ملاحظات الزوّار واقتراحاتهم، وردّ الإدارة عليها.
--
-- The platform has two ways to hear from a visitor and neither is this one.
-- `leads` collects a name and a phone number from someone who wants to be
-- contacted about investing. The assistant answers questions and logs the ones
-- it could not answer. Nowhere can someone say "this screen confused me" or
-- "add millet to the calculator" and get a reply.
--
-- WHO MAY WRITE, AND THE PART THAT MATTERS
--
-- Anyone, signed in or not. The point is the visitor who has not registered —
-- they are the one seeing the platform with fresh eyes, and asking them to
-- create an account first is asking them not to bother.
--
-- That makes the INSERT policy the security boundary for the whole table. It is
-- not enough to allow the insert: the check must also pin down every column the
-- author does not own. Without that, an anonymous POST could arrive carrying
-- `published: true` and an `admin_reply` of its choosing, and the public board
-- would be publishing text signed, in effect, by the administrator. So the
-- policy fixes status to 'new', forbids a reply, forbids publication, and
-- allows author_id only when it is the caller's own id.
--
-- WHO MAY READ
--
-- Your own submissions, anything the admin has published, and — for admins —
-- everything. Publication is a deliberate act rather than the default, because
-- a board that publishes whatever arrives is a spam surface, and because a
-- visitor writing "your prices are wrong" has not asked to be broadcast.

create table if not exists public.feedback (
  id          uuid primary key default gen_random_uuid(),

  -- Null for an anonymous visitor. ON DELETE SET NULL rather than CASCADE: a
  -- suggestion that shaped the product should survive the account that made it.
  author_id   uuid references auth.users(id) on delete set null,

  -- Optional, and free text. Someone who wants a reply leaves a way to reach
  -- them; someone who just wants to say the thing does not have to.
  display_name text,
  contact      text,

  -- Which screen they were on. The single most useful field on the table and
  -- the one nobody would think to type, so the form fills it in.
  page_path   text,

  kind        text not null default 'suggestion'
    check (kind in ('suggestion', 'problem', 'question')),

  body        text not null
    check (length(btrim(body)) between 3 and 2000),

  status      text not null default 'new'
    check (status in ('new', 'planned', 'done', 'declined')),

  admin_reply text,
  replied_at  timestamptz,
  replied_by  uuid references auth.users(id),

  published   boolean not null default false,

  created_at  timestamptz not null default now()
);

create index if not exists feedback_recent_idx
  on public.feedback (created_at desc);

create index if not exists feedback_published_idx
  on public.feedback (published, created_at desc) where published;

create index if not exists feedback_author_idx
  on public.feedback (author_id, created_at desc);

alter table public.feedback enable row level security;

-- The boundary described above. Every column the author does not own is pinned.
drop policy if exists feedback_insert_anyone on public.feedback;
create policy feedback_insert_anyone on public.feedback
  for insert
  with check (
    (author_id is null or author_id = auth.uid())
    and status = 'new'
    and admin_reply is null
    and replied_at is null
    and replied_by is null
    and published = false
  );

drop policy if exists feedback_select_own_or_published on public.feedback;
create policy feedback_select_own_or_published on public.feedback
  for select
  using (
    published
    or (author_id is not null and author_id = auth.uid())
    or is_admin()
  );

drop policy if exists feedback_admin_write on public.feedback;
create policy feedback_admin_write on public.feedback
  for update using (is_admin()) with check (is_admin());

drop policy if exists feedback_admin_delete on public.feedback;
create policy feedback_admin_delete on public.feedback
  for delete using (is_admin());

/*
 * Who replied, stamped rather than supplied.
 *
 * The same reasoning as the provider verification guard: an admin sending the
 * reply should not also be telling the database whose reply it is. The trigger
 * writes replied_by and replied_at from the session and the clock, so the
 * audit trail cannot be authored by the thing being audited — and clearing a
 * reply clears the stamp with it, rather than leaving a signature on nothing.
 */
create or replace function public.stamp_feedback_reply()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.admin_reply is distinct from old.admin_reply then
    if nullif(btrim(coalesce(new.admin_reply, '')), '') is null then
      new.admin_reply := null;
      new.replied_at  := null;
      new.replied_by  := null;
    else
      new.replied_at := now();
      new.replied_by := auth.uid();
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists stamp_feedback_reply on public.feedback;
create trigger stamp_feedback_reply
  before update on public.feedback
  for each row execute function public.stamp_feedback_reply();

/*
 * Tell the admins something arrived, and tell the author when it is answered.
 *
 * SECURITY DEFINER for the same reason the lead notification is: the insert
 * runs as the visitor's own role, and a public role that can mint notifications
 * is a spam channel. Both handlers swallow their own failure into a warning —
 * the feedback and the reply each outrank the announcement of themselves.
 */
create or replace function public.notify_admins_of_feedback()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into notifications (recipient_id, kind, title, body, link)
  select p.id,
         'feedback_received',
         case new.kind
           when 'problem'  then 'مشكلة من زائر'
           when 'question' then 'سؤال من زائر'
           else 'اقتراح من زائر'
         end
         || coalesce(' — ' || nullif(new.page_path, ''), ''),
         left(new.body, 300),
         '/admin/feedback'
  from profiles p
  where p.role = 'admin';

  return new;
exception
  when others then
    raise warning 'notify_admins_of_feedback failed for %: %', new.id, sqlerrm;
    return new;
end;
$$;

drop trigger if exists notify_admins_of_feedback on public.feedback;
create trigger notify_admins_of_feedback
  after insert on public.feedback
  for each row execute function public.notify_admins_of_feedback();

create or replace function public.notify_author_of_reply()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Only a reply that did not exist before, and only to someone we can reach.
  if new.author_id is not null
     and new.admin_reply is not null
     and old.admin_reply is distinct from new.admin_reply
  then
    insert into notifications (recipient_id, kind, title, body, link)
    values (new.author_id,
            'feedback_replied',
            'ردّت الإدارة على ملاحظتك',
            left(new.admin_reply, 300),
            '/feedback');
  end if;

  return new;
exception
  when others then
    raise warning 'notify_author_of_reply failed for %: %', new.id, sqlerrm;
    return new;
end;
$$;

drop trigger if exists notify_author_of_reply on public.feedback;
create trigger notify_author_of_reply
  after update on public.feedback
  for each row execute function public.notify_author_of_reply();

-- Two more values through the kind check. The constraint stays; the list grows.
alter table public.notifications
  drop constraint if exists notifications_kind_check;

alter table public.notifications
  add constraint notifications_kind_check
  check (kind = any (array[
    'land_submitted',
    'land_verified',
    'land_rejected',
    'opportunity_submitted',
    'opportunity_approved',
    'opportunity_rejected',
    'lead_received',
    'feedback_received',
    'feedback_replied'
  ]));
