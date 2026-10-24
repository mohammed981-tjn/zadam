-- ═══════════════════════════════════════════════════════════════════════════
-- محرّك الدفتر المزدوج (البند ١٨٦، المرحلة ١)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- المالك، 24 أكتوبر 2026: «دفتر حساب متكامل مصغّر للمستثمر والمزارع، يُربط بالدفتر
-- العامّ للمنصّة، بميزان مراجعة وشجرة حسابات وقوائم ماليّة وميزانيّة». الدراسة في
-- docs/studies/accounting-ledger-ar.md، وهذه هي المرحلة الأولى منها: الأساس في القاعدة،
-- بلا شاشة ولا ترحيل لما هو قائم. لا يمسّ هذا الملفُّ جدولاً قائماً.
--
-- ما يفرضه محرّك القاعدة نفسه، لا التطبيق:
--
--   - ثلاثة أنواع من الدفاتر على قلبٍ واحد: مزرعة، ومستثمر، ومنصّة. لكلّ دفترٍ شجرةُ
--     حساباته المنسوخة من قالبٍ عند فتحه. مستخدمٌ واحد قد يملك دفترين (مزرعة ومستثمر).
--   - قيدٌ مزدوج: رأسٌ وسطور، المال أعدادٌ صحيحة بالوحدة الصغرى (لا كسور عشريّة). مجموع
--     المدين يساوي مجموع الدائن بوحدة القياس (الدولار)، يفرض ذلك زنادٌ مؤجَّل في القاعدة:
--     قيدٌ غير متوازن لا يُحفَظ مهما كان من كتبه ومن أين، بما فيه مفتاح الخدمة.
--   - عملتان: الدولار وحدةُ قياسٍ ثابتة، والجنيه كما دُفع. القيد الذي فيه جنيه يحمل سعر
--     صرفٍ واحداً (جنيه لكلّ دولار): افتراضيّاً سعر السوق الموازي المنشور في
--     `market_quotes` خلال ٧ أيام قبل تاريخ القيد (حدّ ٧ أيام سياستي لا قياس)، أو سعرٌ
--     يكتبه صاحب الدفتر (ما صرفه حقاً) فيُوسَم «سعر المستخدم». لا سعرَ قديماً يُستعمل صامتاً.
--     كلّ سطرٍ بالجنيه يحمل معادلَه بالدولار محسوباً من السعر، والزنادُ يعيد الحسابَ فيرفض
--     أيّ معادلٍ كُتب بيد. وفرق التقريب (وحدةٌ أو وحدتان) يذهب إلى حساب `7120` آليّاً.
--   - لا تعديل ولا حذف: القيد يُعكس بقيدٍ جديد (عكسٌ واحدٌ لكلّ قيد، ولا يُعكس العاكس)،
--     والفترة تُقفل بتاريخٍ (`closed_through`) لا يتراجع. زنادُ المنع يعمل حتى على مدير
--     القاعدة، ويمنع TRUNCATE.
--   - الكتابة عبر دوالّ فقط؛ لا INSERT مباشر لأحد. القراءة لصاحب الدفتر وحده؛ والإدارة
--     ترى دفتر المنصّة وحده (ولا ترى دفتر شخصٍ — قرار المالك ٨-٢ ينتظر).
--   - التقارير (ميزان المراجعة، كشف الحساب) دوالّ تُشتقّ من السطور وتعمل بصلاحية المنادي،
--     فسياسة الصفوف نفسها تحمي قراءتها.

-- ── العملات ─────────────────────────────────────────────────────────────────

create table public.ledger_currencies (
  code         text primary key check (code ~ '^[A-Z]{3}$'),
  name_ar      text not null,
  minor_digits smallint not null check (minor_digits between 0 and 4)
);

insert into public.ledger_currencies (code, name_ar, minor_digits) values
  ('USD', 'دولار أمريكي', 2),
  ('SDG', 'جنيه سوداني', 2);

-- ── الدفاتر ─────────────────────────────────────────────────────────────────

create table public.ledger_books (
  id            uuid primary key default gen_random_uuid(),
  -- null لدفتر المنصّة وحده. `restrict` عمداً: لا يُحذف مستخدمٌ له دفتر حتى يُقرَّر مصيرُ دفتره.
  owner_id      uuid references auth.users(id) on delete restrict,
  kind          text not null check (kind in ('farm', 'investor', 'platform')),
  -- وحدةُ القياس. الدولار وحده الآن (قرار المالك ٨-١ ينتظر)؛ غيره يحتاج هجرةً لا تغييرَ صفّ.
  base_currency text not null default 'USD' check (base_currency = 'USD') references public.ledger_currencies(code),
  -- كلّ قيدٍ بتاريخٍ حتى هذا اليوم (شاملاً) مقفل. لا يتراجع.
  closed_through date,
  created_at    timestamptz not null default now(),
  constraint ledger_books_owner_shape check ((kind = 'platform') = (owner_id is null))
);

create unique index ledger_books_owner_kind on public.ledger_books (owner_id, kind) where owner_id is not null;
create unique index ledger_books_one_platform on public.ledger_books (kind) where kind = 'platform';

-- ── قوالب الشجرة ────────────────────────────────────────────────────────────

create table public.ledger_chart_templates (
  kind        text not null check (kind in ('farm', 'investor', 'platform')),
  code        text not null check (code ~ '^[0-9]{1,8}$'),
  parent_code text,
  name_ar     text not null,
  name_en     text not null,
  type        text not null check (type in ('asset', 'liability', 'equity', 'revenue', 'expense')),
  postable    boolean not null,
  -- مفتاحٌ ثابتٌ تخاطب به الشيفرةُ الحسابَ دون أن ترتبط برقمه.
  system_key  text check (system_key ~ '^[a-z_]{2,40}$'),
  currency    text references public.ledger_currencies(code),
  provider    text check (provider ~ '^[a-z_]{2,30}$'),
  primary key (kind, code),
  foreign key (kind, parent_code) references public.ledger_chart_templates (kind, code)
);

insert into public.ledger_chart_templates
  (kind, code, parent_code, name_ar, name_en, type, postable, system_key, currency, provider)
