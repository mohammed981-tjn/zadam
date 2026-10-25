import Link from "next/link";
import { currentFx } from "@/lib/livePrices";
import { createClient } from "@/lib/supabase/server";
import { getLocale } from "@/lib/locale";
import { tr, type Locale } from "@/lib/i18n";
import { nafirViewer } from "@/lib/nafirViewer";
import { stateName } from "@/lib/nafir";
import {
  DELIVERY_STATUS,
  ORDER_STATUS,
  PLEDGE_STATUS,
  dateLabel,
  isNotDeployed,
  lbl,
  num,
  sdg,
  today,
  usd,
  whatsappLink,
  type Carrier,
  type Delivery,
  type GroupOrderDetail,
  type GroupOrderLine,
  type Pledge,
} from "@/lib/supplyChain";
import SupplyShell, { ComingSoon, button, card, field, ghost } from "@/components/supply/SupplyShell";
import { NoMoneyHeld } from "@/components/supply/Explainers";
import { assignDelivery, markDeposit, pledge, setOrderStatus, setPledgeStatus, withdrawPledge } from "../../actions";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function generateMetadata() {
  const locale = await getLocale();
  return { title: tr(locale, "طلب جماعي | سوداقري", "Group order | Sudagri") };
}

export default async function GroupOrderPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const locale = await getLocale();
  const t = (ar: string, en: string) => tr(locale, ar, en);
  const typed = locale === "en" ? ({ lang: "ar", dir: "auto" } as const) : {};
  const { user, name } = await nafirViewer();
  const supabase = await createClient();
  const rate = (await currentFx())?.bank.sell ?? null;

  const { data, error } = UUID.test(id) ? await supabase.rpc("group_order_detail", { p_order: id }) : { data: null, error: null };
  const notDeployed = isNotDeployed(error);
  const o = ((data ?? []) as GroupOrderDetail[])[0] ?? null;

  if (!o) {
    return (
      <SupplyShell active="/suppliers/orders" ok={sp.ok} error={sp.error}>
        {notDeployed ? (
          <ComingSoon />
        ) : (
          <div className="rounded-2xl border border-dashed border-border bg-card px-5 py-8 text-center">
            <p className="font-bold">{t("لا طلب بهذا الرابط.", "No order at this link.")}</p>
            <Link href="/suppliers/orders" className="mt-3 inline-block text-primary underline">
              {t("الطلبات الجماعية ←", "Group orders →")}
            </Link>
          </div>
        )}
        <div className="mt-6">
          <NoMoneyHeld locale={locale} />
        </div>
      </SupplyShell>
    );
  }

  const [{ data: lRows }, { data: totals }] = await Promise.all([
    supabase.from("group_order_lines").select("*").eq("order_id", o.id).order("position"),
    supabase.rpc("group_order_line_totals", { p_order: o.id }),
  ]);
  const lines = (lRows ?? []) as GroupOrderLine[];
  const total = new Map(((totals ?? []) as { line_id: string; pledged_qty: number }[]).map((r) => [r.line_id, Number(r.pledged_qty)]));

  let pledges: Pledge[] = [];
  if (user) {
    const { data: p } = await supabase.from("group_order_pledges").select("*").eq("order_id", o.id).order("created_at");
    pledges = (p ?? []) as Pledge[];
  }
  const mine = pledges.filter((p) => p.user_id === user?.id);
  const isOrganiser = o.my_role === "organiser";

  let carriers: Carrier[] = [];
  let deliveries: Delivery[] = [];
  if (isOrganiser) {
    const [{ data: c }, { data: d }] = await Promise.all([
      supabase.from("carriers").select("*").not("verified_at", "is", null).eq("active", true).order("name"),
      supabase.from("deliveries").select("*").eq("order_id", o.id).order("created_at"),
    ]);
    carriers = (c ?? []) as Carrier[];
    deliveries = (d ?? []) as Delivery[];
  }

  const open = o.status === "open" && o.deadline >= today();
  const pct = Math.min(100, (Number(o.pledged_tonnes) / Number(o.target_tonnes)) * 100);
  const lineOf = new Map(lines.map((l) => [l.id, l]));
  const live = (p: Pledge) => p.status !== "withdrawn" && p.status !== "defaulted";
  const myValue = mine.filter(live).reduce((s, p) => s + Number(p.quantity) * Number(lineOf.get(p.line_id)?.unit_price_usd ?? 0), 0);
  const myDeposit = (myValue * Number(o.deposit_pct)) / 100;

  return (
    <SupplyShell active="/suppliers/orders" ok={sp.ok} error={sp.error}>
      <p className="text-sm">
        <Link href="/suppliers/orders" className="text-primary underline">
          {t("→ الطلبات الجماعية", "← Group orders")}
        </Link>
      </p>
      <h1 className="mt-2 text-2xl font-black" {...typed}>
        {o.title}
      </h1>
      <p className="mt-1 text-sm text-muted">
        {t("المورد:", "Supplier:")}{" "}
        <Link href={`/suppliers/${o.supplier_id}`} className="text-primary underline" {...typed}>
          {o.supplier_name}
        </Link>{" "}
        {o.organiser_name && (
          <>
            · {t("ينظّمه:", "Organised by:")} <bdi>{o.organiser_name}</bdi>{" "}
          </>
        )}
        · <span className={o.status === "open" ? "text-primary" : ""}>{lbl(ORDER_STATUS[o.status], locale)}</span>
      </p>

      <section className={`${card} mt-5`}>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-bold">{t("الحمولة حتى الآن", "The load so far")}</h2>
          <span className="figure text-sm">
            {t(
              `${num(o.pledged_tonnes, locale)} من ${num(o.target_tonnes, locale)} طن · ${num(o.members, locale, 0)} مزارع`,
              `${num(o.pledged_tonnes, locale)} of ${num(o.target_tonnes, locale)} t · ${num(o.members, locale, 0)} farmers`,
            )}
          </span>
        </div>
        <div className="mt-2 h-3 overflow-hidden rounded-full bg-border" role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}>
          <div className="h-full bg-primary" style={{ width: `${pct}%` }} />
        </div>
        <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-xs text-muted">{t("نقطة الاستلام", "Pickup point")}</dt>
            <dd>
              {o.pickup_name ? (
                <>
                  <bdi>{o.pickup_name}</bdi> —{" "}
                </>
              ) : null}
              <bdi>{o.pickup_locality}</bdi>، {stateName(o.pickup_state, locale)}
              {!o.pickup_name && (
                <span className="block text-xs text-muted">
                  {t("المكان الدقيق يظهر لمن انضمّ إلى الطلب.", "The exact place shows to those who have joined the order.")}
                </span>
              )}
              {o.pickup_lat !== null && o.pickup_lng !== null && (
                <>
                  {" · "}
                  <a href={`https://www.google.com/maps?q=${o.pickup_lat},${o.pickup_lng}`} target="_blank" rel="noopener noreferrer" className="text-primary underline">
                    {t("الخريطة", "Map")}
                  </a>
                </>
              )}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted">{t("يوم التوصيل", "Drop day")}</dt>
            <dd className="font-bold">{dateLabel(o.drop_day, locale)}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted">{t("آخر موعدٍ للانضمام", "Joining deadline")}</dt>
            <dd>{dateLabel(o.deadline, locale)}</dd>
          </div>
        </dl>
        {o.notes && (
          <p className="mt-3 text-sm" {...typed}>
            {o.notes}
          </p>
        )}
      </section>

      <h2 className="mt-8 text-lg font-bold">{t("الأصناف", "Items")}</h2>
      <ul className="mt-3 flex flex-col gap-3">
        {lines.map((l) => {
          const my = mine.find((p) => p.line_id === l.id);
          return (
            <li key={l.id} className={card}>
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="font-bold" {...typed}>
                  {l.name}
                </span>
                <span className="figure text-end">
                  <span className="font-bold">{usd(l.unit_price_usd, locale)}</span>
                  <span className="text-xs text-muted"> / <bdi>{l.unit_label}</bdi></span>
                  {rate && <span className="block text-xs text-muted">≈ {sdg(Number(l.unit_price_usd) * rate, locale)}</span>}
                </span>
              </div>
              <p className="figure mt-1 text-xs text-muted">
                {t(`تعهّد الأعضاء حتى الآن: ${num(total.get(l.id) ?? 0, locale)} وحدة`, `Pledged so far: ${num(total.get(l.id) ?? 0, locale)} units`)}
              </p>
              {my && (
                <p className="mt-2 text-sm">
                  {t("تعهّدك:", "Your pledge:")} <strong className="figure">{num(my.quantity, locale)}</strong> — {lbl(PLEDGE_STATUS[my.status], locale)}
                </p>
              )}
              {user && open && (!my || my.status === "pledged" || my.status === "withdrawn") && (
                <form action={pledge} className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-[1fr_1fr_1fr_auto] sm:items-end">
                  <input type="hidden" name="order_id" value={o.id} />
                  <input type="hidden" name="line_id" value={l.id} />
                  <label className="flex flex-col gap-1 text-xs">
                    {t("الكميّة (وحدات)", "Quantity (units)")}
                    <input name="quantity" type="number" required min={1} step="any" defaultValue={my && my.status !== "withdrawn" ? my.quantity : undefined} className={field} />
                  </label>
                  <label className="flex flex-col gap-1 text-xs">
                    {t("اسمك كما يراه المنظّم", "Your name for the organiser")}
                    <input name="display_name" required minLength={2} maxLength={60} defaultValue={my?.display_name ?? name} className={field} />
                  </label>
                  <label className="col-span-2 flex flex-col gap-1 text-xs sm:col-span-1">
                    {t("هاتفك (للمنظّم وحده)", "Your phone (organiser only)")}
                    <input name="phone" inputMode="tel" defaultValue={my?.phone ?? ""} className={field} dir="ltr" />
                  </label>
                  <button className={`${button} col-span-2 sm:col-span-1`}>{my && my.status === "pledged" ? t("عدّل", "Update") : t("تعهّد", "Pledge")}</button>
                </form>
              )}
              {my && my.status === "pledged" && (
                <form action={withdrawPledge} className="mt-2">
                  <input type="hidden" name="order_id" value={o.id} />
                  <input type="hidden" name="pledge_id" value={my.id} />
                  <button className="text-xs text-danger underline">{t("انسحب من هذا الصنف", "Withdraw from this item")}</button>
                </form>
              )}
            </li>
          );
        })}
      </ul>

      {!user && open && (
        <p className={`${card} mt-4 text-sm`}>
          <Link href="/login" className="font-medium text-primary underline">
            {t("سجّل الدخول", "Sign in")}
          </Link>{" "}
          {t("لتتعهّد بكميّتك.", "to pledge your quantity.")}
        </p>
      )}

      {mine.some(live) && (
        <section className="mt-6 rounded-2xl border-2 border-primary/50 bg-primary/5 p-4 sm:p-5">
          <h2 className="font-bold">{t("مقدّمك وكيف تدفعه", "Your deposit and how to pay it")}</h2>
          <p className="figure mt-2 text-sm">
            {t(
              `قيمة تعهّدك ${usd(myValue, locale)}، والمقدّم ${num(o.deposit_pct, locale)}٪ = `,
              `Your pledge is worth ${usd(myValue, locale)}; the ${num(o.deposit_pct, locale)}% deposit = `,
            )}
            <strong>{usd(myDeposit, locale)}</strong>
            {rate && <> (≈ {sdg(myDeposit * rate, locale)})</>}
          </p>
          <p className="mt-2 text-sm">
            {o.payee === "supplier" ? t("حوّله مباشرةً إلى حساب المورد:", "Transfer it directly to the supplier’s account:") : t("حوّله مباشرةً إلى حساب الجمعية:", "Transfer it directly to the cooperative’s account:")}
          </p>
          <p className="mt-1 rounded-lg bg-card px-3 py-2 font-medium" {...typed}>
            {o.payee_account}
          </p>
          <p className="mt-2 text-sm">
            {t("ثمّ أرسل رقم التحويل إلى المنظّم", "Then send the transfer reference to the organiser")}
            {o.organiser_phone && (
              <>
                {": "}
                <a href={`tel:${o.organiser_phone}`} className="figure text-primary underline">
                  {o.organiser_phone}
                </a>
                {" · "}
                <a href={whatsappLink(o.organiser_phone)} target="_blank" rel="noopener noreferrer" className="text-primary underline">
                  {t("واتساب", "WhatsApp")}
                </a>
              </>
            )}
            {t("، والباقي تدفعه عند الاستلام.", ", and pay the rest at pickup.")}
          </p>
          <p className="mt-2 text-xs text-muted">{t("سوداقري لا تستلم أيّ مبلغ. لا تحوّل لأيّ حسابٍ غير المكتوب هنا.", "Sudagri never receives any money. Do not transfer to any account other than the one written here.")}</p>
        </section>
      )}

      {isOrganiser && <OrganiserPanel locale={locale} order={o} pledges={pledges} lines={lineOf} carriers={carriers} deliveries={deliveries} />}

      <div className="mt-8">
        <NoMoneyHeld locale={locale} />
      </div>
    </SupplyShell>
  );
}

