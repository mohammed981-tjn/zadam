-- الترعة موردٌ مشترك: أعضاؤها، ونوبات مائها، وواجب صيانتها بقدر المساحة.
--
-- البند ٤٤. ثلاثةٌ من مبادئ أوستروم تُطبَّق هنا على الترعة (الميسقة) نفسها:
--
--   ١) حدودٌ واضحة — مَن يحقّ له الماء. العضويةُ طلبٌ يقبله قيّمُ الترعة، لا
--      بابٌ مفتوح.
--   2B) تناسبُ الكلفة مع المنفعة — واجبُ الصيانة بقدر الفدادين، ويُعرض لكلّ
--      عضوٍ نصيبُه نسبةً مئوية. وجدت تجربة نيبال (Lam 1998) أنّ عدالة هذا
--      التوزيع هي ما يفسّر تفوّق أنظمة المزارعين وثقتهم ببعضهم.
--   ٨) مؤسساتٌ متداخلة — الترعة وحدةٌ صغيرةٌ داخل مشروعٍ أكبر؛ ولها قيّمها
--      وجدولها، ونفيرُ تطهيرها يُربط بها.
--
-- ودرسُ الجزيرة (FAO 2000–2002): حين تولّت لجانُ المزارعين صيانة القنوات
-- الفرعية زادت الغلّة ٣٦–٣١٠٪؛ وحين فُرض الإصلاح من فوق فشل. فالقيّم هنا
-- واحدٌ من الأعضاء يقبله الأعضاء، لا موظّف.
--
-- الخصوصية: اسمُ الترعة ومكانها وعددُ أعضائها وفدادينها علنيّ — ليُعرف أنها
-- قائمةٌ ويُطلب الانضمام إليها. أمّا أسماء الأعضاء وفدادينهم ونوباتهم فللأعضاء
-- وحدهم: هي شأنُ الترعة لا شأن الناس.
--
-- كالجودية: لا كتابة مباشرة في الجداول، كلُّ تغييرٍ دالّةٌ تتحقّق من صاحبه.

create table public.canals (
  id           uuid primary key default gen_random_uuid(),
  name         text not null check (length(btrim(name)) between 3 and 80),
  state        text not null check (is_sudan_state(state)),
  locality     text not null check (length(btrim(locality)) between 2 and 80),
  description  text check (description is null or length(btrim(description)) between 10 and 1000),
  created_by   uuid not null references auth.users(id) on delete cascade,
  created_at   timestamptz not null default now()
);

create table public.canal_members (
  canal_id     uuid not null references public.canals(id) on delete cascade,
  user_id      uuid not null references auth.users(id) on delete cascade,
  display_name text not null check (length(btrim(display_name)) between 2 and 60),
  -- Declared by the member, confirmed by a steward. The whole fairness of the
  -- maintenance share rests on this number, so it is the steward who sets the
  -- figure the share is computed from.
  feddans      numeric(8,2) not null check (feddans > 0 and feddans <= 10000),
  role         text not null default 'member' check (role in ('member','steward')),
  status       text not null default 'pending' check (status in ('pending','member')),
  joined_at    timestamptz not null default now(),
  primary key (canal_id, user_id)
);

-- جدول النوبات الأسبوعي: لمن الماء، في أيّ يوم، ومن أيّ ساعة إلى أيّها.
create table public.canal_turns (
  id        uuid primary key default gen_random_uuid(),
  canal_id  uuid not null references public.canals(id) on delete cascade,
  user_id   uuid not null references auth.users(id) on delete cascade,
  weekday   smallint not null check (weekday between 0 and 6),
  starts    time not null,
  ends      time not null,
  constraint canal_turn_has_length check (ends <> starts)
);

create index canal_turns_canal_idx on public.canal_turns (canal_id, weekday, starts);

-- نفيرُ التطهير يُربط بترعته، فيظهر في صفحتها.
alter table public.nafir_calls
  add column canal_id uuid references public.canals(id) on delete set null;

alter table public.canals enable row level security;
alter table public.canal_members enable row level security;
alter table public.canal_turns enable row level security;