values
  ('farm', '1', null, 'الأصول', 'Assets', 'asset', false, null, null, null),
  ('farm', '11', '1', 'النقديّة وما في حكمها', 'Cash and equivalents', 'asset', false, null, null, null),
  ('farm', '1110', '11', 'نقد في اليد', 'Cash on hand', 'asset', true, 'cash_on_hand', null, 'cash'),
  ('farm', '1120', '11', 'حساب مصرفيّ', 'Bank account', 'asset', true, 'bank', null, 'bank'),
  ('farm', '1130', '11', 'محفظة إلكترونيّة', 'Mobile wallet', 'asset', true, 'wallet', null, 'wallet'),
  ('farm', '12', '1', 'ذمم مدينة', 'Receivables', 'asset', false, null, null, null),
  ('farm', '1210', '12', 'مشترو المحصول', 'Crop buyers', 'asset', true, 'receivable_buyers', null, null),
  ('farm', '1220', '12', 'دفعات مقدّمة للموردين', 'Advances to suppliers', 'asset', true, 'supplier_advances', null, null),
  ('farm', '1230', '12', 'مستحق من الشريك أو المستثمر', 'Due from partner or investor', 'asset', true, 'due_from_partner', null, null),
  ('farm', '13', '1', 'المخزون', 'Inventory', 'asset', false, null, null, null),
  ('farm', '1310', '13', 'مدخلات (بذور وأسمدة ومبيدات)', 'Inputs (seed, fertiliser, pesticide)', 'asset', true, 'inventory_inputs', null, null),
  ('farm', '1320', '13', 'وقود وقطع غيار', 'Fuel and spare parts', 'asset', true, 'inventory_fuel', null, null),
  ('farm', '1330', '13', 'محصول مخزون بعد الحصاد', 'Harvested crop in store', 'asset', true, 'inventory_crop', null, null),
  ('farm', '14', '1', 'الأصول الحيويّة', 'Biological assets', 'asset', false, null, null, null),
  ('farm', '1410', '14', 'محاصيل قائمة (تحت الإنتاج بالتكلفة)', 'Growing crops (at cost)', 'asset', true, 'crops_in_progress', null, null),
  ('farm', '1420', '14', 'ثروة حيوانيّة', 'Livestock', 'asset', true, 'livestock', null, null),
  ('farm', '15', '1', 'أصول ثابتة', 'Fixed assets', 'asset', false, null, null, null),
  ('farm', '1510', '15', 'آلات ومعدّات', 'Machinery and equipment', 'asset', true, 'machinery', null, null),
  ('farm', '1520', '15', 'تحسينات أرض (قنوات وآبار)', 'Land improvements (canals, wells)', 'asset', true, 'land_improvements', null, null),
  ('farm', '1530', '15', 'مجمّع الإهلاك', 'Accumulated depreciation', 'asset', true, 'accumulated_depreciation', null, null),
  ('farm', '2', null, 'الالتزامات', 'Liabilities', 'liability', false, null, null, null),
  ('farm', '21', '2', 'ذمم دائنة', 'Payables', 'liability', false, null, null, null),
  ('farm', '2110', '21', 'موردون', 'Suppliers', 'liability', true, 'payables_suppliers', null, null),
  ('farm', '2120', '21', 'أجور مستحقة', 'Accrued wages', 'liability', true, 'accrued_wages', null, null),
  ('farm', '2130', '21', 'مستحق للشريك أو المستثمر (حصّته)', 'Due to partner or investor (their share)', 'liability', true, 'due_to_partner', null, null),
  ('farm', '22', '2', 'تمويل', 'Financing', 'liability', false, null, null, null),
  ('farm', '2210', '22', 'تمويل مدخلات من مستثمر', 'Input financing from an investor', 'liability', true, 'financing_from_investor', null, null),
  ('farm', '2220', '22', 'قروض', 'Loans', 'liability', true, 'loans', null, null),
  ('farm', '23', '2', 'مقبوضات مقدّمة', 'Deposits received', 'liability', false, null, null, null),
  ('farm', '2310', '23', 'عربون أو سلم على محصولٍ لم يُسلَّم', 'Deposit or salam on an undelivered crop', 'liability', true, 'customer_deposits', null, null),
  ('farm', '3', null, 'حقوق الملكيّة', 'Equity', 'equity', false, null, null, null),
  ('farm', '3110', '3', 'رأس مال المزارع', 'Farmer capital', 'equity', true, 'owner_capital', null, null),
  ('farm', '3120', '3', 'مساهمات الشريك', 'Partner contributions', 'equity', true, 'partner_contributions', null, null),
  ('farm', '3130', '3', 'سحوبات المالك', 'Owner drawings', 'equity', true, 'owner_drawings', null, null),
  ('farm', '3210', '3', 'أرباح محتجزة', 'Retained earnings', 'equity', true, 'retained_earnings', null, null),
  ('farm', '4', null, 'الإيرادات', 'Revenue', 'revenue', false, null, null, null),
  ('farm', '4110', '4', 'مبيعات محاصيل', 'Crop sales', 'revenue', true, 'sales_crops', null, null),
  ('farm', '4120', '4', 'مبيعات ثروة حيوانيّة', 'Livestock sales', 'revenue', true, 'sales_livestock', null, null),
  ('farm', '4130', '4', 'إيراد خدمات وتأجير', 'Service and rental income', 'revenue', true, 'service_income', null, null),
  ('farm', '4210', '4', 'دعم وإعانات', 'Subsidies and grants', 'revenue', true, 'subsidies', null, null),
  ('farm', '4310', '4', 'أرباح فروق صرف', 'Foreign exchange gains', 'revenue', true, 'fx_gain', null, null),
  ('farm', '4900', '4', 'إيرادات أخرى', 'Other income', 'revenue', true, 'other_income', null, null),
  ('farm', '5', null, 'تكاليف الإنتاج', 'Cost of production', 'expense', false, null, null, null),
  ('farm', '5110', '5', 'بذور', 'Seed', 'expense', true, 'cost_seeds', null, null),
  ('farm', '5120', '5', 'أسمدة', 'Fertiliser', 'expense', true, 'cost_fertiliser', null, null),
  ('farm', '5130', '5', 'مبيدات', 'Pesticide', 'expense', true, 'cost_pesticide', null, null),
  ('farm', '5140', '5', 'عمالة', 'Labour', 'expense', true, 'cost_labour', null, null),
  ('farm', '5150', '5', 'ريّ ووقود', 'Irrigation and fuel', 'expense', true, 'cost_irrigation', null, null),
  ('farm', '5160', '5', 'نقل', 'Transport', 'expense', true, 'cost_transport', null, null),
  ('farm', '5170', '5', 'إيجار أرض', 'Land rent', 'expense', true, 'cost_land_rent', null, null),
  ('farm', '5180', '5', 'صيانة وإصلاح', 'Repairs and maintenance', 'expense', true, 'cost_repairs', null, null),
  ('farm', '5190', '5', 'تأمين', 'Insurance', 'expense', true, 'cost_insurance', null, null),
  ('farm', '5195', '5', 'أخرى', 'Other', 'expense', true, 'cost_other', null, null),
  ('farm', '5210', '5', 'حصّة الشريك من المحصول', 'Partner share of the crop', 'expense', true, 'partner_share', null, null),
  ('farm', '5800', '5', 'تكلفة المحصول المباع', 'Cost of crop sold', 'expense', true, 'cost_of_sales', null, null),
  ('farm', '5900', '5', 'تكاليف مرسملة على المحاصيل القائمة (−)', 'Costs capitalised to growing crops (−)', 'expense', true, 'costs_capitalised', null, null),
  ('farm', '6', null, 'مصروفات عامّة', 'General expenses', 'expense', false, null, null, null),
  ('farm', '6110', '6', 'رسوم المنصّة', 'Platform fees', 'expense', true, 'platform_fees', null, null),
  ('farm', '6120', '6', 'رسوم مصرفيّة', 'Bank charges', 'expense', true, 'bank_fees', null, null),
  ('farm', '6130', '6', 'إهلاك', 'Depreciation', 'expense', true, 'depreciation', null, null),
  ('farm', '7', null, 'خسائر وفروق', 'Losses and differences', 'expense', false, null, null, null),
  ('farm', '7110', '7', 'خسائر فروق صرف وتضخّم', 'Foreign exchange and inflation losses', 'expense', true, 'fx_loss', null, null),
  ('farm', '7120', '7', 'فروق تقريب', 'Rounding differences', 'expense', true, 'rounding', null, null),
  ('farm', '7130', '7', 'خسائر محصول وإتلاف', 'Crop losses and write-offs', 'expense', true, 'crop_loss', null, null),
  ('investor', '1', null, 'الأصول', 'Assets', 'asset', false, null, null, null),
  ('investor', '11', '1', 'النقديّة وما في حكمها', 'Cash and equivalents', 'asset', false, null, null, null),
  ('investor', '1110', '11', 'نقد في اليد', 'Cash on hand', 'asset', true, 'cash_on_hand', null, 'cash'),
  ('investor', '1120', '11', 'حساب مصرفيّ', 'Bank account', 'asset', true, 'bank', null, 'bank'),
  ('investor', '1130', '11', 'محفظة إلكترونيّة', 'Mobile wallet', 'asset', true, 'wallet', null, 'wallet'),
  ('investor', '12', '1', 'ذمم مدينة', 'Receivables', 'asset', false, null, null, null),
  ('investor', '1230', '12', 'مستحق من المزارع (حصّتي من المحصول)', 'Due from the farmer (my share of the crop)', 'asset', true, 'due_from_farmer', null, null),
  ('investor', '13', '1', 'المخزون', 'Inventory', 'asset', false, null, null, null),
  ('investor', '1330', '13', 'محصول مستلَم عيناً', 'Crop received in kind', 'asset', true, 'inventory_crop', null, null),
  ('investor', '14', '1', 'التوظيفات', 'Deployments', 'asset', false, null, null, null),
  ('investor', '1430', '14', 'توظيف في موسم (مدخلات مموَّلة)', 'Deployed in a season (financed inputs)', 'asset', true, 'deployed_season', null, null),
  ('investor', '1440', '14', 'إيجار أرضٍ مدفوع مقدّماً', 'Prepaid land rent', 'asset', true, 'prepaid_rent', null, null),
  ('investor', '2', null, 'الالتزامات', 'Liabilities', 'liability', false, null, null, null),
  ('investor', '2110', '2', 'مستحقات للمنصّة وللغير', 'Payables', 'liability', true, 'payables', null, null),
  ('investor', '3', null, 'حقوق الملكيّة', 'Equity', 'equity', false, null, null, null),
  ('investor', '3110', '3', 'رأس مال المستثمر', 'Investor capital', 'equity', true, 'owner_capital', null, null),
  ('investor', '3130', '3', 'سحوبات', 'Withdrawals', 'equity', true, 'owner_drawings', null, null),
  ('investor', '3210', '3', 'أرباح محتجزة', 'Retained earnings', 'equity', true, 'retained_earnings', null, null),
  ('investor', '4', null, 'الإيرادات', 'Revenue', 'revenue', false, null, null, null),
  ('investor', '4150', '4', 'حصّتي من الحصاد', 'My share of the harvest', 'revenue', true, 'share_of_harvest', null, null),
  ('investor', '4310', '4', 'أرباح فروق صرف', 'Foreign exchange gains', 'revenue', true, 'fx_gain', null, null),
  ('investor', '4900', '4', 'إيرادات أخرى', 'Other income', 'revenue', true, 'other_income', null, null),
  ('investor', '6', null, 'مصروفات', 'Expenses', 'expense', false, null, null, null),
  ('investor', '6110', '6', 'رسوم المنصّة', 'Platform fees', 'expense', true, 'platform_fees', null, null),
  ('investor', '6120', '6', 'رسوم مصرفيّة', 'Bank charges', 'expense', true, 'bank_fees', null, null),
  ('investor', '6140', '6', 'رسوم المعاينة', 'Inspection fees', 'expense', true, 'inspection_fees', null, null),
  ('investor', '7', null, 'خسائر وفروق', 'Losses and differences', 'expense', false, null, null, null),
  ('investor', '7110', '7', 'خسائر فروق صرف وتضخّم', 'Foreign exchange and inflation losses', 'expense', true, 'fx_loss', null, null),
  ('investor', '7120', '7', 'فروق تقريب', 'Rounding differences', 'expense', true, 'rounding', null, null),
  ('investor', '7130', '7', 'حصّتي من خسارة المحصول', 'My share of crop losses', 'expense', true, 'crop_loss', null, null),
  ('platform', '1', null, 'الأصول', 'Assets', 'asset', false, null, null, null),
  ('platform', '1110', '1', 'نقد المنصّة', 'Platform cash', 'asset', true, 'cash_on_hand', null, 'bank'),
  ('platform', '1210', '1', 'رسوم مستحقّة القبض', 'Fees receivable', 'asset', true, 'fees_receivable', null, null),
  ('platform', '2', null, 'الالتزامات', 'Liabilities', 'liability', false, null, null, null),
  ('platform', '2110', '2', 'مستحقات للموردين', 'Payables', 'liability', true, 'payables', null, null),
  ('platform', '3', null, 'حقوق الملكيّة', 'Equity', 'equity', false, null, null, null),
  ('platform', '3110', '3', 'رأس المال', 'Capital', 'equity', true, 'owner_capital', null, null),
  ('platform', '3210', '3', 'أرباح محتجزة', 'Retained earnings', 'equity', true, 'retained_earnings', null, null),
  ('platform', '4', null, 'الإيرادات', 'Revenue', 'revenue', false, null, null, null),
  ('platform', '4110', '4', 'رسوم المعاينة', 'Inspection fees', 'revenue', true, 'fee_inspection', null, null),
  ('platform', '4120', '4', 'رسوم توثيق العقود', 'Agreement documentation fees', 'revenue', true, 'fee_agreement', null, null),
  ('platform', '4130', '4', 'رسوم الخدمات', 'Service fees', 'revenue', true, 'fee_service', null, null),
  ('platform', '4310', '4', 'أرباح فروق صرف', 'Foreign exchange gains', 'revenue', true, 'fx_gain', null, null),
  ('platform', '6', null, 'مصروفات التشغيل', 'Operating expenses', 'expense', false, null, null, null),
  ('platform', '6110', '6', 'الاستضافة والبرمجيّات', 'Hosting and software', 'expense', true, 'cost_hosting', null, null),
  ('platform', '6120', '6', 'الرسائل والاتّصالات', 'Messaging and communications', 'expense', true, 'cost_messaging', null, null),
  ('platform', '6130', '6', 'أجور', 'Wages', 'expense', true, 'cost_wages', null, null),
  ('platform', '7', null, 'خسائر وفروق', 'Losses and differences', 'expense', false, null, null, null),
  ('platform', '7110', '7', 'خسائر فروق صرف', 'Foreign exchange losses', 'expense', true, 'fx_loss', null, null),
  ('platform', '7120', '7', 'فروق تقريب', 'Rounding differences', 'expense', true, 'rounding', null, null),
  ('platform', '9', null, 'حسابات نظاميّة (خارج الميزانيّة)', 'Memorandum accounts (off balance sheet)', 'equity', false, null, null, null),
  ('platform', '9110', '9', 'عقود شراكة قائمة (القيمة المعلنة)', 'Partnership agreements in force (declared value)', 'equity', true, 'memo_agreements', null, null),
  ('platform', '9120', '9', 'مقابل الحسابات النظاميّة', 'Memorandum contra', 'equity', true, 'memo_contra', null, null);

