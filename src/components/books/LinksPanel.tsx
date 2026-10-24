import { formatMoney } from "@/lib/ledger/money";
import { tr, type Locale } from "@/lib/i18n";
import {
  counterNeedsAccount,
  LINK_KIND_LABEL,
  LINK_STATUS_LABEL,
  type LinkRow,
} from "@/lib/ledgerLinks";
import { button, field, ghost } from "@/lib/ui";
import { cancelLink, confirmLink, rejectLink } from "@/app/books/actions";

/**
 * اقتراحات القيود بين الشريكين (البند ١٨٨ ج): ما ينتظر تأكيدي، وما اقترحتُه وينتظر، وما بُتّ فيه.
 * Nothing on this page books anything by being looked at: a proposal enters a book only when the person it is
 * addressed to confirms it, and the page says so.
 */
export default function LinksPanel({ rows, locale, returnTo }: { rows: readonly LinkRow[]; locale: Locale; returnTo: string }) {
  const t = (ar: string, en: string) => tr(locale, ar, en);
  const lbl = (b: { ar: string; en: string }) => tr(locale, b.ar, b.en);
  const waitingForMe = rows.filter((r) => r.status === "pending" && !r.mine);
  const waitingForThem = rows.filter((r) => r.status === "pending" && r.mine);
  const decided = rows.filter((r) => r.status !== "pending");
  const amount = (r: LinkRow, minor = r.amount_minor) => formatMoney(BigInt(Math.round(minor)), r.currency, true);

  const Facts = ({ r }: { r: LinkRow }) => (
    <>
      <p className="font-bold">
        {lbl(LINK_KIND_LABEL[r.kind])} · {amount(r)}
        {r.kind === "harvest_share" && r.principal_minor > 0 && (
          <span className="font-normal text-muted"> · {t(`يُطفئ من التمويل ${amount(r, r.principal_minor)}`, `settles ${amount(r, r.principal_minor)} of the financing`)}</span>
        )}
      </p>
      <p className="text-xs text-muted">
        {r.other_name} · {r.entry_date}
        {r.agreement_ref && ` · ${r.agreement_ref}`}
        {r.memo && ` · ${r.memo}`}
      </p>
    </>
  );

  return (
    <div className="space-y-8">
      <p className="rounded-xl border border-border bg-card px-3 py-2 text-xs text-muted">
        {t(
          "اقتراح القيد لا يدخل أيّ دفتر حتى يؤكّده الطرف الآخر؛ وعند التأكيد يُقيَّد في دفترَيكما معاً بالمبلغ والتاريخ والسعر نفسه. والمنصّة لا تلمس المال: هي تسجّل ما أقررتما به.",
          "A proposed entry enters no book until the other party confirms it; on confirmation it is booked in both your books with the same amount, date and rate. The platform never touches the money — it records what you both agreed happened.",
        )}
      </p>

      <section>
        <h2 className="mb-3 text-lg font-bold">{t("تنتظر تأكيدك", "Waiting for your confirmation")}</h2>
        {waitingForMe.length === 0 && <p className="text-sm text-muted">{t("لا شيء ينتظرك.", "Nothing is waiting for you.")}</p>}
        <ul className="space-y-3">
          {waitingForMe.map((r) => (
            <li key={r.id} className="rounded-2xl border border-primary/40 bg-card p-4 text-sm">
              <Facts r={r} />
              <div className="mt-3 flex flex-wrap items-end gap-3">
                <form action={confirmLink} className="flex flex-wrap items-end gap-2">
                  <input type="hidden" name="link_id" value={r.id} />
                  <input type="hidden" name="return_to" value={returnTo} />
                  {counterNeedsAccount(r.kind) && (
                    <label className="flex flex-col gap-1 text-xs">
                      {t("استلمتُ في", "Received into")}
                      <select name="account" className={field} defaultValue="cash">
                        <option value="cash">{t("نقد", "Cash")}</option>
                        <option value="bank">{t("بنك", "Bank")}</option>
                        <option value="wallet">{t("محفظة", "Wallet")}</option>
                      </select>
                    </label>
                  )}
                  <button type="submit" className={button}>{t("أؤكّد أنّ هذا حدث", "I confirm this happened")}</button>
                </form>
                <form action={rejectLink} className="flex flex-wrap items-end gap-2">
                  <input type="hidden" name="link_id" value={r.id} />
                  <input type="hidden" name="return_to" value={returnTo} />
                  <label className="flex flex-col gap-1 text-xs">
                    {t("سبب الاعتراض", "Reason for objecting")}
                    <input name="reason" required minLength={3} maxLength={300} className={field} />
                  </label>
                  <button type="submit" className={ghost}>{t("أعترض", "Object")}</button>
                </form>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2 className="mb-3 text-lg font-bold">{t("اقترحتَها وتنتظر ردّ شريكك", "You proposed these; waiting for your partner")}</h2>
        {waitingForThem.length === 0 && <p className="text-sm text-muted">{t("لا شيء معلّق.", "Nothing pending.")}</p>}
        <ul className="space-y-3">
          {waitingForThem.map((r) => (
            <li key={r.id} className="rounded-2xl border border-border bg-card p-4 text-sm">
              <Facts r={r} />
              <form action={cancelLink} className="mt-3">
                <input type="hidden" name="link_id" value={r.id} />
                <input type="hidden" name="return_to" value={returnTo} />
                <button type="submit" className={ghost}>{t("ألغِ الاقتراح", "Cancel the proposal")}</button>
              </form>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2 className="mb-3 text-lg font-bold">{t("ما بُتّ فيه", "Decided")}</h2>
        {decided.length === 0 && <p className="text-sm text-muted">{t("لا شيء بعد.", "Nothing yet.")}</p>}
        <ul className="space-y-2">
          {decided.map((r) => (
            <li key={r.id} className="rounded-xl border border-border px-3 py-2 text-sm">
              <Facts r={r} />
              <p className={`text-xs ${r.status === "confirmed" ? "text-primary" : "text-muted"}`}>
                {lbl(LINK_STATUS_LABEL[r.status])}
                {r.status === "rejected" && r.reject_reason && ` — ${r.reject_reason}`}
              </p>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
