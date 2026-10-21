import Link from "next/link";
import ActionNotice from "@/components/ActionNotice";
import PageHeader from "@/components/PageHeader";
import MarketTabs from "@/components/market/MarketTabs";
import { tr } from "@/lib/i18n";
import { getLocale } from "@/lib/locale";
import { money } from "@/lib/marketCrops";
import { isNotYetCreated } from "@/lib/marketOffers";
import { SUDAN_STATES, stateName } from "@/lib/nafir";
import { createClient } from "@/lib/supabase/server";
import {
  AVAILABILITY_LABEL,
  INPUT_ITEMS,
  ITEM_LABEL,
  KIND_LABEL,
  REPORT_MAX_AGE_DAYS,
  UNIT_LABEL,
  khartoumToday,
  label,
  perUnit,
  unitsFor,
  type Availability,
  type InputItem,
  type InputUnit,
} from "@/lib/inputBoard";
import { hideReport, reportPrice, withdrawReport } from "../actions";
import { field, label as labelCls } from "@/lib/ui";

export async function generateMetadata() {
  const locale = await getLocale();
  return { title: tr(locale, "بلّغ عن سعر السماد أو الوقود | سوداقري", "Report a fertiliser or fuel price | Sudagri") };
}

interface Row {
  id: string;
  item: InputItem;
  unit: InputUnit;
  price_kind: "official" | "parallel" | null;
  state: string;
  locality: string;
  price_sdg: number | null;
  availability: Availability;
  observed_on: string;
  note: string | null;
  hidden_at: string | null;
  hidden_note: string | null;
}

/**
 * The form asks for what a farmer knows at the counter: what, how much, where,
 * which day — or that it was not there at all. No phone and no name: a report
 * is about a price, not a seller. Below it, the reporter's own reports to
 * withdraw, and for an administrator the recent ones to hide.
 */
