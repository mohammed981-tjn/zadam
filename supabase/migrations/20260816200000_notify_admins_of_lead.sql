-- Tell someone when a lead arrives.
--
-- The notifications table has a reader and no writer: the navbar counts unread
-- rows, /notifications lists them, and its only policies are read_own and
-- update_own. There is no INSERT policy anywhere, so nothing has ever put a row
-- in it — the feature is a window onto an empty table.
--
-- Leads have the matching gap at the other end. A visitor's contact details
-- land in `leads` and wait there silently until an admin happens to open
-- /admin/leads and look. A phone number that arrives and is never seen has not
-- really arrived.
--
-- This closes both with one trigger.
--
-- Why a trigger and not application code: the insert runs as `anon` (the
-- visitor's own role, through POST /api/leads), and anon cannot write to
-- notifications — correctly, since a public role that can mint notifications
-- for admins is a spam channel. A SECURITY DEFINER trigger runs as the function
-- owner and bypasses RLS, so notifications stay unwritable by any client while
-- still being written on every lead, from any source: the route today, an
-- import or an admin-side insert tomorrow.

create or replace function public.notify_admins_of_lead()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into notifications (recipient_id, kind, title, body, link)
  select p.id,
         'lead_received',
         'عميل جديد: ' || new.full_name,
         case new.role
           when 'investor' then 'مستثمر'
           when 'farmer'   then 'مزارع'
           else 'غير محدد'
         end
         || ' — ' || new.contact
         || coalesce(chr(10) || nullif(new.interest, ''), ''),
         '/admin/leads'
  from profiles p
  where p.role = 'admin';

  return new;

exception
  when others then
    -- The lead outranks the notification, always.
    --
    -- An exception block in plpgsql runs the body in a subtransaction, so a
    -- failure here — no admin, a renamed column, a constraint added later —
    -- rolls back only the notification and leaves the lead committed. Without
    -- this handler the raise would propagate and abort the visitor's insert,
    -- and a bug in the alerting would silently start costing us the very
    -- contacts it exists to announce. It is logged, not swallowed in silence:
    -- `raise warning` reaches the Postgres logs.
    raise warning 'notify_admins_of_lead failed for lead %: %', new.id, sqlerrm;
    return new;
end;
$$;

-- The trigger is the only intended caller; nothing needs to invoke a
-- SECURITY DEFINER notification writer by hand.
revoke execute on function public.notify_admins_of_lead() from public;

drop trigger if exists leads_notify_admins on public.leads;

create trigger leads_notify_admins
after insert on public.leads
for each row
execute function public.notify_admins_of_lead();
