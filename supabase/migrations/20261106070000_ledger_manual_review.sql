-- ═══════════════════════════════════════════════════════════════════════════
-- القيد اليدويّ والمراجعة (البند ٢٠٥، قرار المالك 6 نوفمبر 2026)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- المالك: «الدفتر المحاسبة يحتاج تطوير وعمل قيد مزدوج وميزات مراجعة»، واختار كلّ ما عُرض. هذه الهجرة تبني:
--
--   ١) القيد اليدويّ: سطورٌ مدينة ودائنة من شجرة حسابات الدفتر، ببيانٍ وتاريخٍ ومستندٍ مرفق (صورة أو PDF في مجلّد
--      الكاتب نفسه من دلو `evidence`). يمرّ كلّه بدالّة النشر نفسها `_ledger_post_src` وحرّاسها: لا يُحفظ قيدٌ غير
--      متوازن بعملة القياس، ولا عملتان أجنبيّتان، ولا سعرٌ مخمَّن، ولا تاريخٌ في فترةٍ مقفلة.
--   ٢) قيودٌ جاهزة (`ledger_entry_templates`): بياناتٌ تملأ السطور ولا تنشر شيئاً بنفسها.
--   ٣) قيود التسوية (قوالب) وقيد الإقفال: `ledger_close_income` تبني قيد إقفال الإيراد والمصروف في الأرباح المحتجزة من
--      الأرصدة نفسها وتقفل الفترة معه، و`ledger_close_season` لموسمٍ بعينه؛ ولا يُقفل الشيء مرّتين.
--      وقيد الإقفال لا يدخل قائمة الدخل ولا الميزانيّة ولا ربحيّة المواسم ولا إحصاءات الرقابة (فهي تحسب الإقفال من
--      التواريخ أصلاً)، ويظهر في ميزان المراجعة وكشف الحساب كما هو. ولا يُعكس.
--   ٤) سجلّ تدقيقٍ لا يُمحى (`ledger_audit_log`): كلّ قيدٍ وسطوره وعكسه، وكلّ إعدادٍ واعتمادٍ وردٍّ وسحب، وإقفال الفترة
--      وإعادة فتحها، ومن (المعرّف والاسم) ومتى ومن أين (الموقع، التطبيق، الوكيل، النظام) وماذا (قبل وبعد). تكتبه زناداتٌ
--      على الجداول نفسها، فلا يمرّ قيدٌ من أيّ طريقٍ دون أثر. لا يُعدَّل ولا يُحذف ولا يُفرَّغ، حتى بمفتاح الخدمة أو المدير.
--   ٥) المُعِدّ والمعتمِد: صاحب الدفتر يأذن لوكيله (بإذنٍ قائم في `agent_mandates`) أو لمحاسبٍ يدعوه برقمه أو بريده
--      (حسابٌ قائم يقبل الدعوة من حسابه) أن يُعِدّ قيوداً؛ وما يُعِدّه مسوّدةٌ لا تُرحَّل حتى يعتمدها صاحب الدفتر، أو يردّها
--      بسبب. وقيود صاحب الدفتر تُرحَّل في الحال إلا إن طلب «راجع كلّ قيد».
--   ٦) تقرير الاستثناءات (`ledger_exceptions`): قيدٌ بلا مستند، ومبلغٌ أكبر من ثلاثة أمثال وسيط حسابه في ٩٠ يوماً،
--      وقيدٌ بتاريخٍ قبل كتابته بكثير، وقيدان متشابهان، ونقدٌ أو بنكٌ بالسالب، ومسوّدةٌ تنتظر منذ أيّام.
--   ٧) صاحب الدفتر يقفل الفترة (كان يستطيع في القاعدة ولم تكن له شاشة)، ولا يُعاد فتحها إلا بيد الإدارة وبسببٍ مكتوب
--      يُسجَّل ويُخبَر به صاحب الدفتر. حارس الدفتر يقبل التراجع في تلك الحال وحدها.
--
-- ما لم يتغيّر: حرّاس القيد والسطر والتوازن والحساب والعكس كما هم، وكلّ كتابةٍ بدوالّ SECURITY DEFINER تفحص المالك
-- أو الإذن صراحةً. وما يُستبدل هنا يُستبدل بنصّه ومعه إضافةٌ واحدة يقولها تعليقه.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── ٠. نوع الإشعار ───────────────────────────────────────────────────────────

do $$
declare v_def text;
begin
  select pg_get_constraintdef(oid) into v_def
    from pg_constraint
   where conname = 'notifications_kind_check' and conrelid = 'public.notifications'::regclass;
  if v_def like '%ARRAY[%' and v_def not like '%ledger_review%' then
    execute 'alter table public.notifications drop constraint notifications_kind_check';
    execute 'alter table public.notifications add constraint notifications_kind_check '
         || regexp_replace(v_def, '\]\)\)\)\s*$', ', ''ledger_review''::text])))');
    select pg_get_constraintdef(oid) into v_def
      from pg_constraint
     where conname = 'notifications_kind_check' and conrelid = 'public.notifications'::regclass;
    if v_def not like '%ledger_review%' then
      raise exception 'لم يُضَف نوع الإشعار ledger_review';
    end if;
  end if;
end $$;

-- ── ١. حساب سلف العمّال (للقيد الجاهز «سلفة عامل») ──────────────────────────

insert into public.ledger_chart_templates (kind, code, parent_code, name_ar, name_en, type, postable, system_key)
values ('farm', '1240', '12', 'سلف العمّال', 'Advances to workers', 'asset', true, 'worker_advances');

do $$
declare b uuid;
begin
  for b in select id from public.ledger_books where kind = 'farm' loop
    perform public._ledger_sync_chart(b);
  end loop;
end $$;

-- ── ٢. الجداول ───────────────────────────────────────────────────────────────

-- القيود الجاهزة: ما تملؤه السطور. `choose` يقول ما يجوز أن يبدّل المستخدمُ الحسابَ به:
--   money (نقد أو بنك أو محفظة) · expense · revenue · inventory · expense_or_inventory. والمبلغ واحدٌ للسطرين.
create table public.ledger_entry_templates (
  key        text primary key check (key ~ '^[a-z_]{3,40}$'),
  book_kinds text[] not null check (cardinality(book_kinds) between 1 and 3 and book_kinds <@ array['farm', 'investor', 'platform']),
  grp        text not null check (grp in ('daily', 'adjusting')),
  name_ar    text not null,
  name_en    text not null,
  hint_ar    text not null,
  hint_en    text not null,
  lines      jsonb not null check (jsonb_typeof(lines) = 'array' and jsonb_array_length(lines) between 2 and 6),
  sort       smallint not null
);

insert into public.ledger_entry_templates (key, book_kinds, grp, name_ar, name_en, hint_ar, hint_en, lines, sort) values
  ('purchase_credit', '{farm}', 'daily', 'شراء آجل', 'Purchase on credit',
   'اشتريت مدخلاتٍ أو خدمةً ولم تدفع بعد: يزيد المصروف (أو المخزون) ويزيد ما عليك للمورّد.',
   'You bought inputs or a service and have not paid yet: the cost (or the stock) goes up, and so does what you owe the supplier.',
   '[{"side":"D","key":"cost_seeds","choose":"expense_or_inventory"},{"side":"C","key":"payables_suppliers"}]', 10),
  ('pay_supplier', '{farm}', 'daily', 'سداد مورّد', 'Paying a supplier',
   'دفعت لمورّدٍ ما كان عليك له: ينقص ما عليك وينقص النقد أو البنك.',
   'You paid a supplier what you owed: what you owe goes down, and so does the cash or the bank.',
   '[{"side":"D","key":"payables_suppliers"},{"side":"C","key":"cash_on_hand","choose":"money"}]', 20),
  ('sale_credit', '{farm}', 'daily', 'بيع آجل', 'Sale on credit',
   'بعت محصولاً ولم تقبض بعد: يزيد الإيراد ويزيد ما لك عند المشتري.',
   'You sold a crop and have not been paid yet: the income goes up, and so does what the buyer owes you.',
   '[{"side":"D","key":"receivable_buyers"},{"side":"C","key":"sales_crops","choose":"revenue"}]', 30),
  ('collect_customer', '{farm}', 'daily', 'تحصيل من مشترٍ', 'Collection from a customer',
   'قبضت من مشترٍ ما كان له عليك: يزيد النقد أو البنك وينقص ما لك عنده.',
   'A buyer paid what they owed: the cash or the bank goes up, and what they owe you goes down.',
   '[{"side":"D","key":"cash_on_hand","choose":"money"},{"side":"C","key":"receivable_buyers"}]', 40),
  ('worker_advance', '{farm}', 'daily', 'سلفة عامل', 'Advance to a worker',
   'أعطيت عاملاً سلفةً تُخصم من أجره لاحقاً: هي له دينٌ عليه لا مصروف.',
   'You advanced a worker money to be taken from their wages: it is a debt they owe, not a cost.',
   '[{"side":"D","key":"worker_advances"},{"side":"C","key":"cash_on_hand","choose":"money"}]', 50),
  ('bank_deposit', '{farm,investor}', 'daily', 'إيداع في البنك', 'Bank deposit',
   'أودعت نقداً في البنك: ينقص النقد ويزيد البنك بالمبلغ نفسه.',
   'You paid cash into the bank: the cash goes down and the bank goes up by the same amount.',
   '[{"side":"D","key":"bank","choose":"money"},{"side":"C","key":"cash_on_hand","choose":"money"}]', 60),
  ('bank_withdrawal', '{farm,investor}', 'daily', 'سحب من البنك', 'Bank withdrawal',
   'سحبت من البنك نقداً: ينقص البنك ويزيد النقد بالمبلغ نفسه.',
   'You took cash out of the bank: the bank goes down and the cash goes up by the same amount.',
   '[{"side":"D","key":"cash_on_hand","choose":"money"},{"side":"C","key":"bank","choose":"money"}]', 70),
  ('accrued_wages', '{farm}', 'adjusting', 'أجورٌ مستحقّة لم تُدفع', 'Wages earned, not yet paid',
   'آخر الفترة: عملٌ تمّ وأجره لم يُدفع. يُحمَّل المصروف على فترته ويُسجَّل ما عليك للعمّال.',
   'End of period: work done whose wages are not paid yet. The cost goes to its period, and what you owe the workers is recorded.',
   '[{"side":"D","key":"cost_labour","choose":"expense"},{"side":"C","key":"accrued_wages"}]', 110),
  ('accrued_expense', '{farm}', 'adjusting', 'مصروفٌ مستحقّ', 'Accrued expense',
   'آخر الفترة: خدمةٌ أو مدخلاتٌ استُعملت ولم تصل فاتورتها. يُحمَّل المصروف على فترته.',
   'End of period: a service or inputs used whose bill has not arrived. The cost goes to its period.',
   '[{"side":"D","key":"cost_other","choose":"expense"},{"side":"C","key":"payables_suppliers"}]', 120),
  ('prepaid_expense', '{farm}', 'adjusting', 'دفعةٌ مقدّمة', 'Prepayment',
   'دفعت اليوم عن شيءٍ يُستعمل لاحقاً (إيجار موسمٍ قادم، تأمين): هو أصلٌ حتى يُستعمل.',
   'You paid today for something used later (next season''s rent, insurance): it is an asset until it is used.',
   '[{"side":"D","key":"supplier_advances"},{"side":"C","key":"cash_on_hand","choose":"money"}]', 130),
  ('prepaid_used', '{farm}', 'adjusting', 'استهلاك دفعةٍ مقدّمة', 'Prepayment used up',
   'آخر الفترة: ما استُعمل من الدفعة المقدّمة يصير مصروف فترته.',
   'End of period: the part of the prepayment used up becomes the cost of its period.',
   '[{"side":"D","key":"cost_other","choose":"expense"},{"side":"C","key":"supplier_advances"}]', 140),
  ('inventory_shortage', '{farm}', 'adjusting', 'نقص المخزون عند الجرد', 'Stock short at the count',
   'عددت المخزون فوجدته أقلّ من الدفتر: الفرق خسارةٌ في فترته.',
   'You counted the stock and found less than the book: the difference is a loss of its period.',
   '[{"side":"D","key":"crop_loss"},{"side":"C","key":"inventory_inputs","choose":"inventory"}]', 150),
  ('inventory_surplus', '{farm}', 'adjusting', 'زيادة المخزون عند الجرد', 'Stock over at the count',
   'عددت المخزون فوجدته أكثر من الدفتر: الفرق إيرادٌ آخر في فترته.',
   'You counted the stock and found more than the book: the difference is other income of its period.',
   '[{"side":"D","key":"inventory_inputs","choose":"inventory"},{"side":"C","key":"other_income"}]', 160);

