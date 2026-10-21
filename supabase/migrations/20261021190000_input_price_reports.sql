-- ═══════════════════════════════════════════════════════════════════════════
-- «أين السماد والجازولين هذا الأسبوع وبكم» — بلاغات الأسعار والتوفّر (البند ١٢٠)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- المالك، 21 أكتوبر 2026: «ابنِ لوحة أين السماد والجازولين هذا الأسبوع وبكم».
--
-- WHY REPORTS, AND NOT A FEED
--
-- No source publishes this week's price of urea or diesel in Sudan in a form a
-- machine can read. FEWS NET has no fertiliser series for Sudan at all, and
-- its diesel series carry no value since 2024 («Not Collected»). WFP's and
-- IFPRI's monthly reports give the direction a month or more late, in charts.
-- So the week's figure can only come from the people buying: a farmer or a
-- trader says what urea or diesel cost him, where and on what day, or that it
-- was not to be found at all. IFPRI's price-reporting tool with farmers in
-- Egypt (2024) found 88% found the shared prices useful; that is the model.
--
-- WHAT IS NEVER SHOWN
--
-- Who reported. The table keeps the reporter, so one account cannot flood a
-- town and a reporter can withdraw his own report; but strangers read only
-- through two functions that return no reporter at all — the list, and a
-- summary that counts distinct reporters without naming them.
--
-- NOTHING IS DELETED
--
-- A report is hidden, never deleted: by its reporter («سحبه صاحبه») or by an
-- administrator, with the reason. The row stays.

create table public.input_price_reports (
  id            uuid primary key default gen_random_uuid(),
  item          text not null check (item in ('urea','dap','npk','diesel','petrol')),
  unit          text not null check (unit in ('sack_50kg','kg','liter','gallon','barrel')),
  -- السعر الرسميّ (المحطّة، الجمعيّة) أو السوق الموازي (السوق الأسود). للوقود إلزاميّ.
  price_kind    text check (price_kind is null or price_kind in ('official','parallel')),
  state         text not null check (is_sudan_state(state)),
  locality      text not null check (length(btrim(locality)) between 2 and 80),
  -- «غير موجود» بلا سعرٍ بلاغٌ صحيح، وهو أهمّ البلاغات.
  price_sdg     numeric(14,2) check (price_sdg is null or (price_sdg > 0 and price_sdg <= 100000000)),
  availability  text not null check (availability in ('available','limited','unavailable')),
  observed_on   date not null,
  note          text check (note is null or length(btrim(note)) between 2 and 300),
  reporter_id   uuid not null references auth.users(id) on delete cascade,
  created_at    timestamptz not null default now(),
  hidden_at     timestamptz,
  hidden_by     uuid references auth.users(id) on delete set null,
  hidden_note   text check (hidden_note is null or length(hidden_note) <= 200),
  -- السماد بالجوال أو الكيلو، والوقود باللتر أو الجالون أو البرميل.
  constraint input_unit_fits_item check (
    (item in ('urea','dap','npk') and unit in ('sack_50kg','kg'))
    or (item in ('diesel','petrol') and unit in ('liter','gallon','barrel'))),
  constraint input_fuel_names_its_market check (item not in ('diesel','petrol') or price_kind is not null),
  constraint input_price_unless_absent check (availability = 'unavailable' or price_sdg is not null)
);

create index input_price_reports_recent_idx on public.input_price_reports (observed_on desc) where hidden_at is null;
create index input_price_reports_reporter_idx on public.input_price_reports (reporter_id);
create index input_price_reports_hidden_by_idx on public.input_price_reports (hidden_by);

alter table public.input_price_reports enable row level security;

-- صاحبُ البلاغ يرى بلاغاته (ليسحب منها)، والإدارة ترى الكلّ (لتُخفي). والناس
-- يقرؤون عبر الدالّتين أدناه، بلا اسم المُبلِّغ.
create policy input_price_reports_own_read on public.input_price_reports
  for select to authenticated using (reporter_id = (select auth.uid()) or (select is_admin()));

revoke insert, update, delete on public.input_price_reports from anon, authenticated;
revoke select on public.input_price_reports from anon;

comment on table public.input_price_reports is
  'بلاغات أسعار السماد والوقود وتوفّرها من المستخدمين. لم تتحقّق منها المنصّة. لا يُحذف بلاغ: يُخفى بسببه.';

