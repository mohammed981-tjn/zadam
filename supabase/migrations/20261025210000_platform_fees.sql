-- ═══════════════════════════════════════════════════════════════════════════
-- رسوم المنصّة قيدان متقابلان يؤكّدهما دافعها (البند ١٨٩، المرحلة ٤ من ١٨٦)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- الدراسة (docs/studies/accounting-ledger-ar.md §٣-١٠): «كلُّ رسمٍ تتقاضاه المنصّة قيدان متقابلان — إيرادٌ في دفترها،
-- ومصروفٌ في دفتر دافعه — يربطهما link_id». والمنصّة لا تمسك مال أحد: الرسم يُدفع خارجها (نقداً أو بنكك أو تحويلاً)،
-- ثمّ يُقيَّد. فالدورة كالقيد المتقابل بين شريكين:
--
--   - **المدير يقترح** الرسم: من دفعه، ونوعه (معاينة، توثيق عقد، خدمة)، ومبلغه وعملته ويومه. لا يُقيَّد شيءٌ بعد.
--   - **الدافع يؤكّد** من أين دفع (النقد أو البنك أو المحفظة)، فيُقيَّد الرسم في الدفترين في معاملةٍ واحدة بالرابط نفسه:
--       دفتر المنصّة:  مدين ١١١٠ نقد المنصّة          / دائن ٤١١٠–٤١٣٠ إيراد الرسم
--       دفتر الدافع:   مدين ٦١١٠ رسوم المنصّة (أو ٦١٤٠ رسوم المعاينة في دفتر المستثمر) / دائن النقد أو البنك أو المحفظة
--     فالمنصّة لا تكتب في دفتر أحدٍ إلا بتأكيده، وهي «طرفٌ» هنا لا «مشرِفة».
--   - **أو يعترض** بسبب، فلا يُقيَّد شيء؛ **أو يلغيه المدير** قبل البتّ.
--
-- والسجلّ لا يُحذف، ولا يتغيّر منه بعد البتّ شيء. وقيدا الرسم من قيود النظام: لا يُعكسان يدويّاً بـ ledger_reverse
-- (يُعاد تعريفها هنا لتعرف المصدر الجديد)، فيبقى الدفتران متّفقين.

-- ── الجدول ──────────────────────────────────────────────────────────────────

create table public.ledger_fees (
  id             uuid primary key default gen_random_uuid(),
  kind           text not null check (kind in ('inspection', 'agreement', 'service')),
  status         text not null default 'pending' check (status in ('pending', 'confirmed', 'rejected', 'cancelled')),
  payer_owner    uuid not null references auth.users(id) on delete restrict,
  payer_kind     text not null check (payer_kind in ('farm', 'investor')),
  amount_minor   bigint not null check (amount_minor between 1 and 10000000000000),
  currency       text not null check (currency in ('USD', 'SDG')),
  fx_rate        numeric(18, 6) check (fx_rate is null or fx_rate > 0),
  fx_source      text check (fx_source in ('parallel', 'bank', 'user')),
  entry_date     date not null check (entry_date >= date '2000-01-01'),
  memo           text not null default '' check (length(memo) <= 200),
  proposed_by    uuid not null references auth.users(id) on delete restrict,
  idem_key       text not null check (length(idem_key) between 8 and 80),
  payer_account  text check (payer_account in ('cash', 'bank', 'wallet')),
  platform_entry uuid,
  payer_entry    uuid,
  reject_reason  text check (reject_reason is null or length(reject_reason) between 3 and 300),
  created_at     timestamptz not null default now(),
  resolved_at    timestamptz,
  constraint ledger_fees_payer_not_proposer check (payer_owner <> proposed_by),
  constraint ledger_fees_resolved check ((status = 'pending') = (resolved_at is null)),
  constraint ledger_fees_confirmed check ((status = 'confirmed') = (platform_entry is not null and payer_entry is not null and payer_account is not null)),
  constraint ledger_fees_rejected check ((status = 'rejected') = (reject_reason is not null)),
  unique (proposed_by, idem_key)
);

create index ledger_fees_payer on public.ledger_fees (payer_owner, status, created_at desc);

