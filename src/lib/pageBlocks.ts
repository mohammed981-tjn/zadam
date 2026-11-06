/**
 * صفحةٌ من الموقع كما رُسمت، كتلاً يقرؤها التطبيق (البند ٢٠٣).
 *
 * WHY THE RENDERED PAGE AND NOT A COPY OF ITS TEXT
 *
 * /guide and /arc-canal are written as JSX, with their numbers read from the platform's own modules (the stage
 * shares, the risk weights, the canal's measured profile) and, for the guide, counts from the database. A copy of
 * that text in a route, or in Dart, starts true and drifts the first time a weight or a sentence changes. So the
 * phone app's route asks the website for the page itself and reads it into blocks here: headings, paragraphs, lists
 * and tables, in order, with the page's own words. Change the page and the app changes with it.
 *
 * What is left out is what a phone cannot read as text: scripts, styles, drawings (svg), video, forms, buttons and
 * menus, and the «share on WhatsApp» links. A page that streams (the root loading.tsx makes every page do so) sends
 * its content after the loading screen, in hidden segments; those are read instead of the loading screen.
 *
 * Pure: no fetching here, so scripts/verify-app-feasibility-library.ts can hold it to sample markup.
 */

export type PageBlock =
  | { kind: "h1" | "section" | "h3" | "h4" | "p"; text: string }
  | { kind: "ol" | "ul"; items: string[] }
  | { kind: "table"; rows: string[][] }
  | { kind: "hr" };

const SKIP = new Set([
  "script",
  "style",
  "svg",
  "noscript",
  "video",
  "audio",
  "canvas",
  "form",
  "button",
  "select",
  "textarea",
  "iframe",
  "template",
  "nav",
  "head",
]);
const VOID = new Set(["br", "img", "hr", "input", "meta", "link", "source", "wbr", "area", "col", "embed", "param", "track"]);
const BLOCK = new Set([
  "p",
  "div",
  "section",
  "article",
  "header",
  "footer",
  "main",
  "aside",
  "figure",
  "figcaption",
  "details",
  "summary",
  "ul",
  "ol",
  "li",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "table",
  "thead",
  "tbody",
  "tfoot",
  "tr",
  "td",
  "th",
  "dl",
  "dt",
  "dd",
  "blockquote",
]);
/** Elements whose whole text is one block, whatever blocks sit inside them. */
const CAPTURE = new Set(["h1", "h2", "h3", "h4", "h5", "h6", "li", "td", "th", "summary", "dt"]);

