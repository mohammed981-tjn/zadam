"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { useLocale } from "@/components/LocaleProvider";
import { tr } from "@/lib/i18n";
import { ledgerLabel } from "@/lib/farmLabelsEn";
import { toFormData, type OutboxItem } from "@/lib/outbox";
import { dropItem, isNetworkError, keepOffline, keptMessage, listPending, offlineNow, subscribeOutbox } from "@/lib/outboxClient";
import { addLedgerEntry } from "../actions";
import { myActiveSeasons } from "./actions";

/** The kept entries that have no season yet. */
export const UNASSIGNED_KEY = "ledger:unassigned";
const CATEGORIES = ["seeds", "fertiliser", "pesticide", "labour", "irrigation", "transport", "other", "revenue"] as const;
const field = "rounded-lg border border-border bg-background px-3 py-2 text-sm";

/**
 * A blank cost form that works with no network (backlog 184; owner, 6 November 2026: «نموذج فارغ فقط»).
 *
 * The page holds nobody's data, so the service worker may keep it; what the farmer types is kept on the phone by the
 * outbox, under the signed-in account, exactly as the season page's form does offline. Once the phone is online the
 * farmer picks the season each entry belongs to, and it is sent by the same server action, with every check it runs.
 */
export default function BlankLedgerForm() {
  const locale = useLocale();
  const t = (ar: string, en: string) => tr(locale, ar, en);
  const [note, setNote] = useState<{ ok: boolean; message: string } | null>(null);
  const [seasons, setSeasons] = useState<{ id: string; name: string }[] | null>(null);
  const [choice, setChoice] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);

  const snapshot = useSyncExternalStore(subscribeOutbox, () => JSON.stringify(listPending(UNASSIGNED_KEY)), () => "[]");
  const kept = JSON.parse(snapshot) as OutboxItem[];

  // The seasons are asked for only online, and only when something waits for one.
  useEffect(() => {
    const load = () => {
      if (offlineNow() || kept.length === 0) return;
      myActiveSeasons()
        .then(setSeasons)
        .catch(() => setSeasons(null));
    };
    load();
    window.addEventListener("online", load);
    return () => window.removeEventListener("online", load);
  }, [kept.length]);

  const keep = (formData: FormData) => {
    const result = keepOffline({
      key: UNASSIGNED_KEY,
      path: "/seasons/offline",
      label: t("قيدٌ بلا موسم", "An entry with no season yet"),
      formData,
      stamp: "entry_date",
    });
    const kept = keptMessage(result, t);
    setNote(
      kept.ok
        ? {
            ok: true,
            message: t(
              "حُفظ على هاتفك. حين تتّصل افتح هذه الصفحة واختر موسمه ليُرسَل.",
              "Kept on your phone. When you are online, open this page and choose its season to send it.",
            ),
          }
        : kept,
    );
  };

  const send = async (item: OutboxItem) => {
    const season = choice[item.id] ?? seasons?.[0]?.id;
    if (!season) return;
    setBusy(item.id);
    setNote(null);
    const fd = toFormData(item);
    fd.set("season_id", season);
    try {
      await addLedgerEntry(fd);
      dropItem(item.id);
      setNote({ ok: true, message: t("أُرسل القيد إلى موسمه.", "The entry was sent to its season.") });
    } catch (e) {
      // No network: it stays kept. A refusal arrives as a redirect to the season with the reason, and stays kept too.
      if (isNetworkError(e)) setNote({ ok: false, message: t("ما زال لا اتصال. سيبقى محفوظاً.", "Still no connection. It stays kept.") });
      else throw e;
    } finally {
      setBusy(null);
    }
  };

  const value = (item: OutboxItem, name: string) => item.fields.find(([k]) => k === name)?.[1] ?? "";

  return (
    <div className="grid gap-6">
      <form action={keep} className="flex flex-wrap items-end gap-2 rounded-2xl border border-border bg-card p-4">
        <label className="flex flex-col gap-1 text-xs">
          {t("البند", "Item")}
          <select name="category" className={field} defaultValue="seeds">
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {ledgerLabel(c, locale)}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs">
          {t("المبلغ", "Amount")}
          <input type="text" inputMode="decimal" name="amount" required className={field} />
        </label>
        <label className="flex flex-col gap-1 text-xs">
          {t("العملة", "Currency")}
          <select name="currency" className={field} defaultValue="SDG">
            <option value="SDG">{t("جنيه سوداني", "Sudanese pound")}</option>
            <option value="USD">{t("دولار ($)", "US dollar ($)")}</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs">
          {t("دُفع أو قُبض", "Paid or received")}
          <select name="paid_from" className={field} defaultValue="cash">
            <option value="cash">{t("نقداً", "Cash")}</option>
            <option value="bank">{t("من البنك", "Bank")}</option>
            <option value="wallet">{t("محفظة إلكترونية", "Mobile wallet")}</option>
            <option value="credit">{t("آجل — لم يُدفع أو يُقبض بعد", "On credit — not paid or received yet")}</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs">
          {t("سعر الصرف (للجنيه، إن عرفته)", "Exchange rate (pounds, if you know it)")}
          <input type="text" inputMode="decimal" name="fx_rate" placeholder={t("جنيه لكل دولار", "pounds per dollar")} className={field} />
        </label>
        <label className="flex flex-col gap-1 text-xs">
          {t("الوصف", "Description")}
          <input name="description" className={field} />
        </label>
        <button type="submit" className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90">
          {t("احفظ على هاتفي", "Keep on my phone")}
        </button>
        {note && (
          <p className={`basis-full text-sm ${note.ok ? "text-primary" : "text-danger"}`} role="status">
            {note.message}
          </p>
        )}
      </form>

      {kept.length > 0 && (
        <section className="rounded-2xl border border-border bg-card p-4">
          <h2 className="mb-2 font-bold">{t("محفوظٌ ينتظر موسمه", "Kept, waiting for its season")}</h2>
          {seasons === null ? (
            <p className="text-sm text-muted">
              {t("حين تتّصل بالإنترنت تظهر مواسمك هنا لتختار لكلّ قيدٍ موسمه.", "When you are online your seasons appear here, to choose each entry's season.")}
            </p>
          ) : seasons.length === 0 ? (
            <p className="text-sm text-muted">
              {t("ليس لك موسمٌ جارٍ. أنشئ موسماً أوّلاً، ثمّ عد إلى هذه الصفحة.", "You have no active season. Create one first, then come back to this page.")}
            </p>
          ) : null}
          <ul className="mt-2 grid gap-3">
            {kept.map((item) => (
              <li key={item.id} className="flex flex-wrap items-center gap-2 text-sm">
                <span className="font-bold">
                  {ledgerLabel(value(item, "category"), locale)} · {value(item, "amount")}{" "}
                  {value(item, "currency") === "USD" ? "$" : t("جنيه", "SDG")}
                </span>
                <span className="text-muted">{value(item, "entry_date")}</span>
                {value(item, "description") && <span className="text-muted" dir="auto">· {value(item, "description")}</span>}
                {seasons && seasons.length > 0 && (
                  <>
                    <select
                      className={field}
                      value={choice[item.id] ?? seasons[0].id}
                      onChange={(e) => setChoice((c) => ({ ...c, [item.id]: e.target.value }))}
                      aria-label={t("الموسم", "Season")}
                    >
                      {seasons.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      disabled={busy !== null}
                      onClick={() => void send(item)}
                      className="rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground disabled:opacity-50"
                    >
                      {t("أرسله إلى هذا الموسم", "Send it to this season")}
                    </button>
                  </>
                )}
                <button type="button" onClick={() => dropItem(item.id)} className="text-xs text-muted underline">
                  {t("لا أريده", "Discard")}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
