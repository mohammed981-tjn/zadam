-- ============================================================================
-- Suspension is an administrative act, so the suspended party cannot undo it
-- ============================================================================
-- guard_provider_verification protected verified_at and verified_by. It never
-- mentioned `active`.
--
-- `providers_own` is `for all using (owner_id = auth.uid() or is_admin())`, so
-- the owner may write any other column on its own row — including `active`. And
-- `providers_public_read` is `active and verified_at is not null`, so a
-- verified provider that an admin has suspended returns to the catalogue with a
-- single request:
--
--   PATCH /rest/v1/service_providers?id=eq.<own id>   {"active": true}
--
-- Suspension is the only lever the platform has against a provider that is
-- genuinely verified but has stopped answering — which is exactly the case the
-- setProviderActive comment describes. A lever the sanctioned party can pull
-- back is not a lever.
--
-- `active` joins verified_at under the same guard. Note this leaves the owner
-- unable to mark itself inactive too; that is deliberate — "we are closed for
-- the season" and "we suspended you" must not be the same switch, and a
-- provider that wants to pause should ask, so the platform knows why a
-- catalogue entry vanished.
-- ============================================================================

set lock_timeout = '5s';

create or replace function public.guard_provider_verification()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if (new.verified_at is not null or new.verified_by is not null)
       and not is_admin() then
      raise exception 'توثيق مقدّم الخدمة من صلاحية الإدارة وحدها';
    end if;
    if new.verified_at is not null then
      new.verified_by := coalesce(new.verified_by, auth.uid());
    end if;
    return new;
  end if;

  if (new.verified_at is distinct from old.verified_at
      or new.verified_by is distinct from old.verified_by)
     and not is_admin() then
    raise exception 'توثيق مقدّم الخدمة من صلاحية الإدارة وحدها';
  end if;

  -- The addition. Scoped to JWT-bearing callers so service_role and the SQL
  -- editor keep working, matching how the verification check above behaves.
  if new.active is distinct from old.active
     and auth.uid() is not null
     and not is_admin() then
    raise exception 'إيقاف الجهة أو إعادة تفعيلها من صلاحية الإدارة وحدها';
  end if;

  if new.verified_at is not null and old.verified_at is null then
    new.verified_by := auth.uid();
  end if;

  return new;
end $$;

-- ============================================================================
-- Verify after applying, as a provider's own owner:
--
--   update service_providers set active = true where id = '<own, suspended>';
--   -- expected: ERROR  إيقاف الجهة أو إعادة تفعيلها من صلاحية الإدارة وحدها
-- ============================================================================
