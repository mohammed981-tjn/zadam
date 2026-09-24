-- «النفير»: القيمُ آلياتٍ تعمل، لا نصّاً يُعلَّق.
--
-- طلب المالك (24 سبتمبر 2026) منظومةَ قيمٍ تدفع الإرادة: مرجعيّةٌ فكرية، وقيمٌ
-- للقادة، وقيمٌ للقاعدة، وخطّةُ تعاونٍ مشترك — ثمّ طلب أن تُبنى في المنصّة
-- «لا كنصٍّ ولكن كمشروع». وقيمةٌ لا يُعمَل بها لا تبقى؛ فكلُّ جدولٍ هنا هو قيمةٌ
-- واحدة صارت فعلاً يُسجَّل ويُرى. التصميم وأسبابه في docs/nafir-design-ar.md.
--
--   الميثاق            charter_signatures        الأمانة والقدوة: يُوقَّع علناً، والقادة أوّلاً
--   النفير             nafir_calls / nafir_joins  التكافل بالعمل: دعوةٌ، ومَن لبّاها، وما أُنجز
--   الفزعة             faza_requests / faza_pledges  نجدةُ المصاب، والوفاءُ بالوعد يُحسب
--   الشورى             shura_items / shura_supports  يُسأل القادة علناً، ويُرى مَن أجاب ومَن سكت
--   نبضُ الثقة         trust_pulse                أربعة أسئلةٍ في الربع، تُعلَن مجمّعةً فقط
--   المؤشّرات          nafir_indicators()         الثقةُ والمشاركةُ والأثر، أرقاماً للجميع
--
-- WHAT IS PUBLIC AND WHY
--
-- Every row a person writes here carries a `display_name` they typed, and
-- that name — not their profile — is what the public sees. profiles stay
-- private (profiles_select is own-row or admin); consent to be seen is given
-- per act, by writing the name under it. Nothing here stores a phone number:
-- the organiser learns who answered through an in-platform notification, and
-- the conversation moves to whatever channel the two choose.
--
-- WHY NO MONEY
--
-- The plan speaks of a mutual-aid fund. A fund that holds money is a
-- regulated activity and a target; pledges of labour, tools, seed, transport
-- and advice carry the same value — rallying to a neighbour — without either.
-- faza_pledges.kind has no 'cash'.

-- ═══════════════════════════════════════════════════════════════════════════
-- ٠) قائمةٌ مشتركة: الولايات
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Free-text places make every filter a guess. The eighteen states are a closed
-- list; the locality within them stays free text.

create or replace function public.is_sudan_state(s text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select s = any (array[
    'الخرطوم','الجزيرة','سنار','النيل الأزرق','النيل الأبيض','القضارف','كسلا',
    'البحر الأحمر','نهر النيل','الشمالية','شمال كردفان','جنوب كردفان','غرب كردفان',
    'شمال دارفور','جنوب دارفور','شرق دارفور','غرب دارفور','وسط دارفور'
  ]);
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- ١) الميثاق
-- ═══════════════════════════════════════════════════════════════════════════

create table public.charter_signatures (
  user_id        uuid not null references auth.users(id) on delete cascade,
  -- The text lives in src/lib/nafir.ts with a version number. A signature is
  -- to a version: if the charter changes, old signatures still say what was
  -- signed, and nobody is counted as agreeing to words they never read.
  charter_version smallint not null check (charter_version between 1 and 100),
  -- «قائد» is self-declared — a cooperative head, a sheikh, a scheme manager.
  -- It grants nothing. What it does is put the name in the leaders' list,
  -- which is the point: a leader who signs publicly has made himself
  -- answerable in the shura, where leaders are asked by name.
  role           text not null check (role in ('leader', 'member')),
  display_name   text not null check (length(btrim(display_name)) between 2 and 60),
  -- One sentence in the signer's own words: «ألتزم بـ…». Optional, because a
  -- signature without it is still a signature; but the charter page shows
  -- these, and a commitment someone wrote is worth ten they ticked.
  pledge         text check (pledge is null or length(btrim(pledge)) between 5 and 200),
  state          text check (state is null or is_sudan_state(state)),
  signed_at      timestamptz not null default now(),
  -- Set by an administrator who has confirmed the person does lead something
  -- — a cooperative, a village, a scheme. Until then the name is listed as a
  -- leader «لم يُتحقَّق بعد» and cannot answer in the shura: a self-declared
  -- title that could answer questions in the platform's hearing is exactly the
  -- impersonation the charter exists to prevent.
  verified_at    timestamptz,
  primary key (user_id, charter_version)
);

