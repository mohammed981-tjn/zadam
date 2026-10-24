"use server";
import { dbText } from "@/lib/dbText";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { investmentLive } from "@/lib/platformFlags";
import { getLocale } from "@/lib/locale";
import { tr } from "@/lib/i18n";

export async function invest(formData: FormData) {
  const projectId = String(formData.get("project_id") ?? "");
  const slug = String(formData.get("slug") ?? "");
  const shares = Number(formData.get("shares") ?? 0);
  const locale = await getLocale();
  const t = (ar: string, en: string) => tr(locale, ar, en);
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
  if (!(await investmentLive(await createClient()))) {
    redirect(
      `/projects/${slug}?error=${encodeURIComponent(
        t(
          "الاستثمار غير مفتوح بعد. سجّل اهتمامك وسنبلغك فور إتاحته.",
          "Investment is not open yet. Register your interest and we will let you know as soon as it opens.",
        ),
      )}`,
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(
      `/login?error=${encodeURIComponent(t("سجّل الدخول أولاً للاستثمار", "Sign in first to invest"))}`,
    );
  }

  if (!Number.isFinite(shares) || shares < 1) {
    redirect(
      `/projects/${slug}?error=${encodeURIComponent(t("عدد الحصص غير صالح", "Invalid number of shares"))}`,
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
      `/projects/${slug}?error=${encodeURIComponent(t("الفرصة غير موجودة.", "This opportunity does not exist."))}`,
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
        t(
          "هذا نموذج توضيحي وليس فرصة استثمار حقيقية.",
          "This is an illustrative example, not a real investment opportunity.",
        ),
      )}`,
    );
  }

  // A draft or a completed project is not taking money, and the page hiding
  // the button is not what enforces that.
  if (project.status !== "open") {
    redirect(
      `/projects/${slug}?error=${encodeURIComponent(
        t(
          "هذه الفرصة ليست مفتوحة للاستثمار حالياً.",
          "This opportunity is not open for investment right now.",
        ),
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
        t(
          "اكتمل حجز حصص هذه الفرصة.",
          "All shares in this opportunity have been taken.",
        ),
      )}`,
    );
  }
  if (shares > remaining) {
    redirect(
      `/projects/${slug}?error=${encodeURIComponent(
        locale === "en"
          ? `Only ${remaining} shares remain — request that many or fewer.`
          : `المتبقّي ${remaining} حصة فقط — اطلب هذا العدد أو أقل.`,
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
    redirect(`/projects/${slug}?error=${encodeURIComponent(await dbText(error.message))}`);
  }

  redirect("/dashboard?invested=1");
}
