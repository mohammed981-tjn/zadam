"use client";

import { useActionState } from "react";
import Explain, { Steps } from "@/components/Explain";
import { SERVICE_KIND_LABEL, serviceKindLabel, type ServiceKind } from "@/lib/services";
import { useLocale } from "@/components/LocaleProvider";
import { tr } from "@/lib/i18n";
import { registerProvider, type ActionResult } from "@/app/services/actions";

const field =
  "rounded-lg border border-border bg-background px-3 py-2 outline-none focus:border-primary";

const KINDS = Object.keys(SERVICE_KIND_LABEL) as ServiceKind[];

export default function ProviderForm() {
  const [state, formAction, pending] = useActionState<
    ActionResult | null,
    FormData
  >(registerProvider, null);
  const locale = useLocale();
  const t = (ar: string, en: string) => tr(locale, ar, en);

  // On success the form is replaced by the confirmation rather than sitting
  // there inviting a second submission. A visitor who has just registered needs
  // to know what happens next, not another empty form.
  if (state?.ok) {
    return (
      <div className="rounded-2xl border border-primary/30 bg-primary/5 p-6">
        <p className="font-bold text-primary">{t("تم التسجيل", "Registered")}</p>
        <p className="mt-2 text-sm leading-relaxed">{state.message}</p>
        <ol className="mt-4 flex flex-col gap-2 text-sm text-muted">
          <li>{t("١. تراجع الإدارة بيانات جهتك ورخصها.", "1. The administrators review your organisation's details and licences.")}</li>
          <li>{t("٢. بعد التوثيق تظهر في صفحة الخدمات ويمكن التعاقد معك.", "2. Once verified, you appear on the services page and can be contracted.")}</li>
          <li>{t("٣. تضيف عروضك وأسعارها، كل خدمة بوحدتها.", "3. You add your offers and prices, each service in its own unit.")}</li>
        </ol>
      </div>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-5">
      <Steps
        steps={[
          t("بيانات الجهة", "Organisation details"),
          t("التوثيق", "Verification"),
          t("إضافة العروض", "Adding offers"),
        ]}
        current={0}
      />

      <fieldset className="grid gap-4 rounded-2xl border border-border bg-card p-5 sm:grid-cols-2">
        <legend className="px-2 text-sm font-bold">{t("جهتك", "Your organisation")}</legend>

        <label className="flex flex-col gap-1 text-sm sm:col-span-2">
          {t("اسم الجهة", "Organisation name")}
          <input
            name="name"
            required
            className={field}
            placeholder={t("مثال: مكتب النيل للهندسة الزراعية", "e.g. Nile Agricultural Engineering Office")}
          />
        </label>

        <label className="flex flex-col gap-1 text-sm">
          {t("نوع النشاط", "Type of activity")}
          <select name="kind" defaultValue="engineering_office" className={field}>
            {KINDS.map((k) => (
              <option key={k} value={k}>
                {serviceKindLabel(k, locale)}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-sm">
          {t("رقم التواصل", "Contact number")}
          <input
            name="phone"
            className={field}
            inputMode="tel"
            placeholder="09xxxxxxxx"
          />
        </label>

        <label className="flex flex-col gap-1 text-sm sm:col-span-2">
          {t("مناطق العمل", "Areas you work in")}
          <input
            name="regions"
            className={field}
            placeholder={t("الجزيرة، سنار، النيل الأبيض", "Gezira, Sennar, White Nile")}
          />
          <Explain>
            {t(
              "اكتب الولايات مفصولة بفاصلة. المزارع يبحث بالمنطقة أولاً، فكلما دقّقتها وصلك طلب أقرب لك.",
              "Write the states separated by commas. Farmers search by area first, so the more precise you are, the closer the requests you receive.",
            )}
          </Explain>
        </label>

        <label className="flex flex-col gap-1 text-sm sm:col-span-2">
          {t("نبذة عن خبرتكم", "About your experience")}
          <textarea
            name="bio"
            rows={4}
            className={field}
            placeholder={t(
              "سنوات العمل، أهم المشاريع المنفّذة، المعدّات التي تملكونها.",
              "Years in operation, main projects delivered, the equipment you own.",
            )}
          />
          <Explain tone="why">
            {t(
              "هذه النبذة هي ما يقرأه المستثمر قبل أن يوقّع عقداً بملايين الجنيهات. اذكر ما نفّذته فعلاً — الأرقام والمواقع تُقنع أكثر من الأوصاف.",
              "This is what an investor reads before signing a contract worth millions of pounds. Say what you have actually delivered — figures and locations convince more than descriptions.",
            )}
          </Explain>
        </label>
      </fieldset>

      <Explain tone="warn">
        {t(
          "التسجيل لا يعني التوثيق. لن تظهر جهتك في الكتالوج ولن يمكن التعاقد معك قبل أن تراجعها الإدارة — وهذا ما يحمي المزارع من التعاقد مع جهة غير معروفة، ويحمي سمعتك حين تُوثَّق.",
          "Registering is not verification. Your organisation will not appear in the catalogue and cannot be contracted until the administrators review it — that protects farmers from contracting an unknown party, and protects your reputation once you are verified.",
        )}
      </Explain>

      {state && !state.ok && (
        <p className="rounded-lg border border-danger/40 bg-danger/5 px-3 py-2 text-sm">
          {state.message}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="self-start rounded-lg bg-primary px-6 py-2.5 font-medium text-primary-foreground disabled:opacity-60"
      >
        {pending ? t("جارٍ التسجيل...", "Registering...") : t("سجّل جهتي", "Register my organisation")}
      </button>
    </form>
  );
}
