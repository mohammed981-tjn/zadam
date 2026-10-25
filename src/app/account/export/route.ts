import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { buildAccountFile } from "@/lib/accountExport";

/**
 * «نزّل بياناتي» (البند ١٩٥): قبل أن يطلب صاحب الحساب إغلاقه، يأخذ ملفّاً بما هو له — ملفّه وأراضيه ومواسمه ودفاتره
 * وقيودها وعقوده وتوقيعاته واستثماراته. يُقرأ بجلسته هو، فما تمنعه سياسات الصفوف عنه لا يصل الملفّ. وكلّ جدولٍ يُقرأ حتى
 * آخره (src/lib/accountExport.ts)، وما تعذّرت قراءته يوقف الملفّ بسببه بدل أن يصل ناقصاً.
 */

export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "سجّل دخولك أولاً." }, { status: 401 });

  let file;
  try {
    file = await buildAccountFile(supabase, user);
  } catch (e) {
    console.error("account export failed", e);
    return NextResponse.json({ error: "تعذّر تجهيز ملفّك كاملاً الآن؛ أعد المحاولة بعد قليل." }, { status: 500 });
  }
  return new NextResponse(JSON.stringify(file, null, 2), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="sudagri-${new Date().toISOString().slice(0, 10)}.json"`,
      "cache-control": "no-store",
    },
  });
}
