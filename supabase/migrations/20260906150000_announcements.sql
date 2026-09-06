-- الأخبار: ما تريد المنصّةُ أن يقرأه الزائرُ اليوم، لا ما تعرفه دائماً.
--
-- WHY A SEPARATE TABLE AND NOT A FLAG ON knowledge_entries
--
-- `knowledge_entries` is a reference library: 152 rows about crops, water,
-- soil and institutions, each tied to a source, embedded for semantic search,
-- and true whether it was written today or a year ago. Nothing in it is
-- *dated* — an entry about wheat water requirement does not become stale news.
--
-- An announcement is the opposite shape. It has a moment, it leads with what
-- changed, it is read once, and it is worthless to the assistant's retrieval —
-- «سجّلنا أوّل أرض» is not an answer to any question a farmer will ask. Putting
-- the two in one table would mean either polluting the assistant's corpus with
-- dated notices or carrying a flag on every row to keep them apart, and a flag
-- that separates two lifecycles is a table boundary written badly.
--
-- WHAT «نشر» MEANS HERE
--
-- `published_at is null` is a draft: written, saved, visible to nobody. Setting
-- it publishes. So the publish button is one column, the draft is free, and
-- unpublishing is possible without deleting what was written — which matters,
-- because the reason to take a notice down is usually that it was wrong, and
-- the text of a wrong notice is worth keeping while it is corrected.
--
-- A future `published_at` is a scheduled post and reads as unpublished until
-- its moment: the visitor policy compares against `now()`, not against null.

create table public.announcements (
  id           uuid primary key default gen_random_uuid(),
  title        text not null check (length(btrim(title)) between 3 and 200),
  body         text not null check (length(btrim(body)) >= 20),

  -- سطرٌ واحدٌ يظهر في الرئيسيّة تحت العنوان. اختياريٌّ لأنّ خبراً قصيراً
  -- عنوانُه يكفيه، وحشوُ ملخّصٍ من أوّل الجسد يُنتج جملةً مبتورة.
  summary      text check (summary is null or length(btrim(summary)) between 10 and 300),

  -- رابطٌ اختياريٌّ داخل المنصّة: «اقرأ الدراسة» ← /arc-canal، «تصفّح المعرفة»
  -- ← /knowledge. داخليٌّ عمداً — إعلانٌ يخرج بالقارئ إلى موقعٍ آخر ليس إعلاناً
  -- عن هذه المنصّة.
  link_path    text check (link_path is null or link_path ~ '^/[A-Za-z0-9/_-]*$'),
  link_label   text check (link_label is null or length(btrim(link_label)) between 2 and 40),

  published_at timestamptz,
  created_by   uuid not null references auth.users(id),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),

  -- ورابطٌ بلا اسمٍ زرٌّ بلا كلمة، واسمٌ بلا رابطٍ كلمةٌ لا تقود إلى شيء.
  constraint announcement_link_is_whole
    check ((link_path is null) = (link_label is null))
);

-- الترتيبُ الوحيدُ الذي تُقرأ به: الأحدثُ نشراً أوّلاً.
create index announcements_published_idx
  on public.announcements (published_at desc nulls last);

alter table public.announcements enable row level security;

-- الزائرُ يرى المنشورَ الذي حلّ وقتُه، ولا يرى مسوّدةً ولا مجدولاً.
create policy announcements_public_read on public.announcements
  for select using (published_at is not null and published_at <= now());

-- والإدارةُ وحدها تكتب. لا سياسةَ للمالك: الخبرُ صوتُ المنصّة لا صوتُ كاتبه،
-- ومَن يكتبه ليس بالضرورة مَن يقرّر نشرَه.
create policy announcements_admin_all on public.announcements
  for all using (is_admin()) with check (is_admin());

-- ═══════════════════════════════════════════════════════════════════════════
-- والكاتبُ من الجلسة، ووقتُ التعديل من الخادم
-- ═══════════════════════════════════════════════════════════════════════════
--
-- `created_by` read from the request body is a `created_by` the requester can
-- choose, and this is a table whose whole purpose is to say something in the
-- platform's name. `updated_at` written by the client is a timestamp that can
-- be back-dated. Both come from the database.
create or replace function public.stamp_announcement()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    new.created_by := coalesce(auth.uid(), new.created_by);
    new.created_at := now();
  else
    new.created_by := old.created_by;
    new.created_at := old.created_at;
  end if;

  new.updated_at := now();
  return new;
end;
$$;

create trigger announcements_stamp
  before insert or update on public.announcements
  for each row execute function public.stamp_announcement();

revoke all on function public.stamp_announcement() from public, anon, authenticated;

comment on table public.announcements is
  'أخبارُ المنصّة. مسوّدةٌ ما دام published_at فارغاً، ومنشورةٌ حين يحلّ وقتُه.';
