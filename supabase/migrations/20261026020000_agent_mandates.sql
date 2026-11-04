-- وضع الوكيل (البند ١٦٩، الغنيمة ٧ من Apollo وMercy Corps).
--
-- شركةٌ أو جمعيّةٌ موثّقة تعمل عن مزارعٍ لا يحسن التطبيق أو لا يصل إليه: تسجّل أرضه وترفع أوراقها، وتتابع مواسمه
-- وقطيعه. ولا يكون ذلك إلا بإذنٍ مسجَّل يعطيه المزارع من حسابه هو:
--   - الوكيل يطلب برقم جوّال المزارع، ويقول لماذا، ويختار ما يطلبه (الأراضي، المواسم، القطيع)؛
--   - المزارع يقبل أو يعتذر، ولا يرى الوكيلُ اسمه قبل القبول؛
--   - يُنهيه أيٌّ منهما متى شاء، فيسقط كلّ ما كان للوكيل في الحال؛
--   - وكلّ ما يكتبه الوكيل باسم المزارع يُسجَّل في سجلٍّ لا يُعدَّل، ويُخبَر به المزارع.
--
-- ما يملكه الوكيل في هذه الشريحة: قراءةُ ما أُذن له فيه، وتسجيلُ أرضٍ للمزارع وتعديلُها ورفعُ مستنداتها. ولا حذفَ
-- لشيءٍ من مال المزارع، ولا نقلَ لأرضٍ من صاحبها إلى غيره (حارسٌ جديد على `lands`). والمواسم والقطيع قراءةٌ فقط
-- حتى الآن: كتابتُها تمرّ بالدفتر والمراحل وحرّاسها، فلها شريحتها.
--
-- والوكيل شركةٌ في `partner_companies` موثّقةٌ وفعّالة؛ يتصرّف عنها صاحبُ حسابها. فإن سُحب توثيقها أو عُطّلت سقط
-- إذنها بلا خطوةٍ أخرى، لأنّ الفحص يقرأ حالها في كلّ مرّة. وكذلك حسابُ مزارعٍ أُغلق.

-- ── نوع الإشعار ─────────────────────────────────────────────────────────────

