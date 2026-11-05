import Link from "next/link";
import { requireAdmin } from "@/lib/adminGuard";
import ManagedFarmerCard from "@/components/ManagedFarmerCard";
import { AGENT_SCOPE_SHORT, type AgentScope } from "@/lib/agent";
import { card } from "@/lib/ui";
import { getLocale } from "@/lib/locale";
import { tr } from "@/lib/i18n";

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
  const locale = await getLocale();
  const t = (ar: string, en: string) => tr(locale, ar, en);
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
        {new Date(r.created_at).toLocaleString(locale === "en" ? "en-GB" : "ar-EG")} ·{" "}
        {locale === "en" ? `Registered by “${r.company_name}”` : `سجّلته «${r.company_name}»`}
      </p>
      <p className="mt-1 text-lg font-black">{r.full_name}</p>
      <p className="text-sm text-muted">
        {[r.village, r.locality, r.state].filter(Boolean).join(locale === "en" ? ", " : "، ")}
        {r.national_id && (
          <>
            {" "}
            · {t("الرقم الوطنيّ", "National ID")} <span dir="ltr">{r.national_id}</span>
          </>
        )}
        {r.contact_phone && (
          <>
            {" "}
            · {t("جوّال للتواصل", "Contact phone")} <span dir="ltr">{r.contact_phone}</span>
          </>
        )}
      </p>
      {r.scopes && (
        <p className="text-sm">
          {t("الإذن:", "Permission:")}{" "}
          {locale === "en"
            ? r.scopes.map((s) => AGENT_SCOPE_SHORT[s][1]).join(" and ")
            : r.scopes.map((s) => AGENT_SCOPE_SHORT[s][0]).join(" و")}
        </p>
      )}
      {r.note && <p className="text-sm text-muted">«{r.note}»</p>}
      <div className="mt-3 grid grid-cols-2 gap-3">
        {[
          [r.consent_path, t("ورقة الموافقة", "Consent form")],
          [r.photo_path, t("صورة المزارع", "Farmer's photo")],
        ].map(([p, name]) =>
          signed.get(p) ? (
            <a key={p} href={signed.get(p)} target="_blank" rel="noreferrer" className="block">
              {/* eslint-disable-next-line @next/next/no-img-element -- a ten-minute signed link, not an optimisable asset */}
              <img src={signed.get(p)} alt={name} className="h-40 w-full rounded-xl border border-border object-cover" />
              <span className="text-xs text-primary underline">{name} ↗</span>
            </a>
          ) : (
            <p key={p} className="text-xs text-danger">
              {t("تعذّر فتح", "Could not open:")} {name}
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
        {t("→ لوحة الإدارة", "← Admin panel")}
      </Link>
      <h1 className="mt-4 font-black" style={{ fontSize: "var(--text-title)" }}>
        {t("مزارعون بلا جوّال", "Farmers without a phone")}
      </h1>
      <ol className="mt-3 list-decimal space-y-1 ps-5 text-sm leading-7 text-muted">
        <li>
          {t(
            "افتح ورقة الموافقة: فيها اسم الجمعيّة واسم المزارع، وموقَّعة أو مبصومة.",
            "Open the consent form: it carries the association's name and the farmer's, signed or thumbprinted.",
          )}
        </li>
        <li>
          {t(
            "قارن صورة المزارع والاسم والقرية؛ وإن كان له جوّال للتواصل فاتّصل به.",
            "Compare the farmer's photo, name and village; if there is a contact phone, call it.",
          )}
        </li>
        <li>
          {t(
            "اعتمد، أو ردّ بسببٍ تقرؤه الجمعيّة. لا تعمل الجمعيّة عنه قبل الاعتماد.",
            "Approve, or return it with a reason the association will read. The association cannot act for the farmer before approval.",
          )}
        </li>
        <li>
          {t(
            "حين يصير للمزارع جوّال: اتّصل به وتأكّد، ثمّ اربط رقمه واقرأ له الكلمة المؤقّتة.",
            "When the farmer gets a phone: call and confirm, then link the number and read them the temporary password.",
          )}
        </li>
      </ol>

      <h2 className="mt-8 font-bold">{t("ينتظر الاعتماد", "Awaiting approval")}</h2>
      {pending.length === 0 ? <p className="mt-2 text-muted">{t("لا أحد ينتظر.", "No one is waiting.")}</p> : <ul className="mt-3 grid gap-4">{pending.map(item)}</ul>}

      <h2 className="mt-10 font-bold">{t("معتمَدون لم يُربطوا بجوّال بعد", "Approved, not yet linked to a phone")}</h2>
      {approved.length === 0 ? <p className="mt-2 text-muted">{t("لا أحد.", "No one.")}</p> : <ul className="mt-3 grid gap-4">{approved.map(item)}</ul>}
    </div>
  );
}
