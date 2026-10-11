import { logout } from "@/app/login/actions";
import { getLocale } from "@/lib/locale";
import { tr } from "@/lib/i18n";

export default async function SignOutButton() {
  const locale = await getLocale();
  return (
    <form action={logout}>
      <button
        type="submit"
        className="rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-card"
      >
        {tr(locale, "تسجيل الخروج", "Sign out")}
      </button>
    </form>
  );
}
