-- إشعاراتُ الحجز الجماعيّ للجرّار (بقيّة البند ١٦٨).
--
-- الحجز يمرّ بثلاث لحظاتٍ يعني كلٌّ منها شخصاً لم يفعل شيئاً فيها، فلا يعرف بها إلا إن أُخبر:
--   - ينضمّ عضو: يعرف المنظّم، ليرسل الحجز حين يبلغ المجموع حدّه الأدنى؛
--   - يرسل المنظّم الحجز: يعرف مقدّم الخدمة أنّ قراراً ينتظره؛
--   - يقبل مقدّم الخدمة أو يعتذر: يعرف كلّ عضوٍ باقٍ، ومع الاعتذار سببه.
-- بمشغّلين على الجدولين، فتبقى دوالّ الحجز كما هي، ويُخبَر بكلّ لحظةٍ مهما كان الطريق إليها.

-- ── نوع الإشعار ─────────────────────────────────────────────────────────────

do $$
declare v_def text;
begin
  select pg_get_constraintdef(oid) into v_def
    from pg_constraint
   where conname = 'notifications_kind_check' and conrelid = 'public.notifications'::regclass;
  -- The production check lists every kind; one written another way (the gates' base schema) is left alone.
  if v_def like '%ARRAY[%' and v_def not like '%machinery_booking%' then
    execute 'alter table public.notifications drop constraint notifications_kind_check';
    execute 'alter table public.notifications add constraint notifications_kind_check '
         || regexp_replace(v_def, '\]\)\)\)\s*$', ', ''machinery_booking''::text])))');
    select pg_get_constraintdef(oid) into v_def
      from pg_constraint
     where conname = 'notifications_kind_check' and conrelid = 'public.notifications'::regclass;
    if v_def not like '%machinery_booking%' then
      raise exception 'لم يُضَف نوع الإشعار machinery_booking';
    end if;
  end if;
end $$;

-- ── الإرسال، والقرار ────────────────────────────────────────────────────────

create function public.machinery_booking_notify()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_where text := new.service_title || ' في ' || new.locality;
  v_owner uuid;
  r record;
begin
  if old.status = 'open' and new.status = 'requested' then
    select owner_id into v_owner from public.service_providers where id = new.provider_id;
    if v_owner is not null then
      perform public.notify_user(
        v_owner, 'machinery_booking', 'حجزٌ جماعيّ ينتظر قرارك: ' || v_where,
        'بلغ الحجز حدّه الأدنى وأرسله المنظّم. اقبله كلّه أو اعتذر عنه كلّه، من صفحة الحجوزات.',
        '/services/machinery');
    end if;
  elsif old.status = 'requested' and new.status in ('accepted', 'declined') then
    for r in
      select distinct m.member_id from public.machinery_booking_members m
       where m.booking_id = new.id and m.left_at is null
    loop
      perform public.notify_user(
        r.member_id, 'machinery_booking',
        case new.status when 'accepted' then 'قُبل حجزك الجماعيّ: ' else 'اعتذر مقدّم الخدمة عن حجزك: ' end || v_where,
        case new.status
          when 'accepted' then 'صار عقدك مع مقدّم الخدمة سارياً، والموعد بين ' || new.window_from || ' و' || new.window_to || '.'
          else 'السبب: ' || coalesce(new.decline_reason, '') || '. أُلغي عقدك معه، ولا شيء عليك.'
        end,
        '/services/machinery');
    end loop;
  end if;
  return null;
end $$;

create trigger machinery_booking_notify
  after update of status on public.machinery_bookings
  for each row execute function public.machinery_booking_notify();

-- ── الانضمام ────────────────────────────────────────────────────────────────

create function public.machinery_member_notify()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare b public.machinery_bookings;
begin
  select * into b from public.machinery_bookings where id = new.booking_id;
  if found and new.member_id <> b.organiser_id then
    perform public.notify_user(
      b.organiser_id, 'machinery_booking', 'انضمّ عضوٌ إلى حجزك: ' || b.service_title || ' في ' || b.locality,
      'انضمّ ' || new.display_name || ' بـ' || new.quantity || '. أرسل الحجز حين يبلغ المجموع حدّه الأدنى.',
      '/services/machinery');
  end if;
  return null;
end $$;

create trigger machinery_member_notify
  after insert on public.machinery_booking_members
  for each row execute function public.machinery_member_notify();

revoke execute on function public.machinery_booking_notify(), public.machinery_member_notify()
  from public, anon, authenticated, service_role;
