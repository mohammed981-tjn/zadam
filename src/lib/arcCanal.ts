/**
 * القناة القوسية — المسار كما قاسته الأقمار، لا كما وصفته الدراسات.
 *
 * Forty-one elevation samples along the proposed alignment, read from SRTM 30 m
 * via the OpenTopoData API. This is the first thing in the whole dossier that
 * was measured rather than asserted, and three of its findings contradict every
 * document that arrived with the project.
 *
 * THE GEOMETRY, AND WHY THE LENGTH IS NOT 236 KM
 *
 * The studies give the canal as a semicircle of radius 75 km — π × 75 ≈ 236 km,
 * raised to 270–295 km for terrain. But they also name its two ends: the Jebel
 * Aulia reservoir and Sarurab. Those points are 60 km apart, so a semicircle
 * drawn on that chord has a radius of 30 km and a length of π × 30 ≈ 94 km.
 *
 * The check that settles it is the western extreme. This arc reaches 32.230°E,
 * which is 28 km west of Omdurman — and "30 km west of Omdurman" is the study's
 * own description of where the project area lies. The geometry agrees with
 * their words and not with their arithmetic, and at their own $4.4–6.7m per
 * kilometre the difference is $414–630m against $1.2–1.8bn.
 *
 * WHAT THE GROUND SAYS
 *
 * The lift is bigger and the obstacle is doubled. The high point is 441 m, not
 * the 410–430 m the studies use, so the rise from the 377 m reservoir is 64 m
 * rather than 40–55 — and pumping power scales with head. There are two ridges,
 * not one: 441 m on the southern leg and 437 m on the northern, with a 417 m
 * saddle between them at the westernmost point.
 *
 * And nothing flows downhill. Sarurab sits at 409 m, thirty-two metres *above*
 * the reservoir that is supposed to feed it. There is no gravity segment
 * anywhere on this alignment.
 */

export interface RoutePoint {
  /** Index along the arc, 0 at Jebel Aulia and 40 at Sarurab. */
  index: number;
  lat: number;
  lon: number;
  /** Metres above sea level, SRTM 30 m. */
  elevation: number;
}

/** Half the chord between the two named ends: 60 km apart, so 30 km. */
export const ARC_RADIUS_KM = 30;

/** π × r — the semicircle the two endpoints actually describe. */
export const ROUTE_LENGTH_KM = Math.PI * ARC_RADIUS_KM;

/** Reservoir level at Jebel Aulia, measured at the dam rather than assumed. */
export const SOURCE_ELEVATION_M = 377;

export const ROUTE: RoutePoint[] = [
  { index: 0, lat: 15.24, lon: 32.51, elevation: 387 },
  { index: 1, lat: 15.24083, lon: 32.48806, elevation: 378 },
  { index: 2, lat: 15.24332, lon: 32.46626, elevation: 377 },
  { index: 3, lat: 15.24746, lon: 32.44473, elevation: 390 },
  { index: 4, lat: 15.25321, lon: 32.4236, elevation: 394 },
  { index: 5, lat: 15.26055, lon: 32.403, elevation: 404 },
  { index: 6, lat: 15.26943, lon: 32.38306, elevation: 413 },
  { index: 7, lat: 15.27979, lon: 32.36391, elevation: 416 },
  { index: 8, lat: 15.29157, lon: 32.34566, elevation: 415 },
  { index: 9, lat: 15.30469, lon: 32.32841, elevation: 418 },
  { index: 10, lat: 15.31908, lon: 32.31229, elevation: 419 },
  { index: 11, lat: 15.33465, lon: 32.29739, elevation: 420 },
  { index: 12, lat: 15.3513, lon: 32.2838, elevation: 429 },
  { index: 13, lat: 15.36893, lon: 32.2716, elevation: 437 },
  { index: 14, lat: 15.38742, lon: 32.26087, elevation: 437 },
  { index: 15, lat: 15.40668, lon: 32.25168, elevation: 440 },
  { index: 16, lat: 15.42657, lon: 32.24408, elevation: 441 },
  { index: 17, lat: 15.44697, lon: 32.23813, elevation: 431 },
  { index: 18, lat: 15.46776, lon: 32.23384, elevation: 426 },
  { index: 19, lat: 15.48882, lon: 32.23126, elevation: 424 },
  { index: 20, lat: 15.51, lon: 32.2304, elevation: 417 },
  { index: 21, lat: 15.53118, lon: 32.23126, elevation: 419 },
  { index: 22, lat: 15.55224, lon: 32.23384, elevation: 404 },
  { index: 23, lat: 15.57303, lon: 32.23813, elevation: 409 },
  { index: 24, lat: 15.59343, lon: 32.24408, elevation: 411 },
  { index: 25, lat: 15.61332, lon: 32.25168, elevation: 411 },
  { index: 26, lat: 15.63258, lon: 32.26087, elevation: 415 },
  { index: 27, lat: 15.65107, lon: 32.2716, elevation: 419 },
  { index: 28, lat: 15.6687, lon: 32.2838, elevation: 431 },
  { index: 29, lat: 15.68535, lon: 32.29739, elevation: 437 },
  { index: 30, lat: 15.70092, lon: 32.31229, elevation: 435 },
  { index: 31, lat: 15.71531, lon: 32.32841, elevation: 426 },
  { index: 32, lat: 15.72843, lon: 32.34566, elevation: 419 },
  { index: 33, lat: 15.74021, lon: 32.36391, elevation: 409 },
  { index: 34, lat: 15.75057, lon: 32.38306, elevation: 413 },
  { index: 35, lat: 15.75945, lon: 32.403, elevation: 417 },
  { index: 36, lat: 15.76679, lon: 32.4236, elevation: 410 },
  { index: 37, lat: 15.77254, lon: 32.44473, elevation: 408 },
  { index: 38, lat: 15.77668, lon: 32.46626, elevation: 417 },
  { index: 39, lat: 15.77917, lon: 32.48806, elevation: 412 },
  { index: 40, lat: 15.78, lon: 32.51, elevation: 409 },
];

