import { NextResponse } from "next/server";
import { STUDIES } from "@/lib/studiesIndex";

/**
 * قسم الدراسات في التطبيق (البند ٢٠٣) — /studies كما هي: الدراسات نفسها بكلماتها ونوعها وصورتها.
 *
 * `read` names the app's own reader where there is one (/api/app/library/read/[read]); the library opens the
 * library screen; anything else (the export corridor) opens on the website.
 */
export const dynamic = "force-dynamic";

const READ: Record<string, string> = {
  "/studies/exchange-rate": "exchange-rate",
  "/studies/compost": "compost",
  "/arc-canal": "arc-canal",
};

export async function GET(req: Request) {
  return NextResponse.json(
    {
      studies: STUDIES.map((s) => ({
        href: s.href,
        url: new URL(s.href, req.url).toString(),
        read: READ[s.href] ?? null,
        library: s.href === "/library",
        title: s.title,
        note: s.note,
        kind: s.kind,
        photo: new URL(s.photo.src, req.url).toString(),
        alt: s.alt,
      })),
    },
    { headers: { "cache-control": "public, s-maxage=3600, stale-while-revalidate=86400" } },
  );
}
