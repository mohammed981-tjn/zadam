-- الاعتماد بالسعر الذي رآه صاحب الدفتر (المالك، 7 نوفمبر 2026: «اقفل الثغرة الصغيرة»).
--
-- حين يُعِدّ المحاسب قيداً بعملةٍ غير عملة الدفتر ولا يكتب سعراً، يُفحص بسعر السوق المنشور يومها، وتحفظ المسوّدة
-- ما حسبه الفحص (`checked`: السعر ومصدره ومعادل كلّ سطر) فيراه صاحب الدفتر قبل أن يعتمد. لكنّ الاعتماد كان يُرحِّل
-- بسعر اللحظة: إن نُشر سعرٌ أحدث بين الإعداد والاعتماد، دخل الدفترَ رقمٌ غير الذي رآه.
--
-- الآن يُرحَّل القيد المُعَدّ بالسعر المحفوظ في المسوّدة ومصدره، فما يدخل الدفتر هو ما رآه صاحبه بالضبط. وبعد الترحيل
-- يُقارن معادل كلّ سطرٍ بما رآه؛ فإن اختلف شيءٌ (وهذا لا يكون إلا بتغييرٍ في الدفتر نفسه) يُرفض الاعتماد كلّه بجملةٍ
-- تقول ما العمل، ولا يُكتب شيء. المسوّدات القديمة بلا `checked` تُعتمد كما كانت.
--
-- التوقيع لم يتغيّر، فالصلاحيّات كما هي.

create or replace function public.ledger_draft_approve(p_draft uuid, p_via text default 'web')
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  d        public.ledger_drafts;
  b        public.ledger_books;
  v_entry  uuid;
  v_via    text := case when p_via = 'app' then 'app' else 'web' end;
  v_rate   numeric;
  v_src    text;
  v_differ boolean;
begin
  if auth.uid() is null then
    raise exception 'سجّل الدخول أولاً';
  end if;
  select * into d from public.ledger_drafts where id = p_draft for update;
  if not found then
    raise exception 'ليس هذا دفترك';
  end if;
  b := public._ledger_book_for_owner(d.book_id);
  if d.status <> 'pending' then
    raise exception 'بُتّ في هذا القيد من قبل';
  end if;
  if b.kind = 'platform' and d.prepared_by = auth.uid() then
    raise exception 'في دفتر المنصّة يعتمد القيدَ مديرٌ غيرُ من أعدّه';
  end if;

  -- The rate the owner saw: the one the preparer typed, or else the one the check found, with its source.
  v_rate := d.rate;
  v_src := null;
  if v_rate is null and d.checked is not null and nullif(d.checked ->> 'rate', '') is not null then
    v_rate := (d.checked ->> 'rate')::numeric;
    v_src := nullif(d.checked ->> 'fx_source', '');
    if v_src is not null and v_src not in ('user', 'parallel', 'bank') then
      v_src := null;
    end if;
  end if;

  -- _ledger_post_manual (20261106070000) with the rate's source carried through.
  perform set_config('sudagri.ledger_via', d.via, true);
  v_entry := public._ledger_post_src(d.book_id, d.entry_date, d.memo, d.lines, 'draft:' || d.id::text, v_rate, 'manual',
                                     d.id, null, auth.uid(), v_src);
  insert into public.ledger_entry_meta
    (entry_id, book_id, kind, template_key, document_path, via, prepared_by, approved_by, draft_id)
  values
    (v_entry, d.book_id, d.kind, d.template_key, d.document_path, d.via, d.prepared_by, auth.uid(), d.id)
  on conflict (entry_id) do nothing;
  perform set_config('sudagri.ledger_via', '', true);

  -- What was posted is what the owner saw, line by line; otherwise nothing is written.
  if d.checked is not null and jsonb_typeof(d.checked -> 'lines') = 'array' then
    select exists (
             select 1
               from jsonb_array_elements(d.checked -> 'lines') x
               full join (select * from public.journal_lines where entry_id = v_entry) l
                 on l.line_no = (x ->> 'line')::integer
              where l.entry_id is null
                 or x is null
                 or l.base_minor is distinct from (x ->> 'base')::bigint
                 or l.side is distinct from (x ->> 'side'))
      into v_differ;
    if v_differ then
      raise exception 'تغيّر في الدفتر ما يجعل هذا القيد غير الذي رأيته؛ ردّه إلى من أعدّه ليرسله من جديد';
    end if;
  end if;

  perform set_config('sudagri.ledger_via', v_via, true);
  update public.ledger_drafts
     set status = 'posted', decided_by = auth.uid(), decided_at = now(), entry_id = v_entry
   where id = d.id;
  perform set_config('sudagri.ledger_via', '', true);

  if d.prepared_by <> auth.uid() then
    perform public.notify_user(d.prepared_by, 'ledger_review', 'اعتُمد القيد الذي أعددته',
      'رُحِّل في الدفتر: ' || left(d.memo, 120), '/books/review');
  end if;
  return v_entry;
end $$;