alter table public.charter_signatures enable row level security;

create policy charter_public_read on public.charter_signatures
  for select using (true);
create policy charter_sign_own on public.charter_signatures
  for insert with check (user_id = auth.uid());
-- Withdrawing a signature is allowed and leaves no trace: a charter people
-- cannot leave is not one they chose.
create policy charter_verify_admin on public.charter_signatures
  for update using (is_admin()) with check (is_admin());
create policy charter_withdraw_own on public.charter_signatures
  for delete using (user_id = auth.uid() or is_admin());

-- ═══════════════════════════════════════════════════════════════════════════
-- ٢) النفير
-- ═══════════════════════════════════════════════════════════════════════════

create table public.nafir_calls (
  id            uuid primary key default gen_random_uuid(),
  organizer_id  uuid not null references auth.users(id) on delete cascade,
  display_name  text not null check (length(btrim(display_name)) between 2 and 60),
  kind          text not null check (kind in ('harvest','planting','canal','building','cleaning','other')),
  title         text not null check (length(btrim(title)) between 5 and 120),
  description   text not null check (length(btrim(description)) between 10 and 1500),
  state         text not null check (is_sudan_state(state)),
  locality      text not null check (length(btrim(locality)) between 2 and 80),
  starts_on     date not null,
  needed        smallint not null check (needed between 1 and 500),
  -- The two halves of the tradition's bargain, as the literature describes it
  -- (Mahé 2017; Elzubair & Murad 2024): the host feeds the workers, and the
  -- workers bring their own tools. Saying both up front is what lets a
  -- neighbour decide in one reading whether to come and what to carry.
  hosting       text check (hosting is null or length(btrim(hosting)) between 3 and 200),
  bring_tools   text check (bring_tools is null or length(btrim(bring_tools)) between 2 and 200),
  status        text not null default 'open' check (status in ('open','done','cancelled')),
  -- What the nafir achieved, written by the organiser when closing it. This is
  -- itqan made visible: «حُصد ٤٠ فداناً في يوم» is the sentence that makes the
  -- next nafir easier to call.
  outcome       text check (outcome is null or length(btrim(outcome)) between 5 and 500),
  attended      smallint check (attended is null or attended between 0 and 2000),
  created_at    timestamptz not null default now(),
  closed_at     timestamptz,
  constraint nafir_done_has_outcome
    check (status <> 'done' or (outcome is not null and attended is not null))
);

create index nafir_calls_open_idx on public.nafir_calls (status, starts_on);

create table public.nafir_joins (
  call_id      uuid not null references public.nafir_calls(id) on delete cascade,
  user_id      uuid not null references auth.users(id) on delete cascade,
  display_name text not null check (length(btrim(display_name)) between 2 and 60),
  -- «أجيء بثورين» / «معي منجل» — what the person brings, optional.
  brings       text check (brings is null or length(btrim(brings)) between 2 and 120),
  joined_at    timestamptz not null default now(),
  primary key (call_id, user_id)
);

alter table public.nafir_calls enable row level security;
alter table public.nafir_joins enable row level security;

create policy nafir_calls_public_read on public.nafir_calls for select using (true);
create policy nafir_calls_insert_own on public.nafir_calls
  for insert with check (organizer_id = auth.uid());
create policy nafir_calls_update_own on public.nafir_calls
  for update using (organizer_id = auth.uid() or is_admin())
  with check (organizer_id = auth.uid() or is_admin());
create policy nafir_calls_admin_delete on public.nafir_calls
  for delete using (is_admin());

create policy nafir_joins_public_read on public.nafir_joins for select using (true);
create policy nafir_joins_insert_own on public.nafir_joins
  for insert with check (user_id = auth.uid());
