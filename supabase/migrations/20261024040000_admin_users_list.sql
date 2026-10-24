-- «المسجَّلون»: من سجّل في سوداقري ومتى وبأيّ طريقة، للمدير وحده (البند ١٥٤).
--
-- The owner, 24 October, looking at the user list in the Supabase dashboard: «لماذا لا تبني
-- مراقبةً للمسجَّلين، وتُظهر الحسابات المسجَّلة في سوداقري؟». What he saw there is also what
-- a person cannot read from inside the platform: `auth.users` belongs to the auth schema and
-- no policy shows it to anyone. Two things in that list need translating, and this function
-- does it:
--
--   - a phone account is stored with an invented email, `p966555608873@phone.invalid`. The
--     real contact is `profiles.phone`; the invented address is not shown, and is what says
--     «this is a phone account»;
--   - one account can carry several ways in (the owner's own has Email and Google): they are
--     one person and are counted once, with the list of ways beside them.
--
-- Read only. Two functions, each refusing anyone who is not an administrator, each reading
-- `auth.users` and `auth.identities` with the owner's rights, and neither writing anything.
-- Nothing is deleted or edited from the page that uses them.

create or replace function public.admin_users_summary()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, auth
as $$
begin
  if not is_admin() then raise exception 'للإدارة وحدها.'; end if;
  return (
    with u as (
      select u.id, u.created_at, u.email, u.email_confirmed_at, p.role::text as role,
             coalesce((select array_agg(distinct i.provider) from auth.identities i where i.user_id = u.id), '{}') as ids
        from auth.users u left join profiles p on p.id = u.id
    )
    select jsonb_build_object(
      'total',      count(*),
      'today',      count(*) filter (where created_at >= date_trunc('day', now() at time zone 'Africa/Khartoum') at time zone 'Africa/Khartoum'),
      'week',       count(*) filter (where created_at >= now() - interval '7 days'),
      'month',      count(*) filter (where created_at >= now() - interval '30 days'),
      'phone',      count(*) filter (where email like '%@phone.invalid'),
      'email',      count(*) filter (where email is not null and email not like '%@phone.invalid'),
      'google',     count(*) filter (where 'google' = any(ids)),
      'facebook',   count(*) filter (where 'facebook' = any(ids)),
      'farmers',    count(*) filter (where role = 'farmer'),
      'investors',  count(*) filter (where role = 'investor'),
      'admins',     count(*) filter (where role = 'admin'),
      'unconfirmed', count(*) filter (where email is not null and email not like '%@phone.invalid' and email_confirmed_at is null)
    ) from u);
end;
$$;

create or replace function public.admin_users_list(
  p_limit integer default 50, p_offset integer default 0, p_q text default null)
returns table (
  id uuid, full_name text, role text, phone text, email text, ways text[],
  created_at timestamptz, last_sign_in_at timestamptz, confirmed boolean,
  lands integer, projects integer, seasons integer)
language plpgsql
stable
security definer
set search_path = public, auth
as $$
begin
  if not is_admin() then raise exception 'للإدارة وحدها.'; end if;
  return query
    select u.id,
           coalesce(nullif(p.full_name, ''), nullif(u.raw_user_meta_data->>'full_name', ''), '—'),
           p.role::text,
           p.phone,
           case when u.email like '%@phone.invalid' then null else u.email end,
           array(select distinct case when u.email like '%@phone.invalid' and i.provider = 'email' then 'phone' else i.provider end
                   from auth.identities i where i.user_id = u.id order by 1),
           u.created_at, u.last_sign_in_at,
           (u.email like '%@phone.invalid') or u.email_confirmed_at is not null,
           (select count(*)::int from lands l where l.owner_id = u.id),
           (select count(*)::int from projects pr where pr.submitted_by = u.id),
           (select count(*)::int from seasons s where s.owner_id = u.id)
      from auth.users u left join profiles p on p.id = u.id
     where p_q is null or btrim(p_q) = ''
        or p.full_name ilike '%' || btrim(p_q) || '%'
        or p.phone like '%' || btrim(p_q) || '%'
        or (u.email not like '%@phone.invalid' and u.email ilike '%' || btrim(p_q) || '%')
     order by u.created_at desc
     limit least(greatest(coalesce(p_limit, 50), 1), 200)
    offset greatest(coalesce(p_offset, 0), 0);
end;
$$;

revoke execute on function public.admin_users_summary() from public, anon;
revoke execute on function public.admin_users_list(integer, integer, text) from public, anon;
grant execute on function public.admin_users_summary() to authenticated;
grant execute on function public.admin_users_list(integer, integer, text) to authenticated;
