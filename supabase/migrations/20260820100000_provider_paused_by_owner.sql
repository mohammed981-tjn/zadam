-- «مغلقون هذا الموسم» ليست «أوقفناكم» — مفتاحان لا مفتاح.
--
-- WHY THIS COLUMN EXISTS
--
-- guard_provider_verification is about to lock `active` to administrators, and
-- it should: providers_own is `for all using (owner_id = auth.uid() or
-- is_admin())`, so a verified provider that an admin had suspended could put
-- itself back in the catalogue with one PATCH. A lever the sanctioned party can
-- pull back is not a lever.
--
-- But `active` was carrying two meanings at once, and locking it removes the
-- legitimate one with the abusable one. A provider that is fully booked, or
-- closed between seasons, or short a driver for a fortnight has an honest
-- reason to come out of the catalogue — and after that guard lands its only
-- route is to ask an administrator and wait.
--
-- So the two meanings get two switches:
--
--   active           administrative standing. Admin only. "We suspended you."
--   paused_by_owner  the provider's own availability. "We are closed for now."
--
-- Keeping them apart is not tidiness. A catalogue entry that vanished tells the
-- platform nothing unless it says which of the two happened, and an admin
-- looking at a suspended-and-also-paused provider needs to see both states to
-- know what reinstating actually does.
--
-- THE READ POLICY
--
-- Public visibility becomes the conjunction. A paused provider stays readable
-- to its owner and to admins through providers_own, so the provider can still
-- see and edit its own listing while it is out of the catalogue — which is the
-- whole point of pausing rather than being suspended.

set lock_timeout = '5s';

alter table public.service_providers
  add column if not exists paused_by_owner boolean not null default false;

comment on column public.service_providers.paused_by_owner is
  'إيقاف مؤقّت يضبطه صاحب الجهة نفسه (مغلقون الآن). يختلف عن active وهو '
  'الإيقاف الإداري الذي لا يملكه إلا المدير.';

drop policy if exists providers_public_read on public.service_providers;

create policy providers_public_read on public.service_providers
  for select using (
    active and verified_at is not null and not paused_by_owner
  );

-- An index only for the column the catalogue filters on hardest. The table is
-- small today, so this is about the plan staying sane as it grows rather than
-- about a query that is slow now.
create index if not exists service_providers_catalogue
  on public.service_providers (active, paused_by_owner)
  where verified_at is not null;
