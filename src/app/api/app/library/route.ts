import { NextResponse } from "next/server";
import { createPublicClient } from "@/lib/supabase/public";
import { listPublishedResearch, researchFilter } from "@/lib/researchLibrary";
import { RESEARCH_KINDS, RESEARCH_KIND_LABEL, RESEARCH_MAX_BYTES } from "@/lib/research";
import { SUDAN_STATES } from "@/lib/nafir";

/**
 * مكتبة الدراسات والبحوث في التطبيق (البند ٢٠٣) — /library كما هي.
 *
 * Public, like the page: the published works, by kind and by words, through `listPublishedResearch` — the same read
 * the page makes — with the public client, so only what a visitor may see comes back. With the list come the kinds,
 * the states and the file limit the «شارك دراستك» form needs, from the modules the website's form uses.
 */
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const filter = researchFilter(url.searchParams.get("kind"), url.searchParams.get("q"));
  const { items, error } = await listPublishedResearch(createPublicClient(), filter);
  if (error) {
    console.error("app library: list failed", error);
    return NextResponse.json({ error: "تعذّر تحميل المكتبة الآن. أعد المحاولة." }, { status: 502 });
  }
  return NextResponse.json({
    items: items.map((r) => ({ ...r, kindLabel: RESEARCH_KIND_LABEL[r.kind][0], hasFile: !!r.file_path, file_path: undefined })),
    kinds: RESEARCH_KINDS.map((k) => ({ key: k, label: RESEARCH_KIND_LABEL[k][0] })),
    states: SUDAN_STATES,
    maxBytes: RESEARCH_MAX_BYTES,
  });
}