-- إعداد الدفتر: «راجع كلّ قيد» (قيود صاحب الدفتر نفسه تنتظر اعتماده كما تنتظر قيود المُعِدّ).
create table public.ledger_book_settings (
  book_id       uuid primary key references public.ledger_books(id) on delete restrict,
  always_review boolean not null default false,
  updated_by    uuid,
  updated_at    timestamptz not null default now()
);

-- من يُعِدّ القيود لدفترٍ ليس له: وكيلٌ بإذنٍ قائم، أو محاسبٌ دعاه صاحب الدفتر فقبل من حسابه.
create table public.ledger_preparers (
  id           uuid primary key default gen_random_uuid(),
  book_id      uuid not null references public.ledger_books(id) on delete restrict,
  preparer_id  uuid not null references auth.users(id) on delete restrict,
  role         text not null check (role in ('agent', 'accountant')),
  mandate_id   uuid references public.agent_mandates(id) on delete restrict,
  -- آخر أربعة أرقام من الجوّال أو البريد مقنَّعاً: يعرف بها صاحب الدفتر دعوته قبل أن تُقبل.
  contact_tail text check (contact_tail is null or length(contact_tail) between 1 and 80),
  status       text not null check (status in ('invited', 'active', 'declined', 'ended')),
  invited_by   uuid not null,
  invited_at   timestamptz not null default now(),
  answered_at  timestamptz,
  ended_at     timestamptz,
  ended_by     uuid,
  constraint ledger_preparers_agent_shape check ((role = 'agent') = (mandate_id is not null)),
  constraint ledger_preparers_tail_shape check ((role = 'accountant') = (contact_tail is not null)),
  constraint ledger_preparers_end_shape check ((ended_at is not null) = (status = 'ended') and (ended_by is not null) = (ended_at is not null))
);

create unique index ledger_preparers_open on public.ledger_preparers (book_id, preparer_id) where status in ('invited', 'active');
create index ledger_preparers_mine on public.ledger_preparers (preparer_id) where status in ('invited', 'active');

-- القيد المُعَدّ: ينتظر الاعتماد. محتواه لا يتغيّر؛ يُبتّ فيه مرّةً: يُرحَّل أو يُردّ أو يسحبه مُعِدّه.
create table public.ledger_drafts (
  id            uuid primary key default gen_random_uuid(),
  book_id       uuid not null references public.ledger_books(id) on delete restrict,
  client_key    text not null check (length(client_key) between 8 and 120),
  prepared_by   uuid not null,
  preparer_ref  uuid references public.ledger_preparers(id) on delete restrict,
  via           text not null check (via in ('web', 'app', 'agent')),
  kind          text not null check (kind in ('manual', 'template', 'adjusting')),
  template_key  text references public.ledger_entry_templates(key),
  entry_date    date not null,
  memo          text not null check (length(btrim(memo)) between 1 and 500),
  lines         jsonb not null check (jsonb_typeof(lines) = 'array'),
  rate          numeric(18, 6),
  document_path text,
  status        text not null default 'pending' check (status in ('pending', 'posted', 'rejected', 'withdrawn')),
  decided_by    uuid,
  decided_at    timestamptz,
  decision_note text check (decision_note is null or length(decision_note) <= 300),
  entry_id      uuid references public.journal_entries(id) on delete restrict,
  created_at    timestamptz not null default now(),
  unique (book_id, client_key),
  constraint ledger_drafts_decided check ((status = 'pending') = (decided_at is null)),
  constraint ledger_drafts_posted check ((status = 'posted') = (entry_id is not null))
);

create index ledger_drafts_book on public.ledger_drafts (book_id, status, created_at);
create index ledger_drafts_preparer on public.ledger_drafts (prepared_by, created_at desc);

-- ما يُعرف عن القيد اليدويّ ولا يحمله رأسُه: نوعه وقالبه ومستنده ومن أعدّه ومن اعتمده. يُلحَق ولا يُعدَّل.
create table public.ledger_entry_meta (
  entry_id      uuid primary key references public.journal_entries(id) on delete restrict,
  book_id       uuid not null references public.ledger_books(id) on delete restrict,
  kind          text not null check (kind in ('manual', 'template', 'adjusting')),
  template_key  text references public.ledger_entry_templates(key),
  document_path text,
  via           text not null check (via in ('web', 'app', 'agent')),
  prepared_by   uuid,
  approved_by   uuid,
  draft_id      uuid references public.ledger_drafts(id) on delete restrict,
  created_at    timestamptz not null default now()
);

create index ledger_entry_meta_book on public.ledger_entry_meta (book_id);

-- قيود الإقفال: فترةٌ (حتى يوم) أو موسم. لا يُقفل الشيء مرّتين.
create table public.ledger_closings (
  id          uuid primary key,
  book_id     uuid not null references public.ledger_books(id) on delete restrict,
  scope       text not null check (scope in ('period', 'season')),
  season_id   uuid,
  period_from date,
  period_to   date not null,
  entry_id    uuid not null references public.journal_entries(id) on delete restrict,
  created_by  uuid,
  created_at  timestamptz not null default now(),
  constraint ledger_closings_shape check ((scope = 'season') = (season_id is not null))
);

create unique index ledger_closings_one_season on public.ledger_closings (book_id, season_id) where scope = 'season';
create unique index ledger_closings_one_period on public.ledger_closings (book_id, period_to) where scope = 'period';

-- إعادة فتح الفترة: بيد الإدارة وحدها، بسبب. `tx` هي المعاملة التي فتحت؛ حارس الدفتر لا يقبل التراجع إلا فيها.
create table public.ledger_period_reopens (
  id           uuid primary key default gen_random_uuid(),
  book_id      uuid not null references public.ledger_books(id) on delete restrict,
  was_through  date not null,
  now_through  date,
  reason       text not null check (length(btrim(reason)) between 10 and 500),
  reopened_by  uuid not null,
  reopened_at  timestamptz not null default now(),
  tx           bigint not null default txid_current()
);

create index ledger_period_reopens_book on public.ledger_period_reopens (book_id, reopened_at desc);

-- سجلّ التدقيق.
create table public.ledger_audit_log (
  id         bigint generated always as identity primary key,
  book_id    uuid not null references public.ledger_books(id) on delete restrict,
  at         timestamptz not null default clock_timestamp(),
  actor_id   uuid,
  actor_name text not null default '',
  via        text not null check (via in ('web', 'app', 'agent', 'system')),
  action     text not null check (action in (
               'entry_posted', 'entry_reversed', 'lines_posted',
               'draft_submitted', 'draft_approved', 'draft_rejected', 'draft_withdrawn',
               'period_closed', 'period_reopened', 'closing_posted',
               'preparer_invited', 'preparer_added', 'preparer_accepted', 'preparer_declined', 'preparer_ended',
               'review_setting')),
  entry_id   uuid,
  draft_id   uuid,
  before     jsonb,
  after      jsonb
);

create index ledger_audit_log_book on public.ledger_audit_log (book_id, id desc);
create index ledger_audit_log_entry on public.ledger_audit_log (entry_id) where entry_id is not null;

comment on table public.ledger_audit_log is
  'سجلّ تدقيق الدفاتر: يُلحَق بزناداتٍ على الجداول نفسها، ولا يُعدَّل ولا يُحذف ولا يُفرَّغ، حتى بمفتاح الخدمة أو المدير.';

-- ── ٣. الحرّاس ───────────────────────────────────────────────────────────────

create function public.ledger_append_only()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  raise exception 'سجلّ الدفتر يُلحَق ولا يُعدَّل ولا يُحذف، حتى على المدير';
end $$;

create trigger ledger_audit_log_keep before update or delete on public.ledger_audit_log
  for each row execute function public.ledger_append_only();
create trigger ledger_audit_log_no_truncate before truncate on public.ledger_audit_log
  for each statement execute function public.ledger_append_only();
create trigger ledger_entry_meta_keep before update or delete on public.ledger_entry_meta
  for each row execute function public.ledger_append_only();
create trigger ledger_entry_meta_no_truncate before truncate on public.ledger_entry_meta
  for each statement execute function public.ledger_append_only();
create trigger ledger_closings_keep before update or delete on public.ledger_closings
  for each row execute function public.ledger_append_only();
create trigger ledger_closings_no_truncate before truncate on public.ledger_closings
  for each statement execute function public.ledger_append_only();
create trigger ledger_period_reopens_keep before update or delete on public.ledger_period_reopens
  for each row execute function public.ledger_append_only();
create trigger ledger_period_reopens_no_truncate before truncate on public.ledger_period_reopens
  for each statement execute function public.ledger_append_only();
create trigger ledger_entry_templates_keep before update or delete on public.ledger_entry_templates
  for each row execute function public.ledger_append_only();
create trigger ledger_entry_templates_no_truncate before truncate on public.ledger_entry_templates
  for each statement execute function public.ledger_append_only();

create function public.ledger_drafts_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'DELETE' or tg_op = 'TRUNCATE' then
    raise exception 'القيود المُعَدّة لا تُحذف؛ تُسحب أو تُردّ';
  end if;
  if (new.id, new.book_id, new.client_key, new.prepared_by, new.preparer_ref, new.via, new.kind, new.template_key,
      new.entry_date, new.memo, new.lines, new.rate, new.document_path, new.created_at)
     is distinct from
     (old.id, old.book_id, old.client_key, old.prepared_by, old.preparer_ref, old.via, old.kind, old.template_key,
      old.entry_date, old.memo, old.lines, old.rate, old.document_path, old.created_at) then
    raise exception 'لا يتغيّر من القيد المُعَدّ إلا البتّ فيه';
  end if;
  if old.status <> 'pending' then
    raise exception 'بُتّ في هذا القيد من قبل';
  end if;
  return new;
end $$;

create trigger ledger_drafts_guard before update or delete on public.ledger_drafts
  for each row execute function public.ledger_drafts_guard();
create trigger ledger_drafts_no_truncate before truncate on public.ledger_drafts
  for each statement execute function public.ledger_drafts_guard();

create function public.ledger_preparers_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'DELETE' or tg_op = 'TRUNCATE' then
    raise exception 'سجلّ المُعِدّين لا يُحذف؛ يُنهى الإذن';
  end if;
  if (new.id, new.book_id, new.preparer_id, new.role, new.mandate_id, new.contact_tail, new.invited_by, new.invited_at)
     is distinct from
     (old.id, old.book_id, old.preparer_id, old.role, old.mandate_id, old.contact_tail, old.invited_by, old.invited_at) then
    raise exception 'لا يتغيّر من إذن المُعِدّ إلا حاله';
  end if;
  if new.status is distinct from old.status
     and not ((old.status = 'invited' and new.status in ('active', 'declined', 'ended'))
              or (old.status = 'active' and new.status = 'ended')) then
    raise exception 'انتقالٌ غير مسموح: % ← %', old.status, new.status;
  end if;
  return new;
end $$;

create trigger ledger_preparers_guard before update or delete on public.ledger_preparers
  for each row execute function public.ledger_preparers_guard();
create trigger ledger_preparers_no_truncate before truncate on public.ledger_preparers
  for each statement execute function public.ledger_preparers_guard();

create function public.ledger_book_settings_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'DELETE' or tg_op = 'TRUNCATE' then
    raise exception 'إعداد الدفتر لا يُحذف؛ يُغيَّر';
  end if;
  if new.book_id is distinct from old.book_id then
    raise exception 'إعداد الدفتر لا يُنقل إلى دفترٍ آخر';
  end if;
  return new;
