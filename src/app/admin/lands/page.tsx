import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { loginHrefHere } from "@/lib/loginHere";
import { verifyLand, rejectLand } from "@/app/lands/actions";
import type { Land, LandDocument } from "@/types/database";
import { nearLands } from "@/lib/landNeighbours";
import { getLocale } from "@/lib/locale";
import { tr, type Locale } from "@/lib/i18n";

export const metadata = { title: "توثيق الأراضي | سوداقري" };

const date = (iso: string, locale: Locale) =>
  new Date(iso).toLocaleDateString(locale === "en" ? "en-GB" : "ar-EG", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

const DOC_LABEL: Record<string, string> = {
  tenure: "إثبات حيازة",
  photo: "صورة للأرض",
  permit: "تصريح",
  inspection: "تقرير معاينة",
};

const TENURE_LABEL: Record<string, string> = {
  owned: "مملوكة",
  leased: "مستأجرة",
  communal: "مشاع",
  unspecified: "غير محدّدة",
};

const DOC_LABEL_EN: Record<string, string> = {
  tenure: "Proof of tenure",
  photo: "Photo of the land",
  permit: "Permit",
  inspection: "Inspection report",
};

const TENURE_LABEL_EN: Record<string, string> = {
  owned: "Owned",
  leased: "Leased",
  communal: "Communal",
  unspecified: "Not specified",
};

/**
 * توثيقُ الأراضي — الشاشةُ التي كُتب لها الإجراءُ ولم تُبنَ.
 *
 * WHAT WAS ACTUALLY BROKEN
 *
 * `verifyLand` has existed in `src/app/lands/actions.ts` for as long as the
 * lands module has, and it is the **only** code in the entire application that
 * can set `verification = 'verified'`. It redirects to `/admin/lands` on error
 * and revalidates `/admin/lands` on success — a page that did not exist.
 *
 * Nothing called it. Not one screen, not one form. So every plot a farmer ever
 * registered entered as `submitted` and stayed there permanently:
 *
 *   • never `verified`, so never `listed`
 *   • never visible to anyone but its owner
 *   • never present on the farm passport, whose land section filters on exactly
 *     `listed and verification = 'verified'`
 *   • never able to back an export offer
 *
 * The whole chain — أرض موثّقة ← موسم ← جواز ← عرض صادر — could not get past
 * its first step through the product, whatever the database allowed. That is
 * the real reason zero plots exist, underneath the missing links and the hidden
 * button: even a farmer who found the form would have waited forever.
 *
 * ولماذا يظهر الرفضُ بجانب القبول
 *
 * A queue with only an approve button is not a review. Declining had no path
 * except leaving the plot untouched, which the farmer reads as silence — and a
 * farmer cannot fix silence. So a refusal writes a reason into the column their
 * own screen already renders.
 */
export default async function AdminLandsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(await loginHrefHere());

  // نفسُ حارس بقيّة شاشات الإدارة. ويُفحص هنا كي لا تُرسم الصفحةُ لغير مدير،
  // ويُفحص ثانيةً داخل الإجراء نفسِه — فطلبٌ مصنوعٌ باليد لا يمرّ.
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if ((profile as { role: string } | null)?.role !== "admin") redirect("/");

  const locale = await getLocale();
  const t = (ar: string, en: string) => tr(locale, ar, en);
  const docLabel = locale === "en" ? DOC_LABEL_EN : DOC_LABEL;
  const tenureLabel = locale === "en" ? TENURE_LABEL_EN : TENURE_LABEL;

  const { data: landRows } = await supabase
    .from("lands")
    .select("*")
    .order("created_at", { ascending: true });

  const lands = (landRows ?? []) as Land[];

  const { data: docRows } = await supabase
    .from("land_documents")
    .select("id, land_id, kind, caption, created_at");

  const docs = (docRows ?? []) as Pick<
    LandDocument,
    "id" | "land_id" | "kind" | "caption" | "created_at"
  >[];

  // What this administrator has opened (web-flows-3): the database verifies a land only after its verifier opened every
  // document, so the button waits for the same. Before 20261103010000 reaches the site the table is not there, and
  // nothing counts as opened.
  const { data: viewRows } = await supabase.from("land_document_views").select("document_id").eq("admin_id", user.id);
  const opened = new Set(((viewRows ?? []) as { document_id: string }[]).map((v) => v.document_id));

  const waiting = lands.filter((l) => l.verification !== "verified");
  const done = lands.filter((l) => l.verification === "verified");

  const card = "rounded-2xl border border-border bg-card p-5";
  const field =
    "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm";

  const Plot = ({ land }: { land: Land }) => {
    const mine = docs.filter((d) => d.land_id === land.id);
    const kinds = [...new Set(mine.map((d) => d.kind))];
    const enough = land.documents_on_file >= land.documents_required;
    const unread = mine.filter((d) => !opened.has(d.id)).length;
    const own = land.owner_id === user.id;
    const near = nearLands(land, lands);

    return (
      <li className={card}>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="font-bold">{land.name}</h3>
          <span className="text-xs text-muted">
            {date(land.created_at, locale)} · {tenureLabel[land.tenure] ?? land.tenure}
          </span>
        </div>

        <p className="mt-1 text-sm text-muted">
          {[land.state, land.locality, land.village].filter(Boolean).join(" · ")}
          {" · "}
          {land.feddans} {t("فدان", "feddans")}
          {land.latitude ? ` · ${land.latitude}, ${land.longitude}` : ""}
        </p>

        <p className="mt-3 text-sm">
          {t("المستندات", "Documents")}{" "}
          <strong className={enough ? "text-primary" : "text-danger"}>
            {land.documents_on_file}/{land.documents_required}
          </strong>{" "}
          <span className="text-xs text-muted">
            {/* العدّادُ يعدّ الأنواع لا الملفّات، وزنادٌ في القاعدة يحسبه —
                فلا يقول الرقمُ أكثر ممّا ترفعه الملفّات. */}
            {t("(تُعدّ الأنواع لا عدد الملفّات)", "(counts document types, not files)")}
          </span>
        </p>

        {mine.length === 0 ? (
          <p className="mt-2 text-sm text-danger">{t("لم يُرفع أيّ مستند.", "No document uploaded.")}</p>
        ) : (
          <ul className="mt-2 space-y-1 text-sm">
            {kinds.map((k) =>
              mine
                .filter((d) => d.kind === k)
                .map((d) => (
                  <li key={d.id} className="flex flex-wrap items-center gap-2">
                    <span className={opened.has(d.id) ? "text-primary" : "text-muted"}>
                      {opened.has(d.id) ? t("✓ فُتح", "✓ Opened") : t("○ لم يُفتح", "○ Not opened")}
                    </span>
                    <span>
                      {docLabel[k] ?? k}
                      {d.caption ? ` — ${d.caption}` : ""}
                    </span>
                    <a
                      href={`/admin/lands/document/${d.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary underline"
                    >
                      {t("افتح", "Open")}
                    </a>
                  </li>
                )),
            )}
          </ul>
        )}

        {land.verification === "rejected" && land.verification_note && (
          <p className="mt-3 rounded-lg border border-danger/40 bg-danger/5 p-3 text-sm text-danger">
            {t("رُدَّت سابقاً:", "Previously returned:")} {land.verification_note}
          </p>
        )}

        {/* أعادها صاحبُها إلى المراجعة بتغيير وقائعها بعد التوثيق (البند ١٤٢). */}
        {land.verification === "submitted" && land.verification_note && (
          <p className="mt-3 rounded-lg border border-accent/40 bg-accent/5 p-3 text-sm">
            {land.verification_note}
          </p>
        )}

        {/* والنزاعُ يُكشف قبل التوثيق: أرضٌ قريبة من أرضٍ باسمِ مالكٍ آخر. */}
        {near.length > 0 && (
          <div className="mt-3 rounded-lg border border-danger/40 bg-danger/5 p-3 text-sm">
            <p className="font-bold text-danger">
              {t(
                "قريبةٌ من أرضٍ مسجّلة لمالكٍ آخر — تحقّق من الحيازة والحدود قبل التوثيق:",
                "Close to land registered to another owner — check tenure and boundaries before verifying:",
              )}
            </p>
            <ul className="mt-1 space-y-0.5">
              {near.slice(0, 5).map(({ land: other, metres }) => (
                <li key={other.id}>
                  {locale === "en"
                    ? `“${other.name}”, about ${Math.round(metres)} m away`
                    : `«${other.name}» على نحو ${Math.round(metres)} متر`}
                  {other.verification === "verified" ? t(" (موثّقة)", " (verified)") : ""}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* تُوثَّق الأرض بعد فتح مستنداتها كلّها، ولا يوثّق المدير أرضه (فحص 3 نوفمبر: web-flows-3 وdata-quality-5). */}
        <p className="mt-3 text-xs text-muted">
          {own
            ? t(
                "هذه أرضك: لا توثّقها أنت، بل مديرٌ آخر أو معاينةٌ مدفوعة.",
                "This is your land: another administrator or a paid inspection verifies it, not you.",
              )
            : unread > 0
              ? t(
                  `افتح المستندات قبل التوثيق — بقي ${unread}. كلّ فتحٍ يُسجَّل باسمك، والرابط يعيش دقيقتين.`,
                  `Open the documents before verifying — ${unread} left. Each opening is recorded in your name, and the link lasts two minutes.`,
                )
              : t(
                  "فتحتَ المستندات كلّها. يُسجَّل التوثيق باسمك وبمساحة الأرض اليوم.",
                  "You have opened every document. The verification is recorded in your name, with the land's area as of today.",
                )}
        </p>

        <div className="mt-4 flex flex-wrap items-end gap-3">
          <form action={verifyLand}>
            <input type="hidden" name="id" value={land.id} />
            <input
              type="hidden"
              name="documents_on_file"
              value={land.documents_on_file}
            />
            <button
              type="submit"
              disabled={!enough || unread > 0 || own}
              title={
                !enough
                  ? t("الزنادُ في القاعدة يرفض النشر بمستنداتٍ ناقصة", "The database refuses to publish with missing documents")
                  : own
                    ? t("لا يوثّق المدير أرضاً يملكها", "An administrator cannot verify land they own")
                    : unread > 0
                      ? t("افتح المستندات كلّها أوّلاً", "Open every document first")
                      : undefined
              }
              className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {t("وثّق وانشر", "Verify and publish")}
            </button>
          </form>

          <form action={rejectLand} className="flex flex-1 flex-wrap gap-2">
            <input type="hidden" name="id" value={land.id} />
            <input
              name="verification_note"
              placeholder={t("سبب الردّ — يقرأه صاحب الأرض", "Reason for returning — the owner will read it")}
              className={`${field} min-w-48 flex-1`}
            />
            <button
              type="submit"
              className="rounded-lg border border-danger/40 px-4 py-2 text-sm font-medium text-danger hover:bg-danger/5"
            >
              {t("ردّ", "Return")}
            </button>
          </form>
        </div>

        {!enough && (
          <p className="mt-2 text-xs text-muted">
            {t(
              "التوثيقُ معطَّل حتى تكتمل المستندات — والقاعدةُ ترفضه أيضاً، فالزرُّ هنا يوافق الحارسَ لا يسبقه.",
              "Verification is off until the documents are complete — the database refuses it too, so this button follows the guard rather than getting ahead of it.",
            )}
          </p>
        )}
      </li>
    );
  };

  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      <h1 className="text-2xl font-bold">{t("توثيق الأراضي", "Land verification")}</h1>
      <p className="mt-2 max-w-2xl text-sm leading-7 text-muted">
        {locale === "en" ? (
          <>
            What is verified here becomes <strong>published</strong>: it shows on its owner&apos;s passport and can back
            an export offer. What the platform attests is that the documents exist and match what the land record says —
            not that the ownership would stand in court.
          </>
        ) : (
          <>
            ما يُوثَّق هنا يصير <strong>منشوراً</strong>: يظهر في جواز صاحبه، ويصلح
            سنداً لعرض تصدير. وما تشهد به المنصّةُ هو أنّ المستنداتِ موجودةٌ ومطابقةٌ
            لما تقوله الأرض — لا صحّةُ الملكيّة أمام القضاء.
          </>
        )}
      </p>

      {error && (
        <p className="mt-4 rounded-lg border border-danger/40 bg-danger/5 p-3 text-sm text-danger">
          {error}
        </p>
      )}

      <h2 className="mt-8 mb-4 text-lg font-bold">
        {t("بانتظار المراجعة", "Awaiting review")} ({waiting.length})
      </h2>
      {waiting.length === 0 ? (
        <p className={`${card} text-sm text-muted`}>{t("لا أراضٍ تنتظر.", "No land is waiting.")}</p>
      ) : (
        <ul className="flex flex-col gap-4">
          {waiting.map((l) => (
            <Plot key={l.id} land={l} />
          ))}
        </ul>
      )}

      <h2 className="mt-10 mb-4 text-lg font-bold">
        {t("موثّقة", "Verified")} ({done.length})
      </h2>
      {done.length === 0 ? (
        <p className={`${card} text-sm text-muted`}>{t("لا شيء بعد.", "Nothing yet.")}</p>
      ) : (
        <ul className="flex flex-col gap-4">
          {done.map((l) => (
            <li key={l.id} className={card}>
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="font-bold">{l.name}</h3>
                <span className="text-xs text-primary">{t("موثّقة ومنشورة", "Verified and published")}</span>
              </div>
              <p className="mt-1 text-sm text-muted">
                {[l.state, l.locality].filter(Boolean).join(" · ")} · {l.feddans}{" "}
                {t("فدان", "feddans")} · {t("المستندات", "Documents")} {l.documents_on_file}/{l.documents_required}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
