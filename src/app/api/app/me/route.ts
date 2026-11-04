import { NextResponse } from "next/server";
import { loadAdminQueue } from "@/lib/adminQueue";
import { clientFromBearer } from "@/lib/supabase/bearer";

/**
 * «حسابي» في التطبيق (البند ١٣٨): من أنت، وإشعاراتك، وأراضيك، وقائمة المراجعة للمدير.
 *
 * Everything is read as the signed-in person, through row-level security, as
 * the website's own pages read it:
 *
 * - The notifications are /notifications' rows: the policy keeps each inbox
 *   its owner's.
 * - The lands are filtered to the caller's own on purpose. An administrator
 *   can read every land, and «أراضيّ» must still mean his.
 * - The review list is the one /admin/inbox shows (lib/adminQueue), with the
 *   same «waiting» conditions, so the number in the app and on the site agree.
 *   It is only asked for when the profile says admin; the tables' own
 *   `or is_admin()` policies are what would refuse anyone else anyway.
 */
export async function GET(req: Request) {
  const auth = await clientFromBearer(req);
  if (!auth) return NextResponse.json({ error: "انتهت جلستك. ادخل من جديد." }, { status: 401 });
  const { supabase, user } = auth;

  const [{ data: profile }, notes, unread, lands] = await Promise.all([
    supabase.from("profiles").select("full_name, role").eq("id", user.id).single(),
    supabase
      .from("notifications")
      .select("id, title, body, link, read_at, created_at")
      .order("created_at", { ascending: false })
      .limit(30),
    supabase.from("notifications").select("id", { count: "exact", head: true }).is("read_at", null),
    supabase
      .from("lands")
      .select("id, name, state, locality, feddans, verification, verification_note, listed, open_to_investors, open_to_partners, created_at")
      .eq("owner_id", user.id)
      .order("created_at", { ascending: false }),
  ]);

  const role = (profile as { role?: string } | null)?.role ?? null;
  let review = null;
  // With the administrators' second factor applied (20261026040000), the database counts an administrator as one only
  // in a session that passed it, and the app's sessions do not: the review list would read back empty and say
  // «لا شيء ينتظرك». It says where to look instead (mobile-vs-platform-7). Before that migration, is_admin() follows
  // the role, as here.
  const { data: adminNow, error: adminError } = role === "admin" ? await supabase.rpc("is_admin") : { data: false, error: null };
  if (role === "admin" && !adminError && adminNow === false) {
    review = {
      total: null,
      sections: [],
      second_factor: true,
      message: "قائمة المراجعة تحتاج الرمز الثاني: افتح الإدارة في الموقع وادخل بالرمز من تطبيق المصادقة.",
    };
  } else if (role === "admin") {
    const sections = await loadAdminQueue(supabase, 5);
    review = {
      total: sections.filter((s) => !s.info).reduce((a, s) => a + (s.count ?? 0), 0),
      sections: sections
        .filter((s) => (s.count ?? 0) > 0)
        .map((s) => ({
          key: s.key,
          title: s.title.ar,
          what: s.what.ar,
          href: s.href,
          info: Boolean(s.info),
          count: s.count,
          items: s.items.map((i) => ({ title: i.title, meta: i.meta, at: i.at })),
        })),
    };
  }

  return NextResponse.json(
    {
      name: (profile as { full_name?: string } | null)?.full_name ?? "",
      role,
      unread: unread.count ?? 0,
      notifications: (notes.data ?? []).map((n) => ({
        id: n.id,
        title: n.title,
        body: n.body,
        link: n.link,
        read: n.read_at !== null,
        at: n.created_at,
      })),
      lands: lands.data ?? [],
      review,
    },
    { headers: { "cache-control": "no-store" } },
  );
}
