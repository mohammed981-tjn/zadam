-- ═══════════════════════════════════════════════════════════════════════════
-- «حان موعد المرحلة»: تذكير الموسم والقطيع (البند ١١٩)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- نوعُ إشعارٍ جديد `stage_due`، تكتبه المهمّة اليوميّة بدالّة field_alert_send
-- نفسها: المفتاح والإشعار معاً أو لا شيء، فلا يتكرّر تذكيرٌ لمرحلةٍ واحدة.
-- القيدُ يحمل الأنواع السبعة عشر كلّها، ومن يضيف نوعاً بعده يحملها كلّها.

alter table public.notifications drop constraint notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check
  check (kind = any (array[
    'land_submitted','land_verified','land_rejected',
    'opportunity_submitted','opportunity_approved','opportunity_rejected',
    'lead_received','feedback_received','feedback_replied',
    'nafir_joined','faza_pledged','shura_answered',
    'judiyya_update','canal_update',
    'locust_near','animal_disease',
    'stage_due'
  ]));

create or replace function public.field_alert_send(
  p_recipient uuid,
  p_keys      text[],
  p_kind      text,
  p_title     text,
  p_body      text,
  p_link      text
) returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  fresh integer;
begin
  if p_kind not in ('locust_near', 'animal_disease', 'stage_due') then
    raise exception 'نوعُ تنبيهٍ غير معروف: %', p_kind;
  end if;
  if p_recipient is null or coalesce(array_length(p_keys, 1), 0) = 0 then
    return false;
  end if;
  if length(btrim(coalesce(p_title, ''))) = 0 then
    raise exception 'التنبيه بلا عنوان';
  end if;

  with ins as (
    insert into public.field_alerts_sent (recipient_id, alert_key)
    select distinct p_recipient, k from unnest(p_keys) as k
    on conflict do nothing
    returning 1
  )
  select count(*) into fresh from ins;

  if fresh = 0 then
    return false;
  end if;

  insert into public.notifications (recipient_id, kind, title, body, link)
  values (p_recipient, p_kind, p_title, p_body, p_link);
  return true;
end $$;

revoke execute on function public.field_alert_send(uuid, text[], text, text, text, text) from public, anon, authenticated;
grant execute on function public.field_alert_send(uuid, text[], text, text, text, text) to service_role;