-- ═══════════════════════════════════════════════════════════════════════════
-- البلاغ
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.input_price_report_add(
  p_item text, p_unit text, p_price_kind text, p_state text, p_locality text,
  p_price_sdg numeric, p_availability text, p_observed_on date, p_note text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  -- يومُ الخرطوم لا يومُ الخادم: الخادمُ على UTC، وبلاغُ الواحدة صباحاً في
  -- القضارف كان سيُرفض لأنّه «من الغد».
  v_today date := (now() at time zone 'Africa/Khartoum')::date;
begin
  if auth.uid() is null then raise exception 'سجّل الدخول أولاً.'; end if;
  -- سعرُ هذا الأسبوع، لا ذكرى موسمٍ مضى؛ ولا يومٌ لم يأتِ.
  if p_observed_on is null or p_observed_on > v_today or p_observed_on < v_today - 14 then
    raise exception 'التاريخ يكون اليوم أو في الأيّام الأربعة عشر الماضية.';
  end if;
  -- عشرون بلاغاً في اليوم تاجرٌ نشيط؛ وأكثر منها إغراق.
  if (select count(*) from input_price_reports
        where reporter_id = auth.uid() and created_at > now() - interval '1 day') >= 20 then
    raise exception 'أرسلتَ عشرين بلاغاً اليوم. عُد غداً.';
  end if;
  -- والبلاغُ نفسه مرّتين في اليوم لا يزيده صدقاً.
  if exists (select 1 from input_price_reports
               where reporter_id = auth.uid() and hidden_at is null
                 and item = p_item and state = p_state
                 and lower(btrim(locality)) = lower(btrim(p_locality))
                 and observed_on = p_observed_on
                 and coalesce(price_kind, '') = coalesce(p_price_kind, '')) then
    raise exception 'أرسلتَ بلاغاً عن هذا الصنف في هذا السوق لهذا اليوم. اسحبه أوّلاً إن أردت تصحيحه.';
  end if;
  insert into input_price_reports (item, unit, price_kind, state, locality, price_sdg,
                                   availability, observed_on, note, reporter_id)
  values (p_item, p_unit, nullif(p_price_kind, ''), p_state, btrim(p_locality),
          case when p_availability = 'unavailable' then null else p_price_sdg end,
          p_availability, p_observed_on, nullif(btrim(coalesce(p_note, '')), ''), auth.uid())
  returning id into v_id;
  return v_id;
end;
$$;

-- يسحب صاحبُ البلاغ بلاغه: يُخفى ويبقى.
create or replace function public.input_price_report_withdraw(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'سجّل الدخول أولاً.'; end if;
  update input_price_reports
     set hidden_at = now(), hidden_by = auth.uid(), hidden_note = 'سحبه صاحبه'
   where id = p_id and reporter_id = auth.uid() and hidden_at is null;
  if not found then raise exception 'لا بلاغَ ظاهراً لك بهذا الرقم.'; end if;
end;
$$;

-- تُخفي الإدارةُ بلاغاً مضلِّلاً، وتذكر السبب.
create or replace function public.input_price_report_hide(p_id uuid, p_note text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_admin() then raise exception 'الإخفاء للإدارة وحدها.'; end if;
  if length(btrim(coalesce(p_note, ''))) < 2 then raise exception 'اذكر سبب الإخفاء.'; end if;
  update input_price_reports
     set hidden_at = now(), hidden_by = auth.uid(), hidden_note = left(btrim(p_note), 200)
   where id = p_id and hidden_at is null;
  if not found then raise exception 'لا بلاغَ ظاهراً بهذا الرقم.'; end if;
end;
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- القراءة للناس: بلا اسم المُبلِّغ
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.input_price_reports_recent(p_days integer default 14)
returns table (id uuid, item text, unit text, price_kind text, state text, locality text,
               price_sdg numeric, availability text, observed_on date, note text)
language sql
stable
security definer
set search_path = public
as $$
  select r.id, r.item, r.unit, r.price_kind, r.state, r.locality, r.price_sdg,
         r.availability, r.observed_on, r.note
    from input_price_reports r
   where r.hidden_at is null
     and r.observed_on >= (now() at time zone 'Africa/Khartoum')::date - least(greatest(coalesce(p_days, 14), 1), 60)
   order by r.observed_on desc, r.created_at desc
   limit 300;
$$;

-- لكلّ صنفٍ ووحدةٍ ونوعِ سعرٍ وولاية: كم بلاغاً، ومن كم شخصاً، وأدنى وأعلى ووسيط،
-- وآخر يوم، وكم قالوا «غير موجود». الوسيطُ حسابٌ على أرقام الناس، لا تقدير.
create or replace function public.input_price_summary(p_days integer default 14)
returns table (item text, unit text, price_kind text, state text,
               reports integer, reporters integer, priced integer,
               low numeric, high numeric, median numeric,
               latest_on date, unavailable integer, limited integer)
language sql
stable
security definer
set search_path = public
as $$
  select r.item, r.unit, coalesce(r.price_kind, '') as price_kind, r.state,
         count(*)::int, count(distinct r.reporter_id)::int, count(r.price_sdg)::int,
         min(r.price_sdg), max(r.price_sdg),
         (percentile_cont(0.5) within group (order by r.price_sdg))::numeric,
         max(r.observed_on),
         (count(*) filter (where r.availability = 'unavailable'))::int,
         (count(*) filter (where r.availability = 'limited'))::int
    from input_price_reports r
   where r.hidden_at is null
     and r.observed_on >= (now() at time zone 'Africa/Khartoum')::date - least(greatest(coalesce(p_days, 14), 1), 60)
   group by r.item, r.unit, coalesce(r.price_kind, ''), r.state
   order by r.item, max(r.observed_on) desc;
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- الصلاحيات
-- ═══════════════════════════════════════════════════════════════════════════

revoke execute on function public.input_price_report_add(text, text, text, text, text, numeric, text, date, text) from public, anon;
revoke execute on function public.input_price_report_withdraw(uuid) from public, anon;
revoke execute on function public.input_price_report_hide(uuid, text) from public, anon;
revoke execute on function public.input_price_reports_recent(integer) from public;
revoke execute on function public.input_price_summary(integer) from public;

grant execute on function public.input_price_report_add(text, text, text, text, text, numeric, text, date, text) to authenticated;
grant execute on function public.input_price_report_withdraw(uuid) to authenticated;
grant execute on function public.input_price_report_hide(uuid, text) to authenticated;
grant execute on function public.input_price_reports_recent(integer) to anon, authenticated;
grant execute on function public.input_price_summary(integer) to anon, authenticated;