function OrganiserPanel({
  locale,
  order,
  pledges,
  lines,
  carriers,
  deliveries,
}: {
  locale: Locale;
  order: GroupOrderDetail;
  pledges: Pledge[];
  lines: Map<string, GroupOrderLine>;
  carriers: Carrier[];
  deliveries: Delivery[];
}) {
  const t = (ar: string, en: string) => tr(locale, ar, en);
  const typed = locale === "en" ? ({ lang: "ar", dir: "auto" } as const) : {};
  const deliveryFor = new Map(deliveries.filter((d) => d.pledge_id && d.status !== "cancelled").map((d) => [d.pledge_id!, d]));
  const statusMoves: Record<string, string[]> = { open: ["closed", "cancelled"], closed: ["open", "delivered", "cancelled"] };
  const moveLabel: Record<string, [string, string]> = {
    closed: ["أغلق الانضمام", "Close joining"],
    open: ["أعد فتح الانضمام", "Reopen joining"],
    delivered: ["سُلّمت الحمولة", "Load delivered"],
    cancelled: ["ألغِ الطلب", "Cancel the order"],
  };

  return (
    <section className="mt-8 rounded-2xl border border-accent/60 bg-accent/5 p-4 sm:p-5">
      <h2 className="text-lg font-bold">{t("لوحة المنظّم", "Organiser’s panel")}</h2>
      <p className="mt-1 text-xs text-muted">
        {t(
          "سجّل المقدّم حين يصلك رقم التحويل وتتأكّد منه في كشف الحساب. وإن تعثّر عضوٌ فعلّمه متعثّراً: يخرج تعهّده وحده من الحمولة، ولا يتغيّر شيءٌ لغيره.",
          "Record a deposit once you receive the transfer reference and see it in the account statement. If a member defaults, mark them so: only their pledge leaves the load, nothing changes for anyone else.",
        )}
      </p>

      <div className="mt-3 flex flex-wrap gap-2">
        {(statusMoves[order.status] ?? []).map((s) => (
          <form key={s} action={setOrderStatus}>
            <input type="hidden" name="order_id" value={order.id} />
            <input type="hidden" name="status" value={s} />
            <button className={s === "cancelled" ? "rounded-xl border border-danger/50 px-4 py-2 text-sm text-danger" : ghost}>{t(...moveLabel[s])}</button>
          </form>
        ))}
      </div>

      <h3 className="mt-5 font-bold">{t(`التعهّدات (${pledges.length})`, `Pledges (${pledges.length})`)}</h3>
      {pledges.length === 0 ? (
        <p className="mt-2 text-sm text-muted">{t("لا تعهّد بعد. أرسل رابط هذه الصفحة لأعضاء الجمعية.", "No pledges yet. Send this page’s link to the cooperative’s members.")}</p>
      ) : (
        <ul className="mt-2 flex flex-col gap-3">
          {pledges.map((p) => {
            const l = lines.get(p.line_id);
            const value = Number(p.quantity) * Number(l?.unit_price_usd ?? 0);
            const d = deliveryFor.get(p.id);
            return (
              <li key={p.id} className="rounded-xl border border-border bg-card p-3 text-sm">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="font-medium" {...typed}>
                    {p.display_name}
                  </span>
                  <span className={`text-xs ${p.status === "defaulted" ? "text-danger" : p.status === "pledged" ? "text-accent" : "text-primary"}`}>{lbl(PLEDGE_STATUS[p.status], locale)}</span>
                </div>
                <p className="figure text-xs text-muted">
                  <bdi>{l?.name}</bdi> × {num(p.quantity, locale)} = {usd(value, locale)} · {t("المقدّم", "deposit")} {usd((value * Number(order.deposit_pct)) / 100, locale)}
                  {p.phone && (
                    <>
                      {" · "}
                      <a href={`tel:${p.phone}`} className="text-primary underline">
                        {p.phone}
                      </a>
                    </>
                  )}
                </p>
                {p.deposit_ref && (
                  <p className="text-xs">
                    {t("رقم التحويل:", "Transfer ref.:")} <bdi className="figure">{p.deposit_ref}</bdi>
                  </p>
                )}
                {p.status_note && <p className="text-xs text-muted">{p.status_note}</p>}
                <div className="mt-2 flex flex-wrap gap-2">
                  {p.status === "pledged" && (
                    <form action={markDeposit} className="flex flex-wrap gap-2">
                      <input type="hidden" name="order_id" value={order.id} />
                      <input type="hidden" name="pledge_id" value={p.id} />
                      <input name="reference" required minLength={4} maxLength={60} className="w-40 rounded-lg border border-border bg-background px-2 py-1.5 text-sm" placeholder={t("رقم التحويل", "Transfer ref.")} dir="ltr" />
                      <button className="rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground">{t("استُلم المقدّم", "Deposit received")}</button>
                    </form>
                  )}
                  {(p.status === "pledged" || p.status === "deposit_received") && (
                    <>
                      <PledgeButton orderId={order.id} pledgeId={p.id} status="collected" label={t("استلم بضاعته", "Collected")} />
                      <PledgeButton orderId={order.id} pledgeId={p.id} status="defaulted" label={t("متعثّر", "Defaulted")} danger />
                    </>
                  )}
                  {(p.status === "defaulted" || p.status === "collected") && <PledgeButton orderId={order.id} pledgeId={p.id} status="pledged" label={t("أعده متعهّداً", "Restore pledge")} />}
                </div>
                {d ? (
                  <p className="mt-2 text-xs">
                    {t("التوصيل إلى الأرض:", "Farm delivery:")} {lbl(DELIVERY_STATUS[d.status], locale)} —{" "}
                    <Link href="/suppliers/deliveries" className="text-primary underline">
                      {t("التفاصيل", "details")}
                    </Link>
                  </p>
                ) : (
                  (p.status === "pledged" || p.status === "deposit_received") &&
                  carriers.length > 0 && (
                    <details className="mt-2 text-xs">
                      <summary className="cursor-pointer text-primary">{t("أسند توصيلاً إلى أرضه", "Assign delivery to their farm")}</summary>
                      <AssignForm orderId={order.id} pledgeId={p.id} carriers={carriers} locale={locale} />
                    </details>
                  )
                )}
              </li>
            );
          })}
        </ul>
      )}

      <h3 className="mt-6 font-bold">{t("الشاحنة إلى نقطة الاستلام", "The truck to the pickup point")}</h3>
      {deliveries.filter((d) => d.kind === "to_pickup" && d.status !== "cancelled").map((d) => (
        <p key={d.id} className="mt-1 text-sm">
          <bdi>{d.destination}</bdi> — {lbl(DELIVERY_STATUS[d.status], locale)}{" "}
          <Link href="/suppliers/deliveries" className="text-primary underline">
            {t("رمز الاستلام والتفاصيل", "Handover code and details")}
          </Link>
        </p>
      ))}
      {carriers.length === 0 ? (
        <p className="mt-1 text-sm text-muted">
          {t("لا ناقل موثّقاً بعد. ", "No verified carrier yet. ")}
          <Link href="/suppliers/deliveries" className="text-primary underline">
            {t("يسجّل الناقلون من هنا", "Carriers register here")}
          </Link>
        </p>
      ) : (
        <details className="mt-2 text-sm">
          <summary className="cursor-pointer text-primary">{t("أسند الحمولة إلى ناقل", "Assign the load to a carrier")}</summary>
          <AssignForm orderId={order.id} carriers={carriers} locale={locale} defaultDestination={`${order.pickup_name} — ${order.pickup_locality}`} />
        </details>
      )}
      <p className="mt-2 text-xs text-muted">
        {t(
          "يُعلَّم التوصيل «مستحقّ الدفع» للناقل حين يُدخل رمز المستلم مع صورةٍ وموقع. الدفع للناقل منك أو من المورد، خارج المنصّة.",
          "A delivery is marked “payable” to the carrier when they enter the recipient’s code with a photo and location. You or the supplier pay the carrier, outside the platform.",
        )}
      </p>
    </section>
  );
}

