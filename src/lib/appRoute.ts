import type { Say } from "@/lib/contractSteps";

/**
 * Small plumbing shared by the app's routes under /api/app/contracts and /api/app/invest (backlog 203).
 *
 * The app speaks Arabic, so every sentence a shared step returns is the Arabic one. Each route still opens with its
 * own `clientFromBearer(req)` and 401 — scripts/verify-app-contracts-invest.ts reads each file for it — so nothing
 * here touches the session.
 */
export const APP_SAY: Say = { locale: "ar", t: (ar: string) => ar };

/** The request's JSON object, or null when it is not one. */
export async function readJson(req: Request): Promise<Record<string, unknown> | null> {
  try {
    const body = (await req.json()) as unknown;
    return body && typeof body === "object" && !Array.isArray(body) ? (body as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** A trimmed string field, cut to [max]; "" when missing or not text. */
export const text = (body: Record<string, unknown>, key: string, max: number) =>
  typeof body[key] === "string" ? (body[key] as string).trim().slice(0, max) : "";

/** A number field (a number or a numeric string, Arabic digits read), or null. */
export function num(body: Record<string, unknown>, key: string): number | null {
  const v = body[key];
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v !== "string" || !v.trim()) return null;
  const n = Number(v.trim().replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x660)));
  return Number.isFinite(n) ? n : null;
}

/** A list field, as strings. */
export const list = (body: Record<string, unknown>, key: string): string[] =>
  Array.isArray(body[key]) ? (body[key] as unknown[]).map(String) : [];

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
