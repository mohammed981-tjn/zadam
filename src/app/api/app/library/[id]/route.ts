import { NextResponse } from "next/server";
import { createPublicClient } from "@/lib/supabase/public";
import { loadPublishedResearch, researchCitation } from "@/lib/researchLibrary";
import { RESEARCH_KIND_LABEL } from "@/lib/research";

/**
 * عملٌ منشور في المكتبة، في التطبيق (البند ٢٠٣) — /library/[id] كما هي: ملخّصه ومن كتبه وطريقة الاستشهاد به.
 *
 * Public, through `loadPublishedResearch` with the public client. The PDF is the one thing not handed over here: the
 * bucket is private and the website signs an hour's link with the service key (the fifth caller the admin client lists),
 * which no /api/app route holds. So the app opens the work's page on the website for the file, and gets the link to
 * the work where it is published directly.
 */
export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const item = await loadPublishedResearch(createPublicClient(), id);
  if (!item) return NextResponse.json({ error: "هذا العمل غير موجود أو لم يُنشر." }, { status: 404 });
  return NextResponse.json({
    ...item,
    file_path: undefined,
    kindLabel: RESEARCH_KIND_LABEL[item.kind][0],
    hasFile: !!item.file_path,
    pageUrl: new URL(`/library/${item.id}`, req.url).toString(),
    citation: researchCitation(item, "ar"),
  });
}
