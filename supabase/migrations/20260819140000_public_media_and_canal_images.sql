-- صور القناة القوسية — دلوٌ عام، وسندٌ إجباري لكل صورة.
--
-- WHY A SECOND BUCKET AND NOT `evidence`
--
-- The evidence bucket is private, and its storage policy checks that the first
-- path segment equals the uploader's user id. That shape is exactly right for
-- what it holds — a farmer's photographs of their own field, readable only by
-- the parties to that season — and exactly wrong here. These images are meant
-- to be seen by every visitor, including the ones who never sign in, and they
-- are uploaded by an administrator on behalf of the platform rather than owned
-- by whoever happened to press the button.
--
-- Serving them from the private bucket would mean minting a signed URL per
-- image on every page render: slower, uncacheable, and expiring. So: a public
-- bucket, world-readable, with writes closed to administrators.
--
-- `media` rather than `canal` because nothing about the bucket is canal-shaped.
-- The next public illustration on this platform belongs in it too, under its own
-- folder.
--
-- WHY `credit` IS NOT NULL
--
-- The editorial rule this project runs on is that nothing gets published
-- without a basis. For a number that means the arithmetic; for a photograph it
-- means who took it and where it came from. A canal page arguing that other
-- people's documents assert things they cannot support would not survive
-- illustrating itself with pictures of unknown origin — and an optional credit
-- field is an empty credit field.
--
-- `published` defaults to false so an upload is never live by the act of
-- uploading. The gallery is a publication, and publishing is a second decision.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'media', 'media', true, 10485760,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do nothing;

-- Public read. The bucket is already flagged public, which makes the object
-- URLs work; this policy is what lets the API list and fetch through the
-- client, and it is scoped to this bucket rather than granted broadly.
create policy media_public_read on storage.objects
  for select using (bucket_id = 'media');

create policy media_admin_insert on storage.objects
  for insert with check (bucket_id = 'media' and is_admin());

create policy media_admin_update on storage.objects
  for update using (bucket_id = 'media' and is_admin())
  with check (bucket_id = 'media' and is_admin());

create policy media_admin_delete on storage.objects
  for delete using (bucket_id = 'media' and is_admin());


create table if not exists public.arc_canal_images (
  id           bigserial primary key,

  -- Path inside the media bucket, e.g. 'canal/<uuid>.jpg'.
  storage_path text not null unique,

  caption      text not null,

  -- Who made the image. Required — see the note above.
  credit       text not null,
  -- Where it can be checked, when there is somewhere to check it.
  source_url   text,

  -- Null is honest: an image whose date nobody recorded should not be given
  -- one. Only fill it where the date is actually known.
  taken_on     date,

  sort_order   integer not null default 0,
  published    boolean not null default false,

  created_at   timestamptz not null default now(),
  created_by   uuid references auth.users (id) default auth.uid(),

  -- A caption that is only whitespace is the same as no caption, and would
  -- render as a blank line under the picture.
  constraint arc_canal_images_caption_present check (length(btrim(caption)) > 0),
  constraint arc_canal_images_credit_present  check (length(btrim(credit))  > 0)
);

alter table public.arc_canal_images enable row level security;

-- Only what has been published is visible. Unlike arc_canal_facts, which is
-- readable in full because every row in it is meant to be read, this table
-- holds drafts.
create policy arc_canal_images_public_read on public.arc_canal_images
  for select using (published or is_admin());

create policy arc_canal_images_admin_write on public.arc_canal_images
  for all using (is_admin()) with check (is_admin());

create index if not exists arc_canal_images_order
  on public.arc_canal_images (sort_order, id);
