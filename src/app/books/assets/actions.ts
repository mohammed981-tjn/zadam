"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { explain, signedIn, str, translator } from "@/lib/supplyActions";

/**
 * الأصول الثابتة (البند ١٩٠): تسجيل أصلٍ وقيد شرائه معاً، وقيد ما استحقّ من إهلاكه. The database checks the book is
 * the member's farm book and every figure (supabase/migrations/20261106010000_fixed_assets.sql).
 */

function back(key: "ok" | "error", message: string): never {
  revalidatePath("/books/assets");
  revalidatePath("/books");
  redirect(`/books/assets?${key}=${encodeURIComponent(message)}`);
}

async function farmBook() {
  const { supabase } = await signedIn();
  // Opens the farm book if the member has none yet; returns the one he has otherwise.
  const { data, error } = await supabase.rpc("ledger_open_book", { p_kind: "farm" });
  return { supabase, book: typeof data === "string" ? data : null, error };
}

export async function addAsset(fd: FormData) {
  const { locale, t } = await translator();
  const { supabase, book, error: bookError } = await farmBook();
  if (!book) back("error", bookError ? explain(locale, bookError) : t("تعذّر فتح دفتر المزرعة.", "Could not open the farm book."));
  const num = (k: string) => Number(str(fd, k).replace(/[,٬\s]/g, "").replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d))));
  const years = num("life_years");
  const { error } = await supabase.rpc("ledger_asset_add", {
    p_book: book,
    p_name: str(fd, "name"),
    p_account: str(fd, "account"),
    p_date: str(fd, "acquired_on"),
    p_cost: num("cost"),
    p_salvage: str(fd, "salvage") ? num("salvage") : 0,
    p_life: Number.isFinite(years) ? Math.round(years * 12) : null,
    p_paid_from: str(fd, "paid_from"),
  });
  if (error) {
    console.error("addAsset failed", { error });
    back("error", explain(locale, error));
  }
  back("ok", t("سُجّل الأصل وقُيِّد شراؤه في دفترك. يُقيَّد إهلاكه كلّ شهرٍ وحده.", "The asset was registered and its purchase booked. Its depreciation is booked each month on its own."));
}

export async function depreciateNow() {
  const { locale, t } = await translator();
  const { supabase, book, error: bookError } = await farmBook();
  if (!book) back("error", bookError ? explain(locale, bookError) : t("تعذّر فتح دفتر المزرعة.", "Could not open the farm book."));
  const { data, error } = await supabase.rpc("ledger_asset_depreciate", { p_book: book });
  if (error) back("error", explain(locale, error));
  const n = typeof data === "number" ? data : 0;
  back("ok", n > 0 ? t(`قُيِّد إهلاك ${n} شهراً.`, `${n} month(s) of depreciation booked.`) : t("لا إهلاك مستحقّاً لم يُقيَّد.", "No depreciation due that is not booked."));
}

export async function disposeAsset(fd: FormData) {
  const { locale, t } = await translator();
  const { supabase } = await signedIn();
  const proceeds = Number(str(fd, "proceeds").replace(/[,٬\s]/g, "").replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d))) || 0);
  const { error } = await supabase.rpc("ledger_asset_dispose", {
    p_asset: str(fd, "asset_id"),
    p_date: str(fd, "disposed_on"),
    p_proceeds: proceeds,
    p_received_into: proceeds > 0 ? str(fd, "received_into") : null,
  });
  if (error) {
    console.error("disposeAsset failed", { error });
    back("error", explain(locale, error));
  }
  back("ok", proceeds > 0
    ? t("قُيِّد البيع: خرج الأصل من الدفتر، والفرق عن قيمته الدفتريّة ربحٌ أو خسارة.", "The sale was booked: the asset left the book, and the difference from its book value is a gain or a loss.")
    : t("قُيِّد الاستبعاد: خرج الأصل من الدفتر، وقيمته الدفتريّة خسارة.", "The write-off was booked: the asset left the book, and its book value is a loss."));
}
