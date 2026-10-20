import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import ExportOfferForm from "@/components/ExportOfferForm";
import ExportOfferActions from "@/components/ExportOfferActions";
import {
  offerStatusLabel,
  offerStatusHelp,
  formatMinor,
  referenceName,
  destinationRegion,
  REGION_LABEL,
  type DestinationRegion,
  type OfferStatus,
} from "@/lib/exportOffers";

const REGION_ORDER: DestinationRegion[] = ["arab", "africa", "asia", "europe", "americas", "other"];
import { getLocale } from "@/lib/locale";
import { tr } from "@/lib/i18n";

export async function generateMetadata() {
  const locale = await getLocale();
  return {
    title: tr(locale, "عروضي للتصدير · سوداقري", "My export offers · Sudagri"),
    description: tr(
      locale,
      "حوّل موسماً موثَّقاً إلى عرضٍ يراه المشترون.",
      "Turn a documented season into an offer buyers can see.",
    ),
  };
}

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
  const locale = await getLocale();
  const t = (ar: string, en: string) => tr(locale, ar, en);

  const [
    { data: commodityRows },
    { data: destinationRows },
    { data: corridorRows },
    { data: gradeRows },
    { data: uomRows },
    { data: offerRows },
  ] = await Promise.all([
    supabase.from("export_commodities").select("id, code, name_ar, default_uom_code").eq("active", true).order("name_ar"),
    supabase.from("export_destinations").select("id, code, name_ar").eq("active", true).order("name_ar"),
    // Which pairs have requirements on record, so the form can say so before saving.
    supabase.from("export_corridors").select("commodity_id, destination_id, export_corridor_requirements(count)"),
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

  const commodities = ((commodityRows ?? []) as { id: string; code: string; name_ar: string; default_uom_code: string }[]).map(
    (c) => ({ id: c.id, label: referenceName(c.code, c.name_ar, locale), defaultUom: c.default_uom_code }),
  );
  const destinations = ((destinationRows ?? []) as { id: string; code: string; name_ar: string }[])
    .map((d) => {
      const region = destinationRegion(d.code);
      return {
        id: d.id,
        label: referenceName(d.code, d.name_ar, locale),
        group: locale === "en" ? REGION_LABEL[region].en : REGION_LABEL[region].ar,
        order: REGION_ORDER.indexOf(region),
      };
    })
    .sort((a, b) => a.order - b.order || a.label.localeCompare(b.label, locale))
    .map((d) => ({ id: d.id, label: d.label, group: d.group }));
  const studied: Record<string, number> = {};
  for (const c of (corridorRows ?? []) as {
    commodity_id: string;
    destination_id: string;
    export_corridor_requirements: { count: number }[];
  }[]) {
    const n = c.export_corridor_requirements?.[0]?.count ?? 0;
    if (n > 0) studied[`${c.commodity_id}|${c.destination_id}`] = n;
  }

  const grades = ((gradeRows ?? []) as { id: string; commodity_id: string; name_ar: string }[]).map(
    (g) => ({ id: g.id, commodityId: g.commodity_id, name: g.name_ar }),
  );
  const uoms = ((uomRows ?? []) as { code: string; name_ar: string }[]).map((u) => ({
    code: u.code,
    name: referenceName(u.code, u.name_ar, locale),
  }));
  const offers = (offerRows ?? []) as OfferRow[];

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="text-2xl font-bold">{t("عروضي للتصدير", "My export offers")}</h1>
      {locale === "en" ? (
        <p className="mt-2 text-sm leading-7 text-muted">
          Europe&apos;s door is open duty-free, and goods are turned back
          because a paper is missing. So what is sold here is not the crop
          alone but its <strong>proof</strong>. Read the{" "}
          <Link href="/export" className="text-primary underline">
            export corridor study
          </Link>{" "}
          to learn the four gates before you start.
        </p>
      ) : (
        <p className="mt-2 text-sm leading-7 text-muted">
          البابُ الأوروبيّ مفتوحٌ بلا رسوم، والبضاعةُ تُردّ لأنّ ورقةً ناقصة. فما
          يُباع هنا ليس المحصولَ وحده بل <strong>إثباتُه</strong>. اقرأ{" "}
          <Link href="/export" className="text-primary underline">
            دراسة ممرّ الصادر
          </Link>{" "}
          لتعرف البوّابات الأربع قبل أن تبدأ.
        </p>
      )}

      <div className="mt-6 rounded-xl border border-border bg-card p-4">
        <h2 className="font-medium">{t("عرضٌ جديد", "New offer")}</h2>
        <p className="mb-4 mt-1 text-sm text-muted">
          {t(
            "يُحفظ مسوّدةً أوّلاً. لا يراه أحدٌ حتى ترسله، ولا يُنشر حتى يراجعه موظّفٌ ويتأكّد أنّ أدلّتك تسند ما تقوله.",
            "It is saved as a draft first. No one sees it until you send it, and it is not published until a reviewer checks that your evidence supports what you claim.",
          )}
        </p>
        {commodities.length === 0 || destinations.length === 0 ? (
          <p className="text-sm text-danger">
            {t("لا منتجاتٍ أو وجهاتٍ مفعّلةٌ بعد. راجع الإدارة.", "No products or destinations are active yet. Contact the administrators.")}
          </p>
        ) : (
          <ExportOfferForm commodities={commodities} destinations={destinations} studied={studied} grades={grades} uoms={uoms} />
        )}
      </div>

      <h2 className="mt-8 font-medium">{t("عروضك", "Your offers")}</h2>
      {offers.length === 0 ? (
        <p className="mt-2 text-sm text-muted">{t("لا عروضَ بعد.", "No offers yet.")}</p>
      ) : (
        <ul className="mt-3 flex flex-col gap-3">
          {offers.map((o) => (
            <li key={o.id} className="rounded-xl border border-border bg-card p-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="font-mono text-sm">{o.reference}</span>
                <span className="text-sm font-medium">
                  {offerStatusLabel(o.status, locale)}
                </span>
              </div>

              <p className="mt-1 text-sm text-muted">
                {o.quantity} {o.uom_code} · {formatMinor(o.value_minor)} {t("دولار", "USD")}
              </p>
              <p className="mt-1 text-xs text-muted">
                {offerStatusHelp(o.status, locale)}
              </p>

              {/* The reason is the whole point of refusing with one: it is what
                  turns a rejection into something the farmer can act on. */}
              {o.status === "rejected" && o.rejection_reason && (
                <p className="mt-2 rounded-lg border border-danger/40 bg-danger/5 p-2 text-sm text-danger">
                  {t("سببُ الإعادة:", "Reason for return:")} <bdi dir="auto">{o.rejection_reason}</bdi>
                </p>
              )}

              <Link
                href={`/export/offers/${o.id}`}
                className="mt-2 inline-block text-sm text-primary underline"
              >
                {locale === "en" ? "Evidence and chain of custody →" : "الأدلّة وسلسلة العهدة ←"}
              </Link>

              <ExportOfferActions offerId={o.id} status={o.status} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