comment on table public.ledger_fees is
  'رسمٌ للمنصّة يقترحه المدير ويؤكّده دافعه؛ عند التأكيد يُقيَّد في دفتر المنصّة ودفتر الدافع بالرابط نفسه.';

create function public.ledger_fees_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'DELETE' or tg_op = 'TRUNCATE' then
    raise exception 'سجلّ الرسوم لا يُحذف';
  end if;
  if old.status <> 'pending' then
    raise exception 'الرسم بعد البتّ فيه لا يتغيّر';
  end if;
  if (old.id, old.kind, old.payer_owner, old.payer_kind, old.amount_minor, old.currency, old.entry_date, old.memo,
      old.proposed_by, old.idem_key, old.created_at)
     is distinct from
     (new.id, new.kind, new.payer_owner, new.payer_kind, new.amount_minor, new.currency, new.entry_date, new.memo,
      new.proposed_by, new.idem_key, new.created_at) then
    raise exception 'لا يتغيّر من الرسم إلا البتّ فيه';
  end if;
  -- A rate typed by the administrator stays the rate; one taken at confirmation is written once.
  if old.fx_rate is not null and new.fx_rate is distinct from old.fx_rate then
    raise exception 'لا يتغيّر من الرسم إلا البتّ فيه';
  end if;
  return new;
end $$;

create trigger ledger_fees_guard
  before update or delete on public.ledger_fees
  for each row execute function public.ledger_fees_guard();
create trigger ledger_fees_no_truncate
  before truncate on public.ledger_fees
  for each statement execute function public.ledger_fees_guard();

alter table public.ledger_fees enable row level security;
revoke all on table public.ledger_fees from anon, authenticated, service_role;
grant select on public.ledger_fees to authenticated;

-- The payer reads his fees; the administrators read them all (the platform is a party to every one of them).
create policy ledger_fees_read on public.ledger_fees
  for select to authenticated
  using (payer_owner = (select auth.uid()) or (select is_admin()));

-- ── نوع الإشعار ─────────────────────────────────────────────────────────────

do $$
declare v_def text;
begin
  select pg_get_constraintdef(oid) into v_def
    from pg_constraint
   where conname = 'notifications_kind_check' and conrelid = 'public.notifications'::regclass;
  if v_def is null then
    raise exception 'notifications_kind_check غير موجود';
  end if;
  if v_def not like '%ledger_fee%' then
    execute 'alter table public.notifications drop constraint notifications_kind_check';
    execute 'alter table public.notifications add constraint notifications_kind_check '
         || regexp_replace(v_def, '\]\)\)\)\s*$', ', ''ledger_fee''::text])))');
  end if;
  select pg_get_constraintdef(oid) into v_def
    from pg_constraint
   where conname = 'notifications_kind_check' and conrelid = 'public.notifications'::regclass;
  if v_def not like '%ledger_fee%' then
    raise exception 'لم يُضَف نوع الإشعار ledger_fee';
  end if;
end $$;

-- ── التسميات وسطور القيدين ──────────────────────────────────────────────────

create function public._ledger_fee_label(p_kind text)
returns text
language sql
immutable
set search_path = public
as $$
  select case p_kind
    when 'inspection' then 'رسم معاينة'
    when 'agreement' then 'رسم توثيق عقد'
    when 'service' then 'رسم خدمة'
    else p_kind end
$$;

-- The lines one side posts. `platform` or `payer`; the payer's cash account where he paid from.
create function public._ledger_fee_lines(
  p_kind text, p_side text, p_payer_kind text, p_cur text, p_amount bigint, p_account text
) returns jsonb
language plpgsql
immutable
set search_path = public
as $$
declare
  v_pay text := case p_account when 'bank' then 'bank' when 'wallet' then 'wallet' else 'cash_on_hand' end;
