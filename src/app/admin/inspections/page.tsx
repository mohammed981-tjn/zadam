import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getLocale } from "@/lib/locale";
import { tr } from "@/lib/i18n";
import PageHeader from "@/components/PageHeader";
import ActionNotice from "@/components/ActionNotice";
import { serviceKindLabel, type ServiceKind } from "@/lib/services";
import { INSPECTION_STATUS_LABEL, VERDICT_LABEL, feeLine, type InspectionStatus, type InspectionVerdict } from "@/lib/inspections";
import { button, card, field, ghost, label } from "@/lib/ui";
import {
  assignInspection,
  cancelInspectionAsAdmin,
  markInspectionPaid,
  setInspectionFee,
} from "@/app/invest/inspections/actions";

export const metadata = { title: "المعاينات | الإدارة | سوداقري" };

interface Row {
  id: string;
  ref: string | null;
  land_id: string;
  owner_id: string;
  investor_id: string;
  inspector_id: string | null;
  status: InspectionStatus;
  fee_sdg: number | null;
  fee_status: "free" | "due" | "paid";
  visit_on: string | null;
  verdict: InspectionVerdict | null;
  created_at: string;
}

/**
 * تقارير المعاينة — شاشة الإدارة (البند ١٢٨).
 *
 * The fee for new requests (empty is free, for the trial season), and every
 * inspection by what it waits for: the fee to be recorded, an inspector to be
 * assigned, the report. An inspector is any verified provider or an
 * administrator; the database refuses the land's owner, the investor, and
 * anyone with a partnership request on the same land.
 */
