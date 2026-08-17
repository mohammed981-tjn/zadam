"use client";

import { useActionState } from "react";
import Explain, { Steps } from "@/components/Explain";
import { SERVICE_KIND_LABEL, type ServiceKind } from "@/lib/services";
import { registerProvider, type ActionResult } from "@/app/services/actions";

const field =
  "rounded-lg border border-border bg-background px-3 py-2 outline-none focus:border-primary";

const KINDS = Object.keys(SERVICE_KIND_LABEL) as ServiceKind[];

export default function ProviderForm() {
  const [state, formAction, pending] = useActionState<
    ActionResult | null,
    FormData
  >(registerProvider, null);

  // On success the form is replaced by the confirmation rather than sitting
  // there inviting a second submission. A visitor who has just registered needs
  // to know what happens next, not another empty form.
  if (state?.ok) {
    return (
      <div className="rounded-2xl border border-primary/30 bg-primary/5 p-6">
        <p className="font-bold text-primary">تم التسجيل</p>
        <p className="mt-2 text-sm leading-relaxed">{state.message}</p>
        <ol className="mt-4 flex flex-col gap-2 text-sm text-muted">
          <li>١. تراجع الإدارة بيانات جهتك ورخصها.</li>
          <li>٢. بعد التوثيق تظهر في صفحة الخدمات ويمكن التعاقد معك.</li>
          <li>٣. تضيف عروضك وأسعارها، كل خدمة بوحدتها.</li>
        </ol>
      </div>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-5">
      <Steps steps={["بيانات الجهة", "التوثيق", "إضافة العروض"]} current={0} />

      <fieldset className="grid gap-4 rounded-2xl border border-border bg-card p-5 sm:grid-cols-2">
        <legend className="px-2 text-sm font-bold">جهتك</legend>

        <label className="flex flex-col gap-1 text-sm sm:col-span-2">
          اسم الجهة
          <input
            name="name"
            required
            className={field}
            placeholder="مثال: مكتب النيل للهندسة الزراعية"
          />
        </label>

        <label className="flex flex-col gap-1 text-sm">
          نوع النشاط
          <select name="kind" defaultValue="engineering_office" className={field}>
            {KINDS.map((k) => (
              <option key={k} value={k}>
                {SERVICE_KIND_LABEL[k]}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-sm">
          رقم التواصل
          <input
            name="phone"
            className={field}
            inputMode="tel"
            placeholder="09xxxxxxxx"
          />
        </label>

        <label className="flex flex-col gap-1 text-sm sm:col-span-2">
          مناطق العمل
          <input
            name="regions"
            className={field}
            placeholder="الجزيرة، سنار، النيل الأبيض"
          />
          <Explain>
            اكتب الولايات مفصولة بفاصلة. المزارع يبحث بالمنطقة أولاً، فكلما
            دقّقتها وصلك طلب أقرب لك.
          </Explain>
        </label>

        <label className="flex flex-col gap-1 text-sm sm:col-span-2">
          نبذة عن خبرتكم
          <textarea
            name="bio"
            rows={4}
            className={field}
            placeholder="سنوات العمل، أهم المشاريع المنفّذة، المعدّات التي تملكونها."
          />
          <Explain tone="why">
            هذه النبذة هي ما يقرأه المستثمر قبل أن يوقّع عقداً بملايين الجنيهات.
            اذكر ما نفّذته فعلاً — الأرقام والمواقع تُقنع أكثر من الأوصاف.
          </Explain>
        </label>
      </fieldset>

      <Explain tone="warn">
        التسجيل لا يعني التوثيق. لن تظهر جهتك في الكتالوج ولن يمكن التعاقد معك
        قبل أن تراجعها الإدارة — وهذا ما يحمي المزارع من التعاقد مع جهة غير
        معروفة، ويحمي سمعتك حين تُوثَّق.
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
        {pending ? "جارٍ التسجيل..." : "سجّل جهتي"}
      </button>
    </form>
  );
}
