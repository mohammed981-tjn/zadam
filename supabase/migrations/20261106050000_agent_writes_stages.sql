-- الوكيل يكتب مراحل الموسم وأدلّتها (البند ١٦٩؛ قرار المالك 6 نوفمبر 2026: «نعم، ويُعلَّم أنه من الوكيل»).
--
-- كانت المواسم للوكيل قراءةً فقط (20261026020000): «كتابتُها تمرّ بالدفتر والمراحل وحرّاسها، فلها شريحتها». وهذه هي.
-- شركةٌ موثّقة بإذنٍ قائمٍ في «المواسم» تعتمد مرحلةً من موسمٍ جارٍ للمزارع، وترفع دليلها (صورةً أو فاتورة)، وكلّ ذلك:
--   - يمرّ بالحرّاس أنفسهم: لا اعتماد بلا ملفٍّ مرفوع ولا قبل ما سبقه (enforce_stage_completion)، والملفّ في مجلّد
--     الكاتب وموجودٌ فعلاً (stage_evidence_insert_gate)، وما اعتُمد لا يُعدَّل (season_stage_freeze_gate)؛
--   - يُعلَّم بالإذن الذي كُتب به (season_stages.completed_by_mandate، stage_evidence.by_mandate؛ null = المزارع)؛
--   - يُسجَّل في agent_actions (السجلّ الذي لا يُعدَّل)، ويُخبَر به المزارع برابط الموسم؛
--   - ويعترض عليه المزارع (agent_write_object)، فيُخبَر الوكيل.
--
-- لماذا دوالّ لا سياسات: للسبب نفسه في 20261026020000. «مواسمي» تقرأ كلّ ما تسمح به السياسات، فلو سُمح للوكيل بجداول
-- المواسم لاختلطت مواسم مزارعيه بمواسمه، ولكتب في أيّ عمودٍ من الصفّ. الدالّة تكتب عمودين بعينهما، وتسأل الإذن في كلّ مرّة.
--
-- معنى الاعتراض — بسيطٌ ومتّسقٌ مع الحرّاس القائمة:
--   - اعتراضٌ واحدٌ على كلّ سطرٍ في سجلّ الوكيل، بسببٍ يقرؤه الوكيل، يُلحَق ولا يُعدَّل (agent_objections)، ولو بعد
--     انتهاء الإذن: الاعتراض على ما كُتب، لا على الإذن.
--   - على اعتماد مرحلة: تُفتح المرحلة من جديد إن كان الاعتمادُ ما زال اعتمادَ ذلك الإذن، والموسمُ جارياً، ولا مرحلةَ بعدها
--     معتمدة. هذا هو الطريق الوحيد إلى الوراء الذي يفتحه حارس التجميد، ولهذه المرحلة وحدها. فإن كانت بعدها مرحلةٌ معتمدة
--     فإعادة فتحها تكسر الترتيب الذي يحرسه enforce_stage_completion (مفتوحةٌ قبل معتمدة)، وإن أُقفل الموسم فتاريخه ثابت
--     (seasons_history_gate): يُسجَّل الاعتراض ويُخبَر الوكيل والإدارة تراه، ولا يُفتح شيء.
--     ولا يعتمد وكيلٌ بعدها مرحلةً اعترض المزارع على اعتمادها: يعتمدها المزارع بنفسه.
--   - الدليل لا يُسحب (20260904210000): ما رفعه الوكيل على مرحلةٍ اعتُرض على اعتمادها، أو اعتُرض عليه هو، يبقى صفّاً وملفّاً
--     — لا يحذفه الوكيل من مجلّده ولا المزارع من موسمه — ويُعرض «معترَضاً عليه». فالمرحلة إن فُتحت صار دليلها في العادة
--     قابلاً للسحب، وهذا بالضبط ما لا يجوز لدليلٍ صار موضوع خلاف. والعلامة مشتقّة من سجلّ الاعتراضات، لا عمودٌ يُكتب على
--     الدليل، فلا يُمسّ حارس البقاء (stage_evidence_keep_gate) ولا دالّة السحب: يُضاف بجانبهما زنادٌ وسياسةٌ مقيِّدة.
--
-- والملفّ في مجلّد الوكيل (سياسة الرفع: أوّل المسار هو الرافع)، فيقرؤه صاحب الموسم بسياسةٍ تسأل: هل هو دليلٌ على مرحلةٍ
-- من موسمك؟ على مثال partner_stage_photo_readable (20261022030000).

