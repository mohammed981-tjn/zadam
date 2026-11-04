import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getLocale } from "@/lib/locale";
import { tr } from "@/lib/i18n";
import PageHeader from "@/components/PageHeader";
import ActionNotice from "@/components/ActionNotice";
import { button, card, ghost } from "@/lib/ui";
import { requestClosure, withdrawClosure } from "./actions";

export const metadata = { title: "إغلاق الحساب | سوداقري" };

/**
 * إغلاق الحساب — صفحة صاحبه (البند ١٩٥). يطلب، ويأخذ ملفّ بياناته قبل ذلك، ويسحب طلبه ما دام قائماً؛ والإغلاق نفسه
 * تنفّذه الإدارة.
 */
export default async function CloseAccountPage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const sp = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/account/close");

  const locale = await getLocale();
  const t = (ar: string, en: string) => tr(locale, ar, en);
  const { data: open } = await supabase
    .from("account_closure_requests")
    .select("id, requested_at")
    .eq("user_id", user.id)
    .eq("status", "open")
    .maybeSingle();

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <PageHeader icon="shield" eyebrow={t("حسابي", "My account")} title={t("إغلاق الحساب", "Closing the account")}>
        {t(
          "حين تُغلق الإدارة حسابك: يتوقّف دخولك، ويختفي اسمك وجوّالك وبريدك عن الناس كلّهم، وتُحذف إشعاراتك وتنبيهاتك. أمّا دفاترك وعقودك ورسائلك فتبقى باسم «حساب مُغلَق»، لأنّ لطرفٍ آخر معك حقّاً فيها. ويبقى اسمك وجوّالك عند الإدارة وحدها، لا يراهما غيرها، حتى تمحوهما بسبب.",
          "When the administrators close your account: your sign-in stops, your name, phone and email are hidden from everyone, and your notifications and alerts are deleted. Your books, agreements and messages stay under «Closed account», because another party with you has a right to them. Your name and phone stay with the administrators alone until they erase them, with a reason.",
        )}
      </PageHeader>
      <ActionNotice ok={sp.ok} error={sp.error} />

      <section className={`${card} mb-6`}>
        <h2 className="font-black">{t("١. نزّل بياناتك أوّلاً", "1. Download your data first")}</h2>
        <p className="mt-1 text-sm text-muted">
          {t("ملفٌّ واحد فيه ملفّك وأراضيك ودفاترك وقيودها وعقودك وتوقيعاتك واستثماراتك.", "One file with your profile, land, books and their entries, agreements, signatures and investments.")}
        </p>
        <a href="/account/export" className={`${ghost} mt-3 inline-block`}>
          {t("نزّل بياناتي", "Download my data")}
        </a>
      </section>

      <section className={card}>
        <h2 className="font-black">{t("٢. اطلب الإغلاق", "2. Ask for the account to be closed")}</h2>
        {open ? (
          <>
            <p className="mt-1 text-sm">{t("طلبك قائم، وتنفّذه الإدارة.", "Your request is open; the administrators carry it out.")}</p>
            <form action={withdrawClosure} className="mt-3">
              <button className={ghost}>{t("اسحب طلبي", "Take my request back")}</button>
            </form>
          </>
        ) : (
          <form action={requestClosure} className="mt-3 flex flex-col gap-2">
            <label className="flex flex-col gap-1 text-sm">
              {t("لماذا؟ (اختياريّ)", "Why? (optional)")}
              <textarea name="reason" maxLength={500} rows={2} className="rounded-lg border border-border bg-background px-2 py-1" />
            </label>
            <button className={button}>{t("أطلب إغلاق حسابي", "Ask to close my account")}</button>
          </form>
        )}
      </section>

      <p className="mt-6 text-xs text-muted">
        <Link href="/privacy" className="text-primary underline">
          {t("الخصوصيّة: ما نحفظه عنك ومن يراه", "Privacy: what we keep about you and who sees it")}
        </Link>
      </p>
    </div>
  );
}
