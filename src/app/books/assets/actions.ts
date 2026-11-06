"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { signedIn, str, translator } from "@/lib/supplyActions";
import { addFixedAsset, depreciateFarmAssets, disposeFixedAsset } from "@/lib/fixedAssetWrites";

/**
 * الأصول الثابتة (البند ١٩٠): تسجيل أصلٍ وقيد شرائه معاً، وقيد ما استحقّ من إهلاكه. The database checks the book is
 * the member's farm book and every figure (supabase/migrations/20261106010000_fixed_assets.sql). The writes are in
 * lib/fixedAssetWrites, which the phone app's routes call too.
 */

function back(key: "ok" | "error", message: string): never {
  revalidatePath("/books/assets");
  revalidatePath("/books");
  redirect(`/books/assets?${key}=${encodeURIComponent(message)}`);
}

export async function addAsset(fd: FormData) {
  const { locale } = await translator();
  const { supabase } = await signedIn();
  const r = await addFixedAsset(
    supabase,
    {
      name: str(fd, "name"),
      account: str(fd, "account"),
      acquired_on: str(fd, "acquired_on"),
      cost: str(fd, "cost"),
      salvage: str(fd, "salvage"),
      life_years: str(fd, "life_years"),
      paid_from: str(fd, "paid_from"),
    },
    locale,
  );
  back(r.ok ? "ok" : "error", r.message);
}

export async function depreciateNow() {
  const { locale } = await translator();
  const { supabase } = await signedIn();
  const r = await depreciateFarmAssets(supabase, locale);
  back(r.ok ? "ok" : "error", r.message);
}

export async function disposeAsset(fd: FormData) {
  const { locale } = await translator();
  const { supabase } = await signedIn();
  const r = await disposeFixedAsset(
    supabase,
    {
      asset_id: str(fd, "asset_id"),
      disposed_on: str(fd, "disposed_on"),
      proceeds: str(fd, "proceeds"),
      received_into: str(fd, "received_into"),
    },
    locale,
  );
  back(r.ok ? "ok" : "error", r.message);
}