-- ── العلامة ────────────────────────────────────────────────────────────────

alter table public.season_stages
  add column if not exists completed_by_mandate uuid references public.agent_mandates(id) on delete restrict;
alter table public.stage_evidence
  add column if not exists by_mandate uuid references public.agent_mandates(id) on delete restrict;

comment on column public.season_stages.completed_by_mandate is
  'الإذن الذي اعتمد به وكيلٌ هذه المرحلة عن صاحبها (null = صاحبها). تكتبه agent_stage_complete وحدها.';
comment on column public.stage_evidence.by_mandate is
  'الإذن الذي رفع به وكيلٌ هذا الدليل عن صاحب الموسم (null = صاحبه). تكتبه agent_stage_evidence_add وحدها.';

-- ── السجلّ: موضوعان جديدان، وفعلٌ جديد ───────────────────────────────────

alter table public.agent_actions drop constraint if exists agent_actions_subject_check;
alter table public.agent_actions add constraint agent_actions_subject_check
  check (subject in ('land', 'land_document', 'season_stage', 'stage_evidence'));
alter table public.agent_actions drop constraint if exists agent_actions_action_check;
alter table public.agent_actions add constraint agent_actions_action_check
  check (action in ('insert', 'update', 'complete'));

-- ── الاعتراض ───────────────────────────────────────────────────────────────

create table if not exists public.agent_objections (
  id          bigint generated always as identity primary key,
  action_id   bigint not null unique references public.agent_actions(id) on delete restrict,
  mandate_id  uuid not null references public.agent_mandates(id) on delete restrict,
  farmer_id   uuid not null references auth.users(id),
  agent_id    uuid not null references auth.users(id),
  reason      text not null check (length(btrim(reason)) between 3 and 500),
  -- أُعيد فتح المرحلة بهذا الاعتراض (لاعتماد مرحلة)؛ وإلا سُجّل الاعتراض وحده.
  reopened    boolean not null default false,
  at          timestamptz not null default now()
);

create index if not exists agent_objections_farmer on public.agent_objections (farmer_id, at desc);
create index if not exists agent_objections_agent on public.agent_objections (agent_id, at desc);

alter table public.agent_objections enable row level security;
revoke all on public.agent_objections from anon;
revoke insert, update, delete, truncate on public.agent_objections from authenticated;
grant select on public.agent_objections to authenticated;

drop policy if exists agent_objections_read on public.agent_objections;
create policy agent_objections_read on public.agent_objections
  for select to authenticated
  using (farmer_id = auth.uid() or agent_id = auth.uid() or is_admin());

-- يُلحَق ولا يُعدَّل، كالسجلّ الذي يعترض عليه (والرسالة نفسها).
drop trigger if exists agent_objections_keep on public.agent_objections;
create trigger agent_objections_keep
  before update or delete on public.agent_objections
  for each row execute function public.agent_actions_keep();

-- دليلٌ اعتُرض عليه: هو نفسه، أو رفعه وكيلٌ على مرحلةٍ اعتُرض على اعتماد وكيلٍ لها.
create or replace function public.stage_evidence_objected(p_evidence uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from stage_evidence e
     where e.id = p_evidence
       and e.by_mandate is not null
       and exists (select 1 from agent_objections o join agent_actions a on a.id = o.action_id
                    where (a.subject = 'stage_evidence' and a.subject_id = e.id)
                       or (a.subject = 'season_stage' and a.subject_id = e.stage_id)))
$$;

revoke execute on function public.stage_evidence_objected(uuid) from public, anon;
grant execute on function public.stage_evidence_objected(uuid) to authenticated;

-- ── الحرّاس: العلامة لا تُكتب باليد، وما اعتُرض عليه يبقى ──────────────────────