export default async function ReportInputPricePage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const { ok, error: flash } = await searchParams;
  const locale = await getLocale();
  const t = (ar: string, en: string) => tr(locale, ar, en);
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const today = khartoumToday();
  const earliest = new Date(Date.parse(`${today}T12:00:00Z`) - REPORT_MAX_AGE_DAYS * 86_400_000).toISOString().slice(0, 10);

  let mine: Row[] = [];
  let others: Row[] = [];
  let admin = false;
  let pending = false;
  if (user) {
    const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
    admin = profile?.role === "admin";
    // RLS returns one's own reports, and every report to an administrator.
    const { data, error } = await supabase
      .from("input_price_reports")
      .select("id, item, unit, price_kind, state, locality, price_sdg, availability, observed_on, note, hidden_at, hidden_note, reporter_id")
      .order("created_at", { ascending: false })
      .limit(admin ? 100 : 30);
    pending = isNotYetCreated(error);
    const rows = (data ?? []) as (Row & { reporter_id: string })[];
    mine = rows.filter((r) => r.reporter_id === user.id);
    others = admin ? rows.filter((r) => r.reporter_id !== user.id) : [];
  }

  const fertiliser = INPUT_ITEMS.filter((i) => !unitsFor(i).includes("liter"));
  const fuel = INPUT_ITEMS.filter((i) => unitsFor(i).includes("liter"));

  const line = (r: Row) => (
    <>
      <span className="font-bold">{label(ITEM_LABEL, r.item, locale)}</span> — {stateName(r.state, locale)}، {r.locality}
      {r.price_kind && <span className="text-muted"> · {label(KIND_LABEL, r.price_kind, locale)}</span>}
      {" · "}
      {r.price_sdg !== null ? (
        <span dir="ltr">{money(Number(r.price_sdg))}</span>
      ) : (
        <span className="text-danger">{label(AVAILABILITY_LABEL, "unavailable", locale)}</span>
      )}{" "}
      {r.price_sdg !== null && <span className="text-xs text-muted">{t("جنيه ", "SDG ")}{perUnit(r.unit, locale)}</span>}
      <span className="text-xs text-muted"> · {r.observed_on}</span>
      {r.hidden_at && <span className="text-xs font-bold text-muted"> · {t("مخفيّ", "hidden")}: {r.hidden_note}</span>}
    </>
  );

  return (
    <div className="mx-auto max-w-xl px-4 py-6">
      <MarketTabs active="/market/inputs" locale={locale} />
      <PageHeader icon="chart" eyebrow={t("السماد والجازولين", "Fertiliser & diesel")} title={t("بلّغ عن سعر", "Report a price")}>
        {t(
          "بكم اشتريت السماد أو الوقود، وأين، وفي أيّ يوم — أو أنّك بحثت ولم تجد. لا نطلب رقمك ولا نُظهر اسمك.",
          "What you paid for fertiliser or fuel, where, and on what day — or that you looked and could not find it. We do not ask for your number and do not show your name.",
        )}
      </PageHeader>

      <ActionNotice ok={ok} error={flash} />

      {!user ? (
        <p className="rounded-2xl border border-border bg-card p-5 text-sm">
          <Link href="/login" className="font-bold text-primary underline">{t("سجّل الدخول", "Sign in")}</Link>{" "}
          {t("لتبلّغ — حتى لا يُغرق حسابٌ واحد اللوحة، وتستطيع سحب بلاغك.", "to report — so one account cannot flood the board, and you can withdraw your report.")}
        </p>
      ) : pending ? (
        <p className="rounded-2xl border border-border bg-card p-5 text-sm">{t("البلاغات تُفعَّل قريباً.", "Reports open soon.")}</p>
      ) : (
        <form action={reportPrice} className="flex flex-col gap-4">
          <label className={labelCls}>
            {t("الصنف", "Item")}
            <select name="item" required defaultValue="" className={field}>
              <option value="" disabled>{t("اختر", "Choose")}</option>
              <optgroup label={t("السماد", "Fertiliser")}>
                {fertiliser.map((i) => <option key={i} value={i}>{label(ITEM_LABEL, i, locale)}</option>)}
              </optgroup>
              <optgroup label={t("الوقود", "Fuel")}>
                {fuel.map((i) => <option key={i} value={i}>{label(ITEM_LABEL, i, locale)}</option>)}
              </optgroup>
            </select>
          </label>

          <fieldset className="flex flex-wrap gap-4 text-sm">
            <legend className="mb-1">{t("هل وجدته؟", "Did you find it?")}</legend>
            {(["available", "limited", "unavailable"] as const).map((a) => (
              <label key={a} className="flex items-center gap-2">
                <input type="radio" name="availability" value={a} defaultChecked={a === "available"} /> {label(AVAILABILITY_LABEL, a, locale)}
              </label>
            ))}
          </fieldset>

          <div className="grid grid-cols-2 gap-3">
            <label className={labelCls}>
              {t("السعر بالجنيه", "Price in SDG")}
              <input name="price" inputMode="decimal" className={field} dir="ltr" placeholder="300000" />
              <span className="text-xs text-muted">{t("اتركه فارغاً إن لم تجده.", "Leave it empty if you could not find it.")}</span>
            </label>
            <label className={labelCls}>
              {t("لكلّ", "Per")}
              <select name="unit" required defaultValue="sack_50kg" className={field}>
                <optgroup label={t("السماد", "Fertiliser")}>
                  {unitsFor("urea").map((u) => <option key={u} value={u}>{label(UNIT_LABEL, u, locale)}</option>)}
                </optgroup>
                <optgroup label={t("الوقود", "Fuel")}>
                  {unitsFor("diesel").map((u) => <option key={u} value={u}>{label(UNIT_LABEL, u, locale)}</option>)}
                </optgroup>
              </select>
            </label>
          </div>

          <fieldset className="flex flex-wrap gap-4 text-sm">
            <legend className="mb-1">{t("للوقود: من أين؟", "For fuel: where from?")}</legend>
            <label className="flex items-center gap-2">
              <input type="radio" name="price_kind" value="official" /> {t("المحطّة (السعر الرسميّ)", "Station (official price)")}
            </label>
            <label className="flex items-center gap-2">
              <input type="radio" name="price_kind" value="parallel" /> {label(KIND_LABEL, "parallel", locale)}
            </label>
          </fieldset>

          <div className="grid grid-cols-2 gap-3">
            <label className={labelCls}>
              {t("الولاية", "State")}
              <select name="state" required defaultValue="" className={field}>
                <option value="" disabled>{t("اختر", "Choose")}</option>
                {SUDAN_STATES.map((s) => <option key={s} value={s}>{stateName(s, locale)}</option>)}
              </select>
            </label>
            <label className={labelCls}>
              {t("السوق أو المحلية", "Market or locality")}
              <input name="locality" required minLength={2} maxLength={80} className={field} />
            </label>
          </div>

          <label className={labelCls}>
            {t("اليوم", "Day")}
            <input type="date" name="observed_on" required defaultValue={today} min={earliest} max={today} className={field} dir="ltr" />
          </label>

          <label className={labelCls}>
            {t("ملاحظة (اختياري)", "Note (optional)")}
            <input name="note" maxLength={300} className={field} placeholder={t("مثلاً: في محطّة واحدة فقط، والطابور طويل", "e.g. at one station only, with a long queue")} />
            <span className="text-xs text-muted">{t("تظهر للناس. لا تكتب فيها رقم هاتف ولا اسم أحد.", "It is shown to everyone. Do not write a phone number or anyone's name in it.")}</span>
          </label>

          <button className="rounded-xl bg-primary px-5 py-3 text-sm font-bold text-primary-foreground">{t("أرسل البلاغ", "Send the report")}</button>
        </form>
      )}

      {mine.length > 0 && (
        <section className="mt-10">
          <h2 className="mb-2 font-bold">{t("بلاغاتي", "My reports")}</h2>
          <ul className="flex flex-col gap-2 text-sm">
            {mine.map((r) => (
              <li key={r.id} className="rounded-xl border border-border bg-card p-3">
                {line(r)}
                {!r.hidden_at && (
                  <form action={withdrawReport} className="mt-2">
                    <input type="hidden" name="report_id" value={r.id} />
                    <button className="text-xs text-danger underline">{t("اسحب البلاغ", "Withdraw")}</button>
                  </form>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {admin && others.length > 0 && (
        <section className="mt-10">
          <h2 className="mb-2 font-bold">{t("للإدارة: بلاغات الآخرين", "For administrators: others' reports")}</h2>
          <p className="mb-2 text-xs text-muted">{t("الإخفاء لا يحذف: يبقى البلاغ وسبب إخفائه.", "Hiding deletes nothing: the report and the reason stay.")}</p>
          <ul className="flex flex-col gap-2 text-sm">
            {others.map((r) => (
              <li key={r.id} className="rounded-xl border border-border bg-card p-3">
                {line(r)}
                {r.note && <p className="mt-1 text-xs text-muted">«{r.note}»</p>}
                {!r.hidden_at && (
                  <form action={hideReport} className="mt-2 flex gap-2">
                    <input type="hidden" name="report_id" value={r.id} />
                    <input name="note" required minLength={2} maxLength={200} placeholder={t("سبب الإخفاء", "Reason for hiding")} className="w-full rounded-lg border border-border bg-background px-3 py-1 text-xs focus:border-orange focus:outline-none" />
                    <button className="shrink-0 text-xs text-danger underline">{t("أخفِ", "Hide")}</button>
                  </form>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
