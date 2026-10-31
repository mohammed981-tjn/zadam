import { NextResponse } from "next/server";
import { clientFromBearer } from "@/lib/supabase/bearer";
import { dbText } from "@/lib/dbText";
import { boundaryOf, isWaterSource, landInputProblem, nearestStation, type Corner } from "@/lib/landInput";
import { recordSoilEstimate } from "@/lib/landSoil";
import { wrbShort } from "@/lib/soilClasses";

/**
 * «حدّد أرضك» في التطبيق (البند ١٣٤؛ اختار المالك المشي والنقر معاً، 28 أكتوبر 2026).
 *
 * The farmer walks round the field with the phone's GPS, or taps its corners on the satellite map, and the app sends
 * the corners. The area and the centre are worked out here from them (`boundaryOf`), the climate station is the
 * nearest one, and the land is saved with its corners (`boundary`) as the website's form saves it: as the signed-in
 * person, through row-level security, submitted and unlisted, checked by the same `landInputProblem`. Then the soil
 * at its centre is read from the satellites, as the website does when a land is given its place, and returned for
 * the app to show.
 */
export async function POST(req: Request) {
  const auth = await clientFromBearer(req);
  if (!auth) return NextResponse.json({ error: "انتهت جلستك. ادخل من جديد." }, { status: 401 });
  const { supabase, user } = auth;

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "طلبٌ غير صالح." }, { status: 400 });
  }
  const text = (k: string, max: number) => (typeof body[k] === "string" ? (body[k] as string).trim().slice(0, max) : "");

  const corners = Array.isArray(body.boundary)
    ? (body.boundary as unknown[]).map((c) => ({
        lat: Number((c as Corner | null)?.lat),
        lng: Number((c as Corner | null)?.lng),
      }))
    : [];
  const shape = boundaryOf(corners);
  if (!shape) {
    return NextResponse.json(
      { error: "حدّد ثلاثة أركانٍ على الأقلّ تحيط بالأرض، بالمشي حولها أو بالنقر على الخريطة." },
      { status: 400 },
    );
  }

  const feddans = Math.round(shape.feddans * 100) / 100;
  const latitude = Math.round(shape.centre.lat * 1e6) / 1e6;
  const longitude = Math.round(shape.centre.lng * 1e6) / 1e6;
  const stationKey = nearestStation(latitude, longitude);
  const waterSource = text("water_source", 20) || "canal";
  const tenure = text("tenure", 20) || "unspecified";
  const input = { name: text("name", 120), state: text("state", 60), feddans, stationKey, waterSource, tenure, latitude, longitude };

  const problem = landInputProblem(input, (ar) => ar);
  if (problem || !isWaterSource(waterSource)) {
    return NextResponse.json({ error: problem ?? "مصدر مياه غير معروف." }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("lands")
    .insert({
      owner_id: user.id,
      name: input.name,
      state: input.state,
      locality: text("locality", 80) || null,
      village: text("village", 80) || null,
      latitude,
      longitude,
      // The corners as drawn, to a decimetre (20261031010000): the review compares the area with what they enclose.
      boundary: corners.map((c) => [Math.round(c.lat * 1e6) / 1e6, Math.round(c.lng * 1e6) / 1e6]),
      feddans,
      station_key: stationKey,
      water_source: waterSource,
      tenure,
      documents_on_file: 0,
      documents_required: 3,
      verification: "submitted",
      listed: false,
    })
    .select("id")
    .single();
  if (error || !data) {
    return NextResponse.json({ error: `تعذّر تسجيل الأرض: ${await dbText(error?.message ?? "")}` }, { status: 400 });
  }

  const soil = await recordSoilEstimate(user.id, data.id as string, longitude, latitude);

  return NextResponse.json({
    id: data.id,
    feddans,
    latitude,
    longitude,
    station: stationKey,
    soil: soil ? { name: wrbShort(soil.wrb), probability: soil.probability } : null,
    message:
      "سُجّلت الأرض. لن تظهر لأحد حتى ترفع مستنداتها من الموقع وتعتمدها الإدارة — " +
      "إثبات الحيازة، وصور بإحداثيات، ومعاينة ميدانية.",
  });
}
