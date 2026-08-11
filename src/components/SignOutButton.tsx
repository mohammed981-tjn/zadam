import { logout } from "@/app/login/actions";

export default function SignOutButton() {
  return (
    <form action={logout}>
      <button
        type="submit"
        className="rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-card"
      >
        تسجيل الخروج
      </button>
    </form>
  );
}
