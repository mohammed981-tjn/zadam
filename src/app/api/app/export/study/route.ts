import { NextResponse } from "next/server";
import { BASKET_SOURCE, BEYOND, COMMODITIES, DEADLINES, GATES, HEADLINE, LIMITS, MONEY_KNOT, REJECTION, type Source } from "@/lib/exportTrade";

/**
 * «ممرّ الصادر السوداني» — the study the website's /export page is, for the app (البند ٢٠٣). The same constants the
 * page renders (src/lib/exportTrade.ts), so a regulation's date or a tariff arrangement is one line to update and the
 * app and the site cannot disagree about it. Every figure carries the source it was read from. Public, as the page is.
 */
export async function GET() {
  const src = (s: Source) => ({ label: s.label, url: s.url });
  return NextResponse.json(
    {
      headline: HEADLINE.map((f) => ({ value: f.value, label: f.label, note: f.note ?? null, source: src(f.source) })),
      rejection: { points: REJECTION.points, source: src(REJECTION.source) },
      commodities: COMMODITIES.map((c) => ({ name: c.name, share: c.share, markets: c.markets, gate: c.gate })),
      commodities_source: src(BASKET_SOURCE),
      beyond: BEYOND,
      gates: GATES.map((g) => ({ n: g.n, title: g.title, body: g.body, holder: g.holder, source: src(g.source) })),
      money_knot: { paragraphs: MONEY_KNOT.paragraphs, source: src(MONEY_KNOT.source) },
      deadlines: DEADLINES.map((d) => ({ what: d.what, when: d.when, asks: d.asks, effect: d.effect, source: src(d.source) })),
      limits: LIMITS.map((l) => ({ title: l.title, body: l.body, source: src(l.source) })),
    },
    { headers: { "cache-control": "no-store" } },
  );
}
