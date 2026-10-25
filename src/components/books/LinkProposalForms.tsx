import { formatMoney } from "@/lib/ledger/money";
import { tr, type Locale } from "@/lib/i18n";
import { outstandingFinancing, type LinkKind, type LinkRow } from "@/lib/ledgerLinks";
import { button, card, field, label } from "@/lib/ui";
import { proposeLink } from "@/app/books/actions";

/**
 * نماذج اقتراح القيد من صفحة العقد (البند ١٨٨ ج): المستثمر يقترح التمويل والأجرة، والمزارع يقترح نصيب الحصاد
 * والتسليم. The role and the agreement's model decide which forms are offered — the database refuses the
 * rest anyway (a lease has only rent; the investor does not propose the farmer's share).
 */

type Season = { id: string; name: string; status: string };

export default function LinkProposalForms({
  agreementId,
  role,
  model,
  seasons,
  links,
  today,
  locale,
}: {
  agreementId: string;
  role: "owner" | "investor";
  model: string;
  seasons: Season[];
  links: readonly LinkRow[];
  today: string;
  locale: Locale;
}) {
  const t = (ar: string, en: string) => tr(locale, ar, en);
  const lease = model === "lease";
  const returnTo = `/invest/agreements/${agreementId}`;

  const kinds: LinkKind[] = lease
    ? role === "investor"
      ? ["rent_payment"]
      : []
    : role === "investor"
      ? ["input_finance"]
      : ["harvest_share", "payout"];
  if (kinds.length === 0) return null;

  const title: Record<LinkKind, string> = {
    input_finance: t("سجّلتُ تمويل مدخلات للموسم", "I financed inputs for the season"),
    harvest_share: t("نصيب المستثمر من الحصاد", "The investor's share of the harvest"),
    payout: t("سلّمتُ المستثمر نصيبه", "I handed the investor his share"),
    rent_payment: t("دفعتُ أجرة الأرض", "I paid the land rent"),
  };

  // What each season still has financed and not yet settled by a share — in dollars at the booked rates — to guide the "settles" figure.
  const financed = (s: Season) => {
    const o = outstandingFinancing(links, s.id);
    return o > BigInt(0) ? formatMoney(o, "USD") : "";
  };

  const idem = (k: string) => `${k}-${globalThis.crypto.randomUUID()}`;

  const Common = ({ kind, withSeason, seasonRequired }: { kind: LinkKind; withSeason: boolean; seasonRequired: boolean }) => (
    <>
      <input type="hidden" name="agreement_id" value={agreementId} />
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="return_to" value={returnTo} />
      <input type="hidden" name="idem_key" value={idem(kind)} />
      {withSeason && (
        <label className={label}>
          {t("الموسم", "Season")}
          <select name="season" required={seasonRequired} className={field} defaultValue={seasons[0]?.id ?? ""}>
            {!seasonRequired && <option value="">{t("— بلا موسم —", "— no season —")}</option>}
            {seasons.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
                {kind === "harvest_share" && financed(s) ? ` — ${t("تمويل باقٍ", "financing left")}: ${financed(s)}` : ""}
              </option>
            ))}
          </select>
        </label>
      )}
      <div className="grid grid-cols-2 gap-3">
        <label className={label}>
          {t("المبلغ", "Amount")}
          <input name="amount" required inputMode="decimal" className={field} />
        </label>
        <label className={label}>
          {t("العملة", "Currency")}
          <select name="currency" className={field} defaultValue="USD">
            <option value="USD">{t("دولار", "US dollar")}</option>
            <option value="SDG">{t("جنيه", "Pound")}</option>
          </select>
        </label>
      </div>
    </>
  );

  const Tail = ({ account }: { account: boolean }) => (
    <>
      <div className="grid grid-cols-2 gap-3">
        <label className={label}>
          {t("التاريخ", "Date")}
          <input type="date" name="date" required defaultValue={today} max={today} className={field} />
        </label>
        {account ? (
          <label className={label}>
            {t("دُفع من", "Paid from")}
            <select name="account" className={field} defaultValue="bank">
              <option value="cash">{t("نقد", "Cash")}</option>
              <option value="bank">{t("بنك", "Bank")}</option>
              <option value="wallet">{t("محفظة", "Wallet")}</option>
            </select>
          </label>
        ) : (
          <span />
        )}
      </div>
      <label className={label}>
        {t("سعر الصرف (للجنيه فقط، اختياري)", "Exchange rate (pounds only, optional)")}
        <input name="rate" inputMode="decimal" className={field} placeholder={t("جنيه لكل دولار", "pounds per dollar")} />
      </label>
      <label className={label}>
        {t("ملاحظة", "Note")}
        <input name="memo" maxLength={200} className={field} />
      </label>
      <button type="submit" className={`${button} self-start`}>{t("أرسل الاقتراح", "Send the proposal")}</button>
    </>
  );

  return (
    <div className="mt-4 flex flex-col gap-4">
      {kinds.map((kind) => (
        <details key={kind} className="rounded-xl border border-border p-3">
          <summary className="cursor-pointer font-bold">{title[kind]}</summary>
          <form action={proposeLink} className="mt-3 flex flex-col gap-3">
            <Common kind={kind} withSeason={kind !== "rent_payment"} seasonRequired={kind === "input_finance" || kind === "harvest_share"} />
            {kind === "harvest_share" && (
              <label className={label}>
                {t("منه ما يُطفئ من التمويل (اتركه فارغاً إن لم يكن تمويل)", "Of which settles the financing (leave empty if none)")}
                <input name="principal" inputMode="decimal" className={field} />
              </label>
            )}
            <Tail account={kind !== "harvest_share"} />
          </form>
        </details>
      ))}
      <p className={`${card} text-xs text-muted`}>
        {t(
          "يصل شريكك إشعار فيؤكّد أو يعترض. لا يُقيَّد شيءٌ في دفترك ولا دفتره حتى يؤكّد.",
          "Your partner is notified and confirms or objects. Nothing is booked in your book or theirs until they confirm.",
        )}
      </p>
    </div>
  );
}
