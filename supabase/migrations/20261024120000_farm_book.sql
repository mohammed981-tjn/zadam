-- ═══════════════════════════════════════════════════════════════════════════
-- دفتر المزرعة (البند ١٨٧، المرحلة ٢ من ١٨٦): دفتر الموسم البسيط يُنتج قيداً مزدوجاً
-- ═══════════════════════════════════════════════════════════════════════════
--
-- دفتر الموسم (`ledger_entries`) يبقى الواجهة البسيطة التي يعرفها المزارع: مبلغٌ وبندٌ وتاريخ. هذه الهجرة
-- تجعل كلَّ سطرٍ فيه يولِّد **قيداً مزدوجاً** في دفتر المزرعة الذي يملكه صاحب الموسم، في المعاملة نفسها:
-- فلا يضيع سطرٌ ولا يبقى قيدٌ بلا سطر.
--
--   مصروف إنتاج (والموسم جارٍ):
--       مدين  ٥١xx تكلفة بطبيعتها (بذور، أسمدة…)      دائن  النقد أو البنك أو المحفظة أو الموردين
--       مدين  ١٤١٠ محاصيل قائمة                        دائن  ٥٩٠٠ تكاليف مرسملة (−)
--     فتبقى التكلفة ظاهرةً بطبيعتها في تقرير تكاليف الإنتاج، ولا تُحسب خسارةً قبل أن يُباع المحصول.
--   مصروف إنتاج (والموسم أُقفل): السطران الأولان وحدهما، فهو مصروفٌ في يومه.
--   إيراد (بيع المحصول):  مدين النقد أو البنك أو المحفظة أو مشترو المحصول   دائن ٤١١٠ مبيعات محاصيل.
--   إقفال الموسم: ما بقي في ١٤١٠ لهذا الموسم يُنقل إلى ٥٨٠٠ «تكلفة المحصول المباع» (مدين ٥٨٠٠ دائن ١٤١٠).
--     وكلُّ تعديلٍ أو حذفٍ لاحقٍ يُصحَّح الفرق بقيدٍ مماثل، فيبقى رصيد ١٤١٠ للموسم المقفل صفراً.
--
-- تعديل سطرٍ في الدفتر البسيط (قبل إقفال الموسم) = عكس قيده القديم وقيدٌ جديد؛ وحذفه = عكس قيده. فيبقى
-- في دفتر المزرعة أثرُ كلّ ما كان، والدفتر البسيط يبقى كما يتوقّعه كلُّ ما قرأ منه.
--
-- وأربعة أعمدةٍ اختياريّة جديدة في السطر، افتراضيّها ما كان قبلها (دولار، من النقد):
--   currency         USD أو SDG. بالجنيه يُكتب المبلغ الأصلي في `entered_amount` ويُحسب `amount` بالدولار
--                    من سعر الصرف: ما كتبه صاحبه (`fx_rate`)، وإلا آخر سعرٍ منشورٍ للسوق الموازي (حتى ٧ أيام)،
--                    وإلا يُرفض السطر. `amount` يبقى دولاراً دائماً، فكلُّ ما يجمعه بعد اليوم يجمعه صحيحاً.
--   paid_from        cash أو bank أو wallet أو credit (بالأجل: موردون للمصروف، مشترون للإيراد).
-- وتُرحَّل السطور القائمة (خمسةٌ اليوم) بأمر `farm_book_sync()` الذي يُنادى في آخر هذه الهجرة، ويمكن
-- أن يُنادى ثانيةً بلا أثر.
--
-- وتعديلٌ على المحرّك: دالّة داخليّة جديدة `_ledger_post_src` تقبل مصدر السعر (`p_rate_source`) ليُوسَم القيد
-- «سوق موازية» حين كان السعر منها لا «سعر المستخدم»؛ و`_ledger_post` القديمة تبقى بتوقيعها وتناديها. لا حذفَ لشيء.

-- ── المحرّك: مصدر السعر ─────────────────────────────────────────────────────

