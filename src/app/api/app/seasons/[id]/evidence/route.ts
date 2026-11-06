import { NextResponse } from "next/server";
import { clientFromBearer } from "@/lib/supabase/bearer";
import { STAGE_EVIDENCE_KINDS, addStageEvidence, isStageOfSeason } from "@/lib/seasonWrites";
import { discardAppPhoto, ownPdfPath, photoError, uploadAppPhoto } from "@/lib/appPhoto";
import { jsonFields } from "@/lib/supplyCore";
import { UUID, badRequest, readJson } from "@/lib/appApi";
import { tr } from "@/lib/i18n";
import { appLocale } from "@/lib/appLocale";

/**
 * «أضف دليلاً» من التطبيق (البند ٢٠٣): the website's «ارفع الدليل» on each stage of /seasons/[id], for the season's
 * owner — so «اعتمد المرحلة» then passes the database's rule that no stage is signed off without evidence.
 *
 *   POST {stage_id, kind, caption, photo: base64}   a photo from the camera or the gallery, stored here
 *   POST {stage_id, kind, caption, storage_path}    a PDF the app already put in the caller's own folder
 *
 * The photo goes where the website's upload puts it (`<user>/stages/…` in the private `evidence` bucket), through the
 * caller's own client, its capture time and place read into columns and stripped from the file (lib/appPhoto). The
 * row is then written by the same `addStageEvidence` the website's action calls — the same kind list, the same own-
 * folder and file-is-there checks, the same insert under row-level security — and a photo the database refuses is
 * removed again.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await clientFromBearer(req);
  if (!auth) return NextResponse.json({ error: "انتهت جلستك. ادخل من جديد." }, { status: 401 });
  const locale = appLocale(req);
  const { supabase, user } = auth;
  const { id } = await params;
  const body = await readJson(req);
  if (!body || !UUID.test(id)) return badRequest(locale);
  const f = jsonFields(body);
  const stageId = f.str("stage_id");
  if (!UUID.test(stageId)) return NextResponse.json({ error: tr(locale, "المرحلة غير محدّدة.", "The stage is not specified.") }, { status: 400 });
  const kind = f.str("kind");
  if (!STAGE_EVIDENCE_KINDS.includes(kind)) return NextResponse.json({ error: tr(locale, "نوع دليل غير معروف.", "Unknown evidence type.") }, { status: 400 });
  // Asked before anything is stored: a stage of another season, or of one the caller cannot read, leaves no file.
  if (!(await isStageOfSeason(supabase, stageId, id))) {
    return NextResponse.json({ error: tr(locale, "المرحلة ليست من مراحل هذا الموسم.", "The stage is not one of this season's stages.") }, { status: 404 });
  }

  let storagePath: string;
  let metadata: unknown;
  if (body.photo !== undefined) {
    const photo = await uploadAppPhoto(supabase, user.id, "stages", body.photo);
    if ("error" in photo) return NextResponse.json({ error: photoError(locale, photo.error) }, { status: 400 });
    storagePath = photo.path;
    metadata = photo.metadata;
  } else {
    const pdf = ownPdfPath(user.id, "stages", body.storage_path);
    if (!pdf) return NextResponse.json({ error: tr(locale, "أرفق صورةً أو ملفّ PDF أوّلاً.", "Attach a photo or a PDF first.") }, { status: 400 });
    storagePath = pdf;
  }

  const r = await addStageEvidence(
    supabase,
    user.id,
    { stageId, kind, storagePath, caption: f.str("caption").slice(0, 300) || tr(locale, "دليل", "Evidence"), metadata },
    locale,
  );
  if (!r.ok) {
    await discardAppPhoto(supabase, storagePath);
    return NextResponse.json({ error: r.message }, { status: 400 });
  }
  return NextResponse.json({ ok: true, message: tr(locale, "رُفع الدليل. اعتمد المرحلة حين تتمّ.", "The evidence was uploaded. Sign off the stage when it is done.") });
}
