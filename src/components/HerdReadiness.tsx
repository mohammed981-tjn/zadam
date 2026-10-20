import Link from "next/link";
import type { ReactNode } from "react";
import { addHealthRecord, addTagRange, setTagStatus, withdrawHealthRecord } from "@/app/herds/actions";
import {
  HEALTH_ITEMS,
  KIND_LABEL,
  TAG_STATUS_LABEL,
  healthItemName,
  tagCounts,
  type HealthKind,
  type HealthRecord,
  type HerdTag,
  type TagStatus,
} from "@/lib/herdHealth";
import { tr, type Locale } from "@/lib/i18n";
import { locustDay } from "@/lib/locust";

const field = "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm";
const label = "flex flex-col gap-1 text-xs text-muted";

/**
 * «الجاهزيّة للتصدير» on the herd page (backlog 117): the herd's health record
 * and ear tags, written by its owner and printed for the exporter and the
 * quarantine vet. Every form posts to a database function that checks the
 * herd is the caller's; nothing here is deleted.
 */
export default function HerdReadiness({
  herdId,
  headCount,
  active,
  records,
  tags,
  locale,
  error,
  children,
}: {
  herdId: string;
  headCount: number;
  active: boolean;
  records: HealthRecord[];
  tags: HerdTag[];
  locale: Locale;
  /** What the last save in this section was refused for. */
  error?: string;
  /** The checklist for a destination, when there is one. */
  children?: ReactNode;
}) {
  const t = (ar: string, en: string) => tr(locale, ar, en);
  const en = locale === "en";
  const counts = tagCounts(tags);
  const today = new Date().toISOString().slice(0, 10);
  const kinds: HealthKind[] = ["vaccination", "test", "treatment"];
  const present = tags.filter((x) => x.status === "present");

  return (
    <section id="readiness" className="mt-8 rounded-2xl border border-border bg-card p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-bold">{t("الجاهزيّة للتصدير", "Export readiness")}</h2>
        <Link href={`/herds/${herdId}/file`} className="text-sm font-medium text-primary underline">
          {t("ملفّ القطيع للطباعة", "Printable herd file")}
        </Link>
      </div>
      <p className="mt-1 text-xs leading-relaxed text-muted">
        {t(
          "سجلٌّ تحفظه لقطيعك: تطعيماته وفحوصه وأرقام آذان رؤوسه، تطبعه وتقدّمه للمصدّر وللطبيب البيطريّ في المحجر. هو يساعد المحجر ولا يغني عنه: الشهادة الصحّيّة يصدرها المحجر البيطريّ وحده.",
          "A record you keep for your herd — its vaccinations, tests and ear-tag numbers — to print and hand to the exporter and the quarantine vet. It helps the quarantine; it does not replace it: only the veterinary quarantine issues the health certificate.",
        )}
      </p>

      {error && (
        <p className="mt-3 rounded-lg border border-danger/40 bg-danger/5 px-3 py-2 text-sm">{error}</p>
      )}

      {children}

      {/* ── أرقام الآذان ── */}
      <h3 className="mt-5 font-semibold">{t("أرقام الآذان", "Ear tags")}</h3>
      <p className="mt-1 text-sm">
        {t(
          `مرقَّمٌ في القطيع: ${counts.present} من ${headCount} رأساً`,
          `Tagged in the herd: ${counts.present} of ${headCount} head`,
        )}
        {(counts.sold > 0 || counts.dead > 0 || counts.exported > 0) && (
          <span className="text-muted">
            {" · "}
            {(["sold", "dead", "exported"] as TagStatus[])
              .filter((s) => counts[s] > 0)
              .map((s) => `${en ? TAG_STATUS_LABEL[s].en : TAG_STATUS_LABEL[s].ar}: ${counts[s]}`)
              .join(" · ")}
          </span>
        )}
      </p>
      {present.length > 0 && (
        <p className="mt-1 text-xs text-muted" dir="ltr">
          {present.length <= 12
            ? present.map((x) => x.tag).join(", ")
            : `${present.slice(0, 6).map((x) => x.tag).join(", ")} … ${present.slice(-3).map((x) => x.tag).join(", ")}`}
        </p>
      )}

      {active && (
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <form action={addTagRange} className="flex flex-col gap-2 rounded-xl bg-background p-3">
            <input type="hidden" name="herd_id" value={herdId} />
            <p className="text-sm font-medium">{t("أضف أرقاماً متتالية", "Add consecutive numbers")}</p>
            <div className="grid grid-cols-3 gap-2">
              <label className={label}>
                {t("الحرف الثابت", "Prefix")}
                <input name="prefix" placeholder="SD-" dir="ltr" className={field} maxLength={20} />
              </label>
              <label className={label}>
                {t("من", "From")}
                <input name="from" type="number" min={0} required dir="ltr" className={field} />
              </label>
              <label className={label}>
                {t("إلى", "To")}
                <input name="to" type="number" min={0} dir="ltr" className={field} />
              </label>
            </div>
            <p className="text-[11px] text-muted">
              {t(
                "مثال: SD- من 1 إلى 250 يضيف SD-1 … SD-250. حروفٌ لاتينيّة وأرقام فقط، كما تُكتب على الأذن.",
                "Example: SD- from 1 to 250 adds SD-1 … SD-250. Latin letters and digits only, as written on the tag.",
              )}
            </p>
            <button type="submit" className="self-start rounded-lg border border-primary px-4 py-1.5 text-sm font-medium text-primary">
              {t("أضف", "Add")}
            </button>
          </form>

          {present.length > 0 && (
            <form action={setTagStatus} className="flex flex-col gap-2 rounded-xl bg-background p-3">
              <input type="hidden" name="herd_id" value={herdId} />
              <p className="text-sm font-medium">{t("رأسٌ خرج من القطيع", "A head that left the herd")}</p>
              <div className="grid grid-cols-2 gap-2">
                <label className={label}>
                  {t("رقم الأذن", "Tag number")}
                  <input name="tag" required dir="ltr" className={field} list={`tags-${herdId}`} />
                  <datalist id={`tags-${herdId}`}>
                    {present.slice(0, 500).map((x) => (
                      <option key={x.tag} value={x.tag} />
                    ))}
                  </datalist>
                </label>
                <label className={label}>
                  {t("ما حدث له", "What happened")}
                  <select name="status" className={field} defaultValue="sold">
                    {(["sold", "dead", "exported", "present"] as TagStatus[]).map((s) => (
                      <option key={s} value={s}>
                        {en ? TAG_STATUS_LABEL[s].en : TAG_STATUS_LABEL[s].ar}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <p className="text-[11px] text-muted">
                {t("لا يُمحى الرقم: تتغيّر حالته ويبقى في الملفّ.", "The number is never erased: its status changes and it stays in the file.")}
              </p>
              <button type="submit" className="self-start rounded-lg border border-primary px-4 py-1.5 text-sm font-medium text-primary">
                {t("سجّل", "Record")}
              </button>
            </form>
          )}
        </div>
      )}

      {/* ── سجلّ الصحّة ── */}
      <h3 className="mt-6 font-semibold">{t("التطعيمات والفحوص والعلاج", "Vaccinations, tests and treatment")}</h3>
      {active && (
        <form action={addHealthRecord} className="mt-2 grid gap-2 rounded-xl bg-background p-3 sm:grid-cols-2">
          <input type="hidden" name="herd_id" value={herdId} />
          <label className={`${label} sm:col-span-2`}>
            {t("ماذا", "What")}
            <select name="choice" required className={field} defaultValue="">
              <option value="" disabled>
                {t("اختر…", "Choose…")}
              </option>
              {kinds.map((k) => (
                <optgroup key={k} label={en ? KIND_LABEL[k].en : KIND_LABEL[k].ar}>
                  {HEALTH_ITEMS.filter((i) => i.kind === k).map((i) => (
                    <option key={i.key} value={`${i.kind}:${i.key}`}>
                      {en ? i.en : i.ar}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </label>
          <label className={label}>
            {t("التاريخ", "Date")}
            <input name="done_on" type="date" required max={today} defaultValue={today} className={field} />
          </label>
          <label className={label}>
            {t("عدد الرؤوس", "Head")}
            <input name="heads" type="number" min={1} max={headCount} required defaultValue={headCount} className={field} />
          </label>
          <label className={label}>
            {t("نتيجة الفحص (للفحوص فقط)", "Test result (tests only)")}
            <select name="result" className={field} defaultValue="">
              <option value="">—</option>
              <option value="negative">{t("سلبيّ (سليم)", "Negative")}</option>
              <option value="positive">{t("إيجابيّ", "Positive")}</option>
            </select>
          </label>
          <label className={label}>
            {t("الطبيب البيطريّ أو المعمل", "Vet or laboratory")}
            <input name="vet_name" maxLength={120} className={field} />
          </label>
          <label className={label}>
            {t("اسم اللقاح أو الدواء", "Vaccine or product")}
            <input name="product" maxLength={120} className={field} />
          </label>
          <label className={label}>
            {t("رقم التشغيلة", "Batch number")}
            <input name="batch" maxLength={60} dir="ltr" className={field} />
          </label>
          <label className={`${label} sm:col-span-2`}>
            {t("ملاحظة", "Note")}
            <input name="note" maxLength={500} className={field} />
          </label>
          <button type="submit" className="justify-self-start rounded-lg bg-primary px-5 py-2 text-sm font-medium text-primary-foreground hover:opacity-90">
            {t("سجّل", "Record")}
          </button>
        </form>
      )}

      {records.length === 0 ? (
        <p className="mt-3 text-sm text-muted">{t("لم يُسجَّل شيءٌ بعد.", "Nothing recorded yet.")}</p>
      ) : (
        <ul className="mt-3 flex flex-col gap-2">
          {records.map((r) => (
            <li key={r.id} className={`rounded-xl border p-3 text-sm ${r.withdrawn_at ? "border-border opacity-60" : "border-border"}`}>
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className={`font-medium ${r.withdrawn_at ? "line-through" : ""}`}>
                  {en ? KIND_LABEL[r.kind].en : KIND_LABEL[r.kind].ar}: {healthItemName(r.item_key, en)}
                  {r.result && (
                    <span className={r.result === "positive" ? "text-danger" : "text-primary"}>
                      {" — "}
                      {r.result === "positive" ? t("إيجابيّ", "positive") : t("سلبيّ", "negative")}
                    </span>
                  )}
                </p>
                <span className="text-xs text-muted">{locustDay(r.done_on, locale)}</span>
              </div>
              <p className="mt-0.5 text-xs text-muted">
                {t(`${r.heads} رأساً`, `${r.heads} head`)}
                {r.product && ` · ${r.product}`}
                {r.batch && ` · ${t("تشغيلة", "batch")} ${r.batch}`}
                {r.vet_name && ` · ${r.vet_name}`}
                {r.note && ` · ${r.note}`}
              </p>
              {r.withdrawn_at ? (
                <p className="mt-0.5 text-xs">
                  {t("سُحب: ", "Withdrawn: ")}
                  {r.withdrawn_note}
                </p>
              ) : (
                active && (
                  <details className="mt-1 text-xs">
                    <summary className="cursor-pointer text-muted">{t("القيد خطأ؟", "Entered in error?")}</summary>
                    <form action={withdrawHealthRecord} className="mt-1 flex flex-wrap items-end gap-2">
                      <input type="hidden" name="herd_id" value={herdId} />
                      <input type="hidden" name="record_id" value={r.id} />
                      <label className={label}>
                        {t("السبب", "Reason")}
                        <input name="note" required minLength={3} maxLength={300} className={field} />
                      </label>
                      <button type="submit" className="rounded-lg border border-border px-3 py-1.5 text-xs">
                        {t("اسحب القيد", "Withdraw")}
                      </button>
                    </form>
                    <p className="mt-1 text-muted">
                      {t("لا يُحذف القيد: يبقى في الملفّ مشطوباً بسببه.", "The entry is not deleted: it stays in the file, struck through, with its reason.")}
                    </p>
                  </details>
                )
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
