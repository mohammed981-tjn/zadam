import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getLocale } from "@/lib/locale";
import { tr } from "@/lib/i18n";
import ActionNotice from "@/components/ActionNotice";
import InspectionPhotoUpload from "@/components/invest/InspectionPhotoUpload";
import { waterSourceLabel } from "@/lib/farmLabelsEn";
import { wrbShort, wrbShortEn } from "@/lib/soilClasses";
import {
  CHECK_DETAIL,
  CHECK_LABEL,
  INSPECTION_STATUS_LABEL,
  RESULT_LABEL,
  RESULTS,
  VERDICT_LABEL,
  VERDICT_TONE,
  VERDICTS,
  feeLine,
  type InspectionView,
} from "@/lib/inspections";
import { button, card, field, ghost, label } from "@/lib/ui";
import {
  cancelInspection,
  decideInspection,
  removeInspectionPhoto,
  replyToInspection,
  submitInspection,
} from "../actions";

export async function generateMetadata() {
  const locale = await getLocale();
  // Between the investor, the owner and the inspector: never indexed.
  return { title: tr(locale, "تقرير معاينة | سوداقري", "Inspection report | Sudagri"), robots: { index: false, follow: false } };
}

/**
 * تقرير معاينة أرضٍ معروضة (البند ١٢٨).
 *
 * One page for everyone in the inspection, each seeing what
 * land_inspection_view() lets them: the investor never the land's name, village,
 * coordinates or owner; the inspector all of them, to make the visit; the owner
 * their own land and who asked. The inspector writes the report here; once
 * sent it is sealed with a reference and a fingerprint, and the owner may answer
 * it once, beneath it.
 */
