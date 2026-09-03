-- ممرّ الصادر داخل سودجري — المرحلة الأولى: العرض وحُرّاسه وآلةُ حالاته.
--
-- لماذا هنا لا في مشروعٍ آخر
--
-- The export corridor was designed in a separate repository, as a document a
-- second system would receive. The owner has settled that: that project is a
-- separate Saudi venture, and this is Sudanese. So the designs come across —
-- the frozen-requirements idea, the polygon rule, the immutable custody chain —
-- and the wiring does not. There is no bridge, no ingest endpoint, no server
-- talking to a server. An offer is born, reviewed and published in one place.
--
-- That is simpler than what a bridge would have needed, not more complex: the
-- whole question of "who owns this row" never arises.
--
-- ما تضيفه هذه الهجرة، ولماذا كلُّ قطعةٍ منها
--
-- Sudagri already knows what nobody else knows: which farmer grew what, where,
-- when, and with what evidence. What it has never had is a way to turn that into
-- something a buyer can act on. This is that — and the export study says why it
-- is the valuable half: the European door is open with zero tariffs, and goods
-- are still refused, 65 of them for missing paperwork alone. The scarce thing is
-- proof, not access.
--
-- الوحدةُ قابلةٌ للتغيير — بطلب المالك
--
-- Each commodity carries a default unit (sheep by head, gum by tonne) and each
-- offer may override it. So selling one flock by head and another by delivered
-- weight is a row, not a release. That follows this project's first rule: no
-- business rule compiled into code.
--
-- والرفضُ بسببٍ مكتوب
--
-- A rejected offer carries the reason and returns to the farmer to fix. Refusing
-- without one makes the farmer repeat the same mistake, and makes the platform
-- unable to say what it keeps refusing. The constraint enforces it rather than
-- trusting a screen.
--
-- ما ليس هنا بعد
--
-- Shipment legs, inspections, escrow, export proceeds. Those belong to a
-- consignment that is actually moving; this migration stops at the offer a buyer
-- can see. Stated so the gap is a decision, not an oversight.

-- ===========================================================================
-- ١) المرجعيات — بياناتٌ يضبطها المدير، لا ثوابتُ في كود
-- ===========================================================================

create table if not exists export_uom (
  code        text primary key,
  name_ar     text not null,
  kind        text not null,
  to_base     numeric(16,6) not null,
  constraint export_uom_kind_known check (kind in ('mass','count','volume')),
  constraint export_uom_factor_positive check (to_base > 0)
);

create table if not exists export_commodities (
  id               uuid primary key default gen_random_uuid(),
  code             text not null unique,
  name_ar          text not null,
  hs_code          text,
  -- الافتراضيّة لا الإلزامية: للعرض أن يخالفها (انظر قيدَ العرض أدناه).
  default_uom_code text not null references export_uom(code),
  active           boolean not null default true,
  created_at       timestamptz not null default now()
);

create table if not exists export_commodity_grades (
  id           uuid primary key default gen_random_uuid(),
  commodity_id uuid not null references export_commodities(id) on delete cascade,
  code         text not null,
  name_ar      text not null,
  unique (commodity_id, code)
);

create table if not exists export_destinations (
  id       uuid primary key default gen_random_uuid(),
  code     text not null unique,
  name_ar  text not null,
  active   boolean not null default true
);

-- الممرّ: زوجُ سلعةٍ ووجهة. ولا ممرَّ ⇐ لا عرض. هذا يمنع عرضاً لسلعةٍ إلى
-- وجهةٍ لم يدرس أحدٌ ما تطلبه، وهو أسوأُ من غياب العرض لأنه يَعِد بما لا يُسلَّم.
create table if not exists export_corridors (
  id             uuid primary key default gen_random_uuid(),
  commodity_id   uuid not null references export_commodities(id),
  destination_id uuid not null references export_destinations(id),
  active         boolean not null default true,
  unique (commodity_id, destination_id)
);

