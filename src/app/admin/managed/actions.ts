"use server";

import { randomBytes, randomInt } from "node:crypto";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/adminGuard";
import { createAdminClient } from "@/lib/supabase/admin";
import { dbText } from "@/lib/dbText";
import { toE164 } from "@/lib/phone";
import { phoneToEmail } from "@/lib/phoneIdentity";

export interface ManagedResult {
  ok: boolean;
  message: string;
  /** Shown once, to be read out to the farmer; never stored. */
  password?: string;
}

/** تعتمد الإدارة مزارعاً سجّلته جمعيّته بلا جوّال، أو تردّه بسبب تقرؤه الجمعيّة (البند ١٦٩). */
export async function reviewManaged(_prev: ManagedResult | null, fd: FormData): Promise<ManagedResult> {
  const { supabase } = await requireAdmin();
  const approve = fd.get("decision") === "approve";
  if (approve && fd.get("checked") !== "on") {
    return { ok: false, message: "افتح الورقة والصورة أوّلاً، وتأكّد أنّ الورقة موقَّعة أو مبصومة وأنّ الاسم يطابق." };
  }
  const { error } = await supabase.rpc("managed_farmer_review", {
    p_user: String(fd.get("user") ?? ""),
    p_approve: approve,
    p_note: String(fd.get("note") ?? ""),
  });
  revalidatePath("/admin/managed");
  if (error) return { ok: false, message: await dbText(error.message) };
  return { ok: true, message: approve ? "اعتُمد، وأُخبرت الجمعيّة." : "رُدّ بسببه، وأُخبرت الجمعيّة." };
}

/** Twelve digits: easy to read out over a poor line, and good for one sign-in behind the login throttle. */
function temporaryPassword(): string {
  return Array.from({ length: 12 }, () => randomInt(10)).join("");
}

/**
 * صار للمزارع جوّال: تربط الإدارة رقمه بحسابه وتُصدر كلمةً مؤقّتة تقرؤها له، فيدخل ويضع كلمته هو. يُغيَّر عنوان
 * الدخول وكلمة المرور بمفتاح الخادم (المستدعي السابع في lib/supabase/admin.ts)، فإن رفضت القاعدة الربط أُعيد الحساب
 * كما كان: بعنوانه الداخليّ وكلمةٍ لا يعرفها أحد.
 */
export async function claimManaged(_prev: ManagedResult | null, fd: FormData): Promise<ManagedResult> {
  const { supabase } = await requireAdmin();
  const user = String(fd.get("user") ?? "");
  if (fd.get("called") !== "on") {
    return { ok: false, message: "اتّصل بالرقم وتأكّد أنّ من يجيب هو المزارع نفسه، أو أنّه أمام الجمعيّة الآن." };
  }
  const phone = toE164("249", String(fd.get("phone") ?? ""), "ar");
  if (!phone.ok) return { ok: false, message: phone.message };

  const { data: rows } = await supabase.rpc("managed_farmers_pending");
  const farmer = ((rows ?? []) as { user_id: string; status: string }[]).find((r) => r.user_id === user);
  if (farmer?.status !== "approved") return { ok: false, message: "يُربط بجوّالٍ مزارعٌ اعتُمد تسجيله." };

  const admin = createAdminClient();
  if (!admin) return { ok: false, message: "مفتاح الخادم غير مضبوط على هذا النشر." };
  const { data: before } = await admin.auth.admin.getUserById(user);
  const oldEmail = before.user?.email;
  if (!oldEmail?.endsWith("@managed.invalid")) return { ok: false, message: "هذا الحساب ليس حساب مزارعٍ بلا جوّال." };

  const password = temporaryPassword();
  const { error } = await admin.auth.admin.updateUserById(user, {
    email: phoneToEmail(phone.e164),
    email_confirm: true,
    password,
    user_metadata: { managed: false, phone: phone.e164, must_change_password: true },
  });
  if (error) {
    const taken = /already|registered|exists/i.test(error.message);
    return { ok: false, message: taken ? "هذا الرقم لحسابٍ آخر." : `تعذّر الربط: ${await dbText(error.message)}` };
  }

  const { error: claimError } = await supabase.rpc("managed_farmer_claimed", { p_user: user, p_phone: phone.e164 });
  if (claimError) {
    await admin.auth.admin.updateUserById(user, {
      email: oldEmail,
      email_confirm: true,
      password: randomBytes(32).toString("base64url"),
      user_metadata: { managed: true, phone: null, must_change_password: false },
    });
    return { ok: false, message: await dbText(claimError.message) };
  }
  revalidatePath("/admin/managed");
  return {
    ok: true,
    password,
    message: `رُبط الحساب بالرقم ${phone.display}. اقرأ الكلمة للمزارع الآن؛ لن تظهر مرّةً ثانية، ويُطلب منه تغييرها حين يدخل.`,
  };
}
