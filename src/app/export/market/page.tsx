import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { formatMinor } from "@/lib/exportOffers";

export const metadata = {
  title: "عروض التصدير المنشورة · سودجري",
  description:
    "إرسالياتٌ سودانية راجعها موظّفٌ وتأكّد أنّ أدلّتها تسند ما تقوله: المنشأ بإحداثيّته، والأدلّة ببصماتها.",
};

interface Row {
  id: string;
  reference: string;
  quantity: string;
  uom_code: string;
  unit_price_minor: number;
  value_minor: number;
  currency_code: string;
  shipment_date: string | null;
  reviewed_at: string | null;
  corridor: {
    commodity: { name_ar: string; hs_code: string | null } | null;
    destination: { name_ar: string } | null;
  } | null;
  grade: { name_ar: string } | null;
}

/**
 * ما يراه المشتري.
 *
 * WHY THIS PAGE IS PUBLIC AND NEEDS NO ACCOUNT
 *
 * The buyer is a European importer or a Saudi trader who has never heard of
 * this platform. Asking them to register before they can see whether anything
 * here is worth their time is asking them not to bother. What protects the data
 * is not a login wall: `export_offers` grants public read on `status =
 * 'published'` and nothing else, so a draft is invisible to the anon key
 * itself, not merely absent from this query.
 *
 * WHAT IS DELIBERATELY NOT HERE — THE FARMER'S NAME
 *
 * The row carries `owner_id`, which is a uuid and not an identity. Resolving it
 * to a person goes through `public_farmer_profile`, which checks the farmer's
 * own `publish_record` consent. So the act of publishing an offer does not
 * quietly publish its owner, and a farmer who wants to sell without putting
 * their name in a public listing still can.
 *
 * WHAT THE PAGE CLAIMS, STATED PLAINLY
 *
 * That a reviewer checked the evidence against the claims. Not that the goods
 * are good. The distinction is written on the page for the same reason it is
 * written in the review action: a platform that appears to guarantee quality
 * owns the first rejected shipment.
 */
export default async function ExportMarketPage() {
  const supabase = await createClient();

  const { data } = await supabase
    .from("export_offers")
    .select(
      "id, reference, quantity, uom_code, unit_price_minor, value_minor, currency_code, shipment_date, reviewed_at, " +
        "corridor:export_corridors(commodity:export_commodities(name_ar, hs_code), destination:export_destinations(name_ar)), " +
        "grade:export_commodity_grades(name_ar)",
    )
    .eq("status", "published")
    .order("reviewed_at", { ascending: false });

  const offers = (data ?? []) as unknown as Row[];

  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      <h1 className="text-2xl font-bold">عروض التصدير المنشورة</h1>

      <p className="mt-3 text-sm leading-7 text-muted">
        كلُّ عرضٍ هنا راجعه موظّفٌ وتأكّد أنّ <strong>أدلّته تسند ما يقوله</strong>:
        المنشأُ بإحداثيّته، والأدلّةُ ببصماتها، والدرجةُ تطابق ما تُظهره. وهذا هو ما
        نشهد به — <strong>لا جودةَ البضاعة ولا عدالةَ السعر</strong>. تلك تبقى لفحصك
        أنت، كما في أيّ صفقة.
      </p>

      <p className="mt-3 text-sm leading-7 text-muted">
        ولماذا يهمّك هذا: البابُ الأوروبيّ مفتوحٌ للسودان بلا رسوم، والشحناتُ تُردّ
        على الحدود لأنّ مستنداً ناقص — خمسٌ وستّون حالةَ رفضٍ سببُها الورق وحده. ما
        يقلّل هذه المخاطرة يقلّل ثمنَها.{" "}
        <Link href="/export" className="text-primary underline">
          الدراسة كاملةً
        </Link>
        .
      </p>

      {offers.length === 0 ? (
        <p className="mt-8 rounded-xl border border-border bg-card p-4 text-sm text-muted">
          لا عروضَ منشورةً بعد.
        </p>
      ) : (
        <ul className="mt-8 flex flex-col gap-4">
          {offers.map((o) => (
            <li key={o.id} className="rounded-xl border border-border bg-card p-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="font-medium">
                  {o.corridor?.commodity?.name_ar ?? "—"}
                  {o.grade ? ` · ${o.grade.name_ar}` : ""}
                </h2>
                <span className="font-mono text-xs text-muted">{o.reference}</span>
              </div>

              <dl className="mt-3 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
                <div className="flex justify-between gap-3 sm:block">
                  <dt className="text-muted">الكمّية</dt>
                  <dd>
                    {o.quantity} {o.uom_code}
                  </dd>
                </div>
                <div className="flex justify-between gap-3 sm:block">
                  <dt className="text-muted">الوجهة</dt>
                  <dd>{o.corridor?.destination?.name_ar ?? "—"}</dd>
                </div>
                <div className="flex justify-between gap-3 sm:block">
                  <dt className="text-muted">سعر الوحدة</dt>
                  <dd>
                    {formatMinor(o.unit_price_minor)} {o.currency_code}
                  </dd>
                </div>
                <div className="flex justify-between gap-3 sm:block">
                  <dt className="text-muted">القيمة</dt>
                  <dd className="font-medium">
                    {formatMinor(o.value_minor)} {o.currency_code}
                  </dd>
                </div>
                {o.corridor?.commodity?.hs_code && (
                  <div className="flex justify-between gap-3 sm:block">
                    <dt className="text-muted">البند الجمركي</dt>
                    <dd className="font-mono">{o.corridor.commodity.hs_code}</dd>
                  </div>
                )}
                {o.shipment_date && (
                  <div className="flex justify-between gap-3 sm:block">
                    <dt className="text-muted">تاريخ الشحن</dt>
                    <dd>{o.shipment_date}</dd>
                  </div>
                )}
              </dl>

              {o.reviewed_at && (
                <p className="mt-3 text-xs text-muted">
                  روجع في {new Date(o.reviewed_at).toLocaleDateString("ar-EG")}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}

      {/* Said out loud rather than left as a dead end a buyer discovers after
          reading the whole page. The contact route is a decision the owner has
          not made yet, and inventing one here would be worse than naming it. */}
      <p className="mt-8 rounded-xl border border-border bg-background p-4 text-sm leading-7 text-muted">
        <strong>للتواصل بشأن عرض:</strong> قناةُ التواصل بين المشتري والمصدِّر لم
        تُفتح بعد في المنصّة. حتى تُفتح، اذكر مرجعَ العرض في{" "}
        <Link href="/feedback" className="text-primary underline">
          صفحة الملاحظات
        </Link>{" "}
        ونصلك.
      </p>
    </div>
  );
}
