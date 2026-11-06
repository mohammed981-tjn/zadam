import { NextResponse } from "next/server";
import { clientFromBearer } from "@/lib/supabase/bearer";
import { createPublicClient } from "@/lib/supabase/public";
import { currentFx } from "@/lib/livePrices";
import { loadCropMarkets } from "@/lib/marketData";
import { fetchSudanLocust } from "@/lib/locust";
import { feasibilityOptions, feasibilityReport } from "@/lib/feasibilityReport";
import { tr } from "@/lib/i18n";
import { appLocale } from "@/lib/appLocale";

/**
 * دراسة الجدوى المرحلية في التطبيق (البند ٢٠٣) — /tools/feasibility كما هي.
 *
 * GET: what may be chosen (crops, regions, months, irrigation methods, the risks and their sources' figures, the new
 * crops) with the website's defaults. POST: the whole study for one set of inputs, computed by `feasibilityReport`,
 * which runs the website's own `phasedFeasibility`, `irrigationAdvice`, `estimateCostPerFeddan` and `summariseRisks`
 * — the app does no arithmetic of its own, so the phone and the page cannot disagree.
 *
 * Public, like the page: the reference is read with the public client. A signed-in phone may send its session, and
 * then — as on the page — the locust watch also says how far the nearest recent sighting is from each of its lands.
 * The lands are read as that person through row-level security, never with an elevated key.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  const fx = await currentFx();
  return NextResponse.json({
    ...feasibilityOptions(),
    fx: { sdgPerUsd: fx?.bank.sell ?? null, sdgPerUsdParallel: fx?.parallel.sell ?? null },
  });
}

export async function POST(req: Request) {
  const locale = appLocale(req);
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: tr(locale, "طلبٌ غير صالح.", "Invalid request.") }, { status: 400 });
  }

  // Optional: only when the phone sends a session. A stale one is simply a signed-out study, as on the page.
  const auth = req.headers.get("authorization") ? await clientFromBearer(req) : null;
  const myLands = auth
    ? (((await auth.supabase.from("lands").select("name, latitude, longitude").eq("owner_id", auth.user.id)).data ?? []) as {
        name: string;
        latitude: number | null;
        longitude: number | null;
      }[])
    : null;

  const [markets, locust, fx] = await Promise.all([
    loadCropMarkets(createPublicClient()),
    fetchSudanLocust(myLands),
    currentFx(),
  ]);
  const report = feasibilityReport(body, {
    markets,
    sdgPerUsd: fx?.bank.sell ?? null,
    sdgPerUsdParallel: fx?.parallel.sell ?? null,
    locust,
  });
  if (!report) return NextResponse.json({ error: tr(locale, "تعذّر حساب الدراسة بهذه المدخلات.", "Could not work out the study with these inputs.") }, { status: 400 });
  return NextResponse.json(report, { headers: { "cache-control": "no-store" } });
}