-- ── الحسابات ────────────────────────────────────────────────────────────────

create table public.ledger_accounts (
  id          uuid primary key default gen_random_uuid(),
  book_id     uuid not null references public.ledger_books(id) on delete restrict,
  code        text not null check (code ~ '^[0-9]{1,8}$'),
  parent_code text,
  name_ar     text not null check (length(btrim(name_ar)) between 1 and 80),
  name_en     text not null default '' check (length(name_en) <= 80),
  type        text not null check (type in ('asset', 'liability', 'equity', 'revenue', 'expense')),
  -- الحساب التجميعيّ (false) لا يُقيَّد عليه؛ يجمع أبناءه.
  postable    boolean not null,
  system_key  text check (system_key ~ '^[a-z_]{2,40}$'),
  -- إن كان للحساب عملةٌ فلا يقبل سطراً بغيرها (حسابٌ مصرفيّ بالدولار مثلاً).
  currency    text references public.ledger_currencies(code),
  -- نوع الحساب النقديّ أو مزوّده: cash, bank, wallet, bankak, mtn_momo…
  provider    text check (provider ~ '^[a-z_]{2,30}$'),
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  unique (book_id, code),
  unique (id, book_id),
  foreign key (book_id, parent_code) references public.ledger_accounts (book_id, code)
);

