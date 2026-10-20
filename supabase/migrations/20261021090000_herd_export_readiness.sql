-- ═══════════════════════════════════════════════════════════════════════════
-- جاهزيّة الماشية للتصدير: سجلّ الصحّة وأرقام الآذان (البند ١١٧)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- الماشية الحيّة أكبر صادرٍ بعد الذهب، وأكثرُ ما يضيع منها يضيع قبل الشحن:
-- رأسٌ بلا تطعيمٍ مسجَّل، أو بلا رقمٍ يُعرف به، فيُرفض في المحجر. هذا سجلٌّ
-- يحفظه المربّي لقطيعه — تطعيماته وفحوصه وأرقام آذان رؤوسه — ويطبعه ليقدّمه
-- للمصدّر وللطبيب البيطريّ في المحجر.
--
-- **سجلٌّ يساعد المحجر، لا شهادةٌ صحّيّة.** لا شيء هنا يشهد بصحّة حيوان؛
-- الشهادة للمحاجر البيطريّة وحدها، والصفحة تقول ذلك.
--
-- ولا يُحذف شيء (قاعدة المالك): القيدُ الخاطئ يُسحب بسببه ويبقى، والرأسُ الذي
-- بيع أو نفق أو صُدِّر تتغيّر حالته ولا يُمحى رقمه.
--
-- القراءة لصاحب القطيع وللإدارة؛ والكتابة كلّها بدوالّ تتحقّق من auth.uid().

create table public.herd_health_records (
  id            uuid primary key default gen_random_uuid(),
  herd_id       uuid not null references public.herds(id) on delete cascade,
  kind          text not null check (kind in ('vaccination', 'test', 'treatment')),
  item_key      text not null check (item_key ~ '^[a-z_]{2,40}$'),
  done_on       date not null,
  heads         integer not null check (heads > 0),
  result        text check (result in ('negative', 'positive')),
  product       text check (length(product) <= 120),
  batch         text check (length(batch) <= 60),
  vet_name      text check (length(vet_name) <= 120),
  note          text check (length(note) <= 500),
  created_by    uuid not null references auth.users(id),
  created_at    timestamptz not null default now(),
  withdrawn_at  timestamptz,
  withdrawn_note text check (length(withdrawn_note) <= 300),
  constraint result_only_for_tests check (kind = 'test' or result is null)
);

create table public.herd_tags (
  id          uuid primary key default gen_random_uuid(),
  herd_id     uuid not null references public.herds(id) on delete cascade,
  tag         text not null check (tag ~ '^[A-Za-z0-9-]{1,30}$'),
  status      text not null default 'present'
                check (status in ('present', 'sold', 'dead', 'exported')),
  added_on    date not null default current_date,
  changed_at  timestamptz,
  unique (herd_id, tag)
);

create index herd_health_records_herd_idx on public.herd_health_records (herd_id, kind, done_on desc);
create index herd_tags_herd_idx on public.herd_tags (herd_id, status);

alter table public.herd_health_records enable row level security;
alter table public.herd_tags enable row level security;
revoke insert, update on table public.herd_health_records from anon, authenticated;
revoke insert, update on table public.herd_tags from anon, authenticated;

create policy herd_health_records_read on public.herd_health_records
  for select using (
    exists (select 1 from public.herds h
             where h.id = herd_health_records.herd_id
               and (h.owner_id = (select auth.uid()) or public.is_admin()))
  );

create policy herd_tags_read on public.herd_tags
  for select using (
    exists (select 1 from public.herds h
             where h.id = herd_tags.herd_id
               and (h.owner_id = (select auth.uid()) or public.is_admin()))
  );

comment on table public.herd_health_records is
  'تطعيمات القطيع وفحوصه وعلاجاته كما سجّلها صاحبه. سجلٌّ يساعد المحجر، لا شهادة. لا يُحذف: يُسحب القيد الخاطئ بسببه.';
comment on table public.herd_tags is
  'أرقام آذان رؤوس القطيع. لا يُحذف رقم: تتغيّر حالته (بيع، نفوق، تصدير).';

