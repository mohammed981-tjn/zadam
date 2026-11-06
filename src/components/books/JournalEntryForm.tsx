"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import EvidenceUpload from "@/components/EvidenceUpload";
import { useLocale } from "@/components/LocaleProvider";
import { tr } from "@/lib/i18n";
import { formatMoney } from "@/lib/ledger/money";
import {
  accountName,
  choicesFor,
  entryErrorMessage,
  fillTemplate,
  parseEntry,
  postableAccounts,
  runningTotals,
  type ChartAccount,
  type EntryTemplate,
  type LineInput,
  type Side,
} from "@/lib/ledger/journal";
import type { WriteResult } from "@/lib/ledger/journalWrites";
import { submitEntry } from "@/app/books/journal/actions";
import { button, field, ghost } from "@/lib/ui";

/**
 * قيد اليوميّة اليدويّ (البند ٢٠٥): سطورٌ مدينة ودائنة من شجرة حسابات الدفتر، ببيانٍ وتاريخٍ ومستند.
 *
 * A ready entry fills the lines (and limits each to the accounts it allows); the person may then change anything. The
 * running totals say whether it balances before it is sent; the database decides (lib/ledger/journalWrites). A refused
 * entry keeps everything typed.
 */

const TYPE_ORDER = ["asset", "liability", "equity", "revenue", "expense"] as const;
const TYPE_LABEL: Record<string, { ar: string; en: string }> = {
  asset: { ar: "الأصول", en: "Assets" },
  liability: { ar: "الالتزامات", en: "Liabilities" },
  equity: { ar: "حقوق الملكيّة", en: "Equity" },
  revenue: { ar: "الإيرادات", en: "Revenue" },
  expense: { ar: "المصروفات", en: "Expenses" },
};

