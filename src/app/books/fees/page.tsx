import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getLocale } from "@/lib/locale";
import { tr } from "@/lib/i18n";
import ActionNotice from "@/components/ActionNotice";
import { formatMoney, isCurrency } from "@/lib/ledger/money";
import { FEE_LABEL, FEE_STATUS, type FeeKind } from "@/lib/ledger/platformBook";
import { button, card, field, label } from "@/lib/ui";
import { confirmFee, rejectFee } from "./actions";

/**
 * رسوم المنصّة عليّ (البند ١٨٩). The platform records a fee it was paid — outside the platform, which holds no money —
 * and nothing enters my book until I say it is right and where I paid it from; then it is booked in my book and the
 * platform's at once. If I did not pay it, I say so and nothing is booked.
 */

type Fee = {
  id: string;
  kind: FeeKind;
  status: string;
  payer_owner: string;
  payer_kind: "farm" | "investor";
  amount_minor: number;
  currency: string;
  fx_rate: number | null;
  entry_date: string;
  memo: string;
  payer_account: string | null;
  reject_reason: string | null;
  created_at: string;
};

export default async function FeesPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const locale = await getLocale();
  const t = (ar: string, en: string) => tr(locale, ar, en);
  const l = (x: { ar: string; en: string } | undefined) => (x ? t(x.ar, x.en) : "");

  const { data, error } = await supabase.rpc("ledger_fees_list");
  const fees = ((data ?? []) as Fee[]).filter((f) => f.payer_owner === user.id);
  const waiting = fees.filter((f) => f.status === "pending");
  const done = fees.filter((f) => f.status !== "pending");
  const amount = (f: Fee) => (isCurrency(f.currency) ? formatMoney(BigInt(f.amount_minor), f.currency) : String(f.amount_minor));
  const bookName = (k: Fee["payer_kind"]) => (k === "farm" ? t("دفتر المزرعة", "farm book") : t("دفتر المستثمر", "investor book"));

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <Link href="/books" className="text-sm text-primary underline">← {t("دفتر الحسابات", "Books")}</Link>
      <h1 className="mt-3 text-2xl font-bold">{t("رسوم المنصّة", "Platform fees")}</h1>
      <p className="mt-2 text-sm leading-7 text-muted">
        {t(
          "حين تدفع للمنصّة رسماً (معاينة أرض أو توثيق عقد أو خدمة) تسجّله الإدارة هنا. لا يدخل دفترك حتى تؤكّده وتختار من أين دفعت، فيُقيَّد في دفترك ودفتر المنصّة معاً بالمبلغ والسعر نفسيهما. وإن لم تدفعه فاعترض بسبب.",
          "When you pay the platform a fee (a land inspection, an agreement or a service), the administrators record it here. It does not enter your book until you confirm it and choose where you paid from; then it is booked in your book and the platform's together, at the same amount and rate. If you did not pay it, object with a reason.",
        )}
      </p>
      <div className="mt-4"><ActionNotice ok={sp.ok} error={sp.error} /></div>
      {error && (
        <p className="rounded-xl border border-danger/40 px-3 py-2 text-sm text-danger" role="alert">
          {t("تعذّر تحميل الرسوم الآن؛ أعد المحاولة بعد قليل.", "The fees could not be loaded just now; please try again shortly.")}
        </p>
      )}

      <h2 className="mt-6 text-lg font-bold">{t("تنتظر تأكيدك", "Waiting for you")}</h2>
      {waiting.length === 0 && <p className="mt-2 text-sm text-muted">{t("لا شيء ينتظرك.", "Nothing is waiting for you.")}</p>}
      <ul className="mt-3 space-y-3">
        {waiting.map((f) => (
          <li key={f.id} className={`${card} text-sm`}>
            <p className="font-bold">
              {l(FEE_LABEL[f.kind])} · <span className="figure">{amount(f)}</span>
            </p>
            <p className="mt-1 text-muted">
              {t("يوم الدفع", "Paid on")} {f.entry_date} · {t("في", "in your")} {bookName(f.payer_kind)}
              {f.memo && <> · <bdi>{f.memo}</bdi></>}
            </p>
            <form action={confirmFee} className="mt-3 flex flex-wrap items-end gap-2">
              <input type="hidden" name="fee_id" value={f.id} />
              <label className={label}>
                {t("دفعته من", "I paid it from")}
                <select name="account" required defaultValue="" className={field}>
                  <option value="" disabled>{t("اختر", "Choose")}</option>
                  <option value="cash">{t("النقد", "Cash")}</option>
                  <option value="bank">{t("البنك", "Bank")}</option>
                  <option value="wallet">{t("المحفظة (بنكك، MTN…)", "Wallet (Bankak, MTN…)")}</option>
                </select>
              </label>
              <button type="submit" className={button}>{t("صحيح، قيّده", "Correct — book it")}</button>
            </form>
            <details className="mt-3">
              <summary className="cursor-pointer text-danger">{t("لم أدفع هذا، أو المبلغ خطأ", "I did not pay this, or the amount is wrong")}</summary>
              <form action={rejectFee} className="mt-2 flex flex-col gap-2">
                <input type="hidden" name="fee_id" value={f.id} />
                <label className={label}>
                  {t("السبب (تراه الإدارة)", "Reason (the administrators see it)")}
                  <textarea name="reason" required minLength={3} maxLength={300} rows={2} className={field} />
                </label>
                <button type="submit" className="self-start rounded-lg border border-danger px-3 py-2 text-sm text-danger">{t("اعترض", "Object")}</button>
              </form>
            </details>
          </li>
        ))}
      </ul>

      {done.length > 0 && (
        <>
          <h2 className="mt-8 text-lg font-bold">{t("السابقة", "Earlier")}</h2>
          <ul className="mt-3 space-y-2 text-sm">
            {done.map((f) => (
              <li key={f.id} className="rounded-xl border border-border px-3 py-2">
                {l(FEE_LABEL[f.kind])} · <span className="figure">{amount(f)}</span> · {f.entry_date} · {l(FEE_STATUS[f.status])}
                {f.reject_reason && <span className="text-muted"> — <bdi>{f.reject_reason}</bdi></span>}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