create policy nafir_joins_leave_own on public.nafir_joins
  for delete using (user_id = auth.uid() or is_admin());

-- ═══════════════════════════════════════════════════════════════════════════
-- ٣) الفزعة
-- ═══════════════════════════════════════════════════════════════════════════

create table public.faza_requests (
  id            uuid primary key default gen_random_uuid(),
  requester_id  uuid not null references auth.users(id) on delete cascade,
  display_name  text not null check (length(btrim(display_name)) between 2 and 60),
  cause         text not null check (cause in ('flood','pest','fire','drought','livestock','illness','other')),
  title         text not null check (length(btrim(title)) between 5 and 120),
  description   text not null check (length(btrim(description)) between 10 and 1500),
  state         text not null check (is_sudan_state(state)),
  locality      text not null check (length(btrim(locality)) between 2 and 80),
  -- What would help, from the same closed list as a pledge. An array so the
  -- page can show «يحتاج: عمالة · بذور» and a pledger can see at a glance
  -- whether what they have is wanted.
  needs         text[] not null check (
                  cardinality(needs) between 1 and 6
                  and needs <@ array['labor','tools','seeds','transport','advice','other']),
  status        text not null default 'open' check (status in ('open','met','closed')),
  created_at    timestamptz not null default now(),
  closed_at     timestamptz
);

create index faza_requests_open_idx on public.faza_requests (status, created_at desc);

create table public.faza_pledges (
  id           uuid primary key default gen_random_uuid(),
  request_id   uuid not null references public.faza_requests(id) on delete cascade,
  pledger_id   uuid not null references auth.users(id) on delete cascade,
  display_name text not null check (length(btrim(display_name)) between 2 and 60),
  kind         text not null check (kind in ('labor','tools','seeds','transport','advice','other')),
  detail       text not null check (length(btrim(detail)) between 3 and 300),
  -- Set by the person who was helped, and only by them. «الأمانة في الوعد» is
  -- the one value here that can be counted honestly: a promise is kept when
  -- the one it was made to says so, not when the one who made it does.
  kept_at      timestamptz,
  created_at   timestamptz not null default now(),
  unique (request_id, pledger_id, kind)
);

alter table public.faza_requests enable row level security;
alter table public.faza_pledges enable row level security;

create policy faza_requests_public_read on public.faza_requests for select using (true);
create policy faza_requests_insert_own on public.faza_requests
  for insert with check (requester_id = auth.uid());
create policy faza_requests_update_own on public.faza_requests
  for update using (requester_id = auth.uid() or is_admin())
  with check (requester_id = auth.uid() or is_admin());
create policy faza_requests_admin_delete on public.faza_requests
  for delete using (is_admin());

create policy faza_pledges_public_read on public.faza_pledges for select using (true);
create policy faza_pledges_insert_own on public.faza_pledges
  for insert with check (pledger_id = auth.uid());
-- The pledger may withdraw an unkept pledge; the requester may mark it kept.
-- Which columns each may touch is enforced by the trigger below, because RLS
-- decides rows, not columns.
create policy faza_pledges_update on public.faza_pledges
  for update using (
    pledger_id = auth.uid()
    or is_admin()
    or exists (select 1 from faza_requests r
               where r.id = request_id and r.requester_id = auth.uid()))
  with check (true);
create policy faza_pledges_withdraw_own on public.faza_pledges
  for delete using ((pledger_id = auth.uid() and kept_at is null) or is_admin());

-- ═══════════════════════════════════════════════════════════════════════════
-- ٤) الشورى
-- ═══════════════════════════════════════════════════════════════════════════

