-- تجميدُ المتطلّبات عند الإرسال — العرضُ يحمل شروطَه كما يحمل الطلبُ سعرَه.
--
-- WHAT WAS MISSING
--
-- `20260903170000` created `export_offer_requirements` and the column
-- `requirements_frozen_at`, and nothing ever wrote to either. A frozen-copy
-- table that nobody freezes into is worse than no table: it reads, to anyone
-- auditing later, as though the copy exists.
--
-- WHY FREEZE AT ALL
--
-- Compliance rules are dated data, not constants. The deforestation regulation
-- takes effect for large firms on 30 December 2026 and for small ones on
-- 30 June 2027; Sudan's own export-proceeds rules were amended and the
-- amendment then withdrawn. So "what did this shipment have to satisfy?" is a
-- question with a different answer depending on when it is asked — and asked
-- two years later by an auditor, the live table gives the wrong one.
--
-- Copying the rules onto the offer at the moment it is submitted makes the
-- answer stable. It is the same reasoning that puts a price on an order line
-- rather than reading it from the product at display time.
--
-- WHY A TRIGGER AND NOT THE SUBMIT ACTION
--
-- Because the screen is not the only caller. `export_offers` is reachable
-- through PostgREST with the public key, and a farmer's own row-level policy
-- lets them set `submitted`. If freezing lived in the server action, an offer
-- submitted by any other route would arrive at review with no frozen rules and
-- nothing to say it was missed.
--
-- WHICH DATE THE WINDOW IS TESTED AGAINST
--
-- Today, at the moment of freezing — not the shipment date, which may be null
-- and is in any case a plan rather than a fact. Rules in force after submission
-- are not knowable at submission, so a rule that changes before shipping means
-- the offer must be re-checked; the frozen copy is what makes that comparison
-- possible rather than what makes it unnecessary.

-- SECURITY DEFINER for the same reason the transition function is: the write
-- goes to a table the acting farmer must not be able to write directly. A
-- requirement list its subject can edit is a requirement list its subject can
-- shorten.
create or replace function public.export_freeze_requirements()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  -- Only on the crossing into review, and only once: a second freeze would
  -- silently replace the rules the offer was reviewed against.
  if new.status <> 'submitted' or old.status = 'submitted' then
    return new;
  end if;
  if new.requirements_frozen_at is not null then
    return new;
  end if;

  insert into export_offer_requirements
    (offer_id, document_type_id, mode, source_requirement_id)
  select new.id, r.document_type_id, r.mode, r.id
    from export_corridor_requirements r
   where r.corridor_id = new.corridor_id
     and r.effective_from <= current_date
     and (r.effective_to is null or r.effective_to > current_date)
  on conflict (offer_id, document_type_id) do nothing;

  new.requirements_frozen_at := now();
  return new;
end $function$;

drop trigger if exists export_freeze_requirements_trg on export_offers;
-- Fires before the transition trigger — PostgreSQL runs BEFORE triggers in name
-- order, and "export_freeze..." sorts ahead of "export_offer_transition...".
-- That ordering matters: `requirements_frozen_at` is set on NEW here and
-- carried through by the same UPDATE. It is not left to luck; if either trigger
-- is ever renamed, the gate's freeze check fails.
create trigger export_freeze_requirements_trg
  before update on export_offers
  for each row execute function public.export_freeze_requirements();

-- ===========================================================================
-- المتطلّباتُ السارية اليوم — بياناتٌ لا كود
-- ===========================================================================

-- Seeded from the published study, each with the date it takes effect. An
-- administrator adds, ends or supersedes any of these from the dashboard; none
-- of it is compiled into the application.

insert into export_corridor_requirements
  (corridor_id, document_type_id, mode, effective_from, effective_to)
select cr.id, dt.id, v.mode, v.from_date::date, null
from (values
  -- كلُّ ممرٍّ أوروبيّ: إقرارُ المنشأ حلّ محلّ الشهادة الحكومية.
  ('EU', 'origin_rex',      'required',    '2020-01-01'),
  ('EU', 'invoice',         'required',    '2020-01-01'),
  ('EU', 'packing_list',    'required',    '2020-01-01'),
  -- ولائحةُ الغابات — تسري على صغار المشترين من ٣٠ يونيو ٢٠٢٧، وأغلبُ
  -- مشتري السودان صغار. تُسجَّل الآن `conditional` لأنّ موعدَها لم يحلّ.
  ('EU', 'eudr_dds',        'conditional', '2026-12-30'),
  ('SA', 'saber_coc',       'required',    '2018-01-01'),
  ('SA', 'invoice',         'required',    '2020-01-01'),
  ('SA', 'packing_list',    'required',    '2020-01-01')
) as v(dest, doc, mode, from_date)
join export_destinations d  on d.code  = v.dest
join export_corridors    cr on cr.destination_id = d.id
join export_document_types dt on dt.code = v.doc
where not exists (
  select 1 from export_corridor_requirements x
   where x.corridor_id = cr.id and x.document_type_id = dt.id
);

-- والمتطلّباتُ الخاصّة بسلعةٍ بعينها، لا بوجهةٍ كاملة.
insert into export_corridor_requirements
  (corridor_id, document_type_id, mode, effective_from, effective_to)
select cr.id, dt.id, v.mode, v.from_date::date, null
from (values
  ('live_sheep', 'veterinary',    'required',    '2020-01-01'),
  ('sesame',     'phytosanitary', 'required',    '2020-01-01'),
  ('sesame',     'lab_report',    'required',    '2020-01-01'),
  ('sorghum',    'phytosanitary', 'required',    '2020-01-01'),
  ('groundnut',  'phytosanitary', 'required',    '2020-01-01'),
  ('groundnut',  'lab_report',    'required',    '2020-01-01'),
  ('gum_arabic', 'phytosanitary', 'required',    '2020-01-01'),
  ('hibiscus',   'phytosanitary', 'required',    '2020-01-01')
) as v(comm, doc, mode, from_date)
join export_commodities  c  on c.code  = v.comm
join export_corridors    cr on cr.commodity_id = c.id
join export_document_types dt on dt.code = v.doc
where not exists (
  select 1 from export_corridor_requirements x
   where x.corridor_id = cr.id and x.document_type_id = dt.id
);
