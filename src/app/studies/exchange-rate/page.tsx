import { readFileSync } from "node:fs";
import { join } from "node:path";
import Link from "next/link";
import ShareWhatsApp from "@/components/ShareWhatsApp";
import StudyBody from "@/components/StudyBody";
import { parseStudy } from "@/lib/studyDoc";
import { tr } from "@/lib/i18n";
import { getLocale } from "@/lib/locale";

export async function generateMetadata() {
  const locale = await getLocale();
  return {
    title: tr(
      locale,
      "أزمة سعر الصرف والتضخم — دراسة وبرنامج عمل | سوداقري",
      "The exchange-rate and inflation crisis — a study and a programme of action | Sudagri",
    ),
    description: tr(
      locale,
      "دراسة معمّقة وبرنامج عمل قابل للتنفيذ لمعالجة أزمة سعر الصرف والتضخم في السودان وإعادة بناء الاقتصاد الوطني: التشخيص، والنموذج الكمّي، والسياسة النقدية والمالية، والذهب والصادرات، والحماية الاجتماعية، وخارطة الطريق.",
      "An in-depth study and a workable programme of action to address Sudan's exchange-rate and inflation crisis and rebuild the national economy: the diagnosis, the quantitative model, monetary and fiscal policy, gold and exports, social protection, and the roadmap. The study is in Arabic.",
    ),
  };
}

/**
 * دراسة أزمة سعر الصرف والتضخم — كما أرسلها المالك (25 سبتمبر 2026).
 *
 * Published as written, from content/studies/exchange-rate-ar.md, with no
 * word of it changed: the page adds a table of contents, sets the formulas
 * apart, and says at the top what the numbers in it are and are not — which
 * is the study's own rule («التمييز بين أنواع المعلومات»), repeated where a
 * reader who skims will see it.
 */
export default async function ExchangeRateStudy() {
  const locale = await getLocale();
  const t = (ar: string, en: string) => tr(locale, ar, en);
  const en = locale === "en";
  // The study itself is Arabic as written; on the English page it keeps its own direction.
  const arabic = en ? ({ lang: "ar", dir: "rtl" } as const) : {};
  const md = readFileSync(join(process.cwd(), "content/studies/exchange-rate-ar.md"), "utf8");
  const doc = parseStudy(md);

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <nav className="mb-4 text-sm text-muted">
        <Link href="/studies" className="hover:text-primary">
          {t("الدراسات", "Studies")}
        </Link>{" "}
        {t("← أزمة سعر الصرف والتضخم", "→ The exchange-rate and inflation crisis")}
      </nav>

      <header className="rounded-3xl border border-border bg-card p-6 shadow-card sm:p-8">
        {en && (
          <h1 className="mb-4 font-black leading-snug" style={{ fontSize: "var(--text-title)" }}>
            The exchange-rate and inflation crisis: a study and a programme of action
          </h1>
        )}
        <div {...arabic}>
          <p className="text-sm font-medium text-primary">{doc.title[0]}</p>
          {en ? (
            <p className="mt-2 text-xl font-black leading-snug">{doc.title[1]}</p>
          ) : (
            <h1 className="mt-2 font-black leading-snug" style={{ fontSize: "var(--text-title)" }}>
              {doc.title[1]}
            </h1>
          )}
          {doc.title[2] && <p className="mt-2 text-lg font-bold text-muted">{doc.title[2]}</p>}
        </div>
        <p className="mt-4 text-xs text-muted">
          {t(
            "دراسةٌ أرسلها مالكُ المنصّة، ونُشرت كما كُتبت — ٢٥ سبتمبر ٢٠٢٦",
            "A study sent by the platform's owner and published as written, in Arabic — 25 September 2026",
          )}
        </p>
        <ShareWhatsApp
          path="/studies/exchange-rate"
          text={t(
            "دراسة وبرنامج عمل لمعالجة أزمة سعر الصرف والتضخم في السودان:",
            "A study and programme of action to address Sudan's exchange-rate and inflation crisis:",
          )}
          locale={locale}
          className="mt-4"
        />
      </header>

      <aside className="mt-5 rounded-2xl border border-accent/40 bg-accent/10 p-4 text-sm leading-7">
        {en ? (
          <>
            <strong>About the numbers in the study:</strong> each one is attributed to its source and date as given
            (Reuters, the Central Bureau of Statistics and others), and reflects a particular market or channel, not a
            single rate for all of Sudan — the study itself requires it to be updated before any decision. The
            platform has not checked it against its sources.
          </>
        ) : (
          <>
            <strong>عن الأرقام في الدراسة:</strong> كلُّ رقمٍ فيها منسوبٌ إلى مصدره
            وتاريخه كما ورد (رويترز، والجهاز المركزي للإحصاء، وغيرهما)، ويعكس سوقاً
            أو قناةً بعينها لا سعراً موحّداً لكلّ السودان — والدراسةُ نفسها تشترط
            تحديثه قبل أيّ قرار. ولم تُراجعه المنصّةُ مقابل مصادره.
          </>
        )}
      </aside>

      <details className="mt-5 rounded-2xl border border-border bg-card p-4 shadow-card" open>
        <summary className="cursor-pointer font-bold">
          {en
            ? `Contents (${doc.sections.length} sections)`
            : `فهرس الدراسة (${doc.sections.length.toLocaleString("ar-SA")} قسماً)`}
        </summary>
        <ol className="mt-3 grid gap-1.5 text-sm sm:grid-cols-2" {...arabic}>
          {doc.sections.map((s) => (
            <li key={s.id}>
              <a href={`#${s.id}`} className="text-primary hover:underline">
                {s.text}
              </a>
            </li>
          ))}
        </ol>
      </details>

      <article className="mt-8" {...arabic}>
        <StudyBody blocks={doc.blocks} />
      </article>

      <p className="mt-10 text-sm">
        <Link href="/studies" className="font-medium text-primary underline">
          {t("← كلّ الدراسات", "← All studies")}
        </Link>
      </p>
    </div>
  );
}
