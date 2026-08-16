-- Let 'lead_received' through the kind check.
--
-- notifications.kind is constrained to a fixed list, and the lead notification
-- was not on it. The trigger's insert failed the CHECK on every lead; its
-- exception handler caught the failure, logged a warning and let the lead
-- commit — so the contact was never lost, but the alert never fired either.
-- That is the intended order of priorities, and it is also why the gap was
-- quiet: nothing surfaced except a line in the Postgres log.
--
-- Widening the list is the whole fix. Constraint stays, one more value in it.

alter table public.notifications
  drop constraint notifications_kind_check;

alter table public.notifications
  add constraint notifications_kind_check
  check (kind = any (array[
    'land_submitted',
    'land_verified',
    'land_rejected',
    'opportunity_submitted',
    'opportunity_approved',
    'opportunity_rejected',
    'lead_received'
  ]));
