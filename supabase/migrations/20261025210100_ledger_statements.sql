-- ═══════════════════════════════════════════════════════════════════════════
-- مطابقة الحساب النقديّ بكشف مزوّده (البند ١٨٩، المرحلة ٤ من ١٨٦)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- الدراسة §٣-٧: «الحساب النقديّ محفظة المستخدم الخاصّة في دفتره، له اسم وعملة ومزوّد (بنكك، MTN…)؛ يرفع المستخدم
-- كشف مزوّده CSV، فيعلّم القيود مطابَقة ويرى الفروق غير المفسَّرة». والمنصّة لا تلمس المال، فالكشف هنا **مرآةٌ
-- يقارن بها صاحب الدفتر ما سجّله**:
--
--   - الكشف لا يكتب قيداً ولا يغيّر قيداً. هو جدولٌ مستقلّ (`ledger_statement_lines`) بسطور الكشف كما جاءت.
--   - المطابقة تربط سطر كشفٍ بسطر قيدٍ في الحساب نفسه وبالعملة نفسها وبالمبلغ نفسه (المال الداخل مدينٌ في الحساب،
--     والخارج دائن). آليّاً: أقرب قيدٍ في ثلاثة أيّام قبل يوم الكشف أو بعده؛ ويدويّاً: يختار صاحب الدفتر.
--   - سطر القيد الواحد لا يطابق إلا سطر كشفٍ واحداً. والقيد الذي عُكس، أو العاكس، لا يُطابَق؛ وإن عُكس قيدٌ بعد
--     مطابقته صار سطر الكشف «في الكشف وحده» من جديد في التقرير، فلا تختفي حركةٌ حقيقيّة وراء قيدٍ أُلغي.
--   - رفع الكشف نفسه مرّةً ثانية لا يكرّر سطوره (بصمة كلّ سطر فريدة في الحساب).
--
-- يرفع الكشفَ ويطابقه صاحب الدفتر وحده (ومدير المنصّة في دفترها)؛ ويقرؤه المدير الفاحص ما دام الفحص قائماً.

-- ── الجداول ─────────────────────────────────────────────────────────────────

create table public.ledger_statements (
  id          uuid primary key default gen_random_uuid(),
  book_id     uuid not null references public.ledger_books(id) on delete restrict,
  account_id  uuid not null,
  file_name   text not null default '' check (length(file_name) <= 120),
  currency    text not null references public.ledger_currencies(code),
  rows_count  integer not null default 0 check (rows_count >= 0),
  imported_by uuid not null,
  imported_at timestamptz not null default now(),
  foreign key (account_id, book_id) references public.ledger_accounts (id, book_id)
);

create index ledger_statements_account on public.ledger_statements (account_id, imported_at desc);

create table public.ledger_statement_lines (
  id           uuid primary key default gen_random_uuid(),
  statement_id uuid not null references public.ledger_statements(id) on delete cascade,
  account_id   uuid not null,
  line_no      integer not null check (line_no between 1 and 5000),
  txn_date     date not null check (txn_date >= date '2000-01-01'),
  -- بالوحدة الصغرى لعملة الكشف: موجبٌ داخلٌ إلى الحساب، سالبٌ خارجٌ منه.
  amount_minor bigint not null check (amount_minor <> 0 and abs(amount_minor) <= 10000000000000),
  currency     text not null references public.ledger_currencies(code),
  description  text not null default '' check (length(description) <= 200),
  reference    text not null default '' check (length(reference) <= 80),
  row_hash     text not null check (row_hash ~ '^[0-9a-f]{32}$'),
  matched_line uuid references public.journal_lines(id) on delete restrict,
  match_kind   text check (match_kind in ('auto', 'manual')),
  matched_at   timestamptz,
  constraint ledger_statement_lines_match check ((matched_line is null) = (match_kind is null) and (matched_line is null) = (matched_at is null)),
  unique (account_id, row_hash)
);

create unique index ledger_statement_lines_one_match on public.ledger_statement_lines (matched_line) where matched_line is not null;
create index ledger_statement_lines_account on public.ledger_statement_lines (account_id, txn_date);

comment on table public.ledger_statement_lines is
  'سطور كشف المزوّد كما رفعها صاحب الدفتر، ومطابقة كلٍّ منها بسطر قيد. لا تكتب في الدفتر شيئاً.';

alter table public.ledger_statements enable row level security;
alter table public.ledger_statement_lines enable row level security;
revoke all on table public.ledger_statements, public.ledger_statement_lines from anon, authenticated, service_role;
grant select on public.ledger_statements, public.ledger_statement_lines to authenticated;

