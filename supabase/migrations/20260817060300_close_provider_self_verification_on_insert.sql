-- سدّ التوثيق الذاتي عند الإنشاء.
--
-- The first version of this guard fired `before update` only, which turned out
-- to be no guard at all. providers_own lets an owner create their own row, and
-- nothing inspected that row's verified_at on the way in — so a provider could
-- arrive already verified, landing an unreviewed office directly in the public
-- catalogue as contractable.
--
-- Confirmed against the live database before fixing: acting as a non-admin
-- authenticated user, `insert into service_providers (..., verified_at) values
-- (..., now())` succeeded and returned self_verified = true. After this change
-- the same statement raises. Verification is an admin act in both directions
-- now, at birth as well as after it.

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

  if new.verified_at is not null and old.verified_at is null then
    new.verified_by := auth.uid();
  end if;

  return new;
end $$;

drop trigger if exists service_providers_verification_guard on public.service_providers;

create trigger service_providers_verification_guard
before insert or update on public.service_providers
for each row execute function public.guard_provider_verification();