create table if not exists export_document_types (
  id       uuid primary key default gen_random_uuid(),
  code     text not null unique,
  name_ar  text not null,
  note_ar  text
);

-- المتطلّباتُ مؤرَّخة: لائحةٌ تسري في تاريخ، وأخرى تنتهي في تاريخ. وهذا ما
-- يجعل «ما كان مطلوباً يوم الشحن» سؤالاً له جواب بعد سنتين.
create table if not exists export_corridor_requirements (
  id               uuid primary key default gen_random_uuid(),
  corridor_id      uuid not null references export_corridors(id) on delete cascade,
  document_type_id uuid not null references export_document_types(id),
  mode             text not null,
  effective_from   date not null,
  effective_to     date,
  constraint export_requirement_mode check (mode in ('required','conditional','recommended')),
  constraint export_requirement_window
    check (effective_to is null or effective_to > effective_from)
);

-- ===========================================================================
-- ٢) العرض
-- ===========================================================================

create table if not exists export_offers (
  id            uuid primary key default gen_random_uuid(),
  reference     text not null unique,

  owner_id      uuid not null references profiles(id) on delete cascade,
  -- الموسمُ اختياريّ: أكثرُ العروض تأتي منه، وبعضُها لبضاعةٍ لا موسمَ لها هنا.
  -- وحين يوجد، فهو مصدرُ الأدلّة والإحداثيّات.
  season_id     uuid references seasons(id) on delete set null,

  corridor_id   uuid not null references export_corridors(id),
  grade_id      uuid references export_commodity_grades(id),

  -- عشريّة. عمودٌ صحيحٌ هنا يعني أنّ ٧٫٥ طنٍّ تُدوَّر إلى ٨ أو ٧، وأيُّهما
  -- خطأٌ في فاتورةٍ ومنشأٍ ووزن. والرؤوسُ تُكتب أعداداً صحيحةً في عمودٍ عشري
  -- بلا ضرر؛ العكسُ لا يصحّ.
  quantity          numeric(16,4) not null,
  uom_code          text not null references export_uom(code),

  unit_price_minor  bigint not null,
  currency_code     text   not null default 'USD',
  -- محروسةٌ عند الكتابة لا محسوبةٌ عند العرض: شاشتان تحسبان القيمة تختلفان
  -- يوماً ما، والقاعدةُ لا تختلف مع نفسها.
  value_minor       bigint not null,

  status            text not null default 'draft',
  shipment_date     date,

  -- تجميدُ المتطلّبات: نسخةٌ مما كان سارياً لحظةَ الإرسال. تُملأ في
  -- export_offer_requirements، وهذا ختمُها الزمني.
  requirements_frozen_at timestamptz,

  submitted_at  timestamptz,
  reviewed_at   timestamptz,
  reviewed_by   uuid references profiles(id),
  -- الرفضُ بسببٍ مكتوب. القيدُ أدناه يمنع رفضاً صامتاً.
  rejection_reason text,

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  constraint export_offer_status_known
    check (status in ('draft','submitted','published','rejected','withdrawn')),
  constraint export_offer_quantity_positive check (quantity > 0),
  constraint export_offer_price_positive    check (unit_price_minor > 0),
  constraint export_offer_value_balances
    check (value_minor = round(quantity * unit_price_minor)),
  -- المنصّةُ لا تحمل البضاعة اليوم — وكالةٌ لا تملُّك. رفعُ هذا قرارُ مالكٍ لا سهوُ مبرمج.
  constraint export_offer_rejected_has_reason
    check (status <> 'rejected' or (rejection_reason is not null and length(btrim(rejection_reason)) >= 10)),
  -- منشورٌ لا يُعرف من نشره ليس مراجَعاً. وللقيد أثرٌ عمليٌّ على من يبني الزرّ:
  -- `reviewed_by` يُملأ من auth.uid()، فنشرٌ من فعلِ خادمٍ يستعمل عميلَ الإدارة
  -- (بلا جلسة) يُرفض هنا — لا لخللٍ بل لأن لا فاعلَ له. زرُّ «انشر» يستعمل
  -- عميلَ الجلسة. اكتشفته البوّابةُ لا المراجعة.
  constraint export_offer_published_was_reviewed
    check (status <> 'published' or (reviewed_at is not null and reviewed_by is not null)),
  -- المسحوبُ قد يُسحب قبل أن يُرسل أصلاً، فلا وقتَ إرسالٍ له. وقيدٌ يغفل ذلك
  -- يمنع المزارعَ من التراجع عن مسوّدةٍ لم يُرسلها — وهو أكثرُ ما سيفعله.
  constraint export_offer_submitted_has_time
    check (status in ('draft','withdrawn') or submitted_at is not null)
);

