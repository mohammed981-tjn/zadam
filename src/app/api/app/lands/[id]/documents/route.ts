import { NextResponse } from "next/server";
import { clientFromBearer } from "@/lib/supabase/bearer";
import { LAND_DOCUMENT_KINDS } from "@/lib/landDocuments";
import { addLandDocumentStep } from "@/lib/landOwnerSteps";
import { discardAppPhoto, ownPdfPath, photoError, uploadAppPhoto } from "@/lib/appPhoto";
import { jsonFields } from "@/lib/supplyCore";
import { UUID, badRequest, readJson } from "@/lib/appApi";
import { tr, type Locale } from "@/lib/i18n";
import { appLocale } from "@/lib/appLocale";

const SESSION_OVER = { error: "انتهت جلستك. ادخل من جديد." };
const notYours = (locale: Locale) => ({ error: tr(locale, "الأرض غير موجودة أو ليست لك.", "That land does not exist or is not yours.") });

/**
 * «ارفع المستند» من التطبيق (البند ٢٠٣): the website's upload under «مستندات الأرض» on /lands, for the land's owner.
 *
 *   POST {kind, caption, photo: base64}   a photo of the deed, the permit or the land, from the camera or the gallery
 *   POST {kind, caption, storage_path}    a PDF the app already put in the caller's own folder, as the browser does
 *
 * The same bucket and folder as the website (`<user>/lands/…` in the private `evidence` bucket, held by the bucket to
 * ten megabytes and its list of types), through the caller's own client; a photo's capture time and place become
 * columns and leave the file (lib/appPhoto). The row is written by the same `addLandDocumentStep` the website's action
 * calls, and a photo the database refuses is removed again. Only the caller's own land, as the rest of the land card.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await clientFromBearer(req);
  if (!auth) return NextResponse.json(SESSION_OVER, { status: 401 });
  const locale = appLocale(req);
  const NOT_YOURS = notYours(locale);
  const { supabase, user } = auth;
  const { id } = await params;
  const body = await readJson(req);
  if (!body || !UUID.test(id)) return badRequest(locale);
  const f = jsonFields(body);
  const kind = f.str("kind");
  if (!LAND_DOCUMENT_KINDS.some((k) => k.value === kind)) {
    return NextResponse.json({ error: tr(locale, "نوع مستند غير معروف.", "Unknown document type.") }, { status: 400 });
  }

  const { data: mine } = await supabase.from("lands").select("id").eq("id", id).eq("owner_id", user.id).maybeSingle();
  if (!mine) return NextResponse.json(NOT_YOURS, { status: 404 });

  let storagePath: string;
  let metadata: unknown;
  if (body.photo !== undefined) {
    const photo = await uploadAppPhoto(supabase, user.id, "lands", body.photo);
    if ("error" in photo) return NextResponse.json({ error: photoError(locale, photo.error) }, { status: 400 });
    storagePath = photo.path;
    metadata = photo.metadata;
  } else {
    const pdf = ownPdfPath(user.id, "lands", body.storage_path);
    if (!pdf) return NextResponse.json({ error: tr(locale, "أرفق صورةً أو ملفّ PDF أوّلاً.", "Attach a photo or a PDF first.") }, { status: 400 });
    storagePath = pdf;
  }

  const label = LAND_DOCUMENT_KINDS.find((k) => k.value === kind)!.label;
  const r = await addLandDocumentStep(
    supabase,
    user.id,
    { landId: id, kind, storagePath, caption: f.str("caption").slice(0, 300) || label, metadata },
    locale,
  );
  if (!r.ok) {
    await discardAppPhoto(supabase, storagePath);
    return NextResponse.json({ error: r.message }, { status: 400 });
  }
  return NextResponse.json({ ok: true, message: tr(locale, "رُفع المستند.", "The document was uploaded.") });
}