const SEP = "\u0001";
const TOKEN = /<!--[\s\S]*?-->|<(\/?)([a-zA-Z][\w-]*)((?:"[^"]*"|'[^']*'|[^'">])*)>|[^<]+/g;

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", "#39": "'" };
export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === "#") {
      const code = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : m;
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

const attr = (attrs: string, name: string) =>
  new RegExp(`\\s${name}(?:\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+)))?`, "i").exec(attrs);

function clean(text: string): string {
  return text
    .replace(/[ \t\r\n\f\u00a0]+/g, " ")
    .replace(new RegExp(`\\s*(?:${SEP}\\s*)+`, "g"), SEP)
    .replace(new RegExp(`^${SEP}+|${SEP}+$`, "g"), "")
    .split(SEP)
    .map((s) => s.trim())
    .filter(Boolean)
    .join(" · ")
    .trim();
}

/** The parts of a document a reader sees: the streamed segments when there are any, otherwise <main>. */
export function readableRegions(html: string): string[] {
  const main: string[] = [];
  const hidden: string[] = [];
  let region: { kind: "main" | "hidden"; tag: string; depth: number; start: number } | null = null;
  for (const m of html.matchAll(TOKEN)) {
    const [whole, close, rawTag, attrs = ""] = m;
    if (!rawTag) continue;
    const tag = rawTag.toLowerCase();
    const at = m.index!;
    const selfClosing = /\/\s*$/.test(attrs) || VOID.has(tag);
    if (!region) {
      if (close || selfClosing) continue;
      if (tag === "main") region = { kind: "main", tag, depth: 1, start: at + whole.length };
      else if (tag === "div" && attr(attrs, "hidden") && /^S:\d+$/.test(attr(attrs, "id")?.slice(1).find(Boolean) ?? "")) {
        region = { kind: "hidden", tag, depth: 1, start: at + whole.length };
      }
      continue;
    }
    if (tag !== region.tag || selfClosing) continue;
    region.depth += close ? -1 : 1;
    if (region.depth === 0) {
      (region.kind === "main" ? main : hidden).push(html.slice(region.start, at));
      region = null;
    }
  }
  return hidden.length ? hidden : main;
}

/** One fragment of markup to blocks, in reading order. */
export function blocksFromHtml(fragment: string): PageBlock[] {
  type Raw = PageBlock | { kind: "li"; text: string; ordered: boolean } | { kind: "row"; cells: string[] };
  const raw: Raw[] = [];
  const stack: string[] = [];
  let buffer = "";
  let row: string[] | null = null;
  let skip: { tag: string; depth: number } | null = null;

  const capturing = () => stack.findLast((t) => CAPTURE.has(t));
  const flush = () => {
    const text = clean(buffer);
    buffer = "";
    if (!text) return;
    const ctx = capturing();
    if (ctx === "td" || ctx === "th") {
      (row ??= []).push(text);
    } else if (ctx === "li") {
      const list = stack.findLast((t) => t === "ol" || t === "ul");
      raw.push({ kind: "li", text, ordered: list === "ol" });
    } else if (ctx === "h1") raw.push({ kind: "h1", text });
    else if (ctx === "h2") raw.push({ kind: "section", text });
    else if (ctx === "h3") raw.push({ kind: "h3", text });
    else if (ctx) raw.push({ kind: "h4", text });
    else raw.push({ kind: "p", text });
  };

  for (const m of fragment.matchAll(TOKEN)) {
    const [whole, close, rawTag, attrs = ""] = m;
    if (whole.startsWith("<!--")) continue;
    if (!rawTag) {
      if (!skip) buffer += decodeEntities(whole);
      continue;
    }
    const tag = rawTag.toLowerCase();
    const selfClosing = /\/\s*$/.test(attrs) || VOID.has(tag);

    if (skip) {
      if (tag === skip.tag && !selfClosing) {
        skip.depth += close ? -1 : 1;
        if (skip.depth === 0) skip = null;
      }
      continue;
    }
    if (!close && !selfClosing) {
      const href = attr(attrs, "href")?.slice(1).find(Boolean) ?? "";
      const hiddenFromReaders = /\saria-hidden\s*=\s*["']?true/i.test(attrs);
      if (SKIP.has(tag) || hiddenFromReaders || (tag === "a" && /wa\.me|whatsapp/i.test(href))) {
        skip = { tag, depth: 1 };
        continue;
      }
    }
    if (tag === "br") {
      buffer += " ";
      continue;
    }
    if (tag === "hr") {
      if (!capturing()) {
        flush();
        raw.push({ kind: "hr" });
      }
      continue;
    }
    if (!BLOCK.has(tag) || selfClosing) continue;

    if (!close) {
      if (capturing()) buffer += SEP;
      else flush();
      stack.push(tag);
      if (tag === "tr") row = [];
      continue;
    }

    // A closing block tag.
    const i = stack.lastIndexOf(tag);
    if (i === -1) continue;
    if (capturing() && !CAPTURE.has(tag)) {
      buffer += SEP;
    } else {
      flush();
    }
    stack.length = i;
    if (tag === "tr") {
      if (row && row.length) raw.push({ kind: "row", cells: row });
      row = null;
    }
  }
  flush();

  // Group list items into lists and rows into tables.
  const out: PageBlock[] = [];
  for (const b of raw) {
    const last = out[out.length - 1];
    if (b.kind === "li") {
      const kind = b.ordered ? "ol" : "ul";
      if (last && last.kind === kind) last.items.push(b.text);
      else out.push({ kind, items: [b.text] });
    } else if (b.kind === "row") {
      if (last && last.kind === "table") last.rows.push(b.cells);
      else out.push({ kind: "table", rows: [b.cells] });
    } else {
      out.push(b);
    }
  }
  return out;
}

/** A whole rendered page to its readable blocks. */
export function pageBlocks(html: string): PageBlock[] {
  return readableRegions(html).flatMap(blocksFromHtml);
}
