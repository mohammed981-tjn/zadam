/**
 * توصية طريقة الري — الطريقة التي يختارها المزارع تبقى كما هي، وبجانبها الأنسب.
 *
 * The owner, 12 October 2026: «طريقة الري تكون كما هي لكن توصيات بالطريقة
 * الأفضل». The study keeps computing with the method the farmer chose; this
 * file only says which method suits the crop and the area better, and what
 * the difference is in water.
 *
 * "Better" is not simply "most efficient". Drip wins on efficiency for every
 * crop, yet nobody drips wheat: close-growing field crops are sown too densely
 * for a line per row, and the crop's value does not carry the cost. So each
 * method is first judged suitable or not for the crop, after FAO's Irrigation
 * Water Management Training Manual No. 5, "Irrigation Methods" (Brouwer et
 * al., 1988), ch. 2 and 6: surface irrigation suits all crops; sprinkler suits
 * most field and row crops; drip suits row crops (vegetables), tree and palm
 * crops, and not close-growing ones. Only among the suitable methods does
 * efficiency decide.
 *
 * A centre pivot is a machine that waters a circle; one span set covers on the
 * order of a hundred feddans or more, and below that the machine is not paid
 * for. That threshold is a practical rule, not a published constant, and the
 * advice says so.
 */

import { IRRIGATION_EFFICIENCY, type IrrigationMethod } from "./agronomy";

export type Suitability = "suited" | "possible" | "unsuited";

/** Below this area a centre pivot is not recommended (practical rule). */
export const PIVOT_MIN_FEDDANS = 100;

const S = "suited", P = "possible", U = "unsuited";

/** Per crop: flood, sprinkler, pivot, drip. Crops not listed are treated as field crops. */
const BY_CROP: Record<string, Record<IrrigationMethod, Suitability>> = {
  wheat: { flood: S, sprinkler: S, pivot: S, drip: U },
  sorghum: { flood: S, sprinkler: S, pivot: S, drip: U },
  millet: { flood: S, sprinkler: S, pivot: S, drip: U },
  maize: { flood: S, sprinkler: S, pivot: S, drip: P },
  cotton: { flood: S, sprinkler: P, pivot: P, drip: P },
  groundnut: { flood: S, sprinkler: S, pivot: S, drip: P },
  sesame: { flood: S, sprinkler: S, pivot: P, drip: U },
  alfalfa: { flood: S, sprinkler: S, pivot: S, drip: U },
  onion: { flood: P, sprinkler: P, pivot: U, drip: S },
  tomato: { flood: P, sprinkler: P, pivot: U, drip: S },
  sugarcane: { flood: S, sprinkler: P, pivot: U, drip: P },
  dates: { flood: P, sprinkler: U, pivot: U, drip: S },
};

const FIELD_CROP: Record<IrrigationMethod, Suitability> = { flood: S, sprinkler: S, pivot: S, drip: U };

export interface MethodAdvice {
  method: IrrigationMethod;
  suitability: Suitability;
  /** True when the method suits the crop but the area is too small for it. */
  tooSmall: boolean;
  /** Gross water per feddan for this method, m³. */
  m3PerFeddan: number;
}

export interface IrrigationAdvice {
  methods: MethodAdvice[];
  /** The most water-efficient method that suits this crop and area. */
  recommended: IrrigationMethod;
  /** Water saved per feddan by switching from the chosen method (0 if none). */
  savingM3PerFeddan: number;
  savingShare: number;
}

/**
 * @param netM3PerFeddan the crop's net irrigation need (before method losses),
 *   so every method can be priced in water from the same figure.
 */
export function irrigationAdvice(
  cropKey: string,
  chosen: IrrigationMethod,
  feddans: number,
  netM3PerFeddan: number,
): IrrigationAdvice {
  const table = BY_CROP[cropKey] ?? FIELD_CROP;
  const methods = (Object.keys(IRRIGATION_EFFICIENCY) as IrrigationMethod[]).map((method) => ({
    method,
    suitability: table[method],
    tooSmall: method === "pivot" && feddans < PIVOT_MIN_FEDDANS,
    m3PerFeddan: netM3PerFeddan / IRRIGATION_EFFICIENCY[method],
  }));
  const usable = (m: MethodAdvice) => m.suitability === "suited" && !m.tooSmall;
  const pool = methods.filter(usable);
  const best = (pool.length ? pool : methods.filter((m) => m.suitability !== "unsuited")).reduce((a, b) =>
    IRRIGATION_EFFICIENCY[b.method] > IRRIGATION_EFFICIENCY[a.method] ? b : a,
  );
  const mine = methods.find((m) => m.method === chosen)!;
  const saving = Math.max(0, mine.m3PerFeddan - best.m3PerFeddan);
  return {
    methods,
    recommended: best.method,
    savingM3PerFeddan: saving,
    savingShare: mine.m3PerFeddan > 0 ? saving / mine.m3PerFeddan : 0,
  };
}
