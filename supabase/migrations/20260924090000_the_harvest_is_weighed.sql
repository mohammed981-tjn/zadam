-- الموسمُ يُغلق بوزن ما حُصد — فتصير المقارنةُ «غلّتك» لا «غلّة البلد» وحدها.
--
-- WHY A COLUMN AND NOT A LEDGER LINE
--
-- The ledger records money: what was spent and what was sold, in dollars. A
-- harvest weight is not money, and folding it into a ledger line would mean
-- reading kilograms out of a free-text note. The season page compares it with
-- FAOSTAT's national yield in kg per feddan, so it belongs beside `feddans` —
-- the other half of that division.
--
-- WHY IT IS OPTIONAL, AND WHAT IT IS NOT
--
-- It is typed by the farmer when closing the season, and nothing checks it
-- against a weighbridge. So it is labelled on the page as *declared*, and it
-- feeds no score and no public record: `public_farmer_profile` is unchanged and
-- does not read it. A self-reported number that could raise a trust grade
-- would be an invitation to type a bigger one.
--
-- The upper bound is a sanity check against a mistyped unit (grams, or a
-- stray extra zero), not an agronomic limit: 100,000 t is more than any single
-- season on this platform could hold.

alter table public.seasons
  add column if not exists harvest_kg numeric
    check (harvest_kg is null or (harvest_kg >= 0 and harvest_kg < 100000000));

comment on column public.seasons.harvest_kg is
  'الوزن المحصود بالكيلوغرام، يصرّح به المزارع عند إقفال الموسم. لا يدخل في أيّ درجةٍ ولا سجلٍّ عام.';
