-- الجودية: وساطةُ الأجاويد في نزاعٍ على ماءٍ أو حدٍّ أو مرعى — تُسجَّل ولا تُشهَّر.
--
-- البند ٤٣. مبدأ أوستروم السادس: «ساحاتٌ محليّةٌ رخيصةٌ سريعةٌ لحلّ النزاع».
-- والجودية هي تلك الساحة في السودان، وصفها الأدب هكذا (USIP Peaceworks 83؛
-- ACCORD 2012؛ Ibrahim 2013):
--
--   • الأجاويد شيوخٌ ووجهاءُ محايدون، ليسوا طرفاً في النزاع — «الحياد هو الأساس».
--   • الطرفان يلتزمان بقبول الحكم **قبل** سماعه.
--   • يُسمع الطرفان، ويأتي الحلّ «منهما» فيرضيان به، لا غالبٌ ولا مغلوب.
--   • وتُفضَّل على المحكمة لسرعتها ولبعدها عن الحكومة؛ والأهالي يريدون من
--     الحكومة أن «تعترف وتدعم، لا أن تفحص وتتحكّم».
--
-- فكلُّ ذلك هنا خطواتٌ لا يتخطّاها أحد:
--
--   ١) يفتح طرفٌ الطلب، ويُعطى رابطَ دعوةٍ يرسله للطرف الآخر.
--   ٢) يلتزم كلُّ طرفٍ بقبول الحكم قبل سماعه — ولا شيء يتقدّم قبل الالتزامين.
--   ٣) يُختار الأجاويد من سجلٍّ تحقّقت منه الإدارة؛ ولا يدخل أجويدٌ اللجنةَ إلا
--      إذا رضيه الطرفان كلاهما، وقَبِل هو، ولم يكن طرفاً.
--   ٤) يكتب أحدُ أجاويد اللجنة الصلح، ويُقرّه الطرفان كلٌّ باسمه — فيُختم.
--
-- الخصوصية: النزاعُ بين أهله. لا يرى الطلبَ إلا طرفاه وأجاويدُه والإدارة؛ وما
-- يُعلَن للناس عددٌ فقط (كم صلحاً خُتم)، لأنّ الصلح يُستر ولا يُشهَّر.
--
-- وليست محكمة: لا تحلّ محلّ القضاء في جنايةٍ أو حقٍّ لا يُتصالَح عليه، والصفحة
-- تقول ذلك قبل أن يُفتح أيُّ طلب.
--
-- كلُّ تغييرٍ يمرّ بدوالّ (rpc) تتحقّق من الخطوة ومن صاحبها؛ الجداول لا تُكتب
-- مباشرةً أصلاً. هكذا لا تحتاج كلُّ خطوةٍ سياسةَ RLS تحرس أعمدتها واحداً واحداً.

-- ═══════════════════════════════════════════════════════════════════════════
-- ١) سجلّ الأجاويد
-- ═══════════════════════════════════════════════════════════════════════════

create table public.judiyya_mediators (
  user_id      uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (length(btrim(display_name)) between 2 and 60),
  state        text not null check (is_sudan_state(state)),
  -- مَن هو ولماذا يُرضى به: «عمدة قرية كذا، صالحتُ في نزاعات ماءٍ عشرين سنة».
  about        text not null check (length(btrim(about)) between 20 and 500),
  created_at   timestamptz not null default now(),
  -- The administration confirms the person is who the about says. It does not
  -- choose mediators for anyone — the parties do that — it only keeps a
  -- stranger from presenting himself as an elder.
  verified_at  timestamptz
);

alter table public.judiyya_mediators enable row level security;

create policy judiyya_mediators_public_read on public.judiyya_mediators
  for select using (true);

-- ═══════════════════════════════════════════════════════════════════════════
-- ٢) الطلبات وأطرافها ولجانها
-- ═══════════════════════════════════════════════════════════════════════════

create table public.judiyya_cases (
  id            uuid primary key default gen_random_uuid(),
  opened_by     uuid not null references auth.users(id) on delete cascade,
  kind          text not null check (kind in ('water','boundary','grazing','contract','other')),
  title         text not null check (length(btrim(title)) between 5 and 120),
  summary       text not null check (length(btrim(summary)) between 20 and 2000),
  state         text not null check (is_sudan_state(state)),
  locality      text not null check (length(btrim(locality)) between 2 and 80),
  -- The link the opener sends to the other side. Unguessable; used once.
  invite_token  text not null unique default replace(gen_random_uuid()::text, '-', ''),
  status        text not null default 'forming'
                check (status in ('forming','active','settled','withdrawn')),
  settlement    text check (settlement is null or length(btrim(settlement)) between 20 and 3000),
  settled_by    uuid references auth.users(id),
  settlement_name text,
  settlement_at timestamptz,
  settled_at    timestamptz,
  created_at    timestamptz not null default now()
);

