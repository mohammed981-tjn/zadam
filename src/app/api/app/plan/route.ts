import { NextResponse } from "next/server";
import { clientFromBearer } from "@/lib/supabase/bearer";
import { planFromAnswers } from "@/lib/investmentPlan";
import { riskLabel } from "@/lib/format";

/**
 * «تخطيط الاستثمار» في التطبيق (البند ٢٠٣): /plan كما هي.
 *
 * The page is for a signed-in person, so this route is too. The split is `planFromAnswers` — the function the
 * website's `generatePlan` action calls — reading the open projects as this person through row-level security.
 * Like the page, it suggests and keeps nothing: no row is written.
 */
export async function POST(req: Request) {
  const auth = await clientFromBearer(req);
  if (!auth) return NextResponse.json({ error: "انتهت جلستك. ادخل من جديد." }, { status: 401 });

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "طلبٌ غير صالح." }, { status: 400 });
  }
  const n = (k: string) => Number(body[k]);
  const result = await planFromAnswers(auth.supabase, { amount: n("amount"), q1: n("q1"), q2: n("q2"), q3: n("q3") }, "ar");
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: 400 });

  return NextResponse.json(
    {
      riskProfile: result.riskProfile,
      riskProfileLabel: riskLabel(result.riskProfile, "ar"),
      requestedAmount: result.requestedAmount,
      allocatedAmount: result.allocatedAmount,
      allocations: result.allocations.map((a) => ({
        id: a.project.id,
        name: a.project.name,
        slug: a.project.slug,
        risk: a.project.risk_level,
        riskLabel: riskLabel(a.project.risk_level, "ar"),
        shares: a.shares,
        amount: a.amount,
      })),
    },
    { headers: { "cache-control": "no-store" } },
  );
}
