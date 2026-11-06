import { NextResponse } from "next/server";
import { currentFx } from "@/lib/livePrices";
import { dateLabel, num } from "@/lib/supplyChain";
import type { StepResult } from "@/lib/supplyCore";

/**
 * Small plumbing the app's supplier and agent routes share (backlog 203). Who is asking is settled in each route by
 * `clientFromBearer`, before anything here runs.
 */

/** The request's JSON object, or null when it is not one. */
export async function readJson(req: Request): Promise<Record<string, unknown> | null> {
  try {
    const body = (await req.json()) as unknown;
    return body && typeof body === "object" && !Array.isArray(body) ? (body as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export const badRequest = () => NextResponse.json({ error: "طلبٌ غير مفهوم." }, { status: 400 });

/** A step's answer as the app reads it: `{ok, message, …}`, or `{error}` with 400. */
export function stepJson(r: StepResult, extra: Record<string, unknown> = {}) {
  if (!r.ok) return NextResponse.json({ error: r.message }, { status: 400 });
  return NextResponse.json({ ok: true, message: r.message, ...(r.id ? { id: r.id } : {}), ...(r.code ? { code: r.code } : {}), ...extra });
}

/** Pounds at the bank's dollar selling rate today, and the sentence the website prints under its prices. */
export async function dollarRate(): Promise<{ rate: number | null; rate_note: string | null }> {
  const fx = await currentFx();
  const rate = fx?.bank.sell ?? null;
  if (!fx || !rate) return { rate: null, rate_note: null };
  return {
    rate,
    rate_note: `الجنيه بسعر بيع ${fx.bank.name_ar} للدولار: ${num(rate, "ar", 2)} جنيه، في ${dateLabel(fx.bank.date, "ar")}.`,
  };
}

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const noStore = { headers: { "cache-control": "no-store" } } as const;
