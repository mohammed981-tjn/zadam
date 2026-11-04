import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { loginHrefHere } from "@/lib/loginHere";

/**
 * «المسجَّلون» (البند ١٥٤): من سجّل في سوداقري ومتى وبأيّ طريقة، للمدير وحده.
 *
 * The owner, 24 October, from the Supabase user list: «لماذا لا تبني مراقبةً للمسجَّلين». The
 * database does the translating (admin_users_list): a phone account is shown by its phone, not
 * by the invented email it is stored with, and an account with two ways in is one row with both.
 * Read only: nothing here changes an account.
 */

type Row = {
  id: string;
  full_name: string;
  role: string | null;
  phone: string | null;
  email: string | null;
  ways: string[] | null;
  created_at: string;
  last_sign_in_at: string | null;
  confirmed: boolean;
  lands: number;
  projects: number;
  seasons: number;
};

type Summary = Record<
  "total" | "today" | "week" | "month" | "phone" | "email" | "google" | "facebook" | "farmers" | "investors" | "admins" | "unconfirmed",
  number
>;

const PAGE = 50;

const WAY: Record<string, string> = { phone: "جوّال", email: "بريد", google: "Google", facebook: "Facebook" };
const SIDE: Record<string, string> = { farmer: "🌾 أرضي", investor: "📈 استثماري", admin: "مدير", field_agent: "مندوب" };

const when = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleString("ar-EG", { timeZone: "Africa/Khartoum", dateStyle: "medium", timeStyle: "short" })
    : "—";

export default async function UsersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  const { q: rawQ, page: rawPage } = await searchParams;
  const q = (rawQ ?? "").trim().slice(0, 60);
  const page = Math.max(1, Math.min(200, Number.parseInt(rawPage ?? "1", 10) || 1));

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(await loginHrefHere());

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (profile?.role !== "admin") redirect("/dashboard");

  const [{ data: summary }, { data: rows, error }] = await Promise.all([
    supabase.rpc("admin_users_summary"),
    supabase.rpc("admin_users_list", { p_limit: PAGE, p_offset: (page - 1) * PAGE, p_q: q || null }),
  ]);
  const s = (summary ?? null) as Summary | null;
  const list = (rows ?? []) as Row[];
  const link = (p: number) => `/admin/users?${new URLSearchParams({ ...(q ? { q } : {}), page: String(p) })}`;

  const counters: [string, number | undefined][] = [
    ["كلّ المسجَّلين", s?.total],
    ["اليوم", s?.today],
    ["آخر ٧ أيّام", s?.week],
    ["آخر ٣٠ يوماً", s?.month],
    ["بالجوّال", s?.phone],
    ["ببريد", s?.email],
    ["دخلوا بـGoogle", s?.google],
    ["دخلوا بـFacebook", s?.facebook],
    ["🌾 أرضي", s?.farmers],
    ["📈 استثماري", s?.investors],
    ["بريدٌ لم يُؤكَّد", s?.unconfirmed],
  ];

  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold">المسجَّلون</h1>
        <Link href="/admin" className="text-sm text-primary underline">
          العودة للوحة الإدارة
        </Link>
      </div>

      {error && (
        <p className="mb-4 rounded-lg border border-accent/40 bg-accent/10 p-3 text-sm">
          تعذّر قراءة القائمة. إن كنتَ مديراً فالدالّتان `admin_users_list` و`admin_users_summary` تنتظران التطبيق على القاعدة.
        </p>
      )}

      <ul className="mb-6 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {counters.map(([label, n]) => (
          <li key={label} className="rounded-xl border border-border bg-card p-3 text-center">
            <p className="text-xl font-bold">{n ?? "—"}</p>
            <p className="text-xs text-muted">{label}</p>
          </li>
        ))}
      </ul>

      <form action="/admin/users" className="mb-4 flex gap-2">
        <input
          name="q"
          defaultValue={q}
          placeholder="ابحث بالاسم أو الجوّال أو البريد"
          className="min-w-0 flex-1 rounded-lg border border-border bg-card px-3 py-2 text-sm"
        />
        <button type="submit" className="rounded-lg bg-primary px-4 py-2 text-sm font-bold text-white">
          بحث
        </button>
      </form>

      {list.length === 0 ? (
        <p className="text-sm text-muted">{q ? "لا نتيجة لهذا البحث." : "لا مسجَّلين بعد."}</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {list.map((r) => (
            <li key={r.id} className="rounded-xl border border-border bg-card p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-semibold">{r.full_name}</p>
                  <p className="break-all text-sm text-muted" dir="ltr" style={{ textAlign: "right" }}>
                    {r.phone ?? r.email ?? "—"}
                    {r.phone && r.email ? ` · ${r.email}` : ""}
                  </p>
                </div>
                <span className="shrink-0 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
                  {SIDE[r.role ?? ""] ?? r.role ?? "—"}
                </span>
              </div>
              <p className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                {(r.ways ?? []).map((w) => (
                  <span key={w} className="rounded-full border border-border px-2 py-0.5">
                    {WAY[w] ?? w}
                  </span>
                ))}
                {!r.confirmed && (
                  <span className="rounded-full border border-accent/50 bg-accent/10 px-2 py-0.5">بريدٌ لم يُؤكَّد</span>
                )}
                <span className="text-muted">
                  أراضٍ {r.lands} · فرص {r.projects} · مواسم {r.seasons}
                </span>
              </p>
              <p className="mt-1 text-xs text-muted">
                سجّل: {when(r.created_at)} · آخر دخول: {when(r.last_sign_in_at)}
              </p>
            </li>
          ))}
        </ul>
      )}

      <nav className="mt-6 flex items-center justify-between text-sm">
        {page > 1 ? (
          <Link href={link(page - 1)} className="text-primary underline">
            السابق
          </Link>
        ) : (
          <span />
        )}
        {list.length === PAGE ? (
          <Link href={link(page + 1)} className="text-primary underline">
            التالي
          </Link>
        ) : (
          <span />
        )}
      </nav>
    </div>
  );
}