end $$;

create trigger ledger_book_settings_guard before update or delete on public.ledger_book_settings
  for each row execute function public.ledger_book_settings_guard();
create trigger ledger_book_settings_no_truncate before truncate on public.ledger_book_settings
  for each statement execute function public.ledger_book_settings_guard();

-- حارس الدفتر (20261024110000) كما هو، وفيه طريقٌ واحدٌ إلى الوراء: إعادة فتحٍ سجّلتها الإدارة في المعاملة نفسها
-- (`ledger_period_reopen`)، إلى التاريخ الذي سجّلته بالضبط. وصار يعمل بصلاحية مالكه ليقرأ ذلك السجلّ.
create or replace function public.ledger_book_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'الدفاتر لا تُحذف';
  end if;
  if (new.id, new.owner_id, new.kind, new.base_currency, new.created_at)
     is distinct from (old.id, old.owner_id, old.kind, old.base_currency, old.created_at) then
    raise exception 'لا يتغيّر من الدفتر إلا تاريخ الإقفال';
  end if;
  if new.closed_through is null and old.closed_through is not null
     or new.closed_through < old.closed_through then
    if not exists (
      select 1 from public.ledger_period_reopens r
       where r.book_id = new.id
         and r.was_through = old.closed_through
         and r.now_through is not distinct from new.closed_through
         and r.tx = txid_current()) then
      raise exception 'الفترة المقفلة لا تُفتح من جديد';
    end if;
  end if;
  return new;
end $$;

-- ── ٤. من ومن أين ────────────────────────────────────────────────────────────

-- From where a write came: what the platform's own function said (it sets `sudagri.ledger_via` for its own statement),
-- else the phone app's header (the app's server routes send `x-sudagri-via: app`), else the service key ("system") or a
-- signed-in reader on the website. Informational: who did it is auth.uid(), which no header can change.
create function public._ledger_via()
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v text := nullif(current_setting('sudagri.ledger_via', true), '');
  h text;
begin
  if v in ('web', 'app', 'agent', 'system') then
    return v;
  end if;
  begin
    h := lower(nullif(current_setting('request.headers', true), '')::json ->> 'x-sudagri-via');
  exception when others then
    h := null;
  end;
  if h = 'app' then
    return 'app';
  end if;
  if auth.uid() is null then
    return 'system';
  end if;
  return 'web';
end $$;

