import { NextResponse } from "next/server";
import { clientFromBearer } from "@/lib/supabase/bearer";
import { cropName } from "@/lib/farmLabelsEn";
import type { Season } from "@/types/database";
import { tr } from "@/lib/i18n";
import { appLocale } from "@/lib/appLocale";

/**
 * «مواسمي» في التطبيق (البند ٢٠٣): as /seasons lists them on the website.
 *
 * Read as the signed-in person, through row-level security: their own seasons, and the seasons of signed
 * partnerships they invest in (which the policy also returns since backlog 129), kept apart as the website keeps them —
 * only the first are theirs to write in.
 */
export async function GET(req: Request) {
  const auth = await clientFromBearer(req);
  if (!auth) return NextResponse.json({ error: "انتهت جلستك. ادخل من جديد." }, { status: 401 });
  const locale = appLocale(req);
  const { supabase, user } = auth;

  const { data, error } = await supabase.from("seasons").select("*").order("planting_date", { ascending: false });
  if (error) {
    console.error("app seasons: read failed", error);
    return NextResponse.json({ error: tr(locale, "تعذّر تحميل مواسمك. أعد المحاولة بعد قليل.", "Could not load your seasons. Try again shortly.") }, { status: 500 });
  }

  const all = (data ?? []) as Season[];
  const row = (s: Season) => ({
    id: s.id,
    name: s.name,
    crop_key: s.crop_key,
    crop: cropName(s.crop_key, locale),
    feddans: Number(s.feddans),
    location: s.location,
    planting_date: s.planting_date,
    harvest_date: s.harvest_date,
    status: s.status,
  });

  return NextResponse.json(
    {
      seasons: all.filter((s) => s.owner_id === user.id).map(row),
      partner: all.filter((s) => s.owner_id !== user.id && s.partnership_id).map(row),
    },
    { headers: { "cache-control": "no-store" } },
  );
}
