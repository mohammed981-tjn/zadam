/**
 * قراءةُ الأسعار من مصادرها دون تدخّل أحد (البند ١٣١).
 *
 * The owner, 22 October 2026: «أريد آليّةً لتحديث الأسعار — العملات والمحاصيل
 * وكلّ شيء — دون تدخّلك». Until now an assistant read the papers every day and
 * opened a pull request. This module is that reading, written down so the
 * platform can do it on its own.
 *
 * WHERE THE FIGURES ARE
 *
 * Sudanese news sites run WordPress, and WordPress answers
 * `/wp-json/wp/v2/posts?search=…` with each article's date, link, title and
 * HTML. Three shapes cover what the platform shows:
 *
 *   • Bank of Khartoum — iqraa24 publishes the bank's table every day: a row
 *     per currency, «شراء التحويل · شراء النقد · سعر البيع». Read from the
 *     table, by its column headings.
 *   • The parallel market — bajnews writes it as one sentence after a sentence
 *     naming «السوق الموازية». The bank's own figures sit in an earlier
 *     paragraph of the same article and must not be taken for it.
 *   • El Obeid — sudafax's daily list has a section headed «مؤشر أسعار
 *     المحاصيل الزراعية ببورصة محصولات الأبيض»: a line per crop, «▪️الكركدي
 *     (القنطار) 630,000 جنيه». After the list the article goes on in prose
 *     about the day's *increases* («أردب الدخن: 275.000 جنيه بزيادة 21.5%»),
 *     which are not prices. Only the list is read, through a fixed dictionary,
 *     and only crops the platform already follows, in their own unit.
 *
 * Gedaref's bulletin comes as free prose. Its figures are read the same way
 * but never published on their own: they are held for an administrator to
 * approve in one tap (see priceRefresh.ts).
 *
 * WHY NO LANGUAGE MODEL
 *
 * Every number on these pages must be one that was read in its source. A
 * fixed reader can only return a number that is in the text, beside the words
 * it looked for; a model can return a plausible one that is not. So the
 * readers here are plain rules, and what they cannot read with certainty is
 * held, not guessed.
 *
 * Everything here is pure — no network, no database — and runs on the saved
 * articles in scripts/fixtures/price-feeds (scripts/verify-price-feeds.ts).
 */

export interface WpPost {
  id: number;
  /** The site's local time, as WordPress writes it: YYYY-MM-DDTHH:MM:SS. */
  date: string;
  link: string;
  title: { rendered: string };
  content: { rendered: string };
}

export interface FxQuote {
  date: string;
  buy: number;
  sell: number;
  /** The words the figures were read in, for the page and the reviewer. */
  quote: string;
}

export interface CropQuote {
  market: "gedaref" | "obeid";
  crop: string;
  unit: "qintar" | "ardeb";
  date: string;
  price: number;
  quote: string;
}

// ── النصّ ───────────────────────────────────────────────────────────────────

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

function decodeEntities(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&([a-z]+);/gi, (m, n) => ENTITIES[n.toLowerCase()] ?? m);
}

/** Text without tags, one line per block — paragraph, line break, list item, row, bullet. */
export function htmlToLines(html: string): string[] {
  return decodeEntities(
    html
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(p|li|h[1-6]|tr|div|table)>/gi, "\n")
      .replace(/<[^>]+>/g, " "),
  )
    .split(/\n|(?=▪)|(?=🔸)|(?=📈)/u)
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

/** Arabic-Indic and Persian digits to Western ones; nothing else changes. */
export function westernDigits(s: string): string {
  return s.replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x660)).replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x6f0));
}

/**
 * A price as written: «4,850», «4٬850», «4850.00», «6.448» (thousands with a
 * dot, as some Sudanese papers write them), «470 ألف».
 *
 * A group of exactly three digits after each separator is a thousands group,
 * whichever mark separates it; anything else after a dot is a decimal part.
 */
export function parseAmount(raw: string): number | null {
  const s = westernDigits(raw).replace(/\s+/g, " ").trim();
  const m = s.match(/^(\d{1,3}(?:[.,٬]\d{3})+|\d+(?:\.\d{1,2})?)(?:\s*(ألف|الف|مليون))?$/u);
  if (!m) return null;
  const n = /^\d{1,3}(?:[.,٬]\d{3})+$/.test(m[1]) ? Number(m[1].replace(/[.,٬]/g, "")) : Number(m[1]);
  const scale = m[2] ? (m[2] === "مليون" ? 1_000_000 : 1_000) : 1;
  const v = n * scale;
  return Number.isFinite(v) && v > 0 ? v : null;
}

const NUMBER = String.raw`[\d٠-٩]{1,3}(?:[.,٬][\d٠-٩]{3})+|[\d٠-٩]+(?:\.[\d٠-٩]{1,2})?`;

const MONTHS: Record<string, number> = {
  يناير: 1, فبراير: 2, مارس: 3, أبريل: 4, إبريل: 4, ابريل: 4, مايو: 5, يونيو: 6, يوليو: 7,
  أغسطس: 8, اغسطس: 8, سبتمبر: 9, أكتوبر: 10, اكتوبر: 10, نوفمبر: 11, ديسمبر: 12,
};