-- العلامة تكتبها الدوالّ أدناه وحدها: app.agent_write يحمل الإذن الذي تكتب به، وapp.agent_objection المرحلة التي يُفتح
-- اعتمادها. بغيرهما لا يكتب المزارع علامة وكيلٍ على ما كتبه هو، ولا يمحوها عمّا كتبه الوكيل.
create or replace function public.season_stage_agent_mark_gate()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is not null and not is_admin() then
    if tg_op = 'INSERT' then
      if new.completed_by_mandate is not null then
        raise exception 'علامة الوكيل تكتبها دوالّه وحدها.';
      end if;
    elsif new.completed_by_mandate is distinct from old.completed_by_mandate
          and not (old.completed_by_mandate is null
                   and new.completed_by_mandate::text = coalesce(current_setting('app.agent_write', true), ''))
          and not (new.completed_by_mandate is null
                   and old.id::text = coalesce(current_setting('app.agent_objection', true), '')) then
      raise exception 'علامة الوكيل تكتبها دوالّه وحدها.';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists season_stages_agent_mark_gate on public.season_stages;
create trigger season_stages_agent_mark_gate
  before insert or update on public.season_stages
  for each row execute function public.season_stage_agent_mark_gate();

create or replace function public.stage_evidence_agent_gate()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is not null and not is_admin() then
    if tg_op = 'INSERT' then
      if new.by_mandate is not null
         and new.by_mandate::text <> coalesce(current_setting('app.agent_write', true), '') then
        raise exception 'علامة الوكيل تكتبها دوالّه وحدها.';
      end if;
      return new;
    end if;
    if tg_op = 'UPDATE' and new.by_mandate is distinct from old.by_mandate then
      raise exception 'علامة الوكيل تكتبها دوالّه وحدها.';
    end if;
    if public.stage_evidence_objected(old.id) then
      raise exception 'دليلٌ اعترض عليه المزارع يبقى كما هو.';
    end if;
  end if;
  return case tg_op when 'DELETE' then old else new end;
end $$;

drop trigger if exists stage_evidence_agent_gate on public.stage_evidence;
create trigger stage_evidence_agent_gate
  before insert or update or delete on public.stage_evidence
  for each row execute function public.stage_evidence_agent_gate();

-- والملفّ في التخزين كذلك. سياسةٌ مقيِّدة بجانب evidence_delete_own (لا تُستبدل)، كما فعلت 20261024010000 بالدفعات.
create or replace function public.evidence_object_objected(p_name text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from stage_evidence se
                  where se.storage_path = p_name and public.stage_evidence_objected(se.id))
$$;

revoke execute on function public.evidence_object_objected(text) from public, anon;
grant execute on function public.evidence_object_objected(text) to authenticated, service_role;

drop policy if exists evidence_objected_stays on storage.objects;
create policy evidence_objected_stays on storage.objects
  as restrictive for delete to authenticated
  using (bucket_id <> 'evidence' or not public.evidence_object_objected(name));

-- صاحب الموسم يقرأ دليل مراحله ولو رُفع من مجلّد غيره (وهو الوكيل وحده: حارس الإدراج يُلزم مجلّد الكاتب).
create or replace function public.season_owner_stage_file_readable(p_name text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from stage_evidence se
      join season_stages st on st.id = se.stage_id
      join seasons s on s.id = st.season_id
     where se.storage_path = p_name and s.owner_id = auth.uid())
$$;

revoke execute on function public.season_owner_stage_file_readable(text) from public, anon;
grant execute on function public.season_owner_stage_file_readable(text) to authenticated;

drop policy if exists evidence_read_season_owner on storage.objects;
create policy evidence_read_season_owner on storage.objects
  for select to authenticated
  using (bucket_id = 'evidence' and public.season_owner_stage_file_readable(name));