create unique index ledger_accounts_system_key on public.ledger_accounts (book_id, system_key) where system_key is not null;

-- ── القيود ──────────────────────────────────────────────────────────────────

create table public.journal_entries (
  id              uuid primary key default gen_random_uuid(),
  entry_no        bigint generated always as identity,
  book_id         uuid not null references public.ledger_books(id) on delete restrict,
  entry_date      date not null check (entry_date >= date '2000-01-01'),
  memo            text not null default '' check (length(memo) <= 500),
  -- جنيه لكلّ دولار (سعر بيع الدولار). null إن كان القيد كلّه بالدولار.
  fx_rate         numeric(18, 6) check (fx_rate is null or fx_rate > 0),
  fx_source       text check (fx_source in ('parallel', 'bank', 'user')),
  source_type     text check (source_type ~ '^[a-z_]{2,30}$'),
  source_id       uuid,
  -- يربط قيدين متقابلين في دفترين (المرحلة ٣).
  link_id         uuid,
  reversal_of     uuid,
  idempotency_key text not null check (length(idempotency_key) between 8 and 120),
  content_hash    text not null check (content_hash ~ '^[0-9a-f]{64}$'),
  created_by      uuid,
  created_at      timestamptz not null default now(),
  constraint journal_entries_rate_shape check ((fx_rate is null) = (fx_source is null)),
  unique (id, book_id),
  unique (book_id, idempotency_key),
  unique (reversal_of),
  foreign key (reversal_of, book_id) references public.journal_entries (id, book_id)
);

create index journal_entries_book_date on public.journal_entries (book_id, entry_date, entry_no);
create index journal_entries_link on public.journal_entries (link_id) where link_id is not null;

create table public.journal_lines (
  id           uuid primary key default gen_random_uuid(),
  entry_id     uuid not null,
  book_id      uuid not null,
  line_no      smallint not null check (line_no between 1 and 201),
  account_id   uuid not null,
  side         text not null check (side in ('D', 'C')),
  currency     text not null references public.ledger_currencies(code),
  -- المبلغ بعملته وبالوحدة الصغرى (قرشٌ أو سنت)، عددٌ صحيحٌ موجب.
  amount_minor bigint not null check (amount_minor between 1 and 10000000000000),
  -- معادله بوحدة القياس (الدولار) بالوحدة الصغرى؛ يعيد الزنادُ حسابَه من سعر القيد.
  base_minor   bigint not null check (base_minor between 0 and 1000000000000000),
  -- أبعاد التحليل. بلا مفاتيح أجنبيّة عمداً: لا يُحذف شيءٌ في الدفتر ولو حُذف الموسم.
  season_id    uuid,
  land_id      uuid,
  herd_id      uuid,
  project_id   uuid,
  line_memo    text check (line_memo is null or length(line_memo) <= 200),
  unique (entry_id, line_no),
  foreign key (entry_id, book_id) references public.journal_entries (id, book_id),
  foreign key (account_id, book_id) references public.ledger_accounts (id, book_id)
);

create index journal_lines_account on public.journal_lines (book_id, account_id);
create index journal_lines_season on public.journal_lines (season_id) where season_id is not null;

comment on table public.journal_entries is
  'رأس القيد المزدوج. لا يُعدَّل ولا يُحذف؛ يُعكس بقيدٍ جديد. يكتبه ledger_post وحده.';
comment on table public.journal_lines is
  'سطور القيد: مبالغ صحيحة بالوحدة الصغرى، ومعادلها بالدولار. مجموع المدين = مجموع الدائن في كلّ قيد، يفرضه زنادٌ مؤجَّل.';
comment on column public.journal_entries.fx_rate is
  'جنيه لكلّ دولار (سعر بيع الدولار). null إن لم يكن في القيد جنيه.';

-- ── الوقت ───────────────────────────────────────────────────────────────────

-- The day in Khartoum: the one a farmer means by "today".
create function public.ledger_today()
returns date
language sql
stable
set search_path = public
as $$ select (now() at time zone 'Africa/Khartoum')::date $$;

-- ── التحويل: عددٌ صحيح، بلا عائم ────────────────────────────────────────────
--
-- base = round_half_up( minor × 10^(baseDigits−fromDigits) ÷ rate ), كلّه بحساب الأعداد
-- الصحيحة على سعرٍ مضروبٍ في مليون. تطابقه تماماً مكتبةُ TypeScript
-- (src/lib/ledger/money.ts)، ويُثبت التطابقَ ملفُّ scripts/fixtures/ledger-money.json.

create function public.ledger_to_base(
  p_minor       bigint,
  p_rate        numeric,
  p_from_digits integer default 2,
  p_base_digits integer default 2
) returns bigint
language plpgsql
immutable
set search_path = public
as $$
declare
  rs numeric := round(p_rate * 1000000);
begin
  if p_minor is null or p_minor < 0 then
    raise exception 'مبلغٌ غير صالح';
  end if;
  if p_rate is null or rs <= 0 then
    raise exception 'سعر صرفٍ غير صالح';
  end if;
  return div(p_minor::numeric * power(10::numeric, p_base_digits - p_from_digits) * 2000000 + rs, 2 * rs)::bigint;
end $$;

-- ── سعر الصرف الافتراضيّ ────────────────────────────────────────────────────
--
-- الأحدثُ المنشور على تاريخ القيد أو قبله بسبعة أيامٍ كحدٍّ أقصى. لا شيء إن لم يوجد:
-- لا يُقدَّر سعرٌ بالتخمين.

