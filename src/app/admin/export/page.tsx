import Link from "next/link";
import { requireAdmin } from "@/lib/adminGuard";
import ExportReviewCard from "@/components/ExportReviewCard";
import { formatMinor } from "@/lib/exportOffers";

export const metadata = { title: "طابور مراجعة الصادر · سودجري" };

interface QueueRow {
  id: string;
  reference: string;
  quantity: string;
  uom_code: string;
  value_minor: number;
  shipment_date: string | null;
  submitted_at: string | null;
}

interface OriginRow {
  offer_id: string;
  plot_ref: string;
  area_hectares: string | null;
  latitude: string;
  longitude: string;
  boundary: unknown | null;
}

interface EvidenceRow {
  offer_id: string;
  kind: string;
  sha256: string | null;
}

/**
 * طابورُ المراجعة — الزرُّ الثاني.
 *
 * WHY OLDEST FIRST
 *
 * A queue ordered newest-first starves its own tail: the offer nobody looked at
 * on the first day is the offer nobody ever looks at. The index behind this
 * ordering exists in the migration for the same reason.
 *
 * WHAT THIS SHOWS, AND WHY IT IS THAT AND NOT MORE
 *
 * A reviewer here is answering one question — do the evidence and the origin
 * support what the offer claims? So the card shows the claim and the proof
 * beside each other, and nothing about the farmer. Their name is not part of
 * that judgement, and putting it here invites the judgement to drift toward the
 * person.
 */
export default async function AdminExportQueuePage() {
  const { supabase } = await requireAdmin();

  const { data: queueRows } = await supabase
    .from("export_offers")
    .select("id, reference, quantity, uom_code, value_minor, shipment_date, submitted_at")
    .eq("status", "submitted")
    .order("submitted_at", { ascending: true });

  const queue = (queueRows ?? []) as QueueRow[];
  const ids = queue.map((o) => o.id);

  const [{ data: originRows }, { data: evidenceRows }] = ids.length
    ? await Promise.all([
        supabase
          .from("export_offer_origins")
          .select("offer_id, plot_ref, area_hectares, latitude, longitude, boundary")
          .in("offer_id", ids),
        supabase
          .from("export_offer_evidence")
          .select("offer_id, kind, sha256")
          .in("offer_id", ids),
      ])
    : [{ data: [] }, { data: [] }];

  const origins = (originRows ?? []) as OriginRow[];
  const evidence = (evidenceRows ?? []) as EvidenceRow[];

  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      <div className="mb-6 flex flex-wrap items-baseline justify-between gap-3">
        <h1 className="text-2xl font-bold">طابور مراجعة الصادر</h1>
        <Link href="/admin" className="text-sm text-primary underline">
          لوحة الإدارة
        </Link>
      </div>

      <p className="mb-6 text-sm leading-7 text-muted">
        الأقدمُ أوّلاً. وما تشهد به بالنشر أنّ <strong>الأدلّة تسند الدعاوى</strong>:
        المستنداتُ موجودة، والدرجةُ تطابق ما تُظهره الصور، وإحداثيّةُ المنشأ
        مكتملة. لا تشهد بجودة البضاعة ولا بعدالة السعر — تلك للمشتري وفحصِه، وشارةٌ
        تَعِد بأكثر ممّا فُحص تجعل أوّلَ شحنةٍ تُردّ مسؤوليّتنا.
      </p>

      {queue.length === 0 ? (
        <p className="rounded-xl border border-border bg-card p-4 text-sm text-muted">
          لا عروضَ تنتظر المراجعة.
        </p>
      ) : (
        <ul className="flex flex-col gap-4">
          {queue.map((o) => {
            const offerOrigins = origins.filter((x) => x.offer_id === o.id);
            const offerEvidence = evidence.filter((x) => x.offer_id === o.id);

            return (
              <li key={o.id} className="rounded-xl border border-border bg-card p-4">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="font-mono text-sm">{o.reference}</span>
                  <span className="text-xs text-muted">
                    {o.submitted_at
                      ? `أُرسل: ${new Date(o.submitted_at).toLocaleString("ar-EG")}`
                      : "—"}
                  </span>
                </div>

                <p className="mt-1 text-sm">
                  {o.quantity} {o.uom_code} · {formatMinor(o.value_minor)} دولار
                </p>

                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <div>
                    <h3 className="text-sm font-medium">المنشأ</h3>
                    {offerOrigins.length === 0 ? (
                      <p className="text-sm text-danger">
                        بلا إحداثيّة — لا تنشره.
                      </p>
                    ) : (
                      <ul className="mt-1 space-y-1 text-xs text-muted">
                        {offerOrigins.map((g, i) => (
                          <li key={i}>
                            {g.plot_ref} · {g.latitude}, {g.longitude}
                            {g.area_hectares ? ` · ${g.area_hectares} هكتار` : ""}
                            {/* The polygon rule is enforced by a constraint, so
                                this cannot be missing when it is required. It is
                                shown because a reviewer checking EUDR readiness
                                should see which form the origin took. */}
                            {g.boundary ? " · بمضلَّع" : " · نقطة"}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>

                  <div>
                    <h3 className="text-sm font-medium">الأدلّة</h3>
                    {offerEvidence.length === 0 ? (
                      <p className="text-sm text-danger">
                        بلا أدلّة — لا شيء يسند الدعوى.
                      </p>
                    ) : (
                      <ul className="mt-1 space-y-1 text-xs text-muted">
                        {offerEvidence.map((e, i) => (
                          <li key={i}>
                            {e.kind}
                            {e.sha256 ? ` · ${e.sha256.slice(0, 12)}…` : " · بلا بصمة"}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>

                <ExportReviewCard offerId={o.id} />
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
