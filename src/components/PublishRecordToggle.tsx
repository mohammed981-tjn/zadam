import { createClient } from "@/lib/supabase/server";
import { setPublishRecord } from "@/app/seasons/actions";

/**
 * «سجلّي: خاصّ أم منشور؟» — والافتراضي خاصّ.
 *
 * WHY THIS IS OPT-IN, AND WHY THAT IS NOT CAUTION
 *
 * The platform's whole claim about itself is that it publishes nothing without
 * grounds: no project before its documents are checked, no figure without its
 * source. Publishing a farmer's season history — including what it earned —
 * without asking them would contradict that in the one place it costs most,
 * because this is the person being asked to hand over their land documents and
 * their season's numbers in the first place.
 *
 * And a losing season follows its owner in public forever. Farming in Sudan
 * loses for reasons that are not the farmer's doing: rain that came late, a
 * market that collapsed, a road that closed. A score does not know the
 * difference.
 *
 * So the flag defaults to false and the farmer turns it on when they want to
 * show an investor their history. That makes the score a paper in their hand
 * rather than a verdict on them — a difference in meaning, not in settings.
 *
 * It is placed on this page rather than on an account screen deliberately: the
 * list of what would be published is directly underneath, so the choice is made
 * while looking at its subject.
 */
export default async function PublishRecordToggle({
  seasonCount,
}: {
  seasonCount: number;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from("profiles")
    .select("publish_record")
    .eq("id", user.id)
    .maybeSingle();

  /*
   * A failed read is not a "private" answer. Rendering the switch as off would
   * tell a farmer their record is private when we do not know that, and one
   * click on a control showing the wrong state publishes what they meant to
   * keep. Saying nothing is the honest degradation.
   */
  if (error || !data) return null;

  const published = data.publish_record === true;

  return (
    <form
      action={setPublishRecord}
      className={`mb-8 rounded-2xl border p-5 ${
        published ? "border-primary/40 bg-primary/5" : "border-border bg-card"
      }`}
    >
      <input type="hidden" name="publish" value={published ? "false" : "true"} />

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <h2 className="font-bold">
            {published ? "سجلّك منشور" : "سجلّك خاصّ بك"}
          </h2>
          <p className="mt-1 text-sm leading-relaxed text-muted">
            {published ? (
              <>
                من يملك رابط ملفّك يرى مواسمك ومؤشّر ثقتك — المحصول والمساحة
                والتاريخ ودرجة الالتزام. <strong>ولا تُعرض أرقامك المالية</strong>:
                الميزانية والتكاليف والإيراد تبقى عندك، ولا تخرج من الخادم.
              </>
            ) : (
              <>
                لا أحد يرى مواسمك غيرك. وحين تنشره، يظهر لمن يملك الرابط:
                المحصول والمساحة والتاريخ ودرجة الالتزام —{" "}
                <strong>دون أي رقم مالي</strong>.
              </>
            )}
          </p>
          {seasonCount === 0 && !published && (
            <p className="mt-2 text-xs text-muted">
              وليس فيه ما يُعرض بعد — سجّل موسماً أوّلاً.
            </p>
          )}
        </div>

        <button
          type="submit"
          className={`shrink-0 rounded-lg px-4 py-2 text-sm font-medium transition ${
            published
              ? "border border-border bg-card hover:border-primary"
              : "bg-primary text-primary-foreground hover:opacity-90"
          }`}
        >
          {published ? "اجعله خاصّاً" : "انشر سجلّي"}
        </button>
      </div>
    </form>
  );
}
