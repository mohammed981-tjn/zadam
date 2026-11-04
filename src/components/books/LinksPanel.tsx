import { formatMoney } from "@/lib/ledger/money";
import { tr, type Locale } from "@/lib/i18n";
import {
  counterNeedsAccount,
  isReversed,
  LINK_KIND_LABEL,
  LINK_STATUS_LABEL,
  REVERSAL_LABEL,
  reversalAction,
  type LinkRow,
} from "@/lib/ledgerLinks";
import { button, field, ghost } from "@/lib/ui";
import {
  acceptReversal,
  cancelLink,
  confirmLink,
  rejectLink,
  rejectReversal,
  requestReversal,
  withdrawReversal,
} from "@/app/books/actions";

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
  // A partner asked to cancel an entry we both confirmed: nothing changes in either book until I agree.
  const reversalsForMe = rows.filter((r) => reversalAction(r) === "answer");
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

      {reversalsForMe.length > 0 && (
        <section>
          <h2 className="mb-3 text-lg font-bold">{t("طلبات إلغاءٍ تنتظر ردّك", "Cancellation requests waiting for your reply")}</h2>
          <ul className="space-y-3">
            {reversalsForMe.map((r) => (
              <li key={r.id} className="rounded-2xl border border-primary/40 bg-card p-4 text-sm">
                <Facts r={r} />
                <p className="mt-2 rounded-lg bg-background px-3 py-2 text-xs">
                  <span className="font-bold">{t("سبب الطلب:", "Reason given:")}</span> {r.reversal?.reason}
                </p>
                <p className="mt-2 text-xs text-muted">
                  {t(
                    "إن وافقتَ عُكس القيد في دفترك ودفتر شريكك معاً، ويبقى القيدان الأصليّان في السجلّ. وإن رفضتَ بقي كلّ شيءٍ كما هو.",
                    "If you agree, the entry is reversed in your book and your partner's together, and both original entries stay on record. If you refuse, everything stays as it is.",
                  )}
                </p>
                <div className="mt-3 flex flex-wrap items-end gap-3">
                  <form action={acceptReversal}>
                    <input type="hidden" name="reversal_id" value={r.reversal?.id} />
                    <input type="hidden" name="return_to" value={returnTo} />
                    <button type="submit" className={button}>{t("أوافق على إلغائه", "I agree to cancel it")}</button>
                  </form>
                  <form action={rejectReversal} className="flex flex-wrap items-end gap-2">
                    <input type="hidden" name="reversal_id" value={r.reversal?.id} />
                    <input type="hidden" name="return_to" value={returnTo} />
                    <label className="flex flex-col gap-1 text-xs">
                      {t("سبب الرفض", "Reason for refusing")}
                      <input name="reason" required minLength={3} maxLength={300} className={field} />
                    </label>
                    <button type="submit" className={ghost}>{t("أرفض", "Refuse")}</button>
                  </form>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

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
              <p className={`text-xs ${r.status === "confirmed" && !isReversed(r) ? "text-primary" : "text-muted"}`}>
                {isReversed(r) ? t("مؤكَّد ثمّ أُلغي باتّفاقكما — القيدان الأصليّان وقيدا العكس في دفترَيكما", "Confirmed, then cancelled by your agreement — the original entries and their reversals are in both books") : lbl(LINK_STATUS_LABEL[r.status])}
                {r.status === "rejected" && r.reject_reason && ` — ${r.reject_reason}`}
              </p>
              {r.status === "confirmed" && r.reversal && !isReversed(r) && (
                <p className="mt-1 text-xs text-muted">
                  {lbl(REVERSAL_LABEL[r.reversal.status])}
                  {r.reversal.status === "rejected" && r.reversal.reject_reason && ` — ${r.reversal.reject_reason}`}
                  {r.reversal.status === "pending" && ` — ${r.reversal.reason}`}
                </p>
              )}
              {reversalAction(r) === "request" && (
                <details className="mt-2">
                  <summary className="cursor-pointer text-xs text-primary underline">{t("أطلب إلغاء هذا القيد", "Ask to cancel this entry")}</summary>
                  <form action={requestReversal} className="mt-2 flex flex-wrap items-end gap-2">
                    <input type="hidden" name="link_id" value={r.id} />
                    <input type="hidden" name="return_to" value={returnTo} />
                    <label className="flex flex-col gap-1 text-xs">
                      {t("سبب الإلغاء (يراه شريكك)", "Why cancel it (your partner sees this)")}
                      <input name="reason" required minLength={3} maxLength={300} className={field} />
                    </label>
                    <button type="submit" className={ghost}>{t("أرسل الطلب", "Send the request")}</button>
                  </form>
                  <p className="mt-2 text-xs text-muted">
                    {t(
                      "لا يتغيّر شيء حتى يوافق شريكك. وإن وافق عُكس القيد في الدفترين؛ فإن كان قد بُني عليه قيدٌ آخر (تمويلٌ أُطفئ بنصيب حصادٍ مثلاً) فألغِ الأحدث أولاً.",
                      "Nothing changes until your partner agrees. If they do, the entry is reversed in both books; if another entry was built on it (financing settled by a harvest share, say), cancel the later one first.",
                    )}
                  </p>
                </details>
              )}
              {reversalAction(r) === "withdraw" && (
                <form action={withdrawReversal} className="mt-2">
                  <input type="hidden" name="reversal_id" value={r.reversal?.id} />
                  <input type="hidden" name="return_to" value={returnTo} />
                  <button type="submit" className={ghost}>{t("أسحب طلب الإلغاء", "Withdraw my request")}</button>
                </form>
              )}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