create function public.ledger_fx_rate(p_date date, p_source text default 'parallel')
returns table (rate numeric, rate_date date, source text)
language sql
stable
security definer
set search_path = public
as $$
  select m.sell::numeric(18, 6), m.market_date, p_source
    from public.market_quotes m
   where p_source in ('parallel', 'bank')
     and m.kind = 'fx_' || p_source
     and m.status = 'published'
     and m.sell is not null
     and m.market_date <= p_date
     and m.market_date >= p_date - 7
   order by m.market_date desc, m.created_at desc
   limit 1;
$$;

-- ── الحرّاس ─────────────────────────────────────────────────────────────────

create function public.ledger_immutable()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  raise exception 'الدفتر لا يُعدَّل ولا يُحذف: القيد يُعكس بقيدٍ جديد';
end $$;

-- The guards read the ledger's own tables, so they run as the function's owner and not as whoever is
-- committing: the balance check is deferred to commit, and by then the session's role is the caller's,
-- whose row-level policies would hide the very lines being checked.
-- الحسابات: لا حذف، ولا تغيير إلا في الاسم والإيقاف والمزوّد.
create function public.ledger_account_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  parent public.ledger_accounts;
begin
  if tg_op = 'INSERT' then
    if new.parent_code is not null then
      select * into parent from public.ledger_accounts where book_id = new.book_id and code = new.parent_code;
      if not found then
        raise exception 'الحساب الأب غير موجود';
      end if;
      if parent.postable then
        raise exception 'لا تُضاف حساباتٌ تحت حسابٍ يُقيَّد عليه؛ اختر حساباً تجميعيّاً';
      end if;
      if parent.type <> new.type then
        raise exception 'نوع الحساب يطابق نوع أبيه';
      end if;
    end if;
    return new;
  end if;

  if tg_op = 'DELETE' then
    raise exception 'الحسابات لا تُحذف؛ تُوقَف';
  end if;

  if (new.id, new.book_id, new.code, new.parent_code, new.type, new.postable, new.system_key, new.currency)
     is distinct from
     (old.id, old.book_id, old.code, old.parent_code, old.type, old.postable, old.system_key, old.currency) then
    raise exception 'لا يتغيّر من الحساب إلا اسمه وإيقافه ومزوّده';
  end if;
  if old.system_key is not null and new.active = false then
    raise exception 'حسابٌ نظاميّ تعتمد عليه القيود الآليّة؛ لا يُوقَف';
  end if;
  return new;
end $$;

create function public.ledger_book_guard()
returns trigger
language plpgsql
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
    raise exception 'الفترة المقفلة لا تُفتح من جديد';
  end if;
  return new;
end $$;

-- القيد: تاريخه خارج الفترة المقفلة ولا بعد غدٍ، والعاكس بعد الأصل.
create function public.ledger_entry_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  closed date;
  orig   public.journal_entries;
begin
  select closed_through into closed from public.ledger_books where id = new.book_id;
  if closed is not null and new.entry_date <= closed then
    raise exception 'الفترة حتى % مقفلة؛ لا قيد بتاريخٍ فيها', closed;
  end if;
  if new.entry_date > public.ledger_today() + 1 then
    raise exception 'لا قيد بتاريخٍ في المستقبل';
  end if;
  if new.reversal_of is not null then
    select * into orig from public.journal_entries where id = new.reversal_of;
    if not found then
      raise exception 'القيد المعكوس غير موجود';
    end if;
    if orig.reversal_of is not null then
      raise exception 'لا يُعكس قيدٌ عاكس';
    end if;
    if new.entry_date < orig.entry_date then
      raise exception 'العكس لا يسبق القيد الأصل';
    end if;
  end if;
  return new;
end $$;

-- السطر: حسابٌ يُقيَّد عليه وبعملته، ومعادلُه بالدولار هو ما يعطيه سعرُ القيد.
create function public.ledger_line_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  acc   public.ledger_accounts;
  ent   public.journal_entries;
  bcur  text;
  d_cur smallint;
  d_bas smallint;
begin
  select * into acc from public.ledger_accounts where id = new.account_id;
  if not acc.postable then
    raise exception 'الحساب % تجميعيّ لا يُقيَّد عليه', acc.code;
  end if;
  if not acc.active then
    raise exception 'الحساب % موقوف', acc.code;
  end if;
  if acc.currency is not null and acc.currency <> new.currency then
    raise exception 'الحساب % بعملة %', acc.code, acc.currency;
  end if;

  select * into ent from public.journal_entries where id = new.entry_id;
  select base_currency into bcur from public.ledger_books where id = new.book_id;

  if new.currency = bcur then
    if new.base_minor <> new.amount_minor then
      raise exception 'معادل سطرٍ بعملة القياس يساوي مبلغه';
    end if;
  else
    if ent.fx_rate is null then
      raise exception 'قيدٌ فيه عملةٌ غير الدولار بلا سعر صرف';
    end if;
    select minor_digits into d_cur from public.ledger_currencies where code = new.currency;
    select minor_digits into d_bas from public.ledger_currencies where code = bcur;
    if new.base_minor <> public.ledger_to_base(new.amount_minor, ent.fx_rate, d_cur, d_bas) then
      raise exception 'معادل السطر بالدولار لا يطابق سعر القيد';
    end if;
  end if;
  return new;
end $$;

-- التوازن: يُفحص عند إتمام المعاملة، فيكفي أن يكتمل القيد قبلها.
create function public.ledger_balance_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_entry uuid;
  d bigint;
  c bigint;
  n integer;
begin
  if tg_table_name = 'journal_entries' then
    v_entry := new.id;
  else
    v_entry := new.entry_id;
  end if;
  select coalesce(sum(base_minor) filter (where side = 'D'), 0),
         coalesce(sum(base_minor) filter (where side = 'C'), 0),
         count(*)
    into d, c, n
    from public.journal_lines where entry_id = v_entry;
  if n < 2 then
    raise exception 'القيد يحتاج سطرين على الأقل';
  end if;
  if d <> c then
    raise exception 'القيد غير متوازن: المدين % والدائن % (بالوحدة الصغرى للدولار)', d, c;
  end if;
  return null;
end $$;

create trigger ledger_books_guard
  before update or delete on public.ledger_books
  for each row execute function public.ledger_book_guard();
create trigger ledger_accounts_guard
  before insert or update or delete on public.ledger_accounts
  for each row execute function public.ledger_account_guard();
create trigger journal_entries_guard
  before insert on public.journal_entries
  for each row execute function public.ledger_entry_guard();
create trigger journal_lines_guard
  before insert on public.journal_lines
  for each row execute function public.ledger_line_guard();

create trigger journal_entries_immutable
  before update or delete on public.journal_entries
  for each row execute function public.ledger_immutable();
create trigger journal_lines_immutable
  before update or delete on public.journal_lines
  for each row execute function public.ledger_immutable();

create trigger ledger_books_no_truncate
  before truncate on public.ledger_books for each statement execute function public.ledger_immutable();
create trigger ledger_accounts_no_truncate
  before truncate on public.ledger_accounts for each statement execute function public.ledger_immutable();
