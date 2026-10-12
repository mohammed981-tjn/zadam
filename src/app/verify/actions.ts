"use server";

import { SUDAN_STATES } from "@/lib/nafir";
import { back, explain, signedIn, str, translator } from "@/lib/supplyActions";

/** «أبلغ عن منتج مشبوه» — stored for an administrator to review and forward to the Council. */
export async function submitReport(fd: FormData) {
  const { supabase } = await signedIn();
  const { locale, t } = await translator();
  const state = str(fd, "state");
  if (!(SUDAN_STATES as readonly string[]).includes(state)) back("/verify", "error", t("اختر الولاية.", "Choose the state."));
  const { error } = await supabase.rpc("product_report_submit", {
    p_product_name: str(fd, "product_name"),
    p_registration_no: str(fd, "registration_no"),
    p_where_bought: str(fd, "where_bought"),
    p_state: state,
    p_photo_path: str(fd, "photo_path"),
    p_details: str(fd, "details"),
  });
  if (error) back("/verify", "error", explain(locale, error));
  back(
    "/verify",
    "ok",
    t(
      "وصل بلاغك. يراجعه المشرف ويحيله إلى المجلس القومي للمبيدات. شكراً — هكذا يُحمى جيرانك.",
      "Your report has arrived. An administrator will review it and forward it to the National Pesticides Council. Thank you — this is how your neighbours are protected.",
    ),
  );
}
