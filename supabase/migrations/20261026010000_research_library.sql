-- مكتبة الدراسات والبحوث (البند ٢٠٢؛ المالك، 26 أكتوبر 2026: «إمكانية مشاركة المسجلين والزوار وعرض دراستهم
-- وبحوثهم… لتكون رافد معرفي للمستقبل»).
--
-- يرسل أيّ أحد — زائرٌ أو مسجَّل — دراسة جدوى أو بحثاً أو رسالةً جامعيّة أو تقريراً: ملفّ PDF في دلوٍ خاصّ، أو رابطاً،
-- ومعه ملخّصٌ ومؤلّفون وجهةٌ وسنة. لا يُنشر شيءٌ بإرساله: تراجعه الإدارة فتنشره أو تردّه بسبب.
--
--   - الكتابة من خادم الموقع وحده (‎/api/research‎)، بعد حدٍّ لكلّ عنوان وبمفتاح الخدمة، كنموذج الملاحظات
--     (20261025200300): لا يملك المفتاح العامّ INSERT، فلا يملأ سكربتٌ الجدول.
--   - الزائر والعضو يقرآن المنشور وحده، وبأعمدته العامّة: لا وسيلة تواصل المرسِل، ولا معرّفه، ولا ملاحظة المراجع.
--   - المرسِل المسجَّل يرى ما أرسل وحاله بـ`research_mine()`، والإدارة تقرأ كلّ شيء وتقرّر بـ`research_review()`.
--   - الملفّ في دلو `research` الخاصّ (PDF حتى ٢٠ ميجابايت)، يُرفع إليه برابطٍ موقَّع يصنعه الخادم، ويُقرأ برابطٍ
--     موقَّع للمنشور وحده.

create table public.research_items (
  id            uuid primary key default gen_random_uuid(),
  kind          text not null check (kind in ('feasibility', 'research', 'thesis', 'report', 'other')),
  title         text not null check (length(btrim(title)) between 5 and 200),
  authors       text not null check (length(btrim(authors)) between 2 and 200),
  institution   text check (institution is null or length(institution) <= 200),
  year          integer check (year is null or year between 1950 and 2100),
  language      text not null default 'ar' check (language in ('ar', 'en', 'other')),
  crop          text check (crop is null or length(crop) <= 60),
  state         text check (state is null or length(state) <= 60),
  abstract      text not null check (length(btrim(abstract)) between 40 and 3000),
  file_path     text check (file_path is null or file_path ~ '^incoming/[0-9a-f-]{36}\.pdf$'),
  link_url      text check (link_url is null or (link_url ~ '^https://' and length(link_url) <= 500)),
  -- Private: how the administration reaches the sender, never shown.
  contact       text check (contact is null or length(contact) <= 200),
  submitted_by  uuid references auth.users(id) on delete set null,
  -- The sender says the work is theirs to share, or published already; nothing is taken without it.
  consent       boolean not null check (consent),
  status        text not null default 'pending' check (status in ('pending', 'published', 'rejected')),
  review_note   text check (review_note is null or length(review_note) <= 500),
  reviewed_by   uuid references auth.users(id) on delete set null,
  reviewed_at   timestamptz,
  published_at  timestamptz,
  created_at    timestamptz not null default now(),
  constraint research_items_has_work check (file_path is not null or link_url is not null),
  constraint research_items_one_file unique (file_path),
  constraint research_items_published check ((status = 'published') = (published_at is not null)),
  constraint research_items_rejected_why check (status <> 'rejected' or length(btrim(coalesce(review_note, ''))) >= 3)
);

create index research_items_published_idx on public.research_items (published_at desc) where status = 'published';
create index research_items_pending_idx on public.research_items (created_at) where status = 'pending';

alter table public.research_items enable row level security;

-- Everyone reads what is published; the administrators read everything.
create policy research_items_read on public.research_items
  for select to anon, authenticated
  using (status = 'published' or (select is_admin()));

revoke all on table public.research_items from anon, authenticated;
grant select (id, kind, title, authors, institution, year, language, crop, state, abstract, file_path, link_url,
              status, published_at, created_at)
  on table public.research_items to anon, authenticated;

-- ── ما يكتبه الخادم ──────────────────────────────────────────────────────────

-- The site's server writes with the service key after its own per-address limit (/api/research). Whatever it writes
-- starts pending and unreviewed, and a ceiling of 200 an hour holds the table against an attack from many addresses.
create function public.research_items_insert_gate()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.status := 'pending';
  new.review_note := null;
  new.reviewed_by := null;
  new.reviewed_at := null;
  new.published_at := null;
  new.created_at := now();
  if (select count(*) from research_items where created_at > now() - interval '1 hour') >= 200 then
    raise exception 'الإرسال كثيرٌ الآن. أعد المحاولة بعد قليل.';
  end if;
  return new;