function PledgeButton({ orderId, pledgeId, status, label, danger }: { orderId: string; pledgeId: string; status: string; label: string; danger?: boolean }) {
  return (
    <form action={setPledgeStatus}>
      <input type="hidden" name="order_id" value={orderId} />
      <input type="hidden" name="pledge_id" value={pledgeId} />
      <input type="hidden" name="status" value={status} />
      <button className={`rounded-lg border px-3 py-1.5 text-xs ${danger ? "border-danger/50 text-danger" : "border-border"}`}>{label}</button>
    </form>
  );
}

function AssignForm({
  orderId,
  pledgeId,
  carriers,
  locale,
  defaultDestination,
}: {
  orderId: string;
  pledgeId?: string;
  carriers: Carrier[];
  locale: Locale;
  defaultDestination?: string;
}) {
  const t = (ar: string, en: string) => tr(locale, ar, en);
  return (
    <form action={assignDelivery} className="mt-2 grid gap-2 sm:grid-cols-2">
      <input type="hidden" name="order_id" value={orderId} />
      {pledgeId && <input type="hidden" name="pledge_id" value={pledgeId} />}
      <select name="carrier_id" required defaultValue="" className="rounded-lg border border-border bg-background px-2 py-2 text-sm" aria-label={t("الناقل", "Carrier")}>
        <option value="" disabled>
          {t("الناقل الموثّق", "Verified carrier")}
        </option>
        {carriers.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name} — {c.vehicle} ({num(c.capacity_tonnes, locale)} {t("طن", "t")})
          </option>
        ))}
      </select>
      <input name="destination" required minLength={3} maxLength={200} defaultValue={defaultDestination} className="rounded-lg border border-border bg-background px-2 py-2 text-sm" placeholder={t("إلى أين: الحواشة، القرية، العلامة", "Where to: plot, village, landmark")} aria-label={t("الوجهة", "Destination")} />
      <input name="fee_usd" type="number" min={0} step="0.01" className="rounded-lg border border-border bg-background px-2 py-2 text-sm" placeholder={t("أجرة الناقل بالدولار (اختياري)", "Carrier fee, US$ (optional)")} aria-label={t("الأجرة", "Fee")} dir="ltr" />
      <button className="rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground">{t("أسند", "Assign")}</button>
    </form>
  );
}