create table public.judiyya_parties (
  case_id      uuid not null references public.judiyya_cases(id) on delete cascade,
  side         text not null check (side in ('a','b')),
  user_id      uuid not null references auth.users(id) on delete cascade,
  display_name text not null check (length(btrim(display_name)) between 2 and 60),
  -- «ألتزم بقبول حكم الأجاويد قبل أن أسمعه» — the step the tradition makes
  -- first, and the one that makes the rest mean anything.
  committed_at timestamptz,
  -- The party's own «أقرّ بهذا الصلح», against the current settlement text.
  confirmed_at timestamptz,
  primary key (case_id, side),
  unique (case_id, user_id)
);

create table public.judiyya_panel (
  case_id      uuid not null references public.judiyya_cases(id) on delete cascade,
  mediator_id  uuid not null references public.judiyya_mediators(user_id) on delete cascade,
  approved_a   boolean not null default false,
  approved_b   boolean not null default false,
  accepted_at  timestamptz,
  primary key (case_id, mediator_id)
);

alter table public.judiyya_cases enable row level security;
alter table public.judiyya_parties enable row level security;
alter table public.judiyya_panel enable row level security;

create or replace function public.judiyya_can_see(p_case uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select is_admin()
      or exists (select 1 from judiyya_parties where case_id = p_case and user_id = auth.uid())
      or exists (select 1 from judiyya_panel where case_id = p_case and mediator_id = auth.uid());
$$;

-- Read only, and only by those inside the case. No insert/update/delete
-- policies: every change goes through the functions below. The policies are
-- for `authenticated` alone, so a visitor's read returns nothing rather than
-- a permission error from the membership check.
create policy judiyya_cases_inside on public.judiyya_cases
  for select to authenticated using (judiyya_can_see(id));
create policy judiyya_parties_inside on public.judiyya_parties
  for select to authenticated using (judiyya_can_see(case_id));
create policy judiyya_panel_inside on public.judiyya_panel
  for select to authenticated using (judiyya_can_see(case_id));

-- ═══════════════════════════════════════════════════════════════════════════
-- ٣) الخطوات
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.judiyya_side(p_case uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select side from judiyya_parties where case_id = p_case and user_id = auth.uid();
$$;

-- الأجويد يتطوّع: يكتب مَن هو، وتتحقّق منه الإدارة.
create or replace function public.judiyya_volunteer(p_name text, p_state text, p_about text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'سجّل الدخول أولاً.'; end if;
  insert into judiyya_mediators (user_id, display_name, state, about)
  values (auth.uid(), p_name, p_state, p_about)
  on conflict (user_id) do update
    set display_name = excluded.display_name,
        state = excluded.state,
        about = excluded.about,
        -- Rewriting who you are is a new claim; it is verified again.
        verified_at = null;
end;
$$;

create or replace function public.judiyya_verify_mediator(p_user uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_admin() then raise exception 'التحقّق للإدارة وحدها.'; end if;
  update judiyya_mediators set verified_at = now() where user_id = p_user;
end;
$$;

create or replace function public.judiyya_open(
  p_kind text, p_title text, p_summary text, p_state text, p_locality text, p_name text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_open int;
begin
  if auth.uid() is null then raise exception 'سجّل الدخول أولاً.'; end if;
  select count(*) into v_open from judiyya_cases
    where opened_by = auth.uid() and status in ('forming','active');
  if v_open >= 3 then
    raise exception 'لديك ثلاثة طلبات جوديةٍ جارية. أتمّ واحداً قبل أن تفتح غيره.';
  end if;
  insert into judiyya_cases (opened_by, kind, title, summary, state, locality)
  values (auth.uid(), p_kind, p_title, p_summary, p_state, p_locality)
  returning id into v_id;
  insert into judiyya_parties (case_id, side, user_id, display_name)
  values (v_id, 'a', auth.uid(), p_name);
  return v_id;
end;
$$;

-- الطرفُ الآخر يدخل برابط الدعوة. The token is the whole of the permission:
-- whoever holds the link the opener sent is the other side, once.
create or replace function public.judiyya_join(p_token text, p_name text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_case judiyya_cases%rowtype;
begin
  if auth.uid() is null then raise exception 'سجّل الدخول أولاً.'; end if;
  select * into v_case from judiyya_cases where invite_token = p_token;
  if not found then raise exception 'رابط الدعوة غير صالح.'; end if;
  if v_case.status <> 'forming' then raise exception 'هذا الطلب لم يعد يقبل طرفاً.'; end if;
  if exists (select 1 from judiyya_parties where case_id = v_case.id and user_id = auth.uid()) then
    raise exception 'أنت طرفٌ في هذا الطلب أصلاً.';
  end if;
  if exists (select 1 from judiyya_parties where case_id = v_case.id and side = 'b') then
    raise exception 'دخل الطرفُ الآخر من قبل.';
  end if;
  insert into judiyya_parties (case_id, side, user_id, display_name)
  values (v_case.id, 'b', auth.uid(), p_name);
  -- The link has done its work; a second holder must not find it open.
  update judiyya_cases set invite_token = replace(gen_random_uuid()::text, '-', '')
    where id = v_case.id;
  begin
    insert into notifications (recipient_id, kind, title, body, link)
    values (v_case.opened_by, 'judiyya_update', 'دخل الطرفُ الآخر طلبَ الجودية',
            left(v_case.title, 300), '/nafir/judiyya/' || v_case.id);
  exception when others then
    raise warning 'judiyya join notification failed: %', sqlerrm;
  end;
  return v_case.id;
end;
$$;

-- الالتزام بقبول الحكم قبل سماعه. When both sides have committed, the case is
-- active and a panel can be formed.
create or replace function public.judiyya_commit(p_case uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_side text := judiyya_side(p_case);
begin
  if v_side is null then raise exception 'لست طرفاً في هذا الطلب.'; end if;
  if (select status from judiyya_cases where id = p_case) <> 'forming' then
    raise exception 'مضى وقتُ الالتزام.';
  end if;
  if not exists (select 1 from judiyya_parties where case_id = p_case and side = 'b') then
    raise exception 'ينتظر الطلبُ دخولَ الطرف الآخر.';
  end if;
  update judiyya_parties set committed_at = coalesce(committed_at, now())
    where case_id = p_case and side = v_side;
  if (select count(*) from judiyya_parties where case_id = p_case and committed_at is not null) = 2 then
    update judiyya_cases set status = 'active' where id = p_case;
  end if;
end;
$$;

-- كلُّ طرفٍ يرضى أجويداً أو يسحب رضاه. A mediator sits only when both sides
-- approve and he has accepted; neither side can seat anyone alone.
create or replace function public.judiyya_approve(p_case uuid, p_mediator uuid, p_on boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_side text := judiyya_side(p_case);
begin
  if v_side is null then raise exception 'لست طرفاً في هذا الطلب.'; end if;
  if (select status from judiyya_cases where id = p_case) <> 'active' then
    raise exception 'تُختار اللجنة بعد التزام الطرفين وقبل الصلح.';
  end if;
  if not exists (select 1 from judiyya_mediators where user_id = p_mediator and verified_at is not null) then
    raise exception 'هذا الأجويد لم تتحقّق منه الإدارة بعد.';
  end if;
  if exists (select 1 from judiyya_parties where case_id = p_case and user_id = p_mediator) then
    raise exception 'الأجويد لا يكون طرفاً — الحيادُ هو الأساس.';
  end if;
  insert into judiyya_panel (case_id, mediator_id) values (p_case, p_mediator)
    on conflict do nothing;
  if v_side = 'a' then
    update judiyya_panel set approved_a = p_on where case_id = p_case and mediator_id = p_mediator;
  else
    update judiyya_panel set approved_b = p_on where case_id = p_case and mediator_id = p_mediator;
  end if;
  -- Once both sides want him, he is asked.
  if exists (select 1 from judiyya_panel where case_id = p_case and mediator_id = p_mediator
             and approved_a and approved_b and accepted_at is null) then
    begin
      insert into notifications (recipient_id, kind, title, body, link)
      values (p_mediator, 'judiyya_update', 'اختارك الطرفان أجويداً',
              (select left(title, 300) from judiyya_cases where id = p_case),
              '/nafir/judiyya/' || p_case);
    exception when others then
      raise warning 'judiyya panel notification failed: %', sqlerrm;
    end;
  end if;
end;
$$;

create or replace function public.judiyya_accept(p_case uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update judiyya_panel set accepted_at = coalesce(accepted_at, now())
    where case_id = p_case and mediator_id = auth.uid() and approved_a and approved_b;
  if not found then raise exception 'لم يخترك الطرفان كلاهما بعد.'; end if;
end;
$$;

-- أجويدٌ من اللجنة يكتب الصلح. Writing it (or rewriting it) clears both
-- confirmations: a party confirms a text, not a case.
create or replace function public.judiyya_write_settlement(p_case uuid, p_text text, p_name text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from judiyya_panel where case_id = p_case and mediator_id = auth.uid()
                 and approved_a and approved_b and accepted_at is not null) then
    raise exception 'يكتب الصلحَ أجويدٌ رضيه الطرفان وقَبِل.';
  end if;
  if (select status from judiyya_cases where id = p_case) <> 'active' then
    raise exception 'هذا الطلب ليس جارياً.';
  end if;
  update judiyya_cases
     set settlement = p_text, settled_by = auth.uid(), settlement_name = p_name,
         settlement_at = now()
   where id = p_case;
  update judiyya_parties set confirmed_at = null where case_id = p_case;
  begin
    insert into notifications (recipient_id, kind, title, body, link)
    select user_id, 'judiyya_update', 'كتب الأجاويد الصلح — اقرأه وأقرّه',
           left(p_text, 300), '/nafir/judiyya/' || p_case
    from judiyya_parties where case_id = p_case;
  exception when others then
    raise warning 'judiyya settlement notification failed: %', sqlerrm;
  end;
end;
$$;

-- كلُّ طرفٍ يُقرّ الصلحَ باسمه. When both have, it is sealed.
create or replace function public.judiyya_confirm(p_case uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_side text := judiyya_side(p_case);
begin
  if v_side is null then raise exception 'لست طرفاً في هذا الطلب.'; end if;
  if (select settlement from judiyya_cases where id = p_case and status = 'active') is null then
    raise exception 'لا صلحَ مكتوباً بعد.';
  end if;
  update judiyya_parties set confirmed_at = now() where case_id = p_case and side = v_side;
  if (select count(*) from judiyya_parties where case_id = p_case and confirmed_at is not null) = 2 then
    update judiyya_cases set status = 'settled', settled_at = now() where id = p_case;
  end if;
end;
$$;

create or replace function public.judiyya_withdraw(p_case uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if judiyya_side(p_case) is null and not is_admin() then
    raise exception 'لست طرفاً في هذا الطلب.';
  end if;
  update judiyya_cases set status = 'withdrawn'
    where id = p_case and status in ('forming','active');
  if not found then raise exception 'هذا الطلب ختم أو سُحب.'; end if;
end;
$$;

-- ما يُعلن للناس: أعدادٌ لا أسماء.
create or replace function public.judiyya_counts()
returns table (mediators_verified bigint, cases_active bigint, cases_settled bigint)
language sql
stable
security definer
set search_path = public
as $$
  select (select count(*) from judiyya_mediators where verified_at is not null),
         (select count(*) from judiyya_cases where status in ('forming','active')),
         (select count(*) from judiyya_cases where status = 'settled');
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- ٤) الصلاحيات
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Functions are executable by PUBLIC by default; each is narrowed to who may
-- call it. The steps need a session; the counts do not.

revoke execute on function public.judiyya_can_see(uuid) from public, anon;
revoke execute on function public.judiyya_side(uuid) from public, anon;
revoke execute on function public.judiyya_volunteer(text, text, text) from public, anon;
revoke execute on function public.judiyya_verify_mediator(uuid) from public, anon;
revoke execute on function public.judiyya_open(text, text, text, text, text, text) from public, anon;
revoke execute on function public.judiyya_join(text, text) from public, anon;
revoke execute on function public.judiyya_commit(uuid) from public, anon;
revoke execute on function public.judiyya_approve(uuid, uuid, boolean) from public, anon;
revoke execute on function public.judiyya_accept(uuid) from public, anon;
revoke execute on function public.judiyya_write_settlement(uuid, text, text) from public, anon;
revoke execute on function public.judiyya_confirm(uuid) from public, anon;
revoke execute on function public.judiyya_withdraw(uuid) from public, anon;

grant execute on function public.judiyya_can_see(uuid) to authenticated;
grant execute on function public.judiyya_side(uuid) to authenticated;
grant execute on function public.judiyya_volunteer(text, text, text) to authenticated;
grant execute on function public.judiyya_verify_mediator(uuid) to authenticated;
grant execute on function public.judiyya_open(text, text, text, text, text, text) to authenticated;
grant execute on function public.judiyya_join(text, text) to authenticated;
grant execute on function public.judiyya_commit(uuid) to authenticated;
grant execute on function public.judiyya_approve(uuid, uuid, boolean) to authenticated;
grant execute on function public.judiyya_accept(uuid) to authenticated;
grant execute on function public.judiyya_write_settlement(uuid, text, text) to authenticated;
grant execute on function public.judiyya_confirm(uuid) to authenticated;
grant execute on function public.judiyya_withdraw(uuid) to authenticated;
grant execute on function public.judiyya_counts() to anon, authenticated;

-- الإشعارات: نوعٌ واحدٌ لكلّ خطوات الجودية.
alter table public.notifications drop constraint notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check
  check (kind = any (array[
    'land_submitted','land_verified','land_rejected',
    'opportunity_submitted','opportunity_approved','opportunity_rejected',
    'lead_received','feedback_received','feedback_replied',
    'nafir_joined','faza_pledged','shura_answered',
    'judiyya_update'
  ]));

comment on table public.judiyya_cases is 'الجودية: وساطة الأجاويد. لا يراها إلا طرفاها وأجاويدها والإدارة.';
comment on table public.judiyya_mediators is 'سجلّ الأجاويد المتطوّعين، يُتحقَّق منهم قبل أن يُختاروا.';