export default async function InspectionPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const locale = await getLocale();
  const t = (ar: string, en: string) => tr(locale, ar, en);
  const lbl = (b: { ar: string; en: string }) => tr(locale, b.ar, b.en);
  const arText = locale === "en" ? ({ lang: "ar", dir: "auto" } as const) : {};

  const { data, error } = await supabase.rpc("land_inspection_view", { p_id: id });
  if (error || !data) notFound();
  const v = data as InspectionView;

  // Ten-minute links to the photos; the bucket's policy decides who may open them.
  const signed = new Map<string, string>();
  if (v.photos.length > 0) {
    const { data: urls } = await supabase.storage.from("evidence").createSignedUrls(
      v.photos.map((p) => p.path),
      600,
    );
    for (const u of urls ?? []) if (u.path && u.signedUrl) signed.set(u.path, u.signedUrl);
  }

  const fmt = (iso: string | null, withTime = false) =>
    iso
      ? new Date(iso).toLocaleString(locale === "en" ? "en-GB" : "ar-EG", {
          dateStyle: "long",
          ...(withTime ? { timeStyle: "short" as const } : {}),
          timeZone: "Africa/Khartoum",
        })
      : "—";
  const num = (n: number) => Number(n).toLocaleString("en-US");
  const soil = (s: string | null) => (s ? (locale === "en" ? wrbShortEn(s) : wrbShort(s)) : "—");

  const backHref =
    v.me === "owner" ? "/lands" : v.me === "admin" ? "/admin/inspections" : "/invest/mine";
  const backLabel =
    v.me === "owner" ? t("← أراضيّ", "← My land") : v.me === "admin" ? t("← المعاينات", "← Inspections") : t("← طلباتي", "← My requests");
  const reported = v.status === "reported";
  const writing = v.me === "inspector" && v.status === "assigned";
  const finding = new Map((v.findings ?? []).map((f) => [f.key, f]));

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <Link href={backHref} className="text-sm font-bold text-primary underline">
        {backLabel}
      </Link>

      <header className="mt-4 mb-5">
        <p className="mb-2 inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-xs font-bold text-primary">
          {lbl(INSPECTION_STATUS_LABEL[v.status])}
        </p>
        <h1 className="title-bar font-black leading-tight" style={{ fontSize: "var(--text-title)" }}>
          {t("تقرير معاينة أرض", "Land inspection report")}
        </h1>
        {v.ref && (
          <p className="mt-2 text-sm font-bold text-leaf">
            {t("رقم التقرير:", "Reference:")} <bdi dir="ltr">{v.ref}</bdi>
          </p>
        )}
      </header>

      <ActionNotice ok={sp.ok} error={sp.error} />

      {/* ── الأرض ─────────────────────────────────────────────────────── */}
      <section className={`${card} mb-4`}>
        <h2 className="font-black">
          <span {...arText}>{[v.land.name, v.land.state, v.land.locality].filter(Boolean).join(" · ")}</span>
        </h2>
        <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-sm sm:grid-cols-4">
          <div>
            <dt className="text-xs text-muted">{t("المساحة المسجّلة", "Registered area")}</dt>
            <dd className="font-medium">
              {num(v.land.feddans)} {t("فدان", "feddans")}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted">{t("مصدر المياه", "Water source")}</dt>
            <dd className="font-medium">{v.land.water_source ? waterSourceLabel(v.land.water_source, locale) : "—"}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted">{t("التربة", "Soil")}</dt>
            <dd className="font-medium">{soil(v.land.soil_class)}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted">{t("المستندات", "Documents")}</dt>
            <dd className="font-medium">{v.land.documents_on_file ?? 0}</dd>
          </div>
        </dl>

        {(v.me === "inspector" || v.me === "admin") && (
          <div className="mt-3 rounded-xl bg-leaf/5 p-3 text-sm ring-1 ring-leaf/20">
            <p className="font-bold text-leaf">{t("للزيارة — لا يراها المستثمر", "For the visit — the investor does not see this")}</p>
            <dl className="mt-2 grid gap-1 sm:grid-cols-2">
              <div>
                <dt className="text-xs text-muted">{t("صاحب الأرض", "Owner")}</dt>
                <dd className="font-medium" {...arText}>{v.owner_name ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted">{t("هاتفه", "Phone")}</dt>
                <dd className="font-medium">
                  {v.owner_phone ? (
                    <a href={`tel:${v.owner_phone}`} className="text-primary underline">
                      <bdi>{v.owner_phone}</bdi>
                    </a>
                  ) : (
                    t("لم يضف هاتفاً — اطلبه من الإدارة", "None on file — ask the administrators")
                  )}
                </dd>
              </div>
              {v.land.village && (
                <div>
                  <dt className="text-xs text-muted">{t("القرية", "Village")}</dt>
                  <dd className="font-medium" {...arText}>{v.land.village}</dd>
                </div>
              )}
              {v.land.latitude !== null && v.land.longitude !== null && (
                <div>
                  <dt className="text-xs text-muted">{t("الموقع", "Location")}</dt>
                  <dd>
                    <a
                      href={`https://www.google.com/maps?q=${v.land.latitude},${v.land.longitude}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-medium text-primary underline"
                    >
                      {t("افتح الخريطة", "Open the map")}
                    </a>
                  </dd>
                </div>
              )}
            </dl>
          </div>
        )}
      </section>

      {/* ── الطلب ─────────────────────────────────────────────────────── */}
      <section className={`${card} mb-4 text-sm`}>
        <h2 className="font-black">{t("ما طُلب التحقّق منه", "What was asked to be checked")}</h2>
        <ul className="mt-2 flex flex-col gap-2">
          {v.checks.map((c) => (
            <li key={c}>
              <span className="font-bold">{lbl(CHECK_LABEL[c])}</span>
              <span className="block text-xs leading-5 text-muted">{lbl(CHECK_DETAIL[c])}</span>
            </li>
          ))}
        </ul>
        {v.investor_note && (
          <blockquote className="mt-3 whitespace-pre-line rounded-xl bg-background px-3 py-2 [overflow-wrap:anywhere]" {...arText}>
            «{v.investor_note}»
          </blockquote>
        )}
        <dl className="mt-3 grid gap-1 text-xs text-muted sm:grid-cols-2">
          {v.investor_name && (
            <div>
              {t("طلبها: ", "Requested by: ")}
              <bdi className="font-bold text-foreground">{v.investor_name}</bdi>
            </div>
          )}
          <div>
            {t("تاريخ الطلب: ", "Requested on: ")}
            {fmt(v.created_at)}
          </div>
          {v.inspector_name && (
            <div>
              {t("المفتّش: ", "Inspector: ")}
              <bdi className="font-bold text-foreground">{v.inspector_name}</bdi>
            </div>
          )}
          {v.visit_on && (
            <div>
              {t("موعد الزيارة: ", "Visit date: ")}
              {fmt(v.visit_on)}
            </div>
          )}
          <div className="sm:col-span-2">
            {t("الأجر: ", "Fee: ")}
            {feeLine(v.fee_sdg, locale)}
            {v.fee_status === "due" && t(" — لم يصل بعد.", " — not yet received.")}
            {v.fee_status === "paid" && t(" — وصل.", " — received.")}
          </div>
        </dl>
      </section>

      {/* ── ما ينتظر من؟ ──────────────────────────────────────────────── */}
      {v.status === "requested" && v.me === "owner" && (
        <section className="mb-4 rounded-2xl border border-primary/30 bg-primary/5 p-4 text-sm">
          <p className="font-bold">
            {t(
              "مستثمرٌ يريد أن يزور مفتّشٌ من سوداقري أرضك ويكتب تقريراً. لا يعرف المستثمر اسمك ولا موقع أرضك، ويقرأ التقرير أنت وهو.",
              "An investor wants a Sudagri inspector to visit your land and write a report. The investor does not learn your name or where the land is; you and they both read the report.",
            )}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <form action={decideInspection}>
              <input type="hidden" name="inspection_id" value={v.id} />
              <input type="hidden" name="accept" value="true" />
              <button className={button}>{t("أوافق على الزيارة", "I agree to the visit")}</button>
            </form>
            <form action={decideInspection}>
              <input type="hidden" name="inspection_id" value={v.id} />
              <input type="hidden" name="accept" value="false" />
              <button className={ghost}>{t("أعتذر", "Decline")}</button>
            </form>
          </div>
        </section>
      )}

      {v.me === "investor" && (v.status === "requested" || v.status === "accepted") && (
        <section className="mb-4 rounded-2xl border border-border p-4 text-sm">
          <p>
            {v.status === "requested"
              ? t("ينتظر الطلب موافقة صاحب الأرض. يصلك إشعارٌ حين يردّ.", "The request is waiting for the owner. You will be notified when they answer.")
              : v.fee_status === "due"
                ? t(
                    "وافق صاحب الأرض. تتواصل معك الإدارة لدفع الأجر، ثمّ تُسند المعاينة إلى مفتّش.",
                    "The owner agreed. The administrators will contact you about the fee, then assign an inspector.",
                  )
                : t("وافق صاحب الأرض. تُسند الإدارة المعاينة إلى مفتّشٍ قريباً.", "The owner agreed. The administrators will assign an inspector shortly.")}
          </p>
          {v.fee_status !== "paid" && (
            <form action={cancelInspection} className="mt-3">
              <input type="hidden" name="inspection_id" value={v.id} />
              <button className={ghost}>{t("ألغِ الطلب", "Cancel the request")}</button>
            </form>
          )}
        </section>
      )}

      {(v.status === "declined" || v.status === "cancelled") && (
        <section className="mb-4 rounded-2xl border border-border p-4 text-sm text-muted">
          {v.status === "declined"
            ? t("اعتذر صاحب الأرض عن المعاينة.", "The owner declined the inspection.")
            : t("أُلغيت المعاينة.", "The inspection was cancelled.")}
          {v.cancel_reason && (
            <span className="block" {...arText}>
              {v.cancel_reason}
            </span>
          )}
        </section>
      )}

      {v.status === "assigned" && v.me !== "inspector" && (
        <section className="mb-4 rounded-2xl border border-border p-4 text-sm">
          {t(
            "المفتّش يزور الأرض ويكتب التقرير. يصلك إشعارٌ حين يُرسَل.",
            "The inspector visits the land and writes the report. You will be notified when it is sent.",
          )}
        </section>
      )}

      {/* ── الصور ─────────────────────────────────────────────────────── */}
      {(writing || reported || v.me === "admin") && (
        <section className={`${card} mb-4`}>
          <h2 className="font-black">
            {t("صور الأرض", "Photos of the land")} <span className="text-muted">({v.photos.length})</span>
          </h2>
          {v.photos.length > 0 && (
            <ul className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
              {v.photos.map((p) => {
                const url = signed.get(p.path);
                return (
                  <li key={p.id} className="text-xs">
                    {url ? (
                      p.path.endsWith(".pdf") ? (
                        <a href={url} target="_blank" rel="noopener noreferrer" className="font-bold text-primary underline">
                          {t("افتح الملف", "Open the file")}
                        </a>
                      ) : (
                        // eslint-disable-next-line @next/next/no-img-element -- a ten-minute signed URL, not a static asset
                        <img src={url} alt={p.caption ?? t("صورة من الأرض", "Photo from the land")} className="aspect-square w-full rounded-xl object-cover" />
                      )
                    ) : (
                      <div className="flex aspect-square items-center justify-center rounded-xl bg-background text-muted">
                        {t("الصورة غير متاحة", "Photo unavailable")}
                      </div>
                    )}
                    {p.caption && (
                      <p className="mt-1 font-medium [overflow-wrap:anywhere]" {...arText}>
                        {p.caption}
                      </p>
                    )}
                    <p className="text-muted">
                      {p.distance_km !== null
                        ? t(`التُقطت على بعد ${p.distance_km} كم من موقع الأرض`, `Taken ${p.distance_km} km from the land's point`)
                        : t("لا موقعَ في الصورة", "No location in the photo")}
                      {p.captured_at ? ` · ${fmt(p.captured_at)}` : ""}
                    </p>
                    {writing && (
                      <form action={removeInspectionPhoto} className="mt-1">
                        <input type="hidden" name="inspection_id" value={v.id} />
                        <input type="hidden" name="photo_id" value={p.id} />
                        <button className="font-bold text-rose underline">{t("احذفها", "Remove")}</button>
                      </form>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
          {writing && (
            <div className="mt-4">
              <p className="mb-2 text-xs leading-5 text-muted">
                {t(
                  "ثلاث صورٍ على الأقلّ واثنتا عشرة على الأكثر، بهاتفك وأنت في الأرض: الماء، والحدود، والتربة، والورق. يُعرض للمستثمر بُعد كلّ صورةٍ عن الأرض، لا موقعها.",
                  "At least three photos and at most twelve, taken with your phone on the land: the water, the boundaries, the soil, the papers. The investor sees each photo's distance from the land, not its location.",
                )}
              </p>
              <InspectionPhotoUpload inspectionId={v.id} />
            </div>
          )}
        </section>
      )}

      {/* ── كتابة التقرير ─────────────────────────────────────────────── */}
      {writing && (
        <form action={submitInspection} className={`${card} mb-4 flex flex-col gap-4 text-sm`}>
          <input type="hidden" name="inspection_id" value={v.id} />
          <h2 className="font-black">{t("اكتب التقرير", "Write the report")}</h2>
          {v.checks.map((c) => (
            <fieldset key={c} className="rounded-xl border border-border p-3">
              <input type="hidden" name="check" value={c} />
              <legend className="px-1 font-bold">{lbl(CHECK_LABEL[c])}</legend>
              <p className="mb-2 text-xs text-muted">{lbl(CHECK_DETAIL[c])}</p>
              <div className="flex flex-wrap gap-3">
                {RESULTS.map((r) => (
                  <label key={r} className="flex items-center gap-1.5">
                    <input type="radio" name={`result_${c}`} value={r} required className="size-4" />
                    {lbl(RESULT_LABEL[r])}
                  </label>
                ))}
              </div>
              <textarea
                name={`note_${c}`}
                rows={2}
                maxLength={500}
                className={`${field} mt-2 w-full`}
                placeholder={t("ما رأيت — يلزم إن كان فيه ملاحظة أو لم تتحقّق منه.", "What you saw — required if there is an issue or you could not check.")}
              />
            </fieldset>
          ))}
          <label className={label}>
            {t("المساحة كما قستها (فدان، اختياري)", "Area as you measured it (feddans, optional)")}
            <input name="measured_feddans" inputMode="decimal" className={field} />
          </label>
          <fieldset className="flex flex-col gap-1.5">
            <legend className="mb-1 font-bold">{t("الخلاصة", "Verdict")}</legend>
            {VERDICTS.map((x) => (
              <label key={x} className="flex items-center gap-2">
                <input type="radio" name="verdict" value={x} required className="size-4" />
                {lbl(VERDICT_LABEL[x])}
              </label>
            ))}
          </fieldset>
          <label className={label}>
            {t("خلاصة التقرير للمستثمر", "Summary for the investor")}
            <textarea
              name="summary"
              rows={4}
              minLength={30}
              maxLength={3000}
              required
              className={field}
              placeholder={t(
                "ما رأيته في الأرض، وما يلزم قبل العقد إن وُجد.",
                "What you saw on the land, and what is needed before an agreement, if anything.",
              )}
            />
          </label>
          <label className="flex items-start gap-2">
            <input type="checkbox" name="independent" value="yes" required className="mt-1 size-4" />
            <span>
              {t(
                "أُقرّ بأن لا قرابة ولا مصلحة لي مع صاحب الأرض ولا مع المستثمر، وأنّ ما كتبته هو ما رأيته في الأرض.",
                "I declare that I have no family tie or interest with the owner or the investor, and that what I wrote is what I saw on the land.",
              )}
            </span>
          </label>
          <p className="text-xs leading-5 text-muted">
            {t(
              "يُقفل التقرير بعد إرساله برقمٍ وبصمة، ولا يُعدَّل. ولصاحب الأرض أن يكتب ردّه تحته مرّة.",
              "Once sent the report is sealed with a reference and a fingerprint and cannot be edited. The owner may write one reply beneath it.",
            )}
          </p>
          <button className={`${button} self-start`}>{t("أرسل التقرير", "Send the report")}</button>
        </form>
      )}

      {/* ── التقرير ───────────────────────────────────────────────────── */}
      {reported && v.verdict && (
        <section className={`${card} mb-4 text-sm`}>
          <p className={`inline-block rounded-full px-3 py-1 text-sm font-black ring-1 ${VERDICT_TONE[v.verdict]}`}>
            {lbl(VERDICT_LABEL[v.verdict])}
          </p>
          <p className="mt-3 whitespace-pre-line leading-7 [overflow-wrap:anywhere]" {...arText}>
            {v.summary}
          </p>
          <ul className="mt-4 flex flex-col gap-2">
            {v.checks.map((c) => {
              const f = finding.get(c);
              return (
                <li key={c} className="rounded-xl bg-background px-3 py-2">
                  <span className="font-bold">{lbl(CHECK_LABEL[c])}</span>
                  {f && <span className="ms-2 text-xs font-bold text-primary">{lbl(RESULT_LABEL[f.result])}</span>}
                  {f?.note && (
                    <span className="block text-xs leading-5 [overflow-wrap:anywhere]" {...arText}>
                      {f.note}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
          {v.measured_feddans !== null && (
            <p className="mt-3">
              {t("المساحة كما قيست: ", "Area as measured: ")}
              <span className="font-bold">
                {num(v.measured_feddans)} {t("فدان", "feddans")}
              </span>
              <span className="text-muted">
                {" "}
                ({t("المسجّلة ", "registered ")}
                {num(v.land.feddans)})
              </span>
            </p>
          )}
          <div className="mt-4 rounded-xl border border-dashed border-leaf/40 p-3 text-xs leading-6">
            <p className="font-bold text-leaf">{t("شهادة سوداقري", "Sudagri's seal")}</p>
            <p>
              {t("كتبه المفتّش ", "Written by inspector ")}
              <bdi className="font-bold">{v.inspector_name ?? "—"}</bdi>
              {t(" في ", " on ")}
              {fmt(v.reported_at, true)}
              {t("، وأقرّ بأن لا مصلحة له مع الطرفين.", ", who declared no interest with either party.")}
            </p>
            <p className="mt-1 break-all font-mono text-[11px] text-muted" dir="ltr">
              SHA-256 {v.report_hash}
            </p>
          </div>

          {v.owner_reply ? (
            <div className="mt-4 rounded-xl bg-primary/5 p-3 ring-1 ring-primary/20">
              <p className="text-xs font-bold text-primary">
                {t("ردّ صاحب الأرض", "The owner's reply")} · {fmt(v.owner_replied_at)}
              </p>
              <p className="mt-1 whitespace-pre-line [overflow-wrap:anywhere]" {...arText}>
                {v.owner_reply}
              </p>
            </div>
          ) : (
            v.me === "owner" && (
              <form action={replyToInspection} className="mt-4 flex flex-col gap-2">
                <input type="hidden" name="inspection_id" value={v.id} />
                <label className={label}>
                  {t("ردّك على التقرير (مرّة واحدة، يقرؤه المستثمر)", "Your reply to the report (once; the investor reads it)")}
                  <textarea name="reply" rows={3} minLength={5} maxLength={1000} required className={field} />
                </label>
                <button className={`${ghost} self-start`}>{t("احفظ الردّ", "Save the reply")}</button>
              </form>
            )
          )}
        </section>
      )}
    </div>
  );
}
