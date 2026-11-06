/**
 * حزمة القوائم الماليّة PDF (البند ٢٠٥): كلّ القوائم لفترةٍ واحدة في ملفٍّ واحد، بشعار سوداقري واسم صاحب الدفتر والفترة
 * ووقت الإعداد، وبصمة الأرقام (SHA-256) في كلّ صفحة، وسطرا «أعدّه» و«اعتمده».
 *
 * Built on the server in plain JavaScript — pdf-lib with fontkit, which shapes Arabic, and bidi-js for the order of a
 * line that mixes Arabic with figures (`pdfText.ts`) — so it runs in a Vercel function with no browser and no native
 * library. The font is the site's own, Tajawal (SIL Open Font License, assets/fonts/OFL-Tajawal.txt); the logo is
 * public/sudagri-logo.webp as a JPEG (pdf-lib embeds PNG and JPEG only). Both are read from assets/ at run time and
 * named in next.config.ts so the function bundle carries them.
 *
 * One builder for both doors — the website's route (cookie session) and the app's (bearer) — so the two files are the
 * same file. Arabic is laid out right to left; an English reader gets the same bundle laid out left to right.
 */

import { readFile } from "node:fs/promises";
import path from "node:path";
import { PDFDocument, rgb, type PDFFont, type PDFImage, type PDFPage, type RGB } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import type { Locale } from "../i18n";
import { formatMoney } from "./money";
import { ltr, visualRuns, type Direction } from "./pdfText";
import {
  BUCKETS,
  BUCKET_LABEL,
  fingerprintGroups,
  periodLabel,
  type AgeingSide,
  type Bucket,
  type Line,
  type Pair,
  type StatementsBundle,
  type Text,
} from "./statements";

// ── Assets ───────────────────────────────────────────────────────────────────

export interface PdfAssets {
  regular: Uint8Array;
  bold: Uint8Array;
  logo: Uint8Array;
}

/** The files the bundle is drawn with. Listed in next.config.ts under both PDF routes. */
export const PDF_ASSET_FILES = ["assets/fonts/Tajawal-Regular.ttf", "assets/fonts/Tajawal-Bold.ttf", "assets/sudagri-logo-pdf.jpg"] as const;

let cached: Promise<PdfAssets> | null = null;

export function loadPdfAssets(root: string = process.cwd()): Promise<PdfAssets> {
  if (!cached) {
    cached = Promise.all(PDF_ASSET_FILES.map((f) => readFile(path.join(root, f)))).then(([regular, bold, logo]) => ({
      regular: new Uint8Array(regular),
      bold: new Uint8Array(bold),
      logo: new Uint8Array(logo),
    }));
    cached.catch(() => {
      cached = null;
    });
  }
  return cached;
}

// ── Look ─────────────────────────────────────────────────────────────────────

const hex = (h: string): RGB => rgb(parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255);
// The site's and the app's own colours (globals.css, mobile/lib/theme.dart): forest green, ink, muted, cream lines.
const C = {
  green: hex("#0f5a32"),
  deep: hex("#023f24"),
  ink: hex("#14261a"),
  muted: hex("#5d6b5f"),
  line: hex("#e7e0cc"),
  tint: hex("#e3efd9"),
  gold: hex("#fdf1d3"),
  warn: hex("#8a6508"),
  white: rgb(1, 1, 1),
};

const PAGE_W = 595.28;
const PAGE_H = 841.89;
const M = 36;
const CONTENT_W = PAGE_W - 2 * M;
const HEADER_H = 74;
const FOOTER_H = 46;
const ROW_H = 15;

const money = (v: bigint | null): string => (v === null ? "—" : formatMoney(v, "USD", false));
const pct = (v: number | null): string => (v === null ? "—" : `${v > 0 ? "+" : ""}${v.toFixed(1)}%`);

// ── The writer: logical positions from the start margin, so one layout serves right-to-left and left-to-right ──

