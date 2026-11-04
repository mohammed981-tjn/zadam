/**
 * مكتبة الدراسات والبحوث (البند ٢٠٢): ما يُقبل من المرسِل، بأيّ حدود، وبأيّ أسماء.
 *
 * The rules here are the table's own (supabase/migrations/20261026010000_research_library.sql), checked before the
 * row is written so the sender reads which field to fix instead of a database error. They are pure, so
 * scripts/verify-research-form.ts holds them to the migration.
 */

export const RESEARCH_KINDS = ["feasibility", "research", "thesis", "report", "other"] as const;
export type ResearchKind = (typeof RESEARCH_KINDS)[number];

export const RESEARCH_KIND_LABEL: Record<ResearchKind, [ar: string, en: string]> = {
  feasibility: ["دراسة جدوى", "Feasibility study"],
  research: ["بحثٌ علميّ", "Research paper"],
  thesis: ["رسالة جامعيّة", "Thesis"],
  report: ["تقرير", "Report"],
  other: ["غير ذلك", "Other"],
};

/** The bucket's own ceiling: twenty megabytes, PDF only. */
export const RESEARCH_MAX_BYTES = 20 * 1024 * 1024;

/** Where an upload lands: one path per file, made by the server. */
export const RESEARCH_PATH = /^incoming\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.pdf$/;

export interface ResearchInput {
  kind: string;
  title: string;
  authors: string;
  institution: string;
  year: string;
  language: string;
  crop: string;
  state: string;
  abstract: string;
  file_path: string;
  link_url: string;
  contact: string;
  consent: boolean;
}

export interface ResearchRow {
  kind: ResearchKind;
  title: string;
  authors: string;
  institution: string | null;
  year: number | null;
  language: "ar" | "en" | "other";
  crop: string | null;
  state: string | null;
  abstract: string;
  file_path: string | null;
  link_url: string | null;
  contact: string | null;
  consent: true;
}

const t = (v: string) => v.replace(/\s+/g, " ").trim();

/** The row to write, or the first thing the sender has to fix (Arabic and English). */
export function checkResearch(
  input: ResearchInput,
  thisYear = new Date().getFullYear(),
): { ok: true; row: ResearchRow } | { ok: false; message: [string, string] } {
  const kind = input.kind as ResearchKind;
  if (!RESEARCH_KINDS.includes(kind)) return { ok: false, message: ["اختر نوع العمل.", "Choose the kind of work."] };
  const title = t(input.title);
  if (title.length < 5 || title.length > 200) {
    return { ok: false, message: ["العنوان من ٥ أحرفٍ إلى ٢٠٠.", "The title is 5 to 200 characters."] };
  }
  const authors = t(input.authors);
  if (authors.length < 2 || authors.length > 200) {
    return { ok: false, message: ["اكتب اسم المؤلّف أو المؤلّفين.", "Write the author's name, or the authors'."] };
  }
  const institution = t(input.institution).slice(0, 200) || null;
  let year: number | null = null;
  if (t(input.year)) {
    year = Number(t(input.year).replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d))));
    if (!Number.isInteger(year) || year < 1950 || year > thisYear + 1) {
      return { ok: false, message: [`السنة بين ١٩٥٠ و${thisYear + 1}.`, `The year is between 1950 and ${thisYear + 1}.`] };
    }
  }
  const language = (["ar", "en", "other"] as const).find((l) => l === input.language) ?? "ar";
  const crop = t(input.crop).slice(0, 60) || null;
  const state = t(input.state).slice(0, 60) || null;
  const abstract = input.abstract.trim();
  if (abstract.length < 40 || abstract.length > 3000) {
    return {
      ok: false,
      message: ["الملخّص من ٤٠ حرفاً إلى ٣٠٠٠: ما الذي درسته، وكيف، وماذا وجدت.", "The abstract is 40 to 3,000 characters: what you studied, how, and what you found."],
    };
  }
  const file_path = t(input.file_path) || null;
  if (file_path && !RESEARCH_PATH.test(file_path)) {
    return { ok: false, message: ["الملفّ المرفوع غير صالح. ارفعه من جديد.", "The uploaded file is not valid. Upload it again."] };
  }
  const link_url = t(input.link_url) || null;
  if (link_url && (!/^https:\/\/[^\s]+$/.test(link_url) || link_url.length > 500)) {
    return { ok: false, message: ["الرابط يبدأ بـ https://", "The link starts with https://"] };
  }
  if (!file_path && !link_url) {
    return { ok: false, message: ["أرفق ملفّ PDF أو ضع رابط العمل.", "Attach a PDF or give a link to the work."] };
  }
  const contact = t(input.contact).slice(0, 200) || null;
  if (input.consent !== true) {
    return {
      ok: false,
      message: ["أكّد أنّ لك حقّ مشاركة هذا العمل، أو أنّه منشورٌ للعموم.", "Confirm the work is yours to share, or already public."],
    };
  }
  return {
    ok: true,
    row: { kind, title, authors, institution, year, language, crop, state, abstract, file_path, link_url, contact, consent: true },
  };
}
