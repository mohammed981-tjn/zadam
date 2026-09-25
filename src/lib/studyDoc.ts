/**
 * دراسةٌ مكتوبة بتنسيق Markdown البسيط إلى كتلٍ تُرسم.
 *
 * The studies the owner sends are written in plain Markdown — headings,
 * numbered and bulleted lists, paragraphs, rules, and a few formulas on a line
 * of their own. This reads exactly that much and nothing more, so the text is
 * published as it was written without pulling in a Markdown library for one
 * page.
 *
 * The owner's sections are numbered in words (أولاً، ثانياً … التاسع عشر) and
 * not always at the same heading level, so a heading that starts with such an
 * ordinal is a section wherever it sits; those make the table of contents.
 */

export type Block =
  | { kind: "section"; id: string; text: string }
  | { kind: "h3"; text: string }
  | { kind: "h4"; text: string }
  | { kind: "p"; text: string }
  | { kind: "formula"; text: string }
  | { kind: "ol"; items: string[] }
  | { kind: "ul"; items: string[] }
  | { kind: "hr" };

export interface StudyDoc {
  /** The heading lines before the first section. */
  title: string[];
  blocks: Block[];
  sections: { id: string; text: string }[];
}

const ORDINAL =
  /^(أولاً|ثانياً|ثالثاً|رابعاً|خامساً|سادساً|سابعاً|ثامناً|تاسعاً|عاشراً|الحادي عشر|ال\S+ عشر)\s*[:：]/;

/** A line with an equals sign and no Arabic letter is a formula. */
const isFormula = (line: string) => line.includes("=") && !/[؀-ۿ]/.test(line);

/**
 * `titled`: whether the headings before the first numbered section are the
 * document's title (a study) or part of its text (a news item, which has its
 * own title and is written straight into the body).
 */
export function parseStudy(md: string, { titled = true } = {}): StudyDoc {
  const title: string[] = [];
  const blocks: Block[] = [];
  const sections: { id: string; text: string }[] = [];
  let seenSection = false;

  for (const raw of md.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;

    const h = /^(#{1,4})\s+(.*)$/.exec(line);
    if (h) {
      const text = h[2].trim();
      if (ORDINAL.test(text)) {
        seenSection = true;
        const id = `s${sections.length + 1}`;
        sections.push({ id, text });
        blocks.push({ kind: "section", id, text });
      } else if (!seenSection && titled) {
        title.push(text);
      } else {
        blocks.push({ kind: h[1].length >= 3 ? "h4" : "h3", text });
      }
      continue;
    }
    if (/^-{3,}$/.test(line)) {
      blocks.push({ kind: "hr" });
      continue;
    }
    const ol = /^\d+\.\s+(.*)$/.exec(line);
    const ul = /^[-*]\s+(.*)$/.exec(line);
    if (ol || ul) {
      const kind = ol ? "ol" : "ul";
      const text = (ol ?? ul)![1];
      const last = blocks[blocks.length - 1];
      if (last && last.kind === kind) last.items.push(text);
      else blocks.push({ kind, items: [text] });
      continue;
    }
    blocks.push(isFormula(line) ? { kind: "formula", text: line } : { kind: "p", text: line });
  }
  return { title, blocks, sections };
}

/** The text without its Markdown marks, cut at about `max` characters — for a list of news. */
export function plainExcerpt(md: string, max = 260): string {
  const text = md
    .split(/\r?\n/)
    .map((l) => l.trim().replace(/^#{1,4}\s+/, "").replace(/^[-*]\s+/, "").replace(/^-{3,}$/, ""))
    .filter(Boolean)
    .join(" ");
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  return cut.slice(0, Math.max(cut.lastIndexOf(" "), max - 20)) + "…";
}