create function public._ledger_post_src(
  p_book        uuid,
  p_date        date,
  p_memo        text,
  p_lines       jsonb,
  p_key         text,
  p_rate        numeric,
  p_source_type text,
  p_source_id   uuid,
  p_link        uuid,
  p_actor       uuid,
  p_rate_source text default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_book    public.ledger_books;
  v_acc     public.ledger_accounts;
  v_item    jsonb;
  v_norm    jsonb := '[]'::jsonb;
  v_i       integer := 0;
  v_side    text;
  v_cur     text;
  v_code    text;
  v_skey    text;
  v_foreign text;
  v_rate    numeric;
  v_src     text;
  v_hash    text;
  v_prev    record;
  v_d_cur   smallint;
  v_d_bas   smallint;
  v_bd      bigint;
  v_bc      bigint;
  v_nd      bigint;
  v_nc      bigint;
  v_ncur    integer;
  v_nfor    integer;
  v_diff    bigint;
  v_round   uuid;
  v_entry   uuid;
begin
  select * into v_book from public.ledger_books where id = p_book for share;
  if not found then
    raise exception 'الدفتر غير موجود';
  end if;
  if p_date is null then
    raise exception 'اكتب تاريخ القيد';
  end if;
  if p_key is null or length(p_key) not between 8 and 120 then
    raise exception 'مفتاح القيد غير صالح';
  end if;
  if jsonb_typeof(p_lines) is distinct from 'array' or jsonb_array_length(p_lines) not between 2 and 200 then
    raise exception 'القيد من سطرين إلى مئتي سطر';
  end if;
  p_memo := btrim(coalesce(p_memo, ''));
  if length(p_memo) > 500 then
    raise exception 'وصف القيد أطول من ٥٠٠ حرف';
  end if;
  if p_rate is not null then
    p_rate := round(p_rate, 6);
  end if;
  if p_rate_source is not null and p_rate_source not in ('user', 'parallel', 'bank') then
    raise exception 'مصدر سعر الصرف غير معروف';
  end if;

  for v_item in select value from jsonb_array_elements(p_lines) loop
    v_i := v_i + 1;
    if jsonb_typeof(v_item) <> 'object' then
      raise exception 'السطر % غير صالح', v_i;
    end if;
    v_side := v_item ->> 'side';
    if v_side is null or v_side not in ('D', 'C') then
      raise exception 'جانب السطر % إمّا D مدين أو C دائن', v_i;
    end if;
    v_cur := upper(coalesce(v_item ->> 'currency', ''));
    if not exists (select 1 from public.ledger_currencies where code = v_cur) then
      raise exception 'عملة السطر % غير معروفة', v_i;
    end if;
    if jsonb_typeof(v_item -> 'minor') is distinct from 'number' or (v_item ->> 'minor') !~ '^[0-9]{1,13}$'
       or (v_item ->> 'minor')::bigint < 1 then
      raise exception 'مبلغ السطر % عددٌ صحيحٌ موجب بالوحدة الصغرى', v_i;
    end if;

    v_code := nullif(btrim(coalesce(v_item ->> 'account', '')), '');
    v_skey := nullif(btrim(coalesce(v_item ->> 'key', '')), '');
    if v_code is not null then
      select * into v_acc from public.ledger_accounts where book_id = p_book and code = v_code;
    elsif v_skey is not null then
      select * into v_acc from public.ledger_accounts where book_id = p_book and system_key = v_skey;
    else
      raise exception 'حدّد حساب السطر %', v_i;
    end if;
    if not found then
      raise exception 'حسابٌ غير موجود في هذا الدفتر (السطر %)', v_i;
    end if;
    if not v_acc.postable then
      raise exception 'الحساب % تجميعيّ لا يُقيَّد عليه', v_acc.code;
    end if;
    if not v_acc.active then
      raise exception 'الحساب % موقوف', v_acc.code;
    end if;
    if v_acc.currency is not null and v_acc.currency <> v_cur then
      raise exception 'الحساب % بعملة %', v_acc.code, v_acc.currency;
    end if;

    if v_cur <> v_book.base_currency then
      if v_foreign is null then
        v_foreign := v_cur;
      elsif v_foreign <> v_cur then
        raise exception 'في القيد الواحد عملةٌ واحدة غير الدولار';
      end if;
    end if;

    v_norm := v_norm || jsonb_build_array(jsonb_build_object(
      'line_no', v_i,
      'account_id', v_acc.id,
      'side', v_side,
      'currency', v_cur,
      'minor', (v_item ->> 'minor')::bigint,
      'season_id', public._ledger_opt_uuid(v_item ->> 'season'),
      'land_id', public._ledger_opt_uuid(v_item ->> 'land'),
      'herd_id', public._ledger_opt_uuid(v_item ->> 'herd'),
      'project_id', public._ledger_opt_uuid(v_item ->> 'project'),
      'memo', nullif(left(btrim(coalesce(v_item ->> 'memo', '')), 200), '')
    ));
  end loop;

  -- What the entry says, not what the platform worked out for it: a replay must hash the same.
  select encode(sha256(convert_to(
           p_date::text || '|' || p_memo || '|' || coalesce(p_rate::text, '') || '|' || coalesce(p_rate_source, '') || '|'
           || coalesce(p_source_type, '') || '|' || coalesce(p_source_id::text, '') || '|'
           || (select string_agg(concat_ws(':', x.account_id, x.side, x.currency, x.minor,
                                           coalesce(x.season_id::text, ''), coalesce(x.land_id::text, ''),
                                           coalesce(x.herd_id::text, ''), coalesce(x.project_id::text, ''),
                                           coalesce(x.memo, '')),
                                    ',' order by x.account_id, x.side, x.currency, x.minor, x.line_no)
                 from jsonb_to_recordset(v_norm) as x(line_no integer, account_id uuid, side text, currency text,
                                                      minor bigint, season_id uuid, land_id uuid, herd_id uuid,
                                                      project_id uuid, memo text)),
           'UTF8')), 'hex')
    into v_hash;

  select id, content_hash into v_prev from public.journal_entries
   where book_id = p_book and idempotency_key = p_key;
  if found then
    if v_prev.content_hash = v_hash then
      return v_prev.id;
    end if;
    raise exception 'مفتاح القيد هذا استُعمل لقيدٍ مختلف';
  end if;

  -- The rate: the one typed, else the market's, else nothing — never a guess.
  if v_foreign is not null then
    if p_rate is not null then
      if p_rate < 1 or p_rate > 100000000 then
        raise exception 'سعر الصرف خارج المعقول';
      end if;
      v_rate := p_rate;
      v_src := coalesce(p_rate_source, 'user');
    else
      select r.rate, r.source into v_rate, v_src from public.ledger_fx_rate(p_date, 'parallel') r;
      if v_rate is null then
        raise exception 'لا سعر صرفٍ منشوراً خلال ٧ أيام قبل %؛ اكتب السعر الذي صرفت به', p_date;
      end if;
    end if;
  end if;

  select minor_digits into v_d_bas from public.ledger_currencies where code = v_book.base_currency;
  select minor_digits into v_d_cur from public.ledger_currencies where code = coalesce(v_foreign, v_book.base_currency);

  select coalesce(sum(b) filter (where side = 'D'), 0),
         coalesce(sum(b) filter (where side = 'C'), 0),
         coalesce(sum(minor) filter (where side = 'D'), 0),
         coalesce(sum(minor) filter (where side = 'C'), 0),
         count(distinct currency),
         count(*) filter (where currency <> v_book.base_currency)
    into v_bd, v_bc, v_nd, v_nc, v_ncur, v_nfor
    from (
      select x.side, x.currency, x.minor,
             case when x.currency = v_book.base_currency then x.minor
                  else public.ledger_to_base(x.minor, v_rate, v_d_cur, v_d_bas) end as b
        from jsonb_to_recordset(v_norm) as x(line_no integer, account_id uuid, side text, currency text,
                                             minor bigint, season_id uuid, land_id uuid, herd_id uuid,
                                             project_id uuid, memo text)
    ) q;

  if v_ncur = 1 and v_nd <> v_nc then
    raise exception 'القيد غير متوازن: المدين % والدائن %', round(v_nd / 100.0, 2), round(v_nc / 100.0, 2);
  end if;
  v_diff := v_bd - v_bc;
  if v_diff <> 0 then
    -- Each converted line can be a half-unit off; more than one unit per line is not rounding.
    if v_foreign is null or abs(v_diff) > v_nfor then
      raise exception 'القيد غير متوازن: المدين % والدائن % دولار', round(v_bd / 100.0, 2), round(v_bc / 100.0, 2);
    end if;
    select id into v_round from public.ledger_accounts where book_id = p_book and system_key = 'rounding';
    if v_round is null then
      raise exception 'لا حساب لفروق التقريب في هذا الدفتر';
    end if;
  end if;

  insert into public.journal_entries
    (book_id, entry_date, memo, fx_rate, fx_source, source_type, source_id, link_id, idempotency_key, content_hash, created_by)
  values
    (p_book, p_date, p_memo, v_rate, v_src, p_source_type, p_source_id, p_link, p_key, v_hash, p_actor)
  on conflict (book_id, idempotency_key) do nothing
  returning id into v_entry;

  if v_entry is null then
    -- A twin request committed between the look above and this insert.
    select id, content_hash into v_prev from public.journal_entries
     where book_id = p_book and idempotency_key = p_key;
    if v_prev.content_hash = v_hash then
      return v_prev.id;
    end if;
    raise exception 'مفتاح القيد هذا استُعمل لقيدٍ مختلف';
  end if;

  insert into public.journal_lines
    (entry_id, book_id, line_no, account_id, side, currency, amount_minor, base_minor,
     season_id, land_id, herd_id, project_id, line_memo)
  select v_entry, p_book, x.line_no, x.account_id, x.side, x.currency, x.minor,
         case when x.currency = v_book.base_currency then x.minor
              else public.ledger_to_base(x.minor, v_rate, v_d_cur, v_d_bas) end,
         x.season_id, x.land_id, x.herd_id, x.project_id, x.memo
    from jsonb_to_recordset(v_norm) as x(line_no integer, account_id uuid, side text, currency text,
                                         minor bigint, season_id uuid, land_id uuid, herd_id uuid,
                                         project_id uuid, memo text);

  if v_diff <> 0 then
    insert into public.journal_lines
      (entry_id, book_id, line_no, account_id, side, currency, amount_minor, base_minor, line_memo)
    values
      (v_entry, p_book, v_i + 1, v_round, case when v_diff > 0 then 'C' else 'D' end,
       v_book.base_currency, abs(v_diff), abs(v_diff), 'فرق تقريب');
  end if;

  return v_entry;
end $$;


-- The ten-argument door stays as it was (nothing that calls it changes); it now only passes "no source".
create or replace function public._ledger_post(
  p_book        uuid,
  p_date        date,
  p_memo        text,
  p_lines       jsonb,
  p_key         text,
  p_rate        numeric,
  p_source_type text,
  p_source_id   uuid,
  p_link        uuid,
  p_actor       uuid
) returns uuid
language sql
security definer
set search_path = public
as $$
  select public._ledger_post_src(p_book, p_date, p_memo, p_lines, p_key, p_rate, p_source_type, p_source_id, p_link, p_actor, null)
$$;

revoke execute on function
  public._ledger_post_src(uuid, date, text, jsonb, text, numeric, text, uuid, uuid, uuid, text)
  from public, anon, authenticated, service_role;

create index journal_entries_source on public.journal_entries (source_type, source_id) where source_id is not null;

-- ── أعمدة السطر ─────────────────────────────────────────────────────────────

alter table public.ledger_entries
  add column if not exists currency text not null default 'USD' check (currency in ('USD', 'SDG')),
  add column if not exists entered_amount numeric check (entered_amount is null or entered_amount > 0),
  add column if not exists fx_rate numeric(18, 6) check (fx_rate is null or fx_rate > 0),
  add column if not exists fx_source text check (fx_source in ('parallel', 'bank', 'user')),
  add column if not exists paid_from text not null default 'cash' check (paid_from in ('cash', 'bank', 'wallet', 'credit'));

alter table public.ledger_entries
  add constraint ledger_entries_currency_shape check (
    (currency = 'USD' and entered_amount is null and fx_rate is null and fx_source is null)
    or (currency <> 'USD' and entered_amount is not null and fx_rate is not null and fx_source is not null)
  );

comment on column public.ledger_entries.amount is
  'دائماً بالدولار. بالجنيه يحسبه الزناد من entered_amount وfx_rate.';
comment on column public.ledger_entries.entered_amount is
  'المبلغ كما دُفع بعملته الأصليّة، حين لا تكون الدولار.';

-- ── تهيئة السطر قبل حفظه ────────────────────────────────────────────────────

create function public.ledger_entries_prepare()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_rate numeric;
  v_src  text;
begin
  if new.currency = 'USD' then
    new.entered_amount := null;
    new.fx_rate := null;
    new.fx_source := null;
    new.amount := round(new.amount, 2);
    return new;
  end if;

  if new.entered_amount is null or new.entered_amount <= 0 then
    raise exception 'اكتب المبلغ بالجنيه';
  end if;
  new.entered_amount := round(new.entered_amount, 2);

  if new.fx_rate is not null then
    -- On an update that leaves the rate alone, the rate keeps the source it had.
    if tg_op = 'UPDATE' and new.fx_rate is not distinct from old.fx_rate and old.fx_source is not null then
      v_rate := old.fx_rate;
      v_src := old.fx_source;
    else
      if new.fx_rate < 1 or new.fx_rate > 100000000 then
        raise exception 'سعر الصرف خارج المعقول';
      end if;
      v_rate := round(new.fx_rate, 6);
      v_src := 'user';
    end if;
  else
    select r.rate, r.source into v_rate, v_src from public.ledger_fx_rate(new.entry_date, 'parallel') r;
    if v_rate is null then
      raise exception 'لا سعر صرفٍ منشوراً خلال ٧ أيام قبل %؛ اكتب السعر الذي صرفت به', new.entry_date;
    end if;
  end if;

  new.fx_rate := v_rate;
  new.fx_source := v_src;
  -- The dollar value is what the ledger itself will compute from the same minor units and rate.
  new.amount := (public.ledger_to_base(round(new.entered_amount * 100)::bigint, v_rate)::numeric / 100)::numeric(18, 2);
  return new;
end $$;

create trigger ledger_entries_prepare
  before insert or update on public.ledger_entries
  for each row execute function public.ledger_entries_prepare();

-- ── الترحيل ─────────────────────────────────────────────────────────────────

create function public._farm_label(p_category public.ledger_category)
returns text
language sql
immutable
set search_path = public
as $$
  select case p_category::text
    when 'seeds' then 'بذور' when 'fertiliser' then 'أسمدة' when 'pesticide' then 'مبيدات'
    when 'labour' then 'عمالة' when 'irrigation' then 'ري ووقود' when 'transport' then 'نقل'
    when 'other' then 'مصروفات أخرى' when 'revenue' then 'إيراد بيع' else p_category::text end
$$;

-- The standing posting of a simple-ledger row: the entry made for it that no reversal has cancelled.
create function public._farm_mirror_current(p_id uuid)
returns uuid
language sql
stable
set search_path = public
as $$
  select je.id
    from public.journal_entries je
   where je.source_type = 'season_entry' and je.source_id = p_id and je.reversal_of is null
     and not exists (select 1 from public.journal_entries r where r.reversal_of = je.id)
   order by je.entry_no desc
   limit 1
$$;

create function public._farm_mirror_post(p_id uuid, p_key text, p_actor uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  r        public.ledger_entries;
  v_season public.seasons;
  v_minor  bigint;
  v_cost   text;
  v_pay    text;
  v_book   uuid;
  v_lines  jsonb;
  v_dim    text;
  v_memo   text;
begin
  select * into r from public.ledger_entries where id = p_id;
  if not found then
    return null;
  end if;
  select * into v_season from public.seasons where id = r.season_id;
  if not found then
    return null;
  end if;

  v_minor := case when r.currency = 'USD' then round(r.amount * 100) else round(r.entered_amount * 100) end;
  if v_minor < 1 then
    return null;
  end if;

  v_pay := case r.paid_from
             when 'bank' then 'bank'
             when 'wallet' then 'wallet'
             when 'credit' then case when r.category = 'revenue' then 'receivable_buyers' else 'payables_suppliers' end
             else 'cash_on_hand' end;
  v_cost := case r.category::text
              when 'seeds' then 'cost_seeds' when 'fertiliser' then 'cost_fertiliser'
              when 'pesticide' then 'cost_pesticide' when 'labour' then 'cost_labour'
              when 'irrigation' then 'cost_irrigation' when 'transport' then 'cost_transport'
              when 'other' then 'cost_other' else 'sales_crops' end;
  v_dim := v_season.id::text;
  v_memo := left(public._farm_label(r.category) || ' — ' || v_season.name
                 || coalesce(': ' || nullif(btrim(r.description), ''), ''), 500);

  -- (key, side) pairs; every line carries the season.
  if r.category = 'revenue' then
    v_lines := jsonb_build_array(
      jsonb_build_object('key', v_pay, 'side', 'D', 'currency', r.currency, 'minor', v_minor, 'season', v_dim),
      jsonb_build_object('key', 'sales_crops', 'side', 'C', 'currency', r.currency, 'minor', v_minor, 'season', v_dim));
  else
    v_lines := jsonb_build_array(
      jsonb_build_object('key', v_cost, 'side', 'D', 'currency', r.currency, 'minor', v_minor, 'season', v_dim),
      jsonb_build_object('key', v_pay, 'side', 'C', 'currency', r.currency, 'minor', v_minor, 'season', v_dim));
    if v_season.status <> 'completed' then
      v_lines := v_lines || jsonb_build_array(
        jsonb_build_object('key', 'crops_in_progress', 'side', 'D', 'currency', r.currency, 'minor', v_minor, 'season', v_dim),
        jsonb_build_object('key', 'costs_capitalised', 'side', 'C', 'currency', r.currency, 'minor', v_minor, 'season', v_dim));
    end if;
  end if;

  v_book := public._ledger_open_book(v_season.owner_id, 'farm');
  return public._ledger_post_src(
    v_book, r.entry_date, v_memo, v_lines, p_key,
    case when r.currency = 'USD' then null else r.fx_rate end,
    'season_entry', r.id, null, p_actor,
    case when r.currency = 'USD' then null else r.fx_source end);
end $$;

create function public._farm_mirror_reverse(p_id uuid, p_reason text, p_actor uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cur uuid := public._farm_mirror_current(p_id);
begin
  if v_cur is not null then
    perform public._ledger_reverse(v_cur, p_reason, null, null, p_actor);
  end if;
end $$;

-- A closed season keeps nothing in "growing crops": whatever is left there is the cost of the crop sold.
create function public._farm_trueup(p_season uuid, p_actor uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_season public.seasons;
  v_book   uuid;
  v_bal    bigint;
  v_dim    text := p_season::text;
begin
  select * into v_season from public.seasons where id = p_season;
  if not found or v_season.status <> 'completed' then
    return;
  end if;
  select id into v_book from public.ledger_books where owner_id = v_season.owner_id and kind = 'farm';
  if v_book is null then
    return;
  end if;

  select coalesce(sum(case l.side when 'D' then l.base_minor else -l.base_minor end), 0)
    into v_bal
    from public.journal_lines l
    join public.ledger_accounts a on a.id = l.account_id and a.book_id = l.book_id
   where l.book_id = v_book and a.system_key = 'crops_in_progress' and l.season_id = p_season;
  if v_bal = 0 then
    return;
  end if;

  perform public._ledger_post_src(
    v_book, public.ledger_today(),
    'تكلفة المحصول المباع — إقفال ' || v_season.name,
    jsonb_build_array(
      jsonb_build_object('key', case when v_bal > 0 then 'cost_of_sales' else 'crops_in_progress' end,
                         'side', 'D', 'currency', 'USD', 'minor', abs(v_bal), 'season', v_dim),
      jsonb_build_object('key', case when v_bal > 0 then 'crops_in_progress' else 'cost_of_sales' end,
                         'side', 'C', 'currency', 'USD', 'minor', abs(v_bal), 'season', v_dim)),
    'season_close:' || p_season::text || ':' || gen_random_uuid()::text,
    null, 'season_close', p_season, null, p_actor, null);
end $$;

create function public.ledger_entries_mirror()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid;
begin
  if tg_op = 'DELETE' then
    v_actor := coalesce(auth.uid(), old.created_by);
    perform public._farm_mirror_reverse(old.id, 'حُذف من دفتر الموسم', v_actor);
    perform public._farm_trueup(old.season_id, v_actor);
    return null;
  end if;

  v_actor := coalesce(auth.uid(), new.created_by);
  if tg_op = 'INSERT' then
    perform public._farm_mirror_post(new.id, 'season_entry:' || new.id::text, v_actor);
    perform public._farm_trueup(new.season_id, v_actor);
    return null;
  end if;

  -- UPDATE: only what the books record counts as a change.
  if (old.season_id, old.category, old.amount, old.entry_date, old.currency, old.entered_amount, old.fx_rate, old.paid_from, old.description)
     is distinct from
     (new.season_id, new.category, new.amount, new.entry_date, new.currency, new.entered_amount, new.fx_rate, new.paid_from, new.description) then
    perform public._farm_mirror_reverse(old.id, 'عُدِّل في دفتر الموسم', v_actor);
    perform public._farm_mirror_post(new.id, 'season_entry:' || new.id::text || ':' || gen_random_uuid()::text, v_actor);
    perform public._farm_trueup(new.season_id, v_actor);
    if old.season_id is distinct from new.season_id then
      perform public._farm_trueup(old.season_id, v_actor);
    end if;
  end if;
  return null;
end $$;

create trigger ledger_entries_mirror_ins
  after insert on public.ledger_entries
  for each row execute function public.ledger_entries_mirror();
create trigger ledger_entries_mirror_upd
  after update on public.ledger_entries
  for each row execute function public.ledger_entries_mirror();
create trigger ledger_entries_mirror_del
  after delete on public.ledger_entries
  for each row execute function public.ledger_entries_mirror();

create function public.seasons_close_mirror()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public._farm_trueup(new.id, auth.uid());
  return null;
end $$;

create trigger seasons_close_mirror
  after update of status on public.seasons
  for each row
  when (old.status is distinct from 'completed' and new.status = 'completed')
  execute function public.seasons_close_mirror();

-- ── ترحيل القائم، ومطابقة الدفتر البسيط بدفتر المزرعة ──────────────────────

-- Posts every simple-ledger row that has no posting yet (the rows that were there before this existed, or
-- any a failure ever left behind). Safe to run again: a row already posted is skipped. Returns how many it posted.
create function public.farm_book_sync()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  n integer := 0;
  s uuid;
begin
  for r in
    select le.id, le.created_by
      from public.ledger_entries le
     where le.amount > 0
       and not exists (select 1 from public.journal_entries je where je.source_type = 'season_entry' and je.source_id = le.id)
     order by le.entry_date, le.created_at
  loop
    if public._farm_mirror_post(r.id, 'season_entry:' || r.id::text, r.created_by) is not null then
      n := n + 1;
    end if;
  end loop;
  for s in select id from public.seasons where status = 'completed' loop
    perform public._farm_trueup(s, null);
  end loop;
  return n;
end $$;

-- Where the simple book and the farm book disagree, in minor units of the dollar (administrators and the service key).
create function public.farm_book_reconcile()
returns table (
  season_id        uuid,
  simple_costs     bigint,
  book_costs       bigint,
  simple_revenue   bigint,
  book_revenue     bigint,
  unposted_rows    bigint
)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
begin
  if auth.uid() is not null and not is_admin() then
    raise exception 'للإدارة وحدها';
  end if;
  return query
  with simple as (
    select le.season_id,
           coalesce(sum(round(le.amount * 100)) filter (where le.category <> 'revenue'), 0)::bigint as costs,
           coalesce(sum(round(le.amount * 100)) filter (where le.category = 'revenue'), 0)::bigint as revenue,
           count(*) filter (where le.amount > 0
              and not exists (select 1 from public.journal_entries je where je.source_type = 'season_entry' and je.source_id = le.id)) as unposted
      from public.ledger_entries le
     group by le.season_id
  ), book as (
    select l.season_id,
           coalesce(sum(case l.side when 'D' then l.base_minor else -l.base_minor end)
                    filter (where a.system_key in ('cost_seeds','cost_fertiliser','cost_pesticide','cost_labour',
                                                   'cost_irrigation','cost_transport','cost_other')), 0)::bigint as costs,
           coalesce(sum(case l.side when 'C' then l.base_minor else -l.base_minor end)
                    filter (where a.system_key = 'sales_crops'), 0)::bigint as revenue
      from public.journal_lines l
      join public.ledger_accounts a on a.id = l.account_id and a.book_id = l.book_id
     where l.season_id is not null
     group by l.season_id
  )
  select s.season_id, s.costs, coalesce(b.costs, 0), s.revenue, coalesce(b.revenue, 0), s.unposted
    from simple s
    left join book b on b.season_id = s.season_id
   where s.costs <> coalesce(b.costs, 0) or s.revenue <> coalesce(b.revenue, 0) or s.unposted > 0
   order by s.season_id;
end $$;

-- ── من ينادي ماذا ───────────────────────────────────────────────────────────

revoke execute on function
  public.ledger_entries_prepare(), public.ledger_entries_mirror(), public.seasons_close_mirror(),
  public._farm_label(public.ledger_category), public._farm_mirror_current(uuid),
  public._farm_mirror_post(uuid, text, uuid), public._farm_mirror_reverse(uuid, text, uuid),
  public._farm_trueup(uuid, uuid)
  from public, anon, authenticated, service_role;

revoke execute on function public.farm_book_sync() from public, anon, authenticated;
grant execute on function public.farm_book_sync() to service_role;
revoke execute on function public.farm_book_reconcile() from public, anon;
grant execute on function public.farm_book_reconcile() to authenticated, service_role;

-- ── الترحيل الأوّل ──────────────────────────────────────────────────────────

select public.farm_book_sync();
