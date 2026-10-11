import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  assessProvenance,
  CUSTODY_ROLE_LABEL,
  CUSTODY_ROLE_LABEL_EN,
  extractionLabel,
  fineGold,
  type CustodyEvent,
  type CustodyRole,
  type ExtractionMethod,
} from "@/lib/provenance";
import { addCustodyEvent, addCustodyEvidence } from "../actions";
import { tr } from "@/lib/i18n";
import { getLocale } from "@/lib/locale";

const ROLES = Object.keys(CUSTODY_ROLE_LABEL) as CustodyRole[];
const field =
  "rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary";

export default async function LotPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { id } = await params;
  const { error } = await searchParams;
  const locale = await getLocale();
  const t = (ar: string, en: string) => tr(locale, ar, en);
  const en = locale === "en";
  const role = (r: CustodyRole) => (en ? CUSTODY_ROLE_LABEL_EN[r] : CUSTODY_ROLE_LABEL[r]);
  // Names, places and captions are what users typed; on the English page they keep their direction.
  const typed = en ? ({ dir: "auto" } as const) : {};

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: lotRow } = await supabase
    .from("gold_lots")
    .select("*, mine_sites(*)")
    .eq("id", id)
    .single();

  if (!lotRow) notFound();

  const lot = lotRow as {
    id: string;
    reference: string;
    extracted_on: string;
    method: ExtractionMethod;
    initial_weight_grams: number;
    initial_fineness: number;
    mine_sites: {
      name: string;
      state: string;
      licensed: boolean;
      latitude: number | null;
      longitude: number | null;
      armed_presence: boolean;
      child_labour: boolean;
      site_visited: boolean;
    } | null;
  };

  const { data: eventRows } = await supabase
    .from("custody_events")
    .select("*")
    .eq("lot_id", id)
    .order("sequence");

  const events = (eventRows ?? []) as {
    id: string;
    sequence: number;
    from_party: string;
    to_party: string;
    role: CustodyRole;
    occurred_at: string;
    weight_grams: number;
    fineness: number;
    location: string | null;
  }[];

  const { data: evidenceRows } = await supabase
    .from("custody_evidence")
    .select("*")
    .in("event_id", events.length ? events.map((e) => e.id) : ["0"]);

  const evidence = (evidenceRows ?? []) as {
    id: string;
    event_id: string;
    kind: string;
    caption: string;
  }[];

  const site = lot.mine_sites;
  const custody: CustodyEvent[] = events.map((e) => ({
    sequence: e.sequence,
    fromParty: e.from_party,
    toParty: e.to_party,
    role: e.role,
    occurredAt: e.occurred_at,
    weightGrams: Number(e.weight_grams),
    fineness: Number(e.fineness),
    evidenceCount: evidence.filter((v) => v.event_id === e.id).length,
  }));

  const result = assessProvenance(
    {
      licensed: site?.licensed ?? false,
      hasCoordinates: site?.latitude != null && site?.longitude != null,
      armedPresence: site?.armed_presence ?? false,
      childLabour: site?.child_labour ?? false,
      siteVisited: site?.site_visited ?? false,
    },
    lot.method,
    custody,
    locale,
  );

  const severityTone: Record<string, string> = {
    critical: "border-danger/50 bg-danger/10 text-danger",
    high: "border-accent/50 bg-accent/10 text-accent",
    medium: "border-border bg-background text-muted",
  };

  const lastParty = events.length ? events[events.length - 1].to_party : "—";

  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      <h1 className="text-2xl font-bold" {...typed}>
        {lot.reference}
      </h1>
      <p className="mt-1 text-sm text-muted">
        <span {...typed}>
          {site?.name} — {site?.state}
        </span>{" "}
        · {t("استُخرجت", "extracted")} {lot.extracted_on} · {extractionLabel(lot.method, locale)}
      </p>

      {error && (
        <p className="mt-4 rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}

      <div className="mt-6 grid gap-4 sm:grid-cols-4">
        {[
          {
            l: t("توثيق المنشأ", "Origin documentation"),
            v: `${result.score}`,
            s: t("من 100 — اكتمال التوثيق لا قيمة الذهب", "out of 100 — completeness of the record, not the gold's value"),
          },
          {
            l: t("السلسلة", "Chain"),
            v: result.chainIntact ? t("متصلة", "Intact") : t("مكسورة", "Broken"),
            s: t(`${events.length} حلقة`, `${events.length} links`),
          },
          {
            l: t("الزئبق", "Mercury"),
            v: result.mercuryFree ? t("خالٍ", "Free") : t("مستخدم", "Used"),
            s: result.mercuryFree ? t("ميزة تسويقية", "A selling point") : t("يخفض القبول", "Lowers acceptance"),
          },
          { l: t("آخر حائز", "Last holder"), v: lastParty, s: t("في السلسلة المسجّلة", "in the recorded chain") },
        ].map((c) => (
          <div
            key={c.l}
            className="rounded-2xl border border-border bg-card p-4"
          >
            <p className="text-xs text-muted">{c.l}</p>
            <p className="mt-1 text-lg font-black">{c.v}</p>
            <p className="text-xs text-muted">{c.s}</p>
          </div>
        ))}
      </div>

      {result.flags.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-3 text-lg font-bold">
            {t("ملاحظات العناية الواجبة", "Due-diligence notes")} ({result.flags.length})
          </h2>
          <ul className="flex flex-col gap-2">
            {result.flags.map((f) => (
              <li
                key={f.key}
                className={`rounded-xl border px-4 py-3 text-sm ${severityTone[f.severity]}`}
              >
                {f.message}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="mt-10">
        <h2 className="mb-1 text-lg font-bold">{t("سلسلة الحيازة", "Chain of custody")}</h2>
        <p className="mb-4 text-sm text-muted">
          {t(
            "الذهب الصافي = الوزن × العيار، ويجب أن ينخفض عند كل حلقة. الارتفاع يعني دخول مادة غير مسجّلة.",
            "Fine gold = weight × fineness, and it must fall at every link. A rise means unrecorded material has entered.",
          )}
        </p>

        {events.length === 0 ? (
          <p className="rounded-2xl border border-border bg-card p-5 text-sm text-muted">
            {t("لا توجد حلقات بعد. ابدأ بالحلقة الأولى من المعدّن نفسه.", "No links yet. Start with the first link, from the miner.")}
          </p>
        ) : (
          <ol className="flex flex-col gap-3">
            {events.map((e, i) => {
              const content = fineGold(
                Number(e.weight_grams),
                Number(e.fineness),
              );
              const prev = i > 0 ? result.fineGoldTrail[i - 1] : null;
              const rose = prev !== null && content > prev * 1.005 + 0.01;
              const ev = evidence.filter((v) => v.event_id === e.id);

              return (
                <li
                  key={e.id}
                  className={`rounded-2xl border bg-card p-5 ${
                    rose ? "border-danger/50" : "border-border"
                  }`}
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-bold">
                        {e.sequence}. <span {...typed}>{e.from_party}</span> {en ? "→" : "←"}{" "}
                        <span {...typed}>{e.to_party}</span>
                      </p>
                      <p className="text-xs text-muted">
                        {role(e.role)} · {e.occurred_at}
                        {e.location && (
                          <>
                            {" · "}
                            <span {...typed}>{e.location}</span>
                          </>
                        )}
                      </p>
                    </div>
                    <div className="text-end">
                      <p className="font-bold">
                        {Number(e.weight_grams)} {t("جم", "g")} × {Number(e.fineness)}
                      </p>
                      <p
                        className={`text-xs font-medium ${rose ? "text-danger" : "text-muted"}`}
                      >
                        {content.toFixed(2)} {t("جم ذهب صافٍ", "g fine gold")}
                        {rose ? t(" — ارتفاع غير مبرّر", " — unexplained rise") : ""}
                      </p>
                    </div>
                  </div>

                  {ev.length > 0 && (
                    <ul className="mt-3 flex flex-wrap gap-2">
                      {ev.map((v) => (
                        <li
                          key={v.id}
                          className="rounded-full bg-primary/10 px-3 py-1 text-xs text-primary"
                          {...typed}
                        >
                          {v.caption}
                        </li>
                      ))}
                    </ul>
                  )}

                  <form
                    action={addCustodyEvidence}
                    className="mt-3 flex flex-wrap items-end gap-2"
                  >
                    <input type="hidden" name="event_id" value={e.id} />
                    <input type="hidden" name="lot_id" value={lot.id} />
                    <select name="kind" className={field} defaultValue="photo">
                      <option value="photo">{t("صورة", "Photo")}</option>
                      <option value="assay">{t("شهادة عيار", "Assay certificate")}</option>
                      <option value="receipt">{t("إيصال", "Receipt")}</option>
                      <option value="permit">{t("تصريح", "Permit")}</option>
                      <option value="inspection">{t("معاينة", "Inspection")}</option>
                    </select>
                    <input
                      name="caption"
                      required
                      placeholder={t("وصف الدليل", "Describe the evidence")}
                      className={field}
                    />
                    <button
                      type="submit"
                      className="rounded-lg border border-border px-3 py-2 text-sm hover:border-primary"
                    >
                      {t("أضف دليلاً", "Add evidence")}
                    </button>
                  </form>
                </li>
              );
            })}
          </ol>
        )}
      </section>

      <section className="mt-8">
        <h2 className="mb-3 text-lg font-bold">{t("أضف حلقة جديدة", "Add a new link")}</h2>
        <form
          action={addCustodyEvent}
          className="grid gap-4 rounded-2xl border border-border bg-card p-5 sm:grid-cols-2"
        >
          <input type="hidden" name="lot_id" value={lot.id} />
          <label className="flex flex-col gap-1 text-sm">
            {t("من", "From")}
            <input
              name="from_party"
              required
              defaultValue={lastParty !== "—" ? lastParty : ""}
              className={field}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            {t("إلى", "To")}
            <input name="to_party" required className={field} />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            {t("الصفة", "Role")}
            <select name="role" className={field} defaultValue="transporter">
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {role(r)}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            {t("التاريخ", "Date")}
            <input type="date" name="occurred_at" required className={field} />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            {t("الوزن (جرام)", "Weight (grams)")}
            <input
              type="number"
              step="0.01"
              min="0.01"
              name="weight_grams"
              required
              className={field}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            {t("العيار (0–1)", "Fineness (0–1)")}
            <input
              type="number"
              step="0.001"
              min="0.001"
              max="1"
              name="fineness"
              required
              className={field}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm sm:col-span-2">
            {t("المكان", "Place")}
            <input name="location" className={field} />
          </label>
          <button
            type="submit"
            className="rounded-lg bg-primary px-4 py-2.5 font-medium text-primary-foreground hover:opacity-90 sm:col-span-2"
          >
            {t("أضف الحلقة", "Add the link")}
          </button>
          <p className="text-xs text-muted sm:col-span-2">
            {t(
              "بعد الإضافة لا يمكن تعديل الحلقة ولا حذفها — صحّح بإضافة حلقة تالية.",
              "Once added, a link cannot be edited or deleted — correct it by adding a following link.",
            )}
          </p>
        </form>
      </section>
    </div>
  );
}
