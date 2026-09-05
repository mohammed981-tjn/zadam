import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { verifyLand, rejectLand } from "@/app/lands/actions";
import type { Land, LandDocument } from "@/types/database";

export const metadata = { title: "توثيق الأراضي | سودجري" };

const date = (iso: string) =>
  new Date(iso).toLocaleDateString("ar-EG", {
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
  if (!user) redirect("/login");

  // نفسُ حارس بقيّة شاشات الإدارة. ويُفحص هنا كي لا تُرسم الصفحةُ لغير مدير،
  // ويُفحص ثانيةً داخل الإجراء نفسِه — فطلبٌ مصنوعٌ باليد لا يمرّ.
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if ((profile as { role: string } | null)?.role !== "admin") redirect("/");

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

  const waiting = lands.filter((l) => l.verification !== "verified");
  const done = lands.filter((l) => l.verification === "verified");

  const card = "rounded-2xl border border-border bg-card p-5";
  const field =
    "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm";

  const Plot = ({ land }: { land: Land }) => {
    const mine = docs.filter((d) => d.land_id === land.id);
    const kinds = [...new Set(mine.map((d) => d.kind))];
    const enough = land.documents_on_file >= land.documents_required;

    return (
      <li className={card}>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="font-bold">{land.name}</h3>
          <span className="text-xs text-muted">
            {date(land.created_at)} · {TENURE_LABEL[land.tenure] ?? land.tenure}
          </span>
        </div>

        <p className="mt-1 text-sm text-muted">
          {[land.state, land.locality, land.village].filter(Boolean).join(" · ")}
          {" · "}
          {land.feddans} فدان
          {land.latitude ? ` · ${land.latitude}, ${land.longitude}` : ""}
        </p>

        <p className="mt-3 text-sm">
          المستندات{" "}
          <strong className={enough ? "text-primary" : "text-danger"}>
            {land.documents_on_file}/{land.documents_required}
          </strong>{" "}
          <span className="text-xs text-muted">
            {/* العدّادُ يعدّ الأنواع لا الملفّات، وزنادٌ في القاعدة يحسبه —
                فلا يقول الرقمُ أكثر ممّا ترفعه الملفّات. */}
            (تُعدّ الأنواع لا عدد الملفّات)
          </span>
        </p>

        {mine.length === 0 ? (
          <p className="mt-2 text-sm text-danger">لم يُرفع أيّ مستند.</p>
        ) : (
          <ul className="mt-2 space-y-1 text-sm text-muted">
            {kinds.map((k) => (
              <li key={k}>
                ✓ {DOC_LABEL[k] ?? k} ({mine.filter((d) => d.kind === k).length})
              </li>
            ))}
          </ul>
        )}

        {land.verification === "rejected" && land.verification_note && (
          <p className="mt-3 rounded-lg border border-danger/40 bg-danger/5 p-3 text-sm text-danger">
            رُدَّت سابقاً: {land.verification_note}
          </p>
        )}

        {/*
          الملفّاتُ نفسُها لا تُعرض هنا، وهذا نقصٌ أُقرّ به: دلوُ الأدلّة خاصّ،
          وعرضُ الملفّ يحتاج رابطاً موقَّعاً يُولَّد على الخادم. فالموظّفُ يرى
          اليومَ أنّ المستندَ **موجودٌ ونوعه**، ولا يرى محتواه — وهذه مراجعةُ
          اكتمالٍ لا مراجعةُ مضمون. تُستكمل برابطٍ موقَّت.
        */}
        <p className="mt-3 text-xs text-muted">
          يُعرض هنا وجودُ المستند ونوعُه لا محتواه — عرضُ الملفّ يحتاج رابطاً
          موقَّتاً يُولَّد على الخادم، ولم يُبنَ بعد.
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
              disabled={!enough}
              title={
                enough
                  ? undefined
                  : "الزنادُ في القاعدة يرفض النشر بمستنداتٍ ناقصة"
              }
              className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
            >
              وثّق وانشر
            </button>
          </form>

          <form action={rejectLand} className="flex flex-1 flex-wrap gap-2">
            <input type="hidden" name="id" value={land.id} />
            <input
              name="verification_note"
              placeholder="سبب الردّ — يقرأه صاحب الأرض"
              className={`${field} min-w-48 flex-1`}
            />
            <button
              type="submit"
              className="rounded-lg border border-danger/40 px-4 py-2 text-sm font-medium text-danger hover:bg-danger/5"
            >
              ردّ
            </button>
          </form>
        </div>

        {!enough && (
          <p className="mt-2 text-xs text-muted">
            التوثيقُ معطَّل حتى تكتمل المستندات — والقاعدةُ ترفضه أيضاً، فالزرُّ
            هنا يوافق الحارسَ لا يسبقه.
          </p>
        )}
      </li>
    );
  };

  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      <h1 className="text-2xl font-bold">توثيق الأراضي</h1>
      <p className="mt-2 max-w-2xl text-sm leading-7 text-muted">
        ما يُوثَّق هنا يصير <strong>منشوراً</strong>: يظهر في جواز صاحبه، ويصلح
        سنداً لعرض تصدير. وما تشهد به المنصّةُ هو أنّ المستنداتِ موجودةٌ ومطابقةٌ
        لما تقوله الأرض — لا صحّةُ الملكيّة أمام القضاء.
      </p>

      {error && (
        <p className="mt-4 rounded-lg border border-danger/40 bg-danger/5 p-3 text-sm text-danger">
          {error}
        </p>
      )}

      <h2 className="mt-8 mb-4 text-lg font-bold">
        بانتظار المراجعة ({waiting.length})
      </h2>
      {waiting.length === 0 ? (
        <p className={`${card} text-sm text-muted`}>لا أراضٍ تنتظر.</p>
      ) : (
        <ul className="flex flex-col gap-4">
          {waiting.map((l) => (
            <Plot key={l.id} land={l} />
          ))}
        </ul>
      )}

      <h2 className="mt-10 mb-4 text-lg font-bold">
        موثّقة ({done.length})
      </h2>
      {done.length === 0 ? (
        <p className={`${card} text-sm text-muted`}>لا شيء بعد.</p>
      ) : (
        <ul className="flex flex-col gap-4">
          {done.map((l) => (
            <li key={l.id} className={card}>
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="font-bold">{l.name}</h3>
                <span className="text-xs text-primary">موثّقة ومنشورة</span>
              </div>
              <p className="mt-1 text-sm text-muted">
                {[l.state, l.locality].filter(Boolean).join(" · ")} · {l.feddans}{" "}
                فدان · المستندات {l.documents_on_file}/{l.documents_required}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
