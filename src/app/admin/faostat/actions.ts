"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { explain, signedIn, translator } from "@/lib/supplyActions";
import { adminState } from "@/lib/adminGuard";
import { createAdminClient } from "@/lib/supabase/admin";
import { syncFaostat } from "@/lib/faostatSync";

/**
 * The administrator's acts on the FAOSTAT difference (backlog 197): approve it in one click, set it aside, or look
 * again now instead of waiting for the daily check. What the database does with an approval is one function
 * (faostat_apply_pending), which keeps what it replaces.
 */

function back(key: "ok" | "error", message: string): never {
  revalidatePath("/admin/faostat");
  redirect(`/admin/faostat?${key}=${encodeURIComponent(message)}`);
}

export async function applyFaostat(fd: FormData) {
  const { supabase } = await signedIn();
  const { locale, t } = await translator();
  // What the page showed (backlog 198 C12): the database approves exactly that, or refuses if a check moved it since.
  const seenRows = Number(fd.get("seen_rows"));
  const seenNewest = String(fd.get("seen_newest") ?? "");
  if (!Number.isInteger(seenRows) || seenRows < 1 || !seenNewest) {
    back("error", t("افتح الصفحة من جديد ثمّ اعتمد.", "Open the page again, then approve."));
  }
  const { data, error } = await supabase.rpc("faostat_apply_pending", { p_seen_rows: seenRows, p_seen_newest: seenNewest });
  if (error) back("error", explain(locale, error));
  const r = (data ?? {}) as { new?: number; changed?: number };
  back(
    "ok",
    t(
      `اعتُمد التحميل: ${r.new ?? 0} رقماً جديداً و${r.changed ?? 0} معدَّلاً. حُفظت الأرقام القديمة في سجلّ المستبدَل.`,
      `Load approved: ${r.new ?? 0} new and ${r.changed ?? 0} changed. The old figures are kept in the replaced-figures log.`,
    ),
  );
}

export async function discardFaostat() {
  const { supabase } = await signedIn();
  const { locale, t } = await translator();
  const { data, error } = await supabase.rpc("faostat_discard_pending");
  if (error) back("error", explain(locale, error));
  back(
    "ok",
    t(
      `تُرك ${Number(data ?? 0)} صفّاً جانباً ولم يُحمَّل شيء. لا يعود الفحصُ اليوميّ إليه حتى يتغيّر الملفّ؛ وزرّ «افحص الآن» يعيده.`,
      `${Number(data ?? 0)} rows set aside and nothing loaded. The daily check will not bring it back until the file changes; «Check now» does.`,
    ),
  );
}

export async function syncFaostatNow() {
  const { supabase, user } = await signedIn();
  const { t } = await translator();
  // The check writes as the project, so the caller must be an administrator first.
  if ((await adminState(supabase, user.id)) !== "ok") {
    back("error", t("للإدارة وحدها، بالرمز الثاني.", "Administrators only, with the second factor."));
  }
  const admin = createAdminClient();
  if (!admin) back("error", t("مفتاح الخادم غير مضبوط على هذا النشر.", "The server key is not set on this deployment."));
  const s = await syncFaostat(admin, "admin", { force: true });
  back(
    s.problems.some((p) => p.startsWith("رُفض") || p.startsWith("تعذّر")) ? "error" : "ok",
    t(
      `قورنت الملفّات بالقاعدة: ${s.newRows} جديداً و${s.changedRows} معدَّلاً و${s.sameRows} كما هو. لم يُحمَّل شيء بعد.${s.problems.length ? ` ${s.problems.length} ملاحظة تحت.` : ""}`,
      `Files compared with the database: ${s.newRows} new, ${s.changedRows} changed, ${s.sameRows} unchanged. Nothing is loaded yet.${s.problems.length ? ` ${s.problems.length} notes below.` : ""}`,
    ),
  );
}