create index if not exists export_offers_owner_idx  on export_offers (owner_id);
create index if not exists export_offers_status_idx on export_offers (status);
-- طابورُ المراجعة يُقرأ بالأقدم أولاً، فلا يشيخ عرضٌ في آخر الصفّ.
create index if not exists export_offers_queue_idx
  on export_offers (submitted_at) where status = 'submitted';

-- المتطلّباتُ المجمَّدة: ما كان سارياً على هذا الممرّ لحظةَ الإرسال.
create table if not exists export_offer_requirements (
  id                    uuid primary key default gen_random_uuid(),
  offer_id              uuid not null references export_offers(id) on delete cascade,
  document_type_id      uuid not null references export_document_types(id),
  mode                  text not null,
  -- `on delete set null` وهو الفرقُ بين نسخةٍ مجمَّدة ومؤشّرٍ إلى الحيّ.
  --
  -- Without it the reference defaults to NO ACTION, and the frozen copy then
  -- *blocks* deletion of the very rule it copied: an administrator retiring an
  -- obsolete requirement is refused because a two-year-old offer points at it.
  -- Which turns freezing inside out — the copy was supposed to survive the
  -- rule's retirement, not prevent it.
  --
  -- Found by the gate, not by reading: the check that deletes a corridor rule
  -- and asserts the frozen rows survive failed on a foreign key.
  --
  -- The link is provenance, not data. Everything the frozen row needs —
  -- document type, mode, the moment it was frozen — it already holds.
  source_requirement_id uuid references export_corridor_requirements(id)
                          on delete set null,
  frozen_at             timestamptz not null default now(),
  unique (offer_id, document_type_id)
);

-- إحداثيّاتُ الإنتاج — لائحةُ منع إزالة الغابات الأوروبية.
-- نقطةٌ لما دون ٤ هكتارات ومضلَّعٌ لما فوقها، والقيدُ يفرضها هنا لأنّ
-- الاكتشافَ عند الحدود اكتشافٌ متأخّرٌ بشهرٍ وشحنة.
create table if not exists export_offer_origins (
  id            uuid primary key default gen_random_uuid(),
  offer_id      uuid not null references export_offers(id) on delete cascade,
  plot_ref      text not null,
  area_hectares numeric(12,4),
  latitude      numeric(9,6) not null,
  longitude     numeric(9,6) not null,
  boundary      jsonb,
  constraint export_origin_lat_range check (latitude between -90 and 90),
  constraint export_origin_lon_range check (longitude between -180 and 180),
  constraint export_origin_polygon_required_above_four_ha
    check (area_hectares is null or area_hectares < 4 or boundary is not null)
);

-- سلسلةُ العهدة: تُلحَق ولا تُعدَّل ولا تُحذف. وسلسلةُ عهدةٍ يمكن تعديلُها
-- ليست سلسلةَ عهدة. الحارسُ في الهجرة التالية لهذا الملفّ فعلاً، لا وعداً.
create table if not exists export_offer_custody (
  id          bigserial primary key,
  offer_id    uuid not null references export_offers(id) on delete cascade,
  sequence    integer not null,
  occurred_at timestamptz not null,
  place_name  text not null,
  latitude    numeric(9,6),
  longitude   numeric(9,6),
  note        text,
  created_at  timestamptz not null default now(),
  unique (offer_id, sequence),
  constraint export_custody_lat_range check (latitude is null or latitude between -90 and 90),
  constraint export_custody_lon_range check (longitude is null or longitude between -180 and 180)
);

