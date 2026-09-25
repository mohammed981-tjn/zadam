import { readFileSync } from "node:fs";
import { join } from "node:path";
import Link from "next/link";
import ShareWhatsApp from "@/components/ShareWhatsApp";
import { parseStudy, type Block } from "@/lib/studyDoc";

export const metadata = {
  title: "أزمة سعر الصرف والتضخم — دراسة وبرنامج عمل | سودجري",
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
        {doc.blocks.map((b, k) => (
          <BlockView key={k} b={b} />
        ))}
      </article>

      <p className="mt-10 text-sm">
        <Link href="/studies" className="font-medium text-primary underline">
          ← كلّ الدراسات
        </Link>
      </p>
    </div>
  );
}

function BlockView({ b }: { b: Block }) {
  switch (b.kind) {
    case "section":
      return (
        <h2
          id={b.id}
          className="mt-12 scroll-mt-20 border-b-2 border-primary/30 pb-2 font-black text-primary first:mt-0"
          style={{ fontSize: "var(--text-section)" }}
        >
          {b.text}
        </h2>
      );
    case "h3":
      return <h3 className="mt-8 text-lg font-bold">{b.text}</h3>;
    case "h4":
      return <h4 className="mt-5 font-bold text-foreground/90">{b.text}</h4>;
    case "p":
      return <p className="mt-3 leading-8">{b.text}</p>;
    case "formula":
      return (
        <p
          dir="ltr"
          className="my-4 overflow-x-auto rounded-xl border border-border bg-card px-4 py-3 text-center font-mono text-[15px] shadow-card"
        >
          {b.text}
        </p>
      );
    case "ol":
      return (
        <ol className="mt-3 flex list-decimal flex-col gap-1.5 pr-6 leading-7 marker:font-bold marker:text-primary">
          {b.items.map((t, i) => (
            <li key={i}>{t}</li>
          ))}
        </ol>
      );
    case "ul":
      return (
        <ul className="mt-3 flex list-disc flex-col gap-1.5 pr-6 leading-7 marker:text-primary">
          {b.items.map((t, i) => (
            <li key={i}>{t}</li>
          ))}
        </ul>
      );
    case "hr":
      return <hr className="my-10 border-border" />;
  }
}
