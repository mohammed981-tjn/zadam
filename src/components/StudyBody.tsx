import type { Block } from "@/lib/studyDoc";

/**
 * نصٌّ مكتوبٌ بتنسيق Markdown البسيط، مرسوماً: العناوين والقوائم والفقرات
 * والمعادلات. تستعمله الدراسات، والأخبار الطويلة التي تُكتب بالتنسيق نفسه.
 */
export default function StudyBody({ blocks }: { blocks: Block[] }) {
  return (
    <>
      {blocks.map((b, k) => (
        <BlockView key={k} b={b} />
      ))}
    </>
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
