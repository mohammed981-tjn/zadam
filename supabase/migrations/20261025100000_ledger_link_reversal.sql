-- إلغاء قيدٍ متقابلٍ مؤكَّد باتّفاق الطرفين، وأعدادٌ للمطابقة بلا أسماء (البند ١٩٢، من ١٨٨).
--
-- القيد المتقابل المؤكَّد لا يتغيّر (ledger_links_guard)، والقيدان في الدفترين لا يُمحيان. فإن جرى خطأ كان لكلّ طرفٍ أن
-- يعكس قيده في دفتره وحده، فيختلف الدفتران ولا يعرف أحدٌ لماذا. هنا طريقٌ ثالث: يطلب أحد الشريكين الإلغاء بسبب،
-- فإن قبل الآخر عُكس القيدان معاً في معاملةٍ واحدة (على نسق التأكيد)، وإن رفض بقي القيدان كما هما.
--
-- لا يُلمس الجدول ledger_links: يبقى «مؤكَّداً» إلى الأبد، ويُعرف إلغاؤه من صفّ الطلب المقبول في الجدول الجديد. فالسجلّ
-- الأصليّ لا يُعدَّل، والعكس قيدان جديدان في الدفترين يقرؤهما الطرفان.
--
-- ثمّ للإدارة، بالأعداد وحدها وبقواعد الحجب نفسها (المستوى ١ من البند ١٩١): كم اقتراحاً معلّقاً مضى عليه أكثر من
-- عدّة أيام، وكم الفرق الصافي بين ما تقوله دفاتر المزارعين أنّها مستحقّةٌ لشركائها (٢١٣٠) وما تقوله دفاتر المستثمرين
-- أنّها مستحقّةٌ لهم من المزارعين (١٢٣٠).

-- ── الجدول ──────────────────────────────────────────────────────────────────

create table public.ledger_link_reversals (
  id                uuid primary key default gen_random_uuid(),
  link_id           uuid not null references public.ledger_links(id) on delete restrict,
  requested_by      uuid not null references auth.users(id) on delete restrict,
  other_party       uuid not null references auth.users(id) on delete restrict,
  reason            text not null check (length(reason) between 3 and 300),
  status            text not null default 'pending' check (status in ('pending', 'accepted', 'rejected', 'withdrawn')),
  reject_reason     text check (reject_reason is null or length(reject_reason) between 3 and 300),
  -- قيدا العكس في دفتر المقترِح الأصليّ للقيد المتقابل ودفتر الطرف الآخر. يغيب أحدهما إن كان صاحبه قد عكس قيده بنفسه من قبل.
  proposer_reversal uuid,
  counter_reversal  uuid,
  created_at        timestamptz not null default now(),
  resolved_at       timestamptz,
  constraint ledger_link_reversals_distinct check (requested_by <> other_party),
  constraint ledger_link_reversals_resolved check ((status = 'pending') = (resolved_at is null)),
  constraint ledger_link_reversals_rejected check ((status = 'rejected') = (reject_reason is not null))
);

-- طلبٌ واحد مفتوح لكلّ قيد، ولا طلب بعد أن قُبل واحد.
create unique index ledger_link_reversals_open on public.ledger_link_reversals (link_id) where status in ('pending', 'accepted');
create index ledger_link_reversals_party on public.ledger_link_reversals (other_party, status, created_at desc);

comment on table public.ledger_link_reversals is
  'طلب إلغاء قيدٍ متقابلٍ مؤكَّد باتّفاق الطرفين. يكتبه ledger_link_reversal_* وحدها؛ والقبول يعكس القيدين في معاملةٍ واحدة.';

-- الحالة تتحرّك من المعلّق إلى مآلٍ واحد، والباقي لا يتغيّر.
create function public.ledger_link_reversals_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'DELETE' or tg_op = 'TRUNCATE' then
    raise exception 'طلبات الإلغاء لا تُحذف';
  end if;
  if old.status <> 'pending' then
    raise exception 'طلب الإلغاء بعد البتّ فيه لا يتغيّر';
  end if;
  if new.status not in ('pending', 'accepted', 'rejected', 'withdrawn') then
    raise exception 'حالةٌ غير معروفة';
  end if;
  if (old.id, old.link_id, old.requested_by, old.other_party, old.reason, old.created_at)
     is distinct from
     (new.id, new.link_id, new.requested_by, new.other_party, new.reason, new.created_at) then
    raise exception 'لا يتغيّر من طلب الإلغاء إلا بتّه';
  end if;
  return new;
end $$;

create trigger ledger_link_reversals_guard
  before update or delete on public.ledger_link_reversals
  for each row execute function public.ledger_link_reversals_guard();
create trigger ledger_link_reversals_no_truncate
  before truncate on public.ledger_link_reversals
  for each statement execute function public.ledger_link_reversals_guard();

