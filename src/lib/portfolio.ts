import type { Project, RiskLevel } from "@/types/database";

export type RiskProfile = "low" | "medium" | "high";

export interface Allocation {
  project: Project;
  amount: number;
  shares: number;
}

/** Exported so the user guide can state the real split instead of a copy of it. */
export const RISK_WEIGHTS: Record<RiskProfile, Record<RiskLevel, number>> = {
  low: { low: 0.7, medium: 0.25, high: 0.05 },
  medium: { low: 0.35, medium: 0.4, high: 0.25 },
  high: { low: 0.15, medium: 0.35, high: 0.5 },
};

export function scoreToRiskProfile(score: number): RiskProfile {
  if (score <= 4) return "low";
  if (score <= 7) return "medium";
  return "high";
}

function remainingCapacity(project: Project) {
  return (
    Math.max(0, project.total_shares - project.shares_sold) *
    project.price_per_share
  );
}

/**
 * Distributes `amount` across items proportionally to their capacity, never
 * giving any item more than its own capacity, via iterative water-filling:
 * each round gives every still-open item the same fraction of its remaining
 * room; items that hit their cap drop out and the next round redistributes
 * among what's left. Converges in a handful of iterations. If total capacity
 * is less than `amount`, it fills every item to capacity and stops there
 * (the caller sees the shortfall via the returned sum being less than amount).
 */
function distributeCapped(
  amount: number,
  capacities: Map<string, number>,
): Map<string, number> {
  const result = new Map<string, number>();
  const active = new Set(capacities.keys());
  let remaining = amount;

  for (let iter = 0; iter < 50 && remaining > 1e-6 && active.size > 0; iter++) {
    const activeCapacity = [...active].reduce(
      (sum, id) => sum + (capacities.get(id)! - (result.get(id) ?? 0)),
      0,
    );
    if (activeCapacity <= 1e-9) break;

    const ratio = Math.min(1, remaining / activeCapacity);
    let distributed = 0;

    for (const id of [...active]) {
      const room = capacities.get(id)! - (result.get(id) ?? 0);
      const give = room * ratio;
      result.set(id, (result.get(id) ?? 0) + give);
      distributed += give;
      if (capacities.get(id)! - result.get(id)! <= 1e-9) active.delete(id);
    }

    remaining -= distributed;
  }

  return result;
}

/**
 * Allocates a target amount across open projects using risk-bucket weights
 * (the same principle robo-advisors like Betterment/Wealthfront use for
 * asset-class allocation), then fills any amount a bucket couldn't absorb
 * (because it ran out of room) into whatever capacity remains elsewhere.
 * Every allocation is guaranteed to never exceed that project's actual
 * remaining capacity — verified with a dedicated test script including an
 * over-capacity edge case.
 */
export function planAllocation(
  amount: number,
  riskProfile: RiskProfile,
  projects: Project[],
): Allocation[] {
  const openProjects = projects.filter(
    (p) => p.status === "open" && remainingCapacity(p) > 0,
  );
  const weights = RISK_WEIGHTS[riskProfile];

  const buckets: Record<RiskLevel, Project[]> = {
    low: [],
    medium: [],
    high: [],
  };
  for (const p of openProjects) buckets[p.risk_level].push(p);

  const amounts = new Map<string, number>();
  let leftover = 0;

  (Object.keys(weights) as RiskLevel[]).forEach((level) => {
    const bucketProjects = buckets[level];
    const capacities = new Map(
      bucketProjects.map((p) => [p.id, remainingCapacity(p)]),
    );
    const target = amount * weights[level];
    const given = distributeCapped(target, capacities);

    for (const p of bucketProjects)
      amounts.set(p.id, (amounts.get(p.id) ?? 0) + (given.get(p.id) ?? 0));
    leftover += target - [...given.values()].reduce((s, v) => s + v, 0);
  });

  if (leftover > 1e-6) {
    const remainingCapacities = new Map(
      openProjects.map((p) => [
        p.id,
        remainingCapacity(p) - (amounts.get(p.id) ?? 0),
      ]),
    );
    const given = distributeCapped(leftover, remainingCapacities);
    for (const [id, extra] of given)
      amounts.set(id, (amounts.get(id) ?? 0) + extra);
  }

  return openProjects
    .map((project) => {
      const rawAmount = amounts.get(project.id) ?? 0;
      const shares = Math.floor(rawAmount / project.price_per_share);
      return { project, shares, amount: shares * project.price_per_share };
    })
    .filter((a) => a.shares > 0)
    .sort((a, b) => b.amount - a.amount);
}