create trigger journal_entries_no_truncate
  before truncate on public.journal_entries for each statement execute function public.ledger_immutable();
create trigger journal_lines_no_truncate
  before truncate on public.journal_lines for each statement execute function public.ledger_immutable();

create constraint trigger journal_entries_balanced
  after insert on public.journal_entries
  deferrable initially deferred
  for each row execute function public.ledger_balance_guard();
create constraint trigger journal_lines_balanced
  after insert on public.journal_lines
  deferrable initially deferred
  for each row execute function public.ledger_balance_guard();

-- ── الصلاحيّات وسياسة الصفوف ────────────────────────────────────────────────

alter table public.ledger_currencies enable row level security;
alter table public.ledger_chart_templates enable row level security;
alter table public.ledger_books enable row level security;
alter table public.ledger_accounts enable row level security;
alter table public.journal_entries enable row level security;
alter table public.journal_lines enable row level security;

revoke all on table
  public.ledger_currencies, public.ledger_chart_templates, public.ledger_books,
  public.ledger_accounts, public.journal_entries, public.journal_lines
  from anon, authenticated, service_role;

grant select on public.ledger_currencies, public.ledger_chart_templates to authenticated, service_role;
grant select on public.ledger_books, public.ledger_accounts, public.journal_entries, public.journal_lines
  to authenticated, service_role;

create policy ledger_currencies_read on public.ledger_currencies
  for select to authenticated using (true);
create policy ledger_templates_read on public.ledger_chart_templates
  for select to authenticated using (true);

-- The book is its owner's; the platform's book is the administrators'.
create policy ledger_books_read on public.ledger_books
  for select to authenticated
  using (owner_id = (select auth.uid()) or (kind = 'platform' and (select is_admin())));

create policy ledger_accounts_read on public.ledger_accounts
  for select to authenticated
  using (exists (select 1 from public.ledger_books b where b.id = ledger_accounts.book_id));
create policy journal_entries_read on public.journal_entries
  for select to authenticated
  using (exists (select 1 from public.ledger_books b where b.id = journal_entries.book_id));
create policy journal_lines_read on public.journal_lines
  for select to authenticated
  using (exists (select 1 from public.ledger_books b where b.id = journal_lines.book_id));

revoke execute on function
  public.ledger_immutable(), public.ledger_account_guard(), public.ledger_book_guard(),
  public.ledger_entry_guard(), public.ledger_line_guard(), public.ledger_balance_guard()
  from public, anon, authenticated, service_role;

-- ── فتح الدفتر ──────────────────────────────────────────────────────────────

