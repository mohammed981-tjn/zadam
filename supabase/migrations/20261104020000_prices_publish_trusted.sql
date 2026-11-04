-- الأسعار الموثوقة تُنشر بلا انتظار، وتوقّف المصادر يُنبَّه عليه (فحص 3 نوفمبر 2026، ops-6 وdata-quality-7؛ المالك،
-- 4 نوفمبر، السؤال 16: «الأسعار تُنشر بلا اعتمادي»).
--
-- منذ 25 أكتوبر كان كلُّ رقمٍ يقرؤه الفحص اليوميّ يُحجز حتى ينقر المدير، والموثوقُ منها («قراءة موثوقة تنتظر اعتماد
-- الإدارة»: من قارئٍ يقرأ بيقين، وضمن حركة يومٍ من آخر رقمٍ منشور، ولم يختلف عليه مصدرٌ آخر) ينتظر نقرةً لا تقرّر
-- شيئاً. المالك الآن: يُنشر وحده. وما سواه يبقى محجوزاً لقراره كما كان: ما شذّ، وما اختلفت فيه المصادر، ونصّ القضارف الحرّ.
--
-- ومفتاح الخدمة يبقى لا ينشر بنفسه (market_quotes_service_guard): ينشر هذه الدالّةُ، وهي لا تنشر إلا ما قرأه هذا
-- الفحص للتوّ (بمعرّفاته، وفي الساعة الأخيرة) وسببُه «قراءة موثوقة»، وتكتب في السبب أنّه نُشر آليّاً.
--
-- والفحص اليوميّ كتب «سليم» 115 مرّة والأسعار متوقّفة: price_feeds_alert ينبّه المدير داخل المنصّة مرّةً في اليوم حين
-- تتوقّف خلاصةٌ أو يبقى رقمٌ محجوزاً أكثر من يومين.

-- ── نوع الإشعار ──────────────────────────────────────────────────────────────
do $$
declare
  v_def text;
begin
  select pg_get_constraintdef(oid) into v_def
    from pg_constraint
   where conname = 'notifications_kind_check' and conrelid = 'public.notifications'::regclass;
  -- The production check lists every kind; one written another way (the gates' base schema) is left alone.
  if v_def like '%ARRAY[%' and v_def not like '%system_alert%' then
    execute 'alter table public.notifications drop constraint notifications_kind_check';
    execute 'alter table public.notifications add constraint notifications_kind_check '
         || regexp_replace(v_def, '\]\)\)\)\s*$', ', ''system_alert''::text])))');
    select pg_get_constraintdef(oid) into v_def
      from pg_constraint
     where conname = 'notifications_kind_check' and conrelid = 'public.notifications'::regclass;
    if v_def not like '%system_alert%' then
      raise exception 'لم يُضَف نوع الإشعار system_alert';
    end if;
  end if;
end $$;

-- ── النشر الآليّ للموثوق ─────────────────────────────────────────────────────
create function public.market_quotes_publish_trusted(p_ids uuid[])
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  n integer;
begin
  if p_ids is null or cardinality(p_ids) = 0 then
    return 0;
  end if;
  update public.market_quotes
     set status = 'published',
         reviewed_at = now(),
         reason = 'نُشر آليّاً: قراءة موثوقة ضمن حركة اليوم (المالك، 4 نوفمبر 2026)'
   where id = any (p_ids)
     and status = 'held'
     and reason = 'قراءة موثوقة تنتظر اعتماد الإدارة'
     and method = 'auto'
     and created_at > now() - interval '1 hour';
  get diagnostics n = row_count;
  return n;
end $$;

comment on function public.market_quotes_publish_trusted(uuid[]) is
  'ينشر ما قرأه الفحص اليوميّ للتوّ بيقين وضمن حركة اليوم. للخادم وحده؛ ما سواه يبقى محجوزاً لقرار المدير.';

-- ── التنبيه على التوقّف ──────────────────────────────────────────────────────
create function public.price_feeds_alert(p_lines text[])
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  lines text[] := coalesce(p_lines, '{}');
  held_old integer;
  body text;
begin
  select count(*) into held_old
    from public.market_quotes
   where status = 'held' and created_at < now() - interval '2 days';
  if cardinality(lines) = 0 and held_old = 0 then
    return 0;
  end if;
  -- Once a day is enough: the run is daily, and a second run (the «حدّث الآن» button) should not repeat it.
  if exists (select 1 from public.notifications
              where kind = 'system_alert' and link = '/admin/prices' and created_at > now() - interval '20 hours') then
    return 0;
  end if;
  body := array_to_string(lines[1:6], ' · ');
  if held_old > 0 then
    body := concat_ws(' · ', nullif(body, ''), held_old || ' رقماً محجوزاً منذ أكثر من يومين ينتظر قرارك');
  end if;
  return public.notify_admins('system_alert', 'الأسعار تحتاج نظرك', left(body, 500), '/admin/prices');
end $$;

comment on function public.price_feeds_alert(text[]) is
  'ينبّه المدير داخل المنصّة، مرّةً في اليوم، حين تتوقّف خلاصة أسعار أو يبقى رقمٌ محجوزاً أكثر من يومين. للخادم وحده.';

-- ── الصلاحيّات: للخادم وحده ──────────────────────────────────────────────────
revoke all on function public.market_quotes_publish_trusted(uuid[]) from public, anon, authenticated;
revoke all on function public.price_feeds_alert(text[]) from public, anon, authenticated;
grant execute on function public.market_quotes_publish_trusted(uuid[]) to service_role;
grant execute on function public.price_feeds_alert(text[]) to service_role;
