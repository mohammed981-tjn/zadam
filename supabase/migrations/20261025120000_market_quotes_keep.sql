-- ما يُقرأ من الأسعار يُحفظ ولا يمحوه إلا المدير (البند ١٩٦).
--
-- المالك، 25 أكتوبر 2026: «يحفظ ولا يمحي إلا من الإدارة». الأسعار التي تقرؤها المنصّة (والتي يقرؤها المساعد في دورياته)
-- تدخل `market_quotes` فتبقى فيه: المنشور والمحجوز والمرفوض سواء. فلا حذفَ من الجدول لأحد، ولا مفتاحُ الخدمة نفسُه؛
-- والمحو الوحيد دالّةٌ للمدير تكتب لقطةً بالصفّ ومن محاه ولماذا في جدولٍ لا يُحذف منه هو الآخر.
--
-- ثمّ دالّة اعتماد واحدة: «اعتمد كلّ ما قُرئ بيقين» تنشر المحجوزات التي حجزها النظام لأنّه لا ينشر بنفسه (لا تلك التي
-- حُجزت لشذوذها أو لأنّها نصٌّ حرّ)، فيكون الاعتماد اليوميّ نقرةً واحدة.

-- ── سجلّ المحو ──────────────────────────────────────────────────────────────

create table public.market_quote_erasures (
  id        uuid primary key default gen_random_uuid(),
  quote     jsonb not null,
  erased_by uuid references auth.users(id) on delete set null,
  erased_at timestamptz not null default now(),
  reason    text not null check (length(reason) between 3 and 300)
);

alter table public.market_quote_erasures enable row level security;
revoke all on table public.market_quote_erasures from anon, authenticated, service_role;
grant select on public.market_quote_erasures to authenticated;
create policy market_quote_erasures_admin_read on public.market_quote_erasures
  for select to authenticated using (is_admin());

create function public.market_quotes_keep()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'TRUNCATE' then
    raise exception 'الأسعار المحفوظة لا تُفرَّغ';
  end if;
  if tg_table_name = 'market_quote_erasures' then
    raise exception 'سجلّ المحو لا يتغيّر';
  end if;
  -- The only way in is market_quote_erase, which sets this for its own transaction.
  if coalesce(current_setting('app.erase_quote', true), '') <> 'on' then
    raise exception 'ما يُقرأ من الأسعار يُحفظ ولا يمحوه إلا المدير';
  end if;
  return old;
end $$;

create trigger market_quotes_keep
  before delete on public.market_quotes
  for each row execute function public.market_quotes_keep();
create trigger market_quotes_no_truncate
  before truncate on public.market_quotes
  for each statement execute function public.market_quotes_keep();
create trigger market_quote_erasures_keep
  before update or delete on public.market_quote_erasures
  for each row execute function public.market_quotes_keep();
create trigger market_quote_erasures_no_truncate
  before truncate on public.market_quote_erasures
  for each statement execute function public.market_quotes_keep();

-- Nobody holds the privilege either; the trigger is the second lock, not the only one.
revoke delete, truncate on public.market_quotes from anon, authenticated, service_role;

-- ── مفتاح الخدمة يكتب محجوزاً، ولا يعدّل محفوظاً (البند ١٩٨ ج٧) ────────────
--
-- كان «النظام لا ينشر بنفسه» و«لا يُعدَّل المحفوظ» في شيفرة TypeScript وحدها: مفتاح الخدمة يملك INSERT وUPDATE على
-- الجدول، فينشر رقماً أو يغيّر رقماً منشوراً بلا لقطة. الآن القاعدة تقول ذلك: ما يكتبه مفتاح الخدمة يدخل محجوزاً
-- بلا مراجِع، ولا يغيّر صفّاً إلا ليُخرج محجوزاً من النقرة الواحدة (حين تختلف المصادر في يومه) — لا العكس، ولا شيئاً
-- غير السبب. والمدير يقرّر بدوالّه (التي تعمل بصاحب الجدول) كما كان.
create function public.market_quotes_service_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_user <> 'service_role' then
    return new;
  end if;
  if tg_op = 'INSERT' then
    if new.status <> 'held' or new.reviewed_by is not null or new.reviewed_at is not null then
      raise exception 'مفتاح الخدمة يكتب الرقم محجوزاً وحده؛ النشر للإدارة';
    end if;
    return new;
  end if;
  if old.status = 'held' and new.status = 'held'
     and old.reason = 'قراءة موثوقة تنتظر اعتماد الإدارة'
     and new.reason is not null and new.reason <> 'قراءة موثوقة تنتظر اعتماد الإدارة'
     and (to_jsonb(new) - 'reason') = (to_jsonb(old) - 'reason') then
    return new;
  end if;
  raise exception 'مفتاح الخدمة لا يعدّل رقماً محفوظاً (إلا إخراج المحجوز من النقرة الواحدة)';
end $$;

create trigger market_quotes_service_guard
  before insert or update on public.market_quotes
  for each row execute function public.market_quotes_service_guard();
revoke execute on function public.market_quotes_service_guard() from public, anon, authenticated, service_role;

-- ── المحو: للمدير وحده، بسببٍ، ولقطةٍ محفوظة ───────────────────────────────

create function public.market_quote_erase(p_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  q public.market_quotes;
begin
  if not is_admin() then raise exception 'للإدارة وحدها.'; end if;
  if length(btrim(coalesce(p_reason, ''))) not between 3 and 300 then
    raise exception 'اكتب سبب المحو (٣ أحرفٍ فأكثر).';
  end if;
  select * into q from public.market_quotes where id = p_id for update;
  if not found then raise exception 'لا رقمَ بهذا المعرّف.'; end if;
  insert into public.market_quote_erasures (quote, erased_by, reason) values (to_jsonb(q), auth.uid(), btrim(p_reason));
  perform set_config('app.erase_quote', 'on', true);
  delete from public.market_quotes where id = p_id;
  perform set_config('app.erase_quote', 'off', true);
end $$;

-- ── الاعتماد بنقرة: ما حجزه النظام لأنّه لا ينشر وحده، ممّا رآه المدير ────────
--
-- النقرة تأتي بأرقام ما عُرض على المدير في صفحته (البند ١٩٨ ج١٢)، فلا تعتمد رقماً قرأه الفحص بعد أن فتح الصفحة، ولا
-- رقماً فاته العرض؛ وما تغيّر منها منذ العرض (رُوجع أو حُجز لسببٍ آخر) لا يُعتمد.

create function public.market_quote_review_all(p_ids uuid[])
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  n integer;
begin
  if not is_admin() then raise exception 'للإدارة وحدها.'; end if;
  if p_ids is null or cardinality(p_ids) = 0 then
    raise exception 'لا شيء ينتظر الاعتماد.';
  end if;
  update public.market_quotes
     set status = 'published', reviewed_by = auth.uid(), reviewed_at = now()
   where id = any (p_ids) and status = 'held' and reason = 'قراءة موثوقة تنتظر اعتماد الإدارة';
  get diagnostics n = row_count;
  return n;
end $$;

-- ── الصلاحيّات ──────────────────────────────────────────────────────────────

revoke execute on function public.market_quotes_keep() from public, anon, authenticated, service_role;
revoke execute on function public.market_quote_erase(uuid, text), public.market_quote_review_all(uuid[]) from public, anon, service_role;
grant execute on function public.market_quote_erase(uuid, text), public.market_quote_review_all(uuid[]) to authenticated;
