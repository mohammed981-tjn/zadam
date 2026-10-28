-- ═══════════════════════════════════════════════════════════════════════════
-- عقود الشراكة القائمة في الحسابات النظاميّة للمنصّة (البند ١٨٩ — ما بقي منه: «حسابات ٩١١٠ للعقود القائمة»)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- الدراسة (docs/studies/accounting-ledger-ar.md §٣): في دفتر المنصّة حسابٌ نظاميّ خارج الميزانيّة، «عقود شراكة قائمة»
-- (٩١١٠، مقابله ٩١٢٠)، «ليذكّر الدفتر بما لا تملكه المنصّة ولا تدين به». أُنشئ الحسابان مع المحرّك (20261024110000)
-- ولم يُقيَّد فيهما شيء.
--
-- ما يُقيَّد: كلُّ عقدٍ وُقِّع (status = 'signed') وفيه مبلغٌ معلَن — الإيجار (`rent_amount`) أو مبلغ التمويل
-- (`finance_amount`) بعملته — قيدٌ واحد في دفتر المنصّة: مدين ٩١١٠ / دائن ٩١٢٠، بيوم التوقيع بتوقيت الخرطوم.
-- والمزارعة والمساقاة والإدارة لا مبلغ فيها (حصصٌ من الحصاد)، فلا تُقيَّد قيمةً؛ ويُعدّ كلُّ العقود الموقَّعة في
-- `agreement_memo_sync` لتراها الإدارة.
--
-- لماذا ليس زناداً عند التوقيع: قيدٌ تعذّر (لا سعر صرفٍ منشور لعقدٍ بالجنيه) كان سيُفشل التوقيع نفسه. فيُقيَّد في
-- مسك الدفاتر اليوميّ (`src/lib/bookkeeping.ts`) ما لم يُقيَّد بعد، بمفتاحٍ لكلّ عقدٍ فلا يتكرّر، وما تعذّر يبقى
-- للغد ويُعدّ. وهكذا تُقيَّد العقود القائمة قبل هذه الهجرة في أوّل تشغيل.
--
-- والقيد من قيود النظام: لا يُعكس يدويّاً (`ledger_reverse` يعرف المصدر الجديد).

create function public.agreement_memo_sync()
returns table (posted integer, skipped integer, without_amount integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_book   uuid;
  v_closed date;
  r        record;
  v_cur    text;
  v_amount numeric;
  v_minor  bigint;
  v_date   date;
  v_rate   numeric;
  v_src    text;
begin
  if auth.uid() is not null and not is_admin() then
    raise exception 'للإدارة وحدها';
  end if;
  posted := 0;
  skipped := 0;
  without_amount := 0;

  v_book := public._ledger_open_book(null, 'platform');
  perform public._ledger_sync_chart(v_book);
  select closed_through into v_closed from public.ledger_books where id = v_book;

  for r in
    select a.id, a.ref, a.model, a.terms, a.signed_at
      from public.partnership_agreements a
     where a.status = 'signed'
       and not exists (select 1 from public.journal_entries e
                        where e.book_id = v_book and e.source_type = 'agreement_memo' and e.source_id = a.id)
     order by a.signed_at nulls last, a.id
  loop
    v_amount := case r.model when 'lease' then (r.terms ->> 'rent_amount')::numeric
                             when 'finance' then (r.terms ->> 'finance_amount')::numeric end;
    v_cur := r.terms ->> 'currency';
    if v_amount is null or v_amount <= 0 or coalesce(v_cur, '') not in ('USD', 'SDG') then
      without_amount := without_amount + 1;
      continue;
    end if;
    v_minor := round(v_amount * 100)::bigint;
    v_date := greatest(coalesce((r.signed_at at time zone 'Africa/Khartoum')::date, public.ledger_today()),
                       coalesce(v_closed, date '2000-01-01') + 1);
    v_rate := null;
    v_src := null;
    if v_cur = 'SDG' then
      select x.rate into v_rate from public.ledger_fx_rate(v_date, 'parallel') x;
      if v_rate is null then
        skipped := skipped + 1;
        continue;
      end if;
      v_src := 'parallel';
    end if;

    perform public._ledger_post_src(
      v_book, v_date,
      left('عقد شراكة قائم' || coalesce(' ' || r.ref, '') || ' — '
           || case r.model when 'lease' then 'إيجار' else 'تمويل' end || ' (القيمة المعلنة)', 500),
      jsonb_build_array(
        jsonb_build_object('key', 'memo_agreements', 'side', 'D', 'currency', v_cur, 'minor', v_minor),
        jsonb_build_object('key', 'memo_contra', 'side', 'C', 'currency', v_cur, 'minor', v_minor)),
      'agreement_memo:' || r.id::text, v_rate, 'agreement_memo', r.id, null, auth.uid(), v_src);
    posted := posted + 1;
  end loop;
  return next;
end $$;

-- ── ما يكتبه النظام لا يُعكس يدويّاً ──────────────────────────────────────────
-- كما في 20261025210000، ومعها المصدر الجديد.

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
  elsif v_type = 'agreement_memo' then
    raise exception 'هذا قيدٌ نظاميّ يتبع عقد الشراكة الموقَّع ولا يُعكس يدويّاً';
  end if;
  return public._ledger_reverse(p_entry, p_reason, p_date, p_key, auth.uid());
end $$;

revoke execute on function public.agreement_memo_sync() from public, anon;
grant execute on function public.agreement_memo_sync() to authenticated, service_role;
