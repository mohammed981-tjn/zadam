-- ═══════════════════════════════════════════════════════════════════════════
-- تنبيهُ سعرٍ تحدّده بنفسك (البند ١٦٦)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- «فولٌ في الأبيض فوق كذا» أو «الدولار الموازي تحت كذا»: المستخدم يضع حدّاً، ويصله
-- إشعارٌ (وعلى شاشة هاتفه إن فعّل تنبيهات الهاتف) حين يتجاوزه آخر سعرٍ منشور.
-- التنبيه يُطلَق مرّةً واحدة ثم يُغلق، فلا تتكرّر الرسالة كلّ يوم والسعر فوق الحدّ.
--
-- ما يخصّ هذا الجدول:
--   - صاحب التنبيه يقرؤه، ولا يكتب فيه مباشرةً: يضيف بـ`price_alert_create` ويوقف بـ
--     `price_alert_stop`. السقف عشرة تنبيهاتٍ شغّالة لكلّ مستخدم (سياستي، لا قياس).
--   - الإطلاق دالّة لمفتاح الخدمة وحده (`price_alert_fire`): تغلق التنبيه وتكتب الإشعار في
--     معاملةٍ واحدة، فلا إشعار بلا إغلاق ولا إغلاق بلا إشعار، ولا يُطلَق تنبيهٌ مغلق.
--   - لا يُحذف تنبيه: الموقوف يُعلَّم `stopped` ويبقى.
--
-- لا شيءَ قائمٌ يُمسّ إلّا قيدُ أنواع الإشعارات: يُعاد بكلّ أنواعه السابقة ويُضاف `price_alert`.

create table public.price_alerts (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  subject     text not null check (subject in ('crop', 'fx_bank', 'fx_parallel')),
  market      text check (market ~ '^[a-z_]{2,20}$'),
  crop        text check (crop ~ '^[a-z_]{2,30}$'),
  unit        text check (unit in ('qintar', 'ardeb', 'sack', 'ton')),
  direction   text not null check (direction in ('above', 'below')),
  threshold   numeric not null check (threshold > 0 and threshold <= 100000000000),
  status      text not null default 'active' check (status in ('active', 'fired', 'stopped')),
  created_at  timestamptz not null default now(),
  settled_at  timestamptz,
  fired_value numeric,
  fired_market_date date,
  -- A crop alert names its market, crop and unit; a currency alert names none of them.
  constraint price_alerts_subject_shape check (
    (subject = 'crop' and market is not null and crop is not null and unit is not null)
    or (subject <> 'crop' and market is null and crop is null and unit is null)
  ),
  -- Settled means it has a day; active means it has none.
  constraint price_alerts_settled_shape check ((status = 'active') = (settled_at is null))
);

create index price_alerts_user_idx on public.price_alerts (user_id, created_at desc);
create index price_alerts_active_idx on public.price_alerts (subject, market, crop) where status = 'active';

alter table public.price_alerts enable row level security;
revoke all on table public.price_alerts from anon, authenticated;

create policy price_alerts_own_read on public.price_alerts
  for select to authenticated using (user_id = (select auth.uid()));

grant select on public.price_alerts to authenticated;

comment on table public.price_alerts is
  'تنبيهات الأسعار التي يضعها المستخدم: حدٌّ فوقه أو تحته. يُطلَق مرّةً ثم يُغلق. لا يُحذف تنبيه.';

-- ── الإضافة ─────────────────────────────────────────────────────────────────

create function public.price_alert_create(
  p_subject   text,
  p_market    text,
  p_crop      text,
  p_unit      text,
  p_direction text,
  p_threshold numeric
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  running integer;
  new_id uuid;
begin
  if uid is null then
    raise exception 'سجّل الدخول أولاً';
  end if;
  if p_threshold is null or p_threshold <= 0 then
    raise exception 'اكتب سعراً أكبر من صفر';
  end if;

  -- Two taps at the ceiling at once must not both pass.
  perform pg_advisory_xact_lock(hashtext('price_alert:' || uid::text));
  select count(*) into running from public.price_alerts where user_id = uid and status = 'active';
  if running >= 10 then
    raise exception 'عندك عشرة تنبيهاتٍ شغّالة. أوقف واحداً ثم أضِف';
  end if;

  insert into public.price_alerts (user_id, subject, market, crop, unit, direction, threshold)
  values (uid, p_subject, p_market, p_crop, p_unit, p_direction, p_threshold)
  returning id into new_id;
  return new_id;
end $$;

-- ── الإيقاف ─────────────────────────────────────────────────────────────────

create function public.price_alert_stop(p_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'سجّل الدخول أولاً';
  end if;
  update public.price_alerts
     set status = 'stopped', settled_at = now()
   where id = p_id and user_id = auth.uid() and status = 'active';
  return found;
end $$;

-- ── الإطلاق: لمفتاح الخدمة وحده ─────────────────────────────────────────────

create function public.price_alert_fire(
  p_id          uuid,
  p_value       numeric,
  p_market_date date,
  p_title       text,
  p_body        text,
  p_link        text
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  owner uuid;
begin
  if length(btrim(coalesce(p_title, ''))) = 0 then
    raise exception 'التنبيه بلا عنوان';
  end if;
  update public.price_alerts
     set status = 'fired', settled_at = now(), fired_value = p_value, fired_market_date = p_market_date
   where id = p_id and status = 'active'
  returning user_id into owner;
  if owner is null then
    return false;
  end if;
  insert into public.notifications (recipient_id, kind, title, body, link)
  values (owner, 'price_alert', p_title, p_body, p_link);
  return true;
end $$;

revoke execute on function public.price_alert_create(text, text, text, text, text, numeric) from public, anon;
revoke execute on function public.price_alert_stop(uuid) from public, anon;
revoke execute on function public.price_alert_fire(uuid, numeric, date, text, text, text) from public, anon, authenticated;
grant execute on function public.price_alert_create(text, text, text, text, text, numeric) to authenticated;
grant execute on function public.price_alert_stop(uuid) to authenticated;
grant execute on function public.price_alert_fire(uuid, numeric, date, text, text, text) to service_role;

-- ── الإشعارات: نوعٌ جديد ────────────────────────────────────────────────────

alter table public.notifications drop constraint notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check
  check (kind = any (array[
    'land_submitted','land_verified','land_rejected',
    'opportunity_submitted','opportunity_approved','opportunity_rejected',
    'lead_received','feedback_received','feedback_replied',
    'nafir_joined','faza_pledged','shura_answered',
    'judiyya_update','canal_update',
    'locust_near','animal_disease',
    'stage_due',
    'investor_interest','investor_decision',
    'agreement_update','agreement_signed',
    'inspection_update','inspection_report',
    'message',
    'price_alert'
  ]));