interface Cell {
  text: string;
  /** Logical offset from the start margin, and width. */
  x: number;
  w: number;
  align?: "start" | "end" | "center";
  bold?: boolean;
  size?: number;
  color?: RGB;
}

class Writer {
  pages: PDFPage[] = [];
  page!: PDFPage;
  y = 0;

  constructor(
    private doc: PDFDocument,
    private regular: PDFFont,
    private bold: PDFFont,
    readonly dir: Direction,
    private header: (w: Writer, first: boolean) => void,
  ) {}

  t(s: Text): string {
    return this.dir === "rtl" ? s.ar : s.en;
  }

  width(text: string, size: number, bold = false): number {
    const f = bold ? this.bold : this.regular;
    return visualRuns(text, this.dir).reduce((a, r) => a + f.widthOfTextAtSize(r, size), 0);
  }

  /** Draws `text` with its visual box starting at the absolute `left`. */
  private drawAt(text: string, left: number, y: number, size: number, bold: boolean, color: RGB) {
    const f = bold ? this.bold : this.regular;
    let x = left;
    for (const run of visualRuns(text, this.dir)) {
      this.page.drawText(run, { x, y, size, font: f, color });
      x += f.widthOfTextAtSize(run, size);
    }
  }

  /** The absolute left edge of the logical box [x, x + w]. */
  private boxLeft(x: number, w: number): number {
    return this.dir === "rtl" ? PAGE_W - M - x - w : M + x;
  }

  /** A string shrunk, then cut, to fit a width. */
  fit(text: string, w: number, size: number, bold = false): { text: string; size: number } {
    let s = size;
    while (s > 6.5 && this.width(text, s, bold) > w) s -= 0.5;
    if (this.width(text, s, bold) <= w) return { text, size: s };
    let cut = text;
    while (cut.length > 1 && this.width(cut + "…", s, bold) > w) cut = cut.slice(0, -1);
    return { text: cut + "…", size: s };
  }

  cell(c: Cell, y: number = this.y) {
    const size = c.size ?? 9;
    const bold = c.bold ?? false;
    const { text, size: sz } = this.fit(c.text, c.w, size, bold);
    const tw = this.width(text, sz, bold);
    const left = this.boxLeft(c.x, c.w);
    const align = c.align ?? "start";
    const startIsRight = this.dir === "rtl";
    let x: number;
    if (align === "center") x = left + (c.w - tw) / 2;
    else if ((align === "start") === startIsRight) x = left + c.w - tw;
    else x = left;
    this.drawAt(text, x, y, sz, bold, c.color ?? C.ink);
  }

  rect(x: number, w: number, y: number, h: number, color: RGB) {
    this.page.drawRectangle({ x: this.boxLeft(x, w), y, width: w, height: h, color });
  }

  rule(y: number, color: RGB = C.line, thickness = 0.6, x = 0, w = CONTENT_W) {
    const left = this.boxLeft(x, w);
    this.page.drawLine({ start: { x: left, y }, end: { x: left + w, y }, thickness, color });
  }

  image(img: PDFImage, x: number, w: number, y: number, h: number) {
    this.page.drawImage(img, { x: this.boxLeft(x, w), y, width: w, height: h });
  }

  newPage() {
    this.page = this.doc.addPage([PAGE_W, PAGE_H]);
    this.pages.push(this.page);
    this.y = PAGE_H - M;
    this.header(this, this.pages.length === 1);
  }

  /** Room for `h` more points above the footer, or a new page. */
  need(h: number) {
    if (this.y - h < M + FOOTER_H) this.newPage();
  }