-- الحارس المشترك: القطيع لصاحبه، وقائمٌ لم يُغلق.
create function public.herd_owned_active(p_herd uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'سجّل الدخول أولاً';
  end if;
  if not exists (select 1 from public.herds
                  where id = p_herd and owner_id = auth.uid()) then
    raise exception 'القطيع غير موجود أو ليس لك';
  end if;
  if exists (select 1 from public.herds
              where id = p_herd and status <> 'active') then
    raise exception 'هذه الدورة مُغلقة، فلا يُضاف إليها';
  end if;
end $$;

create function public.herd_health_add(
  p_herd    uuid,
  p_kind    text,
  p_item    text,
  p_done_on date,
  p_heads   integer,
  p_result  text,
  p_product text,
  p_batch   text,
  p_vet     text,
  p_note    text
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  head_total integer;
  new_id uuid;
begin
  perform public.herd_owned_active(p_herd);
  if p_done_on is null or p_done_on > current_date then
    raise exception 'التاريخ لا يكون في المستقبل';
  end if;
  select head_count into head_total from public.herds where id = p_herd;
  if p_heads is null or p_heads < 1 or p_heads > head_total then
    raise exception 'عدد الرؤوس بين ١ وعدد رؤوس القطيع (%)', head_total;
  end if;
  if p_kind = 'test' and p_result is null then
    raise exception 'اكتب نتيجة الفحص';
  end if;

  insert into public.herd_health_records
    (herd_id, kind, item_key, done_on, heads, result, product, batch, vet_name, note, created_by)
  values
    (p_herd, p_kind, p_item, p_done_on, p_heads,
     case when p_kind = 'test' then p_result end,
     nullif(btrim(p_product), ''), nullif(btrim(p_batch), ''),
     nullif(btrim(p_vet), ''), nullif(btrim(p_note), ''), auth.uid())
  returning id into new_id;
  return new_id;
end $$;

-- القيدُ الخاطئ يُسحب ولا يُحذف، ويبقى في الملفّ مشطوباً بسببه.
create function public.herd_health_withdraw(p_record uuid, p_note text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  h uuid;
begin
  select herd_id into h from public.herd_health_records
   where id = p_record and withdrawn_at is null;
  if h is null then
    raise exception 'القيد غير موجود أو سُحب من قبل';
  end if;
  perform public.herd_owned_active(h);
  if length(btrim(coalesce(p_note, ''))) < 3 then
    raise exception 'اكتب سبب السحب';
  end if;
  update public.herd_health_records
     set withdrawn_at = now(), withdrawn_note = btrim(p_note)
   where id = p_record;
end $$;

-- أرقامٌ متتالية بحرفٍ ثابت: SD-1 إلى SD-250 مثلاً. ما سُجّل من قبل يُترك كما هو.
create function public.herd_tags_add_range(p_herd uuid, p_prefix text, p_from integer, p_to integer)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  head_total integer;
  present integer;
  added integer;
begin
  perform public.herd_owned_active(p_herd);
  if p_prefix is null or p_prefix !~ '^[A-Za-z0-9-]{0,20}$' then
    raise exception 'الحرف الثابت: حروفٌ لاتينيّة وأرقام وشرطة فقط، حتى ٢٠';
  end if;
  if p_from is null or p_to is null or p_from < 0 or p_to < p_from or p_to - p_from >= 5000 then
    raise exception 'المدى من رقمٍ إلى رقمٍ أكبر منه، وحتى ٥٠٠٠ رقم في المرّة';
  end if;
  select head_count into head_total from public.herds where id = p_herd;
  select count(*) into present from public.herd_tags where herd_id = p_herd and status = 'present';

  with ins as (
    insert into public.herd_tags (herd_id, tag)
    select p_herd, p_prefix || n::text from generate_series(p_from, p_to) as n
    on conflict (herd_id, tag) do nothing
    returning 1
  )
  select count(*) into added from ins;

  if present + added > head_total then
    raise exception 'الأرقام (%) أكثر من رؤوس القطيع (%)', present + added, head_total;
  end if;
  return added;
end $$;

create function public.herd_tag_set_status(p_herd uuid, p_tag text, p_status text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.herd_owned_active(p_herd);
  if p_status not in ('present', 'sold', 'dead', 'exported') then
    raise exception 'حالةٌ غير معروفة';
  end if;
  update public.herd_tags
     set status = p_status, changed_at = now()
   where herd_id = p_herd and tag = btrim(p_tag);
  if not found then
    raise exception 'الرقم % غير مسجّل في هذا القطيع', p_tag;
  end if;
end $$;

revoke execute on function public.herd_owned_active(uuid) from public, anon, authenticated;
revoke execute on function public.herd_health_add(uuid, text, text, date, integer, text, text, text, text, text) from public, anon;
revoke execute on function public.herd_health_withdraw(uuid, text) from public, anon;
revoke execute on function public.herd_tags_add_range(uuid, text, integer, integer) from public, anon;
revoke execute on function public.herd_tag_set_status(uuid, text, text) from public, anon;

grant execute on function public.herd_health_add(uuid, text, text, date, integer, text, text, text, text, text) to authenticated;
grant execute on function public.herd_health_withdraw(uuid, text) to authenticated;
grant execute on function public.herd_tags_add_range(uuid, text, integer, integer) to authenticated;
grant execute on function public.herd_tag_set_status(uuid, text, text) to authenticated;
