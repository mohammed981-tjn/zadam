import Link from "next/link";
import NafirShell, { button, field } from "@/components/nafir/NafirShell";
import { nafirViewer } from "@/lib/nafirViewer";
import { getLocale } from "@/lib/locale";
import { tr } from "@/lib/i18n";
import { loginTo } from "@/lib/authEntry";
import { joinCase } from "../../actions";

export async function generateMetadata() {
  const locale = await getLocale();
  return { title: tr(locale, "دعوة إلى الجودية | سوداقري", "Invitation to judiyya | Sudagri"), robots: { index: false } };
}

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
  const locale = await getLocale();
  const t = (a: string, en: string) => tr(locale, a, en);
  const { user, name } = await nafirViewer();

  return (
    <NafirShell active="/nafir/judiyya" error={error}>
      <h1 className="text-2xl font-bold">{t("دُعيتَ إلى الجودية", "You have been invited to judiyya")}</h1>
      <p className="mt-2 max-w-2xl leading-8 text-muted">
        {t(
          "طلب منك طرفٌ أن تحتكما إلى أجاويد يرضاهما كلاكما. الدخول لا يُلزمك بشيء: بعده تقرأ الطلب، ثمّ تقرّر أن تلتزم بقبول الحكم أو لا.",
          "Someone has asked you to take your dispute to mediators (ajawid) you both accept. Joining commits you to nothing: after it you read the case, then decide whether to commit to accepting the ruling.",
        )}{" "}
        <Link href="/nafir/judiyya" className="text-primary underline">{t("ما الجودية؟", "What is judiyya?")}</Link>
      </p>
      {!user ? (
        <p className="mt-5 rounded-2xl border border-border bg-card p-5 text-sm">
          <Link href={loginTo(`/nafir/judiyya/join/${token}`)} className="font-medium text-primary underline">{t("سجّل الدخول", "Sign in")}</Link> {t("أو", "or")}{" "}
          <Link href={`/signup?next=${encodeURIComponent(`/nafir/judiyya/join/${token}`)}`} className="font-medium text-primary underline">{t("أنشئ حساباً", "create an account")}</Link>
          {t("، ثمّ افتح الرابط نفسه مرّةً أخرى.", ", then open the same link again.")}
        </p>
      ) : (
        <form action={joinCase} className="mt-5 flex flex-col gap-3 rounded-2xl border border-border bg-card p-5">
          <input type="hidden" name="token" value={token} />
          <label className="flex flex-col gap-1 text-sm">
            {t("اسمك كما يراه الطرف الآخر والأجاويد", "Your name as the other party and the mediators will see it")}
            <input name="display_name" required minLength={2} maxLength={60} defaultValue={name} className={field} />
          </label>
          <button className={`${button} self-start`}>{t("أدخل الطلب", "Join the case")}</button>
        </form>
      )}
    </NafirShell>
  );
}