  /** A paragraph wrapped to a width, line by line in reading order. */
  paragraph(text: string, size: number, x = 0, w = CONTENT_W, color: RGB = C.ink, lineH = size * 1.65) {
    const words = text.split(/\s+/).filter(Boolean);
    let lineWords: string[] = [];
    const flush = () => {
      if (!lineWords.length) return;
      this.need(lineH);
      this.cell({ text: lineWords.join(" "), x, w, size, color }, this.y - size);
      this.y -= lineH;
      lineWords = [];
    };
    for (const word of words) {
      const next = [...lineWords, word].join(" ");
      if (lineWords.length && this.width(next, size) > w) flush();
      lineWords.push(word);
    }
    flush();
  }
}

// ── Tables ───────────────────────────────────────────────────────────────────

interface Col {
  key: string;
  label: string;
  w: number;
}

function columns(w: Writer, compare: boolean): Col[] {
  const nums: Col[] = compare
    ? [
        { key: "cur", label: w.t({ ar: "هذه الفترة", en: "This period" }), w: 78 },
        { key: "prev", label: w.t({ ar: "السابقة", en: "Previous" }), w: 78 },
        { key: "chg", label: w.t({ ar: "التغيّر", en: "Change" }), w: 72 },
        { key: "pct", label: "%", w: 46 },
      ]
    : [{ key: "cur", label: w.t({ ar: "المبلغ (دولار)", en: "Amount (USD)" }), w: 100 }];
  const used = nums.reduce((a, c) => a + c.w, 0);
  return [{ key: "name", label: w.t({ ar: "البند", en: "Item" }), w: CONTENT_W - used }, ...nums];
}

function colX(cols: Col[], key: string): { x: number; w: number } {
  let x = 0;
  for (const c of cols) {
    if (c.key === key) return { x, w: c.w };
    x += c.w;
  }
  return { x: 0, w: 0 };
}

function tableHead(w: Writer, cols: Col[]) {
  w.need(ROW_H * 3);
  w.rect(0, CONTENT_W, w.y - ROW_H + 3, ROW_H, C.tint);
  for (const c of cols) {
    const { x, w: cw } = colX(cols, c.key);
    w.cell({ text: c.label, x: x + 4, w: cw - 8, bold: true, size: 8.5, color: C.deep, align: c.key === "name" ? "start" : "end" }, w.y - ROW_H + 7);
  }
  w.y -= ROW_H + 2;
}

function pairRow(w: Writer, cols: Col[], label: string, v: Pair, opts: { bold?: boolean; ruleAbove?: boolean; indent?: number } = {}) {
  w.need(ROW_H);
  if (opts.ruleAbove) w.rule(w.y + 2, C.muted, 0.5);
  const base = w.y - ROW_H + 5;
  const name = colX(cols, "name");
  w.cell({ text: label, x: name.x + 4 + (opts.indent ?? 0), w: name.w - 8 - (opts.indent ?? 0), bold: opts.bold }, base);
  const put = (key: string, text: string, color?: RGB) => {
    const c = colX(cols, key);
    if (c.w) w.cell({ text: ltr(text), x: c.x + 2, w: c.w - 6, align: "end", bold: opts.bold, color }, base);
  };
  put("cur", money(v.current));
  put("prev", money(v.previous));
  put("chg", v.change === null ? "—" : `${v.change > BigInt(0) ? "+" : ""}${money(v.change)}`);
  put("pct", pct(v.pct), C.muted);
  w.y -= ROW_H;
  if (!opts.bold) w.rule(w.y + 3, C.line, 0.3);
}

function title(w: Writer, text: string, sub?: string) {
  w.need(48);
  w.y -= 8;
  w.cell({ text, x: 0, w: CONTENT_W, bold: true, size: 13, color: C.green }, w.y - 13);
  w.y -= 18;
  if (sub) {
    w.cell({ text: sub, x: 0, w: CONTENT_W, size: 8.5, color: C.muted }, w.y - 9);
    w.y -= 14;
  }
  w.y -= 2;
}

function lines(w: Writer, cols: Col[], ls: readonly Line[]) {
  for (const l of ls) pairRow(w, cols, w.t(l.name), l.v, { indent: 6 });
}

