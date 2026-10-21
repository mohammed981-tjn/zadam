import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { buildEngines, generateWithFallback } from "@/lib/engines";
import { PHOTO_SYSTEM_PROMPT, readImage } from "@/lib/assistantPhoto";

// Temporary probe: reads a bundled photo through the photo path end to end. Removed before merge.
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET() {
  const file = await readFile(path.join(process.cwd(), "public", "photos", "grain-soil.webp"));
  const image = readImage({ mime: "image/webp", data: file.toString("base64") });
  if (!image || image === "bad") return NextResponse.json({ error: "image not readable", size: file.length });
  const engines = buildEngines({ geminiKey: process.env.GEMINI_API_KEY, openRouterKey: process.env.OPENROUTER_API_KEY });
  const t0 = Date.now();
  const { result, attempts } = await generateWithFallback(engines, PHOTO_SYSTEM_PROMPT, "ما الذي يظهر في الصورة، وما نصيحتك؟", image);
  return NextResponse.json({ ms: Date.now() - t0, bytes: file.length, engine: result?.engine ?? null, attempts, answer: result?.text.slice(0, 1200) ?? null });
}
