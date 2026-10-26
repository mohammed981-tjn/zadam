import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkRateLimit, clientAddress } from "@/lib/rateLimit";
import { checkResearch, RESEARCH_MAX_BYTES, type ResearchInput } from "@/lib/research";

/**
 * مكتبة الدراسات والبحوث (البند ٢٠٢): يرسل إليها أيّ أحد، زائراً أو مسجَّلاً.
 *
 * Two steps, both here, both limited per address:
 *
 *   POST { step: "upload" } → a signed upload URL for one new path in the private `research` bucket. The PDF goes
 *   from the browser straight to storage (a serverless function would refuse a body that large), and the path is the
 *   server's, so a sender cannot name another's file.
 *
 *   POST { step: "submit", ...fields } → the row, written with the service key as the feedback form does: the public
 *   key holds no INSERT on the table, and what is written starts pending whatever it asks (the table's own trigger).
 *   A file named here must be in the bucket already, under that path, within the bucket's size.
 *
 * A route handler and not a Server Action, as the feedback form explains: a page left open across a redeploy still
 * submits into a route.
 */

export const dynamic = "force-dynamic";

type Lang = "ar" | "en";
const say = (lang: Lang, [ar, en]: [string, string], status: number) =>
  NextResponse.json({ ok: false, message: lang === "en" ? en : ar }, { status });

export async function POST(req: NextRequest) {
  let payload: Record<string, unknown>;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ ok: false, message: "طلب غير مفهوم، أعد المحاولة." }, { status: 400 });
  }
  const lang: Lang = payload.lang === "en" ? "en" : "ar";
  const step = payload.step === "upload" ? "upload" : "submit";

  const verdict = await checkRateLimit(`research-${step}`, clientAddress(req.headers));
  if (!verdict.allowed && verdict.tier !== "unavailable") {
    return say(lang, ["أرسلت كثيراً خلال دقيقة. انتظر قليلاً ثم أعد المحاولة.", "Too many sends in a minute. Wait a moment and try again."], 429);
  }

  const admin = createAdminClient();
  if (!admin) {
    console.error("research: SUPABASE_SERVICE_ROLE_KEY is not set");
    return say(lang, ["تعذّر الإرسال الآن، حاول بعد قليل.", "Sending failed just now; try again shortly."], 500);
  }

  if (step === "upload") {
    const path = `incoming/${crypto.randomUUID()}.pdf`;
    const { data, error } = await admin.storage.from("research").createSignedUploadUrl(path);
    if (error || !data) {
      console.error("research: upload url failed", error?.message);
      return say(lang, ["تعذّر تجهيز رفع الملفّ. حاول بعد قليل.", "The upload could not be prepared. Try again shortly."], 500);
    }
    return NextResponse.json({ ok: true, path, token: data.token });
  }

  const str = (k: string) => (typeof payload[k] === "string" ? (payload[k] as string) : "");
  const input: ResearchInput = {
    kind: str("kind"),
    title: str("title"),
    authors: str("authors"),
    institution: str("institution"),
    year: str("year"),
    language: str("language"),
    crop: str("crop"),
    state: str("state"),
    abstract: str("abstract"),
    file_path: str("file_path"),
    link_url: str("link_url"),
    contact: str("contact"),
    consent: payload.consent === true,
  };
  const checked = checkResearch(input);
  if (!checked.ok) return say(lang, checked.message, 400);
  const row = checked.row;

  if (row.file_path) {
    // The file must be there, under the path this server made, and a PDF within the bucket's size.
    const name = row.file_path.slice("incoming/".length);
    const { data: found } = await admin.storage.from("research").list("incoming", { search: name, limit: 1 });
    const file = found?.find((f) => f.name === name);
    const size = Number((file?.metadata as { size?: number } | undefined)?.size ?? 0);
    if (!file || size <= 0 || size > RESEARCH_MAX_BYTES) {
      return say(lang, ["لم نجد الملفّ المرفوع. ارفعه من جديد.", "We could not find the uploaded file. Upload it again."], 400);
    }
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // No .select() on this insert: the row is pending, which no reader may see, and RETURNING would be refused.
  const { error } = await admin.from("research_items").insert({ ...row, submitted_by: user?.id ?? null });
  if (error) {
    console.error("research: insert failed", error.message);
    const dup = error.code === "23505";
    return say(
      lang,
      dup
        ? ["هذا الملفّ أُرسل من قبل.", "This file was already sent."]
        : ["تعذّر حفظ عملك الآن، حاول بعد قليل.", "Your work could not be saved just now; try again shortly."],
      dup ? 409 : 500,
    );
  }
  return NextResponse.json({ ok: true });
}
