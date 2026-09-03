"use client";

import { useActionState, useState } from "react";
import { createOffer, type ActionResult } from "@/app/export/offers/actions";
import { offerAmounts, formatMinor } from "@/lib/exportOffers";

export interface CorridorOption {
  id: string;
  commodityId: string;
  label: string;
  defaultUom: string;
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
 */
export default function ExportOfferForm({
  corridors,
  grades,
  uoms,
}: {
  corridors: CorridorOption[];
  grades: GradeOption[];
  uoms: UomOption[];
}) {
  const [state, formAction, pending] = useActionState<ActionResult | null, FormData>(
    createOffer,
    null,
  );

  const [corridorId, setCorridorId] = useState(corridors[0]?.id ?? "");
  const [uom, setUom] = useState(corridors[0]?.defaultUom ?? "");
  const [quantity, setQuantity] = useState("");
  const [price, setPrice] = useState("");
  const [area, setArea] = useState("");

  const corridor = corridors.find((c) => c.id === corridorId);
  const relevantGrades = grades.filter(
    (g) => g.commodityId === corridor?.commodityId,
  );

  const amounts = offerAmounts(quantity, price, 100);
  // Four hectares is where a point stops being enough and a boundary polygon is
  // required. Shown as it is typed, so the field appears before the refusal.
  const needsBoundary = Number(area) >= 4;

  function pickCorridor(id: string) {
    setCorridorId(id);
    const next = corridors.find((c) => c.id === id);
    if (next) setUom(next.defaultUom);
  }

  const field = "w-full rounded-lg border border-border bg-card px-3 py-2 text-sm";
  const label = "block text-sm font-medium";

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div>
        <label className={label} htmlFor="corridor_id">
          السلعة والوجهة
        </label>
        <select
          id="corridor_id"
          name="corridor_id"
          className={field}
          value={corridorId}
          onChange={(e) => pickCorridor(e.target.value)}
          required
        >
          {corridors.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </select>
        <p className="mt-1 text-xs text-muted">
          الوجهةُ تحدّد المستنداتِ المطلوبة. ولا ممرَّ لسلعةٍ ووجهةٍ لم تُدرس
          شروطُهما بعد.
        </p>
      </div>

      {relevantGrades.length > 0 && (
        <div>
          <label className={label} htmlFor="grade_id">
            الدرجة
          </label>
          <select id="grade_id" name="grade_id" className={field} defaultValue="">
            <option value="">بلا درجة</option>
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
            الكمّية
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
            الوحدة
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
            سعر الوحدة (دولار)
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
            القيمة الإجمالية:{" "}
            <strong>{formatMinor(amounts.valueMinor)} دولار</strong>
          </>
        ) : (
          <span className="text-muted">
            اكتب الكمّية والسعر لتظهر القيمة الإجمالية.
          </span>
        )}
      </p>

      <fieldset className="rounded-lg border border-border p-3">
        <legend className="px-1 text-sm font-medium">منشأ البضاعة</legend>
        <p className="mb-3 text-xs text-muted">
          اللائحة الأوروبية تطلب إحداثيّة كل قطعةٍ أُنتجت فيها السلعة. وهذا ما
          يفتح لك السوق الأوروبية، ويستحيل بناؤه بأثرٍ رجعيّ.
        </p>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className={label} htmlFor="plot_ref">
              اسم القطعة أو رقمها
            </label>
            <input id="plot_ref" name="plot_ref" className={field} required />
          </div>
          <div>
            <label className={label} htmlFor="area_hectares">
              المساحة (هكتار)
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
              خط العرض
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
              خط الطول
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
              حدود القطعة (GeoJSON)
            </label>
            <textarea
              id="boundary"
              name="boundary"
              className={`${field} font-mono`}
              rows={3}
              placeholder='{"type":"Polygon","coordinates":[[...]]}'
            />
            <p className="mt-1 text-xs text-muted">
              القطعة أربعة هكتارات فأكثر، فاللائحة تطلب مضلَّع حدودٍ كاملاً لا
              نقطةً واحدة.
            </p>
          </div>
        )}
      </fieldset>

      <button
        type="submit"
        disabled={pending}
        className="self-start rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
      >
        {pending ? "جارٍ الحفظ…" : "احفظ مسوّدة"}
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
