"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { explain, signedIn, str, translator } from "@/lib/supplyActions";
import { decideLandInvestorInterest } from "@/lib/landOwnerSteps";
import {
  consentSentence,
  expressInvestorInterest as expressInterestStep,
  interestSentSentence,
  setInvestorConsent as setInvestorConsentStep,
} from "@/lib/investSteps";

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

// ── المستثمر ─────────────────────────────────────────────────────────────────

export async function expressInvestorInterest(fd: FormData) {
  const { supabase } = await signedIn();
  const { locale, t } = await translator();
  // Asked from a project page (backlog 135): a refusal goes back there. Nowhere else.
  const from = str(fd, "return_to");
  const origin = /^\/projects\/[A-Za-z0-9_-]{1,80}$/.test(from) ? from : "/invest";
  // The checks — the risk notice above all (backlog 136) — and the database function are shared with the phone
  // app's route (src/lib/investSteps.ts).
  const result = await expressInterestStep(
    supabase,
    { landId: str(fd, "land_id"), model: str(fd, "model"), message: str(fd, "message"), riskAck: str(fd, "risk_ack") },
    { locale, t },
  );
  if (!result.ok) back(origin, "error", result.message);
  back("/invest/mine", "ok", interestSentSentence(t));
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
  const { locale, t } = await translator();
  // Sent from the project page built on this land: back there. Nowhere else.
  const from = str(fd, "return_to");
  const origin = /^\/projects\/[A-Za-z0-9_-]{1,80}$/.test(from) ? from : "/lands";
  const open = str(fd, "open") === "true";
  // Shared with the phone app's route (src/lib/investSteps.ts): the same model check, ownership read, soil
  // reading and database function.
  const result = await setInvestorConsentStep(
    supabase,
    user.id,
    { landId: str(fd, "land_id"), open, models: fd.getAll("models").map(String), note: str(fd, "note") },
    { locale, t },
  );
  if (!result.ok) back(origin, "error", result.message);
  if (origin !== "/lands") revalidatePath(origin);
  back(origin, "ok", consentSentence(open, t));
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