create table public.shura_items (
  id            uuid primary key default gen_random_uuid(),
  author_id     uuid not null references auth.users(id) on delete cascade,
  display_name  text not null check (length(btrim(display_name)) between 2 and 60),
  kind          text not null check (kind in ('question','proposal')),
  title         text not null check (length(btrim(title)) between 5 and 150),
  body          text not null check (length(btrim(body)) between 10 and 2000),
  -- The answer, and who gave it. Answering is for the platform's admins and
  -- for anyone who signed the charter as a leader and was verified — the
  -- charter is what makes a leader answerable, so it is also what lets them
  -- answer.
  answer        text check (answer is null or length(btrim(answer)) between 10 and 2000),
  answered_by   uuid references auth.users(id),
  answer_name   text check (answer_name is null or length(btrim(answer_name)) between 2 and 60),
  answered_at   timestamptz,
  created_at    timestamptz not null default now(),
  constraint shura_answer_is_whole
    check ((answer is null) = (answered_at is null)
       and (answer is null) = (answer_name is null))
);

create index shura_items_created_idx on public.shura_items (created_at desc);

create table public.shura_supports (
  item_id    uuid not null references public.shura_items(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (item_id, user_id)
);

alter table public.shura_items enable row level security;
alter table public.shura_supports enable row level security;

create or replace function public.is_charter_leader()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from charter_signatures
    where user_id = auth.uid() and role = 'leader' and verified_at is not null
  );
$$;

create policy shura_items_public_read on public.shura_items for select using (true);
create policy shura_items_insert_own on public.shura_items
  for insert with check (author_id = auth.uid() and answer is null);
-- The author may edit the question before it is answered; a leader or admin
-- may write the answer. The trigger narrows each to their own columns.
create policy shura_items_update on public.shura_items
  for update using (author_id = auth.uid() or is_admin() or is_charter_leader())
  with check (true);
create policy shura_items_admin_delete on public.shura_items
  for delete using (is_admin());

-- Supports are counted, not listed by name: «٣٢ يؤيّدون هذا السؤال» is the
-- signal; who they are is nobody's business. So the table is not readable by
-- the public at all, and the count comes from a function.
create policy shura_supports_read_own on public.shura_supports
  for select using (user_id = auth.uid() or is_admin());
create policy shura_supports_insert_own on public.shura_supports
  for insert with check (user_id = auth.uid());
create policy shura_supports_delete_own on public.shura_supports
  for delete using (user_id = auth.uid());

-- ═══════════════════════════════════════════════════════════════════════════
-- ٥) نبض الثقة
-- ═══════════════════════════════════════════════════════════════════════════

create table public.trust_pulse (
  user_id    uuid not null references auth.users(id) on delete cascade,
  -- '2026-Q3'. One answer per person per quarter: a pulse, not a poll anyone
  -- can stuff.
  period     text not null check (period ~ '^20[0-9]{2}-Q[1-4]$'),
  -- Four statements, answered 1 (لا أوافق أبداً) to 5 (أوافق تماماً). Their
  -- wording is in src/lib/nafir.ts and adapts the World Bank's SC-IQ items
  -- on trust and collective action (Grootaert et al. 2004, Annex B).
  q_trust_people   smallint not null check (q_trust_people between 1 and 5),
  q_trust_leaders  smallint not null check (q_trust_leaders between 1 and 5),
  q_help_expected  smallint not null check (q_help_expected between 1 and 5),
  q_voice_heard    smallint not null check (q_voice_heard between 1 and 5),
  answered_at timestamptz not null default now(),
  primary key (user_id, period)
);

alter table public.trust_pulse enable row level security;

-- Individual answers are private — to the person and to nobody else, admins
-- included. A survey that an administrator can read row by row is a survey
-- people answer politely. The public sees only the aggregate, and only above
-- a floor of respondents (below).
create policy trust_pulse_own on public.trust_pulse
  for select using (user_id = auth.uid());
create policy trust_pulse_insert_own on public.trust_pulse
  for insert with check (user_id = auth.uid());

-- ═══════════════════════════════════════════════════════════════════════════
-- ٦) الحرّاس: الكاتبُ من الجلسة، وكلٌّ يلمس أعمدته فقط
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
    -- A cap, so the board stays a board: five open calls a person.
    select count(*) into v_open from nafir_calls
      where organizer_id = auth.uid() and status = 'open';
    if v_open >= 5 then
      raise exception 'لديك خمس دعواتٍ مفتوحة. أغلق واحدةً قبل أن تفتح غيرها.';
    end if;
    return new;
  end if;

  -- UPDATE: identity and history do not move.
  new.id := old.id;
  new.organizer_id := old.organizer_id;
  new.created_at := old.created_at;
  if old.status <> 'open' and not is_admin() then
    raise exception 'هذه الدعوة أُغلقت.';
  end if;
  if new.status <> 'open' and old.status = 'open' then
    new.closed_at := now();
  end if;
  return new;