-- حارس التجميد (20261024010000) كما هو، وفيه طريقٌ واحدٌ إلى الوراء: اعتراض المزارع على اعتماد وكيلٍ لهذه المرحلة،
-- تضعه agent_write_object وحدها. يُرجِع الاعتماد ويمحو تاريخه وعلامته، ولا يمسّ خطّتها ولا أرقامها.
create or replace function public.season_stage_freeze_gate()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is not null and not is_admin() then
    if new.season_id is distinct from old.season_id
       or new.stage_order is distinct from old.stage_order
       or new.stage_key is distinct from old.stage_key then
      raise exception 'خطّة الموسم ثابتة: لا يُنقل ترتيب المراحل ولا موسمها.';
    end if;
    if old.completed then
      if not new.completed
         and old.id::text = coalesce(current_setting('app.agent_objection', true), '')
         and new.completed_at is null
         and (new.planned_start, new.planned_end, new.actual_start, new.budget, new.planned_water_m3)
             is not distinct from
             (old.planned_start, old.planned_end, old.actual_start, old.budget, old.planned_water_m3) then
        return new;
      end if;
      if not new.completed then
        raise exception 'مرحلةٌ اعتُمدت لا تُرجَع إلى الفتح.';
      end if;
      if (new.planned_start, new.planned_end, new.actual_start, new.actual_end,
          new.completed_at, new.budget, new.planned_water_m3)
         is distinct from
         (old.planned_start, old.planned_end, old.actual_start, old.actual_end,
          old.completed_at, old.budget, old.planned_water_m3) then
        raise exception 'مرحلةٌ اعتُمدت لا تُعدَّل مواعيدها ولا أرقامها.';
      end if;
    end if;
  end if;
  return new;
end;
$$;

-- ── ما يقرؤه الوكيل ─────────────────────────────────────────────────────────

-- مراحل موسمٍ لمزارعٍ أذن في مواسمه: ما اعتُمد ومن اعتمده، وكم عليها من دليل، وهل اعترض المزارع على اعتماد وكيلٍ لها.
create or replace function public.agent_farmer_stages(p_season uuid)
returns table (id uuid, stage_key text, stage_order integer, planned_start date, planned_end date, completed boolean,
               completed_at timestamptz, by_agent boolean, evidence_count integer, objected boolean)
language sql
stable
security definer
set search_path = public
as $$
  select g.id, g.stage_key::text, g.stage_order::int, g.planned_start, g.planned_end, g.completed, g.completed_at,
         g.completed_by_mandate is not null,
         (select count(*)::int from stage_evidence e where e.stage_id = g.id and e.storage_path is not null),
         exists (select 1 from agent_objections o join agent_actions a on a.id = o.action_id
                  where a.subject = 'season_stage' and a.subject_id = g.id)
    from season_stages g
    join seasons s on s.id = g.season_id
   where g.season_id = p_season and public.is_agent_for(s.owner_id, 'seasons')
   order by g.stage_order
$$;

-- ── ما يكتبه الوكيل ─────────────────────────────────────────────────────────

