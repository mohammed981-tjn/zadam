-- مزامنة بيانات الفاو (البند ١٩٧): تدخل القاعدة وحدها، وتُعتمد بنقرة، ولا يُمحى القديم.
--
-- المالك، 25 أكتوبر 2026: غلّة المحاصيل وأسعار المنتجين (الفاو) «تُجلب مرّتين في السنة، لكن إدخالها إلى قاعدة
-- البيانات خطوةٌ أنفّذها أنا» — وأراد أن تُنفَّذ الخطوة آليّاً. وقاعدته: آليٌّ وموثوق، ولا يرى الزائرُ شيئاً قبل
-- أن يعتمده المدير.
--
-- فالمزامنة (src/lib/faostatSync.ts) تقرأ ملفّات data/ من النشر وتقارنها بـ faostat_observations، وتضع **الفرق وحده**
-- في faostat_pending: لا تمسّ ما يراه الزائر. والمدير يرى الفرق (جديداً ومعدَّلاً بقديمه وجديده) ويعتمده بدالّةٍ واحدة،
-- تحفظ ما ستستبدله في faostat_observation_history (لا يُحذف منه ولا يُعدَّل) وتسجّل التحميل في faostat_loads.
--
-- ولا تُحذف من faostat_observations صفوفٌ غابت عن الملفّ: ما حُمّل يبقى.

-- ── المنتظِر اعتماداً ───────────────────────────────────────────────────────

create table public.faostat_pending (
  domain    text not null check (domain in ('QCL', 'PP', 'TCL')),
  area      text not null,
  element   text not null,
  item      text not null,
  year      smallint not null,
  unit      text not null,
  value     numeric not null,
  flag      text,
  -- ما في faostat_observations الآن، أو null إن كان الصفّ جديداً.
  old_unit  text,
  old_value numeric,
  old_flag  text,
  found_at  timestamptz not null default now(),
  primary key (domain, area, element, item, year),
  check ((old_value is null) = (old_unit is null))
);

-- ── ما استُبدل: يُحفظ ولا يُحذف ────────────────────────────────────────────

create table public.faostat_observation_history (
  id          bigserial primary key,
  domain      text not null,
  area        text not null,
  element     text not null,
  item        text not null,
  year        smallint not null,
  unit        text not null,
  value       numeric not null,
  flag        text,
  loaded_at   timestamptz not null,
  replaced_at timestamptz not null default now(),
  replaced_by uuid references auth.users(id) on delete set null
);
create index faostat_history_key on public.faostat_observation_history (domain, area, element, item, year);

-- ── سجلّ التحميلات المعتمدة، وسجلّ الفحوص ──────────────────────────────────

create table public.faostat_loads (
  id           uuid primary key default gen_random_uuid(),
  applied_at   timestamptz not null default now(),
  applied_by   uuid references auth.users(id) on delete set null,
  new_rows     integer not null check (new_rows >= 0),
  changed_rows integer not null check (changed_rows >= 0)
);

create table public.faostat_syncs (
  id           uuid primary key default gen_random_uuid(),
  ran_at       timestamptz not null default now(),
  trigger      text not null check (trigger in ('cron', 'admin')),
  -- لكلّ نطاق: عدد صفوف الملفّ وبصمته، وجديد/معدَّل/كما هو.
  files        jsonb not null default '{}'::jsonb,
  new_rows     integer not null default 0,
  changed_rows integer not null default 0,
  same_rows    integer not null default 0,
  -- ما رُفض من الملفّات ولماذا، وما تعذّر قراءته. لا يُعتمد شيءٌ منه.
  problems     text[] not null default '{}'
);

-- ── الصلاحيات: المدير يقرأ، ومفتاح الخدمة يكتب الفرق وسجلّ الفحص وحدهما ──────

alter table public.faostat_pending enable row level security;
alter table public.faostat_observation_history enable row level security;
alter table public.faostat_loads enable row level security;
alter table public.faostat_syncs enable row level security;

revoke all on table public.faostat_pending, public.faostat_observation_history, public.faostat_loads, public.faostat_syncs
  from anon, authenticated, service_role;
