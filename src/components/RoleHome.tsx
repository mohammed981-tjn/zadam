import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { tr, type Locale } from "@/lib/i18n";
import { loadRoleHome } from "@/lib/roleHomeLoad";
import type { HomeItem, HomeSection, HomeView } from "@/lib/roleHome";
import SideSwitch from "@/components/SideSwitch";
import RoleHomeOffline from "@/components/RoleHomeOffline";

/**
 * الرئيسيّة لمن دخل (البند ٢٠٦؛ المالك، 6 نوفمبر 2026: «الرئيسيّة بحسب الدور»).
 *
 * Where a visitor meets the hero, a signed-in person first sees what concerns them and what waits for them: their
 * side of the account in full (the farmer's seasons, lands and requests, or the investor's opportunities, requests,
 * agreements and statement), any shop, carrier or agent company they hold, the administrators' list for an
 * administrator, and what waits on their other side in one line each. What is shown, and in what order, is decided
 * in src/lib/roleHome.ts — the app's home reads the same through GET /api/app/home — and every card links to the
 * page that has the whole of it.
 *
 * It is read as the person, in two parallel rounds of small reads (src/lib/roleHomeLoad.ts), inside a Suspense
 * boundary on `/`, so the rest of the page does not wait for it.
 */
export default async function RoleHome({ userId, locale }: { userId: string; locale: Locale }) {
  const supabase = await createClient();
  const view = await loadRoleHome(supabase, userId);
  return <RoleHomeView view={view} locale={locale} />;
}

/** What is drawn, from what src/lib/roleHome.ts decided. */
export function RoleHomeView({ view, locale }: { view: HomeView; locale: Locale }) {
  const t = (ar: string, en: string) => tr(locale, ar, en);
  const n = (v: number) => v.toLocaleString(locale === "en" ? "en-US" : "ar-EG");
  const first = view.name.trim().split(/\s+/)[0];

  return (
    <section aria-labelledby="role-home" className="mx-auto max-w-6xl px-4 pt-8 xl:max-w-7xl">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-bold text-leaf">{first ? t(`أهلاً ${first}`, `Welcome, ${first}`) : t("أهلاً بك", "Welcome")}</p>
          <h1 id="role-home" className="mt-1 font-black" style={{ fontSize: "var(--text-title)" }}>
            {view.waiting > 0
              ? t(`ينتظرك ${n(view.waiting)}`, `${n(view.waiting)} waiting for you`)
              : t("لا شيء ينتظرك الآن", "Nothing is waiting for you now")}
          </h1>
          <p className="mt-1 text-sm text-muted">
            {t("ما يخصّك أوّلاً، وكلُّ بطاقةٍ تفتح صفحتها كاملة.", "What concerns you first; each card opens its full page.")}
          </p>
        </div>
        {/* The side of the one account (backlog 151): the home follows it. An administrator stays one. */}
        {view.role !== "admin" && (
          <div className="w-full max-w-xs">
            <SideSwitch role={view.role} locale={locale} />
          </div>
        )}
      </div>

      <div className="mt-5 grid gap-3 empty:hidden sm:grid-cols-2 lg:grid-cols-3">
        <RoleHomeOffline />
      </div>

      {view.full.map((s) => (
        <Group key={s.group} section={s} locale={locale} />
      ))}

      {view.compact.length > 0 && (
        <div className="mt-6 rounded-2xl border border-border bg-card p-4 shadow-card">
          <h2 className="font-bold">{t("وينتظرك في جوانبك الأخرى", "Also waiting on your other sides")}</h2>
          <ul className="mt-2 flex flex-col gap-2 text-sm">
            {view.compact.map((s) => (
              <li key={s.group} className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <span className="font-bold text-leaf">{s.title[locale]}:</span>
                {s.items.map((i) => (
                  <Link key={i.key} href={i.href} className="text-primary underline underline-offset-4">
                    {i.title[locale]}
                    {i.count !== null && ` (${n(i.count)})`}
                  </Link>
                ))}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

function Group({ section, locale }: { section: HomeSection; locale: Locale }) {
  return (
    <div className="mt-7">
      <h2 className="title-bar font-bold" style={{ fontSize: "var(--text-section)" }}>
        {section.title[locale]}
      </h2>
      <ul className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {section.items.map((i) => (
          <li key={i.key} className="flex">
            <Card item={i} locale={locale} />
          </li>
        ))}
      </ul>
    </div>
  );
}

function Card({ item, locale }: { item: HomeItem; locale: Locale }) {
  const waiting = item.kind === "waiting";
  const n = (v: number) => v.toLocaleString(locale === "en" ? "en-US" : "ar-EG");
  return (
    <Link
      href={item.href}
      className={`flex w-full items-start gap-3 rounded-2xl border p-4 shadow-card transition ${
        waiting ? "border-primary/40 bg-primary/5 hover:border-primary" : "border-border bg-card hover:border-leaf"
      }`}
    >
      {item.count !== null && (
        <span
          className={`figure flex size-9 shrink-0 items-center justify-center rounded-full text-sm font-black ${
            waiting ? "bg-primary text-primary-foreground" : "bg-leaf/15 text-leaf"
          }`}
        >
          {n(item.count)}
        </span>
      )}
      <span className="min-w-0">
        <span className="block font-bold leading-snug">{item.title[locale]}</span>
        {item.detail && <span className="mt-1 block text-sm leading-relaxed text-muted">{item.detail[locale]}</span>}
      </span>
    </Link>
  );
}

/** While the reads are on their way: the shape of the cards, so nothing jumps when they arrive. */
export function RoleHomeSkeleton({ locale }: { locale: Locale }) {
  return (
    <section aria-busy className="mx-auto max-w-6xl px-4 pt-8 xl:max-w-7xl">
      <p className="text-sm font-bold text-leaf">{tr(locale, "أهلاً بك", "Welcome")}</p>
      <div className="mt-2 h-8 w-56 animate-pulse rounded-lg bg-border/60" />
      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-24 animate-pulse rounded-2xl border border-border bg-card" />
        ))}
      </div>
    </section>
  );
}
