import { NextResponse } from "next/server";
import { clientFromBearer } from "@/lib/supabase/bearer";
import { PHOTO_UPLOAD_FAILED, photoError, uploadAppPhoto } from "@/lib/appPhoto";
import { tr } from "@/lib/i18n";
import { appLocale } from "@/lib/appLocale";

/**
 * صورة إيصال القيد، تُرفع مرّةً قبل القيد (البند ٢٠٩): the app stores the receipt here first and keeps the path it gets
 * back with the entry waiting to go, as the website's form does with the file its browser uploaded. Every retry of the
 * entry then carries that one path (POST /api/app/books/journal, `storage_path`), so a reply lost on a weak network
 * neither stores the photo twice nor turns the retry into «another entry with the same key». The photo goes through
 * uploadAppPhoto, as everywhere: its time and place are removed, and it lands in the sender's own `ledger` folder with
 * his own session. If the entry is then refused, the journal route removes it again.
 */
export async function POST(req: Request) {
  const auth = await clientFromBearer(req);
  if (!auth) return NextResponse.json({ error: "انتهت جلستك. ادخل من جديد." }, { status: 401 });
  const locale = appLocale(req);
  const { supabase, user } = auth;
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: tr(locale, "طلبٌ غير صالح.", "Invalid request.") }, { status: 400 });
  }
  const photo = await uploadAppPhoto(supabase, user.id, "ledger", body.photo);
  if ("error" in photo) {
    // The bucket not answering is an outage (the app keeps the entry and tries again); a photo it cannot read is not.
    return NextResponse.json({ error: photoError(locale, photo.error) }, { status: photo.error === PHOTO_UPLOAD_FAILED ? 503 : 400 });
  }
  return NextResponse.json({ ok: true, storage_path: photo.path });
}
