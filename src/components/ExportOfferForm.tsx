"use client";

import { useActionState, useState } from "react";
import { createOffer, type ActionResult } from "@/app/export/offers/actions";
import { offerAmounts, formatMinor } from "@/lib/exportOffers";
import { useLocale } from "@/components/LocaleProvider";
import { tr } from "@/lib/i18n";

export interface CommodityOption {
  id: string;
  label: string;
  defaultUom: string;
}

export interface DestinationOption {
  id: string;
  label: string;
  /** The heading it is listed under. */
  group: string;
}

export interface GradeOption {
  id: string;
  commodityId: string;
  name: string;
}

export interface UomOption {
  code: string;
  name: string;
}

/**
 * نموذجُ عرض التصدير.
 *
 * WHY THE TOTAL IS SHOWN WHILE TYPING
 *
 * Not decoration. The database refuses any row where value_minor is not exactly
 * round(quantity × unit_price_minor), and the same integer arithmetic that will
 * be sent computes what is shown here. So a farmer sees the figure the contract
 * will carry before pressing anything — and if the inputs are unusable, the
 * total says so rather than the form failing after the round trip.
 *
 * WHY THE UNIT IS A CHOICE AND NOT A LABEL
 *
 * The owner asked for it: a flock sold by head and another by delivered weight,
 * without a release in between. The commodity carries a default, the field
 * starts on it, and changing it is allowed — because the price the buyer
 * discounts for weight variance is exactly what documenting weight recovers.
 *
 * WHY THE PRODUCT AND THE DESTINATION ARE TWO CHOICES
 *
 * The owner asked for it (backlog 118): one list of nine product-and-country
 * pairs hid every pair nobody had written down yet. Now the product is chosen,
 * then the country, and the pair is opened on the first offer. Whether its
 * documents have been studied is said under the two fields, before saving.
 */