create or replace function public.canal_role(p_canal uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  -- 'steward', 'member', 'pending' or null.
  select case when status = 'pending' then 'pending' else role end
    from canal_members where canal_id = p_canal and user_id = auth.uid();
$$;

create policy canals_public_read on public.canals for select using (true);

-- A member sees the roster; a pending applicant sees only his own row, so he
-- knows his request is waiting without reading the list he has not joined.
create policy canal_members_inside on public.canal_members
  for select to authenticated using (
    user_id = auth.uid()
    or canal_role(canal_id) in ('member','steward')
    or is_admin());
create policy canal_turns_inside on public.canal_turns
  for select to authenticated using (
    canal_role(canal_id) in ('member','steward') or is_admin());

-- ═══════════════════════════════════════════════════════════════════════════
-- الخطوات
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.canal_create(
  p_name text, p_state text, p_locality text, p_description text,
  p_display_name text, p_feddans numeric)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if auth.uid() is null then raise exception 'سجّل الدخول أولاً.'; end if;
  if (select count(*) from canals where created_by = auth.uid()) >= 5 then
    raise exception 'سجّلتَ خمس ترعٍ. ما زاد يحتاج الإدارة.';
  end if;
  insert into canals (name, state, locality, description, created_by)
  values (p_name, p_state, p_locality, nullif(btrim(p_description), ''), auth.uid())
  returning id into v_id;
  insert into canal_members (canal_id, user_id, display_name, feddans, role, status)
  values (v_id, auth.uid(), p_display_name, p_feddans, 'steward', 'member');
  return v_id;
end;
$$;

create or replace function public.canal_request_join(p_canal uuid, p_display_name text, p_feddans numeric)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_steward uuid;
begin
  if auth.uid() is null then raise exception 'سجّل الدخول أولاً.'; end if;
  if canal_role(p_canal) is not null then raise exception 'طلبتَ الانضمام من قبل أو أنت عضو.'; end if;
  insert into canal_members (canal_id, user_id, display_name, feddans)
  values (p_canal, auth.uid(), p_display_name, p_feddans);
  for v_steward in select user_id from canal_members
                   where canal_id = p_canal and role = 'steward' and status = 'member' loop
    begin
      insert into notifications (recipient_id, kind, title, body, link)
      values (v_steward, 'canal_update', 'طلب ' || p_display_name || ' الانضمام إلى الترعة',
              p_feddans || ' فدان', '/nafir/canals/' || p_canal);
    exception when others then
      raise warning 'canal join notification failed: %', sqlerrm;
    end;
  end loop;
end;
$$;

-- القيّم يقبل أو يردّ، ويثبّت الفدادين التي يُحسب عليها النصيب.
create or replace function public.canal_decide(p_canal uuid, p_user uuid, p_accept boolean, p_feddans numeric)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if canal_role(p_canal) is distinct from 'steward' then
    raise exception 'القبول لقيّم الترعة.';
  end if;
  if p_accept then
    update canal_members set status = 'member', feddans = coalesce(p_feddans, feddans)
      where canal_id = p_canal and user_id = p_user;
    if not found then raise exception 'لا طلب بهذا الاسم.'; end if;
    begin
      insert into notifications (recipient_id, kind, title, body, link)
      values (p_user, 'canal_update', 'قُبلتَ عضواً في الترعة',
              (select name from canals where id = p_canal), '/nafir/canals/' || p_canal);
    exception when others then
      raise warning 'canal accept notification failed: %', sqlerrm;
    end;
  else
    delete from canal_members where canal_id = p_canal and user_id = p_user and status = 'pending';
  end if;
end;
$$;

-- تعديل الفدادين أو الدور لعضوٍ قائم. A steward cannot demote himself if he
-- is the last one: a canal without a steward can accept nobody.
create or replace function public.canal_set_member(p_canal uuid, p_user uuid, p_feddans numeric, p_role text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if canal_role(p_canal) is distinct from 'steward' then
    raise exception 'التعديل لقيّم الترعة.';
  end if;
  if p_role = 'member' and (select count(*) from canal_members
       where canal_id = p_canal and role = 'steward' and status = 'member' and user_id <> p_user) = 0 then
    raise exception 'لا تبقى ترعةٌ بلا قيّم.';
  end if;
  update canal_members set feddans = p_feddans, role = p_role
    where canal_id = p_canal and user_id = p_user and status = 'member';
  if not found then raise exception 'ليس عضواً في الترعة.'; end if;
end;
$$;

create or replace function public.canal_leave(p_canal uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if canal_role(p_canal) = 'steward' and (select count(*) from canal_members
       where canal_id = p_canal and role = 'steward' and status = 'member') = 1
     and (select count(*) from canal_members where canal_id = p_canal and status = 'member') > 1 then
    raise exception 'سلّم القيامة لعضوٍ آخر قبل أن تغادر.';
  end if;
  delete from canal_turns where canal_id = p_canal and user_id = auth.uid();
  delete from canal_members where canal_id = p_canal and user_id = auth.uid();
end;
$$;

-- الجدول كلّه يُكتب مرّةً واحدة: [{user_id, weekday, starts, ends}, …]. Replacing
-- the whole week at once is how a steward actually rewrites turns, and it keeps
-- a half-edited schedule from ever being what members read.
create or replace function public.canal_set_turns(p_canal uuid, p_turns jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  t jsonb;
begin
  if canal_role(p_canal) is distinct from 'steward' then
    raise exception 'الجدول لقيّم الترعة.';
  end if;
  if jsonb_array_length(p_turns) > 200 then raise exception 'جدولٌ أطول مما ينبغي.'; end if;
  delete from canal_turns where canal_id = p_canal;
  for t in select * from jsonb_array_elements(p_turns) loop
    if not exists (select 1 from canal_members where canal_id = p_canal
                   and user_id = (t->>'user_id')::uuid and status = 'member') then
      raise exception 'النوبة لعضوٍ في الترعة وحده.';
    end if;
    insert into canal_turns (canal_id, user_id, weekday, starts, ends)
    values (p_canal, (t->>'user_id')::uuid, (t->>'weekday')::smallint,
            (t->>'starts')::time, (t->>'ends')::time);
  end loop;
end;
$$;

-- ما يُعلن للناس عن الترع: الاسم والمكان والعدد والمساحة.
create or replace function public.canal_directory()
returns table (id uuid, name text, state text, locality text, description text,
               members bigint, feddans numeric)
language sql
stable
security definer
set search_path = public
as $$
  select c.id, c.name, c.state, c.locality, c.description,
         count(m.user_id) filter (where m.status = 'member'),
         coalesce(sum(m.feddans) filter (where m.status = 'member'), 0)
    from canals c left join canal_members m on m.canal_id = c.id
   group by c.id
   order by c.created_at desc;
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- نفيرُ الترعة: لا يُربط بترعةٍ إلا عضوُها
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.guard_nafir_call()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_open int;
begin
  if tg_op = 'INSERT' then
    new.organizer_id := auth.uid();
    new.status := 'open';
    new.outcome := null;
    new.attended := null;
    new.created_at := now();
    new.closed_at := null;
    if new.starts_on < current_date then
      raise exception 'لا يُدعى إلى نفيرٍ في يومٍ مضى.';
    end if;
    select count(*) into v_open from nafir_calls
      where organizer_id = auth.uid() and status = 'open';
    if v_open >= 5 then
      raise exception 'لديك خمس دعواتٍ مفتوحة. أغلق واحدةً قبل أن تفتح غيرها.';
    end if;
    -- A call attached to a canal appears on that canal's page, so only one of
    -- its members may attach it.
    if new.canal_id is not null
       and coalesce(canal_role(new.canal_id), 'pending') not in ('member','steward') then
      raise exception 'يُربط النفير بترعةٍ أنت عضوٌ فيها.';
    end if;
    return new;
  end if;

  new.id := old.id;
  new.organizer_id := old.organizer_id;
  new.created_at := old.created_at;
  new.canal_id := old.canal_id;
  if old.status <> 'open' and not is_admin() then
    raise exception 'هذه الدعوة أُغلقت.';
  end if;
  if new.status <> 'open' and old.status = 'open' then
    new.closed_at := now();
  end if;
  return new;
end;
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- الصلاحيات والإشعارات
-- ═══════════════════════════════════════════════════════════════════════════

revoke execute on function public.canal_role(uuid) from public, anon;
revoke execute on function public.canal_create(text, text, text, text, text, numeric) from public, anon;
revoke execute on function public.canal_request_join(uuid, text, numeric) from public, anon;
revoke execute on function public.canal_decide(uuid, uuid, boolean, numeric) from public, anon;
revoke execute on function public.canal_set_member(uuid, uuid, numeric, text) from public, anon;
revoke execute on function public.canal_leave(uuid) from public, anon;
revoke execute on function public.canal_set_turns(uuid, jsonb) from public, anon;

grant execute on function public.canal_role(uuid) to authenticated;
grant execute on function public.canal_create(text, text, text, text, text, numeric) to authenticated;
grant execute on function public.canal_request_join(uuid, text, numeric) to authenticated;
grant execute on function public.canal_decide(uuid, uuid, boolean, numeric) to authenticated;
grant execute on function public.canal_set_member(uuid, uuid, numeric, text) to authenticated;
grant execute on function public.canal_leave(uuid) to authenticated;
grant execute on function public.canal_set_turns(uuid, jsonb) to authenticated;
grant execute on function public.canal_directory() to anon, authenticated;

alter table public.notifications drop constraint notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check
  check (kind = any (array[
    'land_submitted','land_verified','land_rejected',
    'opportunity_submitted','opportunity_approved','opportunity_rejected',
    'lead_received','feedback_received','feedback_replied',
    'nafir_joined','faza_pledged','shura_answered',
    'judiyya_update','canal_update'
  ]));

comment on table public.canals is 'الترع: موردٌ مشترك. الاسم والمكان علنيّان، والأعضاء ونوباتهم للأعضاء.';