const iso = (y: number, m: number, d: number) =>
  y >= 2020 && m >= 1 && m <= 12 && d >= 1 && d <= 31
    ? `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`
    : null;

/** «21 أكتوبر 2026» or «2026/10/14» in the text, else the post's own day. */
export function marketDay(text: string, postDate: string): string {
  const t = westernDigits(text);
  const named = t.match(/(\d{1,2})\s+(يناير|فبراير|مارس|أبريل|إبريل|ابريل|مايو|يونيو|يوليو|أغسطس|اغسطس|سبتمبر|أكتوبر|اكتوبر|نوفمبر|ديسمبر)\s+(\d{4})/u);
  if (named) {
    const d = iso(Number(named[3]), MONTHS[named[2]], Number(named[1]));
    if (d) return d;
  }
  const slashed = t.match(/(\d{4})\/(\d{1,2})\/(\d{1,2})/);
  if (slashed) {
    const d = iso(Number(slashed[1]), Number(slashed[2]), Number(slashed[3]));
    if (d) return d;
  }
  return postDate.slice(0, 10);
}

// ── بنك الخرطوم: الجدول ─────────────────────────────────────────────────────

/** The text of each cell, row by row; robust to missing opening tags. */
function tableRows(html: string): string[][] {
  return html
    .split(/<\/tr>/i)
    .map((row) =>
      row
        .split(/<\/t[dh]>/i)
        .slice(0, -1)
        // Only what follows the cell's own opening tag: the first cell of a
        // table otherwise carries every paragraph before the table with it.
        .map((cell) => cell.split(/<t[dh](?:\s[^>]*)?>/i).pop() ?? "")
        .map((cell) => decodeEntities(cell.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim()),
    )
    .filter((cells) => cells.length >= 3);
}

/**
 * The US dollar row of the first table whose headings name a buying and a
 * selling price. Buying is the cash column when there is one — what a person
 * changing money is paid — else the first buying column.
 */
export function readBankOfKhartoum(post: WpPost): FxQuote | null {
  const title = decodeEntities(post.title.rendered);
  if (!/بنك\s*الخرطوم/u.test(title + post.content.rendered)) return null;
  const rows = tableRows(post.content.rendered);
  for (let i = 0; i < rows.length; i++) {
    const head = rows[i];
    const sellIdx = head.findIndex((h) => /البيع/u.test(h) && !/السابق|الجديد/u.test(h));
    const cashIdx = head.findIndex((h) => /شراء\s*النقد/u.test(h));
    const buyIdx = cashIdx >= 0 ? cashIdx : head.findIndex((h) => /شراء/u.test(h));
    if (sellIdx < 0 || buyIdx < 0) continue;
    for (let j = i + 1; j < rows.length; j++) {
      const r = rows[j];
      if (r.some((c) => /البيع|شراء/u.test(c))) break; // the next table's headings
      if (!/الدولار\s*الأمريكي|الدولار\s*الامريكي/u.test(r[0] ?? "")) continue;
      const buy = parseAmount(r[buyIdx] ?? "");
      const sell = parseAmount(r[sellIdx] ?? "");
      if (buy === null || sell === null) return null;
      return {
        date: marketDay(title, post.date),
        buy,
        sell,
        quote: `${r[0]}: ${head[buyIdx]} ${r[buyIdx]} · ${head[sellIdx]} ${r[sellIdx]}`,
      };
    }
  }
  return null;
}

// ── السوق الموازي: الجملة ───────────────────────────────────────────────────

const PARALLEL_SENTENCE = new RegExp(
  String.raw`شراء\s+(?:ال)?دولار(?:\s+الأمريكي|\s+الامريكي)?\s+(${NUMBER})\s*(?:ألف\s*)?جنيه[^.]*?(?:سعر\s+)?(?:ال)?بيع\s*(?:إلى|الى|إلي|إلى\s+نحو)?\s*(${NUMBER})`,
  "u",
);

/**
 * The parallel market's dollar: a sentence naming «الموازي/الموازية» or the
 * one after it, never a sentence naming a bank — the bank's figures sit in the
 * same article.
 */
export function readParallelMarket(post: WpPost): FxQuote | null {
  const lines = htmlToLines(post.content.rendered);
  for (let i = 0; i < lines.length; i++) {
    if (!/الموازي/u.test(lines[i])) continue;
    for (const line of lines.slice(i, i + 3)) {
      if (/بنك/u.test(line)) continue;
      const m = line.match(PARALLEL_SENTENCE);
      if (!m) continue;
      const buy = parseAmount(m[1]);
      const sell = parseAmount(m[2]);
      if (buy === null || sell === null) continue;
      return { date: post.date.slice(0, 10), buy, sell, quote: line };
    }
  }
  return null;
}

// ── الأبيض: القائمة ─────────────────────────────────────────────────────────

/** The crops the platform follows in El Obeid, with the unit each must be quoted in. */
const OBEID_CROPS: { name: RegExp; crop: string; unit: CropQuote["unit"] }[] = [
  { name: /^الفول\s+الخام/u, crop: "groundnut", unit: "qintar" },
  { name: /^الكركدي/u, crop: "hibiscus", unit: "qintar" },
  { name: /^السمسم\s+الأحمر/u, crop: "sesame_red", unit: "qintar" },
  { name: /^(?:الصمغ\s+)?الهشاب|^صمغ\s+الهشاب/u, crop: "gum_hashab", unit: "qintar" },
  { name: /^الدخن/u, crop: "millet", unit: "ardeb" },
  { name: /^الفتريتة/u, crop: "feterita", unit: "ardeb" },
  { name: /^الطابت/u, crop: "tabat", unit: "ardeb" },
];

const UNIT_WORD: Record<CropQuote["unit"], RegExp> = {
  qintar: /\(\s*(?:ال)?قنطار\s*\)/u,
  ardeb: /\(\s*(?:ال)?أردب\s*\)|\(\s*(?:ال)?اردب\s*\)/u,
};

const LIST_PRICE = new RegExp(String.raw`(${NUMBER})\s*جنيه\s*$`, "u");

/**
 * The El Obeid crop section of a daily list: from its heading to the next
 * heading, one bullet per line. A crop is taken only when its line names it
 * first, in its own unit in brackets, and ends with one price in pounds.
 */
export function readObeidList(post: WpPost): CropQuote[] {
  const lines = htmlToLines(post.content.rendered);
  const start = lines.findIndex((l) => /المحاصيل/u.test(l) && /بورصة\s+محصولات\s+الأبيض|بورصة\s+محاصيل\s+الأبيض/u.test(l));
  if (start < 0) return [];
  const day = marketDay(lines.slice(0, 3).join(" "), post.date);
  const out: CropQuote[] = [];
  for (const raw of lines.slice(start + 1)) {
    if (!raw.startsWith("▪")) break;
    const line = raw.replace(/^▪️?\s*/u, "");
    const entry = OBEID_CROPS.find((c) => c.name.test(line));
    if (!entry || !UNIT_WORD[entry.unit].test(line)) continue;
    const m = line.match(LIST_PRICE);
    const price = m ? parseAmount(m[1]) : null;
    if (price === null || out.some((q) => q.crop === entry.crop)) continue;
    out.push({ market: "obeid", crop: entry.crop, unit: entry.unit, date: day, price, quote: raw });
  }
  return out;
}

// ── القضارف: نثر، يُحجز للمراجعة ────────────────────────────────────────────

const GEDAREF_CROPS: { name: RegExp; crop: string; unit: CropQuote["unit"]; unitWord: RegExp }[] = [
  { name: /السمسم/u, crop: "sesame", unit: "qintar", unitWord: /قنطار/u },
  { name: /الفتريتة/u, crop: "feterita", unit: "ardeb", unitWord: /أردب|اردب/u },
  { name: /الدخن/u, crop: "millet", unit: "ardeb", unitWord: /أردب|اردب/u },
];

/**
 * Candidate figures from a Gedaref bourse story: in one sentence, the crop,
 * its unit and a price in pounds after it. Prose is too varied to trust alone,
 * so the caller holds every one of these for an administrator.
 */
export function readGedarefProse(post: WpPost): CropQuote[] {
  const text = htmlToLines(post.content.rendered).join(" ");
  if (!/القضارف/u.test(text + post.title.rendered)) return [];
  const out: CropQuote[] = [];
  const priceAfter = new RegExp(String.raw`(${NUMBER})\s*(ألف|الف|مليون)?\s*جنيه`, "u");
  for (const sentence of text.split(/[.؛\n]/u)) {
    if (/بزيادة|بنسبة|ارتفاع(?:ًا|اً)?\s+بمقدار/u.test(sentence)) continue; // changes, not prices
    for (const c of GEDAREF_CROPS) {
      if (out.some((q) => q.crop === c.crop)) continue;
      const at = sentence.search(c.name);
      if (at < 0 || !c.unitWord.test(sentence)) continue;
      const m = sentence.slice(at).match(priceAfter);
      if (!m) continue;
      const price = parseAmount(m[2] ? `${m[1]} ${m[2]}` : m[1]);
      if (price === null) continue;
      out.push({ market: "gedaref", crop: c.crop, unit: c.unit, date: post.date.slice(0, 10), price, quote: sentence.trim() });
    }
  }
  return out;
}

// ── الحدّ المعقول ───────────────────────────────────────────────────────────

/**
 * Why a figure should wait for a person, or null when it may be published:
 * outside the plausible range, or moved further from the last published one
 * than a day's trading moves it.
 */
export function holdReason(next: number, last: number | null, maxChange: number, range: [number, number]): string | null {
  if (next < range[0] || next > range[1]) return `خارج المدى المعقول (${range[0]}–${range[1]})`;
  if (last !== null && last > 0) {
    const change = Math.abs(next - last) / last;
    if (change > maxChange) return `تغيّر ${Math.round(change * 100)}٪ عن آخر رقمٍ منشور (${last})`;
  }
  return null;
}
