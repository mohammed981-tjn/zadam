import Link from "next/link";
import { readFxReference } from "@/lib/fxRates";
import { tr } from "@/lib/i18n";
import { planTotals, type Plan, type PlanItem } from "@/lib/inputPlans";
import { CROPS } from "@/lib/agronomy";
import { cropName } from "@/lib/enNames";
import { getLocale } from "@/lib/locale";
import { signedIn } from "@/lib/supplyActions";
import { addPlanItem, approvePlan, closePlan, recordDelivered, recordPaid, removePlanItem, setPlanItem } from "./actions";

export async function generateMetadata() {
  const locale = await getLocale();
  return { title: tr(locale, "مشروعي — قائمة المدخلات · سوداقري", "My project — input list · Sudagri") };
}

/**
 * «مشروعي» — the first stage of the farmer's wallet (backlog 103, 115). The
 * list of inputs from the feasibility study, approved by the farmer, paid by
 * the farmer straight to each supplier, and recorded here: what was paid,
 * what arrived, what remains. The platform never holds the money.
 */
export default async function MyProjectPage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const sp = await searchParams;
  const { supabase } = await signedIn();
  const locale = await getLocale();
  const t = (ar: string, en: string) => tr(locale, ar, en);
  const fx = readFxReference();
  const { data } = await supabase
    .from("input_plans")
    .select("*, input_plan_items(*)")
    .order("created_at", { ascending: false });
  const plans = (data ?? []) as Plan[];

  const usd = (v: number) => v.toLocaleString("en-US", { maximumFractionDigits: 2 });
  const sdg = (v: number) => Math.round(v).toLocaleString("en-US");
  const field = "w-full rounded-lg border border-border bg-background px-2 py-1.5 text-sm outline-none focus:border-primary";
  const btn = "rounded-lg border border-border px-3 py-1.5 text-xs font-semibold hover:bg-background";
  const STATUS: Record<Plan["status"], string> = {
    draft: t("مسوّدة — راجعها ثمّ وافق", "Draft — review it, then approve"),
    approved: t("موافَقٌ عليها — ادفع للموردين وسجّل", "Approved — pay the suppliers and record it"),
    closed: t("مُقفلة", "Closed"),
  };

  const itemRow = (plan: Plan, i: PlanItem) => {
    const open = plan.status !== "closed" && !i.removed_at;
    const cost = i.unit_price_usd === null ? null : Number(i.quantity) * Number(i.unit_price_usd);
    return (
      <li key={i.id} className={`rounded-xl border p-3 ${i.removed_at ? "border-dashed border-border opacity-60" : "border-border"}`}>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className="font-semibold">
            {i.name}{" "}
            <span className="text-sm font-normal text-muted">
              — <span dir="ltr">{usd(Number(i.quantity))}</span> {i.unit}
            </span>
          </p>
          <p className="text-sm" dir="ltr">
            {cost === null ? <span className="text-muted">{t("بلا سعر بعد", "No price yet")}</span> : `${usd(cost)} $`}
            {cost !== null && fx && <span className="ms-2 text-muted">≈ {sdg(cost * fx.bank.sell)} SDG</span>}
          </p>
        </div>
        {i.note && <p className="mt-0.5 text-xs text-muted">{i.note}</p>}
        <p className="mt-1 flex flex-wrap gap-x-3 text-xs">
          {i.supplier_name && <span>{t("المورد: ", "Supplier: ")}{i.supplier_name}</span>}
          {i.paid_sdg !== null && (
            <span className="text-primary">
              {t("دُفع: ", "Paid: ")}
              <span dir="ltr">{sdg(Number(i.paid_sdg))}</span> {t("جنيه في ", "SDG on ")}
              <span dir="ltr">{i.paid_at}</span>
              {i.paid_ref && ` (${i.paid_ref})`}
            </span>
          )}
          {i.delivered_at && (
            <span className="text-primary">
              {t("استُلم في ", "Delivered on ")}
              <span dir="ltr">{i.delivered_at}</span>
              {i.delivery_note && ` — ${i.delivery_note}`}
            </span>
          )}
          {i.removed_at && <span>{t("أُزيل من القائمة", "Taken off the list")}</span>}
        </p>

        {open && (
          <details className="mt-2">
            <summary className="cursor-pointer text-xs text-primary">{t("عدّل، أو سجّل الدفع والاستلام", "Edit, or record payment and delivery")}</summary>
            <div className="mt-2 flex flex-col gap-3">
              <form action={setPlanItem} className="grid grid-cols-1 gap-2 sm:grid-cols-4">
                <input type="hidden" name="item_id" value={i.id} />
                <label className="flex flex-col gap-1 text-xs">
                  {t("الكمّيّة", "Quantity")} ({i.unit})
                  <input name="quantity" type="number" step="any" min={0} defaultValue={Number(i.quantity)} className={field} required />
                </label>
                <label className="flex flex-col gap-1 text-xs">
                  {t("سعر الوحدة ($)", "Unit price ($)")}
                  <input name="unit_price_usd" type="number" step="any" min={0} defaultValue={i.unit_price_usd ?? ""} className={field} />
                </label>
                <label className="flex flex-col gap-1 text-xs">
                  {t("المورد", "Supplier")}
                  <input name="supplier" defaultValue={i.supplier_name ?? ""} className={field} />
                </label>
                <button className={`${btn} self-end`}>{t("احفظ", "Save")}</button>
              </form>

              {plan.status === "approved" && i.paid_sdg === null && (
                <form action={recordPaid} className="grid grid-cols-1 gap-2 sm:grid-cols-4">
                  <input type="hidden" name="item_id" value={i.id} />
                  <label className="flex flex-col gap-1 text-xs">
                    {t("ما دفعته للمورد (جنيه)", "What you paid the supplier (SDG)")}
                    <input name="paid_sdg" type="number" step="any" min={0} className={field} required />
                  </label>
                  <label className="flex flex-col gap-1 text-xs">
                    {t("التاريخ", "Date")}
                    <input name="paid_at" type="date" className={field} />
                  </label>
                  <label className="flex flex-col gap-1 text-xs">
                    {t("رقم التحويل أو الإيصال", "Transfer or receipt no.")}
                    <input name="paid_ref" className={field} />
                  </label>
                  <button className={`${btn} self-end`}>{t("سجّل الدفع", "Record payment")}</button>
                </form>
              )}

              {plan.status === "approved" && !i.delivered_at && (
                <form action={recordDelivered} className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                  <input type="hidden" name="item_id" value={i.id} />
                  <label className="flex flex-col gap-1 text-xs">
                    {t("تاريخ الاستلام", "Date received")}
                    <input name="delivered_at" type="date" className={field} />
                  </label>
                  <label className="flex flex-col gap-1 text-xs">
                    {t("ملاحظة (الكمّيّة، الحالة)", "Note (quantity, condition)")}
                    <input name="delivery_note" className={field} />
                  </label>
                  <button className={`${btn} self-end`}>{t("سجّل الاستلام", "Record delivery")}</button>
                </form>
              )}

              {i.paid_sdg === null && (
                <form action={removePlanItem}>
                  <input type="hidden" name="item_id" value={i.id} />
                  <button className="text-xs text-danger underline">{t("أزِل من القائمة (يبقى في السجلّ)", "Take off the list (stays in the record)")}</button>
                </form>
              )}
            </div>
          </details>
        )}
      </li>
    );
  };

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="text-2xl font-bold">{t("مشروعي — قائمة المدخلات", "My project — the input list")}</h1>
      <p className="mt-2 text-sm leading-relaxed text-muted">
        {t(
          "القائمة من دراسة الجدوى، توافق عليها أنت، وتدفع لكلّ مورد مباشرةً من حسابك في البنك أو محفظتك. سوداقري لا تستلم مالك ولا تحفظه؛ هنا تسجّل ما دفعت وما استلمت، فترى ما بقي.",
          "The list comes from the feasibility study; you approve it and pay each supplier directly from your bank account or wallet. Sudagri does not receive or hold your money; here you record what you paid and what arrived, and see what remains.",
        )}
      </p>

      {sp.ok && <p className="mt-4 rounded-xl border border-primary/30 bg-primary/5 p-3 text-sm">{sp.ok}</p>}
      {sp.error && <p className="mt-4 rounded-xl border border-danger/40 bg-danger/5 p-3 text-sm text-danger">{sp.error}</p>}

      {plans.length === 0 && (
        <div className="mt-6 rounded-2xl border border-border bg-card p-5 text-sm">
          <p>{t("لا قائمة بعد. افتح دراسة الجدوى لمحصولك، ثمّ اضغط «حوّلها إلى مشروع».", "No list yet. Open the feasibility study for your crop, then press “Turn it into a project”.")}</p>
          <Link href="/tools/feasibility" className="mt-2 inline-block font-semibold text-primary underline">
            {t("دراسة الجدوى", "Feasibility study")}
          </Link>
        </div>
      )}

      <div className="mt-6 flex flex-col gap-6">
        {plans.map((plan) => {
          const totals = planTotals(plan.input_plan_items ?? []);
          const items = [...(plan.input_plan_items ?? [])].sort((a, b) => Number(!!a.removed_at) - Number(!!b.removed_at));
          return (
            <section key={plan.id} className="rounded-2xl border border-border bg-card p-5">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="text-lg font-bold">{plan.title}</h2>
                <span className="text-xs text-muted">{STATUS[plan.status]}</span>
              </div>
              <p className="text-sm text-muted">
                {(() => { const c = CROPS.find((x) => x.key === plan.crop_key); return c ? cropName(c, locale) : plan.crop_key; })()} · <span dir="ltr">{usd(Number(plan.feddans))}</span> {t("فدان", "feddans")}
              </p>

              <dl className="mt-3 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
                <div className="rounded-lg bg-background p-2">
                  <dt className="text-xs text-muted">{t("التكلفة المسعّرة", "Priced cost")}</dt>
                  <dd className="font-bold" dir="ltr">{usd(totals.costUsd)} $</dd>
                  {fx && <dd className="text-xs text-muted" dir="ltr">≈ {sdg(totals.costUsd * fx.bank.sell)} SDG</dd>}
                </div>
                <div className="rounded-lg bg-background p-2">
                  <dt className="text-xs text-muted">{t("ما دفعتَ", "Paid")}</dt>
                  <dd className="font-bold" dir="ltr">{sdg(totals.paidSdg)} SDG</dd>
                  <dd className="text-xs text-muted">{t(`${totals.paidItems} من ${totals.items} بنود`, `${totals.paidItems} of ${totals.items} items`)}</dd>
                </div>
                <div className="rounded-lg bg-background p-2">
                  <dt className="text-xs text-muted">{t("ما استلمتَ", "Delivered")}</dt>
                  <dd className="font-bold">{t(`${totals.delivered} من ${totals.items}`, `${totals.delivered} of ${totals.items}`)}</dd>
                </div>
                <div className="rounded-lg bg-background p-2">
                  <dt className="text-xs text-muted">{t("ما بقي دفعه", "Left to pay")}</dt>
                  <dd className="font-bold" dir="ltr">{usd(totals.remainingUsd)} $</dd>
                  {fx && <dd className="text-xs text-muted" dir="ltr">≈ {sdg(totals.remainingUsd * fx.bank.sell)} SDG</dd>}
                </div>
              </dl>
              {totals.unpriced > 0 && (
                <p className="mt-2 text-xs text-muted">
                  {t(
                    `${totals.unpriced} بنود بلا سعر بعد، فلا تدخل التكلفة. اطلب العروض من `,
                    `${totals.unpriced} items have no price yet, so they are not in the cost. Ask for offers from `,
                  )}
                  <Link href="/suppliers" className="text-primary underline">{t("الموردين الموثّقين", "verified suppliers")}</Link>.
                </p>
              )}
              {fx && (
                <p className="mt-1 text-xs text-muted">
                  {t(`الجنيه بسعر بيع بنك الخرطوم في ${fx.bank.date}.`, `Pounds at Bank of Khartoum's selling rate on ${fx.bank.date}.`)}
                </p>
              )}

              <ul className="mt-4 flex flex-col gap-2">{items.map((i) => itemRow(plan, i))}</ul>

              {plan.status !== "closed" && (
                <details className="mt-3">
                  <summary className="cursor-pointer text-sm text-primary">{t("أضف بنداً (مبيد، أجر رشّ، نقل…)", "Add an item (pesticide, spraying, transport…)")}</summary>
                  <form action={addPlanItem} className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-4">
                    <input type="hidden" name="plan_id" value={plan.id} />
                    <input name="name" placeholder={t("اسم البند", "Item name")} className={field} required />
                    <input name="quantity" type="number" step="any" min={0} placeholder={t("الكمّيّة", "Quantity")} className={field} required />
                    <input name="unit" placeholder={t("الوحدة (كجم، لتر، فدان)", "Unit (kg, litre, feddan)")} className={field} required />
                    <button className={btn}>{t("أضف", "Add")}</button>
                  </form>
                </details>
              )}

              <div className="mt-4 flex flex-wrap gap-2">
                {plan.status === "draft" && (
                  <form action={approvePlan}>
                    <input type="hidden" name="plan_id" value={plan.id} />
                    <button className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white">{t("أوافق على القائمة", "I approve the list")}</button>
                  </form>
                )}
                {plan.status === "approved" && (
                  <form action={closePlan}>
                    <input type="hidden" name="plan_id" value={plan.id} />
                    <button className={btn}>{t("أقفل الخطّة (انتهى الموسم)", "Close the plan (season over)")}</button>
                  </form>
                )}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
