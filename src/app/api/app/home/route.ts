import { NextResponse } from "next/server";
import { clientFromBearer } from "@/lib/supabase/bearer";
import { loadRoleHome } from "@/lib/roleHomeLoad";
import { localizeHome } from "@/lib/roleHome";

/**
 * «ينتظرك» في رئيسيّة التطبيق (البند ٢٠٦): what the website's home shows a signed-in person (src/components/RoleHome.tsx),
 * from the same loader and the same rules (src/lib/roleHome.ts), in Arabic.
 *
 * Read as the person, through row-level security, with the bearer client: nothing here holds the server's key, and
 * every card is what the page it links to would show that person. The app orders its own section groups by `side`
 * and opens each card's `href` on its own screen for that section.
 */
export async function GET(req: Request) {
  const auth = await clientFromBearer(req);
  if (!auth) return NextResponse.json({ error: "انتهت جلستك. ادخل من جديد." }, { status: 401 });
  const { supabase, user } = auth;

  try {
    const view = await loadRoleHome(supabase, user.id);
    return NextResponse.json(localizeHome(view, "ar"), { headers: { "cache-control": "no-store" } });
  } catch (e) {
    console.error("app home: read failed", e);
    return NextResponse.json({ error: "تعذّر تحميل ما ينتظرك. أعد المحاولة بعد قليل." }, { status: 500 });
  }
}
