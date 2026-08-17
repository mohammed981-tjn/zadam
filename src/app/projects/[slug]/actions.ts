"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { INVESTMENT_LIVE } from "@/lib/config";

export async function invest(formData: FormData) {
  const projectId = String(formData.get("project_id") ?? "");
  const slug = String(formData.get("slug") ?? "");
  const shares = Number(formData.get("shares") ?? 0);
  /*
   * The price is deliberately NOT read from the request.
   *
   * It used to be — `Number(formData.get("price_per_share"))`, multiplied by
   * the share count and stored as the amount. The form belongs to the visitor,
   * so a crafted request naming price_per_share=1 recorded a hundred shares at
   * a hundred pounds instead of a hundred thousand, and the row was accepted
   * because nothing compared it against anything.
   *
   * It now comes from the project row, read server-side below. Same rule the
   * service-contract builder already follows: the browser says what it wants,
   * never what it costs.
   */

  // Server-side gate: the platform does not accept money yet, and refusing here
  // (not just hiding the button) is what actually stops a forged request.
  if (!INVESTMENT_LIVE) {
    redirect(
      `/projects/${slug}?error=${encodeURIComponent(
        "الاستثمار غير مفتوح بعد. سجّل اهتمامك وسنبلغك فور إتاحته.",
      )}`,
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(
      `/login?error=${encodeURIComponent("سجّل الدخول أولاً للاستثمار")}`,
    );
  }

  if (!Number.isFinite(shares) || shares < 1) {
    redirect(
      `/projects/${slug}?error=${encodeURIComponent("عدد الحصص غير صالح")}`,
    );
  }

  // A sample project can never take a real investment, whatever the stage flag.
  const { data: projectRow } = await supabase
    .from("projects")
    .select("is_demo, status, price_per_share, total_shares, shares_sold")
    .eq("id", projectId)
    .single();

  if (!projectRow) {
    redirect(
      `/projects/${slug}?error=${encodeURIComponent("الفرصة غير موجودة.")}`,
    );
  }

  const project = projectRow as {
    is_demo: boolean;
    status: string;
    price_per_share: number;
    total_shares: number;
    shares_sold: number;
  };

  if (project.is_demo) {
    redirect(
      `/projects/${slug}?error=${encodeURIComponent(
        "هذا نموذج توضيحي وليس فرصة استثمار حقيقية.",
      )}`,
    );
  }

  // A draft or a completed project is not taking money, and the page hiding
  // the button is not what enforces that.
  if (project.status !== "open") {
    redirect(
      `/projects/${slug}?error=${encodeURIComponent(
        "هذه الفرصة ليست مفتوحة للاستثمار حالياً.",
      )}`,
    );
  }

  /*
   * Capacity, checked before the request is recorded rather than after.
   *
   * This is the near half of a two-part problem — confirm_investment increments
   * shares_sold and has its own check now. Both are needed: without this one a
   * project accumulates pending requests it can never honour and an admin has
   * to reject them by hand; without the other, confirming them oversells the
   * project anyway.
   *
   * Measured against shares_sold, which counts confirmed investments only.
   * Pending requests are deliberately not reserved: holding capacity for an
   * unconfirmed request would let anyone lock a whole project out of the market
   * by asking for all of it and never paying.
   */
  const remaining = project.total_shares - project.shares_sold;
  if (remaining <= 0) {
    redirect(
      `/projects/${slug}?error=${encodeURIComponent(
        "اكتمل حجز حصص هذه الفرصة.",
      )}`,
    );
  }
  if (shares > remaining) {
    redirect(
      `/projects/${slug}?error=${encodeURIComponent(
        `المتبقّي ${remaining} حصة فقط — اطلب هذا العدد أو أقل.`,
      )}`,
    );
  }

  const { error } = await supabase.from("investments").insert({
    project_id: projectId,
    investor_id: user.id,
    shares,
    // The project's own price, never the form's.
    amount: shares * Number(project.price_per_share),
    status: "pending",
  });

  if (error) {
    redirect(`/projects/${slug}?error=${encodeURIComponent(error.message)}`);
  }

  redirect("/dashboard?invested=1");
}