-- Read by the book's owner, by the administrators for the platform's book, and by an administrator inspecting it.
create function public._ledger_book_readable(p_book uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.ledger_books b
     where b.id = p_book
       and (b.owner_id = auth.uid() or (b.kind = 'platform' and is_admin()) or public._ledger_inspecting(b.id)))
$$;

create policy ledger_statements_read on public.ledger_statements
  for select to authenticated using (public._ledger_book_readable(book_id));
create policy ledger_statement_lines_read on public.ledger_statement_lines
  for select to authenticated
  using (exists (select 1 from public.ledger_statements s where s.id = statement_id and public._ledger_book_readable(s.book_id)));

-- ── مساعدات ─────────────────────────────────────────────────────────────────

-- The cash account a statement may be laid against, in a book the caller writes: his own, or the platform's for an
-- administrator. Returns the account; refuses anything else.
create function public._ledger_cash_account(p_account uuid)
returns public.ledger_accounts
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  a public.ledger_accounts;
begin
  if auth.uid() is null then
    raise exception 'سجّل الدخول أولاً';
  end if;
  select ac.* into a
    from public.ledger_accounts ac
    join public.ledger_books b on b.id = ac.book_id
   where ac.id = p_account and (b.owner_id = auth.uid() or (b.kind = 'platform' and is_admin()));
  if not found then
    raise exception 'ليس هذا حساباً في دفترك';
  end if;
  if a.type <> 'asset' or not a.postable or (a.provider is null and coalesce(a.system_key, '') not in ('cash_on_hand', 'bank', 'wallet')) then
    raise exception 'الكشف يُطابَق بحسابٍ نقديّ (نقد أو بنك أو محفظة)';
  end if;
  return a;
end $$;

-- A journal line still standing: its entry is not a reversal and has not been reversed.
create function public._ledger_line_standing(p_line uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.journal_lines l
      join public.journal_entries e on e.id = l.entry_id
     where l.id = p_line and e.reversal_of is null
       and not exists (select 1 from public.journal_entries r where r.reversal_of = e.id))
$$;

