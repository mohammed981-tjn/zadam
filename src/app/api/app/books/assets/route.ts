import { NextResponse } from "next/server";
import { clientFromBearer } from "@/lib/supabase/bearer";
import { formatMoney } from "@/lib/ledger/money";
import { ledgerToday } from "@/lib/ledger/today";
import { addFixedAsset, depreciateFarmAssets, disposeFixedAsset } from "@/lib/fixedAssetWrites";
import { tr } from "@/lib/i18n";
import { appLocale } from "@/lib/appLocale";

/**
 * الأصول الثابتة في التطبيق (البند ٢٠٣): /books/assets on the website.
 *
 * GET reads the farm book's assets with the same `ledger_fixed_assets_summary` the page reads, as the signed-in
 * person. POST does what the page's three forms do — `add`, `depreciate`, `dispose` — through the same functions the
 * website's actions call (lib/fixedAssetWrites), so the database checks the book is the caller's and every figure.
 */

type Asset = {
  id: string;
  name: string;
  account_key: "machinery" | "land_improvements";
  acquired_on: string;
  cost_minor: number;
  salvage_minor: number;
  life_months: number;
  months_posted: number;
  accumulated_minor: number;
  book_value_minor: number;
  disposed_on: string | null;
  proceeds_minor: number | null;
};

const usd = (minor: number) => formatMoney(BigInt(Math.round(Number(minor))), "USD");

export async function GET(req: Request) {
  const auth = await clientFromBearer(req);
  if (!auth) return NextResponse.json({ error: "انتهت جلستك. ادخل من جديد." }, { status: 401 });
  const locale = appLocale(req);
  const { supabase, user } = auth;

  const { data: book } = await supabase.from("ledger_books").select("id").eq("owner_id", user.id).eq("kind", "farm").maybeSingle();
  const { data, error } = book ? await supabase.rpc("ledger_fixed_assets_summary", { p_book: book.id }) : { data: null, error: null };
  if (error) {
    console.error("app assets: read failed", error);
    return NextResponse.json({ error: tr(locale, "تعذّر تحميل الأصول الآن. أعد المحاولة بعد قليل.", "Could not load the assets just now. Try again shortly.") }, { status: 500 });
  }
  const assets = (data ?? []) as Asset[];
  const total = (f: (a: Asset) => number) => assets.reduce((n, a) => n + Number(f(a)), 0);

  return NextResponse.json(
    {
      today: ledgerToday(),
      has_book: !!book,
      assets: assets.map((a) => ({
        id: a.id,
        name: a.name,
        kind: a.account_key === "machinery" ? tr(locale, "آلات ومعدّات", "Machinery and equipment") : tr(locale, "تحسينات أرض", "Land improvements"),
        acquired_on: a.acquired_on,
        life_months: a.life_months,
        months_posted: a.months_posted,
        cost: usd(a.cost_minor),
        salvage: Number(a.salvage_minor) > 0 ? usd(a.salvage_minor) : null,
        accumulated: usd(a.accumulated_minor),
        book_value: usd(a.book_value_minor),
        disposed_on: a.disposed_on,
        proceeds: a.disposed_on && Number(a.proceeds_minor) > 0 ? usd(Number(a.proceeds_minor)) : null,
      })),
      totals: {
        cost: usd(total((a) => a.cost_minor)),
        accumulated: usd(total((a) => a.accumulated_minor)),
        book_value: usd(total((a) => a.book_value_minor)),
      },
    },
    { headers: { "cache-control": "no-store" } },
  );
}

export async function POST(req: Request) {
  const auth = await clientFromBearer(req);
  if (!auth) return NextResponse.json({ error: "انتهت جلستك. ادخل من جديد." }, { status: 401 });
  const locale = appLocale(req);
  const { supabase } = auth;

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: tr(locale, "طلبٌ غير صالح.", "Invalid request.") }, { status: 400 });
  }
  const text = (k: string, max = 120) => (typeof body[k] === "string" ? (body[k] as string).slice(0, max) : "");

  const action = text("action", 20);
  const result =
    action === "add"
      ? await addFixedAsset(
          supabase,
          {
            name: text("name", 120),
            account: text("account", 30),
            acquired_on: text("acquired_on", 10),
            cost: text("cost", 40),
            salvage: text("salvage", 40),
            life_years: text("life_years", 10),
            paid_from: text("paid_from", 20),
          },
          locale,
        )
      : action === "depreciate"
        ? await depreciateFarmAssets(supabase, locale)
        : action === "dispose"
          ? await disposeFixedAsset(
              supabase,
              {
                asset_id: text("asset_id", 40),
                disposed_on: text("disposed_on", 10),
                proceeds: text("proceeds", 40),
                received_into: text("received_into", 20),
              },
              locale,
            )
          : { ok: false, message: tr(locale, "خطوةٌ غير معروفة.", "Unknown step.") };
  if (!result.ok) return NextResponse.json({ error: result.message }, { status: 400 });
  return NextResponse.json({ ok: true, message: result.message });
}
