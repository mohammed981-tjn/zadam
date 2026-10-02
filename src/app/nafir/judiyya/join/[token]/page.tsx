import Link from "next/link";
import NafirShell, { button, field } from "@/components/nafir/NafirShell";
import { nafirViewer } from "@/lib/nafirViewer";
import { joinCase } from "../../actions";

export const metadata = { title: "دعوة إلى الجودية | سوداغري", robots: { index: false } };

/**
 * The other side arrives here from the link. Nothing about the case is shown
 * before joining — the link alone is not a reason to read someone's dispute;
 * joining is, and it can be done only once (judiyya_join rotates the token).
 */
export default async function JoinPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { token } = await params;
  const { error } = await searchParams;
  const { user, name } = await nafirViewer();

  return (
    <NafirShell active="/nafir/judiyya" error={error}>
      <h1 className="text-2xl font-bold">دُعيتَ إلى الجودية</h1>
      <p className="mt-2 max-w-2xl leading-8 text-muted">
        طلب منك طرفٌ أن تحتكما إلى أجاويد يرضاهما كلاكما. الدخول لا يُلزمك
        بشيء: بعده تقرأ الطلب، ثمّ تقرّر أن تلتزم بقبول الحكم أو لا.{" "}
        <Link href="/nafir/judiyya" className="text-primary underline">ما الجودية؟</Link>
      </p>
      {!user ? (
        <p className="mt-5 rounded-2xl border border-border bg-card p-5 text-sm">
          <Link href="/login" className="font-medium text-primary underline">سجّل الدخول</Link> أو{" "}
          <Link href="/signup" className="font-medium text-primary underline">أنشئ حساباً</Link>، ثمّ افتح الرابط نفسه مرّةً أخرى.
        </p>
      ) : (
        <form action={joinCase} className="mt-5 flex flex-col gap-3 rounded-2xl border border-border bg-card p-5">
          <input type="hidden" name="token" value={token} />
          <label className="flex flex-col gap-1 text-sm">
            اسمك كما يراه الطرف الآخر والأجاويد
            <input name="display_name" required minLength={2} maxLength={60} defaultValue={name} className={field} />
          </label>
          <button className={`${button} self-start`}>أدخل الطلب</button>
        </form>
      )}
    </NafirShell>
  );
}