export default function ExportOfferForm({
  commodities,
  destinations,
  studied,
  grades,
  uoms,
}: {
  commodities: CommodityOption[];
  destinations: DestinationOption[];
  /** Requirements on record for a pair, keyed "commodityId|destinationId"; absent means not studied. */
  studied: Record<string, number>;
  grades: GradeOption[];
  uoms: UomOption[];
}) {
  const [state, formAction, pending] = useActionState<ActionResult | null, FormData>(
    createOffer,
    null,
  );
  const locale = useLocale();
  const t = (ar: string, en: string) => tr(locale, ar, en);

  const [commodityId, setCommodityId] = useState(commodities[0]?.id ?? "");
  const [destinationId, setDestinationId] = useState("");
  const [uom, setUom] = useState(commodities[0]?.defaultUom ?? "");
  const [quantity, setQuantity] = useState("");
  const [price, setPrice] = useState("");
  const [area, setArea] = useState("");

  const relevantGrades = grades.filter((g) => g.commodityId === commodityId);
  const studiedCount = destinationId ? studied[`${commodityId}|${destinationId}`] : undefined;
  const groups = [...new Set(destinations.map((d) => d.group))];

  const amounts = offerAmounts(quantity, price, 100);
  // Four hectares is where a point stops being enough and a boundary polygon is
  // required. Shown as it is typed, so the field appears before the refusal.
  const needsBoundary = Number(area) >= 4;

  function pickCommodity(id: string) {
    setCommodityId(id);
    const next = commodities.find((c) => c.id === id);
    if (next) setUom(next.defaultUom);
  }

  const field = "w-full rounded-lg border border-border bg-card px-3 py-2 text-sm";
  const label = "block text-sm font-medium";

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className={label} htmlFor="commodity_id">
            {t("المنتج", "Product")}
          </label>
          <select
            id="commodity_id"
            name="commodity_id"
            className={field}
            value={commodityId}
            onChange={(e) => pickCommodity(e.target.value)}
            required
          >
            {commodities.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={label} htmlFor="destination_id">
            {t("الوجهة", "Destination")}
          </label>
          <select
            id="destination_id"
            name="destination_id"
            className={field}
            value={destinationId}
            onChange={(e) => setDestinationId(e.target.value)}
            required
          >
            <option value="" disabled>
              {t("اختر البلد…", "Choose the country…")}
            </option>
            {groups.map((g) => (
              <optgroup key={g} label={g}>
                {destinations
                  .filter((d) => d.group === g)
                  .map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.label}
                    </option>
                  ))}
              </optgroup>
            ))}
          </select>
        </div>
        <p className="text-xs text-muted sm:col-span-2">
          {!destinationId
            ? t("الوجهةُ تحدّد المستنداتِ المطلوبة.", "The destination determines the documents required.")
            : studiedCount
              ? t(
                  `شروطُ هذه الوجهة لهذا المنتج مدروسة: ${studiedCount} مستنداتٍ تظهر في صفحة العرض بعد الحفظ.`,
                  `This destination's requirements for this product are on record: ${studiedCount} documents, shown on the offer page once saved.`,
                )
              : t(
                  "لم تُدرس شروطُ هذه الوجهة لهذا المنتج في المنصّة بعد. يُحفظ العرض، وتقول صفحتُه ذلك صراحةً — واسأل المصدّرَ المرخَّص عن مستنداتها.",
                  "This destination's requirements for this product have not been studied on the platform yet. The offer is saved and its page says so plainly — ask a licensed exporter which documents it needs.",
                )}
        </p>
      </div>

      {relevantGrades.length > 0 && (
        <div>
          <label className={label} htmlFor="grade_id">
            {t("الدرجة", "Grade")}
          </label>
          <select id="grade_id" name="grade_id" className={field} defaultValue="">
            <option value="">{t("بلا درجة", "No grade")}</option>
            {relevantGrades.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        <div>
          <label className={label} htmlFor="quantity">
            {t("الكمّية", "Quantity")}
          </label>
          <input
            id="quantity"
            name="quantity"
            className={field}
            inputMode="decimal"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            placeholder="7.5"
            required
          />
        </div>

        <div>
          <label className={label} htmlFor="uom_code">
            {t("الوحدة", "Unit")}
          </label>
          <select
            id="uom_code"
            name="uom_code"
            className={field}
            value={uom}
            onChange={(e) => setUom(e.target.value)}
          >
            {uoms.map((u) => (
              <option key={u.code} value={u.code}>
                {u.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className={label} htmlFor="unit_price">
            {t("سعر الوحدة (دولار)", "Unit price (USD)")}
          </label>
          <input
            id="unit_price"
            name="unit_price"
            className={field}
            inputMode="decimal"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            placeholder="3200.00"
            required
          />
        </div>
      </div>

      <p className="rounded-lg border border-border bg-background px-3 py-2 text-sm">
        {amounts ? (
          <>
            {t("القيمة الإجمالية:", "Total value:")}{" "}
            <strong>
              {formatMinor(amounts.valueMinor)} {t("دولار", "USD")}
            </strong>
          </>
        ) : (
          <span className="text-muted">
            {t("اكتب الكمّية والسعر لتظهر القيمة الإجمالية.", "Enter the quantity and price to see the total value.")}
          </span>
        )}
      </p>

      <fieldset className="rounded-lg border border-border p-3">
        <legend className="px-1 text-sm font-medium">{t("منشأ البضاعة", "Origin of the goods")}</legend>
        <p className="mb-3 text-xs text-muted">
          {t(
            "اللائحة الأوروبية تطلب إحداثيّة كل قطعةٍ أُنتجت فيها السلعة. وهذا ما يفتح لك السوق الأوروبية، ويستحيل بناؤه بأثرٍ رجعيّ.",
            "The European regulation requires the coordinates of every plot where the commodity was produced. This is what opens the European market to you, and it cannot be built after the fact.",
          )}
        </p>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className={label} htmlFor="plot_ref">
              {t("اسم القطعة أو رقمها", "Plot name or number")}
            </label>
            <input id="plot_ref" name="plot_ref" className={field} required />
          </div>
          <div>
            <label className={label} htmlFor="area_hectares">
              {t("المساحة (هكتار)", "Area (hectares)")}
            </label>
            <input
              id="area_hectares"
              name="area_hectares"
              className={field}
              inputMode="decimal"
              value={area}
              onChange={(e) => setArea(e.target.value)}
              placeholder="2.4"
            />
          </div>
          <div>
            <label className={label} htmlFor="latitude">
              {t("خط العرض", "Latitude")}
            </label>
            <input
              id="latitude"
              name="latitude"
              className={field}
              inputMode="decimal"
              placeholder="13.183333"
              required
            />
          </div>
          <div>
            <label className={label} htmlFor="longitude">
              {t("خط الطول", "Longitude")}
            </label>
            <input
              id="longitude"
              name="longitude"
              className={field}
              inputMode="decimal"
              placeholder="30.216667"
              required
            />
          </div>
        </div>

        {needsBoundary && (
          <div className="mt-3">
            <label className={label} htmlFor="boundary">
              {t("حدود القطعة (GeoJSON)", "Plot boundary (GeoJSON)")}
            </label>
            <textarea
              id="boundary"
              name="boundary"
              className={`${field} font-mono`}
              rows={3}
              placeholder='{"type":"Polygon","coordinates":[[...]]}'
            />
            <p className="mt-1 text-xs text-muted">
              {t(
                "القطعة أربعة هكتارات فأكثر، فاللائحة تطلب مضلَّع حدودٍ كاملاً لا نقطةً واحدة.",
                "The plot is four hectares or more, so the regulation requires a full boundary polygon, not a single point.",
              )}
            </p>
          </div>
        )}
      </fieldset>

      <button
        type="submit"
        disabled={pending}
        className="self-start rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
      >
        {pending ? t("جارٍ الحفظ…", "Saving…") : t("احفظ مسوّدة", "Save draft")}
      </button>

      {state && (
        <p
          role="status"
          className={`rounded-lg border p-3 text-sm ${
            state.ok
              ? "border-border bg-background"
              : "border-danger/40 bg-danger/5 text-danger"
          }`}
        >
          {state.message}
        </p>
      )}
    </form>
  );
}
