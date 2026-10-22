import Link from "next/link";
import { currentFx } from "@/lib/livePrices";
import { createClient } from "@/lib/supabase/server";
import { getLocale } from "@/lib/locale";
import { tr } from "@/lib/i18n";
import { stateName } from "@/lib/nafir";
import {
  CATEGORY_LABEL,
  CATEGORIES,
  dateLabel,
  isNotDeployed,
  lbl,
  type Supplier,
  type SupplierProduct,
} from "@/lib/supplyChain";
import SupplyShell, { ComingSoon, card } from "@/components/supply/SupplyShell";
import ProductRow from "@/components/supply/ProductRow";
import { ContactButtons, CouncilWarning, OffersNotReference, StatesList, VerifiedBadge } from "@/components/supply/Explainers";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function generateMetadata() {
  const locale = await getLocale();
  return { title: tr(locale, "مورد | سوداقري", "Supplier | Sudagri") };
}

export default async function SupplierPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const locale = await getLocale();
  const t = (ar: string, en: string) => tr(locale, ar, en);
  const fx = (await currentFx());
  const rate = fx?.bank.sell ?? null;
  const typed = locale === "en" ? ({ lang: "ar", dir: "auto" } as const) : {};

  const supabase = await createClient();
  const { data, error } = UUID.test(id)
    ? await supabase.from("suppliers").select("*").eq("id", id).maybeSingle()
    : { data: null, error: null };
  const notDeployed = isNotDeployed(error);
  const s = data as Supplier | null;

  if (!s) {
    return (
      <SupplyShell active="/suppliers" ok={sp.ok} error={sp.error}>
        {notDeployed ? (
          <ComingSoon />
        ) : (
          <div className="rounded-2xl border border-dashed border-border bg-card px-5 py-8 text-center">
            <p className="font-bold">{t("لا مورد بهذا الرابط، أو لم يُوثَّق بعد.", "No supplier at this link, or not verified yet.")}</p>
            <Link href="/suppliers" className="mt-3 inline-block text-primary underline">
              {t("دليل الموردين ←", "Supplier directory →")}
            </Link>
          </div>
        )}
      </SupplyShell>
    );
  }

  const { data: pRows } = await supabase
    .from("supplier_products")
    .select("*")
    .eq("supplier_id", s.id)
    .eq("active", true)
    .order("category")
    .order("name");
  const products = (pRows ?? []) as SupplierProduct[];

  return (
    <SupplyShell active="/suppliers" ok={sp.ok} error={sp.error}>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-black" {...typed}>
          {s.name}
        </h1>
        {s.verified_at ? (
          <VerifiedBadge locale={locale} />
        ) : (
          <span className="rounded-full border border-accent px-2.5 py-0.5 text-xs text-accent">{t("بانتظار التوثيق", "Awaiting verification")}</span>
        )}
      </div>
      <p className="mt-2 text-sm text-muted">
        {stateName(s.state, locale)} — <bdi>{s.locality}</bdi>
        {s.verified_at && <> · {t(`وُثّق في ${dateLabel(s.verified_at, locale)}`, `Verified on ${dateLabel(s.verified_at, locale)}`)}</>}
      </p>
      {s.bio && (
        <p className="mt-3 max-w-2xl leading-8" {...typed}>
          {s.bio}
        </p>
      )}

      <div className="mt-4">
        <ContactButtons supplier={s} locale={locale} />
      </div>

      <dl className={`${card} mt-6 grid gap-3 text-sm sm:grid-cols-2`}>
        <div>
          <dt className="text-xs text-muted">{t("يوصل إلى", "Delivers to")}</dt>
          <dd>{s.delivery_states.length ? <StatesList states={s.delivery_states} locale={locale} /> : t("لا توصيل — الاستلام من المحلّ", "No delivery — collect from the shop")}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted">{t("يبيع", "Sells")}</dt>
          <dd>{s.categories.map((c) => lbl(CATEGORY_LABEL[c], locale)).join(locale === "en" ? ", " : "، ")}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted">{t("رخصة المجلس القومي للمبيدات", "National Pesticides Council licence")}</dt>
          <dd className="figure">{s.pesticide_licence_no ?? "—"}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted">{t("التسجيل لدى الإدارة القومية للتقاوي", "National Seed Administration registration")}</dt>
          <dd className="figure">{s.seed_registration_no ?? "—"}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted">{t("السجلّ التجاري", "Commercial registration")}</dt>
          <dd className="figure">{s.commercial_registration_no ?? "—"}</dd>
        </div>
      </dl>

      <h2 className="mt-8 text-lg font-bold">{t("المنتجات والعروض", "Products and offers")}</h2>
      {products.length === 0 ? (
        <p className="mt-2 text-sm text-muted">{t("لم يُدرج منتجاتٍ بعد. اتّصل به وسَله.", "No products listed yet. Call and ask.")}</p>
      ) : (
        CATEGORIES.filter((c) => products.some((p) => p.category === c)).map((c) => (
          <section key={c} className={`${card} mt-3`}>
            <h3 className="text-sm font-bold">{lbl(CATEGORY_LABEL[c], locale)}</h3>
            <ul className="mt-1">
              {products
                .filter((p) => p.category === c)
                .map((p) => (
                  <ProductRow key={p.id} p={p} locale={locale} rate={rate} />
                ))}
            </ul>
          </section>
        ))
      )}

      <div className="mt-6 flex flex-col gap-3">
        <OffersNotReference locale={locale} />
        <CouncilWarning locale={locale} />
      </div>

      <p className="mt-6 text-sm">
        <Link href={`/suppliers/orders?supplier=${s.id}`} className="text-primary underline">
          {t("اجمع جيرانك في طلبٍ جماعيٍّ من هذا المورد ←", "Gather your neighbours into a group order from this supplier →")}
        </Link>
      </p>
    </SupplyShell>
  );
}
