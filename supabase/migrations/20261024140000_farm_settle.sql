-- ═══════════════════════════════════════════════════════════════════════════
-- سدّدتُ / قبضتُ — تسوية القيود الآجلة في دفتر المزرعة (البند ١٨٧، المرحلة ٢ج)
--
-- قيدٌ في دفتر الموسم مكتوبٌ «آجلاً» ترك ديناً: على صاحب المزرعة للمورّد (٢١١٠)، أو له على المشتري (١٢١٠).
-- حين يُدفع أو يُقبض يُقيَّد السداد قيداً مستقلاً في المحرّك (لا يُعدَّل القيد الأصل):
--     دائن:  مدين ٢١١٠ الموردون / دائن النقد أو البنك أو المحفظة
--     مدين:  مدين النقد أو البنك أو المحفظة / دائن ١٢١٠ المشترون
-- وبالجنيه يتغيّر سعر الدولار بين يوم الدين ويوم السداد، فيبقى في حساب الدين فرقٌ بالدولار وصفرٌ بالجنيه؛
-- يُقفله قيدٌ ثانٍ بالدولار وحده إلى ٤٣١٠ (ربح فرق صرف) أو ٧١١٠ (خسارته)، في المعاملة نفسها.
--
-- وما سُدِّد لا يُعدَّل ولا يُحذف في الدفتر البسيط (وإلا بقي السداد معلّقاً بلا أصل): يُلغى السداد أولاً بـ
-- farm_unsettle_entry، ثم يُعدَّل القيد أو يُحذف، ثم يُسدَّد من جديد إن شاء.
--
-- لا حذف في هذه الهجرة: دوالّ جديدة وزنادٌ جديد فقط.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── مساعدات ─────────────────────────────────────────────────────────────────

-- The standing settlement of a simple-ledger row: the settlement entry that no reversal has cancelled.
create function public._farm_settlement_current(p_id uuid, p_type text default 'season_entry_settle')
returns uuid
language sql
stable
set search_path = public
as $$
  select je.id
    from public.journal_entries je
   where je.source_type = p_type and je.source_id = p_id and je.reversal_of is null
     and not exists (select 1 from public.journal_entries r where r.reversal_of = je.id)
   order by je.entry_no desc
   limit 1
$$;

-- ── التسوية ─────────────────────────────────────────────────────────────────