-- الدليلُ يعبر مرجعاً وبصمة، لا ملفاً منسوخاً. مخزنُ الأدلّة خاصٌّ وسياستُه
-- تحصره في صاحبه أو الإدارة؛ والبصمةُ تكفي لما نحتاجه: أن يطلب مدقّقٌ الأصلَ
-- بعد سنتين ويتحقّق أنه لم يُبدَّل.
create table if not exists export_offer_evidence (
  id           uuid primary key default gen_random_uuid(),
  offer_id     uuid not null references export_offers(id) on delete cascade,
  kind         text not null,
  captured_at  timestamptz,
  latitude     numeric(9,6),
  longitude    numeric(9,6),
  storage_path text not null,
  sha256       text,
  created_at   timestamptz not null default now(),
  -- بصمةٌ مشوّهةٌ تعني أنّ أحداً لم يحسبها، وقبولُها يجعل الحقلَ زينة.
  constraint export_evidence_hash_shape
    check (sha256 is null or sha256 ~ '^[0-9a-f]{64}$')
);

-- سجلُّ الانتقالات: من، ومتى، ومن أي حالٍ إلى أي حال، ولماذا.
create table if not exists export_offer_events (
  id          bigserial primary key,
  offer_id    uuid not null references export_offers(id) on delete cascade,
  from_status text,
  to_status   text not null,
  actor_id    uuid references profiles(id),
  reason      text,
  occurred_at timestamptz not null default now()
);

create index if not exists export_offer_events_offer_idx
  on export_offer_events (offer_id, occurred_at desc);

-- ===========================================================================
-- ٣) الوحدة الافتراضية — تُملأ ولا تُفرض
-- ===========================================================================

-- عندما لا يذكر العرضُ وحدةً، تؤخذ وحدةُ السلعة. وحين يذكرها، تُحترم.
-- وهذا هو «الاختياريّ» الذي طلبه المالك: البيعُ بالرأس أو بالكيلو صفٌّ لا إصدار.
create or replace function public.export_offer_default_uom()
 returns trigger
 language plpgsql
 set search_path to 'public'
as $function$
begin
  if new.uom_code is null then
    select c.default_uom_code into new.uom_code
      from export_corridors cr
      join export_commodities c on c.id = cr.commodity_id
     where cr.id = new.corridor_id;
  end if;
  return new;
end $function$;

drop trigger if exists export_offer_default_uom_trg on export_offers;
create trigger export_offer_default_uom_trg
  before insert on export_offers
  for each row execute function public.export_offer_default_uom();

-- ===========================================================================
-- ٤) الدرجةُ تخصّ سلعتَها
-- ===========================================================================

-- «درجةٌ من سلعةٍ أخرى» خطأٌ لا يكشفه مفتاحٌ أجنبيّ وحده: كلا الجدولين موجود،
-- والصفُّ صحيحٌ في ذاته وخاطئٌ في موضعه.
create or replace function public.export_offer_grade_matches_commodity()
 returns trigger
 language plpgsql
 set search_path to 'public'
as $function$
declare
  ok boolean;
begin
  if new.grade_id is null then return new; end if;

  select exists (
    select 1
      from export_corridors cr
      join export_commodity_grades g on g.commodity_id = cr.commodity_id
     where cr.id = new.corridor_id and g.id = new.grade_id
  ) into ok;

  if not ok then
    raise exception 'الدرجة المختارة لا تخصّ سلعة هذا الممرّ';
  end if;
  return new;
end $function$;

drop trigger if exists export_offer_grade_matches_commodity_trg on export_offers;
create trigger export_offer_grade_matches_commodity_trg
  before insert or update of grade_id, corridor_id on export_offers
  for each row execute function public.export_offer_grade_matches_commodity();

