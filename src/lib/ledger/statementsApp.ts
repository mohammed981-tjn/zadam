/**
 * ما يأخذه التطبيق من القوائم الماليّة (البند ٢٠٥): the JSON /api/app/books/statements answers with. One function, so the
 * route and the gate that writes the app's test fixture (scripts/verify-ledger-bundle.ts →
 * mobile/test/fixtures/statements_route.json) cannot drift apart: the Dart tests read exactly what the route sends.
 */

import { bundleToWire, fingerprintGroups, periodLabel, type StatementsBundle } from "./statements";
import { statementsQuery, type StatementsParams } from "./statementsParams";

export function statementsForApp(
  bundle: StatementsBundle,
  p: StatementsParams,
  seasons: readonly { id: string; name: string; planting_date: string }[],
  today: string,
) {
  return {
    today,
    params: { basis: p.basis, year: p.year, month: p.month, season: p.season, compare: p.compare, book: p.kind },
    seasons: seasons.map((s) => ({ id: s.id, name: s.name, planting_date: s.planting_date })),
    period: periodLabel(bundle.current, bundle.basis).ar,
    previous_period: bundle.previous ? periodLabel(bundle.previous, bundle.basis).ar : null,
    fingerprint_groups: fingerprintGroups(bundle.fingerprint),
    pdf: `/api/app/books/statements/pdf${statementsQuery(p, today)}`,
    statements: bundleToWire(bundle),
  };
}