const sub = (w: Writer, label: string) => {
  w.need(ROW_H * 2);
  w.cell({ text: label, x: 4, w: CONTENT_W - 8, bold: true, size: 9.5, color: C.deep }, w.y - ROW_H + 5);
  w.y -= ROW_H;
};

const verdict = (w: Writer, ok: boolean, good: Text, bad: Text) => {
  w.need(ROW_H + 4);
  w.y -= 3;
  w.cell({ text: w.t(ok ? good : bad), x: 4, w: CONTENT_W - 8, size: 8.5, color: ok ? C.green : C.warn, bold: !ok }, w.y - ROW_H + 5);
  w.y -= ROW_H;
};

function ageingTable(w: Writer, side: AgeingSide, heading: Text) {
  const showAdvance = side.buckets.advance !== BigInt(0);
  const keys: Bucket[] = BUCKETS.filter((b) => b !== "advance" || showAdvance);
  const numW = 66;
  const cols: Col[] = [
    { key: "name", label: w.t(heading), w: CONTENT_W - numW * (keys.length + 1) },
    ...keys.map((k) => ({ key: k, label: w.t(BUCKET_LABEL[k]), w: numW })),
    { key: "total", label: w.t({ ar: "المجموع", en: "Total" }), w: numW },
  ];
  tableHead(w, cols);
  const row = (label: string, vals: Record<string, bigint>, bold = false) => {
    w.need(ROW_H);
    const base = w.y - ROW_H + 5;
    const n = colX(cols, "name");
    w.cell({ text: label, x: n.x + 4, w: n.w - 8, bold }, base);
    for (const k of [...keys, "total"]) {
      const c = colX(cols, k);
      w.cell({ text: ltr(money(vals[k] ?? BigInt(0))), x: c.x + 2, w: c.w - 6, align: "end", bold }, base);
    }
    w.y -= ROW_H;
    w.rule(w.y + 3, C.line, 0.3);
  };
  if (!side.accounts.length) {
    w.need(ROW_H);
    w.cell({ text: w.t({ ar: "لا شيء.", en: "Nothing." }), x: 4, w: CONTENT_W - 8, color: C.muted }, w.y - ROW_H + 5);
    w.y -= ROW_H;
    return;
  }
  for (const a of side.accounts) row(`${w.t(a.name)} (${ltr(a.code)})`, { ...a.buckets, total: a.total });
  row(w.t({ ar: "المجموع", en: "Total" }), { ...side.buckets, total: side.total }, true);
}

// ── The bundle ───────────────────────────────────────────────────────────────