-- ===========================================================================
-- ٥) آلةُ الحالات — الانتقالاتُ المسموحة صراحةً، وما عداها مرفوض
-- ===========================================================================

-- draft ⇄ submitted ⇄ (published | rejected) · و rejected يعود draft ليُصلَح.
-- والقائمةُ صريحةٌ لأنّ «ما ليس ممنوعاً مسموح» في آلة حالاتٍ يعني أنّ عرضاً
-- مرفوضاً يمكن أن يصير منشوراً بتحديثٍ واحد.
--
-- SECURITY DEFINER لسببٍ واحد: كتابةُ السجلّ.
--
-- The event row is written from inside this trigger, and RLS would apply to it
-- as the acting user. A farmer withdrawing a submitted offer is, at that
-- instant, editing a row whose status is still 'submitted' — which the owner
-- write policy does not cover, so the audit insert would be refused and the
-- withdrawal would fail. Widening that policy to let it through would mean a
-- farmer can write audit rows directly.
--
-- Neither is acceptable, and the second is worse: an audit row the actor can
-- write is an audit row the actor can forge, and one they can block is one they
-- can suppress. So the trigger writes it as the owner of this function, and
-- `export_offer_events` grants no write policy to anyone at all.
create or replace function public.export_offer_transition()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  allowed boolean;
begin
  if new.status = old.status then
    new.updated_at := now();
    return new;
  end if;

  allowed := (old.status, new.status) in (
    ('draft','submitted'),
    ('draft','withdrawn'),
    ('submitted','published'),
    ('submitted','rejected'),
    ('submitted','draft'),      -- سحبُ المزارع عرضَه قبل أن يُراجَع
    ('rejected','draft'),       -- ليُصلح ما ذُكر في السبب ثم يُرسل ثانية
    ('published','withdrawn')
  );

  if not allowed then
    raise exception 'انتقالٌ غير مسموح: % ← %', old.status, new.status;
  end if;

  new.updated_at := now();

  -- الطابعُ الزمني يُكتب هنا لا في الشاشة: شاشةٌ تنسى ختمَ الوقت تُنتج صفّاً
  -- يبدو مراجَعاً ولا يُعرف متى.
  if new.status = 'submitted' then
    new.submitted_at := coalesce(new.submitted_at, now());
  elsif new.status in ('published','rejected') then
    new.reviewed_at := coalesce(new.reviewed_at, now());
    new.reviewed_by := coalesce(new.reviewed_by, auth.uid());
  elsif new.status = 'draft' then
    -- عودةٌ للإصلاح: يُمسح أثرُ المراجعة السابقة كي لا يبدو العرضُ الجديد
    -- مراجَعاً بمراجعةٍ تخصّ نسخةً أخرى منه.
    new.reviewed_at := null;
    new.reviewed_by := null;
    new.rejection_reason := null;
  end if;

  insert into export_offer_events (offer_id, from_status, to_status, actor_id, reason)
  values (new.id, old.status, new.status, auth.uid(), new.rejection_reason);

  return new;
end $function$;

drop trigger if exists export_offer_transition_trg on export_offers;
create trigger export_offer_transition_trg
  before update on export_offers
  for each row execute function public.export_offer_transition();

-- ===========================================================================
-- ٦) الصلاحيات — وهي الحدُّ الحقيقي، لا ما في الشاشة
-- ===========================================================================

alter table export_uom                    enable row level security;
alter table export_commodities            enable row level security;
alter table export_commodity_grades       enable row level security;
alter table export_destinations           enable row level security;
alter table export_corridors              enable row level security;
alter table export_document_types         enable row level security;
alter table export_corridor_requirements  enable row level security;
alter table export_offers                 enable row level security;
alter table export_offer_requirements     enable row level security;
alter table export_offer_origins          enable row level security;
alter table export_offer_custody          enable row level security;
alter table export_offer_evidence         enable row level security;
alter table export_offer_events           enable row level security;

