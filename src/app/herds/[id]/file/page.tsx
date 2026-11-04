import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import PrintButton from "@/components/PrintButton";
import { createClient } from "@/lib/supabase/server";
import { loginHrefHere } from "@/lib/loginHere";
import { KIND_LABEL, TAG_STATUS_LABEL, healthItemName, tagCounts, type HealthRecord, type HerdTag } from "@/lib/herdHealth";
import { PURPOSE_LABEL, PURPOSE_LABEL_EN, SPECIES_LABEL, SPECIES_LABEL_EN } from "@/lib/livestock";
import { locustDay } from "@/lib/locust";
import { stateName } from "@/lib/nafir";
import { getLocale } from "@/lib/locale";
import { tr } from "@/lib/i18n";
import type { Herd } from "@/types/database";

export async function generateMetadata() {
  const locale = await getLocale();
  return { title: tr(locale, "ملفّ القطيع | سوداقري", "Herd file | Sudagri") };
}

/**
 * «ملفّ القطيع» — one page the owner prints, or saves as PDF from the print
 * sheet, and hands to the exporter and the quarantine vet (backlog 117).
 * Everything here is what the owner recorded; the footer says so, and that
 * the health certificate is the quarantine's alone. Withdrawn entries stay,
 * struck through with their reason, because a file that hides its
 * corrections is worth less to the vet than one that shows them.
 */