end;
$$;

create trigger nafir_calls_guard
  before insert or update on public.nafir_calls
  for each row execute function public.guard_nafir_call();

create or replace function public.guard_nafir_join()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_call nafir_calls%rowtype;
begin
  select * into v_call from nafir_calls where id = new.call_id;
  if v_call.status <> 'open' then
    raise exception 'هذه الدعوة لم تعد مفتوحة.';
  end if;
  if v_call.organizer_id = auth.uid() then
    raise exception 'صاحب الدعوة حاضرٌ فيها أصلاً.';
  end if;
  new.user_id := auth.uid();
  new.joined_at := now();

  -- The organiser hears about it inside the platform. Failure to notify never
  -- blocks the join: the join is the fact, the notification a courtesy.
  begin
    insert into notifications (recipient_id, kind, title, body, link)
    values (v_call.organizer_id, 'nafir_joined',
            'لبّى ' || new.display_name || ' نفيرك',
            left(v_call.title || coalesce(' — يجيء بـ' || new.brings, ''), 300),
            '/nafir/' || v_call.id);
  exception when others then
    raise warning 'nafir join notification failed: %', sqlerrm;
  end;
  return new;
end;
$$;

create trigger nafir_joins_guard
  before insert on public.nafir_joins
  for each row execute function public.guard_nafir_join();

create or replace function public.guard_faza_request()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_open int;
begin
  if tg_op = 'INSERT' then
    new.requester_id := auth.uid();
    new.status := 'open';
    new.created_at := now();
    new.closed_at := null;
    select count(*) into v_open from faza_requests
      where requester_id = auth.uid() and status = 'open';
    if v_open >= 3 then
      raise exception 'لديك ثلاثة طلبات فزعةٍ مفتوحة. أغلق واحداً قبل أن تفتح غيره.';
    end if;
    return new;
  end if;

  new.id := old.id;
  new.requester_id := old.requester_id;
  new.created_at := old.created_at;
  if old.status <> 'open' and not is_admin() then
    raise exception 'هذا الطلب أُغلق.';
  end if;
  if new.status <> 'open' and old.status = 'open' then
    new.closed_at := now();
  end if;
  return new;
end;
$$;

create trigger faza_requests_guard
  before insert or update on public.faza_requests
  for each row execute function public.guard_faza_request();

create or replace function public.guard_faza_pledge()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_req faza_requests%rowtype;
begin
  select * into v_req from faza_requests
    where id = coalesce(new.request_id, old.request_id);

  if tg_op = 'INSERT' then
    if v_req.status <> 'open' then
      raise exception 'هذا الطلب لم يعد مفتوحاً.';
    end if;
    if v_req.requester_id = auth.uid() then
      raise exception 'لا تُعاهِد نفسك.';
    end if;
    new.pledger_id := auth.uid();
    new.kept_at := null;
    new.created_at := now();
    begin
      insert into notifications (recipient_id, kind, title, body, link)
      values (v_req.requester_id, 'faza_pledged',
              'فزع لك ' || new.display_name,
              left(new.detail, 300),
              '/nafir/faza/' || v_req.id);
    exception when others then
      raise warning 'faza pledge notification failed: %', sqlerrm;
    end;
    return new;
  end if;

  -- UPDATE: only kept_at may change, and only the helped person (or an admin)
  -- may change it. A pledger rewriting their own promise after the fact would
  -- make «kept» mean nothing.
  new.id := old.id;
  new.request_id := old.request_id;
  new.pledger_id := old.pledger_id;
  new.display_name := old.display_name;
  new.kind := old.kind;
  new.detail := old.detail;
  new.created_at := old.created_at;
  if new.kept_at is distinct from old.kept_at
     and not (v_req.requester_id = auth.uid() or is_admin()) then
    new.kept_at := old.kept_at;
  end if;
  if new.kept_at is not null and old.kept_at is null then
    new.kept_at := now();
  end if;
  return new;
