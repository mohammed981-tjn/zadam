import Link from "next/link";
import { requireAdmin } from "@/lib/adminGuard";
import ManagedFarmerCard from "@/components/ManagedFarmerCard";
import { AGENT_SCOPE_SHORT, type AgentScope } from "@/lib/agent";
import { card } from "@/lib/ui";

export const metadata = { title: "مزارعون بلا جوّال | سوداقري" };

type Row = {
  user_id: string;
  company_name: string;
  full_name: string;
  state: string;
  locality: string | null;
  village: string;
  national_id: string | null;
  contact_phone: string | null;
  consent_path: string;
  photo_path: string;
  scopes: AgentScope[] | null;
  note: string | null;
  status: "pending" | "approved";
  created_at: string;
};

/**
 * مزارعون بلا جوّال سجّلتهم جمعيّاتهم (البند ١٦٩). صفحةٌ للإدارة وحدها، بالعربيّة كبقيّة صفحاتها. لا تعمل الجمعيّة عن
 * أحدٍ منهم قبل أن تُفتح ورقة موافقته وصورته هنا ويُعتمد؛ وحين يصير لأحدهم جوّال يُربط بحسابه من هنا.
 */
export default async function AdminManagedPage() {
  const { supabase } = await requireAdmin();
  const { data, error } = await supabase.rpc("managed_farmers_pending");
  if (error) console.error("admin/managed: pending failed", error.message);
  const rows = (data ?? []) as Row[];

  // Ten-minute links to the private evidence bucket — the storage policy lets an admin read it.
  const paths = rows.flatMap((r) => [r.consent_path, r.photo_path]);
  const signed = new Map<string, string>();
  if (paths.length > 0) {
    const { data: urls } = await supabase.storage.from("evidence").createSignedUrls(paths, 600);
    for (const u of urls ?? []) if (u.path && u.signedUrl) signed.set(u.path, u.signedUrl);
  }
  const pending = rows.filter((r) => r.status === "pending");
  const approved = rows.filter((r) => r.status === "approved");

  const item = (r: Row) => (
    <li key={r.user_id} className={card}>
      <p className="text-xs text-muted">
        {new Date(r.created_at).toLocaleString("ar-EG")} · سجّلته «{r.company_name}»
      </p>
      <p className="mt-1 text-lg font-black">{r.full_name}</p>
      <p className="text-sm text-muted">
        {[r.village, r.locality, r.state].filter(Boolean).join("، ")}
        {r.national_id && (
          <>
            {" "}
            · الرقم الوطنيّ <span dir="ltr">{r.national_id}</span>
          </>
        )}
        {r.contact_phone && (
          <>
            {" "}
            · جوّال للتواصل <span dir="ltr">{r.contact_phone}</span>
          </>
        )}
      </p>
      {r.scopes && <p className="text-sm">الإذن: {r.scopes.map((s) => AGENT_SCOPE_SHORT[s][0]).join(" و")}</p>}
      {r.note && <p className="text-sm text-muted">«{r.note}»</p>}
      <div className="mt-3 grid grid-cols-2 gap-3">
        {[
          [r.consent_path, "ورقة الموافقة"],
          [r.photo_path, "صورة المزارع"],
        ].map(([p, name]) =>
          signed.get(p) ? (
            <a key={p} href={signed.get(p)} target="_blank" rel="noreferrer" className="block">
              {/* eslint-disable-next-line @next/next/no-img-element -- a ten-minute signed link, not an optimisable asset */}
              <img src={signed.get(p)} alt={name} className="h-40 w-full rounded-xl border border-border object-cover" />
              <span className="text-xs text-primary underline">{name} ↗</span>
            </a>
          ) : (
            <p key={p} className="text-xs text-danger">
              تعذّر فتح {name}
            </p>
          ),
        )}
      </div>
      <ManagedFarmerCard user={r.user_id} status={r.status} />
    </li>
  );

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <Link href="/admin" className="text-sm text-primary underline">
        → لوحة الإدارة
      </Link>
      <h1 className="mt-4 font-black" style={{ fontSize: "var(--text-title)" }}>
        مزارعون بلا جوّال
      </h1>
      <ol className="mt-3 list-decimal space-y-1 ps-5 text-sm leading-7 text-muted">
        <li>افتح ورقة الموافقة: فيها اسم الجمعيّة واسم المزارع، وموقَّعة أو مبصومة.</li>
        <li>قارن صورة المزارع والاسم والقرية؛ وإن كان له جوّال للتواصل فاتّصل به.</li>
        <li>اعتمد، أو ردّ بسببٍ تقرؤه الجمعيّة. لا تعمل الجمعيّة عنه قبل الاعتماد.</li>
        <li>حين يصير للمزارع جوّال: اتّصل به وتأكّد، ثمّ اربط رقمه واقرأ له الكلمة المؤقّتة.</li>
      </ol>

      <h2 className="mt-8 font-bold">ينتظر الاعتماد</h2>
      {pending.length === 0 ? <p className="mt-2 text-muted">لا أحد ينتظر.</p> : <ul className="mt-3 grid gap-4">{pending.map(item)}</ul>}

      <h2 className="mt-10 font-bold">معتمَدون لم يُربطوا بجوّال بعد</h2>
      {approved.length === 0 ? <p className="mt-2 text-muted">لا أحد.</p> : <ul className="mt-3 grid gap-4">{approved.map(item)}</ul>}
    </div>
  );
}
