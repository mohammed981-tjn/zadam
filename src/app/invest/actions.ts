"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { explain, signedIn, str, translator } from "@/lib/supplyActions";
import { decideLandInvestorInterest, setLandInvestorConsent } from "@/lib/landOwnerSteps";
import { INVESTOR_MODELS } from "@/lib/investors";

/**
 * Every step between an investor and a landowner is a database function
 * (supabase/migrations/20261021210000_investor_partnerships.sql) that checks
 * who is taking it. These actions carry the form there; the checks here only
 * turn an obviously incomplete form into a sentence before the round trip.
 */

function back(path: string, key: "ok" | "error", message: string): never {
  revalidatePath("/invest", "layout");
  revalidatePath("/lands");
  revalidatePath("/admin/inbox");
  const sep = path.includes("?") ? "&" : "?";
  redirect(`${path}${sep}${key}=${encodeURIComponent(message)}`);
}

const models = (fd: FormData) =>
  [...new Set(fd.getAll("models").map(String).filter((m) => (INVESTOR_MODELS as readonly string[]).includes(m)))];

// ── المستثمر ─────────────────────────────────────────────────────────────────

export async function expressInvestorInterest(fd: FormData) {
  const { supabase } = await signedIn();
  const { locale, t } = await translator();
  // Asked from a project page (backlog 135): a refusal goes back there. Nowhere else.
  const from = str(fd, "return_to");
  const origin = /^\/projects\/[A-Za-z0-9_-]{1,80}$/.test(from) ? from : "/invest";
  const model = str(fd, "model");
  const message = str(fd, "message");
  if (!(INVESTOR_MODELS as readonly string[]).includes(model)) {
    back(origin, "error", t("اختر نموذج الشراكة.", "Choose a partnership model."));
  }
  if (message.length < 10) {
    back(
      origin,
      "error",
      t(
        "اكتب لصاحب الأرض سطرين على الأقلّ: من أنت، وماذا تقترح.",
        "Write the owner at least a couple of lines: who you are and what you propose.",
      ),
    );
  }
  // البند ١٣٦: الإقرار بالمخاطرة شرطٌ، والقاعدة تتحقّق منه وتحفظ وقته.
  if (str(fd, "risk_ack") !== "yes") {
    back(
      origin,
      "error",
      t(
        "اقرأ تنبيه المخاطرة وأقرّ به قبل أن ترسل الطلب.",
        "Read the risk notice and confirm it before sending the request.",
      ),
    );
  }
  const { error } = await supabase.rpc("investor_express_interest", {
    p_land: str(fd, "land_id"),
    p_model: model,
    p_message: message.slice(0, 1000),
    p_risk_ack: true,
  });
  if (error) back(origin, "error", explain(locale, error));
  back(
    "/invest/mine",
    "ok",
    t(
      "أُرسل طلبك. وصل صاحبَ الأرض إشعار، وحين يقبل ترى اسمه وهاتفه وموقع الأرض هنا.",
      "Your request was sent. The owner has been notified; once they accept you will see their name, phone and the land's location here.",
    ),
  );
}

export async function withdrawInvestorInterest(fd: FormData) {
  const { supabase } = await signedIn();
  const { locale, t } = await translator();
  const { error } = await supabase.rpc("investor_interest_withdraw", { p_interest: str(fd, "interest_id") });
  if (error) back("/invest/mine", "error", explain(locale, error));
  back("/invest/mine", "ok", t("سُحب الطلب.", "Request withdrawn."));
}

// ── صاحب الأرض ───────────────────────────────────────────────────────────────

/**
 * Opens or closes a verified land to investors. The soil class is read here
 * from the national soil map at the land's own coordinates, as for partner
 * companies — the owner does not type it.
 */
export async function setInvestorConsent(fd: FormData) {
  const { supabase, user } = await signedIn();
  const { locale } = await translator();
  // Sent from the project page built on this land: back there. Nowhere else.
  const from = str(fd, "return_to");
  const origin = /^\/projects\/[A-Za-z0-9_-]{1,80}$/.test(from) ? from : "/lands";
  // The step is shared with the phone app's land card (backlog 203): src/lib/landOwnerSteps.ts.
  const result = await setLandInvestorConsent(
    supabase,
    user.id,
    { landId: str(fd, "land_id"), open: str(fd, "open") === "true", models: models(fd), note: str(fd, "note") },
    locale,
  );
  if (!result.ok) back(origin, "error", result.message);
  if (origin !== "/lands") revalidatePath(origin);
  back(origin, "ok", result.message);
}

export async function decideInvestorInterest(fd: FormData) {
  const { supabase } = await signedIn();
  const { locale } = await translator();
  const result = await decideLandInvestorInterest(
    supabase,
    { interestId: str(fd, "interest_id"), accept: str(fd, "accept") === "true" },
    locale,
  );
  back("/lands", result.ok ? "ok" : "error", result.message);
}