begin
  if p_side = 'platform' then
    return jsonb_build_array(
      jsonb_build_object('key', 'cash_on_hand', 'side', 'D', 'currency', p_cur, 'minor', p_amount),
      jsonb_build_object('key', 'fee_' || p_kind, 'side', 'C', 'currency', p_cur, 'minor', p_amount));
  end if;
  return jsonb_build_array(
    jsonb_build_object('key', case when p_kind = 'inspection' and p_payer_kind = 'investor' then 'inspection_fees' else 'platform_fees' end,
                       'side', 'D', 'currency', p_cur, 'minor', p_amount),
    jsonb_build_object('key', v_pay, 'side', 'C', 'currency', p_cur, 'minor', p_amount));
end $$;

-- ── الاقتراح: للمدير ────────────────────────────────────────────────────────

create function public.ledger_fee_propose(
  p_payer        uuid,
  p_payer_kind   text,
  p_kind         text,
  p_amount_minor bigint,
  p_currency     text,
  p_date         date,
  p_rate         numeric default null,
  p_memo         text default '',
  p_key          text default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid  uuid := auth.uid();
  v_key  text := coalesce(nullif(btrim(p_key), ''), gen_random_uuid()::text);
  v_id   uuid;
  v_rate numeric;
  v_src  text;
begin
  if v_uid is null or not is_admin() then
    raise exception 'للإدارة وحدها';
  end if;
  if p_kind not in ('inspection', 'agreement', 'service') then
    raise exception 'نوع رسمٍ غير معروف';
  end if;
  if p_payer_kind not in ('farm', 'investor') then
    raise exception 'اختر دفتر الدافع: المزرعة أو المستثمر';
  end if;
  if p_currency not in ('USD', 'SDG') then
    raise exception 'عملة غير معروفة';
  end if;
  if p_amount_minor is null or p_amount_minor < 1 or p_amount_minor > 10000000000000 then
    raise exception 'مبلغٌ غير صالح';
  end if;
  if p_date is null or p_date < date '2000-01-01' or p_date > public.ledger_today() + 1 then
    raise exception 'تاريخٌ غير صالح';
  end if;
  if p_payer is null or p_payer = v_uid then
    raise exception 'لا يقترح المدير رسماً على نفسه';
  end if;
  if not exists (select 1 from public.profiles where id = p_payer) then
    raise exception 'لا حساب بهذا المعرّف';
  end if;
  if exists (select 1 from public.profiles where id = p_payer and role = 'admin') then
    raise exception 'رسوم المنصّة على مستخدميها، لا على مديريها';
  end if;

  -- The same key from the same administrator is the same proposal: a second tap returns it.
  select id into v_id from public.ledger_fees where proposed_by = v_uid and idem_key = v_key;
  if found then
    return v_id;
  end if;

  if p_currency = 'SDG' and p_rate is not null then
    if p_rate < 1 or p_rate > 100000000 then
      raise exception 'سعر الصرف خارج المعقول';
    end if;
    v_rate := round(p_rate, 6);
    v_src := 'user';
  end if;

  if (select count(*) from public.ledger_fees where payer_owner = p_payer and status = 'pending') >= 20 then
    raise exception 'على هذا الحساب عشرون رسماً تنتظر تأكيده';
  end if;

  insert into public.ledger_fees
    (kind, payer_owner, payer_kind, amount_minor, currency, fx_rate, fx_source, entry_date, memo, proposed_by, idem_key)
  values
    (p_kind, p_payer, p_payer_kind, p_amount_minor, p_currency, v_rate, v_src, p_date,
     left(btrim(coalesce(p_memo, '')), 200), v_uid, v_key)
  returning id into v_id;

  perform public.notify_user(
    p_payer, 'ledger_fee', 'رسمٌ للمنصّة ينتظر تأكيدك: ' || public._ledger_fee_label(p_kind),
    'سجّلت الإدارة أنّك دفعت ' || public._ledger_fee_label(p_kind) || ' للمنصّة. لا يدخل دفترك إلا إن أكّدته '
      || 'واخترت من أين دفعت؛ وإن لم تدفعه فاعترض عليه.',
    '/books/fees');
  return v_id;
end $$;

-- ── التأكيد: للدافع، ويُقيَّد في الدفترين معاً ───────────────────────────────

create function public.ledger_fee_confirm(p_fee uuid, p_account text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid   uuid := auth.uid();
  f       public.ledger_fees;
  v_rate  numeric;
  v_src   text;
  v_pbook uuid;
  v_ubook uuid;
  v_label text;
  v_pe    uuid;
  v_ue    uuid;
begin
  if v_uid is null then
    raise exception 'سجّل الدخول أولاً';
  end if;
  select * into f from public.ledger_fees where id = p_fee for update;
  if not found or f.payer_owner <> v_uid then
    raise exception 'ليس هذا رسماً عليك';
  end if;
  if f.status <> 'pending' then
    raise exception 'سُبق البتّ في هذا الرسم';
  end if;
  if coalesce(p_account, '') not in ('cash', 'bank', 'wallet') then
    raise exception 'اختر من أين دفعت: النقد أو البنك أو المحفظة';
  end if;

  -- One rate for both books: what the administrator typed, else the latest published one for the day.
  if f.currency = 'SDG' then
    if f.fx_rate is not null then
      v_rate := f.fx_rate;
      v_src := f.fx_source;
    else
      select r.rate into v_rate from public.ledger_fx_rate(f.entry_date, 'parallel') r;
      v_src := 'parallel';
      if v_rate is null then
        raise exception 'لا سعر صرفٍ منشوراً خلال ٧ أيام قبل %؛ تكتب الإدارة السعر الذي قُبض به', f.entry_date;
      end if;
    end if;
  end if;

  v_pbook := public._ledger_open_book(null, 'platform');
  v_ubook := public._ledger_open_book(v_uid, f.payer_kind);
  v_label := public._ledger_fee_label(f.kind) || coalesce(': ' || nullif(f.memo, ''), '');

  v_pe := public._ledger_post_src(
    v_pbook, f.entry_date, v_label,
    public._ledger_fee_lines(f.kind, 'platform', f.payer_kind, f.currency, f.amount_minor, null),
    'ledger_fee:' || f.id::text || ':p', v_rate, 'ledger_fee', f.id, f.id, f.proposed_by, v_src);
  v_ue := public._ledger_post_src(
    v_ubook, f.entry_date, v_label,
    public._ledger_fee_lines(f.kind, 'payer', f.payer_kind, f.currency, f.amount_minor, p_account),
    'ledger_fee:' || f.id::text || ':u', v_rate, 'ledger_fee', f.id, f.id, v_uid, v_src);

  update public.ledger_fees
     set status = 'confirmed', payer_account = p_account, fx_rate = v_rate, fx_source = v_src,
         platform_entry = v_pe, payer_entry = v_ue, resolved_at = now()
   where id = f.id;

  perform public.notify_user(
    f.proposed_by, 'ledger_fee', 'أُكِّد رسم: ' || public._ledger_fee_label(f.kind),
    'أكّد الدافع الرسم، فقُيِّد في دفتر المنصّة ودفتره.', '/admin/books');
end $$;

create function public.ledger_fee_reject(p_fee uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  f     public.ledger_fees;
begin
  if v_uid is null then
    raise exception 'سجّل الدخول أولاً';
  end if;
  if length(btrim(coalesce(p_reason, ''))) not between 3 and 300 then
    raise exception 'اكتب سبب الاعتراض (٣ أحرفٍ فأكثر): تراه الإدارة';
  end if;
  select * into f from public.ledger_fees where id = p_fee for update;
  if not found or f.payer_owner <> v_uid then
    raise exception 'ليس هذا رسماً عليك';
  end if;
  if f.status <> 'pending' then
    raise exception 'سُبق البتّ في هذا الرسم';
  end if;
  update public.ledger_fees set status = 'rejected', reject_reason = btrim(p_reason), resolved_at = now() where id = f.id;
  perform public.notify_user(
    f.proposed_by, 'ledger_fee', 'اعترض الدافع على رسم: ' || public._ledger_fee_label(f.kind),
    'السبب: ' || btrim(p_reason) || '. لم يُقيَّد شيءٌ في أيّ دفتر.', '/admin/books');
end $$;

create function public.ledger_fee_cancel(p_fee uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  f public.ledger_fees;
begin
  if auth.uid() is null or not is_admin() then
    raise exception 'للإدارة وحدها';
  end if;
  select * into f from public.ledger_fees where id = p_fee for update;
  if not found then
    raise exception 'لا رسمَ بهذا المعرّف';
  end if;
  if f.status <> 'pending' then
    raise exception 'سُبق البتّ في هذا الرسم';
  end if;
  update public.ledger_fees set status = 'cancelled', resolved_at = now() where id = f.id;
end $$;

-- ── القائمة: للدافع رسومه، وللمدير كلّها باسم الدافع ─────────────────────────

create function public.ledger_fees_list()
returns table (
  id            uuid,
  kind          text,
  status        text,
  payer_owner   uuid,
  payer_name    text,
  payer_kind    text,
  amount_minor  bigint,
  currency      text,
  fx_rate       numeric,
  entry_date    date,
  memo          text,
  payer_account text,
  reject_reason text,
  created_at    timestamptz,
  resolved_at   timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select f.id, f.kind, f.status, f.payer_owner,
         case when is_admin() then coalesce(p.full_name, '—') else null end,
         f.payer_kind, f.amount_minor, f.currency, f.fx_rate, f.entry_date, f.memo, f.payer_account, f.reject_reason,
         f.created_at, f.resolved_at
    from public.ledger_fees f
    left join public.profiles p on p.id = f.payer_owner
   where auth.uid() is not null and (f.payer_owner = auth.uid() or is_admin())
   order by (f.status = 'pending') desc, f.created_at desc
   limit 300
$$;

-- ── قيود الرسم من قيود النظام: لا تُعكس يدويّاً ──────────────────────────────
--
-- كما في 20261025160000 (أ٤ وأ٥)، ومعها المصدر الجديد.

create or replace function public.ledger_reverse(
  p_entry  uuid,
  p_reason text,
  p_date   date default null,
  p_key    text default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_type text;
begin
  if auth.uid() is null then
    raise exception 'سجّل الدخول أولاً';
  end if;
  select e.source_type into v_type
    from public.journal_entries e
    join public.ledger_books b on b.id = e.book_id
   where e.id = p_entry and (b.owner_id = auth.uid() or (b.kind = 'platform' and is_admin()));
  if not found then
    raise exception 'ليس هذا قيدك';
  end if;
  if v_type in ('season_entry', 'season_close') then
    raise exception 'هذا القيد من دفتر الموسم: عدّل السطر أو احذفه هناك، فيُعكس هنا وحده';
  elsif v_type in ('season_entry_settle', 'season_entry_settle_fx') then
    raise exception 'هذا قيد سداد: ألغِ السداد من دفتر الموسم، فيُعكس مع فرق صرفه';
  elsif v_type = 'ledger_link' then
    raise exception 'هذا قيدٌ متقابل مع شريكك: يُلغى باتّفاقكما من صفحة القيود المتقابلة';
  elsif v_type = 'oversight' then
    raise exception 'هذا قيدٌ إحصائيّ يتبع مجاميع الشبكة ولا يُعكس يدويّاً';
  elsif v_type = 'ledger_fee' then
    raise exception 'هذا قيد رسمٍ للمنصّة قُيِّد في دفترين؛ لا يُعكس في أحدهما وحده';
  end if;
  return public._ledger_reverse(p_entry, p_reason, p_date, p_key, auth.uid());
end $$;

-- ── الصلاحيّات ──────────────────────────────────────────────────────────────

revoke execute on function
  public.ledger_fees_guard(), public._ledger_fee_label(text), public._ledger_fee_lines(text, text, text, text, bigint, text)
  from public, anon, authenticated, service_role;

revoke execute on function
  public.ledger_fee_propose(uuid, text, text, bigint, text, date, numeric, text, text),
  public.ledger_fee_confirm(uuid, text),
  public.ledger_fee_reject(uuid, text),
  public.ledger_fee_cancel(uuid),
  public.ledger_fees_list()
  from public, anon, service_role;

grant execute on function
  public.ledger_fee_propose(uuid, text, text, bigint, text, date, numeric, text, text),
  public.ledger_fee_confirm(uuid, text),
  public.ledger_fee_reject(uuid, text),
  public.ledger_fee_cancel(uuid),
  public.ledger_fees_list()
  to authenticated;