do $$
declare v_def text;
begin
  select pg_get_constraintdef(oid) into v_def
    from pg_constraint
   where conname = 'notifications_kind_check' and conrelid = 'public.notifications'::regclass;
  -- The production check lists every kind; one written another way (the gates' base schema) is left alone.
  if v_def like '%ARRAY[%' and v_def not like '%agent_mandate%' then
    execute 'alter table public.notifications drop constraint notifications_kind_check';
    execute 'alter table public.notifications add constraint notifications_kind_check '
         || regexp_replace(v_def, '\]\)\)\)\s*$', ', ''agent_mandate''::text])))');
    select pg_get_constraintdef(oid) into v_def
      from pg_constraint
     where conname = 'notifications_kind_check' and conrelid = 'public.notifications'::regclass;
    if v_def not like '%agent_mandate%' then
      raise exception 'لم يُضَف نوع الإشعار agent_mandate';
    end if;
  end if;
end $$;

-- ── الإذن ───────────────────────────────────────────────────────────────────

create table public.agent_mandates (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null references public.partner_companies(id) on delete cascade,
  farmer_id     uuid not null references auth.users(id) on delete cascade,
  scopes        text[] not null
                check (cardinality(scopes) between 1 and 3 and scopes <@ array['lands', 'seasons', 'herds']),
  -- لماذا يطلب: يقرؤه المزارع قبل أن يقبل.
  note          text not null check (length(btrim(note)) between 10 and 300),
  -- آخر أربعة أرقامٍ من الجوّال الذي كُتب، ليعرف الوكيل أيّ طلبٍ هذا قبل أن يُقبل.
  phone_tail    text not null check (phone_tail ~ '^[0-9]{4}$'),
  status        text not null default 'pending'
                check (status in ('pending', 'active', 'declined', 'withdrawn', 'revoked')),
  requested_by  uuid not null references auth.users(id),
  requested_at  timestamptz not null default now(),
  answered_at   timestamptz,
  ended_at      timestamptz,
  ended_by      uuid references auth.users(id),
  check ((answered_at is not null) = (status in ('active', 'declined', 'revoked'))),
  check ((ended_at is not null) = (status in ('withdrawn', 'revoked'))),
  check ((ended_by is not null) = (ended_at is not null))
);

-- طلبٌ مفتوحٌ واحد أو إذنٌ قائمٌ واحد بين الوكيل والمزارع.
create unique index agent_mandates_open on public.agent_mandates (company_id, farmer_id)
  where status in ('pending', 'active');
create index agent_mandates_farmer on public.agent_mandates (farmer_id) where status in ('pending', 'active');

alter table public.agent_mandates enable row level security;

-- لا يكتب فيه أحدٌ إلا بالدوالّ أدناه، ولا يقرؤه زائر.
revoke all on public.agent_mandates from anon;
revoke insert, update, delete, truncate on public.agent_mandates from authenticated;
-- Since 20261024030000 a new table is readable by nobody until granted (audit db-b-2): the policy picks the rows.
grant select on public.agent_mandates to authenticated;

-- The company side is asked through owns_partner_company() (security definer): partner_companies.owner_id is withheld
-- from members by 20261025230100, and a policy's subquery reads as the reader (audit db-b-3).
create policy agent_mandates_read on public.agent_mandates
  for select to authenticated
  using (farmer_id = auth.uid()
         or owns_partner_company(company_id)
         or is_admin());

-- ── السجلّ ──────────────────────────────────────────────────────────────────

-- ما كتبه الوكيل باسم المزارع. يُلحَق ولا يُعدَّل ولا يُحذف، حتى بعد انتهاء الإذن.
create table public.agent_actions (
  id          bigint generated always as identity primary key,
  mandate_id  uuid not null references public.agent_mandates(id) on delete restrict,
  agent_id    uuid not null references auth.users(id),
  farmer_id   uuid not null references auth.users(id),
  subject     text not null check (subject in ('land', 'land_document')),
  subject_id  uuid not null,
  action      text not null check (action in ('insert', 'update')),
  at          timestamptz not null default now()
);

create index agent_actions_farmer on public.agent_actions (farmer_id, at desc);
create index agent_actions_mandate on public.agent_actions (mandate_id, at desc);

alter table public.agent_actions enable row level security;
revoke all on public.agent_actions from anon;
revoke insert, update, delete, truncate on public.agent_actions from authenticated;
grant select on public.agent_actions to authenticated;

create policy agent_actions_read on public.agent_actions
  for select to authenticated
  using (farmer_id = auth.uid() or agent_id = auth.uid() or is_admin());

create function public.agent_actions_keep()
returns trigger
language plpgsql
as $$
begin
  raise exception 'سجلّ الوكيل يُلحَق ولا يُعدَّل.';
end $$;

create trigger agent_actions_keep
  before update or delete on public.agent_actions
  for each row execute function public.agent_actions_keep();

-- ── الفحص الذي تقرؤه السياسات ───────────────────────────────────────────────

-- الإذن القائم الذي يعمل به المنادي عن هذا المزارع في هذا النطاق، أو لا شيء.
create function public.agent_mandate_for(p_farmer uuid, p_scope text)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select m.id
    from agent_mandates m
    join partner_companies c on c.id = m.company_id
   where m.farmer_id = p_farmer
     and m.status = 'active'
     and p_scope = any (m.scopes)
     and c.owner_id = auth.uid()
     and c.verified_at is not null
     and c.active
     and not exists (select 1 from closed_accounts x where x.user_id = m.farmer_id)
   limit 1
$$;

create function public.is_agent_for(p_farmer uuid, p_scope text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_farmer is not null and p_farmer <> auth.uid() and public.agent_mandate_for(p_farmer, p_scope) is not null
$$;

revoke execute on function public.agent_mandate_for(uuid, text) from public, anon;
revoke execute on function public.is_agent_for(uuid, text) from public, anon;
grant execute on function public.agent_mandate_for(uuid, text) to authenticated;
grant execute on function public.is_agent_for(uuid, text) to authenticated;

-- ── ما يراه الوكيل ويكتبه ───────────────────────────────────────────────────

create policy lands_agent_read on public.lands
  for select to authenticated using (public.is_agent_for(owner_id, 'lands'));
create policy lands_agent_insert on public.lands
  for insert to authenticated with check (public.is_agent_for(owner_id, 'lands'));
create policy lands_agent_update on public.lands
  for update to authenticated
  using (public.is_agent_for(owner_id, 'lands'))
  with check (public.is_agent_for(owner_id, 'lands'));

create policy land_documents_agent_read on public.land_documents
  for select to authenticated
  using (exists (select 1 from public.lands l
                  where l.id = land_documents.land_id and public.is_agent_for(l.owner_id, 'lands')));
create policy land_documents_agent_insert on public.land_documents
  for insert to authenticated
  with check (exists (select 1 from public.lands l
                       where l.id = land_documents.land_id and public.is_agent_for(l.owner_id, 'lands')));

-- المواسم والقطيع لا سياسة لها هنا بل دالّتان (في آخر الملفّ): صفحات «مواسمي» و«قطيعي» تقرأ كلّ ما تسمح به
-- السياسات، فلو سُمح للوكيل بها لاختلطت مواسم مزارعيه بمواسمه هو.

-- أرضٌ لا تنتقل من صاحبها بيد أحدٍ غير الإدارة. لم يكن لهذا حارس لأنّ السياسة الوحيدة كانت تُلزم أن يكون الصفّ
-- الجديد لصاحبه؛ أمّا الوكيل فيعمل عن أكثر من مزارع، فلولا هذا لنقل أرضاً من أحدهم إلى آخر.
create function public.lands_owner_fixed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.owner_id is distinct from old.owner_id and auth.uid() is not null and not is_admin() then
    raise exception 'الأرض لا تنتقل من صاحبها.';
  end if;
  return new;
end $$;

create trigger lands_owner_fixed
  before update on public.lands
  for each row execute function public.lands_owner_fixed();

-- ما يكتبه الوكيل يُسجَّل، وتسجيلُ أرضٍ باسم المزارع يُخبَر به.
create function public.agent_action_log()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_farmer uuid;
  v_land uuid;
  v_mandate uuid;
  v_company text;
  v_subject text := case tg_table_name when 'lands' then 'land' else 'land_document' end;
begin
  if auth.uid() is null then
    return null;
  end if;
  if tg_table_name = 'lands' then
    -- A document added recounts the land's papers; that is the document's line in the log, not a second one.
    if tg_op = 'UPDATE' and (to_jsonb(new) - 'documents_on_file') = (to_jsonb(old) - 'documents_on_file') then
      return null;
    end if;
    v_farmer := new.owner_id;
    v_land := new.id;
  else
    select l.owner_id into v_farmer from lands l where l.id = new.land_id;
    v_land := new.land_id;
  end if;
  if v_farmer is null or v_farmer = auth.uid() then
    return null;
  end if;
  v_mandate := public.agent_mandate_for(v_farmer, 'lands');
  if v_mandate is null then
    return null;   -- the admin, or the server's key
  end if;
  insert into agent_actions (mandate_id, agent_id, farmer_id, subject, subject_id, action)
  values (v_mandate, auth.uid(), v_farmer, v_subject, new.id, lower(tg_op));

  if tg_table_name = 'lands' and tg_op = 'INSERT' then
    select c.name into v_company
      from agent_mandates m join partner_companies c on c.id = m.company_id
     where m.id = v_mandate;
    perform public.notify_user(
      v_farmer, 'agent_mandate', 'سجّل وكيلك أرضاً باسمك: ' || new.name,
      'سجّلتها «' || v_company || '» بالإذن الذي أعطيتها. تراها في «أراضيّ»، وما كتبه الوكيل كلّه في «وكلائي».',
      '/lands/' || v_land);
  end if;
  return null;
end $$;

create trigger lands_agent_log
  after insert or update on public.lands
  for each row execute function public.agent_action_log();
create trigger land_documents_agent_log
  after insert on public.land_documents
  for each row execute function public.agent_action_log();

-- ── الطلب والجواب والإنهاء ──────────────────────────────────────────────────

-- The last nine digits of a Sudanese number are the number, whether it was typed as 09…, 2499… or +2499….
create function public.phone_key(p text)
returns text
language sql
immutable
as $$
  select nullif(right(regexp_replace(coalesce(p, ''), '\D', '', 'g'), 9), '')
$$;

create function public.agent_scopes_label(p_scopes text[])
returns text
language sql
immutable
as $$
  select string_agg(case s when 'lands' then 'أراضيك' when 'seasons' then 'مواسمك' else 'قطيعك' end, ' و'
                    order by array_position(array['lands', 'seasons', 'herds'], s))
    from unnest(p_scopes) s
$$;

create function public.agent_mandate_request(p_phone text, p_scopes text[], p_note text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company partner_companies%rowtype;
  v_key text := public.phone_key(p_phone);
  v_farmers uuid[];
  v_id uuid;
begin
  select * into v_company from partner_companies
   where owner_id = auth.uid() and verified_at is not null and active;
  if not found then
    raise exception 'وضع الوكيل لشركةٍ أو جمعيّةٍ موثّقة: سجّلها في «الشركاء» وانتظر توثيقها.';
  end if;
  if v_key is null or length(v_key) < 9 then
    raise exception 'اكتب رقم جوّال المزارع كاملاً.';
  end if;
  if p_scopes is null or cardinality(p_scopes) = 0 then
    raise exception 'اختر ما تطلب الإذن فيه.';
  end if;
  -- A company writing to strangers by the hundred is not acting for farmers it knows.
  if (select count(*) from agent_mandates
       where company_id = v_company.id and requested_at > now() - interval '1 day') >= 30 then
    raise exception 'ثلاثون طلباً في اليوم حدُّ الوكيل. أكمل غداً.';
  end if;

  select array_agg(distinct x.id) into v_farmers from (
    select p.id from profiles p where public.phone_key(p.phone) = v_key
    union
    select u.id from auth.users u where public.phone_key(u.phone) = v_key
  ) x
  where x.id <> auth.uid()
    and not exists (select 1 from closed_accounts c where c.user_id = x.id);

  if v_farmers is null then
    raise exception 'لا حساب بهذا الرقم. يسجّل المزارع أوّلاً برقمه، ثمّ تطلب الإذن.';
  end if;
  if cardinality(v_farmers) > 1 then
    raise exception 'لهذا الرقم أكثر من حساب؛ تواصل مع الإدارة لتحدّد أيّها.';
  end if;

  if exists (select 1 from agent_mandates
              where company_id = v_company.id and farmer_id = v_farmers[1] and status in ('pending', 'active')) then
    raise exception 'بينك وبين صاحب هذا الرقم طلبٌ مفتوح أو إذنٌ قائم.';
  end if;

  insert into agent_mandates (company_id, farmer_id, scopes, note, phone_tail, requested_by)
  values (v_company.id, v_farmers[1], (select array_agg(distinct s order by s) from unnest(p_scopes) s),
          btrim(p_note), right(v_key, 4), auth.uid())
  returning id into v_id;

  perform public.notify_user(
    v_farmers[1], 'agent_mandate', '«' || v_company.name || '» تطلب أن تعمل عنك',
    'تطلب إذناً في: ' || public.agent_scopes_label(p_scopes) || '. وسببها: ' || btrim(p_note)
      || '. اقبل أو اعتذر من «وكلائي»، وتُنهيه متى شئت.',
    '/account/agents');
  return v_id;
end $$;

create function public.agent_mandate_answer(p_id uuid, p_accept boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  m agent_mandates%rowtype;
  v_owner uuid;
begin
  select * into m from agent_mandates where id = p_id and farmer_id = auth.uid() for update;
  if not found then
    raise exception 'لا طلب بهذا.';
  end if;
  if m.status <> 'pending' then
    raise exception 'أُجيب هذا الطلب أو سُحب.';
  end if;
  update agent_mandates
     set status = case when p_accept then 'active' else 'declined' end, answered_at = now()
   where id = p_id;
  select owner_id into v_owner from partner_companies where id = m.company_id;
  perform public.notify_user(
    v_owner, 'agent_mandate',
    case when p_accept then 'قبل المزارع إذنك (…' || m.phone_tail || ')' else 'اعتذر صاحب الرقم …' || m.phone_tail end,
    case when p_accept then 'صرت تعمل عنه في: ' || public.agent_scopes_label(m.scopes) || '. تجده في «مزارعيّ».'
         else 'لم يقبل الإذن. لا شيء عليك.' end,
    '/agent');
end $$;

-- Either side ends it: the company withdraws what is still pending, and either ends what is active.
create function public.agent_mandate_end(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  m agent_mandates%rowtype;
  v_owner uuid;
  v_name text;
  v_farmer_side boolean;
begin
  select * into m from agent_mandates where id = p_id for update;
  if not found then
    raise exception 'لا إذن بهذا.';
  end if;
  select owner_id, name into v_owner, v_name from partner_companies where id = m.company_id;
  v_farmer_side := m.farmer_id = auth.uid();
  if not v_farmer_side and v_owner is distinct from auth.uid() then
    raise exception 'لا إذن بهذا.';
  end if;
  if m.status = 'pending' and not v_farmer_side then
    update agent_mandates set status = 'withdrawn', ended_at = now(), ended_by = auth.uid() where id = p_id;
    return;
  end if;
  if m.status <> 'active' then
    raise exception 'هذا الإذن ليس قائماً.';
  end if;
  update agent_mandates set status = 'revoked', ended_at = now(), ended_by = auth.uid() where id = p_id;
  if v_farmer_side then
    perform public.notify_user(v_owner, 'agent_mandate', 'أنهى المزارع إذنك (…' || m.phone_tail || ')',
      'لم تعد تعمل عنه. ما سجّلته باسمه يبقى له.', '/agent');
  else
    perform public.notify_user(m.farmer_id, 'agent_mandate', 'أنهت «' || v_name || '» عملها عنك',
      'لم تعد تعمل عنك. ما سجّلته باسمك يبقى لك، وسجلّه في «وكلائي».', '/account/agents');
  end if;
end $$;

-- ── ما يقرؤه كلّ طرف ────────────────────────────────────────────────────────

-- للوكيل: طلباته وأذوناته؛ واسم المزارع وجوّاله لا يظهران إلا بعد قبوله وما دام الإذن قائماً.
create function public.agent_my_farmers()
returns table (id uuid, farmer_id uuid, full_name text, phone text, phone_tail text, scopes text[], status text,
               note text, requested_at timestamptz, answered_at timestamptz, ended_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select m.id,
         case when m.status = 'active' then m.farmer_id end,
         case when m.status = 'active' then p.full_name end,
         case when m.status = 'active' then p.phone end,
         m.phone_tail, m.scopes, m.status, m.note, m.requested_at, m.answered_at, m.ended_at
    from agent_mandates m
    join partner_companies c on c.id = m.company_id
    left join profiles p on p.id = m.farmer_id
   where c.owner_id = auth.uid()
   order by (m.status = 'active') desc, (m.status = 'pending') desc, m.requested_at desc
$$;

-- للمزارع: من طلب أن يعمل عنه، وما أُذن فيه، وحاله.
create function public.agent_my_agents()
returns table (id uuid, company_name text, company_phone text, scopes text[], status text, note text,
               requested_at timestamptz, answered_at timestamptz, ended_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select m.id, c.name, c.phone, m.scopes, m.status, m.note, m.requested_at, m.answered_at, m.ended_at
    from agent_mandates m
    join partner_companies c on c.id = m.company_id
   where m.farmer_id = auth.uid()
   order by (m.status = 'pending') desc, (m.status = 'active') desc, m.requested_at desc
$$;

-- مواسم المزارع وقطيعه، لمن أُذن له فيها، بتقدّم مراحلها.
create function public.agent_farmer_seasons(p_farmer uuid)
returns table (id uuid, name text, crop_key text, feddans numeric, planting_date date, harvest_date date, status text,
               land_id uuid, stages_done integer, stages_total integer)
language sql
stable
security definer
set search_path = public
as $$
  select s.id, s.name, s.crop_key, s.feddans, s.planting_date, s.harvest_date, s.status, s.land_id,
         (select count(*)::int from season_stages g where g.season_id = s.id and g.completed),
         (select count(*)::int from season_stages g where g.season_id = s.id)
    from seasons s
   where s.owner_id = p_farmer and public.is_agent_for(p_farmer, 'seasons')
   order by s.planting_date desc
$$;

create function public.agent_farmer_herds(p_farmer uuid)
returns table (id uuid, name text, species text, head_count integer, start_date date, end_date date, status text,
               stages_done integer, stages_total integer)
language sql
stable
security definer
set search_path = public
as $$
  select h.id, h.name, h.species::text, h.head_count, h.start_date, h.end_date, h.status,
         (select count(*)::int from herd_stages g where g.herd_id = h.id and g.completed),
         (select count(*)::int from herd_stages g where g.herd_id = h.id)
    from herds h
   where h.owner_id = p_farmer and public.is_agent_for(p_farmer, 'herds')
   order by h.start_date desc
$$;

revoke execute on function public.agent_farmer_seasons(uuid) from public, anon;
revoke execute on function public.agent_farmer_herds(uuid) from public, anon;
grant execute on function public.agent_farmer_seasons(uuid) to authenticated;
grant execute on function public.agent_farmer_herds(uuid) to authenticated;

revoke execute on function public.agent_mandate_request(text, text[], text) from public, anon;
revoke execute on function public.agent_mandate_answer(uuid, boolean) from public, anon;
revoke execute on function public.agent_mandate_end(uuid) from public, anon;
revoke execute on function public.agent_my_farmers() from public, anon;
revoke execute on function public.agent_my_agents() from public, anon;
grant execute on function public.agent_mandate_request(text, text[], text) to authenticated;
grant execute on function public.agent_mandate_answer(uuid, boolean) to authenticated;
grant execute on function public.agent_mandate_end(uuid) to authenticated;
grant execute on function public.agent_my_farmers() to authenticated;
grant execute on function public.agent_my_agents() to authenticated;