-- إذن المنادي في مواسم صاحب هذه المرحلة، وموسمها جارٍ. يُقفل صفّ المرحلة.
create or replace function public.agent_season_for_stage(p_stage uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid;
  v_status text;
  v_mandate uuid;
begin
  select s.owner_id, s.status into v_owner, v_status
    from season_stages g join seasons s on s.id = g.season_id
   where g.id = p_stage;
  if not found then
    raise exception 'لا مرحلة بهذا.';
  end if;
  if v_owner = auth.uid() then
    raise exception 'هذا موسمك: اكتب فيه من صفحته.';
  end if;
  v_mandate := public.agent_mandate_for(v_owner, 'seasons');
  if v_mandate is null then
    raise exception 'لا إذن قائماً لك في مواسم هذا المزارع.';
  end if;
  if v_status is distinct from 'active' then
    raise exception 'هذا الموسم ليس جارياً: لا يُكتب فيه.';
  end if;
  perform 1 from season_stages where id = p_stage for update;
  return v_mandate;
end $$;

revoke execute on function public.agent_season_for_stage(uuid) from public, anon, authenticated;

create or replace function public.agent_company_name(p_mandate uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select c.name from agent_mandates m join partner_companies c on c.id = m.company_id where m.id = p_mandate
$$;

revoke execute on function public.agent_company_name(uuid) from public, anon, authenticated;

-- يعتمد مرحلةً عن المزارع. الاعتماد نفسه بالتحديث العاديّ، فيحرسه enforce_stage_completion كما يحرس اعتماد المزارع.
create or replace function public.agent_stage_complete(p_stage uuid)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_season seasons;
  v_mandate uuid;
  v_order integer;
  v_action bigint;
begin
  v_mandate := public.agent_season_for_stage(p_stage);
  select s.* into v_season from season_stages g join seasons s on s.id = g.season_id where g.id = p_stage;
  if (select completed from season_stages where id = p_stage) then
    raise exception 'اعتُمدت هذه المرحلة من قبل.';
  end if;
  if exists (select 1 from agent_objections o join agent_actions a on a.id = o.action_id
              where a.subject = 'season_stage' and a.subject_id = p_stage) then
    raise exception 'اعترض المزارع على اعتماد هذه المرحلة: يعتمدها هو بنفسه.';
  end if;

  perform set_config('app.agent_write', v_mandate::text, true);
  update season_stages
     set completed = true,
         actual_end = (now() at time zone 'Africa/Khartoum')::date,
         completed_by_mandate = v_mandate
   where id = p_stage;
  perform set_config('app.agent_write', '', true);

  insert into agent_actions (mandate_id, agent_id, farmer_id, subject, subject_id, action)
  values (v_mandate, auth.uid(), v_season.owner_id, 'season_stage', p_stage, 'complete')
  returning id into v_action;

  select stage_order into v_order from season_stages where id = p_stage;
  perform public.notify_user(
    v_season.owner_id, 'agent_mandate', 'اعتمد وكيلك مرحلةً من موسمك: ' || v_season.name,
    'اعتمدت «' || public.agent_company_name(v_mandate) || '» المرحلة ' || v_order || ' بالإذن الذي أعطيتها، وعليها دليلها. '
      || 'إن لم تتمّ كما قيل فاعترض من صفحة الموسم، فتُفتح من جديد.',
    '/seasons/' || v_season.id);
  return v_action;
end $$;

-- يرفع دليلاً عن المزارع: ملفٌّ رفعه الوكيل إلى مجلّده هو، فيمرّ بحارس الإدراج كما يمرّ ملفّ المزارع.
create or replace function public.agent_stage_evidence_add(
  p_stage uuid, p_kind text, p_storage_path text, p_caption text,
  p_captured_at timestamptz default null, p_latitude double precision default null,
  p_longitude double precision default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_season seasons;
  v_mandate uuid;
  v_id uuid;
  v_action bigint;
begin
  v_mandate := public.agent_season_for_stage(p_stage);
  select s.* into v_season from season_stages g join seasons s on s.id = g.season_id where g.id = p_stage;
  if p_kind is null or p_kind not in ('photo', 'invoice', 'inspection') then
    raise exception 'نوع دليلٍ غير معروف.';
  end if;
  if p_storage_path is null or btrim(p_storage_path) = '' then
    raise exception 'الدليل ملفٌّ مرفوع: ارفعه ثمّ سجّله.';
  end if;
  -- الملفّ نفسه أُرسل ثانيةً (ضاع جواب الأوّل): هو الدليل المسجَّل، لا دليلٌ آخر.
  select id into v_id from stage_evidence where stage_id = p_stage and storage_path = p_storage_path limit 1;
  if v_id is not null then
    return v_id;
  end if;
  -- وكيلٌ يعمل عن كثيرين: صورةٌ واحدة لا تكون دليلاً على مرحلتين.
  if exists (select 1 from stage_evidence where storage_path = p_storage_path) then
    raise exception 'هذا الملفّ دليلٌ على مرحلةٍ أخرى.';
  end if;

  perform set_config('app.agent_write', v_mandate::text, true);
  insert into stage_evidence (stage_id, kind, caption, storage_path, captured_at, latitude, longitude, by_mandate)
  values (p_stage, p_kind, left(nullif(btrim(coalesce(p_caption, '')), ''), 300), p_storage_path,
          p_captured_at, p_latitude, p_longitude, v_mandate)
  returning id into v_id;
  perform set_config('app.agent_write', '', true);

  insert into agent_actions (mandate_id, agent_id, farmer_id, subject, subject_id, action)
  values (v_mandate, auth.uid(), v_season.owner_id, 'stage_evidence', v_id, 'insert')
  returning id into v_action;

  perform public.notify_user(
    v_season.owner_id, 'agent_mandate', 'رفع وكيلك دليلاً على موسمك: ' || v_season.name,
    'رفعته «' || public.agent_company_name(v_mandate) || '» بالإذن الذي أعطيتها، ويظهر على المرحلة معلَّماً باسمها. '
      || 'إن لم يكن صحيحاً فاعترض من صفحة الموسم.',
    '/seasons/' || v_season.id);
  return v_id;
end $$;

-- ── اعتراض المزارع ──────────────────────────────────────────────────────────

-- يعترض المزارع على سطرٍ من سجلّ ما كتبه وكيلٌ باسمه. يُرجع true إن أُعيد فتح المرحلة (انظر رأس الملفّ).
create or replace function public.agent_write_object(p_action bigint, p_reason text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  a agent_actions%rowtype;
  g season_stages%rowtype;
  v_status text;
  v_season uuid;
  v_name text;
  v_reopen boolean := false;
  v_owner uuid;
  v_tail text;
  v_active boolean;
begin
  select * into a from agent_actions where id = p_action and farmer_id = auth.uid();
  if not found then
    raise exception 'لا شيء بهذا في سجلّ وكلائك.';
  end if;
  if length(btrim(coalesce(p_reason, ''))) not between 3 and 500 then
    raise exception 'اكتب سبب اعتراضك (٣ أحرفٍ فأكثر): يقرؤه الوكيل.';
  end if;
  if exists (select 1 from agent_objections where action_id = p_action) then
    raise exception 'اعترضت على هذا من قبل.';
  end if;

  if a.subject = 'season_stage' then
    select * into g from season_stages where id = a.subject_id for update;
    select status, id, name into v_status, v_season, v_name from seasons where id = g.season_id;
    v_reopen := found
      and g.completed
      and g.completed_by_mandate is not distinct from a.mandate_id
      and v_status = 'active'
      and not exists (select 1 from season_stages s
                       where s.season_id = g.season_id and s.stage_order > g.stage_order and s.completed);
  elsif a.subject = 'stage_evidence' then
    select s.id, s.name into v_season, v_name
      from stage_evidence e join season_stages st on st.id = e.stage_id join seasons s on s.id = st.season_id
     where e.id = a.subject_id;
  end if;

  -- السجلّ أوّلاً: به يصير دليل المرحلة «معترَضاً عليه» فلا يُسحب حين تُفتح.
  insert into agent_objections (action_id, mandate_id, farmer_id, agent_id, reason, reopened)
  values (a.id, a.mandate_id, a.farmer_id, a.agent_id, btrim(p_reason), v_reopen);

  if v_reopen then
    perform set_config('app.agent_objection', g.id::text, true);
    update season_stages
       set completed = false, completed_at = null, actual_end = null, completed_by_mandate = null
     where id = g.id;
    perform set_config('app.agent_objection', '', true);
  end if;

  select c.owner_id, m.phone_tail, m.status = 'active' into v_owner, v_tail, v_active
    from agent_mandates m join partner_companies c on c.id = m.company_id
   where m.id = a.mandate_id;
  perform public.notify_user(
    v_owner, 'agent_mandate', 'اعترض المزارع (…' || v_tail || ') على ما كتبته باسمه',
    'سببه: ' || btrim(p_reason)
      || case when v_reopen then '. وأُعيد فتح المرحلة، ويعتمدها هو بنفسه.'
              else '. سُجّل الاعتراض وبقي ما كتبته كما هو، وتراه الإدارة.' end,
    case when v_active then '/agent/' || a.farmer_id else '/agent' end);
  return v_reopen;
end $$;

-- ── الصلاحيّات ──────────────────────────────────────────────────────────────

revoke execute on function public.season_stage_agent_mark_gate() from public, anon, authenticated;
revoke execute on function public.stage_evidence_agent_gate() from public, anon, authenticated;
revoke execute on function public.season_stage_freeze_gate() from public, anon, authenticated;

revoke execute on function public.agent_farmer_stages(uuid) from public, anon;
revoke execute on function public.agent_stage_complete(uuid) from public, anon;
revoke execute on function public.agent_stage_evidence_add(uuid, text, text, text, timestamptz, double precision, double precision) from public, anon;
revoke execute on function public.agent_write_object(bigint, text) from public, anon;
grant execute on function public.agent_farmer_stages(uuid) to authenticated;
grant execute on function public.agent_stage_complete(uuid) to authenticated;
grant execute on function public.agent_stage_evidence_add(uuid, text, text, text, timestamptz, double precision, double precision) to authenticated;
grant execute on function public.agent_write_object(bigint, text) to authenticated;
