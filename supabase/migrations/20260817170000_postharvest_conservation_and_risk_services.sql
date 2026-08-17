-- ما بعد الحصاد، والصيانة، وإدارة المخاطر.
--
-- Three families of work the catalogue had no words for, and the reason each
-- belongs on a service contract rather than in a footnote.
--
-- POST-HARVEST is where a crop is lost after every pound of its cost has
-- already been spent. Sub-Saharan Africa loses grain worth about US$4 billion a
-- year; published loss rates run 20–40%, with smallholders above 30%. Hermetic
-- storage is documented taking that from over 30% to under 2%. No new land, no
-- better seed — the cheapest yield increase on the platform is refusing to lose
-- what is already harvested.
--
-- MAINTENANCE, of soil and of machinery, is the same shape of spending twice
-- over: laid out in one season to protect an asset that must serve several. A
-- season that skips it looks cheaper and is not.
--
-- RISK is priced here as contract lines rather than left as unbudgeted
-- contingency, because a per-phase feasibility study can only carry a cost that
-- has a line. The scale is not hypothetical: one square kilometre of desert
-- locust swarm eats in a day what 35,000 people eat, and the 2020 upsurge
-- across East Africa and Yemen caused damages estimated up to US$8.5 billion.
--
-- crop_insurance is flagged a precondition, alongside the permits. A policy
-- bought after the damage does not cover it — and insurance substitutes for the
-- collateral a lender would otherwise demand, which is what makes it the
-- difference between a financed season and an unfinanced one.

alter type public.service_kind add value if not exists 'storage';
alter type public.service_kind add value if not exists 'security';
alter type public.service_kind add value if not exists 'insurance';

-- ما قبل الحصاد وما بعده
alter type public.service_key add value if not exists 'preharvest_assessment';
alter type public.service_key add value if not exists 'threshing_cleaning';
alter type public.service_key add value if not exists 'drying';
alter type public.service_key add value if not exists 'hermetic_storage';
alter type public.service_key add value if not exists 'cold_storage';
alter type public.service_key add value if not exists 'haulage';

-- الصيانة
alter type public.service_key add value if not exists 'soil_conservation';
alter type public.service_key add value if not exists 'windbreak';
alter type public.service_key add value if not exists 'machinery_maintenance';

-- إدارة المخاطر
alter type public.service_key add value if not exists 'fire_protection';
alter type public.service_key add value if not exists 'perimeter_fencing';
alter type public.service_key add value if not exists 'site_guarding';
alter type public.service_key add value if not exists 'locust_response';
alter type public.service_key add value if not exists 'rodent_control';
alter type public.service_key add value if not exists 'flood_protection';
alter type public.service_key add value if not exists 'crop_insurance';