export default async function HerdFilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(await loginHrefHere());

  const locale = await getLocale();
  const t = (ar: string, en: string) => tr(locale, ar, en);
  const en = locale === "en";

  const { data: herdRow } = await supabase.from("herds").select("*").eq("id", id).single();
  if (!herdRow) notFound();
  const herd = herdRow as Herd;

  const [{ data: recordRows }, { data: tagRows }, { data: owner }, { data: land }] = await Promise.all([
    supabase
      .from("herd_health_records")
      .select("id, kind, item_key, done_on, heads, result, product, batch, vet_name, note, withdrawn_at, withdrawn_note, created_at")
      .eq("herd_id", id)
      .order("kind")
      .order("done_on", { ascending: false }),
    supabase.from("herd_tags").select("tag, status, added_on").eq("herd_id", id).order("tag"),
    supabase.from("profiles").select("full_name").eq("id", herd.owner_id).maybeSingle(),
    herd.land_id
      ? supabase.from("lands").select("name, state, locality").eq("id", herd.land_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  const records = (recordRows ?? []) as HealthRecord[];
  const tags = (tagRows ?? []) as HerdTag[];
  const counts = tagCounts(tags);
  const today = new Date().toISOString().slice(0, 10);
  const cell = "border border-border px-2 py-1 text-start align-top";

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 print:max-w-none print:px-0 print:py-0">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2 print:hidden">
        <Link href={`/herds/${id}#readiness`} className="text-sm text-primary underline">
          {t("رجوع إلى القطيع", "Back to the herd")}
        </Link>
        <PrintButton label={t("اطبع أو احفظ PDF", "Print or save as PDF")} />
      </div>

      <h1 className="text-2xl font-bold">{t("ملفّ القطيع", "Herd file")}</h1>
      <p className="mt-1 text-sm text-muted">
        {t(`أُعدّ في ${locustDay(today, "ar")} من سجلّ صاحب القطيع في سوداقري`, `Prepared on ${locustDay(today, "en")} from the owner's record on Sudagri`)}
      </p>

      <table className="mt-4 w-full border-collapse text-sm">
        <tbody>
          <tr><th className={cell}>{t("القطيع", "Herd")}</th><td className={cell}>{herd.name}</td></tr>
          <tr><th className={cell}>{t("صاحبه", "Owner")}</th><td className={cell}>{(owner as { full_name: string | null } | null)?.full_name || "—"}</td></tr>
          <tr>
            <th className={cell}>{t("النوع والغرض", "Species and purpose")}</th>
            <td className={cell}>
              {(en ? SPECIES_LABEL_EN : SPECIES_LABEL)[herd.species]} — {(en ? PURPOSE_LABEL_EN : PURPOSE_LABEL)[herd.purpose]}
              {herd.breed && ` — ${herd.breed}`}
            </td>
          </tr>
          <tr><th className={cell}>{t("عدد الرؤوس", "Head")}</th><td className={cell} dir="ltr">{herd.head_count}</td></tr>
          {land && (
            <tr>
              <th className={cell}>{t("المكان", "Place")}</th>
              <td className={cell}>
                {[(land as { name: string }).name, (land as { locality: string | null }).locality, stateName((land as { state: string }).state, locale)]
                  .filter(Boolean)
                  .join(t("، ", ", "))}
              </td>
            </tr>
          )}
          <tr><th className={cell}>{t("بداية الدورة", "Cycle start")}</th><td className={cell}>{locustDay(herd.start_date, locale)}</td></tr>
        </tbody>
      </table>

      <h2 className="mt-6 text-lg font-bold">{t("التطعيمات والفحوص والعلاج", "Vaccinations, tests and treatment")}</h2>
      {records.length === 0 ? (
        <p className="mt-2 text-sm text-muted">{t("لم يُسجَّل شيء.", "Nothing recorded.")}</p>
      ) : (
        <table className="mt-2 w-full border-collapse text-sm">
          <thead className="bg-background">
            <tr>
              <th className={cell}>{t("ماذا", "What")}</th>
              <th className={cell}>{t("التاريخ", "Date")}</th>
              <th className={cell}>{t("الرؤوس", "Head")}</th>
              <th className={cell}>{t("اللقاح، التشغيلة، الطبيب", "Product, batch, vet")}</th>
            </tr>
          </thead>
          <tbody>
            {records.map((r) => (
              <tr key={r.id} className={r.withdrawn_at ? "text-muted" : ""}>
                <td className={`${cell} ${r.withdrawn_at ? "line-through" : ""}`}>
                  {en ? KIND_LABEL[r.kind].en : KIND_LABEL[r.kind].ar}: {healthItemName(r.item_key, en)}
                  {r.result && ` — ${r.result === "positive" ? t("إيجابيّ", "positive") : t("سلبيّ", "negative")}`}
                  {r.withdrawn_at && (
                    <span className="block text-xs no-underline">{t("سُحب: ", "Withdrawn: ")}{r.withdrawn_note}</span>
                  )}
                </td>
                <td className={cell}>{locustDay(r.done_on, locale)}</td>
                <td className={cell} dir="ltr">{r.heads}</td>
                <td className={cell}>{[r.product, r.batch && `${t("تشغيلة", "batch")} ${r.batch}`, r.vet_name, r.note].filter(Boolean).join(" · ") || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <h2 className="mt-6 text-lg font-bold">{t("أرقام الآذان", "Ear tags")}</h2>
      <p className="mt-1 text-sm">
        {t(`في القطيع: ${counts.present} من ${herd.head_count}`, `In the herd: ${counts.present} of ${herd.head_count}`)}
        {(["sold", "dead", "exported"] as const)
          .filter((s) => counts[s] > 0)
          .map((s) => ` · ${en ? TAG_STATUS_LABEL[s].en : TAG_STATUS_LABEL[s].ar}: ${counts[s]}`)
          .join("")}
      </p>
      {tags.length > 0 && (
        <p className="mt-2 text-xs leading-6" dir="ltr">
          {tags.map((x) => (x.status === "present" ? x.tag : `${x.tag} (${TAG_STATUS_LABEL[x.status].en.toLowerCase()})`)).join(" · ")}
        </p>
      )}

      <p className="mt-8 border-t border-border pt-3 text-xs leading-relaxed text-muted">
        {t(
          "هذا الملفّ سجلٌّ يحفظه صاحب القطيع ويكتبه بنفسه في منصّة سوداقري. ليس شهادةً صحّيّة ولا شهادة منشأ: الشهادة الصحّيّة يصدرها المحجر البيطريّ وحده بعد الفحص. والقيود المشطوبة سحبها صاحبها بسببها المكتوب، ولم تُحذف.",
          "This file is a record kept and written by the herd's owner on the Sudagri platform. It is not a health certificate or a certificate of origin: only the veterinary quarantine issues the health certificate, after inspection. Struck-through entries were withdrawn by the owner for the reason shown, not deleted.",
        )}
      </p>
    </div>
  );
}
