import { readFileSync } from "node:fs";
import { join } from "node:path";
import Link from "next/link";
import ShareWhatsApp from "@/components/ShareWhatsApp";
import StudyBody from "@/components/StudyBody";
import { parseStudy } from "@/lib/studyDoc";

export const metadata = {
  title: "أزمة سعر الصرف والتضخم — دراسة وبرنامج عمل | سوداقري",
  description:
    "دراسة معمّقة وبرنامج عمل قابل للتنفيذ لمعالجة أزمة سعر الصرف والتضخم في السودان وإعادة بناء الاقتصاد الوطني: التشخيص، والنموذج الكمّي، والسياسة النقدية والمالية، والذهب والصادرات، والحماية الاجتماعية، وخارطة الطريق.",
};

// Read once at build: the text changes only when the study is revised.
export const dynamic = "force-static";

/**
 * دراسة أزمة سعر الصرف والتضخم — كما أرسلها المالك (25 سبتمبر 2026).
 *
 * Published as written, from content/studies/exchange-rate-ar.md, with no
 * word of it changed: the page adds a table of contents, sets the formulas
 * apart, and says at the top what the numbers in it are and are not — which
 * is the study's own rule («التمييز بين أنواع المعلومات»), repeated where a
 * reader who skims will see it.
 */
export default function ExchangeRateStudy() {
  const md = readFileSync(join(process.cwd(), "content/studies/exchange-rate-ar.md"), "utf8");
  const doc = parseStudy(md);

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <nav className="mb-4 text-sm text-muted">
        <Link href="/studies" className="hover:text-primary">
          الدراسات
        </Link>{" "}
        ← أزمة سعر الصرف والتضخم
      </nav>

      <header className="rounded-3xl border border-border bg-card p-6 shadow-card sm:p-8">
        <p className="text-sm font-medium text-primary">{doc.title[0]}</p>
        <h1 className="mt-2 font-black leading-snug" style={{ fontSize: "var(--text-title)" }}>
          {doc.title[1]}
        </h1>
        {doc.title[2] && <p className="mt-2 text-lg font-bold text-muted">{doc.title[2]}</p>}
        <p className="mt-4 text-xs text-muted">
          دراسةٌ أرسلها مالكُ المنصّة، ونُشرت كما كُتبت — ٢٥ سبتمبر ٢٠٢٦
        </p>
        <ShareWhatsApp
          path="/studies/exchange-rate"
          text="دراسة وبرنامج عمل لمعالجة أزمة سعر الصرف والتضخم في السودان:"
          className="mt-4"
        />
      </header>

      <aside className="mt-5 rounded-2xl border border-accent/40 bg-accent/10 p-4 text-sm leading-7">
        <strong>عن الأرقام في الدراسة:</strong> كلُّ رقمٍ فيها منسوبٌ إلى مصدره
        وتاريخه كما ورد (رويترز، والجهاز المركزي للإحصاء، وغيرهما)، ويعكس سوقاً
        أو قناةً بعينها لا سعراً موحّداً لكلّ السودان — والدراسةُ نفسها تشترط
        تحديثه قبل أيّ قرار. ولم تُراجعه المنصّةُ مقابل مصادره.
      </aside>

      <details className="mt-5 rounded-2xl border border-border bg-card p-4 shadow-card" open>
        <summary className="cursor-pointer font-bold">فهرس الدراسة ({doc.sections.length.toLocaleString("ar-SA")} قسماً)</summary>
        <ol className="mt-3 grid gap-1.5 text-sm sm:grid-cols-2">
          {doc.sections.map((s) => (
            <li key={s.id}>
              <a href={`#${s.id}`} className="text-primary hover:underline">
                {s.text}
              </a>
            </li>
          ))}
        </ol>
      </details>

      <article className="mt-8">
        <StudyBody blocks={doc.blocks} />
      </article>

      <p className="mt-10 text-sm">
        <Link href="/studies" className="font-medium text-primary underline">
          ← كلّ الدراسات
        </Link>
      </p>
    </div>
  );
}
