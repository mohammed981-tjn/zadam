import { NextResponse } from "next/server";
import { clientFromBearer } from "@/lib/supabase/bearer";
import { M3_PER_MM_FEDDAN, WAPOR_LAYER_URL, dekadLabel, fetchLandWater } from "@/lib/wapor";
import { tr } from "@/lib/i18n";
import { appLocale } from "@/lib/appLocale";

/**
 * «ماء أرضك من الأقمار الصناعيّة — الفاو» on the app's land card (backlog 203): what FAO's WaPOR measured leaving
 * the land every ten days, as the website's land card shows it (src/components/LandWater.tsx). A route of its own,
 * as the website streams it apart: a slow read from FAO never holds up the card.
 *
 * Only the caller's own land is read (the place is the owner's), through row-level security, with no elevated key.
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await clientFromBearer(req);
  if (!auth) return NextResponse.json({ error: "انتهت جلستك. ادخل من جديد." }, { status: 401 });
  const locale = appLocale(req);
  const { supabase, user } = auth;
  const { id } = await params;

  const { data: land } = await supabase
    .from("lands")
    .select("latitude, longitude, feddans")
    .eq("id", id)
    .eq("owner_id", user.id)
    .maybeSingle();
  if (!land) return NextResponse.json({ error: tr(locale, "الأرض غير موجودة أو ليست لك.", "That land does not exist or is not yours.") }, { status: 404 });
  if (land.latitude === null || land.longitude === null) {
    return NextResponse.json({
      located: false,
      rows: [],
      note: tr(locale, "أضف موقع هذه الأرض لترى ماءها من أقمار الفاو كلّ عشرة أيّام.", "Add this land's location to see its water from FAO's satellites every ten days."),
    });
  }

  const feddans = Number(land.feddans);
  const rows = await fetchLandWater(Number(land.latitude), Number(land.longitude));
  return NextResponse.json({
    located: true,
    feddans,
    rows: rows.map((r) => ({
      period: dekadLabel(r.dekad, locale),
      mm_per_day: r.mmPerDay,
      m3_per_feddan: r.m3PerFeddan,
      m3_land: Math.round(r.m3PerFeddan * feddans),
    })),
    note:
      rows.length === 0
        ? tr(locale, "لم تُقرأ بيانات الفاو لهذا الموقع الآن. أعد فتح الصفحة لاحقاً.", "FAO's data for this location could not be read just now. Reopen the page later.")
        : tr(locale, `الحساب: مم في اليوم × أيّام الفترة × ${M3_PER_MM_FEDDAN} (المليمتر على فدانٍ مساحته ٤٢٠٠ م² = ${M3_PER_MM_FEDDAN} م³). كلّ قراءةٍ لمربّع ٣٠٠ متر حول موقع الأرض، أي نحو ٢١ فداناً، فقد تدخل فيها أرض الجيران إن كانت أرضك أصغر.`, `The sum: mm a day × the period's days × ${M3_PER_MM_FEDDAN} (a millimetre over a feddan of 4,200 m² = ${M3_PER_MM_FEDDAN} m³). Each reading is for a 300-metre square around the land's location, about 21 feddans, so the neighbours' land may be in it if yours is smaller.`),
    source: WAPOR_LAYER_URL,
  });
}