const newKey = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`);
const blankLines = (): LineInput[] => [
  { account: "", side: "D", amount: "" },
  { account: "", side: "C", amount: "" },
];

export default function JournalEntryForm({
  bookId,
  chart,
  templates,
  today,
  initialTemplate,
  preparer,
}: {
  bookId: string;
  chart: ChartAccount[];
  templates: EntryTemplate[];
  today: string;
  initialTemplate?: string | null;
  /** The reader prepares for another's book: what he sends waits for its owner. */
  preparer: boolean;
}) {
  const locale = useLocale();
  const t = (ar: string, en: string) => tr(locale, ar, en);
  const router = useRouter();
  const usable = useMemo(() => postableAccounts(chart), [chart]);

  const start = templates.find((x) => x.key === initialTemplate) ?? null;
  const [template, setTemplate] = useState<EntryTemplate | null>(start);
  const [lines, setLines] = useState<LineInput[]>(() => (start && fillTemplate(start, chart)) || blankLines());
  const [date, setDate] = useState(today);
  const [memo, setMemo] = useState(start ? tr(locale, start.name_ar, start.name_en) : "");
  const [currency, setCurrency] = useState<"USD" | "SDG">("USD");
  const [rate, setRate] = useState("");
  const [adjusting, setAdjusting] = useState(start?.grp === "adjusting");
  const [doc, setDoc] = useState<string | null>(null);
  const [key, setKey] = useState(newKey);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<WriteResult | null>(null);

  const totals = runningTotals(lines, currency);
  const fmt = (m: bigint) => formatMoney(m, currency);
  const balanced = totals.debit === totals.credit && totals.debit > BigInt(0);

  function pick(tpl: EntryTemplate | null) {
    setResult(null);
    setTemplate(tpl);
    if (!tpl) {
      setLines(blankLines());
      setAdjusting(false);
      return;
    }
    const amount = lines.find((l) => l.amount.trim())?.amount ?? "";
    const filled = fillTemplate(tpl, chart, amount);
    if (!filled) {
      setResult({ ok: false, message: t("في دفترك حسابٌ ينقص هذا القيد الجاهز؛ اكتبه يدويّاً.", "Your book lacks an account this ready entry needs; write it by hand.") });
      return;
    }
    setLines(filled);
    setMemo(t(tpl.name_ar, tpl.name_en));
    setAdjusting(tpl.grp === "adjusting");
  }

  const setLine = (i: number, patch: Partial<LineInput>) =>
    setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));

  /** With a ready entry the one amount goes on every line. */
  const setAmount = (i: number, amount: string) =>
    template ? setLines((ls) => ls.map((l) => ({ ...l, amount }))) : setLine(i, { amount });

  async function send() {
    setResult(null);
    const parsed = parseEntry({ date, memo, currency, rate, lines }, chart);
    if (!parsed.ok) {
      setResult({ ok: false, message: entryErrorMessage(parsed.error, t, fmt) });
      return;
    }
    setBusy(true);
    try {
      const r = await submitEntry({
        book: bookId,
        key,
        date,
        memo,
        currency,
        rate,
        lines,
        template: template?.key ?? null,
        kind: adjusting ? "adjusting" : "manual",
        document: doc,
      });
      setResult(r);
      if (r.ok) {
        setKey(newKey());
        setLines(template ? (fillTemplate(template, chart) ?? blankLines()) : blankLines());
        setDoc(null);
        setRate("");
        router.refresh();
      }
    } catch {
      setResult({ ok: false, message: t("تعذّر الإرسال. تحقّق من الشبكة وأعد المحاولة.", "Could not send. Check the connection and try again.") });
    } finally {
      setBusy(false);
    }
  }

  const accountSelect = (i: number, l: LineInput) => {
    const tplLine = template?.lines[i];
    const allowed = tplLine?.choose ? choicesFor(chart, tplLine.choose) : null;
    const options = allowed && allowed.length > 0 ? allowed : usable;
    return (
      <select
        aria-label={t(`حساب السطر ${i + 1}`, `Account of line ${i + 1}`)}
        className={field}
        value={l.account}
        disabled={!!template && !tplLine?.choose}
        onChange={(e) => setLine(i, { account: e.target.value })}
      >
        <option value="">{t("اختر الحساب", "Choose the account")}</option>
        {TYPE_ORDER.map((type) => {
          const group = options.filter((a) => a.type === type);
          if (group.length === 0) return null;
          return (
            <optgroup key={type} label={t(TYPE_LABEL[type].ar, TYPE_LABEL[type].en)}>
              {group.map((a) => (
                <option key={a.code} value={a.code}>
                  {a.code} — {accountName(a, locale)}
                </option>
              ))}
            </optgroup>
          );
        })}
      </select>
    );
  };

  const daily = templates.filter((x) => x.grp === "daily");
  const adjustingTemplates = templates.filter((x) => x.grp === "adjusting");

  return (
    <div className="mt-6 space-y-6">
      <section>
        <h2 className="text-sm font-bold">{t("قيودٌ جاهزة", "Ready entries")}</h2>
        <p className="mt-1 text-xs text-muted">{t("نقرةٌ تملأ السطور، ثمّ اكتب المبلغ والبيان.", "One tap fills the lines; then write the amount and the description.")}</p>
        <div className="mt-2 flex flex-wrap gap-2">
          <button type="button" onClick={() => pick(null)} className={`rounded-full border px-3 py-1.5 text-sm ${!template ? "border-primary bg-primary text-primary-foreground" : "border-border hover:bg-card"}`}>
            {t("قيدٌ يدويّ", "Manual entry")}
          </button>
          {daily.map((x) => (
            <button key={x.key} type="button" onClick={() => pick(x)} className={`rounded-full border px-3 py-1.5 text-sm ${template?.key === x.key ? "border-primary bg-primary text-primary-foreground" : "border-border hover:bg-card"}`}>
              {t(x.name_ar, x.name_en)}
            </button>
          ))}
        </div>
        {adjustingTemplates.length > 0 && (
          <>
            <h3 className="mt-3 text-xs font-bold text-muted">{t("قيود التسوية آخر الفترة", "Period-end adjusting entries")}</h3>
            <div className="mt-2 flex flex-wrap gap-2">
              {adjustingTemplates.map((x) => (
                <button key={x.key} type="button" onClick={() => pick(x)} className={`rounded-full border px-3 py-1.5 text-sm ${template?.key === x.key ? "border-primary bg-primary text-primary-foreground" : "border-border hover:bg-card"}`}>
                  {t(x.name_ar, x.name_en)}
                </button>
              ))}
            </div>
          </>
        )}
        {template && <p className="mt-3 rounded-xl border border-border bg-card p-3 text-sm leading-7">{t(template.hint_ar, template.hint_en)}</p>}
      </section>

      <section className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm">
          {t("التاريخ", "Date")}
          <input type="date" className={field} value={date} max={today} onChange={(e) => setDate(e.target.value)} />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          {t("العملة", "Currency")}
          <select className={field} value={currency} onChange={(e) => setCurrency(e.target.value === "SDG" ? "SDG" : "USD")}>
            <option value="USD">{t("دولار", "US dollars")}</option>
            <option value="SDG">{t("جنيه سوداني", "Sudanese pounds")}</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm sm:col-span-2">
          {t("البيان", "Description")}
          <input className={field} value={memo} maxLength={500} onChange={(e) => setMemo(e.target.value)} placeholder={t("ماذا حدث، ولمن، ولماذا", "What happened, with whom, and why")} />
        </label>
        {currency === "SDG" && (
          <label className="flex flex-col gap-1 text-sm sm:col-span-2">
            {t("سعر الصرف (جنيه لكلّ دولار) — اتركه فارغاً لسعر السوق المنشور", "Exchange rate (pounds per dollar) — leave empty for the published market rate")}
            <input className={field} inputMode="decimal" value={rate} onChange={(e) => setRate(e.target.value)} />
          </label>
        )}
        {!template && (
          <label className="flex items-center gap-2 text-sm sm:col-span-2">
            <input type="checkbox" checked={adjusting} onChange={(e) => setAdjusting(e.target.checked)} />
            {t("قيد تسوية (مستحقّات، مقدّمات، جرد) آخر الفترة", "An adjusting entry (accruals, prepayments, stock count) at period end")}
          </label>
        )}
      </section>

      <section>
        <h2 className="text-sm font-bold">{t("السطور", "Lines")}</h2>
        <div className="mt-2 space-y-2">
          {lines.map((l, i) => (
            <div key={i} className="grid grid-cols-1 gap-2 rounded-xl border border-border p-2 sm:grid-cols-[1fr_8rem_10rem_auto]">
              {accountSelect(i, l)}
              <select
                aria-label={t(`جانب السطر ${i + 1}`, `Side of line ${i + 1}`)}
                className={field}
                value={l.side}
                disabled={!!template}
                onChange={(e) => setLine(i, { side: e.target.value as Side })}
              >
                <option value="D">{t("مدين", "Debit")}</option>
                <option value="C">{t("دائن", "Credit")}</option>
              </select>
              <input
                aria-label={t(`مبلغ السطر ${i + 1}`, `Amount of line ${i + 1}`)}
                className={`${field} tabular-nums`}
                inputMode="decimal"
                placeholder="0.00"
                value={l.amount}
                onChange={(e) => setAmount(i, e.target.value)}
              />
              {!template && lines.length > 2 ? (
                <button type="button" className={ghost} onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))}>
                  {t("احذف السطر", "Remove line")}
                </button>
              ) : (
                <span />
              )}
            </div>
          ))}
        </div>
        {!template && (
          <button type="button" className={`${ghost} mt-2`} onClick={() => setLines((ls) => [...ls, { account: "", side: "D", amount: "" }])}>
            {t("أضف سطراً", "Add a line")}
          </button>
        )}
        <p className={`mt-3 text-sm tabular-nums ${balanced ? "text-primary" : "text-muted"}`}>
          {t("المدين", "Debit")} {fmt(totals.debit)} · {t("الدائن", "Credit")} {fmt(totals.credit)}
          {" · "}
          {balanced ? t("متوازن", "Balanced") : t(`الفرق ${fmt(totals.debit > totals.credit ? totals.debit - totals.credit : totals.credit - totals.debit)}`, `Difference ${fmt(totals.debit > totals.credit ? totals.debit - totals.credit : totals.credit - totals.debit)}`)}
        </p>
      </section>

      <section>
        <h2 className="text-sm font-bold">{t("المستند", "Document")}</h2>
        {doc ? (
          <p className="mt-2 text-sm">
            {t("أُرفق مستند.", "A document is attached.")}{" "}
            <button type="button" className="text-primary underline" onClick={() => setDoc(null)}>
              {t("أزله", "Remove it")}
            </button>
          </p>
        ) : (
          <div className="mt-2">
            <EvidenceUpload
              kinds={[
                { value: "photo", label: t("صورة الإيصال أو الفاتورة", "Photo of the receipt or invoice") },
                { value: "document", label: t("مستند PDF", "PDF document") },
              ]}
              folder="ledger"
              label={t("📎 أرفق الإيصال أو الفاتورة", "📎 Attach the receipt or invoice")}
              onUploaded={async ({ storagePath }) => {
                setDoc(storagePath);
                return { ok: true, message: t("أُرفق المستند، ويُحفظ مع القيد حين ترسله.", "Attached; it is saved with the entry when you send it.") };
              }}
            />
          </div>
        )}
        <p className="mt-1 text-xs text-muted">{t("القيد بلا مستندٍ يُقبل، ويظهر في تقرير الاستثناءات.", "An entry without a document is accepted, and shows in the exceptions report.")}</p>
      </section>

      {result && (
        <p role="status" className={`rounded-xl border p-3 text-sm ${result.ok ? "border-primary/40 bg-primary/5" : "border-danger/40 bg-danger/5"}`}>
          {result.message}
        </p>
      )}

      <button type="button" className={button} disabled={busy} onClick={send}>
        {busy ? t("يُرسَل…", "Sending…") : preparer ? t("أرسله لاعتماد صاحب الدفتر", "Send it for the owner's approval") : t("رحِّل القيد", "Post the entry")}
      </button>
    </div>
  );
}