-- المرجعياتُ تُقرأ للعموم: ما تطلبه أوروبا ليس سرّاً، ومزارعٌ لا يرى الشروط
-- لا يستطيع استيفاءها. والكتابةُ للإدارة وحدها.
do $$
declare t text;
begin
  foreach t in array array[
    'export_uom','export_commodities','export_commodity_grades',
    'export_destinations','export_corridors','export_document_types',
    'export_corridor_requirements'
  ] loop
    execute format('drop policy if exists %I on %I', t || '_read', t);
    execute format(
      'create policy %I on %I for select using (true)', t || '_read', t);
    execute format('drop policy if exists %I on %I', t || '_admin', t);
    execute format(
      'create policy %I on %I for all using (is_admin()) with check (is_admin())',
      t || '_admin', t);
  end loop;
end $$;

-- العرض: صاحبُه يراه دائماً، والإدارةُ ترى كلَّ شيء، والعموم يرى المنشورَ فقط.
--
-- والمنشورُ يحمل owner_id — وهو معرّفٌ لا اسم. وحلُّه إلى اسمٍ يمرّ بـ
-- public_farmer_profile، وهي تفحص publish_record. فالنشرُ هنا لا يلتفّ على
-- إذن المزارع في ملفّه الشخصي.
drop policy if exists export_offers_owner_read on export_offers;
create policy export_offers_owner_read on export_offers
  for select using (owner_id = auth.uid());
drop policy if exists export_offers_public_read on export_offers;
create policy export_offers_public_read on export_offers
  for select using (status = 'published');
drop policy if exists export_offers_admin_read on export_offers;
create policy export_offers_admin_read on export_offers
  for select using (is_admin());

-- المزارعُ ينشئ لنفسه فقط، ويُعدّل ما لم يُراجَع بعد.
drop policy if exists export_offers_owner_insert on export_offers;
create policy export_offers_owner_insert on export_offers
  for insert with check (owner_id = auth.uid() and status = 'draft');
drop policy if exists export_offers_owner_update on export_offers;
create policy export_offers_owner_update on export_offers
  for update
  using (owner_id = auth.uid() and status in ('draft','submitted','rejected'))
  with check (owner_id = auth.uid() and status in ('draft','submitted','withdrawn'));

-- والنشرُ والرفضُ للإدارة وحدها. هذا هو الزرُّ الثاني، وهو في القاعدة لا في الشاشة.
drop policy if exists export_offers_admin_write on export_offers;
create policy export_offers_admin_write on export_offers
  for update using (is_admin()) with check (is_admin());

-- الجداولُ التابعة تتبع عرضَها: من يرى العرضَ يرى تفاصيلَه.
do $$
declare t text;
begin
  foreach t in array array[
    'export_offer_requirements','export_offer_origins',
    'export_offer_custody','export_offer_evidence','export_offer_events'
  ] loop
    execute format('drop policy if exists %I on %I', t || '_read', t);
    execute format($p$
      create policy %I on %I for select using (
        exists (select 1 from export_offers o
                 where o.id = %I.offer_id
                   and (o.owner_id = auth.uid() or o.status = 'published' or is_admin())))
    $p$, t || '_read', t, t);
  end loop;

  -- والكتابةُ لصاحب العرض ما دام يملك تعديلَه، أو للإدارة.
  --
  -- و`export_offer_events` ليست في هذه القائمة عمداً: **لا سياسةَ كتابةٍ لها
  -- لأحد**. يكتبها المُشغّلُ وحدَه من داخل دالّة الانتقال، وسجلٌّ يستطيع
  -- الفاعلُ الكتابةَ فيه سجلٌّ يستطيع تزويرَه.
  foreach t in array array[
    'export_offer_requirements','export_offer_origins',
    'export_offer_custody','export_offer_evidence'
  ] loop
    execute format('drop policy if exists %I on %I', t || '_write', t);
    execute format($p$
      create policy %I on %I for all using (
        exists (select 1 from export_offers o
                 where o.id = %I.offer_id
                   and ((o.owner_id = auth.uid() and o.status in ('draft','rejected'))
                        or is_admin())))
      with check (
        exists (select 1 from export_offers o
                 where o.id = %I.offer_id
                   and ((o.owner_id = auth.uid() and o.status in ('draft','rejected'))
                        or is_admin())))
    $p$, t || '_write', t, t, t);
  end loop;
