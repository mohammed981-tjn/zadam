/**
 * أرضٌ قريبة من أرضٍ باسمٍ آخر (البند ١٤٢).
 *
 * The same rule as flag_land_neighbours() in
 * supabase/migrations/20261023030000_entry_and_land_facts.sql, which tells the
 * administrators when such a land is registered; this shows it again beside
 * the land on the review page, where the decision is made. Points only until
 * the drawn boundaries of backlog 134: two lands are near when their centres
 * are closer than the radii their areas imply, added, or 300 m.
 */

type Point = {
  id: string;
  owner_id: string;
  name: string;
  latitude: number | null;
  longitude: number | null;
  feddans: number | null;
};

/** One feddan is 4,200 m². */
const radius = (feddans: number | null) => Math.sqrt(((feddans ?? 0) * 4200) / Math.PI);

export function distanceMetres(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const rad = Math.PI / 180;
  const a =
    Math.sin(((lat2 - lat1) * rad) / 2) ** 2 +
    Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(((lon2 - lon1) * rad) / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.sqrt(a));
}

/** Other owners' lands near this one, nearest first. */
export function nearLands<T extends Point>(land: T, all: T[]): { land: T; metres: number }[] {
  if (land.latitude == null || land.longitude == null) return [];
  const lat = Number(land.latitude);
  const lon = Number(land.longitude);
  return all
    .filter((o) => o.id !== land.id && o.owner_id !== land.owner_id && o.latitude != null && o.longitude != null)
    .map((o) => ({ land: o, metres: distanceMetres(lat, lon, Number(o.latitude), Number(o.longitude)) }))
    .filter(({ land: o, metres }) => metres < Math.max(300, radius(land.feddans) + radius(o.feddans)))
    .sort((a, b) => a.metres - b.metres);
}