-- The best unmatched standing line for one statement line: same account, currency and signed amount, within three
-- days, the nearest day first and then the oldest entry.
create function public._ledger_statement_candidate(p_line uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select l.id
    from public.ledger_statement_lines s
    join public.journal_lines l on l.account_id = s.account_id and l.currency = s.currency
         and (case l.side when 'D' then l.amount_minor else -l.amount_minor end) = s.amount_minor
    join public.journal_entries e on e.id = l.entry_id
   where s.id = p_line
     and abs(e.entry_date - s.txn_date) <= 3
     and e.reversal_of is null
     and not exists (select 1 from public.journal_entries r where r.reversal_of = e.id)
     and not exists (select 1 from public.ledger_statement_lines o where o.matched_line = l.id)
   order by abs(e.entry_date - s.txn_date), e.entry_no, l.line_no
   limit 1
$$;

-- ── مزوّد الحساب النقديّ ─────────────────────────────────────────────────────
--
-- الحسابات النقديّة الثلاثة التي يقيّد عليها دفتر الموسم (نقد، بنك، محفظة) يسمّي صاحبها مزوّدها: «المحفظة» هي بنكك،
-- و«البنك» هو بنك فيصل… فيُعرف أيّ كشفٍ يطابق أيّ حساب. لا يتغيّر بهذا رقمٌ في الدفتر.

create function public.ledger_account_set_provider(p_account uuid, p_provider text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public._ledger_cash_account(p_account);
  if p_provider is null or p_provider !~ '^[a-z_]{2,30}$' then
    raise exception 'مزوّدٌ غير صالح';
  end if;
  update public.ledger_accounts set provider = p_provider where id = p_account;
end $$;

-- ── الرفع ───────────────────────────────────────────────────────────────────
--
-- p_rows: [{ "date": "2026-10-01", "minor": -150000, "description": "…", "reference": "…" }, …] كما قرأتها الصفحة من
-- الملف (src/lib/ledger/statementCsv.ts). يعيد: كم سطراً جديداً، وكم سطراً كان مرفوعاً من قبل، وكم طوبق آليّاً.

create function public.ledger_statement_import(
  p_account   uuid,
  p_currency  text,
  p_file_name text,
  p_rows      jsonb
) returns table (statement_id uuid, imported integer, skipped integer, matched integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  a       public.ledger_accounts;
  v_cur   text := upper(coalesce(p_currency, ''));
  v_sid   uuid;
  v_row   jsonb;
  v_i     integer := 0;
  v_new   integer := 0;
  v_skip  integer := 0;
  v_match integer := 0;
  v_date  date;
  v_minor bigint;
  v_desc  text;
  v_ref   text;
  v_hash  text;
  v_seen  jsonb := '{}'::jsonb;
  v_base  text;
  v_n     integer;
  v_lid   uuid;
  v_cand  uuid;
begin
  a := public._ledger_cash_account(p_account);
  if a.currency is not null then
    v_cur := a.currency;
  end if;
  if not exists (select 1 from public.ledger_currencies where code = v_cur) then
    raise exception 'اختر عملة الكشف';
  end if;
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) = 0 then
    raise exception 'لا سطور في الكشف';
  end if;
  if jsonb_array_length(p_rows) > 2000 then
    raise exception 'الكشف أطول من ٢٬٠٠٠ سطر؛ قسّمه إلى فترات';
  end if;

  insert into public.ledger_statements (book_id, account_id, file_name, currency, imported_by)
  values (a.book_id, a.id, left(btrim(coalesce(p_file_name, '')), 120), v_cur, auth.uid())
  returning id into v_sid;

  for v_row in select value from jsonb_array_elements(p_rows) loop
    v_i := v_i + 1;
    begin
      v_date := (v_row ->> 'date')::date;
      v_minor := (v_row ->> 'minor')::bigint;
    exception when others then
      raise exception 'السطر % من الكشف: تاريخٌ أو مبلغٌ غير مقروء', v_i;
    end;
    if v_date is null or v_date < date '2000-01-01' or v_date > public.ledger_today() + 1 then
      raise exception 'السطر % من الكشف: تاريخٌ غير صالح', v_i;
    end if;
    if v_minor is null or v_minor = 0 or abs(v_minor) > 10000000000000 then
      raise exception 'السطر % من الكشف: مبلغٌ غير صالح', v_i;
    end if;
    v_desc := left(btrim(coalesce(v_row ->> 'description', '')), 200);
    v_ref := left(btrim(coalesce(v_row ->> 'reference', '')), 80);

    -- Two identical rows in one file are two movements; the same file again is the same movements.
    v_base := v_date::text || '|' || v_minor::text || '|' || v_cur || '|' || v_ref || '|' || v_desc;
    v_n := coalesce((v_seen ->> v_base)::integer, 0) + 1;
    v_seen := v_seen || jsonb_build_object(v_base, v_n);
    v_hash := md5(v_base || '|' || v_n::text);

    insert into public.ledger_statement_lines
      (statement_id, account_id, line_no, txn_date, amount_minor, currency, description, reference, row_hash)
    values (v_sid, a.id, v_i, v_date, v_minor, v_cur, v_desc, v_ref, v_hash)
    on conflict (account_id, row_hash) do nothing
    returning id into v_lid;
    if v_lid is null then
      v_skip := v_skip + 1;
      continue;
    end if;
    v_new := v_new + 1;

    v_cand := public._ledger_statement_candidate(v_lid);
    if v_cand is not null then
      update public.ledger_statement_lines set matched_line = v_cand, match_kind = 'auto', matched_at = now() where id = v_lid;
      v_match := v_match + 1;
    end if;
    v_lid := null;
  end loop;

  update public.ledger_statements set rows_count = v_new where id = v_sid;
  -- A file with nothing new leaves no empty statement behind.
  if v_new = 0 then
    delete from public.ledger_statements where id = v_sid;
    v_sid := null;
  end if;
  return query select v_sid, v_new, v_skip, v_match;
end $$;

-- ── المطابقة اليدويّة وفكّها ─────────────────────────────────────────────────

create function public.ledger_statement_match(p_statement_line uuid, p_journal_line uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  s public.ledger_statement_lines;
  l public.journal_lines;
begin
  select * into s from public.ledger_statement_lines where id = p_statement_line for update;
  if not found then
    raise exception 'سطر الكشف غير موجود';
  end if;
  perform public._ledger_cash_account(s.account_id);
  if s.matched_line is not null then
    raise exception 'هذا السطر مطابَقٌ من قبل؛ فكّ مطابقته أولاً';
  end if;
  select * into l from public.journal_lines where id = p_journal_line;
  if not found or l.account_id <> s.account_id then
    raise exception 'القيد ليس في هذا الحساب';
  end if;
  if l.currency <> s.currency or (case l.side when 'D' then l.amount_minor else -l.amount_minor end) <> s.amount_minor then
    raise exception 'المبلغ أو العملة لا تطابق سطر الكشف';
  end if;
  if not public._ledger_line_standing(l.id) then
    raise exception 'هذا قيدٌ عُكس أو قيدٌ عاكس؛ لا يُطابَق';
  end if;
  if exists (select 1 from public.ledger_statement_lines where matched_line = l.id) then
    raise exception 'هذا القيد مطابَقٌ بسطرٍ آخر من الكشف';
  end if;
  update public.ledger_statement_lines set matched_line = l.id, match_kind = 'manual', matched_at = now() where id = s.id;
end $$;

create function public.ledger_statement_unmatch(p_statement_line uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  s public.ledger_statement_lines;
begin
  select * into s from public.ledger_statement_lines where id = p_statement_line for update;
  if not found then
    raise exception 'سطر الكشف غير موجود';
  end if;
  perform public._ledger_cash_account(s.account_id);
  update public.ledger_statement_lines set matched_line = null, match_kind = null, matched_at = null where id = s.id;
end $$;

-- A statement uploaded by mistake is taken out whole (its lines go with it). Nothing in the book changes.
create function public.ledger_statement_delete(p_statement uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_acc uuid;
begin
  select account_id into v_acc from public.ledger_statements where id = p_statement;
  if not found then
    raise exception 'الكشف غير موجود';
  end if;
  perform public._ledger_cash_account(v_acc);
  delete from public.ledger_statements where id = p_statement;
end $$;

-- ── التقرير: ما في الاثنين، وما في الكشف وحده، وما في الدفتر وحده ────────────

create function public.ledger_reconciliation(p_account uuid, p_from date, p_to date)
returns table (
  status         text,
  statement_line uuid,
  journal_line   uuid,
  txn_date       date,
  amount_minor   bigint,
  currency       text,
  description    text,
  reference      text,
  entry_no       bigint,
  entry_date     date,
  memo           text,
  match_kind     text
)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_book uuid;
begin
  select ac.book_id into v_book from public.ledger_accounts ac where ac.id = p_account;
  if v_book is null or not public._ledger_book_readable(v_book) then
    raise exception 'ليس هذا حساباً في دفترك';
  end if;
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 1100 then
    raise exception 'مدىً غير صالح (حتى ثلاث سنوات)';
  end if;
  return query
  with stmt as (
    select s.*, (s.matched_line is not null and public._ledger_line_standing(s.matched_line)) as live
      from public.ledger_statement_lines s
     where s.account_id = p_account and s.txn_date between p_from and p_to
  )
  select case when st.live then 'matched' else 'statement_only' end,
         st.id, case when st.live then st.matched_line end, st.txn_date, st.amount_minor, st.currency, st.description,
         st.reference, case when st.live then e.entry_no end, case when st.live then e.entry_date end,
         case when st.live then e.memo end, case when st.live then st.match_kind end
    from stmt st
    left join public.journal_lines l on l.id = st.matched_line
    left join public.journal_entries e on e.id = l.entry_id
  union all
  select 'book_only', null, l.id, e.entry_date,
         (case l.side when 'D' then l.amount_minor else -l.amount_minor end), l.currency, coalesce(l.line_memo, ''), '',
         e.entry_no, e.entry_date, e.memo, null
    from public.journal_lines l
    join public.journal_entries e on e.id = l.entry_id
   where l.account_id = p_account and e.entry_date between p_from and p_to
     and e.reversal_of is null
     and not exists (select 1 from public.journal_entries r where r.reversal_of = e.id)
     and not exists (select 1 from public.ledger_statement_lines o where o.matched_line = l.id)
  order by 4, 1, 9 nulls last;
end $$;

-- ── الصلاحيّات ──────────────────────────────────────────────────────────────

revoke execute on function
  public._ledger_book_readable(uuid), public._ledger_cash_account(uuid), public._ledger_line_standing(uuid),
  public._ledger_statement_candidate(uuid)
  from public, anon, service_role;
-- The read policy calls this one as the reader.
grant execute on function public._ledger_book_readable(uuid) to authenticated;
revoke execute on function public._ledger_cash_account(uuid), public._ledger_line_standing(uuid), public._ledger_statement_candidate(uuid)
  from authenticated;

revoke execute on function
  public.ledger_account_set_provider(uuid, text),
  public.ledger_statement_import(uuid, text, text, jsonb),
  public.ledger_statement_match(uuid, uuid),
  public.ledger_statement_unmatch(uuid),
  public.ledger_statement_delete(uuid),
  public.ledger_reconciliation(uuid, date, date)
  from public, anon, service_role;
grant execute on function
  public.ledger_account_set_provider(uuid, text),
  public.ledger_statement_import(uuid, text, text, jsonb),
  public.ledger_statement_match(uuid, uuid),
  public.ledger_statement_unmatch(uuid),
  public.ledger_statement_delete(uuid),
  public.ledger_reconciliation(uuid, date, date)
  to authenticated;