end $$;

-- ===========================================================================
-- سلسلةُ العهدة تُلحَق ولا تُعدَّل — حارساً لا وعداً
-- ===========================================================================

-- The write policy above lets the owner insert custody rows while the offer is
-- a draft. Nothing in it stops them editing or deleting one afterwards, and a
-- custody chain that can be edited is not a custody chain — it is a claim about
-- the past that its author can revise. A rule refuses both outright, so this
-- holds against PostgREST callers and future code alike, not only against the
-- screen that exists today.
create or replace rule export_custody_no_update as
  on update to export_offer_custody do instead nothing;
create or replace rule export_custody_no_delete as
  on delete to export_offer_custody do instead nothing;

-- ===========================================================================
-- ٧) بذرةُ المرجعيات — ما تقوله الدراسةُ المنشورة، لا أرقامٌ مخترعة
-- ===========================================================================

insert into export_uom (code, name_ar, kind, to_base) values
  ('kg',   'كيلوغرام', 'mass',  1),
  ('ton',  'طن',       'mass',  1000),
  ('head', 'رأس',      'count', 1),
  ('sack', 'جوال',     'count', 1)
on conflict (code) do nothing;

insert into export_destinations (code, name_ar) values
  ('EU', 'الاتحاد الأوروبي'),
  ('SA', 'السعودية'),
  ('AE', 'الإمارات'),
  ('CN', 'الصين'),
  ('TR', 'تركيا')
on conflict (code) do nothing;

insert into export_commodities (code, name_ar, hs_code, default_uom_code) values
  ('gum_arabic', 'الصمغ العربي', '130120', 'ton'),
  ('live_sheep', 'الضأن الحيّ',  '010410', 'head'),
  ('sesame',     'السمسم',       '120740', 'ton'),
  ('sorghum',    'الذرة الرفيعة','100790', 'ton'),
  ('hibiscus',   'الكركديه',     '121190', 'ton'),
  ('groundnut',  'الفول السوداني','120242','ton')
on conflict (code) do nothing;

insert into export_document_types (code, name_ar, note_ar) values
  ('phytosanitary', 'شهادة الحجر النباتي', 'للحبوب والبذور'),
  ('veterinary',    'شهادة بيطرية',        'للحيوان الحيّ واللحوم'),
  ('origin_rex',    'إقرار المنشأ (المصدِّر المسجَّل)',
     'حلّ محلّ شهادة المنشأ الحكومية في الاتحاد الأوروبي'),
  ('eudr_dds',      'بيان العناية الواجبة — لائحة الغابات',
     'يشمل صغار المشترين اعتباراً من 30 يونيو 2027'),
  ('saber_coc',     'شهادة مطابقة (سابر)',
     'إلزامية لكلّ وارد إلى السعودية منذ 2018، ويستخرجها المستورد'),
  ('lab_report',    'تقرير مختبر',        'الأفلاتوكسين والسالمونيلا'),
  ('packing_list',  'قائمة تعبئة',        null),
  ('invoice',       'فاتورة تجارية',      null)
on conflict (code) do nothing;

-- الممرّاتُ التي تتحدّث عنها الدراسة. وغيرُها يُضاف من اللوحة حين يُدرس.
insert into export_corridors (commodity_id, destination_id)
select c.id, d.id
from (values
  ('gum_arabic','EU'), ('gum_arabic','TR'),
  ('sesame','EU'), ('sesame','CN'), ('sesame','TR'),
  ('live_sheep','SA'),
  ('sorghum','SA'),
  ('hibiscus','EU'),
  ('groundnut','EU')
) as v(comm, dest)
join export_commodities  c on c.code = v.comm
join export_destinations d on d.code = v.dest
on conflict (commodity_id, destination_id) do nothing;
