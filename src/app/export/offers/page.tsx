import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import ExportOfferForm from "@/components/ExportOfferForm";
import ExportOfferActions from "@/components/ExportOfferActions";
import {
  OFFER_STATUS_LABEL,
  OFFER_STATUS_HELP,
  formatMinor,
  type OfferStatus,
} from "@/lib/exportOffers";

export const metadata = {
  title: "عروضي للتصدير · سودجري",
  description: "حوّل موسماً موثَّقاً إلى عرضٍ يراه المشترون.",
};

interface OfferRow {
  id: string;
  reference: string;
  quantity: string;
  uom_code: string;
  unit_price_minor: number;
  value_minor: number;
  status: OfferStatus;
  rejection_reason: string | null;
  created_at: string;
}

/**
 * شاشةُ المزارع — نصفُه من القرار.
 *
 * WHY THIS PAGE ONLY EVER SUBMITS
 *
 * There is no publish button here and there is no code path to one. Publishing
 * is the reviewer's act, and what enforces that is not this file's omission but
 * the row-level policy: a farmer's UPDATE may set draft, submitted or
 * withdrawn, and nothing else. Anyone POSTing straight at the endpoint meets
 * the same wall.
 */
export default async function ExportOffersPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: corridorRows }, { data: gradeRows }, { data: uomRows }, { data: offerRows }] =
    await Promise.all([
      supabase
        .from("export_corridors")
        .select(
          "id, active, commodity:export_commodities(id, name_ar, default_uom_code), destination:export_destinations(name_ar)",
        )
        .eq("active", true),
      supabase.from("export_commodity_grades").select("id, commodity_id, name_ar"),
      supabase.from("export_uom").select("code, name_ar"),
      supabase
        .from("export_offers")
        .select(
          "id, reference, quantity, uom_code, unit_price_minor, value_minor, status, rejection_reason, created_at",
        )
        .eq("owner_id", user.id)
        .order("created_at", { ascending: false }),
    ]);

  type CorridorJoin = {
    id: string;
    commodity: { id: string; name_ar: string; default_uom_code: string } | null;
    destination: { name_ar: string } | null;
  };

  const corridors = ((corridorRows ?? []) as unknown as CorridorJoin[])
    .filter((c) => c.commodity && c.destination)
    .map((c) => ({
      id: c.id,
      commodityId: c.commodity!.id,
      label: `${c.commodity!.name_ar} ← ${c.destination!.name_ar}`,
      defaultUom: c.commodity!.default_uom_code,
    }));

  const grades = ((gradeRows ?? []) as { id: string; commodity_id: string; name_ar: string }[]).map(
    (g) => ({ id: g.id, commodityId: g.commodity_id, name: g.name_ar }),
  );
  const uoms = ((uomRows ?? []) as { code: string; name_ar: string }[]).map((u) => ({
    code: u.code,
    name: u.name_ar,
  }));
  const offers = (offerRows ?? []) as OfferRow[];

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="text-2xl font-bold">عروضي للتصدير</h1>
      <p className="mt-2 text-sm leading-7 text-muted">
        البابُ الأوروبيّ مفتوحٌ بلا رسوم، والبضاعةُ تُردّ لأنّ ورقةً ناقصة. فما
        يُباع هنا ليس المحصولَ وحده بل <strong>إثباتُه</strong>. اقرأ{" "}
        <Link href="/export" className="text-primary underline">
          دراسة ممرّ الصادر
        </Link>{" "}
        لتعرف البوّابات الأربع قبل أن تبدأ.
      </p>

      <div className="mt-6 rounded-xl border border-border bg-card p-4">
        <h2 className="font-medium">عرضٌ جديد</h2>
        <p className="mb-4 mt-1 text-sm text-muted">
          يُحفظ مسوّدةً أوّلاً. لا يراه أحدٌ حتى ترسله، ولا يُنشر حتى يراجعه
          موظّفٌ ويتأكّد أنّ أدلّتك تسند ما تقوله.
        </p>
        {corridors.length === 0 ? (
          <p className="text-sm text-danger">
            لا ممرّاتٍ مفعّلةٌ بعد. راجع الإدارة.
          </p>
        ) : (
          <ExportOfferForm corridors={corridors} grades={grades} uoms={uoms} />
        )}
      </div>

      <h2 className="mt-8 font-medium">عروضك</h2>
      {offers.length === 0 ? (
        <p className="mt-2 text-sm text-muted">لا عروضَ بعد.</p>
      ) : (
        <ul className="mt-3 flex flex-col gap-3">
          {offers.map((o) => (
            <li key={o.id} className="rounded-xl border border-border bg-card p-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="font-mono text-sm">{o.reference}</span>
                <span className="text-sm font-medium">
                  {OFFER_STATUS_LABEL[o.status]}
                </span>
              </div>

              <p className="mt-1 text-sm text-muted">
                {o.quantity} {o.uom_code} · {formatMinor(o.value_minor)} دولار
              </p>
              <p className="mt-1 text-xs text-muted">
                {OFFER_STATUS_HELP[o.status]}
              </p>

              {/* The reason is the whole point of refusing with one: it is what
                  turns a rejection into something the farmer can act on. */}
              {o.status === "rejected" && o.rejection_reason && (
                <p className="mt-2 rounded-lg border border-danger/40 bg-danger/5 p-2 text-sm text-danger">
                  سببُ الإعادة: {o.rejection_reason}
                </p>
              )}

              <Link
                href={`/export/offers/${o.id}`}
                className="mt-2 inline-block text-sm text-primary underline"
              >
                الأدلّة وسلسلة العهدة ←
              </Link>

              <ExportOfferActions offerId={o.id} status={o.status} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
