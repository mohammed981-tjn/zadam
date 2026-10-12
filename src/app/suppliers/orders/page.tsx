import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getLocale } from "@/lib/locale";
import { tr } from "@/lib/i18n";
import { SUDAN_STATES, stateName } from "@/lib/nafir";
import {
  ORDER_STATUS,
  PACK_UNIT_LABEL,
  dateLabel,
  isNotDeployed,
  lbl,
  num,
  today,
  daysFromToday,
  type GroupOrderSummary,
  type Supplier,
  type SupplierProduct,
} from "@/lib/supplyChain";
import SupplyShell, { ComingSoon, button, card, field } from "@/components/supply/SupplyShell";
import GpsField from "@/components/supply/GpsField";
import { NoMoneyHeld } from "@/components/supply/Explainers";
import { createGroupOrder } from "../actions";

export async function generateMetadata() {
  const locale = await getLocale();
  return {
    title: tr(locale, "الطلبات الجماعية | سوداقري", "Group orders | Sudagri"),
    description: tr(
      locale,
      "جمعيتك تجمع طلبات الأعضاء في حمولة شاحنة من موردٍ موثّق، تصل نقطة الاستلام في يومٍ معلن. المقدّم يُدفع مباشرةً للمورد أو الجمعية.",
      "Your cooperative gathers members’ needs into a truckload from a verified supplier, arriving at the pickup point on an announced day. The deposit is paid directly to the supplier or the cooperative.",
    ),
  };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function unitKg(p: SupplierProduct): number | "" {
  if (p.pack_unit === "kg" || p.pack_unit === "l") return Number(p.pack_size);
  if (p.pack_unit === "g" || p.pack_unit === "ml") return Number(p.pack_size) / 1000;
  return "";
}

export default async function GroupOrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ supplier?: string; ok?: string; error?: string }>;
}) {
  const sp = await searchParams;
  const locale = await getLocale();
  const t = (ar: string, en: string) => tr(locale, ar, en);
  const typed = locale === "en" ? ({ lang: "ar", dir: "auto" } as const) : {};
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data, error } = await supabase.rpc("group_order_directory");
  const notDeployed = isNotDeployed(error);
  if (error && !notDeployed) console.error("group orders: directory failed", error);
  const orders = (data ?? []) as GroupOrderSummary[];

  let suppliers: Supplier[] = [];
  let chosen: Supplier | null = null;
  let chosenProducts: SupplierProduct[] = [];
  if (user && !notDeployed) {
    const { data: s } = await supabase
      .from("suppliers")
      .select("*")
      .not("verified_at", "is", null)
      .eq("active", true)
      .order("name")
      .limit(500);
    suppliers = (s ?? []) as Supplier[];
    chosen = sp.supplier && UUID.test(sp.supplier) ? (suppliers.find((x) => x.id === sp.supplier) ?? null) : null;
    if (chosen) {
      const { data: p } = await supabase
        .from("supplier_products")
        .select("*")
        .eq("supplier_id", chosen.id)
        .eq("active", true)
        .gte("valid_until", today())
        .order("name")
        .limit(8);
      chosenProducts = (p ?? []) as SupplierProduct[];
    }
  }
  const blankRows = Math.max(2, 4 - chosenProducts.length);
  const inTwoWeeks = daysFromToday(14);
  const inThreeWeeks = daysFromToday(21);

  return (
    <SupplyShell active="/suppliers/orders" ok={sp.ok} error={sp.error}>
      <h1 className="text-2xl font-black">{t("الطلبات الجماعية", "Group orders")}</h1>
      <p className="mt-2 max-w-2xl leading-8 text-muted">
        {t(
          "جوالٌ واحدٌ يُشترى بسعر التجزئة، وحمولةُ شاحنةٍ بسعرٍ أفضل. تفتح الجمعية أو مندوب القسم طلباً على موردٍ موثّق، ويتعهّد كلُّ مزارعٍ بكميّته، حتى تكتمل الحمولة. ثمّ تصل الشاحنة نقطة الاستلام في اليوم المعلن — كما يفعل One Acre Fund في شرق أفريقيا.",
          "One sack is bought at retail; a truckload at a better price. The cooperative or block representative opens an order with a verified supplier, each farmer pledges their quantity until the load is full, and the truck reaches the pickup point on the announced day — as One Acre Fund does in East Africa.",
        )}
      </p>

      <ol className={`${card} mt-6 grid gap-3 text-sm sm:grid-cols-4`}>
        {[
          [t("١. يفتح المنظّم الطلب", "1. The organiser opens the order"), t("المورد، والأصناف بأسعارها، ونقطة الاستلام، ويوم التوصيل، وآخر موعد.", "Supplier, items and prices, pickup point, drop day, deadline.")],
          [t("٢. يتعهّد المزارعون", "2. Farmers pledge"), t("كلٌّ بكميّته، والحمولة تُحسب بالطن أمام الجميع.", "Each their quantity; the load in tonnes is shown to all.")],
          [t("٣. المقدّم مباشرةً", "3. Deposit, directly"), t("١٠٪ إلى حساب المورد أو الجمعية، والمنظّم يسجّل رقم التحويل.", "10% into the supplier’s or cooperative’s account; the organiser records the transfer reference.")],
          [t("٤. يوم التوصيل", "4. Drop day"), t("الاستلام من النقطة، والباقي يُدفع عندها. أو توصيلٌ إلى الأرض بالرمز.", "Collect at the point and pay the rest there — or delivery to the farm, confirmed by code.")],
        ].map(([h, d]) => (
          <li key={h}>
            <p className="font-bold">{h}</p>
            <p className="mt-1 text-muted">{d}</p>
          </li>
        ))}
      </ol>

      <div className="mt-6">
        <NoMoneyHeld locale={locale} />
      </div>

      <h2 className="mt-8 text-lg font-bold">{t("الطلبات الجارية", "Current orders")}</h2>
      {notDeployed ? (
        <div className="mt-3">
          <ComingSoon />
        </div>
      ) : orders.length === 0 ? (
        <p className="mt-2 rounded-2xl border border-dashed border-border bg-card p-5 text-sm text-muted">
          {t("لا طلب جماعيّاً بعد. كن أوّل من يفتح واحداً لجمعيتك.", "No group order yet. Be the first to open one for your cooperative.")}
        </p>
      ) : (
        <ul className="mt-3 grid gap-3 sm:grid-cols-2">
          {orders.map((o) => {
            const pct = Math.min(100, (Number(o.pledged_tonnes) / Number(o.target_tonnes)) * 100);
            return (
              <li key={o.id}>
                <Link href={`/suppliers/orders/${o.id}`} className={`${card} flex h-full flex-col gap-1 hover:border-primary`}>
                  <span className="font-bold" {...typed}>
                    {o.title}
                  </span>
                  <span className="text-xs text-muted">
                    <bdi>{o.supplier_name}</bdi> → <bdi>{o.pickup_name}</bdi>، {stateName(o.pickup_state, locale)}
                  </span>
                  <span className="text-xs">
                    {t(`يوم التوصيل: ${dateLabel(o.drop_day, locale)}`, `Drop day: ${dateLabel(o.drop_day, locale)}`)} ·{" "}
                    <span className={o.status === "open" ? "text-primary" : "text-muted"}>{lbl(ORDER_STATUS[o.status], locale)}</span>
                  </span>
                  <span className="mt-2 h-2 overflow-hidden rounded-full bg-border" aria-hidden>
                    <span className="block h-full bg-primary" style={{ width: `${pct}%` }} />
                  </span>
                  <span className="figure text-xs text-muted">
                    {t(
                      `${num(o.pledged_tonnes, locale)} من ${num(o.target_tonnes, locale)} طن · ${num(o.members, locale, 0)} مزارع`,
                      `${num(o.pledged_tonnes, locale)} of ${num(o.target_tonnes, locale)} t · ${num(o.members, locale, 0)} farmers`,
                    )}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      <section className="mt-8 rounded-2xl border border-primary/40 bg-primary/5 p-4 sm:p-5">
        <h2 className="text-lg font-bold">{t("افتح طلباً جماعيّاً", "Open a group order")}</h2>
        {!user ? (
          <p className="mt-2 text-sm">
            <Link href="/login" className="font-medium text-primary underline">
              {t("سجّل الدخول", "Sign in")}
            </Link>{" "}
            {t("لتفتح طلباً لجمعيتك أو قسمك.", "to open an order for your cooperative or block.")}
          </p>
        ) : notDeployed ? (
          <p className="mt-2 text-sm text-muted">{t("يُفعَّل قريباً.", "Coming soon.")}</p>
        ) : suppliers.length === 0 ? (
          <p className="mt-2 text-sm text-muted">
            {t("لا مورد موثّقاً بعد يُفتح عليه طلب. ", "There is no verified supplier to order from yet. ")}
            <Link href="/suppliers/mine" className="text-primary underline">
              {t("دُلّ تاجرك على التسجيل", "Point your dealer to registration")}
            </Link>
          </p>
        ) : !chosen ? (
          <form method="get" className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-end">
            <label className="flex flex-1 flex-col gap-1 text-sm">
              {t("١) اختر المورد الموثّق", "1) Choose the verified supplier")}
              <select name="supplier" required defaultValue="" className={field}>
                <option value="" disabled>
                  {t("المورد", "Supplier")}
                </option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} — {stateName(s.state, locale)}
                  </option>
                ))}
              </select>
            </label>
            <button className={button}>{t("التالي", "Next")}</button>
          </form>
        ) : (
          <form action={createGroupOrder} className="mt-3 flex flex-col gap-3">
            <input type="hidden" name="supplier_id" value={chosen.id} />
            <p className="text-sm">
              {t("المورد:", "Supplier:")} <strong {...typed}>{chosen.name}</strong>{" "}
              <Link href="/suppliers/orders" className="text-xs text-primary underline">
                {t("غيّره", "change")}
              </Link>
            </p>
            <input name="title" required minLength={3} maxLength={100} className={field} placeholder={t("عنوان الطلب: يوريا قسم الحصاحيصا — موسم الشتاء", "Order title: Urea for Al-Hasaheisa block — winter season")} aria-label={t("العنوان", "Title")} />
            <div className="grid gap-3 sm:grid-cols-2">
              <input name="organiser_name" required minLength={2} maxLength={60} className={field} placeholder={t("اسمك أو اسم الجمعية", "Your name or the cooperative’s")} aria-label={t("المنظّم", "Organiser")} />
              <input name="organiser_phone" required inputMode="tel" className={field} placeholder={t("هاتفك (يراه المتعهّدون وحدهم)", "Your phone (only pledgers see it)")} aria-label={t("الهاتف", "Phone")} dir="ltr" />
            </div>

            <fieldset className="flex flex-col gap-3 rounded-xl border border-border p-3">
              <legend className="px-1 text-sm font-bold">{t("نقطة الاستلام", "Pickup point")}</legend>
              <input name="pickup_name" required minLength={3} maxLength={100} className={field} placeholder={t("الجمعية، أو مكتب القسم، أو مخزن تاجرٍ شريك", "The cooperative, the block office, or a partner dealer’s store")} aria-label={t("نقطة الاستلام", "Pickup point")} />
              <div className="grid gap-3 sm:grid-cols-2">
                <input name="pickup_locality" required minLength={2} maxLength={80} className={field} placeholder={t("المحلية أو القرية", "Locality or village")} aria-label={t("المحلية", "Locality")} />
                <select name="pickup_state" required defaultValue={chosen.state} className={field} aria-label={t("الولاية", "State")}>
                  {SUDAN_STATES.map((s) => (
                    <option key={s} value={s}>
                      {stateName(s, locale)}
                    </option>
                  ))}
                </select>
              </div>
              <GpsField prefix="pickup_" label={t("موقعها على الخريطة (اختياري — إن كنت فيها الآن)", "Its map location (optional — if you are there now)")} />
            </fieldset>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <label className="flex flex-col gap-1 text-sm">
                {t("آخر موعدٍ للانضمام", "Joining deadline")}
                <input name="deadline" type="date" required min={today()} defaultValue={inTwoWeeks} className={field} />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                {t("يوم التوصيل", "Drop day")}
                <input name="drop_day" type="date" required min={today()} defaultValue={inThreeWeeks} className={field} />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                {t("الحمولة المستهدفة (طن)", "Target load (t)")}
                <input name="target_tonnes" type="number" required min={0.5} max={1000} step="0.5" defaultValue={30} className={field} />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                {t("المقدّم ٪", "Deposit %")}
                <input name="deposit_pct" type="number" required min={0} max={50} step="1" defaultValue={10} className={field} />
              </label>
            </div>

            <fieldset className="flex flex-col gap-3 rounded-xl border border-border p-3">
              <legend className="px-1 text-sm font-bold">{t("أين يُدفع المقدّم؟", "Where is the deposit paid?")}</legend>
              <div className="flex flex-wrap gap-4 text-sm">
                <label className="flex items-center gap-1.5">
                  <input type="radio" name="payee" value="cooperative" defaultChecked className="size-4" /> {t("حساب الجمعية", "The cooperative’s account")}
                </label>
                <label className="flex items-center gap-1.5">
                  <input type="radio" name="payee" value="supplier" className="size-4" /> {t("حساب المورد", "The supplier’s account")}
                </label>
              </div>
              <input name="payee_account" required minLength={4} maxLength={200} className={field} placeholder={t("بنكك: رقم الحساب واسم صاحبه", "Bankak: account number and holder’s name")} aria-label={t("الحساب", "Account")} />
              <p className="text-xs text-muted">
                {t(
                  "يراه من تعهّد وحده. المال يذهب من المزارع إلى هذا الحساب مباشرةً — المنصّة لا تمسك شيئاً.",
                  "Only those who pledge see it. Money goes from the farmer straight to this account — the platform holds nothing.",
                )}
              </p>
            </fieldset>

            <fieldset className="flex flex-col gap-2 rounded-xl border border-border p-3">
              <legend className="px-1 text-sm font-bold">{t("الأصناف", "Items")}</legend>
              <p className="text-xs text-muted">
                {t("الوحدة كما تُسلَّم (جوال ٥٠ كجم)، ووزنها بالكيلو لتُحسب الحمولة، وسعرها بالدولار من المورد.", "The unit as handed over (50 kg sack), its weight in kg for the load, and the supplier’s dollar price.")}
              </p>
              {[
                ...chosenProducts.map((p) => ({
                  product: p.id,
                  name: p.name,
                  unit: `${num(p.pack_size, locale, 3)} ${lbl(PACK_UNIT_LABEL[p.pack_unit], locale)}`,
                  kg: unitKg(p),
                  price: Number(p.price_usd),
                })),
                ...Array.from({ length: blankRows }, () => ({ product: "", name: "", unit: "", kg: "" as number | "", price: "" as number | "" })),
              ].map((l, i) => (
                <div key={i} className="grid grid-cols-2 gap-2 border-t border-border pt-2 first:border-0 sm:grid-cols-[2fr_1fr_1fr_1fr]">
                  <input type="hidden" name="line_product" value={l.product} />
                  <input name="line_name" defaultValue={l.name} className={`${field} col-span-2 sm:col-span-1`} placeholder={t("الصنف", "Item")} aria-label={t("الصنف", "Item")} />
                  <input name="line_unit" defaultValue={l.unit} className={field} placeholder={t("الوحدة", "Unit")} aria-label={t("الوحدة", "Unit")} />
                  <input name="line_kg" type="number" min={0.001} step="any" defaultValue={l.kg} className={field} placeholder={t("كجم/وحدة", "kg/unit")} aria-label={t("وزن الوحدة بالكيلو", "Unit weight, kg")} />
                  <input name="line_price" type="number" min={0.01} step="0.01" defaultValue={l.price} className={field} placeholder="US$" aria-label={t("سعر الوحدة بالدولار", "Unit price, US$")} dir="ltr" />
                </div>
              ))}
            </fieldset>

            <textarea name="notes" maxLength={1000} rows={2} className={field} placeholder={t("ملاحظات (اختياري): ساعات الاستلام، ما يُحضره المزارع", "Notes (optional): pickup hours, what farmers should bring")} aria-label={t("ملاحظات", "Notes")} />
            <button className={`${button} self-start`}>{t("افتح الطلب", "Open the order")}</button>
          </form>
        )}
      </section>
    </SupplyShell>
  );
}