end;
$$;

create trigger faza_pledges_guard
  before insert or update on public.faza_pledges
  for each row execute function public.guard_faza_pledge();

create or replace function public.guard_shura_item()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_answerer boolean := is_admin() or is_charter_leader();
begin
  if tg_op = 'INSERT' then
    new.author_id := auth.uid();
    new.answer := null;
    new.answered_by := null;
    new.answer_name := null;
    new.answered_at := null;
    new.created_at := now();
    return new;
  end if;

  new.id := old.id;
  new.author_id := old.author_id;
  new.created_at := old.created_at;

  -- The author may reword the question only while it is unanswered — an
  -- answer to a question that later changed is an answer to nothing.
  if not (old.author_id = auth.uid() and old.answer is null) then
    new.kind := old.kind;
    new.title := old.title;
    new.body := old.body;
    new.display_name := old.display_name;
  end if;

  -- The answer columns belong to answerers. The answerer is the session, and
  -- the time is the server's.
  if not v_answerer then
    new.answer := old.answer;
    new.answered_by := old.answered_by;
    new.answer_name := old.answer_name;
    new.answered_at := old.answered_at;
  elsif new.answer is distinct from old.answer then
    new.answered_by := auth.uid();
    new.answered_at := case when new.answer is null then null else now() end;
    if new.answer is null then new.answer_name := null; end if;
  end if;

  if new.answer is not null and old.answer is null then
    begin
      insert into notifications (recipient_id, kind, title, body, link)
      values (old.author_id, 'shura_answered',
              'أُجيب عن ' || case old.kind when 'question' then 'سؤالك' else 'مقترحك' end,
              left(new.answer, 300),
              '/nafir/shura#' || old.id);
    exception when others then
      raise warning 'shura answer notification failed: %', sqlerrm;
    end;
  end if;
  return new;
end;
$$;

create trigger shura_items_guard
  before insert or update on public.shura_items
  for each row execute function public.guard_shura_item();

create or replace function public.stamp_own_row()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Shared by the three tables whose only rule is «the writer is the session
  -- and the time is the server's».
  if tg_table_name = 'charter_signatures' then
    new.user_id := auth.uid();
    new.signed_at := now();
    new.verified_at := null;
  elsif tg_table_name = 'shura_supports' then
    new.user_id := auth.uid();
    new.created_at := now();
  elsif tg_table_name = 'trust_pulse' then
    new.user_id := auth.uid();
    new.answered_at := now();
  end if;
  return new;
end;
$$;

create trigger charter_signatures_stamp before insert on public.charter_signatures
  for each row execute function public.stamp_own_row();
create trigger shura_supports_stamp before insert on public.shura_supports
  for each row execute function public.stamp_own_row();
create trigger trust_pulse_stamp before insert on public.trust_pulse
  for each row execute function public.stamp_own_row();

-- The guards run as definer and read auth.uid(); nobody calls them directly.
revoke all on function public.guard_nafir_call() from public, anon, authenticated;
revoke all on function public.guard_nafir_join() from public, anon, authenticated;
revoke all on function public.guard_faza_request() from public, anon, authenticated;
revoke all on function public.guard_faza_pledge() from public, anon, authenticated;
revoke all on function public.guard_shura_item() from public, anon, authenticated;
revoke all on function public.stamp_own_row() from public, anon, authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- ٧) الإشعارات: أنواعٌ ثلاثةٌ جديدة
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.notifications drop constraint notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check
  check (kind = any (array[
    'land_submitted','land_verified','land_rejected',
    'opportunity_submitted','opportunity_approved','opportunity_rejected',
    'lead_received','feedback_received','feedback_replied',
    'nafir_joined','faza_pledged','shura_answered'
  ]));

-- ═══════════════════════════════════════════════════════════════════════════
-- ٨) الأعداد العامّة والمؤشّرات
-- ═══════════════════════════════════════════════════════════════════════════

