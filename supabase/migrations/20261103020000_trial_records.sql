-- بيانات التجربة تُوسَم ولا تُحسب سجلّاً (فحص 3 نوفمبر 2026، السؤال 10 للمالك: «نوسمها تجريبيّ»؛ data-quality-1 و-5).
--
-- الفرصة الوحيدة المعروضة على أرض المدير وبيده، وسجلّ منفّذها ودرجة ثقته من موسمٍ اسمه «[تجربة]». فلا يُحذف شيء:
--   - `seasons.trial`: الموسم التجريبيّ لا يدخل سجلّ المنفّذ (farmer_season_records) ولا مواسمه المكتملة ونسبة توثيقه
--     (refresh_operator_record)؛
--   - `projects.trial`: الفرصة التجريبيّة تحمل على صفحتها وبطاقتها «فرصة تجريبيّة: منفّذها من فريق المنصّة».
-- والوسم للإدارة وحدها: صاحب موسمٍ لا يخفي موسماً فاشلاً من سجلّه بوسمه تجريبيّاً.

alter table public.seasons add column trial boolean not null default false;
alter table public.projects add column trial boolean not null default false;

comment on column public.seasons.trial is 'موسمٌ تجريبيّ: لا يُحسب في سجلّ المنفّذ ولا في درجة ثقته. تضعه الإدارة وحدها.';
comment on column public.projects.trial is 'فرصةٌ تجريبيّة يشغّلها فريق المنصّة، وتقول ذلك صفحتها وبطاقتها. تضعه الإدارة وحدها.';

-- Visitors read projects column by column (20261022050000, 20261025230000): the new column is one they may read.
grant select (trial) on public.projects to anon, authenticated;

create or replace function public.trial_flag_admin_only()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or is_admin() then
    return new;
  end if;
  if (tg_op = 'INSERT' and new.trial) or (tg_op = 'UPDATE' and new.trial is distinct from old.trial) then
    raise exception 'وسم «تجريبيّ» للإدارة وحدها.';
  end if;
  return new;
end $$;

create trigger seasons_trial_admin_only
  before insert or update on public.seasons
  for each row execute function public.trial_flag_admin_only();
create trigger projects_trial_admin_only
  before insert or update on public.projects
  for each row execute function public.trial_flag_admin_only();

revoke all on function public.trial_flag_admin_only() from public, anon, authenticated;

-- ── السجلّ يعدّ ما حدث لا ما جُرِّب ─────────────────────────────────────────────

create or replace function public.farmer_season_records(p_id uuid)
 returns table (
   season_id            uuid,
   name                 text,
   crop_key             text,
   planting_date        date,
   status               text,
   feddans              numeric,
   planned_budget       numeric,
   actual_costs         numeric,
   revenue              numeric,
   stages_total         integer,
   stages_completed     integer,
   stages_with_evidence integer,
   stages_dated         integer,
   stages_on_time       integer
 )
 language sql
 stable
 security definer
 set search_path to 'public'
as $function$
  select
    s.id,
    s.name,
    s.crop_key,
    s.planting_date,
    s.status,
    s.feddans,
    coalesce((select sum(st.budget) from season_stages st where st.season_id = s.id), 0),
    coalesce((select sum(l.amount) from ledger_entries l
              where l.season_id = s.id and l.category <> 'revenue'), 0),
    coalesce((select sum(l.amount) from ledger_entries l
              where l.season_id = s.id and l.category = 'revenue'), 0),
    (select count(*)::int from season_stages st where st.season_id = s.id),
    (select count(*)::int from season_stages st
      where st.season_id = s.id and st.completed),
    (select count(distinct st.id)::int from season_stages st
       join stage_evidence e on e.stage_id = st.id
      where st.season_id = s.id
        and e.storage_path is not null),
    (select count(*)::int from season_stages st
      where st.season_id = s.id and st.completed
        and st.actual_end is not null
        and st.planned_end is not null),
    (select count(*)::int from season_stages st
      where st.season_id = s.id and st.completed
        and st.actual_end is not null
        and st.planned_end is not null
        and st.actual_end <= st.planned_end)
  from seasons s
  where s.owner_id = p_id
    and not s.trial
  order by s.planting_date desc;
$function$;
revoke all on function public.farmer_season_records(uuid) from public, anon, authenticated;
grant execute on function public.farmer_season_records(uuid) to service_role;

-- The operator's record on their profile, recomputed for one owner (the trigger below, and once here).
create or replace function public._operator_record_recount(p_owner uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  done int;
  total_stages int;
  signed_stages int;
begin
  select count(*) into done from seasons s
    where s.owner_id = p_owner and s.status = 'completed' and not s.trial
      and exists (select 1 from season_stages st
                   where st.season_id = s.id and st.completed
                     and exists (select 1 from stage_evidence e
                                  where e.stage_id = st.id and e.storage_path is not null));

  select count(*), count(*) filter (where completed)
    into total_stages, signed_stages
    from season_stages st join seasons s on s.id = st.season_id
    where s.owner_id = p_owner and not s.trial;

  perform set_config('app.operator_record', '1', true);
  update profiles
    set completed_seasons = done,
        reporting_rate = case when total_stages > 0
                              then round((signed_stages::numeric / total_stages), 2)
                              else 0 end
    where id = p_owner;
  perform set_config('app.operator_record', '', true);
end $$;

create or replace function public.refresh_operator_record()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (new.status = 'completed' and coalesce(old.status, '') <> 'completed')
     or new.trial is distinct from old.trial then
    perform _operator_record_recount(new.owner_id);
  end if;
  return new;
end $$;

revoke execute on function public.refresh_operator_record() from public, anon, authenticated;
revoke execute on function public._operator_record_recount(uuid) from public, anon, authenticated;

-- ── وسم ما على الموقع اليوم ─────────────────────────────────────────────────────
-- The one season named «[تجربة]», and the one open opportunity an administrator submitted (3 November 2026: one each).
update public.seasons set trial = true where name like '%[تجربة]%';
update public.projects set trial = true
 where status = 'open' and not is_demo
   and submitted_by in (select id from public.profiles where role = 'admin');

do $$
declare r record;
begin
  for r in select distinct owner_id from public.seasons where trial loop
    perform public._operator_record_recount(r.owner_id);
  end loop;
end $$;
