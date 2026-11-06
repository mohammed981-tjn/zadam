import { readFileSync } from "node:fs";
import { join } from "node:path";
import { NextResponse } from "next/server";
import { parseStudy } from "@/lib/studyDoc";
import { pageBlocks } from "@/lib/pageBlocks";
import { ROUTE, ROUTE_LENGTH_KM, distanceKm, summarise } from "@/lib/arcCanal";
import { LOCALE_COOKIE } from "@/lib/i18n";

/**
 * الدراسات والدليل للقراءة في التطبيق (البند ٢٠٣): /studies/exchange-rate و/arc-canal و/guide.
 *
 * Each from the source the website renders, never a copy:
 *   - exchange-rate: content/studies/exchange-rate-ar.md through `parseStudy`, exactly as the page reads it.
 *   - arc-canal and guide: their text is JSX with numbers from the platform's modules (and, for the guide, counts
 *     from the database), so the page itself is asked for, in Arabic, and read into blocks by `pageBlocks`. The
 *     canal's headline numbers and its measured profile come with it from `summarise()` and `ROUTE`, as the page
 *     computes them.
 *
 * Public pages, so a public answer, cached at the edge for an hour like a page that changes a few times a month.
 */
export const dynamic = "force-dynamic";

const CACHE = { "cache-control": "public, s-maxage=3600, stale-while-revalidate=86400" };
const PAGES = { "arc-canal": "/arc-canal", guide: "/guide" } as const;

async function renderedBlocks(req: Request, path: string) {
  const res = await fetch(new URL(path, req.url), {
    headers: { cookie: `${LOCALE_COOKIE}=ar`, accept: "text/html" },
    cache: "no-store",
    signal: AbortSignal.timeout(25_000),
  });
  if (!res.ok) throw new Error(`${path}: ${res.status}`);
  return pageBlocks(await res.text());
}

export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const pageUrl = (path: string) => new URL(path, req.url).toString();

  if (slug === "exchange-rate") {
    const md = readFileSync(join(process.cwd(), "content/studies/exchange-rate-ar.md"), "utf8");
    const doc = parseStudy(md);
    return NextResponse.json(
      {
        slug,
        title: doc.title,
        note: "دراسةٌ أرسلها مالكُ المنصّة، ونُشرت كما كُتبت — ٢٥ سبتمبر ٢٠٢٦",
        caveat:
          "عن الأرقام في الدراسة: كلُّ رقمٍ فيها منسوبٌ إلى مصدره وتاريخه كما ورد (رويترز، والجهاز المركزي للإحصاء، وغيرهما)، ويعكس سوقاً أو قناةً بعينها لا سعراً موحّداً لكلّ السودان — والدراسةُ نفسها تشترط تحديثه قبل أيّ قرار. ولم تُراجعه المنصّةُ مقابل مصادره.",
        sections: doc.sections,
        blocks: doc.blocks,
        pageUrl: pageUrl("/studies/exchange-rate"),
      },
      { headers: CACHE },
    );
  }

  if (slug !== "arc-canal" && slug !== "guide") {
    return NextResponse.json({ error: "لا توجد صفحةٌ بهذا الاسم." }, { status: 404 });
  }

  let blocks;
  try {
    blocks = await renderedBlocks(req, PAGES[slug]);
  } catch (e) {
    console.error("app read: page fetch failed", (e as Error).message);
    return NextResponse.json(
      { error: "تعذّر تحميل الصفحة الآن. أعد المحاولة، أو افتحها في الموقع.", pageUrl: pageUrl(PAGES[slug]) },
      { status: 502 },
    );
  }

  const canal =
    slug === "arc-canal"
      ? (() => {
          const s = summarise();
          return {
            lengthKm: Math.round(ROUTE_LENGTH_KM),
            peakM: s.peak.elevation,
            liftM: s.liftM,
            terminusAboveSourceM: s.terminusAboveSourceM,
            sourceElevationM: s.sourceElevation,
            profile: ROUTE.map((p, i) => ({ km: Math.round(distanceKm(i) * 10) / 10, elevation: p.elevation })),
          };
        })()
      : null;

  return NextResponse.json({ slug, blocks, canal, pageUrl: pageUrl(PAGES[slug]) }, { headers: CACHE });
}
