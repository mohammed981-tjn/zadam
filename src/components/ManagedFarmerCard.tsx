"use client";

import { useActionState } from "react";
import { claimManaged, reviewManaged, type ManagedResult } from "@/app/admin/managed/actions";
import { button, field, ghost } from "@/lib/ui";

/**
 * مزارعٌ بلا جوّال في صفحة الإدارة (البند ١٦٩): ينتظر الاعتماد فيُعتمد أو يُردّ بسبب، أو اعتُمد فيُربط بجوّاله حين
 * يصير له، وتظهر الكلمة المؤقّتة هنا مرّةً واحدة.
 */
export default function ManagedFarmerCard({ user, status }: { user: string; status: "pending" | "approved" }) {
  const [reviewed, review, reviewing] = useActionState<ManagedResult | null, FormData>(reviewManaged, null);
  const [claimed, claim, claiming] = useActionState<ManagedResult | null, FormData>(claimManaged, null);
  const failed = (reviewed && !reviewed.ok && reviewed) || (claimed && !claimed.ok && claimed);

  if (claimed?.ok && claimed.password) {
    return (
      <div className="mt-3 rounded-xl bg-primary/10 p-3 text-sm">
        <p>{claimed.message}</p>
        <p className="mt-2 text-2xl font-black tracking-widest" dir="ltr">
          {claimed.password.replace(/(\d{3})(?=\d)/g, "$1 ")}
        </p>
      </div>
    );
  }
  if (reviewed?.ok) return <p className="mt-3 text-sm text-muted">{reviewed.message}</p>;

  return (
    <div className="mt-3 grid gap-3 text-sm">
      {status === "pending" ? (
        <>
          <form action={review} className="flex flex-wrap items-center gap-3">
            <input type="hidden" name="user" value={user} />
            <input type="hidden" name="decision" value="approve" />
            <label className="flex items-center gap-2">
              <input type="checkbox" name="checked" required /> فتحتُ الورقة والصورة: موقَّعة أو مبصومة، والاسم يطابق
            </label>
            <button disabled={reviewing} className={button}>
              اعتمد
            </button>
          </form>
          <form action={review} className="flex flex-wrap items-end gap-2">
            <input type="hidden" name="user" value={user} />
            <input type="hidden" name="decision" value="refuse" />
            <input name="note" required minLength={3} maxLength={300} placeholder="سبب الردّ (الورقة غير واضحة، بلا توقيع…)" className={`${field} min-w-0 flex-1`} />
            <button disabled={reviewing} className={ghost}>
              ردّ
            </button>
          </form>
        </>
      ) : (
        <form action={claim} className="grid gap-2">
          <input type="hidden" name="user" value={user} />
          <p className="font-medium">صار له جوّال؟ اربطه بحسابه:</p>
          <input name="phone" required inputMode="tel" placeholder="09xxxxxxxx" dir="ltr" className={field} />
          <label className="flex items-center gap-2">
            <input type="checkbox" name="called" required /> اتّصلت بالرقم وتأكّدت أنّه المزارع نفسه
          </label>
          <button disabled={claiming} className={button}>
            اربط وأصدر كلمة مؤقّتة
          </button>
        </form>
      )}
      {failed && <p className="rounded-xl bg-danger/10 p-3 text-danger">{failed.message}</p>}
    </div>
  );
}