/** Distance along the arc for a sample, in kilometres from Jebel Aulia. */
export function distanceKm(index: number): number {
  return (ROUTE_LENGTH_KM * index) / (ROUTE.length - 1);
}

/**
 * A named place on the route, for labelling the profile.
 *
 * Deliberately few. The profile carries forty-one measurements and labelling
 * them all would bury the three that matter — the source, the summit, and the
 * terminus that sits above it.
 */
export interface RouteLandmark {
  index: number;
  name: string;
  note: string;
}

export const LANDMARKS: RouteLandmark[] = [
  { index: 2, name: "جبل أولياء", note: "منسوب الخزان ٣٧٧ م" },
  { index: 16, name: "الحاجز الجنوبي", note: "أعلى نقطة ٤٤١ م" },
  { index: 20, name: "أقصى الغرب", note: "سرج ٤١٧ م" },
  { index: 29, name: "الحاجز الشمالي", note: "٤٣٧ م" },
  { index: 40, name: "السروراب", note: "٤٠٩ م — فوق المصدر" },
];

/**
 * How much a summit has to stand above its surroundings to count as an obstacle.
 *
 * Twenty metres, and the number is doing real work. The first version of the
 * ridge count asked only for a local maximum standing 15 m above the western
 * saddle, and it returned four — because a 437 m plateau two samples before the
 * 441 m summit is part of the same crest, and a 419 m bump just past the saddle
 * is not a crest at all. A canal crosses two obstacles here, not four.
 */
export const RIDGE_PROMINENCE_M = 20;

/**
 * Topographic prominence of the sample at `i`: how far it stands above the
 * highest saddle separating it from any higher ground.
 *
 * The standard definition, and the reason it is the right one is that it
 * answers the engineering question directly. A summit's prominence is the
 * depth you would have to descend before you could climb something taller —
 * which, for a canal, is exactly the cut or the lift that summit costs you.
 * A local maximum on the flank of a bigger one has near-zero prominence and
 * costs nothing extra, which is why counting local maxima overcounts.
 */
export function prominence(route: RoutePoint[], i: number): number {
  const here = route[i].elevation;

  // Walk each way to the first strictly higher point, tracking the lowest
  // ground crossed. Running off the end means nothing higher exists that way,
  // and the lowest point seen stands as that side's saddle.
  const lowestTowardsHigher = (step: -1 | 1): number => {
    let lowest = here;
    for (let j = i + step; j >= 0 && j < route.length; j += step) {
      if (route[j].elevation > here) return lowest;
      lowest = Math.min(lowest, route[j].elevation);
    }
    return lowest;
  };

  const keySaddle = Math.max(lowestTowardsHigher(-1), lowestTowardsHigher(1));
  return here - keySaddle;
}

export interface RouteSummary {
  lengthKm: number;
  sourceElevation: number;
  terminusElevation: number;
  peak: RoutePoint;
  /** Height the water must be raised from the reservoir to clear the summit. */
  liftM: number;
  /** How far the terminus sits above the source; positive means no gravity. */
  terminusAboveSourceM: number;
  /** Local maxima above the saddle — the count of real obstacles. */
  ridgeCount: number;
}

/**
 * The numbers the page quotes, derived here rather than typed into the copy.
 *
 * Written as a function over ROUTE so that re-measuring the alignment changes
 * every figure on the page at once. A study whose headline numbers are string
 * literals drifts from its own data the first time the data improves.
 */
export function summarise(route: RoutePoint[] = ROUTE): RouteSummary {
  const peak = route.reduce((a, b) => (b.elevation > a.elevation ? b : a));
  const terminus = route[route.length - 1];

  const ridgeCount = route.filter(
    (_, i) => prominence(route, i) >= RIDGE_PROMINENCE_M,
  ).length;

  return {
    lengthKm: ROUTE_LENGTH_KM,
    sourceElevation: SOURCE_ELEVATION_M,
    terminusElevation: terminus.elevation,
    peak,
    liftM: peak.elevation - SOURCE_ELEVATION_M,
    terminusAboveSourceM: terminus.elevation - SOURCE_ELEVATION_M,
    ridgeCount,
  };
}

/**
 * Ground elevation west of the Nile at Sarurab, measured every few kilometres.
 *
 * Recorded because it refutes a claim this platform published. The Arc Canal
 * page proposed a pilot at the northern end "near the Nile, where the lift is a
 * few metres rather than 55". The ground says otherwise: the river is at 381 m
 * and five kilometres west is already 409 m — twenty-eight metres of lift
 * inside five kilometres, and rising from there.
 *
 * The low-lift land is at the southern end instead. Immediately west of the
 * Jebel Aulia reservoir the ground stands at 377–390 m, level with the water,
 * and does not begin climbing seriously until about fifteen kilometres out.
 */
export interface NileTransect {
  kmWestOfNile: number;
  elevation: number;
}

export const SARURAB_TRANSECT: NileTransect[] = [
  { kmWestOfNile: 0, elevation: 381 },
  { kmWestOfNile: 5, elevation: 409 },
  { kmWestOfNile: 10, elevation: 422 },
  { kmWestOfNile: 15, elevation: 413 },
  { kmWestOfNile: 20, elevation: 426 },
  { kmWestOfNile: 30, elevation: 451 },
];
