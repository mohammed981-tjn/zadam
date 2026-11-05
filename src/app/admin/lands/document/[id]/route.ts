import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { dbText } from "@/lib/dbText";
import { getLocale } from "@/lib/locale";
import { tr } from "@/lib/i18n";

/**
 * Opens one land document for an administrator, and records that they opened it (audit web-flows-3, 3 November 2026).
 *
 * A land is verified only after the verifying administrator has opened every one of its documents: the database
 * refuses the verification otherwise (lands_verify_gate). land_document_open() checks the caller is an administrator
 * (second factor included), records the opening and returns the file's path; the link made here lives two minutes, and
 * the bucket's own policy is what lets an administrator read the file.
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const locale = await getLocale();
  const t = (ar: string, en: string) => tr(locale, ar, en);
  const back = (message: string) =>
    NextResponse.redirect(new URL(`/admin/lands?error=${encodeURIComponent(message)}`, req.url), 303);

  const { data: path, error } = await supabase.rpc("land_document_open", { p_document: id });
  if (error || typeof path !== "string") return back(error?.message ? await dbText(error.message) : t("تعذّر فتح المستند.", "Could not open the document."));

  const { data: signed, error: signError } = await supabase.storage.from("evidence").createSignedUrl(path, 120);
  if (signError || !signed?.signedUrl) return back(
      t(
        "سُجّل الفتح، لكن تعذّر إنشاء رابط الملفّ. حاول مرّةً أخرى.",
        "The opening was recorded, but the file link could not be made. Try again.",
      ),
    );

  return NextResponse.redirect(signed.signedUrl, 303);
}
