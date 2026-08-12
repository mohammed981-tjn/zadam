"use server";

import { createClient } from "@/lib/supabase/server";

export async function submitLead(formData: FormData) {
  const fullName = String(formData.get("full_name") ?? "").trim();
  const contact = String(formData.get("contact") ?? "").trim();
  const role = String(formData.get("role") ?? "other");
  const interest = String(formData.get("interest") ?? "").trim();

  if (!fullName || !contact) {
    return { ok: false, message: "الاسم ووسيلة التواصل مطلوبان." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("leads").insert({
    full_name: fullName,
    contact,
    role: ["investor", "farmer", "other"].includes(role) ? role : "other",
    interest: interest || null,
  });

  if (error) {
    return { ok: false, message: "تعذّر إرسال بياناتك، حاول مرة أخرى." };
  }

  return {
    ok: true,
    message: "تم استلام بياناتك، سيتواصل معك فريق سودجري قريباً.",
  };
}