-- Support counts without the supporters.
create or replace function public.shura_support_counts()
returns table (item_id uuid, supports bigint)
language sql
stable
security definer
set search_path = public
as $$
  select item_id, count(*) from shura_supports group by item_id;
$$;

/**
 * The three measures the plan promised — trust, participation, impact — as
 * one row anybody can read.
 *
 * Trust comes from trust_pulse and is shown only when at least PULSE_FLOOR
 * people answered in the period: an average of three answers identifies the
 * three, and a small group's mood is not a platform's. Below the floor the
 * averages are null and the page says how many more answers are needed.
 */
create or replace function public.nafir_indicators()
returns table (
  signers_leaders      bigint,
  signers_members      bigint,
  nafir_open           bigint,
  nafir_done           bigint,
  nafir_attended       bigint,
  faza_open            bigint,
  faza_met             bigint,
  pledges_total        bigint,
  pledges_kept         bigint,
  shura_total          bigint,
  shura_answered       bigint,
  shura_median_days    numeric,
  pulse_period         text,
  pulse_count          bigint,
  pulse_floor          int,
  pulse_trust_people   numeric,
  pulse_trust_leaders  numeric,
  pulse_help_expected  numeric,
  pulse_voice_heard    numeric
)
language sql
stable
security definer
set search_path = public
as $$
  with period as (
    select to_char(now(), 'YYYY') || '-Q' || to_char(now(), 'Q') as p
  ),
  pulse as (
    select count(*) as n,
           avg(q_trust_people) as a1, avg(q_trust_leaders) as a2,
           avg(q_help_expected) as a3, avg(q_voice_heard) as a4
    from trust_pulse, period where trust_pulse.period = period.p
  )
  select
    (select count(*) from charter_signatures where role = 'leader'),
    (select count(*) from charter_signatures where role = 'member'),
    (select count(*) from nafir_calls where status = 'open'),
    (select count(*) from nafir_calls where status = 'done'),
    (select coalesce(sum(attended), 0) from nafir_calls where status = 'done'),
    (select count(*) from faza_requests where status = 'open'),
    (select count(*) from faza_requests where status = 'met'),
    (select count(*) from faza_pledges),
    (select count(*) from faza_pledges where kept_at is not null),
    (select count(*) from shura_items),
    (select count(*) from shura_items where answer is not null),
    (select round((percentile_cont(0.5) within group (
              order by extract(epoch from answered_at - created_at) / 86400))::numeric, 1)
       from shura_items where answered_at is not null),
    (select p from period),
    pulse.n,
    10,
    case when pulse.n >= 10 then round(pulse.a1, 2) end,
    case when pulse.n >= 10 then round(pulse.a2, 2) end,
    case when pulse.n >= 10 then round(pulse.a3, 2) end,
    case when pulse.n >= 10 then round(pulse.a4, 2) end
  from pulse;
$$;

grant execute on function public.shura_support_counts() to anon, authenticated;
grant execute on function public.nafir_indicators() to anon, authenticated;
-- Functions are executable by PUBLIC by default, so revoking from anon alone
-- leaves the door open through PUBLIC; the advisor caught exactly that.
revoke execute on function public.is_charter_leader() from public, anon;
grant execute on function public.is_charter_leader() to authenticated;

comment on table public.charter_signatures is 'ميثاق النفير: توقيعاتٌ علنية بنسخة الميثاق، والقادة يُسمَّون.';
comment on table public.nafir_calls is 'دعوات النفير: عملٌ جماعيٌّ يُدعى إليه، ويُسجَّل ما أُنجز.';
comment on table public.faza_requests is 'طلبات الفزعة: مَن أصابته جائحة يطلب عوناً غير ماليّ.';
comment on table public.faza_pledges is 'عهود الفزعة: الوفاءُ يُثبته المُعان وحده.';
comment on table public.shura_items is 'الشورى: أسئلةٌ ومقترحاتٌ للقادة، وأجوبتهم علناً.';
comment on table public.trust_pulse is 'نبض الثقة: أربعة أسئلةٍ في الربع، لا تُقرأ إلا مجمّعة.';
