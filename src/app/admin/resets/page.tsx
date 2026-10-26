import Link from "next/link";
import { requireAdmin } from "@/lib/adminGuard";
import PasswordResetCard from "@/components/PasswordResetCard";
import { card } from "@/lib/ui";

export const metadata = { title: "استعادة كلمات المرور | سوداقري" };

type Pending = {
  id: string;
  user_id: string;
  given_name: string;
  account_name: string | null;
  account_phone: string | null;
  created_at: string;
};

/**
 * استعادة كلمات مرور حسابات الجوال (AUTH-05، البند ١٤١). صفحةٌ للإدارة وحدها، بالعربيّة كبقيّة صفحاتها.
 * القاعدة: لا تُصدَر كلمةٌ إلا بعد الاتّصال بالرقم المسجَّل في الحساب نفسه — لا برقمٍ يقوله المتّصل — والتأكّد أنّ من
 * يجيب صاحبه. ويُقارَن الاسم المكتوب في الطلب باسم الحساب.
 */
export default async function AdminResetsPage() {
  const { supabase } = await requireAdmin();
  const { data, error } = await supabase.rpc("password_reset_pending");
  if (error) console.error("admin/resets: pending failed", error.message);
  const pending = (data ?? []) as Pending[];

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <Link href="/admin" className="text-sm text-primary underline">
        → لوحة الإدارة
      </Link>
      <h1 className="mt-4 font-black" style={{ fontSize: "var(--text-title)" }}>
        استعادة كلمات مرور حسابات الجوال
      </h1>
      <ol className="mt-3 list-decimal space-y-1 ps-5 text-sm leading-7 text-muted">
        <li>اتّصل بالرقم المسجَّل في الحساب (المكتوب هنا)، لا برقمٍ يعطيك إيّاه أحد.</li>
        <li>تأكّد أنّ من يجيب صاحب الحساب: اسمه كما في الحساب، وما سجّله فيه (أرضه، ولايته).</li>
        <li>أصدر الكلمة المؤقّتة واقرأها له؛ تظهر مرّةً واحدة، ويُطلب منه تغييرها حين يدخل.</li>
      </ol>

      {pending.length === 0 ? (
        <p className="mt-8 text-muted">لا طلب ينتظر.</p>
      ) : (
        <ul className="mt-6 grid gap-4">
          {pending.map((p) => (
            <li key={p.id} className={card}>
              <p className="text-xs text-muted">{new Date(p.created_at).toLocaleString("ar-EG")}</p>
              <p className="mt-1">
                الحساب: <b>{p.account_name || "بلا اسم"}</b> · <span dir="ltr">{p.account_phone ?? "—"}</span>
              </p>
              <p className="text-sm text-muted">الاسم المكتوب في الطلب: {p.given_name}</p>
              {p.account_phone && (
                <a href={`tel:${p.account_phone.startsWith("+") ? p.account_phone : `+${p.account_phone}`}`} className="mt-2 inline-block text-sm font-bold text-primary underline">
                  📞 اتّصل بالرقم المسجَّل
                </a>
              )}
              <PasswordResetCard id={p.id} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
