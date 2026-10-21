-- notify_user and notify_admins exist in production but predate the migrations
-- folder, so gates that need them stage this copy. Same signatures; each writes
-- the notification row the way production does.
create or replace function public.notify_user(
  p_recipient uuid, p_kind text, p_title text, p_body text, p_link text)
returns void
language sql
security definer
set search_path = public
as $$
  insert into notifications (recipient_id, kind, title, body, link)
  values (p_recipient, p_kind, p_title, p_body, p_link);
$$;

create or replace function public.notify_admins(
  p_kind text, p_title text, p_body text, p_link text)
returns void
language sql
security definer
set search_path = public
as $$
  insert into notifications (recipient_id, kind, title, body, link)
  select p.id, p_kind, p_title, p_body, p_link from profiles p where p.role = 'admin';
$$;
