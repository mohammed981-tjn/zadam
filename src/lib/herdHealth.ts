/**
 * سجلّ صحّة القطيع وأرقام آذانه (البند ١١٧) — الأسماء والملخّص.
 *
 * The farmer records what was done to the herd; this names it and sums it up.
 * The names are disease and test names only — which of them a quarantine or a
 * destination asks for, and how recently, is a separate list with its sources
 * (exportReadiness.ts), so that a requirement is never implied by a label.
 *
 * Keys are stored as written here (herd_health_records.item_key). Adding one
 * is safe; renaming one orphans the records written under the old key.
 */

export type HealthKind = "vaccination" | "test" | "treatment";

export interface HealthItem {
  key: string;
  kind: HealthKind;
  ar: string;
  en: string;
}

export const HEALTH_ITEMS: HealthItem[] = [
  { key: "ppr", kind: "vaccination", ar: "طاعون المجترّات الصغيرة", en: "Peste des petits ruminants (PPR)" },
  { key: "sheep_goat_pox", kind: "vaccination", ar: "جدري الضأن والماعز", en: "Sheep and goat pox" },
  { key: "fmd", kind: "vaccination", ar: "الحمّى القلاعيّة", en: "Foot and mouth disease" },
  { key: "rvf", kind: "vaccination", ar: "حمّى الوادي المتصدّع", en: "Rift Valley fever" },
  { key: "anthrax", kind: "vaccination", ar: "الجمرة الخبيثة", en: "Anthrax" },
  { key: "hs", kind: "vaccination", ar: "التسمّم الدموي النزفي", en: "Haemorrhagic septicaemia" },
  { key: "ccpp", kind: "vaccination", ar: "ذات الرئة البلوري المعدي في الماعز", en: "Contagious caprine pleuropneumonia" },
  { key: "cbpp", kind: "vaccination", ar: "ذات الرئة البقري المعدي", en: "Contagious bovine pleuropneumonia" },
  { key: "lsd", kind: "vaccination", ar: "الجلد العقدي", en: "Lumpy skin disease" },
  { key: "blackleg", kind: "vaccination", ar: "الساق السوداء", en: "Blackleg" },
  { key: "enterotoxaemia", kind: "vaccination", ar: "التسمّم المعوي", en: "Enterotoxaemia" },
  { key: "camel_pox", kind: "vaccination", ar: "جدري الإبل", en: "Camel pox" },
  { key: "other_vaccine", kind: "vaccination", ar: "تطعيمٌ آخر (اكتبه في الملاحظة)", en: "Other vaccine (name it in the note)" },
  { key: "brucellosis", kind: "test", ar: "البروسيلا (الحمّى المالطيّة)", en: "Brucellosis" },
  { key: "tuberculosis", kind: "test", ar: "السلّ", en: "Tuberculosis" },
  { key: "trypanosomiasis", kind: "test", ar: "المثقّبيات (السُّرّة)", en: "Trypanosomiasis (surra)" },
  { key: "other_test", kind: "test", ar: "فحصٌ آخر (اكتبه في الملاحظة)", en: "Other test (name it in the note)" },
  { key: "internal_parasites", kind: "treatment", ar: "طارد الديدان الداخليّة", en: "Internal parasite treatment" },
  { key: "external_parasites", kind: "treatment", ar: "رشّ أو تغطيس للقراد والطفيليّات الخارجيّة", en: "External parasite spray or dip" },
  { key: "other_treatment", kind: "treatment", ar: "علاجٌ آخر (اكتبه في الملاحظة)", en: "Other treatment (name it in the note)" },
];

const BY_KEY = new Map(HEALTH_ITEMS.map((i) => [i.key, i]));

/** A key written before this list knew it keeps its own spelling rather than vanishing. */
export const healthItemName = (key: string, en: boolean) => {
  const i = BY_KEY.get(key);
  return i ? (en ? i.en : i.ar) : key;
};

export const KIND_LABEL: Record<HealthKind, { ar: string; en: string }> = {
  vaccination: { ar: "تطعيم", en: "Vaccination" },
  test: { ar: "فحص", en: "Test" },
  treatment: { ar: "علاج", en: "Treatment" },
};

export const TAG_STATUS_LABEL: Record<TagStatus, { ar: string; en: string }> = {
  present: { ar: "في القطيع", en: "In the herd" },
  sold: { ar: "بيع", en: "Sold" },
  dead: { ar: "نفق", en: "Died" },
  exported: { ar: "صُدِّر", en: "Exported" },
};

export type TagStatus = "present" | "sold" | "dead" | "exported";

/** The form sends "kind:key" from one list; anything else is refused before the database sees it. */
export function parseHealthChoice(value: string): { kind: HealthKind; key: string } | null {
  const [kind, key] = value.split(":");
  const item = BY_KEY.get(key ?? "");
  return item && item.kind === kind ? { kind: item.kind, key: item.key } : null;
}

export interface HealthRecord {
  id: string;
  kind: HealthKind;
  item_key: string;
  done_on: string;
  heads: number;
  result: "negative" | "positive" | null;
  product: string | null;
  batch: string | null;
  vet_name: string | null;
  note: string | null;
  withdrawn_at: string | null;
  withdrawn_note: string | null;
  created_at: string;
}

export interface HerdTag {
  tag: string;
  status: TagStatus;
  added_on: string;
}

/** The latest standing record for each item — withdrawn entries never count. */
export function latestByItem(records: HealthRecord[]): Map<string, HealthRecord> {
  const out = new Map<string, HealthRecord>();
  for (const r of records) {
    if (r.withdrawn_at) continue;
    const prev = out.get(r.item_key);
    if (!prev || r.done_on > prev.done_on || (r.done_on === prev.done_on && r.created_at > prev.created_at)) {
      out.set(r.item_key, r);
    }
  }
  return out;
}

export function tagCounts(tags: HerdTag[]): Record<TagStatus, number> {
  const c: Record<TagStatus, number> = { present: 0, sold: 0, dead: 0, exported: 0 };
  for (const t of tags) c[t.status]++;
  return c;
}

/** Whole days from `from` to `to` (ISO days), counting neither end. */
export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86_400_000);
}