end $$;

create trigger research_items_insert_gate
  before insert on public.research_items
  for each row execute function public.research_items_insert_gate();

-- ── المرسِل ─────────────────────────────────────────────────────────────────

-- What a signed-in sender sent, with its state and the reviewer's note.
create function public.research_mine()
returns table (id uuid, kind text, title text, status text, review_note text, created_at timestamptz,
               published_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select r.id, r.kind, r.title, r.status, r.review_note, r.created_at, r.published_at
    from research_items r
   where r.submitted_by = auth.uid()
   order by r.created_at desc;
$$;

-- ── الإدارة ─────────────────────────────────────────────────────────────────

-- Publish, or return with a reason. A published work can be withdrawn the same way (with a reason).
create function public.research_review(p_id uuid, p_publish boolean, p_note text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.research_items;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
begin
  if not is_admin() then raise exception 'للإدارة وحدها.'; end if;
  select * into r from research_items where id = p_id for update;
  if not found then raise exception 'لا عمل بهذا المعرّف.'; end if;
  if not p_publish and length(coalesce(v_note, '')) < 3 then
    raise exception 'اكتب سبب الردّ (٣ أحرفٍ فأكثر): يقرؤه المرسِل.';
  end if;
  update research_items
     set status = case when p_publish then 'published' else 'rejected' end,
         review_note = left(v_note, 500),
         reviewed_by = auth.uid(),
         reviewed_at = now(),
         published_at = case when p_publish then coalesce(r.published_at, now()) end
   where id = p_id;
  if r.submitted_by is not null then
    perform notify_user(
      r.submitted_by, 'research_reviewed',
      case when p_publish then 'نُشر عملك في مكتبة الدراسات: ' else 'رُدّ عملك المرسَل إلى مكتبة الدراسات: ' end
        || left(r.title, 120),
      case when p_publish then 'صار في المكتبة يقرؤه الجميع. شكراً لمشاركتك.'
           else 'السبب: ' || v_note end,
      case when p_publish then '/library/' || p_id else '/library/mine' end);
  end if;
end $$;

-- Everything waiting, for the review page and the admin queue.
create function public.research_pending()
returns table (id uuid, kind text, title text, authors text, institution text, year integer, crop text, state text,
               abstract text, file_path text, link_url text, contact text, submitted_by uuid, created_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select r.id, r.kind, r.title, r.authors, r.institution, r.year, r.crop, r.state, r.abstract, r.file_path, r.link_url,
         r.contact, r.submitted_by, r.created_at
    from research_items r
   where r.status = 'pending' and is_admin()
   order by r.created_at;
$$;

revoke execute on function public.research_items_insert_gate() from public, anon, authenticated, service_role;
revoke execute on function public.research_mine(), public.research_review(uuid, boolean, text), public.research_pending()
  from public, anon, service_role;
grant execute on function public.research_mine(), public.research_review(uuid, boolean, text), public.research_pending()
  to authenticated;

-- ── نوع الإشعار ─────────────────────────────────────────────────────────────

do $$
declare v_def text;
begin
  select pg_get_constraintdef(oid) into v_def
    from pg_constraint
   where conname = 'notifications_kind_check' and conrelid = 'public.notifications'::regclass;
  if v_def like '%ARRAY[%' and v_def not like '%research_reviewed%' then
    execute 'alter table public.notifications drop constraint notifications_kind_check';
    execute 'alter table public.notifications add constraint notifications_kind_check '
         || regexp_replace(v_def, '\]\)\)\)\s*$', ', ''research_reviewed''::text])))');
    select pg_get_constraintdef(oid) into v_def
      from pg_constraint
     where conname = 'notifications_kind_check' and conrelid = 'public.notifications'::regclass;
    if v_def not like '%research_reviewed%' then
      raise exception 'لم يُضَف نوع الإشعار research_reviewed';
    end if;
  end if;
end $$;

-- ── الدلو ───────────────────────────────────────────────────────────────────

-- Private: no policy lets a visitor or a member read or write it. The server uploads into it with a signed upload URL
-- it makes for one path, and hands out a signed download URL for a published work.
do $$
begin
  if to_regclass('storage.buckets') is null then
    return;
  end if;
  -- Supabase's table names each bucket; a copy without the column (the gates' harness) takes the id alone.
  if exists (select 1 from information_schema.columns
              where table_schema = 'storage' and table_name = 'buckets' and column_name = 'name') then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('research', 'research', false, 20971520, array['application/pdf'])
    on conflict (id) do nothing;
  else
    insert into storage.buckets (id, public, file_size_limit, allowed_mime_types)
    values ('research', false, 20971520, array['application/pdf'])
    on conflict (id) do nothing;
  end if;
end $$;
