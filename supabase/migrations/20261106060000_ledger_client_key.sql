-- القيد الذي ضاع ردُّه لا يتكرّر (البند ٢٠٣، متابعة القيد بلا شبكة).
--
-- A cost typed with no network is kept on the phone — the website's outbox (src/lib/outbox.ts) or the app's
-- (mobile/lib/seasons.dart) — and sent when the network is back. When the server saved the entry but the answer never
-- reached the phone, the phone could not know: it kept the entry and sent it again, and the season's book had the
-- same cost twice. Nothing downstream can tell the second line from a real second purchase.
--
-- THE KEY
--
-- Each entry gets a random key (a UUID) on the phone the moment it is typed, before the first attempt to send it, and
-- every attempt carries the same key. The database refuses a second row with the same (season, key), and the server
-- (src/lib/seasonWrites.ts) reads that refusal as «already saved» — the same answer as a first save. An entry written
-- without a key (an item kept before this change, the settlement functions, anything the operator writes) keeps
-- `client_key` null, and nulls never collide: it is saved exactly as before.
--
-- WHAT IS NOT CHANGED, AND WHY IT HOLDS
--
--   - No policy is dropped, replaced or added. The key travels in the same INSERT through PostgREST, under
--     ledger_owner_insert (20261025160000): only the season's owner writes its book. Row-level security checks the
--     new row before it is put in the index, so someone else's insert into that season is refused by the policy and
--     never reaches the index — a stranger cannot learn whether a key is taken, nor take one in a season not his.
--     The index is per season, so a key used in one's own season collides with nothing of anyone else's.
--   - Reading is unchanged (ledger_read, ledger_partner_read): whoever could read the row reads its key, which opens
--     nothing — a key is only ever compared inside the owner's own season.
--   - The ledger's triggers run as before: ledger_entries_prepare and ledger_entries_prepare_positive (before
--     insert), the closed-season gate (ledger_entries_history_gate), the settled-row guards, and the mirror into the
--     farm book (ledger_entries_mirror → _farm_mirror_post), which runs AFTER the insert: a refused duplicate never
--     posts a journal entry, so ledger_integrity sees one entry and one posting. The mirror ignores the key on update.
--   - The key is set only by that insert. Afterwards it does not change — not by the owner's update policy, not by
--     anyone — so a row cannot be given another row's key to block a resend, nor lose its own to let one through.
--
-- لا حذفَ لبيانات: عمودٌ يُضاف فارغاً، وفهرسٌ جزئيّ، وزنادٌ بجانب ما هو قائم.

alter table public.ledger_entries
  add column if not exists client_key uuid;

comment on column public.ledger_entries.client_key is
  'مفتاحٌ عشوائيّ يضعه الهاتف حين يُكتب القيد، فيُرسَل به كلّ مرّة: قيدٌ ثانٍ بالمفتاح نفسه في الموسم نفسه يُرفض، '
  'ويقرؤه الخادم «حُفظ من قبل». فارغٌ لكلّ ما كُتب بغير هذا الطريق. لا يتغيّر بعد الحفظ.';

create unique index if not exists ledger_entries_season_client_key
  on public.ledger_entries (season_id, client_key)
  where client_key is not null;

-- The key is written once, by the insert, and never again — for everyone, the operator included: an operator who
-- moves an entry corrects a figure, not the identity of the attempt that wrote it.
create or replace function public.ledger_entries_client_key_gate()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.client_key is distinct from old.client_key then
    raise exception 'مفتاح القيد يُكتب مع القيد ولا يتغيّر بعده.';
  end if;
  return new;
end $$;

drop trigger if exists ledger_entries_client_key_gate on public.ledger_entries;
create trigger ledger_entries_client_key_gate
  before update on public.ledger_entries
  for each row execute function public.ledger_entries_client_key_gate();

revoke execute on function public.ledger_entries_client_key_gate() from public, anon, authenticated, service_role;