alter table public.ledger_link_reversals enable row level security;
revoke all on table public.ledger_link_reversals from anon, authenticated, service_role;
grant select on public.ledger_link_reversals to authenticated;

create policy ledger_link_reversals_read on public.ledger_link_reversals
  for select to authenticated
  using (
    requested_by = (select auth.uid())
    or other_party = (select auth.uid())
    or exists (
      select 1 from public.ledger_links l
       where l.id = ledger_link_reversals.link_id
         and (public._ledger_inspecting(l.proposer_book)
              or (l.counter_book is not null and public._ledger_inspecting(l.counter_book)))
    )
  );

-- ── الطلب ───────────────────────────────────────────────────────────────────

create function public.ledger_link_reversal_request(p_link uuid, p_reason text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid   uuid := auth.uid();
  l       public.ledger_links;
  r       public.ledger_link_reversals;
  v_other uuid;
  v_id    uuid;
begin
  if v_uid is null then
    raise exception 'سجّل الدخول أولاً';
  end if;
  if length(btrim(coalesce(p_reason, ''))) not between 3 and 300 then
    raise exception 'اكتب سبب الإلغاء (٣ أحرفٍ فأكثر): يراه شريكك';
  end if;
  select * into l from public.ledger_links where id = p_link for update;
  if not found or v_uid not in (l.proposer_owner, l.counter_owner) then
    raise exception 'ليس هذا قيداً من قيودك';
  end if;
  if l.status <> 'confirmed' then
    raise exception 'لا يُطلب إلغاء إلا لقيدٍ مؤكَّد';
  end if;
  v_other := case when v_uid = l.proposer_owner then l.counter_owner else l.proposer_owner end;

  select * into r from public.ledger_link_reversals where link_id = l.id and status in ('pending', 'accepted');
  if found then
    if r.status = 'accepted' then
      raise exception 'أُلغي هذا القيد من قبل باتّفاق الطرفين';
    end if;
    if r.requested_by = v_uid then
      return r.id;   -- the same request again is the same request
    end if;
    raise exception 'شريكك طلب إلغاءه من قبل؛ ردّ على طلبه';
  end if;

  insert into public.ledger_link_reversals (link_id, requested_by, other_party, reason)
  values (l.id, v_uid, v_other, btrim(p_reason))
  returning id into v_id;

  perform public.notify_user(
    v_other, 'ledger_link', 'طلب إلغاء قيدٍ متقابل: ' || public._ledger_link_label(l.kind),
    'يطلب شريكك إلغاء قيدٍ أُكِّد في دفتريكما. السبب: ' || btrim(p_reason)
      || '. إن وافقت عُكس القيدان معاً؛ وإن رفضت بقيا كما هما.',
    '/books?r=links');
  return v_id;
end $$;

-- ── القبول: عكس القيدين في معاملةٍ واحدة ────────────────────────────────────

create function public.ledger_link_reversal_accept(p_reversal uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid  uuid := auth.uid();
  r      public.ledger_link_reversals;
  l      public.ledger_links;
  v_date date;
  v_pr   uuid;
  v_cr   uuid;
begin
  if v_uid is null then
    raise exception 'سجّل الدخول أولاً';
  end if;
  select * into r from public.ledger_link_reversals where id = p_reversal for update;
  if not found or r.other_party <> v_uid then
    raise exception 'ليس هذا طلباً موجّهاً إليك';
  end if;
  if r.status <> 'pending' then
    raise exception 'سُبق البتّ في هذا الطلب';
  end if;
  select * into l from public.ledger_links where id = r.link_id for update;
  if l.status <> 'confirmed' then
    raise exception 'القيد ليس مؤكَّداً';
  end if;

  -- A reversal cannot precede the entry it reverses; the entry date can be tomorrow's at most.
  v_date := greatest(public.ledger_today(), l.entry_date);

  -- A side that already reversed its own entry by hand is left as it is: the agreement then settles the other.
  if not exists (select 1 from public.journal_entries where reversal_of = l.proposer_entry) then
    v_pr := public._ledger_reverse(l.proposer_entry, left('إلغاءٌ باتّفاق الطرفين: ' || r.reason, 300), v_date,
                                   'ledger_link_reversal:' || r.id::text || ':p', l.proposer_owner);
  end if;
  if not exists (select 1 from public.journal_entries where reversal_of = l.counter_entry) then
    v_cr := public._ledger_reverse(l.counter_entry, left('إلغاءٌ باتّفاق الطرفين: ' || r.reason, 300), v_date,
                                   'ledger_link_reversal:' || r.id::text || ':c', l.counter_owner);
  end if;

  update public.ledger_link_reversals
     set status = 'accepted', proposer_reversal = v_pr, counter_reversal = v_cr, resolved_at = now()
   where id = r.id;

  -- Financed inputs sit in "growing crops"; if the season has closed, the books of the farm re-settle.
  if l.season_id is not null then
    perform public._farm_trueup(l.season_id, v_uid);
  end if;

  perform public.notify_user(
    r.requested_by, 'ledger_link', 'وافق شريكك على إلغاء القيد: ' || public._ledger_link_label(l.kind),
    'عُكس القيدان في الدفترين. القيدان الأصليّان باقيان في السجلّ ومعهما قيدا العكس.', '/books?r=links');
end $$;

-- ── الرفض والسحب ────────────────────────────────────────────────────────────

create function public.ledger_link_reversal_reject(p_reversal uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  r     public.ledger_link_reversals;
  l     public.ledger_links;
begin
  if v_uid is null then
    raise exception 'سجّل الدخول أولاً';
  end if;
  if length(btrim(coalesce(p_reason, ''))) not between 3 and 300 then
    raise exception 'اكتب سبب الرفض (٣ أحرفٍ فأكثر): يراه صاحب الطلب';
  end if;
  select * into r from public.ledger_link_reversals where id = p_reversal for update;
  if not found or r.other_party <> v_uid then
    raise exception 'ليس هذا طلباً موجّهاً إليك';
  end if;
  if r.status <> 'pending' then
    raise exception 'سُبق البتّ في هذا الطلب';
  end if;
  update public.ledger_link_reversals
     set status = 'rejected', reject_reason = btrim(p_reason), resolved_at = now()
   where id = r.id;
  select * into l from public.ledger_links where id = r.link_id;
  perform public.notify_user(
    r.requested_by, 'ledger_link', 'رفض شريكك إلغاء القيد: ' || public._ledger_link_label(l.kind),
    'السبب: ' || btrim(p_reason) || '. بقي القيدان كما هما في الدفترين.', '/books?r=links');
end $$;

create function public.ledger_link_reversal_withdraw(p_reversal uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  r     public.ledger_link_reversals;
begin
  if v_uid is null then
    raise exception 'سجّل الدخول أولاً';
  end if;
  select * into r from public.ledger_link_reversals where id = p_reversal for update;
  if not found or r.requested_by <> v_uid then
    raise exception 'ليس هذا طلبك';
  end if;
  if r.status <> 'pending' then
    raise exception 'سُبق البتّ في هذا الطلب';
  end if;
  update public.ledger_link_reversals set status = 'withdrawn', resolved_at = now() where id = r.id;
end $$;

-- ── القائمة: طلباتي والموجَّهة إليّ ─────────────────────────────────────────

create function public.ledger_link_reversals_list()
returns table (
  id            uuid,
  link_id       uuid,
  mine          boolean,
  status        text,
  reason        text,
  reject_reason text,
  created_at    timestamptz,
  resolved_at   timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select r.id, r.link_id, (r.requested_by = auth.uid()), r.status, r.reason, r.reject_reason, r.created_at, r.resolved_at
    from public.ledger_link_reversals r
   where auth.uid() is not null and (r.requested_by = auth.uid() or r.other_party = auth.uid())
   order by (r.status = 'pending') desc, r.created_at desc
   limit 200
$$;

-- ── للإدارة: ما تأخّر، والفرق بين الذمّتين (أعدادٌ بلا أسماء) ──────────────

-- كم اقتراحاً وطلب إلغاءٍ معلّقاً مضى عليه أكثر من p_days يوماً. تُحجب الخليّة إن ساهم فيها أقلّ من الحدّ الأدنى من العقود.
create function public.oversight_stale(p_days integer default 7)
returns table (
  what       text,
  items      bigint,
  agreements bigint,
  oldest_days integer,
  suppressed boolean
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  s public.oversight_settings;
begin
  if auth.uid() is not null and not is_admin() then
    raise exception 'للإدارة وحدها';
  end if;
  if p_days is null or p_days < 1 or p_days > 365 then
    raise exception 'مدىً غير صالح';
  end if;
  select * into s from public.oversight_settings;
  return query
  with x as (
    select 'pending_link'::text as w, count(*)::bigint as n, count(distinct l.agreement_id)::bigint as people,
           coalesce(max(extract(day from now() - l.created_at)), 0)::integer as oldest
      from public.ledger_links l
     where l.status = 'pending' and l.created_at < now() - make_interval(days => p_days)
    union all
    select 'pending_reversal', count(*)::bigint, count(distinct l.agreement_id)::bigint,
           coalesce(max(extract(day from now() - r.created_at)), 0)::integer
      from public.ledger_link_reversals r
      join public.ledger_links l on l.id = r.link_id
     where r.status = 'pending' and r.created_at < now() - make_interval(days => p_days)
  )
  -- An empty cell shows no one, so it is shown as empty; a cell with few agreements behind it is withheld.
  select x.w,
         case when x.n > 0 and x.people < s.min_books then null else x.n end,
         case when x.n > 0 and x.people < s.min_books then null else x.people end,
         case when x.n > 0 and x.people < s.min_books then null else x.oldest end,
         x.n > 0 and x.people < s.min_books
    from x
   order by x.w;
end $$;

-- الفرق بين ما تقوله دفاتر المزارعين أنّها مستحقّةٌ لشركائها (٢١٣٠) وما تقوله دفاتر المستثمرين أنّها مستحقّةٌ لهم (١٢٣٠)،
-- بالدولار حتى يومٍ معيّن. القيدان المتقابلان المؤكَّدان يتطابقان بالبناء، فالفرق الباقي أثرُ عكسٍ جرى في دفترٍ واحد أو قيدٍ
-- يدويٍّ على أحد الحسابين. يُحجب الرقم كلّه إن قلّت الدفاتر في أحد الجانبين عن الحدّ الأدنى أو غلب عليه دفترٌ واحد.
create function public.oversight_reconcile(p_as_of date default null)
returns table (
  due_to_partner_minor  bigint,
  due_from_farmer_minor bigint,
  difference_minor      bigint,
  farm_books            integer,
  investor_books        integer,
  suppressed            boolean
)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  s public.oversight_settings;
begin
  if auth.uid() is not null and not is_admin() then
    raise exception 'للإدارة وحدها';
  end if;
  select * into s from public.oversight_settings;
  return query
  with bal as (
    select b.kind, l.book_id,
           sum(case when b.kind = 'farm' then (case l.side when 'C' then l.base_minor else -l.base_minor end)
                    else (case l.side when 'D' then l.base_minor else -l.base_minor end) end)::bigint as v
      from public.journal_lines l
      join public.journal_entries e on e.id = l.entry_id
      join public.ledger_books b on b.id = l.book_id and b.kind in ('farm', 'investor')
      join public.ledger_accounts a on a.id = l.account_id and a.book_id = l.book_id
     where e.entry_date <= coalesce(p_as_of, public.ledger_today())
       and ((b.kind = 'farm' and a.system_key = 'due_to_partner') or (b.kind = 'investor' and a.system_key = 'due_from_farmer'))
     group by b.kind, l.book_id
  ), agg as (
    select coalesce(sum(v) filter (where kind = 'farm'), 0)::bigint     as farm_total,
           coalesce(sum(v) filter (where kind = 'investor'), 0)::bigint as inv_total,
           count(*) filter (where kind = 'farm' and v <> 0)::integer     as farm_n,
           count(*) filter (where kind = 'investor' and v <> 0)::integer as inv_n,
           coalesce(max(abs(v)) filter (where kind = 'farm'), 0)     as farm_top,
           coalesce(max(abs(v)) filter (where kind = 'investor'), 0) as inv_top,
           coalesce(sum(abs(v)) filter (where kind = 'farm'), 0)     as farm_sum,
           coalesce(sum(abs(v)) filter (where kind = 'investor'), 0) as inv_sum
      from bal
  ), judged as (
    select a.*,
           (a.farm_n >= s.min_books and a.inv_n >= s.min_books
            and (a.farm_sum = 0 or a.farm_top::numeric / a.farm_sum <= s.max_top_share)
            and (a.inv_sum = 0 or a.inv_top::numeric / a.inv_sum <= s.max_top_share)) as shown
      from agg a
  )
  select case when j.shown then j.farm_total end,
         case when j.shown then j.inv_total end,
         case when j.shown then j.farm_total - j.inv_total end,
         case when j.shown then j.farm_n end,
         case when j.shown then j.inv_n end,
         not j.shown
    from judged j;
end $$;

-- ── الصلاحيّات ──────────────────────────────────────────────────────────────

revoke execute on function public.ledger_link_reversals_guard() from public, anon, authenticated, service_role;

revoke execute on function
  public.ledger_link_reversal_request(uuid, text),
  public.ledger_link_reversal_accept(uuid),
  public.ledger_link_reversal_reject(uuid, text),
  public.ledger_link_reversal_withdraw(uuid),
  public.ledger_link_reversals_list(),
  public.oversight_stale(integer),
  public.oversight_reconcile(date)
  from public, anon, service_role;

grant execute on function
  public.ledger_link_reversal_request(uuid, text),
  public.ledger_link_reversal_accept(uuid),
  public.ledger_link_reversal_reject(uuid, text),
  public.ledger_link_reversal_withdraw(uuid),
  public.ledger_link_reversals_list(),
  public.oversight_stale(integer),
  public.oversight_reconcile(date)
  to authenticated;

grant execute on function public.oversight_stale(integer), public.oversight_reconcile(date) to service_role;
