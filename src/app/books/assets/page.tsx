import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { loginHrefHere } from "@/lib/loginHere";
import { getLocale } from "@/lib/locale";
import { tr } from "@/lib/i18n";
import ActionNotice from "@/components/ActionNotice";
import { formatMoney } from "@/lib/ledger/money";
import { ledgerToday } from "@/lib/ledger/today";
import { button, card, field, label } from "@/lib/ui";
import { addAsset, depreciateNow, disposeAsset } from "./actions";

/**
 * الأصول الثابتة (البند ١٩٠). A tractor, a pump, a well: what the farm owns for more than a season. Its purchase is booked
 * once, and its cost spread over its life month by month (straight line), so a season's profit carries its share of the
 * machine and not the whole price in the month it was bought. The daily bookkeeping books each month as it ends; the
 * button only does it now.
 */

type Asset = {
  id: string;
  name: string;
  account_key: "machinery" | "land_improvements";
  acquired_on: string;
  cost_minor: number;
  salvage_minor: number;
  life_months: number;
  months_posted: number;
  accumulated_minor: number;
  book_value_minor: number;
  disposed_on: string | null;
  proceeds_minor: number | null;
};

export default async function AssetsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(await loginHrefHere());
  const locale = await getLocale();
  const t = (ar: string, en: string) => tr(locale, ar, en);
  const usd = (minor: number) => formatMoney(BigInt(minor), "USD");

  const { data: book } = await supabase
    .from("ledger_books")
    .select("id")
    .eq("owner_id", user.id)
    .eq("kind", "farm")
    .maybeSingle();
  const { data } = book ? await supabase.rpc("ledger_fixed_assets_summary", { p_book: book.id }) : { data: null };
  const assets = (data ?? []) as Asset[];
  const kind = (k: Asset["account_key"]) => (k === "machinery" ? t("آلات ومعدّات", "Machinery and equipment") : t("تحسينات أرض", "Land improvements"));
  const total = (f: (a: Asset) => number) => assets.reduce((n, a) => n + Number(f(a)), 0);

  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      <Link href="/books" className="text-sm text-primary underline">← {t("دفتر الحسابات", "Books")}</Link>
      <h1 className="mt-3 text-2xl font-bold">{t("الأصول الثابتة", "Fixed assets")}</h1>
      <p className="mt-2 text-sm leading-7 text-muted">
        {t(
          "الجرّار والمضخّة والبئر والقناة: ما تملكه المزرعة لأكثر من موسم. يُقيَّد شراؤه مرّة، ثمّ يُوزَّع ثمنه على عمره شهراً بشهر (القسط الثابت)، فيحمل كلّ موسمٍ نصيبه من الآلة لا ثمنها كلّه في شهر شرائها. يُقيَّد الإهلاك وحده كلّ يوم لما انتهى من الأشهر.",
          "A tractor, a pump, a well, a canal: what the farm owns for more than a season. Its purchase is booked once, then its price is spread over its life month by month (straight line), so each season carries its share of the machine and not the whole price in the month it was bought. Depreciation is booked on its own each day for the months that have ended.",
        )}
      </p>
      <div className="mt-4">
        <ActionNotice ok={sp.ok} error={sp.error} />
      </div>

      {assets.length > 0 && (
        <section className="mt-2">
          <div className="overflow-x-auto rounded-xl border border-border">
            <table className="w-full text-sm">
              <thead className="bg-card text-start">
                <tr>
                  <th className="px-3 py-2">{t("الأصل", "Asset")}</th>
                  <th className="px-3 py-2">{t("الثمن", "Cost")}</th>
                  <th className="px-3 py-2">{t("الإهلاك المقيَّد", "Depreciation booked")}</th>
                  <th className="px-3 py-2">{t("القيمة الدفتريّة", "Book value")}</th>
                </tr>
              </thead>
              <tbody>
                {assets.map((a) => (
                  <tr key={a.id} className="border-t border-border">
                    <td className="px-3 py-2">
                      <div className="font-bold">{a.name}</div>
                      <div className="text-xs text-muted">
                        {kind(a.account_key)} · {a.acquired_on} ·{" "}
                        {t(`${a.months_posted} من ${a.life_months} شهراً`, `${a.months_posted} of ${a.life_months} months`)}
                        {Number(a.salvage_minor) > 0 && ` · ${t("خردة", "salvage")} ${usd(a.salvage_minor)}`}
                      </div>
                      {a.disposed_on ? (
                        <div className="mt-1 text-xs font-bold text-accent">
                          {Number(a.proceeds_minor) > 0
                            ? t(`بِيع في ${a.disposed_on} بـ${usd(Number(a.proceeds_minor))}`, `Sold on ${a.disposed_on} for ${usd(Number(a.proceeds_minor))}`)
                            : t(`استُبعد في ${a.disposed_on}`, `Written off on ${a.disposed_on}`)}
                        </div>
                      ) : (
                        <details className="mt-1 text-xs">
                          <summary className="cursor-pointer text-primary">{t("بيع أو استبعاد", "Sell or write off")}</summary>
                          <form action={disposeAsset} className="mt-2 flex flex-wrap items-end gap-2">
                            <input type="hidden" name="asset_id" value={a.id} />
                            <label className="flex flex-col gap-1">
                              {t("التاريخ", "Date")}
                              <input name="disposed_on" type="date" required min={a.acquired_on} max={ledgerToday()} defaultValue={ledgerToday()} className={field} />
                            </label>
                            <label className="flex flex-col gap-1">
                              {t("ما قُبض بالدولار (0 إن استُبعد)", "Received in dollars (0 if written off)")}
                              <input name="proceeds" inputMode="decimal" defaultValue="0" className={field} />
                            </label>
                            <label className="flex flex-col gap-1">
                              {t("قُبض في", "Received into")}
                              <select name="received_into" className={field} defaultValue="cash_on_hand">
                                <option value="cash_on_hand">{t("النقد", "Cash")}</option>
                                <option value="bank">{t("البنك", "Bank")}</option>
                                <option value="wallet">{t("محفظة إلكترونيّة", "Mobile wallet")}</option>
                              </select>
                            </label>
                            <button className="rounded-lg border border-border px-3 py-2 hover:bg-card">{t("قيّد", "Book it")}</button>
                          </form>
                        </details>
                      )}
                    </td>
                    <td className="px-3 py-2" dir="ltr">{usd(a.cost_minor)}</td>
                    <td className="px-3 py-2" dir="ltr">{usd(a.accumulated_minor)}</td>
                    <td className="px-3 py-2 font-bold" dir="ltr">{usd(a.book_value_minor)}</td>
                  </tr>
                ))}
                <tr className="border-t border-border bg-card font-bold">
                  <td className="px-3 py-2">{t("المجموع", "Total")}</td>
                  <td className="px-3 py-2" dir="ltr">{usd(total((a) => a.cost_minor))}</td>
                  <td className="px-3 py-2" dir="ltr">{usd(total((a) => a.accumulated_minor))}</td>
                  <td className="px-3 py-2" dir="ltr">{usd(total((a) => a.book_value_minor))}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <form action={depreciateNow} className="mt-3">
            <button className="rounded-lg border border-border px-3 py-2 text-sm hover:bg-card">
              {t("قيّد ما استحقّ من الإهلاك الآن", "Book the depreciation due now")}
            </button>
          </form>
        </section>
      )}

      <section className={`${card} mt-8`}>
        <h2 className="text-lg font-bold">{t("سجّل أصلاً", "Register an asset")}</h2>
        <form action={addAsset} className="mt-4 grid gap-4 sm:grid-cols-2">
          <label className={`${label} sm:col-span-2`}>
            {t("اسم الأصل", "Name")}
            <input name="name" required minLength={2} maxLength={120} className={field} placeholder={t("جرّار ماسي فيرغسون ٢٩٠", "Massey Ferguson 290 tractor")} />
          </label>
          <label className={label}>
            {t("النوع", "Kind")}
            <select name="account" className={field} defaultValue="machinery">
              <option value="machinery">{t("آلات ومعدّات", "Machinery and equipment")}</option>
              <option value="land_improvements">{t("تحسينات أرض (قناة، بئر، سور)", "Land improvements (canal, well, fence)")}</option>
            </select>
          </label>
          <label className={label}>
            {t("تاريخ الشراء", "Bought on")}
            <input name="acquired_on" type="date" required max={ledgerToday()} defaultValue={ledgerToday()} className={field} />
          </label>
          <label className={label}>
            {t("الثمن بالدولار", "Price in dollars")}
            <input name="cost" inputMode="decimal" required className={field} />
          </label>
          <label className={label}>
            {t("قيمته خردةً في آخر عمره (اختياري)", "Its scrap value at the end (optional)")}
            <input name="salvage" inputMode="decimal" className={field} placeholder="0" />
          </label>
          <label className={label}>
            {t("عمره بالسنوات", "Life in years")}
            <input name="life_years" inputMode="decimal" required className={field} defaultValue="5" />
          </label>
          <label className={label}>
            {t("دُفع ثمنه من", "Paid from")}
            <select name="paid_from" className={field} defaultValue="cash_on_hand">
              <option value="cash_on_hand">{t("النقد", "Cash")}</option>
              <option value="bank">{t("البنك", "Bank")}</option>
              <option value="wallet">{t("محفظة إلكترونيّة", "Mobile wallet")}</option>
              <option value="owner_capital">{t("كان عندي قبل الدفتر (رأس مال)", "I had it before the book (capital)")}</option>
            </select>
          </label>
          <p className="text-xs leading-6 text-muted sm:col-span-2">
            {t(
              "يُقيَّد الشراء الآن في دفتر مزرعتك، ويبدأ الإهلاك من الشهر التالي للشراء: (الثمن − الخردة) ÷ عدد الأشهر، كلّ شهرٍ بآخر يومٍ فيه. أعمارٌ شائعة: الجرّار ٨–١٠ سنوات، المضخّة ٥، البئر والقناة ١٥–٢٠.",
              "The purchase is booked now in your farm book, and depreciation starts the month after: (price − scrap) ÷ months, each month on its last day. Common lives: a tractor 8–10 years, a pump 5, a well or canal 15–20.",
            )}
          </p>
          <div className="sm:col-span-2">
            <button className={button}>{t("سجّل وقيّد الشراء", "Register and book the purchase")}</button>
          </div>
        </form>
      </section>
    </div>
  );
}