revoke all on sequence public.faostat_observation_history_id_seq from anon, authenticated, service_role;

grant select on public.faostat_pending, public.faostat_observation_history, public.faostat_loads, public.faostat_syncs to authenticated;
grant select, insert, delete on public.faostat_pending to service_role;
grant select, insert on public.faostat_syncs to service_role;

create policy faostat_pending_admin_read on public.faostat_pending
  for select to authenticated using (is_admin());
create policy faostat_history_admin_read on public.faostat_observation_history
  for select to authenticated using (is_admin());
create policy faostat_loads_admin_read on public.faostat_loads
  for select to authenticated using (is_admin());
create policy faostat_syncs_admin_read on public.faostat_syncs
  for select to authenticated using (is_admin());

-- مفتاح الخدمة يقرأ ما في القاعدة ليقارن به، ولا يكتب فيها بعد اليوم: ما يراه الزائر من بيانات الفاو يدخل
-- بدالّة المدير أدناه وحدها (وكان `scripts/load-faostat.ts` يكتب بمفتاح الخدمة؛ لم يعد له هذا).
revoke insert, update, delete, truncate on public.faostat_observations from service_role;
grant select on public.faostat_observations to service_role;

-- ما استُبدل وما اعتُمد لا يتغيّر ولا يُحذف.
create function public.faostat_log_keep()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  raise exception 'سجلّ بيانات الفاو لا يتغيّر';
end $$;

create trigger faostat_history_keep
  before update or delete on public.faostat_observation_history
  for each row execute function public.faostat_log_keep();
create trigger faostat_history_no_truncate
  before truncate on public.faostat_observation_history
  for each statement execute function public.faostat_log_keep();
create trigger faostat_loads_keep
  before update or delete on public.faostat_loads
  for each row execute function public.faostat_log_keep();
create trigger faostat_loads_no_truncate
  before truncate on public.faostat_loads
  for each statement execute function public.faostat_log_keep();
revoke execute on function public.faostat_log_keep() from public, anon, authenticated, service_role;

-- ── الاعتماد: للمدير وحده، بدالّةٍ واحدة ────────────────────────────────────

create function public.faostat_apply_pending()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  n_new integer;
  n_changed integer;
begin
  if not is_admin() then raise exception 'للإدارة وحدها.'; end if;
  if not exists (select 1 from public.faostat_pending) then
    raise exception 'لا شيء ينتظر الاعتماد.';
  end if;

  -- ما سيُستبدل يُحفظ قبل أن يُستبدل.
  insert into public.faostat_observation_history (domain, area, element, item, year, unit, value, flag, loaded_at, replaced_by)
  select o.domain, o.area, o.element, o.item, o.year, o.unit, o.value, o.flag, o.loaded_at, auth.uid()
    from public.faostat_observations o
    join public.faostat_pending p using (domain, area, element, item, year)
   where p.old_value is not null;
  get diagnostics n_changed = row_count;

  select count(*) into n_new from public.faostat_pending where old_value is null;

  insert into public.faostat_observations (domain, area, element, item, year, unit, value, flag)
  select domain, area, element, item, year, unit, value, flag from public.faostat_pending
  on conflict (domain, area, element, item, year)
  do update set unit = excluded.unit, value = excluded.value, flag = excluded.flag, loaded_at = now();

  insert into public.faostat_loads (applied_by, new_rows, changed_rows) values (auth.uid(), n_new, n_changed);
  delete from public.faostat_pending;

  return jsonb_build_object('new', n_new, 'changed', n_changed);
end $$;

-- الرفض: يُترك الفرق جانباً (المزامنة التالية تجده من جديد إن بقي في الملفّ).
create function public.faostat_discard_pending()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  n integer;
begin
  if not is_admin() then raise exception 'للإدارة وحدها.'; end if;
  delete from public.faostat_pending;
  get diagnostics n = row_count;
  return n;
end $$;

revoke execute on function public.faostat_apply_pending(), public.faostat_discard_pending() from public, anon, service_role;
grant execute on function public.faostat_apply_pending(), public.faostat_discard_pending() to authenticated;
