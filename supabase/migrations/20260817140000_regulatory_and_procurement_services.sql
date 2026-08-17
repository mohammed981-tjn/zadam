-- الخدمات التنظيمية والتوريدية: ما يسبق العمل ويجعله ممكناً.
--
-- Everything in the catalogue so far is field work — survey the land, level it,
-- install the network, spray, harvest. None of it can legally begin in a
-- Sudanese rural locality until a different kind of work is done first:
-- permissions obtained from the locality and the native administration, the
-- contract itself notarised, and the machinery either hired, bought or cleared
-- through customs.
--
-- These are not smaller versions of the field services. They differ in three
-- ways that matter to the model:
--
--   1. They are preconditions, not deliverables. A drone survey that is late
--      delays a season; a permit that is refused ends it. They therefore carry
--      no crop phase and sort to the front of every contract plan, ahead of the
--      dated work.
--
--   2. Their proof is a document, not a photograph. milestone_evidence already
--      accepts 'report' and 'inspection' kinds alongside 'photo', so the
--      approval gate works unchanged — but what gets uploaded is a permit, a
--      notarised copy or a customs release, and the GPS stamp that matters for
--      a levelled field is meaningless here.
--
--   3. Most are priced per transaction rather than per feddan or per head. A
--      customs clearance costs what it costs whether the consignment serves ten
--      feddans or a thousand, so their basis is 'fixed' — which the catalogue
--      already supports and which keeps them honest: a lump-sum service must
--      not be silently scaled by a quantity nobody derived.
--
-- The distinction the machinery entries draw is deliberate. Hiring a tractor
-- with an operator is a field service priced by area. Arranging a purchase, or
-- clearing an imported machine, is an administrative service priced per
-- transaction — and the machine's own price is not a service at all and does
-- not belong on a service contract. Blurring those three would let the cost of
-- an asset that outlives the season be billed as if it were a seasonal
-- operation.

-- Two new provider kinds. An office that obtains permits is not an engineering
-- office, and a customs broker is not a logistics contractor.
alter type public.service_kind add value if not exists 'legal';        -- توثيق وتصاريح
alter type public.service_kind add value if not exists 'procurement';  -- توريد وتخليص

-- Regulatory: what must be secured before a field ever gets touched.
alter type public.service_key add value if not exists 'land_permit';           -- تصريح استخدام الأرض
alter type public.service_key add value if not exists 'local_clearance';       -- إجراءات المحلية والإدارة الأهلية
alter type public.service_key add value if not exists 'contract_notarization'; -- توثيق العقد
alter type public.service_key add value if not exists 'water_permit';          -- تصريح استخدام المياه

-- Machinery: hire, acquire, import.
alter type public.service_key add value if not exists 'machinery_rental';      -- تأجير آلية بمشغّل
alter type public.service_key add value if not exists 'machinery_procurement'; -- وساطة شراء أو استيراد
alter type public.service_key add value if not exists 'customs_clearance';     -- التخليص الجمركي