export default async function AdminInspectionsPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const sp = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: me } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if ((me as { role: string } | null)?.role !== "admin") redirect("/");

  const locale = await getLocale();
  const t = (ar: string, en: string) => tr(locale, ar, en);
  const lbl = (b: { ar: string; en: string }) => tr(locale, b.ar, b.en);

  const [{ data: rowsData, error }, { data: feeRow }, { data: providerRows }, { data: adminRows }] = await Promise.all([
    supabase
      .from("land_inspections")
      .select("id, ref, land_id, owner_id, investor_id, inspector_id, status, fee_sdg, fee_status, visit_on, verdict, created_at")
      .order("created_at", { ascending: false })
      .limit(200),
    supabase.from("platform_fees").select("amount_sdg").eq("key", "land_inspection").maybeSingle(),
    supabase
      .from("service_providers")
      .select("owner_id, name, kind, regions")
      .eq("active", true)
      .not("verified_at", "is", null)
      .order("name"),
    supabase.from("profiles").select("id, full_name").eq("role", "admin"),
  ]);
  const rows = (rowsData ?? []) as Row[];
  const fee = (feeRow as { amount_sdg: number | null } | null)?.amount_sdg ?? null;
  const providers = (providerRows ?? []) as { owner_id: string; name: string; kind: ServiceKind; regions: string[] }[];
  const admins = (adminRows ?? []) as { id: string; full_name: string | null }[];

  const landIds = [...new Set(rows.map((r) => r.land_id))];
  const peopleIds = [...new Set(rows.flatMap((r) => [r.owner_id, r.investor_id, r.inspector_id]).filter(Boolean) as string[])];
  const [{ data: landRows }, { data: peopleRows }] = await Promise.all([
    landIds.length ? supabase.from("lands").select("id, name, state, locality, feddans").in("id", landIds) : Promise.resolve({ data: [] }),
    peopleIds.length ? supabase.from("profiles").select("id, full_name, phone").in("id", peopleIds) : Promise.resolve({ data: [] }),
  ]);
  const lands = new Map(
    ((landRows ?? []) as { id: string; name: string | null; state: string | null; locality: string | null; feddans: number }[]).map((l) => [l.id, l]),
  );
  const people = new Map(((peopleRows ?? []) as { id: string; full_name: string | null; phone: string | null }[]).map((p) => [p.id, p]));
  const name = (id: string | null) => (id ? (people.get(id)?.full_name ?? "—") : "—");

  const waitingFee = rows.filter((r) => r.status === "accepted" && r.fee_status === "due");
  const waitingInspector = rows.filter((r) => r.status === "accepted" && r.fee_status !== "due");
  const inField = rows.filter((r) => r.status === "assigned");
  const waitingOwner = rows.filter((r) => r.status === "requested");
  const done = rows.filter((r) => ["reported", "declined", "cancelled"].includes(r.status));
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Khartoum" });

  const Head = ({ r }: { r: Row }) => {
    const l = lands.get(r.land_id);
    return (
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <Link href={`/invest/inspections/${r.id}`} className="font-black text-primary underline">
            {[l?.name, l?.state, l?.locality].filter(Boolean).join(" · ") || t("أرض", "Land")}
          </Link>
          <p className="text-xs text-muted">
            {t("المستثمر: ", "Investor: ")}
            <bdi>{name(r.investor_id)}</bdi> · {t("صاحب الأرض: ", "Owner: ")}
            <bdi>{name(r.owner_id)}</bdi>
            {r.inspector_id && (
              <>
                {" · "}
                {t("المفتّش: ", "Inspector: ")}
                <bdi>{name(r.inspector_id)}</bdi>
              </>
            )}
          </p>
        </div>
        <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-bold text-primary">
          {r.verdict ? lbl(VERDICT_LABEL[r.verdict]) : lbl(INSPECTION_STATUS_LABEL[r.status])}
        </span>
      </div>
    );
  };

  const Cancel = ({ r }: { r: Row }) => (
    <details className="mt-2 text-xs">
      <summary className="cursor-pointer text-muted underline">{t("ألغِ المعاينة", "Cancel the inspection")}</summary>
      <form action={cancelInspectionAsAdmin} className="mt-2 flex flex-wrap items-end gap-2">
        <input type="hidden" name="inspection_id" value={r.id} />
        <input name="reason" required minLength={5} maxLength={300} className={field} placeholder={t("السبب، يصل المستثمر", "The reason, sent to the investor")} />
        <button className={ghost}>{t("ألغِ", "Cancel")}</button>
      </form>
    </details>
  );

  const Assign = ({ r }: { r: Row }) => {
    const state = lands.get(r.land_id)?.state ?? "";
    const near = providers.filter((p) => p.owner_id !== r.owner_id && p.owner_id !== r.investor_id);
    const sorted = [...near.filter((p) => p.regions.includes(state)), ...near.filter((p) => !p.regions.includes(state))];
    return (
      <form action={assignInspection} className="mt-3 flex flex-wrap items-end gap-2 text-sm">
        <input type="hidden" name="inspection_id" value={r.id} />
        <label className={label}>
          {t("المفتّش", "Inspector")}
          <select name="inspector_id" required className={field} defaultValue="">
            <option value="" disabled>
              {t("اختر", "Choose")}
            </option>
            <optgroup label={t("مقدّمو خدمة موثّقون", "Verified providers")}>
              {sorted.map((p) => (
                <option key={p.owner_id} value={p.owner_id}>
                  {p.name} — {serviceKindLabel(p.kind, locale)}
                  {p.regions.includes(state) ? ` · ${state}` : ""}
                </option>
              ))}
            </optgroup>
            <optgroup label={t("الإدارة", "Administrators")}>
              {admins.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.full_name ?? t("مدير", "Administrator")}
                </option>
              ))}
            </optgroup>
          </select>
        </label>
        <label className={label}>
          {t("موعد الزيارة (اختياري)", "Visit date (optional)")}
          <input type="date" name="visit_on" min={today} className={field} />
        </label>
        <button className={button}>{r.inspector_id ? t("أعد الإسناد", "Reassign") : t("أسند", "Assign")}</button>
      </form>
    );
  };

  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      <PageHeader icon="shield" eyebrow={t("الإدارة", "Administration")} title={t("تقارير المعاينة", "Inspection reports")}>
        {t(
          "يطلب المستثمر معاينةً لأرضٍ معروضة، ويوافق صاحبها، ثمّ تُسجّل هنا وصول الأجر إن كان، وتُسند المعاينة إلى مفتّشٍ ليس طرفاً. التقرير يُكتب من صفحته ويُقفل ببصمة.",
          "An investor asks to inspect an offered land and its owner agrees; here you record the fee if there is one and assign an inspector who is party to nothing. The report is written on its page and sealed with a fingerprint.",
        )}
      </PageHeader>
      <ActionNotice ok={sp.ok} error={sp.error} />

      {error && (
        <p className={`${card} mb-6 text-sm text-muted`}>
          {t("تُفعَّل المعاينات بعد تطبيق هجرتها.", "Inspections switch on once their migration is applied.")}
        </p>
      )}

      {/* ── الأجر ─────────────────────────────────────────────────────── */}
      <section className={`${card} mb-6`}>
        <h2 className="font-black">{t("أجر المعاينة", "Inspection fee")}</h2>
        <p className="mt-1 text-sm">{feeLine(fee, locale)}</p>
        <form action={setInspectionFee} className="mt-3 flex flex-wrap items-end gap-2 text-sm">
          <label className={label}>
            {t("الأجر بالجنيه (اتركه فارغاً للمجّانيّ)", "Fee in SDG (leave empty for free)")}
            <input name="amount" inputMode="numeric" defaultValue={fee ?? ""} className={field} />
          </label>
          <button className={ghost}>{t("احفظ", "Save")}</button>
        </form>
        <p className="mt-2 text-xs leading-5 text-muted">
          {t(
            "أجرٌ ثابت يُدفع أيّاً كانت خلاصة التقرير، ولا يُستحقّ قبل موافقة صاحب الأرض. يُطبَّق على الطلبات الجديدة وحدها. يُدفع لسوداقري خارج المنصّة، وتسجّل وصوله هنا.",
            "A fixed fee paid whatever the report says, and not due before the owner agrees. It applies to new requests only. It is paid to Sudagri outside the platform; you record its arrival here.",
          )}
        </p>
      </section>

      {[
        { title: t("بانتظار الأجر", "Waiting for the fee"), items: waitingFee, kind: "fee" as const },
        { title: t("بانتظار مفتّش", "Waiting for an inspector"), items: waitingInspector, kind: "assign" as const },
        { title: t("في الميدان", "In the field"), items: inField, kind: "field" as const },
        { title: t("بانتظار صاحب الأرض", "Waiting for the owner"), items: waitingOwner, kind: "owner" as const },
        { title: t("منتهية", "Finished"), items: done, kind: "done" as const },
      ].map((s) => (
        <section key={s.kind} className="mb-6">
          <h2 className="title-bar mb-3 font-black">
            {s.title} <span className="text-muted">({s.items.length})</span>
          </h2>
          {s.items.length === 0 ? (
            <p className="text-sm text-muted">{t("لا شيء.", "Nothing.")}</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {s.items.map((r) => (
                <li key={r.id} className={card}>
                  <Head r={r} />
                  {s.kind === "fee" && (
                    <form action={markInspectionPaid} className="mt-3">
                      <input type="hidden" name="inspection_id" value={r.id} />
                      <p className="mb-2 text-sm">
                        {feeLine(r.fee_sdg, locale)}{" "}
                        {t("هاتف المستثمر: ", "Investor's phone: ")}
                        <bdi>{people.get(r.investor_id)?.phone ?? "—"}</bdi>
                      </p>
                      <button className={button}>{t("وصل الأجر", "Fee received")}</button>
                    </form>
                  )}
                  {(s.kind === "assign" || s.kind === "field") && <Assign r={r} />}
                  {s.kind === "field" && r.visit_on && (
                    <p className="mt-2 text-xs text-muted">
                      {t("موعد الزيارة: ", "Visit: ")}
                      {r.visit_on}
                    </p>
                  )}
                  {s.kind !== "done" && <Cancel r={r} />}
                  {s.kind === "done" && r.ref && <p className="mt-1 text-xs text-muted" dir="ltr">{r.ref}</p>}
                </li>
              ))}
            </ul>
          )}
        </section>
      ))}
    </div>
  );
}