/** Khartoum's wall-clock time, "2026-11-06 09:12". */
export function khartoumStamp(iso: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Khartoum",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(iso));
  const g = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${g("year")}-${g("month")}-${g("day")} ${g("hour")}:${g("minute")}`;
}

export async function buildStatementsPdf(b: StatementsBundle, opts: { locale: Locale; assets?: PdfAssets }): Promise<Uint8Array> {
  const assets = opts.assets ?? (await loadPdfAssets());
  const dir: Direction = opts.locale === "en" ? "ltr" : "rtl";
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const regular = await doc.embedFont(assets.regular, { subset: true });
  const bold = await doc.embedFont(assets.bold, { subset: true });
  const logo = await doc.embedJpg(assets.logo);

  const T = (s: Text) => (dir === "rtl" ? s.ar : s.en);
  const owner = b.book.ownerName ?? (b.book.kind === "platform" ? T({ ar: "سوداقري (دفتر المنصّة)", en: "Sudagri (the platform's book)" }) : "—");
  const period = periodLabel(b.current, b.basis);
  const prevLabel = b.previous ? periodLabel(b.previous, b.basis) : null;
  const stamp = khartoumStamp(b.generatedAt);
  const compare = b.previous !== null;

  const header = (w: Writer, first: boolean) => {
    const top = PAGE_H - M;
    const logoSize = first ? 58 : 34;
    w.image(logo, 0, logoSize, top - logoSize, logoSize);
    const tx = logoSize + 10;
    const tw = CONTENT_W - tx;
    w.cell({ text: T({ ar: "سوداقري — القوائم الماليّة", en: "Sudagri — Financial statements" }), x: tx, w: tw, bold: true, size: first ? 16 : 11, color: C.deep }, top - (first ? 17 : 12));
    w.cell(
      { text: `${T(b.book.heading)} · ${T({ ar: "صاحب الدفتر", en: "Book holder" })}: ${owner}`, x: tx, w: tw, size: first ? 9.5 : 8, color: C.ink },
      top - (first ? 33 : 24),
    );
    if (first) {
      w.cell(
        { text: `${T({ ar: "الفترة", en: "Period" })}: ${ltrDates(T(period))}${prevLabel ? ` · ${T({ ar: "مقارنةً بـ", en: "compared with" })} ${ltrDates(T(prevLabel))}` : ""}`, x: tx, w: tw, size: 9, color: C.ink },
        top - 47,
      );
      w.cell(
        { text: `${T({ ar: "أُعدّت في", en: "Prepared on" })} ${ltr(stamp)} ${T({ ar: "بتوقيت الخرطوم · كلّ المبالغ بالدولار الأمريكيّ", en: "Khartoum time · all amounts in US dollars" })}`, x: tx, w: tw, size: 8.5, color: C.muted },
        top - 60,
      );
    } else {
      w.cell({ text: `${ltrDates(T(period))} · ${T({ ar: "بالدولار", en: "USD" })}`, x: tx, w: tw, size: 8, color: C.muted }, top - 34 + 2);
    }
    const h = first ? HEADER_H : 44;
    w.rule(top - h + 6, C.green, 1.2);
    w.y = top - h - 4;
  };

  const w = new Writer(doc, regular, bold, dir, header);
  w.newPage();

  // 1. At a glance.
  const cols = columns(w, compare);
  title(w, T({ ar: "خلاصة", en: "At a glance" }));
  tableHead(w, cols);
  pairRow(w, cols, T({ ar: "صافي الدخل", en: "Net income" }), b.income.net, { bold: true });
  pairRow(w, cols, T({ ar: "مجموع الأصول", en: "Total assets" }), b.balance.totalAssets);
  pairRow(w, cols, T({ ar: "الملكيّة آخر الفترة", en: "Equity at the end of the period" }), b.balance.totalEquity);
  pairRow(w, cols, T({ ar: "النقد آخر الفترة", en: "Cash at the end of the period" }), b.cash.closing);
  pairRow(w, cols, T({ ar: "لك على غيرك", en: "Owed to you" }), { current: b.ageing.receivable.total, previous: null, change: null, pct: null });
  pairRow(w, cols, T({ ar: "عليك لغيرك", en: "You owe" }), { current: b.ageing.payable.total, previous: null, change: null, pct: null });

  // 2. Income statement.
  title(w, T({ ar: "قائمة الدخل", en: "Income statement" }), compare ? T({ ar: "هذه الفترة مقارنةً بالسابقة", en: "This period against the previous" }) : undefined);
  tableHead(w, cols);
  sub(w, T({ ar: "الإيراد", en: "Revenue" }));
  lines(w, cols, b.income.revenue);
  pairRow(w, cols, T({ ar: "مجموع الإيراد", en: "Total revenue" }), b.income.totalRevenue, { bold: true, ruleAbove: true });
  sub(w, T({ ar: "المصروف", en: "Expenses" }));
  lines(w, cols, b.income.expense);
  pairRow(w, cols, T({ ar: "مجموع المصروف", en: "Total expenses" }), b.income.totalExpense, { bold: true, ruleAbove: true });
  pairRow(w, cols, T({ ar: "صافي الدخل", en: "Net income" }), b.income.net, { bold: true, ruleAbove: true });

  // 3. Balance sheet.
  title(
    w,
    T({ ar: "الميزانيّة (المركز الماليّ)", en: "Balance sheet" }),
    `${T({ ar: "في", en: "At" })} ${ltr(b.current.to)}${b.previous ? ` ${T({ ar: "مقارنةً بـ", en: "against" })} ${ltr(b.previous.to)}` : ""}`,
  );
  tableHead(w, cols);
  sub(w, T({ ar: "الأصول", en: "Assets" }));
  lines(w, cols, b.balance.assets);
  pairRow(w, cols, T({ ar: "مجموع الأصول", en: "Total assets" }), b.balance.totalAssets, { bold: true, ruleAbove: true });
  sub(w, T({ ar: "الالتزامات", en: "Liabilities" }));
  lines(w, cols, b.balance.liabilities);
  pairRow(w, cols, T({ ar: "مجموع الالتزامات", en: "Total liabilities" }), b.balance.totalLiabilities, { bold: true, ruleAbove: true });
  sub(w, T({ ar: "حقوق الملكيّة", en: "Equity" }));
  lines(w, cols, b.balance.equity);
  pairRow(w, cols, T({ ar: "مجموع الملكيّة", en: "Total equity" }), b.balance.totalEquity, { bold: true, ruleAbove: true });
  verdict(w, b.balance.balanced, { ar: "متوازنة: الأصول = الالتزامات + الملكيّة.", en: "Balanced: assets equal liabilities plus equity." }, { ar: "غير متوازنة — أبلغ الإدارة.", en: "Not balanced — tell the administrators." });

  // 4. Cash flow.
  title(w, T({ ar: "التدفّقات النقديّة", en: "Cash flow" }), T({ ar: "بالطريقة المباشرة: ما دخل النقد والبنك والمحفظة وما خرج منها", en: "Direct method: what came into and went out of cash, bank and wallet" }));
  tableHead(w, cols);
  sub(w, T({ ar: "تشغيليّة", en: "Operating" }));
  lines(w, cols, b.cash.operating);
  pairRow(w, cols, T({ ar: "صافي التشغيليّة", en: "Net operating" }), b.cash.totalOperating, { bold: true, ruleAbove: true });
  sub(w, T({ ar: "استثماريّة", en: "Investing" }));
  lines(w, cols, b.cash.investing);
  pairRow(w, cols, T({ ar: "صافي الاستثماريّة", en: "Net investing" }), b.cash.totalInvesting, { bold: true, ruleAbove: true });
  sub(w, T({ ar: "تمويليّة", en: "Financing" }));
  lines(w, cols, b.cash.financing);
  pairRow(w, cols, T({ ar: "صافي التمويليّة", en: "Net financing" }), b.cash.totalFinancing, { bold: true, ruleAbove: true });
  pairRow(w, cols, T({ ar: "النقد أوّل الفترة", en: "Cash at the start" }), b.cash.opening, { ruleAbove: true });
  pairRow(w, cols, T({ ar: "صافي الحركة", en: "Net movement" }), b.cash.net);
  pairRow(w, cols, T({ ar: "النقد آخر الفترة", en: "Cash at the end" }), b.cash.closing, { bold: true });
  verdict(w, b.cash.ties, { ar: "النقد أوّل الفترة + الحركة = النقد آخرها.", en: "Opening cash plus the movement equals closing cash." }, { ar: "لا يتطابق النقد — أبلغ الإدارة.", en: "Cash does not tie — tell the administrators." });

  // 5. Changes in equity.
  const one = columns(w, false);
  title(w, T({ ar: "قائمة التغيّر في حقوق الملكيّة", en: "Statement of changes in equity" }), `${ltr(b.current.from)} — ${ltr(b.current.to)}`);
  tableHead(w, one);
  for (const r of b.equity.rows) {
    const strong = r.line === "opening" || r.line === "closing";
    pairRow(w, one, T(r.name), { current: r.amount, previous: null, change: null, pct: null }, { bold: strong, ruleAbove: r.line === "closing" });
  }
  verdict(w, b.equity.closesToBalance, { ar: "الملكيّة آخر الفترة = مجموع الملكيّة في الميزانيّة.", en: "Closing equity equals the balance sheet's equity." }, { ar: "لا تطابق الميزانيّة — أبلغ الإدارة.", en: "Does not agree with the balance sheet — tell the administrators." });

  // 6. Ageing.
  title(
    w,
    T({ ar: "أعمار الذمم", en: "Ageing of what is owed" }),
    `${T({ ar: "في", en: "At" })} ${ltr(b.ageing.asOf)} · ${T({ ar: "العمر من يوم القيد؛ سداد القيد الآجل يُطرح منه، وغيره من الأقدم", en: "Age from the day of the entry; a credit entry's own settlement comes off it, any other from the oldest" })}`,
  );
  ageingTable(w, b.ageing.receivable, { ar: "لك على غيرك (مدينون)", en: "Owed to you (receivables)" });
  w.y -= 6;
  ageingTable(w, b.ageing.payable, { ar: "عليك لغيرك (دائنون)", en: "You owe (payables)" });

  // 7. Budget against actual.
  if (b.budget.length) {
    title(w, T({ ar: "الميزانيّة التقديريّة مقابل الفعليّ", en: "Budget against actual" }), T({ ar: "لكلّ مرحلة: خطّتها، وما قُيِّد عليها في الدفتر، والفرق", en: "For each stage: its plan, what the book recorded against it, and the difference" }));
    const bcols: Col[] = [
      { key: "name", label: T({ ar: "المرحلة", en: "Stage" }), w: CONTENT_W - 78 * 3 - 52 },
      { key: "plan", label: T({ ar: "الخطّة", en: "Plan" }), w: 78 },
      { key: "act", label: T({ ar: "الفعليّ", en: "Actual" }), w: 78 },
      { key: "var", label: T({ ar: "الباقي أو التجاوز", en: "Left or over" }), w: 78 },
      { key: "used", label: "%", w: 52 },
    ];
    for (const s of b.budget) {
      sub(w, s.name);
      tableHead(w, bcols);
      const row = (label: string, plan: bigint, act: bigint, v: bigint, used: number | null, strong = false) => {
        w.need(ROW_H);
        const base = w.y - ROW_H + 5;
        const n = colX(bcols, "name");
        w.cell({ text: label, x: n.x + 4, w: n.w - 8, bold: strong }, base);
        const put = (k: string, t: string, color?: RGB) => {
          const c = colX(bcols, k);
          w.cell({ text: ltr(t), x: c.x + 2, w: c.w - 6, align: "end", bold: strong, color }, base);
        };
        put("plan", money(plan));
        put("act", money(act));
        put("var", money(v), v < BigInt(0) ? C.warn : undefined);
        put("used", used === null ? "—" : `${used.toFixed(1)}%`, C.muted);
        w.y -= ROW_H;
        w.rule(w.y + 3, C.line, 0.3);
      };
      for (const st of s.stages) row(T(st.name), st.budget, st.actual, st.variance, st.usedPct);
      row(T({ ar: "مجموع الموسم", en: "Season total" }), s.budget, s.actual, s.variance, s.usedPct, true);
      w.y -= 4;
    }
  }

  // 8. Notes.
  title(w, T({ ar: "إيضاحات", en: "Notes" }));
  b.notes.forEach((n, i) => {
    w.need(40);
    w.cell({ text: `${ltr(String(i + 1))}. ${T(n.title)}`, x: 0, w: CONTENT_W, bold: true, size: 10, color: C.deep }, w.y - 10);
    w.y -= 16;
    w.paragraph(isolateFigures(T(n.body)), 8.8, 10, CONTENT_W - 10);
    w.y -= 4;
  });

  // 9. Signatures.
  w.need(120);
  title(w, T({ ar: "الاعتماد", en: "Sign-off" }));
  const half = (CONTENT_W - 30) / 2;
  const sig = (x: number, label: Text) => {
    const top = w.y;
    w.cell({ text: T(label), x, w: half, bold: true, size: 10, color: C.deep }, top - 10);
    const rows: Text[] = [
      { ar: "الاسم", en: "Name" },
      { ar: "التوقيع", en: "Signature" },
      { ar: "التاريخ", en: "Date" },
    ];
    rows.forEach((r, i) => {
      const y = top - 34 - i * 24;
      w.cell({ text: `${T(r)}:`, x, w: 60, size: 9, color: C.muted }, y);
      w.rule(y - 2, C.muted, 0.6, x + 62, half - 62);
    });
  };
  sig(0, { ar: "أعدّه", en: "Prepared by" });
  sig(half + 30, { ar: "اعتمده", en: "Approved by" });
  w.y -= 34 + 3 * 24;

  // Footers, now that the pages are counted: the fingerprint on every page, and how to check it.
  const fp = fingerprintGroups(b.fingerprint);
  w.pages.forEach((page, i) => {
    w.page = page;
    const y0 = M + FOOTER_H - 10;
    w.rule(y0 + 4, C.green, 0.8);
    w.cell({ text: `${T({ ar: "بصمة الأرقام", en: "Fingerprint of the figures" })} (SHA-256): ${ltr(fp)}`, x: 0, w: CONTENT_W - 70, size: 7.6, color: C.ink, bold: true }, y0 - 8);
    w.cell({ text: `${T({ ar: "صفحة", en: "Page" })} ${ltr(`${i + 1} / ${w.pages.length}`)}`, x: CONTENT_W - 66, w: 66, size: 8, color: C.muted, align: "end" }, y0 - 8);
    w.cell(
      {
        text: T({
          ar: "للتحقّق: افتح «القوائم الماليّة» في سوداقري للدفتر والفترة نفسيهما؛ البصمة نفسها تعني الأرقام نفسها، وتغيّر سنتٍ واحد يغيّرها.",
          en: "To check: open “Financial statements” in Sudagri for the same book and period; the same fingerprint means the same figures, and one cent changed changes it.",
        }),
        x: 0,
        w: CONTENT_W,
        size: 7,
        color: C.muted,
      },
      y0 - 21,
    );
  });

  doc.setTitle(`${T({ ar: "القوائم الماليّة", en: "Financial statements" })} — ${owner} — ${b.current.from}…${b.current.to}`);
  doc.setAuthor("Sudagri");
  doc.setCreator("Sudagri");
  doc.setProducer("Sudagri (pdf-lib)");
  doc.setSubject(`SHA-256 ${b.fingerprint}`);
  doc.setKeywords(["sudagri", "statements", b.fingerprint]);
  doc.setLanguage(dir === "rtl" ? "ar" : "en");
  doc.setCreationDate(new Date(b.generatedAt));
  doc.setModificationDate(new Date(b.generatedAt));
  return doc.save();
}

/**
 * Figures inside running text — a date, an amount with its dollar sign, a percentage, a count — are isolated so each
 * reads left to right inside Arabic, whole: "2026-10-31" not "31-10-2026", "440.00 $" not "$ 440.00".
 */
export const isolateFigures = (s: string): string => s.replace(/[-+]?\d[\d,.:/-]*\d(?: ?[$%])?|[-+]?\d(?: ?[$%])?/g, (m) => ltr(m));

/** Dates inside a heading are isolated so they read left to right inside Arabic. */
const ltrDates = (s: string): string => s.replace(/\d{4}-\d{2}(?:-\d{2})?/g, (d) => ltr(d));

/** The file name a reader saves it under. */
export const statementsFileName = (b: StatementsBundle): string => `sudagri-statements-${b.current.from}-${b.current.to}.pdf`;
