-- إحداثيات القناة القوسية ومنسوبها — من القياس إلى الجدول.
--
-- GENERATED FILE. Do not edit by hand.
--   npx tsx scripts/emit-arc-canal-geometry.ts
-- verify-arc-canal re-runs the generator and fails if this file has drifted
-- from the measurements in src/lib/arcCanal.ts.
--
-- 63 rows: the 41 alignment samples with their elevations and
-- chainage, the three river polylines the plan map is drawn over, and the
-- Sarurab transect that refuted a claim this platform had published.

insert into public.arc_canal_geometry
  (feature, seq, lat, lon, elevation_m, distance_km, source)
values
  ('route', 0, 15.24, 32.51, 387, 0, 'SRTM 30 m (OpenTopoData)'),
  ('route', 1, 15.24083, 32.48806, 378, 2.356, 'SRTM 30 m (OpenTopoData)'),
  ('route', 2, 15.24332, 32.46626, 377, 4.712, 'SRTM 30 m (OpenTopoData)'),
  ('route', 3, 15.24746, 32.44473, 390, 7.069, 'SRTM 30 m (OpenTopoData)'),
  ('route', 4, 15.25321, 32.4236, 394, 9.425, 'SRTM 30 m (OpenTopoData)'),
  ('route', 5, 15.26055, 32.403, 404, 11.781, 'SRTM 30 m (OpenTopoData)'),
  ('route', 6, 15.26943, 32.38306, 413, 14.137, 'SRTM 30 m (OpenTopoData)'),
  ('route', 7, 15.27979, 32.36391, 416, 16.493, 'SRTM 30 m (OpenTopoData)'),
  ('route', 8, 15.29157, 32.34566, 415, 18.85, 'SRTM 30 m (OpenTopoData)'),
  ('route', 9, 15.30469, 32.32841, 418, 21.206, 'SRTM 30 m (OpenTopoData)'),
  ('route', 10, 15.31908, 32.31229, 419, 23.562, 'SRTM 30 m (OpenTopoData)'),
  ('route', 11, 15.33465, 32.29739, 420, 25.918, 'SRTM 30 m (OpenTopoData)'),
  ('route', 12, 15.3513, 32.2838, 429, 28.274, 'SRTM 30 m (OpenTopoData)'),
  ('route', 13, 15.36893, 32.2716, 437, 30.631, 'SRTM 30 m (OpenTopoData)'),
  ('route', 14, 15.38742, 32.26087, 437, 32.987, 'SRTM 30 m (OpenTopoData)'),
  ('route', 15, 15.40668, 32.25168, 440, 35.343, 'SRTM 30 m (OpenTopoData)'),
  ('route', 16, 15.42657, 32.24408, 441, 37.699, 'SRTM 30 m (OpenTopoData)'),
  ('route', 17, 15.44697, 32.23813, 431, 40.055, 'SRTM 30 m (OpenTopoData)'),
  ('route', 18, 15.46776, 32.23384, 426, 42.412, 'SRTM 30 m (OpenTopoData)'),
  ('route', 19, 15.48882, 32.23126, 424, 44.768, 'SRTM 30 m (OpenTopoData)'),
  ('route', 20, 15.51, 32.2304, 417, 47.124, 'SRTM 30 m (OpenTopoData)'),
  ('route', 21, 15.53118, 32.23126, 419, 49.48, 'SRTM 30 m (OpenTopoData)'),
  ('route', 22, 15.55224, 32.23384, 404, 51.836, 'SRTM 30 m (OpenTopoData)'),
  ('route', 23, 15.57303, 32.23813, 409, 54.192, 'SRTM 30 m (OpenTopoData)'),
  ('route', 24, 15.59343, 32.24408, 411, 56.549, 'SRTM 30 m (OpenTopoData)'),
  ('route', 25, 15.61332, 32.25168, 411, 58.905, 'SRTM 30 m (OpenTopoData)'),
  ('route', 26, 15.63258, 32.26087, 415, 61.261, 'SRTM 30 m (OpenTopoData)'),
  ('route', 27, 15.65107, 32.2716, 419, 63.617, 'SRTM 30 m (OpenTopoData)'),
  ('route', 28, 15.6687, 32.2838, 431, 65.973, 'SRTM 30 m (OpenTopoData)'),
  ('route', 29, 15.68535, 32.29739, 437, 68.33, 'SRTM 30 m (OpenTopoData)'),
  ('route', 30, 15.70092, 32.31229, 435, 70.686, 'SRTM 30 m (OpenTopoData)'),
  ('route', 31, 15.71531, 32.32841, 426, 73.042, 'SRTM 30 m (OpenTopoData)'),
  ('route', 32, 15.72843, 32.34566, 419, 75.398, 'SRTM 30 m (OpenTopoData)'),
  ('route', 33, 15.74021, 32.36391, 409, 77.754, 'SRTM 30 m (OpenTopoData)'),
  ('route', 34, 15.75057, 32.38306, 413, 80.111, 'SRTM 30 m (OpenTopoData)'),
  ('route', 35, 15.75945, 32.403, 417, 82.467, 'SRTM 30 m (OpenTopoData)'),
  ('route', 36, 15.76679, 32.4236, 410, 84.823, 'SRTM 30 m (OpenTopoData)'),
  ('route', 37, 15.77254, 32.44473, 408, 87.179, 'SRTM 30 m (OpenTopoData)'),
  ('route', 38, 15.77668, 32.46626, 417, 89.535, 'SRTM 30 m (OpenTopoData)'),
  ('route', 39, 15.77917, 32.48806, 412, 91.892, 'SRTM 30 m (OpenTopoData)'),
  ('route', 40, 15.78, 32.51, 409, 94.248, 'SRTM 30 m (OpenTopoData)'),
  ('white_nile', 0, 15.1922, 32.463, null, null, 'OpenStreetMap contributors (ODbL)'),
  ('white_nile', 1, 15.2831, 32.4905, null, null, 'OpenStreetMap contributors (ODbL)'),
  ('white_nile', 2, 15.4308, 32.4582, null, null, 'OpenStreetMap contributors (ODbL)'),
  ('white_nile', 3, 15.5043, 32.4645, null, null, 'OpenStreetMap contributors (ODbL)'),
  ('white_nile', 4, 15.5699, 32.4865, null, null, 'OpenStreetMap contributors (ODbL)'),
  ('white_nile', 5, 15.6124, 32.4926, null, null, 'OpenStreetMap contributors (ODbL)'),
  ('white_nile', 6, 15.6321, 32.4958, null, null, 'OpenStreetMap contributors (ODbL)'),
  ('blue_nile', 0, 15.4967, 32.6731, null, null, 'OpenStreetMap contributors (ODbL)'),
  ('blue_nile', 1, 15.592, 32.5894, null, null, 'OpenStreetMap contributors (ODbL)'),
  ('blue_nile', 2, 15.6147, 32.4949, null, null, 'OpenStreetMap contributors (ODbL)'),
  ('blue_nile', 3, 15.6412, 32.5064, null, null, 'OpenStreetMap contributors (ODbL)'),
  ('main_nile', 0, 15.6412, 32.5064, null, null, 'OpenStreetMap contributors (ODbL)'),
  ('main_nile', 1, 15.6676, 32.5139, null, null, 'OpenStreetMap contributors (ODbL)'),
  ('main_nile', 2, 15.7302, 32.5338, null, null, 'OpenStreetMap contributors (ODbL)'),
  ('main_nile', 3, 15.7981, 32.5454, null, null, 'OpenStreetMap contributors (ODbL)'),
  ('main_nile', 4, 15.8587, 32.5524, null, null, 'OpenStreetMap contributors (ODbL)'),
  ('sarurab_transect', 0, null, null, 381, 0, 'SRTM 30 m (OpenTopoData)'),
  ('sarurab_transect', 1, null, null, 409, 5, 'SRTM 30 m (OpenTopoData)'),
  ('sarurab_transect', 2, null, null, 422, 10, 'SRTM 30 m (OpenTopoData)'),
  ('sarurab_transect', 3, null, null, 413, 15, 'SRTM 30 m (OpenTopoData)'),
  ('sarurab_transect', 4, null, null, 426, 20, 'SRTM 30 m (OpenTopoData)'),
  ('sarurab_transect', 5, null, null, 451, 30, 'SRTM 30 m (OpenTopoData)')
on conflict (feature, seq) do nothing;