create function public._ledger_actor_name(p_user uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$ select coalesce((select nullif(btrim(full_name), '') from public.profiles where id = p_user), '') $$;

create function public._ledger_audit(
  p_book   uuid,
  p_action text,
  p_entry  uuid,
  p_draft  uuid,
  p_before jsonb,
  p_after  jsonb,
  p_actor  uuid default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := coalesce(auth.uid(), p_actor);
begin
  insert into public.ledger_audit_log (book_id, actor_id, actor_name, via, action, entry_id, draft_id, before, after)
  values (p_book, v_actor, public._ledger_actor_name(v_actor), public._ledger_via(), p_action, p_entry, p_draft, p_before, p_after);
end $$;

-- ── ٥. السجلّ يُكتب من الجداول نفسها ─────────────────────────────────────────

create function public._ledger_audit_entry()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public._ledger_audit(
    new.book_id,
    case when new.reversal_of is null then 'entry_posted' else 'entry_reversed' end,
    new.id, null, null,
    jsonb_build_object('entry_no', new.entry_no, 'entry_date', new.entry_date, 'memo', new.memo,
                       'source_type', new.source_type, 'source_id', new.source_id, 'reversal_of', new.reversal_of,
                       'fx_rate', new.fx_rate, 'fx_source', new.fx_source, 'link_id', new.link_id,
                       'created_by', new.created_by),
    new.created_by);
  return null;
end $$;

create trigger journal_entries_audit after insert on public.journal_entries
  for each row execute function public._ledger_audit_entry();

-- Every line inserted, grouped by its entry, once per statement: a line can only be written with its entry today, and
-- the log would show it if anything ever wrote one later.
create function public._ledger_audit_lines()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
begin
  for r in
    select n.book_id, n.entry_id,
           jsonb_agg(jsonb_build_object('line', n.line_no, 'account', a.code, 'side', n.side, 'currency', n.currency,
                                        'minor', n.amount_minor, 'base', n.base_minor, 'season', n.season_id)
                     order by n.line_no) as lines,
           coalesce(sum(n.base_minor) filter (where n.side = 'D'), 0) as d,
           coalesce(sum(n.base_minor) filter (where n.side = 'C'), 0) as c
      from new_lines n
      join public.ledger_accounts a on a.id = n.account_id
     group by n.book_id, n.entry_id
  loop
    perform public._ledger_audit(
      r.book_id, 'lines_posted', r.entry_id, null, null,
      jsonb_build_object('lines', r.lines, 'debit', r.d, 'credit', r.c),
      (select created_by from public.journal_entries where id = r.entry_id));
  end loop;
  return null;
end $$;

create trigger journal_lines_audit after insert on public.journal_lines
  referencing new table as new_lines
  for each statement execute function public._ledger_audit_lines();

create function public._ledger_audit_book()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reason text;
begin
  if new.closed_through is not distinct from old.closed_through then
    return null;
  end if;
  if old.closed_through is null or new.closed_through > old.closed_through then
    perform public._ledger_audit(new.id, 'period_closed', null, null,
      jsonb_build_object('closed_through', old.closed_through), jsonb_build_object('closed_through', new.closed_through));
  else
    select reason into v_reason from public.ledger_period_reopens
     where book_id = new.id and tx = txid_current() order by reopened_at desc limit 1;
    perform public._ledger_audit(new.id, 'period_reopened', null, null,
      jsonb_build_object('closed_through', old.closed_through),
      jsonb_build_object('closed_through', new.closed_through, 'reason', v_reason));
  end if;
  return null;
end $$;

create trigger ledger_books_audit after update of closed_through on public.ledger_books
  for each row execute function public._ledger_audit_book();

create function public._ledger_audit_draft()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_total bigint;
begin
  if tg_op = 'INSERT' then
    select coalesce(sum((x ->> 'minor')::bigint) filter (where x ->> 'side' = 'D'), 0)
      into v_total from jsonb_array_elements(new.lines) x;
    perform public._ledger_audit(new.book_id, 'draft_submitted', null, new.id, null,
      jsonb_build_object('entry_date', new.entry_date, 'memo', new.memo, 'kind', new.kind, 'template', new.template_key,
                         'lines', new.lines, 'rate', new.rate, 'document', new.document_path,
                         'prepared_by', new.prepared_by, 'debit_minor', v_total));
    return null;
  end if;
  if new.status is distinct from old.status then
    perform public._ledger_audit(new.book_id,
      case new.status when 'posted' then 'draft_approved' when 'rejected' then 'draft_rejected' else 'draft_withdrawn' end,
      new.entry_id, new.id,
      jsonb_build_object('status', old.status),
      jsonb_build_object('status', new.status, 'note', new.decision_note, 'entry_id', new.entry_id,
                         'prepared_by', new.prepared_by));
  end if;
  return null;
end $$;

create trigger ledger_drafts_audit after insert or update on public.ledger_drafts
  for each row execute function public._ledger_audit_draft();

create function public._ledger_audit_preparer()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_after jsonb := jsonb_build_object('preparer_ref', new.id, 'preparer_id', new.preparer_id, 'role', new.role,
                                      'mandate_id', new.mandate_id, 'contact_tail', new.contact_tail, 'status', new.status);
begin
  if tg_op = 'INSERT' then
    perform public._ledger_audit(new.book_id, case when new.status = 'active' then 'preparer_added' else 'preparer_invited' end,
                                 null, null, null, v_after);
  elsif new.status is distinct from old.status then
    perform public._ledger_audit(new.book_id,
      case new.status when 'active' then 'preparer_accepted' when 'declined' then 'preparer_declined' else 'preparer_ended' end,
      null, null, jsonb_build_object('status', old.status), v_after);
  end if;
  return null;
end $$;

create trigger ledger_preparers_audit after insert or update on public.ledger_preparers
  for each row execute function public._ledger_audit_preparer();

create function public._ledger_audit_setting()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' and new.always_review is not distinct from old.always_review then
    return null;
  end if;
  perform public._ledger_audit(new.book_id, 'review_setting', null, null,
    case when tg_op = 'UPDATE' then jsonb_build_object('always_review', old.always_review)
         else jsonb_build_object('always_review', false) end,
    jsonb_build_object('always_review', new.always_review));
  return null;
end $$;

create trigger ledger_book_settings_audit after insert or update on public.ledger_book_settings
  for each row execute function public._ledger_audit_setting();

create function public._ledger_audit_closing()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public._ledger_audit(new.book_id, 'closing_posted', new.entry_id, null, null,
    jsonb_build_object('scope', new.scope, 'season_id', new.season_id, 'period_from', new.period_from,
                       'period_to', new.period_to));
  return null;
end $$;

create trigger ledger_closings_audit after insert on public.ledger_closings
  for each row execute function public._ledger_audit_closing();

-- ── ٦. الصلاحيّات وسياسات القراءة ─────────────────────────────────────────────

alter table public.ledger_entry_templates enable row level security;
alter table public.ledger_book_settings enable row level security;
alter table public.ledger_preparers enable row level security;
alter table public.ledger_drafts enable row level security;
alter table public.ledger_entry_meta enable row level security;
alter table public.ledger_closings enable row level security;
alter table public.ledger_period_reopens enable row level security;
alter table public.ledger_audit_log enable row level security;

revoke all on table
  public.ledger_entry_templates, public.ledger_book_settings, public.ledger_preparers, public.ledger_drafts,
  public.ledger_entry_meta, public.ledger_closings, public.ledger_period_reopens, public.ledger_audit_log
  from public, anon, authenticated, service_role;

grant select on
  public.ledger_entry_templates, public.ledger_book_settings, public.ledger_preparers, public.ledger_drafts,
  public.ledger_entry_meta, public.ledger_closings, public.ledger_period_reopens, public.ledger_audit_log
  to authenticated;

create policy ledger_entry_templates_read on public.ledger_entry_templates
  for select to authenticated using (true);
-- The book's reader — its owner, the administrators for the platform's book, an administrator while an inspection of
-- it stands — reads its settings, preparers, drafts, documents, closings, reopenings and audit log. A preparer reads
-- his own invitation and his own drafts, and nothing else of the book.
create policy ledger_book_settings_read on public.ledger_book_settings
  for select to authenticated using (public._ledger_book_readable(book_id));
create policy ledger_preparers_read on public.ledger_preparers
  for select to authenticated using (preparer_id = (select auth.uid()) or public._ledger_book_readable(book_id));
create policy ledger_drafts_read on public.ledger_drafts
  for select to authenticated using (prepared_by = (select auth.uid()) or public._ledger_book_readable(book_id));
create policy ledger_entry_meta_read on public.ledger_entry_meta
  for select to authenticated using (public._ledger_book_readable(book_id));
create policy ledger_closings_read on public.ledger_closings
  for select to authenticated using (public._ledger_book_readable(book_id));
create policy ledger_period_reopens_read on public.ledger_period_reopens
  for select to authenticated using (public._ledger_book_readable(book_id));
create policy ledger_audit_log_read on public.ledger_audit_log
  for select to authenticated using (public._ledger_book_readable(book_id));

-- ── ٧. مساعدات ───────────────────────────────────────────────────────────────

-- The caller's own book (or the platform's, for an administrator), else a refusal.
create function public._ledger_book_for_owner(p_book uuid)
returns public.ledger_books
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  b public.ledger_books;
begin
  if auth.uid() is null then
    raise exception 'سجّل الدخول أولاً';
  end if;
  select * into b from public.ledger_books
   where id = p_book and (owner_id = auth.uid() or (kind = 'platform' and is_admin()));
  if not found then
    raise exception 'ليس هذا دفترك';
  end if;
  return b;
end $$;

-- The caller's standing permission to prepare entries for this book, read afresh each time: an accountant who accepted,
-- or an agent whose mandate from this book's owner still stands (company verified and active, the caller its owner).
-- Nothing (all fields null) otherwise, and nothing once either account is closed.
create function public._ledger_preparer_active(p_book uuid)
returns public.ledger_preparers
language sql
stable
security definer
set search_path = public
as $$
  select p.*
    from public.ledger_preparers p
    join public.ledger_books b on b.id = p.book_id
   where p.book_id = p_book
     and p.preparer_id = auth.uid()
     and p.status = 'active'
     and b.owner_id is not null
     and not exists (select 1 from public.closed_accounts x where x.user_id in (b.owner_id, p.preparer_id))
     and (p.role = 'accountant'
          or exists (select 1 from public.agent_mandates m
                       join public.partner_companies c on c.id = m.company_id
                      where m.id = p.mandate_id and m.status = 'active' and m.farmer_id = b.owner_id
                        and c.owner_id = auth.uid() and c.verified_at is not null and c.active))
   limit 1
$$;

-- A document attached to an entry: a file the writer put in his own `ledger` folder of the evidence bucket, and there.
create function public._ledger_document_ok(p_path text)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v text := nullif(btrim(coalesce(p_path, '')), '');
begin
  if v is null then
    return null;
  end if;
  if v !~ ('^' || auth.uid()::text || '/ledger/[A-Za-z0-9._-]{1,120}$') or v like '%..%' then
    raise exception 'مسار المستند ليس في مجلّدك';
  end if;
  if to_regclass('storage.objects') is not null
     and not exists (select 1 from storage.objects where bucket_id = 'evidence' and name = v) then
    raise exception 'لم نجد الملفّ المرفوع. ارفعه ثمّ سجّله.';
  end if;
  return v;
end $$;

-- Runs the posting function itself on the lines and throws the result away: a draft is held to exactly the rules its
-- posting will meet (balance in the book's base currency, one foreign currency, a rate typed or published, accounts that
-- take entries, a date outside the closed period). The rollback leaves nothing but a skipped entry number.
create function public._ledger_dry_run(p_book uuid, p_date date, p_memo text, p_lines jsonb, p_rate numeric)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  begin
    perform public._ledger_post_src(p_book, p_date, p_memo, p_lines, 'dryrun:' || gen_random_uuid()::text, p_rate,
                                    'manual', null, null, auth.uid(), null);
    raise exception using errcode = 'SA205', message = 'dry run';
  exception when sqlstate 'SA205' then
    null;
  end;
end $$;

-- Posts a manual entry and what is known about it, through the one posting function.
create function public._ledger_post_manual(
  p_book        uuid,
  p_date        date,
  p_memo        text,
  p_lines       jsonb,
  p_key         text,
  p_rate        numeric,
  p_kind        text,
  p_template    text,
  p_document    text,
  p_via         text,
  p_prepared_by uuid,
  p_draft       uuid
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_entry uuid;
begin
  perform set_config('sudagri.ledger_via', p_via, true);
  v_entry := public._ledger_post_src(p_book, p_date, p_memo, p_lines, p_key, p_rate, 'manual', p_draft, null,
                                     auth.uid(), null);
  insert into public.ledger_entry_meta
    (entry_id, book_id, kind, template_key, document_path, via, prepared_by, approved_by, draft_id)
  values
    (v_entry, p_book, p_kind, p_template, p_document, p_via, p_prepared_by,
     case when p_draft is not null then auth.uid() end, p_draft)
  on conflict (entry_id) do nothing;
  perform set_config('sudagri.ledger_via', '', true);
  return v_entry;
end $$;

-- ── ٨. كتابة القيد ───────────────────────────────────────────────────────────
--
-- `p_lines` كما في ledger_post. `p_key` مفتاحٌ يصنعه المرسِل (المرّة الثانية بالمفتاح نفسه لا تكتب شيئاً).
-- يُرحَّل في الحال إن كتبه صاحب الدفتر ولم يطلب «راجع كلّ قيد»؛ وإلا يصير قيداً مُعَدّاً ينتظر اعتماده.
-- يُرجع {status: posted, entry_id} أو {status: pending, draft_id}.

create function public.ledger_entry_submit(
  p_book     uuid,
  p_date     date,
  p_memo     text,
  p_lines    jsonb,
  p_key      text,
  p_rate     numeric default null,
  p_kind     text default 'manual',
  p_template text default null,
  p_document text default null,
  p_via      text default 'web'
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_book   public.ledger_books;
  v_owner  boolean;
  v_prep   public.ledger_preparers;
  v_tpl    public.ledger_entry_templates;
  v_kind   text;
  v_via    text := case when p_via = 'app' then 'app' else 'web' end;
  v_memo   text := btrim(coalesce(p_memo, ''));
  v_doc    text;
  v_review boolean;
  v_entry  uuid;
  v_draft  public.ledger_drafts;
  v_id     uuid;
  v_name   text;
begin
  if auth.uid() is null then
    raise exception 'سجّل الدخول أولاً';
  end if;
  select * into v_book from public.ledger_books where id = p_book;
  if not found then
    raise exception 'ليس هذا دفترك';
  end if;
  v_owner := v_book.owner_id = auth.uid() or (v_book.kind = 'platform' and is_admin());
  if not v_owner then
    v_prep := public._ledger_preparer_active(p_book);
    if v_prep.id is null then
      raise exception 'ليس هذا دفترك';
    end if;
    if v_prep.role = 'agent' then
      v_via := 'agent';
    end if;
  end if;

  if p_key is null or length(p_key) not between 8 and 120 then
    raise exception 'مفتاح القيد غير صالح';
  end if;
  if length(v_memo) not between 1 and 500 then
    raise exception 'اكتب بيان القيد (حتى ٥٠٠ حرف)';
  end if;
  if p_template is not null and p_template <> '' then
    select * into v_tpl from public.ledger_entry_templates where key = p_template and v_book.kind = any (book_kinds);
    if not found then
      raise exception 'قيدٌ جاهز غير معروف لهذا الدفتر';
    end if;
    v_kind := case v_tpl.grp when 'adjusting' then 'adjusting' else 'template' end;
  else
    if coalesce(p_kind, 'manual') not in ('manual', 'adjusting') then
      raise exception 'نوع القيد إمّا يدويّ أو تسوية أو من قيدٍ جاهز';
    end if;
    v_kind := coalesce(p_kind, 'manual');
  end if;
  v_doc := public._ledger_document_ok(p_document);

  select always_review into v_review from public.ledger_book_settings where book_id = p_book;

  if v_owner and not coalesce(v_review, false) then
    v_entry := public._ledger_post_manual(p_book, p_date, v_memo, p_lines, 'manual:' || p_key, p_rate, v_kind,
                                          v_tpl.key, v_doc, v_via, auth.uid(), null);
    return jsonb_build_object('status', 'posted', 'entry_id', v_entry);
  end if;

  -- A draft. The same key again is the same draft (a reply that was lost); the same key with other content is refused.
  select * into v_draft from public.ledger_drafts where book_id = p_book and client_key = p_key;
  if found then
    if v_draft.prepared_by = auth.uid() and v_draft.entry_date is not distinct from p_date and v_draft.memo = v_memo
       and v_draft.lines = p_lines and v_draft.rate is not distinct from round(p_rate, 6)
       and v_draft.document_path is not distinct from v_doc and v_draft.template_key is not distinct from v_tpl.key then
      return jsonb_build_object('status', case when v_draft.status = 'posted' then 'posted' else v_draft.status end,
                                'draft_id', v_draft.id, 'entry_id', v_draft.entry_id);
    end if;
    raise exception 'مفتاح القيد هذا استُعمل لقيدٍ مختلف';
  end if;
  if (select count(*) from public.ledger_drafts where book_id = p_book and status = 'pending') >= 200 then
    raise exception 'في هذا الدفتر ٢٠٠ قيدٍ ينتظر المراجعة؛ يُبتّ فيها أوّلاً';
  end if;

  perform public._ledger_dry_run(p_book, p_date, v_memo, p_lines, p_rate);

  perform set_config('sudagri.ledger_via', v_via, true);
  insert into public.ledger_drafts
    (book_id, client_key, prepared_by, preparer_ref, via, kind, template_key, entry_date, memo, lines, rate, document_path)
  values
    (p_book, p_key, auth.uid(), v_prep.id, v_via, v_kind, v_tpl.key, p_date, v_memo, p_lines, round(p_rate, 6), v_doc)
  returning id into v_id;
  perform set_config('sudagri.ledger_via', '', true);

  if not v_owner then
    v_name := public._ledger_actor_name(auth.uid());
    perform public.notify_user(
      v_book.owner_id, 'ledger_review', 'قيدٌ مُعَدّ ينتظر اعتمادك',
      coalesce(nullif(v_name, ''), 'مُعِدّ دفترك') || ' أعدّ قيداً بتاريخ ' || p_date::text || ': ' || left(v_memo, 120)
        || '. لا يُرحَّل في دفترك حتى تعتمده، ولك أن تردّه بسبب.',
      '/books/review');
  end if;
  return jsonb_build_object('status', 'pending', 'draft_id', v_id);
end $$;

-- لصاحب الدفتر وحده: يُرحَّل القيد المُعَدّ كما أُعِدّ، بدالّة النشر نفسها وحرّاسها.
create function public.ledger_draft_approve(p_draft uuid, p_via text default 'web')
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  d       public.ledger_drafts;
  v_entry uuid;
  v_via   text := case when p_via = 'app' then 'app' else 'web' end;
begin
  if auth.uid() is null then
    raise exception 'سجّل الدخول أولاً';
  end if;
  select * into d from public.ledger_drafts where id = p_draft for update;
  if not found then
    raise exception 'ليس هذا دفترك';
  end if;
  perform public._ledger_book_for_owner(d.book_id);
  if d.status <> 'pending' then
    raise exception 'بُتّ في هذا القيد من قبل';
  end if;

  v_entry := public._ledger_post_manual(d.book_id, d.entry_date, d.memo, d.lines, 'draft:' || d.id::text, d.rate,
                                        d.kind, d.template_key, d.document_path, d.via, d.prepared_by, d.id);
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

create function public.ledger_draft_reject(p_draft uuid, p_note text, p_via text default 'web')
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  d      public.ledger_drafts;
  v_note text := btrim(coalesce(p_note, ''));
begin
  if auth.uid() is null then
    raise exception 'سجّل الدخول أولاً';
  end if;
  select * into d from public.ledger_drafts where id = p_draft for update;
  if not found then
    raise exception 'ليس هذا دفترك';
  end if;
  perform public._ledger_book_for_owner(d.book_id);
  if d.status <> 'pending' then
    raise exception 'بُتّ في هذا القيد من قبل';
  end if;
  if length(v_note) not between 3 and 300 then
    raise exception 'اكتب سبب الردّ (من ٣ أحرف إلى ٣٠٠)';
  end if;
  perform set_config('sudagri.ledger_via', case when p_via = 'app' then 'app' else 'web' end, true);
  update public.ledger_drafts
     set status = 'rejected', decided_by = auth.uid(), decided_at = now(), decision_note = v_note
   where id = d.id;
  perform set_config('sudagri.ledger_via', '', true);
  if d.prepared_by <> auth.uid() then
    perform public.notify_user(d.prepared_by, 'ledger_review', 'رُدّ القيد الذي أعددته',
      'السبب: ' || v_note || ' — القيد: ' || left(d.memo, 120), '/books/review');
  end if;
end $$;

-- لمُعِدّه: يسحب ما لم يُبتّ فيه.
create function public.ledger_draft_withdraw(p_draft uuid, p_via text default 'web')
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  d public.ledger_drafts;
begin
  if auth.uid() is null then
    raise exception 'سجّل الدخول أولاً';
  end if;
  select * into d from public.ledger_drafts where id = p_draft for update;
  if not found or d.prepared_by <> auth.uid() then
    raise exception 'ليس هذا قيداً أعددته';
  end if;
  if d.status <> 'pending' then
    raise exception 'بُتّ في هذا القيد من قبل';
  end if;
  perform set_config('sudagri.ledger_via',
    case when d.via = 'agent' then 'agent' when p_via = 'app' then 'app' else 'web' end, true);
  update public.ledger_drafts set status = 'withdrawn', decided_by = auth.uid(), decided_at = now() where id = d.id;
  perform set_config('sudagri.ledger_via', '', true);
end $$;

-- «راجع كلّ قيد»: قيود صاحب الدفتر نفسه تنتظر اعتماده.
create function public.ledger_review_set(p_book uuid, p_always boolean, p_via text default 'web')
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public._ledger_book_for_owner(p_book);
  if p_always is null then
    raise exception 'اختر: يُراجع كلّ قيد أو لا';
  end if;
  perform set_config('sudagri.ledger_via', case when p_via = 'app' then 'app' else 'web' end, true);
  insert into public.ledger_book_settings (book_id, always_review, updated_by, updated_at)
  values (p_book, p_always, auth.uid(), now())
  on conflict (book_id) do update
     set always_review = excluded.always_review, updated_by = excluded.updated_by, updated_at = excluded.updated_at;
  perform set_config('sudagri.ledger_via', '', true);
  return p_always;
end $$;

-- النشر اليدويّ القديم (20261024110000) كما هو، ومعه شرطٌ واحد: من طلب «راجع كلّ قيد» لا يُرحَّل قيده من هذا الباب.
create or replace function public.ledger_post(
  p_book  uuid,
  p_date  date,
  p_memo  text,
  p_lines jsonb,
  p_key   text,
  p_rate  numeric default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'سجّل الدخول أولاً';
  end if;
  if not exists (
    select 1 from public.ledger_books b
     where b.id = p_book and (b.owner_id = auth.uid() or (b.kind = 'platform' and is_admin()))
  ) then
    raise exception 'ليس هذا دفترك';
  end if;
  if exists (select 1 from public.ledger_book_settings s where s.book_id = p_book and s.always_review) then
    raise exception 'دفترك يطلب مراجعة كلّ قيد: اكتبه من صفحة القيد فيُعرض عليك قبل ترحيله';
  end if;
  return public._ledger_post(p_book, p_date, p_memo, p_lines, p_key, p_rate, 'manual', null, null, auth.uid());
end $$;

-- ── ٩. المُعِدّون ────────────────────────────────────────────────────────────

-- Invites an accountant who already has an account, by phone or e-mail. Nothing is open to him before he accepts from
-- his own account; the owner sees the last digits until then.
create function public.ledger_preparer_invite(p_book uuid, p_contact text, p_via text default 'web')
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  b       public.ledger_books;
  v_raw   text := lower(btrim(coalesce(p_contact, '')));
  v_key   text;
  v_tail  text;
  v_users uuid[];
  v_id    uuid;
  v_name  text;
begin
  b := public._ledger_book_for_owner(p_book);
  if b.owner_id is null then
    raise exception 'دفتر المنصّة لا يُدعى إليه أحد';
  end if;
  if position('@' in v_raw) > 1 then
    if v_raw !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or length(v_raw) > 254 then
      raise exception 'اكتب رقم جوّال المحاسب كاملاً أو بريده';
    end if;
    v_tail := left(v_raw, 2) || '…@' || split_part(v_raw, '@', 2);
    select array_agg(distinct u.id) into v_users from auth.users u
     where lower(u.email) = v_raw and u.id <> auth.uid()
       and not exists (select 1 from public.closed_accounts c where c.user_id = u.id);
  else
    v_key := public.phone_key(v_raw);
    if v_key is null or length(v_key) < 9 then
      raise exception 'اكتب رقم جوّال المحاسب كاملاً أو بريده';
    end if;
    v_tail := right(v_key, 4);
    select array_agg(distinct x.id) into v_users from (
      select p.id from public.profiles p where public.phone_key(p.phone) = v_key
      union
      select u.id from auth.users u where public.phone_key(u.phone) = v_key
    ) x
    where x.id <> auth.uid()
      and not exists (select 1 from public.closed_accounts c where c.user_id = x.id);
  end if;

  if (select count(*) from public.ledger_preparers where invited_by = auth.uid() and invited_at > now() - interval '1 day') >= 10 then
    raise exception 'عشر دعواتٍ في اليوم حدُّ الدفتر. أكمل غداً.';
  end if;
  if v_users is null then
    raise exception 'لا حساب بهذا الرقم أو البريد. يسجّل المحاسب أوّلاً، ثمّ تدعوه.';
  end if;
  if cardinality(v_users) > 1 then
    raise exception 'لهذا الرقم أكثر من حساب؛ تواصل مع الإدارة لتحدّد أيّها.';
  end if;
  if exists (select 1 from public.ledger_preparers
              where book_id = p_book and preparer_id = v_users[1] and status in ('invited', 'active')) then
    raise exception 'بينك وبين صاحب هذا الحساب دعوةٌ مفتوحة أو إذنٌ قائم.';
  end if;
  if (select count(*) from public.ledger_preparers where book_id = p_book and status in ('invited', 'active')) >= 5 then
    raise exception 'لهذا الدفتر خمسة مُعِدّين؛ أنهِ إذن أحدهم أوّلاً.';
  end if;

  perform set_config('sudagri.ledger_via', case when p_via = 'app' then 'app' else 'web' end, true);
  insert into public.ledger_preparers (book_id, preparer_id, role, contact_tail, status, invited_by)
  values (p_book, v_users[1], 'accountant', v_tail, 'invited', auth.uid())
  returning id into v_id;
  perform set_config('sudagri.ledger_via', '', true);

  v_name := public._ledger_actor_name(auth.uid());
  perform public.notify_user(v_users[1], 'ledger_review', 'دعوةٌ لإعداد قيود دفتر',
    coalesce(nullif(v_name, ''), 'صاحب دفتر') || ' يدعوك لتُعِدّ قيود دفتره. لا يُرحَّل شيءٌ ممّا تُعِدّه حتى يعتمده هو، '
      || 'ولا ترى من دفتره إلا شجرة حساباته وما أعددت. اقبل أو اعتذر من صفحة المراجعة.',
    '/books/review');
  return v_id;
end $$;

-- Makes the agent who holds a standing mandate from the owner a preparer of the owner's book.
create function public.ledger_preparer_add_agent(p_book uuid, p_mandate uuid, p_via text default 'web')
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  b       public.ledger_books;
  v_agent uuid;
  v_id    uuid;
begin
  b := public._ledger_book_for_owner(p_book);
  if b.owner_id is null then
    raise exception 'دفتر المنصّة لا يُدعى إليه أحد';
  end if;
  select c.owner_id into v_agent
    from public.agent_mandates m
    join public.partner_companies c on c.id = m.company_id
   where m.id = p_mandate and m.farmer_id = auth.uid() and m.status = 'active'
     and c.verified_at is not null and c.active;
  if v_agent is null then
    raise exception 'لا إذن قائم لهذا الوكيل عنك.';
  end if;
  if exists (select 1 from public.ledger_preparers
              where book_id = p_book and preparer_id = v_agent and status in ('invited', 'active')) then
    raise exception 'بينك وبين صاحب هذا الحساب دعوةٌ مفتوحة أو إذنٌ قائم.';
  end if;
  if (select count(*) from public.ledger_preparers where book_id = p_book and status in ('invited', 'active')) >= 5 then
    raise exception 'لهذا الدفتر خمسة مُعِدّين؛ أنهِ إذن أحدهم أوّلاً.';
  end if;

  perform set_config('sudagri.ledger_via', case when p_via = 'app' then 'app' else 'web' end, true);
  insert into public.ledger_preparers (book_id, preparer_id, role, mandate_id, status, invited_by, answered_at)
  values (p_book, v_agent, 'agent', p_mandate, 'active', auth.uid(), now())
  returning id into v_id;
  perform set_config('sudagri.ledger_via', '', true);

  perform public.notify_user(v_agent, 'ledger_review', 'صرت مُعِدّاً لقيود دفتر مزارعك',
    'أذن لك ' || coalesce(nullif(public._ledger_actor_name(auth.uid()), ''), 'مزارعك')
      || ' أن تُعِدّ قيود دفتره بالإذن الذي أعطاك. لا يُرحَّل شيءٌ حتى يعتمده.',
    '/books/review');
  return v_id;
end $$;

create function public.ledger_preparer_answer(p_id uuid, p_accept boolean, p_via text default 'web')
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  p     public.ledger_preparers;
  v_own uuid;
begin
  if auth.uid() is null then
    raise exception 'سجّل الدخول أولاً';
  end if;
  select * into p from public.ledger_preparers where id = p_id for update;
  if not found or p.preparer_id <> auth.uid() then
    raise exception 'ليست هذه دعوتك';
  end if;
  if p.status <> 'invited' then
    raise exception 'أُجيبت هذه الدعوة من قبل';
  end if;
  if p_accept is null then
    raise exception 'اختر: تقبل أو تعتذر';
  end if;
  perform set_config('sudagri.ledger_via', case when p_via = 'app' then 'app' else 'web' end, true);
  update public.ledger_preparers
     set status = case when p_accept then 'active' else 'declined' end, answered_at = now()
   where id = p_id;
  perform set_config('sudagri.ledger_via', '', true);
  select owner_id into v_own from public.ledger_books where id = p.book_id;
  perform public.notify_user(v_own, 'ledger_review',
    case when p_accept then 'قبل المحاسب دعوتك (…' || p.contact_tail || ')' else 'اعتذر صاحب الحساب (…' || p.contact_tail || ')' end,
    case when p_accept then 'يُعِدّ قيود دفترك من الآن، ولا يُرحَّل شيءٌ حتى تعتمده. تُنهي إذنه متى شئت.'
         else 'لم يقبل دعوتك لإعداد قيود دفترك.' end,
    '/books/review');
end $$;

-- Either side ends it. What he prepared and is still waiting stays for the owner to approve or turn back.
create function public.ledger_preparer_end(p_id uuid, p_via text default 'web')
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  p     public.ledger_preparers;
  v_own uuid;
begin
  if auth.uid() is null then
    raise exception 'سجّل الدخول أولاً';
  end if;
  select * into p from public.ledger_preparers where id = p_id for update;
  if not found then
    raise exception 'ليس هذا إذناً تملكه';
  end if;
  select owner_id into v_own from public.ledger_books where id = p.book_id;
  if auth.uid() is distinct from v_own and auth.uid() <> p.preparer_id then
    raise exception 'ليس هذا إذناً تملكه';
  end if;
  if p.status not in ('invited', 'active') then
    raise exception 'انتهى هذا الإذن من قبل';
  end if;
  perform set_config('sudagri.ledger_via',
    case when p.role = 'agent' and auth.uid() = p.preparer_id then 'agent' when p_via = 'app' then 'app' else 'web' end, true);
  update public.ledger_preparers set status = 'ended', ended_at = now(), ended_by = auth.uid() where id = p_id;
  perform set_config('sudagri.ledger_via', '', true);
  perform public.notify_user(case when auth.uid() = v_own then p.preparer_id else v_own end, 'ledger_review',
    'انتهى إذن إعداد القيود', 'لا تُعَدّ قيودٌ لهذا الدفتر بهذا الإذن بعد اليوم.', '/books/review');
end $$;

-- For the owner: who prepares for this book. A name only once the person accepted (an agent accepted with his mandate).
create function public.ledger_preparers_list(p_book uuid)
returns table (
  id           uuid,
  role         text,
  status       text,
  full_name    text,
  company_name text,
  contact_tail text,
  invited_at   timestamptz,
  answered_at  timestamptz,
  ended_at     timestamptz,
  standing     boolean
)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
begin
  perform public._ledger_book_for_owner(p_book);
  return query
  select p.id, p.role, p.status,
         case when p.answered_at is not null and p.status in ('active', 'ended') then public._ledger_actor_name(p.preparer_id) end,
         (select c.name from public.agent_mandates m join public.partner_companies c on c.id = m.company_id where m.id = p.mandate_id),
         p.contact_tail, p.invited_at, p.answered_at, p.ended_at,
         p.status = 'active' and (p.role = 'accountant'
           or exists (select 1 from public.agent_mandates m join public.partner_companies c on c.id = m.company_id
                       where m.id = p.mandate_id and m.status = 'active' and c.verified_at is not null and c.active
                         and c.owner_id = p.preparer_id))
    from public.ledger_preparers p
   where p.book_id = p_book
   order by p.invited_at desc;
end $$;

-- For the preparer: the books he is invited to or prepares for, with the owner's name (he was invited by name).
create function public.ledger_preparer_mine()
returns table (
  id          uuid,
  book_id     uuid,
  book_kind   text,
  owner_name  text,
  role        text,
  status      text,
  invited_at  timestamptz,
  standing    boolean
)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
begin
  if auth.uid() is null then
    raise exception 'سجّل الدخول أولاً';
  end if;
  return query
  select p.id, p.book_id, b.kind, public._ledger_actor_name(b.owner_id), p.role, p.status, p.invited_at,
         (public._ledger_preparer_active(p.book_id)).id is not null
    from public.ledger_preparers p
    join public.ledger_books b on b.id = p.book_id
   where p.preparer_id = auth.uid() and p.status in ('invited', 'active')
   order by p.invited_at desc;
end $$;

-- The book's chart, for its owner or for a standing preparer: codes and names, no balance.
create function public.ledger_preparer_chart(p_book uuid)
returns table (
  code        text,
  parent_code text,
  name_ar     text,
  name_en     text,
  type        text,
  postable    boolean,
  active      boolean,
  system_key  text,
  currency    text,
  provider    text
)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
begin
  if auth.uid() is null then
    raise exception 'سجّل الدخول أولاً';
  end if;
  if not exists (select 1 from public.ledger_books b
                  where b.id = p_book and (b.owner_id = auth.uid() or (b.kind = 'platform' and is_admin())))
     and (public._ledger_preparer_active(p_book)).id is null then
    raise exception 'ليس هذا دفترك';
  end if;
  return query
  select a.code, a.parent_code, a.name_ar, a.name_en, a.type, a.postable, a.active, a.system_key, a.currency, a.provider
    from public.ledger_accounts a
   where a.book_id = p_book
   order by a.code;
end $$;

-- ── ١٠. الإقفال ──────────────────────────────────────────────────────────────

-- The closing lines: each revenue and expense account's balance (per season tag) over the range, turned over, and the net
-- to retained earnings. Read from the balances themselves, earlier closings included, so nothing is closed twice.
create function public._ledger_closing_lines(p_book uuid, p_from date, p_to date, p_season uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with net as (
    select a.code, l.season_id,
           sum(case when l.side = 'D' then l.base_minor else -l.base_minor end)::bigint as dr
      from public.journal_lines l
      join public.journal_entries e on e.id = l.entry_id
      join public.ledger_accounts a on a.id = l.account_id and a.book_id = l.book_id
     where l.book_id = p_book
       and a.type in ('revenue', 'expense')
       and a.code not like '9%'
       and (p_from is null or e.entry_date >= p_from)
       and e.entry_date <= p_to
       and (p_season is null or l.season_id = p_season)
     group by a.code, l.season_id
    having sum(case when l.side = 'D' then l.base_minor else -l.base_minor end) <> 0
  ), cur as (
    select base_currency as c from public.ledger_books where id = p_book
  ), tot as (
    select coalesce(sum(dr), 0)::bigint as t, count(*) as n from net
  )
  select case when (select n from tot) = 0 then '[]'::jsonb else
    (select jsonb_agg(jsonb_build_object('account', code, 'side', case when dr > 0 then 'C' else 'D' end,
                                         'currency', (select c from cur), 'minor', abs(dr), 'season', season_id,
                                         'memo', 'إقفال')
                      order by code, season_id nulls first) from net)
    || case when (select t from tot) = 0 then '[]'::jsonb
            else jsonb_build_array(jsonb_build_object('key', 'retained_earnings',
                                                      'side', case when (select t from tot) > 0 then 'D' else 'C' end,
                                                      'currency', (select c from cur), 'minor', abs((select t from tot)),
                                                      'season', p_season, 'memo', 'صافي الفترة'))
       end
  end
$$;

-- Closes the period's income and expenses into retained earnings with one entry dated its last day, and locks the period
-- through that day in the same transaction, so nothing can be dated in it afterwards. From the day after the last
-- closing (or the book's beginning) to `p_to`.
create function public.ledger_close_income(p_book uuid, p_to date, p_via text default 'web')
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  b       public.ledger_books;
  v_last  date;
  v_from  date;
  v_lines jsonb;
  v_id    uuid := gen_random_uuid();
  v_entry uuid;
begin
  b := public._ledger_book_for_owner(p_book);
  select * into b from public.ledger_books where id = p_book for update;
  if p_to is null or p_to >= public.ledger_today() then
    raise exception 'لا يُقفل إلا يومٌ مضى';
  end if;
  select max(period_to) into v_last from public.ledger_closings where book_id = p_book and scope = 'period';
  if v_last is not null and p_to <= v_last then
    raise exception 'أُقفل دخل الدفتر حتى % من قبل؛ يُقفل ما بعده فقط', v_last;
  end if;
  if b.closed_through is not null and p_to <= b.closed_through then
    raise exception 'الفترة حتى % مقفلة أصلاً؛ يُكتب قيد الإقفال بآخر يومٍ بعدها', b.closed_through;
  end if;
  v_from := v_last + 1;
  v_lines := public._ledger_closing_lines(p_book, v_from, p_to, null);
  if jsonb_array_length(v_lines) = 0 then
    raise exception 'لا إيراد ولا مصروف في هذه الفترة يُقفل';
  end if;

  perform set_config('sudagri.ledger_via', case when p_via = 'app' then 'app' else 'web' end, true);
  v_entry := public._ledger_post_src(
    p_book, p_to,
    'قيد إقفال: الإيرادات والمصروفات إلى الأرباح المحتجزة، ' || coalesce('من ' || v_from::text || ' ', '') || 'حتى ' || p_to::text,
    v_lines, 'closing:period:' || p_to::text, null, 'ledger_closing', v_id, null, auth.uid(), null);
  insert into public.ledger_closings (id, book_id, scope, period_from, period_to, entry_id, created_by)
  values (v_id, p_book, 'period', v_from, p_to, v_entry, auth.uid());
  update public.ledger_books set closed_through = p_to where id = p_book;
  perform set_config('sudagri.ledger_via', '', true);
  return v_entry;
end $$;

-- Closes one season's income and expenses (the lines tagged with it, up to the day) into retained earnings. A season of
-- the book's owner closes once it is completed.
create function public.ledger_close_season(p_book uuid, p_season uuid, p_date date default null, p_via text default 'web')
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  b       public.ledger_books;
  v_date  date := coalesce(p_date, public.ledger_today());
  v_lines jsonb;
  v_id    uuid := gen_random_uuid();
  v_entry uuid;
  v_name  text;
begin
  b := public._ledger_book_for_owner(p_book);
  perform 1 from public.ledger_books where id = p_book for update;
  if p_season is null then
    raise exception 'اختر الموسم';
  end if;
  if exists (select 1 from public.ledger_closings where book_id = p_book and scope = 'season' and season_id = p_season) then
    raise exception 'أُقفل دخل هذا الموسم في الدفتر من قبل';
  end if;
  if not exists (select 1 from public.journal_lines where book_id = p_book and season_id = p_season) then
    raise exception 'لا قيود لهذا الموسم في الدفتر';
  end if;
  if exists (select 1 from public.seasons s where s.id = p_season and s.owner_id = b.owner_id and s.status <> 'completed') then
    raise exception 'أقفل الموسم أوّلاً من صفحته، ثمّ أقفل دخله هنا';
  end if;
  if v_date > public.ledger_today() then
    raise exception 'لا قيد بتاريخٍ في المستقبل';
  end if;
  v_lines := public._ledger_closing_lines(p_book, null, v_date, p_season);
  if jsonb_array_length(v_lines) = 0 then
    raise exception 'لا إيراد ولا مصروف لهذا الموسم يُقفل';
  end if;
  select name into v_name from public.seasons where id = p_season;

  perform set_config('sudagri.ledger_via', case when p_via = 'app' then 'app' else 'web' end, true);
  v_entry := public._ledger_post_src(
    p_book, v_date,
    left('قيد إقفال موسم: ' || coalesce(v_name, p_season::text) || ' — الإيرادات والمصروفات إلى الأرباح المحتجزة', 500),
    v_lines, 'closing:season:' || p_season::text, null, 'ledger_closing', v_id, null, auth.uid(), null);
  insert into public.ledger_closings (id, book_id, scope, season_id, period_to, entry_id, created_by)
  values (v_id, p_book, 'season', p_season, v_date, v_entry, auth.uid());
  perform set_config('sudagri.ledger_via', '', true);
  return v_entry;
end $$;

-- صاحب الدفتر يقفل الفترة (بحارس ledger_close_through نفسه)، ويُسجَّل من أين.
create function public.ledger_period_close(p_book uuid, p_date date, p_via text default 'web')
returns date
language plpgsql
security definer
set search_path = public
as $$
declare
  v date;
begin
  perform public._ledger_book_for_owner(p_book);
  perform set_config('sudagri.ledger_via', case when p_via = 'app' then 'app' else 'web' end, true);
  v := public.ledger_close_through(p_book, p_date);
  perform set_config('sudagri.ledger_via', '', true);
  return v;
end $$;

-- للإدارة وحدها: تُعاد الفترة المقفلة مفتوحةً إلى يومٍ قبلها (أو كلّها)، بسببٍ مكتوب، ويُخبَر صاحب الدفتر.
create function public.ledger_period_reopen(p_book uuid, p_through date, p_reason text)
returns date
language plpgsql
security definer
set search_path = public
as $$
declare
  b        public.ledger_books;
  v_reason text := btrim(coalesce(p_reason, ''));
begin
  if auth.uid() is null then
    raise exception 'سجّل الدخول أولاً';
  end if;
  if not is_admin() then
    raise exception 'إعادة فتح الفترة للإدارة وحدها، بسببٍ مكتوب';
  end if;
  select * into b from public.ledger_books where id = p_book for update;
  if not found then
    raise exception 'الدفتر غير موجود';
  end if;
  if b.closed_through is null then
    raise exception 'الدفتر غير مقفلٍ أصلاً';
  end if;
  if p_through is not null and p_through >= b.closed_through then
    raise exception 'يُعاد الفتح إلى يومٍ قبل % (آخر يومٍ مقفل)', b.closed_through;
  end if;
  if length(v_reason) not between 10 and 500 then
    raise exception 'اكتب سبب إعادة الفتح (من ١٠ أحرف إلى ٥٠٠)';
  end if;
  insert into public.ledger_period_reopens (book_id, was_through, now_through, reason, reopened_by)
  values (p_book, b.closed_through, p_through, v_reason, auth.uid());
  perform set_config('sudagri.ledger_via', 'web', true);
  update public.ledger_books set closed_through = p_through where id = p_book;
  perform set_config('sudagri.ledger_via', '', true);
  if b.owner_id is not null then
    perform public.notify_user(b.owner_id, 'ledger_review', 'أعادت الإدارة فتح فترةٍ في دفترك',
      'كان دفترك مقفلاً حتى ' || b.closed_through::text || '، وصار '
        || coalesce('مقفلاً حتى ' || p_through::text, 'غير مقفل') || '. السبب: ' || v_reason,
      '/books/audit');
  end if;
  return p_through;
end $$;

-- ── ١١. قيد الإقفال لا يُعكس، ولا يدخل القوائم ولا الإحصاءات ─────────────────

-- _ledger_reverse (20261024110000) كما هو، ومعه شرطٌ واحد: قيد الإقفال لا يُعكس (لا بيد صاحب الدفتر ولا بمفتاح الخدمة).
create or replace function public._ledger_reverse(
  p_entry  uuid,
  p_reason text,
  p_date   date,
  p_key    text,
  p_actor  uuid
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_e    public.journal_entries;
  v_date date := coalesce(p_date, public.ledger_today());
  v_key  text;
  v_prev public.journal_entries;
  v_new  uuid;
begin
  select * into v_e from public.journal_entries where id = p_entry;
  if not found then
    raise exception 'القيد غير موجود';
  end if;
  if length(btrim(coalesce(p_reason, ''))) not between 1 and 300 then
    raise exception 'اكتب سبب العكس (حتى ٣٠٠ حرف)';
  end if;
  if v_e.reversal_of is not null then
    raise exception 'لا يُعكس قيدٌ عاكس';
  end if;
  if v_e.source_type = 'ledger_closing' then
    raise exception 'قيد الإقفال لا يُعكس: أُقفلت فترته أو موسمه به';
  end if;

  v_key := coalesce(p_key, 'reverse:' || p_entry::text);
  select * into v_prev from public.journal_entries where reversal_of = p_entry;
  if found then
    if v_prev.idempotency_key = v_key then
      return v_prev.id;
    end if;
    raise exception 'عُكس هذا القيد من قبل';
  end if;

  begin
    insert into public.journal_entries
      (book_id, entry_date, memo, fx_rate, fx_source, source_type, source_id, reversal_of,
       idempotency_key, content_hash, created_by)
    values
      (v_e.book_id, v_date, left('عكس القيد #' || v_e.entry_no || ': ' || btrim(p_reason), 500),
       v_e.fx_rate, v_e.fx_source, 'reversal', v_e.id, v_e.id,
       v_key, encode(sha256(convert_to('reversal|' || v_e.id::text || '|' || v_date::text || '|' || btrim(p_reason), 'UTF8')), 'hex'),
       p_actor)
    returning id into v_new;
  exception when unique_violation then
    raise exception 'عُكس هذا القيد من قبل';
  end;

  insert into public.journal_lines
    (entry_id, book_id, line_no, account_id, side, currency, amount_minor, base_minor,
     season_id, land_id, herd_id, project_id, line_memo)
  select v_new, l.book_id, l.line_no, l.account_id,
         case l.side when 'D' then 'C' else 'D' end,
         l.currency, l.amount_minor, l.base_minor,
         l.season_id, l.land_id, l.herd_id, l.project_id, l.line_memo
    from public.journal_lines l
   where l.entry_id = v_e.id;
  return v_new;
end $$;

-- The statements (20261024150000) as they were, with one condition each: an entry that closes a period or a season into
-- retained earnings is left out. They already carry the earnings forward by date (the balance sheet's "retained" line
-- is the income before the year), so the closing entry would count them twice in the balance sheet and empty the very
-- period the income statement is asked about. The trial balance and the account statements show it as it is.
create or replace function public.ledger_income_statement(
  p_book   uuid,
  p_from   date default null,
  p_to     date default null,
  p_season uuid default null
) returns table (
  account_id uuid,
  code       text,
  name_ar    text,
  name_en    text,
  type       text,
  system_key text,
  amount     bigint
)
language sql
stable
security invoker
set search_path = public
as $$
  select a.id, a.code, a.name_ar, a.name_en, a.type, a.system_key,
         sum(case when (a.type = 'revenue') = (l.side = 'C') then l.base_minor else -l.base_minor end)::bigint
    from public.ledger_accounts a
    join public.journal_lines l on l.account_id = a.id and l.book_id = a.book_id
    join public.journal_entries e on e.id = l.entry_id
   where a.book_id = p_book
     and a.type in ('revenue', 'expense')
     and a.code not like '9%'
     and e.source_type is distinct from 'ledger_closing'
     and (p_from is null or e.entry_date >= p_from)
     and (p_to is null or e.entry_date <= p_to)
     and (p_season is null or l.season_id = p_season)
   group by a.id, a.code, a.name_ar, a.name_en, a.type, a.system_key
  having sum(case when (a.type = 'revenue') = (l.side = 'C') then l.base_minor else -l.base_minor end) <> 0
   order by a.code;
$$;

create or replace function public.ledger_balance_sheet(p_book uuid, p_as_of date default null)
returns table (
  account_id uuid,
  code       text,
  name_ar    text,
  name_en    text,
  type       text,
  system_key text,
  balance    bigint
)
language sql
stable
security invoker
set search_path = public
as $$
  select a.id, a.code, a.name_ar, a.name_en, a.type, a.system_key,
         sum(case when (a.type = 'asset') = (l.side = 'D') then l.base_minor else -l.base_minor end)::bigint
    from public.ledger_accounts a
    join public.journal_lines l on l.account_id = a.id and l.book_id = a.book_id
    join public.journal_entries e on e.id = l.entry_id
   where a.book_id = p_book
     and a.type in ('asset', 'liability', 'equity')
     and a.code not like '9%'
     and e.source_type is distinct from 'ledger_closing'
     and (p_as_of is null or e.entry_date <= p_as_of)
   group by a.id, a.code, a.name_ar, a.name_en, a.type, a.system_key
  having sum(case when (a.type = 'asset') = (l.side = 'D') then l.base_minor else -l.base_minor end) <> 0
   order by a.code;
$$;

create or replace function public.ledger_profit_by_season(p_book uuid, p_from date default null, p_to date default null)
returns table (
  season_id uuid,
  revenue   bigint,
  expense   bigint
)
language sql
stable
security invoker
set search_path = public
as $$
  select l.season_id,
         coalesce(sum(case when l.side = 'C' then l.base_minor else -l.base_minor end) filter (where a.type = 'revenue'), 0)::bigint,
         coalesce(sum(case when l.side = 'D' then l.base_minor else -l.base_minor end) filter (where a.type = 'expense'), 0)::bigint
    from public.journal_lines l
    join public.ledger_accounts a on a.id = l.account_id and a.book_id = l.book_id
    join public.journal_entries e on e.id = l.entry_id
   where l.book_id = p_book
     and a.type in ('revenue', 'expense')
     and a.code not like '9%'
     and e.source_type is distinct from 'ledger_closing'
     and (p_from is null or e.entry_date >= p_from)
     and (p_to is null or e.entry_date <= p_to)
   group by l.season_id
  having coalesce(sum(case when l.side = 'C' then l.base_minor else -l.base_minor end) filter (where a.type = 'revenue'), 0) <> 0
      or coalesce(sum(case when l.side = 'D' then l.base_minor else -l.base_minor end) filter (where a.type = 'expense'), 0) <> 0
   order by l.season_id nulls last;
$$;

-- The network's statistics and the two books' reconciliation (20261025160000) as they were, with the same one condition:
-- a closing entry moves no sale, cost or currency, it only carries them to retained earnings.

create or replace function public.oversight_flows(p_from date, p_to date)
returns table (
  period       date,
  metric       text,
  label_ar     text,
  value_minor  bigint,
  books        integer,
  entries      integer,
  suppressed   boolean
)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  s public.oversight_settings;
  v_from date;
  v_to   date;
begin
  if auth.uid() is not null and not is_admin() then
    raise exception 'للإدارة وحدها';
  end if;
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 1100 then
    raise exception 'مدىً غير صالح (حتى ثلاث سنوات)';
  end if;
  select * into s from public.oversight_settings;
  select w.w_from, w.w_to into v_from, v_to from public._oversight_window(p_from, p_to) w;

  return query
  with cells as (
    select date_trunc('month', public._oversight_day(e.created_at))::date as period,
           m.metric,
           l.book_id,
           sum(case when m.direction = 'debit'
                    then (case l.side when 'D' then l.base_minor else -l.base_minor end)
                    else (case l.side when 'C' then l.base_minor else -l.base_minor end) end)::bigint as v,
           count(distinct e.id)::integer as n
      from public.journal_lines l
      join public.journal_entries e on e.id = l.entry_id
      join public.ledger_books b on b.id = l.book_id and b.kind in ('farm', 'investor')
      join public.ledger_accounts a on a.id = l.account_id and a.book_id = l.book_id
      join public.oversight_metrics m on m.book_kind = b.kind and m.system_key = a.system_key
     where public._oversight_day(e.created_at) between v_from and v_to
       and e.source_type is distinct from 'ledger_closing'
     group by 1, 2, l.book_id
  ), agg as (
    select c.period, c.metric,
           sum(c.v)::bigint as total,
           count(*) filter (where c.v <> 0)::integer as books,
           sum(c.n)::integer as entries,
           coalesce(max(abs(c.v)), 0) as top,
           coalesce(sum(abs(c.v)), 0) as sum_abs
      from cells c
     group by 1, 2
  ), labels as (
    select om.metric, min(om.label_ar) as label_ar from public.oversight_metrics om group by om.metric
  ), judged as (
    select a.*, (a.books >= s.min_books and (a.sum_abs = 0 or a.top::numeric / a.sum_abs <= s.max_top_share)) as shown
      from agg a
  )
  select j.period, j.metric, l.label_ar,
         case when j.shown then j.total end,
         case when j.shown then j.books end,
         case when j.shown then j.entries end,
         not j.shown
    from judged j
    join labels l on l.metric = j.metric
   order by j.period, j.metric;
end $$;

create or replace function public.oversight_currency_mix(p_from date, p_to date)
returns table (
  period     date,
  currency   text,
  share_pct  integer,
  suppressed boolean
)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  s public.oversight_settings;
  v_from date;
  v_to   date;
begin
  if auth.uid() is not null and not is_admin() then
    raise exception 'للإدارة وحدها';
  end if;
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 1100 then
    raise exception 'مدىً غير صالح (حتى ثلاث سنوات)';
  end if;
  select * into s from public.oversight_settings;
  select w.w_from, w.w_to into v_from, v_to from public._oversight_window(p_from, p_to) w;

  return query
  with cells as (
    select date_trunc('month', public._oversight_day(e.created_at))::date as period, l.currency, l.book_id,
           sum(l.base_minor)::numeric as vol
      from public.journal_lines l
      join public.journal_entries e on e.id = l.entry_id
      join public.ledger_books b on b.id = l.book_id and b.kind in ('farm', 'investor')
      join public.ledger_accounts a on a.id = l.account_id and a.book_id = l.book_id
      join public.oversight_metrics m on m.book_kind = b.kind and m.system_key = a.system_key
     where public._oversight_day(e.created_at) between v_from and v_to
       and e.source_type is distinct from 'ledger_closing'
     group by 1, 2, 3
  ), per_cur as (
    -- Each (month, currency) cell by both rules: enough books, and none of them most of it.
    select c.period, c.currency, sum(c.vol) as vol,
           (count(*) filter (where c.vol <> 0) >= s.min_books
            and (sum(c.vol) = 0 or max(c.vol) / sum(c.vol) <= s.max_top_share)) as ok
      from cells c
     group by 1, 2
  ), month_ok as (
    -- One cell withheld withholds its month: with the others shown it would be a hundred less their sum.
    select pc.period, bool_and(pc.ok) as shown, sum(pc.vol) as total
      from per_cur pc
     group by pc.period
  )
  select pc.period, pc.currency,
         case when mo.shown and mo.total > 0 then round(100 * pc.vol / mo.total)::integer end,
         not mo.shown
    from per_cur pc
    join month_ok mo on mo.period = pc.period
   order by pc.period, pc.currency;
end $$;

create or replace function public.farm_book_reconcile()
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
           count(*) filter (where le.amount > 0 and public._farm_mirror_current(le.id) is null) as unposted
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
      join public.journal_entries e on e.id = l.entry_id
     where l.season_id is not null
       and e.source_type is distinct from 'ledger_closing'
     group by l.season_id
  )
  select s.season_id, s.costs, coalesce(b.costs, 0), s.revenue, coalesce(b.revenue, 0), s.unposted
    from simple s
    left join book b on b.season_id = s.season_id
   where s.costs <> coalesce(b.costs, 0) or s.revenue <> coalesce(b.revenue, 0) or s.unposted > 0
   order by s.season_id;
end $$;

-- ── ١٢. تقرير الاستثناءات ────────────────────────────────────────────────────
--
-- بصلاحية القارئ، فسياسة الصفوف تحميه كما تحمي التقارير. ما يُفحص: ما كتبه الناس (اليدويّ، ودفتر الموسم، والسداد،
-- والأصول، والقيود المتقابلة، والرسوم) لا ما يكتبه النظام وحده (العكس، والإقفال، والإهلاك، والإحصاء)، وما لم يُعكس.
--   no_document     قيدٌ يدويّ بلا مستند
--   large_amount    سطرٌ أكبر من ثلاثة أمثال وسيط حسابه (في جانبه) في التسعين يوماً قبله (وفيها ثلاثة سطورٍ على الأقل)
--   back_dated      تاريخ القيد قبل يوم كتابته بأكثر من `p_backdate_days` يوماً
--   duplicate       قيدٌ فيه سطرٌ بالحساب والجانب والمبلغ نفسها في سطرٍ من قيدٍ قبله، بفرق يومٍ أو أقلّ
--   negative_cash   حسابٌ نقديّ (نقد، بنك، محفظة) نزل رصيده تحت الصفر: أوّل يومٍ وأدنى رصيد
--   stale_draft     قيدٌ مُعَدّ ينتظر الاعتماد منذ أكثر من `p_draft_days` يوماً

create function public.ledger_exceptions(
  p_book           uuid,
  p_from           date default null,
  p_to             date default null,
  p_backdate_days  integer default 30,
  p_draft_days     integer default 7
) returns table (
  kind         text,
  entry_id     uuid,
  entry_no     bigint,
  entry_date   date,
  draft_id     uuid,
  account_code text,
  amount_minor bigint,
  detail       jsonb
)
language sql
stable
security invoker
set search_path = public
as $$
  with ents as (
    select e.*
      from public.journal_entries e
     where e.book_id = p_book
       and e.reversal_of is null
       and coalesce(e.source_type, 'manual') in
           ('manual', 'season_entry', 'season_entry_settle', 'fixed_asset', 'asset_disposal', 'ledger_link', 'ledger_fee')
       and not exists (select 1 from public.journal_entries r where r.reversal_of = e.id)
       and (p_from is null or e.entry_date >= p_from)
       and (p_to is null or e.entry_date <= p_to)
  ), totals as (
    select l.entry_id, sum(l.base_minor) filter (where l.side = 'D')::bigint as d
      from public.journal_lines l
     where l.entry_id in (select id from ents)
     group by l.entry_id
  ), no_doc as (
    select 'no_document'::text, e.id, e.entry_no, e.entry_date, m.draft_id, null::text, t.d,
           jsonb_build_object('memo', e.memo)
      from ents e
      join totals t on t.entry_id = e.id
      left join public.ledger_entry_meta m on m.entry_id = e.id
     where coalesce(e.source_type, 'manual') = 'manual' and m.document_path is null
  ), large as (
    select 'large_amount'::text, e.id, e.entry_no, e.entry_date, null::uuid, a.code, max(l.base_minor)::bigint,
           jsonb_build_object('median', round(max(h.med)), 'samples', max(h.n), 'times', round(max(l.base_minor) / max(h.med), 1))
      from ents e
      join public.journal_lines l on l.entry_id = e.id
      join public.ledger_accounts a on a.id = l.account_id
      cross join lateral (
        select percentile_cont(0.5) within group (order by l2.base_minor)::numeric as med, count(*) as n
          from public.journal_lines l2
          join public.journal_entries e2 on e2.id = l2.entry_id
         where l2.book_id = p_book and l2.account_id = l.account_id and l2.side = l.side and l2.entry_id <> e.id
           and e2.reversal_of is null
           and coalesce(e2.source_type, '') not in ('ledger_closing', 'reversal')
           and e2.entry_date >= e.entry_date - 90
           and (e2.entry_date, e2.entry_no) < (e.entry_date, e.entry_no)
      ) h
     where h.n >= 3 and h.med > 0 and l.base_minor > 3 * h.med
     group by e.id, e.entry_no, e.entry_date, a.code
  ), back_dated as (
    select 'back_dated'::text, e.id, e.entry_no, e.entry_date, null::uuid, null::text, t.d,
           jsonb_build_object('written_on', (e.created_at at time zone 'Africa/Khartoum')::date,
                              'days', (e.created_at at time zone 'Africa/Khartoum')::date - e.entry_date)
      from ents e
      join totals t on t.entry_id = e.id
     where e.entry_date < (e.created_at at time zone 'Africa/Khartoum')::date - greatest(coalesce(p_backdate_days, 30), 1)
  ), dup as (
    select distinct on (e.id) 'duplicate'::text, e.id, e.entry_no, e.entry_date, null::uuid, a.code, l.base_minor,
           jsonb_build_object('other_entry_no', o.entry_no, 'other_entry_id', o.id, 'other_date', o.entry_date)
      from ents e
      join public.journal_lines l on l.entry_id = e.id
      join public.ledger_accounts a on a.id = l.account_id
      join public.journal_lines lo on lo.book_id = p_book and lo.account_id = l.account_id and lo.side = l.side
                                  and lo.base_minor = l.base_minor and lo.entry_id <> e.id
      join ents o on o.id = lo.entry_id and o.entry_no < e.entry_no and abs(o.entry_date - e.entry_date) <= 1
     order by e.id, o.entry_no desc
  ), cash_days as (
    select a.id as account_id, a.code, e.entry_date as day,
           sum(case when l.side = 'D' then l.base_minor else -l.base_minor end) as net
      from public.ledger_accounts a
      join public.journal_lines l on l.account_id = a.id and l.book_id = a.book_id
      join public.journal_entries e on e.id = l.entry_id
     where a.book_id = p_book and a.type = 'asset'
       and (a.system_key in ('cash_on_hand', 'bank', 'wallet') or a.provider is not null)
       and (p_to is null or e.entry_date <= p_to)
     group by a.id, a.code, e.entry_date
  ), cash_run as (
    select account_id, code, day, sum(net) over (partition by account_id order by day)::bigint as run
      from cash_days
  ), neg as (
    select 'negative_cash'::text, null::uuid, null::bigint, min(day), null::uuid, code, min(run),
           jsonb_build_object('days_negative', count(*))
      from cash_run
     where run < 0 and (p_from is null or day >= p_from)
     group by account_id, code
  ), stale as (
    select 'stale_draft'::text, null::uuid, null::bigint, d.entry_date, d.id, null::text,
           (select coalesce(sum((x ->> 'minor')::bigint) filter (where x ->> 'side' = 'D'), 0) from jsonb_array_elements(d.lines) x),
           jsonb_build_object('memo', d.memo, 'waiting_days', (now()::date - d.created_at::date), 'prepared_by', d.prepared_by)
      from public.ledger_drafts d
     where d.book_id = p_book and d.status = 'pending'
       and d.created_at < now() - make_interval(days => greatest(coalesce(p_draft_days, 7), 0))
  )
  select * from no_doc
  union all select * from large
  union all select * from back_dated
  union all select * from dup
  union all select * from neg
  union all select * from stale
  order by 1, 4 nulls last, 3 nulls last;
$$;

-- ── ١٣. المستند يقرؤه قارئ الدفتر، ويبقى ما دام قيدٌ يحمله ─────────────────────

create function public.ledger_document_readable(p_name text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.ledger_entry_meta m
                  where m.document_path = p_name and public._ledger_book_readable(m.book_id))
      or exists (select 1 from public.ledger_drafts d
                  where d.document_path = p_name
                    and (d.prepared_by = auth.uid() or public._ledger_book_readable(d.book_id)))
$$;

create function public.ledger_document_kept(p_name text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.ledger_entry_meta m where m.document_path = p_name)
      or exists (select 1 from public.ledger_drafts d where d.document_path = p_name and d.status in ('pending', 'posted'))
$$;

do $$
begin
  if to_regclass('storage.objects') is not null then
    execute 'drop policy if exists evidence_read_ledger_documents on storage.objects';
    execute $p$create policy evidence_read_ledger_documents on storage.objects
               for select to authenticated
               using (bucket_id = 'evidence' and public.ledger_document_readable(name))$p$;
    execute 'drop policy if exists evidence_keep_ledger_documents on storage.objects';
    -- Restrictive: whatever else allows a delete, a document an entry carries stays.
    execute $p$create policy evidence_keep_ledger_documents on storage.objects
               as restrictive for delete to authenticated
               using (bucket_id <> 'evidence' or not public.ledger_document_kept(name))$p$;
  end if;
end $$;

-- ── ١٤. من ينادي ماذا ────────────────────────────────────────────────────────

revoke execute on function
  public.ledger_append_only(), public.ledger_drafts_guard(), public.ledger_preparers_guard(),
  public.ledger_book_settings_guard(), public.ledger_book_guard(),
  public._ledger_audit_entry(), public._ledger_audit_lines(), public._ledger_audit_book(), public._ledger_audit_draft(),
  public._ledger_audit_preparer(), public._ledger_audit_setting(), public._ledger_audit_closing(),
  public._ledger_via(), public._ledger_actor_name(uuid),
  public._ledger_audit(uuid, text, uuid, uuid, jsonb, jsonb, uuid),
  public._ledger_book_for_owner(uuid), public._ledger_preparer_active(uuid), public._ledger_document_ok(text),
  public._ledger_dry_run(uuid, date, text, jsonb, numeric),
  public._ledger_post_manual(uuid, date, text, jsonb, text, numeric, text, text, text, text, uuid, uuid),
  public._ledger_closing_lines(uuid, date, date, uuid),
  public._ledger_reverse(uuid, text, date, text, uuid)
  from public, anon, authenticated, service_role;

-- What a signed-in person calls (each checks the owner, the preparer or the administrator itself). The service key acts
-- as nobody, so none of these is of use to it.
revoke execute on function
  public.ledger_entry_submit(uuid, date, text, jsonb, text, numeric, text, text, text, text),
  public.ledger_draft_approve(uuid, text),
  public.ledger_draft_reject(uuid, text, text),
  public.ledger_draft_withdraw(uuid, text),
  public.ledger_review_set(uuid, boolean, text),
  public.ledger_post(uuid, date, text, jsonb, text, numeric),
  public.ledger_preparer_invite(uuid, text, text),
  public.ledger_preparer_add_agent(uuid, uuid, text),
  public.ledger_preparer_answer(uuid, boolean, text),
  public.ledger_preparer_end(uuid, text),
  public.ledger_preparers_list(uuid),
  public.ledger_preparer_mine(),
  public.ledger_preparer_chart(uuid),
  public.ledger_close_income(uuid, date, text),
  public.ledger_close_season(uuid, uuid, date, text),
  public.ledger_period_close(uuid, date, text),
  public.ledger_period_reopen(uuid, date, text),
  public.ledger_exceptions(uuid, date, date, integer, integer),
  public.ledger_document_readable(text),
  public.ledger_document_kept(text)
  from public, anon, service_role;

grant execute on function
  public.ledger_entry_submit(uuid, date, text, jsonb, text, numeric, text, text, text, text),
  public.ledger_draft_approve(uuid, text),
  public.ledger_draft_reject(uuid, text, text),
  public.ledger_draft_withdraw(uuid, text),
  public.ledger_review_set(uuid, boolean, text),
  public.ledger_post(uuid, date, text, jsonb, text, numeric),
  public.ledger_preparer_invite(uuid, text, text),
  public.ledger_preparer_add_agent(uuid, uuid, text),
  public.ledger_preparer_answer(uuid, boolean, text),
  public.ledger_preparer_end(uuid, text),
  public.ledger_preparers_list(uuid),
  public.ledger_preparer_mine(),
  public.ledger_preparer_chart(uuid),
  public.ledger_close_income(uuid, date, text),
  public.ledger_close_season(uuid, uuid, date, text),
  public.ledger_period_close(uuid, date, text),
  public.ledger_period_reopen(uuid, date, text),
  public.ledger_exceptions(uuid, date, date, integer, integer),
  public.ledger_document_readable(text),
  public.ledger_document_kept(text)
  to authenticated;
