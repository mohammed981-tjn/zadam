"use client";

import { useActionState } from "react";
import { issueTemporaryPassword, refuseReset, type IssueResult } from "@/app/admin/resets/actions";
import { button, field, ghost } from "@/lib/ui";

/** طلبٌ واحد في «استعادة كلمات المرور» (AUTH-05): تأكّد بالاتّصال، ثمّ أصدر كلمةً مؤقّتة تظهر هنا مرّةً واحدة، أو ردّه بسبب. */
export default function PasswordResetCard({ id }: { id: string }) {
  const [issued, issue, issuing] = useActionState<IssueResult | null, FormData>(issueTemporaryPassword, null);
  const [refused, refuse, refusing] = useActionState<IssueResult | null, FormData>(refuseReset, null);
  const done = issued?.ok || refused?.ok;

  if (issued?.ok && issued.password) {
    return (
      <div className="mt-3 rounded-xl bg-primary/10 p-3 text-sm">
        <p>{issued.message}</p>
        <p className="mt-2 text-2xl font-black tracking-widest" dir="ltr">
          {issued.password.replace(/(\d{3})(?=\d)/g, "$1 ")}
        </p>
      </div>
    );
  }
  return (
    <div className="mt-3 grid gap-3">
      {!done && (
        <form action={issue} className="flex flex-wrap items-center gap-3 text-sm">
          <input type="hidden" name="id" value={id} />
          <label className="flex items-center gap-2">
            <input type="checkbox" name="called" required /> اتّصلت بالرقم المسجَّل وتأكّدت أنّه صاحبه
          </label>
          <button disabled={issuing} className={button}>
            أصدر كلمة مؤقّتة
          </button>
        </form>
      )}
      {!done && (
        <form action={refuse} className="flex flex-wrap items-end gap-2 text-sm">
          <input type="hidden" name="id" value={id} />
          <input name="note" required minLength={3} maxLength={300} placeholder="سبب الردّ (لم يُجب، الاسم لا يطابق…)" className={`${field} min-w-0 flex-1`} />
          <button disabled={refusing} className={ghost}>
            ردّ
          </button>
        </form>
      )}
      {(issued && !issued.ok) || (refused && !refused.ok) ? (
        <p className="rounded-xl bg-danger/10 p-3 text-sm text-danger">{issued?.message ?? refused?.message}</p>
      ) : refused?.ok ? (
        <p className="text-sm text-muted">{refused.message}</p>
      ) : null}
    </div>
  );
}