create function public._ledger_open_book(p_owner uuid, p_kind text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if p_kind not in ('farm', 'investor', 'platform') then
    raise exception 'نوع دفترٍ غير معروف';
  end if;
  if (p_kind = 'platform') <> (p_owner is null) then
    raise exception 'لدفتر المنصّة وحده بلا مالك';
  end if;

  -- Two taps at once must open one book, not two.
  perform pg_advisory_xact_lock(hashtext('ledger_book:' || coalesce(p_owner::text, 'platform') || ':' || p_kind));

  select id into v_id from public.ledger_books
   where kind = p_kind and owner_id is not distinct from p_owner;
  if found then
    return v_id;
  end if;

  insert into public.ledger_books (owner_id, kind) values (p_owner, p_kind) returning id into v_id;
  -- Parents before children, so the guard finds a parent when it looks.
  insert into public.ledger_accounts (book_id, code, parent_code, name_ar, name_en, type, postable, system_key, currency, provider)
  select v_id, t.code, t.parent_code, t.name_ar, t.name_en, t.type, t.postable, t.system_key, t.currency, t.provider
    from public.ledger_chart_templates t
   where t.kind = p_kind
   order by length(t.code), t.code;
  return v_id;
end $$;

create function public.ledger_open_book(p_kind text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'سجّل الدخول أولاً';
  end if;
  if p_kind = 'platform' then
    if not is_admin() then
      raise exception 'دفتر المنصّة للإدارة وحدها';
    end if;
    return public._ledger_open_book(null, 'platform');
  end if;
  return public._ledger_open_book(auth.uid(), p_kind);
end $$;

create function public.ledger_open_book_for(p_owner uuid, p_kind text)
returns uuid
language sql
security definer
set search_path = public
as $$ select public._ledger_open_book(p_owner, p_kind) $$;

-- ── إضافة حساب ──────────────────────────────────────────────────────────────

create function public.ledger_add_account(
  p_book      uuid,
  p_parent    text,
  p_code      text,
  p_name_ar   text,
  p_name_en   text default '',
  p_currency  text default null,
  p_provider  text default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_parent public.ledger_accounts;
  v_id uuid;
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

  select * into v_parent from public.ledger_accounts where book_id = p_book and code = p_parent;
  if not found then
    raise exception 'الحساب الأب غير موجود';
  end if;
  if p_code is null or p_code !~ '^[0-9]{2,8}$' or p_code = v_parent.code
     or left(p_code, length(v_parent.code)) <> v_parent.code then
    raise exception 'رقم الحساب يبدأ برقم أبيه';
  end if;
  if exists (select 1 from public.ledger_accounts where book_id = p_book and code = p_code) then
    raise exception 'رقم الحساب مستعمل';
  end if;
  if length(btrim(coalesce(p_name_ar, ''))) not between 1 and 80 then
    raise exception 'اسم الحساب من حرفٍ إلى ٨٠';
  end if;
  if p_currency is not null and p_currency <> '' and not exists (select 1 from public.ledger_currencies where code = upper(p_currency)) then
    raise exception 'عملة غير معروفة';
  end if;
  if p_provider is not null and p_provider <> '' and p_provider !~ '^[a-z_]{2,30}$' then
    raise exception 'مزوّدٌ غير صالح';
  end if;
  if (select count(*) from public.ledger_accounts where book_id = p_book) >= 300 then
    raise exception 'بلغ الدفتر حدّ ٣٠٠ حساب';
  end if;

  insert into public.ledger_accounts (book_id, code, parent_code, name_ar, name_en, type, postable, currency, provider)
  values (p_book, p_code, v_parent.code, btrim(p_name_ar), coalesce(p_name_en, ''), v_parent.type, true,
          nullif(upper(p_currency), ''), nullif(p_provider, ''))
  returning id into v_id;
  return v_id;
end $$;

-- ── مساعد: معرّف بُعد ───────────────────────────────────────────────────────

create function public._ledger_opt_uuid(p text)
returns uuid
language plpgsql
immutable
set search_path = public
as $$
begin
  if p is null or p = '' then
    return null;
  end if;
  if p !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    raise exception 'معرّف بُعدٍ غير صالح';
  end if;
  return p::uuid;
end $$;

-- ── النشر ───────────────────────────────────────────────────────────────────
--
-- `p_lines`: مصفوفة JSON، كلّ سطرٍ كائنٌ فيه:
--   account (رقم الحساب) أو key (مفتاحه النظاميّ)، side (D مدين / C دائن)،
--   currency (USD أو SDG)، minor (عددٌ صحيحٌ موجب بالوحدة الصغرى)،
--   وبالاختيار: season, land, herd, project (معرّفات)، memo.
-- `p_key`: مفتاح الفرادة؛ إعادة الإرسال بالمفتاح نفسه والمحتوى نفسه تُرجع القيدَ نفسه
-- ولا تكتب شيئاً، وبمحتوى مختلف تُرفض. `p_rate`: جنيه لكلّ دولار إن كتبه صاحب الدفتر.

create function public._ledger_post(
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
           p_date::text || '|' || p_memo || '|' || coalesce(p_rate::text, '') || '|'
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
      v_src := 'user';
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

-- لصاحب الدفتر (أو للإدارة في دفتر المنصّة): النشر اليدويّ، لا يدّعي مصدراً.
create function public.ledger_post(
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
  return public._ledger_post(p_book, p_date, p_memo, p_lines, p_key, p_rate, 'manual', null, null, auth.uid());
end $$;

-- لمفتاح الخدمة وحده: القيود الآليّة (من قيد موسم، من عقد، من رسم) بمصدرها وربطها.
create function public.ledger_post_for(
  p_book        uuid,
  p_date        date,
  p_memo        text,
  p_lines       jsonb,
  p_key         text,
  p_rate        numeric default null,
  p_source_type text default null,
  p_source_id   uuid default null,
  p_link        uuid default null,
  p_actor       uuid default null
) returns uuid
language sql
security definer
set search_path = public
as $$
  select public._ledger_post(p_book, p_date, p_memo, p_lines, p_key, p_rate, p_source_type, p_source_id, p_link, p_actor)
$$;

-- ── العكس ───────────────────────────────────────────────────────────────────
--
-- القيد العاكس ينسخ المبالغ ومعادلاتها بالدولار كما هي بجانبٍ معكوس، فيُصفّر الأصلَ تماماً
-- مهما تغيّر السعر بعده. وعكسٌ واحدٌ لكلّ قيد.

create function public._ledger_reverse(
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

create function public.ledger_reverse(
  p_entry  uuid,
  p_reason text,
  p_date   date default null,
  p_key    text default null
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
    select 1 from public.journal_entries e
      join public.ledger_books b on b.id = e.book_id
     where e.id = p_entry and (b.owner_id = auth.uid() or (b.kind = 'platform' and is_admin()))
  ) then
    raise exception 'ليس هذا قيدك';
  end if;
  return public._ledger_reverse(p_entry, p_reason, p_date, p_key, auth.uid());
end $$;

create function public.ledger_reverse_for(
  p_entry  uuid,
  p_reason text,
  p_date   date default null,
  p_key    text default null,
  p_actor  uuid default null
) returns uuid
language sql
security definer
set search_path = public
as $$ select public._ledger_reverse(p_entry, p_reason, p_date, p_key, p_actor) $$;

-- ── إقفال الفترة ────────────────────────────────────────────────────────────

create function public.ledger_close_through(p_book uuid, p_date date)
returns date
language plpgsql
security definer
set search_path = public
as $$
declare
  v_book public.ledger_books;
begin
  if auth.uid() is null then
    raise exception 'سجّل الدخول أولاً';
  end if;
  select * into v_book from public.ledger_books b
   where b.id = p_book and (b.owner_id = auth.uid() or (b.kind = 'platform' and is_admin()))
   for update;
  if not found then
    raise exception 'ليس هذا دفترك';
  end if;
  if p_date is null or p_date >= public.ledger_today() then
    raise exception 'لا يُقفل إلا يومٌ مضى';
  end if;
  if v_book.closed_through is not null and p_date < v_book.closed_through then
    raise exception 'الفترة حتى % مقفلة أصلاً، ولا تُفتح', v_book.closed_through;
  end if;
  update public.ledger_books set closed_through = p_date where id = p_book;
  return p_date;
end $$;

-- ── التقارير: تعمل بصلاحية المنادي، فتحمي سياسةُ الصفوف قراءتَها ─────────────

create function public.ledger_trial_balance(p_book uuid, p_as_of date default null)
returns table (
  account_id      uuid,
  code            text,
  name_ar         text,
  name_en         text,
  type            text,
  debit_total     bigint,
  credit_total    bigint,
  debit_balance   bigint,
  credit_balance  bigint
)
language sql
stable
security invoker
set search_path = public
as $$
  select a.id, a.code, a.name_ar, a.name_en, a.type,
         sum(case when l.side = 'D' then l.base_minor else 0 end)::bigint,
         sum(case when l.side = 'C' then l.base_minor else 0 end)::bigint,
         greatest(sum(case when l.side = 'D' then l.base_minor else -l.base_minor end), 0)::bigint,
         greatest(sum(case when l.side = 'C' then l.base_minor else -l.base_minor end), 0)::bigint
    from public.ledger_accounts a
    join public.journal_lines l on l.account_id = a.id and l.book_id = a.book_id
    join public.journal_entries e on e.id = l.entry_id
   where a.book_id = p_book
     and (p_as_of is null or e.entry_date <= p_as_of)
   group by a.id, a.code, a.name_ar, a.name_en, a.type
   order by a.code;
$$;

-- الإثبات: المدين = الدائن، والمعادلة المحاسبيّة تتحقّق. صفٌّ واحد.
create function public.ledger_trial_balance_proof(p_book uuid, p_as_of date default null)
returns table (
  entries          bigint,
  lines            bigint,
  debit_total      bigint,
  credit_total     bigint,
  balanced         boolean,
  assets           bigint,
  liabilities      bigint,
  equity           bigint,
  net_income       bigint,
  equation_holds   boolean
)
language sql
stable
security invoker
set search_path = public
as $$
  with t as (
    select e.id as entry_id, l.side, l.base_minor, a.type
      from public.journal_lines l
      join public.journal_entries e on e.id = l.entry_id
      join public.ledger_accounts a on a.id = l.account_id and a.book_id = l.book_id
     where l.book_id = p_book
       and (p_as_of is null or e.entry_date <= p_as_of)
  ), s as (
    select count(distinct entry_id) as entries,
           count(*) as lines,
           coalesce(sum(base_minor) filter (where side = 'D'), 0) as d,
           coalesce(sum(base_minor) filter (where side = 'C'), 0) as c,
           coalesce(sum(case when side = 'D' then base_minor else -base_minor end) filter (where type = 'asset'), 0) as assets,
           coalesce(sum(case when side = 'C' then base_minor else -base_minor end) filter (where type = 'liability'), 0) as liabilities,
           coalesce(sum(case when side = 'C' then base_minor else -base_minor end) filter (where type = 'equity'), 0) as equity,
           coalesce(sum(case when side = 'C' then base_minor else -base_minor end) filter (where type = 'revenue'), 0)
             - coalesce(sum(case when side = 'D' then base_minor else -base_minor end) filter (where type = 'expense'), 0) as net_income
      from t
  )
  select entries, lines, d::bigint, c::bigint, d = c,
         assets::bigint, liabilities::bigint, equity::bigint, net_income::bigint,
         assets = liabilities + equity + net_income
    from s;
$$;

-- كشف الحساب: رصيد افتتاحيّ ثم الحركات برصيدٍ جارٍ، بالدولار وبعملة كلّ سطر.
-- الرصيد في اتجاه الحساب الطبيعيّ (مدين للأصول والمصروفات، دائن لغيرها).
create function public.ledger_account_statement(
  p_book    uuid,
  p_account uuid,
  p_from    date default null,
  p_to      date default null
) returns table (
  row_type       text,
  entry_id       uuid,
  entry_no       bigint,
  entry_date     date,
  line_no        integer,
  memo           text,
  side           text,
  currency       text,
  amount_minor   bigint,
  base_minor     bigint,
  signed_base    bigint,
  running_base   bigint,
  signed_native  bigint,
  running_native bigint
)
language sql
stable
security invoker
set search_path = public
as $$
  with mv as (
    select e.id as entry_id, e.entry_no, e.entry_date, l.line_no::integer as line_no,
           e.memo, l.side, l.currency, l.amount_minor, l.base_minor,
           case when (a.type in ('asset', 'expense')) = (l.side = 'D') then 1 else -1 end as sgn
      from public.journal_lines l
      join public.journal_entries e on e.id = l.entry_id
      join public.ledger_accounts a on a.id = l.account_id and a.book_id = l.book_id
     where l.book_id = p_book and l.account_id = p_account
       and (p_to is null or e.entry_date <= p_to)
  ), w as (
    select mv.*,
           (sgn * base_minor)::bigint as signed_base,
           sum(sgn * base_minor) over (order by entry_date, entry_no, line_no)::bigint as running_base,
           (sgn * amount_minor)::bigint as signed_native,
           sum(sgn * amount_minor) over (partition by currency order by entry_date, entry_no, line_no)::bigint as running_native
      from mv
  )
  select 'opening'::text, null::uuid, null::bigint, p_from, null::integer, 'رصيد أول الفترة'::text,
         null::text, null::text, null::bigint, null::bigint,
         0::bigint, o.s, 0::bigint, null::bigint
    from (select coalesce(sum(signed_base), 0)::bigint as s from w where entry_date < p_from) o
   where p_from is not null
  union all
  select 'line', entry_id, entry_no, entry_date, line_no, memo, side, currency, amount_minor, base_minor,
         signed_base, running_base, signed_native, running_native
    from w
   where p_from is null or entry_date >= p_from
   order by 4, 3 nulls first, 5 nulls first;
$$;

-- ── سلامة الدفاتر: للإدارة، أعدادٌ ومجاميع بلا أسماء ────────────────────────

create function public.ledger_integrity()
returns table (
  book_id             uuid,
  kind                text,
  entries             bigint,
  lines               bigint,
  debit_total         bigint,
  credit_total        bigint,
  unbalanced_entries  bigint,
  entries_under_two_lines bigint,
  ok                  boolean
)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
begin
  if not is_admin() then
    raise exception 'للإدارة وحدها';
  end if;
  return query
  with per_entry as (
    select e.book_id, e.id,
           coalesce(sum(l.base_minor) filter (where l.side = 'D'), 0) as d,
           coalesce(sum(l.base_minor) filter (where l.side = 'C'), 0) as c,
           count(l.id) as n
      from public.journal_entries e
      left join public.journal_lines l on l.entry_id = e.id
     group by e.book_id, e.id
  ), per_book as (
    select p.book_id,
           count(*) as entries,
           sum(p.n) as lines,
           sum(p.d) as d,
           sum(p.c) as c,
           count(*) filter (where p.d <> p.c) as unbalanced,
           count(*) filter (where p.n < 2) as empty
      from per_entry p
     group by p.book_id
  )
  select b.id, b.kind,
         coalesce(pb.entries, 0)::bigint, coalesce(pb.lines, 0)::bigint,
         coalesce(pb.d, 0)::bigint, coalesce(pb.c, 0)::bigint,
         coalesce(pb.unbalanced, 0)::bigint, coalesce(pb.empty, 0)::bigint,
         coalesce(pb.d, 0) = coalesce(pb.c, 0) and coalesce(pb.unbalanced, 0) = 0 and coalesce(pb.empty, 0) = 0
    from public.ledger_books b
    left join per_book pb on pb.book_id = b.id
   order by b.kind, b.created_at;
end $$;

-- ── من ينادي ماذا ───────────────────────────────────────────────────────────

revoke execute on function
  public._ledger_open_book(uuid, text),
  public._ledger_post(uuid, date, text, jsonb, text, numeric, text, uuid, uuid, uuid),
  public._ledger_reverse(uuid, text, date, text, uuid),
  public._ledger_opt_uuid(text)
  from public, anon, authenticated, service_role;

revoke execute on function
  public.ledger_today(),
  public.ledger_to_base(bigint, numeric, integer, integer),
  public.ledger_fx_rate(date, text),
  public.ledger_open_book(text),
  public.ledger_open_book_for(uuid, text),
  public.ledger_add_account(uuid, text, text, text, text, text, text),
  public.ledger_post(uuid, date, text, jsonb, text, numeric),
  public.ledger_post_for(uuid, date, text, jsonb, text, numeric, text, uuid, uuid, uuid),
  public.ledger_reverse(uuid, text, date, text),
  public.ledger_reverse_for(uuid, text, date, text, uuid),
  public.ledger_close_through(uuid, date),
  public.ledger_trial_balance(uuid, date),
  public.ledger_trial_balance_proof(uuid, date),
  public.ledger_account_statement(uuid, uuid, date, date),
  public.ledger_integrity()
  from public, anon;

-- Supabase hands the service key EXECUTE on every new function by default. The ones that act as a
-- signed-in person (auth.uid()) are of no use to it and are taken away, so that "who may call what"
-- reads the same here as in the grants below.
revoke execute on function
  public.ledger_open_book(text),
  public.ledger_add_account(uuid, text, text, text, text, text, text),
  public.ledger_post(uuid, date, text, jsonb, text, numeric),
  public.ledger_reverse(uuid, text, date, text),
  public.ledger_close_through(uuid, date),
  public.ledger_integrity()
  from service_role;

grant execute on function
  public.ledger_today(),
  public.ledger_to_base(bigint, numeric, integer, integer),
  public.ledger_fx_rate(date, text),
  public.ledger_open_book(text),
  public.ledger_add_account(uuid, text, text, text, text, text, text),
  public.ledger_post(uuid, date, text, jsonb, text, numeric),
  public.ledger_reverse(uuid, text, date, text),
  public.ledger_close_through(uuid, date),
  public.ledger_trial_balance(uuid, date),
  public.ledger_trial_balance_proof(uuid, date),
  public.ledger_account_statement(uuid, uuid, date, date),
  public.ledger_integrity()
  to authenticated;

grant execute on function
  public.ledger_today(),
  public.ledger_to_base(bigint, numeric, integer, integer),
  public.ledger_fx_rate(date, text),
  public.ledger_open_book_for(uuid, text),
  public.ledger_post_for(uuid, date, text, jsonb, text, numeric, text, uuid, uuid, uuid),
  public.ledger_reverse_for(uuid, text, date, text, uuid),
  public.ledger_trial_balance(uuid, date),
  public.ledger_trial_balance_proof(uuid, date),
  public.ledger_account_statement(uuid, uuid, date, date)
  to service_role;
