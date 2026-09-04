"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { checkRateLimit, clientAddress } from "@/lib/rateLimit";
import { parseDecimal, QUANTITY_SCALE, quantityToString } from "@/lib/exportOffers";

export interface InterestResult {
  ok: boolean;
  message: string;
}

const str = (fd: FormData, k: string, max: number) =>
  String(fd.get(k) ?? "")
    .trim()
    .slice(0, max);

/**
 * طلبُ اهتمامٍ من مشترٍ — بلا حساب.
 *
 * WHY THERE IS NO ACCOUNT AND NO LOGIN
 *
 * The buyer is an importer in Rotterdam or a trader in Jeddah who has never
 * heard of this platform. Asking them to register before they can ask one
 * question is asking them not to ask. What keeps this safe is not a login wall:
 * the insert policy admits a row only against a **published** offer, with the
 * initial status fixed, and nothing here can read back what other buyers wrote.
 *
 * WHY THIS RUNS AS THE VISITOR AND NOT AS THE PROJECT
 *
 * Deliberately the ordinary client. The insert is meant to be something the
 * public can do, so it should meet the public policy and be refused by it when
 * the policy says no. Using the service-role key would bypass the very rule
 * that makes this endpoint narrow — and a bug in this file would then be able
 * to write against a draft offer instead of being stopped.
 *
 * WHY IT IS RATE LIMITED AND FAILS CLOSED
 *
 * A public unauthenticated write is a spam target, and this one lands in the
 * inbox the platform's operator actually reads. A limiter that fails open
 * protects nothing on exactly the day it matters.
 */
export async function submitInterest(
  offerId: string,
  formData: FormData,
): Promise<InterestResult> {
  const verdict = await checkRateLimit("interest", clientAddress(await headers()));
  if (!verdict.allowed) {
    return {
      ok: false,
      message:
        verdict.tier === "unavailable"
          ? "تعذّر إرسال الطلب مؤقتاً. حاول بعد قليل."
          : "أُرسلت طلبات كثيرة من هذا الاتصال. انتظر قليلاً ثم أعد المحاولة.",
    };
  }

  const name = str(formData, "buyer_name", 120);
  const email = str(formData, "buyer_email", 200);
  const phone = str(formData, "buyer_phone", 60);

  if (name.length < 2) return { ok: false, message: "الاسم مطلوب." };
  if (!email && !phone) {
    return {
      ok: false,
      message: "اترك بريداً أو هاتفاً — بلا وسيلة اتّصال لا يمكن الردّ عليك.",
    };
  }
  // Shape only, never a deliverability claim. Rejecting a valid-but-unusual
  // address is a lost buyer; the operator finds out it bounces either way.
  if (email && !/^[^@\s]+@[^@\s.]+\.[^@\s]+$/.test(email)) {
    return { ok: false, message: "صيغة البريد غير صحيحة." };
  }

  const wantedText = str(formData, "quantity_wanted", 24);
  let quantityWanted: string | null = null;
  if (wantedText) {
    const scaled = parseDecimal(wantedText, QUANTITY_SCALE);
    if (scaled === null || scaled === BigInt(0)) {
      return { ok: false, message: "الكمّية المطلوبة يجب أن تكون رقماً أكبر من صفر." };
    }
    quantityWanted = quantityToString(scaled);
  }

  const supabase = await createClient();
  const { error } = await supabase.from("export_offer_interests").insert({
    offer_id: offerId,
    buyer_name: name,
    buyer_company: str(formData, "buyer_company", 160) || null,
    buyer_email: email || null,
    buyer_phone: phone || null,
    buyer_country: str(formData, "buyer_country", 80) || null,
    quantity_wanted: quantityWanted,
    message: str(formData, "message", 2000) || null,
    status: "new",
  });

  if (error) {
    console.error("market: interest insert failed", error);
    return {
      ok: false,
      message:
        "تعذّر إرسال الطلب. تأكّد أنّ العرض ما يزال منشوراً، وأعد المحاولة.",
    };
  }

  revalidatePath("/admin/export/interests");
  return {
    ok: true,
    message:
      "وصل طلبك. سنراجعه ونتواصل معك — واذكر مرجع العرض في أيّ مراسلة لاحقة.",
  };
}