create function public.farm_settle_entry(
  p_entry_id uuid,
  p_from     text,
  p_date     date default null,
  p_rate     numeric default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid    uuid := auth.uid();
  r        public.ledger_entries;
  v_season public.seasons;
  v_book   uuid;
  v_date   date;
  v_minor  bigint;
  v_pay    text;
  v_debt   text;
  v_rev    boolean;
  v_dim    text;
  v_orig   uuid;
  v_b0     bigint;
  v_b1     bigint;
  v_rate   numeric;
  v_src    text;
  v_n      integer;
  v_memo   text;
  v_e      uuid;
  v_diff   bigint;
begin
  if v_uid is null then
    raise exception 'سجّل الدخول أولاً';
  end if;

  -- The lock makes two taps on the button one settlement, not two.
  select * into r from public.ledger_entries where id = p_entry_id for update;
  if not found then
    raise exception 'القيد غير موجود';
  end if;
  select * into v_season from public.seasons where id = r.season_id;
  if v_season.owner_id is distinct from v_uid then
    raise exception 'ليس هذا قيدك';
  end if;
  if r.paid_from <> 'credit' then
    raise exception 'هذا القيد ليس آجلاً';
  end if;
  if p_from is null or p_from not in ('cash', 'bank', 'wallet') then
    raise exception 'اختر النقد أو البنك أو المحفظة';
  end if;

  v_orig := public._farm_mirror_current(r.id);
  if v_orig is null then
    raise exception 'لا قيد لهذا السطر في الدفتر';
  end if;
  if public._farm_settlement_current(r.id) is not null then
    raise exception 'سُدِّد هذا القيد من قبل';
  end if;

  v_date := coalesce(p_date, public.ledger_today());
  if v_date < r.entry_date then
    raise exception 'السداد لا يسبق القيد';
  end if;

  v_rev := r.category = 'revenue';
  v_debt := case when v_rev then 'receivable_buyers' else 'payables_suppliers' end;
  v_pay := case p_from when 'bank' then 'bank' when 'wallet' then 'wallet' else 'cash_on_hand' end;
  v_dim := r.season_id::text;
  v_minor := case when r.currency = 'USD' then round(r.amount * 100) else round(r.entered_amount * 100) end;

  -- What the debt stands at in the book, in dollars: the line that opened it.
  select l.base_minor into v_b0
    from public.journal_lines l
    join public.ledger_accounts a on a.id = l.account_id and a.book_id = l.book_id
   where l.entry_id = v_orig and a.system_key = v_debt
   limit 1;
  if v_b0 is null then
    raise exception 'لا دين مقيَّد لهذا السطر';
  end if;

  if r.currency = 'USD' then
    v_rate := null;
    v_src := null;
    v_b1 := v_minor;
  else
    if p_rate is not null then
      if p_rate < 1 or p_rate > 100000000 then
        raise exception 'سعر الصرف خارج المعقول';
      end if;
      v_rate := round(p_rate, 6);
      v_src := 'user';
    else
      select f.rate into v_rate from public.ledger_fx_rate(v_date, 'parallel') f;
      v_src := 'parallel';
      if v_rate is null then
        raise exception 'لا سعر صرفٍ منشوراً خلال ٧ أيام قبل %؛ اكتب السعر الذي صرفت به', v_date;
      end if;
    end if;
    v_b1 := public.ledger_to_base(v_minor, v_rate);
  end if;

  select id into v_book from public.ledger_books where owner_id = v_season.owner_id and kind = 'farm';
  select count(*) + 1 into v_n
    from public.journal_entries
   where source_type = 'season_entry_settle' and source_id = r.id and reversal_of is null;

  v_memo := left((case when v_rev then 'قبض — ' else 'سداد — ' end) || public._farm_label(r.category) || ' — ' || v_season.name
                 || coalesce(': ' || nullif(btrim(r.description), ''), ''), 500);

  v_e := public._ledger_post_src(
    v_book, v_date, v_memo,
    case when v_rev then
      jsonb_build_array(
        jsonb_build_object('key', v_pay,  'side', 'D', 'currency', r.currency, 'minor', v_minor, 'season', v_dim),
        jsonb_build_object('key', v_debt, 'side', 'C', 'currency', r.currency, 'minor', v_minor, 'season', v_dim))
    else
      jsonb_build_array(
        jsonb_build_object('key', v_debt, 'side', 'D', 'currency', r.currency, 'minor', v_minor, 'season', v_dim),
        jsonb_build_object('key', v_pay,  'side', 'C', 'currency', r.currency, 'minor', v_minor, 'season', v_dim))
    end,
    'season_entry_settle:' || r.id::text || ':' || v_n::text,
    v_rate, 'season_entry_settle', r.id, null, v_uid, v_src);

  -- The pound was worth a different number of dollars on the day of the debt and on the day it was settled:
  -- the entry above moved the debt by the new day's dollars, and the difference left in the debt account
  -- is a gain or a loss of exchange. A payable that shrank in dollars is a gain; a receivable that did, a loss.
  v_diff := v_b0 - v_b1;
  if v_diff <> 0 then
    perform public._ledger_post_src(
      v_book, v_date, 'فرق صرف — ' || v_memo,
      case
        when (not v_rev and v_diff > 0) then
          jsonb_build_array(
            jsonb_build_object('key', v_debt,     'side', 'D', 'currency', 'USD', 'minor', v_diff, 'season', v_dim),
            jsonb_build_object('key', 'fx_gain',  'side', 'C', 'currency', 'USD', 'minor', v_diff, 'season', v_dim))
        when (not v_rev and v_diff < 0) then
          jsonb_build_array(
            jsonb_build_object('key', 'fx_loss',  'side', 'D', 'currency', 'USD', 'minor', -v_diff, 'season', v_dim),
            jsonb_build_object('key', v_debt,     'side', 'C', 'currency', 'USD', 'minor', -v_diff, 'season', v_dim))
        when (v_rev and v_diff > 0) then
          jsonb_build_array(
            jsonb_build_object('key', 'fx_loss',  'side', 'D', 'currency', 'USD', 'minor', v_diff, 'season', v_dim),
            jsonb_build_object('key', v_debt,     'side', 'C', 'currency', 'USD', 'minor', v_diff, 'season', v_dim))
        else
          jsonb_build_array(
            jsonb_build_object('key', v_debt,     'side', 'D', 'currency', 'USD', 'minor', -v_diff, 'season', v_dim),
            jsonb_build_object('key', 'fx_gain',  'side', 'C', 'currency', 'USD', 'minor', -v_diff, 'season', v_dim))
      end,
      'season_entry_settle_fx:' || r.id::text || ':' || v_n::text,
      null, 'season_entry_settle_fx', r.id, null, v_uid, null);
  end if;

  return v_e;
end $$;

-- Cancels a settlement (and its exchange difference): the entries are reversed, not removed.
create function public.farm_unsettle_entry(p_entry_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid    uuid := auth.uid();
  r        public.ledger_entries;
  v_season public.seasons;
  v_cur    uuid;
  v_fx     uuid;
begin
  if v_uid is null then
    raise exception 'سجّل الدخول أولاً';
  end if;
  select * into r from public.ledger_entries where id = p_entry_id for update;
  if not found then
    raise exception 'القيد غير موجود';
  end if;
  select * into v_season from public.seasons where id = r.season_id;
  if v_season.owner_id is distinct from v_uid then
    raise exception 'ليس هذا قيدك';
  end if;

  v_cur := public._farm_settlement_current(r.id);
  if v_cur is null then
    raise exception 'لم يُسدَّد هذا القيد';
  end if;
  v_fx := public._farm_settlement_current(r.id, 'season_entry_settle_fx');

  if v_fx is not null then
    perform public._ledger_reverse(v_fx, 'أُلغي السداد', null, null, v_uid);
  end if;
  perform public._ledger_reverse(v_cur, 'أُلغي السداد', null, null, v_uid);
end $$;

-- The state of the credit rows of one season, for the page that offers "I paid" and "I was paid".
create function public.farm_credit_status(p_season uuid)
returns table (entry_id uuid, settled_on date)
language sql
stable
security definer
set search_path = public
as $$
  select le.id,
         (select je.entry_date from public.journal_entries je where je.id = public._farm_settlement_current(le.id))
    from public.ledger_entries le
    join public.seasons s on s.id = le.season_id
   where le.season_id = p_season
     and s.owner_id = auth.uid()
     and le.paid_from = 'credit'
     and public._farm_mirror_current(le.id) is not null
   order by le.entry_date, le.created_at
$$;

-- ── ما سُدِّد لا يتغيّر ─────────────────────────────────────────────────────

create function public.ledger_entries_settled_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public._farm_settlement_current(old.id) is not null then
    if tg_op = 'DELETE' then
      raise exception 'سُدِّد هذا القيد؛ ألغِ السداد أولاً ثم احذفه';
    end if;
    if (old.season_id, old.category, old.amount, old.entry_date, old.currency, old.entered_amount, old.fx_rate, old.paid_from)
       is distinct from
       (new.season_id, new.category, new.amount, new.entry_date, new.currency, new.entered_amount, new.fx_rate, new.paid_from) then
      raise exception 'سُدِّد هذا القيد؛ ألغِ السداد أولاً ثم عدّله';
    end if;
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end $$;

create trigger ledger_entries_settled_guard_upd
  before update on public.ledger_entries
  for each row execute function public.ledger_entries_settled_guard();
create trigger ledger_entries_settled_guard_del
  before delete on public.ledger_entries
  for each row execute function public.ledger_entries_settled_guard();

-- ── الصلاحيّات ──────────────────────────────────────────────────────────────

revoke execute on function
  public._farm_settlement_current(uuid, text), public.ledger_entries_settled_guard()
  from public, anon, authenticated, service_role;

-- A person's own money: signed in, and the function itself checks that the row is theirs.
revoke execute on function
  public.farm_settle_entry(uuid, text, date, numeric), public.farm_unsettle_entry(uuid), public.farm_credit_status(uuid)
  from public, anon, service_role;
grant execute on function
  public.farm_settle_entry(uuid, text, date, numeric), public.farm_unsettle_entry(uuid), public.farm_credit_status(uuid)
  to authenticated;
